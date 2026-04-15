# Phase 2B-1 — Hero Polish: Tooltips, Tagline, Particles, Arrow Fix

Self-contained prompt for Claude Code. Paste as the first message of a fresh Claude Code session started in `~/kkme`. Expected session duration: 75–90 minutes across 4 workstreams with 3 pause points.

This is also the first real test of Superpowers per ADR-006. Workflow guidance below.

---

## Step 0: Context loading

Before touching any code:

1. `bash scripts/diagnose.sh` — confirm worker + site healthy
2. Read `docs/handover.md` in full — current state, backlog, architecture
3. Read `docs/playbooks/tooling.md` — especially the "Using Superpowers" section
4. Read `docs/playbooks/pause-points.md` and `docs/playbooks/verification.md`
5. `git status && git log --oneline -5` — confirm clean working tree

State your understanding of the scope and wait for my explicit "proceed" before moving to Pause 1 discovery. Do NOT start editing files yet.

## Superpowers interaction rules for this session

- Our pause-point pattern (playbook) is the outer workflow. Superpowers skills run **inside** pause segments, not across them.
- Use Superpowers' **brainstorming** skill only if a workstream feels underspecified after reading this brief. Don't re-brainstorm what's already laid out.
- Use **verification-before-completion** before each pause — it's complementary to our verification playbook.
- Use **subagent-driven-development** if Workstream 4 (arrow fix) turns out to need parallel tracing through worker + frontend. Otherwise skip.
- Skip **test-driven-development** — this is presentational React, TDD adds overhead without value (per tooling.md).
- When Superpowers' session-start hook asks questions answered in docs/handover.md, reply "see docs/handover.md" rather than re-explaining.
- At end of session, add a note to the session log: "Superpowers: [helped/neutral/hindered] — [one line why]". This is data for the keep/uninstall decision.

---

## Branch

