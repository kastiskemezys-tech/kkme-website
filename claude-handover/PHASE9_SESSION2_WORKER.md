# Phase 9, Session 2: Worker Data Layer for Structural Market Drivers

## Context

Phase 9 rebuilds the "Baltic Power Market" section (id="context") into "Structural Market Drivers" (id="structural").

### Current state (from Session 1 audit)

**Current cards in section:**
| Card | Endpoint | Lines | Hero metric | Data source |
|------|----------|-------|-------------|-------------|
| S6 (Nordic Hydro) | /s6 | 219 | Reservoir fill % | NVE biapi.nve.no |
| S7 (TTF Gas) | /s7 | 200 | TTF €/MWh | Yahoo Finance (TTF futures) |
| S8 (Interconnectors) | /s8 | 208 | NordBalt/LitPol MW | ENTSO-E A11 |
| S9 (EU ETS Carbon) | /s9 | 180 | EUA €/t | tradingeconomics.com scrape |
| S5 (DC Power) | /s5 | 258 | OPEN/CLOSED + free MW | S4 KV reuse + manual |

**Current worker cron (every 4h):**
- Batch 1 (parallel): S1, S4, S3, Euribor
- Sequential: S5 (depends on S4)
- Batch 2 (parallel): S6, S7, S8, S9

### Target state

**Primary row (4 cards):** Wind Generation, Solar Generation, Demand/Load, Interconnectors & Connected Markets
**Secondary row (2 cards):** TTF Gas, EU ETS Carbon
**Removed:** DC Power Viability (future module), Nordic Hydro (demoted)

### Critical data finding

**ENTSO-E does NOT publish A75 (actual generation per type) or A65 (total load) for Lithuania.**
- Estonia: A75 available (B16 solar, B19 wind), A65 load available
- Latvia: A75 available (B16 solar, B19 wind), A65 load available
- Lithuania: NO generation or load data on ENTSO-E

**Alternative source confirmed: energy-charts.info**
- `GET https://api.energy-charts.info/public_power?country=lt` — returns LT wind, solar, load, battery, gas, hydro
- `GET https://api.energy-charts.info/public_power?country=ee` — returns EE equivalents
- `GET https://api.energy-charts.info/public_power?country=lv` — returns LV equivalents
- Data is 15-min or hourly resolution, updated with ~1h lag
- Same API family already used by existing S8 interconnector fetch (`/cbet?country=lt`)

**Sample LT values (2026-03-09):**
- Wind onshore: min 321 MW, max 1,539 MW, avg 859 MW
- Solar: min 0 MW, max 853 MW, avg 233 MW
- Load: min 881 MW, max 1,721 MW, avg 1,307 MW
- Battery: min 0 MW, max 76 MW, avg 12 MW

---

## Task: Add 3 new worker fetch functions and endpoints

### DO NOT modify:
- S6 (Nordic Hydro) fetch/endpoint — keep as-is, just won't have a primary card
- S7 (TTF Gas) fetch/endpoint — keep as-is
- S9 (EU ETS Carbon) fetch/endpoint — keep as-is
- S8 endpoint shape — keep existing fields, add new fields alongside

### New function 1: `fetchBalticWind()`

**Source:** energy-charts.info public_power API
**Fetch pattern:**
```
GET https://api.energy-charts.info/public_power?country=lt&start={24h_ago}&end={now}
GET https://api.energy-charts.info/public_power?country=ee&start={24h_ago}&end={now}
GET https://api.energy-charts.info/public_power?country=lv&start={24h_ago}&end={now}
```

**Extract from response:**
- Find `production_types` entry where `name === "Wind onshore"`
- Compute: current (latest non-null), avg_24h, min_24h, max_24h per country
- Aggregate Baltic total: sum of LT + EE + LV current/avg/min/max

**KV key:** `s_wind`

**Output shape:**
```json
{
  "timestamp": "ISO",
  "baltic_current_mw": 1176,
  "baltic_avg_24h_mw": 980,
  "baltic_min_24h_mw": 450,
  "baltic_max_24h_mw": 1800,
  "baltic_installed_mw": 3200,
  "penetration_pct": 36.8,
  "lt": { "current_mw": 859, "avg_24h_mw": 750, "installed_mw": 1800 },
  "ee": { "current_mw": 297, "avg_24h_mw": 200, "installed_mw": 900 },
  "lv": { "current_mw": 21, "avg_24h_mw": 30, "installed_mw": 500 },
  "signal": "HIGH|MODERATE|LOW",
  "interpretation": "...",
  "bess_impact": "spread_supportive|neutral|spread_compressive"
}
```

