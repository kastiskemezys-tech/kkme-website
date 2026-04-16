# Model Risk Assessment — April 2026

Retired from homepage 2026-04-16. This document preserves the analysis behind the decision.

## Context

The Model Risk Register was added to the KKME homepage as a trust signal — an honest disclosure of analytical limitations. It listed 7 risks (4× HIGH/HIGH, 3× MED/MED-HIGH). After shipping BTD integration, revenue engine v7, and the intel pipeline, 3 of 7 risks are materially reduced. However, the register's presentation (a table of unresolved limitations) now signals weakness rather than institutional rigor. The intel feed, revenue engine, and dispatch card already demonstrate analytical depth — the risk register undercuts that.

**Decision:** Retire from homepage; archive analysis here.

---

## Risk-by-Risk Assessment

### MR-01: Reserve clearing prices not observed — proxy only

**Before:** HIGH impact / HIGH residual
**After:** MED impact / MED residual
**Assessment:** BTD now provides balancing energy prices (S2 data). Capacity reservation prices remain proxy-based (BTD doesn't publish clearing prices). Real clearing data would require direct TSO data feed or market participant disclosure. Impact reduced because partial mitigation via BTD activation data narrows the proxy gap.
**What would fully resolve:** Direct observation of aFRR/mFRR clearing prices from BTD or Litgrid auction results.

### MR-02: Pipeline timing uses static weights, not hazard model

**Before:** HIGH impact / HIGH residual
**After:** HIGH impact / HIGH residual — no change
**Assessment:** S4 fleet data now tracks installed vs. reserved vs. protocol capacity with real Litgrid data. Pipeline timing still uses fixed COD assumptions, not a probabilistic hazard model. The S/D ratio in the revenue engine already discounts pipeline delivery, but the core limitation remains.
**What would fully resolve:** Project-level tracking with delay probability curves (survival/hazard model).

### MR-03: Dispatch stacking uses fixed factor, not LP optimizer

**Before:** HIGH impact / HIGH residual
**After:** MED impact / MED residual
**Assessment:** TradingEngineCard now shows actual dispatch allocation with capacity/activation/arbitrage splits. The stacking factor is still fixed (not LP-optimized), but the revenue engine v7 uses observed market prices rather than modeled optimal dispatch. Using observed prices substantially reduces the importance of optimal stacking assumptions.
**What would fully resolve:** LP optimizer for dispatch with real-time market data input.

### MR-04: Activation revenue assumed — no Baltic observed data

**Before:** HIGH impact / HIGH residual
**After:** LOW impact / LOW residual
**Assessment:** S2 now pulls 6 months of BTD activation data. Activation rates, volumes, and energy prices are observed, not assumed. This risk is substantially mitigated.
**What would fully resolve:** Already largely resolved. Extending observation window past 12 months would further reduce residual uncertainty.

### MR-05: DRR/TSO derogation exit timing unknown (~2028)

**Before:** MED impact / MED residual
**After:** MED impact / MED residual — no change (structural)
**Assessment:** Structural uncertainty — no new information available. Baltic TSOs remain under derogation from EU balancing platforms. Exit timing affects market design and revenue structure. This is a genuine unknown that no model can resolve until official announcements are made.
**What would fully resolve:** Official TSO or ACER announcement of derogation exit timeline.

### MR-06: BBCM/PICASSO/MARI design changes not modeled

**Before:** MED impact / HIGH residual
**After:** MED impact / HIGH residual — no change (structural)
**Assessment:** EU balancing platform integration (PICASSO for aFRR, MARI for mFRR) will fundamentally reshape Baltic balancing markets. No model captures this well because the design isn't finalized. Genuine structural uncertainty.
**What would fully resolve:** Final PICASSO/MARI implementation rules for Baltic region.

### MR-07: LV/EE grid data missing — LT only from VERT.lt

**Before:** MED impact / MED residual
**After:** MED impact / LOW-MED residual
**Assessment:** LT data coverage is strong (VERT, Litgrid). LV/EE coverage gaps remain, but the intel feed now includes multi-country sources (AST, Elering, APVA). Pipeline data improved via Phase 4B curation merge.
**What would fully resolve:** Systematic LV (SPRK) and EE (Elering) data ingestion pipelines.

---

## Summary

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
