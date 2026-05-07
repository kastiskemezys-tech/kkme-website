# Phase 18.2.2 — Chart crosshair UX hotfix

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~30–60 minutes, single PR, two pause points (Pause A discovery, Pause B implementation + local-build smoke-test + commits). Frontend-only, no worker deploy. **Smaller than typical phase.**

**Operator framing:** Phase 18.2 shipped chart editorial polish 2026-05-06 — chart.js fonts to IBM Plex Mono + Newsreader, sentinel-line constants, Newsreader italic ref-line callouts, chart aria-labels, and the `makeCrosshairPlugin(colors)` that draws a vertical line on hover. Operator hard-refresh feedback: "Hover works only on lines, it should be more like I see the + across the whole chart when I hover. Not only on the lines and the peaks since the chart is small and it's hard to find it."

Two specific UX gaps:
1. **Crosshair only fires when cursor is near a data point.** chart.js default is `intersect: true` — tooltip + crosshair only activate on points. Should fire whenever cursor is anywhere over chart canvas.
2. **Crosshair is vertical-only.** Bloomberg / Stripe / Datadog use a "+" pattern (vertical at cursor X + horizontal at cursor Y). The horizontal line helps read value at cursor position.

Reference UX pattern (operator's request): "+" crosshair following cursor anywhere over chart area, not just on data points.

---

## What ships

3 sub-items, single PR, scope-tight.

1. **`interaction: { mode: 'index', intersect: false, axis: 'xy' }` on all chart options.** This makes chart.js tooltip + hover events fire whenever cursor is anywhere over chart canvas, not just when intersecting a point. Currently chart options likely have `mode: 'index'` but default `intersect: true`. Locate central spot in `chartTheme.ts` (or per-component if not centralized) and apply globally.

2. **Extend `makeCrosshairPlugin(colors)` in `chartTheme.ts` to draw horizontal line.** Currently draws only vertical line at cursor X. Add horizontal line at cursor Y using same color/opacity tokens. Together they form "+". Use chart.js's `chart.tooltip._eventPosition` or `chart.scales.x.getPixelForValue(...)` etc. to get cursor coordinates within chart area. The plugin's `afterDraw` hook already has access to chart context.

3. **Optional polish — slight visibility lift for small charts.** Current crosshair color is `colors.textMuted` per Phase 18.2 (low-key by design). On small charts (S1Card sparkline, S2Card monthly trajectory), this can be hard to see. Consider: brighten to `colors.textSecondary` OR thicken slightly to 1.2px from 1px. Operator-decide at Pause A based on feel.

`model_version` does NOT bump. No worker, no engine, no test logic changes (existing tests should pass; possibly +1 spec for plugin-extension assertion).

---

## OUT of scope

- Engine / worker changes
- Phase 18.3 (animation activation)
- Phase 19 (a11y MVP)
- Phase 20 (IA pages)
- Phase 18.1.1.1 (chunk error investigation for mobile map redesign re-ship)
- Phase 18.2.1 (Baltic palette retune — separate cross-cutting phase)
- Phase 7.7g-a-3 (typography rationalization)
- Phase 7.7g-b reduced (component primitives)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)

---

## Read first

1. `CLAUDE.md` — discipline rules
2. `docs/handover.md` Session 47 (Phase 18.2 SHIPPED — recent crosshair plugin context)
3. `docs/phases/_post-12-8-roadmap.md` — currently-active section
4. `app/lib/chartTheme.ts` — `makeCrosshairPlugin(colors)` factory at ~line 140-159 (per Phase 18.2 commit `c11cbe5`); CHART_FONT + CHART_FONT_DISPLAY + SENTINEL_DASH constants
5. Any of the 9 chart components from Phase 18.2's wiring (S1Card / S2Card / RevenueBacktest / RevenueCard.DegradationChart / RevenueCard.CannibalizationChart / RevenueCard.RevenueChart / TradingEngineCard.HourlyChart) to verify how interaction options are currently set

Memory references (Cowork-side):
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Phase 18.1.1 broke prod via `ChunkLoadError`; Phase 18.2.2 touches chart.js Canvas like 18.2 did, so the local-build verification gate at Pause B is REQUIRED
- `feedback_canvas_chartjs.md` — CSS vars silently fail in Canvas 2D; resolve via getComputedStyle
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-18.2-merge commit. State understanding (one paragraph): which crosshair plugin spot to extend, where interaction options currently live, expected blast radius. Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-2-2-crosshair-ux
npx tsc --noEmit       # 0 errors
npx vitest run          # 924/925 (1 pre-existing freshness boundary failure unchanged)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers.

