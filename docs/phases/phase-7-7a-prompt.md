# Phase 7.7a — Financial Display Binding

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-7-7a-financial-display` off main (after Phase 8 Session 2 merges).
**Estimated runtime:** 1.5–2 hours.

**Why this phase exists:** Per the engine audit at `reference_engine_audit.md`, the Cloudflare Worker `/revenue` endpoint already produces project-finance-grade output: `project_irr` AND `equity_irr` separately, `min_dscr` + `min_dscr_conservative` + `worst_month_dscr`, OEM-modeled `getDegradation()` curves, 13-month `backtest` array, 6-year `fleet_trajectory` with `cpi` (capacity-payment compression index), 9-cell IRR sensitivity `matrix`, `bankability` flag. The Returns / Trading cards expose only a fraction of this. Phase 7.7a is **pure binding** — make the cards display the rich output the worker already computes.

**Critical context — what this phase is NOT:**
- NOT new engine work. Zero formula changes. Zero `wrangler deploy` calls.
- NOT Monte Carlo (deferred to Phase 7.7c — separate engine architecture work).
- NOT real/nominal indexing (deferred to Phase 7.7c — type-system overhaul).
- NOT PPA/tolling toggle (deferred to Phase 7.7c — wholly new revenue path).
- NOT capital structure live recompute sliders (deferred to Phase 7.7b — needs request-time engine).

If during the work CC discovers a missing field or a bug in the worker math, **flag it in the Pause C report; do not fix it here.** This phase ships display only.

**Read first:**
1. `CLAUDE.md`
2. `docs/phases/upgrade-plan.md` — §1, §1b, §2 Phase 7.7
3. `docs/phases/plan-audit-2026-04-26.md` — Phase 7.7 split rationale (this prompt is 7.7a, the low-risk display half)
4. `.auto-memory/reference_engine_audit.md` — the canonical reference for what `/revenue` returns
5. `.auto-memory/reference_card_inventory.md` — confirms RevenueCard, TradingEngineCard are the active surfaces; S5/S6/S8/etc are retired
6. `docs/handover.md` — most recent entries cover Phase 8 Session 2

**Scope (8 sub-items, all UI binding):**
- 7.7.0 Worker output inventory confirmation (no code change; confirm payload still matches the audit)
- 7.7.1 Project IRR vs Equity IRR split surfaced
- 7.7.2 DSCR triple surfaced (min + conservative + worst-month)
- 7.7.6 Degradation curve chart
- 7.7.10 Sensitivity tornado from existing 9-cell `matrix` field
- 7.7.12 Backtest chart from existing 13-month array
- 7.7.13 Cannibalization curve from existing `cpi` trajectory (proprietary coefficients stay drawer-only per P3)
- 7.7.14 Market thickness label on balancing tiles

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — §1, §1b, §2 Phase 7.7
3. `cat docs/phases/plan-audit-2026-04-26.md` — Phase 7.7 split rationale
4. `cat docs/handover.md` — most recent entries
5. `git log --oneline -10` — confirm `main` has Phase 8 Session 1 + Session 2 commits
6. `git checkout main && git pull && git checkout -b phase-7-7a-financial-display`
7. `git status` — clean working tree (pre-existing untracked items are out of scope)
8. `bash scripts/diagnose.sh` — confirm prod still green
9. `npm test` — establish baseline (should be ~165–175 from Phase 8 Session 2)
10. `npx tsc --noEmit` — clean

**Worker payload audit (7.7.0 — pure confirmation, no edits):**

```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue | jq 'keys'
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue | jq '{project_irr, equity_irr, min_dscr, min_dscr_conservative, worst_month_dscr, bankability, irr_status, backtest: .backtest | length, fleet_trajectory: .fleet_trajectory | length, matrix: .matrix | length, monthly_y1: .monthly_y1 | length, years: .years | length, cpi_at_cod, ch_benchmark}'
```

Verify the audit's claims still hold. If a key is missing or null, flag in Pause A report and pause for guidance — don't proceed if the engine output has drifted from `reference_engine_audit.md`.

Read these files end-to-end:
- `app/components/RevenueCard.tsx` — the primary surface for IRR/DSCR/payback/MOIC (expose 7.7.1, 7.7.2, 7.7.6 here; add new charts as inline sub-components matching the S1Card/S2Card pattern)
- `app/components/TradingEngineCard.tsx` — for market thickness label (7.7.14)
- `lib/useSignal.ts` — fetch pattern; `/revenue` is presumably already polled
- `app/components/primitives/MetricTile.tsx` — extended in Phase 8 Session 2 with optional fan / sampleSize / methodVersion props; use those here where applicable
- `app/lib/format.ts` — the formatNumber utility from Phase 8 Session 2; route every monetary value through it for unit clarity (N-2)

Report state, pause for "go" before editing.

---

## 1. 7.7.1 — Project IRR vs Equity IRR split (~15 min)

**Worker payload:** `data.project_irr` (unlevered project IRR, post-tax) and `data.equity_irr` (levered equity IRR, post-tax). Both are decimals (e.g., `0.1797` for 17.97%).

**Current rendering in `RevenueCard.tsx`:** likely a single ambiguous "IRR" tile. Replace with two tiles side-by-side using the extended `MetricTile`:

```tsx
<MetricTile
  label="Project IRR"
  sublabel="unlevered, post-tax"
  value={formatNumber(data.project_irr, 'irr')}
  unit=""
  dataClass="derived"
  methodVersion={data.model_version}
