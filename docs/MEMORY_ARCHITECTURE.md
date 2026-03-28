# KKME Memory-to-Model Feedback Architecture
# How accumulated intelligence improves every module over time.

---

## Core principle

Memory is not a separate feature. It is the **calibration engine** for the
entire model. Every module currently relies on assumptions that could be
replaced with empirical evidence — if that evidence is systematically
accumulated, structured, and fed back.

The goal: over 6-12 months of operation, KKME should transition from
"assumption-heavy with proxies" to "evidence-calibrated with residual assumptions."

---

## Module-by-module feedback design

### 1. Grid Access & Buildability (S4) — connection timeline calibration

**Current state:** S4 shows grid free MW from VERT.lt. Connection timeline
is stated as "18-36 months" as a static assumption.

**What memory accumulates:**
- Every project's evidence timeline: grid application date → agreement date →
  construction start → energisation
- Substation-level capacity changes over time (VERT.lt snapshots)
- Queue velocity: applications per month, agreements per month
- Rejection/withdrawal patterns
- Substation-level congestion: which nodes fill up, which stay open

**How it feeds back into the model:**

```
CONNECTION_TIMELINE_EMPIRICAL = {
  LT: {
    application_to_agreement: { p50: 8, p90: 14, unit: 'months', n: 23 },
    agreement_to_construction: { p50: 6, p90: 12, unit: 'months', n: 15 },
    construction_to_energisation: { p50: 10, p90: 18, unit: 'months', n: 8 },
    total_p50: 24, total_p90: 44,
    confidence: 'C',  // improves as n grows
    last_calibrated: '2026-09-01',
  },
  EE: { ... },
  LV: { ... },
}
```

**Confidence layer created:**
- COD probability gets calibrated by OBSERVED completion rates per country
- "18-36 months" becomes "LT p50=24m, p90=44m based on N=23 observed projects"
- Substation-specific buildability: "Šventininkų TP: 2 BESS connected, 3 in queue,
  free capacity declining at X MW/quarter"

**Implementation in Postgres:**
```sql
CREATE TABLE connection_timeline_observations (
  project_id TEXT,
  country TEXT,
  event_type TEXT,  -- 'application', 'agreement', 'construction_start', 'energisation'
  event_date DATE,
  source TEXT,
  source_quality TEXT,
  PRIMARY KEY (project_id, event_type)
);
-- Query: SELECT avg(days between events) GROUP BY country, event_type
```

---

### 2. Installed BESS Cost (S3) — Baltic cost curve calibration

**Current state:** S3 shows static references (Cube €98 DDP, CH €164 equipment,
Ignitis €224/kWh all-in). No empirical Baltic cost curve.

**What memory accumulates:**
- Every disclosed deal cost: $/€ per kWh, per MW, total project cost
- EPC contract values when disclosed
- Equipment supplier + pricing tier
- Country-specific cost premiums (grid connection costs vary by substation)
- APVA grant levels and implied co-investment
- Financing terms on closed deals (spread over Euribor, tenor, leverage)

**How it feeds back into the model:**

```
BALTIC_COST_CURVE = {
  data_points: [
    { project: 'Ignitis 3-site', mwh: 582, eur_kwh: 224, year: 2025, type: 'all_in', confidence: 'B' },
    { project: 'AST BESS', mwh: 160, eur_kwh: 481, year: 2024, type: 'all_in', confidence: 'B' },
    { project: 'BSP Hertz 1+2', mwh: 400, eur_kwh: null, year: 2025, type: 'unknown', confidence: 'D' },
    { project: 'Evecon Kirikmäe', mwh: 250, eur_kwh: null, year: 2026, type: 'unknown', confidence: 'D' },
  ],
  regression: {
    eur_kwh = α + β₁·ln(MWh) + β₂·year + β₃·country_dummy,
    // Scale economies + learning rate + country premium
    r_squared: null,  // needs >10 data points
    min_points_for_regression: 10,
  },
  current_estimate: {
    equipment_only: { low: 90, mid: 130, high: 164, unit: '€/kWh' },
    turnkey: { low: 180, mid: 224, high: 280, unit: '€/kWh' },
    confidence: 'D',  // improves as deals accumulate
  },
}
```

**Confidence layer created:**
- CAPEX assumption in Revenue Engine gets empirical error bars
- "€224/kWh" becomes "€180-280/kWh based on N=4 Baltic deals, declining ~8%/yr"
- Grid connection cost separated from equipment cost (using VERT.lt data)

