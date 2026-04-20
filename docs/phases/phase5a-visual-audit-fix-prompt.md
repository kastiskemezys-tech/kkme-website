# Phase 5A — Visual Audit + Comprehensive Fix

Self-contained Claude Code prompt. YOLO mode. Expected duration: 3–4 hours.

**Context:** Phases 3B, 4A, 4C, 4D, 4E have been merged to main. The site has accumulated visual regressions and inconsistencies across these rapid phases. This session does a full visual audit using Chrome DevTools MCP screenshots, catalogs every issue, then fixes them all in one pass.

**Branch:** `git checkout main && git pull origin main && git checkout -b phase-5a-visual-audit-fix`

**Design vision:** Bloomberg terminal for Baltic BESS. Dark, data-dense, investor-grade. Terse text, monospace numbers, animated interconnector flows, halftone cartographic identity.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md` (the session log, backlog, architecture)
3. Read `CLAUDE.md` (card anatomy, voice, rules)
4. `git status && git log --oneline -10`
5. `git checkout main && git pull origin main && git checkout -b phase-5a-visual-audit-fix`
6. `npm run dev` — start the dev server

Proceed — YOLO.

---

## Step 1: Full visual audit via screenshots

**This is the critical step.** Take screenshots of the ENTIRE page in dark mode, then light mode. Use Chrome DevTools MCP (`mcp__chrome-devtools__*` or equivalent) to capture viewport screenshots at 1440px width.

### Dark mode screenshots (take all of these):
1. Hero section full viewport (top of page)
2. Hero section zoomed — map center area (cable paths + country labels)
3. Signals section (S1 + S2 cards)
4. Structural drivers section (RenewableMix, ResidualLoad, PeakForecast, SpreadCapture)
5. Gas/Carbon section (S7 + S9 with sparklines)
6. Revenue section
7. Trading Engine section
8. Intel Feed section
9. Build section (full returns card)
10. Footer + contact
11. Sticky nav in scrolled state

### Light mode screenshots (switch theme, then repeat):
12-22. Same sections as above in light mode

### For each screenshot, catalog issues in a checklist. Known issues to look for:

**Hero map (CRITICAL):**
- [ ] **Double cable rendering**: The `interconnect-lines.svg` raster layer shows blue cable artwork. On top of that, Phase 4E added teal `<path>` strokes via `data-layer="cable-strokes"`. These are two different cable renderings at slightly different positions/colors — looks messy. **The fix**: remove `interconnect-lines.svg` from the base layers entirely. The SVG overlay cable strokes (from waypoints) ARE the cables now. The raster artwork was a stepping stone — with refined waypoints + visible strokes, we don't need it.
- [ ] **Gen/load shows "— gen / — load" with no numbers**: The screenshot shows dashes instead of actual MW values next to ESTONIA, LATVIA, LITHUANIA. Check if `/genload` returns data. If the endpoint is working but the format changed, fix the parsing. If it returns null, the `formatPower()` function should handle it gracefully (show nothing, not "— gen").
- [ ] **Country labels overlap gen/load numbers**: The 4E country name labels (ESTONIA, LATVIA, LITHUANIA) sit at the same Y position as the gen/load data. They need vertical offset so the country name sits ABOVE the gen/load numbers.
- [ ] **Particle color/visibility**: Particles should be amber (`rgb(252, 211, 77)`) with glow halos. Verify they're visible and animating.
- [ ] **Cable stroke color**: Should be teal with 0.5 opacity. Not too thick, not too thin.

**Sticky nav:**
- [ ] **Fully opaque**: No content bleed-through when scrolling
- [ ] **Logo**: Designed logo image, not text
- [ ] **SignalBar ticker**: Readable, proper spacing

**Cards:**
- [ ] **Card anatomy consistency**: header → hero metric → status → interpretation → viz → impact line → source footer → drawer (per CLAUDE.md)
- [ ] **Font usage**: Unbounded for hero numbers, DM Mono for data, Cormorant Garamond for narrative/interpretation
- [ ] **Color tokens**: No raw rgba() — everything via var(--token)
- [ ] **Scroll animations**: Cards should fade in on scroll (useScrollReveal from Phase 4A)

**General:**
- [ ] **Section spacing rhythm**: Consistent vertical gaps between sections
- [ ] **Dividers**: Clean divider lines between sections
- [ ] **Typography hierarchy**: Clear distinction between section headers, card titles, data values, interpretation text
- [ ] **Light mode parity**: Everything that works in dark should work in light

---

## Step 2: Fix all issues found

Based on the audit, fix everything. Here are the KNOWN fixes to implement regardless:

### Fix A: Remove interconnect-lines.svg raster layer

In `app/components/HeroBalticMap.tsx`, find the dark-mode base layer stack (around line 373). Remove the `interconnect-lines.svg` `<img>`:

```tsx
// BEFORE (3 layers):
<img src="/design-assets/Map/Layers/background-black.svg" ... />
<img src="/design-assets/Map/Layers/countries.svg" ... />
<img src="/design-assets/Map/Layers/interconnect-lines.svg" ... />  // REMOVE THIS

