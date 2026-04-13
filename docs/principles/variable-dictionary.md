# KKME Variable Dictionary
# Every variable on the site. One row per metric.
# Model version: v5 · Last updated: 2026-03-28

| Variable | Description | Units | Formula / Source | Data class | Cadence | Confidence | Inf. dist | Gate | Public |
|----------|-------------|-------|-----------------|------------|---------|------------|-----------|------|--------|
| lt_da_avg | Lithuania day-ahead average price | €/MWh | ENTSO-E A44 LT hourly mean | OBSERVED | 4h | A | 1 | OK | yes |
| se4_da_avg | Sweden SE4 day-ahead average price | €/MWh | ENTSO-E A44 SE4 hourly mean | OBSERVED | 4h | A | 1 | OK | yes |
| pl_da_avg | Poland day-ahead average price | €/MWh | ENTSO-E A44 PL hourly mean | OBSERVED | 4h | A | 1 | OK | yes |
| spread_lt_se4 | LT minus SE4 DA spread | €/MWh | lt_da_avg - se4_da_avg | DERIVED | 4h | A | 2 | OK | yes |
| bess_net_capture | Theoretical BESS arbitrage capture | €/MWh | (P_high - P_low/RTE) × cycles × drag | DERIVED | 4h | B | 2 | OK | yes |
| p_high_avg | Average high-price hours | €/MWh | top-quartile hourly DA mean | DERIVED | 4h | A | 2 | OK | yes |
| p_low_avg | Average low-price hours | €/MWh | bottom-quartile hourly DA mean | DERIVED | 4h | A | 2 | OK | yes |
| net_ssr_afrr_up | Net SSR for aFRR upward | × | eff_supply_afrr_up / net_req_afrr_up | DERIVED | on update | C | 3 | WARN | yes (with caveat) |
| sd_ratio | Supply/demand ratio (legacy name) | × | weighted_supply / eff_demand | DERIVED | on update | C | 3 | WARN | yes (with caveat) |
| phase | Market phase classification | enum | from net_ssr thresholds | DERIVED | on update | C | 3 | WARN | yes |
| cpi | Capacity price index | multiplier | piecewise(sd_ratio) | MODELED | on update | D | 4 | INTERNAL | no (detail only) |
| afrr_price_est | aFRR capacity price estimate | €/MW/h | BTD procurement × CPI proxy | PROXY | daily | D | 4 | INTERNAL | no (detail only) |
| mfrr_price_est | mFRR capacity price estimate | €/MW/h | BTD procurement × CPI proxy | PROXY | daily | D | 4 | INTERNAL | no (detail only) |
| fcr_price_est | FCR capacity price estimate | €/MW/h | DRR covers 100% → effectively 0 | PROXY | daily | D | 3 | INTERNAL | no |
| ttf_eur_mwh | TTF gas front-month price | €/MWh | energy-charts.info | OBSERVED | 4h | A | 1 | OK | yes |
| ets_eur_t | EU ETS carbon price | €/t | energy-charts.info | OBSERVED | 4h | A | 1 | OK | yes |
| euribor_3m | Euribor 3-month nominal | % | ECB SDW | OBSERVED | daily | A | 1 | OK | yes |
| grid_free_mw | Available grid capacity (LT) | MW | VERT.lt ArcGIS | OBSERVED | 4h | B | 1 | OK | yes |
| project_irr | Modeled project IRR | % | 20yr DCF from revenue model | MODELED | on update | D | 5 | INTERNAL | no (scenario screen only) |
| equity_irr | Modeled equity IRR | % | 20yr DCF levered | MODELED | on update | D | 5 | INTERNAL | no (scenario screen only) |
| dscr_min | Minimum debt service coverage ratio | × | min annual EBITDA / debt service | MODELED | on update | D | 5 | INTERNAL | no (scenario screen only) |
| dispatch_daily | Daily dispatch revenue per MW | €/MW/day | hierarchy dispatch model | DERIVED | daily | C | 3 | WARN | yes (with caveat) |
| regime_state | Current market regime | enum | threshold logic on signals | DERIVED | 4h | C | 2 | WARN | yes |
| ch_benchmark_irr | Clean Horizon S1 2025 benchmark | % | CH report static reference | REFERENCE | semi-annual | B | 1 | OK | yes |
| baltic_operational_mw | Operational flexibility MW (Baltic) | MW | fleet sum (status=operational) | DERIVED | on update | B | 2 | OK | yes |
| baltic_weighted_mw | Probability-weighted pipeline MW | MW | Σ(MW × status_weight) | DERIVED | on update | C | 3 | WARN | yes (with caveat) |
| eff_demand_mw | Effective Baltic reserve demand | MW | TSO forecast × stacking factor | DERIVED | annual | C | 2 | WARN | yes (with caveat) |

## Data classes
- OBSERVED: directly from primary source, no transformation
- DERIVED: computed from observed data using documented formula
- PROXY: estimated from indirect sources, significant uncertainty
- MODELED: output of KKME model engine
- REFERENCE: external benchmark, not KKME data or model
- EDITORIAL: analyst judgment (intel feed only)

## Confidence grades
- A: strong observed basis, high coverage
- B: observed + mild derivation, good coverage
- C: mixed observed/inferred, moderate coverage
- D: mostly modeled/proxy, limited coverage
- E: judgment-heavy, experimental

## Inference distance
- 1: raw source value, no transformation
- 2: one deterministic transformation (e.g., spread = A - B)
- 3: model chain with 1-2 assumptions
- 4: deep model chain (3+ assumptions)
- 5: full model output (DCF, scenario engine)

## Publication gates
- OK: public hero metric
- WARN: public with DataClassBadge + caveat
- INTERNAL: detail/drawer only, never hero
