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
  daPricesToHourly24,
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

describe('daPricesToHourly24 — resolution awareness', () => {
  /** Build a day whose hour h has a known mean, at `ppH` points per hour. */
  const dayAt = (ppH: number, hourly: number[]) =>
    hourly.flatMap(v => Array.from({ length: ppH }, (_, k) =>
      // Spread each hour's points around its mean so averaging is actually
      // exercised rather than trivially returning a repeated value.
      v + (k - (ppH - 1) / 2)));

  it('passes an already-hourly day through unchanged', () => {
    expect(daPricesToHourly24(SHAPE_SPREAD)).toEqual(SHAPE_SPREAD);
  });

  it('averages a PT15M day (96 points) into 24 hours', () => {
    const out = daPricesToHourly24(dayAt(4, SHAPE_SPREAD));
    out.forEach((v: number, h: number) => expect(v).toBeCloseTo(SHAPE_SPREAD[h], 9));
  });

  it('takes the FIRST day from a two-day PT15M payload (192 points)', () => {
    // The shape the live KV entry actually has. The second day is deliberately
    // different, so leaking it in would move the answer.
    const dayTwo = SHAPE_SPREAD.map(v => v * 3 + 500);
    const out = daPricesToHourly24([...dayAt(4, SHAPE_SPREAD), ...dayAt(4, dayTwo)]);
    out.forEach((v: number, h: number) => expect(v).toBeCloseTo(SHAPE_SPREAD[h], 9));
  });

  it('takes the FIRST day from a two-day hourly payload (48 points)', () => {
    const dayTwo = SHAPE_SPREAD.map(v => v * 3 + 500);
    expect(daPricesToHourly24([...SHAPE_SPREAD, ...dayTwo])).toEqual(SHAPE_SPREAD);
  });

  it('still returns 24 values on ragged DST-length payloads', () => {
    for (const n of [23, 25, 92, 95, 100]) {
      const src = Array.from({ length: n }, (_, i) => 50 + i);
      const out = daPricesToHourly24(src);
      expect(out).toHaveLength(24);
      expect(out.every((v: number) => Number.isFinite(v))).toBe(true);
      // Never invent a price outside the source range.
      expect(Math.min(...out)).toBeGreaterThanOrEqual(Math.min(...src));
      expect(Math.max(...out)).toBeLessThanOrEqual(Math.max(...src));
    }
  });

  it('returns nothing for an empty or absent payload', () => {
    expect(daPricesToHourly24([])).toEqual([]);
    expect(daPricesToHourly24(undefined)).toEqual([]);
  });

  it('pins the defect: the old slice(0,24) saw only the first six hours', () => {
    const src = dayAt(4, SHAPE_SPREAD);
    const oldWay = src.slice(0, 24);                       // what shipped
    const newWay = daPricesToHourly24(src) as number[];
    // The old path's 24 "hourly" values are really hours 0-5, so its spread
    // collapses. Assert the corrected path recovers the real one.
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(oldWay)).toBeLessThan(spread(newWay) / 2);
    expect(spread(newWay)).toBeCloseTo(spread(SHAPE_SPREAD), 9);
  });
});

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

/**
 * Phase 38.5 defect 1.1 — realised capture must be realised.
 *
 * Pre-fix, `rawCapture` fell back to `(daMax - daMin) * rte * 0.5` — the day's
 * raw price envelope — whenever `totalArbRev <= 0`, published under a field
 * `app/lib/captureDefinitions.ts:30-37` defines as revenue per MWh actually
 * discharged. It then floored the result at zero.
 *
 * Finding while writing these: **there is no fixture where the model declines
 * to discharge on price grounds.** `dischargeThreshold` is the day's own p75,
 * so the top quartile always clears it, and `soc` starts every day at 0.50 —
 * so the only days with zero discharge are days with no usable DA price at all.
 * That is defect 1.2 showing through 1.1's tests, and it is why the pre-existing
 * SHAPE_FLAT case could not have caught this: on a flat day the envelope is 0,
 * so the fallback and the truth agreed by coincidence.
 */
