/**
 * Historical-year bootstrap runner — Phase 36.B2
 *
 * Replays the B1 hourly dispatch over every complete LT day-ahead year, turns
 * those into shape-year factors, scales the shipped engine's 20-year projection
 * by them, and reports the revenue distribution as exceedance percentiles plus
 * a client bridge at P50 and P90.
 *
 *   output/bootstrap-<project>-<scenario>.json
 *
 * Usage:
 *   node tools/consultancy/run-bootstrap.mjs
 *   node tools/consultancy/run-bootstrap.mjs --sensitivity       # 2015-2025 too
 *   node tools/consultancy/run-bootstrap.mjs --project prosperus/<id>.json
 *   node tools/consultancy/run-bootstrap.mjs --scenario downside
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig, loadEngine, runProject, OUTPUT_DIR, PROJECTS_DIR, eur,
} from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { loadPriceYear } from './backfill-entsoe.mjs';
import { buildReserveInputs } from './run-dispatch.mjs';
import { simulateYear } from './lib/dispatch.mjs';
import { buildBridge } from './bridge.mjs';
import { loadScenarios } from './run-scenarios.mjs';
import { loadEngineWithDrivers } from './scenario-overlay.mjs';
import {
  EXCEEDANCE_LEVELS, shapeYearFactors, applyShapeFactor, buildPercentiles,
  checkOrdering, lifetimeGross, resolvableBand,
} from './lib/bootstrap.mjs';

/**
 * Operator decision D4 set the primary sample at the post-crisis market
 * structure. 2026 is excluded on evidence, not on preference: the committed
 * file is 57.5 % covered (year to date), and a partial year cannot be a
 * shape-year for an annual dispatch.
 */
export const PRIMARY_YEARS = [2021, 2022, 2023, 2024, 2025];
export const SENSITIVITY_YEARS = [
  2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
];

const MIN_COVERAGE = 0.95;

/** Replay one shape-year through the hourly engine. */
export async function runShapeYear({ config, year, zone, sc, reserve, tp }) {
  const priceFile = loadPriceYear(zone, year);
  const prices = priceFile.prices_eur_mwh;
  const covered = prices.filter((p) => p != null).length / prices.length;
  if (covered < MIN_COVERAGE) {
    throw new Error(
      `${zone} ${year} is ${(covered * 100).toFixed(1)}% covered — a partial year cannot ` +
      `be a shape-year. Exclude it from the sample.`
    );
  }

  const sim = simulateYear({
    config, prices, yearIndex: 1, reserve, sc,
    opts: { total_cd: tp.total_cd, keepHours: false },
  });

  return {
    year,
    coverage: covered,
    native_resolution_hours: priceFile.native_resolution_hours ?? null,
    da_mean_eur_mwh: prices.reduce((a, b) => a + (b ?? 0), 0) / prices.length,
    revenue: sim.revenue,
    energy: sim.energy,
    cycles: sim.cycles,
    violations: sim.violations.length,
  };
}

/**
 * The distribution's raw material: one replayed shape-year per historical year,
 * the factors they imply, and the engine's projection scaled by each of them.
 *
 * Split out of `runBootstrap` so 36.B4 can put a contracted overlay on the same
 * scaled paths instead of rebuilding them — the percentile machinery has one
 * source, and a contracted P90 and a merchant P90 are guaranteed to be the same
 * construct measured on the same paths (rule #4).
 */
export async function bootstrapPaths({ config, kv, years, zone = 'LT', scenarioName = 'central' }) {
  // Client scenarios reach the engine through the driver overlay, not through
  // the scenario name — `runProject(…, {scenario})` alone leaves the constants
  // untouched. Central's drivers ARE the shipped constants, so its overlay is
  // an identity and the Central baseline is the unpatched engine.
  const scenarios = loadScenarios();
  const drivers = scenarios.scenarios[scenarioName]?.drivers;
  if (!drivers) throw new Error(`unknown scenario "${scenarioName}"`);
  const engine = await loadEngineWithDrivers(drivers);

  const sc = engine.REVENUE_SCENARIOS_FOR_TEST.base;
  const reserve = await buildReserveInputs(kv, sc, engine);
  const tp = engine.computeThroughputBreakdown(config.mw, config.duration_h, sc);

  const byYear = {};
  for (const y of years) byYear[y] = await runShapeYear({ config, year: y, zone, sc, reserve, tp });

  // The reference is the most recent complete year in the sample: the engine's
  // own base year is calibrated on current market state, so that is the year
  // its projection implicitly assumes.
  const refYear = String(Math.max(...years));
  const factors = shapeYearFactors(byYear, refYear);

  const baseline = await runProject(config, kv, { engine, scenario: 'base' });
  if (!/^v7/.test(baseline.model_version ?? '')) {
    throw new Error(`engine returned ${baseline.model_version}, expected v7.x — KV input incomplete`);
  }

  const scaled = {};
  for (const y of Object.keys(byYear)) scaled[y] = applyShapeFactor(baseline, factors[y]);

  return { engine, sc, byYear, refYear, factors, baseline, scaled };
}

