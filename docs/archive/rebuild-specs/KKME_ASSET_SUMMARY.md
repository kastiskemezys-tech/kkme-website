# KKME.eu — Complete Asset Summary
### As of March 7, 2026

---

## What KKME Is

KKME is a live market intelligence console that answers one question: **Is a Baltic battery storage project investable right now?**

It serves four audiences in priority order:
1. **Investors** screening Baltic BESS opportunities (need: S/D ratio, IRR scenarios, DSCR, COD timing)
2. **Developers** deciding go/no-go on a project (need: grid capacity, CAPEX benchmarks, fleet competition)
3. **BESS operators** monitoring revenue trends (need: aFRR/mFRR prices, compression trajectory, arbitrage capture)
4. **Aggregators/Optimizers** evaluating portfolio opportunity (need: fleet pipeline, market structure)

The site combines 9 live market signals, a configurable Revenue Engine, a Baltic BESS fleet tracker, and a deal submission form into a single-page console. All data updates automatically every 4 hours from official European energy data sources.

Built by Kastytis Kemežys. Hosted at kkme.eu.

---

## Current Page Structure (top to bottom)

### 1. Hero
- KKME wordmark (Unbounded font, weight 300)
- Subtitle: "Baltic battery market signals and project returns"
- Description: data sources + update frequency
- Two CTAs: "Submit a Project" (amber) + "View Signals" (ghost)

### 2. Market Snapshot (replaces old StatusStrip)
- Pulsing green dot indicating live data
- "MARKET STATE: BUILDABLE" label
- 5-column KPI strip: BESS CAPTURE (210 €/MWh) · S/D RATIO (0.65× COMPRESS) · aFRR PRICE (35 €/MW/h) · GRID FREE (3.0 GW) · FLEET OP (375 MW)
- Each cell has: label (tiny), value (large), direction indicator
- Narrative tension line: "Market transitioning — Ignitis 291 MW arriving 2027, window closing."
- Next update countdown: "Next update in 3h 43m"
- Cells are clickable → smooth scroll to relevant section

### 3. Bridge Text
- One paragraph orienting the visitor: "Nine signals track whether a Baltic battery project works..."
- Cormorant Garamond serif for narrative contrast

### 4. Revenue Engine (section-elevated background)
- Section header: "BALTIC PROJECT RETURNS" with description
- CH Benchmark anchor box: "Clean Horizon S1 2025 central: 16.6% IRR (2H), Range: 6-31%, Target hurdle: 12%"
- Copy Link + LinkedIn Share buttons
- "Your configuration" label when URL has custom params
- **Selectors:** System [2H] [4H] + editable MW/MWh inputs · CAPEX [€120] [€164] [€262] · Grant [none] [10%] [30%] · COD [2027] [2028] [2029]
- **Dual IRR heroes:** Project IRR 27.6% (teal/amber/rose by threshold) · Equity IRR 53.2%
- Delta vs CH benchmark: "+11.0pp vs benchmark"
- **DSCR bar:** 3.12× Bankable, with 1.20× threshold line and proximity note
- **Revenue table:** Capacity/Activation/Arbitrage/RTM fees/Gross/OPEX/EBITDA/NET per MW
- **COD sensitivity bars:** 2027 (0.88× COMPRESS) → 2028 (0.95× COMPRESS) → 2029 (1.18× MATURE) — clickable to switch COD
- **EU Market Ranking:** Lithuania (live) vs Ireland/GB/Italy/Germany/Belgium (CH S1 2025 reference)
- Model metadata: COD, system, CH reference, computation timestamp
- MODEL INPUT footer
- **Computed from:** 20-year DCF, 55% debt/4.5%/8yr, 17% CIT, augmentation Y10, CFADS-based DSCR, CPI from fleet trajectory
- **Inline CTA** immediately after: "Have a Baltic battery project? Send it for review ↗"

### 5. Revenue Drivers (Investment Signals, 2-column grid)

**S1 — Baltic Price Separation [Tier 1]**
- Source: ENTSO-E A44 (LT + SE4 + PL day-ahead prices)
- Hero: LT-SE4 spread (currently +0.5 €/MWh)
- BESS Capture panel: 210 €/MWh (top-4h minus bottom-4h, net of RTE)
- 29-day sparkline chart
- Sub-metrics: 51d median, trend, capture
- LT avg / SE4 avg / Spread breakdown
- Tomorrow DA preview (Nord Pool via Mac cron)
- MODEL INPUT → Arbitrage capture · P_high / P_low
- Refresh: every 4 hours via worker cron

