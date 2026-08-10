"""
Live net-load forecast: Open-Meteo weather → solar XGBoost → demand rules → net load.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import requests

from app.demand_model import generate_demand
from app.train_solar_model import (
    FEATURE_COLS,
    add_cyclical_features,
    load_model,
    load_quantile_models,
)
from app.zones import CURTAILMENT_THRESHOLD_MW, VALID_ZONES, ZONES, risk_threshold_mw

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Performance ratio for irradiance (W/m²) → AC power (MW) conversion.
PERFORMANCE_RATIO = 0.85
STC_IRRADIANCE = 1000.0  # W/m²

# CEB domestic TOU peak window (from 15 Oct 2025 schedule).
TOU_PEAK_START = 18.5  # 18:30
TOU_PEAK_END = 22.5  # 22:30


def classify_weather_regime(cloud_pct: float | None) -> str:
    """Map cloud cover to Amarasinghe 2018-style regimes."""
    if cloud_pct is None or (isinstance(cloud_pct, float) and np.isnan(cloud_pct)):
        return "unknown"
    if cloud_pct < 30:
        return "clear"
    if cloud_pct < 70:
        return "partly_cloudy"
    return "overcast"


def is_tou_peak_hour(hour_float: float) -> bool:
    h = hour_float % 24.0
    return TOU_PEAK_START <= h < TOU_PEAK_END


def fetch_open_meteo(lat: float, lon: float, hours: int = 48) -> pd.DataFrame:
    """
    Fetch hourly Open-Meteo forecast for solar model inputs.

    Maps:
      shortwave_radiation              → observed GHI proxy (not used as target)
      shortwave_radiation_clear_sky    → clearsky_ghi
      cloud_cover                      → cloud_amt
      temperature_2m                   → temp
      relative_humidity_2m             → humidity
    """
    # Open-Meteo returns up to forecast_days * 24 hours; request enough days.
    forecast_days = max(1, min(16, int(np.ceil(hours / 24)) + 1))
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(
            [
                "shortwave_radiation",
                "shortwave_radiation_clear_sky",
                "cloud_cover",
                "temperature_2m",
                "relative_humidity_2m",
            ]
        ),
        "timezone": "Asia/Colombo",
        "forecast_days": forecast_days,
    }
    resp = requests.get(OPEN_METEO_URL, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    hourly = data["hourly"]

    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(hourly["time"]).tz_localize("Asia/Colombo"),
            "shortwave_radiation": hourly["shortwave_radiation"],
            "clearsky_ghi": hourly["shortwave_radiation_clear_sky"],
            "cloud_amt": hourly["cloud_cover"],
            "temp": hourly["temperature_2m"],
            "humidity": hourly["relative_humidity_2m"],
        }
    ).set_index("timestamp")

    for col in ("shortwave_radiation", "clearsky_ghi", "cloud_amt", "temp", "humidity"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["clearsky_ghi"] = df["clearsky_ghi"].fillna(0).clip(lower=0)
    # Fallback if clear-sky fields are missing: inflate GHI by cloud fraction
    missing_cs = df["clearsky_ghi"] <= 0
    cloud_frac = (df["cloud_amt"].fillna(0) / 100.0).clip(0, 0.95)
    df.loc[missing_cs, "clearsky_ghi"] = (
        df.loc[missing_cs, "shortwave_radiation"].fillna(0)
        / (1.0 - cloud_frac.loc[missing_cs]).clip(lower=0.2)
    ).clip(lower=0)

    df = df.head(hours)
    return df


def ghi_to_mw(ghi_wm2: np.ndarray | pd.Series, capacity_mw: float) -> np.ndarray:
    """Convert global horizontal irradiance to approximate plant AC output (MW)."""
    arr = np.asarray(ghi_wm2, dtype=float)
    return np.clip(arr, 0, None) / STC_IRRADIANCE * capacity_mw * PERFORMANCE_RATIO


def build_feature_matrix(weather: pd.DataFrame) -> pd.DataFrame:
    feats = add_cyclical_features(weather)
    for col in FEATURE_COLS:
        if col not in feats.columns:
            raise ValueError(f"Feature '{col}' missing after Open-Meteo mapping")
    return feats[FEATURE_COLS].fillna(0)


def forecast_solar(zone: str, hours: int = 48) -> dict[str, Any]:
    """Predict solar generation (MW) and irradiance for a zone over the next N hours."""
    if zone not in VALID_ZONES:
        raise ValueError(f"Invalid zone '{zone}'. Choose from {sorted(VALID_ZONES)}")

    info = ZONES[zone]
    weather = fetch_open_meteo(info["lat"], info["lon"], hours=hours)
    bundle = load_model(zone)
    model = bundle["model"]
    X = build_feature_matrix(weather)
    ghi_pred = np.clip(model.predict(X), 0, None)
    solar_mw = ghi_to_mw(ghi_pred, info["solar_capacity_mw"])

    points = []
    for ts, ghi, mw, cloud, temp in zip(
        weather.index,
        ghi_pred,
        solar_mw,
        weather["cloud_amt"].to_numpy(),
        weather["temp"].to_numpy(),
    ):
        points.append(
            {
                "timestamp": ts.isoformat(),
                "ghi_wm2": round(float(ghi), 2),
                "solar_mw": round(float(mw), 3),
                "cloudcover_pct": None if pd.isna(cloud) else round(float(cloud), 1),
                "temp_c": None if pd.isna(temp) else round(float(temp), 1),
            }
        )

    return {
        "zone": zone,
        "hours": hours,
        "capacity_mw": info["solar_capacity_mw"],
        "source": "open-meteo + xgboost",
        "points": points,
    }


def forecast_solar_quantiles(zone: str, hours: int = 48) -> dict[str, Any]:
    """Return p10 / p50 / p90 solar MW bands from quantile XGBoost models."""
    if zone not in VALID_ZONES:
        raise ValueError(f"Invalid zone '{zone}'. Choose from {sorted(VALID_ZONES)}")

    info = ZONES[zone]
    weather = fetch_open_meteo(info["lat"], info["lon"], hours=hours)
    X = build_feature_matrix(weather)
    q_models = load_quantile_models(zone)

    p10 = np.clip(q_models[10].predict(X), 0, None)
    p50 = np.clip(q_models[50].predict(X), 0, None)
    p90 = np.clip(q_models[90].predict(X), 0, None)
    # Enforce p10 <= p50 <= p90
    p50 = np.maximum(p50, p10)
    p90 = np.maximum(p90, p50)

    cap = info["solar_capacity_mw"]
    points = []
    for ts, a, b, c in zip(weather.index, p10, p50, p90):
        points.append(
            {
                "timestamp": ts.isoformat(),
                "p10_mw": round(float(ghi_to_mw([a], cap)[0]), 3),
                "p50_mw": round(float(ghi_to_mw([b], cap)[0]), 3),
                "p90_mw": round(float(ghi_to_mw([c], cap)[0]), 3),
                "p10_ghi": round(float(a), 2),
                "p50_ghi": round(float(b), 2),
                "p90_ghi": round(float(c), 2),
            }
        )

    return {
        "zone": zone,
        "hours": hours,
        "quantiles": [10, 50, 90],
        "points": points,
        "methodology": "XGBoost quantile regression (alpha 0.1 / 0.5 / 0.9) on NASA POWER features",
    }


def forecast_netload(
    zone: str,
    hours: int = 48,
    curtailment_threshold_mw: float | None = None,
) -> dict[str, Any]:
    """
    Combine solar forecast + rule-based demand into net load.

    net_load_mw = demand_mw - solar_mw
    hosting_risk when net_load < zone-specific threshold (15% of peak demand)
    """
    if zone not in VALID_ZONES:
        raise ValueError(f"Invalid zone '{zone}'. Choose from {sorted(VALID_ZONES)}")

    threshold = (
        float(curtailment_threshold_mw)
        if curtailment_threshold_mw is not None
        else risk_threshold_mw(zone)
    )

    info = ZONES[zone]
    weather = fetch_open_meteo(info["lat"], info["lon"], hours=hours)
    bundle = load_model(zone)
    model = bundle["model"]
    X = build_feature_matrix(weather)
    ghi_pred = np.clip(model.predict(X), 0, None)
    solar_mw_arr = ghi_to_mw(ghi_pred, info["solar_capacity_mw"])

    timestamps = list(weather.index)
    demand_df = generate_demand(timestamps, zone=zone)

    persistence_err = []
    for i, ghi in enumerate(ghi_pred):
        if ghi < 20:
            continue
        prev = float(ghi_pred[i - 1]) if i > 0 else float(ghi)
        persistence_err.append(abs(float(ghi) - prev))
    sp_mae = float(np.mean(persistence_err)) if persistence_err else None

    points = []
    any_risk = False
    midday_net = []
    evening_net = []
    regimes: list[str] = []

    for i, (ts, drow) in enumerate(demand_df.iterrows()):
        demand_mw = float(drow["demand_mw"])
        solar_mw = float(solar_mw_arr[i])
        net = demand_mw - solar_mw
        risk = net < threshold
        any_risk = any_risk or risk
        cloud = weather["cloud_amt"].iloc[i]
        cloud_f = None if pd.isna(cloud) else float(cloud)
        regime = classify_weather_regime(cloud_f)
        regimes.append(regime)
        local = ts.tz_convert("Asia/Colombo") if ts.tzinfo else ts
        hour_f = local.hour + local.minute / 60.0
        tou = is_tou_peak_hour(hour_f)
        if 10 <= hour_f < 15:
            midday_net.append(net)
        if tou:
            evening_net.append(net)

        points.append(
            {
                "timestamp": ts.isoformat(),
                "solar_mw": round(solar_mw, 3),
                "demand_mw": round(demand_mw, 3),
                "net_load_mw": round(net, 3),
                "curtailment_risk": bool(risk),
                "hosting_risk": bool(risk),
                "tou_peak": tou,
                "weather_regime": regime,
                "ghi_wm2": round(float(ghi_pred[i]), 2),
                "cloudcover_pct": None if cloud_f is None else round(cloud_f, 1),
                "is_weekend": bool(drow["is_weekend"]),
                "is_poya": bool(drow["is_poya"]),
                "is_new_year": bool(drow["is_new_year"]),
                "is_vesak": bool(drow.get("is_vesak", False)),
                "day_multiplier": float(drow["day_multiplier"]),
            }
        )

    # Dominant daytime regime
    day_regimes = [
        r
        for r, p in zip(regimes, points)
        if (p["ghi_wm2"] or 0) > 50 and r != "unknown"
    ]
    dominant = max(set(day_regimes), key=day_regimes.count) if day_regimes else "unknown"

    evening_ramp = None
    if midday_net and evening_net:
        evening_ramp = round(float(np.mean(evening_net) - np.min(midday_net)), 2)

    return {
        "zone": zone,
        "hours": hours,
        "curtailment_threshold_mw": threshold,
        "risk_threshold_mw": threshold,
        "risk_rule": "net_load < 15% of zone demand_peak_mw",
        "any_curtailment_risk": any_risk,
        "any_hosting_risk": any_risk,
        "weather_regime": dominant,
        "evening_ramp_mw": evening_ramp,
        "tou_peak_window": "18:30–22:30",
        "smart_persistence_proxy_mae_wm2": None if sp_mae is None else round(sp_mae, 2),
        "methodology": {
            "solar": "XGBoost on NASA POWER features, driven by live Open-Meteo forecast",
            "demand": (
                "Illustrative calendar-pattern load curve "
                "(weekday/weekend/Poya/New Year/Vesak) — not live CEB telemetry"
            ),
            "net_load": "demand_mw - solar_mw",
            "risk": "Net-load risk — not a published CEB curtailment GWh figure",
        },
        "points": points,
    }
