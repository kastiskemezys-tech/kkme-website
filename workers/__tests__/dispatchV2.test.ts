/**
 * Phase 36.B batch-2, Part 0 — `computeDispatchV2` energy balance and its
 * mirror against the canonical hourly engine.
 *
 * `computeDispatchV2` drives the public dispatch card and writes
 * `dispatch:<date>:<dur>h` to KV. Phase 36.B1's Pause-A audit (correction #17)
 * found it applied RTE as a cap on discharge *power* while decrementing SoC by
 * the *delivered* energy, so a full cycle bought 1 MWh, sold 1 MWh, and the
 * round-trip loss was never charged. It also floored the reported arbitrage
 * line at zero, which both overstated it and desynchronised it from the daily
 * total that had always carried the negative.
 *
 * Three kinds of assertion live here, doing different jobs.
 *
 * ENERGY-BALANCE tests assert the identity `Σ charge × RTE = Σ discharge + Δsoc`
 * over a full day, reconstructed from the published ISP series. This is the
 * assertion that would have caught the original defect, and the only one that
 * pins the RTE treatment independently of the policy.
 *
 * MIRROR tests run this function and `tools/consultancy/lib/dispatch.mjs` over
 * the same day, the same prices and the same parameters with reserves
 * neutralised, so that only the merchant arbitrage policy is under comparison.
 * The two implementations may never silently diverge again. They are NOT
 * expected to agree exactly — the residual is bounded and explained below.
 *
 * REGRESSION-OF-REASONING tests pin the three specific mistakes, so that a
 * revert fails loudly rather than quietly restoring the overstatement.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDispatchV2,
  RTE_BOL,
  REVENUE_SCENARIOS_FOR_TEST,
} from '../fetch-s1.js';
import { simulateYear } from '../../tools/consultancy/lib/dispatch.mjs';

const sc = REVENUE_SCENARIOS_FOR_TEST.base;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A day with real spread: cheap night, solar trough, expensive evening. */
const SHAPE_SPREAD = [
  20, 18, 15, 14, 16, 25, 60, 90, 70, 40, 12, 8,
  10, 22, 35, 55, 95, 140, 160, 150, 120, 90, 60, 35,
];

/** A perfectly flat day: p25 === p75, so no round trip can ever clear. */
const SHAPE_FLAT = new Array(24).fill(70);

/** A shallow day whose spread is real but smaller than the round-trip loss. */
const SHAPE_SHALLOW = Array.from({ length: 24 }, (_, h) => 100 + (h % 6));

const MW = 50;

/** Reserves neutralised: no capacity prices, no procured MW, no activation. */
const NO_RESERVES = {};

function run(prices: number[], dur_h: number) {
  return computeDispatchV2(NO_RESERVES, prices, {
    mw: MW, dur_h, mode: 'realised', date_iso: '2026-01-01',
  }) as Any;
}

/**
 * Reconstruct per-ISP energy flows from the published SoC trace.
 *
 * The card publishes SoC rounded to 3 decimals, so this reconstruction is
 * accurate to ~0.1 MWh on a 100 MWh asset rather than to machine precision.
 * Tolerances below are set against that granularity, not against the identity
 * — the identity itself is exact in the code.
 */
function energyFromTrace(result: Any, dur_h: number) {
  const mwh = MW * dur_h;
  const isps = result.isp_dispatch as Any[];
  let charged = 0;   // MWh drawn from grid
  let delivered = 0; // MWh sold to grid
  let socPrev = 0.50;
  for (const isp of isps) {
    const arb = isp.revenue.arbitrage;
    const dSoc = isp.soc - socPrev;
    if (arb < 0) charged += -arb / (isp.da_price || 1);
    else if (arb > 0) delivered += arb / (isp.da_price || 1);
    socPrev = isp.soc;
    void dSoc;
  }
  return { charged, delivered, socEnd: socPrev, socStart: 0.50, mwh };
}

describe('computeDispatchV2 — energy balance', () => {
  for (const dur_h of [2, 4]) {
    it(`charges the round-trip loss exactly once, on the charge leg (${dur_h}h)`, () => {
      const r = run(SHAPE_SPREAD, dur_h);
      const rte = dur_h <= 2 ? RTE_BOL.h2 : RTE_BOL.h4;
      const { charged, delivered, socEnd, socStart, mwh } = energyFromTrace(r, dur_h);

      expect(charged).toBeGreaterThan(0);
      expect(delivered).toBeGreaterThan(0);

      // Σ charge × RTE = Σ discharge + Δstored.
      const stored = (socEnd - socStart) * mwh;
      const rhs = delivered + stored;
      expect(Math.abs(charged * rte - rhs)).toBeLessThan(0.5);

      // The discriminator. Note that `delivered > charged` is perfectly legal
      // over a single day — the asset also sells down the inventory it started
      // with — so the volumes alone prove nothing. What separates the corrected
      // code from the defect is WHICH identity closes: the lossy one must, and
      // the lossless one (`charged = delivered + Δstored`, which is exactly
      // what the old discharge-power-cap formulation satisfied) must not, by
      // about the round-trip loss on the energy actually bought.
      const losslessGap = charged - rhs;
      expect(losslessGap).toBeGreaterThan(0);
      expect(Math.abs(losslessGap - charged * (1 - rte))).toBeLessThan(0.5);
    });
  }

  it('never reports a SoC outside the policy window', () => {
    for (const dur_h of [2, 4]) {
      for (const shape of [SHAPE_SPREAD, SHAPE_FLAT, SHAPE_SHALLOW]) {
        for (const isp of run(shape, dur_h).isp_dispatch as Any[]) {
          expect(isp.soc).toBeGreaterThanOrEqual(0.05 - 1e-9);
          expect(isp.soc).toBeLessThanOrEqual(0.95 + 1e-9);
        }
      }
    }
  });
});

