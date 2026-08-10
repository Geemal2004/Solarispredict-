"""FastAPI entrypoint for SolarisPredict-SL — Sri Lanka Grid Digital Twin."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.demand_model import calendar_horizon
from app.dispatch_advisor import build_dispatch_advisory
from app.forecast import forecast_netload, forecast_solar, forecast_solar_quantiles
from app.national_stats import live_national_estimate, load_ceb_baseline
from app.nso_forecast import apply_scenario, forecast_national
from app.nso_ops import (
    archive_meta,
    forecast_accuracy,
    list_replay_dates,
    national_briefing,
    replay_day,
    solar_visibility_index,
)
from app.rooftop_generator import generate_rooftop_sample
from app.train_nso_models import load_nso_metrics
from app.train_solar_model import load_metrics
from app.zones import VALID_ZONES, ZONES

ZoneName = Literal["hambantota", "jaffna", "colombo"]
FPV_PATH = Path(__file__).resolve().parent / "data" / "fpv_reservoirs.json"

app = FastAPI(
    title="SolarisPredict-SL",
    description=(
        "Sri Lanka Grid Digital Twin. "
        "Anchored on official NSO / EDLCare gensum operational data (15-min), "
        "with weather-driven national demand / solar / net-load forecasts."
    ),
    version="0.4.0",
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
    meta = {}
    try:
        meta = archive_meta()
    except FileNotFoundError:
        pass
    return {
        "status": "ok",
        "service": "solaris-backend",
        "product": "SolarisPredict-SL — Sri Lanka Grid Digital Twin",
        "zones": sorted(ZONES.keys()),
        "version": "0.4.0",
        "nso_archive": meta or None,
    }


@app.get("/ops/briefing")
def get_national_briefing():
    """National Grid Briefing from latest archived NSO interval."""
    try:
        return national_briefing()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/ops/replay")
def get_replay(day: str = Query(..., description="YYYY-MM-DD")):
    """Historical day reconstruction from NSO archive."""
    try:
        d = date.fromisoformat(day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="day must be YYYY-MM-DD") from exc
    try:
        return replay_day(d)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/ops/replay/dates")
def get_replay_dates():
    try:
        return {"dates": list_replay_dates()}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/ops/accuracy")
def get_forecast_accuracy(window_days: int = Query(7, ge=1, le=60)):
    try:
        return forecast_accuracy(window_days=window_days)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/ops/visibility")
def get_solar_visibility():
    try:
        return solar_visibility_index()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/ops/models")
def get_nso_model_metrics():
    try:
        return {
            "demand": load_nso_metrics("demand_xgb"),
            "solar": load_nso_metrics("solar_xgb"),
            "netload": load_nso_metrics("netload_xgb"),
            "archive": archive_meta(),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/forecast/national")
def get_national_forecast(hours: int = Query(168, ge=1, le=168)):
    """7-day national demand / solar / net-load forecast (15-min)."""
    try:
        return forecast_national(hours=hours)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"National forecast failed: {exc}") from exc


@app.get("/forecast/national/scenario")
def get_national_scenario(
    hours: int = Query(48, ge=1, le=168),
    cloud_delta_pct: float = Query(0.0, ge=-50, le=50),
    rooftop_solar_mw: float = Query(0.0, ge=0, le=2000),
    thermal_outage_mw: float = Query(0.0, ge=0, le=900),
    wind_collapse: bool = Query(False),
    hydro_conserve: bool = Query(False),
):
    try:
        base = forecast_national(hours=hours)
        return apply_scenario(
            base,
            cloud_delta_pct=cloud_delta_pct,
            rooftop_solar_mw=rooftop_solar_mw,
            thermal_outage_mw=thermal_outage_mw,
            wind_collapse=wind_collapse,
            hydro_conserve=hydro_conserve,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Scenario failed: {exc}") from exc


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
    nso = None
    try:
        nso = {
            "demand": load_nso_metrics("demand_xgb")["holdout"],
            "solar": load_nso_metrics("solar_xgb")["holdout"],
            "netload": load_nso_metrics("netload_xgb")["holdout"],
            "archive": archive_meta(),
        }
    except FileNotFoundError:
        nso = None
    return {
        "zone": zone,
        "literature": literature,
        "this_build": metrics,
        "nso_national_models": nso,
        "model_family": "XGBoost on NSO operational archive + Open-Meteo",
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
    """NSO snapshot preferred; keep Digest-shaped fields for the zone forecast UI."""
    try:
        briefing = national_briefing()
        k = briefing["kpis"]
        mix = briefing["mix_mw"]
        total = max(sum(mix.values()), 1.0)
        shares = {
            "coal": mix.get("coal", 0) / total,
            "oil": mix.get("oil", 0) / total,
            "hydro": (mix.get("major_hydro", 0) + mix.get("mini_hydro", 0)) / total,
            "wind": mix.get("wind", 0) / total,
            "solar": (mix.get("solar_scada", 0) + k["solar_estimate_mw"] * 0.0) / total,
        }
        # Attribute system solar estimate into solar share for display
        shares["solar"] = k["solar_estimate_mw"] / max(k["demand_now_mw"], 1.0)
        return {
            "mode": "nso_archive",
            "as_of": briefing["as_of"],
            "estimated": False,
            "solar_mw_now": k["solar_estimate_mw"],
            "demand_mw_now": k["demand_now_mw"],
            "net_load_mw_now": k["net_load_mw"],
            "renewable_share_pct": k["renewable_share_pct"],
            "mix_mw": mix,
            "briefing": briefing,
            "zone_estimated": {
                "solar_mw_now": k["solar_estimate_mw"],
                "demand_mw_now": k["demand_now_mw"],
                "net_load_mw_now": k["net_load_mw"],
                "note": "NSO archive actuals (load-curve + solar estimate)",
            },
            "zone_breakdown": [],
            "generation_mix_reference": {
                "capacity_mw": mix,
                "shares": shares,
                "note": "Live mix from latest NSO generation interval",
            },
            "generation_mix_live_solar_share": shares["solar"],
            "sector_demand_mw": {},
            "sector_shares": {},
            "sector_source": "nso",
            "avoidable_curtailment": {
                "mwh_next_hour": 0.0,
                "rs_million_illustrative": 0.0,
                "note": "See national forecast hosting-risk intervals",
            },
            "labels": {"footer": briefing["archive"]["statement"]},
            "national_digest_reference": {
                "night_max_demand_mw": briefing.get("peaks", {})
                .get("night_peak", {})
                .get("demand_mw", 0),
                "day_max_demand_mw": briefing.get("peaks", {})
                .get("day_peak", {})
                .get("demand_mw", 0),
                "installed_capacity_mw": 0,
                "rooftop_solar_mw": 0,
                "renewable_share_pct": k["renewable_share_pct"],
            },
        }
    except FileNotFoundError:
        pass
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
