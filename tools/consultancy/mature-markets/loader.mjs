// Loader for the mature-market evidence base.
//
// Everything downstream — the summary table, the fixture tests, and eventually the 36.E1-E5
// calibrations — reads through here, so this is where the honesty rules are enforced once
// instead of being re-remembered per analysis:
//
//  * Checksums are verified against each dataset's manifest. A file that has drifted from
//    its manifest is a hard error, not a warning: the manifest is what makes a committed
//    number traceable to a retrieval, and a mismatch means one of them is lying.
//  * Rows are re-validated against the schema on load. The fetchers validate before writing,
//    but a gate that only ever runs inside the process that produced the data proves nothing
//    about what is on disk.
//  * Aggregation is duration-weighted. Mixing PT15M and PT60M rows with an unweighted mean
//    over-weights the fine-resolution periods by 4x, which is exactly the kind of error that
//    survives review because the output still looks like a price.
//  * Nulls never become zeros. Every aggregate reports how many rows it dropped for a null
//    price, so a series that is mostly absent cannot present as a series that is mostly cheap.
//
// No network access. Everything here reads committed bytes.

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { validateRow } from './schema.mjs';

const DATA = path.join(import.meta.dirname, '..', 'data', 'mature-markets');

export const DATASETS = ['de', 'se', 'gb', 'au', 'da', 'activation'];

const RES_MIN = { PT5M: 5, PT15M: 15, PT30M: 30, PT60M: 60, PT1H: 60, PT2H: 120, PT3H: 180, PT4H: 240, PT5H: 300, PT24H: 1440 };

/** Minutes covered by a row, preferring the measured span over the nominal resolution label. */
export function rowMinutes(r) {
  const measured = (Date.parse(r.period_end) - Date.parse(r.period_start)) / 60000;
  if (Number.isFinite(measured) && measured > 0) return measured;
  return RES_MIN[r.resolution] ?? null;
}

export async function readManifest(dataset) {
  const p = path.join(DATA, dataset, 'manifest.json');
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

/**
 * Load one dataset's rows.
 * @param {string} dataset            directory under data/mature-markets
 * @param {object} [opts]
 * @param {boolean} [opts.verifyChecksums=true]
 * @param {boolean} [opts.validate=true]
 * @param {(r:object)=>boolean} [opts.filter]
 */
export async function loadDataset(dataset, opts = {}) {
  const { verifyChecksums = true, validate = true, filter } = opts;
  const manifest = await readManifest(dataset);
  const rows = [];
  const problems = [];
  let checked = 0;

  for (const f of manifest.files ?? []) {
    const p = path.join(DATA, dataset, f.file);
    const buf = await fs.readFile(p);
    if (verifyChecksums && f.sha256) {
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (sha !== f.sha256) {
        throw new Error(`${dataset}/${f.file}: sha256 mismatch — manifest ${f.sha256.slice(0, 16)}…, file ${sha.slice(0, 16)}…. Either the file changed after the manifest was written or the manifest is stale; neither may be silently accepted.`);
      }
      checked++;
    }
    const text = zlib.gunzipSync(buf).toString('utf8');
    let n = 0;
    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      n++;
      if (validate) {
        const bad = validateRow(r);
        if (bad.length && problems.length < 20) problems.push({ file: f.file, bad, period_start: r.period_start, product: r.product });
      }
      if (!filter || filter(r)) rows.push(r);
    }
    if (f.rows !== undefined && n !== f.rows) {
      problems.push({ file: f.file, bad: [`row count ${n} != manifest ${f.rows}`] });
    }
  }

  if (problems.length) {
    throw new Error(`${dataset}: ${problems.length} integrity problems, first: ${JSON.stringify(problems[0])}`);
  }
  return { manifest, rows, filesChecked: checked };
}

/** Load several datasets at once. */
export async function loadAll(datasets = DATASETS, opts = {}) {
  const out = { rows: [], manifests: {} };
  for (const d of datasets) {
    const { manifest, rows } = await loadDataset(d, opts);
    out.manifests[d] = manifest;
    out.rows.push(...rows);
  }
  return out;
}

