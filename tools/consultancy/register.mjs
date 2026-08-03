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
 *   calibration:<path> value in tools/consultancy/data/price-formation-calibration.json
 *
 * `calibration:` is 36.E1's addition and it exists because the E1/E2 price-formation parameters
 * are MEASURED FROM DATA rather than written into code — they live behind their own seam and
 * nothing in the engine holds them yet (wiring is E6). Binding them to the calibration artifact
 * keeps the invariant intact rather than carving an exception out of it: a row still cannot float
 * free, and re-running the calibration against refreshed evidence makes the register DRIFT, which
 * is exactly the alarm a monthly review_cycle wants. The alternative — unbound rows — would have
 * meant the one class of parameter whose values move every month was the one class nothing
 * checked.
 *
 * There is exactly ONE kind of row that may carry no binding: a **superseded**
 * row (`basis: "superseded"`). It records a value the model USED to hold, kept
 * beside the value that replaced it so the delta is legible without reading the
 * changelog. It is not an input — nothing reads it — so it has no code constant
 * to bind to, and binding it would be a lie. The invariant is therefore not
 * weakened but sharpened: every row is either **bound to live code** or
 * **explicitly declared superseded, naming the row that replaced it and the date
 * it was replaced**. Nothing floats free either way. See DECISIONS 36.B0-I.
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
 * ── Versioning + changelog (Phase 36.B6) ──────────────────────────────────
 *
 * The register carries a `version` block — `r<seq>.<8 hex of the content hash>`
 * — and a `changelog` in which every value change records {date, id, old, new,
 * reason, source, decided_by, phase, register_version}. The version is the
 * handle a delivered report quotes: read it off the footer and the changelog up
 * to that version IS the set of assumptions that report ran on.
 *
 * The two are welded together by `validateRegister`, which fails when the
 * stored version does not hash the current content. A value therefore cannot
 * move without a bump, and a bump cannot happen without an attributable reason
 * (`bumpVersion` throws otherwise). Governance is enforced, not documented.
 *
 * Usage:
 *   node tools/consultancy/register.mjs            # check register vs live bindings
 *   node tools/consultancy/register.mjs --version  # stored vs computed version
 *   node tools/consultancy/register.mjs --sync --reason "…" --by operator --phase 36.B6
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
import { hashOf } from './lib/runs.mjs';

export const REGISTER_PATH = join(HERE, 'assumptions-register.json');

// 'price-formation' is 36.E1's addition: the per-service scarcity multiples, convergence rates,
// floor displacements and activation parameters. They are a category of their own rather than
// folded into 'saturation' because none of them is a haircut on a base price — they are the price
// formation itself, and E6 replaces `reservePrice()` with them.
export const CATEGORIES = ['technical', 'market', 'saturation', 'cost', 'capex', 'project', 'scenario-driver', 'price-formation'];

// ── Versioning + changelog (Phase 36.B6) ───────────────────────────────────

/**
 * Who a change is attributable to. A closed vocabulary, because "why did this
 * number move" has exactly four honest answers and an open text field would
 * let the interesting one (a human moved it) hide inside prose.
 */
export const DECIDED_BY = {
  operator: 'a human decision that moves delivered numbers',
  measurement: 'evidence recorded; no model value changed',
  derived: 'consequential re-derivation forced by another change; no independent decision',
  governance: 'a change to the register mechanism itself, not to an assumption',
};

export const CHANGELOG_REQUIRED = ['date', 'id', 'old', 'new', 'reason', 'source', 'decided_by', 'phase'];

/**
 * The content hash the register version is built on: every LIVE row's id, value
 * and override, sorted by id.
 *
 * Superseded rows are excluded deliberately — they are provenance, not inputs
 * (`effectiveRegister` excludes them for the same reason), so editing the text
 * of a historical row must not present itself as the model having changed. What
 * the version pins is the set of numbers the model actually runs on.
 */
