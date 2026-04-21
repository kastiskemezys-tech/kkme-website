# Phase 7.5 — S1/S2 Polish Pass: Surfaces, Charts, Tables, Motion

**Written:** 2026-04-21
**Target:** Claude Code (YOLO mode) in kkme repo
**Depends on:** Phase 7 merged to main

## Context

Phase 7 rebuilt `app/components/S1Card.tsx` and `app/components/S2Card.tsx`
with correct Bloomberg-density anatomy and verified data. That phase fixed the
data layer; this phase fixes the visual layer.

From the browser eyeball pass on the Phase 7 output, the cards are functionally
strong but aesthetically flat:

- Cards, tables, drawers all live on one visual plane — no depth, no layering.
- Charts are default Chart.js — functional but unstyled.
- Tables read as spreadsheets, not curated information — no rhythm, no hierarchy.
- No motion language beyond AnimatedNumber tween.
- Negative space is uneven.
- No accent moments — everything at 70% volume.

Target aesthetic: **elegant, severe, disciplined** — Linear, Stripe dashboards,
Mercury, Graphite, Bloomberg Terminal at its best. Not Notion. Not Intercom.

## Scope

Five interventions. Each lands as its own commit on `phase-7-5-polish` branch.
No data logic changes. No new endpoints. No new components except where noted.

- **Intervention A** — Surface layering (tokens + apply to cards/drawers)
- **Intervention B** — Hero card choreography (the right-sidebar 50MW summary)
- **Intervention C** — Chart refinement (grid, ticks, gradients, annotations)
- **Intervention D** — Table rhythm (zebra, column typography, row height)
- **Intervention E** — Motion language (global tokens + applied animations)

## Non-scope

- Do not touch worker code. Data layer is locked.
- Do not change card anatomy (header → hero → status → interpretation → viz →
  impact → source → drawer). Only visual treatment.
- Do not rebuild the Baltic map in hero center. That's a separate phase.
- Do not touch S3/S4/tier-3 cards. S1/S2 only. (Exception: surface tokens are
  global — they will cascade, but don't modify other cards' structure.)
- Do not add new chart types. Only refine existing.

## Pre-work

1. Confirm Phase 7 merged to main:
   ```bash
   git log --oneline origin/main | head -5
   ```
   Should show the Phase 7 merge commit.
2. Branch from main:
   ```bash
   git checkout main && git pull
   git checkout -b phase-7-5-polish
   ```
3. Read `docs/handover.md` for current state (should have a Session 7 entry
   after Phase 7 shipped).
4. Locate design tokens:
   ```bash
   grep -rn "^  --" app/globals.css | head -40
   ```
   You need to know the existing token names before extending.
5. Read `app/lib/chartTheme.ts` to know the `useChartColors()` pattern — you'll
   extend this file with chart defaults.
6. Read the target files:
   ```bash
   wc -l app/components/S1Card.tsx app/components/S2Card.tsx
   ```
   Both should be under 450 lines post-Phase-7. Note exact counts before starting
   — you'll compare after each intervention to confirm the polish pass isn't
   bloating them.
7. `bash scripts/diagnose.sh` — confirm prod is healthy before touching anything.

## Rules that apply (from CLAUDE.md)

- Design tokens only — `var(--token-name)`, never raw `rgba()` or hex.
- Chart.js canvas colors via `useChartColors()` — canvas 2D cannot resolve CSS vars.
- Never cat the full worker (8029+ lines) — grep for endpoints.
- Verify with actual output before committing — screenshots or described viewport,
  compile checks, no `rgba(` matches in grep.
- Respect `prefers-reduced-motion: reduce` everywhere motion is added.

## Pause points

Three hard pauses. Wait for explicit "proceed" — don't infer approval.

- **Pause 1** — After reading existing tokens and components (Pre-work complete),
  before writing any new tokens. Report: what tokens exist, what names you propose
  to add, any collisions with existing names.
- **Pause 2** — After Interventions A + C + D land locally (surfaces, charts,
  tables). Before starting motion/hero. Report: diff summary, screenshots of
  S1/S2 cards in both light and dark mode at desktop + 375px mobile width.
- **Pause 3** — After all five interventions complete, all commits on branch.
  Before opening PR. Report: full diff summary, screenshot set, any token-drift
  grep results (`grep -rn "rgba(" app/components/S1Card.tsx` should return zero).

---

## Intervention A — Surface layering

