/**
 * Sensitivity runner — Phase 34.4
 *
 * Perturbs each of the eight drivers one at a time from Central, in both
 * directions, and reports the Δ EBITDA. Everything else is held at Central, so
 * each row isolates one driver's contribution.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not force the single-variable deltas to sum to the scenario
 *     delta. They cannot: the drivers interact (a capacity-price cut and a
 *     tighter S/D both compress the same reserve revenue, so applying them
 *     together is less than the sum of applying each alone). The residual is
 *     computed and reported as the interaction effect, which is a real property
 *     of the model rather than an error to be tuned away.
 *
 *   - It does not invent an effect for a driver that has none. Two of the
 *     client's six drivers move no cash line in the engine as calibrated —
 *     `spread_growth_pct_yr` (its only revenue path saturates at a clamp) and
 *     `cpi_floor` (reporting-only). Both are declared `expected_direction:
 *     'none'` with the mechanism named, and the sign-sanity assert holds them
 *     to exactly zero. If a future engine change makes either live, the assert
 *     fails and someone updates the declaration knowingly.
 *
 * Usage:
 *   node tools/consultancy/run-sensitivity.mjs [--offline] [dir]
 */

import { join } from 'node:path';
import { loadConfigDir, PROJECTS_DIR, eur } from './engine.mjs';
import { writeRunOutput, kvVintage, repoRelative } from './lib/runs.mjs';
import { getKV } from './kv-snapshot.mjs';
import { DEFAULT_WACC } from './portfolio.mjs';
import { DRIVERS, SENSITIVITY_DRIVER_IDS, CENTRAL_DRIVERS } from './scenario-overlay.mjs';
import { loadScenarios, runScenario, headlineOf } from './run-scenarios.mjs';

/**
 * The down/up probe value for each driver: the client's Downside/Upside figure
 * where the scenario table defines one, else the sensitivity-only pair. One
 * source for each value — scenarios.json.
 */
export function probeValues(scenarios) {
  const out = {};
  for (const id of SENSITIVITY_DRIVER_IDS) {
    const down = scenarios.scenarios.downside.drivers[id] ?? scenarios.sensitivity_only[id]?.down;
    const up = scenarios.scenarios.upside.drivers[id] ?? scenarios.sensitivity_only[id]?.up;
    if (down === undefined || up === undefined) {
      throw new Error(`driver "${id}" has no down/up probe in scenarios.json`);
    }
    out[id] = { down, up };
  }
  return out;
}

/**
 * Observed direction of a driver, in the DRIVER-VALUE frame.
 *
 * The distinction matters and cost a debug cycle. The down/up probe slots are
 * already ordered by economic outcome — the "down" slot holds whatever value
 * the client's Downside case carries — so in probe-slot terms every
 * well-behaved driver looks 'direct' and the check proves nothing. The question
 * worth asking is the value-frame one: does a HIGHER driver value raise or
 * lower EBITDA? That is what "higher availability → higher EBITDA" means, and
 * it is what the declared `expected_direction` records.
 *
 * 'direct'  — a higher driver value raises EBITDA
 * 'inverse' — a higher driver value lowers EBITDA
 * 'none'    — both deltas are exactly zero
 * 'mixed'   — the two probes disagree, or only one moved
 */
export function observedDirection(delta_down, delta_up, down_value, up_value) {
  if (delta_down === 0 && delta_up === 0) return 'none';
  if (delta_down === 0 || delta_up === 0) return 'mixed';
  // Re-express in the value frame: (ΔEBITDA at the higher value) − (at the lower).
  const higherIsUp = up_value > down_value;
  const at_higher = higherIsUp ? delta_up : delta_down;
  const at_lower = higherIsUp ? delta_down : delta_up;
  if (at_lower < 0 && at_higher > 0) return 'direct';
  if (at_lower > 0 && at_higher < 0) return 'inverse';
  return 'mixed';
}

/**
 * Sign sanity: every driver's observed direction must equal the direction
 * declared in scenario-overlay.mjs. Returns the list of breaches.
 *
 * Run on the 20-YEAR EBITDA basis, not Y1. Y1 is structurally blind to at least
 * one real driver: `rte_decay_pp_yr` multiplies a curve evaluated at t = 0 in
 * operating year 1, so every decay rate gives the same Y1 number and a
 * Y1-based check would score a live driver as dead. The lifetime basis gives
 * every driver a year in which to show up.
 */
