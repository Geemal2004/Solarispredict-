"""National 7-day forecast from NSO-trained models + live Open-Meteo."""

from __future__ import annotations

import math
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd
import requests

from app.demand_model import (
    is_new_year_period,
    is_poya_day,
    is_vesak_period,
    is_weekend,
)
from app.feature_store import SL_LAT, SL_LON
from app.forecast import OPEN_METEO_URL, classify_weather_regime, is_tou_peak_hour
from app.netload_uncertainty import netload_uncertainty, uncertainty_meta
from app.nso_ops import _load_training
from app.train_nso_models import load_nso_model
from app.zones import risk_threshold_mw

# National hosting-risk heuristic: 15% of a typical night peak (~2500 MW).
NATIONAL_RISK_FRAC = 0.15
NATIONAL_PEAK_PROXY_MW = 2500.0


def _fetch_national_weather(hours: int = 168) -> pd.DataFrame:
    forecast_days = max(1, min(16, int(np.ceil(hours / 24)) + 1))
    params = {
        "latitude": SL_LAT,
        "longitude": SL_LON,
        "hourly": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "cloud_cover",
                "shortwave_radiation",
                "shortwave_radiation_clear_sky",
                "wind_speed_10m",
            ]
        ),
        "timezone": "Asia/Colombo",
        "forecast_days": forecast_days,
    }
    resp = requests.get(OPEN_METEO_URL, params=params, timeout=60)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    frame = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(hourly["time"]),
            "temp_c": hourly["temperature_2m"],
            "humidity_pct": hourly["relative_humidity_2m"],
            "cloud_cover_pct": hourly["cloud_cover"],
            "ghi_wm2": hourly["shortwave_radiation"],
            "clearsky_ghi_wm2": hourly["shortwave_radiation_clear_sky"],
            "wind_speed_ms": hourly["wind_speed_10m"],
        }
    )
    if getattr(frame["timestamp"].dt, "tz", None) is not None:
        frame["timestamp"] = frame["timestamp"].dt.tz_convert("Asia/Colombo").dt.tz_localize(None)
    for col in frame.columns:
        if col != "timestamp":
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    missing = frame["clearsky_ghi_wm2"].isna() | (frame["clearsky_ghi_wm2"] <= 0)
    cloud_frac = (frame["cloud_cover_pct"].fillna(50) / 100.0).clip(0, 0.95)
    frame.loc[missing, "clearsky_ghi_wm2"] = (
        frame.loc[missing, "ghi_wm2"].fillna(0) / (1.0 - cloud_frac.loc[missing])
    ).clip(lower=0)
    frame["clearsky_ghi_wm2"] = frame["clearsky_ghi_wm2"].fillna(0).clip(lower=0)
    return frame.sort_values("timestamp").reset_index(drop=True)


def _expand_to_15min(hourly: pd.DataFrame, hours: int) -> pd.DataFrame:
    start = hourly["timestamp"].min()
    # Align to next :00/:15/:30/:45 after last NSO stamp when possible
    hist = _load_training()
    last = hist["timestamp"].max()
    start_15 = max(start, last + pd.Timedelta(minutes=15))
    end_15 = start_15 + pd.Timedelta(hours=hours)
    idx = pd.date_range(start_15, end_15, freq="15min", inclusive="left")
    wx = hourly.set_index("timestamp").sort_index()
    aligned = wx.reindex(wx.index.union(idx)).sort_index()
    aligned = aligned.interpolate(method="time", limit_direction="both").reindex(idx)
    out = aligned.reset_index().rename(columns={"index": "timestamp"})
    if "timestamp" not in out.columns:
        out = out.rename(columns={out.columns[0]: "timestamp"})
    return out


