/**
 * Run registry — Phase 36.B6
 *
 * Bankability test #6 is auditability: every number in every delivered report
 * must be reproducible, which means every number must be traceable to the run
 * that produced it, and that run must record what it stood on. This module is
 * that mechanism.
 *
 * ── The trace ─────────────────────────────────────────────────────────────
 *
 *   a figure in the report
 *     → the delivery build's run_id, stamped in the footer
 *       → the runner run_ids that build consumed
 *         → engine_git_sha · input_hash · data_vintage · register_version
 *
 * `runs.jsonl` is append-only and committed. One JSON object per line, in
 * invocation order, so it reads with `tail`, diffs cleanly, and never needs a
 * merge resolution beyond concatenation.
 *
 * ── run_id is a CONTENT FINGERPRINT, not an invocation counter ────────────
 *
 * `run_id = <runner>-<12 hex of sha256(engine_git_sha ‖ input_hash ‖ output_hash)>`.
 *
 * The alternative — a random UUID per invocation — answers "which invocation
 * was this". A content fingerprint answers the question an advisor actually
 * asks: *"can I reproduce this number?"* Re-running the same engine over the
 * same inputs yields the SAME run_id, so a reproduction is self-evident rather
 * than something a reader has to take on trust; a run_id that fails to
 * reproduce is a finding, not an ambiguity.
 *
 * The cost is that the registry can carry the same run_id twice. That is not
 * duplication — it is a recorded reproduction, and each line carries its own
 * `timestamp`. Deduplicating would delete the evidence.
 *
 * ── What goes into each hash ──────────────────────────────────────────────
 *
 *   input_hash   everything that determines the answer: the runner, the
 *                subject, the declared options, the project config, a
 *                fingerprint of the KV or price history it read, and the
 *                register version in force.
 *   output_hash  the emitted payload with volatile fields stripped (see
 *                VOLATILE_KEYS). Stripping is what makes the registry's own
 *                test possible — two runs of the same inputs differ ONLY in
 *                their timestamps, so any other difference is real.
 *
 * `engine_git_sha` carries a `-dirty` suffix when the working tree has
 * uncommitted changes under `workers/` or `tools/consultancy/`. A delivered
 * number produced from a dirty tree is not reproducible from the repo alone,
 * and the registry says so rather than implying a clean provenance it does not
 * have.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HERE, OUTPUT_DIR, REPO_ROOT } from '../engine.mjs';
import { VERSION as DEMAND_FORECAST_VERSION } from '../../../workers/lib/demand-forecast.js';

export const RUNS_PATH = join(HERE, 'runs.jsonl');

/**
 * Fields stripped before hashing an output payload. Every one of them records
 * WHEN a run happened rather than WHAT it computed, so leaving them in would
 * make every output_hash unique and the registry's reproducibility claim
 * vacuous.
 */
export const VOLATILE_KEYS = ['generated_at', 'synced_at', 'fetched_at', 'timestamp', 'run'];

// ── Hashing ────────────────────────────────────────────────────────────────

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * Deterministic JSON: object keys sorted at every depth, so two structurally
 * identical payloads hash identically regardless of insertion order. Arrays
 * keep their order — order is meaning in a price series.
 *
 * `undefined` object values are DROPPED, exactly as `JSON.stringify` drops them
 * when the payload is written to disk. Hashing them as `null` instead would let
 * `{tolerance: undefined}` and `{tolerance: null}` collide — one of which is an
 * absent option and the other a declared one — while making `{a: undefined}`
 * differ from `{}`, which is the file that actually gets written. The rule is
 * therefore: the hash describes the persisted form.
 */
export function canonicalJson(value) {
  if (value === undefined) return 'null'; // top-level only; see the key filter below
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** Deep-remove the volatile keys. Returns a copy; the input is untouched. */
export function stripVolatile(value, keys = VOLATILE_KEYS) {
  if (Array.isArray(value)) return value.map((v) => stripVolatile(v, keys));
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (keys.includes(k)) continue;
    out[k] = stripVolatile(v, keys);
  }
  return out;
}

export const hashOf = (value) => sha256(canonicalJson(value));

/** The hash a payload is registered under: volatile fields removed first. */
export const hashPayload = (payload) => hashOf(stripVolatile(payload));

// ── Provenance ─────────────────────────────────────────────────────────────

let _sha = null;

