/**
 * Phase 46 / B-066 — every backlog ID mentioned anywhere has a table row.
 *
 * The paid-for failure: B-036, B-037, B-038, B-039 and B-040 were filed in a
 * session-log PARAGRAPH and never entered the backlog table. Every sweep since
 * — every `grep '^| B-'`, including the tooling the backlog exists to feed —
 * was blind to five open items. They read as filed to the person who wrote the
 * sentence and as non-existent to everything downstream, which is the worst of
 * both: the work is recorded and unfindable.
 *
 * Filing has to go through the table. This makes that a red test rather than a
 * convention.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HANDOVER = resolve(process.cwd(), 'docs/handover.md');
const src = readFileSync(HANDOVER, 'utf8');

/** IDs that own a row: a line beginning `| B-0xx |`. */
const tabled = new Set([...src.matchAll(/^\| (B-\d+) \|/gm)].map((m) => m[1]));
/** Every B-id mentioned anywhere in the file, in prose or in a table. */
const mentioned = new Set([...src.matchAll(/\bB-(\d{3})\b/g)].map((m) => `B-${m[1]}`));

describe('backlog machine-readability (B-066)', () => {
  it('has a substantial table to begin with — the count is evidence (A7)', () => {
    expect(tabled.size).toBeGreaterThanOrEqual(60);
  });

  it('every B-id mentioned in handover.md owns a table row', () => {
    // The assertion that would have caught B-036..B-040 the day they were filed.
    const orphans = [...mentioned].filter((id) => !tabled.has(id)).sort();
    expect(
      orphans,
      'B-ids mentioned in prose with no table row — invisible to every `^| B-` sweep',
    ).toEqual([]);
  });

  it('every table row carries the full seven fields', () => {
    // The B-050/B-053 shape: a row with a missing cell silently shifts every
    // later column, so `status` reads as somebody's prose.
    const bad: string[] = [];
    for (const line of src.split('\n')) {
      const m = /^\| (B-\d+) \|/.exec(line);
      if (!m) continue;
      // id · type · priority · title · filed · status · detail = 7 cells, so 8 pipes minimum.
      const cells = line.split('|').length - 2;
      if (cells < 7) bad.push(`${m[1]} (${cells} cells)`);
    }
    expect(bad, 'backlog rows with fewer than 7 cells').toEqual([]);
  });

  it('no duplicate ids', () => {
    const ids = [...src.matchAll(/^\| (B-\d+) \|/gm)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });
});
