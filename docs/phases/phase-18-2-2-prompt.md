# Phase 18.2.2 — Pipeline-bar on-colored-bg label contrast

**Branch:** `phase-18-2-2-pipeline-bg-contrast` off latest main.
**Estimate:** ~1-2h CC.
**Risk class:** LOW-MEDIUM. Single component (S4Card pipeline bar) + possibly globals.css chip-bg tokens. Visual change to the hero pipeline bar — needs visual sign-off.
**Two pause points.**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main. Per `feedback_local_build_verification.md`: local build smoke-test REQUIRED. Per `feedback_cowork_sandbox_git_locks.md`: prompt is sandbox-owned — operator pre-flight `sudo chown $(whoami) docs/phases/phase-18-2-2-prompt.md`.

---

## Why this phase exists

Phase 18.2.1 deferred 4 axe violations: text rendered ATOP colored pipeline-bar segment backgrounds in S4Card's hero pipeline bar (the "installed / TSO-reserved / intention" stacked bar):

- `text-primary` on `#298672` (mint chip): **3.61** light / **3.02** dark — needs 4.5
- `text-primary` on `#947434` (amber chip): **3.65** light / **2.79** dark — needs 4.5

These are the last fixable axe violations. After this, axe baseline = 4 irreducible documented exceptions (text-ghost decoratives + white-on-mint chip elsewhere). Closes the a11y arc.

---

## Pre-decided design picks (operator to confirm at Pause A)

| # | Decision | Pick |
|---|---|---|
| 1 | Compliance target | WCAG 2.1 AA 4.5:1 (the chip labels are small body text, not large) |
| 2 | Fix direction | **Darken the chip background hex** so the existing light/white label text clears 4.5:1 — preserves the "label-on-colored-segment" visual pattern. Alternative if darkening muddies the mint/amber semantic distinction: swap label text to a near-white high-contrast token (but on mid-tone chips, darker-bg is usually cleaner than lighter-text) |
| 3 | Per-mode | Light + dark both must clear 4.5:1; per-mode hex if needed |
| 4 | New tokens | No — adjust the existing pipeline-segment bg tokens (likely `--teal-strong` / `--amber-strong` or inline hex in S4Card) |
| 5 | Visual continuity | 1-2 PNGs (S4Card pipeline bar, light + dark). Bar segments must stay visually distinguishable (mint ≠ amber) post-darkening |
| 6 | axe target | 8 → 4 (closes the 4 pipeline-bg violations; leaves 4 documented exceptions) |

---

## Discipline rules load-bearing here

- **#1 audit-triage** — confirm the exact failing selectors + computed colors at Pause A via axe re-scan. Phase 18.2.1's audit located these in S4Card hero pipeline bar; verify post-18.2.1 line numbers.
- **#4 cross-card consistency** — if the same chip-bg pattern appears elsewhere (RevenueCard chips, intel-feed magnitude chips), audit at Pause A; fix consistently or scope-note.
- **#5 roadmap edit-conflict** — no roadmap edits from CC.
- **#6 no-editorial-state-label** — N/A.

---

## Pause A — Locate + propose (~20-30 min)

1. **Re-run axe at 6 configs** (clone `scripts/_phase-18-2-1-probe.mjs` → `_phase-18-2-2-probe.mjs`, `OUT_VIS=docs/visual-audit/phase-18-2-2/`). Confirm the 4 pipeline-bg violations + their exact selectors/colors.

2. **Locate the chip backgrounds.** Grep S4Card for the pipeline-bar segment rendering (`#298672` / `#947434` OR the token that resolves to them — likely `--teal-strong` / `--amber-strong`). Document file:line + whether hex is inline or tokenized.

3. **Compute minimum-darken targets.** For white/light label text on the chip:
   - Mint `#298672`: darken until white-text ratio ≥4.5. Compute target hex.
   - Amber `#947434`: same.
   - Verify both modes (light + dark may render the chip differently).

4. **Distinguishability check.** After darkening, do mint and amber chips stay visually distinct from each other AND from neighboring segments? If darkening collapses the palette, propose the text-swap alternative instead.

5. **Cross-card chip audit (rule #4).** Grep for other `text-primary`/`--white` on colored-chip patterns. Scope-note any found.

**Pause A output:** axe confirmation + chip location + proposed darken hex (per mode) + distinguishability assessment. STOP and wait for operator approval.

---

## Pause B — Apply + verify (~30-45 min)

Per Pause A approval:

1. Apply chip-bg darkening (or text-swap) at located sites. If tokenized, edit globals.css; if inline, edit S4Card.
2. Re-run axe → confirm 8 → 4.
3. Gates: `npx tsc --noEmit`, `npm run test` (919/919), `npm run lint`, `npm run lint:no-raw-spacing`, `npm run lint:no-editorial-chips`, `npm run build`.
4. Local-build smoke-test: 5 routes + 8 chunks HTTP 200.
5. DOM probe: sample the 4 fixed selectors, verify ratio ≥4.5; chips visually distinct.
6. 1-2 PNGs (S4Card pipeline bar light + dark) → `docs/visual-audit/phase-18-2-2/`.
7. Handover Session 72 entry: per-chip darken values, axe delta, distinguishability note.

**Roadmap delta needed (Cowork applies per rule #5):**
- Phase 18.2.2 → Shipped appendix
- Note: axe baseline now 4 (irreducible documented exceptions) — a11y arc complete
- Update "Currently active" pointer

Branch push. Operator opens PR + merges.

---

## What NOT to do

- **No new tokens.** Adjust existing chip-bg tokens/hex.
- **No accent-text-token changes** (Phase 18.2.1 turf — those are settled).
- **No font-size bypass** for the 4.5 threshold.
- **No background changes outside the pipeline-bar chips.**
- **No roadmap edits** per rule #5.
- **No PR body, no branch delete** per `feedback_pr_workflow_minimal.md`.
