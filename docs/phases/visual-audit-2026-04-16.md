# Visual Audit — kkme.eu — 2026-04-16

Comprehensive issue catalogue for Phase 4A visual overhaul. Audited against 2026 B2B intelligence platform standards. Investor-first priority.

Page: localhost:3000, branch phase-4b-intel-pipeline (post quality gate), dark mode, 1440×900 viewport.

---

## Critical (investor-visible credibility issues)

### V-01 · Model Risk Register is a raw HTML table
**Location:** page.tsx lines 144–207, inline JSX (not a component)
**Problem:** 7 rows of MR-XX entries rendered as a 4-column CSS grid. HIGH/HIGH in red, MED in amber. Reads as a debug output table, not an institutional trust surface. Every risk shows HIGH or MED impact with HIGH residual — the register signals "nothing is under control" rather than "we know our limitations." Per user decision: analyze each risk, reduce where possible, retire the section entirely.
**Fix:** Phase 3E scope — analyze each MR-XX, write honest assessment of which are genuinely still HIGH vs. addressed by recent work (e.g., MR-04 "Activation revenue assumed — no Baltic observed data" may be partially addressed by BTD data now flowing), reduce ratings where justified, then remove both Model Risk Register and Data Confidence sections from the page. Archive content in docs/ for reference.

### V-02 · 63 inline rgba() violations
**Location:** Scattered across components — page.tsx line 187 (`rgba(232,226,217,0.04)`), WindCard.tsx line 93, multiple card components
**Problem:** Design system rule (ADR-005) says `var(--token)` only. 63 elements have raw `rgba()` in inline styles. Makes theme maintenance fragile and dark↔light parity unreliable.
**Fix:** Grep all inline rgba/hex, replace with existing tokens or create new ones in globals.css. Bulk mechanical fix, low risk.

### V-03 · Structural drivers are flat receipt cards
**Location:** page.tsx lines 74–101 (tier3-grid), WindCard/SolarCard/LoadCard/S8Card/S7Card/S9Card
**Problem:** Six tiles, each showing a point value + "vs 7D avg" chip + one interpretation line. No temporal shape (sparklines, micro-charts), no composed metrics (renewable penetration %, residual load), no trajectory. Per bucket3-rebuild-plan.md: replace Wind→Renewable mix, Solar→Residual load, Demand→Peak forecast, Interconnectors→Spread capture. Keep Gas and Carbon but add sparklines.
**Fix:** Phase 3B scope — full tile replacement. Requires worker data work for some tiles (hourly genload history, day-ahead forecast).

---

## High (2026-standard gaps — visible to any visitor)

