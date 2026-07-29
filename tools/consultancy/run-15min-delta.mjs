/**
 * 15-minute capture uplift — Phase 36.B3, operator decision D1(c)
 *
 * The engine asserts `RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14`: quarter-hourly
 * dispatch is claimed to capture 14 % more spread than hourly. It is a
 * hardcoded constant applied to a published number, and the arc's "evidence
 * over assumption" thesis applies to it exactly as it does to trading
 * realisation.
 *
 * LT day-ahead has been natively PT15M since 2025-10-01 (36.B1-F), so the
 * constant is directly testable. The committed year files average sub-hourly
 * points into the hour under decision D1, so this re-fetches the same days at
 * native resolution and computes perfect-foresight capture both ways on
 * identical days:
 *
 *   uplift = capture(PT15M, 15) ÷ capture(hourly-averaged, 60) − 1
 *
 * Both sides use the worker's own `computeDayCapture`, which already takes a
 * resolution argument — so this measures the resolution effect and nothing else
 * (rule #4).
 *
 * Usage:
 *   node tools/consultancy/run-15min-delta.mjs --from 2025-10-01 --to 2026-06-30
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEngine, REPO_ROOT } from './engine.mjs';
import { writeRunOutput, hashOf } from './lib/runs.mjs';
import { parseA44, ZONE_EIC, ENTSOE_API } from './backfill-entsoe.mjs';

/** Read ENTSOE_API_KEY from the environment or .env.local. */
export function resolveToken() {
  if (process.env.ENTSOE_API_KEY) return process.env.ENTSOE_API_KEY;
  const envPath = join(REPO_ROOT, '.env.local');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*ENTSOE_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const stamp = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}0000`;

async function fetchWindow(eic, from, to, token) {
  const url =
    `${ENTSOE_API}?documentType=A44&in_Domain=${eic}&out_Domain=${eic}` +
    `&periodStart=${stamp(from)}&periodEnd=${stamp(to)}&securityToken=${token}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok) return body;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    const reason = /<text>([^<]*)</.exec(body)?.[1] ?? `HTTP ${res.status}`;
    if (/No matching data found/i.test(reason)) return '';
    throw new Error(`ENTSO-E ${res.status}: ${reason}`);
  }
  return '';
}

/**
 * Group native points into UTC delivery days, keeping only days that are
 * COMPLETE at quarter-hourly resolution. A partial day would compare a
 * truncated 15-minute curve against a full hourly one and manufacture a delta.
 */
export function toDays(raw) {
  const byDay = new Map();
  for (const p of raw) {
    if (p.resolution !== 'PT15M') continue;
    const dayKey = new Date(Math.floor(p.ts / 86_400_000) * 86_400_000).toISOString().slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(p);
  }

  const out = [];
  for (const [date, pts] of [...byDay.entries()].sort()) {
    if (pts.length !== 96) continue; // DST days and edges are dropped, counted below
    pts.sort((a, b) => a.ts - b.ts);
    const quarter = pts.map((p) => p.price);
    const hourly = Array.from({ length: 24 }, (_, h) => {
      const s = quarter.slice(h * 4, h * 4 + 4);
      return s.reduce((a, b) => a + b, 0) / s.length;
    });
    out.push({ date, quarter, hourly });
  }
  return { days: out, dropped: byDay.size - out.length };
}

