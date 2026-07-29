// Phase 36.B6 — the run registry.
//
// The registry's whole claim is reproducibility: the same engine over the same
// inputs must produce the same run_id, and ANY change to the inputs must change
// it. These tests are that claim, exercised in both directions — a registry
// that only ever agrees with itself proves nothing, so every determinism test
// has a paired sensitivity test.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalJson, stripVolatile, hashOf, hashPayload, buildEntry, recordRun,
  readRuns, deliveryRunId, recordArtefact, sourceRunIds, engineGitSha,
  kvVintage, priceVintage, VOLATILE_KEYS, RunRegistryError,
} from '../lib/runs.mjs';

const tmpRegistry = () => join(mkdtempSync(join(tmpdir(), 'kkme-runs-')), 'runs.jsonl');

const SPEC = {
  runner: 'project',
  subject: 'kkme-reference',
  inputs: { config: { mw: 50, mwh: 100 }, scenario: 'base' },
  data_vintage: { kind: 'kv-snapshot', kv_source: 'fixture', verified: true },
  register_version: 'r1.aaaaaaaa',
  engine_git_sha: 'abc123',
};

const PAYLOAD = { generated_at: '2026-07-29T00:00:00.000Z', engine_version: 'v7.3', gross: 8_034_112 };

describe('canonical JSON', () => {
  it('is insensitive to key order at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } }))
      .toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('keeps array order, because order is meaning in a price series', () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('distinguishes values that stringify alike', () => {
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: '1' }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: [1] }));
  });

  it('hashes the PERSISTED form: an undefined option is an absent one, null is a declared one', () => {
    // JSON.stringify drops undefined values on the way to disk, so the hash has
    // to as well — otherwise two files that are byte-identical hash differently.
    expect(hashOf({ tolerance: undefined })).toBe(hashOf({}));
    expect(hashOf({ tolerance: null })).not.toBe(hashOf({}));
  });
});

describe('volatile stripping', () => {
  it('removes every declared key at any depth', () => {
    const stripped = stripVolatile({
      generated_at: 'x', keep: 1, nested: { timestamp: 'y', keep: 2, deep: [{ synced_at: 'z', keep: 3 }] },
    });
    expect(stripped).toEqual({ keep: 1, nested: { keep: 2, deep: [{ keep: 3 }] } });
  });

  it('does not mutate its input', () => {
    const src = { generated_at: 'x', keep: 1 };
    stripVolatile(src);
    expect(src.generated_at).toBe('x');
  });

  it('declares the run block itself volatile, so stamping cannot perturb the hash', () => {
    expect(VOLATILE_KEYS).toContain('run');
    const before = hashPayload(PAYLOAD);
    const after = hashPayload({ ...PAYLOAD, run: { run_id: 'project-deadbeef' } });
    expect(after).toBe(before);
  });
});

