# Phase 34.6 — Excel deliverable generator

**Branch:** `phase-34-batch-3` off latest main (batch mode with 34.7).
**Estimate:** ~1 day. **Risk class: LOW — worker READ-ONLY (same batch rule), pure `tools/consultancy/` + devDeps.**

## Scope

`tools/consultancy/generate-xlsx.mjs` → `tools/consultancy/output/Prosperus_BESS_Model_v0.5.xlsx`. Regenerates from the runner outputs FRESH at build time (never hand-copied numbers) — running the generator is the last step before delivery, so the Excel always matches the engine.

### Library decision (investigate first)
`exceljs` (formula + styling support) vs SheetJS CE (lighter, weaker formulas). Requirement that decides it: the scenario selector (below) needs data-validation dropdown + INDEX/MATCH formulas + basic styling (column widths, number formats, bold totals, cell fills). Verify exceljs does all four in a quick spike before committing to it. devDep only.

### 8 tabs

1. **Cover** — title, client, date, KKME contact, engine version + calibration date, scope-lock note, file inventory.
2. **Assumptions** — all 44 register rows: `id | category | label | value | unit | source | sensitivity_range | override`. `override` column unlocked for editing (sheet protection with unlocked override cells if exceljs supports it cheaply; otherwise a bold "EDITABLE" header note). Prominent note: overrides re-imported via KKME rerun — Excel formulas do NOT recompute the engine (honest mechanism, per 34.5's register design).
3. **Bridge Y1** — client's 8-line bridge, 5 columns (3 projects + portfolio + €k/MW/yr), sub-line detail (10 revenue lines with formula strings as text annotations, 4 opex lines) below the summary block. Excluded-items row (debt/interest/DSCR/tax) present + struck.
4. **20-yr CF** — per-project + portfolio, all 20 calendar years (full detail here — this is where the year-by-year lives, unlike the HTML summary), operating CF / aug+repl CAPEX / net CF rows, NPV @ 8% + MOIC footer. Y8/Y15 event cells filled amber/rust.
5. **Scenarios** — the 3 × 6 headline table + the 6-driver input table + **scenario selector**: dropdown cell (Downside/Central/Upside) driving an INDEX/MATCH headline block over the three pre-computed scenario columns. Pre-computed = honest (the engine computed them); the dropdown is a real selector over real engine output, not a live model. Label it exactly that.
6. **Sensitivity** — 8-driver table sorted by |20-yr swing|, top-3 highlighted. Include the zero-impact drivers with their zeros + the disclosure note (see below).
7. **Reconciliation** — the full `reconciliation-report.json` rendered: 73 internal + 60 external checks, value/band/status per row, the 1 WARN with its by-design note.
8. **Glossary** — EFC, RTE, BOL, SoC, CPI, sd_ratio, aFRR/mFRR/FCR, NUS, BRP, POI, MOIC, pre-financing CF. ~15 terms, one line each.

### Deliverable-text constants (decided by operator, use verbatim)
Create `tools/consultancy/deliverable-notes.json` so 34.6 (Excel) and 34.7 (PDF) share identical wording (rule #4 for prose):
- `npv_label`: "NPV @ 8% — pre-financing, pre-tax (the commissioned bridge carries no tax line)"
- `dead_drivers_note`: "Spread growth and CPI floor were tested and move no cash flow in this model — trading revenue sits on its allocation clamp and the CPI floor is a disclosure threshold. Capacity prices dominate sensitivity by an order of magnitude (€82.6M 20-yr swing). Reported as computed; no synthetic elasticity invented."
- `upside_warn_note`: "Upside IRR (Bitėnai 33.2%) clears the Clean Horizon published range (6–31%) by design — the band describes central expectations."
- `partial_year_note`: "Stoniškiai/Eigirdžiai Y1 bridge EBITDA runs 4.6–5.7% above the engine figure — exactly the flat BRP fee remainder against pro-rated part-year lines; asserted per project, never absorbed."
- `capex_note`: "Augmentation (Y8) and replacement (Y15) CAPEX are shown unsmoothed per the commissioned bridge; reserve-account smoothing is a financing structure and out of scope."
- `register_count`: 44

### Tests
Generator round-trip: parse the emitted xlsx back, assert bridge totals == runner JSON to the cent · tab count + names · assumptions row count 44 · scenario table matches scenarios output · number formats applied (spot-check).

## Commit
`phase 34.6: excel deliverable generator (8 tabs, scenario selector)` → push → origin-SHA check → continue to 34.7.