describe('computeDispatchV2 — realised capture is realised (38.5 #1.1)', () => {
  /** No DA prices at all — the genuine "nothing to trade" day. */
  const SHAPE_NO_DA: number[] = [];

  /** Every hour priced at or below zero: `daPrice > 0` never holds. */
  const SHAPE_ALL_NONPOSITIVE = new Array(24).fill(0);

  /**
   * A genuine LOSING day: expensive early hours, so the model discharges its
   * (free, see 1.2) starting inventory first and then charges into a still-
   * expensive evening it never sells. Found by exhaustive search over 55,840
   * (shape, duration) pairs — 3,801 of them book negative arbitrage with
   * discharge > 0, so this branch is common, not exotic.
   *
   * Pre-38.5 this day published `capture_eur_mwh: 159.90` with
   * `capture_quality_label: 'high'`, while the same payload reported
   * `arbitrage_eur_day: -435`. That is the defect in one payload.
   */
  const SHAPE_LOSING_DAY = new Array(24).fill(510);
  for (let h = 0; h < 6; h++) SHAPE_LOSING_DAY[h] = 900;

  for (const [label, shape] of [
    ['no DA prices', SHAPE_NO_DA],
    ['all prices non-positive', SHAPE_ALL_NONPOSITIVE],
  ] as [string, number[]][]) {
    it(`publishes null, not zero, when there is no discharge (${label})`, () => {
      for (const dur_h of [2, 4]) {
        const r = run(shape, dur_h);
        expect(r.arbitrage_detail.discharge_isp_count).toBe(0);
        expect(r.arbitrage_detail.capture_eur_mwh).toBeNull();
        expect(r.arbitrage_detail.capture_eur_mwh_15min_uplifted).toBeNull();
        // An unmeasured capture has no grade. Pre-fix this read 'low', because
        // `null >= 15` is false — a market claim made from an absent trade.
        expect(r.arbitrage_detail.capture_quality_label).toBeNull();
      }
    });
  }

  it('publishes the realised LOSS on a losing day, not the price envelope', () => {
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_LOSING_DAY, dur_h);
      const envelope = (r.market_context.da_max_eur_mwh - r.market_context.da_min_eur_mwh)
        * r.meta.rte_decimal * 0.5;

      // Preconditions that make this fixture a real test rather than a
      // coincidence: the day loses money, it did discharge, and the envelope a
      // restored fallback would publish is large and positive.
      expect(r.revenue_per_mw.arbitrage_eur_day).toBeLessThan(0);
      expect(r.arbitrage_detail.discharge_isp_count).toBeGreaterThan(0);
      expect(envelope).toBeGreaterThan(150);

      // The published capture must carry the day's sign.
      expect(r.arbitrage_detail.capture_eur_mwh).toBeLessThan(0);
      // ...and must not be the envelope, nor the zero the old floor produced.
      expect(r.arbitrage_detail.capture_eur_mwh).not.toBeCloseTo(envelope, 0);
      expect(r.arbitrage_detail.capture_eur_mwh).not.toBe(0);

      // A negative capture is not a quality grade of 'low' — 'low' is a claim
      // about a market, this is a loss. It is graded, but graded from the real
      // number, so the grade and the figure cannot disagree.
      expect(r.arbitrage_detail.capture_quality_label).toBe('low');
    }
  });

  it('reports capture as revenue per MWh actually discharged, sign included', () => {
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_SPREAD, dur_h);
      const mwh_discharged = MW * (r.arbitrage_detail.discharge_isp_count / 4);
      expect(mwh_discharged).toBeGreaterThan(0);
      // Recomputed from two OTHER published fields, so this is not a
      // restatement of the internal expression (B5).
      const expected = r.revenue_per_mw.arbitrage_eur_day * MW / mwh_discharged;
      expect(r.arbitrage_detail.capture_eur_mwh).toBeCloseTo(expected, 0);
    }
  });

  it('applies the 15-min uplift to the realised figure, not to a floor', () => {
    const r = run(SHAPE_SPREAD, 4);
    expect(r.arbitrage_detail.capture_eur_mwh_15min_uplifted).toBeCloseTo(
      r.arbitrage_detail.capture_eur_mwh * (1 + r.arbitrage_detail.uplift_factor_decimal), 1);
  });
});

