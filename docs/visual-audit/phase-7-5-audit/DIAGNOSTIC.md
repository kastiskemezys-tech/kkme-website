# Phase 7.5 audit — DOM diagnostic pass

Captured 2026-04-21 via Cowork Chrome MCP against production `kkme.eu`.
Viewport: 1440×900, dark theme, default params `?dur=4h&capex=mid&cod=2028&scenario=base`.

This is the factual substrate for the user's visual critique. Each finding is
a DOM/CSS measurement, not an impression.

---

## 1. Hero background not fixed — CONFIRMED

- `<body>` → `background-color: rgb(7, 7, 10)`, `background-attachment: scroll`
- `.hero-section` → `background: rgb(5, 5, 5) none`, no `background-image`,
  `background-attachment: scroll`

No parallax, no fixed layer, no gradient, no atmosphere. The hero is a flat
charcoal rectangle that scrolls away with the page. User's complaint
("background for the hero isn't fixed") is accurate.

Routing → **Phase 7.6 (Hero refinement)**.

---

## 2. Map "not transparent" — CONFIRMED, specific cause isolated

SVG `viewBox 0 0 1024 1332` rendered at 421×548 inside hero center column.

Fill distribution across 112 drawable SVG elements:

| Fill | Count | Interpretation |
|---|---:|---|
| `none` | 25 | interconnector line paths (stroke-only) |
| `rgb(252, 211, 77)` | 52 | country polygons — **solid amber, no opacity** |
| `rgb(77, 197, 176)` | 13 | teal dots/markers — solid |
| `rgba(232, 226, 217, 0.65)` | 9 | cream city circles |
| `rgba(77, 197, 176, 0.1)` | 13 | teal fill at 10% (already transparent — glow layer) |

Problem is the 52 amber country polygons at **full opacity**. That's what
reads as "cartoon map" — flat fills with no depth, no atmospheric falloff,
no sense the map is a layer on top of something. The SVG itself is
transparent, but the fills inside are not.

Fix direction: drop country polygon fill opacity to ~0.08–0.14, keep a
hairline stroke at ~0.4, let the hero background (once it gets one) show
through. Bloomberg/Linear reference is always "glass on dark" — the map is
a lens, not a paint layer.

Routing → **Phase 7.6 (Hero refinement)**.

---

## 3. H1 headline is empty — CRITICAL

- `document.querySelector('h1')` returns a node
- `.innerText === ""` (empty string)
- `font-size: 16px` (Cormorant)

There is no visible top-level headline on the page. A 16px empty H1 is
both an accessibility/SEO failure and a visual-hierarchy failure. First
thing a visitor (or investor, or Google) sees has no titular anchor.

Hero's first visible text is the tagline `"Baltic flexibility market, live"`
followed immediately by the source credits row. No display-size typography
anywhere in the fold.

Routing → **Phase 7.6 (Hero refinement)**. Add a real H1 at ~48–64px
Cormorant or Unbounded. This is probably the single biggest visual lift
available.

---

## 4. Text-to-visual ratio is backwards — CONFIRMED

Document-wide counts:

- 27,968 characters of body text
- 103 `<p>` elements
- 8 `<canvas>` elements (Chart.js)
- 7 `<h2>` sections
- 282 descendants inside the hero alone

Ratio: **~3,500 text characters per chart**. For a market-intelligence
dashboard whose pitch is "Baltic BESS numbers live," this is inverted.
Bloomberg Terminal analog: a screen is mostly numbers and glyphs; prose
annotates, it doesn't dominate.

Canvases at current sizes (desktop):
`468×120, 468×140, 468×120, 468×140, 691×280, 415×140, 540×120, 1068×220`.

Most charts are short (120–140px) — they're decorative sparklines, not
analytical surfaces. Only the 691×280 and 1068×220 are "real" chart
canvases. User's comment "visuals that say 1000 words" is well-founded:
the current viz budget is too small.

Routing → **Phase 8 (Visualization density)**.

---

