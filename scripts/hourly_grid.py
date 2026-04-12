#!/usr/bin/env python3
"""
Hourly ENTSO-E genload refresh — pushes to Cloudflare KV via worker /kv/set.

Runs at :05 past every hour on the Hetzner VPS, 5 minutes after
the Cloudflare hourly cron at :00. Provides redundancy and fresher
data if ENTSO-E has updated since the worker's fetch.

Mirrors the worker's parseEntsoeXml(sumAllSeries=true) logic:
  - Sum each series' latest point regardless of timestamp alignment
  - Report the OLDEST contributing timestamp as the staleness bound
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET

import requests

# ── Config ──────────────────────────────────────────────────────────────────

ENTSOE_API = 'https://web-api.tp.entsoe.eu/api'
ENTSOE_KEY = os.environ.get('ENTSOE_API_KEY', '')
WORKER_URL = os.environ.get('KKME_API', 'https://kkme-fetch-s1.kastis-kemezys.workers.dev')
SECRET     = os.environ.get('UPDATE_SECRET', '')

COUNTRIES = [
    {'key': 'lt', 'eic': '10YLT-1001A0008Q'},
    {'key': 'lv', 'eic': '10YLV-1001A00074'},
    {'key': 'ee', 'eic': '10Y1001A1001A39I'},
]

NS = {'e': 'urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0'}

log = logging.getLogger('hourly_grid')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(name)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)


# ── ENTSO-E time format ────────────────────────────────────────────────────

def entsoe_ts(dt):
    return dt.strftime('%Y%m%d%H%M')


# ── XML parser (mirrors worker parseEntsoeXml) ─────────────────────────────

def parse_gen_xml(xml_text):
    """Parse A75 generation XML. Sum each series' latest point.
    Returns (total_mw, oldest_iso, newest_iso, series_count) or None."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    # Handle both namespaced and non-namespaced XML
    ts_blocks = root.findall('.//TimeSeries') or root.findall('.//e:TimeSeries', NS)
    if not ts_blocks:
        return None

    total = 0.0
    oldest = None
    newest = None
    count = 0

    for ts in ts_blocks:
        period = ts.find('Period') or ts.find('e:Period', NS)
        if period is None:
            continue

        start_el = period.find('timeInterval/start') or period.find('e:timeInterval/e:start', NS)
        res_el = period.find('resolution') or period.find('e:resolution', NS)
        if start_el is None or res_el is None:
            continue

        period_start = datetime.fromisoformat(start_el.text.replace('Z', '+00:00'))
        res_text = res_el.text or 'PT60M'
        if res_text == 'PT15M':
            res_mins = 15
        elif res_text == 'PT30M':
            res_mins = 30
        else:
            res_mins = 60

        # Collect all points, take the last one
        points = period.findall('Point') or period.findall('e:Point', NS)
        if not points:
            continue

        last_point = points[-1]
        pos_el = last_point.find('position') or last_point.find('e:position', NS)
        qty_el = last_point.find('quantity') or last_point.find('e:quantity', NS)
        if pos_el is None or qty_el is None:
            continue

        position = int(pos_el.text)
        quantity = float(qty_el.text)
        point_time = period_start + timedelta(minutes=(position - 1) * res_mins)

        total += quantity
        count += 1
        if oldest is None or point_time < oldest:
            oldest = point_time
        if newest is None or point_time > newest:
            newest = point_time

    if oldest is None:
        return None

    return (round(total), oldest.isoformat(), newest.isoformat(), count)


