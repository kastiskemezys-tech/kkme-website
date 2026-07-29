/**
 * Phase 36.B4 — contracted-revenue overlay.
 *
 * A revenue floor is the one modelling construct where an off-by-one in the
 * comparison silently makes a project bankable. Three properties carry the whole
 * structure and each is pinned here rather than inspected in an output file:
 *
 *   BINDING      the floor binds exactly when the contracted share's merchant
 *                revenue is below the floor entitlement — never on the whole
 *                asset's revenue, never against an un-pro-rated year.
 *   ADDITIVITY   blended revenue is the weighted sum of a merchant share and a
 *                floored share, with no third term.
 *   TRUNCATION   raising the contracted share can only raise an exceedance
 *                level, and it must raise the tail more than the median — that
 *                asymmetry IS the floor's product.
 *
 * The integration tests then run the real engine result through the real bridge,
 * because the bridge's own tie-out assertions are what prove the overlay did not
 * break the client's 8-line derivation.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  normaliseContract, contractYear, applyContract, tollFeeUnderstatement,
  ContractError, levelKey, STANDARD_LEVELS, CONTRACT_MODES,
} from '../lib/contracted.mjs';
import { buildPercentiles } from '../lib/bootstrap.mjs';
import { loadConfig, loadEngine, runProject, PROJECTS_DIR } from '../engine.mjs';
import { loadFixtureKV } from '../regression-reference.mjs';
import { buildBridge, resolveCosts } from '../bridge.mjs';
import { derivedFloor } from '../run-contracted.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const NOTE = 'test counterparty basis';
const contract = (over: Any = {}) => normaliseContract({
  floor_eur_mw_yr: 100_000, contracted_pct_of_mw: 0.5, term_years: 10,
  counterparty_note: NOTE, ...over,
});

const year = (merchant_net: number, over: Any = {}) => contractYear({
  merchant_net, mw: 50, yr: 1, operational_months: 12, contract: contract(), ...over,
}) as Any;

// ── config validation ──────────────────────────────────────────────────────

describe('normaliseContract — a floor nobody can trace is not a floor', () => {
  it('demands a counterparty basis for any live contract (rule #3)', () => {
    expect(() => normaliseContract({
      floor_eur_mw_yr: 100_000, contracted_pct_of_mw: 0.5, term_years: 10,
    })).toThrow(ContractError);
  });

  it('does not demand one when the contract is inert', () => {
    const c = normaliseContract({ contracted_pct_of_mw: 0, term_years: 0 }) as Any;
    expect(c.active).toBe(false);
    expect(c.floor_eur_mw_yr).toBe(0);
  });

  it('rejects a share outside [0, 1] — it is a fraction, not a percentage', () => {
    expect(() => contract({ contracted_pct_of_mw: 50 })).toThrow(/FRACTION/);
    expect(() => contract({ contracted_pct_of_mw: -0.1 })).toThrow(ContractError);
  });

  it('rejects a negative floor and a fractional term', () => {
    expect(() => contract({ floor_eur_mw_yr: -1 })).toThrow(ContractError);
    expect(() => contract({ term_years: 10.5 })).toThrow(ContractError);
  });
});

// ── binding ────────────────────────────────────────────────────────────────

describe('the floor binds exactly when the contracted share is short of it', () => {
  // 50 MW × 50 % × €100 000 = €2 500 000 of entitlement.
  const ENTITLEMENT = 2_500_000;

  it('binds below, does not bind above, and is exact at the boundary', () => {
    // The contracted share is 50 % of merchant, so the crossing is at 2× the
    // entitlement of whole-asset revenue.
    expect(year(ENTITLEMENT * 2 - 1).floor_binds).toBe(true);
    expect(year(ENTITLEMENT * 2).floor_binds).toBe(false);      // equal is not short
    expect(year(ENTITLEMENT * 2 + 1).floor_binds).toBe(false);
  });

  it('compares against the CONTRACTED share, not the whole asset', () => {
    // €4M of whole-asset revenue clears a €2.5M floor comfortably — but only
    // €2M of it belongs to the contracted half, so the floor binds.
    const r = year(4_000_000);
    expect(r.merchant_contracted_share).toBe(2_000_000);
    expect(r.floor_binds).toBe(true);
    expect(r.contracted_revenue).toBe(ENTITLEMENT);
  });

  it('pro-rates the entitlement in a partial first year, so it is not measured against a year it did not have', () => {
    const full = year(4_000_000);
    const part = year(4_000_000, { operational_months: 7 });
    expect(part.floor_entitlement).toBeCloseTo(ENTITLEMENT * 7 / 12, 6);
    expect(part.floor_entitlement).toBeLessThan(full.floor_entitlement);
    // 7/12 of the floor is below 7/12 of nothing in particular — the point is
    // that a partial year cannot claim a full year's protection.
    expect(part.floor_binds).toBe(false);
  });

  it('pro-rates only operating year 1 — later partial years do not exist', () => {
    const y2 = year(4_000_000, { yr: 2, operational_months: 7 });
    expect(y2.floor_entitlement).toBe(ENTITLEMENT);
  });

  it('goes inert the year after the term ends', () => {
    expect(year(1_000, { yr: 10 }).in_term).toBe(true);
    const after = year(1_000, { yr: 11 });
    expect(after.in_term).toBe(false);
    expect(after.contracted_share).toBe(0);
    expect(after.floor_entitlement).toBe(0);
    expect(after.total).toBe(1_000);
    expect(after.uplift).toBe(0);
  });
});

// ── additivity ─────────────────────────────────────────────────────────────

describe('blended revenue is the weighted sum, with no third term', () => {
  const cases = [0, 1, 1_000, 2_499_999, 5_000_000, 12_000_000];

  it.each(cases)('holds the identity at merchant €%d', (merchant) => {
    const c = contract();
    const r = year(merchant);
    const expected =
      merchant * (1 - c.contracted_pct_of_mw) +
      Math.max(merchant * c.contracted_pct_of_mw, c.floor_eur_mw_yr * 50 * c.contracted_pct_of_mw);
    expect(r.total).toBeCloseTo(expected, 6);
    expect(r.merchant_free_share + r.contracted_revenue).toBeCloseTo(r.total, 6);
  });

  it.each(cases)('floor_only replaces the contracted share outright at €%d', (merchant) => {
    const r = year(merchant, { mode: 'floor_only' });
    expect(r.contracted_revenue).toBe(r.floor_entitlement);
    expect(r.total).toBeCloseTo(merchant * 0.5 + 2_500_000, 6);
  });

  it('blended never loses money and floor_only can', () => {
    expect(year(12_000_000).uplift).toBeGreaterThanOrEqual(0);
    expect(year(12_000_000, { mode: 'floor_only' }).uplift).toBeLessThan(0);
    expect(year(1_000, { mode: 'floor_only' }).uplift)
      .toBeCloseTo(year(1_000).uplift, 6); // identical while the floor binds
  });

  it('a 0 % share is an identity in both modes', () => {
    for (const mode of CONTRACT_MODES) {
      const r = year(7_000_000, { contract: contract({ contracted_pct_of_mw: 0 }), mode });
      expect(r.total).toBe(7_000_000);
      expect(r.uplift).toBe(0);
    }
  });
});

// ── truncation ─────────────────────────────────────────────────────────────

describe('the floor truncates the left tail, and that asymmetry is the product', () => {
  /** Five synthetic shape-year paths, wide spread, 20 flat years each. */
  const paths = (lifetimes: number[]) => Object.fromEntries(lifetimes.map((L, i) => [
    `y${i}`,
    {
      years: Array.from({ length: 20 }, (_, k) => ({
        yr: k + 1, cal_year: 2029 + k,
        rev_cap: 0, rev_act: 0, rev_bal: 0, rev_trd: L / 20, rev_gross: L / 20,
      })),
      project: { arb_energy_20yr: [] },
    },
  ]));

  const config = { project_id: 'synthetic', mw: 50, operational_months_y1: 12 };
  const SAMPLE = [60_000_000, 90_000_000, 120_000_000, 150_000_000, 200_000_000];

  const atLevel = (level: number) => {
    const c = normaliseContract({
      floor_eur_mw_yr: 100_000, contracted_pct_of_mw: level, term_years: 20,
      counterparty_note: NOTE,
    });
    const scaled = Object.fromEntries(Object.entries(paths(SAMPLE)).map(
      ([k, r]) => [k, applyContract(r as Any, config as Any, c, { mode: 'blended' })]));
    return buildPercentiles(scaled as Any).paths as Any;
  };

  it('every exceedance level is non-decreasing in contracted share', () => {
    const byLevel = STANDARD_LEVELS.map(atLevel);
    for (const key of ['p50', 'p75', 'p90', 'p99']) {
      for (let i = 1; i < byLevel.length; i++) {
        expect(byLevel[i][key].lifetime_eur, `${key} @ ${STANDARD_LEVELS[i]}`)
          .toBeGreaterThanOrEqual(byLevel[i - 1][key].lifetime_eur - 1e-6);
      }
    }
  });

  it('lifts the tail strictly more than the median — otherwise it is not a floor', () => {
    const base = atLevel(0);
    const half = atLevel(0.5);
    const lift = (k: string) =>
      (half[k].lifetime_eur - base[k].lifetime_eur) / base[k].lifetime_eur;
    expect(lift('p90')).toBeGreaterThan(lift('p50'));
    // And the worst path must move at all: a floor that never binds anywhere is
    // a floor set below the sample, and this test would be vacuous.
    expect(lift('p90')).toBeGreaterThan(0);
  });

  it('does not touch a path that never falls below the floor', () => {
    const c = normaliseContract({
      floor_eur_mw_yr: 1, contracted_pct_of_mw: 0.5, term_years: 20, counterparty_note: NOTE,
    });
    const before = paths([120_000_000]) as Any;
    const after = applyContract(before.y0, config as Any, c, { mode: 'blended' }) as Any;
    expect(after.years.map((y: Any) => y.rev_gross))
      .toEqual(before.y0.years.map((y: Any) => y.rev_gross));
    expect(after.contract.years_floor_binds).toBe(0);
    expect(after.contract.total_uplift_eur).toBe(0);
  });
});

