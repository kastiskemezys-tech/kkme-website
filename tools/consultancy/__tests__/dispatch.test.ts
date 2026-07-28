// Phase 36.B1 — chronological hourly dispatch engine.
//
// Three kinds of assertion live here, and they are doing different jobs.
//
// PROPERTY TESTS run the engine over full synthetic years and assert that no
// hour, anywhere, breaks a physical constraint. A dispatch model that violates
// SoC bounds or the POI limit in hour 6 213 of 8 760 is worthless in front of an
// advisor, and spot-checking cannot find that.
//
// GOLDEN-DAY TESTS hand-compute what the policy must do on a 24-hour price
// shape simple enough to reason about on paper, so the priority order and the
// arithmetic are pinned independently of the engine's own output.
//
// REGRESSION-OF-REASONING TESTS pin the two mistakes this engine actually made
// during construction: driving activation energy from `act_rate_*` (a revenue
// coefficient) instead of the canonical energy anchors, and charging the RTE
// loss on the wrong leg. Both produced plausible-looking output. Both inflated
// revenue. Neither would have been caught by anything except an energy-balance
// identity asserted to machine precision.

import { describe, it, expect } from 'vitest';
import {
  simulateYear,
  buildAvailability,
  SOC_MIN_FRAC,
  SOC_MAX_FRAC,
  DEFAULT_WARRANTY_EFC_YR,
} from '../lib/dispatch.mjs';
import { REVENUE_SCENARIOS_FOR_TEST, RESERVE_PRODUCTS } from '../../../workers/fetch-s1.js';

const sc = REVENUE_SCENARIOS_FOR_TEST.base;

/**
 * `lib/dispatch.mjs` is plain JS, so TypeScript infers the hour-row array as
 * `never[]`. Naming the row shape here keeps the assertions type-checked
 * instead of silenced, and doubles as documentation of the CSV columns.
 */
type HourRow = {
  h: number;
  price: number;
  available: boolean;
  soc: number;
  soc_pct?: number;
  action: string;
  throttled?: boolean;
  mw_fcr: number;
  mw_afrr: number;
  mw_mfrr: number;
  mwh_charge?: number;
  mwh_discharge?: number;
  mwh_activation?: number;
  rev_capacity?: number;
  rev_activation?: number;
  rev_arbitrage?: number;
  efc_used?: number;
};

const rowsOf = (r: { hours_detail?: unknown }): HourRow[] => (r.hours_detail ?? []) as HourRow[];

const CONFIG = {
  project_id: 'test-asset',
  mw: 50,
  mwh: 100,
  duration_h: 2,
};

/** Flat reserve inputs — the runner's canonical shape, with round numbers. */
const RESERVE = {
  cap_price: { fcr: 40, afrr: 30, mfrr: 20 },
  act_price: { fcr: 0, afrr: 100, mfrr: 60 },
  mwh_per_mw_yr: {
    fcr: sc.mwh_per_mw_yr_fcr,
    afrr: sc.mwh_per_mw_yr_afrr,
    mfrr: sc.mwh_per_mw_yr_mfrr,
  },
  acceptance: { fcr: 1, afrr: 1, mfrr: 1 },
  avail_mw: {},
};

/** A daily sine price shape: cheap at night, expensive in the evening. */
function sineYear(hours = 8760, mean = 80, amp = 40) {
  return Array.from({ length: hours }, (_, h) => mean + amp * Math.sin(((h % 24) - 4) / 24 * 2 * Math.PI));
}

function run(prices: number[], opts: Record<string, unknown> = {}) {
  return simulateYear({
    config: CONFIG,
    prices,
    yearIndex: 1,
    reserve: RESERVE,
    sc,
    opts: { total_cd: 1.0, ...opts },
  });
}

describe('energy balance', () => {
  it('closes to machine precision over a full year', () => {
    const r = run(sineYear());
    // Σcharge×RTE = Σdischarge + Σactivation + ΔSoC. This identity is the one
    // thing that would have caught computeDispatchV2's round-trip-loss bug.
    expect(r.energy.balance_error_rel).toBeLessThan(1e-9);
  });

  it('charges the round-trip loss exactly once, on the charge leg', () => {
    const r = run(sineYear());
    const { charged_mwh, discharged_mwh, activation_mwh, soc_start_mwh, soc_end_mwh } = r.energy;
    const out = discharged_mwh + activation_mwh + (soc_end_mwh - soc_start_mwh);
    // Energy delivered must be strictly less than energy taken in — anything
    // else is a battery that creates energy.
    expect(out).toBeLessThan(charged_mwh);
    expect(out).toBeCloseTo(charged_mwh * r.meta.rte, 6);
  });

  it('never delivers more energy than it took in', () => {
    const r = run(sineYear(2000, 60, 50));
    expect(r.energy.discharged_mwh + r.energy.activation_mwh)
      .toBeLessThanOrEqual(r.energy.charged_mwh + 1e-6);
  });
});

