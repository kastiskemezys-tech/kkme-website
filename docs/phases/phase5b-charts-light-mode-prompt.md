# Phase 5B — Fix Chart Colors + Light Mode Map + Gen/Load Display

Self-contained Claude Code prompt. YOLO mode. Expected duration: 2–3 hours.

**Context:** Phase 5A fixed the hero map but three issues remain:

1. **ALL CHARTS ARE COLORLESS.** Phase 4A's token cleanup converted actual rgba() values to CSS variables (`var(--teal)`) in `app/lib/chartTheme.ts`. **Chart.js renders to `<canvas>`, not HTML.** CSS custom properties don't resolve in Canvas 2D context. Every chart on the site is now rendering with transparent/invisible bars and lines. This is the #1 priority fix.

2. **Gen/load numbers not showing on map.** The `/genload` endpoint returns valid data (checked: LT 1521 MW gen, 1430 MW load, etc.). But the hero map shows no gen/load numbers. Either the fetch is failing in the browser, the data format isn't matching what the code expects, or the conditional rendering is wrong.

3. **Light mode map still uses old PNG** with stale labels (Tampere, Bothnian Sea, etc. baked into the image). Need to generate proper light-mode layers from the dark assets.

**Branch:** `git checkout main && git pull origin main && git checkout -b phase-5b-charts-light-genload`

---

## Step 0: Context

1. `git checkout main && git pull origin main && git checkout -b phase-5b-charts-light-genload`
2. `npm run dev` — start dev server
3. Read `docs/handover.md`

---

## Fix 1: Chart.js colors (CRITICAL — affects S1Card, S2Card, RevenueCard, TradingEngineCard)

### The problem

`app/lib/chartTheme.ts` defines `DATA_COLORS` and `DARK_CHROME`/`LIGHT_CHROME` using CSS variable strings like `'var(--teal)'`. Chart.js passes these directly to Canvas 2D `fillStyle`/`strokeStyle`. Canvas 2D doesn't understand CSS custom properties — they silently fail, rendering transparent/invisible.

### The fix

The `useChartColors()` hook already re-renders on theme toggle. Instead of returning CSS variable strings, it needs to **resolve the CSS variables at runtime** using `getComputedStyle`.

Rewrite `app/lib/chartTheme.ts`:

```typescript
// Shared KKME Chart.js theme
// Chart.js renders to <canvas> — CSS variables don't work in Canvas 2D context.
// This module resolves CSS custom properties to actual color strings at runtime.

import { useState, useEffect, useCallback } from 'react';

// Map of semantic name → CSS variable name
const DATA_VAR_MAP = {
  teal:       '--teal',
  tealMid:    '--teal-medium',
  tealLight:  '--teal-subtle',
  amber:      '--amber',
  amberLight: '--amber-subtle',
  rose:       '--rose',
  roseLight:  '--rose-strong',
} as const;

const CHROME_VAR_MAP = {
  textPrimary:   '--text-primary',
  textSecondary: '--text-secondary',
  textMuted:     '--text-muted',
  grid:          '--chart-grid',
  border:        '--chart-grid',
  tooltipBg:     '--overlay-heavy',
  tooltipBorder: '--border-highlight',
} as const;

// Resolve a CSS variable to its computed value
function resolveVar(varName: string): string {
  if (typeof document === 'undefined') return 'rgba(128,128,128,0.5)'; // SSR fallback
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function resolveMap(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, varName] of Object.entries(map)) {
    result[key] = resolveVar(varName);
  }
  return result;
}

function buildResolvedColors() {
  return { ...resolveMap(DATA_VAR_MAP), ...resolveMap(CHROME_VAR_MAP) };
}

export type ChartColors = Record<keyof typeof DATA_VAR_MAP | keyof typeof CHROME_VAR_MAP, string>;

// Static fallback for SSR — will be overridden on client
// Uses dark theme defaults as fallback
const DARK_FALLBACK: ChartColors = {
  teal: 'rgb(0,180,160)',
  tealMid: 'rgba(0,180,160,0.65)',
  tealLight: 'rgba(0,180,160,0.30)',
  amber: 'rgb(212,160,60)',
  amberLight: 'rgba(212,160,60,0.30)',
  rose: 'rgb(214,88,88)',
  roseLight: 'rgba(214,88,88,0.75)',
  textPrimary: 'rgba(232,226,217,0.92)',
  textSecondary: 'rgba(232,226,217,0.65)',
  textMuted: 'rgba(232,226,217,0.45)',
  grid: 'rgba(232,226,217,0.12)',
  border: 'rgba(232,226,217,0.12)',
  tooltipBg: 'rgba(7,7,10,0.95)',
  tooltipBorder: 'rgba(232,226,217,0.20)',
};

// Static export for non-chart contexts (legend squares, etc.)
// IMPORTANT: This does NOT resolve CSS vars — use in HTML/SVG only, never Chart.js
export const CHART_COLORS = DARK_FALLBACK;

// Hook: resolves CSS variables to actual color values, re-resolves on theme toggle
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(DARK_FALLBACK);

  const resolve = useCallback(() => {
    setColors(buildResolvedColors() as ChartColors);
  }, []);

  useEffect(() => {
    // Resolve immediately
    resolve();

    // Re-resolve on theme change
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') {
          // Small delay to let CSS transition complete
          setTimeout(resolve, 50);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [resolve]);

  return colors;
}

export const CHART_FONT = {
  family: "'DM Mono', monospace",  // Canvas needs actual font name, not var()
};

// Hook: returns theme-aware tooltip style with resolved colors
export function useTooltipStyle(colors: ChartColors) {
  return {
    enabled: true,
    backgroundColor: colors.tooltipBg,
    borderColor: colors.tooltipBorder,
    borderWidth: 1,
    titleFont: { family: CHART_FONT.family, size: 12, weight: 'bold' as const },
    bodyFont: { family: CHART_FONT.family, size: 11 },
    footerFont: { family: CHART_FONT.family, size: 11, weight: 'bold' as const },
    titleColor: colors.textPrimary,
    bodyColor: colors.textSecondary,
    footerColor: colors.teal,
    padding: { top: 8, bottom: 8, left: 12, right: 12 },
    displayColors: false,
    cornerRadius: 2,
  };
}

// Shared axis/scale options factory — call with resolved colors
export function buildScales(colors: ChartColors) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: colors.textMuted,
        font: { family: CHART_FONT.family, size: 10 },
      },
    },
    y: {
      grid: { color: colors.grid, lineWidth: 0.5 },
      border: { display: false },
      ticks: {
        color: colors.textMuted,
        font: { family: CHART_FONT.family, size: 10 },
        maxTicksLimit: 4,
      },
    },
  };
}
```

