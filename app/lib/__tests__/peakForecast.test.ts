import { describe, it, expect } from 'vitest';
import {
  intradayRange,
  crossZoneSeparationPct,
  formatTomorrowLine,
  computePeakTrough,
} from '../peakForecast';
import { formatHourEET } from '../hourLabels';

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

// Phase 12.10 — Audit #5 found PeakForecastCard rendered slice-index as a
// UTC clock-hour, off by the slice's UTC offset. The fix anchors the slice's
// last entry to updated_at's UTC hour and derives each idx's UTC clock-hour.

describe('computePeakTrough — slice idx → UTC clock-hour (Phase 12.10)', () => {
  it('returns null for missing / short input', () => {
    expect(computePeakTrough(null, '2026-05-04T07:00:00Z')).toBeNull();
    expect(computePeakTrough([], '2026-05-04T07:00:00Z')).toBeNull();
    expect(computePeakTrough(new Array(23).fill(50), '2026-05-04T07:00:00Z')).toBeNull();
  });

  it('day-aligned 24-entry hourly slice: idx maps to UTC clock-hour, anchored at last entry', () => {
    // Build a 24-entry hourly array with peak at idx 11 (€150) and trough at idx 0 (€20).
    // updated_at = 2026-05-04T23:00:00Z → last idx 23 = UTC hour 23, idx 11 = UTC hour 11.
    const hourly = [20, 30, 35, 40, 45, 50, 55, 60, 70, 90, 120, 150, 140, 130, 120, 110, 100, 95, 90, 85, 80, 70, 60, 50];
    const r = computePeakTrough(hourly, '2026-05-04T23:00:00Z');
    expect(r).not.toBeNull();
    expect(r!.peakHour).toBe(11);
    expect(r!.peakPrice).toBe(150);
    expect(r!.troughHour).toBe(0);
    expect(r!.troughPrice).toBe(20);
    // formatHourEET converts UTC -> EEST (May 2026 is in DST, +3)
    expect(formatHourEET(r!.peakHour, '2026-05-04T23:00:00Z')).toBe('h14 EET');
    expect(formatHourEET(r!.troughHour, '2026-05-04T23:00:00Z')).toBe('h3 EET');
  });

  it('rolling 24-entry slice not day-aligned: last idx anchored at updated_at hour', () => {
    // updated_at = 2026-05-04T07:00:00Z (07 UTC = 10 EEST).
    // last idx 23 = UTC hour 7. idx 0 = UTC hour 8 yesterday = wraps to (7-23)%24 = 8.
    // Place max at idx 11 → UTC hour = (7 - (23-11)) mod 24 = (7 - 12 + 24) mod 24 = 19.
    // 19 UTC = 22 EEST = audit's reported "h22 EEST" peak.
    const hourly = new Array(24).fill(50);
    hourly[11] = 158.81; // audit's reported actual day max
    hourly[0] = 4.99;    // audit's reported actual day min
    const r = computePeakTrough(hourly, '2026-05-04T07:00:00Z');
    expect(r).not.toBeNull();
    expect(r!.peakHour).toBe(19);
    expect(r!.peakPrice).toBe(158.81);
    // formatHourEET: 19 UTC + 3 (EEST) = 22 → "h22 EET"
    expect(formatHourEET(r!.peakHour, '2026-05-04T07:00:00Z')).toBe('h22 EET');
    // trough: idx 0 → UTC (7 - 23 + 24) mod 24 = 8 → 8 UTC + 3 EEST = 11 → "h11 EET"
    expect(r!.troughHour).toBe(8);
    expect(formatHourEET(r!.troughHour, '2026-05-04T07:00:00Z')).toBe('h11 EET');
  });

  it('96-entry array (4 hourly days): slices last 24 entries and anchors at updated_at', () => {
    // 96 entries with hourly-scale variation (>€2 between adjacent — heuristic picks perHour=1)
    const days4 = new Array(96).fill(0).map((_, i) => 50 + (i % 24) * 3); // varies by hour
    days4[80] = 200; // peak in slice(-24): idx 80 - 72 = 8
    days4[72] = 5;   // trough in slice(-24): idx 0
    const r = computePeakTrough(days4, '2026-05-04T07:00:00Z');
    expect(r).not.toBeNull();
    // peakIdx 8 → UTC (7 - 23 + 8 + 24) mod 24 = 16
    expect(r!.peakHour).toBe(16);
    expect(r!.peakPrice).toBe(200);
    // troughIdx 0 → UTC (7 - 23 + 24) mod 24 = 8
    expect(r!.troughHour).toBe(8);
  });

  it('96-entry 15-min slice (PT15M): perHour=4, slices last 96, idx-hour bucketing applies', () => {
    // 15-min bars: adjacent values within €1 of each other (heuristic picks perHour=4)
    const fifteenMin = new Array(96).fill(0).map((_, i) => 50 + Math.floor(i / 4) * 0.4 + (i % 4) * 0.05);
    // Place peak at quarter idx 76 → hour idx 19 (Math.floor(76/4) = 19). Peak value high enough to win.
    fifteenMin[76] = 500;
    fifteenMin[0] = 1;
    const r = computePeakTrough(fifteenMin, '2026-05-04T23:00:00Z');
    expect(r).not.toBeNull();
    // perHour=4, slice.length=96 → lastIdxHour = floor(95/4) = 23. updated_at UTC = 23.
    // peakIdx 76 → idxHour = floor(76/4) = 19. UTC = (23 - (23-19)) mod 24 = 19.
    expect(r!.peakHour).toBe(19);
    // troughIdx 0 → idxHour 0. UTC = (23 - 23) mod 24 = 0.
    expect(r!.troughHour).toBe(0);
  });

  it('handles unparseable updated_at gracefully (falls back to UTC 23 anchor)', () => {
    const hourly = new Array(24).fill(50);
    hourly[19] = 200;
    const r = computePeakTrough(hourly, 'not-a-date');
    expect(r).not.toBeNull();
    // Fallback anchor: lastUtcHour=23 → idx 19 → UTC (23 - (23-19)) % 24 = 19
    expect(r!.peakHour).toBe(19);
  });
});
