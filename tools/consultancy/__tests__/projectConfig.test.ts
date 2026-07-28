// Phase 34.1 — per-project engine parameterisation.
//
// The engine gained an optional `params.project_config` seam so any BESS
// project can be modelled, not just the 50 MW / 100 MWh public reference. The
// non-negotiable of the phase is that the public /revenue path is unaffected:
// these tests pin that (a) omitting the config reproduces the pre-34.1 code
// path exactly, (b) the committed reference config is equivalent to omitting
// it — so the reference asset is genuinely "just another config" and not a
// parallel literal (discipline rule #4), and (c) partial operating years scale
// the lines that should scale and leave the fixed ones alone.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { computeRevenueV7 as computeRevenueV7Raw } from '../../../workers/fetch-s1.js';
import { validateConfig as validateConfigRaw, codYearForEngine } from '../engine.mjs';

// The worker and the tooling are plain JS. The engine's return type is a union
// (the `project` block is only present when a config is supplied), so these
// tests work against the runtime shape rather than the inferred one.
type EngineResult = Record<string, any>;
const computeRevenueV7 = computeRevenueV7Raw as unknown as
  (params: Record<string, any>, kv: unknown) => EngineResult;
const validateConfig = validateConfigRaw as unknown as
  (cfg: Record<string, any>) => Record<string, any>;

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECTS = join(HERE, '..', 'projects');

const KV = JSON.parse(
  readFileSync(join(HERE, '..', 'fixtures', 'regression-kv.json'), 'utf8')
).kv;

const loadCfg = (p: string) => validateConfig(JSON.parse(readFileSync(join(PROJECTS, p), 'utf8')));

const REFERENCE_PARAMS = {
  mw: 50, dur_h: 2, capex_kwh: 164, cod_year: 2028, scenario: 'base', grant_pct: 0,
};

/** Engine output with the wall-clock field removed, for structural comparison. */
const stable = (r: Record<string, unknown>) => {
  const { timestamp, ...rest } = r;
  return rest;
};

const paramsFor = (cfg: Record<string, any>, scenario = 'base') => ({
  mw: cfg.mw,
  dur_h: cfg.duration_h,
  capex_kwh: cfg.capex_eur_kwh,
  cod_year: cfg.cod_year,
  scenario,
  grant_pct: cfg.grant_pct ?? 0,
  project_config: cfg,
});

describe('public path is untouched by the project_config seam', () => {
  it('omitting project_config emits no `project` key', () => {
    const r = computeRevenueV7(REFERENCE_PARAMS, KV);
    expect(r).not.toHaveProperty('project');
  });

  it('the committed reference config reproduces the no-config output field-for-field', () => {
    const cfg = loadCfg('kkme-reference.json');
    const withConfig = computeRevenueV7(paramsFor(cfg), KV);
    const withoutConfig = computeRevenueV7(REFERENCE_PARAMS, KV);

    // The only permitted difference is the additive `project` block.
    const { project, ...rest } = withConfig as Record<string, unknown>;
    expect(project).toBeDefined();
    expect(stable(rest)).toEqual(stable(withoutConfig as Record<string, unknown>));
  });

  it('reference config declares the same geometry the public route defaults to', () => {
    const cfg = loadCfg('kkme-reference.json');
    expect(cfg.mw).toBe(50);
    expect(cfg.mwh).toBe(100);
    expect(cfg.duration_h).toBe(2);
    expect(cfg.capex_eur_kwh).toBe(164);
    expect(cfg.cod_year).toBe(2028);
  });
});

describe('config validation rejects inputs that would produce wrong client numbers', () => {
  const base = {
    project_id: 'x', name: 'X', mw: 10, mwh: 20, cod: '2030-01',
    first_operating_year: 2030, capex_eur_kwh: 164,
  };

  it('accepts a well-formed config', () => {
    expect(() => validateConfig(base)).not.toThrow();
  });

  it.each([
    ['mw <= 0', { mw: 0 }],
    ['mwh <= 0', { mwh: 0 }],
    ['capex <= 0', { capex_eur_kwh: 0 }],
    ['missing name', { name: undefined }],
    ['missing cod', { cod: undefined }],
    ['missing first_operating_year', { first_operating_year: undefined }],
    ['non-integer first_operating_year', { first_operating_year: 2030.5 }],
    ['operational months out of range', { operational_months_y1: 13 }],
    ['duration contradicting mwh/mw', { duration_h: 3 }],
    ['nameplate above grid allowance', { grid_allowance_mw: 5 }],
  ])('rejects %s', (_label, patch) => {
    expect(() => validateConfig({ ...base, ...patch })).toThrow();
  });

  it('rejects an operational-months figure the COD month contradicts', () => {
    // COD 2030-06 in the first operating year means 7 months, not 12.
    expect(() =>
      validateConfig({ ...base, cod: '2030-06', operational_months_y1: 12 })
    ).toThrow(/implies 7 operational months/);
  });

  it('derives duration and cod_year rather than trusting a declared value', () => {
    const cfg = validateConfig({ ...base, mw: 48, mwh: 96 });
    expect(cfg.duration_h).toBe(2);
    expect(cfg.cod_year).toBe(codYearForEngine(2030));
    expect(cfg.cod_year).toBe(2029); // engine labels year 1 as cod_year + 1
  });
});