// AFTER (2 layers):
<img src="/design-assets/Map/Layers/background-black.svg" ... />
<img src="/design-assets/Map/Layers/countries.svg" ... />
```

The cable routing is now handled entirely by the SVG overlay's `data-layer="cable-strokes"` paths. The raster was causing double-rendering.

### Fix B: Make cable strokes the primary cable visual

Now that the raster cables are removed, the SVG overlay strokes need to be more prominent. Update the `data-layer="cable-strokes"` section:

```tsx
<g data-layer="cable-strokes">
  {Object.entries(CABLE_PATHS).map(([id, d]) =>
    d ? <path key={`stroke-${id}`} d={d}
          fill="none"
          stroke="var(--cable-stroke, var(--teal))"
          strokeWidth="2.5"
          strokeOpacity="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        /> : null
  )}
</g>
```

And update the `--cable-stroke` token in `globals.css`:
- Dark: `--cable-stroke: rgba(45, 212, 191, 0.7);` (was 0.6 — more vivid now that it's the only cable visual)
- Light: `--cable-stroke: rgba(19, 122, 101, 0.6);` (was 0.5)

### Fix C: Fix gen/load display

Check `/genload` endpoint: `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/genload | head -c 500`

If it returns data, the issue is likely `formatPower()` receiving null/undefined. Find `formatPower` in HeroBalticMap.tsx and make it return empty string for nullish values:

```tsx
function formatPower(mw: number | null | undefined): string {
  if (mw == null || isNaN(mw)) return '';
  if (Math.abs(mw) >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}
```

Then update the gen/load rendering to hide when no data:
```tsx
{formatPower(gl?.generation_mw) && <text ...>{formatPower(gl?.generation_mw)} gen</text>}
{formatPower(gl?.load_mw) && <text ...>{formatPower(gl?.load_mw)} load</text>}
```

If `/genload` returns no data at all, the `— gen / — load` display is just confusing — render nothing instead.

### Fix D: Country label positioning

The country name labels (Phase 4E) and the gen/load numbers (existing) both render around `COUNTRY_LABEL_PIXELS` positions. They need vertical separation.

The country name labels in `data-layer="country-names"` should sit ABOVE the gen/load data. Currently they're at the positions extracted from `country-labels.svg` (e.g., ESTONIA at y=489). The gen/load data renders at `COUNTRY_LABEL_PIXELS[label].y + 24`.

Check if the positions are causing overlap. If so, move the country name label UP by ~30px so it reads:

```
ESTONIA          ← country name (lighter, smaller)
460 MW gen       ← teal gen number
802 MW load      ← secondary load number
```

In the `data-layer="country-names"` section, adjust the y coordinate:
```tsx
{([
  ['FINLAND',   676, 195],    // was 225, moved up 30
  ['SWEDEN',    127, 401],    // was 431, moved up 30
  ['ESTONIA',   745, 459],    // was 489, moved up 30
  ['LATVIA',    775, 701],    // was 731, moved up 30
  ['LITHUANIA', 638, 903],    // was 933, moved up 30
  ['POLAND',    304, 1114],   // was 1144, moved up 30
] as const).map(([name, x, y]) => (
```

Verify visually after — the exact offset depends on how the collision-resolved gen/load labels land.

### Fix E: Any additional issues from your audit

For any other visual issues you discover during the screenshot audit:
- Fix color inconsistencies
- Fix spacing issues
- Fix typography mismatches
- Fix scroll animation issues
- Fix light/dark mode inconsistencies
- Clean up any remaining raw rgba() values
- Fix any card anatomy violations

Be thorough. Screenshot before AND after each major fix to confirm it worked.

---

## Step 3: Verification

After all fixes:

1. **Screenshot the full page again** in dark mode and light mode. Compare to the audit screenshots.
2. Every issue cataloged in Step 1 should be resolved.
3. `npx next build` — must succeed with no errors.
4. Check the console for any new warnings or errors.

### Specific verification checks:
- Hero map dark: halftone texture visible, single set of teal cable strokes (no double rendering), country names above gen/load data, particles animating along cables
- Hero map light: old PNG base, same SVG overlay labels/cables visible
- Gen/load: shows actual MW numbers or nothing (never "— gen")
- Sticky nav: opaque, logo visible, SignalBar readable
- All cards: consistent anatomy, proper fonts, no raw rgba()
- Scroll animations: cards fade in as you scroll

---

## Step 4: Commit

```bash
git add -A
git commit -m "phase5a: visual audit fix — remove double cable rendering, fix gen/load display, adjust country label positions, resolve audit findings"
git push -u origin phase-5a-visual-audit-fix
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-5a-visual-audit-fix`

**Report back with:**
1. Full audit checklist with issue/resolved status
2. Before/after screenshots of the hero map (dark + light)
3. Count of additional issues found and fixed beyond the known list
4. Any issues that need designer input (light mode layers, vector logos, etc.)
