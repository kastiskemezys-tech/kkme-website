# Phase 7.7e UI — Sitewide chart-tooltip primitive + RevenueCard v7.3 visualizations + render-loop fix

Branch: `phase-7-7e-ui` → `dev` (then `main`)
Base commit: `56a3b5b` (post-Phase 12.7 PR #41 merge)
Test count: **675 → 766**

## What this ships

**Session 24 (2026-04-27, commit `6a70630` and earlier on this branch):**
- Sitewide `<ChartTooltip>` primitive at `app/components/primitives/ChartTooltip.tsx` + unified data contract at `app/lib/chartTooltip.ts` (date / time / value / unit / label / secondary / source).
- 24 chart-bearing surfaces migrated to the unified primitive across chart.js cards (S1, S2, TradingEngine, RevenueBacktest, RevenueCard's three sub-charts), inline-SVG primitives (Sparkline, BulletChart, RevenueSensitivityTornado, CredibilityLadderBar, RegimeBarometer, DistributionTick), custom hover-div threshold bars (S7 EUA carbon, S9 TTF gas), and the HeroBalticMap cable-hover layer.
- Three new RevenueCard sub-components surfacing the v7.3 engine's calibration narrative: `RteSparkline` (consumes `roundtrip_efficiency_curve`), `CyclesBreakdownChart` (consumes `cycles_breakdown` + `warranty_status`, replaces the v7.3 italicized note with a four-bar mini-chart), `CalibrationFooter` (consumes `engine_calibration_source`).
- Canonical `--cycles-{fcr,afrr,mfrr,da}` palette tokens in `app/globals.css` (lavender / teal / amber / blue) for site-wide reuse by any component rendering the four products.
- Anti-flash theme pattern preserved; no `model_version` bump; worker untouched.

**Session 25 (2026-04-29):**
Defect fix on top of Session 24. The Cloudflare Pages preview deploy on 2026-04-28 rendered S1Card's `<CardBoundary>` fallback with `Minified React error #185` ("Maximum update depth exceeded") after a real cursor hovered the sparkline canvas. Three commits (1, 2, 3 below) land the fix on the same branch.

The bug is **hover-driven, not paint-driven**. chart.js's `external` callback only fires when a real pointer is on the canvas. Once a cursor lands, `react-chartjs-2`'s internal `useEffect` (deps `[redraw, options, data.labels, data.datasets, updateMode]`) fires every commit because the migration pattern feeds fresh literal `options`/`data` into `<Line>`/`<Bar>`. With an active tooltip, `chart.update()` retriggers chart.js's tooltip plugin's `afterDraw`, which calls the registered `external` synchronously inside `componentDidUpdate` (commit phase). `external → setState → re-render → fresh options → useEffect → chart.update() → external → …` until React #185.

**Empirical render-count comparison (S1 Sparkline, 30 mousemoves @ 40ms, dev):**

```
Build                                         Sparkline renders   React #185?
-----                                         -----------------   -----------
Baseline (no fix)                             108                 yes — caught by <CardBoundary>
§1 only — useTooltipStyle memoized            108                 yes
§1 + §2 — handler memoized at S1 sites        108                 yes — handler stable, loop still cascades
§1 + §2 + central dedupe (this PR)            10                  no
```

The dedupe in `useChartTooltipState.setState` (commit 3) is the load-bearing loop-breaker — it lets React skip the re-render when the next tooltip state is value-equal to prev via the functional-updater bail-out pattern. The `useTooltipStyle` memo (commit 1) and per-site handler memos (commit 2) are necessary referential-stability guarantees behind the dedupe but don't on their own break the cascade.

## Commits in this PR

1. `chart-tooltip-memo: memoize useTooltipStyle returned options` — `chartTheme.ts` + canary test.
2. `chart-tooltip-memo: memoize external handlers at chart.js call sites` — 5 card files (10 sites total) + per-site canary test.
3. `chart-tooltip-dedupe: dedupe useChartTooltipState setState to break hover render-loop` — `ChartTooltip.tsx` + behavioural + canary tests. **Body embeds the empirical render-count table verbatim**; this is the load-bearing fix.
4. `handover: Session 25 — render-loop fix + audit + PR draft` — handover Session 25 entry, visual audit screenshots, this PR draft.
5. (Session 24's earlier commits on this branch — see `git log --oneline phase-7-7e-ui ^main`.)

## Verification

- `npm test`: **766/766** ✓
- `npx tsc --noEmit`: 0 errors ✓
- `npm run lint`: 38 errors (all pre-existing — pre-fix baseline was 42; my edits reduced 4, introduced 0)
- `npm run build`: exits 0, 5 routes prerendered to `./out` ✓
- Visual audit (real Chrome, dev `localhost:3000` + prod static `localhost:3001`): 30-mousemove sweep on S1 sparkline + 10–15 events across all 12 chart canvases; zero error boundaries, zero `Maximum update depth` text, zero new console errors after every sweep.
- Visual audit screenshots: `docs/visual-audit/phase-7-7e/` (Session 24's deliverables) + `docs/visual-audit/phase-7-7e-fix/` (Session 25's pre/post-fix sweep).
- Live preview deploy: refreshed on push to `phase-7-7e-ui`. `06-post-push-preview-s1-hover.png` captured against `https://phase-7-7e-ui.kastis-kkme.pages.dev` post-push — same 30-mousemove sweep on the S1 sparkline; 12 canvases mounted, errBoundaries=0, hasS185Text=false. (Preview deploy also emits ~50 CSP violations per page load for IntelFeed's `google.com/s2/favicons` image fetches against the Pages-side stricter `img-src 'self' data:` CSP — pre-existing on this branch, not introduced by Session 25, logged as backlog under Area=IntelFeed.)
- Sitewide canary: `app/lib/__tests__/chartTooltipShape.test.ts` (Session 24) + `chartHandlerMemo.test.ts` + `chartThemeMemo.test.ts` + `chartTooltipDedupe.test.ts` (Session 25).

## Out of scope (queued elsewhere)

- **Phase 7.7e data-contract** (Zod at `/revenue` boundary) — separate session, ~30–60 min.
- **Phase 7.7c Session 2** (capital-structure sliders) — gated on operator UX decision.
- **Phase 7.7e Engine** (aux temperature curve, terminal value, augmentation, market-physics).
- **Approach B perf optimization** — memoize chart.js `options` + `data` at every call site to eliminate spurious `chart.update()` calls on parent re-renders. Logged as backlog (Notion: Area=Cards, Type=Tech Debt, P3 Medium). Deferred because the dedupe-driven loop-breaker unblocks this PR and there is no empirical perf complaint.
- **Playwright (or chrome-devtools-MCP) smoke test for chart.js hover** — would catch a future regression of the render-loop class. Logged as backlog (Notion: Area=Cards, Type=Tech Debt, P3 Medium). Requires CI infra for headless Chrome.

## Notes for reviewer

The dedupe in `app/components/primitives/ChartTooltip.tsx::useChartTooltipState` is small but load-bearing. The contract is:

```ts
setStateRaw(prev => tooltipStateEqual(prev, next) ? prev : next)
```

If a future edit drops the `tooltipStateEqual` predicate, swaps it for shallow equality, or moves the dedupe out of the `useState` setter, the chart.js hover loop will return. The regression test in `app/components/primitives/__tests__/chartTooltipDedupe.test.ts` includes a source-text canary that asserts the exact pattern stays wired — and 26 behavioural specs that exercise the equality helpers and the bail-out semantics directly.

The same goes for `app/lib/chartTheme.ts::useTooltipStyle`'s `useMemo` wrapper — its dep array reads primitive color fields rather than the wrapper `colors` object so theme-equal re-renders don't bust the memo. `app/lib/__tests__/chartThemeMemo.test.ts` canaries this contract.

The `RevenueSensitivityTornado.tsx:62` lint error about conditional `useChartTooltipState` is **pre-existing** on this branch — not introduced by Session 25. It would be worth fixing in a follow-up but isn't blocking.

## Why no `gh pr create`

Per `CLAUDE.md`: operator opens PRs via GitHub web UI. This document is the body draft to paste into the GitHub PR description.
