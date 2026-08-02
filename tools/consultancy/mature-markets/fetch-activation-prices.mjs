// Settled aFRR/mFRR ACTIVATION prices — the series E0 recorded as missing and B-036 was
// opened to find.
//
// WHY THIS EXISTS. E0 §5 item 7: "No settled DE activation prices. E2/E3 activation-price
// calibration is unsourced." The German RAM export on regelleistung.net is a statistic of the
// OFFERED merit-order list (`price_basis: offer_curve_mean`, bounded by the 15 000 EUR/MWh
// technical limit) and must never be read as a price series — unfiltered it produced a "peak"
// of 28 210 EUR/MWh. So E2/E3's activation leg had nothing measured to stand on.
//
// WHAT B-036 ESTABLISHED, AND WHERE THE ANSWER ACTUALLY WAS. The scoping target was
// netztransparenz.de. netztransparenz does NOT publish a settled activation-price series of its
// own — but its own AEP-Module page names the channel that does, in prose, twice:
//
//   "Der aFRR VWAP zur Berechnung des AEP Modul 1 wird auf der ENTSO-E Transparency Platform
//    im Bereich 'Balancing/Prices of Activated Balancing Energy' veröffentlicht. Folgende
//    Filtereinstellungen müssen dazu ausgewählt werden: Reserve Type: aFRR, Source: Not
//    Specific, Type of Product: Standard."   (same sentence again for mFRR)
//
// That is the German TSOs stating that the number they settle on is ENTSO-E documentType A84.
// E0 had probed A84 and recorded "empty for DE". That result was an EIC-choice artefact, not an
// absence: A84 for Germany is published per TSO CONTROL AREA, not against the DE-LU bidding
// zone or the German block. Isolated one variable at a time (Pause-A doc §2):
//
//   controlArea_Domain=10YDE-VE-------2 (50Hertz)      → DATA
//   controlArea_Domain=10Y1001A1001A82H (DE-LU BZN)    → "No matching data found"
//   controlArea_Domain=10Y1001A1001A83F (DE CTA)       → "No matching data found"
//   controlArea_Domain=10YCB-GERMANY--8 (DE block)     → "No matching data found"
//
// `businessType` is an optional narrowing filter and the EIC is the switch — but
// `standard_MarketProduct=A01` is NOT optional. It excludes a parallel undeclared-product
// TimeSeries that pads every unactivated quarter-hour with a price of zero. It does not remove
// zeros altogether, because Austria's own standard-product series is dense with them too. See the
// note on `fetchMonth` and the zero-price paragraph below.
//
// A SILENT-FAILURE SURFACE THAT WOULD HAVE REPRODUCED E0's WRONG ANSWER (B8). Of the four
// German TSO control areas, THREE publish (50Hertz, TenneT DE, TransnetBW) and Amprion
// publishes nothing at all — not a different price, no rows. The three that publish carry
// byte-identical values (verified: all 88 activated aFRR-up ISPs of 2026-01-05 identical across
// the three). So the series is one NRV-wide German price replicated per publishing control area,
// and a probe that happened to pick Amprion would conclude "Germany does not publish settled
// activation prices" — the same false negative E0 landed on by a different route. Every fetch
// here names its publisher explicitly and `--verify-publishers` re-checks the identity claim.
//
// WHAT THE SERIES IS, AND THE ONE THING ANALYSIS MUST NOT DO WITH IT. A price exists only where
// balancing energy was actually activated. For Germany that is expressed structurally: one short
// Period per activation episode, so 2026-01 arrives as 468 TimeSeries carrying 4 752 points of
// which 4 are zero. **Austria expresses the same thing differently** — a dense step function over
// the whole month in which 0 is the resting value meaning no activation: 5 952 points for AT aFRR
// 2026-01 with 304 zeros, and 328 points for AT mFRR with 202 zeros. Same dataItem, same filter,
// two publication styles, and a reader who assumed one style would either lose Austria's episodes
// or invent German ones.
//
// Either way the absent or zero quarter-hours are not cheap and not missing — nothing was
// activated. A mean over calendar ISPs treating absence as zero would understate the activation
// price; a mean over activated ISPs is the activation price and says nothing about how often
// activation happens. Those are two different parameters and E2/E3 need both, so the manifest
// records activated-ISP counts per month per direction, and per-series zero-drop counts, alongside
// the prices.
//
// curveType A03 IS BLOCK COMPRESSION, AND READING IT AS ONE-ROW-PER-POINT LOSES ACTIVATED ISPs.
// This was got wrong first time and the correction matters, so it is written down. The first
// version emitted one row per published point and asserted that positions are always contiguous,
// on the strength of a single day of aFRR where they were. Over the full span they are not:
// DE mFRR on 2022-06-22 publishes a Period of 09:15Z..10:30Z at PT15M — five ISPs — carrying
// positions 1, 3 and 5 with three different prices. That is A03 doing what A03 means: a point
// holds until the next position, so position 1 covers two ISPs. One-row-per-point covered 45 of
// those 75 minutes and silently dropped the rest; the first acquisition reported 4 465 such
// "gaps" across the base.
//
// The worry that motivated the wrong reading — that carry-forward would fabricate activations in
// ISPs where nothing happened — is unfounded, because sparsity is expressed by PERIOD BOUNDARIES,
// not by gaps in positions. An ISP with no activation is outside every Period, which is why a day
// arrives as a dozen short Periods rather than one padded one. Carry-forward inside a Period only
// asserts what the publisher's own declared interval already asserts.
//
// So points are expanded across [position, nextPosition), the final point running to the Period's
// declared end, and any row covering more than one ISP carries `extra.block_isps` so the
// expansion stays auditable. The invariant now asserted is the one that actually holds: the
// expanded rows must TILE each Period exactly — no overlap, no hole — which is a real check that
// fails loudly if the publisher changes shape again.
//
// STRUCTURAL BREAK — A PROMPT PREMISE THIS CONTRADICTS, AND A HOPE THAT ALSO DIED.
//
// B-036's prompt says "PICASSO accession DE-side is IN this series — segment it." It is not: the
// DE series STARTS at the accession. First German rows are 2022-06-21 (the go-live evening) and
// the first full day is 2022-06-22 — exactly the primary-sourced PICASSO DE accession date already
// in the break calendar. Germany cannot measure its own accession break on activation prices.
//
// Austria was acquired to supply that before/after, having acceded PICASSO on the same date and
// appearing to publish back to 2021-01. **It does not supply it.** Austria's apparent pre-2025
// history exists only in the undeclared-product series that the zero-padding lives in; under
// `standard_MarketProduct=A01` — the definition Germany's series uses — AT standard-product
// publication measures as starting **2025-08-31 for aFRR** (three years after its own accession)
// and **2023-06-12 for mFRR** (essentially at its own MARI accession, 2023-06-27). So Austria has
// no pre-accession segment either, under a consistent product definition.
//
// The honest conclusion, which is a finding rather than a gap: **no market in reach publishes a
// settled activation price from before its own platform accession.** Splicing AT's
// undeclared-product series onto the standard-product series to manufacture a before/after would
// compare two product definitions and call the difference an accession effect. Austria is kept as
// a second market's level-and-frequency comparator, which is what it can honestly be.
//
// CROSS-CHECK AGAINST THE TSOs' OWN NUMBER (B5). The netztransparenz AEP-Modul-1 CSV for
// 2026-01-05 is committed as a fixture. 78 of its 92 priced ISPs equal an A84 aFRR value for the
// same instant to the cent (65 up, 13 down — Modul 1 follows the imbalance direction). The
// remaining 14 differ because Modul 1 is a DERIVED module with its own combination rules, not a
// republication of the VWAP; the disagreement is on the Modul-1 side and is not evidence against
// A84. The test asserts the 78 exact matches against committed bytes, offline.
//
// Requires ENTSOE_API_KEY in .env.local.
//
// Usage:
//   node tools/consultancy/mature-markets/fetch-activation-prices.mjs
//   node tools/consultancy/mature-markets/fetch-activation-prices.mjs --from 2022-06 --to 2026-07
//   node tools/consultancy/mature-markets/fetch-activation-prices.mjs --markets DE
//   node tools/consultancy/mature-markets/fetch-activation-prices.mjs --verify-publishers

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { row, validateRow } from './schema.mjs';
import { writeManifest } from './manifest-writer.mjs';

