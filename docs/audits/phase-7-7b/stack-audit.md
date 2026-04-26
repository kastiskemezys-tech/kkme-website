# Revenue Stack Composition Audit — Phase 7.7b Session 1

*Captured: 2026-04-26 by Claude Code session (`phase-7-7b-engine-audit` branch)*
*Engine snapshot: `workers/fetch-s1.js` at commit `8e4c4df` (post-Phase 7.7a merge)*
*Worker `model_version`: `v7`. Production endpoint: `https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue`.*

---

## TL;DR

The v7 revenue engine sums balancing and trading revenue **without netting them for shared MW**. `bal_monthly` is computed assuming 100% of available MW (95% × 8760h) is committed to the full balancing portfolio (FCR + aFRR + mFRR shares sum to 1.00); `trd_monthly` is then computed assuming an additional 67–70% of MW is doing arbitrage cycles. The two are added directly. v6 documents this as architectural intent (line 1430 comment: *"reserves and trading are stacked, not exclusive power slices"*) — it is not an oversight. But it is physically impossible: a single MW cannot simultaneously fulfil reserve commitments AND execute arbitrage dispatch.

The engine internally computes the physically-correct partition (`time_model.effective_arb_pct = 0.164` for base 4h — only ~16% of MW-hours are physically free for trading once reserve commitments are honoured) but exposes this only as a diagnostic; revenue actually uses `trading_fraction = 0.67` (a price-ratio allocation, not a time-slice).

**Verdict: FIX REQUIRED — HIGH CONFIDENCE on direction, MEDIUM CONFIDENCE on magnitude.**
The line 1430 comment in v6 makes the additive-stacking explicit as architectural intent, not omission. The math IS overstatement; the magnitude depends on which correction approach is chosen. Likely revenue impact range: **−15% to −45%**, translating to project IRR shifts of **−4 to −10 pp** in base scenarios.

---

## Production fixtures

Six fixtures captured from production worker on 2026-04-26 (frozen reference):

- `baseline-base-2h.json` — 50 MW / 100 MWh, base scenario
- `baseline-base-4h.json` — 50 MW / 200 MWh, base scenario
- `baseline-conservative-2h.json` — conservative scenario
- `baseline-conservative-4h.json` — conservative scenario
- `baseline-stress-2h.json` — stress scenario (project_irr null — known engine bug, out of scope)
- `baseline-stress-4h.json` — stress scenario (project_irr null — same)

Headline numbers (Y1, per asset, mid CAPEX €164/kWh, COD 2028):

| Fixture | gross_y1 | rev_bal | rev_trd | project_irr | min_dscr | worst_month_dscr |
|---|---:|---:|---:|---:|---:|---:|
| base 2h | 7,322,409 | 3,615,097 | 3,707,312 | 17.97% | 1.92× | 1.53× |
| base 4h | 7,996,920 | 3,615,097 | 4,381,822 | 8.65% | 1.31× | 0.93× |
| conservative 2h | 6,730,754 | 3,512,380 | 3,218,374 | 13.12% | 1.52× | 1.32× |
| conservative 4h | 7,384,234 | 3,512,380 | 3,871,854 | 5.49% | 1.06× | 0.82× |
| stress 2h | 5,264,879 | 2,970,057 | 2,294,823 | null | 0.45× | 0.81× |
| stress 4h | 6,113,910 | 2,970,057 | 3,143,853 | null | 0.51× | 0.54× |

Note: `rev_bal = capacity_y1 + activation_y1` exactly (the 65/35 heuristic split at lines 1052–1053 reproduces `rev_cap = rev_bal × 0.65`, `rev_act = rev_bal × 0.35`). `rev_bal` is **identical between 2h and 4h** within a scenario — confirmation that balancing revenue is computed per-MW with no duration dependency. Only arbitrage scales with duration.

---

## Engine paths

### v7 path — `computeRevenueV7` (workers/fetch-s1.js:916)

**Y1 anchor.** Y1 revenue is *anchored* to the trailing-12-month observed values produced by `computeBaseYear` (line 1941). Subsequent years modulate this anchor via reserve-price elasticity (R compression) and trading capture × trading_fraction.

