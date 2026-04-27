import { describe, it, expect } from 'vitest';
import { computeCycles } from '../throughputCycles';
import { sohYr, rteCurveFor } from '../sohCurves';

// Phase 7.7d v7.3 — directional impact specs.
//
// These specs assert the v7.3 movement *vs the throughput-derived constants*
// directly (pure functions in app/lib/throughputCycles + sohCurves), not the
// worker payload — that surface is exercised separately by the synthetic-KV
// probe (scripts/audit-stack.mjs --probe-v73). The point of these specs is to
// pin the directional behavior in code so future calibration drifts don't
// silently invert the relationships.

describe('v7.3 directional impact', () => {
  it('total EFCs/yr derived from throughput (not asserted as cycles_2h × 365)', () => {
    // v7.2 reported cycles_per_year as scenario.cycles_2h × 365 = 547 EFCs/yr
    // for base 2h. v7.3 derives from MWh throughput → independent of that
    // scenario constant. Confirms the source-of-truth flipped.
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    // The v7.2 number was 547. The v7.3 derived value lands close to the
    // reported number but is now defensible from per-product throughput.
    expect(r.total_efcs_yr).toBeGreaterThan(350);
    expect(r.total_efcs_yr).toBeLessThan(700);
  });

  it('SOH at Y10 base/2h drops sharply from v7.2 (90%) to ~70-75%', () => {
    // v7.2 SOH_CURVE_W[9] = 0.90 (flat across all dispatch intensities).
    // v7.3 interpolated by ~1.3 c/d throughput-derived → ~0.72-0.74.
    const cycles = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const soh10 = sohYr(10, cycles.total_cd);
    expect(soh10).toBeLessThan(0.85);
    expect(soh10).toBeGreaterThan(0.55);
  });

  it('SOH at Y10 4h gentler than 2h (lower c/d → less aging)', () => {
    const c2h = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const c4h = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    const s2h = sohYr(10, c2h.total_cd);
    const s4h = sohYr(10, c4h.total_cd);
    expect(s4h).toBeGreaterThan(s2h);
  });

  it('warranty_status = within for all base/conservative scenarios', () => {
    for (const scenario of ['base', 'conservative'] as const) {
      for (const dur_h of [2, 4]) {
        const r = computeCycles({ MW: 1, dur_h, scenario });
        expect(r.warranty_status, `${scenario}/${dur_h}h`).toBe('within');
      }
    }
  });

  it('RTE decays 0.20pp/yr from BOL — Y0 → Y10 drops 2.0pp', () => {
    const c = rteCurveFor(2);
    expect(c[0] - c[10]).toBeCloseTo(0.020, 4);
  });

  it('RTE 4h BOL > 2h BOL (lower C-rate stress on PCS)', () => {
    expect(rteCurveFor(4)[0]).toBeGreaterThan(rteCurveFor(2)[0]);
  });

  it('RTE floor at -4pp prevents infinite decay', () => {
    const c = rteCurveFor(2, 50);  // 50-year horizon to hit floor
    const minVal = Math.min(...c);
    expect(minVal).toBeGreaterThanOrEqual(0.85 - 0.04 - 1e-6);
  });

  it('total_cd for stress 2h is below base 2h (less aggressive cycling)', () => {
    const base = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const stress = computeCycles({ MW: 1, dur_h: 2, scenario: 'stress' });
    expect(stress.total_cd).toBeLessThan(base.total_cd);
  });

  it('SOH @ Y10 for stress 2h gentler than base 2h (less cycling = less aging)', () => {
    const base = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const stress = computeCycles({ MW: 1, dur_h: 2, scenario: 'stress' });
    const sBase = sohYr(10, base.total_cd);
    const sStress = sohYr(10, stress.total_cd);
    expect(sStress).toBeGreaterThanOrEqual(sBase);
  });
});
