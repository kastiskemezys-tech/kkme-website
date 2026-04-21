# KKME Handover

Canonical state document. Read this first in every session.
Last updated: 2026-04-21.

## Current phase

Phase 7 (S1/S2 card rebuild) prompt revised and ready to run in Claude Code (YOLO).
Phases 4E, 5A, 5B, 6A shipped between last handover update (2026-04-16) and today — captured in Session 6 log below.
Strategic roadmap written: `docs/roadmap.md` — Phases 7–14, significant-improvement track (synthesis, peer comparison, fleet, interactive revenue).

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
- Static export to Cloudflare Pages (kkme.eu)

## What's queued

**Phase 7 — S1 & S2 card rebuild (Bloomberg density)** (Claude Code YOLO, ~4–6h). Two real worker bugs (flat `gross_2h/gross_4h` missing from `/s1/capture` + null in `/s1/history`), S1 card rebuild leveraging already-populated `rolling_30d` stats, S2 card rebuild against existing `/s2` activation + rolling_180d, shared `AnimatedNumber` primitive. Revised prompt at: [docs/phases/phase7-s1-s2-rebuild-prompt.md](phases/phase7-s1-s2-rebuild-prompt.md)

**Strategic roadmap (Phases 8–14)**: cross-signal synthesis, peer comparison, fleet dashboard, interactive revenue, historical depth, methodology page, mobile. See [docs/roadmap.md](roadmap.md).

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