export function signBreaches(rows) {
  return rows
    .filter((r) => r.observed_direction !== r.expected_direction)
    .map((r) => ({
      driver: r.driver,
      expected: r.expected_direction,
      observed: r.observed_direction,
      delta_ebitda_down: r.delta_ebitda_down,
      delta_ebitda_up: r.delta_ebitda_up,
    }));
}

export async function runSensitivity(configs, kv, scenarios, { wacc = DEFAULT_WACC, baseline = null } = {}) {
  const probes = probeValues(scenarios);

  const central = await runScenario(configs, kv, CENTRAL_DRIVERS, { wacc, baseline });
  const centralHead = headlineOf(central);
  const central20yr = central.bridge_totals.project_ebitda;

  const rows = [];
  for (const id of SENSITIVITY_DRIVER_IDS) {
    const def = DRIVERS[id];
    const { down, up } = probes[id];

    const runAt = async (value) => {
      const portfolio = await runScenario(configs, kv, { ...CENTRAL_DRIVERS, [id]: value }, { wacc, baseline });
      return { head: headlineOf(portfolio), ebitda_20yr: portfolio.bridge_totals.project_ebitda };
    };
    const dn = await runAt(down);
    const up_ = await runAt(up);
    const hDown = dn.head, hUp = up_.head;

    const delta_ebitda_down = hDown.ebitda_y1 - centralHead.ebitda_y1;
    const delta_ebitda_up = hUp.ebitda_y1 - centralHead.ebitda_y1;
    const delta_ebitda_20yr_down = dn.ebitda_20yr - central20yr;
    const delta_ebitda_20yr_up = up_.ebitda_20yr - central20yr;

    rows.push({
      driver: id,
      label: def.label,
      unit: def.unit,
      reach: def.reach,
      engine_binding: def.engine_binding,
      central: def.central,
      down_value: down,
      up_value: up,
      delta_ebitda_down,
      delta_ebitda_up,
      delta_ebitda_20yr_down,
      delta_ebitda_20yr_up,
      delta_gross_down: hDown.gross_y1 - centralHead.gross_y1,
      delta_gross_up: hUp.gross_y1 - centralHead.gross_y1,
      delta_npv_down: hDown.npv - centralHead.npv,
      delta_npv_up: hUp.npv - centralHead.npv,
      swing: Math.abs(delta_ebitda_up - delta_ebitda_down),
      swing_20yr: Math.abs(delta_ebitda_20yr_up - delta_ebitda_20yr_down),
      expected_direction: def.expected_direction,
      observed_direction: observedDirection(
        delta_ebitda_20yr_down, delta_ebitda_20yr_up, down, up
      ),
      observed_direction_basis: '20-year EBITDA (Y1 is blind to rte_decay_pp_yr — see signBreaches)',
      ...(def.zero_effect_reason ? { zero_effect_reason: def.zero_effect_reason } : {}),
    });
  }

  // Sorted by lifetime impact, for the same reason sign sanity uses it: a Y1
  // ordering ranks a live driver level with the two dead ones.
  rows.sort((a, b) => b.swing_20yr - a.swing_20yr);
  return { central: centralHead, central_ebitda_20yr: central20yr, rows };
}

/**
 * Interaction residual: the scenario delta less the sum of the single-variable
 * deltas in that direction. A non-zero residual is expected and is reported,
 * never forced to zero.
 */
