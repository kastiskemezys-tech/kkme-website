/**
 * Assumptions register — Phase 34.5
 *
 * `assumptions-register.json` is the client-facing single source of truth for
 * every adjustable input. The rule that makes it worth having is that it
 * **documents the engine and never contradicts it** (discipline rule #4): every
 * row that corresponds to a live constant carries an `engine_binding`, and a
 * vitest asserts the register value equals what the code actually holds. The
 * register cannot drift from the model — this extends the `rteMirror` pattern
 * from a single constant to the whole assumption surface.
 *
 * Binding namespaces:
 *   worker:<name>     constant extracted from workers/fetch-s1.js by anchored regex
 *   engine:<path>     field the engine emits in its own output (dotted path)
 *   bridge:<name>     cost/CAPEX default on the consultancy bridge
 *   portfolio:<name>  portfolio-level constant
 *   driver:<id>       Central value of a Phase 34.4 scenario driver
 *   config:<id>.<key> value from a committed project config
 *   (null)            documented, not bound — sourced externally, no code equivalent
 *
 * Values that come from live market data (capacity prices, clearing prices,
 * fleet MW) are synced from the FROZEN KV FIXTURE, not from production. That
 * keeps the binding tests a gate on code rather than a detector of overnight
 * market movement — the same reasoning as the regression baseline. Those rows
 * carry `basis: "live-kv"` so the delivery generators know to refresh them from
 * the run that actually produced the client numbers.
 *
 * The `override` field is the Prosperus-adjustable mechanism: when non-null the
 * runner applies it in place of `value`. Overrides are never written back into
 * `value`, so the engine-derived figure and the client's edit stay distinct.
 *
 * Usage:
 *   node tools/consultancy/register.mjs            # check register vs live bindings
 *   node tools/consultancy/register.mjs --sync     # rewrite values from bindings
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig, loadConfigDir, loadEngine, runProject, PROJECTS_DIR, HERE,
} from './engine.mjs';
import { COST_DEFAULTS, CAPEX_DEFAULTS } from './bridge.mjs';
import { DEFAULT_WACC, CORRELATION_NOTE } from './portfolio.mjs';
import { DRIVERS } from './scenario-overlay.mjs';
import { workerSource } from './scenario-overlay.mjs';
import { loadFixtureKV } from './regression-reference.mjs';

export const REGISTER_PATH = join(HERE, 'assumptions-register.json');

export const CATEGORIES = ['technical', 'market', 'saturation', 'cost', 'capex', 'project', 'scenario-driver'];

// ── Worker-source constant extraction ──────────────────────────────────────

/**
 * Constants that live only as module-level literals in the worker and are
 * neither exported nor echoed in the output. Each pattern must match exactly
 * once, for the same reason the scenario overlay's anchors must: a silent miss
 * would let the register drift unnoticed.
 */
const WORKER_CONSTANTS = {
  'RTE_BOL.h2': { re: /const RTE_BOL = \{ h2: ([\d.]+), h4: [\d.]+ \};/, scale: 100 },
  'RTE_BOL.h4': { re: /const RTE_BOL = \{ h2: [\d.]+, h4: ([\d.]+) \};/, scale: 100 },
  RTE_DECAY_PP_PER_YEAR: { re: /const RTE_DECAY_PP_PER_YEAR = ([\d.]+);/, scale: 100 },
  RTE_FLOOR_DROP: { re: /const RTE_FLOOR_DROP = ([\d.]+);/, scale: 100 },
  'REVENUE_SCENARIOS.base.aug_restore': {
    re: /debt_margin_bp: 250, aug_cost_pct: [\d.]+, aug_restore: ([\d.]+),/, scale: 100,
  },
  'REVENUE_SCENARIOS.base.opex_esc': {
    re: /opex_per_kw_yr: 39, opex_esc: ([\d.]+),/, scale: 100,
  },
  'REVENUE_SCENARIOS.base.rtm_fee_pct': {
    re: /rtm_fee_pct: ([\d.]+), brp_fee_yr: \d+,/, scale: 100,
  },
  CAP_PRICE_CEIL: { re: /const CAP_PRICE_CEIL = (\d+);/, scale: 1 },
  'reservePrice.floor_fraction': { re: /  const floor_fraction = ([\d.]+);/, scale: 1 },
};

