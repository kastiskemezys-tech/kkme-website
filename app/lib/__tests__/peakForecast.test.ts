import { describe, it, expect } from 'vitest';
import {
  intradayRange,
  crossZoneSeparationPct,
  formatTomorrowLine,
} from '../peakForecast';

describe('Peak Forecast tomorrow line', () => {
  it('intraday range is peak minus trough in €/MWh', () => {
    expect(intradayRange(187, 16)).toBe(171);
    expect(intradayRange(50, 30)).toBe(20);
  });

  it('cross-zone separation: positive when LT > SE4, negative when LT < SE4', () => {
    // LT cheaper than SE4 by 33%
    expect(crossZoneSeparationPct(67, 100)).toBeCloseTo(-33, 0);
    // LT pricier than SE4 by 25%
    expect(crossZoneSeparationPct(125, 100)).toBeCloseTo(25, 0);
  });

  it('cross-zone uses |SE4| floor of 10 to prevent divide-by-near-zero', () => {
    // SE4 = 0 → denominator floored to 10, so separation = 100/10 = 1000%
    expect(crossZoneSeparationPct(100, 0)).toBe(1000);
    // SE4 = 5 → still floored to 10
    expect(crossZoneSeparationPct(100, 5)).toBe((100 - 5) / 10 * 100);
  });

  it('formatTomorrowLine labels intraday range AND cross-zone separation distinctly', () => {
    // Audit case: peak 187, trough 16, LT cheaper than SE4 by ~33%
    const line = formatTomorrowLine({
      lt_peak: 187,
      lt_trough: 16,
      lt_avg: 67,
      se4_avg: 100,
    });
    expect(line).toContain('peak €187');
    expect(line).toContain('trough €16');
    expect(line).toContain('range €171/MWh'); // the real intraday spread
    expect(line).toContain('vs SE4 -33%');    // cross-zone, properly named
    // Regression: never display a bare "spread X%" — that's the bug
    expect(line).not.toMatch(/\bspread\s+-?\d/);
  });

  it('returns null when peak/trough missing', () => {
    expect(formatTomorrowLine({})).toBeNull();
    expect(formatTomorrowLine({ lt_peak: 100 })).toBeNull();
  });

  it('falls back to worker-provided spread_pct if avgs missing', () => {
    const line = formatTomorrowLine({
      lt_peak: 100,
      lt_trough: 20,
      spread_pct: -15,
    });
    expect(line).toContain('vs SE4 -15%');
  });
});
