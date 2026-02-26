import { BENCHMARKS } from './benchmarks';

export interface LivePrices {
  afrr_up_avg: number;              // €/MW/h from S2
  mfrr_up_avg: number;              // €/MW/h from S2
  spread_eur_mwh: number;           // €/MWh LT-SE4 coupling spread (regime info, not trading input)
  lt_daily_swing_eur_mwh?: number;  // €/MWh intraday swing — actual arbitrage window
  euribor_3m: number;               // % nominal 3M
}

export interface RevenueResult {
  // Per MW installed capacity
  afrr_annual_per_mw: number;    // €/MW/yr
  mfrr_annual_per_mw: number;    // €/MW/yr
  trading_annual_per_mw: number; // €/MW/yr
  gross_annual_per_mw: number;   // €/MW/yr
  opex_annual_per_mw: number;    // €/MW/yr (incl aggregator)
  net_annual_per_mw: number;     // €/MW/yr
  capex_per_mw: number;          // €/MW
  simple_payback_years: number;
  irr_approx_pct: number;
  irr_vs_ch_central: string;     // "above" | "below" | "within range of"

  // Context
  ch_irr_central: number;        // from CH report
  ch_irr_range: string;          // "6%–31%"
  market_window_note: string;
}

export interface MarketComparison {
  country: string;
  flag: string;
  irr_pct: number;
  net_annual_per_mw: number;
  capex_per_mw: number;
  note: string;
  is_live: boolean;
}

// Battery State-of-Health degradation curve (LFP, 18-year life)
// Source: CH report p.102; ~1.1%/yr fade years 1–10, ~0.8%/yr years 11–18
const SOH_CURVE: readonly number[] = [
  1.000, 0.989, 0.978, 0.967, 0.956,  // years 1–5
  0.945, 0.934, 0.923, 0.912, 0.900,  // years 6–10
  0.893, 0.886, 0.879, 0.872, 0.865,  // years 11–15
  0.858, 0.851, 0.844,                 // years 16–18
];

// Market saturation schedule — Clean Horizon S1 2025 central scenario
// Year 1 = COD year (current live prices as base); uses CURRENT prices as yr-1 anchor.
// aFRR: €60→32→20→10→5/MW/h. mFRR compresses slower: 39→24→20→15→12.
// Trading (DA spread) is more stable; compressed ~5%/yr as market deepens.
const MARKET_DECAY_SCHEDULE: ReadonlyArray<{ capacity: number; trading: number }> = [
  { capacity: 1.00, trading: 1.00 }, // yr 1: current prices
  { capacity: 0.52, trading: 0.95 }, // yr 2: aFRR halves
  { capacity: 0.30, trading: 0.90 }, // yr 3
  { capacity: 0.20, trading: 0.88 }, // yr 4
  { capacity: 0.17, trading: 0.85 }, // yr 5
  { capacity: 0.14, trading: 0.83 }, // yr 6
  { capacity: 0.13, trading: 0.82 }, // yr 7
  { capacity: 0.12, trading: 0.80 }, // yr 8–18 stable
];

function marketDecay(t: number): { capacity: number; trading: number } {
  return MARKET_DECAY_SCHEDULE[Math.min(t - 1, MARKET_DECAY_SCHEDULE.length - 1)];
}

const CAPACITY_FRACTION = 0.65;  // aFRR + mFRR share of net revenue
const TRADING_FRACTION  = 0.35;  // DA + ID arbitrage share

