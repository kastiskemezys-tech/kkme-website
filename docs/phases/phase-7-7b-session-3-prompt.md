# Phase 7.7b Session 3 — Engine refinements (v7.1)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-7-7b-v7-1` off main (after the audit branch merges).
**Estimated runtime:** 2 hours.

---

## CRITICAL: this is the first session that touches the worker

After Sessions 1 + 2 (audit-only), Session 3 **modifies `workers/fetch-s1.js` and deploys to production via `wrangler deploy`**. The blast radius is real — a bad deploy breaks every card on the site simultaneously. Treat every step as gated.

**Three changes to ship in a single coordinated commit + deploy:**

1. **Refinement 1.3 — Bid-acceptance saturation.** Port the dispatch endpoint's `Math.min(procured.X × 0.9, mw × allocation)` pattern into `computeTradingMix`. Add `bidAcceptanceFactor(sd_ratio, product)` helper. Scale `R_cap_yr` by it before the existing line 1845 calculation.
2. **Refinement 1.6 — Per-product cannibalization.** Replace single aggregate `cpi` calls with `cpi_fcr` / `cpi_afrr` / `cpi_mfrr` driven by `product_sd[product].ratio` (already computed at worker line 197). Plumb through `reservePrice`.
3. **aFRR activation rate tune.** `act_rate_afrr = 0.18 → 0.25` across all three scenarios in `REVENUE_SCENARIOS` (lines 860, 870, 881 — verify exact lines via grep). Per Kastytis-confirmed Baltic operational reality (today rate ~0.25-0.30; forward derating now captured separately via per-product cpi in change 1.6).

Also bump **`model_version` from `'v7'` to `'v7.1'`**.

**Hard rule on cpi formula coefficients:** the underlying breakpoints (0.6 / 1.0 thresholds, 2.5 / 1.5 / 0.08 slopes from worker lines 211-217) are **proprietary KKME calibration** per P3. The per-product cpi extension (change 1.6) re-uses the same curve shape with a different `sd_ratio` input per product — do NOT change the coefficients themselves, do NOT publish them in any commit message or output, do NOT add new comments documenting the slopes.

**Read first:**
1. `CLAUDE.md`
2. `docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md` — Session 2's refinement audit (THE reference for this session)
3. `docs/audits/phase-7-7b/stack-audit.md` — Session 1's static analysis (verdict superseded; engine path mappings still useful)
4. `.auto-memory/reference_baltic_bess_operations.md` — Kastytis's operational ground truth
5. `.auto-memory/reference_engine_audit.md` — `/revenue` payload reference
6. `docs/handover.md` — most recent entries (Session 16 covers Session 2)

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md`
3. `cat docs/handover.md`
4. `git log --oneline -10` — confirm `main` includes audit branch merge
5. `git checkout main && git pull && git checkout -b phase-7-7b-v7-1`
6. `git status` — clean working tree
7. `bash scripts/diagnose.sh` — confirm prod still green
8. `npm test` — establish baseline (~465 from end of Session 2)
9. `npx tsc --noEmit` — clean

**Capture pre-deploy v7 fixtures (so we have v7 frozen reference at the moment v7.1 ships):**

```bash
mkdir -p docs/audits/phase-7-7b
BASE_URL='https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue'

for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    OUT="docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-final.json"
    curl -sf "${BASE_URL}?scenario=${SCEN}&dur=${DUR}" -o "${OUT}"
    [ -s "${OUT}" ] || { echo "FAIL: ${OUT}"; exit 1; }
    jq -e '.gross_revenue_y1 | numbers' "${OUT}" > /dev/null || { echo "FAIL: missing gross_revenue_y1"; exit 1; }
    echo "✓ captured ${OUT}"
  done
