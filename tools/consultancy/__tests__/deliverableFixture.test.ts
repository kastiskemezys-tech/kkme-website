// B-034 — the frozen deliverable-input fixture, and the two properties that make
// freezing it safe.
//
// The defect: `deliverable.test.ts` and `xlsx.test.ts` called `loadInputs()` with
// no argument, reading `tools/consultancy/output/` — untracked, generated, and
// whatever the last local build happened to leave there. `npm test` therefore
// graded a stale artifact. Measured when the fixture was captured (2026-08-03),
// the outputs those suites had been grading were ~24 % adrift from the current
// engine: `gross_market_revenues` 12,770,114 → 9,698,737 on the first bridge
// year, 329 of 745 leaves moved in portfolio.json. Both suites passed either way.
//
// What is asserted here, none of it a restatement of the fixture's values:
//
//   1. `output/` stays UNTRACKED — the fix must not smuggle generated artifacts
//      into git (C1: generated files are never tracked).
//   2. The fixture matches its COMMITTED hash manifest, so an edit that skipped
//      `npm run fixtures:regen` is visible.
//   3. The fixture is NOT WRITTEN during a test run. That is B-043's trap one
//      step away: a suite that regenerates its own input cannot fail, because
//      the input always agrees with the code that just produced it.
//
// **What this fixture does NOT do, stated plainly.** It does not pin the
// deliverable's numbers through `deliverable.test.ts` / `xlsx.test.ts`. Those
// suites test the CONSISTENCY GATE, which compares HTML generated FROM the
// inputs against those same inputs — move an input and both sides move together
// (B5, a mirror). Injection-verified: `portfolio.mw + 7` leaves all 62 of their
// tests green, while a broken `engine_version` agreement goes red. Value drift
// is caught by the `fixture-currency` gate (fixture vs a fresh offline build)
// and by the hash manifest below, not by those suites.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIXTURE_DIR, FIXTURE_FILES, MANIFEST_PATH, fixtureManifest,
} from '../regen-fixtures.mjs';

/** Hashes taken as this file is imported — i.e. before the suites run. */
const atStart = fixtureManifest();

describe('the fixture exists and is complete', () => {
  it('holds exactly the files loadInputs reads', () => {
    for (const f of FIXTURE_FILES) {
      expect(existsSync(join(FIXTURE_DIR, f)), `${f} missing from the fixture`).toBe(true);
    }
    const present = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();
    expect(present).toEqual([...FIXTURE_FILES].sort());
  });

  it('ships a committed hash manifest', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(Object.keys(atStart)).toHaveLength(FIXTURE_FILES.length);
  });

  it('the fixture on disk matches the COMMITTED manifest', () => {
    // Caught by injection: the run-scoped check below compares the fixture to
    // ITSELF at two moments, so a fixture edited before the run agreed with
    // itself perfectly and every test stayed green. Hashing against the
    // committed manifest is what makes an edit visible — the run-scoped check
    // answers "did a test write this?", this one answers "is this the artifact
    // that was reviewed?". Both are needed; neither substitutes for the other.
    const committed: Record<string, string> = {};
    for (const line of readFileSync(MANIFEST_PATH, 'utf8').split('\n')) {
      const m = line.match(/^([0-9a-f]{64})\s+(\S+)$/);
      if (m) committed[m[2]] = m[1];
    }
    expect(Object.keys(committed).sort()).toEqual([...FIXTURE_FILES].sort());
    for (const [f, hash] of Object.entries(committed)) {
      expect(atStart[f], `${f} does not match the committed hash — the fixture was `
        + 'edited without going through `npm run fixtures:regen`').toBe(hash);
    }
  });
});

describe('generated output stays out of git', () => {
  it('tools/consultancy/output/ is untracked', () => {
    // The lazy fix for B-034 is to commit output/. That trades a stale-input
    // hole for a tracked-generated-file hole (C1), which is the thing that
    // blocked a rebase with logs/btd.log.
    const tracked = execFileSync(
      'git', ['ls-files', 'tools/consultancy/output'], { encoding: 'utf8' },
    ).trim();
    expect(tracked, 'output/ must not be tracked').toBe('');
  });

  it('the fixture directory IS tracked — it is the committed input', () => {
    const tracked = execFileSync(
      'git', ['ls-files', 'tools/consultancy/__fixtures__/deliverable-inputs'],
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean);
    // The .json inputs plus the hash manifest, which lives INSIDE the directory
    // so `git add <dir>` cannot stage the data and leave the manifest behind —
    // it did exactly that once, and CI caught the mismatch.
    expect(tracked.filter((f) => f.endsWith('.json')).length).toBe(FIXTURE_FILES.length);
    expect(tracked.some((f) => f.endsWith('MANIFEST.sha256'))).toBe(true);
  });
});

describe('the fixture is read-only to the test run (B-043 trap)', () => {
  let atEnd: Record<string, string>;
  beforeAll(() => { atEnd = fixtureManifest(); });

  it('no fixture file changed while the suites ran', () => {
    // If a suite regenerates its own input, this is where it shows: the hash
    // taken at import time no longer matches the one taken now.
    expect(atEnd).toEqual(atStart);
  });

  afterAll(() => {
    // Checked again at the very end, because a later suite in the same run could
    // still write. Throwing in afterAll fails the file.
    const final = fixtureManifest();
    for (const [f, h] of Object.entries(atStart)) {
      if (final[f] !== h) {
        throw new Error(
          `fixture ${f} was rewritten during the test run — a test that regenerates `
          + 'its own input cannot fail (B-043). Use npm run fixtures:regen deliberately.',
        );
      }
    }
  });
});
