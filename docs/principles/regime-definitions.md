# Baltic Market Regime Definitions
# First-class objects, not commentary. Each regime has triggers and thresholds.

| Regime | Trigger variables | Threshold logic | Confidence | Source type |
|--------|-------------------|-----------------|------------|------------|
| RESERVE_SCARCITY | net_ssr (S/D ratio) | < 0.7 | derived from fleet + requirement | fleet data + TSO forecast |
| RESERVE_COMPRESSING | net_ssr (S/D ratio) | 0.7 – 1.2 | derived from fleet + requirement | fleet data + TSO forecast |
| RESERVE_SATURATED | net_ssr (S/D ratio) | > 1.2 | derived from fleet + requirement | fleet data + TSO forecast |
| INTERCONNECTOR_STRESS | nordbalt_utilization, litpol_utilization, estlink_utilization | > 85% sustained utilization OR planned outage | observed (ENTSO-E A11) | ENTSO-E transparency |
| SOLAR_TROUGH | solar_gen_mw, da_price_lt | solar > 500MW AND da_price < €0 | observed (ENTSO-E + energy-charts) | ENTSO-E + energy-charts |
| WIND_RAMP | wind_gen_mw, net_load_ramp | wind > 1200MW AND ramp > threshold | observed (ENTSO-E) | ENTSO-E transparency |
| DRR_DOMINANT | drr_share_fcr, drr_share_afrr | > 80% of FCR met by DRR at zero price | derived (BTD + TSO reports) | TSO documentation |
| RULE_CHANGE | market_design_event_flag | binary trigger on BBCM/PICASSO/MARI rule change | editorial (event log) | TSO announcements |
| HIGH_GAS_MARGIN | ttf_eur_mwh | > €50/MWh | observed (energy-charts) | energy-charts.info |
| NEGATIVE_PRICE_REGIME | negative_hours_share | > 5% of hours with DA < €0 in rolling 7d | derived from DA prices | ENTSO-E A44 |

## Regime object structure
Each regime is stored as a first-class object:
```json
{
  "id": "RESERVE_COMPRESSING",
  "active": true,
  "triggered_at": "2026-03-28T12:00:00Z",
  "confidence": "derived",
  "trigger_values": { "net_ssr": 0.87, "phase": "COMPRESS" },
  "inference_distance": 3,
  "data_class": "DERIVED"
}
```

## Implementation
- Worker stores current regime array in KV key `regime_state`
- Computed on each cron run from current signal data
- Multiple regimes can be active simultaneously (e.g., RESERVE_COMPRESSING + DRR_DOMINANT)
- UI shows primary regime badge on Market Now section
- Change in regime generates an intel feed item automatically
- Regime history stored with timestamps for trend analysis

## Decision mapping
Each regime maps to investor-relevant implications:

| Regime | Implication | Revenue direction | COD urgency |
|--------|-------------|------------------|-------------|
| RESERVE_SCARCITY | Capacity rents are high, entry window open | ↑↑ | low (time is available) |
| RESERVE_COMPRESSING | Rents declining, COD timing becomes critical | ↑ → ↓ | HIGH |
| RESERVE_SATURATED | Capacity rents compressed, arbitrage-dependent | ↓ | very high (may miss window) |
| INTERCONNECTOR_STRESS | Arbitrage opportunity elevated, spreads widen | ↑ (arb) | medium |
| DRR_DOMINANT | Merchant FCR revenue suppressed until derogation expires | ↓ (FCR) | medium |
| HIGH_GAS_MARGIN | Thermal floor supports high prices → better arbitrage | ↑ (arb) | low |
| RULE_CHANGE | Model assumptions may be invalidated | ? | review needed |

## Transition rules
- Regime transitions require sustained signal, not single-point spikes
- For SSR-based regimes: 7-day rolling average of net_ssr, not spot
- For interconnector stress: sustained > 85% for > 4 hours or planned outage notice
- For rule changes: triggered by TSO/NRA announcement, not speculation