export class RegisterBindingError extends Error {}

export function readWorkerConstant(name, src = workerSource()) {
  const spec = WORKER_CONSTANTS[name];
  if (!spec) throw new RegisterBindingError(`no worker-constant extractor for "${name}"`);
  const all = src.match(new RegExp(spec.re.source, 'g')) ?? [];
  if (all.length !== 1) {
    throw new RegisterBindingError(
      `worker constant "${name}": pattern matched ${all.length} times, expected exactly 1. ` +
      `The engine moved — re-verify the register binding.`
    );
  }
  return Number(spec.re.exec(src)[1]) * spec.scale;
}

// ── Binding resolution ─────────────────────────────────────────────────────

const at = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/** Round to the register's declared precision so float noise never fails a tie. */
export const roundTo = (v, dp = 6) =>
  typeof v === 'number' ? Math.round(v * 10 ** dp) / 10 ** dp : v;

/**
 * Resolve one `engine_binding` to the value the code currently holds.
 * @param {string} binding e.g. "engine:signal_inputs.afrr_cap"
 * @param {object} ctx { reference, configs, src }
 */
export function resolveBinding(binding, ctx) {
  if (!binding) return undefined;
  const idx = binding.indexOf(':');
  if (idx < 0) throw new RegisterBindingError(`malformed binding "${binding}" — expected "ns:path"`);
  const ns = binding.slice(0, idx);
  const path = binding.slice(idx + 1);

  switch (ns) {
    case 'worker':
      return readWorkerConstant(path, ctx.src);
    case 'engine': {
      const v = at(ctx.reference, path);
      if (v === undefined) throw new RegisterBindingError(`engine output has no path "${path}"`);
      return v;
    }
    case 'bridge': {
      const [obj, key] = path.split('.');
      const table = obj === 'CAPEX_DEFAULTS' ? CAPEX_DEFAULTS : COST_DEFAULTS;
      if (!(key in table)) throw new RegisterBindingError(`bridge table has no key "${path}"`);
      return table[key];
    }
    case 'portfolio':
      if (path === 'DEFAULT_WACC') return DEFAULT_WACC * 100;
      if (path === 'lt_zone_price_correlation') return CORRELATION_NOTE.lt_zone_price_correlation;
      throw new RegisterBindingError(`unknown portfolio binding "${path}"`);
    case 'driver': {
      const d = DRIVERS[path];
      if (!d) throw new RegisterBindingError(`unknown scenario driver "${path}"`);
      return d.central;
    }
    case 'config': {
      const [id, key] = path.split('.');
      const cfg = ctx.configs[id];
      if (!cfg) throw new RegisterBindingError(`no project config "${id}"`);
      if (!(key in cfg)) throw new RegisterBindingError(`config "${id}" has no key "${key}"`);
      return cfg[key];
    }
    default:
      throw new RegisterBindingError(`unknown binding namespace "${ns}" in "${binding}"`);
  }
}

/** Build the context every binding resolves against. Uses the frozen fixture. */
export async function bindingContext({ kv = loadFixtureKV() } = {}) {
  const engine = await loadEngine();
  const refConfig = loadConfig(join(PROJECTS_DIR, 'kkme-reference.json'));
  const reference = await runProject(refConfig, kv, { engine, scenario: 'base' });
  const configs = Object.fromEntries(
    [refConfig, ...loadConfigDir(join(PROJECTS_DIR, 'prosperus'))].map((c) => [c.project_id, c])
  );
  return { reference, configs, src: workerSource(), kv };
}

// ── Register I/O + validation ──────────────────────────────────────────────

