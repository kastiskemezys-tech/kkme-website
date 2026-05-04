#!/usr/bin/env python3
"""
KKME — daily live-fetch of ENTSO-E A68 installed capacity per Baltic BZN.

Runs on the operator VPS (Hetzner 89.167.124.42) via cron at 06:05 UTC.
Writes raw XML + parsed values to PostgreSQL `entsoe_installed_capacity`,
then POSTs the latest snapshot to the worker `POST /s4/buildability` so that
`installed_storage_<country>_mw_live` becomes available at the worker
`/s4` GET endpoint.

Architecture rationale (Phase 12.10):
- VPS-Python + PostgreSQL + worker-POST mirrors the existing daily_intel.py /
  ingest_daily.py / kkme_sync.py precedent — operator owns the data, history
  preserved, auditable, no Cloudflare cron entanglement.
- The worker `/s4/buildability` endpoint already accepts arbitrary assertion
  fields, so no worker change is required to ingest. Only the surfacing of
  `installed_mw_live` (preferred over `installed_mw` hardcode) at /s4 GET.

Production type B25 is "Energy storage / Battery". The Baltic A68 feed is
expected to populate B25 sometime in 2026; if it returns null today the
script logs the production types ACTUALLY present (so the operator can decide
whether to await ENTSO-E coverage or fall back to Litgrid/AST hardcodes) and
exits non-zero — Phase 12.10 §8 Pause B disposition.

Env vars (read via os.environ):
  ENTSOE_API_KEY     ENTSO-E Transparency Platform security token
  KKME_DB_URL        postgresql://kkme:...@localhost:5432/kkme
  KKME_WORKER_URL    https://kkme-fetch-s1.kastis-kemezys.workers.dev
  UPDATE_SECRET      shared secret for worker `POST /s4/buildability`

CLI flags:
  --dry-run          fetch + parse + log; do NOT write to DB or POST to worker
  --country LT|LV|EE limit to one country (default: all three)
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import requests

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None  # noqa: N816 — runtime import-guard for local dev without DB

# ─── BZN configuration ───────────────────────────────────────────────────────
BZN_EIC = {
    "LT": "10YLT-1001A0008Q",
    "LV": "10YLV-1001A00074",
    "EE": "10Y1001A1001A39I",
}

PSR_BATTERY_STORAGE = "B25"  # ENTSO-E production type for batteries
ENTSOE_API = "https://web-api.tp.entsoe.eu/api"

# A68 namespace; namespace string must match the tag prefix returned in the XML.
NS = {"ns": "urn:iec62325.351:tc57wg16:451-6:installedcapacityperproductiontypedocument:1:0"}


# ─── Data classes ────────────────────────────────────────────────────────────

@dataclass
class A68Snapshot:
    country: str
    production_type: str
    installed_mw: float | None
    raw_xml: str
    source_url: str
    parse_warnings: list[str]
    fetched_at: _dt.datetime


# ─── Fetch + parse ───────────────────────────────────────────────────────────

def _entsoe_period_window(now: _dt.datetime) -> tuple[str, str]:
    """A68 wants periodStart/periodEnd in YYYYMMDDHHMM UTC. Use today 00:00 -> tomorrow 00:00."""
    day = now.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=_dt.timezone.utc)
    return day.strftime("%Y%m%d%H%M"), (day + _dt.timedelta(days=1)).strftime("%Y%m%d%H%M")


def fetch_a68(country: str, api_key: str, now: _dt.datetime | None = None) -> tuple[str, str]:
    """Returns (raw_xml, source_url) for the country's A68 ProductionType=B25 snapshot."""
    eic = BZN_EIC[country]
    now = now or _dt.datetime.now(_dt.timezone.utc)
    period_start, period_end = _entsoe_period_window(now)
    params = {
        "documentType": "A68",
        "processType": "A33",  # realised
        "in_Domain": eic,
        "periodStart": period_start,
        "periodEnd": period_end,
        "securityToken": api_key,
    }
    res = requests.get(ENTSOE_API, params=params, timeout=30)
    res.raise_for_status()
    return res.text, res.url.replace(api_key, "***")


def parse_a68(xml: str) -> tuple[float | None, dict[str, float], list[str]]:
    """
    Returns (b25_mw, all_types_mw, warnings).
      b25_mw       — installed MW for production type B25 (None if absent)
      all_types_mw — full {production_type: mw} mapping for diagnostics
      warnings     — schema-drift signals
    """
    warnings: list[str] = []
    all_types: dict[str, float] = {}
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        warnings.append(f"xml_parse_error: {e}")
        return None, {}, warnings

    # A68 structure: TimeSeries -> MktPSRType.psrType + Period.Point.quantity (single value)
    ns = NS
    ts_iter = root.findall(".//ns:TimeSeries", ns)
    if not ts_iter:
        # Fallback: try without namespace (some response variants)
        ts_iter = root.findall(".//TimeSeries")
    if not ts_iter:
        warnings.append("no_TimeSeries_in_response")
        return None, {}, warnings

    for ts in ts_iter:
        psr_el = (
            ts.find(".//ns:MktPSRType/ns:psrType", ns)
            or ts.find(".//MktPSRType/psrType")
        )
        qty_el = (
            ts.find(".//ns:Point/ns:quantity", ns)
            or ts.find(".//Point/quantity")
        )
        if psr_el is None or qty_el is None:
            continue
        try:
            psr_type = (psr_el.text or "").strip()
            qty = float((qty_el.text or "0").strip())
        except (TypeError, ValueError):
            warnings.append(f"unparseable_quantity_for_{psr_el.text}")
            continue
        all_types[psr_type] = qty

    b25_mw = all_types.get(PSR_BATTERY_STORAGE)
    if b25_mw is None:
        present = sorted(all_types)
        warnings.append(
            f"B25_battery_storage_absent; production_types_present={present}"
        )
    return b25_mw, all_types, warnings


