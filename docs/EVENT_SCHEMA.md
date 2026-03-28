# KKME Event Schema
# Every intel item is a typed event, not a news headline.

## Event object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event_id | string | yes | Unique ID (slug from title + date) |
| title | string | yes | Short headline (<80 chars) |
| consequence | string | yes | "Why it matters" — one sentence, Baltic BESS impact |
| event_type | enum | yes | See event types below |
| category | enum | yes | market_design / support_procurement / project_stage / grid_buildability / route_to_market / commodity_cost / interconnector / policy / competition / financeability |
| geography | enum | yes | LT / LV / EE / Baltic / EU / Nordic |
| published_at | ISO date | yes | When the event occurred |
| effective_date | ISO date | no | When the impact starts (if different from published) |
| source | string | yes | Source name |
| source_url | string | yes | Link to source |
| source_quality | enum | yes | tso_regulator / official_publication / quality_press / trade_press / pr_release / social |
| confidence | A-E | yes | Confidence in the event's factual accuracy |
| horizon | enum | yes | immediate / near_term / pre_cod / structural |
| impact_direction | enum | no | positive / negative / neutral / mixed |
| affected_modules | string[] | yes | Which site sections this touches: S1, S2, S4, S7, S9, Revenue, Fleet, Buildability, etc. |
| affected_cod_windows | string[] | no | Which COD years: 2027, 2028, 2029 |
| model_action | string | no | What should change in the model (free text) |
| status | enum | yes | candidate / published / pinned / suppressed / expired |
| feed_score | number | yes | Computed from scoring model |
| expires_at | ISO date | yes | Auto-expire date (default: published_at + 60 days) |

## Event types
- market_design — BBCM changes, PICASSO/MARI, cost allocation, MTU
- support_procurement — APVA rounds, contracted reserves, procurement results
- project_stage — FID, financing, EPC, construction, energisation, COD, delay
- grid_buildability — capacity map changes, connection rule changes, substation upgrades
- route_to_market — BSP prequalification, aggregator changes, optimiser deals
- commodity_cost — gas regime shifts, ETS moves, battery cell costs, financing rates
- interconnector — NordBalt/LitPol/EstLink outages, capacity changes
- policy — legislation, regulatory decisions, EU directives
- competition — new entrant announcements, fleet changes, market participation
- financeability — project finance deals, institutional investment, fund activity

## Scoring model
feed_score = (relevance x 0.25) + (recency x 0.20) + (importance x 0.20) +
             (novelty x 0.15) + (source_quality x 0.10) + (linkage_value x 0.10)

Where:
- relevance: 0-1, Baltic BESS relevance
- recency: 1.0 if <7 days, 0.7 if <30, 0.4 if <60, 0.1 if <90, 0 if >90
- importance: stage_change=0.9, market_rule=0.8, support=0.7, outage=0.6, generic=0.3
- novelty: 1.0 if first mention, 0.3 if restates known info
- source_quality: tso_regulator=1.0, official=0.8, quality_press=0.6, trade=0.5, pr=0.3
- linkage_value: 1.0 if updates a card/model, 0.5 if contextual, 0.0 if no connection

## Expiry rules
- Default: 60 days
- Pinned items: no expiry until manually unpinned
- project_stage items: 90 days
- market_design items: 180 days (structural, slower decay)
- commodity_cost items: 30 days (fast-moving)

## Publication gate
- feed_score >= 0.5 AND source_quality >= trade_press -> candidate for publication
- feed_score < 0.3 -> auto-suppress
- candidate items default to published unless manually suppressed
