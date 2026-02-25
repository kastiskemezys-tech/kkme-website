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
3. S1 — Baltic Price Separation (live)
4. S4 — Grid Connection Scarcity (live)
5. [S3 next] — Lithium Cell Price
6. TechTracker
7. CTASection
8. Contact

## The 5 signals
- S1: Baltic Price Separation — ENTSO-E API, daily ✓ LIVE
- S2: Balancing Market Tension — ENTSO-E A61 FCR-D, weekly
- S3: Lithium Cell Price — Trading Economics scrape, weekly
- S4: Grid Connection Scarcity — Litgrid FeatureServer/8, monthly ✓ LIVE
- S5: DC Power Viability — DataCenterDynamics RSS, monthly

## Data flow
Cloudflare Worker (cron) → fetches APIs → writes to KV
Next.js static export → components fetch Worker endpoints directly from browser

## Build status
[x] Step 1: Repo + stack installed
[x] Step 2: Cloudflare Pages connected
[x] Step 3: Design system (tokens, fonts, grain, base layout)
[x] Step 4: S1 live — Baltic Price Separation (ENTSO-E, regime view)
[x] Step 5: LLM digest skeleton (Worker endpoints live; UI stripped pending redesign)
[x] S4 live — Grid Connection Scarcity (Litgrid FeatureServer)
[ ] S3 — Lithium Cell Price (Trading Economics scrape) ← NEXT
[ ] S2 — Balancing Market Tension (ENTSO-E A61, FCR-D doc type)
[ ] S5 — DC Power Viability (DataCenterDynamics RSS)
[ ] Telegram bot — code exists, webhook not yet registered
[ ] Step 7: Technology tracker (content done; no separate UI step needed)
[ ] Step 8: Animation pass (do last)

## S3 spec (next task)
- Scrape tradingeconomics.com/commodity/lithium for current LFP price
- Store in KV as 's3'
- Signal logic:
    < 70 €/kWh  = FALLING  (good for projects)
    70–90 €/kWh = STABLE
    > 90 €/kWh  = RISING   (capex pressure)
- Worker endpoint: GET /s3 (same pattern as /s4 — cached KV, compute fresh if empty)
- Add computeS3() to cron alongside S1/S4 via Promise.allSettled
- New component: app/components/S3Card.tsx (same pattern as S1Card/S4Card)
- Page position: between S4Card and TechTracker

## Known issues / next session
- www.kkme.eu not added as custom domain yet (only kkme.eu configured)
- ANTHROPIC_API_KEY: run `wrangler secret put ANTHROPIC_API_KEY` for production Worker
  (GET /digest returns 503 without it)
- @cloudflare/next-on-pages doesn't support Next.js 16 yet; KV is read via
  Worker HTTP endpoints instead of getRequestContext(). Wire up properly
  when next-on-pages adds Next.js 16 support.

## Cloudflare KV — deployed and wired
- KV namespace: KKME_SIGNALS (id: 323b493a50764b24b88a8b4a5687a24b)
- Worker: kkme-fetch-s1.kastis-kemezys.workers.dev — cron 06:00 UTC daily
  GET /              → fresh S1 fetch + KV write (manual trigger)
  GET /read          → cached S1 KV value (fetched by S1Card)
  GET /s4            → cached S4 KV value; computes fresh if empty
  GET /s3            → cached S3 KV value; computes fresh if empty (TODO)
  POST /curate       → store CurationEntry in KV
  GET /curations     → raw curation entries (last 7 days)
  GET /digest        → Anthropic haiku digest; cached 1h in KV
  POST /telegram     → Telegram webhook (verified via X-Telegram-Bot-Api-Secret-Token)
  POST /telegram/setup → register Telegram webhook (run once after deploy)
- KV keys: s1 | s4 | s3 (todo) | curation:{id} | curations:index | digest:cache
- Cron runs S1 + S4 in parallel via Promise.allSettled with 25s timeout each

## Telegram curation bot
Bot receives forwarded articles → Worker extracts title/tags/summary via Claude haiku →
stores as CurationEntry in KV → appears in /digest automatically.

Setup sequence (not yet done):
  wrangler secret put TELEGRAM_BOT_TOKEN      ← BotFather token
  wrangler secret put TELEGRAM_WEBHOOK_SECRET ← any strong random string
  npx wrangler deploy
  curl -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/telegram/setup

To verify webhook is registered:
  curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo

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

### VERT Leidimai Plėtoti
URL: to be added. Monthly updates, last day of month.
