# Phase 4D — Hero Map Rebuild + Cable Recalibration + Logo + Nav Fix

Self-contained Claude Code prompt. YOLO mode. Expected duration: 3–4 hours.

**Context:** Phase 4C shipped design assets and attempted integration. Visual inspection revealed multiple problems. More importantly: the new designed map has **corrected interconnector positions** compared to the old programmatic PNG. The old map had inaccurate cable routing. This means it's not just a base layer swap — the GSAP particle animation paths (defined in `public/hero/map-cable-waypoints.json`) need to be recalibrated to match the new designed cable artwork.

**Problems to fix:**

1. **Hero map base layer didn't change visually.** The SVG composites may be PNG-in-SVG wrappers. Need to use the individual layer SVGs (which have the actual designed halftone artwork) or verify the composites are genuinely different.
2. **Cable path misalignment.** The new designed `interconnect-lines.svg` has corrected cable positions. The particle animations use waypoints calibrated to the OLD map. Particles will flow along wrong paths unless `map-cable-waypoints.json` is updated.
3. **Hero "KKME" is still text.** Logo was added to StickyNav + footer but the hero left column still renders `<h1>KKME</h1>` as text.
4. **Sticky nav bleed-through.** `var(--overlay-heavy)` is 95% opaque — section headings bleed through.
5. **Sticky nav + SignalBar overlap with section content.** No scroll-padding for anchor links.

**Design vision:** The site should feel like a **Bloomberg terminal for Baltic BESS** — the ticker bar, the live data, the animated interconnector flows. The hero map with animated cable flows is a key differentiator. Getting the map + particles aligned correctly is the highest priority in this phase.

**Branch:** Start from main with 4C merged. Or if 4C isn't merged yet, branch from `phase-4c-design-assets`.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. `git status && git log --oneline -5`
4. `git checkout main && git pull origin main && git checkout -b phase-4d-hero-nav-fixes`
5. Verify the design asset files exist: `ls -la public/design-assets/Map/ public/design-assets/Logo/`

Proceed — YOLO.

---

## Fix 1: Hero map — verify and fix the base layer swap

### Diagnose

Open `app/components/HeroBalticMap.tsx` line ~373. Phase 4C should have changed the `<img>` src from:
```tsx
src={`/hero/kkme-interconnect-${theme}.png`}
```
to something pointing at the design assets. Verify what it currently says.

Then actually compare the files visually:

1. Open the current base image in a browser: `http://localhost:3000/hero/kkme-interconnect-dark.png`
2. Open the designed SVG: `http://localhost:3000/design-assets/Map/kkme-interconnect-black.svg`
3. Are they visually different? The designed version should have a halftone/stipple dot pattern on the land masses, cleaner line work on the cables, and country labels in a "BPdots" pixelated font.

If they look the same, the SVG composite might have been generated FROM the old PNGs (it contains embedded raster `<image>` tags). In that case, the individual layers are the real designed assets:
- `public/design-assets/Map/Layers/background-black.svg` (2.5M) — the actual designed background with halftone texture
- `public/design-assets/Map/Layers/countries.svg` (667K) — country boundaries
- `public/design-assets/Map/Layers/interconnect-lines.svg` (22K) — cable artwork

### Fix — use layered approach

If the composites don't look different, switch to layering the individual SVG assets. Replace the single `<img>` base with a stacked layer approach:

```tsx
{/* Designed map base layers */}
<div style={{
  position: 'absolute', inset: 0,
  width: '100%', height: '100%',
}}>
  <img
    src="/design-assets/Map/Layers/background-black.svg"
    alt=""
    style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      objectFit: 'contain',
      display: theme === 'dark' ? 'block' : 'none',
    }}
  />
  {/* TODO: need a background-white.svg for light mode — if not available, keep old PNG for light */}
  <img
    src="/design-assets/Map/Layers/countries.svg"
    alt=""
    style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      objectFit: 'contain',
    }}
  />
  <img
    src="/design-assets/Map/Layers/interconnect-lines.svg"
    alt=""
    style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      objectFit: 'contain',
    }}
  />
</div>
```

