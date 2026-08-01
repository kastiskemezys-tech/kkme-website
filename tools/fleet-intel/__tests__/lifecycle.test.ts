// Phase 37.B — lifecycle transition properties + detector meta-monitoring.
//
// The properties under test are the ones that make this safe to run unattended:
// nothing is ever deleted, nothing changes without cited evidence, a rename is
// never a death, and a broken detector is suppressed rather than obeyed.

import { describe, it, expect } from 'vitest';
import {
  loadRules, checkDetectorHealth, applyRenameGuard, evaluateSignal,
  buildTransition, appendTransitions, buildDigest, ACTION, DETECTOR,
} from '../lib/lifecycle.mjs';

// Rules JSON is deeply dynamic; matches the convention in tools/consultancy/__tests__.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const rules = loadRules();
const sig = (id: string) => rules.signals.find((s: Any) => s.id === id);
const NOW = '2026-07-31T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const healthy = { status: DETECTOR.HEALTHY, reasons: [] };

const ROW = { id: 'fi-lv-test-0001', country: 'LV', is_legal_entity: true, status: 'active' };
const CITED = [{ url: 'https://example.org/register/1', source_type: 'registry' }];

describe('rules are DATA, not code', () => {
  it('every signal declares an action, a rationale and a meta_monitor', () => {
    for (const s of rules.signals as Any[]) {
      expect(s.action, `${s.id} action`).toBeTruthy();
      expect(s.rationale, `${s.id} rationale`).toBeTruthy();
      expect(s.meta_monitor?.how_we_know_it_broke, `${s.id} B8 answer`).toBeTruthy();
    }
  });

  it('retirement is soft and never deletes', () => {
    expect(rules.retirement.mode).toBe('soft');
    expect(rules.retirement.never_delete).toBe(true);
  });

  it('only HIGH-confidence primary signals may retire; everything else flags', () => {
    for (const s of rules.signals as Any[]) {
      if (s.action === ACTION.SOFT_RETIRE) expect(s.confidence, `${s.id}`).toBe('high');
    }
  });
});

describe('detector meta-monitoring (B8)', () => {
  const s = sig('registry_terminated');

  it('a never-run detector is NEVER_RUN, not healthy', () => {
    expect(checkDetectorHealth(s, {}).status).toBe(DETECTOR.NEVER_RUN);
  });

  it('THE PAID-FOR CASE: all-entities-terminated trips the invariant', () => {
    // the whitespace-parse bug: 486,509 of 486,509 terminated
    const h = checkDetectorHealth(s, { last_run_at: NOW, entities: 486509, terminated_share: 1.0 }, NOW_MS);
    expect(h.status).toBe(DETECTOR.UNHEALTHY);
    expect(h.reasons.join(' ')).toMatch(/terminated share/i);
  });

  it('a plausible terminated share is healthy', () => {
    const h = checkDetectorHealth(s, { last_run_at: NOW, entities: 486509, terminated_share: 0.548 }, NOW_MS);
    expect(h.status).toBe(DETECTOR.HEALTHY);
  });

  it('a collapsed entity count trips the invariant — parse broke', () => {
    const h = checkDetectorHealth(s, { last_run_at: NOW, entities: 12, terminated_share: 0.5 }, NOW_MS);
    expect(h.status).toBe(DETECTOR.UNHEALTHY);
  });

  it('a detector that has not run within its window is STALE', () => {
    const old = new Date(NOW_MS - 800 * 3600000).toISOString();
    expect(checkDetectorHealth(s, { last_run_at: old, entities: 486509, terminated_share: 0.5 }, NOW_MS).status)
      .toBe(DETECTOR.STALE);
  });

  it('a tripwire with nothing to show for consecutive runs is BLIND, not silent', () => {
    const h = checkDetectorHealth(sig('press_negative'), { last_run_at: NOW, consecutive_zero_runs: 4 }, NOW_MS);
    expect(h.status).toBe(DETECTOR.BLIND);
  });

  it('mass queue disappearance is read as a fetch failure, not mass death', () => {
    const h = checkDetectorHealth(sig('queue_disappearance'), { last_run_at: NOW, snapshot_rows: 200, shrink_ratio: 0.9 }, NOW_MS);
    expect(h.status).toBe(DETECTOR.UNHEALTHY);
    expect(h.reasons.join(' ')).toMatch(/suppressing disappearance/i);
  });
});

describe('an unhealthy detector is SUPPRESSED, never obeyed', () => {
  it('does not fire even when the row would otherwise match', () => {
    const unhealthy = { status: DETECTOR.UNHEALTHY, reasons: ['terminated share 100%'] };
    const ev = evaluateSignal(sig('registry_terminated'), ROW,
      { found: true, status: 'terminated', evidence: CITED }, unhealthy);
    expect(ev.fired).toBe(false);
    expect(ev.suppressed).toBe(true);
  });

  it('the suppression is RECORDED, not swallowed', () => {
    const unhealthy = { status: DETECTOR.UNHEALTHY, reasons: ['bad parse'] };
    const ev = evaluateSignal(sig('registry_terminated'), ROW, { found: true, status: 'terminated', evidence: CITED }, unhealthy);
    const t = buildTransition(ROW, [ev], NOW);
    expect(t?.type).toBe('signal_suppressed');
  });
});