describe('constraint properties over a full year', () => {
  const r = run(sineYear());

  it('reports zero violations', () => {
    expect(r.violations).toEqual([]);
  });

  it('keeps SoC inside the usable window in every recorded hour', () => {
    const lo = r.meta.usable_mwh * SOC_MIN_FRAC - 1e-6;
    const hi = r.meta.usable_mwh * SOC_MAX_FRAC + 1e-6;
    for (const row of rowsOf(r)) {
      expect(row.soc).toBeGreaterThanOrEqual(lo);
      expect(row.soc).toBeLessThanOrEqual(hi);
    }
  });

  it('never commits more power than nameplate', () => {
    for (const row of rowsOf(r)) {
      expect(row.mw_fcr + row.mw_afrr + row.mw_mfrr).toBeLessThanOrEqual(CONFIG.mw + 1e-6);
    }
  });

  it('never exceeds the POI limit in either direction', () => {
    for (const row of rowsOf(r)) {
      expect(row.mwh_charge ?? 0).toBeLessThanOrEqual(CONFIG.mw + 1e-6);
      expect(row.mwh_discharge ?? 0).toBeLessThanOrEqual(CONFIG.mw + 1e-6);
    }
  });

  it('respects a POI limit tighter than nameplate', () => {
    const tight = run(sineYear(), { poi_export_mw: 20, poi_import_mw: 20 });
    expect(tight.violations).toEqual([]);
    for (const row of rowsOf(tight)) {
      expect(row.mwh_charge ?? 0).toBeLessThanOrEqual(20 + 1e-6);
      expect(row.mwh_discharge ?? 0).toBeLessThanOrEqual(20 + 1e-6);
    }
  });

  it('never breaches the warranty cycle cap', () => {
    expect(r.cycles.efc_used).toBeLessThanOrEqual(DEFAULT_WARRANTY_EFC_YR);
  });
});

