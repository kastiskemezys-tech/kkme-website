# Phase 4C — Design Asset Integration: Logo + Hero Map Base Layer

Self-contained Claude Code prompt. YOLO mode. Expected duration: 1–2 hours.

**Context:** Professional design assets have been delivered — KKME logo (black/white, SVG/PNG) and Baltic hero map layers (background, countries, country labels, interconnect lines, interconnect labels). These replace programmatic/placeholder art with designer-produced artwork.

**Prerequisite:** Phase 4A (visual overhaul) should be merged first. This phase touches HeroBalticMap.tsx (hero sidebar was restructured in 4A) and page.tsx footer (section dividers added in 4A).

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. `git status && git log --oneline -5` — clean, on main
4. `git checkout main && git pull origin main && git checkout -b phase-4c-design-assets`
5. Inventory assets: `find public/design-assets -type f -not -name '.DS_Store' | sort`

Proceed — YOLO.

---

## Asset inventory

```
public/design-assets/
├── Logo/
│   ├── kkme-black.png    (8.7K)  — black wordmark raster
│   ├── kkme-black.svg    (18K)   — black wordmark vector
│   ├── kkme-white.png    (775B)  — white wordmark raster
│   └── kkme-white.svg    (1.3K)  — white wordmark vector
└── Map/
    ├── kkme-interconnect-black.svg  (2.3M) — full composite, dark theme
    ├── kkme-interconnect-white.svg  (2.2M) — full composite, light theme
    └── Layers/
        ├── background-black.svg       (2.5M) — land/sea base layer
        ├── countries.svg              (667K) — country boundaries
        ├── country-labels.svg         (2.1K) — country names (BPdots font)
        ├── interconnect-labels.svg    (16K)  — cable names (NordBalt, LitPol, EstLink, Fenno-Skan)
        └── interconnect-lines.svg     (22K)  — cable line artwork
```

**Critical dimension match:** All map SVGs use viewBox `0 0 1024 1332`. The current hero map (`public/hero/kkme-interconnect-{dark,light}.png`) uses the same 1024×1332 dimensions via `map-calibration.json`. This means the designed SVGs can be a **drop-in replacement** for the PNG base layer — all geo-projection coordinates, cable paths, and project dot positions remain valid.

**Logo note:** The SVGs contain embedded PNG rasters (`<image>` tags with base64 data:image/png). They're not true vector logos — they're PNG-in-SVG wrappers. The PNG versions are the actual source. For web use, the PNGs are fine (small files). If true vector versions become available later, swap them in.

---

## Part 1: Logo integration

### 1A — Header/nav logo

Find where "KKME" is rendered as text in the header/nav area. It's likely in `app/page.tsx` or a header component. The current site shows "KKME" as an Unbounded-font text heading.

**Replace with an `<img>` tag:**
```tsx
<img
  src={`/design-assets/Logo/kkme-${theme === 'dark' ? 'white' : 'black'}.png`}
  alt="KKME"
  height={32}
  style={{ display: 'block' }}
/>
```

If the header doesn't have access to theme state, use a CSS approach instead:
```css
.logo-dark { display: block; }
.logo-light { display: none; }
[data-theme="light"] .logo-dark { display: none; }
[data-theme="light"] .logo-light { display: block; }
```

With two `<img>` tags (one dark, one light class).

**Size:** The logo should be ~32px tall in the header. Adjust based on visual balance with the navigation.

### 1B — Footer logo

The visual audit (V-14) noted the footer lacks a logo. Add the KKME wordmark to the footer:
- Small version (height ~20px)
- Same theme-switching approach as header
- Place it left of "© 2026 UAB KKME"
- If the footer already has a copyright line, add the logo inline with it

### 1C — Favicon / OG image (optional, if time permits)

Check if `public/favicon.ico` exists and what it looks like. If it's a Next.js default or placeholder, the black logo PNG could be converted to a favicon. Low priority — skip if it adds complexity.

---

## Part 2: Hero map base layer replacement

### 2A — Understand current setup

The hero map in `HeroBalticMap.tsx` (724 lines) works as:
1. **Base layer:** `<img>` tag loading `/hero/kkme-interconnect-{theme}.png` (1024×1332, ~1.5M each)
2. **SVG overlay:** Absolute-positioned SVG with same viewBox (1024×1332) containing:
   - Cable motion paths (invisible `<path>` elements for GSAP particle animation)
   - City label halos (text with stroke)
   - Generation/load overlay circles
   - Project dots (hollow rings with hover targets)
   - Particle `<circle>` elements animated along cable paths
3. **HTML overlay:** Absolute-positioned divs for project hover tooltips

The key line is ~373:
```tsx
<img
  src={`/hero/kkme-interconnect-${theme}.png`}
  width={MAP_WIDTH} height={MAP_HEIGHT}
  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
  alt="Baltic interconnect map"
/>
```

### 2B — Replace PNG with designed SVG composite

**Option A (simple — recommended for v0):** Replace the PNG base with the designed SVG composite.