**S2 — Balancing Stack + Fleet Tracker [Tier 1]**
- Source: BTD via Mac cron + manual fleet input
- S/D Ratio hero: 0.65× COMPRESS
- Threshold proximity: "0.35 from MATURE threshold"
- Supply/demand breakdown: 375 MW op · 541 MW pipeline · 1190 MW demand
- Trajectory bars: 2026→2031 color-coded by phase (SCARCITY/COMPRESS/MATURE)
- **Fleet list: 8 entries** sorted by status (operational → application)
  - E energija 130 MW (operational)
  - Kruonis PSP 205 MW (operational)
  - AST BESS 40 MW (LV, operational)
  - Ignitis Kelmė 100 MW (under construction, 2027-H1)
  - Ignitis Mažeikiai 100 MW (under construction, 2027-H1)
  - Ignitis Kruonis 91 MW (under construction, 2027-H2)
  - EPMA 200 MW (connection agreement, 2028)
  - Diverxia 50 MW (application, 2028)
- aFRR/mFRR price metrics with CH 2027/2028 target comparison
- P90 imbalance spike indicator
- FCR market saturation note
- MODEL INPUT → S/D ratio · CPI · Capacity prices · Activation rates
- Refresh: BTD every 4h via Mac cron, fleet via manual POST

### 6. Build Conditions (2-column grid)

**S3 — BESS Cost Stack [Tier 2]**
- Source: ECB API (Euribor 3M, HICP)
- Li carbonate hero (awaiting feed — shows shimmer skeleton)
- CAPEX waterfall: Equipment DC €102/kWh → BOS+Civil €44/kWh → HV Grid €18/kWh → Total €164/kWh
- Financing pills: Euribor 3M 2.60% · HICP 2.4% · Real 0.20%
- MODEL INPUT → CAPEX reference · Financing cost
- Refresh: ECB daily

**S4 — Grid Connection Scarcity [Tier 2]**
- Source: VERT.lt ArcGIS (Litgrid FeatureServer/8)
- Hero: 3020 MW free
- Capacity bar: Connected 8,902 MW · Reserved 3,751 MW · Free 34%
- Policy flag: "⚑ PENDING Guarantee dropping €50 → €25/kW · Seimas spring 2026"
- Dev permits (19.4G) and Gen permits (0.20) circles
- Litgrid consumption capacity map link
- MODEL INPUT → Grid constraint · Connection CAPEX
- Refresh: every 4 hours

### 7. Baltic Power Market (Market Context, 5-card auto-fill grid)

**S6 — Nordic Hydro Reservoir [Tier 3]**
- Source: NVE biapi.nve.no (weekly)
- Hero: 42.4% fill
- Deviation from median: -3.4pp
- MODEL INPUT → Indirect (SE4 price support)

**S7 — TTF Gas Price [Tier 3]**
- Source: energy-charts.info (every 4h)
- Hero: 53.4 €/MWh
- Regime: ELEVATED (threshold bar with 15/30/50 markers)
- MODEL INPUT → P_high floor (gas marginal cost)

**S8 — Interconnector Flows [Tier 3]**
- Source: ENTSO-E A11 (every 4h)
- Baltic SVG map with NordBalt + LitPol flow arrows
- Direction and MW labels
- BESS/DC tabs
- MODEL INPUT → Interconnector spread drag

**S9 — EU ETS Carbon [Tier 3]**
- Source: energy-charts.info (every 4h)
- Hero: 70.6 €/t
- BESS peaker displacement breakeven note
- MODEL INPUT → P_high floor (carbon cost)

**S5 — DC Power Viability [Tier 3]**
- Source: ENTSO-E grid data (shared with S4)
- Status: OPEN
- Grid headroom: 3020 MW
- Litgrid consumption capacity map link
- MODEL INPUT → DC corridor thesis (qualitative)

### 8. Market Intel
- Source: Telegram bot (@gattana_bot) → /feed endpoint
- Compact horizontal rows: DATE | CATEGORY | HEADLINE | SOURCE
- Filter pills: ALL · BESS · DC · HYDROGEN · GRID · TECHNOLOGY
- Category-colored tags
- ~10 items, latest from March 3, 2026