def parse_load_xml(xml_text):
    """Parse A65 load XML. Single series, last point.
    Returns (mw, timestamp_iso) or None."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    ts_blocks = root.findall('.//TimeSeries') or root.findall('.//e:TimeSeries', NS)
    if not ts_blocks:
        return None

    best_time = None
    best_qty = None

    for ts in ts_blocks:
        period = ts.find('Period') or ts.find('e:Period', NS)
        if period is None:
            continue

        start_el = period.find('timeInterval/start') or period.find('e:timeInterval/e:start', NS)
        res_el = period.find('resolution') or period.find('e:resolution', NS)
        if start_el is None or res_el is None:
            continue

        period_start = datetime.fromisoformat(start_el.text.replace('Z', '+00:00'))
        res_text = res_el.text or 'PT60M'
        if res_text == 'PT15M':
            res_mins = 15
        elif res_text == 'PT30M':
            res_mins = 30
        else:
            res_mins = 60

        points = period.findall('Point') or period.findall('e:Point', NS)
        if not points:
            continue

        last_point = points[-1]
        pos_el = last_point.find('position') or last_point.find('e:position', NS)
        qty_el = last_point.find('quantity') or last_point.find('e:quantity', NS)
        if pos_el is None or qty_el is None:
            continue

        position = int(pos_el.text)
        quantity = float(qty_el.text)
        point_time = period_start + timedelta(minutes=(position - 1) * res_mins)

        if best_time is None or point_time > best_time:
            best_time = point_time
            best_qty = quantity

    if best_time is None:
        return None

    return (round(best_qty), best_time.isoformat())


# ── Fetch one country ──────────────────────────────────────────────────────

def fetch_country(key, eic):
    now = datetime.now(timezone.utc)
    start = entsoe_ts(now - timedelta(hours=2))
    end = entsoe_ts(now)

    gen_mw = None
    gen_ts = None
    load_mw = None
    load_ts = None

    # A75 — generation per psrType
    try:
        url = (f'{ENTSOE_API}?documentType=A75&processType=A16'
               f'&in_Domain={eic}&periodStart={start}&periodEnd={end}'
               f'&securityToken={ENTSOE_KEY}')
        r = requests.get(url, timeout=15)
        if r.ok:
            result = parse_gen_xml(r.text)
            if result:
                gen_mw, gen_oldest, gen_newest, gen_count = result
                gen_ts = gen_oldest  # report oldest contributing timestamp
                log.info(f'  {key} gen: {gen_mw} MW ({gen_count} series, oldest={gen_oldest})')
    except Exception as e:
        log.warning(f'  {key} gen fetch failed: {e}')

    # A65 — total load
    try:
        url = (f'{ENTSOE_API}?documentType=A65&processType=A16'
               f'&outBiddingZone_Domain={eic}&periodStart={start}&periodEnd={end}'
               f'&securityToken={ENTSOE_KEY}')
        r = requests.get(url, timeout=15)
        if r.ok:
            result = parse_load_xml(r.text)
            if result:
                load_mw, load_ts_str = result
                load_ts = load_ts_str
                log.info(f'  {key} load: {load_mw} MW (ts={load_ts_str})')
    except Exception as e:
        log.warning(f'  {key} load fetch failed: {e}')

    net_mw = None
    if gen_mw is not None and load_mw is not None:
        net_mw = gen_mw - load_mw

    data_age = None
    ts = gen_ts or load_ts
    if ts:
        try:
            ts_dt = datetime.fromisoformat(ts)
            data_age = round((now - ts_dt).total_seconds() / 60)
        except Exception:
            pass

    return {
        'generation_mw': gen_mw,
        'load_mw': load_mw,
        'net_mw': net_mw,
        'timestamp': ts,
        'data_age_minutes': data_age,
    }


# ── Push to KV ─────────────────────────────────────────────────────────────

def push_kv(key, data):
    if not SECRET:
        log.warning(f'KV push {key}: no UPDATE_SECRET')
        return False
    try:
        resp = requests.post(f'{WORKER_URL}/kv/set',
            json={'key': key, 'value': data},
            headers={'Content-Type': 'application/json',
                     'X-Update-Secret': SECRET},
            timeout=10)
        log.info(f'KV push {key}: {resp.status_code}')
        return resp.status_code == 200
    except Exception as e:
        log.warning(f'KV push {key}: {e}')
        return False


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    if not ENTSOE_KEY:
        log.error('ENTSOE_API_KEY not set')
        sys.exit(1)
    if not SECRET:
        log.error('UPDATE_SECRET not set')
        sys.exit(1)

    log.info('Hourly grid refresh starting...')

    payload = {'fetched_at': datetime.now(timezone.utc).isoformat(), 'source': 'vps_hourly'}
    ok = True

    for c in COUNTRIES:
        log.info(f'Fetching {c["key"].upper()}...')
        try:
            result = fetch_country(c['key'], c['eic'])
            payload[c['key']] = result
        except Exception as e:
            log.error(f'{c["key"]} failed: {e}')
            payload[c['key']] = {
                'generation_mw': None, 'load_mw': None,
                'net_mw': None, 'timestamp': None, 'data_age_minutes': None,
            }
            ok = False

    # Push to KV
    if push_kv('genload', payload):
        log.info('genload KV push succeeded')
    else:
        log.error('genload KV push failed')
        ok = False

    # Summary
    for c in COUNTRIES:
        d = payload.get(c['key'], {})
        log.info(f'  {c["key"].upper()}: gen={d.get("generation_mw")} load={d.get("load_mw")} '
                 f'net={d.get("net_mw")} age={d.get("data_age_minutes")}min')

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
