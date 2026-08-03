/**
 * Phase 38.2 (B-056) — PeakForecastCard's public interpretation line may not
 * claim a window or a tail the distribution behind it cannot carry.
 *
 * It read "…× the 90D median … × the P90" unconditionally. The array behind
 * `swing_stats_90d` was 90 ROWS over nine distinct dates, so "90D" was a
 * constant someone typed rather than a property of the data — discipline
 * rule #2, on the site's most interpretive sentence — and "P90" named a
 * percentile of a nine-point sample.
 *
 * Both are now derived from the payload's own `days_of_data`, which counts
 * distinct dates after 38.2. The dot obeys the same floor as the sentence: a
 * green "exceptional" state off nine days is the same defect rendered as one
 * pixel.
 */

import { describe, it, expect } from 'vitest';
import { interpretation, dotColor } from '@/app/components/PeakForecastCard';

const full = { p25: 120, p50: 150, p75: 180, p90: 200, n: 30, days_of_data: 30 };
const thin = { p25: 120, p50: 150, p75: 180, p90: 200, n: 9, days_of_data: 9 };

describe('the interpretation sentence claims only what n supports', () => {
  it('names the window from the payload, not a hardcoded 90D', () => {
    expect(interpretation(180, full)).toContain('the 30D median');
    expect(interpretation(180, full)).not.toContain('90D');
  });

  it('tracks the window when it changes — it is derived, not a second constant', () => {
    expect(interpretation(180, { ...full, days_of_data: 47 })).toContain('the 47D median');
  });

  it('withholds the P90 comparison when there are too few days to have one', () => {
    const s = interpretation(180, thin);
    expect(s).not.toContain('P90');
    expect(s).toContain('9 market days of history');
    expect(s).toContain('too few for a tail estimate');
    // The median comparison survives — it is a claim nine days can carry.
    expect(s).toContain('the 9D median');
  });

  it('counts DISTINCT DATES, so 90 rows over 9 dates reads as nine', () => {
    // The exact production shape this phase corrected.
    const contaminated = { ...full, n: 90, days_of_data: 9 };
    const s = interpretation(180, contaminated);
    expect(s).toContain('the 9D median');
    expect(s).not.toContain('90D');
    expect(s).not.toContain('P90');
  });

  it('falls back to an unnamed window rather than inventing one', () => {
    const s = interpretation(180, { p50: 150, p90: 200 });
    expect(s).toContain('the trailing median');
    expect(s).not.toMatch(/\d+D median/);
  });
});

describe('the dot obeys the same floor as the sentence', () => {
  it('goes green above P90 when the tail is supported', () => {
    expect(dotColor(250, full)).toBe('var(--green)');
  });

  it('will not claim an exceptional swing off nine days', () => {
    expect(dotColor(250, thin)).not.toBe('var(--green)');
    expect(dotColor(250, thin)).toBe('var(--amber-accent-text)');
  });

  it('still degrades to muted with no distribution at all', () => {
    expect(dotColor(250, null)).toBe('var(--text-muted)');
  });
});
