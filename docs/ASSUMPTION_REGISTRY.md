# KKME Assumption Registry
# Every hardcoded value in the model. Auditable.

| ID | Variable | Value | Rationale | Evidence | Review date | Override rules |
|----|----------|-------|-----------|----------|------------|---------------|
| A-01 | MW allocation FCR | 8 MW (16%) | Product window fit for 50MW/2.4H asset | BBCM product rules | quarterly | TSO dimensioning change |
| A-02 | MW allocation aFRR | 17 MW (34%) | Largest feasible aFRR commitment | BTD procurement volumes | quarterly | clearing data availability |
| A-03 | MW allocation mFRR | 25 MW (50%) | Remainder after FCR+aFRR | capacity balance | quarterly | new product introduction |
| A-04 | aFRR activation rate | 18% | Assumed from EU comparators (Belgium, Germany) | no Baltic observed data | monthly | Baltic activation data available |
| A-05 | mFRR activation rate | 10% | Assumed from EU comparators | no Baltic observed data | monthly | Baltic activation data available |
| A-06 | aFRR activation depth | 0.55 | Proportion of committed MW activated per event | assumption — no Baltic data | monthly | observed data |
| A-07 | mFRR activation depth | 0.75 | Proportion of committed MW activated per event | assumption — no Baltic data | monthly | observed data |
| A-08 | aFRR activation margin | €40/MWh | Spread between activation price and replacement cost | assumption | monthly | observed data |
| A-09 | mFRR activation margin | €55/MWh | Spread between activation price and replacement cost | assumption | monthly | observed data |
| A-10 | RTE | 0.875 | Typical LFP round-trip efficiency | manufacturer specs (CATL, BYD, EVE) | annual | degradation model |
| A-11 | Degradation | 2.5%/yr | Standard LFP assumption | industry consensus | annual | operational data |
| A-12 | OPEX Y1 | €39k/MW/yr (€1,950,000 total) | 50MW reference asset | CH benchmark + Baltic quotes | annual | project-specific |
| A-13 | OPEX escalation | 2.5%/yr | Inflation tracking | ECB HICP target | annual | observed HICP |
| A-14 | Optimiser fee | 10% of gross revenue | Standard BSP/aggregator fee | market practice | annual | contract negotiation |
| A-15 | BRP cost | €180,000/yr | Balance responsible party costs | market practice | annual | regulation change |
| A-16 | Debt ratio | 55% | Project finance standard | Baltic precedents limited | annual | market conditions |
| A-17 | Interest rate | 4.5% | Euribor 3M + ~250bps spread | live Euribor + assumed spread | quarterly | Euribor update |
| A-18 | Debt tenor | 8 years | Project finance standard for BESS | lender discussions | annual | market conditions |
| A-19 | Grace period | 1 year | Construction + ramp-up period | standard practice | annual | project-specific |
| A-20 | CIT rate | 17% | Lithuanian corporate income tax from Jan 2026 | legislation (confirmed) | on change | legislative change |
| A-21 | WACC | 8% | Blended cost of capital | industry benchmarks | annual | market conditions |
| A-22 | Demand (effective) | 1,190 MW | 1700 MW total × 0.70 multi-product stacking | Elering Oct 2025 forecast | annual | TSO update |
| A-23 | Demand growth | 55 MW/yr | TSO dimensioning trajectory (FRR growth 2026-2035) | TSO forecasts | annual | TSO update |
| A-24 | Capacity prices: FCR | €45/MW/h | Baltic-calibrated proxy (~2× Finland) | AST Latvia Sept 2025 | quarterly | BTD clearing data |
| A-25 | Capacity prices: aFRR | €40/MW/h | Baltic-calibrated proxy (~10× Finland) | AST Latvia Sept 2025 | quarterly | BTD clearing data |
| A-26 | Capacity prices: mFRR | €22/MW/h | Baltic-calibrated proxy (~4× Finland) | AST Latvia Sept 2025 | quarterly | BTD clearing data |
| A-27 | Arbitrage P_high | €120/MWh | Top-quartile DA average | ENTSO-E A44 observed | quarterly | observed data update |
| A-28 | Arbitrage P_low | €55/MWh | Bottom-quartile DA average | ENTSO-E A44 observed | quarterly | observed data update |
| A-29 | Arbitrage cycles/day | 0.9 | Conservative cycle budget | degradation budget + market opportunity | quarterly | operational data |
| A-30 | Arbitrage days/yr | 300 | Excludes maintenance + low-spread days | assumption | annual | operational data |
| A-31 | Reserve drag on arb | 0.60 | SoC unavailable due to reserve commitments | assumption — no LP model | quarterly | LP optimizer built |
| A-32 | CAPEX: competitive | €120/kWh | Achievable with Chinese EPC + equipment | market intelligence | quarterly | tender results |
| A-33 | CAPEX: CH S1 2025 | €164/kWh | Clean Horizon semi-annual benchmark | CH report | semi-annual | new CH report |
| A-34 | CAPEX: turnkey EPC | €262/kWh | European EPC with full BOS | European tender evidence | quarterly | tender results |
| A-35 | Augmentation | €25/kWh at year 10 | Battery replacement cost forecast | industry trajectory | annual | technology change |
| A-36 | Depreciation | 10yr straight-line on gross CAPEX excl bond | Lithuanian accounting standards | legislation | on change | legislative change |
| A-37 | Status weight: operational | 1.00 | Confirmed generating / grid-synced | direct observation | static | hazard model replaces |
| A-38 | Status weight: commissioned | 1.00 | Grid-synced, entering service | direct observation | static | hazard model replaces |
| A-39 | Status weight: under_construction | 0.90 | Building, high certainty | industry completion rates | static | hazard model replaces |
| A-40 | Status weight: connection_agreement | 0.60 | TSO agreement signed, deposit posted | partial evidence | static | hazard model replaces |
| A-41 | Status weight: application | 0.30 | In queue, no hard commitment | weak evidence | static | hazard model replaces |
| A-42 | Status weight: announced | 0.10 | Press only, no hard evidence | very weak evidence | static | hazard model replaces |
| A-43 | S/D threshold: SCARCITY | < 0.6 | Insufficient credible supply | KKME regime definition | quarterly | regime model update |
| A-44 | S/D threshold: COMPRESS | 0.6 – 1.0 | Supply approaching demand | KKME regime definition | quarterly | regime model update |
| A-45 | S/D threshold: MATURE | > 1.0 | Supply meets or exceeds demand | KKME regime definition | quarterly | regime model update |
| A-46 | CPI floor | 0.40 | Baltic structural reserve need ensures non-zero clearing | assumption | quarterly | observed data |
| A-47 | Stacking realisation | 65–80% of theoretical max | Multi-product exclusivity, SoC conflicts, activation drag | industry benchmarks | annual | LP optimizer built |
