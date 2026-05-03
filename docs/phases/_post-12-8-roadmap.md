# KKME execution roadmap — consolidated final revision

**Authored:** 2026-05-03 from Cowork after four external audits + endpoint sweep + CC investigation + consolidated final revision.
**Branch state at authoring:** `phase-12-8-dispatch-render-error` in flight (Pause B passed, commits queued).
**Source documents:**
- 2026-04-29 audit (P0–P6 visual)
- 2026-05-03 audit #1 (deeper structural)
- 2026-05-03 audit #2 (execution-ready 6-tier plan)
- 2026-05-03 architecture proposal (4-layer hub-and-spoke) + operator pushback + **consolidated final revision** (the canonical document — auditor walked back overreach, removed hallucinations, kept what holds up)
- Cowork-side endpoint sweep 2026-05-03
- CC investigation 2026-05-03 (Phase 12.8 — bug is data-shape transient)

**This document supersedes prior versions of `_post-12-8-roadmap.md`.** Prior versions over-built around the multi-surface architecture proposal that the consolidated revision walked back. The plan below reflects the consolidated revision's framing: **stay single-page, make it more confident, two visual moments, one quiet relationship layer, daily editorial habit.**

---

## What was removed from the prior roadmap (and why)

| Removed | Reason |
|---|---|
| Phase 14 — ⌘K command palette | Auditor: overkill at current scale; pre-login site doesn't justify it |
| Phase 16 — Alerts layer | Auditor: defer until login + paying users; "natural pricing tier" framing was premature |
| Phase 17 — Historical scrubber | Auditor: demo feature without an audience yet; defer |
| Phase 18 — Methodology page (separate destination) | Auditor: keep inline as drawer; promotion dilutes the front page |
| Phase 13 (full scope) — Export + PDF + email | Auditor narrows to "Copy link to view" + email digest signup only |
| Phase 15 — Chart annotations as event lines | Not in consolidated revision; drop unless evidence emerges |
| Phase 12 (full scope) — Scenario explorer with multiple sliders | Auditor: only ONE slider on IRR card; multiple dilutes |
| Phase 10 — Comparison views (LT/LV/EE + 2H/4H + peer benchmarks) | Partial: 2H/4H already exists; LT/LV/EE side-by-side stays as later nice-to-have; peer benchmarks deferred |
| Hub-and-spoke multi-surface architecture | Auditor: enterprise-product thinking applied to single-author niche site; would worsen experience for current audience |

## What was added that the prior roadmap missed

| Added | Why |
|---|---|
| **Phase A — Five-chapter restructure** with right-edge dot indicator | Biggest single architectural change in consolidated revision |
| **Phase B — Composed hero visualization** | One of two "wow" moments; designer-week investment |
| **Phase C — Custom illustrations** (dispatch schematic + credibility ladder + country icons) | Auditor walked back data-ink doctrine for page-level work |
| **Phase D — Related-card hover layer** | Solves navigation problem without splitting pages |
| About-section strip | Operator confirmed: drop founder bio, keep quiet coda |
| Sparkline + delta on every hero (was Phase 8) | Confirmed as highest-leverage micro-pattern |

## Hallucinations / overreach corrected

| Earlier claim | Corrected framing |
|---|---|
| "Backtest chart shows 70% mean error against flat line" → credibility crisis | Caption clarification — the dashed line may be deliberate Y1 anchor; verify intent before reframing |
| "Percentile toggles do nothing" → wire to chart overlay | Audit-first — controls may drive non-visible state, may be intentionally subtle, or may need stronger affordance for "click for details" |
| "Keyboard shortcuts broken" → full nav-sync | Audit-first — some shortcuts work; the load-bearing fix is visible feedback (200ms outline flash on destination) |

---

## The consolidated framing

Five visually-distinct chapters on one URL, navigated by right-edge dot indicator. Two "wow" moments. One quiet relationship layer. Daily editorial habit. No multi-surface architecture, no command palette, no workspace, no alerts, no founder bio.

