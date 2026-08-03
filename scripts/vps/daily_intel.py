#!/usr/bin/env python3
"""
KKME Daily Intelligence Pipeline — official sources first, news second.

Runs 7 jobs in order:
1. sync_litgrid_announcements  — Litgrid news for storage connections/reservations
2. sync_vert_storage_permits   — VERT storage permit register
3. sync_apva_support_events    — APVA grant/support news
4. sync_market_timeseries      — check signal freshness
5. cross_reference_and_assert  — dedup, validate, flag contradictions
6. publish_high_signal_events  — push top assertions to website feed
7. push_assertions_to_worker   — sync assertion values to CF Worker KV

Usage:
  python3 daily_intel.py --all
  python3 daily_intel.py --job sync_litgrid
  python3 daily_intel.py --job push_kv
"""

import argparse
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime, date, timezone

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

# Phase 38.2 — THE ONLY LINE CHANGED FROM THE VPS COPY. The original carried a
# live production PostgreSQL credential as an inline default, and this repo is
# PUBLIC. Verified safe to drop before vendoring: /opt/kkme/config/.env sets
# DATABASE_URL to the identical value and the wrapper sources it under bash
# with `set -a`, so the default was never reached. See B-061.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
WORKER_URL = os.environ.get("KKME_API", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
UPDATE_SECRET = os.environ.get("UPDATE_SECRET", "")
LOG_DIR = "/opt/kkme/logs"

LITGRID_NEWS_URL = "https://www.litgrid.eu/index.php/naujienos/naujienos"
VERT_STORAGE_URL = "https://vert.lt/atsinaujinantys-istekliai/"
APVA_NEWS_URL = "https://apva.lrv.lt/lt/naujienos-24316"

STORAGE_KEYWORDS_LT = ["kaupimo", "baterij", "battery", "storage", "BESS",
                        "prijungta", "rezervav", "galios", "MWh"]

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "lt,en;q=0.5",
}

# S/D math constants
EFF_DEMAND_MW = 935
STATUS_WEIGHT = {"operational": 1.0, "commissioned": 1.0, "under_construction": 0.9,
                 "connection_agreement": 0.6, "application": 0.3, "announced": 0.1}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("daily_intel")


def get_db():
    return psycopg2.connect(DATABASE_URL)


def content_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def store_source_doc(cur, source_name, doc_type, url, title, content_text=""):
    """Store a source document, skip if already seen (by URL)."""
    cur.execute("SELECT doc_id FROM source_document WHERE url = %s", (url,))
    if cur.fetchone():
        return None
    chash = content_hash(content_text) if content_text else None
    cur.execute("""
        INSERT INTO source_document (source_name, doc_type, url, title, content_hash, content_text)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING doc_id
    """, (source_name, doc_type, url, title, chash, content_text[:5000] if content_text else None))
    return cur.fetchone()[0]


def create_assertion(cur, assertion_type, subject, key, value_numeric=None,
                     value_text=None, unit=None, confidence="derived",
                     as_of_date=None, source_url=None, source_type=None,
                     affects_signals=None, model_action=None):
    """Create a new assertion, superseding any existing with the same key."""
    if as_of_date is None:
        as_of_date = date.today()
    cur.execute("""
        SELECT assertion_id, value_numeric, value_text FROM assertion
        WHERE key = %s AND is_current = TRUE
    """, (key,))
    existing = cur.fetchone()
    if existing:
        eid, ev_num, ev_text = existing
        if ev_num == value_numeric and ev_text == value_text:
            return None
        cur.execute("UPDATE assertion SET is_current = FALSE WHERE assertion_id = %s", (eid,))
        supersedes = eid
    else:
        supersedes = None

    cur.execute("""
        INSERT INTO assertion (assertion_type, subject, key, value_numeric, value_text,
                               unit, confidence, as_of_date, source_url, source_type,
                               supersedes, is_current, affects_signals, model_action)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
        RETURNING assertion_id
    """, (assertion_type, subject, key, value_numeric, value_text,
          unit, confidence, as_of_date, source_url, source_type,
          supersedes, affects_signals, model_action))
    return cur.fetchone()[0]


