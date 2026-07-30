// Day-ahead prices for the mature markets, from the ENTSO-E Transparency Platform.
//
// WHY THIS IS PART OF THE EVIDENCE BASE AND NOT A SIDE QUEST. The arc's whole floor argument
// is that a saturated ancillary price falls to the marginal provider's opportunity cost, and
// for a battery that opportunity cost is energy arbitrage. The summary table therefore has a
// column for "floor level as a ratio to the contemporaneous arbitrage opportunity". Without
// wholesale prices in the same markets over the same months, that column can only ever read
// not_computable — which would leave the arc's central claim uncalibrated in the very
// artifact built to calibrate it.
//
// CHANNEL. documentType=A44 (day-ahead prices), the one balancing-adjacent surface on the
// legacy REST API this repo already uses in production (tools/consultancy/backfill-entsoe.mjs).
// Requires ENTSOE_API_KEY in .env.local.
//
// A NOTE ON 36.C's ENTSO-E VERDICT. 36.C concluded that this API "serves nobody" for
// balancing data, on a sweep whose positive controls all failed. During 36.E0's Pause A the
// sweep was re-run with documentType=A15 + businessType=B95 + type_MarketAgreement.Type=A01
// and returned real procured-balancing-capacity data for AT, CZ, NL, BE, FI and Lithuania,
// with those same controls passing in the same run. The correction is recorded in
// docs/investigations/2026-07-30-phase-36-e0-pause-a.md §3. It is NOT acted on here: an
// ENTSO-E balancing ingestion leg belongs to 36.C's arc, not to this evidence base.
//
// Usage: node tools/consultancy/mature-markets/fetch-entsoe-da.mjs [--from 2015] [--to 2026]

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { row, validateRow } from './schema.mjs';

const API = 'https://web-api.tp.entsoe.eu/api';
const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'da');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const FROM_Y = Number(arg('from', '2015'));
const TO_Y = Number(arg('to', String(new Date().getUTCFullYear())));

// One bidding zone per mature market, chosen to match the market whose reserve prices we hold.
const ZONES = [
  { market: 'DE', area: 'DE_LU', eic: '10Y1001A1001A82H', note: 'DE-LU bidding zone. Before 2018-10-01 Germany, Austria and Luxembourg were one zone (10Y1001A1001A63L); this EIC returns the DE-LU series and is empty before the split.' },
  { market: 'SE', area: 'SE3', eic: '10Y1001A1001A46L', note: 'SE3 — the Swedish zone holding most demand and most battery capacity.' },
];

// GB is NOT on the ENTSO-E Transparency Platform. Verified in one run against a passing
// control: documentType=A44 returns "No matching data found for ENERGY_PRICES [12.1.D]" for
// 10YGB----------A, 10Y1001A1001A92E and 10Y1001A1001A016, while DE returns 37 kB of prices
// for the same interval. Post-Brexit GB publishes through Elexon instead, so GB day-ahead
// comes from the BMRS Market Index Data feed — unauthenticated, 30-minute settlement periods.
//
// PROVIDER CHOICE MATTERS AND IS A ZERO TRAP. MID carries two providers: APXMIDP (EPEX) and
// N2EXMIDP (Nord Pool). In sampled windows N2EXMIDP returns price 0.00 with volume 0.000 —
// absence published as zero, the same trap as Svenska kraftnät. APXMIDP is used as the GB
// day-ahead reference, and any row with price 0 AND volume 0 is dropped as no-trade rather
// than recorded as a price of zero.
const GB = {
  market: 'GB', area: 'GB', provider: 'APXMIDP',
  url: (from, to) => `https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index?from=${from}&to=${to}`,
};

async function token() {
  const env = await fs.readFile(path.join(import.meta.dirname, '..', '..', '..', '.env.local'), 'utf8');
  const t = (/ENTSOE_API_KEY=(.*)/.exec(env)?.[1] ?? '').trim();
  if (!t) throw new Error('ENTSOE_API_KEY missing from .env.local');
  return t;
}

const stamp = (y, m, d, h) => `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}${String(h).padStart(2, '0')}00`;