**Implementation in Postgres:**
```sql
CREATE TABLE cost_observations (
  project_id TEXT,
  cost_type TEXT,  -- 'equipment', 'epc', 'grid_connection', 'turnkey', 'total'
  value_eur REAL,
  value_per_kwh REAL,
  value_per_mw REAL,
  mwh REAL,
  year INTEGER,
  country TEXT,
  source TEXT,
  source_quality TEXT,  -- 'contract', 'press', 'estimate'
  confidence TEXT,
  PRIMARY KEY (project_id, cost_type)
);
```

---

### 3. Market Drivers — regime transition calibration

**Current state:** Regime engine uses threshold logic (S/D < 0.7 = SCARCITY).
No empirical calibration of how regimes correlate with actual revenue outcomes.

**What memory accumulates:**
- Daily regime state + actual dispatch revenue (from trading engine)
- Price outcomes by regime: what does RESERVE_SCARCITY actually yield?
- Regime transition frequency: how often does the market flip?
- Seasonal patterns: which regimes dominate in which months?
- Event-regime correlations: do interconnector outages reliably trigger
  INTERCONNECTOR_STRESS? How long does it last?

**How it feeds back into the model:**

```
REGIME_REVENUE_MAP = {
  RESERVE_SCARCITY: {
    avg_daily_revenue_per_mw: 850,
    p10: 400, p90: 1400,
    frequency_pct: 15,  // % of days in this regime
    typical_duration_days: 3,
    n_observations: 45,
    confidence: 'C',
  },
  RESERVE_COMPRESSING: {
    avg_daily_revenue_per_mw: 550,
    p10: 300, p90: 900,
    frequency_pct: 60,
    typical_duration_days: 12,
    n_observations: 180,
    confidence: 'B',
  },
  // ...
}
```

**Confidence layer created:**
- Revenue Engine stops using a single annual average
- Instead: "expected revenue = Σ(regime_probability × regime_revenue)"
- Regime forecast becomes empirically calibrated, not just threshold-based
- Seasonal adjustment: "Q1 is 70% COMPRESSING, Q3 is 30% SCARCITY"

**Implementation in Postgres:**
```sql
CREATE TABLE regime_observations (
  date DATE,
  regime_id TEXT,
  dispatch_revenue_eur REAL,
  da_spread REAL,
  ttf_eur_mwh REAL,
  wind_mw REAL,
  solar_mw REAL,
  nordbalt_flow_mw REAL,
  sd_ratio REAL,
  source TEXT,  -- 'trading_engine' or 'manual'
  PRIMARY KEY (date, regime_id)
);
-- After 90+ days: regression of revenue on regime + covariates
```

---

### 4. Reference Asset Returns — dispatch backtest loop

**Current state:** Revenue Engine computes theoretical returns from proxy prices.
No comparison to actual observed outcomes. No error tracking.

**What memory accumulates:**
- Daily trading engine dispatch results (already computed)
- Comparison: predicted revenue vs realized (when BTD clearing data arrives)
- Error decomposition: which module over/under-predicted?
- Stacking efficiency: what % of theoretical max was captured?
- E energija observed performance (if any public data emerges)

**How it feeds back into the model:**

```
BACKTEST_TRAIL = {
  period: '2026-03-01 to 2026-06-30',
  trading_engine: {
    predicted_avg_daily: 602,
    observed_avg_daily: null,  // waiting for BTD clearing data
    error: null,
    error_source: null,
  },
  revenue_engine: {
    predicted_y1_net_per_mw: 154000,
    components: {
      capacity: { predicted: 64000, observed: null },
      activation: { predicted: 15000, observed: null },
      arbitrage: { predicted: 97000, observed_capture: null },
    },
  },
  stacking_efficiency: {
    assumed_capacity_factor: 0.80,
    implied_from_dispatch: 0.72,  // computed from trading engine daily results
    gap: -0.08,
    gap_source: 'SoC constraints during high activation periods',
  },
  confidence_adjustment: {
    // After backtest, adjust confidence grades
    capacity_revenue: 'D→C' if observed data arrives,
    activation_revenue: 'D→D' until Baltic activation data,
    arbitrage_revenue: 'B→B' (DA prices well observed),
  },
}
```

**Confidence layer created:**
- Revenue Engine confidence upgrades automatically as backtest accumulates
- Stacking efficiency assumption (0.80) gets replaced by empirically observed value
- Model risk MR-03 (fixed stacking factor) gets partially resolved
- Predicted vs realized tracking builds credibility for investor presentations

**Implementation in Postgres:**
```sql
CREATE TABLE backtest_snapshots (
  snapshot_date DATE,
  model_version TEXT,
  metric_name TEXT,
  predicted_value REAL,
  observed_value REAL,  -- NULL until observation arrives
  error REAL,
  error_pct REAL,
  confidence_at_prediction TEXT,
  confidence_after_observation TEXT,
  note TEXT,
  PRIMARY KEY (snapshot_date, model_version, metric_name)
);
```

