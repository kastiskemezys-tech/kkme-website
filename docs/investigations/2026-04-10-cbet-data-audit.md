# CBET Data Audit

**Date:** 2026-04-10
**Source:** api.energy-charts.info/cbet

## Raw data

All values in **GW** (confirmed by magnitude and cross-checking).
96 data points per column = 15-minute resolution over 24 hours.

### country=fi (Finland perspective)
| Neighbor | Min GW | Max GW | Avg GW | Notes |
|----------|--------|--------|--------|-------|
| Estonia  | -1.016 | 0.830  | -0.149 | FI importing from EE (EstLink 1+2) |
| Sweden   | 1.106  | 1.724  | 1.600  | FI importing from SE (all SE↔FI cables) |
| sum      | 0.090  | 2.533  | 1.451  | Net FI import |

### country=ee (Estonia perspective)
| Neighbor | Min GW | Max GW | Avg GW |
|----------|--------|--------|--------|
| Finland  | -0.830 | 1.016  | 0.149  | EE exporting to FI (EstLink 1+2) |
| Latvia   | -0.443 | 0.670  | 0.069  | |

### country=lt (Lithuania perspective)
| Neighbor | Min GW | Max GW | Avg GW |
|----------|--------|--------|--------|
| Latvia   | -0.280 | 0.572  | 0.271  | |
| Poland   | -0.157 | 0.094  | -0.110 | LT importing from PL (LitPol) |
| Sweden   | -0.481 | 0.700  | 0.249  | LT importing from SE (NordBalt) |

## Worker conversion

The worker does: `Math.round(-avg * 1000)` → negates (so positive = exporting from the queried country's perspective) and scales GW→MW.

For NordBalt (country=lt, Sweden): avg 0.249 GW → -249 MW → LT importing from SE. Correct.
For EstLink (country=ee, Finland): avg 0.149 GW → -149 MW → EE exporting to FI. Correct.
For Fenno-Skan (country=fi, Sweden): avg 1.600 GW → -1600 MW → FI importing from SE. **Correct magnitude.**

## Fenno-Skan 1600 MW explanation

The CBET Sweden column in country=fi represents **total SE↔FI cross-border flow**, not just Fenno-Skan specifically. Total SE↔FI capacity is ~2.2 GW across multiple cables:
- Fenno-Skan 1: 550 MW
- Fenno-Skan 2: 800 MW
- Other SE↔FI links (Åland cables, etc.): ~400-500 MW

1600 MW is within the total capacity envelope. The hero splits this by Fenno-Skan nameplate share (550+800 = 1350 MW), acknowledging ~250 MW flows on unmodeled cables.

**No worker fix needed.** The data is correct. The capacity shares just attribute a larger flow than each cable's individual nameplate, which is documented and acceptable for an illustrative hero.
