# Phase 7.6 — Hero refinement (bg, map opacity, H1, mobile breakpoint)

**Written:** 2026-04-21
**Target:** Claude Code (YOLO mode) in kkme repo
**Depends on:** Phase 7.5 merged to main
**Estimated effort:** 1 CC session, ~2–3 hours

## Context

Phase 7.5 polished cards, tables, charts, motion. Hero was deliberately
excluded from 7.5 scope. Phase 7.6 addresses four hero issues surfaced in
`docs/visual-audit/phase-7-5-audit/DIAGNOSTIC.md`:

1. **Hero background is a flat `rgb(5,5,5)` rectangle** — no fixed layer,
   no atmosphere, no gradient. Competitors (Linear, Graphite) use fixed
   atmospheric layers that survive scroll.
2. **Baltic map country polygons are solid `rgb(252, 211, 77)` at full
   opacity** — 52 polygons, all flat amber. Reads as cartoon/flat fill
   instead of glass-on-dark lens.
3. **`<h1>` has empty innerText and 16px font size** — there's no display
   headline on the page. Accessibility + SEO + visual-hierarchy failure.
4. **No `@media (max-width: 520px)` tuning of hero** — only 4 breakpoints
   exist (520, 768, 900, 1100), none of them actually rework the hero
   grid for iPhone-class viewports.

## Scope — 4 interventions, each its own commit

Branch: `phase-7-6-hero` off `main`.

### Intervention A — Hero background (atmosphere, fixed)

**Files:** `app/components/Hero.tsx` (or wherever `.hero-section` lives —
grep for `hero-section`), `app/styles/hero.css` if it exists else inline
module CSS.

**Change:**

- Add a fixed atmospheric background layer — radial gradient, teal → dark
  with significant falloff. `position: fixed; inset: 0; z-index: -1` so it
  survives scroll without `background-attachment: fixed` quirks (which
  don't play well with mobile Safari).
- Use existing tokens if possible: `--bg-base`, `--teal-atmosphere` (add
  to `app/globals.css` if not present).
- Keep dark theme first; light theme gets its own gradient value via
  `[data-theme="light"]` override.

Example token (dark):

```css
--hero-atmosphere: radial-gradient(
  ellipse 1200px 800px at 50% 10%,
  rgba(45, 212, 191, 0.06) 0%,
  transparent 60%
), radial-gradient(
  ellipse 900px 600px at 80% 80%,
  rgba(252, 211, 77, 0.03) 0%,
  transparent 50%
), #05050a;
```

**Verify:** scroll to mid-page, hero atmosphere is still visible behind
cards at low opacity. On iOS Safari, no scroll jank.

### Intervention B — Map polygon opacity

**Files:** find the Baltic SVG map component (grep for `viewBox="0 0 1024 1332"`
or `BalticMap`). It's the 52-path amber map in the hero.

**Change:**

- Country polygons (the ones filled `#FCD34D` / `rgb(252, 211, 77)`) drop
  to `fill: var(--amber-country-fill)` = `rgba(252, 211, 77, 0.10)` and
  gain a `stroke: rgba(252, 211, 77, 0.45)` with `stroke-width: 0.5`.
- City circles (currently `rgba(232, 226, 217, 0.65)`) keep opacity but
  add a subtle drop-shadow-like inner glow via `filter: drop-shadow(0 0
  4px rgba(45, 212, 191, 0.3))`.
- Teal markers (`rgb(77, 197, 176)` solid) stay solid — they're foci.
- Interconnector stroke paths already use alpha — leave those.

**Verify:** take screenshots at desktop dark + light, confirm map reads as
"glass lens" not "paint-by-numbers." If fill too faint, step up to 0.14.

### Intervention C — Real H1 display headline

**Files:** whatever renders the hero tagline "Baltic flexibility market, live"
(grep for that string or for the first `<h1>` in hero).

**Change:**

- Convert top tagline into a real `<h1>` at display size. Font: Cormorant
  Garamond, 48px desktop / 36px at ≤900px / 28px at ≤520px. Line-height
  tight (1.05). Color: `var(--text-primary)`.
- Headline copy should be **purposive and investor-facing**, not decorative.
  Propose and implement one of these (pick the one that tests best
  visually; I lean #2):
  1. "Baltic flexibility, priced daily."
  2. "The Baltic storage market, live."
  3. "Real-time intelligence for Baltic BESS."
- Below H1, keep the existing "LIVE · ENTSO-E · LITGRID · AST · ELERING"
  as a subtitle strip in DM Mono 11px, letter-spacing 0.08em, uppercased,
  color `var(--text-tertiary)`.

**Verify:** `document.querySelector('h1').innerText` returns non-empty;
Lighthouse a11y and SEO both tick the "page has H1" box; visual sits
prominently without competing with the map.

### Intervention D — Sub-520 breakpoint for hero

**Files:** `app/globals.css` and hero component stylesheet.

**Change:**

- Add `@media (max-width: 520px)` block specifically for hero:
  - Grid becomes single column. Interconnector column and cities column
    stack below the map.
  - Map SVG resizes to viewport width with `max-width: min(90vw, 360px)`,
    auto height.
  - H1 shrinks to 28px.
  - Subtitle strip wraps with `flex-wrap: wrap` + `gap: 6px`.
  - 40px bottom strip becomes vertical list.
- Add `@media (max-width: 380px)` tuning as well for iPhone SE:
  - Drop city labels below map (only map + H1 + subtitle visible in fold).

**Verify:** in Claude Code, use `chrome-devtools` MCP in device mode at
375×812 (iPhone SE) and 390×844 (iPhone 14). Screenshot both to
`docs/visual-audit/phase-7-6/` and include in PR description.

## Pause points

**Pause 1** — after intervention A (background). Screenshot + eyeball pass
before continuing. User needs to sign off on gradient intensity.

**Pause 2** — after intervention C (H1). Before shipping, user picks the
headline copy from the three options.

**Pause 3** — after intervention D (mobile). Before PR, user reviews
mobile screenshots at 375 and 390.

## Non-scope

- Do NOT rebuild the map itself. Same geometry, only fill/stroke change.
- Do NOT touch interconnector animation. Particles stay.
- Do NOT add new data endpoints. Pure visual.
- Do NOT change hero's three-column IA at desktop. Only the breakpoints
  where it collapses.

## Verification checklist (run before PR)

```bash
npm run build          # must pass
npm run lint           # must pass
```

Manual:

- [ ] `document.querySelector('h1').innerText` non-empty in production build
- [ ] `window.getComputedStyle(document.body).backgroundColor` shows
      atmospheric layer
- [ ] SVG polygon fill is rgba, not solid
- [ ] Hero readable at 375px wide (iPhone SE)
- [ ] No horizontal scroll at any width
- [ ] Both themes (dark + light) verified
- [ ] Screenshots saved to `docs/visual-audit/phase-7-6/`

## End-of-session

Update `docs/handover.md`:
- Move Phase 7.6 from "Queued" to "What's shipped" once PR merges.
- Add Session N entry with commits, screenshots, any deferred items.