done
```

These `*-v7-final.json` files differ from Session 1's `*-v7.json` only in capture timestamp — they freeze prod values at the literal moment before v7.1 deploys, so the v7 → v7.1 diff is clean and timestamped.

Read these files end-to-end before editing:
- `workers/fetch-s1.js` lines 197-260 (cpi + product_sd definitions)
- `workers/fetch-s1.js` lines 857-895 (REVENUE_SCENARIOS + RESERVE_PRODUCTS — where act_rate_afrr lives)
- `workers/fetch-s1.js` lines 1697-1711 (reservePrice + marketDepthFactor — where bidAcceptanceFactor will plug in)
- `workers/fetch-s1.js` lines 1807-1876 (computeTradingMix — where the refinement code lands)
- `workers/fetch-s1.js` lines 1941-2150 (computeBaseYear — where R_cap_yr is computed and consumed)
- `workers/fetch-s1.js` line 305 (the dispatch endpoint's bid-acceptance pattern to port)
- `app/lib/__tests__/refinementProbes.test.ts` — the 4 probe blocks that need updating after v7.1 ships

Report state, **pause for "go"** before editing any worker code.

---

## 1. Pause A — pre-flight + reading-only checkpoint

After session-start protocol completes, report to Kastytis:
- Test count baseline (~465 expected)
- 6 v7-final fixtures captured cleanly
- Confirmed production endpoint returns 200
- Read all relevant worker line ranges
- One-paragraph summary of the planned changes with specific line numbers where each change lands
- Any unexpected discoveries during the read (e.g., "the bid-acceptance pattern at line 305 has a comment that says X, which suggests Y...")

Wait for "go" before §2 (worker code changes).

---

## 2. Worker changes (single coordinated commit)

**Order of edits matters — follow this sequence:**

### 2.1 — Add `bidAcceptanceFactor` helper

**Step 1: source the procurement volumes.** The worker has fixed Baltic procurement volumes per product (referenced in earlier audit at lines ~769-771). Confirm exact lines + values:

```bash
grep -nE "fcr_demand|afrr_demand|mfrr_demand|procured\.fcr|procured\.afrr|procured\.mfrr" workers/fetch-s1.js | head -20
```

You should find Baltic-aggregate procurement values (e.g., FCR ~28 MW, mFRR ~604 MW). These are the total volume the TSOs need across all bidders — the "depth" that limits bid acceptance.

**Step 2: model the dispatch endpoint's pattern.** At line 305:

```js
Math.min(procured.afrr_up × 0.9, mw × 0.40)
```

This caps an individual bidder's accepted MW at 90% of total procurement OR 40% of bidder's nameplate, whichever is smaller. As fleet grows, total bids exceed procurement, so each bidder's acceptance rate falls.

**Step 3: build the helper.** Locate near `marketDepthFactor` (lines 1697-1711). Pattern:

```js
function bidAcceptanceFactor(sdRatio, product) {
  // sdRatio is the product-specific S/D ratio (from product_sd[product].ratio at line ~197).
  // Returns a multiplier on capacity revenue: 1.0 = full bid acceptance, 0.X = saturated.
  //
  // Pivots on sdRatio (product-specific):
  //   - sdRatio ≤ ~0.6 (undersaturated): acceptance ≈ 0.9 (most bids clear, slight haircut for non-firm)
  //   - sdRatio between 0.6 and ~1.5: linear decline from 0.9 toward saturation_floor
  //   - sdRatio > ~1.5 (saturated): acceptance approaches saturation_floor (TSO procurement / total bids)
  //
  // Uses a compression-curve shape similar to cpi (proprietary curve definition).
  // Curve coefficients are kept in line with KKME's calibration (do not publish breakpoints).
  //
  // ... actual formula goes here, paramterized via existing cpi curve shape if useful
}
```

**Critical:** DO NOT write code comments that reveal the underlying breakpoints (0.6, 1.0, the slope coefficients 2.5/1.5/0.08 in the existing cpi). The curve SHAPE can be documented as "compression-curve, three-phase"; the SPECIFIC breakpoints stay in the formula source code only and are referred to in comments only as "calibrated values."

**Validation:** the helper's output should be in [0.3, 0.95] range. At Baltic 2026 fleet (sd_ratio ≈ 1.81 per `fleet_trajectory`), expect ~0.5-0.7 acceptance for aFRR. If the formula returns values outside this range, recheck the math.

### 2.2 — Add per-product cpi variants

In the cpi section (lines 211-217), the existing function operates on aggregate `sd_ratio`. Extend it:

```js
function cpi(sdRatio) {
  // existing function — keep as-is, used as fallback
}

