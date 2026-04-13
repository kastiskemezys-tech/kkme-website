# KKME Architecture Audit — 2026-04-12

**Status:** Read-only investigation. No files modified.
**Purpose:** Map the full data infrastructure to plan refresh cadence improvements.

---

## Deployment Topology

```
                    ┌─────────────────────────┐
                    │     kkme.eu (Users)      │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                                      ▼
┌─────────────────────────┐         ┌────────────────────────────────────┐
│   Cloudflare Pages      │         │   Cloudflare Worker                │
│   Static export (out/)  │         │   kkme-fetch-s1                    │
│   Next.js 16 → HTML/JS  │         │   7,685 lines                      │
│   Auto-deploy from main │         │   56 endpoints                     │
│   No SSR                │         │   3 cron triggers                  │
└─────────────────────────┘         │   KV: KKME_SIGNALS                 │
                                    └──────────┬──────┬──────────────────┘
                                               │      │
                          ┌────────────────────┘      └────────────┐
                          ▼                                         ▼
               ┌──────────────────┐                    ┌──────────────────────┐
               │  External APIs   │                    │  Hetzner VPS         │
               │  ENTSO-E         │                    │  89.167.124.42       │
               │  energy-charts   │                    │  PostgreSQL          │
               │  BTD / Litgrid   │                    │  35 pipeline tables  │
               │  ECB / NVE       │                    │  Daily ingestion     │
               │  Nord Pool       │                    │  07:45 UTC           │
               │  Yahoo / TE      │                    │  Pushes to KV:       │
               │  Anthropic       │                    │    s1_capture        │
               └──────────────────┘                    │    revenue_trailing  │
                                                       │    s2_rolling_180d   │
               ┌──────────────────┐                    └──────────────────────┘
               │  Mac Cron        │
               │  ~/kkme-cron/    │
               │  fetch-btd.js    │  ← 09:30 UTC daily
               │  fetch-vert.js   │  ← 1st of month
               │  POSTs to worker │
               └──────────────────┘
```

**Key architectural fact:** The frontend is a **static export** — no SSR, no server components. Every data fetch happens client-side via `useSignal` hook or plain `fetch()` on component mount. There is **no auto-refresh** — data updates require page reload.

---

## Cloudflare Worker (workers/fetch-s1.js)

### Cron Schedule

| Trigger | Schedule | What it does |
|---------|----------|--------------|
| Every 4h | `0 */4 * * *` | Refreshes ALL signals: S1, S2, S3, S4, S5, S6, S7, S8, S9, Euribor, genload, wind, solar, load. Appends history. Stores daily snapshots. |
| Daily 09:30 | `30 9 * * *` | S2 watchdog — extra fetch of Litgrid ordered capacity (publishes ~08:30 UTC) |
| Daily 08:00 | `0 8 * * *` | Sends daily digest via Anthropic + Telegram |

### Endpoints (56 total, grouped by function)

**Signal endpoints (GET, served from KV cache):**

| Endpoint | Signal | Data source | KV key |
|----------|--------|-------------|--------|
| `/s1` | Baltic Price Separation | ENTSO-E A44 | `s1` |
| `/read` | S1 merged (capture + extreme) | KV merge | `s1` + `s1_capture` + `extreme:latest` |
| `/s1/capture` | DA gross capture detail | energy-charts.info price | `s1_capture` |
| `/s2` | Baltic Balancing Market | BTD + fleet + activation | `s2` + `s2_activation` + `s2_rolling_180d` |
| `/s3` | Project Cost Trend | ECB + Yahoo + TE | `s3` + `euribor` + `s3_editorial` |
| `/s4` | Grid Access & Buildability | Litgrid ArcGIS | `s4` + `s4_pipeline` + `s4_buildability` |
| `/s5` | DC Power Viability | Manual quarterly | `s5` |
| `/s6` | Nordic Hydro | NVE biapi | `s6` |
| `/s7` | TTF Gas | Yahoo Finance | `s7` |
| `/s8` | Interconnectors | energy-charts CBET | `s8` |
| `/s9` | EU ETS Carbon | Trading Economics | `s9` |
| `/genload` | Baltic gen + load | ENTSO-E A75 + A65 | `genload` |
| `/s_wind` | Baltic wind gen | ENTSO-E A75 | `s_wind` |
| `/s_solar` | Baltic solar gen | ENTSO-E A75 | `s_solar` |
| `/s_load` | Baltic demand | ENTSO-E A65 | `s_load` |
| `/euribor` | Euribor 12M | ECB API | `euribor` |
| `/da_tomorrow` | Next-day DA prices | Nord Pool | `da_tomorrow` |
| `/revenue` | Reference asset returns | Computed from S1+S2+S4+Euribor | On-demand (not cached) |