export async function runBootstrap({
  config, kv, years, zone = 'LT', scenarioName = 'central', levels = EXCEEDANCE_LEVELS,
  regimeMixed = null,
}) {
  // A sample reaching before 2021 spans two market regimes: pre-crisis LT
  // day-ahead ran at €34-50/MWh mean against €85-95 post-2021. The P50-vs-Central
  // gate is then EXPECTED to miss, because Central is calibrated on current
  // market state and half the sample is not from that market. Reported as a
  // documented deviation rather than a failure — the 36.B1-N precedent.
  const spansRegimes = regimeMixed ?? years.some((y) => y < 2021);

  const { byYear, refYear, factors, baseline, scaled } =
    await bootstrapPaths({ config, kv, years, zone, scenarioName });

  const pct = buildPercentiles(scaled, levels);
  const orderingViolations = checkOrdering(pct.per_year, levels);

  // ── 3. Bridges at P50 and P90, from whole real shape-year paths ────────
  const bridges = {};
  for (const key of ['p50', 'p90']) {
    const path = pct.paths[key];
    if (!path?.shape_year) continue;
    bridges[key] = {
      shape_year: path.shape_year,
      resolved: path.resolved,
      reason: path.reason,
      ...buildBridge(scaled[path.shape_year], config),
    };
  }

  // ── 4. Gates ───────────────────────────────────────────────────────────
  const centralLifetime = lifetimeGross(baseline);
  const p50Lifetime = pct.paths.p50?.lifetime_eur ?? null;
  const p50VsCentral = p50Lifetime != null && centralLifetime > 0
    ? (p50Lifetime - centralLifetime) / centralLifetime : null;

  const gates = {
    p50_vs_central: {
      // Not a tautology: factors are relative to a FIXED reference year, so a
      // reference year that was unusually wide or narrow shows up here.
      what: 'P50 lifetime gross vs the Central projection',
      central_eur: centralLifetime,
      p50_eur: p50Lifetime,
      delta_pct: p50VsCentral,
      tolerance_pct: 0.15,
      pass: p50VsCentral == null ? null
        : spansRegimes ? false : Math.abs(p50VsCentral) <= 0.15,
      expected_deviation: spansRegimes,
      detail: p50VsCentral == null ? 'no P50' :
        `P50 is ${(p50VsCentral * 100).toFixed(1)}% from Central ` +
        `(reference shape-year ${refYear}; the median shape-year is ` +
        `${pct.paths.p50?.shape_year})` +
        (spansRegimes
          ? ' — EXPECTED: the sample reaches before 2021 and spans two market regimes ' +
            '(pre-crisis LT DA mean €34-50/MWh vs €85-95 post-2021), while Central is ' +
            'calibrated on current market state. This measures the regime gap; it is ' +
            'not a reconciliation failure. The primary post-2021 sample is the gated one.'
          : ''),
    },
    percentile_ordering: {
      what: 'P99 ≤ P90 ≤ P75 ≤ P50 in every projection year',
      pass: orderingViolations.length === 0,
      violations: orderingViolations,
      detail: orderingViolations.length === 0
        ? 'strict ordering holds in all 20 years'
        : `${orderingViolations.length} violations`,
    },
    traceability: {
      what: 'Every distribution input is a replayed shape-year — no synthetic draws',
      pass: Object.values(byYear).every((d) => d.coverage >= MIN_COVERAGE),
      detail: `${Object.keys(byYear).length} shape-years, all ≥ ${MIN_COVERAGE * 100}% covered`,
    },
    no_constraint_violations: {
      what: 'No hour in any shape-year breaks a physical constraint',
      pass: Object.values(byYear).every((d) => d.violations === 0),
      detail: Object.entries(byYear)
        .filter(([, d]) => d.violations > 0)
        .map(([y, d]) => `${y}: ${d.violations}`)
        .join(', ') || 'clean across every shape-year',
    },
  };

  return {
    meta: {
      phase: '36.B2',
      project_id: config.project_id,
      scenario: scenarioName,
      zone,
      shape_years: years,
      reference_shape_year: Number(refYear),
      n_shape_years: years.length,
      resolvable_band: resolvableBand(years.length),
      generated_from: 'tools/consultancy/run-bootstrap.mjs',
    },
    basis: {
      reserve_basis: 'calibrated-flat (see D3)',
      reserve_note:
        'Reserve capacity and activation prices are held flat at their calibrated values ' +
        'across every shape-year — no multi-year sub-daily Baltic reserve series exists ' +
        '(Pause A §1.5, operator decision D3). Capacity revenue therefore varies between ' +
        'shape-years only through committable MW, never through price. This distribution ' +
        'is a DAY-AHEAD spread and understates total revenue variance.',
      day_ahead_basis:
        'ENTSO-E A44, LT zone, complete calendar years, sub-hourly points averaged into ' +
        'the hour (decision D1).',
      pre_sync_note:
        'Years before Feb 2025 are pre-synchronisation (BRELL). The arc permits them for ' +
        'DA SHAPE only, never for balancing calibration — which is exactly how they are ' +
        'used here, since the balancing side is flat by D3.',
      forward_transformation:
        'The shipped engine owns the forward path (degradation, saturation, CPI ' +
        'compression, spread growth, augmentation). Shape-year factors scale its revenue ' +
        'lines; no projection maths is restated here (rule #4).',
      percentile_method:
        'Empirical exceedance percentiles on Weibull plotting positions, linearly ' +
        'interpolated. A sample of N resolves only [1/(N+1), N/(N+1)]; levels outside ' +
        'that band are reported with resolved:false and clamped to the extreme order ' +
        'statistic. They are NOT measurements.',
    },
    shape_years: byYear,
    factors,
    percentiles: pct,
    bridges,
    gates,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };

  const projectArg = arg('project', 'kkme-reference.json');
  const configPath = existsSync(projectArg) ? projectArg : join(PROJECTS_DIR, projectArg);
  const config = loadConfig(configPath);
  const scenarioName = arg('scenario', 'central');
  const zone = arg('zone', 'LT');
  const years = argv.includes('--sensitivity') ? SENSITIVITY_YEARS : PRIMARY_YEARS;

  const snapshot = await getKV({ offline: argv.includes('--offline') });
  const kv = snapshot.kv || snapshot;

  await loadEngine(); // warm the memoised base engine before the overlay
  const payload = await runBootstrap({ config, kv, years, zone, scenarioName });

  const band = payload.meta.resolvable_band;
  console.log(
    `\n── 36.B2 bootstrap · ${config.project_id} · ${scenarioName} · ` +
    `${years.length} shape-years (${years[0]}-${years[years.length - 1]}) ──`
  );
  console.log(
    `sample resolves exceedance P${Math.round(band.min_p * 100)}-P${Math.round(band.max_p * 100)}; ` +
    `reference shape-year ${payload.meta.reference_shape_year}\n`
  );

  // Attributed lines throughout, so the printed revenue and the factor beside
  // it share a basis. The raw `revenue.arbitrage` carries the whole charging
  // cost and is negative in most years (36.B1-K); printing it next to a
  // positive factor would read as a contradiction.
  console.log('shape-year dispatch, attributed basis (36.B1-K) — and the factor it implies:');
  for (const [y, d] of Object.entries(payload.shape_years)) {
    const f = payload.factors[y];
    const a = d.revenue.attributed;
    console.log(
      `  ${y}  DA mean €${d.da_mean_eur_mwh.toFixed(1).padStart(6)}/MWh  ` +
      `cap ${eur(a.capacity).padStart(8)} ×${f.capacity.toFixed(3)}   ` +
      `arb_net ${eur(a.arbitrage_net).padStart(8)} ×${f.arbitrage.toFixed(3)}   ` +
      `act_net ${eur(a.activation_net).padStart(8)} ×1.000 (pinned)`
    );
  }

  console.log('\nlifetime gross by shape-year path:');
  for (const l of payload.percentiles.lifetimes.slice().sort((a, b) => b.lifetime - a.lifetime)) {
    console.log(`  ${l.year}  ${eur(l.lifetime)}`);
  }

  console.log('\nexceedance percentiles (lifetime gross):');
  for (const [k, p] of Object.entries(payload.percentiles.paths)) {
    console.log(
      `  ${k.toUpperCase().padEnd(4)} ${p.lifetime_eur == null ? 'n/a' : eur(p.lifetime_eur).padStart(9)}  ` +
      `${p.resolved ? 'resolved' : 'NOT RESOLVED'}  ` +
      `${p.shape_year ? `→ shape-year ${p.shape_year}` : ''}` +
      `${p.reason ? `\n         ${p.reason}` : ''}`
    );
  }

  console.log('\nY1 gross by percentile path:');
  const y1 = payload.percentiles.per_year[0];
  for (const p of EXCEEDANCE_LEVELS) {
    const k = `p${Math.round(p * 100)}`;
    console.log(`  ${k.toUpperCase().padEnd(4)} ${eur(y1[k]).padStart(9)}  ${y1[`${k}_resolved`] ? '' : '(not resolved)'}`);
  }

  console.log('\ngates:');
  let failed = 0;
  for (const [name, g] of Object.entries(payload.gates)) {
    const expected = g.expected_deviation === true;
    const mark = g.pass === true ? '✓' : g.pass === null ? '–' : expected ? '!' : '✗';
    if (g.pass === false && !expected) failed++;
    console.log(`${mark} ${name}: ${g.detail}`);
  }

  // Distinct file per sample: the sensitivity run answers a different question
  // and must not silently replace the gated primary result.
  const suffix = argv.includes('--sensitivity') ? '-sensitivity' : '';
  const out = join(OUTPUT_DIR, `bootstrap-${config.project_id}-${scenarioName}${suffix}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nwrote ${out}`);
  process.exit(failed > 0 ? 1 : 0);
}
