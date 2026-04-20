# Phase 3B — Structural Drivers Rebuild (v0: Snapshot + Available Sparklines)

Self-contained Claude Code prompt. YOLO mode. Expected duration: 2–3 hours.

**Decision:** Replace 4 of 6 structural driver tiles with composed BESS-relevant metrics. Keep Gas + Carbon, add sparklines to both. This is v0 — snapshot-only for new tiles, sparklines only where history data already exists in KV.

**Why v0 first:** Hourly genload history and day-ahead forecast require worker pipeline work (new KV history writes, ENTSO-E A65 forecast feed). That's v1 scope. v0 validates layout and data composition using endpoints that already exist. Ship the card swap now, add temporal shape later.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. Read `docs/phases/visual-audit-2026-04-16.md` (V-03 is this task, V-09 resolves naturally)
4. `git status && git log --oneline -5` — clean, on main
5. `git checkout main && git pull origin main && git checkout -b phase-3b-structural-drivers`

Proceed — YOLO.

---

## Architecture context

### Current tile layout (page.tsx lines 74–101, `tier3-grid` class, 3×2 grid)

| Position | Card | Signal endpoint | Hero metric |
|----------|------|-----------------|-------------|
| 1 | WindCard | `/s_wind` | baltic_mw |
| 2 | SolarCard | `/s_solar` | baltic_mw |
| 3 | LoadCard | `/s_load` | baltic_mw |
| 4 | S8Card | `/s8` (interconnectors) | nordbalt_avg_mw, litpol_avg_mw |
| 5 | S7Card | `/s7` (gas) | ttf_eur_mwh |
| 6 | S9Card | `/s9` (carbon) | eua_eur_t |

### After this phase

| Position | Card | Data source | Hero metric |
|----------|------|-------------|-------------|
| 1 | **RenewableMixCard** (new) | `/s_wind` + `/s_solar` + `/s_load` | Renewable share % |
| 2 | **ResidualLoadCard** (new) | `/s_wind` + `/s_solar` + `/s_load` | Residual load MW |
| 3 | **PeakForecastCard** (new) | `/read` (S1 da_tomorrow) | Next peak time + MW |
| 4 | **SpreadCaptureCard** (new) | `/read` (S1 hourly + spread) | DA spread €/MWh |
| 5 | S7Card (enhanced) | `/s7` + `/s7/history` | ttf_eur_mwh + sparkline |
| 6 | S9Card (enhanced) | `/s9` + `/s9/history` | eua_eur_t + sparkline |

### Available data (no worker changes needed)

**`/s_wind`** → `{ baltic_mw, avg_7d_mw, trend_7d, lt_mw, ee_mw, lv_mw, timestamp }`
**`/s_solar`** → `{ baltic_mw, avg_7d_mw, trend_7d, lt_mw, ee_mw, lv_mw, timestamp }`
**`/s_load`** → `{ baltic_mw, avg_7d_mw, trend_7d, lt_mw, ee_mw, lv_mw, timestamp }`
**`/read` (S1)** → `{ spread_eur_mwh, lt_daily_swing_eur_mwh, p_high_avg, p_low_avg, bess_net_capture, hourly_lt[], hourly_se4[], peak_hour, trough_hour, peak_price, trough_price, da_tomorrow: { lt_peak, lt_trough, lt_avg, se4_avg, spread_pct, delivery_date }, spread_stats_90d: { avg, p10, p90 } }`
**`/s7/history`** → `[{ ttf_eur_mwh, date }]` (daily, up to MAX_HISTORY days)
**`/s9/history`** → `[{ eua_eur_t, date }]` (daily, up to MAX_HISTORY days)

**Sparkline component** already exists at `app/components/Sparkline.tsx` — accepts `values: number[]`, optional `labels`, `p50`, `showRange`, `rangeUnit`. Used by S7Card already.

---

## Part 1: New card components

### 1A — RenewableMixCard (`app/components/RenewableMixCard.tsx`)