---

### 5. COD Confidence — hazard model calibration (THE BIG ONE)

**Current state:** Static weights (operational=1.0, construction=0.9, etc.).
No empirical stage transition rates. No slippage tracking.

**What memory accumulates:**
- Every project's stage history with dates
- Time between stages (application → agreement: how many days?)
- Slippage events (COD pushed back — how often, by how much?)
- Abandonment events (project removed from queue or went silent)
- Developer-specific completion rates
- Country-specific completion rates
- Size-class effects (do larger projects slip more?)
- Support-scheme effects (do APVA projects complete faster?)

**How it feeds back into the model:**

```
COD_HAZARD_CALIBRATION = {
  stage_transitions: {
    announced_to_application: {
      median_days: 120, p90_days: 300,
      conversion_rate: 0.35,  // only 35% make it
      n_observed: 45,
      confidence: 'C',
    },
    application_to_agreement: {
      median_days: 240, p90_days: 480,
      conversion_rate: 0.55,
      n_observed: 28,
      confidence: 'C',
    },
    agreement_to_construction: {
      median_days: 180, p90_days: 360,
      conversion_rate: 0.75,
      n_observed: 12,
      confidence: 'D',
    },
    construction_to_operational: {
      median_days: 300, p90_days: 540,
      conversion_rate: 0.92,
      n_observed: 6,
      confidence: 'D',
    },
  },
  slippage_model: {
    avg_slippage_months: 8,
    slippage_by_country: { LT: 6, EE: 10, LV: 12 },
    slippage_by_size: { '<50MW': 4, '50-200MW': 8, '>200MW': 14 },
    n_observed_slippages: 18,
  },
  abandonment_signals: {
    // Projects that went silent for >12 months
    silent_projects: 23,
    confirmed_abandoned: 5,
    abandonment_rate_after_silence: 0.22,
  },
  developer_track_record: {
    'Ignitis': { projects: 3, completed: 0, on_track: 3, reliability: 'B' },
    'Evecon': { projects: 4, completed: 2, on_track: 2, reliability: 'A' },
    'E energija': { projects: 1, completed: 1, on_track: 0, reliability: 'A' },
    // ... accumulated over time
  },
}
```

**Confidence layer created:**
- P(COD ≤ 2027) for each project becomes empirically calibrated
- "Ignitis Kelmė: P(COD by 2027-H1) = 0.72 based on stage=construction,
  developer=Ignitis (3/3 on track), country=LT (median construction 10m)"
- Fleet trajectory forward supply uses empirical conversion rates, not static weights
- NetSSR forecast uncertainty shrinks as more transitions are observed

**Implementation in Postgres:**
```sql
CREATE TABLE project_stage_history (
  project_id TEXT,
  stage TEXT,
  stage_date DATE,
  source TEXT,
  source_quality TEXT,
  cod_estimate_at_stage DATE,  -- what was the COD estimate when this stage was recorded?
  PRIMARY KEY (project_id, stage, stage_date)
);

CREATE TABLE developer_track_record (
  developer_name TEXT PRIMARY KEY,
  total_projects INTEGER,
  completed_projects INTEGER,
  on_track_projects INTEGER,
  avg_slippage_months REAL,
  reliability_grade TEXT,
  last_updated DATE
);

-- The hazard model query:
-- For each pair of consecutive stages, compute:
-- SELECT stage_from, stage_to,
--   avg(days_between) as median_days,
--   percentile_cont(0.9) WITHIN GROUP (ORDER BY days_between) as p90_days,
--   count(*) FILTER (WHERE next_stage IS NOT NULL) / count(*) as conversion_rate
-- FROM stage_transitions GROUP BY stage_from, stage_to
```

---

### 6. Intelligence Math — confidence propagation

**The meta-layer:** Memory doesn't just calibrate individual modules.
It creates a **confidence propagation network** where module confidence
affects downstream module confidence.

```
CONFIDENCE_PROPAGATION = {
  // Upstream → downstream
  'cost_observations' → 'revenue_engine.capex_confidence',
  'regime_observations' → 'revenue_engine.revenue_confidence',
  'stage_transitions' → 'fleet.forward_supply_confidence',
  'fleet.forward_supply_confidence' → 'net_ssr.confidence',
  'net_ssr.confidence' → 'capacity_price_confidence',
  'capacity_price_confidence' → 'revenue_engine.capacity_revenue_confidence',
  'backtest_trail' → 'revenue_engine.overall_confidence',
  'connection_timeline_observations' → 'cod_probability.confidence',
  'cod_probability.confidence' → 'fleet.forward_supply_confidence',
}
```

