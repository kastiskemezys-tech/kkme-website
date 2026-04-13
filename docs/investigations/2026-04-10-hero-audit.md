# Hero Rebuild — Audit Report

**Date:** 2026-04-10
**Author:** Claude (audit-only pass, zero code changes)

---

## 1. Current broken hero

### Location
- **Component:** `HeroMarketNow` imported at [page.tsx:6](app/page.tsx#L6), rendered at [page.tsx:39](app/page.tsx#L39)
- **File:** [app/components/HeroMarketNow.tsx](app/components/HeroMarketNow.tsx) — 381 lines
- **Layout position:** First content after `<StickyNav/>` and `<CardEntrance/>`. Below it: `#revenue-drivers` section containing S1+S2 cards in `grid-2`.

### What it renders
Two-column hero grid (50/50):
- **Left column:** KKME wordmark, value prop paragraph, metadata line, "See the signals" CTA button.
- **Right column:** "Market Now" card with S/D ratio hero metric, 2x2 supporting metrics (DA capture, balancing capacity, grid capacity, fleet MW), interpretation text, impact line, freshness footer, details drawer.

### Data hooks
Three parallel fetches in a single `useEffect` (line 48-54):
```
fetch(`${BASE}/read`)   → setS1()
fetch(`${BASE}/s2`)     → setS2()
fetch(`${BASE}/s4`)     → setS4()
```

### Root cause of "—" placeholders

| Metric | Source field | Value from API | Why broken |
|--------|-------------|----------------|-----------|
| S/D ratio | `s2.sd_ratio` | `null` | Fleet data stripped from /s2 (worker:5587). S/D now lives in `/s4/fleet` only. |
| Phase | `s2.phase` | `null` | Same reason — stripped from /s2 |
| Operational BESS | `s2.baltic_operational_mw` | `null` | Same — fleet fields stripped |
| Pipeline BESS | `s2.baltic_pipeline_mw` | `null` | Same |
| DA capture | `s1.bess_net_capture` (from `/read`) | `178.2` | **Working** |
| Balancing capacity | `s2.afrr_up_avg` | `0.92` | **Working** (but shows "1" which is near-zero — misleading) |
| Grid capacity | `s4.free_mw` | `3423` | **Working** (shows "3.4 GW") |

**The S/D ratio, phase, operational MW, and pipeline MW all show "—" because the worker intentionally stripped fleet data from `/s2` (line 5587: "Fleet data stripped from /s2 — now served via /s4"). The hero still reads from `/s2`, not `/s4/fleet`.**

The interpretation falls through to `sd == null` → "Waiting for balancing market data." and the impact shows "Insufficient data for assessment."

### Visit delta feature
Lines 66-81: compares current sd + bess_net_capture with localStorage `kkme_last_visit`. Never fires because `sd` is null.

---

## 2. SVG assets

### File inventory

| File | Size | Type |
|------|------|------|
| `KKME black interconnect.svg` | 2,343,744 bytes (2.2 MB) | SVG wrapper around base64 PNG |
| `KKME white interconnect (1).svg` | 2,279,124 bytes (2.2 MB) | SVG wrapper around base64 PNG |
| `KKME black interconnect.png` | 1,757,620 bytes (1.7 MB) | Standalone PNG |
| `KKME white interconnect.png` | 1,452,682 bytes (1.4 MB) | Standalone PNG |

### CRITICAL FINDING: SVGs are raster, not vector

Both SVG files contain exactly:
- **1 `<image>` element** with a `data:image/png;base64,` data URI (~1.7 MB decoded)
- **1 `<use>` element** referencing the image
- **0 `<path>`, `<circle>`, `<line>`, `<text>`, `<g>`, `<rect>` elements**
- **2 ids:** `img1` (the raster image) and `Background` (the use element)

Both have identical structure:
```xml
<svg viewBox="0 0 1024 1332" width="1024" height="1332">
  <defs>
    <image width="1024" height="1332" id="img1" href="data:image/png;base64,..."/>
  </defs>
  <use id="Background" href="#img1" x="0" y="0"/>
</svg>
```

### Interconnector label search

Searching for "NordBalt", "EstLink", "LitPol", "Fenno", "Skan" etc. in both SVGs returns only **false positive hits inside the base64 data** (random byte sequences matching the search string). There are **zero semantic labels, zero vector paths, zero animatable geometry**.

### Implication for hero rebuild

These SVGs cannot be used for:
- Animated particles along interconnector paths (no paths exist)
- Dynamic flow direction indicators (no cable geometry)
- Hover interactions on countries/cables (no distinct elements)
- Theme switching via CSS (raster, not vector fill/stroke)

They CAN be used as:
- Static background images (same as the PNG files)
- Visual reference for an artist to trace vector paths from

The dark and white versions differ in raster content (inverted colors) but have identical SVG structure.

---

## 3. Data endpoints

### 3.1 /revenue?dur=4h

```json
{
  "live_rate": {
    "today_trading_daily": 178,
    "today_balancing_daily": 378,
    "today_total_daily": 556,
    "base_daily": 631,
    "delta_pct": -12,
    "annualised": 202978,
    "capture_used": 138.3,
    "as_of": "2026-04-10T08:43:32.820Z"
  },
  "fleet_context": {
    "current_sd": 1.37,
    "weighted_supply": 1027,
    "pipeline_mw": 1083,
    "demand_mw": 752,
    "pipeline_realisation": 0.5,
    "spread_growth": 0.02,
    "source": "live_s4_fleet"
  },
  "project_irr": 0.1081,
  "irr_status": "marginal",
  "equity_irr": 0.1656,
  "gross_revenue_y1": 9352877,
  "ebitda_y1": 6287589,
  "min_dscr": 1.45,
  "years": [/* 20 entries, keys: year, da_revenue, reserve_revenue, total_revenue, ebitda, dscr, ... */],
  "duration": 4,
  "capex_scenario": "€164/kWh",
  "cod_year": 2028
}
```

Key fields for hero: `live_rate.today_total_daily` (€/day), `live_rate.annualised` (€/yr), `fleet_context.current_sd`, `project_irr`.

### 3.2 /read (aliased /s1)

```json
{
  "bess_net_capture": 178.2,
  "capture": {
    "gross_4h": 138.32,
    "net_4h": 136.75,
    "rolling_30d": { "stats_2h": {...}, "stats_4h": { "mean": 116.08, "p50": 128.22, ... } },
    "shape_swing": 206.86
  },
  "lt_avg_eur_mwh": 88.47,
  "spread_eur_mwh": -0.05,
  "updated_at": "2026-04-10T08:43:32.820Z"
}
```

### 3.3 /s1/capture

```json
{
  "capture_4h": { "gross_eur_mwh": 138.32, "net_eur_mwh": 136.75, "avg_charge": 20.93, "avg_discharge": 159.25 },
  "rolling_30d": { "stats_4h": { "mean": 116.08, "p50": 128.22, "p75": 151.06, "p90": 176.36, "days": 30 } },
  "history": [/* 30 daily entries */],
  "monthly": [/* 14 monthly entries */]
}
```

### 3.4 /s2

Fleet fields (sd_ratio, phase, baltic_operational_mw, etc.) all return `null` — stripped from /s2 by design. Balancing prices work:
```json
{
  "afrr_up_avg": 0.92,
  "mfrr_up_avg": 16.47,
  "fcr_avg": 0.37,
  "sd_ratio": null,
  "phase": null,
  "baltic_operational_mw": null
}
```

### 3.5 /s4

```json
{
  "projects": [/* 23 entries */],
  "project_counts": { "total": 23, "by_country": {"EE":5,"LT":9,"LV":9}, "by_status": {...}, "total_mw": 1773.5 },
  "free_mw": 3423,
  "fleet": { "countries": {...}, "sd_ratio": 1.37, "phase": "MATURE", ... }
}
```

Project shape: `{ id, name, mw, mwh, status, cod, country, tso, source, type, confidence, _contradiction_flags, _freshness, _quarantine }`

### 3.6 /s4/fleet

```json
{
  "sd_ratio": 1.37,
  "phase": "MATURE",
  "cpi": 0.37,
  "baltic_operational_mw": 691,
  "baltic_pipeline_mw": 1083,
  "baltic_weighted_mw": 1027,
  "eff_demand_mw": 752,
  "non_commercial_mw": 485,
  "countries": {
    "EE": { "operational_mw": 126.5, "pipeline_mw": 255, "weighted_mw": 356, "entries": [...] },
    "LT": { "operational_mw": 465, "pipeline_mw": 611, "weighted_mw": 519.9, "entries": [...] },
    "LV": { "operational_mw": 99, "pipeline_mw": 217, "weighted_mw": 151.3, "entries": [...] }
  }
}
```

### 3.7 /s8 (Interconnectors)

```json
{
  "signal": "IMPORTING",
  "nordbalt_avg_mw": -288,
  "litpol_avg_mw": 112,
  "nordbalt_signal": "IMPORTING",
  "litpol_signal": "EXPORTING",
  "interpretation": "NordBalt: IMPORTING (-288 MW). LitPol: EXPORTING (112 MW).",
  "timestamp": "2026-04-10T08:01:22.922Z"
}
```

**Note:** /s8 only covers NordBalt (LT↔SE4) and LitPol (LT↔PL). It does NOT include:
- EstLink 1/2 (EE↔FI) — not fetched
- LT↔LV flow — available in CBET API as `Latvia` country (avg 0.242 GW = ~242 MW)

The energy-charts.info CBET API (`/cbet?country=lt`) returns: `Latvia`, `Poland`, `Sweden`, `sum`. The worker only uses Sweden and Poland, ignoring Latvia.

---

## 4. ENTSO-E cross-border flows

### What the worker fetches today

| Source | API | Data | Used by |
|--------|-----|------|---------|
| ENTSO-E A44 | `web-api.tp.entsoe.eu/api` | Day-ahead prices (LT, SE4, PL) | S1 (price separation), dispatch, revenue |
| energy-charts.info CBET | `api.energy-charts.info/cbet?country=lt` | Cross-border physical flows for LT | S8 (NordBalt + LitPol only) |

### ENTSO-E A11 status

**A11 (cross-border physical flows) is NOT fetched directly from ENTSO-E.** The worker uses energy-charts.info's CBET endpoint instead, which is derived from A11 data but pre-aggregated.

### Auth pattern
- Env var: `ENTSOE_API_KEY` (set as Cloudflare Worker secret)
- Passed as: `securityToken` query parameter
- Used at: lines 2537-2548 (A44 LT), 2554-2555 (A44 SE4), 2898-2899 (validation), 6701-6707 (dispatch DA fetch)

### Cache pattern
- KV keys: `s1`, `s8`, etc. via `env.KKME_SIGNALS.put()`
- TTL: computed every 4 hours via worker cron
- Cron: `0 */4 * * *` (every 4 hours)

### Coverage gap for hero
The CBET endpoint already provides:
- NordBalt (Sweden): used, avg -288 MW today (LT importing)
- LitPol (Poland): used, avg 112 MW today (LT exporting)
- **LT↔LV (Latvia): available but NOT consumed** — avg 242 MW today

Missing from CBET (would need separate call):
- EstLink 1/2 (EE↔FI): would need `?country=ee` or ENTSO-E A11 directly
- Fennoskan (SE3↔FI): outside Baltic scope

### Lines-of-code to add LT↔LV flow

**~5 lines.** The CBET data already contains Latvia. In `fetchInterconnectorFlows()` (line 4608), add:
```js
const ltlv_avg_mw = avgFromCountry('Latvia');
```
And include it in the return object. No new API call, no new cron, no new auth.

### EstLink gap

To get EstLink (EE↔FI), would need either:
- `api.energy-charts.info/cbet?country=ee` — untested, may work
- ENTSO-E A11 direct call — ~40 lines matching existing patterns

---

## 5. Open questions for Kastis

1. **SVGs are raster, not vector.** The 2.2 MB "SVG" files are PNG images wrapped in SVG containers. There are zero vector paths to animate. **Decision needed:** Should your wife re-export as pure vector SVG from the source design tool (Figma/Illustrator)? Or should we trace the interconnector paths manually (I can generate approximate path geometry from the map)?

2. **Which interconnectors on the map?** The PNG shows a Baltic region map with cable lines. Can you confirm which cables are drawn? I assume: NordBalt (LT↔SE4), LitPol (LT↔PL), and LT↔LV internal. Are EstLink (EE↔FI) lines also on the map?

3. **S8 endpoint missing LT↔LV flow.** The CBET API already returns Latvia flow data (242 MW avg today) but the worker ignores it. Should I add it to /s8 in the implementation pass? This is ~5 lines.

4. **EstLink flow data.** The CBET API may support `?country=ee` for Estonia cross-border flows (EstLink). Should I test and add this, or defer to Phase 2?

5. **Hero data source.** The current hero fetches `/read`, `/s2`, `/s4` — getting nulls from `/s2`. The new hero should fetch `/s4/fleet` (for S/D, fleet MW) and `/s8` (for interconnector flows). Should it also fetch `/revenue` for live_rate (€556/day today)?

6. **Theme switching.** With raster SVGs, we'd need two separate images and swap them on theme change. Pure vector would allow CSS-driven theming. Which approach do you prefer?

7. **Map aspect ratio.** Both SVGs are 1024x1332 (portrait, ~3:4). The hero is a two-column grid. Should the map occupy the full right column height, or should it be cropped/scrolled to show only the interconnector region?

---

## 6. Proposed Phase 1 scope adjustments

### Finding: raster SVGs block the particle animation plan

The original plan assumed vector SVG paths for animated particles flowing along interconnector cables. The SVGs are raster — there are no paths to animate along.

### Recommendation: Phase 1a/1b split

**Phase 1a (implement now):**
- Replace broken hero with new two-column layout
- Left: KKME wordmark + value prop + live KPIs (S/D from `/s4/fleet`, DA capture from `/read`, today's revenue from `/revenue`)
- Right: Static interconnect map as `<img>` (swap dark/light based on theme), with superimposed HTML/CSS flow indicators at known cable positions (colored dots/arrows at NordBalt, LitPol, LT↔LV positions showing import/export/MW from `/s8`)
- Fix the `/s8` endpoint to include LT↔LV flow (~5 lines)
- Use the PNG files directly (smaller than the SVG-wrapped-PNGs, and identical visual)

**Phase 1b (after vector re-export):**
- Get pure vector SVG from source design tool
- Replace static map with inline SVG
- Add animated particles along cable paths using D3/anime.js
- Add hover states on countries showing fleet MW
- Full CSS theming via SVG fill/stroke tokens

### Reasoning

Phase 1a fixes the broken hero immediately with real data and a professional map visual. The flow indicators (HTML overlays on the map image) are achievable in ~200 lines and don't require vector paths. Phase 1b is the premium version that needs the vector source file.

This avoids shipping synthetic/fake particle animations that would violate the design principle "No decorative motion — animation ONLY on state changes."

### Quick win before Phase 1a

The broken hero can be partially fixed in ~10 lines by changing the data source from `/s2` to `/s4/fleet` for the S/D ratio and fleet MW fields. This would make the current hero show real numbers instead of "—" while the full rebuild is prepared. However, since the full rebuild is imminent, this may not be worth the intermediate commit.