**Replaces:** WindCard

**Data:** Fetch `/s_wind`, `/s_solar`, `/s_load` via `useSignal` hook (3 calls). All three already exist and return `baltic_mw`.

**Computed metrics:**
```
renewable_mw = wind.baltic_mw + solar.baltic_mw
total_load = load.baltic_mw
renewable_pct = (renewable_mw / total_load) * 100
thermal_mw = total_load - renewable_mw  // simplified; ignores net imports
```

**Layout (follow existing card anatomy: header → hero → status → interpretation → viz → source footer):**

- **Header:** "Renewable Mix" + signal dot (green if renewable_pct > 40%, amber 20–40%, muted <20%)
- **Hero metric:** `{renewable_pct}%` in Unbounded font, large
- **Subtitle:** `{renewable_mw} MW of {total_load} MW load`
- **Stacked horizontal bar:** Three segments proportional to wind/solar/thermal share. Colors: wind → teal, solar → amber, thermal → muted. Labels below bar: "Wind {wind_pct}% · Solar {solar_pct}% · Thermal {thermal_pct}%"
- **vs 7D comparison:** Compute avg renewable % from wind.avg_7d_mw + solar.avg_7d_mw / load.avg_7d_mw. Show delta: "↑ 3pp vs 7D avg" or "↓ 5pp vs 7D avg"
- **Interpretation line:** One line, BESS-relevant:
  - If renewable_pct > 50%: "High renewable penetration — midday surplus likely, charging window open"
  - If renewable_pct > 30%: "Moderate mix — spread capture depends on evening demand ramp"
  - If renewable_pct < 20%: "Thermal-dominated — flat profile, narrow BESS spreads expected"
- **Source footer:** "ENTSO-E · [timestamp]"

**v1 backlog:** Add 7-day renewable % sparkline (needs daily history writes for wind+solar+load).

### 1B — ResidualLoadCard (`app/components/ResidualLoadCard.tsx`)

**Replaces:** SolarCard

**Data:** Same three `useSignal` calls as RenewableMixCard (/s_wind, /s_solar, /s_load).

**Computed metrics:**
```
residual_load_mw = load.baltic_mw - wind.baltic_mw - solar.baltic_mw
residual_pct = (residual_load_mw / load.baltic_mw) * 100
residual_7d = load.avg_7d_mw - wind.avg_7d_mw - solar.avg_7d_mw
delta_mw = residual_load_mw - residual_7d
```

**Layout:**

- **Header:** "Residual Load" + signal dot (green if residual below avg → renewables displacing thermal, amber if near avg, rose if above → tight system)
- **Hero metric:** `{residual_load_mw} MW` in Unbounded font
- **Subtitle:** `{residual_pct}% of total load`
- **Per-country breakdown:** Small 3-column row: LT {lt_residual} MW · LV {lv_residual} MW · EE {ee_residual} MW (computed from per-country fields)
- **vs 7D:** `{delta_mw > 0 ? '↑' : '↓'} {abs(delta_mw)} MW vs 7D avg`
- **Interpretation line:**
  - If residual_load_mw < residual_7d * 0.8: "Residual well below norm — excess renewable supply, charging opportunity"
  - If residual_load_mw > residual_7d * 1.2: "Tight system — thermal at high utilization, elevated evening prices likely"
  - Else: "Balanced — residual load tracking weekly average"
- **Source footer:** "ENTSO-E · [timestamp]"

**v1 backlog:** Add 24h residual load sparkline showing the midday V-shape (needs hourly genload history in worker KV).

### 1C — PeakForecastCard (`app/components/PeakForecastCard.tsx`)

**Replaces:** LoadCard (demand tile)

**Data:** Fetch `/read` via `useSignal` (this is the S1 signal — check the current hook setup in S1Card or whichever component calls useSignal for /read). Fields used: `peak_hour`, `peak_price`, `trough_hour`, `trough_price`, `lt_daily_swing_eur_mwh`, `da_tomorrow` (if available).