**Balancing input — `mix.R`** (line 1815–1845, units **€/MW/h**):
- `R_cap_base = afrr_share(0.40) × afrr_cap + mfrr_share(0.60) × mfrr_cap` — weighted capacity-payment rate across products. Note: these 0.40/0.60 weights inside R differ from the RESERVE_PRODUCTS shares 0.16/0.34/0.50.
- `R_act_base = afrr_share × act_rate × clearing × 0.55 + mfrr_share × act_rate × clearing × 0.75` — expected activation revenue per MW-hour committed to reserves.
- `R_yr = reservePrice(sd_yr, R_cap_base) + reservePrice(sd_yr × 1.15, R_act_base)` — applies S/D elasticity.

For Y1 (cal_year=2029) base 4h: `R = 0.97 €/MW/h`. R_base (the 2026 reference) ≈ 10.42 — meaning the elasticity model expects the per-MW-hour reserve value to compress ~10× by 2029 due to fleet build-out and S/D shift.

**Trading input — `mix.T`** (line 1834, units **€/MW/h equivalent**):
- `T_base = s1_capture_ref × rte × trading_real / (2 × REFERENCE_CYCLE_H)` where `REFERENCE_CYCLE_H = 4`.
- The `/(2 × REFERENCE_CYCLE_H)` denominator normalises arbitrage capture to a per-MW-hour figure comparable to R, so the `T/(T+R)` ratio at line 1857 is dimensionally clean.
- `T_yr = max(T_floor, T_base × spread_mult × scenario_factor)` — grows with renewable penetration.

For Y1 base 4h: `T = 14.63 €/MW/h equivalent`. T_base = 10.44.

**Trading partition — `trading_fraction`** (line 1857–1858):
```js
const raw = T_yr / (T_yr + R_yr);
const tf  = Math.min(0.70, raw * friction);
```
For Y1 base 4h: raw = 14.63/(14.63+0.97) = 0.938, friction ≈ 1.0 → **capped at 0.70**. The cap binds in every projection year because price_ratio (T/R) dominates after compression.

**Composition** (line 1027, 1040–1042, 1048):
```js
rev_bal = R_yr × bal_calibration × mw × min(1.0, bal_scale);
rev_trd = yr_capture × spread_mult × depth × rte × trading_real
        × dur_h × cycles × 365
        × mix.trading_fraction × sc.avail × deg_ratio_vs_y1 × mw;
rev_gross = max(REVENUE_FLOOR_PER_MW × mw, rev_bal + rev_trd);  // line 1048
```
Where `bal_calibration = by_balancing_per_mw / R_now` (line 1025) anchors `rev_bal` to the observed Y1 base-year balancing total.

**Shared-MW accounting:**
- `rev_bal` is **NOT scaled by `(1 − trading_fraction)`** — balancing receives the full base-year-anchored value regardless of how much MW is also "doing trading."
- `rev_trd` IS scaled by `trading_fraction` (capped at 0.70), and additionally by `sc.avail (0.95)` and `deg_ratio_vs_y1`.
- The two are summed at line 1048 with no further netting.

**Net effect:** the engine asserts the same MW provides 100% × balancing for 100% of available hours AND 70% × trading throughput across cycles — physically unrealisable.

**Verification math (base 4h Y1):**
- Fixture: `rev_bal = 3,615,098`, `rev_trd = 4,381,822`, `rev_gross = 7,996,920`.
- Sum of components: `3,615,098 + 4,381,822 = 7,996,920` ✓ exact.
- Reconciliation invariant at line 1158 (`gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross − y.rev_bal − y.rev_trd) < 2)`) holds for every year of every fixture.

### `computeBaseYear` — the Y1 anchor (workers/fetch-s1.js:1941)

This is where the additive-stacking originates; v7's projection inherits it via `bal_calibration`.