**Rule:** A downstream module's confidence can NEVER be higher than its
weakest upstream input's confidence.

If capacity price confidence is D (proxy), then revenue engine confidence
is at most D, regardless of how well-observed arbitrage is.

This prevents "false precision" structurally, not just through labeling.

---

## The daily feedback loop

```
1. Overnight cron runs scrapers
2. change_detector identifies new evidence
3. Entity resolver links evidence to projects
4. Stage history updated → COD probabilities recalculated
5. Cost observations updated if new deal data found
6. Connection timeline observations updated
7. Regime observation logged (today's regime + dispatch revenue)
8. Backtest comparison computed (predicted vs any new observed data)
9. Confidence grades automatically adjusted:
   - More observations → higher confidence
   - Backtest errors → lower confidence
   - Stale evidence → decaying confidence
10. Forward supply recomputed with new probabilities
11. NetSSR recomputed
12. Revenue ranges recomputed
13. Publication gates re-evaluated
14. Feed events generated for material changes
15. Morning review report produced
```

---

## Minimum viable tables for feedback loops

### Already exists:
- project_entity (145 projects)
- project_news (scraped articles)

### Need to add:
- project_stage_history (track stage transitions over time)
- cost_observations (deal costs as they're disclosed)
- connection_timeline_observations (grid process durations)
- regime_observations (daily regime + revenue)
- backtest_snapshots (predicted vs observed)
- developer_track_record (developer reliability)
- confidence_log (confidence grade changes over time)

### Total: 7 new tables in the existing Postgres instance.

---

## What this means for each public metric's confidence grade

After 6 months of operation:

| Metric | Today (D) | After 6mo (target) | What drives improvement |
|--------|-----------|--------------------|-----------------------|
| aFRR price | D (proxy) | C (if BTD clearing arrives) | BTD data coverage |
| COD probability | D (static weights) | C (if >30 transitions observed) | stage_history accumulation |
| S/D ratio | C (derived) | B (if hazard model calibrated) | forward supply accuracy |
| Capacity revenue | D (proxy × proxy) | C (if backtest + clearing data) | backtest trail length |
| CAPEX estimate | D (3 data points) | C (if >10 deal costs accumulated) | cost observation count |
| Connection timeline | D (assumption) | C (if >15 timelines observed) | connection observations |
| Dispatch revenue | C (derived from observed prices) | B (if >90 days backtest) | backtest trail |
| Stacking efficiency | D (fixed 0.80) | C (if dispatch LP or >90 days observed) | dispatch reconciliation |

The system gets smarter automatically. No manual upgrades needed —
confidence improves as data accumulates.

---

## pgvector usage (lightweight, not overbuilt)

Use pgvector for exactly 3 things:

1. **Fuzzy entity matching:** When a news article mentions "Ignitis Group"
   or "UAB Ignitis Renewables" or "Ignitis Gamyba" — find the canonical entity.
   Embed entity names + aliases, use cosine similarity for matching.

2. **"Have we seen this before?":** When processing a new article, embed
   its summary and check similarity against existing events. If similarity > 0.92,
   it's a duplicate/restatement. Skip it.

3. **Related event retrieval:** When generating "why it matters" for a new event,
   retrieve the 3 most similar past events to check for pattern/precedent.

```sql
-- Add to existing Postgres (no new DB needed)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE project_entity ADD COLUMN name_embedding vector(384);
ALTER TABLE events ADD COLUMN summary_embedding vector(384);

-- Dedupe check
SELECT title, 1 - (summary_embedding <=> $new_embedding) as similarity
FROM events
WHERE 1 - (summary_embedding <=> $new_embedding) > 0.92
LIMIT 1;
```

Embedding model: use the Anthropic API (or a small local model on VPS)
to generate embeddings. One call per article, stored permanently. Cheap.

---

## Implementation priority

### Week 1 (can start now):
- Add project_stage_history table
- Populate from existing project_entity data (backfill known transitions)
- Add regime_observations table (log daily from trading engine)
- Start backtest_snapshots (log predictions daily)

### Week 2:
- Add cost_observations table (backfill known deals)
- Add connection_timeline_observations (backfill from VERT.lt snapshots)
- Build daily confidence recalculation script

### Week 3:
- Add developer_track_record (compute from stage_history)
- Add pgvector for entity matching + dedupe
- Build slippage detection from stage_history

### Week 4:
- Connect confidence propagation to publication gates
- First empirical hazard model calibration attempt
- First regime-revenue correlation analysis
- Morning review includes confidence change summary
