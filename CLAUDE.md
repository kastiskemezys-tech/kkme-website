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
[x] Step 4: S1 live data (ENTSO-E → Worker → KV → page)
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

## S4 Data Sources (Step 6)

### Litgrid ArcGIS — Ketinimų protokolai
The grid reservation map has a queryable FeatureServer REST API underneath it.
App URL: https://experience.arcgis.com/experience/1aa8fb2983c34b7bbc4343d22d9071a5
Underlying WebMap ID: e658d23dc08f4c00808cc49554bddc44
Portal: https://litgrid.maps.arcgis.com
Dashboard: https://litgrid.maps.arcgis.com/apps/dashboards/5141697a3ab444afab2ae694e0b4dc9c

To find the exact FeatureServer query URL:
Open the map → DevTools Network tab → Fetch/XHR filter → click Ketinimų 
protokolai tab → look for requests to litgrid.maps.arcgis.com containing 
FeatureServer/query → copy the full URL

Data fields available:
- Pasirašymo data (signing date)
- Galiojimo terminas (expiry)
- Gamintojas (developer/company)
- Elektrinės leistina generuoti galia MW (permitted MW)
- Elektrinės tipas (technology: wind/solar/BESS/hybrid)
- Prijungimo taško įtampa kV (connection voltage: 110 or 330)

Summary table (Rodikliai tab) shows:
- SE free capacity: 8500 MW
- VE (wind) free capacity: 6834 MW  
- Kaupikliai (BESS) free capacity: 8664 MW
- Total: 23998 MW across all types

### VERT Leidimai Plėtoti
URL: to be added
Monthly updates, last day of month.