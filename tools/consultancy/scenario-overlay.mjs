/**
 * Scenario driver overlay — Phase 34.4
 *
 * The client locked six scenario drivers with explicit values per case. None of
 * the six is reachable through `computeRevenueV7(params, …)`: every one is a
 * module-level constant in `workers/fetch-s1.js` selected by the scenario NAME
 * (`'base' | 'conservative' | 'stress'`), so the only values the engine can
 * produce are the three the worker ships. The client's Downside and Upside
 * values are not among them. See DECISIONS.md 34.4-A for the full mapping.
 *
 * The worker is read-only for this batch, so the overlay solves it at the
 * runner level: it reads the worker source, substitutes the six constants by
 * exact anchored replacement, and imports the result as a separate ES module
 * instance (a `data:` URL, with the worker's relative imports rewritten to
 * absolute `file://` so they still resolve). Nothing is written to disk and
 * `workers/fetch-s1.js` is never modified — `git diff main -- workers/` stays
 * empty.
 *
 * Why this rather than post-hoc adjustment of the revenue lines: a post-hoc
 * multiplier is a second implementation of the engine's maths, and its failure
 * mode is a plausible wrong number nobody can check. Every driver here reaches
 * the engine at the exact site the engine itself uses, so a scenario run is the
 * engine's own arithmetic under different constants. Discipline rule #4 — one
 * canonical source per quantity — is preserved rather than worked around.
 *
 * Three things keep it honest:
 *   1. Every anchor must appear EXACTLY once in the source, or the load throws.
 *      A worker edit that moves a constant fails loudly instead of silently
 *      producing unperturbed numbers.
 *   2. Every driver that the engine echoes back in its own output carries a
 *      `verify()` that asserts the substitution actually landed.
 *   3. Central's driver values are the engine's shipped base values, so a
 *      Central run must reproduce the unpatched engine exactly. Asserted.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './engine.mjs';

const WORKER_PATH = join(REPO_ROOT, 'workers/fetch-s1.js');
const WORKER_DIR_URL = pathToFileURL(join(REPO_ROOT, 'workers/')).href;

/** Read the worker source once. Never written back. */
let _src = null;
export function workerSource() {
  if (_src === null) _src = readFileSync(WORKER_PATH, 'utf8');
  return _src;
}

// ── Driver definitions ─────────────────────────────────────────────────────

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/**
 * The eight drivers. Six are the client's scenario table; two more are
 * sensitivity-only (34.4 §3).
 *
 * `reach` records where the driver actually lands:
 *   'overlay'     — module constant, substituted in the engine source
 *   'runner-cost' — a cost-stack rate on the consultancy bridge; no engine involvement
 *
 * `effect` records what it moves, established empirically by the mapping
 * verification (`--verify-mapping`), not assumed.
 */
