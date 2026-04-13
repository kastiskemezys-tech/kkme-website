# /genload Diagnostic — 2026-04-12

**Status:** Read-only investigation. No code modified.
**Investigator:** Claude (requested by Kastis)
**Observation time:** Kastis saw data at ~04:00 UTC Saturday
**Diagnostic run:** ~07:15 UTC Saturday

---

## Executive Summary

Five issues found, three are bugs:

| # | Issue | Severity | Type |
|---|-------|----------|------|
| 1 | **Arrow directions are inverted** on all interconnectors | **P0** | Bug |
| 2 | **S8 averages 24h of data** instead of using latest point | **P1** | Bug |
| 3 | **LV↔LT and LV↔EE flows missing** from hero map | **P1** | Missing feature |
| 4 | **Gen parser drops stale production types** | **P2** | Bug |
| 5 | **S8 timestamp is fetch-time**, not data-time | **P2** | Bug |

---

## 1. Per-Country psrType Breakdown (ENTSO-E A75, queried 07:15 UTC)

### Lithuania (10YLT-1001A0008Q) — 10 TimeSeries

| PSR | Type | MW | Resolution | Last Point |
|-----|------|----|-----------|------------|
| B16 | Solar | 684 | PT15M | 06:45 |
| B17 | Waste | 78 | PT15M | 06:45 |
| B19 | Wind Onshore | 72 | PT15M | 06:45 |
| B20 | Other | 46 | PT15M | 06:45 |
| B04 | Fossil Gas | 28 | PT15M | 06:45 |
| B11 | Hydro Run-of-river | 27 | PT15M | 06:45 |
| B01 | Biomass | 19 | PT15M | **06:15** |
| B10 | Hydro Pumped Storage | 0 | PT15M | **03:00** |
| B25 | Energy storage | 0 | PT15M | **06:30** |
| B10 | Hydro Pumped Storage | 0 | PT15M | **03:00** |
| | **TOTAL** | **954** | | |

**Worker algorithm picks 06:45 group only → reports 935 MW (missing 19 MW biomass at 06:15)**

Expected types present: Wind ✓, Solar ✓, Biomass ✓, Gas ✓, Hydro RoR ✓, Pumped Storage ✓, Waste ✓, Other ✓, Energy Storage ✓
Missing: None significant. CHP/cogen likely included under B04 (Gas) or B20 (Other).

### Latvia (10YLV-1001A00074) — 6 TimeSeries

| PSR | Type | MW | Resolution | Last Point |
|-----|------|----|-----------|------------|
| B16 | Solar | 811 | PT60M | 06:00 |
| B11 | Hydro Run-of-river | 630 | PT60M | 06:00 |
| B01 | Biomass | 38 | PT60M | 06:00 |
| B20 | Other | 31 | PT60M | 06:00 |
| B19 | Wind Onshore | 2 | PT60M | 06:00 |
| B04 | Fossil Gas | 0 | PT60M | **03:00** |
| | **TOTAL** | **1512** | | |

**Worker picks 06:00 group → reports 1512 MW (correct, gas was 0 anyway)**

Note: Latvia reports at PT60M (hourly) vs LT/EE at PT15M. The 630 MW hydro is the Daugava cascade — expected and correct. 811 MW solar seems very high for Latvia but reflects April midday-range data.

Expected types: Hydro reservoir ✓ (reported as B11 RoR, Daugava is actually run-of-river type), Wind ✓, Biomass ✓, Gas ✓.
Missing: No B12 (Hydro Water Reservoir) — Daugava cascade is classified as B11 by Latvian TSO.

### Estonia (10Y1001A1001A39I) — 12 TimeSeries

| PSR | Type | MW | Resolution | Last Point |
|-----|------|----|-----------|------------|
| B16 | Solar | 496 | PT15M | 06:45 |
| B07 | Fossil Oil shale | 135 | PT15M | 06:45 |
| B03 | Fossil Coal-derived gas | 43 | PT15M | 06:45 |
| B01 | Biomass | 37 | PT15M | 06:45 |
| B17 | Waste | 17 | PT15M | 06:45 |
| B19 | Wind Onshore | 7 | PT15M | 06:45 |
| B04 | Fossil Gas | 4 | PT15M | **06:00** |
| B11 | Hydro Run-of-river | 1 | PT15M | **03:00** |
| B08 | Fossil Peat | 0 | PT15M | **03:00** |
| B15 | Other renewable | 0 | PT15M | **03:00** |
| B20 | Other | 0 | PT15M | **03:00** |
| B25 | Energy storage | 0 | PT15M | 06:45 |
| | **TOTAL** | **740** | | |

**Worker picks 06:45 group → reports 735 MW (missing 4 MW gas at 06:00 + 1 MW hydro at 03:00)**

Expected types: Oil shale ✓ (biggest as expected), Wind ✓, Biomass ✓, Gas ✓, Shale gas (B03 Coal-derived gas) ✓.
Missing: None significant.

---

## 2. /genload vs ENTSO-E Comparison

