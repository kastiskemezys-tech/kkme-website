/**
 * Phase 36.B2 — historical-year bootstrap.
 *
 * The percentile machinery is where a bankability deliverable can most easily
 * lie without anyone noticing: a P90 computed from five samples looks exactly
 * like a P90 computed from five hundred. These tests pin the two things that
 * make the difference — that the sample's resolvable band is enforced rather
 * than assumed, and that no scaling factor can ever invert an engine revenue
 * line.
 */

import { describe, it, expect } from 'vitest';
import {
  exceedancePercentile,
  resolvableBand,
  shapeYearFactors,
  applyShapeFactor,
  buildPercentiles,
  checkOrdering,
  lifetimeGross,
  EXCEEDANCE_LEVELS,
} from '../lib/bootstrap.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Minimal shape-year record: only the fields the factor maths reads. */
const shapeYear = (capacity: number, arbNet: number, actNet: number, discharged: number) => ({
  revenue: {
    attributed: { capacity, arbitrage_net: arbNet, activation_net: actNet },
  },
  energy: { discharged_mwh: discharged },
});

/** Minimal engine result: 20 years of flat revenue lines. */
const engineResult = (n = 20) => ({
  model_version: 'v7.3',
  years: Array.from({ length: n }, (_, i) => ({
    yr: i + 1,
    cal_year: 2029 + i,
    rev_cap: 1000,
    rev_act: 500,
    rev_bal: 1500,
    rev_trd: 800,
    rev_gross: 2300,
  })),
  project: {
    arb_energy_20yr: Array.from({ length: n }, (_, i) => ({
      yr: i + 1, mwh_charged: 100, mwh_discharged: 80, rte: 0.82,
    })),
  },
});

