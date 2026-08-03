// Phase 38.6a — plain-language explanation of the MW partition, for the
// Returns drawer.
//
// This lives in its own module for the same reason `captureDefinitions.ts`
// does: the words are load-bearing, they get asserted by test as rendered
// strings rather than as component internals (B13), and a change to them is a
// reviewable diff rather than a JSX edit buried in a 2,000-line card.
//
// Voice rules that apply: numbers first, no editorial state labels, no claim
// about "where" or "when" a value comes from unless it is computed (rule #2).
// Everything here that is a NUMBER is either derived from the payload at render
// time or explicitly attributed to the reference configuration.

/** The reference configuration the signed 38.6 measurement was cut against. */
export const PARTITION_REFERENCE = Object.freeze({
  label: '50 MW · 4h · mid capex · COD 2027 · base',
  gross_y1_before: 8_842_883,
  gross_y1_after: 6_593_902,
  project_irr_before_pct: 10.68,
  project_irr_after_pct: 3.83,
  min_dscr_before: 1.40,
  min_dscr_after: 0.89,
  cycles_before: 317,
  cycles_after: 113,
});

/** Median move across all 54 public configurations. */
export const PARTITION_MEDIAN = Object.freeze({
  gross_y1_pct: -20.6,
  project_irr_pp: -7.0,
  cycles_pct: -63.8,
});

export interface PartitionCopyBlock {
  heading: string;
  paragraphs: string[];
}

/**
 * What changed, why, and what it costs — in the order a reader needs it.
 *
 * `daShareOfGrossPct` is read from the payload so the first paragraph carries a
 * number the reader can check against the split above it, rather than a
 * hardcoded one that would drift from whatever configuration is on screen.
 */
export function partitionExplainer(
  daShareOfGrossPct: number | null | undefined,
): PartitionCopyBlock {
  const share = typeof daShareOfGrossPct === 'number' && Number.isFinite(daShareOfGrossPct)
    ? `${daShareOfGrossPct.toFixed(0)}%`
    : null;

  return {
    heading: 'Why trading is a small share',
    paragraphs: [
      // 1. The defect, in one sentence, in the reader's terms.
      'Until this version the model booked day-ahead arbitrage on megawatts it had '
        + 'already sold to the TSO. Reserve products were allocated the whole asset, and '
        + 'the trading line then took 70% of the same asset again — so the same '
        + 'megawatt earned twice, once as reserve capacity and once as arbitrage.',

      // 2. The correction.
      'Trading is now allocated the megawatt-hours actually left over after FCR, aFRR '
        + 'and mFRR have taken theirs'
        + (share ? `, which is why day-ahead is ${share} of gross above` : '')
        + '. The engine had always computed that physical share; it had never spent it.',

      // 3. What it costs, both directions, no hedging.
      `Gross Y1 falls about a fifth — ${PARTITION_MEDIAN.gross_y1_pct}% median across the 54 `
        + `published configurations, ${fmtEurM(PARTITION_REFERENCE.gross_y1_before)} to `
        + `${fmtEurM(PARTITION_REFERENCE.gross_y1_after)} at the reference asset `
        + `(${PARTITION_REFERENCE.label}). Cycling falls with it, `
        + `${PARTITION_MEDIAN.cycles_pct}%, because the asset is no longer modelled as `
        + 'moving energy it was never paid for — so it ages far more slowly, and that '
        + 'partly offsets the revenue.',

      // 4. The consequence that matters to a lender, named as what it is.
      `Project IRR moves ${PARTITION_MEDIAN.project_irr_pp} pp at the median `
        + `(${PARTITION_REFERENCE.project_irr_before_pct}% to `
        + `${PARTITION_REFERENCE.project_irr_after_pct}% at the reference asset). Minimum `
        + `DSCR goes ${PARTITION_REFERENCE.min_dscr_before.toFixed(2)} to `
        + `${PARTITION_REFERENCE.min_dscr_after.toFixed(2)} there, below 1.00 — at current `
        + 'gearing. That is a capital-structure question, not a modelling one: the same '
        + 'asset at lower leverage services its debt. The old basis is not recoverable by '
        + 'changing an assumption, because it was arithmetic that did not hold.',

      // 5. The residual, stated at full size. Rule: the breach IS the finding.
      'What this does not yet fix: reserve products are still allocated the whole asset '
        + 'for throughput purposes, so committed power now sums to 1.115 times the '
        + 'asset rather than 1.70 — better, not closed. Closing it needs each product '
        + 'split by direction, up and down, which the reserve definitions cannot '
        + 'currently express. That ships separately.',
    ],
  };
}

