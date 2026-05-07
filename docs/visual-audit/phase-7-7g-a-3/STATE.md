# Phase 7.7g-a-3 — Prose visual state description

**Date:** 2026-05-07
**Branch:** `phase-7-7g-a-3-typography-rationalization`
**Build:** clean (`npm run build` 7 routes, 4.3s)
**Local serve verified:** `localhost:3100` HTTP 200 + 21 chunks 200 + Plex/Newsreader Latin .woff2 200

Chrome MCP browser-lock recurred this session (5th consecutive — backlog
operator-action-item bumped to "actually do this" priority). Operator
pre-approved curl-only verification path with prose state-description doc
substituting the screenshot grid.

This document describes the rendered typography + spacing state per surface
post-fix so an operator hard-refresh against kkme.eu can verify each surface
matches expectation.

---

## Token state

**Type scale (`globals.css :root`)** — all 9 tokens emitted in production CSS:
- `--type-display-2xl` 4rem (64px) — hero number
- `--type-display-xl` 3rem (48px) — section H1
- `--type-display-lg` 2rem (32px) — card hero number
- `--type-display-md` 1.5rem (24px) — card subtitle number
- `--type-body-lg` 1rem (16px) — body
- `--type-body-md` 0.875rem (14px) — dense card body
- `--type-body-sm` 0.75rem (12px) — meta, tickers
- `--type-label` 0.6875rem (11px) — KPI labels
- `--type-mono-xs` 0.625rem (10px) — provenance only

Old `--font-*` tokens preserved as back-compat aliases (414 existing
consumers unaffected).

**Space scale** — 8 tokens unchanged from Phase 7.7g-a-2 (`--space-2xs` 4
through `--space-3xl` 96).

**`--font-display` token DELETED** from `globals.css`. **`--font-unbounded`
DELETED** from `app/layout.tsx`.

---

## Hero (HeroBalticMap.tsx)

**Broadsheet masthead** — `<img>`-based KKME wordmark (PNG, dark/light
variants) at line 332. Unbounded was never load-bearing for the wordmark
itself; the masthead remains visually identical post-fix.

**Today's BESS rate hero number** (line 703) — `€{value}` at 72px (now
`var(--type-display-2xl)` = 64px, **−8px from pre-fix 72px** for
spec-alignment). `font-family: var(--font-serif)` (Newsreader) editorial
hero. Operator post-merge: verify the hero number does not feel too small
relative to surrounding chrome.

**Block 2 (Fleet composition)** — `{totalOp} MW` at 24px
(`var(--type-display-md)`); `font-family: var(--font-serif)` editorial.
Inline `(BESS + pumped hydro)` subscript stays mono (Phase 12.11).

**Block 3 (Key ratios — S/D, CPI, PHASE tiles)** — numbers at 16/16/14px
(`var(--type-body-lg)` / `var(--type-body-md)`); `font-family:
var(--font-mono)` for tabular-num data discipline (was Unbounded
`--font-display`, hand-corrected at sub-item (c) Pause).

**Country-name SVG labels (FINLAND/SWEDEN/etc.)** at line 535 —
`fontFamily="var(--font-mono)"` (was `var(--font-display)`). The Plex Mono
rendering retains the broadsheet-uppercase letterspaced feel per Phase 18
identity.

---

## Hero card metric tiles (8 sites)

`S1Card`, `S2Card`, `RevenueCard`, `BalticStorageIndexCard`,
`RenewableMixCard`, `SpreadCaptureCard`, `PeakForecastCard`,
`ResidualLoadCard`, `S8Card`, `S6Card`, `S5Card`, `MetricTile` primitive —
all `clamp()` responsive hero-number patterns preserved as deliberate
exceptions (responsive scaling supersedes 9-step strict adherence). Examples:
- `clamp(56px, 7vw, 88px)` — S1/S2/RevenueCard/BalticStorageIndex hero
- `clamp(40px, 5.5vw, 64px)` — MetricTile primitive
- `clamp(2.5rem, 6vw, 3.75rem)` — S5/S6 card hero

`fontWeight: 200` (Newsreader hairline) preserved at 5 hero-tile sites:
S1Card / S2Card / RevenueCard / BalticStorageIndexCard / MetricTile.

---

## Card prose surfaces (S1, S2, S3, S4, S5, S6, S7, S8, S9 + sub-cards)

**Inline highlighted nouns** — `<span style={{ fontFamily:
'var(--font-serif)', fontWeight: 500 }}>100 MW / 4h</span>`-style sites
migrated via bulk replacement to `--font-serif`. Editorial italicized
emphasis pattern (Phase 18 broadsheet feel).

