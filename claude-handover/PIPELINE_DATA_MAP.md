# KKME — Pipeline-to-Website Data Map

## Purpose

This document maps the Hetzner VPS scraper/intelligence pipeline to specific
kkme.eu website sections. When rebuilding sections, Claude Code should know
what data is available (or will be available) from the pipeline, and design
data models and components to accept it.

The pipeline admin panel prompt is saved alongside this file for future
implementation. The scrapers are NOT yet connected to the website — this
document defines HOW they should connect.

---

## Pipeline Infrastructure

**VPS:** 89.167.124.42 (Hetzner Helsinki)
**Database:** PostgreSQL 16, database `kkme`, ~145 resolved projects
**Repo:** kastiskemezys-tech/kkme-control-center
**Daily cron:** 06:00 UTC — scrape → load → resolve → enrich → rank → sync

---

## Scraper → Website Section Mapping

### S2 Fleet Tracker (Baltic Market Pressure + S2 Balancing)

**Current state:** 8 manually seeded fleet entries
**Pipeline source:** litgrid_scraper.py (137 LT projects) + elering_scraper.py (35 EE projects)
**Loader:** litgrid_loader.py, elering_loader.py
**Intelligence:** entity_resolver.py (deduplicates, links SPVs to parent companies)

**What it provides:**
- Complete Baltic BESS fleet: operational, under construction, connection agreement, application, announced
- MW/MWh per project
- COD estimates
- Owner/parent group (via entity resolver)
- Country and TSO
- Status confidence weights
- Pipeline velocity (new applications per month)

**Website sections that consume this:**
1. **S2 — Baltic Balancing Market** → fleet summary (operational MW, committed MW, trend)
2. **Baltic Market Pressure** → battery competition scores per COD window
3. **Reference Asset Returns** → S/D ratio, CPI, trajectory
4. **Market Intelligence** → change_detector.py outputs become intel items ("New 50MW BESS in Litgrid queue")

**Integration point:** POST /s2/fleet (bulk update) or POST /s2/fleet/entry (single upsert)
**Bridge script needed:** kkme_sync.py — queries PostgreSQL, formats as fleet entries, POSTs to worker

**Data model the website expects:**
```json
{
  "id": "ignitis-kelme",
  "name": "Ignitis Kelmė",
  "mw": 100,
  "mwh": 200,
  "status": "under_construction",
  "confidence": "connection_agreement",
  "cod": "2027-H1",
  "country": "LT",
  "tso": "Litgrid",
  "source": "Litgrid queue + press release",
  "updated": "2026-03-05T10:00:00Z",
  "notes": "Rolls-Royce/Nidec. Part of 3-site 291MW.",
  "parent_group": "Ignitis Group"
}
```

---

### S4 Grid Access & Buildability

**Current state:** VERT.lt ArcGIS provides capacity bar (connected/reserved/free MW)
**Pipeline source:** vert_scraper.py (23 BESS permits), ast_scraper.py (137 LV grid nodes)
**Intelligence:** project_ranker.py provides queue pressure interpretation

**What it provides:**
- Development permits and generation permits with MW
- LV grid topology and node capacity
- Queue depth and velocity (new applications per month)
- Reservation churn signals
- Country-level divergence (LT vs LV vs EE buildability)

**Website sections that consume this:**
1. **Grid Access & Buildability** → queue pressure interpretation, reservation pressure, buildability outlook
2. **Baltic Market Pressure** → pipeline MW for competition scoring

**Integration:** Private dataset improves interpretation behind the scenes.
Public card shows only aggregated, public-safe outputs.

**Important:** Do NOT expose individual project names, permit holders, or commercial details.
Use only for: "Pipeline pressure rising", "Queue acceleration in LT", "Reservation churn may reopen limited access"

---

### Market Intelligence

**Current state:** ~10 manually submitted Telegram items
**Pipeline source:** change_detector.py + web_enricher.py

**What change_detector.py provides:**
- Stage changes: "Project X moved from application to connection agreement"
- New entries: "New 50MW BESS appeared in Litgrid queue"
- Removal/cancellation signals
- MW changes within existing projects

**What web_enricher.py provides:**
- PSE (Programmable Search Engine) based news enrichment
- Relevance scoring
- Source attribution

**Website section:** Market Intelligence board
- change_detector outputs → auto-generated intel items with category, impact, horizon
- web_enricher outputs → enriched article items

**Integration point:** POST to Telegram bot or direct POST to /feed endpoint
**Enrichment needed:** Each item needs category/impact/horizon/whyItMatters

---

### Baltic Market Pressure (COD windows)

**Current state:** Derived from 8 manual fleet entries
**Pipeline source:** Full fleet from litgrid + elering + vert scrapers

