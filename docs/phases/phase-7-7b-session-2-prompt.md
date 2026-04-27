# Phase 7.7b Session 2 — Engine Refinement Audit (NOT a wholesale fix)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** continue on existing `phase-7-7b-engine-audit` (Session 1 already committed at `3a868b5`).
**Estimated runtime:** 1.5–2 hours.

---

## CRITICAL CONTEXT — verdict reframe before you read Session 1

**Session 1's audit verdict ("FIX REQUIRED, approach B, -30% revenue") is OVERTURNED.**

Session 1's analysis was based on an incorrect operational mental model — "the asset can only be in one market at a time." Kastytis (15+ years startups, 3 years energy storage, sole operator UAB KKME) has clarified the actual Baltic operational reality:

> *"Generally you'd bid on most of the markets depending on the SOC you have, but generally FCR then aFRR, then mFRR then Day ahead market and since there's limited depth for activations, therefore the more assets there are the more you shift to day-ahead market trading."*

This means:
- A real Baltic BESS bids **simultaneously** into FCR + aFRR + mFRR + DA, hierarchy-driven by SoC.
- Capacity payments are earned for committed hours across ALL reserve products simultaneously (paid for being available).
- DA arbitrage runs on remaining SoC headroom — typically the middle band after fast-reserve SoC requirements.
- The engine's `rev_bal + rev_trd` additive structure is **operationally valid in principle** — the asset legitimately earns both simultaneously throughout the year.

**Therefore:** Session 2 is NOT "implement approach B." It is **NOT a wholesale fix**. The audit document at `docs/audits/phase-7-7b/stack-audit.md` from Session 1 should remain on disk as a snapshot of the static-code analysis, but its verdict is corrected by Kastytis's operational input. Session 2 produces an addendum.

Also read `.auto-memory/reference_baltic_bess_operations.md` — the operational model Kastytis confirmed is now in memory.

---

## Session 2 actual scope

Investigate whether v7 captures **six specific operational refinements**. For each, the deliverable is:
- Yes/No determination from worker source reading (with line citations)
- If No, an estimated magnitude impact on IRR (small / medium / large)
- A targeted refinement proposal — what minimal engine change captures the missing dynamic

