---
title: DriveEase
emoji: ☀️
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
# Rebuild marker: solarispredict-docker
---

# SolarisPredict-SL Backend

> Factory rebuild: Docker python:3.11-slim + FastAPI on port 7860.

FastAPI service that forecasts **net load** (demand − solar) for three Sri Lankan zones, for demos on Hugging Face Spaces (Docker, port **7860**).

Solar generation is predicted with a per-zone **XGBoost** model trained on NASA POWER historical irradiance. Live forecasts are driven by **Open-Meteo**. Demand is an **illustrative rule-based** Sri Lanka load curve (weekday / weekend / Poya / New Year) — not live CEB telemetry.

## Zones

| Zone | Lat | Lon |
|------|-----|-----|
| `hambantota` | 6.15 | 81.15 |
| `jaffna` | 9.66 | 80.02 |
| `colombo` | 6.93 | 79.85 |

## Project layout

```
solaris-backend/
├── app/
│   ├── main.py              # FastAPI app + CORS
│   ├── data_pipeline.py     # NASA POWER hourly fetch
│   ├── train_solar_model.py # XGBoost train / save / metrics
│   ├── demand_model.py      # Rule-based SL load curve + 2026 Poya list
│   ├── forecast.py          # Open-Meteo + models → net load + curtailment flag
│   ├── zones.py             # Coordinates and capacity scales
│   ├── ingestion/           # Public NSO / EDLCare gensum JSON client + backfill
│   ├── models/              # Saved .pkl models + metrics JSON
│   └── data/                # NASA POWER + NSO archives (gitignored)
├── Dockerfile
├── requirements.txt
└── README.md
```

## NSO public data ingestion

The NSO Generation Summary UI (`https://edlcare.edl.lk/gensum/details`) loads structured JSON from `/api/gensum/*`. Those endpoints are **public** — OIDC login is only for `/api/auth/me`. A browser-like `User-Agent` is required (Cloudflare returns 403 without it); cookies / CSRF are not.

| Endpoint | Content |
|----------|---------|
| `load-curve?date=` | 15-min generation by source (MW) |
| `solar-forecast?date=` | 15-min NSO PV estimate (MW) |
| `peak-data?date=` | Day peak / night peak / minimum demand |
| `energy-data?date=` | Daily energy by station group (GWh) |
| `reservoir-data?date=` | Reservoir storage / rainfall |
| `daily-energy-summary` | Rolling ~31-day energy mix only |

Historical per-day series begin on **2026-02-10** (earlier dates are clamped server-side).

```bash
# from solaris-backend/
python -m app.ingestion.fetch_historical --start 2026-02-10 --end yesterday
python -m app.feature_store          # Open-Meteo archive + training_15min.parquet
python -m app.train_nso_models       # national demand / solar / net-load XGBoost
```

Writes:

- `app/data/nso/raw/YYYY-MM-DD.json` — raw day bundles
- `app/data/nso/processed/*.parquet` — tidy tables
- `app/data/feature_store/training_15min.parquet` — unified feature store
- `app/models/nso/*.pkl` — national models

### Digital twin APIs

| Path | Purpose |
|------|---------|
| `GET /ops/briefing` | National Grid Briefing (latest NSO interval) |
| `GET /ops/replay?day=` | Historical day reconstruction |
| `GET /ops/accuracy` | Holdout + persistence monitors |
| `GET /ops/visibility` | Distributed solar visibility index |
| `GET /forecast/national?hours=` | 7-day national forecast (15-min) |
| `GET /forecast/national/scenario` | What-if overlay |

Demand is the sum of published load-curve sources. Load-curve `Solar` is often much lower than `solar-forecast` `pvEstimate` (SCADA subset vs system estimate) — keep both columns.

## Endpoints

### `GET /health`

Liveness check.

```json
{ "status": "ok", "service": "solaris-backend", "zones": ["colombo", "hambantota", "jaffna"] }
```

### `GET /forecast/solar?zone={zone}&hours=48`

Live solar forecast for a zone.

| Query | Type | Default | Notes |
|-------|------|---------|-------|
| `zone` | string | required | `hambantota` \| `jaffna` \| `colombo` |
| `hours` | int | 48 | 1–168 |

Returns hourly `ghi_wm2`, `solar_mw`, cloud cover, and temperature.

### `GET /forecast/netload?zone={zone}&hours=48`

Combines solar forecast + demand model into net load and sets `curtailment_risk` when `net_load_mw` falls below the configured threshold (default 50 MW).

Response includes methodology notes distinguishing **model-driven solar** from **pattern-based demand**.

### `GET /backtest?zone={zone}`

Returns holdout **RMSE** / **MAE** (W/m²) from the last training run for that zone.

```json
{ "zone": "hambantota", "rmse": 42.1, "mae": 28.4, "n_train": ..., "n_test": ..., "unit": "W/m^2" }
```

## Local development

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Optional: pull NASA POWER + train models before serving forecasts
python -m app.data_pipeline
python -m app.train_solar_model

uvicorn app.main:app --reload --host 0.0.0.0 --port 7860
```

API docs: [http://localhost:7860/docs](http://localhost:7860/docs)

## Docker / Hugging Face Spaces

```bash
docker build -t solaris-backend .
docker run -p 7860:7860 solaris-backend
```

The container listens on **7860** (HF Spaces Docker requirement).

## Data sources

- **NASA POWER** — historical hourly irradiance / weather for training  
- **Open-Meteo** — free live weather / radiation forecast (no API key)  
- **Demand** — calendar rules with hardcoded **2026 Poya** dates and April 10–20 New Year window
