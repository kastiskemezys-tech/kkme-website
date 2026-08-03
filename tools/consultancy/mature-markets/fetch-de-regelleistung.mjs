// Germany — reserve auction results from regelleistung.net, the four German TSOs' joint
// balancing platform (50Hertz, Amprion, TenneT DE, TransnetBW).
//
// CHANNEL. https://www.regelleistung.net/apps/crds/api/v2 — unauthenticated. Discovered
// from the Datencenter SPA bundle (`BASE_PATH` in /apps/datacenter/assets/index-*.js);
// the published Swagger sits behind /uaa/login. Two endpoints are used:
//   /tenders?from&to&markets&pageSize            → which delivery days exist
//   /tenders/results/aggregated?deliveryDate&productType&market&exportFormat=xlsx
//                                               → the published aggregate, 5-11 KiB/day
// The bid-level endpoint (/tenders/{id}/bid-results) is deliberately NOT used: it caps at
// 100 bids per page with no flag, so a naive aggregate over it silently covers one product
// block out of twelve. Paging it to completeness costs ~15 GB. The aggregated export
// carries per-country prices AND its own unit labels, which is strictly better.
//
// COVERAGE, MEASURED NOT CLAIMED (A5). The arc doc says "downloadable history 2011→now".
// It is not. First tenders: aFRR/mFRR 2018-07-12, FCR 2019-07-01 — exactly the dates
// German daily auctions began. The weekly (2011-06-27→) and monthly (2007-12-01→) eras are
// not served by this channel, nor by any other public bulk channel located in 36.E0. Do not
// infer a pre-2018 German reserve price from this dataset.
//
// UNITS — the load-bearing subtlety, measured not assumed:
//  * aFRR/mFRR capacity was published as `EUR/MW` per 4 h product until 2021-12, then
//    relabelled `(EUR/MW)/h`. Measured across the flip, values change by ~4x with no
//    market event: it is a relabel, not a repricing. Unit is read from each file's own
//    header, so the conversion needs no hardcoded date.
//  * FCR capacity is published `EUR/MW` per product period throughout. Verified against
//    its own product-length change on 2020-07-01: the six 4 h prices on 2020-07-01 sum to
//    140.42, against 150.3 for the single 24 h product on 2020-06-30. Per period, not per
//    hour. Unnormalised, FCR's daily era reads 24x its own later era.
//  * `price_norm` is always EUR/MW/h (capacity) or EUR/MWh (energy). `price` keeps the
//    source's number so the conversion is auditable.
//
// WHAT THE ENERGY (RAM) EXPORT IS NOT. Its columns are MIN/AVERAGE/MARGINAL of the
// *offered* merit-order list plus SUM_OF_OFFERED_CAPACITY. They describe the supply curve,
// not the price at which energy was activated and settled. Rows therefore carry
// price_basis `offer_curve_mean`, and MARGINAL lands in `extra` rather than masquerading
// as an activation price. Settled activation prices are a different source (§ report).
//
// Usage:
//   node tools/consultancy/mature-markets/fetch-de-regelleistung.mjs
//   node tools/consultancy/mature-markets/fetch-de-regelleistung.mjs --from 2024-01 --to 2024-03
//   node tools/consultancy/mature-markets/fetch-de-regelleistung.mjs --markets CAPACITY

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { row, validateRow, capacityToEurPerMwPerHour } from './schema.mjs';
import { berlinWallClockToUtc } from './tz.mjs';
import { writeManifest } from './manifest-writer.mjs';
import { writeFixture } from './fixture-guard.mjs';

const API = 'https://www.regelleistung.net/apps/crds/api/v2';
const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'de');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');

const PRODUCTS = ['FCR', 'aFRR', 'mFRR'];
const PAGE_SIZE = 2000;
const CONCURRENCY = 6;

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const FROM = arg('from', '2018-07');
const TO = arg('to', new Date().toISOString().slice(0, 7));
const WANT_PRODUCTS = arg('products', PRODUCTS.join(',')).split(',');
const WANT_MARKETS = arg('markets', 'CAPACITY,ENERGY').split(',');

// ── HTTP with retry ────────────────────────────────────────────────────────

