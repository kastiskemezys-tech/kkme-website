#!/usr/bin/env node
// Phase 37.B.1 — the detector runner. This is the caller 37.B never had.
//
// 37.B shipped seven signals, a rename guard, a retirement policy, a transition log
// and an ingest endpoint. It shipped nothing that puts real data in front of any of
// them, so `fleet_lifecycle:detectors` has one writer fed by a caller that does not
// exist and the weekly digest cannot be armed because there is nothing upstream to
// report. This runner closes that loop.
//
// REPORT-ONLY BY DEFAULT. `--write` is required to POST anything, and the first
// contact between these detectors and real data must be made without it. The reason
// is not caution for its own sake: a single untrimmed space in the LV register export
// marked 486,509 entities terminated — Latvenergo included — and a runner wired
// straight through would have retired the entire Latvian fleet while satisfying every
// rule in the file. A proposal set is reviewable. A transition log is not.
//
// Usage:
//   node tools/fleet-intel/run-lifecycle.mjs                     # report-only (default)
//   node tools/fleet-intel/run-lifecycle.mjs --refresh-register  # + re-download LV register
//   node tools/fleet-intel/run-lifecycle.mjs --write             # POST to the worker (needs UPDATE_SECRET)

import fs from 'node:fs';
import path from 'node:path';
import {
  loadRules, checkDetectorHealth, applyEligibility, evaluateSignal, buildTransition, DETECTOR,
  runnerHeartbeat,
} from './lib/lifecycle.mjs';
import {
  acquirePublicFleet, acquireLvRegister, acquireVert, acquireLvPress,
  loadPreviousSnapshot, writeSnapshot, FLEET_URL, SNAPSHOT_DIR, ROOT,
} from './lib/sources.mjs';
import {
  toLifecycleRow, OBSERVERS, eligibility, sweepUnmatchedEntities, runRegistryControls,
} from './lib/detectors.mjs';
import { nameKey } from './lib/lv-register.mjs';
import { findPrivateLeaks, findContactShapedContent } from './lib/tiers.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const WRITE = has('--write');
/**
 * 37.B.1a — the mode the weekly cron runs in. Posts detector HEALTH and never a transition.
 *
 * `--write` posts proposals into `fleet_lifecycle:transitions`, which is the log the weekly digest
 * renders and sends to Telegram. This file's own header explains why that must not run unattended:
 * a single untrimmed space in the LV register marked 486,509 entities terminated, Latvenergo
 * included, and a runner wired straight through would have retired the entire Latvian fleet while
 * satisfying every rule in the file. Scheduling `--write` would have been exactly that wiring.
 *
 * So the heartbeat and the acting are separated. The cron proves weekly that the runner ran, what
 * each detector could see, and what it measured — which is what the staleness surface needs and
 * all it needs. Proposals stay a reviewed, manual `--write`.
 */
const WRITE_HEALTH = has('--write-health');
const REFRESH_REGISTER = has('--refresh-register');
const NO_VPS = has('--no-vps');
/**
 * `--emit-payload <file>` writes exactly the body `--write` would POST, and posts
 * nothing. It exists so the send can be made from where UPDATE_SECRET already
 * lives (the VPS config the crons source) instead of copying a production secret
 * into a laptop shell to run one curl. Same payload, same leak assertions, one
 * fewer place the secret has ever been.
 */
const EMIT_PAYLOAD = args.includes('--emit-payload') ? args[args.indexOf('--emit-payload') + 1] : null;

// Rule #2 on the runner's own label: the banner and the two `mode:` fields are COMPUTED from the
// flags actually in force. They read REPORT-ONLY while --write-health was posting health — a label
// asserting a state of the world it had not checked.
const MODE = WRITE ? 'write' : WRITE_HEALTH ? 'write-health' : EMIT_PAYLOAD ? 'emit-payload' : 'report-only';

const NOW = new Date().toISOString();
const NOW_MS = Date.parse(NOW);