**What it provides for batteryCompetitionScore:**
- Operational MW (weight 1.0)
- Under construction MW (weight 0.9)
- Connection agreement MW (weight 0.6)
- Application MW (weight 0.3)
- Announced MW (weight 0.1)
- Per-COD-year breakdown

**What it provides for flexibilityDemandScore (partial):**
- Queue velocity as demand proxy
- Cross-reference with ENTSO-E generation/load data (separate)

**Integration:** kkme_sync.py computes weighted supply per year, POSTs to /s2/fleet

---

### Reference Asset Returns

**Current state:** computeRevenue() uses S/D ratio from fleet tracker
**Pipeline enrichment:** More accurate S/D ratio from 145 projects vs 8

**Impact:** When pipeline connects, S/D ratio becomes real market intelligence
instead of a curated estimate. This changes:
- Trajectory projections (2026-2034)
- CPI (Capacity Price Index) per year
- Competition pressure per COD window
- All downstream IRR/DSCR computations

---

### Structural Drivers — Interconnectors & Connected Markets

**Pipeline source:** ast_scraper.py provides LV grid topology
**Potential future:** Cross-border capacity data from AST (Latvia) and Elering (Estonia)

**Current integration:** S8 uses ENTSO-E A11 for flows.
Pipeline data could enrich with node-level capacity and cross-border constraints.

---

## NOT Connected to Pipeline (pure API sources)

These sections use direct API calls, not the Hetzner pipeline:

| Section | Source | Fetch location |
|---------|--------|---------------|
| S1 Baltic Price Separation | ENTSO-E A44 | Worker cron |
| S7 TTF Gas | energy-charts.info | Worker cron |
| S9 EU ETS Carbon | energy-charts.info | Worker cron |
| S6 Nordic Hydro | NVE biapi.nve.no | Worker cron |
| S3 Euribor/HICP | ECB API | Worker cron |
| S8 Interconnector Flows | ENTSO-E A11 | Worker cron |

Future structural drivers (Wind, Solar, Demand) will use ENTSO-E A75/A65,
also fetched directly by the worker — not through the pipeline.

---

## Integration Architecture

```
Hetzner VPS (scrapers + PostgreSQL)
  ↓ daily cron: scrape → load → resolve → detect changes
  ↓
  ↓ kkme_sync.py (bridge script, not yet built)
  ↓   - queries PostgreSQL for fleet entries
  ↓   - formats as JSON matching /s2/fleet schema
  ↓   - POSTs to Cloudflare Worker
  ↓
  ↓ change_detector.py → Telegram bot → Intel Feed
  ↓   OR direct POST to /feed with enriched items
  ↓
Cloudflare Worker (KV)
  ↓ stores in s2_fleet, s2_btd, feed_index
  ↓
kkme.eu (reads from Worker endpoints)
```

**Pipeline Admin Panel** (separate workstream):
- FastAPI server on VPS (port 8080, behind nginx)
- api.kkme.eu domain
- /pipeline page in Next.js app (password-protected)
- Allows manual trigger of scrapers and intelligence scripts
- See PIPELINE_ADMIN_PROMPT.md for full spec

---

## Build Priority for Pipeline Connection

1. **kkme_sync.py** — bridge script that POSTs fleet data to /s2/fleet
   This alone transforms S2, Baltic Market Pressure, and Reference Asset Returns.

2. **change_detector → Intel Feed** — auto-generated intelligence items
   This populates Market Intelligence with real Baltic developments.

3. **Pipeline Admin Panel** — browser-based scraper control
   Quality of life, not blocking any website section.

4. **Grid enrichment** — VERT permits + AST nodes into S4 interpretation
   Improves buildability intelligence.

---

## Design Implications for Website Rebuild

When building new sections, the data model must accommodate:

1. **Fleet entries growing from 8 to 145+**
   - S2 fleet list needs pagination or smart grouping
   - Summary stats (operational/committed/pipeline) must scale
   - Owner group clustering should be supported in the UI

2. **Queue velocity as a new signal**
   - "Litgrid queue grew 200 MW this month" is a leading indicator
   - Could become a sub-metric in S2 or Grid Access

3. **Change detection as intel source**
   - Items arrive automatically, not manually
   - Need enrichment layer (category/impact/horizon/whyItMatters)
   - LLM enrichment possible via ANTHROPIC_API_KEY in worker

4. **Country-level divergence**
   - LT vs LV vs EE have different pipeline pressures
   - Competition scoring should show country breakdown
   - Grid Access should support per-country interpretation

5. **SPV → parent group mapping**
   - Ignitis = 3 SPVs = 291 MW total
   - Fleet list should show parent groups, not just project names
   - This data comes from entity_resolver.py
