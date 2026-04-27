# Phase 7.7d — Throughput-derived cycle accounting + empirical SOH/RTE calibration

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-7-7d-empirical-calibration` off main (after PR #38 v7.2 has merged).
**Estimated runtime:** ~3-3.5 hours.
**Predecessor:** Phase 7.7c Session 1 v7.2 (commit `9276e55`, worker `e145aeb4-5570-4cdd-adcb-f79351ef33dc`, merged via PR #38).
**Successor candidates:** Phase 7.7c Session 2 (capital-structure sliders), Phase 7.7e (aux-load curve + augmentation modeling + duration-optimizer market-physics).

---

## Why this phase exists

KKME's revenue engine v7.2 has two structural calibration errors and one decoupling bug:

1. **Activation throughput is silently 2-3× too high.** Engine multiplies `act_rate_afrr=0.25` by `8760` hours at full power, treating "in-merit fraction" as "full-power-equivalent hours." Real merchant batteries see ~5-8% of nameplate hours/yr of actual aFRR throughput, not the 25% the parameter implies. Same dimensional error for mFRR. Result: the engine's revenue terms for activation are not crazy (revenue uses the asymmetry factor 0.55 to dampen), but the *implied* cell throughput is ~1,600 MWh/MW/yr when reality is 1,000-1,400.

2. **Cycle count and SOH curve are decoupled.** The engine reports `cycles_per_year = scenario.cycles_2h × 365` (1.5 c/d × 365 = 547 EFCs/yr for base 2h). But its OWN dispatch logic — when revenue terms are unpacked into MWh — implies far more throughput. Meanwhile `SOH_CURVE_W[t]` ages the cells purely by calendar year regardless of dispatch intensity. So a 2h asset run hard at 3 c/d and one run quietly at 1 c/d age along identical curves.

3. **The SOH curve itself is far too shallow.** Empirical median across four Tier 1 LFP integrator binding RFP responses (held privately, gitignored) shows SOH Y10 ≈ 70.5% at 2 c/d. Engine has 90% Y10. ~20pp optimistic.

This phase rebuilds the cycle accounting from energy throughput, replaces the SOH curve with empirical anchors at three test rates (1, 1.5, 2 c/d) interpolated by computed actual cycling, and adds RTE decay. Provenance stamped, anonymized.

---

## Confidentiality discipline (re-stated)

The empirical SOH and RTE anchors below were distilled from a private dataset held in a gitignored directory on the operator's machine (NDA-protected binding RFP responses from four Tier 1 LFP integrators). **Do not commit, log, copy, or reproduce supplier-specific values, supplier names, project specifics, client names, or pricing into any tracked file.** Engine carries only anonymized consensus medians plus public research citations (Modo, Dexter, enspired, MDPI, Gridcog, ENTSO-E).

---

## Public-research anchors (citable, can appear in commits)

Activation throughput per product, Baltic 2h merchant batteries, base scenario 2026:

| Product | MWh/MW-alloc/yr | Source |
|---|---|---|
| FCR (deadband + SoC restoration) | **200** | Modo: cycling-rates research; MDPI 2023 lifetime-multi-service study (M5BAT 0.278 EFC/d) |
| aFRR symmetric (PICASSO) | **475** (Baltic low end of 450-700 range) | Modo Sept 2025 aFRR explainer; Dexter PICASSO/MARI note; GEM PICASSO insights |
| mFRR (MARI, Baltic marginal user) | **125** (low end of 100-250) | Dexter MARI implementation note; Baltic Balancing Roadmap (Elering) |
| DA + ID arbitrage | **700** | Modo cycling research; enspired EU portfolio (mean 0.86, p90 1.03 c/d for active traders) |

Alternative scenario values (conservative / stress) tuned to the same source distributions — 80% / 60% of base.

These are public-research-grade. Cite by URL in the engine constants comment. They are NOT supplier-specific or NDA-bound.

---

## Empirical SOH/RTE anchors (anonymized medians from private dataset)

Cross-supplier consensus median across four Tier 1 LFP integrator binding RFP responses (2026-Q1, 25°C reference, 0.5P), three standard test rates:

| Year | SOH @ 1.0 c/d | SOH @ 1.5 c/d | SOH @ 2.0 c/d |
|---|---|---|---|
| 0 | 1.000 | 1.000 | 1.000 |
| 5 | 0.855 | 0.830 | 0.810 |
| 10 | 0.780 | 0.738 | 0.705 |
| 15 | 0.730 | 0.679 | 0.620 |
| 17 | 0.700 | 0.665 | 0.585 |

RTE BOL @ POI incl aux: **0.86 (median)**. Decay rate: **−0.20 pp/yr** (anchored on cross-supplier POI-level binding curves). Floor at −4pp from BOL.

Availability operational target: **0.97** (binding 98% with 1pp ops haircut).

These anchors do NOT appear with supplier names, project specifics, client names, or pricing in any committed file.

---

## What ships in this session

Single coordinated commit, single deploy. `model_version` bumps `v7.2` → `v7.3`.

1. **7.7d-1 — Throughput-based cycle accounting.** Replace scenario `act_rate_afrr` and `act_rate_mfrr` parameters with absolute `mwh_per_mw_yr_<product>` parameters anchored on the public-research table above. Compute aggregate annual MWh throughput from `Σ allocation_MW × mwh_per_mw_alloc_yr × scenario_factor`, divide by capacity to get total EFCs/yr.

2. **7.7d-2 — SOH 3-curve interpolation.** Replace `SOH_CURVE_W` with three duration-rate-tagged curves (`SOH_CURVE_1CD`, `SOH_CURVE_15CD`, `SOH_CURVE_2CD`) at fixed test rates. Engine interpolates the curve to use based on **computed total c/d** from §1, not duration label. Above 2 c/d: extrapolate from 1.5→2 slope. Below 1 c/d: clamp at 1 c/d curve (suppliers don't certify slower).

3. **7.7d-3 — RTE decay (year-indexed array).** `roundtrip_efficiency` becomes year-indexed, decaying 0.20pp/yr from per-duration BOL (2h: 0.85; 4h: 0.86), floor at −4pp. Same approach as my prior draft — that part was uncontroversial.

4. **7.7d-4 — Availability normalization.** Base 0.95 → 0.97. Conservative 0.94 → 0.96. Stress 0.92 → 0.94.

5. **7.7d-5 — Surface decomposition in `assumptions_panel`.** Show cycle count broken down by product (FCR / aFRR / mFRR / DA+ID arb) so investors see exactly where the EFC count comes from. Add `warranty_status` indicator: `"within"` if total EFCs/yr ≤ 730 (standard warranty cap), `"premium-tier-required"` if 730 < EFCs/yr ≤ 1,460, `"unwarranted"` above.

6. **7.7d-6 — Calibration provenance stamp.** New payload field `engine_calibration_source` documenting per-constant provenance:
   - Public-research anchors (with URLs)
   - Anonymized "Tier 1 LFP integrator consensus, binding RFP responses (2026-Q1), source documents held privately"
   - Last-calibrated date

---

## What's explicitly OUT of scope

- **Aux load temperature curve.** Operator-region-specific RTE adjustment. Deferred to Phase 7.7e.
- **SOH terminal value / floor event modeling.** Augmentation or replacement event when capacity hits supplier-stated floor. Deferred to Phase 7.7e.
- **Augmentation modeling** (Y8-12 capex injection). Deferred to Phase 7.7e.
- **Duration optimizer logic fix beyond what falls out automatically.** Top-N quantile correction, multi-market simultaneous bidding sophistication. Deferred to Phase 7.7e — though the throughput-derived cycles here will *partially* fix the duration optimizer because 4h asset gets less throughput per MWh of capacity than 2h, so its computed c/d lands lower, and its SOH curve interpolates gentler.
- **CAPEX recalibration.** Engine's existing Q1-2026 numbers track current Tier 1 quoting closely.
- **Card-side surfaces.** `RevenueCard` already shows the impact via `assumptions_panel`. The new decomposition (FCR / aFRR / mFRR / DA+ID + warranty status) renders inside the existing panel; no new card components needed.
- **Capital structure sliders** — Phase 7.7c Session 2.

---

## 0. Session-start protocol

### 0.1 Read

1. `CLAUDE.md`
2. `docs/handover.md` — most recent entries (Sessions 19, 20)
3. `docs/phases/upgrade-plan.md` §1, §1b
4. `docs/audits/phase-7-7c/` — read at minimum the v7.2 base/4h fixture (`baseline-base-4h-v7-2.json`) so you know the post-v7.2 IRR / LCOS / MOIC / cycles_per_year numbers your changes will move
5. `.auto-memory/reference_engine_audit.md`
6. `.auto-memory/reference_baltic_bess_operations.md`

### 0.2 Engine code locations

```bash
grep -n 'SOH_CURVE_W\|roundtrip_efficiency\|avail:\|act_rate_afrr\|act_rate_mfrr\|cycles_2h\|cycles_4h\|BESS_WORKER\|model_version\|cycles_per_year' workers/fetch-s1.js
```

Expected hits include:
- `~857-895` REVENUE_SCENARIOS — where `act_rate_afrr / act_rate_mfrr / avail / cycles_2h / cycles_4h / stack_factor` live. Most of this rebuild lands here.
- `~891-895` RESERVE_PRODUCTS — `share` and `dur_req_h` per product. Stable.
- `~1029-1050` Trading revenue computation (uses cycles, RTE, capture).
- `~1238-1252` Response payload assembly. `cycles_per_year` and `assumptions_panel` exposed here.
- `~1294` `roundtrip_efficiency: rte` in payload.
- `~1513` `rev_act_afrr` formula (uses `act_rate_afrr × 8760` — the dimensional bug).
- `~1917` `R_act_afrr_base` analogous expression for monthly path.
- `~2223,2402` more activation references (audit each one).
- `~4232-4260` BESS_WORKER constants (availability, roundtrip_efficiency, capex_per_mw, capacity_allocation).
- `~4262-4267` SOH_CURVE_W array (18 entries).
- `~4297-4310` revenue allocation using availability and RTE.
- `~7554` synthesized snapshot path (uses sc.act_rate_afrr).

### 0.3 Source data discipline

The empirical SOH/RTE/availability anchors above were distilled from a private dataset held in a gitignored directory on the operator's machine. **Do not** read the private directory yourself. **Do not** copy supplier-specific numbers into engine code, comments, tests, audit logs, or commit messages. **Do not** name suppliers, projects, or clients in any tracked file. If you discover an inconsistency that requires checking the private data, ask the operator to verify in chat.

The public-research throughput anchors (§Public-research anchors) ARE citable by URL in code comments — they are publicly published market analyses, not NDA-bound.

### 0.4 Git + production checks

```bash
git checkout main && git pull
git log --oneline -5  # confirm v7.2 (PR #38) is merged
bash scripts/diagnose.sh  # confirm production /revenue still stamps model_version: 'v7.2'
git checkout -b phase-7-7d-empirical-calibration
git status  # clean
npm test  # baseline ~607 tests from end of 7.7c
npx tsc --noEmit  # clean
```

### 0.5 Capture v7.2 baseline fixtures

```bash
mkdir -p docs/audits/phase-7-7d
BASE_URL='https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue'
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    OUT="docs/audits/phase-7-7d/baseline-${SCEN}-${DUR}-v7-2-pre.json"
    curl -sf "${BASE_URL}?scenario=${SCEN}&dur=${DUR}" -o "${OUT}"
    [ -s "${OUT}" ] || { echo "FAIL: ${OUT}"; exit 1; }
    jq -e '.lcos_eur_mwh | numbers' "${OUT}" > /dev/null || { echo "FAIL: missing lcos"; exit 1; }
  done