// Per-product variants: same curve shape, product-specific S/D input
function cpiForProduct(product) {
  // product is 'fcr' | 'afrr' | 'mfrr'
  // product_sd[product].ratio is computed at line 197 (verify line N)
  // Returns the cpi-shaped compression for that specific product's S/D.
  return cpi(product_sd[product]?.ratio ?? aggregateSdRatio);
}
```

**Plumb through:** find every callsite of `cpi(sd_ratio)` in `reservePrice`, `computeTradingMix`, `computeBaseYear`. Replace each with `cpiForProduct('fcr' | 'afrr' | 'mfrr')` based on which reserve product's revenue is being computed. Keep aggregate `cpi(sd_ratio)` as fallback for paths that aren't product-specific (if any).

### 2.3 — Scale `R_cap_yr` by bidAcceptanceFactor

In `computeTradingMix` near line 1845, find where `R_cap_yr` is computed (the per-product capacity revenue). Apply:

```js
R_cap_fcr_yr  = R_cap_fcr_yr  * bidAcceptanceFactor(product_sd.fcr.ratio,  'fcr');
R_cap_afrr_yr = R_cap_afrr_yr * bidAcceptanceFactor(product_sd.afrr.ratio, 'afrr');
R_cap_mfrr_yr = R_cap_mfrr_yr * bidAcceptanceFactor(product_sd.mfrr.ratio, 'mfrr');
```

Or whatever the actual variable names are. Read the function in full before editing — the variable structure may differ.

### 2.4 — Tune `act_rate_afrr` in REVENUE_SCENARIOS

**Step 1:** grep current values BEFORE editing. Document them in the Pause B report.

```bash
grep -nE "act_rate_afrr|act_rate_mfrr" workers/fetch-s1.js
```

You'll see something like:
- Line 860: `base.act_rate_afrr: 0.18`
- Line 870: `conservative.act_rate_afrr: 0.X` (find actual)
- Line 881: `stress.act_rate_afrr: 0.Y` (find actual)

**Step 2:** preserve relative ratios between scenarios.

The base 0.18 → 0.25 is locked. For conservative + stress, calculate the original ratio:
- If conservative was `0.18 × R_cons` (where R_cons is some fraction like 0.8), new value is `0.25 × R_cons` (= 0.20)
- If stress was `0.18 × R_stress` (where R_stress ~0.6), new value is `0.25 × 0.6` (= 0.15)

Document the original values + ratios + new values in the Pause B report. Don't just assume my example numbers.

```js
// After tuning (illustrative — replace with actual ratios)
const REVENUE_SCENARIOS = {
  base:         { ..., act_rate_afrr: 0.25, ... },   // was 0.18, locked
  conservative: { ..., act_rate_afrr: 0.20, ... },   // was 0.X, preserve ratio
  stress:       { ..., act_rate_afrr: 0.15, ... },   // was 0.Y, preserve ratio
};
```

### 2.5 — Bump `model_version`

Find the line that sets `model_version: 'v7'` in the response payload. Change to `'v7.1'`.

### 2.6 — Add inline diagnostic field (optional but recommended)

Add to the `/revenue` response payload an explicit `engine_changelog` field that documents what v7.1 changed:

```js
engine_changelog: {
  v7_to_v7_1: [
    'Per-product cannibalization (cpi) replaces aggregate cpi for FCR / aFRR / mFRR',
    'Bid-acceptance saturation modeled in computeTradingMix',
    'aFRR activation rate tuned to 0.25 (Baltic operational baseline)',
  ],
}
```

This is a **changelog field on the payload**, not a methodology essay. Future versions append to it. Operators reading the payload directly see what changed.

---

## 3. Local verification BEFORE production deploy (`wrangler dev`)

Before any production deploy, run the worker locally and verify outputs make sense.

```bash
cd workers
npx wrangler dev --local --port 8787 &
DEV_PID=$!
sleep 5  # give the local worker time to start

LOCAL_URL='http://localhost:8787/revenue'

# Smoke test: each scenario × duration returns valid output
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    echo "--- ${SCEN} ${DUR} (LOCAL v7.1) ---"
    curl -s "${LOCAL_URL}?scenario=${SCEN}&dur=${DUR}" | jq '{
      scenario, duration, model_version, engine_changelog,
      project_irr, equity_irr, min_dscr, gross_revenue_y1
    }'
  done
done

