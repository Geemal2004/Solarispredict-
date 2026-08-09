"""FastAPI entrypoint for SolarisPredict-SL."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.demand_model import calendar_horizon
from app.dispatch_advisor import build_dispatch_advisory
from app.forecast import forecast_netload, forecast_solar, forecast_solar_quantiles
from app.national_stats import live_national_estimate, load_ceb_baseline
from app.rooftop_generator import generate_rooftop_sample
from app.train_solar_model import load_metrics
from app.zones import VALID_ZONES, ZONES

ZoneName = Literal["hambantota", "jaffna", "colombo"]
FPV_PATH = Path(__file__).resolve().parent / "data" / "fpv_reservoirs.json"

app = FastAPI(
    title="SolarisPredict-SL",
    description=(
        "System Control co-pilot for Sri Lanka net-load foresight. "
        "Solar: XGBoost on NASA POWER + live Open-Meteo. "
        "Demand: illustrative calendar-pattern rules (not live CEB data)."
    ),
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_zone(zone: str) -> None:
    if zone not in VALID_ZONES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid zone '{zone}'. Choose from: {sorted(VALID_ZONES)}",
        )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "solaris-backend",
        "zones": sorted(ZONES.keys()),
        "version": "0.3.0",
    }


@app.get("/forecast/solar")
def get_solar_forecast(
    zone: ZoneName = Query(...),
    hours: int = Query(48, ge=1, le=168),
):
    _validate_zone(zone)
    try:
        return forecast_solar(zone, hours=hours)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Solar forecast failed: {exc}") from exc


@app.get("/forecast/solar/quantiles")
def get_solar_quantiles(
    zone: ZoneName = Query(...),
    hours: int = Query(48, ge=1, le=168),
):
    _validate_zone(zone)
    try:
        return forecast_solar_quantiles(zone, hours=hours)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Quantile forecast failed: {exc}") from exc


@app.get("/forecast/netload")
def get_netload_forecast(
    zone: ZoneName = Query(...),
    hours: int = Query(48, ge=1, le=168),
):
    _validate_zone(zone)
    try:
        return forecast_netload(zone, hours=hours)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Net-load forecast failed: {exc}") from exc


@app.get("/backtest")
def get_backtest(zone: ZoneName = Query(...)):
    _validate_zone(zone)
    try:
        return load_metrics(zone)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/evidence/solar")
def get_solar_evidence(zone: ZoneName = Query(...)):
    """Literature (2018) + this build's holdout metrics for judge-facing cards."""
    _validate_zone(zone)
    literature = {
        "paper": "Amarasinghe & Abeygunawardane, EECon 2018 (Buruthakanda)",
        "normalized_rmse": {
            "smart_persistence": 0.136,
            "dbn": 0.039,
            "svm": 0.034,
            "random_forest": 0.033,
        },
        "note": (
            "Normalized RMSE on Buruthakanda plant data — literature benchmark, "
            "not this build's NASA POWER holdout."
        ),
        "hardest_regime": "partly_cloudy",
    }
    try:
        metrics = load_metrics(zone)
    except FileNotFoundError:
        metrics = None
    return {
        "zone": zone,
        "literature": literature,
        "this_build": metrics,
        "model_family": "XGBoost (tree ensemble, same family as RF winner in 2018 paper)",
    }


@app.get("/calendar")
def get_calendar(hours: int = Query(48, ge=1, le=168)):
    return calendar_horizon(hours=hours)


@app.get("/rooftop/sample")
def get_rooftop_sample(
    n: int = Query(400, ge=50, le=2000),
    seed: int = Query(42),
):
    try:
        return generate_rooftop_sample(n_points=n, seed=seed)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Rooftop sample failed: {exc}") from exc


@app.get("/stats/ceb-baseline")
def get_ceb_baseline():
    return load_ceb_baseline()


@app.get("/stats/national")
def get_national_stats():
    try:
        return live_national_estimate()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"National stats failed: {exc}") from exc


@app.get("/map/fpv-reservoirs")
def get_fpv_reservoirs():
    return {
        "season": "Feb–Apr peak resource (iPURSE 2025)",
        "disclaimer": "FPV candidates — potential, not built capacity",
        "reservoirs": json.loads(FPV_PATH.read_text(encoding="utf-8")),
        "citation": "Premathilaka, Yapa & Punchi-Manage, iPURSE 2025",
    }


@app.get("/advisory/dispatch")
def get_dispatch_advisory(
    zone: ZoneName = Query(...),
    hours: int = Query(48, ge=1, le=168),
):
    _validate_zone(zone)
    try:
        return build_dispatch_advisory(zone, hours=hours)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Advisory failed: {exc}") from exc