### 9. Deal Flow
- Section header: "DEAL FLOW — Baltic BESS projects at RTB stage"
- LEFT column: About text + contact info (email, phone, LinkedIn)
- RIGHT column: Structured form — Project name, MW/MWh, Location, Target COD, Stage, Email + Submit Teaser button

### 10. Footer
- KKME · Baltic BESS Market Signals
- Contact: kastytis@kkme.eu · +370 698 22225 · LinkedIn ↗
- Data sources: ENTSO-E · NVE · ECB · energy-charts.info · Litgrid · VERT.lt · Updated every 4h

### Persistent Elements
- **Sticky Nav:** KKME logo + Signals · Build · Intel · Contact links + "Submit Project" CTA button
- **Signal Bar** (below sticky nav): 5-column live metrics: BESS CAPTURE · S/D RATIO · aFRR · GRID FREE · FLEET OP
- **Scroll progress bar:** 2px teal line at viewport top

---

## Architecture

```
DATA SOURCES                    CLOUDFLARE WORKER           FRONTEND (CF Pages)
────────────                    ─────────────────           ───────────────────
ENTSO-E A44 (DA prices)    ──→  fetchS1() → KV:'s1'   ──→  S1Card.tsx
ENTSO-E A11 (flows)        ──→  fetchS8() → KV:'s8'   ──→  S8Card.tsx
BTD / Mac cron             ──→  POST /s2/update → 's2' ──→  S2Card.tsx
ECB API (Euribor/HICP)     ──→  computeS3() → 's3'    ──→  S3Card.tsx
VERT.lt ArcGIS             ──→  fetchS4() → 's4'      ──→  S4Card.tsx
NVE biapi.nve.no           ──→  fetchS6() → 's6'      ──→  S6Card.tsx
energy-charts.info (TTF)   ──→  fetchTTF() → 's7'     ──→  S7Card.tsx
energy-charts.info (ETS)   ──→  fetchETS() → 's9'     ──→  S9Card.tsx
Manual / Telegram          ──→  POST /s2/fleet → KV    ──→  Fleet list + S/D
BTD CSV upload             ──→  POST /s2/btd → KV     ──→  BTD prices
```

**Worker:** kkme-fetch-s1.kastis-kemezys.workers.dev (~2600 lines)
- Cron: every 4 hours (S1/S3/S4/S6/S7/S8/S9/Euribor)
- 20+ GET endpoints (one per signal + /health + /revenue + /api/model-inputs + /s2/fleet)
- 8+ POST endpoints (fleet, BTD, S2 update, S4 pipeline, S5 manual, DA tomorrow, heartbeat)
- computeRevenue(): full 20-year DCF with parameterized MW/MWh, CPI-driven capacity pricing, CFADS-based DSCR, IRR bisection
- processFleet(): confidence-weighted S/D ratio, piecewise CPI, 8-year trajectory projection

**Pages:** kkme.eu (Cloudflare Pages, auto-deploy from main)
- Next.js 16 App Router + TypeScript
- Tailwind CSS + CSS custom properties
- D3.js for sparklines, Lenis for scroll, anime.js for state-change animations

**KV Store:** 20+ keys (s1, s1_history, s2, s2_fleet, s2_btd, s3, euribor, s4, s4_pipeline, s5, s6, s6_history, s7, s7_history, s8, s9, s9_history, da_tomorrow, feed_index, cron_heartbeat, digest:cache)

**Mac Cron (~/kkme-cron/):**
- fetch-btd.js (0 */4 * * *) — BTD S2 + Litgrid ordered capacity
- fetch-np-da.js (0 13 * * *) — Nord Pool DA prices LT+SE4
- fetch-vert.js (0 6 1 * *) — VERT.lt permits PDF+XLSX

**Telegram Bot** (@gattana_bot): Intel feed intake, /status, /validate, daily digest

---

## Revenue Engine — Financial Model

The Revenue Engine is a parameterized 20-year DCF that computes project returns using live market data.

**User inputs:** MW, MWh (or preset 2H/4H), CAPEX scenario (€120/€164/€262 per kWh), grant (0%/10%/30%), COD year (2027/2028/2029)

**Market-driven inputs (from live signals):**
- Capacity prices: FCR €45, aFRR €40, mFRR €22 /MW/h (Baltic-calibrated proxies, CPI-adjusted by S/D ratio from fleet tracker)
- Arbitrage: P_high/P_low from S1 live DA prices, RTE-corrected
- Gas/carbon floor: from S7 (TTF) and S9 (ETS)
- Grid capacity: from S4

