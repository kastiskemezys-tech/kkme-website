/**
 * Phase 44 §2 — the source contract.
 *
 * Every data path we own has failed at least once, and every time the failure
 * was invisible for days: BTD's cert chain (12 days), the S1 branch timeout
 * (9 ticks, a week), NordPool serving HTML where JSON was expected, the LV
 * register writing `closed` as a single space, cp1257 mojibake reaching the
 * intel feed, a manifest refresh destroying 131,472 rows with every checksum
 * passing. That is not bad luck. It is that ingestion has no contract: a
 * fetcher asks for bytes, gets bytes, and whatever those bytes are becomes the
 * truth.
 *
 * A contract states, per source, what a GOOD response looks like — shape,
 * volume envelope, freshness, encoding, content-type — so that "the source
 * changed" and "the source is fine" stop being the same observation.
 *
 * Two design rules, both bought:
 *
 *  1. **The envelope is checked before the content.** The NordPool and S3
 *     failures were both "HTML arrived where JSON was expected", and in both
 *     cases the parser's error was about the CONTENT ("JSON parse failed",
 *     "price not found") when the diagnosis was in the ENVELOPE. Status,
 *     content-type, byte length and first bytes are read first, always.
 *
 *  2. **A volume envelope, not a non-empty check.** `rows.length > 0` passes on
 *     the run that returns 3 rows where 400 were expected. Every failure above
 *     that was a truncation rather than an outage produced a non-empty result.
 */

/**
 * @typedef {object} SourceContract
 * @property {string} id
 * @property {string} host
 * @property {string} transport            'json' | 'xml' | 'csv' | 'html'
 * @property {string} cadence              human-readable publication cadence
 * @property {number} freshness_hours      derived from the SOURCE's cadence, not a global constant
 * @property {[number, number]} volume     [min, max] rows/points for one period — outside is an anomaly, not a result
 * @property {string[]} required           fields that must be present and non-null
 * @property {string} [charset]            declared charset; mismatch is a finding, not a shrug
 * @property {string} units
 * @property {string} timezone
 * @property {string} notes
 */

/** @type {Record<string, SourceContract>} */
export const CONTRACTS = {
  'energy-charts:price:LT': {
    id: 'energy-charts:price:LT',
    host: 'api.energy-charts.info',
    transport: 'json',
    cadence: 'day-ahead, published ~12:45 CET for the following market day',
    freshness_hours: 26,
    // 96 quarter-hours since the 2025-10-01 MTU change; 24 on the historical
    // hourly era. A day is never 1 point and never 200 — both bounds are real.
    volume: [24, 100],
    required: ['price', 'unix_seconds'],
    units: 'EUR/MWh',
    timezone: 'UTC (the request is bounded T00:00Z..T23:59Z)',
    notes: 'Returned HTTP 503 with an HTML body on 2026-08-03T16:36Z, which is why the '
         + 'capture path now has an ENTSO-E fallback. The 503 body is HTML, so a JSON parser '
         + 'reports a parse error and hides a plain availability failure.',
  },

  'entsoe:A44:LT': {
    id: 'entsoe:A44:LT',
    host: 'web-api.tp.entsoe.eu',
    transport: 'xml',
    cadence: 'day-ahead auction, ~12:45 CET',
    freshness_hours: 26,
    // A UTC-bounded request returns whole CET/CEST market days, so TWO periods,
    // and a DST day is 92 or 100 points rather than 96. Measured, not assumed:
    // 190 (normal, with A03 gaps), 184 (autumn), 188 (spring), 192 (clean pair).
    volume: [24, 200],
    required: ['Period', 'resolution', 'price.amount'],
    units: 'EUR/MWh',
    timezone: 'CET/CEST market days; periods carry their own timeInterval',
    notes: 'curveType A03 omits positions whose price repeats — a consumer must forward-fill. '
         + 'Resolution comes from <resolution>, NEVER from the array length: 100 points at PT15M '
         + 'and 24 at PT60M both exist, so length-based inference is wrong in both directions.',
  },

  'arcgis:litgrid:capacity': {
    id: 'arcgis:litgrid:capacity',
    host: 'services-eu1.arcgis.com',
    transport: 'json',
    cadence: 'Litgrid publishes daily',
    freshness_hours: 24,
    volume: [1, 50],
    required: ['features'],
    units: 'MW',
    timezone: 'n/a — a stock figure, not a time series',
    notes: 'The Kaupikliai row must be PRESENT, not merely a non-empty feature list: the row '
         + 'disappearing and the service returning an empty result are different failures and '
         + 'the old code could not tell them apart.',
  },

  'tradingeconomics:lithium': {
    id: 'tradingeconomics:lithium',
    host: 'tradingeconomics.com',
    transport: 'html',
    cadence: 'daily',
    freshness_hours: 36,
    volume: [1, 1],
    required: ['lithium_price'],
    charset: 'utf-8',
    units: 'CNY/T or USD/t, converted at the ECB rate',
    timezone: 'n/a',
    notes: 'A scrape, so schema drift is silent by construction. Observed failing live at '
         + '2026-08-03T16:00:28Z with an AbortError at the 20s timeout.',
  },

  'elering:nps:price': {
    id: 'elering:nps:price',
    host: 'dashboard.elering.ee',
    transport: 'json',
    cadence: 'day-ahead',
    freshness_hours: 26,
    volume: [24, 100],
    required: ['success', 'data'],
    units: 'EUR/MWh',
    timezone: 'request-bounded UTC',
    notes: 'Not currently ingested. Used in Phase 39.2 as the INDEPENDENT control that '
         + 'validated the A44 reconstruction 96/96 (playbook B11 — a probe with no '
         + 'independent control measures the probe). Worth promoting to a real source.',
  },
};