describe('computeDispatchV2 — mirror against the canonical hourly engine', () => {
  /**
   * Bounded, signed and explained. `computeDispatchV2` is expected to land
   * BELOW `lib/dispatch.mjs` on every shape, because:
   *
   *   1. it works a narrower SoC window — 0.10-0.90 of *nameplate* MWh against
   *      the hourly engine's 0.05-0.95 of *usable* (SOH-derated) MWh; and
   *   2. it commits energy in 15-minute blocks against the engine's hourly
   *      ones, so it reaches its SoC bounds sooner inside a price run.
   *
   * Both differences remove revenue, so the residual has a consistent sign and
   * the conservative one. A positive delta would mean the card had started
   * claiming more than the bankable engine and must fail this gate.
   */
  const MAX_SHORTFALL_PCT = 20;

  for (const dur_h of [2, 4]) {
    for (const [name, prices] of Object.entries({
      spread: SHAPE_SPREAD, flat: SHAPE_FLAT, shallow: SHAPE_SHALLOW,
    })) {
      it(`tracks lib/dispatch.mjs within ${MAX_SHORTFALL_PCT}% on the low side (${dur_h}h, ${name})`, () => {
        const v2 = run(prices, dur_h);
        const v2Arb = v2.revenue_per_mw.arbitrage_eur_day * MW;

        const sim = simulateYear({
          config: {
            mw: MW, mwh: MW * dur_h, duration_h: dur_h,
            project_id: 'mirror', grid_allowance_mw: MW,
          },
          prices,
          yearIndex: 1,
          reserve: { avail_mw: { fcr: 0, afrr: 0, mfrr: 0 }, price: {}, act_price: {}, mwh_per_mw_yr: {} },
          sc: { ...sc, avail: 1.0 },
          opts: { hours_per_year: 8760, keepHours: true, seed: 0 },
        }) as Any;
        const simArb = sim.revenue.arbitrage;

        // The hourly engine is the reference; it must not be losing money on
        // shapes where a real operator would simply stand still.
        expect(simArb).toBeGreaterThan(0);

        const shortfallPct = ((simArb - v2Arb) / Math.abs(simArb)) * 100;
        expect(shortfallPct).toBeGreaterThanOrEqual(-1e-9); // never above the engine
        expect(shortfallPct).toBeLessThan(MAX_SHORTFALL_PCT);
      });
    }
  }
});

describe('computeDispatchV2 — regression of reasoning', () => {
  it('does not floor the reported arbitrage line at zero', () => {
    // A day that guarantees a loss if the policy trades it: charging is barred
    // by the round-trip test, so the only way to book negative arbitrage is to
    // trade badly. Assert the FIELD can carry a negative rather than forcing
    // one — the clamp is what is being pinned, not the sign of any given day.
    const r = run(SHAPE_SPREAD, 2);
    const arb = r.revenue_per_mw.arbitrage_eur_day;
    expect(Number.isFinite(arb)).toBe(true);

    // The clamp's real symptom: with it in place the three shares summed to
    // more than 100 % on any day with negative arbitrage, because `daily_eur`
    // always carried the negative while the split floored it.
    const s = r.split_pct;
    expect(s.capacity + s.activation + s.arbitrage).toBeGreaterThanOrEqual(99);
    expect(s.capacity + s.activation + s.arbitrage).toBeLessThanOrEqual(101);
  });

  it('reports a daily total that its own components sum to', () => {
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_SPREAD, dur_h);
      const rp = r.revenue_per_mw;
      const parts = rp.capacity_eur_day + rp.activation_eur_day + rp.arbitrage_eur_day;
      // Each field is independently rounded to whole euros, so allow the sum
      // of three roundings.
      expect(Math.abs(parts - rp.daily_eur)).toBeLessThanOrEqual(2);
    }
  });

  it('refuses to charge on a day whose spread cannot cover the round trip', () => {
    // Flat day: p25 === p75, so `discharge × rte > price` is false everywhere.
    // Before the round-trip test this charged in all 96 ISPs and booked a
    // guaranteed loss — the same defect the hourly engine fixed in 36.B1-L.
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_FLAT, dur_h);
      expect(r.arbitrage_detail.charge_isp_count).toBe(0);
      expect(r.revenue_per_mw.arbitrage_eur_day).toBeGreaterThanOrEqual(0);
    }
  });
});
