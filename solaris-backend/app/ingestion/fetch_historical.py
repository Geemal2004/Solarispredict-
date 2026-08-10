"""Backfill and incremental fetch of public NSO gensum data.

Examples:
  python -m app.ingestion.fetch_historical --start 2026-02-10 --end 2026-02-12
  python -m app.ingestion.fetch_historical --yesterday
  python -m app.ingestion.fetch_historical --start 2026-02-10 --end yesterday
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd

from app.ingestion.normalize import normalize_day_bundle
from app.ingestion.nso_client import ARCHIVE_START, NSOClient

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data" / "nso"
RAW_DIR = DATA_ROOT / "raw"
PROCESSED_DIR = DATA_ROOT / "processed"

TABLE_NAMES = (
    "generation_15min",
    "solar_forecast_15min",
    "peaks_daily",
    "energy_daily",
    "reservoir_daily",
    "night_peak_mix",
)


def _parse_day(value: str) -> date:
    if value.lower() in {"yesterday", "today"}:
        today = datetime.now(timezone.utc).astimezone().date()
        return today if value.lower() == "today" else today - timedelta(days=1)
    return date.fromisoformat(value)


def daterange(start: date, end: date) -> Iterable[date]:
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def raw_path(day: date) -> Path:
    return RAW_DIR / f"{day.isoformat()}.json"


def save_raw(day: date, payload: dict) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = raw_path(day)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_raw(day: date) -> dict | None:
    path = raw_path(day)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def append_processed(tables: dict[str, pd.DataFrame]) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for name, frame in tables.items():
        if frame is None or frame.empty:
            continue
        path = PROCESSED_DIR / f"{name}.parquet"
        if path.exists():
            existing = pd.read_parquet(path)
            merged = pd.concat([existing, frame], ignore_index=True)
            if "timestamp" in merged.columns:
                merged = merged.drop_duplicates(subset=["timestamp"], keep="last")
                merged = merged.sort_values("timestamp")
            elif {"date", "metric"}.issubset(merged.columns):
                merged = merged.drop_duplicates(subset=["date", "metric"], keep="last")
                merged = merged.sort_values(["date", "metric"])
            elif {"date", "station_group"}.issubset(merged.columns):
                merged = merged.drop_duplicates(
                    subset=["date", "station_group"], keep="last"
                )
                merged = merged.sort_values(["date", "station_group"])
            elif {"date", "reservoir"}.issubset(merged.columns):
                merged = merged.drop_duplicates(subset=["date", "reservoir"], keep="last")
                merged = merged.sort_values(["date", "reservoir"])
            else:
                merged = merged.drop_duplicates(keep="last")
            merged.to_parquet(path, index=False)
        else:
            frame.to_parquet(path, index=False)


def day_matches_request(bundle: dict, day: date) -> bool:
    """Detect server-side date clamping (pre-archive queries return archive start)."""
    curve = bundle.get("load_curve") or []
    if not curve:
        return False
    first = str(curve[0].get("DateTime") or "")[:10]
    return first == day.isoformat()


def fetch_one(
    client: NSOClient,
    day: date,
    *,
    force: bool = False,
    sleep_s: float = 0.35,
) -> dict[str, pd.DataFrame] | None:
    if day < ARCHIVE_START:
        print(f"skip {day}: before archive start {ARCHIVE_START}", flush=True)
        return None

    bundle = None if force else load_raw(day)
    if bundle is None:
        bundle = client.fetch_day(day)
        time.sleep(sleep_s)
        if not day_matches_request(bundle, day):
            print(
                f"skip {day}: API returned clamped series "
                f"(first={bundle.get('load_curve', [{}])[0].get('DateTime')})",
                flush=True,
            )
            return None
        save_raw(day, bundle)
        print(f"fetched {day}", flush=True)
    else:
        print(f"cached  {day}", flush=True)

    tables = normalize_day_bundle(bundle)
    append_processed(tables)
    return tables


def fetch_range(
    start: date,
    end: date,
    *,
    force: bool = False,
    sleep_s: float = 0.35,
) -> int:
    if start < ARCHIVE_START:
        start = ARCHIVE_START
    if end < start:
        raise ValueError(f"end {end} is before start {start}")

    client = NSOClient()
    ok = 0
    for day in daterange(start, end):
        try:
            tables = fetch_one(client, day, force=force, sleep_s=sleep_s)
            if tables is not None:
                ok += 1
        except Exception as exc:  # noqa: BLE001 - continue backfill on single-day failures
            print(f"ERROR {day}: {exc}", flush=True)
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill public NSO gensum JSON")
    parser.add_argument("--start", default=ARCHIVE_START.isoformat())
    parser.add_argument("--end", default="yesterday")
    parser.add_argument(
        "--yesterday",
        action="store_true",
        help="Fetch only yesterday (ignores --start/--end).",
    )
    parser.add_argument("--force", action="store_true", help="Refetch even if raw JSON exists")
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.35,
        help="Delay between HTTP day bundles (seconds)",
    )
    args = parser.parse_args(argv)

    if args.yesterday:
        start = end = _parse_day("yesterday")
    else:
        start = _parse_day(args.start)
        end = _parse_day(args.end)

    print(f"NSO backfill {start} -> {end} (archive start {ARCHIVE_START})", flush=True)
    count = fetch_range(start, end, force=args.force, sleep_s=args.sleep)
    print(f"done: {count} day(s) written under {DATA_ROOT}", flush=True)
    for name in TABLE_NAMES:
        path = PROCESSED_DIR / f"{name}.parquet"
        if path.exists():
            n = len(pd.read_parquet(path))
            print(f"  {name}: {n} rows", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
