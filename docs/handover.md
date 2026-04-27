# KKME Handover

Canonical state document. Read this first in every session.
Last updated: 2026-04-26 (Session 13 — Phase 7.6 numerical reconciliation closed).

## Current phase

Phase 7 shipped (S1/S2 card rebuild). Phase 7.5-F shipped 2026-04-21 (card
redesign sub-phase — live-data signal row, prose→drawer, country/product
toggles, clickable face). Phase 7.5 polish pass still queued. Phase 7.6
hero refinement prompt authored after 2026-04-21 visual audit; now also
carries two 7.5-F capture-session findings (B-029 pulse-dot colour in
light mode, B-030 FCR hero transient). Roadmap re-sequencing from Session
9 still holds.

Active queue order: **7.5 (polish remainder) → 7.6 → 8 → 9 → 10 → …**

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
- Phase 4B (2026-04-16): Intel pipeline depth fix — discovered 209 curations stuck in /curate KV never reaching /feed. Write-time merge (31s→0.24s). BESS quality gate + relevance scoring (computeBessRelevanceScore). Homepage 8-item cap with "View all" expander. Feed: 9→33 clean items, zero garbage.
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
- Static export to Cloudflare Pages (kkme.eu)

## What's queued

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
- **Phase 4B-5** — BESS quality gate + relevance scoring + homepage cap. Added BESS_SIGNALS keyword gate (rejects non-energy items), `computeBessRelevanceScore()` with signal-weighted scoring (BESS_CORE +0.35, BALTIC +0.20, quantity +0.15, market +0.10, source +0.10, recency +0.10), 0.25 score floor, homepage 8-item cap with "View all N items →" expander. Result: 52→33 items, zero garbage, score range 0.25–0.94. Merged.
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