describe('SoC continuity', () => {
  it('carries state across every day boundary', () => {
    const r = run(sineYear(24 * 30));
    const rows = rowsOf(r);
    // computeDispatchV2 resets SoC to 50 % every day. This asserts the opposite:
    // hour 24 must continue from hour 23, not restart.
    for (let d = 1; d < 30; d++) {
      const lastOfPrev = rows[d * 24 - 1];
      const firstOfDay = rows[d * 24];
      if (!lastOfPrev.available || !firstOfDay.available) continue;
      const maxSwing = CONFIG.mw + 1e-6;
      expect(Math.abs(firstOfDay.soc - lastOfPrev.soc)).toBeLessThanOrEqual(maxSwing);
    }
  });

  it('does not silently reset SoC to its starting value each day', () => {
    const r = run(sineYear(24 * 10));
    const rows = rowsOf(r);
    const dayStarts = [1, 2, 3, 4, 5].map((d) => rows[d * 24].soc);
    const unique = new Set(dayStarts.map((s) => s.toFixed(6)));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('reserve energy reservation', () => {
  it('cuts committed MW rather than relaxing the SoC reservation', () => {
    const r = run(sineYear());
    const share = RESERVE_PRODUCTS.afrr.share;
    // With a 2 h asset and aFRR needing 1.0 h of headroom per MW both ways, the
    // reservation must bind — average commitment strictly below the share cap.
    expect(r.commitment.avg_mw_afrr).toBeLessThan(CONFIG.mw * share);
    expect(r.commitment.avg_mw_afrr).toBeGreaterThan(0);
  });

  it('commits more when the reservation is disabled, and earns more', () => {
    const on = run(sineYear(), { keepHours: false });
    const off = run(sineYear(), { keepHours: false, enforce_reserve_energy: false });
    expect(off.commitment.avg_mw_total).toBeGreaterThan(on.commitment.avg_mw_total);
    expect(off.revenue.gross).toBeGreaterThan(on.revenue.gross);
  });

  it('binds harder on a shorter-duration asset', () => {
    const short = simulateYear({
      config: { ...CONFIG, mwh: 50, duration_h: 1 },
      prices: sineYear(), yearIndex: 1, reserve: RESERVE, sc,
      opts: { total_cd: 1.0, keepHours: false },
    });
    const long = simulateYear({
      config: { ...CONFIG, mwh: 200, duration_h: 4 },
      prices: sineYear(), yearIndex: 1, reserve: RESERVE, sc,
      opts: { total_cd: 1.0, keepHours: false },
    });
    // A 4 h asset can hold the same reserve headroom with far more energy to
    // spare, so it should sustain a higher committed share.
    expect(long.commitment.avg_reserve_share).toBeGreaterThan(short.commitment.avg_reserve_share);
  });
});

describe('activation energy comes from the canonical anchors', () => {
  it('scales with mwh_per_mw_yr, not with act_rate', () => {
    const r = run(sineYear(), { keepHours: false });
    // aFRR throughput must equal the anchor applied pro rata to committed MW.
    const expected = (sc.mwh_per_mw_yr_afrr * r.commitment.avg_mw_afrr * r.meta.hours) / r.meta.hours;
    expect(r.energy.throughput_by_product_mwh.afrr).toBeCloseTo(expected, 3);
  });

  it('pro-rates annual anchors against a year, not against the simulated window', () => {
    // The bug this pins: dividing the annual anchor by `prices.length` gave a
    // 90-day run a full year's activation energy, 4× too much. Phase 36.B3
    // replays day by day, so it would have inherited the error silently.
    const full = run(sineYear(8760), { keepHours: false });
    const quarter = run(sineYear(24 * 90), { keepHours: false });
    const perHourFull = full.energy.activation_mwh / 8760;
    const perHourQuarter = quarter.energy.activation_mwh / (24 * 90);
    // Same asset, same prices shape, same commitment — the per-hour activation
    // energy must not depend on how long a window was simulated.
    expect(perHourQuarter).toBeCloseTo(perHourFull, 2);
  });

  it('is unaffected by changing act_rate', () => {
    const base = run(sineYear(), { keepHours: false });
    const bumped = simulateYear({
      config: CONFIG, prices: sineYear(), yearIndex: 1, reserve: RESERVE,
      // act_rate_* is a revenue coefficient. If it moves activation ENERGY, the
      // engine has confused the two calibrations again.
      sc: { ...sc, act_rate_afrr: sc.act_rate_afrr * 3, act_rate_mfrr: sc.act_rate_mfrr * 3 },
      opts: { total_cd: 1.0, keepHours: false },
    });
    expect(bumped.energy.activation_mwh).toBeCloseTo(base.energy.activation_mwh, 6);
  });
});

describe('charging-cost attribution', () => {
  it('splits charging cost across both ways energy leaves, and still sums to gross', () => {
    const r = run(sineYear(), { keepHours: false });
    const a = r.revenue.attributed;
    expect(a.check_sums_to_gross).toBeCloseTo(r.revenue.gross, 6);
    expect(a.cost_to_activation + a.cost_to_arbitrage).toBeCloseTo(r.revenue.charging_cost, 6);
    // Activation energy is not free: it carries its share of what was paid to
    // put that energy into the battery.
    expect(a.cost_to_activation).toBeGreaterThan(0);
    expect(a.activation_net).toBeLessThan(r.revenue.activation);
  });
});

describe('round-trip profitability guard', () => {
  it('does not buy energy the day cannot sell at a profit', () => {
    // A flat-ish day: the spread never covers the round-trip loss, so a policy
    // that charges on the cheap quartile alone would book a guaranteed loss.
    const flat = Array.from({ length: 24 * 30 }, (_, h) => 100 + (h % 24) * 0.1);
    const r = run(flat);
    expect(r.energy.charged_mwh).toBe(0);
    expect(r.revenue.charging_cost).toBe(0);
  });

  it('still trades when the spread clearly covers the round trip', () => {
    const wide = Array.from({ length: 24 * 30 }, (_, h) => (h % 24 < 8 ? 20 : h % 24 < 16 ? 200 : 100));
    const r = run(wide);
    expect(r.energy.charged_mwh).toBeGreaterThan(0);
    expect(r.energy.discharged_mwh).toBeGreaterThan(0);
  });
});

describe('negative prices', () => {
  it('charges in negative hours but books the energy at €0, never as income', () => {
    // Alternating deeply negative and high hours: charging must happen, and the
    // charging cost must never go below zero.
    const prices = Array.from({ length: 24 * 60 }, (_, h) => (h % 24 < 12 ? -30 : 120));
    const r = run(prices);
    expect(r.activity.negative_price_charge_hours).toBeGreaterThan(0);
    expect(r.revenue.charging_cost).toBeGreaterThanOrEqual(0);
    // Arbitrage revenue in a negative hour is booked at exactly zero, so the
    // total arbitrage line equals the discharge income alone.
    for (const row of rowsOf(r)) {
      if (row.action === 'charge' && row.price < 0) expect(row.rev_arbitrage).toBe(-0);
    }
  });

  it('never discharges at a negative price', () => {
    const prices = Array.from({ length: 24 * 60 }, (_, h) => (h % 24 < 12 ? -50 : -5));
    const r = run(prices);
    for (const row of rowsOf(r)) {
      if (row.action === 'discharge') expect(row.price).toBeGreaterThan(0);
    }
  });
});

describe('cycle-budget throttle', () => {
  it('engages when the pace would breach the cap, and suppresses only merchant cycling', () => {
    // A very tight cap forces the governor on almost immediately.
    const r = run(sineYear(24 * 90), { warranty_efc_yr: 5 });
    const loose = run(sineYear(24 * 90), { warranty_efc_yr: 10000 });
    expect(r.cycles.throttled_hours).toBeGreaterThan(0);
    // Merchant cycling is what the throttle can reach, and it is cut hard.
    expect(r.cycles.efc_merchant).toBeLessThan(loose.cycles.efc_merchant * 0.2);
    expect(r.energy.discharged_mwh).toBeLessThan(loose.energy.discharged_mwh);
    // The contracted stack is never directly throttled — capacity revenue keeps
    // accruing on whatever MW the asset can still support.
    expect(r.revenue.capacity).toBeGreaterThan(0);
  });

  it('starves reserve commitment as a second-order effect, and does not hide it', () => {
    // A real coupling, not a defect: reserve commitment requires SoC headroom,
    // and SoC is maintained by cycling. Throttle the cycling and the asset can
    // no longer hold the state of charge its commitments need, so contracted
    // revenue falls too — even though nothing throttles it directly.
    //
    // This is why the throttle is a backstop rather than an operating strategy.
    // On the reference asset against real 2024 prices it never engages
    // (221 EFC against a 730 cap). Carried to 36.B6's known-limitations list.
    const tight = run(sineYear(), { warranty_efc_yr: 5, keepHours: false });
    const loose = run(sineYear(), { warranty_efc_yr: 10000, keepHours: false });
    expect(tight.commitment.avg_mw_total).toBeLessThan(loose.commitment.avg_mw_total);
    expect(tight.cycles.efc_contracted).toBeLessThan(loose.cycles.efc_contracted);
  });

  it('does not flag a contracted breach when the cap is realistic', () => {
    const r = run(sineYear(), { warranty_efc_yr: DEFAULT_WARRANTY_EFC_YR, keepHours: false });
    expect(r.cycles.breached_by_contracted).toBe(false);
    expect(r.cycles.efc_used).toBeLessThanOrEqual(DEFAULT_WARRANTY_EFC_YR);
  });

  it('leaves the throttle off when the cap is comfortable', () => {
    const r = run(sineYear(24 * 90), { warranty_efc_yr: 10000 });
    expect(r.cycles.throttled_hours).toBe(0);
  });
});

describe('availability', () => {
  it('removes the scenario haircut as one planned block plus scattered forced outages', () => {
    const a = buildAvailability(8760, 0.97, 12345);
    const down = a.mask.filter((x) => !x).length;
    expect(down).toBe(Math.round(8760 * 0.03));
    expect(a.planned_hours).toBeGreaterThan(0);
    expect(a.forced_hours).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const a = buildAvailability(8760, 0.97, 999);
    const b = buildAvailability(8760, 0.97, 999);
    expect(a.mask).toEqual(b.mask);
  });

  it('earns nothing in an unavailable hour', () => {
    const r = run(sineYear());
    for (const row of rowsOf(r)) {
      if (row.available === false) {
        expect(row.rev_capacity ?? 0).toBe(0);
        expect(row.mw_afrr).toBe(0);
      }
    }
  });
});

describe('golden day — hand-computed', () => {
  // A 24-hour shape with an unmistakable trough and peak, run with reserves
  // switched off entirely so the merchant arithmetic is checkable on paper.
  const NO_RESERVE = {
    cap_price: { fcr: 0, afrr: 0, mfrr: 0 },
    act_price: { fcr: 0, afrr: 0, mfrr: 0 },
    mwh_per_mw_yr: { fcr: 0, afrr: 0, mfrr: 0 },
    acceptance: { fcr: 0, afrr: 0, mfrr: 0 },
    avail_mw: { fcr: 0, afrr: 0, mfrr: 0 },
  };

  // Eight hours at each of three prices. The thresholds are the 25th and 75th
  // percentile by index — `sorted[floor(24 × 0.25)]` = `sorted[6]` = 10 and
  // `sorted[18]` = 200 — so charge, hold and discharge bands land exactly on
  // the three price levels. (An earlier 6/6/12 shape put `sorted[6]` on the
  // middle price, which made the charge threshold 100 and the test wrong rather
  // than the engine.)
  const shape = [
    10, 10, 10, 10, 10, 10, 10, 10,
    200, 200, 200, 200, 200, 200, 200, 200,
    100, 100, 100, 100, 100, 100, 100, 100,
  ];

  it('charges in the cheap quartile and discharges in the expensive quartile', () => {
    const r = simulateYear({
      config: CONFIG, prices: shape, yearIndex: 1, reserve: NO_RESERVE, sc,
      opts: { total_cd: 1.0, seed: 1, drr_active: true },
    });
    const rows = rowsOf(r).filter((x) => x.available);
    // 25th percentile of the shape is 10, 75th is 200 — so hours priced 10 are
    // charge candidates, hours priced 200 are discharge candidates, and the
    // €100 block is hold.
    for (const row of rows) {
      if (row.action === 'charge') expect(row.price).toBeLessThanOrEqual(10);
      if (row.action === 'discharge') expect(row.price).toBeGreaterThanOrEqual(200);
      if (row.price === 100) expect(row.action).toBe('hold');
    }
  });

  it('prices the merchant legs exactly', () => {
    const r = simulateYear({
      config: CONFIG, prices: shape, yearIndex: 1, reserve: NO_RESERVE, sc,
      opts: { total_cd: 1.0, seed: 1, drr_active: true },
    });
    let charged = 0, discharged = 0, cost = 0, income = 0;
    for (const row of rowsOf(r)) {
      charged += row.mwh_charge ?? 0;
      discharged += row.mwh_discharge ?? 0;
      if (row.action === 'charge') cost += (row.mwh_charge ?? 0) * row.price;
      if (row.action === 'discharge') income += (row.mwh_discharge ?? 0) * row.price;
    }
    expect(r.revenue.charging_cost).toBeCloseTo(cost, 6);
    expect(r.revenue.arbitrage).toBeCloseTo(income - cost, 6);
    // Every MWh discharged came out of storage that was charged at 10 and sold
    // at 200, so the gross margin per MWh delivered is unambiguous.
    if (discharged > 0) {
      expect(income / discharged).toBeCloseTo(200, 6);
      expect(cost / charged).toBeCloseTo(10, 6);
    }
  });

  it('fills the usable window and no further', () => {
    const r = simulateYear({
      config: CONFIG, prices: shape, yearIndex: 1, reserve: NO_RESERVE, sc,
      opts: { total_cd: 1.0, seed: 1, drr_active: true },
    });
    const socs = rowsOf(r).filter((x) => x.available).map((x) => x.soc);
    const usable = r.meta.usable_mwh;
    // Eight cheap hours at 50 MW can move 400 MWh into a 94.8 MWh window, so
    // the ceiling must bind exactly rather than overshoot.
    expect(Math.max(...socs)).toBeLessThanOrEqual(usable * SOC_MAX_FRAC + 1e-6);
    expect(Math.max(...socs)).toBeCloseTo(usable * SOC_MAX_FRAC, 4);
  });
});

describe('year-over-year physics', () => {
  it('derates usable energy and RTE as the asset ages', () => {
    const y1 = simulateYear({ config: CONFIG, prices: sineYear(), yearIndex: 1, reserve: RESERVE, sc, opts: { total_cd: 1.0, keepHours: false } });
    const y10 = simulateYear({ config: CONFIG, prices: sineYear(), yearIndex: 10, reserve: RESERVE, sc, opts: { total_cd: 1.0, keepHours: false } });
    expect(y10.meta.soh).toBeLessThan(y1.meta.soh);
    expect(y10.meta.rte).toBeLessThan(y1.meta.rte);
    expect(y10.meta.usable_mwh).toBeLessThan(y1.meta.usable_mwh);
  });

  it('holds the energy balance in a late year too', () => {
    const y15 = simulateYear({ config: CONFIG, prices: sineYear(), yearIndex: 15, reserve: RESERVE, sc, opts: { total_cd: 1.0, keepHours: false } });
    expect(y15.energy.balance_error_rel).toBeLessThan(1e-9);
    expect(y15.violations).toEqual([]);
  });
});
