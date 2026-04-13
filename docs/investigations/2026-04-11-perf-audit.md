# Performance Audit — kkme.eu — 2026-04-11

## Lighthouse scores (production, 1440x900)

- Performance: N/A (Lighthouse MCP tool excludes performance category; trace-based metrics below)
- Accessibility: 89/100
- Best Practices: 96/100
- SEO: 100/100

### Core Web Vitals (from performance trace, production)

- LCP: 337 ms (excellent — threshold <2500 ms)
- CLS: 0.01 (excellent — threshold <0.1)
- TTFB: 27 ms
- LCP breakdown: TTFB 27ms + Load delay 93ms + Load duration 28ms + Render delay 189ms

## Top Lighthouse opportunities

1. Forced reflow — 239 ms total reflow time across multiple call frames
2. Render-blocking CSS (f9ae468b.css) — 32 ms total, but 0 ms estimated FCP/LCP savings (already fast)
3. DOM size — 2494 elements, max depth 18, largest child count 96 (TBODY)
4. Style recalculation — 93 ms affecting 1116 elements
5. Contrast ratio failures — 5 elements below WCAG AA threshold

## Network waterfall — top 10 by decoded size

| URL | Type | Encoded KB | Decoded KB | Duration ms | Render-blocking |
|-----|------|-----------|-----------|-------------|-----------------|
| /hero/kkme-interconnect-dark.png | image | 1717 | 1717 | 1113 | No |
| /hero/kkme-interconnect-light.png | image | 1419 | 1419 | 717 | No |
| 306f1ddfed40f04f.js | script | 266 | 1097 | — | No |
| 8ee528fa0ee45e7a.js | script | 87 | 240 | — | No |
| e9db456e6febb5bf.js | script | 68 | 218 | — | No |
| 0b13cc3e81e05160.js | script | 67 | 193 | — | No |
| 5f7dad1fd736e938.js | script | 50 | 186 | — | No |
| 77679eb8a0bc2506.js | script | 39 | 152 | — | No |
| 31bac818bde016ff.js | script | 30 | 118 | — | No |
| 8b2d6a04eb28e592.js | script | 22 | 91 | — | No |

## Hero raster image sizes

- kkme-interconnect-dark.png: 1717 KB, 1113 ms load (uncached)
- kkme-interconnect-light.png: 1419 KB, 717 ms load (uncached)

Both images are ~1.4-1.7 MB PNGs. Converting to WebP or AVIF could reduce by 60-80%.

## Hero data hooks

- /s4: 25 KB, 184 ms
- /s8: 0.4 KB, 159 ms
- /s4/fleet: 21 KB, 216 ms
- /s1/capture: 10 KB, 232 ms
- /revenue?dur=4h: 24 KB, 345 ms
- /s2: 3 KB, 245 ms
- /s9 (existing EU ETS): 0.2 KB, 313 ms

Total API payload: ~84 KB. Latencies are 150-350 ms per call (worker cold start + KV read).
Duplicate fetches observed: /s2 x2, /s1/capture x2, /s4/fleet x2, /s8 x2, /read x2, /revenue x2.

## Animation performance

### Production (5s, 300 frames)

- Average FPS: 56.1
- Worst frame: 130.8 ms
- P95 frame: 23.2 ms
- P99 frame: 36.9 ms
- Dropped frames: 160 / 300 (53.3%)

### Local dev (5s, 300 frames)

- Average FPS: 25.0
- Worst frame: 86.4 ms
- P95 frame: 65.6 ms
- P99 frame: 77.0 ms
- Dropped frames: 290 / 300 (96.7%)

### Animation cost analysis

- 30 GSAP-animated SVG circle particles (cable flow particles on 6 cables)
- 8 Chart.js canvas elements (hero sparkline + below-fold charts)
- Clarity analytics: 2,358 ms main thread time during 5s trace
- Forced reflows: 239 ms total across multiple frames
- No layout thrashing detected beyond the forced reflows

GSAP particle cost is the primary animation driver. Each of 30 particles has a continuous motionPath animation updating transform matrices every frame. At 56 FPS production, 53% of frames still exceed the 16.7ms budget.

## JavaScript bundle (production)

All 15 scripts loaded with `async` attribute — none are synchronously blocking.

| Chunk | Encoded KB | Decoded KB | Likely content |
|-------|-----------|-----------|----------------|
| 306f1ddf | 266 | 1097 | Three.js + @shadergradient/react (lazy) |
| 8ee528fa | 87 | 240 | React DOM / framework |
| e9db456e | 68 | 218 | React core / runtime |
| 0b13cc3e | 67 | 193 | Chart.js |
| 5f7dad1f | 50 | 186 | App components |
| 77679eb8 | 39 | 152 | Next.js runtime |
| 31bac818 | 30 | 118 | D3 / mapping |
| 8b2d6a04 | 22 | 91 | GSAP + framer-motion |
| cb0e15da | 13 | 43 | Utilities |
| Other (6) | 36 | 108 | Turbopack, routing, misc |

