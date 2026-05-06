#!/usr/bin/env python3
"""
KKME — Baltic Storage Index daily aggregate.

Computes the monthly per-country per-duration €/MW revenue index from the
KKME engine's `/revenue` output, persists to PostgreSQL `kkme_baltic_storage_index`,
and POSTs the latest snapshot to the worker `POST /index/update` so that
`GET /index/baltic` serves it to kkme.eu.

Architecture rationale (Phase 29):
- VPS-Python + PostgreSQL + worker-POST mirrors Phase 12.10's
  `fetch_entsoe_installed_capacity.py` precedent.
- Engine source-of-truth (`computeRevenueV7` in `workers/fetch-s1.js`) computes
  the underlying numbers; this script reshapes the engine's `backtest`
  per-month output into Clean-Horizon-style €/MW/month annualized values per
  duration. We FETCH from the worker rather than computing from raw BTD/A44
  data on the VPS so the index aligns with the live engine state.

Scope per Phase 29 option ε (operator-confirmed at Pause A):
- LT/{2h,4h}: canonical, computed from `/revenue?dur={2h,4h}` backtest.
- LT/1h:      NULL with coverage_status `pending_engine_1h_physics`. Engine
              has no sub-2h SOC physics; dedicated extension out of Phase 29
              scope.
- LV, EE:     NULL with coverage_status `pending_phase_29_1`. Per-country DA
              capture and full-product capacity-reservation extraction is the
              Phase 29.1 follow-on (~3-4h estimate).

Annualization convention: per Clean Horizon framing, monthly values are
reported in €/MW/month (this month's rate). Trailing-6-month sparkline data
uses the same monthly basis. Annualized × 12 framing is presentation-side
only — the persisted value is €/MW/month directly.

Env vars (read via os.environ):
  KKME_DB_URL        postgresql://kkme:...@localhost:5432/kkme
  KKME_WORKER_URL    https://kkme-fetch-s1.kastis-kemezys.workers.dev
                     (default if unset)
  UPDATE_SECRET      shared secret for worker `POST /index/update`

CLI flags:
  --dry-run          fetch + compute + log JSON; no DB write, no worker POST.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
from dataclasses import dataclass, asdict
from typing import Any

import requests

try:
    import psycopg2
except ImportError:
    psycopg2 = None  # noqa: N816 — runtime import-guard for local dev without DB

# ─── Constants ───────────────────────────────────────────────────────────────
DEFAULT_WORKER_URL = "https://kkme-fetch-s1.kastis-kemezys.workers.dev"
COUNTRIES = ("LT", "LV", "EE")
DURATIONS = ("1h", "2h", "4h")

# Coverage-status enum strings — must match the SQL CHECK constraints (none
# enforced in 002_baltic_storage_index.sql, but the worker /index/baltic
# consumer + methodology paper rely on these specific tokens).
CS_COMPLETE = "complete"
CS_PHASE_29_1 = "pending_phase_29_1"
CS_ENGINE_1H = "pending_engine_1h_physics"


# ─── Data classes ────────────────────────────────────────────────────────────

@dataclass
class IndexValue:
    country: str
    duration: str
    month: str                    # 'YYYY-MM' — the month this value represents
    value_eur_mw_month: float | None
    coverage_status: str
    notes: str


@dataclass
class Snapshot:
    """Latest snapshot — the payload POSTed to the worker."""
    month: str
    values: list[IndexValue]                             # current-month values per country/duration
    trailing_6_months: list[dict[str, Any]]              # [{ month, lt: {2h,4h}, ... }, ...]
    computation_window: str
    source_engine_version: str
    last_updated_at: str


# ─── Worker fetch ────────────────────────────────────────────────────────────

def fetch_revenue(worker_url: str, dur: str) -> dict[str, Any]:
    """GET /revenue?dur=<2h|4h> from the worker. Returns parsed JSON.

    Raises requests.HTTPError on non-200; engine result is the source-of-truth
    so a fetch failure is fatal for the script.
    """
    url = f"{worker_url.rstrip('/')}/revenue?dur={dur}"
    res = requests.get(url, timeout=30)
    res.raise_for_status()
    return res.json()


def reshape_backtest_to_monthly_eur_mw(
    backtest: list[dict[str, Any]], mw: int = 50
) -> dict[str, float]:
    """Convert /revenue.backtest's per-month total_daily (€/day for the 50 MW
    reference asset) into €/MW/month per Clean Horizon convention.

    backtest entries shape (per worker:8306-8313):
      { month: 'YYYY-MM', trading_daily, balancing_daily, total_daily, s1_capture, days }

    Convention: 30-day month basis (Clean Horizon convention is monthly aggregate
    annualized; the per-month value is `total_daily × 30 / mw`). Months with
    `days < 15` (worker filter) are already excluded upstream.
    """
    out: dict[str, float] = {}
    for row in backtest:
        month = row.get("month")
        total_daily = row.get("total_daily")
        if month and total_daily is not None and mw > 0:
            out[month] = round((float(total_daily) * 30.0) / float(mw), 2)
    return out


# ─── Compose snapshot ────────────────────────────────────────────────────────

def compose_snapshot(
    rev_2h: dict[str, Any], rev_4h: dict[str, Any]
) -> Snapshot:
    """Build the full per-country per-duration snapshot from the two engine
    runs. LT/{2h,4h} populated; LV/EE/1h stubbed coverage_pending."""

    monthly_2h = reshape_backtest_to_monthly_eur_mw(rev_2h.get("backtest") or [])
    monthly_4h = reshape_backtest_to_monthly_eur_mw(rev_4h.get("backtest") or [])

    # Determine trailing-completed month: pick the latest month with data in
    # both 2h and 4h (engine filters incomplete months upstream).
    months_with_data = sorted(set(monthly_2h) & set(monthly_4h))
    if not months_with_data:
        raise RuntimeError(
            "engine /revenue returned no usable backtest months "
            "(both dur=2h and dur=4h must agree on at least one month)"
        )
    headline_month = months_with_data[-1]

    # Per-country per-duration values for the headline month.
    values: list[IndexValue] = []
    for country in COUNTRIES:
        for duration in DURATIONS:
            if country == "LT" and duration == "2h":
                values.append(IndexValue(
                    country=country, duration=duration, month=headline_month,
                    value_eur_mw_month=monthly_2h[headline_month],
                    coverage_status=CS_COMPLETE,
                    notes="LT/2h canonical; computed from /revenue.backtest reshape "
                          f"(total_daily × 30 / 50 MW reference asset).",
                ))
            elif country == "LT" and duration == "4h":
                values.append(IndexValue(
                    country=country, duration=duration, month=headline_month,
                    value_eur_mw_month=monthly_4h[headline_month],
                    coverage_status=CS_COMPLETE,
                    notes="LT/4h canonical; computed from /revenue.backtest reshape "
                          f"(total_daily × 30 / 50 MW reference asset).",
                ))
            elif duration == "1h":
                values.append(IndexValue(
                    country=country, duration=duration, month=headline_month,
                    value_eur_mw_month=None,
                    coverage_status=CS_ENGINE_1H,
                    notes="1h SOC physics not modeled by engine v7.3 "
                          "(REVENUE_SCENARIOS covers 2h and 4h only). "
                          "Coverage requires dedicated engine extension.",
                ))
            else:
                # LV / EE — pending Phase 29.1
                values.append(IndexValue(
                    country=country, duration=duration, month=headline_month,
                    value_eur_mw_month=None,
                    coverage_status=CS_PHASE_29_1,
                    notes=f"{country}/{duration} pending Phase 29.1: "
                          "per-country DA capture + 5-product capacity-reservation "
                          "extraction. Engine is currently LT-anchored.",
                ))

    # Trailing-6-month sparkline payload — last 6 months of data, LT only
    # populated; LV/EE remain null in the per-month rows so the frontend can
    # render a consistent sparkline shape.
    last6 = months_with_data[-6:]
    trailing: list[dict[str, Any]] = []
    for m in last6:
        trailing.append({
            "month": m,
            "lt": {
                "1h": None,
                "2h": monthly_2h.get(m),
                "4h": monthly_4h.get(m),
            },
            "lv": {"1h": None, "2h": None, "4h": None},
            "ee": {"1h": None, "2h": None, "4h": None},
        })

    engine_version = (
        rev_2h.get("model_version")
        or rev_2h.get("engine_calibration_source", {}).get("version")
        or "v7.3"
    )
    last_updated = (
        rev_2h.get("updated_at")
        or rev_2h.get("timestamp")
        or _dt.datetime.now(_dt.timezone.utc).isoformat()
    )

    return Snapshot(
        month=headline_month,
        values=values,
        trailing_6_months=trailing,
        computation_window="trailing-completed-month",
        source_engine_version=engine_version,
        last_updated_at=last_updated,
    )


def snapshot_to_payload(snap: Snapshot) -> dict[str, Any]:
    """Convert the dataclass snapshot into the JSON shape `POST /index/update`
    expects (which mirrors `GET /index/baltic`)."""

    by_country: dict[str, dict[str, float | None]] = {
        "LT": {"1h": None, "2h": None, "4h": None},
        "LV": {"1h": None, "2h": None, "4h": None},
        "EE": {"1h": None, "2h": None, "4h": None},
    }
    coverage: dict[str, dict[str, str]] = {
        c: {d: CS_COMPLETE for d in DURATIONS} for c in COUNTRIES
    }
    for v in snap.values:
        by_country[v.country][v.duration] = v.value_eur_mw_month
        coverage[v.country][v.duration] = v.coverage_status

    return {
        "month": snap.month,
        "lt": {k.lower(): by_country["LT"][k] for k in DURATIONS},  # keys: 1h/2h/4h
        "lv": {k.lower(): by_country["LV"][k] for k in DURATIONS},
        "ee": {k.lower(): by_country["EE"][k] for k in DURATIONS},
        "coverage": {
            "lt": coverage["LT"],
            "lv": coverage["LV"],
            "ee": coverage["EE"],
        },
        "trailing_6_months": snap.trailing_6_months,
        "methodology_url": "https://kkme.eu/methodology",
        "comparable_clean_horizon_published": True,
        "computation_window": snap.computation_window,
        "engine_version": snap.source_engine_version,
        "last_updated_at": snap.last_updated_at,
    }


# ─── Persist ─────────────────────────────────────────────────────────────────

def write_snapshot_to_db(db_url: str, snap: Snapshot) -> int:
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed; run `pip install psycopg2-binary`")
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        for v in snap.values:
            cur.execute(
                """
                INSERT INTO kkme_baltic_storage_index
                  (month, country, duration, value_eur_mw_month, computation_window,
                   source_engine_version, coverage_status, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    v.month,
                    v.country,
                    v.duration,
                    v.value_eur_mw_month,
                    snap.computation_window,
                    snap.source_engine_version,
                    v.coverage_status,
                    v.notes,
                ),
            )
        return len(snap.values)


