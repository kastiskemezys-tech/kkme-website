# KKME Upgrade Master Plan

**Status snapshot (2026-04-26):**
- F1–F4 + F5-lite shipped on `phase-7-5-F-card-redesign` branch (3 commits ahead of origin pre-merge). PR #27 was merged earlier; new PR needed for F5-lite + doc updates.
- **Six reviews absorbed:** (1) short UX/UI audit, (2) 10× dev+designer plan, (3) brand & graphic design plan, (4) deep numerical audit, (5) visual & gamification layer, (6) finance/energy/economics/math correctness audit.
- Review (6) reshuffled the roadmap meaningfully — Phases 7.7 (financial model exposure + bankability), 7.8 (methodology + glossary + citations), 7.9 (sharability + data states) inserted BEFORE Phase 8 design foundation. Reviewer's verdict applied: "if numbers are wrong, no visual polish helps."
- Phase ordering: F5-lite → 7.6 numerical reconciliation → 7.7 bankability → 7.8 trust foundation → 7.9 sharability → 8 design foundation → 9 identity → 10 cards → 10.5 content → 11 layout/mobile → 12 intel → 13 distribution → 14 IA/A11y → 15 eng rigor → 16 press → 17 engagement.
- Each phase from 7.6 onward starts on a fresh branch off main.
- Living tracker — check off, strike through, don't archive.

---

## 1. Confirmed principles (locked 2026-04-26)

**P1 · Sentiment color grammar — ADOPT, applied as DATA not opinion.**
> Use the brand palette (mint / amber / coral / lavender / sky). Color encodes data *state*, not editorial favorability. Mint=expansive, amber=tight, coral=extreme, lavender=modelled. The result should look LinkedIn-shareable, easy on the eye — but every choice resolves to a data state, not a judgment.

**P2 · Numbers as display type — 56px mono middle-ground.**
> 56px mono with tabular-nums and optical-size axis tuned for display. If cards feel magazine-y at 56px, drop to 48; if forms-y, push to 64. Test visually before committing the ramp.

