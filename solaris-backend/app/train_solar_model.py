"""Train per-zone XGBoost solar irradiance regressors."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

from app.data_pipeline import fetch_and_cache_zone, load_cached_zone
from app.zones import ZONES

MODELS_DIR = Path(__file__).resolve().parent / "models"

FEATURE_COLS = [
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "clearsky_ghi",
    "cloud_amt",
    "temp",
    "humidity",
]
TARGET_COL = "ALLSKY_SFC_SW_DWN"


def add_cyclical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add sin/cos encodings for hour-of-day and day-of-year."""
    out = df.copy()
    ts = out.index
    if ts.tz is None:
        # Treat naive timestamps as UTC for feature extraction
        hours = ts.hour + ts.minute / 60.0
        doy = ts.dayofyear.astype(float)
    else:
        local = ts.tz_convert("Asia/Colombo")
        hours = local.hour + local.minute / 60.0
        doy = local.dayofyear.astype(float)

    out["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
    out["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    return out


def prepare_training_frame(raw: pd.DataFrame) -> pd.DataFrame:
    """Map NASA POWER columns to model features and drop incomplete rows."""
    df = raw.copy()
    rename = {
        "CLRSKY_SFC_SW_DWN": "clearsky_ghi",
        "CLOUD_AMT": "cloud_amt",
        "T2M": "temp",
        "RH2M": "humidity",
    }
    df = df.rename(columns=rename)
    needed = list(rename.values()) + [TARGET_COL]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in NASA POWER data: {missing}")

    df = add_cyclical_features(df)
    df = df[FEATURE_COLS + [TARGET_COL]].dropna()
    # Night / invalid irradiance can be negative in some POWER products — clip
    df[TARGET_COL] = df[TARGET_COL].clip(lower=0)
    df["clearsky_ghi"] = df["clearsky_ghi"].clip(lower=0)
    return df


def model_path(zone: str) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR / f"{zone}_solar.pkl"


def quantile_model_path(zone: str, q: int) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR / f"{zone}_solar_q{q}.pkl"


def metrics_path(zone: str) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR / f"{zone}_metrics.json"


def feature_importance_path(zone: str) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR / f"{zone}_feature_importance.json"


def rolling_backtest_path(zone: str) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    return MODELS_DIR / f"{zone}_rolling_mae.json"


def train_zone_model(
    zone: str,
    *,
    test_size: float = 0.2,
    random_state: int = 42,
    fetch_if_missing: bool = True,
) -> dict:
    """
    Train point + quantile (10/50/90) XGBoost models; persist metrics,
    feature importances, and a 14-day rolling MAE series.
    """
    if zone not in ZONES:
        raise ValueError(f"Unknown zone '{zone}'. Choose from {sorted(ZONES)}")

    raw = load_cached_zone(zone)
    if raw is None:
        if not fetch_if_missing:
            raise FileNotFoundError(
                f"No cached NASA POWER data for {zone}. Run data_pipeline first."
            )
        info = ZONES[zone]
        raw = fetch_and_cache_zone(zone, info["lat"], info["lon"])

    df = prepare_training_frame(raw)
    X = df[FEATURE_COLS]
    y = df[TARGET_COL]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, shuffle=True
    )

    model = XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
    mae = float(mean_absolute_error(y_test, preds))

    joblib.dump({"model": model, "features": FEATURE_COLS}, model_path(zone))

    # Quantile regressors (XGBoost quantile objective)
    quantile_models = {}
    for q_alpha, q_tag in [(0.1, 10), (0.5, 50), (0.9, 90)]:
        q_model = XGBRegressor(
            n_estimators=250,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:quantileerror",
            quantile_alpha=q_alpha,
            random_state=random_state,
            n_jobs=-1,
        )
        q_model.fit(X_train, y_train)
        joblib.dump(
            {"model": q_model, "features": FEATURE_COLS, "quantile": q_alpha},
            quantile_model_path(zone, q_tag),
        )
        quantile_models[q_tag] = q_model

    importances = {
        feat: float(imp)
        for feat, imp in sorted(
            zip(FEATURE_COLS, model.feature_importances_),
            key=lambda x: -x[1],
        )
    }
    feature_importance_path(zone).write_text(
        json.dumps(
            {
                "zone": zone,
                "top": [
                    {"feature": f, "importance": round(v, 5)}
                    for f, v in list(importances.items())[:5]
                ],
                "all": {k: round(v, 5) for k, v in importances.items()},
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Rolling 14-day MAE on chronological holdout (last 14*24 hours of series)
    rolling = _rolling_mae_series(df, model, days=14)
    rolling_backtest_path(zone).write_text(
        json.dumps({"zone": zone, "unit": "W/m^2", "days": rolling}, indent=2),
        encoding="utf-8",
    )

    metrics = {
        "zone": zone,
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "target": TARGET_COL,
        "unit": "W/m^2",
        "quantiles_trained": [10, 50, 90],
    }
    metrics_path(zone).write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(
        f"[{zone}] holdout RMSE={metrics['rmse']:.3f}  MAE={metrics['mae']:.3f}  "
        f"(n_test={metrics['n_test']}; quantiles+importance saved)"
    )
    return metrics


def _rolling_mae_series(df: pd.DataFrame, model, days: int = 14) -> list[dict]:
    """Compute daily MAE for the last `days` days using the trained model."""
    X = df[FEATURE_COLS]
    y = df[TARGET_COL]
    pred = pd.Series(model.predict(X), index=df.index)
    err = (pred - y).abs()
    local_idx = (
        err.index.tz_convert("Asia/Colombo")
        if err.index.tz is not None
        else err.index
    )
    daily = err.groupby(local_idx.date).mean().dropna()
    tail = daily.tail(days)
    return [
        {"date": d.isoformat() if hasattr(d, "isoformat") else str(d), "mae": round(float(v), 3)}
        for d, v in tail.items()
    ]


def load_metrics(zone: str) -> dict:
    path = metrics_path(zone)
    if not path.exists():
        raise FileNotFoundError(
            f"No backtest metrics for '{zone}'. Train the model first "
            f"(python -m app.train_solar_model)."
        )
    metrics = json.loads(path.read_text(encoding="utf-8"))
    # Attach rolling + importance when present
    rp = rolling_backtest_path(zone)
    fp = feature_importance_path(zone)
    if rp.exists():
        metrics["rolling_mae"] = json.loads(rp.read_text(encoding="utf-8")).get("days", [])
    if fp.exists():
        metrics["feature_importance"] = json.loads(fp.read_text(encoding="utf-8")).get(
            "top", []
        )
    return metrics


def load_model(zone: str):
    path = model_path(zone)
    if not path.exists():
        raise FileNotFoundError(
            f"No trained model for '{zone}' at {path}. "
            f"Run: python -m app.train_solar_model"
        )
    return joblib.load(path)


def load_quantile_models(zone: str) -> dict[int, object]:
    out = {}
    for q in (10, 50, 90):
        path = quantile_model_path(zone, q)
        if not path.exists():
            raise FileNotFoundError(
                f"No quantile model q{q} for '{zone}'. Re-run training."
            )
        out[q] = joblib.load(path)["model"]
    return out


if __name__ == "__main__":
    for zone_name in ZONES:
        train_zone_model(zone_name)