export const DRIVERS = {
  fleet_realisation_pct: {
    label: 'Pipeline realisation rate',
    unit: '%',
    central: 50,
    reach: 'overlay',
    engine_binding: 'PIPELINE_REALISATION.base',
    engine_site: 'workers/fetch-s1.js — projectFleet() supply projection',
    effect: 'fleet supply → S/D ratio → reserve price compression + market depth',
    expected_direction: 'inverse',  // more of the pipeline built = more competing supply
    toEngine: (v) => v / 100,
    anchor: '  base: 0.50,          // 50% of pipeline built — typical dropout',
    replace: (v) => `  base: ${v / 100},          // 50% of pipeline built — typical dropout`,
    verify: (result, v) => near(result.fleet_context?.pipeline_realisation, v / 100),
    echo: (result) => result.fleet_context?.pipeline_realisation,
  },

  spread_growth_pct_yr: {
    label: 'DA spread growth',
    unit: '%/yr',
    central: 2.0,
    reach: 'overlay',
    engine_binding: 'SPREAD_GROWTH.base',
    engine_site: 'workers/fetch-s1.js — computeTradingMix() scenario_factor on T',
    effect:
      'NONE at the current market state. It reaches its engine site correctly, but the only ' +
      'revenue path it feeds is trading_fraction, which is pinned at its 0.70 ceiling in every ' +
      'year of every project.',
    expected_direction: 'none',
    zero_effect_reason:
      'SPREAD_GROWTH enters revenue only through T_yr in computeTradingMix, and T_yr is used only ' +
      'to set trading_fraction = min(0.70, T/(T+R) × 0.75). Observed T/(T+R) is ~0.965 in Y1 and ' +
      'rises with renewable share, so the raw fraction is ~0.72 and the 0.70 clamp binds in all 20 ' +
      'years for all three projects. The multiplier that actually widens captured spreads in the ' +
      'revenue line is mix.spread_mult = spreadMultiplierYr(cal_year), a pure function of calendar ' +
      'year and Lithuanian renewable share with no scenario term. Reported as zero rather than ' +
      're-pointed at spreadMultiplierYr, which would be inventing an elasticity the engine does ' +
      'not model. See DECISIONS.md 34.4-C.',
    toEngine: (v) => v / 100,
    anchor: '  base: 0.02,          // spreads grow 2%/yr (more renewables)',
    replace: (v) => `  base: ${v / 100},          // spreads grow 2%/yr (more renewables)`,
    verify: (result, v) => near(result.fleet_context?.spread_growth, v / 100),
    echo: (result) => result.fleet_context?.spread_growth,
  },

  availability_pct: {
    label: 'Availability factor',
    unit: '%',
    central: 97,
    reach: 'overlay',
    engine_binding: 'REVENUE_SCENARIOS.base.avail',
    engine_site: 'workers/fetch-s1.js — energy-stacking constraint + rev_trd factor chain',
    effect: 'arbitrage revenue linearly; balancing only where the energy-stacking cap binds',
    expected_direction: 'direct',
    toEngine: (v) => v / 100,
    anchor: '    avail: 0.97, cycles_2h: 1.5, cycles_4h: 1.0, stack_factor: 0.70,',
    replace: (v) => `    avail: ${v / 100}, cycles_2h: 1.5, cycles_4h: 1.0, stack_factor: 0.70,`,
    verify: (result, v) => near(result.assumptions_panel?.availability?.value, Math.round(v * 10) / 10),
    echo: (result) => result.assumptions_panel?.availability?.value,
  },

  trading_realisation: {
    label: 'Trading realisation',
    unit: '×',
    central: 0.85,
    reach: 'overlay',
    engine_binding: 'TRADING_REALISATION.base',
    engine_site: 'workers/fetch-s1.js — rev_trd factor chain + T_base in computeTradingMix',
    effect: 'arbitrage revenue linearly, and the trading/reserve mix via T_base',
    expected_direction: 'direct',
    toEngine: (v) => v,
    anchor: '  base: 0.85,          // good optimizer (Capalo AI claims 85-90%)',
    replace: (v) => `  base: ${v},          // good optimizer (Capalo AI claims 85-90%)`,
    verify: (result, v) => near(result.assumptions?.trading_realisation, v),
    echo: (result) => result.assumptions?.trading_realisation,
  },

  cap_price_delta_pct: {
    label: 'Reserve capacity price delta',
    unit: '%',
    central: 0,
    reach: 'overlay',
    engine_binding: 'capPrice() observed/fallback €/MW/h',
    engine_site: 'workers/fetch-s1.js — capPrice(), feeding R_cap in computeTradingMix',
    effect: 'reserve capacity revenue; the €50/MW/h structural ceiling still applies after the delta',
    expected_direction: 'direct',
    toEngine: (v) => 1 + v / 100,
    anchor:
      '  const v = (observed != null && Number.isFinite(observed)) ? observed : CAP_PRICE_FALLBACK[product];',
    replace: (v) =>
      '  const v = ((observed != null && Number.isFinite(observed)) ? observed : CAP_PRICE_FALLBACK[product])' +
      ` * ${1 + v / 100};`,
    verify: (result, v, baseline) =>
      baseline == null ||
      near(result.signal_inputs?.afrr_cap, baseline.signal_inputs?.afrr_cap * (1 + v / 100), 1e-6),
    echo: (result) => result.signal_inputs?.afrr_cap,
  },

  cpi_floor: {
    label: 'Cannibalisation-index floor',
    unit: '×',
    central: 0.30,
    reach: 'overlay',
    engine_binding: 'cpiCurve() floor',
    engine_site: 'workers/fetch-s1.js — cpiCurve(), read only by cpi_{fcr,afrr,mfrr}_at_cod',
    // Established empirically, and it is the one surprise in the mapping: the
    // revenue path compresses through reservePrice() (floor_fraction 0.04) and
    // bidAcceptanceFactor() (floor 0.50). cpiCurve feeds three REPORTED fields
    // and nothing else, so this driver moves no cash line. Reported as zero
    // rather than re-pointed at a floor the client did not name.
    effect: 'REPORTING ONLY — cpi_*_at_cod disclosure fields. No revenue, EBITDA or cash-flow effect.',
    expected_direction: 'none',
    zero_effect_reason:
      'cpiCurve() is called at exactly three sites in computeRevenueV7 — cpi_fcr_at_cod, ' +
      'cpi_afrr_at_cod, cpi_mfrr_at_cod — all of which are disclosure fields. The revenue path ' +
      'compresses through reservePrice() (its own floor_fraction 0.04) and bidAcceptanceFactor() ' +
      '(its own floor 0.50). The CPI floor being decoupled from revenue is deliberate engine ' +
      'design, not an oversight: it is what keeps fleet status and MW edits revenue-safe. ' +
      'See DECISIONS.md 34.4-C.',
    toEngine: (v) => v,
    anchors: [
      {
        anchor: '  if (sd_ratio < 1.0) return Math.max(0.30, 1.0 - (sd_ratio - 0.6) * 1.5);',
        replace: (v) => `  if (sd_ratio < 1.0) return Math.max(${v}, 1.0 - (sd_ratio - 0.6) * 1.5);`,
      },
      {
        anchor: '  return Math.max(0.30, 0.40 - (sd_ratio - 1.0) * 0.08);',
        replace: (v) => `  return Math.max(${v}, 0.40 - (sd_ratio - 1.0) * 0.08);`,
      },
    ],
    verify: () => true,
    echo: (result) => result.cpi_afrr_at_cod ?? null,
  },

  rte_decay_pp_yr: {
    label: 'RTE decay',
    unit: 'pp/yr',
    central: 0.20,
    reach: 'overlay',
    engine_binding: 'RTE_DECAY_PP_PER_YEAR',
    engine_site: 'workers/fetch-s1.js — rteCurveFor(), feeding rev_trd and the LCOS energy balance',
    effect: 'arbitrage revenue in later years; floored at −4pp from BOL so the effect saturates',
    expected_direction: 'inverse',
    toEngine: (v) => v / 100,
    anchor: 'const RTE_DECAY_PP_PER_YEAR = 0.0020;',
    replace: (v) => `const RTE_DECAY_PP_PER_YEAR = ${v / 100};`,
    verify: (result, v) => {
      const arb = result.project?.arb_energy_20yr;
      if (!arb || arb.length < 2) return true; // no project block → nothing to check
      // The curve rounds to 4 dp, so compare at that resolution.
      return near(arb[0].rte - arb[1].rte, Math.round((v / 100) * 1e4) / 1e4, 1e-4);
    },
    // Operating year 2, not year 1: the curve is evaluated at t = 0 in year 1,
    // so year 1's RTE is the BOL constant for every decay rate. Year 2 is the
    // first year the driver is visible at all.
    echo: (result) => result.project?.arb_energy_20yr?.[1]?.rte ?? null,
  },

  optimiser_pct_gross: {
    label: 'Optimiser fee',
    unit: '% of gross',
    central: 12,
    reach: 'runner-cost',
    engine_binding: 'bridge.mjs COST_DEFAULTS.optimiser_pct_gross',
    engine_site: 'tools/consultancy/bridge.mjs — client 4-line cost stack',
    effect: 'EBITDA directly; no revenue effect, so gross and net market revenue are unchanged',
    expected_direction: 'inverse',
    toEngine: (v) => v / 100,
    verify: () => true,
    echo: () => null,
  },
};

