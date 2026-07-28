// Phase 34.4 — client scenarios + sensitivity.
//
// The load-bearing test here is the Central invariant: Central's six driver
// values ARE the engine's shipped base constants, so a Central scenario run
// must reproduce the batch-1 portfolio field-for-field. If it does not, the
// scenario mapping is wrong and gets fixed — batch-1's outputs are never
// re-fitted to match.
//
// Everything runs against the frozen KV fixture, so these measure code rather
// than data drift.

import { describe, it, expect } from 'vitest';
import { loadConfigDir, loadEngine, runProject, PROJECTS_DIR } from '../engine.mjs';
import { loadFixtureKV } from '../regression-reference.mjs';
import { runPortfolio } from '../run-portfolio.mjs';
import { COST_DEFAULTS } from '../bridge.mjs';
import {
  DRIVERS, DRIVER_IDS, OVERLAY_DRIVER_IDS, CENTRAL_DRIVERS,
  workerSource, patchSource, loadEngineWithDrivers, verifyDrivers, OverlayAnchorError,
} from '../scenario-overlay.mjs';
import {
  loadScenarios, runScenario, headlineOf, HEADLINE_KEYS,
  monotonicityBreaches, centralDiff, applyRunnerDrivers,
} from '../run-scenarios.mjs';
import { runSensitivity, signBreaches, observedDirection, probeValues } from '../run-sensitivity.mjs';

type Any = Record<string, any>;

// The driver table is indexed by id throughout; TS needs the index signature.
const D = DRIVERS as unknown as Record<string, Any>;

const kv = loadFixtureKV();
const configs = loadConfigDir(`${PROJECTS_DIR}/prosperus`) as Any[];
const scenarios = loadScenarios() as Any;
const drivenBy = (name: string) => ({ ...CENTRAL_DRIVERS, ...scenarios.scenarios[name].drivers });

// One shared unpatched-engine result — the relative-echo drivers compare against it.
const baselinePromise = (async () =>
  runProject(configs[0], kv, { engine: await loadEngine(), scenario: 'base' }))();

describe('driver mapping', () => {
  it('declares all six client drivers plus the two sensitivity-only ones', () => {
    expect(DRIVER_IDS).toHaveLength(8);
    for (const id of Object.keys(scenarios.scenarios.central.drivers)) {
      expect(D[id]).toBeDefined();
    }
  });

  it('Central driver values equal the engine constants the drivers bind to', () => {
    // If these ever diverge, Central stops being the base case and the
    // invariant below would be asserting the wrong thing.
    for (const id of DRIVER_IDS) {
      expect(scenarios.scenarios.central.drivers[id] ?? D[id].central).toBe(D[id].central);
    }
    expect(COST_DEFAULTS.optimiser_pct_gross).toBe(DRIVERS.optimiser_pct_gross.central / 100);
  });

  it('every overlay anchor appears exactly once in the worker source', () => {
    const src = workerSource();
    for (const id of OVERLAY_DRIVER_IDS) {
      const def = D[id];
      const anchors = def.anchors ?? [{ anchor: def.anchor }];
      for (const { anchor } of anchors) {
        expect(src.split(anchor).length - 1, `${id}: ${anchor}`).toBe(1);
      }
    }
  });

  it('a Central driver set patches nothing — the source is character-identical', () => {
    const src = workerSource();
    const { source, applied } = patchSource(src, CENTRAL_DRIVERS);
    expect(applied).toEqual([]);
    expect(source).toBe(src);
  });

  it('a non-Central value changes the source exactly once per anchor', () => {
    const src = workerSource();
    for (const id of OVERLAY_DRIVER_IDS) {
      const def = D[id];
      const probe = def.central + (def.central === 0 ? 5 : def.central * 0.5);
      const { source, applied } = patchSource(src, { [id]: probe });
      expect(applied, id).toEqual([id]);
      expect(source, id).not.toBe(src);
      const anchors = def.anchors ?? [{ anchor: def.anchor }];
      for (const { anchor } of anchors) expect(source.split(anchor).length - 1, id).toBe(0);
    }
  });

  it('throws loudly rather than silently no-op when an anchor has moved', () => {
    expect(() =>
      patchSource('// an engine that no longer contains the anchor\n', { availability_pct: 95 })
    ).toThrow(OverlayAnchorError);
  });

  it.each(OVERLAY_DRIVER_IDS)('%s reaches the engine — its own output echoes the new value', async (id) => {
    const baseline = await baselinePromise;
    const probe = scenarios.scenarios.downside.drivers[id] ?? scenarios.sensitivity_only[id].down;
    const drivers = { ...CENTRAL_DRIVERS, [id]: probe };
    const engine = await loadEngineWithDrivers(drivers);
    const result = await runProject(configs[0], kv, { engine, scenario: 'base' }) as Any;
    expect(() => verifyDrivers(result, drivers, baseline)).not.toThrow();
    expect(D[id].echo(result), id).not.toEqual(D[id].echo(baseline));
  });

  it('optimiser_pct_gross lands on the bridge cost stack, not the engine', () => {
    expect(DRIVERS.optimiser_pct_gross.reach).toBe('runner-cost');
    const cfg = applyRunnerDrivers(configs[0], { optimiser_pct_gross: 15 }) as Any;
    expect(cfg.costs.optimiser_pct_gross).toBe(0.15);
    expect(applyRunnerDrivers(configs[0], {})).toBe(configs[0]);
  });
});

