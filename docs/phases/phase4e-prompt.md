# Phase 4E — Country Labels + Cable Trace Refinement + Color Tuning

Self-contained Claude Code prompt. YOLO mode. Expected duration: 1–2 hours.

**Context:** Phase 4D shipped the hero map rebuild with designed SVG layers (dark mode), logo swap, opaque nav, and cable waypoint recalibration. Visual inspection reveals three remaining issues:

1. **Country names missing in dark mode.** The old PNG had FINLAND, SWEDEN, ESTONIA, LATVIA, LITHUANIA, POLAND baked in. The new SVG layers don't include text (the designed `country-labels.svg` uses BPdots font which isn't web-available). The code's SVG overlay renders gen/load MW numbers at country positions but never the country NAME itself.

2. **Cable particle paths too coarse.** The v2 waypoints land inside the correct cable artwork bounding boxes (verified), but 2–3 straight-line segments per cable can't trace the actual cable curves. NordBalt is 397px wide with a sweeping arc traced by only 3 points. Particles visibly cut corners.

3. **Cables feel colorless.** The old map had vivid teal SVG-stroked cables. Now the visible cable art comes from `interconnect-lines.svg` rasters (muted blue). The overlay paths are `stroke="none"` (invisible guides). The amber particle dots are small and sparse. Net effect: cables feel washed out.

**Design vision:** Bloomberg terminal for Baltic BESS. The animated cable flows are a key differentiator — they should be vivid and clearly readable.

**Branch:** `git checkout main && git pull && git checkout -b phase-4e-map-labels-cables`

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. `git status && git log --oneline -5`
4. `git checkout main && git pull origin main && git checkout -b phase-4e-map-labels-cables`

Proceed — YOLO.

---

## Fix 1: Add country name labels to SVG overlay (dark mode)

The SVG overlay in `app/components/HeroBalticMap.tsx` has a `<g data-layer="country-totals">` section (around line 446) that renders gen/load numbers for LT/LV/EE. It does NOT render country name text.

### Positions

Extract from the designed `country-labels.svg` transform attributes:

| Country    | x    | y      |
|-----------|------|--------|
| FINLAND   | 676  | 224.6  |
| SWEDEN    | 127  | 430.6  |
| ESTONIA   | 745  | 489    |
| LATVIA    | 775  | 731    |
| LITHUANIA | 638  | 933    |
| POLAND    | 304  | 1143.6 |

### Implementation

Add a new `<g data-layer="country-names">` section in the SVG overlay, BEFORE the `country-totals` layer (so names sit behind the MW data). Render all 6 country names.

```tsx
{/* Country name labels — positioned from designed country-labels.svg */}
<g data-layer="country-names">
  {([
    ['FINLAND',   676, 225],
    ['SWEDEN',    127, 431],
    ['ESTONIA',   745, 489],
    ['LATVIA',    775, 731],
    ['LITHUANIA', 638, 933],
    ['POLAND',    304, 1144],
  ] as const).map(([name, x, y]) => (
    <text key={name} x={x} y={y}
      fontFamily="var(--font-heading)"
      fontSize="18"
      fontWeight="700"
      fill="var(--text-secondary)"
      opacity="0.6"
      letterSpacing="0.15em"
      style={{
        paintOrder: 'stroke fill',
        stroke: 'var(--theme-bg, #0a0a0a)',
        strokeWidth: '4px',
        strokeLinejoin: 'round',
        strokeOpacity: 0.95,
      }}
    >{name}</text>
  ))}
</g>
```

Design notes:
- Use `var(--font-heading)` (Unbounded) to match the Bloomberg terminal feel. Fall back to `var(--font-sans)` if heading looks too heavy at 18px — test visually.
- `opacity: 0.6` so they read as geographic context, not data. Lower than gen/load numbers.
- Halo stroke matches existing city/country-total label treatment.
- Letter-spacing 0.15em for cartographic feel.
- These positions are the translate() origins from the designed SVG. The text may need small x/y nudges (±10px) after visual check. Adjust if labels collide with city dots or gen/load numbers.

### Also add to COUNTRY_LABEL_PIXELS

In `lib/map-projection.ts`, the `COUNTRY_LABEL_PIXELS` object is built from `map-calibration.json` GCPs that end in `-label`. It currently only has sweden, lithuania, latvia, estonia (no Finland, no Poland). These positions are used for gen/load number placement.

Update `public/hero/map-calibration.json` to add `finland-label` and `poland-label` GCPs so the system is complete. Use the positions from the table above. This won't affect rendering (gen/load only shows for LT/LV/EE) but keeps the data consistent.

---

## Fix 2: Refine cable waypoints — more points for curves

The current `public/hero/map-cable-waypoints.json` v2 has 2–3 waypoints per cable. The designed cable artwork (raster PNGs inside `interconnect-lines.svg`) follows curves that straight 2–3 point polylines can't trace.

### Cable artwork bounding boxes (from SVG `<use>` transforms)

| Cable        | x    | y     | w   | h   | Image ID |
|-------------|------|-------|-----|-----|----------|
| NordBalt    | 124  | 752   | 397 | 115 | img1     |
| LitPol      | 615  | 1050  | 106 | 79  | img2     |
| EstLink 2   | 768  | 286   | 73  | 111 | img3     |
| Fenno-Skan 2| 309  | 200   | 241 | 98  | img4     |
| Fenno-Skan 1| 321  | 214   | 241 | 98  | img5     |
| EstLink 1   | 738  | 297   | 25  | 108 | img6     |

### Approach

For each cable, add intermediate waypoints to better trace the raster artwork. The cable art is a raster image, not a vector — so you can't extract a path mathematically. Instead:

