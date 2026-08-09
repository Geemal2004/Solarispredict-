# SolarisPredict-SL — 1-Day Build Plan for Cursor

**Net Load Forecasting for Solar Grid Integration in Sri Lanka**

---

## 0. The pitch (use this for your competition intro slide)

Sri Lanka's grid hit a real crisis in February 2025: a blackout triggered when solar PV was meeting over 50% of national demand at once, causing a voltage/inertia disturbance. Since then, CEB (now split into six companies as of March 2026, with the National System Operator running the grid) has been curtailing solar output — expanding from weekend-only "Sunny Sunday" cuts to public holidays to weekdays — because operators can't see net load (demand minus solar) coming far enough in advance to manage it. Solar developers say this is costing them ~Rs 2 billion and threatening loan repayments.

**SolarisPredict-SL forecasts net load, not just solar or demand separately** — giving grid operators the lead time to manage the dip instead of blanket-curtailing solar. This is the actual gap: existing Sri Lankan academic work (Amarasinghe & Abeygunawardane 2018, Abeysingha et al. 2021) forecasts solar generation and electricity demand as two separate problems. Nobody publishes a combined net-load forecast for the SL grid.

**Important — say this explicitly to judges:** the demand model is built from published patterns (weekday/weekend, Poya-day, and New Year effects documented in the Jaffna LSTM paper) rather than live CEB telemetry, which isn't publicly accessible in a one-day build. Be upfront about this. It's still a legitimate, well-grounded methodology — judges will trust a system that's honest about its data provenance far more than one that implies live grid access it doesn't have.

---

## 1. Architecture

```
┌─────────────────────────┐        HTTPS         ┌──────────────────────────┐
│   Next.js 14 (TS)        │ ────────────────────▶ │  FastAPI backend          │
│   Vercel (free)          │ ◀──────────────────── │  Hugging Face Spaces      │
│   - Dashboard UI          │        JSON            │  (Docker SDK, free)       │
│   - Zone selector          │                       │  - /forecast/solar        │
│   - Recharts               │                       │  - /forecast/netload      │
└─────────────────────────┘                        │  - XGBoost models (.pkl)  │
                                                      │  - demand rule engine    │
                                                      └──────────┬───────────────┘
                                                                 │
                                                     ┌───────────▼────────────┐
                                                     │ NASA POWER API (hist.)  │
                                                     │ Open-Meteo API (fcst.)  │
                                                     └─────────────────────────┘
```

Two separate deployable repos: `solaris-frontend` (Next.js → Vercel) and `solaris-backend` (FastAPI → Hugging Face Spaces, Docker SDK). This split is deliberate — Vercel doesn't run long Python/ML workloads well, HF Spaces does it for free with no cold-start billing surprises.

---

## 2. Data sources (both free, no API key)

**NASA POWER** — satellite-derived historical solar irradiance, used by the reservoir-FPV paper in your uploads. Good for training.
```
https://power.larc.nasa.gov/api/temporal/hourly/point?
  parameters=ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,T2M,RH2M,WS2M,CLOUD_AMT
  &community=RE&longitude={LON}&latitude={LAT}
  &start=20230101&end=20241231&format=JSON
```

**Open-Meteo** — free forecast API with `shortwave_radiation` and `cloudcover`, up to 16 days ahead. Use this to drive the "live forecast" feel of the demo.
```
https://api.open-meteo.com/v1/forecast?
  latitude={LAT}&longitude={LON}
  &hourly=shortwave_radiation,cloudcover,temperature_2m
  &timezone=Asia%2FColombo&forecast_days=7
```

**Zones to model** (pick 3, grounded in your uploaded papers rather than invented ones):
| Zone | Coordinates | Why |
|---|---|---|
| Hambantota (dry zone) | 6.15°N, 81.15°E | Matches Buruthakanda solar park in your uploaded IEEE paper |
| Jaffna/Killinochchi (north) | 9.66°N, 80.02°E | Matches the University of Jaffna demand-forecasting paper |
| Colombo (wet zone/west) | 6.93°N, 79.85°E | Highest load center, most volatile cloud cover |

**Demand pattern inputs** (from the Jaffna paper — cite it): hour-of-day, day-of-week, is_weekend, is_poya_day, is_new_year_period (mid-April surge), is_wesak (May). Sri Lanka's Poya (full moon) dates are public and repeat monthly — hardcode the 2026 calendar list into the backend.

---