**Model mechanics:**
- MW allocation: proportional (16% FCR, 34% aFRR, 50% mFRR of grid cap)
- Activation: endogenous (aFRR 18% rate × 0.55 depth × €40 margin, mFRR 10% × 0.75 × €55)
- Arbitrage: corrected formula (P_high - P_low/RTE), reserve drag 0.60, 0.9 cycles/day, 300 days/yr
- RTM fees: 10% optimiser + €180k/yr BRP (escalating 2.5%)
- OPEX: €39k/MW/yr (escalating 2.5%)
- Financing: 55% debt, 4.5% rate, 8yr tenor, 1yr grace
- Tax: 17% Lithuanian CIT, 10yr depreciation
- Augmentation: €25/kWh at year 10
- CPI: from fleet trajectory (S/D-driven, piecewise — SCARCITY >1.0×, COMPRESS 0.4-1.0×, MATURE floor 0.40×)

**Outputs:** Project IRR, Equity IRR, NPV @8% WACC, Min DSCR, bankability assessment, Y1 revenue breakdown, 20-year trajectory snapshots

**Expected results (2H, mid CAPEX, 2028 COD):** ~27% project IRR, ~53% equity IRR, ~3.1× DSCR — above the CH S1 2025 benchmark of 16.6%

**URL persistence:** Configuration saved to URL params (kkme.eu?mw=50&mwh=100&capex=mid&cod=2028) — bookmarkable, shareable on LinkedIn

---

## Fleet Tracker

**Current state:** 8 manually seeded entries (3 operational, 3 under construction, 1 connection agreement, 1 application) across LT and LV.

**S/D Ratio computation:**
- Weighted supply = Σ(MW × status weight): operational 1.0, commissioned 1.0, under construction 0.9, connection agreement 0.6, application 0.3, announced 0.1
- Effective demand = 1190 MW (1700 MW Baltic total × 0.70 multi-product stacking)
- Current: weighted 773 MW / 1190 MW = 0.65× → COMPRESS phase, CPI ~0.87×

**Trajectory:** Projects 8-year forward supply/demand, each year computing S/D ratio and CPI based on pipeline COD dates and demand growth (+70 MW/yr)

**Endpoints:**
- POST /s2/fleet — bulk replace all entries + demand
- POST /s2/fleet/entry — upsert single entry (for Telegram bot / automation)
- GET /s2/fleet — raw fleet data
- POST /s2/btd — upload BTD clearing price CSV (computes P50/P75/P90)

---

## API Surface

**/api/model-inputs** — the agent API. Returns all live signal values as structured JSON matching a financial model's input cells. Includes: market (S/D, phase, CPI, trajectory, fleet), capacity_prices (FCR/aFRR/mFRR with source flag proxy/BTD), arbitrage (P_high/P_low, net capture), energy (TTF, ETS, gas marginal, P_high floor), grid (free/used/reserved MW), financing (Euribor, HICP, real rate), capex references, and all default assumptions.

---

## Data Quality Assessment

| Signal | Source | Quality | Gap |
|--------|--------|---------|-----|
| S1 DA Prices | ENTSO-E A44 | ✅ Grounded | Intraday capture is proxy (no 15-min data) |
| S2 Balancing | BTD via Mac cron | ⚠️ Proxy | BTD blocks datacenter IPs; Mac cron works. FCR/aFRR/mFRR prices are Baltic-calibrated proxies, not measured clearing |
| S2 Fleet | Manual entries | ⚠️ Partial | Only 8 projects vs 145+ in Hetzner scraper DB. Major upgrade available |
| S3 Euribor/HICP | ECB API | ✅ Grounded | Li carbonate feed unavailable (BMI/Fastmarkets paywall) |
| S4 Grid | VERT.lt ArcGIS | ✅ Grounded | Permit GW counts sometimes 0 (VERT.lt parse_warning) |
| S5 DC | Derived from S4 | ⚠️ Qualitative | No dedicated DC demand data |
| S6 Hydro | NVE Norway | ✅ Grounded | Weekly only; no history chart yet (accumulating) |
| S7 TTF Gas | energy-charts.info | ✅ Grounded | No history chart yet |
| S8 Interconnectors | ENTSO-E A11 | ✅ Grounded | Arc animation direction may be inverted |
| S9 ETS Carbon | energy-charts.info | ✅ Grounded | No history chart yet |
| Revenue Engine | Computed from KV | ⚠️ Model | All capacity prices are proxy until BTD clearing data uploaded |
| Intel Feed | Telegram bot | ⚠️ Manual | Sparse (10 items), requires manual submission |

