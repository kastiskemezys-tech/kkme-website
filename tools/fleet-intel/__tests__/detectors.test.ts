// Phase 37.B.1 — the observation builders, and the properties that keep their
// ZEROS honest.
//
// 37.B's interpreter was already tested. What had never existed was the half that
// puts real data in front of it, and the failure mode that half introduces is not
// "wrong verdict" — it is "confident zero". A detector that looked at nothing, or
// looked with a probe that cannot see, reports the same 0 as one that checked the
// world and found it quiet. These tests exist to keep those three cases distinct.

import { describe, it, expect } from 'vitest';
import {
  applicantOf, toLifecycleRow, observeRegistry, observeVert, observeQueue,
  observePress, observeStaleness, runRegistryControls, sweepUnmatchedEntities,
  eligibility, OBSERVERS,
} from '../lib/detectors.mjs';
import { applyEligibility, checkDetectorHealth, evaluateSignal, buildTransition, loadRules, DETECTOR, ACTION } from '../lib/lifecycle.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const rules = loadRules();
const sig = (id: string) => rules.signals.find((s: Any) => s.id === id);
const NOW = '2026-08-01T12:00:00.000Z';
const healthy = { status: DETECTOR.HEALTHY, reasons: [] };

/** A synthetic register index with the same shape lv-register.buildIndex returns. */
function fakeIndex(entities: Any[], historic: Any[] = []) {
  const byName = new Map<string, Any[]>();
  const byHistoricName = new Map<string, Any[]>();
  for (const e of entities) {
    const k = e._key;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(e);
  }
  for (const h of historic) {
    if (!byHistoricName.has(h._key)) byHistoricName.set(h._key, []);
    byHistoricName.get(h._key)!.push(h);
  }
  return { byName, byHistoricName, stats: { entities: entities.length, historic: historic.length, terminated: 0 } };
}

const LIVE = { _key: 'kanareles bess', regcode: '40200000001', name: 'SIA "Kanarėlės BESS"', trading_name: 'Kanarėlės BESS', terminated: '', closed: '', address: '', city: 'Rīga', registered: '2021-01-01' };
const DEAD = { _key: 'nokaltusi energija', regcode: '40200000002', name: 'SIA "Nokaltusi Energija"', trading_name: 'Nokaltusi Energija', terminated: '2025-06-01', closed: '', address: '', city: 'Rīga', registered: '2019-01-01' };

// ── population shaping ───────────────────────────────────────────────────────

describe('population shaping', () => {
  it('pulls the applicant out of the public fleet `source` field', () => {
    expect(applicantOf({ source: 'elering · A-Consult OÜ' })).toBe('A-Consult OÜ');
    expect(applicantOf({ source: 'litgrid' })).toBeNull();
  });

  it('a curated row whose `source` carries a NOTE is not mistaken for a company', () => {
    // `AST · TSO operational` is a provenance note, not an applicant. Treating it as
    // an entity name would send "TSO operational" to the register and read the
    // inevitable miss as a project with no registry trace.
    const row = toLifecycleRow({ id: 'ast-bess-tume-lv', country: 'LV', source: 'AST · TSO operational', status: 'operational' }, 'public');
    expect(row.entity_name).toBe('TSO operational');
    expect(row.is_legal_entity).toBe(false);
  });

  it('tags every row with the tier that decides what a proposal may do', () => {
    expect(toLifecycleRow({ id: 'a', source: 'x · Y OÜ' }, 'public').tier).toBe('public');
    expect(toLifecycleRow({ id: 'b', spv: 'SIA "Z"', is_legal_entity: true }, 'private').tier).toBe('private');
  });
});

// ── the "never checked" vs "checked, nothing there" distinction ──────────────

describe('an unprobed row is never a negative finding (B11)', () => {
  const ctx = { lvIndex: fakeIndex([LIVE, DEAD]), registerAsOf: NOW };

  it('a project descriptor is reported as UNPROBED, not as a registry miss', () => {
    const row = toLifecycleRow({ id: 'x', country: 'LV', source: 'esn · Aretis Group' }, 'public');
    const obs = observeRegistry(row, ctx);
    expect(obs.probed).toBe(false);
    expect(obs.found).toBeUndefined();      // NOT false — the difference is the point
    expect(obs.reason).toMatch(/not a legal entity/);
  });

  it('an unreachable source is unprobed rather than empty', () => {
    expect(observeRegistry({ country: 'LV', entity_name: 'SIA "X"', is_legal_entity: true } as Any, {} as Any).probed).toBe(false);
    expect(observeVert({ country: 'LT', name: 'X' } as Any, {} as Any).probed).toBe(false);
    expect(observeQueue({ id: 'x', tier: 'public' } as Any, {} as Any).probed).toBe(false);
  });

  it('press_negative refuses to run against a probe that scans for the OPPOSITE event', () => {
    // The lv_press tripwire is reachable and looks for COMMISSIONING. Its silence is
    // not evidence that nothing was cancelled, so the detector declines to speak.
    const obs = observePress({} as Any, { pressReachable: true } as Any);
    expect(obs.probed).toBe(false);
    expect(obs.reason).toMatch(/COMMISSIONING keywords only/);
  });

  it('a VERT holder with permits but no expiry date is unprobed, not unexpired', () => {
    const ctx2 = { vert: [{ company_name: 'UAB "Testas"', permit_id: '1', permit_expiry: null, source_url: 'https://vert.lt/x.pdf' }], now: NOW };
    const obs = observeVert({ country: 'LT', entity_name: 'UAB "Testas"', name: 'Testas' } as Any, ctx2 as Any);
    expect(obs.probed).toBe(false);
    expect(obs.reason).toMatch(/none carrying an expiry date/);
  });
});