**Signal logic:**
- HIGH: baltic_current_mw > 60% of installed → high wind, likely lower prices, wider spreads
- MODERATE: 30-60%
- LOW: < 30% → less price volatility

**Installed MW:** Use static reference values (LT ~1800 MW, EE ~900 MW, LV ~200 MW as of 2026). Update periodically. Note: LV wind is small. These are approximate — classify as "reference".

**BESS impact:** High wind → more price volatility → spread_supportive. Low wind → less price spread → neutral.

**GET endpoint:** `/s_wind` → read from KV `s_wind`

### New function 2: `fetchBalticSolar()`

**Source:** Same energy-charts.info public_power API (same 3 fetches — consider combining with wind to avoid redundant API calls)

**Extract:** `production_types` entry where `name === "Solar"`

**KV key:** `s_solar`

**Output shape:**
```json
{
  "timestamp": "ISO",
  "baltic_current_mw": 856,
  "baltic_avg_24h_mw": 233,
  "baltic_peak_24h_mw": 1200,
  "baltic_installed_mw": 2800,
  "lt": { "current_mw": 853, "avg_24h_mw": 233, "installed_mw": 2200 },
  "ee": { "current_mw": 3, "avg_24h_mw": 5, "installed_mw": 400 },
  "lv": { "current_mw": 0, "avg_24h_mw": 0, "installed_mw": 200 },
  "is_daylight": true,
  "signal": "HIGH|MODERATE|LOW|NIGHT",
  "interpretation": "...",
  "bess_impact": "charge_window|neutral"
}
```

**Signal logic:**
- NIGHT: current = 0 for all (nighttime)
- HIGH: baltic_current_mw > 50% of installed
- MODERATE: 20-50%
- LOW: < 20% and daylight

**BESS impact:** High solar = cheap charging window = charge_window. Otherwise neutral.

**GET endpoint:** `/s_solar` → read from KV `s_solar`

### Optimization: Combined fetch function `fetchBalticGeneration()`

Since wind and solar come from the same API call, fetch once per country and split:

```js
async function fetchBalticGeneration() {
  const countries = [
    { code: 'lt', label: 'LT', wind_installed: 1800, solar_installed: 2200 },
    { code: 'ee', label: 'EE', wind_installed: 900, solar_installed: 400 },
    { code: 'lv', label: 'LV', wind_installed: 200, solar_installed: 200 },
  ];

  const results = await Promise.all(
    countries.map(c =>
      fetch(`https://api.energy-charts.info/public_power?country=${c.code}&start=...&end=...`)
        .then(r => r.json())
    )
  );

  // Parse wind + solar + load from each response
  // Return { wind: {...}, solar: {...}, load: {...} }
}
```

This makes 3 API calls instead of 9 and produces all 3 KV payloads.

### New function 3: `fetchBalticLoad()` (extracted from same combined fetch)

**KV key:** `s_load`

**Output shape:**
```json
{
  "timestamp": "ISO",
  "baltic_current_mw": 2900,
  "baltic_avg_24h_mw": 2800,
  "baltic_min_24h_mw": 2200,
  "baltic_max_24h_mw": 3500,
  "lt": { "current_mw": 1307, "avg_24h_mw": 1250 },
  "ee": { "current_mw": 933, "avg_24h_mw": 900 },
  "lv": { "current_mw": 660, "avg_24h_mw": 650 },
  "signal": "PEAK|NORMAL|LOW",
  "interpretation": "...",
  "bess_impact": "discharge_supportive|neutral"
}
```

**Signal logic:**
- PEAK: baltic_current_mw > 3200 MW (high demand → higher prices → good for BESS discharge)
- NORMAL: 2400-3200
- LOW: < 2400 (night/weekend)

**GET endpoint:** `/s_load` → read from KV `s_load`

### S8 Interconnector enhancement (modify existing)

Current S8 only shows NordBalt and LitPol MW flows. Enhance to include:
- EstLink 1+2 (EE-FI) flow data — from same ENTSO-E A11 fetch or energy-charts CBET
- Net Baltic import/export position
- Connected market price context (SE4, FI, PL spot prices from S1 data or separate fetch)

**Modified KV key:** `s8` (add fields alongside existing)

**Additional fields:**
```json
{
  // ... existing nordbalt_avg_mw, litpol_avg_mw, etc.
  "estlink_avg_mw": 450,
  "estlink_signal": "IMPORTING",
  "net_baltic_mw": -200,
  "net_signal": "NET_IMPORTER",
  "connected_prices": {
    "se4_avg": 45.2,
    "fi_avg": 52.1,
    "pl_avg": 68.3,
    "lt_avg": 55.0
  }
}
```

**Note:** Connected prices may come from S1 data already in KV (LT/SE4 prices are already fetched). PL and FI would need new ENTSO-E A44 fetches. Assess whether this is worth the complexity or whether it's better to just show flow direction + magnitude.

**Recommendation:** For Session 2, keep S8 enhancement minimal — just add EstLink flow if the ENTSO-E A11 data includes EE-FI borders. The "connected markets" view is a Session 3 frontend concern that can use existing S1 price data.

---

## Cron integration

Add `fetchBalticGeneration()` to the existing Batch 2 parallel block:

```js
// Current
const [s6Res, s7Res, s8Res, s9Res] = await Promise.allSettled([...]);

