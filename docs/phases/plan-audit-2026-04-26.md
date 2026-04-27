# Master plan critical audit (2026-04-26, mid-Phase-8)

Done while CC works on Phase 8 Session 1. Reviews each subsequent phase for over-scoping, hidden risk, redundancy, and ordering problems. Recommends revised structure for everything after Phase 8.

---

## TL;DR

Five structural issues:

1. **Phase 7.7 is two phases pretending to be one** — UI binding (low risk) + engine work (Monte Carlo, indexing, PPA-tolling, real-options, capital structure live recompute) all bundled together.
2. **Phase 8 sessions 2–4 contain hidden design dependencies** — logo system + icon sprite + design system pages need real design assets from Kastytis (Figma/Illustrator), not CC-invented decisions.
3. **Phase 10 has 18 sub-items** — too coarse. Card-specific upgrades (10.10) is itself 12 distinct features.
4. **Phase 10.5 has 16 new shareable cards** — also too coarse. Tier them; ship the top 4 only as Phase 10.5, defer the rest.
5. **Phase 15 has internal redundancies and misnamed items** — 15.5 (math unit tests) is already established in 7.6; 15.3 (ISR per data source) doesn't apply to a static-export site.

Plus several inter-phase placement issues: `<DataState>` should move from 7.9 to 8; `useScenario()` permalink should move from 7.9 to 15.1's prerequisites; `/policy` page in 7.8 is redundant with 7.10 regulatory feed.

---

## Per-phase critical review

### Phase 7.7 — Financial Model Exposure + Bankability (MAJOR SPLIT REQUIRED)

**Issue 1: UI binding and engine work mixed.** Items 7.7.1, 7.7.2, 7.7.6, 7.7.10, 7.7.12, 7.7.13, 7.7.14 are pure UI binding to existing payload (low risk). Items 7.7.3 (LCOS), 7.7.4 (capital structure live recompute), 7.7.5 (aux/availability), 7.7.7 (revenue stack), 7.7.8 (real/nominal indexing), 7.7.9 (MOIC), 7.7.11 (Monte Carlo), 7.7.15 (real-options), 7.7.16 (PPA/tolling) are engine work (higher risk, deploy gating, longer testing).

**Issue 2: Monte Carlo (7.7.11) on Cloudflare Workers.** 1000 iterations × 20-year DCF probably blows the worker CPU limit (50ms free, 30s paid). Either pre-compute scenarios at deploy time and cache in KV, OR run on the client as WASM, OR drop to ~100 iterations with documented confidence bands. This is a non-trivial architecture decision — needs scoping before it's a sub-item.

**Issue 3: Real/nominal indexing (7.7.8)** is a worker refactor touching 100+ payload fields. Adding `priceBase: "EUR2026"` to every monetary value is a type-system overhaul. Probably its own phase.

**Issue 4: PPA/tolling toggle (7.7.16)** is a wholly new revenue engine path. Tolling has different cash-flow shape (fixed offtaker payments, no merchant exposure). Either its own phase or scope down to "label scenario as merchant-only, defer tolling support to a later content phase."

**Issue 5: Capital structure live recompute (7.7.4)** — sliders changing gearing/tenor/rate trigger a worker round-trip per slider change. UX feels laggy. Better: ship the engine as a client-side WASM module (big lift) OR pre-generate scenarios at request time and cache (smaller lift). Neither is in current scope.

**Recommendation — split into three phases:**

**Phase 7.7a — Financial display binding (1 session, low risk):**
- 7.7.0 worker output inventory confirmation
- 7.7.1 IRR split (project + equity)
- 7.7.2 DSCR triple (min + min_conservative + worst_month)
- 7.7.6 Degradation curve chart
- 7.7.10 Sensitivity tornado from existing 9-cell matrix
- 7.7.12 Backtest chart from existing 13-month array
- 7.7.13 Cannibalization curve from existing cpi
- 7.7.14 Market thickness label

This phase makes the cards look investor-grade immediately. Ship-blocker for credibility.

**Phase 7.7b — Engine extensions (2 sessions, medium risk):**
- 7.7.3 LCOS (€/MWh-cycled) — formula well-known, all inputs in worker
- 7.7.5 RTE + auxiliary load + availability factor visible
- 7.7.7 Revenue stack allocator confirmation/fix (the most consequential math check)
- 7.7.9 MOIC + payback variants
- 7.7.4 Capital structure controls (sliders → request-time recompute)
- 7.7.15 Real-options duration optimizer using existing irr_2h/irr_4h