**History endpoints (GET):**

| Endpoint | KV key |
|----------|--------|
| `/s1/history` | `s1_history` |
| `/s7/history` | `s7_history` |
| `/s9/history` | `s9_history` |
| `/s6/history` | `s6_history` |
| `/history/trailing` | `revenue_trailing` |

**POST endpoints (data ingestion, require X-Update-Secret):**

| Endpoint | Purpose | Source |
|----------|---------|--------|
| `/s2/update` | BTD payload push | Mac cron |
| `/s2/fleet`, `/s4/fleet` | Fleet data | VPS pipeline |
| `/s2/activation` | Activation clearing prices | Mac cron |
| `/s4/pipeline` | VERT.lt permit data | Mac cron |
| `/s4/buildability` | Buildability assertions | VPS |
| `/trading/update` | 15-min dispatch data | Mac cron |
| `/kv/set` | Generic KV write | VPS daily ingestion |
| `/contact` | Contact form | Frontend |
| `/feed/events` | Intel feed items | Manual/automated |
| `/extreme/seed` | Extreme market events | Automated |

**Other GET endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `/health` | KV freshness check (all signals) |
| `/health-detail` | Extended validation + fleet + regime |
| `/api/model-inputs` | Signal snapshot for analyst use |
| `/api/dispatch` | V2 dispatch with battery params |
| `/api/trading/*` | Trading analysis (latest, history, signals, export) |
| `/feed`, `/feed/by-signal` | Curated intel feed |
| `/digest` | Anthropic-generated daily digest (cached 1h) |
| `/curations` | Raw curation entries |

### Environment Variables (7)

| Variable | Purpose |
|----------|---------|
| `ENTSOE_API_KEY` | ENTSO-E web API auth |
| `ANTHROPIC_API_KEY` | Claude API (digest + interpretations) |
| `UPDATE_SECRET` | POST endpoint auth (`kkme-btd-2026`) |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications |
| `TELEGRAM_CHAT_ID` | Telegram channel |
| `RESEND_API_KEY` | Email (contact form) |
| `KKME_SIGNALS` | KV namespace binding |

---

## External Data Sources (15 APIs)

| # | API | URL | Used by | Frequency upstream | KKME fetch |
|---|-----|-----|---------|--------------------|------------|
| 1 | ENTSO-E A44 | web-api.tp.entsoe.eu | S1 (DA prices) | Daily ~13:00 CET | Every 4h |
| 2 | ENTSO-E A75 | web-api.tp.entsoe.eu | genload, wind, solar | Every 15-60 min | Every 4h |
| 3 | ENTSO-E A65 | web-api.tp.entsoe.eu | genload, load | Every 15-60 min | Every 4h |
| 4 | energy-charts CBET | api.energy-charts.info/cbet | S8 (interconnectors) | ~Hourly | Every 4h |
| 5 | energy-charts price | api.energy-charts.info/price | S1 capture | ~Hourly | Every 4h |
| 6 | energy-charts power | api.energy-charts.info/public_power | wind, solar, load | ~Hourly | Every 4h |
| 7 | BTD | api-baltic.transparency-dashboard.eu | S2 (balancing) | ~2 day lag | Every 4h + Mac cron |
| 8 | Litgrid ArcGIS | services-eu1.arcgis.com | S4 (grid) | Monthly/quarterly | Every 4h |
| 9 | ECB Euribor | data-api.ecb.europa.eu | S3, revenue | Monthly | Every 4h |
| 10 | ECB HICP | data-api.ecb.europa.eu | S3 | Monthly | Every 4h |
| 11 | NVE biapi | biapi.nve.no | S6 (Nordic hydro) | Weekly (Wed) | Every 4h |
| 12 | Nord Pool | data.nordpoolgroup.com | DA tomorrow | Daily ~12:45 CET | Every 4h |
| 13 | Yahoo Finance | query1.finance.yahoo.com | S7 (TTF gas) | Continuous (mkt hrs) | Every 4h |
| 14 | Trading Economics | tradingeconomics.com | S9 (carbon), S3 (lithium) | Continuous (mkt hrs) | Every 4h |
| 15 | Frankfurter | api.frankfurter.app | S3 (FX rates) | Daily | Every 4h |

