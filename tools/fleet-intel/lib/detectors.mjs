// Phase 37.B.1 — the observation builders that stand between real sources and the
// lifecycle interpreter.
//
// 37.B shipped the interpreter (lifecycle.mjs) and the rules (lifecycle-rules.json)
// and nothing that constructs an `observation`. This file is that missing half. It
// is deliberately dumb: each builder reads acquired source data and reports what it
// saw. Whether that means anything is lifecycle.mjs's job.
//
// Two invariants hold throughout:
//
//   1. A builder that CANNOT look returns `{probed: false, reason}` — never a
//      falsy observation that evaluateSignal would read as "condition not met".
//      The difference between "checked, nothing found" and "never checked" is the
//      whole point (B11), and collapsing it here would undo every guard downstream.
//
//   2. Nothing is retired on a private-tier row's evidence. Private rows produce
//      proposals for the operator's own review queue and are tagged `tier:'private'`;
//      the runner refuses to send those to the worker at all.

import { normName, bareName, isLegalEntity } from './normalise.mjs';
import { lookupLV, citationFor, LV_REGISTER_FILE_URL } from './lv-register.mjs';

const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;

/** `elering · A-Consult OÜ` → `A-Consult OÜ`. Curated rows carry a note here, not a company. */
export function applicantOf(entry) {
  const parts = String(entry?.source || '').split('·').map((s) => s.trim());
  return parts.length > 1 ? parts.slice(1).join(' · ') : null;
}

/**
 * Normalise both populations to one row shape.
 *
 * `tier` decides what a proposal derived from this row is ALLOWED to do:
 *   public  — the row is in the published fleet DB; a transition here is publishable
 *   private — the row exists only in the operator's table; proposals stay private
 */
export function toLifecycleRow(src, tier) {
  if (tier === 'public') {
    const applicant = applicantOf(src);
    return {
      id: src.id,
      tier: 'public',
      country: src.country,
      name: src.name,
      entity_name: applicant,
      is_legal_entity: isLegalEntity(applicant),
      status: src.status,
      last_seen_at: src.updated || null,
      mw: src.mw ?? null,
      source_feed: String(src.source || '').split('·')[0].trim(),
    };
  }
  return {
    id: src.id,
    tier: 'private',
    country: src.country,
    name: src.spv || null,
    entity_name: src.spv || null,
    is_legal_entity: Boolean(src.is_legal_entity),
    status: src.verification_status,
    last_seen_at: (src.citations || []).map((c) => c.fetched).filter(Boolean).sort().pop() || null,
    mw: src.bess_mw ?? src.site_total_mw ?? null,
    source_feed: 'private_intake',
  };
}

// ── registry (LV) ────────────────────────────────────────────────────────────

const registryEligible = (row) => row.country === 'LV' && Boolean(row.entity_name) && row.is_legal_entity;

/**
 * One register lookup, reused by both registry signals so a row cannot be judged
 * terminated by one and absent by the other (rule #4: one lookup, one answer).
 */
export function observeRegistry(row, ctx) {
  if (!ctx?.lvIndex) return { probed: false, reason: 'LV register index not loaded' };
  if (!registryEligible(row)) {
    return {
      probed: false,
      reason: row.country !== 'LV'
        ? 'not an LV row'
        : row.entity_name
          ? 'name is a project descriptor, not a legal entity — a registry miss here would say nothing'
          : 'row carries no entity name',
    };
  }
  const res = lookupLV(ctx.lvIndex, row.entity_name);
  const asOf = ctx.registerAsOf || new Date().toISOString();

  if (!res.found) {
    return {
      probed: true,
      found: false,
      is_legal_entity: true,
      // An absence still gets a citation: the dataset that was searched, and when.
      // Rule #3 asks for a resolvable source, not for a positive result.
      evidence: [{
        source_type: 'registry',
        source_key: 'lv_ur_opendata',
        url: LV_REGISTER_FILE_URL,
        what_it_confirms: `name "${row.entity_name}" does not resolve in the Latvian Uzņēmumu reģistrs as of ${asOf}`,
        fetched: asOf,
        confidence: 'low',
      }],
    };
  }

  const cit = citationFor(res);
  return {
    probed: true,
    found: true,
    status: res.status,
    matched_via: res.matched_via,
    former_name: res.former_name ?? null,
    current_name: res.current_name ?? null,
    renamed_on: res.renamed_on ?? null,
    regcode: res.regcode,
    evidence: cit ? [{ ...cit, fetched: asOf }] : [],
  };
}

