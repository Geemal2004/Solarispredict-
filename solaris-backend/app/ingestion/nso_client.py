"""Public NSO / EDLCare Generation Summary API client.

The gensum JSON endpoints are publicly readable. Cloudflare returns 403 without
a browser-like User-Agent; cookies and OIDC login are not required.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import requests

BASE_URL = "https://edlcare.edl.lk/api/gensum"
DEFAULT_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/150.0.0.0 Safari/537.36"
    ),
    "Referer": "https://edlcare.edl.lk/gensum/details",
}

# Earliest day where load-curve returns data for the requested date
# (earlier query dates are clamped server-side to this day).
ARCHIVE_START = date(2026, 2, 10)

SOURCE_COLUMNS = (
    "Wind",
    "SPP Biomass",
    "Thermal-Oil",
    "Major Hydro",
    "Coal",
    "Solar",
    "SPP Minihydro",
)


class NSOClient:
    """Thin HTTP client for https://edlcare.edl.lk/api/gensum/*."""

    def __init__(
        self,
        *,
        base_url: str = BASE_URL,
        timeout: float = 45.0,
        session: requests.Session | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = self.session.get(url, params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def daily_energy_summary(self) -> list[dict[str, Any]]:
        """Rolling ~31-day daily energy mix (GWh)."""
        return self._get("daily-energy-summary")

    def daily_night_peak_power_summary(self) -> list[dict[str, Any]]:
        """Rolling ~31-day night-peak power (MW)."""
        return self._get("daily-night-peak-power-summary")

    def energy_data(self, day: date) -> list[dict[str, Any]]:
        """Daily energy by station group (GWh) for one day."""
        return self._get("energy-data", {"date": day.isoformat()})

    def load_curve(self, day: date) -> list[dict[str, Any]]:
        """15-minute generation by source (MW) for one day (~95 points)."""
        return self._get("load-curve", {"date": day.isoformat()})

    def solar_forecast(self, day: date) -> list[dict[str, Any]]:
        """15-minute NSO solar PV estimate for one day (~96 points)."""
        return self._get("solar-forecast", {"date": day.isoformat()})

    def reservoir_data(self, day: date) -> list[dict[str, Any]]:
        """Reservoir storage / rainfall snapshot for one day."""
        return self._get("reservoir-data", {"date": day.isoformat()})

    def peak_data(self, day: date) -> list[dict[str, Any]]:
        """Day peak / night peak / minimum demand for one day."""
        return self._get("peak-data", {"date": day.isoformat()})

    def night_peak_data(self, day: date) -> list[dict[str, Any]]:
        """Generation mix at night peak for one day."""
        return self._get("night-peak-data", {"date": day.isoformat()})

    def load_curve_station_groups(self, day: date) -> list[dict[str, Any]]:
        """Station-group metadata used by the load-curve chart."""
        return self._get("load-curve-station-groups", {"date": day.isoformat()})

    def fetch_day(self, day: date) -> dict[str, Any]:
        """Fetch all per-day gensum payloads for one calendar day."""
        return {
            "date": day.isoformat(),
            "energy_data": self.energy_data(day),
            "load_curve": self.load_curve(day),
            "solar_forecast": self.solar_forecast(day),
            "reservoir_data": self.reservoir_data(day),
            "peak_data": self.peak_data(day),
            "night_peak_data": self.night_peak_data(day),
            "load_curve_station_groups": self.load_curve_station_groups(day),
        }