## 5. Mobile breakpoints are shallow — CONFIRMED

Total `@media` rules found across stylesheets: **5**, of which:

- `(max-width: 520px)`
- `(max-width: 768px)`
- `(max-width: 900px)`
- `(min-width: 1100px)`
- `(prefers-reduced-motion: reduce)`

So **4 width breakpoints, 0 of them below 520px**. iPhone-class viewports
(375px, 390px, 430px) all fall into the same 520px bucket. No 360, no 414,
no tablet-portrait bucket between 768 and 900. For a site the user intends
to share with Baltic investors (who will open links on phones first),
this is thin.

Also confirms the "mobile Hero doesn't work" symptom at a structural level
— if there's no <520px tuning, the 1440-wide hero grid collapses into
something that was never specifically designed.

Note: Cowork's Chrome-MCP `resize_window` resizes the OS window but
**does not shrink Chrome's inner viewport** — innerWidth stayed at 1463
even after resize to 390. Visual mobile confirmation needs to defer to
Claude Code's `chrome-devtools` MCP (device-mode emulation), which the
user has already installed.

Routing → **Phase 7.6 (Mobile-first rebuild)**.

---

## 6. Hero dimensional signature

- Section height: 720px (tight, one screen)
- 282 descendants
- 0 canvases, 3 SVGs, 4 images
- Structure: `[44px top bar] [300 + 620 + 300 three-column row at height 548] [40px bottom strip]`

The 300/620/300 split is correct as information architecture — flanks
(interconnectors, cities) framing the map. At mobile it collapses without
explicit design and becomes the "invisible hero."

---

## 7. Time-comparison UI — ABSENT

Page text scan picks up `30D CAPTURE TREND`, `BALTIC FLEET`, `30D` etc.
but **no toggles for daily / weekly / monthly / 3mo / 6mo**. Every data
surface is fixed-window.

User's request is standard Bloomberg behavior: `[1D | 1W | 1M | 3M | 6M | YTD]`
segmented control above each chart. Today, zero of 8 canvases has one.

Routing → **Phase 8 (Time-comparison framework)**.

---

## Phase routing summary

Existing roadmap (`docs/roadmap.md`) already covers most of this.
The issue is **sequencing**, not missing scope.

| Finding | Severity | Where it lives today | Recommendation |
|---|---|---|---|
| #1 Hero bg flat/not fixed | High | — (nowhere) | **New: Phase 7.6** |
| #2 Map solid amber fills | High | — (nowhere) | **New: Phase 7.6** |
| #3 Empty H1 / no display headline | CRITICAL | — (nowhere) | **New: Phase 7.6** |
| #4 Text-heavy, too few charts | Medium | Implicit across 7.5 / 12 | Phase 7.5 + Phase 12 |
| #5 No sub-520 breakpoints | High | Phase 14 (Mobile pass) | **Pull forward** |
| #6 Hero mobile collapse | High | Phase 14 (Mobile pass) | **Pull forward** |
| #7 No time-period toggles | Medium-High | Phase 12 (Historical depth) | **Pull forward** |

**Phase 7.5** — ship as-written. It's scope-locked and excludes hero map/mobile
explicitly. Execute it next (prompt exists).

**Phase 7.6 (new)** — Hero refinement: bg fixed, map polygon opacity, real H1.
Pure visual, no data changes. Roughly 1 CC session.

**Phase 12 promoted to 8** — Historical depth / time-period toggles. Move it
earlier because the user asked for it and because it's a lightweight data-surface
change (history already exists in worker).

**Phase 14 promoted to 9** — Mobile pass. Move it up because investors will
open share links on phones; current sub-520 breakpoint gap is a first-impression
liability.

**Current Phases 8, 9, 10, 11, 13** (Market Regime, Peer comparison, Fleet,
Interactive revenue, Methodology) all demote by 2 slots but retain order.

Nothing silently drops. Every item in the user's 2026-04-21 critique has a
named home; the change is in *when* they ship, not *whether*.
