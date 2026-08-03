/**
 * Public-site regression gate — Phase 34.1
 *
 * The non-negotiable of the Phase 34 arc: `/revenue` output for the reference
 * asset must stay byte-identical (modulo `timestamp`) while the engine is
 * extended for consultancy work.
 *
 * Deliberately OFFLINE. It runs `computeRevenueV7` against a frozen production
 * KV fixture over the full cross-product of parameter combinations the public
 * route can produce, and hashes each result with `timestamp` stripped. Hitting
 * the live worker instead would make the gate measure data drift rather than
 * code change, which is the opposite of what it is for.
 *
 * Usage:
 *   node tools/consultancy/regression-reference.mjs --capture   # write baseline
 *   node tools/consultancy/regression-reference.mjs             # compare (exit 1 on drift)
 *   node tools/consultancy/regression-reference.mjs --diff <id> # show first differing path
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEngine, HERE } from './engine.mjs';
import { FIXTURE_PATH } from './kv-snapshot.mjs';

export const BASELINE_PATH = join(HERE, 'regression-baseline.json');

/** Mirrors the /revenue route's CAPEX_MAP / DUR_MAP and its param defaults. */
const DUR_MAP = { '2h': 2, '4h': 4 };
const CAPEX_MAP = { low: 120, mid: 164, high: 262 };
const COD_YEARS = [2027, 2028, 2029];
const SCENARIOS = ['base', 'conservative', 'stress'];

/** Every (dur × capex × cod × scenario) the public route can serve: 2×3×3×3 = 54. */
export function publicParamMatrix() {
  const out = [];
  for (const [durKey, dur_h] of Object.entries(DUR_MAP)) {
    for (const [capexKey, capex_kwh] of Object.entries(CAPEX_MAP)) {
      for (const cod_year of COD_YEARS) {
        for (const scenario of SCENARIOS) {
          out.push({
            id: `dur=${durKey} capex=${capexKey} cod=${cod_year} scenario=${scenario}`,
            params: { mw: 50, dur_h, capex_kwh, cod_year, scenario, grant_pct: 0 },
          });
        }
      }
    }
  }
  return out;
}

/** Volatile fields excluded from the hash — wall-clock only, no engine meaning. */
const VOLATILE = new Set(['timestamp', 'updated_at']);

export function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE.has(k)) continue;
      out[k] = stripVolatile(value[k]);
    }
    return out;
  }
  return value;
}

export function canonical(result) {
  return JSON.stringify(stripVolatile(result));
}

export function hashResult(result) {
  return createHash('sha256').update(canonical(result)).digest('hex');
}

export function loadFixtureKV() {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(
      `missing regression fixture ${FIXTURE_PATH} — run ` +
      `\`node tools/consultancy/kv-snapshot.mjs --freeze\` first`
    );
  }
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')).kv;
}

/** Run the whole matrix. Returns { id → {hash, result} }. */
export async function runMatrix() {
  const engine = await loadEngine();
  const kv = loadFixtureKV();
  const out = {};
  for (const { id, params } of publicParamMatrix()) {
    const result = engine.computeRevenueV7(params, kv);
    out[id] = { hash: hashResult(result), result };
  }
  return out;
}

function firstDifference(a, b, path = '') {
  if (a === b) return null;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) return { path, before: a, after: b };
  if (ta === 'array') {
    if (a.length !== b.length) return { path: `${path}.length`, before: a.length, after: b.length };
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (ta === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      if (VOLATILE.has(k)) continue;
      const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
    return null;
  }
  return { path, before: a, after: b };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const matrix = await runMatrix();

  if (argv.includes('--capture')) {
    // Phase 39.2 — `_note` used to be a hardcoded paragraph naming a date and a
    // reason ("Recaptured 2026-07-28 for the batch-3 Part 0 cutover"). Every
    // later recapture would have rewritten the numbers and kept the sentence,
    // shipping a provenance claim about a capture that never happened — rule #2
    // and B12's fourth property: a label asserting where or when a value came
    // from must be COMPUTED, not pre-written prose that outlives its premise.
    //
    // The reason is now an argument the recapturing session must supply, and
    // the SHA is read from git rather than typed.
    const reasonIdx = argv.indexOf('--reason');
    const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : null;
    if (!reason) {
      console.error('refusing to capture without --reason "<why this baseline is being moved>"');
      console.error('a baseline whose movement has no recorded reason cannot be audited later');
      process.exit(2);
    }
    let sha = 'unknown';
    try {
      sha = execSync('git rev-parse HEAD', { cwd: HERE, encoding: 'utf8' }).trim();
    } catch { /* leave 'unknown' — never invent a SHA (B1) */ }
    const baseline = {
      _note:
        'Public /revenue regression baseline. Hash of computeRevenueV7 output ' +
        '(timestamp stripped) over every public parameter combination, against the ' +
        'frozen KV fixture. Any change to this file means the public site moved.',
      represents_sha: sha,
      captured_reason: reason,
      captured_at: new Date().toISOString(),
      fixture: 'fixtures/regression-kv.json',
      hashes: Object.fromEntries(Object.entries(matrix).map(([id, v]) => [id, v.hash])),
      headline: Object.fromEntries(
        Object.entries(matrix).map(([id, v]) => [
          id,
          {
            gross_revenue_y1: v.result.gross_revenue_y1,
            ebitda_y1: v.result.ebitda_y1,
            project_irr: v.result.project_irr,
            min_dscr: v.result.min_dscr,
            npv_at_wacc: v.result.npv_at_wacc,
          },
        ])
      ),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`captured ${Object.keys(matrix).length} configurations → ${BASELINE_PATH}`);
    process.exit(0);
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('no baseline — run with --capture first');
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const drifted = [];
  for (const [id, v] of Object.entries(matrix)) {
    if (baseline.hashes[id] !== v.hash) drifted.push(id);
  }
  const missing = Object.keys(baseline.hashes).filter((id) => !(id in matrix));

  if (!drifted.length && !missing.length) {
    console.log(`REGRESSION GATE GREEN — ${Object.keys(matrix).length}/${Object.keys(matrix).length} configurations byte-identical to baseline`);
    process.exit(0);
  }

  console.error(`REGRESSION GATE RED — ${drifted.length} drifted, ${missing.length} missing`);
  for (const id of drifted.slice(0, 5)) {
    console.error(`  drift: ${id}`);
    const b = baseline.headline?.[id];
    const a = matrix[id].result;
    if (b) {
      for (const k of Object.keys(b)) {
        if (b[k] !== a[k]) console.error(`    ${k}: ${b[k]} → ${a[k]}`);
      }
    }
  }
  for (const id of missing.slice(0, 5)) console.error(`  missing: ${id}`);
  process.exit(1);
}

export { firstDifference };
