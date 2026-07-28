# Phase 34.2 — Cost decomposition + CAPEX schedule

**Branch:** continue on `phase-34-batch-1` (same branch as 34.1 — batch mode, sequential commits).
**Estimate:** ~1 day. Second phase of the autonomous batch (see `phase-34-arc.md`).
**Risk class:** LOW-MEDIUM in batch mode because of the hard rule below.

## HARD RULE (batch mode)

**Public `/revenue` output stays byte-identical (modulo timestamp) through this entire phase.** All new outputs (cost decomposition, CAPEX schedule) flow ONLY through the consultancy runner path (`tools/consultancy/run-project.mjs`) — either as extra fields the public route strips, or computed in runner-only wrapper code. Re-run `tools/consultancy/regression-reference.mjs` after every commit. If it fails and you can't restore identity: STOP the batch, commit what's clean, write the handover.

## Scope

### 1. Cost decomposition
Split the opex lump into 4 lines, each with basis + config override:

| Line | Default basis | Config key |
|---|---|---|
| Optimiser (BRP / trading platform) | 12 % × gross revenue | `optimiser_pct_gross` |
| Grid (Litgrid NUS + auxiliary) | 3 % × gross | `grid_pct_gross` |
| Market participation (Nord Pool + BTD) | 1 % × gross | `market_pct_gross` |
| Operating (O&M €18 + insurance €5 + warranty €4 + BOS €2) | €29 / kW / yr | `operating_eur_kw_yr` |

Reconciliation requirement: the 4 lines must sum to the engine's existing opex treatment for the REFERENCE asset within ±2% — if the engine's current `opex_y1` (€1.95M for 50 MW) diverges from 12%+3%+1%+€29/kW under current revenue, document the delta and calibrate the operating line to close it (single calibration constant, commented). The per-project path uses the 4-line derivation; the public path keeps using whatever it uses today (byte-identity rule).

### 2. CAPEX schedule (20-year, per project)
- Maintenance: €4/kW/yr every year (config `maintenance_eur_kw_yr`)
- Augmentation: year trigger Y8 (config `augmentation_year`, `augmentation_mwh_pct` = 40%, `augmentation_eur_kwh` = 80 — BNEF 2035 cell-only)
- Replacement: Y15 (config `replacement_year`, `replacement_mwh_pct` = 85%, `replacement_eur_kwh` = 120 — BNEF 2042 cell+PCS)
- Output: `capex_schedule` array (20 entries: `{yr, cal_year, maintenance, augmentation, replacement, total}`) in the runner output JSON.

### 3. Bridge assembly (the client's 8 lines)
Runner output gains a `bridge_y1` object with EXACTLY the client structure:
```
gross_market_revenues → charging_costs → net_market_revenue →
{optimiser, grid, market, operating} → project_ebitda →
{maintenance_capex, augmentation_capex, replacement_capex} → pre_financing_cf
```
Plus `bridge_20yr` (per-year array of the same shape). Tie-out asserts in code: each level = previous − deductions, exact.

### 4. Tests
- 4-line decomposition sums correctly + responds to config overrides
- CAPEX schedule: Y8/Y15 events land in right calendar years per COD; totals match `mwh × pct × eur_kwh`
- Bridge tie-outs exact for all 3 Prosperus projects + reference
- Regression: public path untouched (the byte-identity script)

## Autonomous decision rules
- Calibration deltas ≤ ±5%: proceed with documented constant. Larger: use the 4-line derivation as canonical for per-project, note prominently in handover.
- Partial-year Y1 (Stoniškiai/Eigirdžiai): CAPEX maintenance pro-rata with operational months; augmentation/replacement years count from COD year regardless.
- Anything ambiguous: pick the conservative option (higher cost, lower revenue), document, continue.

## Commit
One commit on the batch branch: `phase 34.2: cost decomposition + capex schedule + client bridge (runner path)`. Push. Origin-SHA check. NO DEPLOY (batch rule). Continue to 34.3.
