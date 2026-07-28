# Phase 34.5 — Assumptions register + reconciliation harness

**Branch:** continue on `phase-34-batch-2`.
**Estimate:** ~half day. **Risk class: LOW — same batch rule: worker READ-ONLY.**

## Scope

### 1. Assumptions register as single source of truth
`tools/consultancy/assumptions-register.json` — 39 rows. Schema per row:
```json
{ "id": "rte_bol", "category": "technical", "label": "Round-trip efficiency (BOL)",
  "value": 82, "unit": "%", "source": "NREL ATB 2025 · Tier-1 warranty envelope",
  "sensitivity_range": [79, 85], "override": null, "engine_binding": "sohCurves.RTE_BOL.h2" }
```
The 39 rows: pull the canonical values FROM the engine/configs (rule #4 — register documents the engine, never contradicts it). Categories: technical (7) · market (9) · saturation (4) · cost (7) · capex (5) · project-specific ×3 (compact refs to the config files) + scenario-driver rows (6). Where a register value has an `engine_binding`, add a **binding test**: register value == live engine constant (extends the rteMirror pattern — the register can never drift from the code).

`override` field: when non-null, the runner applies it (this is the "Prosperus-adjustable" mechanism — they edit Excel, we re-import overrides, rerun).

### 2. Reconciliation harness — permanent CI-grade asserts
`tools/consultancy/reconcile.mjs` + vitest suite. Two banks:

**Internal (7):** gross = Σ revenue lines · net = gross − charging · EBITDA = net − 4 opex lines · pre-fin CF = EBITDA − CAPEX lines · portfolio = Σ projects (every line, every year) · Σ monthly = annual where monthly exists · discharge MWh = charge MWh × RTE.

**External (6):** engine outputs vs published benchmarks, as range-asserts with the source pinned:
| Check | Band | Source |
|---|---|---|
| Reference-asset IRR | 6–31 % | Clean Horizon S1 2025 (ch_benchmark, already in engine) |
| Backtest balancing vs BTD realised | ±15 % | base_year realised months |
| Cycles/yr | 550–720 | Modo/GEM Baltic |
| CAPEX €/kWh | 150–190 | BNEF Q1-2026 |
| EBITDA margin | 45–70 % | CH band (widened for scenario runs) |
| Net rev €k/MW/yr | 120–220 | CH central ↔ NGEN reference |

Run against: reference asset + all 3 projects + all 3 scenarios (Downside may legitimately breach a band — those asserts run WARN-level for non-Central scenarios, FAIL-level for Central; document the split).

**Output:** `reconciliation-report.json` — every check, value, band, status. This becomes a deliverable artifact (feeds the Excel tab + PDF section) AND stays as a permanent test suite (platform value: every future engine PR proves it still ties out).

### 3. Tests
Binding tests (register == engine) · all internal ties on all projects/scenarios · external bands per the WARN/FAIL split · register schema validation (39 rows, no dupes, all sourced).

## Batch wrap
1. Final commit `phase 34.5: assumptions register + reconciliation harness` → push → origin-SHA equality check, report SHA explicitly.
2. NO DEPLOY (nothing to deploy — worker untouched; assert `git diff main -- workers/` is empty).
3. Handover entry: batch-2 status, scenario table (3 × 6 headline numbers), sensitivity top-3, reconciliation summary (X/Y pass), every DECISIONS.md entry, driver-mapping table from 34.4.
4. End with: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-34-batch-2`
