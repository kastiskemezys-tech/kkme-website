// KKME — Static Floor Defaults
// Served when ALL other sources fail. Clearly labeled.
// Sourced from: CH S1 2025 + BNEF 2025 + Litgrid 2026-02.

export const DEFAULTS = {
  s1: {
    lt_avg_eur_mwh:           88.0,    // €/MWh — CH 2025 LT avg
    se4_avg_eur_mwh:          82.0,    // €/MWh
    spread_eur_mwh:            6.0,    // €/MWh — conservative
    separation_pct:            7.3,    // %
    lt_daily_swing_eur_mwh:   95.0,    // €/MWh — CH 2024 avg
    state:                   'CALM',
    rsi_30d:                   null,
    trend_vs_90d:              null,
    pct_hours_above_20:        null,
    spread_stats_90d: { p50: 52.0, p75: 118.0, p90: 149.0, days_of_data: 0 },
    _source:          'default',
    _default_reason:  'ENTSO-E fetch unavailable',
    _serving:         'static_defaults',
    updated_at:        null,
    timestamp:         null,
  },

  s2: {
    fcr_avg:                        79.0,   // €/MW/h — CH 2025 Q1
    afrr_up_avg:                    60.0,   // €/MW/h — CH 2025 Q1
    afrr_down_avg:                  56.0,   // €/MW/h
    mfrr_up_avg:                    39.0,   // €/MW/h — CH 2025 Q1
    mfrr_down_avg:                  55.0,   // €/MW/h
    imbalance_mean:                120.0,   // €/MWh
    imbalance_p90:                 180.0,   // €/MWh
    pct_up:                         50.0,   // %
    pct_down:                       50.0,   // %
    pct_above_100:                  35.0,   // %
    afrr_annual_per_mw_installed: 255000,   // €/MW/yr
    mfrr_annual_per_mw_installed: 166000,   // €/MW/yr
    cvi_afrr_eur_mw_yr:          509560,   // €/MW/yr (theoretical max)
    cvi_mfrr_eur_mw_yr:          331340,   // €/MW/yr
    stress_index_p90:              180.0,
    signal:          'EARLY',
    interpretation:  'Default values shown — live BTD data not yet available.',
    source:          'CH S1 2025 reference',
    fcr_note:        'FCR: 25MW Baltic market, saturating 2026',
    _source:         'default',
    _default_reason: 'BTD cron not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },

  s3: {
    europe_system_eur_kwh:  88.0,   // Ember Oct 2025
    china_system_eur_kwh:   68.0,   // BNEF Dec 2025
    global_avg_eur_kwh:    117.0,   // BNEF Dec 2025
    euribor_3m:              2.6,   // % nominal
    euribor_nominal_3m:      2.6,
    euribor_real_3m:        0.15,   // %
    euribor_trend:    '→ stable',
    hicp_yoy:                2.4,   // %
    ref_source:       'BNEF Dec 2025',
    signal:           'STABLE',
    interpretation:   'Default values shown — live data not yet available.',
    _source:          'default',
    _default_reason:  'Worker cron not yet run',
    _serving:         'static_defaults',
    timestamp:         null,
  },

  s4: {
    free_mw:         3107.0,   // MW — Litgrid 2026-02-25
    connected_mw:    8802.0,   // MW
    reserved_mw:     4800.0,   // MW (estimated)
    utilisation_pct:   73.9,   // %
    signal:          'OPEN',
    interpretation:  'Default values shown — live data not yet available.',
    _source:         'default',
    _default_reason: 'ArcGIS fetch not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },

  s5: {
    signal:            'OPEN',
    grid_free_mw:      3107.0,   // MW — derived from S4 default
    grid_connected_mw: 8802.0,
    pipeline_mw:       null,
    pipeline_note:     null,
    pipeline_updated:  null,
    news_items:        [],
    interpretation:    'Default values shown — live data not yet available.',
    _source:           'default',
    _default_reason:   'S5 cron not yet run',
    _serving:          'static_defaults',
    timestamp:          null,
  },

  s6: {
    fill_pct:         null,   // Norway reservoir fill % (NVE weekly)
    deviation_pp:     null,   // deviation from historical median (pp)
    median_fill_pct:  null,   // historical median for same week
    signal:          'NORMAL',
    interpretation:  'Default values — live NVE data not yet available.',
    _source:         'default',
    _default_reason: 'S6 cron not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },

  s7: {
    ttf_eur_mwh:     null,    // TTF natural gas €/MWh
    ttf_trend:       null,    // '↑ rising' | '→ stable' | '↓ falling'
    signal:          'NORMAL',
    interpretation:  'Default values — live TTF data not yet available.',
    _source:         'default',
    _default_reason: 'S7 cron not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },

  s8: {
    nordbalt_avg_mw:  null,   // NordBalt flow LT→SE4 (positive = export to SE4)
    litpol_avg_mw:    null,   // LitPol flow LT→PL
    nordbalt_signal:  null,   // 'EXPORT' | 'IMPORT' | 'BALANCED'
    litpol_signal:    null,
    signal:          'NEUTRAL',
    interpretation:  'Default values — live interconnector data not yet available.',
    _source:         'default',
    _default_reason: 'S8 cron not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },

  s9: {
    eua_eur_t:        null,   // EU ETS carbon price €/t CO2
    eua_trend:        null,   // '↑ rising' | '→ stable' | '↓ falling'
    signal:          'NORMAL',
    interpretation:  'Default values — live EUA data not yet available.',
    _source:         'default',
    _default_reason: 'S9 cron not yet run',
    _serving:        'static_defaults',
    timestamp:        null,
  },
};

// Values outside these bounds are rejected as bad data (not stored in KV).
export const SANITY_BOUNDS = {
  s1: {
    lt_avg_eur_mwh:          [-500, 1000],
    se4_avg_eur_mwh:         [-500, 1000],
    spread_eur_mwh:          [-300,  500],
    lt_daily_swing_eur_mwh:  [0,    2000],
    pl_avg_eur_mwh:          [-500, 1000],
    lt_pl_spread_eur_mwh:    [-300,  500],
  },
  s2: {
    fcr_avg:       [0, 5000],
    afrr_up_avg:   [0, 5000],
    mfrr_up_avg:   [0, 2000],
    imbalance_p90: [0, 10000],
  },
  s3: {
    europe_system_eur_kwh: [30,  500],
    euribor_nominal_3m:    [-2,   15],
    hicp_yoy:              [-5,   30],
  },
  s4: {
    free_mw:         [0, 20000],
    connected_mw:    [0, 50000],
    utilisation_pct: [0,   100],
  },
  s6: {
    fill_pct:        [0, 100],
    deviation_pp:    [-50, 50],
  },
  s7: {
    ttf_eur_mwh:     [0, 500],
  },
  s8: {
    nordbalt_avg_mw: [-1000, 1000],
    litpol_avg_mw:   [-1000, 1000],
  },
  s9: {
    eua_eur_t:       [0, 300],
  },
};

// How old is too old per signal key.
export const STALE_THRESHOLDS_HOURS = {
  s1:          36,    // DA prices: daily 06:00 UTC
  s2:          48,    // BTD: daily cron
  s3:          36,    // daily cron
  euribor:    168,    // ECB: weekly is fine
  s4:          36,    // Litgrid: daily
  s4_pipeline: 840,   // VERT.lt: monthly
  s5:           6,    // DC news: every 4h cron
  s6:         168,    // NVE: weekly data, check every 4h
  s7:          12,    // TTF: daily market data
  s8:          12,    // Cross-border flows: daily
  s9:          12,    // EU ETS: daily market data
};
