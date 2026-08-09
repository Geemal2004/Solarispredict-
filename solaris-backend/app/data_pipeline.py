"""Fetch NASA POWER hourly meteorology / solar irradiance for a point."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd
import requests

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
PARAMETERS = (
    "ALLSKY_SFC_SW_DWN,"
    "CLRSKY_SFC_SW_DWN,"
    "T2M,"
    "RH2M,"
    "WS2M,"
    "CLOUD_AMT"
)

DATA_DIR = Path(__file__).resolve().parent / "data"


def fetch_nasa_power(
    lat: float,
    lon: float,
    start: str,
    end: str,
    *,
    community: str = "RE",
) -> pd.DataFrame:
    """
    Fetch NASA POWER hourly data for a lat/lon and date range.

    Args:
        lat: Latitude in decimal degrees.
        lon: Longitude in decimal degrees.
        start: Start date as YYYYMMDD.
        end: End date as YYYYMMDD.
        community: NASA POWER community (default RE = renewable energy).

    Returns:
        DataFrame indexed by timestamp (UTC) with irradiance and weather columns.
    """
    params = {
        "parameters": PARAMETERS,
        "community": community,
        "longitude": lon,
        "latitude": lat,
        "start": start,
        "end": end,
        "format": "JSON",
    }
    resp = requests.get(NASA_POWER_URL, params=params, timeout=120)
    resp.raise_for_status()
    payload = resp.json()

    properties = payload.get("properties", {})
    parameter = properties.get("parameter", {})
    if not parameter:
        raise ValueError("NASA POWER response missing 'properties.parameter'")

    # Each parameter is { "YYYYMMDDHH": value, ... }
    frame = pd.DataFrame(parameter)
    frame.index = pd.to_datetime(frame.index.astype(str), format="%Y%m%d%H", utc=True)
    frame.index.name = "timestamp"
    frame = frame.sort_index()

    # NASA POWER uses -999 for missing
    frame = frame.replace(-999, pd.NA).astype(float)
    return frame


def cache_path(zone: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{zone}_nasa_power.parquet"


def fetch_and_cache_zone(
    zone: str,
    lat: float,
    lon: float,
    start: str = "20230101",
    end: str = "20241231",
    force: bool = False,
) -> pd.DataFrame:
    """Fetch NASA POWER for a zone and cache as parquet under app/data/."""
    path = cache_path(zone)
    if path.exists() and not force:
        return pd.read_parquet(path)

    df = fetch_nasa_power(lat, lon, start, end)
    df.to_parquet(path)
    return df


def load_cached_zone(zone: str) -> Optional[pd.DataFrame]:
    path = cache_path(zone)
    if not path.exists():
        return None
    return pd.read_parquet(path)


if __name__ == "__main__":
    from app.zones import ZONES

    for name, info in ZONES.items():
        print(f"Fetching NASA POWER for {name} ({info['lat']}, {info['lon']})...")
        df = fetch_and_cache_zone(name, info["lat"], info["lon"])
        print(f"  -> {len(df)} rows, columns={list(df.columns)}, cached at {cache_path(name)}")
