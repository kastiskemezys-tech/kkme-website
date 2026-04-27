import { describe, it, expect } from 'vitest';

// Phase 7.7b — production fixture invariants across vintages.
//
// These specs assert the fixture's INTERNAL consistency, not hardcoded numbers.
// The fixture IS the snapshot of "current truth." When future sessions ship
// engine refinements that regenerate fixtures (e.g. v7.1, v7.2, v8), the same
// spec runs against new files and continues to pass — because the new fixtures
// also satisfy the additive invariant, just with shifted absolute values. The
// diff in the FIXTURE JSON is the audit trail, not the diff in this spec.
//
// Coverage:
//   - v7  baseline-*.json (Session 1 frozen v7)
//   - v7.1 baseline-*-v7-1.json (Session 3 post-deploy)
//   - v7-final baseline-*-v7-final.json (Session 3 pre-deploy v7 freeze;
//     same shape as v7 fixtures, omitted to avoid pure duplication)

// v7 fixtures (Session 1)
import base2h          from '../../../docs/audits/phase-7-7b/baseline-base-2h.json';
import base4h          from '../../../docs/audits/phase-7-7b/baseline-base-4h.json';
import conservative2h  from '../../../docs/audits/phase-7-7b/baseline-conservative-2h.json';
import conservative4h  from '../../../docs/audits/phase-7-7b/baseline-conservative-4h.json';
import stress2h        from '../../../docs/audits/phase-7-7b/baseline-stress-2h.json';
import stress4h        from '../../../docs/audits/phase-7-7b/baseline-stress-4h.json';

// v7.1 fixtures (Session 3)
import base2hV71          from '../../../docs/audits/phase-7-7b/baseline-base-2h-v7-1.json';
import base4hV71          from '../../../docs/audits/phase-7-7b/baseline-base-4h-v7-1.json';
import conservative2hV71  from '../../../docs/audits/phase-7-7b/baseline-conservative-2h-v7-1.json';
import conservative4hV71  from '../../../docs/audits/phase-7-7b/baseline-conservative-4h-v7-1.json';
import stress2hV71        from '../../../docs/audits/phase-7-7b/baseline-stress-2h-v7-1.json';
import stress4hV71        from '../../../docs/audits/phase-7-7b/baseline-stress-4h-v7-1.json';

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

const V7: Array<[string, Fixture]> = [
  ['base 2h',          base2h          as Fixture],
  ['base 4h',          base4h          as Fixture],
  ['conservative 2h',  conservative2h  as Fixture],
  ['conservative 4h',  conservative4h  as Fixture],
  ['stress 2h',        stress2h        as Fixture],
  ['stress 4h',        stress4h        as Fixture],
];

const V71: Array<[string, Fixture]> = [
  ['base 2h',          base2hV71          as Fixture],
  ['base 4h',          base4hV71          as Fixture],
  ['conservative 2h',  conservative2hV71  as Fixture],
  ['conservative 4h',  conservative4hV71  as Fixture],
  ['stress 2h',        stress2hV71        as Fixture],
  ['stress 4h',        stress4hV71        as Fixture],
];

const ALL = V7;  // Default suite below targets v7; the v7.1 suite is at the bottom.

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

// ──────────────────────────────────────────────────────────────────────
// v7.1 vintage — same invariants apply post-refinement
// ──────────────────────────────────────────────────────────────────────