/>
<MetricTile
  label="Equity IRR"
  sublabel="levered, post-tax"
  value={formatNumber(data.equity_irr, 'irr')}
  unit=""
  dataClass="derived"
  methodVersion={data.model_version}
/>
```

Use the `irr` formatter kind from `app/lib/format.ts`. Sublabels in mono-uppercase per the existing typography ramp.

**Hover tooltip:** explain the convention. "Project IRR is the unlevered cash flow returned to the asset before debt service. Equity IRR is the levered cash flow returned to the equity sponsor after debt service. Convention: post-tax." — but keep tooltip text in `app/lib/financialDefinitions.ts` (per N-11 vocabulary-as-module pattern from Phase 7.6).

**New file: `app/lib/financialDefinitions.ts`** — canonical labels + tooltip text for project IRR, equity IRR, DSCR variants, MOIC, payback. Phase 10 (card overhaul) will route all financial-metric rendering through this.

**Verification spec at `app/lib/__tests__/financialDefinitions.test.ts`:**
- Project IRR label is exactly "Project IRR" (no "Gross IRR" alias permitted — N-11 forbidden-term guard from Phase 7.6.11)
- Equity IRR label is exactly "Equity IRR"
- Sublabel for Project IRR contains "unlevered"
- Sublabel for Equity IRR contains "levered"
- Tooltip strings are non-empty

Commit: `phase-7-7a(7.7.1): Project IRR vs Equity IRR — split via financialDefinitions module`.

---

## 2. 7.7.2 — DSCR triple (~15 min)

**Worker payload:** `data.min_dscr` (base scenario), `data.min_dscr_conservative` (conservative scenario), `data.worst_month_dscr` (worst-month within Y1). All are floats (e.g., `1.92`).

**Render on RevenueCard** as a small DSCR mini-panel with three values:

```tsx
<DSCRPanel
  base={data.min_dscr}
  conservative={data.min_dscr_conservative}
  worstMonth={data.worst_month_dscr}
  covenant={1.20}   // industry standard; document in tooltip
