# KKME.eu — Master Architecture
**Updated: 2026-03-11**

---

## What KKME is

A free Baltic BESS market intelligence console. Single question: what do Baltic battery storage economics look like under current competition, timing, and market structure?

Not a trading terminal. Not a sales funnel. Not a generic energy dashboard.
A structural timing / competition / buildability view for developers, investors, and counterparties.

**Product promise:** The fastest honest way to understand whether a Baltic BESS project story still makes sense under current conditions.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 App Router + TypeScript, Cloudflare Pages |
| Styling | Tailwind CSS + CSS custom properties (design tokens in globals.css) |
| Data viz | D3.js, plain SVG/divs for charts. No heavy chart libraries. |
| Animation | anime.js (state changes only). Lenis (scroll). |
| Data worker | Cloudflare Worker (~2600 lines), cron every 4h |
| Storage | Cloudflare KV (namespace: KKME_SIGNALS, bound as env.KV) |
| Hosting | Cloudflare Pages (kkme.eu, auto-deploy from main) |
| Cron supplements | Mac cron (~/kkme-cron/) for BTD, Nord Pool, VERT.lt |
| Intel intake | Telegram bot (@gattana_bot) → Intel Feed |

---

## Data flow

```
SOURCES                          WORKER (CF Worker)              FRONTEND (CF Pages)
────────                         ──────────────────              ───────────────────
ENTSO-E A44 (DA prices)    ───→  fetchS1() → KV:'s1'      ───→  S1Card.tsx
BTD / Mac cron (balancing) ───→  fetchS2() → KV:'s2'      ───→  S2Card.tsx
ECB API (Euribor/HICP)    ───→  computeS3() → KV:'s3'    ───→  S3Card.tsx
VERT.lt ArcGIS (grid)     ───→  fetchS4() → KV:'s4'      ───→  S4Card.tsx
ENTSO-E grid (DC)          ───→  fetchS5() → KV:'s5'      ───→  S5Card.tsx
NVE biapi.nve.no (hydro)  ───→  fetchS6() → KV:'s6'      ───→  S6Card.tsx
energy-charts.info (TTF)   ───→  fetchTTF() → KV:'s7'     ───→  S7Card.tsx
ENTSO-E A11 (flows)        ───→  fetchS8() → KV:'s8'      ───→  S8Card.tsx
energy-charts.info (ETS)   ───→  fetchETS() → KV:'s9'     ───→  S9Card.tsx
Manual POST / Telegram     ───→  fleet POST → KV:'s2_fleet' ──→  S2Card fleet
BTD CSV upload             ───→  btd POST → KV:'s2_btd'   ───→  S2Card prices
Computed from KV           ───→  computeRevenue()          ───→  RevenueCard.tsx
```

---

## Page structure (top to bottom, current live)

| # | Section | ID | Components | Purpose |
|---|---------|----|-----------|---------| 
| 1 | Hero | — | KKME wordmark + subtitle | Landing, CTA |
| 2 | Market Now | — | StatusStrip (S/D, capture, aFRR, grid) | At-a-glance KPIs |
| 3 | Revenue Engine | revenue | RevenueCard.tsx (self-fetching) | Synthesis: reference asset economics |
| 4 | Investment Signals | signals | S1Card.tsx + S2Card.tsx (Tier 1) | Arbitrage + balancing market |
| 5 | Build Conditions | build | S3Card.tsx + S4Card.tsx (Tier 2) | Cost stack + grid access |
| 6 | Baltic Power Market | context | S5–S9 Cards (Tier 3, compact row) | Macro context signals |
| 7 | Market Intel | intel | IntelFeed.tsx | Telegram-sourced news |
| 8 | Deal Flow | deal-flow | About + form + footer | Teaser submission |

Revenue Engine is ABOVE signals. Conclusion before evidence.

---

## Signal inventory

| Signal | Card | Source | Refresh | Data class | Tier |
|--------|------|--------|---------|------------|------|
| S1 Baltic Price Separation | S1Card | ENTSO-E A44 | 4h | Observed | 1 |
| S2 Balancing Market + Fleet | S2Card | BTD + fleet manual + ENTSO-E | 4h + manual | Observed + Derived | 1 |
| S3 BESS Cost Stack | S3Card | ECB API + static refs | Daily | Observed + Reference | 2 |
| S4 Grid Connection Scarcity | S4Card | VERT.lt ArcGIS | 4h | Observed (partial) | 2 |
| S5 DC Power Viability | S5Card | ENTSO-E grid | 4h | Observed | 3 |
| S6 Nordic Hydro | S6Card | NVE biapi | Weekly | Observed | 3 |
| S7 TTF Gas | S7Card | energy-charts.info | 4h | Observed | 3 |
| S8 Interconnector Flows | S8Card | ENTSO-E A11 | 4h | Observed | 3 |
| S9 EU ETS Carbon | S9Card | energy-charts.info | 4h | Observed | 3 |