# Compare local v7.1 (local) vs v7-final (production frozen pre-deploy)
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    LOCAL_IRR=$(curl -s "${LOCAL_URL}?scenario=${SCEN}&dur=${DUR}" | jq -r '.project_irr')
    PROD_IRR=$(jq -r '.project_irr' "docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-final.json")
    echo "${SCEN}/${DUR}: prod v7=${PROD_IRR}, local v7.1=${LOCAL_IRR}"
  done
done

# Stop the local worker
kill ${DEV_PID}
cd ..
```

**Sanity checks against local output before proceeding to production deploy:**

- `model_version` returns `'v7.1'` (not `'v7'`)
- `engine_changelog` field is populated with the three change strings
- All 6 scenario/duration combos return valid IRR + DSCR (no nulls except in known-null scenarios like stress.project_irr per audit notes)
- IRR deltas vs production v7-final are in expected direction:
  - Forward-loaded scenarios (later COD years, higher S/D): IRR drops MORE than current
  - aFRR-heavy scenarios: slight IRR boost from rate tune
  - FCR-heavy scenarios: IRR drops more (FCR S/D saturates fastest)
  - Stress scenario: drops more than base
- No deltas larger than ±10pp IRR (anything bigger suggests a bug)
- Local response times are normal (< 2 seconds)

**External-consensus sanity check (CRITICAL deploy gate):**

Industry consensus among Baltic energy consultants and infrastructure funds places BESS IRR for **COD 2027 + low CAPEX (~€110-130/kWh) + base spreads** in the **18–22%** range. KKME's v7.1 should land slightly conservative of consensus — somewhere in **12–18%** for the same configuration — because v7.1's refinements (bid-acceptance saturation, per-product cpi) capture cannibalization more aggressively than typical consensus models do.

```bash
# Probe v7.1 at consensus-comparable configuration
curl -s "${LOCAL_URL}?scenario=base&dur=4h&capex=low&cod=2027" | jq '{
  scenario, cod_year, capex_eur_kwh, project_irr, equity_irr, min_dscr
}'
```

**Acceptance bands for this probe:**

- **`project_irr` between 0.10 and 0.20 (10–20%):** ✅ within consensus neighborhood, refinements are correctly calibrated. Proceed.
- **`project_irr` between 0.08 and 0.10 (8–10%):** ⚠️ on the conservative edge. Acceptable if Kastytis's review at Pause B agrees, but flag explicitly. Proceed only with explicit "go" referencing this caveat.
- **`project_irr` < 0.08 (below 8%):** ❌ DEPLOY BLOCKER. The bidAcceptanceFactor and/or per-product cpi are over-compressing. Stop, investigate, do NOT deploy. Likely fixes:
  - The bidAcceptanceFactor floor (currently [0.30, 0.95]) may be too low — try [0.50, 0.95] and re-test.
  - The per-product cpi may be applying the existing aggregate cpi curve to per-product sd_ratios that are far higher than the curve was calibrated for (FCR sd≈49, aFRR sd≈11 saturate the curve immediately). Curve may need a different floor for per-product application.
- **`project_irr` > 0.22 (above 22%):** ⚠️ refinements too weak / not biting. Investigate whether bidAcceptanceFactor or per-product cpi are actually being plumbed through correctly. Don't deploy until calibration is right.

Run this check across **at least three consensus-comparable configurations:**
- `scenario=base&dur=4h&capex=low&cod=2027` (the headline consensus comparison)
- `scenario=base&dur=4h&capex=mid&cod=2028` (KKME's current displayed default)
- `scenario=base&dur=2h&capex=low&cod=2027` (2h variant)

Report all three IRRs in the Pause B report. The 2027/low-CAPEX value is the deploy gate.

If local verification reveals any of these problems, **stop and investigate**. Do NOT proceed to production deploy until local outputs make sense AND the consensus-comparable IRR sanity check passes.

If local verification is clean, proceed to Pause B.

---

## 3.5 Pause B — show diff before production deploy

After local verification is clean but BEFORE `wrangler deploy` to production:

```bash
git add workers/fetch-s1.js
git diff --cached workers/fetch-s1.js
```

Report to Kastytis:
- Total lines changed (likely 30-80 lines added/modified)
- Each section's line range and what changed
- Any callsites of `cpi(sd_ratio)` that you swapped to `cpiForProduct()` — list them
- The `act_rate_afrr` original values you found via grep + the new values + the preserved ratios
- Local v7.1 vs production v7 IRR/DSCR delta table (from §3 verification)
- Confirmation no cpi breakpoint coefficients were exposed in code comments or commit messages

**Wait for "go"** before deploying to production. This pause exists because:
1. Production deploy is reversible only via `wrangler rollback`
2. The local verification proved the math runs without exceptions but Kastytis is the operational ground-truth on whether the deltas LOOK right
3. Bigger deltas than expected = potential bug; smaller deltas than expected = refinements are weaker than estimated
4. Either way, Kastytis approves the deploy by reviewing the diff + delta table

---

## 4. Worker deploy + verification

```bash
cd workers
npx wrangler deploy
cd ..
```

Capture the deploy version ID from wrangler output. Note it — needed for rollback if anything breaks.

Verify production:

```bash
# All endpoints should return 200
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/health > /dev/null && echo "✓ health"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 > /dev/null && echo "✓ /s1"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 > /dev/null && echo "✓ /s2"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8 > /dev/null && echo "✓ /s8"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/genload > /dev/null && echo "✓ /genload"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue > /dev/null && echo "✓ /revenue"

