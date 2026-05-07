# Phase 18.1.3 — Mobile per-component reflow (extracted from reverted Phase 18.1.1)

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~1–2 hours, single PR, three pause points (Pause A discovery, Pause B foundation gates + local-build smoke-test, Pause C visual + commits). Frontend-only, no worker deploy. **Chrome MCP gate restored 2026-05-07** via pre-session `cc` alias — proper visual verification expected this session.

**Operator framing:** Operator hard-refresh feedback 2026-05-07 — *"on mobile the reference asset is all messed up, so probably more issues than the map left on mobile."* Screenshot shows AssumptionsPanel grid right-column rendering vertical-character-per-line text. This is the EXACT bug Phase 18.1.1 was supposed to fix but never shipped because 18.1.1 was reverted on the ChunkLoadError (the mobile map redesign sub-item triggered build manifest issues; reflow sub-items were not at fault).

This phase extracts the **safe, low-risk subset** of reverted Phase 18.1.1: per-component reflows + chart-canvas + tornado + heatmap fixes. **NO mobile map redesign** (that's Phase 18.1.1.1 territory; deferred separately to investigate the chunk-error pattern).

The reflow scope was pre-verified at Phase 18.1.1 Pause A (memory: `project_audit_v2_gaps.md` + Phase 18.1.1 handover Session 46 archived). Bug shape hasn't changed. Implementation should be near-mechanical re-application of the reverted commit `1839328`'s pattern, minus the band-aid removal (band-aid stays for this phase; remove only if all reflows close overflow).

---

## What ships

**5 sub-items, single PR, frontend-only, low-risk class.**

**(1) DSCR triple panel reflow** (`RevenueCard.tsx:~1069-1126` — verify line numbers post-7.7g-a-3 typography phase) — `min-width: 0` on grid cells + `overflow-wrap: anywhere` on label/sublabel. New `.rv-dur-dscr` class wrapping DurationOptimizer + DSCR 2-col grid (was unshrinkable inline `1fr 1fr`); stacks at `<720px`. ~5 lines.

**(2) AssumptionsPanel grid reflow** (`RevenueCard.tsx:~721+` — verify line numbers) — replace inline `gridTemplateColumns: 'auto 1fr'` with `.assumptions-grid` class: `auto minmax(0, auto) minmax(0, 1fr)` desktop / single column at `<720px`. Drop `whiteSpace: nowrap` on label cells. Add `overflowWrap: anywhere` to italic notes 1fr cells. **One fix covers RTE row + v7.3 cycles row + v7.2 fallback row + 3 standard rows.** ~10-15 lines. **This is the operator-screenshot bug.**

**(3) S3Card BreakdownBar reflow** (`S3Card.tsx:~80-96` — verify line numbers) — children currently sum 305px fixed (130 label + 85 range + flex bar + 90 scope); flex bar collapses to ~0-1px at <360px viewport. Add `.breakdown-bar` className family + new `@media (max-width: 720px) { .breakdown-bar { flex-wrap: wrap; } .breakdown-bar__bar { flex-basis: 100%; } }` block in `globals.css`. **Hoist into fresh @media block per `feedback_tailwind_v4_silent_drop.md` memory.** ~15 lines.

**(4) Pause-A scope additions from reverted 18.1.1** (3 sites) — these were load-bearing for the band-aid removal in 18.1.1; without them, body scrollWidth at 360 dropped 556 → 459 (DSCR fix only) → 439 (+ AssumptionsPanel) → 360 (+ chart-canvas + tornado + heatmap). Apply preemptively:
- (4a) `.rv-main > *, .rv-analytics > * { min-width: 0 }` injection in `RevenueCard.tsx:~1838+` inline `<style>` block — lets chart.js Line + Sensitivity tornado SVG canvases shrink to grid track width
- (4b) Sensitivity tornado SVG conversion (`RevenueSensitivityTornado.tsx:~71`) — explicit `width={360}` attribute → `viewBox` + `width: 100%` + `maxWidth: 360`. Chart scales to parent.
- (4c) MonthlyHeatmap grid (`RevenueCard.tsx:~1214`) — `1fr` → `minmax(0, 1fr)` per heatmap month cell. Heatmap was rendering 22px-per-cell × 13 = 286px + 60 label = 346px, escaping 248px parent.

**(5) Band-aid removal verification** (Pause B gate, NOT a sub-item) — after (1)-(4) ship, verify that `html { overflow-x: hidden }` (band-aid added in Phase 18.1) can be removed. If 5-viewport scrollWidth=clientWidth still passes, drop the band-aid. If any viewport regresses, file the offending site as Phase 18.1.4 follow-up; band-aid stays.

`model_version` does NOT bump. No worker, no engine, no test logic changes (existing tests should pass; possibly +1-3 specs if new helper or media-query assertion added).

---

## OUT of scope (defer to other phases)

- **Mobile map redesign** — Phase 18.1.1.1 territory; chunk-error pattern needs separate investigation; do NOT touch HeroBalticMap component or attempt the simplified mobile SVG variant in this phase
- Engine / worker changes
- Phase 18.2 / 18.2.2 / 18.2.3 chart polish (already shipped)
- Phase 18.3 — animation activation (separate phase; some dormant keyframes wait there)
- Phase 19 — A11y MVP
- Phase 20 — Static IA pages + footer
- Phase 7.7g-b primitives
- Phase 21.1 per-country aFRR worker extension
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- Tailwind v4 silent-drop pattern investigation (just apply the workaround; deeper investigation is its own phase if ever wanted)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #4 cross-card consistency, #5 roadmap edit-conflict)
2. `docs/handover.md` Sessions 45-52 (Phase 18.1 context + 18.1.1 revert + 7.7g-a-3 line-number shifts)
3. `docs/phases/_post-12-8-roadmap.md` Phase 18.1.3 entry — roadmap source-of-truth for scope
4. `docs/phases/phase-18-1-1-prompt.md` (reference; Phase 18.1.1 was reverted but the per-component reflow scope is identical for this phase)
5. `app/components/RevenueCard.tsx` — DSCR + AssumptionsPanel + cycles + chart-canvas + heatmap (multiple touch points)
6. `app/components/S3Card.tsx` — BreakdownBar
7. `app/components/RevenueSensitivityTornado.tsx` — tornado SVG
8. `app/globals.css` — for new classes; **html { overflow-x: hidden } band-aid currently exists** (added in Phase 18.1; was removed in 18.1.1; restored after 18.1.1 revert); verify exact line at Pause A
9. **Phase 18.1.1's reverted commit `1839328`** — can be inspected via `git show 1839328` to see the original implementation pattern; replicate for sub-items 1-4 (skip the band-aid removal in that commit unless §5 verifies cleanly)

Memory references (Cowork-side):
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Pause B local-build smoke-test gate REQUIRED for any phase touching layout / chart canvases / SSR boundary; Phase 18.1.1's ChunkLoadError lesson is the exact context this phase is responding to
- **`feedback_chrome_mcp_orphans.md`** — chrome MCP recurring lock RESOLVED 2026-05-07 via `cc` alias; if visual MCP fails this session, verify operator launched CC via the alias
- `feedback_tailwind_v4_silent_drop.md` — hoist new @media rules into fresh blocks; multi-selector blocks also drop silently; don't stack with existing
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `project_audit_v2_gaps.md` — broader audit context

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -10
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-7.7g-a-3-merge commit. State understanding (one paragraph): plan for sub-items 1-4 + band-aid removal verification + chrome MCP availability. Wait for "proceed".

### Cowork-grepped baseline (verify at Pause A per discipline rule #1; line numbers may have shifted post-7.7g-a-3 typography phase)

| Concern | Phase 18.1.1 era line | Current state |
|---|---|---|
| DSCR triple panel | RevenueCard.tsx:~1069-1126 | RE-VERIFY post-7.7g-a-3 |
| AssumptionsPanel grid | RevenueCard.tsx:~721+ | RE-VERIFY |
| S3 BreakdownBar | S3Card.tsx:~80-96 | RE-VERIFY |
| Tornado SVG width | RevenueSensitivityTornado.tsx:~71 | RE-VERIFY (possibly already converted in 7.7g-a-3 if Newsreader migration touched it) |
| chart-canvas track | RevenueCard.tsx:~1838 inline `<style>` | RE-VERIFY |
| MonthlyHeatmap grid | RevenueCard.tsx:~1214 | RE-VERIFY |
| html overflow-x band-aid | globals.css | EXPECTED to exist (Phase 18.1 added; restored after 18.1.1 revert) |

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-1-3-mobile-component-reflow
npx tsc --noEmit       # 0 errors
npx vitest run          # baseline (post-7.7g-a-3)
npm run lint            # baseline
npm run lint:no-raw-spacing  # exit 0 (extended per-side regex from 7.7g-a-3)
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers.

---

## 2. Pause A — Discovery + scope confirmation

### 2a. Re-grep current line numbers

Phase 7.7g-a-3 touched RevenueCard.tsx (and other files) heavily; line numbers from Phase 18.1.1 era may have shifted. Re-grep:

```bash
grep -nE "DurationOptimizer|DSCR|.dscr-triple|min-dscr" app/components/RevenueCard.tsx | head -10
grep -nE "AssumptionsPanel|assumptions-grid|gridTemplateColumns:\s*'auto 1fr'" app/components/RevenueCard.tsx | head -10
grep -nE "BreakdownBar|breakdown-bar" app/components/S3Card.tsx | head -10
grep -nE "viewBox|width=\\{360\\}|maxWidth.*360" app/components/RevenueSensitivityTornado.tsx | head -10
grep -nE "MonthlyHeatmap|heatmap" app/components/RevenueCard.tsx | head -10
grep -nE "html\\s*\\{\\s*overflow-x|body\\s*\\{\\s*overflow-x" app/globals.css
```

Document exact line numbers per sub-item. Confirm band-aid still exists in globals.css.

### 2b. Phase 18.1.1's commit pattern reference

```bash
git show 1839328 --stat
# OR
git show 1839328 -- app/components/RevenueCard.tsx
```

Inspect the reverted commit's pattern. Replicate the reflow approach. Skip the band-aid-removal hunks (defer band-aid removal to Pause B verification gate).

### 2c. Verify operator-screenshot bug reproduces

If chrome MCP available (operator should have run `cc` alias to start session):

```bash
# Use chrome-devtools MCP to load localhost:3000 OR kkme.eu at 360px viewport
# Open S2 / RevenueCard area
# Screenshot AssumptionsPanel — should see right column rendering vertical text per character
```

If screenshot reproduces operator's report → confirmed; proceed with the sub-item 2 fix.

If not reproducible → chrome MCP working but bug not visible → curl-side audit instead; fix is still scoped per Phase 18.1.1's pattern.

### 2d. Cross-component re-verification

Phase 7.7g-a-3 typography phase may have already partially fixed some sub-items as side effects:
- Tornado SVG (4b) — was the `width={360}` attribute changed during the 7.7g-a-3 fontSize migration? Probably not, but verify
- chart-canvas track (4a) — was the inline `<style>` block touched?
- MonthlyHeatmap (4c) — was the grid template touched?

If any sub-item is already partially fixed, document and reduce scope.

### Pause A report

Halt + report:

1. **Per-sub-item line-number map** — current locations in code post-7.7g-a-3
2. **Band-aid presence verification** — is `html { overflow-x: hidden }` in globals.css? Same line/state as Phase 18.1?
3. **Operator-screenshot reproduction** — chrome MCP reproduced AssumptionsPanel bug? Yes/No/Not-attempted
4. **Cross-component re-verification** — any sub-items partially fixed by 7.7g-a-3 side effects?
5. **Refined estimate** vs prompt's ~1-2h
6. **Local-build risk pre-check** — Phase 18.1.1's chunk error came from MobileBalticMap redesign (~200 lines new component + GSAP guard), not from the reflows. This phase doesn't touch that surface. Risk class: LOW. Pause B verification gate still required per memory.

Wait for explicit operator "proceed" before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes in order (lowest-risk → highest-risk):

1. **(4b) Tornado SVG** — single attribute change; smallest blast radius
2. **(4c) MonthlyHeatmap grid** — single property change
3. **(3) S3 BreakdownBar reflow** — single component + globals.css addition
4. **(1) DSCR triple panel reflow** — RevenueCard inline + globals.css class
5. **(2) AssumptionsPanel grid reflow** — bigger change, covers multiple grid rows
6. **(4a) chart-canvas track** — RevenueCard inline `<style>` injection

For each:
- Read file end-to-end first
- Verify cross-component impact
- For new `@media` rules in globals.css: hoist into fresh blocks per Tailwind v4 memory; multi-selector also drops, so each rule in its own block

Reference Phase 18.1.1's reverted commit `1839328` for proven implementation pattern; cherry-pick relevant hunks if practical.

---

## 4. Pause B — Foundation gates + local production build + band-aid removal verification

### 4a. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # baseline + N if specs added
npm run lint            # baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0 (extended per-side regex)
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 4b. Visual verification at 5 viewports (CHROME MCP RESTORED)

Per `feedback_chrome_mcp_orphans.md`, chrome MCP gate is restored 2026-05-07 via the `cc` alias. Use chrome-devtools MCP at 360 / 414 / 768 / 1024 / 1440 px:

1. `scrollWidth === clientWidth` PASS at all 5
2. AssumptionsPanel right column wraps cleanly (NOT vertical-character-per-line) — operator-reported bug closed
3. DSCR triple panel renders without overflow at 360px
4. S3 BreakdownBar visible (not collapsed) at 360px
5. Tornado SVG scales to parent width at 360px (not stuck at 360px native)
6. Capture screenshots → `docs/visual-audit/phase-18-1-3/<viewport>-<surface>.png`

If chrome MCP fails (alias not used, OR chrome failed to launch despite alias):
- Fall back to curl-only verification per Phase 21.2 precedent
- Prose state-description doc at `docs/visual-audit/phase-18-1-3/STATE.md`
- Operator owns post-merge visual confirmation

### 4c. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

```bash
npm run build && npx serve@latest out -l 3100
```

Verify:
- Home page returns HTTP 200
- All JS chunks referenced in HTML return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Bundle delta near-noise-floor (additive CSS classes + small inline-style additions)

### 4d. Band-aid removal verification

After sub-items 1-4 ship + visual audit confirms layout fixes work, attempt:

```bash
# Locate band-aid in globals.css (Pause A confirmed location)
# Comment out OR delete the html { overflow-x: hidden } rule
# Re-run npm run build
# Re-test 5-viewport scrollWidth=clientWidth
```

Two outcomes:
- **All 5 viewports still PASS without band-aid** → drop the band-aid; reflows fully closed the overflow holes; document removal in commit message
- **Any viewport regresses** → revert band-aid removal; document which site/viewport regresses; file Phase 18.1.4 with concrete file:line target; band-aid stays

Do same for `body { overflow-x: hidden }` if it exists (Phase 18.1.1 added body-level too; revert restored).

### Pause B report

- Per-sub-item status: SHIPPED / DEFERRED-with-reason
- 5-viewport `scrollWidth=clientWidth` table with chrome MCP screenshots OR curl-only prose
- Band-aid removal: SUCCESS (both html + body removed) / PARTIAL (one removed) / KEPT (both kept; reason)
- Bundle delta
- Local-build smoke-test result
- Operator-screenshot bug closed (AssumptionsPanel right column wraps cleanly)?

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Final visual audit

If chrome MCP succeeded: 10-15 screenshots covering AssumptionsPanel before/after + DSCR + S3 + tornado at 360px + 1440px × light + dark.

If chrome MCP curl-only: prose state doc per Phase 21+21.2 precedent.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/components/RevenueCard.tsx app/components/RevenueSensitivityTornado.tsx app/components/S3Card.tsx app/globals.css
git commit -m "phase-18-1-3(reflow): DSCR + AssumptionsPanel grid + S3 BreakdownBar + chart-canvas track + tornado SVG + MonthlyHeatmap (extracted from reverted 18.1.1; AssumptionsPanel right-column-vertical-text bug closed)"

# If band-aid removal succeeded:
git add app/globals.css  # if separately committed
git commit -m "phase-18-1-3(band-aid): drop html + body overflow-x:hidden after reflows close overflow holes"

git add docs/handover.md docs/visual-audit/phase-18-1-3/
git commit -m "phase-18-1-3(handover): Session 53 + visual audit captures"

git push -u origin phase-18-1-3-mobile-component-reflow
```

(Adjust per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 53

Mirror Session 52 structure. Specific items:
- Headline: mobile per-component reflow (extracted from reverted 18.1.1); AssumptionsPanel + DSCR + S3 + chart-canvas + tornado + heatmap
- Branch + base
- Pause A discovery results (line-number map post-7.7g-a-3 typography)
- Pause B gates + 5-viewport scrollWidth + band-aid removal status
- Per-fix description + line:line citations
- Bundle size delta
- Visual audit (chrome MCP screenshots OR curl-only prose)
- Operator-reported bug closed: AssumptionsPanel right-column-vertical-text
- Out of scope reminder (NOT touching mobile map; that's Phase 18.1.1.1)
- Tier 1 sequence: 18.1.3 ✅ → next CC pick across (18.3 / 19 / 12.12 #1+#2 / 7.7g-b reduced / 18.2.4 / 18.2.5 / 18.2.1 / 20 / 18.1.1.1 / 21.1 / 18.1.2 / 18.1.4 if filed)
- Phase 18.1.4 candidate filed if band-aid couldn't be removed entirely
- Next operator action: open PR; merge; hard-refresh kkme.eu mobile + desktop; verify AssumptionsPanel right column wraps cleanly

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.1.3 → Shipped appendix
- Currently-active update: 18.1.3 SHIPPED; next CC across remaining Tier 1 queue
- If Phase 18.1.4 follow-up filed (band-aid couldn't be fully removed), add to Tier 1 with regressing-site scope

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Line numbers from Phase 18.1.1 era may have shifted post-Phase-7.7g-a-3 typography phase. Re-grep at Pause A; don't assume.
- **Discipline rule #4 (cross-card consistency).** Reflow patterns should be uniform — same media query breakpoint (720px from Phase 18.1.1 precedent), same `min-width: 0` + `overflow-wrap: anywhere` combo, same class naming convention.
- **Phase 18.1.1's chunk error came from MobileBalticMap redesign, NOT the reflows.** This phase doesn't touch HeroBalticMap. Risk class is genuinely low. But local-build smoke-test at Pause B is still REQUIRED per memory.
- **Tailwind v4 silent-drop pattern.** When adding new `@media` rules in globals.css, hoist into fresh blocks. Multi-selector @media also drops silently. Each new rule in its own block.
- **Band-aid removal is an opportunistic gate, not a sub-item.** If reflows don't close all overflow holes, file Phase 18.1.4 with the regressing-site scope; band-aid stays. Phase 18.1.1 successfully removed both html + body band-aids; Phase 18.1.3 should match.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete.
- **Chrome MCP gate restored 2026-05-07** via `cc` alias. If visual MCP fails this session, verify operator launched CC via the alias. If still fails, the gate degraded again — file as a chrome MCP regression candidate.

End of prompt.
