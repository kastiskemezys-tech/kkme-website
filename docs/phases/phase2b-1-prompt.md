# Phase 2B-1 — Hero Polish: Labels, Tagline, Particles, Arrow Fix

Self-contained prompt for Claude Code. Four bundled changes, all touching HeroBalticMap.tsx.
Estimated session: 75–90 minutes with three pause points.

## Before you start

1. Read `docs/handover.md` for current state, backlog, and architecture summary.
2. Read `docs/map.md` for file locations — especially the Hero / Map section.
3. `git status && git log --oneline -5` — confirm you're on a clean branch off main or hero-v3-phase2a-3.
4. `bash scripts/diagnose.sh` — confirm production health.
5. Confirm understanding, then proceed.

## Workstream 1: Remove permanent project labels → hover-only tooltips

**Goal:** Every project dot on the hero map becomes hover-only. No permanent text labels cluttering the map.

**Files:**
- `app/components/HeroBalticMap.tsx` — project label rendering (find the section that renders project names as permanent SVG text)
- `lib/label-layout.ts` — remove the project label type and `hideCitiesNearProjects` function (simplify)

**Changes:**
- Remove all permanent project label rendering from HeroBalticMap.tsx
- Keep the project dots (circles) — they stay visible
- Add tooltips on hover: show project name, MW capacity, country, COD
- Vilnius city label becomes permanently visible (it was being hidden by `hideCitiesNearProjects` which is being removed)
- Simplify `lib/label-layout.ts` by removing project label handling
- Add a TODO comment: `// TODO: Phase 3 — mobile tap-to-reveal for project tooltips`

**Verification:** MCP screenshot in dark mode 1440px — project dots visible, no permanent labels, hover shows tooltip. Vilnius visible.

## Workstream 2: Tagline copy fix

**Goal:** Replace stale tagline text.

**Files:**
- `app/components/HeroBalticMap.tsx` — find the ticker/tagline section

**Changes:**
- Find and replace `"9 SIGNALS · 4H UPDATES · ENTSO-E · LITGRID · AST · ELERING"` (or similar) with `"LIVE · ENTSO-E · LITGRID · AST · ELERING"`
- If there's a separate "9 SIGNALS LIVE" text elsewhere in the ticker, remove it
- Grep the whole codebase for "9 SIGNALS" to catch any other occurrences

**Verification:** MCP screenshot showing updated tagline. Grep confirms no remaining "9 SIGNALS" references.

## Workstream 3: Light mode cable particle visibility

**Goal:** Make cable particles visible against the light mode raster background.

**Files:**
- `app/components/HeroBalticMap.tsx` — particle animation setup, particle color definition
- `app/globals.css` — may need a new theme-aware CSS variable for particle color

**Problem:** In light mode, particles animating along interconnector cables are too similar in color to the cable strokes and disappear against the off-white raster background.

**Fix approach:**
- Make particle color theme-aware via a CSS variable (e.g., `--cable-particle`)
- Dark mode: current particle color (likely bright/light)
- Light mode: brighter or higher-contrast color. Options: white with a dark stroke, a saturated teal, or a contrasting shade that stands out against cream/stone background
- Apply via `var(--cable-particle)` in the particle rendering code

**Verification:** MCP screenshot in light mode 1440px — particles clearly visible along cables. Compare dark mode to confirm no regression.

## Workstream 4: Arrow direction inversion fix (B-001)

**Goal:** Fix frontend interconnector flow direction to match worker data.

**Context:** Worker `/s8` returns flow values where positive = exporting from Lithuania. The worker was fixed in Phase 2A-3 (line ~4725, `latestFromList` minus sign removed). But the frontend still displays inverted directions. Example: worker says "NordBalt: EXPORTING (553 MW)" but hero shows "SE → LT 547 MW" — these are opposite.

**Files:**
- `lib/baltic-places.ts` — `resolveFlow()` function, `positiveFlowReceives` field in interconnector definitions
- `app/components/HeroBalticMap.tsx` — interconnector list rendering, arrow direction logic

**Investigation steps:**
1. Read `lib/baltic-places.ts` — find `resolveFlow` and understand the sign convention
2. Read HeroBalticMap.tsx — find where interconnector flow is rendered and how direction is determined
3. Trace the data flow: `/s8` response → HeroBalticMap props → resolveFlow → arrow rendering
4. Identify where the inversion happens — is it `positiveFlowReceives` being wrong, or a second negation somewhere?

**Physical truth for verification:**
- When LT net_mw is positive (exporting), NordBalt should show LT → SE
- When LT net_mw is negative (importing), NordBalt should show SE → LT
- Curl `/s8` and note the current values, then verify the hero matches

**Verification:**
1. Curl `/s8` — note NordBalt and LitPol flow values and interpretation text
2. MCP screenshot — verify hero arrows match worker interpretation
3. Test both import and export scenarios if possible (may need to check at different times of day)

## Pause points

### Pause 1: After discovery (15–20 min)
Read all relevant files. Report:
- Current state of each workstream (what exists, what needs to change)
- For B-001: the exact location of the inversion bug
- Any risks or dependencies between workstreams
Wait for "proceed."

### Pause 2: After build, before commit (40–50 min)
All four changes implemented. Report:
- Files changed (list with summary)
- `npx tsc --noEmit` output
- `npm run build` output
- MCP screenshots: dark 1440, light 1440, hover tooltip
- Curl `/s8` vs hero arrow comparison
- Any deferred items
Wait for "proceed."

### Pause 3: After verification, before final commit (65–75 min)
Everything verified. Report:
- Final MCP screenshots (dark + light, 1280 + 1440 + 1920 if time allows)
- Browser console clean (no errors)
- Proposed commit message(s)
- Any new backlog items discovered
Wait for "proceed."

## Commit discipline

- Branch: `hero-v3-phase2b-1` (off current hero-v3-phase2a-3 or main, whichever is latest)
- One commit for all four workstreams is fine since they're tightly coupled
- Message format: `phase2b-1: project hover tooltips, tagline fix, light particles, arrow direction`
- After commit: update `docs/handover.md` session log and backlog statuses
