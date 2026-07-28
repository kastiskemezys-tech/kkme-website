// Phase 34.3 — portfolio aggregation.
//
// The one rule that matters here: a consolidated line that is not exactly the
// sum of the project lines is a bug. These tests hold that on the real three
// projects and on synthetic fixtures, check that staggered commissioning lands
// each project in the right calendar years, and pin NPV against a hand-computed
// value rather than against the implementation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRevenueV7 as computeRevenueV7Raw } from '../../../workers/fetch-s1.js';
import { validateConfig as validateConfigRaw } from '../engine.mjs';
import { buildBridge as buildBridgeRaw, BRIDGE_LINES } from '../bridge.mjs';
import {
  buildPortfolio as buildPortfolioRaw,
  consolidate as consolidateRaw,
  buildCashflows as buildCashflowsRaw,
  npvOf as npvOfRaw,
  moicOf as moicOfRaw,
  CORRELATION_NOTE,
  DEFAULT_WACC,
} from '../portfolio.mjs';

type Any = Record<string, any>;
const computeRevenueV7 = computeRevenueV7Raw as unknown as (p: Any, kv: unknown) => Any;
const validateConfig = validateConfigRaw as unknown as (c: Any) => Any;
const buildBridge = buildBridgeRaw as unknown as (r: Any, c: Any) => Any;
const buildPortfolio = buildPortfolioRaw as unknown as (p: Any[], o?: Any) => Any;
const consolidate = consolidateRaw as unknown as (p: Any[]) => Any[];
const buildCashflows = buildCashflowsRaw as unknown as (p: Any[], o?: Any) => Any;
const npvOf = npvOfRaw as unknown as (cf: Any) => number;
const moicOf = moicOfRaw as unknown as (cf: Any) => number;

const HERE = dirname(fileURLToPath(import.meta.url));
const KV = JSON.parse(
  readFileSync(join(HERE, '..', 'fixtures', 'regression-kv.json'), 'utf8')
).kv;

const loadCfg = (p: string) =>
  validateConfig(JSON.parse(readFileSync(join(HERE, '..', 'projects', p), 'utf8')));

const entry = (config: Any): Any => {
  const engine = computeRevenueV7(
    {
      mw: config.mw, dur_h: config.duration_h, capex_kwh: config.capex_eur_kwh,
      cod_year: config.cod_year, scenario: 'base', grant_pct: 0, project_config: config,
    },
    KV
  );
  return {
    project_id: config.project_id,
    config,
    gross_capex: engine.gross_capex,
    engine_npv_post_tax: engine.npv_at_wacc,
    engine_project_irr: engine.project_irr,
    ...buildBridge(engine, config),
    engine,
  };
};

const PROSPERUS = [
  'prosperus/01-bitenai.json',
  'prosperus/02-stoniskiai.json',
  'prosperus/03-eigirdziai.json',
].map(loadCfg).map(entry);

const PORTFOLIO = buildPortfolio(PROSPERUS);

/** Two synthetic projects with clean, unequal geometry and staggered starts. */
const SYNTHETIC = [
  validateConfig({
    project_id: 'syn-a', name: 'Synth A', mw: 20, mwh: 40, cod: '2031-01',
    first_operating_year: 2031, capex_eur_kwh: 164, grid_allowance_mw: 20,
  }),
  validateConfig({
    project_id: 'syn-b', name: 'Synth B', mw: 35, mwh: 70, cod: '2032-04',
    first_operating_year: 2032, operational_months_y1: 9, capex_eur_kwh: 164,
    grid_allowance_mw: 40,
  }),
].map(entry);

describe('portfolio is the sum of its projects', () => {
  it('every bridge line, on the real three projects', () => {
    for (const line of BRIDGE_LINES) {
      const projectSum = PROSPERUS.reduce((s, p) => s + p.bridge_totals[line], 0);
      // Tolerance is one euro per project — pure per-year rounding, nothing else.
      expect(Math.abs(PORTFOLIO.bridge_totals[line] - projectSum)).toBeLessThanOrEqual(3);
    }
  });

  it('every bridge line, on synthetic two-project fixtures', () => {
    const synth = buildPortfolio(SYNTHETIC);
    for (const line of BRIDGE_LINES) {
      const projectSum = SYNTHETIC.reduce((s, p) => s + p.bridge_totals[line], 0);
      expect(Math.abs(synth.bridge_totals[line] - projectSum)).toBeLessThanOrEqual(2);
    }
  });

  it('year by year, not just in total', () => {
    for (const row of PORTFOLIO.bridge_20yr) {
      for (const line of BRIDGE_LINES) {
        const yearSum = PROSPERUS.reduce((s, p) => {
          const y = p.bridge_20yr.find((b: Any) => b.cal_year === row.cal_year);
          return s + (y ? y[line] : 0);
        }, 0);
        expect(row[line]).toBe(Math.round(yearSum));
      }
    }
  });

  it('refuses to consolidate an empty portfolio', () => {
    expect(() => buildPortfolio([])).toThrow(/at least one project/);
  });

  it('a single-project portfolio equals that project', () => {
    const solo = buildPortfolio([PROSPERUS[0]]);
    for (const line of BRIDGE_LINES) {
      expect(solo.bridge_totals[line]).toBe(PROSPERUS[0].bridge_totals[line]);
    }
  });
});

