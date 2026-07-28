# Phase 36.B1 — Data audit + chronological hourly dispatch engine

**Branch:** `phase-36-b1-hourly-dispatch` off latest main.
**Estimate:** ~3-4 days. **Semi-autonomous: ONE CHECKPOINT after the data audit (Pause A) — the audit's findings shape B2's design and the operator must see them before they're baked in. After the checkpoint, autonomous through build + wrap.**
**Risk class:** MEDIUM-HIGH on scope (the biggest single build of the arc), LOW on public-site risk (new capability alongside, `/revenue` byte-identical throughout).

Read `docs/phases/phase-36-b-arc.md` FIRST — it carries the bankability standard, the policy decision (conservative greedy, not LP), the validation gates, and the standing rules. This prompt operationalises 36.B1; the arc doc is the contract.

## Pause A — Data audit + design verification (~half day) → CHECKPOINT

### A.1 Historical price-data audit (the arc's "resolve FIRST")
Empirically inventory every hourly/sub-hourly price series we hold or can reach:
1. **KV:** list every price-carrying key, its resolution, and actual depth (`s1_capture_history`, `s2_rolling_180d`, `capacity_monthly`, `raw:s1:*`, `trading:*`, anything else the grep finds). Report first/last timestamps per series.
2. **VPS PG:** ssh in, inventory price tables — resolution, row counts, date ranges. Resolve Session 73's "trailing 12m: 2 months" question definitively.
3. **BTD API:** probe how far back `price_procured_reserves` (and any DA/imbalance datasets) actually serve. Document per-dataset earliest date.
4. **ENTSO-E:** confirm endpoint + document format for LT DA hourly history (no token needed to READ THE DOCS; the token unblocks B2's backfill — operator has registered, note status).
5. **Verdict table:** per data need of B1/B2/B3 (dispatch price shapes · bootstrap years · backtest window) — have it / backfillable / blocked. If the realised-backtest window (B3: 2025-07→2026-06 hourly DA) isn't currently held anywhere, say so loudly — it changes B3's feasibility.

### A.2 Design verification (rule #1 — the arc's hypotheses)
1. Where can the hourly engine live? Verify whether an 8760-hour × 20-year × multi-project simulation is feasible in worker runtime (CPU limits) or belongs in `tools/consultancy/lib/` (Node) with the worker exposing only summaries later. Expect: Node-side. Verify, don't assume.
2. Confirm the engine modules the dispatch must REUSE (rule #4): RTE curve source, SOH curves, CPI/saturation machinery, price-shape inputs, reserve acceptance rates. Map each to its canonical location.
3. Confirm the reserve-energy-reservation constraint's parameters: what aFRR/mFRR activation-energy expectations does the engine carry (R_act_yr fields) to size SoC headroom per committed MW?
4. Sketch the hour loop's state machine (pseudocode) — this pseudocode later goes verbatim into the lender methodology (B6), so write it to be read by a bank's advisor.

### CHECKPOINT — STOP. Report to operator:
- Data verdict table (the B2/B3 feasibility picture)
- Engine-location decision + reuse map
- Dispatch pseudocode
- Any arc-doc premise overturned (14th+ corrections welcome)
- Revised effort estimate for the build

Wait for operator approval before Pause B. (Operator: this is the one gate — everything after runs autonomous.)

## Pause B — Build (autonomous after checkpoint approval)

Per the arc doc's 36.B1 spec, summarised:
1. `dispatch.js` module — hourly state machine: SoC continuity, reserve commitments at observed acceptance, DA arbitrage in residual windows, availability windows, POI limit, negative-price rule, cycle-budget throttle, RTE per charge leg.
2. Runner: `tools/consultancy/run-dispatch.mjs <config> <price-year>` → 8760-row output (CSV + summary JSON) + annual roll-up per revenue line.
3. **Validation gates (all five from the arc doc):** reconciliation-to-time-model with attributed deltas · exact energy balance · cycle-count consistency ±10 % · zero constraint violations (property test) · `/revenue` byte-identity 54/54 + route probe.
4. Tests: constraint properties over full-year runs · golden-day fixtures (hand-computed dispatch for a synthetic 24 h price shape — charge trough, discharge peak, reserve headroom maintained) · SoC continuity across day boundaries · negative-price behaviour · cycle-throttle engagement near budget.
5. DECISIONS.md throughout; conservative option when ambiguous — in this phase "conservative" always means LESS claimed revenue.

## Pause C — Wrap
Commit(s) + push + origin-SHA check. NO deploy (worker untouched or additive-only; if touched, byte-identity must hold and deploy still waits for operator). Handover: the reconciliation table (hourly vs time-model, per product, with attributions — this table is the phase's headline artifact), data-audit summary restated, B2 design implications, PR URL.

## Out of scope
B2 bootstrap · B3 backtest · B4 overlay · B5 loop/dur_h · B6 governance — all follow per the arc. Public-site cutover to hourly numbers — Phase 37 conversation, not here.
