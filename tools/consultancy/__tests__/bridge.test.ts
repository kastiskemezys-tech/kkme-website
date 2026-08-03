// Phase 34.2 — cost decomposition, CAPEX schedule and the client bridge.
//
// The bridge is the deliverable's spine: eight lines, each level equal to the
// previous less its deductions. These tests hold that arithmetic exactly (not
// approximately), pin the CAPEX events to the right operating years, and hold
// the reconciliation calibration to a value re-derived from the reference
// asset rather than a number someone typed once.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRevenueV7 as computeRevenueV7Raw } from '../../../workers/fetch-s1.js';
import { validateConfig as validateConfigRaw } from '../engine.mjs';
import {
  buildBridge as buildBridgeRaw,
  buildCapexSchedule as buildCapexScheduleRaw,
  bridgeCalibration as bridgeCalibrationRaw,
  reconcileAgainstEngine as reconcileRaw,
  assertTieOut,
  BridgeTieOutError,
  BRIDGE_LINES,
  COST_DEFAULTS,
  CAPEX_DEFAULTS,
  OPERATING_CALIBRATION_EUR_KW_YR,
} from '../bridge.mjs';

type Any = Record<string, any>;
const computeRevenueV7 = computeRevenueV7Raw as unknown as (p: Any, kv: unknown) => Any;
const validateConfig = validateConfigRaw as unknown as (c: Any) => Any;
const buildBridge = buildBridgeRaw as unknown as (r: Any, c: Any) => Any;
const buildCapexSchedule = buildCapexScheduleRaw as unknown as (r: Any, c: Any) => Any[];
const bridgeCalibration = bridgeCalibrationRaw as unknown as (r: Any, c: Any) => number;
const reconcile = reconcileRaw as unknown as (r: Any, c: Any, costs?: Any) => Any;

const HERE = dirname(fileURLToPath(import.meta.url));
const KV = JSON.parse(
  readFileSync(join(HERE, '..', 'fixtures', 'regression-kv.json'), 'utf8')
).kv;

const loadCfg = (p: string) =>
  validateConfig(JSON.parse(readFileSync(join(HERE, '..', 'projects', p), 'utf8')));

const paramsFor = (cfg: Any, scenario = 'base') => ({
  mw: cfg.mw, dur_h: cfg.duration_h, capex_kwh: cfg.capex_eur_kwh,
  cod_year: cfg.cod_year, scenario, grant_pct: cfg.grant_pct ?? 0, project_config: cfg,
});

const ALL = [
  'kkme-reference.json',
  'prosperus/01-bitenai.json',
  'prosperus/02-stoniskiai.json',
  'prosperus/03-eigirdziai.json',
].map((f) => {
  const config = loadCfg(f);
  const result = computeRevenueV7(paramsFor(config), KV);
  return { file: f, config, result, bridge: buildBridge(result, config) };
});

describe('tie-out helper', () => {
  it('passes on an exact sum and on euro-level rounding noise', () => {
    expect(() => assertTieOut('x', 100, [60, 40])).not.toThrow();
    expect(() => assertTieOut('x', 100, [60, 39])).not.toThrow();
  });

  it('throws — loudly and typed — on a real mismatch', () => {
    expect(() => assertTieOut('x', 100, [60, 30])).toThrow(BridgeTieOutError);
    expect(() => assertTieOut('x', 100, [60, 30])).toThrow(/tie-out failed at "x"/);
  });
});

describe('bridge arithmetic ties out exactly, every project, every year', () => {
  for (const { config, bridge } of ALL) {
    it(`${config.project_id}: all 20 years and the totals row`, () => {
      const rows = [...bridge.bridge_20yr, bridge.bridge_totals];
      expect(rows).toHaveLength(21);
      for (const b of rows) {
        expect(b.net_market_revenue).toBe(b.gross_market_revenues - b.charging_costs);
        expect(b.project_ebitda).toBe(
          b.net_market_revenue - b.optimiser - b.grid - b.market - b.operating
        );
        expect(b.pre_financing_cf).toBe(
          b.project_ebitda - b.maintenance_capex - b.augmentation_capex - b.replacement_capex
        );
      }
    });

    it(`${config.project_id}: emits exactly the contract's line set`, () => {
      for (const line of BRIDGE_LINES) {
        expect(bridge.bridge_y1).toHaveProperty(line);
        expect(typeof bridge.bridge_y1[line]).toBe('number');
      }
    });
  }

  it('net market revenue returns the engine gross exactly (charging is a re-statement, not a re-model)', () => {
    for (const { result, bridge } of ALL) {
      expect(bridge.bridge_y1.net_market_revenue).toBe(Math.round(result.years[0].rev_gross));
      expect(bridge.bridge_y1.charging_costs).toBeGreaterThan(0);
    }
  });
});

