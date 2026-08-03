/**
 * Phase 38.6 — the MW partition: identity tests.
 *
 * The engine sells the same megawatts twice. `RESERVE_PRODUCTS` shares sum to
 * exactly 1.00 of P_max (`fetch-s1.js:1777-1781`) while the day-ahead line takes
 * `trading_fraction` of the SAME asset again, pinned at its 0.70 ceiling in
 * every year of every public configuration. Total committed: 1.70 × P_max.
 *
 * These assert on the PAYLOAD, never on internals, and each is proven failable
 * by inject-then-revert (see the 38.6 commit body for the outputs).
 */
import { describe, it, expect } from 'vitest';
import { publicParamMatrix, loadFixtureKV } from '../../tools/consultancy/regression-reference.mjs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { computeRevenueV7, RESERVE_PRODUCTS } from '../fetch-s1.js';

const kv = loadFixtureKV();
const MATRIX = publicParamMatrix();
const REF = MATRIX.find((m: Any) => m.id === 'dur=4h capex=mid cod=2027 scenario=base') ?? MATRIX[0];

const run = (params: Any, mode?: string) =>
  computeRevenueV7(mode ? { ...params, mw_partition: mode } : params, kv) as Any;

/** The per-year rows the assumptions panel publishes. */
const yearsOf = (r: Any): Any[] => r.years ?? [];

describe('38.6 — the flag defaults to current behaviour', () => {
  it('is a no-op unless explicitly selected, including for unknown values', () => {
    for (const bogus of [undefined, null, '', 'partiton', 'true', 1]) {
      const a = JSON.stringify(run(REF.params), (k, v) => (k === 'timestamp' ? undefined : v));
      const b = JSON.stringify(run({ ...REF.params, mw_partition: bogus }),
        (k, v) => (k === 'timestamp' ? undefined : v));
      expect(b).toBe(a);
    }
  });

  it('does not add fields to the payload while it is off', () => {
    const y = yearsOf(run(REF.params))[0];
    expect(y).toBeDefined();
    expect(y.arb_share_used).toBeUndefined();
    expect(y.mw_partition).toBeUndefined();
  });
});

