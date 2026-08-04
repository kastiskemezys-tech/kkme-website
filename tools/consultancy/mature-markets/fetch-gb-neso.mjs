// Great Britain — frequency-response and reserve auction results from NESO's data portal.
//
// WHY GB IS THE MOST IMPORTANT NON-GERMAN MARKET HERE. It holds the fastest complete
// battery-revenue lifecycle on record: Dynamic Containment launched October 2020 into a
// market with almost no qualified providers, cleared at scarcity levels through 2021,
// saturated through 2022-23 as the fleet passed ~2 GW, and then had its revenue migrate to
// reserve products. If a decay model cannot reproduce GB's shape when fed GB's inputs, it
// is not a model, and the arc says so explicitly.
//
// CHANNEL. https://api.neso.energy — CKAN 3, unauthenticated, NESO Open Data Licence
// (an explicit open licence, unlike the German and Swedish portals, so raw files are
// committed as served).
//
// COVERAGE CHAIN, verified by fetching each file and reading its first and last row.
// No single resource spans the lifecycle; four do, and the joins are where a naive
// "download the auction results" would lose either the peak or the aftermath:
//   1. dynamic_containment_masterdata.csv     2020-10-02 → 2021-09-15   bid level, pay-as-bid
//   2. DC/DR/DM Results Summary Master Data   2021-09-16 → 2023-11-02   clearing price per EFA block
//   3. EAC Results Summary FY2023/24/25       2023-11-02 → 2026-03-31   clearing price, EAC platform
//   4. EAC Results Summary (live)             2026-03-31 → now
// Resource 1 is the SCARCITY era. Dropping it — which is what happens if you take only the
// resource named "results summary" — removes the peak from a peak-to-floor ratio.
//
// UNITS, verified arithmetically rather than assumed. In the bid-level file, a 49 MW bid at
// Availability Fee 15.03 over a 24 h service has Total Cost 17 675.28, and
// 49 x 24 x 15.03 = 17 675.28 exactly. So the fee is GBP/MW/h. The summary files' clearing
// price is on the same basis.
//
// TWO ZERO TRAPS, both real in these files:
//   * Early DC summary rows carry Cleared Volume 0 and Clearing Price 0. Nothing cleared, so
//     there was no clearing price. Stored as null with a note, never as a price of zero,
//     because a zero would drag every floor estimate toward zero.
//   * EAC clearing prices are genuinely negative at times (DRH at -9.19 GBP/MW/h). Those are
//     real prices and are kept. A filter that dropped non-positive prices to "clean" the
//     series would delete the most informative observations in it.
//
// Usage: node tools/consultancy/mature-markets/fetch-gb-neso.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { row, validateRow } from './schema.mjs';
import { writeManifest } from './manifest-writer.mjs';
import { writeFixture } from './fixture-guard.mjs';

const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'gb');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');
const FX = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'fx', 'fx-monthly.json');

const SOURCES = {
  dcBidLevel: {
    name: 'Dynamic Containment Masterdata (bid level)',
    url: 'https://api.neso.energy/dataset/aca07dcb-f807-409c-a4ec-da5dc052b8ba/resource/0b8dbc3c-e05e-44a4-b855-7dd1aa079c68/download/dynamic_containment_masterdata.csv',
    package: 'dynamic-containment-data',
  },
  dcSummary: {
    name: 'DC, DR & DM Results Summary Master Data 2021-2023',
    url: 'https://api.neso.energy/datastore/dump/888e5029-f786-41d2-bc15-cbfd1d285e96',
    package: 'dynamic-containment-data',
  },
  eacFy2023: { name: 'EAC Results Summary FY2023', url: 'https://api.neso.energy/dataset/291e3c28-75f2-4a8f-b5f5-008bebaac368/resource/be5c6b0d-a335-4859-93f2-389585b4e9a1/download/neso-response-reserve-results-summary-fy2023-archive.csv', package: 'eac-auction-results' },
  eacFy2024: { name: 'EAC Results Summary FY2024', url: 'https://api.neso.energy/dataset/291e3c28-75f2-4a8f-b5f5-008bebaac368/resource/ab130833-3ce4-4361-90fb-69fa3cf30f15/download/neso-response-reserve-results-summary-fy2024-archive.csv', package: 'eac-auction-results' },
  eacFy2025: { name: 'EAC Results Summary FY2025', url: 'https://api.neso.energy/dataset/291e3c28-75f2-4a8f-b5f5-008bebaac368/resource/be55ee51-b79e-47da-b71e-a0f8865d9d66/download/neso-response-reserve-results-summary-fy2025-archive.csv', package: 'eac-auction-results' },
  eacLive: { name: 'EAC Results Summary (live)', url: 'https://api.neso.energy/datastore/dump/596f29ac-0387-4ba4-a6d3-95c243140707', package: 'eac-auction-results' },
};

