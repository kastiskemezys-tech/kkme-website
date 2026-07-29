#!/usr/bin/env python3
"""
KKME — per-delivery-day reserve clearing-price backfill.

Phase 36.C, priority deliverable. Builds the evidence base for the reserve
realisation measurement (36.D candidate), which cannot run until there is a
per-day clearing-price series to measure against.

Why a new series rather than reusing `s2_btd_history`: that KV stores the
ROLLING 7-day mean stamped with the write date. It answers "what did the trend
look like on the day we wrote it", not "what cleared on delivery day D". For
realisation measurement only the latter is usable, and reinterpreting the old
series in place would silently change what a stored number means. So this
writes `s2_daily_clearing` via POST /s2/daily-clearing/import, and leaves
`s2_btd_history` alone.

Scope note: the Pause-A brief assumed only 2026-07-17→07-29 was recoverable,
"while BTD's export window covers them". That premise was checked and does not
hold — BTD serves complete PT15M days back to 2025-10-01 (2025-09-15 and earlier
return rows whose values are entirely null). The 12-day gap was never at risk,
and the same effort yields ~300 days instead. Default range starts 2025-10-01.

Usage (on the VPS):
    . /opt/kkme/config/.env ; export UPDATE_SECRET
    /opt/kkme/venv/bin/python3 scripts/vps/backfill_btd_daily.py [START] [END]

Idempotent — re-importing a date replaces it.
"""

import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

WORKER_URL = os.environ.get("KKME_API", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
UPDATE_SECRET = os.environ.get("UPDATE_SECRET")
BTD_API = "https://api-baltic.transparency-dashboard.eu/api/v1/export"

# First delivery day BTD serves real (non-null) values for. Verified 2026-07-29:
# 2025-09-15 → 0/2880 non-null; 2025-10-01 → 2880/2880.
DATA_START = date(2025, 10, 1)
CHUNK_DAYS = 10          # BTD rate-limits large ranges; the worker fetches monthly
TIMEOUT = 90
LT_FALLBACK_BASE = 10


def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def resolve_country_base(dataset, country="Lithuania"):
    groups = (dataset or {}).get("data", {}).get("header_groups")
    if isinstance(groups, list) and groups and isinstance(groups[0], list):
        for g in groups[0]:
            if str(g.get("label", "")).strip().lower() == country.lower():
                if isinstance(g.get("start"), int):
                    return g["start"]
    return LT_FALLBACK_BASE if country == "Lithuania" else None


def fetch_chunk(start, end, attempt=1):
    params = {
        "id": "price_procured_reserves",
        "start_date": f"{start}T00:00",
        "end_date": f"{end}T00:00",
        "output_time_zone": "UTC",
        "output_format": "json",
        "json_header_groups": 1,
    }
    try:
        res = requests.get(BTD_API, params=params, timeout=TIMEOUT)
        if res.status_code == 200:
            return res.json()
        log(f"  HTTP {res.status_code} for {start}..{end}")
    except (requests.RequestException, ValueError) as e:
        log(f"  fetch error {start}..{end}: {e}")
    if attempt < 3:
        time.sleep(3 * attempt)
        return fetch_chunk(start, end, attempt + 1)
    return None


def mean(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def days_from_chunk(dataset):
    """Collapse a chunk's per-ISP rows into per-delivery-day means (Lithuania)."""
    ts = (dataset or {}).get("data", {}).get("timeseries") or []
    base = resolve_country_base(dataset, "Lithuania")
    buckets = {}
    for row in ts:
        d = str(row.get("_from") or row.get("from") or "")[:10]
        if len(d) != 10:
            continue
        v = row.get("values") or []
        if len(v) < base + 5:
            continue
        b = buckets.setdefault(d, {"fcr": [], "afrr_up": [], "afrr_down": [],
                                   "mfrr_up": [], "mfrr_down": [], "n": 0})
        b["fcr"].append(v[base + 0])
        b["afrr_up"].append(v[base + 1])
        b["afrr_down"].append(v[base + 2])
        b["mfrr_up"].append(v[base + 3])
        b["mfrr_down"].append(v[base + 4])
        b["n"] += 1

    out = []
    for d, b in sorted(buckets.items()):
        # Skip days that are entirely null — BTD returns rows for dates it has no
        # data for, and a day of Nones must not enter the series as a real day.
        if all(x is None for x in b["fcr"] + b["afrr_up"] + b["mfrr_up"]):
            continue
        out.append({
            "date": d,
            "fcr": mean(b["fcr"]),
            "afrr_up": mean(b["afrr_up"]), "afrr_down": mean(b["afrr_down"]),
            "mfrr_up": mean(b["mfrr_up"]), "mfrr_down": mean(b["mfrr_down"]),
            "isp_count": b["n"],
        })
    return out


def main():
    if not UPDATE_SECRET:
        log("FATAL: UPDATE_SECRET not in environment")
        sys.exit(1)

    start = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else DATA_START
    end = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else \
        datetime.now(timezone.utc).date() - timedelta(days=2)

    log(f"backfilling per-day clearing prices {start} → {end}")

    all_days, cursor = [], start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), end)
        ds = fetch_chunk(cursor.isoformat(), chunk_end.isoformat())
        got = days_from_chunk(ds) if ds else []
        all_days.extend(got)
        log(f"  {cursor} → {chunk_end}: {len(got)} days")
        cursor = chunk_end
        time.sleep(1)  # be a polite client of a TSO-run endpoint

    if not all_days:
        log("nothing collected — aborting without import")
        sys.exit(2)

    complete = [d for d in all_days if d["isp_count"] >= 90]
    partial = len(all_days) - len(complete)
    log(f"collected {len(all_days)} days ({partial} partial, dropped by the import gate)")

    # Post in batches so a single oversized body can't fail the whole run.
    total = None
    for i in range(0, len(complete), 60):
        batch = complete[i:i + 60]
        res = requests.post(
            f"{WORKER_URL}/s2/daily-clearing/import",
            headers={"Content-Type": "application/json", "X-Update-Secret": UPDATE_SECRET},
            data=json.dumps({"days": batch}),
            timeout=TIMEOUT,
        )
        log(f"  import[{i}:{i+len(batch)}] {res.status_code} {res.text[:200]}")
        if res.status_code != 200:
            sys.exit(3)
        try:
            total = res.json()
        except ValueError:
            pass
        time.sleep(0.5)

    if total:
        log(f"DONE — {total.get('total_days')} days stored, {total.get('first')} → {total.get('last')}")


if __name__ == "__main__":
    main()