def collect_snapshot(country: str, api_key: str, now: _dt.datetime | None = None) -> A68Snapshot:
    raw_xml, source_url = fetch_a68(country, api_key, now)
    b25_mw, _all_types, warnings = parse_a68(raw_xml)
    return A68Snapshot(
        country=country,
        production_type=PSR_BATTERY_STORAGE,
        installed_mw=b25_mw,
        raw_xml=raw_xml,
        source_url=source_url,
        parse_warnings=warnings,
        fetched_at=now or _dt.datetime.now(_dt.timezone.utc),
    )


# ─── Persist ────────────────────────────────────────────────────────────────

def write_snapshot_to_db(db_url: str, snap: A68Snapshot) -> int:
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed; run `pip install psycopg2-binary`")
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO entsoe_installed_capacity
              (fetched_at, country, production_type, installed_mw, raw_xml, source_url, parse_warnings)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                snap.fetched_at,
                snap.country,
                snap.production_type,
                snap.installed_mw,
                snap.raw_xml,
                snap.source_url,
                json.dumps(snap.parse_warnings),
            ),
        )
        row = cur.fetchone()
        return int(row[0]) if row else -1


def post_to_worker(worker_url: str, update_secret: str, snaps: list[A68Snapshot]) -> dict:
    assertions: dict[str, dict] = {}
    for s in snaps:
        if s.installed_mw is None:
            continue
        key = f"installed_storage_{s.country.lower()}_mw_live"
        assertions[key] = {
            "value": float(s.installed_mw),
            "as_of_date": s.fetched_at.date().isoformat(),
            "source": "ENTSO-E A68 (production type B25)",
            "source_url": s.source_url,
        }
    if not assertions:
        return {"ok": False, "reason": "no_b25_values_to_post"}
    payload = {"assertions": assertions, "_phase": "12.10", "_origin": "vps_a68_live_fetch"}
    res = requests.post(
        f"{worker_url.rstrip('/')}/s4/buildability",
        headers={"Content-Type": "application/json", "x-update-secret": update_secret},
        json=payload,
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "assertions": list(assertions), "response": res.json()}


# ─── CLI ────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="fetch + parse only; no DB write, no worker POST")
    parser.add_argument("--country", choices=sorted(BZN_EIC), help="single country (default: all)")
    args = parser.parse_args(argv)

    api_key = os.environ.get("ENTSOE_API_KEY")
    db_url = os.environ.get("KKME_DB_URL")
    worker_url = os.environ.get("KKME_WORKER_URL", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
    update_secret = os.environ.get("UPDATE_SECRET")

    if not api_key:
        print("ERR: ENTSOE_API_KEY env var not set", file=sys.stderr)
        return 2
    if not args.dry_run and not db_url:
        print("ERR: KKME_DB_URL env var not set (use --dry-run to skip DB)", file=sys.stderr)
        return 2
    if not args.dry_run and not update_secret:
        print("ERR: UPDATE_SECRET env var not set (use --dry-run to skip worker POST)", file=sys.stderr)
        return 2

    countries = [args.country] if args.country else list(BZN_EIC)
    snapshots: list[A68Snapshot] = []
    null_b25_countries: list[str] = []

    for c in countries:
        print(f"[A68] fetching {c} …", file=sys.stderr)
        snap = collect_snapshot(c, api_key)
        snapshots.append(snap)
        if snap.installed_mw is None:
            null_b25_countries.append(c)
        print(
            f"[A68] {c}: installed_mw={snap.installed_mw} warnings={snap.parse_warnings}",
            file=sys.stderr,
        )

    if args.dry_run:
        print(json.dumps([
            {
                "country": s.country,
                "production_type": s.production_type,
                "installed_mw": s.installed_mw,
                "fetched_at": s.fetched_at.isoformat(),
                "source_url": s.source_url,
                "parse_warnings": s.parse_warnings,
            }
            for s in snapshots
        ], indent=2))
        if null_b25_countries:
            print(
                f"NOTE: B25 absent for {null_b25_countries}; --dry-run exits non-zero per Phase 12.10 §8 Pause B disposition",
                file=sys.stderr,
            )
            return 1
        return 0

    for snap in snapshots:
        try:
            row_id = write_snapshot_to_db(db_url, snap)
            print(f"[DB] inserted row id={row_id} country={snap.country} mw={snap.installed_mw}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — log + continue per country
            print(f"[DB] ERR inserting {snap.country}: {e}", file=sys.stderr)

    try:
        post_result = post_to_worker(worker_url, update_secret, snapshots)
        print(f"[WORKER] POST result: {post_result}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"[WORKER] ERR posting: {e}", file=sys.stderr)
        return 3

    if null_b25_countries:
        print(
            f"NOTE: B25 absent for {null_b25_countries}; "
            "worker still serves hardcoded fallback for those countries (preserves last-good _live).",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
