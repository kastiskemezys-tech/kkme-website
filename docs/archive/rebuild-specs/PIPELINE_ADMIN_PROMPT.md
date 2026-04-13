# Claude Code Prompt: kkme.eu Pipeline Admin Panel

## Context

We have a live Baltic BESS intelligence system running on a Hetzner VPS (89.167.124.42).
The pipeline scrapes 6 TSO/regulator sources, enriches data, ranks deals, and syncs to
Google Sheets. The kkme.eu website (Next.js, Cloudflare Pages) already has a Signal Console
with 9 market signals (S1-S9).

We want to add a **Pipeline Admin Panel** to kkme.eu that:
1. Shows live pipeline data from the server API
2. Lets us trigger scrapers and tools manually from the browser
3. Displays results without needing SSH

---

## What Already Exists on kkme.eu

The kkme.eu Next.js app already has:
- Signal Console (S1-S9 market signals)
- Cloudflare Worker at `kkme-fetch-s1.kastis-kemezys.workers.dev`
- KV storage for signal data
- `/api/model-inputs` endpoint returning machine-readable market data
- `/revenue` endpoint
- `/health` endpoint

The new pipeline API needs to be added to the **same Cloudflare Worker** or as a new
worker — whichever is cleaner. The worker already has ANTHROPIC_API_KEY and other secrets.

---

## Server API to Expose

The VPS at 89.167.124.42 has these Python scripts that need to be callable remotely:

### Scrapers (`/opt/kkme/app/python/scrapers/`)
| Script | What it does | Est. runtime |
|--------|-------------|-------------|
| litgrid_scraper.py | Fetches LT grid queue (137 BESS projects) | ~30s |
| elering_scraper.py | Fetches EE grid queue (35 BESS projects) | ~30s |
| vert_scraper.py | Fetches LT VERT permits (23 BESS permits) | ~20s |
| ast_scraper.py | Fetches LV grid topology (137 nodes) | ~20s |
| tpdris_scraper.py | Fetches LT planning docs (82 docs) | ~45s |
| elektrilevi_scraper.py | Fetches EE DSO segments | ~60s |
| latvia_scraper.py | NEW — SPRK + BIS + VVD (not yet built) | ~60s |

### Loaders (`/opt/kkme/app/python/loaders/`)
| Script | What it does |
|--------|-------------|
| litgrid_loader.py | Loads litgrid scraper output into DB |
| elering_loader.py | Loads elering output into DB |
| vert_loader.py | Loads vert output into DB |
| ast_loader.py | Loads ast output into DB |
| tpdris_loader.py | Loads tpdris output into DB |
| elektrilevi_loader.py | Loads elektrilevi output into DB |

### Intelligence (`/opt/kkme/app/python/intelligence/`)
| Script | What it does |
|--------|-------------|
| entity_resolver.py | Links projects to companies |
| company_enricher.py | Enriches companies with contact data |
| change_detector.py | Detects stage changes |
| project_ranker.py | Scores projects by commercial urgency |
| offer_matcher.py | Matches KKME products to projects |
| web_enricher.py | PSE-based news enrichment |

### Output (`/opt/kkme/app/python/output/`)
| Script | What it does |
|--------|-------------|
| sheets_sync.py | Syncs pipeline to Google Sheets |

### Full pipeline cron command (runs daily at 06:00 UTC)
```bash
cd /opt/kkme/app && set -a && source /opt/kkme/config/.env && set +a && \
/opt/kkme/venv/bin/python python/scrapers/litgrid_scraper.py && \
/opt/kkme/venv/bin/python python/loaders/litgrid_loader.py && \
/opt/kkme/venv/bin/python python/scrapers/elering_scraper.py && \
/opt/kkme/venv/bin/python python/loaders/elering_loader.py && \
/opt/kkme/venv/bin/python python/scrapers/vert_scraper.py && \
/opt/kkme/venv/bin/python python/loaders/vert_loader.py && \
/opt/kkme/venv/bin/python python/intelligence/entity_resolver.py && \
/opt/kkme/venv/bin/python python/intelligence/company_enricher.py && \
/opt/kkme/venv/bin/python python/intelligence/change_detector.py && \
/opt/kkme/venv/bin/python python/intelligence/project_ranker.py && \
/opt/kkme/venv/bin/python python/intelligence/offer_matcher.py && \
/opt/kkme/venv/bin/python python/intelligence/web_enricher.py --daily && \
/opt/kkme/venv/bin/python python/output/sheets_sync.py
```

---

## What to Build

### Step 1: VPS API Server (`/opt/kkme/app/api_server.py`)

A lightweight FastAPI server running on the VPS that:
- Listens on port 8080 (localhost only, behind nginx)
- Requires `Authorization: Bearer {VPS_API_SECRET}` on all requests
- Exposes endpoints to run scripts and return output

Endpoints:
- GET  /status — DB row counts, last cron run, script status
- GET  /pipeline — all project_entity rows with rank, offers, contacts
- POST /run/scraper/{name} — runs scraper + loader, returns records found/new/duration
- POST /run/intelligence/{name} — runs intelligence script, returns records processed/duration
- POST /run/pipeline/full — runs full cron pipeline
- POST /run/sheets_sync — triggers sheets_sync.py
- GET  /logs/{script_name} — last 100 lines from script log

### Step 2: Nginx Proxy

Proxy `api.kkme.eu` → `localhost:8080` with SSL via certbot.

### Step 3: Cloudflare Worker Routes

Add /api/pipeline/* proxy routes to existing worker, authenticating with VPS_API_SECRET.

### Step 4: Next.js Admin Page (`/app/pipeline/page.tsx`)

Password-protected admin page with:
- Status bar (last cron, DB counts, health)
- Scraper controls grid (per-country buttons)
- Intelligence controls grid
- Full pipeline trigger button
- Pipeline table (145 projects, filterable)

---

## Build Priority

This is a SEPARATE workstream from the website rebuild.
Build it after the main site sections are stable.
The bridge script (kkme_sync.py) is the highest-value connection point.

---

## Secrets Needed

Cloudflare Worker: VPS_API_SECRET, VPS_HOST
VPS .env: VPS_API_SECRET, API_PORT=8080
Next.js env: PIPELINE_PASSWORD, PIPELINE_API_URL