# v7.1 model_version stamp
curl -s 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue' | jq '{model_version, engine_changelog}'
# Expect model_version="v7.1", engine_changelog populated

# Capture v7.1 fixtures (post-deploy)
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    OUT="docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-1.json"
    curl -sf "https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue?scenario=${SCEN}&dur=${DUR}" -o "${OUT}"
    echo "✓ ${OUT}"
  done
done
```

If any verification fails (endpoint returns non-200, model_version stamps wrong, expected fields missing): **immediately roll back**:

```bash
cd workers && npx wrangler rollback
```

Then report the failure mode to Kastytis. Do NOT proceed to spec updates if verification fails.

---

## 5. Compare v7 → v7.1 deltas

Generate a side-by-side delta report:

```bash
echo "Scenario × Duration | v7 IRR | v7.1 IRR | Δ pp | v7 DSCR | v7.1 DSCR | Δ"
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    V7=$(jq -r '.project_irr // "n/a"' docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-final.json)
    V71=$(jq -r '.project_irr // "n/a"' docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-1.json)
    DSCR_V7=$(jq -r '.min_dscr // "n/a"' docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-final.json)
    DSCR_V71=$(jq -r '.min_dscr // "n/a"' docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}-v7-1.json)
    echo "${SCEN}/${DUR} | ${V7} | ${V71} | ... | ${DSCR_V7} | ${DSCR_V71} | ..."
  done
done
```

**Sanity check the deltas:**
- Forward IRRs should compress more than current (bid-acceptance saturation is forward-loaded)
- aFRR-heavy scenarios benefit slightly from the rate tune (0.18 → 0.25)
- FCR-heavy scenarios should compress more (FCR S/D saturates fastest at smaller MW)
- DSCRs should mostly trend in the same direction as IRRs

If deltas are **larger than expected** (e.g., IRR drops 10pp+) or directionally **wrong** (e.g., IRR rises in stress scenario), pause and investigate. Likely a bug in the bidAcceptanceFactor formula or the per-product cpi plumbing. Roll back if needed.

If deltas are **roughly as expected** (1-5pp IRR shifts, more compression in forward scenarios), proceed.

---

## 6. Update probe specs

`app/lib/__tests__/refinementProbes.test.ts` has 81 specs. Per Session 2's design, four blocks need updating:

1. **`model_version` block** — flip from asserting `'v7'` to asserting `'v7.1'`
2. **Refinement 1.3 block** — flip from "ABSENT (no bid_acceptance fields)" to "PRESENT (engine_changelog mentions bid-acceptance, response payload has product-specific saturation factors)"
3. **Refinement 1.6 block** — flip from "PARTIAL (single aggregate cpi)" to "PRESENT (per-product cpi variants)"
4. **Refinement 1.5 block** — `act_rate_afrr` sanity bound updated (probably from `< 0.20` to `<= 0.25`)

Use the freshly captured v7.1 fixtures as the reference data — `import baseline from '../../../docs/audits/phase-7-7b/baseline-base-4h-v7-1.json'` etc.

The diff in `refinementProbes.test.ts` IS the visible audit trail of what Session 3 shipped. Make the diff legible — comments explaining "v7 said X, v7.1 says Y" inline where the assertion changes.

---

## 7. Update revenueStackFixture spec (if needed)

Session 1's `app/lib/__tests__/revenueStackFixture.test.ts` asserts internal consistency of v7 fixtures (additive invariant, percentage sum, IRR sanity range). The v7.1 fixtures should still satisfy these invariants — the additive sum is still additive, percentages still sum to 1.0, IRRs are still in sane ranges. So the spec likely needs no change.

But: add an extension block to the spec that ALSO asserts v7.1 fixtures' invariants:

```ts
// v7 baseline (Session 1)
import base4hV7 from '...baseline-base-4h.json';
// v7.1 baseline (Session 3 — post-refinement)
import base4hV7_1 from '...baseline-base-4h-v7-1.json';