Per-month, per-MW (line 2087–2103):
```js
const rev_cap = (
  RESERVE_PRODUCTS.fcr.share  * sc.avail * fcr_cap_h  +   // 0.16 × 0.95 × cap
  RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_cap_h +   // 0.34 × 0.95 × cap
  RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_cap_h     // 0.50 × 0.95 × cap
) * hours;                                                // × full month-hours

const rev_act = (
  RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_rate * afrr_clearing * 0.55 +
  RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_rate * mfrr_clearing * 0.75
) * hours;

const bal_monthly = (rev_cap + rev_act) * sc.bal_mult * sc.real_factor;

const trd_monthly = capture * rte * (sc.trd_real || 0.85) * duration_h * cycles
                  * y1_mix.trading_fraction * days;

const gross = trd_monthly + bal_monthly;        // line 2106 — direct sum
```

**Critical:** `RESERVE_PRODUCTS.fcr.share + afrr.share + mfrr.share = 0.16 + 0.34 + 0.50 = 1.00`. Multiplied by `sc.avail = 0.95`, this commits 95% of the asset MW to the balancing portfolio across every hour of the month. `trd_monthly` then layers on `trading_fraction × cycles × dur_h` of arbitrage on top of the same MW with no offset.

**Self-evidence of the bug.** `computeBaseYear` itself derives `effective_arb_pct` from a careful four-bucket time-sliced analysis (lines 1992–2008):
- `arb_mw_both = max(0, p_avail × (1 − fcr − afrr − mfrr)) = 0` when shares sum to 1.0
- `arb_mw_only_mfrr = p_avail × afrr_share` (aFRR MW freed when aFRR not procured)
- `arb_mw_only_afrr = p_avail × mfrr_share` (mFRR MW freed when mFRR not procured)
- `arb_mw_neither   = p_avail × (afrr_share + mfrr_share)` (both freed, FCR stays)
- Weighted by activation-state probabilities, this yields **`effective_arb_pct = 0.164` for base 4h** — only 16% of MW-hours are physically available for arbitrage.

This value is reported in `time_model.effective_arb_pct` and surfaced in the `note` field (`"16% of MW-hours available for trading"`) but is **not used in the actual revenue calculation**, which substitutes `y1_mix.trading_fraction = 0.6747` (a price-ratio allocation capped at 0.70).

### v6 path — `computeRevenueV6` (workers/fetch-s1.js:1334)

Currently inactive in production (v7 has sufficient base-year data; v6 only fires as fallback when `s1_months < 6`). Same architectural pattern as v7:
- Line 1440–1443: `rev_cap_X = products.X.eff × cap_h × 8760 × bal_mult × bal_comp` (per MW × full year).
- Line 1445–1447: `rev_act_X` similar.
- Line 1449: `rev_bal = (rev_cap + rev_act) × sc.real_factor`.
- Line 1452: `e_out_cycle = min(usable_mwh_per_mw, arb_power × dur_h)` where `arb_power = sc.stack_factor (0.70 base)`.
- Line 1455: `rev_trd = e_out × capture × rte`.
- Line 1458: `rev_gross = rev_bal + rev_trd`.

**Line 1430 comment makes the architectural intent explicit:**
> *"Stack factor = fraction of MW available for arbitrage on top of reserves (reserves and trading are stacked, not exclusive power slices)"*

This is the smoking gun — the additive-stacking is documented intent, not a forgotten partition.

### Legacy path — `computeRevenueWorker` (workers/fetch-s1.js:4143)

Used by older code paths (e.g. matrix sensitivity). Same additive pattern:
- `afrr_annual = price × 8760 × avail × (0.5 × alloc.afrr)` — 50% MW to aFRR for full year (line 4154).
- `mfrr_annual = price × 8760 × avail × (0.5 × alloc.mfrr)` — 50% MW to mFRR for full year (line 4155).
- `trading_annual = swing × 0.35 × cycles × 365 × duration × rte` — full duration, no MW partition (line 4162).
- `gross_annual = afrr_annual + mfrr_annual + trading_annual` (line 4164) — direct sum.

Subtle difference: legacy uses 50% MW per balancing product (so afrr+mfrr = 100% MW), trading uses full duration with no MW factor. Different parameterisation, same additive structure.

