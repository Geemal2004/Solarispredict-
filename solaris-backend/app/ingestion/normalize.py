"""Normalize raw NSO gensum JSON into tidy DataFrames."""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.ingestion.nso_client import SOURCE_COLUMNS

LOAD_SOURCE_RENAME = {
    "Wind": "wind_mw",
    "SPP Biomass": "biomass_mw",
    "Thermal-Oil": "oil_mw",
    "Major Hydro": "major_hydro_mw",
    "Coal": "coal_mw",
    "Solar": "solar_mw",
    "SPP Minihydro": "mini_hydro_mw",
}


def normalize_load_curve(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """15-min generation mix; demand_mw is the sum of published sources."""
    if not rows:
        return pd.DataFrame(
            columns=["timestamp", *LOAD_SOURCE_RENAME.values(), "demand_mw"]
        )

    frame = pd.DataFrame(rows)
    frame["timestamp"] = pd.to_datetime(frame["DateTime"])
    for src in SOURCE_COLUMNS:
        if src not in frame.columns:
            frame[src] = 0.0
    frame = frame[["timestamp", *SOURCE_COLUMNS]].rename(columns=LOAD_SOURCE_RENAME)
    mw_cols = list(LOAD_SOURCE_RENAME.values())
    frame[mw_cols] = frame[mw_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    frame["demand_mw"] = frame[mw_cols].sum(axis=1)
    return frame.sort_values("timestamp").reset_index(drop=True)


def normalize_solar_forecast(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["timestamp", "forecast_mw", "forecast_p10_mw", "forecast_p90_mw"]
        )

    frame = pd.DataFrame(rows)
    frame["timestamp"] = pd.to_datetime(frame["periodEnd"])
    out = pd.DataFrame(
        {
            "timestamp": frame["timestamp"],
            "forecast_mw": pd.to_numeric(frame["pvEstimate"], errors="coerce"),
            "forecast_p10_mw": pd.to_numeric(frame.get("pvEstimate10"), errors="coerce"),
            "forecast_p90_mw": pd.to_numeric(frame.get("pvEstimate90"), errors="coerce"),
        }
    )
    return out.sort_values("timestamp").reset_index(drop=True)


def normalize_peaks(rows: list[dict[str, Any]], day: str) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["date", "metric", "timestamp", "demand_mw"]
        )

    mapping = {
        "Day Peak": "day_peak",
        "Night Peak": "night_peak",
        "Off Peak": "minimum",
        "Minimum Demand": "minimum",
    }
    records = []
    for row in rows:
        name = row.get("stationGroupName") or row.get("displayName") or ""
        metric = mapping.get(name) or mapping.get(row.get("displayName") or "")
        if not metric:
            metric = str(name).strip().lower().replace(" ", "_") or "unknown"
        records.append(
            {
                "date": day,
                "metric": metric,
                "timestamp": pd.to_datetime(row.get("dateTime")),
                "demand_mw": pd.to_numeric(row.get("activePowerMW"), errors="coerce"),
            }
        )
    return pd.DataFrame.from_records(records)


def normalize_energy_daily(rows: list[dict[str, Any]], day: str) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["date", "station_group", "display_name", "energy_gwh"]
        )

    records = []
    for row in rows:
        records.append(
            {
                "date": day,
                "station_group": row.get("stationGroupName"),
                "display_name": row.get("displayName"),
                "energy_gwh": pd.to_numeric(row.get("energyGWh"), errors="coerce"),
                "order": row.get("order"),
                "color": row.get("color"),
            }
        )
    return pd.DataFrame.from_records(records)


def normalize_reservoir(rows: list[dict[str, Any]], day: str) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=[
                "date",
                "reservoir",
                "storage_pct",
                "storage_gwh",
                "rainfall_mm",
                "water_level",
            ]
        )

    records = []
    for row in rows:
        records.append(
            {
                "date": day,
                "reservoir": row.get("reservoirName"),
                "storage_pct": pd.to_numeric(row.get("storagePercentage"), errors="coerce"),
                "storage_gwh": pd.to_numeric(row.get("storageGWh"), errors="coerce"),
                "full_storage_gwh": pd.to_numeric(row.get("fullStorageGWh"), errors="coerce"),
                "rainfall_mm": pd.to_numeric(row.get("rainfallmm"), errors="coerce"),
                "water_level": pd.to_numeric(row.get("waterLevel"), errors="coerce"),
                "energy_gwh": pd.to_numeric(row.get("energyGWh"), errors="coerce"),
                "type": row.get("type"),
            }
        )
    return pd.DataFrame.from_records(records)


def normalize_night_peak_mix(rows: list[dict[str, Any]], day: str) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(
            columns=["date", "station_group", "display_name", "active_power_mw"]
        )

    records = []
    for row in rows:
        records.append(
            {
                "date": day,
                "station_group": row.get("stationGroupName"),
                "display_name": row.get("displayName"),
                "active_power_mw": pd.to_numeric(row.get("activePowerMW"), errors="coerce"),
            }
        )
    return pd.DataFrame.from_records(records)


def normalize_day_bundle(bundle: dict[str, Any]) -> dict[str, pd.DataFrame]:
    day = bundle["date"]
    return {
        "generation_15min": normalize_load_curve(bundle.get("load_curve") or []),
        "solar_forecast_15min": normalize_solar_forecast(bundle.get("solar_forecast") or []),
        "peaks_daily": normalize_peaks(bundle.get("peak_data") or [], day),
        "energy_daily": normalize_energy_daily(bundle.get("energy_data") or [], day),
        "reservoir_daily": normalize_reservoir(bundle.get("reservoir_data") or [], day),
        "night_peak_mix": normalize_night_peak_mix(bundle.get("night_peak_data") or [], day),
    }