def post_to_worker(worker_url: str, update_secret: str, payload: dict[str, Any]) -> dict[str, Any]:
    res = requests.post(
        f"{worker_url.rstrip('/')}/index/update",
        headers={"Content-Type": "application/json", "X-Update-Secret": update_secret},
        json=payload,
        timeout=15,
    )
    res.raise_for_status()
    return res.json()


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="fetch + compute + log JSON; no DB write, no worker POST")
    args = parser.parse_args(argv)

    db_url = os.environ.get("KKME_DB_URL")
    worker_url = os.environ.get("KKME_WORKER_URL", DEFAULT_WORKER_URL)
    update_secret = os.environ.get("UPDATE_SECRET")

    if not args.dry_run and not db_url:
        print("ERR: KKME_DB_URL env var not set (use --dry-run to skip DB)", file=sys.stderr)
        return 2
    if not args.dry_run and not update_secret:
        print("ERR: UPDATE_SECRET env var not set (use --dry-run to skip worker POST)", file=sys.stderr)
        return 2

    print(f"[index] fetching /revenue?dur=2h + dur=4h from {worker_url} …", file=sys.stderr)
    rev_2h = fetch_revenue(worker_url, "2h")
    rev_4h = fetch_revenue(worker_url, "4h")

    snap = compose_snapshot(rev_2h, rev_4h)
    payload = snapshot_to_payload(snap)
    print(
        f"[index] headline month={snap.month} engine={snap.source_engine_version} "
        f"LT/2h={payload['lt']['2h']} LT/4h={payload['lt']['4h']}",
        file=sys.stderr,
    )

    if args.dry_run:
        print(json.dumps(payload, indent=2, default=str))
        return 0

    try:
        rows_inserted = write_snapshot_to_db(db_url, snap)
        print(f"[DB] inserted {rows_inserted} rows (3 countries × 3 durations)", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"[DB] ERR: {e}", file=sys.stderr)
        return 3

    try:
        post_result = post_to_worker(worker_url, update_secret, payload)
        print(f"[WORKER] POST result: {post_result}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"[WORKER] ERR posting: {e}", file=sys.stderr)
        return 3

    return 0


if __name__ == "__main__":
    sys.exit(main())