// New
const [s6Res, s7Res, s8Res, s9Res, genRes] = await Promise.allSettled([
  withTimeout(fetchNordicHydro(),           20000),
  withTimeout(fetchTTFGas(),                20000),
  withTimeout(fetchInterconnectorFlows(),   30000),
  withTimeout(fetchEUCarbon(),              20000),
  withTimeout(fetchBalticGeneration(),      25000),  // NEW — writes s_wind, s_solar, s_load
]);
```

After genRes resolves, write all 3 KV keys:
```js
if (genRes.status === 'fulfilled') {
  const { wind, solar, load } = genRes.value;
  await Promise.all([
    env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
    env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
    env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
  ]);
  console.log(`[Gen] wind=${wind.baltic_current_mw}MW solar=${solar.baltic_current_mw}MW load=${load.baltic_current_mw}MW`);
}
```

---

## New KV keys

| Key | Written by | Read by |
|-----|-----------|---------|
| `s_wind` | `fetchBalticGeneration()` in cron | GET /s_wind |
| `s_solar` | `fetchBalticGeneration()` in cron | GET /s_solar |
| `s_load` | `fetchBalticGeneration()` in cron | GET /s_load |

---

## New GET endpoints

Add to the existing simple-read pattern (around line 2622):

```js
for (const sig of ['s6', 's7', 's8', 's9', 's_wind', 's_solar', 's_load']) {
  if (request.method === 'GET' && url.pathname === `/${sig}`) {
    // ... existing KV read pattern
  }
}
```

Or add explicit routes if the naming convention differs.

---

## Test commands (run after deploy)

```bash
# Verify each new endpoint returns data
curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s_wind" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Wind: {d.get(\"baltic_current_mw\")} MW, signal={d.get(\"signal\")}')"

curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s_solar" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Solar: {d.get(\"baltic_current_mw\")} MW, signal={d.get(\"signal\")}')"

curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s_load" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Load: {d.get(\"baltic_current_mw\")} MW, signal={d.get(\"signal\")}')"

# Verify existing endpoints still work
curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s7" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'TTF: {d.get(\"ttf_eur_mwh\")} €/MWh')"
curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s9" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'EUA: {d.get(\"eua_eur_t\")} €/t')"

# Trigger a manual cron run to populate KV
# (or wait for next 4h cycle)
```

---

## Risk assessment

| Data source | Reliability | Fallback | Classification |
|-------------|------------|----------|----------------|
| energy-charts.info (wind/solar/load) | Good — public API, same source as CBET already used | Stale badge + last known value | Observed (aggregated TSO data) |
| ENTSO-E A11 (interconnectors) | Good — already used for S8 | Existing stale handling | Observed |
| Installed capacity references | Static — must be updated manually | Use approximate values, flag as "reference" | Reference |

**energy-charts.info risk:** It's a university-run service (Fraunhofer ISE). Generally reliable but not SLA-backed. The existing S8 CBET fetch already depends on it. If it goes down, all 3 new signals go stale simultaneously — acceptable for Tier 3 context cards.

**Data freshness:** energy-charts.info updates hourly-ish. The 4h cron cycle means data will be 0-4h stale. Acceptable for structural context cards.

---

## Scope boundaries

- DO NOT modify S1, S2, S3, S4 fetch logic
- DO NOT modify RevenueCard or any frontend component
- DO NOT add new cron schedules — use existing 4h cycle
- DO NOT remove S5/S6 endpoints (they still work, just won't have primary cards)
- DO NOT add history tracking for new signals (defer to later)
- Keep the combined fetch function under 150 lines
