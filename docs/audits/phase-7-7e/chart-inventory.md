# Phase 7.7e UI — Chart inventory

Audit performed 2026-04-27 on branch `phase-7-7e-ui` cut from `main@56a3b5b`. Goal: enumerate every chart-bearing surface so the §3 migration order is exhaustive, not best-effort.

Tooltip-state vocabulary:
- **themed** — chart.js `useTooltipStyle` shared theme (S1/S2 baseline)
- **ad-hoc** — bespoke hover state, custom DOM/SVG positioning
- **native-title** — SVG `<title>` element only; appears on slow hover via the browser, not styled
- **none** — no tooltip surface at all
- **n/a** — chart has no per-point semantics (e.g., HeroRays decoration)

---

## A. chart.js cards (Line / Bar via `react-chartjs-2`)

| # | File | Component | Lib | Tooltip state | Time dim | Value type | Hover surface | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `app/components/S1Card.tsx:361` | DA capture line (top-of-card) | chart.js Line | themed via `useTooltipStyle(CC)` at `S1Card.tsx:79`, `:383` | hourly (24h) | €/MWh | full chart | ttStyle threaded through props; needs `external` callback to surface date+time+value+unit |
| 2 | `app/components/S1Card.tsx:462` | Drawer monthly bar | chart.js Bar | themed (`:477`) | monthly | €/MWh | full chart | currently uses `callbacks.label` only |
| 3 | `app/components/S2Card.tsx:537` | aFRR clearing line | chart.js Line | themed (`:575`) | hourly | €/MW/h | full chart | mirror of S1 pattern |
| 4 | `app/components/S2Card.tsx:622` | mFRR clearing line | chart.js Line | themed (`:660`) | hourly | €/MW/h | full chart | |
| 5 | `app/components/S2Card.tsx:707` | Drawer monthly bar | chart.js Bar | themed (`:722`) | monthly | €/MW/h | full chart | |
| 6 | `app/components/TradingEngineCard.tsx:217` | Dispatch decomposition bar | chart.js Bar | themed (`:177`) | hourly | €/MWh + MW | full chart | secondary axis MW; tooltip should surface both |
| 7 | `app/components/RevenueBacktest.tsx:144` | Realized vs forecast line | chart.js Line | themed (`:95`) | monthly | €/MW-yr | full chart | |
| 8 | `app/components/RevenueCard.tsx:484` (`DegradationChart`) | SOH retention curve | chart.js Line | themed (`:452`) | yearly | ratio | full chart | reference lines for 0.80 / 0.70; tooltip should label them |
| 9 | `app/components/RevenueCard.tsx:586` (`CannibalizationChart`) | Capture price decay | chart.js Line | themed (`:548`) | yearly | €/MWh | full chart | |
| 10 | `app/components/RevenueCard.tsx:888` (`RevenueChart`) | Annual revenue by stream | chart.js Line/Bar | themed (`:845`) | yearly | € | full chart | |
| 11 | `app/components/RevenueCard.tsx:935` (`DSCRChart`) | Monthly DSCR bar | chart.js Bar | `tooltip: { enabled: false }` (`:937`) | monthly | × ratio | none | DSCR uses covenant-line plugin only; should adopt unified tooltip |
| 12 | `app/components/RevenueCard.tsx:1034` (drawer line) | Drawer detail line | chart.js Line | `tooltip: { enabled: false }` (`:1043`) | yearly | MWh | none | small-multiples decoration; low priority |

All cards above thread `ttStyle` from a single `useTooltipStyle(CC)` invocation at the card root. Migration is centralized: extending `useTooltipStyle()` with an `external` adapter cascades the unified `<ChartTooltip>` to every consumer in one edit.

## B. Inline-SVG primitives (`<svg>` written by hand)

| # | File | Primitive | Tooltip state | Hover surface | Value semantics |
|---|---|---|---|---|---|
| 13 | `app/components/Sparkline.tsx:72` | Generic Sparkline (used by S6/S7/S9/SpreadCapture/HeroBalticMap-inline) | native-title via `<title>` (`:123`) | per-segment hover rects | day/value pairs (or value-only if no labels) |
| 14 | `app/components/primitives/DistributionTick.tsx:53` | Hairline distribution + today tick | none | none | percentile points (p25/50/75/90 + today) |
| 15 | `app/components/primitives/RegimeBarometer.tsx:62` | 5-zone regime needle | none (only `aria-label`) | none | regime label |
| 16 | `app/components/primitives/CredibilityLadderBar.tsx:70` | Tier bars | native-title via `title=` attr on `div` | row | label + MW + % of pipeline |
| 17 | `app/components/BulletChart.tsx:51` | Bullet w/ thresholds | native-title (`:73`, `:118`) | range bands + value | label + value + unit |
| 18 | `app/components/RevenueSensitivityTornado.tsx:64` | IRR Δpp tornado | native-title (`:102`) | per-bar | label + Δpp + absolute IRR |
| 19 | `app/components/HeroBalticMap.tsx:83` (inline `Sparkline` def, `:655` use) | 30D capture trend mini-spark | none | none | daily €/MW-day |
| 20 | `app/components/primitives/ImpactLine.tsx` | Sentiment text line | n/a | n/a | not a chart (label-only); inventory keeps it for completeness because the prompt named it, but no tooltip surface to migrate. |