def _calendar_row(ts: pd.Timestamp) -> dict[str, float]:
    d = ts.date()
    hour = ts.hour + ts.minute / 60.0
    dow = ts.dayofweek
    doy = ts.dayofyear
    return {
        "hour": hour,
        "dow": dow,
        "month": ts.month,
        "hour_sin": math.sin(2 * math.pi * hour / 24.0),
        "hour_cos": math.cos(2 * math.pi * hour / 24.0),
        "dow_sin": math.sin(2 * math.pi * dow / 7.0),
        "dow_cos": math.cos(2 * math.pi * dow / 7.0),
        "doy_sin": math.sin(2 * math.pi * doy / 365.25),
        "doy_cos": math.cos(2 * math.pi * doy / 365.25),
        "is_weekend": int(is_weekend(d)),
        "is_poya": int(is_poya_day(d)),
        "is_new_year": int(is_new_year_period(d)),
        "is_vesak": int(is_vesak_period(d)),
    }


def forecast_national(hours: int = 168) -> dict[str, Any]:
    """Roll forward 15-min national demand / solar / net-load forecasts."""
    hours = max(1, min(168, int(hours)))
    demand_pkg = load_nso_model("demand_xgb")
    solar_pkg = load_nso_model("solar_xgb")
    net_pkg = load_nso_model("netload_xgb")

    weather = _expand_to_15min(_fetch_national_weather(hours), hours)
    hist = _load_training().copy()

    # Rolling buffers (15-min steps)
    demand_hist = list(hist["demand_mw"].astype(float).tail(700))
    solar_hist = list(hist["nso_solar_forecast_mw"].astype(float).tail(700))
    scada_hist = list(hist["solar_mw"].astype(float).tail(700))
    net_hist = list(hist["net_load_mw"].astype(float).tail(700))

    points: list[dict[str, Any]] = []
    risk_thr = NATIONAL_RISK_FRAC * NATIONAL_PEAK_PROXY_MW

    for _, row in weather.iterrows():
        ts = pd.to_datetime(row["timestamp"])
        cal = _calendar_row(ts)

        def lag(series: list[float], steps: int, default: float = 0.0) -> float:
            if len(series) < steps:
                return float(series[-1]) if series else default
            return float(series[-steps])

        demand_roll_24 = float(np.mean(demand_hist[-96:])) if demand_hist else 1800.0
        demand_roll_7 = float(np.mean(demand_hist[-672:])) if demand_hist else demand_roll_24

        feat_demand = {
            **cal,
            "temp_c": float(row["temp_c"] or 0),
            "humidity_pct": float(row["humidity_pct"] or 0),
            "cloud_cover_pct": float(row["cloud_cover_pct"] or 0),
            "wind_speed_ms": float(row["wind_speed_ms"] or 0),
            "demand_lag_1h": lag(demand_hist, 4, demand_roll_24),
            "demand_lag_24h": lag(demand_hist, 96, demand_roll_24),
            "demand_lag_7d": lag(demand_hist, 672, demand_roll_24),
            "demand_roll_24h_mean": demand_roll_24,
            "demand_roll_7d_mean": demand_roll_7,
        }
        feat_solar = {
            "hour_sin": cal["hour_sin"],
            "hour_cos": cal["hour_cos"],
            "doy_sin": cal["doy_sin"],
            "doy_cos": cal["doy_cos"],
            "month": cal["month"],
            "temp_c": feat_demand["temp_c"],
            "humidity_pct": feat_demand["humidity_pct"],
            "cloud_cover_pct": feat_demand["cloud_cover_pct"],
            "ghi_wm2": float(row["ghi_wm2"] or 0),
            "clearsky_ghi_wm2": float(row["clearsky_ghi_wm2"] or 0),
            "wind_speed_ms": feat_demand["wind_speed_ms"],
            "solar_est_lag_1h": lag(solar_hist, 4, 0.0),
            "solar_est_lag_24h": lag(solar_hist, 96, 0.0),
            "solar_scada_lag_1h": lag(scada_hist, 4, 0.0),
        }
        feat_net = {
            **{k: feat_demand[k] for k in (
                "hour_sin", "hour_cos", "dow_sin", "dow_cos", "doy_sin", "doy_cos",
                "month", "is_weekend", "is_poya", "is_new_year",
                "temp_c", "humidity_pct", "cloud_cover_pct", "wind_speed_ms",
                "demand_lag_1h", "demand_lag_24h", "demand_roll_24h_mean",
            )},
            "ghi_wm2": feat_solar["ghi_wm2"],
            "clearsky_ghi_wm2": feat_solar["clearsky_ghi_wm2"],
            "solar_est_lag_1h": feat_solar["solar_est_lag_1h"],
            "solar_est_lag_24h": feat_solar["solar_est_lag_24h"],
            "net_load_lag_1h": lag(net_hist, 4, demand_roll_24),
            "net_load_lag_24h": lag(net_hist, 96, demand_roll_24),
        }

        d_mw = float(
            demand_pkg["model"].predict(
                pd.DataFrame([{f: feat_demand[f] for f in demand_pkg["features"]}])
            )[0]
        )
        s_mw = float(
            solar_pkg["model"].predict(
                pd.DataFrame([{f: feat_solar[f] for f in solar_pkg["features"]}])
            )[0]
        )
        s_mw = max(0.0, s_mw)
        n_direct = float(
            net_pkg["model"].predict(
                pd.DataFrame([{f: feat_net[f] for f in net_pkg["features"]}])
            )[0]
        )
        # Ensemble: blend direct net-load with demand−solar identity
        n_mw = 0.55 * n_direct + 0.45 * (d_mw - s_mw)

        cloud = float(feat_demand["cloud_cover_pct"])
        # Bootstrap net-load quantiles from holdout forecast-error pool
        unc = netload_uncertainty(
            demand_mw=d_mw,
            solar_mw=s_mw,
            net_mw=n_mw,
            hour=cal["hour"],
            cloud_pct=cloud,
            threshold_mw=risk_thr,
            seed=int(ts.value % 1_000_000_007),
        )
        regime = classify_weather_regime(cloud)

        demand_hist.append(d_mw)
        solar_hist.append(s_mw)
        scada_hist.append(s_mw * 0.12)  # approx SCADA-visible fraction
        net_hist.append(n_mw)

        points.append(
            {
                "timestamp": ts.isoformat(sep=" "),
                "demand_mw": round(d_mw, 2),
                "solar_mw": round(s_mw, 2),
                "net_load_mw": round(n_mw, 2),
                "net_load_p10_mw": unc["net_load_p10_mw"],
                "net_load_p50_mw": unc["net_load_p50_mw"],
                "net_load_p90_mw": unc["net_load_p90_mw"],
                "prob_below_threshold_pct": unc["prob_below_threshold_pct"],
                "cloud_cover_pct": round(cloud, 1),
                "temp_c": round(feat_demand["temp_c"], 1),
                "ghi_wm2": round(feat_solar["ghi_wm2"], 1),
                "weather_regime": regime,
                "tou_peak": is_tou_peak_hour(cal["hour"]),
                "hosting_risk": bool(unc["prob_below_threshold_pct"] >= 50.0),
                "is_weekend": bool(cal["is_weekend"]),
                "is_poya": bool(cal["is_poya"]),
            }
        )

    # Daily planning rollup
    pdf = pd.DataFrame(points)
    pdf["date"] = pd.to_datetime(pdf["timestamp"]).dt.date.astype(str)
    days = []
    for d, g in pdf.groupby("date"):
        evening = g.loc[
            (pd.to_datetime(g["timestamp"]).dt.hour >= 17)
            & (pd.to_datetime(g["timestamp"]).dt.hour <= 21),
            "demand_mw",
        ]
        prob_col = g["prob_below_threshold_pct"] if "prob_below_threshold_pct" in g.columns else None
        days.append(
            {
                "date": d,
                "peak_demand_mw": round(float(g["demand_mw"].max()), 2),
                "peak_solar_mw": round(float(g["solar_mw"].max()), 2),
                "min_net_load_mw": round(float(g["net_load_mw"].min()), 2),
                "min_net_load_p10_mw": round(float(g["net_load_p10_mw"].min()), 2)
                if "net_load_p10_mw" in g.columns
                else None,
                "max_prob_below_threshold_pct": round(float(prob_col.max()), 1)
                if prob_col is not None
                else None,
                "evening_ramp_mw": round(float(evening.max() - evening.min()), 2)
                if len(evening)
                else None,
                "mean_cloud_pct": round(float(g["cloud_cover_pct"].mean()), 1),
                "hosting_risk_intervals": int(
                    (g["prob_below_threshold_pct"] >= 50.0).sum()
                    if "prob_below_threshold_pct" in g.columns
                    else g["hosting_risk"].sum()
                ),
            }
        )

    return {
        "scope": "national",
        "hours": hours,
        "interval_minutes": 15,
        "source": "NSO-trained XGBoost + Open-Meteo",
        "risk_threshold_mw": risk_thr,
        "points": points,
        "daily": days,
        "anchor_timestamp": hist["timestamp"].max().isoformat(sep=" "),
        "uncertainty": uncertainty_meta(),
    }


