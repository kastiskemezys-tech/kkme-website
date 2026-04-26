import { describe, it, expect } from 'vitest';
import {
  classifySkew,
  leftSkewFootnote,
  statsAreOrderedCorrectly,
  verifyConsistentAggregation,
} from '../distributionShape';

// Live worker /s1/capture rolling_30d snapshot 2026-04-26
const auditStats2h = {
  mean: 129.23,
  p25: 83.16,
  p50: 136.67,
  p75: 170.11,
  p90: 202.78,
  days: 30,
};
const auditValues2h = [
  14.67, 29.25, 35.93, 54.81, 73.02, 74.31, 77.01, 83.16, 102.55, 109.03,
  110.31, 113.7, 121.12, 123.7, 129.03, 136.67, 138.44, 141.35, 148.69, 149.5,
  150.42, 157.76, 170.11, 171.51, 172.75, 174.11, 196.48, 202.78, 243.55, 271.06,
];

describe('S1 distribution-shape investigation (7.6.13)', () => {
  it('audit case: mean 129 < median 137 → classified as left-skew', () => {
    expect(classifySkew(auditStats2h)).toBe('left');
  });

  it('right-skew case (typical arbitrage): mean > median', () => {
    expect(classifySkew({ mean: 150, p50: 130 })).toBe('right');
  });

  it('symmetric case: mean ≈ median (within 5%)', () => {
    expect(classifySkew({ mean: 100, p50: 102 })).toBe('symmetric');
  });

  it('returns unknown when mean or median missing', () => {
    expect(classifySkew({ mean: null, p50: 100 })).toBe('unknown');
    expect(classifySkew({ mean: 100, p50: null })).toBe('unknown');
    expect(classifySkew({ mean: 100, p50: 0 })).toBe('unknown');
  });

  it('leftSkewFootnote fires only when distribution is left-skewed', () => {
    const note = leftSkewFootnote(auditStats2h);
    expect(note).not.toBeNull();
    expect(note).toContain('Left-skew');
    expect(note).toContain('€129');
    expect(note).toContain('€137');
    expect(note).toContain('30D');
  });

  it('leftSkewFootnote returns null for right-skewed or symmetric', () => {
    expect(leftSkewFootnote({ mean: 150, p50: 130, days: 30 })).toBeNull();
    expect(leftSkewFootnote({ mean: 100, p50: 102, days: 30 })).toBeNull();
  });

  it('statsAreOrderedCorrectly: percentiles must monotonically increase', () => {
    expect(statsAreOrderedCorrectly(auditStats2h)).toBe(true);
    // Inverted p50/p75 = bug
    expect(statsAreOrderedCorrectly({ p25: 50, p50: 200, p75: 100 })).toBe(false);
  });

  it('verifyConsistentAggregation: live values reproduce live stats (regression for aggregation drift)', () => {
    // Confirms the worker computes mean and percentiles from the SAME
    // sorted array. If a future worker change accidentally uses a
    // different window for mean vs percentiles, this trips.
    expect(verifyConsistentAggregation(auditValues2h, auditStats2h)).toBe(true);
  });

  it('verifyConsistentAggregation: detects mismatch when stats lie about their sample', () => {
    expect(verifyConsistentAggregation(auditValues2h, { ...auditStats2h, mean: 999 })).toBe(false);
    expect(verifyConsistentAggregation(auditValues2h, { ...auditStats2h, p50: 999 })).toBe(false);
  });
});
