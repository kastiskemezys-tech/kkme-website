# Phase 18.3 — Animation activation

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~2–3 hours, single PR, three pause points (Pause A discovery, Pause B foundation gates + local-build smoke-test + chrome MCP visual verification, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** Phase 18 shipped the editorial visual identity 2026-05-06 with broadsheet masthead + Newsreader hero + bracket-notation source markers. Phase 18.1 + 18.1.3 closed mobile foundation + reflow. Phase 7.7g-a-3 rationalized typography. **What's still missing: motion.** Site reads as static screenshots — feels lifeless on first paint. 11 keyframes are defined in globals.css; only 2 actually run (`live-pulse` + `tickerScroll`). The dropped V-10 idea (count-up animations, deferred Phase 4A) lives in `project_visual_vision.md` ideas-at-risk #5 — closes here.

This phase activates the dormant keyframes per spec P2-1 + adds `useCountUp` hook (spec P2-1 reference impl) + copy-button feedback (P2-3) + card hover-lift (P2-4). All honoring `prefers-reduced-motion: reduce`. Subtle motion that says "live system," not "marketing carousel."

---

## What ships

7 sub-items, single PR, frontend-only.

**(1) Hero mount animation** (~10-15 min) — verify `hero-mount` keyframe applied on first paint. Phase 18's `globals.css:.hero-section { animation: hero-mount 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }` may already run; verify at Pause A. If not running (likely missed in 18.1 hero-section refactors), wire it.

**(2) Card mount fade-in via IntersectionObserver** (~30-45 min) — cards on viewport-entry get `data-mounted="true"` attribute; CSS rule `[data-mounted="true"] { animation: cardFadeIn 240ms cubic-bezier(0.2,0.8,0.2,1) both; }` triggers fade-in. Stagger via CSS `animation-delay` per-card via calc/index. Implement as a small `useIntersectionMount(ref)` hook applied to each top-level card wrapper. Honor `prefers-reduced-motion`: skip the keyframe; just set `data-mounted="true"` immediately.

**(3) useCountUp hook + KPI value tweens** (~30-45 min) — implement spec P2-1 reference:
```ts
// app/lib/useCountUp.ts
function useCountUp(target: number, ms = 240) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current, to = target, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    prev.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
```

Apply at hero numeric sites: RevenueCard €N/MW/DAY, S1 €X/MWh, S2 €X/MW/h, BalticStorageIndex €N, possibly Project IRR %. Skip if `prefers-reduced-motion: reduce` (return target immediately).

Honor formatting helpers (formatNumber from format.ts) — interpolated value passes through formatter for thousands separator etc.

**(4) Skeleton-shimmer on loading state** (~20-30 min) — wherever components have `data-loading="true"` (or equivalent loading state), apply `skeleton-shimmer` keyframe. CSS rule: `[data-loading="true"] { animation: skeleton-shimmer 1.5s linear infinite; }` (or however the existing keyframe is named). Phase 18 may already have data-loading attrs on some surfaces; verify at Pause A. If missing, add to KPI tiles + hero metric block + chart wrappers.

**(5) Copy-button feedback** (~15-20 min) — find copy buttons (existing 📋 emoji button with no feedback per audit-3 §C / spec P2-3). Apply 2-step animation: press scale + check-mark icon swap on click; 1.5s "Copied" toast/affordance. Per spec P2-3:
```tsx
<button onClick={async () => {
  await navigator.clipboard.writeText(formatRange());
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}} aria-label="Copy range" data-copied={copied}>
  {copied ? <CheckIcon/> : <ClipboardIcon/>}
</button>
```

Use existing icon system (lucide-react if present) or simple SVG.

**(6) Card hover-lift on interactive cards** (~15-20 min) — cards with drill-in (Returns, Build, Trading per spec) get on hover: `translateY(-2px)` + `box-shadow: 0 8px 24px rgba(0,0,0,.18)` over 160ms. Pure-display cards (S1/S2/S4 etc. signal cards without drill-in) do NOT lift. Use a `<Card interactive>` boolean prop OR a class hook on the card wrapper.

Honor `prefers-reduced-motion`: skip transform; keep box-shadow only OR no change.

**(7) prefers-reduced-motion gate** (~5 min) — globals.css media query catches all motion keyframes:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Phase 18.1 may already have this — verify at Pause A. If missing, add. Required for accessibility compliance and operator-honest UX.

`model_version` does NOT bump. No worker, no engine, no test logic changes (existing tests should pass; +1-3 specs likely if new useCountUp/useIntersectionMount hooks add unit coverage).

---

## OUT of scope

- Engine / worker changes
- New keyframes beyond the 11 already defined in globals.css
- GSAP-based animations (Phase 18.1.1 had GSAP particle work that contributed to ChunkLoadError; avoid this phase)
- Search command palette (filed separately)
- Provenance label sweep (separate)
- Full a11y MVP (Phase 19)
- Engine math changes
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- New chart libraries
- Theme system changes

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #4 cross-card consistency, #5 roadmap edit-conflict)
2. `docs/handover.md` Sessions 53-55 (recent context)
3. `docs/phases/_post-12-8-roadmap.md` — Phase 18.3 entry under Currently-active
4. `docs/specs/2026-05-06-designer-developer-spec.md` — P2-1 (animation activation), P2-3 (copy feedback), P2-4 (card hover lift)
5. `app/globals.css` — find the 11 defined keyframes (`hero-mount`, `cardFadeIn`, `skeleton-shimmer`, etc.); verify which currently have associated CSS rules vs which are orphaned
6. `app/components/HeroBalticMap.tsx` — hero-mount target site
7. Card components (`RevenueCard.tsx`, `S1Card.tsx`, `S2Card.tsx`, `S4Card.tsx`, `BalticStorageIndexCard.tsx`, etc.) — for card-mount + hero-numeric-tween sites
8. Existing copy buttons (grep for `clipboard.writeText` or 📋 emoji)
9. `app/components/primitives/` — possibly existing animation utilities

Memory references (Cowork-side; embedded in this prompt body since CC can't read Cowork memory):
- **Local-build verification gate REQUIRED at Pause B** — Phase 18.1.1 ChunkLoadError lesson. New hook (useCountUp) + IntersectionObserver pattern is a medium risk class (similar to 18.1.1's MobileBalticMap component + GSAP guard tweak). Run `npm run build && npx serve out -l 3100` + curl HTTP 200 on home + all chunks before commit.
- **Chrome MCP gate restored** 2026-05-07 via `cc` alias; should work cleanly for Pause B visual verification.
- **Tailwind v4 silent-drop pattern** — when adding new `@media` rules in globals.css (specifically the prefers-reduced-motion gate), hoist into fresh blocks. Multi-selector @media also drops silently.
- **Operator workflow:** open PR + click merge; no PR body, no branch delete.
- **V-10 dropped idea** (count-up animations) — originally hooks were created Phase 4A; wiring to hero metrics deferred. Closes in this phase via sub-item 3.

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -10
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-4G.1-merge commit. State understanding (one paragraph): plan for §1 + §2, especially which keyframes are already wired vs orphan, and whether hero-mount already runs. Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-3-animation-activation
npx tsc --noEmit       # 0 errors
npx vitest run          # 924/925 baseline (pre-existing freshnessBadge failure carries)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers.

---

## 2. Pause A — Discovery + scope confirmation

### 2a. Keyframe inventory — what's defined vs what runs

```bash
grep -nE "@keyframes" app/globals.css
grep -nE "animation:|animationName:" app/globals.css app/components/ app/lib/ | grep -v __tests__
```

Document:
- All `@keyframes` defined (expected ~11 per spec P2-1: `pulse`, `shimmer`, `skeleton-shimmer`, `water-shimmer`, `live-pulse`, `cardFadeIn`, `hero-mount`, `hero-pulse`, `fadeOut`, `claude-pulse`, `tickerScroll`)
- For each, whether any `animation:` rule references it (= active) or none (= orphan)
- Confirm sub-item 1 baseline: is `hero-mount` already wired to `.hero-section`?

### 2b. prefers-reduced-motion gate audit

```bash
grep -nE "prefers-reduced-motion" app/globals.css
```

Verify whether the global motion-disable rule exists. If yes, confirm scope. If no, add per sub-item 7.

### 2c. data-loading attribute audit

```bash
grep -rnE "data-loading|isLoading|loading\s*=\s*true" app/components/ app/lib/ | grep -v __tests__ | head -20
```

Find existing loading-state sites where skeleton-shimmer can attach. Identify gap if missing.

### 2d. Copy-button site audit

```bash
grep -rnE "clipboard\.writeText|navigator\.clipboard|📋" app/components/ | head -10
```

Find existing copy buttons. Identify how many; design the feedback pattern (icon library availability, toast style).

### 2e. Card-mount target sites

```bash
grep -rnE "<RevenueCard|<S1Card|<S2Card|<S4Card|<S7Card|<S9Card|<TradingEngineCard|<BalticStorageIndexCard" app/page.tsx | head -15
```

Identify the top-level card list rendered by page.tsx. These are the candidates for `useIntersectionMount` wrap. Decide: wrap each individually, or HOC-style at the page level.

### 2f. KPI tween target sites

Identify the hero numeric values that should count-up:
- RevenueCard €N/MW/DAY hero
- S1 €X/MWh hero
- S2 €X/MW/h hero
- BalticStorageIndexCard €N hero
- Project IRR % display
- Possibly: dispatch totals, fleet operational MW

Each consumes worker data via fetch + state. The useCountUp hook wraps the displayed numeric value. Identify ~5-8 target sites.

### 2g. Card hover-lift target sites

Identify cards that drill-in (have onClick, href, or are otherwise interactive in a navigation sense). Per spec: Returns, Build, Trading. Pure-display cards (signal cards without drill) do NOT lift.

### Pause A report

Halt + report:

1. **Keyframe inventory** — table of 11 keyframes / which are wired / which are orphan
2. **prefers-reduced-motion** — exists / needs adding
3. **data-loading sites** — list + gap (if any)
4. **Copy-button sites** — count + chosen feedback pattern
5. **Card mount candidates** — list of top-level cards + chosen hook approach (per-card wrap vs HOC)
6. **KPI tween candidates** — list of ~5-8 numeric heroes to wrap with useCountUp
7. **Card hover-lift candidates** — interactive cards only; list (typically 3-4 max)
8. **Refined estimate** vs prompt's ~2-3h
9. **Local-build risk pre-check** — new hooks + IntersectionObserver are medium risk class (similar to Phase 18.1.1's new component + GSAP); Pause B local-build smoke-test gate REQUIRED

Wait for explicit operator "proceed" before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes in order (lowest-risk → highest-risk):

1. **(7) prefers-reduced-motion gate** — if missing, add globals.css media query (1 block); zero blast radius
2. **(1) Hero mount verification** — confirm running OR add the `animation` rule
3. **(6) Card hover-lift** — new class on interactive cards; CSS rule with `:hover` transform; small
4. **(4) Skeleton-shimmer** — CSS rule on `[data-loading="true"]`; verify existing data-loading attrs OR add to gap sites
5. **(5) Copy-button feedback** — find sites; replace 📋 with icon-component (reuse lucide-react if Phase 18 imported, otherwise inline SVG); add useState toast logic
6. **(3) useCountUp hook + KPI tweens** — new file `app/lib/useCountUp.ts`; apply at 5-8 hero numeric sites; honor reduced-motion
7. **(2) Card mount + IntersectionObserver** — new hook `app/lib/useIntersectionMount.ts`; apply to top-level card wrappers; CSS animation rule on `[data-mounted="true"]` with stagger via animation-delay

For each:
- Read file end-to-end first
- Verify cross-component impact
- For Tailwind v4 silent-drop: hoist new @media blocks into fresh blocks; multi-selector also drops

---

## 4. Pause B — Foundation gates + LOCAL PRODUCTION BUILD + chrome MCP visual verification

### 4a. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 924 + N if specs added (still 1 pre-existing freshnessBadge fail)
npm run lint            # 127 baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 4b. **REQUIRED: Local production build smoke-test** (mandatory per Phase 18.1.1 lesson)

```bash
npm run build && npx serve@latest out -l 3100
```

Verify (curl-based):
- Home page returns HTTP 200
- All JS chunks return HTTP 200 (no 18.1.1-class ChunkLoadError)
- New hooks (useCountUp, useIntersectionMount) bundled and loadable
- Bundle delta should be near-noise-floor (small hooks + small CSS additions)

### 4c. Chrome MCP visual verification (gate restored 2026-05-07 via cc alias)

Use chrome-devtools-mcp at desktop viewport (1440px is fine for animation testing):

1. **Hero mount on first load** — refresh page, observe hero fading in via 600ms cubic-bezier
2. **Card mounts on scroll** — scroll down past viewport, watch cards stagger-fade in via IntersectionObserver
3. **KPI count-up on data refresh** — trigger a state change (e.g., toggle CAPEX or duration); watch hero number animate from old → new
4. **Copy-button feedback** — click a copy button (likely on the dispatch range or a stat); observe icon swap + toast
5. **Card hover-lift** — hover an interactive card (Returns/Build/Trading); watch translateY + shadow grow
6. **prefers-reduced-motion** — open chrome devtools → Rendering → Emulate CSS: prefers-reduced-motion: reduce → reload page → confirm all motion is minimal/instant; static feel

Capture screenshots at `docs/visual-audit/phase-18-3/` covering each animation state.

If chrome MCP fails: curl-only verification + prose state doc.

### Pause B report

- Per-sub-item status: SHIPPED / DEFERRED-with-reason
- Foundation gates baseline-exact
- Local-build smoke-test: PASS
- Chrome MCP screenshots inventory
- prefers-reduced-motion verified working
- Bundle size delta

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Visual audit

If chrome MCP succeeded: 6+ screenshots covering animation states.
If curl-only: prose state doc per Phase 21+ precedent.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/lib/useCountUp.ts app/lib/useIntersectionMount.ts
git commit -m "phase-18-3(hooks): useCountUp + useIntersectionMount per spec P2-1"

git add app/components/ app/globals.css app/page.tsx
git commit -m "phase-18-3(animations): activate dormant keyframes (hero-mount + cardFadeIn + skeleton-shimmer); copy-button feedback (P2-3); card hover-lift (P2-4); prefers-reduced-motion gate"

git add docs/handover.md docs/visual-audit/phase-18-3/
git commit -m "phase-18-3(handover): Session 56 + visual audit captures"

git push -u origin phase-18-3-animation-activation
```

(Adjust per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 56

Mirror Session 55 structure. Specific items:
- Headline: animation activation; 11 keyframes audited; useCountUp + useIntersectionMount hooks added; copy-button + card hover-lift; prefers-reduced-motion gate
- Branch + base
- Pause A discovery (keyframe inventory + sites)
- Pause B verification gates + chrome MCP screenshots OR curl-only prose
- Per-fix description + sites touched
- Bundle size delta
- prefers-reduced-motion verified
- V-10 dropped-ideas item closed (count-up animations)
- Out of scope reminder
- Tier 1 sequence: 18.3 ✅ → next CC pick across (19 / 12.12 #1+#2 / 7.7g-b reduced / 18.2.1 / 21.1 / 4G.2 / 20 / 18.1.1.1 / texture-redesign-candidate)
- Next operator action: open PR; merge; hard-refresh kkme.eu; verify hero fade-in on load; verify card stagger on scroll; verify count-up on toggle; verify reduced-motion preference respects

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 18.3 → Shipped appendix
- Currently-active update: 18.3 SHIPPED — TODAY'S PLAN COMPLETE; next pick across remaining Tier 1 queue
- V-10 dropped-ideas item closed; update `project_visual_vision.md` Cowork-side memory if surfaced

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Not all 11 dormant keyframes are necessarily worth wiring — some may have been declared for future work that hasn't happened. Audit each and skip ones that don't fit current cards.
- **Discipline rule #6 (no editorial chips).** Animation copy/text shouldn't add editorial language. Just visual motion.
- **Tailwind v4 silent-drop pattern.** New `@media (prefers-reduced-motion: reduce)` rule must be in its own fresh block. Multi-selector @media also drops silently.
- **Local-build verification at Pause B is REQUIRED** — new hooks + IntersectionObserver are medium risk class.
- **Operator workflow:** open PR → click merge; no PR body, no branch delete.
- **prefers-reduced-motion is non-optional** — accessibility-critical for users with vestibular disorders, motion sensitivity, etc.

End of prompt.