**Note:** CLAUDE.md documents S7 as "energy-charts.info" and S8 as "ENTSO-E A11" but the actual code uses Yahoo Finance for S7 and energy-charts CBET for S8. S9 uses Trading Economics HTML scraping, not energy-charts.

### Rate Limit Headroom

| API | Known limit | Current usage | Headroom |
|-----|-------------|---------------|----------|
| ENTSO-E | 400 req/min, 10-min ban on exceed | ~20 calls/4h = 5/h | Large headroom — could go to 15-min cadence |
| energy-charts | Soft limit, undocumented | ~10 calls/4h | Moderate — avoid going below 15-min |
| ECB | No documented limit | 2 calls/4h | Unlimited headroom |
| Nord Pool | Unofficial, generous | 1 call/4h | Large headroom |
| BTD | No limit, but SSL issues | 4 calls/4h | N/A (2-day publication lag) |
| Litgrid ArcGIS | 2000 req/min | 1 call/4h | Unlimited headroom |

---

## Frontend Data Hooks

### Architecture

- **No SWR**. Custom `useSignal<T>(url)` hook in `app/lib/useSignal.ts`
- Timeout: 5 seconds, 2 retries with 2-second delay
- **No auto-refresh** — single fetch on component mount
- **No SWRConfig** — no global fetch configuration
- Stale data detected via `_stale`, `_age_hours`, `_serving` fields in response
- Cards show `FreshnessBadge` warnings but don't re-fetch

### Component Data Map

| Component | File | Endpoint(s) | Fetch method | Refresh |
|-----------|------|-------------|--------------|---------|
| HeroBalticMap | HeroBalticMap.tsx (772L) | `/s4/fleet`, `/revenue?dur=4h`, `/read`, `/s8`, `/s4`, `/s1/capture`, `/s2`, `/genload` | Promise.all(fetch) | Mount-once |
| S1Card | S1Card.tsx (886L) | `/read`, `/s1/capture` | useSignal + fetch | Mount-once |
| S2Card | S2Card.tsx (1448L) | `/s2` | useSignal | Mount-once |
| S3Card | S3Card.tsx | `/s3` | useSignal | Mount-once |
| S4Card | S4Card.tsx (792L) | `/s4` | useSignal | Mount-once |
| S7Card | S7Card.tsx | `/s7`, `/s7/history` | useSignal + fetch | Mount-once |
| S8Card | S8Card.tsx | `/s8` | useSignal | Mount-once |
| S9Card | S9Card.tsx | `/s9`, `/s7` | useSignal + fetch | Mount-once |
| WindCard | WindCard.tsx | `/s_wind` | useSignal | Mount-once |
| SolarCard | SolarCard.tsx | `/s_solar` | useSignal | Mount-once |
| LoadCard | LoadCard.tsx | `/s_load` | useSignal | Mount-once |
| RevenueCard | RevenueCard.tsx (762L) | `/revenue?dur=4h&capex=mid&cod=2028&scenario=base` | useSignal | Mount-once |
| IntelFeed | IntelFeed.tsx (785L) | `/curations` | fetch | Mount-once |

