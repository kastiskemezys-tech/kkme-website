// Clean Horizon S1 2025 Lithuania — BESS benchmarks
// All figures sourced from CH report unless noted

import { RTE_BOL } from './sohCurves';

export const BENCHMARKS = {
  bess: {
    // CAPEX (Q1 2026 market pricing, Eastern Europe/Lithuania, 50 MW reference)
    // Component breakdown:
    //   Equipment (AC system, CATL/BYD, delivered EU): €83/kWh (Ember Oct 2025, BNEF 2025)
    //   EPC + civil (Lithuania, lower than W. Europe): €28/kWh
    //   HV substation + transformer + grid connection: €35k/MW (fixed per MW of power)
    //   Total formula: (equipment + epc) × duration_mwh_per_mw × 1000 + hv_grid_fixed
    //   2h: (83+28)×2000 + 35000 = €257k/MW
    //   4h: (83+28)×4000 + 35000 = €479k/MW
    // CH S1 2025 used €525k/MW (2h) — equipment costs fell ~40-50% through 2024-2025
    capex_per_mw: {
      h2: 257,   // €257k/MW (50MW/100MWh) ← PRIMARY
      h4: 479,   // €479k/MW (50MW/200MWh)
    },

    // Component costs for transparency
    equipment_eur_per_kwh:    83,    // AC system, tier-1 (CATL/BYD)
    epc_civil_eur_per_kwh:    28,    // EPC + civil, Lithuania
    hv_grid_fixed_eur_per_mw: 35000, // fixed per MW of installed power

    // OPEX: 2.5% CAPEX/year + 8% revenues (aggregator)
    // Source: CH report p.104
    opex_pct_capex: 0.025,
    aggregator_pct_revenue: 0.08,

    // Technical
    availability: 0.97,
    roundtrip_efficiency: RTE_BOL.h2, // canonical RTE_BOL (duration-agnostic constant → h2)
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
        capex_per_mw: 257,
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
