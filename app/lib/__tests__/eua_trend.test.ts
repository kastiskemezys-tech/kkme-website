import { describe, it, expect } from 'vitest';
import { computeEUATrend } from '../../../workers/lib/eua_trend.js';

const RISING  = '↑ rising';
const STABLE  = '→ stable';
const FALLING = '↓ falling';

// Build a 7-day history ending the day before `currentDate`. Index 0 is the
// oldest entry — the 7-day-back lookback hits index 0 for a 7-element history,
// so `priceAt7DaysAgo` controls the comparison baseline.
function makeHistory(priceAt7DaysAgo: number, fillerPrice = priceAt7DaysAgo) {
  return Array.from({ length: 7 }, (_, i) => ({
    date: `2026-04-${String(20 + i).padStart(2, '0')}`,
    eua_eur_t: i === 0 ? priceAt7DaysAgo : fillerPrice,
  }));
}

describe('computeEUATrend', () => {
  it('returns null on empty history', () => {
    expect(computeEUATrend([], 75.0)).toBeNull();
  });

  it('returns null on non-array history', () => {
    // @ts-expect-error null is rejected at type level; guarding runtime resilience
    expect(computeEUATrend(null, 75.0)).toBeNull();
    // @ts-expect-error undefined is rejected at type level; guarding runtime resilience
    expect(computeEUATrend(undefined, 75.0)).toBeNull();
  });

  it('returns null when current value is missing', () => {
    expect(computeEUATrend(makeHistory(70), null)).toBeNull();
    expect(computeEUATrend(makeHistory(70), 0)).toBeNull();
    expect(computeEUATrend(makeHistory(70), Number.NaN)).toBeNull();
  });

  it('returns null when no past entry has a usable price', () => {
    const broken = [
      { date: '2026-04-20', eua_eur_t: 0 },
      { date: '2026-04-21', eua_eur_t: null as unknown as number },
    ];
    expect(computeEUATrend(broken, 75.0)).toBeNull();
  });

  it('detects rising when current > +1% above 7-day-ago value', () => {
    const history = makeHistory(70.0);
    expect(computeEUATrend(history, 71.5)).toBe(RISING);  // +2.14%
  });

  it('detects falling when current < -1% below 7-day-ago value', () => {
    const history = makeHistory(70.0);
    expect(computeEUATrend(history, 68.0)).toBe(FALLING); // -2.86%
  });

  it('detects stable inside ±1% band', () => {
    const history = makeHistory(70.0);
    expect(computeEUATrend(history, 70.0)).toBe(STABLE);  // 0%
    expect(computeEUATrend(history, 70.5)).toBe(STABLE);  // +0.71%
    expect(computeEUATrend(history, 69.5)).toBe(STABLE);  // -0.71%
  });

  it('falls back to oldest valid entry when history has < 7 days', () => {
    const shortHistory = [
      { date: '2026-04-25', eua_eur_t: 60.0 },
      { date: '2026-04-26', eua_eur_t: 62.0 },
    ];
    // Compares against oldest (60.0). Current 65.0 → +8.3% → rising.
    expect(computeEUATrend(shortHistory, 65.0)).toBe(RISING);
  });

  it('skips invalid past entries when picking the lookback baseline', () => {
    // Oldest entry at idx 0 is invalid (eua_eur_t = 0). After filtering, the
    // earliest valid entry becomes the baseline (75.0). Current 80.0 → +6.7% → rising.
    const history = [
      { date: '2026-04-20', eua_eur_t: 0 },
      { date: '2026-04-21', eua_eur_t: 75.0 },
      { date: '2026-04-22', eua_eur_t: 76.0 },
    ];
    expect(computeEUATrend(history, 80.0)).toBe(RISING);
  });
});
