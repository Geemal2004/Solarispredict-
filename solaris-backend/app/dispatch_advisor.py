"""
Merit-order dispatch advisory for forecasted net-load dips.

Advisory only — not connected to CEB's actual dispatch system.
Incorporates indicative marginal cost, must-run status, ramp flexibility,
coal minimum stable generation, and forecast confidence from solar bands.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.forecast import forecast_netload, forecast_solar_quantiles
from app.zones import ZONES, risk_threshold_mw

PLANTS_PATH = Path(__file__).resolve().parent / "data" / "plants.json"

# Indicative merit-order metadata (illustrative economics, not live bids).
TYPE_META: dict[str, dict[str, Any]] = {
    "hydro": {
        "marginal_cost_rank": 1,
        "must_run": True,
        "ramp": "fast",
        "role": "must-run / energy-limited",
    },
    "wind": {
        "marginal_cost_rank": 1,
        "must_run": True,
        "ramp": "variable",
        "role": "must-run renewable",
    },
    "solar": {
        "marginal_cost_rank": 1,
        "must_run": True,
        "ramp": "variable",
        "role": "must-run renewable",
    },
    "coal": {
        "marginal_cost_rank": 2,
        "must_run": False,
        "ramp": "slow",
        "min_stable_frac": 0.45,
        "role": "baseload",
    },
    "oil": {
        "marginal_cost_rank": 3,
        "must_run": False,
        "ramp": "fast",
        "role": "peaking / flexible thermal",
    },
}


def _load_plants() -> list[dict[str, Any]]:
    return json.loads(PLANTS_PATH.read_text(encoding="utf-8"))


def _oil_plants(plants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [p for p in plants if p["type"] == "oil"],
        key=lambda p: -p["capacity_mw"],
    )


def _coal_plants(plants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [p for p in plants if p["type"] == "coal"]


def build_dispatch_advisory(
    zone: str,
    hours: int = 48,
    threshold_mw: float | None = None,
) -> dict[str, Any]:
    if zone not in ZONES:
        raise ValueError(f"Unknown zone '{zone}'")

    threshold = float(threshold_mw) if threshold_mw is not None else risk_threshold_mw(zone)
    net = forecast_netload(zone, hours=hours, curtailment_threshold_mw=threshold)
    plants = _load_plants()
    oil = _oil_plants(plants)
    coal = _coal_plants(plants)

    # Optional quantile width → confidence (narrower band = higher confidence)
    confidence = 0.78
    try:
        q = forecast_solar_quantiles(zone, hours=hours)
        widths = []
        for p in q["points"][:24]:
            widths.append(max(0.0, p["p90_mw"] - p["p10_mw"]))
        avg_w = sum(widths) / len(widths) if widths else 50.0
        # Map width to confidence ~0.55–0.95
        confidence = float(max(0.55, min(0.95, 1.0 - avg_w / 200.0)))
    except FileNotFoundError:
        pass

    recommendations: list[dict[str, Any]] = []
    risk_points = [p for p in net["points"] if p.get("hosting_risk") or p.get("curtailment_risk")]
    ramp = net.get("evening_ramp_mw")

    if not risk_points:
        recommendations.append(
            {
                "timestamp": net["points"][0]["timestamp"] if net["points"] else None,
                "severity": "normal",
                "confidence": round(confidence, 2),
                "plants": [],
                "actions": [
                    {
                        "plant": "Hydro fleet",
                        "action": "conserve_for_tou",
                        "mw": None,
                        "confidence": round(confidence, 2),
                    }
                ],
                "text": (
                    f"Net load stays above the {threshold:.0f} MW hosting-risk threshold "
                    f"over the next {hours} h in {zone}. Hold hydro/RE as must-run; "
                    "keep oil on spinning reserve only; no solar curtailment indicated. "
                    "Conserve hydro energy for the CEB TOU peak window 18:30–22:30."
                ),
            }
        )
    else:
        first = risk_points[0]
        dip_mw = max(0.0, threshold - float(first["net_load_mw"]))
        oil_names = [p["name"] for p in oil[:3]]
        oil_cuts = []
        remaining = max(dip_mw, 40.0)
        for p in oil[:3]:
            cut = min(p["capacity_mw"] * 0.35, remaining)
            if cut < 5:
                continue
            oil_cuts.append((p["name"], round(cut, 1)))
            remaining -= cut

        cut_str = "; ".join(f"reduce {n} by ~{c} MW" for n, c in oil_cuts) or (
            "stand down flexible oil units"
        )
        coal_name = coal[0]["name"] if coal else "coal baseload"
        min_frac = TYPE_META["coal"]["min_stable_frac"]
        ramp_note = (
            f" Evening ramp from midday trough ≈ {ramp} MW — plan oil down 60–90 min ahead."
            if ramp is not None
            else ""
        )

        recommendations.append(
            {
                "timestamp": first["timestamp"],
                "severity": "hosting_risk",
                "confidence": round(min(0.95, confidence + 0.05), 2),
                "plants": oil_names + ([coal_name] if coal else []),
                "actions": [
                    {
                        "plant": n,
                        "action": "reduce",
                        "mw": c,
                        "confidence": round(min(0.95, confidence + 0.08), 2),
                    }
                    for n, c in oil_cuts
                ]
                + (
                    [
                        {
                            "plant": coal_name,
                            "action": "hold_min_stable",
                            "mw": round(coal[0]["capacity_mw"] * min_frac, 1),
                            "confidence": round(max(0.55, confidence - 0.05), 2),
                        }
                    ]
                    if coal
                    else []
                )
                + [
                    {
                        "plant": "Solar / wind",
                        "action": "must_run_no_curtail",
                        "mw": None,
                        "confidence": round(min(0.95, confidence + 0.1), 2),
                    },
                    {
                        "plant": "Hydro fleet",
                        "action": "conserve_for_tou",
                        "mw": None,
                        "confidence": round(confidence, 2),
                    },
                ],
                "text": (
                    f"Net load falls below {threshold:.0f} MW hosting-risk threshold around "
                    f"{first['timestamp']} (forecast {first['net_load_mw']} MW). "
                    f"{cut_str[0].upper() + cut_str[1:]}; "
                    f"hold {coal_name} at minimum stable load "
                    f"(~{int(min_frac * 100)}% — slow ramp). "
                    "Avoid solar curtailment if oil peaking can ramp down "
                    "60–90 minutes ahead of the dip. Conserve hydro for 18:30–22:30 TOU peak."
                    f"{ramp_note}"
                ),
            }
        )

        if len(risk_points) > 6:
            mid = risk_points[len(risk_points) // 2]
            recommendations.append(
                {
                    "timestamp": mid["timestamp"],
                    "severity": "sustained_dip",
                    "confidence": round(confidence, 2),
                    "plants": oil_names,
                    "actions": [
                        {
                            "plant": oil_names[0] if oil_names else "oil fleet",
                            "action": "keep_reduced",
                            "mw": None,
                            "confidence": round(confidence, 2),
                        }
                    ],
                    "text": (
                        f"Sustained low net load into {mid['timestamp']}. "
                        "Keep oil fleet reduced; avoid restarting peaking units until "
                        "evening ramp. Hydro: store water for 18:30–22:30 peak."
                    ),
                }
            )

    return {
        "zone": zone,
        "hours": hours,
        "threshold_mw": threshold,
        "any_risk": bool(risk_points),
        "evening_ramp_mw": ramp,
        "weather_regime": net.get("weather_regime"),
        "merit_order": [{"type": t, **meta} for t, meta in TYPE_META.items()],
        "methodology": (
            "Advisory logic based on published merit-order economics "
            "(hydro/RE must-run, coal baseload with min stable load, oil peaking) "
            "plus indicative ramp constraints — not connected to CEB's actual "
            "dispatch system."
        ),
        "recommendations": recommendations,
    }
