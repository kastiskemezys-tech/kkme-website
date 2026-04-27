# Phase 8 — Foundation Sprint (Session 2: extend primitives + visual atoms)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-8-foundation` off main (fresh — after Session 1's PR merges to main, the prior branch is dead).
**Estimated runtime:** 1.5–2 hours. Don't carry past 80% context.

**Read first, before anything else:**
1. `CLAUDE.md`
2. `docs/phases/upgrade-plan.md` — §1 (locked principles P1–P7), §1b (cross-cutting numerical rules N-1 through N-11), §2 Phase 8
3. `docs/phases/plan-audit-2026-04-26.md` — known scope notes (especially the "extend, don't rebuild" framing for Phase 8 primitives)
4. `docs/handover.md` — most recent entries cover Phase 7.6 close-out + Phase 8 Session 1
5. `app/components/primitives/` — read every existing primitive file end-to-end (`AnimatedNumber.tsx`, `ConfidenceBadge.tsx`, `DataClassBadge.tsx`, `DetailsDrawer.tsx`, `FreshnessBadge.tsx`, `ImpactLine.tsx`, `MetricTile.tsx`, `SectionHeader.tsx`, `SourceFooter.tsx`, `StatusChip.tsx`, `index.ts`)
6. `app/lib/freshness.ts` — F5-lite's freshness threshold helper (already global)
7. `app/lib/types.ts` — `DataClass`, `Sentiment`, `sentimentColor()` etc.

**One-sentence brief (P4 brand position):** *"Engineering schematic meets Baltic modernist editorial. Pixel/dot-grid as motif. Mono and serif as twin voices. Numbers are the heroes; everything else is supporting cast."*

**Scope (this session):**
- 8.3 Extend existing primitives (MetricTile, FreshnessBadge, DataClassBadge)
- 8.3b Add four new visual atoms (DistributionTick, RegimeBarometer, VintageGlyphRow, CredibilityLadderBar)
- 8.3c formatNumber + a11y utility
- 8.3d `<DataState>` 4-state primitive

**Out of scope this session:**
- 8.3e `<Term>` (deferred to Phase 7.8 — depends on /glossary content)
- 8.3f `<Cite>` (deferred to Phase 7.8 — depends on bibliography)
- 8.4 icon sprite (Session 3 — depends on Lucide React decision OR Kastytis Figma exports)
- 8.5 logo system (Session 3 — depends on Kastytis design assets)
- 8.6 design system pages (Sessions 4–5)
- 8.7 microbrand (Session 5)
- Card migrations (Phase 10)
- Replacing existing primitive consumers (Phase 10)

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — re-read §1, §1b, §2 Phase 8
3. `cat docs/phases/plan-audit-2026-04-26.md` — note the Phase 8 split into 5 sessions (this prompt is Session 2)
4. `cat docs/handover.md` — confirm Phase 8 Session 1 closed cleanly (token layer + typography ramp on main)
5. `git log --oneline -10` — confirm `main` has 8.1 + 8.2 commits (`763acf1` and `e89a053`)
6. `git checkout main && git pull`
7. `git branch -D phase-8-foundation 2>/dev/null; git checkout -b phase-8-foundation` (fresh branch — old one was merged)
8. `git status` — clean working tree
9. `bash scripts/diagnose.sh` — confirm prod still green
10. `npm test` — establish baseline (should be 141/141 from Session 1)
11. `npx tsc --noEmit` — clean

