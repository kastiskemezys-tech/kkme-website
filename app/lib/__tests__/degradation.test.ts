import { describe, it, expect } from 'vitest';
import {
  projectDegradationCurve,
  degradationAxisRange,
  isYearOneFresh,
  AUGMENTATION_THRESHOLD,
  END_OF_LIFE_THRESHOLD,
} from '../degradation';

// Phase 7.7a (7.7.6) — degradation curve from years[].retention.

const FIXTURE = [
  { yr: 1,  retention: 0.97 },
  { yr: 2,  retention: 0.94 },
  { yr: 5,  retention: 0.88 },
  { yr: 10, retention: 0.78 },
  { yr: 15, retention: 0.72 },
  { yr: 20, retention: 0.68 },
];

describe('projectDegradationCurve — extract retention from years[]', () => {
  it('maps yr+retention → DegradationPoint', () => {
    const pts = projectDegradationCurve(FIXTURE);
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ year: 1, retention: 0.97 });
    expect(pts[5]).toEqual({ year: 20, retention: 0.68 });
  });

  it('drops rows missing yr or retention', () => {
    const pts = projectDegradationCurve([
      { yr: 1, retention: 0.95 },
      { yr: 2 },                   // missing retention
      { retention: 0.85 } as any,  // missing yr
      { yr: 4, retention: 0.82 },
      { yr: 5, retention: null },  // null retention
    ]);
    expect(pts.map(p => p.year)).toEqual([1, 4]);
  });

  it('drops non-finite retention values', () => {
    const pts = projectDegradationCurve([
      { yr: 1, retention: NaN },
      { yr: 2, retention: Infinity },
      { yr: 3, retention: 0.9 },
    ]);
    expect(pts).toEqual([{ year: 3, retention: 0.9 }]);
  });

  it('handles empty input', () => {
    expect(projectDegradationCurve([])).toEqual([]);
  });
});

describe('degradationAxisRange — chart y-axis bounds', () => {
  it('includes both reference thresholds in the visible range', () => {
    const pts = projectDegradationCurve(FIXTURE);
    const { min, max } = degradationAxisRange(pts);
    expect(min).toBeLessThanOrEqual(END_OF_LIFE_THRESHOLD);
    expect(max).toBeGreaterThanOrEqual(AUGMENTATION_THRESHOLD);
  });

  it('clamps to [0, 1]', () => {
    const { min, max } = degradationAxisRange([
      { year: 1, retention: 0.99 },
      { year: 20, retention: 0.5 },
    ]);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('falls back to a sensible default when no points', () => {
    const { min, max } = degradationAxisRange([]);
    expect(min).toBeLessThan(max);
    expect(max).toBeLessThanOrEqual(1);
  });
});

describe('isYearOneFresh — sanity check', () => {
  it('returns true for retention ~1.0 in Y1', () => {
    expect(isYearOneFresh([{ year: 1, retention: 1.0 }])).toBe(true);
    expect(isYearOneFresh([{ year: 1, retention: 0.97 }])).toBe(true);
  });

  it('returns false if Y1 retention is far from 1.0', () => {
    expect(isYearOneFresh([{ year: 1, retention: 0.5 }])).toBe(false);
  });

  it('returns false if Y1 is missing', () => {
    expect(isYearOneFresh([{ year: 2, retention: 0.95 }])).toBe(false);
    expect(isYearOneFresh([])).toBe(false);
  });
});

describe('threshold constants — industry conventions', () => {
  it('augmentation trigger is 0.80', () => {
    expect(AUGMENTATION_THRESHOLD).toBe(0.8);
  });
  it('end-of-life threshold is 0.70', () => {
    expect(END_OF_LIFE_THRESHOLD).toBe(0.7);
  });
});