/**
 * The commit the engine was at, with `-dirty` when anything that can move a
 * number is uncommitted. Memoised: a build calls this a dozen times and the
 * tree cannot change mid-build without invalidating the whole run anyway.
 */
export function engineGitSha({ refresh = false } = {}) {
  if (_sha && !refresh) return _sha;
  const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  try {
    const head = git(['rev-parse', 'HEAD']);
    // The registry is an append-only LOG of what the code did, not an input to
    // it, so its own uncommitted lines must not mark the engine dirty — a build
    // would otherwise report itself dirty purely because it had just recorded
    // itself. Everything else under workers/ and tools/consultancy/ counts.
    const dirty = git(['status', '--porcelain', '--', 'workers', 'tools/consultancy'])
      .split('\n')
      .filter((l) => l.trim() && !l.endsWith('tools/consultancy/runs.jsonl'));
    _sha = dirty.length ? `${head}-dirty` : head;
  } catch {
    _sha = 'unknown';
  }
  return _sha;
}

/**
 * The register version in force. Read from the register file rather than
 * recomputed here — `register.mjs` owns that definition (rule #4) and this
 * module must not become a second opinion about what version the model is on.
 */
export function registerVersion({ path = join(HERE, 'assumptions-register.json') } = {}) {
  try {
    const reg = JSON.parse(readFileSync(path, 'utf8'));
    return reg.version?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Data-vintage descriptor for a run that reads the live/frozen KV snapshot.
 * `kv_verified: false` travels with the run rather than being dropped — an
 * unverified snapshot is exactly the provenance a reader needs to see.
 */
export const kvVintage = (meta) => ({
  kind: 'kv-snapshot',
  kv_source: meta?.kv_source ?? 'unknown',
  captured_at: meta?.captured_at ?? null,
  verified: meta?.verified ?? false,
});

/**
 * Data-vintage descriptor for a run that replays committed price history.
 * Hashes the price arrays themselves, so a re-backfill that changes a single
 * hour changes the vintage — and therefore every run_id derived from it.
 */
export function priceVintage(payloads, { zone } = {}) {
  const list = Array.isArray(payloads) ? payloads : [payloads];
  return {
    kind: 'price-history',
    source: list[0]?.source ?? 'ENTSO-E Transparency Platform, documentType A44',
    zone: zone ?? list[0]?.zone ?? null,
    years: list.map((p) => p.year),
    hours_covered: list.reduce((a, p) => a + (p.hours_covered ?? 0), 0),
    resolution: list[0]?.resolution ?? null,
    content_hash: hashOf(list.map((p) => ({ year: p.year, prices: p.prices_eur_mwh }))),
  };
}

// ── The registry ───────────────────────────────────────────────────────────

const REQUIRED = ['run_id', 'timestamp', 'runner', 'engine_git_sha', 'input_hash', 'output_hash'];

export class RunRegistryError extends Error {}

/**
 * Build a registry entry. Pure — nothing is written.
 *
 * @param {{
 *   runner: string, subject?: string|null, kind?: string, inputs?: any,
 *   output: any, artefact?: string|null, data_vintage?: any,
 *   register_version?: string|null, timestamp?: string,
 *   engine_git_sha?: string, notes?: string|null,
 * }} spec
 *
 * Phase 36.D — `demand_module_version` joins the input hash. Every number in a
 * deliverable divides by the demand series, so a run made against a superseded
 * TSO forecast must not be reproducible as a run made against the current one.
 * Omitting it would be worse than a missing field: the run_ids would collide,
 * and the registry would positively assert that two different answers were the
 * same answer.
 */
export function buildEntry({
  runner, subject = null, kind = 'runner', inputs, output, artefact = null,
  data_vintage = null, register_version = registerVersion(),
  demand_module_version = DEMAND_FORECAST_VERSION.version,
  timestamp = new Date().toISOString(),
  engine_git_sha = engineGitSha(), notes = null,
}) {
  if (!runner) throw new RunRegistryError('a run must name its runner');
  const input_hash = hashOf({
    runner, subject, kind, inputs, data_vintage, register_version, demand_module_version,
  });
  const output_hash = typeof output === 'string' ? output : hashPayload(output);
  const run_id = `${runner}-${sha256(`${engine_git_sha} ${input_hash} ${output_hash}`).slice(0, 12)}`;
  return {
    run_id, timestamp, runner, kind, subject, artefact,
    engine_git_sha, input_hash, output_hash, data_vintage,
    register_version, demand_module_version,
    ...(notes ? { notes } : {}),
  };
}

/** Append one entry to the registry. Returns the entry. */
export function recordRun(entry, { path = RUNS_PATH } = {}) {
  for (const k of REQUIRED) {
    if (entry[k] == null) throw new RunRegistryError(`registry entry is missing "${k}"`);
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

/** Read the registry back. Blank lines tolerated; malformed lines are not. */
export function readRuns({ path = RUNS_PATH } = {}) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((line, i) => {
      try { return JSON.parse(line); } catch {
        throw new RunRegistryError(`runs.jsonl line ${i + 1} is not valid JSON`);
      }
    });
}

/** Every entry carrying a run_id, newest last. */
export const runsById = (id, opts) => readRuns(opts).filter((r) => r.run_id === id);

// ── The one funnel every runner writes through ─────────────────────────────

/**
 * Stamp a payload with its run block, write it to `output/<filename>`, and
 * append the registry entry.
 *
 * The stamp is INSIDE the payload (`payload.run`) so an output file carries its
 * own provenance even when it travels alone — a JSON handed to an advisor
 * answers "which engine, which data, which register" without the registry
 * beside it. `run` is a volatile key for hashing purposes, so stamping the
 * payload cannot perturb the hash it is derived from.
 */
export function writeRunOutput(filename, payload, spec) {
  const entry = buildEntry({ ...spec, output: payload });
  const stamped = {
    ...payload,
    run: {
      run_id: entry.run_id,
      engine_git_sha: entry.engine_git_sha,
      input_hash: entry.input_hash,
      output_hash: entry.output_hash,
      register_version: entry.register_version,
      data_vintage: entry.data_vintage,
      recorded_at: entry.timestamp,
    },
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const path = join(OUTPUT_DIR, filename);
  writeFileSync(path, `${JSON.stringify(stamped, null, 2)}\n`, 'utf8');
  recordRun({ ...entry, artefact: filename });
  return { path, run: stamped.run, entry };
}

// ── Delivery builds ────────────────────────────────────────────────────────

/**
 * The run_id a delivery build stamps on every artefact it emits.
 *
 * Derived from the run_ids it consumed, so it is the fingerprint of a SET of
 * runs rather than of a moment: rebuild the workbook from the same runner
 * outputs and the same register and it carries the same build id. The
 * generation date is deliberately NOT in it — a re-render on a later day of
 * identical numbers is the same build, and saying otherwise would imply a
 * change that did not happen.
 */
export function deliveryRunId(sourceRunIds, { registerVersion: rv = registerVersion() } = {}) {
  const ids = [...sourceRunIds].filter(Boolean).sort();
  if (!ids.length) throw new RunRegistryError('a delivery build must consume at least one run');
  const input_hash = hashOf({ sources: ids, register_version: rv });
  return {
    run_id: `delivery-${sha256(`${engineGitSha()} ${input_hash}`).slice(0, 12)}`,
    input_hash,
    sources: ids,
    register_version: rv,
  };
}

/**
 * Record one emitted artefact (xlsx / html / pdf / README) under a build id.
 *
 * `path` is the artefact on disk; `registryPath` is where the line is appended
 * and exists so a test can record into a temporary registry. It defaulted to the
 * real one with no way to override it, which meant the test suite appended a
 * line to the committed governance log on every run — caught when the shipped
 * registry came back one line longer than the build that produced it.
 */
export function recordArtefact({ build, artefact, path, notes = null, registryPath = RUNS_PATH }) {
  const bytes = readFileSync(path);
  return recordRun({
    run_id: build.run_id,
    timestamp: new Date().toISOString(),
    runner: 'delivery',
    kind: 'artefact',
    subject: artefact,
    artefact,
    engine_git_sha: engineGitSha(),
    input_hash: build.input_hash,
    output_hash: sha256(bytes),
    data_vintage: { kind: 'delivery-build', sources: build.sources },
    register_version: build.register_version,
    ...(notes ? { notes } : {}),
  }, { path: registryPath });
}

/** The run_ids a set of loaded runner payloads was produced by. */
export const sourceRunIds = (payloads) =>
  payloads.map((p) => p?.run?.run_id).filter(Boolean);