### Update all chart consumers

Every component that imports from chartTheme needs to use the resolved colors from the hook, not the static `CHART_COLORS` export. Check these files:

- `app/components/S1Card.tsx` — uses `useChartColors()` (good) AND `CHART_COLORS` (bad — used for bar colors)
- `app/components/S2Card.tsx`
- `app/components/RevenueCard.tsx`
- `app/components/TradingEngineCard.tsx`

For each file:
1. Replace `CHART_COLORS.xxx` with `CC.xxx` (where CC = useChartColors())
2. Replace `CHART_FONT.family` references — they already use the static export which is fine since the font family name is the same in both themes
3. If `buildScales` is used, pass the resolved colors: `buildScales(CC)`
4. Ensure chart options that reference colors use the hook output, not the static export

**IMPORTANT:** The `CHART_COLORS` static export is still used in some non-chart contexts (like legend colored squares in HTML). Those are fine — CSS variables work in HTML. Only Chart.js canvas needs resolved values.

### Verify

After fixing, check each chart:
- S1Card: DA capture bar chart (should show teal/amber bars) + price shape line chart
- S2Card: Balancing clearing prices chart
- RevenueCard: CFADS waterfall or revenue breakdown
- TradingEngineCard: Dispatch chart

Screenshot each one. Bars/lines should have visible colors now.

---

## Fix 2: Gen/load display on hero map

### Diagnose

Open `http://localhost:3000` in the browser. Open DevTools console. Check for:
1. Network tab: is `/genload` being fetched? What's the response?
2. Console: any errors from the genload fetch?
3. React state: does genLoad state get populated?

The endpoint works: `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/genload` returns valid data with `lt.generation_mw: 1521`, `lv.generation_mw: 745`, `ee.generation_mw: 575`.

### Likely causes

1. **Fetch URL mismatch** — Check if the worker URL in HeroBalticMap.tsx matches the actual endpoint
2. **Response parsing** — The code does `fetch(...).then(r => r.ok ? r.json() : null)` — check if the response includes the right fields
3. **Conditional rendering logic** — The 5A code has `if (!genStr && !loadStr) return null` — verify this works
4. **Data format** — genLoad might be wrapped in an extra object layer

Add a `console.log('genLoad state:', genLoad)` after the state is set to debug. Check the console.

### Fix

Based on what you find, fix the issue. If the data IS loading but rendering fails, fix the rendering. If the fetch fails, fix the URL or parsing.

---

## Fix 3: Light mode map layers

### Generate from dark assets