**Card hero numbers** — RevenueCard / TradingEngineCard / S3Card display
numbers at 16-32px now resolve to `var(--type-display-md)` /
`var(--type-display-lg)` tokens, with `--font-serif` Newsreader rendering.
Pre-fix sites at 1.125rem (18px) and 1.25rem (20px) bumped up to 24px —
slight visual upward shift for consistency.

**KPI labels** — uniform Plex Mono, uppercase, 0.06em letter-spacing,
`var(--type-label)` (11px) or `var(--type-mono-xs)` (10px) per density.

**Provenance footers** — `var(--type-mono-xs)` (10px) Plex Mono mute. Was
0.5625rem / 9px / mixed.

---

## ChartTooltip primitive

**Value row** at line 161 — `font-family: var(--font-mono)` (was
`--font-display`); editorial hairline value rendering moves to numeric Plex
Mono. **Padding** changed from shorthand `'6px 8px'` → per-side
(`paddingTop: '6px', paddingRight: var(--space-xs), paddingBottom: '6px',
paddingLeft: var(--space-xs)`); 6px values stay as deliberate off-scale
literals for tooltip visual rhythm.

---

## Methodology page (`/methodology`)

**H1** — `var(--font-serif)` 32px (`var(--type-display-lg)`), Newsreader
display. Was Unbounded display.
**H2** — `var(--font-serif)` 24px (`var(--type-display-md)`), Newsreader
display. Was Unbounded display.
**H3** — `var(--font-mono)` (unchanged) uppercase tracked.
**Body / list** — `var(--font-serif)` (Newsreader regular).
**Code blocks** — `var(--font-mono)`, `var(--type-body-md)` (was 0.85rem ≈
13.6px; rounded to 14px).
**Page padding** — was `padding: '80px 24px 120px'`; now `paddingTop: 80px,
paddingRight: var(--space-md), paddingBottom: 120px, paddingLeft:
var(--space-md)`. 80/120 stay literal (off-scale, page-level deliberate).

---

## Intel page (`/intel`) + Regulatory page (`/regulatory`)

Same page-level padding pattern as methodology. Intel + regulatory feed
items: typography unchanged from Phase 18 baseline (Newsreader serif headings
+ Plex Mono provenance), but inline shorthand padding/margin all expanded to
per-side var(--space-*) tokens.

---

## Bundle delta (in rendered visual terms)

**Unbounded fully removed.** Browser pulls Plex Mono + Newsreader only post-fix.
- Plex Mono 400/500 (Latin + Latin-ext + Cyrillic + Vietnamese subsets — browser unicode-range gates)
- Newsreader 200 (hairline) / 400 (regular) / 400-italic (broadsheet identity)

Effective load for English/Lithuanian visitor: ~167 KB Latin total.

**No Unbounded fallback remains in any token chain.** If an operator
post-merge visual finds the masthead wordmark looks pixelated /
not-quite-right, the wordmark is the PNG `<img>` per `HeroBalticMap.tsx:332`
— inspect the PNG asset itself rather than expecting Unbounded to render.

If a deliberate visual design intent emerges that wants Unbounded restored
specifically for the masthead text, file Phase 7.7g-a-3.1 hot-fix:
- Re-add `Unbounded` next/font import + variable
- Define `--font-wordmark: var(--font-unbounded)` in globals.css
- Apply to the wordmark-only site
- Total weight added: ~50-115 KB depending on weight count

---

## Operator post-merge verification checklist

1. **Hard-refresh kkme.eu mobile + desktop, dark + light theme**
2. **Hero today's BESS rate**: 64px Newsreader (was 72px Unbounded) — feels right? Or want to bump back up?
3. **Hero S/D / CPI / PHASE tiles**: numbers in Plex Mono (was Unbounded display) — looks like data, not headline?
4. **Country-name labels on map**: Plex Mono uppercase (was Unbounded display) — readable at viewBox scale?
5. **Card hero numbers (RevenueCard, S2Card, S3Card etc.)**: Newsreader serif rendering — broadsheet feel preserved?
6. **Methodology page H1/H2**: Newsreader display (was Unbounded display) — editorial identity intact?
7. **Inline highlighted nouns ("100 MW", "50 MW")**: Newsreader serif emphasis — italic-feeling?
8. **No font-loading FOUT** for any Newsreader weight on initial load
9. **No 18.1.1-class ChunkLoadError** on first page paint or theme-toggle round-trip

If any of these fail, file Phase 7.7g-a-3.1 hot-fix referencing the
specific failing surface.