done
echo "✓ 6 v7.2-pre fixtures captured"
```

**Pause for "go"** before §1.

---

## 1. Pause A — pre-flight + planned-changes summary

Report:
- Test count baseline
- 6 v7.2-pre fixtures captured cleanly with LCOS / MOIC / cycles_per_year populated
- Production /health and /revenue both 200, stamping v7.2
- One-paragraph plan per worker change with line numbers
- For each scenario × duration, **predict the new total EFCs/yr** based on the throughput model (back-of-envelope, not requiring the engine to run): show your arithmetic so the operator can sanity-check before code changes
- Any unexpected discoveries

Wait for "go" before §2 (worker edits).

---

## 2. Worker changes (single coordinated edit)

### 2.1 — Replace `act_rate_*` scenario parameters with `mwh_per_mw_yr_*`

In `REVENUE_SCENARIOS`:

```js
// Throughput per product, MWh/MW-alloc/yr — anchored on Baltic 2h merchant
// research from Modo / Dexter / GEM / enspired. PICASSO live since Apr 2025;
// MARI Baltic-marginal. Numbers tuned to Baltic 2026 expectations.
//
//   FCR (incl SoC restoration around deadband) — Modo cycling research,
//     MDPI 2023 multi-service lifetime study (M5BAT 0.278 EFC/d, 84% participation):
//     https://www.mdpi.com/1996-1073/16/7/3003
//     https://modoenergy.com/research/en/battery-energy-storage-cycling-rates-value-wholesale-frequency-response
//   aFRR symmetric (PICASSO 4-sec resolution, in-merit ×depth combined ~5-8% of nameplate hours/yr):
//     https://modoenergy.com/research/en/germany-september-2025-afrr-explained-ancillary-services-opportunity-grid-frequency-service
//     https://gemenergyanalytics.substack.com/p/picasso-insights-and-data
//   mFRR (MARI 12.5-min, Baltic marginal user — Iberia is the heavy MARI market):
//     https://dexterenergy.ai/news/mari-implementation-across-european-tsos/
//   DA + ID arbitrage (Modo cycling research; enspired EU portfolio mean 0.86 c/d, p90 1.03):
//     https://www.enspired-trading.com/blog/dimensions-of-a-battery
base: {
  // ... existing params ...
  mwh_per_mw_yr_fcr:  200,   // FCR allocation yields ~200 MWh of cell throughput per MW per year
  mwh_per_mw_yr_afrr: 475,   // aFRR symmetric (Baltic low end of 450-700 European range)
  mwh_per_mw_yr_mfrr: 125,   // Baltic marginal MARI participant
  mwh_per_mw_yr_da:   700,   // DA + ID arbitrage (top-quartile active trader)
  // act_rate_afrr / act_rate_mfrr REMOVED — replaced by throughput parameters above
  // ... rest of params ...
},
conservative: {
  mwh_per_mw_yr_fcr:  170,   // ~85% of base
  mwh_per_mw_yr_afrr: 380,   // ~80% of base — lower utilization rate
  mwh_per_mw_yr_mfrr: 100,
  mwh_per_mw_yr_da:   560,   // ~80% of base — less arb opportunity
},
stress: {
  mwh_per_mw_yr_fcr:  140,   // ~70%
  mwh_per_mw_yr_afrr: 285,   // ~60%
  mwh_per_mw_yr_mfrr:  75,
  mwh_per_mw_yr_da:   420,   // ~60%
},
```

The activation revenue formulas in `computeRevenueV7` need to be rewritten to use the throughput parameters. Current formula:
```js
const rev_act_afrr = products.afrr.eff * sc.act_rate_afrr * 8760 * afrr_clearing * 0.55 * sc.bal_mult * bal_comp;
```
becomes:
```js
// Activation revenue = (allocated MW × throughput MWh/MW/yr) × clearing €/MWh × asymmetry × scenario adjusters
// asymmetry 0.55 captures up-vs-down pricing asymmetry only; the throughput already accounts for in-merit fraction × depth.
const afrr_throughput = afrr_alloc_MW * sc.mwh_per_mw_yr_afrr * sc.bal_mult;
const rev_act_afrr    = afrr_throughput * afrr_clearing * 0.55 * bal_comp;
```

Same restructure for mFRR (line ~1917, ~2223, ~2402, ~7554). Audit every site that consumed `sc.act_rate_*` and migrate.

**Sanity check before continuing**: after the rewrite, base 2h scenario rev_act_afrr should be in the same order of magnitude as before (within ±30%). The rewrite is a unit fix, not a parameter retuning. Revenue stays roughly stable; throughput accounting becomes correct.

### 2.2 — Compute total annual EFCs from throughput

In `computeRevenueV7` near `cycles_per_year` payload assembly (currently ~line 1248):

```js
// Throughput-derived cycles. Sums per-product MWh through the asset, divides by
// capacity. Replaces the old "scenario.cycles_2h × 365" assumption.
const fcr_alloc_MW   = MW * RESERVE_PRODUCTS.fcr.share;
const afrr_alloc_MW  = MW * BESS_WORKER.capacity_allocation[`h${dur_h}`].afrr;
const mfrr_alloc_MW  = MW * BESS_WORKER.capacity_allocation[`h${dur_h}`].mfrr;