### V-04 · Zero scroll-triggered animations
**Measurement:** 0 elements with scroll-reveal, IntersectionObserver, or AOS classes. Page renders static after initial load — all 10,173px of it.
**Problem:** Every modern intelligence/finance platform (Bloomberg Terminal web, Pitchbook, even Stripe's docs) has subtle entrance animations. Cards slide/fade in as they enter viewport. Without this, the 10K-pixel scroll feels like reading a PDF.
**Fix:** Add a lightweight `CardEntrance` component (already imported in page.tsx line 26 — check if it works or is a stub). Use CSS `@keyframes` + `IntersectionObserver` for fade-up on each `.section` and `.card`. Keep it subtle: 200ms fade + 8px translate-y. No parallax, no bounce.

### V-05 · Three-font system underused
**Measurement:** DM Mono: 1536 elements. Cormorant: 411 (mostly empty divs inheriting). Unbounded: 31 (H1 "KKME" + section H2s + a few hero numbers).
**Problem:** Unbounded only on "KKME" logo and section headings. Cormorant barely visible — mostly inherited by empty containers. The three-font identity (ADR-005) exists in the CSS but not on the page. Specific gaps:
- Hero numbers (€504/MW/DAY) should be Unbounded — check if they are
- Section descriptive copy should be Cormorant — currently DM Mono
- Intel feed editorial pull-quotes are Cormorant (good — Phase 3C did this)
- Revenue card numbers should be Unbounded
- Contact section "Looking at Baltic storage?" IS Cormorant (good)
**Fix:** Audit every text surface: numbers/metrics → Unbounded, editorial/narrative → Cormorant, data/UI/labels → DM Mono. Section description paragraphs (currently DM Mono) should switch to Cormorant for warmth.

### V-06 · Color temperature is mono-cool
**Measurement:** Text colors: all warm-cream variants (rgba(232,226,217,X)). Accents: teal, rose, amber. No warm "energy" color used outside the hero cable particles.
**Problem:** The amber `--cable-particle` in the hero is the only warm accent. Everything below the fold is teal/cream/charcoal. An investor-facing site about energy infrastructure should feel warmer — not corporate-cold.
**Fix:** Introduce `--amber` more deliberately: section header accents, featured-item highlight bar, "View all" button hover, CTA touches. Don't redesign the palette — redistribute what exists. Amber for emphasis, teal for interactive, rose for warnings.

### V-07 · Section spacing is metronomic
**Measurement:** Section gaps (H2 to H2): Revenue→Build 1335px, Build→Structural 1384px, Structural→Revenue Engine 1011px, Revenue Engine→Dispatch 1281px, Dispatch→Intel 1145px, Intel→Model Risk 1469px, Model Risk→Contact 838px.
**Problem:** Every section is ~1200px tall regardless of content density. The page has no rhythm — dense sections (Revenue Engine with its tables and charts) get the same space as sparse sections (Model Risk with 7 rows). No breathing room between major content shifts, no visual dividers.
**Fix:** Add deliberate section separators (thin `<hr>` with token color, or a subtle gradient fade). Compact sparse sections (Model Risk was 838px gap — after V-01 retirement it's gone). Add extra breathing room around the Revenue Engine (it's the centerpiece). Let natural content height drive spacing instead of uniform padding.

### V-08 · Hero right column is a text stack
**Location:** HeroBalticMap.tsx — the revenue/fleet/S-D sidebar on the right
**Problem:** €504/MW/DAY, capture trend, fleet breakdown, 822 MW, S/D, CPI are all vertically stacked text. No grouping, no card boundaries, no micro-dashboard feel. Reads as a debug output sidebar.
**Fix:** Group into 2–3 distinct visual blocks: (1) Revenue headline + capture trend (top), (2) Fleet composition bar + pipeline (middle), (3) Key ratios row (S/D, CPI, Mature). Add subtle background/border to each group. Consider making the capture-trend sparkline larger and more prominent — it's the most valuable chart on the page.

---

## Medium (polish items — noticeable on close inspection)

### V-09 · Structural driver tiles have inconsistent heights
**Measurement:** Wind 328px, Solar 284px, Demand 331px, Interconnectors 232px, Gas 351px, Carbon 351px.
**Problem:** 100px height variance across a 3×2 grid looks ragged. Gas and Carbon are tallest (they have gauge visualizations), Interconnectors is shortest.
**Fix:** Phase 3B will replace 4 of these tiles, so this resolves naturally. For Gas/Carbon (which stay), ensure they're height-matched.

### V-10 · No number count-up animations
**Problem:** €504, 14.7% IRR, 822 MW, €184k/MW/yr — all render instantly as static text. A count-up animation (even just 400ms ease-out from 0 to target) makes data feel alive and draws the eye.
**Fix:** Add a `useCountUp` hook for hero metrics. Apply to: hero revenue number, IRR, CFADS, fleet MW, and any other prominent number. Use `IntersectionObserver` to trigger on viewport entry (don't animate offscreen).

### V-11 · Intel feed "THIS WEEK'S MARKET MOVERS" section
**Problem:** This pinned-items subheading creates a secondary list above the main feed. With the new 8-item cap, having a featured item + market movers + standard list is three layers of hierarchy — too many. Simplify to: featured (1) + standard list (7) + "View all" expander.
**Fix:** Remove or merge the "THIS WEEK'S MARKET MOVERS" section. The featured item already serves this purpose.

### V-12 · Filter UI pills are text-only
**Location:** IntelFeed.tsx filter chips
**Problem:** "All / Competition 4 / Market Design 16 / Project Stage 30" as plain bordered text pills. No active-state color fill, no hover feedback beyond cursor change. Looks like a form element, not a product filter.
**Fix:** Active filter gets a filled background (teal-bg or amber-bg token). Hover gets a subtle background shift. Count numbers in a slightly different weight or color. Add micro-animation on filter change (list re-renders with a brief fade).

### V-13 · Contact section is adequate but cold
**Location:** page.tsx lines 214–263
**Problem:** Cormorant serif copy (good) + mono contact details + form. Works. But for an investor-first page, the contact section could signal more confidence. Photo of Kastytis? A credential line? "15 years in startups, 3+ years in energy storage" adds trust.
**Fix:** Low priority. Consider adding a headshot (if available) and one credential line. Don't over-design — current simplicity is fine.

### V-14 · Footer is one-line minimal
**Location:** page.tsx footer (contentinfo)
**Problem:** "Data: ENTSO-E · NVE · ECB · energy-charts.info · Litgrid · VERT.lt · Updated every 4h" + keyboard shortcuts. Functional but looks like it was forgotten. No logo, no copyright, no last-updated timestamp.
**Fix:** Add KKME wordmark + "© 2026 UAB KKME" + last data update timestamp (pull from worker /health). Keep it minimal but intentional.

### V-15 · page.tsx has hardcoded DM Mono font-family strings
**Location:** page.tsx lines 45, 62, 78, 108, 124
**Problem:** `fontFamily: 'DM Mono, monospace'` instead of `fontFamily: 'var(--font-mono)'`. Works, but bypasses the token system and would break if the font changed.
**Fix:** Replace all `'DM Mono, monospace'` with `'var(--font-mono)'` across page.tsx. Mechanical find-replace.

---

## Low (nice-to-have, defer if time-constrained)

### V-16 · No page-level loading state
**Problem:** On cold load, cards render skeleton → data → final. Each card loads independently, causing a "popcorn" effect where cards pop in at different times. No coordinated loading state.
**Fix:** Consider a minimal page-level loading indicator (thin progress bar at top, or coordinated skeleton → reveal). Low priority — individual card skeletons work OK.

### V-17 · Keyboard shortcuts not discoverable
**Location:** Footer shows "R revenue · S signals · B build · M market · I intel · C contact"
**Problem:** Good shortcuts, bad discoverability. Nobody reads the footer on first visit. Consider a `?` key that shows a shortcuts overlay.
**Fix:** Very low priority. Skip unless specifically requested.

### V-18 · Light mode parity untested
**Problem:** All audit done in dark mode. Light mode likely has contrast/spacing issues that don't manifest in dark. The `--cable-particle` fix (Phase 2B-1) addressed one; there may be more.
**Fix:** Repeat this audit in light mode after Phase 4A ships. Flag as a follow-up pass.

---

## Summary for Phase 4A prompt

**Must-do (investor-visible):**
- V-01: Retire Model Risk + Data Confidence (Phase 3E, separate session)
- V-02: Fix 63 rgba violations (mechanical, bundle into 4A)
- V-03: Structural drivers rebuild (Phase 3B, separate session)
- V-04: Scroll-triggered entrance animations
- V-05: Font system audit — Unbounded for numbers, Cormorant for narrative
- V-06: Warm color redistribution (amber accent spread)
- V-07: Section spacing rhythm fix
- V-08: Hero right-column micro-dashboard grouping

**Should-do (in 4A if time permits):**
- V-10: Number count-up animations
- V-11: Remove "THIS WEEK'S MARKET MOVERS" subsection
- V-12: Filter pill active-state styling
- V-15: DM Mono → var(--font-mono) token cleanup

**Defer:**
- V-09: Tile height consistency (resolved by Phase 3B)
- V-13: Contact section credential polish
- V-14: Footer enhancement
- V-16: Coordinated loading state
- V-17: Keyboard shortcuts overlay
- V-18: Light mode parity audit