describe('38.6 — the power identity', () => {
  it('FAILS today by construction: reserve shares alone are the whole asset', () => {
    const sum = Object.values(RESERVE_PRODUCTS).reduce((a: number, p: Any) => a + p.share, 0);
    // 0.16 + 0.34 + 0.50. Not "about" 1.00 — exactly it.
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('FAILS today: reserve commitment + day-ahead commitment exceeds P_max', () => {
    for (const { params } of MATRIX) {
      const reserveSum = Object.values(RESERVE_PRODUCTS).reduce((a: number, p: Any) => a + p.share, 0);
      for (const y of yearsOf(run(params))) {
        // `trading_fraction` is what the DA energy seams spend when the flag is
        // off. This documents the violation rather than asserting it is fine.
        expect(reserveSum + y.trading_fraction).toBeGreaterThan(1.0);
      }
    }
  });

  it('the DAY-AHEAD side of the identity closes under the partition', () => {
    // The share the DA energy seams spend can never exceed availability, which
    // is the most the asset can commit to anything in a given hour.
    for (const { params, id } of MATRIX) {
      for (const y of yearsOf(run(params, 'partition'))) {
        expect(y.arb_share_used, id).toBeDefined();
        expect(y.arb_share_used, `${id} yr ${y.yr}`).toBeLessThanOrEqual(0.95 + 1e-9);
        expect(y.arb_share_used, `${id} yr ${y.yr}`).toBeGreaterThan(0);
      }
    }
  });

  it('RECORDS that the RESERVE side of the identity is still open', () => {
    // Honest negative result, and the most important line in this file.
    //
    // `computeThroughputBreakdown` (:1741-1743) allocates reserve MWh at the
    // RAW shares — 0.16 + 0.34 + 0.50 = 1.00 of nameplate — as though every
    // product were committed every hour. `computeEffectiveArbPct` (:3602)
    // meanwhile treats aFRR and mFRR as committed only ~75 % and ~80 % of the
    // time, which is the whole reason arbitrage gets any MW-hours at all.
    //
    // The two disagree. So the partition as implemented closes the day-ahead
    // side of `Sigma committed + DA <= P_max` and leaves the reserve side
    // claiming the entire asset:
    //
    //     before   1.00 (reserve) + 0.70  (DA) = 1.70 x P_max
    //     after    1.00 (reserve) + 0.115 (DA) = 1.115 x P_max
    //
    // Better, not closed. Closing it needs the reserve throughput allocation
    // moved onto the same time-weighted basis, which moves cycle accounting and
    // therefore degradation — a second, larger change, deliberately not made
    // here. This spec fails the day someone believes the identity holds.
    const reserveSum = Object.values(RESERVE_PRODUCTS).reduce((a: number, p: Any) => a + p.share, 0);
    for (const { params, id } of MATRIX) {
      for (const y of yearsOf(run(params, 'partition'))) {
        expect(reserveSum + y.arb_share_used, `${id} yr ${y.yr}`).toBeGreaterThan(1.0);
        // ...but materially better than before.
        expect(reserveSum + y.arb_share_used, `${id} yr ${y.yr}`).toBeLessThan(1.20);
      }
    }
  });

});

describe('38.6 — the energy identity', () => {
  it('carries a day-ahead term under the partition and none without it', () => {
    const on = yearsOf(run(REF.params, 'partition'))[0];
    expect(on.da_energy_req_mwh_per_mw).toBeGreaterThan(0);
    expect(on.total_energy_req_mwh_per_mw).toBeCloseTo(
      on.reserve_energy_req_mwh_per_mw + on.da_energy_req_mwh_per_mw, 6);
  });

  it('reserved + day-ahead energy stays inside the usable reservoir', () => {
    for (const { params, id } of MATRIX) {
      for (const y of yearsOf(run(params, 'partition'))) {
        expect(y.total_energy_req_mwh_per_mw, `${id} yr ${y.yr}`)
          .toBeLessThanOrEqual(y.usable_mwh_per_mw + 1e-9);
      }
    }
  });

  it('RECORDS that the constraint still never binds at 2h or 4h', () => {
    // Honest negative result. `scale_energy` is pinned at 1.0 both with and
    // without the day-ahead term, so adding the term corrected the identity's
    // FORM without changing any number. If a shorter duration ever ships, or
    // the reserve reservoir requirement rises, this spec is where it shows up.
    for (const { params } of MATRIX) {
      for (const y of yearsOf(run(params, 'partition'))) {
        expect(y.scale_energy).toBe(1);
      }
    }
  });
});

describe('38.6 — the dimensional guard at the seam', () => {
  it('the share spent on MWh is the MW-hour share, not the EUR/EUR one', () => {
    for (const { params, id } of MATRIX) {
      const r = run(params, 'partition');
      for (const y of yearsOf(r)) {
        expect(y.arb_share_basis, id).toBe('mw_hours_physical');
        // The class of bug this phase exists to fix: a EUR-derived ratio
        // multiplying an MWh quantity. `trading_fraction` is T/(T+R) where both
        // are EUR per MW-hour of value, so it is dimensionless EUR/EUR.
        expect(y.arb_share_used, id).not.toBeCloseTo(y.trading_fraction, 2);
      }
    }
  });

  it('the share the revenue path uses equals the physical share the engine publishes', () => {
    // THIS is the gate whose absence let a ~6x disagreement live in production.
    // `effective_arb_pct` has always been computed and published; the revenue
    // path always spent something else.
    //
    // Compared on `base`-scenario configurations only, and that is not a
    // convenience: `base_year` is computed with REVENUE_SCENARIOS.base by
    // design, because observed data is scenario-independent (:2199-2204). Under
    // `conservative` and `stress` the run's own `sc.avail` differs, so the two
    // numbers SHOULD differ — 0.1374 vs 0.139 on the conservative 2h configs.
    // Asserting equality across all scenarios would have asserted a bug.
    const baseConfigs = MATRIX.filter((m: Any) => m.params.scenario === 'base');
    expect(baseConfigs.length).toBeGreaterThan(0);
    for (const { params, id } of baseConfigs) {
      const r = run(params, 'partition');
      const published = r.base_year?.time_model?.effective_arb_pct;
      expect(published, id).toBeGreaterThan(0);
      for (const y of yearsOf(r)) {
        expect(y.arb_share_used, `${id} yr ${y.yr}`).toBeCloseTo(published, 3);
      }
    }
  });

  it('stays within a scenario-sized distance on the non-base scenarios', () => {
    for (const { params, id } of MATRIX.filter((m: Any) => m.params.scenario !== 'base')) {
      const r = run(params, 'partition');
      const published = r.base_year.time_model.effective_arb_pct;
      for (const y of yearsOf(r)) {
        expect(Math.abs(y.arb_share_used - published), `${id} yr ${y.yr}`).toBeLessThan(0.02);
      }
    }
  });

  it('measures the disagreement that exists WITHOUT the partition', () => {
    const r = run(REF.params);
    const published = r.base_year.time_model.effective_arb_pct;
    const spent = yearsOf(r)[0].trading_fraction;
    expect(spent / published).toBeGreaterThan(4); // ~6x at current market state
  });
});

describe('38.6 — no double discount', () => {
  it('bid acceptance haircuts reserve REVENUE; the partition allocates DA ENERGY', () => {
    // The two act on different quantities, so applying both is not a double
    // discount. Shown rather than argued: the partition changes the day-ahead
    // energy line and leaves the balancing line where it was.
    const c = run(REF.params), p = run(REF.params, 'partition');
    const cy = yearsOf(c)[0], py = yearsOf(p)[0];
    // Balancing revenue is pinned to an OBSERVED base year through
    // `bal_calibration = by_balancing_per_mw / R_now`, so it must not move.
    expect(py.rev_bal).toBe(cy.rev_bal);
    // Trading revenue must move, and only by the share ratio.
    expect(py.rev_trd).toBeLessThan(cy.rev_trd);
    expect(py.rev_trd / cy.rev_trd).toBeCloseTo(py.arb_share_used / cy.trading_fraction, 3);
  });
});

describe('38.6 — FCR symmetry, recorded as NOT representable', () => {
  it('the model holds ONE MW pool, not an up pool and a down pool', () => {
    // FCR is symmetric: it consumes up-headroom and down-headroom at the same
    // time. That is only expressible against two directional budgets, and
    // RESERVE_PRODUCTS carries one undirected share per product — there is no
    // afrr_up/afrr_down split anywhere in it. So the two-direction identity
    // collapses to one line in this engine, and FCR symmetry is neither modelled
    // nor violated: it is unrepresentable. Asserted so that adding a directional
    // split is a deliberate, reviewed change rather than a silent one.
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS) as Any[]) {
      expect(Object.keys(prod).sort(), name).toEqual(['cap_fallback', 'dur_req_h', 'share']);
      expect(prod.share_up, name).toBeUndefined();
      expect(prod.share_down, name).toBeUndefined();
    }
  });
});
