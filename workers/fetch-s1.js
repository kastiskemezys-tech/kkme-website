/**
 * KKME — Signal Worker
 * Cron: every 4h (S1-S9 + Euribor) + daily 09:30 (S2 extra) + daily 08:00 (digest)
 * All data fetching runs on Cloudflare Workers cron — no local machine dependency.
 *
 * Endpoints:
 *   GET /               → fresh S1 fetch + KV write (manual trigger)
 *   GET /read           → cached S1 KV value (fetched by S1Card)
 *   GET /s2             → S2 KV (defaults if empty)
 *   POST /s2/update     → write S2 payload to KV (external push, validated)
 *   GET /s3             → cached S3 KV value; computes fresh if empty
 *   GET /s4             → cached S4 KV value; computes fresh if empty
 *   POST /curate        → store CurationEntry in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → Anthropic haiku digest; cached 1h
 *   GET /health         → structured health of all signals
 *   POST /heartbeat     → record heartbeat ping (legacy, kept for compat)
 *
 * Secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET
 *          TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
 * KV binding: KKME_SIGNALS
 */

import { DEFAULTS, STALE_THRESHOLDS_HOURS } from './lib/defaults.js';
import { kvWrite, checkBounds, checkRequired } from './lib/kv.js';
import { notifyTelegram, alertTransition, redactForAlert } from './lib/notify.js';
import { computeEUATrend } from './lib/eua_trend.js';
import * as CALC from './lib/calculator.js';
// Phase 39 — debt sized from cash flows. The solver and its sourced parameter
// register live in lib/ so the worker and the consultancy harness drive exactly
// one implementation (rule #4).
import { sizeDebt, assertDebtInvariants } from './lib/debtSizing.js';
import {
  baseCase as debtBaseCase, provenanceNote as debtProvenanceNote,
  DSCR_SENSITIVITY_LADDER, DEBT_COVENANT_DSCR,
} from './lib/debtParams.js';
import {
  addressableDemandMw,
  absorptionMw,
  productDemandMap,
  litgridLtSupplyMw,
  VERSION as DEMAND_FORECAST_VERSION,
} from './lib/demand-forecast.js';
import {
  WATCH_TARGETS, fingerprintPage, diffPages, buildAlert, fingerprintKey, isDue,
} from './lib/publication-watcher.js';
import {
  FLEET_CORS, FLEET_NO_STORE, FLEET_TOKEN_TTL_MS, FLEET_COPY,
  signFleetToken, verifyFleetToken, fleetBearerToken, buildCrmView,
} from './lib/fleetCrm.js';

const ENTSOE_API    = 'https://web-api.tp.entsoe.eu/api';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const WORKER_URL    = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const LT_BZN  = '10YLT-1001A0008Q';
const SE4_BZN = '10Y1001A1001A47J';
const PL_BZN  = '10YPL-AREA-----S';
const LV_BZN  = '10YLV-1001A00074';
const EE_BZN  = '10Y1001A1001A39I';

const S4_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/8/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1000&where=1%3D1&orderByFields=&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects';
// Layer 3: individual connected installations — queried for Kaupikliai (storage) projects
const S4_LAYER3_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/3/query?f=json&where=Elektrin%C4%97s_tipas%3D%27Kaupikliai%27&outFields=*&returnGeometry=true&outSR=4326';


// Nord Pool DA — LT + SE4 day-ahead prices (latest delivery date)
const NP_DA_URL = 'https://data.nordpoolgroup.com/api/v1/auction/prices/areas';

const KV_CURATION_PREFIX = 'curation:';
const KV_CURATIONS_INDEX  = 'curations:index';
const KV_DIGEST_CACHE     = 'digest:cache';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Update-Secret',
};

/**
 * B-045 — CORS for the routes that read a bearer token from the browser.
 *
 * The shared constant above does not list `Authorization`, so a browser refuses
 * the preflight and the token never leaves the page: the calculator's full tier
 * was unreachable from kkme.eu while every endpoint test passed, because the
 * tests call the worker directly and never perform a preflight (failure-modes
 * B2 — the gate measured a layer no customer uses).
 *
 * Scoped rather than widened, on the 37.C precedent: every other route's CORS
 * behaviour stays byte-identical. `AUTH_PREFLIGHT_PATHS` is asserted in vitest
 * against the set of routes that actually call `bearerToken()`, so adding a
 * bearer-reading route without adding it here fails the suite instead of
 * shipping another silent browser-only defect.
 *
 * Origin stays `*`: unlike the fleet console this is a public product surface
 * that also serves an unauthenticated sample tier, and the token lives in
 * kkme.eu's localStorage, which no other origin can read.
 */
const AUTH_CORS = {
  ...CORS,
  'Access-Control-Allow-Headers': 'Content-Type, X-Update-Secret, Authorization',
};

/** Non-fleet paths whose handler reads an `Authorization: Bearer` token. */
const AUTH_PREFLIGHT_PATHS = new Set(['/calculate']);

/**
 * B-046 — the weekly fleet-lifecycle digest's schedule, declared once.
 *
 * `null` means deliberately NOT armed. Arming means setting this to the cron
 * expression AND adding the same expression to wrangler.toml's [triggers];
 * a test asserts the two agree, so the health surface can never claim a
 * schedule the worker does not actually have, or miss one it does.
 *
 * ARMED in 37.B.1 (2026-08-01), after — and only after — the two preconditions
 * 37.H1 was waiting on were actually met:
 *
 *   1. A real detector run happened. The runner exists, ran against live sources,
 *      and populated `fleet_lifecycle:detectors` with seven stamped records.
 *   2. The digest can tell quiet from dead. It renders a per-detector verdict and
 *      counts how many detectors were CAPABLE of firing, so a week with no working
 *      sensors cannot render as a quiet week.
 *
 * Armed knowingly partially-sighted: 2 of 7 detectors cannot fire today
 * (vert_permit_expired blind, press_negative no-source — both filed as 37.B.3).
 * A heartbeat that says so beats no heartbeat, because an unarmed digest is also
 * how we would fail to notice that the runner never ran again.
 *
 * Three places must agree and all three are asserted by tests: this constant,
 * wrangler.toml's [triggers], and the `scheduled()` branch that actually sends.
 * A cron with no handler would satisfy the old drift test and silently do nothing.
 */
const LIFECYCLE_DIGEST_CRON = '30 7 * * 1';
const LIFECYCLE_DIGEST_PERIOD_H = 168;   // weekly
const LIFECYCLE_DIGEST_GRACE_H = 24;     // one missed day is late; two is overdue

/**
 * 37.B.1 — the digest is an EGRESS PATH. It is the only thing in the fleet stack
 * that pushes fleet content off the platform unprompted (Telegram), so it gets a
 * boundary of its own rather than relying on everything upstream having behaved.
 *
 * Mirrors ALWAYS_PRIVATE_FIELDS in tools/fleet-intel/lib/tiers.mjs. A test asserts
 * the two lists are identical, because a field added there and forgotten here is
 * exactly how a private column ends up in a Telegram message.
 */
const DIGEST_FORBIDDEN_KEYS = ['contact', 'comment', 'apva_flag', 'raw_power_text', 'source_row'];
const DIGEST_EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const DIGEST_PHONE_RE = /(?:\+370|\+371|\+372)\s?\d[\d\s-]{6,}/;

/** Does this transition carry a private field at ANY depth? Field-name check. */
function carriesPrivateField(node) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(carriesPrivateField);
  for (const [k, v] of Object.entries(node)) {
    if (DIGEST_FORBIDDEN_KEYS.includes(k)) return true;
    if (carriesPrivateField(v)) return true;
  }
  return false;
}

/** Contact-shaped CONTENT, regardless of what the field is called. */
function carriesContactShape(text) {
  return DIGEST_EMAIL_RE.test(text) || DIGEST_PHONE_RE.test(text);
}

/**
 * 37.B.1 — the three kinds of zero, COMPUTED (rule #2 in a new place).
 *
 * Four of seven detectors currently cannot act. A digest reading "all quiet" would
 * be honest for three of them and structurally meaningless for the other four, and
 * a week where nothing HAPPENED must not look like a week where nothing COULD.
 *
 * The verdict is derived here from facts the runner measured — was the source
 * reachable, can that source produce this signal at all, does the diff have a
 * baseline, how many rows were eligible — and never from a label the runner wrote.
 * A posted string saying "checked" would be exactly the pre-written prose rule #2
 * exists to forbid: true when written, silently false later.
 *
 * Staleness wins over everything, because a stale record's other fields describe a
 * run that may be weeks old.
 */
function classifyDetector(d) {
  const ageH = d && d.last_run_at ? (Date.now() - new Date(d.last_run_at).getTime()) / 3600000 : null;
  if (d && d.max_age_hours && ageH !== null && ageH > d.max_age_hours) {
    return { verdict: 'stale', capable: false, note: `last run ${ageH.toFixed(0)}h ago, past its ${d.max_age_hours}h ceiling` };
  }
  if (d && d.source_usable === false) {
    return { verdict: 'no-source', capable: false, note: 'no source can produce this signal today' };
  }
  if (d && d.baseline_present === false) {
    return { verdict: 'no-baseline', capable: false, note: 'nothing to diff against yet' };
  }
  if (!d || d.last_run_at === null || d.last_run_at === undefined) {
    return { verdict: 'never-run', capable: false, note: 'has never completed a run' };
  }
  if (d.rows_eligible === 0) {
    return { verdict: 'blind', capable: false, note: `0 ${d.population_unit || 'rows'} eligible — its zero is about the population, not the world` };
  }
  if (d.status && d.status !== 'healthy') {
    return { verdict: 'unhealthy', capable: false, note: (d.reasons || []).join('; ') || 'liveness invariant breached' };
  }
  // The unit is a measured property of what this detector counts, not a label: the
  // register sweep evaluates name keys, the fleet detectors evaluate rows. Rendering
  // both as "rows" would make "412609 rows eligible" read as 412,609 projects checked.
  return { verdict: 'checked', capable: true, note: `${d.rows_eligible ?? '?'} ${d.population_unit || 'rows'} eligible` };
}

/**
 * Render the weekly digest. ONE renderer, called by both the manual route and the
 * cron (rule #4).
 *
 * The reason this is a function rather than two copies: the digest is the egress
 * path, and its leak guards live here. A cron branch that rebuilt the message
 * inline would be a second writer of the thing that leaves the platform, free to
 * drift away from the guarded version — B-048's "two writers, one guard" shape,
 * pointed at Telegram instead of at a manifest.
 *
 * Returns `{blocked}` rather than throwing: a refusal is a result the caller must
 * report, and a cron that swallowed it would go quiet in exactly the way this
 * whole surface exists to prevent.
 */
async function buildLifecycleDigest(env, { since = null } = {}) {
  let transitions = [];
  try { transitions = JSON.parse((await env.KKME_SIGNALS.get('fleet_lifecycle:transitions')) || '[]'); } catch { transitions = []; }
  let detectors = {};
  try { detectors = (JSON.parse((await env.KKME_SIGNALS.get('fleet_lifecycle:detectors')) || '{}')).detectors || {}; } catch { detectors = {}; }

  // Only transitions since the last digest go in the body; the log is append-only.
  const sinceIso = since || (await env.KKME_SIGNALS.get('fleet_lifecycle:last_digest_at').catch(() => null));
  const inWindow = sinceIso ? transitions.filter(t => t && t.at && t.at > sinceIso) : transitions;

  // EGRESS BOUNDARY. A transition carrying a private field never reaches the
  // rendered message — it is withheld and COUNTED, so a suppressed row is visible
  // as a suppression rather than as an absence. The runner already refuses to post
  // private-tier proposals; this is the second wall, sited where content leaves.
  const withheld = inWindow.filter(carriesPrivateField);
  const recent = inWindow.filter(t => !carriesPrivateField(t));

  const count = (type) => recent.filter(t => t && t.type === type).length;
  const unhealthy = Object.entries(detectors).filter(([, d]) => (d.status ?? 'never_run') !== 'healthy');

  // The capability census. This, not the transition count, is what makes a quiet
  // week readable: N detectors were ABLE to fire, and here is why each of the
  // others was not.
  const classified = Object.entries(detectors).map(([id, d]) => [id, classifyDetector(d), d]);
  const capable = classified.filter(([, c]) => c.capable);
  const incapable = classified.filter(([, c]) => !c.capable);

  const lines = [];
  lines.push('*KKME fleet lifecycle — weekly digest*');
  lines.push(`New: ${count('discovered')} · Renamed: ${count('renamed')} · Retired: ${count('retired')} · Review-flagged: ${count('review_flagged')}`);
  lines.push('');
  lines.push(classified.length
    ? `👁 *${capable.length} of ${classified.length} detectors were able to fire this week.*`
    : '👁 *No detector has ever reported.*');
  for (const t of recent.filter(t => t.type === 'retired').slice(0, 10)) {
    lines.push(`• RETIRED ${t.id} — ${t.reason} (${(t.evidence || []).length} citation(s))`);
  }
  for (const t of recent.filter(t => t.type === 'renamed').slice(0, 10)) {
    lines.push(`• RENAMED ${t.id} — ${t.detail?.from_name} → ${t.detail?.to_name}`);
  }
  if (classified.length === 0) {
    lines.push('⚠️ No detector has ever reported — this digest cannot distinguish a quiet week from a dead pipeline.');
  } else {
    // Per-detector verdict, always — a reader must never have to assume that a
    // detector not mentioned was one that looked and found nothing.
    lines.push('');
    for (const [id, c] of classified) {
      lines.push(`  ${c.capable ? '✅' : '⛔'} ${id}: ${c.verdict} — ${c.note}`);
    }
    if (incapable.length) {
      lines.push('');
      lines.push(`⛔ *${incapable.length} detector(s) could not fire at all* — their silence is not a finding: ${incapable.map(([id, c]) => `${id} (${c.verdict})`).join(', ')}.`);
    }
    if (!recent.length) {
      lines.push('');
      lines.push(capable.length
        ? `_No transitions. ${capable.length} of ${classified.length} detectors looked and found nothing — a genuine quiet week for those, and silence from the rest._`
        : '_No transitions, and NO detector was able to fire. This is not a quiet week — it is a week with no working sensors._');
    }
  }
  if (unhealthy.length) {
    lines.push('');
    lines.push(`⚠️ Detectors not healthy (${unhealthy.length}) — findings above may be incomplete:`);
    for (const [id, d] of unhealthy) lines.push(`  • ${id}: ${d.status} (${(d.reasons || []).join('; ')})`);
  }
  if (withheld.length) {
    lines.push(`🔒 ${withheld.length} transition(s) withheld from this digest: they carry private-tier fields and must not leave the platform.`);
  }
  const message = lines.join('\n');

  // Last line of defence: contact-shaped CONTENT in the rendered payload, whatever
  // field it arrived in. A rename recorded under a person's email address would pass
  // every field-name check above and still be a leak. Refusing to send is the correct
  // failure — a missed digest is recoverable, an egressed contact is not.
  if (carriesContactShape(message)) {
    return { blocked: true, error: 'digest blocked: contact-shaped content in the rendered payload' };
  }

  return {
    blocked: false,
    message,
    summary: {
      transitions_in_window: recent.length,
      withheld: withheld.length,
      unhealthy_detectors: unhealthy.length,
      detectors_capable: capable.length,
      detectors_total: classified.length,
      verdicts: Object.fromEntries(classified.map(([id, c]) => [id, c.verdict])),
    },
  };
}

/** Send, then stamp. A blocked digest never reaches here, so it never stamps. */
async function sendLifecycleDigest(env, message) {
  await notifyTelegram(env, message).catch(e => console.error('[lifecycle-digest]', String(e)));
  await env.KKME_SIGNALS.put('fleet_lifecycle:last_digest_at', new Date().toISOString());
}

// ─── Fleet tracker helpers ──────────────────────────────────────────────────────

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Data validation ────────────────────────────────────────────────────────

function validate(signalName, data) {
  const issues = [];
  if (!data) { issues.push({ severity: 'error', msg: `${signalName}: null data` }); return issues; }
  if (!data.timestamp && !data.updated_at && !data.fetched_at)
    issues.push({ severity: 'warning', msg: `${signalName}: no timestamp` });
  if (signalName === 's1') {
    if (data.spread_eur_mwh !== undefined && (data.spread_eur_mwh < -100 || data.spread_eur_mwh > 500))
      issues.push({ severity: 'warning', msg: 's1: spread outside plausible range' });
  }
  if (signalName === 's2') {
    if (data.sd_ratio !== undefined && (data.sd_ratio < 0 || data.sd_ratio > 5))
      issues.push({ severity: 'warning', msg: 's2: S/D ratio outside plausible range' });
  }
  if (signalName === 's7') {
    if (data.ttf_eur_mwh !== undefined && (data.ttf_eur_mwh < 0 || data.ttf_eur_mwh > 500))
      issues.push({ severity: 'warning', msg: 's7: TTF outside plausible range' });
  }
  if (signalName === 's9') {
    if (data.ets_eur_t !== undefined && (data.ets_eur_t < 0 || data.ets_eur_t > 300))
      issues.push({ severity: 'warning', msg: 's9: ETS outside plausible range' });
  }
  return issues;
}

// ─── Market regime computation ──────────────────────────────────────────────

function computeRegime(signals) {
  const regimes = [];
  const ssr = signals.sd_ratio || 1.0;
  if (ssr < 0.7) regimes.push({ id: 'RESERVE_SCARCITY', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  else if (ssr < 1.2) regimes.push({ id: 'RESERVE_COMPRESSING', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  else regimes.push({ id: 'RESERVE_SATURATED', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  const ttf = signals.ttf_eur_mwh || 0;
  if (ttf > 50) regimes.push({ id: 'HIGH_GAS_MARGIN', confidence: 'observed', trigger: `ttf=${ttf}` });
  return {
    active: regimes,
    computed_at: new Date().toISOString(),
    primary: regimes[0]?.id || 'NORMAL',
  };
}

// ─── Fleet contradiction + freshness helpers ────────────────────────────────

// Phase 33.A: single-source allowlist gating the public Baltic BESS map.
// Non-Baltic entries (ESN international energy-storage-news pollution — e.g.
// Meralco PH, Saudi/Chile/US projects mislabeled tso:"Litgrid") are rejected at
// POST /s2/fleet and purgeable retroactively via /admin/purge-non-baltic-fleet.
// Blank country drops too (BALTIC_COUNTRIES.has('') === false) — verified safe:
// real TSO-sourced Baltic entries always carry a country code; only the ESN
// scraper emits blanks, and those are all foreign. Single-source per rule #4.
const BALTIC_COUNTRIES = new Set(['LT', 'LV', 'EE']);

function detectContradictions(entry) {
  const flags = [];
  if (entry.status === 'operational' && entry.source && !entry.source.match(/TSO|Litgrid|Elering|AST|operational|energis|grid permit/i))
    flags.push({ id: 'C-01', severity: 'HIGH', msg: 'Operational status without TSO/operational evidence' });
  if (entry.mw && entry.mwh) {
    const duration = entry.mwh / entry.mw;
    if (duration < 0.5 || duration > 12)
      flags.push({ id: 'C-07', severity: 'HIGH', msg: `Duration ${duration.toFixed(1)}h outside 0.5-12h range` });
  }
  if (entry.mw > 500)
    flags.push({ id: 'C-11', severity: 'MEDIUM', msg: `MW=${entry.mw} unusually large for Baltic BESS` });
  return flags;
}

// Phase 33.A: fleet ingest gate. Two rejections, single-sourced so POST and any
// future fleet-touching code agree:
//   1. non-Baltic country (allowlist) — drops ESN international pollution.
//   2. HIGH-severity contradiction flag — C-01 (operational w/o TSO evidence) or
//      C-07 (duration outside 0.5–12h). Phase 33.A escalates these from
//      keep-but-quarantine (Phase 12.10) to reject: a HIGH flag means data
//      integrity is broken at source, and ingesting known-bad is dishonest.
//      C-11 (MW>500) is MEDIUM → kept, flag attached downstream as before.
// Does NOT mutate inputs. Returns { accepted, dropped } where each dropped entry
// carries a reason ('non_baltic' | 'high_severity_flag') for logging/audit.
function filterFleetEntries(entries) {
  const accepted = [];
  const dropped = [];
  for (const e of entries) {
    if (!BALTIC_COUNTRIES.has(e.country)) {
      dropped.push({ id: e.id, country: e.country ?? null, reason: 'non_baltic' });
      continue;
    }
    const flags = detectContradictions(e);
    if (flags.some(f => f.severity === 'HIGH')) {
      dropped.push({ id: e.id, country: e.country, reason: 'high_severity_flag', flags });
      continue;
    }
    accepted.push(e);
  }
  return { accepted, dropped };
}

// ─── Phase 33.A.2 (W1a): operator-curated operational-confirmation allowlist ──
// Pause A root cause: upstream kkme_sync.py has NO operational signal. The
// litgrid/vert/elering loaders scrape permit/connection registers that never
// emit state='operational', and merge_with_existing only blocks downgrades — so
// a commercial BESS that actually commissions stays "announced" forever (4 of 5
// known-operational projects were stale). This list is the operator's confirmed
// truth, applied at POST /s2/fleet BEFORE filterFleetEntries: Phase 33.A turned
// C-01 ('operational without TSO evidence') into a hard REJECT, so the flip must
// also attach an operational-evidence `source`. Each row carries a verifiable
// source_url (rule #3 named-entity). mw/mwh override the feed's collapsed
// capacity; when they disagree a `_mw_disagreement` flag preserves both — this
// is also where W3 lives, since the worker only ever receives one pre-collapsed
// capacity_mw per project upstream (no independent multi-source disagreement
// surface exists). Match = country + normalized name-substring (feed names carry
// company prefixes, MW suffixes, smart-quotes, diacritics). Auvere held back per
// the Pause A operator decision (left announced/75 MW untouched). Litgrid ArcGIS
// auto-confirmation deferred to Phase 33.A.2.c.
const KNOWN_OPERATIONAL = [
  // Hertz 1 (Kiisa EE) — 100 MW / 200 MWh, entered operation 2026-02-03. Evecon/
  // Corsica Sole/Mirova JV. Feed mislabels it 114.9 MW "Hertz 1 Jaago akupark".
  { key: 'hertz-1',      country: 'EE', match: 'hertz 1',     mw: 100, mwh: 200,  cod: '2026-02-03',
    source_url: 'https://en.evecon.ee/estonia-strengthens-energy-resilience-hertz-1-one-of-continental-europes-largest-battery-storage-parks-opens-in-kiisa/' },
  // Vilnius/Trakai BESS — E energija group, 65 MW / 130 MWh, grid-connected
  // Dec 2025 (balancing-market entry 2026-02-24). Feed names it "UAB Vilnius BESS"
  // at 72 MW (vert permit SPV). Operator Pause-A estimate was 60 MW; verified
  // primary source (TV3 + LRT cross-confirm) says 65 MW — using the cited figure.
  { key: 'vilnius-bess', country: 'LT', match: 'vilnius bess', mw: 65, mwh: 130,  cod: '2025-12-01',
    source_url: 'https://www.tv3.lt/naujiena/verslas/traku-rajone-pradejo-veikti-galingiausias-65-mw-komercinis-bateriju-parkas-n1497898' },
  // Tausolos saulė (Telšiai LT) — 30 MW / 67.7 MWh, grid-connected 2026-03-23
  // (LRT). DS1 EPC, CATL cells. Feed MW (30) matches; mwh corrected to 67.7.
  { key: 'tausolos',     country: 'LT', match: 'tausolos',     mw: 30, mwh: 67.7,  cod: '2026-03-23',
    source_url: 'https://www.lrt.lt/naujienos/verslas/4/2876270/prie-tinklo-prijungtas-treciasis-bateriju-parkas-30-mw-kaupikliai-telsiu-rajone' },
  // Vėjo galia (Kaišiadorys LT) — UAB Vėjo galia, 41 MW / 107.3 MWh BESS,
  // grid-connected Dec 2025 (LT's first commercial transmission-connected battery
  // park). Co-located with a 50 MW solar park (Naujažeris): the feed's 50 MW is
  // the SOLAR/connection figure, not the battery — corrected to the 41 MW BESS
  // rating, _mw_disagreement{feed:50, operator:41} captures the solar-vs-BESS gap.
  { key: 'vejo-galia',   country: 'LT', match: 'vejo galia',   mw: 41, mwh: 107.3, cod: '2025-12-10',
    source_url: 'https://www.lrt.lt/naujienos/verslas/4/2781056/prie-elektros-perdavimo-tinklo-prisijunge-komercine-bateriju-kaupimo-sistema-lietuvoje' },
  // ── Phase 33.A.2.e — Estonia ──
  // Enefit Auvere (Ida-Virumaa EE) — Eesti Energia / Enefit, 26.5 MW / 53.1 MWh,
  // operational since 2025-02-01 (LG ES cells, Diotech). Feed (Elering) carries
  // 75 MW = the Auvere industrial-complex permit, NOT the battery → correct to 26.5.
  { key: 'enefit-auvere', country: 'EE', match: 'auvere', mw: 26.5, mwh: 53.1, cod: '2025-02-01',
    source_url: 'https://www.energy-storage.news/first-large-scale-bess-in-estonia-online-with-lg-es-batteries/' },
  // Rummu (Harju County EE) — Enery, BESS 9 MW / 18 MWh, operational since 2025-04
  // (paired with a separate 20 MW PV). Feed "Rummu hübriidelektrijaam" 14 MW is the
  // hybrid grid-connection rating, NOT the BESS nameplate → correct to 9 MW.
  { key: 'rummu', country: 'EE', match: 'rummu', mw: 9, mwh: 18, cod: '2025-04-01',
    source_url: 'https://enery.energy/en/press/enery-energizes-the-baltics-with-commissioning-of-rummu-battery-storage-system-a-flagship-in-renewable-integrated-flexibility/' },
  // BSP Hertz 2 (Aruküla EE) — Evecon/Corsica Sole/Mirova, 100 MW / 200 MWh, UNDER
  // CONSTRUCTION (COD ~end-2026; verified Corsica Sole + ess-news Feb 2026). NOT
  // operational — target_status under_construction. Feed 113.5 MW → correct to 100.
  // (The "200 MW / 400 MWh" figure is the combined Baltic Storage Platform, not H2.)
  { key: 'hertz-2', country: 'EE', match: 'hertz 2', mw: 100, mwh: 200, cod: '2026-12-31',
    target_status: 'under_construction',
    source_url: 'https://corsicasole.com/en/realisations/hertz-2-energy-storage-facility/' },
];

// Lowercase + strip diacritics + smart-quotes so feed names like
// 'UAB „Vilnius BESS" 72.0' match the 'vilnius bess' needle.
function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[„“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Apply the operational-confirmation allowlist to a fresh fleet batch. Mutates
// matched entries in place — the POST handler replaces the full fleet on every
// call, so per-batch mutation is idempotent. Returns { entries, flipped } where
// flipped carries {key, name, from, mw_from, mw_to} for logging/verification.
function applyKnownOperational(entries) {
  const flipped = [];
  if (!Array.isArray(entries)) return { entries, flipped };
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const n = normName(e.name);
    const hit = KNOWN_OPERATIONAL.find(k => e.country === k.country && n.includes(k.match));
    if (!hit) continue;
    const fromStatus = e.status;
    const feedMw = Number(e.mw);
    // W3 — preserve feed/operator MW disagreement before overriding.
    if (Number.isFinite(feedMw) && Math.abs(feedMw - hit.mw) >= 0.1) {
      e._mw_disagreement = { feed_mw: feedMw, operator_mw: hit.mw, source_url: hit.source_url };
    }
    // Phase 33.A.2.e — per-entry target status (default 'operational'). Known
    // pre-COD-but-confirmed projects (e.g. Hertz 2, under construction with a
    // public COD) flip to 'under_construction' instead, lifting STATUS_WEIGHT
    // 0.1→0.9 without falsely asserting operation.
    const targetStatus = hit.target_status || 'operational';
    e.status = targetStatus;
    e.mw = hit.mw;
    e.mwh = hit.mwh;
    if (hit.cod) e.cod = hit.cod;
    // C-01 (operational-without-TSO-evidence) only fires for operational/
    // commissioned, so only those need the evidence token appended. Idempotency
    // guard: don't re-append on repeated POSTs (full-replace re-runs every push).
    if (targetStatus === 'operational' || targetStatus === 'commissioned') {
      const TOKEN = ' · operator-confirmed operational';
      // Self-healing + idempotent: strip any prior token(s) then append exactly
      // one. Repairs strings that bloated before the guard (e.g. Hertz 1 ×5).
      const base = String(e.source || hit.key).split(TOKEN).join('').replace(/\s+$/, '');
      e.source = `${base}${TOKEN}`;
    }
    e.source_url = hit.source_url;
    e.confidence = 'confirmed';
    flipped.push({ key: hit.key, name: e.name, from: fromStatus, to: targetStatus, mw_from: feedMw, mw_to: hit.mw });
  }
  return { entries, flipped };
}

// ─── Phase 33.A.2.b (W2-curated): Latvia operational fleet inject ─────────────
// Pause A diagnosis: the LV ingest pipeline is structurally dead — the SPRK/BIS/
// VVD scraper produces only PDF-title garbage (no fresh output since 2026-04-24),
// and entity_resolver has no extractor for sprk/bis/vvd, so LV permit data can't
// resolve at all. The real LV operational fleet is genuinely SMALL (~4 projects,
// dominated by AST's own 80 MW) and documented in PRESS, not registers. So these
// 4 are curated-injected (the honest answer for a small, stable, primary-sourced
// set; automation's payoff is forward pipeline discovery, handled upstream). Like
// applyKnownOperational this runs at POST /s2/fleet and re-applies on every push,
// so it survives kkme_sync full-replace. Each entry carries a primary source_url
// (rule #3) and a C-01-satisfying `source` token. Rēzekne/Tume are TSO-owned →
// type 'tso_bess' (excluded from the commercial weighted-supply S/D, like the
// Litgrid Kaupikliai); Targale/AJ Power are commercial. Dedup by country + name
// substring so a future upstream feed of the same project won't double-add.
const CURATED_FLEET = [
  // Utilitas Targale (Ventspils LV) — 10 MW / 20 MWh, operational Nov 2024,
  // co-located with the 58.8 MW Tārgale wind park. Commercial.
  { match: 'targale', id: 'utilitas-targale-lv', name: 'Utilitas Targale BESS', country: 'LV',
    mw: 10, mwh: 20, status: 'operational', cod: '2024-11-01', tso: 'AST', confidence: 'confirmed',
    source: 'Utilitas · operator-confirmed operational',
    source_url: 'https://utilitas.ee/en/latvias-largest-battery-energy-storage-system-unveiled/' },
  // AJ Power (Valmiera + Aizkraukle + Ilūkste LV) — 9 MW / 18 MWh aggregate across
  // 3 solar-co-located sub-sites, operational 2025. Injected as one aggregate
  // entry per operator decision (sub-5 MW individual sites; splittable later).
  { match: 'aj power', id: 'aj-power-bess-lv', name: 'AJ Power BESS (3 sites)', country: 'LV',
    mw: 9, mwh: 18, status: 'operational', cod: '2025-02-03', tso: 'AST', confidence: 'confirmed',
    source: 'AJ Power · operator-confirmed operational',
    source_url: 'https://ajpower.lv/en/investing-over-e6-million-in-bess-deployment/' },
  // AST Rēzekne — 60 MW / 120 MWh, TSO-owned, balancing reserves from 2025-10-30.
  { match: 'rezekne', id: 'ast-bess-rezekne-lv', name: 'AST BESS Rēzekne', country: 'LV',
    mw: 60, mwh: 120, status: 'operational', cod: '2025-10-30', tso: 'AST', type: 'tso_bess', confidence: 'confirmed',
    source: 'AST · TSO operational',
    source_url: 'https://www.ast.lv/en/events/ast-battery-energy-storage-systems-rezekne-and-tume-will-start-providing-balancing-reserves' },
  // AST Tume — 20 MW / 40 MWh, TSO-owned, balancing reserves from 2025-10-30.
  { match: 'tume', id: 'ast-bess-tume-lv', name: 'AST BESS Tume', country: 'LV',
    mw: 20, mwh: 40, status: 'operational', cod: '2025-10-30', tso: 'AST', type: 'tso_bess', confidence: 'confirmed',
    source: 'AST · TSO operational',
    source_url: 'https://www.ast.lv/en/events/ast-battery-energy-storage-systems-rezekne-and-tume-will-start-providing-balancing-reserves' },
];

// Inject curated fleet entries not already present in the batch. Mutates+appends
// in place (idempotent per the full-replace POST). Returns { entries, injected }.
function injectCuratedFleet(entries) {
  const injected = [];
  if (!Array.isArray(entries)) return { entries, injected };
  for (const c of CURATED_FLEET) {
    const exists = entries.some(e => e && e.country === c.country && normName(e.name).includes(c.match));
    if (exists) continue;
    const { match, ...entry } = c;
    entries.push({ ...entry, _curated: true });
    injected.push({ id: c.id, name: c.name, mw: c.mw });
  }
  return { entries, injected };
}

// Phase 33.A.2.b (W4): merge operator manual additions (persisted in the
// s4_manual_additions KV) into a fresh batch. The safety valve for projects the
// curated list + upstream feeds miss; re-applied on every POST so manual entries
// survive kkme_sync's full-replace. Dedup by country + name substring. Returns
// { entries, merged }.
function injectManualAdditions(entries, manualList) {
  const merged = [];
  if (!Array.isArray(entries) || !Array.isArray(manualList)) return { entries, merged };
  for (const m of manualList) {
    if (!m || !m.name || !m.country) continue;
    const mn = normName(m.name);
    const exists = entries.some(e => e && e.country === m.country && normName(e.name) === mn);
    if (exists) continue;
    entries.push({ ...m, _manual: true });
    merged.push({ id: m.id || m.name, name: m.name, mw: m.mw });
  }
  return { entries, merged };
}

function freshnessScore(entry) {
  if (!entry.updated) return 0.5;
  const daysSince = (Date.now() - new Date(entry.updated).getTime()) / 86400000;
  if (daysSince < 30) return 1.0;
  if (daysSince < 90) return 0.8;
  if (daysSince < 180) return 0.6;
  if (daysSince < 365) return 0.4;
  return 0.2;
}

const STATUS_WEIGHT = {
  operational: 1.0, commissioned: 1.0,
  under_construction: 0.9, connection_agreement: 0.6,
  application: 0.3, announced: 0.1,
};

function processFleet(entries, demand) {
  // Deduplicate: if two entries share a name prefix + country and MW within 10%, keep the one with more specific COD
  const deduped = [];
  const seen = new Set();
  const sorted = [...entries].sort((a, b) => {
    // Prefer entries with specific COD dates over generic ones
    const aSpecific = a.cod && String(a.cod).includes('-') ? 1 : 0;
    const bSpecific = b.cod && String(b.cod).includes('-') ? 1 : 0;
    return bSpecific - aSpecific;
  });
  for (const e of sorted) {
    // When entry has an explicit id, use it as the dedup key (unique by definition)
    const dedupKey = e.id
      ? `id:${e.id}`
      : `${(e.name || '').replace(/\s*\(.*\)/, '').trim().toLowerCase()}|${e.country || 'LT'}`;
    const existing = deduped.find(d => {
      const dKey = d.id
        ? `id:${d.id}`
        : `${(d.name || '').replace(/\s*\(.*\)/, '').trim().toLowerCase()}|${d.country || 'LT'}`;
      return dKey === dedupKey && Math.abs(d.mw - e.mw) / Math.max(d.mw, e.mw) < 0.10;
    });
    if (existing) {
      console.log(`[Fleet/dedup] Skipping "${e.name}" (${e.mw} MW) — duplicate of "${existing.name}" (${existing.mw} MW)`);
      continue;
    }
    deduped.push(e);
  }

  const countries = {};
  // Separate BESS from other storage types for S/D computation
  const isNonCommercial = (e) => e.type === 'pumped_hydro' || e.type === 'tso_bess';
  let non_commercial_mw = 0;

  for (const e of deduped) {
    const c = e.country || 'LT';
    if (!countries[c]) countries[c] = { operational_mw: 0, pipeline_mw: 0, weighted_mw: 0, entries: [] };
    const w = STATUS_WEIGHT[e.status] || 0.1;
    if (!isNonCommercial(e)) {
      countries[c].weighted_mw += e.mw * w;
    } else {
      non_commercial_mw += e.mw;
    }
    if (e.status === 'operational' || e.status === 'commissioned') {
      countries[c].operational_mw += e.mw;
    } else {
      countries[c].pipeline_mw += e.mw;
    }
    countries[c].entries.push(e);
  }
  const baltic_operational = Object.values(countries).reduce((s, c) => s + c.operational_mw, 0);
  const baltic_weighted    = Object.values(countries).reduce((s, c) => s + c.weighted_mw, 0);
  const baltic_pipeline    = Object.values(countries).reduce((s, c) => s + c.pipeline_mw, 0);
  // Phase 36.D — demand comes from the canonical module, year-indexed. The
  // `demand` argument is no longer a source: it carried two different hardcoded
  // defaults (752 here, 935 in the KV write path) and the published S/D
  // oscillated between them depending on which cron wrote last. It is now
  // accepted only as an explicit operator override, and echoed as such.
  // An override must SAY it is one. Honouring a bare `eff_demand_mw` would let
  // the stale 935 still sitting in KV keep governing until the next full POST —
  // exactly the failure being retired here, one deploy later.
  const currentYear   = new Date().getUTCFullYear();
  const isOverride    = demand?.override === true && Number.isFinite(demand?.eff_demand_mw) && demand.eff_demand_mw > 0;
  const eff_demand    = isOverride ? demand.eff_demand_mw : addressableDemandMw(currentYear);
  const demand_source = isOverride ? 'operator_override' : 'demand-forecast-module';

  // MW contracted away from the merchant reserve pool by LT services KKME has
  // no revenue line for (GAGAP, LT-PL, and the legally-reserved IZDR). Deducted
  // from supply rather than added to demand: those MW compete for a different
  // buyer, they do not enlarge ours. See workers/lib/demand-forecast.js.
  const absorption      = absorptionMw(currentYear);
  const baltic_weighted_net = Math.max(0, baltic_weighted - absorption);
  const sd_ratio        = baltic_weighted_net / eff_demand;

  // Per-product S/D ratios — worst-case stress view (all fleet allocated to single product)
  const PRODUCT_DEMAND = productDemandMap(currentYear);
  const product_sd = {};
  for (const [prod, dem] of Object.entries(PRODUCT_DEMAND)) {
    const r = dem > 0 ? baltic_weighted_net / dem : null;
    const rounded = r !== null ? Math.round(r * 100) / 100 : null;
    product_sd[prod] = {
      demand_mw: dem,
      supply_mw: Math.round(baltic_weighted_net),
      ratio: rounded,
      sd_ratio: rounded,
      phase: r === null ? null : r < 0.6 ? 'SCARCITY' : r < 1.0 ? 'COMPRESS' : 'MATURE',
    };
  }

  // CPI: floor 0.30, slope 0.08
  let phase, cpi;
  if (sd_ratio < 0.6) {
    phase = 'SCARCITY'; cpi = Math.min(1.0 + (0.6 - sd_ratio) * 2.5, 2.0);
  } else if (sd_ratio < 1.0) {
    phase = 'COMPRESS'; cpi = Math.max(0.30, 1.0 - (sd_ratio - 0.6) * 1.5);
  } else {
    phase = 'MATURE';   cpi = Math.max(0.30, 0.40 - (sd_ratio - 1.0) * 0.08);
  }
  // 5-year trajectory.
  //
  // Phase 36.D — the growth assumption is unchanged in substance but had to
  // change units. It was "+0.15 S/D per year", which only means anything while
  // the denominator is a constant. With demand year-indexed, the same
  // assumption is carried as its MW equivalent at the base year
  // (0.15 × eff_demand ≈ 113 MW/yr of new weighted supply), so the numerator
  // grows on the original calibration while the denominator follows the TSOs'
  // published series and absorption follows the module's own trajectory. At
  // i = 0 this reproduces `sd_ratio` exactly, so the base year is continuous.
  //
  // This series is display-only: it feeds the cannibalisation chart via
  // `fleet_trajectory`. Revenue takes a different path (projectFleet /
  // projectDemand in computeTradingMix).
  const trajectory = [];
  const baseYear = currentYear;
  const TRAJECTORY_SUPPLY_GROWTH_MW_YR = 0.15 * eff_demand;
  for (let i = 0; i <= 5; i++) {
    const yr = baseYear + i;
    const supply_yr = baltic_weighted + i * TRAJECTORY_SUPPLY_GROWTH_MW_YR;
    const r = Math.max(0, supply_yr - absorptionMw(yr)) / addressableDemandMw(yr);
    const ph = r < 0.6 ? 'SCARCITY' : r < 1.0 ? 'COMPRESS' : 'MATURE';
    let tc;
    if (r < 0.6) tc = Math.min(1.0 + (0.6 - r) * 2.5, 2.0);
    else if (r < 1.0) tc = Math.max(0.30, 1.0 - (r - 0.6) * 1.5);
    else tc = Math.max(0.30, 0.40 - (r - 1.0) * 0.08);
    trajectory.push({ year: yr, sd_ratio: Math.round(r * 100) / 100, phase: ph, cpi: Math.round(tc * 100) / 100 });
  }
  // Quarantine + contradiction detection
  const quarantined = [];
  for (const e of entries) {
    const flags = detectContradictions(e);
    e._contradiction_flags = flags;
    e._freshness = freshnessScore(e);
    if (flags.some(f => f.severity === 'HIGH')) {
      e._quarantine = true;
      quarantined.push({ name: e.name, flags });
    }
  }
  // Phase 12.10 — quarantine soft-enforcement: companion `quarantined_mw`
  // per country + `_strict` totals. Inclusive `operational_mw` retained for
  // backward compatibility with downstream consumers; frontend selects via
  // `app/lib/fleetMw.ts` semantics.
  let baltic_quarantined = 0;
  for (const c of Object.keys(countries)) {
    const cc = countries[c];
    const qmw = (cc.entries || [])
      .filter(e => (e.status === 'operational' || e.status === 'commissioned') && e._quarantine === true)
      .reduce((s, e) => s + (Number(e.mw) || 0), 0);
    cc.quarantined_mw           = Math.round(qmw * 10) / 10;
    cc.operational_mw_strict    = Math.round((cc.operational_mw - qmw) * 10) / 10;
    cc.operational_mw_inclusive = Math.round(cc.operational_mw);
    baltic_quarantined += qmw;
  }
  return {
    countries,
    baltic_operational_mw:        Math.round(baltic_operational),
    baltic_operational_mw_strict: Math.round(baltic_operational - baltic_quarantined),
    baltic_quarantined_mw:        Math.round(baltic_quarantined * 10) / 10,
    baltic_pipeline_mw:    Math.round(baltic_pipeline),
    baltic_weighted_mw:    Math.round(baltic_weighted),
    // Phase 36.D — gross weighted supply is retained above (it is the published
    // fleet statistic the map and the counts tell a story about). The S/D
    // numerator is the NET figure: gross less the MW contracted away to LT
    // services KKME earns nothing from. Both are surfaced so the subtraction is
    // inspectable rather than implied.
    baltic_weighted_net_mw: Math.round(baltic_weighted_net),
    absorption_mw:          Math.round(absorption),
    non_commercial_mw:     Math.round(non_commercial_mw),
    eff_demand_mw:         eff_demand,
    demand_basis: {
      source: demand_source,
      module_version: DEMAND_FORECAST_VERSION.version,
      scope: DEMAND_FORECAST_VERSION.scope,
      year: currentYear,
    },
    sd_ratio:              Math.round(sd_ratio * 100) / 100,
    phase,
    cpi:                   Math.round(cpi * 100) / 100,
    product_sd,
    trajectory,
    quarantined,
    updated_at:            new Date().toISOString(),
  };
}

// ─── KKME Trading Engine ──────────────────────────────────────────────────────
// Dispatch optimisation algorithm calibrated on Baltic market microstructure.
// Computes optimal BESS dispatch from BTD balancing data + ENTSO-E DA prices.

function t_r0(n) { return Math.round(n); }
function t_r1(n) { return Math.round(n * 10) / 10; }
function t_r2(n) { return Math.round(n * 100) / 100; }
function t_r3(n) { return Math.round(n * 1000) / 1000; }

// BESS MW share heuristics for Kruonis PSP disaggregation.
// FCR: 100% BESS (PSP physically cannot respond sub-second).
// aFRR: 90% BESS (PSP too slow for automatic activation <5min).
// mFRR: split by grid-permitted MW ratio: bessMW / (bessMW + kruonisMW).
const KRUONIS_MW = 205;
function bessShareMFRR(bessMW) { return bessMW / (bessMW + KRUONIS_MW); }

function computeDispatch(data, battery) {
  const { mw, mwh, rte } = battery;
  const duration = mwh / mw;
  const mfrrShare = bessShareMFRR(mw);

  const isps = [];
  let soc = 0.5;
  let totalCapRev = 0, totalActRev = 0, totalArbRev = 0;

  // Determine arb charge/discharge thresholds from DA price distribution
  const daHourly = data.da_hourly || [];
  let chargeThreshold = 40, dischargeThreshold = 80;
  if (daHourly.length >= 20) {
    const sorted = [...daHourly].sort((a, b) => a - b);
    chargeThreshold = sorted[Math.floor(sorted.length * 0.25)]; // p25
    dischargeThreshold = sorted[Math.floor(sorted.length * 0.75)]; // p75
  }

  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4);
    const cap = data.capacity_prices?.[i] || {};
    const procured = data.procured_mw?.[i] || {};
    const actPrice = data.activation_prices?.[i] || {};
    const dir = data.direction?.[i];
    const imbPrice = data.imbalance_prices?.[i] || {};
    const imbVol = data.imbalance_volumes?.[i];

    // --- Capacity allocation (observed procured MW, BESS share estimated) ---
    const fcrMW = Math.min((procured.fcr_sym || 0) * 1.0, mw * 0.25);
    const afrrMW = Math.min((procured.afrr_up || 0) * 0.9, mw * 0.40);
    const mfrrMW = Math.min((procured.mfrr_up || 0) * mfrrShare, mw * 0.50);
    const reservedMW = fcrMW + afrrMW + mfrrMW;
    const arbAvailMW = Math.max(0, mw - reservedMW);

    // --- Capacity revenue (15-min pro rata) ---
    const fcrCapRev = fcrMW * (cap.fcr_sym || 0) / 4;
    const afrrCapRev = afrrMW * (cap.afrr_up || 0) / 4;
    const mfrrCapRev = mfrrMW * (cap.mfrr_up || 0) / 4;
    const ispCapRev = fcrCapRev + afrrCapRev + mfrrCapRev;

    // --- Activation revenue (estimated from balancing energy prices + direction) ---
    const upActPrice = actPrice.up || 0;
    const downActPrice = actPrice.down || 0;
    const isShort = (dir || 0) > 0;

    // If activation price exists and system direction matches, estimate activation
    const afrrActMW = upActPrice > 0 && isShort ? afrrMW * 0.30 : 0;
    const mfrrActMW = upActPrice > 50 && isShort ? mfrrMW * 0.20 : 0;
    const ispActRev = (afrrActMW * upActPrice / 4) + (mfrrActMW * upActPrice / 4);

    // --- Arbitrage (DA price-driven charge/discharge) ---
    const daPrice = daHourly[h] || 0;
    let arbRev = 0;
    let arbAction = 'hold';

    if (arbAvailMW > 0 && daPrice > 0) {
      if (daPrice <= chargeThreshold && soc < 0.85) {
        const chargeMWh = Math.min(arbAvailMW / 4, (0.90 - soc) * mwh);
        if (chargeMWh > 0) {
          soc += chargeMWh / mwh;
          arbRev = -chargeMWh * daPrice;
          arbAction = 'charge';
        }
      } else if (daPrice >= dischargeThreshold && soc > 0.20) {
        const dischargeMWh = Math.min(arbAvailMW * rte / 4, (soc - 0.15) * mwh);
        if (dischargeMWh > 0) {
          soc -= dischargeMWh / mwh;
          arbRev = dischargeMWh * daPrice;
          arbAction = 'discharge';
        }
      }
    }

    // SoC drain from activations (upward activation = discharge)
    const actDrainMWh = (afrrActMW + mfrrActMW) / 4;
    soc = Math.max(0.05, Math.min(0.95, soc - actDrainMWh / mwh));

    totalCapRev += ispCapRev;
    totalActRev += ispActRev;
    totalArbRev += arbRev;

    isps.push({
      isp: i,
      time: `${String(h).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
      da_price: t_r2(daPrice),
      capacity: {
        fcr: { mw: t_r1(fcrMW), price: t_r2(cap.fcr_sym || 0) },
        afrr: { mw: t_r1(afrrMW), price: t_r2(cap.afrr_up || 0) },
        mfrr: { mw: t_r1(mfrrMW), price: t_r2(cap.mfrr_up || 0) },
      },
      activation: {
        up_price: t_r2(upActPrice),
        down_price: t_r2(downActPrice),
        direction: isShort ? 'short' : 'long',
        est_afrr_mw: t_r1(afrrActMW),
        est_mfrr_mw: t_r1(mfrrActMW),
      },
      arb: { available_mw: t_r1(arbAvailMW), action: arbAction, revenue: t_r2(arbRev) },
      soc: t_r3(soc),
      imbalance: { price: t_r2(imbPrice.final || imbPrice.preliminary || 0), volume_mwh: t_r1(imbVol || 0) },
      revenue: {
        capacity: t_r2(ispCapRev),
        activation: t_r2(ispActRev),
        arbitrage: t_r2(arbRev),
        total: t_r2(ispCapRev + ispActRev + arbRev),
      },
    });
  }

  const totalRev = totalCapRev + totalActRev + totalArbRev;

  // Reserve availability: count ISPs with active procurement per product
  const afrr_active_isps = isps.filter(isp => isp.capacity.afrr.mw > 0).length;
  const mfrr_active_isps = isps.filter(isp => isp.capacity.mfrr.mw > 0).length;
  const fcr_active_isps  = isps.filter(isp => isp.capacity.fcr.mw > 0).length;

  // Activation rates: count ISPs with actual energy dispatch (not procurement)
  const afrr_dispatched_isps = isps.filter(isp => isp.activation.est_afrr_mw > 0).length;
  const mfrr_dispatched_isps = isps.filter(isp => isp.activation.est_mfrr_mw > 0).length;

  // Hourly aggregation
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const slice = isps.filter(isp => Math.floor(isp.isp / 4) === h);
    hourly.push({
      hour: h,
      da_price: slice[0]?.da_price || 0,
      revenue: {
        capacity: t_r2(slice.reduce((s, isp) => s + isp.revenue.capacity, 0)),
        activation: t_r2(slice.reduce((s, isp) => s + isp.revenue.activation, 0)),
        arbitrage: t_r2(slice.reduce((s, isp) => s + isp.revenue.arbitrage, 0)),
        total: t_r2(slice.reduce((s, isp) => s + isp.revenue.total, 0)),
      },
      avg_soc: t_r3(slice.reduce((s, isp) => s + isp.soc, 0) / (slice.length || 1)),
      activations: slice.filter(isp => isp.activation.est_afrr_mw > 0).length,
    });
  }

  // Strategy fingerprint
  const peakHours = hourly.filter(h => h.hour >= 17 && h.hour <= 20);
  const offPeakHours = hourly.filter(h => h.hour >= 1 && h.hour <= 5);
  const peakRevAvg = peakHours.reduce((s, h) => s + h.revenue.total, 0) / (peakHours.length || 1);
  const offPeakRevAvg = offPeakHours.reduce((s, h) => s + h.revenue.total, 0) / (offPeakHours.length || 1);
  const activatedISPs = isps.filter(isp => isp.activation.est_afrr_mw > 0 || isp.activation.est_mfrr_mw > 0);
  const socValues = isps.map(isp => isp.soc);

  // Trade signals — limit DA to 24 hours (extractPrices may return >24 from multi-TimeSeries XML)
  const signals = computeTradeSignals(daHourly.slice(0, 24), isps);

  return {
    _meta: {
      date: data.date,
      computed: new Date().toISOString(),
      battery: { mw, mwh, rte, duration },
      data_sources: ['BTD:price_procured_reserves', 'BTD:procured_reserves', 'BTD:balancing_energy_prices', 'BTD:direction_of_balancing_v2', 'BTD:imbalance_prices', 'BTD:imbalance_volumes', 'ENTSOE:A44'],
      note: 'KKME dispatch algorithm. DA prices hourly (ENTSO-E A44); balancing data 15-min (BTD). Market trades at 15-min MTU since Sep 2025.',
      data_class: 'derived',
      kruonis_disaggregation: { method: 'heuristic', fcr_bess_share: 1.0, afrr_bess_share: 0.9, mfrr_bess_share: t_r2(bessShareMFRR(mw)) },
    },
    dispatch: { isps, hourly },
    totals: {
      gross: t_r2(totalRev),
      per_mw: t_r2(totalRev / mw),
      capacity: t_r2(totalCapRev),
      activation: t_r2(totalActRev),
      arbitrage: t_r2(totalArbRev),
      splits_pct: totalRev > 0 ? {
        capacity: Math.round(totalCapRev / totalRev * 100),
        activation: Math.round(totalActRev / totalRev * 100),
        arbitrage: Math.round(totalArbRev / totalRev * 100),
      } : { capacity: 0, activation: 0, arbitrage: 0 },
      annualised: t_r0(totalRev * 365),
      annualised_per_mw: t_r0(totalRev * 365 / mw),
    },
    strategy: {
      peak_offpeak_ratio: t_r1(peakRevAvg / (offPeakRevAvg || 1)),
      activation_rate_pct: t_r1(activatedISPs.length / 96 * 100),
      soc_range: [t_r2(Math.min(...socValues)), t_r2(Math.max(...socValues))],
      fcr_baseload_mw: t_r1(isps.reduce((s, isp) => s + isp.capacity.fcr.mw, 0) / 96),
    },
    signals,
    reserve_availability: {
      afrr_active_isps,
      mfrr_active_isps,
      fcr_active_isps,
      afrr_dispatched_isps,
      mfrr_dispatched_isps,
      total_isps: 96,
      // Procurement rates (fraction of ISPs with capacity offered — typically ~1.0)
      afrr_pct: Math.round(afrr_active_isps / 96 * 100) / 100,
      mfrr_pct: Math.round(mfrr_active_isps / 96 * 100) / 100,
      fcr_pct: Math.round(fcr_active_isps / 96 * 100) / 100,
      // Activation rates (fraction of ISPs with actual energy dispatch — typically 0.10-0.25)
      afrr_activation_pct: Math.round(afrr_dispatched_isps / 96 * 100) / 100,
      mfrr_activation_pct: Math.round(mfrr_dispatched_isps / 96 * 100) / 100,
    },
  };
}

function computeTradeSignals(daHourly, isps) {
  // DA arbitrage windows
  const sorted = daHourly.map((p, h) => ({ h, p })).sort((a, b) => a.p - b.p);
  const chargeHours = sorted.slice(0, 2).map(x => x.h);
  const dischargeHours = sorted.slice(-2).map(x => x.h);
  const avgCharge = chargeHours.length ? chargeHours.reduce((s, h) => s + (daHourly[h] || 0), 0) / chargeHours.length : 0;
  const avgDischarge = dischargeHours.length ? dischargeHours.reduce((s, h) => s + (daHourly[h] || 0), 0) / dischargeHours.length : 0;

  const shortISPs = isps.filter(isp => isp.activation.direction === 'short').length;

  return {
    da_arb: {
      charge_hours: chargeHours,
      discharge_hours: dischargeHours,
      avg_charge_price: t_r2(avgCharge),
      avg_discharge_price: t_r2(avgDischarge),
      net_capture: t_r2(avgDischarge - avgCharge / RTE_BOL.h2), // canonical RTE_BOL (duration-agnostic signal → h2)
      confidence: avgDischarge - avgCharge > 40 ? 'HIGH' : avgDischarge - avgCharge > 20 ? 'MEDIUM' : 'LOW',
      data_class: 'derived',
    },
    imbalance_bias: shortISPs > 48 ? 'SHORT' : shortISPs < 40 ? 'LONG' : 'BALANCED',
    activation_probability: t_r2(isps.filter(isp => isp.activation.up_price > 0).length / 96),
    drr_distortion: {
      note: 'Capacity prices reflect DRR-distorted market. TSO resources (Litgrid/Fluence 4×50MW Energy Cells) bid at zero price.',
      derogation_expires: '2028-02',
      extension_possible: '2030-02',
      impact: 'Pre-DRR-exit prices likely 20-40% higher than current clearing',
      data_class: 'reference',
    },
  };
}

// ─── Dispatch Engine v2 — parameterized, co-optimized ───────────────────────
// Source: audit findings Apr 2026. Replaces hardcoded 60MW/130MWh with
// parameterized 50MW + dur_h. Adds per-ISP co-optimization with reserve cap.

// Sub-hourly capture uplift — how much more spread a quarter-hourly day-ahead
// shape offers than the same day averaged into hours.
//
// Phase 36.B batch-3 — MEASURED, not proxied. The asserted 0.14 was a Rystad
// Dec-2025 figure for Lithuania carried as a placeholder until the market itself
// could be read; LT day-ahead has been natively PT15M since 2025-10-01, so it is
// now directly testable. `tools/consultancy/run-15min-delta.mjs` re-fetches the
// same days at native resolution and runs the worker's own `computeDayCapture`
// at 15 and at 60 minutes on identical days: over 273 complete PT15M days
// (2025-10-01 → 2026-06-30) the volume-weighted uplift is 0.0885, simple mean
// 0.0979, median 0.0815, range 0.0005-0.845.
//
// The asserted constant was ~58 % higher than what the market actually paid.
// Same denominator, same function, same days — it is the sourced figure that is
// being corrected, not the method. Remeasure annually with the register row.
const RYSTAD_15MIN_UPLIFT_DECIMAL = 0.0885;

// Elering 2026 forecast: post-DRR FCR clearing ~€40-45/MW/h
// based on continental FCR averages and Baltic demand 28 MW.
const POST_DRR_FCR_PRICE_EUR_MW_H = 42;

// Operator practice: max 70% MW to reserves, keep ≥30% for arbitrage.
// Source: enspired German portfolio behavior (Dec 2025).
const RESERVE_MW_CAP_FRACTION = 0.70;

/**
 * Day-ahead price array → exactly 24 hourly values for the TARGET day.
 *
 * ENTSO-E A44 for LT is PT60M through 2025-09-29 and PT15M from 2025-10-01
 * (probed, 36.B1-F), and `extractPrices` regex-scrapes every `price.amount` in
 * the document without reading its resolution tag. What reaches here is a flat
 * concatenation: 24 points on an old day, 96 on a current one, and 192 when the
 * fetch window returns two days — which is what `trading:<date>:raw` actually
 * holds.
 *
 * Before Phase 36.B batch-2 this was `slice(0, 24)` indexed by
 * `Math.floor(isp / 4)`, so from 2025-10-01 the card dispatched against the
 * first SIX HOURS of the day stretched across 24. On 2026-07-14 the real day
 * spanned €12-181 (midday solar trough, evening peak); the slice it saw spanned
 * €127-151 of monotone early morning, so the p25/p75 triggers fired on noise.
 *
 * Detection is by payload length, never by date: the resolution is a property
 * of the data, and a hardcoded cutover would be a display-affecting label
 * asserting something it did not compute (discipline rule #2 — and the worker's
 * own PT15M comment at :675 is a month wrong, which is exactly how that fails).
 * Bucketing reuses the engine's established `Math.round(h * N / 24)` idiom
 * (:4085-4098, Phase 31.A.2), which handles exact and ragged divisions alike.
 */
function daPricesToHourly24(daHourly) {
  const all = Array.isArray(daHourly) ? daHourly : [];
  if (!all.length) return [];

  // LT day-ahead has only ever been PT60M or PT15M, so an exact divisor
  // identifies resolution and day-count together: 192 → 96×2, 96 → 96×1,
  // 48 → 24×2, 24 → 24×1.
  let dayPoints = 0;
  for (const c of [96, 24]) {
    if (all.length % c === 0 && all.length / c <= 3) { dayPoints = c; break; }
  }
  // Ragged lengths: a DST day is 92 or 100 quarter-hours (23 or 25 hours), and
  // ENTSO-E has been observed serving 95. Fall back to a resolution threshold.
  if (!dayPoints) dayPoints = all.length >= 92 ? 96 : 24;

  const day = all.slice(0, Math.min(dayPoints, all.length));
  const N = day.length;
  const out = [];
  for (let h = 0; h < 24; h++) {
    const lo = Math.round((h * N) / 24);
    const hi = Math.max(lo + 1, Math.round(((h + 1) * N) / 24));
    const bucket = day.slice(lo, Math.min(hi, N)).filter(p => Number.isFinite(p));
    if (bucket.length) {
      out.push(bucket.reduce((a, b) => a + b, 0) / bucket.length);
    } else {
      // Hold the previous hour rather than inventing a zero, which would read
      // as a free-energy hour and pull the charge trigger down.
      out.push(out.length ? out[out.length - 1] : 0);
    }
  }
  return out;
}

function computeDispatchV2(btdData, daHourly, opts = {}) {
  const mw = opts.mw || 50;
  const dur_h = opts.dur_h || 4;
  const mwh = mw * dur_h;
  const rte = rteBolFor(dur_h); // canonical RTE_BOL under the 36.B5 duration policy
  const mode = opts.mode || 'realised';
  const drr_active = opts.drr_active !== false;
  const date_iso = opts.date_iso || btdData?.date || new Date().toISOString().slice(0, 10);

  const mfrrShare = bessShareMFRR(mw);
  const max_reserve_mw = mw * RESERVE_MW_CAP_FRACTION;
  const min_arb_mw = mw * (1 - RESERVE_MW_CAP_FRACTION);

  // DA price analysis — resolution-aware, always 24 hourly values for the day.
  const daH = daPricesToHourly24(daHourly);
  let chargeThreshold = 40, dischargeThreshold = 80;
  if (daH.length >= 20) {
    const sorted = [...daH].sort((a, b) => a - b);
    chargeThreshold = sorted[Math.floor(sorted.length * 0.25)];
    dischargeThreshold = sorted[Math.floor(sorted.length * 0.75)];
  }

  const isps = [];
  let soc = 0.50; // initial SoC
  let totalCapRev = 0, totalActRev = 0, totalArbRev = 0;
  let totalReserveMW = 0, totalArbMW = 0;
  let chargeISPs = [], dischargeISPs = [];

  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4);
    const cap = btdData?.capacity_prices?.[i] || {};
    const procured = btdData?.procured_mw?.[i] || {};
    const actPrice = btdData?.activation_prices?.[i] || {};
    const dir = btdData?.direction?.[i];

    // --- Reserve allocation (capped at 70% MW) ---
    const rawFcr = drr_active ? 0 : Math.min(mw * 0.20, 10); // DRR: FCR = 0 until 2028
    const rawAfrr = Math.min((procured.afrr_up || 0) * 0.9, mw * 0.40);
    const rawMfrr = Math.min((procured.mfrr_up || 0) * mfrrShare, mw * 0.50);
    const rawTotal = rawFcr + rawAfrr + rawMfrr;

    // Scale down proportionally if over cap
    const scale = rawTotal > max_reserve_mw ? max_reserve_mw / rawTotal : 1.0;
    const fcrMW = rawFcr * scale;
    const afrrMW = rawAfrr * scale;
    const mfrrMW = rawMfrr * scale;
    const reservedMW = fcrMW + afrrMW + mfrrMW;
    const arbMW = mw - reservedMW; // always ≥ min_arb_mw

    totalReserveMW += reservedMW;
    totalArbMW += arbMW;

    // --- Capacity revenue (15-min pro rata) ---
    const fcrPrice = drr_active ? (cap.fcr_sym || 0) : POST_DRR_FCR_PRICE_EUR_MW_H;
    const fcrCapRev = fcrMW * fcrPrice / 4;
    const afrrCapRev = afrrMW * (cap.afrr_up || 0) / 4;
    const mfrrCapRev = mfrrMW * (cap.mfrr_up || 0) / 4;
    const ispCapRev = fcrCapRev + afrrCapRev + mfrrCapRev;

    // --- Activation (balancing energy dispatch) ---
    const upActPrice = actPrice.up || 0;
    const isShort = (dir || 0) > 0;
    const afrrActMW = upActPrice > 0 && isShort ? afrrMW * 0.30 : 0;
    const mfrrActMW = upActPrice > 50 && isShort ? mfrrMW * 0.20 : 0;
    const ispActRev = (afrrActMW * upActPrice / 4) + (mfrrActMW * upActPrice / 4);

    // --- Arbitrage (DA spread, always has ≥min_arb_mw) ---
    const daPrice = daH[h] || 0;
    let arbRev = 0;
    let arbAction = 'hold';

    // Only buy energy the day's own shape can sell at a profit: 1 MWh bought
    // yields `rte` MWh sellable, so the trip clears when the discharge trigger
    // beats the purchase price after losses. Same-day, post-auction information
    // only — no foresight is added. Without this the policy charged in the
    // cheap quartile unconditionally and booked a guaranteed loss on every
    // low-spread day (on a perfectly flat day p25 == p75, so it charged in all
    // 96 ISPs). That is a modelling error, not conservatism, and it is the same
    // defect the hourly engine fixed in 36.B1-L.
    const roundTripClears = dischargeThreshold * rte > daPrice;

    if (arbMW > 0 && daPrice > 0) {
      if (daPrice <= chargeThreshold && soc < 0.85 && roundTripClears) {
        // Grid-side purchase. The round-trip loss is charged once, on the
        // charge leg: buying `maxCharge` MWh raises SoC by `maxCharge × rte`.
        // Before Phase 36.B batch-2 this credited SoC with the full purchased
        // energy while applying `rte` as a cap on discharge *power* instead, so
        // a full cycle bought 1 MWh and sold 1 MWh and the round-trip loss was
        // never charged at all. Same treatment as the canonical hourly engine
        // in tools/consultancy/lib/dispatch.mjs; the two are pinned to each
        // other by the mirror test in workers/__tests__/dispatchV2.test.ts.
        const maxCharge = Math.min(arbMW / 4, (0.90 - soc) * mwh / rte);
        if (maxCharge > 0) {
          soc += maxCharge * rte / mwh;
          arbRev = -maxCharge * daPrice;
          arbAction = 'charge';
          chargeISPs.push(i);
        }
      } else if (daPrice >= dischargeThreshold && soc > 0.15) {
        // Discharge delivers exactly what leaves SoC. RTE is deliberately NOT
        // applied again here — it was already charged on the way in.
        const maxDischarge = Math.min(arbMW / 4, (soc - 0.10) * mwh);
        if (maxDischarge > 0) {
          soc -= maxDischarge / mwh;
          arbRev = maxDischarge * daPrice;
          arbAction = 'discharge';
          dischargeISPs.push(i);
        }
      }
    }

    // SoC drain from activations
    const actDrainMWh = (afrrActMW + mfrrActMW) / 4;
    soc = Math.max(0.05, Math.min(0.95, soc - actDrainMWh / mwh));

    totalCapRev += ispCapRev;
    totalActRev += ispActRev;
    totalArbRev += arbRev;

    isps.push({
      isp: i,
      time: `${String(h).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
      da_price: t_r2(daPrice),
      reserves_mw: t_r1(reservedMW),
      arb_mw: t_r1(arbMW),
      soc: t_r3(soc),
      revenue: {
        capacity: t_r2(ispCapRev),
        activation: t_r2(ispActRev),
        arbitrage: t_r2(arbRev),
        total: t_r2(ispCapRev + ispActRev + arbRev),
      },
    });
  }

  const totalRev = totalCapRev + totalActRev + totalArbRev;

  // Hourly aggregation for display
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const slice = isps.filter(isp => Math.floor(isp.isp / 4) === h);
    hourly.push({
      hour: h,
      da_price_eur_mwh: t_r2(daH[h] || 0),
      revenue_eur: {
        capacity: t_r2(slice.reduce((s, p) => s + p.revenue.capacity, 0)),
        activation: t_r2(slice.reduce((s, p) => s + p.revenue.activation, 0)),
        arbitrage: t_r2(slice.reduce((s, p) => s + p.revenue.arbitrage, 0)),
        total: t_r2(slice.reduce((s, p) => s + p.revenue.total, 0)),
      },
      avg_soc_pct: t_r1(slice.reduce((s, p) => s + p.soc, 0) / (slice.length || 1) * 100),
    });
  }

  // Peak/off-peak
  const peakHours = hourly.filter(h => h.hour >= 17 && h.hour <= 20);
  const offPeakHours = hourly.filter(h => h.hour >= 1 && h.hour <= 5);
  const peakRev = peakHours.reduce((s, h) => s + h.revenue_eur.total, 0) / (peakHours.length || 1);
  const offPeakRev = offPeakHours.reduce((s, h) => s + h.revenue_eur.total, 0) / (offPeakHours.length || 1);

  // Activation rate
  const activatedISPs = isps.filter((_, i) => {
    const actP = btdData?.activation_prices?.[i];
    const dir = btdData?.direction?.[i];
    return (actP?.up || 0) > 0 && (dir || 0) > 0;
  });

  // DA capture (hourly)
  const daAvg = daH.length ? daH.reduce((a, b) => a + b, 0) / daH.length : 0;
  const daMin = daH.length ? Math.min(...daH) : 0;
  const daMax = daH.length ? Math.max(...daH) : 0;
  // Realised arbitrage capture — revenue per MWh ACTUALLY discharged.
  // `app/lib/captureDefinitions.ts:30-37` pins this field as concept 3,
  // "revenue per MWh discharged from the dispatch model's actual ISP-level
  // allocation". Two constructions published something else under that label.
  //
  // (1) The `totalArbRev > 0` guard routed every LOSING day to a THEORETICAL
  //     fallback, `(daMax - daMin) * rte * 0.5` — the day's raw price envelope,
  //     which is largest exactly when the shape is volatile enough that the
  //     model declined to trade it. So the field read most confidently on the
  //     days it had least to report. Rule #2 on a live field: the label
  //     asserted realised, the arithmetic produced theoretical, and nothing
  //     rendered marked the switch.
  // (2) `Math.max(0, …)` then floored a genuine loss to zero — the same floor
  //     `arbitrage_eur_day` (:1330-1339) removed for the same stated reason:
  //     "The honest number includes the losing days."
  //
  // A day with no discharge has no €/MWh-discharged. The quantity is 0/0, not
  // zero, so it publishes `null` and the renderer shows an empty state. A null
  // that renders honestly beats a number that renders confidently.
  const mwh_discharged = mw * (dischargeISPs.length / 4);
  const capture_hourly = mwh_discharged > 0 ? totalArbRev / mwh_discharged : null;
  const capture_15min = capture_hourly == null
    ? null
    : capture_hourly * (1 + RYSTAD_15MIN_UPLIFT_DECIMAL);

  // Cycles
  const socValues = isps.map(p => p.soc);
  const socMin = Math.min(...socValues);
  const socMax = Math.max(...socValues);
  const cycleEstimate = Math.max(0, (socMax - socMin) * mwh / mwh); // fraction of capacity swung

  return {
    meta: {
      mw_total: mw,
      dur_h,
      mwh_total: mwh,
      rte_decimal: rte,
      mode,
      drr_active,
      date_iso,
      as_of_iso: new Date().toISOString(),
      data_class: 'derived',
      sources: mode === 'forecast'
        ? ['KV:da_tomorrow', 'KV:s2_rolling_180d']
        : ['BTD:price_procured_reserves', 'BTD:balancing_energy_prices', 'ENTSOE:A44'],
    },
    revenue_per_mw: {
      daily_eur: t_r0(totalRev / mw),
      annual_eur: t_r0(totalRev / mw) * 365,
      capacity_eur_day: t_r0(totalCapRev / mw),
      activation_eur_day: t_r0(totalActRev / mw),
      // No floor at zero. A day whose price shape never covers the round trip
      // loses money on arbitrage, and clamping that to zero both overstated the
      // line and desynchronised it from `daily_eur` (which has always included
      // the negative). The honest number includes the losing days.
      arbitrage_eur_day: t_r0(totalArbRev / mw),
    },
    split_pct: totalRev > 0 ? {
      capacity: Math.round(totalCapRev / totalRev * 100),
      activation: Math.round(totalActRev / totalRev * 100),
      // Unclamped for the same reason: with the floor in place the three shares
      // summed to >100 % on any day with negative arbitrage.
      arbitrage: Math.round(totalArbRev / totalRev * 100),
    } : { capacity: 0, activation: 0, arbitrage: 0 },
    mw_allocation: {
      avg_reserves_mw: t_r1(totalReserveMW / 96),
      avg_arbitrage_mw: t_r1(totalArbMW / 96),
      max_reserve_mw: t_r1(max_reserve_mw),
      min_arb_mw: t_r1(min_arb_mw),
    },
    arbitrage_detail: {
      // `t_r2` cannot be applied blind: `Math.round(null * 100) / 100` is 0, so
      // rounding a null would reintroduce the confident zero this fix removes.
      capture_eur_mwh: capture_hourly == null ? null : t_r2(capture_hourly),
      capture_eur_mwh_15min_uplifted: capture_15min == null ? null : t_r2(capture_15min),
      uplift_factor_decimal: RYSTAD_15MIN_UPLIFT_DECIMAL,
      cycles_per_day_count: t_r2(cycleEstimate),
      charge_isp_count: chargeISPs.length,
      discharge_isp_count: dischargeISPs.length,
      // An unmeasured capture has no quality. `null >= 40` and `null >= 15` are
      // both false, so the old ternary would have graded "we did not trade" as
      // 'low' — a claim about the market made from the absence of a trade.
      capture_quality_label: capture_hourly == null
        ? null
        : capture_hourly >= 40 ? 'high' : capture_hourly >= 15 ? 'moderate' : 'low',
    },
    reserves_detail: {
      fcr_mw_avg: t_r1(drr_active ? 0 : (mw * 0.20 * RESERVE_MW_CAP_FRACTION)),
      afrr_mw_avg: t_r1(isps.reduce((s, p) => s + (p.reserves_mw * 0.4), 0) / 96), // approx
      mfrr_mw_avg: t_r1(isps.reduce((s, p) => s + (p.reserves_mw * 0.6), 0) / 96),
      activation_rate_pct: t_r1(activatedISPs.length / 96 * 100),
    },
    market_context: {
      peak_offpeak_ratio_decimal: t_r2(peakRev / (offPeakRev || 1)),
      da_avg_eur_mwh: t_r1(daAvg),
      da_min_eur_mwh: t_r1(daMin),
      da_max_eur_mwh: t_r1(daMax),
    },
    soc_dynamics: {
      soc_min_pct: t_r1(socMin * 100),
      soc_max_pct: t_r1(socMax * 100),
      soc_avg_pct: t_r1(socValues.reduce((a, b) => a + b, 0) / socValues.length * 100),
    },
    drr_note: {
      derogation_expires_iso: '2028-02',
      extension_possible_iso: '2030-02',
      post_drr_fcr_price_eur_mw_h: POST_DRR_FCR_PRICE_EUR_MW_H,
    },
    hourly_dispatch: hourly,
    isp_dispatch: isps,
  };
}

// Synthesize a BTD-like payload from rolling 180d averages (for forecast mode)
export function synthesizeBTDFromRolling(rolling, daTomorrow) {
  if (!rolling?.products) return null;
  const afrr = rolling.products.aFRR || rolling.products.afrr || {};
  const mfrr = rolling.products.mFRR || rolling.products.mfrr || {};
  const fcr = rolling.products.FCR || rolling.products.fcr || {};

  // Build 96-ISP arrays with rolling averages (flat shape)
  const capacity_prices = Array.from({ length: 96 }, () => ({
    fcr_sym: fcr.cap_avg || 0,
    afrr_up: afrr.cap_avg || 0,
    mfrr_up: mfrr.cap_avg || 0,
  }));
  // Phase 36.D — from the canonical module. The comments were right about the
  // provenance ("Baltic mFRR demand") and wrong about the vintage: these are
  // the 2026 row of a series published to 2035.
  const _procured = productDemandMap(new Date().getUTCFullYear());
  const procured_mw = Array.from({ length: 96 }, () => ({
    fcr_sym: _procured.fcr,
    afrr_up: _procured.afrr,
    mfrr_up: _procured.mfrr,
  }));
  // Activation shape: higher during high-DA-price ISPs.
  //
  // Phase 36.C — this indexing was `daP[Math.floor(i / 4)]`, which assumes daP
  // is a 24-slot HOURLY array. Day-ahead is now published at PT15M, so daP
  // carries ~96 slots and `Math.floor(i / 4)` only ever reaches index 23 — the
  // first six hours of the day, stretched across all 96 ISPs. Every activation
  // and direction decision would be made from the wrong part of the day, with
  // the evening peak that drives BESS revenue never seen at all.
  //
  // It was latent until now only because `prices_24h` was never populated (the
  // B0-G defect), so this function never ran with real prices. Fixing the
  // plumbing without fixing this would have shipped a forecast that serves
  // confidently and is wrong — worse than one that returns null.
  //
  // Proportional mapping handles every cadence, including DST-short/long days
  // and partially-published windows (93 slots is a real observed length), and
  // needs no branch per resolution.
  const daP = daTomorrow?.prices_24h || daTomorrow?.lt_prices || [];
  const daMax = daP.length ? Math.max(...daP) : 100;
  const priceAtISP = (i) => {
    if (!daP.length) return 50;
    const idx = Math.min(daP.length - 1, Math.floor(i * daP.length / 96));
    return daP[idx] ?? 50;
  };
  const activation_prices = Array.from({ length: 96 }, (_, i) => {
    const p = priceAtISP(i);
    return { up: p > daMax * 0.6 ? (afrr.act_avg || 170) : 0, down: 0 };
  });
  const direction = Array.from({ length: 96 }, (_, i) => {
    const p = priceAtISP(i);
    return p > daMax * 0.5 ? 1 : -1; // short when high price
  });

  return {
    date: daTomorrow?.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    capacity_prices,
    procured_mw,
    activation_prices,
    direction,
  };
}

// ─── Revenue Engine v6 — OEM degradation, scenarios, CFADS ────────────────────

// OEM degradation curves — PowerCombo LFP 300MWh system
// Values: fraction of BOL usable energy at MV transformer (AC, incl aux)
// Source: OEM datasheet, 1 cycle/day and 2 cycles/day at 0.5C
const DEGRAD_1C = [1, .958, .936, .915, .896, .880, .865, .851, .838, .825, .813, .800, .788, .769, .660, .638];
const DEGRAD_2C = [1, .929, .900, .872, .845, .819, .795, .773, .751, .731, .712, .692, .673, .653, .608, .582];

function getDegradation(year, cyclesPerDay) {
  const w2 = Math.min(1, Math.max(0, (cyclesPerDay - 1)));
  const w1 = 1 - w2;
  function curveVal(curve, yr) {
    if (yr >= curve.length) {
      const last = curve[curve.length - 1];
      const prev = curve[curve.length - 2];
      const rate = 1 - (last / prev);
      return Math.max(0.40, last * Math.pow(1 - rate, yr - curve.length + 1));
    }
    if (Number.isInteger(yr)) return curve[yr];
    const lo = Math.floor(yr), hi = Math.ceil(yr);
    return curve[lo] + (curve[hi] - curve[lo]) * (yr - lo);
  }
  return w1 * curveVal(DEGRAD_1C, year) + w2 * curveVal(DEGRAD_2C, year);
}

// Trading realisation: perfect-foresight discount on S1 sort-and-dispatch capture.
//
// Phase 36.B batch-3 — MEASURED, not assumed. The 36.B3 backtest ran the B1
// greedy policy day-by-day over realised LT day-ahead prices 2025-07-01 →
// 2026-06-30 with day-ahead information only, and divided its capture by the
// perfect-foresight sort-and-dispatch capture on the same days and the same
// asset — the exact construct this constant discounts. 349 traded days (16
// declined by the round-trip guard, excluded not zeroed), volume-weighted
// 0.7234, simple mean 0.7321, daily min 0.187 / p25 0.628 / median 0.756 /
// p75 0.849 / max 0.997, monthly volume-weighted 0.6535 (2025-09) to 0.8155
// (2026-05). Three look-ahead checks clean: no day beats perfect foresight,
// headline below the 0.90 tripwire, realisation-vs-day-quality r = −0.093.
//
// It measures the DAY-AHEAD component only: intraday execution, bid rejection,
// imbalance exposure and balancing forecast error are all outside it, and
// reserve realisation stays unmeasured (BTD is the sole Baltic reserve-price
// source and its deepest series is 110 daily points). Remeasure annually.
//
// The ladder below keeps its shipped 5pp steps and is re-anchored on the
// measurement rather than re-invented; the resulting values land near the
// measured daily distribution's own p25 (0.628), so the ladder stays empirical
// at every rung. See DECISIONS 36.B0-J.
const TRADING_REALISATION = {
  base: 0.7234,        // MEASURED — KKME dispatch backtest 2025-07→2026-06, 349 traded days
  conservative: 0.6734, // −5pp on the measurement, the shipped ladder step
  stress: 0.6234,      // −10pp; ≈ the measured daily p25 (0.628)
  // Phase 35.1 client scenario sets — see CLIENT_SCENARIO_DRIVERS below.
  // Re-anchored on the measurement's own monthly extremes rather than on a
  // spread around the old assumption.
  client_downside: 0.6535, // measured monthly minimum, 2025-09
  client_upside: 0.8155,   // measured monthly maximum, 2026-05
};

// Pipeline realisation rate: fraction of pipeline MW that actually gets built.
// Narrowed range: conservative is "somewhat more builds" not "everything builds".
const PIPELINE_REALISATION = {
  base: 0.50,          // 50% of pipeline built — typical dropout
  conservative: 0.53,  // 53% — slightly more competition
  stress: 0.62,        // 62% — strong competition
  // Phase 35.1 client scenario sets. Direction is inverted versus intuition:
  // a HIGHER realisation rate means more competing supply, so the client's
  // Downside carries the higher value. See CLIENT_SCENARIO_DRIVERS below.
  client_downside: 0.65,
  client_upside: 0.35,
};

// Pipeline deployment speed (years from 2026).
const PIPELINE_DEPLOY_YEARS = 4;

// Spread growth rates: more renewables = more intermittency = wider spreads.
// German evidence: DA spreads INCREASED despite 1.5 GW BESS deployment.
const SPREAD_GROWTH = {
  base: 0.02,          // spreads grow 2%/yr (more renewables)
  conservative: 0.00,  // flat (BESS smoothing offsets renewable growth)
  stress: -0.01,       // slight compression (large BESS fleet smooths)
  // Phase 35.1 client scenario sets. Documented zero-effect driver: it reaches
  // its engine site correctly but the only revenue path it feeds
  // (trading_fraction) is pinned at its 0.70 ceiling. See 34.4-C / DECISIONS.
  client_downside: -0.01,
  client_upside: 0.035,
};

// Intraday uplift: real operators trade DA + intraday auction + continuous.
// Modo Energy: 35% uplift from intraday vs DA-only. 1.25 = conservative.
const INTRADAY_UPLIFT = 1.0; // disabled — S1 capture already at 15-min ISP resolution

// LEGACY — kept for deriveCompression consumers that still read comp_mult
const COMPRESSION_SCENARIO_MULT = {
  base: 1.0, conservative: 2.0, stress: 3.5
};

// v7.3 — Two-track parameterization for activation:
//
//  (1) act_rate_{afrr,mfrr} are RETAINED as activation-revenue calibration
//      constants. They are tuned to match BTD-observed activation revenue
//      and feed the activation-revenue formulas in computeRevenueV6,
//      computeBaseYear, computeLiveRate, computeTradingMix, and the
//      backtest path. Treating them strictly as "in-merit fraction × 8760"
//      is dimensionally loose, but the constant is calibrated against
//      observed market revenue, so removing it would un-calibrate
//      bal_calibration → cascade-drop forward rev_bal. Preserved.
//
//  (2) mwh_per_mw_yr_{fcr,afrr,mfrr} + mwh_per_mw_yr_da_{2h,4h} are NEW
//      per-product throughput anchors used for cycle-accounting
//      (total_efcs_yr / total_cd / warranty_status) AND for the trading-
//      revenue energy budget (replacing dur_h × cycles_{2h,4h} × 365).
//      DA arbitrage uses per-duration anchors (the original single
//      `mwh_per_mw_yr_da` + dur_scale_da=dur_h/2 formula was anchored on
//      the EU portfolio mean rather than the active-trader median, which
//      asymmetrically cut 2h trading throughput by 36% — see HALTED.md
//      diagnosis from the prior CC run). Per-duration anchors mirror
//      v7.2's existing cycles_{2h,4h} × duration × 365 calibration so
//      trading throughput stays at v7.2 levels; the SOH steepening alone
//      produces the empirical IRR drop, which is the intended physics.
//      Anchored on Baltic 2h merchant-battery research from Modo /
//      Dexter / GEM / enspired (2025-Q3-Q4 publications):
//
//   FCR (incl SoC restoration around the deadband) — Modo cycling research +
//     MDPI 2023 multi-service lifetime study (M5BAT 0.278 EFC/d, 84% participation):
//       https://www.mdpi.com/1996-1073/16/7/3003
//       https://modoenergy.com/research/en/battery-energy-storage-cycling-rates-value-wholesale-frequency-response
//   aFRR symmetric (PICASSO 4-sec resolution; in-merit × depth ~5-8% of
//     nameplate hours/yr for active assets):
//       https://modoenergy.com/research/en/germany-september-2025-afrr-explained-ancillary-services-opportunity-grid-frequency-service
//       https://gemenergyanalytics.substack.com/p/picasso-insights-and-data
//   mFRR (MARI 12.5-min, Baltic marginal user — Iberia is the heavy MARI market):
//       https://dexterenergy.ai/news/mari-implementation-across-european-tsos/
//   DA + ID arbitrage — Modo cycling research; enspired EU portfolio (mean
//     0.86 c/d, p90 1.03 for active traders); active-trader median uplift:
//       https://www.enspired-trading.com/blog/dimensions-of-a-battery
//
// The legacy cycles_{2h,4h} parameters remain on the scenario object only as
// a fallback for the non-engine `computeRevenueWorker` quick-comparison path.
// They are no longer the source of truth for cycles_per_year (now derived
// from throughput) or for cell-wear curves (now interpolated by total_cd).
const REVENUE_SCENARIOS = {
  base: {
    real_factor: 0.90, trd_real: TRADING_REALISATION.base, bal_mult: 1.0, spread_mult: 1.0,
    act_rate_afrr: 0.25, act_rate_mfrr: 0.10,  // calibration constants for activation revenue
    mwh_per_mw_yr_fcr:  200,   // cycle-accounting + trading-energy throughput
    mwh_per_mw_yr_afrr: 475,
    mwh_per_mw_yr_mfrr: 125,
    mwh_per_mw_yr_da_2h: 1100, // 1.5 c/d × 2 MWh × 365 ≈ 1095 — matches v7.2 cycles_2h=1.5 active-trader calibration
    mwh_per_mw_yr_da_4h: 1500, // 1.03 c/d × 4 MWh × 365 ≈ 1500 — v7.2 cycles_4h=1.0 + slight 4h spread-capture uplift
    bal_compress_yr: 0.03, spread_compress_yr: 0.02,
    rtm_fee_pct: 0.10, brp_fee_yr: 180000,
    opex_per_kw_yr: 39, opex_esc: 0.025,
    debt_margin_bp: 250, aug_cost_pct: 0.12, aug_restore: 0.90,
    avail: 0.97, cycles_2h: 1.5, cycles_4h: 1.0, stack_factor: 0.70,
  },
  conservative: {
    // Each parameter ~5-10% worse than base. Compounding of small drags = 3-5pp IRR gap.
    real_factor: 0.88, trd_real: TRADING_REALISATION.conservative, bal_mult: 0.95, spread_mult: 0.95,
    act_rate_afrr: 0.22, act_rate_mfrr: 0.09,
    mwh_per_mw_yr_fcr:  170,   // ~85% of base
    mwh_per_mw_yr_afrr: 380,   // ~80% of base — lower utilization rate
    mwh_per_mw_yr_mfrr: 100,
    mwh_per_mw_yr_da_2h: 1000, // 1.4 c/d × 2 MWh × 365 ≈ 1022 — matches v7.2 cycles_2h=1.4
    mwh_per_mw_yr_da_4h: 1400, // 0.95 c/d × 4 MWh × 365 ≈ 1387 — matches v7.2 cycles_4h=0.95
    bal_compress_yr: 0.035, spread_compress_yr: 0.025,
    rtm_fee_pct: 0.11, brp_fee_yr: 185000,
    opex_per_kw_yr: 40, opex_esc: 0.026,
    debt_margin_bp: 270, aug_cost_pct: 0.12, aug_restore: 0.88,
    avail: 0.96, cycles_2h: 1.4, cycles_4h: 0.95, stack_factor: 0.65,
    demand_growth: 0.02,  // same as base — demand is structural
  },
  stress: {
    // ~20% worse than base across parameters. Tests: everything goes wrong.
    real_factor: 0.78, trd_real: TRADING_REALISATION.stress, bal_mult: 0.85, spread_mult: 0.85,
    act_rate_afrr: 0.19, act_rate_mfrr: 0.07,
    mwh_per_mw_yr_fcr:  140,   // ~70%
    mwh_per_mw_yr_afrr: 285,   // ~60%
    mwh_per_mw_yr_mfrr:  75,
    mwh_per_mw_yr_da_2h:  800, // 1.1 c/d × 2 MWh × 365 ≈ 803 — matches v7.2 cycles_2h=1.1
    mwh_per_mw_yr_da_4h: 1240, // 0.85 c/d × 4 MWh × 365 ≈ 1241 — matches v7.2 cycles_4h=0.85
    bal_compress_yr: 0.05, spread_compress_yr: 0.04,
    rtm_fee_pct: 0.13, brp_fee_yr: 210000,
    opex_per_kw_yr: 43, opex_esc: 0.032,
    debt_margin_bp: 320, aug_cost_pct: 0.14, aug_restore: 0.83,
    avail: 0.94, cycles_2h: 1.1, cycles_4h: 0.85, stack_factor: 0.55,
    demand_growth: 0.015,
  },
};

// ── Phase 35.1 — client scenario sets (Downside / Upside) ───────────────────
//
// Phase 34.4 locked six client-facing scenario drivers. Every one of them is a
// module constant selected by scenario NAME, so batch-2 could only reach them
// from Node by substituting the worker's own source text
// (tools/consultancy/scenario-overlay.mjs). That is unusable inside the running
// worker, which is what /calculate needs. This ports the two non-Central sets
// into the engine as named scenarios alongside base/conservative/stress.
//
// Central is NOT ported: the client's Central driver values ARE the engine's
// shipped base constants, so Central ≡ base by construction. A vitest asserts
// that identity rather than trusting it.
//
// Four of the six drivers land on scenario-keyed tables and are ported by
// adding a key (TRADING_REALISATION, PIPELINE_REALISATION, SPREAD_GROWTH, and
// `avail` here). The remaining two — reserve capacity price delta and the
// cannibalisation-index floor — are not scenario-keyed in the engine, so they
// are carried in CLIENT_SCENARIO_DRIVERS below and threaded to their sites.
//
// Two of the six move no money and are ported anyway, because reporting a
// driver the client named as "not implemented" is worse than reporting it as
// measured-zero: spread_growth is pinned behind the 0.70 trading_fraction
// ceiling, and the CPI floor feeds disclosure fields only. Both findings are
// batch-2's, re-stated here at the constants they set (DECISIONS 34.4-C).
//
// Derived from base by spread so that every constant these sets do NOT change
// keeps exactly one source (discipline rule #4).
REVENUE_SCENARIOS.client_downside = {
  ...REVENUE_SCENARIOS.base,
  avail: 0.95,
  trd_real: TRADING_REALISATION.client_downside,
};
REVENUE_SCENARIOS.client_upside = {
  ...REVENUE_SCENARIOS.base,
  avail: 0.98,
  trd_real: TRADING_REALISATION.client_upside,
};

/**
 * The two drivers with no scenario-keyed home in the engine.
 *
 * `cap_price_mult` multiplies the resolved reserve capacity price BEFORE the
 * €50/MW/h structural ceiling, matching where the 34.4 overlay applied it.
 * `cpi_floor` re-floors the cannibalisation curve.
 *
 * base / conservative / stress carry the engine's shipped values (×1.0 and the
 * built-in 0.30 floor), so every pre-35.1 code path multiplies by exactly 1 and
 * floors at exactly the literal it already used — the public /revenue payload
 * is unchanged by construction, not by testing.
 */
const CPI_FLOOR_BUILTIN = 0.30;
const CLIENT_SCENARIO_DRIVERS = {
  base:            { cap_price_mult: 1.0,  cpi_floor: CPI_FLOOR_BUILTIN },
  conservative:    { cap_price_mult: 1.0,  cpi_floor: CPI_FLOOR_BUILTIN },
  stress:          { cap_price_mult: 1.0,  cpi_floor: CPI_FLOOR_BUILTIN },
  client_downside: { cap_price_mult: 0.75, cpi_floor: 0.28 },
  client_upside:   { cap_price_mult: 1.20, cpi_floor: 0.35 },
};
const scenarioDrivers = (name) => CLIENT_SCENARIO_DRIVERS[name] || CLIENT_SCENARIO_DRIVERS.base;

// The client-case → engine-scenario mapping lives in workers/lib/calculator.js
// (CLIENT_SCENARIO_KEYS), which is the only consumer. One source (rule #4).
const CLIENT_SCENARIO_NAMES = new Set(['client_downside', 'client_upside']);

// Throughput-derived cycle accounting — cross-product helper.
// Returns total_mwh_yr and per-product MWh through the cells per MW installed.
// DA arbitrage uses per-duration anchors (mwh_per_mw_yr_da_{2h,4h}) that
// mirror v7.2's cycles_{2h,4h} × duration × 365 calibration. Balancing
// products are service-window-bound and do not scale with duration.
// Allocation fractions match RESERVE_PRODUCTS (FCR 0.16, aFRR 0.34,
// mFRR 0.50) so cycle accounting tracks the same MW allocation the
// revenue formulas use; DA uses full nameplate.
/**
 * @param {object} opts
 * @param {number} [opts.da_utilisation=1] Fraction of the day-ahead throughput
 *   ANCHOR the asset actually trades — the reserve commitment takes the rest.
 * @param {number} [opts.availability=1] Forced-outage + maintenance haircut.
 *
 * Phase 36.B5. The anchor `mwh_per_mw_yr_da_{2h,4h}` is what a merchant asset
 * cycles trading full time. The revenue path never billed that: it bills
 * `anchor × trading_fraction × avail`, because the asset is simultaneously
 * holding reserve MW. Cycle accounting used the bare anchor, so the engine aged
 * the battery for ~43 % more day-ahead energy than it earned on (36.B1-O).
 *
 * With both options supplied, `total_mwh_yr` / `total_efcs_yr` / `total_cd` are
 * DELIVERED throughput — energy that actually moved through the cells — so
 * every consumer reads one figure and none of them re-applies availability.
 * Both default to 1, so a caller that supplies neither gets the unchanged
 * nameplate-anchor behaviour.
 */
function computeThroughputBreakdown(MW, dur_h, sc, opts = {}) {
  const da_utilisation = opts.da_utilisation ?? 1;
  const availability   = opts.availability ?? 1;

  const fcr_alloc_MW   = MW * 0.16;  // RESERVE_PRODUCTS.fcr.share
  const afrr_alloc_MW  = MW * 0.34;  // RESERVE_PRODUCTS.afrr.share
  const mfrr_alloc_MW  = MW * 0.50;  // RESERVE_PRODUCTS.mfrr.share

  const fcr_mwh   = fcr_alloc_MW  * sc.mwh_per_mw_yr_fcr  * availability;
  const afrr_mwh  = afrr_alloc_MW * sc.mwh_per_mw_yr_afrr * availability;
  const mfrr_mwh  = mfrr_alloc_MW * sc.mwh_per_mw_yr_mfrr * availability;
  const da_anchor_mwh = MW        * durBlend(dur_h, sc.mwh_per_mw_yr_da_2h, sc.mwh_per_mw_yr_da_4h);
  const da_mwh    = da_anchor_mwh * da_utilisation * availability;

  const total_mwh_yr = fcr_mwh + afrr_mwh + mfrr_mwh + da_mwh;
  const capacity_mwh = MW * dur_h;
  const total_efcs_yr = capacity_mwh > 0 ? total_mwh_yr / capacity_mwh : 0;
  const total_cd      = total_efcs_yr / 365;

  return {
    fcr_mwh, afrr_mwh, mfrr_mwh, da_mwh,
    // Both figures are reported so the gap between what the asset COULD cycle
    // and what it is modelled as cycling is visible rather than implicit.
    da_anchor_mwh, da_utilisation, availability,
    total_mwh_yr, capacity_mwh,
    fcr_efcs:  capacity_mwh > 0 ? fcr_mwh  / capacity_mwh : 0,
    afrr_efcs: capacity_mwh > 0 ? afrr_mwh / capacity_mwh : 0,
    mfrr_efcs: capacity_mwh > 0 ? mfrr_mwh / capacity_mwh : 0,
    da_efcs:   capacity_mwh > 0 ? da_mwh   / capacity_mwh : 0,
    total_efcs_yr,
    total_cd,
  };
}

// Warranty status indicator: base manufacturer warranty cap 730 EFC/yr.
function warrantyStatusFor(total_efcs_yr) {
  if (total_efcs_yr <= 730) return 'within';
  return 'exceeds-base-warranty';
}

// ── Phase 38.8: route-to-market and BRP cost stack ─────────────────────────
//
// The engine's fee assumptions were authored from market hearsay. These replace
// them with either a publicly-cited figure or a stated band. Sources and the
// full source position: docs/research/route-to-market-cost-stack-sources.md.
//
// NOTHING HERE COMES FROM ANY COMMERCIAL AGREEMENT. Where a line has no public
// source it is a band, and the base case sits at the band's CONSERVATIVE end —
// this correction moves IRR up, and a flattering correction does not also get
// the benefit of the doubt.
const COST_STACK = {
  // Optimiser / route-to-market service fee, applied to the OWNER'S NET SHARE
  // AFTER exchange fees — not to gross. Banded 0.04-0.08; base at the top.
  // No public source exists: bilaterally negotiated. Source line for the
  // register: "commercial terms observed in Baltic optimiser agreements".
  service_fee_pct: 0.08,
  service_fee_band: [0.04, 0.08],

  // Nord Pool variable fees, day-ahead: 0.040 trading + 0.015 clearing.
  // Source: Nord Pool AS Fee Schedule, Nordic/Baltic, effective 2026-01-01,
  // section 1.4. Charged per MWh TRADED, so a storage asset pays on BOTH legs.
  power_market_charge_eur_mwh: 0.055,

  // TSO balancing-capacity fee, per MWh, charged on consumed AND produced
  // energy — so a storage asset pays it twice per round trip.
  //
  // JURISDICTION GAP, DECLARED: 3.73 EUR/MWh excl. VAT is ELERING'S (Estonia)
  // published tariff effective 2026-01-01, corroborated by a licensed supplier's
  // customer notice and a second independent report; the primary page sits behind
  // bot protection and could not be read directly. NO EQUIVALENT LITGRID FIGURE
  // HAS BEEN LOCATED, and every asset the engine prices is Lithuanian. Carried at
  // the Estonian rate because that is the conservative choice (it is a cost), and
  // flagged for confirmation with the Lithuanian TSO. Whether a storage asset is
  // charged on both legs of its own round trip is ALSO unconfirmed — no source
  // mentions storage. Both legs assumed, again because it is conservative.
  balancing_capacity_fee_eur_mwh: 3.73,
  balancing_capacity_fee_band: [0, 3.73],

  // Standby auxiliary load, as a fraction of nameplate MW, drawn during IDLE
  // hours only.
  //
  // RTE_BOL is measured at the point of interconnection INCLUDING auxiliaries,
  // so cycle-driven auxiliary consumption is ALREADY inside the round-trip
  // efficiency. Modelling published operating aux figures (8-13 kW per 5 MWh
  // container) as a share of throughput would charge the same electrons twice —
  // which is exactly why that construction collided with the literature's ~10%
  // RTE-error figure at 12-20% of throughput. Only the INCREMENTAL standby load
  // RTE cannot see belongs here.
  //
  // The standby/active split is NOT sourced to a datasheet. The band is bounded
  // above by the published operating band (standby cannot exceed average
  // operating load) and is a stated assumption pending one.
  standby_load_pct_of_nameplate_mw: 0.003,
  standby_load_band: [0.001, 0.003],

  // One-off integration / API onboarding charge, CAPEX-class. Banded, low tens
  // of thousands; base at the conservative end. No public source.
  integration_fee_eur: 40000,
  integration_fee_band: [20000, 50000],
};

const RESERVE_PRODUCTS = {
  fcr:  { share: 0.16, dur_req_h: 0.5, cap_fallback: 45 },
  afrr: { share: 0.34, dur_req_h: 1.0, cap_fallback: 40 },
  mfrr: { share: 0.50, dur_req_h: 0.25, cap_fallback: 22 },
};

// ── Phase 33: bounded capacity-price single-source ──────────────────────────
// Capacity-reservation prices, €/MW/h. When the dedicated S2 *_cap_avg field is
// absent (source gap — Litgrid "ordered capacity" page emptied; capacity moved
// into BTD and not yet re-parsed), fall back to these conservative Baltic-
// calibrated constants — NEVER to an aFRR/mFRR activation price (*_up_avg,
// €/MWh), which conflates energy with capacity and 3×'d the published IRR.
// The ceiling clamp catches any future source pushing a structurally impossible
// value (>50 €/MW/h ≈ >€438k/MW/yr capacity-only) and logs the clip so it can
// be investigated rather than silently shipped. Single source for every site
// that derives a capacity price (Phase 32.1 single-source pattern).
//
// Phase 33.B (empirical correction to Phase 33's framing) — BTD DOES carry Baltic
// capacity-reservation prices, and the Mac-cron parser (kkme-cron/fetch-btd.js →
// /s2/update → s2ShapePayload) ALREADY extracts them: `price_procured_reserves`
// cols 10-14 land in s2.{fcr_avg, afrr_up_avg, afrr_down_avg, mfrr_up_avg,
// mfrr_down_avg} — these are directional capacity €/MW/h, NOT activation €/MWh.
// (Phase 33's "activation/capacity conflation" diagnosis was off; the real gap is
// that the engine reads s2.*_cap_avg, which NO parser path ever produces → this
// fallback is always active.) We deliberately do NOT remap *_up_avg → *_cap_avg
// yet: post-CE-synchronisation those values run 2-177× these calibrated constants
// (live ~2026-06: afrr_up 72.7 / mfrr_up 38.9 / fcr 63.7 vs 7.06 / 19.74 / 0.36;
// FCR especially is anomalous, not a real sustainable FCR capacity price). Wiring
// them in unreviewed would re-introduce exactly the silent IRR swing Phase 33's
// bound exists to prevent. Calibrated constants stay canonical until the operator
// signs off on the post-sync directional-capacity basis — one coherent review of
// all three products at 2026-06-29 (Phase 33.B.2). The [revenue/s2-capacity-watch]
// log (flagOutOfBandS2Capacity) surfaces the live values meanwhile; Phase 33.B.3
// persists them to KV so 33.B.2 can reason about persistence vs transient spikes.
const CAP_PRICE_FALLBACK = { fcr: 0.36, afrr: 7.06, mfrr: 19.74 }; // €/MW/h
const CAP_PRICE_CEIL = 50; // €/MW/h — structural per-product ceiling (Phase 33)
// `mult` (Phase 35.1) is the client scenario's reserve capacity price delta. It
// is applied BEFORE the structural ceiling, which is where the 34.4 overlay
// applied it, so a ported scenario clears at the same price the overlay
// produced. It defaults to 1 and every pre-35.1 caller leaves it defaulted, so
// those paths compute `v * 1` — exactly `v` for every finite value.
//
// The `const v = …` line below is also the overlay's substitution anchor and
// must stay byte-identical; the multiplier is deliberately a separate statement
// rather than folded into it.
function capPrice(product, observed, mult = 1) {
  const v = (observed != null && Number.isFinite(observed)) ? observed : CAP_PRICE_FALLBACK[product];
  const scaled = v * mult;
  const clamped = Math.min(CAP_PRICE_CEIL, Math.max(0, scaled));
  if (clamped !== scaled) console.log(`[revenue/cap-clip] ${product} ${scaled}→${clamped} €/MW/h (Phase 33 ceiling)`);
  return clamped;
}

/**
 * Assemble the `kv` object the revenue engine reads, from the KV namespace.
 *
 * Phase 35.1 — extracted verbatim from the /revenue route so that /calculate
 * runs the engine on identically-sourced inputs. This is the single place the
 * engine's KV dependencies are named; anything that needs to drive
 * computeRevenueV7 from a request should call this rather than re-listing keys.
 *
 * Side-effect free: the capacity-watch logging and KV persistence stay on
 * /revenue, where they belong (they track the public payload's data quality,
 * and mirroring them here would multiply KV writes per calculator run).
 */
async function loadEngineKV(env) {
  const [s1Raw, s2Raw, s3Raw, fleetRaw, eurRaw, s1CaptureRaw, s2ActivationRaw, btdHistRaw, tradingMetricsRaw] = await Promise.all([
    env.KKME_SIGNALS.get('s1'),
    env.KKME_SIGNALS.get('s2'),
    env.KKME_SIGNALS.get('s3'),
    (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
      .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
    env.KKME_SIGNALS.get('euribor'),
    env.KKME_SIGNALS.get('s1_capture').catch(() => null),
    env.KKME_SIGNALS.get('s2_activation').catch(() => null),
    env.KKME_SIGNALS.get('s2_btd_history').catch(() => null),
    env.KKME_SIGNALS.get('trading:metrics').catch(() => null),
  ]);
  const s1    = s1Raw    ? JSON.parse(s1Raw)    : null;
  const s2    = s2Raw    ? JSON.parse(s2Raw)    : null;
  const s3    = s3Raw    ? JSON.parse(s3Raw)    : null;
  const fleet = fleetRaw ? JSON.parse(fleetRaw) : null;
  const eur   = eurRaw   ? JSON.parse(eurRaw)   : null;

  // Parse S1 capture (monthly capture data)
  const s1_capture = s1CaptureRaw ? JSON.parse(s1CaptureRaw) : null;

  // Parse S2 activation into the shape v7 expects
  let s2_activation_parsed = null;
  if (s2ActivationRaw) {
    try {
      const actRaw = JSON.parse(s2ActivationRaw);
      const lt = actRaw.countries?.Lithuania;
      const lv = actRaw.countries?.Latvia;
      const ee = actRaw.countries?.Estonia;
      s2_activation_parsed = {
        lt: {
          afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
          mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
        },
        lv: {
          afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
          mfrr_p50: lv?.mfrr_recent_3m?.avg_p50 ?? null,
        },
        ee: {
          afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
          mfrr_p50: ee?.mfrr_recent_3m?.avg_p50 ?? null,
        },
        lt_monthly_afrr: lt?.afrr_up ?? {},
        lt_monthly_mfrr: lt?.mfrr_up ?? {},
        lv_monthly_afrr: lv?.afrr_up ?? {},
        lv_monthly_mfrr: lv?.mfrr_up ?? {},
        ee_monthly_afrr: ee?.afrr_up ?? {},
        ee_monthly_mfrr: ee?.mfrr_up ?? {},
        compression: actRaw.compression_trajectory ?? null,
      };
    } catch { /* ignore */ }
  }

  // Parse BTD history for capacity monthly
  let capacity_monthly = [];
  if (btdHistRaw) {
    try { capacity_monthly = computeCapacityMonthly(JSON.parse(btdHistRaw)); } catch { /* ignore */ }
  }

  // Parse dispatch metrics for reserve availability
  let dispatch_metrics = null;
  if (tradingMetricsRaw) {
    try { dispatch_metrics = JSON.parse(tradingMetricsRaw); } catch { /* ignore */ }
  }

  return { fleet, s2, s1, s3, euribor: eur, s1_capture, s2_activation_parsed, capacity_monthly, dispatch_metrics };
}

// Phase 33 observability: when the dedicated S2 capacity prices (*_cap_avg) are
// absent, the engine runs on the fallback constants. Surface the S2 energy /
// legacy values that the pre-Phase-33 conflation would have (wrongly) used as
// capacity, flagging any above the structural ceiling — so a genuine market
// shift (e.g. FCR sustaining €50-60/MW/h post-synchronisation) shows up in logs
// rather than silently re-inflating revenue. Goes quiet once *_cap_avg returns
// and the watched values are back in band.
function flagOutOfBandS2Capacity(s2) {
  if (!s2) return;
  const absent = ['afrr_cap_avg', 'mfrr_cap_avg', 'fcr_cap_avg'].filter((k) => s2[k] == null);
  if (!absent.length) return;
  const watch = ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg']
    .map((k) => `${k}=${s2[k] ?? '—'}${(s2[k] != null && s2[k] > CAP_PRICE_CEIL) ? '⚠' : ''}`)
    .join(' ');
  console.log(`[revenue/s2-capacity-watch] *_cap_avg absent [${absent.join(',')}] → fallback constants in use; S2 energy/legacy values (NOT used for capacity): ${watch}`);
}

// Phase 33.B.3 — KV-persisted capacity-watch, feeding the 2026-06-29 capacity-
// basis review (33.B.2). The s2 KV is refreshed by the Mac cron every 4h (~6
// snapshots/day), so we accumulate per *distinct s2 snapshot* (deduped by
// s2.timestamp), NOT per /revenue call — `samples` then counts real data points,
// and KV writes stay ~6/day instead of one per request. Up- AND down-direction
// tracked: 33.B.2 needs to decide whether the engine's symmetric *_cap should
// read *_up_avg or a blend of up+down.
const CAPACITY_WATCH_FIELDS = ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg', 'afrr_down_avg', 'mfrr_down_avg'];

// Pure accumulator (no Date/Math.random — nowIso passed in for testability).
// Returns the SAME `prev` reference when the snapshot is already recorded today,
// so the caller can skip the KV write via `next === prev`.
function accumulateCapacityWatch(prev, s2, nowIso) {
  const date = nowIso.slice(0, 10);
  const s2ts = (s2 && s2.timestamp) || null;
  if (prev && prev.date === date && prev.last_s2_timestamp === s2ts) return prev; // dedup → no write
  const next = (prev && prev.date === date)
    ? { ...prev }
    : { date, first_seen_at: nowIso, last_seen_at: nowIso, last_s2_timestamp: null,
        samples: 0, clip_events_count: 0,
        prices_source: 'BTD parsed; calibrated capacity (review pending)' };
  next.last_seen_at = nowIso;
  next.last_s2_timestamp = s2ts;
  next.samples += 1;
  let anyClip = false;
  for (const k of CAPACITY_WATCH_FIELDS) {
    const v = s2 ? s2[k] : null;
    if (v == null || !Number.isFinite(v)) { if (!(k in next)) next[k] = null; continue; }
    const pb = (next[k] && typeof next[k] === 'object') ? next[k] : null;
    const b = pb ? { ...pb } : { min: v, max: v, last: v, n: 0, above_50_count: 0, above_50_pct: 0 };
    b.min = Math.min(b.min, v); b.max = Math.max(b.max, v); b.last = v; b.n += 1;
    if (v > CAP_PRICE_CEIL) { b.above_50_count += 1; anyClip = true; }
    b.above_50_pct = Math.round((b.above_50_count / b.n) * 1000) / 10;
    next[k] = b;
  }
  if (anyClip) next.clip_events_count += 1;
  return next;
}

// Async wrapper: read today's summary, accumulate, write back (30-day TTL).
// Invoked via ctx.waitUntil so it never adds latency to /revenue. Parallel calls
// within the same day can race on read-modify-write; per the design this is
// acceptable (a few-sample min/max/last drift doesn't affect trend reasoning),
// and the snapshot-dedup keeps the racing window to the first writes of each
// new s2 snapshot only. Non-fatal on any error.
async function persistCapacityWatch(env, s2) {
  try {
    if (!s2) return;
    const nowIso = new Date().toISOString();
    const key = 's2_capacity_watch:' + nowIso.slice(0, 10);
    const prevRaw = await env.KKME_SIGNALS.get(key).catch(() => null);
    const prev = prevRaw ? JSON.parse(prevRaw) : null;
    const next = accumulateCapacityWatch(prev, s2, nowIso);
    if (next === prev) return; // snapshot already recorded → skip write
    await env.KKME_SIGNALS.put(key, JSON.stringify(next), { expirationTtl: 30 * 86400 });
  } catch (e) {
    console.error('[capacity-watch/persist]', e);
  }
}

/**
 * Cash tax for one operating year, with the depreciation shield and an interest
 * deduction. Extracted in Phase 39 so the debt-sizing solver can evaluate CFADS
 * at ITS OWN interest path — which is the whole point of sizing debt from cash
 * flows — without a second copy of the tax rule living outside the engine
 * (discipline rule #4). The engine loop calls this too, so there is exactly one
 * implementation and it is this one. Passing interest = 0 gives the unlevered
 * charge the project-IRR stream uses.
 */
function cashTaxFor(ebitda, depr, interest, tax_rate) {
  return Math.max(0, ebitda - depr - interest) * tax_rate;
}

/**
 * ─── IRR, with converged distinguished from bounded ───────────────────────────
 *
 * Phase 49 item 2. The previous implementation bisected inside a bracket it had
 * not established contained a root, and returned the midpoint unconditionally.
 * When no root was in the bracket the bisection walked to whichever end it had
 * started from and **returned that bound as a value**:
 *
 *   calcIRR([-100, 10000, 10000]) -> 2        published as a 200 % return
 *   calcIRR([100, 10, 10])        -> 2        a stream with no IRR at all
 *   calcIRR([-100, 0, 0, 0])      -> -0.99    a total loss
 *
 * That is the numerical analogue of catching an exception and returning a
 * default: no error is raised, a plausible number is published, and nothing
 * downstream can tell it apart from a solve. It was not hypothetical. Every one
 * of the 47 configurations that `/revenue` labelled `irr_status: 'uneconomic'`
 * on the v6 fallback path was this: `-0.99` escaping and then being laundered
 * into `null` by a `< -0.50` sentinel, with NPV at that "root" of −1.2e46.
 * "Uneconomic" did not mean the project was uneconomic. It meant the solver
 * gave up. Measured against `bee9c9d`; pre-state in
 * `docs/investigations/2026-08-04-phase-49-prestate.json`.
 *
 * The fix is one precondition. Bisection is only valid when its bracket
 * STRADDLES a sign change; assert that before iterating, and return null with a
 * reason when it does not. The post-check on |NPV(root)| is a second,
 * independent assertion rather than a restatement of the first (B13): the
 * bracket test is about the input, the residual test is about the output, and a
 * defect would have to defeat both.
 *
 * @param {number[]} cf cash flows, t = 0..n
 * @returns {{
 *   value: number|null,
 *   reason: 'converged'|'no_sign_change'|'undefined_non_conventional'|'not_converged',
 *   npv_at_root: number|null,
 *   bound: 'above_domain'|'below_domain'|null,
 * }}
 */
function solveIRR(cf) {
  const fail = (reason) => ({ value: null, reason, npv_at_root: null, bound: null });
  if (!Array.isArray(cf) || cf.length < 2) return fail('no_sign_change');
  if (cf.some((c) => !Number.isFinite(c))) return fail('not_converged');

  function npvAt(rate) {
    return cf.reduce((s, c, t) => s + c / Math.pow(1 + rate, t), 0);
  }

  // Descartes' bound on the number of positive roots. Zero sign changes means
  // no IRR EXISTS — a distinct fact from "one exists and we failed to find it",
  // and the two must not arrive wearing the same label.
  let signChanges = 0;
  let lastSign = 0;
  for (const c of cf) {
    if (c === 0) continue;
    const s = Math.sign(c);
    if (lastSign !== 0 && s !== lastSign) signChanges++;
    lastSign = s;
  }
  if (signChanges === 0) return fail('no_sign_change');

  // ── Enumerate the roots in the domain, instead of assuming there is one ─────
  //
  // The domain is bounded at [−99.99 %, +200 %] deliberately. A project-finance
  // IRR outside that range is not a return, it is a broken input, and converging
  // to it would publish 10 000 % — the same defect one bound further out. Outside
  // the domain is null with a reason, per the approved contract: null at both
  // edges, never a bracket value.
  //
  // The old code scanned a hand-written rate list, took the first crossing, and
  // said in its comment that BESS streams typically show two — one artifact
  // crossing at very negative rates plus the meaningful one. **Measured across
  // all 54 public configurations, that is false:** every project stream has
  // exactly one sign change and exactly one NPV crossing over the whole domain,
  // and every equity stream has exactly one crossing (24 of them from a stream
  // with three sign changes). So enumerating is safe, and picking-the-first was
  // hiding a real ambiguity behind a convention.
  //
  // Stated limit, because a guard that overstates itself is worse than none: a
  // uniform scan detects root pairs separated by more than one step (0.005 in
  // rate). A closer pair is not detected. This finds ambiguity; it does not
  // prove uniqueness.
  const DOMAIN_LO = -0.9999;
  const DOMAIN_HI = 2.0;
  const SCAN_STEPS = 600;
  const brackets = [];
  let rPrev = DOMAIN_LO;
  let vPrev = npvAt(DOMAIN_LO);
  for (let i = 1; i <= SCAN_STEPS; i++) {
    const r = DOMAIN_LO + ((DOMAIN_HI - DOMAIN_LO) * i) / SCAN_STEPS;
    const v = npvAt(r);
    if (Number.isFinite(v) && Number.isFinite(vPrev) && vPrev !== 0 && (vPrev > 0) !== (v > 0)) {
      brackets.push([rPrev, r, vPrev > 0]);
    }
    rPrev = r;
    vPrev = v;
  }

  if (brackets.length === 0) {
    // No root in the domain. Which edge it ran off is diagnostic, not a value.
    const bound = npvAt(DOMAIN_HI) > 0 ? 'above_domain'
      : npvAt(DOMAIN_LO) <= 0 ? 'below_domain' : null;
    return { ...fail(signChanges >= 2 ? 'undefined_non_conventional' : 'not_converged'), bound };
  }
  if (brackets.length > 1) {
    // Genuinely multi-valued. There is no such thing as "the" IRR here, and
    // returning one of them with no indication there were others is the same
    // class of lie as returning a bracket bound.
    return fail('undefined_non_conventional');
  }

  const [lo, hi, descending] = brackets[0];
  const bound = null;
  let a = lo, b = hi;
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    const v = npvAt(mid);
    if (descending ? v > 0 : v <= 0) a = mid; else b = mid;
  }
  const root = (a + b) / 2;

  // Second, independent assertion: a root is where NPV is zero. Scaled by the
  // stream's own magnitude so it means the same thing for a €12 M project and a
  // €100 toy. A bisection that ran its full count inside a straddling bracket
  // cannot fail this — which is the point: if it ever does, the bracket test was
  // lying and the failure is visible instead of published.
  const scale = cf.reduce((s, c) => s + Math.abs(c), 0) || 1;
  const residual = npvAt(root);
  if (!Number.isFinite(residual) || Math.abs(residual) > 1e-6 * scale) {
    return { ...fail(signChanges >= 2 ? 'undefined_non_conventional' : 'not_converged'), bound };
  }

  return {
    value: Math.round(root * 10000) / 10000,
    reason: 'converged',
    npv_at_root: residual,
    bound: null,
  };
}

/**
 * The converged rate, or null when there is not one.
 *
 * Null here means ONE thing — undefined, per the Phase 49 contract — and never
 * "a very bad project". A converged −60 % publishes as −0.6; a solver that could
 * not converge publishes null and says why via `solveIRR().reason`.
 */
function calcIRR(cf) {
  return solveIRR(cf).value;
}

/**
 * `irr_status`, derived from the SOLVE rather than from the number alone.
 *
 * The distinction this exists to preserve: `'uneconomic'` is a claim about the
 * project and may only be made when a root was actually found. When the solver
 * did not converge the status says so, in the solver's own words, and no reader
 * is invited to mistake a failed solve for a bad investment.
 *
 * Thresholds for converged values are UNCHANGED from the pre-49 engine
 * (−0.50 / 0.06 / 0.12) so no public configuration moves. Whether a converged
 * −30 % should really read `below_hurdle` is a live question, raised in the
 * Phase 49 CP and deliberately not answered here.
 */
function irrStatusFor(solve) {
  if (solve.value === null) return solve.reason;
  return solve.value < -0.50 ? 'uneconomic'
    : solve.value < 0.06 ? 'below_hurdle'
    : solve.value < 0.12 ? 'marginal'
    : 'investable';
}

/**
 * ─── The shape `/revenue` promises, and the fallbacks that were not keeping it ─
 *
 * Phase 49 item 3, class guard. `computeRevenueV7` has three exits: the primary
 * path and two v6 fallbacks (insufficient base-year history, and v7 throwing).
 * Measured against `bee9c9d`: the primary payload carries 78 top-level keys and
 * the fallback carried **59** — 19 keys simply absent, among them `moic`,
 * `lcos_eur_mwh`, `debt_sizing`, `warranty_status`, `cycles_breakdown` and
 * `assumptions_panel`. Every consumer that reads one of those got `undefined`
 * from a 200 response, on a path exercised rarely and reviewed never.
 *
 * The fix is not to compute them in v6 — v6 genuinely cannot, and inventing
 * them would be the worse defect. It is to DECLARE them, as null, which is the
 * same contract the IRR null now carries: null means "not available", and a
 * caller can tell that apart from a key that was never in the schema.
 *
 * `degraded` is the provenance record beside it. B12's first rule is that the
 * absence of provenance must be an error state rather than an innocent one, so
 * a fallback payload says out loud that it is one, which engine produced it and
 * what that cost — instead of looking exactly like a healthy response.
 *
 * The key list is asserted against a live v7 payload in `fallbackShape.test.ts`,
 * so adding a field to v7 without adding it here fails a test rather than
 * quietly re-opening the gap (A9 — a hardcoded list that nobody re-derives is a
 * stale record waiting to happen).
 */
const REVENUE_PAYLOAD_KEYS = [
  'activation_pct', 'activation_y1', 'annual_debt_service', 'arbitrage_pct', 'arbitrage_y1',
  'assumptions', 'assumptions_panel', 'bankability', 'base_year', 'capacity_pct', 'capacity_y1',
  'capex_eur_kwh', 'capex_kwh', 'capex_net', 'capex_scenario', 'capex_total', 'ch_benchmark',
  'cod_year', 'cpi_afrr_at_cod', 'cpi_at_cod', 'cpi_fcr_at_cod', 'cpi_mfrr_at_cod',
  'crossover_year', 'cycles_breakdown', 'cycles_per_year', 'debt_initial', 'debt_sizing',
  'duration', 'ebitda_y1', 'engine_calibration_source', 'engine_changelog', 'equity_initial',
  'equity_irr', 'fleet_context', 'fleet_trajectory', 'forward', 'grant_amount', 'grant_label',
  'gross_capex', 'gross_revenue_y1', 'irr_status', 'lcos_eur_mwh', 'min_dscr',
  'min_dscr_conservative', 'model_version', 'moic', 'monthly_y1', 'net_capex', 'net_mw_yr',
  'net_rev_per_mw_yr', 'net_revenue_y1', 'npv_at_wacc', 'npv_project', 'opex_y1',
  'payback_years', 'per_product_at_cod', 'phase', 'prices_source', 'project_irr', 'rate_allin',
  'reconciliation', 'revenue_crossover_note', 'revenue_crossover_year', 'roundtrip_efficiency',
  'roundtrip_efficiency_curve', 'rtm_fees_y1', 'scenario', 'sd_ratio', 'signal_inputs',
  'simple_payback_years', 'system', 'timestamp', 'total_debt', 'total_equity', 'trajectory',
  'warranty_status', 'worst_month_dscr', 'years',
];

/**
 * Give a fallback payload the primary payload's shape, and say that it is one.
 * @param {object} result the v6 payload
 * @param {string} reason why the fallback fired, in plain words
 */
function conformToPublicShape(result, reason) {
  const missing = REVENUE_PAYLOAD_KEYS.filter((k) => !(k in result));
  for (const k of missing) result[k] = null;
  result.degraded = {
    engine: result.model_version,
    reason,
    fields_unavailable: missing,
  };
  return result;
}

/**
 * computeRevenueV7: observed base year as Year 1 foundation, derived compression.
 *
 * Uses the same DCF/financing/DSCR/IRR machinery as v6 but replaces the
 * revenue computation: Y1 = observed trailing 12m annualised revenue,
 * Years 2-20 = Y1 × compression × degradation.
 *
 * Falls back to v6 if base year data is insufficient.
 */
function computeRevenueV7(params, kv) {
  // ── Phase 34.1 — per-project parameterisation ─────────────────────────────
  // `params.project_config` is the consultancy seam: an optional project config
  // (tools/consultancy/projects/*.json) that supplies system geometry, COD and
  // partial-year handling for a client asset. When it is ABSENT the engine runs
  // exactly the pre-34.1 code path — which is what the public /revenue route
  // does, so the public site is unaffected by construction, not by testing.
  // When present it is the single source for those quantities (rule #4), and
  // the result gains one extra top-level `project` key.
  const pcfg = params.project_config || null;
  const mw = pcfg ? pcfg.mw : (params.mw || 50);
  const dur_h = pcfg ? (pcfg.duration_h ?? pcfg.mwh / pcfg.mw) : (params.dur_h || 4);
  const mwh = mw * dur_h;
  const sc_scenario = REVENUE_SCENARIOS[params.scenario || 'base'] || REVENUE_SCENARIOS.base;
  const capex_kwh = pcfg ? pcfg.capex_eur_kwh : (params.capex_kwh || 164);
  const cod_year = pcfg ? pcfg.cod_year : (params.cod_year || 2028);

  // ── Phase 35.1 — client scenario context ───────────────────────────────────
  //
  // Two of the six client drivers (capacity price delta, CPI floor) are GLOBAL
  // in the engine, not scenario-keyed: the 34.4 overlay reached them by
  // rewriting capPrice() and cpiCurve(), which every scenario then read. The
  // observed base year is global in the same way — the overlay rewrote
  // REVENUE_SCENARIOS.base, which is the object computeBaseYear is handed.
  //
  // So a client scenario is not just a name in REVENUE_SCENARIOS; it is a
  // context that has to survive the internal `scenario: 'conservative'` re-run
  // below (the bankability DSCR probe), exactly as the overlay's substitutions
  // did. `client_scenario` carries it. It is derived from the scenario name on
  // first entry and passed explicitly into the re-run.
  //
  // Null for base / conservative / stress, where it resolves to ×1.0, the
  // built-in 0.30 floor and REVENUE_SCENARIOS.base — i.e. today's behaviour.
  const client_scenario = params.client_scenario
    ?? (CLIENT_SCENARIO_NAMES.has(params.scenario) ? params.scenario : null);
  const base_year_scenario = client_scenario || 'base';

  // `driver_overrides` is the sensitivity runner's one-at-a-time probe: a
  // single named driver moved off its scenario value, everything else left
  // alone. Absent on every other call, including all of /revenue, so `drv` is
  // then exactly the scenario's own set.
  //
  // `avail` and `trd_real` are scenario-object fields rather than free-standing
  // constants, so they are applied to `sc` instead of riding in `drv`.
  const overrides = params.driver_overrides || null;
  const scenario_drv = scenarioDrivers(client_scenario || params.scenario || 'base');
  const drv = overrides ? { ...scenario_drv, ...overrides } : scenario_drv;
  // Applied to whichever scenario object is in play. The overlay patched
  // REVENUE_SCENARIOS.base, so it moved the run scenario AND the base-year
  // context together; applying to both here reproduces that.
  const applyScOverrides = (base) =>
    (overrides && (overrides.avail != null || overrides.trd_real != null))
      ? {
          ...base,
          ...(overrides.avail != null ? { avail: overrides.avail } : {}),
          ...(overrides.trd_real != null ? { trd_real: overrides.trd_real } : {}),
        }
      : base;
  const sc = applyScOverrides(sc_scenario);
  // Sensitivity-only driver (34.4 §3). Undefined on every non-sensitivity call,
  // so rteCurveFor falls back to its shipped constant. Global in the same way,
  // so it rides through the re-run on `...params`.
  const rte_decay = params.rte_decay;

  // ── Phase 38.6a: the MW partition is now the DEFAULT (operator-signed) ─────
  //
  // DEFAULT IS 'partition'. The engine no longer books day-ahead arbitrage on
  // megawatts already committed to the TSO. Signed on the 38.6 measurement:
  // gross Y1 -20.6 % median, project IRR -7.0 pp median, cycles/yr -63.8 %.
  //
  //   'current'   pre-38.6a behaviour. Retained so the old basis stays
  //               reproducible for comparison; NOT reachable from /revenue.
  //   'unit_fix'  only the dimensional error: the DA energy seams stop
  //               multiplying an MWh quantity by a share derived in EUR/EUR.
  //   'partition' unit_fix, plus the day-ahead term the energy identity was
  //               missing. Every financial metric is identical to 'unit_fix'
  //               (the reservoir constraint does not bind at 2h or 4h); what it
  //               adds is a well-formed identity and its diagnostic fields.
  //
  // Why 'partition' and not 'unit_fix' when the instruction was "ship the unit
  // fix": the two produce IDENTICAL financial metrics in all 54 public
  // configurations, so this ships exactly the signed numbers, and it does so
  // without leaving the energy identity in the half-written state the 38.6
  // prompt warned against ("fix the unit error as part of the partition, not
  // before it"). One word changes it if the literal mode was intended.
  const MW_PARTITION_DEFAULT = 'partition';
  const MW_PARTITION_MODES = new Set(['current', 'unit_fix', 'partition']);
  const mw_partition = MW_PARTITION_MODES.has(params.mw_partition)
    ? params.mw_partition : MW_PARTITION_DEFAULT;
  const partition_on = mw_partition !== 'current';

  // The physical MW-hour share available to day-ahead arbitrage after the
  // reserve commitments take theirs. This is NOT new maths: it is
  // `computeEffectiveArbPct` (:3602), which the engine has always computed and
  // published as `time_model.effective_arb_pct` (≈0.115) while the revenue path
  // spent `trading_fraction` (pinned at 0.70) on the same megawatt-hours.
  //
  // Held flat across projection years, matching how `trading_fraction` is
  // itself pinned at its ceiling in every year of every public configuration
  // (34.4-C). `computeEffectiveArbPctForYear` exists for a year-varying
  // version but its `reserve_shift` argument has no defined source anywhere in
  // the file — it has never been called — so using it would mean inventing the
  // parameter, not reading one. Recorded as a gap, not filled by guess.
  const physical_arb_share = computeEffectiveArbPct(kv, sc);
  // ── Phase 38.8: the cost stack, behind a flag defaulting to CURRENT ────────
  //
  // DEFAULT IS EVERY LAYER ON (Phase 38.8a, operator-signed). The stack it
  // replaces was authored from market hearsay; this one is contracted structure
  // with a Nord Pool primary source, a corroborated TSO tariff and two declared
  // bands. Leaving a better-evidenced stack switched off is its own wrong number.
  //
  // `'current'` remains reachable so the pre-38.8a basis stays reproducible for
  // comparison. `/revenue` does not read this from the query string.
  //
  // The five defects are INDEPENDENT TOGGLES, not one switch, so each one's
  // contribution to the delta is measurable on its own rather than arriving
  // blended. `cost_stack: 'all'` turns on every layer.
  //
  //   fee_rate  the service-fee percentage replaces rtm_fee_pct's 0.10-0.13
  //   fee_base  that percentage applies to the owner's net share after exchange
  //             fees, instead of to gross
  //   brp       the invented flat annual platform fee goes; a volume-based
  //             TSO balancing-capacity fee takes its place, inside the pool
  //   pmc       Nord Pool variable fees, on both legs
  //   aux       standby auxiliary load during idle hours
  const CS_LAYERS = ['fee_rate', 'fee_base', 'brp', 'pmc', 'aux'];
  const COST_STACK_DEFAULT = CS_LAYERS;  // 38.8a — the flip
  const cs_raw = params.cost_stack;
  const cs_on = (() => {
    if (cs_raw === 'all') return new Set(CS_LAYERS);
    if (cs_raw === 'current') return new Set();
    // An array selects exactly those layers — but only if at least one name is
    // real. An array of typos falls through to the default rather than silently
    // restoring the pre-38.8a numbers, which is the failure mode that matters:
    // the old basis must never be reachable by accident, only by asking for it.
    if (Array.isArray(cs_raw)) {
      const picked = cs_raw.filter(x => CS_LAYERS.includes(x));
      if (picked.length) return new Set(picked);
      return new Set(COST_STACK_DEFAULT);
    }
    if (typeof cs_raw === 'string' && CS_LAYERS.includes(cs_raw)) return new Set([cs_raw]);
    return new Set(COST_STACK_DEFAULT);
  })();
  const cs = (layer) => cs_on.has(layer);


  // Partial operating year 1 (e.g. Stoniškiai COD 2028-06 → 7 months). Scales
  // Y1 revenue and OPEX linearly. Fixed annual fees (BRP) and the degradation
  // curve are deliberately NOT pro-rated — both readings are conservative
  // (lower net revenue, faster ageing). See DECISIONS.md A4.
  const op_frac_y1 = pcfg ? (pcfg.operational_months_y1 ?? 12) / 12 : 1;

  // Throughput-derived cycle accounting (per MW installed). total_cd is the
  // computed actual cycling rate (cycles/day) summed across all stacked
  // products — fed to getDegradation so cell aging tracks real operation
  // rather than a duration-label assumption (sc.cycles_{2h,4h} is now legacy).
  //
  // Phase 36.B5 — ONE day-ahead throughput figure, not two. The anchor
  // `mwh_per_mw_yr_da_{2h,4h}` is full-time merchant cycling; the revenue path
  // has always billed `anchor × trading_fraction × avail` because the asset is
  // simultaneously holding reserve MW. Cycle accounting used the bare anchor, so
  // the engine charged cell wear for ~43 % more day-ahead energy than it earned
  // on (36.B1-O). Both sides now read the SAME delivered throughput.
  //
  // The utilisation is taken from operating year 1 and held for life, because
  // `total_cd` is itself a lifetime scalar fed to the degradation curve — a
  // year-varying wear rate would be a different model, not a consistency fix.
  // `trading_fraction` is pinned at its 0.70 ceiling in every year of every
  // project at current market state (34.4-C), so Y1 is not a special case; if
  // the ceiling ever stops binding, this becomes the Y1 approximation it is
  // described as, and the residual is reported in `cycles_breakdown`.
  //
  // Phase 38.6: `da_utilisation` is a PHYSICAL quantity — the fraction of the
  // day-ahead throughput anchor the asset actually cycles. Under the partition
  // it is sourced from the MW-hour allocation instead of the EUR/EUR price
  // ratio. This is the same substitution as the two revenue seams below and
  // must move with them, or cycle accounting and revenue would disagree about
  // how much energy the asset moved — which is the misalignment 36.B1-O fixed.
  const da_utilisation = Math.min(1, Math.max(0, partition_on
    ? physical_arb_share
    : computeTradingMix(kv, dur_h, cod_year + 1, params.scenario || 'base', sc, 1, drv)
      .trading_fraction));
  const tp = computeThroughputBreakdown(1, dur_h, sc,
    { da_utilisation, availability: sc.avail });
  const total_cd     = tp.total_cd;
  // The REVENUE base stays the full anchor: the year loop applies
  // `trading_fraction × avail × deg_ratio × op_frac` itself, per year, and
  // pre-multiplying here would double-count the very factor being aligned.
  const da_mwh_per_mw_yr = tp.da_anchor_mwh; // for 1 MW: MWh/yr from DA arbitrage
  const rte_curve    = rteCurveFor(dur_h, undefined, rte_decay);  // year-indexed RTE curve
  const rte          = rte_curve[0];        // BOL value used by single-value consumers

  // ── Observed base year (always computed with base params — observed data is scenario-independent) ──
  // Phase 35.1: "base params" stays REVENUE_SCENARIOS.base for the three public
  // scenarios. Under a client scenario it is that scenario's set, because the
  // overlay rewrote REVENUE_SCENARIOS.base itself — see client_scenario above.
  const base_year_sc = applyScOverrides(REVENUE_SCENARIOS[base_year_scenario] || REVENUE_SCENARIOS.base);
  const base_year = computeBaseYear(kv, dur_h, base_year_sc, base_year_scenario, rte_decay, drv);
  const compression = deriveCompression(kv);

  // Gate: need at least 6 months of S1 data to use v7
  if (base_year.data_coverage.s1_months < 6) {
    const v6_result = computeRevenueV6(params, kv);
    v6_result.model_version = 'v6_fallback';
    v6_result.base_year = base_year;
    v6_result.forward = { compression_rate: compression.rate, compression_source: compression.source };
    return conformToPublicShape(v6_result, `s1_capture history covers ${base_year.data_coverage.s1_months} full months; v7 needs 6`);
  }

  // ── Base year revenue per MW (annual, from observed data) ──
  const by_trading_per_mw  = base_year.annual_totals.trading;   // €/MW/yr
  const by_balancing_per_mw = base_year.annual_totals.balancing; // €/MW/yr

  // ── Financing setup (same as v6) ──
  const euribor = ((kv?.euribor?.euribor_nominal_3m ?? kv?.s3?.euribor_nominal_3m) || 2.01) / 100;
  const rate_allin = euribor + sc.debt_margin_bp / 10000;
  const grant_pct = params.grant_pct || 0;
  const gross_capex_total = capex_kwh * mwh * 1000;
  const capex_net_total = gross_capex_total * (1 - grant_pct);
  const debt_pct = 0.55;
  const debt_initial = Math.round(capex_net_total * debt_pct);
  const equity_initial = capex_net_total - debt_initial;
  const tenor = 8;
  const grace = 1;
  const tax_rate = 0.17;
  const depr_years = 10;
  const pmt = debt_initial * rate_allin / (1 - Math.pow(1 + rate_allin, -tenor));

  // Scenario compression: multiplicative on observed rate.
  // Base = 1× observed, conservative = 2× (fleet growth doubles compression),
  // stress = 3.5× (full pipeline realisation).
  const scenario_name = params.scenario || 'base';
  const comp_mult = COMPRESSION_SCENARIO_MULT[scenario_name] || 1.0;
  const effective_compression = Math.min(0.25, compression.rate * comp_mult);

  // ── 20-year timeseries ──
  const years = [];
  // Phase 34.2 — arbitrage energy volumes, collected only on the consultancy
  // path. The client bridge needs an explicit charging-cost line, and the
  // charged/discharged MWh behind the trading revenue live only inside this
  // loop. Emitting them here keeps the volumes derived from the engine's own
  // arithmetic instead of re-deriving them downstream (discipline rule #4).
  const arb_energy = pcfg ? [] : null;
  let debt_bal = debt_initial;
  let min_dscr = Infinity;
  let crossover_year = null;
  let revenue_crossover_year = null;
  for (let yr = 1; yr <= 20; yr++) {
    // Partial-year factor: 1 for every year except a partial Y1 (see above).
    // Exactly 1 on the public path, so every product below is bit-identical.
    const yr_op_frac = yr === 1 ? op_frac_y1 : 1;

    // C1. Degradation — keyed off throughput-derived total_cd, not duration label.
    const retention = getDegradation(yr, total_cd);
    let usable_mwh_per_mw = dur_h * retention;

    // C2. Augmentation at year 10
    let aug_capex = 0;
    if (yr === 10) {
      const pre_aug = dur_h * retention;
      const target = dur_h * sc.aug_restore;
      const added = Math.max(0, target - pre_aug);
      aug_capex = added * sc.aug_cost_pct * capex_kwh * 1000 * mw;
      usable_mwh_per_mw = Math.min(target, pre_aug + added);
    }
    if (yr > 10) {
      const ret_at_10 = getDegradation(10, total_cd);
      const target_10 = dur_h * sc.aug_restore;
      const restored = Math.min(target_10, dur_h * ret_at_10 + Math.max(0, target_10 - dur_h * ret_at_10));
      usable_mwh_per_mw = restored * (retention / ret_at_10);
    }

    // C3. Energy stacking constraint (same as v6)
    const p_avail = sc.avail;
    const products = {};
    let total_energy_req = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      const raw = p_avail * prod.share;
      total_energy_req += raw * prod.dur_req_h;
      products[name] = { raw };
    }
    // Phase 38.6. The DA term was absent, so this "energy stacking constraint"
    // measured the reserve stack against the whole reservoir and could never
    // bind: reserves need 0.518 MWh/MW (0.95 x [0.16x0.5 + 0.34x1.0 +
    // 0.50x0.25]) against ~3.6 usable for a 4h asset, so `scale_energy` has
    // been pinned at 1.0 for every public configuration since it was written.
    // Day-ahead arbitrage draws on the SAME reservoir — one duration-worth per
    // cycle for the MW it holds — so its requirement belongs in the same sum.
    // Gated on the FULL partition, not on `partition_on`. Gating this on
    // `partition_on` made 'unit_fix' carry the energy term too, so the two
    // modes were never actually separated and the three-column measurement was
    // comparing a mode against itself. Caught after the measurement was
    // reported; the corrected run is in the 38.6a commit body.
    const reserve_energy_req = total_energy_req;
    const da_energy_req = mw_partition === 'partition'
      ? p_avail * physical_arb_share * dur_h : 0;
    total_energy_req += da_energy_req;
    const scale_energy = Math.min(1.0, usable_mwh_per_mw / total_energy_req);
    for (const [name] of Object.entries(RESERVE_PRODUCTS)) {
      products[name].eff = products[name].raw * scale_energy;
    }

    // C4. S/D elasticity mix model: R from reserve price curve, T from renewable trajectory
    const cal_year = cod_year + yr;
    const mix = computeTradingMix(kv, dur_h, cal_year, scenario_name, sc, yr, drv);

    // Compress: R decay for balancing calibration, R+T for reporting
    const mix_now = computeTradingMix(kv, dur_h, 2026, scenario_name, sc, 0, drv);
    const RT_now = mix_now.R + mix_now.T;
    const RT_yr = mix.R + mix.T;
    const compress_total = RT_now > 0 ? RT_yr / RT_now : 1.0;
    const R_yr = mix.R;

    // C5. Degradation effect on trading
    const deg_ratio_vs_y1 = retention / getDegradation(1, total_cd);

    // C6. Revenue: balancing from R elasticity, trading from capture × MWh
    const bal_scale = scale_energy / Math.min(1.0, (dur_h * getDegradation(1, total_cd)) / total_energy_req);

    // Balancing: split into capacity (follows R) and activation (additional S/D compression)
    const R_now = mix_now.R;
    const bal_calibration = by_balancing_per_mw > 0 && R_now > 0 ? by_balancing_per_mw / R_now : 1;
    // R elasticity already compresses activation (included in R_base derivation)
    const rev_bal = R_yr * bal_calibration * mw * Math.min(1.0, bal_scale) * yr_op_frac;

    // Trading: capture × RTE × realisation × MWh × fraction × depth discount
    // Use rolling 30d mean (stable) for forward projection, not spot capture
    const s1_cap = kv.s1_capture || {};
    const yr_capture = durBlend(dur_h,
      s1_cap.rolling_30d?.stats_2h?.mean ?? s1_cap.capture_2h?.gross_eur_mwh ?? 140,
      s1_cap.rolling_30d?.stats_4h?.mean ?? s1_cap.capture_4h?.gross_eur_mwh ?? 125);
    const trading_real = sc.trd_real || 0.85;
    const rte_yr = rte_curve[Math.min(yr - 1, rte_curve.length - 1)];
    const depth = marketDepthFactor(mix.sd_ratio);
    // Capture grows with renewable-driven spread widening (same multiplier as T)
    const spread_mult = mix.spread_mult || 1.0;
    // Throughput-derived DA arbitrage energy: da_mwh_per_mw_yr is the annual MWh
    // through the cells from DA arbitrage per MW installed. Replaces the legacy
    // `dur_h × cycles × 365` (which assumed cycles_2h/4h scenario constants).
    // This is per-product DA throughput, not total throughput — capture × MWh
    // formula is for arbitrage specifically.
    // THE SEAM. `da_mwh_per_mw_yr` is MWh/MW/yr. `mix.trading_fraction` is
    // `min(0.70, T/(T+R) x 0.75)` where T and R are both EUR per MW-hour of
    // VALUE (:3536, :3560) — so the share is dimensionless EUR/EUR, and it is
    // spent here as MWh/MWh. Under the partition it is replaced by the MW-hour
    // share the engine already computes for exactly this purpose.
    const arb_share_yr = partition_on ? physical_arb_share : mix.trading_fraction;
    const rev_trd = yr_capture * spread_mult * depth * rte_yr * trading_real
                  * da_mwh_per_mw_yr
                  * arb_share_yr * sc.avail * deg_ratio_vs_y1 * mw * yr_op_frac;

    if (arb_energy) {
      // Same factor chain as rev_trd above, minus the price terms: MWh through
      // the cells from DA arbitrage. Discharged = charged × RTE.
      const mwh_charged = da_mwh_per_mw_yr * arb_share_yr * sc.avail
                        * deg_ratio_vs_y1 * mw * yr_op_frac;
      arb_energy.push({
        yr, cal_year,
        mwh_charged: Math.round(mwh_charged),
        mwh_discharged: Math.round(mwh_charged * rte_yr),
        rte: Math.round(rte_yr * 10000) / 10000,
      });
    }

    // C7. Gross → Net
    // Revenue floor: even in saturated markets, BESS earns from trading + minimum FCR
    // UK FFR at peak saturation: £40-60k/MW/yr. €50k = realistic floor.
    const REVENUE_FLOOR_PER_MW = 50000; // €50k/MW/yr minimum
    let rev_gross = Math.max(REVENUE_FLOOR_PER_MW * mw * yr_op_frac, rev_bal + rev_trd);

    // ── Phase 39: contracted-floor hook ───────────────────────────────────
    //
    // Debt sizing at a contracted share (39 §4) needs the floor applied BEFORE
    // fees, opex, tax and CFADS, so the whole downstream stack is computed by
    // the engine's own arithmetic rather than restated outside it (rule #4).
    //
    // The contract MATHS is not duplicated here. `contract_fn` is a closure the
    // consultancy path builds from `tools/consultancy/lib/contracted.mjs`, which
    // stays the single implementation of `contractYear` — the alternative, a
    // second copy of the floor formula living in the worker, is exactly the
    // one-canonical-writer violation rule #4 exists to prevent.
    //
    // Absent on every public path, so no public configuration reaches this
    // branch and the 54-config payload is unchanged.
    if (typeof params.contract_fn === 'function') {
      const adj = params.contract_fn({
        yr, mw, rev_gross, operational_months: op_frac_y1 * 12,
      });
      if (!(typeof adj === 'number' && Number.isFinite(adj) && adj >= 0)) {
        throw new Error(`contract_fn returned a non-finite revenue for year ${yr}: ${adj}`);
      }
      rev_gross = adj;
    }
    // ── Phase 38.8: route-to-market and BRP cost stack ────────────────────
    //
    // Layered so each defect's contribution is separable. With every layer off
    // this is byte-identical to the pre-38.8 arithmetic.
    //
    // Energy through the meter, both directions. `arb_energy` carries the
    // day-ahead legs; reserve activation moves energy too but is not exchange-
    // traded, so it attracts no Nord Pool fee. The TSO balancing-capacity fee
    // is levied on metered consumption AND production, so it sees both.
    const da_mwh_charged = da_mwh_per_mw_yr * arb_share_yr * sc.avail
                         * deg_ratio_vs_y1 * mw * yr_op_frac;
    const da_mwh_discharged = da_mwh_charged * rte_yr;
    const metered_mwh = da_mwh_charged + da_mwh_discharged;

    // Nord Pool variable fees — day-ahead trading + clearing, per MWh traded.
    const pmc_fee = cs('pmc') ? metered_mwh * COST_STACK.power_market_charge_eur_mwh : 0;

    // TSO balancing-capacity fee, replacing the invented flat annual fee. It is
    // a POOL-LEVEL deduction under the contracted waterfall, i.e. it comes off
    // before the owner's share and therefore before the service fee.
    const brp_fee_legacy = sc.brp_fee_yr * Math.pow(1 + sc.opex_esc, yr - 1);
    const brp_fee = cs('brp')
      ? metered_mwh * COST_STACK.balancing_capacity_fee_eur_mwh
      : brp_fee_legacy;

    // Standby auxiliary load, idle hours only. Cycle-driven auxiliary
    // consumption is already inside RTE (measured at the POI including
    // auxiliaries), so charging a throughput-proportional aux line as well
    // would bill the same electrons twice.
    const active_hours = dur_h > 0 ? (da_mwh_discharged / (mw || 1)) * 2 : 0;
    const idle_hours = Math.max(0, 8760 * yr_op_frac - active_hours);
    const standby_mwh = cs('aux')
      ? mw * COST_STACK.standby_load_pct_of_nameplate_mw * idle_hours : 0;
    // Aux energy is bought at the day-ahead price, floored at zero: a negative
    // price does not pay the asset to run its own HVAC in this model.
    const aux_price = Math.max(0, yr_capture > 0 ? (kv.s1?.da_avg_eur_mwh ?? 70) : 70);
    const aux_charge = standby_mwh * aux_price;

    // The service fee. Base is the owner's share AFTER exchange fees when
    // `fee_base` is on; gross when it is not.
    const fee_pct = cs('fee_rate') ? COST_STACK.service_fee_pct : sc.rtm_fee_pct;
    const fee_base = cs('fee_base') ? (rev_gross - brp_fee - pmc_fee) : rev_gross;
    const rtm_fee = fee_base * fee_pct;

    const rev_net = rev_gross - rtm_fee - brp_fee - pmc_fee - aux_charge;
    const rev_cap = rev_bal * 0.65;  // approximate split for reporting
    const rev_act = rev_bal * 0.35;

    // C8. OPEX
    const opex_full = sc.opex_per_kw_yr * mw * 1000 * Math.pow(1 + sc.opex_esc, yr - 1) * yr_op_frac;

    // C9. EBITDA (mothball if cash-negative: standby OPEX = 20%)
    let opex = opex_full;
    let ebitda = rev_net - opex;
    if (ebitda < 0) {
      opex = opex_full * 0.20;
      ebitda = -opex;
    }

    // C10. Tax (with depreciation shield)
    const depr_base = yr <= depr_years ? gross_capex_total / depr_years : 0;
    const depr_aug = (yr >= 10 && yr < 10 + depr_years) ? aug_capex / depr_years : 0;
    const depr = depr_base + depr_aug;
    const interest_yr = debt_bal > 0 ? debt_bal * rate_allin : 0;
    const cash_tax = cashTaxFor(ebitda, depr, interest_yr, tax_rate);
    const cash_tax_unlev = cashTaxFor(ebitda, depr, 0, tax_rate);

    // C11. CFADS
    const maint_capex = aug_capex;
    const cfads = ebitda - cash_tax - maint_capex;

    // C12. Debt service
    let ds = 0, principal = 0;
    if (yr <= grace && debt_bal > 0) {
      ds = debt_bal * rate_allin;
      principal = 0;
    } else if (yr <= grace + tenor && debt_bal > 0) {
      ds = pmt;
      const int_exp = debt_bal * rate_allin;
      principal = Math.min(pmt - int_exp, debt_bal);
    }
    debt_bal = Math.max(0, debt_bal - principal);

    // C13. DSCR
    const dscr = ds > 0 ? cfads / ds : null;
    if (dscr !== null && dscr < min_dscr) min_dscr = dscr;

    // C14. Crossover
    if (!crossover_year && rev_net < opex) {
      crossover_year = cod_year + yr;
    }
    // Revenue crossover: when trading exceeds balancing
    if (!revenue_crossover_year && rev_trd > rev_bal) {
      revenue_crossover_year = cod_year + yr;
    }

    // C15. Cash flows
    const project_cf = ebitda - cash_tax_unlev - maint_capex;
    const equity_cf = cfads - ds;

    years.push({
      yr, cal_year,
      retention: Math.round(retention * 1000) / 1000,
      usable_mwh_per_mw: Math.round(usable_mwh_per_mw * 100) / 100,
      scale_energy: Math.round(scale_energy * 1000) / 1000,
      compress_total: Math.round(compress_total * 1000) / 1000,
      rev_cap: Math.round(rev_cap), rev_act: Math.round(rev_act),
      rev_bal: Math.round(rev_bal), rev_trd: Math.round(rev_trd),
      rev_gross: Math.round(rev_gross),
      trading_fraction: Math.round(mix.trading_fraction * 1000) / 1000,
      // Phase 38.6. The share the DA ENERGY seams actually spent this year, and
      // where it came from — so the identity tests assert on the PAYLOAD rather
      // than on internals, and the two shares can never silently disagree
      // again: `trading_fraction` above is a EUR/EUR value share,
      // `arb_share_used` is what multiplied MWh.
      //
      // Emitted ONLY when the partition is on. Adding a field unconditionally
      // would change the public payload for every caller while the flag still
      // defaults to current behaviour — which is precisely what the flag exists
      // to prevent, and what the 54/54 byte-identity gate caught when this was
      // first written unconditionally.
      ...(partition_on ? {
        arb_share_used: Math.round(arb_share_yr * 10000) / 10000,
        arb_share_basis: 'mw_hours_physical',
        mw_partition,
        da_energy_req_mwh_per_mw: Math.round(da_energy_req * 10000) / 10000,
        reserve_energy_req_mwh_per_mw:
          Math.round(reserve_energy_req * 10000) / 10000,
        total_energy_req_mwh_per_mw: Math.round(total_energy_req * 10000) / 10000,
        reserve_mw_share_sum: Math.round(
          Object.values(RESERVE_PRODUCTS).reduce((a, x) => a + x.share, 0) * 10000) / 10000,
      } : {}),
      switching_friction: mix.switching_friction,
      sd_ratio: mix.sd_ratio,
      // Phase 36.D — the demand and absorption this year's S/D was computed
      // from. Published so the reconciliation harness can tie the engine to the
      // canonical module year by year instead of taking the ratio on trust.
      demand_mw: Math.round(projectDemand(cal_year, kv, sc.demand_growth ?? 0.02)),
      absorption_mw: absorptionMw(Math.round(cal_year)),
      R: mix.R, T: mix.T, price_ratio: mix.price_ratio,
      spread_mult: mix.spread_mult, renewable_share: mix.renewable_share,
      market_depth: Math.round(depth * 1000) / 1000,
      rtm_fee: Math.round(rtm_fee), brp_fee: Math.round(brp_fee),
      // Phase 38.8 — the cost stack's own lines, so the identity tests assert on
      // the payload rather than on internals. Emitted ONLY when a layer is on:
      // adding fields unconditionally changes the public payload for every
      // caller while the flag still defaults off, which is exactly what the flag
      // exists to prevent. Caught by the byte-identity gate, for the second time
      // in two phases — the reflex to publish a diagnostic is the trap.
      ...(cs_on.size ? {
        pmc_fee: Math.round(pmc_fee), aux_charge: Math.round(aux_charge),
        da_mwh_charged: Math.round(da_mwh_charged),
        da_mwh_discharged: Math.round(da_mwh_discharged),
        cost_stack_layers: [...cs_on].sort(),
      } : {}),
      rev_net: Math.round(rev_net),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      depr: Math.round(depr),
      cash_tax: Math.round(cash_tax), cash_tax_unlev: Math.round(cash_tax_unlev),
      cfads: Math.round(cfads), maint_capex: Math.round(maint_capex),
      ds: Math.round(ds), dscr: dscr != null ? Math.round(dscr * 100) / 100 : null,
      debt_bal: Math.round(debt_bal),
      project_cf: Math.round(project_cf), equity_cf: Math.round(equity_cf),
    });
  }

  // ── IRR ──
  const project_cfs = [-capex_net_total, ...years.map(y => y.project_cf)];
  const project_solve = solveIRR(project_cfs);
  const project_irr = project_solve.value;
  const equity_cfs = [-equity_initial, ...years.map(y => y.equity_cf)];
  const equity_irr = calcIRR(equity_cfs);

  // NPV
  const wacc = 0.08;
  let npv_project = 0;
  for (let t = 0; t < project_cfs.length; t++) {
    npv_project += project_cfs[t] / Math.pow(1 + wacc, t);
  }

  // Payback
  let cumul = 0, payback = null;
  for (let t = 0; t < project_cfs.length; t++) {
    cumul += project_cfs[t];
    if (cumul >= 0 && payback === null) payback = t;
  }

  // ── Phase 39: debt sized FROM the cash flows ─────────────────────────────
  //
  // Everything above sizes debt backwards — gearing is fixed at 55 %, a level
  // annuity is built on it, and `min_dscr` is whatever falls out. That number is
  // 0.95 at the reference configuration and never crosses 1.00. No lender writes
  // a facility that way: debt is sized FROM cash flows to a target cover ratio,
  // and gearing is the OUTPUT.
  //
  // Emitted ALONGSIDE the fixed-gearing figures, never replacing them. All 68
  // existing references to `min_dscr` keep reading exactly what they read
  // before; this is a new object and nothing repoints onto it.
  let debt_sizing = null;
  try {
    // CFADS at an arbitrary interest path. EBITDA, depreciation and maintenance
    // capex are financing-independent so they come off the rows already built;
    // cash tax is the only line that moves with the structure being solved, and
    // it uses the engine's own `cashTaxFor` rather than a copy of it (rule #4).
    const cfadsFn = (interestByYear) => years.map((y, i) =>
      y.ebitda - cashTaxFor(y.ebitda, y.depr, interestByYear[i] ?? 0, tax_rate) - y.maint_capex);

    const bc = debtBaseCase();
    const solved = sizeDebt({ cfadsFn, capexNet: capex_net_total, ...bc });
    assertDebtInvariants(solved);

    // Equity IRR at the SOLVED structure — the number that changes the sponsor
    // conversation, and not comparable with the fixed-gearing `equity_irr` above
    // because the equity cheque is different.
    const solvedCfads = cfadsFn(Array.from({ length: 20 },
      (_, i) => solved.schedule[i]?.interest ?? 0));
    const solvedEquityCf = [-solved.equity];
    for (let t = 1; t <= 20; t++) {
      solvedEquityCf.push(solvedCfads[t - 1] - (solved.schedule[t - 1]?.debt_service ?? 0));
    }

    // The cover ratio is a TRANSFERRED parameter (US bank panel, over SOFR,
    // carried onto a EUR asset), and the whole gearing figure rests on it. So
    // the ladder ships WITH the headline rather than in a footnote: a reader who
    // cannot see how much of the answer is the parameter cannot weigh the answer.
    const sensitivity = DSCR_SENSITIVITY_LADDER.map((target) => {
      const s = sizeDebt({ cfadsFn, capexNet: capex_net_total, ...bc, targetDscr: target });
      return {
        dscr_target: target,
        debt: Math.round(s.debt),
        gearing: Math.round(s.gearing * 1000) / 1000,
        binding_constraint: s.binding_constraint,
      };
    });

    debt_sizing = {
      debt: Math.round(solved.debt),
      gearing: Math.round(solved.gearing * 1000) / 1000,
      equity: Math.round(solved.equity),
      equity_irr: Math.round(calcIRR(solvedEquityCf) * 10000) / 10000,
      binding_constraint: solved.binding_constraint,
      avg_life_years: solved.avg_life != null ? Math.round(solved.avg_life * 100) / 100 : null,
      target_dscr: solved.target_dscr,
      tenor_years: solved.tenor_years,
      grace_years: solved.grace_years,
      rate_allin: Math.round(solved.rate * 100000) / 100000,
      amortisation: 'sculpted',
      sensitivity,
      // Rule #2: this label asserts where the number came from, so it is
      // COMPUTED from the parameter register rather than written as prose that
      // can outlive its premise.
      provenance: debtProvenanceNote(),
      // The comparison, in one sentence, so nobody has to reconcile two numbers
      // that look contradictory.
      //
      // Rule #2, the hard way. The first draft of this line ended "...minimum
      // cover is X× and the structure fails" for EVERY configuration, because
      // the reference config it was written against has cover of 0.95. It
      // shipped, and the live 2h/mid/2028 default rendered "minimum cover is
      // 1.76× and the structure fails" — an assertion about a state, hardcoded
      // rather than derived, contradicted by the number sitting next to it. The
      // verdict is now COMPUTED from the cover ratio it describes.
      comparison: `At the assumed ${Math.round(debt_pct * 100)} % gearing, minimum cover is `
        + `${min_dscr != null ? min_dscr.toFixed(2) : '—'}×`
        + (min_dscr == null ? '.'
          : min_dscr < 1.0 ? ' — the asset does not service its debt.'
          : min_dscr < DEBT_COVENANT_DSCR
            ? ` — above 1.00 but under the ${DEBT_COVENANT_DSCR.toFixed(2)}× covenant.`
            : `, clearing the ${DEBT_COVENANT_DSCR.toFixed(2)}× covenant.`)
        + ` Sized to a lender's ${solved.target_dscr.toFixed(2)}× target cover, the same asset `
        + `supports €${(solved.debt / 1e6).toFixed(1)}M of debt — `
        + `${(solved.gearing * 100).toFixed(1)} % gearing. Same asset, different structure.`,
    };
  } catch (err) {
    // A solver failure must not take the revenue payload down with it, and must
    // not silently look like "no debt" either (B8) — it surfaces as an error
    // field the UI can refuse to render.
    debt_sizing = { error: String(err && err.message ? err.message : err) };
  }

  // Reconciliation
  const recon = {
    gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross - y.rev_bal - y.rev_trd) < 2),
    net_equals_gross_minus_fees: years.every(y => Math.abs(y.rev_net - (y.rev_gross - y.rtm_fee - y.brp_fee)) < 2),
    ebitda_equals_net_minus_opex: years.every(y => Math.abs(y.ebitda - (y.rev_net - y.opex)) < 2),
    cfads_equals_ebitda_minus_tax_minus_maint: years.every(y => Math.abs(y.cfads - (y.ebitda - y.cash_tax - y.maint_capex)) < 2),
    debt_repaid: debt_bal < 100,
  };

  // Bankability
  let cons_min_dscr = min_dscr;
  if (params.scenario !== 'conservative' && !params._skip_cons) {
    // `client_scenario` is passed explicitly: it is the global-driver context,
    // and the overlay's substitutions were visible to this probe too.
    const cons_result = computeRevenueV7({ ...params, scenario: 'conservative', client_scenario, _skip_cons: true }, kv);
    cons_min_dscr = cons_result.min_dscr;
  }
  const bankability = cons_min_dscr >= 1.20 ? 'Pass'
    : cons_min_dscr >= 1.0 ? 'Marginal'
    : 'Fail';

  if (min_dscr === Infinity) min_dscr = null;

  // Fleet trajectory for COD context
  const fleet = kv?.fleet;
  const cod_sd = fleet?.trajectory?.find?.(t => t.year === cod_year) ?? null;

  const y1 = years[0];

  // Monthly seasonal DSCR overlay
  const SEASONAL_FACTORS = [1.35, 1.25, 1.10, 0.85, 0.70, 0.55, 0.50, 0.60, 0.80, 1.05, 1.20, 1.40];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sf_sum = SEASONAL_FACTORS.reduce((a, b) => a + b, 0);
  const y1_cfads = years[0]?.cfads || 0;
  const monthly_debt_svc = pmt / 12;
  const monthly_y1 = MONTH_NAMES.map((name, i) => {
    const cfads_m = y1_cfads * SEASONAL_FACTORS[i] / sf_sum;
    const dscr_m = monthly_debt_svc > 0 ? cfads_m / monthly_debt_svc : null;
    return {
      month: name, seasonal_factor: SEASONAL_FACTORS[i],
      cfads: Math.round(cfads_m), debt_service: Math.round(monthly_debt_svc),
      dscr: dscr_m ? Math.round(dscr_m * 100) / 100 : null,
    };
  });
  const worst_month_dscr = Math.min(
    ...monthly_y1.filter(m => m.dscr !== null).map(m => m.dscr)
  );

  // S2 data for signal_inputs
  const s2 = kv?.s2 || {};
  const s1 = kv?.s1 || {};
  const act_parsed = kv?.s2_activation_parsed || {};
  const s1_cap = kv?.s1_capture || {};
  const prices_source = s2.afrr_cap_avg != null ? 'BTD measured' : (s2.afrr_up_avg != null ? 'BTD parsed; calibrated capacity (review pending)' : 'proxy');

  // v7.1 — per-product compression at COD year (cpi formula on per-product S/D)
  const cod_mix = computeTradingMix(kv, dur_h, cod_year, scenario_name, sc, 0, drv);
  const cpi_fcr_at_cod  = Math.round(cpiCurveScenario(cod_mix.per_product.fcr.sd_ratio,  drv.cpi_floor) * 100) / 100;
  const cpi_afrr_at_cod = Math.round(cpiCurveScenario(cod_mix.per_product.afrr.sd_ratio, drv.cpi_floor) * 100) / 100;
  const cpi_mfrr_at_cod = Math.round(cpiCurveScenario(cod_mix.per_product.mfrr.sd_ratio, drv.cpi_floor) * 100) / 100;

  // ── v7.3 — Throughput-derived cycle accounting + empirical SOH/RTE ──────
  // Per-product breakdown for assumptions_panel + warranty status surface.
  const efc_breakdown = {
    fcr:  Math.round(tp.fcr_efcs  * 10) / 10,
    afrr: Math.round(tp.afrr_efcs * 10) / 10,
    mfrr: Math.round(tp.mfrr_efcs * 10) / 10,
    da:   Math.round(tp.da_efcs   * 10) / 10,
  };
  const total_efcs_yr = Math.round(tp.total_efcs_yr);
  const warranty_status = warrantyStatusFor(tp.total_efcs_yr);

  // ── v7.2 — Phase 7.7c Session 1 derived metrics ─────────────────────────
  // LCOS (€/MWh-cycled) — cross-tech comparator.
  // Formula: (CAPEX·CRF + Fixed O&M + Charging cost) / annual MWh discharged
  //   CRF = r(1+r)^n / ((1+r)^n − 1); r = WACC (0.08, matches NPV at line 1143)
  //   n = 20 yr (matches years[].length)
  //   Charging cost = avg charge price × MWh charged annually × (1/RTE)
  //   Annual MWh discharged = total_efcs_yr × dur_h × MW × availability
  //   (throughput-derived; replaces sc.cycles_{2h,4h} × 365 assumption).
  // Variable O&M is folded into Fixed O&M (opex_y1 already covers per-cycle wear in BESS PF practice).
  const LCOS_LIFETIME_YRS = 20;
  const LCOS_WACC = 0.08;
  const lcos_crf = LCOS_WACC * Math.pow(1 + LCOS_WACC, LCOS_LIFETIME_YRS)
    / (Math.pow(1 + LCOS_WACC, LCOS_LIFETIME_YRS) - 1);
  const lcos_capex_recovery = gross_capex_total * lcos_crf;
  const lcos_fixed_om = y1 ? y1.opex : 0;
  // Phase 49 item 3 — the THIRD substitution on this path, and the quietest.
  // When the day captures are missing, LCOS silently charges at a hardcoded
  // €35/€30 instead of the observed €12.04/€14.27, moving `lcos_eur_mwh` from
  // 197.3 to 225.3 (+14.2 %) on the reference configuration with nothing in the
  // payload saying an assumption had replaced an observation. The constants stay
  // — they are a reasonable default — but the substitution is now recorded.
  const lcos_charge_observed = s1_cap.capture_2h?.avg_charge != null || s1_cap.capture_4h?.avg_charge != null;
  const lcos_charge_price = durBlend(dur_h,
    s1_cap.capture_2h?.avg_charge ?? 35,
    s1_cap.capture_4h?.avg_charge ?? 30);
  // `tp.total_efcs_yr` is DELIVERED throughput (36.B5): availability is already
  // inside it, so re-applying it here would haircut the same energy twice.
  const lcos_mwh_discharged_yr = tp.total_efcs_yr * dur_h * mw;
  const lcos_mwh_charged_yr = rte > 0 ? lcos_mwh_discharged_yr / rte : 0;
  const lcos_charging_cost = lcos_charge_price * lcos_mwh_charged_yr;
  const lcos_eur_mwh = lcos_mwh_discharged_yr > 0
    ? Math.round((lcos_capex_recovery + lcos_fixed_om + lcos_charging_cost) / lcos_mwh_discharged_yr * 10) / 10
    : null;

  // MOIC (multiple of money) — total positive equity cash returned ÷ equity invested.
  const moic_positive_cfs = years.reduce((s, yr_) => s + Math.max(0, yr_.equity_cf), 0);
  const moic = equity_initial > 0
    ? Math.round((moic_positive_cfs / equity_initial) * 100) / 100
    : null;

  // Assumptions panel — read-only display of engine constants. NO sliders (Session 2).
  // v7.3: replaced flat cycles_per_year with cycles_breakdown + warranty_status.
  const assumptions_panel = {
    rte: {
      value: Math.round(rte_curve[0] * 1000) / 10,
      decay_pp_per_yr: 0.20,
      label: 'RTE BOL @ POI incl aux',
      unit: '%',
      note: 'Decays 0.20pp/yr per NREL Annual Technology Baseline (atb.nrel.gov, utility-scale battery storage, latest published edition) cross-checked against public Tier-1 LFP manufacturer warranty curves (BYD, Samsung SDI, CATL); floor at -4pp from BOL',
    },
    cycles_breakdown: {
      fcr:  efc_breakdown.fcr,
      afrr: efc_breakdown.afrr,
      mfrr: efc_breakdown.mfrr,
      da:   efc_breakdown.da,
      total_cd: Math.round(tp.total_cd * 100) / 100,
      total_efcs_yr: total_efcs_yr,
      // Phase 36.B5 — the wear model and the revenue model read one day-ahead
      // throughput. Disclosed rather than implicit: the anchor is what the asset
      // could cycle trading full time, the utilisation is the share left after
      // reserve commitment, and the difference is energy the engine no longer
      // charges cell wear for while billing no revenue on it (36.B1-O).
      da_anchor_mwh_per_mw_yr: Math.round(tp.da_anchor_mwh),
      da_delivered_mwh_per_mw_yr: Math.round(tp.da_mwh),
      da_utilisation: Math.round(tp.da_utilisation * 1000) / 1000,
      basis: 'Wear and revenue share one delivered day-ahead throughput (anchor × trading fraction × availability).',
      label: 'Cycles per year (throughput-derived)',
    },
    warranty_status: warranty_status,
    availability: {
      value: Math.round(sc.avail * 1000) / 10,
      label: 'Availability factor',
      unit: '%',
      note: 'Forced-outage + scheduled-maintenance haircut',
    },
    hold_period: { value: LCOS_LIFETIME_YRS, label: 'Hold period', unit: 'years', note: '20-year DCF; matches typical PF assumption' },
    wacc: { value: Math.round(LCOS_WACC * 1000) / 10, label: 'WACC', unit: '%', note: `Weighted average cost of capital; debt EURIBOR + ${sc.debt_margin_bp}bps, equity hurdle ~12%` },
  };

  // ── Phase 49 item 3 — say which observations were substituted ───────────────
  //
  // The primary path has its own quiet fallbacks, and they were the harder half
  // of this item: the payload looked completely healthy while two inputs had
  // been replaced. Emitted ONLY when a substitution actually fired, so the 54
  // public configurations — where every observation is present — stay
  // byte-identical and this key does not exist on them at all.
  const substitutions = [];
  if (s1_cap.capture_2h?.gross_eur_mwh == null && s1_cap.capture_4h?.gross_eur_mwh == null) {
    substitutions.push({
      field: 'signal_inputs.s1_capture',
      substituted: 'null — no observed day-ahead capture for the current day',
      was: 'back-derived from base_year.annual_totals.trading (removed: it inverted the wrong factor and inflated capture 8.03x)',
    });
  }
  if (!lcos_charge_observed) {
    substitutions.push({
      field: 'lcos_eur_mwh',
      substituted: `charge price assumed €${durBlend(dur_h, 35, 30)}/MWh (2h €35 / 4h €30 constants)`,
      was: 'observed s1_capture.capture_*.avg_charge',
    });
  }

  return {
    // Config
    system: `${mw} MW / ${mwh} MWh (${dur_h}H)`,
    duration: dur_h,
    capex_scenario: `€${capex_kwh}/kWh`,
    capex_eur_kwh: capex_kwh,
    capex_kwh, capex_total: gross_capex_total, capex_net: capex_net_total,
    gross_capex: gross_capex_total,
    grant_amount: Math.round(gross_capex_total * grant_pct),
    grant_label: grant_pct > 0 ? `${Math.round(grant_pct * 100)}% grant` : 'No grant',
    net_capex: capex_net_total,
    cod_year,
    scenario: params.scenario || 'base',
    model_version: 'v7.3',
    engine_changelog: {
      v7_to_v7_1: [
        'Per-product cannibalization (cpi) replaces aggregate cpi for FCR / aFRR / mFRR',
        'Bid-acceptance saturation modeled in computeTradingMix',
        'aFRR activation rate tuned to 0.25 (Baltic operational baseline)',
      ],
      v7_1_to_v7_2: [
        'LCOS (€/MWh-cycled) computed and surfaced',
        'MOIC (multiple of money) computed and surfaced',
        'Duration optimizer hint (irr_2h vs irr_4h comparison)',
        'Assumptions panel — RTE, cycles/yr, availability, hold period, WACC made visible',
      ],
      v7_2_to_v7_3: [
        'Cycle accounting rebuilt from throughput: act_rate_* parameters → mwh_per_mw_yr_* with public research provenance',
        'SOH_CURVE_W replaced with three rate-tagged empirical curves; engine interpolates by computed total c/d',
        'roundtrip_efficiency now decays 0.20pp/yr from per-duration BOL',
        'Base availability normalized 0.95 → 0.97',
        'assumptions_panel exposes EFC breakdown by product + warranty_status indicator',
        'engine_calibration_source field added',
      ],
    },
    // v7.3 calibration provenance — Phase 12.10 sanitization (audit #5):
    // unsourced "Tier 1 / cross-supplier consensus" language replaced with
    // open-source citations (NREL ATB) plus operator overlay disclosure.
    engine_calibration_source: {
      throughput_per_product: 'Modo Energy / Dexter / GEM Storage Index / enspired research (2025 Q3-Q4 public reports) — see worker computeRevenue comments for URLs',
      soh_curves: 'NREL Annual Technology Baseline LFP utility-scale curves (atb.nrel.gov, latest published edition) cross-checked against public Tier-1 manufacturer warranty data (BYD, Samsung SDI, CATL); operator overlay for Baltic-specific dispatch envelope',
      rte_decay: '0.20 pp/yr — NREL ATB LFP RTE projection, cross-checked vs. public manufacturer warranty curves',
      availability: 'Operator target with 1pp haircut from public 98% manufacturer warranty floor',
      capex_per_mw: '2026-Q1 public Tier-1 quoting (BloombergNEF + IEA + NREL ATB) — no change in this phase',
      last_calibrated: '2026-04-27',
      next_review: '2026-Q3 (post-Litgrid 6-month PICASSO data; next NREL ATB / public quoting refresh)',
    },

    // Market context
    sd_ratio: cod_sd?.sd_ratio ?? null,
    phase: cod_sd?.phase ?? null,
    cpi_at_cod: cod_sd?.cpi ?? null,
    cpi_fcr_at_cod,
    cpi_afrr_at_cod,
    cpi_mfrr_at_cod,
    per_product_at_cod: cod_mix.per_product,

    // v7.2 derived metrics + assumptions
    lcos_eur_mwh,
    moic,
    roundtrip_efficiency: rte,
    roundtrip_efficiency_curve: rte_curve,
    cycles_per_year: total_efcs_yr,
    cycles_breakdown: efc_breakdown,
    warranty_status,
    assumptions_panel,

    // Headline metrics
    //
    // Phase 49 item 2: the `< -0.50 ? null` sentinel is GONE. It was masking
    // `calcIRR`'s lower bracket bound — a non-convergence — as an uneconomic
    // project, on 47 of the 54 configurations whenever the v6 fallback fired.
    // `solveIRR` now returns null only when there is genuinely no root in the
    // domain, and `irr_status` carries the solver's own reason instead of a
    // verdict it was never entitled to make. Inert across the 54 public
    // configurations, whose most negative CONVERGED IRR is −0.0607.
    project_irr,
    equity_irr,
    irr_status: irrStatusFor(project_solve),
    npv_at_wacc: Math.round(npv_project),
    npv_project: Math.round(npv_project),
    net_rev_per_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    net_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null,
    min_dscr_conservative: cons_min_dscr != null ? Math.round(cons_min_dscr * 100) / 100 : null,
    // Phase 39. `min_dscr` above is the DIAGNOSTIC: cover at the assumed 55 %
    // gearing on a level annuity. `debt_sizing` is the STRUCTURE a lender would
    // actually write: debt solved from these cash flows to a target cover, with
    // gearing as the output. Both ship, and `debt_sizing.comparison` states the
    // relationship in one sentence so the two are never read as rivals.
    debt_sizing,
    bankability,
    simple_payback_years: payback,
    payback_years: payback,
    crossover_year: crossover_year || (cod_year + 25),
    revenue_crossover_year: revenue_crossover_year || null,
    revenue_crossover_note: revenue_crossover_year
      ? `Trading exceeds balancing in ${revenue_crossover_year}`
      : 'Trading does not exceed balancing within 20-year horizon',

    // Y1 backward compat
    gross_revenue_y1: y1 ? y1.rev_gross : 0,
    net_revenue_y1: y1 ? y1.rev_net : 0,
    ebitda_y1: y1 ? y1.ebitda : 0,
    opex_y1: y1 ? y1.opex : 0,
    rtm_fees_y1: y1 ? y1.rtm_fee + y1.brp_fee : 0,
    capacity_y1: y1 ? y1.rev_cap : 0,
    activation_y1: y1 ? y1.rev_act : 0,
    arbitrage_y1: y1 ? y1.rev_trd : 0,
    capacity_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_cap / y1.rev_gross * 100) / 100 : 0,
    activation_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_act / y1.rev_gross * 100) / 100 : 0,
    arbitrage_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_trd / y1.rev_gross * 100) / 100 : 0,

    // Financing
    total_debt: debt_initial, total_equity: equity_initial,
    debt_initial, equity_initial, rate_allin,
    annual_debt_service: Math.round(pmt),

    // Timeseries
    years,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.rev_net, ebitda: yr.ebitda, dscr: yr.dscr } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,
    fleet_context: {
      current_sd: fleet?.sd_ratio ?? null,
      weighted_supply: fleet?.baltic_weighted_mw ?? fleet?.baltic_operational_mw ?? null,
      pipeline_mw: fleet?.baltic_pipeline_mw ?? null,
      // Phase 36.D — this reported `fleet.eff_demand_mw`, i.e. whatever the KV
      // payload was last stamped with. That is now a stale echo rather than an
      // input: the engine takes demand from the canonical module. Report what
      // is actually used, and surface the absorption deduction alongside it so
      // the S/D the client sees can be reconstructed from the panel.
      // Anchored on the first projected operating year, not on the wall clock:
      // this panel has to stay deterministic for the byte-identity gate.
      demand_mw: Math.round(projectDemand(years[0]?.cal_year ?? cod_year, kv)),
      demand_basis: 'demand-forecast-module',
      demand_module_version: DEMAND_FORECAST_VERSION.version,
      absorption_mw: absorptionMw(years[0]?.cal_year ?? cod_year),
      pipeline_realisation: PIPELINE_REALISATION[scenario_name],
      intraday_uplift: INTRADAY_UPLIFT,
      switching_friction: { immature: FRICTION_IMMATURE, mature: FRICTION_MATURE, maturity_years: MATURITY_YEARS },
      spread_growth: SPREAD_GROWTH[scenario_name] ?? 0.02,
      source: fleet ? 'live_s4_fleet' : 'fallback',
    },

    // Benchmarks
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source,
    timestamp: new Date().toISOString(),

    // Signal inputs used
    signal_inputs: {
      // Phase 49 item 3 — the second fallback, and the one nobody had looked at.
      //
      // When today's `capture_2h`/`capture_4h` are missing (monthly history
      // intact, so v7 still runs) this field used to BACK-DERIVE a capture from
      // `base_year.annual_totals.trading` by dividing out `effective_arb_pct`.
      // That is not the inverse of anything: the forward pass at
      // `computeBaseYear` multiplies by `trading_fraction` (0.70), so the round
      // trip returns capture × (0.70 / 0.139) and then some. **Measured on the
      // frozen KV with only the day captures removed: €101.91 → €818.59, an
      // 8.03× inflation**, published in a field whose name says it is an
      // observed signal input. A Baltic day-ahead capture of €818/MWh.
      //
      // A reconstruction of an input is not the input. When there is no signal
      // there is no signal input, and the field says so.
      s1_capture: (s1_cap.capture_2h?.gross_eur_mwh == null && s1_cap.capture_4h?.gross_eur_mwh == null)
        ? null
        : durBlend(dur_h,
          s1_cap.capture_2h?.gross_eur_mwh ?? s1_cap.capture_4h?.gross_eur_mwh,
          s1_cap.capture_4h?.gross_eur_mwh ?? s1_cap.capture_2h?.gross_eur_mwh),
      afrr_clearing: act_parsed?.lt?.afrr_p50 ?? s2.afrr_up_avg ?? 170,
      mfrr_clearing: act_parsed?.lt?.mfrr_p50 ?? s2.mfrr_up_avg ?? 110,
      afrr_cap: capPrice('afrr', s2.afrr_cap_avg, drv.cap_price_mult),
      mfrr_cap: capPrice('mfrr', s2.mfrr_cap_avg, drv.cap_price_mult),
      fcr_cap: capPrice('fcr', s2.fcr_cap_avg, drv.cap_price_mult),
      euribor: Math.round(euribor * 10000) / 100,
      rate_allin_pct: Math.round(rate_allin * 10000) / 100,
    },

    // Present only when an observation was replaced by an assumption. Absent on
    // a fully-observed payload, which is why it costs the byte-identity gate
    // nothing on the 54 public configurations.
    ...(substitutions.length ? { degraded: { engine: 'v7.3', reason: 'one or more observed inputs unavailable', substitutions } } : {}),

    // Reconciliation
    reconciliation: recon,

    // Monthly seasonal DSCR
    monthly_y1,
    worst_month_dscr,

    // v7 new fields
    base_year,
    forward: {
      compression_rate_observed: compression.rate,
      compression_source: compression.source,
      compression_data_points: compression.data_points,
      initial_p50: compression.initial_p50,
      recent_avg_p50: compression.recent_avg_p50,
      scenario_multiplier: comp_mult,
      effective_compression_rate: effective_compression,
      rate_full_window: compression.rate_full_window,
    },
    assumptions: {
      trading_realisation: sc.trd_real,
      trading_realisation_note:
        'Perfect-foresight discount, MEASURED not assumed: KKME dispatch backtest over ' +
        'realised LT day-ahead prices 2025-07-01 → 2026-06-30, 349 traded days, ' +
        'volume-weighted 0.7234 (monthly 0.6535-0.8155). Day-ahead component only.',
      compression_scenario_mult: comp_mult,
      effective_compression: effective_compression,
    },

    // ── Phase 34.1 — per-project block ────────────────────────────────────
    // Present ONLY when a project config was supplied. Spreading `{}` on the
    // public path leaves the payload untouched, key-for-key.
    ...(pcfg ? {
      project: {
        project_id: pcfg.project_id,
        name: pcfg.name,
        mw, mwh, duration_h: dur_h,
        cod: pcfg.cod,
        cod_year,
        // Engine labels operating years cal_year = cod_year + yr, so year 1
        // lands here. Configs declare this directly; cod_year is derived from it.
        first_operating_year: pcfg.first_operating_year ?? (cod_year + 1),
        capex_eur_kwh: capex_kwh,
        grid_allowance_mw: pcfg.grid_allowance_mw ?? null,
        grid_headroom_mw: pcfg.grid_allowance_mw != null ? pcfg.grid_allowance_mw - mw : null,
        warranty_efc_yr: pcfg.warranty_efc_yr ?? null,
        // Positive = the modelled duty cycle sits inside the warranty envelope.
        warranty_headroom_efc_yr: pcfg.warranty_efc_yr != null
          ? Math.round(pcfg.warranty_efc_yr - total_efcs_yr)
          : null,
        operational_months_y1: pcfg.operational_months_y1 ?? 12,
        partial_year_y1: op_frac_y1 < 1 ? {
          months: pcfg.operational_months_y1,
          fraction: Math.round(op_frac_y1 * 10000) / 10000,
          pro_rated: ['rev_bal', 'rev_trd', 'revenue_floor', 'opex'],
          // Phase 38.8a: `brp_fee` LEFT this list. It was a fixed annual
          // platform fee, which genuinely does not pro-rate, and DECISIONS A4
          // recorded not pro-rating it as the conservative choice. It is now a
          // volume-based TSO charge on metered energy, and metered energy
          // already carries `yr_op_frac` — so it pro-rates by construction, and
          // charging a per-MWh fee on energy the asset never moved would be
          // wrong rather than conservative. The conservatism A4 bought is gone
          // because the thing it was protecting against no longer exists.
          not_pro_rated: cs_on.has('brp')
            ? ['degradation (full-year ageing assumed)']
            : ['brp_fee (fixed annual platform fee)', 'degradation (full-year ageing assumed)'],
          ...(cs_on.has('brp') ? {
            newly_pro_rated: ['brp_fee (now a volume-based TSO charge, scales with metered energy)'],
          } : {}),
          note: 'Both exclusions are the conservative reading — lower net revenue, faster ageing.',
        } : null,
        // DA arbitrage energy behind the trading line, for the client's
        // explicit charging-cost bridge line (Phase 34.2). `avg_charge` is the
        // observed mean charging price for this duration; `lcos_charge_price`
        // is the same value the LCOS calculation uses, so there is one source.
        arb_energy_20yr: arb_energy,
        avg_charge_eur_mwh: lcos_charge_price,
        brp_fee_basis: 'flat_per_spv',
        brp_fee_note: `€${sc.brp_fee_yr.toLocaleString('en-US')}/yr, MW-independent — €${Math.round(sc.brp_fee_yr / mw)}/MW/yr at ${mw} MW`,
        meta: pcfg.meta ?? null,
      },
    } : {}),
  };
}

function computeRevenueV6(params, kv) {
  // A. Input resolution
  const mw = params.mw || 50;
  const dur_h = params.dur_h || 4;
  const mwh = mw * dur_h;
  const sc = REVENUE_SCENARIOS[params.scenario || 'base'] || REVENUE_SCENARIOS.base;
  const capex_kwh = params.capex_kwh || 164;
  const capex_total = capex_kwh * dur_h * 1000; // per MW → total uses mw later
  const cod_year = params.cod_year || 2028;

  // v7.3 throughput-derived cycle accounting, on the 36.B5 delivered basis so
  // the fallback path cannot disagree with the live one about how fast the cells
  // age. Revenue still reads the ANCHOR and applies its own factors per year.
  const v6_da_utilisation = Math.min(1, Math.max(0,
    computeTradingMix(kv, dur_h, cod_year + 1, params.scenario || 'base', sc, 1).trading_fraction));
  const tp = computeThroughputBreakdown(1, dur_h, sc,
    { da_utilisation: v6_da_utilisation, availability: sc.avail });
  const total_cd     = tp.total_cd;
  const da_mwh_per_mw_yr = tp.da_anchor_mwh;
  const rte_curve    = rteCurveFor(dur_h);
  const rte          = rte_curve[0];

  const fleet = kv?.fleet;
  const s2 = kv?.s2;
  const s1 = kv?.s1;

  // Live signal inputs
  // s1_capture: use computed capture fields, then spread × shape premium
  const s1_capture_4h = s1?.capture_4h_gross || s1?.gross_4h
    || (s1?.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 : null) || 134;
  const s1_capture_2h = s1?.capture_2h_gross || s1?.gross_2h
    || (s1_capture_4h * 1.12) || 149;
  const s1_capture = durBlend(dur_h, s1_capture_2h, s1_capture_4h);
  const afrr_clearing = s2?.afrr_up_avg || 171;
  const mfrr_clearing = s2?.mfrr_up_avg || 81;
  // Capacity prices via the Phase 33 single-source bound (never the *_up_avg
  // activation price; falls to calibrated constants when *_cap_avg is absent).
  const afrr_cap = capPrice('afrr', s2?.afrr_cap_avg);
  const mfrr_cap = capPrice('mfrr', s2?.mfrr_cap_avg);
  const fcr_cap = capPrice('fcr', s2?.fcr_cap_avg);
  const euribor = ((kv?.euribor?.euribor_nominal_3m ?? kv?.s3?.euribor_nominal_3m) || 2.01) / 100;
  const rate_allin = euribor + sc.debt_margin_bp / 10000;

  // B. Financing setup
  const grant_pct = params.grant_pct || 0;
  const gross_capex_total = capex_kwh * mwh * 1000;
  const capex_net_total = gross_capex_total * (1 - grant_pct);
  const debt_pct = 0.55;
  const debt_initial = Math.round(capex_net_total * debt_pct);
  const equity_initial = capex_net_total - debt_initial;
  const tenor = 8;
  const grace = 1;
  const tax_rate = 0.17;
  const depr_years = 10;

  // Annuity payment (post-grace)
  const pmt = debt_initial * rate_allin / (1 - Math.pow(1 + rate_allin, -tenor));

  // Prices source
  const prices_source = s2?.afrr_cap_avg != null ? 'BTD measured' : (s2?.afrr_up_avg != null ? 'BTD parsed; calibrated capacity (review pending)' : 'proxy');

  // C. 20-year timeseries
  const years = [];
  let debt_bal = debt_initial;
  let min_dscr = Infinity;
  let crossover_year = null;

  for (let yr = 1; yr <= 20; yr++) {
    // C1. Degradation — keyed off throughput-derived total_cd (v7.3).
    const retention = getDegradation(yr, total_cd);
    let usable_mwh_per_mw = dur_h * retention;

    // C2. Augmentation at year 10
    let aug_capex = 0;
    if (yr === 10) {
      const pre_aug = dur_h * retention;
      const target = dur_h * sc.aug_restore;
      const added = Math.max(0, target - pre_aug);
      aug_capex = added * sc.aug_cost_pct * capex_kwh * 1000 * mw;
      usable_mwh_per_mw = Math.min(target, pre_aug + added);
    }
    // Post-augmentation: use restored baseline
    if (yr > 10) {
      const ret_at_10 = getDegradation(10, total_cd);
      const target_10 = dur_h * sc.aug_restore;
      const restored = Math.min(target_10, dur_h * ret_at_10 + Math.max(0, target_10 - dur_h * ret_at_10));
      usable_mwh_per_mw = restored * (retention / ret_at_10);
    }

    // C3. Stacking constraint
    const p_avail = sc.avail;
    const products = {};
    let total_energy_req = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      const raw = p_avail * prod.share;
      total_energy_req += raw * prod.dur_req_h;
      products[name] = { raw };
    }
    const scale_energy = Math.min(1.0, usable_mwh_per_mw / total_energy_req);

    let total_res_mw = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      products[name].eff = products[name].raw * scale_energy;
      total_res_mw += products[name].eff;
    }
    // Stack factor = fraction of MW available for arbitrage on top of reserves
    // (reserves and trading are stacked, not exclusive power slices)
    const arb_power = sc.stack_factor;

    // C4. Compression — calendar-year based (2027 = first viable COD reference)
    const cal_year = cod_year + yr;
    const years_since_ref = Math.max(0, cal_year - 2027);
    const bal_comp = Math.pow(1 - sc.bal_compress_yr, years_since_ref);
    const spread_comp = Math.pow(1 - sc.spread_compress_yr, years_since_ref);

    // C5. Balancing revenue (capacity + energy) — per MW, then * mw
    const rev_cap_fcr  = products.fcr.eff  * fcr_cap   * 8760 * sc.bal_mult * bal_comp;
    const rev_cap_afrr = products.afrr.eff * afrr_cap  * 8760 * sc.bal_mult * bal_comp;
    const rev_cap_mfrr = products.mfrr.eff * mfrr_cap  * 8760 * sc.bal_mult * bal_comp;
    const rev_cap = (rev_cap_fcr + rev_cap_afrr + rev_cap_mfrr) * mw;

    // Activation revenue uses act_rate_* calibration constants (tuned to BTD-observed).
    // Cell-wear accounting from these is captured separately by the throughput model
    // (see total_efcs_yr / cycles_breakdown surface).
    const rev_act_afrr = products.afrr.eff * sc.act_rate_afrr * 8760 * afrr_clearing * 0.55 * sc.bal_mult * bal_comp;
    const rev_act_mfrr = products.mfrr.eff * sc.act_rate_mfrr * 8760 * mfrr_clearing * 0.75 * sc.bal_mult * bal_comp;
    const rev_act = (rev_act_afrr + rev_act_mfrr) * mw;

    const rev_bal = (rev_cap + rev_act) * sc.real_factor;

    // C6. Trading revenue (DA spread capture) — throughput-derived DA energy.
    // arb_power × dur_h is per-cycle MWh ceiling. da_mwh_per_mw_yr is the
    // throughput-derived annual MWh from DA per MW. Use da_mwh as the
    // primary energy budget, capped by usable per-cycle storage capacity.
    const cycles_implied = da_mwh_per_mw_yr / Math.max(0.01, dur_h);  // EFCs from DA
    const e_out_cycle = Math.min(usable_mwh_per_mw, arb_power * dur_h);
    const e_out = e_out_cycle * cycles_implied * mw;
    const capture = s1_capture * sc.spread_mult * spread_comp;
    const rev_trd = e_out * capture * rte;

    // C7. Gross → Net reconciliation
    const rev_gross = rev_bal + rev_trd;
    const rtm_fee = rev_gross * sc.rtm_fee_pct;
    const brp_fee = sc.brp_fee_yr * Math.pow(1 + sc.opex_esc, yr - 1);
    const rev_net = rev_gross - rtm_fee - brp_fee;

    // C8. OPEX
    const opex = sc.opex_per_kw_yr * mw * 1000 * Math.pow(1 + sc.opex_esc, yr - 1);

    // C9. EBITDA
    const ebitda = rev_net - opex;

    // C10. Tax (with depreciation shield)
    const depr_base = yr <= depr_years ? gross_capex_total / depr_years : 0;
    const depr_aug = (yr >= 10 && yr < 10 + depr_years) ? aug_capex / depr_years : 0;
    const depr = depr_base + depr_aug;
    const interest_yr = debt_bal > 0 ? debt_bal * rate_allin : 0;
    const taxable = Math.max(0, ebitda - depr - interest_yr);
    const cash_tax = taxable * tax_rate;

    // Unlevered tax (for project IRR)
    const taxable_unlev = Math.max(0, ebitda - depr);
    const cash_tax_unlev = taxable_unlev * tax_rate;

    // C11. CFADS
    const maint_capex = aug_capex;
    const cfads = ebitda - cash_tax - maint_capex;

    // C12. Debt service
    let ds = 0, principal = 0;
    if (yr <= grace && debt_bal > 0) {
      ds = debt_bal * rate_allin;
      principal = 0;
    } else if (yr <= grace + tenor && debt_bal > 0) {
      ds = pmt;
      const int_exp = debt_bal * rate_allin;
      principal = Math.min(pmt - int_exp, debt_bal);
    }
    debt_bal = Math.max(0, debt_bal - principal);

    // C13. DSCR
    const dscr = ds > 0 ? cfads / ds : null;
    if (dscr !== null && dscr < min_dscr) min_dscr = dscr;

    // C14. Crossover check
    if (!crossover_year && rev_net < opex) {
      crossover_year = cod_year + yr;
    }

    // C15. Project cash flow (unlevered)
    const project_cf = ebitda - cash_tax_unlev - maint_capex;

    // C16. Equity cash flow
    const equity_cf = cfads - ds;

    years.push({
      yr, cal_year,
      retention: Math.round(retention * 1000) / 1000,
      usable_mwh_per_mw: Math.round(usable_mwh_per_mw * 100) / 100,
      scale_energy: Math.round(scale_energy * 1000) / 1000,
      rev_cap: Math.round(rev_cap), rev_act: Math.round(rev_act),
      rev_bal: Math.round(rev_bal), rev_trd: Math.round(rev_trd),
      rev_gross: Math.round(rev_gross),
      rtm_fee: Math.round(rtm_fee), brp_fee: Math.round(brp_fee),
      rev_net: Math.round(rev_net),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      depr: Math.round(depr),
      cash_tax: Math.round(cash_tax), cash_tax_unlev: Math.round(cash_tax_unlev),
      cfads: Math.round(cfads), maint_capex: Math.round(maint_capex),
      ds: Math.round(ds), dscr: dscr != null ? Math.round(dscr * 100) / 100 : null,
      debt_bal: Math.round(debt_bal),
      project_cf: Math.round(project_cf), equity_cf: Math.round(equity_cf),
    });
  }

  // D. IRR
  const project_cfs = [-capex_net_total, ...years.map(y => y.project_cf)];
  const project_solve = solveIRR(project_cfs);
  const project_irr = project_solve.value;

  const equity_cfs = [-equity_initial, ...years.map(y => y.equity_cf)];
  const equity_irr = calcIRR(equity_cfs);

  // NPV
  const wacc = 0.08;
  let npv_project = 0;
  for (let t = 0; t < project_cfs.length; t++) {
    npv_project += project_cfs[t] / Math.pow(1 + wacc, t);
  }

  // Payback
  let cumul = 0, payback = null;
  for (let t = 0; t < project_cfs.length; t++) {
    cumul += project_cfs[t];
    if (cumul >= 0 && payback === null) payback = t;
  }

  // E. Reconciliation checks
  // Tolerance of 2 accounts for independent rounding of each field
  const recon = {
    gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross - y.rev_bal - y.rev_trd) < 2),
    net_equals_gross_minus_fees: years.every(y => Math.abs(y.rev_net - (y.rev_gross - y.rtm_fee - y.brp_fee)) < 2),
    ebitda_equals_net_minus_opex: years.every(y => Math.abs(y.ebitda - (y.rev_net - y.opex)) < 2),
    cfads_equals_ebitda_minus_tax_minus_maint: years.every(y => Math.abs(y.cfads - (y.ebitda - y.cash_tax - y.maint_capex)) < 2),
    debt_repaid: debt_bal < 100,
  };

  // F. Bankability — check conservative DSCR
  let cons_min_dscr = min_dscr;
  if (params.scenario !== 'conservative' && !params._skip_cons) {
    const cons_result = computeRevenueV6({ ...params, scenario: 'conservative', _skip_cons: true }, kv);
    cons_min_dscr = cons_result.min_dscr;
  }
  const bankability = cons_min_dscr >= 1.20 ? 'Pass'
    : cons_min_dscr >= 1.0 ? 'Marginal'
    : 'Fail';

  if (min_dscr === Infinity) min_dscr = null;

  // Fleet trajectory for COD context
  const cod_sd = fleet?.trajectory?.find?.(t => t.year === cod_year) ?? null;

  const y1 = years[0];

  // G. Monthly seasonal DSCR overlay
  const SEASONAL_FACTORS = [1.35, 1.25, 1.10, 0.85, 0.70, 0.55, 0.50, 0.60, 0.80, 1.05, 1.20, 1.40];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sf_sum = SEASONAL_FACTORS.reduce((a, b) => a + b, 0);

  const y1_cfads = years[0]?.cfads || 0;
  const monthly_debt_svc = pmt / 12;

  const monthly_y1 = MONTH_NAMES.map((name, i) => {
    const cfads_m = y1_cfads * SEASONAL_FACTORS[i] / sf_sum;
    const dscr_m = monthly_debt_svc > 0 ? cfads_m / monthly_debt_svc : null;
    return {
      month: name,
      seasonal_factor: SEASONAL_FACTORS[i],
      cfads: Math.round(cfads_m),
      debt_service: Math.round(monthly_debt_svc),
      dscr: dscr_m ? Math.round(dscr_m * 100) / 100 : null,
    };
  });

  const worst_month_dscr = Math.min(
    ...monthly_y1.filter(m => m.dscr !== null).map(m => m.dscr)
  );

  return {
    // Config
    system: `${mw} MW / ${mwh} MWh (${dur_h}H)`,
    duration: dur_h,
    capex_scenario: `€${capex_kwh}/kWh`,
    capex_eur_kwh: capex_kwh,
    capex_kwh, capex_total: gross_capex_total, capex_net: capex_net_total,
    gross_capex: gross_capex_total,
    grant_amount: Math.round(gross_capex_total * grant_pct),
    grant_label: grant_pct > 0 ? `${Math.round(grant_pct * 100)}% grant` : 'No grant',
    net_capex: capex_net_total,
    cod_year,
    scenario: params.scenario || 'base',
    model_version: 'v6',

    // Market context
    sd_ratio: cod_sd?.sd_ratio ?? null,
    phase: cod_sd?.phase ?? null,
    cpi_at_cod: cod_sd?.cpi ?? null,

    // Headline metrics
    //
    // Phase 49 item 2: the `< -0.50 ? null` sentinel is GONE. It was masking
    // `calcIRR`'s lower bracket bound — a non-convergence — as an uneconomic
    // project, on 47 of the 54 configurations whenever the v6 fallback fired.
    // `solveIRR` now returns null only when there is genuinely no root in the
    // domain, and `irr_status` carries the solver's own reason instead of a
    // verdict it was never entitled to make. Inert across the 54 public
    // configurations, whose most negative CONVERGED IRR is −0.0607.
    project_irr,
    equity_irr,
    irr_status: irrStatusFor(project_solve),
    npv_at_wacc: Math.round(npv_project),
    npv_project: Math.round(npv_project),
    net_rev_per_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    net_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null,
    min_dscr_conservative: cons_min_dscr != null ? Math.round(cons_min_dscr * 100) / 100 : null,
    bankability,
    simple_payback_years: payback,
    payback_years: payback,
    crossover_year: crossover_year || (cod_year + 25),

    // Y1 backward compat
    gross_revenue_y1: y1 ? y1.rev_gross : 0,
    net_revenue_y1: y1 ? y1.rev_net : 0,
    ebitda_y1: y1 ? y1.ebitda : 0,
    opex_y1: y1 ? y1.opex : 0,
    rtm_fees_y1: y1 ? y1.rtm_fee + y1.brp_fee : 0,
    capacity_y1: y1 ? y1.rev_cap : 0,
    activation_y1: y1 ? y1.rev_act : 0,
    arbitrage_y1: y1 ? y1.rev_trd : 0,
    capacity_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_cap / y1.rev_gross * 100) / 100 : 0,
    activation_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_act / y1.rev_gross * 100) / 100 : 0,
    arbitrage_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_trd / y1.rev_gross * 100) / 100 : 0,

    // Financing
    total_debt: debt_initial, total_equity: equity_initial,
    debt_initial, equity_initial, rate_allin,
    annual_debt_service: Math.round(pmt),

    // Timeseries
    years,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.rev_net, ebitda: yr.ebitda, dscr: yr.dscr } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,

    // Benchmarks
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source,
    timestamp: new Date().toISOString(),

    // Signal inputs used
    signal_inputs: {
      s1_capture, afrr_clearing, mfrr_clearing,
      afrr_cap, mfrr_cap, fcr_cap,
      euribor: Math.round(euribor * 10000) / 100,
      rate_allin_pct: Math.round(rate_allin * 10000) / 100,
    },

    // Reconciliation
    reconciliation: recon,

    // Monthly seasonal DSCR
    monthly_y1,
    worst_month_dscr,
  };
}

// ─── Revenue Engine v7 — Observed base year + derived compression + live rate ──

/**
 * reservePrice: S/D elasticity curve for reserve price decay.
 * Steeper sigmoid: knee at S/D=1.7, prices halve there, near-floor by S/D=2.5.
 * floor_fraction = 0.12 (€3.25/MW/h on €27 base — empirical from UK/DE/Nordic).
 */
function reservePrice(sd_ratio, base_price) {
  // floor_fraction = 0.06 → ~€1.5/MW/h on €24 base (UK FFR at S/D ~2.5: £1-2)
  const floor_fraction = 0.04;
  const x = sd_ratio - 1.0;
  const decay = 1 / (1 + Math.exp(5.0 * (x - 0.7)));
  return base_price * (floor_fraction + (1 - floor_fraction) * decay);
}

// Market depth: more BESS chasing same DA spreads → less capture per battery.
// Coefficient 0.15: Baltic trades on Nord Pool (400+ GW pool), not a closed national market.
// 15% haircut at S/D 2.0 matches lower end of German capture decline.
function marketDepthFactor(sd_ratio) {
  const excess = Math.max(0, sd_ratio - 0.8);
  return 1.0 / (1.0 + 0.15 * excess);
}

// Bid-acceptance multiplier on per-product capacity + activation revenue.
// Smooth exponential decay calibrated for share-weighted per-product S/D.
// Output bounded [0.50, 0.95]. The reservePrice curve already handles aggregate
// market-tightness compression; this captures the additional per-product
// effect (FCR saturates faster than mFRR because TSO procurement depth differs
// AND each product's share of fleet bid varies).
// Calibrated to KKME's market view; coefficients live in code only.
function bidAcceptanceFactor(sd_ratio, _product) {
  const HIGH = 0.95;
  const FLOOR = 0.50;
  if (sd_ratio <= 1.0) return HIGH;
  return Math.max(FLOOR, HIGH * Math.exp(-0.04 * (sd_ratio - 1)));
}

// Compression curve (cpi shape) — same formula used by processFleet at the
// aggregate-trajectory site. Extracted as a helper so per-product variants
// can re-use the same curve shape with product-specific S/D inputs.
function cpiCurve(sd_ratio) {
  if (sd_ratio < 0.6) return Math.min(1.0 + (0.6 - sd_ratio) * 2.5, 2.0);
  if (sd_ratio < 1.0) return Math.max(0.30, 1.0 - (sd_ratio - 0.6) * 1.5);
  return Math.max(0.30, 0.40 - (sd_ratio - 1.0) * 0.08);
}

/**
 * Phase 35.1 — cpiCurve under a client scenario's floor.
 *
 * cpiCurve() above keeps its literal 0.30 floor rather than taking a parameter,
 * because its text is load-bearing twice over: it is the public /revenue path,
 * and it is the 34.4 overlay's substitution anchor. Re-parameterising it would
 * delete the anchor and break every batch-2 scenario runner.
 *
 * At the built-in floor this delegates, so there is exactly one evaluated path
 * for every pre-35.1 caller AND the overlay's substitution still reaches the
 * value the engine reports. Only a genuinely different floor takes the branch
 * below, which restates the curve with the floor substituted — the substitution
 * the overlay performed textually, performed numerically instead.
 *
 * That restatement is the one place in this port where a formula appears twice.
 * It is held to the original by a vitest sweeping cpiCurveScenario(sd, 0.30)
 * against cpiCurve(sd), so the copy cannot drift silently.
 *
 * Re-flooring the already-floored curve was tried first and is WRONG: the
 * built-in 0.30 binds at S/D ≥ 2.25, and the aFRR S/D ratio at COD is above
 * that in the Prosperus configs — so Downside's 0.28 is a floor the engine
 * actually reaches, not a dead parameter. (Caught by the batch-2 driver-echo
 * test, which is precisely what it exists for.)
 *
 * The field is disclosure-only either way — cpi_* have no revenue, EBITDA or
 * cash-flow path (batch-2's finding, DECISIONS 34.4-C) — but a disclosed number
 * that silently ignores the driver behind it is still a wrong number.
 */
function cpiCurveScenario(sd_ratio, floor = CPI_FLOOR_BUILTIN) {
  if (floor === CPI_FLOOR_BUILTIN) return cpiCurve(sd_ratio);
  if (sd_ratio < 0.6) return Math.min(1.0 + (0.6 - sd_ratio) * 2.5, 2.0);
  if (sd_ratio < 1.0) return Math.max(floor, 1.0 - (sd_ratio - 0.6) * 1.5);
  return Math.max(floor, 0.40 - (sd_ratio - 1.0) * 0.08);
}

/**
 * projectFleet: fleet supply projection per calendar year.
 * Uses S4 weighted_supply (confidence-weighted current fleet), applies
 * pipeline realisation rate to ADDITIONAL pipeline MW, then organic growth.
 */
// `realisation_override` (Phase 35.1) is the sensitivity runner's one-at-a-time
// pipeline-realisation probe. Undefined everywhere else, so the scenario-keyed
// lookup below is unchanged.
/**
 * Phase 36.D — supply basis for the named "Litgrid L TrSc basis" client
 * scenario. `false` is KKME's own projection and is what the public path
 * always uses; the 34.4 overlay flips it for that one scenario. Declared as a
 * module constant so the overlay has an anchor and the public path is
 * byte-identical by construction while it is off.
 */
const LITGRID_LT_SUPPLY_BASIS = false;

function projectFleet(cal_year, kv, scenario, realisation_override) {
  const fleet = kv.fleet || kv.s2 || {};

  // Current competitive supply from S4 (already confidence-weighted).
  // GROSS: the year-indexed absorption deduction is applied below, because how
  // much merchant capacity is contracted away changes with the year and this
  // function is called once per projected year.
  const current_weighted = fleet.baltic_weighted_mw || fleet.baltic_operational_mw || 672;

  // Additional pipeline MW (not yet built — raw, pre-realisation)
  const pipeline_raw = fleet.baltic_pipeline_mw || 866;

  // ── Named scenario: Litgrid's own Lithuanian build-out, as published ──────
  //
  // Replaces the LT share of projected supply with Litgrid's L TrSc series
  // verbatim — no realisation rate, no S-curve, no haircut of ours. EE and LV
  // stay on KKME's projection because Litgrid forecasts Lithuania and nothing
  // else, and Kruonis stays additive because the series is battery storage.
  //
  // Falls back to the standard projection for years Litgrid does not publish
  // (before 2028) rather than inventing a value for them.
  if (LITGRID_LT_SUPPLY_BASIS) {
    const lt = litgridLtSupplyMw(Math.round(cal_year));
    const countries = fleet.countries || {};
    if (lt !== null && countries.LT) {
      const nonLtWeighted = Object.entries(countries)
        .filter(([c]) => c !== 'LT')
        .reduce((s, [, v]) => s + (v.weighted_mw || 0), 0);
      const nonLtPipeline = Object.entries(countries)
        .filter(([c]) => c !== 'LT')
        .reduce((s, [, v]) => s + (v.pipeline_mw || 0), 0);
      const realis = realisation_override ?? (PIPELINE_REALISATION[scenario] || 0.50);
      const yrsIn = Math.max(0, cal_year - 2026);
      const deployF = Math.min(1.0, 1.0 / (1 + Math.exp(-0.6 * (yrsIn - 3.5))));
      const nonLt = nonLtWeighted + nonLtPipeline * realis * deployF;
      return Math.max(0, lt + nonLt + 205 - absorptionMw(Math.round(cal_year)));
    }
  }

  // Apply pipeline realisation (dropout rate)
  const realisation = realisation_override ?? (PIPELINE_REALISATION[scenario] || 0.50);
  const pipeline_effective = pipeline_raw * realisation;

  // Pipeline deploys on S-curve from 2026 (not all at once)
  // Y1 (COD 2028 = cal 2029): ~40% deployed. Y3: ~70%. Y5: ~95%.
  const deploy_start = 2026;
  const years_into = Math.max(0, cal_year - deploy_start);
  // Logistic S-curve: 30% at yr 1, 50% at yr 3, 85% at yr 5, 95% at yr 7
  const k = 0.6;
  const midpoint = 3.5;
  const deploy_fraction = Math.min(1.0, 1.0 / (1 + Math.exp(-k * (years_into - midpoint))));
  const pipeline_deployed = pipeline_effective * deploy_fraction;

  // Kruonis PSP (fixed mFRR competitor)
  const kruonis = 205;

  // Post-pipeline organic growth: 3%/yr, capped at 50% of base
  let organic = 0;
  const full_deploy_year = deploy_start + 7; // S-curve plateaus around year 7
  if (cal_year > full_deploy_year) {
    const yrs_post = cal_year - full_deploy_year;
    const base_total = current_weighted + pipeline_effective;
    organic = base_total * (Math.pow(1.03, yrs_post) - 1);
    organic = Math.min(organic, base_total * 0.5);
  }

  // Phase 36.D — deduct the MW contracted away from the merchant reserve pool
  // in THIS year by LT services KKME has no revenue line for. The trajectory
  // matters: 200 MW today (Energy Cells' legally-reserved IZDR), 500 MW from
  // 2028 once GAGAP and the LT-PL service are procured, back to 354 MW from
  // 2033 when the IZDR reservation lapses and the LT-PL service ends with
  // Harmony Link. Never below zero.
  const absorbed = absorptionMw(Math.round(cal_year));
  return Math.max(0, current_weighted + pipeline_deployed + kruonis + organic - absorbed);
}

/**
 * projectDemand: reserve demand projection per calendar year.
 *
 * Phase 36.D — was `base_demand × 1.02^(y−2026)`: an unsourced level (935, via
 * the KV write path) compounded at an unsourced rate. Both halves are now the
 * tri-TSO Baltic LFC-block procurement series, published year by year to 2035
 * and extrapolated per component beyond it. For the record the old 2.00 %/yr
 * guess was close — the published series grows at 2.29 %/yr — but the level was
 * 24 % above the TSOs' own 2026 figure.
 *
 * `demand_growth` is retained as a scenario driver: it now scales the module's
 * published trajectory rather than replacing it, so a client scenario can still
 * ask "what if reserve demand grows faster than the TSOs project" without
 * detaching from the source. At the default 0.02 the multiplier is 1.0 and the
 * module's series is used unmodified.
 */
const DEMAND_GROWTH_BASELINE = 0.02;

function projectDemand(cal_year, kv, demand_growth = DEMAND_GROWTH_BASELINE) {
  const year = Math.round(cal_year);
  const published = addressableDemandMw(year);
  if (demand_growth === DEMAND_GROWTH_BASELINE) return published;
  const yrs = Math.max(0, year - 2026);
  return published * Math.pow((1 + demand_growth) / (1 + DEMAND_GROWTH_BASELINE), yrs);
}

/**
 * computeTradingMix: price-ratio revenue mix with S/D elasticity.
 *
 * R = reserve value per MW-hour, compressed via S/D elasticity curve.
 *   Capacity follows elasticity directly; activation 15% steeper.
 * T = trading value per MW-hour × intraday uplift, grows 2%/yr (base).
 * trading_fraction = min(0.70, (T / (T + R)) × 0.75)
 *
 * One tunable: switching_friction (0.75). Everything else from signals.
 */
// Lithuania renewable share trajectory (national targets + EU mandates)
// 2025: ~50%, 2030: 70%, 2040: 95%, 2050: 100%
function renewableShareYr(cal_year) {
  if (cal_year <= 2025) return 0.50;
  if (cal_year >= 2050) return 1.00;
  if (cal_year <= 2030) return 0.50 + (0.70 - 0.50) * (cal_year - 2025) / 5;
  if (cal_year <= 2040) return 0.70 + (0.95 - 0.70) * (cal_year - 2030) / 10;
  return 0.95 + (1.00 - 0.95) * (cal_year - 2040) / 10;
}

// Spread multiplier: more renewables → more intermittency → wider DA spreads
// 1pp renewable share → 1.2pp wider spread (calibrated to Y20 trading ~65-70%)
// Baringa: post-sync Baltic will see "additional volatility" from reduced interconnection + RES
function spreadMultiplierYr(cal_year) {
  const share_baseline = 0.50; // 2025 Lithuania renewable share
  const share_yr = renewableShareYr(cal_year);
  const elasticity = 2.0;
  return 1 + (share_yr - share_baseline) * elasticity;
}

// Constant switching friction — base year already reflects market maturity.
const FRICTION_IMMATURE = 0.75;  // kept for backward compat in output
const FRICTION_MATURE = 0.75;
const MATURITY_YEARS = 0;

function switchingFriction(yr) {
  return 0.75;
}

// `drv` (Phase 35.1) carries the scenario drivers that have no scenario-keyed
// home in the engine, plus the one-at-a-time overrides the sensitivity runner
// needs. It defaults to the set the scenario NAME implies — ×1.0 and no
// overrides for all three public scenarios, so /revenue is unchanged.
//
// It is passed explicitly where the run scenario and the client scenario differ:
// the bankability DSCR probe re-runs at 'conservative' while still sitting
// inside a client scenario, and the 34.4 overlay's capPrice substitution was
// global, so that probe saw the delta too.
function computeTradingMix(kv, dur_h, cal_year, scenario, sc, yr = 1, drv = scenarioDrivers(scenario)) {
  const cap_mult = drv.cap_price_mult;
  const rte = rteBolFor(dur_h); // canonical RTE_BOL under the 36.B5 duration policy
  const trading_real = sc.trd_real || 0.85;
  const friction = switchingFriction(yr);

  const s2 = kv.s2 || {};
  const act = kv.s2_activation_parsed || {};
  const s1_cap = kv.s1_capture || {};

  // R base: per-product capacity + activation per MW-hour. Decomposed so each
  // product can carry its own forward S/D and bid-acceptance compression.
  const afrr_share = 0.40, mfrr_share = 0.60;
  const afrr_cap = capPrice('afrr', s2.afrr_cap_avg, cap_mult);
  const mfrr_cap = capPrice('mfrr', s2.mfrr_cap_avg, cap_mult);
  const afrr_clearing = act.lt?.afrr_p50 ?? 171;
  const mfrr_clearing = act.lt?.mfrr_p50 ?? 81;

  const R_cap_afrr_base = afrr_share * afrr_cap;
  const R_cap_mfrr_base = mfrr_share * mfrr_cap;
  // R activation calibration anchors — preserved as v7.2 act_rate-based
  // for elasticity model continuity (cycle-accounting goes through the
  // throughput surface separately).
  const R_act_afrr_base = afrr_share * sc.act_rate_afrr * afrr_clearing * 0.55;
  const R_act_mfrr_base = mfrr_share * sc.act_rate_mfrr * mfrr_clearing * 0.75;

  const R_cap_base = R_cap_afrr_base + R_cap_mfrr_base;
  const R_act_base = R_act_afrr_base + R_act_mfrr_base;
  const R_base = R_cap_base + R_act_base;

  // T base: market-level trading signal (same for all durations)
  // Uses rolling 30d mean (stable) rather than spot capture (volatile).
  // Fixed 4H reference cycle — the trade-vs-reserve decision is MARKET-level.
  const REFERENCE_CYCLE_H = 4;
  const s1_capture_ref = s1_cap.rolling_30d?.stats_4h?.mean
    ?? s1_cap.capture_4h?.gross_eur_mwh ?? 125;
  const T_base = s1_capture_ref * rte * trading_real / (2 * REFERENCE_CYCLE_H);

  // Aggregate S/D (kept for trading_fraction price-ratio + payload reporting)
  const supply = projectFleet(cal_year, kv, scenario, drv.fleet_realisation);
  const demand_growth = sc.demand_growth ?? 0.02;
  const demand = projectDemand(cal_year, kv, demand_growth);
  const sd_yr = supply / demand;

  // Per-product S/D — share-weighted: each operator only bids the product's
  // RESERVE_PRODUCTS share into that product (hierarchy-driven SoC allocation),
  // not full nameplate. So sd = (fleet × share) / TSO procurement.
  // FCR exposed as diagnostic; aFRR + mFRR drive the actual R formula.
  //
  // Phase 36.D — per-product demand now comes from the same canonical module as
  // the aggregate, year-indexed. It used to read `kv.fleet.product_sd[p]`,
  // i.e. the CURRENT-year figure the fleet payload happened to carry, and
  // compound it at the aggregate growth rate; the products have different
  // published trajectories (mFRR 604→754, FCR 28→48, aFRR flat), so one shared
  // rate was wrong for all three. `demand_growth` still applies as a scenario
  // multiplier, on the same relative basis as projectDemand.
  const yrs_from_2026 = Math.max(0, cal_year - 2026);
  const dem_scenario_factor = demand_growth === DEMAND_GROWTH_BASELINE
    ? 1
    : Math.pow((1 + demand_growth) / (1 + DEMAND_GROWTH_BASELINE), yrs_from_2026);
  const product_demand_map = productDemandMap(Math.round(cal_year));
  const product_demand = (p) => product_demand_map[p] * dem_scenario_factor;
  const fcr_sd_yr  = (supply * RESERVE_PRODUCTS.fcr.share)  / product_demand('fcr');
  const afrr_sd_yr = (supply * RESERVE_PRODUCTS.afrr.share) / product_demand('afrr');
  const mfrr_sd_yr = (supply * RESERVE_PRODUCTS.mfrr.share) / product_demand('mfrr');

  // Bid-acceptance is binary at the product level: if a product's bid doesn't
  // clear, neither capacity nor activation revenue from that product is earned.
  // Mirrors the dispatch endpoint pattern at line 305 (cleared MW, not bid MW).
  const fcr_acc  = bidAcceptanceFactor(fcr_sd_yr,  'fcr');
  const afrr_acc = bidAcceptanceFactor(afrr_sd_yr, 'afrr');
  const mfrr_acc = bidAcceptanceFactor(mfrr_sd_yr, 'mfrr');

  // Compression: aggregate-sd reservePrice (preserves v7 curve calibration)
  // × per-product bid-acceptance (the v7.1 refinement — FCR saturates faster
  // than mFRR because TSO procurement depth differs by product). Activation
  // uses 1.15× steeper S/D curve as in v7.
  const R_cap_afrr_yr = reservePrice(sd_yr,        R_cap_afrr_base) * afrr_acc;
  const R_cap_mfrr_yr = reservePrice(sd_yr,        R_cap_mfrr_base) * mfrr_acc;
  const R_act_afrr_yr = reservePrice(sd_yr * 1.15, R_act_afrr_base) * afrr_acc;
  const R_act_mfrr_yr = reservePrice(sd_yr * 1.15, R_act_mfrr_base) * mfrr_acc;

  const R_cap_yr = R_cap_afrr_yr + R_cap_mfrr_yr;
  const R_act_yr = R_act_afrr_yr + R_act_mfrr_yr;
  const R_yr = R_cap_yr + R_act_yr;

  // T: grows with renewable penetration (more RES → more volatility → wider spreads)
  // Replaces r_proximity deceleration — spread growth is SUPPLY-driven, not R-driven
  const T_floor = 5.0;
  const spread_mult = spreadMultiplierYr(cal_year);
  // Scenario adjustment: conservative = no additional RES boost, stress = negative
  const scenario_spread_adj = drv.spread_growth ?? SPREAD_GROWTH[scenario] ?? 0.02;
  const scenario_factor = Math.pow(1 + scenario_spread_adj, yrs_from_2026);
  const T_yr = Math.max(T_floor, T_base * spread_mult * scenario_factor);

  const raw = T_yr / (T_yr + R_yr);
  const tf = Math.min(0.70, raw * friction);

  return {
    trading_fraction: tf,
    reserve_fraction: 1 - tf,
    switching_friction: friction,
    R: Math.round(R_yr * 100) / 100,
    T: Math.round(T_yr * 100) / 100,
    T_raw: T_yr,
    price_ratio: R_yr > 0 ? Math.round((T_yr / R_yr) * 1000) / 1000 : 99,
    R_base: Math.round(R_base * 100) / 100,
    T_base: Math.round(T_base * 100) / 100,
    sd_ratio: Math.round(sd_yr * 100) / 100,
    supply_mw: Math.round(supply),
    demand_mw: Math.round(demand),
    spread_mult: Math.round(spread_mult * 1000) / 1000,
    renewable_share: Math.round(renewableShareYr(cal_year) * 1000) / 1000,
    // v7.1 per-product breakdown — input to per-product compression + bid acceptance.
    // FCR diagnostic-only (not in R formula; matches v7 architectural treatment).
    per_product: {
      fcr: {
        sd_ratio:       Math.round(fcr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(fcr_acc * 100) / 100,
      },
      afrr: {
        sd_ratio:       Math.round(afrr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(afrr_acc * 100) / 100,
        R_cap_yr:       Math.round(R_cap_afrr_yr * 100) / 100,
        R_act_yr:       Math.round(R_act_afrr_yr * 100) / 100,
      },
      mfrr: {
        sd_ratio:       Math.round(mfrr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(mfrr_acc * 100) / 100,
        R_cap_yr:       Math.round(R_cap_mfrr_yr * 100) / 100,
        R_act_yr:       Math.round(R_act_mfrr_yr * 100) / 100,
      },
    },
  };
}

/**
 * computeEffectiveArbPct: LEGACY — kept for backtest backward compat.
 * Replaced by computeTradingMix for main revenue engine.
 */
function computeEffectiveArbPct(kv, sc) {
  const dm = kv.dispatch_metrics?.rolling_30d;
  // MW is blocked from trading during activation (energy dispatch) AND during idle-committed
  // time when SoC must be maintained for potential activation. Headroom drag captures the
  // partial block from SoC management: r = activation + 0.70 × (1 - activation).
  // With activation rates ~0.18/0.10, this gives r ≈ 0.75/0.73 → arb_pct ≈ 0.20 → ~12-15% trading.
  const HEADROOM_DRAG = 0.70;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const r_a = act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75;
  const r_m = act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80;
  const p_avail = sc.avail;
  const fcr_share  = RESERVE_PRODUCTS.fcr.share;
  const afrr_share = RESERVE_PRODUCTS.afrr.share;
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share;
  // FCR always-on. When both aFRR+mFRR active → arb gets 0.
  // When aFRR drops → afrr_share freed. When mFRR drops → mfrr_share freed.
  return (
    Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share)) * r_a * r_m +
    (p_avail * afrr_share) * r_m * (1 - r_a) +
    (p_avail * mfrr_share) * r_a * (1 - r_m) +
    (p_avail * (afrr_share + mfrr_share)) * (1 - r_a) * (1 - r_m)
  );
}

/**
 * computeEffectiveArbPctForYear: time-sliced arb for a specific projection year.
 * As balancing compresses, reserve utilisation declines → more MW-hours for arb.
 */
function computeEffectiveArbPctForYear(kv, sc, reserve_shift) {
  const dm = kv.dispatch_metrics?.rolling_30d;
  // Same headroom-drag model as computeEffectiveArbPct
  const HEADROOM_DRAG = 0.70;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const r_a_base = act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75;
  const r_m_base = act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80;
  const r_a = r_a_base * reserve_shift;
  const r_m = r_m_base * reserve_shift;
  const p_avail = sc.avail;
  const fcr_share  = RESERVE_PRODUCTS.fcr.share;
  const afrr_share = RESERVE_PRODUCTS.afrr.share;
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share;
  return (
    Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share)) * r_a * r_m +
    (p_avail * afrr_share) * r_m * (1 - r_a) +
    (p_avail * mfrr_share) * r_a * (1 - r_m) +
    (p_avail * (afrr_share + mfrr_share)) * (1 - r_a) * (1 - r_m)
  );
}

/**
 * computeBaseYear: builds trailing 12-month observed revenue from S1 monthly
 * captures (KV: s1_capture) + S2 monthly activation data (KV: s2_activation).
 *
 * Returns per-MW monthly breakdown + annual totals.
 * All values are per MW installed.
 * Time-sliced: arb only earns in ISPs where reserves aren't procured.
 */
// `drivers` / `rte_decay` (Phase 35.1) carry the client scenario's non-keyed
// drivers. Both default to the engine's shipped behaviour, so every pre-35.1
// caller — including the whole public /revenue path — is unaffected.
function computeBaseYear(kv, duration_h, sc, scenario_name = 'base', rte_decay, drv = scenarioDrivers(scenario_name)) {
  const cap_mult = drv.cap_price_mult;
  const rte_curve = rteCurveFor(duration_h, undefined, rte_decay);
  const rte = rte_curve[0];
  // v7.3: throughput-derived DA daily MWh per MW (replaces dur_h × cycles).
  const tp = computeThroughputBreakdown(1, duration_h, sc);
  const da_mwh_per_mw_day = tp.da_mwh / 365;

  // ── S1 monthly captures (observed DA capture in €/MWh) ──
  const s1_capture = kv.s1_capture || {};
  const s1_monthly = s1_capture.monthly || [];

  // Take trailing 12 full months (exclude current partial month)
  const now = new Date();
  const cur_month = now.toISOString().slice(0, 7);
  const full_months = s1_monthly.filter(m => m.month < cur_month && m.days >= 15);
  const t12 = full_months.slice(-12);

  if (t12.length < 3) {
    return {
      period: 'insufficient data',
      months: [],
      annual_totals: { trading: 0, balancing: 0, gross: 0, net: 0 },
      data_coverage: { s1_months: t12.length, s2_months: 0, pct_observed: 0 },
      time_model: null,
    };
  }

  // ── Time-slicing: compute effective arb MW-hours from dispatch metrics ──
  // Headroom drag: committed-but-idle MW is partially blocked by SoC management.
  // r = activation_rate + 0.70 × (1 - activation_rate)
  const HEADROOM_DRAG = 0.70;
  const dm = kv.dispatch_metrics?.rolling_30d;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const reserve_hours = dm
    ? {
        afrr: act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75,
        mfrr: act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80,
        source: 'dispatch_observed_30d',
      }
    : { afrr: 0.75, mfrr: 0.80, source: 'assumed_default' };

  const r_a = reserve_hours.afrr;
  const r_m = reserve_hours.mfrr;
  const both_pct      = r_a * r_m;
  const only_mfrr_pct = r_m * (1 - r_a);
  const only_afrr_pct = r_a * (1 - r_m);
  const neither_pct   = (1 - r_a) * (1 - r_m);

  const fcr_share  = RESERVE_PRODUCTS.fcr.share;  // 0.16 — always-on, always reserved
  const afrr_share = RESERVE_PRODUCTS.afrr.share; // 0.34
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share; // 0.50
  const p_avail = sc.avail; // 0.95

  // Available fraction of MW for arb in each time slice
  // FCR is always-on (symmetric, procured continuously), so always reserved.
  // When both aFRR+mFRR active: FCR+aFRR+mFRR = 1.00 → arb gets 0
  // When aFRR drops: FCR+mFRR = 0.66 → aFRR share (0.34) freed for arb
  // When mFRR drops: FCR+aFRR = 0.50 → mFRR share (0.50) freed for arb
  // When both drop: FCR only = 0.16 → aFRR+mFRR (0.84) freed for arb
  const arb_mw_both      = Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share));
  const arb_mw_only_mfrr = p_avail * afrr_share;   // aFRR MW freed when aFRR not procured
  const arb_mw_only_afrr = p_avail * mfrr_share;   // mFRR MW freed when mFRR not procured
  const arb_mw_neither   = p_avail * (afrr_share + mfrr_share); // both freed, FCR stays

  // Weighted effective arb as fraction of total MW-hours
  const effective_arb_pct =
    arb_mw_both * both_pct +
    arb_mw_only_mfrr * only_mfrr_pct +
    arb_mw_only_afrr * only_afrr_pct +
    arb_mw_neither * neither_pct;
  // With defaults (r_a=0.80, r_m=0.90): ~0 × 0.72 + 0.323 × 0.18 + 0.475 × 0.08 + 0.95 × 0.02 ≈ 0.115

  const time_model = {
    reserve_hours_afrr: Math.round(r_a * 100) / 100,
    reserve_hours_mfrr: Math.round(r_m * 100) / 100,
    both_reserves_pct: Math.round(both_pct * 1000) / 1000,
    only_mfrr_pct: Math.round(only_mfrr_pct * 1000) / 1000,
    only_afrr_pct: Math.round(only_afrr_pct * 1000) / 1000,
    neither_pct: Math.round(neither_pct * 1000) / 1000,
    effective_arb_pct: Math.round(effective_arb_pct * 1000) / 1000,
    source: reserve_hours.source,
    note: `${Math.round(effective_arb_pct * 100)}% of MW-hours available for trading`,
  };

  // ── Price-ratio mix for Y1 (used to split monthly trading/balancing) ──
  // Base year uses current S/D (2026 calendar year) — no forward compression
  const y1_mix = computeTradingMix(kv, duration_h, 2026, scenario_name, sc, 1, drv);
  time_model.trading_fraction = y1_mix.trading_fraction;
  time_model.R_base = y1_mix.R_base;
  time_model.T_base = y1_mix.T_base;
  time_model.price_ratio = y1_mix.price_ratio;

  // ── S2 activation monthly data ──
  const act = kv.s2_activation_parsed || {};
  const lt_afrr_monthly = act.lt_monthly_afrr || {};  // { '2025-10': { avg, p50, ... }, ... }
  const lt_mfrr_monthly = act.lt_monthly_mfrr || {};

  // ── S2 capacity monthly ──
  const cap_monthly_arr = kv.capacity_monthly || [];   // [{ month, afrr_avg, mfrr_avg, fcr_avg, days }]
  const cap_by_month = {};
  for (const c of cap_monthly_arr) cap_by_month[c.month] = c;

  // Current S2 averages as fallback
  const s2 = kv.s2 || {};
  const fb_afrr_cap = capPrice('afrr', s2.afrr_cap_avg, cap_mult);
  const fb_mfrr_cap = capPrice('mfrr', s2.mfrr_cap_avg, cap_mult);
  const fb_fcr_cap  = capPrice('fcr',  s2.fcr_cap_avg,  cap_mult);
  const fb_afrr_clearing = kv.s2_activation_parsed?.lt?.afrr_p50 ?? 170;
  const fb_mfrr_clearing = kv.s2_activation_parsed?.lt?.mfrr_p50 ?? 110;

  const months = [];
  let s2_months_observed = 0;

  for (const m of t12) {
    const month = m.month;
    const days = m.days || 30;

    // ── Capture for this month (used for trading value calculation) ──
    const capture = durBlend(duration_h,
      m.avg_gross_2h || m.avg_net_2h || 140,
      m.avg_gross_4h || m.avg_net_4h || 125);

    // ── Balancing revenue ──
    const afrr_act_m = lt_afrr_monthly[month];
    const mfrr_act_m = lt_mfrr_monthly[month];
    const cap_m = cap_by_month[month];
    const has_s2 = !!(afrr_act_m || mfrr_act_m || cap_m);
    if (has_s2) s2_months_observed++;

    // Capacity prices (€/MW/h)
    const afrr_cap_h = cap_m?.afrr_avg != null ? capPrice('afrr', cap_m.afrr_avg, cap_mult) : fb_afrr_cap;
    const mfrr_cap_h = cap_m?.mfrr_avg != null ? capPrice('mfrr', cap_m.mfrr_avg, cap_mult) : fb_mfrr_cap;
    const fcr_cap_h  = cap_m?.fcr_avg  != null ? capPrice('fcr',  cap_m.fcr_avg,  cap_mult)  : fb_fcr_cap;

    // Activation clearing (€/MWh) — use p50
    const afrr_clearing = afrr_act_m?.p50 ?? fb_afrr_clearing;
    const mfrr_clearing = mfrr_act_m?.p50 ?? fb_mfrr_clearing;

    // Activation calibration anchors — preserved as v7.2 act_rate-based.
    const afrr_rate = sc.act_rate_afrr;
    const mfrr_rate = sc.act_rate_mfrr;

    const hours = days * 24;

    // Per MW installed: capacity revenue is per share × cap-price × hours.
    const rev_cap = (
      RESERVE_PRODUCTS.fcr.share  * sc.avail * fcr_cap_h +
      RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_cap_h +
      RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_cap_h
    ) * hours;

    const rev_act = (
      RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_rate * afrr_clearing * 0.55 +
      RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_rate * mfrr_clearing * 0.75
    ) * hours;

    const bal_monthly = (rev_cap + rev_act) * sc.bal_mult * sc.real_factor;

    // ── Trading: capture × RTE × realisation × DA-MWh × fraction × days ──
    // v7.3 throughput-derived: DA daily MWh per MW × days = monthly DA MWh.
    const trd_monthly = capture * rte * (sc.trd_real || 0.85) * da_mwh_per_mw_day
                      * y1_mix.trading_fraction * days;

    // ── Gross / Net ──
    const gross = trd_monthly + bal_monthly;
    const rtm_fee = gross * sc.rtm_fee_pct;
    const brp_fee = sc.brp_fee_yr / 12;  // per MW per month (brp_fee_yr is for 50MW fleet, so /50 later)
    const net = gross - rtm_fee - brp_fee / 50;  // brp_fee is fleet-level

    months.push({
      month,
      trading: Math.round(trd_monthly),
      balancing: Math.round(bal_monthly),
      gross: Math.round(gross),
      net: Math.round(net),
      capture: Math.round(capture * 10) / 10,
      days,
      source: has_s2 ? 'observed+observed' : 'observed+proxy',
    });
  }

  // ── Annualise: if <12 months, scale up proportionally ──
  const total_days = months.reduce((s, m) => s + m.days, 0);
  const scale = total_days > 0 ? 365 / total_days : 1;

  const annual = {
    trading:  Math.round(months.reduce((s, m) => s + m.trading, 0) * scale),
    balancing: Math.round(months.reduce((s, m) => s + m.balancing, 0) * scale),
    gross:    Math.round(months.reduce((s, m) => s + m.gross, 0) * scale),
    net:      Math.round(months.reduce((s, m) => s + m.net, 0) * scale),
  };

  return {
    period: t12.length >= 2
      ? `${t12[0].month} to ${t12[t12.length - 1].month}`
      : 'insufficient data',
    months,
    annual_totals: annual,
    trading_realisation: sc.trd_real,
    trading_realisation_source: 'measured_kkme_dispatch_backtest_2025_07_to_2026_06',
    time_model,
    data_coverage: {
      s1_months: t12.length,
      s2_months: s2_months_observed,
      total_days,
      pct_observed: Math.round((s2_months_observed / Math.max(t12.length, 1)) * 100),
    },
  };
}

/**
 * deriveCompression: extract annual compression rate from S2 observed
 * activation price trajectory (aFRR p50 series).
 *
 * The series 738 → 514 → 306 → 159 → 174 → 171 covers 2025-10 to 2026-03.
 * We use the full window to capture the structural compression,
 * then use recent 3-month for current-pace estimate.
 */
function deriveCompression(kv) {
  // Primary: S2 activation compression trajectory
  const act = kv.s2_activation_parsed || {};
  const compression = act.compression || {};
  const p50_series = compression.afrr_lt_p50 || [];
  const comp_months = compression.months || [];

  if (p50_series.length >= 4) {
    // Use first 4 months (rapid initial compression) vs last 3 (stabilisation)
    const initial = p50_series[0];
    const recent_3 = p50_series.slice(-3);
    const recent_avg = recent_3.reduce((s, v) => s + v, 0) / recent_3.length;

    // Total compression over the observation window
    const months_span = p50_series.length - 1;
    const total_compression = 1 - (recent_avg / initial);

    // Annualised: compound monthly rate → annual
    const monthly_rate = 1 - Math.pow(recent_avg / initial, 1 / months_span);
    const annual_rate_raw = 1 - Math.pow(1 - monthly_rate, 12);

    // But the initial spike (738→159) was post-sync anomaly normalisation,
    // not steady-state compression. For forward projection, use the recent
    // 3-month trend which shows stabilisation (159→174→171).
    let forward_rate;
    if (recent_3.length >= 3) {
      const r_first = recent_3[0];
      const r_last = recent_3[recent_3.length - 1];
      const r_span = recent_3.length - 1;
      if (r_first > 0 && r_last > 0) {
        const r_monthly = 1 - Math.pow(r_last / r_first, 1 / r_span);
        forward_rate = Math.max(0, 1 - Math.pow(1 - r_monthly, 12));
      }
    }
    // If recent trend is flat/slightly negative, use minimum structural compression
    if (forward_rate == null || forward_rate < 0.01) forward_rate = 0.03;

    return {
      rate: Math.max(0.01, Math.min(0.15, forward_rate)),
      rate_full_window: Math.round(annual_rate_raw * 1000) / 1000,
      source: 'derived_from_s2_activation',
      data_points: p50_series.length,
      window: comp_months.length >= 2 ? `${comp_months[0]} to ${comp_months[comp_months.length - 1]}` : null,
      initial_p50: initial,
      recent_avg_p50: Math.round(recent_avg * 10) / 10,
      note: 'Forward rate from recent 3m trend; full-window rate includes post-sync normalisation',
    };
  }

  // Fallback: fleet trajectory S/D growth → implied compression
  const trajectory = kv.fleet?.trajectory || kv.s2?.trajectory || [];
  if (trajectory.length >= 2) {
    const sd_0 = trajectory[0]?.sd_ratio || 1.16;
    const sd_n = trajectory[trajectory.length - 1]?.sd_ratio || 1.9;
    const yrs = trajectory.length - 1;
    const implied = Math.pow(sd_n / sd_0, 1 / yrs) - 1;
    return {
      rate: Math.max(0.02, Math.min(0.10, implied * 0.7)),
      source: 'derived_from_fleet_trajectory',
      data_points: trajectory.length,
    };
  }

  return { rate: 0.05, source: 'assumed_default', data_points: 0 };
}

/**
 * computeLiveRate: today's revenue run-rate vs base year average.
 * Returns per-MW daily values.
 */
function computeLiveRate(kv, base_year, duration_h, sc) {
  const s1 = kv.s1 || {};
  const s2 = kv.s2 || {};
  const act = kv.s2_activation_parsed || {};
  const rte = rteCurveFor(duration_h)[0];
  // v7.3: throughput-derived DA daily MWh per MW.
  const tp_lr = computeThroughputBreakdown(1, duration_h, sc);
  const da_mwh_per_mw_day_lr = tp_lr.da_mwh / 365;

  // Today's capture from S1 (use the capture endpoint data first, then spread-based)
  const s1_cap = kv.s1_capture || {};
  const capture = durBlend(duration_h,
    s1_cap.capture_2h?.gross_eur_mwh || s1?.capture_2h_gross || s1?.gross_2h
      || (s1.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 * 1.12 : 140),
    s1_cap.capture_4h?.gross_eur_mwh || s1?.capture_4h_gross || s1?.gross_4h
      || (s1.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 : 125));

  // Price-ratio mix: today's trading = balancing × (tf / (1 - tf))
  // Compute balancing first, then derive trading from the Y1 price-ratio

  // Today's balancing from S2
  const afrr_cap = capPrice('afrr', s2.afrr_cap_avg);
  const mfrr_cap = capPrice('mfrr', s2.mfrr_cap_avg);
  const fcr_cap  = capPrice('fcr',  s2.fcr_cap_avg);
  const afrr_clearing = act.lt?.afrr_p50 ?? 170;
  const mfrr_clearing = act.lt?.mfrr_p50 ?? 110;

  const today_balancing = (
    RESERVE_PRODUCTS.fcr.share  * sc.avail * fcr_cap +
    RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_cap +
    RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_cap +
    RESERVE_PRODUCTS.afrr.share * sc.avail * sc.act_rate_afrr * afrr_clearing * 0.55 +
    RESERVE_PRODUCTS.mfrr.share * sc.avail * sc.act_rate_mfrr * mfrr_clearing * 0.75
  ) * 24 * sc.bal_mult * sc.real_factor;

  // Trading: capture × RTE × realisation × DA-MWh × fraction (per MW per day)
  const lr_mix = base_year?.time_model?.trading_fraction != null
    ? { trading_fraction: base_year.time_model.trading_fraction }
    : computeTradingMix(kv, duration_h, 2026, 'base', sc);
  const trading_real = sc.trd_real || 0.85;
  const today_trading = capture * rte * trading_real * da_mwh_per_mw_day_lr * lr_mix.trading_fraction;

  const today_total = today_trading + today_balancing;
  const base_daily = base_year?.annual_totals?.gross > 0
    ? base_year.annual_totals.gross / 365
    : today_total;  // if no base year, delta = 0%
  const delta_pct = base_daily > 0
    ? Math.round(((today_total / base_daily) - 1) * 100)
    : 0;

  return {
    today_trading_daily: Math.round(today_trading),
    today_balancing_daily: Math.round(today_balancing),
    today_total_daily: Math.round(today_total),
    base_daily: Math.round(base_daily),
    delta_pct,
    annualised: Math.round(today_total * 365),
    capture_used: Math.round(capture * 10) / 10,
    as_of: s1.updated_at || new Date().toISOString(),
  };
}

// ─── Revenue Engine v4 (legacy — kept for reference) ──────────────────────────
// DEAD CODE: zero callers (verified Phase 32.1). Its internal `rte = 0.87` is a
// stale parallel literal, NOT reconciled to canonical RTE_BOL because nothing
// consumes it. Delete when the v4 reference is no longer wanted.

function computeRevenue_legacy(systemKey, capexKey, grantKey, codYear, kv, mwParam, mwhParam) {
  const SYSTEMS = {
    '2h':   { mw: 50, mwh: 100, duration: 2.0, label: '50 MW / 100 MWh (2H)' },
    '2.4h': { mw: 50, mwh: 120, duration: 2.4, label: '50 MW / 120 MWh (2.4H)' },
    '4h':   { mw: 50, mwh: 200, duration: 4.0, label: '50 MW / 200 MWh (4H)' },
  };
  const CAPEX_S = {
    low:  { eur_kwh: 120, label: '€120/kWh (competitive)' },
    mid:  { eur_kwh: 164, label: 'CH Equipment (€164/kWh)' },
    high: { eur_kwh: 262, label: 'CH Turnkey (€262/kWh)' },
  };
  const GRANTS = {
    none:    { pct: 0,    label: 'No grant' },
    partial: { pct: 0.10, label: '10% grant' },
    full:    { pct: 0.30, label: '30% APVA grant' },
  };

  const sys      = SYSTEMS[systemKey]  || SYSTEMS['2.4h'];
  const capex_sc = CAPEX_S[capexKey]   || CAPEX_S['mid'];
  const grant_sc = GRANTS[grantKey]    || GRANTS['none'];
  const cod      = parseInt(codYear)   || 2028;
  const mw       = mwParam  || sys.mw;
  const mwh      = mwhParam || sys.mwh;
  const fcr_alloc  = Math.round(mw * 0.16);
  const afrr_alloc = Math.round(mw * 0.34);
  const alloc = { fcr: fcr_alloc, afrr: afrr_alloc, mfrr: mw - fcr_alloc - afrr_alloc };

  const fleet = kv?.fleet;
  const s2    = kv?.s2;
  const s1    = kv?.s1;

  // Live prices from BTD (s2 KV)
  const prices = {
    fcr:  { price: s2?.fcr_avg      ?? 45, avail: 0.92 },
    afrr: { price: s2?.afrr_up_avg  ?? 40, avail: 0.85 },
    mfrr: { price: s2?.mfrr_up_avg  ?? 22, avail: 0.80 },
  };
  const prices_source = s2?.fcr_avg != null ? 'BTD parsed; calibrated capacity (review pending)' : 'proxy';

  const ACT = {
    afrr: { rate: 0.18, depth: 0.55, margin: 40 },
    mfrr: { rate: 0.10, depth: 0.75, margin: 55 },
  };

  const p_high       = s1?.p_high_avg || 120;
  const p_low        = s1?.p_low_avg  || 55;
  const rte          = 0.87;
  const reserve_drag = 0.60;
  const cycles_day   = 0.9;
  const op_days      = 300;

  const gross_capex  = capex_sc.eur_kwh * mwh * 1000;
  const grant_amount = Math.round(gross_capex * (grant_sc.pct || 0));
  const net_capex    = gross_capex - grant_amount;
  const bond         = 2500000;

  const debt_pct     = 0.55;
  const interest_r   = 0.045;
  const tenor        = 8;
  const grace        = 1;
  const total_debt   = Math.round(net_capex * debt_pct);
  const total_equity = net_capex - total_debt;
  const annual_prin  = Math.round(total_debt / tenor);

  const tax_rate    = 0.17;
  const depr_years  = 10;
  const depr_base   = gross_capex - bond;
  const annual_depr = depr_base / depr_years;
  const aug_capex   = mwh * 25 * 1000;
  const aug_year    = 10;
  const aug_depr    = aug_capex / depr_years;

  const opex_y1  = mw * 39000;
  const opex_esc = 0.025;

  function getCPI(year) {
    if (fleet?.trajectory && Array.isArray(fleet.trajectory)) {
      const t = fleet.trajectory.find(p => p.year === year);
      if (t?.cpi != null) return t.cpi;
    }
    const y = year - cod;
    const r = (fleet?.sd_ratio ?? 0.83) + Math.max(y, 0) * 0.15;
    if (r < 0.6) return Math.min(1.0 + (0.6 - r) * 2.5, 2.0);
    if (r < 1.0) return Math.max(0.40, 1.0 - (r - 0.6) * 1.5);
    return Math.max(0.40, 0.40 - (r - 1.0) * 0.05);
  }

  const project_cf = [-net_capex];
  const equity_cf  = [-total_equity];
  const years      = [];
  let debt_balance  = total_debt;
  let cum_equity    = -total_equity;
  let payback_year  = null;

  for (let y = 1; y <= 20; y++) {
    const cal_year = cod + y - 1;
    const cpi      = getCPI(cal_year);
    const deg_y    = y <= aug_year ? y - 1 : y - aug_year - 1;
    const eff_mwh  = mwh * Math.pow(0.975, deg_y);

    const fcr_rev  = alloc.fcr  * prices.fcr.price  * 8760 * prices.fcr.avail  * cpi;
    const afrr_rev = alloc.afrr * prices.afrr.price * 8760 * prices.afrr.avail * cpi;
    const mfrr_rev = alloc.mfrr * prices.mfrr.price * 8760 * prices.mfrr.avail * cpi;
    const cap_total = fcr_rev + afrr_rev + mfrr_rev;

    const afrr_act = alloc.afrr * ACT.afrr.rate * ACT.afrr.depth * 8760 * ACT.afrr.margin * cpi;
    const mfrr_act = alloc.mfrr * ACT.mfrr.rate * ACT.mfrr.depth * 8760 * ACT.mfrr.margin * cpi;
    const act_total = afrr_act + mfrr_act;

    const spread_decay  = Math.pow(0.98, y - 1);
    const capture       = (p_high - p_low / rte) * spread_decay;
    const mwh_per_cycle = eff_mwh * reserve_drag;
    const arb_rev       = mwh_per_cycle * cycles_day * op_days * Math.max(0, capture);

    const gross   = cap_total + act_total + arb_rev;
    const opt_fee = gross * 0.10;
    const brp_fee = 180000 * Math.pow(1.025, y - 1);
    const net_rev = gross - opt_fee - brp_fee;

    const opex    = opex_y1 * Math.pow(1 + opex_esc, y - 1);
    const ebitda  = net_rev - opex;

    let depr = 0;
    if (y <= depr_years) depr += annual_depr;
    if (y > aug_year && y <= aug_year + depr_years) depr += aug_depr;

    let interest = 0, principal = 0;
    if (debt_balance > 0) {
      interest = debt_balance * interest_r;
      if (y > grace) { principal = Math.min(annual_prin, debt_balance); debt_balance = Math.max(0, debt_balance - principal); }
    }
    const debt_service = interest + principal;

    const tax_unlevered = Math.max(0, (ebitda - depr) * tax_rate);
    const tax_levered   = Math.max(0, (ebitda - depr - interest) * tax_rate);
    const aug           = (y === aug_year) ? aug_capex : 0;

    const proj_fcf = ebitda - tax_unlevered - aug;
    const eq_fcf   = ebitda - tax_levered - debt_service - aug;
    const dscr     = debt_service > 0 ? (ebitda - tax_unlevered) / debt_service : null;

    cum_equity += eq_fcf;
    if (payback_year === null && cum_equity > 0) payback_year = y;

    project_cf.push(proj_fcf);
    equity_cf.push(eq_fcf);
    years.push({
      year: y, cal_year, cpi: Math.round(cpi * 100) / 100,
      gross: Math.round(gross), net_rev: Math.round(net_rev),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      cap_total: Math.round(cap_total), act_total: Math.round(act_total), arb_rev: Math.round(arb_rev),
      opt_fee: Math.round(opt_fee), brp_fee: Math.round(brp_fee),
      interest: Math.round(interest), principal: Math.round(principal), debt_service: Math.round(debt_service),
      tax_unlevered: Math.round(tax_unlevered), proj_fcf: Math.round(proj_fcf), eq_fcf: Math.round(eq_fcf),
      dscr: dscr != null ? Math.round(dscr * 100) / 100 : null, cum_equity: Math.round(cum_equity),
    });
  }

  // Phase 49 item 2, solver 2 of 3. This was a second, blinder copy of the same
  // defect: a bare bisection over [−0.5, 2.0] that never established its bracket
  // held a root, so it returned −0.5 for anything ruinous and 2.0 for anything
  // above a 200 % return. Delegated to the one implementation (rule #4) rather
  // than repaired in place, so there is no longer a second IRR to keep in step.
  const project_irr = calcIRR(project_cf);
  const equity_irr  = calcIRR(equity_cf);
  const npv         = Math.round(project_cf.reduce((s, c, t) => s + c / Math.pow(1.08, t), 0));

  const dscr_vals = years.filter(y => y.dscr != null).map(y => y.dscr);
  const min_dscr  = dscr_vals.length ? Math.min(...dscr_vals) : null;
  const bankability = (min_dscr != null && min_dscr >= 1.20) ? 'PASS' : 'FAIL';

  const y1     = years[0];
  const cod_sd = fleet?.trajectory?.find ? fleet.trajectory.find(t => t.year === cod) : null;

  return {
    system: sys.label, duration: sys.duration,
    capex_scenario: capex_sc.label, capex_eur_kwh: capex_sc.eur_kwh,
    gross_capex, grant_amount, grant_label: grant_sc.label, net_capex,
    total_debt, total_equity, cod_year: cod,
    sd_ratio: cod_sd?.sd_ratio ?? null, phase: cod_sd?.phase ?? null, cpi_at_cod: cod_sd?.cpi ?? null,
    gross_revenue_y1: y1.gross, net_revenue_y1: y1.net_rev,
    net_mw_yr: Math.round(y1.net_rev / mw),
    ebitda_y1: y1.ebitda, opex_y1: y1.opex,
    rtm_fees_y1: y1.opt_fee + y1.brp_fee,
    capacity_y1: y1.cap_total, activation_y1: y1.act_total, arbitrage_y1: y1.arb_rev,
    capacity_pct: y1.gross > 0 ? Math.round(y1.cap_total / y1.gross * 100) / 100 : 0,
    activation_pct: y1.gross > 0 ? Math.round(y1.act_total / y1.gross * 100) / 100 : 0,
    arbitrage_pct: y1.gross > 0 ? Math.round(y1.arb_rev / y1.gross * 100) / 100 : 0,
    project_irr, equity_irr, npv_at_wacc: npv,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null, bankability,
    simple_payback_years: payback_year,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.net_rev, ebitda: yr.ebitda, dscr: yr.dscr, cpi: yr.cpi } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source, model_version: 'v4',
    timestamp: new Date().toISOString(),
    // Backward compat
    irr_2h: systemKey === '2h'  ? project_irr : null,
    irr_4h: systemKey === '4h'  ? project_irr : null,
    net_mw_yr_2h: systemKey === '2h' ? Math.round(y1.net_rev / mw) : null,
    net_mw_yr_4h: systemKey === '4h' ? Math.round(y1.net_rev / mw) : null,
  };
}

// ─── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ─── S1 helpers ────────────────────────────────────────────────────────────────

function utcPeriod(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}0000`;
}

/**
 * Every `price.amount` in an ENTSO-E A44 document, in document order.
 *
 * Phase 36.B batch-3 (fixes 36.B0-H). The character class used to be `[\d.]+`,
 * which cannot match a leading minus — and the failure mode was not a lost sign
 * but a lost HOUR: the whole element failed to match, so a day with seven
 * negative hours yielded 41 values instead of 48 and **every subsequent index
 * shifted**, silently re-labelling afternoon prices as midday ones.
 *
 * Negative Lithuanian day-ahead hours are not exotic. Across the committed
 * 11-year history they appear on 125 days, and the trend is steep: none before
 * 2020, 20 days in 2023, 42 in 2024, 44 in 2025 — better than one day in nine
 * in the current solar-driven market.
 *
 * `[-\d.eE+]` matches the Node-side `parseA44` in backfill-entsoe.mjs, which
 * has always accepted negatives; that is why the committed price history is
 * clean and only the worker path was affected.
 */
function extractPrices(xml) {
  const prices = [];
  const re = /<price\.amount>([-\d.eE+]+)<\/price\.amount>/g;
  let m;
  while ((m = re.exec(xml)) !== null) prices.push(parseFloat(m[1]));
  return prices;
}

/**
 * ─── A44, parsed as the document actually is ─────────────────────────────────
 *
 * Phase 39.2. `extractPrices` above scrapes every `price.amount` in document
 * order and returns one flat array. Two properties of a real A44 response make
 * that array something other than "the prices of the day asked for", and both
 * were measured against production on 2026-08-03, not inferred:
 *
 *  1. **curveType A03 omits repeated positions.** The LT document for
 *     2026-08-03 declares 96 quarter-hours but carries 94 Points — positions 3
 *     and 11 are absent because their price equals the position before. A
 *     consumer must forward-fill. Scraping instead SHIFTS every later value one
 *     slot earlier per omission: measured against Elering's independent series
 *     for the same window, the flat scrape puts 92 of its 94 values at the
 *     wrong time, while the forward-filled reconstruction matches 96/96 exactly.
 *     This is the identical failure the 36.B batch-3 comment above describes
 *     ("the whole element failed to match … every subsequent index shifted") —
 *     that fix addressed the negative-sign character class and left the
 *     position mechanism untouched, because a missing `<Point>` never had to
 *     match anything to be lost.
 *
 *  2. **A UTC-bounded request returns whole CET/CEST market days.** Asking for
 *     `periodStart=<D>0000&periodEnd=<D+1>0000` returns TWO `<TimeSeries>` —
 *     22:00Z(D-1)→22:00Z(D) and 22:00Z(D)→22:00Z(D+1) in summer — which the
 *     flat scrape concatenates into a single 190-entry array. Every consumer
 *     downstream treats it as one day.
 *
 * These functions reconstruct the document faithfully instead: Periods with
 * their declared time windows, positions forward-filled per A03, and a slice
 * addressed by wall-clock UTC rather than by array index. `extractPrices` is
 * deliberately left alone — changing it moves published S1 numbers, which this
 * phase is not permitted to do (see the phase wrap, decision 1).
 */
function isoDurationToMinutes(res) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(res || '');
  if (!m) return null;
  const mins = (Number(m[1] || 0) * 60) + Number(m[2] || 0);
  return mins > 0 ? mins : null;
}

/**
 * Every `<Period>` in an A44 document, with its positions forward-filled to the
 * full length its own timeInterval and resolution declare.
 *
 * A Period whose position 1 is absent, or whose declared window is not a whole
 * multiple of its resolution, is dropped rather than guessed at — a partially
 * reconstructed price day is the input that produces a confidently wrong
 * number, which is worse than no number (playbook B10).
 *
 * @returns {Array<{startMs:number,endMs:number,resolutionMin:number,prices:number[],declared:number,filled:number}>}
 */
function parseA44Periods(xml) {
  const out = [];
  if (!xml) return out;
  const periodRe = /<Period>([\s\S]*?)<\/Period>/g;
  let pm;
  while ((pm = periodRe.exec(xml)) !== null) {
    const body = pm[1];
    const start = /<start>([^<]+)<\/start>/.exec(body)?.[1];
    const end = /<end>([^<]+)<\/end>/.exec(body)?.[1];
    const resolutionMin = isoDurationToMinutes(/<resolution>([^<]+)<\/resolution>/.exec(body)?.[1]);
    if (!start || !end || !resolutionMin) continue;

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    const spanMin = (endMs - startMs) / 60000;
    if (spanMin % resolutionMin !== 0) continue;
    const expected = spanMin / resolutionMin;

    const byPos = new Map();
    const pointRe = /<Point>([\s\S]*?)<\/Point>/g;
    let ptm;
    while ((ptm = pointRe.exec(body)) !== null) {
      const pos = /<position>(\d+)<\/position>/.exec(ptm[1])?.[1];
      const amt = /<price\.amount>([-\d.eE+]+)<\/price\.amount>/.exec(ptm[1])?.[1];
      if (pos == null || amt == null) continue;
      const v = parseFloat(amt);
      if (!Number.isFinite(v)) continue;
      byPos.set(Number(pos), v);
    }
    // A03: a Point holds until the next declared position. Position 1 must
    // exist for that to have a starting value at all.
    if (!byPos.has(1)) continue;

    const prices = [];
    let last = null;
    for (let p = 1; p <= expected; p++) {
      if (byPos.has(p)) last = byPos.get(p);
      prices.push(last);
    }
    out.push({
      startMs,
      endMs,
      resolutionMin,
      prices,
      declared: expected,
      filled: expected - byPos.size,
    });
  }
  return out;
}

/**
 * The prices covering one UTC calendar day, addressed by wall-clock time.
 *
 * Returns `null` — never a partial array — when the parsed Periods do not cover
 * every slot of the day. That is the normal state before ~11:00Z: the tail of a
 * UTC day lives in the NEXT CET/CEST market day, whose auction has not been
 * published yet. A caller that wants a capture number must treat null as "not
 * available on this tick", not as zero.
 *
 * @param {ReturnType<typeof parseA44Periods>} periods
 * @param {string} dateStr YYYY-MM-DD, interpreted as a UTC calendar day
 */
function pricesForUtcDay(periods, dateStr) {
  const dayStart = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(dayStart)) return null;
  const dayEnd = dayStart + 86400000;

  const contributing = periods.filter(p => p.endMs > dayStart && p.startMs < dayEnd);
  if (!contributing.length) return null;

  // Reconstruct on the finest grid any contributing Period declares, so a
  // mixed-resolution day (hourly history meeting a 15-min ISP day) resolves
  // without either side being resampled away.
  const gridMin = Math.min(...contributing.map(p => p.resolutionMin));
  const slots = 1440 / gridMin;
  if (!Number.isInteger(slots)) return null;

  const grid = new Array(slots).fill(null);
  for (const p of contributing) {
    const per = p.resolutionMin / gridMin; // grid slots per declared point
    for (let i = 0; i < p.prices.length; i++) {
      const tMs = p.startMs + (i * p.resolutionMin * 60000);
      for (let k = 0; k < per; k++) {
        const slotMs = tMs + (k * gridMin * 60000);
        if (slotMs < dayStart || slotMs >= dayEnd) continue;
        grid[(slotMs - dayStart) / (gridMin * 60000)] = p.prices[i];
      }
    }
  }
  if (grid.some(v => v == null)) return null;

  // Report the NATIVE resolution where the grid merely repeats a coarser
  // source, so `resolution` in the capture payload keeps meaning what it has
  // always meant. Sort-and-dispatch is invariant to this expansion: repeating
  // each hourly price four times multiplies both the charge and the discharge
  // window by four and leaves every mean unchanged.
  let nativeMin = gridMin;
  for (const step of [60, 30, 15]) {
    if (step < gridMin) continue;
    const per = step / gridMin;
    if (!Number.isInteger(per)) continue;
    let uniform = true;
    for (let i = 0; i < slots && uniform; i += per) {
      for (let k = 1; k < per; k++) if (grid[i + k] !== grid[i]) { uniform = false; break; }
    }
    if (uniform) { nativeMin = step; break; }
  }
  const per = nativeMin / gridMin;
  const prices = per === 1 ? grid : grid.filter((_, i) => i % per === 0);
  const timestamps = prices.map((_, i) => (dayStart + (i * nativeMin * 60000)) / 1000);

  return { prices, timestamps, resolution: nativeMin };
}

/**
 * ─── The market day, admitted only if it counts (Phase 49 item 1) ─────────────
 *
 * `extractPrices` scrapes every `price.amount` in document order and returns one
 * flat array. Two properties of a real A44 response make that array something
 * other than "the prices of the day asked for", and both were measured against
 * the committed 2026-08-03 LT document, with Elering's independent NPS series
 * for the same window as the control:
 *
 *   flat scrape            n=190  mean €75.4309   agrees with Elering on  2/96 slots
 *   this reconstruction    n= 96  mean €69.1542   agrees with Elering on 96/96 slots
 *
 * The 190 is TWO CEST market days concatenated — a UTC-bounded request returns
 * whole market days, and after the next auction publishes there are two of them.
 * The mis-timing is curveType A03, which omits a position whose price repeats
 * the one before; scraping shifts every later value one slot earlier per
 * omission.
 *
 * The guard is CARDINALITY, because that is what both failures violate. A market
 * day is 23, 24 or 25 hours — never anything else — and its slot count is that
 * span divided by its own declared resolution. 190 is not a market day. 94 is
 * not a market day. A series that does not count is refused at admission rather
 * than averaged, which is the difference between an error and a plausible number.
 *
 * NOT asserted here, deliberately: a maximum forward-fill fraction. A genuinely
 * flat price day legitimately omits most of its positions under A03, and the
 * document alone cannot distinguish that from a broken one. The fill count is
 * reported (`forward_filled`) and the independent Elering control is what
 * actually discriminates — claiming otherwise would be a guard that overstates
 * what it can see.
 */
const MARKET_DAY_HOURS = new Set([23, 24, 25]);

/**
 * The one market day covering a UTC instant, or a refusal saying why.
 *
 * @param {ReturnType<typeof parseA44Periods>} periods
 * @param {number} atMs the instant the day must cover — normally `Date.now()`
 * @returns {{ok:true,prices:number[],startMs:number,endMs:number,resolutionMin:number,
 *            slots:number,hours:number,forward_filled:number}
 *          | {ok:false,reason:string,detail:string}}
 */
function marketDayAt(periods, atMs) {
  if (!periods.length) return { ok: false, reason: 'no_periods', detail: 'document carried no parseable Period' };

  // A UTC-bounded request must not admit two market days. It is allowed to
  // RETURN two — that is normal after the next auction publishes — but exactly
  // one of them covers any given instant, and picking it by wall clock is the
  // whole point. Concatenation is what produced the 190.
  const covering = periods.filter((p) => p.startMs <= atMs && atMs < p.endMs);
  if (covering.length === 0) {
    return {
      ok: false,
      reason: 'no_period_covers_instant',
      detail: `${new Date(atMs).toISOString()} outside [${periods.map((p) => `${new Date(p.startMs).toISOString()}→${new Date(p.endMs).toISOString()}`).join(', ')}]`,
    };
  }
  if (covering.length > 1) {
    return { ok: false, reason: 'overlapping_periods', detail: `${covering.length} Periods cover the same instant` };
  }

  const p = covering[0];
  const hours = (p.endMs - p.startMs) / 3600000;
  if (!MARKET_DAY_HOURS.has(hours)) {
    return { ok: false, reason: 'illegal_market_day_span', detail: `${hours}h — a market day is 23, 24 or 25` };
  }
  const slots = (hours * 60) / p.resolutionMin;
  if (!Number.isInteger(slots)) {
    return { ok: false, reason: 'span_not_a_multiple_of_resolution', detail: `${hours}h / PT${p.resolutionMin}M` };
  }
  if (p.prices.length !== slots) {
    return {
      ok: false,
      reason: 'cardinality_mismatch',
      detail: `${p.prices.length} values for a ${hours}h day at PT${p.resolutionMin}M, which needs ${slots}`,
    };
  }
  return {
    ok: true,
    prices: p.prices,
    startMs: p.startMs,
    endMs: p.endMs,
    resolutionMin: p.resolutionMin,
    slots,
    hours,
    forward_filled: p.filled,
  };
}

/** The UTC clock-hour of a slot, computed from the day's own start (rule #2). */
function slotHourUtc(day, idx) {
  return new Date(day.startMs + idx * day.resolutionMin * 60000).getUTCHours();
}

/**
 * ─── B-075: two bidding zones need a common clock, not a common index ────────
 *
 * `computeHistorical` paired LT against SE4 with `lt30[i] - se430[i]` over flat
 * 30-day scrapes. Under curveType A03 each zone omits repeated positions
 * INDEPENDENTLY, so the two arrays are not the same length and every pair after
 * the first divergent omission compares two different instants. Measured on live
 * documents 2026-08-04: LT 2916 values against SE4 2932, LT forward-filling 60
 * positions to SE4's 44 — a 16-slot relative shift — and the code silently
 * truncated to the shorter.
 *
 * Every slot carries its own instant, so the join is an intersection on that
 * instant. A slot present in one zone and absent in the other is DROPPED rather
 * than held or interpolated: holding invents a price the market never cleared,
 * and interpolating invents two.
 *
 * @returns {Array<[number, number, number]>} [epochMs, a, b], ascending
 */
function pairOnTimestamp(xmlA, xmlB) {
  const series = (xml) => {
    const out = [];
    for (const p of parseA44Periods(xml)) {
      for (let i = 0; i < p.prices.length; i++) {
        out.push([p.startMs + i * p.resolutionMin * 60000, p.prices[i]]);
      }
    }
    return out;
  };
  const b = new Map(series(xmlB));
  const paired = [];
  for (const [t, va] of series(xmlA)) {
    const vb = b.get(t);
    if (vb !== undefined) paired.push([t, va, vb]);
  }
  paired.sort((x, y) => x[0] - y[0]);
  return paired;
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function signalState(pct) {
  if (pct > 20) return 'ACT';
  if (pct >= 5)  return 'WATCH';
  return 'CALM';
}

async function fetchBzn(bzn, apiKey) {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('documentType', 'A44');
  url.searchParams.set('in_Domain', bzn);
  url.searchParams.set('out_Domain', bzn);
  url.searchParams.set('periodStart', utcPeriod(0));
  url.searchParams.set('periodEnd', utcPeriod(1));
  url.searchParams.set('securityToken', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ENTSO-E ${bzn}: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.text();
}

/**
 * Phase 38.1 — per-leg guard around `fetchBzn`.
 *
 * `fetchBzn` throws on any non-2xx. Both today-window legs sat naked inside
 * computeS1's `Promise.all`, so a single ENTSO-E hiccup on EITHER rejected the
 * whole function — and, until this phase, took the DA capture, the `raw:s1`
 * archive and the `da_tomorrow` mirror down with it, because all three lived
 * inside the cron's `s1Result.status === 'fulfilled'` branch. `fetchBznRange`
 * and `computeHistorical` have always swallowed their own errors; these two were
 * the only unguarded throw sites in the function.
 *
 * One retry, then null. The caller's `!ltPrices.length` guard still throws —
 * S1 genuinely cannot be computed without both bidding zones — but a transient
 * failure now costs a retry rather than a tick, and the log names the leg.
 *
 * `delayMs` is injectable so the retry path can be tested without a real wait.
 * Kept short: the 2026-08-02T12:00Z tail shows this branch failing on the 30s
 * wrapper timeout, not on a rejection, so dead wait inside computeS1 is spent
 * from the same budget the timeout is measuring.
 */
async function fetchBznGuarded(bzn, apiKey, label, delayMs = 400) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetchBzn(bzn, apiKey);
    } catch (e) {
      if (attempt === 2) {
        console.error(`[S1/fetchBzn] ${label} failed on both attempts — ${String(e)}`);
        return null;
      }
      console.warn(`[S1/fetchBzn] ${label} attempt 1 failed (${String(e)}) — retrying in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

/** The raw A44 document for a multi-day range, or null. B-075: the DOCUMENT, so
 *  the caller can pair on the timestamps only the document carries. */
async function fetchBznRangeXml(bzn, apiKey, startOffset, endOffset) {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('documentType', 'A44');
  url.searchParams.set('in_Domain', bzn);
  url.searchParams.set('out_Domain', bzn);
  url.searchParams.set('periodStart', utcPeriod(startOffset));
  url.searchParams.set('periodEnd', utcPeriod(endOffset));
  url.searchParams.set('securityToken', apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchBznRange(bzn, apiKey, startOffset, endOffset) {
  const xml = await fetchBznRangeXml(bzn, apiKey, startOffset, endOffset);
  return xml === null ? [] : extractPrices(xml);
}

/**
 * ─── B-075 (Phase 52), operator-signed 2026-08-04 ────────────────────────────
 *
 * These three fields paired LT against SE4 BY ARRAY INDEX across 30-day ranges.
 * Under curveType A03 each zone omits repeated positions independently, so the
 * two flat arrays are not even the same length and the code silently truncated
 * to the shorter. Measured on live documents the day this shipped:
 *
 *                        index-paired   timestamp-paired
 *   array lengths        LT 2916 / SE4 2932     both 2976
 *   A03 forward-filled   LT 60 / SE4 44 -> a 16-slot relative shift
 *   rsi_30d                     -0.68              -1.08   (-58.8 %)
 *   pct_hours_above_20           21.8                6.9   (-68.4 %)
 *   trend_vs_90d                 0.92               2.05   (+123 %)
 *
 * The index-paired figures reproduced live `/s1` exactly, so those were the
 * published values. **`pct_hours_above_20` is the share of hours Lithuania
 * clears more than 20 % above SE4: it read 21.8 % and the true figure is 6.9 %.
 * The site was overstating Baltic price separation by roughly 3.2x.** The
 * correction is unflattering and is stated as such on the card.
 *
 * `trend_vs_90d` is a DIFFERENCE of two mean spreads, not a ratio — checked
 * against the source rather than assumed, which is why its +123 % is a real
 * figure and not the -18 % a ratio would have produced.
 */
async function computeHistorical(apiKey) {
  try {
    const [lt30Xml, se430Xml, ltRefXml, se4RefXml] = await Promise.all([
      fetchBznRangeXml(LT_BZN,  apiKey, -30,  1),
      fetchBznRangeXml(SE4_BZN, apiKey, -30,  1),
      fetchBznRangeXml(LT_BZN,  apiKey, -120, -90),
      fetchBznRangeXml(SE4_BZN, apiKey, -120, -90),
    ]);
    const empty = { rsi_30d: null, trend_vs_90d: null, pct_hours_above_20: null, spread_pairing: null };
    if (lt30Xml === null || se430Xml === null) return empty;

    const cur = pairOnTimestamp(lt30Xml, se430Xml);
    if (cur.length === 0) return empty;

    let spreadSum = 0;
    let hoursAbove20 = 0;
    for (const [, lt, se4] of cur) {
      const spread = lt - se4;
      const pct    = se4 !== 0 ? (spread / se4) * 100 : 0;
      spreadSum += spread;
      if (pct > 20) hoursAbove20++;
    }
    const rsi_30d            = Math.round((spreadSum / cur.length) * 100) / 100;
    const pct_hours_above_20 = Math.round((hoursAbove20 / cur.length) * 1000) / 10;

    let trend_vs_90d = null;
    let refN = 0;
    if (ltRefXml !== null && se4RefXml !== null) {
      const ref = pairOnTimestamp(ltRefXml, se4RefXml);
      refN = ref.length;
      if (refN > 0) {
        let refSum = 0;
        for (const [, lt, se4] of ref) refSum += lt - se4;
        trend_vs_90d = Math.round((rsi_30d - refSum / refN) * 100) / 100;
      }
    }

    return {
      rsi_30d,
      trend_vs_90d,
      pct_hours_above_20,
      // Provenance for the correction: how many slots actually paired, so a
      // reader can see the statistic's own sample rather than trust its label.
      spread_pairing: { basis: 'timestamp', slots_30d: cur.length, slots_ref: refN },
    };
  } catch {
    return { rsi_30d: null, trend_vs_90d: null, pct_hours_above_20: null, spread_pairing: null };
  }
}

// ─── S1 Capture — DA gross capture via energy-charts.info ───────────────────

const ENERGY_CHARTS_API = 'https://api.energy-charts.info/price';

/**
 * Fetch LT DA prices from energy-charts.info for a date range.
 * Returns parallel arrays of unix_seconds and prices.
 * Handles both 15-min (recent) and hourly (historical) resolution.
 */
async function fetchEnergyCharts(startDate, endDate) {
  const end = endDate || startDate;
  const url = `${ENERGY_CHARTS_API}?bzn=LT&start=${startDate}T00:00Z&end=${end}T23:59Z`;

  // Phase 38.1 — one retry, on observed evidence rather than caution.
  // energy-charts returned `HTTP 429` to this worker during the
  // 2026-08-02T12:00:33Z tick (`[Gen/LT] Error: energy-charts lt: HTTP 429`, in
  // the hourly cron firing the same second as the 4-hourly one). This is the
  // sole upstream for the DA capture, and the capture is the number the S1 card
  // publishes — the whole reason this phase exists. A single 429 taking it out
  // for four hours is the failure this phase is closing, one host over.
  let res = await fetch(url);
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    console.warn(`[S1/capture] energy-charts HTTP ${res.status} — one retry in 500ms`);
    await new Promise((r) => setTimeout(r, 500));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`energy-charts HTTP ${res.status}`);
  const json = await res.json();
  if (!json.price || !json.unix_seconds || !json.price.length) {
    throw new Error('energy-charts: empty price data');
  }

  // Detect resolution from timestamp gaps
  const gap = json.unix_seconds.length > 1
    ? json.unix_seconds[1] - json.unix_seconds[0]
    : 3600;
  const resolutionMin = Math.round(gap / 60);

  return {
    prices: json.price,
    timestamps: json.unix_seconds,
    resolution: resolutionMin, // 15 or 60
  };
}

/**
 * Split multi-day price arrays into per-day arrays.
 * Returns Map<dateStr, { prices: number[], timestamps: number[], resolution: number }>
 */
function splitByDay(prices, timestamps, resolution) {
  const days = new Map();
  for (let i = 0; i < prices.length; i++) {
    const d = new Date(timestamps[i] * 1000);
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, { prices: [], timestamps: [], resolution });
    days.get(key).prices.push(prices[i]);
    days.get(key).timestamps.push(timestamps[i]);
  }
  return days;
}

/**
 * Perfect-foresight sort-and-dispatch capture for a single day.
 * durationHours: 2 or 4 (storage duration).
 * resolutionMin: 15 or 60 (data granularity).
 * Returns gross/net capture in €/MWh and supporting metrics.
 */
function computeDayCapture(prices, durationHours, resolutionMin = 60) {
  const intervalsPerHour = 60 / resolutionMin;
  const n = Math.round(durationHours * intervalsPerHour);

  // Need at least 2×n intervals (charge + discharge windows must not overlap)
  if (prices.length < n * 2) return null;

  // Filter out negative/zero prices for discharge, but keep all for sort
  const indexed = prices.map((p, i) => ({ price: p, idx: i }));
  const sorted = [...indexed].sort((a, b) => a.price - b.price);

  const chargeSlots = sorted.slice(0, n);
  const dischargeSlots = sorted.slice(-n);

  const avgCharge = chargeSlots.reduce((s, e) => s + e.price, 0) / n;
  const avgDischarge = dischargeSlots.reduce((s, e) => s + e.price, 0) / n;

  // RTE: canonical RTE_BOL (same physical battery round-trip as reference asset / revenue engine).
  const rte = rteBolFor(durationHours);

  const grossCapture = avgDischarge - avgCharge;
  // Net: discharge revenue minus charge cost adjusted for RTE losses
  const netCapture = avgDischarge - (avgCharge / rte);

  return {
    gross_eur_mwh: Math.round(grossCapture * 100) / 100,
    net_eur_mwh: Math.round(netCapture * 100) / 100,
    avg_charge: Math.round(avgCharge * 100) / 100,
    avg_discharge: Math.round(avgDischarge * 100) / 100,
    rte,
    n_intervals: n,
  };
}

/**
 * Price shape metrics for a single day.
 * Identifies peak/trough hours, solar trough, evening premium.
 */
function priceShapeMetrics(prices, timestamps, resolutionMin = 60) {
  if (!prices.length) return null;

  const intervalsPerHour = 60 / resolutionMin;

  // Aggregate to hourly averages
  const hourBuckets = {};
  for (let i = 0; i < prices.length; i++) {
    const h = Math.floor(i / intervalsPerHour);
    if (!hourBuckets[h]) hourBuckets[h] = [];
    hourBuckets[h].push(prices[i]);
  }

  const hourlyAvg = [];
  const hours = Object.keys(hourBuckets).map(Number).sort((a, b) => a - b);
  for (const h of hours) {
    const arr = hourBuckets[h];
    hourlyAvg.push(Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100);
  }

  const peakIdx = hourlyAvg.indexOf(Math.max(...hourlyAvg));
  const troughIdx = hourlyAvg.indexOf(Math.min(...hourlyAvg));

  const dailyAvg = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
  const swing = Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100;

  // Solar trough: avg hours 10-14 vs daily avg
  const solarHours = hours.filter(h => h >= 10 && h <= 14);
  let solarTroughDepth = null;
  if (solarHours.length) {
    const solarAvg = solarHours.reduce((s, h) => s + hourlyAvg[h], 0) / solarHours.length;
    solarTroughDepth = Math.round((solarAvg - dailyAvg) * 100) / 100;
  }

  // Evening premium: avg(17-21) minus avg(10-14)
  const eveningHours = hours.filter(h => h >= 17 && h <= 21);
  let eveningPremium = null;
  if (eveningHours.length && solarHours.length) {
    const eAvg = eveningHours.reduce((s, h) => s + hourlyAvg[h], 0) / eveningHours.length;
    const sAvg = solarHours.reduce((s, h) => s + hourlyAvg[h], 0) / solarHours.length;
    eveningPremium = Math.round((eAvg - sAvg) * 100) / 100;
  }

  return {
    peak_hour: hours[peakIdx],
    trough_hour: hours[troughIdx],
    peak_price: hourlyAvg[peakIdx],
    trough_price: hourlyAvg[troughIdx],
    daily_avg: dailyAvg,
    swing,
    solar_trough_depth: solarTroughDepth,
    evening_premium: eveningPremium,
    hourly_profile: hourlyAvg,
  };
}

/**
 * Rolling statistics over an array of daily capture values.
 */
function captureRollingStats(entries, field) {
  const vals = entries.map(e => e[field]).filter(v => v != null).sort((a, b) => a - b);
  if (!vals.length) return null;
  const p = (pct) => vals[Math.min(Math.floor(vals.length * pct), vals.length - 1)];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    mean: Math.round(mean * 100) / 100,
    p25: Math.round(p(0.25) * 100) / 100,
    p50: Math.round(p(0.50) * 100) / 100,
    p75: Math.round(p(0.75) * 100) / 100,
    p90: Math.round(p(0.90) * 100) / 100,
    days: vals.length,
  };
}

/**
 * Main capture orchestrator. Fetches today's LT DA prices from energy-charts.info,
 * computes 2h and 4h capture, updates rolling history, stores to KV.
 */
/**
 * The ENTSO-E-derived second source for the capture day (Phase 39.2).
 *
 * Same admission discipline as 36.C: one writer, source rank recorded, and the
 * fallback visible in the payload rather than invisible in the result.
 *
 * The equivalence this rests on was verified, not assumed. energy-charts serves
 * the LT day-ahead curve for a UTC calendar day; ENTSO-E A44 serves the same
 * curve on CET/CEST market-day Periods. Reconstructed through
 * `parseA44Periods` + `pricesForUtcDay` the two address the identical window in
 * the identical unit (EUR/MWh, LT bidding zone, same MTU), and the
 * reconstruction was checked slot-for-slot against Elering's independent NPS
 * series for 2026-08-03: 96/96 exact.
 *
 * The one thing it CANNOT do is invent an auction that has not happened. The
 * last two hours of a UTC day belong to the next CET/CEST market day, published
 * around 11:00Z — so on the 00/04/08Z ticks `pricesForUtcDay` returns null and
 * this source declines rather than computing a 22-hour "day". That is a real
 * availability gap and it is reported as one, not papered over.
 */
async function fetchEntsoeCaptureDay(env, dateStr) {
  const apiKey = env?.ENTSOE_API_KEY;
  if (!apiKey) throw new Error('entsoe fallback: ENTSOE_API_KEY secret not set');
  const xml = await fetchBznGuarded(LT_BZN, apiKey, 'LT/capture-fallback');
  if (xml == null) throw new Error('entsoe fallback: LT A44 fetch failed on both attempts');
  const periods = parseA44Periods(xml);
  if (!periods.length) throw new Error(`entsoe fallback: no parseable Period in A44 document (${xml.length}B)`);
  const day = pricesForUtcDay(periods, dateStr);
  if (!day) {
    const covered = periods.map(p => `${new Date(p.startMs).toISOString()}→${new Date(p.endMs).toISOString()}`).join(', ');
    throw new Error(`entsoe fallback: UTC day ${dateStr} not fully covered by published periods [${covered}]`);
  }
  return day;
}

/**
 * Resolve the capture day from the highest-ranked source that answers.
 * Rank 1 energy-charts.info; rank 2 ENTSO-E A44. Rank is recorded on the
 * payload so a fallback day is legible in the data instead of being a silent
 * substitution.
 */
async function resolveCaptureDay(env, today) {
  try {
    const d = await fetchEnergyCharts(today);
    return { ...d, capture_source: 'energy-charts', capture_source_rank: 1, capture_source_label: 'energy-charts.info (Fraunhofer ISE)', capture_fallback_reason: null };
  } catch (primaryErr) {
    const reason = String(primaryErr);
    console.warn(`[S1/capture] primary source failed (${reason}) — trying ENTSO-E A44 fallback`);
    try {
      const d = await fetchEntsoeCaptureDay(env, today);
      console.warn(`[S1/capture] FALLBACK ACTIVE — ${today} from ENTSO-E A44, ${d.prices.length}×${d.resolution}min`);
      return { ...d, capture_source: 'entsoe-a44', capture_source_rank: 2, capture_source_label: 'ENTSO-E A44 (fallback)', capture_fallback_reason: reason.slice(0, 240) };
    } catch (fallbackErr) {
      // Both down: surface BOTH diagnoses. An alert naming only the last thing
      // tried sends the operator after the wrong host.
      throw new Error(`capture sources exhausted — primary: ${reason.slice(0, 200)} | fallback: ${String(fallbackErr).slice(0, 200)}`);
    }
  }
}

async function computeCapture(env) {
  const today = new Date().toISOString().slice(0, 10);

  const { prices, timestamps, resolution, capture_source, capture_source_rank, capture_source_label, capture_fallback_reason } = await resolveCaptureDay(env, today);

  const capture_2h = computeDayCapture(prices, 2, resolution);
  const capture_4h = computeDayCapture(prices, 4, resolution);
  const shape = priceShapeMetrics(prices, timestamps, resolution);

  // Load existing capture history
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get('s1_capture_history');
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }

  // Deduplicate today
  history = history.filter(e => e.date !== today);
  history.push({
    date: today,
    gross_2h: capture_2h?.gross_eur_mwh ?? null,
    gross_4h: capture_4h?.gross_eur_mwh ?? null,
    net_2h: capture_2h?.net_eur_mwh ?? null,
    net_4h: capture_4h?.net_eur_mwh ?? null,
    avg_charge_2h: capture_2h?.avg_charge ?? null,
    avg_discharge_2h: capture_2h?.avg_discharge ?? null,
    avg_charge_4h: capture_4h?.avg_charge ?? null,
    avg_discharge_4h: capture_4h?.avg_discharge ?? null,
    swing: shape?.swing ?? null,
    daily_avg: shape?.daily_avg ?? null,
    resolution,
    n_prices: prices.length,
    capture_source,
  });

  // Keep last 400 days (for monthly aggregation depth)
  if (history.length > 400) history = history.slice(-400);

  // Rolling stats — last 30 days
  const recent30 = history.slice(-30);
  const stats_2h = captureRollingStats(recent30, 'gross_2h');
  const stats_4h = captureRollingStats(recent30, 'gross_4h');

  // Monthly aggregation
  const monthMap = {};
  for (const entry of history) {
    const ym = entry.date.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { g2h: [], g4h: [], n2h: [], n4h: [] };
    if (entry.gross_2h != null) monthMap[ym].g2h.push(entry.gross_2h);
    if (entry.gross_4h != null) monthMap[ym].g4h.push(entry.gross_4h);
    if (entry.net_2h != null) monthMap[ym].n2h.push(entry.net_2h);
    if (entry.net_4h != null) monthMap[ym].n4h.push(entry.net_4h);
  }
  const monthly = Object.entries(monthMap)
    .map(([month, d]) => ({
      month,
      avg_gross_2h: d.g2h.length ? Math.round(d.g2h.reduce((a, b) => a + b, 0) / d.g2h.length * 100) / 100 : null,
      avg_gross_4h: d.g4h.length ? Math.round(d.g4h.reduce((a, b) => a + b, 0) / d.g4h.length * 100) / 100 : null,
      avg_net_2h: d.n2h.length ? Math.round(d.n2h.reduce((a, b) => a + b, 0) / d.n2h.length * 100) / 100 : null,
      avg_net_4h: d.n4h.length ? Math.round(d.n4h.reduce((a, b) => a + b, 0) / d.n4h.length * 100) / 100 : null,
      days: Math.max(d.g2h.length, d.g4h.length),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Gross-to-net bridge lines
  const grossToNet = [];
  if (capture_2h) {
    grossToNet.push(
      { label: 'Gross spread (2h)', value: capture_2h.gross_eur_mwh, type: 'base' },
      { label: `RTE loss (${Math.round((1 - capture_2h.rte) * 1000) / 10}%)`, value: -Math.round((capture_2h.avg_charge / capture_2h.rte - capture_2h.avg_charge) * 100) / 100, type: 'deduction' },
      { label: 'Net capture (2h)', value: capture_2h.net_eur_mwh, type: 'result' },
    );
  }

  const captureData = {
    date: today,
    // Flat top-level for convenience (matches /read merged shape)
    gross_2h: capture_2h?.gross_eur_mwh ?? null,
    gross_4h: capture_4h?.gross_eur_mwh ?? null,
    net_2h:   capture_2h?.net_eur_mwh   ?? null,
    net_4h:   capture_4h?.net_eur_mwh   ?? null,
    // Nested originals (unchanged — existing consumers depend on these)
    capture_2h,
    capture_4h,
    shape,
    rolling_30d: { stats_2h, stats_4h },
    monthly,
    gross_to_net: grossToNet,
    history: history.slice(-30), // last 30 days for charts
    source: capture_source_label,
    // Phase 39.2 — which source produced THIS day, and why, on the payload
    // itself. A fallback that is only visible in a log line is invisible.
    capture_source,
    capture_source_rank,
    capture_fallback_reason,
    data_class: 'derived',
    resolution: `${resolution}min`,
    updated_at: new Date().toISOString(),
  };

  await env.KKME_SIGNALS.put('s1_capture', JSON.stringify(captureData));
  await env.KKME_SIGNALS.put('s1_capture_history', JSON.stringify(history));

  // Detect extreme DA price events
  if (prices.length >= 12) {
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceSpread = maxPrice - minPrice;
    if (priceSpread > 200 || maxPrice > 500 || minPrice < -50) {
      const extremeEvent = {
        type: 'da_spread',
        date: today,
        max_price: Math.round(maxPrice),
        min_price: Math.round(minPrice),
        spread: Math.round(priceSpread),
        timestamp: new Date().toISOString(),
        text: `DA spread €${Math.round(priceSpread)}/MWh (peak €${Math.round(maxPrice)}, low €${Math.round(minPrice)})`,
      };
      // Expire at midnight UTC — extreme events are today's news only
      const midnightMs = new Date().setUTCHours(23, 59, 59, 999) - Date.now();
      const extremeTtl = Math.max(60, Math.floor(midnightMs / 1000));
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(extremeEvent), { expirationTtl: extremeTtl });
      console.log(`[S1/extreme] ${extremeEvent.text}`);
    }
  }

  console.log(`[S1/capture] ${today} 2h=${capture_2h?.gross_eur_mwh ?? '—'}€ 4h=${capture_4h?.gross_eur_mwh ?? '—'}€ swing=${shape?.swing ?? '—'}€ resolution=${resolution}min n=${prices.length} source=${capture_source}`);

  return captureData;
}

/**
 * ─── Phase 49 item 1 — the S1 day basis, behind a flag defaulting OFF ─────────
 *
 * `'flat'`        `extractPrices` over the whole document. What ships today, and
 *                 what agrees with Elering on 2 of 96 slots.
 * `'market_day'`  the Period covering the current instant, forward-filled per
 *                 A03 and admitted only if it counts. 96/96 against Elering.
 *
 * ── DEFAULT FLIPPED TO `market_day` 2026-08-04, OPERATOR-SIGNED ──────────────
 *
 * It shipped OFF first, was quantified, and waited. What decided it was not the
 * euro movement but the CLOCK: `Math.floor(idx * 24 / N)` treats index 0 as UTC
 * 00:00 and a CET/CEST market day starts at 22:00Z, so the hour labels are two
 * hours out EVERY day, on a quiet one and a volatile one alike. The euro defect
 * only fires when curveType A03 omits a position or when the next auction
 * publishes and two market days concatenate.
 *
 * Signed movements, measured twice 23 minutes apart on the live document and
 * identical both times (`docs/investigations/2026-08-04-phase-49-s1-flip-delta.json`):
 *
 *   lt_peak_hour_utc      22 → 20        the 2 h CEST offset
 *   lt_trough_hour_utc    16 → 14
 *   lt_evening_premium    96.1 → 105.81  (+10.1 %) — the h17-21 and h10-14
 *                                        slices were selected by the same
 *                                        false identity
 *   pl_avg_eur_mwh        151.06 → 150.21 (−0.56 %) — the PL document omitted
 *                                        two positions that day
 *   lt_avg_eur_mwh        unmoved that day; on the committed 2026-08-03
 *                         document, where both failure conditions hold,
 *                         €75.4309 → €69.1542 and lt_hours 190 → 96
 *
 * The independent control is what settled it: against Elering's NPS series for
 * the same window, agreement goes 2/96 → 96/96 on the committed document.
 *
 * `'flat'` stays reachable so the pre-49 basis remains reproducible for
 * comparison, exactly as `mw_partition: 'current'` does for 38.6a. It is not
 * selectable from the public route.
 */
const S1_DAY_PARSE_MODES = new Set(['flat', 'market_day']);
const S1_DAY_PARSE_DEFAULT = 'market_day';

function s1DayParseMode(env) {
  const m = env?.S1_DAY_PARSE;
  return S1_DAY_PARSE_MODES.has(m) ? m : S1_DAY_PARSE_DEFAULT;
}

async function computeS1(env) {
  const apiKey = env.ENTSOE_API_KEY;
  if (!apiKey) throw new Error('ENTSOE_API_KEY secret not set');

  // Fetch today, tomorrow (best-effort), and historical in parallel
  const [[ltXml, se4Xml, plXml], historical, ltTomorrow, se4Tomorrow] = await Promise.all([
    Promise.all([
      fetchBznGuarded(LT_BZN,  apiKey, 'LT'),
      fetchBznGuarded(SE4_BZN, apiKey, 'SE4'),
      fetchBzn(PL_BZN, apiKey).catch(() => ''),
    ]),
    computeHistorical(apiKey),
    fetchBznRange(LT_BZN,  apiKey, 1, 2),  // null before ~13:00 CET publication
    fetchBznRange(SE4_BZN, apiKey, 1, 2),
  ]);

  const dayMode = s1DayParseMode(env);
  const nowMs = Date.now();

  /**
   * One zone's series for today, on whichever basis the flag selects.
   * A refused market day falls back to the flat scrape rather than taking S1
   * down — but it says so in the log and on the payload, so a refusal is
   * visible instead of being absorbed (B8).
   */
  const zoneDay = (xml, label) => {
    if (dayMode !== 'market_day') return { prices: extractPrices(xml ?? ''), day: null, basis: 'flat' };
    const d = marketDayAt(parseA44Periods(xml ?? ''), nowMs);
    if (!d.ok) {
      console.warn(`[S1/day] ${label} market-day admission REFUSED (${d.reason}: ${d.detail}) — falling back to flat scrape`);
      return { prices: extractPrices(xml ?? ''), day: null, basis: 'flat_after_refusal', refusal: `${d.reason}: ${d.detail}` };
    }
    console.log(`[S1/day] ${label} ${new Date(d.startMs).toISOString()}→${new Date(d.endMs).toISOString()} ${d.hours}h PT${d.resolutionMin}M ${d.slots} slots, ${d.forward_filled} forward-filled`);
    return { prices: d.prices, day: d, basis: 'market_day' };
  };

  const lt  = zoneDay(ltXml,  'LT');
  const se4 = zoneDay(se4Xml, 'SE4');
  const pl  = zoneDay(plXml,  'PL');
  const ltPrices  = lt.prices;
  const se4Prices = se4.prices;
  const plPrices  = pl.prices;
  const ltDay = lt.day;

  if (!ltPrices.length || !se4Prices.length) {
    // Say which leg and whether it was the fetch or the document — the old
    // message ("No price data: LT=0h SE4=96h") could not distinguish an ENTSO-E
    // rejection from an empty but valid publication, and this error is the one
    // that surfaces in the cron's Telegram alert.
    throw new Error(
      `No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h ` +
      `(LT fetch ${ltXml == null ? 'FAILED' : 'ok'}, SE4 fetch ${se4Xml == null ? 'FAILED' : 'ok'})`,
    );
  }

  const ltAvg  = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;

  // BUG 2 FIX: guard against near-zero or negative SE4 (explodes % when SE4 < €10)
  const separationPct = (spread / Math.max(Math.abs(se4Avg), 10)) * 100;

  // Poland spread (best-effort — may be null if ENTSO-E times out)
  let pl_avg = null;
  let lt_pl_spread_eur = null;
  let lt_pl_spread_pct = null;
  if (plPrices.length) {
    pl_avg           = Math.round(avg(plPrices) * 100) / 100;
    lt_pl_spread_eur = Math.round((ltAvg - pl_avg) * 100) / 100;
    lt_pl_spread_pct = Math.round((lt_pl_spread_eur / Math.max(Math.abs(pl_avg), 10)) * 1000) / 10;
    console.log(`[S1/PL] pl_avg=${pl_avg} lt_pl_spread=${lt_pl_spread_eur}€/MWh (${lt_pl_spread_pct}%)`);
  } else {
    console.log('[S1/PL] no data — PL fetch failed or empty');
  }

  // Intraday swing: max - min of LT hourly prices (arbitrage window for trading revenue)
  const lt_daily_swing_eur_mwh = ltPrices.length >= 2
    ? Math.round((Math.max(...ltPrices) - Math.min(...ltPrices)) * 100) / 100
    : null;

  // Peak / trough anchored to the same full-day array used for the swing,
  // emitting UTC clock-hours so the frontend can format directly via
  // formatHourEET.
  //
  // ── Phase 49 item 1, rule #2 ────────────────────────────────────────────────
  // `Math.floor(idx * 24 / N)` treats index 0 as UTC 00:00. That was never true
  // on a CET/CEST market day, which starts at 22:00Z (summer) or 23:00Z, so the
  // label is two hours out even on a clean single-day document — and on today's
  // shipped flat scrape, where N=190 spans two days, the same expression put the
  // 17:45Z peak of the committed fixture at "UTC hour 9". A label asserting WHEN
  // a value came from must be computed from the evidence.
  //
  // Under `market_day` the hour is read off the slot's own wall-clock instant.
  // Under `flat` the old expression is preserved verbatim, because the flag is
  // OFF and this phase moves nothing unsigned.
  let lt_peak_hour_utc = null, lt_peak_price = null;
  let lt_trough_hour_utc = null, lt_trough_price = null;
  let lt_hourly_24 = null;
  let lt_hourly_start_utc = null;
  if (ltPrices.length >= 24) {
    let peakIdx = 0, troughIdx = 0;
    for (let i = 1; i < ltPrices.length; i++) {
      if (ltPrices[i] > ltPrices[peakIdx])   peakIdx   = i;
      if (ltPrices[i] < ltPrices[troughIdx]) troughIdx = i;
    }
    const N = ltPrices.length;
    lt_peak_hour_utc   = ltDay ? slotHourUtc(ltDay, peakIdx)   : Math.floor((peakIdx   * 24) / N);
    lt_trough_hour_utc = ltDay ? slotHourUtc(ltDay, troughIdx) : Math.floor((troughIdx * 24) / N);
    lt_peak_price   = Math.round(ltPrices[peakIdx]   * 100) / 100;
    lt_trough_price = Math.round(ltPrices[troughIdx] * 100) / 100;

    if (ltDay) {
      // One entry per hour OF THE MARKET DAY — 23, 24 or 25 of them, which is
      // how many hours the day has. `lt_hourly_start_utc` says which UTC hour
      // entry 0 is, computed from the day's own start, so a consumer can label
      // the series without assuming anything. A fixed 24 starting at UTC 00:00
      // is wrong on every day of the year here, and wrong by an extra hour twice.
      const perHour = 60 / ltDay.resolutionMin;
      lt_hourly_24 = [];
      for (let h = 0; h < ltDay.hours; h++) {
        const bucket = ltPrices.slice(h * perHour, (h + 1) * perHour);
        lt_hourly_24.push(Math.round((bucket.reduce((a, b) => a + b, 0) / bucket.length) * 100) / 100);
      }
      lt_hourly_start_utc = slotHourUtc(ltDay, 0);
    } else {
      // 24-entry hourly downsampling (avg of sub-entries per UTC hour).
      // Resolution-aware via Math.round(h*N/24) bucketing. Handles N=24
      // (pass-through), N=96 (4 sub-bars per hour), and N=95 (3-or-4 sub-bars
      // per hour) uniformly. Output: always 24-entry float array.
      lt_hourly_24 = [];
      for (let h = 0; h < 24; h++) {
        const lo = Math.round((h * N) / 24);
        const hi = Math.round(((h + 1) * N) / 24);
        const bucket = ltPrices.slice(lo, hi);
        const m = bucket.reduce((a, b) => a + b, 0) / bucket.length;
        lt_hourly_24.push(Math.round(m * 100) / 100);
      }
    }
  }

  // Evening premium: mean(LT h17-21) - mean(LT h10-14) — peak vs shoulder.
  //
  // Same rule-#2 problem as the hour labels above, and the same split: under
  // `market_day` the slices are selected by each slot's real UTC hour; under
  // `flat` the index arithmetic is preserved verbatim so the flag stays OFF.
  // The flat form maps hour h to index Math.round(h*N/24), which is correct only
  // if index 0 is UTC 00:00.
  const N_evp = ltPrices.length;
  const byUtcHour = (from, toExclusive) =>
    ltPrices.filter((_, i) => {
      const h = slotHourUtc(ltDay, i);
      return h >= from && h < toExclusive;
    });
  const ltEvening  = ltDay ? byUtcHour(17, 22) : ltPrices.slice(Math.round(17 * N_evp / 24), Math.round(22 * N_evp / 24));
  const ltShoulder = ltDay ? byUtcHour(10, 15) : ltPrices.slice(Math.round(10 * N_evp / 24), Math.round(15 * N_evp / 24));
  const lt_evening_premium = (ltEvening.length && ltShoulder.length)
    ? Math.round((avg(ltEvening) - avg(ltShoulder)) * 100) / 100
    : null;

  // BESS intraday capture: top-4h sell vs bottom-4h buy (revenue model arbitrage input)
  let p_high_avg = null, p_low_avg = null, intraday_capture = null, bess_net_capture = null;
  if (ltPrices.length >= 24) {
    const sorted = [...ltPrices].sort((a, b) => a - b);
    const bottom4 = sorted.slice(0, 4);
    const top4    = sorted.slice(-4);
    p_low_avg        = Math.round(bottom4.reduce((a, b) => a + b, 0) / 4 * 10) / 10;
    p_high_avg       = Math.round(top4.reduce((a, b) => a + b, 0) / 4 * 10) / 10;
    intraday_capture = Math.round((p_high_avg - p_low_avg) * 10) / 10;
    bess_net_capture = Math.round((p_high_avg - p_low_avg / RTE_BOL.h2) * 10) / 10;
  }

  console.log(`[S1] coupling_spread=${Math.round(spread*100)/100}€/MWh intraday_swing=${lt_daily_swing_eur_mwh}€/MWh evening_premium=${lt_evening_premium}€/MWh`);
  if (lt_daily_swing_eur_mwh !== null && lt_daily_swing_eur_mwh < spread) {
    console.warn(`[S1] WARNING: swing (${lt_daily_swing_eur_mwh}) < coupling spread (${Math.round(spread*100)/100}) — unusual`);
  }

  // DA tomorrow — populated only after ENTSO-E publishes (~13:00 CET)
  let da_tomorrow = null;
  if (ltTomorrow.length && se4Tomorrow.length) {
    const ltTomAvg  = avg(ltTomorrow);
    const se4TomAvg = avg(se4Tomorrow);
    // BUG 1 FIX: use tomorrow variables in denominator; guard against near-zero SE4
    const tomSpreadPct = (ltTomAvg - se4TomAvg) / Math.max(Math.abs(se4TomAvg), 10) * 100;
    const tomDate = new Date();
    tomDate.setUTCDate(tomDate.getUTCDate() + 1);
    da_tomorrow = {
      lt_peak:       Math.round(Math.max(...ltTomorrow) * 100) / 100,
      lt_trough:     Math.round(Math.min(...ltTomorrow) * 100) / 100,
      lt_avg:        Math.round(ltTomAvg * 100) / 100,
      se4_avg:       Math.round(se4TomAvg * 100) / 100,
      spread_pct:    Math.round(tomSpreadPct * 10) / 10,
      delivery_date: tomDate.toISOString().slice(0, 10),
      // Phase 36.C (B0-G) — the hourly array itself, not just its summary
      // statistics. `GET /api/dispatch?mode=forecast` reads `prices_24h`; every
      // writer stored only scalars, so that read resolved to [] and the forecast
      // mode had never once served since it was written. Dispatch needs the
      // shape of the day, which no set of aggregates can reconstruct.
      ...daResolutionFields(ltTomorrow),
      se4_prices: se4Tomorrow,
    };
    console.log(`[S1/tomorrow] lt_avg=${da_tomorrow.lt_avg} lt_peak=${da_tomorrow.lt_peak} se4_avg=${da_tomorrow.se4_avg} spread=${da_tomorrow.spread_pct}%`);
  } else {
    console.log(`[S1/tomorrow] not yet published (lt=${ltTomorrow.length}h se4=${se4Tomorrow.length}h)`);
  }

  return {
    signal: 'S1',
    name: 'Baltic Price Separation',
    lt_avg_eur_mwh:            Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh:           Math.round(se4Avg * 100) / 100,
    spread_eur_mwh:            Math.round(spread * 100) / 100,
    separation_pct:            Math.round(separationPct * 10) / 10,
    pl_avg_eur_mwh:            pl_avg,
    lt_pl_spread_eur_mwh:      lt_pl_spread_eur,
    lt_pl_spread_pct,
    lt_daily_swing_eur_mwh,
    lt_peak_hour_utc, lt_peak_price,
    lt_trough_hour_utc, lt_trough_price,
    lt_hourly_24,
    lt_evening_premium,
    p_high_avg, p_low_avg, intraday_capture, bess_net_capture,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
    // Phase 49 item 1 — which day these numbers are, said out loud rather than
    // assumed. Present only under `market_day`, so the flag being OFF leaves the
    // payload byte-identical; `lt_hourly_start_utc` is what lets a consumer
    // label the hourly series without assuming index 0 is UTC 00:00.
    ...(ltDay ? {
      lt_day_basis: 'cet_market_day',
      lt_day_start_utc: new Date(ltDay.startMs).toISOString(),
      lt_day_end_utc: new Date(ltDay.endMs).toISOString(),
      lt_day_hours: ltDay.hours,
      lt_day_resolution_min: ltDay.resolutionMin,
      lt_day_forward_filled: ltDay.forward_filled,
      lt_hourly_start_utc,
    } : {}),
    ...(lt.refusal ? { lt_day_refusal: lt.refusal } : {}),
    // Hourly price arrays for trading engine consumption
    hourly_lt:  ltPrices.map(p => Math.round(p * 100) / 100),
    hourly_se4: se4Prices.map(p => Math.round(p * 100) / 100),
    da_tomorrow,
    ...historical,
  };
}

// ─── S1 Rolling History (90-day KV store) ─────────────────────────────────────

const HISTORY_KEY = 's1_history';
const MAX_HISTORY = 90; // days

/**
 * Read-only companion to `updateHistory` (Phase 38.1).
 *
 * `GET /s1` needs the rolling history to compute `spread_stats_90d` /
 * `swing_stats_90d` for its response, but it must NOT append to it: the old
 * catch-all called `updateHistory` on every unmatched GET, so a stray 404
 * appended a row. `s1_history` currently holds 90 rows spanning 8 distinct
 * dates as a result (B-056). Reading is the correct verb for a read endpoint.
 */
async function readHistory(env) {
  try {
    const raw = await env.KKME_SIGNALS.get(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * One row per market day, last write wins.
 *
 * Phase 38.2 (B-056) — `updateHistory` appended unconditionally, so a 4-hourly
 * cron described the same day six times and `rollingStats` reported the row
 * count as `days_of_data`. Measured 2026-08-03: 90 rows over NINE distinct
 * dates, published as `n: 90, days_of_data: 90`.
 *
 * Keep-LAST rather than keep-first: the last write of a day has seen the most
 * of it. Sorted by date so the array is chronological regardless of the order
 * rows arrived in — `slice(-14)` means "the last fourteen days" only if the
 * array is in date order, and SpreadCaptureCard's sparkline depends on it.
 */
function dedupeByDateKeepLast(rows) {
  const byDate = new Map();
  for (const r of rows || []) {
    if (r && r.date) byDate.set(r.date, r);
  }
  return [...byDate.keys()].sort().map(d => byDate.get(d));
}

/**
 * The canonical daily swing series (Phase 38.2, option 3 / rule #4).
 *
 * `lt_swing` used to be read off `s1_history`, whose rows are stamped with the
 * WRITE date rather than the market day of the prices in them. Cross-checked
 * against `s1_capture_history` — which dedupes by market date on write, and is
 * what the S1 card's honest "DAYS 30" already sits on — keep-last disagreed on
 * SEVEN of nine shared dates (B-060). Not an off-by-one, and the cause is not
 * established, so the series moves to the writer that is known to be right
 * rather than being deduped in place and published anyway.
 *
 * `spread_eur` has no such companion archive and stays on `s1_history`, which
 * is why the two statistics on this card legitimately carry different `n`.
 */
async function readSwingSeries(env) {
  try {
    const raw = await env.KKME_SIGNALS.get('s1_capture_history');
    const rows = raw ? JSON.parse(raw) : [];
    return dedupeByDateKeepLast(rows)
      .filter(r => r && r.swing != null)
      // Caught post-deploy, and it is the mirror image of the bug this phase
      // fixed: `s1_capture_history` holds 400 market days (2025-05-02 →), so
      // an unwindowed read published `swing_stats_90d` at n = 400. Where
      // `days_of_data` used to overstate the window, this understated it —
      // both are a label that does not describe its own data (rule #2). The
      // field says 90 days, so it gets the last 90 MARKET DAYS, matching
      // MAX_HISTORY and the spread series it sits beside.
      .slice(-MAX_HISTORY)
      .map(r => ({ date: r.date, lt_swing: r.swing }));
  } catch {
    return [];
  }
}

async function updateHistory(env, todayEntry) {
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get(HISTORY_KEY);
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }

  history.push({
    date:       todayEntry.updated_at.split('T')[0],
    spread_eur: todayEntry.spread_eur_mwh,
    spread_pct: todayEntry.separation_pct,
    lt_swing:   todayEntry.lt_daily_swing_eur_mwh,
    // Capture fields — read flat first, fall back to nested (works regardless of merge order)
    gross_2h:   todayEntry.capture?.gross_2h ?? todayEntry.capture?.capture_2h?.gross_eur_mwh ?? null,
    gross_4h:   todayEntry.capture?.gross_4h ?? todayEntry.capture?.capture_4h?.gross_eur_mwh ?? null,
  });

  // Phase 38.2 — collapse to one row per market day BEFORE the cap. Without
  // this the 90-row window held nine days of repeats and `slice(-14)` on the
  // consumer side resolved to two dates, rendered under a "14D" label.
  history = dedupeByDateKeepLast(history);

  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  await env.KKME_SIGNALS.put(HISTORY_KEY, JSON.stringify(history));
  return history;
}

/** Generic history append for S2/S3/S4. Key = '{signal}_history', max 90 entries. */
async function appendSignalHistory(env, signal, entry) {
  const key = `${signal}_history`;
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get(key);
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }
  const today = new Date().toISOString().split('T')[0];
  // deduplicate: keep only the latest entry per date
  history = history.filter(e => e.date !== today);
  history.push({ ...entry, date: today });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  await env.KKME_SIGNALS.put(key, JSON.stringify(history));
}

// Phase 21.2 — `s2_btd_history` is the 365-day BTD daily-clearing-price KV the
// `/s2.capacity_monthly` aggregate is computed from. Two write paths into it
// must stay in sync (worker-direct cron + Mac-cron POST `/s2/update`); previously
// only the worker-direct path appended, which silently under-populated the KV
// whenever BTD's edge-side SSL flickered to 526 and Mac cron stepped in.
async function appendBtdHistory(env, payload) {
  try {
    const histRaw = await env.KKME_SIGNALS.get('s2_btd_history').catch(() => null);
    const hist = histRaw ? JSON.parse(histRaw) : [];
    const today = new Date().toISOString().slice(0, 10);
    if (!hist.some(h => h.date === today)) {
      hist.push({
        date: today,
        fcr: payload.fcr_avg,
        afrr_up: payload.afrr_up_avg,
        mfrr_up: payload.mfrr_up_avg,
      });
    }
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const trimmed = hist.filter(h => h.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    await env.KKME_SIGNALS.put('s2_btd_history', JSON.stringify(trimmed));
    console.log(`[S2/btd-history] ${trimmed.length} days`);
  } catch (e) {
    console.error('[S2/btd-history]', String(e));
  }
}

// ── Phase 36.C — S2 multi-leg ingestion: admission control ───────────────────
// S2 has more than one writer (VPS cron POST, worker-direct cron, and formerly
// the Mac cron). Before 36.C each leg wrote unconditionally, so whichever ran
// last won — including a leg holding an older observation window. The 2026-07-17
// stall was the mirror image of that: every leg failed silently and each was
// coded to assume another was covering.
//
// Admission rule: FRESHNESS WINS OUTRIGHT. `data_window_end` is the last BTD
// delivery date a payload was computed from — the honest recency measure, since
// BTD publishes with a ~2-day lag and wall-clock write time says nothing about
// how current the underlying data is. Source priority only breaks ties within
// the same window.
const S2_SOURCE_PRIORITY = {
  vps:             3,  // primary — the only host with proven BTD reachability
  'worker-direct': 2,  // opportunistic secondary; self-heals if CF's 526 clears
  mac:             1,  // retired 36.C, ranked so a stray run can't outrank VPS
};

function s2SourceRank(source) {
  return S2_SOURCE_PRIORITY[source] ?? 0;
}

/**
 * Decide whether an incoming S2 write may replace what is already in KV.
 * @returns {{ admit: boolean, reason: string }}
 */
export function s2AdmitWrite(incoming, stored) {
  const inWin  = incoming?.data_window_end ?? null;
  const inSrc  = incoming?.source ?? 'unknown';
  if (!stored) return { admit: true, reason: 'no stored payload' };

  const stWin = stored?.data_window_end ?? null;
  const stSrc = stored?._meta?.source ?? stored?.source ?? 'unknown';

  // Legacy payloads predate `data_window_end`. Refusing to compare would freeze
  // S2 permanently, so admit and say so rather than guess a window.
  if (!inWin || !stWin) {
    return { admit: true, reason: `window unknown (in=${inWin ?? '—'} stored=${stWin ?? '—'}) — admitted uncompared` };
  }

  if (inWin > stWin) return { admit: true,  reason: `fresher window ${inWin} > ${stWin}` };
  if (inWin < stWin) return { admit: false, reason: `stale window ${inWin} < ${stWin} (stored from ${stSrc})` };

  const inRank = s2SourceRank(inSrc), stRank = s2SourceRank(stSrc);
  if (inRank >= stRank) {
    return { admit: true, reason: `same window ${inWin}, source ${inSrc}(${inRank}) >= ${stSrc}(${stRank})` };
  }
  return { admit: false, reason: `same window ${inWin}, source ${inSrc}(${inRank}) < ${stSrc}(${stRank})` };
}

/**
 * Phase 36.C — the single commit path for S2, shared by all ingestion legs.
 *
 * Before this there were three near-identical blocks (4-hourly cron, 09:30
 * cron, POST /s2/update); they had already drifted apart once — Phase 21.2 had
 * to backfill `s2_btd_history` because only one of them appended to it. One
 * function, three callers.
 *
 * @param {string} sourceLeg one of S2_SOURCE_PRIORITY's keys
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, errors?: string[] }}
 */
async function s2CommitPayload(env, payload, sourceLeg, label) {
  const storedRaw = await env.KKME_SIGNALS.get('s2').catch(() => null);
  let stored = null;
  try { stored = storedRaw ? JSON.parse(storedRaw) : null; } catch { stored = null; }

  const verdict = s2AdmitWrite({ ...payload, source: sourceLeg }, stored);
  if (!verdict.admit) {
    console.log(`[${label}] write skipped — ${verdict.reason}`);
    return { ok: false, skipped: true, reason: verdict.reason };
  }

  // `_source` is what kvWrite copies into `_meta.source`, so the served payload
  // says which leg actually produced it rather than a generic 'live'.
  const validation = await kvWrite(env.KKME_SIGNALS, 's2', { ...payload, _source: sourceLeg }, {
    required:   ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg'],
    bounds_key: 's2',
  });
  if (!validation.success) {
    console.error(`[${label}] KV write rejected: ${validation.errors.join(' | ')}`);
    await notifyTelegram(env, `⚠️ S2 (${sourceLeg}): KV write rejected — ${validation.errors.join(' | ')}`).catch(() => {});
    return { ok: false, errors: validation.errors };
  }

  console.log(`[${label}] committed via ${sourceLeg} — ${verdict.reason} | fcr=${payload.fcr_avg} afrr_up=${payload.afrr_up_avg} window_end=${payload.data_window_end ?? '—'}`);
  await appendSignalHistory(env, 's2', {
    afrr_up: payload.afrr_up_avg, mfrr_up: payload.mfrr_up_avg, fcr: payload.fcr_avg,
  }).catch(e => console.error('[S2/history]', e));
  await appendBtdHistory(env, payload);
  return { ok: true };
}

// ── Phase 36.C — upstream TLS-expiry tripwire ────────────────────────────────
// The 2026-07-17 outage began as a lapsed Let's Encrypt cert on BTD's origin
// and ran 12 days before anyone noticed, because nothing watched certificates
// and every ingestion leg failed quietly. The inspection cannot live here:
// Workers' fetch() gives no access to the peer certificate, and the CF edge
// cannot complete a handshake with BTD at all. So the VPS runs `openssl
// s_client` daily and POSTs the result; the worker owns the alerting.
const CERT_WARN_DAYS = 7;

async function checkCertWatchLiveness(env) {
  const raw = await env.KKME_SIGNALS.get('cert_watch').catch(() => null);
  if (!raw) {
    await notifyTelegram(env, '⚠️ Cert tripwire has never reported — VPS cert_watch cron may not be installed');
    return;
  }
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  const ageH = data.checked_at ? (Date.now() - new Date(data.checked_at).getTime()) / 3600000 : Infinity;
  if (ageH > 48) {
    await notifyTelegram(env, `⚠️ Cert tripwire silent for ${ageH.toFixed(0)}h — VPS cert_watch cron may have stopped`);
  }
}

// ── Phase 36.C — derive BTD country column offsets instead of hardcoding ─────
// BTD ships `header_groups` whenever `json_header_groups=1` is set (both fetch
// legs set it). The old parser hardcoded Lithuania at values[10..14], which is
// correct today but asserts a layout the response itself declares — exactly the
// class of silent breakage discipline rule #2 exists to stop. Resolve from the
// payload, fall back to the historical constant, and shout if they disagree.
const S2_LT_FALLBACK_BASE = 10;

export function s2ResolveCountryBase(dataset, country = 'Lithuania') {
  const groups = dataset?.data?.header_groups;
  const row = Array.isArray(groups) ? groups[0] : null;
  if (Array.isArray(row)) {
    const hit = row.find(g => String(g?.label ?? '').trim().toLowerCase() === country.toLowerCase());
    if (hit && Number.isInteger(hit.start)) {
      if (country === 'Lithuania' && hit.start !== S2_LT_FALLBACK_BASE) {
        console.warn(`[BTD/columns] ${country} base moved: header_groups says ${hit.start}, historical constant ${S2_LT_FALLBACK_BASE} — trusting the payload`);
      }
      return hit.start;
    }
  }
  // `columns[]` carries the same mapping via group_level_0; try it before giving up.
  const cols = dataset?.data?.columns;
  if (Array.isArray(cols)) {
    const hit = cols.find(c => String(c?.group_level_0 ?? '').trim().toLowerCase() === country.toLowerCase());
    if (hit && Number.isInteger(hit.index)) return hit.index;
  }
  return country === 'Lithuania' ? S2_LT_FALLBACK_BASE : null;
}

// Last delivery date covered by a BTD dataset — the payload's true recency.
export function s2DataWindowEnd(dataset) {
  const ts = dataset?.data?.timeseries;
  if (!Array.isArray(ts) || !ts.length) return null;
  for (let i = ts.length - 1; i >= 0; i--) {
    const vals = ts[i]?.values;
    if (Array.isArray(vals) && vals.some(v => v !== null && v !== undefined)) {
      const from = ts[i]._from || ts[i].from || '';
      const d = String(from).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    }
  }
  return null;
}

/**
 * Phase 38.2 (B-056) — `days_of_data` counted ROWS. `s1_history` held 90 rows
 * over nine distinct dates, so the published provenance claim was wrong by a
 * factor of ten and every consumer that trusted it inherited the error.
 *
 * It now counts DISTINCT DATES among the rows that actually contributed a
 * value. Callers dedupe upstream, so `n` and `days_of_data` should agree — and
 * when they do not, the payload says so instead of hiding it behind one number
 * that means whichever of the two flatters it.
 */
function rollingStats(history, field) {
  const rows = (history || []).filter(h => h && h[field] != null);
  const vals = rows.map(h => h[field]).sort((a, b) => a - b);
  if (!vals.length) return null;
  const days = new Set(rows.map(h => h.date).filter(Boolean)).size;
  const p = (pct) => vals[Math.floor(vals.length * pct)] ?? vals[vals.length - 1];
  return {
    p25: Math.round(p(0.25) * 100) / 100,
    p50: Math.round(p(0.50) * 100) / 100,
    p75: Math.round(p(0.75) * 100) / 100,
    p90: Math.round(p(0.90) * 100) / 100,
    n:   vals.length,
    days_of_data: days || vals.length,
  };
}

// Phase 21 — 30d-vs-prior-60d directional delta on Lithuania aFRR up-only
// capacity-reservation €/MW/h (BTD price_procured_reserves rolling-7d mean,
// snapshotted daily into the s2_history KV via appendSignalHistory). Returns
// percent (1dp) or null when the window is underfilled.
//
// Window choice: MAX_HISTORY caps s2_history at 90 days. "Current 30d vs prior
// 60d" fits exactly; "current 30d vs prior 90d" would need 120 days. Smooth
// enough to read regime direction (post-Feb-2025 sync state) without the
// week-to-week noise of shorter windows.
//
// Null-safety: requires ≥15 entries in current window AND ≥30 in prior window
// before emitting a number; protects against early-deploy or sparse-history
// Cardinality. Returns null if prior_mean is zero (avoid /0).
function computeAfrrUp30dVs60dDeltaPct(history) {
  if (!Array.isArray(history) || history.length < 60) return null;
  const sorted = [...history].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last30 = sorted.slice(-30).map(h => h.afrr_up).filter(v => typeof v === 'number' && Number.isFinite(v));
  const prior60 = sorted.slice(-90, -30).map(h => h.afrr_up).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (last30.length < 15 || prior60.length < 30) return null;
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const cur = mean(last30);
  const prior = mean(prior60);
  if (prior === 0) return null;
  return Math.round(((cur - prior) / prior) * 1000) / 10;
}

// ─── S4 — Grid Connection Scarcity ────────────────────────────────────────────

function s4SignalLevel(freeMw) {
  if (freeMw > 2000) return 'OPEN';
  if (freeMw >= 500)  return 'TIGHTENING';
  return 'SCARCE';
}

const S4_INTERPRETATION = {
  OPEN:       'Grid capacity available. Connection reservation costs stable (~€50k/MW). Window open for new project origination.',
  TIGHTENING: 'Free capacity compressing. RTB reservations repricing. Move on viable nodes before queue closes.',
  SCARCE:     'Hard constraint approaching. Existing reservations repricing above €60k/MW. New entry difficult.',
};

// ─────────────────────────────────────────────────────────────────────
// VERT.lt ArcGIS — PRIMARY source for Lithuanian BESS project data.
//
// Pulls from VERT.lt's grid-permits ArcGIS FeatureServer (layer 8),
// filtered by Tipas === 'Kaupikliai' (storage type).
//
// Returns grid-level aggregates: free_mw, connected_mw, reserved_mw.
// Individual project detail comes from s4_fleet KV (populated by VPS
// daily pipeline → kkme_sync.py → POST /s2/fleet).
//
// NOT to be confused with the deprecated Litgrid balancing-capacites
// scraper (litgrid.eu/dashboard/balancing-capacites/31577) which
// stopped publishing data post-Feb 2025 synchronization. Baltic
// balancing procurement is now in BTD only.
//
// Last verified: 2026-04-08
// ─────────────────────────────────────────────────────────────────────
async function computeS4() {
  const res = await fetch(S4_URL);
  if (!res.ok) throw new Error(`S4 FeatureServer: HTTP ${res.status}`);

  const json = await res.json();
  const feature = json.features?.find((f) => f.attributes?.Tipas === 'Kaupikliai');
  if (!feature) throw new Error('S4: Kaupikliai row not found in FeatureServer response');

  const a = feature.attributes;
  const free_mw      = a.Laisva_galia_prijungimui    ?? 0;
  const connected_mw = a.Prijungtoji_galia_PT         ?? 0;
  const reserved_mw  = a.Pasirasytu_ketinimu_pro_galia ?? 0;

  const utilisation_pct = (connected_mw + free_mw) > 0
    ? Math.round((connected_mw / (connected_mw + free_mw)) * 1000) / 10
    : 0;

  const signal = s4SignalLevel(free_mw);

  return {
    timestamp: new Date().toISOString(),
    free_mw,
    connected_mw,
    reserved_mw,
    utilisation_pct,
    signal,
    interpretation: S4_INTERPRETATION[signal],
  };
}

// ─── S4 Layer 3 — Individual Kaupikliai (storage) projects from Litgrid ArcGIS ──
// Queries FeatureServer/3 ("Prijungti įrenginiai" = connected installations)
// filtered by Elektrinės_tipas = 'Kaupikliai'. Returns individual project records
// with WGS84 geometry via outSR=4326.
//
// Fields available: OBJECTID, Eil_Nr, Prijungimo_taskas (city/substation),
// Elektrines_LGG_MW (power MW), Prijungimo_tasko_itampa_kV (voltage),
// Papildoma_informacija (notes). No owner, MWh, COD, or status fields.
// Layer name "Connected installations" implies all rows are operational.
// ─────────────────────────────────────────────────────────────────────

async function fetchLitgridKaupikliai() {
  const res = await fetch(S4_LAYER3_URL);
  if (!res.ok) throw new Error(`S4 Layer 3: HTTP ${res.status}`);
  const json = await res.json();
  const features = json.features ?? [];
  if (features.length === 0) throw new Error('S4 Layer 3: no Kaupikliai features returned');

  return features.map(f => {
    const a = f.attributes ?? {};
    const g = f.geometry ?? {};
    const city = (a.Prijungimo_taskas ?? '').trim();
    const mw = a.Elektrines_LGG_MW ?? 0;
    const kv = a.Prijungimo_tasko_itampa_kV ?? null;
    const oid = a.OBJECTID;
    const eil = a.Eil_Nr;
    const info = (a.Papildoma_informacija ?? '').trim();
    return {
      id: `litgrid-kaupikliai-${oid}`,
      name: `Kaupikliai ${city}`,
      mw,
      mwh: null,  // Layer 3 doesn't have duration/MWh
      status: 'operational',
      country: 'LT',
      tso: 'Litgrid',
      type: 'kaupikliai',
      source: 'litgrid-layer3',
      source_url: 'https://atviri-litgrid.hub.arcgis.com/',
      connection_point: city,
      voltage_kv: kv,
      eil_nr: eil,
      litgrid_objectid: oid,
      info: info || null,
      lat: typeof g.y === 'number' ? Math.round(g.y * 1e6) / 1e6 : null,
      lng: typeof g.x === 'number' ? Math.round(g.x * 1e6) / 1e6 : null,
      _contradiction_flags: [],
      _freshness: 1.0,
    };
  });
}

// Merge Litgrid Layer 3 Kaupikliai records into fleet KV.
// - Layer 3 records (source='litgrid-layer3') replace all prior Layer 3 records
// - Manual entries for non-LT countries or LT entries without 'litgrid-layer3' source are preserved
// - The old aggregate "Energy Cells (Kruonis)" manual entry is removed if present
async function syncLitgridFleet(env) {
  const kaupikliai = await fetchLitgridKaupikliai();
  console.log(`[S4/layer3] fetched ${kaupikliai.length} Kaupikliai records from Litgrid`);

  const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
           || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
  const current = raw ? JSON.parse(raw) : { raw_entries: [], demand: null };
  const entries = current.raw_entries ?? [];

  // Remove old Layer 3 records and the stale "Energy Cells (Kruonis)" aggregate
  const preserved = entries.filter(e =>
    e.source !== 'litgrid-layer3' &&
    !(e.name === 'Energy Cells (Kruonis)')
  );

  // Add fresh Layer 3 records
  const merged = [...preserved, ...kaupikliai];

  const fleet = processFleet(merged, current.demand);
  fleet.raw_entries = merged;
  fleet.demand = current.demand;
  const json = JSON.stringify(fleet);
  await Promise.all([
    env.KKME_SIGNALS.put('s4_fleet', json),
    env.KKME_SIGNALS.put('s2_fleet', json),
  ]);
  console.log(`[S4/layer3] fleet synced: ${merged.length} entries (${kaupikliai.length} from Layer 3, ${preserved.length} preserved), sd_ratio=${fleet.sd_ratio}`);
  return { synced: kaupikliai.length, total: merged.length, sd_ratio: fleet.sd_ratio };
}

/**
 * Phase 36.D — Litgrid publication tripwire.
 *
 * Weekly page-diff on the three indexes the demand module depends on. Alerts
 * and stops. It never ingests, never touches the module, and never changes a
 * number: adoption is a human reading the document and running an adoption
 * pass. See workers/lib/publication-watcher.js for why that separation is not
 * negotiable.
 *
 * First run per target stores the fingerprint and stays silent — otherwise
 * every target would alert once on deploy, which trains the operator to ignore
 * it. Fail-soft per target: a page that 403s or times out must not take the
 * cron down with it.
 */
async function checkLitgridPublications(env, { force = false } = {}) {
  const now = Date.now();
  const results = [];
  for (const target of WATCH_TARGETS) {
    const key = fingerprintKey(target.id);
    try {
      const raw = await env.KKME_SIGNALS.get(key).catch(() => null);
      const prev = raw ? JSON.parse(raw) : null;
      if (!force && !isDue(prev?.checked_at, now)) {
        results.push({ id: target.id, skipped: 'not due' });
        continue;
      }
      const res = await fetch(target.url, {
        headers: { 'User-Agent': 'kkme-publication-watcher/1.0 (+https://kkme.eu)' },
      });
      if (!res.ok) {
        results.push({ id: target.id, error: `HTTP ${res.status}` });
        continue;
      }
      const html = await res.text();
      const fp = fingerprintPage(html);
      if (!fp) {
        // No document links found. If we have never seen any on this page the
        // target was pinned wrong and the operator needs to know NOW rather
        // than discover it the day a forecast is republished — a watcher that
        // reports "no links" once and then goes quiet looks armed and is not.
        // If we HAD links and now do not, the page moved or the selector broke,
        // which is equally worth an alert. Either way: alert, do not sit on it.
        const hadLinks = prev?.fingerprint;
        await notifyTelegram(env,
          `⚠️ Litgrid watcher blind — ${target.label}\n${target.url}\n\n`
          + (hadLinks
            ? 'This page previously listed documents and now lists none. The page moved or the selector broke.'
            : 'No documents have ever been found on this page. The target URL is probably wrong.')
          + `\n\nThe demand module (v${DEMAND_FORECAST_VERSION.version}) is NOT being watched on this target.`
        ).catch((e) => console.error('[litgrid-watch/notify]', String(e)));
        await env.KKME_SIGNALS.put(key, JSON.stringify({
          fingerprint: null, blind: true, checked_at: new Date(now).toISOString(),
        }));
        results.push({ id: target.id, error: 'no document links found — alerted' });
        continue;
      }
      if (prev?.fingerprint === undefined) {
        // First sight of this target: record and stay silent.
        await env.KKME_SIGNALS.put(key, JSON.stringify({
          fingerprint: fp, checked_at: new Date(now).toISOString(),
        }));
        // The raw HTML is kept alongside so the NEXT run can diff link-for-link
        // and say WHAT changed, not merely that something did.
        await env.KKME_SIGNALS.put(`${key}:html`, html);
        results.push({ id: target.id, seeded: true });
        continue;
      }
      const changed = prev.fingerprint !== fp;
      if (changed) {
        const prevHtml = (await env.KKME_SIGNALS.get(`${key}:html`).catch(() => null)) || '';
        const diff = diffPages(prevHtml, html);
        const alert = buildAlert(target, diff, DEMAND_FORECAST_VERSION.version);
        if (alert) {
          await notifyTelegram(env, alert).catch((e) => console.error('[litgrid-watch/notify]', String(e)));
        }
        await env.KKME_SIGNALS.put(`${key}:html`, html);
      }
      await env.KKME_SIGNALS.put(key, JSON.stringify({
        fingerprint: fp, checked_at: new Date(now).toISOString(),
      }));
      results.push({ id: target.id, changed });
    } catch (e) {
      results.push({ id: target.id, error: String(e) });
    }
  }
  console.log('[litgrid-watch]', JSON.stringify(results));
  return results;
}

// ─── S3 — Cell Cost Stack ───────────────────────────────────────────────────────
// Layer 1: Trading Economics — Chinese lithium carbonate CNY/T (trend direction)
// Layer 2: InfoLink — DC-side 2h ESS system bid price RMB/Wh (best effort)
// Layer 3: Static BNEF/Ember Dec 2025 turnkey cost anchors (hardcoded, update quarterly)

const TE_URL = 'https://tradingeconomics.com/commodity/lithium';
const TE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const INFOLINK_URL = 'https://www.infolink-group.com/energy-article/ess-spot-price-20260106';

// FX fallback (EUR base) — used if Frankfurter API unavailable
const FX_FALLBACK = { usd: 1.05, cny: 7.60 }; // approximate EUR/USD, EUR/CNY Feb 2026

// BNEF Dec 2025 anchor costs, pre-converted to EUR using ~0.93 EUR/USD
const S3_REFS = {
  china_system_eur_kwh:  68,
  europe_system_eur_kwh: 164,
  global_avg_eur_kwh:    109,
  ref_source: 'BNEF Dec 2025 / frankfurter.app FX',
  ref_date:   '2025-12',
};

// Layer 1 — lithium carbonate trend (threshold-based; no historical storage)
function lithiumTrend(cnyT) {
  if (cnyT < 120000) return '↓ falling';
  if (cnyT <= 180000) return '→ stable';
  return '↑ rising';
}

// Signal: COMPRESSING | STABLE | PRESSURE | WATCH
function s3SignalLevel(trend, cellEurKwh) {
  if (trend === '↓ falling') return 'COMPRESSING';
  if (trend === '→ stable')  return 'STABLE';
  // trend === '↑ rising'
  if (cellEurKwh !== null && cellEurKwh > 90) return 'PRESSURE';
  return 'WATCH';
}

const S3_INTERPRETATION = {
  COMPRESSING: 'Upstream costs falling. LFP cell direction negative — capex window improving. China system floor €68/kWh (BNEF Dec 2025).',
  STABLE:      'Cost stack within range. Lithium flat, cell prices tracking baseline. EU installed ~€164/kWh vs China €68/kWh gap persists.',
  PRESSURE:    'Upstream cost pressure building. Lithium rising. Re-check OEM quotes before fixing capex assumptions.',
  WATCH:       'Lithium elevated. Cell price direction unclear — verify latest OEM quotes directly.',
};

// Returns {price, unit} or null.
function parseLithiumPrice(html) {
  // Pattern 1 (most reliable): meta description "Lithium rose/fell to 161,750 CNY/T"
  const cnyMeta = html.match(/Lithium\s+(?:rose|fell)[^"]*?to\s+([\d,]+)\s+CNY\/T/i);
  if (cnyMeta) {
    const val = parseFloat(cnyMeta[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 500000) return { price: val, unit: 'CNY/T' };
  }

  // Pattern 2: any "NNN,NNN CNY/T" pattern anywhere in HTML
  const cnyInline = html.match(/([\d,]+)\s+CNY\/T/i);
  if (cnyInline) {
    const val = parseFloat(cnyInline[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 500000) return { price: val, unit: 'CNY/T' };
  }

  // Pattern 3: embedded JSON "price":"12345" or "last":"12345" (USD range)
  for (const re of [/"price"\s*:\s*"?([\d,]+\.?\d*)"?/, /"last"\s*:\s*"?([\d,]+\.?\d*)"/]) {
    const m = html.match(re);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val >= 5000 && val <= 100000) return { price: val, unit: '$/t' };
    }
  }

  // Pattern 4: data-value attribute
  const dataMatch = html.match(/data-value="([\d,]+\.?\d*)"/);
  if (dataMatch) {
    const val = parseFloat(dataMatch[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 100000) return { price: val, unit: '$/t' };
  }

  return null;
}

// Extract DC-side 2h containerized ESS average price from InfoLink article.
// Target text: "DC-side liquid-cooled containerized ESS (2h)...averaging RMB 0.45/Wh"
function parseInfoLinkDc2h(html) {
  const m = html.match(/DC-side[^)]*\(2h\)[^.]*?averaging\s+RMB\s+([\d.]+)\s*\/\s*Wh/i);
  if (m) {
    const val = parseFloat(m[1]);
    if (val >= 0.2 && val <= 1.5) return val;
  }
  return null;
}

// Fetch live EUR/USD and EUR/CNY rates from Frankfurter; falls back to FX_FALLBACK.
async function fetchFxRates() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,CNY', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const json = await res.json();
    return {
      usd:  json.rates?.USD ?? FX_FALLBACK.usd,
      cny:  json.rates?.CNY ?? FX_FALLBACK.cny,
      date: json.date ?? null,
    };
  } catch (err) {
    clearTimeout(timer);
    console.error('[FX] frankfurter.app failed, using fallback rates:', String(err));
    return { usd: FX_FALLBACK.usd, cny: FX_FALLBACK.cny, date: null };
  }
}

// ── S3 freshness helpers ──────────────────────────────────────────────────────
async function updateS3Freshness(kv, sourceKey, extra = {}) {
  const raw = await kv.get('s3_freshness').catch(() => null);
  const freshness = raw ? JSON.parse(raw) : {};
  freshness[sourceKey] = { last_update: new Date().toISOString(), status: 'current', ...extra };
  await kv.put('s3_freshness', JSON.stringify(freshness));
}

function checkS3Freshness(entry, maxAgeHours) {
  if (!entry?.last_update) return 'unknown';
  const ageHours = (Date.now() - new Date(entry.last_update).getTime()) / 3600000;
  return ageHours > maxAgeHours ? 'stale' : 'current';
}

// ── S3 weekly enrichment (Claude + web search) ──────────────────────────────
async function enrichS3(env) {
  const prompt = `You are a BESS market analyst. Search for information from the last 2 weeks on:
1. European utility-scale BESS installed cost trends
2. LFP cell or pack pricing trends
3. HV transformer and grid equipment lead times or pricing
4. Baltic BESS project announcements (Lithuania, Latvia, Estonia)
5. PCS / inverter pricing or grid-forming compliance updates

Return ONLY valid JSON:
{"search_date":"YYYY-MM-DD","findings":[{"topic":"battery_cost|grid_equipment|transaction|pcs|financing|policy","headline":"max 80 chars","source":"name","relevance":"high|medium|low","driver_key":"battery_hardware|electrical_pcs|hv_grid|financing","direction_signal":"easing|stable|constrained|increasing","magnitude_signal":"weak|moderate|strong"}],"driver_sentiment":{"battery_hardware":{"direction":"easing","magnitude":"moderate","evidence_count":0,"summary":"brief"},"electrical_pcs":{"direction":"stable","magnitude":"weak","evidence_count":0,"summary":""},"hv_grid":{"direction":"constrained","magnitude":"strong","evidence_count":0,"summary":""},"financing":{"direction":"easing","magnitude":"moderate","evidence_count":0,"summary":""}},"new_transactions":[],"range_drift_flag":false,"range_drift_reason":""}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: prompt }] }),
    });
    // \u2500\u2500 Phase 39.2 \u2014 read the envelope before trusting the letter \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    //
    // The old path went straight to `res.json()` and then to `data.content`,
    // with no status check anywhere. Every non-2xx from the Anthropic API \u2014
    // 401 on a rotated key, 429, 529 overloaded \u2014 returns a well-formed JSON
    // ERROR body, which parses fine, has no `content`, and collapses to
    // `textContent === ''`. `JSON.parse('')` then throws "Unexpected end of
    // JSON input" and the operator's phone said, in full: "S3 enrichment ran
    // but JSON parse failed." The actual API error was read, discarded, and
    // replaced by a message about the wrong layer. Same class as NordPool
    // serving HTML where JSON was expected (36.C) \u2014 the bytes that arrived are
    // the diagnosis, and they were the one thing not kept.
    const bodyText = await res.text();
    const envelope = {
      status: res.status,
      ctype: (res.headers.get('content-type') || 'none').split(';')[0],
      bytes: bodyText.length,
    };
    if (!res.ok) {
      const diag = `HTTP ${envelope.status} \u00b7 ${envelope.ctype} \u00b7 ${envelope.bytes}B \u00b7 ${redactForAlert(bodyText).slice(0, 200)}`;
      console.error('[S3/enrichment] API error:', diag);
      await alertTransition(env, 's3_enrichment', 'degraded', `S3 enrichment: API rejected the request\n${diag}`);
      return;
    }
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (envErr) {
      const diag = `HTTP ${envelope.status} \u00b7 ${envelope.ctype} \u00b7 ${envelope.bytes}B \u00b7 ${redactForAlert(bodyText).slice(0, 200)}`;
      console.error('[S3/enrichment] response envelope is not JSON:', String(envErr), diag);
      await alertTransition(env, 's3_enrichment', 'degraded', `S3 enrichment: response was not JSON\n${diag}`);
      return;
    }
    const textContent = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    let enrichment;
    try {
      // Strip markdown fences and preamble
      let cleaned = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace >= 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.substring(0, lastBrace + 1);
      if (!cleaned) throw new Error('model returned no text block');
      enrichment = JSON.parse(cleaned);
    } catch (parseErr) {
      // The model's own output failed to parse. Carry what it actually said,
      // plus the envelope it arrived in and the stop_reason, which is what
      // distinguishes a truncated answer (max_tokens) from a malformed one.
      const diag = [
        `HTTP ${envelope.status} \u00b7 ${envelope.ctype} \u00b7 ${envelope.bytes}B`,
        `stop_reason=${data.stop_reason ?? '\u2014'} blocks=${(data.content || []).length} text=${textContent.length}B`,
        `err=${parseErr.message}`,
        `head: ${redactForAlert(textContent).slice(0, 200) || '(empty text block)'}`,
      ].join('\n');
      console.error('[S3/enrichment] JSON parse failed:', diag);
      await alertTransition(env, 's3_enrichment', 'degraded', `S3 enrichment: model output did not parse\n${diag}`);
      return;
    }
    await alertTransition(env, 's3_enrichment', 'ok', 'S3 enrichment parsed cleanly');
    if (!enrichment.findings || !enrichment.driver_sentiment) {
      console.error('[S3/enrichment] missing required fields');
      return;
    }
    enrichment.enriched_at = new Date().toISOString();
    enrichment.model = 'claude-sonnet-4-20250514';
    await env.KKME_SIGNALS.put('s3_enrichment', JSON.stringify(enrichment));
    await updateS3Freshness(env.KKME_SIGNALS, 'enrichment');

    // Validation: check baseline drift
    const baseline = JSON.parse(await env.KKME_SIGNALS.get('s3_baseline').catch(() => 'null') || 'null');
    const s3 = JSON.parse(await env.KKME_SIGNALS.get('s3').catch(() => '{}') || '{}');
    const alerts = [];
    if (baseline?.lithium_reference_eur_t && s3.lithium_eur_t) {
      const drift = (s3.lithium_eur_t - baseline.lithium_reference_eur_t) / baseline.lithium_reference_eur_t;
      if (Math.abs(drift) > 0.25) alerts.push(`Lithium moved ${(drift*100).toFixed(0)}% since ranges were set.`);
    }
    if (baseline?.set_at) {
      const age = (Date.now() - new Date(baseline.set_at).getTime()) / 86400000;
      if (age > 90) alerts.push(`Editorial data last calibrated ${Math.floor(age)} days ago.`);
    }

    // Telegram digest
    const parts = ['\ud83d\udd0b S3 Weekly Digest'];
    const topH = (enrichment.findings || []).filter(f => f.relevance === 'high').slice(0, 3);
    if (topH.length) { parts.push('\ud83d\udcf0 Key signals:'); topH.forEach(h => parts.push(`  \u2022 ${h.headline}`)); }
    if (alerts.length) { parts.push('\n\u26a0\ufe0f Review:'); alerts.forEach(a => parts.push(`  \u2022 ${a}`)); }
    parts.push(alerts.length ? '\n\ud83d\udd34 Action needed' : '\n\ud83d\udfe2 No action needed');
    await notifyTelegram(env, parts.join('\n'));

    console.log(`[S3/enrichment] ${enrichment.findings.length} findings, ${alerts.length} alerts`);
  } catch (err) {
    console.error('[S3/enrichment] failed:', err);
    await notifyTelegram(env, `\u26a0\ufe0f S3 enrichment failed: ${String(err).slice(0, 200)}`);
  }
}

/**
 * ─── S3, with the scrape leg injectable (Phase 51, B-072) ────────────────────
 *
 * `tradingeconomics.com` answers a Cloudflare Worker with a 20-second hang and
 * nothing else — no status, no headers. Measured 2026-08-04 with a controlled
 * three-network probe, same URL and the same three headers: laptop HTTP 200 in
 * 0.14 s, Hetzner VPS HTTP 200 in 0.10 s, Worker times out. Not the upstream,
 * not the headers, not datacenter IPs. **Whether it is a CloudFront WAF rule is
 * still not established, and it does not need to be to route around it.** Same
 * shape as 36.C: when one path is dead and another is proven, use the proven one.
 *
 * So the VPS — which already runs eleven authenticated crons — fetches the page
 * and POSTs the HTML to `/s3/scrape`. **The worker keeps the parse.** Moving
 * `parseLithiumPrice` into Python would give one quantity two implementations in
 * two languages with one of them outside this repo's tests, which is precisely
 * what discipline rule #4 exists to stop.
 *
 * @param {object} [opts]
 * @param {string} [opts.html]      pre-fetched TE page; skips the worker's own fetch
 * @param {string} [opts.fetchedAt] when the VPS fetched it, for provenance
 */
async function computeS3(opts = {}) {
  const injected = typeof opts.html === 'string' ? opts.html : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let teStatus = null;
  let teCtype = null;
  let teBytes = null;
  let bodyPreview = '';

  // ── Phase 49 item 4 — one dead host must not take a healthy one down ───────
  //
  // These two were inside one `Promise.all`, so the TE abort rejected the whole
  // function and the catch below returned a payload with NO `fx_rates` at all —
  // even though Frankfurter had answered in under a second. Observed live
  // 2026-08-04T08:00:20Z: `fx_rates` absent from `/s3` while
  // `data_freshness.ecb_euribor` had updated normally at 08:01:06Z.
  //
  // This is 39.2's finding recurring one signal over: "the ENTSO-E day-ahead
  // curve was in hand and the capture was thrown away for want of a second copy
  // of it." Settled independently, so a scrape failure costs the scrape and
  // nothing else.
  let fx;
  try {
    fx = await fetchFxRates();
  } catch (fxErr) {
    console.error('[S3/fx] fetchFxRates failed:', String(fxErr));
    fx = null;
  }

  try {
    // A synthetic 200 for the injected path, so everything below — the ok check,
    // the parse, the failure envelopes — runs identically whether the bytes came
    // from the worker's own fetch or from the VPS. One code path, one payload
    // shape; the source is recorded, not branched around.
    const teRes = injected !== null
      ? { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => injected }
      : await fetch(TE_URL, { signal: controller.signal, headers: TE_HEADERS, redirect: 'follow' });
    clearTimeout(timer);
    if (!fx) throw new Error('FX unavailable and TE scrape cannot be published without it');
    teStatus = teRes.status;
    teCtype = (teRes.headers.get('content-type') || 'none').split(';')[0];

    if (!teRes.ok) {
      const body = await teRes.text().catch(() => '');
      teBytes = body.length;
      bodyPreview = body.slice(0, 500);
      return {
        timestamp: new Date().toISOString(),
        unavailable: true,
        signal: 'STABLE',
        ...S3_REFS,
        fx_rates: { usd: fx.usd, cny: fx.cny },
        fx_timestamp: fx.date,
        interpretation: 'Data temporarily unavailable.',
        source: 'tradingeconomics.com + infolink-group.com',
        _scrape_error: `TE HTTP ${teRes.status}`,
        // Phase 39.2 — the envelope, flat, so the alert can quote it without
        // reaching into a debug blob. status + content-type + byte length +
        // head is the minimum that distinguishes "upstream is down" from
        // "upstream served an HTML error page where the scrape wanted markup"
        // from "we were rate-limited" — the three cases the old
        // one-line error could not tell apart.
        _scrape_status: teStatus,
        _scrape_ctype: teCtype,
        _scrape_bytes: teBytes,
        _scrape_head: redactForAlert(bodyPreview).slice(0, 200),
        _scrape_debug: { status: teStatus, bodyPreview },
      };
    }

    const teHtml = await teRes.text();
    teBytes = teHtml.length;
    bodyPreview = teHtml.slice(0, 500);

    const parsed = parseLithiumPrice(teHtml);
    if (parsed === null) {
      return {
        timestamp: new Date().toISOString(),
        unavailable: true,
        signal: 'STABLE',
        ...S3_REFS,
        fx_rates: { usd: fx.usd, cny: fx.cny },
        fx_timestamp: fx.date,
        interpretation: 'Price parse failed — check _scrape_debug.',
        source: 'tradingeconomics.com + infolink-group.com',
        _scrape_error: 'TE price not found in HTML',
        _scrape_status: teStatus,
        _scrape_ctype: teCtype,
        _scrape_bytes: teBytes,
        _scrape_head: redactForAlert(bodyPreview).slice(0, 200),
        _scrape_debug: { status: teStatus, bodyPreview },
      };
    }

    // Raw CNY value used for trend/signal logic (internal only, never stored)
    const lithium_cny_t = parsed.unit === 'CNY/T' ? parsed.price : Math.round(parsed.price * 7.27);
    const lithium_trend = lithiumTrend(lithium_cny_t);
    const lithium_eur_t = Math.round(lithium_cny_t / fx.cny);

    // Layer 2: InfoLink ESS 2h DC system price (best effort, 10s timeout)
    let cell_eur_kwh = null;
    try {
      const ilCtrl  = new AbortController();
      const ilTimer = setTimeout(() => ilCtrl.abort(), 10000);
      const ilRes   = await fetch(INFOLINK_URL, {
        signal: ilCtrl.signal,
        headers: { 'User-Agent': TE_HEADERS['User-Agent'], 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.5' },
      });
      clearTimeout(ilTimer);
      if (ilRes.ok) {
        const cell_rmb_wh = parseInfoLinkDc2h(await ilRes.text());
        if (cell_rmb_wh !== null) {
          cell_eur_kwh = Math.round(cell_rmb_wh * 1000 / fx.cny * 10) / 10;
        }
      }
    } catch { /* signal computed from Layer 1 alone */ }

    const signal = s3SignalLevel(lithium_trend, cell_eur_kwh);

    return {
      timestamp: new Date().toISOString(),
      lithium_eur_t,
      lithium_trend,
      cell_eur_kwh,
      ...S3_REFS,
      fx_rates: { usd: fx.usd, cny: fx.cny },
      fx_timestamp: fx.date,
      signal,
      interpretation: S3_INTERPRETATION[signal],
      source: 'tradingeconomics.com + infolink-group.com',
      // Which path delivered the bytes, recorded on the payload rather than
      // inferred — the same reason `resolveCaptureDay` stamps `capture_source`.
      // A VPS-routed day must be legible in the data, not a silent substitution.
      scrape_transport: injected !== null ? 'vps_relay' : 'worker_direct',
      ...(injected !== null && opts.fetchedAt ? { scrape_fetched_at: opts.fetchedAt } : {}),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      timestamp: new Date().toISOString(),
      unavailable: true,
      signal: 'STABLE',
      ...S3_REFS,
      // Whatever survived is published. The FX leg answering is not made
      // worthless by the scrape leg failing, and a payload that drops a
      // healthy observation because an unrelated one timed out is a second
      // outage caused by the first.
      ...(fx ? { fx_rates: { usd: fx.usd, cny: fx.cny }, fx_timestamp: fx.date } : {}),
      interpretation: 'Data temporarily unavailable.',
      source: 'tradingeconomics.com + infolink-group.com',
      _scrape_error: String(err),
      _scrape_status: teStatus,
      _scrape_ctype: teCtype,
      _scrape_bytes: teBytes,
      _scrape_head: redactForAlert(bodyPreview).slice(0, 200),
      _scrape_debug: { status: teStatus, bodyPreview },
    };
  }
}

// ─── Nord Pool DA ──────────────────────────────────────────────────────────────
// Fetches latest published DA prices for LT and SE4 from Nord Pool.
// Runs in cron (CF IP may be blocked) + fallback via POST /da_tomorrow/update.

// Phase 36.C (B0-G) — resolution-aware DA price-array fields.
//
// The market is mid-transition from PT60M to PT15M, so array length is the only
// honest resolution signal available at write time and must be RECORDED, not
// re-inferred downstream. The 36.B0-D class of defect was precisely a consumer
// assuming 24 slots and silently mis-indexing a 96-slot day; stamping the
// resolution here means a consumer can assert rather than guess.
export function daResolutionFields(prices) {
  const n = Array.isArray(prices) ? prices.length : 0;
  let resolution = null;
  if (n >= 92 && n <= 100) resolution = 'PT15M';       // 96, ±DST
  else if (n >= 23 && n <= 25) resolution = 'PT60M';   // 24, ±DST
  return {
    prices_24h: prices,           // name kept: it is the key every consumer reads
    resolution,                   // null when the length matches no known cadence
    slots: n,
    slots_per_hour: resolution === 'PT15M' ? 4 : resolution === 'PT60M' ? 1 : null,
  };
}

function npShapeMetrics(ltPrices, se4Prices) {
  if (!ltPrices.length || !se4Prices.length) return null;
  const ltAvg    = ltPrices.reduce((a, b) => a + b, 0) / ltPrices.length;
  const se4Avg   = se4Prices.reduce((a, b) => a + b, 0) / se4Prices.length;
  const spreadPct = se4Avg !== 0 ? ((ltAvg - se4Avg) / se4Avg) * 100 : 0;
  return {
    lt_peak:   Math.round(Math.max(...ltPrices) * 100) / 100,
    lt_trough: Math.round(Math.min(...ltPrices) * 100) / 100,
    lt_avg:    Math.round(ltAvg * 100) / 100,
    se4_avg:   Math.round(se4Avg * 100) / 100,
    spread_pct: Math.round(spreadPct * 10) / 10,
  };
}

async function fetchNordPoolDA() {
  const url = new URL(NP_DA_URL);
  url.searchParams.set('deliveryDate', 'latest');
  url.searchParams.set('currency', 'EUR');
  url.searchParams.set('deliveryAreas', 'LT,SE4');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`NordPool HTTP ${res.status}`);
    const json = await res.json();

    const ltPrices = [], se4Prices = [];
    let deliveryDate = null;

    // Format A: { multiAreaEntries: [{ deliveryStart, entryPerArea: { LT, SE4 } }] }
    if (Array.isArray(json.multiAreaEntries)) {
      deliveryDate = json.multiAreaEntries[0]?.deliveryStart?.slice(0, 10) ?? null;
      for (const e of json.multiAreaEntries) {
        const lt  = e.entryPerArea?.LT;
        const se4 = e.entryPerArea?.SE4;
        if (lt  != null && !isNaN(+lt))  ltPrices.push(+lt);
        if (se4 != null && !isNaN(+se4)) se4Prices.push(+se4);
      }
    }
    // Format B: flat array [{ LT, SE4, deliveryDate }, ...]
    else if (Array.isArray(json)) {
      deliveryDate = json[0]?.deliveryDate ?? null;
      for (const e of json) {
        const lt  = e.LT  ?? e.lt;
        const se4 = e.SE4 ?? e.se4;
        if (lt  != null && !isNaN(+lt))  ltPrices.push(+lt);
        if (se4 != null && !isNaN(+se4)) se4Prices.push(+se4);
      }
    }

    console.log(`[NP/DA] parsed: lt=${ltPrices.length}h se4=${se4Prices.length}h date=${deliveryDate}`);
    const metrics = npShapeMetrics(ltPrices, se4Prices);
    if (!metrics) throw new Error('NordPool: no LT/SE4 price data found in response');

    // Phase 36.C (B0-G) — the THIRD writer of the da_tomorrow KV, and in
    // practice the one that populates it: `GET /da_tomorrow` calls this on a
    // cache miss and stores the result. Fixing only computeS1 and the POST path
    // would have left the live path still storing scalars, and forecast mode
    // still starving — with two of three writers fixed, which is the kind of
    // partial repair that reads as done and isn't.
    return {
      ...metrics,
      ...daResolutionFields(ltPrices),
      se4_prices: se4Prices,
      delivery_date: deliveryDate,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Euribor + HICP ────────────────────────────────────────────────────────────
// ECB Data Portal — nominal 3M Euribor (FM dataset) + HICP YoY inflation

// ECB series keys (flow/key format — dot notation in URL causes HTML response):
//   Nominal 3M Euribor: FM / M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA  → ~2.03% Jan 2026
//   HICP inflation YoY: ICP / M.U2.N.000000.4.ANR              → ~1.9% Dec 2025
const ECB_EURIBOR_NOMINAL_URL = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=3&format=jsondata';
const ECB_HICP_URL            = 'https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?lastNObservations=3&format=jsondata';

function ecbExtractLastValue(json) {
  try {
    const obs = json?.dataSets?.[0]?.series?.['0:0:0:0:0:0']?.observations
             ?? json?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations
             ?? json?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0']?.observations;
    if (!obs) return null;
    const keys = Object.keys(obs).map(Number).sort((a, b) => b - a);
    const val  = obs[keys[0]]?.[0];
    return val != null && !isNaN(+val) ? Math.round(+val * 100) / 100 : null;
  } catch { return null; }
}

async function computeEuribor() {
  const FALLBACK = { euribor_nominal_3m: 2.6, hicp_yoy: 2.4 };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const [eurRes, hicpRes] = await Promise.allSettled([
      fetch(ECB_EURIBOR_NOMINAL_URL, { signal: controller.signal }),
      fetch(ECB_HICP_URL,            { signal: controller.signal }),
    ]);
    clearTimeout(timer);

    let euribor_nominal_3m = FALLBACK.euribor_nominal_3m;
    let hicp_yoy           = FALLBACK.hicp_yoy;
    let source             = 'fallback';

    if (eurRes.status === 'fulfilled' && eurRes.value.ok) {
      const val = ecbExtractLastValue(await eurRes.value.json());
      if (val !== null) { euribor_nominal_3m = val; source = 'ecb-live'; }
    }
    if (hicpRes.status === 'fulfilled' && hicpRes.value.ok) {
      const val = ecbExtractLastValue(await hicpRes.value.json());
      if (val !== null) { hicp_yoy = val; }
    }

    const euribor_real_3m   = Math.round((euribor_nominal_3m - hicp_yoy) * 100) / 100;
    const euribor_trend     = euribor_nominal_3m < 2.7 ? '↓ falling' : euribor_nominal_3m > 3.0 ? '↑ rising' : '→ stable';

    console.log(`[Euribor] nominal=${euribor_nominal_3m}% hicp=${hicp_yoy}% real=${euribor_real_3m}% source=${source}`);
    return {
      euribor_nominal_3m,
      euribor_3m:      euribor_nominal_3m,  // alias for backward compat
      euribor_real_3m,
      hicp_yoy,
      euribor_trend,
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Euribor] fetch failed, using fallback:', String(err));
    const { euribor_nominal_3m, hicp_yoy } = FALLBACK;
    return {
      euribor_nominal_3m,
      euribor_3m:      euribor_nominal_3m,
      euribor_real_3m: Math.round((euribor_nominal_3m - hicp_yoy) * 100) / 100,
      hicp_yoy,
      euribor_trend:   '↓ falling',
      source:          'fallback',
      timestamp:       new Date().toISOString(),
    };
  }
}

// ─── S2 — Balancing Stack ───────────────────────────────────────────────────────
// S2 data fetched directly by Worker cron from BTD API + Litgrid ordered capacity.
// Also accepts external POSTs to /s2/update for backward compatibility.
//
// Confirmed BTD structure (price_procured_reserves):
//   d.data.timeseries = [{ from, to, values: [15 numbers] }, ...]
//   values indices for Lithuania:
//     [10] FCR Symmetric (EUR/MW/h)
//     [11] aFRR Upward
//     [12] aFRR Downward
//     [13] mFRR Upward
//     [14] mFRR Downward
//   Data publishes with ~2 day lag — fetch window: 9 days ago → 2 days ago

// ── BTD API fetch ─────────────────────────────────────────────────────────────
async function fetchBTDDataset(id, start, end) {
  const url = `https://api-baltic.transparency-dashboard.eu/api/v1/export?id=${id}&start_date=${start}T00:00&end_date=${end}T00:00&output_time_zone=UTC&output_format=json&json_header_groups=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // BTD periodically has SSL cert issues (526) — Mac cron handles data push separately
      console.log(`[BTD] ${id}: HTTP ${res.status} — using cached KV data`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.log(`[BTD] ${id}: fetch error (${e.message}) — using cached KV data`);
    return null;
  }
}

// ── Litgrid ordered balancing capacity — REMOVED (Phase 36.C) ────────────────
// A regex scraper of https://www.litgrid.eu/.../balancing-capacites/31577 lived
// here and fed `ordered_price` / `ordered_mw` into the S2 payload. The 36.C
// Pause-A audit queried that dashboard across five ranges spanning 2025-03 to
// 2026-07 and got zero data cells every time — headers render, rows never do.
// Litgrid moved balancing publication to BTD post-synchronisation, so the
// scraper had been parsing a permanently empty page for at least 17 months and
// both fields were always null. Deleted rather than fixed: there is nothing on
// the far end to fix against. See
// docs/investigations/2026-07-29-phase-36-c-pause-a-source-audit.md.

// ── Monthly activation clearing aggregates from BTD ──────────────────────────
// Fetches price_procured_reserves month by month (BTD rate-limits large ranges),
// groups by month, computes stats. Stores in KV 's2_activation'.
async function computeS2Activation() {
  // Fetch in monthly chunks (parallel). BTD blocks large ranges from some IPs.
  const now = new Date();
  const fetches = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEndDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const mEnd = mEndDate > now ? now : mEndDate;
    fetches.push(fetchBTDDataset('price_procured_reserves', mStart.toISOString().slice(0, 10), mEnd.toISOString().slice(0, 10)));
  }
  const results = await Promise.all(fetches);

  const allTimeseries = [];
  for (const r of results) {
    if (r?.data?.timeseries) allTimeseries.push(...r.data.timeseries);
  }

  if (allTimeseries.length === 0) {
    console.log('[S2/activation] No timeseries data from BTD (all 6 month fetches returned null)');
    return null;
  }
  console.log(`[S2/activation] fetched ${allTimeseries.length} ISPs across ${results.filter(r => r?.data?.timeseries).length}/6 months`);

  const timeseries = allTimeseries;

  // BTD columns: EE(0-4), LV(5-9), LT(10-14)
  // Each: FCR_sym, aFRR_up, aFRR_dn, mFRR_up, mFRR_dn
  const COUNTRY_COLS = {
    Estonia:   { afrr_up: 1, mfrr_up: 3 },
    Latvia:    { afrr_up: 6, mfrr_up: 8 },
    Lithuania: { afrr_up: 11, mfrr_up: 13 },
  };

  // Group by country and month
  const monthlyData = {}; // { country: { month: { afrr: [], mfrr: [] } } }
  for (const [country, cols] of Object.entries(COUNTRY_COLS)) {
    monthlyData[country] = {};
  }

  for (const isp of timeseries) {
    const from = isp.from || isp._from || '';
    const month = from.slice(0, 7);
    if (!month || month.length !== 7) continue;
    const values = isp.values;
    if (!values) continue;

    for (const [country, cols] of Object.entries(COUNTRY_COLS)) {
      if (!monthlyData[country][month]) monthlyData[country][month] = { afrr: [], mfrr: [] };
      const afrrVal = values[cols.afrr_up];
      const mfrrVal = values[cols.mfrr_up];
      if (afrrVal != null && afrrVal > 0) monthlyData[country][month].afrr.push(afrrVal);
      if (mfrrVal != null && mfrrVal > 0) monthlyData[country][month].mfrr.push(mfrrVal);
    }
  }

  // Stats helper
  function stats(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
    return { avg, p50, p90, count: arr.length, activation_rate: arr.length / (30 * 96) };
  }

  const months = [...new Set(
    Object.values(monthlyData).flatMap(c => Object.keys(c))
  )].sort();

  // Build per-country data in the format the parser expects:
  // countries.Lithuania.afrr_up = { '2026-01': { avg, p50, p90, count }, ... }
  // countries.Lithuania.afrr_recent_3m = { avg_p50: ... }
  const countries = {};
  for (const [country, monthMap] of Object.entries(monthlyData)) {
    const afrr_up = {};
    const mfrr_up = {};
    for (const month of months) {
      if (monthMap[month]) {
        const as = stats(monthMap[month].afrr);
        const ms = stats(monthMap[month].mfrr);
        if (as) afrr_up[month] = as;
        if (ms) mfrr_up[month] = ms;
      }
    }

    // Recent 3 months average P50
    const recent3 = months.slice(-3);
    const recentAfrrP50s = recent3.map(m => afrr_up[m]?.p50).filter(v => v != null);
    const recentMfrrP50s = recent3.map(m => mfrr_up[m]?.p50).filter(v => v != null);
    const afrr_recent_3m = recentAfrrP50s.length
      ? { avg_p50: Math.round(recentAfrrP50s.reduce((s, v) => s + v, 0) / recentAfrrP50s.length * 10) / 10 }
      : { avg_p50: null };
    const mfrr_recent_3m = recentMfrrP50s.length
      ? { avg_p50: Math.round(recentMfrrP50s.reduce((s, v) => s + v, 0) / recentMfrrP50s.length * 10) / 10 }
      : { avg_p50: null };

    countries[country] = { afrr_up, afrr_recent_3m, mfrr_up, mfrr_recent_3m };
  }

  // Compression trajectory (Lithuania P50 over time)
  const ltData = monthlyData['Lithuania'] || {};
  const compression_trajectory = {
    afrr_lt_p50: months.map(m => stats(ltData[m]?.afrr)?.p50 ?? 0),
    afrr_lt_avg: months.map(m => stats(ltData[m]?.afrr)?.avg ?? 0),
    months,
  };

  return {
    countries,
    compression_trajectory,
    period: `${months[0]} to ${months[months.length - 1]}`,
    source: 'baltic.transparency-dashboard.eu',
    data_class: 'observed',
    stored_at: new Date().toISOString(),
  };
}

// ── Full S2 fetch: BTD → shaped payload ──────────────────────────────────────
// Worker-direct leg. Since 2026-07 Cloudflare's egress gets a persistent 526
// from BTD's origin (confirmed twice from the CF edge during the 36.C audit,
// with litgrid.eu returning 200 on the same runs), so in practice this returns
// null and the VPS leg serves. Kept deliberately: it costs nothing while it
// fails and self-heals the moment the 526 clears.
async function computeS2() {
  const nineAgo    = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  const [reserves, direction, imbalance] = await Promise.all([
    fetchBTDDataset('price_procured_reserves',   nineAgo, twoDaysAgo),
    fetchBTDDataset('direction_of_balancing_v2', nineAgo, twoDaysAgo),
    fetchBTDDataset('imbalance_prices',          nineAgo, twoDaysAgo),
  ]);

  if (!reserves || !direction || !imbalance) {
    console.log('[S2/compute] BTD dataset(s) unavailable from the CF edge — deferring to the VPS leg');
    return null;
  }

  const payload = s2ShapePayload(reserves, direction, imbalance);
  payload.source_leg = 'worker-direct';
  console.log(`[S2/compute] window_end=${payload.data_window_end ?? '—'} fcr=${payload.fcr_avg} afrr_up=${payload.afrr_up_avg}`);
  return payload;
}

function s2Mean(arr)  { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function s2P90(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
}
function s2r2(n) { return n === null ? null : Math.round(n * 100) / 100; }

// Extract a column by index from d.data.timeseries rows, filtering nulls.
function s2ExtractIdx(raw, idx) {
  try {
    const rows = raw?.data?.timeseries;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(row => {
      const v = row?.values?.[idx];
      return (v !== null && v !== undefined && !isNaN(+v)) ? [+v] : [];
    });
  } catch { return []; }
}

// Fallback column extractor for direction/imbalance datasets (pattern-based).
// direction_of_balancing_v2 and imbalance_prices may have different shapes.
function s2ExtractCol(raw, pattern) {
  if (!raw) return [];
  const pat = pattern.toLowerCase();
  try {
    // Timeseries format (same as reserves)
    const rows = raw?.data?.timeseries;
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0]?.values)) {
      // Can't pattern-match by index — caller must use s2ExtractIdx
      return [];
    }
    // Format A: array of row objects
    if (Array.isArray(raw)) {
      const key = Object.keys(raw[0] || {}).find(k => k.toLowerCase().includes(pat));
      if (!key) return [];
      return raw.flatMap(r => {
        const v = r[key];
        return (v !== null && v !== undefined && v !== '' && !isNaN(+v)) ? [+v] : [];
      });
    }
    // Format B: { headers, data }
    if (raw.data && raw.headers) {
      const hi = raw.headers.findIndex(h => String(h).toLowerCase().includes(pat));
      if (hi < 0) return [];
      return raw.data.flatMap(r => {
        const v = r[hi];
        return (v !== null && v !== undefined && v !== '' && !isNaN(+v)) ? [+v] : [];
      });
    }
    return [];
  } catch { return []; }
}

// S2_INTERPRETATION removed — no editorial in worker responses.

function computeCapacityMonthly(history) {
  const byMonth = {};
  for (const d of history) {
    const m = d.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { afrr: [], mfrr: [], fcr: [] };
    if (d.afrr_up != null) byMonth[m].afrr.push(d.afrr_up);
    if (d.mfrr_up != null) byMonth[m].mfrr.push(d.mfrr_up);
    if (d.fcr != null) byMonth[m].fcr.push(d.fcr);
  }
  const avg = arr => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length * 100) / 100 : null;
  return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
    month, afrr_avg: avg(v.afrr), mfrr_avg: avg(v.mfrr), fcr_avg: avg(v.fcr), days: v.afrr.length,
  }));
}

// Parse raw BTD { reserves, direction, imbalance } into a shaped S2 KV payload.
function s2ShapePayload(reserves, direction, imbalance) {
  // price_procured_reserves: Lithuania's five columns, base offset resolved from
  // the payload's own header_groups (Phase 36.C) rather than hardcoded at 10.
  // Column order within a country group is stable: FCR sym, aFRR ↑, aFRR ↓,
  // mFRR ↑, mFRR ↓.
  const lt           = s2ResolveCountryBase(reserves, 'Lithuania');
  const fcrVals      = s2ExtractIdx(reserves, lt + 0);  // FCR Symmetric
  const afrrUpVals   = s2ExtractIdx(reserves, lt + 1);  // aFRR Upward
  const afrrDownVals = s2ExtractIdx(reserves, lt + 2);  // aFRR Downward
  const mfrrUpVals   = s2ExtractIdx(reserves, lt + 3);  // mFRR Upward
  const mfrrDownVals = s2ExtractIdx(reserves, lt + 4);  // mFRR Downward

  // direction_of_balancing_v2: try timeseries first, then pattern fallback
  let dirVals = [];
  if (direction?.data?.timeseries) {
    // direction timeseries values[0] is typically Lithuania
    dirVals = s2ExtractIdx(direction, 0);
    if (!dirVals.length) dirVals = s2ExtractIdx(direction, 1);
  }
  if (!dirVals.length) dirVals = s2ExtractCol(direction, 'lithuania');
  if (!dirVals.length) dirVals = s2ExtractCol(direction, 'lt');

  // imbalance_prices: try timeseries first, then pattern fallback
  let imbVals = [];
  if (imbalance?.data?.timeseries) {
    // Preliminary column — typically index 0 or 1 for Lithuania
    imbVals = s2ExtractIdx(imbalance, 0);
    if (!imbVals.length) imbVals = s2ExtractIdx(imbalance, 1);
  }
  if (!imbVals.length) imbVals = s2ExtractCol(imbalance, 'preliminary');
  if (!imbVals.length) imbVals = s2ExtractCol(imbalance, 'lithuania');

  const fcr_avg       = s2r2(s2Mean(fcrVals));
  const afrr_up_avg   = s2r2(s2Mean(afrrUpVals));
  const afrr_down_avg = s2r2(s2Mean(afrrDownVals));
  const mfrr_up_avg   = s2r2(s2Mean(mfrrUpVals));
  const mfrr_down_avg = s2r2(s2Mean(mfrrDownVals));
  const pct_up        = dirVals.length ? s2r2(dirVals.filter(v => v > 0).length / dirVals.length * 100) : null;
  const pct_down      = dirVals.length ? s2r2(dirVals.filter(v => v < 0).length / dirVals.length * 100) : null;
  const imbalance_mean = s2r2(s2Mean(imbVals));
  const imbalance_p90  = s2r2(s2P90(imbVals));
  const pct_above_100  = imbVals.length ? s2r2(imbVals.filter(v => v > 100).length / imbVals.length * 100) : null;

  // Signal classification removed — phase comes from processFleet via fleet merge

  // CVI — Capacity Value Index (per MW of installed battery power, 0.5 MW service each)
  // Baltic prequalification: 2 MW power per 1 MW service → 0.5 MW per MW installed
  // These are THEORETICAL MAXIMUMS if fully allocated to each market — actual dispatch lower.
  const afrr_annual_per_mw_installed = afrr_up_avg !== null
    ? Math.round(afrr_up_avg * 8760 * 0.97 * 0.5)
    : null;
  const mfrr_annual_per_mw_installed = mfrr_up_avg !== null
    ? Math.round(mfrr_up_avg * 8760 * 0.97 * 0.5)
    : null;
  // Note: do NOT sum aFRR + mFRR — each MW is in ONE market per hour, not both simultaneously.
  // Keep cvi_afrr/cvi_mfrr as separate full-allocation theoretical refs (for LLM context).
  const cvi_afrr_eur_mw_yr = afrr_up_avg !== null
    ? Math.round(afrr_up_avg * 8760 * 0.97)
    : null;
  const cvi_mfrr_eur_mw_yr = mfrr_up_avg !== null
    ? Math.round(mfrr_up_avg * 8760 * 0.97)
    : null;

  return {
    timestamp:                  new Date().toISOString(),
    fcr_avg,
    afrr_up_avg,
    afrr_down_avg,
    mfrr_up_avg,
    mfrr_down_avg,
    pct_up,
    pct_down,
    imbalance_mean,
    imbalance_p90,
    pct_above_100,
    afrr_annual_per_mw_installed,
    mfrr_annual_per_mw_installed,
    cvi_afrr_eur_mw_yr,
    cvi_mfrr_eur_mw_yr,
    stress_index_p90:           imbalance_p90,
    source:          'baltic.transparency-dashboard.eu',
    // Last BTD delivery date these averages were computed from. Drives 36.C
    // admission control — see s2AdmitWrite. Wall-clock write time cannot serve
    // this role: BTD publishes with a ~2-day lag, so a payload written now may
    // describe data older than one written an hour ago.
    data_window_end: s2DataWindowEnd(reserves),
  };
}

// ─── Revenue Engine — JS mirror of app/lib/benchmarks.ts ──────────────────────
// Worker can't import TS modules directly — math duplicated here.

// RTE decay — calibration: NREL ATB + public manufacturer warranty data + Baltic
// field observation 2026. BOL per duration: 2h 0.82; 4h 0.83 (4h benefits from
// lower C-rate stress on the PCS). Decay 0.20 pp/yr; floor at -4pp from BOL.
// Canonical single source — mirrors app/lib/sohCurves.ts RTE_BOL (asserted by
// app/lib/__tests__/rteMirror.test.ts). Every RTE consumer reads from here.
const RTE_BOL = { h2: 0.82, h4: 0.83 };
const RTE_DECAY_PP_PER_YEAR = 0.0020;
const RTE_FLOOR_DROP = 0.04;

// ── Duration-anchor interpolation policy — Phase 36.B5 ──────────────────────
//
// The engine is calibrated at exactly TWO durations, 2h and 4h. Everything
// duration-dependent — round-trip efficiency, day-ahead throughput, observed
// capture, the LCOS charge price, the SOH cycling intensity — has a value at
// each anchor and nothing in between.
//
// Before this policy every site invented its own branch, and they did not
// agree. Twelve sites read `dur_h <= 2 ? …2h : …4h`, while `rteCurveFor` read
// `dur_h >= 3 ? h4 : h2`. At dur_h = 2.5 that produced a **2h round-trip
// efficiency on 4h day-ahead throughput** — two different calibrations inside
// one run, which is the contradictory-branch failure bankability test #5 exists
// to catch (batch-35 finding, arc 36.B5).
//
// ONE policy replaces all of them: linear in dur_h between the anchors, clamped
// outside [2h, 4h]. Two properties make it safe to adopt everywhere:
//
//   ON-ANCHOR IDENTITY  at dur_h ≤ 2 the weight is exactly 0 and the 2h value is
//                       RETURNED, not recomputed; at dur_h ≥ 4 likewise for 4h.
//                       No float arithmetic touches an anchor, so /revenue —
//                       which serves 2h and 4h only — is byte-identical.
//   NO MIXED ANCHORS    every duration-dependent quantity moves on the SAME
//                       weight, so RTE and throughput can never again come from
//                       different calibrations.
//
// Outside [2, 4] the policy clamps rather than extrapolating. A 1h or an 8h
// asset is outside the calibration and the honest answer is the nearest anchor's
// value, not a linear guess about physics nobody measured. That is a documented
// flat region, not a discontinuity.
function durAnchorWeight(dur_h) {
  const d = Number.isFinite(dur_h) ? dur_h : 4;
  return Math.min(1, Math.max(0, (d - 2) / 2));
}

/** Blend a 2h-anchored value and a 4h-anchored value under the one policy. */
function durBlend(dur_h, at2h, at4h) {
  if (at2h == null) return at4h;
  if (at4h == null) return at2h;
  const w = durAnchorWeight(dur_h);
  if (w === 0) return at2h;   // on-anchor: return, never recompute
  if (w === 1) return at4h;
  return at2h + w * (at4h - at2h);
}

/** Beginning-of-life round-trip efficiency for any duration. */
function rteBolFor(dur_h) {
  return durBlend(dur_h, RTE_BOL.h2, RTE_BOL.h4);
}

const BESS_WORKER = {
  // Q1 2026: (83+28)€/kWh × duration_MWh/MW × 1000 + 35k€/MW fixed
  capex_per_mw: { h2: 257, h4: 479 }, // €k/MW (Q1 2026: equipment €83/kWh + EPC €28/kWh + HV €35k/MW)
  opex_pct_capex: 0.025,
  aggregator_pct_revenue: 0.08,
  availability: 0.97,
  roundtrip_efficiency: RTE_BOL.h2, // canonical RTE_BOL (duration-agnostic constant → h2)
  cycles_per_day: 1,  // 1 DA arbitrage cycle per day (model note: aFRR/mFRR + 1 DA cycle)
  // 2h system is SoC-constrained for sustained balancing activation windows
  // 4h system can sustain full aFRR/mFRR window → full 0.5 MW allocation
  capacity_allocation: {
    h2: { afrr: 0.628, mfrr: 0.778 },  // ~0.314 MW aFRR, ~0.389 MW mFRR per MW installed
    h4: { afrr: 1.0,   mfrr: 1.0   },  // full 0.5 MW per MW installed
  },
  project_life_years: 18,
  ch_irr_central: { h2: 16.6, h4: 10.8 },
  ch_irr_low:     { h2: 6,    h4: 6 },
  ch_irr_high:    { h2: 31,   h4: 20 },
  revenue_peak_note: 'aFRR/mFRR cannibalization begins 2029',
  markets: [
    { country: 'Lithuania',    flag: '🇱🇹', afrr_up_eur_mwh: null, mfrr_up_eur_mwh: null, da_spread_eur_mwh: null, capex_per_mw: 257, irr_central_pct: null, note: 'Post-sync anomaly — peak window 2025-28' },
    { country: 'Great Britain', flag: '🇬🇧', afrr_up_eur_mwh: 14,   mfrr_up_eur_mwh: 10,   da_spread_eur_mwh: 55,  capex_per_mw: 580, irr_central_pct: 12,   note: 'Mature, BM + FFR products' },
    { country: 'Ireland',       flag: '🇮🇪', afrr_up_eur_mwh: 18,   mfrr_up_eur_mwh: 14,   da_spread_eur_mwh: 48,  capex_per_mw: 560, irr_central_pct: 13,   note: 'DS3 + I-SEM, strong frequency market' },
    { country: 'Italy',         flag: '🇮🇹', afrr_up_eur_mwh: 11,   mfrr_up_eur_mwh: 9,    da_spread_eur_mwh: 42,  capex_per_mw: 540, irr_central_pct: 10,   note: 'MSD balancing market' },
    { country: 'Germany',       flag: '🇩🇪', afrr_up_eur_mwh: 8,    mfrr_up_eur_mwh: 7,    da_spread_eur_mwh: 38,  capex_per_mw: 530, irr_central_pct: 8,    note: 'FCR saturated, aFRR compressing' },
    { country: 'Belgium',       flag: '🇧🇪', afrr_up_eur_mwh: 7,    mfrr_up_eur_mwh: 6,    da_spread_eur_mwh: 35,  capex_per_mw: 540, irr_central_pct: 7,    note: 'CRM capacity market support' },
  ],
};

// Empirical SOH fade — three rate-tagged curves at 1.0 / 1.5 / 2.0 c/d test
// rates. Calibration: NREL ATB + public manufacturer warranty data + Baltic
// field observation 2026 (25°C, 0.5P reference). Convex-down (LFP).
const SOH_CURVE_1CD = [
  1.000, 0.967, 0.935, 0.908, 0.882,  // Y0–Y4
  0.855, 0.830, 0.806, 0.785, 0.764,  // Y5–Y9
  0.745, 0.728, 0.713, 0.700, 0.689,  // Y10–Y14
  0.679, 0.671, 0.665,                 // Y15–Y17
];
const SOH_CURVE_15CD = [
  1.000, 0.955, 0.915, 0.880, 0.852,
  0.830, 0.805, 0.780, 0.758, 0.738,
  0.720, 0.703, 0.687, 0.671, 0.658,
  0.645, 0.632, 0.620,
];
const SOH_CURVE_2CD = [
  1.000, 0.945, 0.900, 0.864, 0.830,
  0.810, 0.785, 0.760, 0.738, 0.717,
  0.700, 0.682, 0.665, 0.648, 0.632,
  0.617, 0.602, 0.588,
];

// Interpolate SOH curve by computed actual cycling rate.
// Above 2 c/d: linearly extrapolate from 1.5→2 slope (manufacturers don't certify above 2).
// Below 1 c/d: clamp at 1 c/d (manufacturers don't characterize slower than 1).
// Floor at 0.40 to keep the engine from going negative on aggressive extrapolation.
function sohYr(t, cd_total) {
  const tIdx = Math.max(0, Math.min(t, SOH_CURVE_1CD.length - 1));
  const cd = Math.max(cd_total ?? 1.0, 1.0);
  if (cd <= 1.5) {
    const f = (cd - 1.0) / 0.5;
    return SOH_CURVE_1CD[tIdx] * (1 - f) + SOH_CURVE_15CD[tIdx] * f;
  }
  if (cd <= 2.0) {
    const f = (cd - 1.5) / 0.5;
    return SOH_CURVE_15CD[tIdx] * (1 - f) + SOH_CURVE_2CD[tIdx] * f;
  }
  const slope = SOH_CURVE_2CD[tIdx] - SOH_CURVE_15CD[tIdx];
  return Math.max(0.40, SOH_CURVE_2CD[tIdx] + slope * ((cd - 2.0) / 0.5));
}

// `decay` (Phase 35.1) is the sensitivity runner's RTE-decay driver, as a
// fraction per year. It defaults to the shipped constant, so every other caller
// is unchanged.
function rteCurveFor(dur_h, lifetime_yrs, decay) {
  const yrs = lifetime_yrs ?? 18;
  const d = decay ?? RTE_DECAY_PP_PER_YEAR;
  const bol = rteBolFor(dur_h ?? 4);
  return Array.from({ length: yrs }, (_, t) =>
    Math.round(Math.max(bol - d * t, bol - RTE_FLOOR_DROP) * 10000) / 10000
  );
}

// Market saturation — CH S1 2025 central scenario (steep aFRR compression)
const MARKET_DECAY_W = [
  { capacity: 1.00, trading: 1.00 },
  { capacity: 0.52, trading: 0.95 },
  { capacity: 0.30, trading: 0.90 },
  { capacity: 0.20, trading: 0.88 },
  { capacity: 0.17, trading: 0.85 },
  { capacity: 0.14, trading: 0.83 },
  { capacity: 0.13, trading: 0.82 },
  { capacity: 0.12, trading: 0.80 },
];
function marketDecayW(t) {
  return MARKET_DECAY_W[Math.min(t - 1, MARKET_DECAY_W.length - 1)];
}
const CAPACITY_FRACTION_W = 0.65;
const TRADING_FRACTION_W  = 0.35;

function computeRevenueWorker(prices, duration_h) {
  const B = BESS_WORKER;
  const key = `h${duration_h}`;
  const capex = B.capex_per_mw[key] * 1000; // €/MW

  // Baltic prequalification: 2 MW power per 1 MW service (binding = power constraint)
  // 4h: full 0.5 MW per MW installed; 2h: SoC-constrained to shorter sustained windows
  const alloc = B.capacity_allocation[key];
  const afrr_mw_provided = 0.5 * alloc.afrr;
  const mfrr_mw_provided = 0.5 * alloc.mfrr;

  const afrr_annual  = prices.afrr_up_avg * 8760 * B.availability * afrr_mw_provided;
  const mfrr_annual  = prices.mfrr_up_avg * 8760 * B.availability * mfrr_mw_provided;

  // Trading: 4h stores more energy → larger daily throughput
  // Unit: €/MWh × MWh/MW × cycles/day × days/yr = €/MW/yr ✓
  const capture_factor      = 0.35;
  const duration_mwh_per_mw = duration_h;  // 2h → 2 MWh/MW; 4h → 4 MWh/MW
  const trading_swing       = prices.lt_daily_swing_eur_mwh ?? prices.spread_eur_mwh;
  const trading_annual      = trading_swing * capture_factor * B.cycles_per_day * 365 * duration_mwh_per_mw * B.roundtrip_efficiency;

  const gross_annual = afrr_annual + mfrr_annual + trading_annual;

  const opex_fixed      = capex       * B.opex_pct_capex;
  const opex_aggregator = gross_annual * B.aggregator_pct_revenue;
  const opex_total      = opex_fixed + opex_aggregator;
  const net_annual      = gross_annual - opex_total;
  const payback         = net_annual > 0 ? capex / net_annual : Infinity;

  // IRR via NPV=0 binary search (18yr life, CH central scenario decay).
  // SOH interpolated by computed actual c/d (not duration label) — pull a
  // representative dispatch intensity for each duration: 2h → ~1.3 c/d
  // (active merchant), 4h → ~1.0 c/d (gentler cycling). Connects cell
  // aging to operation rather than treating all dispatch identically.
  const cd_for_soh = durBlend(duration_h, 1.3, 1.0);
  // Phase 49 item 2, solver 3 of 3. This one bisected [0, 5.0] and returned `lo`,
  // so a market whose IRR is NEGATIVE came back as exactly 0 % — a bound reported
  // as a rate — and anything above 500 % came back as 500. Same shape as the two
  // above, in the surface that ranks Lithuania against seven other markets.
  //
  // Rebuilt as the cash-flow stream the NPV expression already implies, then
  // handed to the single solver. `irr` stays a percentage; null propagates as
  // null rather than collapsing to zero.
  const cf = [-capex];
  for (let t = 1; t <= B.project_life_years; t++) {
    const soh = sohYr(Math.min(t - 1, SOH_CURVE_1CD.length - 1), cd_for_soh);
    const mkt = marketDecayW(t);
    cf.push(net_annual * (
      CAPACITY_FRACTION_W * mkt.capacity +
      TRADING_FRACTION_W * mkt.trading * soh
    ));
  }
  const solved = solveIRR(cf);
  const irr = solved.value === null ? null : solved.value * 100;

  const ch_central = B.ch_irr_central[key];
  const ch_low     = B.ch_irr_low[key];
  const ch_high    = B.ch_irr_high[key];
  const irr_vs_ch  = irr === null ? 'not comparable with'
                   : irr > ch_central * 1.1 ? 'above'
                   : irr < ch_central * 0.9 ? 'below'
                   : 'within range of';

  return {
    afrr_annual_per_mw:    Math.round(afrr_annual),
    mfrr_annual_per_mw:    Math.round(mfrr_annual),
    trading_annual_per_mw: Math.round(trading_annual),
    gross_annual_per_mw:   Math.round(gross_annual),
    opex_annual_per_mw:    Math.round(opex_total),
    net_annual_per_mw:     Math.round(net_annual),
    capex_per_mw:          Math.round(capex),
    simple_payback_years:  Math.round(payback * 10) / 10,
    irr_approx_pct:        irr === null ? null : Math.round(irr * 10) / 10,
    irr_vs_ch_central:     irr_vs_ch,
    ch_irr_central:        ch_central,
    ch_irr_range:          `${ch_low}%–${ch_high}%`,
    market_window_note:    B.revenue_peak_note,
  };
}

function computeMarketComparisonWorker(liveLT) {
  return BESS_WORKER.markets
    .map((m) => {
      const prices = {
        afrr_up_avg:    m.afrr_up_eur_mwh   ?? liveLT.afrr_up_avg,
        mfrr_up_avg:    m.mfrr_up_eur_mwh   ?? liveLT.mfrr_up_avg,
        spread_eur_mwh: m.da_spread_eur_mwh ?? liveLT.spread_eur_mwh,
        euribor_3m:     liveLT.euribor_3m,
      };
      const rev = computeRevenueWorker(prices, 2);
      return {
        country:           m.country,
        flag:              m.flag,
        irr_pct:           m.irr_central_pct ?? rev.irr_approx_pct,
        net_annual_per_mw: rev.net_annual_per_mw,
        capex_per_mw:      m.capex_per_mw * 1000,
        note:              m.note,
        is_live:           m.afrr_up_eur_mwh === null,
      };
    })
    // Null sorts last rather than poisoning the comparator: `null - n` is NaN,
    // and a NaN comparator leaves the array in an arbitrary order that looks
    // like a ranking (Phase 49 item 2 — a plausible output, not an error).
    .sort((a, b) => (b.irr_pct ?? -Infinity) - (a.irr_pct ?? -Infinity));
}

async function computeInterpretations(signals, revenue, anthropicKey) {
  if (!anthropicKey) return null;
  const { s1, s2, s3, s4 } = signals;
  const { h2, h4 } = revenue;

  // Data completeness check — determines stale-feed warning injection
  const data_completeness = {
    s1: s1?.state != null && !s1?.unavailable,
    s2: s2?.signal != null && s2?.fcr_avg != null && !s2?.unavailable,
    s3: !s3?.unavailable && s3?.lithium_eur_t != null,
    s4: s4?.signal != null && s4?.free_mw != null,
  };
  const all_feeds_live = Object.values(data_completeness).every(Boolean);
  const stale_warning = all_feeds_live
    ? ''
    : `\nFEED WARNING: Some data feeds are stale or unavailable (${
        Object.entries(data_completeness).filter(([, v]) => !v).map(([k]) => k.toUpperCase()).join(', ')
      }) — flag this explicitly in your response for the affected signals.\n`;

  const s4_warning = s4?.parse_warning ? `\n  Parse warning: ${s4.parse_warning}` : '';

  const SYSTEM = `You write for a BESS developer who built this console himself. He knows the market.

RULES — every output must follow all of these:
1. Two sentences per signal. Hard limit.
2. Max 15 words per sentence.
3. Sentence 1: state the number in plain terms.
4. Sentence 2: state what does NOT change because of it.
5. No hedging: never use may, could, suggests, indicates, appears, seems, potentially, worth noting.
6. No sign-off phrases.

GOOD examples:
  "Small spread today. Coupling day — irrelevant until NTC tightens."
  "aFRR still 3× the CH 2027 forecast. Window open, compressing by quarter."
  "Equipment cheaper than last quarter. Installed cost: BOS and grid still dominate."
  "Free MW is fine. Fight is node approval queue, not raw capacity."

BAD (never write like this):
  "Partial separation forming. Consider checking NordBalt capacity before committing."
  "Upstream costs suggest improving capex window."`;

  const stale_signals = Object.entries(data_completeness).filter(([, v]) => !v).map(([k]) => k.toUpperCase());
  const stale_note = stale_signals.length
    ? `\nNOTE: ${stale_signals.join(', ')} data is stale. For each stale signal write exactly: "No fresh data."\n`
    : '';

  const pack = JSON.stringify({
    s1: {
      spread_eur:   s1?.spread_eur_mwh    ?? null,
      swing_eur:    s1?.lt_daily_swing_eur_mwh ?? null,
      vs_median:    s1?.spread_stats_90d?.p50  ?? null,
      stale:        !!s1?._stale,
    },
    s2: {
      afrr_eur_mwh: s2?.afrr_up_avg  ?? null,
      mfrr_eur_mwh: s2?.mfrr_up_avg  ?? null,
      ch_2027_afrr: 20,
      stale:        !!s2?._stale,
    },
    s3: {
      equip_eur_kwh: s3?.europe_system_eur_kwh ?? null,
      euribor_pct:   s3?.euribor_3m           ?? null,
      stale:         !!s3?._stale,
    },
    s4: {
      free_mw:        s4?.free_mw       ?? null,
      pipeline_clean: !s4?.parse_warning,
      stale:          !!s4?._stale,
    },
  });

  const prompt = `${SYSTEM}${stale_note}

Data (${new Date().toISOString().slice(0, 10)}):
${pack}

Return ONLY a JSON object — 1–2 sentences per key, no markdown:
{
  "s1": "...",
  "s2": "...",
  "s3": "...",
  "s4": "...",
  "combined": "..."
}`;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { console.error(`[Interpretations] Anthropic HTTP ${res.status}`); return null; }
    const data  = await res.json();
    const text  = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const sentences = JSON.parse(match[0]);
    return { ...sentences, generated_at: new Date().toISOString(), data_completeness, all_feeds_live };
  } catch (err) {
    console.error('[Interpretations] failed:', String(err));
    return null;
  }
}

// ─── Daily digest ─────────────────────────────────────────────────────────────

async function sendDailyDigest(env) {
  const lines = [];
  const date = new Date().toISOString().split('T')[0];
  lines.push(`KKME · ${date}`);

  const signalThresholds = { s1: 36, s2: 48, s3: 720, s4: 6 };
  const issues = [];
  for (const [key, threshold] of Object.entries(signalThresholds)) {
    const raw = await env.KKME_SIGNALS.get(key).catch(() => null);
    if (!raw) { issues.push(`🔴 ${key.toUpperCase()}: no data`); continue; }
    try {
      const d  = JSON.parse(raw);
      const ts = d.timestamp ?? d._meta?.written_at ?? d.updated_at;
      if (!ts) continue;
      const age = (Date.now() - new Date(ts).getTime()) / 3600000;
      if (age > threshold * 1.5) issues.push(`⚠️ ${key.toUpperCase()}: ${age.toFixed(0)}h old`);
    } catch { issues.push(`⚠️ ${key.toUpperCase()}: parse error`); }
  }
  if (issues.length) lines.push(...issues);

  const s4 = await env.KKME_SIGNALS.get('s4').then(r => r ? JSON.parse(r) : null).catch(() => null);
  if (s4?.parse_warning) lines.push('📋 S4 pipeline: needs BESS filter verify');

  // S4 pipeline (VERT.lt monthly — still local, flag if very stale)
  const s4pipeline = await env.KKME_SIGNALS.get('s4_pipeline').then(r => r ? JSON.parse(r) : null).catch(() => null);
  const pipeTs = s4pipeline?.timestamp;
  const pipeAge = pipeTs ? (Date.now() - new Date(pipeTs).getTime()) / 3600000 : null;
  if (!pipeAge || pipeAge > 840) lines.push(`⚠️ S4 pipeline: ${pipeAge?.toFixed(0) ?? 'never'}h old (monthly VERT.lt — run fetch-vert.js)`);

  // S2 activation freshness watchdog
  const actRaw = await env.KKME_SIGNALS.get('s2_activation').catch(() => null);
  if (actRaw) {
    try {
      const act = JSON.parse(actRaw);
      const storedAt = new Date(act.stored_at);
      const ageDays = (Date.now() - storedAt.getTime()) / 86400000;
      if (ageDays > 3) issues.push(`⚠️ S2 activation: ${Math.floor(ageDays)}d old (stored ${act.stored_at?.slice(0, 10)})`);
    } catch { /* ignore */ }
  } else {
    issues.push('🔴 S2 activation: no data');
  }

  const idx = await env.KKME_SIGNALS.get('feed_index').then(r => r ? JSON.parse(r) : []).catch(() => []);
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newItems = idx.filter(i => i.added_at?.startsWith(yesterday));
  if (newItems.length > 0) lines.push(`📰 Feed: +${newItems.length} item${newItems.length > 1 ? 's' : ''} added`);

  // ── Phase 39.2 — the alerter's heartbeat rides the digest (B8) ────────────
  //
  // "If the alerter stops sending, what tells us?" A dead alerter cannot report
  // its own death — but this digest goes out on a fixed daily cadence on the
  // SAME channel, so if the operator stops receiving it, the channel is the
  // thing that is broken. What the digest adds is the positive statement:
  // it names the currently-degraded surfaces, so a quiet channel and a healthy
  // system are told apart by a message that arrived saying "nothing degraded"
  // rather than by no message at all.
  //
  // Every value below is COMPUTED from the two stamps (rule #2). None of it is
  // a pre-written reassurance that could outlive its premise.
  try {
    const alertRaw = await env.KKME_SIGNALS.get('alert_state').catch(() => null);
    const state = alertRaw ? JSON.parse(alertRaw) : {};
    const degraded = Object.entries(state).filter(([, s]) => s?.state === 'degraded');
    if (degraded.length) {
      lines.push(`🔴 Degraded surfaces (${degraded.length}):`);
      for (const [surface, s] of degraded) {
        lines.push(`  • ${surface} — ${s.consecutive ?? 0}× since ${s.first_failure_at?.slice(0, 16) ?? '?'}`);
      }
    } else if (Object.keys(state).length) {
      lines.push(`🟢 Alerting: ${Object.keys(state).length} surface(s) tracked, none degraded`);
    }

    const healthRaw = await env.KKME_SIGNALS.get('alerter_health').catch(() => null);
    if (healthRaw) {
      const h = JSON.parse(healthRaw);
      if ((h.consecutive_send_failures ?? 0) > 0) {
        lines.push(`⚠️ Alerter: ${h.consecutive_send_failures} consecutive send failure(s) — last error ${String(h.last_error).slice(0, 120)}`);
      }
    } else {
      lines.push('⚠️ Alerter: no send ever recorded — the alerting layer has not proven it can reach this channel');
    }
  } catch (e) {
    lines.push(`⚠️ Alerting self-check failed: ${String(e).slice(0, 120)}`);
  }

  const isMonday = new Date().getDay() === 1;
  if (lines.length > 1 || isMonday) {
    if (lines.length === 1) lines.push('All systems OK.');
    await notifyTelegram(env, lines.join('\n'));
  }
}

// ─── Telegram webhook helpers ─────────────────────────────────────────────────

function classifyTopic(text) {
  if (/bess|battery storage|energy storage|lfp|lithium iron|stationary/i.test(text)) return 'BESS';
  if (/data cent|dc power|hyperscal|coloc|megawatt campus/i.test(text)) return 'DC';
  if (/hydrogen|electroly|\bh2\b|fuel cell/i.test(text)) return 'HYDROGEN';
  if (/lithium|cell price|catl|byd|battery tech|chemistry/i.test(text)) return 'BATTERIES';
  if (/\bgrid\b|transmission|tso|ntc|interconnect|balancing/i.test(text)) return 'GRID';
  return 'TECHNOLOGY';
}

// ─── Known companies for entity extraction ─────────────────────────────────────

const KNOWN_COMPANIES = [
  'Ignitis', 'Litgrid', 'Amber Grid', 'ESO', 'Elering', 'AST', 'Augstsprieguma tīkls',
  'NordBalt', 'LitPol', 'ENGIE', 'Fortum', 'Vattenfall', 'Orsted', 'Ørsted',
  'Fluence', 'Tesla Megapack', 'CATL', 'BYD', 'Saft', 'Leclanché',
  'Nuvve', 'Wärtsilä', 'Aggreko', 'Eaton', 'ABB', 'Siemens Energy',
  'Equinor', 'RWE', 'E.ON', 'EDP', 'Iberdrola',
  'Google', 'Microsoft', 'Meta', 'Amazon AWS', 'Apple',
  'Digital Realty', 'Equinix', 'NTT', 'Hetzner', 'Data4',
  'Green Mountain', 'Kolos', 'Atria', 'Rail Baltica',
];

function extractCompanies(text) {
  const found = [];
  for (const co of KNOWN_COMPANIES) {
    if (new RegExp(co.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
      found.push(co);
    }
  }
  return [...new Set(found)];
}

// ─── Telegram session helpers ──────────────────────────────────────────────────

const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes
const SESSION_KEY = 'telegram_session';

async function openFeedSession(kv, chatId, firstMessage) {
  const session = {
    chatId,
    messages:   [firstMessage],
    companies:  extractCompanies(firstMessage),
    topic:      classifyTopic(firstMessage),
    opened_at:  new Date().toISOString(),
  };
  await kv.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return session;
}

async function appendToSession(kv, message) {
  const raw = await kv.get(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  const session = JSON.parse(raw);
  session.messages.push(message);
  // Re-classify topic from all messages combined
  const combined = session.messages.join(' ');
  session.topic   = classifyTopic(combined);
  // Merge new companies
  const newCos    = extractCompanies(message);
  session.companies = [...new Set([...session.companies, ...newCos])];
  await kv.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return session;
}

async function finalizeFeedSession(kv, env) {
  const raw = await kv.get(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  const session = JSON.parse(raw);
  await kv.delete(SESSION_KEY);

  const combined   = session.messages.join('\n\n');
  const urlMatch   = combined.match(/https?:\/\/[^\s]+/);
  const id         = makeId();
  const now        = new Date().toISOString();

  let title  = null;
  let source = null;
  if (urlMatch) {
    const pageUrl = urlMatch[0];
    title  = await fetchPageTitle(pageUrl);
    source = new URL(pageUrl).hostname.replace(/^www\./, '');
    if (!title) title = pageUrl.slice(0, 80);
  } else {
    title = combined.slice(0, 80);
  }

  const summary = await generateSummary(env, title + '\n' + combined.slice(0, 400));

  const item = {
    id,
    added_at:     now,
    topic:        session.topic,
    content_type: urlMatch ? 'url' : 'note',
    url:          urlMatch ? urlMatch[0] : null,
    raw_text:     combined.slice(0, 1000),
    title:        title ?? combined.slice(0, 60),
    source,
    summary,
    companies:    session.companies,
  };

  await saveFeedItem(kv, item);
  return item;
}

async function sendTelegramReply(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(e => console.error('[Telegram] reply error:', e));
}

async function fetchPageTitle(pageUrl) {
  try {
    const res  = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const html = await res.text();
    const m    = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  } catch { return null; }
}

async function saveFeedItem(kv, item) {
  await kv.put(`feed_${item.id}`, JSON.stringify(item));
  const rawIdx = await kv.get('feed_index').catch(() => null);
  let idx = rawIdx ? JSON.parse(rawIdx) : [];
  idx.unshift({ id: item.id, topic: item.topic, added_at: item.added_at, title: item.title, source: item.source, content_type: item.content_type, url: item.url ?? null, summary: item.summary ?? null });
  if (idx.length > 200) idx = idx.slice(0, 200);
  await kv.put('feed_index', JSON.stringify(idx));
}

async function generateSummary(env, text) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content: `Summarise in max 20 words, operator perspective, no hedging: ${text.slice(0, 800)}` }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text?.trim() ?? null;
  } catch { return null; }
}

// ─── Curation helpers ──────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Empirical Baltic mojibake bigrams (UTF-8 chars misdecoded as Win-1252/cp125x
// then re-encoded). Bare /Ä/ and /Å/ would false-positive on legitimate
// Estonian (Tähtsamad, Käiku) and Swedish/Finnish content.
const MOJIBAKE_PATTERNS = [
  /Ä„/,   // ą / Ą
  /Ä…/,   // ą (Win-1252 path)
  /Ä—/,   // ė / Ė (Win-1252 path)
  /ÄŠ/,   // ė / Ė (observed in production curation)
  /Ä™/,   // ę
  /Ä¯/,   // į
  /Å¡/,   // š
  /Å¾/,   // ž
  /Å³/,   // ų
  /Å«/,   // ū
];

function detectMojibake(s) {
  if (typeof s !== 'string') return null;
  for (const pattern of MOJIBAKE_PATTERNS) {
    if (pattern.test(s)) return pattern.source;
  }
  return null;
}

function validateCurationContent(body) {
  const titleMojibake = detectMojibake(body.title);
  if (titleMojibake) {
    return {
      valid: false,
      field: 'title',
      pattern: titleMojibake,
      message: 'Title contains mojibake (cp1257-misdecoded-UTF-8). Re-paste from a UTF-8 source.',
    };
  }
  const rawMojibake = detectMojibake(body.raw_text);
  if (rawMojibake) {
    return {
      valid: false,
      field: 'raw_text',
      pattern: rawMojibake,
      message: 'raw_text contains mojibake (cp1257-misdecoded-UTF-8). Re-paste from a UTF-8 source.',
    };
  }
  return { valid: true };
}

// Phase 4G.2 — Baltic legal-entity prefix detection.
// `u` flag + \p{Lu}/\p{L} so detected_entity captures the full name through
// Baltic diacritics (e.g. "UAB Saulėtas Pasaulis", not truncated "UAB Saul").
// AS and AKA intentionally omitted: AS sentence-start ("As Latvia…") false-positives,
// AKA is not a Latvian commercial entity form. Stricter AS matcher = 4G.3 candidate.
const ENTITY_PATTERNS = [
  /\b(?:UAB|AB|MB|VšĮ|SIA|OÜ|MTÜ)\s+\p{Lu}[\p{L}\d-]*(?:\s+\p{Lu}[\p{L}\d-]*)*/u,
];

// Suffix-matched: host === d OR host.endsWith('.' + d). Covers subdomains like
// e-services.registrucentras.lt, apva.lrv.lt without per-subdomain entries.
const AUTHORITATIVE_SOURCES = [
  // Commercial registries (canonical per discipline rule #3)
  'registrucentras.lt', 'lursoft.lv', 'inforegister.ee',
  // Regulators
  'nra.lt', 'sprk.gov.lv', 'konkurentsiamet.ee', 'vert.lt',
  // TSOs / market operators
  'litgrid.eu', 'ast.lv', 'elering.ee', 'nordpoolgroup.com',
  // EU bodies
  'acer.europa.eu', 'entsoe.eu',
  // Government roots (suffix covers ministries: am.lrv.lt, apva.lrv.lt, …)
  'lrv.lt', 'gov.lv', 'valitsus.ee', 'eesti.ee',
  // Baltic tier-1 press
  'lrt.lt', '15min.lt', 'delfi.lt', 'delfi.lv', 'delfi.ee',
  'lsm.lv', 'err.ee', 'bnn-news.com', 'baltictimes.com',
];

function detectEntity(text) {
  if (typeof text !== 'string') return null;
  for (const p of ENTITY_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function isAuthoritativeSource(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AUTHORITATIVE_SOURCES.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

function extractHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function validateCurationEntity(body) {
  const entity = detectEntity(body.title) || detectEntity(body.raw_text);
  if (!entity) return null;
  if (isAuthoritativeSource(body.source_url)) return null;
  return {
    error: 'entity_verification_failed',
    field: 'source_url',
    detected_entity: entity,
    source_host: extractHost(body.source_url || ''),
    message: 'Named-entity claim requires source URL from a commercial registry (registrucentras.lt / lursoft.lv / inforegister.ee), regulator (NRA / SPRK / Konkurentsiamet / VERT / TSO), EU body (ACER / ENTSO-E), Baltic government root (lrv.lt / gov.lv / valitsus.ee), or tier-1 Baltic press (LRT / LSM / ERR / Delfi / 15min / BNN / Baltic Times). Re-paste with a verifiable source URL.',
  };
}

async function readIndex(kv) {
  const raw = await kv.get(KV_CURATIONS_INDEX);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function writeIndex(kv, ids) {
  await kv.put(KV_CURATIONS_INDEX, JSON.stringify(ids));
}

async function recentCurations(kv) {
  const ids    = await readIndex(kv);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entries = [];
  for (const id of ids) {
    const raw = await kv.get(`${KV_CURATION_PREFIX}${id}`);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (new Date(entry.created_at).getTime() >= cutoff) entries.push(entry);
    } catch { /* skip */ }
  }
  return entries;
}

async function storeCurationEntry(kv, entry) {
  await kv.put(`${KV_CURATION_PREFIX}${entry.id}`, JSON.stringify(entry), {
    expirationTtl: 30 * 24 * 60 * 60,
  });
  const ids = await readIndex(kv);
  ids.push(entry.id);
  await writeIndex(kv, ids);
  await kv.delete(KV_DIGEST_CACHE);
}

// ─── Curation → feed item projection ───────────────────────────────────────────
// Mirrors app/lib/sourceClassify.ts so /feed can surface classified curations
// without requiring backfill or a frontend change.

const FEED_PRIMARY_DOMAINS = [
  'litgrid.eu', 'ast.lv', 'elering.ee', 'entsoe.eu', 'acer.europa.eu',
  'ec.europa.eu', 'europa.eu', 'lrv.lt', 'vert.lt', 'apva.lrv.lt',
  'nordpoolgroup.com', 'ena.lt', 'aib-net.org',
];
const FEED_TRADE_PRESS_HINTS = [
  'montel', 'argusmedia', 'spglobal', 'reuters', 'bloomberg', 'ft.com',
  'energy-storage.news', 'pv-magazine', 'reneweconomy', 'offshorewind.biz',
  'energymonitor', 'rechargenews', 'windpowermonthly', 'bnef', 'mckinsey.com',
];

// ─── Phase 4F: BESS quality gates (mirrored from app/lib/feedSourceQuality.ts) ──
// First-deployment of the gate Phase 4B-5 wrote but never merged (see
// docs/investigations/phase-4f-intel-feed-regression.md). Three layers of
// filtering are applied at projection time AND at read time:
//   1. FEED_SOURCE_DENYLIST       — hard-deny social/blog/academic noise
//   2. tier-keyed topic threshold — tier1 auto-pass, tier2 ≥1, outside ≥2
//   3. soft-delete on rejection   — items appended with status='rejected' so
//                                   /feed/rejections can audit; /feed reads
//                                   filter status==='published' only

const FEED_SOURCE_DENYLIST = new Set([
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'reddit.com', 'quora.com',
  'medium.com', 'wordpress.com', 'blogspot.com', 'substack.com',
  'researchgate.net', 'academia.edu',
]);

const FEED_SOURCE_TSO_REGULATOR = new Set([
  'litgrid.lt', 'litgrid.eu', 'ast.lv', 'elering.ee', 'entsoe.eu',
  'apva.lt', 'apva.lrv.lt', 'vert.lt', 'am.lrv.lt', 'rrt.lt', 'em.gov.lv',
  'ec.europa.eu', 'acer.europa.eu',
]);

const FEED_SOURCE_TRADE_PRESS = new Set([
  'nordpoolgroup.com', 'montelnews.com', 'energy-storage.news',
  'pv-magazine.com', 'reuters.com', 'bloomberg.com',
  's-and-p.com', 'spglobal.com',
]);

const BESS_TOPIC_KEYWORDS = [
  'bess', 'battery storage', 'energy storage', 'akumuliator', 'akumuliuoja',
  'kaupimo paj', 'storage capacity',
  'balancing', 'afrr', 'mfrr', 'fcr', 'frr', 'reserve', 'rezerv',
  'capacity market', 'capacity mechanism', 'cmu', 'capacity remunerat',
  'lithuani', 'latvi', 'estoni', 'lietuv', 'baltic', 'baltij',
  'litgrid', 'apva', 'vert', 'nordpool', 'nord pool', 'ast.lv', 'elering',
  'entso', 'entso-e', 'entsoe',
  'intention protocol', 'pajėgumai',
  'transformer', 'substation', 'pcs', 'inverter',
  'energy bill', 'energy policy', 'renewables target', 'grid code',
];

const BALTIC_CONTEXT_KEYWORDS = [
  'lithuani', 'latvi', 'estoni', 'lietuv', 'baltic', 'baltij',
  'litgrid', 'apva', 'vert', 'ast.lv', 'elering',
];

function feedExtractDomain(urlOrSource) {
  if (!urlOrSource) return '';
  const s = String(urlOrSource).toLowerCase().trim();
  const u = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return u.split('/')[0].split('?')[0];
}

function feedDomainMatches(domain, target) {
  if (!domain) return false;
  return domain === target || domain.endsWith('.' + target);
}

function isDeniedFeedSource(source, url) {
  const sourceDomain = feedExtractDomain(source);
  const urlDomain = feedExtractDomain(url);
  for (const blocked of FEED_SOURCE_DENYLIST) {
    if (feedDomainMatches(sourceDomain, blocked)) return blocked;
    if (feedDomainMatches(urlDomain, blocked)) return blocked;
  }
  if (feedDomainMatches(urlDomain, 'linkedin.com')) {
    const path = String(url || '').toLowerCase();
    if (path.includes('/posts/')) return 'linkedin/posts';
    if (path.includes('/pulse/')) return 'linkedin/pulse';
  }
  return null;
}

function isAllowedFeedSource(source, url) {
  return isDeniedFeedSource(source, url) === null;
}

function feedSourceTier(source, url) {
  const sourceDomain = feedExtractDomain(source);
  const urlDomain = feedExtractDomain(url);
  for (const d of FEED_SOURCE_TSO_REGULATOR) {
    if (feedDomainMatches(sourceDomain, d) || feedDomainMatches(urlDomain, d)) return 'tier1';
  }
  for (const d of FEED_SOURCE_TRADE_PRESS) {
    if (feedDomainMatches(sourceDomain, d) || feedDomainMatches(urlDomain, d)) return 'tier2';
  }
  const nameLc = (source || '').toLowerCase();
  if (['litgrid', 'ast.lv', 'elering', 'vert', 'apva', 'entso'].some(n => nameLc.includes(n))) {
    return 'tier1';
  }
  return 'outside';
}

function topicThresholdForTier(tier) {
  if (tier === 'tier1') return 0;
  if (tier === 'tier2') return 1;
  return 2;
}

function bessTopicScore(title, consequenceText) {
  const haystack = `${title || ''} ${(consequenceText || '').slice(0, 400)}`.toLowerCase();
  let score = 0;
  let baltic = false;
  for (const kw of BESS_TOPIC_KEYWORDS) {
    if (haystack.includes(kw)) {
      score++;
      if (BALTIC_CONTEXT_KEYWORDS.some(b => kw.includes(b))) baltic = true;
    }
  }
  if (baltic && /\b\d+\s*m?wh?\b/.test(haystack)) score++;
  return score;
}

function evaluateFeedItemGates(source, url, title, consequence) {
  const denied = isDeniedFeedSource(source, url);
  const tier = feedSourceTier(source, url);
  const score = bessTopicScore(title, consequence);
  if (denied) {
    return { ok: false, reason: `source_denylist:${denied}`, tier, score };
  }
  const threshold = topicThresholdForTier(tier);
  if (score < threshold) {
    return {
      ok: false,
      reason: `topic_below_threshold(tier=${tier},score=${score},threshold=${threshold})`,
      tier,
      score,
    };
  }
  return { ok: true, tier, score };
}
const FEED_TAG_CATEGORY = {
  BESS: 'project_stage',
  GRID: 'project_stage',
  REGULATORY: 'policy',
  RENEWABLES: 'project_stage',
  MARKET: 'market_design',
};

function feedDomainOf(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

function feedSourceQuality(source, url) {
  const domain = feedDomainOf(url);
  const nameLc = (source || '').toLowerCase();
  if (domain) {
    if (FEED_PRIMARY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return 'tso_regulator';
    if (FEED_TRADE_PRESS_HINTS.some(h => domain.includes(h))) return 'trade_press';
  }
  if (['litgrid', 'ast', 'elering', 'vert', 'apva', 'entso'].some(n => nameLc.includes(n))) return 'tso_regulator';
  return 'trade_press';
}

function curationCategory(tags) {
  if (!Array.isArray(tags)) return 'policy';
  for (const t of tags) {
    const mapped = FEED_TAG_CATEGORY[t];
    if (mapped) return mapped;
  }
  return 'policy';
}

function curationFeedScore(relevance) {
  const r = typeof relevance === 'number' && Number.isFinite(relevance) ? relevance : 60;
  return Math.min(1.0, 0.5 + 0.4 * (r / 100));
}

function projectCurationToFeedItem(entry) {
  const title = (entry.title || '').trim().replace(/^\[PDF\]\s*/i, '');
  // Hard-format rejection: items without a title or URL-shaped titles are
  // dropped entirely (no audit trail — they never had usable shape).
  if (!title || title.length < 15 || title.startsWith('http')) return null;
  const pubDate = entry.created_at || new Date().toISOString();
  const consequence = (entry.raw_text || title).slice(0, 240);
  // Phase 4F: soft-delete on quality-gate fail. Item is still appended to
  // feed_index so /feed/rejections can audit the rejection reason and
  // operator can tune the keyword set / domain lists. Read-time path filters
  // to status==='published' so rejected items never reach the homepage.
  const gate = evaluateFeedItemGates(entry.source, entry.url, title, entry.raw_text);
  const item = {
    id: `cur_${entry.id}`,
    title,
    consequence,
    event_type: null,
    category: curationCategory(entry.tags),
    geography: 'Baltic',
    published_at: pubDate,
    source: entry.source || 'news',
    source_url: entry.url || null,
    source_quality: feedSourceQuality(entry.source, entry.url),
    confidence: 'C',
    horizon: 'near_term',
    impact_direction: null,
    affected_modules: [],
    affected_cod_windows: [],
    feed_score: gate.ok ? curationFeedScore(entry.relevance) : 0,
    expires_at: new Date(new Date(pubDate).getTime() + 30 * 86400000).toISOString(),
    status: gate.ok ? 'published' : 'rejected',
    origin: 'curation',
    source_tier: gate.tier,
    topic_score: gate.score,
  };
  if (!gate.ok) item.rejection_reason = gate.reason;
  return item;
}

async function appendCurationToFeedIndex(kv, curationEntry) {
  const item = projectCurationToFeedItem(curationEntry);
  if (!item) return false;
  const rawIdx = await kv.get('feed_index').catch(() => null);
  const idx = rawIdx ? JSON.parse(rawIdx) : [];
  const seenUrls = new Set(idx.map(i => i.source_url).filter(Boolean));
  const seenTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));
  if (item.source_url && seenUrls.has(item.source_url)) return false;
  if (seenTitles.has((item.title || '').toLowerCase().trim())) return false;
  idx.push(item);
  idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
  if (idx.length > 1000) idx.length = 1000;
  await kv.put('feed_index', JSON.stringify(idx));
  return true;
}

function isValidFeedItem(i) {
  if (!i || !i.title) return false;
  if (i.title.startsWith('/') || i.title.startsWith('http')) return false;
  if (i.title.length < 15) return false;
  if (!i.source || !i.category) return false;
  // Phase 4F: exclude soft-deleted items. status is absent on legacy items;
  // treat absence as 'published' so back-compat reads do not over-filter.
  if (i.status === 'rejected') return false;
  // Phase 4F: belt-and-braces — re-run the quality gates at read time so any
  // future ingestion path that bypasses projectCurationToFeedItem cannot
  // smuggle garbage into /feed.
  const gate = evaluateFeedItemGates(i.source, i.source_url, i.title, i.consequence);
  if (!gate.ok) return false;
  return true;
}

// ─── Digest via Anthropic ──────────────────────────────────────────────────────

async function buildDigest(entries, anthropicKey) {
  const sorted    = [...entries].sort((a, b) => b.relevance - a.relevance).slice(0, 15);
  const itemsText = sorted.map((e, i) =>
    `[${i + 1}] relevance=${e.relevance} source=${e.source}\nTitle: ${e.title}\nURL: ${e.url}\nText: ${e.raw_text.slice(0, 600)}`
  ).join('\n\n');

  const prompt = `You are an infrastructure intelligence analyst. Below are ${sorted.length} curated articles from the past 7 days, ranked by relevance (1–5). Summarize each into a concise DigestItem. Focus on Baltic energy markets, grid infrastructure, BESS, and related macro signals.

For each article, return a JSON object with:
- id: string
- title: string (sharp, factual, ≤10 words)
- summary: string (2–3 sentences, specific facts)
- source: string
- url: string
- date: string (ISO 8601, copy created_at)
- relevance: number

Return ONLY a valid JSON array. No markdown, no commentary.

Articles:
${itemsText}`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data  = await res.json();
  const text  = data.content?.[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Anthropic response did not contain a JSON array');
  return JSON.parse(match[0]);
}

// ─── S5 — DC Power Viability ──────────────────────────────────────────────────

const DC_RSS_URL = 'https://www.datacenterknowledge.com/rss.xml';

async function fetchDCNews() {
  const res = await fetch(DC_RSS_URL, {
    headers: { 'User-Agent': 'KKME/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml   = await res.text();
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks.slice(0, 5)) {
    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
                    ?? block.match(/<title>([^<]*)<\/title>/);
    const linkMatch  = block.match(/<link>([^<]*)<\/link>/)
                    ?? block.match(/<guid[^>]*>(https?[^<]+)<\/guid>/);
    const dateMatch  = block.match(/<pubDate>([^<]*)<\/pubDate>/);
    if (titleMatch?.[1]) {
      items.push({
        title: titleMatch[1].trim()
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        url:   linkMatch?.[1]?.trim() ?? null,
        date:  dateMatch?.[1]?.trim() ?? null,
      });
    }
  }
  return items;
}

async function computeS5(env) {
  const [s4Raw, manualRaw] = await Promise.all([
    env.KKME_SIGNALS.get('s4').catch(() => null),
    env.KKME_SIGNALS.get('s5_manual').catch(() => null),
  ]);
  const s4     = s4Raw     ? JSON.parse(s4Raw)     : null;
  const manual = manualRaw ? JSON.parse(manualRaw) : null;

  const grid_free_mw      = s4?.free_mw      ?? null;
  const grid_connected_mw = s4?.connected_mw ?? null;
  const grid_utilisation  = s4?.utilisation_pct ?? null;

  let signal = 'OPEN';
  if (grid_free_mw != null) {
    if      (grid_free_mw > 2000) signal = 'OPEN';
    else if (grid_free_mw >  500) signal = 'TIGHTENING';
    else                          signal = 'CONSTRAINED';
  }

  let news_items = [];
  try { news_items = await fetchDCNews(); } catch (e) {
    console.error('[S5/news]', String(e));
  }

  return {
    timestamp:        new Date().toISOString(),
    signal,
    grid_free_mw,
    grid_connected_mw,
    grid_utilisation,
    pipeline_mw:      manual?.pipeline_mw   ?? null,
    pipeline_note:    manual?.note          ?? null,
    pipeline_updated: manual?.updated_at    ?? null,
    news_items,
  };
}

// ─── S6 — Nordic Hydro Reservoir ──────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

async function fetchNordicHydro() {
  const NVE_BASE = 'https://biapi.nve.no/magasinstatistikk/api/Magasinstatistikk';
  const headers = { Accept: 'application/json' };

  const [sisteRes, medRes] = await Promise.all([
    fetch(`${NVE_BASE}/HentOffentligDataSisteUke`, { headers }),
    fetch(`${NVE_BASE}/HentOffentligDataMinMaxMedian`, { headers }),
  ]);

  if (!sisteRes.ok) throw new Error(`NVE SisteUke: HTTP ${sisteRes.status}`);
  const sisteUke = await sisteRes.json();

  // Filter to EL (electricity) region entries only (omrType === 'EL')
  const elData = Array.isArray(sisteUke) ? sisteUke.filter(r => r.omrType === 'EL') : [];
  if (!elData.length) throw new Error('NVE: no EL records in SisteUke');

  const totalFillTwh = elData.reduce((s, r) => s + (r.fylling_TWh ?? 0), 0);
  const totalCapTwh  = elData.reduce((s, r) => s + (r.kapasitet_TWh ?? 0), 0);
  if (!totalCapTwh) throw new Error('NVE: zero capacity');

  const fill_pct    = Math.round(totalFillTwh / totalCapTwh * 1000) / 10;
  const currentWeek = elData[0]?.iso_uke ?? null;
  const currentYear = elData[0]?.iso_aar ?? new Date().getFullYear();

  let median_fill_pct = null;
  if (medRes.ok) {
    const medianData = await medRes.json();
    const weekMedian = Array.isArray(medianData)
      ? medianData.filter(r => r.omrType === 'EL' && r.iso_uke === currentWeek)
      : [];
    if (weekMedian.length) {
      const totalMedianTwh = weekMedian.reduce((s, r) => s + (r.medianFylling_TWH ?? 0), 0);
      median_fill_pct = Math.round(totalMedianTwh / totalCapTwh * 1000) / 10;
    }
  }

  const deviation_pp = median_fill_pct != null
    ? Math.round((fill_pct - median_fill_pct) * 10) / 10
    : null;

  let signal = 'NORMAL';
  if (deviation_pp != null) {
    if (deviation_pp > 5)  signal = 'HIGH';
    if (deviation_pp < -5) signal = 'LOW';
  }

  return {
    timestamp:       new Date().toISOString(),
    signal,
    fill_pct,
    capacity_twh:    Math.round(totalCapTwh * 10) / 10,
    median_fill_pct,
    deviation_pp,
    week:            currentWeek,
    year:            currentYear,
    interpretation:  signal === 'HIGH'
      ? 'Reservoirs above median — hydro surplus → lower Nordic baseload prices likely.'
      : signal === 'LOW'
        ? 'Reservoirs below median — hydro deficit → upward pressure on Nordic prices.'
        : 'Reservoirs near historical median — neutral price signal.',
  };
}

// ─── S7 — TTF Gas Price ────────────────────────────────────────────────────────

async function fetchTTFGas() {
  // Yahoo Finance v8 API — Dutch TTF Natural Gas futures (TTF=F), no auth required
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/TTF%3DF?interval=1d&range=10d',
      {
        signal: controller.signal,
        headers: {
          'User-Agent': TE_HEADERS['User-Agent'],
          'Accept': 'application/json',
        },
      }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Yahoo TTF: HTTP ${res.status}`);
    const body = await res.json();
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('Yahoo TTF: no result in response');

    const ttf_eur_mwh = meta.regularMarketPrice;
    if (ttf_eur_mwh == null) throw new Error('Yahoo TTF: regularMarketPrice missing');

    // Trend: vs previous close
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const delta = prevClose != null ? ttf_eur_mwh - prevClose : null;
    const ttf_trend = delta == null ? null
      : delta >  2 ? '↑ rising'
      : delta < -2 ? '↓ falling'
      : '→ stable';

    let signal = 'NORMAL';
    if (ttf_eur_mwh > 50)      signal = 'HIGH';
    else if (ttf_eur_mwh > 30) signal = 'ELEVATED';
    else if (ttf_eur_mwh < 15) signal = 'LOW';

    const regime = signal; // alias for display
    const bess_impact = ttf_eur_mwh > 30 ? 'arbitrage_bullish' : 'neutral';
    return {
      timestamp:   new Date().toISOString(),
      signal,
      regime,
      bess_impact,
      ttf_eur_mwh: Math.round(ttf_eur_mwh * 100) / 100,
      ttf_trend,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── S8 — Interconnector Flows (NordBalt + LitPol + EstLink + Fenno-Skan) ─────

async function fetchInterconnectorFlows(env) {
  // energy-charts.info CBET: cross-border electricity trading
  // Sign convention per endpoint: positive = country importing FROM neighbor.
  // Preserved as-is downstream (no negation): *_avg_mw and *_signal both
  // follow the API convention. See lib/baltic-places.ts for arrow rendering.
  //
  // Phase 12.7: identifying User-Agent reduces HTTP 429 from anonymous-bucket
  // rate-limiting when EE + FI requests fire in parallel with LT.
  const cbetHeaders = {
    Accept: 'application/json',
    'User-Agent': 'KKME/1.0 (+https://kkme.eu) — Baltic flexibility intelligence',
  };

  // Fetch LT, EE, and FI CBET data in parallel
  const [ltRes, eeRes, fiRes] = await Promise.all([
    fetch('https://api.energy-charts.info/cbet?country=lt', { headers: cbetHeaders }),
    fetch('https://api.energy-charts.info/cbet?country=ee', { headers: cbetHeaders }).catch(() => null),
    fetch('https://api.energy-charts.info/cbet?country=fi', { headers: cbetHeaders }).catch(() => null),
  ]);

  if (!ltRes.ok) throw new Error(`CBET LT API: HTTP ${ltRes.status}`);
  const ltData = await ltRes.json();
  const ltCountries = Array.isArray(ltData.countries) ? ltData.countries : [];

  function latestFromList(countryList, name) {
    const c = countryList.find(c => c.name?.toLowerCase() === name.toLowerCase());
    if (!c) return null;
    const values = c.data ?? [];
    // Walk backward to find the last non-null value (latest data point)
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return Math.round(values[i] * 1000); // GW → MW, positive = importing
    }
    return null;
  }

  // NordBalt (LT ↔ SE4): from LT CBET, Sweden column
  const nordbalt_avg_mw = latestFromList(ltCountries, 'Sweden');
  // LitPol (LT ↔ PL): from LT CBET, Poland column
  const litpol_avg_mw = latestFromList(ltCountries, 'Poland');
  // LV ↔ LT internal Baltic flow: from LT CBET, Latvia column
  const lv_lt_avg_mw = latestFromList(ltCountries, 'Latvia');

  // EstLink (EE ↔ FI): from EE CBET, Finland column
  let estlink_fetched = null;
  if (eeRes && eeRes.ok) {
    try {
      const eeData = await eeRes.json();
      const eeCountries = Array.isArray(eeData.countries) ? eeData.countries : [];
      estlink_fetched = latestFromList(eeCountries, 'Finland');
    } catch (e) {
      console.error('[S8] EE CBET parse error:', String(e));
    }
  } else if (eeRes && !eeRes.ok) {
    console.error(`[S8] EE CBET HTTP ${eeRes.status} (likely rate limit)`);
  }

  // Fenno-Skan (SE ↔ FI): from FI CBET, Sweden column
  let fennoskan_fetched = null;
  if (fiRes && fiRes.ok) {
    try {
      const fiData = await fiRes.json();
      const fiCountries = Array.isArray(fiData.countries) ? fiData.countries : [];
      fennoskan_fetched = latestFromList(fiCountries, 'Sweden');
    } catch (e) {
      console.error('[S8] FI CBET parse error:', String(e));
    }
  } else if (fiRes && !fiRes.ok) {
    console.error(`[S8] FI CBET HTTP ${fiRes.status} (likely rate limit)`);
  }

  if (nordbalt_avg_mw == null && litpol_avg_mw == null) {
    console.error('[S8] LT countries not found, names:', ltCountries.map(c => c.name).join(','));
    throw new Error('CBET: no Sweden or Poland data in LT response');
  }

  // Persist-last-good: when a cable couldn't be fetched (rate limit, parse error,
  // data array all-null, etc.), prefer the prior KV value over emitting null.
  // Visitors see the last-known cable flow rather than a "no data" placeholder.
  // The cron-stale path degrades to "stale data" instead of "no data."
  let prior = null;
  if (env && env.KKME_SIGNALS) {
    try {
      const cached = await env.KKME_SIGNALS.get('s8');
      if (cached) prior = JSON.parse(cached);
    } catch (e) {
      console.error('[S8] prior KV read failed:', String(e));
    }
  }

  const nordbalt_avg_mw_merged  = safeInterconnector(nordbalt_avg_mw,  prior?.nordbalt_avg_mw);
  const litpol_avg_mw_merged    = safeInterconnector(litpol_avg_mw,    prior?.litpol_avg_mw);
  const estlink_avg_mw_merged   = safeInterconnector(estlink_fetched,  prior?.estlink_avg_mw);
  const fennoskan_avg_mw_merged = safeInterconnector(fennoskan_fetched, prior?.fennoskan_avg_mw);
  const lv_lt_avg_mw_merged     = safeInterconnector(lv_lt_avg_mw,     prior?.lv_lt_avg_mw);

  function flowSignal(mw) {
    if (mw == null) return null;
    if (mw > 100)  return 'IMPORTING';   // positive → LT importing from neighbor (per API convention)
    if (mw < -100) return 'EXPORTING';   // negative → LT exporting to neighbor
    return 'BALANCED';
  }

  // Re-derive *_signal + netTotal from merged values so a fallback'd MW yields
  // a fallback'd signal label rather than a stale signal next to a fresh number.
  const nordbalt_signal  = flowSignal(nordbalt_avg_mw_merged);
  const litpol_signal    = flowSignal(litpol_avg_mw_merged);
  const estlink_signal   = flowSignal(estlink_avg_mw_merged);
  const fennoskan_signal = flowSignal(fennoskan_avg_mw_merged);
  const lv_lt_signal     = flowSignal(lv_lt_avg_mw_merged);
  const netTotal = (nordbalt_avg_mw_merged ?? 0) + (litpol_avg_mw_merged ?? 0);
  const signal   = netTotal > 100 ? 'IMPORTING' : netTotal < -100 ? 'EXPORTING' : 'NEUTRAL';

  // Phase 12.9.2: `timestamp` is the canonical "as-of-write" used by /health for
  // age computation; energy-charts.info publishes forward-looking slot-end times
  // in unix_seconds, which previously leaked into `timestamp` and produced
  // negative age_hours. Slot-end is preserved as `data_slot_end`.
  const unixSeconds = Array.isArray(ltData.unix_seconds) ? ltData.unix_seconds : [];
  const lastUnix = unixSeconds.length > 0 ? unixSeconds[unixSeconds.length - 1] : null;
  const dataSlotEnd = lastUnix ? new Date(lastUnix * 1000).toISOString() : null;

  const fmtFlow = (label, sig, mw) =>
    `${label}: ${sig ?? '—'} (${mw != null ? mw + ' MW' : '—'})`;

  return {
    timestamp:        new Date().toISOString(),
    data_slot_end:    dataSlotEnd,
    signal,
    nordbalt_avg_mw:  nordbalt_avg_mw_merged,
    litpol_avg_mw:    litpol_avg_mw_merged,
    estlink_avg_mw:   estlink_avg_mw_merged,
    fennoskan_avg_mw: fennoskan_avg_mw_merged,
    lv_lt_avg_mw:     lv_lt_avg_mw_merged,
    nordbalt_signal,
    litpol_signal,
    estlink_signal,
    fennoskan_signal,
    lv_lt_signal,
    freshness: {
      nordbalt:  freshnessForInterconnector(nordbalt_avg_mw,  prior?.nordbalt_avg_mw),
      litpol:    freshnessForInterconnector(litpol_avg_mw,    prior?.litpol_avg_mw),
      estlink:   freshnessForInterconnector(estlink_fetched,  prior?.estlink_avg_mw),
      fennoskan: freshnessForInterconnector(fennoskan_fetched, prior?.fennoskan_avg_mw),
      lv_lt:     freshnessForInterconnector(lv_lt_avg_mw,     prior?.lv_lt_avg_mw),
    },
    interpretation: [
      fmtFlow('NordBalt', nordbalt_signal, nordbalt_avg_mw_merged),
      fmtFlow('LitPol', litpol_signal, litpol_avg_mw_merged),
      fmtFlow('LV↔LT', lv_lt_signal, lv_lt_avg_mw_merged),
      fmtFlow('EstLink', estlink_signal, estlink_avg_mw_merged),
      fmtFlow('Fenno-Skan', fennoskan_signal, fennoskan_avg_mw_merged),
    ].join('. ') + '.',
  };
}

// Phase 12.7 — interconnector merge helpers.
// Inline copies of the TS mirror at app/lib/interconnectorHelpers.ts so the
// worker can run without a build step. Keep both in sync.
function safeInterconnector(current, fallback) {
  return current != null ? current : (fallback != null ? fallback : null);
}
function freshnessForInterconnector(current, fallback) {
  if (current != null) return 'live';
  if (fallback != null) return 'stale';
  return null;
}

// ─── S9 — EU ETS Carbon Price ──────────────────────────────────────────────────

function parseEUAPrice(html) {
  // Pattern 1: "Carbon Emissions rose/fell to 73.25"
  const m1 = html.match(/Carbon[^"]*?(?:rose|fell)[^"]*?to\s+([\d,]+\.?\d*)/i);
  if (m1) {
    const val = parseFloat(m1[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 2: embedded JSON "last":"73.25"
  const m2 = html.match(/"last"\s*:\s*"?([\d,]+\.?\d*)"?/);
  if (m2) {
    const val = parseFloat(m2[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 3: "price":"73.25"
  const m3 = html.match(/"price"\s*:\s*"?([\d,]+\.?\d*)"?/);
  if (m3) {
    const val = parseFloat(m3[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 4: data-value attribute
  const m4 = html.match(/data-value="([\d,]+\.?\d*)"/);
  if (m4) {
    const val = parseFloat(m4[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  return null;
}

async function fetchEUCarbon(env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://tradingeconomics.com/commodity/carbon', {
      signal: controller.signal, headers: TE_HEADERS, redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`TE EUA: HTTP ${res.status}`);
    const html = await res.text();
    const eua_eur_t = parseEUAPrice(html);
    if (eua_eur_t == null) {
      console.error('[S9] EUA parse failed, preview:', html.slice(0, 500));
      throw new Error('TE EUA: price not found in HTML');
    }
    let signal = 'NORMAL';
    if (eua_eur_t > 70)      signal = 'HIGH';
    else if (eua_eur_t > 50) signal = 'ELEVATED';
    else if (eua_eur_t < 30) signal = 'LOW';
    const eua_eur_t_rounded = Math.round(eua_eur_t * 100) / 100;
    let eua_trend = null;
    if (env && env.KKME_SIGNALS) {
      try {
        const rawHist = await env.KKME_SIGNALS.get('s9_history');
        const history = rawHist ? JSON.parse(rawHist) : [];
        eua_trend = computeEUATrend(history, eua_eur_t_rounded);
      } catch (e) {
        console.error('[S9/trend] history read failed:', String(e));
      }
    }
    return {
      timestamp:   new Date().toISOString(),
      signal,
      eua_eur_t:   eua_eur_t_rounded,
      eua_trend,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── /genload — Real-time Baltic generation & load (ENTSO-E A75 + A65) ────────
// Queries ENTSO-E Transparency Platform for each Baltic country.
// A75 = Actual Generation Per Type (sum all production types for total gen)
// A65 = System Total Load
// Returns per-country gen, load, net, timestamp, data_age_minutes.

const GENLOAD_COUNTRIES = [
  { key: 'lt', eic: LT_BZN },
  { key: 'lv', eic: LV_BZN },
  { key: 'ee', eic: EE_BZN },
];

function entsoeTimestamp(d) {
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${da}${hh}${mm}`;
}

/**
 * Parse ENTSO-E XML to extract the latest quantity across all TimeSeries.
 * For A75 (generation per type): sums quantities across all production types at the latest time point.
 * For A65 (load): single TimeSeries, takes latest quantity.
 * Returns { value_mw, timestamp_iso } or null.
 */
function parseEntsoeXml(xml, sumAllSeries = false) {
  // Extract all TimeSeries blocks
  const tsBlocks = [];
  const tsRegex = /<TimeSeries>([\s\S]*?)<\/TimeSeries>/g;
  let tsMatch;
  while ((tsMatch = tsRegex.exec(xml)) !== null) {
    tsBlocks.push(tsMatch[1]);
  }
  if (tsBlocks.length === 0) return null;

  // For each TimeSeries, extract the Period with its start, resolution, and points
  const seriesData = [];
  for (const block of tsBlocks) {
    const periodMatch = block.match(/<Period>([\s\S]*?)<\/Period>/);
    if (!periodMatch) continue;
    const period = periodMatch[1];

    const startMatch = period.match(/<start>(.*?)<\/start>/);
    const resMatch   = period.match(/<resolution>(.*?)<\/resolution>/);
    if (!startMatch || !resMatch) continue;

    const periodStart = new Date(startMatch[1]);
    const resolution  = resMatch[1]; // PT15M or PT60M
    const resMins     = resolution === 'PT15M' ? 15 : resolution === 'PT30M' ? 30 : 60;

    // Extract all points (position + quantity)
    const points = [];
    const ptRegex = /<Point>\s*<position>(\d+)<\/position>\s*<quantity>([\d.]+)<\/quantity>/g;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(period)) !== null) {
      const position = parseInt(ptMatch[1]);
      const quantity = parseFloat(ptMatch[2]);
      const pointTime = new Date(periodStart.getTime() + (position - 1) * resMins * 60000);
      points.push({ position, quantity, time: pointTime });
    }
    if (points.length > 0) {
      seriesData.push(points);
    }
  }
  if (seriesData.length === 0) return null;

  if (sumAllSeries) {
    // A75: sum each series' latest point regardless of timestamp alignment.
    // Report the OLDEST contributing timestamp so consumers know the staleness bound.
    let total = 0;
    let oldestTime = null;
    let newestTime = null;
    for (const points of seriesData) {
      const lastPoint = points[points.length - 1];
      if (lastPoint?.quantity != null) {
        total += lastPoint.quantity;
        const t = lastPoint.time.getTime();
        if (oldestTime === null || t < oldestTime) oldestTime = t;
        if (newestTime === null || t > newestTime) newestTime = t;
      }
    }
    if (oldestTime === null) return null;
    return {
      value_mw: Math.round(total),
      timestamp_iso: new Date(oldestTime).toISOString(),
      newest_iso: new Date(newestTime).toISOString(),
      series_count: seriesData.length,
    };
  } else {
    // A65: single series, take the last point
    const allPoints = seriesData.flat().sort((a, b) => a.time - b.time);
    const last = allPoints[allPoints.length - 1];
    return { value_mw: Math.round(last.quantity), timestamp_iso: last.time.toISOString() };
  }
}

async function fetchGenLoadCountry(eic, apiKey) {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
  const start = entsoeTimestamp(twoHoursAgo);
  const end   = entsoeTimestamp(now);

  // Fetch A75 (generation per type) and A65 (load) in parallel
  const [genRes, loadRes] = await Promise.all([
    fetch(`${ENTSOE_API}?documentType=A75&processType=A16&in_Domain=${eic}&periodStart=${start}&periodEnd=${end}&securityToken=${apiKey}`)
      .then(r => r.ok ? r.text() : null)
      .catch(() => null),
    fetch(`${ENTSOE_API}?documentType=A65&processType=A16&outBiddingZone_Domain=${eic}&periodStart=${start}&periodEnd=${end}&securityToken=${apiKey}`)
      .then(r => r.ok ? r.text() : null)
      .catch(() => null),
  ]);

  const gen  = genRes  ? parseEntsoeXml(genRes, true)  : null;
  const load = loadRes ? parseEntsoeXml(loadRes, false) : null;

  // Use the more recent timestamp of the two
  const ts = gen?.timestamp_iso || load?.timestamp_iso || null;
  const genMw  = gen?.value_mw  ?? null;
  const loadMw = load?.value_mw ?? null;
  const netMw  = (genMw != null && loadMw != null) ? genMw - loadMw : null;

  let dataAge = null;
  if (ts) {
    dataAge = Math.round((now.getTime() - new Date(ts).getTime()) / 60000);
  }

  return {
    generation_mw: genMw,
    load_mw: loadMw,
    net_mw: netMw,
    timestamp: ts,
    data_age_minutes: dataAge,
  };
}

async function fetchGenLoad(apiKey) {
  const results = await Promise.all(
    GENLOAD_COUNTRIES.map(c =>
      fetchGenLoadCountry(c.eic, apiKey)
        .catch(err => {
          console.error(`[genload/${c.key}]`, String(err));
          return { generation_mw: null, load_mw: null, net_mw: null, timestamp: null, data_age_minutes: null };
        })
    )
  );
  const out = { fetched_at: new Date().toISOString() };
  GENLOAD_COUNTRIES.forEach((c, i) => { out[c.key] = results[i]; });
  return out;
}

// ─── Baltic Generation (Wind + Solar + Load) ────────────────────────────────────
// Source: energy-charts.info public_power API (Fraunhofer ISE)
// Fetches 7-day range for LT/EE/LV, extracts wind, solar, load.
// Returns { wind, solar, load } payloads for 3 KV keys.

const BALTIC_GEN_COUNTRIES = [
  { code: 'lt', label: 'LT', wind_installed_mw: 1800, solar_installed_mw: 2200 },
  { code: 'ee', label: 'EE', wind_installed_mw:  900, solar_installed_mw:  400 },
  { code: 'lv', label: 'LV', wind_installed_mw:  200, solar_installed_mw:  200 },
  // installed_mw: approximate 2026 references, not exact. Classify as "reference".
];

function extractSeries(apiData, typeName) {
  const types = Array.isArray(apiData?.production_types) ? apiData.production_types : [];
  const match = types.find(t => t.name === typeName);
  if (!match) return null;
  const raw = match.data ?? [];
  const ts = apiData.unix_seconds ?? [];
  // Return paired [timestamp, value] for non-null entries
  const pairs = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] != null) pairs.push({ ts: ts[i] ?? 0, mw: raw[i] });
  }
  return pairs;
}

function seriesStats(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const vals = pairs.map(p => p.mw);
  const current = vals[vals.length - 1];
  const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  return { current_mw: Math.round(current), avg_7d_mw: avg, n: vals.length };
}

function genTrend(current, avg) {
  if (current == null || avg == null || avg === 0) return 'unknown';
  const ratio = current / avg;
  if (ratio > 1.10) return 'above_baseline';
  if (ratio < 0.90) return 'below_baseline';
  return 'stable';
}

async function fetchBalticGeneration() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const startParam = sevenDaysAgo.toISOString().replace(/:\d{2}\.\d+Z/, ':00Z');
  const endParam   = now.toISOString().replace(/:\d{2}\.\d+Z/, ':00Z');

  // Fetch all 3 countries in parallel (one call per country gives wind+solar+load)
  const fetches = BALTIC_GEN_COUNTRIES.map(c =>
    fetch(`https://api.energy-charts.info/public_power?country=${c.code}&start=${startParam}&end=${endParam}`, {
      headers: { Accept: 'application/json' },
    })
    .then(r => { if (!r.ok) throw new Error(`energy-charts ${c.code}: HTTP ${r.status}`); return r.json(); })
    .then(data => ({ country: c, data, ok: true }))
    .catch(err => { console.error(`[Gen/${c.label}]`, String(err)); return { country: c, data: null, ok: false }; })
  );
  const results = await Promise.all(fetches);

  const timestamp = now.toISOString();
  const coverage = results.filter(r => r.ok).map(r => r.country.label);

  // Extract per-country stats for each type
  const windByCountry = {};
  const solarByCountry = {};
  const loadByCountry = {};

  for (const r of results) {
    if (!r.ok) {
      windByCountry[r.country.label] = null;
      solarByCountry[r.country.label] = null;
      loadByCountry[r.country.label] = null;
      continue;
    }
    windByCountry[r.country.label]  = seriesStats(extractSeries(r.data, 'Wind onshore'));
    solarByCountry[r.country.label] = seriesStats(extractSeries(r.data, 'Solar'));
    loadByCountry[r.country.label]  = seriesStats(extractSeries(r.data, 'Load'));
  }

  // Aggregate Baltic totals from available countries
  function balticSum(byCountry, field) {
    let total = 0; let found = false;
    for (const label of ['LT', 'EE', 'LV']) {
      const v = byCountry[label]?.[field];
      if (v != null) { total += v; found = true; }
    }
    return found ? total : null;
  }

  const balticWindCurrent = balticSum(windByCountry, 'current_mw');
  const balticWindAvg     = balticSum(windByCountry, 'avg_7d_mw');
  const balticWindInstalled = BALTIC_GEN_COUNTRIES.reduce((s, c) => s + c.wind_installed_mw, 0);

  const balticSolarCurrent = balticSum(solarByCountry, 'current_mw');
  const balticSolarAvg     = balticSum(solarByCountry, 'avg_7d_mw');
  const balticSolarInstalled = BALTIC_GEN_COUNTRIES.reduce((s, c) => s + c.solar_installed_mw, 0);

  const balticLoadCurrent = balticSum(loadByCountry, 'current_mw');
  const balticLoadAvg     = balticSum(loadByCountry, 'avg_7d_mw');

  // Wind signal
  let windSignal = 'MODERATE';
  if (balticWindCurrent != null && balticWindInstalled > 0) {
    const pct = balticWindCurrent / balticWindInstalled;
    if (pct > 0.60) windSignal = 'HIGH';
    else if (pct < 0.30) windSignal = 'LOW';
  }

  // Solar signal
  let solarSignal = 'MODERATE';
  if (balticSolarCurrent != null) {
    if (balticSolarCurrent === 0) solarSignal = 'NIGHT';
    else if (balticSolarInstalled > 0) {
      const pct = balticSolarCurrent / balticSolarInstalled;
      if (pct > 0.50) solarSignal = 'HIGH';
      else if (pct < 0.20) solarSignal = 'LOW';
    }
  }

  // Load signal
  let loadSignal = 'NORMAL';
  if (balticLoadCurrent != null) {
    if (balticLoadCurrent > 3200) loadSignal = 'PEAK';
    else if (balticLoadCurrent < 2400) loadSignal = 'LOW';
  }

  const wind = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticWindCurrent, avg_7d_mw: balticWindAvg,
    trend_7d: genTrend(balticWindCurrent, balticWindAvg),
    baltic_installed_mw: balticWindInstalled,
    // baltic_share_pct: share of installed capacity currently generating
    // Denominator: sum of installed wind capacity across LT+EE+LV (reference values, ~2026)
    baltic_share_pct: (balticWindCurrent != null && balticWindInstalled > 0)
      ? Math.round(balticWindCurrent / balticWindInstalled * 1000) / 10
      : null,
    lt_mw: windByCountry.LT?.current_mw ?? null,
    ee_mw: windByCountry.EE?.current_mw ?? null,
    lv_mw: windByCountry.LV?.current_mw ?? null,
    signal: windSignal,
    interpretation: windSignal === 'HIGH'
      ? 'High wind generation — wider price spreads likely, supporting BESS arbitrage.'
      : windSignal === 'LOW'
        ? 'Low wind — narrower spreads expected, reduced arbitrage opportunity.'
        : 'Moderate wind output — typical spread conditions.',
  };

  const solar = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticSolarCurrent, avg_7d_mw: balticSolarAvg,
    trend_7d: genTrend(balticSolarCurrent, balticSolarAvg),
    baltic_installed_mw: balticSolarInstalled,
    baltic_share_pct: (balticSolarCurrent != null && balticSolarInstalled > 0)
      ? Math.round(balticSolarCurrent / balticSolarInstalled * 1000) / 10
      : null,
    lt_mw: solarByCountry.LT?.current_mw ?? null,
    ee_mw: solarByCountry.EE?.current_mw ?? null,
    lv_mw: solarByCountry.LV?.current_mw ?? null,
    signal: solarSignal,
    interpretation: solarSignal === 'HIGH'
      ? 'High solar output — low midday prices create a cheap BESS charging window.'
      : solarSignal === 'NIGHT'
        ? 'Nighttime — no solar generation.'
        : solarSignal === 'LOW'
          ? 'Low solar — minimal impact on midday pricing.'
          : 'Moderate solar — some midday price suppression.',
  };

  const load = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticLoadCurrent, avg_7d_mw: balticLoadAvg,
    trend_7d: genTrend(balticLoadCurrent, balticLoadAvg),
    lt_mw: loadByCountry.LT?.current_mw ?? null,
    ee_mw: loadByCountry.EE?.current_mw ?? null,
    lv_mw: loadByCountry.LV?.current_mw ?? null,
    signal: loadSignal,
    interpretation: loadSignal === 'PEAK'
      ? 'Peak demand — higher prices support BESS discharge revenue.'
      : loadSignal === 'LOW'
        ? 'Low demand — reduced price levels, typical off-peak.'
        : 'Normal demand levels.',
  };

  return { wind, solar, load };
}

// ─── Phase 48: request-body validation for the admin write endpoints ──────────
//
// The defect these exist to remove: `/feed/clean` parsed its body under
// `catch { /* empty body ok */ }`, so malformed JSON produced `body = {}`, the
// 60-day default cutoff applied, and the route wrote `feed_index` anyway. A
// parse failure must never fall through to a default that deletes. These are
// pure so the validation is testable without a request.

/**
 * Validate a raw request-body string as JSON of the expected shape.
 * @param {string|null} raw            body text, or null if it could not be read
 * @param {object}  [opts]             options
 * @param {boolean} [opts.allowArray]  accept a top-level JSON array
 * @param {boolean} [opts.allowEmpty]  accept an absent/blank body as `{}`
 * @returns {{ok: true, body: object} | {ok: false, error: string}}
 */
function parseJsonBody(raw, { allowArray = false, allowEmpty = false } = {}) {
  const isEmpty = raw === null || raw === undefined
    || (typeof raw === 'string' && raw.trim() === '');
  if (isEmpty) {
    return allowEmpty
      ? { ok: true, body: {} }
      : { ok: false, error: 'Request body required: expected a JSON object' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Request body could not be read' };
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { ok: false, error: 'Malformed JSON body' }; }
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  if (Array.isArray(parsed) && !allowArray) {
    return { ok: false, error: 'Request body must be a JSON object, not an array' };
  }
  return { ok: true, body: parsed };
}

/**
 * Largest fraction of `feed_index` that `/feed/clean` may remove before it
 * demands an explicit `"confirm": true`. Bounds the blast radius even when the
 * caller is authenticated.
 */
const FEED_CLEAN_MAX_REMOVED_FRACTION = 0.5;

/**
 * Validate the `/feed/clean` parameters. `before` is REQUIRED — there is no
 * default, because the default was the destructive part.
 * @returns {{ok: true, before: string, confirm: boolean} | {ok: false, error: string}}
 */
function validateFeedCleanParams(body, nowIso) {
  const { before } = body;
  if (typeof before !== 'string' || before.trim() === '') {
    return { ok: false, error: '`before` is required: an ISO 8601 date or date-time, no default' };
  }
  const t = Date.parse(before);
  if (Number.isNaN(t)) {
    return { ok: false, error: '`before` is not a valid ISO 8601 date' };
  }
  if (t > Date.parse(nowIso)) {
    return { ok: false, error: '`before` must not be in the future' };
  }
  if ('confirm' in body && typeof body.confirm !== 'boolean') {
    return { ok: false, error: '`confirm` must be a boolean' };
  }
  return { ok: true, before, confirm: body.confirm === true };
}

/**
 * Refuse an over-broad clean unless the caller explicitly confirmed it.
 * @returns {{ok: true, fraction: number} | {ok: false, fraction: number, error: string}}
 */
function feedCleanBlastRadius(total, removed, confirm, maxFraction = FEED_CLEAN_MAX_REMOVED_FRACTION) {
  if (total <= 0) return { ok: true, fraction: 0 };
  const fraction = removed / total;
  if (fraction > maxFraction && !confirm) {
    return {
      ok: false,
      fraction,
      error: `Refusing to remove ${removed} of ${total} items (${(fraction * 100).toFixed(1)}% `
        + `> ${(maxFraction * 100).toFixed(0)}% limit) without "confirm": true`,
    };
  }
  return { ok: true, fraction };
}

/**
 * Field-length and shape bounds for the public `/contact` form. `/contact` stays
 * unauthenticated by design — it is a contact form — so its protection is
 * bounds, not auth. Rate limiting is NOT implemented here; see the phase-48
 * write-up for the proposal and the gap.
 */
const CONTACT_MAX_BODY_BYTES = 16 * 1024;
const CONTACT_TYPES = ['project', 'investment', 'market', 'other'];
const CONTACT_FIELD_LIMITS = {
  name: 200, email: 320, message: 5000, company: 200,
  projectName: 200, mwMwh: 100, country: 100, targetCod: 100,
};

/**
 * Escape a value for interpolation into HTML TEXT.
 *
 * Phase 50. `/contact` interpolated submitted fields straight into an HTML email
 * — `<p><strong>Name:</strong> ${name}</p>` — so a submitter controlled markup
 * in a document a human opens in a mail client. That is a different risk class
 * from the KV writers: no KV is corrupted, but the operator's own inbox renders
 * attacker-authored HTML, and the form is public and unauthenticated.
 *
 * Five characters, not three. `<` and `&` cover text position; `"` and `'` are
 * required because one interpolation sits INSIDE an attribute
 * (`href="mailto:${email}"`), where a bare quote closes it and everything after
 * becomes markup — the case a text-only escaper silently misses.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a value for use inside an HTML attribute, additionally refusing any
 * scheme that can execute. `mailto:` is the only scheme this form ever needs, so
 * anything that is not a plain address becomes inert text rather than a link —
 * escaping alone would not stop `javascript:` from being a working href.
 */
function safeMailtoHref(email) {
  const v = String(email ?? '');
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v)
    ? `mailto:${encodeURIComponent(v)}`
    : '';
}

/**
 * The ONLY fields that may reach the notification email, in render order.
 * An allowlist rather than a loop over the body: a future field added to the
 * form then reaches the inbox only when someone decides it should.
 */
const CONTACT_EMAIL_FIELDS = ['name', 'email', 'company', 'projectName', 'mwMwh', 'country', 'targetCod', 'message'];

/**
 * Render the body rows of the notification email, escaped.
 *
 * Pure and exported so the escaping can be tested against real payloads rather
 * than asserted about. Labels are literals; only values are interpolated, and
 * every value goes through `escapeHtml` exactly once.
 */
function buildContactEmailHtml(body) {
  const LABELS = {
    name: 'Name', email: 'Email', company: 'Company', projectName: 'Project',
    mwMwh: 'MW/MWh', country: 'Country', targetCod: 'Target COD',
  };
  let out = '';
  for (const field of CONTACT_EMAIL_FIELDS) {
    const raw = body?.[field];
    if (raw === undefined || raw === null || raw === '') continue;
    if (field === 'message') continue; // rendered last, below the rule
    if (field === 'email') {
      const href = safeMailtoHref(raw);
      out += href
        ? `<p><strong>Email:</strong> <a href="${escapeHtml(href)}">${escapeHtml(raw)}</a></p>`
        // Not a plausible address: shown as inert text, never as a link. An
        // unlinkable address is a mild inconvenience; a working `javascript:`
        // href in the operator's mail client is not.
        : `<p><strong>Email:</strong> ${escapeHtml(raw)}</p>`;
      continue;
    }
    out += `<p><strong>${LABELS[field]}:</strong> ${escapeHtml(raw)}</p>`;
  }
  out += '<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">';
  out += `<p style="white-space:pre-wrap">${escapeHtml(body?.message)}</p>`;
  return out;
}

/**
 * Validate a `/contact` submission: required fields, known `type`, plausible
 * email shape, and a length cap per field.
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function validateContactBody(body) {
  const { type, name, email, message } = body;
  if (!name || !email || !message || !type) {
    return { ok: false, error: 'Missing required fields: type, name, email, message' };
  }
  if (!CONTACT_TYPES.includes(type)) {
    return { ok: false, error: `\`type\` must be one of: ${CONTACT_TYPES.join(', ')}` };
  }
  for (const [field, limit] of Object.entries(CONTACT_FIELD_LIMITS)) {
    const v = body[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') {
      return { ok: false, error: `\`${field}\` must be a string` };
    }
    if (v.length > limit) {
      return { ok: false, error: `\`${field}\` exceeds ${limit} characters` };
    }
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: '`email` is not a valid address' };
  }
  return { ok: true };
}

// ─── Phase 51: the revenue snapshot gets a writer, and a controlled comparison ─
//
// `revenue_snapshot_prev` backs the "what changed since yesterday" deltas on the
// site's most important surface. It was the ONLY key with no cron writer: it was
// written by whichever public GET of `/revenue` happened to be the first of the
// calendar day, from THAT REQUEST'S query parameters.
//
// Two consequences, and the second is a correctness bug rather than a cost one:
//
//  1. A stranger's traffic decided when our published journal advanced.
//  2. **The comparison was uncontrolled.** `project_irr` is config-dependent —
//     measured live 2026-08-04, it runs from −0.0121 (4h/high) to +0.2081
//     (2h/low/2030) across public configurations, a 22-point spread — and the
//     snapshot recorded no configuration at all. So yesterday's first visitor's
//     config was compared against today's requester's config, and the difference
//     was published as a change over time. Today's `irr_pp` of +0.02 is correct
//     only because both happened to be the default; a first visitor on 4h/high
//     would have produced roughly +16pp of pure artefact.
//
// The fix is one canonical writer at one canonical configuration, and deltas that
// refuse to compare across configurations.

/**
 * The configuration the daily snapshot is computed at: the route's own public
 * defaults, so the journal describes the page the site shows by default.
 */
const REVENUE_SNAPSHOT_CONFIG = { dur: '2h', capex: 'mid', cod: 2028, scenario: 'base', mw: 50 };

/** Stable identity for a configuration, for comparing a request to the snapshot. */
function revenueConfigKey(c) {
  return `${c.dur}|${c.capex}|${c.cod}|${c.scenario}|${c.mw}`;
}

/**
 * Whether a stored snapshot may be differenced against a result computed at
 * `config`. A snapshot from before this phase has no `config` field; it is NOT
 * assumed to match, because assuming is exactly what produced the artefact.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function revenueDeltaAdmissible(prev, config) {
  if (!prev || !prev.signal_inputs) return { ok: false, reason: 'no previous snapshot' };
  if (!prev.config) {
    return { ok: false, reason: 'previous snapshot predates configuration recording — cannot confirm it is comparable' };
  }
  if (revenueConfigKey(prev.config) !== revenueConfigKey(config)) {
    return { ok: false, reason: 'previous snapshot was computed at a different configuration' };
  }
  return { ok: true };
}

/** The snapshot payload. One shape, written by one caller. */
function buildRevenueSnapshot(result, signalInputs, config, nowIso) {
  return {
    project_irr: result.project_irr,
    net_mw_yr: result.net_mw_yr,
    signal_inputs: signalInputs,
    config,                 // B10: the artifact records what it describes
    computed_at: nowIso,
  };
}

/**
 * Compute today's revenue snapshot at the canonical configuration and store it.
 *
 * Runs from the 08:00 cron. Idempotent per calendar day: a second call on the
 * same day is a no-op, so a manual trigger or a retried cron cannot advance the
 * journal twice and turn one day's movement into two.
 */
async function writeRevenueSnapshot(env, { nowIso = new Date().toISOString() } = {}) {
  const prevRaw = await env.KKME_SIGNALS.get('revenue_snapshot_prev').catch(() => null);
  let prev = null;
  try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch { prev = null; }
  if (prev?.computed_at?.slice(0, 10) === nowIso.slice(0, 10)
      && prev?.config && revenueConfigKey(prev.config) === revenueConfigKey(REVENUE_SNAPSHOT_CONFIG)) {
    console.log(`[revenue-snapshot] already written for ${nowIso.slice(0, 10)} — no-op`);
    return { written: false, reason: 'already written today' };
  }

  const c = REVENUE_SNAPSHOT_CONFIG;
  // Same engine, same KV loader and the same parameter shape the route uses —
  // loadEngineKV exists precisely so a second caller cannot drift from the
  // public site's inputs (discipline rule #4).
  const kv = await loadEngineKV(env);
  const result = computeRevenueV7(
    {
      mw: c.mw,
      dur_h: c.dur === '4h' ? 4 : 2,
      capex_kwh: { low: 120, mid: 164, high: 262 }[c.capex],
      cod_year: c.cod,
      scenario: c.scenario,
      grant_pct: 0,
    },
    kv,
  );
  if (!result || typeof result.project_irr === 'undefined') {
    throw new Error('revenue computation produced no project_irr — refusing to write a partial journal entry');
  }
  const snap = buildRevenueSnapshot(result, result.signal_inputs || {}, c, nowIso);
  await env.KKME_SIGNALS.put('revenue_snapshot_prev', JSON.stringify(snap));
  console.log(`[revenue-snapshot] wrote ${nowIso.slice(0, 10)} config=${revenueConfigKey(c)} `
    + `project_irr=${result.project_irr} net_mw_yr=${result.net_mw_yr}`);
  return { written: true, snapshot: snap };
}

// ─── Phase 51: one auth check, and dual-accept for rotation ───────────────────
//
// `UPDATE_SECRET` gates every admin write. It needs rotating: it sat as an inline
// default in a VPS script and is in four commits of the control-center repo's
// history. A big-bang rotation would break whichever caller nobody remembered —
// and the enumeration is exactly the thing that is never complete, which is the
// whole reason for dual-accept.
//
// So the worker accepts EITHER slot while a rotation is in flight:
//   UPDATE_SECRET       the current value
//   UPDATE_SECRET_NEXT  the incoming value, set only during a rotation
//
// The verdict names WHICH slot matched, never the value. That is what makes
// "observe every caller on the new secret before dropping the old" a measurement
// rather than an assumption — the logs say `slot=next` per caller, and the old
// value is dropped only when nothing is still arriving on `slot=current`.

/** Largest `/curate` body. It is a single curated item, not a bulk import. */
const CURATE_MAX_BODY_BYTES = 64 * 1024;

// B-072 — the VPS relays the whole TradingEconomics page so the parse stays in
// the worker. The live page measured 408,928 B on 2026-08-04; 2 MB leaves room
// for the page to grow several times over without the relay silently failing,
// and still bounds a hostile body. The FLOOR matters more than the ceiling: a
// truncated relay that parses to nothing would overwrite good data with a
// failure payload, so anything under 10 KB is refused as "not the page".
const S3_RELAY_MAX_BODY_BYTES = 2 * 1024 * 1024;
const S3_RELAY_MIN_HTML_BYTES = 10 * 1024;

/**
 * Which secret slot a presented value matches. Pure, and deliberately returns a
 * SLOT NAME rather than a boolean pair, so callers cannot accidentally log the
 * value while trying to log the outcome.
 *
 * Comparison is plain `===`. This is not a timing-attack surface worth arming
 * against here — the secret is a shared bearer token over TLS to a public
 * endpoint, and an attacker with the request volume to time it has cheaper
 * options — but if that changes, this is the one place to harden.
 *
 * @returns {{ok: boolean, slot: 'current'|'next'|null}}
 */
function updateSecretVerdict(presented, current, next) {
  if (typeof presented !== 'string' || presented === '') return { ok: false, slot: null };
  if (typeof current === 'string' && current !== '' && presented === current) return { ok: true, slot: 'current' };
  if (typeof next === 'string' && next !== '' && presented === next) return { ok: true, slot: 'next' };
  return { ok: false, slot: null };
}

/**
 * The single admin-auth check for the whole worker. One function so a rotation
 * is one edit, and so no route can quietly grow a second scheme (rule #4).
 */
function acceptsUpdateSecret(request, env, { route = '' } = {}) {
  const v = updateSecretVerdict(
    request.headers.get('x-update-secret'), env.UPDATE_SECRET, env.UPDATE_SECRET_NEXT,
  );
  if (v.ok && v.slot === 'next') {
    // The rotation's evidence line: which caller has moved, without the value.
    console.log(`[auth] slot=next route=${route || new URL(request.url).pathname} `
      + `ua=${String(request.headers.get('user-agent') ?? '').slice(0, 40)}`);
  }
  return v.ok;
}

// ─── Phase 50: `s2_daily_clearing` recency ────────────────────────────────────
//
// This series is the platform's only irreplaceable archive. It begins on
// 2025-10-01, which is the oldest delivery day BTD still serves in full, so a
// day the importer fails to collect is a day that eventually falls out of BTD's
// window and cannot be re-fetched by anyone, ever. The importer stopping is the
// mechanism by which the archive is lost — and it had stopped, for nine days,
// with nothing watching, because `backfill_btd_daily.py` was written as a
// one-off in 36.C and was never put in a crontab.
//
// **Why this measures the DATA and not the WRITE.** The obvious monitor is the
// age of the KV write. It is also useless here, and worse than useless: the
// daily cron will write on every run, so a run that fetches nothing new still
// stamps a fresh write and the staleness clock resets forever. That is B12
// exactly — the damage disabling its own detector — and it is the same shape as
// S3's failure payload satisfying its own freshness check. The only measure that
// cannot be gamed by a write is the newest DELIVERY DAY present in the series.

/**
 * Days BTD lags real time before a delivery day is publishable. Measured, not
 * assumed: on 2026-08-04 BTD served complete PT15M days through 2026-08-02.
 */
const BTD_PUBLICATION_LAG_DAYS = 2;

/**
 * How far behind the newest publishable delivery day the series may fall before
 * it is stale: publication lag + one missed daily run + one day of buffer.
 */
const S2_DAILY_CLEARING_MAX_LAG_DAYS = BTD_PUBLICATION_LAG_DAYS + 2;

/**
 * Recency of the daily clearing archive, computed from the series itself.
 * @param {Array<{date: string}>|null} days  parsed `s2_daily_clearing`
 * @param {string} nowIso                    current time, injected for testability
 * @returns {{status: string, last_date: string|null, total_days: number,
 *            days_behind: number|null, threshold_days: number, stale: boolean|null}}
 */
function s2DailyClearingRecency(days, nowIso) {
  const threshold_days = S2_DAILY_CLEARING_MAX_LAG_DAYS;
  if (!Array.isArray(days) || days.length === 0) {
    // Absence is an ERROR state, never an innocent one (B12). An empty archive
    // is the worst case this check exists to catch, so it must not read as null.
    return { status: 'missing', last_date: null, total_days: 0, days_behind: null, threshold_days, stale: true };
  }
  const dates = days.map(d => d && d.date).filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dates.length) {
    return { status: 'error', last_date: null, total_days: days.length, days_behind: null, threshold_days, stale: true };
  }
  const last_date = dates.reduce((a, b) => (a > b ? a : b));
  const today = new Date(nowIso);
  const dayMs = 86400000;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const lastUtc = Date.parse(`${last_date}T00:00:00Z`);
  const days_behind = Math.round((todayUtc - lastUtc) / dayMs);
  return {
    status: 'present',
    last_date,
    total_days: dates.length,
    days_behind,
    threshold_days,
    stale: days_behind > threshold_days,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron — hourly (time-sensitive), 4h (all signals), 09:30 (S2 extra), 08:00 (digest). */
  async scheduled(event, env, _ctx) {
    // 08:00 UTC: daily digest to Telegram
    if (event.cron === '0 8 * * *') {
      await sendDailyDigest(env).catch(e => console.error('[Digest]', e));

      // Phase 51 — the daily revenue journal. THE canonical writer of
      // `revenue_snapshot_prev`, and the reason /revenue no longer writes it.
      // Computed at REVENUE_SNAPSHOT_CONFIG so consecutive entries are a
      // controlled comparison; before this, whichever public GET happened to be
      // first that day wrote the snapshot from its own query parameters.
      await writeRevenueSnapshot(env).catch(e => console.error('[RevenueSnapshot]', String(e)));
      return;
    }

    // Weekly fleet-lifecycle digest. The schedule is declared once, in
    // LIFECYCLE_DIGEST_CRON, and compared against it here rather than repeated as
    // a literal — a fourth copy of '30 7 * * 1' is a fourth thing that can drift.
    if (event.cron === LIFECYCLE_DIGEST_CRON) {
      const built = await buildLifecycleDigest(env).catch(e => ({ blocked: true, error: String(e) }));
      if (built.blocked) {
        // A blocked digest must not fail silently: the whole point of this surface
        // is that absence is never ambiguous. Report the refusal on the same channel.
        console.error('[lifecycle-digest/cron] BLOCKED —', built.error);
        await notifyTelegram(env, `⚠️ Weekly fleet-lifecycle digest BLOCKED and not sent: ${built.error}`).catch(() => {});
        return;
      }
      await sendLifecycleDigest(env, built.message);
      console.log(`[lifecycle-digest/cron] sent — ${built.summary.detectors_capable}/${built.summary.detectors_total} detectors capable, ${built.summary.transitions_in_window} transitions`);
      return;
    }

    // 09:30 UTC daily: S2 watchdog fetch + upstream TLS-expiry tripwire.
    if (event.cron === '30 9 * * *') {
      // Phase 36.C — cert tripwire liveness. The inspection itself runs on the
      // VPS (Workers' fetch() exposes no peer certificate, and the CF edge can't
      // reach BTD at all), which POSTs to /admin/cert-watch. A tripwire nobody
      // checks is not a tripwire, so verify it is still reporting.
      await checkCertWatchLiveness(env).catch(e => console.error('[CertWatch]', String(e)));

      try {
        const payload = await withTimeout(computeS2(), 45000);
        if (!payload) {
          console.log('[S2/0930] BTD unreachable from the CF edge — keeping cached KV (VPS leg serves)');
        } else {
          await s2CommitPayload(env, payload, 'worker-direct', 'S2/0930');
        }
      } catch (e) {
        console.error('[S2/0930]', String(e));
        await notifyTelegram(env, `⚠️ S2 fetch failed (09:30): ${String(e).slice(0, 200)}`).catch(() => {});
      }

      // Also update monthly activation clearing (daily is sufficient for monthly aggregates)
      try {
        const actPayload = await withTimeout(computeS2Activation(), 60000);
        if (actPayload) {
          await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(actPayload));
          console.log(`[S2/activation] updated: period=${actPayload.period}, lt_afrr_3m_p50=${actPayload.countries?.Lithuania?.afrr_recent_3m?.avg_p50}`);
        } else {
          console.log('[S2/activation] BTD unavailable — keeping cached data');
        }
      } catch (e) {
        console.error('[S2/activation]', String(e));
      }

      // Phase 50 — the archive's own recency, on the tick. The VPS importer runs
      // at 08:20 UTC, so 09:30 is an hour after it should have landed. Routed
      // through the transition machine so a continuing lag stops re-sending and
      // a recovery produces a message.
      try {
        const rawDc = await env.KKME_SIGNALS.get('s2_daily_clearing').catch(() => null);
        let parsed = null;
        try { parsed = rawDc ? JSON.parse(rawDc) : null; } catch { parsed = null; }
        const rec = s2DailyClearingRecency(parsed, new Date().toISOString());
        const msg = rec.status === 'present'
          ? `s2_daily_clearing: newest delivery day ${rec.last_date}, ${rec.days_behind}d behind `
            + `(threshold ${rec.threshold_days}d), ${rec.total_days} days held`
          : `s2_daily_clearing: ${rec.status} — the irreplaceable archive is not readable`;
        await alertTransition(
          env, 's2_daily_clearing', rec.stale ? 'degraded' : 'ok',
          rec.stale
            ? `${msg}\n• every day not imported eventually falls out of BTD's window and cannot be re-fetched`
            : msg,
        ).catch(() => {});
      } catch (e) {
        console.error('[S2/daily-clearing-recency]', String(e));
      }
      return;
    }

    // ── Hourly: refresh time-sensitive signals only (genload, S8, wind/solar/load) ──
    if (event.cron === '0 * * * *') {
      console.log('[Hourly] refreshing time-sensitive signals...');
      const [s8Res, genRes, genloadRes] = await Promise.allSettled([
        withTimeout(fetchInterconnectorFlows(env), 30000),
        withTimeout(fetchBalticGeneration(),       25000),
        withTimeout(fetchGenLoad(env.ENTSOE_API_KEY), 30000),
      ]);

      if (s8Res.status === 'fulfilled') {
        const d = s8Res.value;
        await env.KKME_SIGNALS.put('s8', JSON.stringify(d));
        console.log(`[S8/hourly] ${d.signal} nordbalt=${d.nordbalt_avg_mw}MW litpol=${d.litpol_avg_mw}MW`);
      } else {
        console.error('[S8/hourly] failed:', s8Res.reason);
      }

      if (genRes.status === 'fulfilled') {
        const { wind, solar, load } = genRes.value;
        await Promise.all([
          env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
          env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
          env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
        ]);
        console.log(`[Gen/hourly] wind=${wind.baltic_mw}MW solar=${solar.baltic_mw}MW load=${load.baltic_mw}MW`);
      } else {
        console.error('[Gen/hourly] failed:', genRes.reason);
      }

      if (genloadRes.status === 'fulfilled') {
        const d = genloadRes.value;
        await env.KKME_SIGNALS.put('genload', JSON.stringify(d));
        console.log(`[Genload/hourly] lt=${d.lt?.generation_mw}/${d.lt?.load_mw} lv=${d.lv?.generation_mw}/${d.lv?.load_mw} ee=${d.ee?.generation_mw}/${d.ee?.load_mw}`);
      } else {
        console.error('[Genload/hourly] failed:', genloadRes.reason);
      }

      console.log('[Hourly] done.');
      return;
    }

    // Every 4h: fetch S1/S2/S3/S4/Euribor in parallel
    //
    // Phase 38.1 — computeS1's budget raised 30s → 60s on tail evidence, not on
    // reasoning. The 2026-08-02T12:00:33Z invocation (Workers Logs, captured
    // before this fix deployed) recorded:
    //
    //   [error] [S1] cron failed: Error: Timed out after 30000ms
    //   [log]   [S1/PL] pl_avg=107.02 lt_pl_spread=-57.41€/MWh (-53.6%)
    //   [log]   [S1] coupling_spread=9.32€/MWh intraday_swing=191.23€/MWh
    //   cpu=83ms wall=50017ms
    //
    // computeS1's OWN completion logs are in the same invocation as the timeout
    // that discarded it: the work finished, past the 30s wrapper, and the result
    // was thrown away. cpu 83ms against wall 50s says the invocation is I/O-bound
    // — it is waiting on connections, not computing. The pre-fix hypothesis was
    // ENTSO-E throttling computeS1's 9-request burst; that was tested from
    // outside and REFUTED (48/48 HTTP 200 across four rounds at 9- and
    // 15-request concurrency), so a per-leg retry alone would have left the cause
    // live and, under a timeout-bound failure, made it marginally worse.
    //
    // Five heavy computes share one invocation's connection budget, and the
    // hourly cron fires in the same second at every 4h-aligned hour (both
    // invocations stamped 12:00:33Z above; energy-charts returned HTTP 429 to
    // the hourly one). HYPOTHESIS, not measured here: the Workers per-invocation
    // simultaneous-connection cap queues ~20 fetches through far fewer slots,
    // and computeHistorical's four ~425 KB XML windows are the long poles. The
    // structural fix — staggering the block, or caching the historical windows
    // that change daily rather than 4-hourly — is filed as B-057, not attempted
    // here. Raising the budget is the change the evidence directly supports.
    const [s1Result, s2Result, s4Result, s3Result, eurResult] = await Promise.allSettled([
      withTimeout(computeS1(env),      60000),  // includes tomorrow fetch (+2 ENTSO-E calls)
      withTimeout(computeS2(),         45000),  // BTD API + Litgrid scrape
      withTimeout(computeS4(),         25000),
      withTimeout(computeS3(),         25000),
      withTimeout(computeEuribor(),    20000),
    ]);

    // ── S1 capture — computed FIRST, and unconditionally (Phase 38.1) ────────
    //
    // `computeCapture(env)` takes only `env`. It re-fetches its own source
    // (energy-charts.info) and has no data dependency whatsoever on computeS1's
    // ENTSO-E result. It nonetheless sat inside the `s1Result.status ===
    // 'fulfilled'` branch, for no reason but code position — so when computeS1
    // rejected on eight consecutive 4-hourly ticks (last successful S1-branch
    // write 2026-08-01T00:01:22Z, measured from `raw:s1:<date>` TTL arithmetic)
    // it took down a capture path that would have succeeded on every one of
    // them, and the S1 card served a 33h-stale hero number under an impact line
    // that said "today's".
    //
    // Hoisted out of that branch and above it. The result is merged into the s1
    // payload below when there is one; when there is not, `s1_capture` is still
    // written by computeCapture itself and `/read` serves it (see the /read
    // handler, which now always prefers the canonical key over the embedded copy).
    let capture = null;
    let captureErr = null;
    try {
      capture = await withTimeout(computeCapture(env), 25000);
      console.log(`[S1/capture] ok — ${capture.date} 2h=${capture.gross_2h ?? '—'}€ 4h=${capture.gross_4h ?? '—'}€`);
    } catch (capErr) {
      captureErr = String(capErr);
      console.error('[S1/capture] cron failed:', captureErr);
    }

    let s1Err = null;
    if (s1Result.status === 'fulfilled') {
      const d = s1Result.value;
      // Update rolling history and embed stats in S1 payload
      try {
        const history = await updateHistory(env, d);
        // Phase 38.2 — two series, two sources, deliberately. `spread_eur`
        // lives only here; `lt_swing` comes from the capture history, the one
        // writer that dedupes by MARKET date (rule #4, B-060).
        d.spread_stats_90d = rollingStats(history, 'spread_eur');
        d.swing_stats_90d  = rollingStats(await readSwingSeries(env), 'lt_swing');
        console.log(`[S1/history] rows=${history.length} spread_n=${d.spread_stats_90d?.n} spread_days=${d.spread_stats_90d?.days_of_data} swing_n=${d.swing_stats_90d?.n} swing_days=${d.swing_stats_90d?.days_of_data} spread_p50=${d.spread_stats_90d?.p50} swing_p50=${d.swing_stats_90d?.p50}`);
      } catch (he) {
        console.error('[S1/history] failed:', String(he));
      }
      // Capture summary embedded for frontend convenience. One write, not two —
      // the capture merge used to re-put `s1` a second time.
      if (capture) {
        d.capture = {
          gross_2h: capture.capture_2h?.gross_eur_mwh ?? null,
          gross_4h: capture.capture_4h?.gross_eur_mwh ?? null,
          net_2h:   capture.capture_2h?.net_eur_mwh   ?? null,
          net_4h:   capture.capture_4h?.net_eur_mwh   ?? null,
          rolling_30d: capture.rolling_30d,
          shape_swing: capture.shape?.swing ?? null,
          // Phase 39.2 — was the literal 'energy-charts.info' regardless of what
          // actually produced the day. With a fallback in the path a hardcoded
          // provenance label is rule #2's failure mode exactly: a claim about
          // where a number came from that was never computed from the number.
          source: capture.capture_source === 'entsoe-a44' ? 'ENTSO-E A44 (fallback)' : 'energy-charts.info',
          capture_source: capture.capture_source ?? null,
          data_class: 'derived',
        };
      }
      await env.KKME_SIGNALS.put('s1', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s1:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      console.log(`[S1] ${d.state} spread=${d.spread_eur_mwh}€/MWh swing=${d.lt_daily_swing_eur_mwh}€/MWh sep=${d.separation_pct}% rsi_30d=${d.rsi_30d}`);

      // Phase 36.C (B0-G) — feed the forecast path from the source that works.
      //
      // `GET /api/dispatch?mode=forecast` reads the `da_tomorrow` KV. That key
      // had only two writers, both fed by NordPool
      // (data.nordpoolgroup.com/api/v1/auction/prices/areas), which now returns
      // HTML rather than JSON — verified from two independent networks, so it is
      // an upstream endpoint change, not an egress problem. Meanwhile computeS1
      // was already computing tomorrow's day-ahead from ENTSO-E and storing it
      // at `s1.da_tomorrow`, a DIFFERENT key the forecast consumer never reads.
      //
      // So the working source and the starving consumer were one key apart.
      // Mirroring it here closes that gap and takes the forecast path off the
      // broken dependency entirely.
      if (d.da_tomorrow?.prices_24h?.length) {
        const daBody = JSON.stringify({ ...d.da_tomorrow, timestamp: new Date().toISOString(), source: 'entsoe-a44' });
        await Promise.all([
          env.KKME_SIGNALS.put('da_tomorrow', daBody),
          env.KKME_SIGNALS.put('da_tomorrow:lastgood', daBody),
        ]);
        console.log(`[S1/tomorrow] mirrored to da_tomorrow KV — ${d.da_tomorrow.slots} slots @ ${d.da_tomorrow.resolution}, delivery ${d.da_tomorrow.delivery_date}`);
      }
    } else {
      s1Err = String(s1Result.reason);
      console.error('[S1] cron failed:', s1Err);
    }

    // ── B8 — the failure that ran silent for a week now speaks on the tick ────
    //
    // Before Phase 38.1 an S1-branch rejection wrote `console.error` to a worker
    // with no observability configured, i.e. to nowhere, and `s1_capture` had no
    // staleness threshold. The eight-tick outage was found by the operator's eye
    // and by nothing else. `/health` now carries `s1_capture` (12h) so the
    // pull surface tells us within three ticks; this tells us on the failing
    // tick itself, on the same channel the S2 watchdog already uses.
    // Phase 39.2 — the same facts, routed through the transition machine so a
    // continuing failure stops re-sending, a CHANGED failure still speaks, and
    // a recovery produces a message. `capture` succeeding via the fallback is
    // an `ok` state that names the fallback: the operator needs to know the
    // number is being produced by the second source, but not at 03:00.
    const s1Degraded = Boolean(s1Err || captureErr);
    const lines = [
      s1Err      ? `• computeS1 rejected: ${s1Err.slice(0, 240)}` : '• computeS1: ok',
      captureErr ? `• computeCapture rejected: ${captureErr.slice(0, 240)}` : `• computeCapture: ok (source: ${capture?.capture_source ?? 'unknown'})`,
      s1Err ? '• knock-on: s1 / raw:s1 / da_tomorrow mirror all skipped this tick' : '',
    ].filter(Boolean);
    await alertTransition(env, 's1_cron', s1Degraded ? 'degraded' : 'ok', lines.join('\n')).catch(() => {});

    if (s2Result.status === 'fulfilled') {
      const payload = s2Result.value;
      if (!payload) {
        console.log('[S2] BTD unreachable from the CF edge — keeping cached KV (VPS leg serves)');
      } else {
        await s2CommitPayload(env, payload, 'worker-direct', 'S2');
      }
    } else {
      console.error('[S2] cron failed:', s2Result.reason);
    }

    if (s4Result.status === 'fulfilled') {
      const d = s4Result.value;
      await env.KKME_SIGNALS.put('s4', JSON.stringify(d));
      console.log(`[S4] ${d.signal} free=${d.free_mw}MW utilisation=${d.utilisation_pct}%`);
      await appendSignalHistory(env, 's4', { free_mw: d.free_mw }).catch(e => console.error('[S4/history]', e));
      await alertTransition(env, 's4_cron', 'ok', `S4 wrote free=${d.free_mw}MW`).catch(() => {});
    } else {
      // Phase 39.2 — S4 last wrote 2026-08-03T08:01:04Z and missed the 12:00Z
      // and 16:00Z ticks, while /health read `present · 8.5h · stale: false`
      // against a 24h threshold. Three ticks of silence fit inside the
      // threshold, so the staleness surface cannot see a same-day outage; only
      // the failing tick can report it, and it was reporting to console.error.
      console.error('[S4] cron failed:', s4Result.reason);
      await alertTransition(env, 's4_cron', 'degraded', `• computeS4 rejected: ${String(s4Result.reason).slice(0, 240)}`).catch(() => {});
    }

    // Phase 36.D — Litgrid publication tripwire. Rides the 4-hourly cron; the
    // weekly rate limit lives in the function, so this costs three HEAD-sized
    // fetches a week rather than three per tick.
    try {
      await withTimeout(checkLitgridPublications(env), 20000);
    } catch (e) {
      console.error('[litgrid-watch] cron failed:', String(e));
    }

    // Sync Litgrid Layer 3 Kaupikliai projects into fleet KV
    try {
      const sync = await withTimeout(syncLitgridFleet(env), 20000);
      console.log(`[S4/layer3] synced ${sync.synced} Kaupikliai projects, total fleet=${sync.total}, sd_ratio=${sync.sd_ratio}`);
    } catch (e) {
      console.error('[S4/layer3] cron failed:', String(e));
    }

    // Write s3 first, then merge euribor in a second write if both succeed
    if (s3Result.status === 'fulfilled') {
      const d = s3Result.value;
      await env.KKME_SIGNALS.put('s3', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s3:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      if (d.unavailable) {
        // Phase 39.2 — this branch has always existed and has never told anyone.
        // computeS3 catches its own failure and writes a payload marked
        // `unavailable`, which both keeps /health green (see the /health
        // handler) and logs to a console nobody reads. Live at 16:00:28Z on
        // 2026-08-03: `AbortError: The operation was aborted` — the 20s scrape
        // timeout — with the card serving its editorial fallback silently.
        console.error(`[S3] scrape failed: ${d._scrape_error}`);
        await alertTransition(env, 's3_scrape', 'degraded', [
          `• computeS3 scrape unavailable: ${String(d._scrape_error).slice(0, 200)}`,
          `• upstream: ${d._scrape_status != null ? `HTTP ${d._scrape_status}` : 'no status'} · ${d._scrape_ctype ?? 'no content-type'} · ${d._scrape_bytes ?? '?'}B`,
          '• card falls back to editorial ranges; the published number is not live',
        ].join('\n')).catch(() => {});
      } else {
        await alertTransition(env, 's3_scrape', 'ok', `S3 scrape live — lithium €${d.lithium_eur_t}/t`).catch(() => {});
        console.log(`[S3] ${d.signal} lithium=€${d.lithium_eur_t}/t trend=${d.lithium_trend} cell=${d.cell_eur_kwh ?? '—'} €/kWh`);
        // Track S3 freshness
        await updateS3Freshness(env.KKME_SIGNALS, 'lithium_proxy', { confidence: 'proxy' }).catch(() => {});
        await updateS3Freshness(env.KKME_SIGNALS, 'fx').catch(() => {});
      }
    } else {
      console.error('[S3] cron failed:', s3Result.reason);
    }

    if (eurResult.status === 'fulfilled') {
      const eur = eurResult.value;
      await env.KKME_SIGNALS.put('euribor', JSON.stringify(eur));
      console.log(`[Euribor] ${eur.euribor_3m}% trend=${eur.euribor_trend}`);
      // Track euribor freshness
      await updateS3Freshness(env.KKME_SIGNALS, 'ecb_euribor').catch(() => {});
      if (eur.hicp_yoy != null) await updateS3Freshness(env.KKME_SIGNALS, 'ecb_hicp').catch(() => {});
      // Merge euribor into s3 KV if s3 also succeeded
      if (s3Result.status === 'fulfilled') {
        const merged = { ...s3Result.value, euribor_3m: eur.euribor_3m, euribor_trend: eur.euribor_trend };
        await env.KKME_SIGNALS.put('s3', JSON.stringify(merged));
        await appendSignalHistory(env, 's3', { equip_eur_kwh: merged.europe_system_eur_kwh }).catch(e => console.error('[S3/history]', e));
      }
    } else {
      console.error('[Euribor] cron failed:', eurResult.reason);
    }

    // S5 — DC Power Viability (reads fresh S4 from KV + DC news RSS)
    const s5Data = await computeS5(env).catch(e => { console.error('[S5] cron:', String(e)); return null; });
    if (s5Data) {
      await env.KKME_SIGNALS.put('s5', JSON.stringify(s5Data));
      console.log(`[S5] ${s5Data.signal} free=${s5Data.grid_free_mw}MW news=${s5Data.news_items.length}`);
    }

    // S6-S9 + Baltic generation + genload — Context signals (best-effort, run in parallel)
    const [s6Res, s7Res, s8Res, s9Res, genRes, genloadRes] = await Promise.allSettled([
      withTimeout(fetchNordicHydro(),           20000),
      withTimeout(fetchTTFGas(),                20000),
      withTimeout(fetchInterconnectorFlows(env), 30000),
      withTimeout(fetchEUCarbon(env),           20000),
      withTimeout(fetchBalticGeneration(),      25000),
      withTimeout(fetchGenLoad(env.ENTSOE_API_KEY), 30000),
    ]);

    if (s6Res.status === 'fulfilled') {
      const d = s6Res.value;
      await env.KKME_SIGNALS.put('s6', JSON.stringify(d));
      console.log(`[S6] ${d.signal} fill=${d.fill_pct}% dev=${d.deviation_pp}pp week=${d.week}`);
      await appendSignalHistory(env, 's6', { fill_pct: d.fill_pct, deviation_pp: d.deviation_pp }).catch(e => console.error('[S6/history]', e));
    } else {
      console.error('[S6] cron failed:', s6Res.reason);
    }

    if (s7Res.status === 'fulfilled') {
      const d = s7Res.value;
      await env.KKME_SIGNALS.put('s7', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s7:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      console.log(`[S7] ${d.signal} ttf=${d.ttf_eur_mwh}€/MWh trend=${d.ttf_trend}`);
      await appendSignalHistory(env, 's7', { ttf_eur_mwh: d.ttf_eur_mwh }).catch(e => console.error('[S7/history]', e));
    } else {
      console.error('[S7] cron failed:', s7Res.reason);
    }

    if (s8Res.status === 'fulfilled') {
      const d = s8Res.value;
      await env.KKME_SIGNALS.put('s8', JSON.stringify(d));
      console.log(`[S8] ${d.signal} nordbalt=${d.nordbalt_avg_mw}MW litpol=${d.litpol_avg_mw}MW`);
    } else {
      console.error('[S8] cron failed:', s8Res.reason);
    }

    if (s9Res.status === 'fulfilled') {
      const d = s9Res.value;
      await env.KKME_SIGNALS.put('s9', JSON.stringify(d));
      console.log(`[S9] ${d.signal} eua=${d.eua_eur_t}€/t trend=${d.eua_trend}`);
      await appendSignalHistory(env, 's9', { eua_eur_t: d.eua_eur_t }).catch(e => console.error('[S9/history]', e));
    } else {
      console.error('[S9] cron failed:', s9Res.reason);
    }

    // Baltic generation (wind + solar + load) — writes 3 KV keys
    if (genRes.status === 'fulfilled') {
      const { wind, solar, load } = genRes.value;
      await Promise.all([
        env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
        env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
        env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
      ]);
      console.log(`[Gen] wind=${wind.baltic_mw}MW solar=${solar.baltic_mw}MW load=${load.baltic_mw}MW [${wind.coverage_countries}]`);
    } else {
      console.error('[Gen] cron failed:', genRes.reason);
    }

    // Genload (ENTSO-E A75+A65 per Baltic country)
    if (genloadRes.status === 'fulfilled') {
      const d = genloadRes.value;
      await env.KKME_SIGNALS.put('genload', JSON.stringify(d));
      console.log(`[Genload] lt=${d.lt?.generation_mw}/${d.lt?.load_mw} lv=${d.lv?.generation_mw}/${d.lv?.load_mw} ee=${d.ee?.generation_mw}/${d.ee?.load_mw}`);
    } else {
      console.error('[Genload] cron failed:', genloadRes.reason);
    }

    // da_tomorrow is embedded in computeS1() and stored in the s1 KV key

    // ── Weekly S3 enrichment (Sunday 06:00-10:00 UTC) ──
    const nowUTC = new Date();
    if (nowUTC.getUTCDay() === 0 && nowUTC.getUTCHours() >= 6 && nowUTC.getUTCHours() < 10) {
      const freshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
      const lastEnrich = freshness.enrichment?.last_update;
      const hoursSince = lastEnrich ? (Date.now() - new Date(lastEnrich).getTime()) / 3600000 : 999;
      if (hoursSince > 160) { // ~6.7 days
        console.log('[S3/enrichment] Running weekly enrichment...');
        await enrichS3(env).catch(e => console.error('[S3/enrichment] failed:', e));
      }
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Fleet-console preflight, BEFORE the general one so it wins for /fleet/*.
    // The shared CORS constant does not allow `Authorization`, so a browser would
    // refuse to send the bearer token cross-origin. Scoping the wider allow-list to
    // these paths keeps every existing route's CORS behaviour byte-identical.
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/fleet/')) {
      return new Response(null, { status: 200, headers: FLEET_CORS });
    }

    // B-045 — bearer-reading routes, likewise before the general preflight.
    if (request.method === 'OPTIONS' && AUTH_PREFLIGHT_PATHS.has(url.pathname)) {
      return new Response(null, { status: 200, headers: AUTH_CORS });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    // ── POST /telegram/webhook ───────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      let body;
      try { body = await request.json(); } catch { return new Response('ok', { headers: CORS }); }

      const msg = body?.message;
      if (!msg) return new Response('ok', { headers: CORS });

      const chatId     = String(msg.chat?.id ?? '');
      const ownChatId  = env.TELEGRAM_CHAT_ID;
      if (!ownChatId || chatId !== String(ownChatId)) return new Response('ok', { headers: CORS });

      const text  = msg.text ?? '';
      const lower = text.toLowerCase().trim();

      // ── Commands ─────────────────────────────────────────────────────────
      if (lower === '/status' || lower === '/status@gattana_bot') {
        const keys = ['s1', 's2', 's3', 's4'];
        const statLines = ['KKME Status (all Workers cron):'];
        for (const k of keys) {
          const raw = await env.KKME_SIGNALS.get(k).catch(() => null);
          if (!raw) { statLines.push(`${k.toUpperCase()}: no data`); continue; }
          try {
            const d = JSON.parse(raw);
            const ts = d.timestamp ?? d._meta?.written_at ?? d.updated_at;
            const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : null;
            const threshold = STALE_THRESHOLDS_HOURS[k] ?? 48;
            const stale = ageH !== null && ageH > threshold;
            const age = ageH !== null ? ageH.toFixed(1) : '?';
            statLines.push(`${k.toUpperCase()}: ${age}h old${stale ? ' ⚠️ STALE' : ''}`);
          } catch { statLines.push(`${k.toUpperCase()}: parse error`); }
        }
        // s4_pipeline (VERT.lt monthly — still local, acceptable staleness)
        const pipeRaw = await env.KKME_SIGNALS.get('s4_pipeline').catch(() => null);
        if (pipeRaw) {
          try {
            const d = JSON.parse(pipeRaw);
            const ts = d.timestamp ?? d.updated_at;
            const age = ts ? ((Date.now() - new Date(ts).getTime()) / 3600000).toFixed(0) : '?';
            statLines.push(`S4_PIPELINE: ${age}h old (monthly/local)`);
          } catch { /* ignore */ }
        }
        await sendTelegramReply(env, chatId, statLines.join('\n'));
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/validate' || lower === '/validate@gattana_bot') {
        const s4raw = await env.KKME_SIGNALS.get('s4').catch(() => null);
        const s4d   = s4raw ? JSON.parse(s4raw).pipeline ?? {} : {};
        const lines = ['Validation:'];
        lines.push(`S4 parse_warning: ${s4d.parse_warning ?? 'none'}`);
        lines.push(`S4 dev_total_mw: ${s4d.dev_total_mw ?? '—'}`);
        await sendTelegramReply(env, chatId, lines.join('\n'));
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/help' || lower === '/help@gattana_bot') {
        await sendTelegramReply(env, chatId,
          '/status — signal ages\n' +
          '/validate — S4 pipeline check\n' +
          '/done — save current session to Intel Feed\n' +
          '/cancel — discard current session\n' +
          '/tag <company> — add company to session\n' +
          'Send any URL or text to start/extend a feed session (auto-saved in 30 min)');
        return new Response('ok', { headers: CORS });
      }

      // ── Session commands ──────────────────────────────────────────────────
      if (lower === '/done' || lower === '/done@gattana_bot') {
        const item = await finalizeFeedSession(env.KKME_SIGNALS, env);
        if (!item) {
          await sendTelegramReply(env, chatId, 'No active session. Send a URL or text first.');
        } else {
          const cos = item.companies?.length ? `\n🏷 ${item.companies.join(', ')}` : '';
          await sendTelegramReply(env, chatId, `✅ Saved [${item.topic}] ${(item.title ?? '').slice(0, 50)}${cos}\nID ${item.id.slice(-6)}`);
        }
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/cancel' || lower === '/cancel@gattana_bot') {
        await env.KKME_SIGNALS.delete(SESSION_KEY).catch(() => {});
        await sendTelegramReply(env, chatId, '🗑 Session discarded.');
        return new Response('ok', { headers: CORS });
      }

      if (lower.startsWith('/tag ')) {
        const company = text.slice(5).trim();
        const raw     = await env.KKME_SIGNALS.get(SESSION_KEY).catch(() => null);
        if (!raw) {
          await sendTelegramReply(env, chatId, 'No active session to tag.');
        } else {
          const session = JSON.parse(raw);
          session.companies = [...new Set([...session.companies, company])];
          await env.KKME_SIGNALS.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
          await sendTelegramReply(env, chatId, `🏷 Tagged: ${company}. Companies: ${session.companies.join(', ')}`);
        }
        return new Response('ok', { headers: CORS });
      }

      // ── Filter unrecognised bot commands ──────────────────────────────────
      if (/^\/\w+/.test(text)) {
        await sendTelegramReply(env, chatId, 'Unknown command. Use /done to save, /cancel to discard, /tag <company> to tag.');
        return new Response('ok', { headers: CORS });
      }

      // Filter empty / too-short messages
      if (text.trim().length < 20) {
        await sendTelegramReply(env, chatId, '⚠ Message too short (min 20 chars). Send a URL or a brief description.');
        return new Response('ok', { headers: CORS });
      }

      // ── URL or text → Session-based Intel Feed intake ─────────────────────
      const existingSession = await env.KKME_SIGNALS.get(SESSION_KEY).catch(() => null);

      if (!existingSession) {
        // Open new session
        const session = await openFeedSession(env.KKME_SIGNALS, chatId, text);
        const cos = session.companies.length ? `\n🏷 ${session.companies.join(', ')}` : '';
        await sendTelegramReply(env, chatId, `📝 Session open [${session.topic}]${cos}\nSend more, /done to save, /cancel to discard. (30 min auto-expire)`);
      } else {
        // Append to existing session
        const session = await appendToSession(env.KKME_SIGNALS, text);
        if (!session) {
          // Race condition — session expired between the get and append
          await openFeedSession(env.KKME_SIGNALS, chatId, text);
          await sendTelegramReply(env, chatId, `📝 New session started [${classifyTopic(text)}]. Previous session expired.`);
        } else {
          const cos = session.companies.length ? `\n🏷 ${session.companies.join(', ')}` : '';
          await sendTelegramReply(env, chatId, `➕ Added (${session.messages.length} msgs) [${session.topic}]${cos}`);
        }
      }
      return new Response('ok', { headers: CORS });
    }

    // ── GET /telegram/test ───────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/telegram/test') {
      await notifyTelegram(env, 'KKME: Telegram connected ✓');
      return Response.json({ sent: true }, { headers: CORS });
    }

    // ── GET /feed ────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/feed') {
      const category = url.searchParams.get('category');
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      // Quality + expiry filters
      idx = idx.filter(isValidFeedItem);
      const now = new Date().toISOString();
      idx = idx.filter(i => !i.expires_at || i.expires_at > now);
      if (category && category !== 'all') idx = idx.filter(i => i.category === category);
      // Sort by feed_score desc, then date
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0) || (b.published_at ?? '').localeCompare(a.published_at ?? ''));
      const items = idx.slice(0, 50);
      const categories = [...new Set(idx.map(i => i.category).filter(Boolean))];
      return Response.json({ items, total: idx.length, categories }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    // ── POST /feed/events — accept typed event items ─────────────────────────
    // Phase 48: UPDATE_SECRET-gated. The one live caller (daily_intel.py, VPS
    // 07:30 UTC) already sent X-Update-Secret before this gate existed — the
    // worker simply ignored it — so gating breaks no ingestion path.
    if (request.method === 'POST' && url.pathname === '/feed/events') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const rawBody = await request.text().catch(() => null);
      // A bare array of items is a legitimate shape here, unlike /feed/clean.
      const parsed = parseJsonBody(rawBody, { allowArray: true });
      if (!parsed.ok) return jsonResp({ error: parsed.error }, 400);
      const body = parsed.body;
      const items = Array.isArray(body) ? body : body.items || [body];
      if (!Array.isArray(items) || !items.length) {
        return jsonResp({ error: 'No items provided' }, 400);
      }

      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      const existingUrls = new Set(idx.map(i => i.source_url || i.url).filter(Boolean));
      const existingTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));

      let added = 0;
      let rejected = 0;
      for (const item of items) {
        if (!item.title || !item.consequence) continue;
        // Deduplicate by URL or exact title match
        if (item.source_url && existingUrls.has(item.source_url)) continue;
        if (existingTitles.has((item.title || '').toLowerCase().trim())) continue;

        const EXPIRY_DAYS = { commodity_cost: 30, project_stage: 180, market_design: 180, policy: 180 };
        const pubDate = item.published_at || new Date().toISOString();
        const expiryDays = EXPIRY_DAYS[item.category] || 60;
        const expiresAt = item.expires_at || new Date(new Date(pubDate).getTime() + expiryDays * 86400000).toISOString();
        // Phase 4F: gate at KV-write time. Rejected items are still appended
        // with status='rejected' so /feed/rejections can audit, but they are
        // filtered out at /feed read time and never appear on the homepage.
        const gate = evaluateFeedItemGates(item.source, item.source_url, item.title, item.consequence);
        const entry = {
          id: item.event_id || makeId(),
          title: item.title,
          consequence: item.consequence,
          event_type: item.event_type || null,
          category: item.category || 'policy',
          geography: item.geography || 'Baltic',
          published_at: pubDate,
          source: item.source || '',
          source_url: item.source_url || null,
          source_quality: item.source_quality || 'trade_press',
          confidence: item.confidence || 'C',
          horizon: item.horizon || 'near_term',
          impact_direction: item.impact_direction || null,
          affected_modules: item.affected_modules || [],
          affected_cod_windows: item.affected_cod_windows || [],
          feed_score: gate.ok
            ? (typeof item.feed_score === 'number' ? item.feed_score : 0.5)
            : 0,
          expires_at: expiresAt,
          status: gate.ok ? (item.status || 'published') : 'rejected',
          source_tier: gate.tier,
          topic_score: gate.score,
        };
        if (!gate.ok) entry.rejection_reason = gate.reason;
        idx.push(entry);
        existingUrls.add(item.source_url);
        existingTitles.add((item.title || '').toLowerCase().trim());
        if (gate.ok) added++; else rejected++;
      }

      // Sort by feed_score descending
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      // Cap at 100 items
      if (idx.length > 100) idx = idx.slice(0, 100);

      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(idx));
      return jsonResp({ ok: true, added, rejected, total: idx.length });
    }

    // ── POST /feed/backfill-curations — one-time migration: write-time merge ─
    // Phase 48: UPDATE_SECRET-gated. Takes no parameters, so body validation
    // here means an absent body is fine but a malformed one is a 400 — never a
    // silent fall-through into the KV write below.
    if (request.method === 'POST' && url.pathname === '/feed/backfill-curations') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const rawBody = await request.text().catch(() => null);
      const parsed = parseJsonBody(rawBody, { allowArray: true, allowEmpty: true });
      if (!parsed.ok) return jsonResp({ error: parsed.error }, 400);
      const ids = await readIndex(env.KKME_SIGNALS);
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      const idx = rawIdx ? JSON.parse(rawIdx) : [];
      const seenUrls = new Set(idx.map(i => i.source_url).filter(Boolean));
      const seenTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));
      let backfilled = 0;
      for (const id of ids) {
        const raw = await env.KKME_SIGNALS.get(`${KV_CURATION_PREFIX}${id}`);
        if (!raw) continue;
        let entry;
        try { entry = JSON.parse(raw); } catch { continue; }
        const item = projectCurationToFeedItem(entry);
        if (!item) continue;
        if (item.source_url && seenUrls.has(item.source_url)) continue;
        if (seenTitles.has((item.title || '').toLowerCase().trim())) continue;
        idx.push(item);
        seenUrls.add(item.source_url);
        seenTitles.add((item.title || '').toLowerCase().trim());
        backfilled++;
      }
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      if (idx.length > 1000) idx.length = 1000;
      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(idx));
      return jsonResp({ backfilled, total: idx.length });
    }

    // ── POST /feed/purge-irrelevant — Phase 4F backfill: re-evaluate feed_index ─
    // Soft-delete sweep. Items failing the new quality gates are flipped to
    // status='rejected' + rejection_reason and stay in feed_index for audit
    // (visible at GET /feed/rejections). Read path filters status==='published'
    // so this purge produces the cleaning effect on /feed without losing the
    // audit trail. Operator-triggered post-deploy with x-update-secret.
    if (request.method === 'POST' && url.pathname === '/feed/purge-irrelevant') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      const idx = rawIdx ? JSON.parse(rawIdx) : [];
      const before = idx.length;
      const purgedSample = [];
      let purgedCount = 0;
      let alreadyRejected = 0;
      const updated = idx.map(item => {
        if (item.status === 'rejected') { alreadyRejected++; return item; }
        const gate = evaluateFeedItemGates(item.source, item.source_url, item.title, item.consequence);
        if (gate.ok) {
          // Annotate published items with tier/score for telemetry — purely additive.
          return { ...item, status: 'published', source_tier: gate.tier, topic_score: gate.score };
        }
        purgedCount++;
        if (purgedSample.length < 30) {
          purgedSample.push({
            title: (item.title || '').slice(0, 200),
            source: item.source || null,
            url: item.source_url || null,
            reason: gate.reason,
          });
        }
        return {
          ...item,
          status: 'rejected',
          rejection_reason: gate.reason,
          source_tier: gate.tier,
          topic_score: gate.score,
          feed_score: 0,
        };
      });
      // Sort: published first (by feed_score desc), rejected last.
      updated.sort((a, b) => {
        const aPub = (a.status || 'published') === 'published' ? 1 : 0;
        const bPub = (b.status || 'published') === 'published' ? 1 : 0;
        if (aPub !== bPub) return bPub - aPub;
        return (b.feed_score ?? 0) - (a.feed_score ?? 0);
      });
      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(updated));
      const remainingPublished = updated.filter(i => (i.status || 'published') === 'published').length;
      return jsonResp({
        ok: true,
        before,
        after: updated.length,
        purged_count: purgedCount,
        already_rejected: alreadyRejected,
        remaining_published: remainingPublished,
        purged_sample: purgedSample,
      });
    }

    // ── POST /feed/delete-by-id ──────────────────────────────────────────────
    // Operator-triggered hard removal of a specific feed_index entry by id.
    // Sister of /feed/purge-irrelevant: that one re-runs the gates as a sweep;
    // this one targets a single id for one-off removal of items that pass
    // every existing gate but are still wrong (e.g. hallucinated entities a
    // human verifier identifies). UPDATE_SECRET-gated. Removed titles are
    // returned in the response so the caller can preserve an audit trail.
    if (request.method === 'POST' && url.pathname === '/feed/delete-by-id') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      let body;
      try { body = await request.json(); } catch {
        return jsonResp({ error: 'invalid JSON body' }, 400);
      }
      const targetId = body.id;
      if (!targetId || typeof targetId !== 'string') {
        return jsonResp({ error: 'id (string) required in body' }, 400);
      }
      const reason = typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'operator-removed';

      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      if (!rawIdx) return jsonResp({ error: 'feed_index empty' }, 404);
      const idx = JSON.parse(rawIdx);
      const before = idx.length;
      const removed = idx.filter(item => item && item.id === targetId);
      const kept = idx.filter(item => !item || item.id !== targetId);

      if (removed.length === 0) {
        return jsonResp({ error: `no entry with id '${targetId}'`, before, after: kept.length }, 404);
      }

      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(kept));
      console.log(`[Feed/delete] removed ${removed.length} entry/entries with id '${targetId}', reason: ${reason}`);

      return jsonResp({
        ok: true,
        removed_count: removed.length,
        removed_titles: removed.map(r => (r.title || '').slice(0, 200) || null),
        before,
        after: kept.length,
        reason,
      });
    }

    // ── GET /feed/rejections — Phase 4F audit trail of soft-deleted items ─────
    // UPDATE_SECRET-gated: rejection records may include source URLs that are
    // not yet publishable. Returns the most recent N rejected items with
    // reason, source, title, logged_at. Operator curls weekly to tune the
    // keyword set and denylist.
    if (request.method === 'GET' && url.pathname === '/feed/rejections') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      const idx = rawIdx ? JSON.parse(rawIdx) : [];
      const rejected = idx
        .filter(i => i && i.status === 'rejected')
        .map(i => ({
          id: i.id || null,
          title: (i.title || '').slice(0, 200),
          source: i.source || null,
          source_url: i.source_url || null,
          source_tier: i.source_tier || null,
          topic_score: i.topic_score ?? null,
          rejection_reason: i.rejection_reason || null,
          published_at: i.published_at || null,
        }))
        .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
        .slice(0, limit);
      const reasonCounts = {};
      for (const r of rejected) {
        const key = (r.rejection_reason || 'unknown').split('(')[0];
        reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
      }
      return jsonResp({ rejected, total_rejected: rejected.length, reason_counts: reasonCounts });
    }

    // ── POST /feed/clean — remove expired/old + low-quality items ───────────
    // Phase 48. This route was unauthenticated, remote and destructive: it took
    // a caller-supplied `before`, kept only items at or after it, and wrote the
    // result straight to feed_index — so `{"before":"2099-01-01"}` emptied the
    // published intel feed. Four changes, in this order:
    //   1. UPDATE_SECRET, the same gate /feed/purge-irrelevant already uses.
    //   2. `before` is required and explicitly validated; a malformed body is a
    //      400, never a fall-through to a default that deletes.
    //   3. A future `before` is refused — it can only mean "remove everything".
    //   4. Removing more than FEED_CLEAN_MAX_REMOVED_FRACTION needs `confirm`.
    // Every invocation is logged with its parameters and resulting counts.
    if (request.method === 'POST' && url.pathname === '/feed/clean') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const rawBody = await request.text().catch(() => null);
      const parsed = parseJsonBody(rawBody);
      if (!parsed.ok) return jsonResp({ error: parsed.error }, 400);
      const params = validateFeedCleanParams(parsed.body, new Date().toISOString());
      if (!params.ok) return jsonResp({ error: params.error }, 400);

      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      if (!rawIdx) return jsonResp({ cleaned: 0, remaining: 0 });
      const idx = JSON.parse(rawIdx);
      const kept = idx.filter(i => {
        if (!isValidFeedItem(i)) return false;
        const d = i.published_at || i.date || i.added_at || '';
        return d >= params.before;
      });
      const cleaned = idx.length - kept.length;

      const blast = feedCleanBlastRadius(idx.length, cleaned, params.confirm);
      if (!blast.ok) {
        console.log(`[feed/clean] REFUSED before=${params.before} confirm=${params.confirm} `
          + `total=${idx.length} would_clean=${cleaned} fraction=${blast.fraction.toFixed(3)}`);
        return jsonResp({
          error: blast.error,
          would_clean: cleaned,
          total: idx.length,
          fraction: Number(blast.fraction.toFixed(4)),
        }, 409);
      }

      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(kept));
      console.log(`[feed/clean] OK before=${params.before} confirm=${params.confirm} `
        + `total=${idx.length} cleaned=${cleaned} remaining=${kept.length}`);
      return jsonResp({ cleaned, remaining: kept.length });
    }

    // ── GET /feed/by-signal?signal=S2 — filter feed by affected module ─────
    if (request.method === 'GET' && url.pathname === '/feed/by-signal') {
      const signal = url.searchParams.get('signal');
      if (!signal) return jsonResp({ error: 'signal parameter required' }, 400);
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      const now = new Date().toISOString();
      idx = idx.filter(i => !i.expires_at || i.expires_at > now);
      // Phase 4F: exclude soft-deleted items from signal-scoped feed too.
      idx = idx.filter(i => i && i.status !== 'rejected');
      const sigUpper = signal.toUpperCase();
      const matched = idx.filter(i =>
        Array.isArray(i.affected_modules) &&
        i.affected_modules.some(m => m.toUpperCase() === sigUpper)
      );
      matched.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      return Response.json({ items: matched.slice(0, 10), total: matched.length, signal }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    // ── GET /feed/:id ────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname.startsWith('/feed/')) {
      const id  = url.pathname.slice(6);
      const raw = await env.KKME_SIGNALS.get(`feed_${id}`).catch(() => null);
      if (!raw) return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
      return Response.json(JSON.parse(raw), { headers: CORS });
    }

    // ── POST /s2/fleet OR /s4/fleet — fleet data (migrating from S2 to S4) ──
    // Replace the full fleet dataset. Body: { entries: [...], demand: { eff_demand_mw } }
    if (request.method === 'POST' && (url.pathname === '/s2/fleet' || url.pathname === '/s4/fleet')) {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const { entries: rawEntries, demand } = body;
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) return jsonResp({ error: 'entries array required' }, 400);
      // Phase 33.A.2 (W1a): apply the operator operational-confirmation allowlist
      // BEFORE the gate. Flips known-commissioned projects announced→operational,
      // corrects MW, and (W3) records feed/operator MW disagreement. Must run
      // before filterFleetEntries: the flip sets operational status, which the
      // C-01 gate would reject without the operational-evidence source the
      // allowlist attaches.
      const { flipped } = applyKnownOperational(rawEntries);
      if (flipped.length) {
        console.log(`[fleet/known-operational] flipped ${flipped.length}:`, JSON.stringify(flipped));
      }
      // Phase 33.A.2.b (W2-curated): inject the curated LV operational fleet
      // (Targale, AJ Power, Rēzekne, Tume) when absent. Also runs before the gate
      // so the injected operational entries carry C-01-satisfying sources.
      const { injected } = injectCuratedFleet(rawEntries);
      if (injected.length) {
        console.log(`[fleet/curated-inject] injected ${injected.length}:`, JSON.stringify(injected));
      }
      // Phase 33.A.2.b (W4): merge operator manual additions (persisted in KV) so
      // they survive kkme_sync's full-replace. Same pre-gate placement.
      let manualList = [];
      try { manualList = JSON.parse((await env.KKME_SIGNALS.get('s4_manual_additions')) || '[]'); } catch { manualList = []; }
      const { merged } = injectManualAdditions(rawEntries, manualList);
      if (merged.length) {
        console.log(`[fleet/manual-additions] merged ${merged.length}:`, JSON.stringify(merged));
      }
      // Phase 33.A: gate at the last hop before the public map. Drop non-Baltic
      // + HIGH-flag entries per-entry; never 400 the whole batch (kkme_sync POSTs
      // batched — a few polluters shouldn't reject the rest).
      const { accepted: entries, dropped } = filterFleetEntries(rawEntries);
      const droppedNonBaltic = dropped.filter(d => d.reason === 'non_baltic').length;
      const droppedFlagged   = dropped.filter(d => d.reason === 'high_severity_flag').length;
      if (dropped.length) {
        console.log(`[fleet/allowlist] dropped ${droppedNonBaltic} non-Baltic + ${droppedFlagged} HIGH-flag of ${rawEntries.length}:`, JSON.stringify(dropped.slice(0, 5)));
      }
      // All entries rejected → refuse rather than overwrite KV with an empty fleet.
      if (entries.length === 0) return jsonResp({ error: 'all entries rejected by allowlist/flags', dropped_non_baltic: droppedNonBaltic, dropped_flagged: droppedFlagged }, 400);
      const fleet = processFleet(entries, demand ?? null);
      fleet.raw_entries = entries;
      // Phase 36.D — this used to write `{ eff_demand_mw: 935 }` when the caller
      // sent no demand. Nothing read it here (processFleet had its own default of
      // 752), but syncLitgridFleet and the single-entry upsert read it BACK and
      // passed it into processFleet — promoting a cosmetic default into the
      // arithmetic and making the published S/D oscillate 3.17x <-> 2.55x on cron
      // order. Now null means null: processFleet falls through to the canonical
      // module, and only a genuine operator override is ever persisted.
      fleet.demand      = demand ?? null;
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),  // backward compat
      ]);
      console.log(`[S4/fleet] seeded n=${entries.length} (dropped ${dropped.length}) sd_ratio=${fleet.sd_ratio} phase=${fleet.phase}`);
      return jsonResp({ ok: true, accepted: entries.length, flipped_operational: flipped.length, injected_curated: injected.length, merged_manual: merged.length, dropped_non_baltic: droppedNonBaltic, dropped_flagged: droppedFlagged, sd_ratio: fleet.sd_ratio, phase: fleet.phase, n: entries.length });
    }

    // ── POST /s2/fleet/entry OR /s4/fleet/entry — single entry upsert ──
    if (request.method === 'POST' && (url.pathname === '/s2/fleet/entry' || url.pathname === '/s4/fleet/entry')) {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!body.name || !body.mw || !body.status) return jsonResp({ error: 'name, mw, status required' }, 400);
      const raw     = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
                   || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      const current = raw ? JSON.parse(raw) : { raw_entries: [], demand: null };
      const entries = current.raw_entries ?? [];
      const idx     = entries.findIndex(e => e.name === body.name);
      if (idx >= 0) entries[idx] = body; else entries.push(body);
      const fleet = processFleet(entries, current.demand);
      fleet.raw_entries = entries;
      fleet.demand      = current.demand;
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),  // backward compat
      ]);
      return jsonResp({ ok: true, sd_ratio: fleet.sd_ratio, phase: fleet.phase, n: entries.length });
    }

    // ── POST /admin/add-fleet-entry — Phase 33.A.2.b (W4) manual safety valve ──
    // Operator-curated add for projects the curated list + upstream feeds miss.
    // Persists to the s4_manual_additions KV (re-merged on every POST /s2/fleet so
    // it survives kkme_sync full-replace) AND re-applies to the stored fleet now so
    // it shows immediately. UPDATE_SECRET-gated; BALTIC_COUNTRIES-enforced; an
    // operational entry must carry C-01 (TSO/operational) source evidence.
    if (request.method === 'POST' && url.pathname === '/admin/add-fleet-entry') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!body.name || !body.mw || !body.status || !body.country) return jsonResp({ error: 'name, mw, status, country required' }, 400);
      if (!BALTIC_COUNTRIES.has(body.country)) return jsonResp({ error: `country must be one of ${[...BALTIC_COUNTRIES].join('/')}`, got: body.country }, 400);
      // Honesty gate: operational entries must carry source evidence the C-01 gate
      // will accept, else they'd be silently dropped at the next /s2/fleet ingest.
      if ((body.status === 'operational' || body.status === 'commissioned')
          && !(body.source && /TSO|Litgrid|Elering|AST|operational|energis|grid permit/i.test(body.source))) {
        return jsonResp({ error: 'operational entry requires a source containing TSO/operational evidence (rule #3)' }, 400);
      }
      const entry = {
        id: body.id || `${normName(body.name).replace(/\s+/g, '-')}-${body.country.toLowerCase()}`,
        name: body.name, mw: Number(body.mw), mwh: body.mwh != null ? Number(body.mwh) : Number(body.mw) * 2,
        status: body.status, cod: body.cod || '', country: body.country, tso: body.tso || null,
        source: body.source || 'operator manual add', source_url: body.source_url || '',
        confidence: body.confidence || 'probable', ...(body.type ? { type: body.type } : {}),
      };
      // 1. Persist to the manual-additions KV (upsert by id).
      let manualList = [];
      try { manualList = JSON.parse((await env.KKME_SIGNALS.get('s4_manual_additions')) || '[]'); } catch { manualList = []; }
      const mi = manualList.findIndex(m => m.id === entry.id);
      if (mi >= 0) manualList[mi] = entry; else manualList.push(entry);
      await env.KKME_SIGNALS.put('s4_manual_additions', JSON.stringify(manualList));
      // 2. Re-apply to the stored fleet now so it surfaces immediately.
      const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
               || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      const current = raw ? JSON.parse(raw) : { raw_entries: [], demand: null };
      const entries = current.raw_entries ?? [];
      injectManualAdditions(entries, manualList);
      const { accepted } = filterFleetEntries(entries);
      const fleet = processFleet(accepted, current.demand);
      fleet.raw_entries = accepted;
      fleet.demand = current.demand;
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),
      ]);
      console.log(`[admin/add-fleet-entry] ${entry.id} (${entry.country} ${entry.mw}MW ${entry.status}); manual list n=${manualList.length}`);
      return jsonResp({ ok: true, entry, manual_total: manualList.length, fleet_n: accepted.length, sd_ratio: fleet.sd_ratio });
    }

    // ── GET /s2/fleet OR /s4/fleet — fleet data ──
    if (request.method === 'GET' && (url.pathname === '/s2/fleet' || url.pathname === '/s4/fleet')) {
      const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
              || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      if (!raw) return jsonResp({ fleet: null, reason: 'Fleet data not yet computed — awaiting daily entity-resolver run' }, 200);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
    }

    // ── POST /admin/purge-non-baltic-fleet — Phase 33.A one-shot cleanup ──
    // Retroactively removes non-Baltic (ESN international pollution) entries from
    // the stored fleet, then recomputes aggregates from the survivors. Idempotent:
    // re-running after a clean purge returns { purged: 0 }.
    if (request.method === 'POST' && url.pathname === '/admin/purge-non-baltic-fleet') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
               || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      if (!raw) return jsonResp({ error: 'No fleet data' }, 404);
      const current = JSON.parse(raw);
      const entries = current.raw_entries ?? [];
      const kept = entries.filter(e => BALTIC_COUNTRIES.has(e.country));
      const purgedCount = entries.length - kept.length;
      if (purgedCount === 0) return jsonResp({ purged: 0, remaining: entries.length });
      const samplePurged = entries
        .filter(e => !BALTIC_COUNTRIES.has(e.country))
        .slice(0, 5)
        .map(e => ({ id: e.id, name: e.name, country: e.country ?? null }));
      const fleet = processFleet(kept, current.demand);
      fleet.raw_entries = kept;
      fleet.demand      = current.demand;
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),  // backward compat
      ]);
      console.log(`[admin/purge-non-baltic] purged=${purgedCount} remaining=${kept.length}`);
      return jsonResp({ purged: purgedCount, remaining: kept.length, sample_purged: samplePurged });
    }

    // ── GET /admin/capacity-watch?days=N — Phase 33.B.3 ──────────────────────
    // Returns the last N daily capacity-watch summaries (oldest first) for the
    // 33.B.2 capacity-basis review. Auth via X-Update-Secret like other /admin/*.
    if (request.method === 'GET' && url.pathname === '/admin/capacity-watch') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get('days')) || 14));
      const todayMs = Date.now();
      const keys = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayMs - i * 86400000).toISOString().slice(0, 10);
        keys.push('s2_capacity_watch:' + d);
      }
      const raws = await Promise.all(keys.map(k => env.KKME_SIGNALS.get(k).catch(() => null)));
      const summaries = raws.map(r => { try { return r ? JSON.parse(r) : null; } catch { return null; } }).filter(Boolean);
      return jsonResp({ days_requested: days, days_returned: summaries.length, summaries });
    }

    // ── POST /s4/migrate-fleet — one-time migration from s2_fleet → s4_fleet ──
    if (request.method === 'POST' && url.pathname === '/s4/migrate-fleet') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const s2f = await env.KKME_SIGNALS.get('s2_fleet').catch(() => null);
      if (s2f) {
        await env.KKME_SIGNALS.put('s4_fleet', s2f);
        return jsonResp({ status: 'migrated', bytes: s2f.length });
      }
      return jsonResp({ status: 'no s2_fleet data to migrate' });
    }

    // ── POST /s2/activation ─────────────────────────────────────────────────
    // Store Baltic activation clearing-price dataset (from BTD transparency dashboard).
    if (request.method === 'POST' && url.pathname === '/s2/activation') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!body.countries) return jsonResp({ error: 'countries object required' }, 400);
      body.stored_at = new Date().toISOString();
      await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(body));
      const countryKeys = Object.keys(body.countries);
      console.log(`[S2/activation] stored ${countryKeys.length} countries: ${countryKeys.join(', ')}`);
      return jsonResp({ ok: true, countries: countryKeys, stored_at: body.stored_at });
    }

    // ── POST /admin/trigger-activation — manually trigger activation update ──
    if (request.method === 'POST' && url.pathname === '/admin/trigger-activation') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const payload = await computeS2Activation();
      if (!payload) return jsonResp({ error: 'BTD unavailable' }, 502);
      await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(payload));
      return jsonResp({ ok: true, period: payload.period, lt_afrr_3m_p50: payload.countries?.Lithuania?.afrr_recent_3m?.avg_p50 });
    }

    // ── Phase 37.A — private fleet-intel overlay (fleet_private:*) ──────────────
    // The operator's pipeline table: contacts, deal comments, unverified testimony.
    // NEVER served on a public route, NEVER merged into s4_fleet. Both endpoints are
    // UPDATE_SECRET-gated and the GET returns 401 without it — there is no public
    // tier here at all, unlike the calculator's sample tier.
    //
    // A7: writers of fleet_private:* = this endpoint only. Readers = the GET below
    // and (from 37.C) the authed CRM route. Nothing else in the worker touches it.
    if (request.method === 'POST' && url.pathname === '/admin/fleet-private') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!Array.isArray(body.rows)) return jsonResp({ error: 'rows[] required' }, 400);

      // B10: a refresh must not be able to shrink the overlay silently. A smaller
      // batch than what is stored is rejected unless explicitly acknowledged —
      // "the prices are correct but the reason to trust them is gone" is the
      // failure this guards.
      let prevCount = 0;
      try {
        const prevRaw = await env.KKME_SIGNALS.get('fleet_private:index');
        if (prevRaw) prevCount = (JSON.parse(prevRaw).rows || []).length;
      } catch { prevCount = 0; }
      if (prevCount > 0 && body.rows.length < prevCount && body.allow_shrink !== true) {
        return jsonResp({
          error: 'refusing to shrink the private overlay',
          stored: prevCount, incoming: body.rows.length,
          hint: 'set allow_shrink:true if the reduction is intended',
        }, 409);
      }

      const payload = {
        rows: body.rows,
        generated: body.generated || new Date().toISOString(),
        stored_at: new Date().toISOString(),
        count: body.rows.length,
      };
      await env.KKME_SIGNALS.put('fleet_private:index', JSON.stringify(payload));
      console.log(`[admin/fleet-private] stored ${payload.count} rows (was ${prevCount})`);
      return jsonResp({ ok: true, count: payload.count, previous_count: prevCount });
    }

    // ── GET /admin/fleet-private — operator-only read of the private overlay ──
    if (request.method === 'GET' && url.pathname === '/admin/fleet-private') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const raw = await env.KKME_SIGNALS.get('fleet_private:index').catch(() => null);
      if (!raw) return jsonResp({ rows: [], count: 0, reason: 'no private overlay stored yet' }, 200);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      // deliberately NOT ...CORS — this must not be readable from a browser origin
    }

    // ── POST /admin/fleet-lifecycle — append transitions + detector health ──
    // Append-only: the stored log is never rewritten or truncated by this endpoint.
    if (request.method === 'POST' && url.pathname === '/admin/fleet-lifecycle') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

      let log = [];
      try { log = JSON.parse((await env.KKME_SIGNALS.get('fleet_lifecycle:transitions')) || '[]'); } catch { log = []; }
      const before = log.length;
      const incoming = Array.isArray(body.transitions) ? body.transitions : [];

      // A transition that changes status MUST carry cited evidence (rule #3).
      const rejected = [];
      const accepted = [];
      for (const t of incoming) {
        if (t && t.type === 'retired') {
          const cited = (t.evidence || []).filter(e => e && /^https?:\/\//.test(e.url || ''));
          if (cited.length === 0) { rejected.push({ id: t.id, why: 'retirement without cited evidence' }); continue; }
        }
        accepted.push(t);
      }
      log = log.concat(accepted);
      await env.KKME_SIGNALS.put('fleet_lifecycle:transitions', JSON.stringify(log));

      if (body.detectors) {
        await env.KKME_SIGNALS.put('fleet_lifecycle:detectors', JSON.stringify({
          detectors: body.detectors,
          updated_at: new Date().toISOString(),
          transition_log_size: log.length,
        }));
      }
      console.log(`[admin/fleet-lifecycle] +${accepted.length} transitions (log ${before}→${log.length}), ${rejected.length} rejected`);
      return jsonResp({ ok: true, appended: accepted.length, rejected, log_size: log.length });
    }

    // ── GET /admin/fleet-lifecycle — operator-only transition log ──
    if (request.method === 'GET' && url.pathname === '/admin/fleet-lifecycle') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const raw = await env.KKME_SIGNALS.get('fleet_lifecycle:transitions').catch(() => null);
      return jsonResp({ transitions: raw ? JSON.parse(raw) : [], count: raw ? JSON.parse(raw).length : 0 });
    }

    // ── POST /admin/fleet-lifecycle-digest — weekly digest, MANUAL trigger ──
    // Deliberately NOT wired to a cron yet. B10's corollary: run new automation
    // against real state BEFORE its first scheduled firing — the proof run is the
    // gate on the gates. Arm the weekly cron only after this has been fired once
    // successfully; see docs/handover.md for the arming step.
    // `dry_run` (default true) returns the rendered digest without sending it.
    if (request.method === 'POST' && url.pathname === '/admin/fleet-lifecycle-digest') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const dryRun = body.dry_run !== false;
      const built = await buildLifecycleDigest(env, { since: body.since });
      if (built.blocked) {
        console.error('[lifecycle-digest] BLOCKED — contact-shaped content in the rendered payload');
        return jsonResp({ ok: false, blocked: true, dry_run: dryRun, sent: false, error: built.error }, 500);
      }
      if (!dryRun) await sendLifecycleDigest(env, built.message);
      return jsonResp({ ok: true, dry_run: dryRun, ...built.summary, message: built.message });
    }

    // ── Phase 37.C — operator-only fleet CRM (/fleet/*) ────────────────────────
    //
    // THERE IS NO PUBLIC TIER ON THESE ROUTES. The calculator degrades an invalid
    // token to its sample view; this must not, and does not. Every failure path
    // below returns an error object and nothing else — no counts, no row shapes,
    // no "N projects". Asserted by the leak tests, which seed private values first
    // and carry a vacuity guard so an empty response cannot pass for a clean one.
    //
    // A7 — readers/writers of the private keys after this batch:
    //   fleet_private:index    writers: POST /admin/fleet-private (1)
    //                          readers: GET /admin/fleet-private, GET /fleet/data (2)
    //   fleet_private:comments writers: POST /fleet/comment (1)
    //                          readers: GET /fleet/data (1)
    // The counts are re-derived by grep in the handover, not asserted from memory.

    if (request.method === 'POST' && url.pathname === '/fleet/login') {
      if (!env.FLEET_SECRET) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_unconfigured }),
          { status: 503, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      let body = {};
      try { body = await request.json(); } catch { /* falls through to the 401 */ }
      const password = body?.password;
      if (typeof password !== 'string' || !CALC.timingSafeEqual(password, env.FLEET_SECRET)) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_failed }),
          { status: 401, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      const expires = Date.now() + FLEET_TOKEN_TTL_MS;
      const token = await signFleetToken(env.FLEET_SECRET, expires);
      console.log('[fleet/login] operator session issued');
      return new Response(JSON.stringify({ token, expires }),
        { status: 200, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
    }

    // ── GET /fleet/data — the console payload. Token or nothing. ───────────────
    if (request.method === 'GET' && url.pathname === '/fleet/data') {
      if (!env.FLEET_SECRET) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_unconfigured }),
          { status: 503, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      const auth = await verifyFleetToken(env.FLEET_SECRET, fleetBearerToken(request));
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_required }),
          { status: 401, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }

      let privateIndex = null, comments = {}, lifecycle = [];
      try { privateIndex = JSON.parse((await env.KKME_SIGNALS.get('fleet_private:index')) || 'null'); } catch { privateIndex = null; }
      try { comments = JSON.parse((await env.KKME_SIGNALS.get('fleet_private:comments')) || '{}'); } catch { comments = {}; }
      try { lifecycle = JSON.parse((await env.KKME_SIGNALS.get('fleet_lifecycle:transitions')) || '[]'); } catch { lifecycle = []; }

      const view = buildCrmView({ privateIndex, comments, lifecycle });
      return new Response(JSON.stringify(view),
        { status: 200, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
    }

    // ── POST /fleet/comment — inline deal-comment edit ─────────────────────────
    // Writes to its OWN key. Folding edits back into fleet_private:index would let
    // the next intake run silently discard them — the B10 shape (the value survives,
    // the record of how it got there does not).
    if (request.method === 'POST' && url.pathname === '/fleet/comment') {
      if (!env.FLEET_SECRET) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_unconfigured }),
          { status: 503, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      const auth = await verifyFleetToken(env.FLEET_SECRET, fleetBearerToken(request));
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: FLEET_COPY.auth_required }),
          { status: 401, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      let body;
      try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } }); }
      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      if (!id) {
        return new Response(JSON.stringify({ error: 'id required' }),
          { status: 400, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
      }
      const text = typeof body?.text === 'string' ? body.text : '';

      let comments = {};
      try { comments = JSON.parse((await env.KKME_SIGNALS.get('fleet_private:comments')) || '{}'); } catch { comments = {}; }
      comments[id] = { text, updated_at: new Date().toISOString() };
      await env.KKME_SIGNALS.put('fleet_private:comments', JSON.stringify(comments));
      // The comment body is private — the log records that an edit happened, never what it said.
      console.log(`[fleet/comment] edit stored for ${id} (${text.length} chars)`);
      return new Response(JSON.stringify({ ok: true, id, updated_at: comments[id].updated_at }),
        { status: 200, headers: { ...FLEET_NO_STORE, ...FLEET_CORS } });
    }

    // ── POST /admin/trigger-s1-capture — force recompute S1 capture ──
    if (request.method === 'POST' && url.pathname === '/admin/trigger-s1-capture') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const cap = await computeCapture(env);
      if (!cap) return jsonResp({ error: 'computeCapture returned null' }, 502);
      return jsonResp({ ok: true, gross_2h: cap.gross_2h, gross_4h: cap.gross_4h, net_2h: cap.net_2h, net_4h: cap.net_4h, date: cap.date });
    }

    // ── POST /admin/backfill-s1-history — patch gross_2h/4h from capture history ──
    if (request.method === 'POST' && url.pathname === '/admin/backfill-s1-history') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);

      const capHistRaw = await env.KKME_SIGNALS.get('s1_capture_history').catch(() => null);
      const s1HistRaw = await env.KKME_SIGNALS.get('s1_history').catch(() => null);
      if (!capHistRaw || !s1HistRaw) return jsonResp({ error: 'Missing KV data' }, 404);

      const capHist = JSON.parse(capHistRaw); // [{date, gross_2h, gross_4h, ...}, ...]
      const s1Hist = JSON.parse(s1HistRaw);   // [{date, spread_eur, ..., gross_2h: null}, ...]

      // Build lookup from capture history
      const capByDate = {};
      for (const row of capHist) {
        if (row.date) capByDate[row.date] = row;
      }

      let patched = 0;
      for (const entry of s1Hist) {
        if (entry.gross_2h != null && entry.gross_4h != null) continue; // already populated
        const cap = capByDate[entry.date];
        if (!cap) continue;
        entry.gross_2h = cap.gross_2h ?? cap.capture_2h?.gross_eur_mwh ?? null;
        entry.gross_4h = cap.gross_4h ?? cap.capture_4h?.gross_eur_mwh ?? null;
        if (entry.gross_2h != null) patched++;
      }

      await env.KKME_SIGNALS.put('s1_history', JSON.stringify(s1Hist));
      return jsonResp({ ok: true, patched, total: s1Hist.length });
    }

    // ── GET /s2/activation ──────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s2/activation') {
      const raw = await env.KKME_SIGNALS.get('s2_activation').catch(() => null);
      if (!raw) return jsonResp({ activation: null, reason: 'Activation KV not yet populated — awaiting BTD push' }, 200);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
    }

    // ── GET /health/validate ── Full data integrity check
    if (request.method === 'GET' && url.pathname === '/health/validate') {
      const errors = [];
      const warnings = [];
      const checks = [];
      const [s1Raw, s2Raw, fleetRaw, actRaw, capRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1').catch(() => null),
        env.KKME_SIGNALS.get('s2').catch(() => null),
        (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
          .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
        env.KKME_SIGNALS.get('s2_activation').catch(() => null),
        env.KKME_SIGNALS.get('s1_capture').catch(() => null),
      ]);
      const s1 = s1Raw ? JSON.parse(s1Raw) : null;
      const s2 = s2Raw ? JSON.parse(s2Raw) : null;
      const fleet = fleetRaw ? JSON.parse(fleetRaw) : null;
      const act = actRaw ? JSON.parse(actRaw) : null;
      const cap = capRaw ? JSON.parse(capRaw) : null;
      if (!s1) { errors.push('S1: no data'); } else {
        const age = (Date.now() - new Date(s1.updated_at).getTime()) / 3600000;
        if (age > 8) warnings.push('S1: ' + Math.round(age) + 'h old');
        checks.push({ check: 'S1', pass: true, age_h: Math.round(age) });
      }
      if (!s2) { errors.push('S2: no data'); } else {
        checks.push({ check: 'S2', pass: true });
      }
      if (!fleet) { errors.push('Fleet: no data'); } else {
        const traj = fleet.trajectory || [];
        const matureCpis = traj.filter(t => t.phase === 'MATURE').map(t => t.cpi);
        const allSame = matureCpis.length > 1 && matureCpis.every(c => c === matureCpis[0]);
        if (allSame) errors.push('Fleet: ALL mature CPI identical (' + matureCpis[0] + ')');
        checks.push({ check: 'CPI differentiation', pass: !allSame, values: matureCpis });
        const psd = fleet.product_sd;
        if (psd) {
          for (const p of ['fcr', 'afrr', 'mfrr']) {
            if (psd[p]?.ratio == null) errors.push('Fleet: product_sd.' + p + '.ratio is null');
          }
          checks.push({ check: 'Product S/D', pass: psd.fcr?.ratio != null });
        }
      }
      if (!act) { warnings.push('Activation: no data'); } else {
        const p50 = act.countries?.Lithuania?.afrr_recent_3m?.avg_p50;
        if (p50 == null) errors.push('Activation: LT aFRR P50 null');
        checks.push({ check: 'Activation', pass: p50 != null, value: p50 });
      }
      if (!cap) { warnings.push('S1 capture: no data'); } else {
        const mean2h = cap.rolling_30d?.stats_2h?.mean;
        checks.push({ check: 'S1 capture', pass: mean2h != null && mean2h > 0, value: mean2h });
      }
      return jsonResp({ status: errors.length === 0 ? 'PASS' : 'FAIL', errors, warnings, checks, timestamp: new Date().toISOString() });
    }

    // ── GET /s2 ──────────────────────────────────────────────────────────────
    // Merges BTD capacity data + fleet S/D ratio data + activation clearing prices.
    if (request.method === 'GET' && url.pathname === '/s2') {
      try {
        const [cached, activationRaw, btdHistRaw, extremeRaw, rolling180dRaw, s2HistoryRaw] = await Promise.all([
          env.KKME_SIGNALS.get('s2'),
          env.KKME_SIGNALS.get('s2_activation').catch(() => null),
          env.KKME_SIGNALS.get('s2_btd_history').catch(() => null),
          env.KKME_SIGNALS.get('extreme:latest').catch(() => null),
          env.KKME_SIGNALS.get('s2_rolling_180d').catch(() => null),
          env.KKME_SIGNALS.get('s2_history').catch(() => null),
        ]);
        const base = cached
          ? JSON.parse(cached)
          : { ...DEFAULTS.s2, unavailable: true, _serving: 'static_defaults' };
        // Fleet data stripped from /s2 — now served via /s4
        // Balancing demand context (kept for S2 card):
        // Phase 36.D — from the canonical module, year-indexed. These were the
        // 2026 row of the tri-TSO Baltic dimensioning forecasts all along; they
        // are now that row by construction, and they move with the year.
        {
          const _y = new Date().getUTCFullYear();
          const _p = productDemandMap(_y);
          base.demand_mw       = addressableDemandMw(_y);
          base.afrr_demand_mw  = _p.afrr;
          base.mfrr_demand_mw  = _p.mfrr;
          base.fcr_demand_mw   = _p.fcr;
          base.demand_basis    = { source: 'demand-forecast-module', module_version: DEMAND_FORECAST_VERSION.version, year: _y };
        }
        // Phase 12.10 — Elering €74M Baltic frequency-reserve cost (2025) macro
        // anchor. Annual figure published once/year by Elering (TSO transparency
        // press release); annual hardcode is fine — no staleness risk before the
        // next annual publication. Audit #5 explicitly recommended surfacing.
        base.macro_context = {
          baltic_frequency_reserve_cost_2025_eur: 74_000_000,
          source: 'Elering 2026-02-04 press release',
          source_url: 'https://elering.ee/en/news/baltic-frequency-reserve-cost-74m-2025',
          coverage_period: '2025 calendar year (synchronous-area-wide aFRR + mFRR + FCR procurement)',
          interpretation: 'Strongest macro anchor for Baltic balancing-market spend size. KKME revenue projections sized at single-MW level scale linearly against this number (€74M ÷ ~752 MW eff demand → ≈ €98k/MW/yr Baltic-aggregated balancing spend, before TSO margin and product-level allocation).',
          afrr_methodology_note: 'KKME afrr_up_avg / afrr_down_avg = rolling 7-day mean of BTD price_procured_reserves (Lithuania, capacity-reservation €/MW/h). Not directly comparable to Clean Horizon\'s June 2025 "Baltic S1 2025 Price Forecasts" (€77 up / €340 down, aggregate-Baltic, Apr–mid-Jun 2025 launch window) — that window predates summer-2025 market deepening (~1.5× compression visible in CH\'s Oct 2025 update) and Baltic-Continental synchronisation Nov 2025 (~8× step-change visible in KKME\'s S2 monthly trend chart). Same metric, different window + geography. See docs/methodology.md "Capacity reservation revenue" section for full reconciliation.',
        };
        if (activationRaw) {
          try {
            const act = JSON.parse(activationRaw);
            const lt = act.countries?.Lithuania;
            const lv = act.countries?.Latvia;
            const ee = act.countries?.Estonia;
            base.activation = {
              lt: {
                afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: lt?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: lt?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              lv: {
                afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: lv?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: lv?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: lv?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              ee: {
                afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: ee?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: ee?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: ee?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              compression: act.compression_trajectory ?? null,
              lt_monthly_afrr: lt?.afrr_up ?? null,
              lt_monthly_mfrr: lt?.mfrr_up ?? null,
              lv_monthly_afrr: lv?.afrr_up ?? null,
              lv_monthly_mfrr: lv?.mfrr_up ?? null,
              ee_monthly_afrr: ee?.afrr_up ?? null,
              ee_monthly_mfrr: ee?.mfrr_up ?? null,
              data_class: 'observed',
              period: act.period,
              source: act.source,
              stored_at: act.stored_at,
            };
          } catch (e) {
            console.error('[S2/activation merge]', String(e));
          }
        }
        if (btdHistRaw) {
          try {
            base.capacity_monthly = computeCapacityMonthly(JSON.parse(btdHistRaw));
          } catch (e) {
            console.error('[S2/capacity_monthly]', String(e));
          }
        }
        // Attach rolling 180-day stats
        if (rolling180dRaw) {
          try { base.rolling_180d = JSON.parse(rolling180dRaw); } catch { /* ignore */ }
        }
        // Phase 21 — directional delta (current 30d mean vs prior 60d mean) on
        // Lithuania aFRR up-only €/MW/h. Frontend renders as Δ ±N% / 90d chip
        // near the hero. Read s2_history (daily snapshots, capped at 90 days),
        // compute delta, attach top-level scalar. Null when window underfilled.
        base.afrr_up_avg_90d_delta = null;
        if (s2HistoryRaw) {
          try {
            const hist = JSON.parse(s2HistoryRaw);
            base.afrr_up_avg_90d_delta = computeAfrrUp30dVs60dDeltaPct(hist);
          } catch { /* ignore — null fallback already set */ }
        }
        // Attach extreme event only if from today
        if (extremeRaw) {
          try {
            const evt = JSON.parse(extremeRaw);
            const todayStr = new Date().toISOString().slice(0, 10);
            if (evt.date === todayStr) {
              base.extreme_event = evt;
            }
          } catch { /* ignore */ }
        }
        return new Response(JSON.stringify(base), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      } catch (e) {
        console.error('/s2 handler error:', e);
        return Response.json({
          ...DEFAULTS.s2,
          _serving: 'static_defaults',
          unavailable: true,
          _error: e.message,
        }, { headers: CORS });
      }
    }

    // ── POST /s2/update ───────────────────────────────────────────────────────
    // Accepts raw BTD data: { reserves, direction, imbalance, source? }.
    // Parses and shapes the payload here, then commits through the shared
    // admission path. `source` names the ingestion leg ('vps' since 36.C); an
    // unnamed caller ranks lowest and so can never displace a named leg holding
    // the same observation window.
    if (request.method === 'POST' && url.pathname === '/s2/update') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const { reserves, direction, imbalance } = body;
      const sourceLeg = typeof body.source === 'string' && body.source in S2_SOURCE_PRIORITY
        ? body.source
        : 'unknown';
      const payload = s2ShapePayload(reserves ?? null, direction ?? null, imbalance ?? null);
      payload.source_leg = sourceLeg;

      const result = await s2CommitPayload(env, payload, sourceLeg, 'S2/update');
      if (result.skipped) {
        // Not an error: a leg correctly declined to overwrite fresher data.
        return new Response(
          JSON.stringify({ status: 'skipped', reason: result.reason, data_window_end: payload.data_window_end }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: 'validation_failed', errors: result.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── POST /admin/cert-watch ───────────────────────────────────────────────
    // Phase 36.C tripwire intake. Body: { checks: [{ host, not_after,
    // days_remaining, error? }] }. Stores to KV and alerts on anything expiring
    // inside CERT_WARN_DAYS or failing inspection outright — a handshake that
    // returns no certificate at all is exactly the 07-17 signature.
    if (request.method === 'POST' && url.pathname === '/admin/cert-watch') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const checks = Array.isArray(body.checks) ? body.checks : null;
      if (!checks) return jsonResp({ error: 'checks[] required' }, 400);

      const record = { checked_at: new Date().toISOString(), checks };
      await env.KKME_SIGNALS.put('cert_watch', JSON.stringify(record));

      const expiring = checks.filter(c => typeof c.days_remaining === 'number' && c.days_remaining < CERT_WARN_DAYS);
      const failed   = checks.filter(c => c.error);
      if (expiring.length || failed.length) {
        const lines = [
          ...expiring.map(c => `• ${c.host} — cert expires in ${c.days_remaining}d (${c.not_after})`),
          ...failed.map(c => `• ${c.host} — inspection failed: ${String(c.error).slice(0, 120)}`),
        ];
        await notifyTelegram(env, `⚠️ Upstream TLS watch\n${lines.join('\n')}`).catch(() => {});
      }
      console.log(`[CertWatch] ${checks.length} hosts, ${expiring.length} expiring, ${failed.length} failed`);
      return jsonResp({ ok: true, stored: checks.length, expiring: expiring.length, failed: failed.length });
    }

    // ── GET /admin/cert-watch ────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/admin/cert-watch') {
      const raw = await env.KKME_SIGNALS.get('cert_watch').catch(() => null);
      return jsonResp(raw ? JSON.parse(raw) : { checked_at: null, checks: [] });
    }

    // ── POST /s2/daily-clearing/import ───────────────────────────────────────
    // Phase 36.C. `s2_btd_history` stores the ROLLING 7-day mean stamped with
    // the write date — fine for the trend chip it feeds, useless as evidence for
    // per-delivery-day reserve realisation (36.D), which needs the clearing
    // price that actually applied on a given day. This is a separate KV with
    // separate semantics rather than a reinterpretation of the old one, because
    // silently changing what a stored series means is how cross-card
    // inconsistencies start.
    //
    // Body: { days: [{ date, fcr, afrr_up, afrr_down, mfrr_up, mfrr_down, isp_count }] }
    // Idempotent: re-importing a date replaces it.
    if (request.method === 'POST' && url.pathname === '/s2/daily-clearing/import') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const incoming = Array.isArray(body.days) ? body.days : null;
      if (!incoming) return jsonResp({ error: 'days[] required' }, 400);

      const existingRaw = await env.KKME_SIGNALS.get('s2_daily_clearing').catch(() => null);
      let existing = [];
      try { existing = existingRaw ? JSON.parse(existingRaw) : []; } catch { existing = []; }

      const byDate = new Map(existing.map(d => [d.date, d]));
      let added = 0, replaced = 0, rejected = 0;
      for (const d of incoming) {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) { rejected++; continue; }
        // A partial day would silently bias any mean computed from it later.
        // 96 ISPs = a full PT15M day; allow a small shortfall for DST days.
        if (typeof d.isp_count === 'number' && d.isp_count < 90) { rejected++; continue; }
        if (d.fcr == null && d.afrr_up == null && d.mfrr_up == null) { rejected++; continue; }
        if (byDate.has(d.date)) replaced++; else added++;
        byDate.set(d.date, {
          date: d.date,
          fcr: d.fcr ?? null,
          afrr_up: d.afrr_up ?? null, afrr_down: d.afrr_down ?? null,
          mfrr_up: d.mfrr_up ?? null, mfrr_down: d.mfrr_down ?? null,
          isp_count: d.isp_count ?? null,
        });
      }
      const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      await env.KKME_SIGNALS.put('s2_daily_clearing', JSON.stringify(merged));
      console.log(`[S2/daily-clearing] +${added} ~${replaced} ✗${rejected} → ${merged.length} days`);
      return jsonResp({
        ok: true, added, replaced, rejected, total_days: merged.length,
        first: merged[0]?.date ?? null, last: merged[merged.length - 1]?.date ?? null,
      });
    }

    // ── GET /s2/daily-clearing ───────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s2/daily-clearing') {
      const raw = await env.KKME_SIGNALS.get('s2_daily_clearing').catch(() => null);
      const days = raw ? JSON.parse(raw) : [];
      return jsonResp({
        total_days: days.length,
        first: days[0]?.date ?? null,
        last: days[days.length - 1]?.date ?? null,
        days,
      });
    }

    // ── POST /s2/btd-history/backfill ────────────────────────────────────────
    // Phase 21.2 — recover lost `s2_btd_history` entries from `s2_history` (the
    // KV that was written on every path including the broken Mac-cron leg).
    // Both KVs share `{ date, fcr, afrr_up, mfrr_up }` shape; we copy entries
    // whose `date` is missing from `s2_btd_history` and re-trim to 365 days.
    if (request.method === 'POST' && url.pathname === '/s2/btd-history/backfill') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const sourceRaw = await env.KKME_SIGNALS.get('s2_history').catch(() => null);
      if (!sourceRaw) return jsonResp({ error: 's2_history empty' }, 400);
      const source = JSON.parse(sourceRaw);
      const targetRaw = await env.KKME_SIGNALS.get('s2_btd_history').catch(() => null);
      const target = targetRaw ? JSON.parse(targetRaw) : [];
      const existing = new Set(target.map(h => h.date));
      let added = 0;
      for (const e of source) {
        if (e.date && !existing.has(e.date) && e.afrr_up != null && e.mfrr_up != null && e.fcr != null) {
          target.push({ date: e.date, fcr: e.fcr, afrr_up: e.afrr_up, mfrr_up: e.mfrr_up });
          added++;
        }
      }
      const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const trimmed = target.filter(h => h.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
      await env.KKME_SIGNALS.put('s2_btd_history', JSON.stringify(trimmed));
      return jsonResp({ ok: true, source_count: source.length, target_after: trimmed.length, added });
    }

    // ── GET /api/model-inputs ─────────────────────────────────────────────────
    // Aggregated signal snapshot for analyst/model use.
    if (request.method === 'GET' && url.pathname === '/api/model-inputs') {
      const [s1r, s2r, s3r, s4r, eurR, fleetR] = await Promise.allSettled([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s2'),
        env.KKME_SIGNALS.get('s3'),
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('euribor'),
        env.KKME_SIGNALS.get('s4_fleet').catch(() => env.KKME_SIGNALS.get('s2_fleet')),
      ]);
      const parse = r => (r.status === 'fulfilled' && r.value) ? JSON.parse(r.value) : null;
      const s1 = parse(s1r), s2 = parse(s2r), s3 = parse(s3r), s4 = parse(s4r);
      const eur = parse(eurR), fleet = parse(fleetR);
      return Response.json({
        as_of:                 new Date().toISOString(),
        spread_eur_mwh:        s1?.spread_eur_mwh        ?? null,
        afrr_up_avg:           s2?.afrr_up_avg           ?? null,
        mfrr_up_avg:           s2?.mfrr_up_avg           ?? null,
        sd_ratio:              fleet?.sd_ratio           ?? null,
        phase:                 fleet?.phase              ?? null,
        cpi:                   fleet?.cpi               ?? null,
        lithium_eur_t:         s3?.lithium_eur_t         ?? null,
        cell_eur_kwh:          s3?.cell_eur_kwh          ?? null,
        euribor_nominal_3m:    eur?.euribor_nominal_3m   ?? null,
        euribor_real_3m:       eur?.euribor_real_3m      ?? null,
        grid_free_mw:          s4?.free_mw               ?? null,
        baltic_operational_mw: fleet?.baltic_operational_mw ?? null,
        baltic_pipeline_mw:    fleet?.baltic_pipeline_mw ?? null,
        eff_demand_mw:         fleet?.eff_demand_mw      ?? null,
      }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    // ── POST /curate ─────────────────────────────────────────────────────────
    // Phase 50, step 1 of 2 — OBSERVE ONLY, enforce nothing.
    //
    // /curate is an unauthenticated `feed_index` writer (via
    // appendCurationToFeedIndex), which collides with discipline rule #3: a named
    // entity can reach published content with no source check. It was left open
    // in Phase 48 on purpose, because its live caller — sync_to_website.py, VPS
    // cron_daily.sh at 06:00 UTC — sent no secret, and gating first would have
    // killed ~30 items/day.
    //
    // The caller now sends the header. This logs whether it ARRIVES, so step 2
    // enforces against an observation rather than an assumption. It deliberately
    // changes no response: same statuses, same bodies, no rejection path. The
    // secret's VALUE is never logged — only whether it matched.
    if (request.method === 'POST' && url.pathname === '/curate') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const rawCurateBody = await request.text().catch(() => null);
      if (typeof rawCurateBody === 'string' && rawCurateBody.length > CURATE_MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: `Request body exceeds ${CURATE_MAX_BODY_BYTES} bytes` }), { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const parsedCurate = parseJsonBody(rawCurateBody);
      if (!parsedCurate.ok) {
        return new Response(JSON.stringify({ error: parsedCurate.error }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const body = parsedCurate.body;
      const { url: entryUrl, title, raw_text, source, relevance, tags } = body;
      if (!entryUrl || !title || !raw_text || !source || !relevance) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const validation = validateCurationContent(body);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          error: 'Encoding validation failed',
          field: validation.field,
          pattern: validation.pattern,
          message: validation.message,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const entityErr = validateCurationEntity(body);
      if (entityErr) {
        return new Response(JSON.stringify(entityErr), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const entry = {
        id: makeId(), url: entryUrl, title, raw_text, source,
        relevance: Number(relevance), tags: Array.isArray(tags) ? tags : [],
        created_at: new Date().toISOString(),
      };
      await storeCurationEntry(env.KKME_SIGNALS, entry);
      const projected = await appendCurationToFeedIndex(env.KKME_SIGNALS, entry);
      console.log(`[curate] OK id=${entry.id} source=${String(source).slice(0, 40)} `
        + `relevance=${entry.relevance} projected=${Boolean(projected)}`);
      return new Response(JSON.stringify({ ok: true, id: entry.id, projected }), { status: 201, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── POST /contact ─────────────────────────────────────────────────────────
    // Phase 48: stays unauthenticated by design — it is a public contact form —
    // so it is bounded rather than gated: a body-size cap, a known `type`, and a
    // length limit per field. It is NOT rate-limited; that needs an edge
    // rate-limit binding we do not have configured. See the phase-48 write-up.
    if (request.method === 'POST' && url.pathname === '/contact') {
      const rawBody = await request.text().catch(() => null);
      if (typeof rawBody === 'string' && rawBody.length > CONTACT_MAX_BODY_BYTES) {
        return jsonResp({ error: `Request body exceeds ${CONTACT_MAX_BODY_BYTES} bytes` }, 413);
      }
      const parsed = parseJsonBody(rawBody);
      if (!parsed.ok) return jsonResp({ error: parsed.error }, 400);
      const bounds = validateContactBody(parsed.body);
      if (!bounds.ok) return jsonResp({ error: bounds.error }, 400);
      const body = parsed.body;
      const { type, name, email, message, company, projectName, mwMwh, country, targetCod } = body;
      const entry = {
        id: makeId(), type, name, email, message,
        company: company || null, projectName: projectName || null,
        mwMwh: mwMwh || null, country: country || null, targetCod: targetCod || null,
        timestamp: new Date().toISOString(),
      };
      const raw = await env.KKME_SIGNALS.get('contact_submissions').catch(() => null);
      const submissions = raw ? JSON.parse(raw) : [];
      submissions.unshift(entry);
      if (submissions.length > 500) submissions.length = 500;
      await env.KKME_SIGNALS.put('contact_submissions', JSON.stringify(submissions));
      await notifyTelegram(env, `📩 New inquiry (${type})\n${name} · ${email}${company ? ` · ${company}` : ''}\n${message.slice(0, 200)}`).catch(() => {});

      // Send email via Resend (gracefully skips if key not configured)
      if (env.RESEND_API_KEY) {
        const typeLabel = { project: 'Project', investment: 'Investment / capital', market: 'Market discussion', other: 'Other' }[type] || type;
        const subject = `KKME Contact: ${typeLabel} — ${name}${company ? ` (${company})` : ''}`;
        // Phase 50 — every interpolation escaped, the href scheme-checked, and
        // the field set allowlisted. Built through buildContactEmailHtml so the
        // escaping is one function with tests rather than eight call sites that
        // have to each remember.
        let htmlBody = `<h2 style="margin:0 0 16px">${escapeHtml(typeLabel)} inquiry</h2>`;
        htmlBody += buildContactEmailHtml(body);
        htmlBody += `<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">`;
        htmlBody += `<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">`;
        htmlBody += `<p style="color:#888;font-size:12px">Sent via kkme.eu contact form · ${escapeHtml(entry.timestamp)}</p>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KKME Contact <contact@kkme.eu>',
            to: ['kastytis@kkme.eu'],
            reply_to: email,
            subject,
            html: htmlBody,
          }),
        }).catch(() => {});
      }

      return jsonResp({ ok: true });
    }

    // ── GET /contact ──────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/contact') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      const raw = await env.KKME_SIGNALS.get('contact_submissions').catch(() => null);
      return jsonResp(raw ? JSON.parse(raw) : []);
    }

    // ── GET /curations ───────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/curations') {
      const entries = await recentCurations(env.KKME_SIGNALS);
      return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
    }

    // ── GET /digest ──────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/digest') {
      const cached = await env.KKME_SIGNALS.get(KV_DIGEST_CACHE);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      const anthropicKey = env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      const entries = await recentCurations(env.KKME_SIGNALS);
      if (!entries.length) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...CORS } });
      try {
        const digest     = await buildDigest(entries, anthropicKey);
        const digestJson = JSON.stringify(digest);
        await env.KKME_SIGNALS.put(KV_DIGEST_CACHE, digestJson, { expirationTtl: 3600 });
        return new Response(digestJson, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── POST /s3/editorial — human-approved data overrides ──────────────────
    if (request.method === 'POST' && url.pathname === '/s3/editorial') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'invalid JSON' }, 400); }
      const existing = JSON.parse(await env.KKME_SIGNALS.get('s3_editorial').catch(() => '{}') || '{}');
      const notes = body._notes; delete body._notes;
      const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
      await env.KKME_SIGNALS.put('s3_editorial', JSON.stringify(updated));

      // Snapshot baseline if cost ranges changed
      if (body.cost_profiles || body.lcos_reference) {
        const s3Live = JSON.parse(await env.KKME_SIGNALS.get('s3').catch(() => '{}') || '{}');
        const baseline = {
          set_at: new Date().toISOString(),
          lithium_reference_eur_t: s3Live.lithium_eur_t || null,
          euribor_reference_pct: s3Live.euribor_3m || null,
          capex_4h_range: (body.cost_profiles?.['4h'] || existing.cost_profiles?.['4h'])?.capex_range_kwh || null,
          notes: notes || 'Editorial update',
        };
        await env.KKME_SIGNALS.put('s3_baseline', JSON.stringify(baseline));
      }

      // Update freshness for changed fields
      const freshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
      Object.keys(body).forEach(key => {
        freshness[key] = { last_update: updated.updated_at, status: 'current', source: 'editorial' };
      });
      await env.KKME_SIGNALS.put('s3_freshness', JSON.stringify(freshness));

      return jsonResp({ success: true, updated_fields: Object.keys(body) });
    }

    // ── GET /s3 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s3') {
      const [s3Raw, eurRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s3'),
        env.KKME_SIGNALS.get('euribor'),
      ]);
      if (s3Raw) {
        try {
          const d = JSON.parse(s3Raw);
          if (eurRaw) {
            const eur = JSON.parse(eurRaw);
            d.euribor_3m         = eur.euribor_3m         ?? null;
            d.euribor_nominal_3m = eur.euribor_nominal_3m ?? eur.euribor_3m ?? null;
            d.euribor_real_3m    = eur.euribor_real_3m    ?? null;
            d.hicp_yoy           = eur.hicp_yoy           ?? null;
            d.euribor_trend      = eur.euribor_trend      ?? null;
          }

          // ── S3 expanded: cost profiles, drivers, technology, transactions ──
          d.cost_profiles = {
            '2h': {
              capex_range_kwh: [230, 280], capex_range_kw: [460, 560],
              breakdown: {
                dc_block:    { range_kwh: [80, 110], mid_kwh: 95, label: 'DC block', scope: 'equipment-only' },
                pcs:         { range_kw: [35, 55], mid_kw: 45, label: 'PCS / inverter', scope: 'equipment-only' },
                bos_civil:   { range_kwh: [25, 45], mid_kwh: 35, label: 'BOS + civil', scope: 'installed excl. grid' },
                hv_grid:     { range_kwh: [12, 50], label: 'HV grid connection', scope: 'grid-scope-dependent' },
                soft_costs:  { range_kwh: [10, 22], mid_kwh: 15, label: 'EPC + perm. + contingency', scope: 'installed' },
              },
              reference_mid_kwh: 255,
              notes: '2h: PCS share higher per kWh. Grid scope drives most variance.',
            },
            '4h': {
              capex_range_kwh: [160, 210], capex_range_kw: [640, 840],
              breakdown: {
                dc_block:    { range_kwh: [70, 100], mid_kwh: 85, label: 'DC block', scope: 'equipment-only' },
                pcs:         { range_kw: [35, 55], mid_kw: 45, label: 'PCS / inverter', scope: 'equipment-only' },
                bos_civil:   { range_kwh: [22, 40], mid_kwh: 30, label: 'BOS + civil', scope: 'installed excl. grid' },
                hv_grid:     { range_kwh: [12, 50], label: 'HV grid connection', scope: 'grid-scope-dependent' },
                soft_costs:  { range_kwh: [8, 18], mid_kwh: 12, label: 'EPC + perm. + contingency', scope: 'installed' },
              },
              reference_mid_kwh: 192,
              notes: '4h: cell scale effects dominate. Energy block largest share.',
            },
          };
          d.grid_scope_classes = [
            { id: 'light', label: 'Light', description: 'Existing HV bay. MV switchgear only.', adder_kwh: [12, 18] },
            { id: 'heavy', label: 'Heavy', description: 'New substation bay + transformer + protection.', adder_kwh: [25, 40] },
          ];
          d.cost_drivers = [
            { driver: 'Battery hardware', direction: 'easing', symbol: '\u2193', magnitude: 'moderate', component: 'dc_block', detail: 'LFP cell prices declining ~15% YoY. China overcapacity. Not fully passing through to EU turnkey.' },
            { driver: 'Electrical / PCS', direction: 'constrained', symbol: '\u2192', magnitude: 'weak', component: 'pcs', detail: 'Grid-forming requirements adding compliance cost. Supply adequate.' },
            { driver: 'HV grid equipment', direction: 'constrained', symbol: '\u2191', magnitude: 'strong', component: 'hv_grid', detail: 'HV equipment lead times 10\u201316mo. Still the critical path for most projects. Prices elevated since 2021.' },
            { driver: 'Financing', direction: 'easing', symbol: '\u2193', magnitude: 'moderate', component: 'lcos', detail: 'Euribor falling from 2023 peak. Improves LCOS and project IRR.' },
          ];
          d.uncertainty = { range_pct: '\u00b115\u201330%', primary_driver: 'grid scope + project size', note: 'Grid scope is the single largest installed cost uncertainty in the Baltics.' };
          d.trend = { direction: 'easing', twelve_month: '\u2193 equipment \u00b7 \u2191 grid \u00b7 \u2193 financing', note: 'Equipment declining since 2023 peak. Grid + HV elevated.' };
          d.lcos_reference = {
            range_eur_mwh: [80, 130],
            assumptions: { cycles_per_year: [300, 365], rte_pct: [85, 88], wacc_pct: [6, 9], augmentation: 'Y8\u201312, 10\u201315% DC block cost' },
            note: 'Reference range. Full computation in Revenue Engine.',
          };
          d.technology = {
            chemistry: 'LFP', calendar_life_years: [15, 25], cycle_life: [6000, 10000],
            rte_percent: [85, 88], degradation_annual_pct: [0.4, 0.8], eol_capacity_pct: 70,
            augmentation: 'Y8\u201312. 10\u201315% of original DC block cost.',
            warranty_typical: '15yr to 70% SoH, cycling limits apply.',
            lifetime_throughput_gwh_per_mw: [12, 30],
            throughput_note: '1 cycle/day \u00d7 20yr \u00d7 4h \u2248 29 GWh/MW. Revenue potential and LCOS derive from this.',
            notes: 'LFP dominant for utility-scale stationary. Sodium-ion emerging, unproven at grid scale.',
          };
          d.transactions = [
            { project: 'Ignitis 3-site', country: 'LT', mw: 291, mwh: 582, eur_kwh_approx: 224, scope: 'all-in incl. substation', year: 2025, integrator: 'Rolls-Royce / Nidec', cost_driver: 'Scale advantage + full substation' },
            { project: 'AST Latvia', country: 'LV', mw: 80, mwh: 160, eur_kwh_approx: 490, scope: 'all-in incl. substation', year: 2025, integrator: null, cost_driver: 'TSO premium + smaller scale' },
            { project: 'Utilitas', country: 'EE', mw: 10, mwh: 20, eur_kwh_approx: 350, scope: 'partial', year: 2024, integrator: null, cost_driver: 'Small scale / pilot' },
          ];
          d.key_players = {
            cells_dc: [
              { name: 'CATL', hq: 'CN', positioning: 'Premium pricing, highest bankability' },
              { name: 'BYD', hq: 'CN', positioning: 'Vertically integrated, aggressive on price' },
              { name: 'EVE Energy', hq: 'CN', positioning: 'Mid-tier pricing, fast EU market entry' },
              { name: 'Hithium', hq: 'CN', positioning: 'Aggressive pricing, newer entrant' },
            ],
            pcs: [
              { name: 'Sungrow', hq: 'CN', positioning: 'Dominant EU utility PCS, cost-efficient' },
              { name: 'Huawei', hq: 'CN', positioning: 'Distributed string architecture' },
              { name: 'Power Electronics', hq: 'ES', positioning: 'European PCS, grid-forming capable, premium' },
            ],
            integrators: [
              { name: 'Rolls-Royce', hq: 'UK', positioning: 'Ignitis project. mtu EnergyPack. Premium reliability.' },
              { name: 'Fluence', hq: 'US', positioning: 'Gridstack. Siemens/AES JV. Strong bankability.' },
            ],
            hv_equipment: [
              { name: 'Hitachi Energy', hq: 'JP/CH', positioning: 'Major transformer supplier. Long lead times.' },
              { name: 'Siemens Energy', hq: 'DE', positioning: 'Blue GIS. European supply chain. Constrained.' },
            ],
          };
          // Default confidence (may be overridden by editorial or auto-downgraded)
          d.confidence = { level: 'benchmark-heavy', observed_share: 0.2, benchmark_share: 0.5, modeled_share: 0.3 };

          d.market_bands = {
            developer_optimized: { range_kwh: [120, 160], label: 'Developer-optimized', note: 'Strong sourcing, competitive procurement, experienced execution.' },
            eu_turnkey_typical: { range_kwh: [160, 220], label: 'EU turnkey typical', note: "Standard EPC, grid-heavy, mid-scale. This is the card's default range." },
            institutional_tso: { range_kwh: [220, 500], label: 'Institutional / TSO', note: 'Risk-heavy procurement, small scale, regulated overhead.' },
            observed_floor: 110, observed_ceiling: 500,
            note: "No single 'true' CAPEX. Market is segmented by procurement capability, scale, and risk appetite.",
          };
          d.lead_times = {
            hv_equipment_months: [10, 16], battery_plus_shipping_months: [5, 8],
            epc_construction_months: [2, 3], commissioning_months: [1, 2],
            total_rtb_to_cod_months: [12, 18], critical_path: 'HV equipment procurement',
            note: 'RTB to COD achievable in ~12 months if HV equipment ordered early. HV is the long pole, not battery.',
          };
          d.scale_effect = {
            small_under_20mw: '+15\u201330%', medium_20_80mw: 'baseline', large_over_80mw: '\u221210\u201320%',
            note: 'Bulk procurement + shared grid scope drive savings at scale.',
          };
          d.price_lag = {
            battery_cell_months: [3, 6], hv_equipment_months: [6, 16],
            note: 'Lithium \u2193 today \u2192 turnkey battery \u2193 in 3\u20136mo. HV equipment pricing lags 6\u201316mo.',
          };
          d.supplier_spread = {
            premium_bankable: '+10\u201325%', mainstream: 'baseline', aggressive_new_entrant: '\u221210\u201320%',
            note: 'Premium buys bankability + warranty + delivery certainty.',
          };
          d.contract_structure = {
            turnkey_epc: '+10\u201320%', multi_contract: 'baseline',
            note: 'Most Baltic projects use turnkey EPC. Split supply needs experienced developer.',
          };
          d.policy_flags = [
            { name: 'Grid-forming requirements', impact: 'PCS cost \u2191', status: 'emerging', detail: 'ENTSO-E Phase II Nov 2025. Grid-forming for new storage modules.' },
            { name: 'EU Batteries Regulation', impact: 'Compliance cost', status: 'in force', detail: 'Sustainability, labelling, due diligence. Non-trivial documentation.' },
            { name: 'Baltic balancing cost shift', impact: 'Net revenue \u2193', status: 'active 2026', detail: '30% of balancing costs now on producers. Affects revenue, not CAPEX.' },
          ];

          // Update technology with degradation shape
          if (d.technology) {
            d.technology.degradation_shape = 'non-linear';
            d.technology.degradation_note = 'Slow early (Y1\u20135), linear mid-life (Y5\u201315), accelerates late. Calendar + cycling interact.';
          }

          // ── LAYER 2: Apply editorial overrides (human-approved, highest priority) ──
          const editorial = await env.KKME_SIGNALS.get('s3_editorial').catch(() => null);
          if (editorial) {
            try {
              const ed = JSON.parse(editorial);
              const overridable = ['cost_profiles','transactions','technology','key_players','lcos_reference','cost_drivers','confidence','market_bands','lead_times','scale_effect','price_lag','supplier_spread','contract_structure','policy_flags','grid_scope_classes','uncertainty','trend'];
              for (const field of overridable) {
                if (ed[field] !== undefined) d[field] = ed[field];
              }
            } catch { /* ignore bad editorial JSON */ }
          }

          // ── LAYER 3: Add enrichment annotations (read-only, never overrides) ──
          const enrichRaw = await env.KKME_SIGNALS.get('s3_enrichment').catch(() => null);
          if (enrichRaw) {
            try {
              const enrichment = JSON.parse(enrichRaw);
              const enrichAge = (Date.now() - new Date(enrichment.enriched_at).getTime()) / 86400000;
              if (enrichAge < 14) {
                d.enrichment_annotations = { enriched_at: enrichment.enriched_at, driver_sentiment: {}, headlines: [], review_needed: false };
                for (const [key, sentiment] of Object.entries(enrichment.driver_sentiment || {})) {
                  if (sentiment && typeof sentiment === 'object' && (sentiment.evidence_count ?? 0) >= 2) {
                    d.enrichment_annotations.driver_sentiment[key] = sentiment;
                  }
                }
                d.enrichment_annotations.headlines = (enrichment.findings || []).filter(f => f.relevance !== 'low').slice(0, 3).map(f => ({ headline: f.headline, source: f.source }));
                if (enrichment.range_drift_flag) d.enrichment_annotations.review_needed = true;
              }
            } catch { /* ignore bad enrichment JSON */ }
          }

          // ── LAYER 4: Real freshness from KV ──
          const rawFreshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
          d.data_freshness = {
            ecb_euribor:     { ...(rawFreshness.ecb_euribor || {}), cadence: 'daily', status: checkS3Freshness(rawFreshness.ecb_euribor, 48) },
            lithium_proxy:   { ...(rawFreshness.lithium_proxy || {}), cadence: 'daily', confidence: 'proxy', status: checkS3Freshness(rawFreshness.lithium_proxy, 48) },
            fx:              { ...(rawFreshness.fx || {}), cadence: 'daily', status: checkS3Freshness(rawFreshness.fx, 24) },
            enrichment:      { ...(rawFreshness.enrichment || {}), cadence: 'weekly', status: checkS3Freshness(rawFreshness.enrichment, 336) },
            capex_reference: { last_update: rawFreshness.capex_reference?.last_update || '2025-12-01', cadence: 'quarterly editorial', status: checkS3Freshness(rawFreshness.capex_reference, 2160) },
            transactions:    { last_update: rawFreshness.transactions?.last_update || '2026-03-15', cadence: 'event-driven', status: checkS3Freshness(rawFreshness.transactions, 2160) },
            nrel_anchor:     { last_update: '2025-06-01', cadence: 'annual', status: 'structural anchor' },
          };

          // ── Confidence auto-downgrade if inputs stale ──
          const staleCount = ['ecb_euribor','lithium_proxy','fx'].filter(k => d.data_freshness[k]?.status === 'stale' || d.data_freshness[k]?.status === 'unknown').length;
          if (staleCount >= 2) {
            d.confidence = { ...d.confidence, level: 'degraded', degraded_reason: `${staleCount} input(s) stale` };
          }

          return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        } catch { /* fall through to fresh compute */ }
      }
      const data = await computeS3();
      await env.KKME_SIGNALS.put('s3', JSON.stringify(data));
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /s5 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s5') {
      const cached = await env.KKME_SIGNALS.get('s5').catch(() => null);
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await computeS5(env);
        await env.KKME_SIGNALS.put('s5', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return Response.json({ ...DEFAULTS.s5, unavailable: true, _serving: 'static_defaults' }, { headers: CORS });
      }
    }

    // ── POST /s5/manual ──────────────────────────────────────────────────────
    // Quarterly manual update: Baltic DC pipeline MW + notes.
    if (request.method === 'POST' && url.pathname === '/s5/manual') {
      if (!acceptsUpdateSecret(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
      }
      let body;
      try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
      }
      const data = {
        pipeline_mw:  body.pipeline_mw ?? null,
        note:         body.note        ?? null,
        updated_at:   new Date().toISOString(),
      };
      await env.KKME_SIGNALS.put('s5_manual', JSON.stringify(data));
      await env.KKME_SIGNALS.delete('s5').catch(() => {});  // invalidate cache
      console.log(`[S5/manual] pipeline=${data.pipeline_mw}MW note="${data.note}"`);
      return Response.json({ ok: true, ...data }, { headers: CORS });
    }

    // ── GET /s6 · /s7 · /s8 · /s9 ───────────────────────────────────────────

    for (const [sig, computeFn, def] of [
      ['s6', () => fetchNordicHydro(),             DEFAULTS.s6],
      ['s7', () => fetchTTFGas(),                  DEFAULTS.s7],
      ['s8', () => fetchInterconnectorFlows(env),  DEFAULTS.s8],
      ['s9', () => fetchEUCarbon(env),             DEFAULTS.s9],
    ]) {
      if (request.method === 'GET' && url.pathname === `/${sig}`) {
        const cached = await env.KKME_SIGNALS.get(sig).catch(() => null);
        if (cached) {
          return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        }
        try {
          const data = await computeFn();
          await env.KKME_SIGNALS.put(sig, JSON.stringify(data));
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
        } catch (err) {
          console.error(`[${sig}] fetch failed:`, String(err));
          return Response.json({ ...def, unavailable: true, _serving: 'static_defaults' }, { headers: CORS });
        }
      }

      // History endpoints for S6, S7, S9 (not S8 — flows are point-in-time)
      if (sig !== 's8' && request.method === 'GET' && url.pathname === `/${sig}/history`) {
        const raw = await env.KKME_SIGNALS.get(`${sig}_history`).catch(() => null);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: { ...CORS, 'Cache-Control': 'public, max-age=1800' } });
      }
    }

    // ── GET /s_wind · /s_solar · /s_load ──────────────────────────────────────
    for (const genSig of ['s_wind', 's_solar', 's_load']) {
      if (request.method === 'GET' && url.pathname === `/${genSig}`) {
        const cached = await env.KKME_SIGNALS.get(genSig).catch(() => null);
        if (cached) {
          return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        }
        // No cached data yet — try live fetch
        try {
          const { wind, solar, load } = await fetchBalticGeneration();
          const map = { s_wind: wind, s_solar: solar, s_load: load };
          const data = map[genSig];
          // Best-effort write all 3
          await Promise.all([
            env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
            env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
            env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
          ]).catch(() => {});
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
        } catch (err) {
          console.error(`[${genSig}] live fetch failed:`, String(err));
          return Response.json({ unavailable: true, signal: 'UNKNOWN', _serving: 'no_data_yet', timestamp: null }, { headers: CORS });
        }
      }
    }

    // ── GET /genload — Real-time Baltic generation & load (ENTSO-E A75+A65) ─
    if (request.method === 'GET' && url.pathname === '/genload') {
      const cached = await env.KKME_SIGNALS.get('genload').catch(() => null);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = parsed.fetched_at ? (Date.now() - new Date(parsed.fetched_at).getTime()) / 60000 : 999;
        // Serve cached immediately, refresh in background if stale (>5 min)
        if (age > 5) {
          const apiKey = env.ENTSOE_API_KEY;
          if (apiKey) {
            ctx.waitUntil(
              fetchGenLoad(apiKey)
                .then(d => env.KKME_SIGNALS.put('genload', JSON.stringify(d)))
                .catch(e => console.error('[genload] bg refresh failed:', String(e)))
            );
          }
        }
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
      }
      // No cache — fetch live
      const apiKey = env.ENTSOE_API_KEY;
      if (!apiKey) {
        return Response.json({ error: 'ENTSOE_API_KEY not configured' }, { status: 500, headers: CORS });
      }
      try {
        const data = await fetchGenLoad(apiKey);
        await env.KKME_SIGNALS.put('genload', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
      } catch (err) {
        console.error('[genload] fetch failed:', String(err));
        return Response.json({ error: 'ENTSO-E fetch failed', detail: String(err) }, { status: 502, headers: CORS });
      }
    }

    // ── GET /euribor ─────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/euribor') {
      const cached = await env.KKME_SIGNALS.get('euribor');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await computeEuribor();
        await env.KKME_SIGNALS.put('euribor', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── POST /s4/buildability ────────────────────────────────────────────────
    // Assertion-backed buildability data pushed by the daily VPS intel job.
    // Stores in KV so GET /s4 returns live values instead of static.
    //
    // Phase 38.2 (B-059) — this used to `put` the request body WHOLESALE. Every
    // poster therefore owned the entire key, so a poster that built its body
    // from scratch deleted every assertion it did not itself carry. That was
    // not hypothetical: `scripts/vps/fetch_entsoe_installed_capacity.py` posts
    // only `installed_storage_<c>_mw_live` keys, and its FIRST SUCCESS would
    // have deleted all sixteen assertions in production — every installed
    // figure on the S4 card, the LT reservations, the APVA estimate, the grid
    // caveat. Both halves were live; only the script's continued failure was
    // preventing it (playbook B12, armed rather than fired).
    //
    // The guard is on the ENDPOINT, not on that one script, for the same
    // reason the `/s4` whitelist was inverted rather than widened: a rule that
    // protects against the poster you know about protects against exactly one
    // poster. Merge is the default; destruction requires saying so.
    if (request.method === 'POST' && url.pathname === '/s4/buildability') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      let prior = null;
      try { prior = JSON.parse((await env.KKME_SIGNALS.get('s4_buildability')) || 'null'); } catch { prior = null; }
      const priorAssertions = (prior && typeof prior.assertions === 'object' && prior.assertions) || {};
      const incoming        = (typeof body.assertions === 'object' && body.assertions) || {};
      const replace         = body.mode === 'replace';

      // Merge by default: incoming keys win per-key, absent keys are carried
      // forward. A poster that knows about four assertions cannot un-know the
      // other twelve.
      const merged = replace ? { ...incoming } : { ...priorAssertions, ...incoming };

      const dropped = Object.keys(priorAssertions).filter(k => !(k in merged));
      if (dropped.length && !replace) {
        // Unreachable under merge — kept as a belt-and-braces assertion so a
        // future edit to the merge cannot quietly reintroduce deletion.
        return jsonResp({
          error: 'refusing to drop assertions',
          dropped,
          hint: 'send mode:"replace" to intentionally replace the whole set',
        }, 409);
      }
      if (replace && dropped.length) {
        console.log(`[S4/buildability] mode=replace DROPPING ${dropped.length}: ${dropped.join(', ')}`);
      }

      const out = { ...body, assertions: merged };
      delete out.mode;
      // Carry forward any sibling top-level block the poster did not send
      // (e.g. `connected_assets`) for the same reason: absence is not intent.
      if (prior && !replace) {
        for (const k of Object.keys(prior)) {
          if (k !== 'assertions' && k !== 'received_at' && !(k in out)) out[k] = prior[k];
        }
      }
      out.received_at = new Date().toISOString();

      await env.KKME_SIGNALS.put('s4_buildability', JSON.stringify(out));
      const added = Object.keys(incoming).filter(k => !(k in priorAssertions));
      console.log(`[S4/buildability] ${Object.keys(incoming).length} pushed · ${added.length} new · ${Object.keys(merged).length} stored${replace ? ' (mode=replace)' : ''}`);
      return jsonResp({
        ok: true,
        mode: replace ? 'replace' : 'merge',
        assertions_pushed: Object.keys(incoming).length,
        assertions_stored: Object.keys(merged).length,
        assertions_preserved: Object.keys(merged).length - Object.keys(incoming).length,
        dropped: replace ? dropped : [],
      });
    }

    // ── POST /s4/sync-layer3 ──────────────────────────────────────────────────
    // Manual trigger for Litgrid Layer 3 Kaupikliai → fleet KV sync.
    // Also runs automatically in the 4-hourly cron.
    if (request.method === 'POST' && url.pathname === '/s4/sync-layer3') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      try {
        const result = await syncLitgridFleet(env);
        return jsonResp({ ok: true, ...result });
      } catch (err) {
        return jsonResp({ error: String(err) }, 500);
      }
    }

    // ── POST /s4/pipeline ────────────────────────────────────────────────────
    // VERT.lt permit pipeline metrics (monthly, pushed by local fetch-vert.js).
    if (request.method === 'POST' && url.pathname === '/s4/pipeline') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      await env.KKME_SIGNALS.put('s4_pipeline', JSON.stringify(body));
      console.log(`[S4/pipeline] dev=${body.dev_total_mw}MW gen=${body.gen_total_mw}MW expiring2027=${body.dev_expiring_2027}MW`);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /s4 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s4') {
      const [s4Raw, pipelineRaw, buildRaw, fleetRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('s4_pipeline'),
        env.KKME_SIGNALS.get('s4_buildability'),
        (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
          .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
      ]);
      if (s4Raw) {
        try {
          const d = JSON.parse(s4Raw);
          if (pipelineRaw) {
            const p = JSON.parse(pipelineRaw);
            d.pipeline = {
              dev_total_mw:       p.dev_total_mw       ?? null,
              dev_total_raw_mw:   p.dev_total_raw_mw   ?? null,
              filter_applied:     p.filter_applied     ?? null,
              dev_count_filtered: p.dev_count_filtered ?? null,
              dev_count_raw:      p.dev_count_raw      ?? null,
              parse_warning:      p.parse_warning      ?? null,
              gen_total_mw:       p.gen_total_mw       ?? null,
              dev_velocity_3m:    p.dev_velocity_3m    ?? null,
              dev_expiring_2027:  p.dev_expiring_2027  ?? null,
              top_projects:       p.top_projects       ?? [],
              updated_at:         p.timestamp          ?? null,
            };
          }

          // Use assertion-backed values from KV if available, otherwise static defaults
          const build = buildRaw ? JSON.parse(buildRaw) : null;
          const a = build?.assertions || {};
          const getVal = (key, fallback) => a[key]?.value ?? fallback;
          const getUrl = (key, fallback) => a[key]?.source_url ?? fallback;
          const getAsOf = (key, fallback) => a[key]?.as_of_date ?? fallback;

          // Phase 12.10 — `installed_storage_<c>_mw_live` is the daily VPS-Python
          // ingest of ENTSO-E A68 (production type B25). It supplements (does
          // NOT replace) the operator-curated `installed_storage_<c>_mw`; the
          // frontend selector `getInstalledMw` (app/lib/metricRegistry.ts)
          // prefers `_live` when present and falls back to the hardcode otherwise.
          // See scripts/vps/fetch_entsoe_installed_capacity.py for the ingest path.
          const liveLt = a.installed_storage_lt_mw_live || null;
          const liveLv = a.installed_storage_lv_mw_live || null;
          const liveEe = a.installed_storage_ee_mw_live || null;

          d.storage_reference = {
            source: `Litgrid, ${a.installed_storage_lt_mw?.as_of_date || '2026-03-23'}`,
            source_url: getUrl('installed_storage_lt_mw', 'https://www.litgrid.eu/index.php/naujienos/naujienos/prie-elektros-perdavimo-tinklo-prijungta-trecioji-komercine-30-mw-galios-bateriju-kaupimo-sistema-/36502'),
            installed_mw: getVal('installed_storage_lt_mw', 484),
            installed_mw_live: liveLt?.value ?? null,
            installed_mw_live_as_of: liveLt?.as_of_date ?? null,
            installed_mw_live_source_url: liveLt?.source_url ?? null,
            installed_mw_as_of: getAsOf('installed_storage_lt_mw', '2026-03-23'),
            installed_gen_mw: getVal('installed_storage_lt_gen_mw', 420),
            installed_mwh: getVal('installed_storage_lt_mwh', 719),
            note: 'Distribution + transmission combined, national total',
            // Phase 12.10 — Pause A Option B: hardcode is the primary fallback when
            // ENTSO-E A68 (B25) live-fetch returns null/unavailable. Distribution-
            // grid Litgrid Kaupikliai (~+153 MW) not yet enumerated in fleet tracker;
            // refresh planned 2026-Q3 once Litgrid publishes per-DSO breakdown.
            coverage_note: 'Includes TSO-grid storage (Litgrid Įrengtoji galia ~353 MW transmission). +153 MW distribution-grid Kaupikliai tracked by Litgrid not yet enumerated — refresh 2026-Q3. Hardcode is the operator-curated fallback when ENTSO-E A68 live-fetch is unavailable.',
            from_assertions: !!build,
          };
          d.storage_pipeline = {
            tso_reserved_mw: getVal('reserved_storage_lt_mw', 1395),
            tso_reserved_mwh: getVal('reserved_storage_lt_mwh', 3204),
            source: 'Litgrid reservation cycle',
            source_url: getUrl('reserved_storage_lt_mw', 'https://www.litgrid.eu/index.php/naujienos/naujienos/litgrid-per-3-menesius-preliminariai-rezervavo-17-gw-galios-saules-ir-vejo-elektrinems-bei-kaupimo-irenginiams/36506'),
            intention_protocols_mw: getVal('intention_storage_lt_mw', 3700),
            intention_protocols_mwh: 9000,
            apva_applied_mw: getVal('apva_applied_storage_lt_mw', 1545),
            apva_applied_mwh: 3232,
            apva_budget_eur: 45000000,
            apva_source_url: getUrl('apva_applied_storage_lt_mw', 'https://apva.lrv.lt/lt/naujienos-24316/uzbaigtas-45-mln-euru-kvietimas-elektros-kaupimo-irenginiams-rinkos-poreikis-virsijo-skirta-suma-k2R'),
            from_assertions: !!build,
          };
          d.grid_caveat = 'Grid capacity figures from VERT.lt ArcGIS represent ALL technologies (wind, solar, thermal, storage, consumption). They are non-additive across zones per Litgrid methodology. Do not interpret as storage-specific capacity.';
          d.source_urls = {
            vert_arcgis: 'https://atviri-litgrid.hub.arcgis.com/',
            litgrid: 'https://www.litgrid.eu/',
            vert_permits: 'https://vert.lt/atsinaujinantys-istekliai/SiteAssets/2026-02/Leidimai%20pl%C4%97toti%20kaupimo%20paj%C4%97gumus%20%202026-02-28.pdf',
            apva: 'https://apva.lrv.lt/',
            eso_maps: 'https://www.eso.lt/verslui/elektra/elektros-liniju-zemelapiai/transformatoriu-pastociu-laisvu-galiu-zemelapis-vartotojams/3931',
            litgrid_aei: 'https://www.litgrid.eu/index.php/aei-centras/aei-elektriniu-prijungimo-zemelapis/32331',
          };

          // Storage by country — Baltic country breakdown
          const ltMw = getVal('installed_storage_lt_mw', 484);
          const lvMw = getVal('installed_storage_lv_mw', 80);
          const eeMw = getVal('installed_storage_ee_mw', 127);
          const eeUcMw = getVal('under_construction_storage_ee_mw', 255);

          d.storage_by_country = {
            LT: {
              installed_mw: ltMw,
              installed_mw_live: liveLt?.value ?? null,
              installed_mw_live_as_of: liveLt?.as_of_date ?? null,
              installed_mw_live_source_url: liveLt?.source_url ?? null,
              installed_mw_as_of: getAsOf('installed_storage_lt_mw', '2026-03-23'),
              installed_mw_source_url: getUrl('installed_storage_lt_mw', 'https://www.litgrid.eu/'),
              installed_gen_mw: getVal('installed_storage_lt_gen_mw', 420),
              installed_mwh: getVal('installed_storage_lt_mwh', 719),
              tso_reserved_mw: getVal('reserved_storage_lt_mw', 1395),
              intention_mw: getVal('intention_storage_lt_mw', 3700),
              apva_applied_mw: getVal('apva_applied_storage_lt_mw', 1545),
              source: 'Litgrid',
              source_url: 'https://www.litgrid.eu/',
              assets: [
                { id: 'e-energija', name: 'E energija BESS', mw: 65, mwh: 130, status: 'operational', source_url: 'https://www.litgrid.eu/' },
                { id: 'kruonis-psp', name: 'Kruonis PSP', mw: 205, status: 'operational', type: 'pumped_hydro', note: 'DRR resource — FCR/aFRR suppression until ~2028-02' },
                { id: 'litgrid-bess-3', name: 'Third commercial 30MW BESS', mw: 30, status: 'operational', source_url: d.storage_reference?.source_url },
              ],
            },
            LV: {
              installed_mw: lvMw,
              installed_mw_live: liveLv?.value ?? null,
              installed_mw_live_as_of: liveLv?.as_of_date ?? null,
              installed_mw_live_source_url: liveLv?.source_url ?? null,
              installed_mw_as_of: getAsOf('installed_storage_lv_mw', null),
              installed_mw_source_url: getUrl('installed_storage_lv_mw', 'https://www.ast.lv/'),
              source: 'AST',
              source_url: 'https://www.ast.lv/',
              coverage_note: 'AST owns Rēzekne 60 MW + Tume 20 MW = 80 MW operational (balancing reserves from 2025-10-30, RRF/CEF-funded). Commercial LV fleet is small: Utilitas Targale (10 MW, op. Nov 2024) + AJ Power (9 MW agg, op. 2025) tracked in /s4.projects with primary sources (Phase 33.A.2.b). LV permit registers (SPRK/BIS/VVD) carry no clean BESS data; pipeline discovery via press-RSS tripwire.',
              assets: [
                { id: 'ast-bess-rezekne', name: 'AST BESS (Rēzekne)', mw: 60, status: 'operational', tech: 'li-ion', note: 'TSO-owned. 120 MWh. Rolls-Royce Solutions. RRF/CEF funded. Balancing reserves from 2025-10-30.' },
                { id: 'ast-bess-tume', name: 'AST BESS (Tume)', mw: 20, status: 'operational', tech: 'li-ion', note: 'TSO-owned. 40 MWh. AST estimates €20M/yr savings from 2026.' },
              ],
            },
            EE: {
              installed_mw: eeMw,
              installed_mw_live: liveEe?.value ?? null,
              installed_mw_live_as_of: liveEe?.as_of_date ?? null,
              installed_mw_live_source_url: liveEe?.source_url ?? null,
              installed_mw_as_of: getAsOf('installed_storage_ee_mw', null),
              installed_mw_source_url: getUrl('installed_storage_ee_mw', 'https://en.evecon.ee/'),
              under_construction_mw: eeUcMw,
              source: 'Evecon / Elering',
              source_url: 'https://en.evecon.ee/',
              coverage_note: `${eeMw} MW operational since Feb 2026, ${eeUcMw} MW under construction. Estonia BESS market emerging fast. Phase 12.10: BSP Hertz 1 (100 MW) + Eesti Energia BESS (26.5 MW) flagged _quarantine pending TSO operational evidence — fleet selector renders strict (excluding) by default; full ${eeMw} MW retained as inclusive view via /macro_context disclosure. ENTSO-E A68 reconciliation: Elering classifies BSP Hertz 2 (100 MW under construction) as installed for transparency reporting, so installed_mw_live (per A68 B25, currently ~218 MW) typically exceeds the KKME fleet-tracker commissioned total (${eeMw} MW) by ~92 MW. Definitional gap, not a contradiction; reconciliation tracked for Phase 12.12.`,
              assets: [
                { id: 'bsp-hertz-1', name: 'BSP Hertz 1 (Kiisa)', mw: 100, mwh: 200, status: 'operational', cod: '2026-02-05', source_url: 'https://en.evecon.ee/estonia-strengthens-energy-resilience-hertz-1-one-of-continental-europes-largest-battery-storage-parks-opens-in-kiisa/', note: 'Evecon+Corsica Sole+Mirova JV. EBRD+NIB €85.6M.' },
                { id: 'eesti-energia', name: 'Eesti Energia BESS', mw: 26.5, mwh: 53.1, status: 'operational', cod: '2025-02-01', note: 'Estonia first grid-scale BESS. State utility.' },
                { id: 'bsp-hertz-2', name: 'BSP Hertz 2 (Arukylä)', mw: 100, mwh: 200, status: 'under_construction', note: 'COD end-2026. Nidec integrator.' },
                { id: 'evecon-kirikmaee', name: 'Evecon Kirikmäe BESS', mw: 55, mwh: 250, status: 'under_construction', note: 'Hybrid 77.5MWp PV. Huawei batteries. €85M Swedbank.' },
                { id: 'zirgu-phase1', name: 'Zirgu BESS Phase 1', mw: 100, mwh: 200, status: 'under_construction', note: '€35M. Diotech+Transcom. Up to 200MW/800MWh planned.' },
              ],
            },
          };
          // Phase 38.2 (B-058) — this read
          // `getVal('installed_storage_baltic_mw', ltMw + lvMw + eeMw)`, so a
          // STORED ASSERTION won over the sum of the three country figures
          // printed beside it. On 2026-08-03 the assertion held 651 and
          // 484 + 40 + 127 = 651, so the second writer was invisible — the
          // B12 shape exactly: a duplicate that agrees today. The moment any
          // country moved, the Baltic headline would have kept publishing the
          // old total while silently ceasing to be the sum, and nothing would
          // have detected it because both writers were "working".
          //
          // A total defined as the sum is now computed as the sum. There is no
          // override, deliberately: an override on a derived quantity is the
          // defect, not a feature of it (discipline rule #4). Asserted by
          // workers/__tests__/balticTotalIsTheSum.test.ts.
          d.baltic_total = {
            installed_mw: ltMw + lvMw + eeMw,
            under_construction_mw: eeUcMw + 361, // EE UC + LT UC (Ignitis 291 + Olana 70)
          };

          // Merge fleet tracker data (migrated from S2)
          if (fleetRaw) {
            try {
              const fl = JSON.parse(fleetRaw);
              // Phase 38.2 — this was a hand-maintained 10-field whitelist. It
              // copied `baltic_weighted_mw`'s NEIGHBOURS and not the field
              // itself, so 36.D's canonical S/D caption — guarded on that field
              // at every call site — never rendered on /s4-fed surfaces after
              // it shipped, and the composition tooltip lost its strict count.
              // A shipped, signed-off fix was dark for two months and no gate
              // could see it: the whitelist fails by OMISSION, which produces
              // no error, no null, no log (playbook B8).
              //
              // Inverted: everything processFleet computes now reaches /s4
              // unless it is explicitly excluded here, so a new aggregate is
              // published by default rather than silently dropped by default.
              // Exclusions are the two heavy/internal keys only:
              //   raw_entries — republished separately as d.projects below
              //   demand      — the operator override, never a display field
              const fleetAggregates = { ...fl };
              delete fleetAggregates.raw_entries;
              delete fleetAggregates.demand;
              d.fleet = {
                ...fleetAggregates,
                updated: fl.updated_at ?? null,   // legacy alias, retained
              };

              // Expose individual projects from fleet tracker
              const entries = fl.raw_entries || [];
              d.projects = entries;
              const counts = { total: entries.length, by_country: {}, by_status: {}, total_mw: 0 };
              for (const p of entries) {
                const c = p.country || 'unknown';
                const s = p.status || 'unknown';
                counts.by_country[c] = (counts.by_country[c] || 0) + 1;
                counts.by_status[s] = (counts.by_status[s] || 0) + 1;
                counts.total_mw += parseFloat(p.mw || 0);
              }
              counts.total_mw = Math.round(counts.total_mw * 10) / 10;
              d.project_counts = counts;
            } catch { /* ignore */ }
          }

          return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        } catch { /* fall through */ }
      }
      try {
        const data = await computeS4();
        await env.KKME_SIGNALS.put('s4', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── GET /da_tomorrow ─────────────────────────────────────────────────────
    // Cached DA prices for LT+SE4; populated by cron or POST /da_tomorrow/update.
    // `da_tomorrow:lastgood` mirrors every successful write so a transient upstream
    // failure can still serve a previous-day payload (with X-Stale headers) instead
    // of returning 500.
    if (request.method === 'GET' && url.pathname === '/da_tomorrow') {
      const cached = await env.KKME_SIGNALS.get('da_tomorrow');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await fetchNordPoolDA();
        const body = JSON.stringify(data);
        await Promise.all([
          env.KKME_SIGNALS.put('da_tomorrow', body),
          env.KKME_SIGNALS.put('da_tomorrow:lastgood', body),
        ]);
        return new Response(body, { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        const stale = await env.KKME_SIGNALS.get('da_tomorrow:lastgood').catch(() => null);
        if (stale) {
          return new Response(stale, {
            headers: {
              'Content-Type':   'application/json',
              'Cache-Control':  'public, max-age=600',
              'X-Stale':        'true',
              'X-Stale-Reason': 'upstream-fetch-failed',
              ...CORS,
            },
          });
        }
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── POST /da_tomorrow/update ─────────────────────────────────────────────
    // External push fallback: accepts raw { lt_prices, se4_prices } OR pre-computed metrics.
    if (request.method === 'POST' && url.pathname === '/da_tomorrow/update') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let metrics;
      if (Array.isArray(body.lt_prices) && Array.isArray(body.se4_prices)) {
        metrics = npShapeMetrics(body.lt_prices, body.se4_prices);
        if (!metrics) return new Response(JSON.stringify({ error: 'No valid price data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
        // Phase 36.C (B0-G) — persist the array, not just its summary. This
        // push path had the same defect as computeS1: callers were already
        // sending lt_prices and the endpoint threw it away after computing
        // aggregates, so mode=forecast starved on both writers.
        metrics = { ...metrics, ...daResolutionFields(body.lt_prices), se4_prices: body.se4_prices };
      } else {
        metrics = { lt_peak: body.lt_peak ?? null, lt_trough: body.lt_trough ?? null, lt_avg: body.lt_avg ?? null, se4_avg: body.se4_avg ?? null, spread_pct: body.spread_pct ?? null };
      }
      const payload = { ...metrics, delivery_date: body.delivery_date ?? null, timestamp: new Date().toISOString() };
      const payloadBody = JSON.stringify(payload);
      await Promise.all([
        env.KKME_SIGNALS.put('da_tomorrow', payloadBody),
        env.KKME_SIGNALS.put('da_tomorrow:lastgood', payloadBody),
      ]);
      console.log(`[NP/DA/update] lt_avg=${payload.lt_avg} lt_peak=${payload.lt_peak} spread=${payload.spread_pct}%`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /index/baltic ────────────────────────────────────────────────────
    // KKME Baltic Storage Index — monthly per-country per-duration revenue
    // benchmark (€/MW/month). Populated daily by VPS Python
    // `scripts/vps/baltic_storage_index.py` via `POST /index/update`.
    // Phase 29 ships LT/{2h,4h} canonical; LV, EE, and 1h slots return null
    // with `coverage_status` set per option-ε scope decision.
    if (request.method === 'GET' && url.pathname === '/index/baltic') {
      const cached = await env.KKME_SIGNALS.get('baltic_storage_index_latest');
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      }
      return new Response(
        JSON.stringify({ error: 'no_index_snapshot_yet', hint: 'awaiting first VPS Python push via POST /index/update' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── POST /index/update ───────────────────────────────────────────────────
    // VPS Python pushes the latest Baltic Storage Index snapshot.
    // UPDATE_SECRET-gated. Mirrors `POST /da_tomorrow/update` shape.
    // Validates the JSON shape (month + per-country dur slots) and writes to
    // `baltic_storage_index_latest` KV (consumed by GET /index/baltic) plus a
    // rolling 12-month deque in `baltic_storage_index_history` for sparkline
    // history beyond the per-snapshot trailing_6_months payload.
    if (request.method === 'POST' && url.pathname === '/index/update') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      // Minimal shape validation — month must be 'YYYY-MM' and per-country
      // slots must be objects (values may legitimately be null per the
      // coverage_pending design).
      if (!body || typeof body.month !== 'string' || !/^\d{4}-\d{2}$/.test(body.month)) {
        return new Response(JSON.stringify({ error: 'invalid month; expected YYYY-MM' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      for (const c of ['lt', 'lv', 'ee']) {
        if (!body[c] || typeof body[c] !== 'object') {
          return new Response(JSON.stringify({ error: `missing per-country slot: ${c}` }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
          });
        }
      }
      body.timestamp = body.timestamp || new Date().toISOString();
      body.received_at = new Date().toISOString();
      const payloadBody = JSON.stringify(body);

      // Roll history: keep last 12 distinct months by `month`, replace if same
      // month re-pushed. Same shape as the per-snapshot trailing_6_months row.
      let history = [];
      try {
        const histRaw = await env.KKME_SIGNALS.get('baltic_storage_index_history');
        if (histRaw) history = JSON.parse(histRaw);
      } catch { /* start fresh */ }
      history = history.filter(h => h.month !== body.month);
      history.push({ month: body.month, lt: body.lt, lv: body.lv, ee: body.ee });
      history.sort((a, b) => a.month.localeCompare(b.month));
      if (history.length > 12) history = history.slice(-12);

      await Promise.all([
        env.KKME_SIGNALS.put('baltic_storage_index_latest', payloadBody),
        env.KKME_SIGNALS.put('baltic_storage_index_history', JSON.stringify(history)),
      ]);
      console.log(`[Index/update] month=${body.month} lt_2h=${body.lt['2h']} lt_4h=${body.lt['4h']} engine=${body.engine_version}`);
      return new Response(
        JSON.stringify({ ok: true, month: body.month, history_months: history.length }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── POST /calculator/login ───────────────────────────────────────────────
    // Phase 35.1 — BESS Revenue Calculator, operator auth.
    //
    // CALC_SECRET is a NEW secret, deliberately not UPDATE_SECRET: the admin
    // secret authorises data mutation and must never be typed into a browser.
    if (request.method === 'POST' && url.pathname === '/calculator/login') {
      if (!env.CALC_SECRET) {
        return new Response(
          JSON.stringify({ error: CALC.CALC_COPY.auth_unconfigured }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
      let body = {};
      try { body = await request.json(); } catch { /* handled below */ }
      const password = body?.password;
      if (typeof password !== 'string' || !CALC.timingSafeEqual(password, env.CALC_SECRET)) {
        return new Response(
          JSON.stringify({ error: CALC.CALC_COPY.auth_failed }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
      const expires = Date.now() + CALC.CALC_TOKEN_TTL_MS;
      const token = await CALC.signCalcToken(env.CALC_SECRET, expires);
      return new Response(
        JSON.stringify({ token, expires }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── POST /calculate ──────────────────────────────────────────────────────
    // Two tiers off one engine run path. No auth → sample; bearer token → full.
    // Additive: /revenue is untouched by this route.
    if (request.method === 'POST' && url.pathname === '/calculate') {
      let body = null;
      try { body = await request.json(); } catch {
        return new Response(
          JSON.stringify({ errors: ['Request body must be valid JSON.'] }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }

      const v = CALC.validateCalcInput(body);
      if (!v.ok) {
        return new Response(
          JSON.stringify({ errors: v.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
      const inputs = v.inputs;

      // Tier resolution. An invalid or expired token is NOT an error — it falls
      // back to the sample tier, so a stale localStorage token degrades to the
      // public view instead of a dead page.
      const token = CALC.bearerToken(request);
      const auth = token ? await CALC.verifyCalcToken(env.CALC_SECRET, token) : { ok: false };
      const full = auth.ok === true;

      if (!full) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rl = await CALC.checkSampleRateLimit(env.KKME_SIGNALS, ip);
        if (!rl.allowed) {
          return new Response(
            JSON.stringify({
              error: CALC.CALC_COPY.rate_limited,
              limit: rl.limit,
              upsell: CALC.CALC_COPY.upsell,
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } },
          );
        }
      }

      try {
        const kv = await loadEngineKV(env);
        const configs = CALC.buildConfigs(inputs);
        const scenarioKey = CALC.CLIENT_SCENARIO_KEYS[inputs.scenario];
        const { result, bridge, config } = CALC.runOne(
          computeRevenueV7, kv, configs, inputs, scenarioKey
        );
        const inputs_echo = CALC.inputsEcho(inputs, configs);
        const engine_version = result.model_version;

        // The sample builder is handed the narrowed pieces only — the engine
        // result is not in its scope, so there is nothing for a later edit to
        // leak by accident. Asserted by the leak test at both levels.
        const payload = full
          ? CALC.buildFull({
              result,
              bridge,
              config,
              scenarios: CALC.runScenarios(computeRevenueV7, kv, configs, inputs),
              sensitivity: CALC.runSensitivity(
                computeRevenueV7, kv, configs, inputs, bridge.bridge_y1.project_ebitda
              ),
              inputs_echo,
              engine_version,
            })
          : CALC.buildSample({
              headline: CALC.headlineOf(bridge.bridge_y1),
              bridge_y1: bridge.bridge_y1,
              inputs_echo,
              engine_version,
            });

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        console.error('[calculate] failed:', e.message, e.stack);
        return new Response(
          JSON.stringify({ errors: ['The engine could not compute this configuration. ' + e.message] }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }
    }

    // ── GET /revenue ─────────────────────────────────────────────────────────
    // Revenue Engine v4: 3-scenario, DSCR, COD sensitivity, CPI-based pricing.
    // Query params: system=2h|2.4h|4h  capex=low|mid|high  grant=none|partial  cod=2027|2028|2029
    // NOT cached — params vary per request.
    if (request.method === 'GET' && url.pathname === '/revenue') {
      // ── Parse query params (v6 names with backward compat) ──
      const CAPEX_MAP = { low: 120, mid: 164, high: 262 };
      const DUR_MAP   = { '2h': 2, '4h': 4 };

      const durParam    = url.searchParams.get('dur') || url.searchParams.get('system') || '2h';
      const capexParam  = url.searchParams.get('capex')    || 'mid';
      const codParam    = parseInt(url.searchParams.get('cod')) || 2028;
      const scenParam   = url.searchParams.get('scenario') || 'base';
      const mwParam     = parseInt(url.searchParams.get('mw')) || 50;
      const grantPct    = parseFloat(url.searchParams.get('grant_pct') || '0');

      const dur_h     = DUR_MAP[durParam] || parseFloat(durParam) || 2;
      const capex_kwh = CAPEX_MAP[capexParam] || parseInt(capexParam) || 164;

      // ── Read KV data (v7: additional keys for observed base year) ──
      // Phase 35.1: extracted to loadEngineKV() so /calculate feeds the engine
      // from exactly the same keys and the same parsing. Two copies of this
      // block is precisely how the calculator and the public site would drift
      // apart without anyone noticing (discipline rule #4).
      const kv = await loadEngineKV(env);
      const { s1, s2, euribor: eur, s1_capture } = kv;
      flagOutOfBandS2Capacity(s2);
      ctx.waitUntil(persistCapacityWatch(env, s2)); // Phase 33.B.3 — KV-persist, off the response path

      // ── Primary result (v7: observed base year) ──
      const computeEngine = computeRevenueV7;
      let result;
      try {
        result = computeEngine(
          { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct },
          kv
        );
      } catch (e) {
        console.error('[Revenue/v7] computeEngine failed, falling back to v6:', e.message, e.stack);
        result = computeRevenueV6(
          { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct },
          kv
        );
        result.model_version = 'v6_error_fallback';
        result._v7_error = e.message;
      }

      // ── Live rate (today vs base year) ──
      try {
        const sc_cfg_lr = REVENUE_SCENARIOS[scenParam] || REVENUE_SCENARIOS.base;
        result.live_rate = computeLiveRate(kv, result.base_year, dur_h, sc_cfg_lr);
      } catch (e) {
        console.error('[Revenue/v7] computeLiveRate failed:', e.message);
        result.live_rate = { error: e.message };
      }

      // ── All 3 scenarios for primary config ──
      const all_scenarios = {};
      for (const sc of ['base', 'conservative', 'stress']) {
        if (sc === scenParam) {
          all_scenarios[sc] = result;
        } else {
          all_scenarios[sc] = computeEngine(
            { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: sc, grant_pct: grantPct },
            kv
          );
        }
      }
      result.all_scenarios = {
        base:         { project_irr: all_scenarios.base.project_irr, equity_irr: all_scenarios.base.equity_irr, min_dscr: all_scenarios.base.min_dscr, net_mw_yr: all_scenarios.base.net_mw_yr, bankability: all_scenarios.base.bankability, ebitda_y1: all_scenarios.base.ebitda_y1 },
        conservative: { project_irr: all_scenarios.conservative.project_irr, equity_irr: all_scenarios.conservative.equity_irr, min_dscr: all_scenarios.conservative.min_dscr, net_mw_yr: all_scenarios.conservative.net_mw_yr, bankability: all_scenarios.conservative.bankability, ebitda_y1: all_scenarios.conservative.ebitda_y1 },
        stress:       { project_irr: all_scenarios.stress.project_irr, equity_irr: all_scenarios.stress.equity_irr, min_dscr: all_scenarios.stress.min_dscr, net_mw_yr: all_scenarios.stress.net_mw_yr, bankability: all_scenarios.stress.bankability, ebitda_y1: all_scenarios.stress.ebitda_y1 },
      };

      // ── Sensitivity matrix: 3 COD × 3 CAPEX = 9 cells ──
      // Matrix re-runs computeEngine for each (cod, capex) cell. Honours the
      // user's scenario param so toggling base/conservative/stress on the
      // Returns card moves the matrix in lockstep with the headline IRR.
      const COD_YEARS  = [2027, 2028, 2029];
      const CAPEX_KEYS = ['low', 'mid', 'high'];
      const matrix = [];
      for (const cy of COD_YEARS) {
        for (const ck of CAPEX_KEYS) {
          const ckv = CAPEX_MAP[ck];
          if (cy === codParam && ckv === capex_kwh) {
            // Reuse the headline scenario result for the current cell.
            const cur = all_scenarios[scenParam] || all_scenarios.base;
            matrix.push({ cod: cy, capex: ck, capex_kwh: ckv, project_irr: cur.project_irr, equity_irr: cur.equity_irr, min_dscr: cur.min_dscr, net_mw_yr: cur.net_mw_yr, bankability: cur.bankability });
          } else {
            const mr = computeEngine(
              { mw: mwParam, dur_h, capex_kwh: ckv, cod_year: cy, scenario: scenParam, grant_pct: grantPct },
              kv
            );
            matrix.push({ cod: cy, capex: ck, capex_kwh: ckv, project_irr: mr.project_irr, equity_irr: mr.equity_irr, min_dscr: mr.min_dscr, net_mw_yr: mr.net_mw_yr, bankability: mr.bankability });
          }
        }
      }
      result.matrix = matrix;

      // ── h2/h4 backward compat ──
      const r2h = dur_h === 2 ? result : computeEngine({ mw: 50, dur_h: 2, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct }, kv);
      const r4h = dur_h === 4 ? result : computeEngine({ mw: 50, dur_h: 4, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct }, kv);
      result.irr_2h       = r2h.project_irr;
      result.net_mw_yr_2h = r2h.net_mw_yr;
      result.irr_4h       = r4h.project_irr;
      result.net_mw_yr_4h = r4h.net_mw_yr;

      // ── v7.2 — Phase 7.7c Session 1 — duration optimizer hint ──
      // Thin derived field: compares irr_2h / irr_4h already computed above. No new math.
      const dur_2 = r2h.project_irr;
      const dur_4 = r4h.project_irr;
      if (dur_2 != null && dur_4 != null) {
        const dur_optimal = dur_4 > dur_2 ? 4 : 2;
        const dur_delta_pp = Math.round(Math.abs(dur_4 - dur_2) * 10000) / 100;
        result.duration_recommendation = {
          current_default: dur_h,
          optimal: dur_optimal,
          delta_pp: dur_delta_pp,
          irr_2h: dur_2,
          irr_4h: dur_4,
          note: dur_optimal === 4
            ? `4h dominates by +${dur_delta_pp}pp at current spreads; 2h recovers if spread compression slows.`
            : `2h dominates by +${dur_delta_pp}pp at current spreads; 4h recovers as forward spreads compress.`,
        };
      } else {
        result.duration_recommendation = {
          current_default: dur_h,
          optimal: null,
          delta_pp: null,
          irr_2h: dur_2,
          irr_4h: dur_4,
          note: 'Insufficient IRR data to compare durations.',
        };
      }

      // Phase 49 item 2 — `Math.round(null * 1000) / 10` is 0, so a null IRR
      // rendered here as a flat 0 %: the null contract says null means
      // "undefined", and 0 % is a number. Three sites, one helper.
      const irrPct = (v) => (v == null ? null : Math.round(v * 1000) / 10);
      result.h2 = {
        capex_per_mw: r2h.gross_capex / 50, irr_approx_pct: irrPct(r2h.project_irr),
        simple_payback_years: r2h.simple_payback_years,
        afrr_annual_per_mw: Math.round(r2h.capacity_y1 * 0.38), mfrr_annual_per_mw: Math.round(r2h.capacity_y1 * 0.27),
        trading_annual_per_mw: r2h.arbitrage_y1, gross_annual_per_mw: r2h.gross_revenue_y1 / 50,
        opex_annual_per_mw: r2h.opex_y1 / 50, net_annual_per_mw: r2h.net_revenue_y1 / 50,
        ch_irr_central: 16.6, ch_irr_range: '6%–31%',
      };
      result.h4 = {
        capex_per_mw: r4h.gross_capex / 50, irr_approx_pct: irrPct(r4h.project_irr),
        simple_payback_years: r4h.simple_payback_years,
        afrr_annual_per_mw: Math.round(r4h.capacity_y1 * 0.38), mfrr_annual_per_mw: Math.round(r4h.capacity_y1 * 0.27),
        trading_annual_per_mw: r4h.arbitrage_y1, gross_annual_per_mw: r4h.gross_revenue_y1 / 50,
        opex_annual_per_mw: r4h.opex_y1 / 50, net_annual_per_mw: r4h.net_revenue_y1 / 50,
        ch_irr_central: 10.8, ch_irr_range: '6%–20%',
      };

      // ── EU market ranking ──
      const legacyPrices = {
        afrr_up_avg:            s2?.afrr_up_avg             ?? 20,
        mfrr_up_avg:            s2?.mfrr_up_avg             ?? 15,
        spread_eur_mwh:         s1?.spread_eur_mwh          ?? 15,
        lt_daily_swing_eur_mwh: s1?.lt_daily_swing_eur_mwh ?? null,
        euribor_3m:             eur?.euribor_3m             ?? 2.6,
      };
      result.eu_ranking = computeMarketComparisonWorker(legacyPrices);
      if (result.eu_ranking) {
        const lt = result.eu_ranking.find(m => m.country === 'Lithuania');
        // Same null-renders-as-zero trap as h2/h4 above (Phase 49 item 2): this
        // one would have put Lithuania at a flat 0 % in a ranking of eight
        // markets and sorted it accordingly.
        if (lt) lt.irr_pct = result.project_irr == null ? null : Math.round(result.project_irr * 1000) / 10;
      }

      result.prices = { afrr_up_avg: s2?.afrr_up_avg ?? null, mfrr_up_avg: s2?.mfrr_up_avg ?? null, spread_eur_mwh: s1?.spread_eur_mwh ?? null, euribor_3m: eur?.euribor_3m ?? null };
      result.updated_at = result.timestamp;

      // ── Backtest: use price-ratio mix for trading/balancing split ──
      const sc_cfg = REVENUE_SCENARIOS[scenParam] || REVENUE_SCENARIOS.base;
      const si = result.signal_inputs || {};
      const bt_mix = result.base_year?.time_model?.trading_fraction != null
        ? { trading_fraction: result.base_year.time_model.trading_fraction }
        : computeTradingMix(kv, dur_h, 2026, 'base', sc_cfg);

      const capMonthly = (s1_capture?.monthly || []).filter(m => m.month && m.days >= 15);
      const backtest = capMonthly.map(m => {
        const capture = durBlend(dur_h,
          m.avg_gross_2h || m.avg_net_2h || 140,
          m.avg_gross_4h || m.avg_net_4h || 125);

        // Balancing revenue per MW per day (current capacity+activation prices)
        const bal_daily = (
          0.16 * sc_cfg.avail * (si.fcr_cap || 45) +
          0.34 * sc_cfg.avail * (si.afrr_cap || 7.7) +
          0.50 * sc_cfg.avail * (si.mfrr_cap || 21.5) +
          0.34 * sc_cfg.avail * sc_cfg.act_rate_afrr * (si.afrr_clearing || 171) * 0.55 +
          0.50 * sc_cfg.avail * sc_cfg.act_rate_mfrr * (si.mfrr_clearing || 81) * 0.75
        ) * 24 * sc_cfg.bal_mult * sc_cfg.real_factor * (1 - sc_cfg.rtm_fee_pct);

        // Trading: capture × RTE × realisation × DA-MWh × fraction (per MW per day)
        // v7.3 throughput-derived: DA daily MWh per MW from mwh_per_mw_yr_da.
        const bt_rte = rteCurveFor(dur_h)[0];
        const bt_da_mwh_per_mw_day = computeThroughputBreakdown(1, dur_h, sc_cfg).da_mwh / 365;
        const trd_daily = capture * bt_rte * (sc_cfg.trd_real || 0.85) * bt_da_mwh_per_mw_day * bt_mix.trading_fraction;

        return {
          month: m.month,
          trading_daily: Math.round(trd_daily),
          balancing_daily: Math.round(bal_daily),
          total_daily: Math.round(trd_daily + bal_daily),
          s1_capture: Math.round(capture * 10) / 10,
          days: m.days,
        };
      });
      result.backtest = backtest;

      // ── What changed: compare to previous snapshot ──
      const prevRaw = await env.KKME_SIGNALS.get('revenue_snapshot_prev').catch(() => null);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;

      // Phase 51 — a delta is only published when the snapshot was computed at
      // the SAME configuration. Differencing a 4h/high snapshot against a 2h/mid
      // request reports a configuration gap as a change over time; measured
      // spread across public configs is ~22 IRR points, so the artefact dwarfs
      // any real day-on-day movement it would be mistaken for.
      const requestConfig = {
        dur: durParam, capex: capexParam, cod: codParam, scenario: scenParam, mw: mwParam,
      };
      const admissible = revenueDeltaAdmissible(prev, requestConfig);

      let deltas = null;
      let deltas_unavailable_reason = admissible.ok ? null : admissible.reason;
      if (admissible.ok) {
        const psi = prev.signal_inputs;
        // `|| 0` silently substitutes zero for an undefined IRR, so a solve that
        // failed on either side would report a movement equal to the OTHER side's
        // whole IRR — a large, confident, entirely invented delta (Phase 49
        // item 2). A delta between a number and a non-number is not a number.
        deltas = {
          irr_pp: (result.project_irr == null || prev.project_irr == null)
            ? null
            : Math.round((result.project_irr - prev.project_irr) * 10000) / 100,
          net_rev: Math.round((result.net_mw_yr || 0) - (prev.net_mw_yr || 0)),
          signals: {},
        };
        for (const key of ['s1_capture', 'afrr_clearing', 'mfrr_clearing', 'afrr_cap', 'mfrr_cap', 'euribor']) {
          if (si[key] !== undefined && psi[key] !== undefined) {
            deltas.signals[key] = {
              current: si[key],
              previous: psi[key],
              delta: Math.round((si[key] - psi[key]) * 100) / 100,
            };
          }
        }
        deltas.prev_date = prev.computed_at;
      }
      result.deltas = deltas;
      // Stated rather than silent: a null delta with no explanation reads as
      // "nothing changed", which is a different claim from "not comparable".
      result.deltas_unavailable_reason = deltas_unavailable_reason;

      // NOTE: this route no longer writes `revenue_snapshot_prev`. The daily
      // cron is the sole writer, at REVENUE_SNAPSHOT_CONFIG — see the block
      // above for why a public GET must not decide when the journal advances,
      // nor at which configuration.

      return jsonResp(result);
    }

    // ── GET /s1/history · /s2/history · /s3/history · /s4/history ───────────
    if (request.method === 'GET' && /^\/(s[1-4])\/history$/.test(url.pathname)) {
      const sig = url.pathname.slice(1, 3); // 's1', 's2', 's3', 's4'
      const histKey = sig === 's1' ? 's1_history' : `${sig}_history`;
      const raw = await env.KKME_SIGNALS.get(histKey).catch(() => null);
      let arr = raw ? JSON.parse(raw) : [];
      // Phase 38.2 (B-056) — `s1_history` accumulated ~6 rows per market day,
      // so a consumer taking `slice(-N)` got N rows spanning far fewer days.
      // Deduping at the read as well as the write means the stored array does
      // not have to have been rewritten for consumers to be correct today.
      if (sig === 's1') arr = dedupeByDateKeepLast(arr);
      return Response.json(arr, { headers: CORS });
    }

    // ── POST /trading/update ─────────────────────────────────────────────────
    // Receives 15-min BTD balancing data from Mac cron. Computes dispatch analysis.
    if (request.method === 'POST' && url.pathname === '/trading/update') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const { date } = body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResp({ error: 'date (YYYY-MM-DD) required' }, 400);

      // Fetch DA hourly prices for this specific date from ENTSO-E A44
      let daHourly = [];
      try {
        const d = new Date(date + 'T00:00:00Z');
        const next = new Date(d.getTime() + 86400000);
        const fmt = dt => {
          const y = dt.getUTCFullYear();
          const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const da = String(dt.getUTCDate()).padStart(2, '0');
          return `${y}${mo}${da}0000`;
        };
        const daUrl = new URL(ENTSOE_API);
        daUrl.searchParams.set('documentType', 'A44');
        daUrl.searchParams.set('in_Domain', LT_BZN);
        daUrl.searchParams.set('out_Domain', LT_BZN);
        daUrl.searchParams.set('periodStart', fmt(d));
        daUrl.searchParams.set('periodEnd', fmt(next));
        daUrl.searchParams.set('securityToken', env.ENTSOE_API_KEY);
        const daRes = await fetch(daUrl.toString());
        if (daRes.ok) {
          const xml = await daRes.text();
          daHourly = extractPrices(xml);
          console.log(`[Trading] ${date} DA prices: ${daHourly.length} hours, avg=€${daHourly.length ? (daHourly.reduce((a,b)=>a+b,0)/daHourly.length).toFixed(1) : '?'}`);
        }
      } catch (e) {
        console.warn(`[Trading] ${date} DA fetch failed: ${e.message}`);
      }
      body.da_hourly = daHourly;

      // Store raw BTD data (90 day TTL)
      await env.KKME_SIGNALS.put(`trading:${date}:raw`, JSON.stringify(body), { expirationTtl: 86400 * 90 });

      // Compute dispatch analysis — old format (backward compat) + new V2
      const analysis = computeDispatch(body, { mw: 60, mwh: 130, rte: RTE_BOL.h2 }); // canonical RTE_BOL (2.2h duration → h2)
      await env.KKME_SIGNALS.put(`trading:${date}`, JSON.stringify(analysis), { expirationTtl: 86400 * 90 });

      // V2 dispatch: 50MW reference, 2H and 4H
      const v2_4h = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 4, mode: 'realised', date_iso: date });
      const v2_2h = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 2, mode: 'realised', date_iso: date });
      // Also compute post-DRR scenarios
      const v2_4h_drr = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 4, mode: 'realised', date_iso: date, drr_active: false });
      const v2_2h_drr = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 2, mode: 'realised', date_iso: date, drr_active: false });

      await env.KKME_SIGNALS.put(`dispatch:${date}:4h`, JSON.stringify(v2_4h), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:2h`, JSON.stringify(v2_2h), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:4h:post_drr`, JSON.stringify(v2_4h_drr), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:2h:post_drr`, JSON.stringify(v2_2h_drr), { expirationTtl: 86400 * 90 });

      console.log(`[Trading] ${date} v1=€${analysis.totals.per_mw}/MW v2_4h=€${v2_4h.revenue_per_mw.daily_eur}/MW v2_2h=€${v2_2h.revenue_per_mw.daily_eur}/MW`);

      // ── Detect extreme activation events ──
      try {
        const actPrices = (body.activation_prices || []).filter(p => p && (p.up || p.down));
        if (actPrices.length > 0) {
          const maxUp = Math.max(...actPrices.map(p => Math.abs(p.up || 0)));
          const maxDown = Math.max(...actPrices.map(p => Math.abs(p.down || 0)));
          const maxAct = Math.max(maxUp, maxDown);
          if (maxAct > 500) {
            const product = maxDown > maxUp ? 'mFRR down' : (maxUp > 200 ? 'aFRR up' : 'mFRR up');
            const price = maxDown > maxUp ? -Math.round(maxDown) : Math.round(maxUp);
            const extremeEvent = {
              type: 'activation_extreme',
              date,
              price: Math.round(maxAct),
              signed_price: price,
              product,
              timestamp: new Date().toISOString(),
              text: `${product} activation cleared at €${price.toLocaleString()}/MWh`,
            };
            // Expire at midnight UTC — extreme events are today's news only
      const midnightMs = new Date().setUTCHours(23, 59, 59, 999) - Date.now();
      const extremeTtl = Math.max(60, Math.floor(midnightMs / 1000));
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(extremeEvent), { expirationTtl: extremeTtl });
            console.log(`[Trading/extreme] ${extremeEvent.text}`);
          }
        }
      } catch (e) { console.warn('[Trading/extreme] detection failed:', e.message); }

      // ── Update rolling dispatch metrics ──
      try {
        const metrics_raw = await env.KKME_SIGNALS.get('trading:metrics');
        const metrics = metrics_raw ? JSON.parse(metrics_raw) : { days: [] };
        const ra = analysis.reserve_availability || {};
        metrics.days.push({
          date,
          revenue_per_mw: Math.round(analysis.totals.per_mw),
          afrr_active_pct: ra.afrr_pct || 0,
          mfrr_active_pct: ra.mfrr_pct || 0,
          fcr_active_pct: ra.fcr_pct || 0,
          // Activation rates: actual energy dispatch (for time-slice model)
          afrr_activation_pct: ra.afrr_activation_pct || 0,
          mfrr_activation_pct: ra.mfrr_activation_pct || 0,
          capacity_pct: analysis.totals.splits_pct?.capacity || 0,
          activation_pct: analysis.totals.splits_pct?.activation || 0,
          arb_pct: analysis.totals.splits_pct?.arbitrage || 0,
        });
        // Deduplicate by date, keep last 90 days
        const seen = new Set();
        metrics.days = metrics.days.filter(d => {
          if (seen.has(d.date)) return false;
          seen.add(d.date);
          return true;
        }).slice(-90);
        // Compute rolling 30-day averages
        const recent = metrics.days.slice(-30);
        if (recent.length >= 3) {
          const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
          metrics.rolling_30d = {
            avg_revenue_per_mw: Math.round(avg(recent.map(d => d.revenue_per_mw))),
            // Procurement rates (typically ~1.0 — BESS offers reserves 24/7)
            avg_afrr_active_pct: Math.round(avg(recent.map(d => d.afrr_active_pct)) * 100) / 100,
            avg_mfrr_active_pct: Math.round(avg(recent.map(d => d.mfrr_active_pct)) * 100) / 100,
            avg_fcr_active_pct: Math.round(avg(recent.map(d => d.fcr_active_pct)) * 100) / 100,
            // Activation rates (fraction of ISPs with actual energy dispatch — for time-slice model)
            // Old days lack activation_pct fields: fall back to 0.18/0.10 defaults (not procurement rate)
            avg_afrr_activation_pct: Math.round(avg(recent.map(d => d.afrr_activation_pct ?? 0.18)) * 100) / 100,
            avg_mfrr_activation_pct: Math.round(avg(recent.map(d => d.mfrr_activation_pct ?? 0.10)) * 100) / 100,
            days_count: recent.length,
            updated: new Date().toISOString(),
          };
        }
        await env.KKME_SIGNALS.put('trading:metrics', JSON.stringify(metrics));
      } catch (e) {
        console.warn('[Trading] metrics update failed:', e.message);
      }

      return jsonResp({ ok: true, date, totals: analysis.totals, signals: analysis.signals });
    }

    // ── GET /api/dispatch — V2 dispatch with parameterized battery ────────────
    // Params: dur (2h|4h), mode (realised|forecast)
    if (request.method === 'GET' && url.pathname === '/api/dispatch') {
      const dur_h = url.searchParams.get('dur') === '2h' ? 2 : 4;
      const mode = url.searchParams.get('mode') === 'forecast' ? 'forecast' : 'realised';

      if (mode === 'realised') {
        // Find latest dispatch date from KV
        const keys = await env.KKME_SIGNALS.list({ prefix: `dispatch:202` });
        const dates = keys.keys.map(k => k.name)
          .filter(k => k.endsWith(`:${dur_h}h`) && !k.includes('post_drr'))
          .sort().reverse();
        if (!dates.length) return jsonResp({ dispatch: null, reason: 'No dispatch data yet — awaiting BTD push (cron ~01:00 UTC)' }, 200);

        const current = await env.KKME_SIGNALS.get(dates[0]).catch(() => null);
        const postDrr = await env.KKME_SIGNALS.get(dates[0] + ':post_drr').catch(() => null);
        if (!current) return jsonResp({ dispatch: null, reason: 'Latest dispatch key listed but body missing — KV eventual-consistency' }, 200);

        const result = JSON.parse(current);
        if (postDrr) {
          const drr = JSON.parse(postDrr);
          result.scenarios = {
            drr_uplift_eur_mw_day: drr.revenue_per_mw.daily_eur - result.revenue_per_mw.daily_eur,
            post_drr_daily_eur: drr.revenue_per_mw.daily_eur,
            post_drr_annual_eur: drr.revenue_per_mw.annual_eur,
          };
        }
        return jsonResp(result);
      }

      // Forecast mode: compute live from da_tomorrow + rolling 180d
      try {
        const [daTomorrowRaw, rollingRaw] = await Promise.all([
          env.KKME_SIGNALS.get('da_tomorrow').catch(() => null),
          env.KKME_SIGNALS.get('s2_rolling_180d').catch(() => null),
        ]);
        if (!daTomorrowRaw) return jsonResp({ forecast: null, reason: 'DA tomorrow publishes ~14:00 CET' }, 200);

        const daTomorrow = JSON.parse(daTomorrowRaw);
        const rolling = rollingRaw ? JSON.parse(rollingRaw) : null;
        const daP = daTomorrow.prices_24h || daTomorrow.lt_prices || [];

        if (!daP.length) return jsonResp({ forecast: null, reason: 'DA tomorrow prices empty' }, 200);

        const synthBTD = rolling ? synthesizeBTDFromRolling(rolling, daTomorrow) : null;

        // Phase 36.C — the delivery date must come from the payload, not from a
        // clock. This read was `daTomorrow.date`, a field no writer produces
        // (they all emit `delivery_date`), so it silently fell through to
        // "whatever tomorrow is" on every request. The forecast would therefore
        // label itself with tomorrow's date regardless of which day's prices it
        // actually held — a date asserting "when" without deriving it, which is
        // exactly what discipline rule #2 forbids.
        const deliveryDate = daTomorrow.delivery_date || daTomorrow.date
          || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

        const current = computeDispatchV2(synthBTD, daP, {
          mw: 50, dur_h, mode: 'forecast',
          date_iso: deliveryDate,
        });
        const postDrr = computeDispatchV2(synthBTD, daP, {
          mw: 50, dur_h, mode: 'forecast', drr_active: false,
          date_iso: current.meta.date_iso,
        });

        current.scenarios = {
          drr_uplift_eur_mw_day: postDrr.revenue_per_mw.daily_eur - current.revenue_per_mw.daily_eur,
          post_drr_daily_eur: postDrr.revenue_per_mw.daily_eur,
          post_drr_annual_eur: postDrr.revenue_per_mw.annual_eur,
        };
        return jsonResp(current);
      } catch (e) {
        return jsonResp({ error: `Forecast failed: ${e.message}` }, 500);
      }
    }

    // ── GET /api/trading ──────────────────────────────────────────────────────
    // Returns dispatch analysis for a specific date (V1 backward compat).
    if (request.method === 'GET' && url.pathname === '/api/trading') {
      const date = url.searchParams.get('date');
      if (!date) return jsonResp({ error: 'date param required (YYYY-MM-DD)' }, 400);
      const cached = await env.KKME_SIGNALS.get(`trading:${date}`).catch(() => null);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', ...CORS } });
      return jsonResp({ error: 'No trading data for this date', date }, 404);
    }

    // ── GET /api/trading/latest ───────────────────────────────────────────────
    // Returns most recent trading day analysis.
    if (request.method === 'GET' && url.pathname === '/api/trading/latest') {
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse();
      if (!dates.length) return jsonResp({ trading: null, reason: 'No trading data yet — awaiting BTD push' }, 200);
      const latest = await env.KKME_SIGNALS.get(dates[0]);
      if (!latest) return jsonResp({ trading: null, reason: 'Latest trading date listed but body missing — KV eventual-consistency' }, 200);
      return new Response(latest, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', ...CORS } });
    }

    // ── GET /api/trading/signals ──────────────────────────────────────────────
    // Returns trade signals + summary from latest analysis.
    if (request.method === 'GET' && url.pathname === '/api/trading/signals') {
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse();
      if (!dates.length) return jsonResp({ signals: null, reason: 'No trading data yet — awaiting BTD push' }, 200);
      const raw = await env.KKME_SIGNALS.get(dates[0]);
      if (!raw) return jsonResp({ signals: null, reason: 'Latest trading body missing — KV eventual-consistency' }, 200);
      const d = JSON.parse(raw);
      return jsonResp({ date: d._meta?.date, signals: d.signals, totals: d.totals, strategy: d.strategy });
    }

    // ── GET /api/trading/history ──────────────────────────────────────────────
    // Returns daily summaries for the last N days.
    if (request.method === 'GET' && url.pathname === '/api/trading/history') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse().slice(0, days);
      const summaries = [];
      for (const key of dates) {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) continue;
          const d = JSON.parse(raw);
          summaries.push({ date: d._meta?.date, totals: d.totals, strategy: d.strategy, signals: d.signals });
        } catch { /* skip corrupt entries */ }
      }
      return jsonResp(summaries);
    }

    // ── GET /api/trading/export ─────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/api/trading/export') {
      const format = url.searchParams.get('format') || 'json';
      const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);

      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys
        .map(k => k.name)
        .filter(k => !k.includes(':raw'))
        .sort()
        .reverse()
        .slice(0, days);

      const rows = [];
      for (const key of dates) {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) continue;
          const d = JSON.parse(raw);
          if (!d.totals) continue;
          rows.push({
            date: d._meta?.date || key.replace('trading:', ''),
            gross_eur: d.totals.gross,
            per_mw_eur: d.totals.per_mw,
            capacity_eur: d.totals.capacity,
            activation_eur: d.totals.activation,
            arbitrage_eur: d.totals.arbitrage,
            capacity_pct: d.totals.splits_pct?.capacity,
            activation_pct: d.totals.splits_pct?.activation,
            arbitrage_pct: d.totals.splits_pct?.arbitrage,
            activation_rate: d.strategy?.activation_rate_pct,
            peak_offpeak_ratio: d.strategy?.peak_offpeak_ratio,
            soc_min: d.strategy?.soc_range?.[0],
            soc_max: d.strategy?.soc_range?.[1],
          });
        } catch { /* skip corrupt entries */ }
      }

      if (format === 'csv') {
        if (rows.length === 0) return new Response('No data', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        const headers = Object.keys(rows[0]);
        const csv = [
          '# KKME Baltic BESS Dispatch Analysis',
          '# Source: kkme.eu | BTD + ENTSO-E A44',
          '# Generated: ' + new Date().toISOString(),
          '',
          headers.join(','),
          ...rows.map(r => headers.map(h => r[h] ?? '').join(','))
        ].join('\n');
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="kkme-dispatch-${days}d.csv"`,
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      return jsonResp({
        _meta: {
          source: 'kkme.eu',
          generated: new Date().toISOString(),
          days_included: rows.length,
          fields: {
            gross_eur: 'Total daily revenue (EUR)',
            per_mw_eur: 'Revenue per MW of grid connection (EUR)',
            capacity_eur: 'Capacity payment revenue (EUR)',
            activation_eur: 'Balancing activation revenue (EUR)',
            arbitrage_eur: 'Day-ahead arbitrage revenue (EUR)',
            capacity_pct: 'Capacity share of total (%)',
            activation_rate: 'Percent of 15-min ISPs with activation',
          },
          confidence: 'DERIVED from BTD clearing prices + ENTSO-E DA prices',
          distortion_note: 'FCR revenue = 0. Baltic FCR covered by TSO DRR at zero price.',
        },
        data: rows,
      });
    }

    // ── GET /extreme/latest ─────────────────────────────────────────────────
    // Returns the most recent extreme market event (DA spike or activation extreme).
    // WRITE TTL is 7d (POST /extreme/seed); READ flags is_stale once event > 24h old
    // so frontends can soften the "Last extreme: 38h ago" presentation if desired.
    if (request.method === 'GET' && url.pathname === '/extreme/latest') {
      const raw = await env.KKME_SIGNALS.get('extreme:latest').catch(() => null);
      if (!raw) return jsonResp(null);
      const event = JSON.parse(raw);
      if (event && event.timestamp) {
        const ageH = (Date.now() - new Date(event.timestamp).getTime()) / 3600000;
        if (Number.isFinite(ageH) && ageH > 24) {
          event.is_stale  = true;
          event.age_hours = parseFloat(ageH.toFixed(1));
        }
      }
      return jsonResp(event);
    }

    // ── POST /extreme/seed — seed an extreme event (requires update secret) ──
    // ── POST /s3/scrape — the VPS relay for the lithium scrape (B-072) ───────
    //
    // The worker cannot reach tradingeconomics.com; the VPS can. This is the
    // seam. The VPS sends bytes and nothing else — no parsing, no interpretation
    // — so `parseLithiumPrice` stays the single implementation (rule #4) and the
    // relay cannot invent a price.
    //
    // Everything after the parse is identical to the cron path, including the
    // transition alert, because the payload is built by the same `computeS3`.
    if (request.method === 'POST' && url.pathname === '/s3/scrape') {
      if (!acceptsUpdateSecret(request, env, { route: '/s3/scrape' })) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const raw = await request.text().catch(() => null);
      if (typeof raw !== 'string' || raw.length > S3_RELAY_MAX_BODY_BYTES) {
        return jsonResp({ error: `body missing or exceeds ${S3_RELAY_MAX_BODY_BYTES} bytes` }, 413);
      }
      const parsedBody = parseJsonBody(raw);
      if (!parsedBody.ok) return jsonResp({ error: parsedBody.error }, 400);
      const { html, fetched_at } = parsedBody.body ?? {};
      if (typeof html !== 'string' || html.length < S3_RELAY_MIN_HTML_BYTES) {
        // A truncated or empty relay must not overwrite a good payload with a
        // parse failure. The live page is ~409 KB; anything under 10 KB is not
        // the page, whatever the relay believes it sent.
        return jsonResp({
          error: `html must be a string of at least ${S3_RELAY_MIN_HTML_BYTES} bytes`,
          received_bytes: typeof html === 'string' ? html.length : null,
        }, 400);
      }

      const d = await computeS3({ html, fetchedAt: typeof fetched_at === 'string' ? fetched_at : null });

      // A relay that delivered bytes we could not parse is a FAILED relay, and
      // it must not overwrite the last good payload — writing "I failed" over
      // real data is worse than not writing (playbook §5). The cron path has no
      // such choice; this one does, so it takes it.
      if (d.unavailable) {
        console.error(`[S3/relay] parse failed on ${html.length}B — KV left untouched`);
        return jsonResp({ ok: false, wrote: false, reason: d._scrape_error ?? 'parse failed', bytes: html.length }, 422);
      }

      await env.KKME_SIGNALS.put('s3', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s3:${new Date().toISOString().slice(0, 10)}`,
        JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      await alertTransition(env, 's3_scrape', 'ok',
        `S3 scrape live via VPS relay — lithium €${d.lithium_eur_t}/t`).catch(() => {});
      await updateS3Freshness(env.KKME_SIGNALS, 'lithium_proxy', { confidence: 'proxy' }).catch(() => {});
      await updateS3Freshness(env.KKME_SIGNALS, 'fx').catch(() => {});
      console.log(`[S3/relay] ${d.signal} lithium=€${d.lithium_eur_t}/t from ${html.length}B relayed`);
      return jsonResp({ ok: true, wrote: true, lithium_eur_t: d.lithium_eur_t, signal: d.signal, transport: d.scrape_transport });
    }

    if (request.method === 'POST' && url.pathname === '/extreme/seed') {
      if (!acceptsUpdateSecret(request, env)) return jsonResp({ error: 'unauthorized' }, 401);
      const body = await request.json();
      if (!body.type || !body.text) return jsonResp({ error: 'type and text required' }, 400);
      body.timestamp = body.timestamp || new Date().toISOString();
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(body), { expirationTtl: 7 * 86400 });
      return jsonResp({ ok: true, event: body });
    }

    // ── GET /health ──────────────────────────────────────────────────────────
    // Returns structured health of all signal + data KV keys. Source of truth for
    // monitored keys is `STALE_THRESHOLDS_HOURS` in workers/lib/defaults.js — adding
    // a key there auto-includes it in /health (no edit here required).
    if (request.method === 'GET' && url.pathname === '/health') {
      const keys = Object.keys(STALE_THRESHOLDS_HOURS);
      const signals = {};

      await Promise.all(keys.map(async (key) => {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) {
            signals[key] = { status: 'missing', age_hours: null, stale: null };
            return;
          }
          const data      = JSON.parse(raw);
          // Phase 49 follow-up. Adding a threshold is not the same as making a
          // key measurable: `genload` stamps `fetched_at` and `s2_activation`
          // stamps `stored_at`, so both reported `age_hours: null` the moment
          // they were monitored — present-looking and unaged, which is exactly
          // the shape that let `s2_daily_clearing` sit nine days behind (Phase
          // 50). The stamp exists in both; only the NAME was outside this chain.
          const ts        = data.timestamp ?? data._meta?.written_at ?? data.updated_at
                          ?? data.fetched_at ?? data.stored_at;
          const ageH      = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : null;
          const threshold = STALE_THRESHOLDS_HOURS[key] ?? 48;
          const stale     = ageH !== null ? ageH > threshold : null;
          // ── Phase 39.2 — a failure written on time is not freshness ────────
          //
          // computeS3 catches its own scrape failure and writes the key anyway,
          // carrying `unavailable: true` and `_scrape_error`. That write stamps
          // a new `timestamp`, so the staleness clock RESETS on every failure
          // and s3 can never age past its threshold no matter how long the
          // scrape has been broken. Measured live 2026-08-03T16:00:28Z:
          // `unavailable: true, _scrape_error: "AbortError"` reported by /health
          // as `present · 0.6h · stale: false`. That is B12 exactly — the damage
          // disabling its own detector while the surface reassures.
          //
          // The key still gets written (the card keeps its last good editorial
          // content); it simply stops counting as fresh while it is self-
          // reporting failure.
          const degraded = data.unavailable === true || Boolean(data._scrape_error);
          signals[key] = {
            status:          'present',
            age_hours:       ageH !== null ? parseFloat(ageH.toFixed(1)) : null,
            stale,
            threshold_hours: threshold,
            ...(degraded ? { degraded: true, degraded_reason: String(data._scrape_error ?? 'payload self-reports unavailable').slice(0, 200) } : {}),
          };
        } catch (e) {
          signals[key] = { status: 'error', error: e.message };
        }
      }));

      // Phase 50 — `s2_daily_clearing` cannot ride the generic loop above: it is
      // a bare ARRAY, so `data.timestamp` is undefined and the loop would report
      // `age_hours: null, stale: null` — present-looking and unmeasured, which is
      // how it sat nine days behind unnoticed. It is measured on the newest
      // DELIVERY DAY it holds, not on when it was last written; see
      // s2DailyClearingRecency for why a write-age monitor here is gameable.
      try {
        const rawDc = await env.KKME_SIGNALS.get('s2_daily_clearing').catch(() => null);
        let parsed = null;
        try { parsed = rawDc ? JSON.parse(rawDc) : null; } catch { parsed = null; }
        signals.s2_daily_clearing = s2DailyClearingRecency(parsed, new Date().toISOString());
      } catch (e) {
        signals.s2_daily_clearing = { status: 'error', error: String(e).slice(0, 200), stale: true };
      }

      const allFresh = Object.values(signals).every(
        r => r.status === 'present' && r.stale === false && r.degraded !== true,
      );

      // Legacy: include mac_cron field for backward compat but mark as deprecated
      let macCron = { status: 'deprecated', note: 'All fetches now run on Workers cron. Mac cron no longer required.' };
      try {
        const cronRaw = await env.KKME_SIGNALS.get('cron_heartbeat');
        if (cronRaw) {
          const cron = JSON.parse(cronRaw);
          macCron.last_ping = cron.timestamp ?? null;
        }
      } catch { /* ignore */ }

      // ── Phase 39.2 — the alerting layer's own liveness (B8 on the alerter) ──
      //
      // "If the alerter stops sending, what tells us?" The answer before this
      // was: nothing. `notifyTelegram` swallowed every error, returned void,
      // and left no trace — a revoked bot token would have made the channel go
      // quiet, and quiet is precisely how a healthy system looks from a phone.
      //
      // Two records, both written on the ordinary path so they cannot only
      // exist when something is already wrong:
      //   `alerter_health` — stamped on EVERY send attempt, success or not.
      //   `alert_state`    — the per-surface transition state machine.
      //
      // `send_ok` is COMPUTED from the two stamps rather than asserted (rule
      // #2): a last_attempt newer than last_success means sends are failing now.
      const alerting = { alerter: null, surfaces: {}, degraded_surfaces: [] };
      try {
        const raw = await env.KKME_SIGNALS.get('alerter_health').catch(() => null);
        if (!raw) {
          alerting.alerter = { status: 'never_sent', note: 'no send attempt recorded since this surface was added' };
        } else {
          const h = JSON.parse(raw);
          const attemptMs = h.last_attempt_at ? Date.parse(h.last_attempt_at) : null;
          const successMs = h.last_success_at ? Date.parse(h.last_success_at) : null;
          alerting.alerter = {
            status: h.consecutive_send_failures > 0 ? 'failing' : (successMs ? 'ok' : 'never_succeeded'),
            configured: h.configured ?? null,
            last_attempt_at: h.last_attempt_at ?? null,
            last_success_at: h.last_success_at ?? null,
            consecutive_send_failures: h.consecutive_send_failures ?? 0,
            last_error: h.last_error ?? null,
            sends_total: h.sends_total ?? 0,
            send_ok: attemptMs !== null && successMs !== null ? successMs >= attemptMs : false,
            success_age_hours: successMs ? parseFloat(((Date.now() - successMs) / 3600000).toFixed(1)) : null,
          };
        }
      } catch (e) {
        alerting.alerter = { status: 'error', error: e.message };
      }
      try {
        const raw = await env.KKME_SIGNALS.get('alert_state').catch(() => null);
        const map = raw ? JSON.parse(raw) : {};
        for (const [surface, st] of Object.entries(map)) {
          alerting.surfaces[surface] = {
            state: st.state ?? null,
            consecutive: st.consecutive ?? 0,
            first_failure_at: st.first_failure_at ?? null,
            last_seen_at: st.last_seen_at ?? null,
            suppressed_since_alert: st.suppressed_since_alert ?? 0,
          };
          if (st.state === 'degraded') alerting.degraded_surfaces.push(surface);
        }
      } catch (e) {
        alerting.surfaces = { _error: e.message };
      }

      // Phase 36.D — the Litgrid publication watcher's own liveness.
      //
      // The watcher IS the alerting mechanism for the demand module going
      // stale, which means that if the watcher itself dies it dies silently and
      // by definition nothing alerts. Failure-mode B8: every silent-skip path
      // gets a staleness surface. This is the watcher's.
      //
      // The cadence is weekly by design (the source documents move biennially
      // to annually), so `stale` here means "the watcher has not run", not
      // "Litgrid has published something".
      const demand_watch = { module_version: DEMAND_FORECAST_VERSION.version, targets: {} };
      await Promise.all(WATCH_TARGETS.map(async (t) => {
        try {
          const raw = await env.KKME_SIGNALS.get(fingerprintKey(t.id));
          if (!raw) {
            demand_watch.targets[t.id] = { status: 'never_checked', checked_at: null, stale: true };
            return;
          }
          const st = JSON.parse(raw);
          const ageH = st.checked_at ? (Date.now() - new Date(st.checked_at).getTime()) / 3600000 : null;
          if (st.blind) {
            demand_watch.targets[t.id] = { status: 'blind', checked_at: st.checked_at ?? null, stale: true };
            return;
          }
          demand_watch.targets[t.id] = {
            status: 'present',
            checked_at: st.checked_at ?? null,
            age_hours: ageH !== null ? parseFloat(ageH.toFixed(1)) : null,
            // Two missed weekly runs before it reads as stale, so a single
            // skipped tick does not cry wolf.
            stale: ageH !== null ? ageH > 24 * 15 : true,
          };
        } catch (e) {
          demand_watch.targets[t.id] = { status: 'error', error: e.message, stale: true };
        }
      }));
      demand_watch.all_current = Object.values(demand_watch.targets).every((t) => t.stale === false);

      // ── Phase 37.B — fleet lifecycle detector liveness ──────────────────────
      // B8: every decay detector surfaces its own health here. A detector that has
      // never run, has gone stale, or has breached a liveness invariant must be
      // visibly different from one that ran and found nothing — otherwise a broken
      // detector reads as a quiet week. Detector state carries NO private data:
      // only ids, statuses and counts.
      const fleet_lifecycle = { detectors: {}, all_healthy: null, unhealthy_count: 0, capable_count: 0, detector_count: 0 };
      try {
        const raw = await env.KKME_SIGNALS.get('fleet_lifecycle:detectors').catch(() => null);
        const stored = raw ? JSON.parse(raw) : null;
        if (!stored || !stored.detectors) {
          fleet_lifecycle.detectors = {};
          fleet_lifecycle.all_healthy = null;
          fleet_lifecycle.status = 'never_run';
        } else {
          for (const [id, d] of Object.entries(stored.detectors)) {
            const ageH = d.last_run_at ? (Date.now() - new Date(d.last_run_at).getTime()) / 3600000 : null;

            // 37.B.1 / B12 — the stored status is a claim made by the last run that
            // completed. If the runner then STOPS, nothing rewrites it: a detector
            // that was healthy stays "healthy" here forever while its `last_run_at`
            // silently ages, and the surface reassures instead of alarming. The
            // damage would disable its own detector, which is precisely B-048's
            // shape. So staleness is COMPUTED here from the stamp, and it overrides
            // whatever the record claims.
            const reasons = Array.isArray(d.reasons) ? d.reasons.slice() : [];
            let status = d.status ?? 'never_run';
            if (d.last_run_at === null || d.last_run_at === undefined) {
              // A record asserting health with no run stamp is self-contradictory.
              if (status === 'healthy') {
                status = 'never_run';
                reasons.push('record claimed healthy with no last_run_at — a run that never happened cannot be healthy');
              }
            } else if (d.max_age_hours && ageH !== null && ageH > d.max_age_hours) {
              status = 'stale';
              reasons.push(`last run ${ageH.toFixed(0)}h ago exceeds this detector's ${d.max_age_hours}h ceiling — the runner may have stopped`);
            }

            // Same classifier the digest uses (rule #4). Health answers "is the
            // sensor well"; the verdict answers "could it have fired at all" —
            // different questions, and a detector can be healthy and incapable.
            const cls = classifyDetector(d);
            fleet_lifecycle.detectors[id] = {
              status,
              verdict: cls.verdict,
              capable: cls.capable,
              last_run_at: d.last_run_at ?? null,
              age_hours: ageH === null ? null : Math.round(ageH * 10) / 10,
              max_age_hours: d.max_age_hours ?? null,
              rows_eligible: d.rows_eligible ?? null,
              reasons,
            };
            if (status !== 'healthy') fleet_lifecycle.unhealthy_count++;
            if (cls.capable) fleet_lifecycle.capable_count++;
          }
          fleet_lifecycle.all_healthy = fleet_lifecycle.unhealthy_count === 0;
          fleet_lifecycle.detector_count = Object.keys(stored.detectors).length;
          fleet_lifecycle.status = fleet_lifecycle.all_healthy ? 'ok' : 'degraded';
        }
        fleet_lifecycle.transition_log_size = stored?.transition_log_size ?? 0;
      } catch (e) {
        fleet_lifecycle.status = 'error';
        fleet_lifecycle.error = e.message;
      }

      // B-046 / B8 — the digest's OWN staleness, which is a different question
      // from detector health. Detector health answers "did the sensors run".
      // This answers "did the thing that tells me about them still fire", and
      // before this block the answer was: we would not know. `last_digest_at`
      // was written on a real send and read only to window the next one, so a
      // digest that silently stopped firing was invisible everywhere.
      //
      // Arming is a single edit in two places that must agree, and a test
      // asserts they do: LIFECYCLE_DIGEST_CRON here, and the same expression in
      // wrangler.toml's [triggers]. Null means deliberately unarmed.
      try {
        const lastRaw = await env.KKME_SIGNALS.get('fleet_lifecycle:last_digest_at').catch(() => null);
        const ageH = lastRaw ? (Date.now() - new Date(lastRaw).getTime()) / 3600000 : null;
        const digest = {
          armed: LIFECYCLE_DIGEST_CRON !== null,
          cron: LIFECYCLE_DIGEST_CRON,
          expected_every_hours: LIFECYCLE_DIGEST_PERIOD_H,
          last_sent_at: lastRaw ?? null,
          age_hours: ageH === null ? null : Math.round(ageH * 10) / 10,
        };
        // Unarmed is a state, not a fault: it must not read as "overdue" and it
        // must not read as "ok" either.
        if (LIFECYCLE_DIGEST_CRON === null) digest.status = 'not_armed';
        else if (lastRaw === null) digest.status = 'armed_never_sent';
        else digest.status = ageH > LIFECYCLE_DIGEST_PERIOD_H + LIFECYCLE_DIGEST_GRACE_H ? 'overdue' : 'ok';
        fleet_lifecycle.digest = digest;
      } catch (e) {
        fleet_lifecycle.digest = { status: 'error', error: e.message };
      }

      const health = {
        checked_at: new Date().toISOString(),
        all_fresh:  allFresh,
        signals,
        alerting,
        demand_watch,
        fleet_lifecycle,
        mac_cron:   macCron,
      };

      return new Response(JSON.stringify(health, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    // ── GET /health-detail ─────────────────────────────────────────────────
    // Extended health: per-signal validation, fleet quarantine, regime detection.
    if (request.method === 'GET' && url.pathname === '/health-detail') {
      try {
        const keys = ['s1', 's2', 's4_fleet', 's3', 's4', 's7', 's8', 's9'];
        const results = await Promise.all(keys.map(k => env.KKME_SIGNALS.get(k).catch(() => null)));
        const sources = {};
        const warnings = [];
        const errors = [];
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const raw = results[i];
          if (!raw) { errors.push(`${k}: no data in KV`); sources[k] = { status: 'failed', age_hours: null }; continue; }
          let d;
          try { d = JSON.parse(raw); } catch { errors.push(`${k}: invalid JSON`); sources[k] = { status: 'failed' }; continue; }
          const ts = d.fetched_at || d.updated_at || d.timestamp || null;
          const ageH = ts ? ((Date.now() - new Date(ts).getTime()) / 3600000) : null;
          const stale = ageH !== null && ageH > 12;
          if (stale) warnings.push(`${k}: stale (${Math.round(ageH)}h)`);
          const issues = validate(k, d);
          for (const iss of issues) { if (iss.severity === 'error') errors.push(iss.msg); else warnings.push(iss.msg); }
          sources[k] = { status: stale ? 'stale' : 'healthy', last_fetch: ts, age_hours: ageH ? Math.round(ageH * 10) / 10 : null };
        }
        // Fleet quarantine
        const fleetRaw = results[keys.indexOf('s4_fleet')];
        let quarantine = { fleet_entries: 0, reasons: [] };
        if (fleetRaw) {
          try {
            const fleet = JSON.parse(fleetRaw);
            const qEntries = (fleet.raw_entries || []).filter(e => e._quarantine);
            quarantine = { fleet_entries: qEntries.length, reasons: qEntries.map(e => ({ name: e.name, flags: e._contradiction_flags })) };
          } catch { /* ignore parse errors */ }
        }
        // Regime
        let s2fleet = {};
        try { s2fleet = fleetRaw ? JSON.parse(fleetRaw) : {}; } catch { /* ignore */ }
        const s7raw = results[keys.indexOf('s7')];
        let s7d = {};
        try { s7d = s7raw ? JSON.parse(s7raw) : {}; } catch { /* ignore */ }
        const regime = computeRegime({ sd_ratio: s2fleet.sd_ratio, ttf_eur_mwh: s7d.ttf_eur_mwh });
        return jsonResp({ sources, validation: { errors, warnings }, quarantine, regime, model_version: 'v5.1' });
      } catch (e) {
        return jsonResp({ error: e.message }, 500);
      }
    }

    // ── POST /heartbeat ──────────────────────────────────────────────────────
    // Legacy endpoint — kept for backward compatibility. No longer required for monitoring.
    if (request.method === 'POST' && url.pathname === '/heartbeat') {
      if (!acceptsUpdateSecret(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const ping = {
        timestamp: new Date().toISOString(),
        script:    body.script ?? 'unknown',
        note:      body.note   ?? '',
      };
      await env.KKME_SIGNALS.put('cron_heartbeat', JSON.stringify(ping));
      console.log(`[Heartbeat] ${ping.script} at ${ping.timestamp}`);
      return new Response(JSON.stringify({ ok: true, ...ping }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── POST /kv/set — generic KV write from VPS ingestion pipeline ─────────
    if (request.method === 'POST' && url.pathname === '/kv/set') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const { key, value } = await request.json();
      if (!key) return jsonResp({ error: 'key required' }, 400);
      // Allowlist: only permit known keys from ingestion pipeline.
      // 's1_capture' deliberately EXCLUDED (Phase 33): the worker's computeCapture
      // is the SOLE writer — it builds .monthly from a 400-day rolling
      // s1_capture_history. A VPS push (≤3-month DB depth) clobbers that and drops
      // the engine to v6_fallback. Worker owns capture; VPS may still push the rest.
      const ALLOWED_KEYS = ['revenue_trailing', 's1_trailing_12m', 's2_trailing_12m', 'capacity_monthly', 's2_rolling_180d', 'genload'];
      if (!ALLOWED_KEYS.includes(key)) {
        return jsonResp({ error: `key '${key}' not in allowlist` }, 400);
      }
      await env.KKME_SIGNALS.put(key, JSON.stringify(value));
      console.log(`[KV/set] ${key} written (${JSON.stringify(value).length} bytes)`);
      return jsonResp({ ok: true, key });
    }

    // ── GET /history/trailing — trailing 12m revenue summary ─────────────────
    if (request.method === 'GET' && url.pathname === '/history/trailing') {
      const raw = await env.KKME_SIGNALS.get('revenue_trailing');
      return jsonResp(raw ? JSON.parse(raw) : null);
    }

    // ── GET /s1/capture — DA gross capture data ──────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s1/capture') {
      const raw = await env.KKME_SIGNALS.get('s1_capture');
      if (!raw) return jsonResp({ capture: null, reason: 'Capture not yet computed — awaiting first S1 capture cron' }, 200);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    // ── POST /s1/capture/backfill — backfill capture history ────────────────
    if (request.method === 'POST' && url.pathname === '/s1/capture/backfill') {
      if (!acceptsUpdateSecret(request, env)) {
        return jsonResp({ error: 'Unauthorized' }, 401);
      }

      let body = {};
      try { body = await request.json(); } catch { /* use defaults */ }

      // Accept start/end dates or a days count
      const endDate = body.end || new Date().toISOString().slice(0, 10);
      let startDate = body.start;
      if (!startDate) {
        const days = Math.min(body.days || 30, 60); // max 60 per request to stay within Worker limits
        const d = new Date(endDate);
        d.setUTCDate(d.getUTCDate() - days);
        startDate = d.toISOString().slice(0, 10);
      }

      console.log(`[S1/backfill] range: ${startDate} → ${endDate}`);

      try {
        // Fetch entire range in one API call
        const { prices, timestamps, resolution } = await fetchEnergyCharts(startDate, endDate);
        const days = splitByDay(prices, timestamps, resolution);

        // Load existing history
        let history = [];
        try {
          const raw = await env.KKME_SIGNALS.get('s1_capture_history');
          if (raw) history = JSON.parse(raw);
        } catch { /* start fresh */ }

        const existingDates = new Set(history.map(e => e.date));
        let added = 0;
        let skipped = 0;

        for (const [dateStr, dayData] of days) {
          // Skip if already exists (unless force flag)
          if (!body.force && existingDates.has(dateStr)) {
            skipped++;
            continue;
          }

          const c2h = computeDayCapture(dayData.prices, 2, dayData.resolution);
          const c4h = computeDayCapture(dayData.prices, 4, dayData.resolution);
          const shape = priceShapeMetrics(dayData.prices, dayData.timestamps, dayData.resolution);

          // Remove existing entry for this date
          history = history.filter(e => e.date !== dateStr);
          history.push({
            date: dateStr,
            gross_2h: c2h?.gross_eur_mwh ?? null,
            gross_4h: c4h?.gross_eur_mwh ?? null,
            net_2h: c2h?.net_eur_mwh ?? null,
            net_4h: c4h?.net_eur_mwh ?? null,
            avg_charge_2h: c2h?.avg_charge ?? null,
            avg_discharge_2h: c2h?.avg_discharge ?? null,
            avg_charge_4h: c4h?.avg_charge ?? null,
            avg_discharge_4h: c4h?.avg_discharge ?? null,
            swing: shape?.swing ?? null,
            daily_avg: shape?.daily_avg ?? null,
            resolution: dayData.resolution,
            n_prices: dayData.prices.length,
          });
          added++;
        }

        // Sort by date, keep last 730 days
        history.sort((a, b) => a.date.localeCompare(b.date));
        if (history.length > 730) history = history.slice(-730);

        await env.KKME_SIGNALS.put('s1_capture_history', JSON.stringify(history));

        // Recompute current capture snapshot
        try {
          await computeCapture(env);
        } catch (e) {
          console.error('[S1/backfill] recompute failed:', String(e));
        }

        return jsonResp({
          ok: true,
          range: { start: startDate, end: endDate },
          days_in_range: days.size,
          added,
          skipped,
          total_history: history.length,
        });
      } catch (e) {
        console.error('[S1/backfill] error:', String(e));
        return jsonResp({ error: String(e) }, 500);
      }
    }

    // ── GET /read ────────────────────────────────────────────────────────────
    // da_tomorrow is now embedded in computeS1() and stored in the s1 KV key directly
    if (request.method === 'GET' && url.pathname === '/read') {
      const [s1Raw, capRaw, extremeRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s1_capture'),
        env.KKME_SIGNALS.get('extreme:latest').catch(() => null),
      ]);
      if (!s1Raw) return jsonResp({ s1: null, reason: 'S1 not yet computed — awaiting first cron run' }, 200);
      const s1 = JSON.parse(s1Raw);
      // Phase 38.1 — the canonical `s1_capture` key ALWAYS wins over the copy
      // embedded in the s1 payload. Since computeCapture was decoupled from the
      // computeS1 success branch the two can legitimately diverge: a tick where
      // ENTSO-E rejects refreshes `s1_capture` but leaves `s1` (and therefore
      // `s1.capture`) at the previous tick's vintage. The previous condition
      // (`&& !s1.capture`) would have let that stale embedded copy shadow the
      // fresh canonical value — discipline rule #4, one canonical field.
      if (capRaw) {
        try {
          const cap = JSON.parse(capRaw);
          s1.capture = {
            gross_2h: cap.capture_2h?.gross_eur_mwh ?? null,
            gross_4h: cap.capture_4h?.gross_eur_mwh ?? null,
            net_2h: cap.capture_2h?.net_eur_mwh ?? null,
            net_4h: cap.capture_4h?.net_eur_mwh ?? null,
            rolling_30d: cap.rolling_30d,
            shape_swing: cap.shape?.swing ?? null,
            source: 'energy-charts.info',
            data_class: 'derived',
          };
        } catch { /* ignore parse errors */ }
      }
      // Attach extreme event if recent
      if (extremeRaw) {
        try { s1.extreme_event = JSON.parse(extremeRaw); } catch { /* ignore */ }
      }
      return new Response(JSON.stringify(s1), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    // ── GET /s1 — fresh S1, READ-ONLY (Phase 38.1, B-047) ────────────────────
    //
    // This used to be an unconditional `if (request.method === 'GET')`
    // catch-all: EVERY unmatched GET — a bot, a scanner, a typo, an audit probe
    // — ran computeS1() and WROTE the `s1` KV key. `s1` is monitored by /health
    // with a 24h threshold, so that monitor was measuring inbound 404 traffic
    // rather than the ingestion path, and it read green through the entire
    // eight-tick S1 outage. A monitored key any stranger's 404 can refresh is
    // not a monitor.
    //
    // Two changes: the route is explicit (only `/s1`, never a catch-all), and it
    // no longer writes KV. The cron is now the sole writer of `s1`, which is
    // what makes /health's s1 entry mean anything. Response shape, status and
    // headers are unchanged, so `scripts/diagnose.sh` and any external prober
    // see exactly what they saw before.
    if (request.method === 'GET' && url.pathname === '/s1') {
      try {
        const data = await computeS1(env);
        try {
          const history = dedupeByDateKeepLast(await readHistory(env));
          data.spread_stats_90d = rollingStats(history, 'spread_eur');
          data.swing_stats_90d  = rollingStats(await readSwingSeries(env), 'lt_swing');
        } catch { /* non-fatal */ }
        return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // Unknown route. Verified safe to 404: all 32 distinct worker paths called
    // from `app/`, `lib/` and `scripts/` resolve to an explicit route (A7 ALL-N
    // check re-run at Phase 38.1 — 92 route forms, 32 called paths, 0 relying on
    // the old catch-all).
    if (request.method === 'GET') {
      return jsonResp({ error: 'unknown route', path: url.pathname }, 404);
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};

// ── Phase 33: named exports for unit/regression tests (Node import only). The
// Workers runtime consumes the `export default` above and ignores these. ──
export { computeRevenueV7, computeRevenueV6, computeBaseYear, computeTradingMix, computeLiveRate, capPrice };
// Phase 39 — the debt-sizing solver reports equity IRR at the solved structure.
// Exported rather than reimplemented so there is one IRR in the estate: this one
// picks the meaningful root on the mixed-sign streams BESS mothball years
// produce, and a naive bisection would not (rule #4).
export { calcIRR, cashTaxFor };
// Phase 35.1 test hooks — the client scenario port's assertions need to read
// the scenario table and both cannibalisation curves directly.
export {
  REVENUE_SCENARIOS as REVENUE_SCENARIOS_FOR_TEST,
  cpiCurve as cpiCurveForTest,
  cpiCurveScenario as cpiCurveScenarioForTest,
  loadEngineKV,
};
// Phase 33.A — Baltic allowlist + contradiction-flag ingest gate.
export { BALTIC_COUNTRIES, filterFleetEntries, detectContradictions };
export { KNOWN_OPERATIONAL, applyKnownOperational, normName };
export { CURATED_FLEET, injectCuratedFleet, injectManualAdditions };
// Phase 33.B.3 — KV-persisted capacity-watch accumulator (pure helper for tests).
export { accumulateCapacityWatch, CAPACITY_WATCH_FIELDS };
// Phase 38.1 — per-leg ENTSO-E guard. Exported so the retry path can be proven
// rather than assumed: it is the difference between one bad response costing a
// retry and one bad response costing a 4-hourly tick.
export { fetchBznGuarded };
// Phase 38.2 — the S1 history semantics (B-056). Exported so the day-counting
// can be asserted directly rather than inferred from a route that happens to
// expose it: `days_of_data` counting rows instead of dates was invisible to
// every test that existed, because none of them ever looked at it.
export { dedupeByDateKeepLast, rollingStats };
// Phase 51 — one admin-auth check, dual-accept during rotation.
export { updateSecretVerdict, CURATE_MAX_BODY_BYTES };
// Phase 51 — the revenue snapshot's canonical config and controlled comparison.
export { REVENUE_SNAPSHOT_CONFIG, revenueConfigKey, revenueDeltaAdmissible, buildRevenueSnapshot };
// Phase 50 — irreplaceable-archive recency + contact-email escaping.
export { s2DailyClearingRecency, S2_DAILY_CLEARING_MAX_LAG_DAYS, BTD_PUBLICATION_LAG_DAYS };
export { escapeHtml, safeMailtoHref, buildContactEmailHtml, CONTACT_EMAIL_FIELDS };
// Phase 48 — endpoint-auth body validation and blast-radius bounds.
export {
  parseJsonBody,
  validateFeedCleanParams,
  feedCleanBlastRadius,
  validateContactBody,
  FEED_CLEAN_MAX_REMOVED_FRACTION,
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TYPES,
  CONTACT_FIELD_LIMITS,
};
// Phase 36.B1 — the chronological hourly dispatch engine
// (tools/consultancy/lib/dispatch.mjs) reuses these rather than restating them.
// Discipline rule #4: one canonical implementation per quantity. Export
// statements are compile-time bindings and add no runtime code path, so
// /revenue is unaffected — asserted by the 54/54 gate and a route-level probe.
export {
  RESERVE_PRODUCTS,
  COST_STACK,
  RESERVE_MW_CAP_FRACTION,
  RTE_BOL,
  RTE_DECAY_PP_PER_YEAR,
  RTE_FLOOR_DROP,
  RYSTAD_15MIN_UPLIFT_DECIMAL,
  TRADING_REALISATION,
  rteCurveFor,
  sohYr,
  computeThroughputBreakdown,
  warrantyStatusFor,
  computeEffectiveArbPct,
  computeDispatchV2,
  daPricesToHourly24,
  // Phase 36.B3 — the backtest measures `trading_realisation` as achievable ÷
  // perfect foresight. The register defines that denominator as "x of perfect
  // foresight" on the S1 SORT-AND-DISPATCH capture, and this is that function.
  // Restating it in the consultancy tree would put the measured value on a
  // different denominator from the assumed value it replaces, making the two
  // incomparable — which is the whole point of the measurement (rule #4).
  computeDayCapture,
  bidAcceptanceFactor,
  reservePrice,
  marketDepthFactor,
  // Phase 36.B batch-3 — the negative-price parse (36.B0-H) is pinned against a
  // real recorded ENTSO-E response, which means the test has to call the same
  // function the fetch paths call rather than a copy of its regex.
  extractPrices,
  // Phase 43 — the IRR solver, exported so its edge cases can be driven
  // directly. The 54 public configurations are profitable everywhere, so they
  // cannot reach the uneconomic branch, the non-convergent branch or the
  // two-sign-change case at all: an audit that runs only the public matrix is
  // an audit of the happy path. Exported rather than copied — a restatement of
  // the bisection in a test would verify the restatement (B13).
  calcIRR as calcIRRForAudit,
  // Phase 49 item 2 — the solve, not just its value. A test that can only see
  // the number cannot tell "converged at −0.99" from "ran to its own bound",
  // which is precisely the distinction the phase exists to restore.
  solveIRR,
  irrStatusFor,
  // Phase 49 item 3 — the declared public payload shape. Exported so the class
  // guard can assert it against what the primary path actually emits, which is
  // what stops it becoming a stale hardcoded list (A9).
  REVENUE_PAYLOAD_KEYS,
  // Phase 39.2 — the day-correct A44 reconstruction. Exported so the tests
  // exercise the SAME functions the capture fallback calls, against a real
  // recorded ENTSO-E response, rather than a restatement of their regexes
  // (playbook B13: a test whose subject is a string in a file has verified the
  // file, not the behaviour).
  parseA44Periods,
  // B-075 — the two-zone join, exported so the pairing is tested against real
  // documents rather than a restatement of its Map lookup.
  pairOnTimestamp,
  pricesForUtcDay,
  // Phase 49 item 1 — market-day admission and its wall-clock hour labels.
  marketDayAt,
  slotHourUtc,
  s1DayParseMode,
  // B-072 — exported so the relay path is tested by running the REAL payload
  // builder with injected bytes, rather than a test restating its branches.
  computeS3,
  parseLithiumPrice,
  // Exported so the flag delta is measured by running the REAL computeS1 twice
  // over ONE recorded set of documents, rather than by a script restating its
  // field arithmetic — which would measure the restatement (B13).
  computeS1,
  isoDurationToMinutes,
  resolveCaptureDay,
  // Phase 36.B5 — the one duration-anchor interpolation policy. Exported so the
  // property test sweeps the SAME function every engine site reads, rather than
  // a restatement of it that could drift away from the engine it is meant to pin.
  durAnchorWeight,
  durBlend,
  rteBolFor,
};
