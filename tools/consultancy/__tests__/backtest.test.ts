/**
 * Phase 36.B3 — dispatch backtest and measured trading realisation.
 *
 * The number this produces replaces the single largest assumption in the model,
 * so the tests care about two things above all: that the aggregation cannot
 * flatter the result, and that recording it in the register cannot silently
 * move a delivered client number.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  policyDayCapture, byDay, measureRealisation, aggregateRealisation, byMonth, leakageChecks,
} from '../lib/backtest.mjs';
import { updateRegister, monthlyRange, dateForDayFactory, REGISTER_PATH } from '../run-backtest.mjs';
import { simulateYear } from '../lib/dispatch.mjs';
import { REVENUE_SCENARIOS_FOR_TEST } from '../../../workers/fetch-s1.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const sc = REVENUE_SCENARIOS_FOR_TEST.base;

const row = (price: number, charge = 0, discharge = 0) => ({
  price, mwh_charge: charge, mwh_discharge: discharge,
});

describe('policyDayCapture — volume weighting', () => {
  it('weights by MWh, not by hour count', () => {
    // 1 MWh bought at €10 and 9 MWh at €20 → average €19, not €15.
    const r = policyDayCapture([
      row(10, 1, 0), row(20, 9, 0), row(100, 0, 10),
    ]) as Any;
    expect(r.traded).toBe(true);
    expect(r.avg_charge).toBeCloseTo(19, 9);
    expect(r.avg_discharge).toBeCloseTo(100, 9);
    expect(r.gross_eur_mwh).toBeCloseTo(81, 9);
  });

  it('reports traded:false rather than a zero spread when a leg is missing', () => {
    expect(policyDayCapture([row(10, 5, 0)]).traded).toBe(false);
    expect(policyDayCapture([row(90, 0, 5)]).traded).toBe(false);
    expect(policyDayCapture([]).traded).toBe(false);
  });
});

describe('aggregateRealisation — a declined day is not a failed day', () => {
  const daily = [
    { traded: true, realisation: 0.8, discharge_mwh: 100 },
    { traded: true, realisation: 0.6, discharge_mwh: 100 },
    { traded: false, realisation: null, discharge_mwh: 0 },
  ];

  it('excludes non-trading days instead of scoring them zero', () => {
    const a = aggregateRealisation(daily as Any);
    expect(a.n_traded).toBe(2);
    expect(a.n_declined).toBe(1);
    // Scoring the declined day as 0 would give 0.467; correctly refusing a
    // spread that cannot cover the round trip is the policy working.
    expect(a.simple_mean).toBeCloseTo(0.7, 9);
  });

  it('volume-weights the headline', () => {
    const a = aggregateRealisation([
      { traded: true, realisation: 0.9, discharge_mwh: 10 },
      { traded: true, realisation: 0.5, discharge_mwh: 90 },
    ] as Any);
    expect(a.volume_weighted).toBeCloseTo((0.9 * 10 + 0.5 * 90) / 100, 9);
    expect(a.simple_mean).toBeCloseTo(0.7, 9);
    // The gap between the two is itself reportable, so both must survive.
    expect(a.volume_weighted).not.toBeCloseTo(a.simple_mean as number, 3);
  });

  it('handles a sample with no trading days at all', () => {
    const a = aggregateRealisation([{ traded: false, realisation: null, discharge_mwh: 0 }] as Any);
    expect(a.n_traded).toBe(0);
    expect(a.volume_weighted).toBeNull();
  });
});

describe('measureRealisation — day filtering', () => {
  const captureFn = (prices: number[]) => ({
    gross_eur_mwh: Math.max(...prices) - Math.min(...prices),
  });

  it('skips days with a missing price rather than measuring a partial curve', () => {
    const prices = [...Array(24).fill(50), ...Array(24).fill(50)];
    prices[30] = null as Any;
    const rows = prices.map((p) => row(p as number, 0, 0));
    const days = byDay(rows, prices);
    // Both days are flat, so capture is 0 and both are dropped anyway; make
    // day 0 tradeable so only the null day is what excludes day 1.
    prices[5] = 10; prices[20] = 90;
    rows[5] = row(10, 10, 0); rows[20] = row(90, 0, 8);
    const d2 = byDay(rows, prices);
    const out = measureRealisation({ days: d2, dur_h: 2, captureFn: captureFn as Any });
    expect(out.map((o: Any) => o.day)).toEqual([0]);
    void days;
  });

  it('skips days whose perfect-foresight spread is zero — no division by nothing', () => {
    const prices = Array(24).fill(50);
    const rows = prices.map((p) => row(p, 0, 0));
    const out = measureRealisation({ days: byDay(rows, prices), dur_h: 2, captureFn: captureFn as Any });
    expect(out).toHaveLength(0);
  });
});

describe('leakageChecks', () => {
  it('fails when any day beats perfect foresight', () => {
    const daily = [{ traded: true, realisation: 1.2, discharge_mwh: 10, perfect_gross_eur_mwh: 20 }];
    const agg = aggregateRealisation(daily as Any);
    const checks = leakageChecks(daily as Any, agg);
    expect(checks.find((c: Any) => c.check.includes('perfect foresight'))!.pass).toBe(false);
  });

  it('flags a headline above the 0.90 suspicion threshold', () => {
    const daily = Array.from({ length: 20 }, () => ({
      traded: true, realisation: 0.95, discharge_mwh: 10, perfect_gross_eur_mwh: 30,
    }));
    const checks = leakageChecks(daily as Any, aggregateRealisation(daily as Any));
    expect(checks.find((c: Any) => c.check.includes('0.90'))!.pass).toBe(false);
  });
});

describe('byMonth / dateForDayFactory', () => {
  it('maps day indices to dates from the window start', () => {
    const f = dateForDayFactory('2025-07-01');
    expect(f(0)).toBe('2025-07-01');
    expect(f(31)).toBe('2025-08-01');
  });

  it('groups by calendar month', () => {
    const daily = [
      { date: '2025-07-01', traded: true, realisation: 0.8, discharge_mwh: 10 },
      { date: '2025-07-02', traded: true, realisation: 0.6, discharge_mwh: 10 },
      { date: '2025-08-01', traded: true, realisation: 0.9, discharge_mwh: 10 },
    ];
    const m = byMonth(daily as Any);
    expect(Object.keys(m)).toEqual(['2025-07', '2025-08']);
    expect(m['2025-07'].n_traded).toBe(2);
  });
});

describe('monthlyRange', () => {
  it('rounds outward so the range contains every observation', () => {
    expect(monthlyRange({
      a: { volume_weighted: 0.6535 }, b: { volume_weighted: 0.8155 },
    } as Any)).toEqual([0.65, 0.82]);
  });
});

describe('updateRegister — recording a measurement must not move a delivered number', () => {
  const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));
  const args = {
    measured: 0.7234,
    assumed: 0.85,
    n_days: 349,
    window: { from: '2025-07-01', to: '2026-06-30' },
    monthly: { a: { volume_weighted: 0.6535 }, b: { volume_weighted: 0.8155 } },
  };

  it('leaves the engine-bound driver at its own value', () => {
    // The binding contract: `driver:<id>` rows are asserted equal to the Central
    // scenario driver. Overwriting this would either break that invariant or
    // force a client-IRR change inside a measurement phase.
    const out = updateRegister(structuredClone(register), args as Any) as Any;
    const bound = out.rows.find((r: Any) => r.id === 'driver_trading_realisation');
    expect(bound.value).toBe(0.85);
    expect(bound.engine_binding).toBe('driver:trading_realisation');
    expect(bound.note).toMatch(/MEASURED at 0.7234/);
  });

  it('adds NO new row — the register\'s every-row-is-bound invariant survives', () => {
    const out = updateRegister(structuredClone(register), args as Any) as Any;
    // __tests__/register.test.ts asserts every row carries an engine_binding,
    // with a per-row binding check. A measured observation has no code constant
    // to bind to, so recording it as a row would mean weakening a governance
    // assertion — which a measurement phase has no business doing on its own.
    expect(out.rows).toHaveLength(register.rows.length);
    expect(out.rows.every((r: Any) => r.engine_binding)).toBe(true);
    expect(out.rows.some((r: Any) => r.id === 'trading_realisation_measured')).toBe(false);
  });

  it('records the measurement in the changelog instead', () => {
    const out = updateRegister(structuredClone(register), args as Any) as Any;
    const entry = out.changelog.find((c: Any) => c.id === 'trading_realisation_measured');
    expect(entry.new).toBe(0.7234);
    expect(entry.old).toBeNull();
    expect(entry.phase).toBe('36.B3');
    expect(entry.reason).toMatch(/UNCHANGED/);
  });

  it('surfaces that the measurement falls below the assumption\'s declared range', () => {
    const out = updateRegister(structuredClone(register), args as Any) as Any;
    const bound = out.rows.find((r: Any) => r.id === 'driver_trading_realisation');
    expect(bound.note).toMatch(/falls BELOW/);
    // The assumed range is [0.78, 0.88] and the measurement is 0.7234.
    expect(0.7234).toBeLessThan(bound.sensitivity_range[0]);
  });

  it('does not duplicate rows when applied twice', () => {
    const once = updateRegister(structuredClone(register), args as Any) as Any;
    const twice = updateRegister(once, args as Any) as Any;
    expect(twice.rows).toHaveLength(register.rows.length);
  });
});

describe('36.B1-J guard is inert for this run, and that is asserted not assumed', () => {
  it('window arbitrage does not move with hours_per_year when reserves are zero', () => {
    const prices = Array.from({ length: 24 * 30 }, (_, h) =>
      50 + 40 * Math.sin((h % 24) / 24 * 2 * Math.PI));
    const config = { mw: 50, mwh: 100, duration_h: 2, project_id: 'guard', grid_allowance_mw: 50 };
    const reserve = {
      avail_mw: { fcr: 0, afrr: 0, mfrr: 0 }, price: {}, act_price: {}, mwh_per_mw_yr: {},
    };
    const run = (hours_per_year: number) => simulateYear({
      config, prices, yearIndex: 1, reserve, sc: { ...sc, avail: 1.0 },
      opts: { keepHours: false, hours_per_year, enforce_reserve_energy: false },
    }) as Any;

    // The backtest sets hours_per_year explicitly as the 36.B1-J guard. With no
    // committed reserve MW there is no activation energy for it to pro-rate, so
    // it must make no difference — proven here rather than asserted in a comment.
    expect(run(8760).revenue.arbitrage).toBeCloseTo(run(720).revenue.arbitrage, 6);
    expect(run(8760).energy.activation_mwh).toBe(0);
  });
});
