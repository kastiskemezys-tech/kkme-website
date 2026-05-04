import { describe, it, expect } from 'vitest';
import {
  backtestStats,
  backtestAxisRange,
  formatBacktestMonth,
  type BacktestRow,
} from '../backtest';

// Phase 7.7a (7.7.12) — backtest 13-month chart helpers.
//
// Fixture mirrors the worker's payload shape (verified against
// kkme-fetch-s1 on 2026-04-26: trailing 13 months ending 2026-04 partial).

const FIXTURE: BacktestRow[] = [
  { month: '2025-04', trading_daily: 253, balancing_daily: 294, total_daily: 547, s1_capture: 172.2, days: 30 },
  { month: '2025-05', trading_daily: 240, balancing_daily: 290, total_daily: 530, s1_capture: 165.0, days: 31 },
  { month: '2025-06', trading_daily: 230, balancing_daily: 285, total_daily: 515, s1_capture: 158.0, days: 30 },
  { month: '2025-07', trading_daily: 220, balancing_daily: 280, total_daily: 500, s1_capture: 150.0, days: 31 },
  { month: '2025-08', trading_daily: 215, balancing_daily: 278, total_daily: 493, s1_capture: 148.0, days: 31 },
  { month: '2025-09', trading_daily: 210, balancing_daily: 275, total_daily: 485, s1_capture: 145.0, days: 30 },
  { month: '2025-10', trading_daily: 205, balancing_daily: 272, total_daily: 477, s1_capture: 142.0, days: 31 },
  { month: '2025-11', trading_daily: 200, balancing_daily: 270, total_daily: 470, s1_capture: 140.0, days: 30 },
  { month: '2025-12', trading_daily: 195, balancing_daily: 268, total_daily: 463, s1_capture: 138.0, days: 31 },
  { month: '2026-01', trading_daily: 190, balancing_daily: 265, total_daily: 455, s1_capture: 135.0, days: 31 },
  { month: '2026-02', trading_daily: 180, balancing_daily: 260, total_daily: 440, s1_capture: 130.0, days: 28 },
  { month: '2026-03', trading_daily: 165, balancing_daily: 300, total_daily: 465, s1_capture: 110.0, days: 31 },
  { month: '2026-04', trading_daily: 153, balancing_daily: 294, total_daily: 447, s1_capture: 103.8, days: 16 },
];

describe('backtestStats — summary computation', () => {
  it('counts all 13 valid months', () => {
    expect(backtestStats(FIXTURE).count).toBe(13);
  });

  it('sums total observation days across the window', () => {
    expect(backtestStats(FIXTURE).totalDays).toBe(381);  // 30+31+30+31+31+30+31+30+31+31+28+31+16
  });

  it('mean is days-weighted, not equally weighted', () => {
    // Equally-weighted mean ≈ 483; days-weighted should be similar but not identical
    // (the partial 16-day April pulls it down slightly compared to equal weight).
    const stats = backtestStats(FIXTURE);
    expect(stats.meanTotalDaily).toBeGreaterThan(450);
    expect(stats.meanTotalDaily).toBeLessThan(510);
  });

  it('min/max bracket the entire fixture', () => {
    const stats = backtestStats(FIXTURE);
    expect(stats.minTotalDaily).toBe(440);
    expect(stats.maxTotalDaily).toBe(547);
  });

  it('mean error vs modeled reference is signed and percentage', () => {
    const stats = backtestStats(FIXTURE, 480);
    expect(stats.meanErrorPct).not.toBeNull();
    // realised mean ≈ 484 vs modeled 480 → error ≈ +0.8%
    expect(stats.meanErrorPct!).toBeGreaterThan(-5);
    expect(stats.meanErrorPct!).toBeLessThan(5);
  });

  it('returns null mean error when no modeled reference passed', () => {
    expect(backtestStats(FIXTURE).meanErrorPct).toBeNull();
  });

  it('returns null mean error if modeled reference is zero (no divide-by-zero)', () => {
    expect(backtestStats(FIXTURE, 0).meanErrorPct).toBeNull();
  });

  it('mae is sign-stripped magnitude that meanErrorPct hides', () => {
    // 3 rows around modeled=300: realised=[330, 270, 360], days=[30,30,30].
    // meanTotalDaily = 320 → meanErrorPct = +6.67% (hides the down-shot at 270);
    // mae = (|330-300| + |270-300| + |360-300|) / 3 = (30 + 30 + 60) / 3 = 40.
    const symFixture: BacktestRow[] = [
      { month: '2025-04', trading_daily: 0, balancing_daily: 0, total_daily: 330, s1_capture: 0, days: 30 },
      { month: '2025-05', trading_daily: 0, balancing_daily: 0, total_daily: 270, s1_capture: 0, days: 30 },
      { month: '2025-06', trading_daily: 0, balancing_daily: 0, total_daily: 360, s1_capture: 0, days: 30 },
    ];
    const stats = backtestStats(symFixture, 300);
    expect(stats.meanErrorPct).toBeCloseTo(6.667, 2);
    expect(stats.mae).toBeCloseTo(40, 5);
  });

  it('returns null mae when no modeled reference passed', () => {
    expect(backtestStats(FIXTURE).mae).toBeNull();
  });

  it('returns null mae if modeled reference is zero', () => {
    expect(backtestStats(FIXTURE, 0).mae).toBeNull();
  });

  it('returns null mae on empty input', () => {
    expect(backtestStats([], 300).mae).toBeNull();
  });

  it('drops rows with non-finite total_daily or zero days', () => {
    const dirty: BacktestRow[] = [
      { month: '2025-04', trading_daily: 0, balancing_daily: 0, total_daily: NaN, s1_capture: 0, days: 30 },
      { month: '2025-05', trading_daily: 0, balancing_daily: 0, total_daily: 500, s1_capture: 0, days: 0 },
      { month: '2025-06', trading_daily: 0, balancing_daily: 0, total_daily: 500, s1_capture: 0, days: 30 },
    ];
    expect(backtestStats(dirty).count).toBe(1);
  });

  it('returns zero stats on empty input', () => {
    const stats = backtestStats([]);
    expect(stats.count).toBe(0);
    expect(stats.meanErrorPct).toBeNull();
  });
});

describe('backtestAxisRange — chart bounds', () => {
  it('includes both data range and modeled reference', () => {
    const { min, max } = backtestAxisRange(FIXTURE, 600);
    expect(min).toBeLessThanOrEqual(440);
    expect(max).toBeGreaterThanOrEqual(600);
  });

  it('y-axis is non-negative even with low fixture values', () => {
    const lowFixture: BacktestRow[] = [
      { month: '2025-04', trading_daily: 10, balancing_daily: 20, total_daily: 30, s1_capture: 10, days: 30 },
    ];
    const { min } = backtestAxisRange(lowFixture);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it('falls back to a default range on empty input', () => {
    const { min, max } = backtestAxisRange([]);
    expect(min).toBeLessThan(max);
  });
});

describe('formatBacktestMonth — x-axis labels', () => {
  it('formats YYYY-MM into "Mon \'YY"', () => {
    expect(formatBacktestMonth('2025-04')).toBe("Apr '25");
    expect(formatBacktestMonth('2026-12')).toBe("Dec '26");
  });

  it('handles single-digit months gracefully', () => {
    expect(formatBacktestMonth('2026-01')).toBe("Jan '26");
  });
});