const fcr_mwh   = fcr_alloc_MW  * sc.mwh_per_mw_yr_fcr;
const afrr_mwh  = afrr_alloc_MW * sc.mwh_per_mw_yr_afrr;
const mfrr_mwh  = mfrr_alloc_MW * sc.mwh_per_mw_yr_mfrr;
const da_mwh    = MW            * sc.mwh_per_mw_yr_da;   // DA arb on full nameplate

const total_mwh_yr      = fcr_mwh + afrr_mwh + mfrr_mwh + da_mwh;
const capacity_mwh      = MW * dur_h;
const total_efcs_yr     = total_mwh_yr / capacity_mwh;
const total_cd          = total_efcs_yr / 365;

const efc_breakdown = {
  fcr:  fcr_mwh  / capacity_mwh,
  afrr: afrr_mwh / capacity_mwh,
  mfrr: mfrr_mwh / capacity_mwh,
  da:   da_mwh   / capacity_mwh,
  total: total_efcs_yr,
};

const warranty_status =
  total_efcs_yr <= 730   ? 'within'                  :
  total_efcs_yr <= 1460  ? 'premium-tier-required'   :
                            'unwarranted';
```

Replace `cycles` in trading revenue formulas with `total_cd` (or `efc_breakdown.da` specifically, depending on whether trading-only or total cycles is the right input). **Audit carefully** — the `capture × cycles × duration` revenue formula is for DA arbitrage specifically, so use `mwh_per_mw_yr_da / 365` not `total_cd` there. Document the choice in a comment.

### 2.3 — SOH curve interpolation by computed c/d

Replace `SOH_CURVE_W` with three rate-tagged curves anchored on private empirical data (anonymized comment only — no supplier names):

```js
// Empirical SOH curves at three standard test rates — cross-supplier consensus
// median across binding Tier 1 LFP integrator RFP responses (2026-Q1, 25°C, 0.5P).
// Source documents held privately, not in this repo. Curves are convex-down (LFP).
const SOH_CURVE_1CD = [
  1.000, 0.967, 0.935, 0.908, 0.882,  // Y0–Y4
  0.855, 0.830, 0.806, 0.785, 0.764,  // Y5–Y9
  0.745, 0.728, 0.713, 0.700, 0.689,  // Y10–Y14
  0.679, 0.671, 0.665,                 // Y15–Y17
];
const SOH_CURVE_15CD = [
  1.000, 0.955, 0.915, 0.880, 0.852,
  0.830, 0.805, 0.780, 0.758, 0.738,
  0.720, 0.703, 0.687, 0.671, 0.658,
  0.645, 0.632, 0.620,
];
const SOH_CURVE_2CD = [
  1.000, 0.945, 0.900, 0.864, 0.830,
  0.810, 0.785, 0.760, 0.738, 0.717,
  0.700, 0.682, 0.665, 0.648, 0.632,
  0.617, 0.602, 0.588,
];

