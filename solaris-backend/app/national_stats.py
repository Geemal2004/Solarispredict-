"""National live estimates, CEB Digest baseline, and sector demand split."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.forecast import forecast_netload, forecast_solar
from app.zones import ZONES

PLANTS_PATH = Path(__file__).resolve().parent / "data" / "plants.json"
CEB_DIGEST_PATH = Path(__file__).resolve().parent / "data" / "ceb_digest_2025.json"

SECTOR_SHARES = {
    "domestic": 0.316,
    "industrial": 0.296,
    "commercial": 0.233,
    "other": 0.155,
}
SECTOR_SOURCE = (
    "CEB Statistical Digest 2025 — sales by tariff "
    "(domestic 31.6%, industrial 29.6%, general purpose 23.3%, other 15.5%)"
)

# Scale zone demand models toward an indicative multi-zone aggregate (demo only).
NATIONAL_DEMAND_SCALE = 2.5


def load_ceb_baseline() -> dict[str, Any]:
    return json.loads(CEB_DIGEST_PATH.read_text(encoding="utf-8"))


def _rooftop_mw() -> float:
    return float(load_ceb_baseline().get("rooftop_solar_mw", 1935.0))


def _plant_capacity_by_type() -> dict[str, float]:
    plants = json.loads(PLANTS_PATH.read_text(encoding="utf-8"))
    acc: dict[str, float] = {"hydro": 0, "coal": 0, "oil": 0, "wind": 0, "solar": 0}
    for p in plants:
        acc[p["type"]] = acc.get(p["type"], 0) + float(p["capacity_mw"])
    acc["solar"] = acc.get("solar", 0) + _rooftop_mw()
    return acc


def generation_mix_reference() -> dict[str, Any]:
    caps = _plant_capacity_by_type()
    total = sum(caps.values()) or 1.0
    shares = {k: round(v / total, 4) for k, v in caps.items()}
    rooftop = _rooftop_mw()
    return {
        "basis": "installed_capacity_sample_fleet_plus_rooftop",
        "capacity_mw": {k: round(v, 1) for k, v in caps.items()},
        "shares": shares,
        "note": (
            f"Static reference ring from public plant list + ~{rooftop:.0f} MW "
            "rooftop (CEB Digest 2025) — not live CEB SCADA mix."
        ),
    }


def live_national_estimate() -> dict[str, Any]:
    """Zone estimated 'now' vs Digest national reference peaks."""
    ceb = load_ceb_baseline()
    rooftop_mw = float(ceb["rooftop_solar_mw"])

    zone_rows = []
    solar_now = 0.0
    demand_now = 0.0
    for zone in ZONES:
        solar = forecast_solar(zone, hours=1)
        net = forecast_netload(zone, hours=1)
        s = float(solar["points"][0]["solar_mw"]) if solar["points"] else 0.0
        d = float(net["points"][0]["demand_mw"]) if net["points"] else 0.0
        solar_now += s
        demand_now += d
        zone_rows.append(
            {
                "zone": zone,
                "solar_mw": round(s, 3),
                "demand_mw": round(d, 3),
                "net_load_mw": round(d - s, 3),
            }
        )

    demand_zone_scaled = demand_now * NATIONAL_DEMAND_SCALE
    zone_cap = sum(ZONES[z]["solar_capacity_mw"] for z in ZONES)
    cf = (solar_now / zone_cap) if zone_cap else 0.0
    rooftop_now = rooftop_mw * max(0.0, min(1.0, cf))
    solar_national = solar_now + rooftop_now
    net_zone_scaled = demand_zone_scaled - solar_national

    mix = generation_mix_reference()
    ref_non_solar = sum(v for k, v in mix["capacity_mw"].items() if k != "solar")
    live_solar_share = round(
        solar_national / (ref_non_solar + solar_national + 1e-6), 4
    )

    # Hosting / net-load risk: zone net below 15% of zone demand peak
    risk_mwh = 0.0
    for row in zone_rows:
        peak = ZONES[row["zone"]]["demand_peak_mw"]
        if row["net_load_mw"] < 0.15 * peak:
            risk_mwh += max(0.0, row["solar_mw"]) * 1.0

    sectors = {
        k: round(demand_zone_scaled * share, 2) for k, share in SECTOR_SHARES.items()
    }

    return {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "estimated": True,
        "zone_estimated": {
            "solar_mw_now": round(solar_national, 2),
            "demand_mw_now": round(demand_zone_scaled, 2),
            "net_load_mw_now": round(net_zone_scaled, 2),
            "note": (
                "Weather-driven zone models scaled for demo — NOT CEB national peaks. "
                f"Compare to Digest night max ~{ceb['night_max_demand_mw']} MW."
            ),
        },
        # Back-compat keys used by LiveStatCards
        "solar_mw_now": round(solar_national, 2),
        "demand_mw_now": round(demand_zone_scaled, 2),
        "net_load_mw_now": round(net_zone_scaled, 2),
        "national_digest_reference": {
            "night_max_demand_mw": ceb["night_max_demand_mw"],
            "day_max_demand_mw": ceb["day_max_demand_mw"],
            "installed_capacity_mw": ceb["installed_capacity_mw"],
            "rooftop_solar_mw": rooftop_mw,
            "renewable_share_pct": ceb["renewable_share_pct"],
        },
        "zone_breakdown": zone_rows,
        "generation_mix_reference": mix,
        "generation_mix_live_solar_share": live_solar_share,
        "sector_demand_mw": sectors,
        "sector_shares": SECTOR_SHARES,
        "sector_source": SECTOR_SOURCE,
        "avoidable_curtailment": {
            "mwh_next_hour": round(risk_mwh, 2),
            "rs_million_illustrative": round(risk_mwh * 22.0 / 1000.0, 2),
            "note": (
                "Illustrative hosting/net-load risk energy this hour — "
                "not a published CEB curtailment GWh figure"
            ),
        },
        "labels": {
            "footer": "Estimated from live weather + published patterns — not CEB SCADA"
        },
    }