describe('exceedancePercentile — the sample must not overstate what it resolves', () => {
  it('reports the resolvable band as [1/(N+1), N/(N+1)]', () => {
    expect(resolvableBand(5)).toMatchObject({ min_p: 1 / 6, max_p: 5 / 6, n: 5 });
    expect(resolvableBand(11)).toMatchObject({ min_p: 1 / 12, max_p: 11 / 12, n: 11 });
  });

  it('refuses to call a P90 resolved on 5 samples, and clamps to the minimum', () => {
    const s = [10, 20, 30, 40, 50];
    const r = exceedancePercentile(s, 0.9);
    expect(r.resolved).toBe(false);
    expect(r.value).toBe(10);
    expect(r.reason).toMatch(/shape-years/);
  });

  it('does resolve a P90 on 11 samples — the sensitivity sample buys exactly this', () => {
    const s = Array.from({ length: 11 }, (_, i) => (i + 1) * 10);
    expect(exceedancePercentile(s, 0.9).resolved).toBe(true);
    // P99 stays out of reach at any realistic sample size.
    expect(exceedancePercentile(s, 0.99).resolved).toBe(false);
  });

  it('returns the median at P50 for an odd sample', () => {
    expect(exceedancePercentile([10, 20, 30, 40, 50], 0.5).value).toBeCloseTo(30, 9);
  });

  it('is monotone: higher exceedance is never a higher value', () => {
    const s = [7, 13, 29, 31, 44, 61, 78, 95, 101, 140, 162];
    let prev = Infinity;
    for (const p of [0.5, 0.75, 0.9, 0.99]) {
      const v = exceedancePercentile(s, p).value as number;
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('handles degenerate samples without inventing a number', () => {
    expect(exceedancePercentile([], 0.5)).toMatchObject({ value: null, resolved: false });
    expect(exceedancePercentile([42], 0.5)).toMatchObject({ value: 42, resolved: false });
  });
});

describe('shapeYearFactors — a factor may never invert a revenue line', () => {
  const sample = {
    '2024': shapeYear(4_434_000, 927_000, -510_000, 10_635),
    '2025': shapeYear(4_456_000, 1_067_000, -437_000, 10_545),
  };

  it('takes ratios from the attributed lines, not the raw ones', () => {
    const f = shapeYearFactors(sample as Any, '2025');
    expect(f['2024'].arbitrage).toBeCloseTo(927 / 1067, 6);
    expect(f['2024'].capacity).toBeCloseTo(4_434 / 4_456, 6);
    expect(f['2025'].arbitrage).toBe(1);
  });

  it('pins activation at 1.0 and carries the measured value alongside', () => {
    const f = shapeYearFactors(sample as Any, '2025');
    expect(f['2024'].activation).toBe(1);
    // The measured ratio of two negative artefacts is reported, never applied.
    expect(f['2024'].activation_measured).toBeCloseTo(-510 / -437, 6);
  });

  it('throws rather than emitting a negative factor', () => {
    // This is the real failure the raw-line basis produced: 2022's raw
    // arbitrage was −€0.76M against a −€0.25M reference, giving −1.401, which
    // would have flipped the sign of the engine's trading revenue.
    const bad = {
      '2024': shapeYear(4_434_000, -760_000, -510_000, 10_635),
      '2025': shapeYear(4_456_000, 1_067_000, -437_000, 10_545),
    };
    expect(() => shapeYearFactors(bad as Any, '2025')).toThrow(/non-positive scaling factor/);
  });

  it('throws when the reference year is absent from the sample', () => {
    expect(() => shapeYearFactors(sample as Any, '2019')).toThrow(/reference shape-year/);
  });
});

describe('applyShapeFactor — scaling is consistent and does not mutate the baseline', () => {
  it('rebuilds rev_bal and rev_gross from the scaled components', () => {
    const base = engineResult();
    const out = applyShapeFactor(base as Any, {
      capacity: 0.5, activation: 1, arbitrage: 2, arb_energy: 2,
    }) as Any;
    const y = out.years[0];
    expect(y.rev_cap).toBe(500);
    expect(y.rev_act).toBe(500);
    expect(y.rev_trd).toBe(1600);
    expect(y.rev_bal).toBe(1000);
    expect(y.rev_gross).toBe(2600);
    expect(y.rev_gross).toBe(y.rev_cap + y.rev_act + y.rev_trd);
  });

  it('scales the arbitrage energy schedule so charging cost tracks revenue', () => {
    const out = applyShapeFactor(engineResult() as Any, {
      capacity: 1, activation: 1, arbitrage: 1, arb_energy: 0.5,
    }) as Any;
    expect(out.project.arb_energy_20yr[0].mwh_charged).toBe(50);
    expect(out.project.arb_energy_20yr[0].mwh_discharged).toBe(40);
  });

  it('leaves the baseline untouched', () => {
    const base = engineResult();
    applyShapeFactor(base as Any, { capacity: 9, activation: 9, arbitrage: 9, arb_energy: 9 });
    expect(base.years[0].rev_gross).toBe(2300);
    expect(base.project.arb_energy_20yr[0].mwh_charged).toBe(100);
  });
});

describe('buildPercentiles — ordering and traceability', () => {
  const scaled = Object.fromEntries(
    [0.6, 0.8, 1.0, 1.2, 1.4].map((f, i) => [
      String(2021 + i),
      applyShapeFactor(engineResult() as Any, {
        capacity: 1, activation: 1, arbitrage: f, arb_energy: f,
      }),
    ])
  );

  it('holds P99 ≤ P90 ≤ P75 ≤ P50 in every projection year', () => {
    const pct = buildPercentiles(scaled as Any, EXCEEDANCE_LEVELS);
    expect(checkOrdering(pct.per_year, EXCEEDANCE_LEVELS)).toEqual([]);
  });

  it('names a real shape-year for every percentile path — no synthetic draws', () => {
    const pct = buildPercentiles(scaled as Any, EXCEEDANCE_LEVELS);
    for (const key of Object.keys(pct.paths)) {
      const p = (pct.paths as Any)[key];
      expect(Object.keys(scaled)).toContain(p.shape_year);
    }
  });

  it('ranks paths by lifetime, so the P50 path is the median shape-year', () => {
    const pct = buildPercentiles(scaled as Any, EXCEEDANCE_LEVELS);
    // arbitrage factor 1.0 is the middle of [0.6, 0.8, 1.0, 1.2, 1.4] → 2023.
    expect(pct.paths.p50.shape_year).toBe('2023');
    expect(pct.paths.p50.resolved).toBe(true);
    expect(pct.paths.p90.resolved).toBe(false);
  });

  it('flags per-year percentiles that the sample cannot resolve', () => {
    const pct = buildPercentiles(scaled as Any, EXCEEDANCE_LEVELS);
    expect(pct.per_year[0].p50_resolved).toBe(true);
    expect(pct.per_year[0].p90_resolved).toBe(false);
  });

  it('catches an ordering violation if one is ever introduced', () => {
    const pct = buildPercentiles(scaled as Any, EXCEEDANCE_LEVELS);
    const broken = pct.per_year.map((r: Any) => ({ ...r, p90: r.p50 + 1 }));
    expect(checkOrdering(broken, EXCEEDANCE_LEVELS).length).toBeGreaterThan(0);
  });

  it('lifetimeGross sums the projection', () => {
    expect(lifetimeGross(engineResult() as Any)).toBe(2300 * 20);
  });
});
