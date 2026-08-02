// Australia (NEM) — regional spot prices from AEMO's aggregated price-and-demand files.
//
// WHY AUSTRALIA IS HERE, AND FOR WHAT. Not for FCAS. Per-interval FCAS prices live only in
// the MMSDM archive as hundreds-of-MB monthly SQL-loader ZIPs, which is out of proportion to
// what 36.E1-E3 calibrate; that decision and its consequence are recorded in the Pause-A
// audit. What Australia is uniquely good for is 36.E4: South Australia has the highest
// battery penetration of any large market, over the longest period, in a region small enough
// that fleet growth is visible in the spread. It is the only place to measure the two-force
// race the arc's spread model rests on — renewables widening the spread while batteries
// arbitrage it away.
//
// NSW1 is fetched as a CONTROL, not as a second data point. Without it, any spread
// compression measured in SA is equally consistent with "batteries compressed it" and
// "everything compressed everywhere". A control region with a later, smaller fleet is what
// separates those, and no amount of SA data can.
//
// CHANNEL. https://aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_<YYYYMM>_<REGION>.csv
//   Unauthenticated. Columns: REGION, SETTLEMENTDATE, TOTALDEMAND, RRP, PERIODTYPE.
//
// THE RESOLUTION BREAK THAT IS NOT A MARKET EVENT. The NEM moved from 30-minute to 5-minute
// settlement on 2021-10-01. Five-minute settlement mechanically raises measured intraday
// spread, because a 30-minute average is a low-pass filter over the same prices. A spread
// series that crosses this date without saying so measures a rule change and reports it as a
// market change — and it would do so in the direction of "spreads are widening", which is the
// direction that flatters a storage business case. Each row carries its native resolution;
// the summary table computes spreads on a fixed 30-minute basis across the whole span AND on
// the native basis, and reports both.
//
// TIMEZONE. SETTLEMENTDATE is NEM market time: AEST, UTC+10 all year, no daylight saving,
// even for South Australia whose civil time is UTC+9:30 with DST. Australia/Brisbane is the
// zone that matches market time.
//
// Usage:
//   node tools/consultancy/mature-markets/fetch-au-aemo.mjs
//   node tools/consultancy/mature-markets/fetch-au-aemo.mjs --from 2015-01 --regions SA1

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { row, validateRow } from './schema.mjs';
import { writeManifest } from './manifest-writer.mjs';

const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'au');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');
const FX = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'fx', 'fx-monthly.json');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const FROM = arg('from', '2015-01');
const TO = arg('to', new Date().toISOString().slice(0, 7));
const REGIONS = arg('regions', 'SA1,NSW1').split(',');

const url = (ym, region) => `https://aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${ym.replace('-', '')}_${region}.csv`;

// Market time is UTC+10 fixed. Stated as a constant offset rather than resolved through a
// tz database, because the tz database describes civil time and the NEM does not use it.
const NEM_OFFSET_MIN = 600;

function nemToUtc(settlementDate) {
  // "2024/06/01 00:05:00" or "2015/06/01 00:30:00", sometimes quoted.
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(settlementDate).trim().replace(/^"|"$/g, ''));
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - NEM_OFFSET_MIN * 60000;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function months(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

async function get(u) {
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(u);
      if (r.status === 404 || r.status === 403) return { status: r.status, text: null };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { status: 200, text: await r.text() };
    } catch (e) { if (a === 4) throw new Error(`${u}: ${e.message}`); await new Promise((s) => setTimeout(s, 900 * a)); }
  }
}