describe('four-line cost decomposition', () => {
  const { config, bridge } = ALL[0]; // reference asset

  it('each percentage line is its stated share of the bridge gross line', () => {
    const b = bridge.bridge_y1;
    expect(b.optimiser).toBe(Math.round(b.gross_market_revenues * COST_DEFAULTS.optimiser_pct_gross));
    expect(b.grid).toBe(Math.round(b.gross_market_revenues * COST_DEFAULTS.grid_pct_gross));
    expect(b.market).toBe(Math.round(b.gross_market_revenues * COST_DEFAULTS.market_pct_gross));
  });

  it('the operating line is the sourced rate plus the calibration, per kW', () => {
    const expected =
      (COST_DEFAULTS.operating_eur_kw_yr + OPERATING_CALIBRATION_EUR_KW_YR) * config.mw * 1000;
    expect(bridge.bridge_y1.operating).toBe(Math.round(expected));
  });

  it('responds to per-project config overrides', () => {
    const overridden = { ...config, costs: { ...COST_DEFAULTS, optimiser_pct_gross: 0.06 } };
    const b = buildBridge(ALL[0].result, overridden).bridge_y1;
    expect(b.optimiser).toBe(Math.round(b.gross_market_revenues * 0.06));
    // Halving the optimiser fee must raise EBITDA by exactly what was removed.
    expect(b.project_ebitda - bridge.bridge_y1.project_ebitda).toBe(
      bridge.bridge_y1.optimiser - b.optimiser
    );
  });

  it('scales the four lines with project size', () => {
    const ref = ALL[0].bridge.bridge_y1;
    const bit = ALL[1].bridge.bridge_y1; // Bitėnai, 48 MW
    expect(bit.operating / ref.operating).toBeCloseTo(48 / 50, 6);
  });
});

describe('reconciliation against the engine cost stack', () => {
  it('the calibration constant is what the reference asset actually implies', () => {
    const derived = bridgeCalibration(ALL[0].result, ALL[0].config);
    expect(derived).toBeCloseTo(OPERATING_CALIBRATION_EUR_KW_YR, 2);
  });

  it('closes the reference asset to within the contracted ±2%', () => {
    const rc = ALL[0].bridge.cost_basis.reconciliation;
    expect(rc.within_2pct).toBe(true);
    expect(Math.abs(rc.delta_pct)).toBeLessThan(0.02);
  });

  it('the calibration constant has become nearly redundant — 38.8a, INVERTED', () => {
    // THIS ASSERTION USED TO BE ITS OPPOSITE, and the flip is the finding.
    //
    // Before 38.8a the engine's cost taxonomy missed the client's 4-line stack
    // by 4.4% (pre-partition) and then 9-10% (post-partition), so a reconciling
    // constant was load-bearing: remove it and the reconciliation fell outside
    // the contracted ±2%. That is what this test asserted.
    //
    // Replacing the invented flat BRP fee with a volume-based charge and moving
    // the service fee onto the owner's net share took the UNCALIBRATED gap to
    // −1.31% at the reference asset — inside ±2% on its own. The constant now
    // trims 1.31pp to 0.01pp rather than rescuing a failure.
    //
    // This is independent corroboration: the reconciliation is a separate check
    // against a client-shaped taxonomy and nothing in 38.8a was fitted to it.
    const uncal = reconcile(ALL[0].result, ALL[0].config, {
      ...COST_DEFAULTS, operating_calibration_eur_kw_yr: 0,
    });
    expect(uncal.within_2pct).toBe(true);
    expect(Math.abs(uncal.delta_pct)).toBeLessThan(0.02);
    // ...but it is not zero, so the constant still has a job and still re-derives.
    expect(Math.abs(uncal.delta_pct)).toBeGreaterThan(0.001);
    const cal = reconcile(ALL[0].result, ALL[0].config, COST_DEFAULTS);
    expect(Math.abs(cal.delta_pct)).toBeLessThan(Math.abs(uncal.delta_pct));
  });

  it('attributes the partial-year divergence to the un-pro-rated BRP fee', () => {
    const st = ALL.find((a) => a.config.project_id === 'stoniskiai')!;
    const div = st.bridge.cost_basis.reconciliation.partial_year_divergence;
    expect(div).not.toBeNull();
    expect(div.operational_months).toBe(7);
    // The whole gap should be the fee remainder, to within rounding of the
    // percentage lines — if it drifts, something else has started diverging.
    const gap = Math.abs(st.bridge.cost_basis.reconciliation.delta);
    expect(gap).toBeCloseTo(div.brp_fee_not_pro_rated, -4);
  });

  it('reports no divergence block for a full first year', () => {
    expect(ALL[1].bridge.cost_basis.reconciliation.partial_year_divergence).toBeNull();
  });
});

