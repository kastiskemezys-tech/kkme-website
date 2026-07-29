/**
 * Degradation loop runner — Phase 36.B5
 *
 * Closes the dispatch ↔ SOH loop on a real asset over a real price year and
 * reports what closing it costs: the fixed-point cycling rate, the SOH
 * trajectory before and after, the residual left by stopping at the arc's two
 * passes, and the measured contraction ratio that says the iteration converges
 * rather than merely appearing to.
 *
 *   output/degradation-<project>-<zone><year>.json
 *
 * Usage:
 *   node tools/consultancy/run-degradation.mjs --offline
 *   node tools/consultancy/run-degradation.mjs --year 2024 --years 20
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadEngine, OUTPUT_DIR, PROJECTS_DIR } from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { loadPriceYear } from './backfill-entsoe.mjs';
import { buildReserveInputs } from './run-dispatch.mjs';
import { simulateYear } from './lib/dispatch.mjs';
import {
  closeDegradationLoop, meanRealisedCd, DEFAULT_TOLERANCE_CD, ARC_PASSES,
} from './lib/degradation.mjs';

/** Most recent complete LT shape-year — the same reference the bootstrap uses. */
export const DEFAULT_SHAPE_YEAR = 2025;
export const DEFAULT_HORIZON = 20;

/**
 * Run the whole projection horizon at one assumed cycling rate.
 *
 * The price shape is held IDENTICAL across projection years on purpose: the only
 * thing that may move between passes is the SOH-scaled energy window, so any
 * residual is attributable to the loop and not to a price path.
 */
export function runHorizon({ config, prices, years, reserve, sc, cdTotal, engine }) {
  const per_year = [];
  for (let yr = 1; yr <= years; yr++) {
    per_year.push(simulateYear({
      config, prices, yearIndex: yr, reserve, sc,
      opts: { total_cd: cdTotal, keepHours: false },
    }));
  }
  return {
    per_year,
    realised_cd: meanRealisedCd(per_year),
    soh_trajectory: per_year.map((y, i) => ({ yr: i + 1, soh: y.meta?.soh ?? null })),
    lifetime_discharge_mwh: per_year.reduce((a, y) => a + y.energy.discharged_mwh, 0),
    lifetime_revenue_eur: per_year.reduce((a, y) => a + y.revenue.gross, 0),
    engine_version: engine?.MODEL_VERSION ?? null,
  };
}