The dark SVG layers have embedded PNGs. Extract, invert, recolor for light theme.

```bash
# Extract embedded PNGs
python3 << 'PYEOF'
import xml.etree.ElementTree as ET
import base64

def extract_png(svg_path, out_path):
    tree = ET.parse(svg_path)
    root = tree.getroot()
    for el in root.iter():
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
        if tag == 'image':
            href = el.get('{http://www.w3.org/1999/xlink}href', el.get('href', ''))
            if href.startswith('data:image/png;base64,'):
                data = base64.b64decode(href.split(',', 1)[1])
                with open(out_path, 'wb') as f:
                    f.write(data)
                print(f'Extracted {len(data)} bytes to {out_path}')
                return

extract_png('public/design-assets/Map/Layers/background-black.svg', '/tmp/bg-dark.png')
extract_png('public/design-assets/Map/Layers/countries.svg', '/tmp/countries-dark.png')
PYEOF
```

```bash
# Check alpha channels
identify -verbose /tmp/bg-dark.png 2>/dev/null | grep -E "Alpha|Channel|Type" | head -5
identify -verbose /tmp/countries-dark.png 2>/dev/null | grep -E "Alpha|Channel|Type" | head -5
```

Process based on what you find:

**If images have alpha (RGBA):**
```bash
# Invert RGB only, preserve alpha
convert /tmp/bg-dark.png -channel RGB -negate +channel /tmp/bg-inverted.png
convert /tmp/countries-dark.png -channel RGB -negate +channel /tmp/countries-inverted.png
```

**If images are opaque (RGB):**
```bash
convert /tmp/bg-dark.png -negate /tmp/bg-inverted.png
convert /tmp/countries-dark.png -negate /tmp/countries-inverted.png
```

Then tint to match light theme cream (`rgb(245,242,237)` = `#f5f2ed`):

```bash
# Method 1: Replace white with cream
convert /tmp/bg-inverted.png -fuzz 5% -fill '#f5f2ed' -opaque white /tmp/bg-light.png

# Method 2: If that doesn't look good, try level adjustment + tint
convert /tmp/bg-dark.png -negate -modulate 100,0,100 \
  -fill '#f5f2ed' -colorize 15% /tmp/bg-light.png
```

**Iterate visually.** Open `/tmp/bg-light.png` to check. The goal: warm cream background, dark halftone dots for land masses, subtle country borders. Think FT newspaper map aesthetic.

Once good, re-embed:

```python
import base64

def create_svg(png_path, svg_path, width=1024, height=1332):
    with open(png_path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('ascii')
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     version="1.2" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <image width="{width}" height="{height - 1}"
         href="data:image/png;base64,{data}" />
</svg>'''
    with open(svg_path, 'w') as f:
        f.write(svg)
    print(f'Created {svg_path}')

create_svg('/tmp/bg-light-final.png', 'public/design-assets/Map/Layers/background-light.svg')
create_svg('/tmp/countries-light-final.png', 'public/design-assets/Map/Layers/countries-light.svg')
```

### Update HeroBalticMap.tsx

Replace the light mode fallback (old PNG):

```tsx
// BEFORE:
) : (
  <img src="/hero/kkme-interconnect-light.png" ... />
)}

// AFTER:
) : (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <img
      src="/design-assets/Map/Layers/background-light.svg"
      alt="Baltic map background"
      width={MAP_WIDTH} height={MAP_HEIGHT}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
    />
    <img
      src="/design-assets/Map/Layers/countries-light.svg"
      alt=""
      width={MAP_WIDTH} height={MAP_HEIGHT}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
    />
  </div>
)}
```

This removes the old PNG with baked-in Tampere/Bothnian Sea labels.

---

## Step 4: Verification

Screenshot everything:

1. **Hero dark mode** — halftone map, teal cable strokes, country names, gen/load MW numbers, particle animation
2. **Hero light mode** — cream halftone map (no Tampere!), cable strokes, country names, gen/load numbers
3. **S1Card** — DA capture bar chart with COLORED bars (teal for high, amber for mid, rose for low)
4. **S1Card** — price shape line chart with visible line
5. **S2Card** — clearing prices chart with colors
6. **RevenueCard** — with colored elements
7. **TradingEngineCard** — dispatch chart with colors

`npx next build` — must succeed.

---

## Step 5: Commit

```bash
git add -A
git commit -m "phase5b: fix Chart.js colors (resolve CSS vars for canvas), generate light-mode map layers, fix gen/load display"
git push -u origin phase-5b-charts-light-genload
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-5b-charts-light-genload`

**Report back with:** before/after screenshots of charts (showing color restored), hero in both themes, gen/load status.