---

## What the Hetzner Scraper System Could Improve

The scraper system on Hetzner has 145 resolved projects across 3 countries with entity resolution, SPV detection, and owner group clustering. Connecting it transforms KKME from curated estimates to grounded intelligence.

### Fleet Tracker: 8 → 145+ entries
- Litgrid queue (137 projects), Elering TSO (32), VERT permits (23)
- Entity resolver deduplicates across sources
- Owner groups revealed (Ignitis = 3 SPVs = 291 MW total)
- S/D ratio becomes real market intelligence

### S4 Grid: single number → queue depth + velocity
- 137 Litgrid queue entries show application rate, node congestion, time-to-connection
- New signal: "Litgrid queue grew 200 MW this month" — leading indicator

### Intel Feed: manual → automated change detection
- change_detector.py output becomes feed items automatically
- "New 50 MW BESS in Litgrid queue" — breaking intelligence from official sources

### New features enabled:
- Developer Leaderboard (top developers by pipeline MW)
- Queue Velocity Chart (applications/month trend)
- Geographic Pipeline Map (projects at grid nodes on S8 map)
- Cross-Border Comparison (LT vs EE vs LV maturity)
- SPV → parent group mapping in fleet list

### Integration architecture:
```
Hetzner (scrapers + PostgreSQL)
  ↓ daily cron: scrape → load → resolve → detect changes
  ↓ kkme_sync.py (bridge script)
  ↓ POST /s2/fleet (bulk update)
  ↓ POST to Telegram (change alerts → Intel Feed)
Cloudflare Worker (KV)
  ↓
kkme.eu
```

---

## Known Issues + Remaining Work

### Bugs
- HTML entities in Intel Feed (&#8211; showing instead of em dash) — decoder partially working
- S8 arc animation direction may be inverted for imports
- S4 permit GW counts occasionally 0 (VERT.lt ArcGIS structure changes)
- GitHub Actions S2 fetch workflow failing (BTD IP block, Mac cron is primary path)

### Design/UX deferred
- Font size floor needs bumping (11px → 13px) for readability
- Light/dark mode toggle not yet implemented
- Mobile responsive needs testing at all breakpoints
- Tier 3 cards still show full detail instead of collapsing
- Some cards still have residual card gradients/glow effects

### Features planned but not built
- SSR signal pages (each signal gets own URL for SEO/AI discoverability)
- Dynamic OG images for LinkedIn sharing
- JSON-LD structured data
- Weekly market brief at /briefs/
- "For Investors" framing section + Methodology table
- Email alert signup
- Mobile card accordion

### Data improvements needed
- BTD measured clearing prices (one CSV upload resolves all proxy flags)
- Li carbonate feed (all sources behind paywall)
- S1 intraday 15-min capture (requires ENTSO-E intraday API)
- History charts for S7, S9 (accumulating in KV, will render automatically)
- Hetzner scraper → fleet tracker bridge (kkme_sync.py)

---

## Infrastructure Summary

| Component | Service | URL / Path |
|-----------|---------|------------|
| Website | Cloudflare Pages | kkme.eu |
| Worker | Cloudflare Workers | kkme-fetch-s1.kastis-kemezys.workers.dev |
| KV Store | Cloudflare KV | KKME_SIGNALS namespace |
| Scraper DB | Hetzner VPS (Helsinki) | 89.167.124.42, PostgreSQL 16 |
| Scraper Code | GitHub | kastiskemezys-tech/kkme-control-center |
| Website Code | GitHub | kastiskemezys-tech/kkme-website |
| Mac Crons | Local Mac | ~/kkme-cron/ |
| Telegram Bot | Cloudflare Worker | @gattana_bot |
| Domain | Cloudflare | kkme.eu |

**Secrets:** ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
**Worker KV binding:** env.KV (KKME_SIGNALS)
**Deploy:** `npx wrangler deploy` (worker) separate from `npm run build` (Pages auto-deploy from main)