// Source service code → (schema product, power direction).
// P/N prefixes on reserve products are positive/negative, i.e. up/down.
const SERVICE_MAP = {
  DCL: ['DC-low', 'up'], DCH: ['DC-high', 'down'],
  DML: ['DM-low', 'up'], DMH: ['DM-high', 'down'],
  DRL: ['DR-low', 'up'], DRH: ['DR-high', 'down'],
  PBR: ['BR-up', 'up'], NBR: ['BR-down', 'down'],
  PQR: ['QR-up', 'up'], NQR: ['QR-down', 'down'],
  PSR: ['SR-up', 'up'], NSR: ['SR-down', 'down'],
  // Bid-level file spells the market out.
  'DC LF': ['DC-low', 'up'], 'DC HF': ['DC-high', 'down'],
  'DM LF': ['DM-low', 'up'], 'DM HF': ['DM-high', 'down'],
  'DR LF': ['DR-low', 'up'], 'DR HF': ['DR-high', 'down'],
};

// ── CSV ────────────────────────────────────────────────────────────────────

/** Minimal RFC4180-ish parser: these files quote fields containing commas. */
function parseCsv(text) {
  const rows = [];
  let field = '', rec = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { rec.push(field); field = ''; }
    else if (c === '\n') { rec.push(field); rows.push(rec); rec = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || rec.length) { rec.push(field); rows.push(rec); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const num = (s) => { const v = Number.parseFloat(String(s ?? '').replace(/[, ]/g, '')); return Number.isFinite(v) ? v : null; };
const iso = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  // NESO writes UTC instants either with or without a Z; both are UTC per the column names.
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?Z?$/.exec(t);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}Z` : null;
};

async function get(url) {
  for (let a = 1; a <= 4; a++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
    catch (e) { if (a === 4) throw new Error(`${url}: ${e.message}`); await new Promise((s) => setTimeout(s, 900 * a)); }
  }
}

// ── FX ─────────────────────────────────────────────────────────────────────

let fxTable = null;
async function gbpPerEur(iso8601) {
  fxTable ??= JSON.parse(await fs.readFile(FX, 'utf8'));
  const rates = fxTable.currencies.GBP.rates;
  const month = iso8601.slice(0, 7);
  if (rates[month]) return rates[month];
  // Current month may not be published yet: fall back to the latest available and say so.
  const months = Object.keys(rates).sort();
  return rates[months.at(-1)];
}
const fxMonthsUsed = new Set();

async function toEur(price, iso8601) {
  if (price === null) return { eur: null, rate: null };
  const rate = await gbpPerEur(iso8601);
  fxMonthsUsed.add(iso8601.slice(0, 7));
  return { eur: Math.round((price / rate) * 1e4) / 1e4, rate };
}

// ── Builders ───────────────────────────────────────────────────────────────

/** Bid-level DC: pay-as-bid, so vwap of accepted bids per (service, delivery window). */
async function dcBidLevelRows(text, warn) {
  const recs = parseCsv(text);
  const groups = new Map();
  // 'Withdraw' rows are bids the provider pulled before the auction closed. They are not a
  // market and not a price; skipping them is correct, so it is a documented skip rather than
  // 1104 identical warnings that train the reader to ignore the warning list.
  const KNOWN_SKIP = new Set(['Withdraw']);
  let skippedWithdrawn = 0;
  for (const r of recs) {
    if (KNOWN_SKIP.has(r['Market Name'])) { skippedWithdrawn++; continue; }
    const svc = SERVICE_MAP[r['Market Name']];
    if (!svc) { warn(`unmapped Market Name "${r['Market Name']}"`); continue; }
    const s = iso(r['Delivery Start UTC']), e = iso(r['Delivery End UTC']);
    if (!s || !e) { warn(`unparsed delivery window ${r['Delivery Start UTC']}..${r['Delivery End UTC']}`); continue; }
    const key = `${r['Market Name']}|${s}|${e}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { svc, s, e, offered: 0, accepted: 0, wSum: 0, fees: [], nBids: 0, nAccepted: 0, tech: new Map() });
    g.nBids++;
    g.offered += num(r['Volume offered']) ?? 0;
    const acc = num(r['Volume Accepted']) ?? 0;
    const fee = num(r['Availability Fee']);
    if (acc > 0 && fee !== null) {
      g.nAccepted++; g.accepted += acc; g.wSum += fee * acc; g.fees.push(fee);
      const t = r['Technology Type'] || 'unknown';
      g.tech.set(t, (g.tech.get(t) ?? 0) + acc);
    }
  }

  if (skippedWithdrawn) console.log(`  (skipped ${skippedWithdrawn} withdrawn bid rows)`);
  const out = [];
  for (const g of groups.values()) {
    const spanH = (Date.parse(g.e) - Date.parse(g.s)) / 3600000;
    const price = g.nAccepted ? g.wSum / g.accepted : null;
    const { eur, rate } = await toEur(price, g.s);
    out.push(row({
      market: 'GB', area: 'GB', product: g.svc[0], direction: g.svc[1], mechanism: 'cap',
      period_start: g.s, period_end: g.e, resolution: `PT${spanH}H`,
      price: price === null ? null : Math.round(price * 1e4) / 1e4,
      price_unit: 'GBP/MW/h', currency: 'GBP', price_eur: eur, fx_rate: rate,
      price_norm: eur, price_norm_unit: eur === null ? null : 'EUR/MW/h',
      volume: g.accepted, volume_unit: 'MW',
      price_basis: price === null ? null : 'vwap_accepted',
      notes: g.nAccepted === 0 ? 'no bids accepted in this window — price is absent, not zero' : null,
      extra: {
        source: 'dc-bid-level', marginalAccepted: g.fees.length ? Math.max(...g.fees) : null,
        minAccepted: g.fees.length ? Math.min(...g.fees) : null,
        offeredMw: g.offered, nBids: g.nBids, nAccepted: g.nAccepted,
        acceptedMwByTechnology: Object.fromEntries([...g.tech].sort((a, b) => b[1] - a[1])),
        spanHours: spanH,
      },
    }));
  }
  return out;
}

