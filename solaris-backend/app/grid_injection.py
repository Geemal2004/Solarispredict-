"""
Modeled substation net injection and heuristic line-flow direction.

Generation: sum plant dispatch estimates within PLANT_RADIUS_KM of each node.
Demand: national forecast demand allocated by node type + load-center population weights.
Flow: net-exporter → net-importer on each edge (not a power-flow solve).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from app.nso_forecast import forecast_national

DATA_DIR = Path(__file__).resolve().parent / "data"
NETWORK_PATH = DATA_DIR / "transmission_network.json"
PLANTS_PATH = DATA_DIR / "plants.json"

PLANT_RADIUS_KM = 15.0

# Relative demand share by substation role (documented heuristic weights).
TYPE_DEMAND_WEIGHT: dict[str, float] = {
    "load_center": 1.0,
    "junction": 0.35,
    "thermal_source": 0.25,
    "hydro_source": 0.15,
}

# Extra population weight for named load centers (Colombo west gets largest share).
LOAD_CENTER_POP_WEIGHT: dict[str, float] = {
    "Biyagama": 3.0,
    "Kelaniya": 2.2,
    "Aturugiriya": 1.4,
    "Hambantota": 0.55,
    "Vavuniya": 0.5,
    "New Anuradhapura": 0.7,
    "Kilinochchi": 0.4,
    "Valachchanai": 0.35,
}

MAP_CAPTION = (
    "Node balance modeled from plant dispatch estimates and population-weighted "
    "demand allocation. Line direction is a simplified heuristic (net-exporter to "
    "net-importer) — not a solved power flow; does not account for impedance or "
    "loop effects. Topology sourced from CEB's published Transmission Network Map "
    "and public planning documents."
)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def _load_network() -> dict[str, Any]:
    return json.loads(NETWORK_PATH.read_text(encoding="utf-8"))


def _load_plants() -> list[dict[str, Any]]:
    return json.loads(PLANTS_PATH.read_text(encoding="utf-8"))


def _estimate_plant_outputs(point: dict[str, Any], plants: list[dict[str, Any]]) -> dict[str, float]:
    """Merit-order-style plant MW — mirrors frontend estimatePlantOutputs."""
    out: dict[str, float] = {}
    by_type: dict[str, list[dict[str, Any]]] = {}
    for p in plants:
        by_type.setdefault(p["type"], []).append(p)

    def cap(t: str) -> float:
        return sum(p["capacity_mw"] for p in by_type.get(t, [])) or 1.0

    solar_cap = cap("solar")
    solar_intensity = min(1.15, max(0.0, float(point.get("solar_mw", 0)) / solar_cap))
    for p in by_type.get("solar", []):
        out[p["name"]] = p["capacity_mw"] * solar_intensity

    cloud = float(point.get("cloud_cover_pct") or 45)
    ghi = float(point.get("ghi_wm2") or 0)
    wind_factor = min(0.95, max(0.12, 0.35 + (1 - cloud / 100) * 0.45 + ghi / 2500))
    for p in by_type.get("wind", []):
        out[p["name"]] = p["capacity_mw"] * wind_factor

    tou = bool(point.get("tou_peak"))
    hydro_factor = 0.88 if tou else (0.42 if solar_intensity > 0.55 else 0.62)
    for p in by_type.get("hydro", []):
        out[p["name"]] = p["capacity_mw"] * hydro_factor

    coal_factor = 0.78 if solar_intensity > 0.6 else 0.92
    for p in by_type.get("coal", []):
        out[p["name"]] = p["capacity_mw"] * coal_factor

    hosting = bool(point.get("hosting_risk"))
    demand = float(point.get("demand_mw", 0))
    net_load = float(point.get("net_load_mw", 0))
    oil_factor = 0.55
    if hosting:
        oil_factor = 0.22
    elif tou:
        oil_factor = 0.72
    elif solar_intensity > 0.5:
        oil_factor = 0.28
    elif demand > 0 and net_load > demand * 0.85:
        oil_factor = 0.68
    for p in by_type.get("oil", []):
        out[p["name"]] = p["capacity_mw"] * oil_factor

    for p in plants:
        out.setdefault(p["name"], p["capacity_mw"] * 0.55)
    return out


def _demand_weight(node: dict[str, Any]) -> float:
    base = TYPE_DEMAND_WEIGHT.get(node["type"], 0.3)
    if node["type"] == "load_center":
        base *= LOAD_CENTER_POP_WEIGHT.get(node["name"], 0.6)
    return base


def _allocate_demand(
    substations: list[dict[str, Any]], national_demand_mw: float
) -> dict[str, float]:
    weights = {n["name"]: _demand_weight(n) for n in substations}
    total = sum(weights.values()) or 1.0
    return {
        name: national_demand_mw * w / total for name, w in weights.items()
    }


def _generation_at_nodes(
    substations: list[dict[str, Any]],
    plant_mw: dict[str, float],
    plants: list[dict[str, Any]],
) -> dict[str, float]:
    gen: dict[str, float] = {n["name"]: 0.0 for n in substations}
    for node in substations:
        for plant in plants:
            if _haversine_km(node["lat"], node["lon"], plant["lat"], plant["lon"]) <= PLANT_RADIUS_KM:
                gen[node["name"]] += plant_mw.get(plant["name"], 0.0)
    return gen


def _edge_flow(
    from_name: str,
    to_name: str,
    net_by_node: dict[str, float],
) -> dict[str, Any]:
    net_a = net_by_node.get(from_name, 0.0)
    net_b = net_by_node.get(to_name, 0.0)
    flow_dir: dict[str, str] | None = None
    magnitude = 0.0

    if net_a > 0.5 and net_b < -0.5:
        flow_dir = {"from": from_name, "to": to_name}
        magnitude = min(net_a, abs(net_b))
    elif net_b > 0.5 and net_a < -0.5:
        flow_dir = {"from": to_name, "to": from_name}
        magnitude = min(net_b, abs(net_a))
    elif abs(net_a) > abs(net_b) and net_a > 0.5:
        flow_dir = {"from": from_name, "to": to_name}
        magnitude = min(abs(net_a), max(abs(net_b), 1.0))
    elif abs(net_b) > abs(net_a) and net_b > 0.5:
        flow_dir = {"from": to_name, "to": from_name}
        magnitude = min(abs(net_b), max(abs(net_a), 1.0))

    return {
        "flow_direction": flow_dir,
        "flow_magnitude_estimate": round(magnitude, 1),
    }


def build_grid_network(hours: int = 168, point_index: int = 0) -> dict[str, Any]:
    network = _load_network()
    substations = network["substations"]
    plants = _load_plants()

    forecast = forecast_national(hours=hours)
    points = forecast.get("points") or []
    if not points:
        raise ValueError("National forecast has no points")
    idx = max(0, min(point_index, len(points) - 1))
    point = points[idx]

    national_demand = float(point["demand_mw"])
    plant_mw = _estimate_plant_outputs(point, plants)
    demand_by_node = _allocate_demand(substations, national_demand)
    gen_by_node = _generation_at_nodes(substations, plant_mw, plants)

    nodes_out: list[dict[str, Any]] = []
    net_by_node: dict[str, float] = {}
    for node in substations:
        name = node["name"]
        gen = round(gen_by_node.get(name, 0.0), 1)
        dem = round(demand_by_node.get(name, 0.0), 1)
        net = round(gen - dem, 1)
        net_by_node[name] = net
        nodes_out.append(
            {
                **node,
                "generation_mw": gen,
                "demand_mw": dem,
                "net_injection_mw": net,
                "role": "net_exporter" if net > 0.5 else "net_importer" if net < -0.5 else "balanced",
            }
        )

    edges_out: list[dict[str, Any]] = []
    for edge in network.get("edges", []):
        flow = _edge_flow(edge["from"], edge["to"], net_by_node)
        edges_out.append({**edge, **flow})

    return {
        "as_of": point["timestamp"],
        "national_demand_mw": round(national_demand, 1),
        "point_index": idx,
        "methodology": {
            "generation": f"Sum of merit-order plant estimates within {PLANT_RADIUS_KM:.0f} km (plants.json)",
            "demand": "National forecast demand × type weight × load-center population weight",
            "flow": "Heuristic net-exporter → net-importer; magnitude = min(|net|) when opposing",
            "not_physics": "No impedance, loop flow, or multi-line interaction",
        },
        "topology_source": network.get("disclaimer"),
        "ceb_map_url": network.get("ceb_transmission_map_url"),
        "edge_completion_note": network.get("edge_completion_note"),
        "map_caption": MAP_CAPTION,
        "nodes": nodes_out,
        "edges": edges_out,
    }
