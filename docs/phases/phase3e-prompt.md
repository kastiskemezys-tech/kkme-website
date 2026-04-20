# Phase 3E — Model Risk Register & Data Confidence: Analyze, Reduce, Retire

Self-contained Claude Code prompt. YOLO mode. Expected duration: 30–45 minutes.

**Decision:** User decided to analyze each risk, reduce where justified by recent work, then retire both sections entirely from the homepage. The content gets archived in docs/ for reference, not deleted from the repo.

**Why retire:** The Model Risk Register currently shows 4× HIGH/HIGH and 3× MED/MED-HIGH. To an investor this reads as "nothing is under control." The Data Confidence panel duplicates information (dots + chips say the same thing). Both sections were honest trust signals when the site was early-stage, but now they signal weakness rather than institutional rigor. The intel feed, revenue engine, and dispatch card already demonstrate analytical depth — the risk register undercuts that by listing unresolved limitations in table form.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. Read `docs/phases/visual-audit-2026-04-16.md` (V-01 is this task)
4. `git status && git log --oneline -5` — clean, on main
5. `git checkout main && git pull origin main && git checkout -b phase-3e-risk-retirement`

Proceed — YOLO.

---

## Part 1: Risk analysis (write to docs, don't change code yet)

Create `docs/archive/model-risk-assessment-2026-04.md` with an honest analysis of each risk:

