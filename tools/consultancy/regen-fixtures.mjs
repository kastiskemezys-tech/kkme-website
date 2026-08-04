/**
 * B-034 — regenerate the frozen deliverable-input fixture. A HUMAN runs this,
 * reads the diff, and commits it.
 *
 * The defect this closes. `deliverable.test.ts` and `xlsx.test.ts` used to call
 * `loadInputs()` with no argument, which reads `tools/consultancy/output/` —
 * untracked, generated, and whatever happened to be on that machine's disk. So
 * `npm test` graded the last build anyone happened to run. During 36.D the suite
 * reported green while `build-all --offline` failed its consistency gate, because
 * the outputs on disk predated the change.
 *
 * Measured when this fixture was first captured (2026-08-03): the outputs the
 * tests had been grading were **~24 % adrift** from what the current engine
 * produces — `gross_market_revenues` 12,770,114 → 9,698,737 on the first bridge
 * year alone, 329 differing leaves in `portfolio.json` of 745. The tests passed
 * against both. That is the whole of B-034 in one number.
 *
 * Why a frozen fixture rather than the two obvious alternatives:
 *
 *   · **Not committed live output.** Committing `output/` makes every engine
 *     change a diff in generated artifacts nobody reads, and puts `git status`
 *     noise in the way of C1's clean-tree rule.
 *   · **Not `beforeAll` regeneration.** Regenerating inside the suite makes the
 *     tests grade whatever the engine says today — which is not a test, it is a
 *     tautology. A golden fixture fails when the engine moves; that failure IS
 *     the signal, and a human deciding "yes, that movement is intended" is the
 *     review this file exists to force.
 *
 * The engine is deterministic apart from three timestamp fields, so a regen with
 * no engine change shows an empty content diff — which is what makes the review
 * cheap enough to actually happen.
 *
 *   npm run fixtures:regen            regenerate, show the diff, write
 *   npm run fixtures:regen -- --check exit 1 if the fixture is stale (no write)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(HERE, '__fixtures__/deliverable-inputs');
export const MANIFEST_PATH = join(HERE, '__fixtures__/deliverable-inputs.sha256');
const OUTPUT_DIR = join(HERE, 'output');

/** The exact set `loadInputs()` reads out of an output directory. */
export const FIXTURE_FILES = [
  'portfolio.json',
  'bitenai.json', 'stoniskiai.json', 'eigirdziai.json',
  'scenario-summary.json', 'scenario-downside.json', 'scenario-central.json', 'scenario-upside.json',
  'sensitivity.json',
  'reconciliation-report.json',
];

/**
 * Per-run fields: wall-clock stamps, the random run id, and the git sha of the
 * capturing tree (which carries a `-dirty` suffix when captured mid-edit).
 *
 * Excluded from the REVIEW DIFF ONLY. They are still written into the fixture —
 * `loadInputs` and the consistency gate read them, and a fixture with provenance
 * stripped would not be a faithful input (B10: never blank a provenance field).
 * What they must not do is drown the one thing the review exists to show, which
 * is whether an ENGINE NUMBER moved.
 */
const PER_RUN_LEAVES = new Set([
  'generated_at', 'run.recorded_at', 'engine.timestamp',
  'run.run_id', 'run.engine_git_sha',
]);

function flatten(value, path = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).reduce((a, [k, v]) => ({ ...a, ...flatten(v, path ? `${path}.${k}` : k) }), {});
  }
  if (Array.isArray(value)) {
    return value.reduce((a, v, i) => ({ ...a, ...flatten(v, `${path}[${i}]`) }), {});
  }
  return { [path]: value };
}

const isPerRun = (leaf) => PER_RUN_LEAVES.has(leaf.replace(/\[\d+\]/g, ''));

/** Content diff between two JSON files, ignoring the wall-clock stamps. */
export function contentDiff(aPath, bPath) {
  const a = flatten(JSON.parse(readFileSync(aPath, 'utf8')));
  const b = flatten(JSON.parse(readFileSync(bPath, 'utf8')));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of [...keys].sort()) {
    if (isPerRun(k)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ key: k, from: a[k], to: b[k] });
  }
  return out;
}

