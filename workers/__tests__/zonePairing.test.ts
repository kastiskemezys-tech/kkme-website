/**
 * B-075 — two bidding zones need a common clock, not a common index.
 *
 * `computeHistorical` paired LT against SE4 with `lt30[i] - se430[i]` over flat
 * 30-day scrapes. Under curveType A03 each zone omits repeated positions
 * INDEPENDENTLY, so the arrays are not the same length and every pair after the
 * first divergent omission compares two different instants.
 *
 * The committed fixtures are single days, which is enough to prove the JOIN —
 * the 30-day behaviour is the same mechanism repeated, and the live measurement
 * that sized it is recorded in `docs/investigations/2026-08-04-b075-index-pairing.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pairOnTimestamp, parseA44Periods, extractPrices } from '../fetch-s1.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(here, 'fixtures', n), 'utf8');
const LT = fx('entsoe-a44-lt-2026-08-03.xml');

describe('B-075 · the join is on the clock', () => {
  it('pairs a document with itself on every slot it carries', () => {
    const paired = pairOnTimestamp(LT, LT);
    const slots = parseA44Periods(LT).reduce((s, p) => s + p.prices.length, 0);
    expect(paired).toHaveLength(slots);
    for (const [t, a, b] of paired) {
      expect(a).toBe(b);
      expect(Number.isFinite(t)).toBe(true);
    }
  });

  it('returns pairs in ascending time, so a caller cannot depend on document order', () => {
    const paired = pairOnTimestamp(LT, LT);
    for (let i = 1; i < paired.length; i++) {
      expect(paired[i][0]).toBeGreaterThan(paired[i - 1][0]);
    }
  });

  it('an A03 omission changes ONE slot under timestamp pairing, and the TAIL under index pairing', () => {
    // This test originally asserted that removing a `<Point>` costs a slot. It
    // does not, and the correction is the point of the row: under curveType A03
    // an omitted position means "the price HOLDS", so the reconstruction
    // forward-fills it and the slot count is unchanged. The defect is not a lost
    // slot — it is that the two zones omit DIFFERENT positions, so a flat scrape
    // of one is offset against a flat scrape of the other.
    const holed = LT.replace(/<Point>\s*<position>50<\/position>[\s\S]*?<\/Point>/, '');
    expect(holed.length).toBeLessThan(LT.length);   // the injection is not vacuous

    // Timestamp pairing: same slots, and exactly one value differs — position
    // 50 now carries position 49's price, which is what A03 says it means.
    const joined = pairOnTimestamp(LT, holed);
    expect(joined).toHaveLength(pairOnTimestamp(LT, LT).length);
    expect(joined.filter(([, x, y]) => x !== y)).toHaveLength(1);

    // Index pairing: one value fewer, and everything after the hole is compared
    // against the wrong slot.
    const a = extractPrices(LT);
    const b = extractPrices(holed);
    expect(b.length).toBe(a.length - 1);
    let misPaired = 0;
    for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) misPaired++;
    // A lower bound: on a flat stretch some neighbouring prices coincide by
    // chance. What matters is that it is large where the join's is one.
    expect(misPaired).toBeGreaterThan(10);
  });

  it('yields nothing when the two documents share no instant', () => {
    // Not a crash and not a silent zero-length average: the caller checks
    // length and returns nulls rather than dividing by it.
    const other = fx('entsoe-a44-lt-2025-10-26-dst-autumn.xml');
    expect(pairOnTimestamp(LT, other)).toHaveLength(0);
  });

  it('survives the DST days, where a positional assumption is worst', () => {
    for (const f of ['entsoe-a44-lt-2025-10-26-dst-autumn.xml', 'entsoe-a44-lt-2026-03-29-dst-spring.xml']) {
      const doc = fx(f);
      const paired = pairOnTimestamp(doc, doc);
      const slots = parseA44Periods(doc).reduce((s, p) => s + p.prices.length, 0);
      expect(paired, f).toHaveLength(slots);
    }
  });
});