// ── integration: the real engine, the real bridge ─────────────────────────

describe('overlay against the engine and the client bridge', () => {
  const kv = loadFixtureKV();
  const config = loadConfig(join(PROJECTS_DIR, 'kkme-reference.json')) as Any;
  const resultPromise = (async () =>
    runProject(config, kv, { engine: await loadEngine(), scenario: 'base' }))();

  it('leaves the product lines exactly as the engine produced them', async () => {
    const result = await resultPromise as Any;
    const out = applyContract(result, config, contract(), { mode: 'blended' }) as Any;
    for (let i = 0; i < result.years.length; i++) {
      for (const k of ['rev_cap', 'rev_act', 'rev_bal', 'rev_trd']) {
        expect(out.years[i][k], `${k} yr ${i + 1}`).toBe(result.years[i][k]);
      }
      // Contracted revenue is not a market product; it lands on its own line.
      expect(out.years[i].rev_gross).toBeCloseTo(
        result.years[i].rev_gross + out.years[i].rev_contracted, 6);
    }
  });

  it('produces a bridge that still ties out on every line', async () => {
    // buildBridge asserts its own identities and throws if any line breaks, so
    // reaching the assertions below is most of the test.
    const result = await resultPromise as Any;
    for (const mode of CONTRACT_MODES) {
      const out = applyContract(result, config, contract(), { mode }) as Any;
      const b = buildBridge(out, config) as Any;
      expect(b.bridge_y1.net_market_revenue)
        .toBe(b.bridge_y1.gross_market_revenues - b.bridge_y1.charging_costs);
      expect(b.bridge_20yr).toHaveLength(result.years.length);
    }
  });

  it('a 0 % contract reproduces the merchant bridge exactly', async () => {
    const result = await resultPromise as Any;
    const merchant = buildBridge(result, config) as Any;
    for (const mode of CONTRACT_MODES) {
      const out = applyContract(
        result, config, contract({ contracted_pct_of_mw: 0 }), { mode }) as Any;
      expect(buildBridge(out, config).bridge_totals).toEqual(merchant.bridge_totals);
    }
  });

  it('reports what the conservative fee treatment costs the toll case', async () => {
    const result = await resultPromise as Any;
    const out = applyContract(result, config, contract(), { mode: 'floor_only' }) as Any;
    const costs = resolveCosts(config) as Any;
    const understated = tollFeeUnderstatement(out, costs.optimiser_pct_gross);
    // Non-zero and equal to the fee on exactly the contracted revenue — the
    // figure an advisor needs to un-do the conservatism if they disagree with it.
    expect(understated).toBeGreaterThan(0);
    expect(understated).toBeCloseTo(
      out.contract.schedule.reduce((a: number, s: Any) => a + s.contracted_revenue, 0)
      * costs.optimiser_pct_gross, 6);
  });

  it('derives its illustrative floor from the sample rather than asserting one', async () => {
    const result = await resultPromise as Any;
    // Three paths at known multiples: P75 of Y1 is resolvable at N = 5, not at 3,
    // so the derivation must report resolution honestly either way.
    const scaled = Object.fromEntries([0.8, 1.0, 1.2, 1.4, 1.6].map((m, i) => [
      `y${i}`,
      { years: result.years.map((y: Any) => ({ ...y, rev_gross: y.rev_gross * m })) },
    ]));
    const d = derivedFloor(scaled as Any, config.mw) as Any;
    expect(d.resolved).toBe(true);
    expect(d.floor_eur_mw_yr).toBe(Math.round(d.raw_eur_mw_yr / 1000) * 1000);
    expect(d.basis).toMatch(/P75/);
  });

  it('names its level keys the way the sweep reports them', () => {
    expect(STANDARD_LEVELS.map(levelKey)).toEqual(['pct_0', 'pct_30', 'pct_50']);
  });
});
