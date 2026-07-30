// Structural-break calendar — the dates at which a market's rules changed, pinned to
// primary sources and fetched at pin time.
//
// WHY THIS FILE IS THE MOST LOAD-BEARING ONE IN 36.E0. Every decay half-life the arc will
// ever quote is a fit over a window. If the window straddles a rule change — an auction
// redesign, a product-length change, a platform coupling — the fit measures the rule change
// and reports it as market behaviour. Segmenting on breaks is not a refinement; it is the
// difference between a parameter and a coincidence.
//
// TWO DISCIPLINES ARE ENFORCED HERE, both paid for:
//
//  * Rule #3 / A5: every date comes from a TSO, ENTSO-E or ACER page, never from a news
//    article and never from a model summary of a page. The ENTSO-E accession lists were
//    first read through a summariser, which rendered "AST accession to PICASSO, 11 April
//    2025" as "Austria (AST)". AST is Latvia's TSO; Austria acceded on 22 June 2022 with
//    Germany. The raw HTML is therefore fetched and the evidence line extracted here, and
//    the extracted line is stored beside each date so a reader can check the reading.
//
//  * C7: nothing is pinned without being fetched. 36.D armed two tripwires against URLs it
//    never fetched and both were dead. Every source below records `verified_at`, the HTTP
//    status, byte count, a sha256 of the exact bytes read, and the matched evidence lines.
//    A source that returns no evidence lines FAILS rather than being recorded as pinned —
//    "pinned but blind" is the state that must not be reachable.
//
// Usage: node tools/consultancy/mature-markets/fetch-calendar.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'calendar');

// Each source declares what it is expected to evidence. `expect` patterns are asserted
// against the fetched text; a source whose expectations do not all match is reported as
// FAILED, because a page that moved is indistinguishable from a page that never said what
// we think it said unless we check.
const SOURCES = [
  {
    id: 'entsoe-picasso',
    url: 'https://www.entsoe.eu/network_codes/eb/picasso/',
    what: 'PICASSO (aFRR energy platform) accession dates per TSO',
    authority: 'ENTSO-E',
    expect: [/Litgrid accession to PICASSO/i, /Elering accession to PICASSO/i, /AST accession to PICASSO/i, /22 June 2022/],
    evidence: /(accession to PICASSO|successfully accessed|first exchange of aFRR|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b)/i,
  },
  {
    id: 'entsoe-mari',
    url: 'https://www.entsoe.eu/network_codes/eb/mari/',
    what: 'MARI (mFRR energy platform) accession dates per TSO',
    authority: 'ENTSO-E',
    expect: [/Baltic TSOs connection to MARI/i, /10 October 2024/, /5 October 2022/],
    evidence: /(MARI|connection to MARI|accessed to MARI|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b)/i,
  },
  {
    id: 'regelleistung-historie',
    url: 'https://www.regelleistung.net/de-de/Marktinformationen/Historie-Regelreservebeschaffung',
    what: 'German procurement-design history: auction frequency, product length, RAM split, platform accessions, battery prequalification',
    authority: 'the four German TSOs (50Hertz, Amprion, TenneT DE, TransnetBW)',
    expect: [/12\.07\.2018/, /01\.07\.2019/, /03\.11\.2020/, /22\.06\.2022/, /05\.10\.2022/, /speicherbegrenzten Anlagen/i],
    evidence: /(\d{2}\.\d{2}\.\d{4}|speicherbegrenzten Anlagen|Regelarbeitsmarkt|Grenzpreisverfahren)/,
  },
  {
    id: 'regelleistung-alpaca',
    url: 'https://www.regelleistung.net/de-de/EU-Kooperationen/ALPACA-aFRR-Leistungsmarkt',
    what: 'ALPACA — the aFRR CAPACITY cooperation whose members appear as extra control blocks in the German capacity series',
    authority: 'the four German TSOs',
    expect: [/ALPACA/i, /CEPS/i, /2020/],
    evidence: /(ALPACA|CEPS|September 2025|2020|Kooperation)/i,
  },
  {
    id: 'regelleistung-fcr-cooperation',
    url: 'https://www.regelleistung.net/de-de/EU-Kooperationen/FCR-Cooperation',
    what: 'FCR Cooperation — why the German FCR series carries eight other countries and a uniform cross-border price',
    authority: 'the four German TSOs',
    expect: [/FCR Cooperation/i, /Artikel 33/i],
    evidence: /(FCR Cooperation|Artikel 33|gemeinsame[nr]? (Ausschreibung|Markt))/i,
  },
];

