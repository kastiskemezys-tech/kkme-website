# Chart Discipline Audit — 2026-03-27

## Objective
Make every chart/visual element on kkme.eu clearer, more honest, and more decision-useful.

## Changes Made

### 1. CLAUDE.md — Permanent chart discipline rules added
New section "Chart and visualization discipline (binding)" covering:
- Axes and scale requirements (min/max markers, reference lines, percentage labels)
- Legend requirements (color must always be explained)
- Statistical honesty rules (no misleading truncation, no false precision)
- Color rules (CSS variables only, no hardcoded hex/rgba in charts)
- Chart sizing and responsiveness minimums
- Freshness/provenance requirements on chart data

### 2. Sparkline.tsx — Min/max range markers
**Problem:** Sparklines showed trend shape but no Y-axis scale. A reader could not tell if a line represented €5–€10 or €5–€500.
**Fix:** Added `showRange`, `rangeUnit`, `rangeDecimals` props. When enabled, renders min/max value labels on the left edge of the chart with a 48px left margin in the SVG viewBox.
**Also fixed:** Default color changed from hardcoded `#4ade80` to `var(--teal)`.

### 3. S1Card.tsx — Chart axis context
**Problem:** 200px sparkline had no Y-axis scale. P50 dashed line was unexplained.
**Fix:**
- Enabled `showRange` with `rangeUnit="€"` on the primary sparkline
- Added median label in the chart footer bar: `┄ median +X€`

### 4. S2Card.tsx — Trajectory chart clarity
**Problem:** No Y-axis label, no legend for phase colors, CPI label cryptic ("CPI (modeled)" at 0.45 opacity).
**Fix:**
- Added rotated Y-axis label "S/D ×" on the left edge
- Added 24px left padding to make room for the label
- Replaced cryptic CPI footer with a proper phase color legend: ■ Scarcity / ■ Tightening / ■ Saturated
- Added "CPI = capacity price index (modeled)" explanation inline

### 5. S4Card.tsx — Stacked bar percentage labels + legend
**Problem:** Stacked horizontal bar had no percentage labels inside segments. Legend below had no color indicators.
**Fix:**
- Added percentage labels inside each bar segment (only shown when segment > 12% width to avoid cramping)
- Added colored ■ squares to the legend labels below the bar

### 6. BalticMap.tsx — Flow direction legend
**Problem:** Green = export, amber = import, but this was never stated on the map.
**Fix:** Added compact legend below the map: `→ LT export` / `→ LT import`

### 7. Hardcoded chart colors → CSS variables
**Problem:** S6, S7, S9 sparklines used hardcoded hex colors (#6fa3ef, #f6a35a, #c084fc). S6 FillBar used hardcoded rgba().
**Fix:**
- Added `--series-hydro`, `--series-gas`, `--series-carbon` tokens to globals.css
- Updated S6Card, S7Card, S9Card to use `var(--series-*)` references
- Updated S6 FillBar to use `var(--amber-bg)` and `var(--teal-bg)` instead of raw rgba()
- Fixed S3Card impact line from hardcoded `rgba(0,180,160,0.65)` to `var(--teal-medium)`

## Verification
- `npx tsc --noEmit` — clean (zero errors)
- `npm run build` — clean (compiled in 8.7s, 4 static pages generated)
- Dev server starts and serves on port 3847

## What Remains (not fixed in this pass)

### Needs larger redesign (not suitable for targeted edits)
1. **S6 FillBar shimmer animation** — uses CSS `water-shimmer` keyframes, which is a looping animation. CLAUDE.md says "Animation ONLY on state changes." This is a design decision, not a chart fix.
2. **BulletChart threshold labels** — 8px font size, potentially below readability floor. Used only in S5 which is demoted. Low priority.
3. **S5 hero glow effect** — uses hardcoded rgba() for box-shadow. S5 is demoted, not worth refactoring.

### Data/methodology gaps (not code issues)
4. **S3 cost direction arrows** — hardcoded quarterly editorial assessment. No automated signal. This is by design per CLAUDE.md.
5. **S3 cost breakdown percentages** — 62%/27%/11% split is hardcoded with no source citation in the code. Source is stated in the drawer methodology text.

### Low-priority polish
6. **Sparkline hover tooltips** — use `<title>` elements which have poor mobile/touch support. Would require a custom tooltip overlay.
7. **BalticMap arc colors** — still use literal rgba() for export/import arc strokes. These are data-semantic colors that stay consistent across themes, so this is an acceptable exception per CLAUDE.md.
8. **S6 FillBar scale marks** — "0% 50% 100%" at 0.65rem font. Below 13px minimum, but this is a decorative scale mark not primary readable text.

## Files Changed (11)
| File | Lines changed | Category |
|------|--------------|----------|
| CLAUDE.md | +35 | Rules |
| Sparkline.tsx | +39 -2 | Component |
| S1Card.tsx | +8 | Chart labels |
| S2Card.tsx | +24 -5 | Chart labels/legend |
| S4Card.tsx | +12 -6 | Bar labels/legend |
| BalticMap.tsx | +13 | Legend |
| S6Card.tsx | +5 -5 | Color tokens |
| S7Card.tsx | +1 -1 | Color tokens |
| S9Card.tsx | +1 -1 | Color tokens |
| S3Card.tsx | +1 -1 | Color tokens |
| globals.css | +5 | Token definitions |
