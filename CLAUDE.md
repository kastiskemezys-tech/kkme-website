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
1. KKME wordmark
2. Statement — "Baltic energy infrastructure is mispriced. KKME tracks where."
3. S1 — Baltic Price Separation
4. S2 — Balancing Stack (BTD pipeline, metrics show — until BTD unblocks)
5. S3 — Cell Cost Stack
6. S4 — Grid Connection Scarcity
7. TechTracker
8. CTASection
9. Contact

## The 5 signals
- S1: Baltic Price Separation — ENTSO-E API, daily ✓ LIVE
- S2: Balancing Stack — BTD via GitHub Action 05:30 UTC; BTD currently blocks all automated IPs
- S3: Cell Cost Stack — Trading Economics + InfoLink, daily ✓ LIVE (InfoLink optional)
- S4: Grid Connection Scarcity — Litgrid FeatureServer/8, daily ✓ LIVE
- S5: DC Power Viability — DataCenterDynamics RSS, monthly ← NEXT

## Data flow
Cloudflare Worker (cron 06:00 UTC) → computes S1/S3/S4 → writes to KV
GitHub Action (cron 05:30 UTC) → fetches BTD → writes S2 to KV via POST /s2/update
Next.js static export → components fetch Worker endpoints directly from browser

## Build status
[x] Step 1: Repo + stack installed
[x] Step 2: Cloudflare Pages connected
[x] Step 3: Design system (tokens, fonts, grain, base layout)
[x] Step 4: S1 live — Baltic Price Separation (ENTSO-E A44, regime view)
[x] Step 5: LLM digest skeleton (Worker endpoints live; UI stripped pending redesign)
[x] S4 live — Grid Connection Scarcity (Litgrid FeatureServer)
    + VERT.lt pipeline: dev=19,393MW (62 permits) gen=203MW (5 permits) via monthly cron
[x] S3 live — Cell Cost Stack (TE lithium CNY/T + InfoLink + BNEF/Ember refs)
    + Euribor 3M: 2.6% ↓ falling (static ref — ECB live API pending, correct key: M.U2.EUR.4F.MM.R_EURIBOR3MD_.HSTA)
[x] S2 live — Balancing Regime (BTD Mac cron 05:30 UTC)
    FCR ~90 €/MW/h | aFRR ~20 €/MW/h | EARLY regime confirmed (post-sync)
    + Litgrid tomorrow ordered capacity: fetch in fetch-btd.js (logging pending first run)
[x] S1 live — Nord Pool DA tomorrow line added (optional, via Mac cron fetch-np-da.js 13:00 UTC or Worker cron)
[ ] ECB live Euribor fetch — use key M.U2.EUR.4F.MM.R_EURIBOR3MD_.HSTA from Mac cron ← TOMORROW
[ ] S5 — DC Power Viability (DataCenterDynamics RSS) ← NEXT
[ ] Telegram webhook
[ ] Animation pass

## Mac cron scripts (~/kkme-cron/)
All use X-Update-Secret: kkme-btd-2026

| Script          | Schedule        | What it does                                          |
|-----------------|-----------------|-------------------------------------------------------|
| fetch-btd.js    | 30 5 * * *      | BTD S2 (reserves/direction/imbalance) + Litgrid ordered |
| fetch-np-da.js  | 0 13 * * *      | Nord Pool DA prices LT+SE4 → POST /da_tomorrow/update  |
| fetch-vert.js   | 0 6 1 * *       | VERT.lt permits PDF+XLSX → POST /s4/pipeline           |

### fetch-btd.js (S2 + Litgrid)
- Fetches BTD: price_procured_reserves / direction_of_balancing_v2 / imbalance_prices
  Date window: 9 days ago → 2 days ago (BTD publishes with ~2 day lag)
- Also scrapes Litgrid dashboard for tomorrow ordered capacity (ordered_price, ordered_mw)
- Posts { reserves, direction, imbalance, ordered_price?, ordered_mw? } to POST /s2/update
- Worker parses timeseries (d.data.timeseries), extracts LT columns by confirmed index:
  [10] FCR Symmetric · [11] aFRR Up · [12] aFRR Down · [13] mFRR Up · [14] mFRR Down
- Signal thresholds (recalibrated Feb 2026): EARLY >50 · ACTIVE 15-50 · COMPRESSING <15
- BTD blocks CF Worker + GitHub Actions IPs — Mac residential IP is the only working path

## S2 data source — BTD blocking note
- BTD API blocks Cloudflare Worker IPs (decoy SPA HTML) and GitHub Actions IPs (TCP timeout).
- Mac cron bypasses this via residential IP. GitHub Action fetch-btd.yml kept as fallback
  but currently non-functional for BTD fetching.
  All 3 BTD fetches fail → allSettled → pushes NORMAL/null payload to KV.
  S2Card displays NORMAL with "—" for all metrics.
- Pipeline is correct. When BTD eventually unblocks (or we route via residential proxy),
  the column parsing code will pick up the data automatically.