const PRIVATE_INTAKE = path.join(ROOT, 'docs/_private/fleet-intel/intake-latest.json');
const PRIVATE_OUT = path.join(ROOT, 'docs/_private/fleet-intel/lifecycle-proposals-latest.json');
/**
 * 37.B.1a — the report filename is COMPUTED, not hardcoded.
 *
 * It used to be a fixed `2026-08-01-phase-37-b1-first-detector-run.md`, which was accurate exactly
 * once. Scheduling the runner weekly would have made every Monday rewrite 37.B.1's committed
 * first-run report under a filename asserting a date it no longer held — rule #2, in the one place
 * where the assertion is the filename itself. The first run keeps its name because it IS the
 * first-run record; scheduled runs write dated files beside it.
 */
const FIRST_RUN_REPORT = path.join(ROOT, 'docs/investigations/2026-08-01-phase-37-b1-first-detector-run.md');
const REPORT_OUT = fs.existsSync(FIRST_RUN_REPORT)
  ? path.join(ROOT, `docs/investigations/${NOW.slice(0, 10)}-fleet-lifecycle-detector-run.md`)
  : FIRST_RUN_REPORT;
const STATE_PATH = path.join(SNAPSHOT_DIR, 'detector-state.json');
const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { detectors: {}, consecutive_fires: {} }; }
};

