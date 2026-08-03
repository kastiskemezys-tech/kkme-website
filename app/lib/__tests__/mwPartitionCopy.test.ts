/**
 * Phase 38.6a — the drawer copy, asserted as the strings a reader sees (B13).
 *
 * This is public-facing prose about a number that moved a lender-relevant
 * figure. It gets the same treatment as a computed field: pinned, and unable
 * to drift from the payload it describes.
 */
import { describe, it, expect } from 'vitest';
import { partitionExplainer, PARTITION_REFERENCE, PARTITION_MEDIAN } from '../mwPartitionCopy';

const all = (share: number | null) => partitionExplainer(share).paragraphs.join(' ');

describe('38.6a — the partition explainer says what happened', () => {
  it('names the defect in the reader\'s terms, not the engine\'s', () => {
    const t = all(8);
    expect(t).toContain('already sold to the TSO');
    expect(t).toContain('earned twice');
    // No internal identifiers leak into public prose.
    for (const jargon of ['trading_fraction', 'effective_arb_pct', 'RESERVE_PRODUCTS',
      'da_mwh_per_mw_yr', 'mw_partition', 'unit_fix']) {
      expect(t, jargon).not.toContain(jargon);
    }
  });

  it('leads with the direction that is bad for the reader', () => {
    const t = all(8);
    expect(t).toContain('Gross Y1 falls');
    expect(t).toMatch(/Project IRR moves -7 pp|Project IRR moves −7 pp|Project IRR moves -7\b/);
    expect(t).toContain('below 1.00');
  });

  it('states the offsetting effect without using it to soften the headline', () => {
    const t = all(8);
    expect(t).toContain('ages far more slowly');
    // ...and the offset is stated as partial, never as cancelling.
    expect(t).toContain('partly offsets');
    expect(t).not.toMatch(/offsets? the revenue (entirely|fully|completely)/);
  });

  it('names the DSCR move as a capital-structure question', () => {
    const t = all(8);
    expect(t).toContain('capital-structure question, not a modelling one');
    expect(t).toContain('lower leverage');
  });

  it('states the residual at full size, with the arithmetic', () => {
    const t = all(8);
    expect(t).toContain('1.115');
    expect(t).toContain('1.70');
    expect(t).toContain('better, not closed');
    expect(t).toContain('split by direction');
    expect(t).toContain('ships separately');
  });

  it('computes the day-ahead share rather than asserting one', () => {
    expect(all(8)).toContain('day-ahead is 8% of gross above');
    expect(all(31)).toContain('day-ahead is 31% of gross above');
    // Rule #2: with nothing to compute from, it claims nothing.
    const none = all(null);
    expect(none).not.toContain('of gross above');
    expect(none).not.toContain('NaN');
    expect(none).not.toContain('undefined');
  });

  it('quotes the reference figures the operator signed', () => {
    const t = all(8);
    expect(PARTITION_REFERENCE.gross_y1_before).toBe(8842883);
    expect(PARTITION_REFERENCE.gross_y1_after).toBe(6593902);
    expect(PARTITION_MEDIAN.project_irr_pp).toBe(-7.0);
    expect(t).toContain('€8.84M');
    expect(t).toContain('€6.59M');
    expect(t).toContain('10.68%');
    expect(t).toContain('3.83%');
    expect(t).toContain('1.40');
    expect(t).toContain('0.89');
    // Attributed to the reference configuration, never to whatever is on screen.
    expect(t).toContain(PARTITION_REFERENCE.label);
  });

  it('degrades safely on a non-finite share', () => {
    for (const bad of [NaN, Infinity, undefined, null]) {
      const t = partitionExplainer(bad as number).paragraphs.join(' ');
      expect(t).not.toContain('NaN');
      expect(t).not.toContain('Infinity');
      expect(t).not.toContain('of gross above');
    }
  });
});
