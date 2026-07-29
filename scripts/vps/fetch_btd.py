#!/usr/bin/env python3
"""
KKME — BTD balancing ingest (S2 + trading), PRIMARY leg.

Phase 36.C. Replaces the Mac cron (`~/kkme-cron/fetch-btd.js`), which failed two
ways at once: BTD's origin dropped the Mac's TLS handshake without returning a
certificate, and the crontab line redirected into a directory that no longer
existed, so `node` never started. The worker-direct leg is no help either — the
Cloudflare edge gets a persistent 526 from BTD's origin.

This host is the one place in the estate with proven, cert-valid access to BTD.
Full evidence: docs/investigations/2026-07-29-phase-36-c-pause-a-source-audit.md

Install (crontab -e), matching the existing VPS idiom — `SHELL=/bin/bash` is
already set at the top of the crontab and is load-bearing: these lines use
`. .env`, which is a bashism that silently no-ops under dash.

    0 */4 * * * . /opt/kkme/config/.env ; export UPDATE_SECRET && cd /opt/kkme/app && /opt/kkme/venv/bin/python3 scripts/vps/fetch_btd.py >> /opt/kkme/logs/btd.log 2>&1

Note the log directory must exist before this runs — see DECISIONS.md, "cron
redirects open before the command".
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

WORKER_URL = os.environ.get("KKME_API", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
UPDATE_SECRET = os.environ.get("UPDATE_SECRET")
BTD_API = "https://api-baltic.transparency-dashboard.eu/api/v1/export"
SOURCE_LEG = "vps"
TIMEOUT = 60

# BTD publishes with a ~2-day lag; fetch 9→2 days back so the window is always
# populated. Same window the retired Mac leg used, so the two are comparable.
LAG_DAYS = 2
WINDOW_DAYS = 9

# Lithuania's columns inside price_procured_reserves. The worker resolves these
# from the payload's own header_groups; here they are only used for the
# pre-flight sanity check, and are verified against header_groups below rather
# than trusted blind.
LT_FALLBACK_BASE = 10


def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def fetch_dataset(dataset_id, start, end):
    """Fetch one BTD dataset. Returns parsed JSON, or None on any failure."""
    params = {
        "id": dataset_id,
        "start_date": f"{start}T00:00",
        "end_date": f"{end}T00:00",
        "output_time_zone": "UTC",
        "output_format": "json",
        "json_header_groups": 1,
    }
    try:
        res = requests.get(BTD_API, params=params, timeout=TIMEOUT)
    except requests.RequestException as e:
        log(f"[BTD] {dataset_id}: request failed — {e}")
        return None
    if res.status_code != 200:
        log(f"[BTD] {dataset_id}: HTTP {res.status_code}")
        return None
    try:
        return res.json()
    except ValueError as e:
        log(f"[BTD] {dataset_id}: JSON parse error — {e}")
        return None


def resolve_country_base(dataset, country="Lithuania"):
    """Column offset for a country, read from the payload's own header_groups."""
    groups = (dataset or {}).get("data", {}).get("header_groups")
    if isinstance(groups, list) and groups and isinstance(groups[0], list):
        for g in groups[0]:
            if str(g.get("label", "")).strip().lower() == country.lower():
                start = g.get("start")
                if isinstance(start, int):
                    return start
    return LT_FALLBACK_BASE if country == "Lithuania" else None


def non_null_ratio(dataset):
    """Share of non-null values across the whole dataset."""
    ts = (dataset or {}).get("data", {}).get("timeseries") or []
    total = filled = 0
    for row in ts:
        for v in (row.get("values") or []):
            total += 1
            if v is not None:
                filled += 1
    return (filled / total) if total else 0.0


def validate_datasets(reserves, direction, imbalance):
    """
    Pre-flight gate. The worker validates the SHAPED payload (required fields,
    sanity bounds); this catches the upstream failure modes that would produce a
    structurally valid but meaningless payload — an all-null window, a truncated
    fetch, or a column layout that has moved under us.

    A primary that writes unvalidated data is worse than a dead one: a dead leg
    is visible in the freshness badge, bad data is not.

    Returns (ok: bool, errors: list[str]).
    """
    errors = []

    for name, ds in (("price_procured_reserves", reserves),
                     ("direction_of_balancing_v2", direction),
                     ("imbalance_prices", imbalance)):
        if ds is None:
            errors.append(f"{name}: not fetched")
            continue
        ts = ds.get("data", {}).get("timeseries")
        if not isinstance(ts, list) or not ts:
            errors.append(f"{name}: no timeseries")
            continue
        # 9-day PT15M window ≈ 672 ISPs; accept well below that (partial final
        # day is normal) but reject a window that is essentially empty.
        if len(ts) < 96:
            errors.append(f"{name}: only {len(ts)} ISPs — window looks truncated")

    if reserves is not None:
        ratio = non_null_ratio(reserves)
        if ratio < 0.5:
            errors.append(f"price_procured_reserves: {ratio:.0%} non-null — upstream window looks unpopulated")

        base = resolve_country_base(reserves, "Lithuania")
        if base != LT_FALLBACK_BASE:
            # Not fatal — the worker resolves dynamically too — but it means the
            # feed layout changed and every hardcoded index downstream is suspect.
            log(f"[Validate] WARNING Lithuania column base is {base}, historically {LT_FALLBACK_BASE}")
        ts = reserves.get("data", {}).get("timeseries") or []
        widths = {len(r.get("values") or []) for r in ts}
        if widths and max(widths) < base + 5:
            errors.append(f"rows are {max(widths)} wide, need >= {base + 5} for Lithuania")

    return (len(errors) == 0, errors)