| Country | /genload gen | ENTSO-E total | /genload time | Missing MW | Missing types |
|---------|-------------|---------------|---------------|-----------|---------------|
| LT | 914* | 954 | 06:30 | ~19-40 | Biomass (stale), Pumped Storage (stale) |
| LV | 1512 | 1512 | 06:00 | 0 | None |
| EE | 735 | 740 | 06:45 | ~5 | Gas (stale), Hydro RoR (stale) |

*Note: /genload LT showed 914 MW at 06:30 timestamp. The 954 MW total is from all series including those with stale timestamps. The worker's 2h query window and "pick latest timestamp group" algorithm explains the discrepancy.

---

## 3. Bug Analysis

### BUG 1 (P0): Arrow directions are inverted on all interconnectors

**Root cause:** Sign convention mismatch between worker and `resolveFlow`.

The chain:
1. Energy-charts CBET: **positive = country importing** (LT receives from neighbor)
2. Worker `avgFromList` (line 4725): negates → **positive = country exporting** (LT sends to neighbor)
3. `resolveFlow` (baltic-places.ts line 251): reads `positiveFlowReceives: 'LT'` → interprets positive as **LT receives**

Steps 2 and 3 have **opposite conventions**. The worker negates for "export = positive" but resolveFlow's `positiveFlowReceives` expects "positive = receives."

**Result:** Every arrow direction is flipped.

| Interconnector | S8 value | Worker meaning | Map shows | Reality |
|---------------|----------|----------------|-----------|---------|
| NordBalt | -355 | LT importing 355 MW | LT → SE ❌ | SE → LT ✓ |
| LitPol | +65 | LT exporting 65 MW | PL → LT ❌ | LT → PL ✓ |
| EstLink | -55 | EE importing 55 MW | EE → FI ❌ | FI → EE ✓ |

**Fix options (pick one):**
- A. Remove the negation in the worker (line 4725: `return Math.round(avg * 1000)` without minus). Then positive = importing = receiving, which matches `positiveFlowReceives`.
- B. Flip `positiveFlowReceives` for every interconnector in baltic-places.ts.

Option A is simpler (one line change).

### BUG 2 (P1): S8 averages entire 24h dataset

**Root cause:** `avgFromList` (worker line 4719-4726) averages ALL non-null values in the energy-charts response.

Energy-charts CBET returns 96 quarter-hourly data points spanning ~24 hours. The function averages all of them, giving a **daily average** rather than current flow.

**Evidence (NordBalt):**
- Daily average: -355 MW (worker reports this)
- Latest 15-min point: -499 MW
- Delta: 144 MW

**Evidence (LitPol):**
- Daily average: +65 MW (worker reports)
- Latest 15-min point: +142 MW
- Delta: -77 MW

**Fix:** Use the last data point (or last N points) from the `unix_seconds` aligned data instead of averaging all.

### BUG 3 (P2): Gen parser drops production types with stale timestamps

**Root cause:** `parseEntsoeXml` with `sumAllSeries=true` (line 4933-4953):
1. Takes the **last point** per TimeSeries
2. Groups by timestamp
3. Picks the **latest timestamp** group
4. Sums only that group

Production types that report their last data point at an earlier time (even 15-30 min earlier) are **silently dropped**.

**Impact:** For LT, Biomass (19 MW at 06:15) is dropped because the main group is at 06:45. For EE, Gas (4 MW) and Hydro (1 MW) are dropped. Total ~24 MW currently missing across all three countries.

**Fix:** Instead of picking the latest timestamp group, sum the last point from ALL series, using each series' own latest point regardless of timestamp alignment.

### Missing Feature: LV↔LT and LV↔EE internal Baltic flows

The hero map shows four submarine cables (NordBalt, LitPol, EstLink, Fenno-Skan) but **no internal AC interconnections** between the three Baltic countries.

**ENTSO-E A11 at ~06:45 UTC:**
- LV→LT: **484 MW** (huge — explains where LT gets its missing power)
- LT→LV: 0 MW at that time
- LV→EE: **337 MW**
- EE→LV: 0 MW

**Energy-charts CBET for LT also includes Latvia** as a country alongside Sweden and Poland. The worker already fetches this data but doesn't extract the Latvia column.

This is the single biggest explanation for the "math doesn't balance" observation. LV has a massive surplus (from Daugava hydro + solar) that flows south to LT and north to EE via AC transmission lines.

### BUG 4 (P2): S8 timestamp is fetch-time, not data-time

Worker line 4780: `timestamp: new Date().toISOString()` — this is the cron execution time, not the time of the underlying energy-charts data. The S8 data was fetched at 04:00 UTC (last cron), while /genload refreshed at ~07:14 UTC. This creates a 3+ hour temporal mismatch on the hero map.

---

## 4. Time Alignment

| Source | Timestamp | Data represents |
|--------|-----------|----------------|
| /genload LT | 06:30 UTC | 15-min ISP ending at 06:30 |
| /genload LV | 06:00 UTC | Hourly ending at 06:00 |
| /genload EE | 06:45 UTC | 15-min ISP ending at 06:45 |
| /s8 interconnectors | 04:00 UTC | **24-hour average** (not a point-in-time) |

