/**
 * Scenario runner — Phase 34.4
 *
 * Runs the three client-facing cases (Downside / Central / Upside) end to end:
 * every project through the engine under that case's driver values, through the
 * client bridge, up to a consolidated portfolio, plus a comparison summary.
 *
 * Two invariants are asserted rather than reported:
 *
 *   1. CENTRAL REPRODUCES BATCH-1 EXACTLY. Central's six driver values are the
 *      engine's shipped base constants, so the Central run is the same run
 *      Phase 34.3 made. It is compared field-for-field against a live
 *      `runPortfolio()` in the same process against the same KV — so the check
 *      measures code, not data drift. A mismatch is a mapping bug in this file
 *      and is fixed here; batch-1's outputs are never re-fitted to match.
 *
 *   2. MONOTONICITY. Downside < Central < Upside on every headline.
 *
 * Usage:
 *   node tools/consultancy/run-scenarios.mjs                    # all scenarios, live KV
 *   node tools/consultancy/run-scenarios.mjs --offline          # frozen fixture
 *   node tools/consultancy/run-scenarios.mjs --verify-mapping   # driver-mapping report only
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfigDir, loadEngine, runProject, writeOutput, PROJECTS_DIR, HERE, eur,
} from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { buildBridge, COST_DEFAULTS } from './bridge.mjs';
import { buildPortfolio, DEFAULT_WACC } from './portfolio.mjs';
import { runPortfolio } from './run-portfolio.mjs';
import {
  DRIVERS, DRIVER_IDS, CENTRAL_DRIVERS, loadEngineWithDrivers, verifyDrivers,
} from './scenario-overlay.mjs';

export const SCENARIOS_PATH = join(HERE, 'scenarios.json');

export function loadScenarios(path = SCENARIOS_PATH) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  for (const [name, sc] of Object.entries(raw.scenarios)) {
    const missing = ['fleet_realisation_pct', 'spread_growth_pct_yr', 'availability_pct',
      'trading_realisation', 'cap_price_delta_pct', 'cpi_floor']
      .filter((d) => sc.drivers[d] === undefined);
    if (missing.length) {
      throw new Error(`scenario "${name}" is missing driver(s): ${missing.join(', ')}`);
    }
    for (const d of Object.keys(sc.drivers)) {
      if (!DRIVERS[d]) throw new Error(`scenario "${name}" declares unknown driver "${d}"`);
    }
  }
  return raw;
}

// ── Running one scenario ───────────────────────────────────────────────────

/**
 * Apply the runner-side (non-engine) drivers to a project config.
 * Only `optimiser_pct_gross` lands here; it is a cost-stack rate on the client
 * bridge with no engine involvement.
 */
export function applyRunnerDrivers(config, drivers = {}) {
  const optimiser = drivers.optimiser_pct_gross;
  if (optimiser === undefined || optimiser === null) return config;
  return {
    ...config,
    costs: { ...(config.costs ?? {}), optimiser_pct_gross: optimiser / 100 },
  };
}

/** Run every project under one driver set and roll it up. */
export async function runScenario(configs, kv, drivers, { wacc = DEFAULT_WACC, baseline = null } = {}) {
  const engine = await loadEngineWithDrivers(drivers);
  const projects = [];
  for (const cfg of configs) {
    const config = applyRunnerDrivers(cfg, drivers);
    // The overlay moves the constants the scenario name would have selected, so
    // the engine is always driven at 'base'. Anything else would apply a second,
    // undeclared set of deltas on top.
    const result = await runProject(config, kv, { engine, scenario: 'base' });
    verifyDrivers(result, drivers, baseline);
    const bridge = buildBridge(result, config);
    projects.push({
      project_id: config.project_id,
      config,
      gross_capex: result.gross_capex,
      engine_npv_post_tax: result.npv_at_wacc,
      engine_project_irr: result.project_irr,
      ...bridge,
      engine: result,
    });
  }
  return buildPortfolio(projects, { wacc });
}

/** The six numbers the comparison summary reports per scenario. */
export function headlineOf(portfolio) {
  return {
    gross_y1: portfolio.bridge_y1.gross_market_revenues,
    ebitda_y1: portfolio.bridge_y1.project_ebitda,
    prefin_cf_y1: portfolio.bridge_y1.pre_financing_cf,
    sum_20yr_net: portfolio.bridge_totals.net_market_revenue,
    npv: portfolio.portfolio.npv_pre_financing_pre_tax,
    moic: portfolio.portfolio.moic,
  };
}

export const HEADLINE_KEYS = ['gross_y1', 'ebitda_y1', 'prefin_cf_y1', 'sum_20yr_net', 'npv', 'moic'];

/**
 * Downside < Central < Upside on every headline.
 * Returns the list of breaches; empty means monotone.
 */
