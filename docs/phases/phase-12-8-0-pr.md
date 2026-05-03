# Phase 12.8.0 — Tier 0 hot-fix bundle (audit-investigated)

**Branch:** `phase-12-8-0-tier0-hotfix` → `main`
**Preview:** https://phase-12-8-0-tier0-hotfix.kastis-kkme.pages.dev/
**Commits:** 5 (4 features + 1 fixup; handover lands as the 6th in the merge)
**Test count:** 866 → 882 (+16 across 3 new test files)
**Source delta:** ~430 lines added / 89 removed across `.ts` / `.tsx` / `.md`
**Worker untouched. No model_version bump.**

---

## TL;DR (read this first)

**This PR is materially smaller than the Phase 12.8.0 prompt scoped — because the audit was wrong.**

The prompt called for a light-mode rebuild as the headline deliverable, citing audit #2's claim that the toggle ships "a near-black background with white text … white country labels on a white map" and was "the highest-priority bug on the site." Empirical investigation at Pause A + A.5 found:

- 152 `:root` tokens, **114 with `[data-theme="light"]` overrides** (audit said 6).
- The 38 missing overrides are intentionally theme-agnostic (font families, type/space/opacity scales, cycles palette aliases that resolve via the `var()` chain).
- `HeroBalticMap.tsx` is fully tokenized — all country labels, cable strokes, project dots use `var(--…)`.
- Visual screenshots in dev + production light mode (`docs/visual-audit/phase-12-8-0-fix/04-light-hero-LIVE.png`, `05-light-revenue-LIVE.png`, `07-light-contact-LIVE.png`) show clean, readable rendering. No white-on-white. No bounce-trigger.
- `git log --since="2026-04-29" -- app/globals.css HeroBalticMap.tsx` returned empty — ruling out "audit was right historically but recent code fixed it."

**Conclusion: audit hallucinated.** Light-mode commit dropped to a single small chevron fix + the mandatory investigation writeup. The other three sub-items (percentile / keyboard / ticker) ship per Pause A decisions.

This is the **third of four** claims from audit #2 to be confirmed hallucinated, after percentile-toggles and keyboard-shortcuts (both walked back by the consolidated 2026-05-03 revision). Only the ticker claim empirically held up.

Full investigation at [`docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`](../investigations/phase-12-8-0-light-mode-audit-vs-reality.md).

---

## What ships

### Commit 1 — `8c79907` light-mode Path D (audit-vs-reality)

> *Audit claim:* "highest-priority bug on the site, near-black bg, white text, white country labels."
> *Reality:* light mode is functionally complete; one cosmetic chevron is the only finding.

- `app/components/ContactForm.tsx` — replaced an inline data-URL `Select…` chevron painted in dark-mode-tuned `rgba(232,226,217,0.3)` with a sibling `<svg fill="currentColor">` resolving via `style.color = var(--text-muted)`. Reads on both themes.
- `docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md` — the full audit-vs-reality investigation.
- `docs/phases/_post-12-8-roadmap.md` — Phase 12.8.0 entry rewritten to reflect the actual scope (investigation only, not rebuild) and reference the writeup.
- 7 visual-audit screenshots (dev + production, light + dark + post-fix).

### Commit 2 — `cf6ad2b` percentile Path C (static stat-summary strip)

> *Audit claim (walked back by consolidated revision):* "percentile toggles do nothing."
> *Reality:* tiles called `openDrawer('what')` with no per-tile parameter; drawer content was generic.

- `app/components/S1Card.tsx` — replaced 6 `<TileButton>` instances + their local definition with a static `PercentileTile` component (no button, no click, no `cursor:pointer`, no hover-underline). Added a "30-DAY TRAILING DISTRIBUTION" caption above the strip so the band reads as a stat summary above the sparkline.
- `app/components/__tests__/PercentileTile.test.tsx` — 3 anti-regression tests.

S2Card has the same TileButton anti-pattern for its 3 imbalance tiles — out of scope for this commit (operator scoped Path C to S1 percentile only); flagged as a follow-up in the handover.

### Commit 3 — `40be723` keyboard SOT + outline flash + ?-overlay

