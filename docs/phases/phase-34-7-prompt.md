# Phase 34.7 — Branded deliverable (HTML → PDF) + final QC + packaging

**Branch:** continue on `phase-34-batch-3`.
**Estimate:** ~1 day. **Risk class: LOW — worker READ-ONLY, tools only.**

## Scope

### 1. Deliverable HTML from the approved template
Template: `tools/consultancy/templates/prosperus-deliverable-template.html` (client-approved Baltic-birch design — already in the repo; Cowork copied it 2026-07-28).

Build `tools/consultancy/generate-deliverable.mjs` → reads runner outputs + `deliverable-notes.json` → emits `tools/consultancy/output/Prosperus_BESS_Model_v0.5.html` with every placeholder number replaced by the real computed value. Mechanism: anchored replacement (the scenario-overlay lesson — exact anchors that throw if not matched exactly once beats fuzzy templating). If the template's structure fights anchored replacement in places, surgical DOM-aware substitution is fine; hand-editing numbers is NOT (regeneration must be repeatable).

**Content updates while injecting (all from deliverable-notes.json + batch results):**
- Mockup banner → replaced with a delivery banner: "v0.5 deliverable · computed by KKME engine v7.3 · generated <date> · figures reproducible via the accompanying model"
- All headline numbers → batch-1/2 computed values (NPV €43.3M, MOIC 3.73, the scenario table, sensitivity ranking incl. the zeros)
- "39 rows" → 44, everywhere
- Model-risk section gains the 4 notes: dead-drivers, upside-WARN, partial-year fee remainder, unsmoothed CAPEX
- NPV labels → the pre-tax wording
- Extended-scope greyed sections + pricing divider STAY (that's the v1.0 upsell, deliberate)
- Reconciliation section → real 73/73 + 59/60 results

**Consistency gate:** a verify script greps the emitted HTML for every headline number and asserts equality with the runner JSONs (same round-trip idea as the Excel test). The HTML, the Excel, and the engine must be incapable of disagreeing.

### 2. PDF
Print-CSS already exists in the template (collapses `details` drills, `print-color-adjust: exact`, page-break at scope divider). Generate PDF via headless chromium (`npx playwright pdf` or puppeteer — playwright is already a devDep). Target: A4, backgrounds on. Two outputs:
- `Prosperus_BESS_Model_v0.5_Summary.pdf` (the deliverable HTML, ~8-10 pp)
- `Prosperus_BESS_Methodology_Annex.pdf` — 4pp from `docs/methodology.md` rendered through a minimal same-brand HTML wrapper (birch/tobacco/amber, Fraunces + JetBrains Mono; reuse the template's `:root` block)

### 3. Final QC + packaging
1. Regenerate everything in order: runners → reconciliation → xlsx → HTML → PDFs. One `tools/consultancy/build-all.mjs` orchestrator so future engagements are one command.
2. Reconciliation harness green (73/73, 59/60-with-known-WARN).
3. Consistency gate green (HTML == Excel == engine).
4. Package to `tools/consultancy/output/delivery/`: xlsx + 2 PDFs + a one-page `README.txt` (file inventory, how overrides work, KKME contact). Output dir stays gitignored — list the files + sizes in the handover instead.
5. `git diff main -- workers/` empty assert.

### 4. Batch wrap
Final commit `phase 34.7: branded deliverable generator + build-all orchestrator` → push → origin-SHA equality check (report SHA) → NO DEPLOY → handover covering batch-3 (library choice, template anchoring decisions, QC results, delivery file list) → PR-compare URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-34-batch-3`

**Operator then:** reviews the 4 delivery files, sends to Prosperus with the expectations note (final numbers ~10-30% below mockup placeholders — engine prices each project at its own COD year against the saturation curve; the rigor is the point).

## Out of scope
- v1.0 extended items (hourly dispatch etc.) — client conversion decision after v0.5 lands
- B-031…B-033 worker-side candidates from batch-2 — operator picks post-delivery
- Any public-site change