## C. Custom hover-div threshold bars

| # | File | What | Tooltip state | Notes |
|---|---|---|---|---|
| 21 | `app/components/S9Card.tsx:124-170` | EUA carbon threshold bar | bespoke `showTip` panel | already inside-card-positioned; should adopt `<ChartTooltip>` shape so date+value+unit format matches sitewide |
| 22 | `app/components/S7Card.tsx:118` | TTF gas threshold bar | bespoke `showTip` panel (mirror of S9) | same migration pattern |

## D. Maps

| # | File | Surface | Tooltip state | Hover semantics |
|---|---|---|---|---|
| 23 | `app/components/HeroBalticMap.tsx:550-598` | Project dot hover (motion.div pop-out) | ad-hoc styled motion.div | name + MW + country + COD; cable hover present in INTERCONNECTORS rendering — see §3.4 of prompt |
| 24 | `app/components/BalticMap.tsx` | Country outlines + arc animation | none | decorative; no per-element data |

The "cable" tooltip in §3.4 of the prompt corresponds to the project-dot tooltip pattern at HeroBalticMap.tsx:567 — the existing implementation already has the right *placement* shape (absolute, motion.div, blurred bg), just not the unified data contract. Migration here is a content-routing edit: feed the ChartTooltip data shape, keep the existing motion + blur affordance, add `freshness` (Phase 12.7) as a `secondary` row when present.

## E. Hero / decorative SVG (out of scope)

| # | File | Why excluded |
|---|---|---|
| — | `HeroRays.tsx`, `CopyButton.tsx`, `ThemeToggle.tsx`, `SignalIcon.tsx`, `MetricTile.tsx` (icon SVGs) | Decoration / iconography only — no per-point data semantics, no hover→data surface. Not chart-bearing. |

---

## Migration order (proposed)

1. Build the primitive (`<ChartTooltip>` + `chartTooltip.ts` contract) and add the `external` adapter to `useTooltipStyle`. **One central edit lights up all 12 chart.js cards in section A.**
2. Migrate inline-SVG primitives in dependency order:
   - `Sparkline` first — it's reused by 4 cards (S6/S7/S9/SpreadCapture). Migrating it once cascades.
   - `BulletChart`, `RevenueSensitivityTornado`, `CredibilityLadderBar` — three independent inline-SVG charts.
   - `DistributionTick`, `RegimeBarometer` — primitives without current tooltip; new addition.
   - `HeroBalticMap`'s inline mini-Sparkline — replace with the shared `Sparkline` import (eliminates the duplicate definition).
3. Migrate custom hover-div threshold bars (S7/S9) — they already have a manual show-tip pattern; rewire to portal-mount `<ChartTooltip>`.
4. Migrate map cable / project tooltip (HeroBalticMap project-dot pop-out) — keep motion.div, swap content for the unified shape; surface `freshness` as a secondary row.
5. Add the three new visualizations to RevenueCard's AssumptionsPanel:
   - `RteSparkline` (consumes `roundtrip_efficiency_curve`)
   - `CyclesBreakdownChart` (consumes `cycles_breakdown` + `warranty_status`, replaces the v7.3 italicized note)
   - `CalibrationFooter` (consumes `engine_calibration_source`)
6. Capture before/after screenshots via chrome-devtools MCP across dark/light + mobile viewports.

This order keeps the radius of cascading edits maximally efficient: one `useTooltipStyle` extension covers section A, one `Sparkline` edit covers four downstream consumers in section B, and all the new RevenueCard sub-components are leaf additions that don't cascade.

## Pre-flight signals

- Branch: `phase-7-7e-ui` cut from `main@56a3b5b`. Working tree is the pre-existing untracked set (`logs/btd.log`, `.claude/skills/`, `docs/visual-audit/phase-7/`, etc.) per Sessions 19/22/23 convention; left untouched.
- Test baseline: **675 / 675** passing across 43 files (matches Phase 12.7 close-out).
- `npx tsc --noEmit`: clean.
- `bash scripts/diagnose.sh`: all worker signals fresh, all endpoints HTTP 200, frontend up.
- Production /revenue: `model_version: v7.3`, `roundtrip_efficiency_curve` = 18-element array, `cycles_breakdown` = `{fcr:16, afrr:80.8, mfrr:31.3, da:550, total_cd:1.86, total_efcs_yr:678}`, `warranty_status: within`, `engine_calibration_source` populated with all seven keys.

## Anomalies / non-obvious findings

- The HeroBalticMap defines its own `Sparkline` at `:83` (4 props: `data`, `w`, `h`) instead of importing the shared one. That's pre-existing tech debt — the migration can opportunistically delete it and use the shared `Sparkline` so a single component carries the unified tooltip.
- `ImpactLine` is in the prompt's primitives list but is a sentiment text line, not a chart. Treating it as out-of-scope for tooltip migration but documenting here so it shows up in the §7 Pause B audit.
- `RevenueCard.tsx:1043` and `:937` set `tooltip: { enabled: false }` deliberately — those small-multiple charts intentionally don't carry hover detail. Decision: leave them disabled rather than force tooltips where the design didn't want them.
- `engine_calibration_source` is **not yet** in the `RevenueData` interface at `RevenueCard.tsx:113-156`. Will need to add it as an optional top-level field for `CalibrationFooter` to consume.