**No wholesale rebuilds.** No `wrangler deploy` calls. Session 2 is still audit-class — expanding the analysis, not shipping engine changes. Session 3 (TBD) ships specific refinements that prove necessary.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — §1, §1b, §2 Phase 7.7
3. `cat docs/audits/phase-7-7b/stack-audit.md` — Session 1's audit (now superseded by this Session 2's operational reframe; keep as snapshot)
4. `cat .auto-memory/reference_baltic_bess_operations.md` — Kastytis's operational ground truth
5. `cat docs/handover.md` — most recent entries
6. `git log --oneline -5` — confirm `3a868b5` is the most recent commit on branch
7. `git status` — clean working tree (pre-existing untracked OK)
8. `bash scripts/diagnose.sh` — confirm prod still green
9. `npm test` — should be 384 passing (51 from Session 1's revenueStackFixture spec)
10. `npx tsc --noEmit` — clean

**You're already on `phase-7-7b-engine-audit`.** Don't checkout a new branch. Session 2 commits go on top of Session 1's audit commit. Single branch, two sessions, one PR at the end.

Read the worker source (line ranges already mapped from Session 1):
- `computeRevenueV7()` 916–1239
- `computeBaseYear()` 1941–2150
- `computeTradingMix()` 1807–1876
- `RESERVE_PRODUCTS` 891–895 — per-product allocation shares (FCR 0.16, aFRR 0.34, mFRR 0.50)
- `REVENUE_SCENARIOS` 857–889
- v6 fallback 1334–1502 (rarely fires in production)

Report state, pause for "go" before investigating refinements.

---

## 1. The six refinement questions

For each refinement, do this in order:
1. **Read the worker source** at relevant line ranges to determine if v7 models it.
2. **Capture evidence** with line numbers.
3. **Verdict:** PRESENT / PARTIAL / ABSENT.
4. **Magnitude estimate:** if ABSENT or PARTIAL, what's the rough IRR impact (small ≤2pp, medium 2-5pp, large ≥5pp)?
5. **Proposed refinement:** if needed, what's the minimal engine change?

---

### 1.1 — SoC-banding penalty on arbitrage (when fast-reserves are committed)

**Question:** when 50 MW is bid into FCR/aFRR, the asset must hold SoC in a narrow band (say 30–70%) to respond to either up- or down-activation. That reduces achievable arbitrage depth — you can't traverse 0%–100% SoC for a full nameplate cycle.

**Where to look:**
- Search for `soc_band`, `soc_min`, `soc_max`, `band`, `headroom`, or similar in `computeTradingMix`, `computeBaseYear`, `getDegradation`.
- Check `s1_capture_ref` derivation — does it use full nameplate spread or a banded subset?
- Check `depth` in `rev_trd = yr_capture * spread_mult * depth * rte_yr * trading_real`.

**Operational reality:** if the asset commits to FCR + aFRR fully (50 MW each), realistic effective arbitrage capacity is probably 30-50% of nameplate, not 100%. Multiplicative haircut.

**If ABSENT:** propose adding `soc_banding_factor` to `computeTradingMix`, derived from `RESERVE_PRODUCTS.X.eff` shares.

---

### 1.2 — Activation interruption on arbitrage cycles

**Question:** when aFRR is activated mid-cycle, the discharge is forced (BESS sells when called, even if mid-charge). That haircuts the realized spread — the asset captured X € of arbitrage but was forced out of position.

**Where to look:**
- `act_rate_afrr`, `act_rate_mfrr` in `REVENUE_SCENARIOS`.
- Whether `rev_trd` is reduced anywhere by activation interruption.
- The `0.55` and `0.75` factors at lines 1445–1446 (v6) — what do they represent? Activation discount? If so, are they applied to v7 too?

**Operational reality:** small but real. Maybe 5–15% haircut on arbitrage if the asset is heavily bid into activation-prone products.

**If ABSENT:** propose adding `activation_interruption_factor = 1 - (activation_rate × cycle_disruption_probability)`.

---

### 1.3 — Market depth saturation / bid acceptance rate

**Question:** TSO needs N MW of each reserve product. As Baltic BESS GW grows, total bids exceed N, and each operator's bid-acceptance rate falls. v7's `cpi` (capacity-payment compression index) handles **clearing-price compression** as fleet grows — but does it also handle **bid-acceptance-rate** compression?

**Where to look:**
- `cpi` definition lines 211–217 (already known: function of S/D ratio).
- `bal_calibration`, `bal_scale` factors in `computeRevenueV7`.
- Any reference to "acceptance," "clearing rate," "bid_clear_pct," or similar.
- Whether `RESERVE_PRODUCTS.X.eff` (currently FCR 0.16 / aFRR 0.34 / mFRR 0.50) is FIXED or scales with fleet size.

**Operational reality:** if TSO needs 200 MW of aFRR and 1500 MW of BESS bids, only 13% of bid MW clears. As fleet grows from current to 2x, acceptance rate falls in proportion. Engine probably misses this.

**If ABSENT:** propose adding `bid_acceptance_rate(sd_ratio, product)` that returns the fraction of bid capacity that actually clears, applied to capacity revenue.

---

### 1.4 — Hierarchy preference in allocation logic

**Question:** Kastytis confirmed the operator preference order is FCR > aFRR > mFRR > DA. Operators allocate SoC capacity in that order because margins per MW shrink down the hierarchy. Does v7 respect this preference, OR does it apportion by price-ratio (which can be wrong when an upper-tier market is undersaturated)?

**Where to look:**
- `RESERVE_PRODUCTS.X.eff` shares — fixed at 0.16/0.34/0.50, or dynamic?
- `trading_fraction` derivation — is it influenced by FCR/aFRR/mFRR clearing prices, or only by DA spread vs blended balancing?
- `computeTradingMix` line 1807 onward — how is the optimal mix computed?

**Operational reality:** if FCR is undersaturated (high clearing price, low fleet bids), an operator should bid FCR maximally before falling back to aFRR. Engine might not do this.

**If ABSENT:** propose making `RESERVE_PRODUCTS.X.eff` dynamic — function of clearing-price-per-MW relative to next tier.

---

### 1.5 — Per-product activation rates

**Question:** FCR activates ~5-10% of bid hours. aFRR ~25-30%. mFRR ~5-15%. Each rate affects how much MW is "stuck" in activation vs free for arbitrage. Does v7 use per-product activation rates?

**Where to look:**
- `act_rate_afrr`, `act_rate_mfrr` in `REVENUE_SCENARIOS` (lines 857–889) — are these per-product?
- Is there an `act_rate_fcr`?
- How are activation rates fed into `rev_act` — per product or blended?

**Operational reality:** if engine uses a single blended rate, FCR (which is barely activated) is treated like aFRR (which is heavily activated). That over-credits FCR activation revenue and under-credits FCR capacity utilization for arbitrage.

**If ABSENT:** propose adding `act_rate_fcr` and ensuring per-product rates flow through `rev_act` calculation.

---

### 1.6 — Cannibalization mechanics as fleet grows

**Question:** Kastytis directly stated: *"the more assets there are the more you shift to day-ahead market trading."* This is multi-mechanism:
- Reserve **clearing prices** drop (engine's `cpi` captures this).
- Reserve **bid acceptance rate** drops (1.3 above).
- Reserve **activation rate per remaining bidder** rises (TSO needs same total volume across more bidders, so each gets called proportionally less? Or same? Need to check.).
- DA arbitrage **becomes more competitive** as MW saturates DA market too.
- Cannibalization is likely **non-linear** — first 200 MW saturate FCR rapidly, then 500 MW saturates aFRR, then mFRR, then DA.

Does v7's `cpi` capture all of this, or only price compression?

**Where to look:**
- `cpi` curves at lines 211–217 — only one curve shape, applied to all balancing revenue.
- Whether DA arbitrage spread (`s1_capture_ref`) compresses with fleet growth — i.e., is there a DA cannibalization model parallel to cpi?

**If PARTIAL:** propose extending cpi or adding a parallel DA-cannibalization model.

---

## 2. Pause B — refinement-audit checkpoint

After investigating all 6 refinements, pause and report:

For each refinement: PRESENT / PARTIAL / ABSENT verdict + line citations + magnitude estimate.

Then propose:
- **Refinement priority ordering** — which 1-2 refinements have the largest magnitude impact and should ship in Session 3?
- **Refinement deferral** — which refinements are real but small, defer to backlog?
- **No-action items** — which refinements turn out to be already PRESENT (engine handles them correctly)?

Wait for Kastytis's "go" before writing the addendum (§3) and updating the audit document.

---

## 3. Addendum to the Phase 7.7b audit document

Create `docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md` with:

```markdown
# Phase 7.7b Audit — Addendum (Operational Reframe)
*2026-04-26*

## Summary

Session 1's audit verdict ("FIX REQUIRED, approach B, -30% revenue") is OVERTURNED by Kastytis's operational ground truth on Baltic BESS multi-market bidding patterns.

The engine's `rev_bal + rev_trd` additive structure is operationally valid in principle. Real Baltic BESS bid simultaneously into FCR + aFRR + mFRR + DA, hierarchy-driven by SoC. Capacity payments are earned for committed hours across all reserve products. DA arbitrage runs on remaining SoC headroom.

The audit's "FIX REQUIRED" framing is incorrect. The model is roughly right with specific imprecisions to refine.

## Refinement audit findings (Session 2)

[Per-refinement table per §1.1 through §1.6 above]

## Revised verdict

**REFINEMENTS NEEDED, no wholesale fix.**

- Session 1's audit document (`stack-audit.md`) remains on disk as a snapshot of the static-code analysis. Its verdict is superseded by this addendum.
- Session 1's frozen v7 fixtures (`baseline-*-v7.json`) remain valid as reference points — they capture current production behavior.
- Session 1's `revenueStackFixture.test.ts` remains valid as a regression guard.
- Session 1's `scripts/audit-stack.mjs` debug script is preserved (do NOT delete) since the operational reframe means we may need to re-run it as refinements are evaluated.

## Open questions for Session 3

[List the 1-2 highest-priority refinements + the proposed engine changes]

## Communication implications

The original audit's "ship the fix behind a feature flag, model_version v7 → v8, hold for methodology page" plan is also reframed:
- No model_version bump warranted yet — v7 is operationally roughly correct.
- Refinements that ship in Session 3 may warrant version stamps (e.g., v7.1) but not the v7 → v8 narrative-grade jump.
- No methodology-page release coordination needed.
- IRRs do not collapse 30%. Refinements may move base-case IRR by ±2-5pp depending on which combination ships.
```

Also update Session 1's `stack-audit.md` with a single-line note at the top:

> **2026-04-26 — Verdict superseded.** See `stack-audit-addendum-2026-04-26.md` for the operational reframe based on Kastytis's pushback. The "FIX REQUIRED, approach B" verdict below was based on an incomplete operational model.

---

## 4. Vitest spec updates

The Session 1 fixture spec `app/lib/__tests__/revenueStackFixture.test.ts` continues to assert the additive invariant — that's still valid. It just doesn't mean what Session 1 thought it meant.

If Session 2's refinement audit identifies specific dimensions where the engine misses an operational reality (e.g., SoC-banding factor missing), add **probe specs** to a new file `app/lib/__tests__/refinementProbes.test.ts`:

```ts
// Probe specs: for each operational refinement, an assertion that captures
// the engine's CURRENT behavior. When Session 3 ships a refinement, these
// flip from "asserts current" to "asserts new" — diff is the audit trail.

import { describe, it, expect } from 'vitest';
import base4h from '../../../docs/audits/phase-7-7b/baseline-base-4h.json';

describe('Operational refinement probes (engine v7 baseline)', () => {
  it('SoC-banding factor on arbitrage: probe whether fixture trd revenue reflects banding', () => {
    // ... probe logic per §1.1 finding
  });
  // ... one probe per refinement
});
```

These probes are **regression guards**: when Session 3 ships a refinement, the corresponding probe needs to be updated. The diff in the test file is the visible audit trail of which refinement landed.

---

## 5. Pause C — Final report

Commit single commit:
- `docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md`
- 1-line update to `docs/audits/phase-7-7b/stack-audit.md`
- (optional) `app/lib/__tests__/refinementProbes.test.ts`

Push branch.

Report to Kastytis with:
- Commit hash
- Refinement verdicts (PRESENT / PARTIAL / ABSENT for each of the 6)
- Magnitude estimates
- Recommended Session 3 scope (which refinements to ship, which to defer)

---

## 6. Hard stops

- **Zero engine code changes.** Even tighter than Session 1: don't touch `workers/fetch-s1.js` at all.
- **Zero `wrangler deploy` calls.**
- **Zero card edits.**
- **Don't delete `scripts/audit-stack.mjs`.** Originally Session 1 said delete-in-Session-2; the operational reframe means it stays for further refinement evaluation.
- **Don't bump `model_version`.** No v7 → v8 implied here.
- **Don't ship any feature flag.** No flag needed for refinements that haven't been investigated yet.
- No new dependencies.
- The pre-existing untracked items in working tree are out of scope.

If during the refinement audit you find something genuinely catastrophic (like, the engine has a hard division-by-zero risk that production is silently masking), pause and report it. Don't widen scope on minor findings.

If you discover that one of the 6 refinements is far harder to verify than the others (or requires running counterfactual scenarios that the worker doesn't expose), document the gap and propose how Session 3 could investigate it (e.g., with a debug script that hits modified worker scenarios via local wrangler dev, OR by adding diagnostic fields to the worker payload).

---

## 7. After Session 2 ships

Update `docs/handover.md` with a Session 16 entry covering:
- Session 1's audit verdict overturn
- Session 2's 6 refinement findings
- Session 3 scope recommendation

Update `docs/phases/upgrade-plan.md` Phase 7.7b status to reflect the refinement framing.

The next CC job is **Phase 7.7b Session 3** — implement the 1-2 highest-priority refinements that Session 2 identifies. Author the Session 3 prompt only after Kastytis confirms which refinements to ship.

If all 6 refinements come back as PRESENT (engine handles them correctly), then Phase 7.7b closes here without any engine code changes — and Phase 7.7c (LCOS, MOIC, real-options optimizer, etc.) becomes the next session as originally planned.