export async function loadCalendar() {
  return JSON.parse(await fs.readFile(path.join(DATA, 'calendar', 'structural-breaks.json'), 'utf8'));
}

// ── Aggregation ────────────────────────────────────────────────────────────

/** Series key that identifies one price series unambiguously. */
export const seriesKey = (r) => `${r.market}|${r.area}|${r.product}|${r.direction ?? '-'}|${r.mechanism}`;

/**
 * Duration-weighted monthly aggregate of `price_norm`.
 *
 * Returns per month: the weighted mean, the unweighted median, p10 and p90, the weighted mean
 * procured volume, and — deliberately prominent — how many rows carried a null price. A month
 * whose price is 90 % absent must not read the same as a month whose price is low.
 *
 * @param {object[]} rows  rows of ONE series (same seriesKey)
 */
export function monthlyAggregate(rows) {
  const byMonth = new Map();
  for (const r of rows) {
    const m = r.period_start.slice(0, 7);
    let g = byMonth.get(m);
    if (!g) byMonth.set(m, g = { month: m, wSum: 0, wTot: 0, prices: [], volWSum: 0, volWTot: 0, nRows: 0, nNullPrice: 0, minutes: 0, resolutions: new Set() });
    g.nRows++;
    g.resolutions.add(r.resolution);
    const mins = rowMinutes(r) ?? 0;
    g.minutes += mins;
    if (r.price_norm === null) { g.nNullPrice++; }
    else { g.wSum += r.price_norm * mins; g.wTot += mins; g.prices.push(r.price_norm); }
    if (r.volume !== null) { g.volWSum += r.volume * mins; g.volWTot += mins; }
  }
  const pct = (a, q) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const i = (s.length - 1) * q;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((g) => ({
    month: g.month,
    mean: g.wTot ? g.wSum / g.wTot : null,
    median: pct(g.prices, 0.5),
    p10: pct(g.prices, 0.1),
    p90: pct(g.prices, 0.9),
    volume_mean: g.volWTot ? g.volWSum / g.volWTot : null,
    n_rows: g.nRows,
    n_priced: g.prices.length,
    n_null_price: g.nNullPrice,
    coverage: g.nRows ? g.prices.length / g.nRows : 0,
    hours: g.minutes / 60,
    resolutions: [...g.resolutions].sort(),
  }));
}

/** Group rows into series. */
export function bySeries(rows) {
  const m = new Map();
  for (const r of rows) (m.get(seriesKey(r)) ?? m.set(seriesKey(r), []).get(seriesKey(r))).push(r);
  return m;
}

// ── Structural-break segmentation ──────────────────────────────────────────

/**
 * Segment a monthly series on the calendar's breaks.
 *
 * Only breaks whose market and product match are applied, and only those with a severity that
 * actually invalidates a fit across them. `series_start` breaks are coverage boundaries and do
 * not split anything.
 *
 * The calendar is the ONLY source of break dates. Detecting breaks from the series and then
 * measuring decay between them would fit the noise and call it structure.
 */
export function segmentMonths(months, breaks, { market, product }) {
  const relevant = breaks
    .filter((b) => (b.market === market || (b.market === 'BALTIC' && ['LT', 'LV', 'EE'].includes(market))))
    .filter((b) => !b.products || b.products.includes(product))
    .filter((b) => ['high', 'unit_affecting', 'area_affecting'].includes(b.severity))
    .map((b) => ({ ...b, month: b.date.slice(0, 7) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const segments = [];
  let current = { from: months[0]?.month ?? null, months: [], opened_by: 'series start', closed_by: null };
  for (const m of months) {
    const hit = relevant.find((b) => b.month === m.month);
    if (hit && current.months.length) {
      current.to = current.months.at(-1).month;
      current.closed_by = `${hit.date} ${hit.kind} (${hit.severity})`;
      segments.push(current);
      current = { from: m.month, months: [], opened_by: `${hit.date} ${hit.kind} (${hit.severity})`, closed_by: null };
    }
    current.months.push(m);
  }
  if (current.months.length) { current.to = current.months.at(-1).month; segments.push(current); }
  return { segments, breaks_applied: relevant.map((b) => ({ date: b.date, kind: b.kind, severity: b.severity, description: b.description })) };
}
