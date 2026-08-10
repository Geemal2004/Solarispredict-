"""
Merit-order dispatch advisory for forecasted net-load dips.

Advisory only — not connected to CEB's actual dispatch system.
Outputs concrete plant-level schedule lines (MW + time), not generic must-run prose.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.forecast import forecast_netload, forecast_solar_quantiles
from app.zones import ZONES, risk_threshold_mw

PLANTS_PATH = Path(__file__).resolve().parent / "data" / "plants.json"
MODELS_DIR = Path(__file__).resolve().parent / "models" / "nso"

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


def _hydro_plants(plants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [p for p in plants if p["type"] == "hydro"],
        key=lambda p: -p["capacity_mw"],
    )


def _short_name(name: str) -> str:
    return name.split(" (")[0].strip()


def _fmt_time(ts: str | None) -> str:
    if not ts or len(ts) < 16:
        return "—"
    return ts[11:16]


def _evening_ramp(points: list[dict[str, Any]]) -> float | None:
    evening = [
        p
        for p in points
        if 17 <= int(p["timestamp"][11:13]) <= 21
    ]
    if len(evening) < 2:
        return None
    demand = [float(p["demand_mw"]) for p in evening]
    return round(max(demand) - min(demand), 1)


def _min_net_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not points:
        return None
    return min(points, key=lambda p: float(p["net_load_mw"]))


def _solar_peak_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not points:
        return None
    return max(points, key=lambda p: float(p.get("solar_mw", 0)))


def _model_confidence() -> float:
    confidence = 0.85
    summary_path = MODELS_DIR / "summary.json"
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        net_mae = summary.get("models", {}).get("netload_xgb", {}).get("mae_mw", 57)
        confidence = float(max(0.65, min(0.95, 1.0 - net_mae / 200.0)))
    return confidence


def _confidence_from_quantiles(zone: str, hours: int) -> float:
    confidence = 0.78
    try:
        q = forecast_solar_quantiles(zone, hours=hours)
        widths = [
            max(0.0, p["p90_mw"] - p["p10_mw"]) for p in q["points"][:24]
        ]
        avg_w = sum(widths) / len(widths) if widths else 50.0
        confidence = float(max(0.55, min(0.95, 1.0 - avg_w / 200.0)))
    except FileNotFoundError:
        pass
    return confidence


def _concrete_schedule(
    points: list[dict[str, Any]],
    threshold: float,
    confidence: float,
    plants: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Plant-level schedule lines derived from forecast net-load shape."""
    window = points[:96] if len(points) > 96 else points
    oil = _oil_plants(plants)
    coal = _coal_plants(plants)
    hydro = _hydro_plants(plants)

    risk_points = [
        p
        for p in window
        if p.get("hosting_risk")
        or p.get("curtailment_risk")
        or float(p["net_load_mw"]) < threshold * 0.92
    ]
    min_net = _min_net_point(window)
    solar_peak = _solar_peak_point(window)
    dip_time = _fmt_time(min_net["timestamp"] if min_net else None)
    solar_time = _fmt_time(solar_peak["timestamp"] if solar_peak else None)
    ramp = _evening_ramp(window)
    hydro_mwh = 150 if (ramp or 0) > 500 else 120 if (ramp or 0) > 350 else 90

    actions: list[dict[str, Any]] = []

    if risk_points:
        first = risk_points[0]
        at_time = _fmt_time(first["timestamp"])
        dip_mw = max(40.0, threshold - float(first["net_load_mw"]))
        remaining = dip_mw
        for p in oil[:3]:
            cut = min(p["capacity_mw"] * 0.35, remaining)
            if cut < 5:
                continue
            cut_r = int(round(cut))
            actions.append(
                {
                    "plant": p["name"],
                    "action": "reduce",
                    "mw": float(cut_r),
                    "at_time": at_time,
                    "schedule_line": f"−{cut_r} MW at {at_time}",
                    "confidence": round(min(0.95, confidence + 0.08), 2),
                }
            )
            remaining -= cut
        if len(oil) > 1 and remaining > 0:
            standby = oil[1]
            actions.append(
                {
                    "plant": standby["name"],
                    "action": "standby",
                    "mw": None,
                    "at_time": at_time,
                    "schedule_line": f"Standby reserve from {at_time}",
                    "confidence": round(confidence, 2),
                }
            )
    else:
        ker = next((p for p in oil if "Kerawalapitiya" in p["name"]), oil[0] if oil else None)
        sap = next((p for p in oil if "Sapugaskanda" in p["name"]), oil[1] if len(oil) > 1 else None)
        if ker:
            actions.append(
                {
                    "plant": ker["name"],
                    "action": "spinning_reserve",
                    "mw": None,
                    "at_time": solar_time,
                    "schedule_line": f"Spinning reserve until {solar_time}",
                    "confidence": round(confidence, 2),
                }
            )
        if sap:
            actions.append(
                {
                    "plant": sap["name"],
                    "action": "standby",
                    "mw": None,
                    "at_time": dip_time,
                    "schedule_line": f"Standby reserve from {dip_time}",
                    "confidence": round(confidence, 2),
                }
            )

    if coal:
        c = coal[0]
        min_mw = int(round(c["capacity_mw"] * TYPE_META["coal"]["min_stable_frac"]))
        actions.append(
            {
                "plant": c["name"],
                "action": "hold_min_stable",
                "mw": float(min_mw),
                "at_time": None,
                "schedule_line": f"Hold ~{min_mw} MW min stable",
                "confidence": round(min(0.95, confidence + 0.1), 2),
            }
        )

    if hydro:
        lead = hydro[0]
        actions.append(
            {
                "plant": lead["name"],
                "action": "conserve_for_tou",
                "mw": float(hydro_mwh),
                "at_time": "17:30",
                "schedule_line": f"Preserve ~{hydro_mwh} MWh for 18:30 TOU",
                "confidence": round(min(0.95, confidence + 0.05), 2),
            }
        )

    kel = next((p for p in oil if "Kelanitissa" in p["name"]), None)
    if kel:
        actions.append(
            {
                "plant": kel["name"],
                "action": "reserve",
                "mw": None,
                "at_time": "17:30",
                "schedule_line": "Fast reserve online at 17:30",
                "confidence": round(confidence, 2),
            }
        )

    if risk_points and min_net and float(min_net["net_load_mw"]) < threshold:
        actions.append(
            {
                "plant": "Solar / wind fleet",
                "action": "must_run_no_curtail",
                "mw": None,
                "at_time": dip_time,
                "schedule_line": f"Must-run — no curtailment through {dip_time}",
                "confidence": round(min(0.95, confidence + 0.12), 2),
            }
        )

    return actions[:6]