function fmtEurM(v: number): string {
  return `€${(v / 1_000_000).toFixed(2)}M`;
}


// ── Phase 38.8a — the route-to-market and BRP cost stack ────────────────────
//
// Same treatment as the partition copy above: its own module, asserted as
// rendered strings, no internal identifiers, and every number either computed
// at render time or explicitly attributed to the reference configuration.

/** Reference-configuration figures for the cost-stack correction. */
export const COST_STACK_REFERENCE = Object.freeze({
  label: '50 MW · 4h · mid capex · COD 2027 · base',
  project_irr_pre_partition_pct: 10.68,
  project_irr_shipped_pct: 3.83,
  project_irr_with_stack_pct: 4.82,
  min_dscr_before: 0.89,
  min_dscr_after: 0.95,
  rev_net_before: 5_754_512,
  rev_net_after: 5_913_580,
});

/** Median move across all 54 public configurations. */
/**
 * The bound the PMC paragraph claims, in euros per year for a 50 MW asset.
 * Asserted against the live payload by test, so the copy cannot drift away from
 * the number it describes. An earlier draft said "roughly two thousand", carried
 * over from a pre-partition throughput estimate; the shipped engine computes
 * EUR 669-1,030 across the 54 public configurations.
 */
export const PMC_CLAIM_UPPER_BOUND_EUR_YR = 1000;

export const COST_STACK_MEDIAN = Object.freeze({
  project_irr_pp: 1.51,
  rev_net_pct: 4.35,
  net_vs_pre_partition_pp: -4.88,
});

export function costStackExplainer(): PartitionCopyBlock {
  const R = COST_STACK_REFERENCE;
  return {
    heading: 'What comes out of gross, and on what evidence',
    paragraphs: [
      // 1. What changed and why it is better evidenced.
      'The fees deducted below gross were previously assumed from market '
        + 'hearsay: a 10–13% route-to-market charge on gross revenue, plus a flat '
        + 'annual platform fee. Neither matches how these agreements are actually '
        + 'structured. The charge is a smaller percentage applied to the owner\u2019s '
        + 'share after exchange fees, the flat fee does not exist, and two real '
        + 'costs were missing entirely — power-exchange fees and the transmission '
        + 'operator\u2019s balancing-capacity charge.',

      // 2. The net effect, both directions, with the offsetting cost named.
      `Correcting all five moves project IRR at the reference asset (${R.label}) `
        + `from ${R.project_irr_shipped_pct}% to ${R.project_irr_with_stack_pct}%, `
        + `a median of +${COST_STACK_MEDIAN.project_irr_pp} pp across the 54 published `
        + 'configurations. Most of that is the two overstated charges coming out. '
        + 'A newly-modelled standby auxiliary load — the power the system draws when '
        + 'it is idle — pushes back the other way, and it is the only line here that '
        + 'reduces returns.',

      // 3. DSCR — the thing a reader should NOT have to derive.
      `Minimum debt-service cover moves ${R.min_dscr_before.toFixed(2)} to `
        + `${R.min_dscr_after.toFixed(2)} at the reference asset. It does not cross `
        + '1.00. This correction is favourable and it does not rescue the '
        + 'debt-service position at current gearing — that remains a question about '
        + 'capital structure, not about the model.',

      // 4. PMC — evidence the sweep was not fishing for direction.
      'One line is worth reporting precisely because it changed nothing. Power '
        + 'exchange fees, the only cost here with a firm published source — the '
        + 'exchange\u2019s own published fee schedule — come to under a thousand euros a '
        + 'year on a 50 MW asset, and move returns by about a hundredth of a '
        + 'percentage point. It was named as one of five defects, it is now '
        + 'measured, and it is immaterial.',

      // 5. THE TWO GAPS. Stated, not buried.
      'Two things about the balancing-capacity charge are not settled, and both '
        + 'are carried in the direction that lowers returns rather than raises them. '
        + 'The published tariff we use is the Estonian transmission operator\u2019s; the '
        + 'assets modelled here are Lithuanian, and no equivalent Lithuanian figure '
        + 'has been located. And no source establishes whether a storage asset pays '
        + 'the charge on both legs of its own round trip — on the energy it buys and '
        + 'again on the energy it sells. We assume it does. If either turns out '
        + 'otherwise, returns improve from here.',
    ],
  };
}
