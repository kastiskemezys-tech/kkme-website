# Phase 31.A — Tier-3 card data integrity audit + rebuild

**Branch:** `phase-31-a-tier3-data-integrity` off latest main.
**Estimate:** ~1 day CC (3 pause points).
**Risk class:** MEDIUM. Multi-file frontend + worker. No engine math changes expected, but interp-string and field-mapping rebuilds touch ~6 cards.
**Frontend-only OR worker+frontend:** TBD at Pause A per per-card finding.

Per `feedback_local_build_verification.md`: local `npm run build && npx serve out` smoke-test is REQUIRED before merge. Per `feedback_chrome_mcp_orphans.md`: use the `cc` alias to clear stale chrome-devtools-mcp processes.

---

## Why this phase exists

Operator screenshotted the "Structural market drivers" section (six tier-3 cards: RenewableMix · ResidualLoad · PeakForecast · SpreadCapture · S7 TTF Gas · S9 EU ETS Carbon). Visible from the screenshot:

1. **PeakForecast** — hero claims €142/MWh "Today's DA swing" but `▲ Peak h20 EET €154.3/MWh` and `▼ Trough h12 EET €99.9/MWh` reconcile to a €54.4 swing. Hero is ~3× the actual swing.
2. **S7 TTF Gas** — hero 44.4 €/MWh + threshold pill `0.89× / 50 €/MWh threshold` (below threshold) + interp `Above-normal gas — supporting wider peak spreads` (claims above-normal).
3. **RenewableMix** — `143%` headline + sub-row `Wind 52% · Solar 91% · Thermal 0%` — sub-row values' semantic meaning unclear (capacity factor? share?), don't reconcile to 143% aggregate.
4. **PeakTrough Range** (= SpreadCaptureCard) — `Buy €15 · Sell €153` (€138 spread) vs hero `€135.5`; cross-border `€-6.9/MWh LT-SE4` semantically unclear (spread? net? average?).

Math-reconciles in the screenshot: ResidualLoad (LT -957 + LV -246 + EE -129 = -1,332 ✓), EU ETS Carbon (75.3 × 0.45 = 34 carbon premium; 74 + 34 = 108 P_high floor ✓).

**Operator framing: "the data is nonsense in some, they need a full revision/rebuild."**

Cowork-side code-grep at Phase 31.A scoping (`bb96655`) confirmed two of four bugs at code level:

- **PeakForecast root cause:** `app/lib/peakForecast.ts:75-88` resolution-detection heuristic mis-classifies 96-entry 15-min ISP arrays as 24-entry hourly arrays when adjacent-bar variance crosses the €2 threshold. When that happens, `computePeakTrough` slices `hourly.slice(-24)` = last 6 hours only, while worker `lt_daily_swing_eur_mwh` (`workers/fetch-s1.js:3341-3343`) is `max(...ltPrices) - min(...ltPrices)` over the full 96-entry array. Hero shows full-day swing; peak/trough rows show last-6h max/min. Live `/s1` curl 2026-05-13: `hourly_lt` has 96 entries; `lt_daily_swing_eur_mwh=108.13` matches max-min of full array.
- **S7 TTF Gas root cause:** `workers/fetch-s1.js:5609-5612` regime classification uses threshold 30 for ELEVATED (`ttf > 30 → ELEVATED`) and threshold 50 for HIGH (`ttf > 50 → HIGH`). Frontend pill `app/components/S7Card.tsx:31` displays `(price / 50).toFixed(2)× / 50 €/MWh threshold` — hard-coded threshold 50. At TTF 44.4: regime = ELEVATED (44.4 > 30); interp `Above-normal gas...` fires (line 43). Pill says `0.89×` of the 50 threshold. Two different thresholds (30 vs 50) shown side-by-side without disambiguation.

The other two (RenewableMix, PeakTrough) need Pause-A code-grep to identify exact field mapping. Plus discovery may surface additional bugs in all 6 cards beyond the visible-from-screenshot four.

---

## Discipline rules load-bearing here