| Chapter | Position | Density register | Purpose |
|---|---|---|---|
| 1. Live state | Hero | Composed (single scene) | Three-second visual proof: this is real-time Baltic flexibility |
| 2. Today's signal | New editorial band | Lowest density, generous whitespace | Daily one-sentence + supporting chart; "wow" moment + retention engine |
| 3. Dispatch story | Merged Revenue + Dispatch | Medium density, illustrated | Composed visualization showing battery cycle through the day |
| 4. Economics | Merged Build + Returns | Highest density, table-like | Analyst working area; IRR sensitivity slider lives here |
| 5. What's moving | Merged Structure + Intel | Feed-style, chronological | Weekly scan-for-what's-new |

About / contact = quiet coda paragraph at the foot. No bio.

---

## Sequence (8-10 weeks total)

### Tier 0 — Bug fixes (this week, ~13-18h)

#### Phase 12.8 — Dispatch render-error fix [IN FLIGHT]
**Status:** Pause B complete. Commits queued. Defensive guards + CardBoundary upgrade. Ships preventive hardening (audit's transient SIGNAL ERROR doesn't currently reproduce).

#### Phase 12.10 — Data discrepancy hot-fix bundle [NEXT — URGENT, NEW]
**Why:** A 2026-05-03 fact-check audit cross-checked KKME numbers against primary sources (Litgrid, Energy-Charts, BTD) and found three primary-source-contradicted values + one likely 2× revenue overstatement. For a market-intelligence product whose positioning IS data accuracy, wrong numbers bounce every domain expert who fact-checks — that's the audience that pays. Higher priority than light-mode rebuild for the institutional audience.

**Verified findings (Cowork-side curl confirms):**
- LT installed storage worker returns 484 MW from "Litgrid, 2026-03-23" — 41 days stale. Litgrid's current value is 506 MW (353 transmission + 153 distribution).
- aFRR P50 headline €13.5/MW/h ≈ afrr_up_avg (7.98) + afrr_down_avg (5.15). Card describes one-direction product. 2× overstatement risk for downstream readers.
- baltic_total (651 BESS-only) vs fleet.baltic_operational_mw (822 incl. Kruonis pumped hydro) labeled as same metric without disclosure.

**Scope (categories A–D):**
1. **Worker-side: refresh stale buildability assertions.** Update `installed_storage_lt_mw` 484 → 506 (per Litgrid 2026-04-23). Audit `installed_storage_lv_mw`, `installed_storage_ee_mw`, `under_construction_storage_ee_mw` for similar staleness. Refresh via `POST /s4/buildability` with current values + new `last_verified_at` timestamp.
2. **Frontend: rename Baltic fleet metrics to disclose composition.** Rename / footnote so that `baltic_total.installed_mw` is clearly "Baltic BESS installed" and `fleet.baltic_operational_mw` is clearly "Baltic flexibility fleet (BESS + Kruonis PSP + construction-phase)". Tooltip explanation on hover.
3. **Frontend: compute peak/trough hour-of-day from hourly data.** Replace hardcoded "Peak h10 EET / Trough h3 EET" labels with computed `Math.argmax(hourly_lt)`. Fix DA swing trough display to use actual day's min, not whatever `€98.8` was computing.
4. **Frontend: fix "7.0% Project IRR" caption mislabel** under 30D capture sparkline. The sparkline shows capture trend, not IRR.
5. **Methodology disclosure: aFRR direction.** Either label headline as "aFRR up+down combined" + add halved one-direction sub-line, OR halve the headline to one-direction P50 and explain.
6. **Sanitize unsourced model-confidence language:**
   - "Calibrated against Tier 1 LFP integrator consensus" → either source it (cite the consensus document) or weaken to "operator estimate calibrated against public market research"
   - "Cross-supplier consensus" 0.20pp/yr RTE decay → cite or weaken
   - "Canonical" dispatch model → remove the word
   - "KKME proprietary supply-stack model" → cite the methodology page or weaken
