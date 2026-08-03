/**
 * Phase 39 — public-payload byte-identity gate.
 *
 * Hashes `computeRevenueV7` over the 54 public configurations for BOTH a
 * reference checkout and this working tree, against the same frozen KV fixture,
 * and reports any configuration whose payload moved.
 *
 * Why this exists rather than `regression-reference.mjs`: the committed
 * `regression-baseline.json` was captured 2026-07-29 and predates 38.6/38.8,
 * which deliberately moved public numbers, so it is RED on untouched main.
 * Recapturing it inside a later phase would erase that record and mask the
 * phase's own diff (failure-modes B7). This gate compares against a clean
 * worktree of the reference commit instead — never a stash (C6).
 *
 * Usage:
 *   git worktree add /tmp/kkme-ref origin/main
 *   node scripts/_phase-39-byte-identity.mjs /tmp/kkme-ref
 *
 * Exit 0 = every configuration identical. Exit 1 = something moved.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.argv[2] ? resolve(process.argv[2]) : null;

if (!REF) {
  console.error('usage: node scripts/_phase-39-byte-identity.mjs <path-to-reference-worktree>');
  process.exit(2);
}
if (!existsSync(`${REF}/workers/fetch-s1.js`)) {
  console.error(`no engine at ${REF}/workers/fetch-s1.js — is that a checkout?`);
  process.exit(2);
}

const { publicParamMatrix, loadFixtureKV } =
  await import(`${WT}/tools/consultancy/regression-reference.mjs`);
const kv = loadFixtureKV();
const M = publicParamMatrix();

const refMod = await import(`${REF}/workers/fetch-s1.js`);
const wtMod = await import(`${WT}/workers/fetch-s1.js`);

/** Stripped so a wall-clock stamp is never the reason a hash differs. */
const VOLATILE = new Set(['timestamp', 'generated_at', 'computed_at', 'as_of']);
const hash = (o) =>
  createHash('sha256')
    .update(JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v)))
    .digest('hex');

let same = 0;
const drift = [];
for (const { id, params } of M) {
  if (hash(refMod.computeRevenueV7(params, kv)) === hash(wtMod.computeRevenueV7(params, kv))) same++;
  else drift.push(id);
}

console.error(`\nBYTE-IDENTITY vs ${REF}: ${same}/${M.length} identical`);
if (drift.length) {
  console.error('DRIFTED:');
  for (const d of drift) console.error(`  ${d}`);
  process.exit(1);
}
console.error('GATE GREEN — no public configuration moved.');
