// Clean Horizon S1 2025 Lithuania — BESS benchmarks
// All figures sourced from CH report unless noted

export const BENCHMARKS = {
  bess: {
    // CAPEX (€k per MW installed, tier-1 supplier Q1 2025 Europe, 50 MW reference size)
    // Source: CH report p.103
    capex_per_mw: {
      h1: 385,   // €385k/MW (50MW/50MWh)
      h2: 525,   // €525k/MW (50MW/100MWh) ← OPTIMAL
      h3: 665,   // €665k/MW (50MW/150MWh)
      h4: 805,   // €805k/MW (50MW/200MWh)
    },

    // OPEX: 2.5% CAPEX/year + 8% revenues (aggregator)
    // Source: CH report p.104
    opex_pct_capex: 0.025,
    aggregator_pct_revenue: 0.08,

    // Technical
    availability: 0.97,
    roundtrip_efficiency: 0.85,
    cycles_per_day: 1.5,
    project_life_years: 18,
    discount_rate: 0.10,

    // aFRR/mFRR sizing constraint:
    // 2 MW power + 4 MWh capacity → provides 1 MW symmetric
    // Source: CH report p.33, p.39
    afrr_mfrr_power_ratio: 2.0,
    afrr_mfrr_energy_ratio: 4.0,
    // FCR sizing: 1.25 MW / 1.2 MWh → 1 MW FCR
    fcr_power_ratio: 1.25,
    fcr_energy_ratio: 1.2,

    // FCR market depth (ALL THREE BALTICS combined)
    // Source: CH report p.29
    fcr_total_market_mw: 25,

    // Breakeven revenue for 8% IRR (2h system)
    // Source: CH report p.26
    breakeven_revenue_per_mw_year: 115000,

    // Clean Horizon IRR results (COD 2027, central)
    // Source: CH report p.106
    ch_irr_central: {
      h1: 6.5, h2: 16.6, h3: 14.9, h4: 10.8,
    },
    ch_irr_low: {
      h1: 1, h2: 6, h3: 9, h4: 6,
    },
    ch_irr_high: {
      h1: 9, h2: 31, h3: 27, h4: 20,
    },

    // Revenue peak years window
    // Source: CH report p.9
    revenue_peak_window: '2025–2028',
    revenue_peak_note: 'aFRR/mFRR cannibalization begins 2029',

    // EU market comparison — static reference
    // Source: public market data, ENTSO-E, industry reports
    markets: [
      {
        country: 'Lithuania', flag: '🇱🇹',
        fcr_eur_mwh: null as number | null,
        afrr_up_eur_mwh: null as number | null,
        mfrr_up_eur_mwh: null as number | null,
        da_spread_eur_mwh: null as number | null,
        capex_per_mw: 525,
        irr_central_pct: null as number | null,
        note: 'Post-sync anomaly — peak window 2025-28',
      },
      {
        country: 'Great Britain', flag: '🇬🇧',
        afrr_up_eur_mwh: 14,
        mfrr_up_eur_mwh: 10,
        da_spread_eur_mwh: 55,
        capex_per_mw: 580,
        irr_central_pct: 12,
        note: 'Mature, BM + FFR products',
      },
      {
        country: 'Ireland', flag: '🇮🇪',
        afrr_up_eur_mwh: 18,
        mfrr_up_eur_mwh: 14,
        da_spread_eur_mwh: 48,
        capex_per_mw: 560,
        irr_central_pct: 13,
        note: 'DS3 + I-SEM, strong frequency market',
      },
      {
        country: 'Italy', flag: '🇮🇹',
        afrr_up_eur_mwh: 11,
        mfrr_up_eur_mwh: 9,
        da_spread_eur_mwh: 42,
        capex_per_mw: 540,
        irr_central_pct: 10,
        note: 'MSD balancing market',
      },
      {
        country: 'Germany', flag: '🇩🇪',
        afrr_up_eur_mwh: 8,
        mfrr_up_eur_mwh: 7,
        da_spread_eur_mwh: 38,
        capex_per_mw: 530,
        irr_central_pct: 8,
        note: 'FCR saturated, aFRR compressing',
      },
      {
        country: 'Belgium', flag: '🇧🇪',
        afrr_up_eur_mwh: 7,
        mfrr_up_eur_mwh: 6,
        da_spread_eur_mwh: 35,
        capex_per_mw: 540,
        irr_central_pct: 7,
        note: 'CRM capacity market support',
      },
    ],
  },
} as const;