Read these files end-to-end before editing:
- `app/components/primitives/MetricTile.tsx` — the metric display primitive that 8.3 EXTENDS
- `app/components/primitives/FreshnessBadge.tsx` — extend with global helper from F5-lite
- `app/components/primitives/DataClassBadge.tsx` — confirm O/D/F/M coverage for vintage glyph
- `app/components/primitives/StatusChip.tsx` — reference for chip-style component pattern
- `app/lib/types.ts` — Sentiment + DataClass types (don't modify; consume)
- `app/lib/freshness.ts` — global freshness thresholds (consume)

Report state, pause for "go" before editing.

---

## 1. 8.3 — Extend existing primitives (~30 min)

Three existing primitives get optional new capabilities. Goal: backwards-compatible additions; existing card consumers don't break.

### 1.1 — `MetricTile` extension

Current API (read first to confirm): probably `value`, `unit`, `label`, `dataClass`, `size`. 8.3 adds:

- `fan?: { p10: number; p50: number; p90: number }` — when present, render a thin P10–P90 fan band behind the value (Phase 10.8 will use this for IRR/DSCR/payback)
- `sampleSize?: number` — when present, render a tiny `n=720` badge in the bottom-right corner (per N-4 cross-cutting rule)
- `methodVersion?: string` — when present, render a tiny `v7` superscript-style badge (per N-6)

Implementation rule: existing consumers passing only `value/unit/label/dataClass/size` continue to work unchanged. New props are additive.

### 1.2 — `FreshnessBadge` extension

The F5-lite helper at `app/lib/freshness.ts` already exposes the global thresholds. `FreshnessBadge` should:
- Import `freshnessLabel(updatedAt)` from the helper
- Render the LIVE / RECENT / TODAY / STALE / OUTDATED label with the right color from the threshold table
- Add absolute timestamp on hover (`<span title="2026-04-26 11:00 UTC">`)
- Drop any duplicated threshold logic in the component itself (single source of truth in the helper)

Existing consumers passing only `updatedAt` (or whatever the current API is) continue to work — this is a refactor to consume the helper, not an API change.

### 1.3 — `DataClassBadge` confirmation

Already exists. Verify it covers the full O/D/F/M alphabet (observed / derived / forecast / model). If `DataClass` type in `app/lib/types.ts` includes other values like `proxy`, `reference`, `editorial` — surface those too. Color-code per the brand palette (use the new `--mint` / `--lavender` etc. tokens from Session 1 where appropriate).

### Tests for 8.3

Create `app/lib/__tests__/metricTile.test.ts`:
- Renders without fan/sampleSize/methodVersion (backwards compat)
- Renders with fan present (assert P10/P50/P90 visible in DOM via `@testing-library/react` if available, else snapshot test)
- Renders with sampleSize and methodVersion
- Throws or returns null on missing required props

Create `app/lib/__tests__/freshnessBadge.test.ts`:
- Imports global helper, no duplicated threshold logic in the component
- Each threshold tier renders the right label
- Hover title attribute carries absolute UTC timestamp

If `@testing-library/react` is not installed, skip DOM rendering tests for now — write tests against the helper functions and the component's props-to-className mapping logic only. Don't add the dep in this session.

Commit: `phase-8(8.3): extend MetricTile + FreshnessBadge + DataClassBadge primitives`.

---

## 2. 8.3b — Four new visual atoms (~45 min)

Per visual review §1, these are the four shared atoms that account for ~70% of the new visual surface. All as new primitives in `app/components/primitives/` (or a sibling `app/components/atoms/` if cleaner — match existing convention).

### 2.1 — `<DistributionTick>`

```tsx
interface DistributionTickProps {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  max: number;
  today: number;
  width?: number;        // default 80
  height?: number;       // default 12
  ariaLabel?: string;
}
```

Renders a 1px hairline rule with a small tick marker showing where `today` sits across the min..max range. Optional faint markers for p25/p50/p75/p90. Used 50+ times site-wide once cards migrate. Pure SVG, no external deps.

Implementation tips:
- Map `today` to a 0..1 scale across `[min, max]`, position the tick at `width × scaled`
- p50 marker can be a slightly thicker tick than p25/p75
- Use `var(--text-muted)` for the rule, `var(--mint)` for the today tick
- Add `role="img"` + `aria-label` for accessibility

### 2.2 — `<RegimeBarometer>`

```tsx
type Regime = 'tight' | 'compressed' | 'normal' | 'wide' | 'stress';

interface RegimeBarometerProps {
  regime: Regime;
  width?: number;        // default 120
  height?: number;       // default 14
  showLabel?: boolean;   // default false
}
```

Horizontal bar with five regime zones (tight=coral, compressed=amber, normal=text-tertiary, wide=mint, stress=lavender), with a vertical needle marking the current `regime`. Per P1: color encodes data state, not editorial favorability.

Implementation:
- Five equal-width zones, faint backgrounds via the new `--coral` / `--amber` / `--mint` / `--lavender` tokens at low opacity
- Needle is a thin vertical mint line at the center of the active zone
- Active zone gets a slightly darker background

### 2.3 — `<VintageGlyphRow>`

```tsx
type Vintage = 'observed' | 'derived' | 'forecast' | 'model';

interface VintageGlyphRowProps {
  active: Vintage;
  size?: number;         // default 16 (16x16 pill)
}
```

A row of four 16×16 pills labelled O / D / F / M, with the active one filled with the matching token color. Standalone version of the vintage badge for cards where `MetricTile` is overkill but you still need provenance signaled.

This is a *small* component but used many times. Implementation should be ~50 lines of TSX.

### 2.4 — `<CredibilityLadderBar>`

```tsx
interface CredibilityLadderTier {
  label: string;
  mw: number;
  href?: string;        // optional click-through to source card
}

interface CredibilityLadderBarProps {
  tiers: CredibilityLadderTier[];   // ordered from most-aspirational to most-real
  width?: number;
  height?: number;       // per-tier height; total = tiers.length * height
}
```

Horizontal stacked bar from `intention → reservation → permit → grid agreement → construction → operational`, rendered as a descending funnel (each tier visually narrower than the one above it, scaled by MW). Reusable across pipeline cards, project counts, asset funnel.

Implementation:
- Each tier's width is proportional to its MW within the ordered set
- Color gradient from lavender (top, most-aspirational) → mint (bottom, most-real) via the semantic palette
- Hover shows `{tier.label}: {mw} MW · {percent}% of pipeline`
- Click on a clickable tier jumps to its `href`

### Tests for 8.3b

One spec per atom:
- `app/lib/__tests__/distributionTick.test.ts` — assert the today-tick is positioned correctly given fixture inputs (e.g., today=p50 lands at width×0.5)
- `app/lib/__tests__/regimeBarometer.test.ts` — each regime renders the right active zone
- `app/lib/__tests__/vintageGlyphRow.test.ts` — active vintage gets the right color token
- `app/lib/__tests__/credibilityLadder.test.ts` — tiers render in order, percentages sum to ~100, click handlers fire

Each spec should be 4–6 cases.

Commit: `phase-8(8.3b): four visual atom primitives — DistributionTick, RegimeBarometer, VintageGlyphRow, CredibilityLadderBar`.

---

## 3. 8.3c — `formatNumber` + a11y twin (~15 min)

Per N-2 (unit clarity) and the audit §6.7 (accessibility math):

Create `app/lib/format.ts`:

```ts
export type NumberKind =
  | 'capacity_mw'              // MW: no decimals < 100, 1 decimal otherwise
  | 'capacity_gw'              // GW: 2 decimals
  | 'price_eur_mwh'            // €/MWh: 1 decimal
  | 'price_eur_mw_h'           // €/MW/h: 2 decimals
  | 'price_eur_mw_day'         // €/MW/day: integer
  | 'price_eur_mw_yr'          // €/MW/yr: nearest 1k, formatted '€114k'
  | 'percent'                  // %: 1 decimal
  | 'percent_pp'               // pp: 1 decimal with +/- prefix
  | 'irr'                      // IRR as decimal -> 0.1pp percentage
  | 'multiple'                 // MOIC: 2 decimals with × suffix
  | 'ratio'                    // DSCR etc.: 2 decimals with × suffix
  | 'cycles_per_yr'            // cycles: integer
  | 'count'                    // counts: integer with thousands separator
  | 'ssh_pct'                  // capacity factor: integer %

export function formatNumber(value: number | null | undefined, kind: NumberKind): string {
  // null/undefined → 'n/a' or em-dash; per N-2, never render a unitless value
  // Each kind has a defined precision/unit-suffix rule
  // Implementation per the Number kind table above
}

export function formatNumberA11y(value: number | null | undefined, kind: NumberKind): string {
  // Returns screen-reader-friendly aria-label: "twelve point four euros per megawatt-hour"
  // (NOT abbreviated — screen readers say "E slash M W H" for €/MWh which is meaningless)
  // Each kind maps to a verbose unit phrase
}
```

Tests at `app/lib/__tests__/format.test.ts`:
- Each `NumberKind` has at least one case (correct precision + unit suffix)
- A11y twin produces verbose strings (test 5 representative kinds, not all 14)
- `null` / `undefined` return `n/a` consistently
- Edge cases: very large numbers, very small numbers, negatives

Commit: `phase-8(8.3c): formatNumber + a11y twin utility`.

---

## 4. 8.3d — `<DataState>` 4-state primitive (~20 min)

Centralizes the four states every data-driven component should display. Per audit §1.7, eliminates "card silently shows old numbers when feed fails."

```tsx
type DataStateStatus = 'loading' | 'ok' | 'stale' | 'error';

interface DataStateProps {
  status: DataStateStatus;
  ageHours?: number;            // for 'stale': "data is N hours old"
  errorMessage?: string;        // for 'error'
  retry?: () => void;           // for 'error'
  children: React.ReactNode;    // the actual data content (rendered when status === 'ok')
}
```

Renders:
- `loading` — skeleton bars (thin animated gradient placeholder, no spinner)
- `ok` — children pass-through
- `stale` — children rendered with a small amber dot in the corner + tooltip "data is X hours old"
- `error` — rose dot + retry link if `retry` is provided

This is a wrapper used by every card. Pre-positions for Phase 11.6 mobile data UX (which adds summary-stat-+-sparkline default + tap-to-expand on top of `<DataState>`).

Spec at `app/lib/__tests__/dataState.test.ts`:
- Each status renders the right visual class/element
- `stale` requires `ageHours`
- `error` retry button calls the callback
- `ok` renders children unchanged

Commit: `phase-8(8.3d): <DataState> 4-state wrapper primitive`.

---

## 5. Pause B — checkpoint

After all four commits land:
- `npm test` final tally — should be 141 baseline + ~28 new (4-6 per spec × ~6 specs) = ~165–175 tests
- `npx tsc --noEmit` clean
- `npx next build` clean
- `npm run dev` snapshot check: page should look identical to before. New primitives are loaded but no card consumes them yet.
- Push branch: `git push -u origin phase-8-foundation`
- Report to Kastytis with commit hashes, test counts, and a one-line note on each new primitive's API.

**Stop here.** Phase 8 Session 3 (icon sprite + logo system) requires Kastytis's design-asset decision (Q3 in `plan-audit-2026-04-26.md`) before launching. Author Session 3 prompt only after that decision lands.

---

## 6. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- **No card migrations.** Don't update S1Card / S2Card / etc. to consume the new primitives — Phase 10 owns that.
- **No `<Term>` or `<Cite>` primitives** — those live in Phase 7.8 alongside their content (glossary, bibliography).
- **No icon sprite, no logo system, no design system pages, no microbrand details.** Sessions 3–5.
- No new dependencies beyond what's already installed. `@testing-library/react` is NOT installed; if you reach for DOM-rendering tests, fall back to logic-only tests instead of adding the dep.
- The pre-existing untracked items in working tree (`logs/btd.log`, `.claude/skills/`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/`) are out of scope.
- If budget gets tight (>80%), commit at a clean boundary and write a continuation prompt at `phase-8-session-2b-prompt.md`. Don't ship half-built primitives.

**Numerical rules to enforce (cross-cutting from §1b of the master plan):**
- N-1 (vintage glyph mandatory) — DataClassBadge confirmation in 8.3 enforces this for primitives that surface monetary values
- N-2 (unit clarity) — formatNumber utility in 8.3c enforces this at the renderer level
- N-4 (sample-size N) — MetricTile extension in 8.3 supports the optional `sampleSize` badge
- N-5 (confidence interval on derived/forecast) — MetricTile extension in 8.3 supports the optional `fan` prop
- N-6 (methodology version stamp) — MetricTile extension in 8.3 supports the optional `methodVersion` badge
- N-7 (timestamp normalisation) — FreshnessBadge consumes the global F5-lite helper
- N-10 (math has unit tests) — every formula change ships with a Vitest spec, established in 7.6

---

## 7. After Session 2 ships

Update `docs/handover.md` with a Session 14 entry covering:
- 8.3 / 8.3b / 8.3c / 8.3d commits
- Test count: 141 → ~165
- Verification gates: tsc + next build + npm test all green
- Notes any deviations from this prompt (briefed at Pause A as required)

Update `docs/phases/upgrade-plan.md` § Session log §4 with one-line phase-completion entry: "Phase 8 Session 2 (extend primitives + visual atoms) shipped — 4 new primitives, formatNumber utility, all backwards-compatible."

Don't open a PR yet — accumulate Phase 8 work or split per-session per Kastytis's preference. He'll merge when ready.