export function computeRevenue(
  prices: LivePrices,
  duration_h: 2 | 4,
): RevenueResult {
  const B = BENCHMARKS.bess;
  const key = `h${duration_h}` as 'h2' | 'h4';
  const capex = B.capex_per_mw[key] * 1000; // €/MW

  // Baltic prequalification binding constraint:
  // 2 MW battery power + 4 MWh energy → 1 MW symmetric service
  // Binding = min(power_MW/2, energy_MWh/4)
  // For 1 MW installed power: power constraint = 1/2 = 0.5 MW (always binding)
  // A 4h system has more energy but the SAME power rating → still 0.5 MW service
  const afrr_mw_provided = 0.5;  // MW per MW installed power (both 2h and 4h)
  const mfrr_mw_provided = 0.5;  // MW per MW installed power (both 2h and 4h)

  // Annual capacity revenue (€/MW/h × 8760h × availability × MW provided per MW installed)
  const afrr_annual = prices.afrr_up_avg * 8760 * B.availability * afrr_mw_provided;
  const mfrr_annual = prices.mfrr_up_avg * 8760 * B.availability * mfrr_mw_provided;

  // Trading: intraday arbitrage on LT hourly swing
  // 4h advantage: more MWh of storage to cycle → larger energy throughput
  // Unit: €/MWh × MWh/MW × cycles/day × days/yr = €/MW/yr ✓
  const capture_factor = 0.35;
  const duration_mwh_per_mw = duration_h;  // 2h → 2 MWh/MW; 4h → 4 MWh/MW
  const trading_swing = prices.lt_daily_swing_eur_mwh ?? prices.spread_eur_mwh;
  const trading_annual = trading_swing * capture_factor * B.cycles_per_day * 365 * duration_mwh_per_mw * B.roundtrip_efficiency;

  const gross_annual = afrr_annual + mfrr_annual + trading_annual;

  // OPEX: 2.5% capex + 8% revenue (aggregator)
  const opex_fixed = capex * B.opex_pct_capex;
  const opex_aggregator = gross_annual * B.aggregator_pct_revenue;
  const opex_total = opex_fixed + opex_aggregator;

  const net_annual = gross_annual - opex_total;

  const payback = net_annual > 0 ? capex / net_annual : Infinity;

  // IRR via NPV=0 binary search (18yr life)
  // Capacity revenue (aFRR+mFRR) compresses steeply per CH central scenario
  // Trading revenue (DA arbitrage) compresses slowly
  // SOH fade applies only to trading (energy-dependent); capacity priced on power
  function npv(rate: number): number {
    let n = -capex;
    for (let t = 1; t <= B.project_life_years; t++) {
      const soh   = SOH_CURVE[Math.min(t - 1, SOH_CURVE.length - 1)];
      const mkt   = marketDecay(t);
      const annual = net_annual * (
        CAPACITY_FRACTION * mkt.capacity +
        TRADING_FRACTION  * mkt.trading * soh
      );
      n += annual / Math.pow(1 + rate, t);
    }
    return n;
  }
  let lo = 0;
  let hi = 5.0; // max 500% IRR
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    npv(mid) > 0 ? (lo = mid) : (hi = mid);
  }
  const irr = lo * 100; // %

  const ch_central = B.ch_irr_central[key];
  const ch_low     = B.ch_irr_low[key];
  const ch_high    = B.ch_irr_high[key];
  const irr_vs_ch  = irr > ch_central * 1.1 ? 'above' :
                     irr < ch_central * 0.9 ? 'below' :
                     'within range of';

  return {
    afrr_annual_per_mw:    Math.round(afrr_annual),
    mfrr_annual_per_mw:    Math.round(mfrr_annual),
    trading_annual_per_mw: Math.round(trading_annual),
    gross_annual_per_mw:   Math.round(gross_annual),
    opex_annual_per_mw:    Math.round(opex_total),
    net_annual_per_mw:     Math.round(net_annual),
    capex_per_mw:          Math.round(capex),
    simple_payback_years:  Math.round(payback * 10) / 10,
    irr_approx_pct:        Math.round(irr * 10) / 10,
    irr_vs_ch_central:     irr_vs_ch,
    ch_irr_central:        ch_central,
    ch_irr_range:          `${ch_low}%–${ch_high}%`,
    market_window_note:    B.revenue_peak_note,
  };
}

export function computeMarketComparison(liveLT: LivePrices): MarketComparison[] {
  return BENCHMARKS.bess.markets
    .map((m) => {
      const mAfrr = 'afrr_up_eur_mwh' in m ? (m as { afrr_up_eur_mwh: number | null }).afrr_up_eur_mwh : null;
      const mMfrr = 'mfrr_up_eur_mwh' in m ? (m as { mfrr_up_eur_mwh: number | null }).mfrr_up_eur_mwh : null;
      const mSpread = 'da_spread_eur_mwh' in m ? (m as { da_spread_eur_mwh: number | null }).da_spread_eur_mwh : null;

      const prices: LivePrices = {
        afrr_up_avg:              mAfrr   ?? liveLT.afrr_up_avg,
        mfrr_up_avg:              mMfrr   ?? liveLT.mfrr_up_avg,
        spread_eur_mwh:           mSpread ?? liveLT.spread_eur_mwh,
        // For market comparison, use market's reference swing (da_spread_eur_mwh in benchmarks
        // represents the typical intraday swing for each market)
        lt_daily_swing_eur_mwh:   mSpread ?? liveLT.lt_daily_swing_eur_mwh,
        euribor_3m:               liveLT.euribor_3m,
      };
      const rev = computeRevenue(prices, 2);
      const mIrr = 'irr_central_pct' in m ? (m as { irr_central_pct: number | null }).irr_central_pct : null;

      return {
        country:          m.country,
        flag:             m.flag,
        irr_pct:          mIrr ?? rev.irr_approx_pct,
        net_annual_per_mw: rev.net_annual_per_mw,
        capex_per_mw:     m.capex_per_mw,
        note:             m.note,
        is_live:          mAfrr === null,
      };
    })
    .sort((a, b) => b.irr_pct - a.irr_pct);
}
