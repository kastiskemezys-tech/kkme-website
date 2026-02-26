import { BENCHMARKS } from './benchmarks';

export interface LivePrices {
  afrr_up_avg: number;     // €/MW/h from S2
  mfrr_up_avg: number;     // €/MW/h from S2
  spread_eur_mwh: number;  // €/MWh from S1
  euribor_3m: number;      // % from manual
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

export function computeRevenue(
  prices: LivePrices,
  duration_h: 2 | 4,
): RevenueResult {
  const B = BENCHMARKS.bess;
  const key = `h${duration_h}` as 'h2' | 'h4';
  const capex = B.capex_per_mw[key] * 1000; // €/MW

  // aFRR/mFRR: 2 MW power + 4 MWh capacity → 1 MW service
  // With 1 MW installed: 2h system has 2 MWh → provides 0.5 MW; 4h → 4 MWh → 1 MW
  const afrr_mw_provided = duration_h === 2 ? 0.5 : 1.0;
  const mfrr_mw_provided = duration_h === 2 ? 0.5 : 1.0;

  // Annual capacity revenue (€/MW/h × 8760h × availability × MW provided per MW installed)
  const afrr_annual = prices.afrr_up_avg * 8760 * B.availability * afrr_mw_provided;
  const mfrr_annual = prices.mfrr_up_avg * 8760 * B.availability * mfrr_mw_provided;

  // Trading: 1 full cycle per day on DA spread
  const trading_annual = prices.spread_eur_mwh * 365 * duration_h * B.roundtrip_efficiency;

  const gross_annual = afrr_annual + mfrr_annual + trading_annual;

  // OPEX: 2.5% capex + 8% revenue (aggregator)
  const opex_fixed = capex * B.opex_pct_capex;
  const opex_aggregator = gross_annual * B.aggregator_pct_revenue;
  const opex_total = opex_fixed + opex_aggregator;

  const net_annual = gross_annual - opex_total;

  const payback = net_annual > 0 ? capex / net_annual : Infinity;

  // IRR via NPV=0 binary search (18yr life, 8%/yr revenue decay post year 3)
  function npv(rate: number): number {
    let n = -capex;
    for (let t = 1; t <= B.project_life_years; t++) {
      const decay = t <= 3 ? 1.0 : Math.pow(0.92, t - 3);
      n += (net_annual * decay) / Math.pow(1 + rate, t);
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
        afrr_up_avg:   mAfrr   ?? liveLT.afrr_up_avg,
        mfrr_up_avg:   mMfrr   ?? liveLT.mfrr_up_avg,
        spread_eur_mwh: mSpread ?? liveLT.spread_eur_mwh,
        euribor_3m:    liveLT.euribor_3m,
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