- **#1 audit-triage** — visible-from-screenshot bugs are visual inferences. Pause A code-grep + production curl verification BEFORE scoping fix. If a "bug" turns out to be operator misreading or correct-but-confusing labeling, drop the fix and propose a clarifying-label change instead. **3-of-7 SKIP rate on prior sessions; expect similar here.**
- **#3 named-entity verification** — N/A (no entities at risk in tier-3 cards).
- **#4 cross-card consistency** — TTF Gas + EU ETS Carbon both use the threshold-pill pattern. Whatever fix you pick for S7 regime/pill alignment, apply the same shape to S9 if/when its regime threshold ≠ its pill threshold. Use `app/lib/metricRegistry.ts` for any shared fields.
- **#6 no-editorial-state-label** — the existing regime states (ELEVATED/HIGH/LOW/NORMAL) ARE engine-emitted editorial labels. Phase 12.9.1's brand-discipline pass forbade chip-style display of these. **In-scope at Pause A:** consider whether `gasInterpretation()` / `gasImpact()` / equivalent label-derivation functions in S7/S9/PeakForecast/etc. should be rebuilt to be data-derived (quantitative micro-descriptors) instead of regime-derived. If yes, the regime classification can stay in worker as an internal tag but the frontend stops surfacing the editorial copy.

---

## Pause A — Discovery (~2-3h)

Code-grep each of the six tier-3 cards. For each card, produce a table:

| Field displayed | Source (worker field / component-side derivation) | Math/label reconciliation | Bug? |
|---|---|---|---|

**Cards to audit:**

1. `app/components/RenewableMixCard.tsx` — `/wind`, `/solar` endpoints likely.
2. `app/components/ResidualLoadCard.tsx` — `/load` derived from gen vs load.
3. `app/components/PeakForecastCard.tsx` — `/s1` endpoint (`lt_daily_swing_eur_mwh`, `hourly_lt`, `da_tomorrow`).
4. `app/components/SpreadCaptureCard.tsx` — `/s1` (`p_high_avg`, `p_low_avg`, `intraday_capture`, `bess_net_capture`) + possibly cross-border data.
5. `app/components/S7Card.tsx` — `/s7` endpoint (`ttf_eur_mwh`, `regime`).
6. `app/components/S9Card.tsx` — `/s9` endpoint (`eua_eur_t`, possibly `regime`).

For each, verify:

- (a) **Hero metric reconciles** — does the displayed number match the worker field? Same unit? Same window?
- (b) **Sub-row breakdown reconciles** — do sub-row components sum/derive to the hero metric (where claimed to)?
- (c) **Interp/impact strings are correct** — do conditional copy generators (`gasInterpretation`, `gasImpact`, regime-derived strings) align with the displayed threshold pill?
- (d) **Cross-card consistency** — if a metric appears in N cards (TTF in S7 + RevenueCard? Carbon in S9 + somewhere?), do they all derive from the same canonical worker field per rule #4?
- (e) **Editorial state labels** — does the card surface regime/state strings that rule #6 would forbid?

Use `curl https://kkme-fetch-s1.kastis-kemezys.workers.dev/<endpoint>` to confirm live field shapes.

Produce a **Pause A report** in this chat with the per-card table + a summary of how many of the 4 visible-from-screenshot bugs are confirmed at code level + any **additional bugs** you found beyond those four. Then propose Pause B scope.

**STOP and wait for operator approval before Pause B.**

---

## Pause B — Fix (~3-4h)

Per Pause A approval. For each confirmed bug, apply the smallest fix that closes it:

**PeakForecast fix candidates** (pick at Pause B per which lands most surgically):

