/**
 * Hourly dispatch runner — Phase 36.B1
 *
 * Drives `lib/dispatch.mjs` over a real ENTSO-E price year and emits the
 * artefacts the arc doc's validation gates need:
 *
 *   output/dispatch-<project>-<year>.csv     8760 rows, one per hour
 *   output/dispatch-<project>-<year>.json    summary, gates, reconciliation
 *
 * Reserve prices and activation rates are resolved through the worker's own
 * `capPrice()` and scenario constants, so the dispatch engine and `/revenue`
 * read the same market state (rule #4).
 *
 * ── On the reconciliation design ──────────────────────────────────────────
 *
 * The arc asks for hourly-summed revenue to be reconciled against the
 * time-allocation model's Y1, with every delta attributed. Comparing the two
 * directly would confound the thing being measured with the price basis: the
 * hourly run uses one historical calendar year of real prices, while the
 * time-model's Y1 is a forward year carrying CPI compression and saturation.
 * A single number out of that comparison would be uninterpretable.
 *
 * So the runner measures the constraint directly instead. It runs the identical
 * year twice — once with the reserve-energy reservation enforced, once with it
 * disabled and nothing else changed — and reports the difference. That delta is
 * a clean measurement of what simultaneity costs, on one price basis, with one
 * variable moving. The comparison against `/revenue` Y1 is reported alongside as
 * context, with its price-basis caveat stated rather than buried.
 *
 * Usage:
 *   node tools/consultancy/run-dispatch.mjs --year 2024
 *   node tools/consultancy/run-dispatch.mjs --config <path> --year 2025 --scenario base
 *   node tools/consultancy/run-dispatch.mjs --year 2024 --no-csv
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadEngine, runProject, HERE, OUTPUT_DIR, PROJECTS_DIR } from './engine.mjs';
import { loadPriceYear } from './backfill-entsoe.mjs';
import { simulateYear } from './lib/dispatch.mjs';

const SNAPSHOT = join(OUTPUT_DIR, 'kv-snapshot.json');

/**
 * Resolve the reserve inputs from live KV through the engine's own price
 * resolution. Nothing here invents a price.
 */
export async function buildReserveInputs(kv, sc, engine) {
  const { capPrice, RESERVE_PRODUCTS } = engine;
  const s2 = kv.s2 || {};
  const act = kv.s2_activation_parsed || {};

  return {
    cap_price: {
      fcr: capPrice('fcr', s2.fcr_cap_avg, 1),
      afrr: capPrice('afrr', s2.afrr_cap_avg, 1),
      mfrr: capPrice('mfrr', s2.mfrr_cap_avg, 1),
    },
    act_price: {
      // Clearing prices and their per-product factors are transcribed from
      // `computeTradingMix` (:2840-2841, :2848-2849) — same source, same
      // defaults, same 0.55 / 0.75 realisation factors.
      fcr: 0,
      afrr: (act.lt?.afrr_p50 ?? 171) * 0.55,
      mfrr: (act.lt?.mfrr_p50 ?? 81) * 0.75,
    },
    // The canonical ENERGY anchors. These, not `act_rate_*`, are what
    // `computeThroughputBreakdown` uses to derive the 678 EFC that gate #3
    // checks against — so the hourly engine drains SoC from the same numbers.
    mwh_per_mw_yr: {
      fcr: sc.mwh_per_mw_yr_fcr,
      afrr: sc.mwh_per_mw_yr_afrr,
      mfrr: sc.mwh_per_mw_yr_mfrr,
    },
    // Procured-volume ceilings are not modelled per-hour in B1 (no multi-year
    // sub-daily procurement series exists — Pause A §1.5). Share caps bind.
    avail_mw: {},
    acceptance: { fcr: 1, afrr: 1, mfrr: 1 },
    shares: {
      fcr: RESERVE_PRODUCTS.fcr.share,
      afrr: RESERVE_PRODUCTS.afrr.share,
      mfrr: RESERVE_PRODUCTS.mfrr.share,
    },
  };
}