export function registerContentHash(register) {
  const rows = liveRows(register)
    .map((r) => ({ id: r.id, value: roundTo(r.value), override: r.override ?? null }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hashOf(rows);
}

export const registerVersionId = (seq, hash) => `r${seq}.${hash.slice(0, 8)}`;

/**
 * The version the register's CURRENT content deserves, at its current sequence.
 * Compare against the stored block to detect a value that moved without a bump.
 */
export function computeVersion(register) {
  const hash = registerContentHash(register);
  const seq = register.version?.seq ?? 1;
  return { id: registerVersionId(seq, hash), seq, hash };
}

/** True when the stored version block still describes the register's content. */
export const versionMatchesContent = (register) =>
  register.version?.hash === registerContentHash(register);

/**
 * Changelog schema. The register's central governance claim is that no value
 * moves without a dated, sourced, attributed reason — this is where that claim
 * is enforced rather than merely stated.
 */
export function validateChangelog(register) {
  const problems = [];
  const log = register.changelog ?? [];
  if (!Array.isArray(log)) return ['changelog must be an array'];

  let prevDate = '';
  for (const [i, e] of log.entries()) {
    const where = `changelog[${i}] (${e?.id ?? '?'})`;
    for (const k of CHANGELOG_REQUIRED) {
      if (!(k in e)) problems.push(`${where}: missing key "${k}"`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) {
      problems.push(`${where}: date must be YYYY-MM-DD`);
    } else if (e.date < prevDate) {
      problems.push(`${where}: dated ${e.date}, before the entry above it (${prevDate}) — the changelog is chronological`);
    } else {
      prevDate = e.date;
    }
    if (e.old === undefined || e.new === undefined) {
      problems.push(`${where}: old and new must both be present (null is a legitimate value, absent is not)`);
    } else if (e.old === null && e.new === null) {
      problems.push(`${where}: an entry that moved nothing and recorded nothing is not a change`);
    }
    if (typeof e.reason !== 'string' || e.reason.trim().length < 40) {
      problems.push(`${where}: reason must say why, in a sentence a reader can check (>= 40 chars)`);
    }
    if (typeof e.source !== 'string' || e.source.trim().length < 8) {
      problems.push(`${where}: every change must cite the evidence it rests on`);
    }
    if (!(e.decided_by in DECIDED_BY)) {
      problems.push(`${where}: decided_by must be one of ${Object.keys(DECIDED_BY).join(' / ')}`);
    }
    if ('register_version' in e && e.register_version !== null
        && !/^r\d+\.[0-9a-f]{8}$/.test(e.register_version)) {
      problems.push(`${where}: register_version must look like r<seq>.<8 hex> or be null`);
    }
  }
  return problems;
}

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
  // Phase 38.8 — route-to-market and BRP cost stack. Bound so the register
  // cannot drift from the constants, exactly as every other live figure is.
  'COST_STACK.service_fee_pct': {
    re: /  service_fee_pct: ([\d.]+),/, scale: 100,
  },
  'COST_STACK.power_market_charge_eur_mwh': {
    re: /  power_market_charge_eur_mwh: ([\d.]+),/, scale: 1,
  },
  'COST_STACK.balancing_capacity_fee_eur_mwh': {
    re: /  balancing_capacity_fee_eur_mwh: ([\d.]+),/, scale: 1,
  },
  'COST_STACK.standby_load_pct_of_nameplate_mw': {
    re: /  standby_load_pct_of_nameplate_mw: ([\d.]+),/, scale: 100,
  },
  'COST_STACK.integration_fee_eur': {
    re: /  integration_fee_eur: (\d+),/, scale: 1,
  },
  'REVENUE_SCENARIOS.base.opex_esc': {
    re: /opex_per_kw_yr: 39, opex_esc: ([\d.]+),/, scale: 100,
  },
  'REVENUE_SCENARIOS.base.rtm_fee_pct': {
    re: /rtm_fee_pct: ([\d.]+), brp_fee_yr: \d+,/, scale: 100,
  },
  RYSTAD_15MIN_UPLIFT_DECIMAL: { re: /const RYSTAD_15MIN_UPLIFT_DECIMAL = ([\d.]+);/, scale: 1 },
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

/** The E1/E2 calibration artifact, read once. */
let _calibration = null;
function loadCalibration() {
  if (_calibration) return _calibration;
  const file = join(import.meta.dirname, 'data', 'price-formation-calibration.json');
  try { _calibration = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new RegisterBindingError(`cannot read the price-formation calibration at ${file}: ${e.message}`); }
  return _calibration;
}

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
    case 'calibration': {
      const v = at(loadCalibration(), path);
      if (v === undefined) throw new RegisterBindingError(`price-formation calibration has no path "${path}" — re-run tools/consultancy/mature-markets/calibrate-price-formation.mjs`);
      return v;
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

/** A row that records a value the model no longer holds. See the header note. */
export const isSuperseded = (row) => row?.basis === 'superseded';

/** The rows that ARE the model — every one of them bound to live code. */
export const liveRows = (register) => register.rows.filter((r) => !isSuperseded(r));

/** The rows that record what the model used to hold. */
export const supersededRows = (register) => register.rows.filter(isSuperseded);

/**
 * Schema validation. Returns the list of problems; empty means valid.
 * Deliberately strict about `source`: an unsourced assumption in a client
 * deliverable is the thing rule #3 exists to prevent.
 *
 * And strict about the bound/superseded dichotomy: an unbound row that has not
 * declared itself superseded is an assumption nothing checks, which is exactly
 * what the register exists to make impossible.
 */
export function validateRegister(register) {
  const problems = [];
  const rows = register.rows ?? [];
  const seen = new Set();
  const ids = new Set(rows.map((r) => r?.id));

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

    // The bound/superseded dichotomy — the register's central invariant.
    if (isSuperseded(row)) {
      if (row.engine_binding) {
        problems.push(`${where}: a superseded row must not carry an engine_binding`);
      }
      if (!row.superseded_by) {
        problems.push(`${where}: a superseded row must name the row that replaced it`);
      } else if (row.superseded_by === row.id) {
        problems.push(`${where}: superseded_by points at itself`);
      } else if (!ids.has(row.superseded_by)) {
        problems.push(`${where}: superseded_by "${row.superseded_by}" is not a row in this register`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.superseded_on ?? '')) {
        problems.push(`${where}: a superseded row must carry superseded_on as YYYY-MM-DD`);
      }
      if (row.override != null) {
        problems.push(`${where}: a superseded row is not an input and cannot carry an override`);
      }
    } else {
      if (!row.engine_binding) {
        problems.push(
          `${where}: unbound and not declared superseded — every row must either bind to ` +
          `live code or carry basis "superseded" with superseded_by/superseded_on`
        );
      }
      if (row.superseded_by || row.superseded_on) {
        problems.push(`${where}: a live row must not carry supersession metadata`);
      }
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

  // ── Governance (36.B6) ──────────────────────────────────────────────────
  problems.push(...validateChangelog(register));

  const v = register.version;
  if (!v) {
    problems.push('register carries no version block — run `register.mjs --version`');
  } else {
    if (!Number.isInteger(v.seq) || v.seq < 1) problems.push('version.seq must be a positive integer');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effective_from ?? '')) {
      problems.push('version.effective_from must be YYYY-MM-DD');
    }
    const computed = computeVersion(register);
    if (v.hash !== computed.hash) {
      problems.push(
        `version ${v.id} does not describe this register's content (content hashes to ` +
        `${computed.hash.slice(0, 8)}…) — a value moved without a version bump. ` +
        `Re-run: register.mjs --sync --reason "…" --by <${Object.keys(DECIDED_BY).join('|')}> --phase <n>`
      );
    } else if (v.id !== computed.id) {
      problems.push(`version.id ${v.id} disagrees with seq ${v.seq} + hash ${v.hash.slice(0, 8)}`);
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

/**
 * Rows keyed by id, with overrides applied. Superseded rows are excluded: they
 * are provenance, not inputs, and handing one to a consumer as if it were an
 * effective value is the failure this whole mechanism exists to prevent.
 */
export function effectiveRegister(register) {
  return Object.fromEntries(liveRows(register).map((r) => [r.id, effectiveValue(r)]));
}

export function categoryCounts(register) {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row of register.rows) out[row.category] = (out[row.category] ?? 0) + 1;
  return out;
}

// ── Version bumps ──────────────────────────────────────────────────────────

/** Every live row whose value or override differs between two registers. */
export function valueDiff(before, after) {
  const prior = Object.fromEntries(liveRows(before).map((r) => [r.id, r]));
  const moved = [];
  for (const row of liveRows(after)) {
    const was = prior[row.id];
    if (!was) { moved.push({ id: row.id, old: null, new: roundTo(row.value) }); continue; }
    if (roundTo(was.value) !== roundTo(row.value)) {
      moved.push({ id: row.id, old: roundTo(was.value), new: roundTo(row.value) });
    } else if ((was.override ?? null) !== (row.override ?? null)) {
      moved.push({ id: row.id, old: was.override ?? null, new: row.override ?? null, override: true });
    }
  }
  return moved;
}

/**
 * Stamp the register with the version its content deserves, appending one
 * changelog entry per moved value.
 *
 * The sequence advances only when the CONTENT changed. Re-stamping an unchanged
 * register is a no-op, so the version number counts model changes rather than
 * how many times someone ran the tool.
 *
 * Every appended entry carries the version it PRODUCED, which is what turns the
 * changelog from a list of edits into a history a reader can walk: pick any
 * delivered report, read its register version off the footer, and the entries up
 * to and including that version are the assumptions it ran on.
 */
/**
 * @param {any} register
 * @param {{
 *   moved?: Array<{id: string, old: any, new: any, override?: boolean}>,
 *   reason?: string, source?: string, decided_by?: string, phase?: string,
 *   date?: string, notes?: string,
 * }} [bump]
 */
export function bumpVersion(register, { moved = [], reason, source, decided_by, phase, date, notes } = {}) {
  const hash = registerContentHash(register);
  const stored = register.version;
  const changed = stored?.hash !== hash;
  const seq = changed ? (stored?.seq ?? 0) + 1 : (stored?.seq ?? 1);
  const id = registerVersionId(seq, hash);
  const on = date ?? new Date().toISOString().slice(0, 10);

  const out = { ...register };
  if (changed && moved.length) {
    if (!reason || !source || !(decided_by in DECIDED_BY) || !phase) {
      throw new Error(
        `${moved.length} register value(s) moved (${moved.map((m) => m.id).join(', ')}) — ` +
        `a bump needs reason, source, decided_by (${Object.keys(DECIDED_BY).join('|')}) and phase. ` +
        `Governance is the point: a value that moves without an attributable reason is exactly ` +
        `what this register exists to make impossible.`
      );
    }
    out.changelog = [
      ...(register.changelog ?? []),
      ...moved.map((m) => ({
        date: on, id: m.id, old: m.old, new: m.new,
        reason, source, decided_by, phase, register_version: id,
        ...(m.override ? { override_change: true } : {}),
        ...(notes ? { notes } : {}),
      })),
    ];
  }
  out.version = {
    id, seq, hash,
    effective_from: changed ? on : (stored?.effective_from ?? on),
    changelog_entries: (out.changelog ?? []).length,
  };
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

  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };

  if (argv.includes('--sync')) {
    const synced = syncRegister(register, ctx);
    const moved = valueDiff(register, synced);
    let stamped;
    try {
      stamped = bumpVersion(synced, {
        moved,
        reason: arg('reason'), source: arg('source') ?? 'register.mjs --sync against the live bindings',
        decided_by: arg('by'), phase: arg('phase'), date: arg('date'),
      });
    } catch (err) {
      console.error(`\n  REFUSED — ${err.message}\n`);
      for (const m of moved) console.error(`    ${m.id}: ${m.old} → ${m.new}`);
      console.error('');
      process.exit(1);
    }
    stamped.synced_at = new Date().toISOString();
    writeFileSync(REGISTER_PATH, JSON.stringify(stamped, null, 2) + '\n');
    console.log(`synced ${checked} bound rows → ${REGISTER_PATH}`);
    console.log(`register version ${stamped.version.id}` +
      (moved.length ? ` (${moved.length} value(s) moved, changelog appended)` : ' (content unchanged)'));
    for (const m of moved) console.log(`  ${m.id}: ${m.old} → ${m.new}`);
    process.exit(0);
  }

  if (argv.includes('--version')) {
    const computed = computeVersion(register);
    console.log(`\n  stored   ${register.version?.id ?? '— none —'}`);
    console.log(`  computed ${computed.id}`);
    console.log(`  ${versionMatchesContent(register) ? 'the version describes the content' : 'MISMATCH — a value moved without a bump'}`);
    console.log(`  changelog: ${(register.changelog ?? []).length} entries\n`);
    process.exit(versionMatchesContent(register) ? 0 : 1);
  }

  console.log(`\n  Assumptions register — ${register.rows.length} rows · version ${register.version?.id ?? '— none —'}`);
  console.log('  ' + Object.entries(counts).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(`  bound to live code: ${checked} · superseded (provenance, not inputs): ${supersededRows(register).length}`);
  console.log(`  changelog: ${(register.changelog ?? []).length} entries · ` +
    `${versionMatchesContent(register) ? 'version ties to content' : 'VERSION DOES NOT TIE TO CONTENT'}`);
  console.log(`  schema: ${problems.length ? `${problems.length} PROBLEM(S)` : 'valid'}`);
  console.log(`  bindings: ${drift.length ? `${drift.length} DRIFTED` : 'all tie to the code'}\n`);
  for (const p of problems.slice(0, 20)) console.log(`    schema  ${p}`);
  for (const d of drift) console.log(`    drift   ${d.id} (${d.binding}): register ${d.register} vs live ${d.live}`);
  process.exit(problems.length || drift.length ? 1 : 0);
}
