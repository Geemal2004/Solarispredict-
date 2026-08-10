"""National NSO-anchored ops layer: briefing, replay, accuracy, visibility."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.feature_store import FS_DIR
from app.ingestion.nso_client import ARCHIVE_START
from app.train_nso_models import MODELS_DIR

NSO_PROCESSED = Path(__file__).resolve().parent / "data" / "nso" / "processed"


@lru_cache(maxsize=1)
def _load_training() -> pd.DataFrame:
    path = FS_DIR / "training_15min.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Run: python -m app.feature_store"
        )
    frame = pd.read_parquet(path)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"])
    return frame.sort_values("timestamp").reset_index(drop=True)


def _load_peaks() -> pd.DataFrame:
    path = NSO_PROCESSED / "peaks_daily.parquet"
    if not path.exists():
        return pd.DataFrame(columns=["date", "metric", "timestamp", "demand_mw"])
    peaks = pd.read_parquet(path)
    peaks["date"] = peaks["date"].astype(str)
    return peaks


def archive_meta() -> dict[str, Any]:
    frame = _load_training()
    summary_path = MODELS_DIR / "summary.json"
    summary = {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    return {
        "archive_start": ARCHIVE_START.isoformat(),
        "archive_end": frame["timestamp"].max().date().isoformat(),
        "generation_intervals": int(len(frame)),
        "distributed_solar_visibility_pct": summary.get(
            "distributed_solar_visibility_pct"
        ),
        "models": summary.get("models"),
        "statement": (
            f"Trained and validated on {len(frame)} intervals of official "
            "Sri Lankan National System Operator operational data at 15-minute "
            f"resolution ({ARCHIVE_START.isoformat()} → "
            f"{frame['timestamp'].max().date().isoformat()})."
        ),
    }


def latest_snapshot() -> dict[str, Any]:
    frame = _load_training()
    row = frame.iloc[-1]
    demand = float(row["demand_mw"])
    solar_est = float(row["nso_solar_forecast_mw"] or 0)
    solar_scada = float(row["solar_mw"] or 0)
    renewables = float(
        (row["wind_mw"] or 0)
        + (row["major_hydro_mw"] or 0)
        + (row["mini_hydro_mw"] or 0)
        + (row["biomass_mw"] or 0)
        + solar_scada
    )
    return {
        "timestamp": row["timestamp"].isoformat(sep=" "),
        "demand_mw": round(demand, 2),
        "generation_mw": round(demand, 2),  # load-curve sources sum to demand
        "solar_estimate_mw": round(solar_est, 2),
        "solar_scada_mw": round(solar_scada, 2),
        "net_load_mw": round(float(row["net_load_mw"]), 2),
        "renewable_share_pct": round(100.0 * renewables / demand, 2) if demand else 0.0,
        "mix_mw": {
            "coal": round(float(row["coal_mw"]), 2),
            "oil": round(float(row["oil_mw"]), 2),
            "major_hydro": round(float(row["major_hydro_mw"]), 2),
            "mini_hydro": round(float(row["mini_hydro_mw"]), 2),
            "wind": round(float(row["wind_mw"]), 2),
            "solar_scada": round(solar_scada, 2),
            "biomass": round(float(row["biomass_mw"]), 2),
        },
        "weather": {
            "temp_c": None if pd.isna(row.get("temp_c")) else round(float(row["temp_c"]), 1),
            "cloud_cover_pct": None
            if pd.isna(row.get("cloud_cover_pct"))
            else round(float(row["cloud_cover_pct"]), 1),
            "ghi_wm2": None if pd.isna(row.get("ghi_wm2")) else round(float(row["ghi_wm2"]), 1),
        },
    }


def national_briefing() -> dict[str, Any]:
    snap = latest_snapshot()
    meta = archive_meta()
    peaks = _load_peaks()
    last_day = snap["timestamp"][:10]
    day_peaks = peaks.loc[peaks["date"] == last_day]
    peak_map = {
        str(r["metric"]): {
            "demand_mw": round(float(r["demand_mw"]), 2),
            "timestamp": pd.to_datetime(r["timestamp"]).isoformat(sep=" "),
        }
        for _, r in day_peaks.iterrows()
    }

    # Next critical event heuristic from last complete evening ramp in archive day
    frame = _load_training()
    day = frame.loc[frame["timestamp"].dt.strftime("%Y-%m-%d") == last_day]
    critical = "Evening ramp typically begins near 17:30 Asia/Colombo"
    if len(day) > 8:
        evening = day.loc[(day["hour"] >= 16) & (day["hour"] <= 20)].copy()
        if len(evening):
            evening["ramp"] = evening["demand_mw"].diff()
            idx = evening["ramp"].idxmax()
            if pd.notna(idx):
                t = evening.loc[idx, "timestamp"]
                critical = (
                    f"Steepest evening ramp on {last_day} at "
                    f"{pd.to_datetime(t).strftime('%H:%M')} "
                    f"(+{evening.loc[idx, 'ramp']:.0f} MW / 15 min)"
                )

    return {
        "product": "SolarisPredict-SL — Sri Lanka Grid Digital Twin",
        "as_of": snap["timestamp"],
        "kpis": {
            "demand_now_mw": snap["demand_mw"],
            "solar_estimate_mw": snap["solar_estimate_mw"],
            "net_load_mw": snap["net_load_mw"],
            "renewable_share_pct": snap["renewable_share_pct"],
            "distributed_solar_visibility_pct": meta.get(
                "distributed_solar_visibility_pct"
            ),
        },
        "peaks": peak_map,
        "mix_mw": snap["mix_mw"],
        "weather": snap["weather"],
        "next_critical_event": critical,
        "archive": meta,
        "source": "NSO / EDLCare gensum public JSON + Open-Meteo",
    }


def replay_day(day: date) -> dict[str, Any]:
    if day < ARCHIVE_START:
        raise ValueError(f"Date {day} is before archive start {ARCHIVE_START}")
    frame = _load_training()
    day_s = day.isoformat()
    subset = frame.loc[frame["timestamp"].dt.strftime("%Y-%m-%d") == day_s].copy()
    if subset.empty:
        raise ValueError(f"No NSO intervals for {day_s}")

    peaks = _load_peaks()
    day_peaks = peaks.loc[peaks["date"] == day_s]
    peak_map = {
        str(r["metric"]): {
            "demand_mw": round(float(r["demand_mw"]), 2),
            "timestamp": pd.to_datetime(r["timestamp"]).isoformat(sep=" "),
        }
        for _, r in day_peaks.iterrows()
    }

    points = []
    for _, row in subset.iterrows():
        points.append(
            {
                "timestamp": row["timestamp"].isoformat(sep=" "),
                "demand_mw": round(float(row["demand_mw"]), 2),
                "solar_estimate_mw": round(float(row["nso_solar_forecast_mw"] or 0), 2),
                "solar_scada_mw": round(float(row["solar_mw"] or 0), 2),
                "net_load_mw": round(float(row["net_load_mw"]), 2),
                "coal_mw": round(float(row["coal_mw"]), 2),
                "oil_mw": round(float(row["oil_mw"]), 2),
                "major_hydro_mw": round(float(row["major_hydro_mw"]), 2),
                "mini_hydro_mw": round(float(row["mini_hydro_mw"]), 2),
                "wind_mw": round(float(row["wind_mw"]), 2),
                "biomass_mw": round(float(row["biomass_mw"]), 2),
                "temp_c": None if pd.isna(row.get("temp_c")) else round(float(row["temp_c"]), 1),
                "cloud_cover_pct": None
                if pd.isna(row.get("cloud_cover_pct"))
                else round(float(row["cloud_cover_pct"]), 1),
            }
        )

    demand = subset["demand_mw"]
    solar = subset["nso_solar_forecast_mw"].fillna(0)
    evening = subset.loc[(subset["hour"] >= 17) & (subset["hour"] <= 21), "demand_mw"]
    evening_ramp = float(evening.max() - evening.min()) if len(evening) else None

    return {
        "date": day_s,
        "points": points,
        "peaks": peak_map,
        "summary": {
            "max_demand_mw": round(float(demand.max()), 2),
            "min_demand_mw": round(float(demand.min()), 2),
            "max_solar_estimate_mw": round(float(solar.max()), 2),
            "min_net_load_mw": round(float((demand - solar).min()), 2),
            "mean_renewable_share_pct": round(
                float(
                    (
                        subset["wind_mw"]
                        + subset["major_hydro_mw"]
                        + subset["mini_hydro_mw"]
                        + subset["biomass_mw"]
                        + subset["solar_mw"]
                    ).sum()
                    / demand.sum()
                    * 100.0
                ),
                2,
            ),
            "evening_ramp_mw": None if evening_ramp is None else round(evening_ramp, 2),
            "solar_visibility_pct": round(
                float(
                    subset.loc[subset["nso_solar_forecast_mw"] > 50, "solar_mw"].sum()
                    / max(
                        subset.loc[
                            subset["nso_solar_forecast_mw"] > 50, "nso_solar_forecast_mw"
                        ].sum(),
                        1e-6,
                    )
                    * 100.0
                ),
                2,
            ),
        },
        "n_points": len(points),
    }


def forecast_accuracy(window_days: int = 7) -> dict[str, Any]:
    """Holdout-style accuracy from trained model metrics + recent persistence errors."""
    summary_path = MODELS_DIR / "summary.json"
    model_metrics = {}
    if summary_path.exists():
        model_metrics = json.loads(summary_path.read_text(encoding="utf-8")).get(
            "models", {}
        )

    frame = _load_training()
    cutoff = frame["timestamp"].max() - pd.Timedelta(days=window_days)
    recent = frame.loc[frame["timestamp"] > cutoff].copy()

    def mae(a: pd.Series, b: pd.Series) -> float | None:
        mask = a.notna() & b.notna()
        if not mask.any():
            return None
        return round(float(np.mean(np.abs(a[mask] - b[mask]))), 2)

    # Persistence as a transparent "what if we only used yesterday" monitor
    demand_persist = mae(recent["demand_mw"], recent["demand_lag_24h"])
    solar_persist = mae(recent["nso_solar_forecast_mw"], recent["solar_est_lag_24h"])
    net_persist = mae(recent["net_load_mw"], recent["net_load_lag_24h"])

    evening = recent.loc[(recent["hour"] >= 17) & (recent["hour"] <= 21)].copy()
    evening_ramp_err = None
    if len(evening) and evening["demand_lag_24h"].notna().any():
        evening_ramp_err = mae(evening["demand_mw"], evening["demand_lag_24h"])

    return {
        "window_days": window_days,
        "model_holdout": model_metrics,
        "recent_persistence_monitor": {
            "demand_mae_mw": demand_persist,
            "solar_mae_mw": solar_persist,
            "net_load_mae_mw": net_persist,
            "evening_ramp_mae_mw": evening_ramp_err,
        },
        "note": (
            "model_holdout is chronological holdout MAE from NSO-trained XGBoost. "
            "recent_persistence_monitor is a live accuracy floor (yesterday same-time)."
        ),
    }


def solar_visibility_index() -> dict[str, Any]:
    frame = _load_training()
    day = frame.loc[frame["nso_solar_forecast_mw"] > 50]
    pct = float(day["solar_mw"].sum() / day["nso_solar_forecast_mw"].sum() * 100.0)
    return {
        "distributed_solar_visibility_pct": round(pct, 2),
        "definition": (
            "Share of NSO system solar estimate that appears in SCADA-visible "
            "load-curve Solar telemetry during daytime intervals (>50 MW estimate)."
        ),
        "scada_solar_mwh": round(float(day["solar_mw"].sum() * 0.25), 1),
        "system_solar_estimate_mwh": round(
            float(day["nso_solar_forecast_mw"].sum() * 0.25), 1
        ),
        "insight": (
            "Most Sri Lankan solar is distributed / rooftop and only weakly visible "
            "in generation-mix telemetry — the NSO pvEstimate is the operational truth "
            "for net-load planning."
        ),
    }


def list_replay_dates() -> list[str]:
    frame = _load_training()
    dates = sorted({ts.date().isoformat() for ts in frame["timestamp"]})
    return dates