**Important:** Do NOT include `country-labels.svg` or `interconnect-labels.svg` as layers — the SVG overlay already renders city labels programmatically, and adding designed labels on top would duplicate them. The interconnect labels from the SVG overlay include live MW flow data that the static designed labels don't have.

**Dimension match:** All layer SVGs use viewBox `0 0 1024 1332`, same as `MAP_WIDTH` (1024) × `MAP_HEIGHT` (1332) from `map-calibration.json`. The SVG overlay uses the same viewBox. Alignment should be pixel-perfect.

**Light mode gap:** The layers folder only has dark-theme assets (background-black.svg). For light mode, either:
- Keep the old PNG (`/hero/kkme-interconnect-light.png`) as the light-mode base (pragmatic)
- Or use the same layers with CSS `filter: invert(1)` or adjust SVG fill colors (fragile)

Best approach: use the old light PNG for light mode, designed layers for dark mode. Note as a follow-up for the designer to provide light-mode layers.

### Verify the map

After the fix:
- `npm run dev` → hero map shows the halftone dot pattern on land masses (dark mode)
- Particle animations still flow along cables
- Project dots still positioned correctly
- City labels visible (from SVG overlay, not from designed layers)
- Country labels visible (from designed base layer background)
- Interconnect cable artwork visible (from designed layers + animated particles on top)
- No doubled/overlapping labels

---

## Fix 2: Cable path recalibration (CRITICAL)

### Why this matters

The hero's key feature is GSAP-animated particles flowing along interconnector cables showing live power flow direction and magnitude. This is what makes kkme.eu look like a Bloomberg terminal, not a brochure.

The particle paths are defined in `public/hero/map-cable-waypoints.json` as pixel coordinates within the 1024×1332 space. These waypoints were manually calibrated to the OLD PNG map. The new designed map has **corrected cable positions** — the designer fixed inaccuracies in the previous version.

If we swap the base layer without updating the waypoints, particles will animate through empty water instead of along the cables.

### How the system works

1. `public/hero/map-cable-waypoints.json` → defines waypoints per cable (nordbalt, litpol, estlink-1, estlink-2, fennoskan-1, fennoskan-2)
2. `lib/map-projection.ts` → `buildPath()` converts waypoints to SVG `<path>` d-attributes (`CABLE_PATHS`)
3. `HeroBalticMap.tsx` → renders invisible `<path>` elements in `<defs>`, then GSAP animates `<circle>` particles along them via `MotionPathPlugin`

### What to do

**Step 1:** Read the current `public/hero/map-cable-waypoints.json` to understand the format and current waypoint values.

**Step 2:** Open the designed `public/design-assets/Map/Layers/interconnect-lines.svg` and extract the cable positions. Each cable is a `<use>` element with a transform matrix placing it at specific coordinates. The cable artwork contains:
- `nordbalt` — transform `matrix(1,0,0,1,124,752)` with a 397×115 image
- `litpol` — transform `matrix(1,0,0,1,615,1050)` with a 106×79 image  
- `estlink 2` — transform `matrix(1,0,0,1,768,286)` with a 73×111 image
- `fenne s 2` — transform `matrix(1,0,0,1,309,200)` with a 241×98 image (Fenno-Skan 2)
- `fenne s 1` — transform `matrix(1,0,0,1,321,214)` with a 241×98 image (Fenno-Skan 1)
- `estlink 1` — transform `matrix(1,0,0,1,738,297)` with a 25×108 image

These positions define where each cable sits in the 1024×1332 coordinate space.

**Step 3:** Also check `public/design-assets/Map/kkme-interconnect-black.svg` (the full composite) — it likely has higher-fidelity cable path information since it's the complete rendered map.

**Step 4:** Update `public/hero/map-cable-waypoints.json` with new waypoint coordinates that trace along the designed cable artwork. For each cable:
- Extract start point, end point, and any intermediate curve points from the designed SVG
- The waypoints should trace the visual center of each cable line
- The `buildPath()` function creates a smooth SVG path through the waypoints, so 3-5 waypoints per cable is usually enough

**Step 5:** After updating waypoints, verify by running `npm run dev` and checking that particles flow along the visible cable artwork (not through water or land). Toggle dark mode to see the designed map base and confirm alignment.