**Phase 7.7c — Engine architecture (deferred / scoped separately):**
- 7.7.8 Real/nominal indexing (`priceBase` everywhere) — its own phase, type-system change
- 7.7.11 Monte Carlo P10/P50/P90 — needs architecture decision (KV-cached pre-compute vs client WASM vs reduced iterations)
- 7.7.16 PPA/tolling scenario toggle — wholly new engine path

This split maps to what's actually shippable in one session vs what needs more thought. Phase 7.7c items become future phases, not 7.7 sub-items.

---

### Phase 7.8 — Methodology + Glossary + Citations (DEFERS NEEDED)

**Issue 1: KaTeX is heavyweight.** ~400KB JS+CSS just for formula rendering. For ~20 formulas, that's expensive. Alternatives: pre-render formulas to SVG at build time (zero runtime cost), or use MathML (native browser, no library), or even static images with alt-text. Decision before authoring 7.8.1.

**Issue 2: /policy page (7.8.7)** overlaps with Phase 7.10 regulatory feed. The regulatory feed already curates Lithuanian + EU regulatory updates with policy categories. /policy as a separate static page would duplicate the same content. Consolidate: delete 7.8.7, let the regulatory feed (with category filter `=eu_regulation`) be the policy view.

**Issue 3: /data-revisions audit log (7.8.6)** requires backend infrastructure (detect when historical values change, log them queryable). High effort, unclear value. Defer until traction signals it matters.

**Issue 4: Content authoring scale.** /methodology with full formulas + worked examples for ~20 metrics is weeks of subject-matter writing. CC can scaffold the structure; Kastytis has to fill in the actual prose. Should be: 7.8.1a CC scaffolds structure + 1 example formula, 7.8.1b Kastytis writes each formula content over time as authoring capacity allows.

**Issue 5: /glossary content scale.** Same problem — 50+ Baltic energy terms with 2-line definitions. Scaffold with 10 most-used terms, expand over time.

**Recommendation — slim Phase 7.8 to actually-shippable scope:**
- 7.8.1a Methodology page scaffold + KaTeX/MathML/SVG decision + one formula as example (Gross Capture)
- 7.8.2a Glossary page scaffold + `<Term>` primitive + 10 most-used terms (aFRR, mFRR, FCR, P50, WACC, LCOS, DSCR, MOIC, BESS, BTD)
- 7.8.3 Citation system + `<Cite>` primitive + bibliography file
- 7.8.4 Disclosures + disclaimers (footer + per-page banner)
- 7.8.5a Model version stamp in footer (the /changelog page is folded in — version stamp links to a small `/about/changelog` markdown route)
- 7.8.8 Post-CE-sync (Feb 2025) versioning marker

**Defer or consolidate:**
- 7.8.5b Full /changelog page → eventually, but version stamp is the immediate need
- 7.8.6 /data-revisions audit log → backlog
- 7.8.7 /policy page → DELETED (use regulatory feed `?category=eu_regulation`)
- 7.8.9 Geometric vs arithmetic mean documentation → fold into individual formula explanations in 7.8.1

---

### Phase 7.9 — Sharability + Data States (PIECES BELONG ELSEWHERE)

**Issue 1: 7.9.5 `<DataState>` 4-state primitive** is foundational infrastructure. Belongs in Phase 8 (Foundation) so every card built in Phase 10 inherits it. Move to Phase 8 Session 2 or 3.

**Issue 2: 7.9.1 Permalink encoding** depends on Phase 15.1 `useScenario()` URL store. Without 15.1, 7.9.1 can't ship — there's no central scenario state to encode. Move 15.1 out of Phase 15 and make it a 7.9 prerequisite, OR delay 7.9.1 until after 15.1.

**Issue 3: 7.9.6 Share-scenario PNG with QR** overlaps with Phase 13.1 daily OG image AND 13.5 share-scenario PNG generator. Three places mention generating PNG snapshots with similar tooling. Consolidate: 13.1 owns the daily card pipeline (cron-generated), 7.9.6 + 13.5 collapse into one item ("on-demand share-scenario snapshot via /api/og/scenario").