Change the `<img>` src to:
```tsx
<img
  src={`/design-assets/Map/kkme-interconnect-${theme === 'dark' ? 'black' : 'white'}.svg`}
  width={MAP_WIDTH} height={MAP_HEIGHT}
  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
  alt="Baltic interconnect map"
/>
```

**Concern:** The SVG composites are 2.2–2.3MB (the PNGs were 1.4–1.7MB). Loading SVGs as `<img>` works but they can't be styled with CSS. For the base layer this is fine — we don't need to style it, it's just the background.

**Option B (layered — consider if visual result of A is poor):** Instead of one composite, stack the individual layers:
```tsx
<div style={{ position: 'relative', width: '100%', height: '100%' }}>
  <img src="/design-assets/Map/Layers/background-black.svg" ... style={{ position: 'absolute', inset: 0 }} />
  <img src="/design-assets/Map/Layers/countries.svg" ... style={{ position: 'absolute', inset: 0 }} />
  <img src="/design-assets/Map/Layers/interconnect-lines.svg" ... style={{ position: 'absolute', inset: 0 }} />
  {/* Skip country-labels.svg and interconnect-labels.svg — the SVG overlay already renders these programmatically */}
</div>
```

This avoids rendering duplicate labels (the SVG overlay already has city labels and cable labels). But it's more complex and loads 3 separate assets.

**Start with Option A.** If the result shows duplicate labels or visual conflicts between the designed labels and the programmatic SVG overlay labels, switch to Option B or remove the conflicting layer from the SVG overlay.

### 2C — Handle label conflicts

The designed SVG composites include:
- **Country labels** (LITHUANIA, LATVIA, ESTONIA, FINLAND, SWEDEN, POLAND) in BPdots font
- **Interconnect labels** (NordBalt, LitPol, EstLink, Fenno-Skan) as embedded PNGs

The current SVG overlay also renders:
- **City labels** (from `CITY_LABEL_PIXELS`) — different from country labels, these are city-level (Vilnius, Riga, etc.)
- **No country labels** in the overlay (those come from the base PNG)
- **No cable name labels** in the overlay (those also come from the base PNG)

So there should be **no duplication** — the base layer has country/cable names, the overlay has city names. Verify visually after the swap. If there IS duplication, remove the overlapping layer from either source.

### 2D — Performance consideration

The designed SVGs are large (2.3–2.5MB for the composites, 2.5MB for background alone). Most of this is embedded raster data within the SVG. Check:

1. Are the SVG composites significantly larger than the current PNGs? (Current: 1.4M light + 1.7M dark = 3.1M total. New: 2.2M + 2.3M = 4.5M total.) That's a 45% increase.

2. If the increase is a concern, consider converting the designed SVGs to optimized PNGs (using `sharp` or `svgexport` via npm). The current setup already uses PNGs, so keeping that format is fine if the designer agrees.

3. For v0, just swap in the SVGs and note the file size delta. Optimization is a follow-up if page load suffers.

---

## Part 3: Verify

### Build
- `npx tsc --noEmit` — clean
- `npm run build` — clean

### Visual
- `npm run dev` → load the page:
  - **Header:** KKME logo renders (white on dark, black on light)
  - **Hero map:** Designed base layer visible underneath the interactive SVG overlay
  - **Particles:** GSAP cable particles still animate correctly on top of the new base
  - **Project dots:** Still positioned correctly (same coordinate system)
  - **City labels:** Still visible and correctly placed
  - **No duplicate labels:** Country names and cable names appear once (from base), not twice
  - **Theme toggle:** Switching dark↔light swaps both the logo and the map base
  - **Footer:** Logo appears next to copyright
  - **Scroll animations:** Still work (from Phase 4A)

### Regression
- Revenue signals, structural drivers, revenue engine, trading, intel feed sections all render correctly
- No layout shifts from the hero map swap
- Page load time: subjectively similar (note if noticeably slower)

---

## Commit + push

Single commit: `phase4c: integrate designed logo and hero map base layer`

Branch: `phase-4c-design-assets`
Push. Report compare URL. Don't run `gh pr create`.

---

## What NOT to do

- Don't modify the SVG overlay logic (cable paths, particles, project dots, city labels) — those stay programmatic
- Don't delete the old PNG hero maps — keep them as fallback until the new base is verified in production
- Don't optimize/compress the SVGs in this phase — that's a follow-up if needed
- Don't change map-projection.ts or map-calibration.json — the coordinate system is unchanged
- Don't add npm packages
- Don't change any data-fetching logic
- Don't touch the worker

---

## Reference

- Design assets: `public/design-assets/` (Logo/ and Map/)
- Current hero PNGs: `public/hero/kkme-interconnect-{dark,light}.png` (1024×1332)
- Hero component: `app/components/HeroBalticMap.tsx` (724 lines)
- Map projection: `lib/map-projection.ts` (MAP_WIDTH=1024, MAP_HEIGHT=1332)
- Map calibration: `public/hero/map-calibration.json`
- Cable paths: `lib/map-projection.ts` → CABLE_PATHS
- Visual audit V-14: footer enhancement (logo addition)
- Page layout: `app/page.tsx`