- To get real BTD data: run from a residential IP or a non-datacenter proxy.
  Options: Fly.io (Bucharest edge, EU IP) · Oracle Free Tier · own VPS.
  Alternative: BTD has a dashboard with manual CSV export — could seed S2 manually.

## Known issues / next session
- www.kkme.eu not added as custom domain yet (only kkme.eu configured)
- ANTHROPIC_API_KEY: run `wrangler secret put ANTHROPIC_API_KEY` for production Worker
  (GET /digest returns 503 without it)
- @cloudflare/next-on-pages doesn't support Next.js 16 yet; KV is read via
  Worker HTTP endpoints instead of getRequestContext(). Wire up properly
  when next-on-pages adds Next.js 16 support.
- GitHub default branch changed from `dev` to `main` this session
  (`dev` branch preserved but is 4 commits behind main)

## Cloudflare KV — deployed and wired
- KV namespace: KKME_SIGNALS (id: 323b493a50764b24b88a8b4a5687a24b)
- Worker secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET
- Worker: kkme-fetch-s1.kastis-kemezys.workers.dev — cron 06:00 UTC daily
  GET /              → fresh S1 fetch + KV write (manual trigger)
  GET /read          → cached S1 KV (merges da_tomorrow fields if available)
  GET /s2            → cached S2 KV (written by Mac cron fetch-btd.js)
  POST /s2/update    → write S2 payload to KV (X-Update-Secret required)
  GET /s3            → cached S3 KV (merges euribor from 'euribor' KV key)
  GET /euribor       → cached Euribor KV; computes fresh if empty
  GET /s4            → cached S4 KV (merges pipeline from 's4_pipeline' KV key)
  POST /s4/pipeline  → write VERT.lt pipeline to KV (X-Update-Secret required)
  GET /da_tomorrow   → cached Nord Pool DA KV; computes fresh if empty
  POST /da_tomorrow/update → write Nord Pool DA payload (X-Update-Secret required)
  POST /curate       → store CurationEntry in KV
  GET /curations     → raw curation entries (last 7 days)
  GET /digest        → Anthropic haiku digest; cached 1h in KV
- KV keys: s1 | s2 | s3 | s4 | euribor | da_tomorrow | s4_pipeline | curation:{id} | curations:index | digest:cache
- Cron runs S1/S3/S4/Euribor/NordPoolDA in parallel; S2 is written by Mac cron fetch-btd.js

## S3 signal states
- COMPRESSING: lithium < 120k CNY/T → falling costs, build window
- STABLE:      lithium 120-180k → predictable capex
- PRESSURE:    lithium > 180k AND cell > 90 €/kWh → re-underwrite capex
- WATCH:       lithium > 180k, cell unavailable → verify OEM quotes
- InfoLink DC-side 2h ESS price (RMB/Wh): best-effort scrape; null if site unreachable
- Static refs: China $73/kWh, Europe $177/kWh, Global avg $117/kWh (BNEF Dec 2025)

## S2 signal states
- DEEP:    fcr_avg > 8 €/MW/h → full balancing stack revenue, early-market depth
- NORMAL:  fcr_avg 3-8 €/MW/h → standard revenue assumptions hold
- SHALLOW: fcr_avg < 3 €/MW/h → market compressing, monitor saturation

## Rules for every session
- Read this file first, read KKME.md for design/content decisions
- Update build status when a step completes
- Never touch Step 8 until all signals are live
- One component at a time — build, check in browser, then move on
- Keep components modular — content separated from structure
- Every session ends with a git commit

## S4 Data Sources
### Litgrid FeatureServer/8 — confirmed working
URL: https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/8/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1000&where=1%3D1&orderByFields=&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects

No auth required. Returns 5 rows by Tipas.
Filter: attributes.Tipas === "Kaupikliai"
Key fields: Laisva_galia_prijungimui (free MW), Prijungtoji_galia_PT (connected MW),
            Pasirasytu_ketinimu_pro_galia (reserved MW)
Signal: free_mw > 2000 = OPEN | 500–2000 = TIGHTENING | <500 = SCARCE
Current reading (2026-02-25): free=3107 MW, connected=8802 MW, util=73.9% → OPEN

### VERT Leidimai Plėtoti (confirmed working)
Dev permits PDF: https://www.vert.lt/elektra/SiteAssets/Leidimai/Leidimai%20pl%C4%97toti%20kaupimo%20paj%C4%97gumus%202026-01-31.pdf
Gen permits XLSX: https://www.vert.lt/SiteAssets/atsinaujinantys-istekliai/2025-02/Leidimai%20generuoti%20i%C5%A1%20kaupimo%20%C4%AFrengini%C5%B3%202025-02-05.xlsx
Update URLs in ~/kkme-cron/fetch-vert.js (PDF_URL / XLSX_URL) on the 1st of each month.
Current reading (2026-02-25): dev_total_mw=19,393 (62 permits) gen_total_mw=203 (5 permits)
POST /s4/pipeline → stores as 's4_pipeline' KV key, merged into GET /s4 response
