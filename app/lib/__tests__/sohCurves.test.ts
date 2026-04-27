import { describe, it, expect } from 'vitest';
import {
  SOH_CURVE_1CD,
  SOH_CURVE_15CD,
  SOH_CURVE_2CD,
  sohYr,
  rteCurveFor,
  RTE_BOL,
  RTE_DECAY_PP_PER_YEAR,
} from '../sohCurves';

describe('SOH_CURVE_2CD — anchored on 2 c/d empirical median', () => {
  it('Y0 = 100%', () => {
    expect(SOH_CURVE_2CD[0]).toBe(1.000);
  });

  it('Y5 within ±2pp of 81%', () => {
    expect(SOH_CURVE_2CD[5]).toBeGreaterThanOrEqual(0.79);
    expect(SOH_CURVE_2CD[5]).toBeLessThanOrEqual(0.83);
  });

  it('Y10 within ±2pp of 70.5%', () => {
    expect(SOH_CURVE_2CD[10]).toBeGreaterThanOrEqual(0.685);
    expect(SOH_CURVE_2CD[10]).toBeLessThanOrEqual(0.725);
  });

  it('monotonically decreasing', () => {
    for (let t = 1; t < SOH_CURVE_2CD.length; t++) {
      expect(SOH_CURVE_2CD[t]).toBeLessThan(SOH_CURVE_2CD[t - 1]);
    }
  });

  it('convex-down (rate-of-fade decreases with time)', () => {
    const d1  = SOH_CURVE_2CD[1] - SOH_CURVE_2CD[0];
    const d10 = SOH_CURVE_2CD[11] - SOH_CURVE_2CD[10];
    expect(Math.abs(d1)).toBeGreaterThan(Math.abs(d10));
  });
});

describe('SOH_CURVE_1CD — gentler than 2CD at all years', () => {
  it('Y5 within ±2pp of 85.5%', () => {
    expect(SOH_CURVE_1CD[5]).toBeGreaterThanOrEqual(0.835);
    expect(SOH_CURVE_1CD[5]).toBeLessThanOrEqual(0.875);
  });

  it('always above SOH_CURVE_2CD', () => {
    for (let t = 1; t < SOH_CURVE_1CD.length; t++) {
      expect(SOH_CURVE_1CD[t]).toBeGreaterThan(SOH_CURVE_2CD[t]);
    }
  });

  it('Y10 within ±2pp of curve value (~74.5%)', () => {
    // Curve table value; sits within the empirical 1 c/d anchor range.
    expect(SOH_CURVE_1CD[10]).toBeGreaterThanOrEqual(0.725);
    expect(SOH_CURVE_1CD[10]).toBeLessThanOrEqual(0.765);
  });
});

describe('SOH_CURVE_15CD — between 1CD and 2CD at every year', () => {
  it('Y0 = 100%', () => {
    expect(SOH_CURVE_15CD[0]).toBe(1.000);
  });

  it('always between SOH_CURVE_1CD and SOH_CURVE_2CD', () => {
    for (let t = 1; t < SOH_CURVE_15CD.length; t++) {
      expect(SOH_CURVE_15CD[t]).toBeLessThan(SOH_CURVE_1CD[t]);
      expect(SOH_CURVE_15CD[t]).toBeGreaterThan(SOH_CURVE_2CD[t]);
    }
  });

  it('Y10 within ±2pp of curve value (~72%)', () => {
    expect(SOH_CURVE_15CD[10]).toBeGreaterThanOrEqual(0.700);
    expect(SOH_CURVE_15CD[10]).toBeLessThanOrEqual(0.740);
  });
});

describe('sohYr(t, cd_total) interpolation', () => {
  it('returns SOH_CURVE_1CD at exactly 1.0 c/d', () => {
    expect(sohYr(5, 1.0)).toBeCloseTo(SOH_CURVE_1CD[5], 5);
  });

  it('returns SOH_CURVE_15CD at exactly 1.5 c/d', () => {
    expect(sohYr(5, 1.5)).toBeCloseTo(SOH_CURVE_15CD[5], 5);
  });

  it('returns SOH_CURVE_2CD at exactly 2.0 c/d', () => {
    expect(sohYr(5, 2.0)).toBeCloseTo(SOH_CURVE_2CD[5], 5);
  });

  it('interpolates linearly between anchors', () => {
    const lo = SOH_CURVE_1CD[5];
    const hi = SOH_CURVE_15CD[5];
    expect(sohYr(5, 1.25)).toBeCloseTo((lo + hi) / 2, 3);
  });

  it('extrapolates above 2 c/d (cell ages faster)', () => {
    expect(sohYr(5, 2.5)).toBeLessThan(SOH_CURVE_2CD[5]);
  });

  it('clamps below 1 c/d', () => {
    expect(sohYr(5, 0.5)).toBeCloseTo(SOH_CURVE_1CD[5], 5);
  });

  it('floors at 0.40 (no negative SOH on aggressive extrapolation)', () => {
    expect(sohYr(17, 5.0)).toBeGreaterThanOrEqual(0.40);
  });

  it('Y0 returns 1.0 at any cycling rate (BOL)', () => {
    expect(sohYr(0, 1.0)).toBe(1.000);
    expect(sohYr(0, 1.5)).toBe(1.000);
    expect(sohYr(0, 2.0)).toBe(1.000);
  });

  it('SOH at Y10 for base 2h dispatch (~1.31 c/d) lands in [0.55, 0.85]', () => {
    const v = sohYr(10, 1.31);
    expect(v).toBeGreaterThanOrEqual(0.55);
    expect(v).toBeLessThanOrEqual(0.85);
  });
});

describe('rteCurveFor — year-indexed RTE decay', () => {
  it('2h BOL = 0.85', () => {
    expect(rteCurveFor(2)[0]).toBeCloseTo(RTE_BOL.h2, 5);
  });

  it('4h BOL = 0.86', () => {
    expect(rteCurveFor(4)[0]).toBeCloseTo(RTE_BOL.h4, 5);
  });

  it('decays 0.20pp/yr', () => {
    const c = rteCurveFor(2);
    const drop = c[0] - c[1];
    expect(drop).toBeCloseTo(RTE_DECAY_PP_PER_YEAR, 5);
  });

  it('floors at -4pp from BOL', () => {
    const c = rteCurveFor(2);
    const last = c[c.length - 1];
    expect(last).toBeGreaterThanOrEqual(RTE_BOL.h2 - 0.04 - 1e-6);
  });

  it('default lifetime is 18 years', () => {
    expect(rteCurveFor(2).length).toBe(18);
  });

  it('returns h4 BOL for dur_h ≥ 3', () => {
    expect(rteCurveFor(3)[0]).toBeCloseTo(RTE_BOL.h4, 5);
    expect(rteCurveFor(4)[0]).toBeCloseTo(RTE_BOL.h4, 5);
  });

  it('returns h2 BOL for dur_h ≤ 2', () => {
    expect(rteCurveFor(2)[0]).toBeCloseTo(RTE_BOL.h2, 5);
    expect(rteCurveFor(1)[0]).toBeCloseTo(RTE_BOL.h2, 5);
  });
});
