import { describe, it, expect } from 'vitest';
import {
  projectCannibalizationCurve,
  cannibalizationAxisRange,
  isMonotonicallyCompressing,
  TODAYS_MARKET_REFERENCE,
} from '../cannibalization';

// Phase 7.7a (7.7.13) — cannibalization curve from fleet_trajectory.

const FIXTURE = [
  { year: 2026, sd_ratio: 1.81, phase: 'MATURE', cpi: 0.34 },
  { year: 2027, sd_ratio: 1.96, phase: 'MATURE', cpi: 0.32 },
  { year: 2028, sd_ratio: 2.11, phase: 'MATURE', cpi: 0.31 },
  { year: 2029, sd_ratio: 2.26, phase: 'MATURE', cpi: 0.30 },
  { year: 2030, sd_ratio: 2.41, phase: 'MATURE', cpi: 0.30 },
  { year: 2031, sd_ratio: 2.56, phase: 'MATURE', cpi: 0.30 },
];

describe('projectCannibalizationCurve — extract cpi from fleet_trajectory', () => {
  it('maps year+cpi → CannibalizationPoint', () => {
    const pts = projectCannibalizationCurve(FIXTURE);
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ year: 2026, cpi: 0.34 });
    expect(pts[5]).toEqual({ year: 2031, cpi: 0.30 });
  });

  it('drops rows missing year or cpi', () => {
    const pts = projectCannibalizationCurve([
      { year: 2026, cpi: 0.34 },
      { year: 2027 } as any,                          // missing cpi
      { cpi: 0.30 } as any,                           // missing year
      { year: 2029, cpi: 0.28 },
    ]);
    expect(pts.map(p => p.year)).toEqual([2026, 2029]);
  });

  it('drops non-finite cpi values', () => {
    const pts = projectCannibalizationCurve([
      { year: 2026, cpi: NaN },
      { year: 2027, cpi: Infinity },
      { year: 2028, cpi: 0.34 },
    ]);
    expect(pts).toEqual([{ year: 2028, cpi: 0.34 }]);
  });

  it('preserves chronological order from input', () => {
    const pts = projectCannibalizationCurve(FIXTURE);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].year).toBeGreaterThan(pts[i - 1].year);
    }
  });
});

describe('cannibalizationAxisRange — chart bounds', () => {
  it('always includes the 1.0 reference line', () => {
    const pts = projectCannibalizationCurve(FIXTURE);
    const { min, max } = cannibalizationAxisRange(pts);
    expect(min).toBeLessThanOrEqual(TODAYS_MARKET_REFERENCE);
    expect(max).toBeGreaterThanOrEqual(TODAYS_MARKET_REFERENCE);
  });

  it('clamps min at 0', () => {
    const { min } = cannibalizationAxisRange([{ year: 2030, cpi: 0.05 }]);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it('falls back to a sensible default for empty input', () => {
    const { min, max } = cannibalizationAxisRange([]);
    expect(min).toBeLessThan(max);
    expect(max).toBeGreaterThanOrEqual(TODAYS_MARKET_REFERENCE);
  });
});

describe('isMonotonicallyCompressing — curve direction sanity', () => {
  it('returns true for the worker fixture (cpi non-increasing)', () => {
    const pts = projectCannibalizationCurve(FIXTURE);
    expect(isMonotonicallyCompressing(pts)).toBe(true);
  });

  it('returns false if any year shows cpi increase', () => {
    expect(isMonotonicallyCompressing([
      { year: 2026, cpi: 0.30 },
      { year: 2027, cpi: 0.35 },  // upward zigzag
    ])).toBe(false);
  });

  it('vacuously true on empty / single-point input', () => {
    expect(isMonotonicallyCompressing([])).toBe(true);
    expect(isMonotonicallyCompressing([{ year: 2026, cpi: 0.30 }])).toBe(true);
  });
});

describe('TODAYS_MARKET_REFERENCE — the cpi=1.0 line', () => {
  it('is exactly 1.0 (today\'s market is the reference)', () => {
    expect(TODAYS_MARKET_REFERENCE).toBe(1.0);
  });
});