export const DRIVER_IDS = Object.keys(DRIVERS);
export const OVERLAY_DRIVER_IDS = DRIVER_IDS.filter((id) => DRIVERS[id].reach === 'overlay');
export const CENTRAL_DRIVERS = Object.fromEntries(
  DRIVER_IDS.map((id) => [id, DRIVERS[id].central])
);

// ── Source transform ───────────────────────────────────────────────────────

export class OverlayAnchorError extends Error {}

/** Every anchor a driver owns, as a flat list. */
function anchorsOf(def) {
  return def.anchors ?? [{ anchor: def.anchor, replace: def.replace }];
}

/**
 * Apply the overlay substitutions to the worker source.
 * A driver whose value equals its Central value is skipped entirely, so a
 * Central run patches nothing and the source is character-identical.
 */
export function patchSource(src, drivers = {}) {
  let out = src;
  const applied = [];
  for (const id of OVERLAY_DRIVER_IDS) {
    const def = DRIVERS[id];
    const value = drivers[id];
    if (value === undefined || value === null) continue;
    if (near(value, def.central)) continue; // identity — leave the source alone
    for (const { anchor, replace } of anchorsOf(def)) {
      const hits = out.split(anchor).length - 1;
      if (hits !== 1) {
        throw new OverlayAnchorError(
          `driver "${id}": anchor matched ${hits} times in workers/fetch-s1.js, expected exactly 1. ` +
          `The engine moved — re-verify the mapping before trusting any scenario number.\n  anchor: ${anchor}`
        );
      }
      out = out.replace(anchor, replace(value));
    }
    applied.push(id);
  }
  return { source: out, applied };
}