describe('consolidated years satisfy the same bridge identities', () => {
  it('every calendar year and the totals row tie out', () => {
    for (const b of [...PORTFOLIO.bridge_20yr, PORTFOLIO.bridge_totals]) {
      expect(b.net_market_revenue).toBe(b.gross_market_revenues - b.charging_costs);
      expect(b.project_ebitda).toBe(
        b.net_market_revenue - b.optimiser - b.grid - b.market - b.operating
      );
      expect(b.pre_financing_cf).toBe(
        b.project_ebitda - b.maintenance_capex - b.augmentation_capex - b.replacement_capex
      );
    }
  });
});

describe('staggered commissioning', () => {
  it('spans first start to last end without truncating the late project', () => {
    // Bitėnai and Stoniškiai run 2028–2047, Eigirdžiai 2029–2048.
    expect(PORTFOLIO.bridge_20yr[0].cal_year).toBe(2028);
    expect(PORTFOLIO.bridge_20yr[PORTFOLIO.bridge_20yr.length - 1].cal_year).toBe(2048);
    expect(PORTFOLIO.portfolio.calendar_years).toBe(21);
  });

  it('portfolio year 1 is the first calendar year, with only the projects then operating', () => {
    const y1 = PORTFOLIO.bridge_y1;
    expect(y1.cal_year).toBe(2028);
    const ids = y1.contributors.map((c: Any) => c.project_id).sort();
    expect(ids).toEqual(['bitenai', 'stoniskiai']);
    expect(y1.contributors.find((c: Any) => c.project_id === 'bitenai').operational_months).toBe(12);
    expect(y1.contributors.find((c: Any) => c.project_id === 'stoniskiai').operational_months).toBe(7);
  });

  it('a mid-year start contributes pro-rata in its first calendar year only', () => {
    const [, synB] = SYNTHETIC; // COD 2032-04 → 9 months
    // Same asset commissioned in January instead — validateConfig will not
    // accept a 12-month first year against an April COD, which is the point.
    const full = entry(validateConfig({ ...synB.config, cod: '2032-01', operational_months_y1: 12 }));
    const partialY1 = synB.bridge_20yr[0];
    const fullY1 = full.bridge_20yr[0];
    expect(partialY1.cal_year).toBe(2032);
    expect(partialY1.gross_market_revenues / fullY1.gross_market_revenues).toBeCloseTo(9 / 12, 3);
    // Year 2 onwards is unaffected.
    expect(synB.bridge_20yr[1].gross_market_revenues).toBe(full.bridge_20yr[1].gross_market_revenues);
  });

  it('places each project\'s augmentation in its own calendar year', () => {
    const augYears = PROSPERUS.map((p) => {
      const row = p.capex_schedule.find((c: Any) => c.augmentation > 0);
      return { id: p.project_id, cal_year: row.cal_year };
    });
    // Operating year 8 from first_operating_year: 2028 → 2035, 2029 → 2036.
    expect(augYears).toEqual([
      { id: 'bitenai', cal_year: 2035 },
      { id: 'stoniskiai', cal_year: 2035 },
      { id: 'eigirdziai', cal_year: 2036 },
    ]);
  });

  it('shows the augmentation years in the consolidated timeline', () => {
    const byYear = (y: number) =>
      PORTFOLIO.bridge_20yr.find((r: Any) => r.cal_year === y).augmentation_capex;
    expect(byYear(2035)).toBeGreaterThan(0);
    expect(byYear(2036)).toBeGreaterThan(0);
    expect(byYear(2034)).toBe(0);
    // 2035 carries two projects' events, 2036 one.
    expect(byYear(2035)).toBeGreaterThan(byYear(2036));
  });
});