export function interactionResidual(rows, centralHead, scenarioHead, direction) {
  const key = direction === 'down' ? 'delta_ebitda_down' : 'delta_ebitda_up';
  const sum_single = rows.reduce((s, r) => s + r[key], 0);
  const scenario_delta = scenarioHead.ebitda_y1 - centralHead.ebitda_y1;
  return {
    scenario_delta_ebitda_y1: scenario_delta,
    sum_of_single_variable_deltas: sum_single,
    interaction_residual: scenario_delta - sum_single,
    residual_pct_of_scenario_delta:
      scenario_delta !== 0 ? Math.round(((scenario_delta - sum_single) / scenario_delta) * 1000) / 10 : null,
    note:
      'The single-variable deltas do not sum to the scenario delta and are not expected to. ' +
      'Drivers interact — a capacity-price cut and a tighter S/D compress the same reserve ' +
      'revenue, so applying them together is less than the sum of applying each alone. The ' +
      'residual is that interaction, reported rather than tuned away.',
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const offline = argv.includes('--offline');
  const dir = argv.find((a) => !a.startsWith('--')) ?? join(PROJECTS_DIR, 'prosperus');
  const waccArg = argv.find((a) => a.startsWith('--wacc='));
  const wacc = waccArg ? Number(waccArg.split('=')[1]) : DEFAULT_WACC;

  const scenarios = loadScenarios();
  const configs = loadConfigDir(dir);
  if (!configs.length) { console.error(`no project configs found in ${dir}`); process.exit(2); }

  const { kv, meta } = await getKV({ offline });
  if (!meta.verified) {
    console.warn('[warn] KV snapshot is UNVERIFIED — outputs are provisional, do not deliver');
  }

  const { loadEngine, runProject } = await import('./engine.mjs');
  const baseline = await runProject(configs[0], kv, { engine: await loadEngine(), scenario: 'base' });

  const { central, central_ebitda_20yr, rows } = await runSensitivity(configs, kv, scenarios, { wacc, baseline });

  // Interaction residual against the two full scenario runs.
  const downFull = headlineOf(await runScenario(
    configs, kv, { ...CENTRAL_DRIVERS, ...scenarios.scenarios.downside.drivers }, { wacc, baseline }));
  const upFull = headlineOf(await runScenario(
    configs, kv, { ...CENTRAL_DRIVERS, ...scenarios.scenarios.upside.drivers }, { wacc, baseline }));

  const breaches = signBreaches(rows);

  const payload = {
    generated_at: new Date().toISOString(),
    engine_version: 'v7.3',
    kv_source: meta.kv_source,
    kv_verified: meta.verified,
    source_dir: repoRelative(dir),
    wacc,
    basis:
      'Portfolio consolidated EBITDA, one driver perturbed at a time from Central. Δ columns are ' +
      'reported on both the Y1 and the 20-year basis; ranking and sign sanity use the 20-year ' +
      'figure because Y1 is structurally blind to rte_decay_pp_yr.',
    central,
    central_ebitda_20yr,
    drivers: rows,
    sign_sanity: {
      status: breaches.length ? 'BREACHED' : 'ok',
      rule: 'observed direction must equal the direction declared in scenario-overlay.mjs',
      breaches,
    },
    interaction: {
      downside: interactionResidual(rows, central, downFull, 'down'),
      upside: interactionResidual(rows, central, upFull, 'up'),
    },
  };
  const { path } = writeRunOutput('sensitivity.json', payload, {
    runner: 'sensitivity', subject: 'prosperus-portfolio',
    inputs: { configs, wacc, source_dir: repoRelative(dir), drivers: rows.map((r) => r.driver) },
    data_vintage: kvVintage(meta),
  });

  const pad = (s, n) => String(s).padStart(n);
  console.log(`\n  Sensitivity — portfolio Y1 EBITDA, Central = ${eur(central.ebitda_y1)}\n`);
  console.log('  driver                    down → up          ΔEBITDA Y1 dn    ΔEBITDA Y1 up    swing 20yr   dir');
  console.log('  ' + '─'.repeat(100));
  for (const r of rows) {
    console.log(
      `  ${r.driver.padEnd(25)}${String(`${r.down_value} → ${r.up_value}`).padEnd(18)}` +
      `${pad(eur(r.delta_ebitda_down), 15)}${pad(eur(r.delta_ebitda_up), 17)}${pad(eur(r.swing_20yr), 14)}` +
      `   ${r.observed_direction}${r.observed_direction === r.expected_direction ? '' : ' ⚠'}`
    );
  }
  console.log('  ' + '─'.repeat(100));
  for (const dirn of ['downside', 'upside']) {
    const i = payload.interaction[dirn];
    console.log(
      `  ${dirn.padEnd(9)} scenario Δ ${eur(i.scenario_delta_ebitda_y1)} · Σ single ${eur(i.sum_of_single_variable_deltas)}` +
      ` · interaction ${eur(i.interaction_residual)} (${i.residual_pct_of_scenario_delta}% of scenario Δ)`
    );
  }
  console.log(`\n  Sign sanity: ${breaches.length ? `BREACHED (${breaches.length})` : 'ok — all 8 drivers match their declared direction'}`);
  for (const b of breaches) console.log(`    ${b.driver}: expected ${b.expected}, observed ${b.observed}`);
  console.log(`\n  → ${path}\n`);
  if (breaches.length) process.exit(1);
}
