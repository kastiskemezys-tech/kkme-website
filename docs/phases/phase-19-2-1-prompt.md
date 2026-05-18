# Phase 19.2.1 — Inline opacity audit (component-level cleanup)

**Branch:** `phase-19-2-1-inline-opacity-audit` off latest main.
**Estimate:** ~1-1.5h CC.
**Risk class:** LOW. Component-level inline-style edits across ~3-5 files; no token shifts; no cascade beyond the specific sites touched.
**Two pause points** — Pause A is per-site inventory + fix-pick; Pause B applies + verifies via axe re-scan.

Per `feedback_cowork_cc_sequencing.md`: starts on clean main post-19.2 merge. Per `feedback_local_build_verification.md`: local `npm run build && npx serve out` smoke-test REQUIRED for the multi-viewport visual verify.

---

## Why this phase exists

Phase 19.2 closed 231 of 259 axe-core color-contrast violations via token shifts (`--text-muted` + tertiary/secondary alpha ratchets). 28 remain as documented exceptions:

- **13 inline-opacity × `--text-tertiary` / `--text-primary` sites** — `style={{ opacity: 0.35-0.7 }}` applied on top of token alpha. Token-level fix can't address these (compounding opacity over-darkens non-opacity-tagged consumers). **THIS PHASE.**
- ~12 accent-color failures (`--teal` / `--rose` / `--amber` / `--accent-amber` failing by slim margins) — deferred to existing Phase 18.2.1 (Baltic palette retune).
- 1× `--white` on `--mint` chip + 1× decorator at 3:1 large-text boundary — held as documented exception (visual continuity load-bearing).

Closing the 13 inline-opacity sites brings total from 28 → ~15 (the 12 accents + 2 docs-exception remaining). Final accessibility cleanup before Phase 18.2.1 takes the palette layer.

---

## Pre-decided design picks (operator-approved 2026-05-17)