/** Rewrite the worker's relative imports so the module can load from a data: URL. */
export function absolutiseImports(src) {
  return src.replace(
    /from '(\.\/[^']+)'/g,
    (_, spec) => `from '${new URL(spec, WORKER_DIR_URL).href}'`
  );
}

const _moduleCache = new Map();

/**
 * Load an engine instance with the given driver values applied.
 * Central (or an empty driver set) returns the unpatched module — the same
 * instance `engine.mjs::loadEngine()` uses.
 */
export async function loadEngineWithDrivers(drivers = {}) {
  const { source, applied } = patchSource(workerSource(), drivers);
  const key = applied.map((id) => `${id}=${drivers[id]}`).join('|') || 'central';
  if (_moduleCache.has(key)) return _moduleCache.get(key);

  const url = applied.length
    ? 'data:text/javascript;base64,' + Buffer.from(absolutiseImports(source)).toString('base64')
    : pathToFileURL(WORKER_PATH).href;

  const mod = await import(url);
  _moduleCache.set(key, mod);
  return mod;
}

/**
 * Assert that every driver the engine echoes back actually moved.
 * `baseline` is a Central result, needed by drivers whose echo is relative.
 */
export function verifyDrivers(result, drivers, baseline = null) {
  const failures = [];
  for (const id of DRIVER_IDS) {
    const def = DRIVERS[id];
    const value = drivers[id];
    if (value === undefined || value === null) continue;
    if (!def.verify(result, value, baseline)) {
      failures.push(
        `${id}: engine echoes ${JSON.stringify(def.echo(result))} for requested ${value} ${def.unit}`
      );
    }
  }
  if (failures.length) {
    throw new Error(
      'scenario driver verification failed — the overlay did not reach the engine:\n  ' +
      failures.join('\n  ')
    );
  }
  return true;
}