let fx = null;
async function audPerEur(month) {
  fx ??= JSON.parse(await fs.readFile(FX, 'utf8'));
  const rates = fx.currencies.AUD.rates;
  if (rates[month]) return rates[month];
  const ms = Object.keys(rates).sort();
  return rates[month < ms[0] ? ms[0] : ms.at(-1)];
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(FIXTURES, { recursive: true });

  const rowsByYear = new Map();
  const missing = [];
  const resolutionSpans = {};  // resolution -> {first,last,n}
  const perMonth = [];
  let firstSample = null;

  for (const region of REGIONS) {
    for (const ym of months(FROM, TO)) {
      const u = url(ym, region);
      const { status, text } = await get(u);
      if (!text) { missing.push({ region, month: ym, status }); continue; }
      const rate = await audPerEur(ym);
      const lines = text.trim().split(/\r?\n/);
      const hdr = lines[0].split(',').map((h) => h.trim());
      const iDate = hdr.indexOf('SETTLEMENTDATE'), iRrp = hdr.indexOf('RRP'), iDem = hdr.indexOf('TOTALDEMAND'), iType = hdr.indexOf('PERIODTYPE');
      if (iDate < 0 || iRrp < 0) throw new Error(`${region} ${ym}: unexpected header ${hdr.join(',')}`);

      // Resolution is measured from consecutive stamps, not assumed from the date. The
      // 5-minute cutover is a published fact but the files are the authority on it.
      const stamps = [];
      const recs = [];
      for (const line of lines.slice(1)) {
        const c = line.split(',');
        const ts = nemToUtc(c[iDate]);
        if (!ts) continue;
        const rrp = Number.parseFloat(c[iRrp]);
        recs.push({ ts, rrp: Number.isFinite(rrp) ? rrp : null, dem: Number.parseFloat(c[iDem]), type: (c[iType] ?? '').trim() });
        stamps.push(Date.parse(ts));
      }
      stamps.sort((a, b) => a - b);
      const deltas = stamps.slice(1).map((v, i) => (v - stamps[i]) / 60000).filter((d) => d > 0);
      const stepMin = deltas.length ? deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : null;
      const resolution = stepMin === 5 ? 'PT5M' : stepMin === 30 ? 'PT30M' : `PT${stepMin}M`;
      (resolutionSpans[resolution] ??= { first: ym, last: ym, n: 0 });
      resolutionSpans[resolution].last = ym > resolutionSpans[resolution].last ? ym : resolutionSpans[resolution].last;
      resolutionSpans[resolution].first = ym < resolutionSpans[resolution].first ? ym : resolutionSpans[resolution].first;
      resolutionSpans[resolution].n += recs.length;

      for (const r of recs) {
        const eur = r.rrp === null ? null : Math.round((r.rrp / rate) * 1e4) / 1e4;
        (rowsByYear.get(r.ts.slice(0, 4)) ?? rowsByYear.set(r.ts.slice(0, 4), []).get(r.ts.slice(0, 4))).push(row({
          market: 'AU', area: region, product: 'spot', direction: null, mechanism: 'energy',
          period_start: r.ts,
          period_end: new Date(Date.parse(r.ts) + stepMin * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          resolution,
          price: r.rrp, price_unit: 'AUD/MWh', currency: 'AUD', price_eur: eur, fx_rate: rate,
          price_norm: eur, price_norm_unit: eur === null ? null : 'EUR/MWh',
          volume: Number.isFinite(r.dem) ? r.dem : null, volume_unit: Number.isFinite(r.dem) ? 'MW' : null,
          price_basis: r.rrp === null ? null : 'settlement',
          notes: null,
          extra: { periodType: r.type || null, stepMinutes: stepMin },
        }));
      }
      perMonth.push({ region, month: ym, rows: recs.length, resolution });
      firstSample ??= { url: u, text };
    }
    console.log(`${region}: ${perMonth.filter((p) => p.region === region).reduce((s, p) => s + p.rows, 0)} rows`);
  }

  let nRows = 0; const invalid = [];
  for (const rows of rowsByYear.values()) for (const r of rows) {
    nRows++;
    const bad = validateRow(r);
    if (bad.length && invalid.length < 10) invalid.push({ bad, row: r });
  }
  if (invalid.length) { console.error('INVALID:', JSON.stringify(invalid[0], null, 1)); process.exitCode = 1; return; }

  const files = [];
  for (const [y, rows] of [...rowsByYear].sort()) {
    rows.sort((a, b) => a.period_start.localeCompare(b.period_start) || a.area.localeCompare(b.area));
    const gz = zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 });
    const file = `au-spot-${y}.ndjson.gz`;
    await fs.writeFile(path.join(OUT, file), gz);
    files.push({ file, rows: rows.length, bytes_gz: gz.length, span: `${rows[0].period_start}..${rows.at(-1).period_end}`, regions: [...new Set(rows.map((r) => r.area))], sha256: crypto.createHash('sha256').update(gz).digest('hex') });
    console.log(`  ${file}: ${rows.length} rows, ${(gz.length / 1024).toFixed(0)} KiB`);
  }

  if (firstSample) {
    await fs.writeFile(path.join(FIXTURES, 'au-price-demand-sample.csv'), firstSample.text.split('\n').slice(0, 200).join('\n') + '\n');
    await fs.writeFile(path.join(FIXTURES, 'au-price-demand-sample.url.txt'), firstSample.url + '\n');
  }

  const manifest = {
    dataset: 'au-spot',
    market: 'AU',
    areas: REGIONS,
    products: ['spot'],
    mechanism: 'energy',
    source: 'AEMO — aggregated price and demand data, National Electricity Market',
    source_urls: { pattern: 'https://aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_<YYYYMM>_<REGION>.csv' },
    licence: 'AEMO publishes NEM aggregated price and demand data for public use subject to its website terms; stored here for internal calibration.',
    retrieved_at: new Date().toISOString(),
    requested_span: `${FROM}..${TO}`,
    timezone: 'SETTLEMENTDATE is NEM market time, AEST = UTC+10 with no daylight saving (not South Australian civil time, which is UTC+9:30 with DST). Stored as UTC instants.',
    resolution_note: 'native resolution measured per file from consecutive stamps, not assumed from the date',
    resolutions_observed: resolutionSpans,
    coverage_verification: {
      claimed_by_arc_doc: 'AEMO / opennem — FCAS prices + battery dispatch-era summaries',
      actual: 'spot prices only. FCAS per-interval prices are archive-only (nemweb MMSDM monthly SQL-loader ZIPs) and were not acquired; OpenElectricity (ex-OpenNEM) API v3/v4 now requires a key and returned 404 unauthenticated.',
      verdict: 'AU contributes 36.E4 arbitrage-spread evidence, NOT an FCAS lifecycle. E1-E3 lifecycle shape comes from GB and DE.',
      structural_break: '30-minute → 5-minute settlement on 2021-10-01 raises measured intraday spread mechanically. Not a market event. Must be segmented or spreads computed on a fixed basis.',
      months_missing: missing.length,
      missing: missing.slice(0, 40),
    },
    price_semantics: {
      basis: 'settlement — RRP is the regional reference price actually settled',
      currency: 'native AUD retained; price_eur and price_norm at the ECB monthly-average AUD/EUR rate from ../fx/fx-monthly.json',
      negative_prices: 'NEM spot prices are frequently negative and occasionally at the -1000 AUD/MWh floor or the market price cap. All retained: for a storage model the negative tail IS the charging opportunity.',
    },
    control_region_rationale: 'NSW1 is included as a control, not a second observation. Compression measured only in SA cannot distinguish a battery effect from a market-wide one.',
    rows: nRows,
    per_month: perMonth,
    files,
  };
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'current_year', dataset: 'au' });
  console.log(`\n${nRows} rows · resolutions ${JSON.stringify(resolutionSpans)} · ${missing.length} months missing`);
}

await main();
