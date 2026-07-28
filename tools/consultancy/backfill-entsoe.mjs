/**
 * ENTSO-E day-ahead price backfill — Phase 36.B1
 *
 * Fetches hourly day-ahead prices from the ENTSO-E Transparency Platform
 * (documentType A44) and writes one committed JSON file per zone-year to
 * `tools/consultancy/data/`. Those files are the price shapes the hourly
 * dispatch engine replays; committing them is what makes a dispatch run
 * reproducible by a third party (arc doc 36.B6, auditability).
 *
 * Two details of the A44 format are load-bearing and were verified against live
 * responses rather than assumed (Pause A, discipline rule #1):
 *
 *  1. `curveType` is **A03** (variable sized block). A position that does not
 *     appear repeats the previous position's price until the next one that
 *     does. A parser that treats missing positions as gaps silently drops real
 *     price hours — so this one fills forward to the period's declared end.
 *
 *  2. Lithuania's day-ahead moved from PT60M to PT15M on delivery day
 *     **2025-10-01** (Pause A probe; the worker comment saying "Sep 2025" is a
 *     month early). Per operator decision D1 the quarter-hours are averaged
 *     down to hourly here, which is the conservative direction: it discards
 *     intraday granularity the battery could have captured, so it understates
 *     rather than overstates. Phase 36.B3 measures what that costs against the
 *     engine's asserted `RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14`.
 *
 * Timestamps are handled as absolute UTC throughout. ENTSO-E publishes market
 * days on CET/CEST boundaries, so a "day" is 23, 24 or 25 hours across DST
 * changes; indexing by absolute UTC instant is what keeps a chronological year
 * chronological through those transitions.
 *
 * Usage:
 *   node tools/consultancy/backfill-entsoe.mjs --zone LT --from 2021 --to 2026
 *   node tools/consultancy/backfill-entsoe.mjs --zone LT --year 2024 --force
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './engine.mjs';

export const DATA_DIR = join(HERE, 'data');
const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';

/** Bidding-zone EICs. Verified live in Pause A: all three serve A44 back to 2015. */
export const ZONE_EIC = {
  LT: '10YLT-1001A0008Q',
  LV: '10YLV-1001A00074',
  EE: '10Y1001A1001A39I',
  SE4: '10Y1001A1001A47J',
  PL: '10YPL-AREA-----S',
};

/**
 * The day Lithuanian day-ahead switched to 15-minute market time units.
 * Probed, not assumed: 2025-09-29 returns PT60M only, 2025-10-01 PT15M only,
 * and the 2025-09-30 window returns both.
 */
export const MTU_15MIN_FROM = '2025-10-01';

const RESOLUTION_MINUTES = { PT60M: 60, PT30M: 30, PT15M: 15 };

// ── XML parsing ────────────────────────────────────────────────────────────

function tagValue(xml, tag) {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m ? m[1] : null;
}

function allBlocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * Parse one A44 document into a Map of ISO-UTC-hour → { sum, n, native }.
 *
 * Sub-hourly points are accumulated into their containing hour so the caller
 * can average them (decision D1). `native` records the resolution each hour was
 * built from, which the output file reports so a reader can see exactly which
 * part of a year is post-MTU-change.
 */
export function parseA44(xml) {
  const acc = new Map();
  let points = 0;

  for (const series of allBlocks(xml, 'TimeSeries')) {
    for (const period of allBlocks(series, 'Period')) {
      const interval = allBlocks(period, 'timeInterval')[0] ?? period;
      const start = tagValue(interval, 'start');
      const end = tagValue(interval, 'end');
      const resolution = tagValue(period, 'resolution');
      const stepMin = RESOLUTION_MINUTES[resolution];
      if (!start || !end || !stepMin) continue;

      const t0 = Date.parse(start);
      const t1 = Date.parse(end);
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;

      const slots = Math.round((t1 - t0) / (stepMin * 60_000));

      // Collect the positions this period actually declares.
      const declared = new Map();
      const re = /<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>([-\d.eE+]+)<\/price\.amount>[\s\S]*?<\/Point>/g;
      let m;
      while ((m = re.exec(period)) !== null) {
        declared.set(Number(m[1]), Number(m[2]));
      }
      if (declared.size === 0) continue;

      // curveType A03: carry the last declared price forward across any
      // position the document omits, through to the period's declared end.
      let last = null;
      for (let pos = 1; pos <= slots; pos++) {
        if (declared.has(pos)) last = declared.get(pos);
        if (last === null || !Number.isFinite(last)) continue;

        const ts = t0 + (pos - 1) * stepMin * 60_000;
        const hourKey = new Date(Math.floor(ts / 3_600_000) * 3_600_000).toISOString();
        const cur = acc.get(hourKey) ?? { sum: 0, n: 0, native: resolution };
        cur.sum += last;
        cur.n += 1;
        cur.native = resolution;
        acc.set(hourKey, cur);
        points += 1;
      }
    }
  }

  return { acc, points };
}

// ── Fetching ───────────────────────────────────────────────────────────────

