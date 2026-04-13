# Hero Overhaul — Session Report

**Date:** 2026-04-10
**Branch:** `hero-baltic-map-overhaul`
**Commit:** `b8a3e53`

---

## Before / after

**Before:** Two-column grid with left value prop + right "Market Now" card showing "—×", "— MW", "Insufficient data". KPI tiles floating on a small map in the right column.

**After:** Full-bleed map section (720px desktop) with raster Baltic interconnect map as background canvas. Six glass-panel overlay clusters positioned at corners and edges. All data live from endpoints. Particles animated along cable paths.

Screenshots not captured this session (Chrome DevTools MCP not connected). Visual iteration deferred to next session.

---

## Six clusters — status

| Cluster | Status | Notes |
|---------|--------|-------|
| A — Wordmark | Built | 48px Unbounded, "Baltic flexibility market, live" tagline, source attribution |
| B — Hero live rate | Built | €537/MW/DAY hero number (72px DM Mono), delta vs base, annualised, 30d sparkline from /s1/capture history |
| C — Interconnector flows | Built | NordBalt + LitPol rows. LT↔LV row conditional on s8.ltlv_avg_mw field (not deployed yet). Tabular grid with arrow + name + MW + status word |
| D — Fleet breakdown | Built | Stacked horizontal bar (EE/LT/LV), country labels with %, total operational + pipeline, S/D ratio + phase chip + CPI |
| E — Scrolling ticker | Built | Full-width bottom strip, 15+ metrics from live endpoints, seamless loop at 60s period. prefers-reduced-motion shows static subset |
| F — Reference asset pill | Built | Centered bottom, "50 MW · 4H · 2028 COD · IRR 10.8% · EBITDA Y1 €6.1M" |

---

## Live data wiring

| Endpoint | Fields consumed |
|----------|----------------|
| `/s4/fleet` | sd_ratio, phase, cpi, baltic_operational_mw, baltic_pipeline_mw, eff_demand_mw, countries.{EE,LT,LV}.operational_mw/pipeline_mw/weighted_mw |
| `/revenue?dur=4h` | live_rate.today_total_daily, live_rate.base_daily, live_rate.delta_pct, live_rate.annualised, live_rate.as_of, project_irr, equity_irr, ebitda_y1, min_dscr, capex_eur_kwh, cod_year |
| `/read` | capture.gross_4h, capture.shape_swing, updated_at |
| `/s8` | nordbalt_avg_mw, litpol_avg_mw, ltlv_avg_mw (pending deploy), nordbalt_signal, litpol_signal |
| `/s1/capture` | history[].gross_4h (30 days for sparkline) |

**Unused data available for future iterations:**
- `/read`: bess_net_capture, spread_eur_mwh, lt_avg_eur_mwh, hourly_lt[]
- `/s4/fleet`: trajectory[], product_sd{}
- `/revenue`: years[], backtest[], monthly_y1[], matrix[]

---

## Motion implementation

| Animation | Library | Duration | Reduced-motion |
|-----------|---------|----------|----------------|
| Cable particles (18 circles) | GSAP MotionPathPlugin via useGSAP() | 4-14s based on |flow_mw| | Frozen (no animation) |
| Sparkline | Static SVG polyline | N/A | Same |
| Ring progress | CSS transition on stroke-dashoffset | 1.2s ease-out | Instant (no transition) |
| Ticker scroll | CSS @keyframes | 60s linear infinite | Static display |
| Project dot glow | SVG filter (feGaussianBlur) | Static | Same |

Performance notes: No runtime measurements this session (no DevTools). The GSAP particle animation uses 18 `<circle>` elements with MotionPath — lightweight. The SVG filter is applied per-element but with a simple 2-node graph (blur + merge). Sparkline is a static polyline, no animation.

---

## Impeccable critique pass

**Not run.** Chrome DevTools MCP not connected this session. Deferred to next session when screenshot iteration is possible.

---

## Known issues

1. **No screenshots taken** — Chrome DevTools MCP installed but not connected in this session. All coordinate positions are estimated from raster analysis, not verified against rendered output.

2. **Cluster overlap on narrow viewports** — Cluster F (reference asset pill at bottom-center) may collide with C (bottom-left) or D (bottom-right) at <1280px viewports. Needs viewport testing.

3. **Mobile layout not implemented** — Clusters are absolute-positioned for desktop. Below 768px they will stack incorrectly. Mobile needs separate layout work.

4. **LT↔LV flow not live** — Worker /s8 change written but not deployed. The third interconnector row in Cluster C is conditional and won't appear until deploy.

5. **Particle positions untested** — GSAP MotionPathPlugin particles start at their `<circle>` element's initial position, then animate along the path. Without visual verification, they may appear at (0,0) briefly before the animation starts. May need initial transform or visibility:hidden until GSAP takes over.

6. **SVG preserveAspectRatio alignment** — Using `xMidYMid slice` on the SVG overlay to match `background-size: cover` on the raster. These should align but haven't been visually verified. If they drift, the cable paths won't align with the visible cables on the raster.

---

## Open questions for Kastis

1. **Deploy /s8 worker change?** Three new fields (ltlv_avg_mw, ltlv_signal, updated interpretation). Purely additive. Ready to deploy on your say.

2. **Cluster F (reference asset pill) position** — currently bottom-center, between C and D. It may be too close to the ticker. Should it move above the ticker, or should it merge into Cluster D (fleet breakdown)?

3. **Sparkline in Cluster B** — currently 30d capture history (daily gross 4h). Should it instead show the revenue trend (daily total from live_rate), or is DA capture the right metric for the sparkline?

4. **Ticker content priority** — 15+ items currently scroll. Are there any items that should be removed (too detailed for hero) or added (missing important metrics)?

5. **Vignette strength** — the radial gradient darkens edges to improve text readability. This may obscure the map's geographic detail at the corners. Adjustable per-theme. Want more or less?

6. **Hero height** — currently `clamp(480px, 60vh, 720px)`. At 1080p this is about 648px. At 1440p it's 720px. Is this the right proportion for the page opening, or should it be taller/shorter?

---

## What is NOT done

- Chrome DevTools MCP screenshot iteration (Steps 4-5)
- Impeccable critique/polish pass (Step 5.4-5.5)
- Mobile layout
- Integration into app/page.tsx (separate session)
- Worker /s8 deployment (awaiting approval)
- EstLink cable (no data yet)
- Number count-up animation on mount (Motion useMotionValue — deferred, static numbers work fine)

---

## Preview

```bash
cd ~/kkme && git checkout hero-baltic-map-overhaul
npx next dev -p 3000
# Open http://localhost:3000/dev/hero-preview
```