describe('run_id determinism — the registry\'s central claim', () => {
  it('two runs with identical inputs produce an identical output_hash and run_id', () => {
    const a = buildEntry({ ...SPEC, output: PAYLOAD, timestamp: '2026-07-29T01:00:00.000Z' });
    const b = buildEntry({
      ...SPEC,
      // A later invocation: different wall-clock, same everything else.
      output: { ...PAYLOAD, generated_at: '2026-08-04T09:22:11.000Z' },
      timestamp: '2026-08-04T09:22:11.000Z',
    });
    expect(b.output_hash).toBe(a.output_hash);
    expect(b.run_id).toBe(a.run_id);
    expect(b.timestamp).not.toBe(a.timestamp);
  });

  it('any change to the OUTPUT changes the run_id', () => {
    const base = buildEntry({ ...SPEC, output: PAYLOAD });
    const moved = buildEntry({ ...SPEC, output: { ...PAYLOAD, gross: 8_034_113 } });
    expect(moved.output_hash).not.toBe(base.output_hash);
    expect(moved.run_id).not.toBe(base.run_id);
  });

  it('any change to the INPUTS changes input_hash and run_id — one field at a time', () => {
    const base = buildEntry({ ...SPEC, output: PAYLOAD });
    const variants = {
      config: { ...SPEC, inputs: { ...SPEC.inputs, config: { mw: 48, mwh: 96 } } },
      scenario: { ...SPEC, inputs: { ...SPEC.inputs, scenario: 'downside' } },
      subject: { ...SPEC, subject: 'bitenai' },
      runner: { ...SPEC, runner: 'portfolio' },
      vintage: { ...SPEC, data_vintage: { ...SPEC.data_vintage, kv_source: 'live-public-routes' } },
      register: { ...SPEC, register_version: 'r2.bbbbbbbb' },
    };
    for (const [what, spec] of Object.entries(variants)) {
      const e = buildEntry({ ...spec, output: PAYLOAD });
      expect(e.input_hash, `${what} must move input_hash`).not.toBe(base.input_hash);
      expect(e.run_id, `${what} must move run_id`).not.toBe(base.run_id);
    }
  });

  it('the engine commit is folded in, so the same numbers from different code are different runs', () => {
    const a = buildEntry({ ...SPEC, output: PAYLOAD });
    const b = buildEntry({ ...SPEC, engine_git_sha: 'def456', output: PAYLOAD });
    expect(b.input_hash).toBe(a.input_hash);
    expect(b.output_hash).toBe(a.output_hash);
    expect(b.run_id).not.toBe(a.run_id);
  });

  it('names its runner in the id, so a registry line is legible without parsing', () => {
    expect(buildEntry({ ...SPEC, output: PAYLOAD }).run_id).toMatch(/^project-[0-9a-f]{12}$/);
  });
});

describe('the registry file', () => {
  it('appends one JSON object per line and reads back in order', () => {
    const path = tmpRegistry();
    const a = recordRun(buildEntry({ ...SPEC, output: PAYLOAD }), { path });
    const b = recordRun(buildEntry({ ...SPEC, subject: 'bitenai', output: PAYLOAD }), { path });
    const read = readRuns({ path });
    expect(read.map((r) => r.run_id)).toEqual([a.run_id, b.run_id]);
    expect(readFileSync(path, 'utf8').trimEnd().split('\n')).toHaveLength(2);
  });

  it('records a reproduction as a second line with the same id, rather than deduplicating', () => {
    const path = tmpRegistry();
    const e = buildEntry({ ...SPEC, output: PAYLOAD });
    recordRun({ ...e, timestamp: '2026-07-29T01:00:00.000Z' }, { path });
    recordRun({ ...e, timestamp: '2026-08-04T01:00:00.000Z' }, { path });
    const read = readRuns({ path });
    expect(read).toHaveLength(2);
    expect(new Set(read.map((r) => r.run_id)).size).toBe(1);
  });

  it('refuses an entry missing any required field', () => {
    const path = tmpRegistry();
    const e = buildEntry({ ...SPEC, output: PAYLOAD });
    for (const k of ['run_id', 'timestamp', 'runner', 'engine_git_sha', 'input_hash', 'output_hash']) {
      expect(() => recordRun({ ...e, [k]: undefined }, { path })).toThrow(RunRegistryError);
    }
    expect(readRuns({ path })).toHaveLength(0);
  });

  it('refuses a runner-less run rather than filing it under an empty name', () => {
    expect(() => buildEntry({ ...SPEC, runner: '', output: PAYLOAD })).toThrow(RunRegistryError);
  });

  it('throws on a corrupted line instead of silently skipping it', () => {
    const path = tmpRegistry();
    writeFileSync(path, '{"run_id":"x"}\nnot json\n');
    expect(() => readRuns({ path })).toThrow(/line 2/);
  });
});

