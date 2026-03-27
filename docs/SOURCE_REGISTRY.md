# KKME Source Registry
# Every data source. What it proves and what it does not.

| Source | Endpoint | Owner | Jurisdiction | What it proves | What it does NOT prove | Cadence | Coverage calc | Failure mode |
|--------|----------|-------|-------------|----------------|----------------------|---------|--------------|-------------|
| ENTSO-E Transparency | web-api.transparency.entsoe.eu | ENTSO-E | EU | DA prices, cross-border flows, installed capacity | Balancing clearing prices, activation data | 4h | hours present / hours expected | API timeout → stale KV |
| BTD | Baltic Transparency Dashboard | Baltic TSOs | LT/LV/EE | Procurement volumes, some clearing data | Full auction results, all products | daily (Mac cron) | auction days present / calendar days | BTD login required, IP-sensitive |
| NVE | biapi.nve.no | NVE | NO | Nordic hydro reservoir levels | Baltic-specific hydro impact | weekly | weeks present / weeks expected | Public, rarely fails |
| energy-charts.info | energy-charts.info JSON API | Fraunhofer ISE | DE/EU | TTF gas, EU ETS carbon | Baltic-specific gas/carbon impact | 4h | data points / expected | API structure changes |
| ECB SDW | sdw-wsrest.ecb.europa.eu | ECB | EU | Euribor, HICP | Baltic-specific financing terms | daily | data points / expected | API structure changes |
| VERT.lt ArcGIS | Litgrid FeatureServer/8 | VERT/Litgrid | LT | Grid capacity, permits (LT only) | LV/EE grid data, connection costs | 4h | features returned / expected | ArcGIS schema changes |
| Clean Horizon S1 2025 | static report | Clean Horizon | EU | European BESS revenue benchmarks | Baltic-specific clearing data | semi-annual | N/A (reference) | Report purchase required |
| TSO contacts (manual) | phone/email/PDF | Litgrid/AST/Elering | LT/LV/EE | Connection queues, fleet data | Real-time changes | manual | N/A | Contact availability |
| Nord Pool | nordpoolgroup.com | Nord Pool | Nordic-Baltic | DA/intraday prices, volumes | Balancing market outcomes | 4h | hours present / hours expected | API access changes |
| Litgrid connection queue | litgrid.eu | Litgrid | LT | Queue position, capacity, substation | COD timing, construction progress | manual | N/A | Website structure changes |
| Elering e-Gridmap | elering.ee | Elering | EE | Connection capacity map (indicative) | Firm connection rights | manual | N/A | Indicative only |
| AST procurement | ast.lv | AST | LV | BESS procurement contracts, substations | Merchant project data | event-driven | N/A | Language barriers (Latvian) |

## Trust limits
- BTD clearing data is NOT full auction results. It is procurement volumes and some price data.
- VERT.lt shows LT permits only. No LV or EE grid data.
- Clean Horizon is a benchmark, not observed Baltic clearing.
- TSO queue data has lag. Status changes between calls are missed.
- Litgrid connection queue shows queue position but not construction progress.
- Elering e-Gridmap is indicative capacity, not firm connection offers.
- AST BESS procurement is a TSO-owned asset under derogation, not merchant.

## Coverage dimensions
For each source, coverage is measured across three axes:
- **Time**: proportion of expected time periods with data
- **Field**: proportion of expected data fields present and non-null
- **Product**: proportion of Baltic reserve products covered (FCR/aFRR/mFRR × up/down)

## Source hierarchy (for contradiction resolution)
1. TSO official documents (highest trust)
2. Regulator filings (VERT, SPRK, ECAG)
3. ENTSO-E Transparency Platform
4. Developer press releases with named assets
5. Industry media (Energy-Storage.news, Renewables Now)
6. Generic press / conference mentions (lowest trust)
