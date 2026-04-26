// Pipeline tier vocabulary.
//
// Audit caught 1.08 GW / 1.4 GW / 3.7 GW / 1.5 GW APVA all surfaced
// under the bare label "pipeline." Each is a real, distinct funnel
// stage; the bug is that they share a noun.
//
// Live trace (2026-04-26):
//   1083 MW — Baltic flex pipeline (all non-operational fleet entries,
//             BESS-specific, credibility-weighted in S/D)
//   1395 MW — LT Litgrid TSO grid reservations
//   3700 MW — LT intention protocols filed
//   1545 MW — LT APVA grant call applications
//
// These are nested funnel stages (intention -> APVA -> TSO -> ops) but
// none is a strict subset of the next; each comes from a different
// authority and has a different commitment level. They MUST be labelled
// distinctly on every surface.

export type PipelineTier =
  | 'flex_pipeline'        // BESS pipeline from /s4.fleet (Baltic, all non-op entries)
  | 'lt_tso_reserved'      // Litgrid grid reservations (LT)
  | 'lt_intention_protocols' // intention protocols filed (LT)
  | 'lt_apva_applied';     // APVA grant call applications (LT)

export interface PipelineTierLabel {
  tier: PipelineTier;
  /** Short label for tile/headline use. Distinct from every other tier. */
  short: string;
  /** Authority + commitment-level disclosure for hover-title or detail line. */
  detail: string;
  /** Country scope: 'baltic' or one of the country ISO codes. */
  scope: 'baltic' | 'LT' | 'LV' | 'EE';
}

export const PIPELINE_TIER_LABELS: Readonly<Record<PipelineTier, PipelineTierLabel>> = Object.freeze({
  flex_pipeline: {
    tier: 'flex_pipeline',
    short: 'Flex pipeline',
    detail: 'all non-operational fleet entries; credibility-weighted in S/D',
    scope: 'baltic',
  },
  lt_tso_reserved: {
    tier: 'lt_tso_reserved',
    short: 'TSO reserved',
    detail: 'Litgrid grid-connection reservations (LT)',
    scope: 'LT',
  },
  lt_intention_protocols: {
    tier: 'lt_intention_protocols',
    short: 'Intention protocols',
    detail: 'declarations of intent filed with TSO; weakest commitment (LT)',
    scope: 'LT',
  },
  lt_apva_applied: {
    tier: 'lt_apva_applied',
    short: 'APVA applications',
    detail: 'APVA grant call applications against EUR 45M budget (LT)',
    scope: 'LT',
  },
});

export interface PipelineTierValues {
  flex_pipeline_mw?: number | null;
  lt_tso_reserved_mw?: number | null;
  lt_intention_protocols_mw?: number | null;
  lt_apva_applied_mw?: number | null;
}

export interface PipelineTierSummary {
  tier: PipelineTier;
  short: string;
  detail: string;
  scope: 'baltic' | 'LT' | 'LV' | 'EE';
  mw: number | null;
}

/** Return all four tiers paired with their MW values; null if value missing. */
export function summarizePipelineTiers(values: PipelineTierValues): PipelineTierSummary[] {
  const map: Record<PipelineTier, number | null | undefined> = {
    flex_pipeline: values.flex_pipeline_mw,
    lt_tso_reserved: values.lt_tso_reserved_mw,
    lt_intention_protocols: values.lt_intention_protocols_mw,
    lt_apva_applied: values.lt_apva_applied_mw,
  };
  return (Object.keys(PIPELINE_TIER_LABELS) as PipelineTier[]).map(tier => ({
    ...PIPELINE_TIER_LABELS[tier],
    mw: map[tier] ?? null,
  }));
}
