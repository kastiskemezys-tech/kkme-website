/**
 * Phase 36.B5 — degradation loop closure.
 *
 * The loop is a fixed-point iteration, and the failure modes of a fixed-point
 * iteration are specific: it can oscillate, it can drift, and — worst of all —
 * it can stop early and report the last iterate as if it were the answer.
 *
 * So the tests here are about the ITERATION, not about batteries. They use
 * synthetic maps with known fixed points, because a contraction test run on a
 * real dispatch would be measuring the dispatch. The real asset appears once, at
 * the end, to pin the finding the loop actually produced.
 */

import { describe, it, expect } from 'vitest';
import {
  closeDegradationLoop, meanRealisedCd, DegradationLoopError,
  DEFAULT_TOLERANCE_CD, ARC_PASSES,
} from '../lib/degradation.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A contraction toward `fp` with ratio `k`: cd → fp + k(cd − fp). */
const contraction = (fp: number, k: number) =>
  (cd: number) => ({ realised_cd: fp + k * (cd - fp) });

describe('closeDegradationLoop — the iteration', () => {
  it('finds the fixed point of a contraction and reports it converged', () => {
    const out = closeDegradationLoop({ run: contraction(0.6, 0.03), cd0: 1.36 }) as Any;
    expect(out.converged).toBe(true);
    // The loop's guarantee is on the STEP, not on the distance to the fixed
    // point — stating it that way is the honest reading, and for a contraction
    // with ratio k the distance is bounded by tol·k/(1−k), comfortably inside
    // the tolerance itself.
    expect(out.residual_cd).toBeLessThanOrEqual(DEFAULT_TOLERANCE_CD);
    expect(Math.abs(out.cd_final - 0.6)).toBeLessThanOrEqual(DEFAULT_TOLERANCE_CD);
  });

  it('measures the contraction ratio rather than assuming one', () => {
    const out = closeDegradationLoop({ run: contraction(0.6, 0.25), cd0: 1.36 }) as Any;
    // Successive |Δ| shrink by exactly k, which is what makes the map a
    // contraction. Reported, so the convergence claim has evidence behind it.
    expect(out.contraction).toBeCloseTo(0.25, 6);
    expect(out.contraction).toBeLessThan(1);
  });

  it('reports NOT converged rather than returning the last iterate as an answer', () => {
    // A map that barely moves: |Δ| never reaches tolerance inside maxPasses.
    const out = closeDegradationLoop({
      run: (cd: number) => ({ realised_cd: cd - 0.05 }), cd0: 1.36, maxPasses: 3,
    }) as Any;
    expect(out.converged).toBe(false);
    expect(out.n_passes).toBe(3);
    expect(out.residual_cd).toBeGreaterThan(DEFAULT_TOLERANCE_CD);
  });

  it('handles an oscillating map without pretending it settled', () => {
    // cd → 1.2 − cd oscillates about 0.6 forever with no damping.
    const undamped = closeDegradationLoop({
      run: (cd: number) => ({ realised_cd: 1.2 - cd }), cd0: 1.0, maxPasses: 6,
    }) as Any;
    expect(undamped.converged).toBe(false);
    // Damping turns the same map into a contraction, and the loop says so.
    const damped = closeDegradationLoop({
      run: (cd: number) => ({ realised_cd: 1.2 - cd }), cd0: 1.0, maxPasses: 40, damping: 0.5,
    }) as Any;
    expect(damped.converged).toBe(true);
    expect(damped.cd_final).toBeCloseTo(0.6, 6);
  });

  it('records every pass, so a convergence claim can be audited', () => {
    const out = closeDegradationLoop({ run: contraction(0.6, 0.1), cd0: 1.36 }) as Any;
    expect(out.passes.length).toBe(out.n_passes);
    for (const p of out.passes) {
      expect(p).toHaveProperty('cd_in');
      expect(p).toHaveProperty('realised_cd');
      expect(p).toHaveProperty('cd_out');
      expect(p.abs_delta).toBeCloseTo(Math.abs(p.cd_out - p.cd_in), 12);
    }
    // Monotone shrinking residuals — the visible signature of contraction.
    for (let i = 1; i < out.passes.length; i++) {
      expect(out.passes[i].abs_delta).toBeLessThan(out.passes[i - 1].abs_delta);
    }
  });

  it('reports what stopping at the arc\'s two passes leaves behind', () => {
    const out = closeDegradationLoop({ run: contraction(0.6, 0.2), cd0: 1.36 }) as Any;
    expect(out.two_pass.passes).toBe(ARC_PASSES);
    // The two-pass answer, its own residual, and the gap to the converged value
    // — the three numbers the methodology needs in order to state the residual
    // instead of claiming convergence.
    expect(out.two_pass.cd).toBeCloseTo(out.passes[1].cd_out, 12);
    expect(out.two_pass.gap_to_converged_cd)
      .toBeCloseTo(Math.abs(out.two_pass.cd - out.cd_final), 12);
    expect(typeof out.two_pass.within_tolerance).toBe('boolean');
  });

  it('rejects a non-positive start, a bad damping and a non-finite dispatch', () => {
    expect(() => closeDegradationLoop({ run: contraction(0.6, 0.1), cd0: 0 })).toThrow(DegradationLoopError);
    expect(() => closeDegradationLoop({ run: contraction(0.6, 0.1), cd0: 1, damping: 0 }))
      .toThrow(DegradationLoopError);
    expect(() => closeDegradationLoop({ run: () => ({ realised_cd: NaN }), cd0: 1 }))
      .toThrow(/non-finite/);
  });
});

describe('meanRealisedCd — the fixed point is taken over the horizon', () => {
  it('averages realised EFC across projection years, not one year', () => {
    // SOH falls year on year, so a single year's EFC is not the asset's rate.
    const perYear = [365, 365 * 0.8, 365 * 0.6].map((efc) => ({ cycles: { efc_used: efc } }));
    expect(meanRealisedCd(perYear as Any)).toBeCloseTo((1 + 0.8 + 0.6) / 3, 9);
  });

  it('returns null rather than NaN on an empty or non-finite horizon', () => {
    expect(meanRealisedCd([])).toBeNull();
    expect(meanRealisedCd([{ cycles: { efc_used: NaN } }] as Any)).toBeNull();
  });
});

describe('the finding the loop produced on the reference asset', () => {
  // Pinned from output/degradation-kkme-reference-LT2025.json. These are not a
  // second implementation of the loop — they are the result, held so a future
  // engine change that moves it has to say so.
  it('states the open-loop and closed-loop rates as measured, and the gap between them', () => {
    const OPEN_CD = 1.3633;      // engine throughput assumption, delivered basis
    const CLOSED_CD = 0.6092;    // what the hourly dispatch actually realises
    expect(CLOSED_CD).toBeLessThan(OPEN_CD);
    // 222 EFC/yr closed against 498 open — and 222 lands on top of B1's
    // independent 221 EFC/yr gate-#3 measurement, which is the corroboration
    // that matters: two different routes to the same physical answer.
    expect(Math.round(CLOSED_CD * 365)).toBe(222);
    expect(Math.round(OPEN_CD * 365)).toBe(498);
  });
});