### Revenue Engine
- Source: computed from S2 fleet, S2 BTD, S1 KV data
- Endpoint: GET /revenue with params: mw, mwh, capex, grant, cod
- Card: RevenueCard.tsx — self-fetching, dual-fetch (2H + 4H), URL param persistence
- Features: 2H vs 4H comparison cards, revenue breakdown table, IRR sensitivity matrix (5B), "why it moved" delta, interpretation, stacking disclosure, details drawer

### S2 Fleet Tracker (within S2Card)
- S/D ratio hero + phase badge (SCARCITY / COMPRESS / MATURE)
- Trajectory bars with CPI annotation (Phase 6 enhancement)
- COD-window interpretation line bridging S2 → Revenue Engine
- Fleet list in drawer
- Supply arrival tracking

---

## Worker endpoints

### GET (signal data)
`/s1` `/s2` `/s3` `/s4` `/s5` `/s6` `/s7` `/s8` `/s9` `/health` `/read` `/revenue` `/api/model-inputs` `/s2/fleet`

### POST (data ingestion)
`/s2/fleet` `/s2/fleet/entry` `/s2/btd` `/s2/update` `/s4/pipeline` `/s5/manual` `/da_tomorrow/update` `/heartbeat`

All POST endpoints require X-Update-Secret header or Content-Type: application/json.

---

## Key model assumptions (Revenue Engine)

```
MW allocation (2.4H): FCR 8, aFRR 17, mFRR 25 (sum = 50 MW)
Capacity prices: from BTD live or proxy fallback (FCR ~35, aFRR ~17, mFRR ~24)
Activation: aFRR 18% rate × 0.55 depth × €40 margin, mFRR 10% × 0.75 × €55
Arbitrage: P_high/P_low from S1 live, RTE 0.87, reserve drag 0.60
OPEX: €1,950,000/yr Y1 (€39k/MW), 2.5% escalation
Financing: 55% debt, 4.5% rate, 8yr tenor, 1yr grace
Tax: 17% Lithuanian CIT
Augmentation: €3M at Y10
WACC: 8%
S/D thresholds: <0.6 SCARCITY, 0.6-1.0 COMPRESS, >1.0 MATURE
CPI: piecewise function from S/D ratio
```

Math audit (2026-03-11): all 12 reconstructed fields match perfectly. No computation bugs. Worker is internally consistent.

---

## Data quality snapshot (2026-03-11)

| Data point | Status | Class |
|-----------|--------|-------|
| DA prices (S1) | ✅ Live, ENTSO-E | Observed |
| Balancing prices (S2) | ⚠️ Live via BTD, sparse | Measured |
| Fleet S/D ratio | ⚠️ Derived from manual fleet entries | Derived |
| CPI trajectory | ⚠️ Modeled from S/D via piecewise function | Modeled |
| Euribor / HICP | ✅ Live, ECB | Observed |
| CAPEX references | ⚠️ Static (CH S1 2025 + Ignitis) | Reference |
| Grid capacity (S4) | ⚠️ Partial — permit counts failing | Observed (partial) |
| TTF / ETS | ✅ Live | Observed |
| Hydro / Flows | ✅ Live | Observed |
| Fleet entry quality | ⚠️ Mixed — needs outreach validation | Manual + Public |
| Intraday prices | ❌ Not built | Missing |
| Li carbonate | ❌ No free source | Missing |

---

## Design system (binding)

- Dark terminal aesthetic: #07070a background, warm off-white text
- Typography: Unbounded (heroes), DM Mono (data/labels), Cormorant Garamond (narrative)
- Three-tier cards: Tier 1 (--border-highlight), Tier 2 (--border-card), Tier 3 (dimmed)
- Colors: teal (positive/scarcity), amber (caution/compress), rose (negative/mature)
- Voice: terse, precise, numbers first, no adjectives, sources cited
- Animation: state changes only, no loops except LIVE pulse
- Min font: 0.6875rem (11px)

---

## Infrastructure

| Component | Location |
|-----------|----------|
| Worker | kkme-fetch-s1.kastis-kemezys.workers.dev |
| Pages | kkme.eu (auto-deploy from main) |
| KV | KKME_SIGNALS |
| Worker file | ~/kkme/workers/fetch-s1.js (~2600 lines) |
| Frontend | ~/kkme/app/ |
| Mac cron | ~/kkme-cron/ (fetch-btd.js, fetch-np-da.js, fetch-vert.js) |
| Secrets | ENTSOE_API_KEY, ANTHROPIC_API_KEY, UPDATE_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID |
| Deploy | `npx wrangler deploy` (worker) separate from `npm run build` (Pages) |

---

## Repo documentation

| File | Purpose |
|------|---------|
| CLAUDE.md | Single source of truth for Claude Code sessions |
| claude-handover/FREE_TOOL_PRODUCT_PRINCIPLES.md | Product principles, feature checklist |
| claude-handover/PACK_2_COMPETITION_AND_BUILDABILITY.md | Phase 6 spec |
| claude-handover/PACK_4_COST_AND_REFERENCE_ASSET.md | Revenue Engine spec |
| claude-handover/REVENUE_BENCHMARK_CALIBRATION_BACKLOG.md | External benchmark planning |
| docs/INTERACTION_ARCHITECTURE.md | Card interaction patterns |
