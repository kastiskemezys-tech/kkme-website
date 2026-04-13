# Backlog Triage — Cowork Session

Cowork prompt for organizing and prioritizing the KKME backlog.
Not a coding session — organization only. Target: 20–30 minutes.

## Before you start

1. Read `docs/handover.md` — especially the Backlog section and backlog notes.
2. Read `docs/map.md` — you'll need file locations to estimate effort.
3. Confirm you've read both, then proceed.

## Task

Go through all backlog items (currently B-001 through B-014) and produce:

### 1. Grouping

Group related items that should be fixed together. Consider:
- Items that touch the same files
- Items that are logically coupled (fixing one makes fixing another trivial)
- Items that can be batched into a single Claude Code session

### 2. Effort estimation

For each item (or group), estimate:
- **Size:** S (< 30 min), M (30–90 min), L (90+ min)
- **Risk:** Low (cosmetic, docs-only), Medium (code change, tested locally), High (worker deploy, data pipeline, production-visible)
- **Dependencies:** Does this need something else to be done first?

### 3. Priority proposal

Propose an ordering. Factors to weigh:
- User-visible bugs (P1) before tech debt
- Items scheduled for a specific phase ship with that phase
- Quick wins (S + Low risk) can be batched as a cleanup session
- Items that reduce future maintenance burden pay compound interest
- Items that are "delete dead code" are low risk and clean the workspace

### 4. Session plan

Propose 2–3 concrete sessions that clear the backlog:
- For each session: which items, tool (Cowork vs Claude Code), estimated duration, branch name
- Sessions should be ordered by priority
- Flag any items that should stay open (wont-fix or deferred indefinitely)

## Output format

Produce a markdown document at `docs/backlog-triage-2026-XX-XX.md` (use today's date) with:

1. **Grouped items table** — groups with member IDs, shared files, rationale
2. **Effort matrix** — each item: size, risk, dependencies
3. **Priority ranking** — ordered list with reasoning
4. **Proposed sessions** — 2–3 session specs with scope, tool, duration, branch

Then update `docs/handover.md`:
- Add a note in the session log about this triage session
- Update any backlog item statuses that changed (e.g., items grouped into a planned session)

## What NOT to do

- Don't fix any code
- Don't create branches or commits (except the triage doc itself)
- Don't estimate effort by reading entire component files — use line counts from map.md and your knowledge from prior sessions
- Don't add new backlog items unless you discover something broken while reading. If you do find something new, add it to the backlog before triaging.
