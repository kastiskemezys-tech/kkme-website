// Sweden — FCR-N and FCR-D capacity prices from Svenska kraftnät's Mimer portal.
//
// WHY SWEDEN IS IN THIS EVIDENCE BASE. The arc's claim that a saturated market's price floor
// is "the opportunity cost of the marginal provider's next-best use" only has teeth if the
// floor is shown to move when the marginal provider changes technology. Sweden's FCR-N floor
// is set by hydro, not batteries. It is the contrast case, and the only reason to spend a
// dataset slot on a market whose battery fleet is smaller than Germany's.
//
// CHANNEL. https://mimer.svk.se/PrimaryRegulation/DownloadText?periodFrom=&periodTo=
//   Unauthenticated. Semicolon-delimited, comma decimal separator, hourly, prices in EUR/MW,
//   volumes in MW per bidding zone (SE1-SE4 and DK2, which buys through the Swedish market).
//
// COVERAGE, MEASURED NOT CLAIMED (A5) — and the trap this file exists to defuse:
//   Dates before 2021-01 return HTTP 200 with a full grid of hourly rows in which every
//   price and every volume is exactly 0. That is absence rendered as zero. A loader that
//   took it at face value would compute an FCR-N floor of EUR 0/MW/h and a peak-to-floor
//   ratio of infinity — a number that would then be defended in front of a lender.
//   Measured first month with real data: 2021-01 (121/121 sampled rows non-zero).
//   All-zero rows are therefore dropped as no_coverage and counted in the manifest.
//
// UNITS. The header says EUR/MW. Swedish FCR products are hourly, so EUR/MW per hour and
// EUR/MW/h coincide; price_norm equals price. This is asserted in the loader test rather
// than assumed here, because "the units happened to agree" is exactly the kind of
// coincidence that stops being true after a market reform.
//
// Usage: node tools/consultancy/mature-markets/fetch-se-svk.mjs [--from 2021-01] [--to 2026-07]

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { row, validateRow } from './schema.mjs';
import { stockholmWallClockToUtc } from './tz.mjs';
import { writeManifest } from './manifest-writer.mjs';

const BASE = 'https://mimer.svk.se/PrimaryRegulation/DownloadText';
const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'se');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const FROM = arg('from', '2020-01');   // deliberately before the real start, to re-measure it
const TO = arg('to', new Date().toISOString().slice(0, 7));

// Product name → (schema product, direction). FCR-D is directional; FCR-N is symmetric.
const SERIES = [
  { col: 'FCR-N Pris (EUR/MW)', product: 'FCR-N', direction: 'symmetric', volCol: 'Total' },
  { col: 'FCR-D upp Pris (EUR/MW)', product: 'FCR-D-up', direction: 'up', volCol: 'Total FCRD upp' },
  { col: 'FCR-D ned Pris (EUR/MW)', product: 'FCR-D-down', direction: 'down', volCol: 'Total FCRD ned' },
];
const ZONE_COLS = {
  'FCR-N': { SE1: 'SE1 FCRN', SE2: 'SE2 FCRN', SE3: 'SE3 FCRN', SE4: 'SE4 FCRN', DK2: 'DK2 FCRN' },
  'FCR-D-up': { SE1: 'SE1 FCRD upp', SE2: 'SE2 FCRD upp', SE3: 'SE3 FCRD upp', SE4: 'SE4 FCRD upp', DK2: 'DK2 FCRD upp' },
  'FCR-D-down': { SE1: 'SE1 FCRD ned', SE2: 'SE2 FCRD ned', SE3: 'SE3 FCRD ned', SE4: 'SE4 FCRD ned', DK2: 'DK2 FCRD ned' },
};

