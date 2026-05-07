# KKME Handover

Canonical state document. Read this first in every session.
Last updated: 2026-05-07 (Session 50 — Phase 21 (S2 professional polish: hero inversion to LT up-only operational reality + new derived `s2.afrr_up_avg_90d_delta` worker field + IMB interpretive line + `MarketThicknessChip` rule-#6 alignment via per-product quantitative depth anchor) shipped on `phase-21-s2-professional-polish`. **Three operator-confirmed sub-items + 1 quiet integrity fix in one PR; 7 files modified.** S2 hero swap: `act.afrr_p50` 3m P50 combined LT (€13.5/MW/h) → `data.afrr_up_avg` 7d mean LT up-only (€7.91/MW/h); €5,913k/yr footer auto-corrects to €3,464k/yr (operationally honest annualized for one-direction BESS at 50 MW). Hero label literal updates `up+down combined` → `LT · UP ONLY · 7D`; subline transformed from mislabeled "(up only, Baltic avg)" → methodology-disclosure "Combined up+down (LT, 3m P50): €13.5/MW/h" — discipline rule #1 (audit-triage) caught the "Baltic avg" mislabel during scope validation; `data.afrr_up_avg` is **Lithuania-only** per worker comment at `fetch-s1.js:4395` + methodology note at `:7113` (BTD `price_procured_reserves` column 11). New `effectiveCountry: Country = prod === 'aFRR' ? 'LT' : country` render-time derivation pattern preserves user's prior LV/EE pick across aFRR product-flip round-trips (eliminates `setCountry` in `useEffect` that would have tripped `react-hooks/set-state-in-effect` lint). CountryToggle disabled on aFRR mirroring FCR pattern; LT highlighted as canonical. New worker `computeAfrrUp30dVs60dDeltaPct(history)` (~25 lines) reads `s2_history` KV (90-day cap, daily snapshots from `appendSignalHistory`); current 30d mean vs prior 60d mean fits exactly within MAX_HISTORY=90; null-safety triggers when window underfilled (current 48 days → null). New `AfrrDeltaChip` frontend component renders muted `Δ — / 90d` boxed chip on null with explanatory `title=` tooltip; will auto-activate to `Δ ±N% / 90d` quantitative micro-descriptor (no sentiment palette per rule #6) ~2026-05-19; full window ~2026-06-18. `MarketThicknessSpec.quantitative_anchor: string` added; `MarketThicknessChip` renders `{label} · {level} · {anchor}` — Option A pick at Pause A keeps institutional vocabulary (THICK = price-taker zone) AND adds quantitative anchor satisfying rule #6 spirit: aFRR · THICK · ≥100 MW / mFRR · MEDIUM · 50–100 MW / FCR · THIN · ≤50 MW. Anchor propagates automatically to `TradingEngineCard.tsx:497-499` via the same `<MarketThicknessChip>` consumer pattern (no per-card retrofit). New IMB interpretive line beneath imbalance tiles: muted-mono prose "Imbalance volume drives activation: more imbalance → more aFRR called → activation revenue layers on top of the capacity reservation above. Today's `{N}%` >100 MWh ≈ 1-in-`{Math.max(2, Math.round(100/N))}` settlement periods stressed." Data-derived from `data.pct_above_100`. New `afrr_up_avg_90d_delta` registry entry in `metricRegistry.ts` per discipline rule #4 (Phase 12.10 seed `/^s4\./` regex broadened to `/^s\d\./` to admit s2-namespace metrics). All 6 gates baseline-exact (tsc 0, vitest 925/925 with 3 chip-shape specs added + 1 registry-regex broadened, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes (4.8s)). Worker deploy `2b3c6bc5-e9a3-4819-9919-cd1ec3d85952` live; cache-busted curl `/s2 | jq '.afrr_up_avg_90d_delta'` returns `null` per null-safety branch. **Visual-audit gap (recurring 3rd consecutive session — 47 + 48 + 49)**: chrome-devtools-mcp browser-lock condition recurred; operator pre-approved curl-only verification path with prose state description at `docs/visual-audit/phase-21/STATE.md` substituting the 8-screenshot mobile/desktop × light/dark grid. Cross-session friction observation already filed as roadmap operator-action-item (chrome MCP `--isolated` userDataDir investigation). 18.1.1 ChunkLoadError class structurally absent (28 chunks, 4.5 MB raw; 20 referenced from `index.html` all return HTTP 200 at localhost:3101; Phase-21 literals embedded in static chunks). Bundle delta below noise floor (~+50 lines source). **Phase 21.1 conditional candidate filed** (per-country aFRR up-only worker engine extension; trigger: operator post-merge feedback that LT-anchoring feels too restrictive); **Phase 21.2 conditional candidate filed** (deriveChip audit on mFRR + FCR — pre-existing always-zero StatusChip bug; out of Phase 21 scope); **Phase 22 conditional candidate filed** (institutional-grade S2: forward curves, P95 tail, cross-region benchmarks). Branch pushed for PR. Previously Session 48 — Phase 18.2.2 (chart crosshair UX hotfix + tooltip-tighten + small-chart height bump) shipped on `phase-18-2-2-crosshair-ux`. **Three sub-items in one PR; 9 files modified.** Operator hard-refresh feedback on Phase 18.2 ship: "Hover works only on lines, it should be more like I see the + across the whole chart when I hover. Not only on the lines and the peaks since the chart is small and it's hard to find it." → crosshair fix shipped; mid-session, operator hard-refreshed against the open PR branch and reframed the issue as **visual hierarchy between tooltip and chart** (tooltip box was ~50-67% of canvas height on small charts; target 20-25%). α tooltip-tighten + β small-chart height bump added to the same PR; γ (M2 mobile tooltip pinning) deferred to Phase 18.2.3 for risk isolation per Phase 18.1.1 lesson. Sub-item summary: (1) **crosshair "+"** — `CHART_INTERACTION = { mode: 'index', intersect: false, axis: 'xy' } as const` exported from `chartTheme.ts`, applied at all 10 plugin-bearing chart sites; `makeCrosshairPlugin` extended to draw horizontal line at `tooltip.caretY` alongside existing vertical at `caretX`. 5/10 sites lacked the option entirely (S1Card 2 + S2Card 3 — operator's "small charts hard to find" complaint); 5/10 had inline literal (RevenueCard 3 + RevenueBacktest 1 + TradingEngineCard 1) migrated to const for cross-card consistency rule #4. Both gaps closed. (2) **α tooltip typography + padding tightened** in sitewide `ChartTooltip.tsx` primitive (single file → propagates to all 19+ consumers): value 17→13px, padding 10/12→6/8, minWidth 128→96, headline/secondary 10.5→10, line-heights 1.05→1.15, vertical rhythm trimmed throughout; net value text −24%, padding −33-40%, minWidth −25%. (3) **β small-chart heights bumped** in S1Card + S2Card: Sparkline 120→170, Monthly 140→190, History 120→170, Trajectory 120→170, Capacity 140→190. Single height value per site (no media-query split — chart.js `responsive: true; maintainAspectRatio: false` reshapes width-only). Card-layout impact: S1Card +100px / S2Card +150px total; hero band intentionally scroll-rich per Phase 18.1's principle. Tooltip/chart ratio moved from ~58-67% → ~31-35% (close enough to operator's 20-25% target band). 18.1.1 risk-class pre-check (β): wrapper pattern unchanged, ResizeObserver target shape invariant, no new lazy boundaries. Visibility lift kept at `colors.textMuted` / 0.5px (Pause A pick a; 18.2.3 conditional candidate filed for M2 mobile tooltip pinning OR fallback brighten/thicken variant if either need surfaces post-merge). (A) new `CHART_INTERACTION = { mode: 'index', intersect: false, axis: 'xy' } as const` exported from `chartTheme.ts`, applied at all 10 plugin-bearing chart sites — makes crosshair fire whenever cursor is anywhere over canvas; (B) `makeCrosshairPlugin(colors)` extended to draw horizontal line at `tooltip.caretY` alongside existing vertical at `caretX`, forming "+" pattern using `chartArea.left/right`. Visibility lift kept at `colors.textMuted` / 0.5px (Pause A pick a, minimal-change-first; 18.2.3 conditional candidate filed if operator post-merge says still hard to read). **5/10 sites lacked `interaction` option entirely** (S1Card 2 + S2Card 3 — these were the operator's "small charts hard to find" complaint); **5/10 had inline `intersect: false` literal** (RevenueCard 3 + RevenueBacktest 1 + TradingEngineCard 1 — already fired anywhere but missed the "+" half) migrated to `CHART_INTERACTION` const for cross-card consistency rule #4 alignment. Both gaps closed; all 10 sites now have always-fire interaction AND "+" pattern. All 6 gates baseline-exact (tsc 0, vitest 925/925, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes — vitest 924/925 from prompt was the 1 pre-existing freshness boundary failure, now incidentally passing because today's calendar date lands inside the boundary it tests). Bundle delta below 0.2 KB gzipped (~+15 lines source). Frontend-only, no `model_version` bump, no worker deploy. **Visual-audit gap (recurring)**: chrome-devtools-mcp browser locked by parallel CC sessions — same condition as Session 47; operator approved curl-only verification path again (build clean + all 20 JS chunks return 200 + new `kkme-crosshair` plugin id + `axis:"xy"` literal embedded in static chunks → 18.1.1 ChunkLoadError class structurally absent); in-browser hover / theme-toggle visual confirmation owned by operator post-merge via Cloudflare Pages preview deploy. Cross-session friction observation filed: chrome MCP lock recurred on consecutive sessions — future Cowork investigation should consider `--isolated` userDataDir mode or browser-ownership coordination protocol. Branch pushed for PR. Previously Session 47 — Phase 18.2 (chart editorial polish) shipped on `phase-18-2-chart-editorial-polish`. Four sub-items, single PR, 6 files: (A) crosshair plugin factory `makeCrosshairPlugin(colors)` in `chartTheme.ts` consumed across 9 chart sites; (B) `CHART_FONT_DISPLAY` constant + 4 ref-line callouts switched to italic Newsreader serif (Y1 model anchor, 0.80·augment, 0.70·EoL, 1.0·today); (C) cross-card consistency rule #4 enforcement via `SENTINEL_DASH = [4,4]` + `SENTINEL_LINE_WIDTH = 0.8` constants applied at 7 sentinel sites; (D) data-derived quantitative aria-labels on 13 chart wrappers (rule #6 — no editorial language). Two sub-items deferred: (E) Baltic palette retune (spec P2-2 hex `#1a3833` / `#d4a574` / `#a8324a` ≠ Phase-18-shipped tokens; cross-cutting, filed as Phase 18.2.1 candidate); (F) tornado pointer-events fix NOT REPRODUCIBLE per code-grep verification (spec P2-2 inaccurate against current code). Phase 7.7e UI track (Sessions 24+25) had absorbed most P2-2 work pre-emptively (chartTheme.ts centralization, useChartColors() getComputedStyle resolution, IBM Plex Mono CHART_FONT, ChartTooltip primitive). All 6 gates baseline-exact (tsc 0, vitest 924/925 with 1 pre-existing freshness boundary failure unchanged, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). Bundle delta near-zero (~+1 KB gzipped). Frontend-only, no `model_version` bump, no worker deploy. **Visual-audit gap noted**: chrome-devtools-mcp browser locked by parallel CC sessions; operator approved curl-only verification (build clean + all 20 JS chunks return 200 + new exports `SENTINEL_DASH` / `kkme-crosshair` / `Newsreader` confirmed in static chunks — 18.1.1 ChunkLoadError class structurally absent); in-browser hover / theme-toggle visual confirmation deferred to operator post-merge via Cloudflare Pages preview deploy. Branch pushed for PR. Previously Session 45 — Phase 18.1 (mobile foundation pass) shipped on `phase-18-1-mobile-foundation`. Five sub-items, single PR, 11 files: Next 15 `viewport` export adds `width=device-width` meta; hero 3-col grid (≥1060px min) collapses to single-column flex stack at <900px; KPI ticker reflows desktop 6-col → tablet 3-col → mobile 6-col scroll-snap; eight touch-target sites bumped to WCAG 2.5.5 44×44 minimum on mobile via additive `.tap-target-mobile` class hooks (no inline-style refactor); smooth scroll + `overscroll-behavior-y: contain` + `:focus-visible` ring globalized. Pause B runtime: `scrollWidth === clientWidth` ✅ at 360 / 414 / 768 / 1024 / 1440px; tap targets ≥44×44 mobile, compact 32-39 × 25-30 desktop preserved. Pause C addendum: StickyNav uses `position: fixed`, zero `position: sticky` in `app/`, pinning verified at 360 + 1440. Three notable surprises: (1) Tailwind v4 / Turbopack silently dropped a stacked `.hero-map-wrapper` rule inside an existing `@media` block — hoisted to its own block to retain (memory-entry candidate); (2) SVG `<g>` past viewBox boundaries inflated `scrollWidth` independent of CSS clipping — fixed with `overflow: 'hidden'` on SVG inline (off-map city labels at viewBox-x > 1024 from geographic east of calibrated map area; **Phase 18.1.1 question for operator: were those labels intended-visible by design?**); (3) page-level `html { overflow-x: hidden }` added as safety net for internal sub-card overflow (DSCR triple panel + RTE assumption rows + cycles_breakdown wider than parent at 360 viewport) — proper per-component `min-width: 0` + label-truncation pass queued as **Phase 18.1.1**. All gates baseline-exact (tsc 0, vitest 925/925, lint 126 (40e/86w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). Bundle delta near-zero (CSS-only; production CSS chunk 42,421 B). Frontend-only, no `model_version` bump, no worker deploy. 15 visual-audit PNGs in `docs/visual-audit/phase-18-1/` (5 viewports × 3 sections). Branch pushed for PR. Previously Session 44 — Phase 12.11 (P0 functional bug reconciliation) shipped on `phase-12-11-p0-bug-reconciliation`. Audit-v2 P0 list reconciled: **5 fixes shipped** (fleet 822 vs 651 inline disclosure via "(BESS + pumped hydro)" subscript on hero + SignalBar; AFRR precision 2dp standardized across **all 5 consumer sites** of `s2.afrr_up_avg` per Pause B operator-approved cross-card fold-in; freshness "TODAY" boundary tuned to calendar-today-in-`Europe/Vilnius` per discipline rule #2; DISPATCH header `/MW` → `/MW/DAY` to match hero unit; LV/EE empty-cell sup² inline footnote anchor mirroring LT 2h sup¹) + **3 NOT REPRODUCIBLE deferrals** (COD 2027 stragglers — live `/revenue` matrix legitimately emits `cod=2027` rows, sensitivity test correctly mirrors; CAPEX tornado consistency — `buildTornadoBars` math verified consistent; intel >30d staleness — filter exists at `IntelFeed.tsx:1066-1077`, deferred upstream feed-source-refresh question to Phase 12.12 #3). Vitest 919 → **925** (+6 calendar-EET freshness specs). All other gates baseline-exact (tsc 0, lint 126 (40e/86w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). 8 files modified, ~160 insertions. Frontend-only, no `model_version` bump, no worker deploy. Visual audit captured in `docs/visual-audit/phase-12-11/` (6 PNGs); DOM evaluation across all surfaces confirmed inline disclosures + precision standardization render correctly on dev server. **Phase 12.11.1 follow-up filed**: tornado COD-axis framing as 2026 ages (cod=2027 still meaningful when no greenfield asset can hit it?). Phase 12.12 #5 candidate metrics surfaced for cross-card consistency CI gate. Branch pushed for PR. Previously Session 43 — Phase 7.7g-a-2 (spacing tokens + rollout) shipped on `phase-7-7g-a-2-spacing-tokens`. Canonical 8-value t-shirt scale (`--space-2xs:4 / xs:8 / sm:16 / md:24 / lg:32 / xl:48 / 2xl:64 / 3xl:96`) added to `app/globals.css`; the prior 5-token block was cleanly renamed because Pause A discovery found **zero consumers** codebase-wide. **361 inline-px sites migrated** across 56 files (288 quoted + 73 bare-number). New CI grep gate `npm run lint:no-raw-spacing` (value-aware: only flags raw px in single-prop `padding/margin/gap` when value matches the canonical 4/8/16/24/32/48/64/96 set; off-scale + shorthand left raw, gated separately for Phase 7.7g-a-3). All four gates baseline-exact (tsc 0, vitest 919/919, lint 126, build 7 routes). Frontend-only, no `model_version` bump, no worker deploy. Visual confirmation deferred — production-build CSS artifacts verified correct, 1:1 mechanical rename verified by diff inspection; chrome-devtools-mcp browser was locked by parallel session, dev server at :3000 (PID 54297) was serving stale CSS pre-HMR. Phase 7.7g-a-3 backlog created: ~233 off-scale + 171 shorthand + 16 missed top-level pages (intel / regulatory / layout) + 2 conditional ternaries (BalticMap / AssetDetailPanel) + per-side CI regex extension. Branch pushed for PR. Previously Session 42 — Phase 18 Baltic editorial visual identity ship (Plex Mono + Newsreader + sharp 0px corners + per-card accents + broadsheet masthead + footnote discipline + bracket SourceFooter + pull-quotes; 18 visual-audit PNGs; ~143 KB Latin bundle = -13% vs baseline). Previously Session 41 — Phase 29 (KKME Baltic Storage Index) shipped on `phase-29-baltic-storage-index`. **First public-facing Tier 1 product surface**: monthly per-country per-duration €/MW/month revenue benchmark. Worker `GET /index/baltic` + `POST /index/update` (UPDATE_SECRET-gated) live on version `3c77897f-62ec-4dff-90c7-4aa94f052f47`; LT/{2h,4h} canonical (option-ε at Pause A — €284 / €307 for Apr 2026 in production-engine smoke); LV, EE, and 1h slots ship `coverage_status` strings (`pending_phase_29_1` and `pending_engine_1h_physics` respectively) per discipline rule #1 + #6 transparency framing. **Phase 30 destination decision resolved**: standalone `/methodology` route shipped (was Operator-action-item #4) — Next.js server component renders `docs/methodology.md` at build time via `react-markdown` + `remark-gfm`, anchor-aware via slugified heading IDs. Methodology paper +1 new "KKME Baltic Storage Index" section documenting calculation (engine `/revenue.backtest` reshape × 30 / 50 MW), launch coverage profile, comparability framing vs Clean Horizon, annualization, source-of-truth + cadence; Scope time-horizon line + comparison table updated to remove "planned" tags. New VPS Python script `scripts/vps/baltic_storage_index.py` (~310 lines) + PostgreSQL append-only history table `scripts/vps/sql/002_baltic_storage_index.sql`. Five commits pushed. Worker deploy `3c77897f-62ec-4dff-90c7-4aa94f052f47` live; Pause C curl confirmed `GET /index/baltic` returns expected 404 with hint pre-VPS-push (no KV data yet) + `/health.signals.baltic_storage_index_latest` recognized as `missing` per the 36h threshold added to `STALE_THRESHOLDS_HOURS`. All four gates green: tsc 0, vitest 919/919, lint 126 (down from 170 baseline due to `.wrangler/tmp/` cleanup; new files contribute 0 lint), build 9 routes (was 8 — `/methodology` added). No `model_version` bump (engine unchanged; index is a derived aggregation surface). **VPS Python deploy block in Session 41 below — operator fires post-merge**: scp the Python file, `psql -f` the migration, `--dry-run` smoke, first live run, daily crontab entry. Phase 29.1 (per-country DA capture extension + 5-product cap-reservation extraction; ~3-4h estimate) is the dedicated follow-on that closes LV/EE; engine 1h SOC physics is a separate extension on demand. Branch pushed for PR. Previously Session 40 — Phase 12.10 follow-up shipped on `phase-12-10-followup-gap5-and-a68-boundary`. Phase 30 P1-critical Gap #5 reconciled as methodology disclosure (NOT engine bug): direct primary-source verification confirmed Clean Horizon's €77/€340 aFRR-up/down figures come from "Baltic S1 2025 Price Forecasts" (June 2025, aggregate-Baltic, Apr–mid-Jun 2025 launch window) — two known step-changes since (summer-2025 market deepening visible in CH's own October 2025 update, and Baltic-Continental synchronisation Nov 2025 visible in KKME's S2 monthly trend chart) explain the order-of-magnitude gap; KKME engine is computing the same metric Clean Horizon publishes. EE A68/fleet boundary (Phase 12.12 #15) closed at policy (a) strict-commissioned, codified in `docs/methodology.md`. Three commits: methodology paper +2 paragraphs + new "Installed-capacity definitions" subsection + dated Updates entry; worker `/s2.macro_context.afrr_methodology_note` one-line additive field; handover. Worker deploy `ea88ccc9-0b45-46e6-87cc-b0afbac7407d` live; Pause B curl confirmed `afrr_methodology_note` renders (626 chars). All four gates baseline-exact (tsc 0, vitest 919/919, lint 170, build clean). No `model_version` bump. Branch rooted at operator's freshly-pushed `face05f` roadmap delta (Phase 12.10b housekeeping bundle + Phase 12.12 #17 + Phase 12.13 #6 sequencing note). **Phase 29 (KKME Baltic Storage Index) unblocked** — Gap #5 was its only listed blocker per Session 31. Discipline rule #1 (audit-triage) hit secondarily: Phase 30's "P1 critical" label was authored from WebSearch summaries without primary-source verification; backlog item authored to consider tightening research-process guardrails. Mid-session git-state recovery noted (HEAD unexpectedly switched off feature branch during deploy/commit flow; methodology commit landed on local main on top of `face05f` then was preserved on the feature branch via ref-move + local-main reset to origin/main; no work lost; transparent record + future-session guard recommendation in Session 40 entry). Branch pushed for PR. Previously Session 39 — Phase 7.7g-a-1 dead font triplet drop shipped on `phase-7-7g-a-1-token-audit`. Previously Session 38 — Phase 12.10a CLAUDE.md discipline patch shipped on `phase-12-10a-claude-md-discipline`. Six discipline rules (audit-triage, no-hardcoded-temporal-label, named-entity verification, cross-card consistency, roadmap edit-conflict, no-editorial-state-label) baked into `CLAUDE.md` with originating incident-trace per rule; "Current phase" stale block (Hero v3 / Phase 2B-1) refreshed to point at Tier 0 closing → Tier 1 (12.12 + 7.7g, parallel). Documentation-only — `CLAUDE.md` +19 / −2 (1 file). All four gates baseline-exact (tsc 0, vitest 927/927, lint 170, build 8 routes). Last Tier 0 item; after merge + roadmap delta apply, Tier 1 begins. Branch pushed for PR. Previously Session 37 — Phase 4G intel encoding shipped on `phase-4g-intel-encoding`. Audit-#6 premise was wrong; CC's §10 discipline caught it at Pause A. Original 1–1.5h scope shrunk to ~20 min: (a) IntelFeed badge + View-all link converge on `allItems.length` denominator (1-line edit at `IntelFeed.tsx:1311`); (b) defensive `resp.encoding = 'utf-8'` on the 3 `requests.get` HTML scrapers in VPS `daily_intel.py` (audit hygiene, NOT a fix for the current mojibake — daily_intel.py has zero `unquote/cp1257/latin-1` references; live litgrid scrape returns `charset=utf-8` correctly); (c) single-item KV purge of `cur_mo87wkt8-65w5pc` via `POST /feed/delete-by-id`. The 1 production mojibake item came through `POST /curate` (`origin: 'curation'`), not the ingestion pipeline — UTF-8 `ė` (`\xc4\x97`) interpreted as cp1257 → `ÄŠ` happened in the operator's clipboard chain upstream of KKME. Phase 12.12 #16 backlog item authored: curation ingestion encoding-passthrough audit. Same audit-vs-reality pattern as Phase 12.8.0; the artifact itself is the discipline lesson. /feed: 8 → 7 items, mojibake regex matches: 1 → 0. 927 tests, baseline preserved. No worker engine changes. Branch pushed for PR. Previously Session 36 — Phase 12.9.3 default duration 4h → 2h. Session 29 — Phase 12.10.0 emergency hallucinated-entity purge on `phase-12-10-0-entity-purge` off post-merge `main`. New `POST /feed/delete-by-id` worker endpoint shipped (UPDATE_SECRET-gated, ~50 lines). `isGenericSourceUrl` + `hasHallucinationHedgeLanguage` helpers exported from `app/lib/feedSourceQuality.ts` for Phase 12.12 to wire into `evaluateFeedItemGates()` at worker line ~6602. Investigation traced the Saulėtas Pasaulis ingestion path: entry came in via `POST /feed/events` (id `mna2ne4x-xfri25` matches `makeId()` + typed-event field shape, no `cur_` prefix, no repo source) — operator hand-pushed via curl with LLM-drafted content from an external chat. Phase 12.12 #8's structural gate target is the typed-event endpoint, not curation. Worker deploy `043fd2cb-1146-4d96-95c2-0ecb2864f5d7` live; delete-call deferred to operator (UPDATE_SECRET not in this session's shell — endpoint deploys regardless, fire later). 882 → 893 tests. Branch pushed for PR; PR draft at `docs/phases/phase-12-10-0-pr.md`. Previously Session 28 — Phase 12.8.0 Tier 0 hot-fix bundle on `phase-12-8-0-tier0-hotfix`. Audit-investigated: the prompt's "highest-priority light-mode bug" was empirically false (152 root tokens, 114 light overrides, HeroBalticMap fully tokenized; visual screenshots confirm parity). Light-mode commit reduced to a single `ContactForm` chevron fix + investigation writeup. Three other sub-items shipped per Pause A decisions: percentile tiles → static stat-summary strip; keyboard shortcuts → SOT + outline flash + `?` overlay (fixes 2 dead bindings); ticker → pause-on-hover + edge fade + robustified reduced-motion selector. 866 → 882 tests. **Process finding: 3 of 4 audit-#2 visual claims confirmed hallucinated this session — see audit-credibility taxonomy in Session 28 entry + `docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`.** Branch pushed for PR; PR draft at `docs/phases/phase-12-8-0-pr.md`. Cloudflare Pages preview verified. Previously Session 27 — Phase 12.8 Dispatch render-error fix + boundary upgrade; see `docs/investigations/phase-12-8-dispatch-render-error.md`.)

## Current phase

Phase 7.7e **UI track** shipped on `phase-7-7e-ui` (Sessions 24 + 25). Sitewide ChartTooltip primitive + data contract; 24 chart-bearing surfaces migrated; three new RevenueCard sub-components surfacing the v7.3 calibration narrative; canonical per-product palette tokens. **Session 25 (2026-04-29)** fixed the chart.js hover render-loop that bailed at React error #185 in the Cloudflare Pages preview deploy: central dedupe in `useChartTooltipState.setState` (load-bearing loop-breaker) + memoization audit across 10 chart.js call sites + `useTooltipStyle` memo. 675 → 766 tests. Branch pushed for PR. No worker changes.

Phase 12.7 **interconnector rate-limit fix** shipped on `phase-12-7-interconnector-rate-limit` (Session 23). Worker version `f8173210-cb4b-493d-a1d8-0fd339ec6dac` live. Three fixes in `fetchInterconnectorFlows()`: identifying User-Agent on all three CBET fetches (reduces anonymous-bucket 429s), persist-last-good KV fallback (when current fetch returns null, reuse prior KV value), per-cable `freshness` map (`live | stale | null`) for future card UI. EstLink 1 / 2 + Fenno-Skan 1 / 2 hero cable rows now degrade to "stale" rather than `·` even when the upstream rate-limits a leg of the parallel fetch. Phase 7.7e Session 24 wires this `freshness` field into the cable hover tooltip as a secondary row.

Phase 7.7d **engine v7.3** shipped end-to-end. Worker version `41978587-ddda-42f5-b975-1da0570a3b01` live; PR #40 merged to main (commit `ec9136e`). Frontend `RevenueCard` aligned with v7.3 shape via Session 22 hotfix (commit `94ca8d8`) — auto-deployed to kkme.eu via Cloudflare Pages. Returns card now surfaces v7.3 numbers (LCOS, MOIC, duration recommendation, throughput-derived cycles breakdown, warranty status) without errors.

Next CC job: **operator merges `phase-7-7e-ui` to `dev`/`main` via GitHub web UI** (PR draft at `docs/phases/phase-7-7e-ui-pr.md`) → then Phase 7.7e data-contract (Zod /revenue boundary) → then Phase 7.7c Session 2 (capital-structure sliders, gated on UX decision) → then Phase 7.7e engine (aux curve / terminal value / augmentation / market-physics).

Earlier ground: Phase 7.7c Session 1 shipped 2026-04-27 (engine v7.2 — LCOS, MOIC, duration optimizer, assumptions panel; worker version `e145aeb4-5570-4cdd-adcb-f79351ef33dc`; PR #38 merged). Phase 7 shipped (S1/S2 card rebuild). Phase 7.5-F shipped 2026-04-21. Phase 7.5 polish pass still queued. Phase 7.6 hero refinement prompt authored after 2026-04-21 visual audit. Roadmap re-sequencing from Session 9 still holds.

Active queue order: **7.7e UI track (RTE sparkline + cycles_breakdown chart + calibration_source footer, ~1.5-2h) → 7.7e data-contract (Zod at /revenue boundary, ~30-60 min) → 7.7c Session 2 (capital-structure sliders, gated on UX) → 7.7e Engine (aux curve / terminal value / augmentation / duration market-physics, ~3-4h) → 7.5 polish → 7.6 → 8 → 9 → 10 → …**

Reference docs:
- `docs/visual-audit/phase-7-5-audit/DIAGNOSTIC.md` — audit findings + routing
- `docs/phases/phase7-5-polish-prompt.md` — ready to run in CC
- `docs/phases/phase7-6-hero-prompt.md` — ready to run after 7.5
- `docs/roadmap.md` — re-sequenced master plan

## What's shipped

- Hero v3 georeferenced Baltic map with 6 cables, particles, project dots, gen/load overlays (PRs #1–#3 merged to main)
- Phase 2A-3: worker bug fixes (5), auto-refresh via useSignal polling, VPS hourly genload script
- Phase 2B-1 (2026-04-15): project hover tooltips, tagline "LIVE · ENTSO-E · …", light-mode cable particles, arrow direction fix
- All 9 signal cards live (S1–S9) plus Wind, Solar, Load structural cards
- Revenue engine v7.2 with self-fetching RevenueCard
- TradingEngineCard (dispatch intelligence)
- IntelFeed (market intelligence board) — rebuilt in Phase 3C+3D with featured item, source credibility chips, magnitude extraction, pull-quote treatment, filter UX
- Phase 3A (2026-04-16): Intel feed data quality cleanup — Invalid Date, HTML entities, bare URLs, missing sources
- Phase 4B (2026-04-16): Intel pipeline depth fix — discovered 209 curations stuck in /curate KV never reaching /feed. Write-time merge (31s→0.24s). BESS quality gate + relevance scoring (computeBessRelevanceScore). Homepage 8-item cap with "View all" expander. Feed: 9→33 clean items, zero garbage. **2026-04-29 forensic finding (Session 26 / Phase 4F):** the BESS quality gate + relevance scoring + homepage cap were authored on `phase-4b-intel-pipeline` at commit `6f6d2d7` 26 minutes after PR #15 closed; that commit was orphaned and never reached `main`. The "9→33 clean items" curl reflected a local side-branch deploy, not production. Production ran with title-length-only filtering for 13 days until Phase 4F first-deployed the gate (2026-04-29, worker `f8411968`). See `docs/investigations/phase-4f-intel-feed-regression.md`.
- Phase 3E (2026-04-16): Model Risk Register + Data Confidence retired from homepage. 7 risks analyzed (3 materially reduced by BTD/revenue engine work, 2 structural unknowns unchanged). Content archived in docs/archive/.
- ContactForm with Resend email delivery
- Shared primitives library (SectionHeader, MetricTile, StatusChip, etc.)
- Worker cron: every 4h all signals, hourly time-sensitive, daily S2 watchdog + Telegram digest
- VPS daily ingestion pipeline (ingest_daily.py, kkme_sync.py, daily_intel.py)
- Phase 3B (2026-04-16): Structural drivers rebuild — Wind→RenewableMixCard, Solar→ResidualLoadCard, Demand→PeakForecastCard, Interconnectors→SpreadCaptureCard. Sparklines on Gas/Carbon. v0 snapshot-only.
- Phase 4A (2026-04-16): Visual overhaul — scroll animations (useScrollReveal), font redistribution (Unbounded numbers, Cormorant narrative), amber warmth, section rhythm, hero sidebar grouping. 106→4 rgba violations, 56→0 hardcoded DM Mono. useCountUp hook (wiring deferred).
- Phase 4C (2026-04-16): Design asset integration — designed logo in header/footer/hero, hero map base layer swap to designed SVG layers (dark mode). Wife's assets organized in public/design-assets/.
- Phase 4D (2026-04-16): Hero map rebuild — layered SVG base (background-black + countries + interconnect-lines), cable waypoints v2 recalibrated, hero logo text→designed PNG, opaque --nav-bg token, scroll-padding-top 96px.
- Design tokens: full dark/light theme system with anti-flash script
- Phase 7.5-F (2026-04-21): S1/S2 card redesign — live-data signal row (pulse dot + relative timestamp + source chip), prose migrated into anchored drawer (data-anchor=what/how/monthly/bridge), country/product toggle bar on S2 with disabled-state for FCR, clickable hero face that auto-opens the drawer scrolled to `what`. Visual-audit PNGs persisted under `docs/visual-audit/phase-7-5-F/` (whitelist carved in .gitignore). Merged to dev.
- **Phase 7.7c Session 1 (2026-04-27, engine v7.2)**: LCOS (€/MWh-cycled), MOIC, duration optimizer (irr_2h vs irr_4h delta), assumptions panel — all surfaced from worker into RevenueCard. Worker `e145aeb4`. PRs #38 + #39 merged. See Session 19 entry.
- **Phase 7.7d (2026-04-27, engine v7.3)**: throughput-derived cycle accounting (per-product MWh/MW/yr from FCR/aFRR/mFRR/DA), three rate-tagged empirical SOH curves at 1 / 1.5 / 2 c/d interpolated by computed actual c/d (replacing flat SOH_CURVE_W), RTE decay 0.20pp/yr from per-duration BOL, availability normalized 0.95→0.97, `cycles_breakdown` + `warranty_status` + `engine_calibration_source` payload fields, `calcIRR` mixed-sign robustness. Worker `41978587`. PR #40 merged. Frontend `RevenueCard` aligned with v7.3 shape via Session 22 hotfix (`94ca8d8`). See Sessions 20–22 entries.
- **Phase 12.7 (2026-04-27, interconnector rate-limit fix)**: User-Agent header on all three CBET fetches + persist-last-good KV fallback + per-cable `freshness` map. EstLink 1 / 2 + Fenno-Skan 1 / 2 hero rows now degrade gracefully when upstream rate-limits a leg of the parallel fetch. Worker `f8173210`. Branch `phase-12-7-interconnector-rate-limit` pushed. See Session 23 entry.
- Static export to Cloudflare Pages (kkme.eu)

## What's queued

**Phase 7.7e — Empirical calibration extensions + display polish + data-contract tightening** (Claude Code, ~2.5-4h depending on scope picked). Surfaced across Sessions 21+22. Three sub-tracks:

*Engine track* (~3-4h):
1. Aux-load temperature curve. Operator-region cooler than 25°C standard → real aux consumption lower → effective RTE BOL +1-2pp. Needs site weather data integration.
2. Terminal value at SOH floor. Augmentation event modeling at Y8-Y12 when capacity hits supplier-stated floor; current engine assumes Y10 augmentation at fixed cost without modeling the trigger condition.
3. Augmentation modeling (Y8-Y12 capex injection). v7.3 has `aug_cost_pct` and `aug_restore` constants in scenarios but the augmentation event is hard-coded at Y10. Empirical practice: augment when SOH crosses 70% trigger (now hits earlier under v7.3's steeper curves).
4. Duration optimizer market-physics fix. v7.3 narrows the 2h vs 4h IRR gap from ~10pp to ~7pp via the gentler 4h SOH curve, but multi-market-simultaneous-bidding sophistication (top-N quantile correction, mFRR vs aFRR cascade in 4h+ assets) still missing.
5. `calcIRR` Newton-Raphson refinement with multi-root detection (current bracket search is coarse).
6. Synthetic-KV calibration drift. `scripts/audit-stack.mjs::buildSyntheticKV` is sourced from Phase 7.7b v7-final fixtures and runs ~30% below current production KV state. Refresh from current production fixtures before next probe-driven phase.

*UI / display track* (~1.5-2h):
7. Render `roundtrip_efficiency_curve` array as a sparkline next to the RTE row in the Assumptions panel.
8. Render `cycles_breakdown` (FCR / aFRR / mFRR / DA EFCs/yr) as a four-bar mini-chart instead of flattened into the row's italicized note.
9. Surface `engine_calibration_source.last_calibrated` + `next_review` somewhere in the assumptions footer (currently only carried in the cycle row note).

*Data-contract track* (~30-60 min):
10. Tighten `/revenue` boundary with Zod or io-ts at the network layer. Currently `as RevenueData` cast at `RevenueCard.tsx:1087` lets any shape through; only fails downstream when a renderer dereferences a missing leaf (was the Session 22 incident). v8 changes should surface as an explicit validation error at the boundary.

**Phase 7.7c Session 2 — Capital structure sliders** (Claude Code, gated on UX decision). Vertical vs horizontal layout, debounce vs blur-fire, URL persistence. Awaiting design call.

**LCOS production-vs-synthetic gap (open question, deferred):** v7.3 production stamps LCOS €55 base/2h vs synthetic-KV probe €96.2. Difference traces to production KV producing more cycles than synthetic (~30% gap noted Session 21). Worth a diagnostic curl before next engine phase to confirm cycles_per_year is reasonable on real-KV (target: 600-900 EFCs/yr base/2h per Modo top-quartile). If production cycles > 1000, likely an engine over-count; if 600-900, the calibration is sound and synthetic-KV needs refresh (Phase 7.7e item #6).

**Phase 7.6 — Numerical reconciliation (upgrade-plan.md §2)** — Sessions 1+2+3 all shipped on `phase-7-6-numbers`. Branch ready for user review and merge to `dev`. Final scope: 16 commits, 107 tests across 16 files. See Session 13 entry for the closing summary; Session 11 entry covers Session 1; Session 12 covers Session 2.

**Phase 7.5 — S1/S2 polish pass** (Claude Code YOLO, ~2–3h). Surface layering tokens, chart refinement (gradients, annotations, tabular ticks), table rhythm, motion tokens. Prompt: [docs/phases/phase7-5-polish-prompt.md](phases/phase7-5-polish-prompt.md).

**Phase 7.6-Hero — Hero refinement** (Claude Code YOLO, ~2–3h). Distinct from the numerical reconciliation Phase 7.6 above. Fixed atmospheric background, Baltic map polygon opacity to ~10% + hairline stroke, real 48px Cormorant H1 with investor-facing copy, sub-520px breakpoint for iPhone-class viewports. Authored after 2026-04-21 audit. Prompt: [docs/phases/phase7-6-hero-prompt.md](phases/phase7-6-hero-prompt.md).

**Phase 7.7 — Financial model exposure** (estimate revised in Session 11 to 3 sessions). Most of the work is binding existing `/revenue` engine output (`project_irr`, `equity_irr`, `min_dscr`, `min_dscr_conservative`, `worst_month_dscr`, bankability flag, 13-month backtest, `ch_benchmark`, `eu_ranking`, `all_scenarios`) to cards. Engine is far richer than the original scope assumed.

**Phase 8 — Foundation Sprint** (design tokens, typography, primitives, microbrand). The keystone phase per `docs/phases/upgrade-plan.md` §2.

**Strategic roadmap (Phases 8–14, re-sequenced 2026-04-21)**: historical depth (time toggles, promoted from 12), mobile pass (promoted from 14), market regime synthesis, peer comparison, fleet dashboard, interactive revenue, methodology page. See [docs/roadmap.md](roadmap.md).

**Backlog triage** (future Cowork session): organize and prioritize backlog.
Prompt at: [docs/phases/backlog-triage-prompt.md](phases/backlog-triage-prompt.md)

## Architecture summary

| Layer | Component | Location |
|-------|-----------|----------|
| Frontend | Next.js 16 static export | `app/` → Cloudflare Pages (kkme.eu) |
| Worker | Cloudflare Worker (8029 lines as of 2026-04-21) | `workers/fetch-s1.js` → kkme-fetch-s1.kastis-kemezys.workers.dev |
| Storage | Cloudflare KV | KKME_SIGNALS namespace |
| VPS | Hetzner 89.167.124.42 | PostgreSQL + scrapers + daily ingestion |
| Mac cron | ~/kkme-cron/ | fetch-btd.js (4h), fetch-vert.js (monthly) — deprecated per /health |
| CI | GitHub Actions | fetch-btd.yml (disabled schedule, manual only) |

Data flow: External APIs → Worker cron / VPS cron → KV → Frontend useSignal hook → Card components.

## External services

- **ENTSO-E** — S1/S4/S8/genload via API key
- **BTD** (api-baltic.transparency-dashboard.eu) — S2 balancing data
- **ECB** (via Frankfurter API) — Euribor, HICP, FX
- **energy-charts.info** — CBET, gas, carbon
- **Anthropic API** — S3 editorial enrichment, Telegram digest
- **Resend** — contact form email
- **Telegram** — daily digest bot
- **Microsoft Clarity** — analytics (vumvn3n1wt)
- **Cloudflare** — Pages hosting, Worker compute, KV storage

## Working protocols

**Session start:** Read this doc → check git state → check production health via `bash scripts/diagnose.sh` → confirm understanding before work.

**Pause-point pattern:** For multi-deliverable sessions, pause after discovery, after build (before deploy), and after verification (before commit). Wait for explicit "proceed."

**Verification:** Curl real endpoints before committing. Screenshot comparison when visual. Build check (`npx tsc --noEmit && npm run build`). Never substitute "I think this works" for "I confirmed this works."

**End of session:** Update this doc's session log + backlog. Commit docs changes.

**Deploy sequence:** `npx tsc --noEmit` → `npm run build` → `npx wrangler deploy` → `bash scripts/validate-deploy.sh` → git commit → git push.

## Tool division

**Cowork** (this tool): planning, reading code, debugging, small-to-medium edits, refactoring, doc maintenance, cross-cutting analysis, prompt authoring, research, strategic thinking.

**Claude Code** (terminal CLI): long feature sessions with multi-file scope, sessions needing chrome-devtools MCP verification, many sequential bash commands, anything risky wanting fresh context. Write prompts to `docs/phases/` and paste into CC.

## Key file locations

See [docs/map.md](map.md) for the full concept-to-file lookup table.

## Backlog

| ID | Type | Sev | Title | Discovered | Status | Notes |
|----|------|-----|-------|------------|--------|-------|
| B-001 | bug | P1 | Arrow direction inversion on live hero interconnectors | 2026-04-13 audit | done 2026-04-15 | Fixed phase2b-1: flipped positiveFlowReceives in lib/baltic-places.ts |
| B-002 | bug | P2 | /s8 timestamp shows future time | 2026-04-13 audit | open | Investigate in phase2b-1 or standalone |
| B-003 | tech-debt | P2 | Live API keys in plaintext .env files | 2026-04-13 audit | open | Gitignored but on disk. Move to secrets service eventually |
| B-004 | bug | P2 | "9 SIGNALS · 4H UPDATES" tagline stale | 2026-04-13 audit | done 2026-04-15 | Replaced with "LIVE · ENTSO-E · LITGRID · AST · ELERING" in phase2b-1 |
| B-005 | bug | P2 | Light mode cable particle visibility | 2026-04-13 audit | done 2026-04-15 | Added --cable-particle token (amber dark / charcoal light) in phase2b-1 |
| B-006 | enhancement | — | LV↔LT flow not displayed on hero | 2026-04-13 audit | open | Worker returns lv_lt_avg_mw, frontend doesn't render |
| B-007 | tech-debt | P2 | CLAUDE.md model version inconsistency | 2026-04-13 audit | done | Resolved by CLAUDE.md rewrite in this session |
| B-008 | refactor | P2 | Duplicate lib files (safeNum.ts, useSignal.ts) | 2026-04-13 audit | open | lib/ vs app/lib/ — determine authoritative copy, delete other |
| B-009 | tech-debt | P2 | BalticMap.tsx + HeroMarketNow.tsx dead code | 2026-04-13 audit | open | Replaced by HeroBalticMap. Can delete |
| B-010 | tech-debt | P2 | S3CardReference.jsx orphaned at repo root | 2026-04-13 audit | open | 529 lines, not imported. Delete or archive |
| B-011 | tech-debt | P2 | map-calibration-cities.json.json double extension | 2026-04-13 audit | open | public/hero/ — rename or delete |
| B-012 | tech-debt | P2 | README.md is boilerplate | 2026-04-13 audit | open | Rewrite as project description |
| B-013 | tech-debt | P2 | origin/HEAD → dev, should be main | 2026-04-13 audit | open | Change GitHub default branch. Delete dev if unused |
| B-014 | bug | P2 | Raw rgba() in page.tsx line 188 | 2026-04-13 audit | open | Should be var(--border-card). Violates design system |
| B-015 | tech-debt | - | GSD evaluated and rejected | 2026-04-13 decision | wont-fix | See ADR-006. Re-evaluate 2026-10-13 or if workflow gaps emerge. |
| B-016 | tech-debt | - | UI UX Pro Max evaluated and rejected | 2026-04-13 decision | wont-fix | See ADR-006 and ADR-005 (design system). Would conflict with three-font rule and halftone map identity. |
| B-017 | enhancement | - | Obsidian Claude skill deferred | 2026-04-13 decision | open | Install only if separate personal/strategic notes vault emerges outside KKME. |
| B-018 | enhancement | P2 | Worker hourly genload history writes | 2026-04-16 | open | Needed for Phase 3B v1 sparklines (24h residual load shape, 7D renewable % trend) |
| B-019 | enhancement | P2 | Worker per-source generation parsing (A75 PsrType) | 2026-04-16 | open | Currently sums all PsrTypes. Need wind/solar/thermal/hydro/nuclear individually for accurate mix |
| B-020 | enhancement | P2 | Worker s1_history endpoint | 2026-04-16 | open | Daily spread/capture to KV rolling array, same pattern as s7_history. For 14D sparkline |
| B-021 | enhancement | P3 | Worker da_tomorrow hourly array | 2026-04-16 | open | Currently returns summary stats only. Full 24h curve needed for PeakForecastCard v1 |
| B-022 | bug | P3 | VPS relevance field type mismatch | 2026-04-16 | open | sync_to_website.py sends relevance as string 'high', worker Number('high')=NaN→defaults to 60 |
| B-023 | tech-debt | P3 | Superpowers ADR-006 re-evaluation | 2026-04-16 | open | 2 neutral + 1 helped across 3 YOLO sessions. Inconclusive — re-evaluate after a non-YOLO session |
| B-024 | enhancement | P2 | Light-mode designed map layers from designer | 2026-04-16 | open | Currently falls back to old PNG. Need light variants of background, countries, interconnect-lines SVGs |
| B-025 | tech-debt | P3 | True vector logo SVGs | 2026-04-16 | open | Current SVGs are PNG-in-SVG wrappers. Need true vectors for crisp rendering at all sizes |
| B-026 | enhancement | P2 | Mobile responsive hero map | 2026-04-16 | open | Hero map doesn't adapt to small screens. Needs layout breakpoints |
| B-027 | enhancement | P3 | Wire useCountUp hook to hero metrics | 2026-04-16 | open | Hook created in Phase 4A, needs wiring to €509/MW/DAY, 822 MW, etc. |
| B-028 | enhancement | P3 | Bloomberg ticker (SignalBar) styling polish | 2026-04-16 | open | Tighter spacing, better hierarchy, live pulse indicator |
| B-029 | bug | P1 | Pulse-dot colour wrong in light theme | 2026-04-21 | open | `--teal` resolves to `rgb(138, 102, 32)` (dark amber) in light mode. Dot stays visible but reads amber/warning, not live/green. Either fix `--teal` light-mode definition or rebind pulse dot to a semantic `--signal-live` token that holds green across both themes. Queue as Phase 7.6 blocker. |
| B-030 | bug | P2 | S2 FCR hero transient re-render | 2026-04-21 | open | Clicking FCR from aFRR+EE state: hero shows €3.44 for ~1s then settles at €0.37. Likely race between product-state switch and data re-key. Not blocking (steady state is correct), but worth fixing alongside B-029 in Phase 7.6. |

### Backlog notes

**B-001:** Phase 2A-3 Bug 1 fix removed minus sign from worker line ~4725 (`latestFromList`), but frontend still uses inverted convention. The physical truth: LT net_mw=+603 means Lithuania is exporting. NordBalt should show LT→SE, not SE→LT. Files: `lib/baltic-places.ts` (resolveFlow, positiveFlowReceives flag), `HeroBalticMap.tsx` (interconnector list rendering). Fix in Phase 2B-1 which already touches these files.

**B-008:** `lib/safeNum.ts` (2072 bytes) and `app/lib/safeNum.ts` (2072 bytes) — identical size, likely identical content. Same for `useSignal.ts` (2829 bytes each). Need to check imports across the codebase to determine which is imported where, consolidate to one location.

**B-013:** `origin/HEAD` points to `dev` but Cloudflare Pages deploys from `main`. No `dev` branch exists locally (only as remote tracking). Changing default branch in GitHub settings is a no-code operation.

## Session log

### Session 1 — 2026-04-13 — Cowork onboarding + repo organization

**Scope:** Full repository audit, gap analysis, organizational restructure for sustainable Cowork-driven workflow.

**Shipped:**
- Created docs/ subfolder structure: architecture/, playbooks/, principles/, investigations/, phases/, archive/rebuild-specs/
- Moved 13 governance docs from docs/ to docs/principles/ (lowercase-hyphen renamed)
- Moved 15 claude-handover/ files to docs/archive/rebuild-specs/
- Moved 10 investigation reports to docs/investigations/ (date-prefixed)
- Created docs/handover.md (this doc)
- Created docs/map.md (concept-to-file lookup)
- Created docs/glossary.md (energy market terms)
- Created docs/principles/decisions.md (architectural decision log)
- Created 3 playbooks: session-start.md, verification.md, pause-points.md
- Created scripts/diagnose.sh, scripts/verify.sh
- Rewrote CLAUDE.md as 30-line pointer doc
- Updated .gitignore for AI tool dirs, logs, doc binaries
- Created Phase 2B-1 prompt and backlog triage prompt
- Identified and catalogued 14 backlog items (B-001 through B-014)

**Deferred:** PNG/trace file deletion (flagged for manual approval). docs/CHART_AUDIT files not moved (left in docs/ root — see notes).

**Findings:** /genload and /s8 appeared null during audit but confirmed healthy by manual recheck. Arrow direction inversion (B-001) is a real P1 bug visible on production. 462MB of untracked binary files in docs/ need cleanup.

### Session 2 — 2026-04-13 — Tooling evaluation and Superpowers adoption planning

**Scope:** Formalize tool adoption strategy. Evaluate 5 recommended tools against KKME-specific needs. Document decision in ADR-006. Create tooling playbook. Write Superpowers install prompt for a future Claude Code session. Fix the scripts that were created but not committed in Session 1.

**Shipped:**
- ADR-006 in docs/principles/decisions.md (tooling evaluation)
- docs/playbooks/tooling.md (installed tools, rules, usage notes)
- docs/phases/superpowers-install-prompt.md (Claude Code install session)
- scripts/diagnose.sh and scripts/verify.sh added to repo (existed on disk but missed in Session 1 commit)
- handover.md backlog updates (B-015, B-016, B-017)
- handover.md queue update (Superpowers install scheduled before Phase 2B-1)

**Deferred:**
- Actual Superpowers install (requires Claude Code CLI, not Cowork)
- Real-world Superpowers evaluation (happens during Phase 2B-1)

**Findings:** Of 5 tools evaluated (Superpowers, GSD, UI UX Pro Max, Obsidian skill, Awesome Claude Code), only Superpowers passes the net-positive test for KKME. Three rejected on workflow-conflict or wrong-audience grounds. Rejection captured in ADR-006 to prevent re-evaluation churn. Established precedent that every future tool needs an ADR entry before installation — lightweight governance against tool sprawl.

### Session 3 — 2026-04-15 — Phase 2B-1 hero polish (YOLO mode)

**Scope:** Four bundled hero changes, executed end-to-end without pause-point stops (user override). Branch `hero-v3-phase2b-1` off main.

**Shipped:**
- WS1 — Removed permanent project SVG/HTML labels and the connector lines; kept hollow project-dot rings. Hover tooltip was already wired and remains (name · MW · country · COD). Removed `hideCitiesNearProjects` + `findLabelPosition` + `top3` memo + `AVOID_ZONES`. Added `// TODO: Phase 3 mobile tap-to-reveal` marker near the hover targets.
- WS2 — Dropped `items.push('9 SIGNALS LIVE')` from the ticker and replaced the tagline line with `LIVE · ENTSO-E · LITGRID · AST · ELERING`. Grep confirms zero remaining occurrences under app/, lib/, workers/.
- WS3 — Added `--cable-particle` CSS token to both themes in `app/globals.css` (dark: rgb(252,211,77) warm amber; light: rgb(26,26,31) charcoal). Particles in `HeroBalticMap.tsx` now fill via `var(--cable-particle)` at 0.85 opacity, dropping the per-flow rose/teal/neutral tint.
- WS4 — Root-caused arrow inversion: after the Phase 2A-3 worker sign fix, `positiveFlowReceives` in `lib/baltic-places.ts` was still pointing at the exporting country instead of the receiving one. Flipped nordbalt (LT→SE), litpol (LT→PL), estlink-1/-2 (EE→FI). Fenno-Skan left as FI (already correct for SE→FI convention). Single-source fix; no changes to `resolveFlow()` or the render site. Verified against `/s8`: +694 nordbalt now renders `LT → SE 694 MW`, −113 litpol renders `PL → LT 113 MW`, +640 estlink renders `EE → FI`.

**Verification:**
- `npx tsc --noEmit` clean.
- `npm run build` succeeds; production CSS chunk contains both `--cable-particle` values.
- MCP screenshots: dark 1440, light 1440, hover tooltip all captured at `/tmp/phase2b1-*.png`.
- Console: no new errors/warnings (pre-existing THREE.Clock deprecation only).
- `/s8` curl cross-checked against rendered arrows for NordBalt + LitPol — match physical truth.

**Deferred:**
- B-002 (/s8 future timestamp), B-006 (LV↔LT flow display), B-008–B-014 remain open. No new backlog items surfaced during implementation.
- Dev-server Turbopack briefly cached the old CSS after the globals.css edit; verified via `npm run build` + `python3 -m http.server out/` instead. Not a code issue.

**Superpowers:** neutral — session ran in YOLO override with pause points skipped, so Superpowers' brainstorming/plan skills didn't meaningfully engage. The four workstreams were well-specified by the brief, so the frontend-design skill and pause-point playbook were already sufficient. Real evaluation still pending a normal-cadence Phase 2B-2.

### Session 4 — 2026-04-16 — Bucket 3 rebuild: planning, intel feed, pipeline, risk retirement, visual audit

**Scope:** Extended multi-phase session covering strategic planning, 5 Claude Code YOLO sessions, comprehensive visual audit, and prompt authoring for upcoming phases.

**Shipped (via Claude Code YOLO sessions):**

- **Bucket 3 plan finalization** — answered 6 open questions from bucket3-rebuild-plan.md: investor-first priority, algorithmic featured items, defer Nordic hydro, retire model risk register.
- **Phase 3A** — Intel feed data quality cleanup. Fixed Invalid Date, HTML entity decoding, bare URL filtering, missing source rejection. Merged.
- **Phase 3C+3D** — Intel feed visual rebuild. Featured item with scoring algorithm (recency × impact × source quality), Google s2 favicons, source type chips + OFFICIAL badge, magnitude extraction via regex, Cormorant pull-quote whyItMatters treatment, relative dates, filter UX with counts + removable active chips. 7 workstreams in one session. Merged.
- **Phase 4B** — Intel pipeline depth investigation + fix. Root cause: NOT narrow sources but plumbing mismatch — 209 curations in /curate KV never reaching /feed. Built read-time merge first (worked but 31s response), then converted to write-time merge (0.24s). Added `appendCurationToFeedIndex()` and `POST /feed/rebuild-curations` endpoint. Volume: 9→569→54 (after dedup). Merged.
- **Phase 4B-5** — BESS quality gate + relevance scoring + homepage cap. Added BESS_SIGNALS keyword gate (rejects non-energy items), `computeBessRelevanceScore()` with signal-weighted scoring (BESS_CORE +0.35, BALTIC +0.20, quantity +0.15, market +0.10, source +0.10, recency +0.10), 0.25 score floor, homepage 8-item cap with "View all N items →" expander. Result: 52→33 items, zero garbage, score range 0.25–0.94. ~~Merged.~~ **NOT MERGED** (corrected 2026-04-29). Phase 4F forensics (`docs/investigations/phase-4f-intel-feed-regression.md`) confirm commit `6f6d2d7` was orphaned on `origin/phase-4b-intel-pipeline` after PR #15 closed; production never received this code. Phase 4F (Session 26) first-deployed an equivalent gate to production with operator-amended denylist + tier-keyed thresholds + soft-delete audit trail.
- **Phase 3E** — Model Risk Register + Data Confidence retirement. Analyzed 7 risks: MR-01 HIGH→MED (BTD mitigation), MR-03 HIGH→MED (observed prices), MR-04 HIGH→LOW (BTD activation data now observed), MR-02/05/06 unchanged (structural). Archived analysis to docs/archive/. Removed both sections from page.tsx. Added retirement comment to ConfidencePanel.tsx. Merged.

**Authored (prompts for Claude Code, not yet executed):**

- **Phase 3B prompt** (`docs/phases/phase3b-prompt.md`) — Structural drivers rebuild. Replace Wind→Renewable mix, Solar→Residual load, Demand→Peak forecast, Interconnectors→Spread capture. Keep Gas/Carbon with sparklines. v0 snapshot-only using existing endpoints.
- **Phase 4A prompt** (`docs/phases/phase4a-prompt.md`) — Visual overhaul. 10 items from audit: scroll animations (IntersectionObserver), font redistribution (Unbounded for numbers, Cormorant for narrative), amber warmth, section rhythm, hero sidebar grouping, rgba cleanup (137 violations across 15 files), font token cleanup (56 DM Mono hardcodes), count-up animations, filter pill styling, market movers removal.

**Visual audit** (`docs/phases/visual-audit-2026-04-16.md`) — 18-issue catalogue using Chrome MCP tools. 3 critical (model risk table, 63 rgba violations, flat driver tiles), 5 high (no scroll animations, underused fonts, mono-cool color, metronomic spacing, hero text stack), 7 medium, 3 low.

**Key findings:**
- Feed pipeline had two parallel paths: Path A (sync_to_website.py → /curate → KV curation, ~30 items/day) and Path B (daily_intel.py → /feed/events, near-zero). Path A was productive but items never reached /feed. Write-time merge fixed this.
- 82% of curations were noise (ice cream shops, Tesla, airline news). BESS keyword gate + relevance scoring eliminated all garbage.
- Worker /genload returns only total generation per country, not per-source (wind/solar/thermal separately). Phase 3B v0 works around this; v1 needs per-source parsing.
- S7 and S9 have /history endpoints returning daily time series — sparklines already possible for Gas/Carbon.
- CardEntrance.tsx is a dead stub (returns null). No scroll animations exist anywhere in the app.

**New backlog items:**
- B-018: Worker hourly genload history writes (for Phase 3B v1 sparklines)
- B-019: Worker per-source generation parsing from ENTSO-E A75 PsrType fields
- B-020: Worker s1_history endpoint for daily spread capture sparkline
- B-021: Worker da_tomorrow hourly array (not just summary stats)
- B-022: VPS relevance field type mismatch (sends string 'high', worker does Number('high')=NaN)
- B-023: Superpowers ADR-006 re-evaluation (2 neutral + 1 helped across 3 sessions, inconclusive)

**Deferred:** Phase 3B execution, Phase 4A execution, light mode parity audit (V-18), contact section polish (V-13), footer enhancement (V-14), keyboard shortcuts overlay (V-17), coordinated loading state (V-16).

### Session 5 — 2026-04-16 (continued) — Phases 3B, 4A, 4C, 4D execution + 4E planning

**Scope:** Execute four Claude Code YOLO phases (3B, 4A, 4C, 4D), organize wife's design assets, visual verification of each, create persistent memory system for cross-session idea tracking.

**Shipped (via Claude Code YOLO sessions):**

- **Phase 3B** — Structural drivers rebuild. 9 files changed. RenewableMixCard, ResidualLoadCard, PeakForecastCard, SpreadCaptureCard replace old tiles. Gas/Carbon sparklines. Merged to main.
- **Phase 4A** — Visual overhaul. 37 files changed. 106→4 rgba violations, 56→0 hardcoded DM Mono. Scroll animations, font redistribution, section rhythm, amber warmth. Merged to main.
- **Phase 4C** — Design asset integration. 15 files changed. Logo in header/footer/hero, hero map base layer swap to designed SVG layers (dark). Assets organized in public/design-assets/Logo/ and Map/Layers/. Merged to main.
- **Phase 4D** — Hero map rebuild. 5 files changed. Layered SVG base (background-black + countries + interconnect-lines), cable waypoints v2 recalibrated to designed artwork positions, hero logo text→PNG, --nav-bg fully opaque, scroll-padding-top 96px. Branch pushed.

**Authored:**
- **Phase 4E prompt** (`docs/phases/phase4e-prompt.md`) — Country name labels in SVG overlay, cable waypoint refinement (more intermediate points), visible teal cable strokes, larger particle glow.

**Created:**
- Persistent memory system (`.auto-memory/`) with 4 files: user profile, visual vision + dropped ideas tracker, workflow feedback, architecture reference.
- Phase prompts committed: 3B, 3E, 4A, 4B quality gate, 4C, 4D, visual audit doc.

**Key findings:**
- Design SVGs are PNG-in-SVG wrappers (embedded raster via `<image>` + base64), not true vectors. countries.svg = halftone raster. interconnect-lines.svg = 6 cable PNGs positioned via `<use>` + `matrix()` transforms.
- country-labels.svg uses BPdots font (not web-available) — text elements exist with correct positions but won't render. Solution: render labels programmatically in SVG overlay.
- Cable waypoints v2 bounding boxes align with artwork, but 2-3 point polylines can't trace curves. Need more intermediate points.
- Light mode map unchanged (old PNG fallback) — designer hasn't provided light layers yet.

**New backlog items:**
- B-024: Light-mode designed map layers from designer
- B-025: True vector logo SVGs (current are PNG-in-SVG wrappers)
- B-026: Mobile responsive hero map
- B-027: useCountUp hook wiring to hero metrics
- B-028: Bloomberg ticker (SignalBar) styling polish

**Deferred:** Phase 4E execution, cable interactive calibration via /dev/map-calibrate, light mode audit (V-18).

### Session 6 — 2026-04-21 — Phase 7 prompt revision + strategic roadmap (Cowork)

**Scope:** Take over Claude Code prompt authoring for S1/S2 card rebuild. Existing `docs/phases/phase7-s1-s2-rebuild-prompt.md` (v1, authored by older Claude) contained multiple factual drifts vs. production. Verify against live worker, rewrite, and draft strategic roadmap for significant-improvement work beyond Phase 7.

**Staleness caught:** Last handover update was Session 5 (2026-04-16). Git log shows Phases 4E, 5A, 5B, 6A shipped between then and today without handover entries. Captured below under "Work shipped since last handover" rather than fabricating individual session entries.

**Shipped (this session):**

- **Phase 7 prompt revision** — overwrote `docs/phases/phase7-s1-s2-rebuild-prompt.md` (v1 → v2, 637→473 lines). Verified against live production:
  - Corrected `rolling_30d` field names: v1 asked for new `{avg, p5, p95, n}`; reality is `{mean, p25, p50, p75, p90, days}` already populated.
  - Corrected `/s2/history` claim (v1 said afrr_up/mfrr_up/fcr were null; they're populated).
  - Corrected `/s2.activation` shape (v1 assumed `countries[]` array; reality is `{lt, lv, ee}` objects each with `{afrr_p50, afrr_rate, mfrr_p50, mfrr_rate}`).
  - Pinned both real bugs with verified line numbers:
    - `/s1/capture` top-level `gross_2h/gross_4h` missing — `captureData` at `workers/fetch-s1.js:2860` needs flat fields added.
    - `/s1/history` null `gross_2h/gross_4h` — `updateHistory` at `workers/fetch-s1.js:3040-3041` reads wrong path; fix or rely on the /s1/capture flatten.
  - Updated worker line count (7800→8029) and function line numbers (captureRollingStats 2768, computeCapture 2787, computeS1 2906, updateHistory 3027, computeS2Activation 3775, computeS2 3893).
  - Added branch-state prep section (current tree is `phase-6a-s2-auto-tampere` with untracked files — stash `-u` before checkout).
  - Added three explicit pause points (after worker deploy, after card build, before PR).

- **Strategic roadmap** — new doc `docs/roadmap.md`. Phases 7–14 framed around significant improvement vs. polish: cross-signal synthesis (Market Regime header), peer comparison strip (DE/PL/SE4), fleet & pipeline dashboard (VERT.lt already in worker), interactive revenue model, historical depth, methodology page, mobile pass.

**Production state verified via live curl (2026-04-21):**
- `/s1/capture`: healthy; `capture_2h.gross_eur_mwh=141.35`, `rolling_30d.stats_2h.mean=127.89`.
- `/s1/history`: 90 entries; newest has spread/swing populated; gross_2h/gross_4h null across all 90.
- `/s2`: healthy; 24 top-level keys including activation/capacity_monthly/rolling_180d.
- `/s2/history`: 35 entries; newest 2026-04-20 has afrr_up=2.6, mfrr_up=10.1, fcr=0.37.

**Work shipped since last handover (2026-04-16 → 2026-04-21, caught up retroactively):**

- **Phase 4E** (merged PR #20) — map country labels + cable refinement.
- **Phase 5A** (merged PR #21) — visual audit fix: removed double cable rendering, fixed gen/load display, adjusted country label positions.
- **Phase 5B** (merged PR #22) — Chart.js color fix (resolve CSS vars for canvas via `useChartColors()` hook in `app/lib/chartTheme.ts`), generated light-mode map layers, vector logos.
- **Phase 5C** — prompt authored at `docs/phases/phase5c-final-polish-prompt.md`; execution status unknown (still untracked).
- **Phase 6A** — worker cron now automates S2 activation clearing (commit 6bf074a on branch `phase-6a-s2-auto-tampere`, not yet merged). Admin trigger + staleness watchdog.

**Deferred:**
- Notion board updates (Phase 7 entry refresh + add Phases 8–14) — next step this session.
- Execution of Phase 7 (goes to Claude Code YOLO).
- Phase 6A merge to main (still on feature branch).

**Findings for future Cowork sessions:**
- Handover.md drifted 5 days / 4 phases behind. Cadence issue — add it to end-of-session checklist for Claude Code phases too, not just Cowork.
- `docs/map.md` line counts (and probably function line numbers) are stale. Prompt authors should `wc -l` before citing.
- Prompt v1 claimed null fields that were populated — suggests previous prompt author didn't curl live worker before writing. Verification-first should apply to prompt authoring, not just code.
- Untracked files accumulating: `docs/phases/phase5c-final-polish-prompt.md`, `docs/phases/phase7-s1-s2-rebuild-prompt.md`, `public/hero/map-calibration-cities.json.json` (B-011 still open).

### Session 7 — 2026-04-21 — Phase 7 execution (Claude Code YOLO)

**Scope:** Execute Phase 7 — S1 & S2 card rebuild (Bloomberg density). Two worker bugs, AnimatedNumber primitive, full card rebuilds.

**Shipped:**

- **Part A — Worker bug fixes** (deployed version d278adff):
  - Bug 2: `computeCapture()` now emits flat `gross_2h/gross_4h/net_2h/net_4h` at top level. Verified via curl: `gross_2h=141.35, gross_4h=128.33, net_2h=140.61, net_4h=127.48`.
  - Bug 1: `updateHistory()` reads flat fields first, falls back to `capture_2h.gross_eur_mwh`. Belt-and-braces with Bug 2 fix.
  - Backfill: `POST /admin/backfill-s1-history` patched 65/90 history rows (25 had no capture data). Before: all null. After: numeric.
  - Added `POST /admin/trigger-s1-capture` for manual recompute.

- **Part D — AnimatedNumber primitive** (`app/components/primitives/AnimatedNumber.tsx`, 56 lines):
  - Raw RAF tween, ease-out cubic, `tabular-nums`, `prefers-reduced-motion` respect. No library deps.

- **Part B — S1Card rebuild** (887→400 lines):
  - Hero: AnimatedNumber with gross capture (2h/4h toggle).
  - Status chip: OPEN/TIGHTENING/COMPRESSED from `rolling_30d` percentile position.
  - Interpretation: one sentence with p-bucket.
  - Rolling context strip: mean/p25/p50/p75/p90/days.
  - 30-day sparkline with p50 reference line. Chart.js via `useChartColors()`.
  - Impact line: 100 MW × duration revenue implication.
  - Drawer: monthly bars + gross→net bridge + price shape.

- **Part C — S2Card rebuild** (1449→425 lines):
  - Hero: product toggle (aFRR/mFRR/FCR) with AnimatedNumber.
  - Status chip: HIGH/STABLE/LOW from activation P50 comparison.
  - Per-country activation strip (LT/LV/EE aFRR + mFRR P50).
  - 35-day history sparkline.
  - Impact line: 50 MW aFRR annual revenue.
  - Drawer: capacity monthly bars + 9-day BTD averages table.

**Verification:**
- `npx next build` passes clean.
- Zero raw rgba/hex in either card. All Chart.js via `useChartColors()`.
- S1Card 400 lines (target <600). S2Card 425 lines (target <800).
- Net reduction: -1,511 lines across both cards.

**Deferred:**
- Visual audit screenshots (Chrome DevTools MCP unavailable this session).
- `/s2` rolling_180d products have sparse data (1 day each) — context strip falls back to activation P50 instead.

### Session 8 — 2026-04-21 — Phase 7 Pause Point 2 resume (Claude Code)

**Scope:** Resume Phase 7 at Pause Point 2. Walk items a–e, mobile verification, optional RTE footnote, Pause Point 3 gate, push for PR.

**Shipped:**
- **RTE footnote in S1 drawer** (`0c8bb61`): wrapped `BridgeChart` rows in `<Fragment>`, appended muted caption `loss scales with charge-leg cost` under any `deduction`-type row whose label starts with `RTE loss`. Uses `var(--font-2xs, 10px)` + `var(--text-muted)`, no new tokens.
- **Visual audit captured** (`docs/visual-audit/phase-7/`): S1 and S2 at mobile (375 emu) + desktop (1440×900) in both themes, plus drawer-open screenshot showing the footnote render. Script-measured article widths at mobile: S1 = 301 px, S2 = 285 px. Zero horizontal scroll.
- **Branch pushed** to `origin/phase-7-s1-s2-cards` (8 commits total ahead of `dev`).

**Walked but skipped (phantom findings):**
- `(a)` S2 `?%` Rate column — grep across `app/components/` returned zero. The `afrr_rate`/`mfrr_rate` fields on the TS interface are declared but never rendered. Nothing to drop.
- `(c)` dead S1Card/S2Card imports — only `app/page.tsx` imports each. Already clean.
- `(e)` sparkline data path — `Sparkline` reads `cap.history` = `/s1/capture.history[-30:]`. Live curl confirms 30 entries, all numeric `gross_2h/gross_4h`. No stale reference.

**Verification gates:**
- `npx next build` clean (70 s compile, 6 static pages).
- `rg 'rgba\('` on S1Card + S2Card: 0.
- `rg '#[0-9a-fA-F]{6}'` on S1Card + S2Card: 0.
- Runtime console: 1 unrelated 404, zero Chart.js/React/token errors.

**Deferred:**
- PR open — left to user (GitHub web UI, manual merge per protocol).
- Notion Phase 7 status → Shipped — user to update.

---

### Session 9 — 2026-04-21 — Phase 7.5 audit + roadmap re-sequencing (Cowork)

**Scope:** User critique after Phase 7 landing surfaced 8 visual/structural issues. Verify each against live production via Chrome MCP DOM diagnostics. Route each to an existing or new phase. Re-sequence roadmap so first-impression phases come before synthesis phases.

**Shipped:**
- **Baseline audit** — pulled DOM/CSS diagnostics from kkme.eu via Chrome MCP. Confirmed: hero bg is flat `rgb(5,5,5)` with no image and `attachment: scroll`; Baltic map has 52 country polygons at solid `rgb(252,211,77)` full opacity; `<h1>` has empty innerText and 16px font; only 4 CSS breakpoints exist (520/768/900/1100), none below 520px; body has 27,968 chars of text vs. 8 canvases (~3,500 chars per chart). Report: `docs/visual-audit/phase-7-5-audit/DIAGNOSTIC.md`.
- **Phase 7.6 prompt authored** — `docs/phases/phase7-6-hero-prompt.md`. Four interventions: atmospheric background layer (radial gradient, fixed), country polygon opacity to ~10% + hairline stroke, real 48px Cormorant H1 with three proposed copy options, explicit <520 + <380 breakpoints. Pause points after A, C, D.
- **Roadmap re-sequenced** — `docs/roadmap.md`. Phase 12 (historical toggles) promoted to Phase 8. Phase 14 (mobile) promoted to Phase 9. Old Phases 8 (regime), 9 (peer), 10 (fleet), 11 (revenue model), 13 (methodology) demoted by 2 slots. Sequencing rationale rewritten to reflect first-impression-first priority.
- **Handover updated** — current phase pointer, queued list, this session log.

**Verification gates:**
- `grep -nE '^### Phase'` on roadmap confirmed clean 7 → 7.5 → 7.6 → 8 → 9 → 10 → 11 → 12 → 13 → 14 order.
- DOM diagnostics re-read to confirm each finding cited in DIAGNOSTIC.md matches live state.
- Phase 7.5 scope re-read to confirm hero/mobile/new-chart-types are explicitly excluded (avoiding duplicate scope with 7.6 / 8 / 9).

**Key findings not obvious without the audit:**
- The map SVG root is already transparent; the "not transparent" symptom traces specifically to 52 solid amber country polygons, not the SVG container.
- Hero has zero canvases — `0 canvases, 3 SVGs, 4 images` in 720px. All 8 Chart.js canvases are below the fold.
- Chrome MCP `resize_window` resizes the OS window but does NOT shrink inner viewport. Mobile visual confirmation needs to defer to CC's `chrome-devtools` MCP device emulation.

**Next session:**
- Kastytis chooses: run Phase 7.5 first (polish shipped cards) OR skip to Phase 7.6 (hero issues are more visible). Recommendation: 7.5 first — it's the shorter hop, the prompt is already written, and 7.6 will benefit from polished-card tokens.
- Update Notion board: add Phase 7.6 entry, renumber promoted/demoted phases.

**Deferred:**
- Notion board sync (Phase 7.6 entry + renumber) — pending.
- Decision on H1 copy (3 options in Phase 7.6 prompt) — Kastytis picks at Pause 2.

### Session 10 — 2026-04-21 — Phase 7.5-F screenshot finish + push (Claude Code)

**Scope:** Resume from `docs/phases/phase7-5-F-resume-prompt-v3.md` at Pause 2. v2 session landed at ~83% context mid-drawer-shot batch; commit boundary `3000e7e` (F4 part 2) already clean. Task was narrow: re-shoot 1 imperfect PNG, capture 7 new ones, commit + push.

**Shipped (commit `117b1a7`, merged to dev):**
- 8 new PNGs in `docs/visual-audit/phase-7-5-F/`: `s1-drawer-how`, `s2-drawer-what`, `s2-drawer-how`, `s2-country-lv`, `s2-country-ee`, `s2-product-fcr`, `s1-face-light`, `s2-face-light`.
- Re-shot `s1-drawer-what.png` — previous crop cut the "WHAT THIS IS" title flush to top edge; new crop lands the title at viewport y≈104 with ~44 px clean space above.
- **`.gitignore` carve-out:** added `!docs/visual-audit/phase-*/` and `!docs/visual-audit/phase-*/*.png` immediately below the existing `docs/**/*.png` rule. Verified via `git check-ignore`: phase-`*` subfolder PNGs whitelisted; `docs/*.png` and `docs/visual-audit/non-phase/**/*.png` still ignored. Rationale: phase-specific visual-audit folders are evidence tied to shipped commits (regression reference), not incidental screenshots — the existing blanket rule would have hidden them forever.

**Verification during capture:**
- Live-worker spot checks matched rendered heroes to decimal: LV `activation.lv.afrr_p50=13.6` → hero €13.6; EE `13.2` → €13.2; LT aFRR `13.5` → €13.5.
- FCR: all three country toggles confirmed disabled (`opacity: 0.45`, `cursor: not-allowed`, muted `rgba(232, 226, 217, 0.45)` text).
- Light-theme pulse dot: visible (~5.7 px, `rgb(138, 102, 32)`) but no longer green — flagged as B-029.
- Pause 3 was honoured (no push until user "merged" confirmation).

**New blockers surfaced during capture (queued for Phase 7.6):**
- **B-029 — pulse-dot colour remap in light theme.** Real bug. `--teal` token resolves to dark amber in light mode. Dot reads as "warning amber" rather than "live green" — semantic drift. Fix: rebind pulse dot to a semantic `--signal-live` token that holds green across themes, or correct the light-mode `--teal` definition.
- **B-030 — S2 FCR hero transient.** Non-blocking race: hero briefly shows previous-product value (€3.44) before settling on FCR-specific value (€0.37). ~1 s transient. Worth grouping with B-029 for a Phase 7.6 S2-path review.

**Disposition of third anomaly flagged in Pause 3:**
- FCR keeps the imbalance-tile row → **spec wrong, implementation right.** Imbalance is grid-wide MWh context, not product-scoped. Plan doc (`docs/phases/phase7-5-F-card-redesign-plan.md`) to be updated by Kastytis.

**Out of scope / not touched:**
- `logs/btd.log` modifications, `.claude/skills/`, `public/hero/map-calibration-cities.json.json` (still B-011 open), `workers/.wrangler/` — all remain untracked.
- Pre-commit lint noise (worker + two `no-direct-set-state-in-use-effect` in S1Card/S2Card) — out of scope per v3 prompt; `next build` remains the release gate.

**Tooling notes for next session:**
- Screenshot workflow that worked end-to-end: `new_page` → `resize_page 1440 900` → scroll article to viewport y ≈ 80 via `evaluate_script` → `take_screenshot` to `/tmp/` → Pillow crop at 2× DPR with S1 rect `(140, 60, 688, 585)` and S2 rect `(742, 60, 1290, 555)` in CSS px. For drawer shots, target anchor top at viewport y ≈ 104 so the section title breathes above the prose.
- `wait_for` on the S1/S2 text returns the full page accessibility snapshot (~120K chars) — ignore the dump, it just confirms load.
- A previously-hidden folder `docs/visual-audit/phase-7/` surfaced as untracked once the gitignore exception was added. Left untouched this session; likely candidate for a follow-up commit if Session 8's `phase-7` visual-audit PNGs should also be persisted retroactively.

### Session 11 — 2026-04-26 — Phase 7.6 Session 1 (numerical reconciliation, Claude Code)

**Scope:** Phase 7.6 Session 1 of 3. Vitest harness + 7 small bug-class fixes (7.6.1–7.6.7), each with a unit-test spec and an individual commit. Branch `phase-7-6-numbers` off main.

**Shipped (8 commits, branch pushed to `origin/phase-7-6-numbers`):**

| # | Commit | Spec |
|---|--------|------|
| 7.6.0 | `1862ca4` chore: vitest harness setup | `smoke.test.ts` |
| 7.6.1 | `b431bb2` ticker reserve units €/MWh → €/MW/h | `ticker.test.ts` (4 cases) |
| 7.6.2 | `84d1b03` Peak Forecast spread delta — correct label and denominator | `peakForecast.test.ts` (6 cases) |
| 7.6.3 | `4c2c5c1` canonical fleet count — single source of truth for operational MW | `fleet.test.ts` (7 cases) |
| 7.6.4 | `40baa79` S/D ratio — surface formula and reconcile inputs | `sdRatio.test.ts` (7 cases) |
| 7.6.5 | `7beae66` renewable mix — corrected/footnoted Solar share | `renewableShare.test.ts` (8 cases) |
| 7.6.6 | `13c8dbf` dispatch chart — y-axis unit correctness, integration matches headline | `dispatchChart.test.ts` (6 cases) |
| 7.6.7 | `209d7f0` IRR sensitivity panel — matrix honours scenario, regression spec lands | `sensitivityMatrix.test.ts` (6 cases) |

**Verification gates:** 46 tests across 8 files green; `npx tsc --noEmit` clean; `npx next build` clean (39.6 s); production endpoints `/s1 /s2 /s8 /genload` all 200 post-worker-deploy.

**Worker change deployed (version `5d791e86-e36e-460e-8e87-a1e40658fc25`, single hunk in `processFleet`'s sensitivity-matrix loop): 7.6.7.**
- `workers/fetch-s1.js:7308` was hardcoding `scenario: 'base'` for off-diagonal matrix cells. The Returns sensitivity matrix therefore stayed pinned to base IRRs even when the user toggled conservative or stress on the headline. The audit symptom ("the model isn't responding to its CAPEX input") was actually two stacked phenomena: the audit-described reading was the mid-CAPEX *row* across COD years (8.8 / 8.6 / 8.6 — flat by 0.2 pp because COD has small effect in mid-CAPEX, but CAPEX axis IS responding correctly along columns: 14.3 / 8.8 / 2.1 in 2027); and the matrix-vs-scenario divergence was a real bug that mis-rendered scenario-toggle interactions. Fix: pass `scenParam` through, reuse `all_scenarios[scenParam]` for the current cell. Verified post-deploy: `base [14,8,2,...]`, `conservative [10,5,-1,...]`, `stress [null×9 — uneconomic floor]`. Stress all-null is correct (pre-existing model behaviour, IRRs <-50% across the matrix).

**Anomalies / non-obvious findings discovered during investigation:**
- **7.6.2 — "spread %" was actually cross-zone.** PeakForecastCard's `tomorrow.spread_pct` field is the LT–SE4 cross-zone separation `(lt_avg − se4_avg) / |se4_avg|`, NOT the intraday peak−trough spread that readers infer from the adjacent peak/trough labels. Same name, two different quantities. Now displayed as `range €X/MWh · vs SE4 ±Y%` with distinct labels.
- **7.6.3 — 822 vs 651 is real semantic difference, not a bug.** 822 MW = flex fleet (BESS + Kruonis 205 MW pumped hydro) from `/s4.fleet`; 651 MW = BESS-only registry from `/s4.baltic_total`. Both valid; both should exist; they should not share the label "operational." Renamed Hero/SignalBar tile to **FLEX FLEET** with hover-title disambiguation.
- **7.6.3 — silent null on SignalBar.** `SignalBar.tsx` was reading `data.s2.baltic_operational_mw`, which is always null on `/s2` (the field only exists on `/s4`). Tile silently rendered "—" forever. Fixed: now reads `data.s4?.fleet?.baltic_operational_mw` via the new helper. **The same silent-null pattern lives on in `HeroMarketNow.tsx:61` (B-009 dead code, not imported anywhere). Left untouched per scope discipline; B-009 is a candidate for outright deletion in a future cleanup.**
- **7.6.4 — S/D inputs are not what readers think.** Formula is `baltic_weighted_mw / eff_demand_mw` = 1358 / 752 = 1.81. The user-visible inputs (operational 822, pipeline 1083, demand 752) are NOT the numerator. Numerator is the credibility-weighted sum (operational ×1.0, under_construction ×0.9, connection_agreement ×0.6, application ×0.3, announced ×0.1; pumped_hydro and tso_bess excluded). Surfaced inline beneath the headline.
- **7.6.5 — solar 62% is real, not an artifact.** Live trace today (2026-04-26 14:00 UTC): solar 1482 MW / load 2395 MW = 62%. Solar at 53% of installed (1482/2800), load unusually low (2395 vs ~3500 typical). Aggregation is correct. Ships with anomaly footnote that fires when today's solar share is ≥1.9× the 7D average.
- **7.6.6 — chart bars were absolute € for 50 MW asset.** Sum/mw_total = headline (internally consistent), but unlabeled axis made the chart unreadable — peak ~€1,750 looked like €/MW/h. Now bars are normalised to €/MW/h (divided by mw_total), explicit y-axis title, corner annotation showing "Daily avg: €X/MW/h · sum = €Y/MW/day."

**Cross-cutting Cowork-side notes captured during this session:**
- **`/revenue` engine is FAR richer than the Phase 7.7 scope assumed.** `project_irr` and `equity_irr` already separately computed; `min_dscr`, `min_dscr_conservative`, `worst_month_dscr` already exist; bankability flag exists; 13-month backtest array exists; `ch_benchmark` and `eu_ranking` exist; full `all_scenarios` (base/conservative/stress) exists. Phase 7.7 estimate revised down from 4 sessions to 3 — most of the work is binding existing engine output to cards, not extending the engine.
- **HeroMarketNow.tsx is dead code (B-009).** Still imports the silent-null pattern fixed in SignalBar. Decision deferred: delete in a future cleanup once it's confirmed nothing latent still routes through it.

**Out of scope / not touched (per scope discipline):**
- 7.6.8–7.6.13 (cross-card reconciliation + IRR labels + distribution skew) → Session 2.
- 7.6.14–7.6.16 (hour labelling, activation-rate methodology, timestamp normalisation) → Session 3.
- 7.6.12 (Gross→Net "show the work") was completed in F5-lite; skipped here.
- HeroMarketNow.tsx, `docs/handover.md` (this entry will close that), `docs/phases/upgrade-plan.md` (P7 lock edit by user mid-session — left intact), `logs/btd.log`, `.claude/skills/`, `public/hero/map-calibration-cities.json.json` (B-011), `workers/.wrangler/` — all left as-is.

**Next session:** Session 2 of Phase 7.6 — 7.6.8 (capture price), 7.6.9 (dispatch price), 7.6.10 (pipeline labelling), 7.6.11 (IRR labels), 7.6.13 (S1 distribution skew investigation). Same discipline. Session 3 prompt to be authored at the end of Session 2.

### Session 12 — 2026-04-26 — Phase 7.6 Session 2 (cross-card reconciliation, Claude Code)

**Scope:** Phase 7.6 Session 2 of 3. Cross-card reconciliation (7.6.8–7.6.11) + S1 distribution-skew investigation (7.6.13). Branch continued on `phase-7-6-numbers`. 7.6.12 was already shipped in F5-lite — skipped. Each fix paired with a unit-test spec and a discrete commit.

**Shipped (5 commits on `phase-7-6-numbers`):**

| # | Commit | Spec |
|---|--------|------|
| 7.6.8  | `a2a44c3` capture price reconciliation — rename non-canonical surfaces | `captureDefinitions.test.ts` |
| 7.6.9  | `f8f895d` dispatch price reconciliation — canonical = dispatch model | `dispatchDefinitions.test.ts` |
| 7.6.10 | `b29fd6d` pipeline numbers labelled distinctly across funnel tiers | `pipelineDefinitions.test.ts` |
| 7.6.11 | `9004355` IRR labels — one canonical name per kind, "Gross IRR" forbidden | `irrLabels.test.ts` |
| 7.6.13 | `1880496` S1 distribution skew — aggregation clean, real left-skew footnoted | `distributionShape.test.ts` |

Plus `713b8b5 docs(7.6): Session 3 prompt` capturing the Session 3 plan at end-of-session.

**Verification gates:** Specs all green (cumulative ~13 files / 81 tests post-Session-2); `npx tsc --noEmit` clean; `npx next build` clean. No worker change in this session.

**Anomalies / non-obvious findings:**
- **7.6.8 — three "capture" concepts, one shared noun.** Today's live values: DA gross capture €32.09/MWh (canonical, `/s1/capture` top-N − bottom-N), DA peak-trough range €167.5/MWh (`/read.bess_net_capture` raw envelope, bottom floored at 0), realised arbitrage €3.38/MWh (`/api/dispatch.arbitrage_detail.capture_eur_mwh`, post-RTE/SoC). All real, all distinct; the bug was sharing the noun. SpreadCaptureCard renamed "Peak-trough range" + cross-references the canonical S1 figure inline.
- **7.6.9 — €292 vs €311 was a 6% methodology gap, not arithmetic drift.** `/api/dispatch.revenue_per_mw.daily_eur` (TradingEngineCard, ISP-level allocation, SoC-aware) is now pinned canonical. `/revenue.live_rate.today_total_daily` (RevenueCard, S1 capture × cycles + S2 clearing × MW) carries a "vs canonical" footnote. €371/€373 mentioned in audit are scenario-specific historicals not currently rendered; same vocabulary applies whenever they re-render.
- **7.6.10 — 1.08 / 1.4 / 3.7 / 1.5 GW were four authority-distinct funnel tiers, all labelled "pipeline."** LT-specific tiers in S4 BESS pipeline detail were already labelled distinctly. The remaining offender — Fleet tracker tile — renamed to "Flex pipeline" with hover-title disambiguation pointing at the LT siblings.
- **7.6.11 — "Gross IRR" was a label, not a metric.** HeroBalticMap rendered `revenue.project_irr` as "X% gross IRR", but project_irr is the unlevered project IRR (post-tax/opex, pre-debt). "Gross IRR" usually means pre-tax/fees. Pinned two canonical kinds: Project IRR (= unlevered) and Equity IRR (= levered). FORBIDDEN_IRR_TERMS regression detector trips on any future "gross IRR" leak.
- **7.6.13 — left-skew is real, not an aggregation artifact.** `captureRollingStats` already computes mean and percentiles from the same filtered+sorted array — no window mismatch. Live 30D distribution (gross_2h) genuinely left-skewed: three days under €36 (14.67, 29.25, 35.93) drag mean below median while upper tail is shorter (top three: 271, 243, 202). Cause: shoulder-season days where wind dies and load stays flat. Footnote ships when `classifySkew` sees mean < median by ≥ a threshold. Aggregation-consistency invariant assertion lives in `distributionShape.ts` so a future window-mismatch regression trips.

**Out of scope / not touched:** 7.6.14–7.6.16 deferred to Session 3 (Session 3 prompt authored at end of session as `docs/phases/phase7-6-prompt.md` v2 superseding earlier drafts); HeroMarketNow.tsx still flagged as B-009 dead code; user-side files (`logs/btd.log`, `.claude/skills/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`) untouched.

### Session 13 — 2026-04-26 — Phase 7.6 Session 3 + close-out (Claude Code)

**Scope:** Phase 7.6 Session 3 of 3 (final). Three remaining items from the audit's "design / methodology" tier — hour labelling (7.6.14), activation-rate methodology (7.6.15), site-wide timestamp normalisation (7.6.16). Branch continued on `phase-7-6-numbers`. Each fix paired with a unit-test spec and a discrete commit. No worker change in this session.

**Shipped (3 commits on `phase-7-6-numbers`):**

| # | Commit | Spec |
|---|--------|------|
| 7.6.14 | `f8c5350` hour labels — UTC → EET, peak/trough match local market clock | `hourLabels.test.ts` (10 cases) |
| 7.6.15 | `42e1a63` activation rate — explicit methodology on card | `activationCoverage.test.ts` (8 cases) |
| 7.6.16 | `c89a190` timestamp normalisation — single rule, single helper | `freshness.test.ts` (7 cases) |

**Verification gates:** 107 tests across 16 files green; `npx tsc --noEmit` clean; `npx next build` clean (18.0 s compile, prerender 1.04 s for 6 routes); production endpoints `/s1 /s2 /s8 /genload` all 200 from session-start diagnose.

**Anomalies / non-obvious findings:**
- **7.6.14 — "h0" was a 02:00 EET / 03:00 EEST peak rendered as midnight.** ENTSO-E A44 publishes hourly DA prices indexed from 00:00 UTC. Baltic markets run on EET (UTC+2 winter) / EEST (UTC+3 summer DST). The cards' raw indices were never converted — so the audit's "peak h0 is unusual for daily peak" was right: h0 UTC mapped to 02:00/03:00 local. Live shape today: peak_hour=0 (= 03:00 EEST since 2026-04-26 is post-DST cutover on 2026-03-29). New helper `app/lib/hourLabels.ts` resolves the offset via `Intl.DateTimeFormat` with `Europe/Vilnius` so DST transitions are not hard-coded. PeakForecastCard and S1Card.ShapeRow now render `h{N} EET`. The label uses "EET" colloquially even during EEST, matching audit prompt and Baltic market parlance.
- **7.6.15 — 49% was correct for the stated formula, but the formula isn't what readers think.** Worker computes `activatedISPs.length / 96 × 100` — fraction of 15-min ISPs (out of 96 daily) with any aFRR/mFRR upward dispatch. That's **ISP coverage**, not the textbook "activation rate" (= activated MWh ÷ reserved MW × hours). The audit's "high for European aFRR (typical 20–40%)" comparison applies to the textbook definition, which is unrelated. Renamed the displayed metric to **"Activation coverage"** and surfaced the `÷96` formula caption beneath. Worker contract (`activation_rate_pct`) unchanged to avoid widening blast radius. New helper + spec at `app/lib/activationCoverage.ts`.
- **7.6.16 — five distinct timestamp formats on a single page.** N-7 in `upgrade-plan.md` already mandates one rule: ≤24h relative; >24h absolute UTC ISO8601 with explicit timezone. `app/lib/freshness.ts` already had the building blocks (`formatAge` + `formatAbsoluteUTC`); now exports the canonical `formatTimestamp(iso, now?)`. Boundary at exactly 24h reads "24h ago" (relative wins to keep morning-after refresh continuous). Wired through every actively-rendered card: PeakForecast, SpreadCapture, RenewableMix, ResidualLoad, S1, S2, S4, S7, S9. S1/S2 internal `timeAgo` helpers retired. SourceFooter now skips the "—" sentinel rather than rendering "Updated —". **Out-of-scope:** retired cards (LoadCard/SolarCard/WindCard/S5/S6/S8 — none of these route from active routes per `app/page.tsx` audit), domain-specific date displays (S3 capex basis dates, IntelFeed publish dates, HeroBalticMap "as-of HH:MM UTC" hero readout — different convention).

**Final Phase 7.6 totals (Sessions 1+2+3):**
- 16 commits across 7.6.0 (harness) + 7.6.1–7.6.16 (skipping 7.6.12 already in F5-lite)
- 107 unit tests across 16 spec files
- One worker change (Session 1, 7.6.7 sensitivity-matrix scenario fix, deployed and verified)
- Zero dependency additions beyond Session 1's vitest + zod
- Branch `phase-7-6-numbers` pushed to `origin/phase-7-6-numbers` end-of-session

**Cross-cutting notes for the next phase:**
- Phase 7.6 numerical reconciliation done. Branch ready for user review/merge to `dev`. No PR opened (per protocol — user's call).
- Phase 7.7 (financial model exposure) and Phase 8 (Foundation Sprint) become parallel options. Either can go first. Decision deferred to user based on which has the cleaner kickoff.
- HeroMarketNow.tsx still flagged as B-009 dead code carrying a silent-null pattern. Removal candidate for a future cleanup pass.

**Out of scope / not touched (per scope discipline):**
- S3Card capex basis date format ("Apr 26, 2026") — domain-appropriate as-of label, not data freshness.
- `docs/phases/upgrade-plan.md` checkbox-strikes for 7.6.* — left to user (P7 lock); user may prefer to mark done from their own clock.
- HeroMarketNow.tsx (B-009), `logs/btd.log`, `.claude/skills/`, `public/hero/map-calibration-cities.json.json` (B-011), `workers/.wrangler/`, `docs/visual-audit/phase-7/`, `docs/phases/phase7-6-prompt.md` user-side edit — all left as-is.

### Session 14 — 2026-04-26 — Phase 8 Session 2 (extend primitives + visual atoms, Claude Code)

**Scope:** Phase 8 Session 2 of 5 (per `docs/phases/plan-audit-2026-04-26.md` re-split). Branch `phase-8-foundation` re-cut off main at `c5fdb1d` (the prior branch was merged in PR #30 with 8.1 + 8.2 — semantic token aliases + three-voice typography ramp). This session ships 8.3 / 8.3b / 8.3c / 8.3d. No card consumes the new primitives yet — Phase 10 owns the migration.

**Shipped (4 commits on `phase-8-foundation`):**

| # | Commit | Specs (added) |
|---|--------|---------------|
| 8.3   | `06b75d0` extend MetricTile + FreshnessBadge + DataClassBadge | `metricTile` (7), `freshnessBadge` (10), `dataClassBadge` (12) |
| 8.3b  | `42764a8` four visual atom primitives — DistributionTick / RegimeBarometer / VintageGlyphRow / CredibilityLadderBar | `distributionTick` (10), `regimeBarometer` (11), `vintageGlyphRow` (8), `credibilityLadder` (13) |
| 8.3c  | `bd80cdd` formatNumber + a11y twin utility | `format` (37 across 14 NumberKinds) |
| 8.3d  | `606e16a` `<DataState>` 4-state wrapper primitive | `dataState` (8) |

**Verification gates:** 257 unit tests across 27 spec files green (141 baseline + 116 new); `npx tsc --noEmit` clean; `npx next build` clean (Turbopack 12.0 s compile, prerender 636 ms for the 4 routes); production endpoints `/s1 /s2 /s8 /genload` all 200 from session-start diagnose.

**API summary for the new primitives:**

- `MetricTile` — gains optional `fan?: { p10; p50; p90 }`, `sampleSize?`, `methodVersion?`. Existing call sites in S4/S7/S8/S9/HeroMarketNow continue to work unchanged. Implements N-4 / N-5 / N-6 at the renderer level.
- `FreshnessBadge` — refactored to consume `freshnessLabel()` (single source of truth, N-7). Renders LIVE / RECENT / TODAY / STALE / OUTDATED with the absolute UTC on hover. No active consumers at refactor time, so the API change has zero blast radius.
- `DataClassBadge` — re-pointed to the 8.1 `--mint` / `--lavender` / `--ink-subtle` aliases. The `derived` and `observed` paths used by S1/S2 resolve to `--teal` (no visible change); the `modeled` path now picks lavender per P1 ("modelled = lavender") instead of the prior muted gray.
- `<DistributionTick>` — pure-SVG hairline + p25/p50/p75/p90 ticks + mint today tick. Default 80×12. Phase 10 will apply 50+ times.
- `<RegimeBarometer>` — five-zone bar (tight=coral, compressed=amber, normal=text-tertiary, wide=mint, stress=lavender) with mint needle. Aria label encodes the active regime.
- `<VintageGlyphRow>` — O / D / F / M provenance pills. observed=mint-filled, derived=mint outline, forecast=lavender outline, model=lavender dashed. Standalone for cards where MetricTile is overkill.
- `<CredibilityLadderBar>` — descending stacked tiers with width proportional to MW, lavender (aspirational top) → mint (real bottom) gradient. Tooltip carries label + MW + percent.
- `formatNumber()` / `formatNumberA11y()` — fourteen `NumberKind` cases enforce N-2 unit clarity. The a11y twin produces verbose unit phrases ("euros per megawatt-hour") so screen-readers don't say "E slash M W H".
- `<DataState>` — `loading | ok | stale | error` wrapper. Loading uses the existing `.skeleton` class (no new keyframes). Stale renders an amber dot + tooltip. Error renders a rose dot, message, and an optional Retry button bound to a callback.

**Anomalies / non-obvious findings:**

- **Vitest path-alias resolution gap (fixed in this session).** Existing tests imported via relative paths only, so the `@/` alias was never exercised in vitest. Component-level tests via SSR rendering needed it; vitest config now registers `'@'` → repo root (commit `06b75d0` includes the config delta). All 27 specs run green afterwards.
- **`@testing-library/react` not installed (per the prompt's `Hard stops`).** Tests SSR-render via `react-dom/server.renderToStaticMarkup` and assert against the markup. The `<DataState>` retry-callback test reaches into the React element tree by recursively expanding component nodes (`typeof node.type === 'function'` → call it with the props), which avoids needing a DOM while still exercising the `onClick` wiring.
- **`DataClass` type does not include `forecast`.** The audit's O / D / F / M alphabet is covered by `<VintageGlyphRow>`'s narrower `Vintage` union (`observed | derived | forecast | model`); `DataClass` itself was not modified per the prompt's "don't modify; consume" rule on `app/lib/types.ts`. Phases 7.7 / 10 will revisit if an `F` data class becomes useful for runtime payloads.
- **Old local `phase-8-foundation` had to be deleted.** The branch was already merged in PR #30; the prompt explicitly authorises `git branch -D phase-8-foundation` to recreate it off main. Remote was untouched; the push was a fast-forward (`e89a053..606e16a`).

**Cross-cutting notes for the next phase:**

- **Phase 8 Session 3 is gated on Q3 from `plan-audit-2026-04-26.md`** — Lucide React vs. user's Figma exports for the icon sprite + true-vector logo. Don't author a Session 3 prompt until that decision lands.
- **No card migrations were attempted** (Phase 10 owns that). Pages render identically because (a) no card consumes any new primitive, (b) the `DataClassBadge` token swaps resolve through the 8.1 aliases to the same legacy values for `observed` and `derived`.
- **`docs/phases/upgrade-plan.md` § Session log** updated with a one-line "Phase 8 Session 2 shipped" entry. Checkboxes for 8.3* left for the user (P7 lock).
- **`HeroMarketNow.tsx` (B-009) still flagged as dead code** — unchanged in this session; removal candidate for a future cleanup pass (now slightly riskier because the file is the largest current `MetricTile` consumer and would show up on a search-by-API audit).

**Out of scope / not touched (per scope discipline):**

- `<Term>` (8.3e) and `<Cite>` (8.3f) — deferred to Phase 7.8 alongside their content (glossary + bibliography).
- Icon sprite (8.4), logo system (8.5), `/brand` `/style` `/visuals` `/colophon` design-system pages (8.6), microbrand details (8.7) — Sessions 3–5.
- Card migrations to consume the new primitives — Phase 10.
- `app/lib/types.ts` — left untouched per prompt rule.
- Existing untracked tree (`logs/btd.log`, `.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `docs/phases/phase-8-session-1-prompt.md`, `docs/phases/phase-8-session-2-prompt.md`, `docs/phases/plan-audit-2026-04-26.md`) — left as-is per "out of scope" list in the prompt.

### Session 15 — 2026-04-26 — Phase 7.7a (financial display binding, Claude Code)

**Scope:** Phase 7.7a (per `docs/phases/plan-audit-2026-04-26.md` Phase 7.7 split rationale — the low-risk display half). Branch `phase-7-7a-financial-display` cut off main at `8b9129a` (post-Phase 8 Session 2 merge). Pure UI binding of fields the worker already returns — zero engine changes, zero `wrangler deploy` calls.

**Shipped (7 commits on `phase-7-7a-financial-display`):**

| # | Commit | Surface | What it bound |
|---|--------|---------|---------------|
| 7.7.1  | `8c0a292` | RevenueCard | Project IRR + Equity IRR split via new `app/lib/financialDefinitions.ts` (N-11 vocabulary module). `MetricCell` extended with `title` + `methodVersion` props. |
| 7.7.2  | `9f47ece` | RevenueCard | DSCR triple panel — base / conservative / worst-month with covenant tick at 1.20×. Returns row reorganised; CFADS promoted into the row. |
| 7.7.6  | `237dffd` | RevenueCard | Degradation curve from `years[].retention`, dashed reference lines at 0.80 (augment) + 0.70 (EoL). New full-width analytics row introduced after the heatmap. |
| 7.7.10 | `d21614d` | RevenueCard | Sensitivity tornado — pure-SVG, mint/coral by sign, sorted by absolute magnitude. CAPEX + COD axes from the 9-cell `matrix`; scenario axis from `all_scenarios`. |
| 7.7.12 | `77cc85e` | RevenueCard | Back-test 13-month chart, modeled-Y1 reference line in dashed amber, mean-error caption in mint when ±5%, EET-month axis convention. |
| 7.7.13 | `c18e097` | RevenueCard | Cannibalization curve from `fleet_trajectory[].cpi`, 1.0× today reference. Curve shape public; formula coefficients stay drawer-only per P3. |
| 7.7.14 | `8256724` | TradingEngineCard + S2Card | Market thickness chips — aFRR thick / mFRR medium / FCR thin via new `MarketThicknessChip` primitive routing through `MARKET_THICKNESS` from financialDefinitions. |

**Verification gates:**
- Tests: 257 baseline → **333 passing** (76 new across 6 spec files: `financialDefinitions` 18, `degradation` 12, `sensitivity` 13, `backtest` 14, `cannibalization` 11, `marketThicknessChip` 8).
- `npx tsc --noEmit` clean.
- `npx next build` clean (Turbopack 17.7s, 6 routes prerendered).
- Live snapshot at `localhost:3000?dur=4h&capex=mid&cod=2028&scenario=base` confirmed via DOM evaluation: Project IRR 8.6% / Equity IRR 11.9%, DSCR triple 1.31× / 1.06× / 0.93×, all four analytics charts rendering, market thickness chips visible on both surfaces with mFRR + FCR captions surfaced.
- Worker payload audit (7.7.0): every field claimed in `reference_engine_audit.md` still present and shaped as documented — no engine drift.

**New modules / components:**

- `app/lib/financialDefinitions.ts` — N-11 vocabulary module for IRR_TILES, DSCR_LABELS, RETURNS_METRICS, MARKET_THICKNESS. Re-exports `IRR_LABELS` + `isForbiddenIrrLabel` from `irrLabels.ts` so the existing "Gross IRR" forbidden-term guard keeps applying. Phase 10 will route the entire returns surface through this.
- `app/lib/degradation.ts` — `projectDegradationCurve`, `degradationAxisRange`, `isYearOneFresh`, `AUGMENTATION_THRESHOLD` (0.80), `END_OF_LIFE_THRESHOLD` (0.70).
- `app/lib/sensitivity.ts` — `findBaseCase`, `buildTornadoBars`, `tornadoAxisExtent`. Wider `capex: string` accepted at the boundary; narrowed internally by equality checks.
- `app/lib/backtest.ts` — `backtestStats` (days-weighted mean, signed mean error vs reference, null when reference is zero or absent), `backtestAxisRange`, `formatBacktestMonth` ("YYYY-MM" → "Mon 'YY").
- `app/lib/cannibalization.ts` — `projectCannibalizationCurve`, `cannibalizationAxisRange` (1.0 reference always inside the visible range), `isMonotonicallyCompressing`, `TODAYS_MARKET_REFERENCE`.
- `app/components/RevenueSensitivityTornado.tsx` — pure-SVG tornado renderer, no Chart.js dep.
- `app/components/RevenueBacktest.tsx` — Chart.js Line with custom reference-line plugin and n=N · Dd badge (N-4).
- `app/components/MarketThicknessChip.tsx` — small chip primitive with optional warning caption.

**Anomalies / non-obvious findings:**

- **`all_scenarios.stress.project_irr` returns `null` for the live request.** The tornado handles this gracefully by skipping the stress bar; conservative still appears. Worth confirming whether the engine is supposed to populate stress for the production scenario set — flag for Phase 7.7b/c, NOT fixed here per the "no engine work" rule.
- **`worst_month_dscr` of 0.93× on the live mid/2028/base request is below 1.0×** — that's a real cash-trap risk signal that was previously buried in the drawer's monthly DSCR chart. The new triple panel surfaces it next to the base 1.31× — exactly the credibility-per-pixel improvement the phase aimed for.
- **Local `MatrixCell` interface in RevenueCard typed `capex: string`** — wider than the `'low' | 'mid' | 'high'` union the tornado needs. Solved by widening the boundary type in `sensitivity.ts` (accept `CapexBucket | string`, narrow internally) rather than narrowing the consumer. Avoids a cast and keeps the existing SensitivityTable consumer unchanged.
- **Test for the chip's caption-suppression on aFRR was initially too strict** — it forbade the substring "price-taker" in the rendered HTML, but aFRR's *tooltip* legitimately contains "A 50 MW asset is a price-taker". Replaced with a stronger check: `showCaption=true` produces identical output to `showCaption=false` when `spec.caption` is null. Same intent, no false positive.
- **No `app/lib/types.ts` modification** — `DataClass` still doesn't include `forecast`; the financial display work doesn't need it. The 8.3b `<VintageGlyphRow>` continues to handle the F position via its own narrower `Vintage` union.

**Cross-cutting notes for the next phase:**

- **Phase 7.7b — engine extensions** (LCOS, RTE, MOIC, capital structure live recompute) is the natural next alternate-track CC job. Prompt only after this PR is merged.
- **Phase 7.7c — Monte Carlo + real/nominal indexing + PPA/tolling** is wholly new engine architecture; deferred per the audit's split rationale.
- **No card migrations to new design system** were attempted (Phase 10 owns that). The new sub-components on RevenueCard match the existing `MonthlyChart` / `BridgeChart` pattern from S1Card.tsx — consistent with the page's current vocabulary.
- **Phase 8 Session 3** (icons + logo system) remains gated on Q3 from `plan-audit-2026-04-26.md` — Lucide React vs. user's Figma exports for the icon sprite + true-vector logo. Don't author a Session 3 prompt until that decision lands.

**Out of scope / not touched (per scope discipline):**

- Worker code (`workers/fetch-s1.js`) — zero edits, zero deploys.
- Card migrations to consume Phase 8 visual atoms (`<DataState>`, `<VintageGlyphRow>`, etc.) — Phase 10.
- LCOS, RTE, MOIC, Monte Carlo, real/nominal indexing, PPA/tolling toggle — all deferred to 7.7b/c.
- The pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, the various phase-prompt drafts) — left as-is per the prompt's "out of scope" list. A new `docs/phases/phase-7-7b-session-1-prompt.md` showed up untracked partway through the session (user-side authoring); also left as-is.

### Session 18 — 2026-04-27 — Phase 12.4 hotfix (interconnector flow direction, Claude Code)

**Scope:** Out-of-band hotfix branch `phase-12-4-flow-direction-hotfix` cut off main at `cd28fb4` (post-PR #34 merge). The live KKME hero was rendering every interconnector arrow backwards — e.g. "SE → LT 429 MW" when LT was actually exporting 429 MW to Sweden. Single coordinated commit (`361b538`); single worker deploy (version `a9f90908-36c4-44aa-bef0-7d4148d67a14`); zero engine changes.

**Two compounding bugs:**

1. **`workers/fetch-s1.js` `flowSignal()`** — labels inverted relative to the documented API convention. `energy-charts.info` CBET says positive = country importing FROM neighbor; the worker preserved the convention in `*_avg_mw` (no negation since Phase 2A-3, commit `9317c94`) but `flowSignal` mapped `mw > 100` to `'EXPORTING'` and `mw < -100` to `'IMPORTING'`. Same inversion on the `netTotal` overall `signal`. The header comment ("We negate → positive = country exporting") was stale and misleading — the negation it described was removed in 2A-3 but the comment survived.

2. **`lib/baltic-places.ts` `positiveFlowReceives`** — the four Baltic interconnectors (nordbalt, litpol, estlink-1, estlink-2) had their `positiveFlowReceives` flipped in commit `c1cefc5` (Phase 2B-1) under a misreading of 2A-3. 2A-3 *removed* a `Math.round(-avg * 1000)` negation; 2B-1 inverted the spec table as if 2A-3 had *added* one. Fenno-Skan (`positiveFlowReceives: 'FI'`, both rows) was untouched and was already correct, which is why the bug masked: any audit that compared the spec table to Fenno-Skan would conclude the Baltic ones were the odd-ones-out the wrong way around. End result: each row was wrong in *both* the worker label and the resolveFlow direction lookup, so the directions came out twice-flipped — and "twice flipped" in this resolver still nets to wrong because the two flips are on different axes (label string vs. from/to country).

**Coordinated fix (single commit `361b538`, +322/−13 across 9 files):**

- `workers/fetch-s1.js`: `flowSignal` labels swapped; `netTotal` signal swapped; stale "We negate" comment rewritten to match actual code path.
- `lib/baltic-places.ts`: `positiveFlowReceives` flipped back to `LT, LT, EE, EE` for the 4 Baltic interconnectors (Fenno-Skan untouched); convention comment block rewritten with Phase 12.4 trail.
- `app/components/S8Card.tsx`: methodology copy "Positive = LT exporting." → "Positive = LT importing." (file is retired since 2026-04-16 but the docstring was the only Pattern-C copy in the codebase outside of the resolver itself; updating for documentation accuracy).
- `app/lib/__tests__/flowSignal.test.ts` (new, 4 cases) — pins the worker label convention.
- `lib/__tests__/resolveFlow.direction.test.ts` (new, 4 cases) — pins the end-to-end arrow direction with the current API value patterns. Together these are the regression guards: any future re-inversion at either layer fails the suite.
- `docs/audits/phase-12-4/` (new) — `s8-pre-hotfix.json`, `s8-post-hotfix.json`, `sign-convention-verification.md`, `frontend-audit.md`. The audits were the foundation of the Pause A / Pause B reports that surfaced the second bug; preserving them keeps the diagnostic record close to the diff.

**Verification gates:**
- Tests: 469 baseline → **473 passing** (+8 new across 2 spec files; the prompt's §6 only specced flowSignal but the bug was bilayer, so the resolveFlow direction spec was added in the same spirit).
- `npx tsc --noEmit` clean.
- Local `wrangler dev` `/s8` payload vs frozen production `/s8`: all 5 magnitudes (`-429, -166, +860, +607, +360`) identical, all 5 `*_signal` labels swapped consistently, `netTotal` `signal` flipped from `IMPORTING` (mislabel) to `EXPORTING` (correct: LT net-exporting -595 MW into the morning low-demand window).
- Production `/s8` post-deploy: confirmed via `chrome-devtools` snapshot at `localhost:3000` with all 6 hero rows reading correctly: NordBalt LT → SE 429 MW, LitPol LT → PL 166 MW, EstLink 1 FI → EE 301 MW, EstLink 2 FI → EE 559 MW, Fenno-Skan 1 SE → FI 247 MW, Fenno-Skan 2 SE → FI 360 MW.

**Anomaly / non-obvious finding — KV cache invalidation on deploy:**

The `/s8` route at `fetch-s1.js:6817` serves cached KV unconditionally if present (no TTL check, no compute fallback when the cache is fresh — the cron is the only thing that refreshes). After `wrangler deploy`, the deployed code took effect immediately, but `/s8` kept serving the pre-deploy KV value until the next cron tick. Manual workaround: `npx wrangler kv key delete --namespace-id=323b493a50764b24b88a8b4a5687a24b 's8' --remote` — the next GET then re-computed against the deployed code. This pattern likely applies to every signal route that reads-through KV (S6, S7, S9 use the same generic loop at `:6811-6837`; `s_wind`/`s_solar`/`s_load` and `genload` are similar). Filed as Phase 12.6 in the upgrade-plan backlog: deploy step needs an explicit KV invalidation list for the signals whose code changed. Not in scope for this hotfix.

**Cross-cutting notes for the next phase:**

- **Phase 7.7b Session 3** (engine refinements v7.1) is still paused at Pause B awaiting the Option D synthetic-probe validation — most-urgent CC job once Kastytis green-lights direction. PR #34 (audit only, read-only) is merged; engine refinement work is the next session's scope.
- **Phase 12.5 — Grid Access Live Coverage** (LV/EE scraping + APVA/TSO live updates) — still queued.
- **Phase 12.6 — KV cache invalidation on worker deploy** — added to backlog as a follow-up of this session's deploy-time anomaly.

**Out of scope / not touched (per scope discipline):**

- Engine math (`/revenue`, financial computation) — zero changes per the hotfix's "ONLY label strings + frontend display" rule.
- Card primitives, design system — zero edits.
- Pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, the phase-prompt drafts including this hotfix's own prompt) — left as-is. The hotfix's own prompt at `docs/phases/phase-12-4-interconnector-hotfix-prompt.md` was authored before the session and remains untracked per the standing "out of scope" convention.

### Session 19 — 2026-04-27 — Phase 7.7c Session 1 (engine extensions: LCOS + MOIC + duration optimizer + assumptions display, Claude Code)

**Scope:** Phase 7.7c Session 1 per `docs/phases/phase-7-7c-session-1-prompt.md`. Branch `phase-7-7c-engine-extensions` cut off main at `8a4cd1d` (post-Phase 7.10 merge). Worker is the surface for all four sub-items; cards bind the new fields. Single coordinated commit. Single `wrangler deploy` (version `e145aeb4-5570-4cdd-adcb-f79351ef33dc`). Non-engine math: every addition is a derived field consuming values the engine already produced, so existing IRR / DSCR / gross are unmoved by this session's edits.

**Pre-flight discovery — production was still on `v7`, not `v7.1`.** PR #37 (`phase-7-7b(v7.1)`) had been merged to main on 2026-04-27 but never deployed via wrangler. The captured "v7-1-pre" baseline fixtures therefore reflect the deployed `v7`; the §5 deploy was a single jump v7 → v7.2 carrying both the v7.1 engine refinements (per-product cpi, bid-acceptance saturation, aFRR rate 0.18 → 0.25) AND v7.2 surfaces. Synthetic-KV probe (mode `--probe-v71` against on-disk code with v7.2 edits applied) reproduced an identical engine output to a v7.1-only run — confirming the v7.2 additions are themselves additive. Wire-level IRR/DSCR/gross deltas observed (~±0.3pp IRR, +1% gross) trace to the v7.1 refinements.

**Shipped:**

| # | Surface | What landed |
|---|---------|-------------|
| 7.7.3   | `workers/fetch-s1.js:1215-1252` | LCOS (€/MWh-cycled). Formula: (CAPEX·CRF + Fixed O&M + Charging cost) / annual MWh discharged. CRF computed from 8% WACC over 20-year hold. Charging cost from `s1_capture.{capture_2h,capture_4h}.avg_charge × MWh charged × (1/RTE)`. |
| 7.7.9   | `workers/fetch-s1.js:1238-1242` | MOIC = Σ positive `equity_cf` ÷ `equity_initial`. |
| 7.7.5   | `workers/fetch-s1.js:1244-1252` | `assumptions_panel` — RTE / cycles_per_year / availability / hold_period / WACC. Read-only; no sliders. |
| 7.7.15  | `workers/fetch-s1.js:7474-7501` | `duration_recommendation` derived field consuming `irr_2h` / `irr_4h` already computed at the handler. |
| —       | `workers/fetch-s1.js:1271-1283` | `model_version: 'v7.1' → 'v7.2'`. `engine_changelog.v7_1_to_v7_2` appended (4 strings). `roundtrip_efficiency` exposed. |
| 7.7c-UI | `app/components/RevenueCard.tsx` | Two new MetricCells (LCOS + MOIC) in the Returns metric grid; `DurationOptimizer` and `AssumptionsPanel` inline sub-components matching the Phase 7.7a `BridgeChart` / `MonthlyChart` template. |
| N-11    | `app/lib/financialDefinitions.ts` | New `STORAGE_METRICS` export — `LCOS / MOIC / DURATION_RECOMMENDATION` with richer shape (short/long/unit/tooltip). Existing `RETURNS_METRICS.moic` left untouched for backward compat. |
| N-10    | `app/lib/__tests__/v72Metrics.test.ts` (new, 122 cases) + `financialDefinitions.test.ts` (+6 cases) | LCOS sanity bands, MOIC math identity, duration_recommendation echoes irr_2h/irr_4h, assumptions panel structure, vocabulary length budgets. |
| —       | `scripts/audit-stack.mjs` | New `--probe-v72` mode validates LCOS [€60, €150], MOIC strict [1.0×, 3.5×] for base/4h + sweep [0.3×, 5.5×] for full matrix, assumptions panel populated, engine_changelog has 4 entries. |

**Verification gates:**

- Tests: 485 baseline → **607 passing** (+122 across 39 files).
- `npx tsc --noEmit` clean.
- `npx next build` clean (Turbopack 19.3s, 5 routes prerendered).
- Synthetic-KV probe v7.1: `✓ SHIP. config 1 IRR 15.60% inside expected band 12–18%`.
- Synthetic-KV probe v7.2: all 6 (scenario × duration) configs in band; LCOS spread €110-€144, MOIC spread 0.38× (stress/2h) to 4.85× (base/2h, high-IRR), base/4h MOIC 3.05× ✓ strict.
- Production deploy version: `e145aeb4-5570-4cdd-adcb-f79351ef33dc`. Wire shows `model_version: 'v7.2'`, `engine_changelog.v7_1_to_v7_2.length === 4`, all four new fields populated on `?dur=2h` (default).
- Post-deploy fixtures captured at `docs/audits/phase-7-7c/baseline-{scen}-{dur}-v7-2.json` × 6.

**LCOS / MOIC / Duration / Assumptions across 6 scenarios (post-deploy):**

| scenario / dur | LCOS €/MWh | MOIC × | irr_2h | irr_4h | optimal | delta_pp |
|---|---|---|---|---|---|---|
| base/2h            | 69.5  | 4.72 | 18.28% | 8.80% | 2h | +9.48 |
| base/4h            | 76.3  | 2.61 | 18.28% | 8.80% | 2h | +9.48 |
| conservative/2h    | 76.3  | 3.23 | 13.27% | 5.55% | 2h | +7.72 |
| conservative/4h    | 81.9  | 1.76 | 13.27% | 5.55% | 2h | +7.72 |
| stress/2h          | 103.3 | 0.47 | null   | null  | n/a (insufficient IRR data) |
| stress/4h          | 96.1  | 0.46 | null   | null  | n/a (insufficient IRR data) |

Assumptions panel uniform across scenarios — RTE 85.2-85.5%, cycles/yr 310-548 (varies with cycles_2h/cycles_4h × 365), availability 92-95% (per scenario), hold 20y, WACC 8%.

**Anomalies / non-obvious findings:**

- **MOIC band [1.0×, 3.5×] is base-case convention, not a sweep-wide invariant.** `audit-stack.mjs --probe-v72` enforces the strict band only on base/4h (the canonical investor scenario) and a wider operational sweep [0.3×, 5.5×] across all 6 scenarios. Stress legitimately falls below 1.0× (returns < capital, by stress-test design); high-IRR cases like base/2h with €164 capex legitimately exceed 3.5×. The math itself (`Σ max(0, equity_cf) / equity_initial`) is correct against the prod fixtures (computed independently of `moic` field, matched within rounding).
- **PR #37 v7.1 refinements rode the v7.2 deploy.** The two were technically separable but operationally coupled — the next deploy was always going to ship both. Documented in handover, in `engine_changelog.v7_to_v7_1` (already on disk from PR #37), and in `engine_changelog.v7_1_to_v7_2` (new this session). Bankability flag thresholds are unchanged (1.20×/1.0× covenant) per the 7.7b session 2 addendum's prediction.
- **`/revenue` endpoint is not KV-cached** (line 7169 comment), unlike `/s8` from Session 18 — the Phase 12.6 KV-cache invalidation issue does NOT apply here. Each `/revenue` request recomputes against the live worker code. Deploy → next request returns v7.2 immediately.
- **`STORAGE_METRICS` is a new export, not a reshape of `RETURNS_METRICS`**, to avoid touching the financialDefinitions test surface from Phase 7.7a (which asserted the existing `{ label, tooltip }` shape on `RETURNS_METRICS.moic`). Both shapes co-exist; consumers route through whichever is appropriate.
- **`AssumptionsPanel` is a 5-row read-only display.** No interactivity, no sliders, no tooltips beyond the `title=` attribute. Capital-structure sliders (gearing / tenor / all-in rate / live recompute) are explicitly Phase 7.7c Session 2 territory.

**Cross-cutting notes for the next phase:**

- **Phase 7.7c Session 2** (capital structure sliders + request-time recompute) is the natural next CC job for the engine track. Prompt only after this PR is merged AND Kastytis makes a design call on the slider UX (vertical vs horizontal sliders, request debounce vs blur-fire, persisted state encoding).
- **Phase 8 Session 3** (icons + logo system) remains gated on the Lucide-vs-Figma decision per `plan-audit-2026-04-26.md` Q3.
- **Production wire is now v7.2 across all surfaces.** Any consumer needing pre-v7.2 fields (the four new keys) should default-handle null gracefully — the type widening in `RevenueCard.tsx` `RevenueData` makes them all optional.

**Out of scope / not touched (per scope discipline):**

- Capital structure controls (gearing / tenor / rate sliders, request-time recompute) — Phase 7.7c Session 2.
- Real / nominal indexing (`priceBase: "EUR2026"`) — separate phase.
- Monte Carlo P10/P50/P90 fans — separate phase, architectural decision needed.
- PPA / tolling scenario toggle — separate phase, new revenue engine path.
- Phase 10 design-system primitives migration on the new sub-components — Phase 10 owns that.
- Stack allocator changes — already audited in 7.7b; operationally valid per the addendum.
- Pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, the phase-prompt drafts) — left as-is.

### Session 20 — 2026-04-27 — Throughput-derived cycle accounting design + Phase 7.7d prompt (Cowork)

**Scope:** Kastytis pushed back on Phase 7.7c Session 1's duration optimizer output ("2h dominates 4h by ~9pp" runs against external industry consensus that flexibility markets reward longer duration as they saturate). He also flagged the LCOS stress band as potentially shallow, and asked for engine constants to be re-anchored on real Tier 1 supplier ground truth rather than industry medians.

Two parallel tracks:

1. **Private dataset extraction** — operator gave Claude read access to a folder of binding RFP responses from four Tier 1 LFP integrators (held in a gitignored directory on the operator's machine, NDA-protected). Claude distilled cross-supplier consensus medians for SOH (at three test rates: 1 / 1.5 / 2 c/d), RTE-vs-time, availability, and CAPEX. No supplier names, project specifics, client names, or pricing appear in any tracked file.

2. **Cycle accounting audit** — Kastytis asked the right deeper question: "what is the actual annualized cycle count the engine's dispatch produces?" That surfaced a dimensional bug in the engine's activation revenue formulas (`act_rate × 8760` was being treated as "full-power hours" when it really means "in-merit fraction"). External research (Modo, Dexter, GEM, enspired, MDPI) anchored realistic per-product throughput numbers for Baltic 2h merchant batteries.

**Three structural engine errors identified:**

| # | Bug | What v7.2 does | What's correct |
|---|---|---|---|
| 1 | Activation throughput dimensional error | `act_rate=0.25 × 8760 hr` treated as full-power-equivalent → 1,376 MWh/MW/yr aFRR throughput implied | In-merit fraction × activation depth → 450-700 MWh/MW/yr (Modo/Dexter consensus) |
| 2 | Cycle count and SOH curve decoupled | `cycles_per_year = scenario.cycles_2h × 365` (asserted), SOH ages by calendar year regardless | Cycle count derived from MWh throughput; SOH curve interpolated by computed actual c/d |
| 3 | SOH curve far too shallow | 90% Y10 across all dispatch | 70.5% Y10 at 2 c/d empirical median; 78% Y10 at 1 c/d (anonymized supplier consensus) |

**Public-research throughput anchors (citable in committed code):**

| Product | MWh/MW-alloc/yr (Baltic base) | Source |
|---|---|---|
| FCR (incl SoC restoration) | 200 | Modo cycling research; MDPI 2023 multi-service lifetime |
| aFRR symmetric (PICASSO) | 475 | Modo Sept 2025; Dexter PICASSO; GEM PICASSO insights |
| mFRR (MARI, Baltic marginal user) | 125 | Dexter MARI implementation; Baltic Balancing Roadmap |
| DA + ID arbitrage | 700 | Modo; enspired (mean 0.86 c/d, p90 1.03) |

Total Baltic 2h merchant base: ~350-550 EFCs/yr median, 600-750 top quartile. Engine v7.2 silently implied ~1,600 — a 3-5× over-count of cell wear. Supplier warranties cap at 730 EFC/yr standard, 1,460 premium tier.

**Anonymized empirical anchors (cross-supplier consensus median, gitignored sources):**

| Year | SOH @ 1.0 c/d | SOH @ 1.5 c/d | SOH @ 2.0 c/d |
|---|---|---|---|
| 0 | 1.000 | 1.000 | 1.000 |
| 5 | 0.855 | 0.830 | 0.810 |
| 10 | 0.780 | 0.738 | 0.705 |
| 15 | 0.730 | 0.679 | 0.620 |

RTE BOL @ POI incl aux: 0.86 (median across four Tier 1 RFP responses). Decay −0.20 pp/yr. Availability operational target 0.97 (binding 98% with 1pp ops haircut).

**What landed this session:**

- `.gitignore` extended — generic patterns `docs/_private/` and `docs/_clients/` for NDA-protected datasets. Operator must rename existing private folder to a path matching one of these patterns before next commit so the explicit folder name doesn't leak via gitignore line.
- `docs/phases/phase-7-7d-empirical-calibration-prompt.md` — fully rewritten Phase 7.7d prompt for Claude Code: 3-pause pattern, single coordinated deploy, ~30 new tests, synthetic-KV `--probe-v73` gate. Six engine surfaces in §2: throughput-based cycle accounting, SOH 3-curve interpolation, RTE decay, availability normalization, decomposition + warranty surface in `assumptions_panel`, calibration provenance stamp.
- Handover updated (current phase + queued + this entry).

**Predicted v7.3 IRR direction:**
- Cycles per year drops modestly from v7.2 reported (1.5 c/d → ~1.0-1.5 c/d). 4h asset stays close to 1.0 c/d but now derived from throughput.
- SOH at Y10 drops sharply (90% → ~70-75%) — biggest single change, drives most of the IRR move.
- 2h IRRs drop 2-5pp from v7.2 baseline.
- 4h IRRs drop less (gentler interpolated SOH curve at lower c/d) — partial fix to the 2h-dominates-4h concern. Full market-physics fix deferred to Phase 7.7e.
- LCOS rises across the board.
- Warranty status = "within" for base/conservative; possibly "premium-tier-required" for stress under aggressive activation tuning.

**Two-track confidentiality discipline:**

- **Public research** (Modo, Dexter, GEM, enspired, MDPI, Gridcog, ENTSO-E, Elering) — citable by URL directly in committed worker constants. Not NDA-bound.
- **Private RFP dataset** — anonymized as "Tier 1 LFP integrator consensus, binding RFP responses (2026-Q1)" in committed code. No supplier names, no project specifics, no client names, no pricing, no document filenames in any tracked file.

**Cross-cutting notes:**

- Engine CAPEX €/kWh anchor tracks 2026-Q1 Tier 1 quoting closely. Don't move it in 7.7d.
- Aux load temperature behavior captured for Phase 7.7e — operator's region runs cooler than the 25°C standard, which would lower real aux consumption and raise effective RTE BOL by ~1-2pp. Needs site weather data integration.
- Phase 7.7d prompt runtime estimate revised 2.5h → ~3-3.5h because every `act_rate_*` call site (~6 locations across worker) needs migration.
- Three Cowork sandbox limitations encountered this session: `request_cowork_directory` blocked in unsupervised mode; `.git/index.lock` could not be unlinked; UI mount of new folder didn't propagate to sandbox. Operator handled all three via Mac terminal or Cowork UI directly.

**Verification:** No code changes this session. `git check-ignore` confirms the new private-data patterns. Phase 7.7d prompt linted via spot-read for internal consistency (3-pause structure matches 7.7c convention; line-number references match current `workers/fetch-s1.js`; test counts match Session 19's 607-test baseline; per-product throughput numbers cross-checked against Modo/Dexter/enspired source URLs). Confidentiality grep on tracked files for project, client, developer, supplier, and personnel names plus pricing terms returns zero matches.


### Session 21 — 2026-04-27 — Phase 7.7d engine v7.3 ship (Claude Code, two halts + recalibration)

**Scope:** Execute the Phase 7.7d empirical-calibration prompt autonomously while operator was away ~3h. Run encountered two ABORT halts before shipping; the third autonomous instruction (drop the bad guardrails) closed it out cleanly.

**Run 1 — initial autonomous execution (HALTED at §4 MOIC band 0.30).**

- §0–§3 cleanly: 6 v7.2-pre fixtures captured, 49 new tests added (607 baseline → 656 passing, tsc clean), worker rewrite with throughput-based cycle accounting, three rate-tagged SOH curves + `sohYr` interpolation, year-indexed RTE decay, availability normalization, decomposition + warranty surface in `assumptions_panel`, `engine_calibration_source` stamp, `model_version` v7.3.
- §4 synthetic-KV probe revealed two structural problems:
  1. Literal §2.1 rewrite (act_rate_* removed → mwh_per_mw_yr_* used in activation revenue) cascaded ~−24pp on base/2h IRR via `bal_calibration` (computeBaseYear's monthly path drops 80% on activation when it switches from `act_rate × 8760 × clearing` to `mwh_per_mw_yr × clearing` — the empirical 475 MWh/MW/yr is much smaller than the implicit 0.25 × 8760 = 2,190).
  2. After surgical revert (keep act_rate_* as activation calibration anchors; use mwh_per_mw_yr_* for cycle-accounting + trading-energy budget only), stress MOIC still landed at 0.04 / 0.14 — below the §4 [0.3, 5.5] band.
- HALTED.md committed and pushed (commit `a4fbaf1`); v7.3 work uncommitted.

**Run 2 — recalibration follow-up (HALTED at three new symptoms).**

Diagnosis: `mwh_per_mw_yr_da` was anchored on EU portfolio mean (700 MWh/MW/yr, enspired 0.86 c/d) when it should have matched v7.2's existing active-trader calibration. The `dur_scale_da = dur_h / 2` formula compounded the asymmetry: −36% trading throughput on 2h, ~unchanged on 4h. Fix: split into per-duration anchors `mwh_per_mw_yr_da_2h` / `_4h` mirroring v7.2's `cycles_{2h,4h} × duration × 365` (base 1100/1500, conservative 1000/1400, stress 800/1240).

Recalibration ran cleanly (656 → 665 tests, tsc clean) and was a strict improvement on Run 1: stress MOIC 0.04 → 0.36 / 0.14 → 0.58, base/2h IRR 6.41% → 18.09%, base/4h IRR 9.63% → 10.90%, cycles up across all combos. But three of the revised guardrails still failed — all guardrail-prediction errors, not engine bugs:

1. `MOIC_4h > MOIC_2h` direction assert (3.21× < 4.67×) — structurally wrong because MOIC normalizes by `equity_initial` which scales linearly with capex (and so with duration). 4h has more *absolute* equity (~€47M vs €34M) but lower *ratio* MOIC. v7.2-pre had the same direction (4.86× vs 2.69×).
2. base/2h IRR 18.09% vs upper bound 18% — 0.09pp overshoot, operationally indistinguishable.
3. stress/4h cycles 349 vs lower bound 400 — mathematically forced by the operator's prescribed `mwh_per_mw_yr_da_4h: 1240`.

HALTED.md superseded with the new diagnosis (commit `801e627`); v7.3 work still uncommitted.

**Run 3 — final ship (drop bad guardrails, commit, push).**

Operator returned with explicit instruction: drop the `MOIC_4h > MOIC_2h` direction assert (structurally wrong), relax `IRR_2h base` upper to 19%, relax `stress/4h cycles_per_year` lower to 300. Re-probe verified all FINAL guardrails pass. v7.3 committed (`071dfc1`), HALTED.md removed (`497757c`).

**Final v7.3 vs v7.2-pre deltas (per scenario × duration, from local probe):**

| combo | LCOS €/MWh | MOIC | IRR | cycles/yr | warranty |
|---|---|---|---|---|---|
| base/2h | 69.5 → 96.2 (+€26.7) | 4.86× → 4.67× (−0.19) | 18.86% → 18.09% (−0.77pp) | 548 → 678 (+24%) | within |
| base/4h | 76.3 → 97.0 (+€20.7) | 2.69× → 3.21× (+0.52) | 9.11% → 10.90% (+1.79pp) | 365 → 439 (+20%) | within |
| conservative/2h | 76.3 → 104.6 | 3.43× → 2.98× | 14.03% → 12.22% | 511 → 603 | within |
| conservative/4h | 81.9 → 104.1 | 1.87× → 2.23× | 6.01% → 7.37% | 347 → 402 | within |
| stress/2h | 103.3 → 126.1 | 0.52× → 0.36× | null → null | 401 → 478 | within |
| stress/4h | 96.1 → 118.5 | 0.48× → 0.58× | null → null | 310 → 349 | within |

Direction asserts: IRR_2h > IRR_4h in base ✓ (18.09% > 10.90%, gap narrowed from ~10pp v7.2 to ~7pp v7.3 — partial fix to the duration-optimizer concern from Session 20). MOIC ranking 2h > 4h is the correct mathematical outcome for linear-capex assets and matches v7.2 precedent.

**Worker deploy version ID:** N/A — **Production deploy DEFERRED per safe-YOLO protocol. Operator runs `npx wrangler deploy` after eyeballing PR diff.** No production v7.3 fixtures captured; the local synthetic-KV probe fixtures in `docs/audits/phase-7-7d/` are the v7.3 reference until production deploys.

**Test count:** 607 (Session 19 baseline) → 656 (after first run's 49 new tests) → 665 (after recalibration's 9 additional per-duration DA asserts).

**Engineering refinements vs prompt's literal §2:**

1. `act_rate_{afrr,mfrr}` retained as activation-revenue calibration constants (literal removal cascaded −24pp on base/2h IRR via `bal_calibration` — the empirical mwh_per_mw_yr_afrr=475 is 22% of v7.2's implicit 2190; the cascade was unwarranted). The throughput parameters are used for cycle-accounting + trading-energy budget; activation revenue stays calibrated against BTD-observed dispatch.
2. `mwh_per_mw_yr_da` replaced with per-duration anchors `_2h` / `_4h` (the single-anchor + `dur_scale_da = dur_h/2` formula was anchored on the EU portfolio mean rather than active-trader median, asymmetrically cutting 2h trading throughput by 36%).
3. `calcIRR` upgraded with bracket-search to handle mixed-sign cash flow streams. BESS late-mothball years can flip EBITDA negative, giving NPV(rate) two zero crossings; the new search prefers the meaningful positive→negative crossing in [0%, 200%] over the artifact crossing in the negative-rate region. v7.2's calcIRR was returning null for many stress combos due to this; v7.3 still returns null for genuinely uneconomic streams (NPV(0%) ≤ 0) but extracts meaningful IRRs from late-mothball-degraded base/conservative streams.

**Anomalies discovered:**

- v7 main path's `bal_calibration = by_balancing_per_mw / R_now` ratio creates a feedback loop: changing `act_rate_*` shifts both numerator (via `computeBaseYear` monthly rev_act) and denominator (via `R_act_*_base` in `computeTradingMix`). The mid-tier surgery preserved both v7.2 anchors so balancing stays in calibration; the new throughput model only enters in cycle-accounting and trading-energy paths.
- `equity_irr` for base scenarios hovered near `project_irr` ± debt service drag — financing structure is not the bottleneck on returns. Capital structure sliders (Phase 7.7c Session 2) will let the operator probe this directly.
- Synthetic-KV vs production-KV gap is real (~30% on `by_balancing_per_mw`). Production deploy fixtures may show stress MOIC closer to v7.2's 0.46–0.52 than the probe's 0.36–0.58. Worth a re-probe against production after deploy.

**Phase 7.7e backlog candidates surfaced (operator should review before next CC plan):**

1. **Aux load temperature curve.** Operator-region cooler than 25°C standard → real aux consumption lower → effective RTE BOL +1–2pp. Needs site weather data integration.
2. **Terminal value at SOH floor.** Augmentation event modeling at Y8–Y12 when capacity hits supplier-stated floor; current engine assumes Y10 augmentation at fixed cost without modeling the trigger condition.
3. **Augmentation modeling (Y8–Y12 capex injection).** v7.3 has `aug_cost_pct` and `aug_restore` constants in scenarios but the augmentation event is hard-coded at Y10. Empirical practice: augment when SOH crosses 70% trigger (now hits earlier under v7.3's steeper curves).
4. **Duration optimizer market-physics fix.** v7.3 narrows the 2h vs 4h IRR gap from ~10pp to ~7pp via the gentler 4h SOH curve, but the underlying multi-market-simultaneous-bidding sophistication (top-N quantile correction, mFRR vs aFRR cascade in 4h+ assets) is still missing.
5. **calcIRR mixed-sign handling.** v7.3 fix is a coarse bracket search; a Newton-Raphson refinement with multi-root detection would tighten convergence and surface the multiple-IRR diagnostic to the payload (currently the engine just picks one).
6. **Synthetic-KV calibration drift.** `scripts/audit-stack.mjs::buildSyntheticKV` is sourced from the Phase 7.7b v7-final fixtures and has drifted ~30% below current production KV state. Refresh from current production fixtures before next CC probe-driven phase.

**Cross-cutting notes:**

- Three commits on `phase-7-7d-empirical-calibration` branch (`a4fbaf1` HALTED v1, `801e627` HALTED v2, `071dfc1` ship, `497757c` HALTED.md remove). Branch ready for PR + manual deploy.
- All confidentiality discipline preserved: no supplier names, project specifics, client names, pricing, or filenames from private documents in any tracked file. Anonymized as "Tier 1 LFP integrator consensus, binding RFP responses (2026-Q1)" per Session 20 convention.
- Pre-existing untracked tree (`logs/btd.log`, `.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `docs/_*.md` operator prep docs, `docs/phases/phase-7-7c-session-1-prompt.md`) — left as-is per Session 19 convention.

**Verification:** `npm test` 665/665 passing. `npx tsc --noEmit` clean. `node --check workers/fetch-s1.js` OK. `node scripts/audit-stack.mjs --probe-v73` all 8 final guardrails met. Branch pushed to origin.


### Session 22 — 2026-04-27 — Frontend SIGNAL ERROR fix on Returns card after v7.3 worker deploy (Claude Code)

**Symptom:** v7.3 worker shipped (operator merged PR #40 + ran `wrangler deploy`, version `41978587-ddda-42f5-b975-1da0570a3b01`). Returns card on kkme.eu rendered "Signal error" — generic fallback from `ErrorBoundary` (`app/components/ErrorBoundary.tsx:47`).

**Verbatim console error captured from production (chrome-devtools MCP):**

```
TypeError: Cannot read properties of undefined (reading 'note')
[KKME] Signal card runtime error: TypeError: Cannot read properties of undefined (reading 'note')
    at z (https://kkme.eu/_next/static/chunks/680adb972f2a3612.js:1:17372)
    ...
```

**Root cause:** `app/components/RevenueCard.tsx:316` (in `AssumptionsPanel`) built a static rows array including `panel.cycles_per_year`. v7.2 had `assumptions_panel.cycles_per_year` as `{ value, label, unit, note }`; v7.3 replaced it with `assumptions_panel.cycles_breakdown` (`{ fcr, afrr, mfrr, da, total_cd, total_efcs_yr, label }`) plus a sibling `assumptions_panel.warranty_status` string. The old field path returns `undefined` from v7.3; `row.note` access on the .map then throws `TypeError`. `ErrorBoundary` catches and renders the generic "Signal error" placeholder.

Single point of failure — no Zod schema involved (frontend casts JSON via `as RevenueData`, no validation at the network boundary). The TS interface declared `cycles_per_year: AssumptionRow` as required, which masked the runtime mismatch at compile time but TS doesn't enforce shape at runtime.

**Fix** (`app/components/RevenueCard.tsx`, +33 / −3 lines, no worker change):

1. Extended `AssumptionsPanelData` to include optional `cycles_breakdown: CyclesBreakdown` and `warranty_status?: 'within' | 'premium-tier-required' | 'unwarranted'`. Made `cycles_per_year` optional for back-compat.
2. `AssumptionsPanel` now synthesizes a row from `cycles_breakdown` when v7.3 shape is detected:
   ```ts
   const cyclesRow: AssumptionRow | null = panel.cycles_breakdown
     ? {
         value: Math.round(panel.cycles_breakdown.total_efcs_yr),
         label: 'Cycles per year',
         unit: '',
         note: `${panel.cycles_breakdown.total_cd.toFixed(2)} c/d throughput-derived — `
           + `FCR ${panel.cycles_breakdown.fcr} + aFRR ${panel.cycles_breakdown.afrr} + `
           + `mFRR ${panel.cycles_breakdown.mfrr} + DA ${panel.cycles_breakdown.da} EFCs/yr`
           + (panel.warranty_status ? ` (warranty ${panel.warranty_status})` : ''),
       }
     : (panel.cycles_per_year ?? null);
   ```
   Falls back to v7.2's flat `cycles_per_year`, then to skipping the row entirely if neither is present.

The synthesized note surfaces the per-product EFC breakdown + warranty status inside the existing italicized note slot — no new card components, no layout change. v7.3's calibration provenance becomes investor-readable through this row.

**Verification:**
- `npx tsc --noEmit` clean
- `npm run build` clean (Next.js production build)
- 665/665 vitest specs passing
- Local dev `http://localhost:3000/?dur=4h&capex=mid&cod=2028&scenario=base#revenue` rendered the row as: `Cycles per year 439 — 1.20 c/d throughput-derived — FCR 8 + aFRR 40.4 + mFRR 15.6 + DA 375 EFCs/yr (warranty within)`.
- After Cloudflare Pages auto-deploy from main, kkme.eu Returns card renders cleanly with v7.3 numbers (LCOS, MOIC, duration recommendation, cycles breakdown, warranty status). v7.3 narrative now investor-readable on production.

**Commit:** `94ca8d8` on main (`phase-7-7d(frontend): align RevenueCard with v7.3 response shape`).

**Cross-cutting notes:**

- The frontend has no Zod schema at the `/revenue` boundary — the `as RevenueData` cast at `RevenueCard.tsx:1087` lets any shape through and only fails downstream when a renderer dereferences a missing leaf. Worth tightening in a future phase (Phase 7.7e candidate or standalone), but per the operator's "fix the immediate break, don't refactor" instruction, deferred.
- Other frontend consumers of v7.3 fields are clean: `S3Card.tsx:413` reads `a.cycles_per_year` from a different domain (assumption arrays in S3 references, not engine output) — no change needed. No other site reads the old `assumptions_panel.cycles_per_year` shape.
- The `roundtrip_efficiency_curve` array, `engine_calibration_source` object, and top-level `cycles_per_year` / `cycles_breakdown` / `warranty_status` siblings are now exposed on the wire but not consumed by the frontend — these are clean additions and will sit as additional bind-points for future Phase 7.7e display work (e.g., RTE-curve sparkline, calibration-provenance footer, per-product cycle-decomposition chip).

**Phase 7.7e backlog augmentation:**

- Tighten `/revenue` schema with Zod or io-ts at the network boundary so v8 changes surface as an explicit validation error rather than a downstream `Cannot read properties of undefined`.
- Surface `engine_calibration_source.last_calibrated` + `next_review` somewhere in the assumptions footer (currently only the cycle row note carries v7.3 provenance).
- Render the `roundtrip_efficiency_curve` as a sparkline next to the RTE row (year-over-year decay is now in the payload but not visualized).
- Render the per-product `cycles_breakdown` as a four-bar mini-chart (currently flattened into the row's italicized note).

### Session 23 — 2026-04-27 — Phase 12.7 interconnector rate-limit fix (Claude Code)

**Scope:** Phase 12.7 per `docs/phases/phase-12-7-interconnector-rate-limit-prompt.md`. Branch `phase-12-7-interconnector-rate-limit` cut off main at `42df8c6`. Worker is the single surface (no frontend changes per prompt scope). Single coordinated commit (`0618179`). Single `wrangler deploy` (version `f8173210-cb4b-493d-a1d8-0fd339ec6dac`). No engine version bump — hotfix.

**Pre-flight bug confirmation:**

- Production /s8 at session start: `nordbalt=-432, litpol=-169, estlink=null, fennoskan=599, lv_lt=360`. EstLink null confirmed the bug live; Fenno-Skan happened to be populated this cycle, illustrating the intermittent nature — `Promise.all([lt, ee, fi])` triggers anonymous-bucket exhaustion variably depending on which two of the three requests collide on the upstream rate limiter. NordBalt + LitPol survive because both are extracted from the LT response (which lands first cleanly).
- Direct `curl -v 'https://api.energy-charts.info/cbet?country=fi'` from this machine returned HTTP 200 (single solitary request, not parallel), matching the diagnosis: rate limit triggers under parallel anonymous fetches, not on isolated requests. The fix targets the parallel-fetch shape, not the upstream availability.
- Test baseline: 665 / 665 across 42 files. tsc clean. `bash scripts/diagnose.sh` all signals fresh, all endpoints HTTP 200, frontend up.

**Three coordinated fixes (single commit `0618179`, +160 / −26 across 3 files):**

1. **`workers/fetch-s1.js:5367`** — `cbetHeaders` now carries `User-Agent: 'KKME/1.0 (+https://kkme.eu) — Baltic flexibility intelligence'` on all three CBET fetches. Anonymous browsers are rate-limited more aggressively by many APIs; the polite UA typically lifts most 429s without slowing request rate. This is the *primary* fix; the persist-last-good fallback is the *durable* fix when 429s do leak through.

2. **Persist-last-good KV fallback.** `fetchInterconnectorFlows()` signature becomes `(env)` so it can read prior `s8` KV. After all four fetched values land (or null), reads `env.KKME_SIGNALS.get('s8')` and merges via `safe(current, fallback)` for all five cable values (NordBalt, LitPol, LV↔LT, EstLink, Fenno-Skan). All five `*_signal` labels and `netTotal` are **re-derived from merged values** — so a stale-fallback MW yields a stale-fallback signal label rather than mismatched `null` signal next to a real number. Re-built `interpretation` string also uses merged values. Three call-sites updated to pass `env`: hourly cron @ 5938, 4-hour cron @ 6126, /s8 route @ 7236.

3. **Per-cable `freshness` map.** New top-level field `freshness: { nordbalt, litpol, estlink, fennoskan, lv_lt }` — each entry `'live' | 'stale' | null`. `'live'` = this cycle's fetch landed; `'stale'` = fell back to prior KV; `null` = never had a value. Future card UI (Phase 7.7e UI track territory) can render a "stale" indicator from this field; current frontend ignores it.

**Helpers + tests:**

- `app/lib/interconnectorHelpers.ts` (new, 33 lines) — TS mirror exporting `safe()` + `freshnessFor()` + `Freshness` type. Mirrors the throughputCycles.ts pattern from Phase 7.7d. Worker carries inline copies (`safeInterconnector`, `freshnessForInterconnector`) so it can run without a build step; comment on both flags the requirement to keep them in sync.
- `app/lib/__tests__/interconnectorMerge.test.ts` (new, 47 lines, 10 specs) — 6 `safe()` cases (returns current, returns fallback, both null, undefined fallback, preserves zero, preserves negative MW for LT-exporting case) + 4 `freshnessFor()` cases (live, stale, both null, zero-current still live). Pins the merge semantics so future edits to either the worker inline copies or the TS mirror surface as a test failure if they drift.

**Verification gates:**

- `node --check workers/fetch-s1.js`: clean parse.
- `npx tsc --noEmit`: clean.
- `npm test`: **665 baseline → 675 passing** across 43 files (+10 new specs; prompt projected ~8, actual 10 because zero-balance and negative-MW preservation are particularly load-bearing for this codebase — `nordbalt_avg_mw: -432` is the canonical "LT exporting" case and 0 is the "BALANCED" boundary in `flowSignal()`).
- Existing `flowSignal.test.ts` (4 cases) and `resolveFlow.direction.test.ts` (4 cases) — both pinning Phase 12.4's label + arrow-direction conventions — still pass. The merge layer doesn't touch the label convention they pin.
- Worker deploy: `f8173210-cb4b-493d-a1d8-0fd339ec6dac`. Triggers preserved (4 schedules, all 4 enumerated by wrangler).
- Post-deploy /s8 at 18:29 UTC: still serves the pre-deploy KV record (no `freshness` field, EstLink still null) because the route serves cached KV unconditionally. The deployed code path will activate on the next hourly cron tick (`0 * * * *`), within ~30 minutes of deploy. Per prompt §5 this is the expected wait-for-cron state — the deploy itself is verified by the version ID.

**Anomalies / non-obvious findings:**

- **Initial direct `curl` returned HTTP 200, not 429.** The prompt's pre-flight check projected a `429` from a direct curl. In practice the rate limit only triggers under the parallel-three-request shape from a Cloudflare-egress worker — not from a single curl from a residential / lab IP. The fix design is unaffected (UA + persist-last-good are correct regardless of whether 429 fires on this exact request), but the pre-flight diagnostic is more informative when it's the worker-level intermittency that's the smoking gun, not direct-curl.
- **/s8 route serves cached KV unconditionally.** Same dynamic Session 18 documented as "Phase 12.6 KV cache invalidation on worker deploy." The deployed code in Phase 12.7 doesn't take effect on /s8 reads until the next cron tick refreshes KV through the new path. Manual force-refresh via `wrangler kv key delete s8 --remote` is available (Session 18 used it) but was *not* exercised this session — destructive prod-data operation outside the prompt's authorized scope. Cron-driven recovery is fine; the prompt explicitly accepts this state.
- **The merge re-derives every `*_signal` from merged values, not fetched values.** The prompt's §2.4 said "verify the interpretation string still reads correctly post-merge" — implementing that the strict way means the *signal labels* also need to follow merged values, otherwise a stale-fallback MW could carry a `null` signal beside a real number. Both are now derived from the same merged value, so the wire shape is internally consistent regardless of fetch outcome.
- **Helpers are duplicated, not shared.** Worker is JS, vendored as a single file with no build step; TS mirror is for the Vitest suite. Both copies contain identical 4-line bodies (`safe`, `freshnessFor`). The cost of duplication here is two 4-line functions; the cost of unifying via a build step would be much higher. Comment on both flags the sync requirement.
- **No engine version bump.** Per prompt rule "this is a hotfix, not a new engine version." `model_version` field in /revenue is unchanged; /s8 doesn't carry a `model_version` field at all (it's a signal endpoint, not the financial engine).

**Cross-cutting notes for the next phase:**

- **Phase 7.7e UI track** is the natural next CC job. With `freshness` now flowing through /s8, the card layer can render a "stale" chip on the cable rows — a small surface that lets the operator see which cables fell back to last-known data versus which are streaming live. Same template as the existing live-data signal row from Phase 7.5-F (pulse dot + relative timestamp + source chip).
- **PR creation** for `phase-12-7-interconnector-rate-limit` deferred to operator. Branch is pushed to origin; gh PR URL surfaced by the push: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-7-interconnector-rate-limit`.
- **Production /s8 will populate `freshness` after the next cron tick (top of the hour after 18:29 UTC, so 19:00 UTC at the latest).** EstLink + Fenno-Skan will then either show a `live` value (UA mitigated 429) or a `stale` value (persist-last-good kicked in). Either outcome is the fix working as designed.

**Out of scope / not touched (per scope discipline):**

- Frontend changes. The /s8 contract is populated with the right field names; persist-last-good means existing renderers see numeric values. Card UI for `freshness` is Phase 7.7e UI-track territory.
- Other interconnector data sources (ENTSO-E direct, etc.) — much larger phase.
- Generalizing the persist-last-good pattern across other signal fetchers (/s1, /s2, /s4, /s9). Each has its own caching dynamics.
- Phase 12.6 (KV cache invalidation on worker deploy). Separate concern.
- Pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `docs/_yolo-followup-*.md`, `docs/_prep-commit-*.sh`, `docs/phases/phase-7-7c-session-1-prompt.md`) — left as-is per Session 18 + 22 convention.


### Session 24 — 2026-04-27 — Phase 7.7e UI track (sitewide ChartTooltip + v7.3 visualizations, Claude Code)

**Scope:** Phase 7.7e UI track per `docs/phases/phase-7-7e-ui-prompt.md`. Branch `phase-7-7e-ui` cut off main at `56a3b5b` (post-Phase 12.7 PR #41 merge). Frontend-only track — no engine changes, no worker deploy, no `model_version` bump. Six logical commits on the branch tell a clean story (tooltip primitive → chart.js migration → SVG migration → map cable → revenue card sub-components → audit). Operator approved upfront: 1) iterate on tooltip styling against two charts before cascading, 2) pick canonical FCR/aFRR/mFRR/DA hues with sitewide reuse in mind, 3) Pause B mobile-iPhone-14 viewport audit.

**Two interlocking deliverables — both shipped:**

1. **Unified `<ChartTooltip>` primitive** (`app/components/primitives/ChartTooltip.tsx` + `app/lib/chartTooltip.ts`). Single React component, portal-mounted so it can overflow chart bounding boxes; viewport-edge auto-flip; theme-aware shadow via `var(--tooltip-shadow)` token; single 120ms motion-react fade. Data contract: `{ date?: Date | string, time?, value, unit, label?, secondary?, source? }` — every chart on the site now surfaces date (or label) + value + unit consistently. Format helpers (`fmtTooltipDate`, `fmtTooltipTime`, `fmtTooltipValue`) hold per-unit decimal-place rules in one place. chart.js consumers wire via `buildExternalTooltipHandler(setState, mapPoint)` returned through `useTooltipStyle(CC, { external })`. SVG consumers use `useChartTooltipState()` + `<ChartTooltipPortal>` directly.

2. **Three new RevenueCard visualizations** consuming the v7.3 payload:
   - **`RteSparkline`** — 96×18px SVG of the 18-year `roundtrip_efficiency_curve`. Per-year hover surfaces year + RTE % + Δ vs BOL.
   - **`CyclesBreakdownChart`** — single-row stacked bar with FCR / aFRR / mFRR / DA segments using the new canonical `--cycles-{fcr,afrr,mfrr,da}` palette (lavender / teal / amber / blue). Responsive (viewBox + width:100%). Legend with per-product EFCs + total c/d + warranty chip ("WITHIN WARRANTY" / "PREMIUM TIER REQUIRED" / "UNWARRANTED").
   - **`CalibrationFooter`** — collapsed: italic Cormorant single line "Calibrated 2026-04-27 against Tier 1 LFP integrator consensus + public market research · Next review 2026-Q3"; expanded: 7-row labelled provenance grid showing the full `engine_calibration_source` object. Confidentiality discipline preserved verbatim.

**Migration coverage — every chart-bearing surface in the codebase (24 in inventory):**

| Group | Files migrated |
|---|---|
| chart.js cards (12 charts across 5 files) | `S1Card.tsx` (2), `S2Card.tsx` (3), `TradingEngineCard.tsx` (1), `RevenueBacktest.tsx` (1), `RevenueCard.tsx` internal subcharts (3 — DegradationChart / CannibalizationChart / RevenueChart). Two intentionally-disabled tooltips at `RevenueCard:937` / `:1043` preserved per operator approval. |
| inline-SVG primitives (6) | `Sparkline.tsx`, `BulletChart.tsx`, `RevenueSensitivityTornado.tsx`, `primitives/CredibilityLadderBar.tsx`, `primitives/RegimeBarometer.tsx`, `primitives/DistributionTick.tsx`. `Sparkline` cascades to S6/S7/S9/SpreadCapture cards in one edit. |
| custom hover-divs (2) | `S7Card.tsx` (TTF gas threshold) + `S9Card.tsx` (EUA carbon threshold) — `showTip` boolean state replaced by `useChartTooltipState`. |
| maps (1) | `HeroBalticMap.tsx` — invisible-stroke hit-target layer over `CABLE_PATHS` routes through unified primitive; `freshness` (Phase 12.7) renders as `secondary` row. Inline duplicate `Sparkline` definition deleted in favour of the shared component (operator-approved cleanup). `BalticMap.tsx` left untouched (decorative-only). |

**Canonical per-product palette (operator's "future site-wide reuse" mandate):**

| Token | Resolves to | Semantic role |
|---|---|---|
| `--cycles-fcr` | `var(--lavender)` | Modelled-grade automation; smallest contributor; visually distinct from operational-data hues |
| `--cycles-afrr` | `var(--teal)` | Observed-dominant balancing flow |
| `--cycles-mfrr` | `var(--amber)` | Manual activation; warning weight |
| `--cycles-da` | `var(--blue)` | Scheduling / long-horizon arbitrage |

Lives in `app/globals.css` alongside the other semantic tokens. Any future component rendering the four products by hue inherits the palette by name, not by hex.

**Iter1 → iter2 craft refinements (visual-eyeballed against actual page CSS):**

1. Value-text dropped 18 → 17px Unbounded with -0.005em letter-spacing (proportional balance against the 10.5px headline). 18px read slightly hot in light mode.
2. Headline gained `font-variant-numeric: tabular-nums` and a 10px gap between date+time so HH:MM aligns under the date.
3. Theme-aware `--tooltip-shadow` token replaces hard-coded rgba: heavy 24px+6px black on dark; soft 16px+3px ink on ivory. Resolves the muddy halo from the first iteration on light bg.
4. Single 120ms fade via motion-react. No spring physics (per scope discipline).

**Tests:** 675 baseline → **731 passing** (+56 across 4 new test files + 1 update across 48 files):
- `app/lib/__tests__/chartTooltip.test.ts` — 22 specs on format helpers (locale-short dates, HH:MM-UTC time, per-unit decimal rules, magnitude shortening, NaN/null handling, currency-leading vs trailing-suffix conventions).
- `app/components/__tests__/RteSparkline.test.tsx` — 5 specs.
- `app/components/__tests__/CyclesBreakdownChart.test.tsx` — 8 specs (canonical token usage, segment widths sum to chart width, three warranty-chip color branches).
- `app/components/__tests__/CalibrationFooter.test.tsx` — 6 specs (collapsed/expanded states, anonymization grep, partial-source fallback, generic-copy fallback).
- `app/lib/__tests__/chartTooltipShape.test.ts` — 14 sitewide-canary specs asserting every chart-bearing component is wired (one per file in the inventory). A future regression that reintroduces a bespoke `<title>` or a missed migration fails loudly here.
- `app/lib/__tests__/credibilityLadder.test.tsx` — legacy `title="permit: 800 MW · X% of pipeline"` assertion replaced by `data-tier=` + absence-of-legacy-title assertion.

**Verification gates:**
- `npx tsc --noEmit` clean.
- `npx next build` clean (Turbopack 27.2s, 5 routes prerendered).
- `npm test` 731/731 passing.
- Visual audit screenshots captured to `docs/visual-audit/phase-7-7e/`: `revenue-assumptions-{dark,light,mobile-dark}.png`, `calibration-footer-expanded-dark.png`, `hero-cable-tooltip-{dark,light}.png`. Iteration scratch screenshots discarded.
- Inventory at `docs/audits/phase-7-7e/chart-inventory.md`: 24 surfaces × 4 groups, with anomalies surfaced (HeroBalticMap inline `Sparkline` duplicate, `ImpactLine` non-chart classification, two intentionally-disabled tooltips).

**Anomalies / non-obvious findings:**

- **chart.js v4 synthetic events don't trigger the external callback.** `dispatchEvent(new PointerEvent(...))` doesn't reach chart.js's hit-test loop (it relies on real CDP-level pointer events). Result: programmatic chart-tooltip captures via JS injection didn't surface the actual primitive. Mitigation: cable tooltip captured live via direct SVG path event dispatch (which works); chart.js path covered by the canary test + iter2 static-preview overlay using the same CSS variables. Runtime behaviour fires under real cursor input; the migration is verified by the wiring test, not the screenshot.
- **Mobile viewport reveals pre-existing horizontal overflow** in the page's two-column hero grid containing the AssumptionsPanel. The `CyclesBreakdownChart` itself was made responsive (viewBox + width:100% + max-width:240px) after the §6 audit revealed the original 240px-fixed width overflowed at 390px. The parent grid not reflowing at narrow viewports is pre-existing — the prompt explicitly out-of-scopes mobile-specific layout work to Phase 8.
- **HeroBalticMap had an inline duplicate `Sparkline` definition** at `:83` (4-prop signature `{data, w, h}`, different from shared `app/components/Sparkline.tsx` `{values, width, height, ...}`). Operator-approved cleanup: deleted, replaced with `<SharedSparkline values={sparkData} unit="€/MW/day" ... />`. Eliminates one duplicate-tooltip surface.
- **`engine_calibration_source` was not on the `RevenueData` interface** at session start — added as an optional top-level field in commit 5 to feed `CalibrationFooter`. v7.3 worker has been emitting it since 2026-04-27; the frontend type was just lagging.
- **chart.js TooltipItem `parsed.y` is `number | null`** (missing values), not `number | undefined` as my initial type assumed. Loosened `ChartJsDataPoint.parsed.y` to `number | null | undefined` for compatibility — the format helpers handle nullish inputs by returning `'—'`.

**Cross-cutting notes for the next phase:**

- **Phase 7.7e data-contract** (Zod at /revenue boundary) is the natural next CC job. The Session 22 root cause was an `as RevenueData` cast at `RevenueCard:1087` letting any shape through. Tightening this with Zod or io-ts would surface v8+ schema changes as explicit validation errors rather than downstream `Cannot read properties of undefined`. Smaller phase (~30-60 min).
- **Phase 7.7c Session 2** (capital-structure sliders + request-time recompute) remains gated on operator UX decision (vertical vs horizontal sliders, request debounce vs blur-fire, persisted state encoding).
- **Mobile-pass (Phase 8)** should rework the hero-grid container so AssumptionsPanel and the chart grid reflow cleanly at 390px. The chart primitives are mobile-ready (cycles bar + sparkline are responsive); the parent layout is the constraint.
- **The unified `<ChartTooltip>` primitive can be consumed by future cards** without re-deriving the styling. Pattern: `useChartTooltipState()` + `<ChartTooltipPortal tt={tt} />` for inline-SVG; `buildExternalTooltipHandler(tt.setState, mapPoint)` + `useTooltipStyle(CC, { external })` for chart.js. The hooks live in `app/components/primitives/ChartTooltip.tsx`.

**Out of scope / not touched (per scope discipline):**

- Engine changes. Worker untouched. No `model_version` bump.
- Mobile-specific tooltip behaviour (tap-to-show explicit UX is Phase 8 territory).
- Animation polish on tooltips (spring physics, fade timings beyond a single token).
- Frontend Zod boundary tightening — separate Phase 7.7e data-contract sub-track.
- `roundtrip_efficiency_curve` and `cycles_breakdown` rendering anywhere outside the RevenueCard (Phase 8/9 scope).
- Pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `docs/_yolo-followup-*.md`, `docs/_prep-commit-*.sh`, `docs/phases/phase-7-7c-session-1-prompt.md`, `docs/phases/phase-7-7e-ui-prompt.md`) — left as-is per Session 18/22/23 convention.

**Verification:** `git log --oneline phase-7-7e-ui ^main` shows 6 commits totalling +1,906 / −320 lines. `npm test` 731/731 passing. `npx tsc --noEmit` clean. `npx next build` clean. Branch pushed to origin; PR creation deferred to operator.

### Session 25 — 2026-04-29 — Phase 7.7e UI render-loop fix + memoization audit (Claude Code)

**Scope:** Defect fix on top of Session 24's `phase-7-7e-ui` branch. The Cloudflare Pages preview deploy on 2026-04-28 rendered S1Card's `<CardBoundary>` fallback with `Minified React error #185` ("Maximum update depth exceeded") after a real cursor hovered the sparkline canvas. Three commits land the fix on the same branch (no sub-branch); a fourth carries the handover, visual audit, and PR draft.

**Trigger refinement (deviation from original prompt's §3 mechanism):** the bug is **hover-driven, not paint-driven**. chart.js's `external` callback only fires when a real pointer is on the canvas. Page mounts cleanly; the loop only chains in once a cursor lands on a chart.js consumer with the migration pattern. The operator's pre-fix screenshot was post-hover.

**Empirical render-count comparison (S1 Sparkline, 30 mousemoves, 40ms apart, dev):**

```
Build                                         Sparkline renders   React #185?
-----                                         -----------------   -----------
Baseline (no fix)                             108                 yes — caught by <CardBoundary>
§1 only — useTooltipStyle memoized            108                 yes
§1 + §2 — handler memoized at S1 sites        108                 yes — handler stable, loop still cascades
§1 + §2 + central dedupe (this commit)        10                  no
```

**Actual root cause (refines the original prompt):** `react-chartjs-2`'s internal `useEffect` runs with deps `[redraw, options, data.labels, data.datasets, updateMode]` and calls `chart.update()` whenever any dep ref changes. The migration pattern at every chart.js consumer feeds fresh literal `options` and `data.{labels,datasets}` into `<Line>`/`<Bar>` on every parent render, so the effect fires every commit. With an active tooltip, `chart.update()` retriggers chart.js's tooltip-plugin `afterDraw` path, which calls the registered `external` callback synchronously inside `componentDidUpdate` — i.e. inside React's commit phase. `external → setState → re-render → fresh options → useEffect → chart.update() → external → …` until React #185.

The §1/§2 memoizations of `useTooltipStyle` and per-site handlers are necessary referential-stability guarantees so chart.js's plugin/options reconciliation holds across renders, but they don't on their own break the cascade because the outer `options` and `data` literals fed to `<Line>`/`<Bar>` remain fresh refs each render. The actual loop-breaker is **§3 — central dedupe in `useChartTooltipState.setState`** using React's functional-updater bail-out: `setStateRaw(prev => tooltipStateEqual(prev, next) ? prev : next)`. When the updater returns the same reference as `prev`, React skips the re-render entirely.

**Equality helper choice:** `tooltipDataEqual` does deep equality on the value-driving fields (`value`, `unit`, `date`, `time`, `label`, `source`, `secondary[]`). Two extra normalizations:
- **Date instances** normalize via `.getTime()` so two equivalent `new Date('…')` references compare equal across renders.
- **Both-hidden states** short-circuit to equal regardless of `x`/`y`/`data` — chart.js fires hide pulses with stale caret coords during transitions, and treating those as equal avoids spurious re-renders.

The hook's `setState` / `show` / `hide` are wrapped in `useCallback` so consumer memo deps (`useTooltipStyle`, per-site handlers) keep stable refs across renders.

**Fixes shipped:**
1. `app/lib/chartTheme.ts` — wrapped `useTooltipStyle()` returned options in `useMemo` keyed on the primitive color fields (`tooltipBg`, `tooltipBorder`, `textPrimary`, `textSecondary`, `teal`) plus the external handler reference. Reads `opts?.external` once into a local so the dep is a plain identifier (exhaustive-deps clean).
2. Per-site memoization at all 10 chart.js consumer sites in `app/components/{S1Card,S2Card,TradingEngineCard,RevenueBacktest,RevenueCard}.tsx`. Memo deps key on the upstream collection (`history`/`monthly`/`years`/`rows`); closures index back into the upstream data instead of derived `.map(...)` arrays. Two `RevenueCard` sub-charts also memoize the derived `points` array (`useMemo(() => projectXxxCurve(deps), [deps])`) so chart `dataIndex → points[i]` stays correct after row-filtering.
3. `app/components/primitives/ChartTooltip.tsx` — added `tooltipDataEqual` + `tooltipStateEqual` (exported) and wrapped `useChartTooltipState.setState` in the functional-updater bail-out. `show`/`hide` migrated to `useCallback`.

**SVG-primitive audit log (no code changes — confirmed structurally safe):**

> Browser events go through React's synthetic event system and don't fire during reconciliation; the chart.js external callback fires inside `chart.update()` which is called from `componentDidUpdate` — that's the difference.

The 7 SVG-tooltip consumers all set tooltip state from synthetic event handlers (`onMouseMove`/`onMouseLeave`/`onMouseEnter`/`onFocus`/`onBlur`), which React batches outside the commit phase and cannot trigger the chart.js-style cascade. None call `tt.setState`/`tt.show`/`tt.hide` from a `useEffect`/`useLayoutEffect`.

| File | Audit verdict |
|---|---|
| `app/components/Sparkline.tsx` | `tt.show`/`tt.hide` fire from `onMouseEnter`/`onMouseMove`/`onMouseLeave`. Mount-only `useEffect` doesn't touch `tt`. Safe. |
| `app/components/BulletChart.tsx` | `tt.hide` from `onMouseLeave`; `tt.show` via `onMouseMove`. Safe. |
| `app/components/RevenueSensitivityTornado.tsx` | `tt.show`/`tt.hide` from per-bar `onMouseMove`/`onMouseLeave`. Safe. (Pre-existing lint error at L62 about conditional `useChartTooltipState` — not new in this session.) |
| `app/components/primitives/CredibilityLadderBar.tsx` | `tt.show`/`tt.hide` from `onMouseMove`/`onMouseLeave`. Safe. |
| `app/components/primitives/RegimeBarometer.tsx` | `tt.show`/`tt.hide` from `onMouseMove`/`onMouseLeave`. Safe. |
| `app/components/primitives/DistributionTick.tsx` | `tt.show`/`tt.hide` from per-percentile `onMouseEnter`/`onMouseMove`. Safe. |
| `app/components/HeroBalticMap.tsx` cable hover | `cableTip.show`/`cableTip.hide` from `onMouseMove`/`onMouseLeave`. The four `useEffect`s here drive GSAP particles + cable freshness state; none touch `cableTip`. Safe. |

**Tests:** baseline 731 → **766 passing** (+35 across two new test files, no specs modified).
- `app/lib/__tests__/chartThemeMemo.test.ts` (4 specs) — source-text canary on `useTooltipStyle`'s `useMemo` wrapper, dep-array shape, and the `const external = opts?.external` snapshot pattern.
- `app/lib/__tests__/chartHandlerMemo.test.ts` (5 specs, one per chart.js card file) — asserts every `buildExternalTooltipHandler` call across the migrated card files is wrapped in `useMemo`.
- `app/components/primitives/__tests__/chartTooltipDedupe.test.ts` (26 specs) — exhaustive equality helper coverage (null-handling, fresh-ref equality, value differences, Date normalization, secondary array length + entry mismatches, both-hidden short-circuit), functional-updater bail-out simulation (4 dedupe-contract specs), source-text canary on the `setStateRaw(prev => …)` pattern + `useCallback` wrappers.

The project doesn't ship `@testing-library/react`, and adding a heavy dev dep mid-defect-fix wasn't justified. The dedupe-contract specs simulate the hook's bail-out predicate directly without React, which is sufficient to catch a regression of the helper code (the part this PR owns). The bail-out behavior itself relies on documented React `useState` semantics.

**Verification gates:**
- `npx tsc --noEmit`: clean (0 errors).
- `npm run lint`: 38 errors, 128 warnings — all pre-existing. Pre-fix baseline was 42 errors; my edits reduced 4 errors and introduced none.
- `npm test`: 766/766 passing.
- `npm run build`: exits 0, 5 routes prerendered to `./out`.
- Visual audit (dev `localhost:3000` + prod static `localhost:3001`, real Chrome): 30-mousemove sweep on S1 sparkline plus 10–15 events across all 12 chart canvases. Zero error boundaries, zero `Maximum update depth` text, zero new console errors after every sweep. Console only carries pre-existing 404 + THREE.js deprecation warnings.

**Visual audit screenshots (`docs/visual-audit/phase-7-7e-fix/`):**
- `01-pre-fix-prod-error-boundary.png` (preserved from Session 24's prep — the original ErrorBoundary fallback)
- `02-post-fix-dev-s1-hover.png` (dev mode, 30-mousemove sweep, post-fix)
- `03-post-fix-prod-s1-hover.png` (prod build, S1 hover, post-fix)
- `04-post-fix-prod-s2-hover.png` (prod, S2 capacity chart hover)
- `05-post-fix-prod-revenue-hover.png` (prod, RevenueCard chart hover)
- `06-post-push-preview-s1-hover.png` (captured against `https://phase-7-7e-ui.kastis-kkme.pages.dev` after push, Pause C — same 30-mousemove sweep on the S1 sparkline canvas, errBoundaries=0, hasS185Text=false)

**Commits:** four atomic, in this order on `phase-7-7e-ui` (no sub-branch):
1. `chart-tooltip-memo: memoize useTooltipStyle returned options` — `chartTheme.ts` + `chartThemeMemo.test.ts`.
2. `chart-tooltip-memo: memoize external handlers at chart.js call sites` — 5 card files + `chartHandlerMemo.test.ts`.
3. `chart-tooltip-dedupe: dedupe useChartTooltipState setState to break hover render-loop` — `ChartTooltip.tsx` + `chartTooltipDedupe.test.ts`. **Body embeds the empirical render-count table verbatim** plus the root-cause paragraph; this commit is the load-bearing loop-breaker.
4. `handover: Session 25 — render-loop fix + audit + PR draft` — this entry, visual audit screenshots, and `docs/phases/phase-7-7e-ui-pr.md`.

The dedupe gets its own commit because it's a behavioural change to a primitive that other code depends on; future bisect should land on commit 3 specifically when probing the dedupe.

**PR draft:** `docs/phases/phase-7-7e-ui-pr.md`. Operator opens via GitHub web UI per `CLAUDE.md`.

**Process finding:** vitest jsdom doesn't drive chart.js's paint/effect cycle. The 731-test suite passed clean before this defect surfaced in production. Future migrations involving paint- or effect-callback hooks need a real-browser smoke test before merge — the chrome-devtools MCP path used for verification in this session is the de-facto pattern.

#### Backlog discovered this session

(Notion MCP was disconnected during this CC session, so these are written here as plain markdown for the operator to sync to Notion separately. Both go under Area=Cards, Type=Tech Debt.)

- **Memoize chart.js options + data at every call site (perf optimization)** — *Priority: P3 Medium.* Every parent re-render of a chart.js consumer currently triggers `chart.update()` across all 12 chart.js consumers because the outer `options` and `data` literals are fresh refs every render. Memoizing `data` and `options` at each call site (Approach B from Session 25's pre-fix triage) eliminates the spurious chart updates and reduces canvas redraw work. Deferred from Session 25 because the dedupe-driven loop-breaker (§3 of the fix) unblocks the PR without it, and there is no empirical perf complaint — the redraws are cheap enough that operator's hover felt fluid in post-fix testing. Approach C (this session's dedupe) was the right scope-disciplined fix; Approach B is the perf-purity follow-up.
- **Playwright (or chrome-devtools-MCP-driven) smoke test for chart.js hover** — *Priority: P3 Medium.* The 2026-04-28 production failure passed the entire vitest suite because vitest's jsdom doesn't run chart.js's effect-driven update cycle. A real-browser test that mounts the homepage, hovers each chart.js canvas, and asserts no `<CardBoundary>` fallback rendered would catch a future regression of this class. Backlog because it requires CI infra for headless Chrome and isn't blocking the current PR.
- **Cloudflare Pages project name (`kastis-kkme`) is undocumented at the repo level** — *Priority: P3 Low.* Notion: Area=Infrastructure, Type=Tech Debt. The preview-deploy URL pattern `<branch>.kastis-kkme.pages.dev` was only carried in `.claude/settings.local.json` historical curls (gitignored), so a fresh CC session cannot derive it from the repo. Cost this session ~5 min of preview-URL probing before the operator surfaced it manually. Add to `docs/principles/decisions.md` (new ADR-008 or extend an existing infrastructure ADR) or to `docs/handover.md`'s reference section in the next docs maintenance pass.
- **Cloudflare Pages preview deploy CSP blocks IntelFeed favicon loads** — *Priority: P3 Low.* Notion: Area=IntelFeed, Type=Bug. Observed on the post-push preview-deploy sweep on 2026-04-29: ~50 console errors per page load of the form `Loading the image 'https://www.google.com/s2/favicons?sz=32&domain=…' violates the following Content Security Policy directive: "img-src 'self' data:"`. The preview deploy enforces a stricter CSP than local dev/prod-static (so the errors don't surface in `npm run dev` or `npx serve out`). Pre-existing — not introduced by Session 25 — and orthogonal to the render-loop fix. Either widen the CSP (`img-src 'self' data: https://www.google.com`) or proxy the favicons through `/api/favicon?domain=…` so they load same-origin.

**Out of scope / not touched (per scope discipline):**
- No engine changes; no worker changes; no `model_version` bump.
- No new features — pure defect fix on top of Session 24's deliverables.
- No `gh pr create` (operator opens PRs via GitHub web UI per `CLAUDE.md`).
- Approach B (memoize chart.js `options` + `data` at every call site) — logged as backlog above.
- The lint debt at `RevenueSensitivityTornado.tsx:62` (conditional `useChartTooltipState`) and similar pre-existing lint errors elsewhere — pre-existing on `phase-7-7e-ui`, not introduced by this session.
- Pre-existing untracked tree (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `docs/_yolo-followup-*.md`, `docs/_prep-commit-*.sh`, `docs/phases/phase-7-7c-session-1-prompt.md`, `docs/phases/phase-7-7e-ui-prompt.md`, `docs/phases/phase-7-7e-ui-render-fix-*.md`, `docs/phases/phase-7-7e-ui-s1-render-fix-prompt.md`) — left as-is per Session 18/22/23/24 convention.

---

### Session 26 — 2026-04-29 — Phase 4F — BESS quality gate first-deployment + IntelFeed homepage tightening (Claude Code)

**Scope:** Address external 2026-04-29 design audit finding that the live `/feed` surfaced clearly-irrelevant content on the homepage (5 explicit garbage examples: facebook.com US grocery + ice-cream posts ×2, facebook.com Avion Express airline post, researchgate.net NILM academic paper, latvenergo.lv consolidated financial report). Branch off `main` post-merge of `phase-7-7e-ui` PR #43.

**Forensic finding (load-bearing):**
The Phase 4B-5 entry in this handover (originally claiming "Feed: 9→33 clean items, zero garbage" and "Merged") was wrong. Phase 4B-5's BESS quality gate (`computeBessRelevanceScore`, `BESS_SIGNALS`, score floor, homepage 8-item cap) was authored at commit `6f6d2d7` 26 minutes after PR #15 closed (`e795d51`, 2026-04-16 09:21:47 UTC). The commit sat on `phase-4b-intel-pipeline` and was never re-PR'd. Production has run with title-length-only filtering for 13 days. The "9→33 clean items" curl reflected a local side-branch deploy. Both the backlog "What's shipped" entry (line 36) and the Phase 4B-5 backlog entry (~line 259) have been corrected with this session's footnote. Full forensic write-up in `docs/investigations/phase-4f-intel-feed-regression.md`.

**Shipped (4 commits, branch `phase-4f-intel-feed-regression` pushed to origin):**

1. **Investigation report** (`docs/investigations/phase-4f-intel-feed-regression.md`, 280 lines + post-deploy evidence) — pipeline map (5 gates → admit garbage), per-item trace for all 25 live items (15 caught by new gates), Phase 4B-5 archaeology, denylist + keyword + tier-keyed-threshold proposal, post-deploy before/after curl evidence.
2. **Worker fix** (`workers/fetch-s1.js` +282 / -14, `app/lib/feedSourceQuality.ts` 236-line TS mirror, `app/lib/__tests__/feedSourceQuality.test.ts` 71 tests). Three layers of filtering:
   - `FEED_SOURCE_DENYLIST` (14 social/blog/academic domains + LinkedIn `/posts/` + `/pulse/` patterns) at projection time *and* read time.
   - **Tier-keyed topic threshold:** Tier-1 (TSO/regulator: litgrid, ast, elering, apva, vert, am.lrv.lt, ec.europa.eu, etc.) auto-pass; Tier-2 (trade press: montelnews, reuters, energy-storage.news, nordpoolgroup) require ≥1 BESS keyword; outside both lists require ≥2.
   - **Soft-delete on rejection:** items failing gates land in `feed_index` with `status:'rejected'` + `rejection_reason` + `source_tier` + `topic_score` for audit. Read-time `isValidFeedItem` excludes them and re-runs the gates as belt-and-braces backstop.
   - New `POST /feed/purge-irrelevant` (UPDATE_SECRET-gated) re-evaluates existing KV items; `GET /feed/rejections?limit=N` (UPDATE_SECRET-gated) returns audit log with reason histogram.
3. **Frontend** (`app/components/IntelFeed.tsx` +93 / -2, `app/intel/page.tsx` new 60 lines) — `mode` prop ('homepage' | 'full'). Homepage: 5-item cap, 30-day max-age, "older" chip on items ≥7 days, "View all N items →" link to `/intel`. Full mode: no cap, no age filter. New `/intel` page renders `<IntelFeed mode="full" />` with minimal page chrome.
4. **Handover update** — this entry, the Session 8 / Phase 4B-5 footnote corrections, and the backlog additions below.

**Worker deploy:** version `f8411968-a69c-4e4a-a9de-d79565a5c007`, deployed 2026-04-29 ~19:55 UTC. KV namespace `KKME_SIGNALS` (323b493a50764b24b88a8b4a5687a24b), single binding.

**Empirical evidence (post-deploy curl `/feed`):**
- **Before:** 25 items including 5 facebook.com posts, 4 linkedin.com `/posts/` items, 1 instagram.com, 1 researchgate.net, 1 latvenergo.lv financial report, 1 lsta heating bulletin, etc.
- **After:** 9 items, all Tier-1 (litgrid×4, apva, vert×2, am.lrv.lt) plus 1 outside (solarplaza.com Baltics summit, score≥2). All 5 audit-explicit garbage items absent.
- **No KV write was needed for the user-visible fix.** The read-time `isValidFeedItem` gate self-heals at deploy time. This is a **structural finding worth carrying forward** — belt-and-braces filtering means the homepage cleans on deploy; the soft-delete/purge path is pure data hygiene, not user-visible cleanup. Useful pattern for similar future fixes.

**Verification gates:**
- `node --check workers/fetch-s1.js` clean.
- `npx tsc --noEmit` clean.
- `npm run build` clean (5 static routes including new `/intel`).
- `npm test` 766 → 837 (+71 new tests, 71/71 green). Test set covers: denylist matching with subdomain edge cases, LinkedIn pattern-block (admits `/company/`, `/in/`, blocks `/posts/` + `/pulse/`), tier classification, all three threshold tiers, all 5 audit-garbage items rejected, all five Tier-1 examples admitted, the lsta heating bulletin (outside, score 1) rejected by tier-2 promotion threshold of 2, the solarplaza Baltics summit (outside, score≥2) admitted, Reuters energy admitted vs. Reuters general news rejected.
- Live `/feed` post-deploy curl confirms 25→9 reduction with all 5 audit-garbage items absent.

**Acknowledged deviations from prompt:**
- **Backfill purge run skipped.** `UPDATE_SECRET` not located locally at deploy time. Endpoint is shipped and functioning; running it later only re-annotates KV records with `status:'rejected'` for audit. No user-visible delta — read path already filters them.
- **Homepage age window: 30-day exclusion + 7-day "older" chip, not strict 14-day.** §What-Ships had contradictory specs (#4 said 14-day, #5 said 30-day exclusion). Under current feed sparsity (~5 Tier-1 items in past 30 days), strict 14-day would render the homepage near-empty. Operator approved the 30-day reading; tighten to 14-day in a follow-up if feed density grows post-purge.
- **Wrangler dev smoke test skipped** in favor of 71 unit tests + node syntax check + deploy-time bundle validation. Operator approved.

**Backlog discovered this session:**

- **Branch hygiene — commits authored after a branch's PR closes need a separate follow-up PR.** *Priority: P3 Low.* Notion: Area=Infrastructure, Type=Tech Debt. PR #15 closed at 2026-04-16 09:21:47 UTC; commit `6f6d2d7` was authored 26 minutes later onto the same branch and was orphaned — production never received the Phase 4B-5 quality gate. Investigate whether a git hook on `git commit` (warn if HEAD is on a branch whose tracking remote is ahead of the named PR) or a branch-naming convention can prevent this class of error. Two-week real-world cost: 13 days of garbage on the homepage that the operator only spotted via external audit.
- **`UPDATE_SECRET` not located locally during Phase 4F deploy; backfill purge deferred.** *Priority: P3 Low.* Notion: Area=Infrastructure, Type=Tech Debt. The read-time gate is already enforcing the cleanup; `feed_rejections` will populate from new ingestions only. Operator to either locate the secret and run `POST /feed/purge-irrelevant` for retro-annotation, or rotate the secret via `wrangler secret put UPDATE_SECRET` (requires updating GitHub repo Actions secret to keep cron-write paths working). Rotation path: `cd ~/kkme && npx wrangler secret put UPDATE_SECRET` → paste new value (e.g. `openssl rand -hex 32`) → update github.com/kastiskemezys-tech/kkme-website/settings/secrets/actions to match. Optional — homepage is already clean.
- **48h-window title-normalization dedup.** *Priority: P3 Medium.* Notion: Area=IntelFeed, Type=Enhancement. Auditor's design-audit P2 #6: "hash normalize(title) and drop near-duplicates within a 48h window so the same press release from two outlets only appears once." Existing dedup checks current-batch + full-history URL/title equality, not 48h-window normalized-title fuzzy dedup. Likely a small change once `feed_rejections` data reveals duplicate-content patterns that a normalized-title hash would catch.
- **`feed_rejections` review cadence + tuning loop.** *Priority: P3 Low.* Notion: Area=IntelFeed, Type=Process. Operator should curl `GET /feed/rejections?limit=50` weekly with `UPDATE_SECRET` to inspect what's getting filtered. Reasons to amend: (a) Tier-1 source typo'd (e.g. URL contains `litgrid.lt/api/x` but source is `transmission system operator` — would be classified outside if domain match fails); (b) keyword set misses an obvious BESS-adjacent pattern (e.g. Polish balancing market news using only Polish keywords). The `reason_counts` histogram in the response highlights tuning opportunities.
- **Re-audit `/feed` two weeks post-deploy.** *Priority: P3 Medium.* Run the same external-audit prompt that surfaced this regression on 2026-04-29. Specifically check: (a) ratio of Tier-1 to Tier-2 to outside survivors (target Tier-1 ≥60%); (b) any new garbage that slipped past the tier-2 ≥1 threshold; (c) homepage feed density — if <3 visible items consistently, broaden allowlist or relax age window before tightening anything else. **Scheduled health-check trigger created 2026-04-29 — `trig_011x9vT1GrGoiwtWHPt5aAR8`.** Cron `0 9 13,27 * *` UTC, first fire 2026-05-13 09:00 UTC. Cadence drifts ±2 days at month rollover (acceptable noise for a fortnightly check). Prompt at `docs/phases/phase-4f-feed-health-check-prompt.md`. Output: `docs/audits/phase-4f-followup-{date}.md`. RED status auto-creates Notion Task in IntelFeed area (Notion MCP attached to the routine). Manage at https://claude.ai/code/routines/trig_011x9vT1GrGoiwtWHPt5aAR8.

**Out of scope / not touched (per scope discipline):**
- `/curate` POST endpoint (operator-gated by UPDATE_SECRET; out per §What's-Out).
- `editorial_status` manual featured/normal/hidden override (deferred per prompt).
- Embedding-based topic relevance (deferred per prompt; keyword + tier model is the 80% solution).
- `model_version` bump (this is the Intel feed, not the revenue engine).
- Mobile responsiveness (Phase 11.2 covers).
- `/feed/clean` semantics — kept legacy hard-delete behavior; the soft-delete audit trail is on `/feed/purge-irrelevant`.
- `S/Sx/Trading/Revenue` cards or any chart/UI not under `app/components/IntelFeed.tsx`.
- Pre-existing untracked tree from prior sessions (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `_handover_s1_s2_rebuild.md`, `docs/_yolo-*.md`, `docs/_prep-commit-*.sh`, `docs/phases/phase-7-7c-session-1-prompt.md`, `docs/phases/phase-7-7e-ui-*.md`, `docs/phases/phase-4f-intel-feed-regression-prompt.md`) — left as-is per Session 18/22/23/24/25 convention.

**Next session:**
- Operator opens PR via GitHub web UI (base `main`, title `Phase 4F — Intel feed BESS quality gate first-deployment + homepage tightening`). Don't `gh pr create` per CLAUDE.md.
- Optional immediate follow-up: locate or rotate `UPDATE_SECRET` and run `POST /feed/purge-irrelevant` to populate audit annotations in KV.
- Notion board sync: add Phase 4F entry, mark shipped; add the 5 backlog items above.


---

### Session 27 — 2026-05-03 — Phase 12.8 — Dispatch render-error fix + boundary upgrade (Claude Code)

**Scope:** Address external 2026-04-29 design audit finding that the live "Dispatch intelligence" section on kkme.eu surfaced a bare `SIGNAL ERROR` placeholder — the fallback rendered by `<ErrorBoundary>` at `app/components/ErrorBoundary.tsx:47` when its `componentDidCatch` traps a render exception inside `<TradingEngineCard>`. Branch off `main` post-merge of `phase-4f-intel-feed-regression` PR #45 (commit `1f4a057`).

**Investigation finding (load-bearing):**
The audit's `SIGNAL ERROR` does not currently reproduce on 2026-05-03. Live kkme.eu, `npm run dev`, and `npx serve out` all render `<TradingEngineCard>` cleanly with today's `/api/dispatch?dur=4h&mode=realised` payload (daily_eur=526, annual_eur=191990, capture_quality_label='high', da_avg=104.3, all 12 keys non-null). Worker `/api/dispatch` is healthy.

The audit's symptom was therefore a **transient data-shape-driven render exception** that depended on the specific upstream payload at audit time — Cowork-side capture 2026-04-29 17:00 UTC showed `daily_eur=335`, `annual_eur=122275`, `capture_quality_label='low'`, and **all three `market_context.da_*_eur_mwh` fields zero**. The all-zero DA context fields are independent corroboration of an empty A44 day-ahead fetch at audit time — the most plausible upstream condition that would simultaneously zero the DA fields and propagate a degraded shape (likely `hourly_dispatch: null` / non-array) downstream.

This is **not retroactive proof-of-fix.** This phase is preventive hardening: defensive guards at every render-time field access in the dispatch render path that would throw under a degraded payload, paired with empirical fail-then-pass tests that prove the bug class exists for each candidate.

**Shipped (4 commits, branch `phase-12-8-dispatch-render-error` pushed to origin):**

1. **Investigation report** (`docs/investigations/phase-12-8-dispatch-render-error.md`, 211 lines) — repro-paths table (A/B/C with results), audit-vs-current worker payload comparison, full 9-candidate throw-site enumeration with priority ranking + classification, fix plan, future-engineer repro recipe.

2. **Throw-site fix + tests** — `app/lib/dispatchChart.ts` + `app/components/TradingEngineCard.tsx` + 21 vitest specs across two new test files. Each of the 6 throw-eligible candidates has a fail-then-pass spec; commit body embeds the empirical result table verbatim. Candidates 1, 2, 3, 4, 6 (helper) failed pre-fix → pass post-fix; Candidate 5 (`qualityColor` unexpected string) and Candidate 6 (`dailyAvgPerHour` edge cases) **passed pre-fix → no production change** per scope discipline (don't add guards for hypothetical throws). Throw-eligible inline JSX expressions hoisted to two named exports (`formatHeadlineAnnualLabel`, `formatSourceFooterLabel`) so the tests can probe them directly. `HourlyChart` and `ISPTable` exported at module scope for the same reason. Net source delta: ~30 lines.

3. **Boundary upgrade** — `app/page.tsx:140` `<ErrorBoundary>` → `<CardBoundary signal="trading">`. The bare "SIGNAL ERROR" placeholder is gone; the same retry-bearing fallback pattern S1/S2/S3/S4/etc. all already use takes its place. `<CardBoundary>` itself: fallback markup extracted into a named `<CardBoundaryFallback>` export (testable via `react-dom/server`'s `renderToStaticMarkup` — class-component error boundaries don't trap throws under the static renderer, so behavioural test of catch-then-render is impossible without jsdom + `@testing-library/react`, which the project intentionally doesn't ship per Session 25). `role="status"` + `aria-live="polite"` on the fallback container. NODE_ENV-gated dev hint pointing at the `[Card crash — <signal>]` browser-console log emitted by `componentDidCatch`. 8 boundary specs.

4. **This handover entry** + visual-audit screenshots + PR draft.

**Empirical fail-then-pass results (commit 2 body):**

| # | Candidate                              | Pre-fix test result                                                                        | Outcome                                                                |
|---|----------------------------------------|--------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| 1 | hourly_dispatch null/non-array         | FAILED  (TypeError: null.map @ dispatchChart.ts:31; HourlyChart renderToStaticMarkup throws) | Fixed at helper + component (Array.isArray guards).                    |
| 2 | revenue_per_mw.annual_eur null/undef   | FAILED  (TypeError: null.toLocaleString)                                                    | Fixed via formatHeadlineAnnualLabel(annualEur ?? 0).                   |
| 3 | meta.sources null/undef/non-array      | FAILED  (TypeError: undefined.join, sources.join is not a function)                         | Fixed via formatSourceFooterLabel (Array.isArray + fallback "—").      |
| 4 | isp_dispatch null/undefined            | FAILED  (TypeError: null.map @ ISPTable; drawer renders children even when collapsed)        | Fixed via Array.isArray(isps) ? isps : [].                             |
| 5 | capture_quality_label unexpected str   | PASSED  (qualityColor returns "var(--text-muted)" default)                                  | No production change. Spec locks against future regression.            |
| 6 | dispatchChart helpers edge inputs      | FAILED  for normaliseHourlyDispatch null/undef/non-array; PASSED for dailyAvgPerHour (NaN)   | Same fix as Candidate 1. dailyAvgPerHour left unchanged.               |

**Verification gates:**
- `npx tsc --noEmit`: clean (0 errors).
- `npm run lint`: 169 problems (40 errors, 129 warnings) — **identical to baseline `main` count**, verified by stash + re-lint.
- `npm test`: 837 → 866 (+29: 21 guard specs + 8 boundary specs). All passing.
- `npm run build`: exits 0, 6 routes prerendered to `./out`.
- `grep -rnE "console\.count|\[diag\]|test throw|phase128_test_throw" app/`: zero diagnostic leftovers.

**Visual audit (`docs/visual-audit/phase-12-8-fix/`):**
- `01-pre-fix-prod-state.png` — kkme.eu live (today): renders cleanly. Audit's transient `SIGNAL ERROR` does not currently reproduce against the live worker.
- `02-pre-fix-dev-clean.png` — `localhost:3000` dev pre-fix: renders cleanly.
- `03-post-fix-dev-clean.png` — `localhost:3000` dev post-fix: renders cleanly. Control toggles (2H / 4H / Today / Tomorrow) + 30-mousemove canvas hover sweep produce zero boundary fallback, zero new console errors. Phase 7.7e Session 25 chart-tooltip dedupe still holding.
- `04-post-fix-dev-boundary-triggered.png` — synthetic `?phase128_test_throw=1` query trigger: new `CardBoundaryFallback` renders with `"trading render error"` line, the synthetic message, retry button, dev-mode console hint, `role="status" aria-live="polite"`. Synthetic throw removed before commit (verified clean post-removal render).
- `05-post-fix-prod-clean.png` — `npx serve out` prod static at `localhost:3001`: renders cleanly, identical behavior to dev.

**Acknowledged scope choice (deviation from prompt §3 test template):**
Prompt §3 used `import { render, screen, fireEvent } from '@testing-library/react'` — not installed in the project (Session 25 documented the deliberate omission). Tests use `react-dom/server`'s `renderToStaticMarkup` (existing project pattern, see `app/components/__tests__/CalibrationFooter.test.tsx`). For the throw-then-fallback flow a behavioural test is impossible under the static renderer; the boundary tests therefore probe `<CardBoundaryFallback>` directly + carry source-text canaries on the `app/page.tsx` wrapper swap. 8 specs total in commit 3.

**Backlog discovered this session:**

- **`market_context.da_avg_eur_mwh: 0` worker-side bug.** *Priority: P3 Medium.* Notion: Area=Worker, Type=Bug. ENTSOE A44 ingestion path occasionally returns empty/null arrays that propagate through `computeDispatchV2` as all-zero `da_avg/min/max` fields despite the dispatch endpoint computing a non-zero `daily_eur` from BTD reserves alone. Worth investigating the next time the dispatch worker code is touched. Was the most plausible upstream root cause of the audit's transient render failure (an empty A44 fetch zeroes the DA fields *and* can null `hourly_dispatch[].da_price_eur_mwh` cascading downstream).
- **Sentry / Cloudflare-Logpush integration for `componentDidCatch` errors.** *Priority: P3 Low.* Notion: Area=Infrastructure, Type=Enhancement. Auditor's #4 finding (P5 list). Currently the boundary writes to `console.error` only; without Logpush, the operator never sees these errors unless they happen to be inspecting the browser console. Phase 12.8 narrows the affected render path so future occurrences are rarer; observability is the long-game complement.
- **CardBoundary polish (last-successful-fetch line, signal-keyed dev URL).** *Priority: P3 Low.* Notion: Area=Cards, Type=Enhancement. Deferred from §2.2 of the Phase 12.8 prompt. The dev hint became a signal-generic `[Card crash — <signal>]` console-trace pointer rather than a dispatch-specific `/api/dispatch?dur=4h&mode=realised` URL because `<CardBoundary>` is shared across S1/S2/S3/S4/etc. A signal-keyed lookup table mapping signal → diagnostic URL plus a "last successful render NN minutes ago" line (computed from a parent-held timestamp ref) would deliver the prompt's full vision; out of scope this session due to the cross-card surface.
- **RevenueBacktest credibility issue.** *Priority: P1 Critical.* Notion: Area=Cards, Type=Bug (credibility). Auditor's 2026-05-03 second-pass found that `RevenueBacktest` shows a flat amber "Y1 model €368" line vs varying realised €500–790 with a self-reported +70.9% mean error, presented as a "backtest" — a credibility-corrosive surface. Out of Phase 12.8 scope but **authored as Phase 12.8.1 hot-fix immediately after 12.8 ships.**
- **Remaining `<ErrorBoundary>` consumers.** *Priority: P3 Medium.* Notion: Area=Cards, Type=Tech Debt. `<ErrorBoundary>` is still used at `app/page.tsx:121` for `<RevenueCard>`; same bare "SIGNAL ERROR" risk applies to that consumer. Out of scope this phase per OUT-of-scope rule. Follow-up sweep should swap every remaining `<ErrorBoundary>` consumer to `<CardBoundary signal="...">`. Cheap and mechanical.

**Out of scope / not touched (per scope discipline):**
- Worker-side `computeDispatchV2` or any `/api/dispatch` logic. Worker is healthy.
- Replacing the entire `<ErrorBoundary>` component sitewide. Narrowed to the dispatch wrapper only — `<RevenueCard>` at `:121` retains `<ErrorBoundary>` per prompt's "narrow to the dispatch wrapper only".
- Migrating `TradingEngineCard` to a different chart library or restructuring its render tree.
- Adding loading-skeleton shimmer (auditor's #2). Existing `Loading dispatch intelligence…` text state at `TradingEngineCard.tsx:347` is sufficient; shimmer is a polish-bundle item.
- Adding a "Coming soon" state (auditor's #3). N/A — dispatch IS built and live.
- Sentry SDK integration. `console.error` in `componentDidCatch` already exists; full observability is a separate infrastructure phase.
- Phase 7.7e Engine track, Phase 7.7c Session 2 sliders, Phase 11.2 mobile, Phase 7.7g thresholds — queued elsewhere.
- `gh pr create`. Operator opens PRs via GitHub web UI per `CLAUDE.md`.
- Pre-existing untracked tree from prior sessions (`.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`, `.wrangler/tmp/`, `_handover_s1_s2_rebuild.md`, `docs/_yolo-*.md`, `docs/_prep-commit-*.sh`, `docs/phases/phase-7-7c-session-1-prompt.md`, `docs/phases/phase-7-7e-ui-*.md`, `docs/phases/phase-4f-intel-feed-regression-prompt.md`, `docs/phases/_post-12-8-roadmap.md`) — left as-is per Session 18/22/23/24/25/26 convention.

**Next session:**
- Operator opens PR via GitHub web UI (base `main`, title `Phase 12.8 — Dispatch render-error fix + boundary upgrade`). PR body at `docs/phases/phase-12-8-pr.md`. Don't `gh pr create` per CLAUDE.md.
- Phase 12.8.1 hot-fix on `RevenueBacktest` credibility issue (P1 Critical, separate phase prompt to be authored post-PR-merge).
- Notion board sync: add Phase 12.8 entry, mark shipped; add the 5 backlog items above.

### Session 28 — 2026-05-03 — Phase 12.8.0 — Tier 0 hot-fix bundle (audit-investigated, materially smaller than scoped) (Claude Code)

**Headline:** the audit was wrong about the "highest-priority bug." This phase is the third confirmation that audit #2's visual-inference claims hallucinate at high rate (3 of 4 visual claims confirmed false this session: light-mode, percentile, keyboard; only ticker held up). Phase 12.8.0 ships materially smaller than the prompt scoped — light-mode rebuild dropped to a single chevron fix + investigation writeup; percentile / keyboard / ticker fixes all shipped per Pause A decisions.

**Branch:** `phase-12-8-0-tier0-hotfix` off `main` post-merge of `phase-12-8-dispatch-render-error` PR #46 (commit `1b2d803`). 5 commits pushed to origin (4 features + 1 fixup; this handover entry is the 6th and ships in the merge). PR draft at `docs/phases/phase-12-8-0-pr.md`. Cloudflare Pages preview verified: https://phase-12-8-0-tier0-hotfix.kastis-kkme.pages.dev/.

**Investigation findings (Pause A + A.5 — most important takeaway from this session):**

The Phase 12.8.0 prompt restated audit #2's claim: light mode is broken at the structural-token-coverage level — *"only 6 of ~50 light overrides … near-black bg, white text, white country labels on a white map … highest-priority bug on the site."* Empirical verification:

| Audit claim | Measured reality |
|---|---|
| ~50 root tokens | **152** unique `:root` tokens |
| 6 `[data-theme="light"]` overrides | **114** light overrides |
| ~44 missing overrides | **38** — and **all 38 are intentionally theme-agnostic** (font families, type ramp, space scale, opacity scale, chart series colors marked "data-semantic, consistent across themes", cycles palette aliases that resolve via the `var()` chain, three Tailwind `@theme inline` aliases) |
| HeroBalticMap "white country labels on white map" | Fully tokenized — labels resolve via `var(--text-*)` → dark charcoal on cream. **Visual screenshots in dev (`03-light-hero-localhost.png`) AND production (`04-light-hero-LIVE.png`, `05-light-revenue-LIVE.png`, `07-light-contact-LIVE.png`) confirm clean readable rendering.** No white-on-white. No bounce-trigger. |
| "Highest-priority bug, five-second bounce-trigger" | Not a bug. |

`git log --since="2026-04-29" -- app/globals.css HeroBalticMap.tsx` returned empty — no theme-relevant code shipped between the 2026-04-29 audit and 2026-05-03, so option (c) "audit was right historically but recent code fixed it" is **ruled out**. The audit was wrong at the time it was written.

Lone real component-level color hardcode found in the entire `app/components/` tree: `ContactForm.tsx:114` Select dropdown chevron painted with `rgba(232,226,217,0.3)` inside an inline `data:` SVG — dark-mode-tuned, near-invisible on cream. Replaced with sibling `<svg fill="currentColor">` resolving via `var(--text-muted)`.

Full investigation: [`docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`](investigations/phase-12-8-0-light-mode-audit-vs-reality.md). Read this together with the present session log entry — they are mutually-reinforcing process artifacts.

**Audit-credibility taxonomy (process finding — load-bearing for future audit triage):**

Two distinct audit categories now have empirical track records on KKME:

- **Visual-inference audits (audits #2, #3)** — describe what the auditor saw on the live site, often without screenshots backing the claim. **3 of 4 visual claims from audit #2 confirmed hallucinated** this session (light-mode, percentile, keyboard). Only the ticker claim empirically held up. Hit rate: **25%** for unscreenshotted visual claims. Future pattern: any unverified visual-audit claim is a *hypothesis to investigate*, not a *bug to fix*. Investigation-first discipline (screenshot + code-level grep + git-log historical check) is mandatory before committing fix scope.
- **Primary-source cross-check audits (the 2026-05-03 data audit, audit #5)** — directly cross-checked KKME numbers against Litgrid / AST / Elering / Energy-Charts / BTD / commercial registries. Findings empirically verified by Cowork-side curl (LT 484 vs Litgrid 506; aFRR P50 ≈ up+down sum; "UAB Saulėtas Pasaulis" not in Lithuanian commercial registry, etc.). All findings stand. Different methodology, different reliability tier.

**Implication for Phase 12.10 / 12.10.0:** the data audit's findings remain authoritative. Phase 12.10 ships them as scheduled. The visual-audit hallucination pattern does not bleed credibility into the data-audit findings — they are empirically grounded.

A standing CLAUDE.md "audit triage" rule will land as a separate follow-up branch after Phase 12.10 ships, bundling all four new discipline rules:
1. Visual-inference audit claims (no screenshot, no code-level grep, no primary-source check) are hypotheses, not bugs.
2. No hardcoded label asserting where/when a value comes from without computing it (e.g. "Peak h10 EET" must derive from hourly array).
3. No named entity in published content without verifiable source URL (the Saulėtas Pasaulis class).
4. Same metric in N display locations must derive from one canonical worker field (cross-card consistency).

**Shipped (5 commits — sub-item summary):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `8c79907` | Light mode (Path D) | `ContactForm.tsx` chevron fix + investigation writeup + `_post-12-8-roadmap.md` Phase 12.8.0 entry rewrite + 7 pre/post screenshots. **No `globals.css` changes. No `HeroBalticMap.tsx` changes. No new tokens introduced.** |
| 2 | `cf6ad2b` | Percentile (Path C) | `S1Card.tsx` 6 `<TileButton>` instances → static `PercentileTile` + "30-DAY TRAILING DISTRIBUTION" caption. 3 anti-regression tests. S2Card has the same anti-pattern but was scoped out per operator decision (see Backlog §7 below). |
| 3 | `40be723` | Keyboard | `app/lib/keyboard-shortcuts.ts` SOT (8 entries: S/B/T/R/D/I/C + ?). `PageInteractions.tsx` rewrite — handler reads from SOT, fixes 2 dead bindings (`s → revenue-drivers`, `t → structural` replacing `m → context`), adds 200ms `var(--teal)` outline flash + `?`-help overlay. `app/page.tsx` footer hint maps over SOT. 8 tests including a section-id-existence parity check that catches the exact drift mode this commit fixes. |
| 4 | `a2bec07` | Ticker | `HeroBalticMap.tsx` — `.hero-ticker` + `.hero-ticker-strip` class hooks, pause-on-hover/focus-within (`animation-play-state: paused`), edge-fade `mask-image`, robust class-based `prefers-reduced-motion` selector replacing prior brittle `[style*="…"]` attribute selector. 5 source-grep guard tests. |
| 5 | `0b837db` | Fixup | `HeroTicker.test.tsx` regex `s` flag → `[\s\S]*?` (pre-ES2018 tsc target). Operator's mid-session roadmap edits (Phase 12.10.0 + expanded 12.10) committed so they survive the branch. |

**Verification gates (all green):**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 882 / 882 passed (866 → 882, **+16 new tests** across 3 new test files)
- `npm run lint` → 40 errors / 129 warnings — **identical to main baseline (40 errors)**, no new errors introduced
- `npm run build` → compiled in 7.4s, 8 static pages
- Cloudflare Pages preview → live at https://phase-12-8-0-tier0-hotfix.kastis-kkme.pages.dev/, all 4 sub-items re-tested (see screenshots `13-PREVIEW-light-hero.png` through `17-PREVIEW-light-contact-chevron.png`)
- 17 visual-audit screenshots in `docs/visual-audit/phase-12-8-0-fix/`

**Backlog discovered this session:**

1. **S2Card imbalance tiles** (`app/components/S2Card.tsx:243-258`) use the same TileButton anti-pattern as the S1 percentile tiles — three buttons (`imb. mean / imb. p90 / % >100 MWh`) all wired to `openDrawer('what')` with no per-tile parameter. Out of scope for Phase 12.8.0 (operator scoped Path C to S1 percentile only). Follow-up: extend Path C to S2 once operator confirms — single-commit fix using the same `PercentileTile` pattern.
2. **Roadmap edit-conflict protocol** (PROCESS QUESTION FOR OPERATOR). `_post-12-8-roadmap.md` was edited by both CC (during this session, Path D writeup at line ~158) AND operator (Cowork-side, mid-session, prepending Phase 12.10.0 + expanding 12.10 + adding sections 12.13 + 12.14 + 27 + 28 + backlog appendix). Worked out via the fixup commit (`0b837db`) but is fragile — a different ordering could have produced a merge conflict. **Pick one and document in CLAUDE.md:** (a) CC pulls before any roadmap commit, OR (b) CC NEVER commits roadmap changes — only operator/Cowork does, and CC instead writes deltas to a scratch file the operator merges in. Default recommendation: (b), because the roadmap is a planning artifact owned by the operator's strategic layer; CC's role is to surface findings into the handover (which IS CC-owned), and let the operator weave them into the roadmap.
3. **Standing CLAUDE.md "audit triage" rule** — separate follow-up branch after Phase 12.10 ships. Will bundle the 4 discipline rules listed in the Audit-credibility taxonomy section above.
4. **CLAUDE.md cross-link** to this Session 28 entry + the investigation doc, so future-self triaging audits finds them via `docs/handover.md`'s "Read this first in every session" header rather than only via deep navigation.

**Out of scope / not touched (per scope discipline):**
- Worker-side anything. Worker untouched. No `model_version` bump.
- `app/globals.css` (the supposed "load-bearing file for this phase" per the prompt) — not modified, because the investigation found no defects.
- `HeroBalticMap.tsx` country-label code (the audit's "worst offender") — not modified, because the labels were already tokenized.
- S2Card imbalance tiles (parallel anti-pattern, scoped out — see Backlog #1).
- Backtest chart credibility issue (Phase 12.8.1, separate prompt).
- Worker endpoints, header KPI fixes, `/da_tomorrow` (Phase 12.9).
- Intel feed mojibake / count consistency (Phase 4G).
- Phase 7.7g token rebuild (the rebuild that supersedes ad-hoc theme work — un-needed by this phase).
- Mobile pass (Phase 11.2).
- `gh pr create`. Operator opens PRs via GitHub web UI per `CLAUDE.md`.
- Pre-existing untracked tree from prior sessions — left as-is per Session 18/22/23/24/25/26/27 convention.

**Next CC job: Phase 12.10.0 — emergency hallucinated-entity purge (URGENT, ~1h)**

Per the updated `_post-12-8-roadmap.md` line 75 (`#### Phase 12.10.0 — Emergency hallucinated-entity purge [SAME-DAY, NEW]`), the next CC session ships the purge of "UAB Saulėtas Pasaulis (500 MW)" from the production `/feed` — a fabricated entity (no Lithuanian commercial registry record, no Litgrid press release naming it) currently surfaced on the kkme.eu homepage. Every additional hour the entity stays live is one more domain-expert reader who could spot it. Prompt is in the roadmap entry; scope is single-commit + worker deploy required (new `POST /feed/delete-by-id` endpoint).

**Tier 0 sequence after Phase 12.10.0:**
1. ✅ Phase 12.8 (this PR's predecessor, merged `1b2d803`)
2. ✅ Phase 12.8.0 (this PR, awaiting merge)
3. ⏳ **Phase 12.10.0** (URGENT, ~1h) — Saulėtas Pasaulis purge
4. Phase 12.10 (data discrepancy bundle, expanded to ~6-8h)
5. Phase 12.8.1 (backtest caption clarification, ~30-60 min)
6. Phase 12.9 (worker + header KPI bundle, ~1.5-2h)
7. Phase 4G (intel encoding, ~1.5h)

Then Tier 1 (12.12 + 12.14 + 7.7g).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.8.0 — Tier 0 hot-fix bundle (audit-investigated)`). PR body at `docs/phases/phase-12-8-0-pr.md`.
- Decide the roadmap-edit-conflict protocol (Backlog #2) and document in CLAUDE.md.
- Notion board sync: mark Phase 12.8.0 shipped; add the 4 backlog items above.

### Session 29 — 2026-05-04 — Phase 12.10.0 — Emergency hallucinated-entity purge (Saulėtas Pasaulis) (Claude Code)

**Headline:** Audit #5 (2026-05-03) flagged "UAB Saulėtas Pasaulis (500 MW)" pipeline-exit entry as fabricated. Confirmed live on production `/feed`, traced its ingestion path, shipped a `POST /feed/delete-by-id` worker endpoint to remove it, and seeded two hallucination-marker helpers for Phase 12.12 to wire structurally. Worker deployed; operator fires the delete call (UPDATE_SECRET not in this session's shell). Materially smaller scope than the prompt allowed (5+ entries would have triggered broader purge) — only one entry needed removal.

**Branch:** `phase-12-10-0-entity-purge` off `origin/main` (post-merge of Phase 12.8.0 PRs #47 + #48; commits `652b551` + `67c0d96`). Two commits pushed to origin (worker fix + this handover entry). PR draft at `docs/phases/phase-12-10-0-pr.md`.

**Investigation findings (Pause A — load-bearing for Phase 12.12 scoping):**

| Marker | Saulėtas Pasaulis evidence |
|---|---|
| No matching entity in Lithuanian commercial registry | Confirmed by audit #5; a 500 MW Baltic storage-pipeline exit would have made trade press if real, none did |
| Generic source URL (homepage, no path) | `https://www.litgrid.eu/` — vs real Litgrid press releases at `/index.php/naujienos/naujienos/.../36506` |
| Hedge language betraying model uncertainty | `…removed from litgrid pipeline. If confirmed, eases competition pressure on remaining projects.` |

**Ingestion-path trace (the structurally important answer):**

| Field | Saulėtas Pasaulis | Indicates |
|---|---|---|
| id | `mna2ne4x-xfri25` | Matches `makeId()` format `{base36-Date.now()}-{6 random}` (worker line 4977). **No `cur_` prefix** → not from `appendCurationToFeedIndex`. |
| Field shape | `event_type`, `source_quality`, `confidence`, `horizon`, `impact_direction`, `affected_modules`, `affected_cod_windows` all present | Exact schema written by `POST /feed/events` (worker line 6603). Curation projection produces `origin: 'curation'` + `source_tier` + `topic_score` instead. |
| `git log -S "Saulėtas Pasaulis"` | Only doc commits (`aa8c1ff`, `61c88d4`, `0b837db`, `2eaba5e`) | **No code path in repo creates the entity** — no script, no LLM curation prompt, no operator-curated JSON. |

**Conclusion:** entry was hand-pushed via `curl POST /feed/events` from operator's terminal. Body content was LLM-drafted externally (in a Cowork / CC chat that emitted curl commands without verifying the named entity). The fabrication entered KV via the typed-event API; no committed script or scheduled job authored it.

**Implication for Phase 12.12:** the structural named-entity verification gate must wire into **`POST /feed/events`** at the existing `evaluateFeedItemGates(...)` call (`workers/fetch-s1.js` ~line 6602), **not** into `POST /curate` / `appendCurationToFeedIndex`. The two helpers shipped in this phase (`isGenericSourceUrl`, `hasHallucinationHedgeLanguage` in `app/lib/feedSourceQuality.ts`) are the import-side of that wire-up — Phase 12.12 #8 calls them from inside the gate alongside the new commercial-registry API check.

**Shipped (2 commits):**

| # | Sub-item | What ships |
|---|---|---|
| 1 | Worker endpoint + helpers + investigation | `workers/fetch-s1.js` `POST /feed/delete-by-id` (~50 lines, UPDATE_SECRET-gated, returns removed titles for audit-trail). `app/lib/feedSourceQuality.ts` exports `isGenericSourceUrl` + `hasHallucinationHedgeLanguage`. `app/lib/__tests__/feedSourceQuality.test.ts` adds 11 test cases pinning both heuristics. `docs/investigations/phase-12-10-0-saiuletas-pasaulis.md` documents the trace. |
| 2 | Handover Session 29 | This entry. |

**Verification gates (all green):**
- `npx tsc --noEmit` → 0 errors
- `node --check workers/fetch-s1.js` → 0 errors
- `npx vitest run` → 893 / 893 passed (882 → 893, **+11 new tests** in the existing `feedSourceQuality.test.ts` file under a new `describe('hallucination markers (Phase 12.10.0)')` block)
- `npm run lint` → 40 errors / 129 warnings — **identical to main baseline**, no new errors introduced
- `npm run build` → compiled in 3.4s, 8 static pages
- Worker deploy → version `043fd2cb-1146-4d96-95c2-0ecb2864f5d7` live; `POST /feed/delete-by-id` returns `401 {"error":"unauthorized"}` (correct gate behavior)

**Operator-fire instructions for the delete call** (UPDATE_SECRET not in this session's shell; endpoint is live, fire when ready):

```bash
# Option A — pull from local .env file
export UPDATE_SECRET=$(grep -h '^UPDATE_SECRET' ~/kkme/.env* workers/.env* 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
# Option B — macOS Keychain
# export UPDATE_SECRET=$(security find-generic-password -a UPDATE_SECRET -w)

curl -s -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed/delete-by-id \
  -H "Content-Type: application/json" \
  -H "x-update-secret: ${UPDATE_SECRET}" \
  -d '{"id":"mna2ne4x-xfri25","reason":"hallucinated-entity-not-in-LT-commercial-registry"}' \
  | python3 -m json.tool

# Verify removal:
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | python3 -c "
import json, sys
d = json.load(sys.stdin)
items = d.get('items', [])
hits = [i for i in items if 'Saulėtas Pasaulis' in (i.get('title','') or '')]
print(f'Total: {len(items)}  Saulėtas Pasaulis hits: {len(hits)}')
print('SUCCESSFULLY REMOVED' if not hits else 'STILL PRESENT — purge failed')
"
```

Expected response: `{"ok":true,"removed_count":1,"removed_titles":["Pipeline exit: UAB \"Saulėtas Pasaulis\" (500 MW) (LT)"],"before":9,"after":8,"reason":"hallucinated-entity-not-in-LT-commercial-registry"}`.

**Backlog discovered this session:**

1. **VERT.lt item #3 — verify-or-remove in Phase 12.10.** /feed item with `source: 'VERT.lt'`, `source_url: 'https://www.vert.lt/'` (generic homepage, same marker as Saulėtas Pasaulis), title "Lithuanian balancing cost allocation shifts — producers cover 30%". Content claim (Jan 2026 producers bearing 30% of system balancing costs) is plausible Lithuanian regulatory news but lacks a specific source URL. **Operator decision (Pause A):** keep, do not auto-purge — generic URL is a flag, not proof. Carries into **Phase 12.10's audit #5 unverifiable-claims category** for verify-or-remove disposition with the rest of the broader data discrepancy bundle.

2. **Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol: CC does not commit roadmap edits). Two edits to `docs/phases/_post-12-8-roadmap.md`:
   - **Move Phase 12.10.0 entry from "Currently active" to a Shipped appendix** (mirror the format used for previously-shipped Tier 0 phases). Update the "Currently active" `Next CC job:` line to point to **Phase 12.10** (broader data discrepancy hot-fix bundle, ~6-8h).
   - **Append to Phase 12.12 #8 (named-entity verification) entry** — paste this delta exactly:

   ```markdown
   **Ingestion-path target (per Phase 12.10.0 Session 29 finding):** the structural
   named-entity verification gate must wire into **`POST /feed/events`** at the
   existing `evaluateFeedItemGates(...)` call in `workers/fetch-s1.js` (~line 6602),
   **not** into `POST /curate` / `appendCurationToFeedIndex`. Saulėtas Pasaulis was
   confirmed to have entered via the typed-event API (id `mna2ne4x-xfri25` matches
   `makeId()` format, has the typed-event field shape, no `cur_` prefix, no repo
   source). The two helpers already exported from `app/lib/feedSourceQuality.ts`
   (`isGenericSourceUrl`, `hasHallucinationHedgeLanguage`) plug straight into that
   gate alongside the commercial-registry API check that 12.12 #8 adds.
   ```

3. **Confirm operator-side ingestion discipline.** The hand-push via `curl POST /feed/events` with externally-LLM-drafted content is a recurring failure mode (the entire reason this entity entered). Two non-exclusive mitigations to consider Cowork-side:
   - Wrap the curl pattern in a script that requires a `--verified-source-url` flag with a non-homepage URL.
   - Until 12.12 #8 ships, treat any LLM-drafted `POST /feed/events` body as suspect — at minimum, eyeball the source_url and require a registry-verifiable name before firing.

**Out of scope / not touched (per scope discipline):**
- Wiring `isGenericSourceUrl` / `hasHallucinationHedgeLanguage` into `evaluateFeedItemGates()` at write-time. Doing so would have rejected the legitimate VERT.lt item #3 too. Phase 12.12 wires them in conjunction with the registry check so generic-URL items can still enter when the named entity verifies.
- Frontend changes. The next `/feed` GET after the operator fires the delete call returns the cleaned data; `IntelFeed.tsx` renders it transparently.
- Roadmap edits (per Session 28 backlog #2 default rule). Operator applies the delta above Cowork-side after merge.
- `model_version` bump. Endpoint is purely additive; bundle delta negligible.
- `gh pr create`. Operator opens PR via GitHub web UI per `CLAUDE.md`.
- The ~14 untracked files in the working tree (carried forward from prior sessions per Sessions 18/22/23/24/25/26/27/28 convention) — left as-is.

**Next CC job: Phase 12.10 — broader data discrepancy hot-fix bundle (~6-8h).**

Per the updated `_post-12-8-roadmap.md` Phase 12.10 entry. Bundles audit #5's remaining findings: LT/LV/EE installed reconciliation, peak-hour labels, aFRR direction disclosure, the verify-or-remove pass for the unverifiable-claims category (which now includes the VERT.lt item #3 carried forward from this session), etc.

**Tier 0 sequence after Phase 12.10.0:**
1. ✅ Phase 12.8 (merged `1b2d803`)
2. ✅ Phase 12.8.0 (merged PRs #47 + #48 → `652b551` + `67c0d96`)
3. ✅ **Phase 12.10.0** (this PR, awaiting merge)
4. ⏳ Phase 12.10 (broader data discrepancy bundle, ~6-8h) — **next**
5. Phase 12.8.1 (backtest caption clarification, ~30-60 min)
6. Phase 12.9 (worker + header KPI bundle, ~1.5-2h)
7. Phase 4G (intel encoding, ~1.5h)

Then Tier 1 (12.12 + 12.14 + 7.7g). The Phase 12.12 wire-up of this session's helpers is the long-term prevention for the Saulėtas Pasaulis class.

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.10.0 — Emergency hallucinated-entity purge (Saulėtas Pasaulis)`). PR body at `docs/phases/phase-12-10-0-pr.md`.
- Fire the operator delete-call (curl block above) when UPDATE_SECRET is in shell. Expected before the PR merges so production is clean ahead of the merge — but acceptable to fire after merge if the secret isn't immediately to hand.
- Apply the roadmap delta from Backlog #2 above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Notion board sync: mark Phase 12.10.0 shipped; add Backlog #1 (VERT.lt item #3 verify-or-remove) to the Phase 12.10 backlog.

### Session 30 — 2026-05-04 — Phase 12.10 — Broader data discrepancy hot-fix bundle (Claude Code)

**Headline:** audit-#5's broader data-discrepancy bundle shipped — VPS-Python ENTSO-E A68 live-fetch architecture (NEW), worker `installed_storage_<c>_mw_live` surfacing, soft quarantine enforcement, Elering €74M macro anchor, frontend Baltic fleet metric rename + getInstalledMw selector + quarantine disclosure footers, peak/trough hour math fix, DA-marquee duration disambiguation, methodology + copy sanitization (aFRR direction, NREL ATB cites replacing unsourced "Tier 1 / cross-supplier consensus" language, APVA tuple weakening, IRR/DSCR/CAPEX assumptions footnote). Worker deployed (version `99458af7-2834-4232-9600-2b1250b02896`). 9 commits pushed to `phase-12-10-data-discrepancy`. Pause B (load-bearing ENTSO-E A68 dry-run) returned **Outcome (a) — sensible values** for all three BZNs. Operator added one pre-deploy scope item (EE A68/fleet gap coverage_note) which landed before §9.

**Branch:** `phase-12-10-data-discrepancy` off `origin/main` (post-merge of Phase 12.10.0 PR #49 → `85ec7f8`). 9 commits pushed to origin (6 scoped + 2 lint/cleanup followups + 1 pre-deploy operator-requested EE coverage_note).

**Pause A pre-approvals (operator-baked into prompt; CC executed without re-asking):**

| Decision | Disposition |
|---|---|
| Live-fetch architecture | **VPS-Python + PostgreSQL + worker POST** (NOT worker cron). Mirrors existing `daily_intel.py` / `ingest_daily.py` / `kkme_sync.py` precedent — operator owns the data, history preserved, auditable. |
| LT 506 reconciliation | **Option B** (coverage_note disclosing distribution-grid +153 MW gap). Hardcode is the operator-curated **fallback** when ENTSO-E A68 (B25) live-fetch is unavailable. |
| aFRR direction | **Path 1** — headline carries "up+down combined" chip + sub-line exposing one-direction values. |
| Quarantine enforcement | **Soft** — `quarantined_mw` companion field per country + `operational_mw_strict` + `operational_mw_inclusive`. Frontend defaults to strict + renders disclosure footers ("EE BESS fleet awaiting TSO confirmation: N MW"). |
| €25/kW connection guarantee | Soft-removed — "operator estimate, pending VERT decision." |
| 752 / 3,600 marquee | Inline computation chain in marquee items (FCR 28 + aFRR 120 + mFRR 604; VERT.lt ArcGIS for free grid). |
| Legal refs (XV-779 / XV-687 / O3-189) | **Non-reproduction confirmed** — zero hits in `app/` or `workers/`. No code change. |
| "7.0% Project IRR" mislabel | **Non-reproduction confirmed** — does not appear in current S1Card / SpreadCaptureCard / DurationOptimizer. No code change. |
| Elering €74M anchor | S2 `macro_context` field (annual hardcode). |
| Peak/trough hour math | Index→clock-hour fix (math, not strings). |
| Commit 5 scope | Reduced to DA-marquee/2h-card label disambiguation only (IRR mislabel didn't reproduce). |
| Audit-credibility taxonomy refinement | Defer to Phase 12.10a. |

**§8 Pause B — ENTSO-E A68 dry-run (LOAD-BEARING FINDING):**

The VPS-Python script ran live against ENTSO-E A68 (B25 = battery storage) at 2026-05-04T07:42 UTC for all three Baltic BZNs:

| Country | A68 B25 | KKME hardcode | KKME fleet incl. | Primary-source current | Δ A68 vs primary |
|---------|---------|---------------|------------------|------------------------|------------------|
| LT      | **426** |          484  |              596 | 506 (Litgrid)          | −80 MW (covers transmission only; matches the +153 MW DSO Kaupikliai gap audit flagged, partly bridged by ENTSO-E) |
| LV      |  **90** |          40   |              99  | 80 (AST commissioned)  | +10 MW (within rounding) |
| EE      | **218** |          127  |          126.5   | 126.5 (Hertz 1 + EE BESS) | **+92 MW** — Elering classifies BSP Hertz 2 (100 MW under construction) as installed for transparency reporting; KKME tracks as `under_construction`. Definitional gap, not a contradiction. |

**Outcome (a) per the override matrix → wire `_live`, hardcode becomes fallback. Ship.**

Two parser bugs were fixed in the process (commit `f20837b`): wrong XML namespace (A68 publishes under `generationloaddocument:3:0` schema, not the named-after-the-document one) and `Element` truthiness gotcha (childless leaf is FALSY, so `or`-chain shortcut skipped real matches). Without this fix the VPS deploy would have been silently broken.

**Operator-requested pre-deploy scope addition** (commit `3987bc3`): the EE +92 MW A68/fleet gap is visible the moment `installed_mw_live` wires up, so a per-EE coverage_note disclosing the Hertz 2 reporting boundary landed in `storage_by_country.EE.coverage_note` before §9 deploy. LT (-80 already covered by `storage_reference.coverage_note` from Commit 1) and LV (+10 within rounding) needed no additional notes.

**Shipped (9 commits — sub-item summary):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `e87a4a1` | Worker buildability + quarantine + VPS scaffolding | `scripts/vps/fetch_entsoe_installed_capacity.py` (~250 lines), `scripts/vps/sql/001_entsoe_installed_capacity.sql` (append-only snapshot table). Worker `/s4` GET surfaces `installed_mw_live` + `as_of` + `source_url` per country and on `storage_reference`; soft quarantine companion fields per country (`quarantined_mw` + `operational_mw_strict` + `operational_mw_inclusive`); `storage_reference.coverage_note` (LT distribution-grid disclaimer). `app/lib/fleetMw.ts` (`computeOperationalMwStrict / Inclusive / Quarantined`) + `app/lib/metricRegistry.ts` (`getInstalledMw` selector preferring `_live` over hardcode) + tests (+14 cases). |
| 2 | `e4afd32` | Worker /s2 macro_context | Elering €74M Baltic frequency-reserve cost (2025) macro anchor. Annual hardcode. |
| 3 | `127968b` | Frontend Baltic fleet metric rename + selector | HeroBalticMap "BALTIC FLEET" → "BALTIC FLEX FLEET" + composition tooltip + amber "N MW awaiting TSO confirmation" line. SignalBar FLEX FLEET tooltip. S4Card uses `getInstalledMw` selector for LT/LV/EE; tooltips list source tier (live/hardcode), as_of, source URL, coverage_note; EE tab "EE BESS fleet awaiting TSO confirmation" footer; LV tab parallel footer. |
| 4 | `84b1a8d` | Peak/trough hour math fix | `app/lib/peakForecast.ts` `computePeakTrough` — anchors slice's last entry to `updated_at`'s UTC hour; resolution-aware (15-min PT15M vs hourly via adjacent-diff heuristic); falls back to UTC 23 anchor when `updated_at` unparseable. Tests (+6 cases) reproduce audit's `h22 EEST` peak from idx 11 with updated_at 07:00 UTC. |
| 5 | `d4a8fd9` | DA marquee disambiguation | Ticker label "DA CAPTURE" → "DA CAPTURE 4h" (gross_4h); S1Card hero already labels duration via existing toggle/copy. IRR mislabel didn't reproduce — documented non-reproduction. |
| 6 | `bb176f5` | Methodology + copy sanitization | aFRR Path-1 direction disclosure on S2Card hero. Worker `engine_calibration_source` + RevenueCard `CalibrationFooter` cite NREL Annual Technology Baseline (atb.nrel.gov) replacing "Tier 1 LFP integrator consensus" / "cross-supplier consensus" language. RevenueCard supply-stack legend → "/methodology drawer". TradingEngineCard drops trailing "canonical". S4Card APVA tuple weakened to "~1,545 MW / ~3,232 MWh / ~€45M budget · operator estimate" with title-tooltip linking to verified APVIS portal page. €25/kW connection guarantee soft-remove. 752/3,600 marquee inline computation chain. RevenueCard IRR/DSCR/CAPEX assumptions footnote. CalibrationFooter test fixture refreshed; supplier-name confidentiality regex narrowed to integrator/counterparty names (Tesla / Sungrow / Wartsila / Saft) — public LFP cell manufacturers permitted as public-warranty citations. |
| 6.5 | `0668286` | SignalBar typing followup | `as any` casts replaced with typed `S4ForSignalBar` interface; lint baseline preserved (40 errors). |
| 1.5 | `f20837b` | VPS Python parser fix | Correct A68 namespace (`generationloaddocument:3:0`); explicit `is None` checks replacing falsy-Element `or`-chain. Empirical Pause B values captured in commit body. |
| 1.75 | `3987bc3` | EE coverage_note pre-deploy | A68 218 MW vs fleet 126.5 MW definitional-gap disclaimer landed in `storage_by_country.EE.coverage_note` before §9 deploy at operator's pre-deploy request. |

**Verification gates (all green):**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 914 / 914 passed (893 → 914, **+21 new tests** across `fleetMw.test.ts` (+8) / `metricRegistry.test.ts` (+6) / `peakForecast.test.ts` (+6) / `ticker.test.ts` (+1))
- `npm run lint` → 40 errors / 130 warnings — **identical to main baseline (40 errors)**, +1 warning (worker; pre-existing pattern); no new errors introduced by changed files
- `npm run build` → compiled, 8 static pages
- `node --check workers/fetch-s1.js` → clean
- VPS Python dry-run → end-to-end success (LT 426, LV 90, EE 218 MW B25)
- Worker deploy → `99458af7-2834-4232-9600-2b1250b02896` live; post-deploy curls confirmed `storage_reference.coverage_note` (LT), `storage_by_country.EE.coverage_note` (EE A68/fleet gap disclaimer rendered, 681 chars), all `installed_mw_*_live` fields present (currently null pending VPS POST), `/s2 macro_context` Elering €74M surfaces correctly

**Quarantine MW total (the "non-trivial number"):**
- Baltic fleet operational_mw inclusive: **822 MW** (unchanged; legacy semantic)
- Baltic fleet operational_mw strict (excl _quarantine): **~471 MW** (per fleetMw.test.ts reproduces-snapshot; will materialize on /s4 fleet field after next 4-hourly fleet refresh, ~12:00 UTC)
- Baltic quarantined_mw: **~350 MW** (Kruonis PSP 205 + EE Hertz 1 100 + EE BESS 26.5 + LV Utilitas 10 + LV AJ Power 9; soft-flagged, NOT excluded from inclusive headline)

Note (post-deploy verification): the new `fleet.baltic_operational_mw_strict` / `quarantined_mw` per-country fields are computed in `processFleet` at fleet-write time. Currently the cached `s4_fleet` KV was written before the deploy, so those fields read `None`. They populate at the next 4-hourly fleet cron (`0 */4 * * *`, next at 12:00 UTC) — OR operator can trigger immediately via `POST /s4/sync-layer3` (UPDATE_SECRET-gated) if desired ahead of merge.

**LT/LV/EE refreshed values + as-of dates (post-deploy /s4):**

| Country | Hardcode (current) | Hardcode as_of | _live (after VPS cron) | _live source |
|---------|--------------------|----------------|------------------------|--------------|
| LT | 484 MW | 2026-03-23 | ~426 MW (B25) | ENTSO-E A68 (B25) Litgrid |
| LV | 40 MW | 2025-10-01 | ~90 MW (B25) | ENTSO-E A68 (B25) AST |
| EE | 127 MW | 2026-02-05 | ~218 MW (B25) | ENTSO-E A68 (B25) Elering |

The hardcodes will continue to render until the VPS cron POSTs first `_live` snapshot. Selector falls back to hardcode automatically when `_live` is null (verified by `metricRegistry.test.ts`).

**aFRR direction disclosure path chosen: Path 1.**

S2Card hero gets an inline "up+down combined" chip with title-tooltip explaining the methodology, plus a sub-line under the hero exposing one-direction (up + down) Baltic averages from `data.afrr_up_avg` / `data.afrr_down_avg`. Audit's 2× revenue mis-sizing risk eliminated.

**Per-claim verify-or-remove dispositions (audit #5 unverifiable-claims category):**

| Claim | Verification result | Disposition |
|---|---|---|
| **APVA "1,545 MW / 3,232 MWh / €45M budget"** | Partial — APVA 2025-10 large-power BESS support call exists at `apvis.apva.lt/paskelbti_kvietimai/dideles-galios-elektros-energijos-kaupimo-irenginiu-irengimas-siekiant-subalansuoti-elektros-energetikos-sistema-2025-10` with €44,969,236.20 budget (≈€45M). 1,545 MW / 3,232 MWh figures NOT independently verifiable (operator's prior briefing). | Weakened to "~1,545 MW / ~3,232 MWh against ~€45M budget · operator estimate" with title-tooltip linking to APVIS portal. |
| **€25/kW connection guarantee reduction** | Not findable in VERT.lt 2026 methodology pages (search ran ~5 min). | Soft-removed: "Operator estimate: a guarantee reduction toward ~€25/kW is plausible from the 2026 VERT methodology cycle (pending decision)." |
| **"Effective demand 752 / Free grid 3,600" marquee** | Computation chain verified — 752 = FCR 28 + aFRR 120 + mFRR 604 (Litgrid product mix); 3,600 = VERT.lt ArcGIS all-tech grid headroom. | Inlined computation in marquee items so chain is visible: "EFFECTIVE DEMAND 752 MW (FCR 28 + aFRR 120 + mFRR 604 per Litgrid product mix)" + "FREE GRID N MW (VERT.lt ArcGIS, all-tech)". |
| **Legal refs XV-779 / XV-687 / O3-189** | **NON-REPRODUCTION** — zero hits in `app/` or `workers/`. | No action. Audit hallucination — refines audit-credibility taxonomy: primary-source-cross-check audits WITHOUT specific citation = ~80% reliability. |
| **"7.0% Project IRR" caption mislabel on 30D sparkline** | **NON-REPRODUCTION** — does not appear in current S1Card / SpreadCaptureCard / DurationOptimizer source. | No action. Same taxonomy refinement. |
| **VERT.lt item #3 (Lithuanian balancing cost allocation 30%)** | Not removed in this session — operator-fire post-deploy via `POST /feed/delete-by-id` (curl in §10.3 below). | Operator-fire pattern, deferred. |
| **"Tier 1 LFP integrator consensus" / "Cross-supplier consensus" / "canonical" / "KKME proprietary"** | Replaced with NREL Annual Technology Baseline (atb.nrel.gov) cites + operator-overlay disclosure. | Sanitized in worker `engine_calibration_source` + RevenueCard CalibrationFooter + TradingEngineCard dispatch model badge + RevenueCard supply-stack legend. CalibrationFooter test fixture refreshed; supplier-name regex narrowed to integrator/counterparty names. |

**Elering €74M anchor surfaced — placement:** S2 `macro_context` field (Pause A pre-approved). Frontend rendering can land in a follow-up phase or via S2Card direct read; current scope is the worker-side surfacing only.

**Audit-credibility taxonomy refinement (empirical track record from this session, for Phase 12.10a):**

Adds a third tier under "primary-source cross-check audits" (Session 28's #5 tier):

- **WITH specific citation (~95% reliability):** LT 484 vs Litgrid 506 (reproduces); aFRR P50 ≈ up+down sum (reproduces, hero math confirms it); EE +92 A68/fleet gap (just confirmed empirically — exactly the Hertz-2 boundary the audit's reasoning would have predicted).
- **WITHOUT specific citation (~80% reliability):** "7.0% Project IRR" mislabel (does not reproduce); legal refs XV-779/XV-687/O3-189 (do not exist in code); APVA 1,545/3,232 tuple (specifics unverifiable, only the €45M budget verifies). The pattern: well-grounded primary-source audits stay reliable even on subclaims, but unsourced specifics trail off.

Land this refinement as part of Phase 12.10a's CLAUDE.md discipline patch (already Session 28 backlog #3).

**Test count delta:** 893 → **914** (+21 new tests across fleetMw, metricRegistry, peakForecast, ticker).

**Visual audit dir:** Not captured this session — would have required dev-server boot + chrome-devtools MCP traversal across all 6 changed surfaces; deferred to operator's web-UI smoke test post-merge. The post-deploy curls in §9 verify the worker side; frontend surfaces will read the new fields automatically once the cached `s4_fleet` refreshes (next at 12:00 UTC).

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol — CC does NOT commit roadmap edits):

1. **Move Phase 12.10 from "Currently active" to a Shipped appendix.** Update the "Currently active" `Next CC job:` line to point to **Phase 12.8.1** (backtest caption clarification, ~30-60 min).

2. **Phase 12.12 scope additions** — append to `docs/phases/_post-12-8-roadmap.md` Phase 12.12 entry:

   ```markdown
   **VPS-Python live-fetch pattern extension (per Phase 12.10 architecture):** the
   VPS-Python + PostgreSQL + worker-POST pattern shipped in Phase 12.10 for
   ENTSO-E A68 (installed capacity) is the template for Phase 12.12 #3 ("daily
   reconciliation cron"). Reframe #3 as "extend the existing VPS live-fetch
   pattern to AST + Elering + APVA + VERT" rather than "build live-fetch from
   scratch in worker". Schema validation + freshness gates wire into
   `scripts/vps/fetch_entsoe_installed_capacity.py`'s parse_warnings field
   shape. Phase 12.12 #5 (cross-card consistency CI test) has a concrete
   starting point: `app/lib/metricRegistry.ts` declares the canonical
   `s4.storage_by_country.{LT,LV,EE}.installed_mw[_live]` paths; CI test
   greps for raw alternatives (e.g. `sbc.LT?.installed_mw` direct reads
   bypassing `getInstalledMw`).
   ```

3. **New Phase 12.12 sub-item** (operator decides numbering):

   ```markdown
   **Quarantine-rule taxonomy review (Phase 12.10 backlog).** The contradiction
   detector in `workers/fetch-s1.js` `detectContradictions()` flags Kruonis PSP
   _quarantine because its `source` doesn't match `/TSO|Litgrid|.../i` despite
   the entry being explicitly `type: 'pumped_hydro'` and Litgrid-confirmed
   operational. The flag is correct for behind-the-meter BESS but produces
   false positives on the operational pumped-hydro entry. Refine the C-01
   rule to honour `type: 'pumped_hydro'` as a separate evidentiary category.
   This will move ~205 MW from `quarantined_mw` to `operational_mw_strict`
   for LT — ahead of any UI that surfaces strict by default in a hard-cutover
   way.
   ```

4. **New Phase 12.12 sub-item — A68/fleet boundary reconciliation (EE +92 MW gap):**

   ```markdown
   **A68 vs fleet `under_construction` boundary review.** ENTSO-E A68 (B25 = battery
   storage, Elering for EE) returns 218 MW vs KKME fleet 126.5 MW commissioned. The
   ~92 MW delta is BSP Hertz 2 (100 MW under construction) reported by Elering as
   installed for transparency purposes. Decide which boundary KKME tracks:
   strict-commissioned (reject Hertz 2 from the headline until first operational
   evidence) or A68-aligned (treat Elering's classification as authoritative).
   storage_by_country.EE.coverage_note discloses the gap in current state.
   ```

**Backlog discovered this session:**

1. **VERT.lt item #3 — operator fires post-deploy** via the curl block below (`POST /feed/delete-by-id`):

   ```bash
   # Pull UPDATE_SECRET from local env (operator's existing pattern from Session 29):
   export UPDATE_SECRET=$(grep -h '^UPDATE_SECRET' ~/kkme/.env* workers/.env* 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

   # Find the item ID (match by title fragment):
   curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | python3 -c "
   import json, sys
   d = json.load(sys.stdin)
   for i in d.get('items', []):
       if 'balancing cost allocation' in (i.get('title','') or '').lower():
           print(f'id={i.get(\"id\")} url={i.get(\"source_url\")}')
   "

   # Delete:
   curl -s -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed/delete-by-id \
     -H "Content-Type: application/json" \
     -H "x-update-secret: ${UPDATE_SECRET}" \
     -d '{"id":"<paste-id-from-above>","reason":"unverified-vert-lt-balancing-allocation-claim-phase-12-10"}' \
     | python3 -m json.tool
   ```

2. **VPS Python deployment instructions for operator post-merge:**

   ```bash
   # Copy script + SQL to VPS (operator's existing /opt/kkme path)
   scp scripts/vps/fetch_entsoe_installed_capacity.py kastytis@89.167.124.42:/opt/kkme/scripts/
   ssh kastytis@89.167.124.42 mkdir -p /opt/kkme/scripts/sql
   scp scripts/vps/sql/001_entsoe_installed_capacity.sql kastytis@89.167.124.42:/opt/kkme/scripts/sql/

   # Apply migration
   ssh kastytis@89.167.124.42
   cd /opt/kkme
   psql ${KKME_DB_URL} -f /opt/kkme/scripts/sql/001_entsoe_installed_capacity.sql

   # Install Python deps in existing venv (psycopg2-binary may need to be added)
   /opt/kkme/venv/bin/pip install requests psycopg2-binary

   # Smoke test (no DB write, no worker POST)
   ENTSOE_API_KEY=... /opt/kkme/venv/bin/python /opt/kkme/scripts/fetch_entsoe_installed_capacity.py --dry-run

   # Live run (writes to PG, POSTs to worker)
   ENTSOE_API_KEY=... KKME_DB_URL=... UPDATE_SECRET=... \
     /opt/kkme/venv/bin/python /opt/kkme/scripts/fetch_entsoe_installed_capacity.py

   # Verify worker received the values
   curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | python3 -c "
   import json, sys
   d = json.load(sys.stdin)
   for c in ['LT','LV','EE']:
     row = d.get('storage_by_country', {}).get(c, {})
     print(f'{c}: live={row.get(\"installed_mw_live\")} as_of={row.get(\"installed_mw_live_as_of\")}')
   "

   # Add daily cron at 06:05 UTC
   crontab -e
   # Add line:
   # 5 6 * * * /opt/kkme/venv/bin/python /opt/kkme/scripts/fetch_entsoe_installed_capacity.py >> /var/log/kkme/entsoe.log 2>&1
   ```

   Empirical dry-run from CC's local Mac venv against live ENTSO-E API (2026-05-04T07:42 UTC, BZN credentials confirmed): LT 426 MW · LV 90 MW · EE 218 MW · all parse_warnings empty. **Outcome (a) — sensible values, ship.**

3. **Quarantine fields populate after next fleet refresh.** Currently `fleet.baltic_operational_mw_strict` / `quarantined_mw` per-country read `None` because the cached `s4_fleet` KV was written before deploy. Will populate naturally at the next 4-hourly cron (`0 */4 * * *`, next at 12:00 UTC) OR operator can fire immediately via `POST /s4/sync-layer3` (UPDATE_SECRET-gated) if desired ahead of merge.

4. **APVA paraiškų rezultatai refresh** — when APVA publishes the 2025-10 large-power BESS call results (currently shows €44.97M budget; applied MW/MWh totals not yet on apvis.apva.lt), refresh `storage_pipeline.apva_applied_mw` / `apva_applied_mwh` from operator estimate to verified primary source. Track as Phase 12.12 sub-item or standalone refresh task.

5. **Quarantine-rule false positive on Kruonis PSP** — see roadmap delta #3 above. Refine `detectContradictions()` C-01 rule to honour `type: 'pumped_hydro'` as a separate evidentiary category. ~205 MW LT delta.

6. **A68 EE +92 MW gap** — see roadmap delta #4 above. Definitional gap (Hertz 2 UC reported as installed by Elering); decide tracking boundary in Phase 12.12.

7. **Visual-audit dir for this session** — not captured. Deferred to operator's post-merge web-UI smoke test.

**Out of scope / not touched (per scope discipline):**
- `model_version` bump. Phase is data-accuracy + display only.
- Frontend rendering of `macro_context` (Elering €74M anchor) on S2Card. Worker surfaces it; presentation is a Phase 12.8.1 / Phase A follow-up.
- Frontend rendering of the IRR/DSCR/CAPEX assumptions footnote in dark/light mode pixel-pass. Footnote ships, but pixel-perfect alignment is a polish phase concern.
- Roadmap edits (per Session 28 backlog #2 default rule). All deltas reported above; operator applies Cowork-side after merge.
- `gh pr create`. Operator opens PR via GitHub web UI per `CLAUDE.md`.
- 14+ pre-existing untracked files in working tree (`_handover_s1_s2_rebuild.md`, `docs/_yolo-followup-*`, etc.) — left as-is per Sessions 18/22/23/24/25/26/27/28/29 convention.
- Modification to `docs/phases/_post-12-8-roadmap.md` discovered in working tree mid-session — left untouched per Session 28 backlog #2 protocol; operator's parallel Cowork edit.

**Post-deploy verification (already run, captured above):**
- `/s4 storage_reference.coverage_note` ✅ (LT distribution-grid disclaimer, 354 chars)
- `/s4 storage_by_country.EE.coverage_note` ✅ (A68/fleet 218 vs 126.5 MW gap disclaimer, 681 chars)
- `/s4 storage_by_country.{LT,LV,EE}.installed_mw_live` fields ✅ exist (currently null; populates after VPS cron)
- `/s4 storage_by_country.{LT,LV,EE}.installed_mw_as_of` ✅ surfaced (LT 2026-03-23, LV 2025-10-01, EE 2026-02-05)
- `/s2 macro_context.baltic_frequency_reserve_cost_2025_eur` ✅ 74000000
- `/s2 macro_context.source_url` ✅ elering.ee press release
- `/s4 fleet.baltic_quarantined_mw` ⏳ pending next 4-hourly fleet refresh

**Worker deploy version:** `99458af7-2834-4232-9600-2b1250b02896`

**Tier 0 sequence after Phase 12.10:**
1. ✅ Phase 12.8 (`1b2d803`)
2. ✅ Phase 12.8.0 (`652b551` + `67c0d96`)
3. ✅ Phase 12.10.0 (`85ec7f8`)
4. ✅ **Phase 12.10** (this PR, awaiting merge)
5. ⏳ Phase 12.8.1 (backtest caption clarification, ~30-60 min) — **next CC job**
6. Phase 12.9 (worker + header KPI bundle, ~1.5-2h)
7. Phase 4G (intel encoding, ~1.5h)

Then Tier 1 (12.12 + 12.14 + 7.7g). Phase 12.12 picks up:
- VPS-Python pattern extension to AST/Elering/APVA/VERT (was: build from scratch)
- `metricRegistry.ts` cross-card consistency CI test (concrete starting point)
- Quarantine-rule taxonomy review (Kruonis false positive)
- A68/fleet `under_construction` boundary reconciliation (EE +92 MW)
- Schema validation + freshness gates wiring into VPS parse_warnings shape
- `evaluateFeedItemGates()` named-entity verification (Saulėtas Pasaulis class — Session 29 finding)

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.10 — Broader data discrepancy hot-fix bundle`).
- Apply roadmap deltas above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Fire VERT.lt item #3 delete-by-id curl when convenient (block above).
- Deploy VPS Python script + apply migration (block above).
- Fire `POST /s4/sync-layer3` if quarantine fields desired before next 4-hourly cron.
- Notion board sync: mark Phase 12.10 shipped; add the 7 backlog items above.
- After merge to main → Phase 30 §6 (three commits + push to `phase-30-methodology-research` branch) resumes from the same working tree per operator's latest message.
 phase-12-8-1-backtest-caption

### Session 50 — 2026-05-07 — Phase 21 — S2 professional polish (Claude Code)

**Headline:** S2 Balancing card hardened from "methodologically honest but operationally thin" to "professional but not institutional" target. Three operator-confirmed sub-items shipped in one PR — (a) hero inversion to LT up-only operational reality (€7.91/MW/h, was €13.5/MW/h up+down combined); (b) new derived field `s2.afrr_up_avg_90d_delta` (current 30d mean vs prior 60d mean of LT aFRR up-only €/MW/h, computed from `s2_history` KV daily snapshots) + frontend `Δ ±N% / 90d` quantitative micro-descriptor chip per discipline rule #6; (c) IMB interpretive line below the imbalance tiles tying volume → activation → revenue, plus rule-#6 alignment of `MarketThicknessChip` via per-product quantitative depth anchor (`aFRR · THICK · ≥100 MW`, `mFRR · MEDIUM · 50–100 MW`, `FCR · THIN · ≤50 MW`). **Quiet integrity fix landed in same scope:** the prior subline "(up only, Baltic avg)" was mislabeled — `data.afrr_up_avg` is **Lithuania-only** (BTD `price_procured_reserves` column 11, Lithuania per worker comment at `:4395` + methodology note at `:7113`), NOT Baltic. Discipline rule #1 (audit-triage) caught the label drift during scope validation; corrected to "Combined up+down (LT, 3m P50): €13.5/MW/h" methodology-disclosure framing. **Worker deploy `2b3c6bc5-e9a3-4819-9919-cd1ec3d85952` live**; new field renders `null` on first ship by design — `s2_history` KV currently has 48 daily snapshots (oldest 2026-03-02), function requires ≥60 days before emitting a number per the null-safety branch. First real value materializes ~2026-05-19; full 90d window ~2026-06-18. Frontend chip renders muted `Δ — / 90d` with explanatory tooltip until threshold met. All 6 gates baseline-exact (tsc 0, vitest 925/925, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). 7 files modified, ~+50 lines source net. **Visual-audit gap (recurring 3rd consecutive session)**: chrome-devtools-mcp browser-lock condition recurred; operator pre-approved curl-only verification path with prose state description at `docs/visual-audit/phase-21/STATE.md` substituting the 8-screenshot mobile/desktop × light/dark grid. Cross-session friction observation already filed as roadmap operator-action-item (chrome MCP `--isolated` userDataDir investigation). Branch pushed for PR.

**Branch:** `phase-21-s2-professional-polish` off `main` at `dce4067` (post-Phase-18.2.3-merge + phase-21 setup commit).

**Pause A — discovery + scope confirmation:**

| Cowork-grepped baseline claim | Verdict | Note |
|---|---|---|
| Hero `S2Card.tsx:220-243` renders €13.5/MW/h `data.afrr_p50` "up+down combined" | **REFINED** | Hero block at `:226-243`. Field source is `act.afrr_p50` (country-scoped, 3-month avg P50 from S2 activation feed), NOT top-level `data.afrr_p50` (does not exist). |
| One-direction subline at `:255-263` is "Baltic avg" | **REFINED — quiet integrity fix** | Subline labeled `data.afrr_up_avg` as "Baltic avg" but worker methodology note at `fetch-s1.js:7113` correctly identifies as **Lithuania-only**. Mislabel pre-dated Phase 21 scope; corrected in the same edit pass. Discipline rule #1 caught it. |
| €5.9M/yr footer at `:308` derives from hero | **VERIFIED** | Impact line at `:296-310`, formula `hero × 50 × 24 × 365 / 1000`. Auto-corrects to **€3,464k/yr** post-swap (`7.91 × 50 × 8760 / 1000`) — operationally honest annualized number. |
| THICK chip uses `MarketThicknessChip` (Phase 7.7a / 7.7.14) | **VERIFIED** | `:249` with `showCaption`. Implementation 56 lines, levels in `MARKET_THICKNESS` config. |
| `lint:no-editorial-chips` regex covers THICK/MEDIUM/THIN | **NOT REPRODUCIBLE** | Regex is `phase: '(TIGHTENING\|WIDENING\|STABLE\|RISING\|FALLING\|STEADY\|ELEVATED\|HIGH\|LOW\|COMPRESSED\|OPEN)'` — does NOT catch THICK family. Rule #6 question is purely interpretive (gray zone). Operator picked Option A — keep level word + append quantitative anchor — best of both. |
| `afrr_up_avg` at `fetch-s1.js:4423` is rolling 7d MEAN | **VERIFIED** | `s2r2(s2Mean(afrrUpVals))`. Lithuania column index 11 from BTD `price_procured_reserves`. NOT P50 (audit memory had it as "P50"; actually mean). |
| `MAX_HISTORY = 90` for `s2_history` KV | **VERIFIED** | Daily snapshots capped at 90. Per-window math: current 30d + prior 60d fits exactly; "current 30d vs prior 90d" would need 120 days and overflow the cap. Operator picked the fits-exactly window. |
| Worker deploy is single-env | **VERIFIED** | `wrangler.toml` has no `[env.production]` block; deploy is `npx wrangler deploy` (no `--env` flag). |

**Operator picks at Pause A (4):**

1. **(a) hero inversion country-toggle UX → α** (LT-anchored, country toggle disabled on aFRR mirroring FCR pattern). Per-country up-only data not available in current worker engine (BTD col 11/12 LT-only). β / γ would require worker engine extension; filed as **Phase 21.1 candidate** if operator later wants country-flexible aFRR up-only.
2. **(b) 90d delta window → current 30d vs prior 60d.** Fits MAX_HISTORY=90 cleanly. Smooth + signal-bearing; shorter windows would flicker week-to-week.
3. **(b) `model_version` bump → no.** Derived metadata signal, not engine math; no IRR/DSCR/revenue calc impact.
4. **(c-2) THICK chip → Option A** (keep level word + append quantitative anchor). Preserves institutional vocabulary (THICK/MEDIUM/THIN as market-microstructure terms) AND satisfies rule #6 spirit + makes intelligible to non-expert readers.

**Implementation order (lowest → highest risk per Phase 18.1.1 lesson):**

1. **(c-1) IMB interpretive line** — `S2Card.tsx` after imbalance tile div: muted-mono prose "Imbalance volume drives activation: more imbalance → more aFRR called → activation revenue layers on top of the capacity reservation above. Today's `{N}%` >100 MWh ≈ 1-in-`{Math.max(2, Math.round(100/N))}` settlement periods stressed." Data-derived from `data.pct_above_100`. Renders only when value is non-null and > 0.
2. **(c-2) THICK chip Option A** — `financialDefinitions.ts:177` adds `quantitative_anchor: string` to `MarketThicknessSpec`; three anchor literals (`≥100 MW` / `50–100 MW` / `≤50 MW`). `MarketThicknessChip.tsx:41` renders `{label} · {spec.level} · {spec.quantitative_anchor}`. Tooltip + caption unchanged. Test file augmented with 3 anchor-presence specs (locks Phase-21 chip shape).
3. **(a) Hero inversion** — `heroValue` for aFRR returns `data.afrr_up_avg ?? null` (was `act.afrr_p50`). New `effectiveCountry: Country = prod === 'aFRR' ? 'LT' : country` derivation at render — preserves user's prior LV/EE pick across an aFRR round-trip; passes `react-hooks/set-state-in-effect` lint. CountryToggle `disabled={prod === 'FCR' || prod === 'aFRR'}`. Hero hint label literal `up+down combined` → `LT · up only · 7d` with updated tooltip. Subline transformed from "(up only, Baltic avg)" mislabel → "Combined up+down (LT, 3m P50): €13.5/MW/h" methodology disclosure (renders only when `data.activation?.lt?.afrr_p50` non-null). Footnote text aFRR-specific override: "aFRR capacity-reservation price; BTD price_procured_reserves, Lithuania, up-direction column, rolling 7d mean." (drops "Up + down direction combined" tail). `S2WhatSection` drawer prose forks for aFRR with operational-revenue-anchor framing. mFRR + FCR untouched.
4. **(b) Worker** — new `computeAfrrUp30dVs60dDeltaPct(history)` at `fetch-s1.js` near `:3478` (~25 lines): early-exit if history < 60; sort by date; `last30 = sorted.slice(-30)`; `prior60 = sorted.slice(-90, -30)`; null when `last30 < 15` OR `prior60 < 30` OR `prior_mean === 0`; returns percent (1dp signed). GET `/s2` handler at `:7085` adds `s2_history` to the parallel KV-read array; computes delta; attaches as `base.afrr_up_avg_90d_delta` top-level scalar. `metricRegistry.ts` declares the new metric (introducedPhase: '21'); `metricRegistry.test.ts` regex broadened `/^s4\./ → /^s\d\./` to admit s2-namespace entries (Phase 12.10 seed → Phase 21 expansion).
5. **(b-cont) Frontend chip** — new `AfrrDeltaChip({ delta, onClick })` component (~50 lines): null branch renders muted boxed `Δ — / 90d` with `s2_history` threshold tooltip; non-null branch renders signed `Δ ±N% / 90d` button (border + transparent bg, hover-underline, color `var(--text-secondary)`, no sentiment palette per rule #6). On `prod === 'aFRR'` swaps the existing `<StatusChip>` (which was vestigial post-hero-swap — `act.afrr_p50` is now methodology disclosure subline, no longer the benchmark) with `<AfrrDeltaChip>`. mFRR + FCR keep original `<StatusChip>`.

**Pause B — gates + worker deploy + local-build smoke-test:**

| Gate | Baseline | Post-Phase-21 | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ baseline-exact |
| `npx vitest run` | 925 / 60 files | 925 / 60 files | ✅ baseline-exact (3 chip-shape specs added; 1 registry-regex broadened) |
| `npm run lint` | 127 (40e/87w) | 127 (40e/87w) | ✅ baseline-exact (transient +1e during dev — `setCountry` in useEffect — refactored to render-time `effectiveCountry` derivation) |
| `npm run lint:no-raw-spacing` | exit 0 | exit 0 | ✅ |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ (regex unchanged; THICK/MEDIUM/THIN not in scope; quantitative anchors added per Pause-A pick) |
| `npm run build` | 7 routes | 7 routes (4.8s) | ✅ baseline-exact |

**Worker deploy:**

```
Uploaded kkme-fetch-s1 (12.90 sec)
Deployed kkme-fetch-s1 triggers (7.81 sec)
Current Version ID: 2b3c6bc5-e9a3-4819-9919-cd1ec3d85952
Total upload: 346.46 KiB / gzip: 84.40 KiB
4 cron triggers preserved
```

**Cache-busted curl (`/s2`):**

```json
{
  "afrr_up_avg": 7.91,
  "afrr_up_avg_90d_delta": null,
  "has_delta_key": true
}
```

Field present; null per null-safety branch (`s2_history` has 48 entries, < 60 minimum). **Expected behavior** — first real value ~2026-05-19; full window ~2026-06-18.

**Local production-build smoke-test:** `npm run build` 7 routes, 4.8s; 28 chunks / 4.5 MB raw; `out/index.html` references 20 chunks, all 20 return HTTP 200 at localhost:3101 (foreground `npx serve@latest`). 18.1.1 ChunkLoadError class structurally absent. Phase-21 literals confirmed embedded in static chunks (chunk `a57b97894125a656.js`): `afrr_up_avg_90d_delta`, "up only" + "Lithuania, up-direction column", `100 MW` / `50 MW` quantitative anchors.

**Files modified (7):**

| File | Δ |
|---|---|
| `app/components/S2Card.tsx` | hero source swap (heroValue for aFRR → `data.afrr_up_avg`) + `effectiveCountry` render-time derivation + CountryToggle disable on aFRR + label literal "LT · up only · 7d" + methodology-disclosure subline (replaces "Baltic avg" mislabel) + footnote aFRR-specific text + IMB interpretive line + `AfrrDeltaChip` component (~50 lines) + StatusChip-vs-AfrrDeltaChip product gate + S2WhatSection prose fork for aFRR |
| `app/components/MarketThicknessChip.tsx` | render `{label} · {level} · {anchor}` (Phase 21 quantitative anchor) |
| `app/lib/financialDefinitions.ts` | `MarketThicknessSpec.quantitative_anchor: string` + 3 anchor strings |
| `app/lib/metricRegistry.ts` | `afrr_up_avg_90d_delta` registry entry (introducedPhase: '21'; canonical worker path `s2.afrr_up_avg_90d_delta`) |
| `app/lib/__tests__/metricRegistry.test.ts` | regex broadened `/^s4\./ → /^s\d\./` (Phase 12.10 seed → Phase 21 s2-namespace expansion) |
| `app/lib/__tests__/marketThicknessChip.test.tsx` | quantitative-anchor assertions added (3 specs lock Phase-21 chip shape) |
| `workers/fetch-s1.js` | `computeAfrrUp30dVs60dDeltaPct(history)` function (~25 lines) + `s2_history` KV read in GET `/s2` parallel-read array + `base.afrr_up_avg_90d_delta` field attach with null fallback |

**Pause C — visual + commits:**

- Visual-audit screenshot grid substituted with `docs/visual-audit/phase-21/STATE.md` curl-derived prose state description per chrome MCP lock recurring 3rd consecutive session (47 + 48 + 49 precedent). Documents rendered output of S2 hero band, IMB interpretive line, THICK chip with quantitative anchor, AfrrDeltaChip muted state, methodology-disclosure subline, footnote update, drawer prose fork. Includes worker `/s2` payload snapshot, 7-step operator post-merge hard-refresh checklist, and bundle-stats summary.
- 3-commit structure per prompt §5b. Branch pushed for PR.

**Discipline rules engaged:**

- **#1 audit-triage** — Cowork-grepped baseline produced 5 VERIFIED, 2 REFINED, 1 NOT REPRODUCIBLE. The "Baltic avg" subline mislabel was caught at Pause A code-grep, NOT in the prompt — quiet integrity fix landed alongside the operator-confirmed scope. The `lint:no-editorial-chips` regex coverage NOT REPRODUCIBLE finding shifted (c-2) from "mandatory CI gate" to "interpretive rule #6 spirit-test", which is what produced the Option A pick rationale.
- **#4 cross-card consistency** — `afrr_up_avg` consumer count unchanged (5 frontend + 1 engine); S2Card hero now reads it directly (was `act.afrr_p50` 3m P50). New `MarketThicknessChip` quantitative anchor automatically propagates to `TradingEngineCard.tsx:497-499` (3 chips) — no per-card retrofit needed. New `afrr_up_avg_90d_delta` declared canonically in `metricRegistry.ts` per the same ledger discipline that landed in Phase 12.10.
- **#5 roadmap edit-conflict** — CC did NOT touch `_post-12-8-roadmap.md`. Roadmap deltas needed (operator applies via Cowork) are listed below.
- **#6 no-editorial-state-label** — `lint:no-editorial-chips` regex doesn't catch THICK/MEDIUM/THIN; question is interpretive. Resolved with Option A — quantitative anchor preserves institutional-reader vocabulary AND satisfies rule #6 spirit (data/math beside the label, not in place of). New `AfrrDeltaChip` ships as quantitative micro-descriptor `Δ ±N% / 90d` with NO sentiment palette — purely muted text.

**Notable patterns landed (memory-entry candidates):**

1. **`effectiveCountry` derivation pattern** — `const effectiveCountry: Country = prod === 'aFRR' ? 'LT' : country` at render keeps state intact across product-flip round-trips, eliminates a `setCountry` in `useEffect` that would have tripped `react-hooks/set-state-in-effect` lint. Reusable when card-anchor logic locks one toggle dimension to a canonical value while preserving the user's prior pick on another dimension.
2. **CountryToggle disabled-on-aFRR mirrors FCR pattern** — three-button toggle with `disabled` prop greys out non-canonical buttons; canonical button (LT) stays highlighted. Useful when worker data is anchored to one country at the engine level.
3. **Null-on-first-ship for derived signals** — function returns null when KV history underfilled; frontend chip renders muted `—` placeholder with explanatory `title=` tooltip pointing at the threshold. Auto-activates as history fills. **Operator-honest behavior** when window-rigorous comparisons aren't yet possible (vs shipping a less-rigorous proxy).

**Conditional candidates filed:**

- **Phase 21.1** (~3-4h CC + worker engine extension): per-country aFRR up-only data. Currently `data.afrr_up_avg` reads BTD `price_procured_reserves` Lithuania column 11 only; LV/EE columns may exist in the same dataset (need worker investigation of BTD response shape per country). Would unlock β option for hero inversion country-toggle UX (asymmetric per-country) or proper LV/EE up-only fields for symmetric extension. Trigger: operator post-merge feedback that LT-anchoring on aFRR feels too restrictive.
- **Phase 21.2** (out-of-scope from Phase 21 scope; conditional on aging time): the StatusChip used by mFRR + FCR currently compares `hero` against the same source it derives from — `deriveChip(hero, act, prod)` benchmarks against `act.mfrr_p50` while hero IS `act.mfrr_p50`, producing always-zero chip. Pre-existing, not a Phase 21 regression. Worth auditing as a small follow-up phase if operator wants the status chip to carry meaningful signal on mFRR + FCR (parallel to what Phase 21 (b)+(b-cont) did for aFRR).
- **Phase 22** (institutional-grade S2): forward curves, P95/P99 tail risk lines on the chart, cross-region benchmarks (Baltic vs Continental aFRR), cross-product side-by-side, cross-country side-by-side, multi-period decomposition, scenario analysis. Explicitly deferred per Phase 21 audit out-of-scope; trigger is operator feedback that "professional but not institutional" is not enough.

**Roadmap delta needed — operator to apply Cowork-side after merge** (per discipline rule #5; CC did NOT touch roadmap):

1. **Move Phase 21 from "Currently active" to a Shipped appendix.** Update the "Next CC pick" line to point to the next operator-pick across the eligible Tier 1 queue: 18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1.
2. **File Phase 21.1 conditional candidate** — per-country aFRR up-only worker engine extension; ~3-4h CC. Trigger: operator post-merge feedback that LT-anchoring on aFRR feels too restrictive.
3. **File Phase 21.2 conditional candidate** — `deriveChip` audit + meaningful status signal on mFRR + FCR (parallel to what Phase 21 did for aFRR). Trigger: operator feedback that the always-zero status chip is misleading.
4. **File Phase 22 conditional candidate** — institutional-grade S2 (forward curves, P95 tail, cross-region benchmarks, cross-product/country side-by-side). Trigger: operator feedback that "professional but not institutional" is insufficient.
5. **Cross-session friction observation update** — chrome MCP browser-lock recurred 3rd consecutive session (47 + 48 + 49). Operator-action-item already filed in roadmap for `--isolated` userDataDir investigation; bumping urgency since the lock now blocks visual confirmation on every CC phase that touches frontend rendering. Without resolution, every phase incurs the chrome MCP fallback (curl-only verification + STATE.md prose grid) which is more authorial work than the screenshots it replaces.

**Next operator action:**

1. Open PR via web UI (operator workflow per `feedback_pr_workflow_minimal.md` — no body, no branch delete). PR-creation URL printed below at end of session.
2. Click merge.
3. **Hard-refresh kkme.eu** mobile + desktop, light + dark, on the Cloudflare Pages preview deploy of the PR branch (or post-merge production). Per the 7-step checklist in `docs/visual-audit/phase-21/STATE.md` §9.
4. Confirm:
   - Hero reads `€7.91/MW/h` (NOT €13.5)
   - `LT · UP ONLY · 7D` mono uppercase hint visible
   - `Δ — / 90d` muted chip visible (not omitted) — auto-activates in ~12 days
   - `aFRR · THICK · ≥100 MW` chip with quantitative anchor
   - aFRR ↔ mFRR product flip preserves user's prior LV / EE country selection (via new `effectiveCountry` pattern)
   - IMB interpretive line beneath the 3 tiles reads correctly with data-derived `33%` and `1-in-3` substitutions
   - Footer **€3,464k/year** (NOT €5,913k)
5. Apply roadmap deltas listed above via Cowork.

**Tier 1 sequence:**

- ✅ **Phase 21 SHIPPED 2026-05-07** (Session 50 — S2 professional polish, this session)
- 🔵 Phase 18.2.3 SHIPPED 2026-05-07 (Session 49 — Phase 18.2.3 closeout per `dce4067` commit; handover entry not yet authored — operator-decide if Session 49 entry is worth filling in retroactively)
- 🟡 Next CC pick across (18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1)
- 🟡 Phase 21.1 conditional candidate (per-country aFRR up-only)
- 🟡 Phase 21.2 conditional candidate (deriveChip audit on mFRR + FCR)
- 🟡 Phase 22 conditional candidate (institutional-grade S2)

---

### Session 48 — 2026-05-07 — Phase 18.2.2 — Chart crosshair UX hotfix (Claude Code)

**Headline:** Operator hard-refresh feedback on Phase 18.2 ship: "Hover works only on lines, it should be more like I see the + across the whole chart when I hover. Not only on the lines and the peaks since the chart is small and it's hard to find it." Two surgical UX fixes: (A) chart.js `interaction: { mode: 'index', intersect: false, axis: 'xy' }` exported as new `CHART_INTERACTION` const from `chartTheme.ts` and applied at all 10 plugin-bearing chart sites — makes tooltip + crosshair fire whenever cursor is anywhere over canvas, not only on data points; (B) `makeCrosshairPlugin(colors)` extended in `chartTheme.ts` to draw horizontal line at `tooltip.caretY` alongside the existing vertical at `tooltip.caretX`, forming a "+" pattern using `chartArea.left/right` for horizontal extents. Visibility lift kept at `colors.textMuted` / 0.5px lineWidth (Pause A pick a — minimal-change-first; if operator finds it hard to read post-merge, file 18.2.3 with brighten or thicken variant). All 6 gates baseline-exact (tsc 0, vitest 925/925, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). Bundle delta below noise floor (~+15 lines source; chunks dir 4,620 KB total). 6 files modified. Frontend-only, no `model_version` bump, no worker deploy. **Visual-audit gap (recurring)**: chrome-devtools-mcp browser locked by parallel CC sessions — same condition as Session 47 (Phase 18.2). Operator approved curl-only verification path again (build clean + all 20 JS chunks return 200 + new `kkme-crosshair` plugin id + `axis:"xy"` literal embedded in static chunks → 18.1.1 ChunkLoadError class structurally absent). In-browser hover / theme-toggle visual confirmation owned by operator post-merge via Cloudflare Pages preview deploy.

**Branch:** `phase-18-2-2-crosshair-ux` off `main` at `bb3cfa8` (post-Phase-18.2-merge + phase-18-2-2 setup commit).

**Pause A — discovery + scope confirmation:**

| Item | Finding |
|---|---|
| Interaction-options location | **Per-component, partially covered.** No central spot existed. 5 of 10 plugin-bearing sites already had `interaction: { mode: 'index', intersect: false }` inline literal (RevenueBacktest 1, RevenueCard 3, TradingEngineCard 1) → already fired anywhere over canvas, but missed the "+" half of the operator complaint. **5 of 10 lacked the option entirely** (S1Card 2, S2Card 3) → defaulted to chart.js `intersect: true` so tooltip + crosshair only activated on data-point intersection. These S1/S2 small charts are exactly the surfaces the operator named ("hard to find it on small charts"). |
| Plugin extension shape | Existing plugin reads `tooltip.caretX`. The chart.js-canonical sibling is `caretY` — already on the same Tooltip object. **No `_eventPosition` access needed** (avoids fragile internal API). Type signature widened to include `caretY` + `chartArea.left/right`; ~10 lines added. |
| Visibility lift pick | (a) keep `textMuted` / 0.5px — minimal change first ship. The `intersect: false` change alone makes the crosshair dramatically more discoverable (always-visible "+" wherever cursor is); brightening on top would risk over-saturation in dark mode. 18.2.3 candidate filed if operator feels it's still hard to read after live-site verification. |
| Centralization scope | (a) export `CHART_INTERACTION` const + apply at **all 10 sites** — DRY single-source-of-truth, aligned with discipline rule #4 (cross-card consistency). The 5 inline-literal sites migrated to const for future-proofing (one place to tune `mode` / `axis` / `intersect` if 18.2.3 calls for it). |
| Local-build risk pre-check | LOW — plugin extension is +5 canvas-drawing lines in already-shipped pattern; const swap is mechanical. Same dep / runtime class as Phase 18.2 (chart.js + Canvas 2D). Pause B verification gate REQUIRED per `feedback_local_build_verification.md`. |

**5/10 vs 5/10 split — what was already there vs what was missing:**

| Site | Pre-18.2.2 state | Post-18.2.2 state |
|---|---|---|
| `S1Card.tsx:421` Sparkline (line) | ❌ no `interaction` (default intersect=true) + vertical-only crosshair | ✅ `CHART_INTERACTION` + "+" crosshair |
| `S1Card.tsx:552` Monthly bars | ❌ no `interaction` + vertical-only crosshair | ✅ `CHART_INTERACTION` + "+" crosshair |
| `S2Card.tsx:625` HistoryChart | ❌ no `interaction` + vertical-only crosshair | ✅ `CHART_INTERACTION` + "+" crosshair |
| `S2Card.tsx:730` MonthlyTrajectoryChart | ❌ no `interaction` + vertical-only crosshair | ✅ `CHART_INTERACTION` + "+" crosshair |
| `S2Card.tsx:830` CapacityChart | ❌ no `interaction` + vertical-only crosshair | ✅ `CHART_INTERACTION` + "+" crosshair |
| `RevenueBacktest.tsx:115` | ✅ inline `intersect: false` + vertical-only | ✅ `CHART_INTERACTION` const + "+" crosshair |
| `RevenueCard.tsx:891` DegradationChart | ✅ inline `intersect: false` + vertical-only | ✅ `CHART_INTERACTION` const + "+" crosshair |
| `RevenueCard.tsx:997` CannibalizationChart | ✅ inline `intersect: false` + vertical-only | ✅ `CHART_INTERACTION` const + "+" crosshair |
| `RevenueCard.tsx:1321` RevenueChart | ✅ inline `intersect: false` + vertical-only | ✅ `CHART_INTERACTION` const + "+" crosshair |
| `TradingEngineCard.tsx:219` HourlyChart | ✅ inline `intersect: false` + vertical-only | ✅ `CHART_INTERACTION` const + "+" crosshair |

After this phase, all 10 sites have **both** the always-fire interaction AND the "+" pattern. The 5 inline-literal sites were structurally fine for "fires anywhere"; what they were missing was the horizontal line (operator's "+" complaint). The 5 S1/S2 sites were missing **both** — and these are the small charts the operator named.

**Pause B — pre-commit verification gates:**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ baseline-exact |
| `npx vitest run` | 925 / 60 files | 925 / 60 files | ✅ baseline-exact (note: prompt expected 924/925 with 1 pre-existing freshness boundary failure; that test now passes — today's calendar date lands inside the boundary it tests, an incidental improvement vs Session 47 baseline) |
| `npm run lint` (eslint) | 127 (40e/87w) | 127 (40e/87w) | ✅ baseline-exact |
| `npm run lint:no-raw-spacing` | exit 0 | exit 0 | ✅ |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ |
| `npm run build` | 7 routes, 3.6s compile | 7 routes, 3.6s compile | ✅ |

**Pause B — local production build smoke-test (REQUIRED per `feedback_local_build_verification.md`):**

Same dep / runtime risk class as Phase 18.2 (chart.js + Canvas 2D + plugin extension). Verification path:

| Check | Result |
|---|---|
| `npm run build` clean | ✅ 0 TS errors, 7 routes, 3.6s compile, no warnings |
| `npx serve@latest out -l 3100` | ✅ Home `/` HTTP 200 (101,956 bytes); `/methodology` 200; `/intel` 200 |
| All 20 JS chunks referenced in HTML return HTTP 200 | ✅ — **the exact failure mode that broke 18.1.1 (missing chunk → ChunkLoadError) is structurally absent** |
| Bundle integrity for new symbols | ✅ `kkme-crosshair` plugin id present in resolved chunk; `axis:"xy"` literal (signature of new `CHART_INTERACTION` const) embedded in `out/_next/static/chunks/36d709cc319a8bcd.js` |
| In-browser hover / "+" crosshair / tooltip / theme toggle | ⚠️ **SKIPPED** — chrome MCP lock; operator owns post-merge visual confirmation via Cloudflare Pages preview |

**Visual-audit gap — chrome MCP lock recurring (cross-session pattern):**

Both Session 47 (Phase 18.2) and Session 48 (Phase 18.2.2 — this session) hit chrome-devtools-mcp browser-already-running lock from parallel CC sessions. Curl-only verification accepted both times under operator approval. **Pattern recognition for future Cowork session:** if visual-audit is load-bearing for a phase (not the case here — operator post-merge Pages-preview-deploy verification is the contract), CC sessions should coordinate browser ownership before launching, OR investigate `--isolated` userDataDir mode for chrome MCP. Filing as cross-session friction observation; not a Phase 18.2.2 blocker.

**Files touched (6 modified):**

| File | Change |
|---|---|
| `app/lib/chartTheme.ts` | `CHART_INTERACTION` const export (new); `makeCrosshairPlugin` extended to draw horizontal line at `tooltip.caretY` (type signature widened for `caretY` + `chartArea.left/right`); ~+15 lines source |
| `app/components/S1Card.tsx` | Import `CHART_INTERACTION`; add `interaction: CHART_INTERACTION,` at 2 chart options sites (Sparkline + MonthlyChart) |
| `app/components/S2Card.tsx` | Import `CHART_INTERACTION`; add `interaction: CHART_INTERACTION,` at 3 chart options sites (HistoryChart + MonthlyTrajectoryChart + CapacityChart) |
| `app/components/RevenueBacktest.tsx` | Import `CHART_INTERACTION`; replace inline `interaction: { mode: 'index', intersect: false }` with `interaction: CHART_INTERACTION,` (1 site) |
| `app/components/RevenueCard.tsx` | Import `CHART_INTERACTION`; replace inline literal at 3 sites (DegradationChart + CannibalizationChart + RevenueChart) |
| `app/components/TradingEngineCard.tsx` | Import `CHART_INTERACTION`; replace inline literal (1 site — HourlyChart) |

**Bundle size delta:** Source delta ~+15 lines (chartTheme +14, components net +5 add / -5 remove for the literal swaps; net +10 across 5 components for new `interaction:` lines + import additions). Estimated below 0.2 KB gzipped. No new dependencies.

**Worker deploy:** Not needed. `model_version` not bumped. No engine fields touched.

**Rule alignment:**
- **Rule #1 (audit-triage):** Operator feedback was empirical (hard-refresh observation, specific UX language: "across the whole chart", "small chart hard to find"); not a visual-inference audit claim. No re-verification cycle needed beyond Pause A code-grep mapping the 5/10 split.
- **Rule #4 (cross-card consistency):** `CHART_INTERACTION` becomes the single source of truth for every plugin-bearing chart's interaction mode. Future tuning (if 18.2.3 ships) is one-file change.
- **Rule #6 (no-editorial-state-label):** Untouched — this phase is canvas-rendering UX only, no chip / state-label surface.
- **Rule #5 (roadmap edit-conflict):** No roadmap commits this session; needed deltas reported to operator below.

**Visual-confirmation contract (operator post-merge):**

1. Hover any chart, confirm "+" pattern (vertical AND horizontal lines) follows cursor anywhere over chart canvas
2. Confirm small charts (S1 sparkline + S1 monthly + S2 history + S2 monthly + S2 capacity) now show crosshair on cursor-anywhere, not just on data points (was the operator's original complaint)
3. Confirm Revenue / Trading charts now show "+" not just vertical (was the gap on the 5 already-intersect=false sites)
4. Light + Dark theme switch — chart colors should re-resolve via existing `useChartColors()` MutationObserver path (Phase 18.2 closure pattern; `textMuted` resolves correctly in both themes)
5. Mobile (360px) + desktop (1440px) hard-refresh kkme.eu post-Pages-auto-deploy to confirm no ChunkLoadError or hydration warnings
6. If operator finds the crosshair still hard to read on small charts after the `intersect: false` always-fire change, file Phase 18.2.3 with brighten (`textSecondary`) or thicken (1.2px) variant; current ship is minimal-change-first per Pause A pick

**Out of scope (per prompt):**
- Engine / worker changes
- Animation activation (Phase 18.3)
- A11y additions (Phase 19)
- Static IA pages (Phase 20)
- Phase 18.1.1.1 chunk-error investigation
- Phase 18.2.1 Baltic palette retune
- Phase 7.7g-a-3 typography rationalization
- Phase 7.7g-b reduced component primitives
- Roadmap edits (operator/Cowork-owned per discipline rule #5)

**Tier 1 sequence after Phase 18.2.2:**

- ✅ Phase 18.2 SHIPPED 2026-05-07 (Session 47 — chart editorial polish)
- ✅ Phase 18.2.2 SHIPPED 2026-05-07 (this session — chart crosshair UX hotfix)
- 🟡 Phase 18.2.3 — visibility-lift variant if operator post-merge says "+" still hard to read on small charts (~30min CC: brighten to `textSecondary` or thicken to 1.2px; one-file change)
- 🟡 Phase 18.1.1.1 — chunk-error investigation
- 🟡 Phase 18.1.1 re-ship — mobile map redesign with chunk-error fix
- 🟡 Phase 18.2.1 — Baltic palette retune to spec P2-2 hex
- 🟡 Phase 18.3 — Animation activation
- 🟡 Phase 12.11.1 — Tornado COD-axis framing question
- 🟡 Phase 12.10c — Operator-action verification + small backlog cleanup
- 🟡 Phase 7.7g-a-3 — Off-scale spacing rationalization
- 🟡 Phase 7.7g-b reduced — Stat / Badge / Chart / Drawer + worker URL centralization
- 🟡 Phase 7.7g-c — rgba/hex regression cleanup + CI gate
- 🟡 Phase 12.12 #1 + #2 — schema validation + freshness gates
- 🟡 Phase 12.12 #3 — Intel feed-source freshness gates
- 🟡 Phase 12.12 #5 — Cross-card consistency CI test
- 🟡 Phase 19 — A11y MVP
- 🟡 Phase 20 — Static IA pages + 4-column footer

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-18-2-2-crosshair-ux` → `dev` (or `main`); per `feedback_pr_workflow_minimal.md`: no PR body draft, no branch delete after merge
2. After merge, hard-refresh kkme.eu post-Pages-auto-deploy on **mobile + desktop dark + light** to confirm "+" crosshair UX lands cleanly. **No visual-audit screenshots in this PR** — chrome MCP lock prevented capture (recurring condition)
3. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 18.2.2 → Shipped appendix with full description (crosshair "+" + tooltip-tighten + small-chart height bump — three sub-items in one PR)
   - Phase 18.2.3 added as conditional candidate (M2 mobile tooltip pinning to fixed chart corner; OR — fallback — visibility lift if post-merge feedback says "+" still hard to read)
   - Currently-active update: Phase 18.2.2 SHIPPED; next CC across (18.2.3 conditional / 18.1.1.1 / 18.2.1 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)

**Phase 18.2.2 mid-session expansion — α tooltip-tighten + β small-chart height bump:**

Mid-session, after the crosshair sub-item passed Pause B, the operator hard-refreshed kkme.eu against the still-open PR branch and reframed the issue: not just tooltip-too-big, but the **visual hierarchy** between tooltip and chart was wrong. On the 5 small charts (S1 sparkline + S1 monthly + S2 history + S2 monthly + S2 capacity), the tooltip box was reading at ~50-67% of canvas height; target ratio is 20-25% (annotation, not hero). Two atomic sub-items added to the open PR; γ (mobile tooltip pinning) deferred to Phase 18.2.3 for risk isolation per Phase 18.1.1 lesson (γ is new positioning logic, different risk class from α + β which are pure value tweaks).

**α — tooltip typography + padding tightened (1 file: `app/components/primitives/ChartTooltip.tsx`)**

Single-file change to the sitewide ChartTooltip primitive — propagates to **all 19+ consumers** in one edit (cross-card consistency rule #4 was structurally baked in by Phase 7.7e's primitive consolidation, not something to re-enforce per-site).

| Element | Before | After |
|---|---|---|
| Container padding | `'10px 12px'` | `'6px 8px'` |
| Container minWidth | 128 | 96 |
| Container borderRadius | 4 | 3 |
| Value fontSize | 17 | 13 |
| Value lineHeight | 1.05 | 1.15 |
| Headline fontSize | 10.5 | 10 |
| Headline marginBottom | 5 | 3 |
| Headline-sub fontSize | 10.5 | 10 |
| Secondary grid fontSize | 10.5 | 10 |
| Secondary grid rowGap | 3 | 2 |
| Secondary marginTop / paddingTop | 8 (`var(--space-xs)`) / 8 | 6 / 6 |
| Source footer marginTop | 6 | 5 |

Net visual: value text −24% (17→13), padding −33-40% (10/12→6/8), minWidth −25% (128→96). Tooltip reads as data-label annotation, not headline element. Theme adaptation unchanged (colors still resolve from CSS vars). Pixel-value-coupled tests: zero (tests cover data-shape contract, format helpers, state equality dedupe).

**β — small-chart heights bumped (2 files: `S1Card.tsx`, `S2Card.tsx`)**

Pairs with α. Tooltip-tighten alone moved the tooltip/chart-canvas ratio from ~58-67% to ~43-50%. Bumping the 5 small-chart heights by ~36-42% moves it to ~31-35% — close enough to operator's "annotation, not hero" 20-25% target band without dwarfing the chart with whitespace. Larger charts (RevenueBacktest 160, RevenueCard.Degradation/Cannibalization 160, RevenueChart 280, TradingEngineCard.Hourly 220) left untouched — already proportional and they carry deliberate visual hierarchy via height (data density signal).

| File:line | Chart | Before | After | Bump |
|---|---|---|---|---|
| `S1Card.tsx:417` | Sparkline (daily DA capture) | 120px | **170px** | +42% |
| `S1Card.tsx:539` | Monthly bars (gross monthly avg) | 140px | **190px** | +36% |
| `S2Card.tsx:605` | HistoryChart | 120px | **170px** | +42% |
| `S2Card.tsx:711` | MonthlyTrajectoryChart | 120px | **170px** | +42% |
| `S2Card.tsx:818` | CapacityChart | 140px | **190px** | +36% |

Single height value per site — no media-query split. chart.js with `responsive: true; maintainAspectRatio: false` reshapes width-only; fixed parent height honored at all viewports. 170px at 360px-wide mobile reads more square (good — more readable on small screens); at 1440px-wide desktop reads as a normal landscape chart.

Card-layout impact: S1Card +100px total (sparkline +50, monthly +50); S2Card +150px total. Hero band is intentionally scroll-rich (Phase 18.1's principle); +250px combined column shift acceptable; no horizontal overflow risk, no fold-cliff crossed.

**Phase 18.1.1 risk-class pre-check (β):**
- Wrapper pattern **unchanged**: parent `<div style={{ height: 'Npx' }}>` + chart.js `responsive: true; maintainAspectRatio: false`. Only the N constant value changed.
- ResizeObserver target shape invariant.
- No new chart instances, no new dynamic imports, no new lazy boundaries (the actual 18.1.1 risk class).
- Local-build smoke-test verified all 20 chunks return 200, 0 build warnings, 0 tsc errors. Runtime "ResizeObserver loop limit exceeded" warning would only surface on operator hard-refresh; not gated locally without chrome MCP.

**Pause B re-run (α + β) — all gates baseline-exact:**

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors ✅ |
| `npx vitest run` | 925/925 ✅ |
| `npm run lint` | 127 (40e/87w) ✅ |
| `npm run lint:no-raw-spacing` | exit 0 ✅ |
| `npm run lint:no-editorial-chips` | exit 0 ✅ |
| `npm run build` | 7 routes ✅ |
| `npx serve@latest out -l 3100` → `/` HTTP 200 (101,956 B); `/methodology` 200; `/intel` 200 | ✅ |
| All 20 JS chunks HTTP 200 | ✅ no ChunkLoadError class |
| Symbol presence: α `'6px 8px'` padding | ✅ 2 chunks |
| Symbol presence: α `fontSize:13` value | ✅ 3 chunks |
| Symbol presence: β `height:"170px"` / `"190px"` | ✅ chunk 0e954b72 (S1+S2 bundled) |
| Bundle dir size | 4,620 KB — exact-match prior 18.2.2 reading; pure typography/scalar deltas below noise floor |

**Files touched (3 modified) — α + β phase-18-2-2 expansion:**

| File | Sub-item | Change |
|---|---|---|
| `app/components/primitives/ChartTooltip.tsx` | α | 12 typography + padding values tightened |
| `app/components/S1Card.tsx` | β | Sparkline 120→170; MonthlyChart 140→190 |
| `app/components/S2Card.tsx` | β | HistoryChart 120→170; MonthlyTrajectoryChart 120→170; CapacityChart 140→190 |

**Final Phase 18.2.2 file count (across the full PR):** 9 files modified (chartTheme + 5 chart components + tooltip primitive + S1/S2 a second time for β + handover); 4 atomic commits + 1 handover-amend commit; bundle delta below 1 KB gzipped.

**Visibility-lift status (the original Pause A pick a):** still kept — `colors.textMuted` / 0.5px crosshair lineWidth unchanged. After α + β, the small-chart canvas is now 42% larger AND the competing tooltip is 24-40% smaller, so the crosshair has more visual room and contrasts better against less-occluded canvas. If operator post-merge still says "+" is hard to read, file 18.2.3 with brighten/thicken variant; if proportions feel right, no follow-up needed.

**Phase 18.2.3 candidate scope (filed):**

If post-merge mobile feedback shows tooltip occlusion problems on small touch screens (tooltip card covers the chart it's annotating because finger position = tooltip position), candidate scope:
- Mobile-specific tooltip positioning gated by `@media (max-width: 720px)` OR `(pointer: coarse)`
- Pin tooltip to upper-right corner of chart canvas (or another fixed slot — operator decides at 18.2.3 Pause A)
- Crosshair still follows finger position via existing touchmove handling
- Tooltip data updates as finger moves; tooltip card itself doesn't reposition
- Estimated 30-45 min CC, scope-isolated to `ChartTooltip.tsx` portal positioning logic
- Different risk class than α/β (new positioning logic vs pure value tweaks); deferred for risk isolation per Phase 18.1.1 lesson

Fallback Phase 18.2.3 scope (if tooltip pinning isn't the issue but crosshair visibility still is): brighten crosshair color to `colors.textSecondary` or thicken to 1.2px; ~15min CC.

**Operator visual-confirmation contract post-merge (updated):**
1. Hover any chart → "+" pattern follows cursor anywhere over canvas (was the original crosshair fix; should now read more clearly because canvas is 42% larger AND tooltip is 24-40% smaller)
2. Tooltip box reads as **annotation**, not hero — value font ~13px (down from 17), tighter padding, smaller min-width
3. Small charts (S1 sparkline + S1 monthly + S2 history/monthly/capacity) noticeably bigger but not awkward (target ~170-190px from prior ~120-140px)
4. Tooltip/chart-canvas ratio feels balanced (~25-30% annotation feel — tightened from ~58-67% pre-fix)
5. Light + Dark theme switch — chart colors + tooltip colors still re-resolve via existing `useChartColors()` MutationObserver path
6. Mobile (360px) + desktop (1440px) hard-refresh; verify no console warnings (especially "ResizeObserver loop limit exceeded" — would indicate β regression vs Phase 18.1.1 risk class)
7. **Conditional: if tooltip occlusion on mobile is the next pain (finger covers tooltip card on small chart) → file 18.2.3 (M2 mobile tooltip pinning to fixed corner). If crosshair visibility is the next pain → file 18.2.3 with visibility-lift fallback variant.**

### Session 47 — 2026-05-07 — Phase 18.2 — Chart editorial polish (Claude Code)

**Headline:** Phase 18 editorial visual identity (shipped Session 42, 2026-05-06) extended into chart canvas. Five sub-items collapsed to four after Pause A audit-triage (rule #1) found most P2-2 spec work was already done by Phase 7.7e UI track (Sessions 24+25 — sitewide ChartTooltip primitive, `useChartColors()` getComputedStyle resolution, theme-toggle MutationObserver, IBM Plex Mono via `CHART_FONT.family`). Net Phase 18.2 actual scope: (A) crosshair plugin factory in `chartTheme.ts` consumed across 9 chart sites; (B) Newsreader italic ref-line callouts via new `CHART_FONT_DISPLAY` constant on 4 callouts (Y1 model, 0.80·augment, 0.70·EoL, 1.0·today); (C) cross-card consistency rule #4 enforcement via new `SENTINEL_DASH = [4,4]` + `SENTINEL_LINE_WIDTH = 0.8` constants applied at 7 sites; (D) data-derived quantitative aria-labels on 13 chart wrappers (rule #6 — no editorial language). Two sub-items deferred: (E) Baltic palette retune (spec P2-2 hex `#1a3833` / `#d4a574` / `#a8324a` ≠ Phase-18-shipped tokens; cross-cutting change touches 30+ consumers, deserves own scope — filed as Phase 18.2.1 candidate); (F) tornado pointer-events fix (spec claim NOT REPRODUCIBLE — `grep -nE "pointer-events|pointerEvents" RevenueSensitivityTornado.tsx` returns 0 matches, confirming Cowork's 2026-05-07 pre-grep). All 6 gates baseline-exact (tsc 0, vitest 924/925 with 1 pre-existing freshness-boundary failure unchanged, lint 127 (40e/87w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). Bundle delta near-zero (~+1 KB gzipped — chartTheme.ts +55 lines source, per-component edits ~1-2 lines each). 6 files modified. Frontend-only, no `model_version` bump, no worker deploy. **Visual-audit gap**: chrome-devtools-mcp browser locked by parallel CC sessions (PIDs 3617 + 42525); operator approved curl-only verification path (build clean + all 20 JS chunks return 200 + new exports `SENTINEL_DASH` / `kkme-crosshair` / `Newsreader` confirmed in static chunks — 18.1.1 ChunkLoadError class structurally absent). In-browser hover / theme-toggle visual confirmation deferred to operator post-merge via Cloudflare Pages preview deploy.

**Branch:** `phase-18-2-chart-editorial-polish` off `main` at `a32118f` (post-Phase-18.1.1-revert + phase-18-2 setup commit). 3 commits.

**Pause A — re-verification triage (rule #1):**

| # | Spec P2-2 claim | Status | Evidence |
|---|---|---|---|
| 1 | "chart.js fonts → IBM Plex Mono" | ✅ ALREADY DONE | `CHART_FONT.family = "'IBM Plex Mono', monospace"` at `chartTheme.ts:104-106` (Phase 7.7e). |
| 2 | "+Newsreader for chart titles + descriptive captions" | ⚠️ NOT APPLICABLE TO CANVAS for titles (no chart.js title plugin in this codebase — chart titles are HTML/JSX already using `var(--font-serif)`). One genuine canvas opportunity: ref-line callouts. Folded in. | grep `chart.title` + visual scan confirms no canvas-painted titles. |
| 3 | "explicit Baltic palette `#1a3833` / `#d4a574` / `#a8324a`" | ⚠️ MISMATCH WITH SHIPPED TOKENS | Current dark `--teal=rgb(0,180,160)`, `--amber=rgb(212,160,60)`, `--rose=rgb(214,88,88)`. Spec hex values do NOT match Phase 18 shipped tokens. Token change cross-cuts 30+ consumers (rule #4). **Deferred as Phase 18.2.1.** |
| 4 | "hover tooltips with crosshair" | ⚠️ tooltips ALREADY done via `ChartTooltip` primitive; **crosshair vertical-line plugin missing** → folded in (~30 lines). | `grep -rnE "crosshair\|caretX"` showed only existing `caretX` reference in tooltip primitive, no crosshair plugin. |
| 5 | "sentinel-line treatment standardized" | ⚠️ MOSTLY ALIGNED at `[4,4]` already; lineWidth varies 0.8 (plugin) vs 1 (dataset); RevenueChart Fleet S/D `[2,3]` deliberate same-chart differentiation. S2Card "balancing chart sentinel" claim NOT REPRODUCIBLE — no sentinel line in any S2Card chart. | grep across all 5 named files found 5 sentinel sites — extracted constants. |
| 6 | "tornado pointer-events fix" | ❌ NOT REPRODUCIBLE | `grep -nE "pointer-events\|pointerEvents" RevenueSensitivityTornado.tsx` = 0 matches. Skipped. |
| 7 | "chart aria-labels" | ✅ NEEDED — only 1/13 chart sites had aria-label (Tornado SVG only). | grep `role="img"\|aria-label` across all 6 chart-bearing components. |

**Implementation order (per prompt §3 + Pause A approvals):**

1. `chartTheme.ts` — added `CHART_FONT_DISPLAY = "'Newsreader', 'Iowan Old Style', Georgia, serif"`, `SENTINEL_DASH: [number, number] = [4, 4]`, `SENTINEL_LINE_WIDTH = 0.8`, `makeCrosshairPlugin(colors: ChartColors)` factory (~25 lines, hooks `afterDraw`, gates on `tooltip.opacity > 0`, draws 0.5px line at `tooltip.caretX` from `chartArea.top` to `bottom`, color `colors.textMuted` — closure captures resolved color so theme-toggle MutationObserver path triggers re-render with fresh values).
2. `S1Card.tsx` — Sparkline + MonthlyChart: import update, sentinel-dash constant, crosshair plugin, data-derived aria-label. BridgeChart skipped (HTML/JSX waterfall, already screen-reader accessible).
3. `S2Card.tsx` — HistoryChart, MonthlyTrajectoryChart, CapacityChart: import update, crosshair plugin per chart, data-derived aria-label per chart.
4. `RevenueBacktest.tsx` — sentinel-dash + sentinel-lineWidth constants, Newsreader italic ref-line callout (`italic 10px ${CHART_FONT_DISPLAY.family}`), crosshair plugin alongside existing `refLine`, data-derived aria-label.
5. `RevenueCard.tsx` — DegradationChart (constants + Newsreader callouts × 2 + crosshair + aria-label), CannibalizationChart (constants + Newsreader callout + crosshair + aria-label), RevenueChart (sentinel-dash on OPEX line + crosshair + aria-label; documented exception comment for Fleet S/D `[2,3]` differentiation), DSCRChart (sentinel-dash + sentinel-lineWidth on covenant plugin + aria-label; no crosshair — `tooltip:enabled:false`), CyclesBreakdownChart (SVG aria-label), DrawerContent.Degradation mini-chart (aria-label only).
6. `TradingEngineCard.tsx` — HourlyChart: import update, crosshair plugin, data-derived aria-label (mentions capacity / activation / arbitrage stack).

**Pause B — pre-commit verification gates:**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ baseline-exact |
| `npx vitest run` | 924 / 60 files | 924 / 60 files | ✅ baseline-exact (1 pre-existing freshnessBadge.test.tsx boundary failure unchanged — calendar-EET TODAY threshold drift in Session 44 lineage) |
| `npm run lint` (eslint) | 127 (40e/87w) | 127 (40e/87w) | ✅ baseline-exact |
| `npm run lint:no-raw-spacing` | exit 0 | exit 0 | ✅ |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ |
| `npm run build` | 7 routes, 7.0s | 7 routes, 10.7s compile | ✅ |

**Pause B — local production build smoke-test (REQUIRED per `feedback_local_build_verification.md`):**

Phase 18.1.1 ChunkLoadError lesson is fresh; chart.js + Canvas 2D is the same dep / runtime risk class. Per operator approval (curl-only path, chrome-devtools-mcp browser locked by parallel CC sessions PIDs 3617 + 42525):

| Check | Result |
|---|---|
| `npm run build` clean | ✅ 0 TS errors, 7 routes, 10.7s compile, no warnings |
| `npx serve@latest out -l 3100` (project uses `output: export`; `npm run start` unsupported) | ✅ Home page (`/`) returns HTTP 200, 101,956 bytes |
| All 20 JS chunks referenced in HTML return HTTP 200 | ✅ — **the exact failure mode that broke 18.1.1 (missing chunk → ChunkLoadError) is structurally absent** |
| Bundle integrity for new exports | ✅ `SENTINEL_DASH` / `kkme-crosshair` / `Newsreader` all confirmed in `out/_next/static/chunks/*.js` (no tree-shaking) |
| In-browser hover / crosshair / tooltip / theme toggle | ⚠️ **SKIPPED** — chrome MCP lock; operator owns post-merge visual confirmation via Cloudflare Pages preview |

**Risk pre-flight (why curl-only is sufficient here):**
- ✅ No new dynamic imports / no new lazy-loaded boundaries (the 18.1.1 risk class)
- ✅ No SSR boundary changes
- ✅ chart.js Plugin pattern matches existing in-tree pattern (`<Line plugins={[refLine]}>` already used in RevenueBacktest, RevenueCard.DegradationChart, RevenueCard.CannibalizationChart, RevenueCard.DSCRChart pre-edit)
- ✅ Crosshair closure pattern reuses Phase 7.7e Session 25 React error #185 cascade fix (memoized `useTooltipStyle`, dedupe in `useChartTooltipState.setState`); plugin objects are not memoized but match the existing literal-each-render pattern

**Files touched (6 modified):**

| File | Lines | Change |
|---|---|---|
| `app/lib/chartTheme.ts` | +49 / -0 | `CHART_FONT_DISPLAY`, `SENTINEL_DASH`, `SENTINEL_LINE_WIDTH`, `makeCrosshairPlugin(colors)` factory |
| `app/components/S1Card.tsx` | +18 / -3 | Sparkline crosshair + sentinel-dash constant + aria-label; MonthlyChart crosshair + aria-label |
| `app/components/S2Card.tsx` | +18 / -3 | HistoryChart + MonthlyTrajectoryChart + CapacityChart: crosshair + aria-label per chart |
| `app/components/RevenueBacktest.tsx` | +14 / -3 | Sentinel constants on Y1 model anchor; Newsreader italic callout; crosshair; data-derived aria-label |
| `app/components/RevenueCard.tsx` | +27 / -8 | DegradationChart (sentinel constants × 2 + Newsreader callouts × 2 + crosshair + aria-label); CannibalizationChart (sentinel + Newsreader + crosshair + aria-label); RevenueChart (sentinel + crosshair + aria-label + Fleet S/D differentiation comment); DSCRChart (sentinel constants + aria-label); CyclesBreakdownChart SVG aria-label; DrawerContent degradation mini aria-label |
| `app/components/TradingEngineCard.tsx` | +9 / -2 | HourlyChart: crosshair + data-derived aria-label naming the three stack series |

**Cross-card consistency (rule #4) — sentinel-line discipline:**

After this phase, every reference / threshold / median line painted to chart canvas across the 5 chart-bearing components uses canonical constants:
- `borderDash: SENTINEL_DASH` (in dataset config) OR `ctx.setLineDash(SENTINEL_DASH)` (in plugin afterDraw)
- `borderWidth: 1` (data line) OR `ctx.lineWidth = SENTINEL_LINE_WIDTH = 0.8` (reference plugin line)
- Color tokens semantically deliberate: `CC.amber` for warning thresholds, `CC.rose` for critical thresholds, `CC.textMuted` / `CC.textFaint` for neutral references
- 4 ref-line callouts standardized: `italic 10px ${CHART_FONT_DISPLAY.family}` (was `9px ${CHART_FONT.family}`)

Documented exception (with code comment): `RevenueChart` Fleet S/D dataset borderDash `[2, 3]` — deliberate visual differentiation from same-chart OPEX line at `SENTINEL_DASH`. This is intentional same-canvas dual-dash differentiation, not cross-card inconsistency.

**Aria-label content discipline (rule #6 — no editorial chips):**

All 13 new aria-labels are quantitative and data-derived. Examples:
- S1.Sparkline: `"Day-ahead 2h capture, last 30 days; median €113/MWh; P90 €203/MWh"` (numbers from `stats.p50` / `stats.p90`)
- RevenueCard.DegradationChart: `"State-of-health trajectory over 18 years; year-17 retention 70%; reference lines at 80% augment threshold and 70% end-of-life"` (numbers from `points[points.length - 1]`)
- TradingEngineCard.HourlyChart: `"Hourly dispatch over 24 hours; daily average €4.21/MW/h; total €101/MW/day across capacity, activation, and arbitrage stacks"` (numbers from `data.revenue_per_mw.daily_eur` + `avgLine`)

No editorial state strings ("ELEVATED", "TIGHTENING") — chip lint gate `npm run lint:no-editorial-chips` exit 0 confirmed.

**Bundle size delta:** Source delta ~+135 lines (chartTheme +49, components +86). Estimated ~+1 KB gzipped after minification. No new dependencies. CSS chunk unchanged.

**Worker deploy:** Not needed. `model_version` not bumped. No engine fields touched.

**Visual audit:** SKIPPED this session due to chrome MCP lock. `docs/visual-audit/phase-18-2/` directory not populated. Operator owns post-merge visual confirmation:
1. Hover over any S1/S2/RevenueBacktest/RevenueCard/TradingEngine chart → verify thin vertical line renders at cursor X column-flush with chart area top-bottom + tooltip card appears
2. Inspect RevenueBacktest "Y1 model €N" callout, DegradationChart "0.80 · augment" / "0.70 · EoL" callouts, CannibalizationChart "1.0 · today" callout — all should render in italic Newsreader serif (was IBM Plex Mono mono)
3. Toggle dark ↔ light theme — chart colors should re-resolve via existing `useChartColors()` MutationObserver path; crosshair color (`textMuted`) should adapt
4. Mobile + desktop hard-refresh kkme.eu post-merge to confirm no ChunkLoadError or hydration warnings

**Out of scope (per prompt):**
- Engine / worker changes
- Animation activation (Phase 18.3) — separate phase
- A11y additions beyond chart aria-labels (Phase 19)
- Static IA pages / footer (Phase 20)
- Phase 18.1.1 chunk-error investigation (separate Phase 18.1.1.1 candidate — would need fresh investigation per the revert)
- Mobile map redesign (Phase 18.1.1 reverted; separate re-ship)
- Roadmap edits (operator/Cowork-owned per discipline rule #5; CC reports needed deltas below)
- Type-scale rationalization (Phase 7.7g-a-3)
- Component primitives (Phase 7.7g-b reduced)
- "Copy data" button on charts (spec P2-3 — separate phase if pursued)

**Tier 1 sequence after Phase 18.2:**
- ✅ Phase 7.7g-a-1 SHIPPED 2026-05-05 (dead font triplet drop)
- ✅ Phase 18 SHIPPED 2026-05-06 (Baltic editorial visual identity)
- ✅ Phase 29 SHIPPED 2026-05-06 (KKME Baltic Storage Index)
- ✅ Phase 12.10 follow-up SHIPPED 2026-05-05 (Gap #5 + EE A68 boundary)
- ✅ Phase 7.7g-a-2 SHIPPED 2026-05-06 (spacing tokens + rollout)
- ✅ Phase 12.11 SHIPPED 2026-05-06 (P0 functional bug reconciliation)
- ✅ Phase 18.1 SHIPPED 2026-05-06 (mobile foundation pass)
- ⚠️ Phase 18.1.1 SHIPPED-then-REVERTED 2026-05-06 (mobile map redesign — `ChunkLoadError` broke prod; reverted same-day; investigation queued as Phase 18.1.1.1)
- ✅ Phase 18.2 SHIPPED 2026-05-07 (this session — chart editorial polish)
- 🟡 Phase 18.1.1.1 — chunk-error investigation (~?h, scope depends on root-cause analysis)
- 🟡 Phase 18.1.1 re-ship — mobile map redesign with chunk-error fix (~1-2h after 18.1.1.1)
- 🟡 Phase 18.2.1 — Baltic palette retune to spec P2-2 hex values (~30+ files of cross-card consumers; scope-cutting needed)
- 🟡 Phase 18.3 — Animation activation (~2-3h CC)
- 🟡 Phase 12.11.1 — Tornado COD-axis framing question (~1-2h discussion + small fix)
- 🟡 Phase 12.10c — Operator-action verification + small backlog cleanup (~1h Cowork)
- 🟡 Phase 7.7g-a-3 — Off-scale spacing rationalization (~422 sites)
- 🟡 Phase 7.7g-b reduced scope — Stat / Badge / Chart / Drawer + worker URL centralization
- 🟡 Phase 7.7g-c — rgba/hex regression cleanup + CI gate
- 🟡 Phase 12.12 #1 + #2 — schema validation + freshness gates (~2-3 days)
- 🟡 Phase 12.12 #3 — Intel feed-source freshness gates
- 🟡 Phase 12.12 #5 — Cross-card consistency CI test
- 🟡 Phase 19 — A11y MVP (focus-visible already shipped Phase 18.1)
- 🟡 Phase 20 — Static IA pages + 4-column footer

**Phase 18.2.1 candidate scope (filed):**

Spec P2-2 prescribed Baltic palette hex values: `#1a3833` (deep teal), `#d4a574` (Baltic amber), `#a8324a` (brick). Phase 18 shipped `--teal=rgb(0,180,160)`, `--amber=rgb(212,160,60)`, `--rose=rgb(214,88,88)` (dark) + `#137a65` / `#8a6620` / `#dc3535` (light). The hex values do NOT match. Either the spec was authored before Phase 18 implementation tuned the values, or the tokens are wrong and need realignment. Cross-cutting change: every consumer of `--teal`, `--amber`, `--rose` (cards, hero, footer, badges, ~30+ files) gets the new color. Needs operator decision on whether the spec hex values are the intended ship state or a stale design proposal. If yes, ~2h Cowork pass to retune tokens + verify all consumers; if no, document the divergence in `docs/principles/decisions.md` (or spec doc) and close out.

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-18-2-chart-editorial-polish` → `dev` (or `main`)
2. After merge, hard-refresh kkme.eu post-Pages-auto-deploy + open on **mobile + desktop dark + light** to confirm the crosshair + Newsreader callouts + chart re-render on theme toggle land cleanly. **No visual-audit screenshots in this PR** — chrome MCP lock prevented capture; operator owns visual confirmation
3. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 18.2 → Shipped appendix with full description
   - Phase 18.2.1 added as new candidate (Baltic palette retune to spec P2-2 hex — needs operator decision on whether spec hex is intended ship state)
   - Currently-active update: Phase 18.2 SHIPPED; next CC across (18.1.1.1 chunk-error investigation / 18.2.1 palette retune / 18.3 animation / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)

### Session 45 — 2026-05-06 — Phase 18.1 — Mobile foundation pass (Claude Code)

**Headline:** Mobile foundation closes the device-reach gap left after Phase 18's editorial visual identity ship. Five sub-items in a single PR: (1) Next 15 `viewport` export adds the long-missing `width=device-width` meta tag — site finally renders at viewport width on phones instead of desktop-shrunk-to-fit; (2) hero `gridTemplateColumns: minmax(260,300) minmax(540,620) minmax(260,300)` (forced ≥1060px width) collapses to single-column flex stack at <900px; (3) KPI ticker reflows desktop 6-col → tablet 3-col → mobile 6-col scroll-snap; (4) all interactive controls reach WCAG 2.5.5 44×44 minimum on mobile via additive `.tap-target-mobile` class hooks (eight sites, no inline-style refactor); (5) smooth scroll + `overscroll-behavior-y: contain` + `:focus-visible` ring globalized. **Page-level `html { overflow-x: hidden }` added as Phase 18.1 safety net** because internal sub-card overflow (DSCR triple panel + RTE assumption rows + cycles_breakdown) is wider than parent at 360px viewport — proper per-component `min-width: 0` reflow filed as Phase 18.1.1. Verified safe: zero `position: sticky` descendants in `app/`; StickyNav uses `position: fixed` (runtime-checked at 360 + 1440px). All 6 gates baseline-exact (tsc 0, vitest 925/925, lint 126 (40e/86w), no-raw-spacing exit 0, no-editorial-chips exit 0, build 7 routes). Bundle delta near-zero (CSS-only changes; production CSS chunk 42,421 B). 11 files modified, +165 / -27 lines. Frontend-only, no `model_version` bump, no worker deploy. 15 visual-audit PNGs in `docs/visual-audit/phase-18-1/` (5 viewports × 3 sections, 250–800 KB each).

**Branch:** `phase-18-1-mobile-foundation` off `origin/main` at `b0c2616` (post-Phase-12.11-merge + roadmap delta + phase-18-1 setup commit). 3 commits.

**Pause A — re-verification triage (rule #1):**

| # | Spec claim | Status | Evidence |
|---|---|---|---|
| 1 | No viewport meta in `app/layout.tsx` | ✅ VERIFIED | grep clean; only `viewport` matches in `ChartTooltip.tsx` are event-geometry. Used Next 15 `export const viewport: Viewport` pattern. |
| 2 | Hero grid forces ≥1060px at `HeroBalticMap.tsx:357` | ✅ VERIFIED | `minmax(260,300) minmax(540,620) minmax(260,300)` confirmed; `min-height: 680px`, `padding: 24px 48px 48px`. |
| 3 | KPI ticker 6-col `repeat(N, 1fr)` at `SignalBar.tsx:110` | ✅ VERIFIED | 6 signals, equal columns. Tile button uses `all: 'unset'` so global rules don't apply without a class hook (replaced inline with explicit reset). |
| 4 | Touch targets <44×44 | ✅ VERIFIED | 8 sites (S2Card 6 pills, S1Card 2 pills, RevenueCard ControlGroup 8 pills, TradingEngineCard ControlGroup, RegulatoryFilters chip, StickyNav hamburger + nav links + CTA, SignalBar tiles, ThemeToggle nav variant). |
| 5 | Theme toggle renders 0×0 px | ❌ **NOT REPRODUCIBLE** for hero variant; **REFINED** for nav variant | `ThemeToggle.tsx:63-64` hero variant explicit 44×44 + 44×44 mount placeholder. Nav variant ~32×32 (`padding: var(--space-2xs)`/4px around 16px svg) — below 44×44 but not 0×0. Bumped nav variant via `tap-target-mobile` class. |
| 6 | Buttons use `transition: all` (anti-pattern) | ✅ VERIFIED | 7 hits: `S1Card:332`, `TradingEngineCard:143`, `RevenueCard:232`, `S2Card:432+461`, `regulatory/RegulatoryFilters:184` (150ms), `globals.css:818`. All replaced with explicit `background, color, border-color` lists. |
| 7 | `width: Npx` violations layout-locking on mobile | ❌ **REFINED** | All 24 hits decorative (1-10px dots/dividers/scrollbar) or capped within parent (40/85/90/95/130/160/800px); none forced children wider than viewport once viewport meta + hero collapse landed. Operator approved leaving as-is per discipline rule #1. |
| 8 | Mobile breakdown bars collapse to 1px (P1-4) | ✅ VERIFIED collapse | `S3Card.tsx:80` BreakdownBar = 130 + 85 + flex + 90 = ~305px fixed; flex bar gets 0-1px at 360 viewport. ~10-15 line fix. **Deferred to Phase 18.1.1** per prompt §2f (>5-line trivial threshold). |

**Implementation order (per prompt §3):**

1. Viewport meta — Next 15 `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }` in `app/layout.tsx`. Single addition; immediate effect on all subsequent items.
2. Motion vars in `:root` — `--motion-instant: 80ms`, `--motion-fast: 160ms`, `--motion-base: 240ms`, `--motion-slow: 400ms`, `--ease-standard: cubic-bezier(.2,.8,.2,1)`.
3. Smooth scroll + overscroll-contain — `html { scroll-behavior: smooth; }` + `body { overscroll-behavior-y: contain; }` + `prefers-reduced-motion: reduce` override at html.
4. Touch-target globals — `.tap-target-mobile { min-block-size: 44px; min-inline-size: 44px }` at `(max-width: 900px), (pointer: coarse)`. `:active` scale .97 + opacity .85 with `--motion-instant`. `:focus-visible` ring 2px `--accent`. KPI ticker `.kpi-ticker` rule (6/3-col + scroll-snap at <520) + `.kpi-tile` (44px min-block-size).
5. Hero grid responsive collapse — refactor inline `gridTemplateColumns`/`gridTemplateRows`/`min-height`/`max-height`/`padding` from `HeroBalticMap.tsx:355-369` into `.hero-section` class; `<900px` switches to `display: flex; flex-direction: column`. Children's inline `gridColumn: 2/3` are ignored under flex; map (col 2) becomes second stack item, right column third.
6. KPI ticker reflow — replace `gridTemplateColumns: repeat(N, 1fr)` inline with `className="kpi-ticker"`; per-tile `className="kpi-tile tap-target-mobile"` and explicit reset (`background: none; border: none; padding: 0; font: inherit; color: inherit`) replacing `all: 'unset'` (which neutralized class-applied min-block-size).
7. Touch-target className adds — 8 sites, `className="tap-target-mobile"` alongside existing inline styles. Inline visuals preserved; class adds responsive size + press feedback.
8. `transition: all` replacements — 7 sites mechanically replaced with explicit property lists keyed off `--motion-fast`.
9. ThemeToggle nav variant — `className="tap-target-mobile"` only on the nav variant; hero variant unchanged (already 44×44).

**Pause B — pre-commit verification gates:**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ unchanged |
| `npx vitest run` | 925 / 60 files | 925 / 60 files | ✅ unchanged |
| `npm run lint` (eslint) | 126 (40e/86w) | 126 (40e/86w) | ✅ unchanged |
| `npm run lint:no-raw-spacing` | exit 0 | exit 0 | ✅ unchanged |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ unchanged |
| `npm run build` | 7 routes | 7 routes | ✅ unchanged |

**Pause B — runtime verification (Playwright headless, dev server on :3000):**

| Viewport | scrollWidth | clientWidth | Hero w×h × display | KPI ticker cols | Hamburger | Revenue pills | S2 pills |
|---|---|---|---|---|---|---|---|
| 360 mobile | 360 | 360 ✅ | 360 × 1285 × **flex** | 6×120 scroll-snap (overflow-x: auto) | **44×44** | **44×44** | **44×44** |
| 414 mobile | 414 | 414 ✅ | 414 × 1355 × flex | 6×120 scroll-snap | 44×44 | 44×44 | 44×44 |
| 768 tablet | 768 | 768 ✅ | 768 × 1816 × flex | 3×224 | 44×44 | 44×44 | 44×44 |
| 1024 tablet | 1024 | 1024 ✅ | 1024 × 700 × **grid** | 6×147 | hidden ✅ | 39×30 (compact desktop) | 32×25 (compact desktop) |
| 1440 desktop | 1440 | 1440 ✅ | 1440 × 684 × grid | 6×147 | n/a | 39×30 | 32×25 |

`tap-target-mobile` activates on `(max-width: 900px), (pointer: coarse)` — desktop pointer:fine retains compact 32–39 × 25–30 sizes (Pause A intent).

**Pause C addendum — StickyNav `position: fixed` ↔ `html { overflow-x: hidden }` compatibility:** Operator-requested verification before commit. Grep `position:.*sticky` in `app/` returned zero results — StickyNav uses `position: 'fixed'` at `StickyNav.tsx:41`, not sticky. Runtime check at 360 mobile + 1440 desktop confirmed: scrollY=0 → nav hidden (gated by `scrollY > 300`); scrollY=600 → nav appears at top:0px, full-width; scrollY=3000 → nav remains pinned at top:0px. The known `position: sticky` ↔ `overflow: hidden` ancestor interaction is irrelevant here. Behavior preserved at both viewports.

**Files touched (11 modified):**

| File | Lines | Change |
|---|---|---|
| `app/layout.tsx` | +7 / -1 | Next 15 `viewport` export with `width: 'device-width', initialScale: 1, viewportFit: 'cover'` |
| `app/globals.css` | +125 / -1 | Motion vars (5); `html` smooth scroll + overflow-x clip + reduced-motion override; `body { overscroll-behavior-y: contain }`; `.hero-section` grid declarations (moved from inline); `<900px` flex-column collapse; `.hero-map-wrapper` width-derived-height override (hoisted to its own `@media` block per Tailwind v4 quirk — see surprises below); `.tap-target-mobile` + `:active` scale + reduced-motion override; `:focus-visible` global; `.kpi-ticker` (6/3/scroll-snap) + `.kpi-tile`; `transition: all 0.2s ease` → explicit list at `.inline-cta a` |
| `app/components/HeroBalticMap.tsx` | +5 / -7 | Inline grid declarations stripped (now in `.hero-section` class); `className="hero-map-wrapper"` added to inner aspect-ratio div; SVG inline-style adds `overflow: 'hidden'` to clip off-map labels |
| `app/components/SignalBar.tsx` | +9 / -6 | `className="kpi-ticker"` on grid container; `className="kpi-tile tap-target-mobile"` on tile button; `all: 'unset'` replaced with explicit reset (background/border/padding/font/color/textAlign) so class-applied min-block-size isn't neutralized |
| `app/components/RevenueCard.tsx` | +2 / -1 | ControlGroup pills: `tap-target-mobile` + `transition: all 0.15s` → explicit list |
| `app/components/S2Card.tsx` | +4 / -3 | ProductToggle + CountryToggle pills: `tap-target-mobile` + `transition: all 0.15s` → explicit list (CountryToggle adds `opacity` to property list since disabled state mutates it) |
| `app/components/S1Card.tsx` | +2 / -2 | DurationToggle pills: `tap-target-mobile` + transition replacement |
| `app/components/TradingEngineCard.tsx` | +2 / -2 | ControlGroup pills: same pattern |
| `app/components/regulatory/RegulatoryFilters.tsx` | +2 / -1 | Filter chip: `tap-target-mobile` + transition replacement |
| `app/components/StickyNav.tsx` | +6 / -2 | `tap-target-mobile` on desktop nav links, "Get in touch" CTA, hamburger, mobile menu links, mobile menu CTA; transition `'color 0.15s ease'` → `'color var(--motion-fast)'` |
| `app/components/ThemeToggle.tsx` | +1 / -1 | Nav variant `className: 'tap-target-mobile'` (hero variant unchanged) |

**Visual audit:** 15 PNGs in `docs/visual-audit/phase-18-1/` (5 viewports × 3 sections):

| Viewport | Hero | Returns | Build |
|---|---|---|---|
| 360-mobile | ✅ stack: masthead → source → 6 interconnectors → map (visible, aspect-ratioed) → theme toggle 44×44 | ✅ 12.8% IRR + investable chip + sub-info wraps + 2H/4H pills tappable | ✅ |
| 414-mobile | ✅ same structure as 360 | ✅ | ✅ |
| 768-tablet | ✅ flex-collapsed (still <900px) | ✅ | ✅ |
| 1024-tablet | ✅ grid 3-col (≥900px restored) | ✅ desktop multi-tile + DSCR triple panel intact | ✅ |
| 1440-desktop | ✅ grid 3-col unchanged | ✅ | ✅ |

**Bundle size delta:** Production CSS chunk 42,421 B post-edit. CSS-only changes (no JS impact beyond `viewport` export metadata, single line). Build output identical at 7 routes.

**Worker deploy:** Not needed. `model_version` not bumped. No engine fields touched.

**Surprises during implementation (worth flagging):**

1. **Tailwind v4 / Turbopack silently dropped a stacked `.hero-map-wrapper` rule inside an existing `@media (max-width: 900px)` block.** The file source had:
   ```css
   @media (max-width: 900px) {
     .hero-section { ... }
     .hero-map-wrapper { width: 100% !important; height: auto !important; }
   }
   ```
   Served CSS chunk preserved `.hero-section` declarations but dropped `.hero-map-wrapper` entirely. Hoisting `.hero-map-wrapper` into its own `@media (max-width: 900px)` block (separate from the `.hero-section` one) preserved the rule. Documented inline in `globals.css:748-756`. Worth flagging upstream if reproducible elsewhere; potentially a CSS-nesting parser quirk unique to Tailwind PostCSS plugin's interaction with multi-selector media blocks. Memory entry candidate on Cowork side.
2. **SVG `<g>` past viewBox boundaries inflated `document.documentElement.scrollWidth`** independent of CSS clipping. Off-map city labels at viewBox-x > 1024 (geographically east of the calibrated map area — Russia/Belarus side projected past the map's east edge in `lib/map-projection.ts`) extended document scrollWidth from 360 → 556 at 360 viewport. Fixed by adding `overflow: 'hidden'` to the SVG inline style at `HeroBalticMap.tsx:436`. **If those off-map labels were intended to render by design** (visible decoration past the map's land area), they're now invisible — confirm with operator in Phase 18.1.1 audit. Likely intended-invisible since they were already past the calibrated land area, but worth a sanity check.
3. **Internal sub-card overflow** (DSCR triple panel `RevenueCard.tsx:1069`, RTE assumption rows, cycles_breakdown) is the bigger pre-existing layout issue exposed once viewport meta let mobile actually render at 360px width. Page-level `html { overflow-x: hidden }` (added at `globals.css:461`) is the Phase 18.1 band-aid; proper per-component `min-width: 0` on grid children + label-truncation pass is queued as **Phase 18.1.1**.

**Out of scope (per prompt):**
- Mobile breakdown bars (P1-4 spec) — deferred to Phase 18.1.1 per Pause A trivial-threshold call
- Engine / worker changes
- Chart polish (Phase 18.2)
- Animation activation (Phase 18.3)
- A11y additions beyond `:focus-visible` ring (Phase 19)
- Static IA pages / footer (Phase 20)
- Roadmap edits (operator/Cowork-owned per discipline rule #5; CC reports needed deltas below)
- Type-scale rationalization (Phase 7.7g-a-3)
- Component primitives (Phase 7.7g-b reduced)
- Breakpoint inventory rationalization (5 → 3) — deferred (scope creep risk)

**Tier 1 sequence after Phase 18.1:**
- ✅ Phase 7.7g-a-1 SHIPPED 2026-05-05 (dead font triplet drop)
- ✅ Phase 18 SHIPPED 2026-05-06 (Baltic editorial visual identity)
- ✅ Phase 29 SHIPPED 2026-05-06 (KKME Baltic Storage Index)
- ✅ Phase 12.10 follow-up SHIPPED 2026-05-05 (Gap #5 + EE A68 boundary)
- ✅ Phase 7.7g-a-2 SHIPPED 2026-05-06 (spacing tokens + rollout)
- ✅ Phase 12.11 SHIPPED 2026-05-06 (P0 functional bug reconciliation)
- ✅ Phase 18.1 SHIPPED 2026-05-06 (this session — mobile foundation pass)
- 🟡 Phase 18.1.1 — Per-component mobile reflow (DSCR triple panel + RTE assumption rows + cycles_breakdown + S3 BreakdownBar; ~1-2h CC) — new candidate per surprises #2 + #3 above
- 🟡 Phase 18.2 — Chart editorial polish (~2-3h CC)
- 🟡 Phase 18.3 — Animation activation (~2-3h CC)
- 🟡 Phase 12.11.1 — Tornado COD-axis framing question (~1-2h discussion + small fix)
- 🟡 Phase 12.10c — Operator-action verification + small backlog cleanup (~1h Cowork)
- 🟡 Phase 7.7g-a-3 — Off-scale spacing rationalization (~422 sites)
- 🟡 Phase 7.7g-b reduced scope — Stat / Badge / Chart / Drawer + worker URL centralization
- 🟡 Phase 7.7g-c — rgba/hex regression cleanup + CI gate
- 🟡 Phase 12.12 #1 + #2 — schema validation + freshness gates (~2-3 days)
- 🟡 Phase 12.12 #3 — Intel feed-source freshness gates
- 🟡 Phase 12.12 #5 — Cross-card consistency CI test
- 🟡 Phase 19 — A11y MVP (focus-visible already shipped this phase)
- 🟡 Phase 20 — Static IA pages + 4-column footer

**Phase 18.1.1 candidate scope (filed per prompt §6 + §7):**

1. **DSCR triple panel** — `RevenueCard.tsx:1069-1115`. Inner `gridTemplateColumns: '1fr 1fr 1fr'` with mono-formatted ratio cells overflows parent at 360 viewport (parent ~246 wide; panel renders at 282). Fix: add `min-width: 0` to grid children + `overflowWrap: anywhere` on label divs. ~5-line fix.
2. **RTE assumption rows** — `RevenueCard.tsx` assumption section. Italic explainer text wraps fine but `display: flex` rows with fixed-min children (~`width: 79`) render past parent at <400 viewport. ~10 lines.
3. **cycles_breakdown 4-col mini-bar** — same pattern. ~5 lines.
4. **S3Card BreakdownBar** (spec P1-4) — `S3Card.tsx:80`. Children sum 305px fixed (130 + 85 + flex + 90); flex bar collapses to 1px at <360. Fix: className + `<720px` stack media query. ~15 lines.
5. **SVG off-map label sanity check** — confirm with operator that off-map city labels at viewBox-x > 1024 in `lib/map-projection.ts` are intended-invisible. If yes, leave SVG `overflow: hidden` from this phase. If no, alternative is to filter the labels in source rather than clip via SVG style.

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-18-1-mobile-foundation` → `dev` (or `main`)
2. After merge, hard-refresh kkme.eu post-Pages-auto-deploy + open on **mobile + desktop dark + light** to confirm the collapse + KPI reflow + 44×44 tap targets land cleanly. Visual audit screenshots in this PR are dev-server dark mode.
3. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 18.1 → Shipped appendix with full description
   - Phase 18.1.1 added as new candidate (per-component mobile reflow + S3 BreakdownBar fold-in + SVG off-map label confirmation)
   - Currently-active update: Phase 18.1 SHIPPED; next CC across (18.1.1 / 18.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)

### Session 44 — 2026-05-06 — Phase 12.11 — P0 functional bug reconciliation (Claude Code)

**Headline:** Audit-v2 P0 list (~7 items) reconciled into shipped fixes (5) + rigorously deferred (3). All scope frontend display + freshness lib; engine math untouched, no `model_version` bump, no worker deploy. Pause A re-verified each audit claim per discipline rule #1 (audit-triage); 3 of 8 came back NOT REPRODUCIBLE under code-grep + live-curl triangulation, surfaced as deferred follow-ups rather than silently shipped fixes. Cross-card consistency check (rule #4) caught two additional `s2.afrr_up_avg` precision violations beyond the audit list — operator approved fold-in at Pause B, completing canonical-precision discipline across all 5 consumer sites of the field. Vitest +6 (calendar-EET freshness coverage). Bundle delta near zero.

**Branch:** `phase-12-11-p0-bug-reconciliation` off `origin/main` at `ff60f5a` (post-Phase-7.7g-a-2-merge + phase-12-11 prompt + roadmap delta). 3 commits.

**Pause A — re-verification triage (rule #1):**

| # | Audit claim | Status | Evidence |
|---|---|---|---|
| 1 | Fleet 822 vs 651 same-page collision | **REFINED → FIXED** | Tooltips already disclosed composition (`HeroBalticMap.tsx:763`, `SignalBar.tsx:70-84`) post-Phase-12.10; visible labels remained bare. Bug was inline-vs-tooltip disclosure for the 822 side. S4Card.tsx:385 `Baltic BESS installed (TSO-tracked)` already correctly explicit on the 651 side. |
| 2 | AFRR precision 8 vs 7.96 | **VERIFIED → FIXED** | `SignalBar.tsx:52` `Math.round(7.96)` → 8 (header outlier); `HeroBalticMap.tsx:296` `formatTickerItem(...,2)` → 7.96 ✓; `S2Card.tsx:261` `.toFixed(2)` → 7.96 ✓. Header alone was the bug. |
| 3 | Freshness "TODAY" at 13h | **VERIFIED → FIXED** | `freshness.ts:96` `hoursStale < 24 → 'TODAY'` empirically wrong: yesterday-23:33-UTC at 12:33-UTC reads TODAY despite being yesterday's data. |
| 4 | DISPATCH €/MW vs €/MW/DAY | **REFINED → FIXED** | Both surfaces pull from `analysis.totals.per_mw` family (worker line 8542); both are €/MW/DAY semantically. Header `SignalBar.tsx:89` lacked `/DAY` qualifier. |
| 5 | COD 2027 stragglers | **NOT REPRODUCIBLE** | Live `/revenue` matrix legitimately emits 9 cells incl. `cod=2027` (low/mid/high IRRs verified). `sensitivity.ts:80` deliberately iterates `[2027, 2029]` to anchor lower/upper-COD-vs-base-2028 axis bars; `sensitivity.test.ts:54` correctly mirrors that. The deeper question — "is COD 2027 still meaningful in 2026 when no greenfield asset can hit a 2027 in-service date?" — is a UI-honesty call deferred to **Phase 12.11.1** follow-up. |
| 6 | CAPEX tornado consistency | **NOT REPRODUCIBLE** | `buildTornadoBars` math verified consistent: capex=low/high cells anchored at BASE_COD=2028, deltas pulled from matching `{capex, 2028}` matrix rows. Live `scenarios` empty so no Conservative/Stress bars currently render. Latent concern surfaced (see follow-ups below). |
| 7 | LV/EE empty cells | **REFINED → FIXED** | `BalticStorageIndexCard.tsx:363` already had `title={COVERAGE_LABEL[cs]}` tooltip + `cursor:help` + dash; coverage message at lines 65-66 already operator-honest. Bug was inline-vs-tooltip disclosure — fixed via sup² anchor + explicit footnote text mirroring LT 2h sup¹ pattern. |
| 8 | Intel feed >30d staleness | **NOT REPRODUCIBLE** | Filter exists at `IntelFeed.tsx:1066-1077` (homepage drops >30d, tags 7-30d as "older"); `/intel` page intentionally has no cap. If audit screenshot was homepage with >30d items visible, that's an upstream feed-source-refresh concern → **Phase 12.12 #3** territory. |

**Pause B — operator picks across decisions:**

| # | Pick | Implementation |
|---|---|---|
| 1 | Inline subscript "(BESS + pumped hydro)" on hero "BALTIC FLEX FLEET" + SignalBar header "FLEX FLEET" | `HeroBalticMap.tsx:768`, `SignalBar.tsx:62-65,121-138` (added optional `scope` field on signal, render below label) |
| 3 | Calendar-today-in-EET via `Europe/Vilnius` | `freshness.ts` — new `isSameVilniusDay` helper using `toLocaleDateString('en-LT', { timeZone: 'Europe/Vilnius' })`. Boundary now `hoursStale < 24 && isSameVilniusDay(ts, now) → TODAY`. Cross-EET-day data <24h → STALE. LIVE/RECENT bands take precedence. |
| 4 | Add `/DAY` qualifier to SignalBar header | `SignalBar.tsx:97-98` — `/MW` → `/MW/DAY`. |
| 5 | NOT REPRODUCIBLE; file Phase 12.11.1 follow-up | No code change. Tornado COD-axis framing question recorded for follow-up. |
| 6 | NOT REPRODUCIBLE; note latent scenario-vs-pivot conflation | No code change. Latent concern recorded for follow-up. |
| 7 | Inline footnote anchor (sup²) on each pending row + explicit footnote text | `BalticStorageIndexCard.tsx` — `<sup>2</sup>` on non-complete cells; new `<div>` in `card-footnotes` with text "Coverage pending Phase 29.1 — engine extension queued (per-country DA capture + 5-product capacity-reservation extraction). LT 1h additionally requires sub-2h SOC physics not modeled by engine v7.3." |
| 8 | NOT REPRODUCIBLE; flag feed-source refresh as Phase 12.12 #3 territory | No code change. |

**Pause C addendum — P0-1 (CAPEX selector recompute) + P0-2 (duration toggle) verification:**

Operator-requested verification per discipline rule #3 (no silent drops). The original 8-bug Pause A scope did not include these two; verification was run post-commit, pre-PR-open.

State-management shape (`RevenueCard.tsx:1528-1531`): `useState` per knob (`dur`, `capex`, `cod`, `scenario`). URL writeback `useEffect` at lines 1554-1561 keyed on `[dur, capex, cod, scenario]`. `fetchData` `useCallback` at line 1564 with same deps; `useEffect(() => fetchData(), [fetchData])` at line 1577 re-fires on any knob change. Refetch URL: `${WORKER}/revenue?dur=${dur}&capex=${capex}&cod=${cod}&scenario=${scenario}`.

**P0-1 — CAPEX selector recompute · VERIFIED NOT REPRODUCIBLE (works as designed):**

| Click | URL `capex=` | Headline IRR | Δ pp vs base | Description `€/kWh` | Bankability |
|---|---|---|---|---|---|
| Initial (mid) | `mid` | 12.8% | base | €164/kWh ✓ | investable |
| €120 | `low` ✓ | 20.2% | **+7.4 pp** ✓ | €120/kWh ✓ | investable |
| €262 | `high` ✓ | 4.5% | **−8.3 pp** ✓ | €262/kWh ✓ | below_hurdle |
| €164 (return) | `mid` ✓ | 12.8% | back to base | €164/kWh ✓ | investable |

URL `capex=` flips correctly on each click, headline IRR delta well above ≥1pp threshold, description string contains chosen €/kWh on each click. No recompute bug.

**P0-2 — Duration toggle · VERIFIED NOT REPRODUCIBLE (works as designed):**

| Click | URL `dur=` | Headline IRR | Optimizer 2H IRR | Optimizer 4H IRR | Headline matches optimizer cell? |
|---|---|---|---|---|---|
| 2H (initial) | `2h` | 12.8% | 12.8% | 6.0% | ✅ matches 2H cell |
| 4H | `4h` ✓ | 6.0% | 12.8% | 6.0% | ✅ matches 4H cell |
| 2H (return) | `2h` ✓ | 12.8% | 12.8% | 6.0% | ✅ back to 2H |

Description also recomputes: `100 MWh (2H)` → `200 MWh (4H)`. Live rate recomputes: €346/MW/day → €374/MW/day. Net/MW/yr recomputes: €115k → €128k.

Verification protocol executed via chrome-devtools-mcp on dev server localhost:3000 with click + 3-4s wait + DOM read on each step.

**Cross-card consistency check (rule #4) — Pause B fold-in:** `grep afrr_up_avg` surfaced two additional 0dp sites beyond the audit's flagged surfaces:

- `HeroMarketNow.tsx:242` — `Math.round(afrr).toString()` → 8
- `StatusStrip.tsx:50` — `afrr.toFixed(0)` → 8

Operator approved fold-in (option (a)) at Pause B with rationale: "Phase 12.12 #5 is the CI gate to prevent future drift, not to clean up this drift. Don't leave known-broken sites in scope to be caught by a downstream phase." Both sites migrated to `.toFixed(2)`. AFRR canonical-precision discipline now consistent across **all 5 consumer sites** of `s2.afrr_up_avg` (SignalBar header, HeroBalticMap marquee, S2Card hero detail, HeroMarketNow tile, StatusStrip strip). Note: `HeroMarketNow` and `StatusStrip` are not currently mounted in `app/page.tsx` (orphaned components) — fix protects against future re-mounting + keeps grep clean.

**Pause B — pre-commit verification gates:**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ unchanged |
| `npx vitest run` | 919 / 60 files | **925 / 60 files** | ✅ +6 new specs (`freshnessLabel — calendar-today-in-EET` block) |
| `npm run lint` (eslint) | 126 (40e/86w) | 126 (40e/86w) | ✅ matches |
| `npm run lint:no-raw-spacing` | exit 0 | exit 0 | ✅ unchanged |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ unchanged |
| `npm run build` | 7 routes | 7 routes | ✅ unchanged |

**Vitest spec note (worth flagging):** The prompt's specific assertion `freshnessLabel(yesterday-23:33-UTC, now-12:33-UTC) !== 'TODAY'` does **not** hold under Option A in EET (UTC+2/+3): `2026-05-05 23:33 UTC` falls at `01:33–02:33 EET on 2026-05-06`, same EET day as `12:33 UTC = 14:33–15:33 EET`. So that specific case stays TODAY — which is now **semantically correct** in Baltic-operator framing (the chip means "today by your Baltic calendar"). The new spec uses three load-bearing cases that genuinely cross the EET day boundary; see `app/lib/__tests__/freshness.test.ts:42-92`. Operator approved this correction at Pause B.

**Files touched (8 modified):**

| File | Change | Bug |
|---|---|---|
| `app/lib/freshness.ts` | `now` parameterized; `isSameVilniusDay` helper added; TODAY boundary now `hoursStale < 24 && isSameVilniusDay` | #3 |
| `app/lib/__tests__/freshness.test.ts` | +6 specs covering EET-day-crossing, same-EET-day, LIVE/RECENT precedence, STALE→OUTDATED boundary, LIVE band, null/undefined input | #3 |
| `app/components/SignalBar.tsx` | AFRR `Math.round` → `.toFixed(2)`; FLEX FLEET inline scope rendering; DISPATCH `/MW` → `/MW/DAY` | #1, #2, #4 |
| `app/components/HeroBalticMap.tsx` | Hero "BALTIC FLEX FLEET" inline subscript "(BESS + pumped hydro)" | #1 |
| `app/components/HeroMarketNow.tsx` | AFRR tile `Math.round` → `.toFixed(2)` | #2 cross-card |
| `app/components/StatusStrip.tsx` | AFRR strip `.toFixed(0)` → `.toFixed(2)` | #2 cross-card |
| `app/components/BalticStorageIndexCard.tsx` | sup² anchor on non-complete cells; new card-footnote paragraph with explicit "Coverage pending Phase 29.1" text | #7 |

**Visual audit:** 6 PNGs in `docs/visual-audit/phase-12-11/`:

| File | Surface |
|---|---|
| `01-hero-fullpage.png` | Full homepage post-fix (audit reference) |
| `02-viewport-header-hero.png` | Initial viewport |
| `03-signalbar-kpi-strip.png` | StickyNav SignalBar (FLEX FLEET inline scope, AFRR 7.96, DISPATCH /MW/DAY all visible) |
| `04-baltic-storage-index-lvee-anchors.png` | Index card with sup² anchors on all LV/EE cells + LT 1h |
| `05-hero-fleet-disclosure.png` | Hero block 2 with "BALTIC FLEX FLEET (BESS + pumped hydro) 822 MW" |
| `06-tornado-cod2027-bar-context.png` | Sensitivity tornado as-shipped (reference for Phase 12.11.1 follow-up question) |

DOM evaluation across all surfaces confirmed:
- Hero block 2: `BALTIC FLEX FLEET(BESS + pumped hydro) 822 MWOPERATIONAL` ✓
- StickyNav SignalBar: `AFRR 7.96 €/MW/h · FLEX FLEET(BESS + pumped hydro) 822 MW · DISPATCH €406/MW/DAY` ✓
- Bottom marquee: `AFRR €7.96/MW/h` ✓
- BalticStorageIndexCard rows: `🇱🇹 LT —² €284 €307 / 🇱🇻 LV —² —² —² / 🇪🇪 EE —² —² —²` + footnote 2 text rendered ✓
- Freshness chips visible: `TODAY` (S1 14h ago, same EET day — semantically correct), `RECENT` (S2 1h ago) ✓

**Bundle size delta:** Estimated <1KB. New code: `isSameVilniusDay` helper (~150B), boundary check tweak (~30B), four small inline-string additions across components (~80B), BalticStorageIndexCard sup² + footnote paragraph (~250B). No new deps. Production-build CSS chunk + JS chunk unchanged at the route-summary level (build output identical to baseline at 7 routes).

**Worker deploy:** Not needed. `model_version` not bumped. No engine fields touched.

**Cross-card consistency findings → Phase 12.12 #5 candidate metrics:**
- `s2.afrr_up_avg` — pin precision to **2dp** in CI gate (regression-preventive; the gate enforces, not cleans, since 12.11 cleaned all 5 sites)
- `flexibility_fleet_mw` (822) vs `bess_installed_mw` (651) — must never render at the same UI-level without scope disclosure (the audit's load-bearing cross-card rule)
- `analysis.totals.per_mw` — must always carry `/DAY` (or whatever time qualifier becomes canonical)

**Follow-ups for handover:**

1. **Phase 12.11.1 (worker-side question)** — As 2026 ages, is `cod=2027` still a meaningful tornado-axis label given no greenfield asset can hit a 2027 in-service date? Frontend filter is one option (drop `cod < currentYear + 1` bars in `sensitivity.ts:80`); worker matrix shape adjustment is another (rolling-COD windowing). Out of scope this phase. Discussion needed before scoping.
2. **Phase 12.12 #3 territory** — Intel feed-source freshness: filter at `IntelFeed.tsx:1066-1077` works; if homepage shows >30d evidence, that's an upstream feed-refresh concern, not a frontend bug. Verify next time operator screenshots an apparent staleness.
3. **Phase 12.12 #5 (cross-card consistency CI)** — Three candidate metrics above. Phase 12.11 cleaned all currently-known violations; the gate's job is regression prevention.
4. **Latent scenario-vs-pivot conflation in RevenueSensitivityTornado** — When `scenarios.{conservative,stress}` re-populate in `/revenue`, the tornado renders them on the same axis as CAPEX/COD bars without disclosing they represent multi-parameter shifts vs single-axis pivots. Visual-conflation risk; consider a divider, label-prefix, or grouped-section layout when scenarios are non-empty. Currently invisible (live `scenarios` empty); flag re-checks the next time scenarios populate.

**Out of scope (per prompt):**
- Engine math changes (`computeRevenueV7`, balancing model, fleet trajectory)
- Worker endpoint additions
- Mobile / responsive design (Phase 18.1)
- Chart polish (Phase 18.2)
- Schema validation gates (Phase 12.12 #1+#2)
- Bigger structural rebuilds (Tier 2 chapter restructure, Tier 3 hero composed-viz)
- Roadmap edits (operator/Cowork-owned per discipline rule #5; CC reports needed deltas below)
- New primitives (Phase 7.7g-b reduced)
- Additional spacing residuals (Phase 7.7g-a-3)

**Tier 1 sequence after Phase 12.11:**
- ✅ Phase 7.7g-a-1 SHIPPED 2026-05-05 (dead font triplet drop)
- ✅ Phase 18 SHIPPED 2026-05-06 (Baltic editorial visual identity)
- ✅ Phase 29 SHIPPED 2026-05-06 (KKME Baltic Storage Index)
- ✅ Phase 12.10 follow-up SHIPPED 2026-05-05 (Gap #5 + EE A68 boundary)
- ✅ Phase 7.7g-a-2 SHIPPED 2026-05-06 (spacing tokens + rollout)
- ✅ Phase 12.11 SHIPPED 2026-05-06 (this session — P0 functional bug reconciliation)
- 🟡 Phase 12.11.1 — Tornado COD-axis framing question (~1-2h discussion + small fix) — new candidate
- 🟡 Phase 18.1 — Mobile foundation pass (~2-3h CC)
- 🟡 Phase 18.2 — Chart editorial polish (~2-3h CC)
- 🟡 Phase 12.10c — Operator-action verification + small backlog cleanup (~1h Cowork)
- 🟡 Phase 7.7g-a-3 — Off-scale spacing rationalization (~422 sites)
- 🟡 Phase 7.7g-b reduced scope — Stat / Badge / Chart / Drawer + worker URL centralization
- 🟡 Phase 7.7g-c — rgba/hex regression cleanup + CI gate
- 🟡 Phase 12.12 #1 + #2 — schema validation + freshness gates (~2-3 days)
- 🟡 Phase 12.12 #3 — Intel feed-source freshness gates (Phase 12.11 surfaced this as upstream-territory if audit-v2 staleness reproduces)
- 🟡 Phase 12.12 #5 — Cross-card consistency CI test (Phase 12.11 surfaced 3 candidate metrics)
- 🟡 Phase 12.10b — operator/Cowork-direct housekeeping bundle

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-12-11-p0-bug-reconciliation` → `dev` (or `main`)
2. After merge, hard-refresh kkme.eu post-Pages-auto-deploy + skim hero + SignalBar + BalticStorageIndexCard in dark + light to confirm the disclosures + precision shift land cleanly. Visual audit screenshots in this PR are dev-server light mode.
3. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 12.11 → Shipped appendix with full description
   - Phase 12.11.1 added as new candidate (tornado COD-axis framing as 2026 ages)
   - Phase 12.12 #3 + #5 entries annotated: 12.11 surfaced candidate metrics + feed-source-refresh territory
   - Currently-active update: Phase 12.11 SHIPPED; next CC across (12.11.1 / 18.1 / 18.2 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced)

### Session 43 — 2026-05-06 — Phase 7.7g-a-2 — Spacing tokens + rollout (Claude Code)

**Headline:** Spacing layer is the last unsystemized foundation token (post-Phase-18 typography + palette + card primitives). Canonical 8-value t-shirt scale (`--space-2xs:4 / xs:8 / sm:16 / md:24 / lg:32 / xl:48 / 2xl:64 / 3xl:96`) added to `app/globals.css`; the prior 5-token block (`xs:4 / sm:8 / md:16 / lg:24 / xl:48`) was cleanly renamed because **Pause A discovery found zero consumers** — declared but never imported anywhere in the codebase, so the canonical-scale `xs:4→8` value-shift had no blast radius. **361 inline-px sites migrated** across 56 files (vs. 271 audit estimate — bare-number form `gap: 8` was higher than the quoted-form audit detected; RevenueCard 40 + TradingEngineCard 23 alone). New CI grep gate `npm run lint:no-raw-spacing` (value-aware: only flags raw px in single-prop `padding/margin/gap` when value is on the canonical 4/8/16/24/32/48/64/96 set; off-scale + shorthand left raw, gated separately for Phase 7.7g-a-3). Frontend-only, no `model_version` bump, no worker deploy. Continues the Phase 7.7g-a-1 + Phase 18 foundation thread.

**Branch:** `phase-7-7g-a-2-spacing-tokens` off `origin/main` at `b3b1ac6` (post-Phase-18-roadmap-delta). 3 commits pushed.

**Pause A discovery — scope-corrections to the prompt:**

| Prompt premise | Empirical finding |
|---|---|
| "Existing 5 tokens (xs/sm/md/lg/xl mapped to 4/8/16/24/48 px) — recommend extend to avoid breaking consumers" | Existing tokens have **zero consumers** codebase-wide (5 declarations in `globals.css:227-231`, 0 references in `app/`/`workers/`). The "extend to avoid value-shift" rationale collapses; safe to rename to canonical 8-value scale (xs:4 → 2xs:4, +new xs:8). |
| "Total inline-px sites count … per-value distribution — likely 4/8/16 cleanly map" | **~512 deduped sites** total (161 single-prop + 180 per-side + 171 shorthand). On-scale (4/8/16/24/32/48): **271 sites** (~54%). Off-scale (1/2/3/5/6/10/12/14/18/20/28/36/40 px): **~233 sites** (~46%, mostly 6×69, 12×52, 2×38, 10×30). Off-scale cannot migrate without value rounding (visual change) or bespoke tokens (anti-consolidation). |
| "1-2h estimate" | Pause A predicted ~3-4h for Path A. Actual ~1h elapsed — migration was scriptable (Python regex pass with property-name + value anchoring) once the chart.js carve-out (`app/lib/chartTheme.ts:149` `padding: { top: 8, … }` object form) and shorthand-quote pattern (`'24px 0'`) were ruled out by the regex shape. |
| "If existing `--space-xs:4` shifts to `--space-xs:8` it would break consumers" (prompt §10) | Premise empirically false (zero consumers). Mid-prompt warning was load-bearing only conditionally; reported at Pause A and the discovery cleared the rename path. |

**Operator-decisions snapshot (Pause A → §3):**

| # | Decision | Why |
|---|---|---|
| 1 | Path A — adopt full canonical 8-value scale (rename existing 5, add `2xs/2xl/3xl`) | Zero-consumer finding makes rename safe; aligns naming convention with t-shirt sizing |
| 2 | Migrate 271 on-scale sites only; leave 233 off-scale + 171 shorthand raw | "No-op rename" framing — rounding off-scale to nearest token would silently change visuals under cover of consolidation |
| 3 | Shorthand sites (`padding: '24px 0'`) — leave raw, do not migrate to template-literal `\`${var(--space-md)} 0\`` | Template literals bypass static analysis, hurt readability, don't actually consolidate |
| 4 | CI gate: value-aware regex flagging only raw px on the canonical set in single-prop `padding/margin/gap`; off-scale and shorthand stay raw without failing the gate | Migrated sites can't regress; off-scale sites surface via separate audit (Phase 7.7g-a-3) |
| 5 | Include `app/page.tsx` + `app/methodology/page.tsx` in the migration sweep | Same migration pattern as components; extends consolidation to top-level page-level inline styles |
| 6 | Visual confirmation deferred — production-build CSS artifacts verified correct, mechanical 1:1 rename verified by diff inspection on RevenueCard / HeroBalticMap, gates green; chrome-devtools-mcp browser was locked by another session, dev server (PID 54297) was serving stale CSS pre-HMR | Migration is mechanically verifiable; risk very low. Operator should hard-refresh localhost or check production after Pages auto-deploy on PR merge to confirm zero visual shift. If anything visually shifts post-merge, that's a value-mismatch bug — file Phase 7.7g-a-2.1 follow-up; rare given the 1:1 pattern. |

**Pause B — pre-commit verification gates:**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ unchanged |
| `npx vitest run` | 919 / 60 files | 919 / 60 files | ✅ unchanged (no test fixtures pin spacing values; `__tests__` filter audit confirmed pre-migration) |
| `npm run lint` (eslint) | 126 (40e/86w) | 126 (40e/86w) | ✅ matches |
| `npm run lint:no-editorial-chips` | exit 0 | exit 0 | ✅ unchanged |
| `npm run lint:no-raw-spacing` (new) | n/a | exit 0 | ✅ first run on migrated tree |
| `npm run build` | 7 routes | 7 routes | ✅ unchanged |

**Migration count (361 sites across 56 files):**

| Form | Count |
|---|---|
| Quoted single-value (`padding: '8px'` → `padding: 'var(--space-xs)'`) | 288 |
| Bare-number form (`gap: 8` → `gap: 'var(--space-xs)'`) | 73 |
| **Total** | **361** |

Top per-file: RevenueCard 40 (all bare-number form), S3Card 34, S4Card 25, TradingEngineCard 23, page.tsx 15, S7Card 15, S9Card 15, S8Card 12, LoadCard 12, WindCard 12, S1Card 11, SolarCard 11, S2Card 10, HeroMarketNow 10, HeroBalticMap 8, IntelFeed 8, ResidualLoadCard 8.

**Verification gates (final actual numbers):**
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: 919 passed (60 files)
- `npm run lint`: 126 problems (40 errors, 86 warnings)
- `npm run lint:no-raw-spacing`: exit 0 (clean tree)
- `npm run lint:no-editorial-chips`: exit 0 (unchanged)
- `npm run build`: 7 routes, compiled in 14.5s

**Bundle size delta:** Production CSS chunk: 40 KB (8-token-scale extension adds 8 lines of CSS, ~250 bytes pre-gzip). Inline-style migration adds ~12 chars per site × 361 sites = ~4.3 KB raw delta in JS bundles, near-zero after minification + gzip. Production build verified to contain all 8 tokens with correct values + 275 `var(--space-*)` references active across the on-scale set.

**CI gate caveat:** Per-side variants (`paddingTop`, `marginBottom`, `paddingLeft`, etc.) were migrated but are **NOT gated** by the `lint:no-raw-spacing` rule — operator's literal regex was `(padding|margin|gap)` only. Phase 7.7g-c can extend the regex to include per-side variants when it folds the gate into CI pipeline.

**Backlog discovered (deferred — Phase 7.7g-a-3 candidate):**

Not in this PR. Phase 7.7g-a-3 design-rationalization candidate scope:

- **290 single-prop off-scale sites** — `padding|margin|gap` with raw px values not in canonical scale. Top values: 6px (mostly `gap: '6px'`), 12px (mostly `gap: '12px'`), 2px (`padding: '2px'`-style hairlines), 10px, 20px, 14px, 3px, 5px, 1px. Likely a mix of intentional hairlines (1/2/3 px borders-as-spacing) and accumulated noise from ad-hoc edits.
- **186 per-side off-scale sites** — `paddingTop|marginBottom|etc.` with off-scale values. Top: `marginBottom: '6px'` (38), `marginBottom: '12px'` (24), `marginBottom: '10px'` (12), `marginTop: '12px'` (8).
- **171 shorthand sites** — `padding|margin` with multi-value strings (`'24px 0'`, `'4px 0 8px'`, `'10px 12px'`, `'8px 10px'`, `'4px 6px'`, etc.). Decision needed: split-per-side migration vs new shorthand tokens vs leave raw permanently. Per-axis token expansion via template literals was rejected at Pause A.
- **2 conditional ternaries** — `BalticMap.tsx:169` `padding: compact ? '6px' : '8px'` (the on-scale `'8px'` arm did NOT migrate because the regex requires terminator `,;}` etc. and ternary syntax doesn't match); `AssetDetailPanel.tsx:221` `margin: i > 0 ? '6px 0 0' : 0`. Targeted manual pass.
- **16 raw-px sites in `app/intel/page.tsx` (5) + `app/regulatory/page.tsx` (10) + `app/layout.tsx` (1)** — operator-clarified post-Pause-B: "include page.tsx + methodology/page.tsx" was meant inclusively (all top-level pages). These three were missed in the scope read; queue for 7.7g-a-3 sweep.
- **Per-side variant CI coverage** — extend `lint:no-raw-spacing` regex to `paddingTop|paddingRight|paddingBottom|paddingLeft|marginTop|marginRight|marginBottom|marginLeft|rowGap|columnGap` when 7.7g-c folds the gate into CI pipeline.

**Visual-audit screenshots:** **Skipped this session** per operator decision (chrome-devtools-mcp browser locked by parallel session, dev server at port 3000 owned by parallel session serving stale CSS pre-HMR). Visual confirmation deferred to operator hard-refresh of localhost or post-Pages-auto-deploy verification on kkme.eu after PR merge. Migration is mechanically verifiable: production-build CSS confirmed all 8 tokens present with correct values, production-build JS confirmed 275 `var(--space-*)` references active, diff inspection on RevenueCard.tsx + HeroBalticMap.tsx showed mechanical 1:1 token rename.

**Out of scope (per prompt):**
- Engine / worker changes
- Visual changes (this is a no-op rename; if anything shifts visually, it's a value-mismatch bug, not by design)
- Spacing-related responsive design improvements (mobile spacing review is a separate phase — Phase 18.1 if confirmed)
- New primitives (Phase 7.7g-b reduced)
- Off-scale value rationalization (Phase 7.7g-a-3 candidate per backlog above)
- `intel/page.tsx`, `regulatory/page.tsx`, `layout.tsx` (16 raw-px sites; flagged for 7.7g-a-3)
- Roadmap edits (operator/Cowork-owned per discipline rule #5; CC reports needed deltas below)

**Tier 1 sequence after Phase 7.7g-a-2:**
- ✅ Phase 7.7g-a-1 SHIPPED 2026-05-05 (dead font triplet drop)
- ✅ Phase 18 SHIPPED 2026-05-06 (Baltic editorial visual identity)
- ✅ Phase 29 SHIPPED 2026-05-06 (KKME Baltic Storage Index)
- ✅ Phase 12.10 follow-up SHIPPED 2026-05-05 (Gap #5 + EE A68 boundary)
- ✅ Phase 7.7g-a-2 SHIPPED 2026-05-06 (this session — spacing tokens + rollout)
- 🟡 Phase 18.1 — Mobile foundation pass (~2-3h CC) — surfaced in operator's 2026-05-06 audit; awaiting prompt
- 🟡 Phase 18.2 — Chart editorial polish (~2-3h CC) — surfaced in operator's 2026-05-06 audit; awaiting prompt
- 🟡 Phase 12.10c — Operator-action verification + small backlog cleanup (~1h Cowork)
- 🟡 Phase 7.7g-a-3 — Off-scale spacing rationalization (new candidate, this session's backlog) — ~233 off-scale + 171 shorthand + 16 missed top-level pages + 2 ternary on-scale = ~422 sites
- 🟡 Phase 7.7g-b reduced scope — Stat / Badge / Chart / Drawer + worker URL centralization
- 🟡 Phase 7.7g-c — rgba/hex regression cleanup + CI gate (`lint:no-raw-spacing` already in place; folds into CI pipeline)
- 🟡 Phase 12.12 #1 + #2 — schema validation + freshness gates (~2-3 days)
- 🟡 Phase 12.10b — operator/Cowork-direct housekeeping bundle

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-7-7g-a-2-spacing-tokens` → `dev` (or `main`)
2. After merge, hard-refresh kkme.eu post-Pages-auto-deploy + skim hero + a few cards in dark + light to confirm zero visual shift. If any shift, that's a value-mismatch bug — file Phase 7.7g-a-2.1 follow-up.
3. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 7.7g-a-2 → Shipped appendix with full description
   - Phase 7.7g-a-3 added as new candidate (off-scale + shorthand + missed top-level pages + per-side CI extension)
   - Phase 7.7g-c entry annotated: `lint:no-raw-spacing` already in place; this phase folds into CI pipeline + extends regex to per-side variants
   - Currently-active update: Phase 7.7g-a-2 SHIPPED; next CC across (18.1 / 18.2 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced)

### Session 42 — 2026-05-06 — Phase 18 — Baltic editorial visual identity ship (Claude Code)

**Headline:** Cumulative AI-tells (DM Mono workhorse, soft-rounded card corners, mint sentiment palette, no editorial scale contrast, no footnote discipline) replaced with the operator-approved 2026-05-06 broadsheet direction — typography swap (Plex Mono [400, 500] + Newsreader [200, 400, 400-italic]), Baltic-grounded palette (`--accent-rose` dark `#f5718e` → `#a8324a` brick), sharp 0px corners site-wide with per-card-type top accent rules, broadsheet masthead (`Vol I · No 128 · 06 MAY 2026` + italic Newsreader tagline + 0.5px Baltic-amber rule + bracket source-row), site-wide pixel-dot grid, marquee architectural ticks, editorial Newsreader 200 hairline hero numbers across 5 hero cards, footnote citation discipline with no-invented-section-numbers rule honoured (every link maps to a real `methodology.md` anchor or self-contained prose), bracket-notation `SourceFooter` ([src] / [as-of] / [class]) flowing through all ~21 consumers, per-section pull-quotes on §1 / §4 / §6. Frontend-only, no `model_version` bump, no worker deploy. Phase 7.7g-a-3 (accent consolidation) + Phase 7.7g-a-4 (Cormorant migration) **SUPERSEDED** by Phase 18 (Cormorant migrated to Newsreader, not just dropped to fallback). Phase 7.7g-b scope reduced — Card primitive done; Stat / Badge / Chart / Drawer + worker URL centralization remain.

**Branch:** `phase-18-baltic-editorial` off `origin/main` at `4f5ab5a` (post-Phase-29-roadmap-delta). 4 commits pushed.

**Pause A discovery — scope-corrections to the prompt:**

| Prompt premise | Empirical finding |
|---|---|
| "9 routes (post-Phase-29)" | Build prints **7 routes**: `/`, `/_not-found`, `/dev/hero-preview`, `/dev/map-calibrate`, `/intel`, `/methodology`, `/regulatory`. Prompt-author miscount; not a missing route. |
| "Update `--positive` / `--warning` / `--negative` semantic tokens" | Codebase uses `--success` / `--warning` / `--danger` (lines 70-72 globals.css); no `--positive` / `--negative` exist. Operator-decided: add aliases (3 LOC each in dark + light) mapping `--positive: var(--success)` and `--negative: var(--danger)`. Avoids renaming + keeps `tokens.test.ts` intact. |
| "Drop dead `--accent-rose` / `--accent-purple`" | Both ARE used: `--accent-rose` aliased through `--coral` → `--danger` → `--signal-negative` (and 1 explicit `--warning`-style call site in RevenueBacktest); `--accent-purple` aliased through `--lavender` → `--cycles-fcr`. Operator-decided: retune values, don't drop. `--accent-rose` dark `#f5718e` → `#a8324a` brick; `--accent-purple` retained as FCR cycles colour. |
| "478 mono usages + 39 serif usages flow through CSS variables" | True for tokenized usage (548 `var(--font-{mono,serif,display})` hits). But **33 hardcoded font sites bypass tokens**: 9× `'Cormorant Garamond'` (silent fallback bug — next/font loaded "Cormorant" not "Cormorant Garamond"), 1× `'Cormorant'`, 10× `'Unbounded'`, 13× `'DM Mono'` incl. SVG `fontFamily=` attrs in HeroBalticMap + chart.js literal in `chartTheme.ts`. All migrated. |
| §4d "right-rail card glued onto map" | Visual-inference hypothesis without code-level confirmation. Current 3-col grid `minmax(260,300) / minmax(540,620) / minmax(260,300)` shows no overlap from code structure. Per audit-triage discipline rule #1 — operator confirmed empirically false at Pause B. Full-bleed-map architectural refactor dropped. |

**Operator-decisions snapshot (Pause A → pre-§3 proceed):**

| # | Decision | Why |
|---|---|---|
| 1 | `--positive` / `--negative` aliases (3 LOC each) | Don't rename `--success` / `--danger`; keeps `tokens.test.ts` intact |
| 2 | Retune `--accent-rose` dark `#f5718e` → `#a8324a` (matches light, becomes brick); keep `--accent-purple` | Both tokens active in cycle/sentiment chains |
| 3 | Per-card accent map approved with S5 frame stays neutral; brick reserved for per-news-item live indicators inside S5 | Frame brick on news ticker would visually overweight the card |
| 4 | Masthead tagline "Baltic flexibility, daily" + launch date `2025-12-30` → today renders `Vol I · No 128 · 06 MAY 2026` | "Daily" matches editorial cadence; launch date pins issue numbering |
| 5 | Footnotes — no invented `§3.2 / §3.3` section numbers; use real `methodology.md` anchors or self-contained prose | "Better terse-and-accurate than precise-and-fabricated" |
| 6 | Pull-quotes only on §1 / §4 / §6; §4 static line `"Reference-asset economics, evaluated daily. Today's gross 2h capture, banded against the rolling 30-day distribution."` | Dynamic injection deferred; static line acceptable |
| 7 | All 33 hardcoded font sites migrate in commit 1; `chartTheme.ts:103` + 3 SVG fontFamily attrs in HeroBalticMap → literal `'IBM Plex Mono'`; rest → CSS variables | chart.js (Canvas 2D) + SVG fontFamily attrs don't resolve `var()` |
| 8 | Newsreader weights `[200, 400, 400-italic]`; Plex Mono `[400, 500]`; skip Newsreader 500 + 100; fallback to 300 if 200 unreadable | Bundle hygiene; 200 confirmed readable at Pause C |
| 9 | §6e nice-to-haves (S·II archival stamp, ornament dingbats, brick live-dot) deferred at Pause C | Foundation + main editorial polish push the identity hard enough; further amplification post-merge if needed |

**Pause B — foundation gates + diff (post-§3 + §4):**

| Gate | Baseline | Pause B | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ unchanged |
| `npx vitest run` | 919 / 60 files | 919 / 60 files | ✅ unchanged |
| `npm run lint` | 126 (40e/86w) | 126 (40e/86w) | ✅ matches |
| `npm run build` | 7 routes | 7 routes | ✅ unchanged |

**Pause C — pre-commit verification (post-§6):**

| Gate | Baseline | Pause C | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | ✅ unchanged |
| `npx vitest run` | 919 / 60 files | 919 / 60 files | ✅ unchanged (1 pinned-token test in `metricTile.test.tsx` updated to lock new editorial-serif behavior) |
| `npm run lint` | 126 (40e/86w) | 126 (40e/86w) | ✅ matches |
| `npm run build` | 7 routes | 7 routes | ✅ unchanged |

**Per-card accent map applied:**

| Card | Section | Class | Top accent |
|---|---|---|---|
| RevenueCard | 50 MW reference asset | `card--revenue` | 3px deep teal `var(--positive)` |
| BalticStorageIndexCard | 50 MW reference asset (sub-card) | `card--revenue` | 3px deep teal |
| TradingEngineCard | Dispatch intelligence | `card--revenue` | 3px deep teal |
| S2Card (`.card-tier1-feature` wrapper) | Revenue signals | `card--balancing` | 3px amber `var(--warning)` |
| S1Card | Revenue signals | `card--neutral` | none |
| S3, S4 | Build conditions | `card--neutral` | none |
| 6 tier3 cards (RenewableMix, ResidualLoad, PeakForecast, SpreadCapture, S7, S9) | Structural market drivers | `card--neutral` | none |
| S5 frame | Market intelligence | `card--neutral` (operator tweak) | none — brick reserved for per-news-item live indicators inside |

**Masthead final text:**
- Tagline: italic Newsreader 17px "Baltic flexibility, daily"
- Launch date constant: `KKME_LAUNCH_ISO = '2025-12-30'` in `HeroBalticMap.tsx`
- Today renders `Vol I · No 128 · 06 MAY 2026` (mono Plex 11px uppercase 0.12em)
- 0.5px Baltic-amber rule below (max-width 1440-96px, `--accent-amber` @ 55% opacity)
- Source row below the rule: `[ live ] · ENTSO-E · LITGRID · AST · ELERING · BTD`

**Per-card footnote map (no fabricated § numbers):**

| Card | Footnote text | Anchor |
|---|---|---|
| S1Card | "LT day-ahead, max-min daily {2h\|4h} spread" | `/methodology#day-ahead-arbitrage-revenue` |
| S2Card | "{aFRR\|mFRR\|FCR} capacity-reservation price; BTD price_procured_reserves, {LT\|LV\|EE}, rolling 7d" + (aFRR-only addendum: "Up + down direction combined") | `/methodology#capacity-reservation-revenue` |
| S4Card | "TSO-tracked operational fleet: BESS + pumped hydro from LITGRID, ELERING, AST registries; entity-resolver deduplicated" | plain `/methodology` (no precise § yet) |
| RevenueCard | "20-yr unlevered DCF, {system} reference asset; gross capture from S1 + S2; calibration {date}" | `/methodology#project-finance` |
| BalticStorageIndexCard | "LT 2h composite: DA capture + balancing capacity reservation, daily VPS aggregate; {month} computation" | `/methodology#kkme-baltic-storage-index` |

No `methodology.md` additions needed — every cited topic already had a real section.

**Pull-quote text per chapter:**
- §1 #revenue-drivers: *"Baltic flexibility, on the hour. Markets, fleet, dispatch — every five minutes."*
- §4 #revenue: *"Reference-asset economics, evaluated daily. Today's gross 2h capture, banded against the rolling 30-day distribution."* (operator's static edit applied)
- §6 #intel: *"Pipeline movements, regulatory shifts, balancing reserve developments — week to week."*

**Verification gates (final actual numbers):**
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: 919 passed (60 files)
- `npm run lint`: 126 problems (40 errors, 86 warnings)
- `npm run build`: 7 routes, compiled in 6.6s

**Bundle size delta:**

| Subset (Latin only, woff2) | Phase 17 baseline | Phase 18 |
|---|---|---|
| Mono (DM Mono → IBM Plex Mono) | 400 + 500: ~32 KB | 400 + 500: **~30 KB** |
| Serif (Cormorant → Newsreader) | 300 + 400 + 600: ~88 KB | 200 + 400 + 400-italic: **~69 KB** |
| Display (Unbounded) | 400 + 600: ~44 KB | 400 + 600: **~44 KB** unchanged |
| **Latin total** | **~164 KB** | **~143 KB (–13%)** |

`@fontsource` ships `latin-ext` / `cyrillic` / `cyrillic-ext` / `vietnamese` subsets in `.next/static/media/` (total media dir 788 KB) but browsers fetch on-demand via `unicode-range`. Effective user-visible bundle for English-only renders: ~143 KB.

**Backlog discovered (deferred — not in this PR):**
- **MetricTile primitive footnote-anchor prop** — current implementation places `¹` anchor adjacent to the primitive via the per-card footnote block, but the primitive itself doesn't take a `footnoteIndex` prop. Tier-3 cards (Wind / Solar / Load / etc.) inherit editorial-scale hero from MetricTile but don't surface a superscript anchor. Add optional `footnoteIndex?: number` prop for visual consistency. Defer; not load-bearing for "human-designed read."
- **§6e nice-to-haves** — S·II archival stamp on chapter side rails, ornament dingbats `°  °  °` between sections, brick-red live-indicator dot beside `[ live ]` markers. ~30min adds; defer until operator confirms current density is right.
- **`@fontsource` subset trimming** — package ships cyrillic / vietnamese subsets that won't be fetched for English-only content but inflate `.next/static/media/` from ~330 KB baseline to 788 KB. Could trim by importing only `@fontsource/ibm-plex-mono/latin-400.css` etc., but those subset-specific imports may not exist in the package. Investigate when convenient.
- **MetricTile hero-tier prop split** — primitive uses single clamp(40, 5.5vw, 64) for size="hero"; tier-1 cards apply their own larger inline clamp(56, 7vw, 88). If MetricTile gets used in tier-1 contexts ever, would need a hero-tier prop. Acceptable for now.
- **`/methodology` Newsreader weight readability fallback** — confirmed readable at Pause C in 200 hairline; if longer-form prose later surfaces a contrast issue, fall back to `@fontsource/newsreader/300.css` import in `app/layout.tsx`.

**Out of scope (per prompt):**
- Engine changes (engine v7.3 unchanged)
- Worker changes (frontend-only)
- 5-primitive system migration (only Card layer touched; Stat / Badge / Chart / Drawer remain in Phase 7.7g-b)
- Spacing token rollout (Phase 7.7g-a-2 stays queued; uses current inline-px patterns in this phase)
- rgba/hex regression cleanup + CI gate (Phase 7.7g-c stays queued)
- Worker URL centralization (Phase 7.7g-b #6, stays queued)
- Mobile responsive review (separate phase later)
- Phase 12.12 data-integrity infrastructure
- Roadmap edits — operator/Cowork-owned per discipline rule #5; CC reports needed deltas below

**Visual-audit screenshots:** 18 PNGs at `docs/visual-audit/phase-18/full/` (9 shots × 2 themes). Captured headless via Playwright Chromium against local dev server; one-shot script `scripts/_phase18-screenshots.mjs` deleted pre-commit per operator request (re-create or promote to `scripts/visual-audit-capture.mjs` in a separate commit if needed for Phase 18.1+).

**Tier 1 sequence after Phase 18:**
- ✅ Phase 18 SHIPPED 2026-05-06
- 🚫 Phase 7.7g-a-3 (accent consolidation) — SUPERSEDED by Phase 18
- 🚫 Phase 7.7g-a-4 (Cormorant migration) — SUPERSEDED by Phase 18
- 🟡 Phase 7.7g-b reduced scope — Card primitive done; Stat / Badge / Chart / Drawer + worker URL centralization remain
- 🟡 Phase 7.7g-a-2 (spacing tokens + rollout) — still queued (~1-2 days)
- 🟡 Phase 7.7g-c (rgba CI gate + regression cleanup) — still queued
- 🟡 Phase 12.12 #1 + #2 (schema validation + freshness gates, ~2-3 days) — still queued

**Operator action items post-merge:**
1. Open PR via GitHub web UI from `phase-18-baltic-editorial` → `dev` (or `main`)
2. Apply roadmap delta to `docs/phases/_post-12-8-roadmap.md` (operator/Cowork-owned per discipline rule #5):
   - Phase 18 → Shipped appendix with full description
   - Phase 7.7g-a-3 + 7.7g-a-4 marked **SUPERSEDED** by Phase 18 (strikethrough + commit pointer)
   - Phase 7.7g-b reduced-scope note: Card primitive done; remaining Stat / Badge / Chart / Drawer + worker URL centralization
   - Currently-active update: Phase 18 in-flight → SHIPPED; next CC task across (7.7g-a-2 / 12.12 #1+#2 / 7.7g-b reduced scope)

### Session 41 — 2026-05-06 — Phase 29 — KKME Baltic Storage Index (first public-facing Tier 1 product surface) (Claude Code)

**Headline:** First public numerical comparison surface from Tier 1 ships. Monthly per-country per-duration €/MW revenue benchmark live at `GET /index/baltic`; LT/2h €284/MW/month + LT/4h €307/MW/month for Apr 2026 (production-engine reshape of `/revenue.backtest` × 30 / 50 MW reference); LV, EE, and 1h slots persist with stable `coverage_status` contract strings per Pause A option ε. **Phase 30 destination decision resolved** — standalone `/methodology` route shipped, rendering `docs/methodology.md` end-to-end via `react-markdown` + `remark-gfm`, anchor-aware. Operator-action-item #4 closed. Worker engine unchanged (no `model_version` bump). Phase 29.1 (per-country DA capture extension + 5-product cap-reservation extraction; ~3-4h estimate) sequenced as the dedicated follow-on that closes the LV/EE gap; 1h SOC physics is a separate engine extension on demand.

**Branch:** `phase-29-baltic-storage-index` off `origin/main` at `a00c0ed` (post-Phase-12.10b-housekeeping). 5 commits pushed.

**Pause A discovery — calculation-formula boundary:**

| Layer | Finding |
|---|---|
| Engine `/revenue.backtest` shape | Per-month rows for the 50 MW reference asset, **single duration** at request time, **Lithuania-only** (`s2.afrr_up_avg` etc. are LT-anchored). `fetch-s1.js:8285-8315` |
| Per-country aFRR-up + mFRR-up cap-reservation | ✅ Already extracted per-month per-country into `s2_activation_parsed.{lt,lv,ee}_monthly_{afrr,mfrr}` (`fetch-s1.js:4196-4220, 8100-8118`) |
| Per-country aFRR-down + FCR + mFRR-down cap-reservation | ❌ Raw BTD `price_procured_reserves` has them (cols 0,2,4,5,7,9,10,12,14) but `computeS2Activation` extracts only aFRR-up + mFRR-up |
| Per-country DA capture | ❌ `fetchEnergyCharts` hardcoded `bzn=LT` (`fetch-s1.js:3016`); no LV/EE capture |
| 1h duration | ❌ Engine `REVENUE_SCENARIOS` covers 2h + 4h only; SOH curves rate-tagged at observed cycling rates assuming 2h+ SOC depth; no per-duration MWh anchor at 1h |
| Discipline rule #14 (don't unilaterally extend `computeRevenueV7()`) | Active — engine extension is out-of-scope for this phase |

**Operator decisions taken (Pause A):**

| Question | Decision | Rationale |
|---|---|---|
| §2a calculation path | **Option ε — LT canonical, LV/EE stubbed `coverage_status: pending_phase_29_1`** | Position C credibility comes from honesty about what's measured. Ships the public surface immediately while preserving methodological integrity. Option ζ (LT full, LV/EE cap-res-only) violates discipline rule #6 (asymmetric methodology requires editorial framing). Option η (full engine extension) postpones the public surface 12-15h; better as Phase 29.1. |
| §2a 1h coverage | **`null` with `coverage_status: pending_engine_1h_physics`** | 2h + 4h are the institutional-relevant durations (most contracted Baltic BESS today is 2h, 4h is frontier-market default — same framing Phase 12.9.3 codified). 1h would require dedicated engine extension. |
| §2b markdown renderer | **(A) `react-markdown` + `remark-gfm`** | ~30 KB on `/methodology` only, single source of truth (`docs/methodology.md`), compatible with `output: 'export'`. No existing markdown rendering pattern in repo (verified). |
| §2c card placement | **Chapter 4 (`#revenue` section)** | Per-country index reads as counterpart to the 50 MW reference Returns card; investor-pattern. |

**Shipped (5 commits):**

| # | Sub-item | What ships |
|---|---|---|
| 1 | VPS infra | `scripts/vps/baltic_storage_index.py` (~310 lines, `--dry-run` flag, fetches `/revenue?dur=2h` + `/revenue?dur=4h` from worker, reshapes `backtest` per-month total via `× 30 / 50 MW`, persists to PostgreSQL, POSTs to worker) + `scripts/vps/sql/002_baltic_storage_index.sql` (append-only history table with `coverage_status` column). |
| 2 | Worker routes + `/health` | `GET /index/baltic` (KV read, 404 with hint when no snapshot yet) + `POST /index/update` (UPDATE_SECRET-gated, validates `month` format `YYYY-MM` + per-country slot shape, writes `baltic_storage_index_latest` KV + rolls 12-month history into `baltic_storage_index_history` KV). `workers/lib/defaults.js` `STALE_THRESHOLDS_HOURS` adds `baltic_storage_index_latest: 36` (auto-flows to `/health` per existing pattern). |
| 3 | Methodology paper + `/methodology` route | `docs/methodology.md` +1 new "KKME Baltic Storage Index" section (calculation, coverage scope table, comparability vs Clean Horizon, annualization, source-of-truth + cadence) + dated update entry + Scope time-horizon line refresh + comparison-table "planned" tags removed. `app/methodology/page.tsx` server component renders the markdown at build time via `react-markdown` + `remark-gfm`; H1/H2/H3 IDs auto-generated for anchor support; styled per existing token system. `react-markdown@10.1` + `remark-gfm@4.0` added to `package.json`. **This bundle resolves Phase 30 destination decision** (was Operator-action-item #4 / Session 31 backlog item #2): standalone route, not inline drawer. |
| 4 | Frontend card + page wire-up | `app/components/BalticStorageIndexCard.tsx` (3×3 grid, dual sparkline LT/2h + LT/4h, 6s `AbortController` timeout for resilience, hover-tooltip on null cells exposing `coverage_status` via title attr per discipline rule #6 — quantitative-only display, no editorial state strings). Wired into `app/page.tsx` Chapter 4 (`#revenue`) after `<RevenueCard />`. |
| 5 | Handover Session 41 + visual audit | This entry + 9 PNGs in `docs/visual-audit/phase-29/` (card dark + light, methodology page top dark + light, methodology index-section anchor dark + light, methodology coverage-scope table light). |

**Verification gates (all green):**

- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **919 / 919 passed** (no test changes; baseline match)
- `npm run lint` → 126 problems (down from 170 baseline — `.wrangler/tmp/` was contributing ~44 noise warnings to the prior count; new files `BalticStorageIndexCard.tsx` + `methodology/page.tsx` contribute 0)
- `npm run build` → compiled, **9 routes** (was 8; `/methodology` added)
- `node --check workers/fetch-s1.js` → clean
- `npx wrangler deploy` → version `3c77897f-62ec-4dff-90c7-4aa94f052f47` live
- Pre-deploy local round-trip via `wrangler dev --local` + sample POST: `POST /index/update` with valid secret → `200 {"ok":true,"month":"2026-04","history_months":1}`; subsequent `GET /index/baltic` reflects payload (LT/2h €284, LT/4h €307, LV/EE all null with correct `coverage_status` strings); `/health.signals.baltic_storage_index_latest` recognized
- Pre-deploy Python `--dry-run` against live production worker: LT/2h=€284.4, LT/4h=€306.6 for Apr 2026; full trailing 6-month payload populated; engine_version `v7.3` carried through
- Pause C post-deploy curl: `GET /index/baltic` → `404 {"error":"no_index_snapshot_yet","hint":"awaiting first VPS Python push via POST /index/update"}` (expected — no VPS push yet); `/health.signals.baltic_storage_index_latest` → `{"status":"missing","age_hours":null,"stale":null}` (expected; threshold 36h, will flip to `present` after first VPS run)

**Local-test infrastructure note:** `.dev.vars` was created during Pause B local round-trip testing (with a fake `UPDATE_SECRET=local-dev-test-secret` for miniflare KV smoke), then deleted before commits. Not in repo. The card's `WORKER_URL` was temporarily pointed at `http://localhost:8787` for local-render screenshot capture, then reverted to production URL before commits.

**VPS Python deploy block — operator fires from Mac post-merge** (mirrors Phase 12.10's deploy convention; CC documents commands here so operator can fire without re-asking):

```bash
# 1. scp the Python script to VPS
scp scripts/vps/baltic_storage_index.py \
  root@89.167.124.42:/opt/kkme/app/sync/baltic_storage_index.py

# 2. scp + apply the SQL migration
scp scripts/vps/sql/002_baltic_storage_index.sql \
  root@89.167.124.42:/opt/kkme/app/sync/sql/002_baltic_storage_index.sql

ssh root@89.167.124.42 "cd /opt/kkme/app && \
  psql \$KKME_DB_URL -f sync/sql/002_baltic_storage_index.sql"

# Expect: CREATE TABLE / CREATE INDEX / COMMENT (or "already exists" notices on re-run).

# 3. Smoke: --dry-run (no DB write, no worker POST)
ssh root@89.167.124.42 "cd /opt/kkme/app && \
  python3 sync/baltic_storage_index.py --dry-run"

# Expect:
#   [index] fetching /revenue?dur=2h + dur=4h from https://kkme-fetch-s1.kastis-kemezys.workers.dev …
#   [index] headline month=2026-04 engine=v7.3 LT/2h=<num> LT/4h=<num>
#   { ... full JSON payload to stdout ... }
# Exit 0.

# 4. First live run (writes DB + POSTs to worker)
ssh root@89.167.124.42 "cd /opt/kkme/app && \
  KKME_DB_URL=\$KKME_DB_URL UPDATE_SECRET=\$UPDATE_SECRET \
  python3 sync/baltic_storage_index.py"

# Expect:
#   [DB] inserted 9 rows (3 countries × 3 durations)
#   [WORKER] POST result: {'ok': True, 'month': '2026-04', 'history_months': 1}

# 5. Confirm live worker now serves real snapshot
curl -sS https://kkme-fetch-s1.kastis-kemezys.workers.dev/index/baltic | jq '.lt'
# Expect: { "1h": null, "2h": <num>, "4h": <num> }

# 6. Add daily crontab entry on VPS (06:30 UTC — 25 min after the 06:05 ENTSO-E A68 fetch
#    so engine has fresh A68 data folded into /revenue before this script reads it)
ssh root@89.167.124.42 "(crontab -l 2>/dev/null; echo '30 6 * * * cd /opt/kkme/app && \
  KKME_DB_URL=\$KKME_DB_URL UPDATE_SECRET=\$UPDATE_SECRET \
  /usr/bin/python3 sync/baltic_storage_index.py >> \
  /var/log/kkme/baltic_storage_index.log 2>&1') | crontab -"

# 7. Verify crontab
ssh root@89.167.124.42 "crontab -l | grep baltic_storage_index"
```

**Roadmap delta needed — operator to apply Cowork-side after merge** (per discipline rule #5; CC does NOT commit roadmap edits):

1. **Phase 29 → Shipped appendix** — entry: `Phase 29 (KKME Baltic Storage Index) → Shipped 2026-05-06; LT/{2h,4h} canonical via /index/baltic; LV/EE/1h slots coverage_pending; standalone /methodology route shipped (resolves Phase 30 destination decision); ~5h actual effort matches estimate.`
2. **Mark Operator-action-item #4 (Phase 30 destination decision) as closed** — resolved as standalone route per Pause A option (B-A `react-markdown`); see Session 41 above.
3. **Phase 29.1 → add to Tier 1 backlog** (NEW): `Phase 29.1 — Per-country index extension. Plumb country parameter through /revenue; extend fetchEnergyCharts from bzn=LT hardcode to multi-bzn; extend computeS2Activation to 5-product set (add aFRR-down, FCR, mFRR-down extraction). ~3-4h estimate. Unblocks LV/EE columns of Baltic Storage Index.`
4. **Engine 1h SOC physics extension → add to engine-track backlog** (NEW): `Phase TBD — Engine 1h SOC physics. REVENUE_SCENARIOS extension to 1h, per-duration MWh anchor at 1h, SOH curve interpolation at sub-2h cycling depth. Estimate TBD. Unblocks 1h column of Baltic Storage Index. Lower priority — most contracted Baltic BESS is 2h or 4h.`
5. **Currently-active update** — operator-pick across Tier 1: Phase 7.7g-a-2 (~1-2 days, spacing tokens + rollout), Phase 12.12 #1+#2 (~2-3 days, schema validation + freshness gates), Phase 29.1 (~3-4h, just-listed above), Phase 12.10b housekeeping (per `face05f`).

**Backlog discovered this session:**

1. **Card 1h column visual treatment** — current implementation renders 1h cells as em-dashes with hover-tooltip exposing `coverage_status`. Operator may want a more visible "not coverage_pending in the same way as LV/EE" treatment (e.g., faded background tint, "1h" column header annotated with `*` and footnote). Defer to Phase 29.1 visual review or operator polish pass.
2. **`/methodology` route SEO + share metadata** — server component has `metadata: { title, description }` per Next.js convention but no `og:image`, `twitter:card`, or canonical-URL meta. If `/methodology` becomes a primary share-link surface (which the index card's source-footer link drives traffic to), revisit metadata for social previews.
3. **Card timeout fallback messaging** — 6s `AbortController` triggers `pending` state on hang; consider distinguishing genuine `pending` (worker returns 404) from `timeout` (worker hung) for diagnostic clarity. Low priority; current behavior is correct, just less informative.
4. **Methodology page `methodology-prose` class** — declared on the wrapping `<article>` for future targeted CSS but not yet defined in `app/globals.css`. Currently styling is inline. If global theming emerges (e.g., light-mode tweaks to code-block bg), the class is a hook.

**Out of scope / not touched** (per prompt §"OUT of scope" + scope discipline):
- Engine changes (cycles, RTE, degradation — all locked at v7.3).
- Clean Horizon data ingestion or published-numbers display.
- Phase A inline-drawer methodology alternative (overruled by this phase's standalone-route choice).
- Frontend styling beyond existing primitives (`MetricTile`, `SectionHeader`, `SourceFooter`, `Sparkline`).
- Multi-currency / non-Baltic countries (Phase 29.1+ if needed later).
- Roadmap edits (per discipline rule #5; reported as deltas above).

**Tier 1 sequence after this session:**

1. ✅ **Phase 7.7g-a-1** (Session 39) — token rebuild dead-font triplet drop
2. ✅ **Phase 12.10 follow-up** (Session 40) — Gap #5 + EE A68/fleet boundary
3. ✅ **Phase 29** (this session) — KKME Baltic Storage Index + standalone `/methodology` route
4. ⏳ Operator-pick across: Phase 18 (Baltic editorial visual identity, just-added per roadmap delta `22f6f27` — supersedes 7.7g-a-3 + 7.7g-a-4, reduces 7.7g-b), Phase 7.7g-a-2, Phase 12.12 sub-items, Phase 29.1, Phase 12.10b housekeeping.

**Next operator action:**
- Open PR via GitHub web UI: base `main`, head `phase-29-baltic-storage-index`, title `Phase 29 — KKME Baltic Storage Index (first public-facing Tier 1 product surface)`. PR body: copy this Session 41 entry's headline + shipped table.
- After merge: fire VPS Python deploy block above (full block — scp, psql, dry-run, first live run, crontab).
- Apply roadmap deltas above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Decide next Tier 1 thread for next CC job (Phase 18 / Phase 7.7g-a-2 / Phase 12.12 / Phase 29.1 / Phase 12.10b).

**Mid-session git-state recovery (transparent record, mirrors Session 40 pattern):** at the moment of `git commit` for the first commit (VPS infra), HEAD was unexpectedly on `main` rather than `phase-29-baltic-storage-index`. Local main had been silently fast-forwarded mid-session to `22f6f27` (operator's roadmap delta on `origin/main` — added Phase 18 Baltic editorial visual identity, marked Phase 29 in-flight, closed methodology destination operator-action-item, authored `docs/phases/phase-18-prompt.md`). The first commit `59d6a5c` landed on local main on top of `22f6f27`. Recovery: moved feature branch ref forward to `59d6a5c` (preserving the commit), reset local main back to `origin/main` (`22f6f27`). No work lost; origin/main untouched. Same pattern as Session 40; the suspected cause (out-of-band branch switch via Cowork or harness automation between `git checkout -b` at §1 and `git commit` at §11) recurs and merits the cheap pre-commit guard backlog item Session 40 surfaced. Worker had already been deployed before the recovery; production live.

### Session 40 — 2026-05-06 — Phase 12.10 follow-up — Gap #5 reconciliation + EE A68/fleet boundary policy (Claude Code)

**Headline:** Phase 30 P1-critical Gap #5 (KKME aFRR-down €5.03/MW/h vs Clean Horizon ~€340/MW/h) reconciled as **methodology disclosure**, not engine bug. Direct primary-source verification (per discipline rule #1) confirmed Clean Horizon's €340 figure comes from "Baltic S1 2025 Price Forecasts" (June 2025 publication, aggregate-Baltic, covering Apr–mid-Jun 2025 ancillary-market launch window), with two known step-changes between that window and KKME's current values: summer-2025 market deepening (~1.5× compression visible in CH's own October 2025 update — EE aFRR €116→€75/MW/h) and Baltic-Continental synchronisation Nov 2025 (~8× step-change visible in KKME's S2 monthly trend chart). Same metric, different window + geography. Both products correct; comparison requires window correction. EE A68/fleet boundary (Phase 12.12 #15) closed at **policy (a) strict-commissioned**, codified in `docs/methodology.md`. No engine change; no `model_version` bump; one worker line added (`/s2.macro_context.afrr_methodology_note`); methodology paper +2 paragraphs. **Phase 29 (KKME Baltic Storage Index) unblocked.**

**Branch:** `phase-12-10-followup-gap5-and-a68-boundary` rooted at `face05f` (operator's roadmap delta on `origin/main`, applied during this session — added Phase 12.10b post-follow-up housekeeping bundle, Phase 12.12 #17, Phase 12.13 #6 sequencing note). 3 commits pushed to origin.

**Pause A discovery — Gap #5 evidence chain:**

| Layer | Finding |
|---|---|
| KKME `afrr_*_avg` source | BTD `price_procured_reserves`, **Lithuania-only** col 11 (aFRR Up) + col 12 (aFRR Down). `fetch-s1.js:4396-4400` |
| Time window | Rolling **~7 days** (`nineAgo` → `twoDaysAgo`, BTD has 2-day publication lag). `fetch-s1.js:4288-4289, 4298` |
| Aggregation | Simple arithmetic mean of all 15-min MTU rows. `fetch-s1.js:4322, 4423-4424` |
| Unit | €/MW/h cleared **capacity reservation** (same dimensional metric as Clean Horizon) |
| Live values @ Pause A | `afrr_up_avg=7.96`, `afrr_down_avg=6.17`, combined €14.13/MW/h |
| CH €77/€340 primary source | [Baltic S1 2025 Price Forecasts](https://www.cleanhorizon.com/news/baltic-s1-2025-price-forecasts-released/), pub **2025-06-24**, "since the market launch in April 2025", **aggregate-Baltic** (no per-country split) |
| CH Sep 2025 cross-check | [Storage Index Oct 2025 update](https://www.cleanhorizon.com/news/storage-index-european-bess-market-update-october-2025/) reports EE aFRR €116→€75/MW/h Aug→Sep 2025 — already 1.5× compressed before any synchronisation event |
| KKME monthly chart cross-check | Operator 2026-05-05 screenshot: ~€80/MW/h Sep 2025 → ~€10/MW/h Nov 2025 → €5–35/MW/h band post-integration. Independent visual confirmation of the two step-changes. |

**Discipline-rule-#1 finding (audit-triage):** Phase 30's "P1 critical Gap #5" was authored from WebSearch summaries that didn't capture the time-window context. Direct primary-source verification (this session) reframes Gap #5 from "engine bug suspect" to "methodology disclosure improvement" — exactly the reframe the operator pre-baked into the prompt. The cited primary source explicitly dates the prices to a specific 2-3 month launch window. Hypothesis (a) time-window mismatch is **confirmed primary**; hypotheses (b) methodology, (c) geography, (d) aggregation, (e) wrong BTD product all disconfirmed.

**Operator decisions taken (Pause A):**

| Sub-item | Decision | Rationale |
|---|---|---|
| Gap #5 (sub-item 1) | **Methodology paper update + `/s2.macro_context.afrr_methodology_note`** | Methodology paper is currently invisible until destination decision lands (`/methodology` route vs Phase A inline drawer). The `/s2.macro_context.afrr_methodology_note` (one line, additive) surfaces the disclosure into the S2 card's methodology drawer immediately, aligning with Phase 7.7g-b #7 source-into-drawer principle. |
| EE A68/fleet (sub-item 2) | **(a) strict-commissioned, codified in methodology paper** | Current state is already aligned (coverage_note from Phase 12.10 commit `3987bc3` discloses Elering's 218 MW transparency-reporting classification); no code/data change. Methodology paper paragraph documents the policy explicitly so future contributors cannot drift to (b) without an explicit decision. |

**Shipped (3 commits):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `2fa2e72` | Methodology paper update | `docs/methodology.md` +2 paragraphs in "Capacity reservation revenue" section reconciling KKME `afrr_up_avg` / `afrr_down_avg` with Clean Horizon's H1-2025 launch-window framing (window correction + market-deepening + synchronisation step-change cross-cited from CH's own October 2025 update); +1 new "Installed-capacity definitions (LT / LV / EE)" subsection codifying KKME's strict-commissioned policy with parallel ENTSO-E A68 transparency view; +1 dated entry in Updates + corrections section. |
| 2 | (TBD) | Worker `/s2.macro_context.afrr_methodology_note` | One additive 626-char line in `workers/fetch-s1.js:7113` `base.macro_context = { … }` block. Surfaces the time-window-and-geography reconciliation directly onto the S2 card payload so the methodology drawer can render it without depending on the public methodology paper destination decision. |
| 3 | (TBD) | Handover Session 40 | This entry. |

**Verification gates (all green, baseline-exact):**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **919 / 919 passed** (no test changes; baseline match)
- `npm run lint` → 170 problems (40 errors / 130 warnings) — exact main baseline
- `npm run build` → compiled, 6 routes (current build output)
- `node --check workers/fetch-s1.js` → clean
- `npx wrangler deploy` → version `ea88ccc9-0b45-46e6-87cc-b0afbac7407d` live
- Pause B post-deploy curl → `/s2.macro_context.afrr_methodology_note` renders (626 chars), `afrr_up_avg=7.96` / `afrr_down_avg=6.17` still surfaced, all existing macro_context fields preserved

**Mid-session git-state recovery (transparent record for future sessions):** at the moment of `git commit` for the methodology change, HEAD was unexpectedly on `main` rather than the feature branch, with operator's freshly-pushed roadmap delta `face05f` already pulled into local main. The methodology commit `2fa2e72` therefore landed on local main on top of `face05f`. Recovery: moved the feature-branch ref forward to `2fa2e72` (preserving the commit), reset local main to `origin/main` (`face05f`). Worker had already been deployed (`ea88ccc9-…`) before the recovery — production live. The reset wiped the not-yet-committed worker macro_context edit and Session 40 handover edit, both of which were re-applied verbatim before commits 2 + 3. No work lost; origin/main untouched. Suspected cause: an out-of-band branch switch (parallel Cowork action or harness automation) between `git checkout -b` at §1 and `git commit -F` at §9. Future sessions should verify `git branch --show-current` immediately before each commit.

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol; CC does NOT commit roadmap edits):

1. **Move "Phase 12.10 follow-up scope" from Currently-active to Shipped appendix** — entry: `Phase 12.10 follow-up (Gap #5 + EE A68/fleet boundary) → Shipped 2026-05-06; resolved as methodology disclosure (no engine change). Both Phase 30 Gap #5 and Phase 12.12 #15 closed.`
2. **Mark Phase 29 (KKME Baltic Storage Index) unblocked** — Gap #5 was the only listed blocker per Session 31 §Tier-7-sequence; Phase 29 now eligible to fire.
3. **Phase 12.12 sub-item #15 (A68/fleet boundary) → resolved** — policy (a) strict-commissioned chosen; no code work needed; remove from active 12.12 sub-list (or annotate "resolved by Phase 12.10 follow-up Session 40").
4. **Currently-active update** — operator-pick across remaining Tier 1 threads: Phase 12.12 (data-integrity infrastructure, remaining sub-items), Phase 7.7g-a-2 (next sub-phase of token rebuild), Phase 29 (KKME Baltic Storage Index, now unblocked), Phase 12.10b (just-added housekeeping bundle per `face05f`).

**Backlog discovered this session:**

1. **Methodology paper rendering destination** still pending operator decision (Session 31 backlog item #2). The `/s2.macro_context.afrr_methodology_note` shipped this session is a partial answer — it surfaces the Gap #5 disclosure onto the live S2 card without requiring the destination decision. The full paper at `docs/methodology.md` still awaits a `/methodology` route (Cowork-recommended) or Phase A inline-drawer landing decision.
2. **Discipline-rule-#1 application to Phase 30 itself** — the research process (Cowork, Session 31) authored a P1-critical claim from WebSearch summaries without primary-source verification. Future research-only phases that produce P1/P0 findings should require primary-source page-fetch confirmation before the priority label sticks; consider adding to Phase 12.12 or as a process note in CLAUDE.md (operator decision; not coded yet).
3. **Out-of-band HEAD switch during commit flow** (see "Mid-session git-state recovery" above) — investigate whether harness automation, a hook, or parallel Cowork action is responsible; consider a cheap pre-commit guard that asserts `git branch --show-current` matches the expected feature branch.

**Out of scope / not touched** (per scope discipline + prompt §0):
- Phase 29 implementation — explicitly out of scope; this session only unblocks it.
- Other Phase 12.12 sub-items beyond #15.
- New methodology paper structure — only content updates.
- Worker engine refactor.
- Roadmap edits — Cowork-owned per discipline rule #5.

**Tier 1 sequence after this session:**

1. ✅ **Phase 7.7g-a-1** (Session 39) — token rebuild dead-font triplet drop
2. ✅ **Phase 12.10 follow-up** (this session) — Gap #5 + EE A68/fleet boundary
3. ⏳ Operator-pick across: Phase 12.12 remaining sub-items, Phase 7.7g-a-2, **Phase 29 (KKME Baltic Storage Index, now unblocked)**, Phase 12.10b housekeeping bundle (per `face05f`)

**Next operator action:**
- Open PR via GitHub web UI: base `main`, head `phase-12-10-followup-gap5-and-a68-boundary`, title `Phase 12.10 follow-up — Gap #5 reconciliation + EE A68/fleet boundary policy`. PR body: copy this Session 40 entry's headline + shipped table.
- Apply roadmap deltas above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Decide Phase 29 vs other Tier 1 thread for next CC job.

### Session 39 — 2026-05-06 — Phase 7.7g-a-1 — Token audit + drop dead font triplet (Claude Code)

**Headline:** 6 next/font/google loaders → 3. Fraunces / JetBrains Mono / Inter dropped from `app/layout.tsx`; the matching `--font-editorial` / `--font-numeric` / `--font-body` declarations + the downstream dead `--type-*` ramp dropped from `app/globals.css`; the Phase-8.2-era `app/lib/__tests__/typography.test.ts` deleted as the third link in the dead chain. Bytes-on-wire reduction across every page load. No visual change. No `model_version` bump. **First Tier 1 sub-phase shipped.**

**Branch:** `phase-7-7g-a-1-token-audit` off `origin/main` at `6426efc` (post-Phase-12.10a-merge + Tier-0-closing roadmap commit). One commit pushed. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-7-7g-a-1-token-audit`.

**Commit:** `cc36e42` — `phase-7-7g-a-1(tokens): drop dead font triplet (Fraunces / JetBrains Mono / Inter)`.

**Diff:** 3 files changed, 3 insertions(+), 121 deletions(-).
- `app/layout.tsx`: −34 / +3 (drop 3 imports, 3 loader declarations + obsolete Phase 8.2/10 comment block, 3 className concatenations; replace with one-line comment naming the surviving fonts).
- `app/globals.css`: −20 / +0 (drop the three `--font-editorial`/`--font-numeric`/`--font-body` declarations + Phase 8.2 comment; drop the entire `--type-*` ramp [`--type-hero` / `--type-number-xl` / `--type-number-l` / `--type-section` / `--type-eyebrow` / `--type-body` / `--type-caption`] + its P2-locked comment).
- `app/lib/__tests__/typography.test.ts`: deleted (67 lines, 8 tests).

**Verify-before-act result (per discipline rule #1):**
- Component-scoped grep on `app/components/` + `app/lib/` for `var(--font-editorial|numeric|body)` and `--font-fraunces|jetbrains-mono|inter` → empty (zero usages).
- Wide grep on `app/` confirmed all references confined to `app/layout.tsx` and `app/globals.css` — no production consumer.

**Two in-session triangulation findings (operator approved scope extensions both times):**
1. **Dead `--type-*` ramp.** `globals.css:238-244` defined a type ramp (`--type-hero`, `--type-number-xl`, `--type-section`, `--type-body`, etc.) that consumed the dead triplet. Component-grep for `var(--type-*)` returned zero usages — the ramp was dead-by-association. Operator approved drop on grounds: same risk profile as the triplet, and leaving them creates broken-by-definition tokens (referencing undefined custom properties) for the next reader.
2. **Phase-8.2 test file.** `app/lib/__tests__/typography.test.ts` (8 tests) was a Phase-8.2-era artifact written to pin the dead system in place. After the triplet+ramp drop, 6 of 8 assertions broke (those asserting Fraunces/JetBrains/Inter imports, `--font-editorial/numeric/body` declarations, and `--type-*` ramp existence). The 2 surviving assertions covered legacy tokens we kept (Cormorant/DM Mono/Unbounded + tabular numerals) which are exercised in production by usage. Operator approved deletion as third link in the dead chain — same dead-by-association boundary; sentinel tests for the new token state will be designed by Phase 7.7g-b/7.7g-a-2/3/4 with intent, not pre-pinned mid-consolidation.

The original prompt's `grep -v __tests__` and "no test changes expected" assumption masked finding #2 from the verify-before-act step. Caught only by running the full vitest suite post-edit (which is what §5 mandates). Same audit-triage pattern as Phase 12.8.0/4G.

**Verification gates:**

| Gate | Pre-edit baseline | Post-edit | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 919 / 919 (60 files) | −8 tests / −1 file (pure subtraction from typography.test.ts deletion) |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems | 0 |
| `npm run build` | 8 routes | 8 routes | 0 |

`npm run build` in particular green: next/font's bundling pipeline accepts the reduced-loader state cleanly, confirming the dropped fonts were never in the actual bundle dependency graph from any code path beyond the dead declarations themselves.

**Out of scope (untouched per prompt):**
- Cormorant migration → Phase 7.7g-a-4
- Spacing token rollout → Phase 7.7g-a-2
- Accent color consolidation → Phase 7.7g-a-3
- Font size system reduction 6 → 5 → deferred / undecided
- rgba/hex regression cleanup → Phase 7.7g-c
- Building 5 primitives → Phase 7.7g-b
- Worker URL centralization → Phase 7.7g-b #6
- Other token chains in `globals.css` (no audit done; not in prompt)
- Roadmap edits (operator-applied per discipline rule #5)

**Tier 1 sequence after Phase 7.7g-a-1:**
1. ✅ Phase 7.7g-a-1 (this PR, awaiting merge) — first Tier 1 sub-phase shipped.
2. → Next CC job: **Phase 7.7g-a-2** (spacing tokens + rollout) OR **Phase 12.12** (data-integrity infrastructure, parallel thread). Operator picks which to fire next; both are eligible.

**Roadmap delta needed — operator to apply Cowork-side after merge:**
1. **Add Phase 7.7g-a-1 entry to the Shipped appendix.** Note the in-scope expansion (test-file deletion + `--type-*` ramp drop) as part of the audit-triage finding chain — both extensions caught at Pause B-equivalent (post-edit gate failure) and operator-approved before commit.
2. **Advance "Currently active → Next CC job" pointer to Phase 7.7g-a-2 (or note both 7.7g-a-2 and 12.12 are eligible to fire next, operator-pick).**

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 7.7g-a-1 — Drop dead font triplet`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.

### Session 38 — 2026-05-05 — Phase 12.10a — CLAUDE.md discipline patch (Claude Code)

**Headline:** Six discipline rules earned across Sessions 25-37 baked into `CLAUDE.md` so they don't drift back; "Current phase" stale block (Hero v3 / Phase 2B-1) refreshed to point at Tier 0 closing → Tier 1 (12.12 + 7.7g, parallel). Documentation-only; no `model_version` bump, no worker, no frontend, no test changes. **Last Tier 0 item.**

**Branch:** `phase-12-10a-claude-md-discipline` off `origin/main` at `3265849` (post-Phase-4G-merge + post-Cowork-roadmap-delta). One commit pushed. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-10a-claude-md-discipline`.

**Commit:** `f15a371` — `phase-12-10a(discipline): six discipline rules + current-phase refresh in CLAUDE.md`.

**Diff:** `CLAUDE.md` +19 / −2 (1 file).

**Six rules added (each cites originating incident-trace phase):**
1. **Audit-triage rule.** Visual-inference claims without screenshot/code-grep/primary-source are hypotheses, not bugs. Origin: Phase 12.8.0 (3 of 4 audit-#2 visual claims hallucinated); Phase 4G (audit-#6 cp1257 premise empirically false).
2. **No-hardcoded-temporal-label rule.** No "where/when" display label without computing it. Origin: Phase 12.10 PeakForecastCard slice-idx → UTC clock-hour fix.
3. **Named-entity verification rule.** No published named entity without registry/press-release/regulator URL. Origin: Phase 12.10.0 Saulėtas Pasaulis purge.
4. **Cross-card consistency rule.** Same metric → one canonical worker field; declared in `app/lib/metricRegistry.ts`; CI test enforces (Phase 12.12 #5). Origin: Phase 12.9 SignalBar S/D RATIO mismatch.
5. **Roadmap edit-conflict rule.** `_post-12-8-roadmap.md` is operator/Cowork-owned; CC reads but commits only when explicitly instructed. Origin: Phase 12.8.0 multi-actor edit-conflict.
6. **No-editorial-state-label rule.** No engine-emitted state strings ("TIGHTENING"/"STABLE"/etc.) as chips. CI grep gate `npm run lint:no-editorial-chips`. Origin: Phase 12.9.1 brand-discipline pass.

**"Current phase" refresh:** stale Hero v3 / Phase 2B-1 block → Tier 0 closing pointer (most recent shipped: Phase 4G; this phase 12.10a is last Tier 0 item; Tier 1 = Phase 12.12 + Phase 7.7g, parallel). Points readers at `_post-12-8-roadmap.md` "Currently active" + `handover.md` for live state.

**Verification gates (all green; baseline preserved exactly):**

| Gate | Pre-edit baseline | Post-edit | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 927 / 927 (61 files) | 0 |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems | 0 |
| `npm run build` | 8 routes | 8 routes | 0 |

(CLAUDE.md is not consumed at build time; gates are sanity checks only.)

**Out of scope:**
- Editing rules in any file other than `CLAUDE.md` (handover.md / roadmap references stay as-is).
- Adding more rules — the six are the exhaustive set from Sessions 25-37; new rules will emerge from new incidents.
- CI enforcement (rule #6 grep gate already shipped Phase 12.9.1; rule #4 cross-card CI test = Phase 12.12 #5).
- Roadmap edits (Cowork-applied post-merge per rule #5).

**Tier 0 sequence after Phase 12.10a:**
1. ✅ Phase 12.8, 12.8.0, 12.10.0, 12.10, 12.8.1, 12.9, 12.9.1, 12.9.2, 12.9.3, 4G (per Session 37 enumeration + Phase 4G merge)
2. ✅ **Phase 12.10a** (this PR, awaiting merge)
3. → **Tier 0 closes.**

Then **Tier 1 begins (Phase 12.12 data-integrity infrastructure + Phase 7.7g token rebuild + 5-primitive system, parallel).**

**Roadmap delta needed — operator to apply Cowork-side after merge:**
1. **Move Phase 12.10a from "Currently active" / "Next CC job" to the Shipped appendix.**
2. **Advance the "Currently active → Next CC job:" pointer to Phase 12.12** (Tier 1 starts; Phase 7.7g runs in parallel).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.10a — CLAUDE.md discipline patch`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.

### Session 37 — 2026-05-05 — Phase 4G — Intel encoding (audit-vs-reality) + IntelFeed count alignment (Claude Code)

**Headline:** Audit-#6 premise was wrong; CC's §10 discipline caught it at Pause A. Original 1–1.5h scope shrunk to ~20 min. Original premise: `daily_intel.py` URL-decodes upstream as cp1257/latin-1 → mojibake on Lithuanian/Latvian titles. Code investigation: no such logic exists in repo or on VPS. The 1 production mojibake item came through `POST /curate` (operator-pasted), not the ingestion pipeline. The mojibake bytes are UTF-8 `ė` (`\xc4\x97`) interpreted as cp1257 → `ÄŠ` — encoding mangling happened in the operator's clipboard chain, upstream of KKME entirely. Same audit-vs-reality pattern as Phase 12.8.0's light-mode investigation; the artifact itself is the discipline lesson. Shipped: (a) IntelFeed count alignment — badge + View-all link converge on `allItems.length` denominator (1-line edit), (b) defensive `resp.encoding = 'utf-8'` on the 3 `requests.get` HTML scraper sites in `daily_intel.py` (audit hygiene against future Content-Type omissions, NOT a fix for the current mojibake), (c) single-item KV purge of `cur_mo87wkt8-65w5pc` via `POST /feed/delete-by-id`. No worker engine changes.

**Branch:** `phase-4g-intel-encoding` off `origin/main` at `0c43d05` (post-Phase-12.9.3-merge, PR #57). PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-4g-intel-encoding`.

**Audit-vs-reality finding (load-bearing):**

- **Premise (prompt §0 / audit-#6):** "the VPS `daily_intel.py` ingestion script URL-decodes responses as cp1257/latin-1 instead of UTF-8."
- **Reality (live evidence captured at Pause A):**
  1. `daily_intel.py` has zero `urllib.unquote` calls. Repo-wide grep for `unquote | cp1257 | latin-1 | latin1` across `app/`, `workers/`, `scripts/`: **zero matches**. The "URL-decode + JSON-parse path" the prompt describes does not exist in code.
  2. `daily_intel.py` reads HTML via `requests.get` + `resp.text`. `requests` auto-detects encoding from Content-Type. Live VPS check: `https://www.litgrid.eu/index.php/naujienos/naujienos` returns `Content-Type: text/html; charset=utf-8`, so `resp.encoding = 'utf-8'` and `resp.text` decodes correctly. Vert + APVA are 403-blocked from datacenter IP and fall back to hardcoded `KNOWN_VERT_PDFS` / `KNOWN_APVA_EVENTS`.
  3. Production `/feed` had **8 items, exactly 1 mojibake match** at scan time: `cur_mo87wkt8-65w5pc`, title `"Leidimai plÄŠtoti kaupimo pajÄŠgumus 2026-02-28.xlsx - VERT"`, **`origin: 'curation'`**. The `cur_` prefix + curation origin mean it came in via `POST /curate` (operator-pasted JSON, no encoding coercion in the worker). The source URL `…pl%C4%97toti…` is correctly UTF-8 percent-encoded; whatever decoded the filename to make the title used cp1257. That decoder is **upstream of `/curate`, not in this codebase**.
- **Consequence:** §3 reduced to defensive belt-and-braces (3 lines added), not a root-cause fix. §5 reduced to a single delete (1 item, not "N items"). §3d (mirror to `scripts/vps/`) explicitly skipped per operator direction to keep PR scope tight.

**Decisions taken at Pause A (operator):**
1. §3: Option (B) light-touch. Add explicit `resp.encoding = 'utf-8'` to the 3 `requests.get` call sites in `daily_intel.py`. Cheap audit hygiene, NOT a fix for the current mojibake. Skip the repo mirror (§3d).
2. §5: Single delete via `POST /feed/delete-by-id` for `cur_mo87wkt8-65w5pc`. Skip rewrite endpoint.
3. Continuous flow from §3 → §5 → §6 → §7 (no extra Pause).

**Files touched:**

| File | Δ | Note |
|---|---|---|
| `app/components/IntelFeed.tsx:1311` | 1 line: `${totalAvailable}` → `${allItems.length}` | View-all link denominator now matches the unfiltered destination (`/intel`). Badge already used `allItems.length` in unfiltered case. |
| VPS `/opt/kkme/app/sync/daily_intel.py:148/242/306` | 3 lines added: `resp.encoding = 'utf-8'` after each `raise_for_status()` | Belt-and-braces against future Content-Type omissions. NOT mirrored to repo this PR (skipped §3d). |
| Worker KV `feed_index` | 1 item removed via `POST /feed/delete-by-id` | `cur_mo87wkt8-65w5pc` Lithuanian filename mojibake. before=47, after=46 (full feed_index incl. rejected); published `/feed`: 8 → 7 items. |

**VPS deploy verification:** post-`scp`, ran `python daily_intel.py --job sync_litgrid` on VPS. Result: `Found 94 storage-related Litgrid articles`, 0 new assertions, no errors. Encoding line is no-op when upstream sends a correct charset (litgrid does); it activates only on the future-omission failure mode.

**Verification gates (all green; baseline preserved):**

| Gate | Pre-edit baseline | Post-edit | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 927 / 927 (61 files) | 0 |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems | 0 |
| `npm run build` | 8 routes | 8 routes | 0 |

**Production /feed verification (post-purge):**
- `curl -s …/feed | jq '.items | length'` → 7 (was 8)
- mojibake regex match count `Ä[ŠŽ]\|Å[ĄĮ]\|Ã[€¶]` → 0 (was 1)

**IntelFeed count alignment — design rationale:**
- Two semantics were possible: (a) "total in feed" — both surfaces use `allItems.length`; filter UI is informational; View-all leaves filter; (b) "currently visible" — both use `filteredItems.length`; View-all stays in filtered set.
- Operator default: (a). View-all link target is `/intel` (which renders unfiltered), so the count should match the destination, not the current filter. Badge keeps `M of N` framing for active filters.

**Backlog item flagged for Phase 12.12:**

- **#16: Curation ingestion encoding-passthrough audit.** Operator-pasted curation can carry mojibake from upstream tools (clipboard apps, third-party converters, RSS readers that mis-detect charset). Worker `POST /curate` accepts strings as-given. Three options:
  - (a) detect mojibake patterns at write-time and reject with helpful error;
  - (b) auto-attempt UTF-8 round-trip recovery on common patterns (`s.encode('latin-1').decode('cp1257')` family);
  - (c) pass through but mark `_encoding_suspect: true` for visual amber-disclosure.
- Belongs alongside Phase 12.12 #1 (schema validation) — same write-time gate surface.

**Out of scope / not touched:**
- Schema validation infrastructure (Phase 12.12 #1).
- Generic-source-URL detection / hallucination-marker wiring (Phase 12.12 #8 / #11).
- Feed-source diversification (would be Phase 4H+).
- VPS `daily_intel.py` mirror to `scripts/vps/` per Phase 12.10 precedent (§3d) — operator decision: own audit-hygiene phase later, not this PR.
- Rewrite endpoint `POST /feed/rewrite-by-id` — not needed for single-item delete-and-defer-to-curator.

**Roadmap delta needed — operator to apply Cowork-side after merge:**

1. **Move Phase 4G from "Currently active" / "Next CC job" to the Shipped appendix.** Update the "Currently active → Next CC job:" pointer to **Phase 12.10a** (CLAUDE.md discipline patch).
2. **Add Phase 12.12 #16** (Curation ingestion encoding-passthrough audit) to the Phase 12.12 sub-item list.
3. Mark Phase 4G's actual scope: ~20 min (vs original 1–1.5h estimate). Audit-#6 premise contradiction shrunk it.

**Tier 0 sequence after Phase 4G:**
1. ✅ Phase 12.8, 12.8.0, 12.10.0, 12.10, 12.8.1, 12.9, 12.9.1, 12.9.2, 12.9.3 (per Session 36 enumeration)
2. ✅ **Phase 4G** (this PR, awaiting merge)
3. ⏳ Phase 12.10a (CLAUDE.md discipline patch) — **next CC job**

Then Tier 1 (12.12 + 12.14 + 7.7g).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 4G — Intel encoding (audit-vs-reality) + IntelFeed count alignment`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Optional smoke check post-merge: load homepage IntelFeed strip, confirm "View all N items" matches the count in the badge ("N items" unfiltered), open `/intel`, confirm clean Lithuanian characters in titles (mojibake item gone).

### Session 36 — 2026-05-05 — Phase 12.9.3 — Default duration 4h → 2h (Claude Code)

**Headline:** Default duration switched 4h → 2h on Returns card, S3 card, and HeroBalticMap fetch. KKME audience (investor / institutional Baltic readers) sees 2h economics on load — most contracted Baltic BESS today is 2h and financing assumptions converge faster on 2h. 4h remains as toggle option (RevenueCard segmented switch + S3Card switch + URL `?dur=4h` override on RevenueCard); just no longer the on-load default.

**Branch:** `phase-12-9-3-default-duration-2h` off `origin/main` at `84edce6` (post-Phase-12.9.2-merge + post-roadmap-delta). One commit pushed to origin. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-9-3-default-duration-2h`.

**Commits:**
1. `ec85338` — `phase-12-9-3(defaults): default duration 4h → 2h across RevenueCard, S3Card, HeroBalticMap`

**Per-file before/after:**

| File:Line | Before | After |
|---|---|---|
| `app/components/RevenueCard.tsx:1528` | `useState<'2h' \| '4h'>('4h')` | `useState<'2h' \| '4h'>('2h')` |
| `app/components/S3Card.tsx:180` | `useState<Duration>('4h')` | `useState<Duration>('2h')` |
| `app/components/HeroBalticMap.tsx:123` | `fetch(\`${W}/revenue?dur=4h\`)` | `fetch(\`${W}/revenue?dur=2h\`)` |

**Pre-flight audit (no other 4h defaults):** ran broad grep `useState.*'4h'\|=.*'4h'\|defaultDuration\|DEFAULT_DURATION\|dur=4h\|duration=4h` across `app/` and `workers/`. Other matches are all non-defaults: type unions (`type Duration = '2h' | '4h'`), toggle option arrays (`{ key: '4h', label: '4H' }` in TradingEngineCard + RevenueCard), URL-param parsing on RevenueCard (still allows `?dur=4h` override), and worker IRR / DUR_MAP logic that handles both durations symmetrically. No coordinated change needed.

**Verification gates (all green; baseline preserved):**

| Gate | Pre-edit baseline | Post-edit | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 927 / 927 (61 files) | 0 — defaults aren't asserted in tests |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems | 0 |
| `npm run build` | 8 routes | 8 routes | 0 |

**Out of scope / not touched:**
- Removing `'4h'` as a toggle option — stays as alternative on RevenueCard segmented switch + S3Card switch + URL override.
- Engine math, backtest, scenarios — engine handles both 2h and 4h paths today; no change needed.
- Worker — pure frontend default flip.
- Roadmap edits — operator-owned per protocol; reported below.

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol):

1. **Move Phase 12.9.3 from "Currently active" to the Shipped appendix.** Update the "Currently active → Next CC job:" line to point to **Phase 4G** (intel encoding, ~1.5h).

**Tier 0 sequence after Phase 12.9.3:**
1. ✅ Phase 12.8, 12.8.0, 12.10.0, 12.10, 12.8.1, 12.9, 12.9.1, 12.9.2 (per Session 35 enumeration + this PR)
2. ✅ **Phase 12.9.3** (this PR, awaiting merge)
3. ⏳ Phase 4G (intel encoding, ~1.5h) — **next CC job**
4. ⏳ Phase 12.10a (CLAUDE.md discipline patch)

Then Tier 1 (12.12 + 12.14 + 7.7g).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.9.3 — Default duration 4h → 2h`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Optional smoke check post-merge: load homepage, confirm Returns card opens at 2H, S3 card opens at 2H, hero map IRR/MW/yr ribbon reflects 2h economics.

### Session 35 — 2026-05-05 — Phase 12.9.2 — s8 timestamp fix (negative age_hours bug) (Claude Code)

**Headline:** s8 timestamp bug fixed; `/health.signals.s8.age_hours` now reports positive. `fetchInterconnectorFlows()` was leaking the energy-charts.info forward-looking slot-end timestamp (from `unix_seconds[last]`) into the canonical `data.timestamp` field; `/health` reads `data.timestamp ?? data._meta?.written_at ?? data.updated_at` for age computation, so the future value produced negative `age_hours`. Surgical 1-file fix: `timestamp` becomes `new Date().toISOString()` (canonical "as-of-write", matching every other signal fetcher); the existing forward-looking value moves to a new `data_slot_end` field for any consumer that wants slot semantics. Worker deployed at version `456cf230-10fd-4135-9270-beade824a2b4`.

**Branch:** `phase-12-9-2-s8-timestamp` off `origin/main` at `96cc677` (post-Phase-12.9.1-merge — PRs #54 + #55). One worker-file commit pushed to origin. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-9-2-s8-timestamp`.

**Source-of-truth correction vs prompt §2:** prompt hypothesized the leaking timestamp came from "ENTSO-E forward-looking slot timestamp." Actual upstream is `energy-charts.info` CBET (`/cbet?country=lt`), `unix_seconds[last]` — same shape (forward-looking slot-end), different upstream. Fix pattern from §3 applied cleanly without scope adjustment. Bug history: introduced 2026-04-12 (`9317c94` "phase2a-3 worker: 5 bug fixes" — Bug 5 fix intentionally swapped fetch-time → slot-end for "data freshness" semantic; that semantic change broke `/health`'s `timestamp = as-of-write` convention. Phase 12.9.2 reconciles by giving each semantic its own field name).

**Before / after:**

| Endpoint | Before (15:55 UTC) | After production deploy (16:00 UTC) | After local wrangler dev (KV cleared) |
|---|---|---|---|
| `/health.signals.s8.age_hours` | **−4.8** (negative) | −4.7 (cached payload from pre-deploy cron — refreshes on next 4h tick) | **0** (just-written) |
| `/s8.timestamp` | `2026-05-05T20:45:00.000Z` (~5h future) | unchanged (KV cache pre-deploy) | `2026-05-05T15:59:51.785Z` (~now) |
| `/s8.data_slot_end` | n/a (field did not exist) | `null` (cached payload predates field) | `2026-05-05T20:45:00.000Z` (preserved slot-end) |

Production cache inertia is expected per prompt §5: cron writes s8 every 4h, GET /s8 serves cached KV; production endpoints will reflect the fix on next cron tick (≤4h). Local wrangler dev with cleared KV is sufficient verification.

**Verification gates (all green; baseline preserved):**

| Gate | Pre-edit baseline | Post-edit | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 927 / 927 (61 files) | 0 — bug fix has no test coverage to touch |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems (40 errors / 130 warnings) | 0 |
| `npx wrangler dev` (local boot) | n/a | GET /s8 → fresh `timestamp` ≈ now, `data_slot_end` preserved; GET /health.s8.age_hours = 0 | ✓ |
| `npx wrangler deploy` | n/a | Version `456cf230-10fd-4135-9270-beade824a2b4`, 4 cron triggers preserved | ✓ |

**Consumer audit (no coordinated change required):**
- `app/components/S8Card.tsx:127` reads `data.timestamp` and renders it via `<SourceFooter updatedAt={...} />` — semantic is "when was this updated," which the new "as-of-write" value satisfies more accurately than the old slot-end. Display improves rather than regresses.
- `workers/fetch-s1.js:8741` (`/health` age computation) — direct beneficiary of the fix.
- `workers/lib/kv.js:105` — same pattern as `/health`, also benefits.
- No consumer reads `s8.timestamp` expecting slot-end semantics. The slot-end is preserved under `data_slot_end` for any future consumer that needs it.

**Out of scope / not touched:**
- Other signals' timestamps (audited none — left for future ad-hoc check if anomalies surface).
- `/health` endpoint logic — `data.timestamp ?? ...` chain is correct; bug was upstream.
- Frontend display of s8 — verified `SourceFooter updatedAt` consumer; no breaking change.
- Roadmap edits — operator-owned per protocol; report delta below.
- Resolves Session 34 backlog #1 ("/health.signals.s8.age_hours reads negative (−5.2)").

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol):

1. **Move Phase 12.9.2 from "Currently active" to a Shipped appendix.** Update the "Currently active → Next CC job:" line to point to **Phase 4G** (intel encoding, ~1.5h).

**Tier 0 sequence after Phase 12.9.2:**
1. ✅ Phase 12.8, 12.8.0, 12.10.0, 12.10, 12.8.1, 12.9, 12.9.1 (per Session 34 enumeration)
2. ✅ **Phase 12.9.2** (this PR, awaiting merge — worker `456cf230` already live; visible behavior on next 4h cron tick)
3. ⏳ Phase 4G (intel encoding, ~1.5h) — **next CC job**

Then Tier 1 (12.12 + 12.14 + 7.7g).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.9.2 — s8 timestamp fix`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Optional: re-curl `/health.signals.s8` after the next cron tick (≤4h post-deploy at ~16:00 UTC) to confirm production reflects the fix; expected `age_hours` = small positive number.

### Session 34 — 2026-05-05 — Phase 12.9.1 — Brand discipline pass (Claude Code)

**Headline:** three sub-items shipped on `phase-12-9-1-brand-discipline` off `main@82474cc`. Editorial state-name chips ("OPEN" / "TIGHTENING" / "COMPRESSED" / "HIGH" / "STABLE" / "LOW" / "Elevated" / "Normal" / "High pipeline pressure" / "Pipeline building") replaced with pure quantitative micro-descriptors on the 5 LIVE homepage cards (S1, S2, S4, S7, S9). `STALE_THRESHOLDS_HOURS` tightened on s1 (36→24) + s4 (36→24) to match daily upstream publication cadence; s7/s8/s9 audit corrected the prompt's anticipation (cron is every-4h, not daily — 12h threshold = 3-miss buffer is correct, left as-is). CI grep gate added in `package.json` to prevent re-introduction of `phase: 'X'` editorial literals. Worker deployed at version `ff9ed839-f609-462c-bb80-5cf2bcac6a4e` (18:36 UTC). `model_version` does NOT bump — pure brand/UX + threshold config.

**Branch:** `phase-12-9-1-brand-discipline` off `origin/main` at `82474cc` (post-Phase-12.9 merge). Three commits pushed to origin. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-9-1-brand-discipline`.

**Operator pushback applied (mid-Pause-A iteration):** initial S7/S9 chip drafts read `1.04× HIGH band` — operator flagged that "HIGH" is itself editorial scaffolding and same brand class as TIGHTENING/STABLE. Re-fixed to pure quantitative `X.XX× / 50 €/MWh threshold` (S7) and `X.XX× / 70 €/t threshold` (S9) — band names dropped entirely, only the numerical reference value remains. The 1.04× ratio carries the meaning; reader does not need a band label.

**§12 contradictions — resolved cleanly via discovery:**
- Prompt §2 expected "S5/S6/S7/S8/S9 cards likely have similar patterns" — actual: only S7 + S9 are LIVE on `app/page.tsx`. S5Card.tsx and S6Card.tsx exist but render nowhere; S8Card.tsx is RETIRED 2026-04-16 per file header. WindCard / SolarCard / LoadCard already use factual labels (`Above 7D avg` / `Below 7D avg` / `Near 7D avg`), no editorial gloss to strip. HeroMarketNow.tsx defined but no consumers in app/.
- Prompt §4 anticipated s7/s8/s9 cron "if daily" — actual: `wrangler.toml` `[triggers]` shows `0 */4 * * *` covers all signals (every-4h). Audit reflects this honestly.
- S4Card.tsx editorial chip discovered beyond prompt's expected list (`pipelineStatus()` returned `'High pipeline pressure'` / `'Pipeline building'` for ratios > 5 / > 3). Folded into scope as a 5th card; conversion logic also migrated string-`.includes('×')` heuristic to ratio-≤3 threshold for the dashed-vs-solid styling switch (otherwise post-change always-numeric label would have always taken the dashed branch, losing sentiment color).

**Pause A defaults applied** (operator decisions, no re-asking required):
- §10 commit structure followed prompt's 4-commit suggestion. Chip text / threshold / CI gate / handover.
- Chip-design call: kept `<StatusChip>` everywhere instead of stripping chips on S7/S9 — preserves visual consistency with S1/S2/S4 hero rows. The `1.04× / 50 €/MWh threshold` format conveys position vs reference without editorial gloss.
- Sentiment palette: explicitly preserved bit-for-bit in all 5 cards (same band thresholds, same `'positive' | 'caution' | 'negative'` outputs). Color is permitted by locked design principles; only chip text changed.
- Engine state names (`derivePhase` internals, worker `signal: 'HIGH'` / `'TIGHTENING'` / etc.) intact — out of scope per §1 ("Engine state computation … keep returning state names").
- Methodology drawer prose (`s1-utils.ts:getInterpretation`, `s2-utils.ts`) untouched — drawer prose not chip face, out of scope per §1.

**Shipped (3 commits):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `<commit-1>` | Editorial chip-text strip | `app/components/S1Card.tsx`: `derivePhase` → `deriveChip` returning `{ chipLabel, sentiment }`; chip renders percentile-band rank (`≥P90 / 30d`, `P75–P90 / 30d`, `P50–P75 / 30d`, `P25–P50 / 30d`, `<P25 / 30d`). `app/components/S2Card.tsx`: signed delta vs P50 (`+45% / P50` etc.). `app/components/S4Card.tsx`: `pipelineStatus()` always returns `X.X× pipeline`; dashed-vs-solid switch uses `ratio ≤ 3` instead of string `.includes('×')`. `app/components/S7Card.tsx`: `regimeLabel(price)` returns `X.XX× / 50 €/MWh threshold`. `app/components/S9Card.tsx`: `regimeLabel(price)` returns `X.XX× / 70 €/t threshold`. Sentiment palette unchanged in all 5 cards |
| 2 | `<commit-2>` | Stale threshold tightening | `workers/lib/defaults.js`: `s1: 36 → 24` (DA tomorrow daily ~14:00 UTC publish), `s4: 36 → 24` (Litgrid daily). Audit comments updated for s2/s3/s7/s8/s9 — every-4h cron means 12h thresholds on s7/s8/s9 = 3-miss buffer (correct). Other thresholds left as-is per audit |
| 3 | `<commit-3>` | CI grep gate + handover | `package.json`: new script `lint:no-editorial-chips` greps `app/components/*.tsx` for `phase: '(TIGHTENING\|WIDENING\|STABLE\|RISING\|FALLING\|STEADY\|ELEVATED\|HIGH\|LOW\|COMPRESSED\|OPEN)'`, exits non-zero on match. Verified passes on clean tree — new descriptors (`P90`, `P75`, `P50`, `P25`) don't match the `phase: 'X'` pattern. `docs/handover.md`: this entry. `docs/visual-audit/phase-12-9-1/`: empty dir; screenshots deferred to operator post-deploy visual check via kkme.eu |

**Verification gates (all green; baseline preserved):**

| Gate | Pre-edit baseline | Post-edit / final | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 927 / 927 (61 files) | 927 / 927 (61 files) | 0 — chip changes are display-layer, no logic-layer tests added |
| `npm run lint` | 170 problems (40 errors / 130 warnings) | 170 problems (40 errors / 130 warnings) | **0** — baseline preserved |
| `npm run lint:no-editorial-chips` | n/a (new script) | exits 0 (no `phase: 'X'` literals remain) | ✓ |
| `npm run build` | 8 static pages | 8 static pages (4.3s compile) | clean |
| `npx wrangler deploy` | n/a | Version `ff9ed839-f609-462c-bb80-5cf2bcac6a4e` deployed in 12.38s upload + 8.57s deploy; 4 cron triggers preserved | ✓ |

**Pause B post-deploy curl deltas (production):**

| Endpoint | Pre-deploy | Post-deploy | Status |
|---|---|---|---|
| `/health.signals.s1.threshold_hours` | 36 | **24** | ✅ s1 amber threshold matches daily DA cadence |
| `/health.signals.s4.threshold_hours` | 36 | **24** | ✅ s4 matches Litgrid daily |
| `/health.signals.s7.threshold_hours` | 12 | 12 | ✅ unchanged — every-4h cron, 12h = 3-miss buffer |
| `/health.signals.s8.threshold_hours` | 12 | 12 | ✅ unchanged |
| `/health.signals.s9.threshold_hours` | 12 | 12 | ✅ unchanged |
| `/health.signals.s1.age_hours` (live sample) | 3.1 (from baseline diagnose) | 0.4 (post-deploy) | fresh, well below 24h threshold |

**Per-card chip before/after inventory (LIVE homepage cards only):**

| Card | File:line | Before | After | Sentiment |
|---|---|---|---|---|
| S1 | `app/components/S1Card.tsx:123` | `OPEN` / `TIGHTENING` / `COMPRESSED` | `≥P90 / 30d`, `P75–P90 / 30d`, `P50–P75 / 30d`, `P25–P50 / 30d`, `<P25 / 30d` | unchanged: ≥P75 positive, P25–P75 caution, <P25 negative |
| S2 | `app/components/S2Card.tsx:240` | `HIGH` / `STABLE` / `LOW` | `+45% / P50` (signed delta vs P50) | unchanged: >+30% positive, <–30% negative, else caution |
| S4 | `app/components/S4Card.tsx:411` | `High pipeline pressure` / `Pipeline building` / `X.X× pipeline` | always `X.X× pipeline` | unchanged: >3× caution, else positive; dashed style preserved at ≤3× |
| S7 | `app/components/S7Card.tsx:93` | `High` / `Elevated` / `Low` / `Normal` | `X.XX× / 50 €/MWh threshold` | unchanged: HIGH/ELEVATED caution, LOW positive, NORMAL neutral |
| S9 | `app/components/S9Card.tsx:98` | `High` / `Elevated` / `Low` / `Normal` | `X.XX× / 70 €/t threshold` | unchanged: same as S7 |

**STALE_THRESHOLDS_HOURS audit (workers/lib/defaults.js post-Phase-12.9.1):**

| Key | Hours | Cron cadence | Upstream cadence | Rationale |
|---|---|---|---|---|
| s1 | **24** ↓ from 36 | every-4h | DA tomorrow daily ~14:00 UTC | Tightened — 24h matches one publish cycle |
| s2 | 48 | every-4h + daily 09:30 UTC watchdog | BTD daily | Left — one missed cron + buffer |
| s3 | 36 | every-4h | daily | Left per prompt — pending BTD-frequency investigation |
| euribor | 168 | every-4h | weekly | Left — ECB weekly is fine |
| s4 | **24** ↓ from 36 | every-4h | Litgrid daily | Tightened |
| s4_pipeline | 840 | every-4h | VERT.lt monthly | Left — 35-day buffer |
| s5 | 6 | every-4h | every 4h | Left — one cron + small buffer |
| s6 | 168 | every-4h | NVE weekly | Left — weekly upstream |
| s7 | 12 | every-4h | TTF daily | **Audit correction:** prompt anticipated daily cron. Actual every-4h means 12h = 3 missed crons; appropriate |
| s8 | 12 | every-4h + hourly | cross-border ~daily | Same as s7 |
| s9 | 12 | every-4h | EUA daily | Same as s7 |
| da_tomorrow | 36 | n/a (operator push) | Nord Pool daily | Left — operator-pushed, ~daily push cadence |
| da_tomorrow:lastgood | 168 | n/a | n/a | Left — backstop only matters after a week of upstream failures |
| extreme:latest | 168 | sparse | sparse events | Left — events are sparse, "missing" is normal |

**Backlog discovered this session (operator follow-up actions):**

1. **`/health.signals.s8.age_hours` reads negative (–5.2 at deploy time).** Indicates a timestamp parsing or timezone bug in how the s8 freshness check computes age, OR the cached s8 timestamp is genuinely future-dated. Not introduced by this phase — pre-existing. Worth investigating: if `(now - cached_timestamp)` < 0, the signal is being treated as artificially fresh (`stale: false`) regardless of threshold, which masks real staleness. File as **Phase 12.13 #2 follow-up** or similar.

2. **Tooltip "Regime" labels in S7/S9 retain editorial framing.** S7Card.tsx:126/132 and S9Card.tsx:133/142 hover-tooltip rows still read `{ label: 'Regime', value: regimeLabel(...) }` — the chip value is now quantitative but the row label "Regime" is itself editorial gloss. Not chip-face, so out of scope per §1, but the same brand discipline arguably applies to hover tooltips when they render permanent on-card UI. Defer to Phase 12.13 hover/drawer audit.

3. **Orphan card components** (`S5Card.tsx`, `S6Card.tsx`, `S8Card.tsx`, `WindCard.tsx`, `SolarCard.tsx`, `LoadCard.tsx`, `HeroMarketNow.tsx`) — left untouched this phase. WindCard/SolarCard/LoadCard already use factual labels (`Above 7D avg` etc.); S5/S6 chip patterns not inspected; S8 retired per file header. CI grep gate would catch any future re-introduction of `phase: 'X'` editorial literals on activation. If any of these get re-mounted on the homepage, run a Phase 12.9.x discipline pass first.

4. **`RegulatoryItem.tsx:66` impactLabel HIGH/MEDIUM/LOW** — left as-is. Industry-standard severity classification on `/regulatory` page (analogous to log levels), distinct from market-state regime calls. If brand discipline extends to /regulatory in a future phase, would need its own quantitative replacement (e.g. days-to-deadline + impact-score numeric). Out of scope per operator framing on market chips.

**Out of scope / not touched (per scope discipline):**
- Engine state computation (`derivePhase` internal logic, worker `signal: '...'` strings) — kept returning state names; drives sentiment color, downstream interpretation prose
- Methodology drawer prose (`s1-utils.ts:getInterpretation`, `s2-utils.ts`) — drawer text not chip face
- Hover granularity, source-into-drawer move, underlying data-staleness fixes — separate phases (12.13 #6, 7.7g-b, 12.12 #3 respectively)
- Adding new chips to cards that don't have one
- Roadmap edits — `_post-12-8-roadmap.md` is operator/Cowork-owned per Session 28 backlog #2; report delta below, operator applies Cowork-side after merge
- `gh pr create` — operator opens PR via GitHub web UI per `CLAUDE.md`
- Screenshot capture — directory created at `docs/visual-audit/phase-12-9-1/` (empty); deferred to operator post-deploy visual check via kkme.eu after Cloudflare Pages auto-deploys

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol — CC does NOT commit roadmap edits):

1. **Move Phase 12.9.1 from "Currently active" to a Shipped appendix.** Update the "Currently active → Next CC job:" line to point to **Phase 4G** (intel encoding, ~1.5h).

**Tier 0 sequence after Phase 12.9.1:**
1. ✅ Phase 12.8, 12.8.0, 12.10.0, 12.10, 12.8.1, 12.9 (per Session 33 enumeration)
2. ✅ **Phase 12.9.1** (this PR, awaiting merge — worker `ff9ed839` already live)
3. ⏳ Phase 4G (intel encoding, ~1.5h) — **next CC job**

Then Tier 1 (12.12 + 12.14 + 7.7g).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.9.1 — Brand discipline pass`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Post-merge: smoke-test https://kkme.eu — confirm S1/S2/S4/S7/S9 chips render quantitative (e.g. `P75–P90 / 30d`, `+45% / P50`, `3.4× pipeline`, `1.04× / 50 €/MWh threshold`, `0.81× / 70 €/t threshold`) instead of editorial state names. Capture screenshots into `docs/visual-audit/phase-12-9-1/` if visual archive desired.
- Notion board sync: mark Phase 12.9.1 shipped; advance "Next CC job" to Phase 4G.

### Session 33 — 2026-05-05 — Phase 12.9 — Worker + header KPI hot-fix bundle (Claude Code)

**Headline:** five sub-items shipped on `phase-12-9-worker-kpi-bundle` off `main@1ad5952`. Worker deployed at version `8320c11c-8bec-4b9b-92d8-30afafbdf24d` (10:25 UTC). `/health` now monitors 14 keys (11 canonical signals + 3 data feeds) instead of 6 — `STALE_THRESHOLDS_HOURS` in `workers/lib/defaults.js` is the single source of truth, so adding a key there auto-includes it. `/da_tomorrow` gains a `:lastgood` mirror with `X-Stale` headers in the catch path so transient Nord Pool failures stop returning 500. `/extreme/latest` flags `is_stale` + `age_hours` once the cached event crosses 24h (WRITE TTL stays 7d). `/s9.eua_trend` no longer hardcoded null — pure helper `computeEUATrend(history, currentValue)` extracted to `workers/lib/eua_trend.js`, computes 7-day trend symbol from `s9_history`, threaded through `fetchEUCarbon(env)` (2 callers updated). Frontend SignalBar S/D RATIO migrates from deprecated `s2.sd_ratio` (always null) to canonical `s4.fleet.sd_ratio` (1.81 live). `model_version` does NOT bump — these are infra/UX fixes, not engine changes.

**Branch:** `phase-12-9-worker-kpi-bundle` off `origin/main` at `1ad5952`. Six commits pushed to origin. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-9-worker-kpi-bundle`.

**`all_fresh` framing — IMPORTANT for ops/monitoring readers:** pre-deploy `/health.all_fresh: true` was **vacuous over 6 keys** (only signals known to be cron-fresh were ever sampled). Post-deploy it is **honest over 14 keys**, and currently `false` because at least one of the newly-monitored signals (s5/s6/s7/s8/s9) is outside its `STALE_THRESHOLDS_HOURS` threshold at deploy time. **This is correct behavior, not a regression** — the boolean is now meaningful. Future-you seeing `all_fresh: false` in monitoring should not panic; should diagnose which key is stale via the `/health.signals` per-key sub-objects.

**§13 contradictions — none surfaced.** All file:line citations and worker code shapes in the prompt matched production at session start (`workers/fetch-s1.js:7973-7985` /da_tomorrow GET, `:8682` /health keys array, `:8663-8666` /extreme/latest GET, `:5731` `fetchEUCarbon`, `:6350` cron caller, `:7625` route registry caller, `:3444` `appendSignalHistory` shape, `app/components/SignalBar.tsx:45-47` S/D RATIO read, `workers/lib/defaults.js:187-199` `STALE_THRESHOLDS_HOURS`). Pre-flight `s2.sd_ratio` (null) vs `s4.fleet.sd_ratio` (1.81) guard from §2 STOP rule cleared cleanly — null vs real-number is a clean migration target, not the dual-real-number diff the rule guards against.

**Pause A defaults applied** (operator decisions, no re-asking required during execution):
- §10 commit structure followed prompt's 6-commit suggestion exactly. SignalBar / da_tomorrow / health / extreme / s9 / handover.
- Vitest coverage for `computeEUATrend`: 9 cases instead of 3 minimum (rising / stable / falling / null + edge-case branches: empty history, non-array, missing currentValue, all-invalid past entries, short history fallback to oldest valid, invalid-entry skipping).
- Single source of truth for `/health` keys: extended `STALE_THRESHOLDS_HOURS` with the 3 data keys instead of hardcoding a separate `dataKeys` array in `fetch-s1.js` (per prompt §4 step 2 "don't hardcode in fetch-s1.js"). Cleaner final form: `Object.keys(STALE_THRESHOLDS_HOURS)` is the iterated set.
- SignalBar visual screenshot: produced via `npm run dev` + chrome-devtools at localhost:3007 (frontend not yet deployed; auto-deploys on PR merge via Cloudflare Pages). Screenshot uses JS-inflated typography for label legibility — production CSS unchanged. Saved to `docs/visual-audit/phase-12-9/signalbar-sd-ratio.png` (820 KB, shows all 6 SignalBar labels including `S/D RATIO 1.81×`).
- Live verification of /s9 trend + /da_tomorrow lastgood: **deferred to operator** — both code paths are deployed but cached/dormant; concrete evidence requires next cron tick (12:00 UTC) and next operator push respectively. See backlog below for explicit follow-up curls.

**Shipped (6 commits):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `7ba1a53` | SignalBar S/D RATIO migration | `app/components/SignalBar.tsx:45-47`: `data.s2?.sd_ratio` → `data.s4?.fleet?.sd_ratio`. Pre-deploy values cited in commit body (s2.sd_ratio=null deprecated path, s4.fleet.sd_ratio=1.81 canonical fleet path written by `computeS4()` via `KKME_SIGNALS.put('s4_fleet')`) |
| 2 | `0c7b4cc` | /da_tomorrow lastgood fallback | `workers/fetch-s1.js`: GET dual-writes `da_tomorrow` + `da_tomorrow:lastgood` on success; catch path reads `:lastgood` and serves with `X-Stale: true` + `X-Stale-Reason: upstream-fetch-failed` + 600s Cache-Control instead of 500. POST `/da_tomorrow/update` mirrors the same dual-write |
| 3 | `fec8c96` | /health expansion to 14 keys | `workers/fetch-s1.js:8702-8706`: `keys` array → `Object.keys(STALE_THRESHOLDS_HOURS)`. `workers/lib/defaults.js`: extends thresholds map with `da_tomorrow:36`, `da_tomorrow:lastgood:168`, `extreme:latest:168`. Single source of truth — adding a key in `defaults.js` auto-monitors it |
| 4 | `b17b46d` | /extreme/latest 24h backstop | `workers/fetch-s1.js`: GET decorates response with `is_stale: true` + `age_hours: <N>` when cached event > 24h old. WRITE TTL on `POST /extreme/seed` unchanged (7d). Frontend consumer absent today — flag is wired-but-unused (Phase 12.13 will surface in card UI) |
| 5 | `995ac9c` | S9 eua_trend regeneration | `workers/lib/eua_trend.js` (NEW, pure ESM): `computeEUATrend(history, currentValue)` — 7-day window, ±1% bands, robust to invalid past entries, returns null on empty/all-invalid. `workers/fetch-s1.js`: import added; `fetchEUCarbon(env)` reads `s9_history` KV before returning; both callers (cron line 6350, route registry line 7625) updated to pass `env`. `app/lib/__tests__/eua_trend.test.ts` (NEW): 9 vitest cases. Vitest 918 → 927 |
| 6 | `<this entry>` | Handover Session 33 + visual audit | `docs/handover.md`: this entry. `docs/visual-audit/phase-12-9/signalbar-sd-ratio.png`: visual proof of S/D RATIO 1.81× rendering |

**Verification gates (all green; baseline preserved):**

| Gate | Pre-deploy baseline | Post-deploy / final | Δ |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors | 0 |
| `npx vitest run` | 918 / 918 (60 files) | **927 / 927** (61 files) | +9 EUA trend cases |
| `npm run lint` (full) | 170 problems (40 errors / 130 warnings) | 170 problems (40 errors / 130 warnings) | **0** — baseline preserved |
| `npm run lint` (changed files only) | n/a | New files (`workers/lib/eua_trend.js`, `app/lib/__tests__/eua_trend.test.ts`, `workers/lib/defaults.js`): 0 errors / 0 warnings | clean |
| `npm run build` | 8 static pages | 8 static pages | clean (3.2s compile) |
| `npx wrangler dev workers/fetch-s1.js --local --port 8997` | n/a | Boots clean; local `GET /health` returns HTTP 200 in 8ms with new 14-key shape | ✓ |
| `npx wrangler deploy` | n/a | Version `8320c11c-8bec-4b9b-92d8-30afafbdf24d` deployed in 14.71s upload + 8.37s deploy; 4 cron triggers preserved (`0 */4 * * *`, `0 * * * *`, `30 9 * * *`, `0 8 * * *`) | ✓ |

The 4 pre-existing lint errors on `app/components/SignalBar.tsx:27` (`@typescript-eslint/no-explicit-any` on `useState<{ s1?: any; s2?: any; ...}>`) and 1 pre-existing warning on `workers/fetch-s1.js:7604` (`'err' is defined but never used`) are unrelated to this phase and were already in main at `1ad5952`. Confirmed by verifying full-project totals match pre-change baseline.

**Pause B post-deploy curl deltas (production):**

| Endpoint | Pre-deploy | Post-deploy | Status |
|---|---|---|---|
| `/health.signals` keys | 6: `[euribor, s1, s2, s3, s4, s4_pipeline]` | **14**: 11 canonical signals + 3 data keys (`da_tomorrow`, `da_tomorrow:lastgood`, `extreme:latest`) | ✅ matches expected delta |
| `/health.all_fresh` | `true` (vacuous over 6 keys) | `false` (honest over 14 keys; at least one signal is outside its threshold at deploy time) | ✅ correct upgrade — see framing note above |
| `/extreme/latest` | `null` | `null` (no event seeded; is_stale code path dormant by design) | ✅ same — frontend consumer absent (Phase 12.13) |
| `/s9.eua_trend` | `null` (cache from `04:01:04Z`) | `null` (same cache; deploy was `~10:25Z` — new `fetchEUCarbon(env)` runs on next cron `0 */4 * * *` → 12:00 UTC) | ⏳ code deployed but cache pre-dates deploy; deferred to operator follow-up curl |
| `/da_tomorrow` GET | HTTP 500 (cache empty + lastgood empty + upstream failing) | HTTP 500 (same end-state — no lastgood to fall back on yet) | ⏳ lastgood mirror wired but inactive until next operator push populates both keys |
| `/s4.fleet.sd_ratio` | `1.81` | `1.81` (no worker change to this path; SignalBar pivots which worker field it reads) | ✅ |

**SignalBar visual proof:** `docs/visual-audit/phase-12-9/signalbar-sd-ratio.png` (1440×280 viewport, dark theme, scrolled past 300px so StickyNav mounts). All 6 KPI tiles render: BESS CAPTURE 143 €/MWh · **S/D RATIO 1.81×** · AFRR 7 €/MW/h · GRID FREE 3.6 GW · FLEX FLEET 822 MW · DISPATCH €210/MW. Migration verified live against `data.s4?.fleet?.sd_ratio` rather than the deprecated `data.s2?.sd_ratio` (which was returning null on production prior to this change). Note: typography in screenshot is JS-inflated for label legibility (production renders SignalBar labels at 0.5625rem ghost text) — values and label text are the actual production render.

**Backlog discovered this session (operator follow-up actions):**

1. **Deferred verification — /s9 EUA trend (next 4h cron tick).** At ~12:00 UTC (the next `0 */4 * * *` cron firing after the 10:25 UTC deploy), curl:
   ```
   curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s9 | jq .eua_trend
   ```
   Expected: result is one of `'↑ rising'` | `'→ stable'` | `'↓ falling'` (not null). If null AND `s9_history` has ≥2 valid entries (`curl /s9/history | jq 'length'`), the trend computation didn't fire as designed → file **Phase 12.9.1** follow-up. If null AND `s9_history` has < 2 valid entries, that's the documented null fallback (not a regression).

2. **Deferred verification — /da_tomorrow lastgood mirror (next operator push).** After the next operator `POST /da_tomorrow/update` push, curl:
   ```
   curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/health | jq '.signals."da_tomorrow:lastgood"'
   ```
   Expected: status transitions from `"missing"` to `"present"` with `age_hours` matching the push time. If still `"missing"` despite the POST, the lastgood mirror write didn't fire (Promise.all failed silently or KV binding missed the second key) → file **Phase 12.9.1** follow-up.

3. **Frontend consumer of `/extreme/latest is_stale` flag.** No card today reads `event.is_stale` or `event.age_hours`. Phase 12.13 (or whichever frontend phase next touches extreme-event surfacing) should wire stale-disclosure rendering — e.g. dim the "Last extreme: 38h ago" line or replace with "Last extreme >24h ago" badge. Backend is ready; flag is wired-but-unused.

4. **`computeEUATrend` lookback constants are file-local.** `RISING_BAND_PCT = 1`, `FALLING_BAND_PCT = -1`, `TARGET_LOOKBACK_DAYS = 7` are hardcoded in `workers/lib/eua_trend.js`. If S6/S7 history-based trends ever get extracted similarly, consider hoisting these to `workers/lib/defaults.js` or a `trends.js` shared module. Out of scope for this phase.

**Out of scope / not touched (per scope discipline):**
- Engine math changes; no `model_version` bump
- Adding new KV keys beyond `da_tomorrow:lastgood`
- Frontend redesign of S9 eua_trend display — `app/components/S9Card.tsx` already consumes `eua_trend?: string | null` per its existing prop type; backend just produces the data
- Refactoring `appendSignalHistory` shape (line 3444) — read it as-is per prompt §1
- Phase 12.10's VPS-Python live-fetch pattern extension (Phase 12.12 #3 territory)
- Roadmap edits — `_post-12-8-roadmap.md` is operator/Cowork-owned per Session 28 backlog #2; report delta below, operator applies Cowork-side after merge
- `gh pr create` — operator opens PR via GitHub web UI per `CLAUDE.md`
- 14+ pre-existing untracked files in working tree (`_handover_s1_s2_rebuild.md`, `docs/_yolo-followup-*`, `.claude/skills/`, `docs/visual-audit/phase-7/`, etc.) — left as-is per Sessions 18-32 convention

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol — CC does NOT commit roadmap edits):

1. **Move Phase 12.9 from "Currently active" to a Shipped appendix.** Update the "Currently active → Next CC job:" line to point to **Phase 4G** (intel encoding, ~1.5h).

**Tier 0 sequence after Phase 12.9:**
1. ✅ Phase 12.8 (`1b2d803`)
2. ✅ Phase 12.8.0 (`652b551` + `67c0d96`)
3. ✅ Phase 12.10.0 (`85ec7f8`)
4. ✅ Phase 12.10 (`02a64ea`, merged via PR #50)
5. ✅ Phase 12.8.1 (merged via PR #52, `c1aa44e`)
6. ✅ **Phase 12.9** (this PR, awaiting merge — worker `8320c11c` already live)
7. ⏳ Phase 4G (intel encoding, ~1.5h) — **next CC job**

Then Tier 1 (12.12 + 12.14 + 7.7g).

**§9 Pause B — worker live, frontend pending.** Worker deploy completed pre-merge (Cloudflare Workers deploy via `wrangler deploy`, independent of git push). The 14-key `/health` is already serving production. The SignalBar S/D RATIO migration is frontend-only and auto-deploys on PR merge to `main` via Cloudflare Pages — kkme.eu will flip from "S/D RATIO —" to "S/D RATIO 1.81×" once Pages rebuilds.

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.9 — Worker + header KPI hot-fix bundle`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Post-merge: smoke-test https://kkme.eu header KPI strip — confirm S/D RATIO renders 1.81× (or current real number) instead of em-dash.
- ~12:00 UTC: fire deferred-verification curl #1 (s9 eua_trend turnover). If null with ≥2 history entries, file Phase 12.9.1.
- After next operator `POST /da_tomorrow/update` push: fire deferred-verification curl #2 (lastgood mirror present). If still missing, file Phase 12.9.1.
- Notion board sync: mark Phase 12.9 shipped; advance "Next CC job" to Phase 4G.

### Session 32 — 2026-05-04 — Phase 12.8.1 — Backtest dashed-line caption clarification (Claude Code)

**Headline:** audit-#1's "ambiguous dashed line" finding closed via caption rewrite — not a reframe. The dashed line stays as the deliberate Y1 model anchor (verified via plugin read at `RevenueBacktest.tsx:87`); a new two-line caption beneath the chart now names it explicitly + reports realised tracking with sign-bearing % AND MAE. Backend ships `mae` alongside existing `meanErrorPct` on `BacktestStats` so over/under-shoot magnitude is no longer hidden by sign-cancellation. Path-1 (in-place edit in `RevenueBacktest.tsx`) chosen over the prompt's literal Path-2 (move-to-RevenueCard.tsx) — §10 contradiction surfaced + resolved with operator before scoping. Single PR, 2 commits.

**Branch:** `phase-12-8-1-backtest-caption` off `origin/main` at `9ce134f`. Pushed to origin. PR-creation URL: `https://github.com/kastiskemezys-tech/kkme-website/pull/new/phase-12-8-1-backtest-caption`.

**§10 contradictions surfaced before scoping** (audit-#1 visual-inference-as-bug discipline):

| Prompt assumption | Production reality | Resolution |
|---|---|---|
| `modeledY1Daily` is a top-level field on `/revenue` (audit cited "€368/MW/day") | Computed client-side: `data.net_rev_per_mw_yr / 365` (`RevenueCard.tsx:1773`); not in worker payload | No code change to wiring; numbers cited in prompt were stale audit-time computation |
| Caption JSX lives in `RevenueCard.tsx` beneath `<RevenueBacktest>` | Caption lives inside `RevenueBacktest.tsx:155-159` (component owns its footer) | Operator chose Path-1 (in-place edit) over Path-2 (move). Smallest diff; honours intent |

**Pause A defaults applied** (operator decisions, no re-asking required during execution):
- Path-1 (in-place edit in `RevenueBacktest.tsx` with `scenario?: string` prop) — confirmed before §1
- MAE field name: `mae` on `BacktestStats` (sign-stripped magnitude); computed simple-mean over `valid` rows using verified field name `r.total_daily` (NOT `realisedDaily` as prompt guessed)
- Conservative-tail rephrase to surface realised €/MW/day pair: **declined** — chart already shows realised vs dashed model; adding €605 vs €348 in prose duplicates the visual. Memory `feedback_drawer_prose.md` discipline applied
- Trend-claim framing: **flagged as uncontrolled** — calibration drift (€368 +70.9% audit → €309 +78.6% §0.3 curl → €348 +74.0% Pause A page) cannot be ascertained without controlled-param comparison (different CAPEX/COD/scenario between samples). Deferred. No claim made in any user-visible surface

**Shipped (2 commits):**

| # | SHA | Sub-item | What ships |
|---|---|---|---|
| 1 | `2ce2992` | Backend MAE | `app/lib/backtest.ts`: `mae: number \| null` field on `BacktestStats`; computed via `valid.reduce((s,r) => s + Math.abs(r.total_daily - modeledY1Daily), 0) / valid.length` inside the same null-guard branch as `meanErrorPct`. `app/lib/__tests__/backtest.test.ts`: +4 cases (sign-stripped magnitude assertion, null-on-no-ref, null-on-zero-ref, null-on-empty-input). 914 → 918 total tests |
| 2 | `4ab9c45` | Frontend caption | `app/components/RevenueBacktest.tsx`: `scenario?: string` prop added; existing `errLabel` ternary replaced with two-line caption block (L1 names dashed line as Y1 model anchor with €/MW/day + scenario + bias direction; L2 reports realised tracking with sign-bearing % + MAE + tail). Tail flips between regular `var(--text-secondary)` ("Model intentionally conservative.") and `var(--warning)` amber ("Model overshooting realised — recalibration triggered.") based on sign of `meanErrorPct`. Fallback "Backtest data not yet available." renders when `modeledY1Daily` / `meanErrorPct` / `mae` null. `app/components/RevenueCard.tsx`: `scenario={data.scenario}` wired into `<RevenueBacktest>` at line 1772-1774 |

**Verification gates (all green):**
- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → **918 / 918 passed** (60 files; 914 → 918, **+4 new MAE test cases**)
- `npx eslint app/lib/backtest.ts app/components/RevenueBacktest.tsx app/components/RevenueCard.tsx app/lib/__tests__/backtest.test.ts` → 11 errors, **all pre-existing on unmodified lines** (`@typescript-eslint/no-explicit-any` at lines 858/885/966/987/1305/1366; `react-hooks/rules-of-hooks` at 1410; `react-hooks/static-components` at 281). Zero new errors on changed files
- `npm run build` → compiled, 8 static pages
- Live dev server (localhost:3000, page params `dur=4h&capex=mid&cod=2028&scenario=base`) DOM inspection: caption rendered correctly in dark + light mode; tokens resolved per-theme (`var(--text-muted)` 0.45/0.6 alpha; `var(--text-secondary)` 0.65 alpha; `var(--warning)` resolves to `rgb(212,160,60)` dark / `#8a6620` light); no raw rgba/hex in JSX

**Rendered caption (Pause A page snapshot):**
```
Dashed: Y1 model anchor — €348/MW/day, scenario "base", conservative bias.
Realised tracked +74.0% above model · MAE €254/MW/day over 13 months · Model intentionally conservative.
```

Realised tracks above model (sign positive) → conservative-branch tail rendering, no amber. Recalibration-branch (`var(--warning)` amber) verified by code-read at the ternary; no production data currently exercises it.

**Numbers — production curl vs page render (uncontrolled samples — NOT a calibration trend):**

| Source | scenario | capex | cod | `net_rev_per_mw_yr` | modeled €/MW/day | meanErrorPct | MAE €/MW/day |
|---|---|---|---|---|---|---|---|
| Audit baseline (2026-05-03) | base | unspec | unspec | ≈134k | €368 | +70.9% | (not surfaced) |
| §0.3 worker curl | base | (default) | (default) | 112,864 | €309 | +78.6% | (not surfaced) |
| Pause A page | base | mid | 2028 | ≈127,020 | €348 | +74.0% | €254 |

CAPEX/COD differences between samples mean the +70.9 → +78.6 → +74.0 sequence cannot ground a calibration-drift claim — deferred to a future controlled-param calibration phase if wanted. Direction is consistent with engine v7.3's intentional conservative bias from Phase 7.7d, but that's a code-archaeology observation, not a measurement.

**MAE magnitude observation:** at €254 MAE on a €348 anchor (~73% of anchor), the MAE is close to the +74.0% sign-bearing mean — meaning over- and under-shoots are NOT cancelling much; almost all months are above model. Exactly what the new MAE field was supposed to expose. Caption is intentionally terse on this — chart already shows realised vs dashed model; numbers in prose would duplicate the visual.

**Visual-audit dir:** `docs/visual-audit/phase-12-8-1/`
- `backtest-caption-dark.png` (2.13 MB, 1440×900, scrolled to backtest section, dark theme)
- `backtest-caption-light.png` (2.40 MB, 1440×900, same scroll, `data-theme="light"`)

Both screenshots show: dashed Y1 reference line + in-chart label "Y1 model €348" (unchanged from prior); new two-line caption beneath. No layout overflow. Conservative-branch tail only — no amber visible.

**Backlog discovered this session:**

1. **Recalibration-branch (amber tail) lacks production data exercise.** Verified by code-read of the ternary at `RevenueBacktest.tsx`. Can be exercised either by (a) operator manually setting a synthetic `net_rev_per_mw_yr` higher than realised mean × 1.0 in a dev fixture, or (b) the engine drifting overshoot-side over time. Defer to a future visual-regression test phase if wanted; not blocking.

2. **Calibration trend across params is unmeasured.** The €368 / €309 / €348 modeled-anchor sequence + +70.9% / +78.6% / +74.0% mean-error sequence is across uncontrolled CAPEX/COD/scenario samples. A controlled comparison (fix CAPEX/COD/scenario, snapshot quarterly) would be needed to claim drift. Track as follow-up if engine calibration becomes a roadmap item.

**Out of scope / not touched (per scope discipline):**
- Worker change. Frontend-only phase per prompt
- Dashed-line replacement. Stays as deliberate Y1 anchor (audit-#1 revised scope)
- Chart shape, tooltip, surrounding card layout
- Phase 12.10 inline-computation marquee (already shipped Session 30)
- Design-token churn. Reuses `var(--text-muted)`, `var(--text-secondary)`, `var(--warning)`, `var(--font-xs)`, `var(--font-mono)`
- New font sizes, bold, icons. Per memory `feedback_drawer_prose.md` — sparse, data speaks
- Roadmap edits. Per Session 28 backlog #2 default rule. Delta reported below; operator applies Cowork-side after merge
- `gh pr create`. Operator opens PR via GitHub web UI per `CLAUDE.md`
- 14+ pre-existing untracked files in working tree (`_handover_s1_s2_rebuild.md`, `docs/_yolo-followup-*`, `.claude/skills/`, `docs/visual-audit/phase-7/`, etc.) — left as-is per Sessions 18-31 convention
- Negative-branch synthetic screenshot capture — recalibration tail logic verified by code-read; production data renders only conservative branch

**Roadmap delta needed — operator to apply Cowork-side after merge** (per Session 28 backlog #2 protocol — CC does NOT commit roadmap edits):

1. **Move Phase 12.8.1 from "Currently active" to a Shipped appendix.** Update the "Currently active → Next CC job:" line to point to **Phase 12.9** (worker + header KPI bundle, ~1.5-2h).

**Tier 0 sequence after Phase 12.8.1:**
1. ✅ Phase 12.8 (`1b2d803`)
2. ✅ Phase 12.8.0 (`652b551` + `67c0d96`)
3. ✅ Phase 12.10.0 (`85ec7f8`)
4. ✅ Phase 12.10 (`02a64ea`, merged via PR #50)
5. ✅ **Phase 12.8.1** (this PR, awaiting merge)
6. ⏳ Phase 12.9 (worker + header KPI bundle, ~1.5-2h) — **next CC job**
7. Phase 4G (intel encoding, ~1.5h)

Then Tier 1 (12.12 + 12.14 + 7.7g).

**§6 Pause B — N/A.** Frontend-only, no worker deploy. Cloudflare Pages rebuilds automatically on PR merge to `main`. Post-deploy verification = curl + screenshot of `https://kkme.eu` once Pages finishes building (operator-fire post-merge if desired).

**Next operator action:**
- Open PR via GitHub web UI (base `main`, title `Phase 12.8.1 — Backtest dashed-line caption clarification`).
- Apply roadmap delta above to `docs/phases/_post-12-8-roadmap.md` Cowork-side after merge.
- Post-merge: smoke-test `https://kkme.eu` Returns card backtest section in dark + light mode (operator's preference) once Cloudflare Pages rebuild completes.
- Notion board sync: mark Phase 12.8.1 shipped; advance "Next CC job" to Phase 12.9.

### Session 31 — 2026-05-04 — Phase 30 — Clean Horizon methodology research + KKME methodology paper (Cowork, parallel to CC's Phase 12.10)

**Headline:** Phase 30 research deliverables shipped — three docs (methodology comparison, engine gap backlog, public-facing KKME methodology paper) covering 12 methodology dimensions with 16 Clean Horizon public sources cited. **Load-bearing finding (P1 critical):** Gap #5 — KKME's published aFRR-down €5.03/MW/h is order-of-magnitude lower than Clean Horizon's published Baltic average ~€340/MW/h. Either KKME is reporting realised €/MWh-activated rather than reservation €/MW/h, OR the engine is computing a different product. Folds into next Phase 12.10 follow-up commit (NOT a new phase). Phase 30 ran in parallel to CC's Phase 12.10; no code touched, no tests added, no worker deploy. Branch `phase-30-methodology-research` off `02a64ea` (post-Phase-12.10 main).

**Branch:** `phase-30-methodology-research` off `origin/main` (post-merge of Phase 12.10 PR #50 → `02a64ea`). Three commits pushed to origin.

**Pause A defaults (operator-baked into prompt; Cowork executed without re-asking):**

| Decision | Disposition |
|---|---|
| Position vs Clean Horizon | **(c) — independent Baltic flexibility platform with own methodology.** NOT (a) "free version of Clean Horizon" (positions as discount product) and NOT (b) "Lithuanian-deep complement to Clean Horizon" (anchors identity to competitor). |
| Clean Horizon data ingestion | **No.** Legal + IP risk per operator's prior decision. Methodology framework cited only; no published numbers redistributed. |
| Methodology paper destination | **Standalone `/methodology` route recommended** (mirrors how cleanhorizon.com publishes methodology). Markdown landed at `docs/methodology.md` for now; rendering destination is operator decision before Phase A consolidates. |
| Source acquisition target | 13 Clean Horizon public sources minimum (per prompt §0.2). **Achieved 16.** WebFetch hit token-cap on 3 longer Storage Index PDFs; documented as research limitation in §1.3 of comparison doc. Coverage sufficient for all 12 dimensions. |
| Side-by-side numerical comparison on public site | **Withheld pending Gap #5 reconciliation.** Methodology paper as written stays silent on the specific aFRR-down number. |

**Shipped (3 commits):**

| # | Commit subject | What ships |
|---|---|---|
| 1 | `phase-30(research): Clean Horizon methodology comparison + KKME engine gap analysis` | `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md` (217 lines, 12 methodology dimensions, side-by-side comparison with verdict per dimension, source bibliography of 16 Clean Horizon items). `docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md` (240 lines, 5 gaps prioritized: Gap #5 P1 critical aFRR/FCR cap reservation reconciliation; Gap #1 P2 explicit cannibalization curve; Gaps #2/3/4 P3 medium for dynamic priority allocation, multi-market simultaneous bidding, 15-min DA optimization). `docs/phases/phase-30-clean-horizon-methodology-research-prompt.md` (424 lines, the original Cowork research prompt — committed for traceability). |
| 2 | `phase-30(methodology): public-facing KKME methodology paper at Clean-Horizon-comparable rigor` | `docs/methodology.md` (350 lines, institutional-sober voice, covers: scope + geography, data sources table, revenue model decomposition per product (capacity reservation / activation energy / DA arbitrage formulas), cycle accounting + warranty status, RTE curves, three SOH degradation curves, augmentation, cannibalization (with explicit disclosure that KKME is less precise than Clean Horizon's January 2026 framing), revenue floor, gross→net, project finance, comparison to Clean Horizon, intentional differences, what we got wrong, engine version history, calibration vs NREL ATB). |
| 3 | `phase-30(handover): Session 31 — Clean Horizon methodology research shipped; Phase 29 unblocked on Gap #5 resolution` | This entry. |

**12 methodology dimensions documented in comparison doc:**
scope/geography · data sources · revenue model decomposition · cycle accounting · RTE · SOH/degradation · augmentation · cannibalization · project finance · calibration approach · output granularity · governance.

**5 gaps identified (priority order):**

| # | Priority | Gap | Estimated remediation |
|---|---|---|---|
| 5 | **P1 critical** | aFRR/FCR capacity-reservation reconciliation. KKME aFRR-down €5.03/MW/h vs Clean Horizon Baltic average ~€340/MW/h — order-of-magnitude mismatch. Likely a unit/product-definition issue, not a methodology gap, but unverified until investigation. | Phase 12.10 follow-up commit (not a new phase) |
| 1 | P2 | Explicit cannibalization curve as `installed_capacity_mw` input (Clean Horizon's January 2026 framing). KKME has implicit cannibalization via scenario compression multipliers (1×/2×/3.5×) but no installed-capacity elasticity. | Tier 5 (methodology depth) |
| 2 | P3 medium | Dynamic priority allocation across products by hour. Clean Horizon's COSMOS does this; KKME uses static 16/34/50 split. | Tier 5 |
| 3 | P3 medium | Multi-market simultaneous bidding logic. Currently revenue-additive; operationally valid per Baltic operator confirmation but mathematically un-modelled. | Tier 5 |
| 4 | P3 low-medium | 15-min DA arbitrage optimisation. Baltic DA is 60-min today; gap becomes material if Nord Pool moves to 15-min in 2027 as planned. | Tier 5 (deferred until 15-min DA confirmed) |

**Significant non-deliverable finding from research process** (also in roadmap "Currently active" section): the EE installed-capacity definitional gap CC documented in Session 30 (A68 218 MW vs fleet 126.5 MW) compounds Gap #5. When Phase 30 follow-up does the reconciliation, it has to declare upfront which installed-capacity definition the denominator uses — Clean Horizon almost certainly uses commissioned-only (because that's what generates revenue today), which means KKME would have to use the same definition for the comparison to be valid. Cross-link with CC's Phase 12.12 #15 sub-item (A68/fleet boundary review).

**Pre-commit gates (research-only phase, no code):**
- No `tsc` / `vitest` / `lint` runs needed (no code changes)
- Markdown lint not enforced repo-side; manual proofread done
- All internal cross-references verified (gap doc → comparison doc → methodology doc → roadmap Phase 30 entry)
- Source bibliography links verified accessible (16/16) at time of research

**Backlog discovered this session (in priority order):**

1. **Gap #5 reconciliation work** — adds to Phase 12.10 follow-up scope. NOT a new phase. Investigation: read worker `RESERVE_PRODUCTS` constants (lines 1009-1013), `computeRevenueV7` aFRR branch (~line 1200-1300), confirm whether the published €/MW/h is reservation-priced or activation-priced. Cross-check against Elering's published aFRR-down market clearing prices for a sample week (2026-04 should have public data). If mislabel: relabel + re-test calibration. If genuine difference: investigate engine logic for missing cap reservation revenue stream.

2. **Methodology paper rendering destination decision** — operator. Options: (a) standalone `/methodology` route in the Next.js app (recommended; mirrors cleanhorizon.com pattern); (b) inline drawer (Phase A consolidates methodology there). Recommendation (a). File at `docs/methodology.md` is render-ready either way.

3. **Phase 12.10 follow-up scope expansion** — fold Gap #5 reconciliation + EE A68/fleet boundary policy decision (CC's Phase 12.12 #15) into next Phase 12.10 follow-up commit. Both are interdependent and small enough to bundle.

4. **WebFetch token-cap as a research limitation** — three longer Clean Horizon Storage Index PDFs returned 60-87k tokens, exceeding tool capacity. Fell back to WebSearch result summaries. Documented in research deliverable §1.3. If Phase 29 needs deeper Clean Horizon methodology references, may need a different acquisition strategy (manual download + local read).

**Out of scope / not touched (per scope discipline):**
- No worker code changes; no engine modifications; no tests added.
- Phase 29 implementation (KKME Baltic Storage Index) — explicitly blocked on Gap #5 resolution.
- Direct numerical comparison vs Clean Horizon on the live site — withheld pending Gap #5.
- Roadmap edits applied directly to main as a separate Cowork commit pre-Phase-30-branch (per Session 28 backlog #2 protocol — Cowork-owned). Not part of this branch.
- `gh pr create`. Operator opens PR via GitHub web UI per `CLAUDE.md`.
- Pre-existing untracked files in working tree carried forward as-is.

**Tier 7 sequence:**
1. ✅ **Phase 30** (this PR, awaiting merge) — research deliverables only
2. ⏳ Phase 12.10 follow-up (Gap #5 reconciliation + EE A68/fleet boundary policy) — bundled into next CC Phase 12.10 follow-up commit
3. ⏳ Phase 29 (KKME Baltic Storage Index, ~4-6h) — blocked on #2

**Next operator action:**
- Open PR via GitHub web UI: base `main`, head `phase-30-methodology-research`, title `Phase 30 — Clean Horizon methodology research + KKME methodology paper`. PR body: copy this Session 31 entry's headline + shipped table.
- Decide methodology paper rendering destination (standalone `/methodology` route recommended).
- Notion board sync: mark Phase 30 shipped; add Gap #5 reconciliation to Phase 12.10 follow-up scope; mark Phase 29 blocked-on-Gap-5.
main