### MR-01: Reserve clearing prices not observed — proxy only
**Current rating:** HIGH impact, HIGH residual
**Assessment:** BTD now provides balancing energy prices (S2 data). Capacity reservation prices remain proxy-based (BTD doesn't publish clearing prices). Real clearing data would require direct TSO data feed or market participant disclosure. Impact: HIGH → MED (partial mitigation via BTD activation data). Residual: HIGH → MED.
**What would fully resolve:** Direct observation of aFRR/mFRR clearing prices from BTD or Litgrid auction results.

### MR-02: Pipeline timing uses static weights, not hazard model
**Current rating:** HIGH impact, HIGH residual
**Assessment:** S4 fleet data now tracks installed vs. reserved vs. protocol capacity with real Litgrid data. Pipeline timing still uses fixed COD assumptions, not a probabilistic hazard model. The S/D ratio in the revenue engine already discounts pipeline delivery. Impact stays HIGH (timing drives S/D which drives revenue). Residual: still HIGH — would need a proper survival/hazard model.
**What would fully resolve:** Project-level tracking with delay probability curves.

### MR-03: Dispatch stacking uses fixed factor, not LP optimizer
**Current rating:** HIGH impact, HIGH residual
**Assessment:** TradingEngineCard now shows actual dispatch allocation with capacity/activation/arbitrage splits. The stacking factor is still fixed (not LP-optimized), but the revenue engine v7 uses observed market prices rather than modeled optimal dispatch. Impact: HIGH → MED (observed prices reduce the importance of optimal stacking). Residual: MED.
**What would fully resolve:** LP optimizer for dispatch with real-time market data input.

### MR-04: Activation revenue assumed — no Baltic observed data
**Current rating:** HIGH impact, HIGH residual
**Assessment:** S2 now pulls 6 months of BTD activation data. Activation rates, volumes, and energy prices are observed, not assumed. This risk is substantially mitigated. Impact: HIGH → LOW. Residual: LOW.
**What would fully resolve:** Already largely resolved. Extending observation window past 12 months would further reduce.

### MR-05: DRR/TSO derogation exit timing unknown (~2028)
**Current rating:** MED impact, MED residual
**Assessment:** Structural uncertainty — no new information. Baltic TSOs still under derogation from EU balancing platforms. Exit timing affects market design and revenue structure. This is a genuine unknown. Stays MED/MED.
**What would fully resolve:** Official TSO or ACER announcement of derogation exit timeline.

### MR-06: BBCM/PICASSO/MARI design changes not modeled
**Current rating:** MED impact, HIGH residual
**Assessment:** EU balancing platform integration (PICASSO for aFRR, MARI for mFRR) will fundamentally reshape Baltic balancing markets. No model in the world captures this well because the design isn't finalized. Stays MED/HIGH — genuine structural uncertainty.
**What would fully resolve:** Final PICASSO/MARI implementation rules for Baltic region.

### MR-07: LV/EE grid data missing — LT only from VERT.lt
**Current rating:** MED impact, MED residual
**Assessment:** Still true — LT data coverage is strong (VERT, Litgrid), LV/EE coverage gaps remain. The intel feed now includes multi-country sources (AST, Elering, APVA). Pipeline data improved via Phase 4B curation merge. Impact stays MED. Residual: MED → LOW-MED (improved but not resolved).
**What would fully resolve:** Systematic LV (SPRK) and EE (Elering) data ingestion pipelines.

### Summary assessment

| Risk | Before | After | Change |
|------|--------|-------|--------|
| MR-01 | HIGH/HIGH | MED/MED | Partial BTD mitigation |
| MR-02 | HIGH/HIGH | HIGH/HIGH | No change |
| MR-03 | HIGH/HIGH | MED/MED | Revenue engine uses observed prices |
| MR-04 | HIGH/HIGH | LOW/LOW | BTD activation data now observed |
| MR-05 | MED/MED | MED/MED | No change (structural) |
| MR-06 | MED/HIGH | MED/HIGH | No change (structural) |
| MR-07 | MED/MED | MED/LOW-MED | Intel pipeline improved coverage |

**Conclusion:** 3 of 7 risks materially reduced. 2 remain structural unknowns (derogation timing, EU platform design) that no model can resolve. The register was honest but is now stale — the residual ratings don't reflect the BTD integration, revenue engine v7, or intel pipeline improvements shipped in the last month.

**Decision: retire from the homepage.** The analysis document in `docs/archive/` preserves the thinking for anyone who asks "did you consider model risk?"

---

## Part 2: Archive the content

1. Create `docs/archive/model-risk-assessment-2026-04.md` with the full analysis above (Part 1 content).
2. Create `docs/archive/data-confidence-assessment-2026-04.md` with the current ConfidencePanel data + an honest note per row about current state.

---

## Part 3: Remove from page.tsx

1. **Remove the Model Risk Register section** — page.tsx lines ~144–207 (the `id="model-risks"` div with the inline MR-XX grid).
2. **Remove the Data Confidence section** — page.tsx lines ~209–212 (the `<ConfidencePanel />` import and render).
3. **Remove the ConfidencePanel dynamic import** — page.tsx line 17.
4. **Do NOT delete ConfidencePanel.tsx** — it's archived code, not dead code. Leave it in the repo. Add a comment at the top: `// Retired from homepage 2026-04-16. Analysis: docs/archive/data-confidence-assessment-2026-04.md`
5. **Update StickyNav** if it has links to `#model-risks` — remove or rename.
6. **Update keyboard shortcuts** in the footer if any point to model risks.

---

## Part 4: Verify

- `npx tsc --noEmit` clean
- `npm run build` clean
- `npm run dev` → scroll the page: Model Risk and Data Confidence sections gone, no layout jump/gap where they were, contact section sits cleanly after Intel Feed
- Page height should decrease by ~1400px (Intel→Model Risk gap was 1469px)
- No broken anchor links (check StickyNav, footer, any `#model-risks` or `#confidence` references)

---

## Commit + push

Single commit: `phase3e: retire model risk register and data confidence — analysis archived`

Branch: `phase-3e-risk-retirement`
Push. Report compare URL. Don't run `gh pr create`.

---

## What NOT to do

- Don't delete ConfidencePanel.tsx or the risk data — archive, don't destroy
- Don't add any new sections to replace them — the page gets shorter, that's the point
- Don't touch any other section's styling or content
- Don't change the Revenue Engine's model disclaimer ("Outputs are directional intelligence, not investment advice") — that stays; it's a different concern than the risk register

---

## Reference

- Visual audit: `docs/phases/visual-audit-2026-04-16.md` (V-01)
- Model risk in page.tsx: lines ~144–207
- ConfidencePanel: `app/components/ConfidencePanel.tsx`
- StickyNav: `app/components/StickyNav.tsx`
