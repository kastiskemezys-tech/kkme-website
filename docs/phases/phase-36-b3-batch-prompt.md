# Phase 36.B batch-3 — Measured-value cutover + 36.B4 + 36.B0-H + 36.B5

**Branch:** `phase-36-b-batch-3` off latest main. **Autonomous, four parts in strict order.**
**Estimate:** Part 0 ~half day · B4 ~1 day · B0-H ~half day · B5 ~1.5 days.
Arc doc governs (`phase-36-b-arc.md`); batch-2's DECISIONS.md carries the register-invariant context for Part 0.

## Part 0 — Adopt the measured values (operator-decided 2026-07-28)

1. Cut `trading_realisation` over to **0.7234** and the 15-min uplift to **0.0885** — through the register's governance invariants properly this time (you know exactly which 4 tests the naive write turned red; re-fit the bindings and scenario resolution so the invariants HOLD with the measured values, don't relax them).
2. Register rows carry full basis: measured value · source "KKME dispatch backtest 2025-07→2026-06, 349 traded days, monthly 0.654-0.815, single-year window" · assumed old value kept as comparison row · changelog entries · annual remeasurement note.
3. Register's declared sensitivity range updates to contain the measurement (it currently doesn't — batch-2 finding).
4. **Client-impact rerun:** full Prosperus portfolio + reference through the runners with the adopted values. Report the before/after table (gross/EBITDA/pre-fin CF Y1, 20-yr, NPV, MOIC per project + portfolio) — this table is the batch's first headline artifact and feeds the operator's client conversation.
5. Scenario definitions: Central now rests on measured values; Downside/Upside driver ranges for these two parameters re-anchor around the measurement (e.g. trading realisation Downside ≈ monthly-min 0.654, Upside ≈ monthly-max 0.815 — proposal, document the choice).
6. `/revenue` byte-identity: the public reference asset consumes `trading_realisation` — **this cutover may move the public number.** Verify whether it does; if yes, THAT IS INTENDED (honest number) but it happens as its own commit with the delta quantified in the commit message, and flag it for operator deploy at wrap (same treatment as the dispatch card). If the public path carries its own value independent of the register, document the divergence — it becomes a B6 governance item.

## Part 1 — 36.B4 contracted-revenue overlay (arc spec)

- Config `{floor_eur_mw_yr, contracted_pct_of_mw, term_years, counterparty_note}` → blended + floor-only cases.
- Percentile interaction: floor truncates the left tail — P90 with/without at 0/30/50 % contracted (uses B2's machinery).
- Bridge output at each contracting level. Tests: floor binds exactly when merchant < floor · blended = weighted sum · truncation monotone.

## Part 2 — 36.B0-H negative-price parser fix (prerequisite for B5)

- Fix `extractPrices` to parse leading minus. THEN the per-route byte-identity analysis: which routes consume it, which stored KV payloads contain negative prices today, what public numbers move. Negative-price days exist in the committed 11-year history — quantify how many corrupted days the old regex produced per year.
- If public numbers move: own commit, delta quantified, flagged for operator deploy (dispatch-card treatment).
- Add a permanent fixture test: a real recorded negative-price day parses to the correct 24 values.

## Part 3 — 36.B5 degradation loop + dur_h continuity (arc spec)

- 2-pass dispatch↔SOH iteration; convergence verified; residual documented.
- dur_h: single interpolation policy between the 2h/4h anchors (throughput AND RTE together — never mixed anchors); property test 1h→8h monotone-sensible; on-anchor byte-identity for `/revenue` (2h/4h unchanged EXCEPT any intended Part-0 movement, already isolated in its own commit).
- Fold in the batch-1 finding: DA throughput cost vs revenue trading_fraction inconsistency (`:1287` vs `:3178`) — the engine charges cost on more throughput than it bills revenue for. Fix inside the same internal-consistency scope, delta quantified.

## Batch rules
Standing rules per arc. Public-number movements (Part 0 possibly, Part 2 possibly, Part 3's `:1287/:3178` fix possibly) each isolated in own commits with quantified deltas — operator deploys ONCE at wrap covering all of them, with a single consolidated "what moved on the public site and why" table in the handover. DECISIONS.md throughout. STOP conditions standard. Wrap: origin-SHA, consolidated public-delta table, client-impact table, PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-b-batch-3`
