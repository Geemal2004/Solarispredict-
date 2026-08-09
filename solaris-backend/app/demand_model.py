"""
Rule-based Sri Lanka load-curve generator.

Illustrative / calendar-pattern-based — not live CEB telemetry.
Patterns inspired by published Sri Lankan demand studies
(e.g. Abeysingha et al. 2021): weekday vs weekend, Poya days,
and the mid-April New Year surge.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Sequence, Union

import numpy as np
import pandas as pd

from app.zones import ZONES

# Official / commonly published Sri Lanka Poya (full-moon) observances for 2026.
POYA_DATES_2026: list[date] = [
    date(2026, 1, 13),   # Duruthu
    date(2026, 2, 11),   # Navam
    date(2026, 3, 13),   # Medin
    date(2026, 4, 12),   # Bak
    date(2026, 5, 11),   # Vesak
    date(2026, 6, 10),   # Poson
    date(2026, 7, 9),    # Esala
    date(2026, 8, 8),    # Nikini
    date(2026, 9, 6),    # Binara
    date(2026, 10, 6),   # Vap
    date(2026, 11, 4),   # Il
    date(2026, 12, 4),   # Unduvap
]

POYA_SET = set(POYA_DATES_2026)

# Multipliers from published SL demand pattern findings (illustrative magnitudes).
WEEKEND_MULT = 0.88
POYA_MULT = 0.82
NEW_YEAR_MULT = 1.18  # April 10–20 Avurudu period
WEEKDAY_MULT = 1.0


def is_poya_day(d: date) -> bool:
    return d in POYA_SET


def is_new_year_period(d: date) -> bool:
    """Sri Lankan New Year / Avurudu high-demand window: April 10–20."""
    return d.month == 4 and 10 <= d.day <= 20


def is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # Sat=5, Sun=6


def is_vesak_period(d: date) -> bool:
    """Vesak full-moon observance window (May Poya ±1 day for demand uplift)."""
    vesak = date(d.year, 5, 11) if d.year == 2026 else None
    if vesak is None:
        # Approximate: May Poya from hardcoded list
        may_poyas = [p for p in POYA_DATES_2026 if p.month == 5]
        vesak = may_poyas[0] if may_poyas else date(d.year, 5, 12)
    return abs((d - vesak).days) <= 1


def day_type_multiplier(d: date) -> float:
    """Compose calendar multipliers; Poya and New Year stack with weekend."""
    mult = WEEKDAY_MULT
    if is_weekend(d):
        mult *= WEEKEND_MULT
    if is_poya_day(d):
        mult *= POYA_MULT
    if is_new_year_period(d):
        mult *= NEW_YEAR_MULT
    if is_vesak_period(d) and not is_poya_day(d):
        mult *= 0.95  # mild Vesak-adjacent effect when not the Poya itself
    return mult


def _base_diurnal_fraction(hour_float: float) -> float:
    """
    Normalized Sri Lanka-style diurnal load shape in [~0.45, 1.0].

    - Low overnight
    - Morning ramp (~06:00–09:00)
    - Midday plateau with mild dip
    - Evening peak 18:30–22:30
    """
    h = hour_float % 24.0

    # Overnight base
    if h < 5.0:
        return 0.48 + 0.02 * np.sin(np.pi * h / 5.0)

    # Morning ramp 05:00–09:00
    if h < 9.0:
        t = (h - 5.0) / 4.0
        return 0.50 + 0.35 * (3 * t**2 - 2 * t**3)  # smoothstep → ~0.85

    # Late morning / midday 09:00–13:00
    if h < 13.0:
        return 0.85 - 0.06 * np.sin(np.pi * (h - 9.0) / 4.0)

    # Afternoon soft dip 13:00–17:00
    if h < 17.0:
        return 0.80 - 0.08 * np.sin(np.pi * (h - 13.0) / 4.0)

    # Pre-evening rise 17:00–18:30
    if h < 18.5:
        t = (h - 17.0) / 1.5
        return 0.78 + 0.14 * t

    # Evening peak 18:30–22:30
    if h < 22.5:
        # Peak near 20:30
        t = (h - 18.5) / 4.0
        return 0.92 + 0.08 * np.sin(np.pi * t)

    # Wind-down 22:30–24:00
    t = (h - 22.5) / 1.5
    return 0.92 - 0.40 * t


def generate_demand(
    timestamps: Sequence[Union[datetime, pd.Timestamp]],
    zone: str = "colombo",
) -> pd.DataFrame:
    """
    Generate rule-based demand (MW) for a sequence of timestamps.

    Returns DataFrame with columns:
      demand_mw, day_multiplier, is_weekend, is_poya, is_new_year
    """
    if zone not in ZONES:
        raise ValueError(f"Unknown zone '{zone}'. Choose from {sorted(ZONES)}")

    peak = ZONES[zone]["demand_peak_mw"]
    rows = []
    for ts in timestamps:
        t = pd.Timestamp(ts)
        if t.tzinfo is None:
            t = t.tz_localize("Asia/Colombo")
        else:
            t = t.tz_convert("Asia/Colombo")

        d = t.date()
        hour_float = t.hour + t.minute / 60.0 + t.second / 3600.0
        mult = day_type_multiplier(d)
        frac = float(_base_diurnal_fraction(hour_float))
        demand = peak * frac * mult

        rows.append(
            {
                "timestamp": t,
                "demand_mw": round(demand, 3),
                "day_multiplier": round(mult, 4),
                "is_weekend": is_weekend(d),
                "is_poya": is_poya_day(d),
                "is_new_year": is_new_year_period(d),
                "is_vesak": is_vesak_period(d),
            }
        )

    return pd.DataFrame(rows).set_index("timestamp")


def calendar_horizon(
    start: Union[datetime, pd.Timestamp, None] = None,
    hours: int = 48,
) -> dict:
    """Summarize calendar flags over the next horizon for UI chips."""
    if start is None:
        start = pd.Timestamp.now(tz="Asia/Colombo").floor("h")
    else:
        start = pd.Timestamp(start)
        if start.tzinfo is None:
            start = start.tz_localize("Asia/Colombo")
        else:
            start = start.tz_convert("Asia/Colombo")

    index = pd.date_range(start=start, periods=hours, freq="h")
    flags = {
        "weekend": False,
        "poya": False,
        "new_year": False,
        "vesak": False,
    }
    events = []
    seen_days: set[date] = set()
    for ts in index:
        d = ts.date()
        if is_weekend(d):
            flags["weekend"] = True
        if is_poya_day(d):
            flags["poya"] = True
        if is_new_year_period(d):
            flags["new_year"] = True
        if is_vesak_period(d):
            flags["vesak"] = True
        if d not in seen_days:
            seen_days.add(d)
            labels = []
            if is_weekend(d):
                labels.append("weekend")
            if is_poya_day(d):
                labels.append("poya")
            if is_new_year_period(d):
                labels.append("new_year")
            if is_vesak_period(d):
                labels.append("vesak")
            if labels:
                events.append({"date": d.isoformat(), "flags": labels})

    return {
        "hours": hours,
        "start": start.isoformat(),
        "active": flags,
        "events": events,
        "methodology": (
            "Calendar features inspired by Abeysingha et al. (ICIAFS 2021) — "
            "Poya, New Year, Vesak, weekday/weekend; not live CEB load"
        ),
    }


def generate_demand_horizon(
    start: Union[datetime, pd.Timestamp, None] = None,
    hours: int = 48,
    zone: str = "colombo",
    freq: str = "h",
) -> pd.DataFrame:
    """Generate demand for the next `hours` hours from `start` (default: now Colombo)."""
    if start is None:
        start = pd.Timestamp.now(tz="Asia/Colombo").floor("h")
    else:
        start = pd.Timestamp(start)
        if start.tzinfo is None:
            start = start.tz_localize("Asia/Colombo")
        else:
            start = start.tz_convert("Asia/Colombo")

    index = pd.date_range(start=start, periods=hours, freq=freq)
    return generate_demand(index, zone=zone)


if __name__ == "__main__":
    demo = generate_demand_horizon(hours=24, zone="colombo")
    print(demo.head(12).to_string())
    print("...")
    print(f"Poya dates 2026 ({len(POYA_DATES_2026)}): {[d.isoformat() for d in POYA_DATES_2026]}")