def post(path, body):
    if not UPDATE_SECRET:
        log("FATAL: UPDATE_SECRET not in environment — is the cron sourcing /opt/kkme/config/.env?")
        sys.exit(1)
    try:
        res = requests.post(
            f"{WORKER_URL}{path}",
            headers={"Content-Type": "application/json", "X-Update-Secret": UPDATE_SECRET},
            data=json.dumps(body),
            timeout=TIMEOUT,
        )
        return res.status_code, res.text
    except requests.RequestException as e:
        log(f"[POST {path}] failed — {e}")
        return None, str(e)


def build_trading_days(reserves, procured_mw, balancing_prices, direction, imbalance, imbalance_vols):
    """Group per-ISP values by delivery date for POST /trading/update."""
    ts = (reserves or {}).get("data", {}).get("timeseries") or []
    base = resolve_country_base(reserves, "Lithuania")

    def vals(ds, i):
        rows = (ds or {}).get("data", {}).get("timeseries") or []
        return (rows[i].get("values") or []) if i < len(rows) else []

    def at(arr, idx):
        return arr[idx] if idx < len(arr) else None

    by_date = {}
    for i, row in enumerate(ts):
        date = str(row.get("_from") or row.get("from") or "")[:10]
        if len(date) != 10:
            continue
        day = by_date.setdefault(date, {
            "capacity_prices": [], "procured_mw": [], "activation_prices": [],
            "direction": [], "imbalance_prices": [], "imbalance_volumes": [],
        })

        pv = row.get("values") or []
        day["capacity_prices"].append({
            "fcr_sym": at(pv, base + 0), "afrr_up": at(pv, base + 1), "afrr_dn": at(pv, base + 2),
            "mfrr_up": at(pv, base + 3), "mfrr_dn": at(pv, base + 4),
        })

        pmv = vals(procured_mw, i)
        day["procured_mw"].append({
            "fcr_sym": at(pmv, base + 0), "afrr_up": at(pmv, base + 1), "afrr_dn": at(pmv, base + 2),
            "mfrr_up": at(pmv, base + 3), "mfrr_dn": at(pmv, base + 4),
        })

        bpv = vals(balancing_prices, i)
        day["activation_prices"].append({"up": at(bpv, 4), "down": at(bpv, 5)})
        day["direction"].append(at(vals(direction, i), 2))
        ipv = vals(imbalance, i)
        day["imbalance_prices"].append({"final": at(ipv, 4), "preliminary": at(ipv, 5)})
        day["imbalance_volumes"].append(at(vals(imbalance_vols, i), 3))

    return by_date


def main():
    log("=== BTD ingest (VPS primary) ===")

    today = datetime.now(timezone.utc).date()
    start = (today - timedelta(days=WINDOW_DAYS)).isoformat()
    end = (today - timedelta(days=LAG_DAYS)).isoformat()
    log(f"window {start} → {end}")

    reserves = fetch_dataset("price_procured_reserves", start, end)
    direction = fetch_dataset("direction_of_balancing_v2", start, end)
    imbalance = fetch_dataset("imbalance_prices", start, end)

    ok, errors = validate_datasets(reserves, direction, imbalance)
    if not ok:
        log("VALIDATION FAILED — not posting:")
        for e in errors:
            log(f"  ✗ {e}")
        # Exit non-zero so a wrapper/monitor can see it; the worker keeps serving
        # its last good payload with an honest freshness badge.
        sys.exit(2)
    log(f"validation passed — {len(reserves['data']['timeseries'])} ISPs, "
        f"{non_null_ratio(reserves):.0%} non-null")

    status, text = post("/s2/update", {
        "reserves": reserves, "direction": direction, "imbalance": imbalance,
        "source": SOURCE_LEG,
    })
    log(f"S2 update: {status} {str(text)[:300]}")
    if status != 200:
        sys.exit(3)

    # ── Trading datasets (per-ISP) ───────────────────────────────────────────
    procured_mw = fetch_dataset("procured_reserves", start, end)
    balancing_prices = fetch_dataset("balancing_energy_prices", start, end)
    imbalance_vols = fetch_dataset("imbalance_volumes", start, end)

    by_date = build_trading_days(reserves, procured_mw, balancing_prices,
                                 direction, imbalance, imbalance_vols)
    for date in sorted(by_date):
        day = by_date[date]
        n = len(day["capacity_prices"])
        if n < 90:  # partial day — a mean over it would be biased
            log(f"[Trading] {date} skipped — only {n} ISPs")
            continue
        st, tx = post("/trading/update", {"date": date, **day})
        log(f"[Trading] {date}: {st} {str(tx)[:160]}")

    st, _ = post("/heartbeat", {})
    log(f"Heartbeat: {st}")
    log("=== done ===")


if __name__ == "__main__":
    main()