### Page Structure (app/page.tsx)

**Eagerly loaded:** HeroBalticMap, S1Card, S2Card, StickyNav, PageBackground
**Lazy loaded (dynamic):** S3Card, S4Card, S7Card, S8Card, S9Card, WindCard, SolarCard, LoadCard, RevenueCard, TradingEngineCard, IntelFeed, ContactForm, ConfidencePanel

---

## External Infrastructure

### Hetzner VPS (89.167.124.42)

| Component | Purpose |
|-----------|---------|
| PostgreSQL | 35 pipeline intelligence tables (Litgrid, VERT, AST, Elering, Elektrilevi) |
| ingest_daily.py | Runs 07:45 UTC daily. Processes ENTSO-E 15-min ISPs, computes trailing 12m summary, pushes to KV |
| kkme_sync.py | Runs 07:00 UTC daily. Fleet sync from scrapers to worker |
| daily_intel.py | Runs 07:30 UTC daily. Pipeline intelligence enrichment |
| Scrapers | Playwright/Selenium scrapers for Litgrid, VERT, AST, Elering, Elektrilevi |

**KV keys pushed by VPS:**
- `s1_capture` — trailing 12m DA capture stats
- `revenue_trailing` — trailing 12m revenue summary
- `s2_rolling_180d` — 180-day rolling S2 stats

### Mac Cron (~/kkme-cron/)

| Script | Schedule | Purpose |
|--------|----------|---------|
| fetch-btd.js | 09:30 UTC daily | BTD S2 balancing data + Litgrid ordered capacity + trading dispatch |
| fetch-vert.js | 1st of month 06:00 UTC | VERT.lt permits PDF + XLSX parsing |

**Why Mac cron exists:** BTD blocks datacenter IPs. Mac cron fetches from residential IP and POSTs to worker.

### kkme-control-center (~/kkme-control-center/)

Separate repo containing:
- PostgreSQL migrations (001-003)
- 6 Python loaders (litgrid, vert, ast, elering, elektrilevi, latvia)
- Entity resolver + company enricher
- Google Sheets sync
- Deal agent + email router (intelligence layer)

---

## KV Namespace: KKME_SIGNALS

48 keys total. Organized by category:

| Category | Keys | Update source |
|----------|------|---------------|
| Signal data | s1-s9, genload, s_wind, s_solar, s_load, euribor, da_tomorrow | Worker cron (every 4h) |
| History | s1_history, s2_btd_history, s6_history, s7_history, s9_history | Worker cron (appended) |
| VPS-pushed | s1_capture, revenue_trailing, s2_rolling_180d | VPS daily (07:45 UTC) |
| Fleet | s4_fleet, s4_pipeline, s4_buildability, s2_fleet (legacy) | POST endpoints |
| Activation | s2_activation | Mac cron POST |
| Dispatch | trading:DATE, dispatch:DATE:dur | POST /trading/update |
| Editorial | s3_baseline, s3_editorial, s3_enrichment, s3_freshness | POST /s3/editorial + cron |
| Feed | feed_index, feed_{id} | POST /feed/events |
| Extreme | extreme:latest | POST /extreme/seed |
| Digest | digest:cache | Daily 08:00 cron |
| Telemetry | cron_heartbeat | Every cron run |
| Raw snapshots | raw:s1:DATE, raw:s3:DATE, raw:s7:DATE | Cron (TTL 7d) |

### Stale Thresholds (from workers/lib/defaults.js)

| Signal | Stale after | Reasoning |
|--------|-------------|-----------|
| s1 | 36h | DA prices: daily |
| s2 | 48h | BTD: daily cron |
| s3 | 36h | Daily cron |
| euribor | 168h (7d) | Weekly is fine |
| s4 | 36h | Daily |
| s4_pipeline | 840h (35d) | Monthly |
| s5 | 6h | Every 4h cron |
| s6 | 168h (7d) | Weekly NVE data |
| s7 | 12h | Daily market data |
| s8 | 12h | Daily flows |
| s9 | 12h | Daily market data |

