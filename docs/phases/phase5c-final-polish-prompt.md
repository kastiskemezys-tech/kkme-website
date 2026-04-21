# Phase 5C — Final Polish: Particle Velocity, Gen/Load, Visual Audit

Self-contained Claude Code prompt. YOLO mode. Expected duration: 2–3 hours.

**Context:** Phases through 5B are merged. This is the cleanup/finalization pass. Fix remaining issues, improve particle animation physics, and do a final visual audit.

**Branch:** `git checkout main && git pull origin main && git checkout -b phase-5c-final-polish`

**Known issues to fix:**

1. **Particle velocity doesn't account for path length** — cables with same utilization but different SVG path lengths look like they move at different speeds. Also the speed range is too narrow (3s–13s) and high-utilization cables all look identical.
2. **Gen/load MW numbers still not showing** on the hero map (endpoint returns data, rendering isn't working)
3. **Light mode Tampere label** — if 5B didn't fix this, the old PNG is still in use
4. **General visual polish** — full audit and fix pass

---

## Step 0: Context

1. `git checkout main && git pull origin main && git checkout -b phase-5c-final-polish`
2. `npm run dev`
3. Read `docs/handover.md`
4. Read `CLAUDE.md`

---

## Fix 1: Particle velocity — normalize by path length

### Current formula (HeroBalticMap.tsx, around line 161):

```typescript
const duration = Math.max(3, 13 - r.utilization * 10);
```

Problem: this gives a time in seconds for the full path traversal. But paths have different pixel lengths — NordBalt is ~400px long, EstLink 1 is ~100px. Same duration = 4× visual speed difference.

### New formula:

Calculate each cable path's pixel length, then set velocity (px/second) based on utilization:

```typescript
// Outside the useGSAP callback, compute path lengths once
const pathLengths = useMemo(() => {
  const lengths: Record<string, number> = {};
  for (const [id, d] of Object.entries(CABLE_PATHS)) {
    if (!d) continue;
    // Create a temporary SVG path to measure length
    if (typeof document !== 'undefined') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      document.body.appendChild(svg);
      lengths[id] = path.getTotalLength();
      document.body.removeChild(svg);
    }
  }
  return lengths;
}, []);
```

Then in the GSAP animation:

```typescript
resolved.forEach(r => {
  if (!CABLE_PATHS[r.id] || r.mw < 5) return;
  const particles = gsap.utils.toArray<SVGCircleElement>(`.particle-${r.id.replace(/[^a-z0-9]/g, '-')}`);
  
  // Velocity in px/second: idle=20, full capacity=120, overcapacity=150
  const baseVelocity = 20; // px/s at 0% utilization
  const maxVelocity = 150; // px/s at 100%+ utilization
  const velocity = baseVelocity + Math.min(r.utilization, 1.5) * (maxVelocity - baseVelocity) / 1.5;
  
  // Duration = path length / velocity
  const pathLen = pathLengths[r.id] || 300; // fallback
  const duration = Math.max(1.5, pathLen / velocity);
  
  particles.forEach((el, i) => {
    gsap.to(el, {
      motionPath: {
        path: `#cable-${r.id}`, align: `#cable-${r.id}`,
        alignOrigin: [0.5, 0.5],
        start: r.particleDirection === 'forward' ? 0 : 1,
        end:   r.particleDirection === 'forward' ? 1 : 0,
      },
      duration, repeat: -1,
      delay: (i / Math.max(particles.length, 1)) * duration,
      ease: 'none',
    });
  });
});
```

This means:
- A barely-used cable (10% utilization) has slow-drifting particles
- A maxed cable (100%) has fast-flowing particles
- Two cables at the same utilization look the same VISUAL speed regardless of path length
- Overcapacity (>100%) still gets faster, up to 150% cap

**Alternative simpler approach** if the SVG path measurement is tricky: use the `svgRef` to query the already-rendered path elements:

```typescript
const pathEl = svgRef.current?.querySelector<SVGPathElement>(`#cable-${r.id}`);
const pathLen = pathEl?.getTotalLength() || 300;
```

This is cleaner since the paths are already in the DOM.

### Verify

After implementing, watch the animations:
- NordBalt (74% util, ~400px) should move noticeably slower than EstLink 1 (97% util, ~100px) — but both should look "fast" since they're high utilization
- LitPol (31% util) should move clearly slower than the rest
- Fenno-Skan cables should move at roughly the same visual speed as EstLink cables when at similar utilization — NOT faster despite being longer paths

---

## Fix 2: Gen/load MW numbers on hero map

The `/genload` endpoint returns valid data: `lt: {generation_mw: 1521, load_mw: 1430}`, etc.

### Debug steps

1. Open browser DevTools → Console
2. Add temporary logging: in HeroBalticMap.tsx, after the `setGenLoad` call, add:
   ```typescript
   console.log('[KKME] genLoad response:', data);
   ```
3. Check Network tab for the `/genload` request — is it succeeding?

### Common causes and fixes

**A) Fetch URL:** Check the worker URL constant at the top of HeroBalticMap.tsx:
```typescript
const W = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
```
Verify this matches the actual endpoint.

**B) Response shape:** The code expects `genLoad?.lt?.generation_mw`. If the response wraps this in an extra layer (like `{data: {lt: ...}}`), it would silently return undefined.

**C) The fetch is in a `Promise.all` or batched call:** Check how genLoad is fetched — it might be part of a batch that's failing for a different reason.

**D) CORS in dev mode:** The worker might not return CORS headers for localhost. Check the Network tab response headers.

**E) The state is set but rendering fails:** If `COUNTRY_LABEL_PIXELS['ESTONIA']` doesn't exist (the key might be wrong case), `pos` would be undefined and `return null` fires. Log the available keys.

### Whatever you find, fix it and verify the numbers show up:
- ESTONIA: ~575 MW gen / ~911 MW load
- LATVIA: ~745 MW gen / ~845 MW load  
- LITHUANIA: ~1521 MW gen / ~1430 MW load

---

## Fix 3: Light mode map

Check if Phase 5B successfully generated light-mode SVG layers. Look for:
- `public/design-assets/Map/Layers/background-light.svg`
- `public/design-assets/Map/Layers/countries-light.svg`

If they exist, verify HeroBalticMap.tsx uses them in light mode (not the old PNG).

If they DON'T exist, generate them now:

```bash
# Extract PNGs from dark SVGs
python3 -c "
import xml.etree.ElementTree as ET, base64
def extract(svg, out):
    tree = ET.parse(svg)
    for el in tree.iter():
        tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
        if tag == 'image':
            href = el.get('{http://www.w3.org/1999/xlink}href', el.get('href', ''))
            if 'base64' in href:
                data = base64.b64decode(href.split(',',1)[1])
                open(out,'wb').write(data)
                print(f'Extracted {len(data)} bytes → {out}')
                return