(async () => {
  console.log(`── 37.B.1 detector run · ${NOW} · mode: ${MODE.toUpperCase()} ──\n`);
  const rules = loadRules();
  const rulesById = Object.fromEntries(rules.signals.map((s) => [s.id, s]));
  const state = loadState();

  // ── 1. sources ─────────────────────────────────────────────────────────────
  console.log('acquiring sources…');
  const fleet = await acquirePublicFleet();
  console.log(`  public_fleet      ${fleet.reachable ? `OK ${fleet.stats.entries} entries` : `UNREACHABLE — ${fleet.error}`}`);

  const lv = await acquireLvRegister({ refresh: REFRESH_REGISTER });
  console.log(`  lv_ur_opendata    ${lv.reachable ? `OK ${lv.stats.entities} entities, terminated share ${(lv.stats.terminated_share * 100).toFixed(1)}%` : `UNREACHABLE — ${lv.error}`}`);

  const vert = NO_VPS ? { key: 'vert_monthly', reachable: false, error: '--no-vps' } : await acquireVert();
  console.log(`  vert_monthly      ${vert.reachable ? `OK ${vert.stats.permits_parsed} permits, ${vert.stats.with_expiry} with expiry (${vert.stats.file})` : `UNREACHABLE — ${vert.error}`}`);

  const press = NO_VPS ? { key: 'lv_press_tripwire', reachable: false, error: '--no-vps' } : await acquireLvPress();
  console.log(`  lv_press_tripwire ${press.reachable ? `OK ${press.stats.items_scanned} items scanned, ${press.stats.candidates_found} candidates (${press.stats.file})` : `UNREACHABLE — ${press.error}`}`);

  const prevSnap = loadPreviousSnapshot();
  console.log(`  queue_snapshot    ${prevSnap.reachable ? `OK prior snapshot ${prevSnap.stats.file}, ${prevSnap.stats.rows} rows` : `NO BASELINE — ${prevSnap.error}`}`);

  // B11 preconditions, re-proven on every run rather than trusted from Pause A.
  const controls = runRegistryControls(lv.index);
  console.log(`  registry controls ${controls.ran ? (controls.passed ? `PASS — known-good ${controls.detail.known_good_resolved}, nonsense ${controls.detail.nonsense_resolved}, terminated read-back ${controls.detail.terminated_readback}` : `FAIL — ${controls.reasons.join('; ')}`) : `NOT RUN — ${controls.reasons.join('; ')}`}`);

  if (!fleet.reachable) {
    console.error('\nFATAL: the public fleet is the population every detector runs over. Refusing to report zeros against a population we could not read.');
    process.exit(1);
  }

  // ── 2. populations ─────────────────────────────────────────────────────────
  const publicRows = fleet.entries.map((e) => toLifecycleRow(e, 'public'));
  let privateRows = [];
  if (fs.existsSync(PRIVATE_INTAKE)) {
    privateRows = JSON.parse(fs.readFileSync(PRIVATE_INTAKE, 'utf8')).rows.map((r) => toLifecycleRow(r, 'private'));
  }
  const rows = [...publicRows, ...privateRows];
  console.log(`\npopulations: ${publicRows.length} public fleet rows · ${privateRows.length} private intake rows`);

  const currentIds = new Set(publicRows.map((r) => r.id));
  const ctx = {
    lvIndex: lv.index,
    registerAsOf: lv.reachable ? lv.stats.register_mtime : null,
    vert: vert.reachable ? vert.records : null,
    vertFetchedAt: vert.fetched_at,
    pressReachable: Boolean(press.reachable),
    previousIds: prevSnap.reachable ? new Set(prevSnap.ids) : null,
    previousTakenAt: prevSnap.stats?.taken_at ?? null,
    currentIds,
    currentTakenAt: NOW,
    fleetUrl: FLEET_URL,
    now: NOW,
    consecutiveFires: state.consecutive_fires || {},
    rulesByid: rulesById,
    knownNameKeys: new Set(rows.map((r) => nameKey(r.entity_name || r.name || '')).filter(Boolean)),
  };

  // ── 3. per-signal health observations ──────────────────────────────────────
  // last_run_at is set ONLY when the signal's source was actually reached this run.
  // An unreachable source therefore keeps the previous stamp and ages into `stale`
  // instead of quietly presenting as a healthy detector that found nothing (B12).
  const prior = (id) => state.detectors?.[id]?.last_run_at ?? null;
  const healthObs = {
    registry_terminated: lv.reachable
      ? { last_run_at: NOW, entities: lv.stats.entities, terminated_share: lv.stats.terminated_share }
      : { last_run_at: prior('registry_terminated') },
    registry_absent: lv.reachable
      ? { last_run_at: NOW, absent_share: null }   // filled in after evaluation
      : { last_run_at: prior('registry_absent') },
    vert_permit_expired: vert.reachable
      ? { last_run_at: NOW, permits_parsed: vert.stats.permits_parsed, with_expiry: vert.stats.with_expiry }
      : { last_run_at: prior('vert_permit_expired') },
    queue_disappearance: prevSnap.reachable
      ? {
        last_run_at: NOW,
        snapshot_rows: publicRows.length,
        shrink_ratio: prevSnap.stats.rows ? Math.max(0, (prevSnap.stats.rows - publicRows.length) / prevSnap.stats.rows) : 0,
      }
      : { last_run_at: prior('queue_disappearance') },
    // press_negative has no source. The lv_press tripwire is reachable and scans
    // for COMMISSIONING; nothing in the stack extracts cancellation or insolvency.
    // Its stamp is therefore never advanced, and the reason is carried explicitly
    // so `never_run` does not read as "waiting for its first turn".
    press_negative: { last_run_at: prior('press_negative') },
    evidence_stale: { last_run_at: NOW, all_rows_stale: false },
    new_entity_unmatched: lv.reachable ? { last_run_at: NOW } : { last_run_at: prior('new_entity_unmatched') },
  };

  // registry_absent's spike invariant needs the absent share, so compute it first.
  const registryEligibleRows = rows.filter((r) => r.country === 'LV' && r.is_legal_entity && r.entity_name);
  const absentCount = lv.reachable
    ? registryEligibleRows.filter((r) => OBSERVERS.registry_absent(r, ctx).found === false).length
    : 0;
  if (lv.reachable) {
    healthObs.registry_absent.absent_share = registryEligibleRows.length ? absentCount / registryEligibleRows.length : 0;
  }

  // evidence_stale's own blindness check: every row stale at once means intake stopped.
  const staleAll = rows.length > 0 && rows.every((r) => {
    const o = OBSERVERS.evidence_stale(r, ctx);
    return o.probed && o.months_since_evidence >= (rulesById.evidence_stale.staleness_months ?? 6);
  });
  healthObs.evidence_stale.all_rows_stale = staleAll;

  // ── 4. evaluate ────────────────────────────────────────────────────────────
  const detectors = {};
  const proposals = [];
  const suppressed = [];

  for (const signal of rules.signals) {
    if (signal.id === 'new_entity_unmatched') continue;   // discovery, handled separately

    const obs = healthObs[signal.id] || {};
    let health = checkDetectorHealth(signal, obs, NOW_MS);
    // A registry signal whose controls did not pass is not a signal — its zeros and
    // its hits are equally uninformative, so it is suppressed before eligibility is
    // even considered.
    if (signal.source === 'lv_ur_opendata' && lv.reachable && !controls.passed) {
      health = { status: DETECTOR.UNHEALTHY, reasons: [`B11 controls failed: ${controls.reasons.join('; ')}`] };
    }
    const pop = eligibility(signal.id, rows, ctx);
    health = applyEligibility(health, pop);

    const reasons = health.reasons.slice();
    if (signal.id === 'press_negative') {
      reasons.push(press.reachable
        ? 'NO SOURCE: the lv_press tripwire is reachable but scans for commissioning keywords; no cancellation/insolvency extractor exists, so this detector cannot run at all'
        : 'NO SOURCE: lv_press tripwire not reachable from this host, and it would not detect cancellation even if it were');
    }
    if (pop.rows_eligible > 0 && (pop.eligible_by_tier?.public ?? 0) === 0) {
      reasons.push(`every eligible row is private-tier (${pop.eligible_by_tier.private}) — this detector cannot produce a PUBLISHABLE transition today`);
    }

    detectors[signal.id] = {
      status: health.status,
      last_run_at: obs.last_run_at ?? null,
      reasons,
      max_age_hours: signal.meta_monitor?.max_age_hours ?? null,
      population: pop,
      source_stats: sourceStatsFor(signal.id, { lv, vert, press, prevSnap, fleet }),
      ...(signal.source === 'lv_ur_opendata' ? { controls } : {}),
      ...capability(signal.id, { lv, vert, press, prevSnap, fleet, controls }),
    };

    if (health.status !== DETECTOR.HEALTHY) {
      suppressed.push({ signal_id: signal.id, status: health.status, reasons, rows_in_scope: pop.rows_in_scope });
      console.log(`\n${signal.id}: ${health.status.toUpperCase()} — ${reasons.join('; ')}`);
      console.log(`  (${pop.rows_eligible}/${pop.rows_in_scope} rows eligible; NOT evaluated)`);
      continue;
    }

    let fired = 0;
    for (const row of rows) {
      const observation = OBSERVERS[signal.id](row, ctx);
      if (!observation.probed) continue;
      const ev = evaluateSignal(signal, row, observation, health);
      const t = buildTransition(row, [ev], NOW);
      if (!t) continue;
      fired++;
      proposals.push({
        ...t,
        tier: row.tier,
        signal_id: signal.id,
        confidence: signal.confidence,
        row: { id: row.id, country: row.country, source_feed: row.source_feed, status_before: row.status },
        notes: ev.notes,
      });
    }
    console.log(`\n${signal.id}: HEALTHY — ${pop.rows_eligible}/${pop.rows_in_scope} rows eligible (public ${pop.eligible_by_tier.public}, private ${pop.eligible_by_tier.private}), ${fired} proposal(s)`);
    if (pop.rows_eligible > 0 && pop.eligible_by_tier.public === 0) {
      console.log('  ⚠ every eligible row is private-tier — no publishable transition is reachable from this detector today');
    }
    if (pop.rows_eligible < pop.rows_in_scope) {
      for (const [why, n] of Object.entries(pop.why_ineligible)) console.log(`  ineligible ×${n}: ${why}`);
    }
  }

  // ── 5. discovery sweep ─────────────────────────────────────────────────────
  const sweep = sweepUnmatchedEntities(ctx);
  const discoverySignal = rulesById.new_entity_unmatched;
  const zeroRuns = sweep.probed && sweep.candidates_total === 0
    ? (state.detectors?.new_entity_unmatched?.consecutive_zero_runs ?? 0) + 1
    : 0;
  let discHealth = checkDetectorHealth(discoverySignal,
    { ...healthObs.new_entity_unmatched, consecutive_zero_runs: zeroRuns }, NOW_MS);
  if (lv.reachable && !controls.passed) {
    discHealth = { status: DETECTOR.UNHEALTHY, reasons: [`B11 controls failed: ${controls.reasons.join('; ')}`] };
  }
  detectors.new_entity_unmatched = {
    status: discHealth.status,
    last_run_at: healthObs.new_entity_unmatched.last_run_at,
    reasons: discHealth.reasons,
    max_age_hours: discoverySignal.meta_monitor?.max_age_hours ?? null,
    consecutive_zero_runs: zeroRuns,
    controls,
    ...capability('new_entity_unmatched', { lv, vert, press, prevSnap, fleet, controls }),
    population: { rows_in_scope: sweep.scanned_name_keys ?? 0, rows_eligible: sweep.probed ? (sweep.scanned_name_keys ?? 0) : 0 },
    source_stats: { candidates_total: sweep.candidates_total ?? null, capped: sweep.capped ?? null, cap: sweep.cap ?? null },
  };
  console.log(`\nnew_entity_unmatched: ${discHealth.status.toUpperCase()} — ${sweep.probed ? `${sweep.candidates_total} unmatched storage-named LV entities (returning ${sweep.candidates_returned}${sweep.capped ? `, CAPPED at ${sweep.cap}` : ''})` : sweep.reason}`);

  // ── 6. snapshot + state (not status writes) ────────────────────────────────
  const snapFile = writeSnapshot(publicRows, { at: NOW });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({
    last_run_at: NOW,
    mode: MODE,
    detectors: Object.fromEntries(Object.entries(detectors).map(([k, v]) => [k, {
      last_run_at: v.last_run_at, status: v.status, consecutive_zero_runs: v.consecutive_zero_runs ?? 0,
    }])),
    consecutive_fires: state.consecutive_fires || {},
  }, null, 2));

  // ── 7. reports ─────────────────────────────────────────────────────────────
  const byTier = { public: proposals.filter((p) => p.tier === 'public'), private: proposals.filter((p) => p.tier === 'private') };

  fs.writeFileSync(PRIVATE_OUT, JSON.stringify({
    generated: NOW, mode: MODE, detectors, proposals, suppressed, sweep,
  }, null, 2));

  const report = renderReport({ detectors, byTier, suppressed, sweep, controls, sources: { fleet, lv, vert, press, prevSnap }, snapFile });
  // The committed report is a PUBLIC destination. Assert it the way the intake does.
  const leaks = findPrivateLeaks({ report });
  const contactLeaks = findContactShapedContent({ report });
  if (leaks.length || contactLeaks.length) {
    console.error('FATAL: private data in the committed report:', [...leaks, ...contactLeaks].slice(0, 10));
    process.exit(1);
  }
  fs.writeFileSync(REPORT_OUT, report);

  console.log(`\n── proposal set: ${byTier.public.length} public-tier · ${byTier.private.length} private-tier ──`);
  console.log(`snapshot     → ${path.relative(ROOT, snapFile)}`);
  console.log(`full set     → ${path.relative(ROOT, PRIVATE_OUT)} (gitignored)`);
  console.log(`report       → ${path.relative(ROOT, REPORT_OUT)}`);

  // ── 8. write path ──────────────────────────────────────────────────────────
  if (!WRITE && !WRITE_HEALTH && !EMIT_PAYLOAD) {
    console.log('\nREPORT-ONLY: nothing was written to the worker. Re-run with --write (or --emit-payload) after review.');
    return;
  }

  // Hard rule: private-tier proposals NEVER enter fleet_lifecycle:transitions. That
  // log is what the weekly digest renders and sends to Telegram, so anything landing
  // in it has already left the platform in every practical sense.
  // The runner's own bookkeeping fields (tier, signal_id, confidence, row, notes) are
  // stripped here rather than filtered downstream: what leaves this process is the
  // transition shape the endpoint validates, and nothing else rides along.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const payloadTransitions = byTier.public.map(({ tier, signal_id, confidence, row, notes, ...t }) => t);
  const payloadDetectors = Object.fromEntries(Object.entries(detectors).map(([id, d]) => [id, {
    status: d.status, last_run_at: d.last_run_at, reasons: d.reasons,
    max_age_hours: d.max_age_hours, rows_eligible: d.population?.rows_eligible ?? null,
    source_reachable: d.source_reachable ?? null,
    source_usable: d.source_usable ?? null,
    population_unit: id === 'new_entity_unmatched' ? 'register-name-keys' : 'fleet rows',
    ...(d.baseline_present === undefined ? {} : { baseline_present: d.baseline_present }),
  }]));
  // ── B-054: the runner's own heartbeat ──────────────────────────────────────
  //
  // THE GAP THIS CLOSES. Every per-detector `max_age_hours` above is sized for its SOURCE's
  // cadence — 336 h for a snapshot diff, 720 h for the LV register, 1080 h for monthly VERT,
  // 1440 h for the internal hygiene sweep. But a detector's `last_run_at` only advances when
  // THE RUNNER runs, so if the weekly runner (37.B.1a: Sun 22:00 UTC) dies, every stamp freezes
  // and the first detector does not cross its ceiling for 14 days — the last not for 60. The
  // thing that failed is the runner, and the slowest sensor was setting the alarm clock.
  //
  // A heartbeat is the fix and it belongs HERE rather than in the worker, because only this
  // process knows it ran. It is a record in the same detector map deliberately: the worker
  // already ages every entry that carries `last_run_at` + `max_age_hours` and overrides the
  // stored status to `stale`, so the alarm needs no new endpoint and no new reader — and any
  // future reader that learns to age detectors gets this for free.
  //
  // 240 h = 10 days: one missed Sunday plus three days of slack, so a single delayed run is not
  // an alarm and two consecutive misses certainly are. Distinct from every source threshold
  // above, which is the whole point.
  //
  // Note it is stamped with NOW unconditionally. That is correct and is not a self-certifying
  // "healthy": this record's ONLY claim is "the runner reached this line at NOW", which is a
  // fact about this process, not about any source. Its staleness is therefore computed by the
  // reader from a stamp that stops advancing the moment the runner stops — the one shape B-048
  // showed cannot be faked by a dead writer.
  payloadDetectors.runner_heartbeat = runnerHeartbeat(NOW, MODE);

  const check = findPrivateLeaks({ transitions: payloadTransitions, detectors: payloadDetectors });
  const checkContacts = findContactShapedContent({ transitions: payloadTransitions, detectors: payloadDetectors });
  if (check.length || checkContacts.length) {
    console.error('FATAL: private data in the worker payload:', [...check, ...checkContacts]);
    process.exit(1);
  }

  // In health mode the transition list is emptied HERE, at the one place the body is built, rather
  // than filtered at the endpoint or trusted to be empty. If a proposal ever appears, the cron must
  // not be the thing that acts on it — it stays in the local report for review.
  const sentTransitions = WRITE_HEALTH ? [] : payloadTransitions;
  if (WRITE_HEALTH && payloadTransitions.length) {
    console.log(`\nHEALTH MODE: ${payloadTransitions.length} public-tier proposal(s) NOT posted — review the report and re-run with --write to act on them.`);
  }
  const body = JSON.stringify({ transitions: sentTransitions, detectors: payloadDetectors });

  if (EMIT_PAYLOAD) {
    fs.writeFileSync(EMIT_PAYLOAD, body);
    console.log(`\npayload → ${EMIT_PAYLOAD} (${payloadTransitions.length} transitions, ${Object.keys(payloadDetectors).length} detectors)`);
    console.log('POST it from a host that already holds UPDATE_SECRET. Nothing was sent from here.');
    return;
  }

  const secret = process.env.UPDATE_SECRET;
  if (!secret) { console.error('\n--write/--write-health requires UPDATE_SECRET in the environment; use --emit-payload instead.'); process.exit(1); }
  const res = await fetch(`${WORKER}/admin/fleet-lifecycle`, {
    method: 'POST',
    headers: { 'X-Update-Secret': secret, 'Content-Type': 'application/json' },
    body,
  });
  const bodyText = await res.text();
  console.log(`\nPOST /admin/fleet-lifecycle → ${res.status} ${bodyText}`);
  // Exit non-zero on a failed POST. Under cron the console output goes to a log nobody reads until
  // something is already wrong; the exit code is what a wrapper can act on. Without this the runner
  // would report success having posted nothing — B8, and precisely the silent stop this schedule
  // exists to make visible.
  if (!res.ok) process.exit(1);
})();