> *Audit claim (walked back by consolidated revision):* "shortcuts broken."
> *Reality:* 4 of 6 worked (`R / B / I / C`); 2 were dead (`s → #signals` and `m → #context` ids didn't exist on the page); none had visible feedback.

- `app/lib/keyboard-shortcuts.ts` (new) — single source of truth: `KEYBOARD_SHORTCUTS[]` table + `shortcutByKey()` helper.
- `app/lib/__tests__/keyboard-shortcuts.test.ts` (new) — 8 tests including a **section-id-existence parity check** vs the literal section ids in `app/page.tsx`. This regression guard catches the exact drift mode that left `s` and `m` dead before this PR.
- `app/components/PageInteractions.tsx` — full rewrite: handler reads from SOT, fixes the two broken keys, adds 200ms `var(--teal)` outline flash on every shortcut, adds `?` plain-modal help overlay (Esc / backdrop dismiss; no focus trap — Phase A will rebind to chapter numbers 1-5 anyway).
- `app/page.tsx` — footer hint now `.map()` over `KEYBOARD_SHORTCUTS`. Contrast bumped from `--text-ghost` to `--text-tertiary`.

### Commit 4 — `a2bec07` ticker (pause / fade / robust reduced-motion)

> *Audit claim:* "auto-scrolling tickers are a 2008 pattern for a reason."
> *Reality:* this one held up. No pause-on-hover, no edge fade. `prefers-reduced-motion` was technically respected via a brittle `[style*="tickerScroll"]` attribute selector that depended on inline-style serialization order.

- `app/components/HeroBalticMap.tsx` — added `.hero-ticker` + `.hero-ticker-strip` class hooks. CSS for pause-on-hover/focus-within (`animation-play-state: paused`); edge-fade `mask-image` gradient (32px feathered both ends); robust class-based `prefers-reduced-motion` selector. Inner span made `tabIndex=0` so keyboard users can pause the strip.
- `app/components/__tests__/HeroTicker.test.tsx` — 5 source-grep guards on the load-bearing class names, selectors, and rules.

### Commit 5 — `0b837db` fixup (test regex + roadmap follow-along)

- `HeroTicker.test.tsx` — drop the `s` (dotAll) regex flag for pre-ES2018 tsc target compatibility; switch to explicit `[\s\S]*?`.
- `_post-12-8-roadmap.md` — accept operator's mid-session edits (Phase 12.10.0 emergency hallucinated-entity purge + Phase 12.10 expansion to A–F categories).

---

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 882 / 882 passed |
| `npm run lint` | 40 errors / 129 warnings — **identical to main baseline** (no new errors) |
| `npm run build` | compiled in 7.4s; 8 static pages prerendered |
| Cloudflare Pages preview | live at https://phase-12-8-0-tier0-hotfix.kastis-kkme.pages.dev/ — re-tested all 4 sub-items |
| Visual screenshots | 17 captures in `docs/visual-audit/phase-12-8-0-fix/` (12 dev/prod pre+post + 5 from the preview deploy) |

### Preview re-test snapshots (Pause C)

| File | What it verifies |
|---|---|
| `13-PREVIEW-light-hero.png` | Hero in light mode on the CF preview deploy — clean, readable |
| `14-PREVIEW-light-percentile.png` | New "30-DAY TRAILING DISTRIBUTION" caption + static label strip |
| `15-PREVIEW-keyboard-overlay.png` | `?` help overlay listing all 8 shortcuts |
| `16-PREVIEW-ticker.png` | Edge-fade visible at right cut-off |
| `17-PREVIEW-light-contact-chevron.png` | Chevron now visible on `Select…` (was nearly invisible pre-fix) |

---

## Process finding (audit credibility taxonomy)

3 of 4 visual-inference claims from audit #2 confirmed hallucinated this session (light-mode, percentile, keyboard). Only the ticker claim empirically held up. Hit rate: **25% on visual-inference claims that were not backed by screenshots or code-level grep.**

By contrast, the 2026-05-03 primary-source data audit (Litgrid / Energy-Charts / BTD cross-checks) has held up under independent Cowork-side curl verification — those findings stand and Phase 12.10 ships them as authoritative.

A standing CLAUDE.md "audit triage" rule that treats visual-inference claims as hypotheses-to-investigate rather than bugs-to-fix will land as a follow-up branch after Phase 12.10 ships, bundled with the data-claim discipline rules from this work and Phase 12.10. See handover Session 28 for the full taxonomy.

---

## Backlog discovered this session

1. **S2Card imbalance tiles** use the same TileButton anti-pattern (3 tiles all wired to `openDrawer('what')`). Out of scope for this commit. Follow-up: extend Path C to S2 once operator confirms.
2. **Roadmap edit-conflict protocol**. `_post-12-8-roadmap.md` was edited by both CC and operator mid-session. Worked out via the fixup commit but the convention deserves a documented rule (see handover §28 protocol question).
3. **Standing CLAUDE.md "audit triage" rule** — separate follow-up branch after Phase 12.10 ships.

---

## Sequencing — what ships next

Per the updated `_post-12-8-roadmap.md` Tier 0 sequence after this PR merges:

1. **Phase 12.10.0** (emergency hallucinated-entity purge — UAB Saulėtas Pasaulis 500 MW fabrication on production homepage) — **URGENT**, ~1h, ships first
2. Phase 12.10 (data discrepancy bundle, expanded to ~6-8h)
3. Phase 12.8.1 (backtest caption clarification, ~30-60 min)
4. Phase 12.9 (worker + header KPI bundle, ~1.5-2h)
5. Phase 4G (intel encoding, ~1.5h)

Then Tier 1 (12.12 + 12.14 + 7.7g).

---

## Rollback

Each commit is independent — no cross-dependencies. If light-mode commit causes a regression, revert `8c79907`. If percentile fix breaks something, revert `cf6ad2b`. If keyboard handler hijacks an unintended event, revert `40be723`. If ticker mask breaks layout, revert `a2bec07`. The fixup commit `0b837db` is safe to keep regardless.

---

## What this PR does NOT do (scoped out)

- No light-mode token rebuild (the audit's premise was empirically false).
- No worker changes / no `model_version` bump.
- No S2Card imbalance-tile fix (parallel anti-pattern, deferred for follow-up).
- No backtest-chart caption clarification (Phase 12.8.1).
- No `gh pr create` (operator opens PRs via GitHub web UI per CLAUDE.md).