- (a) **Drop the heuristic; use array length only.** If `hourly.length === 96`, perHour=4; if `hourly.length === 24`, perHour=1; else fall back. Removes the false-positive misclassification path.
- (b) **Use worker-side peak/trough.** Worker already has `ltPrices`; emit `lt_peak_hour`, `lt_peak_price`, `lt_trough_hour`, `lt_trough_price` from the same array used for `lt_daily_swing_eur_mwh`. Frontend reads worker fields, no client-side heuristic. (More invasive but most robust per rule #4.)
- (c) **Heuristic + reconciliation check.** Keep heuristic but assert `peakPrice - troughPrice >= worker_swing - 0.01` before displaying; on mismatch, log warning + display only the hero (drop the peak/trough rows). Discipline-honest fallback.

**S7 TTF Gas fix candidates:**

- (a) **Drop editorial labels per rule #6.** Replace `gasInterpretation` / `gasImpact` with data-derived strings: `Gas at 0.89× the 50 €/MWh threshold — below typical peaker-displacement floor.` (Computed from `ttf / 50`.) Regime classification can stay in worker as internal tag but frontend stops surfacing editorial copy. **Recommended.**
- (b) **Align thresholds.** Lower pill threshold to 30 (the ELEVATED boundary) OR raise regime threshold to 50 (only "above-normal" when actually above the pill threshold). Quickest fix; doesn't address the rule #6 concern.
- (c) **Two-band pill.** Display two thresholds: `0.89× / 50 (high) · 1.48× / 30 (elevated)`. Explicit but verbose.

**RenewableMix + PeakTrough fixes** — scoped from Pause A findings.

**S9 EU ETS Carbon** — if same regime/pill pattern as S7, apply matching fix per rule #4.

**Cross-cutting:** any new derived field added to worker → register in `app/lib/metricRegistry.ts` per Phase 12.10 / rule #4.

Run all 6 foundation gates after Pause B:

- `npx tsc --noEmit` (0 errors)
- `npm run test` (vitest baseline — current 925/925 or 924/925 with known time-dependent freshness)
- `npm run lint` (current 127 errors / warnings baseline; report delta only)
- `npm run lint:no-raw-spacing` (exit 0)
- `npm run lint:no-editorial-chips` (exit 0)
- `npm run build` (7 routes clean)

**STOP and wait for operator approval before Pause C.**

---

## Pause C — Verify (~1h)

- **Local-build smoke-test (REQUIRED per `feedback_local_build_verification.md`):** `npm run build && npx serve out -l 3100` → curl all 5 routes (`/`, `/intel`, `/regulatory`, `/methodology`, `/dev/hero-preview`) → HTTP 200; sample 8 JS chunks → HTTP 200. Detect 18.1.1-class ChunkLoadError absent.
- **Chrome MCP DOM probe:** open production-mirror local build, visit `/` → verify each of the 6 tier-3 cards renders without console errors; verify the 4 visible-from-screenshot bugs are gone; verify cross-card consistency (no metric showing different values in different cards).
- **Live curl reality-check:** `/s1`, `/s7`, `/s9` field shapes match what the frontend expects post-fix.
- **Visual audit captures:** 1 PNG of "Structural market drivers" section at 1440px to `docs/visual-audit/phase-31-a/`. Before/after pair if time permits.
- **Handover Session 58 entry** documenting:
  - Pause A findings table (per-card)
  - Pause B fixes shipped with code references
  - SKIPs per rule #1 (any visible-from-screenshot "bug" that turned out to be operator-misreading or correct-but-confusing labeling)
  - Any additional bugs found beyond the 4 visible-from-screenshot
  - Gate deltas
  - Local-build smoke-test result
  - Visual evidence pointer
- **Roadmap delta needed (Cowork applies per rule #5):**
  - Phase 31.A → Shipped appendix
  - Phase 31.B (visual normalization) becomes unblocked
  - Update "Currently active" pointer

Branch push. Operator opens PR + merges (no body, no branch delete per `feedback_pr_workflow_minimal.md`).

---

## What NOT to do

- **Do not touch Phase 31.B (visual normalization).** Two-template grid, status-indicator drift, hero type drift, footer affordance gap, card heights, color treatment — all of that is 31.B's scope. Stay on data correctness only.
- **Do not invent new metrics or sources.** If Pause A surfaces a card displaying a number with no clear worker-field provenance, flag as a discovery item; don't try to derive a replacement.
- **Do not edit the roadmap.** Per rule #5, roadmap is Cowork-owned. Report deltas via handover; Cowork applies.
- **Do not chase Phase 32 (Bitėnai cascade recalibration) here.** 32 depends on 31.A's field-mapping output but is its own confidentiality-gated scope (CC will not have read access to `~/Documents/KKME/01_Deals/Prosperus_48MW_96MWh/` from inside the kkme repo). Stay inside kkme.
- **Do not pad to "fix" cards that math-reconcile.** ResidualLoad and EU ETS Carbon were noted as math-clean in the screenshot. Verify at Pause A, but don't introduce changes unless code-grep surfaces something the screenshot didn't show.