**Recommendation — re-scope Phase 7.9:**
- Move 7.9.5 `<DataState>` → Phase 8 Session 2
- Move 15.1 `useScenario()` → Phase 7.9 prerequisite (becomes 7.9.0)
- 7.9.1 Permalink encoding (depends on 7.9.0)
- 7.9.2 Copy-number affordance
- 7.9.3 `<DataFigure>` + CSV download
- 7.9.4 /print route
- 7.9.6 Consolidated with 13.5 → `/api/og/scenario` route, used by both share button and Phase 13's daily card
- 7.9.7 Number a11y aria-labels (might fold into Phase 14.5 actually — a11y phase is the natural home)

Net: Phase 7.9 shrinks to 5 items, no overlapping work, dependencies explicit.

---

### Phase 8 — Foundation Sprint Sessions 2–4 (DESIGN ASSETS GAP)

**Session 1 (in flight):** 8.1 tokens + 8.2 typography. Scope is right.

**Session 2 (proposed):** 8.3 extend existing primitives + 8.3b new visual atoms + 8.3c-f formatNumber/DataState/Term/Cite. Reasonable scope.

**Session 3 issue: design assets.** 8.4 (~25 icon sprite) and 8.5 (logo system: wordmark variants, monogram, stamp, lockup-tagline, favicon set, apple-touch, safari-pinned-tab) require **actual design work**. CC should NOT be inventing icon designs or wordmark variants — those are visual identity decisions that compound across the brand.

**Three options for design assets:**
- **(A) Kastytis ships exports.** Open Figma/Illustrator, draw the 25 icons + logo variants, export as SVG. CC integrates. Cleanest but adds external authoring time.
- **(B) Use a system.** Lucide React (1300+ icons, MIT license, fits dot-matrix engineering aesthetic). For wordmark, optimize the existing kkme-white.png/kkme-black.png to integer-pixel-grid SVG.
- **(C) AI image generation.** Use an image gen tool to draft icon variants, Kastytis reviews and approves. Faster than (A), more bespoke than (B), but quality-control-heavy.

Recommendation: **(B) for icons, (A) for logo system.** Lucide React is industry-standard for engineering-aesthetic dashboards (Linear, Vercel, Stripe-style apps use it). Logo system requires hand work because the wordmark IS the brand.

**Session 4 issue: design system pages scope.** 8.6 says `/brand`, `/style`, `/visuals`, `/colophon`. That's 4 routes worth of content. Each needs:
- /brand — logo system display, clear-space rules, downloadable SVGs/PNGs
- /style — color palette display, type ramp, token reference, component examples
- /visuals — primitives doc + chart catalog + motion timings + (gated) game elements catalog
- /colophon — typefaces, color philosophy, data sources, build stack, person-behind-it prose

`/visuals` alone is substantial. Probably 1 full session.

**Recommendation — re-split Phase 8 into 5 sessions instead of 3-4:**
- **8a (Session 1, in flight):** tokens + typography
- **8b (Session 2):** extend existing primitives + new visual atoms + formatNumber + DataState + Term + Cite
- **8c (Session 3):** Lucide React integration for icons + logo system integration (after Kastytis ships logo SVGs)
- **8d (Session 4):** /brand + /style pages (small pages, color/type/logo display)
- **8e (Session 5):** /visuals + /colophon pages + microbrand details (404, console, ::selection, focus, print)

This is more sessions but each is bounded and contains less hidden risk.

---

### Phase 9 — Identity (HERO CHOICE PENDING)

**Issue 1: Hero option A vs B unresolved.** Kastytis hasn't picked between "editorial" (Option A) and "energy-balance ring" (Option B). CC should not start 9.3 until decision is made. Recommend Option A first, evaluate B if A under-delivers.

**Issue 2: 9.2 Interactive `<BalticMap>`** is genuinely complex — hover-filter, click-pin, interconnector flow direction reversal, node pulse on refresh, country shape filling. Probably a full session by itself. Plus the existing GSAP particle animations on cable paths (per `project_visual_vision.md`) need to be preserved — re-pathing is non-trivial.

**Issue 3: B-006 (LV↔LT internal flow display)** flagged in dropped-ideas memory. Worker has data, frontend doesn't render. Should fold into 9.2 since it's the same map.

**Issue 4: 9.6 Editorial copy rewrite** is content authoring (Kastytis voice). CC scaffolds, Kastytis writes. Non-blocking.

**Recommendation — Phase 9 Session split:**
- **9a (Session 1):** 9.1 map optimisation + 9.2 interactive map (largest piece)
- **9b (Session 2):** 9.3 hero rebuild (Option A) + 9.4 slim ticker + 9.5 live pulse
- **9c (Session 3):** 9.6 editorial copy + B-006 LV↔LT integration