/**
 * B11, made a precondition rather than a one-off Pause-A check.
 *
 * A zero from the registry detectors is only a statement about Latvian companies if
 * the lookup can tell a real company from a nonsense string. Lursoft passed a "200
 * OK + the page says SIA" check and was still not a search at all; the 0/36 it
 * produced was a measurement artifact. So the runner re-proves the probe on every
 * run, and a detector whose controls fail is suppressed rather than believed.
 *
 * Three properties, all required:
 *   1. known-good names resolve, with a registration code
 *   2. nonsense names do NOT resolve — otherwise "found" is meaningless
 *   3. a known-terminated entity reads `terminated` — otherwise the decay branch is
 *      dead code and the detector can only ever report "everyone is fine"
 */
export const CONTROL_KNOWN_GOOD = Object.freeze(['Latvenergo, AS', 'AS "Sadales tikls"', 'Augstsprieguma tikls, AS']);
export const CONTROL_NONSENSE = Object.freeze(['Zzqxv Nonsense Kompanija SIA', 'xxxxnotarealcompanyxxxx']);

export function runRegistryControls(index) {
  if (!index) return { ran: false, passed: false, reasons: ['register index not loaded'] };
  const reasons = [];

  const good = CONTROL_KNOWN_GOOD.map((n) => ({ n, r: lookupLV(index, n) }));
  const goodOk = good.filter((x) => x.r.found && x.r.regcode);
  if (goodOk.length !== good.length) {
    reasons.push(`known-good controls resolved ${goodOk.length}/${good.length} — the lookup is not finding companies that certainly exist`);
  }

  const nonsense = CONTROL_NONSENSE.map((n) => ({ n, r: lookupLV(index, n) }));
  const nonsenseHits = nonsense.filter((x) => x.r.found);
  if (nonsenseHits.length) {
    reasons.push(`${nonsenseHits.length} nonsense control(s) RESOLVED — "found" carries no information`);
  }

  // The decay branch must be reachable on real data, or a healthy-looking detector
  // is one that structurally cannot retire anything.
  let terminatedSeen = 0;
  for (const list of index.byName.values()) {
    const t = list.find((e) => e.terminated || e.closed);
    if (t && lookupLV(index, t.trading_name).status === 'terminated') { terminatedSeen++; }
    if (terminatedSeen >= 3) break;
  }
  if (terminatedSeen < 3) {
    reasons.push(`only ${terminatedSeen}/3 known-terminated entities read back as terminated — the decay branch may be dead`);
  }

  return {
    ran: true,
    passed: reasons.length === 0,
    reasons,
    detail: {
      known_good_resolved: `${goodOk.length}/${good.length}`,
      nonsense_resolved: `${nonsenseHits.length}/${nonsense.length}`,
      terminated_readback: `${terminatedSeen}/3`,
    },
  };
}

// ── VERT permits (LT) ────────────────────────────────────────────────────────

/**
 * Did this project's VERT permit expire without a generation-permit succession?
 *
 * Matched on the permit holder's name. The register is a permit list, not a project
 * list, so a row with no matching permit is `probed:false` — we did not fail to find
 * an expiry, we failed to find the project at all.
 */
