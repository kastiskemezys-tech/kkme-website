# KKME engine improvements identified from Clean Horizon comparison

**Authored:** 2026-05-04 (Phase 30 deliverable, derived from `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md`)
**Status:** backlog. Each gap is a discrete engine-improvement candidate that Phase 7.7e+ pulls from. Operator decides priority + sequencing.

## Gap ranking summary

Five gaps identified. Ranked by impact on KKME's headline numbers (top first):

| # | Gap | Headline impact | Estimate | Priority |
|---|---|---|---|---|
| 1 | Cannibalization explicit per-MW marginal-revenue-vs-fleet-MW curve | High (changes IRR sensitivity to fleet growth) | ~6-8h | **P2 medium** |
| 2 | Dynamic cross-product priority (route-to-market optimization) | Medium (allocation drift as price conditions change) | ~12-16h | P3 medium |
| 3 | Multi-market simultaneous bidding sophistication (mFRR vs aFRR cascade in 4h+ assets) | Medium (4h IRR lift potential) | ~6-10h | P3 medium |
| 4 | 15-min timestep DA optimization (vs hourly) | Low-medium (DA capture refinement) | ~4-6h | P3 low-medium |
| 5 | Reconciliation of KKME aFRR/FCR cap reservation values vs Clean Horizon's published Baltic averages | Possibly High (might surface a real bug, might surface a methodology disclosure need) | ~2-3h investigation | **P1 critical** |

**Sequencing recommendation:** Gap #5 first (cheap, possibly load-bearing), then #1 (highest non-investigation impact), then #3 + #4 + #2 in that order.

---

## Gap 1: Cannibalization model — explicit per-MW marginal-revenue-vs-fleet-MW curve

### What Clean Horizon publishes

January 2026 methodology update: *"Starting January 2026, the index now takes into account the actual volumes available on both capacity reservation and energy activation markets, as well as the installed storage capacity in the country, showing potential revenues of an average MW of battery rather than a marginal one."*

Translation: COSMOS now computes "what does the next MW earn given this country has X MW of installed BESS competing for capacity reservation + energy activation slots." Pre-Jan-2026 framing was "marginal MW operating freely on all available markets."

### KKME current state

Scenario-keyed compression multipliers (`COMPRESSION_SCENARIO_MULT` at `workers/fetch-s1.js:1127`): base = 1× observed compression rate, conservative = 2×, stress = 3.5×. Compression rate itself derived from S2 fleet trajectory (`deriveCompression(kv)`). So KKME has analogous mechanism — fleet-MW growth shows up as scenario-keyed compression scaling — but it's binary (3 scenarios), not continuous.

Operator can't directly query: "what's KKME's projection of marginal MW value at fleet=2GW vs fleet=5GW?" They can only see "base/conservative/stress" with implicit fleet-growth assumptions.

### Proposed improvement

Add `marginal_revenue_vs_fleet_mw_curve: number[]` to `/revenue` payload. Array of `(fleet_mw, projected_marginal_revenue_per_mw_per_yr)` tuples sweeping fleet from current value to 3× current. Frontend renders as a small chart on the Returns card.

Computation: at each fleet_mw point, recompute compression rate from a fleet-trajectory model (input: total Baltic operational MW; output: implied compression %). Tie compression rate directly to fleet_mw rather than scenario-keyed multipliers. Scenarios become "where on the fleet-growth curve we project ourselves to be in N years" rather than ad-hoc multipliers.

### Estimate

~6-8h. Engine work: refactor `COMPRESSION_SCENARIO_MULT` from scenario-keyed to fleet-MW-keyed function. Frontend work: small chart on Returns card showing the curve + a marker for current fleet position.

### Dependencies

- Phase 12.10 (data discrepancy bundle) should ship first to get accurate baseline fleet MW
- Phase 29 (KKME Baltic Storage Index) may want this curve as input for the monthly index

### Priority

**P2 medium.** Closes the largest single methodology gap vs Clean Horizon. KKME's current scenario-keyed framing is correct but coarse; explicit fleet-MW-keyed framing is more precise + more comparable to COSMOS post-Jan-2026.

---

## Gap 2: Dynamic cross-product priority (route-to-market optimization)

### What Clean Horizon publishes

COSMOS *"replicates real-world route-to-market behaviour and decision-making"* (Storage Index landing page). Implies dynamic priority across products as price conditions change — when aFRR clears high, more allocation to aFRR; when DA spreads widen, more allocation to arbitrage.

### KKME current state