**Time delta: 2h 30m – 2h 45m** between S8 and genload.

Even within genload, there's a 45-minute spread between countries (LV at 06:00 vs EE at 06:45) because Latvia reports hourly while LT/EE report at 15-min resolution.

---

## 5. Energy Balance Check

### At ~06:45 UTC (latest genload point):

**Supply side (MW):**
- LT generation: 935
- LV generation: 1512
- EE generation: 735
- **Baltic total gen: 3182 MW**

**Demand side (MW):**
- LT load: 895 (at 06:45)
- LV load: 664 (at 06:00)
- EE load: 788 (at 06:45)
- **Baltic total load: 2347 MW**

**Baltic internal surplus: +835 MW** — this exits via interconnectors to SE, PL, FI.

**Known external flows (ENTSO-E A11 scheduled, ~06:45):**
- NordBalt: SE→LT ~499 MW (importing into Baltics)
- LitPol: LT→PL ~142 MW (exporting from Baltics)
- EstLink: EE→FI or FI→EE — not precisely queried at this timestamp

**Known internal flows (ENTSO-E A11, ~06:45):**
- LV→LT: 484 MW
- LV→EE: 337 MW

Baltic internal flows are consistent: LV surplus (848 MW) flows to LT (484 MW) and EE (337 MW) → 484+337 = 821 MW. Close to LV's 848 MW net.

### At 04:00 UTC (Kastis's observation):

Kastis observed: LT 589 gen / 1.2 GW load / 611 deficit. LV 843 gen / 614 load / 229 surplus. EE 416 gen / 737 load / 321 deficit.

With corrected arrow directions:
- NordBalt: SE → LT (importing, not exporting as shown)
- LitPol: LT → PL (exporting)
- LV→LT: 66 MW at 04:00 (from ENTSO-E A11)

LT balance: 589 + NordBalt_import + 66 (LV) - LitPol_export = ~1200
NordBalt_import = 1200 - 589 - 66 + LitPol = 545 + LitPol

This is plausible. The 355 MW NordBalt value was a daily average, not the 04:00 actual.

---

## 6. Hypothesis for Apparent Imbalance

Kastis saw what appeared to be LT exporting 355 MW via NordBalt despite a 611 MW generation deficit. The imbalance is explained by **three compounding issues:**

1. **Arrow directions are inverted** (P0 bug). NordBalt was actually importing 355 MW into LT (daily avg), not exporting. With correct direction, LT's imports increase by 710 MW (from -355 to +355).

2. **LV→LT internal flow not shown**. At 04:00, ~66 MW was flowing LV→LT (rising to 484 MW by 06:45). This is a major invisible flow.

3. **S8 shows daily average, not current flow**. The "355 MW" is a 24h average. The actual NordBalt flow at 04:00 was likely different (possibly higher, as early morning tends toward higher imports).

With corrected directions and the LV→LT flow included, the balance is physically plausible.

---

## 7. Recommended Actions

**Immediate (P0):**
1. Fix arrow direction inversion. Simplest: remove the negation in `avgFromList` (worker line 4725). Change `return Math.round(-avg * 1000)` to `return Math.round(avg * 1000)`. This aligns the worker's sign convention with `positiveFlowReceives` in baltic-places.ts.

**High priority (P1):**
2. Use latest data point instead of daily average in S8. Replace `avgFromList` with a function that uses `unix_seconds` from the energy-charts response to pick the most recent data point(s).
3. Add LV↔LT internal flow to the hero map. The energy-charts LT CBET response already includes Latvia. Extract it the same way as Sweden/Poland.
4. Consider adding LV↔EE flow for completeness.

**Medium priority (P2):**
5. Fix gen parser to sum all series' latest points regardless of timestamp alignment, instead of picking only the latest timestamp group.
6. Use the energy-charts `unix_seconds` for S8 timestamp instead of `new Date()`.

**Lower priority:**
7. Document that Latvia reports at PT60M vs LT/EE at PT15M, causing up to 45-min timestamp spread in genload.
8. Consider adding data staleness warning when gen/load and S8 timestamps differ by >1 hour.

---

## 8. Raw Data Files

Saved for reference:
- `/tmp/lt-gen.xml` — LT A75 generation
- `/tmp/lv-gen.xml` — LV A75 generation
- `/tmp/ee-gen.xml` — EE A75 generation
- `/tmp/lt-cbet.json` — Energy-charts CBET for LT
- `/tmp/lv-lt-flow.xml` — ENTSO-E A11 LV→LT scheduled flow
- `/tmp/lt-lv-flow.xml` — ENTSO-E A11 LT→LV scheduled flow
- `/tmp/lv-ee-flow.xml` — ENTSO-E A11 LV→EE scheduled flow
- `/tmp/ee-lv-flow.xml` — ENTSO-E A11 EE→LV scheduled flow
