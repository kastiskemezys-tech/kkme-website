// Phase 37.B — fleet lifecycle engine.
//
// The rules live in data/lifecycle-rules.json, not in this file. This module is
// the interpreter: it evaluates signals against rows, applies the guards, and
// produces evidence-carrying transitions. Changing WHICH signals exist or WHAT
// they do is a data edit, reviewable in a diff.
//
// Two properties this module exists to guarantee:
//
//   1. Nothing is ever deleted. Retirement is a status plus evidence plus a date,
//      and it is reversible. A retired row keeps contributing to the audit trail
//      and to the "how much announced pipeline died" story.
//
//   2. No detector is trusted blindly (B8). Every signal declares a liveness
//      invariant, and a signal whose invariant fails is SUPPRESSED and reported as
//      unhealthy rather than allowed to act. The paid-for case: a whitespace
//      parsing bug marked all 486,509 LV entities terminated. Wired straight into
//      decay detection, that retires the entire fleet in one run and looks like a
//      working system doing its job.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RULES_PATH = path.join(HERE, '../data/lifecycle-rules.json');

export function loadRules(p = RULES_PATH) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export const ACTION = Object.freeze({
  SOFT_RETIRE: 'soft_retire',
  FLAG_REVIEW: 'flag_review',
  REPORT_ONLY: 'report_only',
});

export const DETECTOR = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',   // invariant breached — signal suppressed this run
  BLIND: 'blind',           // ran, but has never seen anything; indistinguishable from silence
  NEVER_RUN: 'never_run',
  STALE: 'stale',
});

/**
 * Evaluate one signal's liveness invariants against this run's observations.
 * Returns {status, reasons[]}. A non-healthy detector must not be allowed to act.
 */
export function checkDetectorHealth(signal, obs = {}, nowMs = null) {
  const reasons = [];
  const inv = signal.meta_monitor?.invariants || {};

  if (obs.last_run_at === undefined || obs.last_run_at === null) {
    return { status: DETECTOR.NEVER_RUN, reasons: ['no successful run recorded'] };
  }

  if (nowMs !== null && signal.meta_monitor?.max_age_hours) {
    const ageH = (nowMs - new Date(obs.last_run_at).getTime()) / 3600000;
    if (ageH > signal.meta_monitor.max_age_hours) {
      reasons.push(`last run ${ageH.toFixed(0)}h ago exceeds ${signal.meta_monitor.max_age_hours}h`);
      return { status: DETECTOR.STALE, reasons };
    }
  }

  if (inv.min_entities !== undefined && obs.entities !== undefined && obs.entities < inv.min_entities) {
    reasons.push(`entity count ${obs.entities} below floor ${inv.min_entities} — parse likely broken`);
  }
  if (inv.max_terminated_share !== undefined && obs.terminated_share !== undefined && obs.terminated_share > inv.max_terminated_share) {
    reasons.push(`terminated share ${(obs.terminated_share * 100).toFixed(1)}% above ceiling ${(inv.max_terminated_share * 100)}% — this is the whitespace-parse failure mode`);
  }
  if (inv.min_terminated_share !== undefined && obs.terminated_share !== undefined && obs.terminated_share < inv.min_terminated_share) {
    reasons.push(`terminated share ${(obs.terminated_share * 100).toFixed(1)}% below floor ${(inv.min_terminated_share * 100)}% — field may have stopped populating`);
  }
  if (inv.max_absent_share_per_run !== undefined && obs.absent_share !== undefined && obs.absent_share > inv.max_absent_share_per_run) {
    reasons.push(`absent share ${(obs.absent_share * 100).toFixed(1)}% above ${(inv.max_absent_share_per_run * 100)}% — mass absence is a fetch failure, not mass liquidation`);
  }
  if (inv.min_snapshot_rows !== undefined && obs.snapshot_rows !== undefined && obs.snapshot_rows < inv.min_snapshot_rows) {
    reasons.push(`snapshot has ${obs.snapshot_rows} rows, below ${inv.min_snapshot_rows}`);
  }
  if (inv.max_shrink_ratio !== undefined && obs.shrink_ratio !== undefined && obs.shrink_ratio > inv.max_shrink_ratio) {
    reasons.push(`snapshot shrank by ${(obs.shrink_ratio * 100).toFixed(0)}% — suppressing disappearance diffs`);
  }
  if (inv.min_permits_parsed !== undefined && obs.permits_parsed !== undefined && obs.permits_parsed < inv.min_permits_parsed) {
    reasons.push(`parsed ${obs.permits_parsed} permits — parser produced nothing`);
  }
  if (inv.min_with_expiry !== undefined && obs.with_expiry !== undefined && obs.with_expiry < inv.min_with_expiry) {
    reasons.push(`no permit carried an expiry date — the field this detector depends on is absent`);
  }

  if (reasons.length) return { status: DETECTOR.UNHEALTHY, reasons };

  // "ran but has never seen anything" — the tripwire failure mode from 36.D
  if (inv.alert_if_zero_items_consecutive_runs !== undefined
      && obs.consecutive_zero_runs !== undefined
      && obs.consecutive_zero_runs >= inv.alert_if_zero_items_consecutive_runs) {
    return { status: DETECTOR.BLIND, reasons: [`${obs.consecutive_zero_runs} consecutive runs with zero items — silence may be breakage`] };
  }
  if (inv.alert_if_zero_candidates_consecutive_runs !== undefined
      && obs.consecutive_zero_runs !== undefined
      && obs.consecutive_zero_runs >= inv.alert_if_zero_candidates_consecutive_runs) {
    return { status: DETECTOR.BLIND, reasons: [`${obs.consecutive_zero_runs} consecutive runs with zero candidates`] };
  }
  if (inv.alert_if_all_rows_stale && obs.all_rows_stale) {
    return { status: DETECTOR.BLIND, reasons: ['every row is stale — intake has stopped running'] };
  }

  return { status: DETECTOR.HEALTHY, reasons: [] };
}