**Estimate:** ~3-5h. Worker deploy required (for buildability refresh).
**Acceptance:** every cross-checked KKME number reconciles with its cited primary source within ±5% (or has a documented definitional difference); aFRR headline methodology is unambiguous; no unsourced "consensus" claims remain in copy.

#### Phase 12.8.0 — Audit-first percentile/keyboard + ticker + light-mode investigation [REVISED 2026-05-03 SESSION 28]
**Why:** Three Tier 0 fixes plus a mandatory writeup of why light mode does NOT need the rebuild the audit asserted.
**Scope:**
1. **Light mode** — investigation only (Path D). The audit's "highest-priority bug, only 6 of ~50 light overrides, white-on-white country labels" claim was empirically false: 152 root tokens, 114 light overrides, 38 intentionally theme-agnostic; HeroBalticMap fully tokenized; visual screenshots confirm parity with dark mode in dev + production. One unrelated cosmetic fix (`ContactForm` dropdown chevron). Full writeup: [docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md](../investigations/phase-12-8-0-light-mode-audit-vs-reality.md).
2. **Percentile tiles** — Path C (static labels, drop click handler). Tiles called `openDrawer('what')` with no per-tile parameter; drawer content was generic. Standard dashboard stat-strip pattern.
3. **Keyboard shortcuts** — single-source-of-truth `app/lib/keyboard-shortcuts.ts`, S/B/T/R/D/I/C + `?` mapping, fix `s → revenue-drivers` (was `signals`, missing id) and `t → structural` (was `m → context`, missing id), 200ms teal outline flash on every shortcut, simple `?` help overlay (Phase A will rebind to chapter numbers 1-5 anyway).
4. **Ticker** — pause-on-hover + edge-fade mask + robustified `prefers-reduced-motion` selector (was a brittle `[style*="tickerScroll"]` attribute selector).
**Estimate:** ~2-3h actual (down from prompt's 4-6h after light-mode rebuild dropped to investigation-only).
**Process finding:** 3 of 4 visual-inference audit claims from audit #2 confirmed hallucinated. Audit-credibility taxonomy and triage rule documented in handover Session 28.

#### Phase 12.8.1 — Backtest dashed-line caption clarification [REVISED]
**Why:** Auditor walked back the credibility-crisis framing. The dashed line may be a deliberate Y1 anchor, not a failed model prediction. Don't reframe — clarify.
**Scope:**
1. Read the chart code; identify what the dashed line actually represents
2. If it's a deliberate Y1 anchor: update caption to say so explicitly. *"Y1 model anchor (€368/MW/day, scenario base, conservative). Realised has tracked +70.9% above this anchor — model is intentionally conservative."*
3. If it's intended as a per-period model prediction but currently rendered flat: that's a real bug; replace with time-varying line OR hide chart with placeholder ("Per-period backtest in progress") until reimplemented.
4. Add MAE alongside mean error in caption per audit recommendation.
**Estimate:** ~30-60 min depending on which path applies.

#### Phase 12.9 — Worker + header KPI hot-fix bundle
**Scope:** SignalBar S/D RATIO migration (1 line); /da_tomorrow upstream-error handling; /health endpoint expansion to all 16 KV keys; /extreme/latest TTL backstop; /s9.eua_trend regeneration.
**Estimate:** ~1.5-2h. Worker deploy required.

#### Phase 4G — Intel feed encoding + count cleanup
**Scope:** Python URL-decode encoding fix (cp1257/latin-1 → UTF-8); one-shot mojibake backfill purge; IntelFeed badge denominator alignment.
**Estimate:** ~1.5h.

---

### Tier 1 — Foundation (~2-3 weeks)

#### Phase 12.12 — Data integrity infrastructure [NEW, PARALLEL TO 7.7g]
**Why:** Phase 12.10 fixes specific discrepancies the audit found. Phase 12.12 prevents the next class. The 41-day-stale Litgrid assertion shipped to production silently — that's a process failure, not just a data failure. Without infrastructure, the audit findings recur.
**Scope:**
1. **Schema validation at fetch boundary.** Zod schemas for every upstream API response (`fetchLitgridFleet`, `fetchBTDActivation`, ENTSO-E A44 / A75 / A65, `fetchEnergyCharts`, ECB Euribor). On schema drift, fail-loud (worker logs + Telegram alert) instead of silently degrading.
2. **Hardcoded-assertion freshness gates.** Every operator-curated value in `s4_buildability` gets a `last_verified_against_source_at` field. Frontend cards display "Source: Litgrid, verified 41 days ago" with amber chip if > 14 days, red chip if > 30 days. Forces operator to refresh.
3. **Daily reconciliation cron.** New worker function `reconcileAssertionsToSources()` that scrapes Litgrid + AST + Elering + APVA + VERT + ETS once daily, compares to hardcoded `s4_buildability` values, alerts (Telegram) on > 5% drift. Output to KV `reconciliation_log` + a `/reconciliation` endpoint for operator inspection.
4. **Per-metric provenance footer.** Every displayed number gets a hover-tooltip showing source + last-verified-at + computation chain. Example: "486 MW = Litgrid TSO-grid 353 + Litgrid distribution 153, scraped 2026-05-03 09:00 UTC; verified against Litgrid Įrengtoji galia page". Single primitive `<MetricProvenance>` for consistent application.
5. **Reconciliation test suite.** Vitest specs that pull live worker payloads + assert internal consistency:
   - `baltic_total.installed_mw === sum(country installed_mw)`
   - `fleet.baltic_operational_mw >= baltic_total.installed_mw` (fleet must include all BESS plus pumped hydro)
   - `aFRR P50 documented direction matches text description in IntelFeed`
   - For each card showing a "Source: X" attribution, the displayed value must match the worker payload field declared in `chart-inventory.md`
   - Run nightly via GitHub Actions cron; alert on failure
6. **Methodology version banner.** Worker `model_version` already exists; surface it on every revenue-derived number with a "v7.3 · methodology" link to the full methodology page (or drawer pending Phase A restructure).
**Estimate:** ~5-7 days. Significant worker work + frontend primitive + CI integration.
**Acceptance:** schema-drift detection live; staleness chips visible; daily reconciliation log populated; all reconciliation tests passing nightly.

#### Phase 7.7g — Token rebuild + 5-primitive system [RE-SCOPED, NARROWER THAN PRIOR]
**Why:** Foundation that everything else sits on. Consolidated revision is more disciplined than my prior version: explicit small numbers, no aspirational tokens.
**Scope:**
1. **Typography:** 5 sizes only (hero, section, card-title, body, caption). 2 weights only (regular, medium). Drop Cormorant serif treatment for prose; single sans-serif throughout. Mono only for tabular numerals + labels. Pixel KKME mark for wordmark only. **OPERATOR DECISION REQUIRED:** drop serif (auditor) or hold the line on three-typeface principle (locked).
2. **Spacing:** 8 values (4, 8, 16, 24, 32, 48, 64, 96 px). Nothing else.
3. **Accent colors:** 3 semantic (positive, warning, negative). The current teal does 4 jobs (live, good, selected, primary action) — one job needs to move to a different treatment (underline or solid fill).
4. **5 primitive components,** every card rebuilt from these:
   - **`Stat`** — eyebrow label + hero number + delta + sparkline + footer
   - **`Card`** — consistent padding + border
   - **`Badge`** — three variants (status, severity, neutral)
   - **`Chart`** wrapper — consistent title + source row + controls
   - **`Drawer`** — named, counted, expandable
5. **`numberFormat.ts`** — integers for MW; 1 decimal for ratios; no decimals for %; thin-space before unit; comma thousands separators.
6. **rgba/hex regression cleanup** — fix 213 rgba violations. Add CI grep gate.
7. **Worker URL centralization** — single `app/lib/worker-url.ts`; migrate 16 sites.
**Estimate:** ~2 weeks. May split into 7.7g-a (tokens + utility), 7.7g-b (primitives + card migration), 7.7g-c (regression cleanup + CI gate).
**Acceptance:** every page element expressible as one of the 5 primitives; CI fails on new rgba/hex/hardcoded URL.

---

### Tier 2 — Chapter restructure (~1 week)

#### Phase A — Five-chapter restructure + dot indicator [NEW, BIGGEST PERCEIVED-QUALITY CHANGE]
**Why:** Auditor's central architectural recommendation. Same total scroll length, but eye gets reset between chapters, brain registers progress, returning analyst can jump to chapter 4 by recognizing its silhouette.
**Scope:**
1. Re-group existing sections into 5 chapters per the framing table above.
2. Each chapter gets a visibly different layout register (proportions, density, rhythm).
3. **Right-edge floating dot indicator** — 5 dots, fixed position right-middle of viewport, current chapter filled, others outlined. Click dot → smooth scroll to chapter. Hover dot → tooltip with chapter name.
4. Replace top nav labels with chapter names (Live · Today · Dispatch · Economics · Moving). Anchor scrolling, smooth behavior.
5. Re-bind keyboard shortcuts to 1-5 (chapter numbers) per consolidated revision.
6. Remove existing top nav clutter — no breadcrumb, no left rail, no command palette. The dot indicator IS the navigation system.
7. **About section** — strip founder bio entirely. Replace with one paragraph: what KKME tracks, who it's for, how to get in touch. No name, no photo. Quiet coda.
**Estimate:** ~1 week.
**Acceptance:** scroll progress visible at all times via dot indicator; pressing 1-5 jumps to chapters with 200ms outline flash on destination header.

---

### Tier 3 — Two moments of presence (~2 weeks)

#### Phase B — Composed hero visualization [NEW, "WOW" MOMENT #1]
**Why:** Auditor: *"the kind of thing the FT and Bloomberg invest a designer-week in and use for years."* Replaces current multi-widget arrangement (separate map + tickers + side-rail metrics) with one unified scene.
**Scope:**
1. Map as canvas (existing HeroBalticMap as base).
2. Animated interconnector flow particles, speed proportional to live MW from `/s8` `freshness` data.
3. Hero capture number sits beside map, ticks visibly when /s1 polls and value changes (digit-flash green/amber for 400ms — Bloomberg signature).
4. Side-rail metrics tied to specific points on the map by faint connecting lines (e.g. FCR demand metric → connects to a point near Vilnius; aFRR clearing → connects to LT TSO icon).
5. Live status dot pulses at 1Hz with 60% opacity ring.
6. Reader sees in three seconds: real-time view of a specific market.
**Estimate:** ~1 designer-week (5-7 days).
**Acceptance:** single composed scene reads as one visual unit, not five widgets.

#### Phase 12 — IRR sensitivity slider on Returns card [REVISED — ONLY ONE SLIDER]
**Why:** Auditor: *"only one slider, only on this card. Adding interactivity everywhere dilutes it."* Demonstrates what KKME does in a way no static chart can. Power users screenshot it; casual users play with it.
**Scope:**
1. ONE slider on the Returns card: drag CAPEX from €120 to €262 per kWh.
2. IRR / payback / LCOS reflow live as the slider moves.
3. Visible tick marks at the three scenario points (low / mid / high) with labels.
4. URL persistence (`?capex=164`) — shareable.
5. "Reset to base" button.
6. Mobile: vertical layout.
**Estimate:** ~1 designer-week.
**Acceptance:** dragging the CAPEX slider visibly reflows the three downstream numbers without a page reload.

**Replaces / supersedes:** Phase 7.7c Session 2 (capital-structure sliders).

---

### Tier 4 — Connection + content layer (~2 weeks)

#### Phase 7.7f — Chart insight upgrade [TIGHTENED FROM PRIOR]
**Scope:**
1. **DA Arbitrage chart (S1)** — add P25–P75 percentile band as translucent fill (drawn from existing P-numbers in card header), mark median as dashed line, mark today's value as labeled dot.
2. **aFRR chart (S2)** — add 12-month rolling-average overlay so "stable" claim is visually verifiable.
3. **Dispatch stacked bar (TradingEngineCard)** — overlay DA price line on secondary axis. The interaction between price spikes and revenue allocation is the actual story.
4. **IRR sensitivity (RevenueCard)** — replace yellow-blob area chart with **tornado bar chart** ranked by absolute impact. Canonical project-finance affordance.
5. **Sparkline + delta beneath every hero number** — universal HeroDelta primitive applied to ~30 sites (S1, S2, S5, S4, TradingEngineCard, RevenueCard).
6. **Per-chart methodology checklist applied before merge:** task stated in one sentence above chart; today/now marked; reference context (band/baseline/peer); accessible data table for screen readers.
**Estimate:** ~1 week.
**Note:** Backtest chart fix moved to Phase 12.8.1 (caption clarification, separate Tier 0).

#### Phase D — Related-card hover layer [NEW]
**Why:** Auditor: *"the navigation that works best is the one the reader does not need to use."* Solves "I'm looking at IRR and want to see what depends on it" without adding pages or nav.
**Scope:**
1. `app/lib/card-relationships.ts` — pre-defined lookup table mapping each metric to its 2-3 connected metrics.
2. On hover any metric, related metrics elsewhere on page receive subtle outline (1px teal at 0.4 opacity, smooth fade-in).
3. Invisible until hover; never required.
**Estimate:** ~2 days.
**Acceptance:** hovering capture number lights up DA arbitrage chart + renewable mix card; hovering IRR lights up CAPEX card + capture sparkline.

#### Phase 11 — Glossary acronym tooltips
**Scope:**
1. `app/lib/glossary.ts` — `{ acronym: { full, definition, link?, formula? } }`. ~25 terms.
2. `<Acronym term="DSCR">DSCR</Acronym>` primitive — dotted underline + hover tooltip with definition + canonical formula + source link.
3. Replace plain-text acronyms across cards (start with worst offenders: RevenueCard, TradingEngineCard, S1Card, S2Card).
4. Sync with existing `docs/glossary.md`.
**Estimate:** ~2-3 days.

#### Phase C — Custom illustrations [NEW]
**Why:** Auditor walked back data-ink doctrine for page-level work. *"More visuals would help, not fewer."*
**Scope (three illustration moments):**
1. **Dispatch decision schematic** in Chapter 3 — small SVG showing battery cycling through a day with revenue building up by source. Half explainer, half live data.
2. **Credibility ladder illustration** in Chapter 4 — illustrated diagram showing how pipeline MW are filtered down to operational MW (operational → construction → agreement → application). Visual metaphor for the existing `flexibilityFleetMw()` weighting.
3. **Map-derived country icon system** — small consistent icons used for country-specific facts site-wide.
**Estimate:** ~1 week if commissioned; ~3-4 days if adapted from existing assets.
**Acceptance:** three illustrative moments shipped; each communicates a concept that prose alone couldn't.

---

### Tier 5 — Editorial layer (~3 days build + ongoing)

#### Phase 9 — "Today's signal" editorial band (= Chapter 2 content)
**Scope:**
1. Worker `/digest/today` endpoint returning `{date, headline, supporting_chart_id?, source_url?}`.
2. Operator hand-writes via `POST /digest/update` (UPDATE_SECRET-gated).
3. `<TodaysSignal>` component reads /digest/today, renders one big sentence + one chart sized to fill the chapter.
4. Archive accessible via small "previous days" link beneath the chapter.
**Estimate:** ~3 days build.
**Editorial commitment:** ~5 min/day (consider daily as a habit, weekly as a minimum).
**Acceptance:** populated daily by 10:00 UTC weekdays.

#### Phase 13 — Email digest signup [NARROWED FROM PRIOR]
**Scope:**
1. Single signup field on the page (footer + Chapter 5).
2. Resend API (already used by ContactForm).
3. Weekly digest auto-composed Friday morning summarizing week's "Today's signals" + key intel items + one chart.
4. Track signup count anonymously (no PII).
**Estimate:** ~2 days build + ongoing weekly composition (~30 min/week).
**Note:** Removed from prior plan: PNG export, PDF export, daily digest variant. Auditor narrows scope.

#### Phase 19 — "Submit market lead" promotion (small)
**Why:** Auditor: *"unique value proposition the site is hiding."*
**Scope:** move CTA from buried footer to inline card in Chapter 5 ("What's moving"). Add Credits page listing data sources (no contributor names unless contributors consent).
**Estimate:** ~2h.

---

### Tier 6 — Mobile + accessibility + polish (~1-2 weeks)

#### Phase 11.2 — Mobile pass
**Scope:** per 2026-04-29 audit P3 — render hero map portrait crop, CSS grid hero reorder, topbar metrics scroll-snap, marquee ticker overflow containment, fluid type via clamp(), logo max-width, Playwright snapshot regression at 390×844 + 768×1024. Chapter restructure (Phase A) needs mobile-aware layout where dots become bottom-of-viewport horizontal swipe-aware dots.
**Estimate:** ~1 week.

#### Phase 20 — WCAG AA + axe-core formal audit
**Scope:**
- Run axe-core against every route, fix every violation.
- Particular attention: tertiary text contrast (currently <4.5:1 for source/footer lines).
- Keyboard navigation: every interactive element reachable by Tab in logical order, focus rings visible.
- Screen-reader audit: chart `<figure>` + `<figcaption>` + hidden data table per chart.
**Estimate:** ~1-2 days.
**Acceptance:** 100% axe-core clean on top routes; zero violations.

#### Phase 21 — Print stylesheet
**Scope:** `@media print` switches to white bg + black text + removes nav/tickers; one chapter per page.
**Estimate:** ~3-4h.

#### Phase 22 — OG image generation
**Scope:** worker `/og?dur=4h&capex=mid` returns 1200×630 PNG with hero state rendered server-side; meta tags wired.
**Estimate:** ~4-6h.

#### Phase 23 — Animated SVG favicon
**Scope:** pixel KKME mark static favicon + animated variant with live-status-dot pulse for browsers that support.
**Estimate:** ~1-2h.

#### Phase 25 — Empty state design
**Scope:** explicit "Quiet hour" / "Source unavailable" / "Awaiting first publication" states for each signal card.
**Estimate:** ~3-4h.

#### Phase 26 — Polish bundle [REMAINING SMALL ITEMS]
**Scope:** items from earlier audits that don't fit elsewhere —
- Audit #1 — duplicated "Dispatch intelligence" eyebrow + section heading
- Audit #3 — hand-drawn arrow in Engine assumptions linking RTE 85% to paragraph (looks like leftover Figma annotation)
- Audit #4 — FCR-reopens callout demote (over-saturated)
- Audit #5 — `v7.3` superscripts removed (move to single footer)
- Audit #12 — duplicate "Start the conversation" CTA dedup
- Audit #14 — top progress bar audit
- "Reading this card" rename → `Methodology (3 paragraphs)` pattern + chevron
- `▸▸` double-chevron typo fix
- External link `↗` standardization via `<ExternalLink>` component
- Bottom marquee KPI dedup vs above
- HeroMarketNow.tsx delete decision (B-009)
- ColorTuner.tsx:60 console.log cleanup
- Map background seam (P4)
- Color semantics conflation (red = COMPRESSED + red = OUTDATED)
- Navigation labels contrast bump (now obsolete after Phase A nav replacement, but check anyway)
- "Get in touch" button visual integration (same — Phase A may resolve)
**Estimate:** ~4-6h.

---

## Operator decisions still required

These don't block the next 4-5 phases but become blockers further down. Answer when ready.

1. **Typography overhaul** — drop Cormorant serif (auditor directive — confirmed in consolidated revision) or hold the line on three-typeface principle (locked design principle)? **My recommendation: drop the serif for prose, retain mono for tabular numerals + labels. The auditor is right that the serif feels out of register against the terminal aesthetic. Locked principles are guidelines, not vows.**
2. **Light-mode rebuild path** (Phase 12.8.0 #1) — full rebuild (~3-4h), constrained rebuild (~2h), or remove toggle (~30 min)? **Default to constrained if override gap > 30 vars at investigation.**
3. **Phase 9 daily digest cadence** — daily commitment (~5 min/day) or weekly minimum?
4. **Phase B composed hero visualization** — designer-week investment (~5-7 days). Confirm scope before launching.
5. **Phase C custom illustrations** — commissioned (~1 week, costs design budget) or adapted from existing assets (~3-4 days, in-CC scope)?

---

## Total estimate (consolidated final)

| Tier | Phases | Days |
|---|---|---|
| 0 — Bug fixes | 12.8 + **12.10** + 12.8.0 + 12.8.1 + 12.9 + 4G | ~3-4 days |
| 1 — Foundation | **12.12 (data integrity)** + 7.7g (tokens + 5 primitives) | ~12-15 days |
| 2 — Chapter restructure | Phase A (5 chapters + dot indicator + about strip) | ~5 days |
| 3 — Two moments of presence | Phase B (hero viz) + Phase 12 (IRR slider) | ~10 days |
| 4 — Connection + content | 7.7f (charts + sparklines) + Phase D (hover) + Phase 11 (glossary) + Phase C (illustrations) | ~12 days |
| 5 — Editorial | Phase 9 (digest) + Phase 13 (email) + Phase 19 (lead promo) | ~3 days build |
| 6 — Mobile + a11y + polish | 11.2 + 20 + 21 + 22 + 23 + 25 + 26 | ~6-8 days |
| **Total** | 20 phases | **~55-65 focused days ≈ 9-11 weeks** |

Adds Phase 12.10 (Tier 0 data hot-fix, ~3-5h) and Phase 12.12 (Tier 1 data integrity infrastructure, ~5-7d) on top of the prior consolidated estimate. The 1-week add reflects the data-accuracy work the third audit surfaced as critical.

---

## Dependencies + sequencing notes

- **Tier 0 ships this week** (~2-3 days). Highest impact-per-hour. Closes the worst bounce-triggers.
- **Tier 1 (7.7g) is the foundation** but unlocks every subsequent phase via the 5 primitives. Don't skip.
- **Tier 2 (Phase A) depends on Tier 1's `Chart`, `Stat`, `Card` primitives.** Sequence after.
- **Tier 3 phases run parallel to each other** but both depend on Tier 1's `Chart` primitive.
- **Tier 4 phases run parallel** — chart upgrades, hover layer, glossary, illustrations are independent of each other.
- **Tier 5 is editorial-commitment-heavy.** Build is small; sustaining the daily digest is the operator's ongoing work.
- **Tier 6 is the polish-and-correctness pass.** Mobile is the largest single item.

**Deferred / un-queued (per consolidated revision):**
- ⌘K command palette (overkill at scale)
- Alerts layer (no login, no paying users yet)
- Historical scrubber (no audience)
- Methodology as separate destination (keep inline as drawer)
- Multi-page architecture (worsens current audience experience)
- Workspace / paid tier (no audience to justify)
- Founder bio in About (mystery is brand asset)
- Comparison views with peer benchmarks (defer; LT/LV/EE side-by-side stays as later nice-to-have)
- Chart annotations / event lines (no clear evidence of need)

---

## Update protocol

When a phase ships:
1. Mark its entry above with `[SHIPPED <date>]` and merged PR number.
2. Re-rank remaining phases if priorities shifted.
3. Move shipped entry to "Shipped" appendix below.
4. Sync canonical state into `docs/handover.md` Session log.

This document is the planning layer; `docs/handover.md` is the canonical state-of-the-world layer. When they diverge, handover wins (per `CLAUDE.md`).

---

## Shipped appendix

(populated as phases close)

**End of roadmap.**
