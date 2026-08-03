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
 * Phase 39 ships ONE new field (`debt_sizing`). After that, whole-payload
 * identity is expected to fail, and the gate that matters becomes ADDITIVE-ONLY:
 * every pre-existing key still present, and byte-identical once the new field is
 * pruned. `--additive` runs that instead of strict identity.
 *
 * Usage:
 *   node scripts/_phase-39-byte-identity.mjs /tmp/kkme-ref              # strict
 *   node scripts/_phase-39-byte-identity.mjs /tmp/kkme-ref --additive   # additive-only
 *
 * Exit 0 = pass. Exit 1 = something moved.
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

const ADDITIVE = process.argv.includes('--additive');

const { publicParamMatrix, loadFixtureKV, firstDifference } =
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

/** Fields this phase ADDS. Pruned before comparison in additive mode. */
const ADDED_FIELDS = new Set(['debt_sizing']);
const prune = (o) =>
  JSON.parse(JSON.stringify(o, (k, v) => (ADDED_FIELDS.has(k) ? undefined : v)));

let same = 0;
const drift = [];
const missing = [];
for (const { id, params } of M) {
  const a = refMod.computeRevenueV7(params, kv);
  const b = wtMod.computeRevenueV7(params, kv);

  if (!ADDITIVE) {
    if (hash(a) === hash(b)) same++;
    else drift.push(id);
    continue;
  }

  // Additive mode: no pre-existing key may vanish, and nothing outside the new
  // fields may change. Removing a key is a silent break for any consumer of it,
  // so it is checked separately from value drift.
  for (const k of Object.keys(a)) if (!(k in b)) missing.push(`${id}.${k}`);
  const d = firstDifference(prune(a), prune(b), '');
  if (d) drift.push(`${id} -> ${d.path}: ${JSON.stringify(d.before)} => ${JSON.stringify(d.after)}`);
  else same++;
}

console.error(`\n${ADDITIVE ? 'ADDITIVE-ONLY' : 'BYTE-IDENTITY'} vs ${REF}: ` +
  `${same}/${M.length} ${ADDITIVE ? 'pre-existing payloads identical' : 'identical'}`);
if (ADDITIVE) console.error(`  new fields: ${[...ADDED_FIELDS].join(', ')}`);
if (missing.length) {
  console.error(`  PRE-EXISTING KEYS REMOVED (${missing.length}):`);
  for (const m of missing.slice(0, 10)) console.error(`    ${m}`);
}
if (drift.length) {
  console.error('  DRIFTED:');
  for (const d of drift.slice(0, 10)) console.error(`    ${d}`);
}
if (drift.length || missing.length) process.exit(1);
console.error(ADDITIVE
  ? 'GATE GREEN — strictly additive. No existing public value moved.'
  : 'GATE GREEN — no public configuration moved.');
