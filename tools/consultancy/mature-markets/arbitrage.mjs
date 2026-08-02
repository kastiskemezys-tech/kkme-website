// The arbitrage opportunity — ONE implementation, referenced per service (rule #4).
//
// Extracted from build-summary-table.mjs in 36.E1, unchanged in behaviour: the summary table is
// rebuilt and diffed byte-for-byte in the same commit. It moved because 36.E1 and 36.E2 need the
// same quantity, and the alternative — a second copy under the price-formation modules — is
// exactly the fork rule #4 exists to prevent. The E1 calibration proved the point before the
// extraction was made: DE FCR capacity price tracks this series at r = 0.837 in logs over 87
// months, so two slightly different arbitrage proxies would have produced two different
// price-formation models with no way to tell which was wrong.
//
// WHAT IT IS, AND WHAT IT IS NOT. This is the GROSS revenue a MW forgoes by committing to reserve
// instead of arbitraging the day-ahead curve: top-N hours minus bottom-N hours, one cycle a day,
// RTE-adjusted, spread over 24 h so it is comparable with a capacity price in EUR/MW/h. It is NOT
// the net value of that cycle to the battery — cycling costs degradation, and that subtraction
// lives in `marginalCyclingCost()` beside the engine primitives that determine it. Conflating the
// two would put an unpriced degradation term inside a market statistic.
//
// RTE IS AN ASSUMPTION, not a measurement, and every output that carries this number says so.

import { rowMinutes } from './loader.mjs';
import { RTE_BOL } from '../../../workers/fetch-s1.js';

export const ARB_WINDOW_HOURS = 4;   // battery duration assumed for the proxy

/**
 * Round-trip efficiency for the proxy. TWO values, and the divergence is the point.
 *
 * `ARB_RTE_ENGINE` is the canonical one — `RTE_BOL.h4`, the engine's own beginning-of-life RTE at
 * the 4 h duration this proxy assumes. Rule #4: no local literal, single-sourced from the model.
 *
 * `ARB_RTE_E0_PUBLISHED` is the 0.85 the E0 summary table was built and published with. It is
 * pinned here rather than corrected, because changing it would move every published
 * `arbitrage_opportunity` and `floor_to_arbitrage_ratio` in a shipped table — the same reason
 * B-055's truncation was filed rather than fixed mid-batch.
 *
 * WHAT THE DIVERGENCE COSTS, measured rather than feared: nothing, for this model. Every
 * price-formation parameter is calibrated as a RATIO to the arbitrage series (k = price / arb,
 * displacement = p10 of that same ratio), so scaling the series by RTE scales k by exactly its
 * inverse and the product k x arb is invariant. The floor is `displacement x arb - cycling` and
 * `displacement x arb` is invariant for the same reason, so only the cycling term is exposed —
 * and that reads RTE from `rteCurveFor`, the engine's, already. The calibration measures the
 * invariance rather than asserting it; see `rte_sensitivity` in the output.
 */
export const ARB_RTE_ENGINE = RTE_BOL.h4;
export const ARB_RTE_E0_PUBLISHED = 0.85;

/**
 * Daily top-N-hours minus bottom-N-hours spread, averaged over the month.
 * Works from any energy series (day-ahead or spot) at any resolution: rows are collapsed to
 * hourly duration-weighted means first, so a 5-minute market and an hourly one give comparable
 * numbers instead of the finer one showing a mechanically wider spread.
 */
export function arbitrageByMonth(rows, windowHours, rte = ARB_RTE_E0_PUBLISHED) {
  const hourly = new Map();   // 'YYYY-MM-DDTHH' -> {wSum, wTot}
  for (const r of rows) {
    if (r.price_norm === null) continue;
    const mins = rowMinutes(r) ?? 0;
    if (!mins) continue;
    const h = r.period_start.slice(0, 13);
    let g = hourly.get(h);
    if (!g) hourly.set(h, g = { wSum: 0, wTot: 0 });
    g.wSum += r.price_norm * mins; g.wTot += mins;
  }
  const byDay = new Map();
  for (const [h, g] of hourly) {
    const d = h.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)).push(g.wSum / g.wTot);
  }
  const byMonth = new Map();
  for (const [d, prices] of byDay) {
    if (prices.length < windowHours * 2) continue;   // a partial day cannot give a day's spread
    const s = [...prices].sort((a, b) => a - b);
    const low = s.slice(0, windowHours).reduce((x, y) => x + y, 0) / windowHours;
    const high = s.slice(-windowHours).reduce((x, y) => x + y, 0) / windowHours;
    const m = d.slice(0, 7);
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)).push(high - low);
  }
  const out = new Map();
  for (const [m, spreads] of byMonth) {
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    out.set(m, {
      spread_eur_mwh: mean,
      // Availability-equivalent: one cycle/day of `windowHours` at this spread, spread over 24 h.
      arb_eur_mw_h: (mean * windowHours * rte) / 24,
      n_days: spreads.length,
    });
  }
  return out;
}

/**
 * The same statistic from a flat hourly price array — the shape the Baltic day-ahead files use
 * (`tools/consultancy/data/da-hourly-LT-<year>.json`, 8 760 UTC hours from 1 January).
 *
 * Deliberately a thin adapter onto the SAME day/spread/normalisation arithmetic rather than a
 * second implementation of it: the Baltic and German numbers are compared directly in the E1/E2
 * calibration, and a comparison between two differently-computed spreads measures the difference
 * between the two computations at least as much as the difference between the two markets.
 */
export function arbitrageByMonthFromHourly(year, prices, windowHours, rte = ARB_RTE_E0_PUBLISHED) {
  const rows = [];
  const start = Date.UTC(year, 0, 1);
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    if (p === null || p === undefined) continue;
    rows.push({
      price_norm: p,
      period_start: new Date(start + i * 3600e3).toISOString(),
      period_end: new Date(start + (i + 1) * 3600e3).toISOString(),
      resolution: 'PT60M',
    });
  }
  return arbitrageByMonth(rows, windowHours, rte);
}
