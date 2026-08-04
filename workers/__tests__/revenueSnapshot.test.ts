// Phase 51 — `revenue_snapshot_prev` gets a cron writer, and the deltas become
// a controlled comparison.
//
// This key backed the "what changed since yesterday" line on `/revenue`, the
// site's most important surface, and it was the ONLY key in the namespace with
// no cron writer. It was written by whichever public GET happened to be the
// first of the calendar day — **from that request's query parameters**.
//
// So the published delta differenced yesterday's first visitor's configuration
// against today's requester's configuration. Measured live on 2026-08-04,
// `project_irr` runs from −0.0121 (4h/high) to +0.2081 (2h/low/cod-2030): a
// 22-point spread. The day's observed delta of +0.02pp was correct only because
// both requests happened to use the default; a first visitor on 4h/high would
// have published roughly +16pp of pure configuration artefact as a day's change.
//
// Two rules come out of that and are pinned here:
//   · one canonical writer, at one canonical configuration (the cron);
//   · never difference across configurations, and say so rather than showing null.
import { describe, it, expect } from 'vitest';
import {
  REVENUE_SNAPSHOT_CONFIG, revenueConfigKey, revenueDeltaAdmissible, buildRevenueSnapshot,
} from '../fetch-s1.js';

const CFG = REVENUE_SNAPSHOT_CONFIG;
const other = { ...CFG, dur: '4h', capex: 'high' };
const snapAt = (config: Record<string, unknown>, extra = {}) => ({
  project_irr: 0.15, net_mw_yr: 112062, signal_inputs: { s1_capture: 100 },
  config, computed_at: '2026-08-03T08:00:00Z', ...extra,
});

describe('the canonical configuration', () => {
  it('is the route\'s own public defaults, so the journal describes the default page', () => {
    expect(CFG).toEqual({ dur: '2h', capex: 'mid', cod: 2028, scenario: 'base', mw: 50 });
  });

  it('has a stable identity that distinguishes every field', () => {
    for (const field of ['dur', 'capex', 'cod', 'scenario', 'mw'] as const) {
      const changed = { ...CFG, [field]: field === 'cod' || field === 'mw' ? 9999 : 'zzz' };
      expect(revenueConfigKey(changed), `${field} must affect the key`).not.toBe(revenueConfigKey(CFG));
    }
  });
});

describe('a delta is only admissible within one configuration', () => {
  it('admits a snapshot at the same configuration', () => {
    expect(revenueDeltaAdmissible(snapAt(CFG), CFG)).toEqual({ ok: true });
  });

  it('REFUSES a snapshot from a different configuration — the live artefact', () => {
    // This is the exact case that published ~16pp of configuration difference
    // as a day-on-day change.
    const r = revenueDeltaAdmissible(snapAt(other), CFG);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/different configuration/);
  });

  it('refuses a pre-Phase-51 snapshot that records no configuration', () => {
    // Absence must not be read as agreement. A snapshot with no `config` cannot
    // be shown to be comparable, and assuming it is comparable is precisely the
    // bug (B12: absence of provenance is an error state, never an innocent one).
    const legacy = snapAt(undefined as never);
    delete (legacy as Record<string, unknown>).config;
    const r = revenueDeltaAdmissible(legacy, CFG);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/predates configuration recording/);
  });

  it('refuses when there is no snapshot at all', () => {
    expect(revenueDeltaAdmissible(null, CFG).ok).toBe(false);
    expect(revenueDeltaAdmissible({}, CFG).ok).toBe(false);
  });

  it('every refusal carries a reason', () => {
    for (const prev of [null, {}, snapAt(other)]) {
      const r = revenueDeltaAdmissible(prev, CFG);
      if (!r.ok) expect(r.reason, JSON.stringify(prev)).toBeTruthy();
    }
  });
});

describe('the snapshot records what it describes', () => {
  it('carries the configuration it was computed at', () => {
    const snap = buildRevenueSnapshot(
      { project_irr: 0.15, net_mw_yr: 112062 }, { s1_capture: 100 }, CFG, '2026-08-04T08:00:00Z',
    );
    expect(snap.config).toEqual(CFG);
    expect(snap.computed_at).toBe('2026-08-04T08:00:00Z');
    expect(snap.project_irr).toBe(0.15);
    expect(snap.signal_inputs).toEqual({ s1_capture: 100 });
  });

  it('a snapshot it builds is admissible against its own configuration', () => {
    // Round-trip: the writer and the reader must agree, or the cron would write
    // journal entries the route then refuses to use.
    const snap = buildRevenueSnapshot({ project_irr: 0.1, net_mw_yr: 1 }, {}, CFG, '2026-08-04T08:00:00Z');
    expect(revenueDeltaAdmissible(snap, CFG)).toEqual({ ok: true });
  });
});
