"""Build the national 15-minute feature store from NSO + Open-Meteo + calendar.

Produces:
  app/data/feature_store/weather_hourly.parquet
  app/data/feature_store/training_15min.parquet

Usage:
  python -m app.feature_store
  python -m app.feature_store --force
"""

from __future__ import annotations

import argparse
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from app.demand_model import (
    is_new_year_period,
    is_poya_day,
    is_vesak_period,
    is_weekend,
)
from app.ingestion.nso_client import ARCHIVE_START

DATA_DIR = Path(__file__).resolve().parent / "data"
NSO_DIR = DATA_DIR / "nso" / "processed"
FS_DIR = DATA_DIR / "feature_store"

# Geographic center of Sri Lanka — national weather proxy for grid-level models.
SL_LAT = 7.8731
SL_LON = 80.7718

OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

WEATHER_HOURLY = (
    "temperature_2m",
    "relative_humidity_2m",
    "cloud_cover",
    "shortwave_radiation",
    "shortwave_radiation_clear_sky",
    "wind_speed_10m",
)


def _tz_naive_colombo(series: pd.Series) -> pd.Series:
    ts = pd.to_datetime(series)
    if getattr(ts.dt, "tz", None) is not None:
        return ts.dt.tz_convert("Asia/Colombo").dt.tz_localize(None)
    return ts


def fetch_open_meteo_archive(
    start: date,
    end: date,
    *,
    lat: float = SL_LAT,
    lon: float = SL_LON,
) -> pd.DataFrame:
    """Hourly historical weather for Sri Lanka from Open-Meteo archive."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(WEATHER_HOURLY),
        "timezone": "Asia/Colombo",
    }
    resp = requests.get(OPEN_METEO_ARCHIVE, params=params, timeout=120)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    frame = pd.DataFrame(
        {
            "timestamp": _tz_naive_colombo(pd.Series(hourly["time"])),
            "temp_c": hourly["temperature_2m"],
            "humidity_pct": hourly["relative_humidity_2m"],
            "cloud_cover_pct": hourly["cloud_cover"],
            "ghi_wm2": hourly["shortwave_radiation"],
            "clearsky_ghi_wm2": hourly["shortwave_radiation_clear_sky"],
            "wind_speed_ms": hourly["wind_speed_10m"],
        }
    )
    for col in frame.columns:
        if col != "timestamp":
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    # Archive clear-sky is sometimes missing — approximate from GHI + cloud cover.
    missing_cs = frame["clearsky_ghi_wm2"].isna() | (frame["clearsky_ghi_wm2"] <= 0)
    if missing_cs.any():
        cloud_frac = (frame["cloud_cover_pct"].fillna(50) / 100.0).clip(0, 0.95)
        approx = (frame["ghi_wm2"].fillna(0) / (1.0 - cloud_frac)).clip(lower=0)
        frame.loc[missing_cs, "clearsky_ghi_wm2"] = approx.loc[missing_cs]
    frame["clearsky_ghi_wm2"] = frame["clearsky_ghi_wm2"].fillna(0).clip(lower=0)
    return frame.sort_values("timestamp").reset_index(drop=True)


def load_nso_generation() -> pd.DataFrame:
    path = NSO_DIR / "generation_15min.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Run: python -m app.ingestion.fetch_historical"
        )
    gen = pd.read_parquet(path)
    gen["timestamp"] = _tz_naive_colombo(gen["timestamp"])
    return gen.sort_values("timestamp").reset_index(drop=True)


def load_nso_solar_forecast() -> pd.DataFrame:
    path = NSO_DIR / "solar_forecast_15min.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}")
    solar = pd.read_parquet(path)
    solar["timestamp"] = _tz_naive_colombo(solar["timestamp"])
    solar = solar.rename(
        columns={
            "forecast_mw": "nso_solar_forecast_mw",
            "forecast_p10_mw": "nso_solar_p10_mw",
            "forecast_p90_mw": "nso_solar_p90_mw",
        }
    )
    return solar.sort_values("timestamp").reset_index(drop=True)


def interpolate_weather_to_15min(
    weather_hourly: pd.DataFrame, timestamps: pd.Series
) -> pd.DataFrame:
    """Forward-fill / interpolate hourly weather onto NSO 15-min index."""
    wx = weather_hourly.set_index("timestamp").sort_index()
    idx = pd.DatetimeIndex(pd.to_datetime(timestamps)).sort_values().unique()
    aligned = wx.reindex(wx.index.union(idx)).sort_index()
    aligned = aligned.interpolate(method="time", limit_direction="both")
    aligned = aligned.reindex(idx)
    out = aligned.reset_index().rename(columns={"index": "timestamp"})
    if "timestamp" not in out.columns:
        out = out.rename(columns={out.columns[0]: "timestamp"})
    return out


def add_calendar_features(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    ts = pd.to_datetime(out["timestamp"])
    out["date"] = ts.dt.date
    out["hour"] = ts.dt.hour + ts.dt.minute / 60.0
    out["dow"] = ts.dt.dayofweek
    out["month"] = ts.dt.month
    out["hour_sin"] = np.sin(2 * math.pi * out["hour"] / 24.0)
    out["hour_cos"] = np.cos(2 * math.pi * out["hour"] / 24.0)
    out["dow_sin"] = np.sin(2 * math.pi * out["dow"] / 7.0)
    out["dow_cos"] = np.cos(2 * math.pi * out["dow"] / 7.0)
    out["doy"] = ts.dt.dayofyear
    out["doy_sin"] = np.sin(2 * math.pi * out["doy"] / 365.25)
    out["doy_cos"] = np.cos(2 * math.pi * out["doy"] / 365.25)
    out["is_weekend"] = out["date"].map(lambda d: int(is_weekend(d)))
    out["is_poya"] = out["date"].map(lambda d: int(is_poya_day(d)))
    out["is_new_year"] = out["date"].map(lambda d: int(is_new_year_period(d)))
    out["is_vesak"] = out["date"].map(lambda d: int(is_vesak_period(d)))
    return out


def add_lag_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Lag / rolling features for demand and NSO solar estimate."""
    out = frame.sort_values("timestamp").copy()
    # 15-min steps: 4/h, 96/day, 672/week
    out["demand_lag_1h"] = out["demand_mw"].shift(4)
    out["demand_lag_24h"] = out["demand_mw"].shift(96)
    out["demand_lag_7d"] = out["demand_mw"].shift(672)
    out["demand_roll_24h_mean"] = out["demand_mw"].shift(1).rolling(96, min_periods=16).mean()
    out["demand_roll_7d_mean"] = out["demand_mw"].shift(1).rolling(672, min_periods=96).mean()

    out["solar_est_lag_1h"] = out["nso_solar_forecast_mw"].shift(4)
    out["solar_est_lag_24h"] = out["nso_solar_forecast_mw"].shift(96)
    out["solar_scada_lag_1h"] = out["solar_mw"].shift(4)

    out["net_load_mw"] = out["demand_mw"] - out["nso_solar_forecast_mw"].fillna(0)
    out["net_load_lag_1h"] = out["net_load_mw"].shift(4)
    out["net_load_lag_24h"] = out["net_load_mw"].shift(96)

    # Visibility: SCADA-visible solar vs system solar estimate
    est = out["nso_solar_forecast_mw"].replace(0, np.nan)
    out["solar_visibility_pct"] = (out["solar_mw"] / est * 100.0).clip(0, 100)
    return out