describe('delivery builds', () => {
  const sources = ['project-aaaaaaaaaaaa', 'portfolio-bbbbbbbbbbbb', 'reconcile-cccccccccccc'];

  it('is a fingerprint of the SET of runs, so source order cannot change it', () => {
    const a = deliveryRunId(sources, { registerVersion: 'r1.aaaaaaaa' });
    const b = deliveryRunId([...sources].reverse(), { registerVersion: 'r1.aaaaaaaa' });
    expect(b.run_id).toBe(a.run_id);
    expect(a.run_id).toMatch(/^delivery-[0-9a-f]{12}$/);
  });

  it('moves when any source run or the register version moves', () => {
    const base = deliveryRunId(sources, { registerVersion: 'r1.aaaaaaaa' });
    expect(deliveryRunId([...sources.slice(1), 'project-dddddddddddd'], { registerVersion: 'r1.aaaaaaaa' }).run_id)
      .not.toBe(base.run_id);
    expect(deliveryRunId(sources, { registerVersion: 'r2.bbbbbbbb' }).run_id).not.toBe(base.run_id);
  });

  it('refuses to stamp a build that consumed nothing', () => {
    expect(() => deliveryRunId([])).toThrow(RunRegistryError);
    expect(() => deliveryRunId([undefined, null])).toThrow(RunRegistryError);
  });

  it('records each emitted artefact under the build id, hashing the bytes on disk', () => {
    const path = tmpRegistry();
    const filePath = join(path, '..', 'artefact.bin');
    writeFileSync(filePath, 'workbook bytes');
    const build = deliveryRunId(sources, { registerVersion: 'r1.aaaaaaaa' });
    const entry = recordArtefact({ build, artefact: 'Model.xlsx', path: filePath });
    expect(entry.run_id).toBe(build.run_id);
    expect(entry.kind).toBe('artefact');
    expect(entry.output_hash).toBe(hashOfBytes('workbook bytes'));
  });

  it('collects source ids from loaded payloads and ignores unstamped ones', () => {
    expect(sourceRunIds([{ run: { run_id: 'a-1' } }, {}, null, { run: { run_id: 'b-2' } }]))
      .toEqual(['a-1', 'b-2']);
  });
});

describe('vintage descriptors', () => {
  it('carries an unverified KV snapshot through rather than dropping it', () => {
    expect(kvVintage({ kv_source: 'live-public-routes', captured_at: 'T', verified: false }))
      .toEqual({ kind: 'kv-snapshot', kv_source: 'live-public-routes', captured_at: 'T', verified: false });
    expect(kvVintage(undefined).verified).toBe(false);
  });

  it('fingerprints the price series itself, so a re-backfilled hour changes the vintage', () => {
    const y = (prices: number[]) => ({
      zone: 'LT', year: 2024, hours_covered: prices.length, prices_eur_mwh: prices,
      source: 'ENTSO-E A44', resolution: 'PT60M',
    });
    const a = priceVintage([y([10, 20, 30])], { zone: 'LT' });
    const b = priceVintage([y([10, 20, 31])], { zone: 'LT' });
    expect(a.years).toEqual([2024]);
    expect(a.hours_covered).toBe(3);
    expect(b.content_hash).not.toBe(a.content_hash);
  });

  it('accepts a single payload as well as a list', () => {
    const one = { zone: 'LT', year: 2025, hours_covered: 8760, prices_eur_mwh: [1] };
    expect(priceVintage(one).years).toEqual([2025]);
  });
});

describe('engine provenance', () => {
  it('reports a real commit sha, marking a dirty tree rather than implying clean provenance', () => {
    const sha = engineGitSha({ refresh: true });
    expect(sha).toMatch(/^([0-9a-f]{40}(-dirty)?|unknown)$/);
  });
});

// Computed here rather than imported from the module under test: the assertion
// is that the artefact hash is over the FILE BYTES, so it has to be derived
// independently of the code that claims to do that.
function hashOfBytes(s: string): string {
  return createHash('sha256').update(Buffer.from(s)).digest('hex');
}
