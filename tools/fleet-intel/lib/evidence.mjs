// Per-project evidence engine.
//
// Source set follows the Pause-A viability table, not hope
// (docs/investigations/2026-07-31-phase-37-a-pause-a.md §4). Sources proven blocked
// (AST — Cloudflare bot-management, 403 to polite AND browser UA) are NOT probed and
// are declared as excluded-with-reason, so the coverage report cannot read as
// "no evidence found" when the truth is "never asked".
//
// B8 countermeasure: every probe records `reachable` SEPARATELY from `found`.
// A source that starts 403-ing produces reachable:false, which is loudly different
// from a genuine zero — the silent-failure path this design exists to close.

import { bareName, isLegalEntity } from './normalise.mjs';
import { lookupLV, citationFor } from './lv-register.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Declared source registry. `status` is the Pause-A verdict; the engine only probes
 * sources marked 'implemented'. Everything else is reported explicitly.
 */
export const SOURCE_REGISTRY = Object.freeze([
  { key: 'esinvesticijos', country: ['LT'], source_type: 'registry', status: 'implemented',
    note: 'EU-beneficiary register; server-rendered result count via ?query=' },
  { key: 'lv_ur_opendata', country: ['LV'], source_type: 'registry', status: 'implemented',
    note: 'Latvian Uzņēmumu reģistrs BULK OPEN DATA (data.gov.lv, CC0, daily) — register.csv 486,509 entities + register_name_history.csv 93,696 former names. Replaces the Lursoft scrape. B11 controls pass: Latvenergo/Sadales tikls/Augstsprieguma tikls all resolve active with real registration dates; nonsense terms do not resolve' },
  { key: 'lursoft', country: ['LV'], source_type: 'registry', status: 'excluded',
    note: 'CORRECTION to the Pause-A table: company.lursoft.lv/en/search?q= is NOT a query endpoint — it returns a byte-similar ~107 kB landing page for every term and never echoes the query. Control case: "Latvenergo", which certainly exists in the LV register, returns the same page as a nonsense term. The first run\'s 0/36 was a measurement artifact, not evidence about those companies. LV registry lookup needs the real endpoint (or data.gov.lv open data) — a build spike, not a probe' },
  { key: 'developer_site', country: ['LT', 'LV', 'EE'], source_type: 'developer_site', status: 'implemented',
    note: 'org homepage reachability + project-page signal' },
  { key: 'ariregister_opendata', country: ['EE'], source_type: 'registry', status: 'deferred',
    note: 'EE bulk open data is the right route but needs a download+index step — deferred to the build spike, NOT probed' },
  { key: 'sprk', country: ['LV'], source_type: 'regulator', status: 'deferred',
    note: 'decisions index served (200) but per-project extraction needs a path spike' },
  { key: 'bis', country: ['LV'], source_type: 'permit', status: 'deferred',
    note: 'BIS serves data — 33.A.2.b was a resolver gap not a data gap — extractor worth building in 37.B' },
  { key: 'registrucentras', country: ['LT'], source_type: 'registry', status: 'deferred',
    note: 'JAR search page served; extraction needs a path spike' },
  { key: 'ast', country: ['LV'], source_type: 'tso', status: 'excluded',
    note: 'Cloudflare bot-management + CAPTCHA; 403 to polite AND browser UA. Not probed, not evaded. Route: direct AST relationship' },
  { key: 'apva', country: ['LT'], source_type: 'registry', status: 'excluded',
    note: 'zero discriminating power across a balanced Gavo/Negavo sample; schemes published are household-scale' },
]);

export const IMPLEMENTED_SOURCES = SOURCE_REGISTRY.filter((s) => s.status === 'implemented').map((s) => s.key);

async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * LT: does the entity appear in the national EU-investment beneficiary register?
 * Only the COUNT is server-rendered, which is exactly the boolean signal needed.
 */
export async function probeEsinvesticijos(row) {
  const q = bareName(row.spv);
  if (!q) return { source_key: 'esinvesticijos', reachable: false, found: false, reason: 'no SPV to query' };
  const url = `https://esinvesticijos.lt/projektu-sritis/projektu-sarasas?query=${encodeURIComponent(q)}`;
  const res = await fetchText(url);
  const m = res.body.match(/Rezultatai:\s*(\d+)/);
  const reachable = res.ok && m !== null; // the marker proves we got the real page, not a shell
  const count = m ? parseInt(m[1], 10) : null;
  return {
    source_key: 'esinvesticijos',
    source_type: 'registry',
    reachable,
    found: reachable && count > 0,
    ...(reachable ? { hits: count } : { reason: `http ${res.status}${res.error ? ' ' + res.error : ''}` }),
    ...(reachable && count > 0 ? { url, what_it_confirms: `entity name appears ${count}× in the LT EU-beneficiary register` } : {}),
  };
}