export async function runDegradation({
  config, kv, shapeYear = DEFAULT_SHAPE_YEAR, zone = 'LT', years = DEFAULT_HORIZON,
  tolerance = DEFAULT_TOLERANCE_CD, maxPasses = 8,
}) {
  const engine = await loadEngine();
  const sc = engine.REVENUE_SCENARIOS_FOR_TEST.base;
  const dur_h = config.duration_h ?? config.mwh / config.mw;
  const prices = loadPriceYear(zone, shapeYear).prices_eur_mwh;
  const reserve = await buildReserveInputs(kv, sc, engine);

  // The open-loop starting point: the engine's own throughput-derived cycling
  // rate, on the 36.B5 DELIVERED basis so the loop starts where the engine
  // actually is rather than where it used to be.
  const y1mix = engine.computeTradingMix(kv, dur_h, (config.cod_year ?? 2028) + 1, 'base', sc, 1);
  const tp = engine.computeThroughputBreakdown(config.mw, dur_h, sc, {
    da_utilisation: Math.min(1, Math.max(0, y1mix.trading_fraction)),
    availability: sc.avail,
  });

  const runs = [];
  const loop = closeDegradationLoop({
    cd0: tp.total_cd, tolerance, maxPasses,
    run: (cd) => {
      const h = runHorizon({ config, prices, years, reserve, sc, cdTotal: cd, engine });
      runs.push({ cd, soh_trajectory: h.soh_trajectory, lifetime_revenue_eur: h.lifetime_revenue_eur });
      return h;
    },
  });

  const open = runs[0];
  const closed = runs[runs.length - 1];

  return {
    meta: {
      phase: '36.B5',
      project_id: config.project_id,
      zone,
      shape_year: shapeYear,
      horizon_years: years,
      dur_h,
      generated_from: 'tools/consultancy/run-degradation.mjs',
    },
    basis: {
      loop:
        'Fixed-point iteration on cycles/day: the assumed rate picks the SOH curve, the SOH ' +
        'curve sets the usable energy window, the dispatch realises a rate of its own, and that ' +
        'rate is fed back. Prices, reserve volumes and the policy are held fixed across passes, ' +
        'so the residual is attributable to the loop alone.',
      starting_point:
        'The engine\'s throughput-derived cycling rate on the 36.B5 DELIVERED basis (anchor × ' +
        'trading fraction × availability), so the loop starts where the engine is.',
      price_shape:
        `A single LT shape-year (${shapeYear}) replayed for every projection year. Holding the ` +
        'shape constant is deliberate: it isolates the SOH effect from price-path variation, ' +
        'which is what 36.B2\'s bootstrap measures separately.',
      not_repriced:
        'The loop moves no price and no revenue assumption. It moves the usable energy window ' +
        'and nothing else.',
    },
    open_loop: {
      cd: loop.cd0,
      efc_yr: loop.cd0 * 365,
      soh_trajectory: open.soh_trajectory,
      lifetime_revenue_eur: open.lifetime_revenue_eur,
    },
    closed_loop: {
      cd: loop.cd_final,
      efc_yr: loop.cd_final * 365,
      soh_trajectory: closed.soh_trajectory,
      lifetime_revenue_eur: closed.lifetime_revenue_eur,
    },
    effect: {
      cd_delta: loop.cd_final - loop.cd0,
      cd_delta_pct: loop.cd0 > 0 ? (loop.cd_final - loop.cd0) / loop.cd0 : null,
      soh_at_yr20_open: open.soh_trajectory.at(-1)?.soh ?? null,
      soh_at_yr20_closed: closed.soh_trajectory.at(-1)?.soh ?? null,
      lifetime_revenue_delta_eur: closed.lifetime_revenue_eur - open.lifetime_revenue_eur,
      lifetime_revenue_delta_pct: open.lifetime_revenue_eur > 0
        ? (closed.lifetime_revenue_eur - open.lifetime_revenue_eur) / open.lifetime_revenue_eur
        : null,
    },
    convergence: {
      converged: loop.converged,
      tolerance: loop.tolerance,
      n_passes: loop.n_passes,
      residual_cd: loop.residual_cd,
      residual_rel: loop.residual_rel,
      contraction: loop.contraction,
      passes: loop.passes,
      two_pass: loop.two_pass,
      arc_claim: `The arc states the loop converges in ${ARC_PASSES} passes for realistic parameters. ` +
        `Measured: ${loop.two_pass.within_tolerance ? 'it does' : 'it does not'} — residual after ` +
        `${ARC_PASSES} passes is ${loop.two_pass.residual_cd.toExponential(2)} c/d ` +
        `(${((loop.two_pass.residual_rel ?? 0) * 100).toFixed(4)} %), against a tolerance of ` +
        `${loop.tolerance}. Full convergence took ${loop.n_passes}.`,
    },
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
  const shapeYear = Number(arg('year', DEFAULT_SHAPE_YEAR));
  const years = Number(arg('years', DEFAULT_HORIZON));

  const snapshot = await getKV({ offline: argv.includes('--offline') });
  const kv = snapshot.kv || snapshot;

  const payload = await runDegradation({ config, kv, shapeYear, years });
  const c = payload.convergence;

  console.log(
    `\n── 36.B5 degradation loop · ${config.project_id} · LT ${shapeYear} shape · ` +
    `${years}-yr horizon ──\n`
  );
  console.log('pass   cd in     realised    cd out      |Δ|');
  for (const p of c.passes) {
    console.log(
      `  ${String(p.pass).padStart(2)}  ${p.cd_in.toFixed(6)}  ${p.realised_cd.toFixed(6)}  ` +
      `${p.cd_out.toFixed(6)}  ${p.abs_delta.toExponential(2)}`
    );
  }

  console.log(`\nopen loop    ${payload.open_loop.cd.toFixed(4)} c/d  (${Math.round(payload.open_loop.efc_yr)} EFC/yr)`);
  console.log(`closed loop  ${payload.closed_loop.cd.toFixed(4)} c/d  (${Math.round(payload.closed_loop.efc_yr)} EFC/yr)`);
  console.log(`SOH at yr ${years}   ${(payload.effect.soh_at_yr20_open * 100).toFixed(2)}% → ${(payload.effect.soh_at_yr20_closed * 100).toFixed(2)}%`);
  console.log(
    `lifetime rev €${Math.round(payload.open_loop.lifetime_revenue_eur).toLocaleString('en-US')} → ` +
    `€${Math.round(payload.closed_loop.lifetime_revenue_eur).toLocaleString('en-US')}  ` +
    `(${((payload.effect.lifetime_revenue_delta_pct ?? 0) * 100).toFixed(2)}%)`
  );

  console.log(`\nconverged     ${c.converged ? 'yes' : 'NO'} in ${c.n_passes} passes (tol ${c.tolerance} c/d)`);
  console.log(`residual      ${c.residual_cd.toExponential(2)} c/d`);
  console.log(`contraction   ${c.contraction == null ? 'n/a' : c.contraction.toFixed(4)}  (< 1 ⇒ the map contracts)`);
  console.log(`\n${c.arc_claim}`);

  const out = join(OUTPUT_DIR, `degradation-${config.project_id}-${'LT'}${shapeYear}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nwrote ${out}`);
  process.exit(c.converged ? 0 : 1);
}