/**
 * RETIRED — Phase 36.B batch-2 Part 0 fixed the defect this measured.
 *
 * This estimated the shipped `computeDispatchV2`'s arbitrage overstatement under
 * operator decision D2 ("quantify, do not fix") by re-deriving V2's arbitrage
 * with the round-trip loss charged on the charge leg — valid only while V2 did
 * NOT charge it. V2 now does (36.B0-A), so re-applying `r * rte` to its output
 * would double-count the loss and report an overstatement that no longer exists.
 *
 * Deliberately fails rather than being deleted: the `--quantify-v2` flag lives
 * in operator notes and prior handovers, and a flag that silently returns a
 * wrong number is worse than one that explains itself. The measurement it used
 * to produce is preserved in DECISIONS.md 36.B1-E and 36.B0-A; the two
 * implementations are now pinned to each other permanently by the mirror class
 * in `workers/__tests__/dispatchV2.test.ts`.
 */
export function quantifyV2Overstatement() {
  throw new Error(
    'quantifyV2Overstatement is retired: Phase 36.B batch-2 Part 0 corrected the ' +
    'computeDispatchV2 RTE ledger, so this would double-charge the loss. See ' +
    'DECISIONS.md 36.B0-A and workers/__tests__/dispatchV2.test.ts.'
  );
}