const API = 'https://web-api.tp.entsoe.eu/api';
const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'activation');
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'mature-markets');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);

/**
 * Publishers. `eic` is the control area actually fetched; `mirrors` are control areas asserted
 * to carry the same numbers; `silent` are control areas in the same market that publish nothing.
 * All three lists are measured, not assumed — see --verify-publishers.
 */
const MARKETS = [
  {
    market: 'DE', area: 'DE', eic: '10YDE-VE-------2', publisher: '50Hertz',
    mirrors: [
      { name: 'TenneT DE', eic: '10YDE-EON------1' },
      { name: 'TransnetBW', eic: '10YDE-ENBW-----N' },
    ],
    silent: [{ name: 'Amprion', eic: '10YDE-RWENET---I' }],
    first_month: '2022-06',
    note: 'One NRV-wide German price. Published per TSO control area by 50Hertz, TenneT DE and TransnetBW with identical values; Amprion publishes nothing. The series begins at the PICASSO DE accession (2022-06-22) — there is no pre-accession German segment.',
  },
  {
    market: 'AT', area: 'AT', eic: '10YAT-APG------L', publisher: 'APG',
    mirrors: [], silent: [],
    // 2023-01 rather than 2021-01: under standard_MarketProduct=A01, AT publishes nothing before
    // 2023-06-12 (mFRR) and 2025-08-31 (aFRR). The window starts a few months earlier so the
    // coverage boundary is measured in this dataset rather than asserted from a probe, and the
    // empty months are recorded in coverage_verification.per_month.
    first_month: '2023-01',
    note: 'Austria acceded PICASSO 2022-06-22, the same date as Germany, and MARI 2023-06-27. Acquired hoping to supply the before/after Germany cannot — it does NOT: under the standard-product definition AT aFRR publication starts 2025-08-31, three years after its own accession, and AT mFRR starts 2023-06-12, essentially at its own MARI accession. AT is therefore a second market\'s level-and-frequency comparator, not accession-break evidence. Its apparent 2021-onward history exists only in the undeclared-product series that also carries the zero padding.',
  },
];

