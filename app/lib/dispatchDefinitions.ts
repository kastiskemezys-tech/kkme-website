// Canonical "today's dispatch" vocabulary.
//
// Audit caught EUR 292 / EUR 311 / EUR 371 / EUR 373 all appearing as
// "today's dispatch" / "live rate" across the page. Live trace (2026-04-26):
// EUR 292/MW/day (dispatch model) and EUR 311/MW/day (live rate). The 19
// EUR/MW/day gap is methodology, not error - but presenting both as
// "today's revenue" without methodology disclosure invites the audit's
// "which is right?" reaction.
//
// Two distinct methodologies pinned here:
//
// 1. Dispatch model (CANONICAL HEADLINE).
//    Source: /api/dispatch.revenue_per_mw.daily_eur.
//    Definition: ISP-level (96 intraday settlement periods) allocation
//    across capacity reservation, activation revenue, and arbitrage.
//    SoC-aware. Today: EUR 292/MW/day, mode realised, 4h.
//    What it answers: "What did the dispatch algorithm earn per MW
//    given today's clearing prices and SoC trajectory?" THIS is the
//    canonical because it traces every euro back to an ISP-level
//    decision the model made.
//
// 2. Live rate (SIMPLE AGGREGATE).
//    Source: /revenue.live_rate.today_total_daily.
//    Definition: today_trading_daily (DA capture * cycles)
//      + today_balancing_daily (S2 clearing rate * MW provided per MW
//      installed * 24h). Linear; no SoC/dispatch logic.
//    Today: EUR 311/MW/day = EUR 63 trading + EUR 248 balancing.
//    What it answers: "What's the back-of-envelope revenue using S1
//    capture and S2 clearing prices?" Useful for the Returns card
//    annualisation context, but NOT the canonical headline.

export type DispatchKind = 'dispatch_model' | 'live_rate_aggregate';

export interface DispatchLabel {
  kind: DispatchKind;
  short: string;
  detail: string;
  canonical: boolean;
}

export const DISPATCH_LABELS: Readonly<Record<DispatchKind, DispatchLabel>> = Object.freeze({
  dispatch_model: {
    kind: 'dispatch_model',
    short: 'Dispatch model',
    detail: 'ISP-level allocation, SoC-aware',
    canonical: true,
  },
  live_rate_aggregate: {
    kind: 'live_rate_aggregate',
    short: 'Live rate',
    detail: 'S1 capture × cycles + S2 clearing × MW',
    canonical: false,
  },
});

export function isCanonicalDispatch(kind: DispatchKind): boolean {
  return DISPATCH_LABELS[kind].canonical;
}

/** Footnote for non-canonical surfaces, deferring back to the dispatch model. */
export function vsCanonicalDispatchFootnote(
  kind: DispatchKind,
  canonicalDailyEurPerMw: number | null | undefined,
): string | null {
  if (kind === 'dispatch_model') return null;
  if (canonicalDailyEurPerMw == null) return null;
  return `Canonical dispatch (ISP model): €${canonicalDailyEurPerMw.toFixed(0)}/MW/day — see Trading`;
}
