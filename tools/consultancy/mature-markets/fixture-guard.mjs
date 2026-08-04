/**
 * Phase 44 §5 / B-043 — a fetcher must not rewrite its own fixture.
 *
 * Six of the mature-market fetchers overwrote their recorded sample on every
 * run. That silently destroys the one property a recorded fixture exists for.
 *
 * The point of a fixture is that it is a photograph of what the source looked
 * like WHEN THE PARSER WAS WRITTEN, so that a contract test fails when the
 * source changes shape. A fetcher that re-photographs the source on every run
 * keeps the fixture and the source in permanent agreement — which means the
 * test passes forever, including on the run where the source changed and the
 * parser started producing empty output. The check is not just useless at that
 * point; it is actively reassuring.
 *
 * So fixture recording becomes an explicit, deliberate act:
 *
 *   node fetch-au-aemo.mjs                     ← default: fixtures untouched
 *   node fetch-au-aemo.mjs --record-fixture    ← re-photograph, on purpose
 *
 * `scripts/gates/no-fetcher-writes-fixtures.sh` enforces that every FIXTURES
 * write goes through this helper, so a seventh fetcher cannot reintroduce it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** True when the invoking process was told, explicitly, to re-record. */
export function recordingEnabled(argv = process.argv.slice(2)) {
  return argv.includes('--record-fixture');
}

/**
 * Write a fixture only when recording was explicitly requested.
 *
 * Returns what it did, so the caller can SAY so. A skip that produces no output
 * is the kind of silence this whole phase is about.
 *
 * @returns {Promise<{written: boolean, reason: string}>}
 */
export async function writeFixture(fixturePath, contents, argv = process.argv.slice(2)) {
  if (!recordingEnabled(argv)) {
    return {
      written: false,
      reason: `skipped ${path.basename(fixturePath)} — pass --record-fixture to re-photograph the source `
            + '(B-043: a fixture the fetcher rewrites every run cannot detect schema drift)',
    };
  }
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.writeFile(fixturePath, contents);
  return { written: true, reason: `RE-RECORDED ${path.basename(fixturePath)} — the drift baseline for this source has been moved` };
}