def _schedule_text(actions: list[dict[str, Any]]) -> str:
    return ". ".join(
        f"{_short_name(a['plant'])} {a['schedule_line']}" for a in actions
    ) + "."


def build_national_dispatch_schedule(hours: int = 168) -> dict[str, Any]:
    from app.nso_forecast import forecast_national

    fc = forecast_national(hours=hours)
    plants = _load_plants()
    points = fc["points"]
    threshold = float(fc["risk_threshold_mw"])
    confidence = _model_confidence()
    actions = _concrete_schedule(points, threshold, confidence, plants)

    daily = fc.get("daily") or [{}]
    d0 = daily[0] if daily else {}

    return {
        "scope": "national",
        "hours": hours,
        "confidence_pct": int(round(confidence * 100)),
        "schedule": [
            {
                "plant": _short_name(a["plant"]),
                "action": a["schedule_line"],
                "confidence": a["confidence"],
            }
            for a in actions
        ],
        "context": {
            "min_net_load_mw": d0.get("min_net_load_mw"),
            "evening_ramp_mw": d0.get("evening_ramp_mw"),
        },
        "methodology": (
            "Concrete merit-order schedule from national NSO-anchored net-load forecast — "
            "estimated commitments with plant, MW, and time; not live SCADA dispatch orders."
        ),
    }


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
    confidence = _confidence_from_quantiles(zone, hours)
    points = net["points"]
    ramp = net.get("evening_ramp_mw")

    risk_points = [
        p for p in points if p.get("hosting_risk") or p.get("curtailment_risk")
    ]
    actions = _concrete_schedule(points, threshold, confidence, plants)
    recommendations: list[dict[str, Any]] = []

    severity = "net_load_risk" if risk_points else "normal"
    anchor_ts = (
        risk_points[0]["timestamp"]
        if risk_points
        else (points[0]["timestamp"] if points else None)
    )

    recommendations.append(
        {
            "timestamp": anchor_ts,
            "severity": severity,
            "confidence": round(
                min(0.95, confidence + 0.05) if risk_points else confidence, 2
            ),
            "plants": [_short_name(a["plant"]) for a in actions],
            "actions": actions,
            "text": _schedule_text(actions),
        }
    )

    if len(risk_points) > 6:
        mid = risk_points[len(risk_points) // 2]
        mid_time = _fmt_time(mid["timestamp"])
        oil = _oil_plants(plants)
        hydro = _hydro_plants(plants)
        lead_oil = oil[0]["name"] if oil else "Kerawalapitiya"
        sustain_actions = [
            {
                "plant": lead_oil,
                "action": "keep_reduced",
                "mw": None,
                "at_time": mid_time,
                "schedule_line": f"Keep reduced through {mid_time}",
                "confidence": round(confidence, 2),
            },
            {
                "plant": hydro[0]["name"] if hydro else "Victoria",
                "action": "conserve_for_tou",
                "mw": None,
                "at_time": "18:30",
                "schedule_line": "Hold discharge until 18:30 TOU",
                "confidence": round(confidence, 2),
            },
        ]
        recommendations.append(
            {
                "timestamp": mid["timestamp"],
                "severity": "sustained_dip",
                "confidence": round(confidence, 2),
                "plants": [_short_name(a["plant"]) for a in sustain_actions],
                "actions": sustain_actions,
                "text": _schedule_text(sustain_actions),
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
            "Concrete merit-order schedule from zone net-load forecast — plant, MW, "
            "and time per action. Not connected to CEB's actual dispatch system."
        ),
        "recommendations": recommendations,
    }
