/**
 * Consultancy engine harness — Phase 34.1
 *
 * Single entry point for driving the KKME revenue engine outside the Worker
 * runtime. Follows the `scripts/audit-stack.mjs --probe-v73` precedent
 * (Phase 32.1) except that `workers/fetch-s1.js` imports cleanly as an ES
 * module in Node, so no `node:vm` sandbox is needed.
 *
 * The worker stays the single engine home (arc decision 1 / discipline rule #4).
 * Nothing in this directory reimplements engine maths.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const OUTPUT_DIR = join(HERE, 'output');
export const PROJECTS_DIR = join(HERE, 'projects');

let _engine = null;

/** Load (and memoise) the worker engine module. */
export async function loadEngine() {
  if (!_engine) {
    _engine = await import(join(REPO_ROOT, 'workers/fetch-s1.js'));
  }
  return _engine;
}

// ── Project configs ────────────────────────────────────────────────────────

const REQUIRED_KEYS = ['project_id', 'name', 'mw', 'mwh', 'cod', 'first_operating_year', 'capex_eur_kwh'];

/**
 * The engine labels its operating years `cal_year = cod_year + yr`, so year 1
 * lands on `cod_year + 1` — i.e. its `cod_year` param means "the year the asset
 * finishes commissioning", and revenue starts the year after. Configs declare
 * the unambiguous quantity (`first_operating_year`) and this is the single
 * place the engine's convention is applied. See DECISIONS.md A4b.
 */
export const codYearForEngine = (first_operating_year) => first_operating_year - 1;

/**
 * Validate a project config and fill derived fields.
 * Throws on anything that would silently produce wrong client numbers.
 */
export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('project config must be an object');
  for (const k of REQUIRED_KEYS) {
    if (cfg[k] === undefined || cfg[k] === null) {
      throw new Error(`project config "${cfg.project_id ?? '?'}": missing required key "${k}"`);
    }
  }
  if (!(cfg.mw > 0)) throw new Error(`project config "${cfg.project_id}": mw must be > 0`);
  if (!(cfg.mwh > 0)) throw new Error(`project config "${cfg.project_id}": mwh must be > 0`);
  if (!(cfg.capex_eur_kwh > 0)) throw new Error(`project config "${cfg.project_id}": capex_eur_kwh must be > 0`);

  const duration_h = cfg.mwh / cfg.mw;
  if (cfg.duration_h !== undefined && Math.abs(cfg.duration_h - duration_h) > 1e-9) {
    throw new Error(
      `project config "${cfg.project_id}": duration_h ${cfg.duration_h} contradicts mwh/mw = ${duration_h}`
    );
  }

  const months = cfg.operational_months_y1 ?? 12;
  if (!(months > 0 && months <= 12)) {
    throw new Error(`project config "${cfg.project_id}": operational_months_y1 must be in (0, 12]`);
  }

  if (!Number.isInteger(cfg.first_operating_year)) {
    throw new Error(`project config "${cfg.project_id}": first_operating_year must be an integer year`);
  }
  const cod_year = codYearForEngine(cfg.first_operating_year);

  // Rule #2 (no hardcoded temporal label): the declared operational months must
  // be derivable from the declared COD month, not asserted independently.
  const codMonth = /^(\d{4})-(\d{2})$/.exec(cfg.cod ?? '');
  if (codMonth) {
    const [, y, m] = codMonth;
    if (Number(y) === cfg.first_operating_year) {
      const implied = 12 - Number(m) + 1;
      if (implied !== months) {
        throw new Error(
          `project config "${cfg.project_id}": cod ${cfg.cod} implies ${implied} operational ` +
          `months in ${cfg.first_operating_year}, config declares ${months}`
        );
      }
    }
  }

  // Grid allowance is non-binding for every current project. Rather than
  // silently clipping a future one, fail loudly (Pause A / A3).
  if (cfg.grid_allowance_mw != null && cfg.mw > cfg.grid_allowance_mw) {
    throw new Error(
      `project config "${cfg.project_id}": mw ${cfg.mw} exceeds grid_allowance_mw ` +
      `${cfg.grid_allowance_mw}. The engine does not model POI clipping — add it before ` +
      `running this project.`
    );
  }

  return { ...cfg, duration_h, operational_months_y1: months, cod_year };
}

export function loadConfig(path) {
  return validateConfig(JSON.parse(readFileSync(path, 'utf8')));
}

/** Load every *.json config in a directory (non-recursive), sorted by filename. */
export function loadConfigDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => loadConfig(join(dir, f)));
}

// ── Engine invocation ──────────────────────────────────────────────────────

/**
 * Run one project config through computeRevenueV7.
 *
 * The engine receives the config via `params.project_config`; every other
 * param is derived from it so there is exactly one source for each quantity
 * (discipline rule #4).
 */
export async function runProject(cfg, kv, { scenario, engine: engineOverride } = {}) {
  const engine = engineOverride ?? (await loadEngine());
  const config = validateConfig(cfg);
  const params = {
    mw: config.mw,
    dur_h: config.duration_h,
    capex_kwh: config.capex_eur_kwh,
    cod_year: config.cod_year,
    scenario: scenario ?? config.scenario ?? 'base',
    grant_pct: config.grant_pct ?? 0,
    project_config: config,
  };
  return engine.computeRevenueV7(params, kv);
}

// ── Output helpers ─────────────────────────────────────────────────────────

/**
 * Runner outputs are written by `lib/runs.mjs::writeRunOutput`, which stamps
 * the run registry provenance block on the way through. The bare `writeOutput`
 * that used to live here was removed in Phase 36.B6 rather than left beside it:
 * two ways to emit a runner output means one of them emits an unregistered
 * number, which is the exact hole the registry exists to close.
 */

export const eur = (n) =>
  n == null ? '—' : `€${(n / 1e6).toFixed(2)}M`;

export const eurK = (n) =>
  n == null ? '—' : `€${Math.round(n / 1e3).toLocaleString('en-US')}k`;