### Fallback approach

If extracting precise waypoints from the designed SVGs is too difficult (the cables are embedded raster images, not vector paths), use this visual calibration approach:

1. Render the new map base in the browser
2. Use browser DevTools to inspect the SVG overlay and manually adjust waypoint coordinates
3. Or: use the `dev/map-calibrate` tool if it exists — check `app/dev/map-calibrate/page.tsx`

The map-calibrate page (18 rgba violations noted in the audit) was specifically built for calibrating geo-coordinates to pixel positions. It may support waypoint calibration too.

---

## Fix 3: Hero logo — replace text with designed wordmark

**File:** `app/components/HeroBalticMap.tsx` lines 314–317.

Current:
```tsx
<h1 style={{
  fontFamily: 'var(--font-display)', fontSize: '56px', fontWeight: 700,
  color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1, margin: 0,
}}>KKME</h1>
```

Replace with:
```tsx
<h1 style={{ margin: 0, lineHeight: 1 }}>
  <img
    src="/design-assets/Logo/kkme-white.png"
    alt="KKME"
    height={48}
    className="logo-dark"
    style={{ display: 'block' }}
  />
  <img
    src="/design-assets/Logo/kkme-black.png"
    alt="KKME"
    height={48}
    className="logo-light"
    style={{ display: 'block' }}
  />
</h1>
```

The CSS classes `.logo-dark` / `.logo-light` were already added to `globals.css` in Phase 4C (they toggle display based on `[data-theme]`).

**Size:** 48px height in the hero (larger than the 20px nav logo). Adjust if it doesn't feel right visually — the Unbounded text was 56px, so the logo should feel similarly weighty.

---

## Fix 4: Sticky nav — fully opaque background

**File:** `app/globals.css`

Change `--overlay-heavy` to fully opaque in both themes:

```css
/* Dark theme */
--overlay-heavy: rgb(7, 7, 10);    /* was rgba(7, 7, 10, 0.95) */

/* Light theme */  
--overlay-heavy: rgb(245, 242, 237);  /* was rgba(245, 242, 237, 0.95) */
```

**Alternative:** If `--overlay-heavy` is used elsewhere and the transparency is wanted in other contexts, create a new token `--nav-bg` that's fully opaque, and use it only in StickyNav.

Check where `--overlay-heavy` is used:
```bash
grep -rn "overlay-heavy" app/
```

If it's ONLY used in StickyNav (nav + mobile dropdown), just make it opaque. If it's used in other overlays (modals, drawers) where transparency matters, create `--nav-bg` instead.

Also remove `backdropFilter: 'blur(12px)'` from the nav — it's unnecessary when the background is fully opaque and it costs GPU cycles.

**File:** `app/components/StickyNav.tsx` lines 49–50:
```tsx
background: 'var(--overlay-heavy)',
backdropFilter: 'blur(12px)',   // ← remove this line
```

---

## Fix 5: Sticky nav + SignalBar stacking

**File:** `app/components/StickyNav.tsx`

The structure is:
```
<div fixed top:0 z:100>
  <nav>  ← logo + links
  <SignalBar />  ← ticker metrics (BESS CAPTURE, S/D RATIO, etc.)
</div>
```

The entire fixed container pushes into page content. The page needs enough top padding to account for the combined nav + signal bar height when scrolling.

Check: does `page.tsx` or any global style add `scroll-padding-top` or `scroll-margin-top` to account for the sticky nav height? If not, add:

```css
html {
  scroll-padding-top: 96px; /* ~nav height (44px) + signal bar height (44px) + 8px buffer */
}
```

This ensures that when anchor links scroll into view, content isn't hidden behind the sticky nav.

Also verify that the signal bar has the same opaque background as the nav (not transparent). Read `app/components/SignalBar.tsx` and check its background style.

---

## Part 6: Verify everything

### Build
- `npx tsc --noEmit` — clean
- `npm run build` — clean