// Interpolate by computed actual cycling rate.
// Above 2 c/d: linearly extrapolate from 1.5→2 slope (suppliers don't certify above 2).
// Below 1 c/d: clamp at 1 c/d (suppliers don't characterize slower than 1).
function sohYr(t, cd_total) {
  const cd = Math.max(cd_total, 1.0);
  if (cd <= 1.5) {
    const f = (cd - 1.0) / 0.5;
    return SOH_CURVE_1CD[t] * (1 - f) + SOH_CURVE_15CD[t] * f;
  }
  if (cd <= 2.0) {
    const f = (cd - 1.5) / 0.5;
    return SOH_CURVE_15CD[t] * (1 - f) + SOH_CURVE_2CD[t] * f;
  }
  // Above 2 c/d: extrapolate linearly from 1.5→2 slope
  const slope = SOH_CURVE_2CD[t] - SOH_CURVE_15CD[t];
  return Math.max(0.40, SOH_CURVE_2CD[t] + slope * ((cd - 2.0) / 0.5));
}
```

Replace every `SOH_CURVE_W[t]` call site with `sohYr(t, total_cd)`. Plumb `total_cd` through to consumers if needed.

### 2.4 — RTE decay (year-indexed array)

```js
// RTE decay 0.20pp/yr — cross-supplier consensus from binding RFP submissions.
// BOL per duration: 2h 0.85; 4h 0.86 (4h asset benefits from lower C-rate stress on PCS).
const RTE_BOL = { h2: 0.85, h4: 0.86 };
const RTE_DECAY_PP_PER_YEAR = 0.0020;

