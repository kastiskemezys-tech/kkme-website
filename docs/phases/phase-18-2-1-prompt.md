# Phase 18.2.1 — Baltic palette retune (medium scope)

**Branch:** `phase-18-2-1-baltic-palette-retune` off latest main.
**Estimate:** ~3-5h CC.
**Risk class:** MEDIUM. Token-level CSS edits on accent palette + chart-theme module. Cascades across 30+ files (per roadmap). Visual audit at 6 configs REQUIRED.
**Three pause points.**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main post-19.2.2 merge. Per `feedback_local_build_verification.md`: local `npm run build && npx serve out` smoke-test REQUIRED. Per `feedback_chrome_mcp_orphans.md` v2: playwright fallback at `scripts/_phase-18-2-1-probe.mjs` (template: `scripts/_phase-19-2-1-probe.mjs`; ensure `OUT_VIS` routes to `docs/visual-audit/phase-18-2-1/`). Per `feedback_canvas_chartjs.md`: chart palette changes via CSS vars propagate through chartTheme.ts's existing getComputedStyle resolution path — verify charts render correctly post-retune.

---

## Why this phase exists

Phase 19.2 + 19.2.1 closed 231+33 = 264 axe-core color-contrast violations via `--text-muted` token shifts + inline-opacity removal. **21 violations remain**, all in accent-color territory: `--teal` / `--rose` / `--amber` / `--accent-amber` failing WCAG AA by slim margins (~3.7-4.4 against cream backgrounds; need 4.5). 2 of those are pipeline-on-colored-bg labels — same family.