/**
 * The FACTS the worker's classifyDetector derives a verdict from.
 *
 * Deliberately not a verdict. If the runner posted the word "checked", that string
 * would sit in KV asserting a state of the world long after it stopped being true —
 * the pre-written-prose failure rule #2 exists to forbid. What it posts instead is
 * what it measured: was the source reachable, can that source produce this signal
 * at all, and does the diff have a baseline. The reader computes the rest.
 *
 * `source_usable` is the sharp one. A source can be perfectly reachable and still
 * be unable to produce its signal — lv_press returns 150 items a day and cannot
 * detect a cancellation, because it scans for commissioning.
 */
function capability(signalId, { lv, vert, press, prevSnap, fleet, controls }) {
  const registryUsable = Boolean(lv.reachable && controls.passed);
  switch (signalId) {
    case 'registry_terminated':
    case 'registry_absent':
    case 'new_entity_unmatched':
      return { source_reachable: Boolean(lv.reachable), source_usable: registryUsable };
    case 'vert_permit_expired':
      // Reachable AND usable: VERT really does publish permit expiries, just very
      // few of them. That makes this BLIND, not no-source — a different problem
      // with a different fix, and the digest must not conflate them.
      return { source_reachable: Boolean(vert.reachable), source_usable: Boolean(vert.reachable) };
    case 'queue_disappearance':
      return { source_reachable: Boolean(fleet.reachable), source_usable: Boolean(fleet.reachable), baseline_present: Boolean(prevSnap.reachable) };
    case 'press_negative':
      return { source_reachable: Boolean(press.reachable), source_usable: false };
    case 'evidence_stale':
      return { source_reachable: true, source_usable: true };
    default:
      return { source_reachable: null, source_usable: null };
  }
}