Create `hero-v3-phase2b-1` off `main` (main was updated after PR #5 merged — the hero-v3-phase2a-3 branch was merged too, so main is current).

```
git checkout main && git pull origin main
git checkout -b hero-v3-phase2b-1
```

---

## Workstream 1: Project dots — remove permanent labels, add hover tooltips

**Goal:** Project dots stay visible on the map but the permanent SVG text labels go away. Replace with hover tooltips showing project name, MW capacity, country, and COD (commercial operation date). Vilnius city label becomes permanently visible as a side effect of removing `hideCitiesNearProjects`.

**Files:**
- `app/components/HeroBalticMap.tsx` (787 lines) — project label rendering ~line 282, project HTML overlay ~line 556, imports at line 11
- `lib/label-layout.ts` (87 lines) — `hideCitiesNearProjects` function and related project-label type

**Changes:**

1. In `HeroBalticMap.tsx`:
   - Remove the HTML project label overlay (~line 556 "Top 3 project labels (HTML overlay)")
   - Remove the projectBoxes SVG label rendering (~line 282–302) — but KEEP the project dot circles themselves
   - Remove `hideCitiesNearProjects` call — cities render without project-proximity hiding
   - Remove the `hideCitiesNearProjects` import at line 11
   - Add tooltip element (HTML overlay or SVG `<title>`) that appears on project-dot hover showing: project name, MW capacity, country code, COD year
   - Add comment at tooltip definition: `// TODO: Phase 3 — mobile tap-to-reveal for project tooltips`

2. In `lib/label-layout.ts`:
   - Remove `hideCitiesNearProjects` export
   - Remove any project-label-specific type if it exists
   - Keep `resolveCollisions` — it's still used for city labels

**Design notes:**
- Tooltip styling: match existing KKME design tokens (use `var(--bg-card)`, `var(--text-primary)`, `var(--border-card)`)
- Font: DM Mono (per ADR-005, UI/data surfaces use mono)
- Size: compact — this is a hover hint, not a card
- Positioning: offset from the dot so it doesn't cover the dot itself

**Verification for Workstream 1:**
- MCP screenshot dark mode 1440px: project dots visible, no permanent labels
- Hover over each project dot: tooltip appears with correct data
- Vilnius city label visible (it was being hidden near Kruonis project)
- No TypeScript errors

---

## Workstream 2: Tagline copy fix

**Goal:** Replace stale "9 SIGNALS" taglines with current cadence-agnostic version.

**Files (confirmed locations):**
- `app/components/HeroBalticMap.tsx` line 330: `items.push('9 SIGNALS LIVE')` — remove this line entirely
- `app/components/HeroBalticMap.tsx` line 379: the tagline string `"9 SIGNALS · 4H UPDATES · ENTSO-E · LITGRID · AST · ELERING"` — replace with `"LIVE · ENTSO-E · LITGRID · AST · ELERING"`

**Also:** grep the whole repo for `"9 SIGNALS"` as a final check. If any other occurrence exists outside docs/, update it too. Docs references (handover.md, this prompt) stay as-is.

**Rationale:** The "9 SIGNALS" figure became wrong as signals were added. "4H UPDATES" became wrong when hourly cron was added for time-sensitive signals. "LIVE" is cadence-agnostic and accurate.

**Verification for Workstream 2:**
- Grep: `grep -rn "9 SIGNALS" app/ lib/ workers/` returns nothing
- Screenshot shows new tagline in ticker/header

---

## Workstream 3: Light mode cable particle visibility (B-005)

**Goal:** Particles animating along interconnector cables must be clearly visible in light mode. Currently they blend into the cream/stone raster background.

**Files:**
- `app/components/HeroBalticMap.tsx` — particle rendering ~lines 543–555, particle animation setup ~lines 179–216
- `app/globals.css` — add new theme-aware CSS variable

**Current problem:** Particle fill is a single color that works in dark mode (bright against dark raster) but disappears in light mode (bright against cream raster).

**Fix approach:**

1. In `app/globals.css`, add a new theme-aware CSS variable:
   ```css
   :root[data-theme="dark"] {
     --cable-particle: <current dark-mode particle color>;
   }
   :root[data-theme="light"] {
     --cable-particle: <higher-contrast color — suggest saturated teal #1a9988 or rich charcoal — test both>;
   }
   ```

2. In `HeroBalticMap.tsx` particle rendering:
   - Change particle `fill` to `var(--cable-particle)`
   - If particles currently use inline hex, replace with the var

**Design constraints (per ADR-005):**
- Must use `var(--cable-particle)` — never a raw hex or rgba. This is a design system rule.
- Contrast rule: particles must be clearly distinguishable from both the cable stroke color AND the raster background in both themes.

**Verification for Workstream 3:**
- MCP screenshot light mode 1440px: particles clearly visible along each cable, distinguishable from cable strokes
- MCP screenshot dark mode 1440px: no regression — particles still visible as before
- Chrome DevTools: inspect a particle element, confirm `fill` resolves via CSS variable

---

## Workstream 4: Arrow direction inversion fix (B-001, P1)

**Goal:** Frontend interconnector arrows show the physically correct flow direction. Worker `/s8` is already correct (fixed in Phase 2A-3); frontend still inverted.

**Files:**
- `lib/baltic-places.ts` (294 lines) — `resolveFlow()` ~line 247, `positiveFlowReceives` field in interconnector specs ~lines 174–235
- `app/components/HeroBalticMap.tsx` — interconnector rendering, where flow direction and arrow are drawn

**Known state from audit:**
- Worker `/s8` returns values where positive `net_mw` for a country means that country is net-exporting
- Worker was corrected in Phase 2A-3 at line ~4725 (`latestFromList` minus sign removed)
- Frontend still shows inverted arrows — example: worker says "NordBalt: LT exporting 553 MW", hero displays "SE → LT 547 MW" (backwards)

**Physical truth for verification (memorize these):**
- NordBalt connects LT↔SE. LT net_mw > 0 means LT exporting → arrow should point LT → SE
- LitPol connects LT↔PL. LT net_mw > 0 means LT exporting → arrow should point LT → PL
- EstLink connects EE↔FI. EE net_mw > 0 means EE exporting → arrow should point EE → FI

**Investigation order:**

1. Read `lib/baltic-places.ts` start-to-finish (it's 294 lines, manageable). Understand:
   - The `positiveFlowReceives` convention (currently documented lines 162–163: "positive rawMw → particles flow B→A")
   - Whether `positiveFlowReceives` values (lines 186, 195, etc.) match physical truth
   - How `resolveFlow()` (line 247) computes `particleDirection` and display direction

2. Read the relevant section of `HeroBalticMap.tsx` — find where `resolveFlow` is consumed and where the arrow glyph or display string is rendered

3. Trace a single flow end-to-end with real numbers from `curl https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8`

4. Identify the bug. Candidates:
   - `positiveFlowReceives` values are wrong (semantic inversion)
   - `resolveFlow` has a sign-flip that's no longer needed after worker fix
   - HeroBalticMap renders the display string with swapped endpoints

**Expected fix:** Either update `positiveFlowReceives` values OR remove a compensating negation in resolveFlow OR fix the rendering call site. Only one of these should be true — don't fix it in multiple places.

**This is the workstream most likely to benefit from Superpowers' subagent-driven-development** — one subagent traces worker → props, another traces props → rendering. Apply judgment.

**Verification for Workstream 4 (strict):**
1. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8 | python3 -m json.tool` — record NordBalt, LitPol, EstLink values with sign
2. MCP screenshot dark mode 1440px — arrows on each cable
3. Side-by-side comparison: worker sign + physical truth rule vs. hero arrow direction
4. Do this for at least NordBalt and LitPol. If both match physical truth, B-001 is closed.

---

## Pause points

### Pause 1: After discovery (target: 15–20 min in)

Do not write any code yet. Report:

- Current state of each workstream (what exists in the files, what specifically needs to change)
- For WS4: the exact file + line where the inversion bug lives, with a 2-line quote of the buggy code
- Dependencies between workstreams (e.g., "WS1 and WS2 both edit HeroBalticMap.tsx — do them in one pass")
- Any risks you want approval on before starting

Wait for my explicit "proceed" before any `Edit` or `Write` calls.

### Pause 2: After build, before any commit (target: 40–55 min in)

All four workstreams implemented but uncommitted. Report:

- List of changed files with a one-line change summary each
- `npx tsc --noEmit` output (must be clean)
- `npm run build` output (must succeed)
- MCP screenshots: dark 1440, light 1440, one hover state showing tooltip
- `/s8` curl output vs. hero arrows (with sign reasoning) for NordBalt and LitPol
- Grep confirmation for "9 SIGNALS" removal
- Any deferred items or questions

Wait for "proceed" before proposing the commit message.

### Pause 3: After verification, before final commit (target: 65–80 min in)

Full verification pass complete. Report:

- Final MCP screenshots: dark + light at 1280, 1440, 1920
- Browser console clean (no errors, no warnings added by this change)
- Proposed commit message
- Proposed handover.md session log entry draft
- Any new backlog items discovered during implementation (things out of scope but worth tracking)

Wait for "proceed" before committing and before any `git push`.

---

## Commit discipline

- Single commit for all 4 workstreams is fine (they're tightly coupled through HeroBalticMap.tsx)
- Commit message: `phase2b-1: project hover tooltips, tagline fix, light particles, arrow direction`
- Push `hero-v3-phase2b-1` branch, open PR via GitHub web UI (I merge manually — don't use gh CLI)

---

## Post-merge steps (after I merge the PR)

Before ending the session, update `docs/handover.md`:

1. Move B-001, B-004, B-005 from "open/scheduled" to "done" with date `2026-04-15`
2. Update "What's shipped" with Phase 2B-1 one-liner
3. Remove Phase 2B-1 from "What's queued"
4. Append Session 3 log entry with:
   - Scope
   - Shipped (4 workstreams)
   - Any deferred items
   - Findings
   - Superpowers evaluation note (format: "Superpowers: [helped/neutral/hindered] — [one line why]")

Commit the handover update as a separate docs-only commit on main (or on a quick docs branch if you prefer PRs for everything). Push.

---

## Hard rules

- Do not skip pause points — wait for explicit "proceed" each time
- Do not commit without verification output (screenshots + curl + tsc + build)
- Do not fix the arrow direction in more than one place — find the single source of the inversion
- Do not use raw rgba() or hex anywhere in new CSS — use design tokens per ADR-005
- Do not modify the worker — it was fixed in Phase 2A-3 and is correct
- Do not expand scope beyond the 4 workstreams. Backlog new findings; don't implement them.
- Do not push from Cowork — this runs in Claude Code only
- If anything in this brief is unclear or contradicts something you find in the code, flag it before starting work

---

## Reference

- ADR-005 (design system): `docs/principles/decisions.md`
- ADR-006 (tooling / Superpowers): `docs/principles/decisions.md`
- Tooling playbook (Superpowers rules): `docs/playbooks/tooling.md`
- Verification playbook: `docs/playbooks/verification.md`
- Pause-points playbook: `docs/playbooks/pause-points.md`
- Backlog context for B-001: `docs/handover.md` "Backlog notes" section
- Worker `/s8` endpoint: https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8
- Production site: https://kkme.eu