// ── eligibility turns a blind detector's health honest ───────────────────────

describe('applyEligibility — a detector with nothing to look at is BLIND, not healthy', () => {
  it('downgrades a passing detector whose population was empty', () => {
    const h = applyEligibility(healthy, { rows_in_scope: 48, rows_eligible: 0, why_ineligible: { 'not a legal entity': 48 } });
    expect(h.status).toBe(DETECTOR.BLIND);
    expect(h.reasons[0]).toMatch(/0 of 48 rows in scope/);
    expect(h.reasons[0]).toMatch(/about the population, not the world/);
  });

  it('leaves a detector with an eligible population alone', () => {
    expect(applyEligibility(healthy, { rows_in_scope: 48, rows_eligible: 36 }).status).toBe(DETECTOR.HEALTHY);
  });

  it('never upgrades an already-unhealthy detector', () => {
    const unhealthy = { status: DETECTOR.UNHEALTHY, reasons: ['terminated share 100%'] };
    expect(applyEligibility(unhealthy, { rows_in_scope: 1, rows_eligible: 1 })).toBe(unhealthy);
  });

  it('a BLIND detector cannot act — the suppression path is the same one a broken detector takes', () => {
    const h = applyEligibility(healthy, { rows_in_scope: 10, rows_eligible: 0 });
    const ev = evaluateSignal(sig('registry_terminated'), { id: 'x', country: 'LV' },
      { found: true, status: 'terminated', evidence: [{ url: 'https://example.org/1' }] }, h);
    expect(ev.suppressed).toBe(true);
    expect(ev.fired).toBe(false);
    expect(buildTransition({ id: 'x' }, [ev], NOW)!.type).toBe('signal_suppressed');
  });
});

// ── the B11 controls ─────────────────────────────────────────────────────────

describe('registry controls — the probe must prove itself every run', () => {
  it('fails when a nonsense term resolves — the Lursoft shape', () => {
    // Every lookup returns a hit: exactly the endpoint that "worked" in 37.A and
    // produced a 0/36 that was about the probe, not about 36 companies.
    const alwaysHits = {
      byName: { get: () => [LIVE], values: () => [[LIVE]], [Symbol.iterator]: function* () { yield ['kanareles bess', [LIVE]]; } },
      byHistoricName: { get: () => null },
    };
    const c = runRegistryControls(alwaysHits as Any);
    expect(c.passed).toBe(false);
    expect(c.reasons.join(' ')).toMatch(/nonsense control\(s\) RESOLVED/);
  });

  it('fails when known-good names do NOT resolve', () => {
    const c = runRegistryControls(fakeIndex([LIVE, DEAD]));
    expect(c.passed).toBe(false);
    expect(c.reasons.join(' ')).toMatch(/known-good controls resolved 0\/3/);
  });

  it('fails when no terminated entity reads back as terminated — a dead decay branch', () => {
    const c = runRegistryControls(fakeIndex([LIVE]));
    expect(c.reasons.join(' ')).toMatch(/known-terminated entities read back as terminated/);
  });

  it('reports NOT RUN rather than PASS when the index is missing', () => {
    const c = runRegistryControls(null);
    expect(c.ran).toBe(false);
    expect(c.passed).toBe(false);
  });
});

// ── discovery sweep caps are reported, never silent ──────────────────────────

describe('discovery sweep', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    _key: `bess energija ${i}`, regcode: `4020000${i}`, trading_name: `BESS Enerģija ${i}`,
    terminated: '', closed: '', city: 'Rīga', registered: '2024-01-01',
  }));

  it('flags a truncated sweep instead of presenting it as complete coverage', () => {
    const s = sweepUnmatchedEntities({ lvIndex: fakeIndex(many), knownNameKeys: new Set() } as Any, { cap: 5 });
    expect(s.candidates_total).toBe(12);
    expect(s.candidates_returned).toBe(5);
    expect(s.capped).toBe(true);
  });

  it('excludes entities we already track and terminated ones', () => {
    const s = sweepUnmatchedEntities(
      { lvIndex: fakeIndex([...many, { ...DEAD, _key: 'bess nokaltusi' }]), knownNameKeys: new Set(['bess energija 0']) } as Any,
      { cap: 100 },
    );
    expect(s.candidates_total).toBe(11);   // 12 minus the known one; the terminated one never counted
  });
});

