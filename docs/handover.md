# KKME Handover

Canonical state document. Read this first in every session.
Last updated: 2026-04-13.

## Current phase

Hero v3 polish (Phase 2A nearly complete, Phase 2B-1 queued).
Branch: `hero-v3-phase2a-3` (3 commits ahead of main, not yet merged).

## What's shipped

- Hero v3 georeferenced Baltic map with 6 cables, particles, project dots, gen/load overlays (PRs #1–#3 merged to main)
- Phase 2A-3: worker bug fixes (5), auto-refresh via useSignal polling, VPS hourly genload script (on branch, not merged)
- All 9 signal cards live (S1–S9) plus Wind, Solar, Load structural cards
- Revenue engine v7.2 with self-fetching RevenueCard
- TradingEngineCard (dispatch intelligence)
- IntelFeed (market intelligence board)
- ContactForm with Resend email delivery
- Shared primitives library (SectionHeader, MetricTile, StatusChip, etc.)
- Worker cron: every 4h all signals, hourly time-sensitive, daily S2 watchdog + Telegram digest
- VPS daily ingestion pipeline (ingest_daily.py, kkme_sync.py, daily_intel.py)
- Design tokens: full dark/light theme system with anti-flash script
- Static export to Cloudflare Pages (kkme.eu)

## What's queued

**Phase 2B-1** (next Claude Code session): three bundled hero changes.
Prompt at: [docs/phases/phase2b-1-prompt.md](phases/phase2b-1-prompt.md)
1. Remove permanent project labels → hover-only tooltips
2. Tagline copy fix ("LIVE · ENTSO-E · LITGRID · AST · ELERING")
3. Light mode cable particle visibility fix
4. Arrow direction inversion fix on frontend side (B-001)

**Backlog triage** (future Cowork session): organize and prioritize backlog.
Prompt at: [docs/phases/backlog-triage-prompt.md](phases/backlog-triage-prompt.md)

## Architecture summary

| Layer | Component | Location |
|-------|-----------|----------|
| Frontend | Next.js 16 static export | `app/` → Cloudflare Pages (kkme.eu) |
| Worker | Cloudflare Worker (7740 lines) | `workers/fetch-s1.js` → kkme-fetch-s1.kastis-kemezys.workers.dev |
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
| B-001 | bug | P1 | Arrow direction inversion on live hero interconnectors | 2026-04-13 audit | scheduled phase2b-1 | Worker fixed (phase2a-3), frontend still inverted |
| B-002 | bug | P2 | /s8 timestamp shows future time | 2026-04-13 audit | open | Investigate in phase2b-1 or standalone |
| B-003 | tech-debt | P2 | Live API keys in plaintext .env files | 2026-04-13 audit | open | Gitignored but on disk. Move to secrets service eventually |
| B-004 | bug | P2 | "9 SIGNALS · 4H UPDATES" tagline stale | 2026-04-13 audit | scheduled phase2b-1 | Replace with "LIVE · ENTSO-E · LITGRID · AST · ELERING" |
| B-005 | bug | P2 | Light mode cable particle visibility | 2026-04-13 audit | scheduled phase2b-1 | Particles too similar to cable strokes against raster |
| B-006 | enhancement | — | LV↔LT flow not displayed on hero | 2026-04-13 audit | open | Worker returns lv_lt_avg_mw, frontend doesn't render |
| B-007 | tech-debt | P2 | CLAUDE.md model version inconsistency | 2026-04-13 audit | done | Resolved by CLAUDE.md rewrite in this session |
| B-008 | refactor | P2 | Duplicate lib files (safeNum.ts, useSignal.ts) | 2026-04-13 audit | open | lib/ vs app/lib/ — determine authoritative copy, delete other |
| B-009 | tech-debt | P2 | BalticMap.tsx + HeroMarketNow.tsx dead code | 2026-04-13 audit | open | Replaced by HeroBalticMap. Can delete |
| B-010 | tech-debt | P2 | S3CardReference.jsx orphaned at repo root | 2026-04-13 audit | open | 529 lines, not imported. Delete or archive |
| B-011 | tech-debt | P2 | map-calibration-cities.json.json double extension | 2026-04-13 audit | open | public/hero/ — rename or delete |
| B-012 | tech-debt | P2 | README.md is boilerplate | 2026-04-13 audit | open | Rewrite as project description |
| B-013 | tech-debt | P2 | origin/HEAD → dev, should be main | 2026-04-13 audit | open | Change GitHub default branch. Delete dev if unused |
| B-014 | bug | P2 | Raw rgba() in page.tsx line 188 | 2026-04-13 audit | open | Should be var(--border-card). Violates design system |

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
