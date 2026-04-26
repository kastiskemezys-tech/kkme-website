// Dispatch hourly chart unit normalisation.
//
// Worker /api/dispatch returns `hourly_dispatch[].revenue_eur` as absolute
// € for the reference asset (50 MW × 4h class), per hour. Chart was
// rendering raw € on the y-axis labelled bare "€" — readers infer
// €/MW/h or €/MWh by default and get a peak of ~€1,750 which can't tie
// to the €292/MW/day headline. Audit caught this in 30 seconds.
//
// Fix: divide each bar by mw_total so the chart axis is the same unit
// as the headline (€/MW/h ≈ headline / 24). Sum of bars MUST equal
// the daily €/MW headline within rounding.

export interface HourlyRevenue {
  hour: number;
  revenue_eur: { capacity: number; activation: number; arbitrage: number; total: number };
}

export interface NormalisedHour {
  hour: number;
  capacity_eur_per_mw_h: number;
  activation_eur_per_mw_h: number;
  arbitrage_eur_per_mw_h: number;
  total_eur_per_mw_h: number;
}

export function normaliseHourlyDispatch(
  hourly: ReadonlyArray<HourlyRevenue>,
  mwTotal: number,
): NormalisedHour[] {
  if (mwTotal <= 0) return [];
  return hourly.map(h => ({
    hour: h.hour,
    capacity_eur_per_mw_h: h.revenue_eur.capacity / mwTotal,
    activation_eur_per_mw_h: h.revenue_eur.activation / mwTotal,
    arbitrage_eur_per_mw_h: h.revenue_eur.arbitrage / mwTotal,
    total_eur_per_mw_h: h.revenue_eur.total / mwTotal,
  }));
}

/** Sum of normalised hourly bars; ought to equal daily €/MW headline within rounding. */
export function dailyTotalFromHourly(normalised: ReadonlyArray<NormalisedHour>): number {
  return normalised.reduce((s, h) => s + h.total_eur_per_mw_h, 0);
}

/** True if bars integrate (within tolerance €) to the headline. */
export function dispatchIntegrationOk(
  normalised: ReadonlyArray<NormalisedHour>,
  headlineEurPerMwDay: number,
  toleranceEur: number = 1.0,
): boolean {
  return Math.abs(dailyTotalFromHourly(normalised) - headlineEurPerMwDay) <= toleranceEur;
}

/** Daily average per hour — used as the reference line on the chart. */
export function dailyAvgPerHour(headlineEurPerMwDay: number): number {
  return headlineEurPerMwDay / 24;
}