describe('NPV and MOIC', () => {
  it('discounts a hand-computed fixture to the euro', () => {
    // 3 cash flows at 10%: −1000 at t=0, +600 at t=1, +600 at t=2.
    //   NPV = −1000 + 600/1.1 + 600/1.21
    //       = −1000 + 545.4545… + 495.8677… = 41.3223… → 41
    const fixture = {
      wacc: 0.1,
      rows: [
        { cal_year: 2030, t: 0, capex_outflow: 1000, operating_cf: 0, net_cf: -1000 },
        { cal_year: 2031, t: 1, capex_outflow: 0, operating_cf: 600, net_cf: 600 },
        { cal_year: 2032, t: 2, capex_outflow: 0, operating_cf: 600, net_cf: 600 },
      ],
    };
    expect(npvOf(fixture)).toBe(41);
    expect(moicOf(fixture)).toBe(1.2); // 1200 operating / 1000 capex
  });

  it('returns the undiscounted sum at a zero discount rate', () => {
    const rows = [
      { cal_year: 2030, t: 0, capex_outflow: 500, operating_cf: 0, net_cf: -500 },
      { cal_year: 2031, t: 1, capex_outflow: 0, operating_cf: 800, net_cf: 800 },
    ];
    expect(npvOf({ wacc: 0, rows })).toBe(300);
  });

  it('NPV and MOIC read the same cash-flow array', () => {
    const cf = buildCashflows(PROSPERUS, { wacc: DEFAULT_WACC });
    expect(npvOf(cf)).toBe(PORTFOLIO.portfolio.npv_pre_financing_pre_tax);
    expect(moicOf(cf)).toBe(PORTFOLIO.portfolio.moic);

    const operating = cf.rows.reduce((s: number, x: Any) => s + x.operating_cf, 0);
    const capex = cf.rows.reduce((s: number, x: Any) => s + x.capex_outflow, 0);
    expect(PORTFOLIO.portfolio.moic).toBeCloseTo(operating / capex, 3);
  });

  it('draws each project\'s CAPEX in the year before it starts operating', () => {
    const cf = buildCashflows(PROSPERUS, {});
    expect(cf.t0).toBe(2027);
    const draw = (y: number) => cf.rows.find((x: Any) => x.cal_year === y).capex_outflow;
    // Bitėnai + Stoniškiai draw in 2027, Eigirdžiai in 2028.
    expect(draw(2027)).toBe(PROSPERUS[0].gross_capex + PROSPERUS[1].gross_capex);
    expect(draw(2028)).toBe(PROSPERUS[2].gross_capex);
    expect(draw(2029)).toBe(0);
  });

  it('total CAPEX equals the sum of the project CAPEX', () => {
    const cf = buildCashflows(PROSPERUS, {});
    const total = cf.rows.reduce((s: number, x: Any) => s + x.capex_outflow, 0);
    expect(total).toBe(PROSPERUS.reduce((s, p) => s + p.gross_capex, 0));
    expect(total).toBe(PORTFOLIO.portfolio.gross_capex);
  });

  it('a higher discount rate lowers NPV and leaves MOIC alone', () => {
    const cheap = buildPortfolio(PROSPERUS, { wacc: 0.05 });
    const dear = buildPortfolio(PROSPERUS, { wacc: 0.15 });
    expect(dear.portfolio.npv_pre_financing_pre_tax)
      .toBeLessThan(cheap.portfolio.npv_pre_financing_pre_tax);
    expect(dear.portfolio.moic).toBe(cheap.portfolio.moic);
  });

  it('labels the NPV basis as pre-financing and pre-tax', () => {
    expect(PORTFOLIO.portfolio.npv_basis).toMatch(/pre-tax/);
    // The engine's own post-tax figure is carried per project for contrast.
    for (const p of PORTFOLIO.per_project) {
      expect(typeof p.engine_npv_post_tax).toBe('number');
      expect(p.engine_npv_post_tax).not.toBe(p.npv_pre_financing_pre_tax);
    }
  });
});

describe('correlation disclosure', () => {
  it('is carried as data, with no portfolio-effect uplift', () => {
    expect(PORTFOLIO.correlation_note).toEqual(CORRELATION_NOTE);
    expect(PORTFOLIO.correlation_note.lt_zone_price_correlation).toBe(0.97);
    expect(PORTFOLIO.correlation_note.spatial_diversification).toBe('negligible');
  });

  it('consolidated revenue carries no uplift over the plain sum', () => {
    const plain = PROSPERUS.reduce((s, p) => s + p.bridge_totals.gross_market_revenues, 0);
    expect(Math.abs(PORTFOLIO.bridge_totals.gross_market_revenues - plain)).toBeLessThanOrEqual(3);
  });
});
