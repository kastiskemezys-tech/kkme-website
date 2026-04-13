# Pipeline Evidence Contradiction Rules
# Flag projects where evidence conflicts.

## Contradiction triggers

| ID | Condition | Severity | Action |
|----|-----------|----------|--------|
| C-01 | Status = operational BUT no construction/energisation evidence in source | HIGH | quarantine, require manual review |
| C-02 | EPC/OEM award BUT no grid agreement or deposit evidence | MEDIUM | flag, reduce confidence |
| C-03 | COD estimate pushed back > 2 times | MEDIUM | reduce probability, add slippage note |
| C-04 | Stage changed backward (e.g. construction → application) | HIGH | quarantine, investigate |
| C-05 | Multiple sources disagree on MW by > 20% | MEDIUM | flag, use conservative value |
| C-06 | Multiple sources disagree on MWh by > 20% | MEDIUM | flag, check MW/MWh swap |
| C-07 | MW/MWh ratio outside 0.5-12h range | HIGH | quarantine, likely data error |
| C-08 | Project "live" in PR but absent from TSO queue | MEDIUM | flag, reduce confidence |
| C-09 | Last hard evidence > 12 months old | MEDIUM | apply freshness decay to status weight |
| C-10 | Financing claimed but no lender identified | LOW | note only |
| C-11 | MW > 500 for single Baltic BESS project | MEDIUM | flag, unusually large for region |
| C-12 | COD before permit date | HIGH | quarantine, data error likely |

## Evidence hierarchy (hard > soft)

### Hard evidence (high weight)
- TSO grid agreement (signed, with deposit/security posted)
- Regulator permit issued (VERT, SPRK, ECAG)
- EPC contract signed (named contractor + scope)
- Financing close (named lender + terms)
- Construction photo / satellite evidence
- Energisation / grid synchronisation notice
- BSP prequalification / balancing market participation

### Soft evidence (low weight)
- Press release (developer-issued)
- Website update (developer's own site)
- Conference mention / presentation slide
- Management quote in media
- Industry media coverage without primary source citation
- "Sources familiar with the matter" reporting

## Implementation
- Check contradictions in processFleet() or fleet sync pipeline
- Store contradiction_score per entry (count of flags × severity weight)
- Severity weights: HIGH = 3, MEDIUM = 2, LOW = 1
- Entries with total score >= 3 get `_quarantine: true` flag
- Quarantined entries still enter fleet but are excluded from forward projections
- Morning review script lists all contradiction flags sorted by severity
- Manual resolution: Kastis reviews quarantined entries, updates source/status, clears flags

## Freshness decay
Evidence ages. Apply freshness multiplier to status weight:

| Days since last evidence | Freshness multiplier |
|--------------------------|---------------------|
| < 30 | 1.00 |
| 30-90 | 0.80 |
| 90-180 | 0.60 |
| 180-365 | 0.40 |
| > 365 | 0.20 |

Effective weight = status_weight × freshness_multiplier

## Naming discipline (per audit finding)
All pipeline variables and labels should use "net merchant" language:
- Avoid: sd_ratio, supply_demand, scarcity
- Prefer: net_ssr, net_req_mw, effective_supply_mw, drr_share
- This applies to variable names in worker, UI labels, and documentation