export function monotonicityBreaches(headlines, order = ['downside', 'central', 'upside']) {
  const breaches = [];
  for (const key of HEADLINE_KEYS) {
    for (let i = 1; i < order.length; i++) {
      const lo = headlines[order[i - 1]]?.[key];
      const hi = headlines[order[i]]?.[key];
      if (lo == null || hi == null) continue;
      if (!(lo < hi)) {
        breaches.push({ key, lower: order[i - 1], upper: order[i], lower_value: lo, upper_value: hi });
      }
    }
  }
  return breaches;
}

// ── The Central invariant ──────────────────────────────────────────────────

const HEADLINE_PATHS = [
  ['portfolio', 'npv_pre_financing_pre_tax'],
  ['portfolio', 'moic'],
  ['portfolio', 'gross_capex'],
  ['portfolio', 'payback_years'],
];

/**
 * Deep-compare a Central scenario run against a plain batch-1 portfolio run.
 * Compares every bridge line in every calendar year, every project total, and
 * the portfolio headlines. Returns the differing paths (empty = exact).
 */
export function centralDiff(central, batch1) {
  const diffs = [];
  const push = (path, a, b) => { if (a !== b) diffs.push({ path, central: a, batch1: b }); };

  for (const p of HEADLINE_PATHS) {
    push(p.join('.'), p.reduce((o, k) => o?.[k], central), p.reduce((o, k) => o?.[k], batch1));
  }

  const lines = Object.keys(batch1.bridge_totals);
  for (const line of lines) {
    push(`bridge_totals.${line}`, central.bridge_totals[line], batch1.bridge_totals[line]);
  }

  if (central.bridge_20yr.length !== batch1.bridge_20yr.length) {
    push('bridge_20yr.length', central.bridge_20yr.length, batch1.bridge_20yr.length);
  } else {
    for (let i = 0; i < batch1.bridge_20yr.length; i++) {
      const a = central.bridge_20yr[i], b = batch1.bridge_20yr[i];
      for (const line of lines) push(`bridge_20yr[${b.cal_year}].${line}`, a[line], b[line]);
    }
  }

  for (let i = 0; i < batch1.per_project.length; i++) {
    const a = central.per_project[i], b = batch1.per_project[i];
    for (const k of ['npv_pre_financing_pre_tax', 'moic', 'payback_years', 'engine_npv_post_tax', 'engine_project_irr']) {
      push(`per_project[${b.project_id}].${k}`, a?.[k], b[k]);
    }
    for (const line of lines) {
      push(`per_project[${b.project_id}].bridge_totals.${line}`, a?.bridge_totals?.[line], b.bridge_totals[line]);
    }
  }
  return diffs;
}

// ── Driver-mapping verification (run this before trusting any scenario) ────

/**
 * Empirically establish what each driver moves. Perturbs one driver at a time
 * from Central on a single project and records the engine's echo plus the
 * resulting Y1 revenue / EBITDA delta. The declared `effect` strings in
 * scenario-overlay.mjs are checked against this, not the other way round.
 */