/**
 * The rename guard. A missing or terminated name that resolves as a FORMER name of
 * a still-active registration is a rename, not a death — the single most damaging
 * false positive available to this system, because it retires live projects.
 */
export function applyRenameGuard(observation) {
  if (!observation) return { cancelled: false };
  if (observation.matched_via === 'historic' && observation.status === 'active') {
    return {
      cancelled: true,
      transition: {
        type: 'renamed',
        from_name: observation.former_name ?? null,
        to_name: observation.current_name ?? null,
        renamed_on: observation.renamed_on ?? null,
        note: 'decay signal cancelled by the rename guard — the registration is still active under a new name',
      },
    };
  }
  return { cancelled: false };
}

/**
 * Evaluate one row against one signal.
 * `fired` alone never changes anything — the caller must also see healthy detector
 * status and satisfied evidence requirements.
 */
export function evaluateSignal(signal, row, observation, health) {
  const out = { signal_id: signal.id, fired: false, action: null, suppressed: false, evidence: [], notes: [] };

  if (health && health.status !== DETECTOR.HEALTHY) {
    out.suppressed = true;
    out.notes.push(`detector ${health.status}: ${health.reasons.join('; ')}`);
    return out;
  }

  if (Array.isArray(signal.countries) && row.country && !signal.countries.includes(row.country)) {
    return out;
  }

  const guard = signal.guard === 'rename_check' ? applyRenameGuard(observation) : { cancelled: false };
  if (guard.cancelled) {
    out.notes.push(guard.transition.note);
    out.rename = guard.transition;
    return out;
  }

  // signal-specific firing conditions
  switch (signal.id) {
    case 'registry_terminated':
      out.fired = Boolean(observation?.found && observation.status === 'terminated');
      break;
    case 'registry_absent':
      out.fired = Boolean(observation && observation.found === false && row.is_legal_entity);
      break;
    case 'vert_permit_expired':
      out.fired = Boolean(observation?.permit_expired && !observation.succeeded_by_generation_permit);
      break;
    case 'queue_disappearance':
      out.fired = Boolean(observation?.was_in_previous_snapshot && !observation.in_current_snapshot);
      break;
    case 'press_negative':
      out.fired = Boolean(observation?.negative_press_hit);
      break;
    case 'evidence_stale':
      out.fired = Boolean(observation?.months_since_evidence >= (signal.staleness_months ?? 6));
      break;
    case 'new_entity_unmatched':
      out.fired = Boolean(observation?.unmatched_candidate);
      break;
    default:
      out.fired = false;
  }

  if (!out.fired) return out;

  if (signal.evidence_required) {
    const ev = (observation?.evidence || []).filter((e) => e && /^https?:\/\//.test(e.url || ''));
    if (ev.length === 0) {
      out.fired = false;
      out.notes.push('signal conditions met but no cited evidence — not applied (rule #3)');
      return out;
    }
    out.evidence = ev;
  }

  out.action = signal.action;

  // escalation: repeated firing can raise a flag to a retirement
  if (signal.escalation && observation?.consecutive_fires >= signal.escalation.after_consecutive_runs) {
    out.action = signal.escalation.to;
    out.notes.push(`escalated after ${observation.consecutive_fires} consecutive fires`);
  }

  return out;
}

/**
 * Build the transition for a row from its evaluated signals.
 * Returns null when nothing changes. Never produces a deletion.
 */
export function buildTransition(row, evaluations, nowIso) {
  const retire = evaluations.find((e) => e.fired && e.action === ACTION.SOFT_RETIRE);
  const flags = evaluations.filter((e) => e.fired && e.action === ACTION.FLAG_REVIEW);
  const renames = evaluations.filter((e) => e.rename);
  const suppressed = evaluations.filter((e) => e.suppressed);

  if (renames.length) {
    return {
      id: row.id, at: nowIso, type: 'renamed',
      detail: renames[0].rename,
      status: row.status ?? 'active',
      evidence: [],
    };
  }

  if (retire) {
    return {
      id: row.id, at: nowIso, type: 'retired',
      status: 'retired',
      reason: retire.signal_id,
      evidence: retire.evidence,
      date: nowIso,
      reversible: true,
      // explicit: the row is NOT removed, only excluded from supply
      removed_from_db: false,
      excluded_from_supply: true,
    };
  }

  if (flags.length) {
    return {
      id: row.id, at: nowIso, type: 'review_flagged',
      status: row.status ?? 'active',
      reasons: flags.map((f) => f.signal_id),
      evidence: flags.flatMap((f) => f.evidence),
    };
  }

  if (suppressed.length) {
    return {
      id: row.id, at: nowIso, type: 'signal_suppressed',
      status: row.status ?? 'active',
      reasons: suppressed.map((s) => `${s.signal_id}: ${s.notes.join('; ')}`),
      evidence: [],
    };
  }

  return null;
}

/** Append-only transition log. Never rewrites or removes prior entries. */
export function appendTransitions(existingLog, transitions) {
  const log = Array.isArray(existingLog) ? existingLog.slice() : [];
  for (const t of transitions) if (t) log.push(t);
  return log;
}

/** Weekly digest — carries detector health alongside findings, by design. */
export function buildDigest(transitions, detectorHealth, { now = null } = {}) {
  const by = (type) => transitions.filter((t) => t && t.type === type);
  const unhealthy = Object.entries(detectorHealth || {})
    .filter(([, h]) => h.status !== DETECTOR.HEALTHY)
    .map(([id, h]) => `${id}: ${h.status} (${h.reasons.join('; ')})`);

  const lines = [];
  lines.push('*KKME fleet lifecycle — weekly digest*');
  if (now) lines.push(`_${now}_`);
  lines.push('');
  lines.push(`New: ${by('discovered').length} · Renamed: ${by('renamed').length} · Retired: ${by('retired').length} · Review-flagged: ${by('review_flagged').length}`);

  for (const t of by('retired').slice(0, 10)) {
    lines.push(`• RETIRED ${t.id} — ${t.reason} (${t.evidence.length} citation${t.evidence.length === 1 ? '' : 's'})`);
  }
  for (const t of by('renamed').slice(0, 10)) {
    lines.push(`• RENAMED ${t.id} — ${t.detail.from_name} → ${t.detail.to_name}`);
  }

  lines.push('');
  if (unhealthy.length) {
    lines.push(`⚠️ *Detectors not healthy (${unhealthy.length})* — findings below may be incomplete:`);
    unhealthy.forEach((u) => lines.push(`  • ${u}`));
  } else {
    lines.push('All detectors healthy.');
  }
  // The point: a quiet week and a broken week must never look the same.
  if (!transitions.length && !unhealthy.length) {
    lines.push('');
    lines.push('_No transitions this week, all detectors confirmed healthy — this is a genuine quiet week, not silence._');
  }
  return lines.join('\n');
}
