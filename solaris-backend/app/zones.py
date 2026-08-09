"""Zone coordinates and metadata for SolarisPredict-SL."""

from typing import TypedDict


class ZoneInfo(TypedDict):
    lat: float
    lon: float
    # Assumed utility-scale PV capacity (MW) for irradiance→power conversion in demos.
    solar_capacity_mw: float
    # Illustrative peak demand scale (MW) for the rule-based load curve.
    demand_peak_mw: float


ZONES: dict[str, ZoneInfo] = {
    "hambantota": {
        "lat": 6.15,
        "lon": 81.15,
        "solar_capacity_mw": 120.0,  # Buruthakanda-scale dry-zone park
        "demand_peak_mw": 180.0,
    },
    "jaffna": {
        "lat": 9.66,
        "lon": 80.02,
        "solar_capacity_mw": 80.0,
        "demand_peak_mw": 150.0,
    },
    "colombo": {
        "lat": 6.93,
        "lon": 79.85,
        "solar_capacity_mw": 60.0,  # distributed / rooftop-heavy west coast
        "demand_peak_mw": 450.0,
    },
}

VALID_ZONES = set(ZONES.keys())

# Flag net-load / hosting risk when net load falls below this fraction of zone peak demand.
NETLOAD_RISK_FRAC = 0.15
# Legacy alias used by older call sites.
CURTAILMENT_THRESHOLD_MW = 50.0


def risk_threshold_mw(zone: str) -> float:
    """Zone-specific threshold = NETLOAD_RISK_FRAC × demand_peak_mw."""
    return float(ZONES[zone]["demand_peak_mw"]) * NETLOAD_RISK_FRAC