---

## 2. Pause A — Discovery + scope confirmation

### 2a. Locate interaction options

```bash
grep -nE "interaction:\s*\{|intersect:" app/lib/chartTheme.ts app/components/S1Card.tsx app/components/S2Card.tsx app/components/RevenueBacktest.tsx app/components/RevenueCard.tsx app/components/TradingEngineCard.tsx
```

Identify:
- Whether `interaction` is centralized in `chartTheme.ts` (single fix) OR per-component (need ~9 edits)
- Current `intersect` value (default true per chart.js, or already set false somewhere?)
- Current `mode` (likely `'index'` per existing tooltip/crosshair setup)

### 2b. Audit makeCrosshairPlugin

```bash
sed -n '130,175p' app/lib/chartTheme.ts
```

Read the plugin end-to-end. Identify:
- Where it currently draws the vertical line (`afterDraw` hook + ctx.beginPath / ctx.moveTo / ctx.lineTo)
- How it gets cursor X coordinate (probably `chart.tooltip._eventPosition.x` or `chart.tooltip.dataPoints[0].element.x`)
- How to extend to also get cursor Y (likely `chart.tooltip._eventPosition.y` — verify chart.js version supports this)
- Color/opacity tokens it uses (per Phase 18.2: `colors.textMuted` likely)

### 2c. Visibility test — current vs proposed

Build mental model: with `intersect: false`, the tooltip fires whenever cursor is anywhere in chart area. The crosshair plugin's gate `tooltip.opacity > 0` will then fire continuously on hover. The horizontal line addition draws at cursor Y. Result: full "+".

Edge cases to think through:
- Multi-series charts: tooltip may show all series at the cursor X. Crosshair vertical at that X is correct. Horizontal at cursor Y is independent of which series — that's the UX gain (operator can read value at cursor regardless of series proximity).
- Bar charts: tooltip with `intersect: false` shows nearest bar. Crosshair vertical at the bar's center; horizontal at cursor Y. Should look natural.
- Sparklines / dense charts: small canvas; the horizontal line is the bigger win there (helps read Y values when bars are tall and close together).

### 2d. Visibility lift decision

Proposed alternatives for "small chart" visibility:
- (a) No change — keep `colors.textMuted` for both lines; trust user habituation
- (b) Brighten to `colors.textSecondary` for both lines globally
- (c) Brighten only on charts known to be small (S1.Sparkline, S2.MonthlyTrajectory) via per-instance plugin call
- (d) Thicken to 1.2px globally; keep color
- (e) Both: brighten + thicken slightly

Recommend (a) for first ship — minimal change, see how operator feels. If still hard to find, file 18.2.3 with brighter/thicker variant. Operator decides at Pause A.

### Pause A report

Halt + report:

1. **Interaction-options location** — centralized in chartTheme.ts vs per-component (impacts blast radius)
2. **Plugin extension shape** — how to access cursor Y coordinate; expected lines added (~10-15)
3. **Visibility lift pick** — (a) keep / (b) brighten / (c) per-chart-size / (d) thicken / (e) brighten+thicken
4. **Refined estimate** vs prompt's ~30-60min
5. **Local-build risk pre-check** — chart.js + Canvas + plugin extension only; no new deps; risk LOW. Pause B verification gate still required.

Wait for explicit operator "proceed" before §3.

---

## 3. Implement + Pause B foundation gates + local production build

### 3a. Apply changes per Pause A approval

1. **Interaction options** — set `interaction: { mode: 'index', intersect: false, axis: 'xy' }` in central spot OR per-component. Don't break existing point-hover behavior — `intersect: false` should be additive (tooltip still highlights nearest point at the X position).

