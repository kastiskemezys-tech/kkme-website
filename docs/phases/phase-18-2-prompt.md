# Phase 18.2 — Chart editorial polish

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~2–3 hours, single PR, three pause points (Pause A discovery, Pause B foundation + **local production build verification**, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** Phase 18 shipped the editorial visual identity 2026-05-06 with broadsheet masthead + footnote discipline + bracket-notation source markers. Phase 18.1 shipped mobile foundation. Phase 18.1.1 was reverted same-day after a `ChunkLoadError` broke production (lesson saved at `feedback_local_build_verification.md` — large new components / new dynamic imports / SSR boundary changes need `npm run build && npm run start` locally BEFORE merge). Charts on the live site still use chart.js + react-chartjs-2 defaults inconsistent with Phase 18's editorial direction: generic sans-serif axis labels, default chart.js tooltips, no Baltic palette, no crosshair on hover. Operator hard-refresh feedback after Phase 18.1.1: "charts are still not fixed, are these fixes coming?"

**Scope per spec P2-2** (`docs/specs/2026-05-06-designer-developer-spec.md`): chart.js fonts → IBM Plex Mono + Newsreader for axis labels, explicit Baltic palette, hover tooltips with crosshair, accessible aria-labels, sentinel-line treatment standardized, tornado pointer-events fix (verify if still applicable post-18.1.1-revert).

---

## What ships

5 sub-items, single PR.

1. **Chart axis label typography** — chart.js Canvas 2D doesn't resolve CSS variables (per memory `feedback_canvas_chartjs.md`); fonts must be passed as literal family names. Currently `app/lib/chartTheme.ts` may pass fonts via CSS var or as defaults — verify at Pause A. Migrate to: `'IBM Plex Mono'` for tabular numerics + axis tick labels, `'Newsreader'` for chart titles + descriptive captions. Match Phase 18's editorial typography lock.

2. **Explicit Baltic palette** — chart line colors / fill gradients / area shading should use Phase 18's tokens: deep teal `#1a3833` (positive), Baltic amber `#d4a574` (warning), brick `#a8324a` (negative/critical), neutral `--text-muted` for axes/gridlines. Resolve via `getComputedStyle()` in `chartTheme.ts` (or wherever the theme is computed) — chart.js Canvas can't read CSS vars directly.

3. **Hover tooltips with crosshair** — every chart gets a vertical crosshair line on hover (mobile: drag), tooltip card showing X label + every series value + delta where applicable. Use the existing `app/components/primitives/ChartTooltip.tsx` + `app/lib/chartTooltip.ts` patterns; extend if missing crosshair logic. Tooltip styling matches Phase 18's bracket-notation: monospace, narrow, no rounded corners, low-key.

4. **Sentinel-line treatment standardized** — across `S1Card.tsx` distribution chart, `S2Card.tsx` balancing chart, `RevenueBacktest.tsx` model-anchor dashed line: same dash pattern, same opacity, same color token, same hover behavior. Currently each component has its own treatment.

5. **Tornado pointer-events fix (if applicable)** — spec P2-2 claimed `RevenueSensitivityTornado.tsx` had `pointer-events: none` blocking interaction. Cowork-grepped 2026-05-07: no `pointer-events: none` found in current file. Verify at Pause A: if claim is REPRODUCIBLE (visual-inference vs current code), apply the fix; if NOT REPRODUCIBLE, mark in handover and skip.

`model_version` does NOT bump. No worker, no engine, no test logic changes (existing tests should pass; +1-3 specs likely if new tooltip helper or theme assertion added).

---

## OUT of scope

- Engine / worker changes
- Animation activation (Phase 18.3) — count-up tween + dormant keyframes is a separate phase
- A11y additions beyond chart aria-labels (Phase 19)
- Static IA pages / footer (Phase 20)
- Phase 18.1.1 chunk-error investigation (separate Phase 18.1.1.1 candidate)
- Mobile map redesign (Phase 18.1.1 reverted, separate re-ship)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- Type-scale rationalization (Phase 7.7g-a-3)
- Component primitives (Phase 7.7g-b reduced)
- New chart libraries / chart.js → recharts migration / similar
- "Copy data" button on charts (spec P2-3 — separate phase if pursued)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #4 cross-card consistency for chart styling, #5 roadmap edit-conflict, #6 no-editorial-state-label)
2. `docs/handover.md` Sessions 45 (Phase 18.1) + 46 (Phase 18.1.1 SHIPPED + REVERTED)
3. `docs/specs/2026-05-06-designer-developer-spec.md` — section P2-2 is design source-of-truth for this phase
4. `docs/phases/_post-12-8-roadmap.md` "Phase 18.2" entry — roadmap source-of-truth for scope
5. `app/lib/chartTheme.ts` — chart theme module (~189 lines per memory); resolve color vars + font family
6. `app/lib/chartTooltip.ts` + `app/components/primitives/ChartTooltip.tsx` — existing tooltip patterns; extend, don't replace
7. `app/components/S1Card.tsx`, `app/components/S2Card.tsx`, `app/components/RevenueBacktest.tsx` — chart sites with sentinel lines
8. `app/components/RevenueSensitivityTornado.tsx` — verify pointer-events claim
9. `app/components/RevenueCard.tsx` + `app/components/TradingEngineCard.tsx` — additional chart sites

Memory references (Cowork-side):
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Phase 18.1.1 broke prod via `ChunkLoadError`; Phase 18.2's chart.js work touches similar surface (third-party lib + Canvas 2D), so the local-build verification gate at Pause B is REQUIRED for this phase
- `feedback_canvas_chartjs.md` — CSS vars silently fail in Canvas 2D; must resolve via `getComputedStyle()` before passing to chart.js options
- `feedback_tailwind_v4_silent_drop.md` — hoist new @media rules into fresh blocks, never stack inside existing or multi-selector
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `reference_designer_dev_spec.md` — points at the saved spec doc

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -10
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-18.1.1-revert commit `f62d3f8` or descendant. Last code state is Phase 18.1 (mobile foundation) — check that `app/components/HeroBalticMap.tsx` does NOT have `MobileBalticMap` sub-component, that `globals.css` does NOT have band-aid removal, that `RevenueSensitivityTornado.tsx` does NOT have `viewBox` conversion (those were 18.1.1 artifacts, all reverted). State understanding (one paragraph). Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-2-chart-editorial-polish
npx tsc --noEmit       # 0 errors
npx vitest run          # baseline (post-revert; verify count — likely 925 minus any 18.1.1-specific specs that were reverted)
npm run lint            # baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. **Pre-commit at Pause B must pass not only these but also `npm run build && npm run start` smoke-test** (see Pause B for protocol).

---

## 2. Pause A — Discovery + scope confirmation

Per discipline rule #1 (audit-triage), re-verify each spec claim before scoping fixes:

### 2a. Current chart theme state

```bash
cat app/lib/chartTheme.ts | head -80
grep -n "fontFamily\|font-family\|color\|borderColor" app/lib/chartTheme.ts
```

Document:
- How fonts are currently passed (literal string vs CSS var attempt vs default)
- How colors are currently resolved (literal hex vs `getComputedStyle()` vs CSS var attempt)
- Which charts pull from `chartTheme.ts` vs which have their own inline configuration

### 2b. Per-chart-site inventory

For each chart-rendering component, identify:
- Which chart.js dataset config is in use (line, bar, scatter, etc.)
- Whether it imports from `chartTheme.ts` or has inline theming
- Current axis label font, color, sentinel-line treatment, tooltip configuration
- Whether `pointer-events: none` is set (spec P2-2 claim — verify)

```bash
grep -n "Chart\|<Line\|<Bar\|<Scatter\|chart.js" app/components/S1Card.tsx app/components/S2Card.tsx app/components/RevenueBacktest.tsx app/components/RevenueCard.tsx app/components/TradingEngineCard.tsx app/components/RevenueSensitivityTornado.tsx
```

### 2c. Tooltip/crosshair current state

```bash
grep -n "tooltip\|crosshair\|hover" app/lib/chartTooltip.ts app/components/primitives/ChartTooltip.tsx
```

Document:
- Whether crosshair logic exists or needs adding
- Whether tooltips use external (HTML-based) vs internal (Canvas-painted) rendering
- Whether the existing `ChartTooltip.tsx` primitive is wired to all 5+ chart sites or only a subset

### 2d. Tornado pointer-events claim

Empirically verify spec P2-2's claim that `RevenueSensitivityTornado.tsx` has `pointer-events: none`:

```bash
grep -nE "pointer-events|pointerEvents" app/components/RevenueSensitivityTornado.tsx
```

Cowork pre-grep showed NO matches 2026-05-07. If still no matches, mark NOT REPRODUCIBLE and skip §3.5. If matches found, document and fold into scope.

### 2e. Cross-card consistency map

Per discipline rule #4, before changing chart styling, identify which color tokens / fonts / dash patterns are used where. This determines whether the change is one-file (centralized in `chartTheme.ts`) or many-file (per-component overrides).

### Pause A report

Halt + report:

1. **Per-chart-site inventory** — table: site / chart.js config source / theme source / current font / current color / current sentinel-line / current tooltip
2. **Centralization opportunity** — can changes land in `chartTheme.ts` alone, or do components have inline overrides that need editing?
3. **Tornado pointer-events** — VERIFIED present (rare; fold in) / NOT REPRODUCIBLE (skip)
4. **Crosshair logic** — exists / needs to be added (estimate lines if added)
5. **Refined estimate** vs prompt's ~2-3h
6. **Local-build risk pre-check** — chart.js + react-chartjs-2 are existing deps (no new deps), so risk of ChunkLoadError pattern recurring is LOW; but still run the Pause B verification gate. If new deps emerge in scope, flag at Pause A.

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes. Suggested order:

1. **`chartTheme.ts` centralization** — fonts (literal `'IBM Plex Mono'` / `'Newsreader'`) + colors (resolved via `getComputedStyle()` inside the theme factory function). Make the theme a function `getChartTheme(themeMode: 'light' | 'dark')` if not already; cache via memoization (existing `chartThemeMemo` test suggests memoization exists).

2. **Per-component theme adoption** — wherever a chart imports `chartTheme.ts`, ensure it consumes the new font + color values. Wherever a chart has inline theming, refactor to consume `chartTheme.ts` (minimal scope, only if the component is in P2-2 scope). Don't refactor every chart in the codebase — scope creep risk.

3. **Sentinel-line standardization** — same dash pattern (`borderDash: [4, 4]` or per Pause A decision), same opacity, same color (probably `--text-muted` resolved). Apply across S1, S2, RevenueBacktest.

4. **Tooltip crosshair extension** — if crosshair doesn't exist in `ChartTooltip.tsx`, add it as a vertical line plugin. Honor `prefers-reduced-motion: reduce` if any transition is added.

5. **Tornado pointer-events fix** — ONLY if Pause A verified. Otherwise skip.

6. **chart aria-labels** — basic accessibility additions. Each chart wrapper element gets `role="img" aria-label="<descriptive summary>"` per spec P2-2. Honest brief: "S1 30-day price distribution: mean €113, P90 €203" generated from data.

For each:
- Read the file end-to-end first
- Verify chart.js Canvas 2D actually receives literal strings (not CSS var attempts that silently fail per memory `feedback_canvas_chartjs.md`)
- Check Light/Dark theme switching still works (chart theme should re-resolve on theme change)

---

## 4. Pause B — Foundation gates + LOCAL PRODUCTION BUILD

### 4a. Run all gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # baseline + N if new specs
npm run lint            # baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes; capture chunk count + bundle sizes
```

### 4b. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

This phase touches chart.js + react-chartjs-2 (existing deps but heavily used) + Canvas 2D rendering. Phase 18.1.1's ChunkLoadError lesson is fresh. Run:

```bash
npm run build && npm run start
# In a separate shell: open chrome MCP / chrome-devtools to localhost:3000
# Read console errors at 360px AND 1440px viewport
# Smoke-test: hover over charts, verify tooltips render, verify no ChunkLoadError
```

Specifically check:
- `console.error` for `ChunkLoadError` or any unhandled exception
- Chart axis labels render with the correct font (IBM Plex Mono / Newsreader)
- Chart colors render with the correct Baltic palette
- Tooltip + crosshair appear on hover
- Light + Dark theme switch doesn't break charts

If ANY error appears in localhost production-mode:
- Identify root cause via stack trace
- Fix in another iteration
- Re-run §4a + §4b until clean

If clean:
- Capture screenshots for visual audit at `docs/visual-audit/phase-18-2/`
- Proceed to Pause B halt + report

### 4c. Visual verification

Capture screenshots at `docs/visual-audit/phase-18-2/` covering:
- 5 chart sites × Light + Dark = 10 screenshots
- Hover state with tooltip + crosshair on at least 3 chart sites = 3 screenshots
- Total ~13-15 PNGs

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason / NOT NEEDED (Pause-A-disproved)
- Local production build smoke-test: PASS / FAIL (if FAIL, halt all commits and debug)
- Bundle size delta (expected near-zero — no new deps; chart theme inlining may shave bytes)
- Any new chart aria-labels added
- Cross-card consistency confirmation: same dash pattern + same color across S1/S2/RevenueBacktest
- Light + Dark theme switching verified for all chart sites

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Final visual audit

Confirm all screenshots captured. Cross-reference Pause A inventory: every chart site listed should have a Light + Dark screenshot. If gaps, capture missing.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/lib/chartTheme.ts app/lib/chartTooltip.ts app/components/primitives/ChartTooltip.tsx
git commit -m "phase-18-2(theme): chart.js fonts → IBM Plex Mono + Newsreader; explicit Baltic palette via getComputedStyle; crosshair plugin"

git add app/components/S1Card.tsx app/components/S2Card.tsx app/components/RevenueBacktest.tsx app/components/RevenueCard.tsx app/components/TradingEngineCard.tsx app/components/RevenueSensitivityTornado.tsx
git commit -m "phase-18-2(charts): theme adoption + sentinel-line standardization + chart aria-labels across N sites"

git add docs/handover.md docs/visual-audit/phase-18-2/
git commit -m "phase-18-2(handover): Session 47 + ~13-15 visual audit captures including local-build verification"

git push -u origin phase-18-2-chart-editorial-polish
```

(Adjust file groupings per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 47

Mirror Session 46 structure. Specific items:
- Headline: chart editorial polish; chart.js fonts + Baltic palette + crosshair tooltips + sentinel-line standardization across N chart sites
- Branch + base
- Pause A audit results (per-chart-site inventory + tornado pointer-events VERIFIED/NOT-REPRODUCIBLE)
- Pause B verification gates (paste actual numbers + local-build smoke-test PASS confirmation)
- Per-fix description + file:line
- Bundle size delta
- Visual audit screenshot inventory
- Light + Dark theme switching verified
- Out of scope reminder
- Tier 1 sequence: 18.2 ✅ → next CC pick across (18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20 / 18.1.1.1)
- Follow-ups filed (Phase 18.1.1.1 chunk-error investigation if not yet authored, etc.)
- Next operator action: open PR via web UI; merge; hard-refresh kkme.eu in mobile + desktop dark + light to verify

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.2 → Shipped appendix
- Currently-active update: 18.2 SHIPPED; next CC across (18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20 / 18.1.1.1)

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Spec P2-2 claims about pointer-events / crosshair / aria-labels need verification against current code state. Phase 18.1.1's ChunkLoadError reminded us that even green-CI ships can break prod — verify, don't assume.
- **Discipline rule #4 (cross-card consistency)** is load-bearing for sentinel-line treatment. Same dash + same color + same opacity across all charts. Centralize in `chartTheme.ts`.
- **Discipline rule #6 (no editorial chips)** applies to chart aria-labels. Aria-label content should be quantitative ("mean €113, P90 €203") not editorial ("price spike pattern").
- **Canvas 2D resolves NO CSS vars** (memory `feedback_canvas_chartjs.md`). Always resolve via `getComputedStyle()` in JS before passing to chart.js options. Test by checking the computed canvas in chrome-devtools.
- **Local-build verification at Pause B is REQUIRED**, not optional. `feedback_local_build_verification.md` lesson is fresh. Phase 18.2 touches third-party lib (chart.js) + Canvas rendering — same risk class as 18.1.1's MobileBalticMap. Don't skip.
- **Tailwind v4 silent-drop pattern** (memory): if any new `@media` rules added in `globals.css`, hoist into fresh blocks. Don't stack inside existing or multi-selector.
- **Out-of-scope drift risk:** Phase 18.3 (animation), Phase 19 (a11y beyond chart aria-labels), Phase 20 (IA pages), Phase 7.7g-b (component primitives) are all separate. Don't silently extend scope.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete. Per memory `feedback_pr_workflow_minimal.md`.

End of prompt.