**Goal:** Give cards and drawers visible depth. Page bg < card bg < drawer bg
(dark mode) or page bg > card bg > drawer bg (light mode).

### New tokens (add to globals.css)

```css
/* Dark mode */
[data-theme="dark"] {
  --surface-1: #0a0b0d;        /* page bg — near-black, slight cool */
  --surface-2: #111316;        /* card bg — ~4% lighter than surface-1 */
  --surface-3: #16191d;        /* drawer bg — interior of card */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-hairline: rgba(255, 255, 255, 0.12);
}

/* Light mode */
[data-theme="light"] {
  --surface-1: #f7f5f0;        /* page bg — warm off-white */
  --surface-2: #fbfaf6;        /* card bg — slightly lighter than page */
  --surface-3: #ffffff;        /* drawer bg — interior */
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-hairline: rgba(0, 0, 0, 0.10);
}
```

Tune the exact hex values against the existing palette — these are illustrative.
The rule: card must be visibly distinct from page, drawer must be visibly
distinct from card, but transitions must feel subtle (not chunky).

### Apply

- S1Card and S2Card container: `background: var(--surface-2); border: 1px solid var(--border-subtle); border-radius: 8px;`
- Drawer container: `background: var(--surface-3); border-top: 1px solid var(--border-hairline);`
- Hero metric sub-container (the €128.3 block): `background: var(--surface-3); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 6px;` — nested card effect

### Verification

- Screenshot both modes. The card should look like an object, not a paragraph.
- Toggle theme mid-page — no flash, no color pop.
- Grep: `grep -n "#[0-9a-fA-F]\{6\}" app/components/S1Card.tsx` should return zero
  (no hard-coded hex). Same for S2Card.

### Commit

`phase-7-5-polish: intervention A — surface layering tokens + apply to S1/S2 cards`

---

## Intervention B — Hero card choreography

**Goal:** Make the €128.3 hero metric feel heroic, not just big text.

**In scope:** The revenue summary card at top-right of the hero section (the one
showing "50 MW · 4H · 08:00 UTC" → €400 /MW/DAY → delta pill → sparkline). Both
S1Card and S2Card hero metric blocks get the same choreography treatment.

**Out of scope:** The center Baltic map, the left KKME logo block.

### Changes

Three-line block structure for hero metric:

```
[meta line]     50 MW · 4H · 08:00 UTC           [DM Mono, 11px, muted]
[hero number]   €128.3 /MWh                      [Unbounded, large, tabular]
[delta row]     ↓ 11% vs base · €146k /MW/YR    [inline sparkline + rose pill]
```

Typographic rules:

- Currency symbol `€` at 60% size of digits, vertically center-aligned to digit x-height.
- Unit suffix (`/MWh`) in DM Mono, 40% size of digits, muted color, tight tracking.
- All digits `font-variant-numeric: tabular-nums`.
- Delta arrow (↓↑) same size as value, color keys to direction (rose down, teal up).

Add a 2px-tall colored bar under the hero number that animates from 0 to 100%
width on mount (400ms, `--ease-out-quart`). Color keys to status regime:

- OPEN/HIGH → teal
- TIGHTENING/STABLE → amber
- COMPRESSED/LOW → rose

### Apply

- `app/components/S1Card.tsx` hero block
- `app/components/S2Card.tsx` hero block
- Top-right revenue summary card in hero section (find via `grep -rn "gross IRR" app/`)

### Verification

- AnimatedNumber tween still works (no regression).
- Colored bar animates in on mount.
- `prefers-reduced-motion: reduce` — bar appears at 100% width immediately, no animation.

### Commit

`phase-7-5-polish: intervention B — hero metric choreography + status bar accent`

---

## Intervention C — Chart refinement

**Goal:** Replace default Chart.js styling with a kkme chart theme.

### Extend app/lib/chartTheme.ts

Add a `getKkmeChartDefaults(colors)` function that returns a Chart.js options
object with these overrides:

```js
{
  plugins: {
    legend: { display: false },  // Most kkme charts don't need a legend
    tooltip: {
      backgroundColor: colors.surface2,
      titleColor: colors.textPrimary,
      bodyColor: colors.textSecondary,
      titleFont: { family: 'DM Mono', size: 11 },
      bodyFont: { family: 'DM Mono', size: 11 },
      padding: 10,
      cornerRadius: 4,
      borderColor: colors.borderHairline,
      borderWidth: 1,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: colors.textMuted,
        font: { family: 'DM Mono', size: 10 },
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 6,
      },
      border: { display: false },
    },
    y: {
      grid: {
        color: colors.chartGrid,
        lineWidth: 1,
        drawTicks: false,
      },
      ticks: {
        color: colors.textMuted,
        font: { family: 'DM Mono', size: 10 },
        padding: 8,
      },
      border: { display: false },
    },
  },
  animation: {
    duration: 800,
    easing: 'easeOutQuart',
  },
}
```