describe('Central invariant', () => {
  it('reproduces the batch-1 portfolio field-for-field', async () => {
    const baseline = await baselinePromise;
    const central = await runScenario(configs, kv, drivenBy('central'), { baseline }) as Any;
    const batch1 = await runPortfolio(configs, kv) as Any;
    const diffs = centralDiff(central, batch1);
    expect(diffs, JSON.stringify(diffs.slice(0, 5), null, 2)).toEqual([]);
  });

  it('a non-Central scenario does NOT reproduce it — the invariant has teeth', async () => {
    const baseline = await baselinePromise;
    const downside = await runScenario(configs, kv, drivenBy('downside'), { baseline }) as Any;
    const batch1 = await runPortfolio(configs, kv) as Any;
    expect(centralDiff(downside, batch1).length).toBeGreaterThan(0);
  });
});

describe('scenario monotonicity', () => {
  it('Downside < Central < Upside on every headline', async () => {
    const baseline = await baselinePromise;
    const headlines: Any = {};
    for (const name of scenarios.order) {
      headlines[name] = headlineOf(await runScenario(configs, kv, drivenBy(name), { baseline }) as Any);
    }
    for (const key of HEADLINE_KEYS) {
      expect(headlines.downside[key], key).toBeLessThan(headlines.central[key]);
      expect(headlines.central[key], key).toBeLessThan(headlines.upside[key]);
    }
    expect(monotonicityBreaches(headlines, scenarios.order)).toEqual([]);
  });

  it('detects a breach when one is present', () => {
    const flat = { downside: { ebitda_y1: 5 }, central: { ebitda_y1: 5 }, upside: { ebitda_y1: 9 } };
    const breaches = monotonicityBreaches(flat as Any, ['downside', 'central', 'upside']);
    expect(breaches.map((b: Any) => b.key)).toContain('ebitda_y1');
  });
});