/>
```

Sub-component renders:
- `Min DSCR (base): 1.92×` — `MetricTile` size=md
- `Min DSCR (conservative): 1.52×` — `MetricTile` size=md, muted
- `Worst-month DSCR (Y1): 1.53×` — `MetricTile` size=md, muted
- Horizontal hairline at `1.20×` if a covenant prop is provided, with label "Covenant threshold"

Per N-2: format as `formatNumber(value, 'ratio')` → `'1.92×'` (multiplication sign).

Add definitions to `app/lib/financialDefinitions.ts` for each DSCR variant.

**Spec additions:** DSCR variant labels match canonical names; ratio formatter renders the `×` suffix.

Commit: `phase-7-7a(7.7.2): DSCR triple panel — min + conservative + worst-month`.

---

## 3. 7.7.6 — Degradation curve chart (~20 min)

**Worker:** `getDegradation(year, cyclesPerDay)` is server-side. Engine doesn't currently expose the curve as an array — the array is computed inline. Two options:

**Option A (preferred, doesn't touch worker):** read `data.years` (20-year cashflow array). Each row should have a `retention` or `degradation_pct` field. Inspect via `curl /revenue | jq '.years[0]'` to find the field name. If present: chart it.

**Option B (worker change required, defer):** if `data.years` doesn't expose retention, do NOT modify the worker in this phase. Flag in Pause C; engine extension belongs in Phase 7.7b.

Assuming Option A:

Add new inline sub-component in `RevenueCard.tsx`:

```tsx
function DegradationChart({ years, ttStyle }: { years: YearRow[]; ttStyle: TooltipStyle }) {
  // Chart.js Line chart
  // x = year (1..20), y = retention (1.0 .. 0.7 typical)
  // Reference line at 0.80 (typical "augmentation trigger" threshold)
  // Reference line at 0.70 (typical "end-of-life" threshold)
}
```

Use the existing `useChartColors()` pattern from S1Card/S2Card for theme-aware colors. Use Chart.js (not D3) — matches the existing time-series chart layer.

**Header for the chart:** `STATE-OF-HEALTH TRAJECTORY · OEM curve · LFP 4h`

**Spec at `app/lib/__tests__/degradation.test.ts`:**
- Given a fixture `years` array with retention values, the chart computes the right axis ranges
- The 0.80 and 0.70 reference lines are positioned correctly
- Year-1 retention is ~1.0 (sanity check: degradation starts at 100%)

Commit: `phase-7-7a(7.7.6): degradation curve chart — surface OEM trajectory from years array`.

If Option B applies (no retention field in `years`), commit a small "no-op" with a TODO comment + flag in Pause C.

---

## 4. 7.7.10 — Sensitivity tornado from existing 9-cell matrix (~25 min)

**Worker:** `data.matrix` is a 9-element array (3 CAPEX cases × 3 COD years). Each element has `{capex, cod, irr, dscr, ...}` fields.

**Tornado chart logic:**

1. From `data.matrix`, extract IRR for the base case (mid CAPEX, base COD).
2. For each pivot dimension, compute IRR delta vs base:
   - CAPEX axis: low-CAPEX delta vs base (positive), high-CAPEX delta vs base (negative)
   - COD axis: early-COD delta vs base (negative — earlier COD compresses spreads less), late-COD delta vs base (positive)
   - WACC axis: read from `data.assumptions` if available; else skip
   - Scenario axis: from `data.all_scenarios` — conservative IRR vs base, stress IRR vs base
3. Render as horizontal bar chart, sorted by absolute magnitude. Each bar: a dimension name on the left, a horizontal bar showing IRR delta in pp (percentage points).

**New file:** `app/components/RevenueSensitivityTornado.tsx`. Inline sub-component pattern matching MonthlyTrajectoryChart in S2Card.

**Color rule:** positive IRR deltas in mint, negative in coral (data-state coloring per P1, not editorial — "more IRR" is just a data direction).

**Spec at `app/lib/__tests__/sensitivity.test.ts`:**
- Given a fixture `matrix`, the tornado computes IRR deltas correctly
- Bars are sorted by absolute magnitude
- The base-case row has 0 delta (always)
- Sign convention: lower CAPEX → higher IRR → positive delta

Commit: `phase-7-7a(7.7.10): sensitivity tornado from 9-cell matrix`.

---

## 5. 7.7.12 — Backtest chart from existing 13-month array (~20 min)

**Worker:** `data.backtest` is a 13-month array. Each row has `{month, trading_daily, balancing_daily, total_daily, s1_capture, days}`.

**This is the trust-anchor visualization.** Investor reading "predicted Y1 = €128k/MW/yr; back-test 2025 actual = €131k/MW/yr ; error = -2.4%" thinks "the model is calibrated against reality." Highest credibility-per-pixel ratio in this whole phase.

**New file:** `app/components/RevenueBacktest.tsx`. Inline sub-component or standalone, you call it.

Render:
- Time-series line chart, 13 monthly points
- Two series: predicted (from worker's model) and actual (from `data.backtest[].total_daily`)
- Header: `BACK-TEST · LAST 13 MONTHS · realised vs predicted`
- Side caption: `Mean error: ±X.X%` (compute over the 13 months)

If worker doesn't expose predicted-per-month, just chart the actuals trajectory with a horizontal line at the modeled Y1 average — still informative.

**Spec at `app/lib/__tests__/backtest.test.ts`:**
- Given fixture backtest array, mean-error calculation matches expected
- Chart axis ranges are computed correctly
- Empty backtest array renders fallback "Insufficient history"

Commit: `phase-7-7a(7.7.12): back-test chart — 13-month realised trajectory`.

---

## 6. 7.7.13 — Cannibalization curve from existing cpi trajectory (~15 min)

**Worker:** `data.fleet_trajectory` is a 6-element array. Each row has `{year, sd_ratio, phase, cpi}`.

The `cpi` field IS the cannibalization model output. Per the existing P3 split: chart shape is public (proprietary line shape but no formula coefficients), the formula behind it stays in drawer.

**Render:** small line chart on Returns card OR on a dedicated "Cannibalization outlook" tile. Six points (2026–2031 typical), x = year, y = cpi. Horizontal reference line at 1.0 (today's market). The line falls toward 0.30–0.40 as cumulative storage saturates the market.

**Caption:** `CAPACITY-PAYMENT COMPRESSION · KKME proprietary supply-stack model`. Do NOT publish the breakpoints (0.6 / 1.0 thresholds, 2.5 / 1.5 / 0.08 slopes from the worker source). Drawer-only per P3.

**Spec at `app/lib/__tests__/cannibalization.test.ts`:**
- Given fixture `fleet_trajectory`, cpi values are extracted correctly
- Chart line falls monotonically (typically; worker values may zigzag but for fixture, assert ordering)
- Reference line at 1.0 is positioned correctly

Commit: `phase-7-7a(7.7.13): cannibalization curve — surface cpi trajectory from fleet_trajectory`.

---

## 7. 7.7.14 — Market thickness label on balancing tiles (~10 min)

**Concept (per audit §4.2):** mFRR is a thin market in the Baltics — a 50 MW asset is not strictly a price-taker. aFRR is medium-thick. FCR is the thinnest of all (sometimes Baltic-aggregate, single-buyer). Surfacing this changes how an investor reads the headline numbers.

**Implementation:** small label/badge next to each balancing-product tile in `S2Card.tsx` and / or `TradingEngineCard.tsx`:

```
aFRR | thick   (no warning)
mFRR | medium  (caption: "thinner market — bid-shading recommended")
FCR  | thin    (caption: "very thin market — price-taker assumption breaks for >50 MW")
```

Use a small chip-style badge with text in mono-uppercase. Color via `--text-tertiary` (neutral) — these are descriptive, not editorial.

**Add to `app/lib/financialDefinitions.ts`:** `MARKET_THICKNESS = { afrr: 'thick', mfrr: 'medium', fcr: 'thin' }` plus tooltip text per product.

**Spec:** label values match the canonical map; mFRR and FCR include the warning caption.

Commit: `phase-7-7a(7.7.14): market thickness labels on balancing tiles`.

---

## 8. Pause B — verification + push

After all commits land:
- `npm test` final tally — should be 165–175 baseline + ~30 new (4–6 cases × 6 spec files) = ~195–205
- `npx tsc --noEmit` clean
- `npx next build` clean
- `npm run dev` snapshot check at `localhost:3000`:
  - Returns card shows two IRR tiles (Project + Equity), DSCR triple panel, degradation curve, sensitivity tornado, back-test chart
  - Cannibalization curve visible (either on Returns or its own tile)
  - S2 / Trading balancing tiles show market thickness labels
  - Existing cards still render correctly (no breakage)
- `git push -u origin phase-7-7a-financial-display`

Report to Kastytis with commit hashes, test counts, and a one-line note per sub-item: what got rendered, where, what data field it bound to.

**If during work CC discovers data-shape drift** vs `reference_engine_audit.md` — note in Pause C; the audit memory needs updating.

**Stop here.** Phase 7.7b (engine extensions: LCOS, RTE, MOIC, capital structure) is the next alternate-track CC job; author its prompt only after Kastytis approves this PR.

---

## 9. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- **No worker changes.** Zero `wrangler deploy` calls. If a fix needs worker work, flag it in the Pause C report — defer to Phase 7.7b/c.
- **No card migrations to new design system.** This phase consumes the extended `MetricTile` and new `formatNumber` from Phase 8 Session 2, but does NOT migrate existing card surfaces (Phase 10 owns that). Inline sub-components added to RevenueCard match the existing pattern (look at `MonthlyChart`, `BridgeChart` in S1Card.tsx).
- **No new color values.** Use the existing palette + the `--mint` / `--coral` / `--lavender` tokens from Phase 8 Session 1.
- **No engine extensions.** Specifically NOT in scope: LCOS calculation (7.7b), RTE/availability surfacing (7.7b), MOIC (7.7b), capital structure sliders (7.7b), Monte Carlo (7.7c), real/nominal indexing (7.7c), PPA/tolling toggle (7.7c).
- The pre-existing untracked items are out of scope.
- If budget gets tight (>80%), commit at a clean boundary; write `phase-7-7a-prompt-v2.md` for the remaining items.

**Numerical rules to enforce (from §1b master plan):**
- N-1 vintage glyph mandatory — every monetary value gets `dataClass` prop on MetricTile
- N-2 unit clarity — every value goes through `formatNumber(v, kind)`
- N-4 sample-size N — backtest chart shows "13 months" as N
- N-5 confidence intervals — fan support optional on MetricTile (no Monte Carlo yet, so most are point estimates with `dataClass='observed'` or `'derived'`)
- N-7 timestamp normalisation — backtest x-axis labels in EET, document the convention
- N-10 math has unit tests — every formula change ships with a Vitest spec
- N-11 vocabulary-as-module — financialDefinitions.ts is the canonical naming module, all consumers route through it

---

## 10. After Session ships

Update `docs/handover.md` Session 15 entry:
- 8 sub-items shipped (7.7.0 confirmation + 7.7.1/2/6/10/12/13/14 surfaced)
- Test count: ~165 → ~195
- New module: `app/lib/financialDefinitions.ts` (vocabulary-as-module pattern)
- Verification gates: tsc + next build + npm test all green
- Any anomalies discovered + worker fields confirmed/missing

Update `docs/phases/upgrade-plan.md` § Session log entry: "Phase 7.7a (financial display binding) shipped — Project/Equity IRR split, DSCR triple, degradation curve, sensitivity tornado, back-test chart, cannibalization curve, market thickness labels. Cards visibly investor-grade."

Phase 7.7b (engine extensions) is the natural next alternate-track CC job. Phase 8 Session 3 (icons + logo system) is gated on Kastytis's design-asset decision (audit Q3).