Also fetch `/s_load` for current demand MW context.

**Layout:**

- **Header:** "Peak Forecast" + signal dot (green if swing > 90D avg → strong BESS opportunity, amber if near avg, muted if below)
- **Hero metric:** `€{lt_daily_swing_eur_mwh}/MWh` in Unbounded (today's peak-trough swing)
- **Subtitle:** "Today's DA swing · Peak h{peak_hour} · Trough h{trough_hour}"
- **Peak/trough detail row:**
  ```
  ▲ Peak  h{peak_hour}  €{peak_price}/MWh
  ▼ Trough h{trough_hour} €{trough_price}/MWh
  ```
  Color peak in rose, trough in teal.
- **Tomorrow (if da_tomorrow exists and delivery_date is tomorrow):**
  Small section: "Tomorrow: peak €{lt_peak} · trough €{lt_trough} · spread {spread_pct}%"
- **vs 90D context:** If `spread_stats_90d` available: "Today vs 90D: P{percentile}" where percentile = where today's swing falls in spread_stats_90d.p10/avg/p90 range
- **Interpretation line:**
  - If swing > spread_stats_90d.p90: "Exceptional spread day — above 90th percentile of last 90 days"
  - If swing > spread_stats_90d.avg: "Above-average spread — favorable for 2-cycle dispatch"
  - If swing < spread_stats_90d.p10: "Compressed spread — limited arbitrage value today"
  - Else: "Normal spread conditions"
- **Source footer:** "Nord Pool via ENTSO-E · [timestamp]"

**v1 backlog:** Add 48h price curve sparkline using `hourly_lt[]` (today) + `da_tomorrow` hourly profile (needs worker to pass tomorrow's hourly array, not just summary stats).

### 1D — SpreadCaptureCard (`app/components/SpreadCaptureCard.tsx`)

**Replaces:** S8Card (interconnectors)

**Data:** Fetch `/read` via `useSignal`. Fields: `hourly_lt[]`, `hourly_se4[]`, `spread_eur_mwh`, `p_high_avg`, `p_low_avg`, `bess_net_capture`, `intraday_capture`. Also fetch `/s1/history` for the 14D sparkline of daily spread.

Check if `/s1/history` exists as an endpoint (similar pattern to `/s7/history`). Grep the worker for `s1_history` or `s1/history`. If it exists, use it for the sparkline. If not, compute a simulated sparkline from `spread_stats_90d` or defer the sparkline to v1.

**Layout:**

- **Header:** "Spread Capture" + signal dot (green if bess_net_capture > 150, amber 80–150, rose < 80)
- **Hero metric:** `€{bess_net_capture}/MWh` in Unbounded (BESS net capture today)
- **Subtitle:** "4h cycle · Buy €{p_low_avg} · Sell €{p_high_avg}"
- **Today's price curve:** Render Sparkline component with `hourly_lt` (24 values). This IS available today. Highlight the peak/trough hours with color markers on the sparkline.
- **LT–SE4 spread context:** `Cross-border: €{spread_eur_mwh}/MWh` with directional arrow
- **14D sparkline (if history available):** Small sparkline of daily `bess_net_capture` values over last 14 days
- **Interpretation line:**
  - If bess_net_capture > 200: "Strong capture day — peak-trough spread supports 2+ profitable cycles"
  - If bess_net_capture > 100: "Moderate capture — single-cycle profitable at current stack"
  - If bess_net_capture < 50: "Thin margins — hold or flex to ancillary services"
  - Else: "Normal capture conditions"
- **Source footer:** "Nord Pool · [timestamp]"

**v1 backlog:** 14D history sparkline requires s1_history endpoint (write daily capture to KV rolling array, same pattern as s7_history).

---

## Part 2: Enhance Gas + Carbon cards

### 2A — S7Card sparkline

S7Card **already fetches** `/s7/history` in a useEffect (line ~62). Check if the Sparkline component is already rendered. If yes, this may already work — verify visually. If not:

- Import Sparkline from `./Sparkline`
- Extract `ttf_eur_mwh` values from history array: `history.map(d => d.ttf_eur_mwh)`
- Extract labels: `history.map(d => d.date)`
- Render `<Sparkline values={...} labels={...} rangeUnit="€/MWh" />` below the gauge/interpretation
- Cap to last 14 entries for visual clarity

If S7Card already has a working sparkline, just verify it renders and move on.

### 2B — S9Card sparkline

S9Card fetches `/s9/history` already (line ~55–71). Same pattern as S7:

- Extract `eua_eur_t` values from history
- Render Sparkline below the gauge/interpretation
- Cap to last 14 entries
- Add the €55/t BESS breakeven as a `p50` reference line on the sparkline (if Sparkline supports a reference line — check the component API)

---

## Part 3: Wire into page.tsx

### 3A — Update imports (page.tsx top)

Remove:
```tsx
import WindCard from './components/WindCard';
import SolarCard from './components/SolarCard';
import LoadCard from './components/LoadCard';
import S8Card from './components/S8Card';
```

Or if they're dynamic imports, replace accordingly.

Add:
```tsx
import RenewableMixCard from './components/RenewableMixCard';
import ResidualLoadCard from './components/ResidualLoadCard';
import PeakForecastCard from './components/PeakForecastCard';
import SpreadCaptureCard from './components/SpreadCaptureCard';
```

### 3B — Replace in tier3-grid (page.tsx lines 74–101)

Swap the card components in the grid. Keep the same wrapper divs and any existing styling classes. Grid order:

```
Row 1: RenewableMixCard | ResidualLoadCard | PeakForecastCard
Row 2: SpreadCaptureCard | S7Card | S9Card
```

### 3C — Update section heading if needed

The section is currently labeled "Structural Market Drivers" — keep this, it's accurate. The H2 description below it (if there's a subtitle) should change from listing wind/solar/demand to something like "Renewable mix, residual load, price spreads, and commodity signals driving Baltic BESS dispatch economics."

### 3D — Do NOT delete old card files

Add a retirement comment at the top of each replaced card:
```tsx
// Retired from homepage 2026-04-16. Replaced by [NewCard].tsx in Phase 3B.
// Kept for reference — contains per-country breakdown and trend logic.
```

Keep: WindCard.tsx, SolarCard.tsx, LoadCard.tsx, S8Card.tsx in the repo.

---

## Part 4: Styling

### Card anatomy rules (must match existing cards)

Read 2-3 existing cards (S7Card, S9Card, or any S-series card) to extract the exact styling pattern:
- Background: `var(--card-bg)` or equivalent token
- Border: `var(--border-card)` or similar
- Border-radius, padding, gap — match exactly
- Font assignments: hero numbers → `var(--font-display)` (Unbounded), labels → `var(--font-mono)`, interpretation → `var(--font-mono)` at smaller size
- Signal dot colors: use existing `--green`, `--teal`, `--amber`, `--rose` tokens
- NO raw hex/rgba anywhere. All colors via CSS variables.
- NO new CSS classes in globals.css unless genuinely needed (reuse existing card classes)

### Stacked bar (RenewableMixCard)

Simple inline CSS or CSS-in-component flexbox bar:
- Container: full width, 8px height, border-radius 4px, overflow hidden
- Three flex children with `flex: {percentage}`, background colors from tokens
- Labels below in DM Mono at small size

### Height consistency (V-09)

All 6 cards in the grid should have the same min-height. Check what existing cards use. If they don't have a shared min-height, add one to the tier3-grid children:
```css
.tier3-grid > div { min-height: 320px; }
```
Adjust the value based on the tallest card's natural height. The goal: no ragged grid edges.

---

## Part 5: Verify

### Build
- `npx tsc --noEmit` — clean
- `npm run build` — clean

### Visual
- `npm run dev` → scroll to Structural Market Drivers section:
  - 6 cards in a 3×2 grid
  - Row 1: Renewable Mix (with stacked bar), Residual Load (with per-country row), Peak Forecast (with peak/trough detail)
  - Row 2: Spread Capture (with 24h sparkline), Gas (with 14D sparkline), Carbon (with 14D sparkline)
  - All cards same height (no ragged grid)
  - No `var(--font-mono)` fallback visible (fonts rendering correctly)
  - Signal dots colored appropriately
  - Interpretation lines present and contextually correct
  - Source footers present

### Data
- All four new cards render real data (not NaN, not "undefined MW")
- Renewable % is plausible (typically 15–45% for Baltics)
- Residual load = load - wind - solar (verify math with the raw values visible in the card)
- Peak/trough hours are plausible (peak typically h17–h20, trough h03–h05 or h12–h14)
- Spread capture €/MWh matches what the Revenue Engine section shows (should be in the same ballpark)
- Gas and Carbon sparklines render with visible data points (not empty or flat line)

### Regression
- No broken imports (old card files still exist but aren't imported in page.tsx)
- Revenue Engine section (TradingEngineCard) still renders correctly
- Intel feed section still renders correctly
- Hero section unchanged
- No layout jump/gap in the page flow
- StickyNav links (if any point to structural drivers section) still work

---

## Commit + push

Single commit: `phase3b: structural drivers rebuild — renewable mix, residual load, peak forecast, spread capture`

Branch: `phase-3b-structural-drivers`
Push. Report compare URL. Don't run `gh pr create`.

---

## What NOT to do

- Don't add new worker endpoints — v0 uses existing data only
- Don't delete WindCard.tsx, SolarCard.tsx, LoadCard.tsx, S8Card.tsx — archive, don't destroy
- Don't add hourly genload history (that's v1 worker work)
- Don't change the Revenue Engine (TradingEngineCard) — different section
- Don't touch IntelFeed or any other section
- Don't add npm packages
- Don't use raw hex/rgba — tokens only
- Don't change S7Card's existing logic — only add sparkline if missing
- Don't change S9Card's existing logic — only add sparkline if missing
- Don't change the tier3-grid class name or the section's position in the page layout

---

## v1 backlog (log in end-of-session report, don't implement now)

1. **Hourly genload history** — worker writes hourly wind/solar/load to KV rolling array (same pattern as s7_history). Enables: 24h residual load sparkline (the midday V-shape), 7D renewable % sparkline
2. **Day-ahead hourly profile** — worker stores tomorrow's full 24h price curve (not just summary stats). Enables: 48h price sparkline in PeakForecastCard
3. **s1_history endpoint** — daily capture metrics to KV rolling array. Enables: 14D spread capture sparkline
4. **Per-source generation breakdown** — worker parses ENTSO-E A75 PsrType fields individually (wind, solar, nuclear, gas, hydro). Enables: accurate thermal breakdown (currently thermal = load - renewables, which ignores net imports)
5. **Nordic hydro tile** — revive S6 signal as 7th structural driver (per bucket3-rebuild-plan.md optional tile)

---

## Reference

- Visual audit: `docs/phases/visual-audit-2026-04-16.md` (V-03, V-09)
- Bucket 3 plan section 3: `docs/phases/bucket3-rebuild-plan.md` lines 85–144
- Current page layout: `app/page.tsx` lines 74–101
- Existing cards: `app/components/WindCard.tsx`, `SolarCard.tsx`, `LoadCard.tsx`, `S8Card.tsx`
- Kept cards: `app/components/S7Card.tsx`, `S9Card.tsx`
- Sparkline component: `app/components/Sparkline.tsx`
- useSignal hook: `app/hooks/useSignal.ts`
- S1 endpoint data: `/read` returns hourly_lt[], hourly_se4[], spread stats, da_tomorrow
- S7/S9 history: `/s7/history`, `/s9/history` endpoints
- Design tokens: `app/globals.css`
