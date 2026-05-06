# Phase 18.1.1 — Mobile map redesign + per-component reflow

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~3–4 hours, single PR, three pause points (Pause A discovery, Pause B foundation, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** Phase 18.1 mobile foundation shipped 2026-05-06 successfully (3 commits on `phase-18-1-mobile-foundation` merged to main). All gates green, 5-viewport `scrollWidth=clientWidth` PASS, 8 touch-target sites bumped to 44×44. But operator hard-refresh feedback after deploy was "map doesn't work on mobile, might need to think of something better." Phase 18.1's `overflow: hidden` SVG fix solved scrollWidth overflow but compressed the dotted-grid Baltic map illegibly on small viewports AND clipped the eastern context city labels (which operator confirmed were intended-visible).

Phase 18.1 also applied a `html { overflow-x: hidden }` page-level band-aid to mask sub-card overflow (DSCR triple panel + RTE assumption rows + cycles_breakdown 4-col bar + S3Card BreakdownBar). Per-component fixes were deferred to this phase.

Operator picked direction A: **simplified mobile SVG variant** (3-country outline + colored arrow-lines for interconnectors with MW labels) replacing the dotted-grid map below 900px. Keeps brand visual identity at appropriate density. Desktop map untouched.

---

## What ships

**5 sub-items, single PR, frontend-only.**

1. **Mobile-simplified SVG variant** (direction A) — below 900px in `HeroBalticMap.tsx`, swap the existing dotted-grid map for a clean country-outline SVG. Components:
   - 3 country shapes (LT / LV / EE) with simplified geographic outlines
   - 6 interconnector arrow-lines per current S8 data (NordBalt LT→SE 334 MW, LitPol LT→PL 166 MW, EstLink 1 FI→EE 258 MW, EstLink 2 FI→EE 478 MW, Fenno-Skan 1 SE→FI 545 MW, Fenno-Skan 2 SE→FI 793 MW per current production)
   - MW magnitudes as labels on/near arrows
   - Country labels (LT / LV / EE) using existing typography tokens
   - Color: Baltic deep teal `#1a3833` for country outlines; amber `#d4a574` for arrows; brick `#a8324a` for high-utilization arrows (>500 MW threshold or whatever feels right)
   - viewBox sized for mobile fold (no off-map context labels — those were the eastern eastern Baltic neighbor labels in the old map; not in scope here)
   - Aspect ratio: roughly 4:3 or square; takes ~280-340px tall on a 360px viewport

2. **DSCR triple panel reflow** (`RevenueCard.tsx:1069-1115`) — `min-width: 0` on grid children + label-wrap pass; ~5 lines.

3. **RTE assumption rows reflow** — per Phase 18.1 Pause B handover (`docs/handover.md` Session 45); identify the offending lines + apply `min-width: 0` + label-truncation; ~10 lines.

4. **cycles_breakdown 4-col mini-bar reflow** — per Phase 18.1 Pause B handover; same `min-width: 0` + label-truncation pattern; ~5 lines.

5. **S3Card BreakdownBar reflow** (`S3Card.tsx:80`, spec P1-4) — children sum 305px fixed-width (130 + 85 + flex-bar + 90); flex-bar collapses to 0-1px at <360px viewport. Fix = className + `<720px` stack media query; ~15 lines.

**Pause B band-aid removal verification:** after sub-items 2-5 are in place, attempt to remove `html { overflow-x: hidden }` from `globals.css`. Run 5-viewport scrollWidth=clientWidth check (360 / 414 / 768 / 1024 / 1440). If all PASS, remove the band-aid. If any viewport regresses, file the offending site as Phase 18.1.2 follow-up and keep band-aid in place; document which site regresses.

`model_version` does NOT bump. No worker, no engine, no test changes (existing tests should pass; possibly +1-3 specs if new utility added).

---

## OUT of scope

- Engine / worker changes
- Chart polish (Phase 18.2) — chart tooltips + tornado pointer-events fix is a separate phase
- Animation activation (Phase 18.3) — dormant keyframes + count-up tween is a separate phase
- A11y additions beyond Phase 18.1 baseline (Phase 19)
- Static IA pages / footer (Phase 20)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- Type-scale rationalization (Phase 7.7g-a-3)
- Component primitives (Phase 7.7g-b reduced)
- Restoring the dotted-grid map's eastern-context labels — direction A creates a fresh viewBox; off-map labels are out of scope by construction
- Interactive features on the mobile map (no tap-to-drill, no fullscreen modal — operator confirmed direction A alone is enough)
- Animations on the mobile map (no flow-line animation; static is fine)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #5 roadmap edit-conflict)
2. `docs/handover.md` Session 45 (Phase 18.1) — the band-aid + per-component overflow context, file:line references for sub-items 2-5
3. `docs/specs/2026-05-06-designer-developer-spec.md` — section P1-4 has the BreakdownBar reflow recipe; section P1-1 informs the simplified mobile map approach (though the full <details>-opt-in option is rejected per operator)
4. `docs/phases/_post-12-8-roadmap.md` "Phase 18.1.1" entry — roadmap source-of-truth for scope
5. `app/components/HeroBalticMap.tsx` — current dotted-grid map; lines 355-369 hold the inline grid template (now collapsed via CSS class). Identify how the desktop dotted-grid renders so the mobile variant slots in cleanly. Look for: SVG viewBox, dot generation logic, interconnector flow rendering, country labels.
6. `app/components/RevenueCard.tsx:1069-1115` — DSCR triple panel
7. `app/components/S3Card.tsx:80` — BreakdownBar
8. `app/globals.css` — find the `html { overflow-x: hidden }` band-aid added in Phase 18.1; line ~768 area

Memory references (Cowork-side):
- `feedback_cowork_sandbox_limits.md` — vitest + next build core-dump in Cowork; tsc + eslint reliable on Mac
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `feedback_tailwind_v4_silent_drop.md` — when adding new CSS rules, hoist into own `@media` block; don't stack inside existing `@media`. Phase 18.1 hit this exact bug. Stay alert for it in this phase.
- `reference_designer_dev_spec.md` — points at the saved spec doc

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-18.1-merge commit. State understanding (one paragraph): which baseline you'll work from, plan for §1. Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-1-1-mobile-map-redesign
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 baseline (post-18.1)
npm run lint            # 126 baseline (40 errors / 86 warnings)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. Pre-commit must match (small delta acceptable for any new utility specs).

---

## 2. Pause A — Discovery + design proposal

### 2a. Verify which sub-card sites still overflow

Per discipline rule #1 (audit-triage), the band-aid `html { overflow-x: hidden }` may be masking sites that don't actually need fixing. Test in dev:

```bash
npm run dev  # localhost:3000
```

In Chrome DevTools at 360px viewport:
1. Temporarily disable `html { overflow-x: hidden }` (via Sources tab DevTools edit, NOT a code change yet)
2. Reload; observe which exact components overflow their parent
3. Document each site: file:line + visible symptom (label clips, content extends past parent, etc.)
4. Re-enable band-aid before moving on

Cross-reference Phase 18.1 Session 45 handover claims:
- DSCR triple panel (`RevenueCard.tsx:1069-1115`)
- RTE assumption rows (need exact line numbers)
- cycles_breakdown 4-col bar (need exact line numbers)
- S3Card BreakdownBar (`S3Card.tsx:80`)

If any claim from Session 45 is NOT REPRODUCIBLE without the band-aid, mark accordingly. If new sites surface that weren't in Session 45, surface at Pause A.

### 2b. Mobile-simplified SVG approach

Read `HeroBalticMap.tsx` end-to-end (don't grep — context matters for SVG structure). Identify:
- Where the SVG element is rendered (likely inline JSX with viewBox)
- How interconnector data flows in (probably from `s8` payload)
- Where country labels currently render

Propose the simplified SVG approach. Three sub-decisions for Pause A:

**Decision A1 — Country path source:**
- (a) Hand-coded simplified paths (~3 country outlines as SVG `<path d="...">` data; lowest fidelity but smallest payload)
- (b) Reuse existing geographic data from the desktop dotted-grid map (if there's a coords source — likely YES based on dot positioning)
- (c) Pull from a small library (e.g., `@svg-maps/baltic` if it exists; verify license + bundle impact)

Recommend (a) or (b) per inspection. Hand-coded paths for 3 country outlines is roughly 100-200 lines of SVG; (b) reuses existing data without new dependencies.

**Decision A2 — Mobile/desktop swap mechanism:**
- (a) Single component with conditional render via `useMediaQuery` hook (forces JS resize listener; small bundle impact)
- (b) Two SVG variants in same component, both rendered, CSS visibility toggle via `@media` (no JS; both SVGs in DOM but only one visible)
- (c) New `MobileMapSimplified.tsx` component imported conditionally

Recommend (b) — pure CSS, no JS state, no resize listener. Slight DOM bloat but simpler reasoning.

**Decision A3 — Arrow-line semantics:**
- Direction: animated flow arrows (small triangle markers traveling along path) vs. static arrowheads at endpoint
- Color: amber `#d4a574` for all, OR threshold-based (e.g., brick `#a8324a` for >500 MW high-utilization)
- Magnitude: MW label inline on the arrow OR floating beside

Recommend: static arrowheads at endpoint (no animation), threshold color (amber default, brick if >500 MW), MW label floating beside arrow. Aligns with KKME's data/math/visuals-speak design discipline (rule #6 — no editorial labels; quantitative micro-descriptors only).

### 2c. Reflow scope confirmation

For each of sub-items 2-5, identify exact:
- File:line range
- Current children-width-sum (e.g., S3Card BreakdownBar: 130 + 85 + flex + 90 = 305px fixed)
- Proposed fix shape (`min-width: 0` on grid children, label-wrap, flex-shrink, OR `<720px` stack media query)
- Estimated lines

Surface any site where the fix is significantly larger than the prompt's estimate (e.g., >25 lines = scope creep, may need 18.1.3 split).

### Pause A report

Halt + report:

1. **Per-overflow-site verification** (from §2a): VERIFIED-still-overflows / NOT REPRODUCIBLE / NEW-site-discovered
2. **Mobile-simplified SVG design proposal:** A1 + A2 + A3 picks with one-line rationale each
3. **Reflow scope per sub-item 2-5:** file:line + line-count estimate
4. **Tailwind v4 / Turbopack alert:** when adding new `@media` rules, plan to hoist into fresh blocks (per memory `feedback_tailwind_v4_silent_drop.md`)
5. **Refined estimate** vs prompt's ~3-4h
6. **Pause B band-aid removal pre-test:** likely able to remove? (best-guess based on §2a verification)

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes. Suggested order (lowest-risk → highest):

1. **Sub-item 2 — DSCR triple panel reflow** (~5 lines)
2. **Sub-item 4 — cycles_breakdown 4-col bar reflow** (~5 lines)
3. **Sub-item 3 — RTE assumption rows reflow** (~10 lines)
4. **Sub-item 5 — S3Card BreakdownBar reflow** (~15 lines, includes new media query)
5. **Sub-item 1 — Mobile-simplified SVG variant** (~100-200 lines, biggest piece)

For each:
- Read the file end-to-end first
- Apply minimal edit
- Verify no desktop ≥900px regression
- For new `@media` rules: hoist into fresh blocks per Tailwind v4 memory

For sub-item 1 specifically:
- Place the simplified SVG inside `HeroBalticMap.tsx` (or new sibling file if cleaner)
- CSS visibility toggle: desktop SVG visible ≥900px, mobile SVG visible <900px (or whatever break point matches Phase 18.1's hero-collapse)
- Honor `prefers-reduced-motion: reduce` if any motion is added (default: no motion per A3 recommendation)
- Use design tokens: `var(--color-positive)` / `var(--color-warning)` / `var(--color-negative)` per Phase 18 palette + Newsreader/IBM Plex Mono typography

---

## 4. Pause B — Foundation gates + band-aid removal

### 4a. Run all gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 baseline + N if new specs
npm run lint            # 126 baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 4b. Visual verification at 5 viewports

Per Phase 18.1's pattern, use chrome-devtools MCP at 360 / 414 / 768 / 1024 / 1440px:

1. `scrollWidth === clientWidth` PASS at all 5
2. Mobile (<900px): simplified SVG renders cleanly; country shapes visible; arrows + MW labels legible; aspect ratio reasonable
3. Desktop (≥900px): existing dotted-grid map unchanged
4. Sub-card sites (DSCR, RTE, cycles_breakdown, BreakdownBar): no overflow at any viewport
5. Capture screenshots → `docs/visual-audit/phase-18-1-1/<viewport>-<surface>.png`

### 4c. Band-aid removal attempt

Once 4a + 4b PASS:

```bash
# Remove html { overflow-x: hidden } from globals.css
# Re-run 5-viewport scrollWidth=clientWidth check
```

Two outcomes:
- **All 5 viewports still PASS** → remove the band-aid; document removal in commit message + handover
- **Any viewport REGRESSES** → revert the band-aid removal; document which site/viewport regresses; file Phase 18.1.2 follow-up with file:line; band-aid stays

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason
- Band-aid removal: SUCCESS / FAILED-keeping-band-aid (with reason)
- 5-viewport `scrollWidth=clientWidth` table
- Mobile SVG screenshot at 360 (most stress-tested viewport)
- Bundle size delta (expect +~5-10 KB for the simplified SVG paths)

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Final visual audit

Confirm 15+ screenshots at `docs/visual-audit/phase-18-1-1/` covering:
- Mobile simplified SVG at 360 + 414 (dark + light)
- Desktop dotted-grid unchanged at 1024 + 1440 (dark + light)
- DSCR triple panel + RTE rows + cycles_breakdown + BreakdownBar at 360 (sub-card overflow gone)
- StickyNav still working at all viewports

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/components/HeroBalticMap.tsx app/components/<any new sibling file>
git commit -m "phase-18-1-1(map): simplified mobile SVG variant <900px — country outlines + arrow-line interconnectors with MW labels"

git add app/components/RevenueCard.tsx app/components/S3Card.tsx app/globals.css
git commit -m "phase-18-1-1(reflows): per-component min-width:0 + label-wrap pass — DSCR triple panel + RTE rows + cycles_breakdown + S3 BreakdownBar; html overflow-x:hidden band-aid <removed | kept-with-reason>"

git add docs/handover.md docs/visual-audit/phase-18-1-1/
git commit -m "phase-18-1-1(handover): Session 46 + visual audit captures"

git push -u origin phase-18-1-1-mobile-map-redesign
```

Print PR-creation URL.

---

## 6. Handover Session 46

Mirror Session 45 structure. Specific items:
- Headline: mobile map redesign + per-component reflow + band-aid removal status
- Branch + base
- Pause A audit results (per-overflow-site verification, SVG design picks A1/A2/A3)
- Pause B verification gates (paste 5-viewport scrollWidth table)
- Per-sub-item fix description + file:line
- Bundle size delta
- Band-aid removal: success or kept-with-reason
- Visual audit screenshot inventory
- Out of scope reminder
- Tier 1 sequence: 18.1.1 ✅ → next CC pick across (18.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)
- Follow-ups filed (Phase 18.1.2 if band-aid couldn't be removed; any new sites discovered)
- Next operator action: open PR via web UI; merge; hard-refresh kkme.eu in mobile + desktop dark + light

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.1.1 → Shipped appendix
- Currently-active update: 18.1.1 SHIPPED; next CC across (18.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)
- If Phase 18.1.2 follow-up filed (band-aid couldn't be removed), add to Tier 1 with scope summary

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Phase 18.1's band-aid may be masking sites that don't actually overflow without it. Verify each at Pause A before scoping a fix. Don't ship reflows for sites that are already fine.
- **Discipline rule #6 (no editorial chips)** applies to the simplified SVG. MW labels are quantitative; threshold-based color (amber default, brick >500 MW) is a quantitative micro-descriptor, not editorial state ("HIGH"/"LOW"). Don't add words like "BUSY" / "CONGESTED" / "ACTIVE" to arrows.
- **`prefers-reduced-motion`** — if any motion is added (default: no), honor the media query. Phase 18 kept this discipline; don't drop it.
- **Tailwind v4 silent drop pattern** (memory): when adding new `@media` rules in `globals.css`, hoist into fresh blocks. Don't stack inside existing `@media`. Phase 18.1 hit this exact bug.
- **Out-of-scope drift risk:** spec P2-2 (chart tooltips), P2-1 (animation activation), CC-2 component primitives, Phase 19 a11y are all separate. Don't silently extend scope.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete. Per memory `feedback_pr_workflow_minimal.md`.
- **Brand visual:** simplified mobile SVG is replacing a load-bearing brand element. It must read as "Baltic flexibility, daily" at first glance — not just "three boxes with arrows." Use the editorial typography stack (Newsreader for any prose, IBM Plex Mono for MW values). Borrow proportions from the desktop map where possible.

End of prompt.