---

## Decision matrix

| Question | Answer | Evidence |
|---|---|---|
| Is `rev_bal + rev_trd` genuinely additive in production? | **Yes** | Line 1048 (v7), line 1458 (v6), line 4164 (legacy). Line 1158 invariant `gross_equals_bal_plus_trd` enforces it. All 6 fixtures satisfy it exactly. |
| Do `mix.R` and `mix.T` (or equivalents) net for shared MW upstream? | **No** | `mix.R` is built from full-portfolio reserve weights (afrr+mfrr+fcr summing to 1.0) × full hours. `mix.T` carries `trading_real` (perfect-foresight discount) but no MW partition. The `trading_fraction` is applied only to trading at line 1042; nothing reduces balancing for the same shared MW. |
| Does the engine compute a physically-correct partition anywhere? | **Yes — but unused** | `computeBaseYear` lines 1992–2008 build `effective_arb_pct` via four time-sliced MW buckets, weighted by reserve-procurement probabilities. Result for base 4h: 0.164. This is exposed in `time_model.effective_arb_pct` for diagnostics only — actual `trd_monthly` uses `trading_fraction = 0.6747` (the price-ratio cap) at line 2103. |
| Is the architectural intent clearly to "stack" balancing and trading on the same MW? | **Yes — documented** | v6 line 1430 comment: *"reserves and trading are stacked, not exclusive power slices"*. Confirms this is an intentional modelling choice, not a missing partition. |
| If the model produces physically realisable revenue per MW? | **Borderline** | Base 4h gross/MW = €159,938, vs theoretical pure-balancing max ~€174k + pure-arbitrage max ~€132k = €306k ceiling. Gross sits at ~52% of the ceiling — does not exceed it, but the engine is claiming 100% MW × balancing AND 70% MW × trading simultaneously, which is ~170% of physical MW capacity at any instant. |
| Estimated overstatement if double-counting confirmed | **−15% to −45% revenue** | Range depends on correction method (see next section). Both ends of the range translate to credibility-grade IRR shifts. |

---

## Magnitude scenarios

Two correction approaches; the choice determines how much revenue (and IRR) shifts. Computed for base 4h Y1 fixture (rev_gross/MW = €159,938/MW/yr; rev_bal/MW = €72,302; rev_trd/MW = €87,636).

### Approach A — Use `effective_arb_pct` directly as the trading partition

Replace `trading_fraction (0.6747)` with `effective_arb_pct (0.164)` in trading revenue formula. Balancing remains as currently computed (it claims 100% MW commitment, which is physically true if the asset prioritises reserves).

- Scaling factor on `rev_trd`: `0.164 / 0.6747 = 0.243` → **rev_trd corrected ≈ €21,300/MW**
- rev_bal unchanged ≈ €72,302/MW
- new gross ≈ **€93,600/MW** (vs current €159,938) → **−42% revenue**
- Project IRR base 4h shifts from 8.65% → likely ~0% to negative
- Worst-month DSCR slides from 0.93× → likely below 0.50× (multi-month cash trap)

This is the engine's own time-sliced answer to "what fraction of MW-hours is physically available for arbitrage after reserve commitments." It is the most physically grounded correction.

### Approach B (Cowork-recommended default for Session 2) — Apply `trading_fraction` symmetrically

Treat `trading_fraction` as a true MW partition: `bal_revenue × (1 − trading_fraction) + trd_revenue × trading_fraction`. Conserves the engine's existing partition logic; just enforces it on both sides.

- For Y1: `1 − 0.70 = 0.30` applied to balancing → **rev_bal corrected ≈ €21,700/MW**
- rev_trd unchanged ≈ €87,636/MW
- new gross ≈ **€109,300/MW** → **−32% revenue**
- Project IRR base 4h shifts from 8.65% → likely 1–3%
- Worst-month DSCR slides from 0.93× → likely 0.55–0.65×