describe.each([
  ['v7   base 4h', base4hV7],
  ['v7.1 base 4h', base4hV7_1],
])('%s additive invariant', (label, fixture) => {
  // ... same assertions as before
});
```

This way the regression spec covers both vintages.

---

## 8. Pause C — final report

Single commit with:
- `workers/fetch-s1.js` (the v7.1 changes)
- `docs/audits/phase-7-7b/baseline-*-v7-1.json` (6 new fixtures)
- `docs/audits/phase-7-7b/baseline-*-v7-final.json` (6 v7-frozen-pre-deploy fixtures)
- `app/lib/__tests__/refinementProbes.test.ts` (updated probe blocks)
- `app/lib/__tests__/revenueStackFixture.test.ts` (extended for v7.1 if needed)

Commit message: `phase-7-7b(v7.1): per-product cpi + bid-acceptance saturation + aFRR rate tune`.

Worker deploy version ID is logged in the commit body or handover.md (so rollback is one command away if regressions surface later).

Push branch.

Report to Kastytis with:
- Commit hash + worker deploy version ID
- v7 → v7.1 IRR/DSCR delta table for all 6 scenarios
- Probe spec diff summary
- Verification gates (npm test, tsc, next build, prod endpoints all 200)

---

## 9. Hard stops

- **No card edits.** RevenueCard, TradingEngineCard, etc. are untouched. Phase 10 owns the new MetricDisplay rollout that consumes the v7.1 numbers — that work is downstream of this session.
- **No design system changes.** No primitive edits.
- **No new dependencies.**
- **One worker deploy only.** Don't iterate worker changes by deploying multiple times — get the change right in one shot via the Pause B diff review, then deploy once.
- **Don't touch the audit document** at `docs/audits/phase-7-7b/stack-audit.md` or its addendum. Those are the audit record.
- **Don't expose cpi formula coefficients.** No code comments documenting the breakpoints; no commit messages mentioning specific slopes.
- **Don't bump `model_version` past v7.1.** No v7.2 / v8 / etc. — single tick.
- The pre-existing untracked items in working tree are out of scope.
- **If anything looks wrong post-deploy, roll back immediately.** Don't try to "fix forward" mid-session.

**Numerical rules to enforce (from §1b master plan):**
- N-6 methodology version stamp — model_version `v7.1` is the new stamp; `engine_changelog` field is the inline-payload audit trail
- N-9 reconciliation through canonical store — bidAcceptanceFactor + cpiForProduct must be the single canonical helpers; if there are duplicate code paths computing similar things, consolidate them
- N-10 math has unit tests — every formula change ships with a Vitest spec; this session's spec target is `refinementProbes.test.ts` updates

---

## 10. After Session 3 ships

Update `docs/handover.md` Session 17 entry:
- v7.1 deployed; deploy version ID
- 6 v7-final fixtures + 6 v7.1 fixtures committed
- Probe spec diff summary
- v7 → v7.1 IRR/DSCR deltas across all scenarios
- Any anomalies surfaced during the deploy verification

Update `docs/phases/upgrade-plan.md`:
- Phase 7.7b status → `[SHIPPED]` (sessions 1+2+3 closed)
- Phase 7.7c (LCOS, MOIC, real-options optimizer, capital structure controls) becomes the next planned engine work
- Or alternately: Phase 8 Session 3 (Lucide icons + logo) becomes the next CC job if Kastytis prefers to alternate to design

The next CC job depends on Kastytis's call. Author the next prompt only after the v7.1 PR merges and he picks.