function rteCurveFor(dur_h, lifetime_yrs = 18) {
  const bol = dur_h >= 3 ? RTE_BOL.h4 : RTE_BOL.h2;
  return Array.from({ length: lifetime_yrs }, (_, t) =>
    Math.max(bol - RTE_DECAY_PP_PER_YEAR * t, bol - 0.04)
  );
}
```

Update all engine call sites that consume RTE.

In `assumptions_panel`, expose RTE as `{ value: rteCurveFor(dur_h)[0], decay_pp_per_yr: 0.20, label: 'RTE BOL @ POI incl aux', note: 'Decays 0.20pp/yr per cross-supplier consensus' }`.

### 2.5 — Availability normalization

```js
// base
avail: 0.97,  // up from 0.95
// conservative
avail: 0.96,  // up from 0.94
// stress
avail: 0.94,  // up from 0.92
```

`BESS_WORKER.availability: 0.97` already aligned, no change.

### 2.6 — Surface decomposition + warranty status in `assumptions_panel`

```js
assumptions_panel: {
  rte: { value: rteCurveFor(dur_h)[0], decay_pp_per_yr: 0.20, label: 'RTE BOL @ POI incl aux' },
  cycles_breakdown: {
    fcr:  efc_breakdown.fcr,
    afrr: efc_breakdown.afrr,
    mfrr: efc_breakdown.mfrr,
    da:   efc_breakdown.da,
    total_cd: total_cd,
    total_efcs_yr: total_efcs_yr,
    label: 'Cycles per year (throughput-derived)',
  },
  warranty_status: warranty_status,
  availability: { value: sc.avail, label: 'Availability factor', unit: '%', note: 'Forced-outage + scheduled-maintenance haircut' },
  hold_period: { value: 20, label: 'Hold period', unit: 'years' },
  wacc: { value: sc.wacc ?? 0.08, label: 'WACC', unit: '%' },
}
```

### 2.7 — Calibration provenance stamp

```js
engine_calibration_source: {
  throughput_per_product: 'Modo / Dexter / GEM / enspired research (Q3-Q4 2025) — see worker comments for URLs',
  soh_curves: 'Tier 1 LFP integrator consensus, binding RFP responses (2026-Q1) — source documents held privately',
  rte_decay: '0.20 pp/yr — cross-supplier POI-level binding curves (anonymized)',
  availability: 'Operational target with 1pp haircut from binding 98% floor',
  capex_per_mw: '2026-Q1 Tier 1 quoting, broad market consensus (no change in this phase)',
  last_calibrated: '2026-04-XX',  // session date
  next_review: '2026-Q3 (post-Litgrid 6-month PICASSO data; next supplier price refresh)',
}
```

### 2.8 — Bump `model_version` and append `engine_changelog`

```js
v7_2_to_v7_3: [
  'Cycle accounting rebuilt from throughput: act_rate_* parameters → mwh_per_mw_yr_* with public research provenance',
  'SOH_CURVE_W replaced with three rate-tagged empirical curves; engine interpolates by computed total c/d',
  'roundtrip_efficiency now decays 0.20pp/yr from per-duration BOL',
  'Base availability normalized 0.95 → 0.97',
  'assumptions_panel exposes EFC breakdown by product + warranty_status indicator',
  'engine_calibration_source field added',
],
```

`model_version: 'v7.2' → 'v7.3'`.

---

## 3. Test changes

Empirical recalibration MUST be locked behind unit tests. Three new spec files, ~30 tests.

### 3.1 `app/lib/__tests__/throughputCycles.test.ts`

```ts
describe('throughput-derived cycles per year', () => {
  it('base 2h scenario produces 350-650 EFC/yr (Baltic median band)', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.total_efcs_yr).toBeGreaterThanOrEqual(350);
    expect(r.total_efcs_yr).toBeLessThanOrEqual(650);
  });
  it('base 4h scenario produces fewer EFC than base 2h (gentler cycling)', () => {
    const r2h = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const r4h = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    expect(r4h.total_efcs_yr).toBeLessThan(r2h.total_efcs_yr);
  });
  it('breakdown sums to total', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.fcr + r.afrr + r.mfrr + r.da).toBeCloseTo(r.total_efcs_yr, 1);
  });
  it('stress scenario produces fewer EFC than base', () => {
    const base   = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const stress = computeCycles({ MW: 1, dur_h: 2, scenario: 'stress' });
    expect(stress.total_efcs_yr).toBeLessThan(base.total_efcs_yr);
  });
  it('warranty_status returns "within" for typical Baltic dispatch', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.warranty_status).toBe('within');
  });
});
```

### 3.2 `app/lib/__tests__/sohCurves.test.ts`

```ts
describe('SOH_CURVE_2CD — anchored on 2 c/d empirical median', () => {
  it('Y0 = 100%', () => expect(SOH_CURVE_2CD[0]).toBe(1.000));
  it('Y5 within ±2pp of 81%', () => {
    expect(SOH_CURVE_2CD[5]).toBeGreaterThanOrEqual(0.79);
    expect(SOH_CURVE_2CD[5]).toBeLessThanOrEqual(0.83);
  });
  it('Y10 within ±2pp of 70.5%', () => {
    expect(SOH_CURVE_2CD[10]).toBeGreaterThanOrEqual(0.685);
    expect(SOH_CURVE_2CD[10]).toBeLessThanOrEqual(0.725);
  });
  it('monotonically decreasing', () => {
    for (let t = 1; t < SOH_CURVE_2CD.length; t++) {
      expect(SOH_CURVE_2CD[t]).toBeLessThan(SOH_CURVE_2CD[t - 1]);
    }
  });
  it('convex-down (rate-of-fade decreases with time)', () => {
    const d1  = SOH_CURVE_2CD[1] - SOH_CURVE_2CD[0];
    const d10 = SOH_CURVE_2CD[11] - SOH_CURVE_2CD[10];
    expect(Math.abs(d1)).toBeGreaterThan(Math.abs(d10));
  });
});

