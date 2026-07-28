/**
 * Route-level /revenue probe — Phase 36.B1
 *
 * Session 88 (Phase 35.1, finding #2) established that the 54/54 regression
 * gate does not cover the route layer: it calls `computeRevenueV7` directly, so
 * a change that breaks the `fetch` handler's KV assembly can leave it green.
 * That was caught once by an ad-hoc probe. This makes the probe repeatable.
 *
 * Phase 36.B1 adds an export block to `workers/fetch-s1.js`. Export statements
 * are compile-time bindings and cannot change a runtime path — but "cannot" is
 * an argument, and the standing rule asks for an assertion at the outermost
 * layer. So this drives the REAL `fetch` handler on both this branch and the
 * merge base, over all 54 public parameter combinations, against the frozen KV
 * fixture, and compares the responses byte for byte.
 *
 * Usage:
 *   node scripts/_phase-36-b1-route-probe.mjs            # compare vs main
 *   node scripts/_phase-36-b1-route-probe.mjs --base dev
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { publicParamMatrix, stripVolatile, loadFixtureKV } from '../tools/consultancy/regression-reference.mjs';

const argv = process.argv.slice(2);
const baseRef = (() => {
  const i = argv.indexOf('--base');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : 'main';
})();

/** Minimal KV binding backed by the frozen fixture. */
function makeEnv(kv) {
  const store = new Map();
  for (const [k, v] of Object.entries(kv)) {
    store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  // The route reads a handful of keys under names that differ from the engine
  // object's own field names; anything absent simply reads as null, which is
  // the same on both sides and therefore still a valid comparison.
  return {
    KKME_SIGNALS: {
      get: async (key, type) => {
        const raw = store.get(key);
        if (raw == null) return null;
        return type === 'json' ? JSON.parse(raw) : raw;
      },
      put: async () => {},
      list: async () => ({ keys: [] }),
    },
    ENTSOE_API_KEY: 'probe',
    UPDATE_SECRET: 'probe',
  };
}

/**
 * The base copy is written INTO `workers/` rather than a temp dir, because
 * `fetch-s1.js` imports `./lib/*.js` relatively and those resolve against the
 * file's own location. Phase 36.B1 touches only `fetch-s1.js`, so resolving the
 * lib modules from the working tree compares like with like; if a future use of
 * this probe also changes `workers/lib/`, that assumption stops holding and the
 * check below catches it.
 */
async function loadWorkerAt(ref) {
  if (ref === null) return { mod: await import('../workers/fetch-s1.js'), cleanup: () => {} };

  const changedLib = execFileSync('git', ['diff', '--name-only', ref, '--', 'workers/lib/'], {
    encoding: 'utf8',
  }).trim();
  if (changedLib) {
    console.error(`workers/lib/ differs from ${ref} — this probe assumes it does not:\n${changedLib}`);
    process.exit(2);
  }

  const src = execFileSync('git', ['show', `${ref}:workers/fetch-s1.js`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const file = new URL('../workers/.__probe_base.mjs', import.meta.url).pathname;
  writeFileSync(file, src);
  return {
    mod: await import(`file://${file}`),
    cleanup: () => rmSync(file, { force: true }),
  };
}

async function runMatrixThroughRoute(mod, kv) {
  const env = makeEnv(kv);
  const out = {};
  for (const { id, params } of publicParamMatrix()) {
    const qs = new URLSearchParams({
      mw: String(params.mw),
      dur: params.dur_h === 2 ? '2h' : '4h',
      capex: params.capex_kwh === 120 ? 'low' : params.capex_kwh === 164 ? 'mid' : 'high',
      cod: String(params.cod_year),
      scenario: params.scenario,
      grant_pct: String(params.grant_pct),
    });
    const req = new Request(`https://probe.local/revenue?${qs}`);
    let body;
    try {
      const res = await mod.default.fetch(req, env, { waitUntil: () => {} });
      body = await res.json();
    } catch (e) {
      body = { __probe_error: String(e && e.message ? e.message : e) };
    }
    out[id] = JSON.stringify(stripVolatile(body));
  }
  return out;
}

const kv = loadFixtureKV();

const here = await loadWorkerAt(null);
const there = await loadWorkerAt(baseRef);

const mine = await runMatrixThroughRoute(here.mod, kv);
const base = await runMatrixThroughRoute(there.mod, kv);

let same = 0;
const diffs = [];
for (const id of Object.keys(mine)) {
  if (mine[id] === base[id]) same++;
  else diffs.push(id);
}

there.cleanup();

const total = Object.keys(mine).length;
console.log(`route-level /revenue probe vs ${baseRef}: ${same}/${total} identical`);

// A probe where every response is an error compares equal trivially and proves
// nothing. Assert the handler actually produced revenue payloads.
const sampled = JSON.parse(mine[Object.keys(mine)[0]]);
if (sampled.__probe_error || sampled.project_irr === undefined) {
  console.error('PROBE INVALID — the route did not return a revenue payload:');
  console.error(JSON.stringify(sampled).slice(0, 400));
  process.exit(2);
}

if (diffs.length) {
  console.error(`DRIFT on ${diffs.length} configuration(s):`);
  for (const d of diffs.slice(0, 10)) console.error(`  ${d}`);
  process.exit(1);
}
console.log('route layer byte-identical — engine gate and route gate both green');
