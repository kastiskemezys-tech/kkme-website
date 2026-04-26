import { describe, it, expect } from 'vitest';

// Phase 7.7b Session 1 — frozen v7 production fixtures.
//
// These specs assert the fixture's INTERNAL consistency, not against
// hardcoded numbers. The fixture itself is the snapshot of "current truth."
// When Session 2 (or later) ships the stack-allocator correction and
// regenerates fixtures (committed alongside as baseline-*-v8.json), the same
// spec runs against the new files and continues to pass — because the new
// fixture also satisfies the additive invariant, just with smaller
// gross_revenue_y1. The diff in the FIXTURE JSON is the audit trail, not the
// diff in this spec.
//
// See docs/audits/phase-7-7b/stack-audit.md for the verdict and migration plan.

import base2h          from '../../../docs/audits/phase-7-7b/baseline-base-2h.json';
import base4h          from '../../../docs/audits/phase-7-7b/baseline-base-4h.json';
import conservative2h  from '../../../docs/audits/phase-7-7b/baseline-conservative-2h.json';
import conservative4h  from '../../../docs/audits/phase-7-7b/baseline-conservative-4h.json';
import stress2h        from '../../../docs/audits/phase-7-7b/baseline-stress-2h.json';
import stress4h        from '../../../docs/audits/phase-7-7b/baseline-stress-4h.json';

type Fixture = {
  scenario: string;
  duration: number;
  model_version: string;
  capacity_y1: number;
  activation_y1: number;
  arbitrage_y1: number;
  gross_revenue_y1: number;
  capacity_pct: number;
  activation_pct: number;
  arbitrage_pct: number;
  project_irr: number | null;
  equity_irr: number | null;
  min_dscr: number | null;
  worst_month_dscr: number | null;
};

const ALL: Array<[string, Fixture]> = [
  ['base 2h',          base2h          as Fixture],
  ['base 4h',          base4h          as Fixture],
  ['conservative 2h',  conservative2h  as Fixture],
  ['conservative 4h',  conservative4h  as Fixture],
  ['stress 2h',        stress2h        as Fixture],
  ['stress 4h',        stress4h        as Fixture],
];

describe('Phase 7.7b production fixtures — frozen v7 reference', () => {
  describe.each(ALL)('%s', (label, fixture) => {
    it('captures model_version "v7" (the version the audit is anchored to)', () => {
      // Session 2 ships v8; when fixtures are regenerated they will report v8.
      // Updating this string is the only spec edit needed when v8 lands.
      expect(fixture.model_version).toBe('v7');
    });

    it('gross_revenue_y1 ≈ capacity_y1 + activation_y1 + arbitrage_y1 (additive invariant)', () => {
      const sum =
        fixture.capacity_y1 + fixture.activation_y1 + fixture.arbitrage_y1;
      // Worker invariant at line 1158 uses < 2 € tolerance; mirror it here.
      expect(Math.abs(sum - fixture.gross_revenue_y1)).toBeLessThan(2);
    });

    it('capacity:activation ratio ≈ 65:35 (heuristic split at worker line 1052–1053)', () => {
      const balTotal = fixture.capacity_y1 + fixture.activation_y1;
      const capRatio = fixture.capacity_y1 / balTotal;
      expect(capRatio).toBeCloseTo(0.65, 2);
    });

    it('component percentages sum to ~1.0', () => {
      const sumPct =
        fixture.capacity_pct + fixture.activation_pct + fixture.arbitrage_pct;
      expect(sumPct).toBeCloseTo(1.0, 1);
    });

    it('reported percentages match component ratios', () => {
      expect(fixture.capacity_pct)
        .toBeCloseTo(fixture.capacity_y1 / fixture.gross_revenue_y1, 1);
      expect(fixture.arbitrage_pct)
        .toBeCloseTo(fixture.arbitrage_y1 / fixture.gross_revenue_y1, 1);
    });

    it('project_irr is null (stress) or a sensible decimal in (-0.5, 0.5)', () => {
      // Stress fixtures null project_irr per known engine bug (prompt §0).
      if (fixture.project_irr === null) return;
      expect(fixture.project_irr).toBeGreaterThan(-0.5);
      expect(fixture.project_irr).toBeLessThan(0.5);
    });

    it('min_dscr is positive when present', () => {
      if (fixture.min_dscr === null) return;
      expect(fixture.min_dscr).toBeGreaterThan(0);
    });

    it('worst_month_dscr is positive when present', () => {
      if (fixture.worst_month_dscr === null) return;
      expect(fixture.worst_month_dscr).toBeGreaterThan(0);
    });
  });

  it('rev_bal (capacity + activation) is identical across 2h and 4h within a scenario', () => {
    // Confirms balancing revenue is computed per-MW with no duration dependency
    // — an architectural artefact of the additive-stacking approach (audit §3).
    expect(base2h.capacity_y1)         .toBe(base4h.capacity_y1);
    expect(base2h.activation_y1)       .toBe(base4h.activation_y1);
    expect(conservative2h.capacity_y1) .toBe(conservative4h.capacity_y1);
    expect(conservative2h.activation_y1).toBe(conservative4h.activation_y1);
    expect(stress2h.capacity_y1)       .toBe(stress4h.capacity_y1);
    expect(stress2h.activation_y1)     .toBe(stress4h.activation_y1);
  });

  it('arbitrage_y1 strictly increases with duration within a scenario', () => {
    // 4h asset stores 2× the energy of 2h → larger daily throughput → larger arb.
    expect(base4h.arbitrage_y1)        .toBeGreaterThan(base2h.arbitrage_y1);
    expect(conservative4h.arbitrage_y1).toBeGreaterThan(conservative2h.arbitrage_y1);
    expect(stress4h.arbitrage_y1)      .toBeGreaterThan(stress2h.arbitrage_y1);
  });

  it('gross_revenue_y1 scales monotonically: stress < conservative < base (within duration)', () => {
    expect(stress2h.gross_revenue_y1)      .toBeLessThan(conservative2h.gross_revenue_y1);
    expect(conservative2h.gross_revenue_y1).toBeLessThan(base2h.gross_revenue_y1);
    expect(stress4h.gross_revenue_y1)      .toBeLessThan(conservative4h.gross_revenue_y1);
    expect(conservative4h.gross_revenue_y1).toBeLessThan(base4h.gross_revenue_y1);
  });
});