1. **NordBalt** (the most curved cable): Currently 3 points. The raster spans x=[124,521] y=[752,867]. The cable curves from the Swedish coast (west) down through the Baltic Sea to the Lithuanian coast (Klaipėda area). Add 3-4 intermediate points to trace the arc. Approximate:
   ```json
   "nordbalt": {
     "waypoints": [
       { "px": 130, "py": 760 },
       { "px": 180, "py": 790 },
       { "px": 250, "py": 820 },
       { "px": 340, "py": 845 },
       { "px": 430, "py": 860 },
       { "px": 515, "py": 865 }
     ]
   }
   ```

2. **LitPol**: Currently 2 points. Short cable, 2 points might be sufficient, but add a midpoint:
   ```json
   "litpol": {
     "waypoints": [
       { "px": 715, "py": 1055 },
       { "px": 668, "py": 1090 },
       { "px": 620, "py": 1125 }
     ]
   }
   ```

3. **EstLink 1**: Very narrow (25px wide, 108px tall) — nearly vertical. 2 points is fine. Keep as-is.

4. **EstLink 2**: 73px wide, 111px tall. Slightly curved. Add a midpoint:
   ```json
   "estlink-2": {
     "waypoints": [
       { "px": 835, "py": 395 },
       { "px": 815, "py": 345 },
       { "px": 795, "py": 310 },
       { "px": 775, "py": 290 }
     ]
   }
   ```

5. **Fenno-Skan 1 & 2**: Each spans x≈[310,560] y≈[200,310]. These are long diagonal cables. Add intermediates:
   ```json
   "fennoskan-1": {
     "waypoints": [
       { "px": 325, "py": 290 },
       { "px": 370, "py": 272 },
       { "px": 440, "py": 250 },
       { "px": 500, "py": 232 },
       { "px": 555, "py": 218 }
     ]
   },
   "fennoskan-2": {
     "waypoints": [
       { "px": 315, "py": 280 },
       { "px": 360, "py": 262 },
       { "px": 430, "py": 240 },
       { "px": 490, "py": 222 },
       { "px": 545, "py": 205 }
     ]
   }
   ```

Update the version to 3 and the `capturedAt` timestamp.

**IMPORTANT**: These are initial estimates. After implementing, run `npm run dev` and visually compare particle paths to the cable artwork. If particles still cut corners, add more waypoints. The `/dev/map-calibrate` tool can help with interactive adjustment if available.

---

## Fix 3: Make cables more vivid

### 3a: Add visible cable strokes to SVG overlay

The SVG overlay renders cable paths with `stroke="none"` — they're invisible guides for GSAP. Add a visible stroke so cable routes are reinforced:

In `HeroBalticMap.tsx`, find the `<defs>` section with cable motion paths (around line 411). After the `</defs>`, before the city labels, add visible cable path rendering:

```tsx
{/* Visible cable strokes — reinforce routes over raster art */}
<g data-layer="cable-strokes">
  {Object.entries(CABLE_PATHS).map(([id, d]) =>
    d ? <path key={`stroke-${id}`} d={d} 
          fill="none" 
          stroke="var(--cable-stroke, var(--teal))" 
          strokeWidth="2" 
          strokeOpacity="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        /> : null
  )}
</g>
```

### 3b: Add `--cable-stroke` token

In `app/globals.css`:
- Dark mode: `--cable-stroke: rgba(45, 212, 191, 0.6);` (teal with transparency — blends with raster art underneath)
- Light mode: `--cable-stroke: rgba(19, 122, 101, 0.5);`

### 3c: Increase particle visibility

In `HeroBalticMap.tsx`, find the particle rendering (around line 505). Increase particle radius and add a glow:

```tsx
{resolved.map(r => {
  if (!CABLE_PATHS[r.id] || r.mw < 5) return null;
  const particleCount = Math.max(3, Math.min(8, Math.round(r.mw / 80)));
  const cls = `particle-${r.id.replace(/[^a-z0-9]/g, '-')}`;
  return Array.from({ length: particleCount }).map((_, i) => (
    <g key={`${r.id}-${i}`}>
      {/* Glow halo */}
      <circle className={cls} r="6" fill="var(--cable-particle)" opacity="0.15" />
      {/* Core particle */}
      <circle className={cls} r="3" fill="var(--cable-particle)" opacity="0.9" />
    </g>
  ));
})}
```

Wait — GSAP MotionPathPlugin targets elements by className. If there are two circles per particle with the same className, GSAP will animate both (they share the same class). That's actually correct — both the glow and core move together. Verify this works.

If GSAP doesn't handle the `<g>` wrapper well with MotionPath, flatten to two separate circles (both get same animation since GSAP targets by class, each gets the same delay offset). The paired circles (glow + core) will overlap and travel together.

---

## Fix 4: Verification

After all changes:

1. `npm run dev`
2. **Dark mode check:**
   - All 6 country names visible (FINLAND, SWEDEN, ESTONIA, LATVIA, LITHUANIA, POLAND)
   - Country names sit behind gen/load MW numbers, lower opacity
   - Cable strokes visible as teal lines over the raster artwork
   - Particles larger with glow, flowing along cable paths
   - Particles trace the cable artwork without visible corner-cutting
3. **Light mode check:**
   - Country names render correctly (will use same overlay labels — verify they're readable against the light PNG)
   - Cable strokes visible in light theme color
   - No regressions
4. `npx next build` — must succeed

---

## Step 5: Commit

```bash
git add -A
git commit -m "phase4e: country name labels, refined cable waypoints, vivid cable strokes and particles"
git push -u origin phase-4e-map-labels-cables
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme/compare/main...phase-4e-map-labels-cables`

**Report back:** screenshot of hero in dark mode showing country labels + cable animations. Note any alignment issues requiring interactive calibration.