async function withRetry(fn, label, attempts = 5) {
  for (let a = 1; a <= attempts; a++) {
    try { return await fn(); }
    catch (e) {
      if (a === attempts) throw new Error(`${label}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 700 * a));
    }
  }
}

const getJson = (p) => withRetry(async () => {
  const r = await fetch(API + p, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}, `GET ${p}`);

/** Fetch one aggregated xlsx and return {header[], rows[{col:value}]} or null on 404. */
const getSheet = (deliveryDate, productType, market) => withRetry(async () => {
  const u = `${API}/tenders/results/aggregated?deliveryDate=${deliveryDate}&productType=${productType}&market=${market}&exportFormat=xlsx`;
  const r = await fetch(u);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) return { header: [], rows: [], bytes: buf.length };
  const header = ws.getRow(1).values.slice(1).map((v) => String(v ?? '').trim());
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const v = ws.getRow(i).values.slice(1);
    const o = {};
    for (let k = 0; k < header.length; k++) {
      const cell = v[k];
      o[header[k]] = cell && typeof cell === 'object' && 'result' in cell ? cell.result : (cell ?? null);
    }
    rows.push(o);
  }
  return { header, rows, bytes: buf.length };
}, `sheet ${productType}/${market}/${deliveryDate}`);

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

// ── Delivery-day enumeration ───────────────────────────────────────────────

function monthWindows(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const mm = String(m).padStart(2, '0');
    out.push([`${y}-${mm}-01`, `${y}-${mm}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`]);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Fetch a tender window, splitting it until it fits under the page cap.
 * The cap truncates with no flag, so "fits" has to be proved per window rather than
 * assumed from a window size that happened to work for the capacity market — the 15-min
 * energy market puts ~192 tenders in a day and blew a month-wide window straight through.
 */
async function tendersInWindow(a, b, market, depth = 0) {
  const d = await getJson(`/tenders?from=${a}&to=${b}&markets=${market}&pageSize=${PAGE_SIZE}`);
  if (d.length < PAGE_SIZE) return d;
  if (a === b) throw new Error(`single day ${a} (${market}) exceeds the ${PAGE_SIZE} row cap — cannot be enumerated without silent truncation`);
  if (depth > 12) throw new Error(`window ${a}..${b} (${market}) would not split below the cap`);
  const mid = addDays(a, Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000 / 2));
  const left = await tendersInWindow(a, mid, market, depth + 1);
  const right = await tendersInWindow(addDays(mid, 1), b, market, depth + 1);
  return left.concat(right);
}

/**
 * Which (product, market, deliveryDate) triples to fetch.
 *
 * CAPACITY is enumerated from the tender list: one tender per product per day, so a
 * month-wide window is comfortably under the page cap and the list also yields the
 * first-tender dates and market-design tags that the break calendar needs.
 *
 * ENERGY is NOT enumerated. The 15-min market puts ~192 tenders in a single day, so the
 * adaptive split has to descend to daily windows and the enumeration alone costs thousands
 * of sequential requests — more than fetching the data. Instead every calendar day in range
 * is a candidate and the aggregated export is the authority: a day with no energy market
 * returns 404 or an empty sheet and is recorded as missing. That measures the energy
 * market's start date from the data instead of taking it from the break calendar, which is
 * the direction of dependence we want.
 */
async function enumerateDays() {
  const days = new Map(); // "product|market" -> Set(date)
  const meta = { firstSeen: {}, marketDesigns: {} };

  if (WANT_MARKETS.includes('CAPACITY')) {
    for (const [a, b] of monthWindows(FROM, TO)) {
      const d = await tendersInWindow(a, b, 'CAPACITY');
      for (const t of d) {
        if (!WANT_PRODUCTS.includes(t.productType)) continue;
        const k = `${t.productType}|CAPACITY`;
        (days.get(k) ?? days.set(k, new Set()).get(k)).add(t.periodFrom);
        if (!meta.firstSeen[k] || t.periodFrom < meta.firstSeen[k]) meta.firstSeen[k] = t.periodFrom;
        (meta.marketDesigns[k] ??= new Set()).add(t.marketDesign);
      }
    }
  }

  if (WANT_MARKETS.includes('ENERGY')) {
    const all = [];
    for (const [a, b] of monthWindows(FROM, TO)) {
      for (let d = a; d <= b; d = addDays(d, 1)) all.push(d);
    }
    // FCR has no energy market: its response is frequency-proportional and unmetered as energy.
    for (const p of WANT_PRODUCTS.filter((x) => x !== 'FCR')) days.set(`${p}|ENERGY`, new Set(all));
  }

  for (const k of Object.keys(meta.marketDesigns)) meta.marketDesigns[k] = [...meta.marketDesigns[k]].sort();
  return { days, meta };
}

// ── Product parsing ────────────────────────────────────────────────────────

/**
 * Turn a source product name into direction + local wall-clock window.
 *   NEGPOS_00_04 / POS_00_04 / NEG_12_16 — 4 h block (or 00_24 for a full day)
 *   POS_001 .. NEG_096                   — 15-min ISP index within the delivery day
 * Windows are German local wall clock; the caller resolves them to UTC.
 */
function parseProduct(name, productType) {
  const s = String(name).trim();
  let m = /^(NEGPOS|POS|NEG|SYM)_(\d{2})_(\d{2})$/.exec(s);
  if (m) {
    const h0 = Number(m[2]);
    const h1 = Number(m[3]) === 0 ? 24 : Number(m[3]);
    return { direction: dirOf(m[1], productType), startMin: h0 * 60, endMin: h1 * 60, durationHours: h1 - h0 };
  }
  m = /^(NEGPOS|POS|NEG|SYM)_(\d{3})$/.exec(s);
  if (m) {
    const idx = Number(m[2]);           // 1-based ISP index
    return { direction: dirOf(m[1], productType), startMin: (idx - 1) * 15, endMin: idx * 15, durationHours: 0.25, ispIndex: idx };
  }
  return null;
}

function dirOf(tag, productType) {
  if (productType === 'FCR' || tag === 'NEGPOS' || tag === 'SYM') return 'symmetric';
  return tag === 'POS' ? 'up' : 'down';
}

// ── Column parsing ─────────────────────────────────────────────────────────

/**
 * `GERMANY_AVERAGE_CAPACITY_PRICE_[(EUR/MW)/h]` → {base:'GERMANY_AVERAGE_CAPACITY_PRICE', unit:'(EUR/MW)/h'}
 * The trailing underscore before the bracket must go: leaving it in makes every exact-name
 * column lookup miss, silently, producing an empty dataset rather than an error.
 */
function splitCol(col) {
  const unit = /\[([^\]]+)\]\s*$/.exec(col)?.[1] ?? null;
  return { unit, base: col.replace(/\s*\[[^\]]+\]\s*$/, '').replace(/_+$/, '') };
}

// The export renames its country columns over time: 2020 FCR files use AT/BE/CH/DE/FR/NL/SI/DK,
// 2026 files use AUSTRIA/BELGIUM/… Both are folded to one EIC so a series does not split in two.
const COUNTRY_ALIAS = {
  DE: 'GERMANY', AT: 'AUSTRIA', BE: 'BELGIUM', CH: 'SWITZERLAND', FR: 'FRANCE',
  NL: 'NETHERLANDS', SI: 'SLOVENIA', DK: 'DENMARK', CZ: 'CZECH_REPUBLIC',
};

const AREA_EIC = {
  GERMANY: '10Y1001A1001A82H', AUSTRIA: '10YAT-APG------L', CZECH_REPUBLIC: '10YCZ-CEPS-----N',
  BELGIUM: '10YBE----------2', DENMARK: '10Y1001A1001A65H', FRANCE: '10YFR-RTE------C',
  NETHERLANDS: '10YNL----------L', SLOVENIA: '10YSI-ELES-----O', SWITZERLAND: '10YCH-SWISSGRIDZ',
};

const canonCountry = (c) => COUNTRY_ALIAS[c] ?? c;
const areaOf = (c) => (c === 'CROSSBORDER' ? 'CROSSBORDER' : c === 'TOTAL' ? 'COOPERATION_TOTAL' : (AREA_EIC[canonCountry(c)] ?? canonCountry(c)));

// ── Row builders ───────────────────────────────────────────────────────────

/**
 * Resolve a product's local wall-clock window to UTC instants and report the hours that
 * actually elapse between them.
 *
 * On the spring-forward day a nominally 4 h block spans 3 h; on autumn's it spans 5 h, and
 * a nominally 1 h product can collapse to zero span because the wall clock it ends at does
 * not exist. Dividing a per-period price by the nominal length on those days is wrong by
 * 25-33 %, and the error is invisible in any monthly mean. `spanHours` is measured, and any
 * mismatch against the nominal length is flagged on the row rather than smoothed over.
 */
function timeWindow(deliveryDate, p) {
  const period_start = berlinWallClockToUtc(deliveryDate, p.startMin);
  let period_end = berlinWallClockToUtc(deliveryDate, p.endMin);
  let spanHours = (Date.parse(period_end) - Date.parse(period_start)) / 3600000;
  let dst = null;
  if (spanHours <= 0) {
    // The end wall clock fell inside the spring-forward gap and resolved onto the start.
    // Absolute duration is what the product is actually worth: use the nominal length.
    period_end = new Date(Date.parse(period_start) + p.durationHours * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    spanHours = p.durationHours;
    dst = 'end wall clock is inside the DST spring-forward gap; period_end set to start + nominal duration';
  } else if (Math.abs(spanHours - p.durationHours) > 1e-6) {
    dst = `DST day: nominal ${p.durationHours}h product spans ${spanHours}h; price normalised on the elapsed hours`;
  }
  return { period_start, period_end, spanHours, dst };
}

function resolutionOf(p) {
  if (p.durationHours === 0.25) return 'PT15M';
  return `PT${p.durationHours}H`;
}

/** FCR capacity: pay-as-clear per participating country ("settlement capacity price"). */
function fcrCapacityRows(deliveryDate, sheet, warn) {
  const out = [];
  // Days with more than one tender iteration appear as repeated PRODUCTNAMEs; the extra
  // iteration can be all-zero (a cancelled/empty re-run). Keep TENDER_NUMBER so those are
  // distinguishable rather than silently averaged into the real one.
  for (const r of sheet.rows) {
    const p = parseProduct(r.PRODUCTNAME, 'FCR');
    if (!p) { warn(`unparsed FCR PRODUCTNAME ${r.PRODUCTNAME}`); continue; }
    const tw = timeWindow(deliveryDate, p);
    for (const col of sheet.header) {
      const { unit, base } = splitCol(col);
      const m = /^([A-Z_]+)_SETTLEMENTCAPACITY_PRICE$/.exec(base);
      if (!m) continue;
      const country = m[1];
      const raw = r[col];
      const price = Number.isFinite(raw) ? raw : null;
      const demandCol = sheet.header.find((h) => h.startsWith(`${country}_DEMAND`));
      // Column name differs by vintage: DEFICIT(-)_SURPLUS(+) in later files, IMPORT(-)_EXPORT(+) in earlier ones.
      const balCol = sheet.header.find((h) => h.startsWith(`${country}_DEFICIT`) || h.startsWith(`${country}_IMPORT`));
      const demand = demandCol && Number.isFinite(r[demandCol]) ? r[demandCol] : null;
      // A country with no demand in this block did not participate: absent, not free.
      if (price === null && demand === null) continue;
      const norm = capacityToEurPerMwPerHour(price, unit, tw.spanHours);
      if (price !== null && norm === null) { warn(`unrecognised FCR price unit ${unit}`); continue; }
      out.push(row({
        market: 'DE', area: areaOf(country),
        product: 'FCR', direction: 'symmetric', mechanism: 'cap',
        period_start: tw.period_start, period_end: tw.period_end, resolution: resolutionOf(p),
        price, price_unit: unit, currency: 'EUR', price_eur: price, fx_rate: price === null ? null : 1,
        price_norm: norm, price_norm_unit: norm === null ? null : 'EUR/MW/h',
        volume: demand, volume_unit: demand === null ? null : 'MW',
        price_basis: price === null ? null : 'clearing',
        notes: [price === 0 ? 'published price is exactly 0 — an empty re-run iteration, distinguish via extra.tenderNumber; not a market price of zero' : null, tw.dst].filter(Boolean).join(' · ') || null,
        extra: {
          country: canonCountry(country), country_as_published: country, spanHours: tw.spanHours,
          tenderNumber: r.TENDER_NUMBER ?? null, productName: r.PRODUCTNAME,
          balanceMw: balCol && Number.isFinite(r[balCol]) ? r[balCol] : null,
          balanceColumn: balCol ?? null,
        },
      }));
    }
  }
  return out;
}

/**
 * aFRR/mFRR capacity: pay-as-bid, MIN/AVERAGE/MARGINAL per country.
 *
 * Before the RAM split (2020-11-03) these files ALSO carry `<COUNTRY>_*_ENERGY_PRICE`
 * columns, because capacity and energy were bid together in one auction. Those rows are
 * emitted as `mechanism:'energy'`, which is what extends the German activation-price
 * evidence back past the RAM era to 2018-07 instead of starting it in November 2020.
 */
function frrCapacityRows(deliveryDate, sheet, productType, warn) {
  const out = [];
  const countries = [...new Set(sheet.header.map((h) => /^([A-Z_]+?)_(?:MIN|AVERAGE|MARGINAL)_CAPACITY_PRICE/.exec(splitCol(h).base)?.[1]).filter(Boolean))];
  for (const r of sheet.rows) {
    const p = parseProduct(r.PRODUCT, productType);
    if (!p) { warn(`unparsed ${productType} PRODUCT ${r.PRODUCT}`); continue; }
    const tw = timeWindow(deliveryDate, p);
    for (const country of countries) {
      const col = (kind) => sheet.header.find((h) => splitCol(h).base === `${country}_${kind}_CAPACITY_PRICE`);
      const cAvg = col('AVERAGE'), cMin = col('MIN'), cMar = col('MARGINAL');
      if (!cAvg) continue;
      const unit = splitCol(cAvg).unit;
      const avg = Number.isFinite(r[cAvg]) ? r[cAvg] : null;
      const allocCol = sheet.header.find((h) => splitCol(h).base === `${country}_ALLOCATED_VOLUME`);
      const offerCol = sheet.header.find((h) => splitCol(h).base === `${country}_SUM_OF_OFFERED_CAPACITY`);
      const impExpCol = sheet.header.find((h) => splitCol(h).base === `${country}_IMPORT(-)_EXPORT(+)`);
      const volume = allocCol && Number.isFinite(r[allocCol]) ? r[allocCol] : null;
      if (avg === null && volume === null) continue;
      const norm = capacityToEurPerMwPerHour(avg, unit, tw.spanHours);
      if (avg !== null && norm === null) { warn(`unrecognised ${productType} price unit ${unit}`); continue; }
      out.push(row({
        market: 'DE', area: areaOf(country),
        product: productType, direction: p.direction, mechanism: 'cap',
        period_start: tw.period_start, period_end: tw.period_end, resolution: resolutionOf(p),
        price: avg, price_unit: unit, currency: 'EUR', price_eur: avg, fx_rate: avg === null ? null : 1,
        price_norm: norm, price_norm_unit: norm === null ? null : 'EUR/MW/h',
        volume, volume_unit: volume === null ? null : 'MW',
        price_basis: avg === null ? null : 'vwap_accepted',
        notes: [avg === 0 ? 'accepted capacity price is exactly 0 across this block — a real outcome of the pre-RAM mixed-price design, where providers bid the capacity leg at zero and recovered on the energy leg; not missing data' : null, tw.dst].filter(Boolean).join(' · ') || null,
        extra: {
          country: canonCountry(country), productName: r.PRODUCT, spanHours: tw.spanHours,
          minAccepted: cMin && Number.isFinite(r[cMin]) ? capacityToEurPerMwPerHour(r[cMin], unit, tw.spanHours) : null,
          marginalAccepted: cMar && Number.isFinite(r[cMar]) ? capacityToEurPerMwPerHour(r[cMar], unit, tw.spanHours) : null,
          offeredMw: offerCol && Number.isFinite(r[offerCol]) ? r[offerCol] : null,
          importExportMw: impExpCol && Number.isFinite(r[impExpCol]) ? r[impExpCol] : null,
          publishedUnit: unit,
        },
      }));

      // Pre-RAM: energy prices bid inside the same auction.
      const eAvg = sheet.header.find((h) => splitCol(h).base === `${country}_AVERAGE_ENERGY_PRICE`);
      if (!eAvg) continue;
      const eUnit = splitCol(eAvg).unit;
      if (String(eUnit).replace(/\s/g, '').toUpperCase() !== 'EUR/MWH') { warn(`unexpected pre-RAM energy unit ${eUnit}`); continue; }
      const ePrice = Number.isFinite(r[eAvg]) ? r[eAvg] : null;
      if (ePrice === null) continue;
      const eMin = sheet.header.find((h) => splitCol(h).base === `${country}_MIN_ENERGY_PRICE`);
      const eMar = sheet.header.find((h) => splitCol(h).base === `${country}_MARGINAL_ENERGY_PRICE`);
      out.push(row({
        market: 'DE', area: areaOf(country),
        product: productType, direction: p.direction, mechanism: 'energy',
        period_start: tw.period_start, period_end: tw.period_end, resolution: resolutionOf(p),
        price: ePrice, price_unit: eUnit, currency: 'EUR', price_eur: ePrice, fx_rate: 1,
        price_norm: ePrice, price_norm_unit: 'EUR/MWh',
        volume: null, volume_unit: null,
        price_basis: 'offer_curve_mean',
        notes: ['pre-RAM era: energy price bid inside the capacity auction, published in the CAPACITY export', tw.dst].filter(Boolean).join(' · '),
        extra: {
          country: canonCountry(country), productName: r.PRODUCT, era: 'pre-RAM', spanHours: tw.spanHours,
          offerCurveMin: eMin && Number.isFinite(r[eMin]) ? r[eMin] : null,
          offerCurveMarginal: eMar && Number.isFinite(r[eMar]) ? r[eMar] : null,
          semantics: 'statistics of the offered merit-order list, not the settled activation price',
        },
      }));
    }
  }
  return out;
}

/** aFRR/mFRR energy (RAM): statistics of the OFFERED merit-order list. Not settlement. */
function frrEnergyRows(deliveryDate, sheet, productType, warn) {
  const out = [];
  for (const r of sheet.rows) {
    const p = parseProduct(r.PRODUCT, productType);
    if (!p) { warn(`unparsed ${productType} ENERGY PRODUCT ${r.PRODUCT}`); continue; }
    const tw = timeWindow(deliveryDate, p);
    const cAvg = sheet.header.find((h) => splitCol(h).base === 'GERMANY_AVERAGE_ENERGY_PRICE');
    const cMin = sheet.header.find((h) => splitCol(h).base === 'GERMANY_MIN_ENERGY_PRICE');
    const cMar = sheet.header.find((h) => splitCol(h).base === 'GERMANY_MARGINAL_ENERGY_PRICE');
    const cOff = sheet.header.find((h) => splitCol(h).base === 'GERMANY_SUM_OF_OFFERED_CAPACITY');
    if (!cAvg) { warn('no GERMANY_AVERAGE_ENERGY_PRICE column'); continue; }
    const unit = splitCol(cAvg).unit;
    if (String(unit).replace(/\s/g, '').toUpperCase() !== 'EUR/MWH') { warn(`unexpected energy unit ${unit}`); continue; }
    const avg = Number.isFinite(r[cAvg]) ? r[cAvg] : null;
    const offered = cOff && Number.isFinite(r[cOff]) ? r[cOff] : null;
    if (avg === null && offered === null) continue;
    out.push(row({
      market: 'DE', area: AREA_EIC.GERMANY, product: productType, direction: p.direction, mechanism: 'energy',
      period_start: tw.period_start, period_end: tw.period_end, resolution: resolutionOf(p),
      price: avg, price_unit: unit, currency: 'EUR', price_eur: avg, fx_rate: avg === null ? null : 1,
      price_norm: avg, price_norm_unit: avg === null ? null : 'EUR/MWh',
      volume: offered, volume_unit: offered === null ? null : 'MW',
      price_basis: avg === null ? null : 'offer_curve_mean',
      notes: [r.NOTE ? String(r.NOTE) : null, tw.dst].filter(Boolean).join(' · ') || null,
      extra: {
        productName: r.PRODUCT, ispIndex: p.ispIndex ?? null, spanHours: tw.spanHours,
        offerCurveMin: cMin && Number.isFinite(r[cMin]) ? r[cMin] : null,
        offerCurveMarginal: cMar && Number.isFinite(r[cMar]) ? r[cMar] : null,
        // For NEG products the published MIN/AVERAGE/MARGINAL are ordered by economic
        // value, not numerically: MIN can exceed AVERAGE. Do not assert monotonicity.
        semantics: 'statistics of the offered merit-order list, not the settled activation price',
      },
    }));
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(FIXTURES, { recursive: true });

  console.log(`enumerating tenders ${FROM}..${TO} · products ${WANT_PRODUCTS.join(',')} · markets ${WANT_MARKETS.join(',')}`);
  const { days, meta } = await enumerateDays();
  const jobs = [];
  for (const [k, set] of days) {
    const [productType, market] = k.split('|');
    for (const d of [...set].sort()) jobs.push({ productType, market, deliveryDate: d });
  }
  console.log(`  ${jobs.length} delivery-day exports to fetch`);
  for (const [k, v] of Object.entries(meta.firstSeen)) console.log(`  first ${k}: ${v}`);

  const rowsByYear = new Map();
  const warnings = [];
  const unitByDay = [];              // {key, date, unit} per delivery day; transitions derived below
  const missing = [];
  let bytes = 0, done = 0;

  await pool(jobs, CONCURRENCY, async (job) => {
    const sheet = await getSheet(job.deliveryDate, job.productType, job.market);
    if (!sheet) { missing.push(job); return; }
    bytes += sheet.bytes ?? 0;
    if (!sheet.rows.length) { missing.push({ ...job, reason: 'empty sheet' }); return; }

    const warn = (msg) => warnings.push({ ...job, msg });
    let rows;
    if (job.market === 'CAPACITY' && job.productType === 'FCR') rows = fcrCapacityRows(job.deliveryDate, sheet, warn);
    else if (job.market === 'CAPACITY') rows = frrCapacityRows(job.deliveryDate, sheet, job.productType, warn);
    else rows = frrEnergyRows(job.deliveryDate, sheet, job.productType, warn);

    // Record the published unit per delivery day. Transitions are derived AFTER the pool
    // completes, from the sorted record: computing them inside a concurrent loop compares
    // whichever day happened to finish last and invents a spurious reversal.
    const u = rows.find((r) => r.price_unit)?.price_unit ?? null;
    if (u) unitByDay.push({ key: `${job.productType}|${job.market}`, date: job.deliveryDate, unit: u });

    for (const r of rows) {
      const y = r.period_start.slice(0, 4);
      (rowsByYear.get(y) ?? rowsByYear.set(y, []).get(y)).push(r);
    }
    if (++done % 500 === 0) console.log(`  ${done}/${jobs.length} (${(bytes / 1e6).toFixed(0)} MB downloaded)`);
  });

  // Derive unit transitions deterministically from the sorted per-day record.
  const unitTransitions = [];
  {
    const byKey = new Map();
    for (const u of unitByDay) (byKey.get(u.key) ?? byKey.set(u.key, []).get(u.key)).push(u);
    for (const [key, days] of byKey) {
      days.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < days.length; i++) {
        if (days[i].unit !== days[i - 1].unit) {
          unitTransitions.push({ key, from: days[i - 1].unit, to: days[i].unit, last_day_before: days[i - 1].date, first_day_after: days[i].date });
        }
      }
    }
  }

  let nRows = 0; const invalid = [];
  for (const rows of rowsByYear.values()) for (const r of rows) {
    nRows++;
    const bad = validateRow(r);
    if (bad.length && invalid.length < 20) invalid.push({ bad, row: r });
  }
  if (invalid.length) {
    console.error(`INVALID ROWS (${invalid.length} shown):`, JSON.stringify(invalid[0], null, 1));
    process.exitCode = 1;
    return;
  }

  const files = [];
  for (const [y, rows] of [...rowsByYear].sort()) {
    rows.sort((a, b) =>
      a.period_start.localeCompare(b.period_start) || a.product.localeCompare(b.product) ||
      a.mechanism.localeCompare(b.mechanism) || String(a.area).localeCompare(String(b.area)) ||
      String(a.direction).localeCompare(String(b.direction)));
    const nd = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const gz = zlib.gzipSync(Buffer.from(nd), { level: 9 });
    const file = `de-reserve-${y}.ndjson.gz`;
    await fs.writeFile(path.join(OUT, file), gz);
    files.push({
      file, rows: rows.length, bytes_gz: gz.length,
      span: `${rows[0].period_start}..${rows.at(-1).period_end}`,
      products: [...new Set(rows.map((r) => `${r.product}/${r.mechanism}`))].sort(),
      sha256: crypto.createHash('sha256').update(gz).digest('hex'),
    });
    console.log(`  ${file}: ${rows.length} rows, ${(gz.length / 1024).toFixed(0)} KiB`);
  }

  // A raw export kept as a loader fixture, so parsing is testable with no network.
  const fixJob = jobs.find((j) => j.market === 'CAPACITY' && j.productType === 'aFRR' && j.deliveryDate >= '2026-01-01') ?? jobs.at(-1);
  const fixUrl = `${API}/tenders/results/aggregated?deliveryDate=${fixJob.deliveryDate}&productType=${fixJob.productType}&market=${fixJob.market}&exportFormat=xlsx`;
  const fixBuf = Buffer.from(await (await fetch(fixUrl)).arrayBuffer());
  await writeFixture(path.join(FIXTURES, 'de-aggregated-afrr-capacity.xlsx'), fixBuf);
  await writeFixture(path.join(FIXTURES, 'de-aggregated-afrr-capacity.url.txt'), fixUrl + '\n');

  const manifest = {
    dataset: 'de-reserve',
    market: 'DE',
    products: WANT_PRODUCTS,
    mechanisms: WANT_MARKETS.map((m) => (m === 'CAPACITY' ? 'cap' : 'energy')),
    source: 'regelleistung.net — joint balancing platform of 50Hertz, Amprion, TenneT DE, TransnetBW',
    source_urls: {
      tender_list: `${API}/tenders?from=<date>&to=<date>&markets=<CAPACITY|ENERGY>&pageSize=${PAGE_SIZE}`,
      aggregated_results: `${API}/tenders/results/aggregated?deliveryDate=<date>&productType=<FCR|aFRR|mFRR>&market=<CAPACITY|ENERGY>&exportFormat=xlsx`,
      human_readable: 'https://www.regelleistung.net/apps/datacenter/tenders/',
      break_calendar: 'https://www.regelleistung.net/de-de/Marktinformationen/Historie-Regelreservebeschaffung',
    },
    licence: 'Published by the German TSOs for market transparency under EU Regulation 543/2013 and the EB Guideline. The portal states no explicit open licence; stored here in derived form for internal calibration, not redistribution.',
    retrieved_at: new Date().toISOString(),
    requested_span: `${FROM}..${TO}`,
    resolution: 'native product blocks: capacity PT4H (FCR PT24H 2019-07-01..2020-06-30); energy PT4H until the 15-min switch, then PT15M',
    timezone: 'product windows are German local wall clock (Europe/Berlin), stored as UTC instants',
    coverage_verification: {
      claimed_by_arc_doc: '2011 → now',
      actual_first_tender: meta.firstSeen,
      verdict: 'Arc-doc claim FALSE. Only the daily-auction era is served. Pre-2018-07-12 (aFRR/mFRR) and pre-2019-07-01 (FCR) are unavailable through this channel and were not located in any other public bulk channel during 36.E0.',
      page_cap: PAGE_SIZE,
      page_cap_behaviour: 'truncates silently with no hasMore flag; pageSize>2000 errors',
      bid_level_endpoint_rejected: '/tenders/{id}/bid-results caps at 100 rows per page with no flag; aggregating over it without paging covers 1 of 12 product blocks',
      export_bytes_downloaded: bytes,
      exports_missing: missing.length,
    },
    price_semantics: {
      FCR_cap: 'clearing — FCR Cooperation settles pay-as-clear; per-country SETTLEMENTCAPACITY_PRICE',
      aFRR_mFRR_cap: 'vwap_accepted — German capacity auctions are pay-as-bid, so there is no clearing price; AVERAGE is what a provider earns, MARGINAL is in extra',
      aFRR_mFRR_energy: 'offer_curve_mean — statistics of the OFFERED merit-order list, NOT the settled activation price',
      normalisation: 'price_norm is EUR/MW/h (cap) or EUR/MWh (energy), derived from each file\'s own unit header and the product duration',
      observed_unit_transitions: unitTransitions,
      fcr_unit_check: 'FCR EUR/MW is per product period, verified against its own 2020-07-01 product-length change: 6x4h prices on 2020-07-01 sum to 140.42 vs 150.3 for the single 24h product on 2020-06-30',
    },
    area_semantics: 'row.area is the EIC of the country whose column the price came from. GERMANY=10Y1001A1001A82H. FCR rows include the whole FCR Cooperation (AT, BE, DK, FR, NL, SI, CH, CZ) plus area="CROSSBORDER" for the uniform cross-border price. aFRR/mFRR rows include AT and CZ from the capacity cooperation plus area="COOPERATION_TOTAL". Filter by area for a single-country series.',
    exports_fetched: jobs.length,
    rows: nRows,
    warnings: warnings.slice(0, 100),
    n_warnings: warnings.length,
    missing: missing.slice(0, 50),
    files,
  };
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'current_year', dataset: 'de' });

  console.log(`\n${nRows} rows · ${files.length} files · ${(bytes / 1e6).toFixed(0)} MB downloaded`);
  if (unitTransitions.length) { console.log('unit transitions observed:'); for (const t of unitTransitions) console.log('  ', JSON.stringify(t)); }
  if (warnings.length) console.log(`${warnings.length} warnings (first 100 in manifest)`);
  if (missing.length) console.log(`${missing.length} exports missing/empty`);
}

await main();