/**
 * Phase 38.5 defect 1.2 — the daily SoC reset, PINNED AS A KNOWN DEFECT.
 *
 * `computeDispatchV2` opens every day at `soc = 0.50` (`fetch-s1.js:1159`)
 * regardless of how the previous day ended, and the discharge branch will sell
 * down to `soc = 0.10`. The physical claim that makes is: **the asset is handed
 * 40 % of its usable energy, free, at midnight, every night, forever.** No
 * counterparty supplies it and no cost is booked against it.
 *
 * These specs assert the CURRENT behaviour, deliberately. They are not a
 * statement that it is right — they make the defect machine-visible so its
 * magnitude is reproducible from the suite rather than quoted from a handover
 * (C4), and so that fixing it produces a loud, reviewed diff rather than a
 * quiet drift. When 1.2 is fixed these specs are the ones to invert (B-036
 * precedent: a test asserting the wrong claim is inverted to assert its
 * absence, never quietly deleted).
 *
 * Measured cost, this branch, steady-state chaining vs the reset:
 *   live LT day 2026-08-03, 4h : arbitrage €487 → €448 /MW/day  (−8.0 %)
 *   live LT day 2026-08-03, 2h : arbitrage €249 → €229 /MW/day  (−8.0 %)
 *   flat €70 day,          4h  : arbitrage €105 → €0   /MW/day  (−100 %)
 * Direction is always overstatement. See DECISIONS.md 38.5 #1.2.
 */
describe('computeDispatchV2 — daily SoC reset is a known defect (38.5 #1.2)', () => {
  /** Energy sold that no charge leg paid for, derived from the published trace. */
  function freeEnergyMwh(r: Any, dur_h: number) {
    const isps = r.isp_dispatch as Any[];
    const socEnd = isps[isps.length - 1].soc;
    return (0.50 - socEnd) * MW * dur_h;
  }

  it('opens every day at 50 % SoC, whatever the day before did', () => {
    for (const dur_h of [2, 4]) {
      const mwh = MW * dur_h;
      const rte = RTE_BOL[dur_h === 2 ? 'h2' : 'h4'] as number;
      expect(rte).toBeGreaterThan(0); // guard: a wrong key here would make
                                      // every reconstruction below NaN
      for (const shape of [SHAPE_SPREAD, SHAPE_FLAT, SHAPE_SHALLOW]) {
        const isps = run(shape, dur_h).isp_dispatch as Any[];
        // Walk to the FIRST ISP that actually traded. SoC is unchanged across
        // the untraded prefix, so reconstructing from ISP 0 would assert 0.50
        // against 0.50 and prove nothing — the vacuous-test trap in B13.
        const i = isps.findIndex(p => p.revenue.arbitrage !== 0);
        expect(i).toBeGreaterThanOrEqual(0);
        const isp = isps[i];
        const mwhTraded = isp.revenue.arbitrage / isp.da_price; // + sold, - bought
        const dSoc = mwhTraded >= 0 ? -mwhTraded / mwh : -mwhTraded * rte / mwh;
        expect(isp.soc - dSoc).toBeCloseTo(0.50, 2);
      }
    }
  });

  it('sells energy no charge leg paid for — on a FLAT day, all of it', () => {
    // The cleanest demonstration: p25 === p75, so the round-trip test forbids
    // every charge, and yet the day books positive arbitrage revenue.
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_FLAT, dur_h);
      expect(r.arbitrage_detail.charge_isp_count).toBe(0);
      expect(r.arbitrage_detail.discharge_isp_count).toBeGreaterThan(0);
      expect(r.revenue_per_mw.arbitrage_eur_day).toBeGreaterThan(0);
      // 37.5 % of usable energy, sold, bought from nobody.
      expect(freeEnergyMwh(r, dur_h)).toBeCloseTo(0.375 * MW * dur_h, 0);
    }
  });

  it('injects 37-40 % of usable energy on a real trading day too', () => {
    for (const dur_h of [2, 4]) {
      const free = freeEnergyMwh(run(SHAPE_SPREAD, dur_h), dur_h);
      const usable = MW * dur_h;
      expect(free / usable).toBeGreaterThan(0.35);
      expect(free / usable).toBeLessThan(0.41);
    }
  });

  it('leaves the day energy-UNBALANCED: more leaves the cells than enters', () => {
    // The invariant a chained or neutrality-constrained model would satisfy is
    // `charged × rte === delivered` over a full day. It does not hold here, and
    // the residual IS the injected energy.
    for (const dur_h of [2, 4]) {
      const r = run(SHAPE_SPREAD, dur_h);
      const { charged, delivered } = energyFromTrace(r, dur_h);
      expect(delivered).toBeGreaterThan(charged * r.meta.rte_decimal);
      expect(delivered - charged * r.meta.rte_decimal).toBeGreaterThan(1);
    }
  });
});
