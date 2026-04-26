# KKME Upgrade Master Plan

**Status snapshot (2026-04-26):**
- F1–F4 shipped on `phase-7-5-F-card-redesign` branch, PR #27 open, merge conflict on `phase7-5-F-resume-prompt.md`. F5-lite is in flight in CC.
- **Five reviews absorbed:** (1) short UX/UI audit, (2) 10× dev+designer plan, (3) brand & graphic design plan, (4) deep numerical audit, (5) visual & gamification layer.
- Synthesis below sequences all five into a multi-phase roadmap; F5-lite is the only piece that runs against the existing branch — every phase from 7.6 onward starts on a fresh branch off main.
- This document is the living tracker. Each phase has a checkbox; update on completion. Don't archive old phases — strike them through so the history reads as a build log.

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

**P7 · Engagement layer (gamification) — PENDING.**
> Visual review §15 proposes a KKME Pass (anonymous browser-stored profile with streak, level, badges), public weekly leaderboards (dispatch optimization, prediction accuracy), and daily "ping" notifications. Per-card games include "Build your own day" arbitrage drag, "Beat the TSO" imbalance prediction, "Predict 2028 fleet" slider, "Today's Map" daily question, "Dispatch champion" leaderboard, "What changed this week" Friday quiz.
>
> *Recommendation:* SELECTIVE adoption. The daily Friday quiz is high-leverage and low-conflict — a 60-second knowledge-check email becomes a sticky weekly artifact for industry insiders. The "Stress your asset" Returns sliders and "Configure your project" cost calculator are functional, not gamified — adopt as primary features (already in Phase 10.5). Skip the streak/level/badge profile system, the daily map question, and the public leaderboards — these conflict with P4 ("quiet technical publication, numbers as heroes") and risk turning the site into a toy.
>
> Decide before kicking off Phase 17. F5-lite, 7.6, and 8–16 do not depend on this.

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

### Phase 8 — Foundation Sprint (tokens, typography, primitives, microbrand)

**Branch:** new `phase-8-foundation` off main.
**Maps to:** Brand review Sprint 1; 10× review Tier 0 #1, #3.

The keystone phase. Until tokens are real, every other design fix is duct tape.

