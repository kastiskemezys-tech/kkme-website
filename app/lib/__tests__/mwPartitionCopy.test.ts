/**
 * Phase 38.6a — the drawer copy, asserted as the strings a reader sees (B13).
 *
 * This is public-facing prose about a number that moved a lender-relevant
 * figure. It gets the same treatment as a computed field: pinned, and unable
 * to drift from the payload it describes.
 */
import { describe, it, expect } from 'vitest';
import { partitionExplainer, PARTITION_REFERENCE, PARTITION_MEDIAN, costStackExplainer, PMC_CLAIM_UPPER_BOUND_EUR_YR } from '../mwPartitionCopy';

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

/**
 * Phase 38.8a — the cost-stack drawer copy.
 *
 * Four things the operator required to be visible rather than derivable:
 * the two open gaps on the balancing charge, the DSCR position, and the fact
 * that the one firmly-sourced line turned out immaterial.
 */
describe('38.8a — the cost-stack explainer states what it does not know', () => {
  const all = () => costStackExplainer().paragraphs.join(' ');

  it('names what was wrong before, in the reader\'s terms', () => {
    const t = all();
    expect(t).toContain('market hearsay');
    expect(t).toContain('10–13%');
    expect(t).toContain('flat annual platform fee');
    for (const jargon of ['rtm_fee_pct', 'brp_fee_yr', 'COST_STACK', 'cost_stack',
      'fee_base', 'fee_rate', 'pmc', 'da_mwh_charged']) {
      expect(t.toLowerCase(), jargon).not.toContain(jargon.toLowerCase());
    }
  });

  it('GAP 1 — says the balancing tariff is Estonian applied to Lithuanian assets', () => {
    const t = all();
    expect(t).toContain('Estonian');
    expect(t).toContain('Lithuanian');
    expect(t).toContain('no equivalent Lithuanian figure has been located');
  });

  it('GAP 2 — says the both-legs treatment is unestablished', () => {
    const t = all();
    expect(t).toMatch(/both legs of its own round trip/);
    expect(t).toContain('We assume it does');
  });

  it('states both gaps are carried conservatively, and which way that cuts', () => {
    const t = all();
    expect(t).toContain('carried in the direction that lowers returns');
    // The reader is told the error direction, not just that error exists.
    expect(t).toContain('returns improve from here');
  });

  it('DSCR — says it does not cross 1.00, without making the reader derive it', () => {
    const t = all();
    expect(t).toContain('0.89');
    expect(t).toContain('0.95');
    expect(t).toContain('It does not cross 1.00');
    expect(t).toContain('does not rescue the debt-service position');
    expect(t).toContain('capital structure, not about the model');
  });

  it('PMC — reports the immaterial line as evidence, not as filler', () => {
    const t = all();
    expect(t).toContain('changed nothing');
    expect(t).toContain('firm published source');
    expect(t).toContain('immaterial');
  });

  it('does not soften the favourable direction into good news', () => {
    const t = all();
    // The offsetting cost is named in the same breath as the gain.
    expect(t).toContain('the only line here that reduces returns');
    expect(t).not.toMatch(/significant(ly)? (improve|better)/i);
  });

  it('renders no markdown that a plain paragraph cannot show', () => {
    for (const p of costStackExplainer().paragraphs) {
      expect(p).not.toContain('**');
      expect(p).not.toMatch(/\[[^\]]*\]\(/);
      expect(p).not.toContain('undefined');
      expect(p).not.toContain('NaN');
    }
  });
});

/**
 * Phase 38.8a-1 — the PMC claim is pinned to the number it describes.
 *
 * The first draft said "roughly two thousand euros a year", carried over from a
 * pre-partition throughput estimate. The shipped engine computes €669-1,030
 * across the 54 public configurations, so the copy overstated a published claim
 * by about 2x. Caught by reading the live payload after deploy, not by a gate —
 * which is why this test now exists.
 */
describe('38.8a-1 — the PMC paragraph matches the engine', () => {
  it('claims an upper bound the engine actually respects', () => {
    const t = costStackExplainer().paragraphs.join(' ');
    expect(t).toContain('under a thousand euros a year');
    expect(t).not.toContain('two thousand');
    expect(PMC_CLAIM_UPPER_BOUND_EUR_YR).toBe(1000);
  });

  it('states the asset size the claim is scaled to', () => {
    // "under a thousand euros" is meaningless without the MW it applies to.
    expect(costStackExplainer().paragraphs.join(' ')).toContain('50 MW asset');
  });
});