export function measureUplift(days, dur_h, captureFn) {
  const rows = [];
  for (const d of days) {
    const q = captureFn(d.quarter, dur_h, 15);
    const h = captureFn(d.hourly, dur_h, 60);
    if (!q || !h || !(h.gross_eur_mwh > 0)) continue;
    rows.push({
      date: d.date,
      capture_15min: q.gross_eur_mwh,
      capture_hourly: h.gross_eur_mwh,
      uplift: q.gross_eur_mwh / h.gross_eur_mwh - 1,
    });
  }

  if (!rows.length) return { rows, n: 0 };

  // Volume-free, so weight by the hourly capture: the uplift matters in
  // proportion to the spread it is applied to, and a wild ratio on a €0.30
  // spread day should not move the headline.
  const wsum = rows.reduce((a, r) => a + r.capture_hourly, 0);
  const weighted = rows.reduce((a, r) => a + r.uplift * r.capture_hourly, 0) / wsum;
  const simple = rows.reduce((a, r) => a + r.uplift, 0) / rows.length;
  const sorted = rows.map((r) => r.uplift).sort((a, b) => a - b);

  return {
    rows,
    n: rows.length,
    weighted_uplift: weighted,
    simple_mean_uplift: simple,
    median_uplift: sorted[Math.floor(sorted.length / 2)],
    min_uplift: sorted[0],
    max_uplift: sorted[sorted.length - 1],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

  const zone = arg('zone', 'LT');
  const fromIso = arg('from', '2025-10-01');
  const toIso = arg('to', '2026-06-30');
  const dur_h = Number(arg('dur', 2));

  const token = resolveToken();
  if (!token) throw new Error('ENTSOE_API_KEY not found in env or .env.local');

  const engine = await loadEngine();
  const eic = ZONE_EIC[zone];

  // Month by month, padded a day either side: ENTSO-E serves whole CET market
  // days, so a UTC month boundary lands mid-market-day.
  const raw = [];
  const start = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const from = new Date(d); from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(d); to.setUTCMonth(to.getUTCMonth() + 1); to.setUTCDate(to.getUTCDate() + 1);
    process.stderr.write(`  fetching ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\n`);
    const xml = await fetchWindow(eic, from, to, token);
    if (!xml) continue;
    const parsed = parseA44(xml, { keepPoints: true });
    raw.push(...parsed.raw);
  }

  // Deduplicate: padded windows overlap by design.
  const seen = new Set();
  const dedup = raw.filter((p) => {
    const k = `${p.ts}:${p.resolution}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).filter((p) => p.ts >= start.getTime() && p.ts < end.getTime() + 86_400_000);

  const { days, dropped } = toDays(dedup);
  const m = measureUplift(days, dur_h, engine.computeDayCapture);
  const asserted = engine.RYSTAD_15MIN_UPLIFT_DECIMAL;

  console.log(`\n── 36.B3 · 15-minute capture uplift · ${zone} ${fromIso} → ${toIso} · ${dur_h}h ──\n`);
  console.log(`complete PT15M days   ${m.n}   (dropped ${dropped} incomplete/DST/non-PT15M)`);
  console.log(`\nASSERTED (engine)     ${asserted.toFixed(4)}   RYSTAD_15MIN_UPLIFT_DECIMAL`);
  console.log(`MEASURED (weighted)   ${m.weighted_uplift?.toFixed(4)}`);
  console.log(`delta                 ${(m.weighted_uplift - asserted >= 0 ? '+' : '') + (m.weighted_uplift - asserted).toFixed(4)}`);
  console.log(`simple mean           ${m.simple_mean_uplift?.toFixed(4)}`);
  console.log(`median                ${m.median_uplift?.toFixed(4)}`);
  console.log(`range                 ${m.min_uplift?.toFixed(4)} … ${m.max_uplift?.toFixed(4)}`);

  const payload = {
    meta: { phase: '36.B3', zone, from: fromIso, to: toIso, dur_h, n_days: m.n, dropped_days: dropped },
    basis: {
      method:
        'Perfect-foresight sort-and-dispatch capture (worker computeDayCapture) computed on ' +
        'the same delivery days at native PT15M and at the hourly average of those same ' +
        'quarter-hours. The only thing that differs is resolution.',
      note:
        'Measures the resolution effect on CAPTURE SPREAD, not on achieved revenue: a real ' +
        'quarter-hourly strategy also faces four times the execution decisions.',
      source: 'ENTSO-E Transparency A44, re-fetched at native resolution (committed year files are averaged under D1).',
    },
    asserted: { RYSTAD_15MIN_UPLIFT_DECIMAL: asserted },
    measured: {
      weighted_uplift: m.weighted_uplift,
      simple_mean_uplift: m.simple_mean_uplift,
      median_uplift: m.median_uplift,
      min_uplift: m.min_uplift,
      max_uplift: m.max_uplift,
      delta_vs_asserted: m.weighted_uplift - asserted,
    },
    daily: m.rows,
  };

  const { path: out } = writeRunOutput(
    `uplift-15min-${zone}-${fromIso}-${toIso}.json`, payload,
    {
      runner: 'uplift-15min', subject: `${zone}/${fromIso}→${toIso}`,
      inputs: { zone, from: fromIso, to: toIso, asserted },
      data_vintage: {
        kind: 'entsoe-live-fetch',
        source: payload.meta.source,
        zone, from: fromIso, to: toIso,
        n_days: payload.daily?.length ?? null,
        content_hash: hashOf(payload.daily ?? []),
      },
    }
  );
  console.log(`\nwrote ${out}`);
}