describe('Phase 7.7b production fixtures — v7.1 (Session 3 refinements)', () => {
  describe.each(V71)('%s', (label, fixture) => {
    it('reports model_version "v7.1"', () => {
      expect(fixture.model_version).toBe('v7.1');
    });

    it('gross_revenue_y1 ≈ capacity_y1 + activation_y1 + arbitrage_y1 (additive invariant holds)', () => {
      const sum = fixture.capacity_y1 + fixture.activation_y1 + fixture.arbitrage_y1;
      expect(Math.abs(sum - fixture.gross_revenue_y1)).toBeLessThan(2);
    });

    it('capacity:activation ratio still ≈ 65:35 (heuristic split unchanged in v7.1)', () => {
      const balTotal = fixture.capacity_y1 + fixture.activation_y1;
      expect(fixture.capacity_y1 / balTotal).toBeCloseTo(0.65, 2);
    });

    it('component percentages sum to ~1.0', () => {
      const sumPct =
        fixture.capacity_pct + fixture.activation_pct + fixture.arbitrage_pct;
      expect(sumPct).toBeCloseTo(1.0, 1);
    });

    it('project_irr is null (stress) or sensible decimal in (-0.5, 0.5)', () => {
      if (fixture.project_irr === null) return;
      expect(fixture.project_irr).toBeGreaterThan(-0.5);
      expect(fixture.project_irr).toBeLessThan(0.5);
    });
  });

  it('rev_bal still identical across 2h and 4h within scenario (per-MW formula unchanged)', () => {
    expect(base2hV71.capacity_y1)         .toBe(base4hV71.capacity_y1);
    expect(base2hV71.activation_y1)       .toBe(base4hV71.activation_y1);
    expect(conservative2hV71.capacity_y1) .toBe(conservative4hV71.capacity_y1);
    expect(conservative2hV71.activation_y1).toBe(conservative4hV71.activation_y1);
    expect(stress2hV71.capacity_y1)       .toBe(stress4hV71.capacity_y1);
    expect(stress2hV71.activation_y1)     .toBe(stress4hV71.activation_y1);
  });

  it('gross_revenue_y1 scales monotonically: stress < conservative < base (within duration)', () => {
    expect(stress2hV71.gross_revenue_y1)      .toBeLessThan(conservative2hV71.gross_revenue_y1);
    expect(conservative2hV71.gross_revenue_y1).toBeLessThan(base2hV71.gross_revenue_y1);
    expect(stress4hV71.gross_revenue_y1)      .toBeLessThan(conservative4hV71.gross_revenue_y1);
    expect(conservative4hV71.gross_revenue_y1).toBeLessThan(base4hV71.gross_revenue_y1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Cross-vintage delta sanity (v7 → v7.1)
// ──────────────────────────────────────────────────────────────────────

describe('Phase 7.7b — v7 → v7.1 delta sanity', () => {
  // Pairs of (v7, v7.1) fixtures by scenario × duration
  const pairs: Array<[string, Fixture, Fixture]> = [
    ['base 2h',         base2h         as Fixture, base2hV71         as Fixture],
    ['base 4h',         base4h         as Fixture, base4hV71         as Fixture],
    ['conservative 2h', conservative2h as Fixture, conservative2hV71 as Fixture],
    ['conservative 4h', conservative4h as Fixture, conservative4hV71 as Fixture],
    ['stress 2h',       stress2h       as Fixture, stress2hV71       as Fixture],
    ['stress 4h',       stress4h       as Fixture, stress4hV71       as Fixture],
  ];

  it.each(pairs)('%s: gross_y1 v7→v7.1 within ±10% (refinements are localized, not structural)', (_label, v7f, v71f) => {
    const ratio = v71f.gross_revenue_y1 / v7f.gross_revenue_y1;
    expect(ratio).toBeGreaterThan(0.90);
    expect(ratio).toBeLessThan(1.10);
  });

  it.each(pairs)('%s: project_irr v7→v7.1 within ±5pp (or both null in stress)', (_label, v7f, v71f) => {
    if (v7f.project_irr === null || v71f.project_irr === null) {
      // stress fixtures null IRR per known engine bug — both vintages should agree on null-ness
      expect(v7f.project_irr).toBeNull();
      expect(v71f.project_irr).toBeNull();
      return;
    }
    const deltaPp = (v71f.project_irr - v7f.project_irr) * 100;
    expect(Math.abs(deltaPp)).toBeLessThan(5);
  });
});
