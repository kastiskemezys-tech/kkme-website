/**
 * Phase 36.B batch-3, Part 2 — `extractPrices` and the negative day-ahead hour.
 *
 * The defect (36.B0-H) was a character class: `<price\.amount>([\d.]+)<` cannot
 * match a leading minus. The intuition is that this loses a sign. It does not —
 * it loses the whole ELEMENT, so the returned array is short and **every index
 * after the first negative hour points at the wrong hour**. A €21/MWh evening
 * price gets read as a midday price, and nothing downstream can tell.
 *
 * These tests are anchored on a REAL recorded ENTSO-E A44 response
 * (`fixtures/entsoe-a44-LT-2025-03-22.xml`, fetched from the Transparency
 * Platform) rather than a hand-written string, because the thing being asserted
 * is that the parser handles what the platform actually sends: seven negative
 * hours in a single Lithuanian spring day, in a document whose prices include
 * integers, one-decimal and two-decimal forms.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPrices } from '../fetch-s1.js';
import { parseA44 } from '../../tools/consultancy/backfill-entsoe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const XML = readFileSync(join(HERE, 'fixtures/entsoe-a44-LT-2025-03-22.xml'), 'utf8');

/** The regex as it stood before the fix — kept so the defect stays legible. */
const OLD = (xml: string) => {
  const out: number[] = [];
  const re = /<price\.amount>([\d.]+)<\/price\.amount>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(parseFloat(m[1]));
  return out;
};

/** 2025-03-22 CET, the first 24 points of the document. */
const DAY = [
  14.54, 6.68, 5.72, 5.09, 6.42, 11.57, 7.08, 5, 1,
  -0.01, -1.61, -5.33, -11.53, -10.83, -5.07, -1.35,
  1.24, 19.34, 21.24, 21.98, 19.33, 17.71, 17.62, 16.93,
];

describe('extractPrices — a real recorded negative-price day', () => {
  it('returns the day\'s 24 values exactly, signs included', () => {
    expect(extractPrices(XML).slice(0, 24)).toEqual(DAY);
  });

  it('reads every point the document declares — 48 hours, not 41', () => {
    const all = extractPrices(XML);
    expect(all).toHaveLength(48);
    expect(all.filter((p: number) => p < 0)).toHaveLength(7);
    expect(Math.min(...all)).toBe(-11.53);
  });

  it('agrees with the Node-side parser, which never had the defect', () => {
    // `parseA44` in backfill-entsoe.mjs built the committed 11-year history and
    // has always accepted negatives — which is why that history is clean and
    // only the worker path was affected. The two must not diverge again.
    const { acc } = parseA44(XML) as { acc: Map<string, { sum: number; n: number }> };
    const hourly = [...acc.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v.sum / v.n);
    expect(hourly.slice(0, 24).map((v) => Math.round(v * 100) / 100)).toEqual(DAY);
  });
});

describe('the defect itself, pinned so a revert cannot pass quietly', () => {
  it('the old regex dropped the element, not the sign', () => {
    const old = OLD(XML);
    expect(old).toHaveLength(41);              // 48 − 7 negative hours
    expect(old.every((p: number) => p >= 0)).toBe(true);
  });

  it('and every index after the first negative hour pointed at the wrong hour', () => {
    const old = OLD(XML);
    const fixed = extractPrices(XML);
    // Identical up to the first negative hour at index 9…
    expect(old.slice(0, 9)).toEqual(fixed.slice(0, 9));
    // …and wrong from there on. Hour 9 (a −0.01 trough) reported 1.24, the
    // value that actually belongs to hour 16.
    expect(old[9]).toBe(1.24);
    expect(fixed[9]).toBe(-0.01);
    expect(fixed[16]).toBe(1.24);
  });

  it('shifts the reported peak and trough hour, not just the prices', () => {
    const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
    const argmin = (a: number[]) => a.reduce((b, v, i) => (v < a[b] ? i : b), 0);
    const old = OLD(XML).slice(0, 24);
    const fixed = extractPrices(XML).slice(0, 24);
    // computeS1 turns these indices into `lt_peak_hour_utc` / `lt_trough_hour_utc`
    // on the public S1 payload — a hardcoded-temporal-label failure (rule #2)
    // arriving through a parser rather than through a display string.
    expect(argmax(old)).not.toBe(argmax(fixed));
    expect(argmin(old)).not.toBe(argmin(fixed));
    expect(Math.min(...old)).toBeGreaterThan(0);
    expect(Math.min(...fixed)).toBe(-11.53);
  });
});

describe('parsing shape — the forms the platform actually sends', () => {
  it('handles integers, one and two decimals, and a bare minus', () => {
    const xml =
      '<price.amount>5</price.amount>' +
      '<price.amount>2.9</price.amount>' +
      '<price.amount>-0.01</price.amount>' +
      '<price.amount>-56.55</price.amount>';
    expect(extractPrices(xml)).toEqual([5, 2.9, -0.01, -56.55]);
  });

  it('returns an empty array for an empty or priceless document', () => {
    expect(extractPrices('')).toEqual([]);
    expect(extractPrices('<Publication_MarketDocument/>')).toEqual([]);
  });
});
