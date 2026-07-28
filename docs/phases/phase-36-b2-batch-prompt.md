# Phase 36.B batch-2 — Dispatch-card micro-fix + 36.B2 bootstrap + 36.B3 backtest

**Branch:** `phase-36-b-batch-2` off latest main. **Autonomous batch, three parts in strict order.**
**Estimate:** micro-fix ~30 min · B2 ~2 days · B3 ~1-1.5 days.
Read `docs/phases/phase-36-b-arc.md` first (specs for B2/B3 live there; this prompt adds the batch rules + the micro-fix).

## Part 0 — computeDispatchV2 RTE micro-fix (FIRST, its own commit, DEPLOYED)

The one public-facing change of this batch, done first and isolated:

1. Fix the arithmetic error you quantified in B1: the round-trip loss must be charged on the cycle (charge leg buys `1/RTE` MWh per delivered MWh, or equivalent correct formulation matching the hourly engine's treatment). Remove or re-justify the negative-day clamp — if days can be net-negative under correct math, the honest number includes them (30/366 days in 2024).
2. **Validate against the hourly engine:** same day, same prices, same parameters — computeDispatchV2's corrected daily arbitrage within a small explained delta of `dispatch.mjs`. Add this as a permanent mirror-class test (the two implementations can never silently diverge again).
3. Quantify the public delta: dispatch-card number before vs after, stated in the commit message and handover (expected ≈ −40 % on arbitrage).
4. This commit DOES change public output — byte-identity is expected to fail exactly here and nowhere else. Capture pre/post `/dispatch`-related outputs; every other route byte-identical.
5. Commit → push → origin-SHA check → **STOP for the one operator action of the batch: paste the deploy command result** (`npx wrangler deploy` — operator runs it, pastes version ID) → verify live card shows corrected number → then continue autonomous.

## Part 1 — 36.B2 per arc spec (autonomous)

Bootstrap percentiles. Arc spec governs; batch specifics:
- Primary sample 2021-2026, full 2015-2026 as sensitivity (D4). Data already committed by B1.
- Percentile outputs P50/P75/P90/P99 per project + portfolio; percentile bridge at P50 and P90.
- Gates: P50 ≈ Central within explained bounds · strict percentile ordering · every distribution input traceable to a shape-year (no synthetic draws).
- The balancing side uses the D3 boundary: reserve prices flat at calibrated values across shape-years, stated in every output (`reserve_basis: "calibrated-flat (see D3)"`).

## Part 2 — 36.B3 per arc spec (autonomous)

Measured DA trading realisation:
- Day-by-day replay (B1's defect-#2 guard: never a single simulated window), 2025-07 → 2026-06, DA-information-only policy.
- Measured realisation vs assumed 0.85: whatever it is, it ships. If > 0.90, hunt look-ahead leakage before believing it.
- 15-min delta measurement (D1): 2025's PT15M file vs hourly-averaged — reported against `RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14`.
- Register update: `trading_realisation` becomes measured (new source string), old assumed value kept as comparison row; changelog entry (B6 will formalise, do it manually now).
- Reserve realisation: UNTOUCHED, assumption stated (D3).

## Batch rules
- Worker: Part 0 touches exactly one function + tests; Parts 1-2 are `tools/consultancy/` only. Assert at wrap: worker diff vs main = the Part-0 fix alone.
- `/revenue` byte-identical throughout (the fix is dispatch-path, not revenue-path — verify this claim at Part 0, it's a hypothesis).
- DECISIONS.md; conservative when ambiguous; STOP conditions per prior batches.
- Wrap: handover with the three headline artifacts (corrected card delta · percentile table per project · measured realisation + 15-min delta), origin-SHA, PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-b-batch-2`