def create_model_action(cur, action_type, target_signal, description,
                        value_before=None, value_after=None, source_assertion_id=None):
    cur.execute("""
        INSERT INTO model_action (action_date, action_type, target_signal, description,
                                  value_before, value_after, source_assertion_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING action_id
    """, (date.today(), action_type, target_signal, description,
          value_before, value_after, source_assertion_id))
    return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# JOB 1: Litgrid announcements
# ---------------------------------------------------------------------------

def sync_litgrid_announcements():
    """Fetch Litgrid news page, find storage-related announcements."""
    log.info("JOB 1: sync_litgrid_announcements")
    new_assertions = 0

    try:
        resp = requests.get(LITGRID_NEWS_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = 'utf-8'
    except Exception as e:
        log.error(f"Failed to fetch Litgrid news: {e}")
        return 0

    soup = BeautifulSoup(resp.text, "lxml")
    conn = get_db()
    cur = conn.cursor()

    articles = soup.select("a[href*='/naujienos/']")
    relevant = []

    for a in articles:
        title = a.get_text(strip=True)
        href = a.get("href", "")
        if not title or len(title) < 20:
            continue
        title_lower = title.lower()
        if any(kw.lower() in title_lower for kw in STORAGE_KEYWORDS_LT):
            full_url = href if href.startswith("http") else f"https://www.litgrid.eu{href}"
            relevant.append({"title": title, "url": full_url})

    log.info(f"  Found {len(relevant)} storage-related Litgrid articles")

    for art in relevant[:10]:
        doc_id = store_source_doc(cur, "litgrid", "news_article", art["url"], art["title"])
        if doc_id is None:
            continue

        mw_match = re.search(r'(\d+)\s*MW', art["title"])

        if "prijungta" in art["title"].lower() or "connected" in art["title"].lower():
            mw = int(mw_match.group(1)) if mw_match else None
            if mw:
                aid = create_assertion(
                    cur, "connected_bess", art["title"], f"litgrid_connection_{doc_id}",
                    value_numeric=mw, unit="MW", confidence="official",
                    source_url=art["url"], source_type="litgrid",
                    affects_signals=["S4", "S2", "fleet"],
                    model_action="update_installed_base"
                )
                if aid:
                    new_assertions += 1
                    log.info(f"  New assertion: BESS connection {mw} MW")

        elif "rezervav" in art["title"].lower() or "reserved" in art["title"].lower():
            mw = int(mw_match.group(1)) if mw_match else None
            if mw:
                aid = create_assertion(
                    cur, "reserved_total", art["title"], f"litgrid_reservation_{doc_id}",
                    value_numeric=mw, unit="MW", confidence="official",
                    source_url=art["url"], source_type="litgrid",
                    affects_signals=["S4", "S2"]
                )
                if aid:
                    new_assertions += 1

        time.sleep(2)

    conn.commit()
    cur.close()
    conn.close()
    log.info(f"  JOB 1 complete: {new_assertions} new assertions")
    return new_assertions


# ---------------------------------------------------------------------------
# JOB 2: VERT storage permits
# ---------------------------------------------------------------------------

# Known permit PDF URLs (updated manually when new PDFs are found)
KNOWN_VERT_PDFS = [
    {
        "url": "https://vert.lt/atsinaujinantys-istekliai/SiteAssets/2026-02/Leidimai%20pl%C4%97toti%20kaupimo%20paj%C4%97gumus%20%202026-02-28.pdf",
        "title": "VERT storage development permits 2026-02-28",
    },
]


def sync_vert_storage_permits():
    """Check VERT storage permit page for updates.

    Note: vert.lt blocks datacenter IPs (403). When blocked, we register
    known permit PDF URLs for manual review and skip live scraping.
    """
    log.info("JOB 2: sync_vert_storage_permits")
    new_permits = 0

    conn = get_db()
    cur = conn.cursor()

    try:
        resp = requests.get(VERT_STORAGE_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = 'utf-8'

        store_source_doc(cur, "vert", "permit_page", VERT_STORAGE_URL,
                         "VERT storage permits page", resp.text[:5000])

        soup = BeautifulSoup(resp.text, "lxml")
        pdf_links = soup.select("a[href$='.pdf']")
        for link in pdf_links:
            href = link.get("href", "")
            text = link.get_text(strip=True).lower()
            if "kaupimo" in text or "storage" in text:
                full_url = href if href.startswith("http") else f"https://vert.lt{href}"
                log.info(f"  Found storage permit PDF: {full_url}")
                store_source_doc(cur, "vert", "pdf_register", full_url, text)
                new_permits += 1

    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 403:
            log.warning("  VERT blocks datacenter IPs (403). Registering known permit URLs.")
            for pdf in KNOWN_VERT_PDFS:
                doc_id = store_source_doc(cur, "vert", "pdf_register", pdf["url"], pdf["title"])
                if doc_id:
                    new_permits += 1
                    log.info(f"  Registered known PDF: {pdf['title']}")
        else:
            log.error(f"Failed to fetch VERT page: {e}")
    except Exception as e:
        log.error(f"Failed to fetch VERT page: {e}")

    conn.commit()
    cur.close()
    conn.close()
    log.info(f"  JOB 2 complete: {new_permits} permit references")
    return new_permits


# ---------------------------------------------------------------------------
# JOB 3: APVA support events
# ---------------------------------------------------------------------------

# Known APVA events (seeded, verified manually)
KNOWN_APVA_EVENTS = [
    {
        "url": "https://apva.lrv.lt/lt/naujienos-24316/uzbaigtas-45-mln-euru-kvietimas-elektros-kaupimo-irenginiams-rinkos-poreikis-virsijo-skirta-suma-k2R",
        "title": "APVA large-scale BESS call: 1,545 MW applied against EUR 45M budget",
    },
]


def sync_apva_support_events():
    """Check APVA news for storage-related support events.

    Note: apva.lrv.lt blocks datacenter IPs (403). When blocked,
    we verify existing seed data is still registered.
    """
    log.info("JOB 3: sync_apva_support_events")
    new_events = 0

    conn = get_db()
    cur = conn.cursor()

    try:
        resp = requests.get("https://apva.lrv.lt/lt/naujienos", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = 'utf-8'

        soup = BeautifulSoup(resp.text, "lxml")
        articles = soup.select("a[href*='/naujienos']")
        for a in articles:
            title = a.get_text(strip=True)
            href = a.get("href", "")
            if not title or len(title) < 20:
                continue
            title_lower = title.lower()
            if any(kw in title_lower for kw in ["kaupimo", "baterij", "storage", "elektros kaupimo"]):
                full_url = href if href.startswith("http") else f"https://apva.lrv.lt{href}"
                doc_id = store_source_doc(cur, "apva", "news_article", full_url, title)
                if doc_id:
                    new_events += 1
                    log.info(f"  New APVA article: {title[:60]}")
            time.sleep(2)

    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 403:
            log.warning("  APVA blocks datacenter IPs (403). Registering known events.")
            for ev in KNOWN_APVA_EVENTS:
                doc_id = store_source_doc(cur, "apva", "news_article", ev["url"], ev["title"])
                if doc_id:
                    new_events += 1
        else:
            log.error(f"Failed to fetch APVA news: {e}")
    except Exception as e:
        log.error(f"Failed to fetch APVA news: {e}")

    conn.commit()
    cur.close()
    conn.close()
    log.info(f"  JOB 3 complete: {new_events} events")
    return new_events


# ---------------------------------------------------------------------------
# JOB 4: Market timeseries freshness check
# ---------------------------------------------------------------------------

def sync_market_timeseries():
    """Check that all signal KV entries are fresh."""
    log.info("JOB 4: sync_market_timeseries (freshness check)")

    try:
        resp = requests.get(f"{WORKER_URL}/health-detail", timeout=15)
        detail = resp.json()
    except Exception as e:
        log.error(f"Health check failed: {e}")
        return 0

    stale = []
    for k, v in detail.get("sources", {}).items():
        age = v.get("age_hours")
        if isinstance(age, (int, float)) and age > 12:
            stale.append(f"{k}: {age:.1f}h")

    if stale:
        log.warning(f"  Stale signals: {', '.join(stale)}")
    else:
        log.info("  All signals fresh (<12h)")

    return len(stale)


# ---------------------------------------------------------------------------
# JOB 5: Cross-reference and assert
# ---------------------------------------------------------------------------

def cross_reference_and_assert():
    """Cross-reference new assertions against existing data."""
    log.info("JOB 5: cross_reference_and_assert")
    actions = 0

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Check: connected_asset totals vs assertion installed_mw
    cur.execute("SELECT SUM(power_mw) AS total_connected FROM connected_asset")
    connected_total = cur.fetchone()["total_connected"] or 0

    cur.execute("SELECT value_numeric FROM assertion WHERE key = 'installed_storage_lt_mw' AND is_current = TRUE")
    row = cur.fetchone()
    asserted_installed = row["value_numeric"] if row else None

    if asserted_installed and abs(connected_total - asserted_installed) > 50:
        log.warning(f"  Connected assets total ({connected_total} MW) differs from assertion ({asserted_installed} MW)")
        cur2 = conn.cursor()
        create_model_action(cur2, "flag_contradiction", "S4",
                            f"Connected assets total ({connected_total} MW) != installed assertion ({asserted_installed} MW). "
                            f"Delta: {connected_total - asserted_installed:.0f} MW. Check connected_asset table.",
                            str(asserted_installed), str(connected_total))
        actions += 1

    # Check: fleet tracker vs connected assets
    try:
        fleet_resp = requests.get(f"{WORKER_URL}/s2/fleet", timeout=15)
        fleet = fleet_resp.json()
        fleet_op_mw = sum(e.get("mw", 0) for e in fleet.get("raw_entries", [])
                          if e.get("status") == "operational")

        if asserted_installed and abs(fleet_op_mw - asserted_installed) > 100:
            log.warning(f"  Fleet operational ({fleet_op_mw} MW) differs from installed ({asserted_installed} MW)")
            cur2 = conn.cursor()
            create_model_action(cur2, "flag_review_needed", "fleet",
                                f"Fleet operational MW ({fleet_op_mw}) differs from Litgrid installed ({asserted_installed}). "
                                f"Fleet includes non-LT and all Baltic. Litgrid is LT-only.",
                                str(asserted_installed), str(fleet_op_mw))
            actions += 1
    except Exception as e:
        log.error(f"  Fleet check failed: {e}")

    conn.commit()
    cur.close()
    conn.close()
    log.info(f"  JOB 5 complete: {actions} model actions created")
    return actions


# ---------------------------------------------------------------------------
# JOB 6: Publish high-signal events to feed
# ---------------------------------------------------------------------------

def publish_high_signal_events():
    """Take today's assertions and publish top items to the website feed."""
    log.info("JOB 6: publish_high_signal_events")

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT assertion_id, assertion_type, subject, key, value_numeric, value_text,
               unit, confidence, source_url, source_type, affects_signals, model_action
        FROM assertion
        WHERE created_at::date = CURRENT_DATE
          AND is_current = TRUE
          AND affects_signals IS NOT NULL
        ORDER BY assertion_id DESC
        LIMIT 20
    """)
    assertions = cur.fetchall()

    if not assertions:
        log.info("  No new assertions today — nothing to publish")
        cur.close()
        conn.close()
        return 0

    events = []
    for a in assertions:
        subject = a["subject"] or ""
        key = a["key"]
        val = a["value_numeric"]
        unit = a["unit"] or ""
        confidence = a["confidence"]
        signals = a["affects_signals"] or []

        if "installed" in key and val:
            consequence = f"Installed storage base: {val:.0f} {unit}. Official Litgrid figure."
        elif "reserved" in key and val:
            consequence = f"TSO reserved storage: {val:.0f} {unit}. Pipeline pressure indicator."
        elif "intention" in key and val:
            consequence = f"Intention protocols: {val:.0f} {unit}. Early-stage pipeline signal."
        elif "apva" in key and val:
            consequence = f"APVA applications: {val:.0f} {unit}. Support scheme demand indicator."
        elif "connection" in key and val:
            sd_impact = val / EFF_DEMAND_MW
            consequence = f"New BESS connection: {val:.0f} {unit}. S/D impact: +{sd_impact:.3f}x."
        else:
            consequence = f"{subject}: {val:.0f} {unit}" if val else a["value_text"] or subject

        confidence_scores = {"official": 1.0, "observed": 0.8, "derived": 0.6, "modeled": 0.4, "editorial": 0.3}
        conf_score = confidence_scores.get(confidence, 0.5)
        mw_impact = min(1.0, (val or 0) / 500) if val else 0.3
        feed_score = round(conf_score * 0.4 + mw_impact * 0.3 + 0.8 * 0.3, 3)

        if feed_score < 0.5:
            continue

        category_map = {
            "installed_total": "project_stage",
            "reserved_total": "competition",
            "pipeline_total": "competition",
            "support_demand": "competition",
            "connected_bess": "project_stage",
            "methodology_note": "policy",
        }

        events.append({
            "title": f"{subject}"[:80] if subject else key[:80],
            "consequence": consequence[:200],
            "category": category_map.get(a["assertion_type"], "policy"),
            "geography": "LT",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "source": a["source_type"] or "pipeline",
            "source_url": a["source_url"],
            "source_quality": "tso_regulator" if confidence == "official" else "derived",
            "confidence": confidence[0].upper() if confidence else "C",
            "horizon": "near_term",
            "impact_direction": "mixed",
            "affected_modules": signals,
            "feed_score": feed_score,
            "status": "published",
        })

    if not events:
        log.info("  No events above score threshold")
        cur.close()
        conn.close()
        return 0

    try:
        resp = requests.post(
            f"{WORKER_URL}/feed/events",
            json={"items": events},
            headers={"Content-Type": "application/json",
                     "X-Update-Secret": UPDATE_SECRET},
            timeout=15,
        )
        result = resp.json()
        log.info(f"  Published: added={result.get('added', 0)}, total={result.get('total', 0)}")
    except Exception as e:
        log.error(f"  Feed publish failed: {e}")
        cur.close()
        conn.close()
        return 0

    cur.close()
    conn.close()
    return len(events)


# ---------------------------------------------------------------------------
# JOB 7: Push assertions to Worker KV (closes the loop)
# ---------------------------------------------------------------------------

def push_assertions_to_worker():
    """Push current assertion values to CF Worker KV via POST /s4/buildability.

    This closes the loop: scrapers -> Postgres -> assertions -> worker KV -> site.
    Without this, the site shows static hardcoded values forever.
    """
    log.info("JOB 7: push_assertions_to_worker")

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Fetch all current assertions
    cur.execute("""
        SELECT key, value_numeric, value_text, unit, confidence,
               source_url, source_type, as_of_date, affects_signals
        FROM assertion
        WHERE is_current = TRUE
        ORDER BY key
    """)
    rows = cur.fetchall()

    if not rows:
        log.info("  No assertions to push")
        cur.close()
        conn.close()
        return 0

    # Build the buildability payload from assertions
    assertions = {}
    for row in rows:
        assertions[row["key"]] = {
            "value": row["value_numeric"] if row["value_numeric"] is not None else row["value_text"],
            "unit": row["unit"],
            "confidence": row["confidence"],
            "source_url": row["source_url"],
            "source_type": row["source_type"],
            "as_of_date": row["as_of_date"].isoformat() if row["as_of_date"] else None,
            "affects_signals": row["affects_signals"],
        }

    # Also fetch connected asset totals
    cur.execute("""
        SELECT
            SUM(power_mw) AS total_mw,
            SUM(allowed_gen_mw) AS total_gen_mw,
            SUM(energy_mwh) AS total_mwh,
            COUNT(*) AS count
        FROM connected_asset
    """)
    ca = cur.fetchone()

    payload = {
        "assertions": assertions,
        "connected_assets": {
            "total_mw": float(ca["total_mw"]) if ca["total_mw"] else None,
            "total_gen_mw": float(ca["total_gen_mw"]) if ca["total_gen_mw"] else None,
            "total_mwh": float(ca["total_mwh"]) if ca["total_mwh"] else None,
            "count": ca["count"] or 0,
        },
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        resp = requests.post(
            f"{WORKER_URL}/s4/buildability",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Update-Secret": UPDATE_SECRET,
            },
            timeout=15,
        )
        result = resp.json()
        log.info(f"  Pushed to worker: {result}")
    except Exception as e:
        log.error(f"  Push to worker failed: {e}")
        cur.close()
        conn.close()
        return 0

    cur.close()
    conn.close()
    return len(assertions)




# ---------------------------------------------------------------------------
# JOB 8: Validate assertions (daily self-check)
# ---------------------------------------------------------------------------

PLAUSIBILITY_BOUNDS = {
    'installed_storage_lt_mw': (0, 800),
    'installed_storage_lv_mw': (0, 200),
    'installed_storage_ee_mw': (0, 400),
    'installed_storage_baltic_mw': (0, 1500),
    'reserved_storage_lt_mw': (0, 5000),
    'intention_storage_lt_mw': (0, 10000),
    'under_construction_storage_ee_mw': (0, 600),
}


def validate_assertions():
    """Challenge every current assertion against reality. Runs daily."""
    log.info('JOB 8: validate_assertions')
    issues = []

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # CHECK 1: Stale assertions (>60 days since update)
    cur.execute("""
        SELECT key, value_numeric, source_type, created_at
        FROM assertion WHERE is_current = TRUE
        AND created_at < NOW() - INTERVAL '60 days'
    """)
    for row in cur.fetchall():
        days_old = (datetime.now(timezone.utc) - row['created_at'].replace(tzinfo=timezone.utc)).days
        issues.append({'type': 'stale_assertion', 'key': row['key'], 'days_old': days_old})
        log.warning(f'  Stale: {row["key"]} ({days_old} days)')

    # CHECK 2: Plausibility bounds
    cur.execute('SELECT key, value_numeric FROM assertion WHERE is_current = TRUE AND value_numeric IS NOT NULL')
    for row in cur.fetchall():
        bounds = PLAUSIBILITY_BOUNDS.get(row['key'])
        if bounds and row['value_numeric'] is not None:
            if row['value_numeric'] < bounds[0] or row['value_numeric'] > bounds[1]:
                issues.append({'type': 'plausibility_fail', 'key': row['key'], 'value': row['value_numeric'], 'bounds': bounds})
                log.warning(f'  Plausibility: {row["key"]}={row["value_numeric"]} outside {bounds}')

    # CHECK 3: Installed totals match sum of connected assets per country
    for country, key_suffix in [('LT', 'lt'), ('LV', 'lv'), ('EE', 'ee')]:
        # Sum operational connected assets for this country
        cur.execute("""
            SELECT COALESCE(SUM(power_mw), 0) FROM connected_asset
            WHERE tso IN (%s) AND connection_date IS NOT NULL
        """, ({'Litgrid': 'Litgrid', 'AST': 'AST', 'Elering': 'Elering'}[
            {'LT': 'Litgrid', 'LV': 'AST', 'EE': 'Elering'}[country]],))
        asset_sum = cur.fetchone()['coalesce']

        cur.execute('SELECT value_numeric FROM assertion WHERE key = %s AND is_current = TRUE',
                    (f'installed_storage_{key_suffix}_mw',))
        row = cur.fetchone()
        assertion_mw = row['value_numeric'] if row else 0

        if abs(asset_sum - assertion_mw) > 10:
            issues.append({'type': 'total_mismatch', 'country': country,
                           'asset_sum': asset_sum, 'assertion': assertion_mw})
            log.warning(f'  Mismatch {country}: assets={asset_sum} vs assertion={assertion_mw}')

    # CHECK 4: Fleet vs assertions
    try:
        fleet_resp = requests.get(f'{WORKER_URL}/s2/fleet', timeout=15)
        fleet = fleet_resp.json()
        for country, key_suffix in [('LT', 'lt'), ('LV', 'lv'), ('EE', 'ee')]:
            fleet_op = sum(e.get('mw', 0) for e in fleet.get('raw_entries', [])
                          if e.get('country') == country and e.get('status') == 'operational')
            cur.execute('SELECT value_numeric FROM assertion WHERE key = %s AND is_current = TRUE',
                        (f'installed_storage_{key_suffix}_mw',))
            row = cur.fetchone()
            assertion_mw = row['value_numeric'] if row else 0
            if assertion_mw > 0 and fleet_op > assertion_mw * 1.5:
                issues.append({'type': 'fleet_exceeds_installed', 'country': country,
                               'fleet_op': fleet_op, 'assertion': assertion_mw})
    except Exception as e:
        log.error(f'  Fleet check failed: {e}')

    # CHECK 5: Under-construction projects — search for commissioning
    cur.execute("""
        SELECT asset_id, name, tso, power_mw FROM connected_asset
        WHERE connection_date IS NULL
    """)
    uc_projects = cur.fetchall()
    for p in uc_projects:
        issues.append({'type': 'check_commissioning', 'asset': p['name'],
                       'mw': p['power_mw'], 'tso': p['tso']})

    # Log results
    if issues:
        log.info(f'  Validation: {len(issues)} issues found')
        cur2 = conn.cursor()
        create_model_action(cur2, 'daily_validation', 'all',
                            f'{len(issues)} validation issues: ' +
                            ', '.join(f'{i["type"]}:{i.get("key",i.get("country",i.get("asset","?")))}' for i in issues[:5]))
        conn.commit()
    else:
        log.info('  Validation: all checks passed')

    cur.close()
    conn.close()
    return len(issues)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# JOB 9: News enrichment via Serper
# ---------------------------------------------------------------------------

def run_news_enrichment():
    """Search for recent news on top projects. Max 50 queries/day."""
    log.info("JOB 9: run_news_enrichment")
    try:
        import subprocess as sp
        result = sp.run(
            ["/opt/kkme/venv/bin/python", "/opt/kkme/app/python/intelligence/web_enricher.py",
             "--daily", "--limit", "15"],
            capture_output=True, text=True, timeout=180,
            env={**os.environ}
        )
        if result.stdout:
            for line in result.stdout.strip().splitlines()[-5:]:
                log.info("  " + line)
        if result.returncode != 0 and result.stderr:
            log.warning("  Enricher error: " + result.stderr.strip()[-200:])
        return 0
    except Exception as e:
        log.error("  News enrichment failed: " + str(e))
        return -1


JOB_MAP = {
    "sync_litgrid": sync_litgrid_announcements,
    "sync_vert": sync_vert_storage_permits,
    "sync_apva": sync_apva_support_events,
    "sync_market": sync_market_timeseries,
    "cross_reference": cross_reference_and_assert,
    "publish": publish_high_signal_events,
    "push_kv": push_assertions_to_worker,
    "validate": validate_assertions,
    "enrich": run_news_enrichment,
}

ALL_JOBS = list(JOB_MAP.keys())


def main():
    parser = argparse.ArgumentParser(description="KKME Daily Intelligence Pipeline")
    parser.add_argument("--all", action="store_true", help="Run all jobs")
    parser.add_argument("--job", type=str, help="Run a specific job")
    args = parser.parse_args()

    if not args.all and not args.job:
        print("Usage: daily_intel.py --all | --job <job_name>")
        print(f"Available jobs: {', '.join(ALL_JOBS)}")
        sys.exit(0)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    log.info(f"=== KKME Daily Intel Pipeline — {ts} ===")

    jobs_to_run = ALL_JOBS if args.all else [args.job]
    results = {}

    for job_name in jobs_to_run:
        if job_name not in JOB_MAP:
            log.error(f"Unknown job: {job_name}")
            continue
        try:
            result = JOB_MAP[job_name]()
            results[job_name] = result
            log.info(f"  {job_name}: {result}")
        except Exception as e:
            log.error(f"  {job_name} FAILED: {e}")
            results[job_name] = f"ERROR: {e}"

    log.info(f"=== Pipeline complete: {results} ===")


if __name__ == "__main__":
    main()
