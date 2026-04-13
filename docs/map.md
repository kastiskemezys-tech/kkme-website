# KKME Project Map

Concept → file lookup. Not narrative. Just "if you want X, go here."
Last updated: 2026-04-13.

## Hero / Map

| Concept | Files |
|---------|-------|
| Hero Baltic map component | `app/components/HeroBalticMap.tsx` (787 lines) |
| Interconnector arrows + flow direction | `HeroBalticMap.tsx` (interconnector list), `lib/baltic-places.ts` (resolveFlow, positiveFlowReceives) |
| Cable particle animation | `HeroBalticMap.tsx` (GSAP animation setup) |
| Country gen/load labels | `HeroBalticMap.tsx` (country label rendering), `/genload` endpoint, formatPower helper in same file |
| Project dots + tooltips | `HeroBalticMap.tsx`, `lib/project-overrides.ts`, `public/hero/project-geocodes.json` |
| Map projection + calibration | `lib/map-projection.ts`, `public/hero/map-calibration.json`, `public/hero/map-calibration-cities.json` |
| Cable waypoints | `public/hero/map-cable-waypoints.json` |
| Label collision resolution | `lib/label-layout.ts` |
| Raster background images | `public/hero/kkme-interconnect-dark.png`, `public/hero/kkme-interconnect-light.png` |
| City labels + anchor positions | `lib/baltic-places.ts` (CITIES array, CABLE_DEFS) |
| Theme toggle | `app/components/ThemeToggle.tsx`, CSS variables in `app/globals.css` |
| Hero tagline + ticker | `HeroBalticMap.tsx` (bottom ticker section) |

## Signal Cards

| Concept | Files |
|---------|-------|
| S1 Baltic Price Separation | `app/components/S1Card.tsx` (887 lines), `/s1` endpoint, `/s1/capture` |
| S1 utility functions | `app/components/s1-utils.ts` |
| S2 Baltic Balancing Market | `app/components/S2Card.tsx` (1449 lines), `/s2` endpoint, `/s2/activation`, `/s2/fleet` |
| S3 Project Cost Trend | `app/components/S3Card.tsx` (604 lines), `/s3` endpoint, `S3CardReference.jsx` (root, orphaned ref) |
| S3 utility functions | `app/components/s3-utils.ts` |
| S4 Grid Access & Buildability | `app/components/S4Card.tsx` (793 lines), `/s4` endpoint, `/s4/fleet`, `/s4/pipeline` |
| S5 DC Power Viability | `app/components/S5Card.tsx` (258 lines), `/s5` endpoint (demoted) |
| S6 Nordic Hydro | `app/components/S6Card.tsx` (219 lines), `/s6` endpoint (demoted, not rendered) |
| S7 TTF Gas | `app/components/S7Card.tsx` (187 lines), `/s7` endpoint |
| S8 Interconnectors | `app/components/S8Card.tsx` (161 lines), `/s8` endpoint |
| S9 EU ETS Carbon | `app/components/S9Card.tsx` (197 lines), `/s9` endpoint |
| Wind structural card | `app/components/WindCard.tsx` (139 lines), `/genload` endpoint (s_wind in KV) |
| Solar structural card | `app/components/SolarCard.tsx` (142 lines), `/genload` endpoint (s_solar in KV) |
| Load structural card | `app/components/LoadCard.tsx` (141 lines), `/genload` endpoint (s_load in KV) |

## Revenue Engine

| Concept | Files |
|---------|-------|
| Revenue card (frontend) | `app/components/RevenueCard.tsx` (762 lines), self-fetching from `/revenue` |
| Revenue model (frontend helpers) | `app/lib/revenueModel.ts` |
| Revenue computation (worker) | `workers/fetch-s1.js` — grep for `computeRevenueV7` |
| Elasticity model | `workers/fetch-s1.js` — grep for `reservePrice`, `marketDepthFactor`, `activationCompression` |
| S/D ratio logic | `app/lib/sdRatio.ts` |
| Benchmarks | `app/lib/benchmarks.ts` |

## Trading / Dispatch

| Concept | Files |
|---------|-------|
| Trading engine card | `app/components/TradingEngineCard.tsx` (504 lines) |
| Trading endpoints | `/api/trading`, `/api/trading/latest`, `/api/trading/history`, `/api/trading/signals`, `/api/trading/export` |
| Dispatch endpoint | `/api/dispatch` |