describe('SOH_CURVE_1CD — gentler than 2CD at all years', () => {
  it('Y5 within ±2pp of 85.5%', () => {
    expect(SOH_CURVE_1CD[5]).toBeGreaterThanOrEqual(0.835);
    expect(SOH_CURVE_1CD[5]).toBeLessThanOrEqual(0.875);
  });
  it('always above SOH_CURVE_2CD', () => {
    for (let t = 1; t < SOH_CURVE_1CD.length; t++) {
      expect(SOH_CURVE_1CD[t]).toBeGreaterThan(SOH_CURVE_2CD[t]);
    }
  });
});

describe('sohYr(t, cd_total) interpolation', () => {
  it('returns SOH_CURVE_1CD at exactly 1.0 c/d', () => {
    expect(sohYr(5, 1.0)).toBeCloseTo(SOH_CURVE_1CD[5], 5);
  });
  it('returns SOH_CURVE_15CD at exactly 1.5 c/d', () => {
    expect(sohYr(5, 1.5)).toBeCloseTo(SOH_CURVE_15CD[5], 5);
  });
  it('returns SOH_CURVE_2CD at exactly 2.0 c/d', () => {
    expect(sohYr(5, 2.0)).toBeCloseTo(SOH_CURVE_2CD[5], 5);
  });
  it('interpolates linearly between anchors', () => {
    const lo = SOH_CURVE_1CD[5];
    const hi = SOH_CURVE_15CD[5];
    expect(sohYr(5, 1.25)).toBeCloseTo((lo + hi) / 2, 3);
  });
  it('extrapolates above 2 c/d (cell ages faster)', () => {
    expect(sohYr(5, 2.5)).toBeLessThan(SOH_CURVE_2CD[5]);
  });
  it('clamps below 1 c/d', () => {
    expect(sohYr(5, 0.5)).toBeCloseTo(SOH_CURVE_1CD[5], 5);
  });
  it('floors at 0.40 (no negative SOH)', () => {
    expect(sohYr(17, 5.0)).toBeGreaterThanOrEqual(0.40);
  });
});
```

### 3.3 Add directional tests to `v72Metrics.test.ts` for v7.3 movement

```ts
describe('v7.3 directional impact', () => {
  it('cycles_per_year drops by >40% from v7.2 (was over-counting via act_rate × 8760)', () => {
    // v7.2 base/2h reported 547 EFCs/yr (1.5 c/d × 365)
    // BUT internally implied ~1,600 MWh/MW/yr throughput → ~3 c/d realised
    // v7.3 should report ~400-550 EFCs/yr — close to v7.2's reported number
    // but now derived from throughput, not asserted
  });
  it('SOH at Y10 drops from 0.90 to ~0.72 base/2h', () => {
    // Was 0.90 flat across all dispatch intensities.
    // Now interpolated by ~1.3-1.5 c/d realised → ~0.72-0.74 SOH at Y10.
  });
  it('base/2h project IRR moves 2-5pp from v7.2 baseline', () => {
    // Direction depends on which dominates — steeper SOH late-life vs rebalanced cycles.
    // Most likely: IRR drops 2-4pp due to less late-life energy.
  });
  it('warranty_status = within for all base/conservative scenarios', () => {
    // 350-550 EFC/yr should sit comfortably under 730 cap.
  });
});
```

---

## 4. Synthetic-KV probe (audit-stack.mjs --probe-v73)

Add `--probe-v73` flag. Should output:
- Per-scenario per-duration: total_efcs_yr, breakdown by product, warranty_status
- SOH at Y5/Y10/Y15 for each combo (interpolated via sohYr)
- RTE curve Y0/Y5/Y10/Y15
- IRR / DSCR / LCOS / MOIC / duration_recommendation deltas vs v7.2-pre fixtures
- Pass/fail gate: every value within physically reasonable bounds (no negative IRRs unless stress; no IRR > 30%; LCOS in [€60, €200] band — band widened to absorb both steeper SOH AND throughput rebalance; total_efcs_yr in [200, 900]; warranty_status ∈ {within, premium-tier-required, unwarranted}).

Run:

```bash
node scripts/audit-stack.mjs --probe-v73
```

Diff `docs/audits/phase-7-7c/baseline-base-4h-v7-2.json` against the v7.3 production response and report deltas.

---

## 5. Pause B — diff review + IRR delta sanity check

Report:
- Total lines changed in `workers/fetch-s1.js` (~150-200 expected — bigger than the prior draft because of throughput rebuild)
- Each section: line range + what changed
- Test count: 607 → ~640
- For each (scenario × duration) combo, predicted IRR delta vs v7.2 baseline + reasoning
- Cycles per year before vs after, broken down by product
- Warranty status for each combo
- 3 most surprising directional movements

**Wait for "go"** before deploying.

---

## 6. Worker deploy + post-deploy verification

```bash
cd workers && npx wrangler deploy && cd ..
sleep 5
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/health > /dev/null && echo "✓ health"
curl -sf https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue > /dev/null && echo "✓ /revenue"