---

### Phase 10 — Card system overhaul (NEEDS HARD SPLIT)

18 sub-items including 10.10 which has 12 distinct sub-features. Estimated 4-5 sessions in plan; realistic estimate is 7-8.

**Recommendation — break into 5 sub-phases:**

**Phase 10a — Card variant infrastructure (1 session):**
- 10.1 Card variant primitives (HeadlineCard / DriverCard / DeepDiveCard)
- 10.2 Migrate live cards to variants (S1, S2, S3, S4, S7, S9, RenewableMix, ResidualLoad, PeakForecast, SpreadCapture, Revenue, TradingEngine)
- 10.3 Apply MetricDisplay everywhere (vintage glyphs, hairline rules, fan support)
- 10.4 Regime chip semantic colors per P1
- 10.5 Apply icon sprite throughout

**Phase 10b — Per-card visualization upgrades (3-4 sessions, one per "card cluster"):**
- 10b-S1S2 (Session): S1 today-vs-distribution overlay + histogram + Gross→Net waterfall + S2 3×3 small multiples + imbalance kernel density
- 10b-Returns (Session): Returns IRR 9-cell heatmap + monthly DSCR overlay + calendar heatmap + cashflow stacked area
- 10b-Trading (Session): Dispatch + SOC overlay + revenue donut + FCR before/after pair
- 10b-Structural (Session): Renewable mix stacked area + residual load divergent + peak forecast hourly + cross-border diverging + commodity causal chains + P_high formation waterfall

**Phase 10c — Cross-cutting features (1 session):**
- 10.6 Section plates (4 editorial plates + inline SVG illustrations)
- 10.11 Cross-card metric highlight (global hover-key store)
- 10.12 Today's chain causal viz
- 10.7 LT/LV/EE small multiples on aggregate metrics
- 10.8 P10/P50/P90 fans on derived/forecast (depends on Monte Carlo from 7.7c)

**Phase 10d — Energy industry data enrichment (1 session):**
- 10.9 Credibility-tiered pipeline funnel
- 10.13 Reserve product nomenclature precision (capacity vs energy)
- 10.14 Imbalance settlement single-pricing labels
- 10.17 Clean Spark Spread tile (S7+S9 join)
- 10.18 Storage-need from VRE buildout

**Phase 10e — S4-specific deep work (1 session):**
- 10.15 Grid connection cost split (€/MW, deep vs shallow, queue, DSO/TSO)
- 10.16 Permitting timeline Gantt across 29 fleet projects

Total: 7 sessions for what was originally "4-5." More honest.

---

### Phase 10.5 — Tier-S content (NEEDS HARD TIERING)

16 new shareable cards is too much. Realistic: prioritize and ship in tiers.

**Tier S — ship as Phase 10.5 (4 items, 2 sessions):**
- 10.5.1 Project ledger (table of all 29 BESS projects — single most-bookmarked-page candidate)
- 10.5.6 Connection-guarantee policy watch (€50→€25/kW)
- 10.5.9 "Configure your project" cost calculator (developers send to boards)
- 10.5.10 "Stress your asset" Returns interactive (IC analysts copy URL to MD)

**Tier A — ship as Phase 10.5b after Tier S validates (4 items, 2 sessions):**
- 10.5.2 Cross-border spread card (LT-SE4/LT-PL/EE-FI — unique IP)
- 10.5.5 Forward curve card
- 10.5.11 2D LCOS sensitivity heatmap
- 10.5.14 Macro demand drivers tile

**Tier B — backlog, build only if traction signals (8 items):**
- 10.5.3 24h × 365d capture heatmap
- 10.5.4 5×5 correlation heatmap
- 10.5.7 Cycle counter
- 10.5.8 Auction outcomes feed
- 10.5.12 CRM card
- 10.5.13 Counterfactual benchmark
- 10.5.15 Real-options duration optimizer (depends on 7.7c.15)
- 10.5.16 Merchant/Tolling toggle (depends on 7.7c.16)

The Tier B items depend on data sources or engine work that may not exist. Defer until needs are concrete.

---

### Phase 11 — Layout, mobile, light theme (NEEDS DESIGN ASSETS)