## 3. Models (scoped to be trainable in hours, not days)

- **Solar forecast per zone:** Gradient boosted trees (XGBoost or `sklearn.ensemble.GradientBoostingRegressor`) trained on NASA POWER historical data, features = hour, day-of-year (cyclical sin/cos), cloud_amt, clearsky_ghi, temp, humidity. This mirrors the Random Forest approach that won in your uploaded Amarasinghe & Abeygunawardane paper (RF beat DBN and SVM there) — cite that as your justification for model choice.
- **Demand:** rule-based baseline (typical SL load curve shape: low overnight, morning ramp, midday dip, evening peak 18:30–22:30) modulated by day-type multipliers from the Jaffna paper's findings, plus small regression on top for smoothing. Label this clearly in the UI as "illustrative, calendar-pattern-based" — do not present it as live CEB data.
- **Net load = demand − aggregate solar.** This is the actual product. Plot it against a "curtailment risk" threshold band to visually recreate the Sunny Sunday problem.

---

## 4. Hour-by-hour schedule (aggressive, ~11 hours)

| Time | Task |
|---|---|
| 0:00–0:45 | Scaffold both repos, install deps (prompts below) |
| 0:45–2:30 | Data pipeline script: pull NASA POWER for 3 zones, save as CSV/parquet |
| 2:30–4:30 | Train solar XGBoost model per zone, save `.pkl`, quick backtest (RMSE/MAE) |
| 4:30–5:30 | Build demand rule engine + Poya calendar |
| 5:30–6:30 | FastAPI endpoints (`/forecast/solar`, `/forecast/netload`, `/backtest`), wire Open-Meteo live fetch |
| 6:30–8:30 | Frontend dashboard: zone selector, net-load chart, curtailment-risk banner, methodology panel |
| 8:30–9:15 | Deploy backend to HF Spaces, frontend to Vercel, connect via env var |
| 9:15–10:15 | Design pass (see §6), copy/labels, mobile check |
| 10:15–11:00 | Buffer, bug fixes, rehearse the pitch |

---

## 5. Cursor prompts — copy these in order

**Prompt 1 — backend scaffold**
```
Create a Python FastAPI project called solaris-backend with this structure:
- app/main.py (FastAPI app, CORS enabled for all origins during dev)
- app/models/ (folder for saved .pkl models)
- app/data_pipeline.py (fetches NASA POWER hourly data for a given lat/lon/date range and returns a pandas DataFrame)
- app/train_solar_model.py (trains an XGBoost regressor per zone using cyclical hour/day-of-year features, clear-sky GHI, cloud amount, temp, humidity as inputs and ALLSKY_SFC_SW_DWN as target; saves model + prints RMSE/MAE on a held-out 20% split)
- app/demand_model.py (rule-based Sri Lanka load curve generator: base diurnal shape with morning ramp and evening peak 18:30-22:30, multipliers for weekend, Poya day, and April 10-20 New Year period; Poya dates for 2026 hardcoded as a list)
- app/forecast.py (combines live Open-Meteo forecast + trained solar model + demand model into net load; also computes a "curtailment risk" flag when net load drops below a threshold)
- requirements.txt (fastapi, uvicorn, xgboost, scikit-learn, pandas, numpy, requests, python-multipart)
- Dockerfile (python:3.11-slim base, installs requirements, runs uvicorn on port 7860 — required port for Hugging Face Spaces)
- README.md documenting the endpoints

Endpoints needed on app/main.py:
- GET /health
- GET /forecast/solar?zone={hambantota|jaffna|colombo}&hours=48
- GET /forecast/netload?zone={zone}&hours=48
- GET /backtest?zone={zone}  -> returns RMSE/MAE from training

Use zone coordinates: hambantota (6.15,81.15), jaffna (9.66,80.02), colombo (6.93,79.85).
```

**Prompt 2 — train and sanity-check**
```
Run app/data_pipeline.py to pull 2 years of NASA POWER hourly data for all three zones and cache as parquet files in app/data/. Then run app/train_solar_model.py to train and save one model per zone. Print backtest RMSE/MAE for each zone to the console so I can sanity-check before moving on.
```