2. **Crosshair plugin extension** — extend `makeCrosshairPlugin(colors)` in `chartTheme.ts` to draw horizontal line. Pattern:
   ```ts
   afterDraw(chart) {
     const tooltip = chart.tooltip;
     if (tooltip.opacity === 0) return;
     const ctx = chart.ctx;
     const cursorX = tooltip._eventPosition?.x ?? tooltip.caretX;
     const cursorY = tooltip._eventPosition?.y ?? tooltip.caretY;
     const { top, bottom, left, right } = chart.chartArea;
     ctx.save();
     ctx.strokeStyle = colors.textMuted;
     ctx.lineWidth = 1;
     // vertical line (already exists)
     ctx.beginPath();
     ctx.moveTo(cursorX, top);
     ctx.lineTo(cursorX, bottom);
     ctx.stroke();
     // horizontal line (NEW)
     ctx.beginPath();
     ctx.moveTo(left, cursorY);
     ctx.lineTo(right, cursorY);
     ctx.stroke();
     ctx.restore();
   }
   ```
   Verify chart.js version's tooltip._eventPosition shape. If not available, fall back to chart.js Plugin event hooks (e.g., onHover handler attached via chart.options).

3. **Visibility lift** — apply per Pause A pick.

### 3b. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 924/925 (or +/- per spec additions)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 3c. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

```bash
npm run build
npx serve@latest out -l 3100  # or equivalent local-static-server per project's setup
```

Verify (curl-based, since chrome MCP may be locked per Phase 18.2 pattern):
- Home page returns HTTP 200
- All JS chunks referenced in HTML return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Bundle size delta near-zero (chart plugin extension is ~15 lines)

If chrome MCP is available:
- Open localhost:3100 in chrome MCP at 360px AND 1440px viewports
- Hover over a chart; confirm crosshair "+" appears anywhere over canvas (not just on points)
- Confirm both vertical AND horizontal lines render
- Confirm tooltip still works correctly with intersect: false
- Confirm no console errors / no hydration warnings

If chrome MCP locked:
- Curl-only verification (per Phase 18.2 precedent)
- Operator does visual confirmation post-merge

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason
- Local production build smoke-test: PASS / FAIL
- Bundle size delta
- Visual verification: chrome MCP done / curl-only / deferred
- Light + Dark theme toggle still works

Wait for explicit operator "proceed" before §4.

---

## 4. Pause C — Commits + push

### 4a. Commits

Single commit (small phase) or 2-commit structure (separating plugin from interaction options):

```bash
git add app/lib/chartTheme.ts
git commit -m "phase-18-2-2(crosshair): extend makeCrosshairPlugin to draw + pattern (vertical + horizontal); interaction.intersect=false on all chart options"

git add docs/handover.md
git commit -m "phase-18-2-2(handover): Session 48 + crosshair UX hotfix per operator hard-refresh feedback"

git push -u origin phase-18-2-2-crosshair-ux
```

(Adjust file groupings per actual touched set.)

Print PR-creation URL.

---

## 5. Handover Session 48

Mirror Session 47 structure. Specific items:
- Headline: chart crosshair UX hotfix; "+" pattern (vertical + horizontal) following cursor anywhere over chart canvas
- Branch + base
- Pause A audit results (interaction location centralization status)
- Pause B verification gates (paste actual numbers + local-build smoke-test)
- Per-fix description
- Bundle size delta
- Visibility lift pick rationale
- Visual audit status (chrome MCP vs curl)
- Out of scope reminder
- Tier 1 sequence: 18.2.2 ✅ → next CC pick across (18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20 / 18.1.1.1 / 18.2.1)
- Next operator action: open PR via web UI; merge; hard-refresh kkme.eu mobile + desktop dark + light to confirm "+" crosshair

---

## 6. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.2.2 → Shipped appendix
- Currently-active update: 18.2.2 SHIPPED; next CC across (18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20 / 18.1.1.1 / 18.2.1)

Operator applies via Cowork.

---

## 7. Notes on judgment calls

- **Discipline rule #1 (audit-triage):** verify the crosshair plugin shape before extending. The plugin SHOULD have an `afterDraw` hook drawing one line; if implementation differs, adapt the extension accordingly.
- **Local-build verification at Pause B is REQUIRED**, not optional. `feedback_local_build_verification.md` lesson is fresh. Don't skip even though delta is small.
- **Canvas 2D resolves NO CSS vars** (memory `feedback_canvas_chartjs.md`). Pass color values as literal strings already-resolved via `getComputedStyle()`.
- **`prefers-reduced-motion`** — crosshair is static (not animated), so no concern. If you add any transition (e.g., fade-in on hover), honor reduced-motion.
- **Tornado SVG chart** is excluded — it's an inline SVG, not a chart.js Canvas chart; the crosshair plugin doesn't apply. Skip silently.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete. Per memory `feedback_pr_workflow_minimal.md`.

End of prompt.
