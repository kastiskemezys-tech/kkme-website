// Canonical "capture" vocabulary.
//
// Audit caught five different "capture" numbers on the page (€36, €32,
// €167.5, €3.38, plus monthly bars) under variations of the same noun.
// The numbers ARE different things — but readers can't tell which is the
// canonical headline. This module documents the three distinct concepts
// and pins their definitions so renderers can pick the right one.
//
// Concepts:
//
// 1. DA gross capture (CANONICAL HEADLINE).
//    Source: /s1/capture (computeDayCapture, energy-charts.info).
//    Definition: avg(top-N hourly prices) − avg(bottom-N hourly prices)
//    over a clean N-hour discharge window (N = 2 or 4).
//    Unit: €/MWh of throughput.
//    What it answers: "If you ran a clean 4h cycle on today's DA prices,
//    what spread would you capture per MWh?" THIS is the S1 hero, the
//    ticker, and the field investors quote. Today: €32.09/MWh (4h).
//
// 2. DA peak-trough range.
//    Source: /read.bess_net_capture / .intraday_capture (computeS1).
//    Definition: top-4h avg − bottom-4h avg from the *separate* LT
//    hourly price array, with bottom-4 floored at 0 (negative prices
//    treated as free charging). RTE applied to the charge leg only.
//    Unit: €/MWh of throughput.
//    What it answers: "What's the raw envelope of today's prices?"
//    NOT the same as gross capture — different source array, different
//    flooring. Today: €167.5/MWh (because p_low_avg = €0).
//
// 3. Realised arbitrage capture.
//    Source: /api/dispatch.arbitrage_detail.capture_eur_mwh.
//    Definition: revenue per MWh discharged from the dispatch model's
//    actual ISP-level allocation, after RTE losses, fees, and SoC
//    constraints. Unit: €/MWh discharged.
//    What it answers: "Of the spread theoretically available, how much
//    did the model actually capture given activation and SoC paths?"
//    Today: €3.38/MWh.

export type CaptureKind =
  | 'da_gross_capture'
  | 'da_peak_trough_range'
  | 'realised_arbitrage';

export interface CaptureLabel {
  kind: CaptureKind;
  /** Headline, short. */
  short: string;
  /** Explanatory subline shown beneath the headline. */
  detail: string;
  /** True if this is the canonical "today's capture" number. */
  canonical: boolean;
}

export const CAPTURE_LABELS: Readonly<Record<CaptureKind, CaptureLabel>> = Object.freeze({
  da_gross_capture: {
    kind: 'da_gross_capture',
    short: 'DA capture',
    detail: 'top-N − bottom-N average, €/MWh of throughput',
    canonical: true,
  },
  da_peak_trough_range: {
    kind: 'da_peak_trough_range',
    short: 'Peak–trough range',
    detail: 'raw daily envelope, top-4h avg − bottom-4h avg',
    canonical: false,
  },
  realised_arbitrage: {
    kind: 'realised_arbitrage',
    short: 'Realised arbitrage',
    detail: 'after RTE + SoC constraints, €/MWh discharged',
    canonical: false,
  },
});

/** Returns true iff the supplied kind is the canonical hero capture. */
export function isCanonicalCapture(kind: CaptureKind): boolean {
  return CAPTURE_LABELS[kind].canonical;
}

/** Compose a "vs canonical" footer line so non-canonical surfaces can defer to the hero. */
export function vsCanonicalFootnote(
  kind: CaptureKind,
  canonicalGross4h: number | null | undefined,
): string | null {
  if (kind === 'da_gross_capture') return null;
  if (canonicalGross4h == null) return null;
  return `Canonical DA capture (4h): €${canonicalGross4h.toFixed(0)}/MWh — see Signals · S1`;
}
