# Data Confidence Assessment — April 2026

Retired from homepage 2026-04-16. This document preserves the confidence grades and current-state notes.

## Context

The Data Confidence panel displayed dot-based confidence grades (1–5) plus level badges (high/medium/low) for each major data input. It was an honest trust signal but duplicated information (dots and chips said the same thing) and, alongside the Model Risk Register, created an impression of analytical weakness rather than institutional rigor.

**Decision:** Retire from homepage; archive assessment here.

---

## Confidence Grades (as displayed)

| Metric | Dots | Level | Source | Current State (April 2026) |
|--------|------|-------|--------|---------------------------|
| Installed base | ●●●●● | HIGH | official · Litgrid + AST + Evecon | Strong. S4 fleet tracking covers LT installed capacity from official TSO data. |
| Permit-backed pipeline | ●●●●● | HIGH | official · VERT register | Strong. VERT register provides comprehensive LT permit data. Phase 4B curation merge improved quality. |
| TSO reserved/protocol | ●●●●○ | HIGH | official · Litgrid cycle data | Strong. Direct TSO capacity cycle data via Litgrid. |
| Capacity prices | ●●○○○ | LOW | proxy · no BTD clearing data | Partially improved. BTD provides activation energy prices (S2), but capacity reservation clearing prices remain proxy-based. Upgraded from pure proxy to partial observation. |
| Node-level headroom | ●●●○○ | MEDIUM | indicative · non-additive caveat | Unchanged. Grid headroom data is indicative and carries non-additive caveats. AST topology data helps but doesn't resolve the fundamental limitation. |
| Revenue model | ●●○○○ | LOW | modeled · proxy inputs + assumptions | Improved but still modeled. Revenue engine v7 uses observed BTD prices and real fleet data, but dispatch stacking remains fixed-factor (not LP-optimized). |
| EE/LV pipeline | ●●○○○ | LOW | partial · scraper coverage gaps | Improved. Intel feed now includes Elering (EE) and AST (LV) sources. Systematic pipeline coverage still incomplete. |

---

## Methodology Note

Confidence grades reflected data provenance, not prediction accuracy. "Low" meant the input uses proxies or assumptions — not that the output is wrong. The grades were conservative by design.
