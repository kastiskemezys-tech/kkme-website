# Morning Fix Report — 27 Mar 2026

## 1. Fleet fix
- E energija corrected: 130MW → 60MW (matches Litgrid grid permit)
- Olana Energy Šalčininkai added: 70MW under_construction, COD 2026-Q4
- Operational: 305MW (E energija 60 + Kruonis 205 + AST 40)
- S/D ratio: 0.64, Phase: COMPRESS, CPI: 0.94

## 2. Signal freshness
- S1: updated 26 Mar 21:03 UTC (hourly_lt: 191 entries, LT avg €74.98)
- S2: updated 27 Mar 02:00 UTC — fresh, E energija shows 60MW
- S7: updated 27 Mar 04:00 UTC — TTF €55.37, regime HIGH
- Cron `__scheduled` POST returned 405 (Method Not Allowed — needs to be triggered by CF scheduler, not HTTP). S2/S7 already fresh from overnight cron run.

## 3. Graph fixes (TradingEngineCard)
### 24-hour revenue bars
- Added Y-axis with max value label and midpoint gridline
- Hour labels now every 3 hours (00, 03, 06... 21)
- Capacity opacity reduced to 0.4 (dimmer base), activation at full opacity (brighter upside)
- Arbitrage at full opacity amber/rose
- Minimum bar height 1.5px for nonzero values
- Legend with colour swatches + date label
- Left margin for Y-axis scale

### 7-day sparkline
- Expanded to 80px height (was 40px)
- Y-axis labels showing €min and €max values
- All 7 date labels on X-axis (formatted "27 Mar")
- Larger dots at data points (r=1.5 for extremes)
- Peak marker: ▲ €913/MW in teal
- Trough marker: ▼ €310/MW in rose
- Weekend background shading bands
- Midpoint gridline

## 4. S1 capture strip
Present and functional. Shows 24-cell charge/hold/discharge strip with legend and net capture value. Hour labels and legend were already included from Phase 3.

## 5. Trading engine card
Rendering correctly with all components: hero metric, sub-pills, FCR DRR badge, hourly bars, sparkline, DRR note, impact line, source footer, download links, details drawer.

## 6. Remaining work (not done this session)
- S1/S2/Revenue card chart readability improvements (Task 5-6 from spec) — deferred
- S1 capture strip hour label enhancement — deferred
- Cron manual trigger needs CF dashboard or wrangler command, not HTTP POST

## 7. Git log
```
80c1baf fix: graph readability — axes, labels, legends, min/max markers, weekend shading
9db75ff docs: Phase 3 build report
7d7a7ee feat: add dispatch revenue to SignalBar
7b7d4f7 feat: trading data CSV/JSON export endpoint + download links
6afc415 fix: replace loading text with shimmer skeletons across all cards
a4e5ae7 feat: BESS capture schedule strip on S1Card
663c669 feat: add Trading to StickyNav
802db50 feat: add TradingEngineCard to page layout
26e79f9 feat: TradingEngineCard component
```