---

## Current Refresh Cadence Inventory

| Endpoint | Upstream source | Upstream publishes | KKME fetches | Staleness ratio | KV TTL | Frontend refresh |
|----------|----------------|--------------------|--------------|-----------------|--------|------------------|
| `/s1` | ENTSO-E A44 | Daily ~13:00 CET | Every 4h | 6 fetches/update | None | Mount-once |
| `/s2` | BTD | ~2 day lag | Every 4h + 09:30 | N/A (lag-bound) | None | Mount-once |
| `/s3` | ECB + Yahoo + TE | Monthly (Euribor) / Daily (lithium) | Every 4h | 180x over-fetch (Euribor) | None | Mount-once |
| `/s4` | Litgrid ArcGIS | Monthly/quarterly | Every 4h | 180-540x over-fetch | None | Mount-once |
| `/s5` | Manual | Quarterly | Manual | 1:1 | None | Mount-once |
| `/s6` | NVE | Weekly (Wed) | Every 4h | 42x over-fetch | None | Mount-once |
| `/s7` | Yahoo Finance | Continuous (mkt hrs) | Every 4h | Adequate for regime | None | Mount-once |
| `/s8` | energy-charts CBET | ~Hourly | Every 4h | 4x staler than possible | None | Mount-once |
| `/s9` | Trading Economics | Continuous (mkt hrs) | Every 4h | Adequate for regime | None | Mount-once |
| `/genload` | ENTSO-E A75+A65 | Every 15-60 min | Every 4h | **4-16x staler** | bg-refresh if >5m | Mount-once |
| `/s_wind` | ENTSO-E A75 | Every 15-60 min | Every 4h | 4-16x staler | None | Mount-once |
| `/s_solar` | ENTSO-E A75 | Every 15-60 min | Every 4h | 4-16x staler | None | Mount-once |
| `/s_load` | ENTSO-E A65 | Every 15-60 min | Every 4h | 4-16x staler | None | Mount-once |
| `/euribor` | ECB FM monthly | Monthly | Every 4h | 180x over-fetch | None | Mount-once |
| `/da_tomorrow` | Nord Pool | Daily ~12:45 CET | Every 4h | 6 fetches/update | None | Mount-once |
| `/revenue` | Computed | On-demand | On-demand | N/A (computed) | None | Mount-once |

---

## Worst Offenders (Stalest Data vs. What's Available)

| Rank | Signal | Gap | Impact | Recommendation |
|------|--------|-----|--------|----------------|
| **1** | `/genload` (hero gen/load) | 4h fetch vs 15-60 min upstream | Hero map shows 4h-old gen/load next to user's expectation of "live" | Add dedicated hourly cron or per-request fetch |
| **2** | `/s8` (interconnectors) | 4h fetch of 24h daily average | Hero arrows show daily average, not current flow; plus sign bug inverts all arrows | Fix averaging to use latest point; add hourly cron |
| **3** | `/s_wind`, `/s_solar`, `/s_load` | 4h fetch vs hourly upstream | Structural driver cards show 4h-old generation data | Add hourly cron for ENTSO-E gen/load |
| **4** | Frontend (all cards) | Mount-once, no refresh | User must reload page to see any updates, even after 4h cron runs | Add 5-min or 4h `setInterval` refetch |
| **5** | `/s4` (grid) | 4h fetch vs monthly upstream | Harmless over-fetch but wastes API calls | Move to daily cron; flag as low-priority |
| **6** | `/euribor`, `/s3` HICP | 4h fetch vs monthly upstream | Pure waste — monthly data fetched 180x between updates | Move to daily cron |
| **7** | `/s6` (Nordic hydro) | 4h fetch vs weekly upstream | 42x over-fetch | Move to daily cron |

---

## CLAUDE.md vs Reality Discrepancies

