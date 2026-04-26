# Phase 7.7b Audit — Addendum (Operational Reframe)
*2026-04-26 · Session 2 of `phase-7-7b-engine-audit`*

## Summary

Session 1's audit verdict ("FIX REQUIRED, approach B, −30% revenue") is **OVERTURNED** by Kastytis's operational ground truth on Baltic BESS multi-market bidding patterns (`reference_baltic_bess_operations.md`, captured 2026-04-26).

The engine's `rev_bal + rev_trd` additive structure is **operationally valid in principle**. A real Baltic BESS bids simultaneously into FCR + aFRR + mFRR + DA, hierarchy-driven by SoC. Capacity payments are earned for *committed hours* across all reserve products simultaneously (paid for being available, not for being exclusively dedicated). DA arbitrage runs on remaining SoC headroom — the middle band after fast-reserve SoC requirements take their cut of nameplate range.

Session 1's "single asset = single market" mental model was wrong. The line 1430 v6 comment (*"reserves and trading are stacked, not exclusive power slices"*) describes an operationally correct architectural choice, not a documented bug. The model is roughly right with **specific imprecisions to refine** — not a structural rewrite.

The audit's "FIX REQUIRED, model_version v7 → v8, hold for methodology page" plan is therefore reframed: no v7 → v8 jump is warranted, no methodology-page release coordination is needed, and IRRs do not collapse 30%. Refinements may move base-case IRR by ±2–5pp depending on which combination ships in Session 3.

---

## Refinement audit findings (Session 2)

| # | Refinement | Verdict | Magnitude | Evidence |
|---|---|---|---|---|
| 1.1 | SoC-banding penalty on arbitrage | **PARTIAL** | small (1–2 pp IRR) | No explicit `soc_banding_factor`. Arbitrage is multiplicatively haircut by `marketDepthFactor (≈0.82 base 4h)` × `trading_real (0.85)` × `spread_mult` × `deg_ratio_vs_y1` (workers/fetch-s1.js:1037–1042). Total Y1 base 4h haircut ≈ 0.70 of theoretical max. Some of this implicitly absorbs SoC banding but not labelled. The dead `computeRevenue_legacy` (line 2339) used `reserve_drag = 0.60` explicitly — the intent never made it into v7. |
| 1.2 | Activation interruption on arbitrage cycles | **ABSENT** | small (1–2 pp IRR) | No factor in `rev_trd` formula (line 1040–1042) accounts for aFRR/mFRR activation events disrupting arbitrage cycles. The 0.55/0.75 factors at lines 1824–1825 / 1445–1446 are activation-side scaling (likely average MWh-per-event), not arbitrage-disruption haircuts. `trading_real = 0.85` is documented as a perfect-foresight discount, not an interruption haircut. |
| 1.3 | Market depth saturation / bid-acceptance rate | **ABSENT in revenue path** | medium (2–5 pp IRR for Y3+, small Y1) | `RESERVE_PRODUCTS` shares (0.16/0.34/0.50, line 891–895) are FIXED and never mutated. `cpi` (line 211–217) compresses CLEARING PRICES only, not bid-acceptance %. The dispatch endpoint DOES model bid-acceptance via `Math.min(procured.afrr_up × 0.9, mw × 0.40)` (line 305) but that capping never propagates to `computeRevenueV7`. Per-product S/D ratios are computed (line 197) but only exposed in payload — not used to drive product-specific compression. |
| 1.4 | Hierarchy preference in allocation logic | **PARTIAL** | small (≤1 pp IRR) | Static hierarchy IS encoded in fixed weights (FCR 0.16 → aFRR 0.34 → mFRR 0.50 — increasing with margin per MW). But there's no DYNAMIC re-allocation: if FCR clearing price spikes, the engine doesn't shift more MW into FCR. `trading_fraction` (line 1857–1858) is purely T/(T+R) price-ratio-driven, not influenced by per-product clearing prices. |
| 1.5 | Per-product activation rates | **PRESENT** | n/a | `act_rate_afrr = 0.18`, `act_rate_mfrr = 0.10` (lines 860, 870, 881) — per-product. No `act_rate_fcr` because FCR pays only capacity, not activation, in Baltic markets — operationally correct (line 1897 comment: *"FCR always-on"*). Tuning note: aFRR rate at 0.18 sits below Kastytis's stated 0.25–0.30 today range — bundled into Session 3 as a tune to 0.25 alongside 1.3/1.6 (the growth-derating from current rate to future rate now lives in 1.6's per-product cpi rather than implicitly in the blended rate). |
| 1.6 | Cannibalization mechanics as fleet grows | **PARTIAL** | medium (covers ~half) | Two compression mechanisms present: (a) `cpi` uniformly compresses ALL balancing revenue with aggregate sd_ratio (lines 211–217, applied implicitly via `reservePrice` line 1697); (b) `marketDepthFactor` compresses arbitrage with sd_ratio (line 1708–1711, 15% haircut at S/D 2.0). Missing: per-product saturation curves (FCR saturates at smaller MW than mFRR — 28 MW Baltic FCR demand vs 604 MW mFRR demand, line 769–771), and bid-acceptance compression (1.3). |

### Catastrophic-finding check

None. The engine is operationally roughly correct as Kastytis confirmed; the refinements are localised tuning, not structural fixes. The `bal_calibration` unbounded-denominator concern from Session 1's stack-audit.md §"Out-of-scope improvements" is still worth fixing but is not catastrophic — `bal_scale` clamps at 1.0.

---