export function observeVert(row, ctx) {
  if (!ctx?.vert) return { probed: false, reason: 'VERT register not reachable from this host' };
  if (row.country !== 'LT') return { probed: false, reason: 'not an LT row' };
  const key = normName(bareName(row.entity_name || row.name || ''));
  if (!key) return { probed: false, reason: 'row carries no name to match on' };

  const hits = ctx.vert.filter((r) => normName(bareName(r.company_name || '')) === key);
  if (!hits.length) return { probed: false, reason: 'no VERT permit matches this holder name' };

  const withExpiry = hits.filter((r) => r.permit_expiry);
  if (!withExpiry.length) {
    return { probed: false, reason: `${hits.length} matching permit(s), none carrying an expiry date — the field this signal depends on is absent` };
  }
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const expired = withExpiry.filter((r) => new Date(r.permit_expiry) < now);
  // A generation permit issued after the development permit expired IS the succession.
  const succeeded = hits.some((r) => /gamin/i.test(String(r.permit_type || '')) && (!r.permit_expiry || new Date(r.permit_expiry) >= now));

  return {
    probed: true,
    permit_expired: expired.length > 0,
    succeeded_by_generation_permit: succeeded,
    consecutive_fires: ctx.consecutiveFires?.[`vert_permit_expired:${row.id}`] ?? 0,
    evidence: expired.slice(0, 3).map((r) => ({
      source_type: 'permit',
      source_key: 'vert_monthly',
      url: r.source_url,
      what_it_confirms: `VERT permit ${r.permit_id} held by ${r.company_name} expired ${r.permit_expiry}`,
      fetched: ctx.vertFetchedAt || new Date().toISOString(),
      confidence: 'normal',
    })).filter((e) => /^https?:\/\//.test(e.url || '')),
  };
}

// ── TSO queue disappearance (LT/EE) ──────────────────────────────────────────

export function observeQueue(row, ctx) {
  if (!ctx?.previousIds) {
    return { probed: false, reason: 'no prior snapshot exists — this run establishes the baseline, so nothing can have disappeared yet' };
  }
  if (row.tier !== 'public') return { probed: false, reason: 'queue diffs apply to the public fleet only' };
  return {
    probed: true,
    was_in_previous_snapshot: ctx.previousIds.has(row.id),
    in_current_snapshot: ctx.currentIds.has(row.id),
    evidence: [{
      source_type: 'tso',
      source_key: 'litgrid_elering_snapshot',
      url: ctx.fleetUrl,
      what_it_confirms: `project id ${row.id} present in the ${ctx.previousTakenAt} snapshot and absent from the ${ctx.currentTakenAt} snapshot`,
      fetched: ctx.currentTakenAt,
      confidence: 'low',
    }],
  };
}

// ── press (LT/LV/EE) ─────────────────────────────────────────────────────────

/**
 * NOT IMPLEMENTED, and that is the finding rather than a gap to paper over.
 *
 * `press_negative` wants cancellation/insolvency signals. The lv_press tripwire that
 * exists scans for the OPPOSITE event — grid-scale storage COMMISSIONING — and its
 * keyword set contains no insolvency, liquidation or cancellation token (verified:
 * `grep -n "bankrot|maksātnespēj|insolven|cancel|atcel|likvidāc" lv_press_scraper.py`
 * → 0 hits in the keyword lists). Running this signal against that feed would report
 * "no project was cancelled" on the strength of a probe that cannot detect one — the
 * exact B11 shape. It reports `probed:false` until a negative-press extractor exists.
 */
export function observePress(row, ctx) {
  return {
    probed: false,
    reason: ctx?.pressReachable
      ? 'lv_press tripwire is reachable but scans for COMMISSIONING keywords only — it cannot detect cancellation or insolvency, so its silence is not evidence'
      : 'lv_press tripwire not reachable from this host',
  };
}

// ── evidence staleness (internal) ────────────────────────────────────────────

export function observeStaleness(row, ctx) {
  if (!row.last_seen_at) {
    return { probed: false, reason: 'row carries no evidence timestamp to age' };
  }
  const now = ctx?.now ? new Date(ctx.now).getTime() : Date.now();
  const months = (now - new Date(row.last_seen_at).getTime()) / MS_PER_MONTH;
  return { probed: true, months_since_evidence: Math.round(months * 10) / 10, evidence: [] };
}

// ── discovery: unmatched storage-relevant entities (LV) ──────────────────────

/**
 * Storage tokens in Latvian and English company names.
 *
 * Two classes, and the distinction is not cosmetic. Latvian storage vocabulary is
 * morphological — `uzkrāšana` / `uzkrājumi` / `akumulācija` all inflect — so those
 * match as PREFIXES. The short English-ish tokens must match as WORDS: a plain
 * substring for `bess` matches `debess` (Latvian for "sky"), the surname
 * `Bessudnova` and `BESSE Space`, which is how the first sweep returned 56
 * candidates of which most were florists and a family doctor. A discovery feed
 * whose precision is that bad trains the operator to ignore it.
 */
const STORAGE_PREFIXES = ['uzkras', 'uzkraj', 'akumulacij', 'baterij'];
const STORAGE_WORDS = /(^|[^a-z])(bess|battery|energy storage|storage systems)([^a-z]|$)/;

/**
 * Sweep the register for storage-named entities we do not already track.
 *
 * Report-only by rule. The cap below is REPORTED, never silent: a truncated sweep
 * that looked complete would be a coverage lie.
 */
export function sweepUnmatchedEntities(ctx, { cap = 50 } = {}) {
  if (!ctx?.lvIndex) return { probed: false, reason: 'LV register index not loaded' };
  const known = ctx.knownNameKeys || new Set();
  const hits = [];
  let scanned = 0;
  let total = 0;
  for (const [key, entities] of ctx.lvIndex.byName) {
    scanned++;
    if (!STORAGE_PREFIXES.some((t) => key.includes(t)) && !STORAGE_WORDS.test(key)) continue;
    const live = entities.filter((e) => !e.terminated && !e.closed);
    if (!live.length) continue;
    if (known.has(key)) continue;
    total++;
    if (hits.length < cap) {
      hits.push({
        name: live[0].trading_name,
        regcode: live[0].regcode,
        registered: live[0].registered,
        // The UR export writes a city CODE here, not a city name. Labelling it
        // `city` would assert a value the field does not carry (rule #2).
        city_code: live[0].city,
      });
    }
  }
  return {
    probed: true,
    scanned_name_keys: scanned,
    candidates_total: total,
    candidates_returned: hits.length,
    capped: total > hits.length,
    cap,
    candidates: hits,
  };
}

/** Per-signal observation dispatch. Unknown ids report as unprobed rather than false. */
export const OBSERVERS = Object.freeze({
  registry_terminated: observeRegistry,
  registry_absent: observeRegistry,
  vert_permit_expired: observeVert,
  queue_disappearance: observeQueue,
  press_negative: observePress,
  evidence_stale: observeStaleness,
});

/** Eligibility per signal — how many rows this signal could even look at. */
export function eligibility(signalId, rows, ctx) {
  const inScope = rows.filter((r) => {
    const c = ctx?.rulesByid?.[signalId]?.countries;
    return !Array.isArray(c) || !r.country || c.includes(r.country);
  });
  const why = {};
  let eligible = 0;
  // Tier split matters on its own: a signal whose entire eligible population is
  // private-tier can never produce a publishable transition, however healthy it
  // looks. That is a coverage gap, and it has to be visible as one.
  const eligibleByTier = { public: 0, private: 0 };
  for (const row of inScope) {
    const obs = OBSERVERS[signalId] ? OBSERVERS[signalId](row, ctx) : { probed: false, reason: 'no observer' };
    if (obs.probed) { eligible++; eligibleByTier[row.tier] = (eligibleByTier[row.tier] || 0) + 1; }
    else why[obs.reason] = (why[obs.reason] || 0) + 1;
  }
  return { rows_in_scope: inScope.length, rows_eligible: eligible, eligible_by_tier: eligibleByTier, why_ineligible: why };
}