Static allocation per `RESERVE_PRODUCTS = { fcr: 0.16, afrr: 0.34, mfrr: 0.50 }` (`workers/fetch-s1.js:1009-1013`). Same allocation regardless of price conditions. Energy-stacking constraint via `scale_energy = min(1.0, usable_mwh / total_energy_req)` prevents over-commitment but doesn't dynamically reallocate.

### Proposed improvement

Replace static `RESERVE_PRODUCTS.share` with a function that recomputes allocation per period based on observed clearing prices:

```js
function computeOptimalAllocation(prices_per_product, capacity_mw, dur_h) {
  // For each product, compute revenue density (€/MW/h capacity reservation × duration availability)
  // Sort products by revenue density desc, allocate in priority order until capacity exhausted or
  // duration constraint hit, then DA arbitrage gets remaining nameplate
  // Returns: { fcr_alloc_mw, afrr_alloc_mw, mfrr_alloc_mw, da_alloc_mw }
}
```

This is a meaningful refactor. Affects `computeThroughputBreakdown` + `computeRevenueV7` directly.

### Estimate

~12-16h. Significant engine work + tests for allocation logic + visual verification that the new allocation tracks actual market conditions.

### Dependencies

- Should ship after Phase 7.7e Engine track items 4-5 (multi-market-simultaneous + Newton-Raphson IRR refinement) so the optimization is built on a robust IRR foundation
- Could pair with Gap #3

### Priority

P3 medium. Matters for sophistication-positioning vs Clean Horizon but doesn't materially affect KKME's headline numbers under current Baltic conditions (allocation shares are reasonably calibrated for the current FCR > aFRR > mFRR price hierarchy).

---

## Gap 3: Multi-market simultaneous bidding sophistication (mFRR vs aFRR cascade in 4h+ assets)

### What Clean Horizon publishes

Implicit in COSMOS optimization. No specific public disclosure on the cascade logic.

### KKME current state

Per Phase 7.7e Engine track backlog item #4 (existing handover backlog): *"Duration optimizer market-physics fix. v7.3 narrows the 2h vs 4h IRR gap from ~10pp to ~7pp via the gentler 4h SOH curve, but multi-market-simultaneous-bidding sophistication (top-N quantile correction, mFRR vs aFRR cascade in 4h+ assets) still missing."*

Specifically: a 4h asset can stack FCR + aFRR + mFRR + still have residual capacity for DA. v7.3's allocation shares (FCR 0.16, aFRR 0.34, mFRR 0.50) sum to 1.0 → no residual for DA on top of full reserve stack. In reality, 4h+ assets can stack reserves AND do DA arbitrage on the remaining hours not committed to activation.

### Proposed improvement

Refactor allocation logic to allow DA arbitrage on hours when reserve obligations don't fully consume capacity. Specifically:

```js
function computeStackedAllocation(mw, dur_h, sc) {
  // For 4h+ assets:
  // Hours 0-23: reserve duty (energy-stacking constraint via dur_req_h per product)
  // Residual hours: DA arbitrage on full nameplate
  // For 2h assets:
  // Reserve duty consumes most capacity; minimal DA arbitrage residual
}
```

### Estimate

~6-10h. Builds on Gap #2 if shipped together; standalone otherwise.

### Dependencies

- Pair with Gap #2 for maximum impact
- Phase 7.7e Engine track item #4 backlog explicitly captures this

### Priority

P3 medium. Closes the 2h-vs-4h IRR gap to align with what 4h assets can realistically achieve. Audience-relevant for project-finance readers comparing 2h vs 4h CAPEX bets.

---

## Gap 4: 15-min timestep DA optimization (vs hourly)

### What Clean Horizon publishes

Per October 2025 update: *"The computation tool behind the index (COSMOS) is now able to optimize battery operations at a 15-minute timesteps instead of 1h as of 2025, following the recent change in the day-ahead market products."*

Translation: COSMOS dispatches against 15-min DA price intervals (since EU DA market moved to 15-min MTU in late 2024 / early 2025).

### KKME current state

Worker `fetch-s1.js` uses ENTSO-E A44 (DA prices) at hourly resolution (`fetch-s1.js:1196-1200` reads `s1_capture.rolling_30d.stats_2h.mean` or `capture_2h.gross_eur_mwh` for current capture). BTD (balancing) is already 15-min MTU and is used as such. The DA arbitrage capture calculation operates on hourly prices.

### Proposed improvement

Two paths:

**Path A — hourly stays, supplement with intraday**: keep hourly DA capture, add intraday capture as a separate revenue stream computed from BTD-MTU intraday prices when available. Quick win — ~2-3h.

