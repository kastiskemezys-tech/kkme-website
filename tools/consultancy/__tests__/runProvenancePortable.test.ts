// Phase 50 — a run's fingerprint must not depend on where the repo is checked out.
//
// The run registry's stated central claim (lib/runs.mjs header): "Re-running the
// same engine over the same inputs yields the SAME run_id, so a reproduction is
// self-evident rather than something a reader has to take on trust."
//
// It was false across machines. `source_dir` was recorded ABSOLUTE and is part of
// the hashed `inputs`, so the same engine over the same inputs produced different
// `input_hash`, `output_hash` and `run_id` on a laptop and on a CI runner. A
// reproduction attempted anywhere else would have looked like a failed
// reproduction — the registry reporting a mismatch it had manufactured itself.
//
// Found by the fixture-currency gate: it called the deliverable fixture stale in
// CI with twelve moved leaves, not one of which was an engine number.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRelative } from '../lib/runs.mjs';

const FIXTURE_DIR = join(import.meta.dirname, '../__fixtures__/deliverable-inputs');

describe('repoRelative', () => {
  it('strips the checkout root', () => {
    const abs = join(import.meta.dirname, '../projects/prosperus');
    expect(repoRelative(abs)).toBe('tools/consultancy/projects/prosperus');
  });

  it('leaves a path outside the repo alone rather than emitting ../.. noise', () => {
    // `../../..` is just as machine-specific and harder to read.
    expect(repoRelative('/etc/hosts')).toBe('/etc/hosts');
  });

  it('passes through non-paths untouched', () => {
    expect(repoRelative('')).toBe('');
    expect(repoRelative(null as never)).toBe(null);
  });
});

describe('no committed run artifact carries a machine-specific path', () => {
  it('every source_dir in the fixture is relative', () => {
    for (const f of readdirSync(FIXTURE_DIR).filter((x) => x.endsWith('.json'))) {
      const raw = readFileSync(join(FIXTURE_DIR, f), 'utf8');
      const d = JSON.parse(raw);
      if (d.source_dir !== undefined) {
        expect(d.source_dir, `${f}.source_dir`).not.toMatch(/^\//);
        expect(d.source_dir, `${f}.source_dir`).not.toMatch(/^[A-Za-z]:\\/);
      }
    }
  });

  it('no fixture file contains an absolute home or runner path anywhere', () => {
    // Behavioural catch-all: the specific strings that differ between a laptop
    // and a runner must not appear at all, in any field.
    for (const f of readdirSync(FIXTURE_DIR).filter((x) => x.endsWith('.json'))) {
      const raw = readFileSync(join(FIXTURE_DIR, f), 'utf8');
      expect(raw, `${f} carries /Users/`).not.toMatch(/\/Users\//);
      expect(raw, `${f} carries /home/runner`).not.toMatch(/\/home\/runner/);
    }
  });
});