describe('the three Prosperus configs', () => {
  const files = ['prosperus/01-bitenai.json', 'prosperus/02-stoniskiai.json', 'prosperus/03-eigirdziai.json'];
  const cfgs = files.map(loadCfg);

  it('all validate and are 2-hour systems within their grid allowance', () => {
    for (const c of cfgs) {
      expect(c.duration_h).toBe(2);
      expect(c.mw).toBeLessThanOrEqual(c.grid_allowance_mw);
    }
  });

  it('every named entity carries a public-register provenance (discipline rule #3)', () => {
    for (const c of cfgs) {
      expect(c.meta.source).toBe('public-register');
      expect(c.meta.vert_permit).toMatch(/^L-\d+$/);
      expect(c.meta.spv).toBeTruthy();
    }
  });

  it('produce Y1 gross revenue in the expected band and echo the config back', () => {
    for (const c of cfgs) {
      const r = computeRevenueV7(paramsFor(c), KV);
      expect(r.project.project_id).toBe(c.project_id);
      expect(r.project.mw).toBe(c.mw);
      expect(r.project.mwh).toBe(c.mwh);
      expect(r.project.first_operating_year).toBe(c.first_operating_year);
      // Baltic 2h BESS at current prices: €120k–260k/MW/yr, pro-rated for a
      // partial first year. Wide band on purpose — this catches a broken
      // parameterisation, not a modelling opinion.
      const perMwFullYear =
        r.gross_revenue_y1 / c.mw / (c.operational_months_y1 / 12);
      expect(perMwFullYear).toBeGreaterThan(120_000);
      expect(perMwFullYear).toBeLessThan(260_000);
    }
  });

  it('scale with MW when COD year is held equal', () => {
    // Bitėnai (48) and Stoniškiai (45) share first_operating_year 2028, so at
    // equal operating months their revenue must be proportional to MW.
    const [bitenai, stoniskiai] = cfgs;
    const a = computeRevenueV7(paramsFor(bitenai), KV);
    const b = computeRevenueV7(
      paramsFor({ ...stoniskiai, operational_months_y1: 12 }),
      KV
    );
    const ratio = b.gross_revenue_y1 / a.gross_revenue_y1;
    expect(ratio).toBeCloseTo(stoniskiai.mw / bitenai.mw, 3);
  });
});

describe('partial operating year', () => {
  const cfg = loadCfg('prosperus/02-stoniskiai.json'); // COD 2028-06 → 7 months

  it('scales Y1 gross revenue and OPEX by the operational fraction', () => {
    const partial = computeRevenueV7(paramsFor(cfg), KV);
    const full = computeRevenueV7(paramsFor({ ...cfg, operational_months_y1: 12 }), KV);
    const f = 7 / 12;
    expect(partial.gross_revenue_y1 / full.gross_revenue_y1).toBeCloseTo(f, 4);
    expect(partial.opex_y1 / full.opex_y1).toBeCloseTo(f, 4);
  });

  it('leaves years 2+ at full-year values', () => {
    const partial = computeRevenueV7(paramsFor(cfg), KV);
    const full = computeRevenueV7(paramsFor({ ...cfg, operational_months_y1: 12 }), KV);
    for (const yr of [1, 5, 19]) {
      expect(partial.years[yr].rev_gross).toBe(full.years[yr].rev_gross);
      expect(partial.years[yr].opex).toBe(full.years[yr].opex);
    }
  });

  it('does NOT pro-rate the fixed BRP fee (conservative — see DECISIONS.md A4)', () => {
    const partial = computeRevenueV7(paramsFor(cfg), KV);
    const full = computeRevenueV7(paramsFor({ ...cfg, operational_months_y1: 12 }), KV);
    expect(partial.years[0].brp_fee).toBe(full.years[0].brp_fee);
  });

  it('documents what was and was not pro-rated', () => {
    const r = computeRevenueV7(paramsFor(cfg), KV);
    expect(r.project.partial_year_y1.months).toBe(7);
    expect(r.project.partial_year_y1.pro_rated).toContain('opex');
    expect(r.project.partial_year_y1.not_pro_rated.join(' ')).toMatch(/brp_fee/);
  });

  it('is null for a full first year', () => {
    const r = computeRevenueV7(paramsFor(loadCfg('prosperus/01-bitenai.json')), KV);
    expect(r.project.partial_year_y1).toBeNull();
  });
});

describe('fleet-level quantities do not scale with project size', () => {
  it('sd_ratio and cannibalisation are identical across project sizes at equal COD', () => {
    const small = computeRevenueV7(
      paramsFor(validateConfig({
        project_id: 's', name: 'S', mw: 10, mwh: 20, cod: '2029-01',
        first_operating_year: 2029, capex_eur_kwh: 164,
      })),
      KV
    );
    const large = computeRevenueV7(
      paramsFor(validateConfig({
        project_id: 'l', name: 'L', mw: 200, mwh: 400, cod: '2029-01',
        first_operating_year: 2029, capex_eur_kwh: 164,
      })),
      KV
    );
    expect(small.sd_ratio).toBe(large.sd_ratio);
    expect(small.cpi_afrr_at_cod).toBe(large.cpi_afrr_at_cod);
    expect(small.fleet_context.demand_mw).toBe(large.fleet_context.demand_mw);
  });
});
