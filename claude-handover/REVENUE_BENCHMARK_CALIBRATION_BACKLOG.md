# Revenue Engine — External Benchmark Calibration Backlog

## Purpose

External benchmarks for sanity-checking Revenue Engine assumptions and providing credibility context. This is NOT automatic model validation — it is a tracked set of reference points that inform whether model assumptions remain defensible.

## Benchmark Fields

| Field | Candidate source | Frequency | Unit | Role |
|-------|-----------------|-----------|------|------|
| EU annual BESS additions | BNEF, SolarPower Europe, EASE | Annual | MW | Context — fleet growth trajectory |
| Total operational BESS capacity (Baltic) | National TSOs, ENTSO-E TPR | Quarterly | MW | Model input — S/D denominator |
| Utility-scale CAPEX range | BNEF, Clean Horizon, LDES Council | Semi-annual | €/kWh | Assumption check — CAPEX scenarios |
| O&M benchmark by duration | Lazard LCOS, BloombergNEF | Annual | €/kW/yr | Assumption check — OPEX |
| Debt base rate (Euribor 3M/6M) | ECB, already in S3 | Live (ECB API) | % | Already integrated |
| Capacity market auction clears | National TSO results (AST, Elering) | Per auction | €/MW/yr | Assumption check — capacity prices |
| Duration de-rating factors | National grid codes, TSO methodology | As published | % of nameplate | Context — effective capacity vs installed |
| Public merchant return references | Clean Horizon, Modo Energy, Aurora | Annual | % IRR or €/MW/yr | External benchmark — not model input |

## Design rules

- Benchmarks inform assumption reviews, they do not auto-update model parameters
- Any benchmark that enters the model must go through explicit assumption update (worker code change)
- Benchmarks shown in UI should be clearly labelled as "external reference" with source and date
- Stale benchmarks (>12 months) should be flagged or removed rather than displayed as current

## Not in scope

- Automatic scraping pipelines
- Real-time benchmark feeds
- Model parameter auto-adjustment
- Regression testing against benchmark ranges