### Visual (dark mode, 1440px)
- **Hero map base:** Designed halftone texture visible on land masses. Visually different from old PNG — cleaner, more cartographic. If it looks the same as before, the base layer swap failed.
- **Cable alignment (CRITICAL):** Particles must flow along the visible cable artwork, not through water or land. Check each cable:
  - NordBalt: particles flow along the cable between Sweden and Lithuania
  - LitPol: particles flow along the cable between Poland and Lithuania
  - EstLink 1+2: particles flow along cables between Estonia and Finland
  - Fenno-Skan 1+2: particles flow along cables between Sweden and Finland
  - If ANY cable's particles are visibly off-path, the waypoint recalibration needs more work
- **Hero left column:** Logo image (not text "KKME"). Subtitle and data sources text below.
- **Right sidebar:** Stat blocks (€509/MW/DAY, fleet, ratios) visible and properly grouped.
- **Scroll down:** Sticky nav appears. Fully opaque background — no section headings bleeding through. Logo in nav. Signal bar below nav with metrics. No overlap with section content.
- **All sections:** Scroll through Revenue Signals → Build → Structure → Returns → Trading → Intel → Contact. No layout issues.

### Visual (light mode, 1440px)
- Theme toggle switches hero map base (designed dark → old PNG light, or whatever the light solution is)
- Logo switches to black variant in nav, hero, footer
- Nav background fully opaque in light mode too

### Regression
- Particle GSAP animations still work
- Project dot hover tooltips still work
- All anchor links from nav scroll to correct position (not hidden behind sticky nav)
- Signal bar data still updates

---

## Commit + push

Single commit: `phase4d: hero map rebuild with recalibrated cable paths, logo swap, opaque nav`

Branch: `phase-4d-hero-nav-fixes`
Push. Report compare URL. Don't run `gh pr create`.

---

## What NOT to do

- Don't rewrite the SVG overlay logic (cable paths, particles, project dots, city labels)
- Don't change map-projection.ts or the coordinate system
- Don't optimize/compress SVGs (follow-up task)
- Don't delete old hero PNGs (keep as light-mode fallback and reference)
- Don't touch signal data fetching or card components
- Don't change the intel feed, structural drivers, or any other section
- Don't add npm packages

---

## Follow-up items to log

1. **Light-mode map layers needed** — designer needs to provide light-theme versions of background, countries, and interconnect layers
2. **SVG optimization** — the designed assets are 2.5M+ each (mostly embedded PNGs within SVGs). Consider converting to optimized PNGs or using SVGO to strip unnecessary metadata
3. **Logo quality** — the SVGs contain embedded PNG rasters, not true vectors. Request true vector SVGs from designer for crisp rendering at all sizes
4. **Mobile responsive** — the 3-column hero grid needs a mobile layout (currently likely broken on small screens). Defer to Phase 5.
5. **LV↔LT flow display (B-006)** — worker returns lv_lt_avg_mw but frontend doesn't render it. The new map may show this cable — add particle animation for it.
6. **Bloomberg ticker polish** — SignalBar works but needs tighter styling: proper ticker spacing, mono-width columns, subtle animation on value updates, horizontal scroll on mobile.
7. **Count-up animations (V-10)** — useCountUp hook exists from 4A but isn't wired to hero metrics (€509, 14.7%, 822 MW). Quick follow-up task.

---

## Reference

- Design assets: `public/design-assets/`
- Hero component: `app/components/HeroBalticMap.tsx` (724 lines)
- Sticky nav: `app/components/StickyNav.tsx` (163 lines)
- Signal bar: `app/components/SignalBar.tsx`
- Cable waypoints: `public/hero/map-cable-waypoints.json` (waypoint coordinates per cable)
- Map projection: `lib/map-projection.ts` (CABLE_PATHS built from waypoints, MAP_WIDTH=1024, MAP_HEIGHT=1332)
- Map calibrate tool: `app/dev/map-calibrate/page.tsx` (interactive calibration page)
- Designed interconnect artwork: `public/design-assets/Map/Layers/interconnect-lines.svg` (source of truth for cable positions)
- Nav overlay token: `app/globals.css` line 58 (dark) / 231 (light)
- Logo CSS classes: `app/globals.css` `.logo-dark` / `.logo-light`
- Phase 4C report: screenshots showing issues