Two earlier signals pre-existed:
- **Designer-developer spec P2-2** prescribes specific accent hex values (`#1a3833` teal / `#d4a574` amber / `#a8324a` rose per the spec doc) that don't match Phase 18's shipped tokens.
- **Chart palette consistency (deferred from Phase 19.2 pick #8)** — chartTheme.ts pulls token values via getComputedStyle; chart visuals inherit accent tokens. Currently divergent from spec; need coordinated retune.

This phase reconciles design spec + WCAG AA + chart consistency on the accent palette layer.

---

## Pre-decided design picks (operator-approved 2026-05-18)

| # | Decision | Pick |
|---|---|---|
| 1 | Scope | **Medium** — 19 axe-flagged accent text/border sites + chart palette tokens (chartTheme.ts). Excluded: pipeline-bar background colors (would require bar-component redesign; defer as Phase 18.2.2 candidate if appetite); status sentiment palette (locked per design principles memory; see #4) |
| 2 | Reference source | **(c) Hybrid** — spec P2-2 hex values as starting point. At each token, verify WCAG AA against the cream backgrounds (`--bg-page` / `--bg-card` / `--bg-elevated` in light mode). If spec value passes ≥4.5:1, ship spec value. If spec value still fails, adjust toward darker until AA clears (minimum delta) — annotate the spec-vs-actual gap in handover |
| 3 | Adjustment policy | **Minimum-delta** — smallest hex shift that clears AA. Phase 19.2 precedent (alpha shifts of 0.05-0.10) sets the restraint expectation. Don't ratchet brand feel beyond what AA forces |
| 4 | Sentiment palette | **Locked.** Memory: "seven locked design principles" include sentiment palette. Audit at Pause A whether any accent token overlaps with sentiment tokens (e.g., `--positive` vs `--teal`; `--negative` vs `--rose`). If overlap: do NOT shift sentiment hex; instead exception-annotate the failing site OR add a separate `--teal-accent-text` / `--rose-accent-text` token used only for text-on-cream WCAG paths. New tokens allowed ONLY in this specific overlap-mitigation case (rule #4 + new-token discipline rule from 19.2 modified for this exception) |
| 5 | Multi-viewport audit grid | **6-config** — dark/light × 1440/1024/414. Phase 18.2.1 touches more surfaces than 19.2; tablet breakpoint coverage warrants the extra captures (~15 min PNG capture cost) |
| 6 | Documented-exception threshold | **Operator-approved exceptions allowed.** Phase 19.2's 2 already-held exceptions (white-on-mint chip, 3:1-large-text decorator) set precedent. Any new exception flagged with brand-justification + handover-documented. axe-core target: 21 → ≤2 (preserves Phase 19.2 baseline exceptions) |
| 7 | Chart palette | chartTheme.ts is the integration point. Verify charts render correctly post-retune via local-build + 6-config probe. No new chart styling code — token shifts propagate via existing getComputedStyle resolution |
| 8 | Out of scope | Hero map colors (separate visual system). Pipeline-bar background colors (Phase 18.2.2 candidate). Sentiment palette shifts (locked). Backgrounds (Phase 18 brand-locked). Font sizes (Phase 19.2 forbidden bypass) |

---

## Discipline rules load-bearing here

- **#1 audit-triage** — Phase 19.2.1's "19 accents" count was an aggregation. Pause A re-runs axe at all 6 configs; capture exact failing selectors + computed FG/BG/ratio per violation. If count differs materially, surface.
- **#4 cross-card consistency** — accent token shifts cascade across 30+ files per roadmap estimate. Same token = same hex everywhere; mid-cascade picks must be consistent. Document call-site counts per token at Pause A.
- **#5 roadmap edit-conflict** — no roadmap edits from CC.
- **#6 no-editorial-state-label** — N/A for palette work (no chip/regime introduction).

---

## Pause A — Audit + propose retune (~45-60 min)

1. **Re-run axe-core at all 6 configs** via playwright probe (template: `scripts/_phase-19-2-1-probe.mjs`; clone to `scripts/_phase-18-2-1-probe.mjs` with `OUT_VIS=docs/visual-audit/phase-18-2-1/`). Capture per-config violation list.

2. **Token inventory.** For each accent token (`--teal`, `--rose`, `--amber`, `--accent-amber`, `--mint`, plus any related strong/subtle/bg variants), grep `app/` for call-site count + capture current hex per mode.

3. **Per-violation table** (cross-product of axe output + token inventory):

| # | Selector | FG token (current hex) | BG token (current hex) | Current ratio | AA threshold | Mode (light/dark) | Spec P2-2 hex (target) | Proposed hex (post-retune) |
|---|---|---|---|---|---|---|---|---|

4. **Sentiment overlap audit.** Grep `app/` + `app/globals.css` for `--positive` / `--caution` / `--negative` token definitions and consumers. If `--positive` resolves to the same hex as `--teal` (or similar overlap), flag at Pause A. Do NOT propose shifting sentiment tokens — propose either (i) exception-annotate the site OR (ii) introduce dedicated `--teal-accent-text` etc. tokens for WCAG-text path (per pick #4 exception).

5. **Spec P2-2 hex reconciliation.** For each spec value `#1a3833` / `#d4a574` / `#a8324a` (or actual spec hex from `docs/specs/2026-05-06-designer-developer-spec.md`):
   - Compute ratio vs each cream background (`--bg-page` / `--bg-card` / `--bg-elevated`).
   - If ≥4.5: ship spec value as-is.
   - If <4.5: propose minimum-delta darkening to clear AA; surface the spec-vs-shipped gap in handover.

6. **Chart palette verification.** Read `app/lib/chartTheme.ts`. Confirm chart colors resolve via getComputedStyle from the accent tokens (per Phase 18.2). If yes: token shifts propagate automatically. If no: flag any hardcoded hex in chart code as additional fix surface.

7. **Cascade-surface count.** Per token, document total call-sites affected.

**Pause A output:** the per-violation table + sentiment-overlap findings + chart-theme verification + cascade counts + any spec-vs-WCAG gap annotations. STOP and wait for operator approval before Pause B. Operator may want specific shifts re-tuned.

---

## Pause B — Apply token shifts (~1-1.5h)

Per Pause A approval:

1. **Edit `app/globals.css`** — minimal-line token hex shifts per the per-violation table. Comment each with WCAG-AA delta + originating violation count:
   ```css
   /* Phase 18.2.1: WCAG 2.1 AA — shift from #137a65 to #0e6155 (4.18:1 → 4.62:1 vs --bg-card light). 12 axe-flagged sites. */
   --teal: #0e6155;
   ```

2. **Per-mode handling.** Each accent may need light + dark hex separately if WCAG fails differently per mode. Use existing `[data-theme="dark"]` block in globals.css.

3. **Sentiment overlap mitigation** if Pause A surfaced overlap: add `--teal-accent-text` / `--rose-accent-text` / etc. dedicated text-path tokens ONLY at the overlapping sites. Don't shift `--positive` / `--caution` / `--negative`.

4. **Re-run axe-core** on local build immediately after edits. Confirm violation count drops 21 → ≤2 (or documented-exception count per pick #6).

5. **Run gates:**
   - `npx tsc --noEmit`
   - `npm run test` (baseline 919/919 deterministic post-19.2.2)
   - `npm run lint`
   - `npm run lint:no-raw-spacing`
   - `npm run lint:no-editorial-chips`
   - `npm run build`

**STOP and wait for operator approval before Pause C** (multi-viewport visual evidence depends on shipped state).

---

## Pause C — Verify (~1-1.5h)

- **Local-build smoke-test (REQUIRED):** `npm run build && npx serve out -l 3100`; 5 routes HTTP 200; 8 chunks HTTP 200.
- **axe-core final scan** at all 6 configs via probe script. Capture before/after delta table. Expected: 21 → ≤2 across all configs.
- **DOM probe** via chrome-devtools-mcp (or playwright per memory):
  - Sample 5 previously-failing accent selectors (sample across teal/rose/amber); verify ratio now passes
  - Verify charts render correctly (no broken styling from getComputedStyle resolution)
  - Re-run Phase 19's editorial regex check (no regressions)
- **Multi-viewport visual evidence (6 PNGs to `docs/visual-audit/phase-18-2-1/`):**
  - `light-1440.png` · `light-1024.png` · `light-414.png`
  - `dark-1440.png` · `dark-1024.png` · `dark-414.png`
  - Compare against Phase 19.2.1's `docs/visual-audit/phase-19-2-1/{light,dark}-1440.png` for visual continuity. Operator-side acceptance: brand character preserved? Charts read correctly?
- **Handover Session 70 entry** documenting per-token shifts with before/after ratios, spec-vs-shipped gap (if any), sentiment-overlap mitigation (if any), cascade-surface counts, axe-core delta, exception annotations.
- **Roadmap delta needed (Cowork applies per rule #5 + sequencing memory step 10):**
  - Phase 18.2.1 → Shipped appendix
  - Update "Currently active" pointer
  - Note: axe-core baseline now ≤2 (the documented exceptions)
  - File Phase 18.2.2 (pipeline-bar background colors + 2 pipeline-on-colored-bg label sites) if scope #1 deferred it

Branch push. Operator opens PR + merges.

---

## What NOT to do

- **No sentiment palette shifts** (`--positive` / `--caution` / `--negative` hex stays). Pick #4.
- **No pipeline-bar background changes.** Pick #1 — defer to 18.2.2.
- **No new tokens** except dedicated `--<color>-accent-text` overlap-mitigation case per pick #4.
- **No background-color shifts.** Phase 18 brand-locked.
- **No chart styling code edits.** Token-driven only — getComputedStyle resolution path stays.
- **No hero map color changes.** Separate visual system.
- **No font-size bypass for "large text" AA threshold.** Solve at color layer.
- **No HSL/LCH conversion.** Stay with hex.
- **No roadmap edits** per rule #5.
- **No PR body, no branch delete** per `feedback_pr_workflow_minimal.md`.