**Issue 1: 11.3 Real designed light theme** needs paired map asset (light-mode SVG with matching cable positions per `project_visual_vision.md` calibration), retuned chart palette, deeper accent. Same problem as 8.5 logos — design work.

**Issue 2: Mobile data UX (11.6) is a chart-layer rebuild.** Every chart needs a mobile variant (summary stat + sparkline default → tap to expand). Each is its own decision. Probably 1 full session for chart-mobile patterns alone.

**Issue 3: Mobile responsive grid + nav (11.2)** is bigger than it sounds. Hero KPI strip becomes scroll-snap, hamburger ≤1024px, every section grid responsive. Plus the existing mobile-broken state is bad enough that this should ship sooner if mobile traffic shows up.

**Recommendation — three sub-phases:**

**Phase 11a — Overflow + responsive nav (1 session):**
- 11.1 Horizontal overflow fixes
- 11.2 Mobile responsive grid + nav
- 11.5 Returns card overflow

**Phase 11b — Light theme redesign (1 session, depends on Kastytis providing paired map asset + accent decisions):**
- 11.3 Real designed light theme
- 11.4 Theme-aware asset loading

**Phase 11c — Mobile data UX (1 session, after Phase 10 cards stabilize):**
- 11.6 Chart-level mobile variants (summary stat + sparkline → tap to expand)

---

### Phase 12 — Intel engine

**Issue 1: 12.3 Relevance classifier — ML or rule-based?** ML is a rabbit hole (model selection, training data, deployment). Rule-based with tuned keyword weights ships in 1 day, hits 80% accuracy. Default to rule-based. Don't reach for ML.

**Issue 2: 12.4 LT/EN translate — Anthropic API call per item?** Cost concerns — 50+ items per week × Claude API calls = small but non-zero. Cache translations by item ID; only translate new items. Alternatively, use Google Translate API or DeepL (cheaper, deterministic).

**Recommendation — clarify per sub-item:**
- 12.1 Worker scraper filter (rule-based keyword whitelist + domain rules) — solid as-is
- 12.2 Dedupe — solid
- 12.3 Relevance classifier — explicit "rule-based first; defer ML"
- 12.4 LT/EN translate — explicit "Anthropic API with KV cache by item ID; switch to DeepL if costs become an issue"
- 12.5 Research-clipping render — solid

---

### Phase 13 — Distribution

**Issue 1: 13.5 share-scenario PNG generator overlaps with 7.9.6.** Same feature listed twice. Consolidate into Phase 7.9 (with `/api/og/scenario` route), Phase 13 just becomes "marketing variants."

**Issue 2: 13.4 methodology permalinks depends on 7.8.1.** Phase 13 must run after 7.8.

**Issue 3: 13.1b year-in-review** depends on Phase 17 daily regime call accumulating data. Skip until ≥500 calls per quarter (per P7 lock criteria).

**Recommendation — slim Phase 13:**
- 13.1 Daily OG image variants (Capture / Reserve / Pipeline day)
- 13.2 Snapshot share button (consolidated with 7.9.6 — single route, two callers)
- 13.3 /sources page
- 13.6 SEO + dynamic OG image

**Defer:**
- 13.1b year-in-review (gated on engagement traction)
- 13.4 methodology permalinks (folded into Phase 7.8 task list)

---

### Phase 14 — IA, navigation, accessibility

**Issue 1: 14.2 Section reorder** is risky. Changes nav and URL anchors. Should ship 301 redirects (14.1 covers this). Verify SEO impact before committing.

**Issue 2: 14.6 i18n scaffolding** was in the plan but is huge. Externalize all UI strings to `messages/en.json` is mechanical but touches every component. Probably its own phase, not a 14 sub-item.

**Recommendation:**
- 14.1 Anchor IDs match nav labels + 301 redirects — ship together
- 14.2 Section reorder — ship after 14.1, watch SEO for 2 weeks
- 14.3 Sticky TOC — solid
- 14.4 Keyboard layer — solid
- 14.5 Skip link, focus rings, ARIA, axe-core — solid; absorb 7.9.7 number a11y here
- 14.6 i18n scaffolding — split into Phase 14b separate phase

---

### Phase 15 — Engineering rigor (REDUNDANCY + MISNAMING)

**Issue 1: 15.1 useScenario() store** is a dependency for Phase 7.9 permalinks. Should move earlier (or 7.9 explicitly depends on it).

