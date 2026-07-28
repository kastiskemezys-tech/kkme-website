# Phase 34.3 — Portfolio aggregation

**Branch:** continue on `phase-34-batch-1` (third phase of the autonomous batch).
**Estimate:** ~1 day (or the remainder of the batch session — stop cleanly wherever you are 1h before context/energy runs out and write the handover).
**Risk class:** LOW. Pure runner-path code — worker untouched this phase unless a per-project seam bug from 34.1 surfaces.

## HARD RULE
Same as 34.2 — public `/revenue` byte-identical; regression script after every commit.

## Scope

### 1. Portfolio runner
`tools/consultancy/run-portfolio.mjs <dir-of-configs>` → loads all project configs (the 3 Prosperus), runs each through the engine, then aggregates:

- **Per-line summation:** every bridge line (Y1 + 20-yr) = Σ projects. Enforce as assert, not just compute — a portfolio line that isn't exactly the sum of project lines is a bug.
- **Staggered COD weighting:** portfolio Y1 = calendar-year 2028 view (Bitėnai 12 mo + Stoniškiai 7 mo + Eigirdžiai 0 mo). Portfolio 20-yr timeline = calendar years 2028-2047 with each project contributing from its COD. Augmentation/replacement events land per-project (Bitėnai Y8 = 2035, Stoniškiai Y8 = 2035 or 2036 per COD-year convention — pick COD-year + 7 and document).
- **NPV + MOIC:** portfolio NPV @ WACC 8% (config `wacc`) over the calendar timeline including CAPEX outflows; MOIC = Σ net CF ÷ Σ original CAPEX. Per-project NPV/MOIC too.
- **Correlation disclosure (data, not math):** output carries `correlation_note` object: `{lt_zone_price_correlation: 0.97, spatial_diversification: "negligible", temporal_smoothing: "staggered COD"}` — honesty metadata for the deliverable, no fake portfolio-effect math.

### 2. Output
`tools/consultancy/output/portfolio.json`: per-project summaries + consolidated bridge (Y1 + 20-yr) + NPV/MOIC + correlation note + a `generated_at` + engine version stamp.

### 3. Tests
- Portfolio = Σ projects on every line (the assert, tested with synthetic 2-project fixtures + the real 3)
- Staggered COD: synthetic project with COD mid-year contributes pro-rata months
- NPV: hand-computed fixture (3 cash flows, known discount) matches to the cent
- MOIC consistency: NPV path and MOIC path use the same cash-flow array

## Autonomous decision rules
- Calendar-vs-operating-year convention questions: calendar-year timeline for the portfolio (client-facing), operating-year for per-project internals; map between them explicitly, document.
- If 34.1/34.2 outputs make any aggregation ambiguous, prefer the interpretation that keeps portfolio = Σ projects exact.

## Batch wrap (do this even if 34.3 is unfinished)
1. Final commit + push on `phase-34-batch-1`. Origin-SHA equality check — report the SHA explicitly in the handover.
2. NO DEPLOY.
3. Handover session entry covering the whole batch: per-phase status (done/partial/not-started), the 3 projects' headline numbers (gross/EBITDA/pre-fin CF Y1, 20-yr, NPV) vs mockup placeholders with deltas, every autonomous decision taken + rationale, regression-gate status (must be green), anything needing operator eyes.
4. End with the exact PR-compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-34-batch-1`
