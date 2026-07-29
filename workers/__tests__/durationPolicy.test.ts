/**
 * Phase 36.B5 — the duration-anchor interpolation policy.
 *
 * The engine is calibrated at exactly two durations. Before this policy, twelve
 * sites switched anchors at `dur_h <= 2` and `rteCurveFor` switched at
 * `dur_h >= 3`, so an asset between 2h and 3h ran a 2h round-trip efficiency
 * against 4h day-ahead throughput — two calibrations inside one run.
 *
 * The visible consequence was a **step**: at dur_h 2.00 → 2.01 the reference
 * asset's Y1 gross jumped €519 759 (+6.5 %) and its project IRR ROSE 2.25 pp.
 * Adding 0.01 h of storage cannot make a project more profitable; it costs
 * capex and earns almost nothing extra. A second, smaller step sat at 3.00.
 *
 * These tests hold three things:
 *   ON-ANCHOR IDENTITY  2h and 4h return the shipped constants untouched, which
 *                       is what keeps /revenue byte-identical.
 *   CONTINUITY          no step anywhere in 1h-8h, at any resolution.
 *   SENSIBLE DIRECTION  IRR falls with duration across the whole sweep, and the
 *                       flat regions outside the calibration stay flat.
 */

import { describe, it, expect } from 'vitest';
import {
  durAnchorWeight, durBlend, rteBolFor, RTE_BOL,
  computeRevenueV7, REVENUE_SCENARIOS_FOR_TEST, computeThroughputBreakdown,
} from '../fetch-s1.js';
import { loadFixtureKV } from '../../tools/consultancy/regression-reference.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const kv = loadFixtureKV();
const sc = REVENUE_SCENARIOS_FOR_TEST.base as Any;

const run = (dur_h: number) => computeRevenueV7(
  { mw: 50, dur_h, capex_kwh: 164, cod_year: 2028, scenario: 'base', grant_pct: 0 }, kv) as Any;

/** 1h → 8h at quarter-hour resolution: 29 points spanning both flat regions. */
const SWEEP = Array.from({ length: 29 }, (_, i) => 1 + i * 0.25);

describe('durAnchorWeight / durBlend — the policy itself', () => {
  it('is 0 at and below 2h, 1 at and above 4h, linear between', () => {
    expect(durAnchorWeight(1)).toBe(0);
    expect(durAnchorWeight(2)).toBe(0);
    expect(durAnchorWeight(2.5)).toBeCloseTo(0.25, 12);
    expect(durAnchorWeight(3)).toBeCloseTo(0.5, 12);
    expect(durAnchorWeight(4)).toBe(1);
    expect(durAnchorWeight(8)).toBe(1);
  });

  it('returns the anchor object identically — no float arithmetic on an anchor', () => {
    // This is what makes /revenue byte-identical: at 2h and 4h the policy is a
    // pass-through, not a computation that happens to round back.
    expect(durBlend(2, 0.1 + 0.2, 99)).toBe(0.1 + 0.2);
    expect(durBlend(4, 99, 0.1 + 0.2)).toBe(0.1 + 0.2);
    expect(rteBolFor(2)).toBe(RTE_BOL.h2);
    expect(rteBolFor(4)).toBe(RTE_BOL.h4);
    expect(rteBolFor(1)).toBe(RTE_BOL.h2);
    expect(rteBolFor(8)).toBe(RTE_BOL.h4);
  });

  it('never mixes anchors — every quantity moves on the same weight', () => {
    for (const d of SWEEP) {
      const w = durAnchorWeight(d);
      expect(rteBolFor(d)).toBeCloseTo(RTE_BOL.h2 + w * (RTE_BOL.h4 - RTE_BOL.h2), 12);
      expect(computeThroughputBreakdown(1, d, sc).da_mwh).toBeCloseTo(
        sc.mwh_per_mw_yr_da_2h + w * (sc.mwh_per_mw_yr_da_4h - sc.mwh_per_mw_yr_da_2h), 9);
    }
  });

  it('tolerates a missing anchor and a non-finite duration rather than producing NaN', () => {
    expect(durBlend(3, null, 7)).toBe(7);
    expect(durBlend(3, 5, null)).toBe(5);
    expect(rteBolFor(undefined as unknown as number)).toBe(RTE_BOL.h4); // the engine default
    expect(rteBolFor(NaN)).toBe(RTE_BOL.h4);
  });
});