def build_training_table(
    *,
    force_weather: bool = False,
) -> pd.DataFrame:
    FS_DIR.mkdir(parents=True, exist_ok=True)
    gen = load_nso_generation()
    solar = load_nso_solar_forecast()

    start = pd.to_datetime(gen["timestamp"]).min().date()
    end = pd.to_datetime(gen["timestamp"]).max().date()
    if start < ARCHIVE_START:
        start = ARCHIVE_START

    weather_path = FS_DIR / "weather_hourly.parquet"
    if weather_path.exists() and not force_weather:
        print(f"cached weather {weather_path}", flush=True)
        weather = pd.read_parquet(weather_path)
        weather["timestamp"] = _tz_naive_colombo(weather["timestamp"])
    else:
        print(f"fetching Open-Meteo archive {start} -> {end}", flush=True)
        weather = fetch_open_meteo_archive(start, end)
        weather.to_parquet(weather_path, index=False)
        print(f"wrote {weather_path} ({len(weather)} rows)", flush=True)

    merged = gen.merge(solar, on="timestamp", how="left")
    wx15 = interpolate_weather_to_15min(weather, merged["timestamp"])
    merged = merged.merge(wx15, on="timestamp", how="left")
    merged = add_calendar_features(merged)
    merged = add_lag_features(merged)

    # Evening ramp rate (MW per 15 min) for enterprise metrics
    merged["demand_ramp_mw"] = merged["demand_mw"].diff()

    out_path = FS_DIR / "training_15min.parquet"
    merged.to_parquet(out_path, index=False)
    print(f"wrote {out_path} ({len(merged)} rows, {len(merged.columns)} cols)", flush=True)
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description="Build NSO+weather feature store")
    parser.add_argument("--force", action="store_true", help="Refetch Open-Meteo archive")
    args = parser.parse_args()
    frame = build_training_table(force_weather=args.force)
    print("columns:", ", ".join(frame.columns.astype(str)))
    print(
        "range:",
        frame["timestamp"].min(),
        "->",
        frame["timestamp"].max(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