describe('CAPEX schedule', () => {
  it('runs 20 years and carries maintenance every year', () => {
    for (const { bridge } of ALL) {
      expect(bridge.capex_schedule).toHaveLength(20);
      for (const row of bridge.capex_schedule) expect(row.maintenance).toBeGreaterThan(0);
    }
  });

  it('totals each row', () => {
    for (const { bridge } of ALL) {
      for (const row of bridge.capex_schedule) {
        expect(row.total).toBe(row.maintenance + row.augmentation + row.replacement);
      }
    }
  });

  it('places exactly one augmentation and one replacement event, on the configured years', () => {
    for (const { bridge } of ALL) {
      const aug = bridge.capex_schedule.filter((c: Any) => c.augmentation > 0);
      const rep = bridge.capex_schedule.filter((c: Any) => c.replacement > 0);
      expect(aug).toHaveLength(1);
      expect(rep).toHaveLength(1);
      expect(aug[0].yr).toBe(CAPEX_DEFAULTS.augmentation_year);
      expect(rep[0].yr).toBe(CAPEX_DEFAULTS.replacement_year);
    }
  });

  it('sizes the events at mwh × pct × €/kWh', () => {
    for (const { config, bridge } of ALL) {
      const aug = bridge.capex_schedule.find((c: Any) => c.augmentation > 0);
      const rep = bridge.capex_schedule.find((c: Any) => c.replacement > 0);
      expect(aug.augmentation).toBe(
        Math.round(config.mwh * CAPEX_DEFAULTS.augmentation_mwh_pct * 1000 * CAPEX_DEFAULTS.augmentation_eur_kwh)
      );
      expect(rep.replacement).toBe(
        Math.round(config.mwh * CAPEX_DEFAULTS.replacement_mwh_pct * 1000 * CAPEX_DEFAULTS.replacement_eur_kwh)
      );
    }
  });

  it('lands the events in the calendar year each project reaches that operating year', () => {
    for (const { config, bridge } of ALL) {
      const aug = bridge.capex_schedule.find((c: Any) => c.augmentation > 0);
      // Operating year N runs in calendar year first_operating_year + N − 1.
      expect(aug.cal_year).toBe(config.first_operating_year + CAPEX_DEFAULTS.augmentation_year - 1);
    }
  });

  it('pro-rates Y1 maintenance for a partial year but not the two events', () => {
    const st = ALL.find((a) => a.config.project_id === 'stoniskiai')!;
    const full = buildCapexSchedule(st.result, { ...st.config, operational_months_y1: 12 });
    expect(st.bridge.capex_schedule[0].maintenance / full[0].maintenance).toBeCloseTo(7 / 12, 6);
    const augPartial = st.bridge.capex_schedule.find((c: Any) => c.augmentation > 0);
    const augFull = full.find((c: Any) => c.augmentation > 0);
    expect(augPartial.augmentation).toBe(augFull!.augmentation);
    expect(augPartial.yr).toBe(augFull!.yr);
  });

  it('honours per-project capex overrides', () => {
    const cfg = { ...ALL[0].config, capex_schedule: { ...CAPEX_DEFAULTS, augmentation_year: 6 } };
    const sched = buildCapexSchedule(ALL[0].result, cfg);
    expect(sched.find((c: Any) => c.augmentation > 0)!.yr).toBe(6);
  });
});

describe('a bridge that does not tie out is refused', () => {
  it('rejects an engine result with no project block', () => {
    const noConfig = computeRevenueV7(
      { mw: 50, dur_h: 2, capex_kwh: 164, cod_year: 2028, scenario: 'base' },
      KV
    );
    expect(() => buildBridge(noConfig, ALL[0].config)).toThrow(/no project block/);
  });

  it('rejects an engine result with no years', () => {
    expect(() => buildBridge({ project: {}, years: [] }, ALL[0].config)).toThrow(/no years/);
  });
});