def apply_scenario(
    forecast: dict[str, Any],
    *,
    cloud_delta_pct: float = 0.0,
    rooftop_solar_mw: float = 0.0,
    thermal_outage_mw: float = 0.0,
    wind_collapse: bool = False,
    hydro_conserve: bool = False,
) -> dict[str, Any]:
    """Deterministic what-if overlay on a national forecast."""
    risk_thr = float(forecast["risk_threshold_mw"])
    points = []
    for i, p in enumerate(forecast["points"]):
        q = dict(p)
        cloud = min(100.0, max(0.0, q["cloud_cover_pct"] + cloud_delta_pct))
        # Rough cloud → solar sensitivity
        solar_scale = 1.0 - 0.006 * max(0.0, cloud - q["cloud_cover_pct"])
        if wind_collapse:
            # Treat as lost renewable → higher net load (~150 MW typical wind)
            q["net_load_mw"] = round(q["net_load_mw"] + 150.0, 2)
        solar = max(0.0, q["solar_mw"] * solar_scale + rooftop_solar_mw * (q["ghi_wm2"] / 800.0))
        demand = q["demand_mw"]
        if hydro_conserve:
            # Hydro held back → thermal must cover more evening net load
            if q.get("tou_peak"):
                demand = demand * 1.0  # demand unchanged; net rises via lost hydro proxy
                q["net_load_mw"] = round(q["net_load_mw"] + 200.0, 2)
        net = demand - solar + thermal_outage_mw
        if not hydro_conserve and not wind_collapse:
            net = demand - solar + thermal_outage_mw
        elif wind_collapse and not hydro_conserve:
            net = demand - solar + thermal_outage_mw + 150.0
        q["cloud_cover_pct"] = round(cloud, 1)
        q["solar_mw"] = round(solar, 2)
        q["demand_mw"] = round(demand, 2)
        q["net_load_mw"] = round(net, 2)
        ts = pd.to_datetime(q["timestamp"])
        hour = ts.hour + ts.minute / 60.0
        unc = netload_uncertainty(
            demand_mw=float(demand),
            solar_mw=float(solar),
            net_mw=float(net),
            hour=hour,
            cloud_pct=cloud,
            threshold_mw=risk_thr,
            seed=i + int(cloud * 10),
        )
        q.update(unc)
        q["hosting_risk"] = bool(unc["prob_below_threshold_pct"] >= 50.0)
        q["scenario"] = True
        points.append(q)

    out = dict(forecast)
    out["points"] = points
    out["scenario"] = {
        "cloud_delta_pct": cloud_delta_pct,
        "rooftop_solar_mw": rooftop_solar_mw,
        "thermal_outage_mw": thermal_outage_mw,
        "wind_collapse": wind_collapse,
        "hydro_conserve": hydro_conserve,
    }
    return out
