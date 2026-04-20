# Phase 5B — Generate Light Mode Map Layers + Vector Logos

Self-contained Claude Code prompt. YOLO mode. Expected duration: 1–2 hours.

**Context:** The designer (wife) provided dark-mode map layers and logos, but they're all PNG-in-SVG wrappers — not true vectors. Light-mode map layers don't exist yet, so the hero map falls back to an old PNG in light mode. This session programmatically generates what we need without waiting for the designer.

**What we have:**
- `public/design-assets/Map/Layers/background-black.svg` — 1.9 MB, single embedded PNG (1024×1332), halftone dot pattern on dark background
- `public/design-assets/Map/Layers/countries.svg` — 500 KB, single embedded PNG (1024×1331), country borders as halftone
- `public/design-assets/Logo/kkme-black.svg` — 13 KB embedded PNG (1767×374), black logo on transparent bg
- `public/design-assets/Logo/kkme-white.svg` — 754 bytes embedded PNG (594×125), white logo on transparent bg
- `public/design-assets/Logo/kkme-black.png` — 8.7 KB
- `public/design-assets/Logo/kkme-white.png` — 775 bytes

**What we need:**
1. Light-mode map layers: `background-light.svg` and `countries-light.svg`
2. True vector logo SVGs (optional but nice — the blocky text should trace well)
3. HeroBalticMap.tsx updated to use light layers instead of old PNG fallback

**Tools available:** ImageMagick (`convert`), Python Pillow, Node.js. Potrace is NOT installed — install with `sudo apt-get install -y potrace` if vectorizing logos.

**Branch:** `git checkout main && git pull origin main && git checkout -b phase-5b-light-mode-assets`

---

## Step 0: Context + setup

1. `git checkout main && git pull origin main && git checkout -b phase-5b-light-mode-assets`
2. Read the current HeroBalticMap.tsx base layer section (around line 372-400)
3. Check the current light mode color tokens in `app/globals.css` — find `--theme-bg`, `--surface-primary`, and the overall light palette

---

## Task 1: Extract embedded PNGs from dark SVGs

Write a Python script to extract the base64 PNGs from the SVG files:

```python
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
    print(f'No embedded PNG found in {svg_path}')

extract_png('public/design-assets/Map/Layers/background-black.svg', '/tmp/bg-dark.png')
extract_png('public/design-assets/Map/Layers/countries.svg', '/tmp/countries-dark.png')
```

## Task 2: Generate light-mode PNGs

The dark map uses white/light halftone dots on a dark background. For light mode, we need dark dots on a light/cream background.

### Approach: Invert + color-shift

The KKME light theme uses warm cream tones. Check `globals.css` for the exact values:
- `--theme-bg` in light mode (likely around `#f5f2ed` or similar warm cream)
- Land masses should be slightly darker than background
- Sea/water should be the background color
- Borders should be visible but subtle

Use ImageMagick to process:

```bash
# Step 1: Invert colors
convert /tmp/bg-dark.png -negate /tmp/bg-inverted.png

# Step 2: Examine the result — is it usable as-is?
# The halftone dots should now be dark on light background.
# If the background is pure white, tint it to match the cream theme.

# Step 3: Color-shift to warm cream
# Replace pure white (#ffffff) with the theme cream (#f5f2ed or whatever --theme-bg is)
convert /tmp/bg-inverted.png \
  -fill 'rgb(245,242,237)' -opaque white \
  /tmp/bg-light.png

# Same for countries layer
convert /tmp/countries-dark.png -negate /tmp/countries-inverted.png
convert /tmp/countries-inverted.png \
  -fill 'rgb(245,242,237)' -opaque white \
  /tmp/countries-light.png
```

**IMPORTANT:** The above is a starting point. The actual color mapping depends on what the dark PNGs look like. You may need:
- Level adjustment instead of simple negate (to control contrast)
- Alpha channel preservation (if the PNGs have transparency)
- Different treatment for background vs countries (countries may need borders enhanced)

Check the alpha channel: `identify -verbose /tmp/bg-dark.png | head -30`

If the PNGs have alpha (transparency), you'll need to handle that carefully:
```bash
# Preserve alpha, only invert RGB
convert /tmp/bg-dark.png -channel RGB -negate +channel /tmp/bg-inverted.png
```

### Alternative approach: Colorize

If straight inversion looks bad, try colorizing:
```bash
# Extract luminance, then recolorize
convert /tmp/bg-dark.png -colorspace Gray -negate \
  -fill 'rgb(60,58,53)' -tint 100 \
  /tmp/bg-light.png
```

**Iterate visually.** Take screenshots after each attempt. The goal: light cream background, visible halftone dots in warm dark gray, country borders as subtle lines. It should feel like a financial newspaper map — think FT salmon paper.

## Task 3: Re-embed light PNGs into SVGs

Once you have good-looking light PNGs, create the SVG wrappers:

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

## Task 4: Update HeroBalticMap.tsx

Replace the light-mode fallback (old PNG) with the new designed light layers.

Find the light mode branch (around line 394-400):

```tsx
// BEFORE:
) : (
  <img
    src="/hero/kkme-interconnect-light.png"
    width={MAP_WIDTH} height={MAP_HEIGHT}
    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    alt="Baltic interconnect map"
  />
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

## Task 5: Vector logos (optional, attempt if time allows)

Install potrace and try tracing the logo PNGs:

```bash
sudo apt-get install -y potrace

# Extract PNGs if not already done
# kkme-white.png is 775 bytes — very small, might not trace well
# kkme-black.png is 8.7 KB — better candidate

# Convert to PBM (potrace input format), then trace
convert public/design-assets/Logo/kkme-black.png -threshold 50% /tmp/logo-black.pbm
potrace /tmp/logo-black.pbm -s -o /tmp/logo-black-vector.svg

# Check the result
cat /tmp/logo-black-vector.svg | head -20

# If it looks good, also do white version
convert public/design-assets/Logo/kkme-white.png -threshold 50% /tmp/logo-white.pbm
potrace /tmp/logo-white.pbm -s -o /tmp/logo-white-vector.svg --color '#ffffff'
```

If the trace looks good (clean blocky letter forms matching the KKME pixel-art style), save to:
- `public/design-assets/Logo/kkme-black-vector.svg`
- `public/design-assets/Logo/kkme-white-vector.svg`

Then update logo references in HeroBalticMap.tsx and StickyNav.tsx to use vectors instead of PNGs. Keep the PNG fallbacks.

If the trace doesn't look good (too much noise, lost details), skip this — it's not critical.

## Task 6: Verification

1. `npm run dev`
2. Screenshot hero in light mode — should show warm cream halftone map matching the dark mode quality
3. Screenshot hero in dark mode — should be unchanged from Phase 5A
4. Toggle between themes — transition should feel cohesive
5. Check that cable strokes, country names, city labels, project dots all render correctly on both themes
6. `npx next build` — must succeed

## Task 7: Commit

```bash
git add public/design-assets/Map/Layers/background-light.svg \
        public/design-assets/Map/Layers/countries-light.svg \
        app/components/HeroBalticMap.tsx
# Also add vector logos if created:
# git add public/design-assets/Logo/kkme-*-vector.svg app/components/StickyNav.tsx

git commit -m "phase5b: generate light-mode map layers from dark assets, update hero to use designed layers in both themes"
git push -u origin phase-5b-light-mode-assets
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-5b-light-mode-assets`

**Report back with:** screenshots of hero in both dark and light mode, and note whether vector logo tracing worked.