export function loadRegister(path = REGISTER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const REQUIRED_ROW_KEYS = ['id', 'category', 'label', 'value', 'unit', 'source', 'sensitivity_range', 'override'];

/**
 * Schema validation. Returns the list of problems; empty means valid.
 * Deliberately strict about `source`: an unsourced assumption in a client
 * deliverable is the thing rule #3 exists to prevent.
 */
export function validateRegister(register) {
  const problems = [];
  const rows = register.rows ?? [];
  const seen = new Set();

  for (const [i, row] of rows.entries()) {
    const where = `row ${i} (${row?.id ?? '?'})`;
    for (const k of REQUIRED_ROW_KEYS) {
      if (!(k in row)) problems.push(`${where}: missing key "${k}"`);
    }
    if (row.id) {
      if (seen.has(row.id)) problems.push(`${where}: duplicate id "${row.id}"`);
      seen.add(row.id);
    }
    if (row.category && !CATEGORIES.includes(row.category)) {
      problems.push(`${where}: unknown category "${row.category}"`);
    }
    if (typeof row.source !== 'string' || row.source.trim().length < 8) {
      problems.push(`${where}: every assumption must carry a source`);
    }
    const r = row.sensitivity_range;
    if (r !== null) {
      if (!Array.isArray(r) || r.length !== 2) {
        problems.push(`${where}: sensitivity_range must be [lo, hi] or null`);
      } else if (typeof row.value === 'number') {
        if (!(r[0] <= r[1])) problems.push(`${where}: sensitivity_range is inverted`);
        if (row.value < r[0] || row.value > r[1]) {
          problems.push(`${where}: value ${row.value} lies outside its range [${r[0]}, ${r[1]}]`);
        }
      }
    }
  }
  return problems;
}

/**
 * Compare every bound row against the value the code holds.
 * Returns { checked, drift: [{id, binding, register, live}] }.
 */
export function checkBindings(register, ctx) {
  const drift = [];
  let checked = 0;
  for (const row of register.rows) {
    if (!row.engine_binding) continue;
    checked++;
    const live = roundTo(resolveBinding(row.engine_binding, ctx));
    if (roundTo(row.value) !== live) {
      drift.push({ id: row.id, binding: row.engine_binding, register: row.value, live });
    }
  }
  return { checked, drift };
}

/** Rewrite every bound row's value from its binding. */
export function syncRegister(register, ctx) {
  const synced = { ...register, rows: register.rows.map((row) => (
    row.engine_binding ? { ...row, value: roundTo(resolveBinding(row.engine_binding, ctx)) } : row
  )) };
  return synced;
}

/**
 * The effective value of a row: the client's override when set, else the
 * engine-derived value. Overrides are never folded into `value`.
 */
export const effectiveValue = (row) => (row.override != null ? row.override : row.value);

/** Rows keyed by id, with overrides applied. */
export function effectiveRegister(register) {
  return Object.fromEntries(register.rows.map((r) => [r.id, effectiveValue(r)]));
}

export function categoryCounts(register) {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row of register.rows) out[row.category] = (out[row.category] ?? 0) + 1;
  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const register = loadRegister();
  const ctx = await bindingContext();

  const problems = validateRegister(register);
  const { checked, drift } = checkBindings(register, ctx);
  const counts = categoryCounts(register);

  if (argv.includes('--sync')) {
    const synced = syncRegister(register, ctx);
    synced.synced_at = new Date().toISOString();
    writeFileSync(REGISTER_PATH, JSON.stringify(synced, null, 2) + '\n');
    console.log(`synced ${checked} bound rows → ${REGISTER_PATH}`);
    if (drift.length) for (const d of drift) console.log(`  ${d.id}: ${d.register} → ${d.live}`);
    process.exit(0);
  }

  console.log(`\n  Assumptions register — ${register.rows.length} rows`);
  console.log('  ' + Object.entries(counts).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(`  bound to live code: ${checked} · unbound (externally sourced): ${register.rows.length - checked}`);
  console.log(`  schema: ${problems.length ? `${problems.length} PROBLEM(S)` : 'valid'}`);
  console.log(`  bindings: ${drift.length ? `${drift.length} DRIFTED` : 'all tie to the code'}\n`);
  for (const p of problems.slice(0, 20)) console.log(`    schema  ${p}`);
  for (const d of drift) console.log(`    drift   ${d.id} (${d.binding}): register ${d.register} vs live ${d.live}`);
  process.exit(problems.length || drift.length ? 1 : 0);
}