export async function verifyMapping(config, kv, scenarios) {
  const baseEngine = await loadEngine();
  const baseline = await runProject(config, kv, { engine: baseEngine, scenario: 'base' });
  const baseBridge = buildBridge(baseline, config);

  const rows = [];
  for (const id of DRIVER_IDS) {
    const def = DRIVERS[id];
    // Probe at the Downside value where the client defines one, else the
    // sensitivity-only "down" figure.
    const probe = scenarios.scenarios.downside.drivers[id]
      ?? scenarios.sensitivity_only[id]?.down;
    if (probe === undefined) { rows.push({ driver: id, probe: null, note: 'no probe value' }); continue; }

    const drivers = { ...CENTRAL_DRIVERS, [id]: probe };
    const cfg = applyRunnerDrivers(config, drivers);
    const engine = await loadEngineWithDrivers(drivers);
    const result = await runProject(cfg, kv, { engine, scenario: 'base' });
    const echoOk = def.verify(result, probe, baseline);
    const bridge = buildBridge(result, cfg);

    rows.push({
      driver: id,
      label: def.label,
      unit: def.unit,
      reach: def.reach,
      engine_binding: def.engine_binding,
      engine_site: def.engine_site,
      declared_effect: def.effect,
      central: def.central,
      probe,
      echo_central: def.echo(baseline),
      echo_probe: def.echo(result),
      echo_verified: echoOk,
      delta_gross_y1: bridge.bridge_y1.gross_market_revenues - baseBridge.bridge_y1.gross_market_revenues,
      delta_ebitda_y1: bridge.bridge_y1.project_ebitda - baseBridge.bridge_y1.project_ebitda,
      delta_ebitda_20yr: bridge.bridge_totals.project_ebitda - baseBridge.bridge_totals.project_ebitda,
    });
  }
  return {
    probe_project: config.project_id,
    baseline_gross_y1: baseBridge.bridge_y1.gross_market_revenues,
    baseline_ebitda_y1: baseBridge.bridge_y1.project_ebitda,
    optimiser_pct_gross_default: COST_DEFAULTS.optimiser_pct_gross,
    drivers: rows,
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

  // ── Mapping verification ────────────────────────────────────────────────
  if (argv.includes('--verify-mapping')) {
    const report = await verifyMapping(configs[0], kv, scenarios);
    const path = writeOutput('driver-mapping.json', report);
    console.log(`\n  Driver mapping — probed on ${report.probe_project}` +
      ` (Y1 gross ${eur(report.baseline_gross_y1)}, EBITDA ${eur(report.baseline_ebitda_y1)})\n`);
    console.log('  driver                   reach         central → probe        echo ok   Δ gross Y1     Δ EBITDA Y1');
    console.log('  ' + '─'.repeat(104));
    for (const d of report.drivers) {
      console.log(
        `  ${String(d.driver).padEnd(24)}${String(d.reach ?? '—').padEnd(14)}` +
        `${String(`${d.central} → ${d.probe}`).padEnd(23)}${(d.echo_verified ? 'yes' : 'NO ').padEnd(10)}` +
        `${String(eur(d.delta_gross_y1)).padStart(11)}${String(eur(d.delta_ebitda_y1)).padStart(16)}`
      );
    }
    console.log(`\n  → ${path}\n`);
    process.exit(report.drivers.some((d) => d.echo_verified === false) ? 1 : 0);
  }

  // ── Scenario runs ───────────────────────────────────────────────────────
  const order = scenarios.order;
  const results = {};
  const headlines = {};

  // Unpatched-engine reference, used by the drivers whose echo is relative
  // (the capacity-price delta reads as a ratio against the unperturbed price).
  const baseline = await runProject(configs[0], kv, { engine: await loadEngine(), scenario: 'base' });

  for (const name of order) {
    const sc = scenarios.scenarios[name];
    const drivers = { ...CENTRAL_DRIVERS, ...sc.drivers };
    const portfolio = await runScenario(configs, kv, drivers, { wacc, baseline });
    results[name] = portfolio;
    headlines[name] = headlineOf(portfolio);
    writeOutput(`scenario-${name}.json`, {
      generated_at: new Date().toISOString(),
      scenario: name,
      label: sc.label,
      note: sc.note,
      drivers,
      kv_source: meta.kv_source,
      kv_verified: meta.verified,
      ...portfolio,
    });
  }

  // ── Central invariant ───────────────────────────────────────────────────
  const batch1 = await runPortfolio(configs, kv, { wacc });
  const diffs = centralDiff(results.central, batch1);
  if (diffs.length) {
    console.error(`\n  CENTRAL INVARIANT BROKEN — ${diffs.length} field(s) differ from the batch-1 run.`);
    console.error('  This is a mapping bug in run-scenarios.mjs. Fix it here; never re-fit batch-1.\n');
    for (const d of diffs.slice(0, 10)) {
      console.error(`    ${d.path}: central ${d.central} vs batch-1 ${d.batch1}`);
    }
    process.exit(1);
  }

  const breaches = monotonicityBreaches(headlines, order);

  const summary = {
    generated_at: new Date().toISOString(),
    engine_version: 'v7.3',
    kv_source: meta.kv_source,
    kv_verified: meta.verified,
    source_dir: dir,
    wacc,
    order,
    drivers: Object.fromEntries(order.map((n) => [n, { ...CENTRAL_DRIVERS, ...scenarios.scenarios[n].drivers }])),
    headlines,
    central_invariant: {
      status: 'exact',
      compared_fields: 'every bridge line in every calendar year, per-project totals, portfolio NPV/MOIC/payback/CAPEX',
      basis: 'live runPortfolio() in the same process against the same KV — measures code, not data drift',
    },
    monotonicity: {
      status: breaches.length ? 'BREACHED' : 'ok',
      rule: 'Downside < Central < Upside on every headline',
      breaches,
    },
  };
  const path = writeOutput('scenario-summary.json', summary);

  const pad = (s, n) => String(s).padStart(n);
  console.log('\n  Scenario comparison — portfolio consolidated\n');
  console.log('  scenario     Gross Y1     EBITDA Y1   Pre-fin CF Y1   20-yr net rev        NPV    MOIC');
  console.log('  ' + '─'.repeat(88));
  for (const name of order) {
    const h = headlines[name];
    console.log(
      `  ${scenarios.scenarios[name].label.padEnd(11)}${pad(eur(h.gross_y1), 11)}${pad(eur(h.ebitda_y1), 14)}` +
      `${pad(eur(h.prefin_cf_y1), 16)}${pad(eur(h.sum_20yr_net), 16)}${pad(eur(h.npv), 11)}${pad(h.moic, 8)}`
    );
  }
  console.log('  ' + '─'.repeat(88));
  console.log('\n  Central invariant: EXACT — reproduces the batch-1 portfolio field-for-field.');
  console.log(`  Monotonicity: ${breaches.length ? `BREACHED (${breaches.length})` : 'ok — Downside < Central < Upside on all 6 headlines'}`);
  if (breaches.length) {
    for (const b of breaches) console.log(`    ${b.key}: ${b.lower} ${b.lower_value} ≥ ${b.upper} ${b.upper_value}`);
  }
  console.log(`\n  → ${path}\n`);
  if (breaches.length) process.exit(1);
}