- **Total initial JS (encoded/wire):** 678 KB
- **Total initial JS (decoded):** 2,446 KB
- **Critical-path JS:** ~0 KB (all async)
- **Fonts:** 8 woff2 files, 150 KB total
- **CSS:** 1 file, 31 KB

### Heavy dependencies identified (dev mode chunk names)

- `@shadergradient/react` → pulls in THREE.js (3 chunks, ~1 MB decoded) — used for hero background gradient
- `chart.js` — 8 chart canvases
- `gsap` — 30 particle animations
- `framer-motion` + `motion-dom` — section animations
- `lodash-es` — utility functions
- `@allmaps/transform` + `ml-matrix` — geo projection for Baltic map
- `animejs` — state-change animations
- `clarity.ms` — Microsoft Clarity analytics (2.3s main thread in 5s trace)

### Third-party scripts

- Microsoft Clarity (2 scripts, async): 2,358 ms main thread time in 5s trace window
- Cloudflare email-decode.min.js: minimal impact

## Recommended fixes (prioritized by impact)

### 1. Convert hero PNGs to WebP/AVIF

- **Savings:** ~2 MB wire transfer → ~400-600 KB (60-80% reduction)
- **Effort:** medium (generate new assets, add `<picture>` element with format fallback)
- **Visual risk:** none (lossless or near-lossless compression)

### 2. Lazy-load @shadergradient/react (Three.js)

- **Savings:** ~266 KB wire / 1,097 KB decoded JS not loaded on initial page
- **Effort:** medium (dynamic import, Suspense boundary)
- **Visual risk:** minor (gradient appears slightly later, needs loading state)

### 3. Deduplicate API fetches

- **Savings:** 6 duplicate network requests eliminated (~30 KB, ~600 ms cumulative latency)
- **Effort:** low (shared SWR cache or lift fetch to parent)
- **Visual risk:** none

### 4. Reduce GSAP particle count

- **Savings:** ~30-50% frame budget reduction
- **Effort:** low (reduce from 30 to 12-15 particles, or pause off-screen)
- **Visual risk:** minor (fewer visible flow dots on cables)

### 5. Defer Clarity analytics

- **Savings:** 2.3s main thread freed during steady-state animation
- **Effort:** low (load after `requestIdleCallback` or delay 5s)
- **Visual risk:** none (analytics only)

### 6. Code-split Chart.js

- **Savings:** ~67 KB wire (charts only needed below fold)
- **Effort:** medium (dynamic import per chart component)
- **Visual risk:** none (charts appear on scroll)

## Fixes recommended for THIS session (high-impact, low-risk, no visual change)

None. This session's scope is the /s9 ENTSO-E endpoint and live gen/load labels.
All performance fixes require either asset rework (images), dependency changes
(Three.js, Clarity), or animation tuning (GSAP particles) — each warrants its
own focused session to avoid visual regressions.

## Fixes deferred to a later session

1. **Hero image format conversion** (WebP/AVIF) — requires generating new assets, testing across browsers, adding `<picture>` fallback. Largest single win (~2 MB savings). Recommend dedicated session.
2. **Three.js lazy-load** — @shadergradient/react is the single largest JS chunk. Needs investigation into whether it's used above-fold or can be deferred. Recommend audit of where ShaderGradient is rendered.
3. **API deduplication** — multiple components independently fetch the same endpoints. Needs shared data layer or SWR deduplication. Medium effort, architectural change.
4. **GSAP particle optimization** — reduce count or pause when not in viewport. Needs visual review of reduced particle density. Minor visual risk.
5. **Clarity deferral** — simple `setTimeout` or `requestIdleCallback` wrapper. Low risk but negligible user-facing impact.
6. **Chart.js code-splitting** — dynamic import per chart component. Below-fold only, so low priority.
7. **Accessibility fixes** — 5 contrast ratio failures, touch target sizes, table headers. Important but separate from perf.

## Open question for next session

LCP measured at 337 ms but the hero PNG (1.7 MB) takes 1113 ms to load uncached. Likely LCP is measuring the KKME wordmark or €-rate hero number as the largest contentful paint, not the raster — both render before the image loads. This is actually good (text-first paint) but should be verified on a clean browser profile to confirm LCP isn't being measured against a cached image.

## Deferred fix queue (suggested session order)

1. Phase 2C — wife's transparent PNG assets + WebP/AVIF conversion. Saves ~2 MB wire transfer. Tomorrow.

2. Phase 2D — defer Microsoft Clarity to requestIdleCallback. Frees ~2.3s main thread time. Trivial change, immediate animation FPS improvement.

3. Phase 2E — ShaderGradient investigation. Find where @shadergradient/react is rendered (266 KB wire / 1.1 MB decoded — biggest JS chunk). If dead code, remove. If load-bearing, dynamic import behind Suspense.

4. Phase 2F — GSAP particle tuning. Reduce from 30 to 12-15 particles, pause when off-screen. Visual review needed.

5. Phase 2G — API fetch deduplication. SWR-based shared cache or lift fetches to parent. Architectural, higher risk.