- [ ] **8.1 — Complete semantic token layer.** Add `--success / --danger / --mint / --coral / --lavender / --sky / --ink / --ink-muted / --ink-subtle / --paper` as named aliases over existing primitives. Full light/dark pairs. Audit every hardcoded hex/rgba and pull through tokens. (Pending P1 decision for color grammar interpretation.)
- [ ] **8.2 — Three-voice typography system.** Display serif (recommend Fraunces with optical-size axis), mono (JetBrains Mono or Berkeley Mono), body sans (Inter). Replace the dead Super Sans/Serif/Mono VF requests. Build the `--type-hero / --type-number-xl / --type-number-l / --type-section / --type-eyebrow / --type-body / --type-caption` ramp. Apply `font-variant-numeric: tabular-nums` globally on mono.
- [ ] **8.3 — Core primitives.** `<MetricDisplay>` (value + unit + vintage glyph O/D/F/M + label + delta + regime + **optional P10/P50/P90 fan** + **optional sample-size N badge** + **methodology version stamp**), `<Source>` (favicon + domain + last-fetched + timezone), `<Icon>` (sprite reference), `<Eyebrow>`, `<Hairline>`, `<AnnualisedTwin>` (renders muted `× 365` companion below any €/MW/day or €/MWh number — implements 7.6.17 rule), `<HaircutToggle>` (theoretical vs realistic on annualised offer values — implements 7.6.18 rule). Storybook entry per primitive. Type the `Metric` interface so renderer can never display a unitless or unstamped number (per 10× review Tier 4 #5).
- [ ] **8.3b — Visual atom primitives** (per visual review §1; these are the four shared visual primitives that account for ~70% of the surface): `<DistributionTick>` (1px hairline + tick mark showing where today's value sits across min / p25 / p50 / p75 / p90 / max — used 50+ times across the site), `<RegimeBarometer>` (horizontal bar tight→compressed→normal→wide→stress with vertical needle for today's reading; uses semantic palette per P1), `<VintageGlyphRow>` (16×16 pill row for O/D/F/M provenance — extracted as standalone for cards where MetricDisplay is overkill), `<CredibilityLadderBar>` (horizontal stacked bar from intention → reservation → permit → agreement → construction → operational; reusable across pipeline, project counts, asset funnel). Each is a single visual atom; reuse — not bespoke per card — drives coherence.
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
- [ ] **10.2 — Migrate S1/S2/S3/S4/S5/S6/S7/S8 to variants.** Most become DriverCard; one or two get HeadlineCard treatment per section.
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

**Estimated effort:** 4–5 CC sessions. Card-by-card visualization upgrade is the largest individual workstream in the plan after Phase 8.

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
- [ ] **13.4 — Methodology permalinks.** Per P3: public pages for commodity formulas, drawer-only for proprietary analytics. Schema.org Dataset markup per page.

**Estimated effort:** 1.5 CC sessions.

---

### Phase 14 — IA, navigation, accessibility

**Branch:** new `phase-14-ia-a11y` off main.
**Maps to:** UX audit §3, §5; 10× review Tier 3.

- [ ] **14.1 — Anchor IDs match nav labels.** `#signals / #build / #structure / #returns / #trading / #intel / #contact`. 301 fragment redirects from old IDs.
- [ ] **14.2 — Section reorder.** Hero → Structure → Signals → Trading → Build → Returns → Intel.
- [ ] **14.3 — Sticky TOC ≥1280px.** IntersectionObserver progress indicator.
- [ ] **14.4 — Keyboard layer.** `?` help overlay, vim-style `g s / g b / g r`, `[`/`]` cycles scenarios, `t` theme, `m` map focus.
- [ ] **14.5 — Skip link, focus rings, ARIA audit.** axe-core in CI. Fix every contrast finding.

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

### Phase 17 — Engagement Layer (GATED on P7 decision)

**Branch:** new `phase-17-engagement` off main.
**Maps to:** Visual review §15 + per-card game elements scattered across §5–§13.
**Status:** PENDING P7 principle decision. Do not author Phase 17 prompt until P7 is locked. If P7 lands "skip the gamification entirely," delete this phase.

If P7 lands "selective adoption" (my recommendation), the scope is:

- [ ] **17.1 — Friday weekly quiz.** 60-second 5-question knowledge-check on the week's Baltic flexibility news. Streak counter, simple leaderboard. Email-deliverable for subscribers. Becomes the most-anticipated Friday-afternoon artifact in Baltic energy circles.
- [ ] **17.2 — Daily ping notification (opt-in).** Single line, once per day: *"Compressed regime, day 47. Today's spread sits at P15. Click to see why."* Email or browser push. The morning-coffee read.
- [ ] **17.3 — "Today's chain" interactivity.** Already in Phase 10.12 as a static causal visualization; in 17.3 add the tap-to-pin behavior so a user can lock the chain and watch how each link's value moves through the day. Light gamification, no streaks/levels.

**Explicitly OUT of scope** (per P7 recommendation, even under selective adoption — these conflict with P4):
- KKME Pass with browser-stored streak / level / badge profile system
- Public weekly leaderboards for dispatch optimization or prediction accuracy
- "Build your own day" arbitrage drag puzzle
- "Beat the TSO" imbalance prediction game
- "Predict 2028 fleet" public-aggregation forecasting
- "Today's Map" daily question
- "Dispatch champion" leaderboard
- "Day X of regime" streak counter on hero
- Particle effects unlocked at higher levels
- Any feature that turns the site into a toy

The "Configure your project" cost calculator and "Stress your asset" Returns interactive are functional features, not games — they live in Phase 10.5 (10.5.9 and 10.5.10) and are not gated on P7.

**Estimated effort:** 1.5 CC sessions if P7 says go.

---

## 3. Sequencing notes

- **Phases run sequentially**, not in parallel. Bandwidth is the rate limiter.
- **Phase 8 is the longest** because it's foundation work. Don't compress it.
- **Phases 9–13 can occasionally swap order** if a particular phase's dependency lands early. Phase 11 (layout/mobile/theme) can move earlier if mobile traffic shows up.
- **Each phase ends with screenshots committed** to `docs/visual-audit/phase-X/`.
- **Each phase ends with handover.md updated** with session log entry.
- **Each phase ends by updating this file** — check off completed items, strike through superseded ones, add findings to the session log section below.

## 4. Session log

> Brief entries per phase completion. Date, scope shipped, anomalies found, deferred items.

(empty — first entry will be F5-lite when it ships)

## 5. Out-of-scope but worth noting

- **Sound** (P6) — deferred indefinitely.
- **Single-card interactivity drilldowns** (e.g. clicking a sparkline point pins detail panel) — these were partly built in F4 and may be revisited if Phase 10 surfaces a need. Not actively scoped.
- **Subscriptions / paywall / accounts** — explicitly not in scope. KKME stays free-to-read; commercial path is consulting/data-licensing, not gated UI.
- **i18n beyond intel auto-translate** — the site stays English-primary. Translation of the entire UI to LT/LV/EE is deferred indefinitely.