function toCsv(rows) {
  const head = [
    'hour_index', 'da_price_eur_mwh', 'available', 'action', 'throttled',
    'soc_mwh', 'soc_pct', 'mw_fcr', 'mw_afrr', 'mw_mfrr',
    'mwh_charge', 'mwh_discharge', 'mwh_activation',
    'rev_capacity_eur', 'rev_activation_eur', 'rev_arbitrage_eur', 'efc_cumulative',
  ];
  const n = (v) => (v == null ? '' : typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.h, n(r.price), r.available ? 1 : 0, r.action, r.throttled ? 1 : 0,
      n(r.soc), n(r.soc_pct), n(r.mw_fcr), n(r.mw_afrr), n(r.mw_mfrr),
      n(r.mwh_charge), n(r.mwh_discharge), n(r.mwh_activation),
      n(r.rev_capacity), n(r.rev_activation), n(r.rev_arbitrage), n(r.efc_used),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

export async function runDispatch({ config, year, zone = 'LT', scenario = 'base', kv, writeFiles = true, writeCsv = true }) {
  const engine = await loadEngine();
  const sc = engine.REVENUE_SCENARIOS_FOR_TEST[scenario] ?? engine.REVENUE_SCENARIOS_FOR_TEST.base;

  const priceFile = loadPriceYear(zone, year);
  const prices = priceFile.prices_eur_mwh;
  const covered = prices.filter((p) => p != null).length;
  if (covered / prices.length < 0.95) {
    throw new Error(
      `${zone} ${year} is only ${Math.round((covered / prices.length) * 100)}% covered — ` +
      `not a complete year. Dispatch runs require a complete year.`
    );
  }

  const reserve = await buildReserveInputs(kv, sc, engine);

  // Throughput accounting supplies the cycle-depth the SOH curve blends on.
  const tp = engine.computeThroughputBreakdown(config.mw, config.duration_h, sc);

  const common = { config, prices, yearIndex: 1, reserve, sc };
  const constrained = simulateYear({ ...common, opts: { total_cd: tp.total_cd } });
  const unconstrained = simulateYear({
    ...common,
    opts: { total_cd: tp.total_cd, enforce_reserve_energy: false, keepHours: false },
  });

  // Context comparison against the shipped engine's Y1.
  const engineResult = await runProject(config, kv, { scenario });
  // The engine degrades to `v6_fallback` when its KV inputs are missing rather
  // than throwing. A dispatch run reconciled against a fallback result would be
  // quietly meaningless, so fail loudly instead.
  if (!/^v7/.test(engineResult.model_version ?? '')) {
    throw new Error(
      `engine returned ${engineResult.model_version}, expected v7.x — the KV input is ` +
      `incomplete. Pass the inner \`kv\` object, not the snapshot wrapper.`
    );
  }

  const c = constrained.revenue;
  const u = unconstrained.revenue;
  const reconciliation = {
    headline: {
      what: 'Cost of simultaneity — the reserve-energy reservation, isolated',
      method: 'Same project, same year, same prices, same scenario. One variable moves: the SoC headroom a committed MW requires.',
      constrained_gross_eur: c.gross,
      unconstrained_gross_eur: u.gross,
      delta_eur: u.gross - c.gross,
      delta_pct: u.gross > 0 ? (u.gross - c.gross) / u.gross : 0,
      by_line: {
        capacity: { constrained: c.capacity, unconstrained: u.capacity, delta: u.capacity - c.capacity },
        activation: { constrained: c.activation, unconstrained: u.activation, delta: u.activation - c.activation },
        arbitrage: { constrained: c.arbitrage, unconstrained: u.arbitrage, delta: u.arbitrage - c.arbitrage },
      },
      interpretation:
        'The hourly simulation confirms ' +
        `${u.gross > 0 ? ((c.gross / u.gross) * 100).toFixed(1) : '—'}% of the unconstrained ` +
        'revenue stack is simultaneously achievable once committed reserve MW must also hold the ' +
        'state of charge to deliver on it.',
    },
    vs_shipped_engine_y1: {
      caveat:
        'Different price bases. The hourly run uses one historical calendar year of realised ' +
        `day-ahead prices (${zone} ${year}); the shipped engine's Y1 is a forward year carrying ` +
        'CPI compression, fleet saturation and scenario drivers. This is context, not a gate.',
      hourly_gross_eur: c.gross,
      engine_y1_gross_eur: engineResult.gross_revenue_y1,
      by_line: {
        capacity: { hourly: c.capacity, engine_y1: engineResult.capacity_y1 },
        activation: { hourly: c.activation, engine_y1: engineResult.activation_y1 },
        arbitrage: { hourly: c.arbitrage, engine_y1: engineResult.arbitrage_y1 },
      },
      engine_cycles_per_year: engineResult.cycles_per_year,
      hourly_efc: constrained.cycles.efc_used,
    },
  };

  // ── Cycle attribution ────────────────────────────────────────────────────
  //
  // The arc's gate #3 wants the dispatch-derived cycle count within ±10 % of
  // the throughput-derived figure, "explained". It does not land there, and the
  // reason is the phase's second finding — so this decomposes the delta per
  // product rather than reporting one number that hides it.
  //
  // Note the engine carries TWO DA throughput figures, and they differ:
  //   · cycle accounting  — `computeThroughputBreakdown` uses the full
  //     `mwh_per_mw_yr_da_2h` (1100 MWh/MW/yr) at nameplate (:1287)
  //   · revenue           — `computeBaseYear` bills DA on the same figure
  //     scaled by `trading_fraction` (0.70) (:3178)
  // So the shipped engine charges cell wear for ~43 % more DA throughput than
  // it earns revenue on. That direction is conservative on both sides (more
  // wear, less income), which is why it has survived unnoticed — but it is a
  // contradictory branch of exactly the kind bankability test #5 asks about.
  // Flagged for 36.B5 (internal consistency), not changed here.
  const usable = constrained.meta.usable_mwh;
  const tpMwh = constrained.energy.throughput_by_product_mwh;
  const efcFromMwh = (mwh) => mwh / usable;
  const anchorEfc = {
    fcr: (sc.mwh_per_mw_yr_fcr * config.mw * engine.RESERVE_PRODUCTS.fcr.share) / config.mwh,
    afrr: (sc.mwh_per_mw_yr_afrr * config.mw * engine.RESERVE_PRODUCTS.afrr.share) / config.mwh,
    mfrr: (sc.mwh_per_mw_yr_mfrr * config.mw * engine.RESERVE_PRODUCTS.mfrr.share) / config.mwh,
    da: (config.duration_h <= 2 ? sc.mwh_per_mw_yr_da_2h : sc.mwh_per_mw_yr_da_4h) * config.mw / config.mwh,
  };
  const freeMwShare = 1 - constrained.commitment.avg_reserve_share;
  const cycleAttribution = {
    per_product: Object.fromEntries(
      ['fcr', 'afrr', 'mfrr', 'da'].map((p) => {
        const hourly = efcFromMwh(tpMwh[p] ?? 0);
        const anchor = anchorEfc[p];
        return [p, {
          hourly_efc: hourly,
          anchor_efc: anchor,
          delta_pct: anchor > 0 ? (hourly - anchor) / anchor : null,
          why:
            p === 'fcr'
              ? 'DRR derogation — no FCR commitment before 2028, so the anchor cannot be earned'
              : p === 'da'
                ? 'reserve commitment leaves only the residual MW for merchant cycling'
                : 'committed MW cut by the SoC reservation, so activation energy scales down with it',
        }];
      })
    ),
    da_coherence: {
      what: 'DA throughput should fall roughly in proportion to the MW left free after reserve commitment',
      free_mw_share: freeMwShare,
      da_achieved_vs_revenue_anchor:
        anchorEfc.da > 0 ? efcFromMwh(tpMwh.da) / (anchorEfc.da * 0.70) : null,
      note: 'These two ratios agreeing is the physical sanity check on the whole hour loop.',
    },
    engine_branch_gap: {
      cycle_branch_da_efc: anchorEfc.da,
      revenue_branch_da_efc: anchorEfc.da * 0.70,
      comment: 'trading_fraction 0.70 applies to DA revenue but not to DA cycle accounting',
    },
  };

  reconciliation.cycle_attribution = cycleAttribution;

  // ── Validation gates ─────────────────────────────────────────────────────
  const e = constrained.energy;
  const efc = constrained.cycles.efc_used;
  const engineEfc = engineResult.cycles_per_year;
  const gates = {
    energy_balance_exact: {
      pass: e.balance_error_rel < 1e-9,
      detail: `|Σcharge×RTE − (Σdischarge + Σactivation + ΔSoC)| = ${e.balance_error_mwh.toExponential(3)} MWh ` +
              `(relative ${e.balance_error_rel.toExponential(3)})`,
    },
    zero_constraint_violations: {
      pass: constrained.violations.length === 0,
      detail: `${constrained.violations.length} violation(s) over ${constrained.meta.hours} hours`,
    },
    // Reported as a documented deviation rather than quietly re-thresholded to
    // pass. The arc set ±10 %; the hourly run does not reach it, and the reason
    // is a finding, not noise. `reconciliation.cycle_attribution` carries the
    // per-product decomposition.
    cycle_count_consistent: {
      pass: engineEfc > 0 ? Math.abs(efc - engineEfc) / engineEfc <= 0.10 : null,
      expected_deviation: true,
      detail: `hourly ${efc.toFixed(1)} EFC vs throughput-derived ${engineEfc} EFC ` +
              `(${engineEfc > 0 ? (((efc - engineEfc) / engineEfc) * 100).toFixed(1) : '—'}%) — ` +
              `attributed: reserve products reconcile, DA cycling does not (see cycle_attribution)`,
    },
    // The gate that does carry a defensible pass criterion: DA throughput must
    // fall in proportion to the MW reserve commitment leaves free. If these
    // diverge, the hour loop is not behaving physically.
    da_throughput_coherent_with_free_mw: {
      pass: (() => {
        const a = cycleAttribution.da_coherence.free_mw_share;
        const b = cycleAttribution.da_coherence.da_achieved_vs_revenue_anchor;
        return a > 0 && b != null ? Math.abs(a - b) / a <= 0.25 : null;
      })(),
      detail: `free MW share ${(cycleAttribution.da_coherence.free_mw_share * 100).toFixed(1)}% vs ` +
              `DA achieved/revenue-anchor ${((cycleAttribution.da_coherence.da_achieved_vs_revenue_anchor ?? 0) * 100).toFixed(1)}%`,
    },
    warranty_never_breached: {
      pass: efc <= constrained.cycles.warranty_cap,
      detail: `${efc.toFixed(1)} / ${constrained.cycles.warranty_cap} EFC cap`,
    },
    hourly_below_unconstrained: {
      pass: c.gross <= u.gross,
      detail: 'the constrained run must not out-earn the unconstrained one',
    },
  };

  const payload = {
    generated_at: new Date().toISOString(),
    engine_version: engineResult.model_version,
    project: config.project_id,
    zone,
    price_year: year,
    price_source: priceFile.source,
    price_native_resolution: priceFile.native_resolution_hours,
    scenario,
    inputs: { reserve, scenario_constants: { avail: sc.avail, act_rate_afrr: sc.act_rate_afrr, act_rate_mfrr: sc.act_rate_mfrr } },
    meta: constrained.meta,
    basis: constrained.basis,
    revenue: constrained.revenue,
    energy: constrained.energy,
    cycles: constrained.cycles,
    commitment: constrained.commitment,
    activity: constrained.activity,
    reconciliation,
    gates,
    violations: constrained.violations.slice(0, 50),
  };

  if (writeFiles) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const base = `dispatch-${config.project_id}-${zone}-${year}`;
    writeFileSync(join(OUTPUT_DIR, `${base}.json`), JSON.stringify(payload, null, 2) + '\n');
    payload.files = [`${base}.json`];
    if (writeCsv && constrained.hours_detail) {
      writeFileSync(join(OUTPUT_DIR, `${base}.csv`), toCsv(constrained.hours_detail));
      payload.files.push(`${base}.csv`);
    }
  }

  return { payload, constrained, unconstrained, prices, engine };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };

  if (!existsSync(SNAPSHOT)) {
    console.error('No KV snapshot. Run: node tools/consultancy/kv-snapshot.mjs');
    process.exit(1);
  }
  // The snapshot file wraps the KV object in verification metadata; the engine
  // wants the inner object. Passing the wrapper degrades silently to
  // `v6_fallback` rather than throwing, so this unwrap is asserted below.
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const kv = snapshot.kv ?? snapshot;

  const configPath = arg('config', join(PROJECTS_DIR, 'kkme-reference.json'));
  const config = loadConfig(configPath);
  const year = Number(arg('year', 2024));
  const zone = arg('zone', 'LT');
  const scenario = arg('scenario', 'base');

  const { payload } = await runDispatch({
    config, year, zone, scenario, kv, writeCsv: !argv.includes('--no-csv'),
  });

  const eur = (n) => `€${(n / 1e6).toFixed(3)}M`;
  const r = payload.revenue;
  const h = payload.reconciliation.headline;

  console.log(`\n── ${config.project_id} · ${zone} ${year} · scenario ${scenario} ──`);
  console.log(`SOH ${(payload.meta.soh * 100).toFixed(1)}%  RTE ${(payload.meta.rte * 100).toFixed(1)}%  usable ${payload.meta.usable_mwh.toFixed(1)} MWh`);
  console.log(`availability ${(payload.meta.availability.realised * 100).toFixed(2)}% (${payload.meta.availability.planned_hours}h planned + ${payload.meta.availability.forced_hours}h forced)`);
  console.log(`\ngross ${eur(r.gross)} = capacity ${eur(r.capacity)} + activation ${eur(r.activation)} + arbitrage ${eur(r.arbitrage)}`);
  console.log(`  attributed: capacity ${eur(r.attributed.capacity)} + activation ${eur(r.attributed.activation_net)} + arbitrage ${eur(r.attributed.arbitrage_net)}`);
  console.log(`  (charging cost split by where the energy went: €${Math.round(r.attributed.cost_per_delivered_mwh)}/MWh delivered)`);
  console.log(`charging cost ${eur(r.charging_cost)}  ·  per MW-yr €${Math.round(r.per_mw_yr).toLocaleString('en-US')}`);
  console.log(`EFC ${payload.cycles.efc_used.toFixed(1)} / ${payload.cycles.warranty_cap} cap  ·  throttled ${payload.cycles.throttled_hours}h`);
  console.log(`charge ${payload.activity.charge_hours}h (${payload.activity.negative_price_charge_hours}h at negative prices) · discharge ${payload.activity.discharge_hours}h`);
  console.log(`avg committed reserve ${(payload.commitment.avg_reserve_share * 100).toFixed(1)}% of nameplate`);

  console.log(`\n── Cost of simultaneity ──`);
  console.log(`constrained   ${eur(h.constrained_gross_eur)}`);
  console.log(`unconstrained ${eur(h.unconstrained_gross_eur)}`);
  console.log(`delta         ${eur(h.delta_eur)}  (${(h.delta_pct * 100).toFixed(1)}%)`);
  console.log(h.interpretation);

  console.log(`\n── Gates ──`);
  let failed = 0;
  for (const [name, g] of Object.entries(payload.gates)) {
    const mark = g.pass === true ? '✓' : g.pass === null ? '–' : '✗';
    if (g.pass === false) failed++;
    console.log(`${mark} ${name}: ${g.detail}`);
  }

  // Operator decision D2 — retired by Phase 36.B batch-2 Part 0, which fixed the
  // defect instead of only measuring it. Left in place so the flag explains
  // itself rather than silently producing a number that no longer means anything.
  if (argv.includes('--quantify-v2')) {
    console.error(
      '\n--quantify-v2 is retired. Part 0 of Phase 36.B batch-2 corrected the\n' +
      'computeDispatchV2 RTE ledger and the negative-day clamp, so there is no\n' +
      'overstatement left to measure and this estimator would double-charge the\n' +
      'round-trip loss. See DECISIONS.md 36.B0-A for the measured before/after,\n' +
      'and workers/__tests__/dispatchV2.test.ts for the permanent mirror gate.\n'
    );
    process.exit(2);
  }

  if (payload.files) console.log(`\nwrote ${payload.files.join(', ')}`);
  process.exit(failed > 0 ? 1 : 0);
}