curl -s 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue' | jq '{
  model_version,
  engine_changelog,
  engine_calibration_source,
  roundtrip_efficiency,
  roundtrip_efficiency_curve,
  capacity_y10,
  irr_2h, irr_4h,
  lcos_eur_mwh,
  moic,
  duration_recommendation,
  assumptions_panel,
  warranty_status
}'
```

Capture v7.3 fixtures into `docs/audits/phase-7-7d/`.

---

## 7. Pause C — final verification + commit

Compare v7.2 fixtures against v7.3 fixtures for all 6 (scenario × duration) combos. Report:

- Project IRR delta per combo
- Equity IRR delta per combo
- LCOS delta per combo
- cycles_per_year before / after / delta per combo
- Warranty status per combo
- duration_recommendation: same / changed
- Bankability flag changes (if any)

Expected pattern (if math is right):
- Cycles per year drops modestly from v7.2 reported (because v7.2 reported 1.5 c/d trading-only; v7.3 reports total ~1.0-1.5 c/d throughput-derived). Some scenarios may rise (4h asset) because v7.2 reported 1.0 c/d trading but real throughput across products is ~0.9-1.1 c/d.
- SOH at Y10 drops sharply (90% → ~70-75%) — biggest single change. Drives most of the IRR move.
- 2h IRRs drop 2-5pp from v7.2 baseline.
- 4h IRRs drop less than 2h (because gentler interpolated SOH curve).
- LCOS rises across the board (less energy delivered = more €/MWh-cycled).
- MOIC drops (less aggregate equity cash flow).
- duration_recommendation may flip to 4h in conservative scenario; base may stay 2h-dominant.
- Warranty status = "within" for base + conservative; possibly "premium-tier-required" for stress (lower mwh_per_mw_yr but also lower availability).

If cycles don't decompose cleanly: bug — throughput accounting wired wrong.
If IRRs don't move: bug — SOH interpolation not connected.
If 4h beats 2h in base: surprising, investigate.

**Wait for "ship"** before final commit.

---

## 8. Final commit + push

Single commit on `phase-7-7d-empirical-calibration`. **Anonymized** commit message:

```bash
git add -A
git commit -m "$(cat <<'EOF'
phase-7-7d: throughput-derived cycle accounting + empirical SOH/RTE calibration