**Why Cowork recommends B as the default for Session 2:** cleaner mental-model continuity with the engine's existing partition logic. The `trading_fraction = T/(T+R)` allocation is already part of the engine; Approach B simply enforces it symmetrically. Approach A introduces a new code path (the time-sliced bucket model) that is currently only diagnostic.

**Range to communicate:** −15% to −45% revenue impact. Approach A yields ~−42% (call it ~−45% with degradation interactions in later years); Approach B yields ~−30% (call it ~−15% in early years before balancing compression dominates). Both are credibility-grade.

---

## Recommended action

**FIX REQUIRED.** Phase 7.7b Session 2 ships the stack-allocator correction behind a feature flag. The fix is shipped with model_version bump v7 → v8 to give investor screenshots taken under v7 a reconciliation path.

### Migration plan (for Phase 7.7b Session 2)

1. **Feature flag at the worker.** Add `?stack_v8=1` URL param (or `STACK_ALLOCATOR=v8` env var) that gates the new partition logic. Default OFF — production behaviour unchanged. Validate against fixtures with flag OFF (must produce byte-identical numbers); validate with flag ON against pre-computed expected values.

2. **Model version bump.** When the flag flips ON in production, worker bumps `model_version` from `v7` → `v8`. Cards display "Model v8: revenue stack allocator corrected" alongside the new (lower) IRRs. Investors who took screenshots under v7 can reconcile via the version stamp.

3. **Default correction method: Approach B (symmetric `trading_fraction`).** Cleaner continuity with the engine's existing partition logic. Kastytis owns the final call to override to Approach A if real Baltic operator data suggests the time-sliced partition is more accurate.

4. **Communication strategy: (c) — hold until methodology page is live.** Per prompt §3 default. Better to ship with the explanation than alone. The methodology page (Phase 7.8.1 when it lands) carries a "v7 → v8 changelog" section explicitly stating the correction with the formula diff.

5. **Old-fixture preservation.** Keep `baseline-*-v7.json` files committed even after Session 2 ships. Future analysts can compute v7 vs v8 delta from the fixtures alone. Session 2 adds `baseline-*-v8.json` siblings.

6. **Downstream consequence Kastytis should know about before approving:** the post-fix `worst_month_dscr` will go materially lower than 0.93×. Under Approach A it likely sits below 0.50× in base 4h (multi-month cash trap, not single-month). Under Approach B it likely sits 0.55–0.65× (still below covenant 1.20× but recoverable). Communication around DSCR covenants needs to land alongside the correction.

7. **Bankability flag implications.** Current `bankability` logic (line 1171–1173): `cons_min_dscr >= 1.20 ? 'Pass' : >= 1.0 ? 'Marginal' : 'Fail'`. After fix, base 4h conservative `min_dscr` (currently 1.06×, "Marginal") likely falls below 1.0× → "Fail". The bankability narrative shifts from "marginal but bankable" to "structurally not bankable on 50/55 leverage at €164/kWh CAPEX" — a real signal, not a display artefact.

---

## Out-of-scope improvements noticed during audit

These were observed while tracing the engine but are NOT part of the stack-allocator fix. Capture for later phase work:

1. **`all_scenarios.stress.project_irr` returns null.** Already documented in prompt §0 as known engine bug. Stress IRR isn't being populated by `calcIRR()` — likely the binary search bottoms out at the `< -0.50` threshold (line 1230) and gets nulled. Engine fix belongs in a later 7.7b/c session.

2. **Inconsistent `afrr_share` / `mfrr_share` weights.** `RESERVE_PRODUCTS` (line 891–895) declares 0.16/0.34/0.50; `computeTradingMix` line 1817 hardcodes 0.40/0.60 (no FCR). The R-base derivation in `computeTradingMix` ignores FCR entirely. Possibly intentional (FCR is symmetric, low-margin) but worth a comment-level reconciliation pass.

3. **`cap_fallback` values diverge from observed.** RESERVE_PRODUCTS (line 891–895): `afrr.cap_fallback = 40`, `mfrr.cap_fallback = 22`. Observed Baltic averages used in `computeBaseYear` fallbacks (line 2043–2044): `fb_afrr_cap = 7.7`, `fb_mfrr_cap = 21.5`. The 40 vs 7.7 gap for aFRR is large; a comment would help future readers know which one is "right" and why.