const stamp = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}0000`;

async function fetchWindow(eic, from, to, token) {
  const url =
    `${ENTSOE_API}?documentType=A44&in_Domain=${eic}&out_Domain=${eic}` +
    `&periodStart=${stamp(from)}&periodEnd=${stamp(to)}&securityToken=${token}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (res.ok) return body;
      // 429 = rate limit; ENTSO-E allows 400 req/min. Back off and retry.
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      const reason = /<text>([^<]*)</.exec(body)?.[1] ?? `HTTP ${res.status}`;
      // "No matching data found" is a legitimate empty window, not a failure.
      if (/No matching data found/i.test(reason)) return '';
      throw new Error(`ENTSO-E ${res.status}: ${reason}`);
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return '';
}

/** Hours in a calendar year, counted in UTC (accounts for leap years). */
export function hoursInYear(year) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 3_600_000;
}

/**
 * Build one zone-year of chronological UTC hourly prices.
 * Returns the file payload; the caller writes it.
 */
export async function backfillYear(zone, year, token) {
  const eic = ZONE_EIC[zone];
  if (!eic) throw new Error(`unknown zone "${zone}"`);

  const merged = new Map();
  let rawPoints = 0;

  // Month-by-month. Each window is padded a day either side because ENTSO-E
  // returns whole CET market days, and the year's first/last UTC hours belong
  // to market days that start in the neighbouring month.
  for (let month = 0; month < 12; month++) {
    const from = new Date(Date.UTC(year, month, 1));
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(Date.UTC(year, month + 1, 1));
    to.setUTCDate(to.getUTCDate() + 1);

    const xml = await fetchWindow(eic, from, to, token);
    if (!xml) continue;
    const { acc, points } = parseA44(xml);
    rawPoints += points;
    for (const [k, v] of acc) {
      const cur = merged.get(k);
      // Later windows overlap earlier ones at month edges; keep the richer
      // sample rather than double-counting.
      if (!cur || v.n > cur.n) merged.set(k, v);
    }
  }

  const hours = hoursInYear(year);
  const yearStart = Date.UTC(year, 0, 1);
  const prices = new Array(hours).fill(null);
  const nativeCount = {};
  let covered = 0;

  for (let h = 0; h < hours; h++) {
    const key = new Date(yearStart + h * 3_600_000).toISOString();
    const cell = merged.get(key);
    if (!cell || cell.n === 0) continue;
    // D1: average sub-hourly points into the hour.
    prices[h] = Math.round((cell.sum / cell.n) * 100) / 100;
    nativeCount[cell.native] = (nativeCount[cell.native] ?? 0) + 1;
    covered += 1;
  }

  return {
    zone,
    eic,
    year,
    source: 'ENTSO-E Transparency Platform, documentType A44 (day-ahead prices)',
    licence: 'ENTSO-E Transparency Platform — free re-use with attribution',
    unit: 'EUR/MWh',
    timebase: 'UTC, chronological, index 0 = Jan 1 00:00 UTC',
    resolution: 'PT60M (sub-hourly source points averaged into the hour — Phase 36.B1 decision D1)',
    native_resolution_hours: nativeCount,
    mtu_15min_from: MTU_15MIN_FROM,
    fetched_at: new Date().toISOString(),
    hours,
    hours_covered: covered,
    coverage_pct: Math.round((covered / hours) * 10000) / 100,
    raw_points_parsed: rawPoints,
    prices_eur_mwh: prices,
  };
}

export function dataPath(zone, year) {
  return join(DATA_DIR, `da-hourly-${zone}-${year}.json`);
}

/** Load a committed zone-year file. Throws with a useful message if absent. */
export function loadPriceYear(zone, year) {
  const path = dataPath(zone, year);
  if (!existsSync(path)) {
    throw new Error(
      `no price data for ${zone} ${year} at ${path} — run:\n` +
      `  node tools/consultancy/backfill-entsoe.mjs --zone ${zone} --year ${year}`
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };

  const token = process.env.ENTSOE_API_KEY ?? readLocalToken();
  if (!token) {
    console.error('ENTSOE_API_KEY not set (env or .env.local)');
    process.exit(1);
  }

  const zone = arg('zone', 'LT');
  const force = argv.includes('--force');
  const single = arg('year', null);
  const from = single ? Number(single) : Number(arg('from', 2021));
  const to = single ? Number(single) : Number(arg('to', new Date().getUTCFullYear()));

  mkdirSync(DATA_DIR, { recursive: true });

  for (let year = from; year <= to; year++) {
    const path = dataPath(zone, year);
    if (existsSync(path) && !force) {
      const cur = JSON.parse(readFileSync(path, 'utf8'));
      console.log(`${zone} ${year}: cached (${cur.coverage_pct}% coverage) — --force to refetch`);
      continue;
    }
    process.stdout.write(`${zone} ${year}: fetching… `);
    const payload = await backfillYear(zone, year, token);
    writeFileSync(path, JSON.stringify(payload) + '\n');
    const native = Object.entries(payload.native_resolution_hours)
      .map(([k, v]) => `${k}:${v}h`)
      .join(' ');
    console.log(
      `${payload.hours_covered}/${payload.hours} h (${payload.coverage_pct}%) ${native}`
    );
  }
}

function readLocalToken() {
  for (const f of ['.env.local', '.env']) {
    const p = join(HERE, '../..', f);
    if (!existsSync(p)) continue;
    const m = /^ENTSOE_API_KEY=(.*)$/m.exec(readFileSync(p, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