**Issue 2: 15.3 ISR per data source** — site is static export. ISR (Incremental Static Regeneration) requires server deployment. Doesn't apply. Misnamed item. The actual data refresh model is: worker is live (data refreshes automatically), frontend is static (rebuild on git push only). Replace 15.3 with "Document the data freshness model on /sources" — that's the actual gap.

**Issue 3: 15.5 Math unit tests** — already established in Phase 7.6 (107 tests across 16 files via vitest harness). 15.5 becomes "expand math test coverage to remaining engine areas not yet specced (7.7c Monte Carlo, capital structure)."

**Issue 4: 15.2 Chart consolidation scope.** "Five primitives over D3 + React" — large rewrite. After Phase 8.3b's visual atoms and Phase 10.10's per-card visualization upgrades, the chart layer is heterogeneous (Chart.js for time-series, D3+React for new visual types). 15.2 becomes "consolidate Chart.js usages onto a thin wrapper, remove duplicate axis/tooltip code" — much smaller scope.

**Recommendation:**
- 15.1 useScenario() — move forward to Phase 7.9 prerequisite
- 15.2 Chart consolidation (revised: thin Chart.js wrapper, not full D3 rewrite)
- 15.3 → DELETED, replaced by "data freshness documentation on /sources page" (already in 13.3)
- 15.4 Visual regression tests (Playwright + Chromatic) — solid
- 15.5 → "Expand math test coverage to 7.7c engine areas"
- 15.6 Plausible analytics — solid

Phase 15 shrinks from 6 items to 4 (after moves and deletions).

---

### Phase 16 — Press mode + final polish

**Issue 1: 16.1 Press mode theme.** Value unclear. Three themes (dark + light + press) is high maintenance. If Phase 11.3 light theme is well-designed for screenshot use already, press mode is redundant. Question whether to ship.

**Recommendation:** Defer 16.1 until after Phase 11.3 light theme ships. Evaluate then.

**Issue 2: 16.3 Motion polish layer** — solid. Subtle animations across the board. End-of-roadmap is the right slot.

---

### Phase 17 — Engagement Layer (LOCKED)

P7 locked, scope tight. No issues.

**One added note:** 17.4 anonymous aggregate community signal needs N≥20 calls before showing; quarterly post needs N≥500. These thresholds are right for noise-control but mean Phase 17 takes ~3 months to produce content artifacts. Plan accordingly — don't pre-build infrastructure for content that may not have data.

---

## Cross-cutting concerns I missed earlier

### 1. Worker deployment cadence not explicit

Many phases touch `workers/fetch-s1.js` (7.7, 12). After each worker change: `wrangler deploy` then verify endpoints. Should be an explicit gate per phase touching worker. Add to Phase 7.7 / 12 prompts.

### 2. Versioning of worker payload schema

Regulatory feed has `schema_version`. Worker payload has none. If a worker change breaks the frontend's expectations (rename a field), the frontend silently breaks. Should ship a `schema_version` on `/s1`, `/s2`, `/revenue` etc. — frontend asserts at fetch time, falls back gracefully on mismatch.

This is a **new phase** worth adding: **Phase 7.6.5 — Worker payload schema versioning** (would have been part of 7.6 but missed). Small phase, 1 session.

### 3. Backup / rollback strategy for production

If a deploy breaks prod, recovery path? Cloudflare Pages has rollback in the dashboard. Wrangler deploys can be rolled back via `wrangler rollback`. This should be documented in `docs/playbooks/` so future Kastytis-or-Claude knows what to do. **Add to Phase 8.7 microbrand details OR create Phase 7.6.6 — Operational playbooks.**

### 4. Per-card production health check

`scripts/diagnose.sh` exists. Does it check every card has fresh data? Or just that endpoints return 200? If a single card silently breaks (worker returns empty for that one signal), the page shows "n/a" without alerting Kastytis. **Add as a 15.6 sibling: "per-card health probe" that runs daily and alerts on stale data >24h on any single card.**

### 5. Phase 8.5 logo system — true vector logo (V-7 from dropped-ideas)

Memory `project_visual_vision.md:57` notes: "True vector logo — current SVGs contain embedded PNGs, not real vectors." Phase 8.5 must address this — re-build the wordmark as actual vector paths, not raster-embedded SVG.

### 6. Phase 9.2 LV↔LT flow display (B-006 from dropped-ideas)

Worker returns LV-LT internal flow data. Frontend doesn't render. Quick fix in Phase 9.2.