### Bar charts (S1 "DA gross capture by day", S2 fleet-vs-clearing)

- `borderRadius: { topLeft: 2, topRight: 2 }`
- `categoryPercentage: 0.82`
- `barPercentage: 0.92`
- Color: single teal for primary series, muted amber for secondary

### Line charts (S1 sparkline, S2 clearing history)

- Replace solid fill with vertical linear gradient:
  ```js
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  gradient.addColorStop(0, hexToRgba(colors.teal, 0.18));
  gradient.addColorStop(1, hexToRgba(colors.teal, 0));
  ```
- Line width: 1.5px
- Point radius: 0 by default, 4px on hover
- Add a p50 reference line where the data has a meaningful median:
  ```js
  plugins: {
    annotation: {
      annotations: {
        p50: {
          type: 'line',
          yMin: rolling30d.p50,
          yMax: rolling30d.p50,
          borderColor: colors.textMuted,
          borderWidth: 1,
          borderDash: [4, 4],
          label: { display: true, content: 'p50', position: 'end' },
        },
      },
    },
  }
  ```
  (Requires `chartjs-plugin-annotation` — check `package.json` first. If not
  installed, install it: `npm install chartjs-plugin-annotation`.)

### Apply

- S1Card sparkline + monthly bar chart
- S2Card activation history line + fleet-vs-clearing dual-axis chart
- Today's price shape sparkline (S1 drawer)

### Verification

- Theme toggle dark → light → dark: charts re-paint with correct theme colors.
- Hover over data points: custom tooltip appears with card-matching surface.
- p50 reference line visible on charts where applicable.
- Draw-in animation on mount (path length 0 → full, bars grow from baseline).

### Commit

`phase-7-5-polish: intervention C — kkme chart theme (grid, ticks, gradients, annotations)`

---

## Intervention D — Table rhythm

**Goal:** Make drawer tables read as curated information, not spreadsheets.

### Tables in scope

- S1 drawer: "MONTHLY CAPTURE (4h)" table
- S1 drawer: GROSS-TO-NET BRIDGE table
- S1 drawer: "Not included in net capture" list
- S2 drawer: aFRR up / mFRR up monthly tables
- S2 drawer: Cross-border comparison table

### Rules

- Row height: minimum 32px.
- Zebra striping (dark): alternating rows at `rgba(255, 255, 255, 0.015)` on the
  even rows. Add to globals.css as `--zebra-stripe: rgba(255, 255, 255, 0.015);`
  and `rgba(0, 0, 0, 0.02)` in light mode.
- Three-column pattern for date/value/count:
  - Date: DM Mono 12px, `var(--text-secondary)`, left-aligned
  - Value: Unbounded 15px, `var(--text-primary)`, right-aligned, tabular
  - Count (e.g. "30d"): DM Mono 10px, `var(--text-muted)`, right-aligned
- Column headers: uppercase, DM Mono 10px, `letter-spacing: 0.08em`, muted color,
  1px bottom border in `--border-subtle`.
- Gross-to-net bridge:
  - Loss rows (RTE loss, etc.): subtle rose tint on leading cell —
    `background: rgba(rose, 0.04);`
  - Sum row ("Net capture"): top 1px hairline in `--border-hairline`, slightly
    bolder weight
- Cross-border comparison: **drop the `?%` Rate column entirely**. Empty data
  shouldn't be rendered. If the rate becomes available later, add it back.

### Apply

- S1Card drawer tables (grep for `<table` inside S1Card.tsx and S2Card.tsx, or
  wherever they were extracted to — e.g., `app/components/drawers/`)
- S2Card drawer tables

### Verification

- Grep the tables for any hard-coded widths (`width="..."`) and replace with
  semantic sizing (flex or grid).
- Screenshot: tables should have visible vertical rhythm, scannable columns.
- Zebra stripes barely perceptible but visible if you look.

### Commit

`phase-7-5-polish: intervention D — table rhythm (zebra + column typography)`

---

## Intervention E — Motion language

**Goal:** Define global motion tokens. Apply consistently.

### New tokens (globals.css)