## Revised verdict

**REFINEMENTS NEEDED, no wholesale fix.**

- Session 1's audit document (`stack-audit.md`) remains on disk as a snapshot of the static-code analysis. Its verdict is superseded by this addendum (1-line note added at the top).
- Session 1's frozen v7 fixtures (`baseline-*.json`) remain valid as reference points — they capture current production behavior.
- Session 1's `revenueStackFixture.test.ts` remains valid as a regression guard. It asserts the additive invariant (which is operationally correct, not a bug to catch).
- Session 1's `scripts/audit-stack.mjs` debug script is **preserved** (do NOT delete) — the operational reframe means it stays available for further refinement evaluation. The Session 2 addendum supersedes the script's "delete in Session 2" note from Session 1's stack-audit.md.

---

## Open questions resolved

(Carried forward from Session 1's audit, now answered with the operational reframe.)

| Session 1 question | Resolution after operational reframe |
|---|---|
| Approach A or B? | **N/A** — neither. The additive-stacking is operationally valid; no symmetric-partition correction needed. |
| Communication strategy (hold for methodology page)? | **Not needed.** No v7 → v8 jump. v7.1 stamp on Session 3 refinements is incremental. |
| DSCR covenant narrative shift? | **Not needed.** IRRs do not collapse 30%. base 4h `worst_month_dscr = 0.93×` remains a real soft signal but not a credibility-grade revision. |
| Bankability flag thresholds? | **Unchanged.** Pass/Marginal/Fail at 1.20×/1.0× stays; Session 3 refinements move IRR by ±2–5 pp, not enough to restructure thresholds. |
| Y1-only vs multi-year fix? | **Both.** Session 3's 1.3 + 1.6 land in `computeTradingMix` which is called both for Y1 anchor (computeBaseYear line 2025) and Y2–Y20 projection loop (line 1008). Single edit covers both surfaces. |

---

## Session 3 scope (locked 2026-04-26)

**Ship (single commit, model_version stamped `v7.1`):**

1. **Refinement 1.3 — Bid-acceptance saturation as the primary cannibalization mechanic.** Port the dispatch endpoint's `Math.min(procured.X × 0.9, mw × allocation)` pattern (line 305 region) into `computeTradingMix`. Add `bidAcceptanceFactor(sd_ratio, product)` helper. Scale `R_cap_yr` by it before line 1845.

2. **Refinement 1.6 — Per-product cpi.** Replace single aggregate `cpi` with `cpi_fcr` / `cpi_afrr` / `cpi_mfrr` driven by `product_sd[product].ratio` (already computed at line 197). Plumb through `reservePrice`. Pairs cleanly with 1.3 — same surface area in `computeTradingMix`.

3. **aFRR rate tune: `act_rate_afrr` 0.18 → 0.25** across all three scenarios (lines 860, 870, 881; conservative and stress get proportional bumps so the relative scenario gap is preserved). Matches Kastytis's stated today rate of 0.25–0.30. Growth-derating now lives in 1.6's per-product cpi, not in a blended single rate.

**Defer to backlog (real but small):**

- **1.1 — Explicit SoC banding factor.** Needs a careful disentanglement pass against `marketDepthFactor × trading_real × spread_mult` first — adding it without removing the implicit absorption double-counts in the opposite direction. Methodology-page work surfaces the conflation explicitly; tackle then.
- **1.2 — Activation interruption.** 1–2 pp IRR. `activation_interruption_factor = 1 − (afrr_act_rate × 0.5 + mfrr_act_rate × 0.3)` applied to rev_trd is a one-line add. Bundle with future methodology work or a separate small refinement session.

**No-action:**

- **1.4 — Hierarchy preference.** Static encoding via fixed weights is operationally fine. Dynamic re-allocation would be a heavier rewrite for ≤1 pp IRR. Revisit only if Baltic auction data shows persistent FCR under-bidding.
- **1.5 — Per-product activation rates.** PRESENT and operationally correct after the 0.18 → 0.25 aFRR tune lands in Session 3.

---

## Communication implications

- **No model_version v7 → v8 bump.** Session 3 stamps `v7.1` — incremental refinement, not credibility-grade narrative jump.
- **No methodology-page release coordination.** v7.1 ships independently of Phase 7.8 methodology page authoring.
- **No old-fixture preservation ritual.** The `baseline-*-v7.json` fixtures stay committed because they're useful diff anchors, but no formal v7 vs v7.1 reconciliation page is needed.
- **IRRs do not collapse 30%.** Expected base 4h IRR shift after Session 3: ±2–5 pp (direction depends on which refinement dominates — bid-acceptance compression is downward, per-product cpi is mixed-sign per product). Will be made concrete in Session 3's own fixture diff.
- **Cards untouched.** Session 3 does not require any card-level changes. The number changes flow through existing surfaces automatically.

---

## Companion artefacts (Session 2)

- `app/lib/__tests__/refinementProbes.test.ts` — current-state probes for each of the 6 refinements. Each probe asserts the v7 baseline behavior. When Session 3 ships v7.1, the probes for refinements 1.3, 1.5 (rate tune), and 1.6 update; the spec diff is the visible audit trail of which refinement landed.
- 1-line supersede note at the top of `docs/audits/phase-7-7b/stack-audit.md` pointing here.

---

## Files committed in this addendum

- `docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md` (this file)
- `docs/audits/phase-7-7b/stack-audit.md` (1-line supersede note added at top)
- `app/lib/__tests__/refinementProbes.test.ts` (6 probe specs)
