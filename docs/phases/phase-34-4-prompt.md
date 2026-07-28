# Phase 34.4 — Client scenarios + sensitivity engine

**Branch:** `phase-34-batch-2` off latest main (batch mode with 34.5).
**Estimate:** ~half day. **Risk class: LOW — runner-path only, ZERO worker edits this batch.**

## HARD RULE (batch 2)
`workers/fetch-s1.js` is READ-ONLY this entire batch. Scenarios and sensitivity are config-perturbation runs at the runner level. If you find yourself wanting a worker edit, stop and log it in DECISIONS.md as a batch-3 candidate instead. (Regression script still runs after each commit as proof — it should be trivially green.)

## Scope

### 1. Scenario definitions as data
`tools/consultancy/scenarios.json` — the 3 client-facing cases as config-override sets. Locked with client via mockup (`prosperus-mockup-v5.html`):

| Driver | Downside | Central | Upside |
|---|---|---|---|
| `fleet_realisation_pct` | 65 | 50 | 35 |
| `spread_growth_pct_yr` | −1.0 | +2.0 | +3.5 |
| `availability_pct` | 95 | 97 | 98 |
| `trading_realisation` | 0.78 | 0.85 | 0.88 |
| `cap_price_delta_pct` | −25 | 0 | +20 |
| `cpi_floor` | 0.28 | 0.30 | 0.35 |

**Pause-A-style verification first (rule #1, 10 corrections running):** map each driver to the engine parameter that actually implements it. Expected mappings are hypotheses — e.g. `fleet_realisation_pct` likely maps to `fleet_context.pipeline_realisation`; `trading_realisation` to `base_year.trading_realisation`; `cpi_floor` to the cpiCurve floor constant. Some may not be reachable via existing params — for each unreachable one, implement at the runner level (post-hoc adjustment of the affected revenue lines with documented formula) rather than editing the worker. Log every mapping + reachability in DECISIONS.md.

**Central-case invariant:** Central overrides applied must reproduce batch-1's numbers EXACTLY (it's the same case). Assert it.

### 2. Scenario runner
`tools/consultancy/run-scenarios.mjs` → for each scenario × each project: full engine run → per-scenario portfolio JSONs + a comparison summary `{scenario: {gross_y1, ebitda_y1, prefin_cf_y1, sum_20yr_net, npv, moic}}`. Sanity assert: Downside < Central < Upside on every headline (monotonicity).

### 3. Sensitivity runner
`tools/consultancy/run-sensitivity.mjs` → 8 drivers (the 6 above + `optimiser_pct_gross` 15/8%, `rte_decay_pp_yr` 0.30/0.10), one-at-a-time perturbation from Central, both directions → `sensitivity.json` table `{driver, central, down_value, up_value, delta_ebitda_down, delta_ebitda_up}` sorted by |impact|. Assert: sum of single-variable deltas ≠ scenario delta is EXPECTED (interaction effects) — do not force them to match, but report the interaction residual.

### 4. Tests
Scenario monotonicity · Central-reproduces-batch-1 exact · sensitivity sign-sanity (higher availability → higher EBITDA etc.) · mapping unit tests per driver.

## Commit
`phase 34.4: client scenarios + sensitivity engine (runner path)` → push → origin-SHA check → continue to 34.5.