**Path B — 15-min DA optimization**: refactor `s1_capture` worker computation to operate at 15-min MTU intervals if ENTSO-E publishes them via A44 at that resolution (verify what ENTSO-E actually returns for LT BZN). ~4-6h.

### Estimate

~4-6h for Path B; ~2-3h for Path A. Verify ENTSO-E A44 LT 15-min availability before scoping.

### Dependencies

- ENTSO-E A44 for LT BZN may or may not publish 15-min granularity. Verify first.
- BTD intraday prices already available; Path A doesn't need new data source.

### Priority

P3 low-medium. The capture refinement is real but small (5-10% revenue impact at most). Worth doing for methodology-comparability not headline-impact.

---

## Gap 5: KKME aFRR/FCR cap reservation values vs Clean Horizon's published Baltic averages

### What Clean Horizon publishes

Per Baltics announcement: *"FCR average clearing price reached €115/MW/h over the past four months; aFRR Capacity Reservation average prices were €77/MW/h for UP and €340/MW/h for DOWN regulation; and mFRR Capacity Reservation average clearing prices stood at €72/MW/h for UP and €85/MW/h for DOWN."* (Clean Horizon's Baltic update post)

### KKME current state

Per Phase 12.10 Pause A live curl:
- `s2.afrr_up_avg`: 7.41 €/MW/h
- `s2.afrr_down_avg`: 5.03 €/MW/h
- Sum: 12.44 €/MW/h (this is what S2Card hero displays as "aFRR P50")

Worker default fallback: `RESERVE_PRODUCTS.fcr.cap_fallback: 45` (when live KV null).

### Discrepancy

Clean Horizon's Baltic FCR average: €115/MW/h (4-month avg).
KKME's FCR fallback: €45/MW/h.
Live S2 FCR: needs verification (curl `/s2 | jq .fcr_avg`).

Clean Horizon's Baltic aFRR-down: €340/MW/h.
KKME's aFRR-down: €5.03/MW/h.
**Order-of-magnitude difference.**

### Three possible explanations

(a) **Time-window mismatch.** CH's "4-month average" is a specific window (likely peak Baltic window — April 2025 when EE 2h hit €5.3M/MW/yr); KKME's live values are current snapshot. KKME's snapshot may simply be in a thinner market period.

(b) **Methodology mismatch.** CH's "capacity reservation" may be the cleared capacity reservation price specifically (one-direction, full procurement window). KKME's `afrr_up_avg` may be a rolling average across the 7-day window that includes uncleared periods + averaging dilution.

(c) **KKME's values are wrong.** Either ingestion bug, or BTD field mapping mismatch.

### Proposed investigation

Step 1: Verify what BTD field KKME's `afrr_up_avg` actually maps to. Document in `app/lib/feedSourceQuality.ts` or a new `app/lib/btdFieldMap.ts`.

Step 2: Pull BTD historical for same 4-month window CH cites. Compute KKME's aFRR-up + aFRR-down averages over that window. Compare to CH's €77 / €340.

Step 3: If KKME's calculation matches CH's framing on the same window: methodology is correct, current snapshot is just thinner market period. Document explicitly.

Step 4: If KKME's calculation diverges materially from CH's framing on the same window: surface as data-integrity bug. Likely a BTD field-mapping mismatch.

### Estimate

~2-3h investigation + write-up. Could ship as a small commit.

### Dependencies

- Phase 12.10 Pause B is the natural place to surface this. Add to Phase 12.10's existing aFRR direction disclosure work as an additional verification dimension.
- BTD historical availability — KKME already pulls 7+ days; need to extend to 4 months for comparable window OR pull on-demand.

### Priority

**P1 critical.** This is potentially the most material finding from Phase 30. If KKME's aFRR-down is genuinely an order-of-magnitude wrong, that's a credibility-corroding data error that ranks alongside Phase 12.10's existing data-discrepancy work. If it's just time-window, it's still a methodology disclosure improvement (Phase 12.10 commit 6 should explicitly note the comparison-to-CH baseline + time-window caveat).

---

## Implementation note

These gaps are NOT scoped into Phase 30 (research-only). They become engine-improvement backlog items for:
- Phase 7.7e Engine track (existing — already has item #4 about multi-market-simultaneous which is Gap #3 here)
- Phase 12.10 Pause B (Gap #5 specifically — investigation is the natural fit)
- Future Phase 31+ (Gaps #1, #2 if/when they bubble to top of priority queue)

Operator decides at handover Session 31 whether to fold these into Tier 1 (foundation) or Tier 5 (editorial + content sequencing) per the methodology-paper destination decision.

**End of gap backlog.**
