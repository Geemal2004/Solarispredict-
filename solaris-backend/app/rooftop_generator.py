"""
Illustrative rooftop solar point generator.

Weighted by provincial population shares; total capacity ≈ 1,935 MW
(CEB Statistical Digest 2025 rooftop aggregate).
Not individual GPS installations — synthetic sample for map visualization.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any

# Approximate 2024 provincial population shares (sum ≈ 1.0).
# Sources: DCS / census bulletins — rounded for demo use.
PROVINCE_POP_SHARE: dict[str, float] = {
    "Western Province": 0.28,
    "Central Province": 0.12,
    "Southern Province": 0.12,
    "Northern Province": 0.05,
    "Eastern Province": 0.08,
    "North Western Province": 0.12,
    "North Central Province": 0.07,
    "Uva Province": 0.06,
    "Sabaragamuwa Province": 0.10,
}

# CEB Statistical Digest 2025 — rooftop solar capacity.
TARGET_ROOFTOP_MW = 1935.0
DEFAULT_POINTS = 400
GEOJSON_PATH = Path(__file__).resolve().parent / "data" / "sri-lanka-provinces.geojson"


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    """Ray casting for a single exterior ring (lon, lat)."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def _point_in_polygon(lon: float, lat: float, geom: dict) -> bool:
    gtype = geom["type"]
    if gtype == "Polygon":
        rings = geom["coordinates"]
        if not _point_in_ring(lon, lat, rings[0]):
            return False
        for hole in rings[1:]:
            if _point_in_ring(lon, lat, hole):
                return False
        return True
    if gtype == "MultiPolygon":
        return any(
            _point_in_polygon(lon, lat, {"type": "Polygon", "coordinates": poly})
            for poly in geom["coordinates"]
        )
    return False


def _bbox(geom: dict) -> tuple[float, float, float, float]:
    coords: list[list[float]] = []

    def walk(c: Any) -> None:
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            coords.append([float(c[0]), float(c[1])])  # type: ignore[arg-type]
        elif isinstance(c, (list, tuple)):
            for item in c:
                walk(item)

    walk(geom["coordinates"])
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return min(lons), min(lats), max(lons), max(lats)


def _load_provinces() -> list[dict[str, Any]]:
    if not GEOJSON_PATH.exists():
        raise FileNotFoundError(
            f"Missing {GEOJSON_PATH}. Copy Sri Lanka ADM1 GeoJSON into app/data/."
        )
    data = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    features = []
    for feat in data["features"]:
        name = feat["properties"].get("shapeName") or feat["properties"].get("name")
        features.append({"name": name, "geometry": feat["geometry"]})
    return features


def _log_capacity_kw(rng: random.Random) -> float:
    """Log-distributed kW: mostly small residential, occasional commercial."""
    # log-uniform between 0.5 kW and 500 kW
    lo, hi = math.log(0.5), math.log(500.0)
    return math.exp(rng.uniform(lo, hi))


def generate_rooftop_sample(
    n_points: int = DEFAULT_POINTS,
    target_mw: float = TARGET_ROOFTOP_MW,
    seed: int = 42,
) -> dict[str, Any]:
    rng = random.Random(seed)
    provinces = _load_provinces()
    by_name = {p["name"]: p for p in provinces}

    # Allocate point counts by population share
    shares = []
    for name, share in PROVINCE_POP_SHARE.items():
        if name not in by_name:
            # fuzzy match
            match = next((p for p in provinces if name.split()[0] in p["name"]), None)
            if not match:
                continue
            by_name[name] = match
        shares.append((name, share))

    total_share = sum(s for _, s in shares) or 1.0
    alloc = []
    remaining = n_points
    for i, (name, share) in enumerate(shares):
        if i == len(shares) - 1:
            count = remaining
        else:
            count = max(1, round(n_points * (share / total_share)))
            remaining -= count
        alloc.append((name, count))

    raw_points: list[dict[str, Any]] = []
    for name, count in alloc:
        geom = by_name[name]["geometry"]
        min_lon, min_lat, max_lon, max_lat = _bbox(geom)
        placed = 0
        attempts = 0
        while placed < count and attempts < count * 80:
            attempts += 1
            lon = rng.uniform(min_lon, max_lon)
            lat = rng.uniform(min_lat, max_lat)
            if not _point_in_polygon(lon, lat, geom):
                continue
            kw = _log_capacity_kw(rng)
            raw_points.append(
                {
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "capacity_kw": round(kw, 2),
                    "province": name,
                }
            )
            placed += 1

    # Scale capacities so sum ≈ target_mw
    total_kw = sum(p["capacity_kw"] for p in raw_points) or 1.0
    scale = (target_mw * 1000.0) / total_kw
    for p in raw_points:
        p["capacity_kw"] = round(p["capacity_kw"] * scale, 2)

    return {
        "n_points": len(raw_points),
        "target_mw": target_mw,
        "total_mw": round(sum(p["capacity_kw"] for p in raw_points) / 1000.0, 2),
        "methodology": (
            "Illustrative distribution — modeled from provincial population "
            "density and the published national rooftop total (~1,935 MW, "
            "CEB Digest 2025), not individual GPS records."
        ),
        "points": raw_points,
    }


if __name__ == "__main__":
    sample = generate_rooftop_sample()
    print(f"points={sample['n_points']} total_mw={sample['total_mw']}")
