# Phase 18.1 — Mobile foundation pass

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~2–3 hours, single PR, three pause points (Pause A discovery, Pause B foundation, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** Phase 18 shipped the editorial visual identity in 2026-05-06 but the layout is desktop-first. Operator's audit-v2 + designer/dev spec both flagged the mobile experience as broken: hero overflows at <900px, KPI ticker squeezes 6 columns into ~410px, touch targets are 32×25px (below WCAG 2.5.5 minimum 44×44), no `:active` substitute after `-webkit-tap-highlight-color: transparent`, masthead theme toggle renders at 0×0px. Phase 12.11 just closed the data credibility gap; Phase 18.1 closes the device-reach gap. Doesn't replace Tier 6's broader mobile pass — unblocks "site reads on phone."

**Baseline status (Cowork-grepped 2026-05-06):**

- **No viewport meta tag in `app/layout.tsx`** — confirmed via grep (`Grep "viewport" app/layout.tsx` → no matches). Without it, mobile browsers render at desktop width. This is the load-bearing root cause of the spec's "scrollWidth 556px on 410px viewport" claim.
- **Hero grid template at `HeroBalticMap.tsx:357`** — `minmax(260px, 300px) minmax(540px, 620px) minmax(260px, 300px)` = MIN 1060px width. Below 1060px viewport → forced overflow. This is the spec's "hero broken on phones" claim.
- **Existing breakpoints in `globals.css`:** 520 / 720 / 768 / 900 / 1100 (5 values, inconsistent). Spec wants rationalization to 3 (mobile <520, tablet 520-900, desktop ≥900) but that's a bigger refactor — out of scope this phase. 18.1 stays additive.
- **`width: Npx` violations:** 11 hits across `globals.css` + `RevenueCard.tsx`. Audit at Pause A; replace with `max-width: 100%` where they prevent fluid layout.
- **`prefers-reduced-motion: reduce` already honored** at `globals.css:700, 725, 960`. Good baseline; this phase extends to new motion additions.

---

## What ships

5 sub-items, single PR.

1. **Viewport meta tag** — add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` to `app/layout.tsx` Next.js `<head>` (or via Next 15's `viewport` export). This is the highest-leverage single fix — most subsequent items become cosmetic only after the meta tag is in place.

2. **Hero grid responsive collapse** (spec P1-1) — at `HeroBalticMap.tsx:357`, the 3-column grid `minmax(260px, 300px) minmax(540px, 620px) minmax(260px, 300px)` collapses to single-column stack below 900px. Map becomes either a static SVG simplified for mobile (drop ASCII dots) OR a `<details>` opt-in below 600px. Interconnectors render as horizontally scrollable carousel below 600px (`overflow-x: auto; scroll-snap-type: x mandatory`).

3. **KPI ticker reflow** (spec P1-2) — at `SignalBar.tsx:110`, `repeat(${signals.length}, 1fr)` (6-col on desktop) collapses per spec:
   ```css
   /* desktop default: 6-col 1fr each */
   @media (max-width: 900px) { grid-template-columns: repeat(3, 1fr); }
   @media (max-width: 520px) {
     grid-auto-flow: column;
     grid-auto-columns: minmax(120px, 1fr);
     overflow-x: auto;
     scroll-snap-type: x mandatory;
   }
   ```
   No tile wraps its label or value at 360 / 414 / 768 / 1024 / 1440px.

4. **Touch targets + native press feedback** (spec P1-3) — minimum 44×44 px on mobile for ALL interactive controls (2h/4h pills, LT/LV/EE country pills, FCR product pills, "Reading this card" expanders, masthead theme toggle, primary buttons). `:active` state = `transform: scale(.97)` + `opacity .85` for 80ms (`--motion-instant`). `:focus-visible` ring 2px `--accent` with 2px offset. Replace any `transition: all` with explicit property lists. Spec's CSS:
   ```css
   .btn, .pill, .toggle { min-block-size: 44px; min-inline-size: 44px; }
   @media (pointer: fine) { .btn, .pill, .toggle { min-block-size: 32px; min-inline-size: auto; } }
   .btn:active, .pill:active { transform: scale(.97); opacity: .85; transition: transform var(--motion-instant), opacity var(--motion-instant); }
   :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
   ```
   Define `--motion-instant: 80ms` and `--motion-fast: 160ms` in `:root` per spec CC-1 if not already present.

5. **Smooth scroll + overscroll-contain** (spec P1-5) — `globals.css`:
   ```css
   html { scroll-behavior: smooth; scroll-padding-top: 96px; }
   @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
   body { overscroll-behavior-y: contain; }
   ```
   Anchor-jump nav animates to section over ~300ms; iOS pull-to-refresh no longer triggers during deep scrolls.

`model_version` does NOT bump. No worker, no engine, no test-coverage logic changes (existing tests should pass). Possibly +1-3 specs for any new helper functions if introduced.

---

## OUT of scope

- Mobile breakdown bars (spec P1-4) — defer to Phase 18.1.1 if visible after the foundation pass; current audit suggests bars collapse to 1px below 720px in `RevenueCard.tsx`. Verify at Pause A; if blocking, fold in; otherwise file follow-up.
- Engine / worker changes
- Chart polish (Phase 18.2) — chart tooltips + tornado pointer-events fix is a separate phase
- Animation activation (Phase 18.3) — dormant keyframes + count-up tween is a separate phase
- A11y additions beyond `:focus-visible` ring (Phase 19)
- Static IA pages / footer (Phase 20)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- Type-scale rationalization (Phase 7.7g-a-3)
- Component primitives (Phase 7.7g-b reduced)
- Breakpoint inventory rationalization (5 → 3) — scope creep risk; defer

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #5 roadmap edit-conflict)
2. `docs/handover.md` Sessions 43 (Phase 7.7g-a-2), 44 (Phase 12.11)
3. `docs/specs/2026-05-06-designer-developer-spec.md` — sections P1-1 through P1-5 are the design source-of-truth for this phase. Pre-decided mockup, breakpoints, CSS recipes. Do not re-derive.
4. `docs/phases/_post-12-8-roadmap.md` "Phase 18.1" entry under Currently-active — roadmap source-of-truth for scope
5. `app/layout.tsx` — confirm viewport meta absence
6. `app/components/HeroBalticMap.tsx:357` — current 3-col grid template
7. `app/components/SignalBar.tsx:110` — current 6-col KPI grid
8. `app/globals.css:521-1200` — existing media queries + breakpoint inventory

Memory references (Cowork-side, paste relevant ones into your context as needed):
- `feedback_cowork_sandbox_limits.md` — vitest + next build core-dump in Cowork; tsc + eslint reliable
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `reference_designer_dev_spec.md` — points at the saved spec doc; phase mapping in spec frontmatter

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-12.11-merge commit (~`5fd2ca4` ancestor + Phase 12.11 merge + roadmap-delta commit) or descendant. State understanding (one paragraph): which baseline grep results match current code, which don't, and your plan for §1. Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-1-mobile-foundation
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 baseline (post-12.11)
npm run lint            # 126 baseline (40 errors / 86 warnings)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. Pre-commit must match (with explained delta if any spec count changes).

---

## 2. Pause A — Discovery + scope confirmation

Per discipline rule #1 (audit-triage), re-verify the baseline claims via grep before scoping fixes:

### 2a. Confirm viewport meta absence

```bash
grep -rn "viewport" app/layout.tsx app/head.tsx app/_document.tsx 2>/dev/null
grep -rnE "name=['\"]viewport['\"]" app/ 2>/dev/null
```

Expected: zero matches (Next 15 conventions: viewport set via `export const viewport` in `layout.tsx` or via metadata; absent currently). Confirm + note where the viewport export should live per Next 15 docs.

### 2b. Audit hero + KPI grid templates

```bash
grep -nE "gridTemplateColumns|grid-template-columns" app/components/HeroBalticMap.tsx app/components/SignalBar.tsx
```

Confirm:
- HeroBalticMap.tsx grid forces ≥1060px width (the audit baseline)
- SignalBar.tsx is `repeat(N, 1fr)` where N is signals.length

Decide: collapse hero to single-column stack at <900px, or 2-col stack at <900px (left+right merged) → 1-col at <520px? Recommend single-column stack at <900px per spec P1-1.

### 2c. Touch target audit

Identify the controls. Likely sites:
- `app/components/RevenueCard.tsx` — duration toggle (2H/4H), CAPEX selector (€120/€164/€262), COD selector (2027/2028/2029)
- `app/components/S2Card.tsx` — country pills (LT/LV/EE), product pills (FCR/aFRR/mFRR)
- `app/components/HeroBalticMap.tsx` — interconnector row, possibly more
- `app/components/Masthead.tsx` (or wherever theme toggle lives) — theme toggle 0×0 px claim

```bash
grep -rnE "padding:.*['\"][0-9]+(px)?\s+['\"][0-9]+" app/components/ | grep -iE "pill|toggle|btn|button"
grep -rnE "min-height|minHeight|min-block-size" app/components/
```

Document: per-control current size → target 44×44 fix. Probably 8-10 control sites need the bump.

### 2d. `width: Npx` audit

```bash
grep -rnE "width:\s*[0-9]+px" app/globals.css app/components/
```

11 hits expected. Categorize each:
- Fixed-purpose (e.g., scrollbar `width: 6px`, decorative dots `width: 1px`) → leave as-is
- Layout-locking (e.g., `width: 320px` on a flex child) → migrate to `max-width: 100%` or `min-width: 0`

### 2e. `transition: all` audit

```bash
grep -rnE "transition:\s*all" app/components/ app/globals.css
```

Each hit should be replaced with an explicit property list (per spec P1-3 anti-pattern note). Surface count + sites.

### 2f. Mobile breakdown bars verification (spec P1-4 NOT in scope; verify only)

```bash
grep -nE "BreakdownBar|breakdown.*bar|capex.*breakdown" app/components/RevenueCard.tsx
```

If bars collapse to 1px below 720px in current code, file Phase 18.1.1 follow-up. Don't fold in unless the fix is trivially under 5 lines.

### 2g. Theme toggle 0×0 px claim verification

Find the theme toggle (likely in masthead or layout.tsx). Measure current size (read the JSX/CSS). If genuinely 0×0 (button has no `width`/`height` and content collapses), fold the fix into §3.4. If it's actually visible (e.g., 32×32 with proper padding), update spec note in handover and skip the size-bump for this control.

### Pause A report

Halt + report:

1. Per-baseline-claim verification: VERIFIED / REFINED / NOT REPRODUCIBLE
2. Final scope of touch-target fixes (control list + per-control current → target sizes)
3. Final scope of `width: Npx` migrations (sites to fix vs leave)
4. Recommendation on hero collapse strategy (single-column stack at <900px vs alternative)
5. Mobile breakdown bars — fold in (if trivial) or defer to 18.1.1
6. Theme toggle current state — genuine 0×0 or false claim
7. Refined estimate vs prompt's ~2-3h
8. New CSS variables needed beyond `--motion-instant` / `--motion-fast` (default: none beyond those two)

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes per-item. Suggested order:

1. **Viewport meta tag** — Next 15 `viewport` export in `app/layout.tsx`. Single addition; immediate effect on all subsequent items.
2. **Motion variables** — add `--motion-instant: 80ms`, `--motion-fast: 160ms`, `--motion-base: 240ms`, `--motion-slow: 400ms`, `--ease-standard: cubic-bezier(.2,.8,.2,1)` to `:root` if not already present.
3. **Smooth scroll + overscroll-contain** — `globals.css` html/body rules.
4. **Touch target + active state CSS** — global rules in `globals.css` per spec P1-3. Use `min-block-size`/`min-inline-size` (logical properties) so RTL-safe.
5. **Hero grid responsive collapse** — `HeroBalticMap.tsx:357` template + below-900px media query.
6. **KPI ticker reflow** — `SignalBar.tsx` grid + responsive media queries per spec.
7. **`width: Npx` migrations** — per Pause A categorization.
8. **`transition: all` replacements** — explicit property lists per site.
9. **Theme toggle size fix** — if confirmed 0×0 in Pause A.

For each:
- Read the file end-to-end first (don't grep+sed)
- Verify baseline behavior is preserved (no visual shift on desktop ≥900px viewport)
- Honor `prefers-reduced-motion` for any motion additions

---

## 4. Pause B — Foundation gates

Run all gates:

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 baseline + N if helper specs added
npm run lint            # 126 baseline (or +/- per ESLint impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Visual verification protocol (CC has chrome-devtools MCP):

For each viewport — `360px`, `414px`, `768px`, `1024px`, `1440px`:
1. Open hero / Returns / Build cards
2. Confirm zero horizontal scroll: `document.scrollWidth === document.documentElement.clientWidth`
3. Confirm KPI ticker doesn't wrap labels or values
4. Confirm interactive controls are visibly tappable (≥44px on `360px` and `414px`)
5. Capture screenshots to `docs/visual-audit/phase-18-1/<viewport>-<page>.png`

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason / NOT NEEDED (Pause-A-disproved)
- Per-viewport `scrollWidth === clientWidth` PASS/FAIL
- Touch-target measurement (manual or chrome-devtools): per-control rendered height/width
- Bundle size delta (should be near-zero — CSS-only changes)
- Any Pause-A-discovered follow-ups (mobile breakdown bars, etc.)

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Final visual audit

Confirm screenshots cover all 5 viewports × 3 page sections (hero, returns, build). 15 screenshots minimum at `docs/visual-audit/phase-18-1/`.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/layout.tsx app/globals.css
git commit -m "phase-18-1(foundation): viewport meta + motion vars + scroll behavior + touch-target globals"

git add app/components/HeroBalticMap.tsx app/components/SignalBar.tsx app/components/RevenueCard.tsx app/components/S2Card.tsx app/components/Masthead.tsx
git commit -m "phase-18-1(components): hero grid collapse <900px + KPI ticker reflow + per-control touch targets + transition:all replacements"

git add docs/handover.md docs/visual-audit/phase-18-1/
git commit -m "phase-18-1(handover): Session 45 + 15-screenshot mobile audit"

git push -u origin phase-18-1-mobile-foundation
```

(Adjust file groupings per actual touched set.)

Print PR-creation URL. Per `feedback_pr_workflow_minimal.md`, operator opens PR + click-merge directly; no PR body draft needed.

---

## 6. Handover Session 45

Mirror Session 44 structure. Specific items:
- Headline: mobile foundation; viewport meta + responsive grid collapses + 44×44 touch targets + smooth-scroll
- Branch + base
- Pause A audit results (per-claim VERIFIED / REFINED / NOT REPRODUCIBLE)
- Pause B verification gates (paste actual numbers per viewport)
- Per-fix description + file:line references
- Bundle size delta (expected near-zero)
- Visual audit screenshot inventory
- Out of scope reminder
- Tier 1 sequence: 18.1 ✅ → next CC pick across (18.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)
- Follow-ups filed (P1-4 mobile breakdown bars if deferred, breakpoint rationalization, etc.)
- Next operator action: open PR via web UI; merge; hard-refresh kkme.eu in mobile + desktop dark + light

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.1 → Shipped appendix
- Currently-active update: 18.1 SHIPPED; next CC across (18.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced / 19 / 20)
- If Phase 18.1.1 follow-up filed (mobile breakdown bars, etc.), add to Tier 1 with scope summary
- If breakpoint inventory rationalization surfaces as worth doing, add as Phase 18.1.2 candidate

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** §0 baseline is Cowork-grepped 2026-05-06 but each claim must be re-verified at Pause A. Spec's empirical "scrollWidth 556px on 410px viewport" was instrumented by audit author; the load-bearing root cause is the missing viewport meta tag, but other contributors may exist (e.g., `width: Npx` violations forcing children wider than parent). Audit each before scoping.
- **Mobile-first vs. desktop-default media query strategy.** Spec uses desktop-default + `@media (max-width: ...)` overrides. Existing `globals.css` already uses this pattern. Stay consistent — don't introduce mobile-first reverse-pattern in this phase.
- **Logical properties.** Use `min-block-size` / `min-inline-size` instead of `min-height` / `min-width` for RTL-safety where adding new rules. Don't migrate existing `min-height` for the sake of it (scope creep).
- **`prefers-reduced-motion` honoring.** Any motion addition (smooth scroll, scale-on-active, focus ring transition) must check `prefers-reduced-motion: reduce` and degrade to no-op or instant.
- **Out-of-scope drift risk.** Spec P1-4 (breakdown bars), CC-1 (full token rationalization), Phase 18.2 (charts), Phase 18.3 (animations), Phase 19 (a11y beyond focus ring), Phase 20 (IA pages) are all close-feeling-but-separate. Do NOT silently extend scope.

End of prompt.