describe('sensitivity', () => {
  it('every driver moves EBITDA in its declared direction', async () => {
    const baseline = await baselinePromise;
    const { rows } = await runSensitivity(configs, kv, scenarios, { baseline }) as Any;
    expect(rows).toHaveLength(8);
    expect(signBreaches(rows)).toEqual([]);
  });

  it('reads direction in the value frame, not the probe-slot frame', () => {
    // Higher value → higher EBITDA is 'direct' regardless of which probe slot
    // the higher value sits in. fleet_realisation_pct puts its higher (worse)
    // value in the "down" slot, so a slot-frame reading would call it 'direct'.
    expect(observedDirection(-100, +50, 95, 98)).toBe('direct');
    expect(observedDirection(-100, +50, 65, 35)).toBe('inverse');
    expect(observedDirection(0, 0, 1, 2)).toBe('none');
    expect(observedDirection(-100, 0, 1, 2)).toBe('mixed');
    expect(observedDirection(-100, -50, 1, 2)).toBe('mixed');
  });

  it('the two zero-effect drivers move no cash line at all, and say why', async () => {
    const baseline = await baselinePromise;
    const { rows } = await runSensitivity(configs, kv, scenarios, { baseline }) as Any;
    for (const id of ['spread_growth_pct_yr', 'cpi_floor']) {
      const row = rows.find((r: Any) => r.driver === id);
      expect(row.delta_ebitda_down, id).toBe(0);
      expect(row.delta_ebitda_up, id).toBe(0);
      expect(row.delta_ebitda_20yr_down, id).toBe(0);
      expect(row.delta_ebitda_20yr_up, id).toBe(0);
      expect(row.zero_effect_reason, id).toBeTruthy();
    }
  });

  it('rte_decay_pp_yr is invisible in Y1 but live over the lifetime', async () => {
    // The reason sign sanity runs on the 20-year basis: the RTE curve is
    // evaluated at t = 0 in operating year 1, so Y1 cannot see the decay rate.
    const baseline = await baselinePromise;
    const { rows } = await runSensitivity(configs, kv, scenarios, { baseline }) as Any;
    const row = rows.find((r: Any) => r.driver === 'rte_decay_pp_yr');
    expect(row.delta_ebitda_down).toBe(0);
    expect(row.delta_ebitda_up).toBe(0);
    expect(Math.abs(row.swing_20yr)).toBeGreaterThan(0);
    expect(row.observed_direction).toBe('inverse');
  });

  it('probe values come from scenarios.json, with no driver left unprobed', () => {
    const probes = probeValues(scenarios) as Any;
    expect(Object.keys(probes).sort()).toEqual([...DRIVER_IDS].sort());
    expect(probes.availability_pct).toEqual({ down: 95, up: 98 });
    expect(probes.rte_decay_pp_yr).toEqual({ down: 0.3, up: 0.1 });
  });

  it('reports the interaction residual rather than forcing the deltas to sum', async () => {
    const baseline = await baselinePromise;
    const { central, rows } = await runSensitivity(configs, kv, scenarios, { baseline }) as Any;
    const downFull = headlineOf(await runScenario(configs, kv, drivenBy('downside'), { baseline }) as Any);
    const sumSingle = rows.reduce((s: number, r: Any) => s + r.delta_ebitda_down, 0);
    const scenarioDelta = downFull.ebitda_y1 - central.ebitda_y1;
    // Interaction is real: applying the drivers together is not the sum of
    // applying each alone. Asserting they DO match would be the bug.
    expect(scenarioDelta).not.toBe(sumSingle);
  });
});

describe('scenarios.json', () => {
  it('carries three cases with all six client drivers each', () => {
    expect(scenarios.order).toEqual(['downside', 'central', 'upside']);
    const six = ['fleet_realisation_pct', 'spread_growth_pct_yr', 'availability_pct',
      'trading_realisation', 'cap_price_delta_pct', 'cpi_floor'];
    for (const name of scenarios.order) {
      expect(Object.keys(scenarios.scenarios[name].drivers).sort()).toEqual([...six].sort());
    }
  });

  it('matches the driver table locked with the client', () => {
    const d = scenarios.scenarios;
    expect(d.downside.drivers).toEqual({
      fleet_realisation_pct: 65, spread_growth_pct_yr: -1.0, availability_pct: 95,
      trading_realisation: 0.78, cap_price_delta_pct: -25, cpi_floor: 0.28,
    });
    expect(d.central.drivers).toEqual({
      fleet_realisation_pct: 50, spread_growth_pct_yr: 2.0, availability_pct: 97,
      trading_realisation: 0.85, cap_price_delta_pct: 0, cpi_floor: 0.30,
    });
    expect(d.upside.drivers).toEqual({
      fleet_realisation_pct: 35, spread_growth_pct_yr: 3.5, availability_pct: 98,
      trading_realisation: 0.88, cap_price_delta_pct: 20, cpi_floor: 0.35,
    });
  });

  it('rejects a scenario with an unknown or missing driver', () => {
    expect(() => loadScenarios('/nonexistent/scenarios.json')).toThrow();
  });
});
