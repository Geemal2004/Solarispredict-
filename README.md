# SolarisPredict-SL

> **An AI-powered grid digital twin for Sri Lanka providing weather-driven national net-load forecasts and dispatch intelligence to optimize renewable integration.**

![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![scikit-learn](https://img.shields.io/badge/scikit--learn-%23F7931E.svg?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Pandas](https://img.shields.io/badge/pandas-%23150458.svg?style=for-the-badge&logo=pandas&logoColor=white)


Rooftop solar is already system-scale (~1.9 GW). Operators need to see **demand − solar** hours ahead — not solar or load alone — so they can ramp oil down, hold hydro for the evening TOU peak, and avoid curtailing solar by default.

SolarisPredict-SL combines zone forecasts, a national plant map with time playback, and a merit-order **dispatch advisory**. Estimates come from live weather plus published demand patterns. Labeled **EST mode / NOT SCADA** on purpose.

---

## 🌟 Value Proposition

- **Prevents Renewable Curtailment:** By accurately forecasting net-load, grid operators can proactively stage flexible thermal and hydro generation, minimizing unnecessary solar and wind curtailment.
- **Reduces Operational Risk:** Provides clear, actionable dispatch advisories (e.g., when to hold hydro reserves or spin up fast thermal plants) hours ahead of critical ramps.
- **Enhances Grid Visibility:** Consolidates disparate weather data, estimated rooftop solar capacity, and regional demand into a single, cohesive national dashboard.
- **Cost Efficiency:** Optimizing the generation mix and reducing reliance on expensive peaker plants during non-critical hours lowers overall operational costs.
- **Accelerates Green Transition:** Builds confidence in handling higher penetrations of variable renewable energy (VRE) by providing data-driven operational intelligence.

---

## 📸 Dashboard Gallery

### Operations console

![Operations Dashboard](docs/screenshots/screenshot_1.png)

### Zone analysis

![Zone Analysis](docs/screenshots/screenshot_2.png)

### Historical replay

![Historical Replay](docs/screenshots/screenshot_3.png)

### National transmission map

![National Grid State Map](docs/screenshots/screenshot_4.png)

### Dispatch intelligence

![Recommended Dispatch Schedule](docs/screenshots/screenshot_5.png)

---

## 📊 Model Validation

Models were trained and validated on **17,195 official Sri Lankan NSO operational intervals** (2026-02-10 → 2026-08-09).

| Model | MAE | Improvement vs 24h persistence |
|------|------:|------:|
| Demand | **47 MW** | **~4× better** |
| Solar estimate | **24 MW** | — |
| Net load | **57 MW** | **~4× better** |

Validation uses a chronological holdout to avoid look-ahead bias.

## 💡 Why this exists

In February 2025, Sri Lanka’s grid faced a blackout when solar was meeting over half of national demand. Curtailment later spread beyond “Sunny Sundays.” The operational bottleneck is visibility: without a **net-load** forecast, flexible thermal and hydro cannot be staged early enough, so solar gets cut.

Academic work here typically forecasts solar *or* demand. This project forecasts them **together** and turns the result into a recommended action.

---

## 📦 What you get

| Surface | Purpose |
|---------|---------|
| **Forecast** | Solar, demand, and net load on one timeline (24h–7D), with a solar uncertainty band and net-load risk threshold |
| **Dispatch advisory** | Merit-order guidance: flex oil first, hold coal at minimum stable, conserve hydro for TOU peak (18:30–22:30), keep solar must-run when net load allows |
| **National map** | Plant markers by fuel type, timeline playback tied to zone forecasts, illustrative rooftop layer (~1,935 MW), FPV candidate sites |
| **Methodology** | Sources, model choice, and explicit limits of the estimate |

**Zones:** Hambantota (dry zone / Buruthakanda), Jaffna (northern load), Colombo (highest demand / wet-zone cloud volatility).

---

## 🏗️ System Architecture

```mermaid
flowchart LR
    subgraph Data["Data sources"]
        NSO["NSO / EDLCare public APIs"]
        OM["Open-Meteo forecast"]
        NASA["NASA POWER archive"]
        CEB["CEB Digest & Annual Report"]
    end

    subgraph Backend["FastAPI backend"]
        ING["Ingestion pipeline"]
        FE["Feature engineering"]
        FS["National feature store"]
        DEM["Demand model"]
        SOL["Solar model"]
        NET["Net-load model"]
        SCN["Scenario simulator"]
        DSP["Dispatch intelligence"]
        API["REST API layer"]
    end

    subgraph Frontend["Next.js dashboard"]
        OPS["Operations"]
        FC["Forecast"]
        REP["Historical replay"]
        MAP["National map"]
        DIS["Dispatch"]
        INT["Intelligence"]
    end

    NSO --> ING
    OM --> ING
    NASA --> ING
    CEB --> FE

    ING --> FE --> FS

    FS --> DEM
    FS --> SOL
    FS --> NET

    DEM --> SCN
    SOL --> SCN
    NET --> SCN

    SCN --> DSP
    DSP --> API

    API --> OPS
    API --> FC
    API --> REP
    API --> MAP
    API --> DIS
    API --> INT
```


## 🚀 Quick start

### 1. Backend

```bash
cd solaris-backend
py -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
py -m pip install -r requirements.txt

# Optional — pull NASA POWER history and retrain zone models
py -m app.data_pipeline
py -m app.train_solar_model

py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 7860
```

API docs: [http://localhost:7860/docs](http://localhost:7860/docs)

### 2. Frontend

```bash
cd solaris-frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:7860
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Pitch video (optional)

```bash
cd solaris-demo
npm install
npm run dev          # Remotion Studio → composition SolarisPitch
```

---

## 🧰 Tech Stack (Detailed)

- **Frontend:** Next.js 14, React, TypeScript, TailwindCSS, Recharts, Leaflet / react-simple-maps  
- **Backend:** Python, FastAPI, Uvicorn, XGBoost, scikit-learn, pandas, numpy  
- **Data Integrations:** NASA POWER API, Open-Meteo API (no API key required)  

---

## 🔮 Forecasting Pipeline

```mermaid
flowchart TD
    Weather["Open-Meteo weather forecast"]
    Calendar["Calendar features (weekday / weekend / holidays)"]
    History["NSO 15-minute historical archive"]

    Weather --> Features
    Calendar --> Features
    History --> Features

    Features["Feature engineering
    • lag demand
    • lag solar
    • rolling statistics
    • cloud deviation
    • irradiance
    • temperature"]

    Features --> Demand["Demand XGBoost"]
    Features --> Solar["Solar XGBoost"]

    Demand --> Net["Net-load forecast"]

    Solar --> Net

    Net --> P["P10 / P50 / P90 forecast"]

    P --> Risk["Risk engine"]
    P --> Dispatch["Dispatch intelligence"]
    P --> Scenario["Scenario simulator"]
```

## 📡 Historical Data Pipeline

```mermaid
flowchart LR
    API["NSO public APIs"]

    API --> Raw["Raw JSON archive
    181 days"]

    Raw --> Normalize["Normalization"]

    Normalize --> G["generation_15min.parquet"]

    Normalize --> S["solar_forecast_15min.parquet"]

    Normalize --> P["peaks_daily.parquet"]

    Normalize --> R["reservoir_daily.parquet"]

    G --> Train["training_15min.parquet"]

    S --> Train

    P --> Train

    R --> Train

    Train --> Models["Model training & validation"]
```

## ⚡ Operational Intelligence Loop

```mermaid
flowchart LR
    Forecast["Demand + solar forecast"]

    Forecast --> Ramp["Evening ramp detection"]

    Ramp --> Risk["Operational risk classification"]

    Risk --> Merit["Merit-order optimization"]

    Merit --> Hydro["Hydro reserve strategy"]

    Merit --> Thermal["Thermal commitment guidance"]

    Merit --> Solar["Solar curtailment avoidance"]

    Hydro --> Dashboard["Operator dashboard"]

    Thermal --> Dashboard

    Solar --> Dashboard
```


## 📡 API (backend)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness + supported zones |
| `GET /forecast/solar?zone=&hours=48` | Hourly GHI / solar MW from Open-Meteo + XGBoost |
| `GET /forecast/netload?zone=&hours=48` | Solar + demand → net load and net-load / curtailment signals |
| `GET /backtest?zone=` | Holdout RMSE / MAE from the last training run |

Zones: `hambantota` · `jaffna` · `colombo` · `hours` 1–168.

---

## 🧠 Models & data

| Piece | Approach |
|-------|----------|
| **Solar** | Per-zone XGBoost on NASA POWER history; live drive from Open-Meteo radiation / cloud / temp |
| **Demand** | Illustrative Sri Lanka load curve — weekday / weekend / Poya / New Year multipliers from published patterns |
| **Net load** | `demand − solar`, with a net-load risk band when the midday dip gets dangerous |
| **Dispatch** | Merit-order rules + confidence — not live CEB SCADA |

---

## 📚 Data Sources

- **NSO / EDLCare public generation APIs** — 15-minute operational archive
- **Open-Meteo** — live weather forecasts
- **NASA POWER** — historical solar irradiance
- **CEB Statistical Digest 2025** — national grid statistics
- **CEB Annual Report 2023** — operational context



## 📂 Repository layout

```
AI Challenge/
├── solaris-backend/     # FastAPI + XGBoost + demand engine
├── solaris-frontend/    # Next.js dashboard
├── solaris-demo/        # Remotion 90s pitch
├── docs/screenshots/    # README images
├── DEMO.md              # 5-minute live demo script
└── README.md
```

More detail: [solaris-backend/README.md](solaris-backend/README.md) · [solaris-frontend/README.md](solaris-frontend/README.md) · [solaris-demo/README.md](solaris-demo/README.md)

---