/** DC/DM/DR summary 2021-2023: EFA-block clearing price. */
async function dcSummaryRows(text, warn) {
  const out = [];
  for (const r of parseCsv(text)) {
    const svc = SERVICE_MAP[r.Service];
    if (!svc) { warn(`unmapped Service "${r.Service}"`); continue; }
    const s = iso(r['Delivery Start']), e = iso(r['Delivery End']);
    if (!s || !e) { warn(`unparsed window ${r['Delivery Start']}..${r['Delivery End']}`); continue; }
    const vol = num(r['Cleared Volume']);
    let price = num(r['Clearing Price']);
    // Nothing cleared → no clearing price. The file writes 0 for both; only one of them is a fact.
    const noClear = (vol ?? 0) === 0;
    if (noClear) price = null;
    const { eur, rate } = await toEur(price, s);
    const spanH = (Date.parse(e) - Date.parse(s)) / 3600000;
    out.push(row({
      market: 'GB', area: 'GB', product: svc[0], direction: svc[1], mechanism: 'cap',
      period_start: s, period_end: e, resolution: `PT${spanH}H`,
      price, price_unit: 'GBP/MW/h', currency: 'GBP', price_eur: eur, fx_rate: rate,
      price_norm: eur, price_norm_unit: eur === null ? null : 'EUR/MW/h',
      volume: vol, volume_unit: vol === null ? null : 'MW',
      price_basis: price === null ? null : 'clearing',
      notes: noClear ? 'cleared volume 0 — the published clearing price of 0 is absence of a clear, not a price' : null,
      extra: { source: 'dc-dm-dr-summary', efaBlock: r.EFA ?? null, efaDate: r['EFA Date'] ?? null, spanHours: spanH },
    }));
  }
  return out;
}