/**
 * LV company register — NOT PROBED. Retained as a documented dead end.
 *
 * The URL that looked like a search endpoint at Pause A returns the same landing
 * page for every query and never echoes the term. A probe against it can only ever
 * produce zeros, and zeros from a broken endpoint are worse than no data: they read
 * as "these companies are not in the register" in a coverage report.
 *
 * A source is only worth probing if a KNOWN-GOOD control returns something
 * different from a nonsense term. Lursoft fails that test today.
 */
export async function probeLursoft() {
  return {
    source_key: 'lursoft',
    reachable: null,
    found: false,
    reason: 'endpoint is not a query interface (control case returns an identical page) — excluded pending a real endpoint or data.gov.lv open data',
  };
}

/**
 * LV: resolve the SPV against the Uzņēmumu reģistrs bulk index.
 * Requires a prebuilt index (see lv-register.buildIndex) passed through ctx —
 * the 122 MB register is parsed once per run, not once per row.
 */
export function probeLvRegister(row, ctx) {
  if (!ctx || !ctx.lvIndex) {
    return { source_key: 'lv_ur_opendata', reachable: false, found: false, reason: 'register index not loaded — run the download step first' };
  }
  if (!isLegalEntity(row.spv)) {
    return { source_key: 'lv_ur_opendata', reachable: null, found: false, reason: 'SPV is a project descriptor, not a legal entity — registry lookup not applicable' };
  }
  const res = lookupLV(ctx.lvIndex, row.spv);
  if (!res.found) {
    return { source_key: 'lv_ur_opendata', source_type: 'registry', reachable: true, found: false, reason: 'no entity of that name in the register' };
  }
  const cit = citationFor(res);
  return {
    source_key: 'lv_ur_opendata',
    source_type: 'registry',
    reachable: true,
    found: true,
    url: cit.url,
    what_it_confirms: cit.what_it_confirms,
    locator: res.regcode,
    entity_status: res.status,
    matched_via: res.matched_via,
    confidence: 'normal',
  };
}

/** Developer-site signal for the parent org. */
const DEV_SITES = Object.freeze({
  'enery': 'https://www.enery.energy/',
  'enery development gmbh': 'https://www.enery.energy/',
  'ib vogt gmbh': 'https://ibvogt.com/',
  'ib vogt': 'https://ibvogt.com/',
  'european energy': 'https://europeanenergy.com/',
  'european energy latvia aps': 'https://europeanenergy.com/',
  'evecon': 'https://evecon.ee/',
  'evecon alaküla oü': 'https://evecon.ee/',
  'green genius': 'https://greengenius.com/',
  'uab "green genius"': 'https://greengenius.com/',
});

export async function probeDeveloperSite(row) {
  const key = String(row.org || '').toLowerCase().trim();
  const url = DEV_SITES[key];
  if (!url) return { source_key: 'developer_site', reachable: null, found: false, reason: 'no known site for this org' };
  const res = await fetchText(url);
  const reachable = res.ok;
  // a site that merely loads confirms the DEVELOPER exists, not the project.
  // That is a weak signal and is labelled as such — it must not masquerade as
  // project confirmation.
  return {
    source_key: 'developer_site',
    source_type: 'developer_site',
    reachable,
    found: false,
    ...(reachable
      ? { url, what_it_confirms: 'developer organisation has a live public presence — does NOT confirm this project', confidence: 'weak' }
      : { reason: `http ${res.status}` }),
  };
}

/**
 * Run the implemented probes for one row. Returns the dossier's evidence array plus
 * a per-source reachability record (kept even when nothing was found — B8).
 */
export async function gatherEvidence(row, { politeDelayMs = 1100, ctx = null } = {}) {
  const attempts = [];

  // local, offline lookups first — no network, no pacing needed
  if (row.country === 'LV') attempts.push(probeLvRegister(row, ctx));

  // network probes, politely paced
  const netProbes = [];
  if (row.country === 'LT') netProbes.push(probeEsinvesticijos);
  netProbes.push(probeDeveloperSite);
  for (const p of netProbes) {
    attempts.push(await p(row));
    await sleep(politeDelayMs);
  }

  // Only attempts that FOUND something AND carry a resolvable URL become evidence.
  const evidence = attempts
    .filter((a) => a.found && typeof a.url === 'string' && /^https?:\/\//.test(a.url))
    .map((a) => ({
      source_type: a.source_type,
      source_key: a.source_key,
      url: a.url,
      what_it_confirms: a.what_it_confirms,
      confidence: a.confidence || 'normal',
      fetched: new Date().toISOString(),
    }));

  return { evidence, attempts };
}