const num = (s) => {
  if (s === undefined || s === null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-') return null;
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

function monthRanges(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const mm = String(m).padStart(2, '0');
    const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
    out.push({ key: `${y}-${mm}`, from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}` });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

async function fetchMonth(r) {
  const u = `${BASE}?periodFrom=${r.from}&periodTo=${r.to}`;
  for (let a = 1; a <= 4; a++) {
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { url: u, text: await res.text() };
    } catch (e) {
      if (a === 4) throw new Error(`${r.key}: ${e.message}`);
      await new Promise((s) => setTimeout(s, 700 * a));
    }
  }
}

function parseMonth(text, monthKey, stats) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(';').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const s of SERIES) if (!(s.col in idx)) throw new Error(`${monthKey}: missing column "${s.col}" — the export schema changed`);

  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(';');
    const stamp = (c[idx.Datum] ?? '').trim();            // "2026-01-01 00:00:00", local wall clock
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(stamp);
    if (!m) continue;
    const minutes = Number(m[2]) * 60 + Number(m[3]);

    // The all-zero guard. Absence is served as a complete row of zeros, HTTP 200.
    const allValues = header.map((h, i) => (h === 'Datum' ? null : num(c[i]))).filter((v) => v !== null);
    if (allValues.length && allValues.every((v) => v === 0)) { stats.zeroRows++; continue; }

    for (const s of SERIES) {
      const price = num(c[idx[s.col]]);
      const vol = s.volCol in idx ? num(c[idx[s.volCol]]) : null;
      if (price === null && vol === null) continue;
      const zones = {};
      for (const [z, col] of Object.entries(ZONE_COLS[s.product])) if (col in idx) zones[z] = num(c[idx[col]]);
      // period_end is start + 1 h in ABSOLUTE time, not the resolved wall clock one hour
      // later: on the spring-forward day the next wall-clock hour does not exist and
      // resolves back onto the start, producing a zero-length period.
      const startIso = stockholmWallClockToUtc(m[1], minutes);
      rows.push(row({
        market: 'SE', area: 'SE', product: s.product, direction: s.direction, mechanism: 'cap',
        period_start: startIso,
        period_end: new Date(Date.parse(startIso) + 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        resolution: 'PT1H',
        price, price_unit: 'EUR/MW', currency: 'EUR', price_eur: price, fx_rate: price === null ? null : 1,
        // Swedish FCR products are hourly, so EUR/MW and EUR/MW/h coincide. Asserted in the test.
        price_norm: price, price_norm_unit: price === null ? null : 'EUR/MW/h',
        volume: vol, volume_unit: vol === null ? null : 'MW',
        price_basis: price === null ? null : 'clearing',
        notes: null,
        extra: { zone_volumes_mw: zones, local_timestamp: stamp },
      }));
      stats.kept++;
    }
  }
  return rows;
}

/**
 * Null every row where a product's price AND volume are both exactly zero.
 *
 * Three layers of this trap were found in this one source, each invisible to the layer above:
 *
 *  1. Whole rows of zeros for dates before coverage starts — caught in parseMonth.
 *  2. One product column of zeros while the rest of the row is real: FCR-D down from 2020-12
 *     until its market opened in 2021-12. Left alone this put the FCR-D-down floor at
 *     EUR 0/MW/h and made peak-to-floor undefined.
 *  3. A single MISSING HOUR published as zeros mid-series: 2021-12-06T23:00Z for FCR-D up,
 *     between hours clearing at ~97 EUR/MW on ~495 MW. Sweden did not stop procuring FCR-D
 *     for one hour and resume. A leading-run rule cannot catch this one.
 *
 * The rule is therefore general rather than positional, and it is justified by measurement
 * rather than by assumption: across the whole committed Swedish dataset there is not one row
 * with volume 0 and a positive price, nor one with price 0 and positive volume. The
 * both-exactly-zero combination never co-occurs with real data in this source, so treating it
 * as absence loses nothing. If that ever stops being true the loader test will say so.
 *
 * The per-product first-real-period boundary is still reported, because it is the market-open
 * date derived from data (rule #2) and E1 cites it.
 */
function nullLeadingAbsence(rowsByYear) {
  const all = [...rowsByYear.values()].flat();
  const byProduct = new Map();
  for (const r of all) (byProduct.get(r.product) ?? byProduct.set(r.product, []).get(r.product)).push(r);
  const report = {};
  for (const [product, rows] of byProduct) {
    rows.sort((a, b) => a.period_start.localeCompare(b.period_start));
    const firstReal = rows.find((r) => (r.price ?? 0) !== 0 || (r.volume ?? 0) !== 0);
    if (!firstReal) { report[product] = { verdict: 'no_real_data' }; continue; }
    let leading = 0, midSeries = 0;
    for (const r of rows) {
      if ((r.price ?? 0) !== 0 || (r.volume ?? 0) !== 0) continue;
      const isLeading = r.period_start < firstReal.period_start;
      r.price = null; r.price_eur = null; r.price_norm = null; r.price_norm_unit = null;
      r.fx_rate = null; r.volume = null; r.volume_unit = null; r.price_basis = null;
      r.notes = isLeading
        ? 'no_coverage: published as exactly zero before this product\'s market existed; absence, not a price of zero'
        : 'no_coverage: price and volume both exactly zero mid-series, which in this source only ever means a missing period; absence, not a price of zero';
      if (isLeading) leading++; else midSeries++;
    }
    report[product] = { first_real_period: firstReal.period_start, leading_zero_rows_nulled: leading, mid_series_zero_rows_nulled: midSeries };
  }
  return report;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(FIXTURES, { recursive: true });

  const rowsByYear = new Map();
  const stats = { kept: 0, zeroRows: 0 };
  const monthCoverage = [];
  let firstReal = null, sample = null;

  for (const r of monthRanges(FROM, TO)) {
    const { url, text } = await fetchMonth(r);
    const before = { ...stats };
    const rows = parseMonth(text, r.key, stats);
    const nonZeroPrices = rows.filter((x) => x.price !== null && x.price !== 0).length;
    monthCoverage.push({ month: r.key, rows: rows.length, zero_rows_dropped: stats.zeroRows - before.zeroRows, non_zero_prices: nonZeroPrices });
    if (nonZeroPrices > 0 && !firstReal) { firstReal = r.key; sample = { url, text }; }
    for (const x of rows) {
      const y = x.period_start.slice(0, 4);
      (rowsByYear.get(y) ?? rowsByYear.set(y, []).get(y)).push(x);
    }
    console.log(`  ${r.key}: ${rows.length} rows, ${stats.zeroRows - before.zeroRows} all-zero dropped, ${nonZeroPrices} non-zero prices`);
  }

  const perProductCoverage = nullLeadingAbsence(rowsByYear);
  for (const [p, v] of Object.entries(perProductCoverage)) console.log(`  ${p}: first real ${v.first_real_period ?? '—'}${v.leading_zero_rows_nulled ? `, ${v.leading_zero_rows_nulled} leading zero rows nulled` : ''}${v.mid_series_zero_rows_nulled ? `, ${v.mid_series_zero_rows_nulled} mid-series zero rows nulled` : ''}`);

  const invalid = [];
  let nRows = 0;
  for (const rows of rowsByYear.values()) for (const x of rows) {
    nRows++;
    const bad = validateRow(x);
    if (bad.length && invalid.length < 10) invalid.push({ bad, row: x });
  }
  if (invalid.length) { console.error('INVALID:', JSON.stringify(invalid[0], null, 1)); process.exitCode = 1; return; }

  const files = [];
  for (const [y, rows] of [...rowsByYear].sort()) {
    rows.sort((a, b) => a.period_start.localeCompare(b.period_start) || a.product.localeCompare(b.product));
    const gz = zlib.gzipSync(Buffer.from(rows.map((x) => JSON.stringify(x)).join('\n') + '\n'), { level: 9 });
    const file = `se-fcr-${y}.ndjson.gz`;
    await fs.writeFile(path.join(OUT, file), gz);
    files.push({ file, rows: rows.length, bytes_gz: gz.length, span: `${rows[0].period_start}..${rows.at(-1).period_end}`, sha256: crypto.createHash('sha256').update(gz).digest('hex') });
    console.log(`  ${file}: ${rows.length} rows, ${(gz.length / 1024).toFixed(0)} KiB`);
  }

  if (sample) {
    await fs.writeFile(path.join(FIXTURES, 'se-mimer-sample.csv'), sample.text.split('\n').slice(0, 200).join('\n') + '\n');
    await fs.writeFile(path.join(FIXTURES, 'se-mimer-sample.url.txt'), sample.url + '\n');
  }

  const manifest = {
    dataset: 'se-fcr',
    market: 'SE',
    products: SERIES.map((s) => s.product),
    mechanism: 'cap',
    source: 'Svenska kraftnät — Mimer portal, Primary regulation',
    source_urls: { download: `${BASE}?periodFrom=<YYYY-MM-DD>&periodTo=<YYYY-MM-DD>`, human_readable: 'https://mimer.svk.se/PrimaryRegulation/PrimaryRegulationIndex' },
    licence: 'Svenska kraftnät publishes Mimer market data for public reuse; no explicit licence text is served with the download endpoint. Stored here for internal calibration.',
    retrieved_at: new Date().toISOString(),
    requested_span: `${FROM}..${TO}`,
    resolution: 'PT1H',
    timezone: 'timestamps are Swedish local wall clock (Europe/Stockholm), stored as UTC instants',
    coverage_verification: {
      claimed: 'the endpoint accepts any date range and returns 200',
      actual_first_month_with_data: firstReal,
      verdict: 'Dates before the first real month return HTTP 200 with a complete grid of zeros. Absence is served as zero, not as an error or an empty body. All-zero rows are dropped as no_coverage.',
      all_zero_rows_dropped: stats.zeroRows,
      per_product_leading_absence: perProductCoverage,
      per_product_note: 'Three layers of the absence-as-zero trap in one source: (1) whole rows of zeros before coverage starts, dropped by the parser; (2) one product column of zeros while the row is otherwise real — FCR-D down from 2020-12 until its market opened 2021-12; (3) a single missing hour published as zeros mid-series, 2021-12-06T23:00Z for FCR-D up, between hours clearing near 97 EUR/MW on 495 MW. Any row with price and volume BOTH exactly zero is nulled as no_coverage. Justified by measurement: across the committed dataset there is no row with volume 0 and a positive price, and none with price 0 and positive volume, so the combination only ever means absence here.',
      per_month: monthCoverage,
    },
    price_semantics: { basis: 'clearing', unit_note: 'published EUR/MW on hourly products, so price_norm (EUR/MW/h) equals price; asserted in the loader test rather than assumed' },
    area_semantics: 'row.area = "SE" for the market-wide price. Per-zone procured volumes (SE1-SE4, DK2) are in extra.zone_volumes_mw; DK2 buys through the Swedish market.',
    rows: nRows,
    files,
  };
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'current_year', dataset: 'se' });
  console.log(`\n${nRows} rows · first real month ${firstReal} · ${stats.zeroRows} all-zero rows dropped`);
}

await main();