Three structural fixes to engine v7.3:

1. Cycle accounting rebuilt from energy throughput. Replaces act_rate_* params
   (which were silently treating "in-merit fraction" as "full-power hours") with
   absolute mwh_per_mw_yr_<product> parameters anchored on Modo / Dexter / GEM /
   enspired research. Total annual EFCs now derived: Σ allocation × throughput
   ÷ capacity. Decomposition surfaced in assumptions_panel with warranty_status
   indicator.

2. SOH curve replaced with three rate-tagged empirical curves at 1 / 1.5 / 2 c/d
   (cross-supplier consensus median, anonymized). Engine interpolates by computed
   actual c/d. Above 2 c/d: extrapolates. Below 1 c/d: clamps. Connects dispatch
   intensity to cell aging for the first time.

3. RTE decay 0.20pp/yr from per-duration BOL (2h 0.85; 4h 0.86); availability
   normalized 0.95 → 0.97; engine_calibration_source field documents anonymized
   provenance + public-research URLs.

model_version v7.2 → v7.3. ~30 new tests across throughputCycles, sohCurves,
v73Metrics directional. Public-research source URLs in worker constants;
private supplier data references stay anonymized.
EOF
)"
git push -u origin phase-7-7d-empirical-calibration
```

Then PR via GitHub web UI.

---

## 9. Handover update

Append a Phase 7.7d session entry to `docs/handover.md`. **Anonymized** — no supplier names, no project, no client, no pricing. Cover:
- Worker deploy version ID
- Test count baseline → final
- Top 6 IRR deltas (3 scenarios × 2 durations)
- Cycles per year + warranty_status per combo
- Anomalies discovered (if any)
- New backlog items unlocked (Phase 7.7e candidates)

Stop. Do not author Phase 7.7e yet.

---

## Confidentiality discipline (re-stated, end of prompt)

- Public-research throughput anchors (Modo, Dexter, enspired, MDPI, GEM) are citable by URL in code comments.
- Private SOH/RTE/availability anchors stay anonymized in committed code, comments, tests, audit logs, and commit messages.
- No supplier names. No project name. No client name. No pricing. No filenames from private documents.
- If verification of an anchor requires checking the private dataset, ask the operator to verify in chat — do not read the private directory yourself.