// businessType is the reserve type on this dataItem. A95 FCR / A96 aFRR / A97 mFRR / A98 RR.
// FCR and RR were probed for DE and AT and return no data — Germany does not settle FCR energy
// through this surface — so only aFRR and mFRR are swept.
const RESERVES = [
  { product: 'aFRR', businessType: 'A96' },
  { product: 'mFRR', businessType: 'A97' },
];

const DIRECTION = { A01: 'up', A02: 'down' };
const RES_MIN = { PT15M: 15, PT30M: 30, PT60M: 60 };

/**
 * The environment wins over the file so this runs unchanged under GitHub Actions, where the key
 * arrives as a repository secret and there is no .env.local. Never logged.
 */
async function token() {
  if (process.env.ENTSOE_API_KEY?.trim()) return process.env.ENTSOE_API_KEY.trim();
  const env = await fs.readFile(path.join(import.meta.dirname, '..', '..', '..', '.env.local'), 'utf8');
  const t = (/ENTSOE_API_KEY=(.*)/.exec(env)?.[1] ?? '').trim();
  if (!t) throw new Error('ENTSOE_API_KEY missing from both the environment and .env.local');
  return t;
}

const monthList = (from, to) => {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
};
const stampFrom = (ym) => `${ym.replace('-', '')}010000`;
const stampTo = (ym) => { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}${String(m).padStart(2, '0')}010000`; };

/**
 * Fetch one month. ENTSO-E returns HTTP 200 for both "no data" and "genuinely empty", so the
 * caller gets an explicit `empty` with the platform's own reason text rather than a silent [].
 * A 366-day window 504s and a 92-day window succeeds; monthly is used because the manifest
 * reports per-month coverage anyway and a failed month costs one retry, not a quarter.
 */
async function fetchMonth(tok, eic, businessType, ym) {
  // `standard_MarketProduct=A01` IS LOAD-BEARING, AND THE REASON IS NOT THE OBVIOUS ONE.
  //
  // It looks like an optional narrowing filter, and dropping it looks like the way to widen
  // coverage — AT aFRR 2021-01 returns "No matching data found" with it and 5 896 points without.
  // That reading was tried and it is wrong. Inspecting a DE mFRR document shows FOUR TimeSeries:
  //
  //   ts1, ts2  standard_MarketProduct=A01, imbalance_Price.category=A08, every point non-zero
  //   ts3, ts4  NO standard_MarketProduct,  imbalance_Price.category=A07, whole-day cover, mostly 0
  //
  // ts3/ts4 pad the entire day, including every quarter-hour in which nothing was activated, with
  // a price of ZERO. That is absence published as zero — the Svenska kraftnät trap in a second
  // source — and it is what the German TSOs' own prescription ("Reserve Type: mFRR, Source: Not
  // Specific, Type of Product: **Standard**") exists to exclude. Dropping the filter admits ~190
  // fabricated "activated at 0 EUR/MWh" quarter-hours per day per product, which would drag every
  // mean toward zero and invent an activation frequency of 100 %.
  //
  // So the filter stays, and Austria's thin pre-2025-08 coverage under it is a real coverage
  // boundary of the standard-product publication rather than something to widen the filter around.
  // Splicing AT's undeclared-product series onto DE's standard-product series across the PICASSO
  // break would be comparing two different product definitions and calling the difference an
  // accession effect. The consequence for E2 is in the manifest and in the comparability note.
  const q = `documentType=A84&processType=A16&businessType=${businessType}`
    + `&standard_MarketProduct=A01&controlArea_Domain=${eic}`
    + `&periodStart=${stampFrom(ym)}&periodEnd=${stampTo(ym)}&securityToken=${tok}`;
  const attempts = Number(arg('attempts', '7'));
  for (let a = 1; a <= attempts; a++) {
    let maintenance = false;
    try {
      const r = await fetch(`${API}?${q}`);
      const buf = Buffer.from(await r.arrayBuffer());
      // The platform serves scheduled maintenance as a 503 carrying an HTML page, not an XML
      // Acknowledgement. Distinguishing it matters: a rate-limit clears in seconds, a maintenance
      // window in hours, and the two want different backoff and a different message to the
      // operator. Encountered live while acquiring this dataset on 2026-07-30.
      if (r.status === 503 && /Service Temporarily Unavailable|Scheduled maintenance/i.test(buf.toString('utf8', 0, 20000))) {
        maintenance = true;
        throw new Error('SOURCE_UNAVAILABLE — ENTSO-E Transparency Platform reports scheduled maintenance (HTTP 503, HTML maintenance page)');
      }
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      const docs = isZip ? unzipAll(buf) : [buf.toString('utf8')];
      if (docs.some((d) => /<TimeSeries>/.test(d))) return { docs };
      const reason = (/<text>([^<]*)<\/text>/.exec(docs[0]) ?? [])[1] ?? `HTTP ${r.status}, ${buf.length} bytes`;
      if (r.status !== 200) throw new Error(reason);
      return { empty: true, reason };
    } catch (e) {
      if (a === attempts) throw new Error(`${eic} ${businessType} ${ym}: ${e.message}`);
      // Maintenance: minutes, capped. Anything else: seconds.
      const waitMs = maintenance ? Math.min(300_000, 30_000 * a) : 1500 * a;
      if (maintenance) console.log(`\n  ${ym} ${businessType}: platform in maintenance, retry ${a}/${attempts - 1} in ${waitMs / 1000}s`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
}

/** Multi-document responses are ZIP-wrapped. Parsed via the central directory, not by assuming one entry. */
function unzipAll(buf) {
  const out = [];
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    let off = buf.readUInt32LE(i + 16);
    const n = buf.readUInt16LE(i + 10);
    for (let k = 0; k < n; k++) {
      const nameLen = buf.readUInt16LE(off + 28);
      const extraLen = buf.readUInt16LE(off + 30);
      const cmtLen = buf.readUInt16LE(off + 32);
      const local = buf.readUInt32LE(off + 42);
      const method = buf.readUInt16LE(off + 10);
      const csize = buf.readUInt32LE(off + 20);
      const lNameLen = buf.readUInt16LE(local + 26);
      const lExtraLen = buf.readUInt16LE(local + 28);
      const dataAt = local + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataAt, dataAt + csize);
      out.push((method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8'));
      off += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }
  throw new Error('ZIP end-of-central-directory not found');
}

/**
 * Expand one Balancing_MarketDocument into rows. ONE ROW PER PUBLISHED POINT — no carry-forward
 * (see header). Returns `gaps` for any Period where positions are not contiguous, so a change in
 * how the publisher emits blocks surfaces as a counted anomaly instead of a silent reading choice.
 */
export function parseDoc(xml, { market, area, product, eic }) {
  const rows = [];
  const gaps = [];
  const categories = new Set();
  const unitsSeen = new Set();
  const revision = (/<revisionNumber>([^<]+)/.exec(xml) ?? [])[1] ?? null;
  // The point regex requires <position> to be followed immediately by <activation_Price.amount>.
  // That is the shape every observed document uses, but a document that ordered the children
  // differently, or carried a point with no price, would be skipped SILENTLY and the series would
  // come out short with nothing failing. Counting <Point> elements and comparing turns that from a
  // silent loss into a reported number (B8).
  const pointElements = (xml.match(/<Point>/g) ?? []).length;
  let zeroPriceDropped = 0;

  for (const ts of xml.split('<TimeSeries>').slice(1)) {
    const g = (re) => (re.exec(ts) ?? [])[1] ?? null;
    const dirCode = g(/<flowDirection\.direction>([^<]+)/);
    const direction = DIRECTION[dirCode] ?? null;
    const currency = g(/<currency_Unit\.name>([^<]+)/);
    const priceUnitRaw = g(/<price_Measure_Unit\.name>([^<]+)/);
    const curveType = g(/<curveType>([^<]+)/);
    const stdProduct = g(/<standard_MarketProduct\.marketProductType>([^<]+)/);
    const businessType = g(/<businessType>([^<]+)/);
    unitsSeen.add(`${currency}/${priceUnitRaw}`);

    for (const per of ts.split('<Period>').slice(1)) {
      const start = (/<start>([^<]+)/.exec(per) ?? [])[1];
      const end = (/<end>([^<]+)/.exec(per) ?? [])[1];
      const resolution = (/<resolution>([^<]+)/.exec(per) ?? [])[1];
      const mins = RES_MIN[resolution];
      if (!mins) throw new Error(`unhandled resolution ${resolution} in ${market} ${product}`);
      const t0 = Date.parse(start);
      const nIsp = Math.round((Date.parse(end) - t0) / 60000 / mins);

      const pts = [...per.matchAll(/<position>(\d+)<\/position>\s*<activation_Price\.amount>(-?[\d.]+)<\/activation_Price\.amount>(?:\s*<imbalance_Price\.category>([^<]+)<)?/g)]
        .map((m) => ({ pos: Number(m[1]), price: Number(m[2]), cat: m[3] ?? null }));

      // Expand each point across the ISPs it covers, then assert the result tiles the Period.
      let expectedNextIsp = 1;
      pts.forEach((p, i) => {
        if (p.cat) categories.add(p.cat);
        // A03: this point holds until the next position; the last runs to the Period's own end.
        const nextPos = curveType === 'A03' ? (pts[i + 1]?.pos ?? nIsp + 1) : p.pos + 1;
        const blockIsps = nextPos - p.pos;
        if (p.pos !== expectedNextIsp) {
          // A hole or an overlap. Not the same thing as block compression, and a real defect.
          gaps.push({ market, product, direction, period_start: start, kind: p.pos > expectedNextIsp ? 'hole' : 'overlap', expected_position: expectedNextIsp, actual_position: p.pos });
        }
        expectedNextIsp = nextPos;
        // A price of exactly zero inside the standard-product series would mean the padding series
        // leaked past the filter. Counted and DROPPED rather than stored: an activation price of
        // exactly 0.00 is not a plausible settled outcome at 15-minute granularity, and treating
        // absence as a price is the specific error that made the German RAM export unusable and
        // nearly broke the Swedish floor. If this count is ever non-zero the filter has stopped
        // working and the series must not be used until that is understood.
        if (p.price === 0) { zeroPriceDropped += blockIsps; return; }
        for (let k = 0; k < blockIsps; k++) {
          const s = new Date(t0 + (p.pos - 1 + k) * mins * 60000);
          const e = new Date(t0 + (p.pos + k) * mins * 60000);
          rows.push(row({
            market, area, product, direction, mechanism: 'energy',
            period_start: s.toISOString().replace('.000', ''),
            period_end: e.toISOString().replace('.000', ''),
            resolution,
            price: p.price, price_unit: 'EUR/MWh', currency, price_eur: p.price, fx_rate: 1,
            price_norm: p.price, price_norm_unit: 'EUR/MWh',
            volume: null, volume_unit: null,
            price_basis: 'vwap_activated',
            notes: null,
            extra: {
              control_area_eic: eic, business_type: businessType, standard_market_product: stdProduct,
              curve_type: curveType, imbalance_price_category: p.cat,
              // Only present when the publisher compressed a run of ISPs into one point, so the
              // expansion is auditable and a reader can tell a published ISP from a derived one.
              ...(blockIsps > 1 ? { block_isps: blockIsps, block_position: p.pos + k === p.pos ? 'first' : 'carried' } : {}),
              // doc_revision is kept per row because a bump is the platform's own signal that a
              // settled price was restated — exactly what the 36.E0.1 refresh's append-only gate
              // needs to catch. The document's createdDateTime is deliberately NOT stored: it is
              // the time of the REQUEST, not a property of the data, so keeping it would make
              // every shard's bytes change on every refetch and destroy the byte-stability the
              // refresh relies on to prove it only appended.
              doc_revision: revision,
            },
          }));
        }
      });
      // The tiling invariant: the expanded rows must reach exactly the Period's declared end.
      if (pts.length && expectedNextIsp !== nIsp + 1) {
        gaps.push({ market, product, direction, period_start: start, kind: 'period_not_tiled', reached_isp: expectedNextIsp - 1, period_isps: nIsp });
      }
    }
  }
  return {
    rows, gaps, categories: [...categories], unitsSeen: [...unitsSeen],
    pointElements, zeroPriceDropped,
  };
}

/** --verify-publishers: re-measure the "three identical publishers, one silent" claim. */
async function verifyPublishers(tok) {
  const day = arg('day', '2026-01-05');
  const ym = day.slice(0, 7);
  console.log(`Publisher identity check, ${day} (fetching whole month ${ym}, comparing ${day})\n`);
  for (const m of MARKETS) {
    for (const { product, businessType } of RESERVES) {
      const series = {};
      for (const p of [{ name: m.publisher, eic: m.eic }, ...m.mirrors, ...m.silent]) {
        const res = await fetchMonth(tok, p.eic, businessType, ym);
        if (res.empty) { series[p.name] = null; continue; }
        const map = new Map();
        for (const d of res.docs) for (const r of parseDoc(d, { market: m.market, area: m.area, product, eic: p.eic }).rows) {
          if (r.period_start.slice(0, 10) === day) map.set(`${r.direction}|${r.period_start}`, r.price);
        }
        series[p.name] = map;
      }
      const publishing = Object.entries(series).filter(([, v]) => v);
      const silent = Object.entries(series).filter(([, v]) => !v).map(([k]) => k);
      if (!publishing.length) { console.log(`${m.market} ${product}: no publisher returned data on ${day}`); continue; }
      const [refName, ref] = publishing[0];
      let compared = 0, differing = 0;
      for (const [name, map] of publishing.slice(1)) {
        for (const [k, v] of ref) { compared++; if (map.get(k) !== v) differing++; }
        console.log(`${m.market} ${product}: ${name} vs ${refName} — ${ref.size} ISPs, ${differing} differing`);
      }
      if (publishing.length === 1) console.log(`${m.market} ${product}: single publisher ${refName}, ${ref.size} activated ISPs`);
      if (silent.length) console.log(`${m.market} ${product}: SILENT (no rows) — ${silent.join(', ')}`);
      if (differing) process.exitCode = 1;
      void compared;
    }
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight, returning results in INPUT order.
 * Order matters: the committed bytes must not depend on which response arrived first.
 */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const tok = await token();
  if (has('verify-publishers')) return verifyPublishers(tok);

  const wanted = (arg('markets', 'DE,AT')).split(',').map((s) => s.trim().toUpperCase());
  const markets = MARKETS.filter((m) => wanted.includes(m.market));
  const to = arg('to', new Date().toISOString().slice(0, 7));
  await fs.mkdir(OUT, { recursive: true });

  const files = [];
  const coverage = [];
  const allGaps = [];
  const categories = new Set();
  const unitsSeen = new Set();
  let nRows = 0;
  let zeroPriceDropped = 0;
  let pointElements = 0;

  for (const m of markets) {
    const from = arg('from', m.first_month);
    const months = monthList(from, to);
    const rowsByProduct = new Map(RESERVES.map((r) => [r.product, []]));

    // Fetched through a bounded pool, then PROCESSED IN ORDER. The platform's per-request latency
    // varies from about 1 s when healthy to 40 s when it is working through a backlog, and it is a
    // per-connection rather than a server-wide limit: measured post-maintenance, six concurrent
    // monthly requests completed in 25.6 s wall against roughly 220 s sequential. Concurrency is
    // therefore what makes this acquisition finish in minutes rather than hours in the degraded
    // state. Parsing stays sequential and in month order so the committed output does not depend on
    // which response happened to arrive first.
    const tasks = months.flatMap((ym) => RESERVES.map((r) => ({ ym, ...r })));
    const fetched = await mapPool(tasks, Number(arg('concurrency', '10')), async (t) => {
      const res = await fetchMonth(tok, m.eic, t.businessType, t.ym);
      process.stdout.write(`\r${m.market} ${t.ym} ${t.product}                    `);
      return { t, res };
    });

    for (const { t, res } of fetched) {
      {
        const { product } = t;
        const ym = t.ym;
        if (res.empty) {
          coverage.push({ market: m.market, product, month: ym, activated_isps: 0, reason: res.reason.slice(0, 120) });
          continue;
        }
        let got = 0;
        let zeroThisWindow = 0;
        const perDir = {};
        for (const d of res.docs) {
          const p = parseDoc(d, { market: m.market, area: m.area, product, eic: m.eic });
          rowsByProduct.get(product).push(...p.rows);
          allGaps.push(...p.gaps);
          p.categories.forEach((c) => categories.add(c));
          p.unitsSeen.forEach((u) => unitsSeen.add(u));
          got += p.rows.length;
          zeroPriceDropped += p.zeroPriceDropped;
          zeroThisWindow += p.zeroPriceDropped;
          pointElements += p.pointElements;
          for (const r of p.rows) perDir[r.direction] = (perDir[r.direction] ?? 0) + 1;
        }
        coverage.push({ market: m.market, product, month: ym, activated_isps: got, by_direction: perDir, zero_price_isps_dropped: zeroThisWindow });
        process.stdout.write(`\r${m.market} ${product} ${ym}: ${got} activated ISPs        `);
      }
    }
    process.stdout.write('\n');

    for (const [product, rows] of rowsByProduct) {
      if (!rows.length) { console.log(`  ${m.market} ${product}: no rows in ${from}..${to} — not written`); continue; }
      // Dedup on (direction, period_start). A month boundary can be served twice when a Period
      // straddles it; keeping the last write would silently prefer whichever month ran second.
      const seen = new Map();
      let dupes = 0;
      for (const r of rows) {
        const k = `${r.direction}|${r.period_start}`;
        if (seen.has(k)) { dupes++; if (seen.get(k).price !== r.price) throw new Error(`${m.market} ${product} ${k}: two different prices for one ISP (${seen.get(k).price} vs ${r.price}) — this is a real conflict, not a duplicate`); continue; }
        seen.set(k, r);
      }
      const dedup = [...seen.values()].sort((a, b) => a.period_start.localeCompare(b.period_start) || String(a.direction).localeCompare(String(b.direction)));

      // Sharded by calendar year, matching every other dataset in the base. This is not
      // cosmetic: the 36.E0.1 refresh proves it is append-only by asserting that every shard
      // outside the refreshed window keeps its sha256 byte-for-byte. One file per series would
      // rewrite all of history on every monthly run and make that assertion impossible.
      const byYear = new Map();
      for (const r of dedup) {
        const y = r.period_start.slice(0, 4);
        (byYear.get(y) ?? byYear.set(y, []).get(y)).push(r);
      }
      for (const [y, yrRows] of [...byYear].sort()) {
        const gz = zlib.gzipSync(Buffer.from(yrRows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 });
        const file = `activation-${m.market.toLowerCase()}-${product.toLowerCase()}-${y}.ndjson.gz`;
        await fs.writeFile(path.join(OUT, file), gz);
        nRows += yrRows.length;
        files.push({
          file, market: m.market, product, year: Number(y), rows: yrRows.length,
          bytes_gz: gz.length,
          span: `${yrRows[0].period_start}..${yrRows.at(-1).period_end}`,
          sha256: crypto.createHash('sha256').update(gz).digest('hex'),
        });
      }
      console.log(`  ${m.market} ${product}: ${dedup.length} rows across ${byYear.size} year shards, ${dedup[0].period_start.slice(0, 10)}..${dedup.at(-1).period_start.slice(0, 10)}${dupes ? `, ${dupes} duplicates dropped` : ''}`);
    }
  }

  const invalid = [];
  for (const f of files) {
    const text = zlib.gunzipSync(await fs.readFile(path.join(OUT, f.file))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      const bad = validateRow(JSON.parse(line));
      if (bad.length && invalid.length < 10) invalid.push({ file: f.file, bad });
    }
  }
  if (invalid.length) { console.error('INVALID:', JSON.stringify(invalid[0])); process.exitCode = 1; return; }

  // A single-day fixture, on the SAME day as the committed netztransparenz AEP-Modul-1 CSV, so the
  // two form a matched pair the cross-check test can read offline. A whole month of A84 is ~1 MB;
  // the existing A44 fixture is one day at 19 kB and that precedent is the right one.
  //
  // WRITE-ONCE. The monthly refresh calls this fetcher, and rewriting the fixture every run would
  // churn its bytes (mRID and createdDateTime change per request) in every refresh PR — noise in a
  // diff whose whole job is to be reviewable. It is also the wrong instinct for a fixture: the
  // point of committed raw bytes is that they DON'T move, so a parser change is visible against a
  // fixed reference. Re-cut it deliberately with --refresh-fixture.
  const FIXTURE_DAY = arg('fixture-day', '2026-01-05');
  const fixturePath = path.join(FIXTURES, 'entsoe-a84-de-afrr-sample.xml');
  const fixtureExists = await fs.access(fixturePath).then(() => true, () => false);
  if (!fixtureExists || has('refresh-fixture')) {
    try {
      const fx = await fetchMonth(tok, MARKETS[0].eic, 'A96', FIXTURE_DAY.slice(0, 7));
      if (!fx.empty) {
        const dayStart = `<start>${FIXTURE_DAY}`;
        const day = fx.docs.find((d) => d.includes(dayStart)) ?? fx.docs[0];
        await fs.writeFile(fixturePath, day);
        const next = new Date(Date.parse(`${FIXTURE_DAY}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
        await fs.writeFile(path.join(FIXTURES, 'entsoe-a84-de-afrr-sample.url.txt'),
          `${API}?documentType=A84&processType=A16&businessType=A96&controlArea_Domain=${MARKETS[0].eic}&periodStart=${FIXTURE_DAY.replace(/-/g, '')}0000&periodEnd=${next.replace(/-/g, '')}0000&securityToken=<key>\n`);
        console.log(`fixture cut: ${FIXTURE_DAY}`);
      }
    } catch (e) {
      console.log(`fixture day ${FIXTURE_DAY} not captured: ${e.message}`);
    }
  }

  const activatedIspSummary = {};
  for (const c of coverage) {
    const k = `${c.market}|${c.product}`;
    activatedIspSummary[k] ??= { months: 0, months_with_data: 0, activated_isps: 0, up: 0, down: 0, zero_price_isps_dropped: 0 };
    const s = activatedIspSummary[k];
    s.months++;
    s.zero_price_isps_dropped += c.zero_price_isps_dropped ?? 0;
    if (c.activated_isps) { s.months_with_data++; s.activated_isps += c.activated_isps; s.up += c.by_direction?.up ?? 0; s.down += c.by_direction?.down ?? 0; }
  }

  const manifest = {
    dataset: 'settled-activation-prices',
    markets: markets.map((m) => ({ market: m.market, area: m.area, publisher: m.publisher, control_area_eic: m.eic, mirror_control_areas: m.mirrors, silent_control_areas: m.silent, first_month: m.first_month, note: m.note })),
    products: RESERVES.map((r) => r.product),
    mechanism: 'energy',
    source: 'ENTSO-E Transparency Platform, documentType A84 — PRICES_OF_ACTIVATED_BALANCING_ENERGY_R3 [TR 17.1.F, IF aFRR 3.16]',
    source_urls: {
      api: `${API}?documentType=A84&processType=A16&businessType=<A96|A97>&controlArea_Domain=<EIC>&periodStart=<YYYYMMDDHHmm>&periodEnd=<YYYYMMDDHHmm>&securityToken=<key>`,
      api_note: 'No standard_MarketProduct filter. The German TSOs prescribe "Type of Product: Standard", which is right for DE and returns nothing for AT before 2025-08 because those documents do not declare the element. Measured: AT aFRR 2021-01 gives 0 points with the filter and 5896 without.',
      de_tso_pointer: 'https://www.netztransparenz.de/de-de/Regelenergie/Ausgleichsenergiepreis/AEP-Module',
      de_tso_crosscheck_csv: 'https://www.netztransparenz.de/DesktopModules/LotesCharts/CsvDownloadHandler.ashx?request=<base64 of {LocalFrom,LocalTo,ResultTimeZone,Settings}>',
      human_readable: 'https://newtransparency.entsoe.eu/balancing/energyPrices',
    },
    why_this_channel: 'netztransparenz.de publishes no settled activation-price series of its own. Its AEP-Module page states that the aFRR and mFRR VWAPs used to compute AEP Modul 1 — the German settlement price — are published on the ENTSO-E Transparency Platform under "Balancing/Prices of Activated Balancing Energy" with Reserve Type aFRR/mFRR, Source Not Specific, Type of Product Standard. That is documentType A84. The German TSOs are naming ENTSO-E as the channel for their own settled number.',
    e0_correction: {
      e0_recorded: 'A84 + processType=A16 serves AT and FI; DE, NL and LT return empty (36.E0 Pause-A §3 consequence 3).',
      actual: 'A84 serves DE. The DE-empty result was an EIC-choice artefact: Germany publishes per TSO control area, not against the DE-LU bidding zone, the DE control area or the German block. Isolated one parameter at a time — controlArea_Domain=10YDE-VE-------2 returns data on the same day that 10Y1001A1001A82H, 10Y1001A1001A83F and 10YCB-GERMANY--8 all return "No matching data found".',
      not_re_probed_here: 'NL and LT were not re-probed against every German-style control-area EIC. Their absence from this dataset is an untested claim, not a measured one.',
    },
    licence: 'ENTSO-E Transparency Platform data, reusable under the platform terms of use with attribution. Requires a free registered API key.',
    retrieved_at: new Date().toISOString(),
    requested_span: `${arg('from', 'per-market first_month')}..${to}`,
    resolution: 'PT15M as published (the imbalance settlement period)',
    timezone: 'ENTSO-E publishes UTC instants; stored unchanged',
    price_semantics: {
      basis: 'vwap_activated — the volume-weighted average price of balancing energy ACTUALLY ACTIVATED in that ISP and direction, as settled. Distinct from offer_curve_mean (the German RAM export, a statistic of the offered merit-order list) and from vwap_accepted (the mean accepted bid in a CAPACITY auction).',
      unit: 'EUR/MWh native; price_norm equals price and fx_rate is 1 throughout',
      negative_prices_are_real: 'Retained. Negative activation prices occur in both directions and are a market outcome, not a parsing fault.',
      technical_limit: 'Values at 15000 EUR/MWh occur and are the platform technical price limit reached in scarcity. They are settled prices at the cap, not the artefact that made the RAM offer-curve export unusable.',
      sparse_by_construction: 'A price exists only for ISPs in which energy was activated in that direction. Absent ISPs mean no activation, NOT a price of zero and NOT a gap in the data. Analysis must compute (a) the mean over activated ISPs and (b) the activation frequency separately; activated_isps_by_month below is the denominator for (b).',
      no_volume: 'A84 carries no activated volume, so `volume` is null on every row. Activated MW per ISP is published separately by netztransparenz (Aktivierte Regelleistung) through the CSV handler above — not acquired here, see follow-ups.',
    },
    parsing_notes: {
      curveType_A03_not_carried_forward: 'Documents are curveType A03. Its formal reading carries a price forward until the next position, which for an activation series would fabricate activations in unactivated ISPs. One row is emitted per published point and position contiguity is asserted; violations are counted in position_gaps below rather than resolved silently.',
      point_elements_seen: pointElements,
      curve_a03_block_expansion: 'curveType A03 compresses runs of quarter-hours into one point; each point is expanded across [position, nextPosition) and rows from a compressed block carry extra.block_isps. Reading one row per point loses activated quarter-hours — measured on DE mFRR 2022-06-22, where a 5-ISP Period carries positions 1, 3 and 5.',
      zero_price_isps_dropped: zeroPriceDropped,
      zero_price_note: 'Rows whose activation price is exactly 0 are dropped as absence-published-as-zero, counted here and per series in coverage_verification. THIS IS A JUDGEMENT, and a large one, so it is stated rather than buried: DE and AT publish this dataItem in two different styles. Germany emits one short Period per activation episode, so its series is sparse and only ~0.1% of published points are zero. Austria emits a dense step function over the whole month in which 0 is the RESTING value meaning no activation — 5.1% of AT aFRR points and 61.6% of AT mFRR points, and each zero point expands across its A03 block, which is why the dropped count is large relative to the kept count. Dropping them is what makes the two markets comparable at all; keeping them would report Austria as activating in every quarter-hour at a mean dragged toward zero. The limit of the justification: A84 carries no volume, so unlike the Swedish case there is no second column to prove a zero means absence. It is inferred from the publication style and from the implausibility of an exactly-0.00 settled quarter-hourly price. Any analysis that needs Austrian activation FREQUENCY rather than level must re-examine this choice.',
      position_gaps: allGaps.length,
      position_gap_examples: allGaps.slice(0, 5),
      zip: 'multi-document responses are ZIP-wrapped; parsed via the central directory',
      imbalance_price_categories_seen: [...categories],
      currency_units_seen: [...unitsSeen],
    },
    coverage_verification: {
      claimed_by_e0: 'no settled DE activation prices exist in any reachable channel',
      verdict: 'FALSE — DE settled aFRR activation prices are served from 2022-06-21 onward. But E0\'s consequence still partly holds: the German series has no pre-PICASSO segment, so Germany cannot measure its own accession break on activation prices.',
      de_first_rows: '2022-06-21 (9 activated ISPs, the PICASSO go-live evening); first full day 2022-06-22',
      de_picasso_accession: '2022-06-22 — primary-sourced in the break calendar, and the series start coincides with it',
      window_limits_measured: { '31_days': 'OK', '92_days': 'OK (14152 points)', '366_days': 'HTTP 504 gateway timeout' },
      mfrr_is_genuinely_sparse: 'German mFRR activation is rare in this era: measured 9-32 activated ISPs per MONTH against roughly 4500-4900 for aFRR. That is a market fact, not missing data, and it constrains how much weight an mFRR activation-revenue term can carry.',
      activated_isps_by_series: activatedIspSummary,
      per_month: coverage,
    },
    rows: nRows,
    files,
  };
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'current_year', dataset: 'activation' });

  console.log(`\n${nRows} rows across ${files.length} files, ${(files.reduce((s, f) => s + f.bytes_gz, 0) / 1048576).toFixed(1)} MB gz`);
  if (allGaps.length) console.log(`position gaps: ${allGaps.length} — non-contiguous positions found, see manifest.parsing_notes`);
}

// Only run when executed directly. Importing this module — which a test does, and which an
// accidental `node -e "import(...)"` did during development — must not fire network requests.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) await main();