**Prompt 3 — frontend scaffold**
```
Create a Next.js 14 project called solaris-frontend using TypeScript, App Router, and Tailwind CSS. Install recharts for charting. Structure:
- app/page.tsx (main dashboard)
- app/components/ZoneSelector.tsx
- app/components/NetLoadChart.tsx (area chart: solar generation, demand, net load, all vs. time; shaded "curtailment risk" band)
- app/components/CurtailmentBanner.tsx (shows a warning when forecasted net load enters the risk zone, referencing the real Feb 2025 Sunny Sunday incident as context)
- app/components/MethodologyPanel.tsx (collapsible panel citing data sources: NASA POWER, Open-Meteo, and the academic basis: Amarasinghe & Abeygunawardane 2018 for the solar model choice, Abeysingha et al. 2021 for demand pattern features)
- lib/api.ts (typed fetch client calling NEXT_PUBLIC_API_URL, which will point at the Hugging Face Space)
- .env.local.example with NEXT_PUBLIC_API_URL=http://localhost:7860

Do not use a generic AI-template look (cream background + terracotta accent, or dark background + neon green). Design direction: a palette drawn from Sri Lankan sun and monsoon — warm gold/amber for solar generation, deep indigo-blue for demand/grid, muted terracotta-red only for the curtailment-risk band. Pair a confident, slightly technical display typeface for headings with a clean readable body face. The signature visual element is the live net-load area chart itself as the hero of the page, not a stat-card grid.
```

**Prompt 4 — wire it together and polish**
```
Wire ZoneSelector state to fetch /forecast/netload from the backend and pass data into NetLoadChart. Add loading and error states. Add a small badge next to the chart showing which parts of the forecast are model-driven (solar) vs. pattern-based (demand), so the methodology is transparent to a viewer. Make the layout responsive down to mobile width. Add visible keyboard focus states on the zone selector buttons.
```

---

## 6. Design direction (so it doesn't look like a generic hackathon dashboard)

- **Palette:** warm gold/amber (~#E8A33D) for solar, deep indigo (~#1B2A4A) for demand/grid, a muted clay-red (~#B5533C) reserved only for the curtailment-risk band — not decoration, it's a signal.
- **Signature element:** the net-load area chart *is* the hero — lead with it, not a headline + stat cards.
- **Type:** one confident display face for the zone name / big numbers, one quiet body face for everything else. Avoid the generic cream-background-serif or dark-mode-neon-accent looks — ground choices in "sun and monsoon," not a generic AI dashboard template.
- **Copy tone:** plain and specific ("Net load falls below safe threshold at 12:30 PM" not "Critical anomaly detected").

---

## 7. Deployment

**Backend → Hugging Face Spaces:**
1. Create a new Space, SDK = Docker, hardware = free CPU basic.
2. Push `solaris-backend` repo to the Space's git remote (`git remote add space https://huggingface.co/spaces/{user}/solaris-backend && git push space main`).
3. Space auto-builds from your Dockerfile and serves on port 7860. Your API base URL will be `https://{user}-solaris-backend.hf.space`.

**Frontend → Vercel:**
1. `vercel` CLI or import the GitHub repo in the Vercel dashboard.
2. Set env var `NEXT_PUBLIC_API_URL` = your HF Space URL.
3. Deploy — Vercel builds Next.js automatically, no config needed for a standard App Router project.

---

## 8. If you're running short on time — cut list

Keep, in priority order: (1) one zone, solar + demand + net-load chart, (2) the curtailment-risk banner tied to the real Feb 2025 incident, (3) the methodology panel citing real sources. Cut first: multi-zone comparison, the backtest accuracy panel, any map visualization. A single working, honest, well-designed zone beats three broken ones.

---

## 9. Sources to cite in your submission

- CEB unbundling: EconomyNext, "Six new companies take over operations of Sri Lanka's power utility," 9 March 2026.
- Sunny Sunday curtailment crisis: EconomyNext, "Sri Lanka solar firms say expanding 'Sunny Sunday' curtailment has hit debt service," Jan 2026; Climate Fact Checks, Feb 2026.
- Solar forecasting model choice: Amarasinghe, P.A.G.M. & Abeygunawardane, S.K., "Application of Machine Learning Algorithms for Solar Power Forecasting in Sri Lanka," EECon 2018 (your upload).
- Demand pattern features: Abeysingha et al., "Electricity Load/demand Forecasting in Sri Lanka using Deep Learning Techniques," ICIAFS 2021 (your upload).
- Reservoir/zone context: Premathilaka, Yapa & Punchi-Manage, "Uncovering the Solar Energy Potential of Reservoirs in Sri Lanka," iPURSE 2025 (your upload).