describe('the rename guard — a rename is never a death', () => {
  it('cancels a decay signal when the registration is active under a new name', () => {
    const obs = { matched_via: 'historic', status: 'active', former_name: 'Old SIA', current_name: 'New SIA', renamed_on: '2025-03-01' };
    expect(applyRenameGuard(obs).cancelled).toBe(true);
  });

  it('does NOT cancel when the entity is genuinely terminated', () => {
    expect(applyRenameGuard({ matched_via: 'current', status: 'terminated' }).cancelled).toBe(false);
  });

  it('a renamed row produces a rename transition, NOT a retirement', () => {
    const obs = { matched_via: 'historic', status: 'active', former_name: 'Old SIA', current_name: 'New SIA', evidence: CITED };
    const ev = evaluateSignal(sig('registry_terminated'), ROW, obs, healthy);
    expect(ev.fired).toBe(false);
    const t = buildTransition(ROW, [ev], NOW);
    expect(t?.type).toBe('renamed');
    expect(t?.status).not.toBe('retired');
  });
});

describe('evidence is required before anything changes (rule #3)', () => {
  it('a terminated entity with NO citation does not retire', () => {
    const ev = evaluateSignal(sig('registry_terminated'), ROW, { found: true, status: 'terminated', evidence: [] }, healthy);
    expect(ev.fired).toBe(false);
    expect(ev.notes.join(' ')).toMatch(/no cited evidence/i);
  });

  it('evidence without a resolvable URL does not count', () => {
    const ev = evaluateSignal(sig('registry_terminated'), ROW,
      { found: true, status: 'terminated', evidence: [{ url: 'see the register' }] }, healthy);
    expect(ev.fired).toBe(false);
  });

  it('a cited termination DOES retire', () => {
    const ev = evaluateSignal(sig('registry_terminated'), ROW, { found: true, status: 'terminated', evidence: CITED }, healthy);
    expect(ev.fired).toBe(true);
    expect(ev.action).toBe(ACTION.SOFT_RETIRE);
  });
});

describe('retirement is soft, evidenced and reversible', () => {
  const ev = evaluateSignal(sig('registry_terminated'), ROW, { found: true, status: 'terminated', evidence: CITED }, healthy);
  const t = buildTransition(ROW, [ev], NOW)!;

  it('never deletes the row', () => {
    expect(t.removed_from_db).toBe(false);
    expect(t.reversible).toBe(true);
  });

  it('leaves supply but stays in the DB', () => {
    expect(t.excluded_from_supply).toBe(true);
  });

  it('carries its evidence and reason', () => {
    expect(t.evidence.length).toBeGreaterThan(0);
    expect(t.reason).toBe('registry_terminated');
  });
});

describe('absence never retires', () => {
  it('an absent SPV only flags for review', () => {
    const ev = evaluateSignal(sig('registry_absent'), ROW, { found: false, evidence: CITED }, healthy);
    expect(ev.fired).toBe(true);
    expect(ev.action).toBe(ACTION.FLAG_REVIEW);
    expect(ev.action).not.toBe(ACTION.SOFT_RETIRE);
  });
});

describe('escalation', () => {
  it('an expired VERT permit flags once, retires after the configured repeats', () => {
    const once = evaluateSignal(sig('vert_permit_expired'), { ...ROW, country: 'LT' },
      { permit_expired: true, consecutive_fires: 1, evidence: CITED }, healthy);
    expect(once.action).toBe(ACTION.FLAG_REVIEW);

    const twice = evaluateSignal(sig('vert_permit_expired'), { ...ROW, country: 'LT' },
      { permit_expired: true, consecutive_fires: 2, evidence: CITED }, healthy);
    expect(twice.action).toBe(ACTION.SOFT_RETIRE);
  });
});

describe('country gating', () => {
  it('an LV-only signal does not fire on an LT row', () => {
    const ev = evaluateSignal(sig('registry_terminated'), { ...ROW, country: 'LT' },
      { found: true, status: 'terminated', evidence: CITED }, healthy);
    expect(ev.fired).toBe(false);
  });
});

describe('transition log is append-only', () => {
  it('preserves prior entries and drops nulls', () => {
    const prior = [{ id: 'a', at: '2026-01-01', type: 'retired' }];
    const next = appendTransitions(prior, [null, { id: 'b', at: NOW, type: 'renamed' }]);
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe('a');
  });

  it('does not mutate the input', () => {
    const prior = [{ id: 'a' }];
    appendTransitions(prior, [{ id: 'b' }]);
    expect(prior).toHaveLength(1);
  });
});

describe('digest — a quiet week and a broken week must not look the same', () => {
  it('reports detector health alongside findings', () => {
    const d = buildDigest([], { registry_terminated: { status: DETECTOR.BLIND, reasons: ['4 zero runs'] } });
    expect(d).toMatch(/Detectors not healthy/);
    expect(d).not.toMatch(/genuine quiet week/);
  });

  it('says so explicitly when silence is genuine', () => {
    const d = buildDigest([], { registry_terminated: { status: DETECTOR.HEALTHY, reasons: [] } });
    expect(d).toMatch(/genuine quiet week/);
  });

  it('lists retirements with their citation counts', () => {
    const d = buildDigest([{ type: 'retired', id: 'x', reason: 'registry_terminated', evidence: CITED }], {});
    expect(d).toMatch(/RETIRED x/);
  });
});