/** Fetch one window. Multi-document responses are ZIP-wrapped; single ones are raw XML. */
async function fetchWindow(tok, eic, from, to) {
  const q = `documentType=A44&in_Domain=${eic}&out_Domain=${eic}&periodStart=${from}&periodEnd=${to}&securityToken=${tok}`;
  for (let a = 1; a <= 5; a++) {
    try {
      const r = await fetch(`${API}?${q}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      if (isZip) return { docs: unzipAll(buf) };
      const text = buf.toString('utf8');
      const reason = /<text>([^<]*)</.exec(text)?.[1];
      if (reason && /No matching data/i.test(reason)) return { docs: [] };
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${reason ?? text.slice(0, 140)}`);
      return { docs: [text] };
    } catch (e) {
      if (a === 5) throw new Error(`${eic} ${from}..${to}: ${e.message}`);
      await new Promise((s) => setTimeout(s, 1200 * a));
    }
  }
}

/** Read every entry of a ZIP (stored or deflated), using the central directory. */
function unzipAll(buf) {
  const out = [];
  // Locate End Of Central Directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: no EOCD');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const body = buf.subarray(dataStart, dataStart + compSize);
    out.push((method === 0 ? body : zlib.inflateRawSync(body)).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ISO_MIN = { PT15M: 15, PT30M: 30, PT60M: 60, PT1H: 60 };

/** Parse an A44 Publication_MarketDocument into rows. */
function parseA44(xml, zone) {
  const rows = [];
  const currency = /<currency_Unit\.name>([^<]+)</.exec(xml)?.[1] ?? 'EUR';
  const priceUnit = /<price_Measure_Unit\.name>([^<]+)</.exec(xml)?.[1] ?? 'MWH';
  for (const ts of xml.split('<TimeSeries>').slice(1)) {
    for (const per of ts.split('<Period>').slice(1)) {
      const start = /<start>([^<]+)</.exec(per)?.[1];
      const res = /<resolution>([^<]+)</.exec(per)?.[1];
      const stepMin = ISO_MIN[res];
      if (!start || !stepMin) continue;
      const t0 = Date.parse(start.length === 17 ? start.replace('Z', ':00Z') : start);
      // curveType A03 means a point holds until the next one: carry the last price forward.
      const points = [...per.matchAll(/<position>(\d+)<\/position>\s*<price\.amount>([-\d.]+)<\/price\.amount>/g)]
        .map((m) => [Number(m[1]), Number(m[2])]);
      if (!points.length) continue;
      const maxPos = points.at(-1)[0];
      const byPos = new Map(points);
      let last = null;
      for (let pos = 1; pos <= maxPos; pos++) {
        if (byPos.has(pos)) last = byPos.get(pos);
        if (last === null) continue;
        const s = new Date(t0 + (pos - 1) * stepMin * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
        rows.push(row({
          market: zone.market, area: zone.area, product: 'spot', direction: null, mechanism: 'energy',
          period_start: s,
          period_end: new Date(t0 + pos * stepMin * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          resolution: res === 'PT60M' ? 'PT60M' : res,
          price: last, price_unit: `${currency}/${priceUnit === 'MWH' ? 'MWh' : priceUnit}`,
          currency, price_eur: currency === 'EUR' ? last : null, fx_rate: currency === 'EUR' ? 1 : null,
          price_norm: currency === 'EUR' ? last : null, price_norm_unit: currency === 'EUR' ? 'EUR/MWh' : null,
          volume: null, volume_unit: null, price_basis: 'clearing', notes: null,
          extra: { resolution_source: res, carried_forward: !byPos.has(pos) },
        }));
      }
    }
  }
  return rows;
}

/**
 * GB day-ahead from Elexon BMRS Market Index Data.
 * The endpoint rejects any range over 7 days inclusive ("The date range between From and To
 * inclusive must not exceed 7 days"), so a month is fetched as overlapping weekly windows and
 * deduplicated downstream.
 */
async function fetchGbWindow(from, to) {
  for (let a = 1; a <= 5; a++) {
    try {
      const r = await fetch(GB.url(from, to), { headers: { Accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 140)}`);
      const j = await r.json();
      return j.data ?? [];
    } catch (e) {
      if (a === 5) throw new Error(`GB ${from}..${to}: ${e.message}`);
      await new Promise((s) => setTimeout(s, 1200 * a));
    }
  }
}

const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** All 7-day windows covering one month. */
function weekWindows(y, m) {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const out = [];
  for (let d = first; d <= last; d = addDaysIso(d, 7)) {
    const end = addDaysIso(d, 6);
    out.push([d, end > last ? last : end]);
  }
  return out;
}

function gbRows(data, gbpRate, dropped) {
  const out = [];
  for (const d of data) {
    if (d.dataProvider !== GB.provider) continue;
    const price = Number(d.price), volume = Number(d.volume);
    // Absence published as zero: no price AND no volume means no trade, not a price of zero.
    if (price === 0 && volume === 0) { dropped.zeroNoTrade++; continue; }
    const start = String(d.startTime).replace(/\.\d+Z$/, 'Z');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(start)) { dropped.badStamp++; continue; }
    const eur = Math.round((price / gbpRate) * 1e4) / 1e4;
    out.push(row({
      market: 'GB', area: 'GB', product: 'spot', direction: null, mechanism: 'energy',
      period_start: start,
      period_end: new Date(Date.parse(start) + 30 * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      resolution: 'PT30M',
      price, price_unit: 'GBP/MWh', currency: 'GBP', price_eur: eur, fx_rate: gbpRate,
      price_norm: eur, price_norm_unit: 'EUR/MWh',
      volume: Number.isFinite(volume) ? volume : null, volume_unit: Number.isFinite(volume) ? 'MWh' : null,
      price_basis: 'clearing', notes: null,
      extra: { dataProvider: d.dataProvider, settlementDate: d.settlementDate ?? null, settlementPeriod: d.settlementPeriod ?? null },
    }));
  }
  return out;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(FIXTURES, { recursive: true });
  const tok = await token();
  const fxTable = JSON.parse(await fs.readFile(path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'fx', 'fx-monthly.json'), 'utf8'));
  const gbpRates = fxTable.currencies.GBP.rates;
  const gbDropped = { zeroNoTrade: 0, badStamp: 0 };

  const rowsByKey = new Map();     // `${market}-${year}` -> rows
  const coverage = [];
  const nonEur = new Set();
  let sample = null;

  for (const zone of ZONES) {
    for (let y = FROM_Y; y <= TO_Y; y++) {
      for (let m = 1; m <= 12; m++) {
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const { docs } = await fetchWindow(tok, zone.eic, stamp(y, m, 1, 0), stamp(y, m, lastDay, 23));
        let n = 0;
        for (const xml of docs) {
          const rows = parseA44(xml, zone);
          n += rows.length;
          for (const r of rows) {
            if (r.currency !== 'EUR') nonEur.add(r.currency);
            const k = `${zone.market}-${r.period_start.slice(0, 4)}`;
            (rowsByKey.get(k) ?? rowsByKey.set(k, []).get(k)).push(r);
          }
          sample ??= xml;
        }
        coverage.push({ market: zone.market, month: `${y}-${String(m).padStart(2, '0')}`, docs: docs.length, rows: n });
      }
      const got = coverage.filter((c) => c.market === zone.market && c.month.startsWith(String(y))).reduce((s, c) => s + c.rows, 0);
      console.log(`  ${zone.market} ${y}: ${got} rows`);
    }
  }

  for (let y = FROM_Y; y <= TO_Y; y++) {
    let got = 0;
    for (let m = 1; m <= 12; m++) {
      const month = `${y}-${String(m).padStart(2, '0')}`;
      const rate = gbpRates[month] ?? gbpRates[Object.keys(gbpRates).sort().at(-1)];
      let rows = [];
      for (const [a, b] of weekWindows(y, m)) rows = rows.concat(gbRows(await fetchGbWindow(a, b), rate, gbDropped));
      got += rows.length;
      coverage.push({ market: 'GB', month, docs: rows.length ? 1 : 0, rows: rows.length });
      for (const r of rows) {
        const k = `GB-${r.period_start.slice(0, 4)}`;
        (rowsByKey.get(k) ?? rowsByKey.set(k, []).get(k)).push(r);
      }
    }
    console.log(`  GB ${y}: ${got} rows`);
  }

  let nRows = 0; const invalid = [];
  for (const rows of rowsByKey.values()) for (const r of rows) {
    nRows++;
    const bad = validateRow(r);
    if (bad.length && invalid.length < 10) invalid.push({ bad, row: r });
  }
  if (invalid.length) { console.error('INVALID:', JSON.stringify(invalid[0], null, 1)); process.exitCode = 1; return; }

  const files = [];
  for (const [k, rows] of [...rowsByKey].sort()) {
    // Dedup on (area, start, RESOLUTION). Resolution must be in the key: ENTSO-E serves
    // Germany's hourly MTU day-ahead and its quarter-hourly auction for the same instants,
    // and they are DIFFERENT AUCTIONS with different prices (measured 2024-06-01T22:00Z:
    // PT60M 88.58, PT15M 90.90). Keying on (area, start) alone silently overwrote one
    // product's price with the other's and dropped ~9 600 rows per year as "duplicates".
    const seen = new Map();
    for (const r of rows) seen.set(`${r.area}|${r.period_start}|${r.resolution}`, r);
    const dedup = [...seen.values()].sort((a, b) => a.period_start.localeCompare(b.period_start) || a.resolution.localeCompare(b.resolution));
    const gz = zlib.gzipSync(Buffer.from(dedup.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 });
    const file = `da-${k.toLowerCase()}.ndjson.gz`;
    await fs.writeFile(path.join(OUT, file), gz);
    files.push({ file, rows: dedup.length, duplicates_dropped: rows.length - dedup.length, bytes_gz: gz.length, span: `${dedup[0].period_start}..${dedup.at(-1).period_end}`, sha256: crypto.createHash('sha256').update(gz).digest('hex') });
  }
  console.log(files.map((f) => `  ${f.file}: ${f.rows} rows${f.duplicates_dropped ? `, ${f.duplicates_dropped} dupes dropped` : ''}`).join('\n'));

  if (sample) await fs.writeFile(path.join(FIXTURES, 'entsoe-a44-sample.xml'), sample);

  const manifest = {
    dataset: 'day-ahead-prices',
    markets: ZONES.map((z) => ({ market: z.market, area: z.area, eic: z.eic, note: z.note })),
    products: ['spot'],
    mechanism: 'energy',
    source: 'ENTSO-E Transparency Platform documentType A44 (DE, SE) + Elexon BMRS Market Index Data (GB)',
    source_urls: {
      entsoe: `${API}?documentType=A44&in_Domain=<EIC>&out_Domain=<EIC>&periodStart=<YYYYMMDDHHmm>&periodEnd=<YYYYMMDDHHmm>&securityToken=<key>`,
      elexon_gb: 'https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index?from=<YYYY-MM-DD>&to=<YYYY-MM-DD> (max 7-day range)',
    },
    gb_channel: {
      why: 'GB is not on the ENTSO-E Transparency Platform. A44 returns "No matching data found for ENERGY_PRICES [12.1.D]" for 10YGB----------A, 10Y1001A1001A92E and 10Y1001A1001A016 while DE returns prices for the same interval in the same run — a passing positive control, so this is a fact about GB and not about the API.',
      provider: GB.provider,
      provider_choice: 'MID publishes APXMIDP (EPEX) and N2EXMIDP (Nord Pool). N2EXMIDP returns price 0.00 with volume 0.000 in sampled windows — absence as zero. APXMIDP is the reference used.',
      zero_no_trade_dropped: gbDropped.zeroNoTrade,
      bad_stamps_dropped: gbDropped.badStamp,
      resolution: 'PT30M settlement periods',
      currency: 'native GBP retained; converted at the ECB monthly-average GBP/EUR rate',
    },
    licence: 'ENTSO-E Transparency Platform data, reusable under the platform terms of use with attribution. Requires a free registered API key.',
    retrieved_at: new Date().toISOString(),
    requested_span: `${FROM_Y}..${TO_Y}`,
    purpose: 'the arbitrage-opportunity denominator for the summary table\'s floor-vs-opportunity column',
    resolution: 'native, as published per document: PT60M for most of the span, PT15M or PT30M where the market moved to shorter MTUs',
    timezone: 'ENTSO-E publishes UTC instants; stored unchanged',
    parsing_notes: {
      zip: 'multi-document responses are ZIP-wrapped; parsed via the central directory rather than assuming a single stored entry',
      curveType_A03: 'A03 curves omit unchanged points; the last price is carried forward and each carried row is flagged extra.carried_forward',
      multiple_resolutions_are_multiple_products: 'ENTSO-E publishes the German hourly MTU day-ahead price and the quarter-hourly auction price for the same instants. They are separate auctions with different prices, not one series at two resolutions. Rows are keyed on resolution as well as time. Analysis that wants "the" day-ahead price must pick PT60M explicitly where it exists.',
      currencies_seen_non_eur: [...nonEur],
    },
    coverage_verification: {
      per_month: coverage.filter((c) => c.rows === 0).length ? coverage : 'all months returned rows',
      months_empty: coverage.filter((c) => c.rows === 0).map((c) => `${c.market} ${c.month}`),
    },
    rows: nRows,
    files,
  };
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(`\n${nRows} rows across ${files.length} files`);
  if (nonEur.size) console.log(`non-EUR currencies seen: ${[...nonEur].join(',')} — these rows have price_norm null and need FX handling`);
}

await main();