function sourceStatsFor(signalId, s) {
  switch (signalId) {
    case 'registry_terminated':
    case 'registry_absent':
      return s.lv.reachable ? { ...s.lv.stats } : { reachable: false, error: s.lv.error };
    case 'vert_permit_expired':
      return s.vert.reachable ? { ...s.vert.stats } : { reachable: false, error: s.vert.error };
    case 'queue_disappearance':
      return s.prevSnap.reachable ? { ...s.prevSnap.stats, current_rows: s.fleet.stats.entries } : { reachable: false, error: s.prevSnap.error };
    case 'press_negative':
      return s.press.reachable ? { ...s.press.stats } : { reachable: false, error: s.press.error };
    case 'evidence_stale':
      return { fleet_entries: s.fleet.stats.entries, fleet_updated_at: s.fleet.stats.updated_at };
    default:
      return {};
  }
}

function renderReport({ detectors, byTier, suppressed, sweep, controls, sources, snapFile }) {
  const L = [];
  L.push('# Phase 37.B.1 — first detector run against real data (REPORT-ONLY)');
  L.push('');
  L.push(`**Generated:** ${NOW} · **Mode:** ${WRITE ? 'WRITE' : 'REPORT-ONLY — no status writes'}`);
  L.push('');
  L.push('Aggregate counts and publishable fields only. Private-tier proposals are counted here and enumerated only in the gitignored payload.');
  L.push('');
  L.push('## Sources — reachability recorded separately from findings');
  L.push('');
  L.push('| Source | reachable | detail |');
  L.push('|---|---|---|');
  L.push(`| public_fleet | ${sources.fleet.reachable} | ${sources.fleet.reachable ? `${sources.fleet.stats.entries} entries, updated ${sources.fleet.stats.updated_at}` : sources.fleet.error} |`);
  L.push(`| lv_ur_opendata | ${sources.lv.reachable} | ${sources.lv.reachable ? `${sources.lv.stats.entities} entities, ${sources.lv.stats.historic} former names, terminated share ${(sources.lv.stats.terminated_share * 100).toFixed(1)}%, file ${sources.lv.stats.register_mtime}` : sources.lv.error} |`);
  L.push(`| vert_monthly | ${sources.vert.reachable} | ${sources.vert.reachable ? `${sources.vert.stats.permits_parsed} permits, ${sources.vert.stats.with_expiry} carrying an expiry (${sources.vert.stats.file})` : sources.vert.error} |`);
  L.push(`| lv_press_tripwire | ${sources.press.reachable} | ${sources.press.reachable ? `${sources.press.stats.items_scanned} items scanned, ${sources.press.stats.candidates_found} candidates (${sources.press.stats.file})` : sources.press.error} |`);
  L.push(`| queue_snapshot (prior) | ${sources.prevSnap.reachable} | ${sources.prevSnap.reachable ? `${sources.prevSnap.stats.rows} rows, taken ${sources.prevSnap.stats.taken_at}` : sources.prevSnap.error} |`);
  L.push('');
  L.push(`Baseline snapshot written this run: \`${path.relative(ROOT, snapFile)}\``);
  L.push('');
  L.push('## B11 controls — re-proven this run, not inherited from Pause A');
  L.push('');
  L.push('A registry zero means something about Latvian companies only if the lookup can tell a real company from a nonsense string, and only if a terminated entity actually reads back terminated. Both are asserted every run; a failure suppresses the registry detectors rather than being believed.');
  L.push('');
  if (controls.ran) {
    L.push(`- known-good names resolved: **${controls.detail.known_good_resolved}**`);
    L.push(`- nonsense names resolved: **${controls.detail.nonsense_resolved}** (must be 0/N)`);
    L.push(`- known-terminated entities reading back as terminated: **${controls.detail.terminated_readback}**`);
    L.push(`- verdict: **${controls.passed ? 'PASS' : `FAIL — ${controls.reasons.join('; ')}`}**`);
  } else {
    L.push(`- NOT RUN: ${controls.reasons.join('; ')}`);
  }
  L.push('');
  L.push('## Detectors');
  L.push('');
  L.push('`eligible` counts rows this detector could actually look at. The tier split is load-bearing: a detector whose eligible rows are all private-tier is healthy and still cannot move a published number.');
  L.push('');
  L.push('| Detector | status | eligible / in scope | of which public-tier | reason |');
  L.push('|---|---|---|---|---|');
  for (const [id, d] of Object.entries(detectors)) {
    if (id === 'new_entity_unmatched') {
      L.push(`| ${id} | **${d.status}** | ${d.source_stats?.candidates_total ?? '—'} candidates | n/a (report-only) | ${(d.reasons || []).join('; ') || '—'} |`);
      continue;
    }
    L.push(`| ${id} | **${d.status}** | ${d.population?.rows_eligible ?? '—'} / ${d.population?.rows_in_scope ?? '—'} | ${d.population?.eligible_by_tier?.public ?? '—'} | ${(d.reasons || []).join('; ') || '—'} |`);
  }
  L.push('');
  L.push('## Proposal set');
  L.push('');
  L.push(`- public-tier (eligible for the write path): **${byTier.public.length}**`);
  L.push(`- private-tier (operator review queue only, never sent to the worker): **${byTier.private.length}**`);
  L.push('');
  if (byTier.public.length) {
    L.push('| id | signal | type | confidence | citations |');
    L.push('|---|---|---|---|---|');
    for (const p of byTier.public) {
      L.push(`| ${p.id} | ${p.signal_id} | ${p.type} | ${p.confidence} | ${(p.evidence || []).length} |`);
    }
  } else {
    L.push('_No public-tier proposal. That is a result, not a null run: the detector table above records what each detector was able to look at._');
  }
  L.push('');
  L.push('## Suppressed / non-healthy detectors — logged, never obeyed');
  L.push('');
  if (suppressed.length) {
    for (const s of suppressed) L.push(`- **${s.signal_id}** — ${s.status}: ${s.reasons.join('; ')} (${s.rows_in_scope} rows in scope, not evaluated)`);
  } else {
    L.push('_None._');
  }
  L.push('');
  L.push('## Discovery sweep (report-only by rule)');
  L.push('');
  if (!sweep.probed) {
    L.push(`Not probed: ${sweep.reason}`);
  } else {
    L.push(`Scanned ${sweep.scanned_name_keys} distinct register name keys; **${sweep.candidates_total}** live storage-named entities are not already tracked. Returned ${sweep.candidates_returned}${sweep.capped ? ` — **CAPPED at ${sweep.cap}**; the remainder is counted above, not silently dropped` : ''}.`);
    L.push('');
    L.push('These are NAME MATCHES against the register, nothing more. A storage-sounding company name is not a project: none of these enters the fleet DB without the verification a real project needs (rule #3). Source for every row: the Latvian Uzņēmumu reģistrs bulk export, `regcode` as locator — <https://data.gov.lv/dati/lv/dataset/uz>.');
    L.push('');
    L.push('| regcode | name | registered |');
    L.push('|---|---|---|');
    for (const c of sweep.candidates.slice(0, 15)) {
      L.push(`| ${c.regcode} | ${c.name} | ${c.registered || '—'} |`);
    }
    if (sweep.candidates.length > 15) L.push(`| … | _${sweep.candidates.length - 15} further candidates in the gitignored payload_ | |`);
  }
  L.push('');
  return L.join('\n');
}
