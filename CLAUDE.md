# KKME — Claude Code Context

## What this is
Single-page infrastructure intelligence site for Kastis Kemežys.
One public page. No password. Console IS the homepage.
Full thesis: see KKME.md in this repo.

## Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS + CSS custom properties for design tokens
- D3.js + Observable Plot for data visualisation
- Lenis for smooth scroll
- anime.js for state-change animations only
- Cloudflare Pages (hosting) + Workers (data fetching) + KV (data storage)
- Anthropic API for daily LLM digest

## Design tokens (never change without checking KKME.md)
--bg: #07070a
--text: #e8e2d9
--accent: #7b5ea7
--font-serif: 'Cormorant', serif        ← primary voice, dominant
--font-mono: 'DM Mono', monospace       ← data and numbers
--font-display: 'Unbounded', sans-serif ← headings only, sparingly

## Design references (Overfinch / Tuscan manor / Lynch)
- Nothing tries to impress, but everything does
- Function is the aesthetic
- Animation ONLY on state changes — never decorative
- Warm off-white text on near-black background
- Something operating just beneath the surface
- Visually datable to 2026: fluid typography, real-time data, considered micro-interactions

## Page structure (single page, top to bottom)
1. KKME statement (3 sentences — in KKME.md, do not rewrite)
2. S1–S5 signals with reference anchors + IRR context
3. Daily LLM digest cards with source links
4. Technology thesis tracker with conviction history
5. Contact (email + LinkedIn only)

## The 5 signals
- S1: Baltic Price Separation — ENTSO-E API, daily
- S2: Balancing Market Tension — Litgrid/Nord Pool, weekly
- S3: Lithium Cell Price + China OEM Pulse — Benchmark Mineral + scraped, weekly
- S4: Grid Connection Scarcity — VERT + Litgrid scrape, monthly
- S5: DC Power Viability — ENTSO-E reused + DataCenterDynamics, monthly

## Data flow
Cloudflare Worker (cron) → fetches APIs → writes to KV
Next.js → reads KV via /api/signals → renders

## Build status
[x] Step 1: Repo + stack installed
[ ] Step 2: Cloudflare Pages connected
[x] Step 3: Design system (tokens, fonts, grain, base layout)
[ ] Step 4: S1 live data (ENTSO-E → Worker → KV → page)
[ ] Step 5: LLM digest skeleton
[ ] Step 6: S2–S5
[ ] Step 7: Technology tracker
[ ] Step 8: Polish (motion, micro-interactions)

## Rules for every session
- Read this file first, read KKME.md for design/content decisions
- Update build status when a step completes
- Never touch Step 8 until Step 6 is done
- One component at a time — build, check in browser, then move on
- Keep components modular — content separated from structure
- Every session ends with a git commit