/** EAC summary: clearing price per auction product per delivery window. */
async function eacRows(text, label, warn) {
  const out = [];
  for (const r of parseCsv(text)) {
    const svc = SERVICE_MAP[r.auctionProduct];
    if (!svc) { warn(`unmapped auctionProduct "${r.auctionProduct}" in ${label}`); continue; }
    const s = iso(r.deliveryStart), e = iso(r.deliveryEnd);
    if (!s || !e) { warn(`unparsed window in ${label}: ${r.deliveryStart}..${r.deliveryEnd}`); continue; }
    const vol = num(r.clearedVolume);
    let price = num(r.clearingPrice);
    const noClear = (vol ?? 0) === 0 && price === 0;
    if (noClear) price = null;
    const { eur, rate } = await toEur(price, s);
    const spanH = (Date.parse(e) - Date.parse(s)) / 3600000;
    out.push(row({
      market: 'GB', area: 'GB', product: svc[0], direction: svc[1], mechanism: 'cap',
      period_start: s, period_end: e, resolution: spanH === 0.5 ? 'PT30M' : `PT${spanH}H`,
      price, price_unit: 'GBP/MW/h', currency: 'GBP', price_eur: eur, fx_rate: rate,
      price_norm: eur, price_norm_unit: eur === null ? null : 'EUR/MW/h',
      volume: vol, volume_unit: vol === null ? null : 'MW',
      price_basis: price === null ? null : 'clearing',
      notes: noClear ? 'cleared volume 0 with price 0 — absence of a clear, not a price' : null,
      extra: {
        source: `eac:${label}`, auctionId: r.auctionID ?? null, serviceType: r.serviceType ?? null,
        auctionProduct: r.auctionProduct, spanHours: spanH,
      },
    }));
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(FIXTURES, { recursive: true });

  const warnings = [];
  const warn = (m) => warnings.push(m);
  const rowsByYear = new Map();
  const fileMeta = [];

  const push = (rows) => {
    for (const r of rows) {
      const y = r.period_start.slice(0, 4);
      (rowsByYear.get(y) ?? rowsByYear.set(y, []).get(y)).push(r);
    }
  };

  for (const [key, src] of Object.entries(SOURCES)) {
    const text = await get(src.url);
    let rows;
    if (key === 'dcBidLevel') rows = await dcBidLevelRows(text, warn);
    else if (key === 'dcSummary') rows = await dcSummaryRows(text, warn);
    else rows = await eacRows(text, key, warn);
    const stamps = rows.map((r) => r.period_start).sort();
    fileMeta.push({
      key, name: src.name, source_url: src.url, package: src.package,
      bytes: text.length, rows: rows.length,
      span: stamps.length ? `${stamps[0]}..${stamps.at(-1)}` : null,
      products: [...new Set(rows.map((r) => r.product))].sort(),
      sha256_source: crypto.createHash('sha256').update(text).digest('hex'),
    });
    console.log(`${src.name}: ${rows.length} rows, ${stamps[0]?.slice(0, 10)}..${stamps.at(-1)?.slice(0, 10)}`);
    push(rows);
    // Commit the source bytes: the NESO Open Data Licence permits redistribution.
    await fs.writeFile(path.join(OUT, `source-${key}.csv.gz`), zlib.gzipSync(Buffer.from(text), { level: 9 }));
    if (key === 'dcSummary') await writeFixture(path.join(FIXTURES, 'gb-dc-summary-sample.csv'), text.split('\n').slice(0, 120).join('\n') + '\n');
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
    rows.sort((a, b) => a.period_start.localeCompare(b.period_start) || a.product.localeCompare(b.product));
    const gz = zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 });
    const file = `gb-response-reserve-${y}.ndjson.gz`;
    await fs.writeFile(path.join(OUT, file), gz);
    files.push({ file, rows: rows.length, bytes_gz: gz.length, span: `${rows[0].period_start}..${rows.at(-1).period_end}`, products: [...new Set(rows.map((r) => r.product))].sort(), sha256: crypto.createHash('sha256').update(gz).digest('hex') });
    console.log(`  ${file}: ${rows.length} rows, ${(gz.length / 1024).toFixed(0)} KiB`);
  }

  const allStamps = [...rowsByYear.values()].flat().map((r) => r.period_start).sort();
  const manifest = {
    dataset: 'gb-response-reserve',
    market: 'GB',
    mechanism: 'cap',
    source: 'National Energy System Operator (NESO) data portal',
    source_urls: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.url])),
    licence: 'NESO Open Data Licence — explicit open licence permitting reuse and redistribution with attribution. Source CSVs are committed as served (gzipped).',
    retrieved_at: new Date().toISOString(),
    resolution: 'EFA blocks (PT4H) for response services; PT30M for some reserve products; PT24H for the 2020-21 bid-level era',
    timezone: 'delivery windows are published as UTC instants and stored unchanged',
    coverage_verification: {
      claimed_by_arc_doc: 'DC/DM/DR auction results + legacy FFR; the 2022-23 saturation episode must be fully covered',
      actual: `${allStamps[0]} .. ${allStamps.at(-1)}`,
      verdict: 'Covered, but only by chaining four resources. No single "auction results" resource spans the lifecycle: the 2020-10..2021-09 scarcity era exists only in the bid-level Masterdata file, and taking the summary resources alone would silently start the series after the peak.',
      chain: fileMeta.map((f) => ({ name: f.name, span: f.span })),
      ffr_not_normalised: 'The FFR post-tender reports (89 monthly XLSX, package firm-frequency-response-post-tender-reports) would extend GB back past DC into the FFR era. Not normalised in 36.E0: 89 heterogeneous spreadsheet layouts for a pre-battery-dominance market is disproportionate to what E1-E5 calibrate. Located and left, not overlooked.',
    },
    price_semantics: {
      bid_level_era: 'vwap_accepted — DC was pay-as-bid in 2020-21; the volume-weighted accepted availability fee is what providers earned, marginal and min are in extra',
      summary_era: 'clearing — DC/DM/DR and EAC publish a clearing price per product per window',
      unit_verification: 'GBP/MW/h, verified arithmetically in the bid-level file: 49 MW x 24 h x 15.03 GBP/MW/h = 17 675.28 = the published Total Cost',
      negative_prices: 'EAC clearing prices are genuinely negative at times and are retained; they are the most informative observations in a saturated market, not dirt',
      zero_handling: 'cleared volume 0 → price stored null with a note; the source writes 0 for both and only the volume is a fact',
      withdrawn_bids: 'bid-level rows with Market Name "Withdraw" are bids pulled before auction close; excluded by design, counted at fetch time',
      currency: 'native GBP retained; price_eur and price_norm converted at the ECB monthly-average GBP/EUR rate from ../fx/fx-monthly.json',
      fx_months_used: [...fxMonthsUsed].sort(),
    },
    service_mapping: Object.fromEntries(Object.entries(SERVICE_MAP).map(([k, v]) => [k, { product: v[0], direction: v[1] }])),
    service_mapping_note: 'GB names response products by the FREQUENCY they answer, which is the opposite of the power direction: DCL (low frequency) injects and is direction "up"; DCH absorbs and is "down". P/N prefixes on reserve products are positive/negative, i.e. up/down.',
    rows: nRows,
    source_files: fileMeta,
    warnings: [...new Set(warnings)].slice(0, 50),
    n_warnings: warnings.length,
    files,
  };
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'full', dataset: 'gb' });
  console.log(`\n${nRows} rows · ${allStamps[0]} .. ${allStamps.at(-1)}`);
  if (warnings.length) console.log(`${warnings.length} warnings (deduped in manifest)`);
}

await main();
