# Baltic Reserve Product Definitions
# Locked before any per-product math is built.

| Product | Direction | Procurement | Symmetry | Time granularity | Local/Regional | Source type |
|---------|-----------|-------------|----------|-----------------|----------------|------------|
| FCR | symmetric | BBCM co-optimized | symmetric (up=down) | hourly blocks | regional (Baltic LFC) | forecast (TSO dimensioning) |
| aFRR | up | BBCM co-optimized | asymmetric | 4h blocks | regional + cross-zonal | forecast + partial observed |
| aFRR | down | BBCM co-optimized | asymmetric | 4h blocks | regional + cross-zonal | forecast + partial observed |
| mFRR | up | BBCM co-optimized | asymmetric | 4h blocks | regional + cross-zonal | forecast + partial observed |
| mFRR | down | BBCM co-optimized | asymmetric | 4h blocks | regional + cross-zonal | forecast only |

## Dimensioning estimates (from TSO forecasts)
- FCR: ~28 MW (2026) rising to ~48 MW (2035) — small pool, saturates quickly locally
- aFRR up: max ~120 MW per 4h cycle (Baltic total, "not expected to change significantly" 2026-2035)
- aFRR down: max ~115 MW per 4h cycle
- mFRR up: ~604 MW (2026) → ~754 MW (2035) — largest volume, primary revenue driver
- mFRR down: ~691 MW (2026) → ~991 MW (2035) — growing with renewable build-out

## Key procurement features affecting price formation
- Uniform-price clearing (pay-as-clear) per product/area/MTU
- Co-optimized clearing with substitution across FRR products
- Cross-zonal capacity valuation with markups (CZC allocated between DA and reserves)
- DRR and backup resources integrated at zero/near-zero pricing (TSO derogation)
- Infeasibility handling (step changes in price behavior at scarcity boundary)

## Revenue relevance for 50MW reference asset
- FCR: limited by small Baltic requirement + DRR suppression. Pan-European FCR Cooperation sets marginal price.
- aFRR: highest per-MW capacity value but limited by 4h block structure + activation SoC management.
- mFRR: largest volume opportunity — primary revenue allocation for Baltic BESS.
- Activation energy: revenue depends on imbalance settlement + activation frequency (not observed in Baltics).
- Arbitrage: secondary but growing with 15-min MTU + intraday liquidity.

## What we observe vs what we assume
| Component | Observed | Assumed |
|-----------|----------|---------|
| Procurement volumes | partially (BTD) | product split within total |
| Clearing prices | NO — proxy only | derived from BTD + CPI |
| Activation frequency | NO | 18% aFRR, 10% mFRR (EU comparator) |
| Activation prices | NO | margin assumptions |
| CZC allocation to reserves | NO | assumed uncongested LV-LT |
| DRR volumes | partially (TSO reports) | exit timing |

## Sources
- Baltic BBCM optimization documentation (Litgrid-hosted)
- TSO published dimensioning forecasts (FCR/FRR long-term, 2026-2035)
- Baltic LFC block operational agreement
- BBCM evaluation report (Feb 2025 go-live assessment)
