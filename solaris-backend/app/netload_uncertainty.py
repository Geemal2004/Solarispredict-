"""Net-load P10/P50/P90 via bootstrap over NSO holdout forecast errors."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from app.nso_ops import _load_training, _model_predictions

HOLDOUT_DAYS = 21
N_BOOTSTRAP = 400


@lru_cache(maxsize=1)
def _holdout_residual_pool() -> pd.DataFrame:
    """Demand / solar / net forecast residuals on recent chronological holdout."""
    frame = _load_training().copy()
    cutoff = frame["timestamp"].max() - pd.Timedelta(days=HOLDOUT_DAYS)
    holdout = frame.loc[frame["timestamp"] > cutoff].copy()
    if holdout.empty:
        return pd.DataFrame(
            columns=["hour_bucket", "demand_err", "solar_err", "net_err", "cloud_cover_pct"]
        )

    predicted = _model_predictions(holdout)
    holdout["demand_err"] = holdout["demand_mw"] - predicted["fc_model_demand"]
    holdout["solar_err"] = (
        holdout["nso_solar_forecast_mw"] - predicted["fc_model_solar"]
    )
    holdout["net_err"] = holdout["net_load_mw"] - predicted["fc_model_net"]
    holdout["hour_bucket"] = holdout["hour"].astype(int)

    pool = holdout[
        ["hour_bucket", "demand_err", "solar_err", "net_err", "cloud_cover_pct"]
    ].dropna()
    return pool.reset_index(drop=True)


def _sample_pool(hour: int, cloud_pct: float, rng: np.random.Generator) -> pd.DataFrame:
    pool = _holdout_residual_pool()
    if pool.empty:
        return pool

    hour = int(hour) % 24
    mask = pool["hour_bucket"] == hour
    subset = pool.loc[mask]
    if len(subset) < 40:
        for delta in (1, 2, 3):
            mask = (pool["hour_bucket"] >= hour - delta) & (
                pool["hour_bucket"] <= hour + delta
            )
            subset = pool.loc[mask]
            if len(subset) >= 40:
                break
    if len(subset) < 40:
        subset = pool

    # Soft cloud filter: prefer similar weather when enough samples exist
    if cloud_pct == cloud_pct and len(subset) >= 80:
        cloud = subset["cloud_cover_pct"].astype(float)
        band = subset.loc[(cloud - cloud_pct).abs() <= 25.0]
        if len(band) >= 40:
            subset = band

    idx = rng.integers(0, len(subset), size=N_BOOTSTRAP)
    return subset.iloc[idx]


def netload_uncertainty(
    *,
    demand_mw: float,
    solar_mw: float,
    net_mw: float,
    hour: float,
    cloud_pct: float,
    threshold_mw: float,
    seed: int = 0,
) -> dict[str, float]:
    """
    Bootstrap net-load quantiles by resampling joint demand/solar holdout errors.

    net ≈ (demand + ε_d) − (solar + ε_s), blended with direct net-load error ε_n.
    """
    rng = np.random.default_rng(seed)
    sampled = _sample_pool(int(hour), cloud_pct, rng)

    if sampled.empty:
        band = 40.0 + 0.8 * float(cloud_pct or 50.0)
        p10 = net_mw - band
        p90 = net_mw + band
        return {
            "net_load_p10_mw": round(p10, 2),
            "net_load_p50_mw": round(net_mw, 2),
            "net_load_p90_mw": round(p90, 2),
            "prob_below_threshold_pct": round(
                100.0 if net_mw < threshold_mw else 0.0, 1
            ),
        }

    net_from_components = (demand_mw + sampled["demand_err"].to_numpy()) - (
        solar_mw + sampled["solar_err"].to_numpy()
    )
    net_from_direct = net_mw + sampled["net_err"].to_numpy()
    net_samples = 0.65 * net_from_components + 0.35 * net_from_direct

    p10, p50, p90 = np.percentile(net_samples, [10, 50, 90])
    prob_below = float(np.mean(net_samples < threshold_mw))

    return {
        "net_load_p10_mw": round(float(p10), 2),
        "net_load_p50_mw": round(float(p50), 2),
        "net_load_p90_mw": round(float(p90), 2),
        "prob_below_threshold_pct": round(prob_below * 100.0, 1),
    }


def uncertainty_meta() -> dict[str, Any]:
    pool = _holdout_residual_pool()
    return {
        "method": (
            "Bootstrap over NSO holdout forecast errors (demand + solar joint, "
            "net-error blend); P10/P50/P90 and P(net < threshold) from "
            f"{N_BOOTSTRAP} resamples"
        ),
        "holdout_days": HOLDOUT_DAYS,
        "n_bootstrap": N_BOOTSTRAP,
        "n_residuals": int(len(pool)),
    }