export function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** `{file: sha256}` for the committed fixture — the tamper check's reference. */
export function fixtureManifest(dir = FIXTURE_DIR) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    out[f] = sha256File(join(dir, f));
  }
  return out;
}

function writeManifest() {
  const m = fixtureManifest();
  const body = Object.entries(m).map(([f, h]) => `${h}  ${f}`).join('\n');
  writeFileSync(MANIFEST_PATH, `# B-034 frozen deliverable-input fixture.\n`
    + `# Regenerate with: npm run fixtures:regen\n`
    + `# A test run that changes any of these hashes is a test writing its own\n`
    + `# input, which is the B-043 trap. deliverableFixture.test.ts asserts it.\n${body}\n`);
  return m;
}

// Everything below runs ONLY when this file is the entry point. The two
// deliverable suites import FIXTURE_DIR from here, and an unguarded main block
// would spawn a full offline build on import — a test that rebuilds its own
// input is the tautology this fixture exists to prevent.
const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) main();

function main() {
const argv = process.argv.slice(2);
const check = argv.includes('--check');

if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });

console.log(check
  ? 'B-034 fixture — checking the committed fixture against a fresh offline build'
  : 'B-034 fixture — regenerating from a fresh offline build');
console.log('');

// Rehearsal, not a delivery: keep the append-only committed run registry out of
// it, so regenerating a test fixture never writes rows into a delivery audit
// trail (and never leaves the tree dirty).
//
// `--no-pdf`: this fixture is the ten JSON inputs, which are produced by the
// engine stages. PDF rendering needs a Playwright Chromium binary that CI does
// not have, and no PDF affects a single value compared here.
const build = spawnSync(process.execPath, [join(HERE, 'build-all.mjs'), '--offline', '--no-pdf'], {
  stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  env: { ...process.env, KKME_RUNS_REGISTRY: join(mkdtempSync(join(tmpdir(), 'kkme-regen-')), 'runs.jsonl') },
});
if (build.status !== 0) {
  console.error('build-all --offline FAILED — refusing to touch the fixture.');
  console.error((build.stderr || build.stdout || '').split('\n').slice(-25).join('\n'));
  process.exit(2);
}

let movedFiles = 0;
let movedLeaves = 0;
for (const f of FIXTURE_FILES) {
  const fresh = join(OUTPUT_DIR, f);
  const frozen = join(FIXTURE_DIR, f);
  if (!existsSync(fresh)) {
    console.error(`  ${f}: MISSING from the fresh build — the runner set has changed. Fix this script's FIXTURE_FILES.`);
    process.exit(2);
  }
  if (!existsSync(frozen)) {
    console.log(`  ${f}: NEW`);
    movedFiles++;
    continue;
  }
  const d = contentDiff(frozen, fresh);
  if (!d.length) { console.log(`  ${f}: unchanged`); continue; }
  movedFiles++;
  movedLeaves += d.length;
  console.log(`  ${f}: ${d.length} leaf/leaves moved`);
  for (const { key, from, to } of d.slice(0, 8)) {
    console.log(`      ${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }
  if (d.length > 8) console.log(`      … ${d.length - 8} more`);
}

console.log('');
if (check) {
  if (movedFiles) {
    console.error(`FIXTURE STALE — ${movedFiles} file(s), ${movedLeaves} leaf value(s) moved.`);
    console.error('Run `npm run fixtures:regen`, READ the diff, and commit it deliberately.');
    process.exit(1);
  }
  console.log('fixture matches a fresh offline build');
  process.exit(0);
}

for (const f of FIXTURE_FILES) copyFileSync(join(OUTPUT_DIR, f), join(FIXTURE_DIR, f));
writeManifest();
console.log(movedFiles
  ? `wrote ${FIXTURE_FILES.length} files — ${movedFiles} moved, ${movedLeaves} leaf value(s). READ THE DIFF ABOVE before committing.`
  : `wrote ${FIXTURE_FILES.length} files — no engine movement (per-run fields only).`);
}