| Item | CLAUDE.md says | Actual code |
|------|----------------|-------------|
| S7 data source | "energy-charts.info (every 4h)" | Yahoo Finance v8 API (`query1.finance.yahoo.com`) |
| S8 data source | "ENTSO-E A11 (every 4h)" | energy-charts.info CBET API |
| S9 data source | "energy-charts.info (every 4h)" | Trading Economics HTML scrape |
| S3 lithium source | Not documented | Trading Economics HTML scrape |
| S8 sign convention | "positive = country exporting TO neighbor" (worker comment) | `positiveFlowReceives` in baltic-places.ts expects positive = receiving (opposite) |
| Worker line count | "~6900 lines" | 7,685 lines |

---

## Architecture Questions for Kastis

1. **VPS daily ingestion timing:** ingest_daily.py runs at 07:45 UTC and pushes `s1_capture`, `revenue_trailing`, `s2_rolling_180d` to KV. If we add an hourly cron for genload/wind/solar, should VPS also push more frequently? Or is daily sufficient for the trailing-12m metrics it computes?

2. **Mac cron dependency:** fetch-btd.js runs from your Mac because BTD blocks datacenter IPs. If your Mac is off/asleep, S2 activation data goes stale. Is there a plan to move this to a residential proxy or VPS with residential IP?

3. **Control center sync:** kkme_sync.py (07:00 UTC) pushes fleet data from PostgreSQL scrapers to the worker. How often do the underlying scrapers (Litgrid, VERT, Elering, Elektrilevi) actually run on the VPS? Are they daily, weekly, or triggered?

4. **Trading dispatch flow:** `/trading/update` receives 15-min dispatch data via POST. Who or what sends this? Is it the Mac cron (fetch-btd.js) or the VPS? How often?

5. **Revenue computation:** `/revenue` is computed on-demand (not cached). Each request triggers a full 20-year projection from S1/S2/S4/Euribor KV data. Is the compute cost acceptable for concurrent users, or should we cache with TTL?

6. **Static export constraint:** Next.js is configured as `output: 'export'` (static HTML). This means no ISR, no server-side revalidation, no API routes. Any refresh improvement must happen client-side (polling) or worker-side (more frequent cron). Is there any plan to move to SSR for freshness or SEO reasons?

7. **energy-charts rate limits:** We currently hit energy-charts 6 times per 4h cron (LT/EE/LV price + LT/EE/FI CBET). If we move to hourly, that's 36 calls/day. Is that within their tolerance? Their limits aren't documented.

---

## Recommended Next Steps

### Tier 1 — Fix bugs found in genload diagnostic (see docs/genload-diagnostic-2026-04-12.md)

1. **Fix S8 arrow inversion** — Remove minus sign in `avgFromList` (worker line 4725) or flip `positiveFlowReceives` in baltic-places.ts
2. **Fix S8 averaging** — Use latest data point from energy-charts instead of 24h daily average
3. **Fix genload parser** — Sum all series' latest points regardless of timestamp alignment
4. **Add LV↔LT flow** — Extract Latvia column from energy-charts CBET response (already fetched)

### Tier 2 — Improve refresh cadence

5. **Add hourly cron** (`0 * * * *`) for time-sensitive signals: genload, s_wind, s_solar, s_load, s8. Keep the 4h cron for everything else. This requires a second wrangler.toml trigger and a conditional in the scheduled handler.

6. **Add frontend auto-refresh** — Add a 5-minute `setInterval` in `useSignal` that re-fetches. Or add a 4h interval that matches cron cadence. Even a simple "refresh" button on the hero would help.

7. **Move slow signals to daily cron** — s4, euribor, s6 don't need 4h refresh. Could be split to a separate daily trigger to reduce unnecessary API calls (though the cost is negligible on Workers).

### Tier 3 — Architecture improvements

8. **Add S8 timestamp from data** — Use `unix_seconds` from energy-charts response instead of `new Date()`
9. **Add genload per-request freshness** — The `/genload` endpoint already does bg-refresh when KV is >5min old. Consider making this the pattern for other hero signals.
10. **Update CLAUDE.md** — Fix the S7/S8/S9 data source documentation to match reality.