## Layout + Navigation

| Concept | Files |
|---------|-------|
| Page layout + section order | `app/page.tsx` (318 lines) |
| Root layout + fonts + metadata | `app/layout.tsx` (104 lines) |
| Sticky nav | `app/components/StickyNav.tsx` |
| Signal bar | `app/components/SignalBar.tsx` |
| Contact form | `app/components/ContactForm.tsx` (288 lines), `/contact` POST endpoint, Resend API |
| Model risk register (inline) | `app/page.tsx` lines 144–207 |
| Confidence panel | `app/components/ConfidencePanel.tsx` |
| Intel feed | `app/components/IntelFeed.tsx` (785 lines), `/feed`, `/curations` endpoints |
| Smooth scroll | `app/providers.tsx` (Lenis) |

## Shared UI Primitives

All in `app/components/primitives/`, imported via `@/app/components/primitives`:

SectionHeader, MetricTile, StatusChip, ImpactLine, FreshnessBadge, ConfidenceBadge, DetailsDrawer, SourceFooter, DataClassBadge.

Types: `app/lib/types.ts` (DataClass, Sentiment, ImpactState, etc.)

## Styling + Design System

| Concept | Files |
|---------|-------|
| Design tokens (CSS variables) | `app/globals.css` (:root and [data-theme="light"]) |
| Signal color mapping | `lib/signalColor.ts` |
| Chart colors + theme | `app/lib/chartTheme.ts` (useChartColors hook) |
| Publication gates | `app/lib/publicationGates.ts` |
| Animations | `lib/animations.ts` |
| Safe number parsing | `lib/safeNum.ts` (also duplicated at `app/lib/safeNum.ts`) |
| Data fetching hook | `app/lib/useSignal.ts` (also duplicated at `lib/useSignal.ts`) |
| Refresh cadence | `lib/refresh-cadence.ts` |
| Environment config | `lib/env.ts` |

## Worker

| Concept | Files |
|---------|-------|
| Main worker file | `workers/fetch-s1.js` (7740 lines) — NEVER cat whole file, use grep |
| Worker helper: defaults | `workers/lib/defaults.js` |
| Worker helper: KV operations | `workers/lib/kv.js` |
| Worker helper: notifications | `workers/lib/notify.js` |
| Wrangler config | `wrangler.toml` |
| Cron triggers | `wrangler.toml` [triggers] section |
| Deploy validation | `scripts/validate-deploy.sh` |

To find a specific endpoint: `grep -n "pathname === '/endpoint'" workers/fetch-s1.js`
To find a function: `grep -n "^function functionName\|function functionName" workers/fetch-s1.js`

## Infrastructure

| Concept | Files / Location |
|---------|-----------------|
| VPS ingestion | 89.167.124.42:/opt/kkme/app/data/ingest_daily.py |
| VPS hourly genload | `scripts/hourly_grid.py` (deployed to VPS) |
| Mac cron | ~/kkme-cron/fetch-btd.js, fetch-vert.js |
| GitHub Action | `.github/workflows/fetch-btd.yml` (disabled) |
| Cloudflare headers | `public/_headers` |
| Cloudflare redirects | `public/_redirects` |
| Static activation data | `data/s2_activation.json` |

## Documentation

| Concept | Location |
|---------|----------|
| This handover doc | `docs/handover.md` |
| Project map (this file) | `docs/map.md` |
| Governance / principles | `docs/principles/` (13 files) |
| Investigation reports | `docs/investigations/` (date-prefixed) |
| Rebuild architecture specs | `docs/archive/rebuild-specs/` (historical) |
| Phase prompts | `docs/phases/` |
| Playbooks | `docs/playbooks/` |
| The Thesis | `KKME.md` (root) |
| Claude session rules | `CLAUDE.md` (root, points here) |
| Glossary | `docs/glossary.md` |
| ADR log | `docs/principles/decisions.md` |

## Dev-only pages

| Page | Purpose |
|------|---------|
| `/dev/map-calibrate` | Map calibration tool |
| `/dev/hero-preview` | Hero preview (pre-integration) |