| # | Decision | Pick |
|---|---|---|
| 1 | Compliance target | WCAG 2.1 AA: 4.5:1 body / 3:1 large text — same as 19.2 |
| 2 | Fix-path preference | **(b) drop inline opacity; use darker token directly.** Cleanest long-term — opacity isn't part of the design system anyway. Fallback to (a) raise opacity only if (b) requires a token that doesn't yet exist OR breaks visual hierarchy |
| 3 | New tokens? | **No** — same discipline as 19.2 |
| 4 | Aria-hidden exception | If a site is decorative (placeholder / loading shimmer / chart hover artifact), add `aria-hidden="true"` and accept the visual ratio. Mirror Phase 19.2's pattern on `--text-ghost` |
| 5 | Visual continuity test | 2 viewport PNGs (1440 light + 1440 dark) — lighter than 19.2's 4-PNG grid since changes are surgical |
| 6 | axe-core success target | Final scan: total violations 28 → ≤15 (allowing for any sites that won't compute-pass post-fix due to compound-opacity edge cases) |
| 7 | Out of scope | Accent-color sites (deferred to 18.2.1). Token alpha shifts (Phase 19.2 turf). Chart palette (Phase 18.2.1). |

---

## Discipline rules load-bearing here

- **#1 audit-triage** — Phase 19.2's "13 inline-opacity sites" was a pattern aggregation; exact count + selector list must be Pause-A grep verified. If actual count differs, surface in Pause A report.
- **#4 cross-card consistency** — if the same `opacity: 0.5` pattern recurs across N similar component sites (e.g., LitGrid stage breakdown rows), pick the same fix everywhere — don't mix (a) and (b) across siblings.
- **#5 roadmap edit-conflict** — no roadmap edits from CC.
- **#6 no-editorial-state-label** — N/A; pure style work.

---

## Pause A — Per-site inventory (~20-30 min)

1. **Grep app/components/** for inline opacity on text elements:
   ```
   grep -nrE "opacity:\s*0\.[0-9]+" app/components/ | grep -iE "text|color|font|fontSize" | head -40
   ```
   Plus broader sweep: `grep -nrE "style=\{\{.*opacity" app/components/`.

2. **Cross-reference with axe-core output** from Phase 19.2's Pause A artifacts (likely at `/tmp/axe-phase19-2/probe-*.json` if still on disk, OR re-run `npx --yes @axe-core/cli@latest http://localhost:3100/ --exit-on-violation false` after `npm run build && npx serve out -l 3100`). Match axe-failing-selectors to the inline-opacity grep results.

3. **Per-site table** (expect ~13 rows; may be fewer if some are duplicate selectors or wrapped in shared components):

| # | File:Line | Element/Component | Inline opacity | Underlying token | Effective ratio | Pick (a/b/c) | Notes |
|---|---|---|---|---|---|---|---|

4. **For each row, propose the pick:**
   - **(b) Drop inline opacity, swap token:** if an existing token at the right computed-color exists, use it. E.g., `style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}` where the inline-opacity'd effective hex is similar to `--text-muted`: drop opacity, swap to `--text-muted`. Verify the swapped token clears AA at the target context.
   - **(a) Raise opacity:** if no token matches the desired computed-color (e.g., the design intent is a specific between-token value), raise opacity to the minimum that clears AA. Document the resulting effective alpha in the comment.
   - **(c) `aria-hidden`:** if the site is purely decorative (e.g., a loading skeleton placeholder, a chart hover indicator overlay), wrap in `<span aria-hidden="true">` per Phase 19.2 precedent.

5. **Hot-site verification:** Phase 19.2's Pause A flagged "LitGrid stage breakdown" as the likely concentration. Confirm location + count.

**Pause A output:** the per-site table + Pause B fix-plan summary. STOP and wait for operator approval before Pause B.

---

## Pause B — Apply + verify (~30-45 min)

Per Pause A approved table:

1. Apply per-site fixes. Track files-touched count (expect 3-5 components).

2. Run gates (frontend touched, build required):
   - `npx tsc --noEmit`
   - `npm run test`
   - `npm run lint`
   - `npm run lint:no-raw-spacing`
   - `npm run lint:no-editorial-chips`
   - `npm run build`

3. **Local-build smoke-test:** `npm run build && npx serve out -l 3100`; 5 routes HTTP 200; 8 chunks HTTP 200.

4. **axe-core re-scan:** `npx --yes @axe-core/cli@latest http://localhost:3100/ --exit-on-violation false`. Capture violation count. Target: 28 → ≤15.

5. **DOM probe via playwright** (chrome-devtools-mcp may disconnect per memory):
   - Sample 3 previously-failing inline-opacity selectors from Pause A
   - Verify each now passes (cite computed FG/BG/ratio)
   - Re-run Phase 19's editorial regex check (no regressions)

6. **2 viewport PNGs** to `docs/visual-audit/phase-19-2-1/`:
   - `light-1440.png`
   - `dark-1440.png`
   Compare against Phase 19.2 PNGs for visual continuity (operator-side acceptance).

7. **Handover Session 68 entry** documenting per-site fixes applied, axe-core delta (28 → ?), gate deltas, exception annotations if any.

**Roadmap delta needed** (Cowork applies per rule #5 + sequencing memory step 10):
- Phase 19.2.1 → Shipped appendix
- Update "Currently active" pointer
- Note: 15 (or whatever count) remaining axe violations all bucketed as Phase 18.2.1 (accents) + documented exception (mint chip, large-text boundary)

Branch push. Operator opens PR + merges.

---

## What NOT to do

- **No token shifts.** Phase 19.2 turf.
- **No accent-color edits.** Phase 18.2.1 turf.
- **No background changes.** Brand-locked.
- **No new aria-hidden sprawl** — only on genuinely decorative content (skeleton/shimmer/hover artifact), not load-bearing text.
- **No raising opacity into "passes AA but barely" zone (< 4.7) on body text.** Aim for ≥4.8 margin where possible.
- **No new tokens.** Same discipline as 19.2.
- **No roadmap edits** per rule #5.
- **No PR body, no branch delete** per `feedback_pr_workflow_minimal.md`.
