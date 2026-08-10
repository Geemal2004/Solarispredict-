"""Per-zone weather anomaly vs NASA POWER climatology (no invented narratives)."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from app.data_pipeline import load_cached_zone
from app.forecast import fetch_open_meteo
from app.zones import ZONES

CLIMATOLOGY_YEARS = "2023–2024"
DAYLIGHT_GHI_MIN = 25.0  # W/m² — ignore night intervals in aggregates


def _colombo_ts(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    if index.tz is None:
        return index.tz_localize("UTC").tz_convert("Asia/Colombo")
    return index.tz_convert("Asia/Colombo")


def _calendar_key(ts: pd.Timestamp) -> tuple[int, int, int]:
    """Month, day, hour in Asia/Colombo (Feb 29 → Feb 28)."""
    local = ts.tz_convert("Asia/Colombo") if ts.tzinfo else ts
    month, day = int(local.month), int(local.day)
    if month == 2 and day == 29:
        day = 28
    return month, day, int(local.hour)


@lru_cache(maxsize=8)
def _zone_climatology(zone: str) -> pd.DataFrame:
    """
    Hour-of-year climatology from cached NASA POWER parquet.

    Index: (month, day, hour). Columns: cloud_mean/std, ghi_mean/std, temp_mean.
    """
    raw = load_cached_zone(zone)
    if raw is None or raw.empty:
        raise FileNotFoundError(
            f"No NASA POWER cache for '{zone}'. Run: python -m app.data_pipeline"
        )

    if isinstance(raw.index, pd.RangeIndex):
        if "timestamp" in raw.columns:
            raw = raw.set_index("timestamp")
        else:
            raise ValueError(f"NASA POWER cache for {zone} has no timestamp index")

    idx = _colombo_ts(pd.DatetimeIndex(raw.index))
    frame = raw.copy()
    frame.index = idx

    frame = frame.rename(
        columns={
            "CLOUD_AMT": "cloud_amt",
            "ALLSKY_SFC_SW_DWN": "ghi",
            "T2M": "temp",
        }
    )
    for col in ("cloud_amt", "ghi", "temp"):
        if col not in frame.columns:
            raise ValueError(f"NASA POWER cache for {zone} missing {col}")

    frame["cloud_amt"] = pd.to_numeric(frame["cloud_amt"], errors="coerce")
    frame["ghi"] = pd.to_numeric(frame["ghi"], errors="coerce").clip(lower=0)
    frame["temp"] = pd.to_numeric(frame["temp"], errors="coerce")
    frame = frame.replace(-999, np.nan)

    keys = [_calendar_key(ts) for ts in frame.index]
    frame["m"] = [k[0] for k in keys]
    frame["d"] = [k[1] for k in keys]
    frame["h"] = [k[2] for k in keys]

    grouped = frame.groupby(["m", "d", "h"], observed=True)
    clim = grouped.agg(
        cloud_mean=("cloud_amt", "mean"),
        cloud_std=("cloud_amt", "std"),
        ghi_mean=("ghi", "mean"),
        ghi_std=("ghi", "std"),
        temp_mean=("temp", "mean"),
        n_samples=("ghi", "count"),
    )
    clim["cloud_std"] = clim["cloud_std"].fillna(0)
    clim["ghi_std"] = clim["ghi_std"].fillna(0)
    return clim


def _lookup_clim(clim: pd.DataFrame, ts: pd.Timestamp) -> pd.Series | None:
    key = _calendar_key(ts)
    if key not in clim.index:
        return None
    return clim.loc[key]


def zone_weather_anomaly(zone: str, hours: int = 24) -> dict[str, Any]:
    """Compare Open-Meteo forecast to NASA POWER climatology for this calendar day."""
    info = ZONES[zone]
    clim = _zone_climatology(zone)
    wx = fetch_open_meteo(info["lat"], info["lon"], hours=hours)

    rows: list[dict[str, Any]] = []
    for ts, row in wx.iterrows():
        ref = _lookup_clim(clim, ts)
        if ref is None:
            continue
        ghi_fc = float(row.get("shortwave_radiation") or 0)
        if ghi_fc < DAYLIGHT_GHI_MIN and float(ref["ghi_mean"]) < DAYLIGHT_GHI_MIN:
            continue

        cloud_fc = float(row["cloud_amt"]) if pd.notna(row["cloud_amt"]) else None
        temp_fc = float(row["temp"]) if pd.notna(row["temp"]) else None
        cloud_norm = float(ref["cloud_mean"])
        ghi_norm = float(ref["ghi_mean"])
        temp_norm = float(ref["temp_mean"]) if pd.notna(ref["temp_mean"]) else None

        cloud_delta = None if cloud_fc is None else cloud_fc - cloud_norm
        ghi_delta_pct = None
        if ghi_norm > DAYLIGHT_GHI_MIN:
            ghi_delta_pct = 100.0 * (ghi_fc - ghi_norm) / ghi_norm
        temp_delta = None
        if temp_fc is not None and temp_norm is not None:
            temp_delta = temp_fc - temp_norm

        rows.append(
            {
                "timestamp": ts.isoformat(),
                "cloud_forecast_pct": cloud_fc,
                "cloud_climatology_pct": round(cloud_norm, 1),
                "cloud_delta_pp": round(cloud_delta, 1) if cloud_delta is not None else None,
                "ghi_forecast_wm2": round(ghi_fc, 1),
                "ghi_climatology_wm2": round(ghi_norm, 1),
                "ghi_delta_pct": round(ghi_delta_pct, 1) if ghi_delta_pct is not None else None,
                "temp_forecast_c": round(temp_fc, 1) if temp_fc is not None else None,
                "temp_climatology_c": round(temp_norm, 1) if temp_norm is not None else None,
                "temp_delta_c": round(temp_delta, 1) if temp_delta is not None else None,
            }
        )

    if not rows:
        raise ValueError(f"No climatology matches for {zone} in next {hours}h")

    df = pd.DataFrame(rows)

    def _mean(col: str) -> float | None:
        vals = df[col].dropna()
        return round(float(vals.mean()), 1) if len(vals) else None

    cloud_delta = _mean("cloud_delta_pp")
    ghi_delta = _mean("ghi_delta_pct")
    temp_delta = _mean("temp_delta_c")

    flags: list[str] = []
    if cloud_delta is not None and abs(cloud_delta) >= 12:
        flags.append("cloud")
    if ghi_delta is not None and abs(ghi_delta) >= 10:
        flags.append("irradiance")
    if temp_delta is not None and abs(temp_delta) >= 1.5:
        flags.append("temperature")

    return {
        "zone": zone,
        "label": zone.replace("_", " ").title(),
        "lat": info["lat"],
        "lon": info["lon"],
        "intervals": len(rows),
        "summary": {
            "cloud_forecast_pct": _mean("cloud_forecast_pct"),
            "cloud_climatology_pct": _mean("cloud_climatology_pct"),
            "cloud_delta_pp": cloud_delta,
            "ghi_forecast_wm2": _mean("ghi_forecast_wm2"),
            "ghi_climatology_wm2": _mean("ghi_climatology_wm2"),
            "ghi_delta_pct": ghi_delta,
            "temp_forecast_c": _mean("temp_forecast_c"),
            "temp_climatology_c": _mean("temp_climatology_c"),
            "temp_delta_c": temp_delta,
        },
        "flags": flags,
        "hourly": rows[:96],
    }


def national_weather_anomaly(hours: int = 24) -> dict[str, Any]:
    """All zones vs climatology; national line weighted by zone solar capacity."""
    zones_out: list[dict[str, Any]] = []
    missing: list[str] = []
    weights: list[float] = []
    cloud_deltas: list[float] = []
    ghi_deltas: list[float] = []

    for zone in ZONES:
        try:
            z = zone_weather_anomaly(zone, hours=hours)
        except FileNotFoundError:
            missing.append(zone)
            continue
        zones_out.append(z)
        w = float(ZONES[zone]["solar_capacity_mw"])
        weights.append(w)
        s = z["summary"]
        if s.get("cloud_delta_pp") is not None:
            cloud_deltas.append(float(s["cloud_delta_pp"]))
        if s.get("ghi_delta_pct") is not None:
            ghi_deltas.append(float(s["ghi_delta_pct"]) * w)

    if not zones_out:
        raise FileNotFoundError(
            "NASA POWER climatology cache missing for all zones. "
            "Run: python -m app.data_pipeline"
        )

    wsum = sum(weights) or 1.0
    national_ghi_delta = round(sum(ghi_deltas) / wsum, 1) if ghi_deltas else None
    national_cloud_delta = (
        round(float(np.mean(cloud_deltas)), 1) if cloud_deltas else None
    )

    return {
        "method": (
            f"Open-Meteo forecast vs NASA POWER {CLIMATOLOGY_YEARS} "
            "hourly mean for matching calendar day and hour (Asia/Colombo)"
        ),
        "climatology_source": "NASA POWER RE community hourly archive",
        "climatology_years": CLIMATOLOGY_YEARS,
        "forecast_source": "Open-Meteo",
        "hours": hours,
        "zones": zones_out,
        "missing_zones": missing,
        "national": {
            "cloud_delta_pp": national_cloud_delta,
            "ghi_delta_pct": national_ghi_delta,
            "zones_flagged": sum(1 for z in zones_out if z["flags"]),
        },
    }