/**
 * Envelope check — status, content-type, length, first bytes.
 *
 * Runs BEFORE any parse. The whole point is that "HTML arrived where JSON was
 * expected" should read as exactly that, and not as a JSON syntax error 40
 * lines later with the evidence already discarded.
 *
 * @returns {{ok: boolean, diagnosis: string|null, envelope: object}}
 */
export function checkEnvelope(contract, { status, contentType, body }) {
  const ctype = (contentType || 'none').split(';')[0].trim().toLowerCase();
  const envelope = { status, ctype, bytes: body?.length ?? 0, head: (body ?? '').slice(0, 200) };

  const expected = {
    json: ['application/json', 'text/json'],
    xml: ['application/xml', 'text/xml'],
    csv: ['text/csv', 'application/csv', 'text/plain'],
    html: ['text/html'],
  }[contract.transport] ?? [];

  if (status == null || status < 200 || status >= 300) {
    return { ok: false, diagnosis: `HTTP ${status} from ${contract.host}`, envelope };
  }
  if (!envelope.bytes) {
    return { ok: false, diagnosis: `empty body from ${contract.host} on HTTP ${status}`, envelope };
  }
  // The specific trap: an HTML error page served under a 200, or under a
  // content-type nobody looked at. Both NordPool and energy-charts did this.
  const looksHtml = /^\s*(<!doctype html|<html)/i.test(envelope.head);
  if (contract.transport !== 'html' && looksHtml) {
    return {
      ok: false,
      diagnosis: `HTML body where ${contract.transport.toUpperCase()} was expected (content-type ${ctype})`,
      envelope,
    };
  }
  if (expected.length && !expected.includes(ctype) && ctype !== 'none') {
    return { ok: false, diagnosis: `content-type ${ctype}, expected one of ${expected.join('/')}`, envelope };
  }
  return { ok: true, diagnosis: null, envelope };
}

/**
 * Volume envelope — the check that `length > 0` is not.
 *
 * A truncation is the failure mode that produces a plausible non-empty result,
 * and it is the one that has actually happened here: a windowed refresh that
 * returned 3 rows where 400 were expected would pass every non-empty check ever
 * written.
 */
export function checkVolume(contract, count) {
  const [lo, hi] = contract.volume;
  if (count < lo) {
    return { ok: false, diagnosis: `${count} rows, below the ${lo} floor for ${contract.id} — this is a truncation, not a result` };
  }
  if (count > hi) {
    return { ok: false, diagnosis: `${count} rows, above the ${hi} ceiling for ${contract.id} — the window or the shape changed` };
  }
  return { ok: true, diagnosis: null };
}

/** Required fields present and non-null. */
export function checkShape(contract, obj) {
  const missing = contract.required.filter((f) => obj == null || obj[f] == null);
  return missing.length
    ? { ok: false, diagnosis: `missing required field(s): ${missing.join(', ')}` }
    : { ok: true, diagnosis: null };
}

/**
 * Mojibake detection — the cp1257 precedent.
 *
 * Lithuanian and Latvian text arriving as cp1257 bytes decoded as UTF-8 (or the
 * reverse) produces a specific and recognisable signature. It reached the intel
 * feed once. This does not attempt transcoding — it REFUSES, because a guessed
 * re-decode of a name is how a wrong name gets published under discipline
 * rule #3.
 */
export function checkEncoding(text) {
  if (!text) return { ok: true, diagnosis: null };
  // U+FFFD is a decoder that already gave up. The `Ä…`/`Å¾` family is UTF-8
  // bytes decoded as latin-1/cp1257. Both are evidence, not a judgement call.
  const replacement = (text.match(/�/g) || []).length;
  const doubleEncoded = (text.match(/[ÄÅÃ][-¿]/g) || []).length;
  if (replacement > 0) return { ok: false, diagnosis: `${replacement} U+FFFD replacement char(s) — the decoder already failed` };
  if (doubleEncoded > 2) return { ok: false, diagnosis: `${doubleEncoded} double-encoding signature(s) — UTF-8 bytes decoded as a single-byte charset` };
  return { ok: true, diagnosis: null };
}

/**
 * The whole contract, in one call.
 *
 * Returns a QUARANTINE verdict rather than throwing, so the caller decides
 * admission. Partial admission is the thing this exists to prevent: a payload
 * either satisfies its contract or it is quarantined WITH the diagnosis. There
 * is no middle state in which some rows are trusted.
 */
export function admit(contractId, { status, contentType, body, count, parsed }) {
  const contract = CONTRACTS[contractId];
  if (!contract) {
    // An unknown source is not a passing source. Refusing to report a pass from
    // a check that did not execute is the same discipline the NDA gate uses.
    return { admitted: false, contract: null, checks: [], diagnosis: `no contract declared for '${contractId}' — refusing to admit unchecked data` };
  }
  const checks = [];
  const env = checkEnvelope(contract, { status, contentType, body });
  checks.push({ name: 'envelope', ...env });
  if (env.ok) {
    if (count != null) checks.push({ name: 'volume', ...checkVolume(contract, count) });
    if (parsed != null) checks.push({ name: 'shape', ...checkShape(contract, parsed) });
    if (contract.transport === 'html' || contract.transport === 'csv') {
      checks.push({ name: 'encoding', ...checkEncoding(body) });
    }
  }
  const failed = checks.filter((c) => !c.ok);
  return {
    admitted: failed.length === 0,
    contract,
    checks,
    envelope: env.envelope,
    diagnosis: failed.length
      ? `${contract.id} QUARANTINED — ${failed.map((f) => `${f.name}: ${f.diagnosis}`).join(' · ')}`
      : null,
  };
}

export const CONTRACT_COUNT = Object.keys(CONTRACTS).length;