// The calendar itself. Every entry cites the source id that evidences it and quotes the
// evidence. `status` distinguishes what has happened from what is scheduled — the arc doc
// treats the Baltic platform accessions as future events to be modelled, and they are not.
const EVENTS = [
  // ── Germany ───────────────────────────────────────────────────────────────
  { market: 'DE', date: '2006-12-01', products: ['mFRR'], kind: 'auction_design', status: 'past', source: 'regelleistung-historie', description: 'Joint TSO procurement of mFRR begins, working-daily, 4h products', in_data: false },
  { market: 'DE', date: '2007-12-01', products: ['FCR', 'aFRR'], kind: 'auction_design', status: 'past', source: 'regelleistung-historie', description: 'Joint TSO procurement of FCR and aFRR begins, monthly auctions', in_data: false },
  { market: 'DE', date: '2011-06-27', products: ['FCR', 'aFRR'], kind: 'auction_design', status: 'past', source: 'regelleistung-historie', description: 'Weekly auctions in two products, HT and NT', in_data: false },
  { market: 'DE', date: '2014-01-01', products: ['FCR'], kind: 'technology_entry', status: 'past', source: 'regelleistung-historie', description: 'Prequalification of storage-limited units opens; first grid-scale battery in FCR. Year only — the source gives no day.', date_precision: 'year', in_data: false },
  { market: 'DE', date: '2018-07-12', products: ['aFRR', 'mFRR'], kind: 'auction_design', status: 'past', source: 'regelleistung-historie', description: 'Calendar-daily auctions with 4h products introduced. This is where the public data begins.', in_data: true, severity: 'series_start' },
  { market: 'DE', date: '2019-07-01', products: ['FCR'], kind: 'auction_design', status: 'past', source: 'regelleistung-historie', description: 'FCR moves to a working-daily D-2 auction with a 1-day product. FCR data begins here. Cross-control-area collateralisation introduced for aFRR/mFRR the same day.', in_data: true, severity: 'series_start' },
  { market: 'DE', date: '2020-07-01', products: ['FCR'], kind: 'product_length', status: 'past', source: 'regelleistung-historie', description: 'FCR moves to calendar-daily auctions with 4h products. Published price stays EUR/MW per product period, so the unnormalised series steps down ~6x with no price change.', in_data: true, severity: 'unit_affecting' },
  { market: 'DE', date: '2020-11-03', products: ['aFRR', 'mFRR'], kind: 'market_split', status: 'past', source: 'regelleistung-historie', description: 'Regelarbeitsmarkt (RAM) introduced: capacity (RLM) and energy (RAM) procured separately for the first time. The capacity series changes meaning here and the standalone energy series begins.', in_data: true, severity: 'high' },
  { market: 'DE', date: '2021-12-07', products: ['aFRR', 'mFRR'], kind: 'unit_relabel', status: 'past', source: 'measured-from-data', description: 'Published capacity price unit changes from EUR/MW per 4h product to (EUR/MW)/h, for both aFRR and mFRR on the same day. Derived from the committed data: the last delivery day published as EUR/MW is 2021-12-06 and the first as (EUR/MW)/h is 2021-12-07 (extra.publishedUnit per row). Values step ~4x with no market event — a relabel, not a repricing. FCR never changed unit.', date_precision: 'day', in_data: true, severity: 'unit_affecting' },
  { market: 'DE', date: '2022-06-22', products: ['aFRR'], kind: 'platform_accession', status: 'past', source: 'regelleistung-historie', description: 'PICASSO accession. Energy product shortens to 15 minutes and energy settles at the pan-EU marginal price. The single largest structural break in the German aFRR series.', in_data: true, severity: 'high', cross_ref: 'entsoe-picasso' },
  { market: 'DE', date: '2022-10-05', products: ['mFRR'], kind: 'platform_accession', status: 'past', source: 'regelleistung-historie', description: 'MARI accession — cross-border exchange of mFRR energy begins.', in_data: true, severity: 'high', cross_ref: 'entsoe-mari' },
  { market: 'DE', date: '2025-09-01', products: ['aFRR'], kind: 'market_coupling', status: 'past', source: 'regelleistung-alpaca', description: 'ČEPS joins ALPACA, the aFRR CAPACITY cooperation (built on the 2020 Austria-Germany cooperation). Czech control-block rows appear in the German capacity export from here, so an area-unfiltered series stops being German. Month precision — the source says "since September 2025".', date_precision: 'month', in_data: true, severity: 'area_affecting' },

  // ── Austria / Czechia (PICASSO earlier joiners, and the DE capacity cooperation) ──
  { market: 'AT', date: '2022-06-22', products: ['aFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-picasso', description: 'PICASSO accession, jointly with Germany — the first exchange of aFRR via PICASSO', in_data: true, severity: 'high' },
  { market: 'AT', date: '2023-06-27', products: ['mFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-mari', description: 'APG accedes to MARI', in_data: false, severity: 'high' },
  { market: 'CZ', date: '2022-10-05', products: ['mFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-mari', description: 'ČEPS accedes to MARI, jointly with the four German TSOs', in_data: false, severity: 'high' },

  // ── Baltics — the correction that matters for the whole arc ────────────────
  { market: 'BALTIC', date: '2024-10-10', products: ['mFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-mari', description: 'Elering, AST and Litgrid connect to MARI. ALREADY HAPPENED — the arc doc treats Baltic MARI accession as a future break to be modelled.', in_data: 'partially — inside the window of the reserve-price history 36.C restored', severity: 'high' },
  { market: 'LT', date: '2025-03-05', products: ['aFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-picasso', description: 'Litgrid accedes to PICASSO. ALREADY HAPPENED.', in_data: 'partially', severity: 'high' },
  { market: 'EE', date: '2025-04-11', products: ['aFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-picasso', description: 'Elering accedes to PICASSO. ALREADY HAPPENED.', in_data: 'partially', severity: 'high' },
  { market: 'LV', date: '2025-04-11', products: ['aFRR'], kind: 'platform_accession', status: 'past', source: 'entsoe-picasso', description: 'AST (Augstsprieguma tīkls, Latvia) accedes to PICASSO. ALREADY HAPPENED. Note: a summariser rendered this line as "Austria (AST)"; Austria acceded 2022-06-22. The raw evidence line reads "AST accession to PICASSO".', in_data: 'partially', severity: 'high' },

  // ── Great Britain ─────────────────────────────────────────────────────────
  { market: 'GB', date: '2020-10-01', products: ['DC-low', 'DC-high'], kind: 'market_creation', status: 'past', source: 'measured-from-data', description: 'Dynamic Containment launches. First delivery window in the bid-level Masterdata file is 2020-10-01T22:00Z. Pay-as-bid.', in_data: true, severity: 'series_start' },
  { market: 'GB', date: '2021-09-16', products: ['DC-low', 'DC-high'], kind: 'auction_design', status: 'past', source: 'measured-from-data', description: 'Publication switches from bid-level to a per-EFA-block clearing price, and the price basis with it (pay-as-bid → clearing). Measured: the bid-level file ends 2021-09-15, the summary begins 2021-09-16.', in_data: true, severity: 'unit_affecting' },
  { market: 'GB', date: '2023-11-02', products: ['DC-low', 'DC-high', 'DM-low', 'DM-high', 'DR-low', 'DR-high'], kind: 'platform_migration', status: 'past', source: 'measured-from-data', description: 'Response services move to the Enduring Auction Capability platform, co-optimised with reserve. Measured: DC/DM/DR summary ends 2023-11-02, EAC FY2023 begins 2023-11-02.', in_data: true, severity: 'high' },

  // ── Australia ─────────────────────────────────────────────────────────────
  { market: 'AU', date: '2021-10-01', products: ['spot'], kind: 'settlement_resolution', status: 'past', source: 'measured-from-data', description: '30-minute → 5-minute settlement. Mechanically raises measured intraday spread; not a market event. Measured from the step between consecutive stamps in the AEMO files.', in_data: true, severity: 'unit_affecting' },

  // ── Sweden ────────────────────────────────────────────────────────────────
  { market: 'SE', date: '2021-01-01', products: ['FCR-N', 'FCR-D-up', 'FCR-D-down'], kind: 'data_start', status: 'past', source: 'measured-from-data', description: 'First month for which Mimer serves non-zero prices. Earlier dates return HTTP 200 with all-zero rows. Not a market event — a coverage boundary, recorded so it is never read as a price collapse.', in_data: true, severity: 'series_start' },
];

async function fetchSource(s) {
  const started = new Date().toISOString();
  let status = null, bytes = 0, sha = null, lines = [], error = null;
  try {
    const r = await fetch(s.url, { redirect: 'follow' });
    status = r.status;
    const html = await r.text();
    bytes = html.length;
    sha = crypto.createHash('sha256').update(html).digest('hex');
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#228;/g, 'ä').replace(/&#252;/g, 'ü').replace(/&#246;/g, 'ö');
    const all = text.split('\n').map((x) => x.trim()).filter(Boolean);
    lines = [...new Set(all.filter((x) => x.length < 400 && s.evidence.test(x)))];
    const unmet = s.expect.filter((re) => !re.test(text)).map(String);
    return {
      id: s.id, url: s.url, what: s.what, authority: s.authority,
      verified_at: started, http_status: status, bytes, sha256: sha,
      evidence_lines_seen: lines.length,
      evidence_lines: lines.slice(0, 80),
      expectations_total: s.expect.length,
      expectations_unmet: unmet,
      // "blind" is its own failure state: fetched fine, evidenced nothing. 36.D's tripwire
      // defect was exactly this, reported as success and left armed for weeks.
      verdict: status !== 200 ? 'FAILED_HTTP' : lines.length === 0 ? 'BLIND' : unmet.length ? 'EXPECTATIONS_UNMET' : 'OK',
    };
  } catch (e) {
    error = e.message;
    return { id: s.id, url: s.url, verified_at: started, http_status: status, error, verdict: 'FAILED_FETCH', evidence_lines_seen: 0, evidence_lines: [] };
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const sources = [];
  for (const s of SOURCES) {
    const r = await fetchSource(s);
    sources.push(r);
    console.log(`${r.verdict.padEnd(20)} ${r.id.padEnd(32)} ${r.http_status ?? '-'} ${String(r.bytes ?? 0).padStart(7)}B  ${r.evidence_lines_seen} evidence lines`);
    if (r.expectations_unmet?.length) for (const u of r.expectations_unmet) console.log(`    UNMET: ${u}`);
  }

  const bad = sources.filter((s) => s.verdict !== 'OK');
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));

  // Every event must cite a source that verified, or the literal 'measured-from-data'.
  const orphans = EVENTS.filter((e) => e.source !== 'measured-from-data' && byId[e.source]?.verdict !== 'OK');

  const out = {
    dataset: 'structural-break-calendar',
    retrieved_at: new Date().toISOString(),
    purpose: 'Segment price series before fitting any decay parameter. A half-life fitted across a rule change is a measurement of the rule change.',
    disciplines: {
      'rule#3 / A5': 'every date from a TSO, ENTSO-E or ACER page; raw HTML parsed here, not a summariser\'s reading of it',
      'C7': 'every URL fetched at pin time; verified_at, HTTP status, byte count, sha256 and matched evidence lines recorded per source; a source that evidences nothing is BLIND and fails',
      'rule#2': 'dates that could be derived are derived — source "measured-from-data" means the date came from the committed data, not from a page',
    },
    severity_legend: {
      high: 'a genuine market-mechanism change; decay must be fitted separately either side',
      unit_affecting: 'published units or price basis change with no market change; normalise before comparing',
      area_affecting: 'the set of areas inside the published series changes; filter by area',
      series_start: 'coverage boundary, not a market event',
    },
    sources,
    source_verdicts: Object.fromEntries(sources.map((s) => [s.id, s.verdict])),
    events: EVENTS.map((e) => ({
      ...e,
      source_verdict: e.source === 'measured-from-data' ? 'measured-from-data' : byId[e.source]?.verdict ?? 'MISSING_SOURCE',
      source_url: e.source === 'measured-from-data' ? null : byId[e.source]?.url ?? null,
    })),
    n_events: EVENTS.length,
    orphan_events: orphans.map((e) => `${e.market} ${e.date} → ${e.source}`),
  };

  await fs.writeFile(path.join(OUT, 'structural-breaks.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\n${EVENTS.length} events · ${sources.length} sources · ${bad.length} source problems · ${orphans.length} orphan events`);
  if (bad.length || orphans.length) {
    console.error('CALENDAR NOT CLEAN — a pinned source that does not evidence its claim is the 36.D tripwire defect.');
    process.exitCode = 1;
  }
}

await main();
