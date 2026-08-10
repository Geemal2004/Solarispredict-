"""Train national demand / solar / net-load models on the NSO feature store.

Writes models + metrics under app/models/nso/:
  demand_xgb.pkl, solar_xgb.pkl, netload_xgb.pkl
  *_metrics.json

Usage:
  python -m app.train_nso_models
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from app.feature_store import FS_DIR, build_training_table

MODELS_DIR = Path(__file__).resolve().parent / "models" / "nso"

DEMAND_FEATURES = [
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "doy_sin",
    "doy_cos",
    "month",
    "is_weekend",
    "is_poya",
    "is_new_year",
    "is_vesak",
    "temp_c",
    "humidity_pct",
    "cloud_cover_pct",
    "wind_speed_ms",
    "demand_lag_1h",
    "demand_lag_24h",
    "demand_lag_7d",
    "demand_roll_24h_mean",
    "demand_roll_7d_mean",
]

SOLAR_FEATURES = [
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "month",
    "temp_c",
    "humidity_pct",
    "cloud_cover_pct",
    "ghi_wm2",
    "clearsky_ghi_wm2",
    "wind_speed_ms",
    "nso_solar_forecast_mw",  # official estimate as strong prior when available at train
    "solar_est_lag_1h",
    "solar_est_lag_24h",
    "solar_scada_lag_1h",
]

# At inference, nso_solar_forecast_mw may be unavailable for future hours —
# keep a parallel feature set without it for live forecasting.
SOLAR_FEATURES_LIVE = [f for f in SOLAR_FEATURES if f != "nso_solar_forecast_mw"]

NETLOAD_FEATURES = [
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "doy_sin",
    "doy_cos",
    "month",
    "is_weekend",
    "is_poya",
    "is_new_year",
    "temp_c",
    "humidity_pct",
    "cloud_cover_pct",
    "ghi_wm2",
    "clearsky_ghi_wm2",
    "wind_speed_ms",
    "demand_lag_1h",
    "demand_lag_24h",
    "solar_est_lag_1h",
    "solar_est_lag_24h",
    "net_load_lag_1h",
    "net_load_lag_24h",
    "demand_roll_24h_mean",
]


def _xgb(**kwargs: Any) -> XGBRegressor:
    params = dict(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=4,
        objective="reg:squarederror",
        n_jobs=4,
        random_state=42,
    )
    params.update(kwargs)
    return XGBRegressor(**params)


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = float(
        np.mean(np.abs((y_true - y_pred) / np.clip(np.abs(y_true), 1.0, None))) * 100.0
    )
    return {
        "mae_mw": round(mae, 3),
        "rmse_mw": round(rmse, 3),
        "mape_pct": round(mape, 3),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
    }


def _time_split(frame: pd.DataFrame, test_days: int = 21) -> tuple[pd.DataFrame, pd.DataFrame]:
    ts = pd.to_datetime(frame["timestamp"])
    cutoff = ts.max() - pd.Timedelta(days=test_days)
    train = frame.loc[ts <= cutoff].copy()
    test = frame.loc[ts > cutoff].copy()
    return train, test


def _baseline_scores(test: pd.DataFrame, target: str) -> dict[str, dict[str, float]]:
    y = test[target].to_numpy(dtype=float)
    out: dict[str, dict[str, float]] = {}
    if f"{target.replace('_mw', '')}_lag_24h" in test.columns or target == "demand_mw":
        # persistence = same time yesterday
        col = "demand_lag_24h" if target == "demand_mw" else (
            "solar_est_lag_24h" if target == "nso_solar_forecast_mw" else "net_load_lag_24h"
        )
        if col in test.columns:
            mask = test[col].notna()
            if mask.any():
                out["persistence_24h"] = _metrics(
                    test.loc[mask, target].to_numpy(dtype=float),
                    test.loc[mask, col].to_numpy(dtype=float),
                )
    if target == "demand_mw" and "demand_lag_7d" in test.columns:
        mask = test["demand_lag_7d"].notna()
        if mask.any():
            out["seasonal_persistence_7d"] = _metrics(
                test.loc[mask, target].to_numpy(dtype=float),
                test.loc[mask, "demand_lag_7d"].to_numpy(dtype=float),
            )
    # naive mean baseline
    out["mean_baseline"] = _metrics(y, np.full_like(y, np.nanmean(y)))
    return out


def _train_one(
    frame: pd.DataFrame,
    *,
    name: str,
    target: str,
    features: list[str],
) -> dict[str, Any]:
    cols = ["timestamp", target, *features]
    data = frame[cols].copy()
    # Fill residual weather gaps; keep lag rows that exist after warmup.
    weather_fill = [
        c
        for c in features
        if c
        in {
            "temp_c",
            "humidity_pct",
            "cloud_cover_pct",
            "ghi_wm2",
            "clearsky_ghi_wm2",
            "wind_speed_ms",
        }
    ]
    for col in weather_fill:
        data[col] = data[col].ffill().bfill().fillna(0)
    data = data.dropna().copy()
    train, test = _time_split(data)
    if len(train) < 500 or len(test) < 100:
        raise RuntimeError(f"{name}: insufficient rows train={len(train)} test={len(test)}")

    model = _xgb()
    model.fit(train[features], train[target])
    pred = model.predict(test[features])
    metrics = {
        "model": name,
        "target": target,
        "features": features,
        "n_train": int(len(train)),
        "n_test": int(len(test)),
        "test_start": str(test["timestamp"].min()),
        "test_end": str(test["timestamp"].max()),
        "holdout": _metrics(test[target].to_numpy(dtype=float), pred),
        "baselines": _baseline_scores(test, target),
        "feature_importance": {
            f: round(float(v), 5)
            for f, v in sorted(
                zip(features, model.feature_importances_),
                key=lambda x: -x[1],
            )
        },
    }

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": features, "target": target}, MODELS_DIR / f"{name}.pkl")
    (MODELS_DIR / f"{name}_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    print(
        f"{name}: MAE={metrics['holdout']['mae_mw']} MW  "
        f"RMSE={metrics['holdout']['rmse_mw']} MW  "
        f"vs persistence={metrics['baselines'].get('persistence_24h', {}).get('mae_mw')}",
        flush=True,
    )
    return metrics


def train_all(*, rebuild_features: bool = False) -> dict[str, Any]:
    path = FS_DIR / "training_15min.parquet"
    if rebuild_features or not path.exists():
        frame = build_training_table(force_weather=rebuild_features)
    else:
        frame = pd.read_parquet(path)

    results = {
        "demand_xgb": _train_one(
            frame, name="demand_xgb", target="demand_mw", features=DEMAND_FEATURES
        ),
        "solar_xgb": _train_one(
            frame,
            name="solar_xgb",
            target="nso_solar_forecast_mw",
            features=SOLAR_FEATURES_LIVE,
        ),
        "netload_xgb": _train_one(
            frame, name="netload_xgb", target="net_load_mw", features=NETLOAD_FEATURES
        ),
    }

    # Distributed solar visibility index (archive-wide daytime)
    day = frame.loc[frame["nso_solar_forecast_mw"] > 50].copy()
    if len(day):
        vis = float((day["solar_mw"].sum() / day["nso_solar_forecast_mw"].sum()) * 100.0)
    else:
        vis = float("nan")
    summary = {
        "archive_rows": int(len(frame)),
        "archive_start": str(frame["timestamp"].min()),
        "archive_end": str(frame["timestamp"].max()),
        "distributed_solar_visibility_pct": round(vis, 2) if vis == vis else None,
        "models": {k: v["holdout"] for k, v in results.items()},
    }
    (MODELS_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)
    return summary


def load_nso_model(name: str) -> dict[str, Any]:
    path = MODELS_DIR / f"{name}.pkl"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run: python -m app.train_nso_models")
    return joblib.load(path)


def load_nso_metrics(name: str) -> dict[str, Any]:
    path = MODELS_DIR / f"{name}_metrics.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    train_all(rebuild_features=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