describe('the engine is continuous in dur_h from 1h to 8h', () => {
  const results = SWEEP.map((d) => ({ d, r: run(d) }));

  it('has no step in Y1 gross — the 2.00 → 2.01 jump is gone', () => {
    // Before the policy this pair differed by €519 759 on a 0.01 h change.
    const a = run(2.00), b = run(2.01);
    expect(Math.abs(b.gross_revenue_y1 - a.gross_revenue_y1)).toBeLessThan(5_000);
    // And the old second boundary at exactly 3h.
    const c = run(2.99), e = run(3.01);
    expect(Math.abs(e.gross_revenue_y1 - c.gross_revenue_y1)).toBeLessThan(10_000);
  });

  it('moves smoothly across the whole sweep — no jump exceeds the local trend', () => {
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1], cur = results[i];
      const rel = Math.abs(cur.r.gross_revenue_y1 - prev.r.gross_revenue_y1)
        / prev.r.gross_revenue_y1;
      // A quarter-hour of duration inside the calibration band moves gross by
      // ~1 %; outside it moves nothing. 2 % is a generous ceiling that a 6.5 %
      // step could never slip under.
      expect(rel, `${prev.d}h → ${cur.d}h`).toBeLessThan(0.02);
    }
  });

  it('is flat outside the calibration — a documented clamp, not an extrapolation', () => {
    const belowGross = [1, 1.25, 1.5, 1.75, 2].map((d) => run(d).gross_revenue_y1);
    const aboveGross = [4, 5, 6, 7, 8].map((d) => run(d).gross_revenue_y1);
    for (const g of belowGross) expect(g).toBe(belowGross[0]);
    for (const g of aboveGross) expect(g).toBe(aboveGross[0]);
  });
});

describe('the engine is sensible in dur_h', () => {
  const results = SWEEP.map((d) => ({ d, r: run(d) }));

  it('IRR falls monotonically with duration — more capex, no more revenue', () => {
    // The old model had TWO points where IRR ROSE with duration (2.00 → 2.01 and
    // 2.99 → 3.00), which is the signature of a mixed-anchor branch.
    for (let i = 1; i < results.length; i++) {
      expect(results[i].r.project_irr, `${results[i - 1].d}h → ${results[i].d}h`)
        .toBeLessThan(results[i - 1].r.project_irr);
    }
  });

  it('cycling intensity falls monotonically with duration — the same MWh over more MWh of cell', () => {
    for (let i = 1; i < results.length; i++) {
      const a = results[i - 1].r.assumptions_panel.cycles_breakdown.total_efcs_yr;
      const b = results[i].r.assumptions_panel.cycles_breakdown.total_efcs_yr;
      expect(b, `${results[i - 1].d}h → ${results[i].d}h`).toBeLessThan(a);
    }
  });

  it('LCOS rises monotonically with duration', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].r.lcos_eur_mwh, `${results[i].d}h`)
        .toBeGreaterThan(results[i - 1].r.lcos_eur_mwh);
    }
  });

  it('gross revenue is non-decreasing — duration buys throughput, never loses it', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].r.gross_revenue_y1)
        .toBeGreaterThanOrEqual(results[i - 1].r.gross_revenue_y1);
    }
  });
});

describe('on-anchor byte-identity — the reason /revenue does not move', () => {
  it('2h and 4h reproduce the shipped anchors field for field', () => {
    // The public route serves dur=2h and dur=4h only. Both are on-anchor, so the
    // policy is a pass-through and the 54/54 regression gate stays green — this
    // asserts the mechanism, the gate asserts the outcome.
    for (const d of [2, 4]) {
      const r = run(d);
      expect(r.assumptions_panel.rte.value)
        .toBeCloseTo((d === 2 ? RTE_BOL.h2 : RTE_BOL.h4) * 100, 6);
      expect(computeThroughputBreakdown(1, d, sc).da_mwh)
        .toBe(d === 2 ? sc.mwh_per_mw_yr_da_2h : sc.mwh_per_mw_yr_da_4h);
    }
  });
});