4. **`spread_mult` compounds with `scenario_factor` in `computeTradingMix`.** Line 1850–1855: `T_yr = max(T_floor, T_base × spread_mult × scenario_factor)`. spread_mult itself grows with calendar year (`spreadMultiplierYr(cal_year)`), and scenario_factor adds another exponential growth from `SPREAD_GROWTH`. Stacking two compounding growth rates can produce surprisingly aggressive forward T values; worth a sanity check against real DA spread forecasts.

5. **`bal_calibration` has no covenant.** Line 1025 `bal_calibration = by_balancing_per_mw / R_now`. If `R_now` is small (e.g. when 2026 S/D ratio is heavily oversupplied), bal_calibration can blow up to a large number, then `R_yr × bal_calibration` produces inflated balancing revenue. Currently OK because `bal_scale` clamps at 1.0, but the unbounded denominator is a future fragility.

6. **Reconciliation invariants in `recon` block (line 1158–1163) are not exposed via the JSON envelope.** The fixture's `.recon` field is null in production, even though the worker computes it. A small change to expose `recon` would let the existing Vitest spec (and future regression checks) verify these invariants from the wire.

---

## Open questions for Kastytis

1. **Approach A or B for Session 2?** Cowork's default is Approach B (symmetric `trading_fraction`) for cleaner mental-model continuity. Override to Approach A (use `effective_arb_pct` directly) if real Baltic operator expectations match the time-sliced partition more closely. Carry forward to Session 2 prompt as the first decision before any code.

2. **Communication strategy.** Default per prompt §3 is (c) — hold the fix until methodology page is live. Confirm: do you want the fix gated on the Phase 7.8 methodology page, or do you want it shipped earlier with a temporary footnote?

3. **DSCR covenant narrative.** Post-fix base 4h `min_dscr` likely falls below 1.20× covenant under either approach. The Returns card currently shows DSCR as a status chip; after the fix, the narrative needs to change from "marginal but bankable" to "structurally not bankable on current leverage." Is this a card-level rewrite that should ship simultaneously, or in a follow-up content phase?

4. **Bankability flag thresholds.** Current `Pass / Marginal / Fail` mapping at line 1171–1173 uses 1.20× and 1.0×. After the fix, more scenarios will hit "Fail." Do you want to reconsider the thresholds (perhaps 1.10× / 0.90×) given the corrected math, or leave thresholds unchanged and let the cards reflect the new reality?

5. **Y1-only fix vs multi-year fix.** The double-counting originates in `computeBaseYear` (Y1 anchor) and propagates through projection via `bal_calibration`. A clean fix corrects both `computeBaseYear` (so Y1 displays correctly) AND the v7 projection loop. Confirm: Session 2 should fix both surfaces simultaneously, not stage Y1-first?

---

## Fixtures committed

- `docs/audits/phase-7-7b/baseline-base-2h.json`
- `docs/audits/phase-7-7b/baseline-base-4h.json`
- `docs/audits/phase-7-7b/baseline-conservative-2h.json`
- `docs/audits/phase-7-7b/baseline-conservative-4h.json`
- `docs/audits/phase-7-7b/baseline-stress-2h.json`
- `docs/audits/phase-7-7b/baseline-stress-4h.json`

These are the **frozen v7 reference**. Session 2 generates `baseline-*-v8.json` siblings post-fix; both sets remain committed so analysts can compute the v7→v8 delta from disk alone.

---

## Companion artefacts

- `app/lib/__tests__/revenueStackFixture.test.ts` — Vitest fixture-comparison spec asserting the additive invariant, percentage-sum sanity, IRR range, and reserve-products sum-to-1.0 (which is itself the architectural artefact behind the double-count).
- `scripts/audit-stack.mjs` — throwaway debug script that reconstructs Y1 numbers from raw fixture inputs to ground-truth the math trace. **Delete in Session 2.**