### 7. Phase 9.5 count-up animations (V-10 from dropped-ideas)

Hook created in Phase 4A, wiring to hero metrics deferred. Phase 9.5 (live pulse on freshness) is the right place to land V-10.

### 8. Phase 11.2 mobile responsive hero

Memory `project_visual_vision.md:58`: "Mobile responsive hero — 3-column grid broken on small screens." Already in 11.2 scope. Verify it's covered.

---

## Revised phase ordering (after current Phase 8 Session 1 ships)

1. **Phase 7.10** — Regulatory feed merge (stash pop, commit, push, PR) — **NOT a CC job**
2. **Phase 8 Session 2** — extend primitives + visual atoms
3. **Phase 7.7a** — Financial display binding (alternate-track parallel)
4. **Phase 8 Session 3** — Lucide icons + logo system integration (after Kastytis ships logo SVGs)
5. **Phase 7.7b** — Engine extensions (LCOS, RTE, stack allocator, MOIC, capital structure, real-options)
6. **Phase 8 Session 4** — /brand + /style pages
7. **Phase 8 Session 5** — /visuals + /colophon + microbrand
8. **Phase 7.6.5** (new) — Worker payload schema versioning
9. **Phase 7.8** — Methodology + Glossary + Citations (slimmed)
10. **Phase 9a** — Map optimization + interactive BalticMap
11. **Phase 7.9** — Sharability triad (with 15.1 useScenario as prerequisite, DataState moved out)
12. **Phase 9b** — Hero rebuild + ticker + live pulse
13. **Phase 9c** — Editorial copy + B-006 LV↔LT
14. **Phase 11a** — Overflow + responsive nav (mobile-urgent)
15. **Phase 10a** — Card variant infrastructure
16. **Phase 10b-S1S2 / Returns / Trading / Structural** — per-card visualization upgrades (4 sessions)
17. **Phase 11b** — Light theme redesign (after Kastytis ships paired assets)
18. **Phase 10c** — Cross-cutting (plates, highlight, chain, fans)
19. **Phase 10d** — Energy industry data enrichment
20. **Phase 10e** — S4 deep work
21. **Phase 11c** — Mobile data UX (after Phase 10 cards stabilize)
22. **Phase 10.5** — Tier S content (4 items)
23. **Phase 12** — Intel engine
24. **Phase 13** — Distribution (slimmed)
25. **Phase 7.7c** — Monte Carlo / real-nominal indexing / PPA-tolling (separate engine work)
26. **Phase 10.5b** — Tier A content
27. **Phase 14** — IA + nav + a11y (with 14.6 i18n split out as 14b)
28. **Phase 15** — Engineering rigor (slimmed: charts, regression, analytics)
29. **Phase 16** — Final polish (16.1 press mode evaluated, 16.3 motion polish)
30. **Phase 17** — Engagement layer (P7 locked, conditional on traction)

29 sub-phases instead of the current 17. Realistic. Each is 1 session of CC work.

---

## Open questions for Kastytis

1. **Phase 7.7 split** — agree to split into 7.7a/b/c, or keep as one phase with explicit ordering of sub-items?
2. **Hero option A vs B** — pick now (recommend A) so Phase 9b prompt can be authored.
3. **Logo system** — will you ship Figma exports for 8.5, OR do you want CC to use Lucide React + the existing PNG-as-SVG wordmark for the first cut?
4. **Light theme map asset** — for Phase 11b, do you have / will you commission a paired light-mode map asset, or should CC use a CSS filter as the first cut?
5. **Monte Carlo on workers** — for 7.7c.11, comfortable with KV-cached pre-compute (build-time scenarios), or prefer client WASM, or reduce to ~100 iterations?
6. **/policy page** — confirm: delete, let regulatory feed cover EU regulatory content?
7. **/data-revisions audit log** — defer to backlog, ship later if needed?
8. **Press mode (16.1)** — defer until after Phase 11.3 light theme ships, then evaluate?

---

## What I did during the wait

1. Wrote this audit at `docs/phases/plan-audit-2026-04-26.md` (this file). Tracked in repo so future CC sessions can reference.
2. Did NOT author Phase 7.7 Session 1 prompt yet — waiting on Kastytis's split decision (Q1).
3. Did NOT touch upgrade-plan.md — most additions live in the stashed regulatory branch and will land when that pops. After this audit is reviewed, the changes recommended above can be applied to upgrade-plan.md as a single coherent edit.