// ── end-to-end: a real terminated SPV becomes a cited retirement ─────────────

describe('the runner path a retirement would actually take', () => {
  const ctx = { lvIndex: fakeIndex([LIVE, DEAD]), registerAsOf: NOW };

  it('a terminated SPV produces a soft-retire carrying a resolvable citation', () => {
    const row = { id: 'fi-lv-dead-1', tier: 'public', country: 'LV', entity_name: 'SIA "Nokaltusi Energija"', is_legal_entity: true, status: 'announced' };
    const obs = observeRegistry(row as Any, ctx as Any);
    expect(obs.found).toBe(true);
    expect(obs.status).toBe('terminated');

    const ev = evaluateSignal(sig('registry_terminated'), row, obs, healthy);
    expect(ev.fired).toBe(true);
    expect(ev.action).toBe(ACTION.SOFT_RETIRE);

    const t = buildTransition(row, [ev], NOW)!;
    expect(t.type).toBe('retired');
    expect(t.removed_from_db).toBe(false);      // soft-retire, never delete
    expect(t.reversible).toBe(true);
    expect(t.evidence.length).toBeGreaterThan(0);
    expect(t.evidence.every((e: Any) => /^https?:\/\//.test(e.url))).toBe(true);
  });

  it('a live SPV produces nothing at all', () => {
    const row = { id: 'fi-lv-live-1', tier: 'public', country: 'LV', entity_name: 'SIA "Kanarėlės BESS"', is_legal_entity: true, status: 'announced' };
    const ev = evaluateSignal(sig('registry_terminated'), row, observeRegistry(row as Any, ctx as Any), healthy);
    expect(ev.fired).toBe(false);
    expect(buildTransition(row, [ev], NOW)).toBeNull();
  });

  it('an absence still carries a citation — the dataset searched, and when', () => {
    const row = { id: 'fi-lv-gone-1', tier: 'public', country: 'LV', entity_name: 'SIA "Nav Tāda"', is_legal_entity: true, status: 'announced' };
    const obs = observeRegistry(row as Any, ctx as Any);
    expect(obs.found).toBe(false);
    expect(obs.evidence[0].url).toMatch(/^https:\/\//);
    expect(obs.evidence[0].what_it_confirms).toMatch(/does not resolve/);
    const ev = evaluateSignal(sig('registry_absent'), row, obs, healthy);
    // absence FLAGS, it never retires
    expect(ev.action).toBe(ACTION.FLAG_REVIEW);
  });

  it('staleness ages from the row\'s own evidence stamp, not from a hardcoded label (rule #2)', () => {
    const o = observeStaleness({ last_seen_at: '2026-01-01T00:00:00Z' } as Any, { now: NOW } as Any);
    expect(o.probed).toBe(true);
    expect(o.months_since_evidence).toBeGreaterThan(6.5);
    expect(o.months_since_evidence).toBeLessThan(7.5);
  });
});

// ── eligibility accounting ───────────────────────────────────────────────────

describe('eligibility accounting is complete — every ineligible row has a reason', () => {
  it('rows_in_scope = rows_eligible + every counted reason (no row falls through)', () => {
    const ctx = { lvIndex: fakeIndex([LIVE, DEAD]), registerAsOf: NOW, rulesByid: { registry_terminated: sig('registry_terminated') } };
    const rows = [
      { id: '1', country: 'LV', entity_name: 'SIA "Kanarėlės BESS"', is_legal_entity: true },
      { id: '2', country: 'LV', entity_name: 'Aretis Group', is_legal_entity: false },
      { id: '3', country: 'LV', entity_name: null, is_legal_entity: false },
      { id: '4', country: 'LT', entity_name: 'UAB "X"', is_legal_entity: true },
    ];
    const e = eligibility('registry_terminated', rows as Any, ctx as Any);
    expect(e.rows_in_scope).toBe(3);      // LT filtered out by signal.countries
    expect(e.rows_eligible).toBe(1);
    const accounted = Object.values(e.why_ineligible).reduce((a: number, b: Any) => a + b, 0);
    expect(e.rows_eligible + accounted).toBe(e.rows_in_scope);
  });

  it('every signal in the rules file has an observer or is the discovery sweep', () => {
    for (const s of rules.signals as Any[]) {
      if (s.id === 'new_entity_unmatched') continue;
      expect(OBSERVERS[s.id], `${s.id} has no observation builder`).toBeTypeOf('function');
    }
  });

  it('checkDetectorHealth still refuses a source that went unreachable — stamp is not advanced', () => {
    // The runner keeps the PREVIOUS last_run_at when a source is unreachable, so the
    // detector ages into stale rather than presenting as a fresh, quiet run.
    const old = new Date(Date.parse(NOW) - 800 * 3600_000).toISOString();
    const h = checkDetectorHealth(sig('registry_terminated'), { last_run_at: old }, Date.parse(NOW));
    expect(h.status).toBe(DETECTOR.STALE);
  });
});