```css
:root {
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
    --duration-slow: 0ms;
  }
}
```

### Apply

- **Card entrance on viewport intersection**: opacity 0→1, translateY 12px→0,
  `--duration-slow --ease-out-expo`. Use IntersectionObserver — not on every
  scroll, one-shot on first intersection. Stagger 50ms between adjacent cards.
- **Drawer expand/collapse**: animate `max-height` via grid-template-rows trick
  (grid with `1fr` → `0fr`), `--duration-base --ease-out-quart`.
- **Toggle selection (2h/4h, aFRR/mFRR/FCR)**: underline slides between options
  using `transform: translateX()`, `--duration-base --ease-out-quart`. No layout
  shift — the underline is absolutely positioned.
- **Card hover**: border color 150ms transition from `--border-subtle` to
  `--border-hairline`.
- **Link hover**: `text-decoration-thickness` grows from 1px to 2px via 150ms
  transition, or use a pseudo-element width 0→100% if thickness doesn't animate
  in the target browsers.
- **Chevron on "View signal breakdown"**: rotate 0→180deg when expanded,
  `--duration-base --ease-out-quart`.

### Verification

- Open localhost with devtools.
- Test `prefers-reduced-motion: reduce` via devtools rendering panel → "Emulate
  CSS media feature prefers-reduced-motion: reduce". All transitions should be
  instant; no animation should play.
- Intersection observer: scroll slowly, confirm cards enter with fade+rise.
- Toggle 2h/4h: underline slides smoothly, no flash.

### Commit

`phase-7-5-polish: intervention E — motion tokens + card/drawer/toggle animations`

---

## Final verification before PR

After all five interventions committed on `phase-7-5-polish`:

1. **Token drift grep** — zero matches expected:
   ```bash
   grep -rn "rgba(" app/components/S1Card.tsx app/components/S2Card.tsx
   grep -rn "#[0-9a-fA-F]\{6\}" app/components/S1Card.tsx app/components/S2Card.tsx
   ```
2. **Build**: `npx next build` — must pass.
3. **Line count check**: S1Card.tsx should be ≤ 450 lines, S2Card.tsx ≤ 475 lines
   (polish adds some CSS but shouldn't bloat JSX).
4. **Screenshot set**: S1 card + S2 card, light + dark, desktop + 375px mobile.
   Also: drawers expanded, both modes.
5. **Theme toggle mid-animation**: toggle dark → light while a drawer is
   animating open. Should not flash, not break.
6. **Reduced-motion test**: Set devtools to emulate reduced-motion, reload.
   Confirm all motion is instant.
7. **No regressions in data** — all four flat fields (`gross_2h`, `gross_4h`,
   `net_2h`, `net_4h`) still bind, rolling_30d stats still render, status chips
   still derive correctly.

## End-of-session

- Update `docs/handover.md` session log: date, scope shipped, screenshots
  referenced, any deferred items.
- Update Notion Phase 7.5 entry (if it exists) status → Shipped.
- Open PR via GitHub web UI — **do not use gh CLI**. Kastytis merges manually.
- PR description template:
  ```
  Phase 7.5 — polish pass for S1/S2.

  Five interventions, five commits:
  A — Surface layering
  B — Hero metric choreography
  C — Chart refinement (custom kkme theme)
  D — Table rhythm
  E — Motion language

  No data logic changes. No worker changes.

  Verification:
  - [attach screenshots: S1/S2 light+dark, desktop+mobile]
  - Token drift grep: clean
  - Build: passing
  - Reduced-motion: honored
  ```

## References (study before starting)

- **Linear** (linear.app) — dark surface layering, typography at small sizes
- **Stripe dashboard** — metric cards with sparklines, delta pills
- **Mercury** (mercury.com dashboard) — financial density done elegantly
- **Graphite** — subtle depth, restrained accent colors
- **Bloomberg Terminal** — the density-limit reference

## Questions to surface at Pause 1

If any of these are unclear from reading the existing code, ask before writing:

1. Where do design tokens currently live? (globals.css? a themes module?)
2. Does `chartjs-plugin-annotation` already exist in package.json?
3. Is there an existing IntersectionObserver utility, or do we write one?
4. Are there other cards (S3, S4, hero summary) that currently depend on the
   existing card background token? If so, do we alias the new `--surface-2` to
   the old name so other cards inherit the new styling without modification?
5. What's the target browser matrix? (Safari 16+ supports `@container`, older
   doesn't — affects any container-query-based responsive work.)