extract('public/design-assets/Map/Layers/background-black.svg', '/tmp/bg-dark.png')
extract('public/design-assets/Map/Layers/countries.svg', '/tmp/countries-dark.png')
"

# Check if they have alpha
identify /tmp/bg-dark.png | head -1
identify /tmp/countries-dark.png | head -1

# Invert for light mode (preserve alpha if present)
convert /tmp/bg-dark.png -channel RGB -negate +channel /tmp/bg-light.png
convert /tmp/countries-dark.png -channel RGB -negate +channel /tmp/countries-light.png

# Tint to warm cream (--theme-bg light is approximately #f5f2ed)
# Try a few approaches — screenshot each to check
convert /tmp/bg-light.png -modulate 100,80,100 -fill '#f5f2ed' -colorize 12% /tmp/bg-light-v1.png
convert /tmp/countries-light.png -modulate 100,80,100 -fill '#f5f2ed' -colorize 12% /tmp/countries-light-v1.png
```

Visually inspect. Iterate. Then re-embed as SVG and update HeroBalticMap.tsx.

If the old PNG is still being used, replace the light-mode block:
```tsx
) : (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <img src="/design-assets/Map/Layers/background-light.svg" ... />
    <img src="/design-assets/Map/Layers/countries-light.svg" ... />
  </div>
)}
```

---

## Fix 4: Full visual audit

Take screenshots of the ENTIRE page in both dark and light mode. For each section, check:

- **Color**: Charts have colored bars/lines (not transparent/invisible). If Chart.js colors are still broken, the `chartTheme.ts` fix from 5B may not have landed — re-implement the CSS variable resolution approach.
- **Typography**: Unbounded for big numbers, DM Mono for data, Cormorant for interpretation
- **Spacing**: Consistent vertical rhythm between sections
- **Cards**: Follow anatomy (header → hero metric → status → interpretation → viz → impact → source → drawer)
- **Scroll animations**: Elements fade in on scroll
- **Theme toggle**: Smooth transition, no broken elements
- **Sticky nav**: Opaque, logo visible, ticker readable
- **Footer**: Clean, no orphaned elements

Fix anything you find. This is the finalization pass.

---

## Step 5: Verification

1. Screenshot hero dark + light — country names, gen/load numbers, cable particles at varying speeds
2. Screenshot every card section — charts must have COLOR
3. Toggle theme — verify smooth transition
4. `npx next build` — must succeed
5. Check console for errors

---

## Step 6: Commit

```bash
git add -A
git commit -m "phase5c: normalize particle velocity by path length, fix gen/load display, visual polish pass"
git push -u origin phase-5c-final-polish
```

Compare URL: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-5c-final-polish`

**Report:** screenshots of hero (both themes), chart colors, particle animation observations.