**P3 · Methodology — SPLIT.**
> Commodity formulas (gross capture, RTE convention, DA peak-trough math, gas-+-carbon ceiling derivation) get public permalink pages with Schema.org Dataset markup. Proprietary analytics (regime thresholds, derived signal definitions, KKME's interpretation layer) stay sparse and behind drawers. SEO surface for textbook content, withholding for the actual moat.

**P4 · Brand position — ENDORSED.**
> "Engineering schematic meets Baltic modernist editorial. Pixel/dot-grid as motif. Mono and serif as twin voices. Numbers are the heroes; everything else is supporting cast." Every Phase 8+ prompt opens with this one-sentence brief.

**P5 · Live ticks — YES, no sound.**
> Live tick animations on actual data refresh: number crossfade, 1px mint underline pulse, 800ms decay. NOT constant ticking — the cadence is honest (5–20min refresh, animation fires when fresh data lands). No audio.

**P6 · Sound — NEVER.**
> Confirmed: no audio cues, ever.

**P7 · Engagement layer — LOCKED, calibration-style only, fully opt-in.**
> Adopted: daily regime call, Friday digest with 5-question quiz, private accuracy ledger, anonymous aggregate community signal (always-on stat + quarterly post), educational dispatch challenge. All anonymous by default; optional email subscription only for the Friday digest. No public leaderboards, no streaks, no levels/XP/badges, no profile system, no "Day X of regime" cute counters.
>
> **Hard rule (the non-negotiable):** gamification must be **invisible to users who don't engage**. No nags, no popups, no "haven't taken today's call yet!" reminders, no UI bloat from engagement metadata. The default reader experience is unchanged from a passive data dashboard. Engagement features exist as small, opt-in entry points — never as forced surfaces.
>
> No daily push to non-subscribers. No banner growth-hacks. No friction to dismiss. If a user wants to ignore the engagement layer entirely, they should never notice it exists.
>
> Year-in-review (Phase 18) is NOT scoped — added to backlog. Build only after Phase 17 ships and produces measurable engagement signal. Don't build infrastructure betting on traction we haven't observed.

---

## 1b. Cross-cutting numerical rules (apply across all phases)

These rules emerged from the deep numerical audit (§0). Every phase touching numbers respects them. Phase 7.6 establishes them; Phase 8 builds them into primitives so they're enforced by default.

**N-1 · Vintage glyph mandatory.** Every monetary or quantitative value carries a one-letter vintage glyph: **O** observed, **D** derived, **F** forecast, **M** model-input. Color-coded per palette. Renderer rejects unstamped numbers.

**N-2 · Unit clarity.** `€/MWh` (energy) ≠ `€/MW/h` (capacity-payment-rate) ≠ `€/MW/day` ≠ `€/MW/yr`. Never use `€/MWh` for a capacity payment. Type system enforces unit on `Metric` interface; runtime renderer rejects unitless values.

**N-3 · Annualised twin.** Any primary value in `€/MW/day` or `€/MWh` renders a muted `× 365` (or `× cycles/yr`) companion immediately below. Reader doesn't have to do mental math 20× per page.

**N-4 · Sample-size N.** Any rolling stat declares its window: `30D · 720 hourly obs` or `7D rolling P50, weekday-only`. No stat lives without a denominator.

**N-5 · Confidence interval on derived/forecast.** Anything `D` or `F` carries a P10/P50/P90 fan or ±band. Point estimates allowed only for `O` (observed) values.

**N-6 · Methodology version stamp.** Every computed value traces to a methodology hash (`v7 · S1 €32/MWh · S2 aFRR €14`). When the formula changes, the stamp bumps; reader can see what shifted between vintages.

**N-7 · Timestamp normalisation.** Relative for ≤24h ago; absolute UTC ISO8601 with timezone for >24h. Always show the timezone — Baltic markets straddle EET, the site must say which timezone is implied.

**N-8 · Availability haircut on theoretical annualised numbers.** Any "asset earns €X/year if it always clears at today's rate" gets two values: theoretical maximum + realistic 60–80% haircut. Or label the headline explicitly as theoretical.

**N-9 · Reconciliation through a single canonical store.** When the same metric (capture, dispatch, fleet, pipeline, IRR) appears in multiple surfaces, all surfaces read from one canonical computation. Variants get distinct names. Phase 15.1 (`useScenario()` for scenario-state) and a sibling `useMetric()` store (for canonical metric values) together implement this — `useScenario()` owns user-set knobs (duration / capex / cod / scenario / country / product), `useMetric()` owns the resolved values keyed by `(metric_id, scenario_hash)`. Both bound to URL.

**N-10 · Math has unit tests.** Every financial formula (LCOS, IRR, DSCR, gross→net bridge, annualisation, RTE convention) has a Vitest spec. Formulas are the actual product; an off-by-one destroys credibility. Phase 15.5 establishes the testing harness; Phase 7.6 fixes ship with their own spec coverage.

---

## 2. Roadmap

### Phase 7.5-F5-lite — Close out card surgery [IN FLIGHT]

**Branch:** existing `phase-7-5-F-card-redesign` (PR #27).
**Why slim:** Original F5 included today-row + chart geometry + dotted-underline + drawer-prose-trim + math fix + freshness fix + regime neutral. Of those, 3 will be entirely redone in Phase 9–10 with new primitives (today-row → MetricDisplay; chart geometry → consolidated chart layer; dotted underline → new affordance grammar). Keep only the items that won't be redone.

- [ ] **F5-lite.1 — Gross→Net bridge math fix.** RTE 12.5% loss can't be €0. Investor-IC catches this in 30 seconds. Verify in worker payload before patching; could be display-rounding or genuine formula error.
- [ ] **F5-lite.2 — Freshness chip thresholds.** `<1h LIVE / 1–6h RECENT / 6–24h TODAY / >24h STALE / >72h OUTDATED`. Apply to S1/S2; templates the pattern for Phase 12. Add absolute timestamp on hover.
- [ ] **F5-lite.3 — Drawer prose trim.** WHAT 1–2 sentences, HOW 3 short bullets. Strict cut per the F5 spec (delete: "why distribution matters", "2h vs 4h trivia", "Data ends at T-1", revenue thought experiments). Note: drawers themselves get rebuilt in Phase 10, but the prose discipline is a permanent rule going forward.
- [ ] **F5-lite.4 — Resolve PR #27 conflict.** Take branch version of `phase7-5-F-resume-prompt.md`. Merge to main.

**Prompt:** `docs/phases/phase7-5-F5-prompt.md` (slimmed to lite scope)

**Estimated effort:** ~1 hour CC session.

---

### Phase 7.6 — Numerical Reconciliation (BEFORE any redesign work)

**Branch:** new `phase-7-6-numbers` off main.
**Maps to:** Deep numerical audit §0, §1–§21, §23 quick-fixes 1–4.
**Why this comes before Phase 8:** the deep audit catches ~20% of numbers as mathematical or labelling errors, ~35% as cross-card reconciliation failures. Industry experts catch each in 30 seconds. Doing the redesign on top of broken numbers wastes the redesign. Fix the data layer first; design on top of trusted numbers.

**Prerequisite (do this first):**

- [x] **7.6.0 — Vitest harness setup.** `npm i -D vitest @vitest/ui`, basic `vitest.config.ts`, one passing smoke test. Every fix below ships with at least one spec covering the formula. Phase 15.5 generalises later; 7.6 just needs a working harness.

**Bug-class fixes (do all of them; each is small):**

- [x] **7.6.1 — Ticker unit error.** `AFRR €5.64/MWh` and `MFRR €11.6/MWh` should be `€/MW/h`. Capacity payments are €/MW/h, not €/MWh. This is the single fastest credibility leak — fix everywhere this confusion appears (ticker, hero KPI strip, anywhere reserves are quoted in energy units).
- [x] **7.6.2 — Peak Forecast `-33%` mislabel.** Spread is €171 (peak €187 − trough €16); calling it `-33%` is undefined. Investigate origin (likely a delta-vs-something computation gone wrong). Replace with the correct delta + label.
- [x] **7.6.3 — Operational fleet inconsistency.** Hero says 822 MW operational; Build card says 651 MW (484 LT + 40 LV + 127 EE) + 255 MW under construction. Reconcile to a single canonical number with a date and per-country breakdown sourced consistently.
- [x] **7.6.4 — S/D ratio formula display.** Build card says `1.81× S/D` with operational 822 MW, pipeline 1,083 MW, demand 752 MW — none of these inputs ratio to 1.81×. Either the formula is documented and the inputs are wrong, or the ratio is right and the formula isn't shown. Surface the formula explicitly: e.g. `S/D = (operational + construction × 0.8 + grid-agreement × 0.4) / system flexibility demand`.
- [x] **7.6.5 — Solar 61% renewable share sanity-check.** Audit flags this as implausibly high (Baltic installed solar ~1.5–2 GW; 61% of 2.6 GW load = 1.6 GW is at the absolute peak of capacity). Verify against ENTSO-E. Fix if it's a unit/window error; keep with footnote if real-but-unusual.
- [x] **7.6.6 — Dispatch chart y-axis unit.** 24-bar chart shows ~€1,750/MW/h peak which can't be right (would imply €12k+/MW/day, far above the €292/MW/day headline). Audit the y-axis unit, label clearly, and ensure the integration of the bars equals the headline.
- [x] **7.6.7 — CAPEX-IRR sensitivity.** €120/kWh and €164/kWh both yield 8.6% IRR per the Returns sensitivity panel. The model isn't responding to its own input. Investigate: real bug in the IRR computation, or display bug in the panel (showing the same value across rows)?
- [x] **7.6.8 — Capture price reconciliation.** S1 says €36/MWh today gross 2h capture; ticker says €32; Spread Capture says €167.5 for 4h. Different windows / different methodologies, but presented as if interchangeable. Define a canonical "today's capture" with explicit window + duration in every surface, or rename non-canonical values so they don't compete with the headline.
- [x] **7.6.9 — Dispatch price reconciliation.** €292 / €311 / €371 / €373 all appear as "today's dispatch" across cards. Pick one canonical value with a single methodology, mark variants as derived.
- [x] **7.6.10 — Pipeline number reconciliation.** 1.08 GW / 1.4 GW / 3.7 GW / 1.5 GW APVA all appear as "pipeline." Each has a real meaning; the names should differ. Audit recommends a credibility-tiered funnel — but for 7.6 just LABEL each correctly so the user can tell what they're reading.
- [x] **7.6.11 — IRR label consistency.** "Gross IRR", "Project IRR", "Unlevered IRR", "Equity IRR" all appear, sometimes for the same number. Standardize: unlevered project IRR = single label for one definition; equity IRR = the post-debt levered case. Use one term in every surface.
- [x] **7.6.12 — Gross→Net bridge: SHOW THE WORK.** Audit clarified the `+€0` is mathematically correct (RTE × €0 trough = €0). The fix is to display the formula even when the output rounds to zero: e.g. `RTE loss = 12.5% × charge price (€0 today) = €0; on a typical day with €30 charge, RTE loss ≈ €4/MWh.` This rule is now in F5-lite.1.
- [x] **7.6.13 — S1 distribution skew investigation.** Mean €129 < median €137 over a 30-day window is anomalous (arbitrage spreads are nearly always right-skewed). Investigate whether mean and percentiles use different sample windows or aggregation methods. **Action:** if it's a sampling-window mismatch (computation artifact), fix the aggregation. If the data really is left-skewed, document with a footnote on the card and ship as-is.
- [x] **7.6.14 — Hour labelling (S1 peak h0).** Peak hour at h0 (midnight UTC, 2am EET) is unusual for daily peak. Verify the hour-indexing convention; fix if labels are off-by-one.
- [x] **7.6.15 — Activation-rate display.** 49% activation rate per Trading card is high for European aFRR (typical 20–40%). Either a Baltic specificity worth flagging or a definition mismatch. Document the methodology explicitly.
- [x] **7.6.16 — Time-stamp normalisation.** Mixed formats across the page: `28h ago`, `26 Apr 11:00`, `Apr 26, 2026`, `5 days ago`, `2025-04`. Pick one rule globally — relative for ≤24h, absolute UTC otherwise — and always show the timezone (UTC vs CET vs EET; Baltic markets straddle EET).
**Cross-cutting display rules — DEFERRED to Phase 10:** the annualised-twin rule (N-3) and availability-haircut rule (N-8) are display behaviors implemented via `<AnnualisedTwin>` and `<HaircutToggle>` primitives in Phase 8.3, then applied card-by-card during Phase 10's MetricDisplay rollout. Implementing them inline in 7.6 would be wasted work since the primitives replace the inline implementation immediately after.

**Verification gate per fix:** every numerical fix ships with a Vitest spec covering the formula (using the harness from 7.6.0). The audit's closing point — "credibility compounds; first error discounts everything else by 30%" — means we don't ship reconciliation work that itself has math errors.

**Estimated effort:** 3 CC sessions. Session 1: 7.6.0 setup + 7.6.1–7.6.7 (the obvious bug-fixes with smaller blast radius). Session 2: 7.6.8–7.6.13 (the cross-card reconciliation work + IRR sensitivity investigation, which is the riskiest item). Session 3: 7.6.14–7.6.16 + verification + commit.

---

### Phase 7.7 — Financial Model Exposure + Bankability Gaps

**Branch:** new `phase-7-7-bankability` off main (after 7.6 merges).
**Maps to:** Bankability audit (review 6) §2 (finance correctness), §4 (economics), §5.8 (back-test).
**Engine audit (done 2026-04-26 in Cowork — see below for findings):** the worker `/revenue` endpoint is FAR more sophisticated than the cards expose. ~80% of what review 6 flagged as missing is actually a UI display gap, not an engine gap. Phase 7.7 is mostly binding existing rich payload to the cards + filling 5 real engine gaps.

**Engine audit summary:**
- **Already in payload (just not on cards):** `project_irr` AND `equity_irr` separately, `min_dscr` + `min_dscr_conservative` + `worst_month_dscr`, `bankability` flag, `irr_status`, `payback_years`, `simple_payback_years`, full Y1 revenue split (`capacity_y1` / `activation_y1` / `arbitrage_y1` / `ebitda_y1` / `rtm_fees_y1`), 13-month trailing **`backtest`** array, 6-year `fleet_trajectory` + `cpi` per year (capacity-payment compression IS modelled), `all_scenarios` (3 scenarios), `crossover_year` + `revenue_crossover_year` + note, `ch_benchmark` (Swiss comparator) + `eu_ranking`, `irr_2h` AND `irr_4h` dual-duration, `monthly_y1` (12-month Y1), 20-year `years` cashflow, `live_rate` (dict), `deltas`, `forward`, `reconciliation`, `signal_inputs`.
- **Genuinely missing from engine:** LCOS (€/MWh-cycled), MOIC, Monte Carlo P10/P50/P90 fans, real-vs-nominal explicit metadata (`priceBase: "EUR2026"`), cannibalization elasticity surface (the `cpi` trajectory exists but isn't framed as a cannibalization curve), sensitivity tornado output (9-cell matrix exists; tornado visualization extracts from it).

**Why parallel-with-Phase-8 (decision B locked):** ship design and bankability simultaneously. Phase 7.7's exposure work has minimal engine-build dependency; Phase 8's design system has minimal data-binding dependency. Solo bandwidth = alternating CC sessions between tracks.

- [ ] **7.7.0 — Worker output inventory CONFIRMATION.** Engine audit was done in Cowork. CC's task: re-run `curl /revenue | jq` to confirm payload still matches summary above; confirm S3-utils, S4-utils, S7-utils, S9-utils are reading from `/revenue` correctly. Note any payload drift since 2026-04-26. Output diff at `docs/phases/phase-7-7-worker-inventory.md` only if drift is found.
- [ ] **7.7.1 — Surface Project IRR vs Equity IRR split.** Returns card displays both side-by-side with badges: `Project IRR (unlevered, post-tax, real)` and `Equity IRR (levered, post-tax, nominal)`. Currently shown as a single ambiguous "IRR" — this is the audit's #1 financial-correctness gap. If worker only outputs one variant, add the missing one (engine likely already supports it; just bind it to UI).
- [ ] **7.7.2 — Surface DSCR explicitly.** Min DSCR + Avg DSCR + LLCR (Loan Life Coverage Ratio) on Returns card. Banks underwrite to DSCR, not IRR. Worker has `min_dscr` already; surface it. Add hover with debt assumptions (gearing, tenor, all-in rate).
- [ ] **7.7.3 — Surface LCOS as headline.** LCOS (€/MWh-cycled) is the cross-tech comparator every analyst computes. Should be a prominent tile in Returns or its own card. Formula: `(CAPEX·CRF + Fixed O&M + Variable O&M·cycles + Charging cost) / annual MWh discharged`. If worker outputs it via `lcos_reference`, surface it; if not, compute from existing inputs.
- [ ] **7.7.4 — Capital structure controls.** Returns sub-panel: gearing slider (0–80%, default 60%), tenor (5/7/10/12/15y, default 10y), all-in rate (EURIBOR + spread, default `+ 250bps`), recompute Min/Avg DSCR + LLCR live. Worker likely supports the levers via existing scenario inputs; if not, add to engine.
- [ ] **7.7.5 — Surface RTE + auxiliary load + availability.** RTE (0.86 AC-AC default, declining 0.5%/yr) + parasitic load (1.5% of throughput) + availability (97% default) all visible somewhere — likely on a Build card sub-panel or Returns assumptions panel. Worker has RTE; verify availability + auxiliary are modelled or add them. Without these, current revenue is overstated by ~14%.
- [ ] **7.7.6 — Surface degradation curve.** Worker has `getDegradation()` already — add a small chart on Returns showing SoH vs year curve, with augmentation toggle (overbuild + fade to 70% SoH OR periodic module replacement). This separates a marketing site from an asset-management site.
- [ ] **7.7.7 — Revenue stack allocator (verify; the engine has `capacity_pct` / `activation_pct` / `arbitrage_pct` summing to 1.0, suggesting pre-allocated, but math needs confirmation).** Read `computeRevenueV7()` in worker. Confirm whether the three percentages represent (a) allocation of total MW-hours to each market (correct, no double-counting) OR (b) revenue contribution of each market computed independently then summed (additive, would double-count). If (b): replace with greedy max-per-hour allocator: `revenue ≤ Σ_t max_m(price_{m,t}) × MW × Δt`. Document as `lib/revenueStack.ts` with Vitest spec. **If this fix lands, every IRR on the site shifts down 10–25%.**
- [ ] **7.7.8 — Real vs nominal + inflation indexing.** Every monetary figure carries a `priceBase: "EUR2026"` attribute. Inflation slider (default 2.0%) and effective tax rate (LT 15% / LV 20% / EE 22%) — country-specific. Worker likely treats most numbers as nominal currently; document and surface the convention.
- [ ] **7.7.9 — Payback / MOIC / cash-on-cash year-1.** Equity investors look at multiple-of-money and cash yield. Add Payback (yrs) + MOIC (×) + Y1 cash yield (%) to Returns. Worker should support; add if missing.
- [ ] **7.7.10 — Sensitivity tornado chart.** Standard PF deliverable. IRR sensitivity (±20%) to: CAPEX, RTE, DA spread, aFRR capacity price, cycles/day, WACC, degradation rate. Sort by impact magnitude. Compute by perturbing existing engine inputs.
- [ ] **7.7.11 — P10/P50/P90 Monte Carlo (genuine new engine work).** Run 1,000-iteration MC on price volatility (σ from historical) and degradation, output P10/P50/P90 IRR and DSCR; display as fan chart per N-5. This is THE new engine work in 7.7 — most other items are exposure.
- [ ] **7.7.12 — Back-test against historical years.** Run dispatch model on 2023 and 2024 historical prices; compare to known reference (Nordic comparator if no Baltic public data). Display: `Back-test 2023: predicted €/kW-yr = 78, actual = 81, error = -3.7%.` Single chart converts marketing site to evidence-based one. Worker has `backtest` array — extend.
- [ ] **7.7.13 — Cannibalization / merit-order erosion (CONFIRMED — engine has the model).** Worker at `workers/fetch-s1.js:211-217` defines `cpi` = capacity-payment index, indexed to S/D ratio across three phases (SCARCITY / COMPRESS / MATURE). Applied as a multiplier on fcr_rev / afrr_rev / mfrr_rev / afrr_act / mfrr_act at lines 2392-2398. The `fleet_trajectory` array projects cpi forward 6 years. **Engine work is done.** Phase 7.7.13 task is purely surface: render the cpi trajectory as a "revenue compression vs storage maturity" curve. Per P3: chart's curve SHAPE is public; the cpi formula coefficients (1.0/2.0/0.30/0.40 thresholds, the 2.5/1.5/0.08 slopes) stay in drawer marked "KKME proprietary supply-stack model." Don't publish the breakpoints.
- [ ] **7.7.14 — Market thickness badge.** Each balancing tile gets `Thick / Medium / Thin` label with implied bid-shading rules. mFRR is thin; price-taker assumption breaks down for a 50 MW asset. Documented in `/methodology` (Phase 7.8).
- [ ] **7.7.15 — Real-options duration toggle.** "Given current and forward spreads, which duration (2h/4h/8h) maximizes NPV?" Output a clear recommendation. Existing scenario engine likely supports; add the comparison logic.
- [ ] **7.7.16 — PPA / tolling structure scenario toggle.** Merchant / Tolling / Hybrid — three different IRR distributions. Tolling caps upside but de-risks revenue; relevant for IC committees.

**Verification:** every formula change has a Vitest spec (Phase 7.6.0 harness). Engine changes deployed via `wrangler deploy` and verified against historical inputs (back-test catches regressions).

**Estimated effort:** 3 CC sessions (revised down from 4 after engine audit confirmed most work is binding, not engine-building):
- **Session 1 — Display work, low risk:** 7.7.0 confirmation + 7.7.1 (IRR split, both already in payload) + 7.7.2 (DSCR triple, already in payload) + 7.7.6 (degradation chart, `getDegradation()` exists) + 7.7.10 (sensitivity tornado from existing 9-cell matrix) + 7.7.12 (back-test chart from existing `backtest` array) + 7.7.14 (market thickness label).
- **Session 2 — Small engine adds:** 7.7.3 (LCOS — formula well-known, all inputs in worker) + 7.7.7 (revenue stack confirmation/fix — most consequential math check) + 7.7.8 (priceBase metadata) + 7.7.9 (MOIC) + 7.7.4 (capital structure controls — sliders need worker live recompute) + 7.7.13 (cannibalization surface from existing cpi).
- **Session 3 — Genuinely new engine work:** 7.7.5 (auxiliary load + availability if not already modelled) + 7.7.11 (Monte Carlo P10/P50/P90) + 7.7.15 (real-options duration optimizer using existing irr_2h/irr_4h) + 7.7.16 (PPA/tolling scenario toggle — full new engine path).

---

### Phase 7.8 — Methodology + Glossary + Citations + Versioning

**Branch:** new `phase-7-8-trust` off main.
**Maps to:** Bankability audit §5.1 (methodology), §1.2 (glossary), §6.1 (disclaimers), §6.2 (citations), §6.4 (versioning), §6.6 (audit log).
**Why before Phase 8:** trust foundation. The audit's #1 priority — "without methodology, the site won't be trusted by anyone in finance or energy industry."

- [ ] **7.8.1 — `/methodology` page.** MDX-based with KaTeX rendering. Every formula on the site has a section: Annuity / CRF, LCOS, IRR (with timing convention), WACC, DSCR, Spread Capture Efficiency, RTE (AC-AC + auxiliaries), Degradation (calendar + cyclic), Imbalance exposure, Revenue stack allocator. Each formula has units, source citation, and a worked example. Per P3 (locked principle): commodity formulas public, proprietary analytics drawer-only.
- [ ] **7.8.2 — `/glossary` page + `<Term>` primitive.** Every acronym (aFRR, mFRR, FCR-N, residual load, P50, WACC, LCOS, DSCR, MOIC, BESS, BTD, DA, ID, ISP, NTC, PICASSO, MARI, CRM, etc.) gets an entry. `<Term>` component wraps acronyms in dotted underline; hover/tap shows 2-line definition + link to glossary. Glossary content sourced from `content/glossary.mdx`.
- [ ] **7.8.3 — Citation system.** `<Cite>` component with footnote `[1]` superscript inline; hover shows source; click jumps to `/sources` page. Bibliography auto-generated from `content/citations.bib` or YAML. Every external number footnoted.
- [ ] **7.8.4 — Disclosures + disclaimers.** Footer block + per-page banner on Returns and Trading: "Not investment advice. Indicative only. Past performance not a guide." Author identification: "Built by Kastytis Kemežys, UAB KKME. Last reviewed 2026-XX-XX." Reviewer info on `/colophon`.
- [ ] **7.8.5 — Model versioning + `/changelog`.** Footer shows `Model v2.4 — released 2026-04-12`. `/changelog` page lists every model version with date, formula changes, scope. Banks/counterparties cite the version that generated their screenshot. Worker bumps the version on any formula change.
- [ ] **7.8.6 — `/data-revisions` audit log.** ENTSO-E and similar sources revise historical values. When a previously-displayed number changes, log it: original value, revised value, date of revision, source. Builds long-term credibility.
- [ ] **7.8.7 — `/policy` page.** EU regulatory context: EMD reform, Net-Zero Industry Act, Innovation Fund, Modernisation Fund, RED III, AFIR, EU PICASSO/MARI platform, post-CE-sync (Feb 2025). Quarterly digest of "what changed this quarter." Auto-generated section pulled from Intel feed when items are tagged `policy`.
- [ ] **7.8.8 — Post-CE-sync versioning marker.** Every relevant TSO procurement number on the site explicitly labelled `Post-CE-sync (Feb 2025)`. The desync from BRELL changed FCR sizing and aFRR procurement volumes materially; older numbers must be flagged or excluded.
- [ ] **7.8.9 — Geometric vs arithmetic mean documentation.** Explicit note in /methodology: multi-period IRR uses geometric; cross-sectional snapshot averages use arithmetic. Each chart annotated.

**Estimated effort:** 2–3 CC sessions. Heavy content authoring; CC writes the MDX + KaTeX scaffolding, you fill in the specific formulas/disclaimers.

---

### Phase 7.9 — Sharability triad + Data states

**Branch:** new `phase-7-9-sharability` off main.
**Maps to:** Bankability audit §1.4 (copy-number), §1.5 (print), §1.7 (data states), §6.3 (CSV download), §6.5 (permalink), §6.10 (share-scenario PNG with QR), §6.7 (math a11y).
**Why now:** sharability turns visitors into propagators. Energy professionals copy numbers into models, print to PDF, send permalinks. Without these, the site can't propagate.

- [ ] **7.9.1 — Permalink encoding.** Extend Phase 15.1 `useScenario()` early — every assumption (gearing, WACC, RTE, cycles, country, product, duration, capex case, COD year, scenario) encodes in URL. "Permalink" button copies a clean URL that reproduces exactly the current scenario. Bookmarkable. Shareable in Slack/email.
- [ ] **7.9.2 — Copy-number affordance.** Click any KPI value → copies `value | unit | source | as-of | URL#anchor` to clipboard, 1-second toast confirms. Drives sharability more than any social card. Implemented as a tiny corner-triangle on every primary metric.
- [ ] **7.9.3 — `<DataFigure>` + CSV download.** Every chart wrapped in `<DataFigure data={...}>` exposes a "Download CSV" button. Analysts paste into Excel; the data leaves the site, the brand follows.
- [ ] **7.9.4 — `/print` route + `@media print` rules.** Clean 2-column A4 layout, page breaks at section boundaries, footer with URL + retrieved-at timestamp. Project-finance analysts print things. `styles/print.css`.
- [ ] **7.9.5 — `<DataState>` component.** Every data component has four states: `loading` (skeleton), `ok`, `stale` (>24h, amber dot + "data is N hours old" — already in F5-lite for S1/S2), `error` (rose dot + retry). Centralised so cards don't reinvent it.
- [ ] **7.9.6 — Share-scenario PNG with QR.** "Share scenario" button on Returns: generates 1200×630 PNG with IRR, DSCR, LCOS, payback, scenario inputs, and QR code back to the permalink. Drops the screenshot ratio in IC decks; QR brings the analyst back to the live model. Phase 13.1 daily-card infrastructure (Vercel/og) is reused.
- [ ] **7.9.7 — Number a11y.** Every number gets `aria-label` with full unit ("twelve point four euros per megawatt-hour"). Screen readers shouldn't say "twelve point four E slash M W H." Implemented via `formatNumber()` extension.

**Estimated effort:** 2 CC sessions. Tight scope, mostly UI work. Permalink + copy-number + CSV are quick wins; print + share PNG are heavier.

---

### Phase 8 — Foundation Sprint (tokens, typography, primitives, microbrand)

**Branch:** new `phase-8-foundation` off main.
**Maps to:** Brand review Sprint 1; 10× review Tier 0 #1, #3.

The keystone phase. Until tokens are real, every other design fix is duct tape.

- [ ] **8.1 — Complete semantic token layer.** Add `--success / --danger / --mint / --coral / --lavender / --sky / --ink / --ink-muted / --ink-subtle / --paper` as named aliases over existing primitives. Full light/dark pairs. Audit every hardcoded hex/rgba and pull through tokens. (Pending P1 decision for color grammar interpretation.)
- [ ] **8.2 — Three-voice typography system.** Display serif (recommend Fraunces with optical-size axis), mono (JetBrains Mono or Berkeley Mono), body sans (Inter). Replace the dead Super Sans/Serif/Mono VF requests. Build the `--type-hero / --type-number-xl / --type-number-l / --type-section / --type-eyebrow / --type-body / --type-caption` ramp. Apply `font-variant-numeric: tabular-nums` globally on mono.
- [ ] **8.3 — Extend existing primitives (don't rebuild).** Repo already has primitives at `app/components/primitives/`: `AnimatedNumber`, `ConfidenceBadge`, `DataClassBadge` (this IS the vintage O/D/F/M badge), `DetailsDrawer`, `FreshnessBadge`, `ImpactLine`, `MetricTile` (this IS the metric display primitive), `SectionHeader`, `SourceFooter`, `StatusChip`. Phase 8.3 EXTENDS them rather than replacing:
    - **`MetricTile`** → grow to support optional P10/P50/P90 fan, optional sample-size N badge, optional methodology version stamp. Keep existing API so existing card consumers don't break.
    - **`DataClassBadge`** → confirm O/D/F/M coverage, add color-coding tied to N-1 rule + P1 palette.
    - **`FreshnessBadge`** → already extended by F5-lite (helper at `app/lib/freshness.ts`); apply chip pattern from F5-lite.2 thresholds globally.
    - **`SourceFooter`** → add favicon + last-fetched timestamp + timezone per N-7.
    - Type the `Metric` interface so the renderer can never display a unitless or unstamped number (per 10× review Tier 4 #5).
- [ ] **8.3b — Add new visual atom primitives** (per visual review §1; the four shared visuals that account for ~70% of the new surface): `<DistributionTick>` (1px hairline + tick mark showing where today's value sits across min / p25 / p50 / p75 / p90 / max — used 50+ times across the site), `<RegimeBarometer>` (horizontal bar tight→compressed→normal→wide→stress with vertical needle for today's reading; uses semantic palette per P1), `<CredibilityLadderBar>` (horizontal stacked bar from intention → reservation → permit → agreement → construction → operational; reusable across pipeline, project counts, asset funnel), `<AnnualisedTwin>` (muted `× 365` companion implementing N-3), `<HaircutToggle>` (theoretical vs realistic toggle implementing N-8). Each a single visual atom; reuse — not bespoke per card — drives coherence.
- [ ] **8.3c — Number formatting + a11y utility.** `lib/format.ts` exports `formatNumber(value, kind)` that enforces consistent precision: capacity in MW (no decimals < 100, 1 decimal otherwise), prices in €/MWh to 1 decimal, IRR to 0.1pp, capacity factor to whole %, MOIC to 2 decimals, ratios (DSCR) to 2 decimals. Plus `formatNumberA11y(value, kind)` for screen-reader-friendly aria-labels ("twelve point four euros per megawatt-hour"). Implements N-2 unit clarity at the renderer level.
- [ ] **8.3d — `<DataState>` primitive.** Wraps any data-driven component with four states: `loading` (skeleton), `ok` (data present), `stale` (>24h, amber dot), `error` (rose dot + retry). Built once, used across every card. Pre-positions for Phase 11 mobile data UX (`summary stat + sparkline` mobile default → tap-to-expand).
- [ ] **8.3e — `<Term>` primitive.** Wraps acronyms (aFRR, mFRR, FCR, P50, WACC, LCOS, DSCR, etc.) in dotted underline; on hover/tap shows 2-line definition + link to /glossary. Glossary content sourced from `content/glossary.mdx`. Implementation depends on Phase 7.8.2 having authored the glossary.
- [ ] **8.3f — `<Cite>` primitive.** Footnote `[1]` superscript; hover shows source; click jumps to `/sources` page. Bibliography auto-generated from `content/citations.bib` or YAML. Used wherever an external number appears.
- [ ] **8.4 — Icon sprite.** ~25-icon set on 24×24 grid, 1.5px stroke, square caps. Categories per brand review §6: energy/asset (battery, solar, wind, thermal, transformer, substation, interconnector, grid), market (arbitrage, capacity, activation, imbalance, forecast), geography (LT, LV, EE monogram tiles), vintage glyphs (O/D/F/M), UI (expand, collapse, external, copy, pin, filter, info, share).
- [ ] **8.5 — Logo system.** Wordmark variants at multiple optical sizes, monogram, stamp, lockup-tagline. Favicon set (16/32/48/192/512), apple-touch, safari-pinned-tab.
- [ ] **8.6 — Public design system pages.** `/brand` (logo system + clear-space rules + minimum sizes), `/style` (color palette + type ramp + token reference), `/visuals` (per visual review §17 — primitives doc with examples/props/usage rules; chart catalog with sample data and "do not use when N<7" guidance; motion timings/easing rationale; game elements catalog if P7 lands "selective"), `/colophon` (typefaces, color philosophy, data sources, build stack, person behind it). These doubled as marketing — credibility signal. Designers in adjacent industries quote them; press articles screenshot them.
- [ ] **8.7 — Microbrand details.** Custom 404/500 pages, console signature, `::selection` color, `:focus-visible` ring, print stylesheet, `humans.txt`, `security.txt`.

**Estimated effort:** 3–4 CC sessions. Largest phase in the plan.

---

### Phase 9 — Identity (hero, map, ticker, editorial copy)

**Branch:** new `phase-9-identity` off main.
**Maps to:** Brand review Sprint 2 + Sprint 3 partial; 10× review Tier 1.

- [ ] **9.1 — Map optimisation.** Re-export `background-light.svg` and `countries-light.svg` through SVGO. Split into base / interconnector / node layers. Theme-aware preload.
- [ ] **9.2 — Interactive `<BalticMap>`.** Country hover dims others; click pins filter via URL `?country=LT`. Interconnector flow direction reverses on import/export sign. Node pulse on country data refresh.
- [ ] **9.3 — Hero rebuild.** Two compositions to evaluate at Pause A; pick one before code:
    - **Option A (brand review §15):** small wordmark + eyebrow → date + ONE huge today's-number (sized per P2) + regime barometer + italic display-serif sentence → map right half → slim ticker → plain-English KKME definition. Cleaner, more editorial.
    - **Option B (visual review §2):** centerpiece is a live energy-balance ring (~400px circular: inner=load, middle=wind/solar/thermal/import segmented, outer=storage+export residual). Four corner anchors: today's headline number (top-left), 24h DA price ribbon (top-right), simplified Baltic map with interconnector flows (bottom-left), credibility ladder showing fleet position (bottom-right). More information-dense, more interactive.
    - **Recommendation:** Option A first; revisit Option B if Option A doesn't sell the "what is KKME?" question in 3 seconds. Don't ship both.
- [ ] **9.4 — Slim ticker.** Single transform-animated track, hairline rules, mono number + eyebrow chip pattern, pause-on-hover, click-to-source-card.
- [ ] **9.5 — Live pulse on freshness chip.** Per P5: subtle teal pulse on actual data refresh, 800ms decay. No constant ticking.
- [ ] **9.6 — Editorial copy rewrite.** Section headings get plain-English sentences with technical lines as caption/tooltip. Per brand review §13.

**Estimated effort:** 3 CC sessions.

---

### Phase 10 — Card system overhaul

**Branch:** new `phase-10-cards` off main.
**Maps to:** Brand review §10; 10× review Tier 1 #5; UX audit cards section.

- [ ] **10.1 — Card variant primitives.** `<HeadlineCard>`, `<DriverCard>`, `<DeepDiveCard>`. Surface elevation, border treatment, padding scale tokens.
- [ ] **10.2 — Migrate live cards to variants.** Actual card inventory (verified 2026-04-26 via repo audit):
    - **Section "Revenue signals":** S1Card (DA arbitrage), S2Card (Balancing aFRR/mFRR/FCR)
    - **Section "Build conditions":** S3Card (Installed BESS cost), S4Card (BESS pipeline & buildability ledger)
    - **Section "Structural market drivers":** RenewableMixCard, ResidualLoadCard, PeakForecastCard, SpreadCaptureCard (replaced retired S8), S7Card (TTF gas), S9Card (EU ETS carbon)
    - **Section "50 MW reference asset":** RevenueCard (HeadlineCard candidate)
    - **Section "Dispatch intelligence":** TradingEngineCard
    - **Section "Market intelligence":** IntelFeed (not strictly a card; layout primitive)
    - **Retired / unused:** S5Card, S6Card, S8Card (replaced), SolarCard, WindCard, LoadCard. Decide per phase whether to delete or revive — default: leave alone, don't break what isn't on the page.
    - Most cards become `DriverCard`. Heroes per section get `HeadlineCard` treatment (likely candidates: S1, S2, RevenueCard, TradingEngineCard).
- [ ] **10.3 — Apply `<MetricDisplay>` everywhere.** Vintage glyphs (O/D/F/M) live next to numbers. Hairline rules above heroes.
- [ ] **10.4 — Regime chip semantic colors.** Per P1: descriptive palette (mint/amber/coral/lavender) tied to data state. Document in /style.
- [ ] **10.5 — Apply icon sprite throughout.** Section toggles, card headers, source attributions.
- [ ] **10.6 — Section plates.** Four full-bleed editorial plates between sections per brand review §8. Inline SVG illustrations on dot grid.
- [ ] **10.7 — LT/LV/EE small multiples on every aggregate metric.** No serious Baltic analyst wants Baltic-aggregate only. Wherever a card shows an aggregate, render a 1×3 small-multiples grid (LT / LV / EE) alongside or behind a "compare" toggle. Per audit §22.
- [ ] **10.8 — P10/P50/P90 fans on every derived/forecast number.** IRR, DSCR, payback, LCOS, forward DA strip — all currently point estimates. Industry experts read fans, not points. Use `<MetricDisplay>` from Phase 8 with fan support enabled.
- [ ] **10.9 — Credibility-tiered pipeline funnel.** Replace the four-different-pipeline-numbers state with a single horizontal funnel: intention → reservation → permit → grid agreement → construction → operational, in MW. Promote to hero adjacency. Per audit §23 quick-win 5.
- [ ] **10.10 — Card-specific visualization upgrades** (per visual review §5–§12):
    - **S1 today-vs-distribution overlay:** replace bare price-line with layered plot — 30-day P10–P90 envelope as soft cream band, P25–P75 as deeper band, 30-day median dashed, today's actual 24h DA curve in mint, captured-spread window highlighted as 30%-opacity fill.
    - **S1 distribution histogram:** below the price chart, a 20-bin histogram of 30-day daily capture values with a needle marking today.
    - **S1 Gross→Net waterfall:** convert the current text-list bridge into a horizontal waterfall chart — `[+€36 gross] → [-€4 RTE] → [-€2 fees] → [-€1 imbalance] → [+€29 net]`, each segment colored, annotations on each deduction.
    - **S2 3×3 small-multiples grid:** rows aFRR/mFRR/FCR × columns LT/LV/EE; each cell a 30-day sparkline with current clearing as a colored dot, P50 dashed, activation rate as fill underneath. Replaces 10.7 for S2 specifically.
    - **S2 imbalance kernel-density plot:** replace the three numeric cells (mean / p90 / % >100 MWh) with a single density plot showing the imbalance distribution with vertical lines at mean, p90, and the 100 MWh threshold.
    - **Returns IRR 9-cell heatmap:** replace the current row-of-three-IRRs with a 3×3 (CAPEX × COD year) heatmap colored vs hurdle (mint above, amber below).
    - **Returns Y1 monthly DSCR overlay:** three lines (base / conservative / stress) with worst month highlighted, horizontal line at 1.20× covenant.
    - **Returns observed monthly revenue calendar heatmap:** 12-month × 2-stream grid (Bal/Trd) colored by €k/MW.
    - **Trading dispatch + SOC overlay:** stacked 24-bar dispatch chart (capacity/activation/arbitrage colors) with battery SOC trace as a continuous line on the same time axis. Today's price overlay as a thin line on a secondary y-axis. SOC and revenue on one frame is the canonical trader's view and isn't currently shown.
    - **Trading revenue donut:** replace the three percentage cells (33% / 60% / 7%) with a donut chart linked by hover-highlight to the bar segments above.
    - **Renewable mix as stacked area** + **residual load as divergent area** + **peak forecast as hourly bar chart with peak/trough marked** + **cross-border spread as diverging bar (LT-SE4 / LT-PL / LT-LV / EE-FI / LV-EE)** — all per visual review §9.
    - **Commodity card causal chains:** TTF and EUA cards get small horizontal bar chains (`TTF €44.8 × 1/0.6 = €75 CCGT marginal`) with connector lines into the Peak Forecast card. Combined P_high formation as a single waterfall: `[€44.8 TTF] + [€30 efficiency] + [€34 carbon] = [€109 P_high]` with horizontal line showing today's actual peak — visually shows scarcity rents above the marginal generator.
    - **Apply N-3 (annualised twin) and N-8 (availability haircut)** rules to every primary value via `<AnnualisedTwin>` and `<HaircutToggle>` primitives from Phase 8.3.
- [ ] **10.11 — Cross-card metric highlight.** Hovering a metric anywhere on the page subtly highlights every other surface displaying the same metric (e.g., hovering "8.6% IRR" in Returns highlights the same value in hero and ticker). Cross-card relationships made visible without click. Implemented via a global hover-key store (`metric:project_irr_unlevered`), each rendered metric subscribes.
- [ ] **10.12 — "Today's chain" causal visualization.** Top of Structural section: a single horizontal chain `High wind → renewable share 119% → residual load -495 MW → DA spread above P90 → BESS arbitrage profitable today`. Each link tappable, opens corresponding card. Teaches the entire structural model in 30 seconds. Per visual review §9.
- [ ] **10.13 — Reserve product nomenclature precision.** Per audit §3.1: every balancing tile carries explicit `aFRR capacity` vs `aFRR energy` distinction (these are different products with different units). Same for mFRR. FCR is symmetric, capacity-only. Add `<Term>` (Phase 8.3e) wrappers on every product abbreviation linking to glossary.
- [ ] **10.14 — Imbalance settlement labels.** Audit §3.2: the Baltics moved to single-pricing imbalance settlement. S2 imbalance card explicitly states the mechanism. Affects when a BESS captures imbalance revenue vs DA. Documented in /methodology.
- [ ] **10.15 — Grid connection cost split (S4 expansion).** Audit §3.6: split the single connection number into connection-point cost (€/MW), reinforcement allocation (deep vs shallow), queue length (months), and DSO vs TSO connection. Single most decision-relevant number for developers.
- [ ] **10.16 — Permitting timeline Gantt (S4 expansion).** Audit §3.7: from PPA/site control to COD — typical 18–36 months in LT, longer in LV/EE. Render as a Gantt distribution across the 29 fleet projects. Real-vs-claimed timelines is one of the most-asked Baltic storage dynamics.
- [ ] **10.17 — Clean Spark Spread tile (S7/S9 join).** Audit §3.9: the implied marginal-gas-plant clearing price = `(TTF / efficiency) + (ETS × emission_factor) + variable O&M`. This is the single most useful equation in EU power markets. Surface as a calc card linking S7 (gas) and S9 (carbon) into one "where does today's peak ceiling come from?" view.
- [ ] **10.18 — Storage-need from VRE buildout (RenewableMix expansion).** Audit §3.10: connect "Renewable mix" and "Residual load" to a "storage need" call-out — GW of storage required to integrate the projected renewable additions (rule of thumb: ~10–15% of installed VRE in 4h equivalent). Drives the investment thesis instead of being decorative.

**Estimated effort:** 5–6 CC sessions. Card-by-card visualization upgrade + energy-industry precision items is the largest individual workstream in the plan after Phase 8.

---

### Phase 10.5 — Tier-S content additions (new shareable cards)

**Branch:** new `phase-10-5-content` off main.
**Maps to:** Audit §22 (missing numbers) + §24 Tier-S list.
**Why separate:** these are NEW cards/visualisations, not edits to existing cards. Foundation + design system from Phase 8–10 makes them cheap to build on top.

- [ ] **10.5.1 — Project-level ledger.** Sortable table of all 29 Baltic BESS projects (name, country, MW, MWh, duration, status, COD, developer, source). Drawn from public registries. Single most-bookmarked-page candidate per audit.
- [ ] **10.5.2 — Cross-border spread card.** LT vs SE4, LT vs PL, EE vs FI cross-zone DA spreads. Audit notes nobody else publishes this — unique IP.
- [ ] **10.5.3 — 24h × 365d capture heatmap.** Hour-of-day × day-of-year grid with today highlighted. The visual traders pin to their desks.
- [ ] **10.5.4 — 5×5 correlation heatmap.** TTF gas vs LT DA peak (R²), EUA vs LT DA peak, wind generation vs DA trough, residual load vs DA spread, interconnector flow vs LT-SE4 spread. Becomes the most-cited evidence for the structural drivers thesis.
- [ ] **10.5.5 — Forward curve card.** Next 12 months DA strip, forward aFRR clearing (where Litgrid auctions publish), forward TTF and EUA from ICE. Without this, IRR feels asserted not evidenced.
- [ ] **10.5.6 — Connection-guarantee policy watch.** €50→€25/kW change with one-click "model this in Returns" flow. Per audit §10.
- [ ] **10.5.7 — Cycle counter on Returns card.** Cycles/year, depth-of-discharge distribution, expected cycle life remaining. Operators care intensely.
- [ ] **10.5.8 — Auction outcomes feed.** Litgrid aFRR auction-by-auction clearing + MW awarded + bidder count + bid-cover ratio. Public but unaggregated.
- [ ] **10.5.9 — "Configure your project" live cost calculator.** Sliders for duration (2/4/6/8h), scope tier (developer/turnkey/institutional), grid heaviness, supplier tier, timing. Cost stack and €/kWh recompute live. Generates shareable "your KKME quote" card: `4h · turnkey · grid-heavy · Q3 2026 · €178/kWh ±€20`. Per visual review §7. The page developers send to their boards.
- [ ] **10.5.10 — "Stress your asset" Returns interactive.** Four sliders on the Returns card: CAPEX (€110–300/kWh), WACC (5–12%), capture decay rate (0–10%/yr), aFRR clearing trajectory (-30% to +30%). Every metric on the card recomputes live. "Find my breakeven" button auto-solves for the slider value that brings IRR to 11%. Shareable URL encodes slider state — analyst sends scenario to MD with one link. Per visual review §11. This is what every IC analyst does in Excel; doing it in 5 seconds in browser is genuinely transformative.
- [ ] **10.5.11 — 2D LCOS sensitivity heatmap on Build card.** x = cycles/yr (200–500), y = WACC (5–12%), color = LCOS €/MWh, with "your asset" position marked as a draggable circle. Teaches the LCOS sensitivity intuition in seconds.
- [ ] **10.5.12 — Capacity Remuneration Mechanism (CRM) card.** Audit §3.5: Lithuania has a strategic reserve / capacity mechanism in development; Estonia and Latvia have different schemes. A BESS may earn capacity payments. Country-tabbed card with current scheme details + KKME's expected impact on revenue stack.
- [ ] **10.5.13 — Counterfactual benchmark table.** Audit §4.3: investors compare BESS to alternatives — gas peaker, OCGT, demand response, transmission upgrade. €/MWh of flexibility delivered by technology. Sourced from JRC / BNEF / NREL.
- [ ] **10.5.14 — Macroeconomic demand-driver tile.** Audit §4.6: Baltic GDP growth, industrial electrification (steel, hydrogen), datacenter load (a major emerging buyer in LT/EE), EV penetration. Each shifts demand profile and storage value.
- [ ] **10.5.15 — Real-options duration optimizer.** Audit §4.5: given current and forward spreads, recommends 2h/4h/8h. Output: "At 2026 spreads, 2h dominates; at 2030 spreads, 4h dominates." Engine work in 7.7.15; UI surface in 10.5.15.
- [ ] **10.5.16 — Revenue structure scenario toggle.** Audit §4.7: Merchant / Tolling / Hybrid — three IRR distributions, three risk/reward profiles. Tolling caps upside but de-risks revenue; relevant for IC committees. Engine work in 7.7.16; UI surface in 10.5.16.

**Estimated effort:** 4 CC sessions (largest content phase; can split LT/LV/EE comparison work with rest of plan).

---

### Phase 11 — Layout, mobile, light theme

**Branch:** new `phase-11-layout` off main.
**Maps to:** UX audit §1, §3.3; 10× review Tier 0 #3.

- [ ] **11.1 — Horizontal overflow fixes.** Replace fixed widths/min-widths with `clamp()` and `auto-fit`. Page-container audit.
- [ ] **11.2 — Mobile responsive grid + nav.** Hamburger ≤1024px; desktop link list hides at same breakpoint. Hero KPI strip becomes scroll-snap row sub-768px. Map gets `aspect-ratio: 4/3`.
- [ ] **11.3 — Real designed light theme.** Per P4 brand position: paper-cream / espresso, paired map asset, retuned chart palette where every series passes 4.5:1 on cream, deeper accent (not the current near-black lavender on cream).
- [ ] **11.4 — Theme-aware asset loading.** Don't ship 1.3MB of light-theme SVG to dark-mode users. `<link rel="preload" media="...">` per theme.
- [ ] **11.5 — Returns card overflow.** ViewBox-driven SVG, secondary axis inset on narrow.
- [ ] **11.6 — Mobile data UX.** Charts on a 390-px phone default to *summary stat + sparkline*; tap-to-expand opens the full chart in a modal sheet. Audit §6.8: "we only fixed layout — not data density." `<DataState>` + a mobile breakpoint variant of every chart component.

**Estimated effort:** 2–3 CC sessions.

---

### Phase 12 — Intel engine

**Branch:** new `phase-12-intel` off main.
**Maps to:** UX audit §2.1; brand review §10 partial.

- [ ] **12.1 — Worker scraper filter.** Positive keyword whitelist (BESS, battery, aFRR, mFRR, FCR, storage, MW/MWh, Litgrid, AST, Elering, LitPol, NordBalt, Nord Pool). Domain rules for facebook.com / researchgate.net (only if title also contains storage keyword).
- [ ] **12.2 — Dedupe.** Canonical URL OR title-shingle Jaccard >0.7 within 7-day window.
- [ ] **12.3 — Relevance classifier.** Score 0–1 per item. Hide <0.4 from public feed; admin queue for review.
- [ ] **12.4 — LT/EN translate.** Auto-translate Lithuanian / Latvian / Estonian titles to English; show original on hover.
- [ ] **12.5 — Research-clipping render.** Per brand review §10: source favicon + domain in mono + one-line takeaway in serif italic + MW impact pill + country flag + relative date.

**Estimated effort:** 2 CC sessions (worker side is bigger than UI).

---

### Phase 13 — Distribution

**Branch:** new `phase-13-distribution` off main.
**Maps to:** Brand review Sprint 4; 10× review Tier 2 #11, #12.

- [ ] **13.1 — Daily OG image with variants.** `/api/og/daily` route via `@vercel/og`. 1200×630, full-bleed ink, wordmark + date + headline number at 180px + regime barometer + 3-col metric strip (each with vintage glyph + distribution tick) + source row. Per visual review §14, **three variants**: Capture Day (DA-led story), Reserve Day (aFRR/mFRR-led), Pipeline Day (fleet/policy-led). Pick most newsworthy each morning. KPI-cell-level share affordances on the on-site cards (12×12 corner triangle that snapshots a single cell to PNG) per visual review §3.
- [ ] **13.1b — "Year in review" retrospective card.** End of year, generate a 1200×630 image with a 365-cell regime calendar (each cell colored by daily regime), top 5 spread days, total Baltic BESS additions, KKME's forecast accuracy. The most-shared single piece of content KKME ever produces.
- [ ] **13.2 — Snapshot share button.** Copies clean PNG of today's hero to clipboard.
- [ ] **13.3 — `/sources` page.** Every upstream feed (ENTSO-E, BTD, energy-charts, Litgrid, AST, Elering, NVE, ECB, BNEF, NREL ATB) with logo, what KKME pulls, refresh cadence, license, last-updated.
- [ ] **13.4 — Methodology permalinks (depends on Phase 7.8.1).** Per P3: public pages for commodity formulas, drawer-only for proprietary analytics. Schema.org Dataset markup per page. The `/methodology` page itself is built in Phase 7.8.1; Phase 13.4 ensures every card's "Reading this card" drawer links to the relevant permalink section.
- [ ] **13.5 — Share-scenario PNG generator (extends Phase 7.9.6).** Whereas 7.9.6 builds the basic share-PNG with QR, 13.5 polishes it for marketing: variant designs (Capture Day, Reserve Day, Pipeline Day, Returns Snapshot), social-platform aspect ratios (LinkedIn 1200×630, X 1200×675, Slack 1200×630), share-button-on-every-card affordance.
- [ ] **13.6 — SEO + dynamic OG image.** Audit §6.9: title `Baltic BESS Economics & Flexibility Market Intelligence | KKME`. Meta description with `aFRR, mFRR, DA spreads, LT LV EE, project IRR`. OG image renders today's IRR + regime + headline metric — every share is an ad.

**Estimated effort:** 1.5 CC sessions.

---

### Phase 14 — IA, navigation, accessibility

**Branch:** new `phase-14-ia-a11y` off main.
**Maps to:** UX audit §3, §5; 10× review Tier 3.

- [ ] **14.1 — Anchor IDs match nav labels.** `#signals / #build / #structure / #returns / #trading / #intel / #contact`. 301 fragment redirects from old IDs.
- [ ] **14.2 — Section reorder.** Hero → Structure → Signals → Trading → Build → Returns → Intel.
- [ ] **14.3 — Sticky TOC ≥1280px.** IntersectionObserver progress indicator.
- [ ] **14.4 — Keyboard layer.** `?` help overlay, vim-style `g s / g b / g r`, `[`/`]` cycles scenarios, `t` theme, `m` map focus.
- [ ] **14.5 — Skip link, focus rings, ARIA audit.** axe-core in CI. Fix every contrast finding. **Math accessibility:** every number `aria-label` reads the full unit out ("twelve point four euros per megawatt-hour"), not the abbreviated form. `formatNumberA11y()` from Phase 8.3c handles this.
- [ ] **14.6 — i18n scaffolding (deferred content).** Externalize all UI strings to `messages/en.json` via `next-intl` (or similar). Even if only English ships, this unblocks future LT/LV/EE translations. Audit §1.8.

**Estimated effort:** 2 CC sessions.

---

### Phase 15 — Engineering rigor

**Branch:** new `phase-15-eng-rigor` off main.
**Maps to:** 10× review Tier 4.

- [ ] **15.1 — Single `useScenario()` store.** URL-bound via `useSearchParams`. All toggles read/write through it.
- [ ] **15.2 — Chart consolidation.** Five primitives: `<TimeSeries>`, `<Distribution>`, `<StackedBar>`, `<Sparkline>`, `<HourlyDispatch>`. Custom layer over D3 scales + React SVG. Cuts JS ~30%.
- [ ] **15.3 — ISR per data source.** Revalidate tags: BTD 20min, ENTSO-E 60min, CAPEX daily.
- [ ] **15.4 — Visual regression tests.** Playwright + Chromatic at 390 / 768 / 1280 / 1920, both themes.
- [ ] **15.5 — Math unit tests.** LCOS, IRR, DSCR, gross→net bridge in Vitest. The financial math IS the product.
- [ ] **15.6 — Plausible analytics.** Plus custom event stream: cards expanded, scenarios configured, source clickthroughs.

**Estimated effort:** 3 CC sessions.

---

### Phase 16 — Press mode + final polish

**Branch:** new `phase-16-press` off main.

- [ ] **16.1 — Press mode theme.** High-contrast, screenshot-ready for IC decks. One keyboard shortcut, one toggle.
- [ ] **16.2 — Final visual QA.** 4 viewports × 2 themes × press mode. Snapshot regression baseline.
- [ ] **16.3 — Motion polish layer** (per visual review §16): scroll-linked underline animation on section headings (left-to-right reveal over 800ms when heading enters viewport), card entrance fade-up + 12px translate staggered 80ms apart, button affordances (1px mint border on hover + soft 4px outer glow fading in over 200ms; pressed states inset 1px translate-y for tactile feedback), loading shimmer on data refresh (600ms diagonal mint highlight sweeping across the *number's* bounding box when fresh data lands; the freshness chip beside the number stays visible with its label and tooltip — shimmer is the visual "ping" on the number itself, not a replacement for the chip), cursor states (mint dot on map interactive zones, crosshair with snap-to-data-point guides on chart canvases, grab/grabbing on draggable controls), text reveals on scroll (section heading copy fades word-by-word ~50ms per word as user scrolls in). Sound explicitly NOT included — P6 forbids it. Subtle, fast — page reveals itself rather than slams in.

**Estimated effort:** 1 CC session.

---

### Phase 7.10 — Lithuanian BESS regulatory feed (SHIPPED in Cowork 2026-04-26)

**Branch:** TBD — work was implemented in Cowork on local working tree alongside Phase 7.6 Session 2 + 3.
**Maps to:** External feed contract at `docs/contracts/regulatory-feed/HANDOVER.md` (schema v1.0). Producer = `lt-bess-regulatory-monitor` task; consumer = website.

**Decisions locked:**
- A: show `title_lt` as italic subtitle by default (audience is Lithuanian-speaking; English title is a translation, LT is the legal name).
- B: render-fallback approach on schema mismatch (rest of site keeps shipping).
- C: feed contract moved to `docs/contracts/regulatory-feed/`.

**Surfaces shipped:**
- `/regulatory` — full archive, grouped by week, filter chips for impact/category/tag, URL-encoded permalinks.
- Homepage `#intel` section — `RegulatoryPreview` block with top 3 most-recent items + "See all updates →" link.
- Disclaimer footer per HANDOVER §5: "Informational only. Not legal advice. Speak to qualified counsel for any specific matter."

**Files added:**
- `lib/regulatory-schema.ts` — Zod schemas pinned to `SUPPORTED_MAJOR = '1'`; refuses major-version bumps.
- `lib/regulatory.ts` — loader, sortItems, groupByWeek, impactSentiment helpers.
- `lib/__tests__/regulatory.test.ts` — 28 spec assertions across 8 describe blocks.
- `data/regulatory_feed.json` — copy of upstream feed (refresh weekly via GitHub Action you'll wire separately).
- `app/regulatory/page.tsx` — full archive route.
- `app/components/regulatory/RegulatoryItem.tsx` — single item card.
- `app/components/regulatory/RegulatoryFeed.tsx` — client-side filtering view.
- `app/components/regulatory/RegulatoryFilters.tsx` — chip toggles bound to URL search params.
- `app/components/regulatory/RegulatoryPreview.tsx` — homepage preview block.
- `app/components/regulatory/RegulatoryEmpty.tsx` — fallback states (feed-missing, schema-major-mismatch, schema-shape-mismatch, empty-items).

**Files modified:**
- `app/page.tsx` — added `<RegulatoryPreview />` to `#intel` section above `<IntelFeed />`.
- `package.json` — added `zod ^3.25.76` to devDependencies.

**Files moved:**
- `_feed_contract/HANDOVER.md` → `docs/contracts/regulatory-feed/HANDOVER.md`
- `_feed_contract/regulatory_feed.json` → `docs/contracts/regulatory-feed/regulatory_feed.json`
- Empty `_feed_contract/` directory needs `rmdir _feed_contract` (sandbox couldn't remove it).

**Pending:** GitHub Action to sync `data/regulatory_feed.json` weekly from upstream. Kastytis will wire separately.

**Out of scope (not built):**
- Internationalization toggle for the regulatory section (Phase 14.6 covers site-wide i18n later).
- StickyNav route link to `/regulatory` — would conflict with the existing hash-anchor model. Reachable via homepage preview link + direct URL.

---

### Phase 17 — Engagement Layer (calibration-style, fully opt-in)

**Branch:** new `phase-17-engagement` off main.
**Maps to:** Visual review §15 (refined) + audit §22 missing-numbers community-aggregate slice.
**Status:** P7 LOCKED. Scope below is final.

**Hard rule:** every feature is INVISIBLE to users who don't engage. No nags, no popups, no banner growth-hacks. Default reader experience is unchanged.

- [ ] **17.1 — Daily regime call.** Anonymous, browser-storage. Small unobtrusive "today's regime — call it" affordance somewhere on the home page (NOT a popup). User clicks one of: compressed / wide / tight / stress. Reveal at end of day. Private accuracy history visible to that user only. 5-second commitment, no streaks, no shame.
- [ ] **17.2 — Friday digest with 5-question quiz.** Email subscription opt-in. Single email Friday afternoon: 5 multiple-choice questions on the week's Baltic flexibility news + week-in-numbers recap. User score shown immediately on submit ("you got 3/5; readers averaged 3.2/5 this week"). No public ranking, no streaks. Subscription opt-in is via a single small "subscribe to weekly digest" entry point — no popup, no modal, no growth banner.
- [ ] **17.3 — Private accuracy ledger.** Browser-storage only. Logs every interaction with future outcome (regime call, dispatch challenge result, configure-your-project quote). User can review their own accuracy over time on a `/me` page (or wherever clean fits). Visible only to the user — no server identity, no leaderboard, no aggregate. Pure calibration training.
- [ ] **17.4 — Anonymous aggregate community signal.**
    - **Always-on stat (small, unobtrusive):** e.g. "today's reader regime calls so far: 64% compressed, 28% tight, 8% wide" rendered as a tiny line near the regime barometer, not a hero element. Only appears when N ≥ some threshold (say 20 calls) so noise doesn't hurt.
    - **Quarterly published artifact:** "What KKME readers expected vs what happened in Q1 2026" — aggregate accuracy, median forecasts, summary stats. Becomes a piece of journalism that gets cited. Only ships if the daily regime call accumulates meaningful sample size (gate the quarterly post on N ≥ ~500 calls per quarter).
- [ ] **17.5 — Educational dispatch challenge.** "Try dispatching a 50 MW asset against today's prices" — fixed-scenario interactive. User clicks discharge/charge buttons through a fast-forwarded day; algorithm scores their realized capture vs the optimal ("you captured 87% of optimal"). Private only — score logged to ledger, never shown to other users. No leaderboard. Trains intuition; doesn't gamify the audience.

**Explicitly OUT of scope** (won't build under any framing):
- KKME Pass / streaks / levels / XP / badges / profile system
- Public weekly leaderboards (any kind)
- "Build your own day" / "Beat the TSO" / "Today's Map" / "Predict 2028 fleet" / "Dispatch champion" — anything framed as a competitive game
- "Day X of regime" cute counter at hero
- Particle effects unlocked at any level
- Daily browser/email push to non-subscribers
- Any popup, modal, banner, or "haven't engaged yet?" reminder
- Server-side user identity / accounts / login

The "Configure your project" cost calculator and "Stress your asset" Returns interactive are functional features, not engagement — they live in Phase 10.5 (10.5.9 and 10.5.10) and ship regardless.

**Estimated effort:** 2 CC sessions. One for 17.1 + 17.3 + 17.4 always-on stat + 17.5. One for 17.2 (email subscription pipeline is the bigger lift). Quarterly artifact is content work, not engineering — separate from the Phase 17 scope.

**Don't pre-build infrastructure for engagement we haven't observed.** If after 3 months the daily regime call has 12 total clicks, that's the signal to pull the engagement layer entirely. Phase 17 is exploratory; treat it as such.

---

## 3. Sequencing notes

- **Phase 7.6 finishes first** (currently in flight; Sessions 2 + 3 still to run).
- **After 7.6 → parallel cluster (decision B):** Phases 7.7 (financial exposure) + 8 (foundation) + 7.8 (methodology/glossary) can run in alternating CC sessions — they have minimal cross-dependencies. Solo bandwidth = "alternating" not literal-parallel.
    - 7.7 is mostly worker payload binding to cards (low engine-build risk).
    - Phase 8 is design system primitives (low data-binding risk).
    - 7.8 is content-heavy (MDX authoring, formula prose).
    - Run in any order; whichever has the cleaner CC kickoff wins next slot.
- **Sequential after the parallel cluster:**
    - 7.9 (sharability) needs Phase 8 primitives → after Phase 8.
    - Phase 9 (identity, hero) needs Phase 8 → after Phase 8.
    - Phase 10 (cards) uses both Phase 8 primitives AND Phase 7.7 engine output → after both.
    - Phase 10.5 (Tier-S content) → after Phase 10.
    - Phase 11 (layout/mobile/theme) → can move earlier if mobile traffic shows up.
    - Phase 12 (intel engine) → independent; can run at any point (worker-side).
    - Phase 13 (distribution) → after Phase 9 hero stabilises.
    - Phase 14 (IA/A11y) → near the end.
    - Phase 15 (eng rigor) → last technical phase.
    - Phase 16 (press + final polish) → last.
    - Phase 17 (engagement) → after main roadmap clears.
- **Each phase ends with screenshots committed** to `docs/visual-audit/phase-X/`.
- **Each phase ends with handover.md updated** with session log entry.
- **Each phase ends by updating this file** — check off completed items, strike through superseded ones, add findings to the session log section below.

**Concurrency safety:** when running parallel-cluster phases, branch each off the *most recent main*. Don't branch 7.7 off Phase 8's branch (or vice versa). Merge each PR independently. If a 7.7 fix touches a file Phase 8 also touched, expect a small conflict at merge time — resolvable in web UI.

## 4. Session log

> Brief entries per phase completion. Date, scope shipped, anomalies found, deferred items.

- **2026-04-26 — Phase 8 Session 2** (extend primitives + visual atoms) shipped on `phase-8-foundation` (commits `06b75d0` 8.3, `42764a8` 8.3b, `bd80cdd` 8.3c, `606e16a` 8.3d). Adds `MetricTile` `fan/sampleSize/methodVersion` props (N-4 / N-5 / N-6), refactors `FreshnessBadge` onto the global `freshnessLabel()` helper (N-7), repoints `DataClassBadge` to the 8.1 semantic tokens, ships four new visual atoms (`DistributionTick`, `RegimeBarometer`, `VintageGlyphRow`, `CredibilityLadderBar`), `formatNumber` + a11y twin (N-2 across 14 NumberKinds), and the `<DataState>` 4-state wrapper. All backwards-compatible — no card migrated. Tests: 141 → 257 (+116). `tsc --noEmit`, `next build`, full vitest all green.

- **2026-04-26 — Phase 7.7a** (financial display binding) shipped on `phase-7-7a-financial-display` (commits `8c0a292` 7.7.1, `9f47ece` 7.7.2, `237dffd` 7.7.6, `d21614d` 7.7.10, `77cc85e` 7.7.12, `c18e097` 7.7.13, `8256724` 7.7.14). Project IRR vs Equity IRR split, DSCR triple panel (base + conservative + worst-month with 1.20× covenant tick), degradation curve from `years[].retention` with augmentation/EoL refs, sensitivity tornado from the 9-cell `matrix`, back-test chart from the 13-month trailing window with mean-error caption, cannibalization curve from `fleet_trajectory[].cpi` (formula coefficients drawer-only per P3), market thickness chips on TradingEngineCard + S2Card. New `financialDefinitions.ts` (N-11 vocabulary module) re-exports `irrLabels.ts` so the existing "Gross IRR" forbidden-term guard keeps applying. Zero engine changes; zero `wrangler deploy`. Tests: 257 → 333 (+76 across 6 specs). `tsc --noEmit`, `next build`, vitest all green. Live snapshot at `localhost:3000` confirmed all surfaces render with real worker payload. Anomaly: `all_scenarios.stress.project_irr` is `null` on the live request — tornado skips it; flag for 7.7b/c. Cards visibly investor-grade.

- **2026-04-27 — Phase 12.4 hotfix** (interconnector flow direction) shipped on `phase-12-4-flow-direction-hotfix` (single commit `361b538`, worker deploy `a9f90908-36c4-44aa-bef0-7d4148d67a14`). Two compounding bugs caused every interconnector arrow on the hero to render backwards: (1) `flowSignal()` in `workers/fetch-s1.js` swapped the EXPORTING/IMPORTING labels relative to the documented API convention (positive = importing); (2) `positiveFlowReceives` for the four Baltic interconnectors in `lib/baltic-places.ts` was flipped in commit `c1cefc5` (Phase 2B-1) under a misreading of the Phase 2A-3 worker change. Fix touches both layers + retired `S8Card.tsx` methodology copy. Regression guards added at `app/lib/__tests__/flowSignal.test.ts` and `lib/__tests__/resolveFlow.direction.test.ts`. Tests: 469 → 473 (+8). KV cache for `/s8` had to be manually deleted post-deploy (the route serves cached KV unconditionally) — anomaly logged as Phase 12.6 backlog item. Audits at `docs/audits/phase-12-4/`.

- **2026-04-27 — Phase 7.7c Session 1** (engine extensions: LCOS + MOIC + duration optimizer + assumptions display) shipped on `phase-7-7c-engine-extensions` (single commit, worker deploy `e145aeb4-5570-4cdd-adcb-f79351ef33dc`). `model_version` `'v7.1' → 'v7.2'` carrying both the previously-merged-but-undeployed v7.1 engine refinements (per-product cpi, bid-acceptance saturation, aFRR rate 0.18→0.25 from PR #37) AND four new derived surfaces: `lcos_eur_mwh` (€/MWh-cycled cross-tech comparator), `moic` (multiple of money), `duration_recommendation` (real-options 2h vs 4h hint), `assumptions_panel` (read-only display of RTE / cycles_per_year / availability / hold_period / WACC). `engine_changelog.v7_1_to_v7_2` documents the four additions. Card surfaces: two new `MetricCell` tiles (LCOS + MOIC) on Returns row, `DurationOptimizer` chip-row + `AssumptionsPanel` 5-row read-only table inline sub-components matching the Phase 7.7a `BridgeChart` template. New `STORAGE_METRICS` export in `app/lib/financialDefinitions.ts` per N-11 (LCOS/MOIC/Duration with short/long/unit/tooltip shape). Tests: 485 → 607 (+122 across `v72Metrics.test.ts` and `financialDefinitions.test.ts` extension). `tsc --noEmit`, `next build`, full vitest, `audit-stack.mjs --probe-v71` and `--probe-v72` all green. Returns card now investor-bankable on cross-tech comparison metrics. Capital-structure sliders + request-time recompute deferred to Phase 7.7c Session 2.

## 5. Out-of-scope but worth noting

- **Sound** (P6) — deferred indefinitely.
- **Single-card interactivity drilldowns** (e.g. clicking a sparkline point pins detail panel) — these were partly built in F4 and may be revisited if Phase 10 surfaces a need. Not actively scoped.
- **Subscriptions / paywall / accounts** — KKME stays free-to-read; commercial path is consulting/data-licensing, not gated UI. Phase 17 email-digest is opt-in subscription only (no account creation, no login).
- **i18n beyond intel auto-translate** — the site stays English-primary. Translation of the entire UI to LT/LV/EE is deferred indefinitely.
- **F4-deferred items** (today-row, chart geometry, dotted-underline affordance) — deliberately not implemented in F5-lite; redone properly in Phase 9–10 with new design-system primitives.
- **Phase 18 — Year-in-review annual flagship** — not scoped; added to strategic backlog (§7). Build only after Phase 17 produces measurable engagement signal (e.g., daily regime call has accumulated ≥500 calls/quarter). Don't pre-build infrastructure for traction we haven't observed.
- **"Press mode" theme (Phase 16.1)** — keep as scoped but reconsider before building if Phase 9 light theme already covers screenshot-readiness. May be redundant.

## 6. Backlog — out-of-band hotfix track (Phase 12.x)

> Tracks small, scope-bounded fixes that ship outside the main phase roadmap.
> Numbered Phase 12.x to keep separate from the Phase 12 Intel-engine roadmap (§2).

- **Phase 12.4 — Interconnector flow direction hotfix.** ✅ Shipped 2026-04-27 (commit `361b538`, worker deploy `a9f90908-36c4-44aa-bef0-7d4148d67a14`). Worker `flowSignal` label swap + `lib/baltic-places.ts` `positiveFlowReceives` realignment + regression specs. See Session 18 in `handover.md` and `docs/audits/phase-12-4/`.

- **Phase 12.5 — Grid Access Live Coverage.** Queued. LV/EE grid-access scraping (AST + Elering) + APVA/TSO live updates so KKME's project pipeline view stays current beyond Lithuania. Estimated 1 CC session.

- **Phase 12.6 — KV cache invalidation on worker deploy.** Queued. Surfaced during Phase 12.4: any `/endpoint` route that serves cached KV data needs explicit invalidation in the deploy step, otherwise worker code changes don't take effect until the next cron tick. The `/s8` route (`workers/fetch-s1.js:6817`) had to be manually deleted via `wrangler kv key delete --remote 's8'` post-deploy. Same pattern likely applies to `/s6 /s7 /s9 /s_wind /s_solar /s_load /genload` and any other read-through-KV signal route. Scope: a small deploy script (or extension to `scripts/diagnose.sh`) that takes a list of cache keys to invalidate, or a worker admin route that does it. Estimated 0.25 CC session.

## 7. Backlog — strategic / long-term (not actively scoped)

> Items that may ship eventually based on traction or future need. Not blocking any active phase. Treat as ideas-on-shelf.

- **Year-in-review annual flagship** (gated on Phase 17 engagement; ≥500 daily regime-call data points per quarter as the gate)
- **Reviving retired cards** (S5/S6/S8/SolarCard/WindCard/LoadCard) — only if Phase 10 surfaces a structural gap that one of them fills
- **Server-side user accounts** — only if email-digest subscriber list grows beyond ~500 and needs cross-device sync; otherwise stays anonymous browser-storage
- **Public KKME design-system NPM package** — if `/visuals` page traction warrants it, the primitives could ship as `@kkme/baltic-flex-ui` for designers/journalists who quote the language
- **Mobile native app** — never. Browser-only product.
- **Audience selector** (Developer / Trader / Financier persona switcher per audit §1.1) — interesting as concept but adds significant state-management complexity for unknown user-segmentation value. Defer until traction signals which audience to optimize for; the default "everyone sees everything" is fine for v1.
- **Forward curve content** — Phase 10.5.5 is on the roadmap but depends on having forward-data sources (ICE TTF, ICE EUA, forward Litgrid auctions). If those sources prove hard to license/scrape, defer or replace with KKME's own modeled forward curves with explicit caveats.
- **Public quarterly content artifacts** — once Phase 17.4 daily regime-call data accumulates, the quarterly aggregate post becomes content work (writing + design). Treat as content production, not engineering.
