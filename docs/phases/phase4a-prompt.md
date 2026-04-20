# Phase 4A — Visual Overhaul: Animations, Typography, Color, Rhythm

Self-contained Claude Code prompt. YOLO mode. Expected duration: 3–4 hours.

**Context:** After Phases 3A–3E + 4B, the site has strong data and feed quality. Visual presentation is now the gap. A comprehensive audit (docs/phases/visual-audit-2026-04-16.md) catalogued 18 issues. This phase addresses the "must-do" and "should-do" items that don't require new data endpoints — pure frontend polish.

**Prerequisite:** Phase 3B (structural drivers rebuild) should be merged first. This phase assumes the new tile layout is in place. If 3B isn't merged yet, skip V-09 (tile height consistency) and work around the tile components as they are.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. Read `docs/phases/visual-audit-2026-04-16.md` — the full issue list
4. `git status && git log --oneline -10` — understand what's merged
5. `git checkout main && git pull origin main && git checkout -b phase-4a-visual-overhaul`

Proceed — YOLO.

---

## Scope: 10 items from the visual audit

### Must-do (investor-visible)

| ID | Issue | Effort |
|----|-------|--------|
| V-02 | 137 inline rgba() + hex violations | Medium (mechanical) |
| V-04 | Zero scroll-triggered animations | Medium (new component) |
| V-05 | Three-font system underused | Medium (audit + swap) |
| V-06 | Color temperature mono-cool | Small (redistribute amber) |
| V-07 | Section spacing metronomic | Small (CSS adjustments) |
| V-08 | Hero right-column text stack | Medium (layout rework) |

### Should-do (in this session if time permits)

| ID | Issue | Effort |
|----|-------|--------|
| V-10 | No number count-up animations | Small (hook + IntersectionObserver) |
| V-11 | "THIS WEEK'S MARKET MOVERS" subsection | Small (remove/merge) |
| V-12 | Filter pill active-state styling | Small (CSS) |
| V-15 | DM Mono → var(--font-mono) token cleanup | Small (find-replace) |

### Explicitly deferred (do NOT touch)

V-01 (done in 3E), V-03/V-09 (done in 3B), V-13 (contact polish), V-14 (footer), V-16 (loading state), V-17 (keyboard overlay), V-18 (light mode audit).

---

## V-02: Token cleanup — rgba() and hex violations

**Scope:** 137 rgba() calls across ~15 files, plus hardcoded hex values. The design system (ADR-005) requires `var(--token)` only.

**Approach:** Work file by file. For each rgba value, find the closest existing token in globals.css. If no token exists at the right opacity, create one.

**Priority files (highest violation count):**

| File | rgba count | Notes |
|------|-----------|-------|
| `app/lib/chartTheme.ts` | 18 | Chart colors — may need new chart-specific tokens |
| `app/dev/map-calibrate/page.tsx` | 18 | Dev tool — lower priority, still fix |
| `app/components/BalticMap.tsx` | 18 | Map rendering — SVG fill/stroke colors |
| `app/components/S5Card.tsx` | 7 | Signal card |
| `app/components/RevenueCard.tsx` | 7 | Revenue engine |
| `app/components/HeroBalticMap.tsx` | 7 | Hero section |
| `app/components/S3Card.tsx` | 5 | Signal card |
| `app/components/StaleBanner.tsx` | 4 | Stale data indicator |
| `app/components/s8-utils.ts` | 4 | Interconnector utilities |
| `app/components/s3-utils.ts` | 4 | Build signal utilities |

**Existing token palette in globals.css (use these first):**

Text scale: `--text-primary` (0.92), `--text-secondary` (0.65), `--text-tertiary` (0.55), `--text-muted` (0.45), `--text-faint` (0.22), `--text-ghost` (0.15)

Backgrounds: `--bg-card` (0.025), `--bg-card-highlight` (0.05), `--bg-elevated` (0.04)

Signals: `--signal-positive`, `--signal-warning`, `--signal-negative`, `--signal-neutral`

Accents: `--teal-strong` (0.75), `--teal-medium` (0.65), `--teal-subtle` (0.30), `--amber-strong` (0.75), `--rose-strong` (0.75)

**New tokens to add (if gaps found):**

Common unmapped values from the audit:
- `rgba(232,226,217,0.3)` → add `--text-light: rgba(232,226,217,0.30)` (between ghost and muted)
- `rgba(74,124,89,0.9)` → map to `--signal-positive` or add `--green-strong`
- `rgba(0,180,160,0.12)` → map to `--teal-bg` or `--bg-teal-subtle`

Add new tokens in **both** `:root` (light) and `[data-theme="dark"]` (dark) blocks in globals.css.

**Chart theme special case:** `app/lib/chartTheme.ts` likely uses rgba for chart line/fill colors that need transparency. Create chart-specific tokens: `--chart-line-primary`, `--chart-fill-primary`, `--chart-line-secondary`, `--chart-fill-secondary`, etc. These can reference the accent colors with specific opacities.

**Process per file:**
1. Read the file
2. List all rgba/hex values
3. Map each to an existing token or note the gap
4. Create missing tokens in globals.css
5. Replace all rgba/hex with `var(--token-name)`
6. Verify the component still renders correctly

---

## V-04: Scroll-triggered entrance animations

**Current state:** `CardEntrance.tsx` exists but is a stub (returns null). Comment says "Card entrance now uses CSS @keyframes (see globals.css .card-entrance)" but no `.card-entrance` class is applied to any element. Zero IntersectionObserver usage in the app.

**Implementation:**

### New hook: `app/hooks/useScrollReveal.ts`

```ts
import { useEffect, useRef, useState } from 'react';

export function useScrollReveal(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.unobserve(el); } },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px', ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
```

### CSS in globals.css

```css
.scroll-reveal {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}
.scroll-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Application pattern

Wrap each major section and each card in a scroll-reveal div. Two approaches (pick the simpler one):

**Option A — wrapper component:**
```tsx
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div ref={ref} className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
         style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
```

**Option B — CSS-only with staggered delays:**
Apply `.scroll-reveal` class directly to section divs and card wrappers in page.tsx. Use the hook in page.tsx to toggle `.visible`. Stagger cards within a grid by adding `transition-delay: calc(var(--i) * 80ms)` where `--i` is the card's index.

**Where to apply:**
- Each `.section` wrapper in page.tsx (the H2 headings + content blocks)
- Each card in the tier3-grid (staggered: 0ms, 80ms, 160ms for row 1; 240ms, 320ms, 400ms for row 2)
- Revenue Engine card
- Trading Engine card  
- Intel Feed section
- Contact section

**Keep it subtle:** 400ms duration, 8px translateY, ease-out. No parallax, no bounce, no scale transforms. The goal is "cards gently appear as you scroll" not "things fly in from the sides."

**Remove the CardEntrance stub:** Delete the import and render of `<CardEntrance />` from page.tsx. The file can stay for reference.

---

## V-05: Three-font system redistribution

**Current usage (from audit):**
- DM Mono: 1536 elements (overused — used for everything)
- Cormorant Garamond: 411 elements (mostly inherited, barely visible)
- Unbounded: 31 elements (only KKME logo + section H2s)

**Target distribution per ADR-005:**
- **Unbounded** (`var(--font-display)`): Hero numbers, section H2 headings, card hero metrics (the big numbers like €504, 14.7%, 822 MW)
- **Cormorant Garamond** (`var(--font-serif)`): Section description paragraphs, editorial copy, intel feed pull-quotes (already done in 3C), contact section heading (already done)
- **DM Mono** (`var(--font-mono)`): Data labels, UI elements, timestamps, chip text, table data, interpretation lines

**Specific changes:**

1. **Card hero metrics → Unbounded.** In every S-series card (S1Card through S9Card, RevenueCard, TradingEngineCard, and new Phase 3B cards), the main number should use `fontFamily: 'var(--font-display)'`. Grep for the hero metric render pattern in each card and swap the font.

2. **Section description paragraphs → Cormorant.** Below each H2 section heading in page.tsx, there's typically a 1-2 line description. These are currently DM Mono. Change to `fontFamily: 'var(--font-serif)'`. Targets:
   - Revenue signals section intro
   - Build conditions section intro
   - Structural drivers section intro
   - Revenue engine section intro
   - Trading section intro
   - Market intelligence section intro

3. **Revenue Engine narrative text → Cormorant.** TradingEngineCard and RevenueCard have explanatory paragraphs and model disclaimers. These should be Cormorant, not DM Mono.

4. **Keep DM Mono for:** All data labels, axis labels, chip text, timestamps, interpretation one-liners, table cell data, source attributions, filter pills.

**Verification:** After changes, visually scan the page. Unbounded should appear on ~50-80 elements (hero numbers + metrics), Cormorant on ~200+ (all narrative text), DM Mono stays dominant for data/UI but not monopolistic.

---

## V-06: Color temperature — warm accent redistribution

**Problem:** Below the hero, the page is teal/cream/charcoal with no warm accent. The amber `--cable-particle` only appears in the hero animation.

**Fix:** Redistribute existing `--amber` token to create warmth touchpoints. Don't redesign the palette — just use what exists more deliberately.

**Where to add amber:**

1. **Section heading accent marks.** Add a small amber underline or left-border to section H2s. CSS:
   ```css
   .section h2::after {
     content: '';
     display: block;
     width: 40px;
     height: 2px;
     background: var(--amber-strong);
     margin-top: 8px;
   }
   ```

2. **Featured intel item highlight.** The featured item in IntelFeed already has a "FEATURED" micro-heading. Add `color: var(--amber-strong)` to it.

3. **CTA / interactive hover states.** "View all intelligence →" button, contact form submit button, and any "View all" or action-oriented text should get `color: var(--amber-strong)` on hover (currently teal).

4. **Card signal dots for "watch" state.** If any signal dot is in a "watch" or "elevated" state, use amber instead of the default muted color.

5. **Stacked bar warm segment.** In the new RenewableMixCard (Phase 3B), the solar segment should be amber. If 3B isn't merged, add a note for when it lands.

**Don't overdo it.** Amber should appear 8-12 times on the page — enough to break the cool monotony, not enough to become the dominant accent. Teal remains the primary interactive color.

---

## V-07: Section spacing rhythm

**Problem:** Every section is ~1200px tall regardless of content density. No breathing room between major shifts.

**Fix:**

1. **Let content drive height.** Remove any fixed min-height or padding-bottom on sections that forces uniform sizing. Check page.tsx and globals.css for `.section` padding rules.

2. **Add section separators.** Between each major section, add a subtle horizontal rule:
   ```css
   .section-divider {
     border: none;
     border-top: 1px solid var(--border-subtle);
     margin: 4rem auto;
     max-width: 120px;
     opacity: 0.4;
   }
   ```
   Place `<hr className="section-divider" />` between sections in page.tsx. Not between every single card — between major content zones (Revenue Signals → Build Conditions → Structural Drivers → Revenue Engine → Trading → Intel → Contact).

3. **Extra breathing room around Revenue Engine.** This is the centerpiece. Add `padding: 5rem 0` (vs the standard `3rem 0` or whatever the current section padding is) to give it more visual weight.

4. **Compact the contact section.** After retiring Model Risk + Data Confidence (Phase 3E), the contact section is the last thing on the page. It doesn't need a 1200px zone. Let it be naturally sized.

---

## V-08: Hero right-column micro-dashboard grouping

**Location:** `app/components/HeroBalticMap.tsx` — the right sidebar with revenue/fleet/S-D numbers.

**Problem:** €504/MW/DAY, capture trend, fleet breakdown, 822 MW, S/D, CPI are vertically stacked plain text with no grouping.

**Fix:** Group into 3 distinct visual blocks with subtle card-like containers:

**Block 1 — Revenue headline (top)**
- €504/MW/DAY (Unbounded, large)
- Capture trend sparkline (make it bigger — this is the most valuable chart)
- "14.7% gross IRR" subtitle

**Block 2 — Fleet composition (middle)**
- 822 MW total fleet (Unbounded)
- Stacked bar: installed / reserved / pipeline (thin horizontal bar)
- Small labels per segment

**Block 3 — Key ratios (bottom row)**
- S/D ratio, CPI, Mature % — arranged as a 3-column micro-grid
- Each in a small bordered cell

**Styling per block:**
```css
.hero-stat-block {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
```

Read HeroBalticMap.tsx first to understand the current layout structure, then restructure. Keep the same data — just group it visually.

---

## V-10: Number count-up animations (should-do)

**New hook: `app/hooks/useCountUp.ts`**

```ts
import { useEffect, useState } from 'react';

export function useCountUp(target: number, duration = 600, trigger = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) { setValue(target); return; }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, trigger]);
  return value;
}
```

**Usage:** Combine with `useScrollReveal` — trigger count-up when the card enters viewport. Apply to:
- Hero revenue number (€504)
- IRR percentage (14.7%)
- Fleet MW (822)
- CFADS if visible
- Card hero metrics in the structural drivers section

**For decimal numbers** (14.7%), track with 10× precision: count to 147, display as `(value / 10).toFixed(1)`.

---

## V-11: Remove "THIS WEEK'S MARKET MOVERS" (should-do)

In `app/components/IntelFeed.tsx`, find and remove the "THIS WEEK'S MARKET MOVERS" sub-section. After Phase 4B's 8-item cap, the hierarchy is: featured (1) + standard list (7) + "View all" expander. A third layer ("market movers") is redundant.

If items tagged as "market movers" have a special flag, ignore the flag — let them sort naturally by BESS relevance score.

---

## V-12: Filter pill active-state styling (should-do)

In `app/components/IntelFeed.tsx`, the filter chips ("All / Competition 4 / Market Design 16 / ...") need:

1. **Active state:** Fill the chip background with `var(--teal-subtle)` when selected, not just a border change.
2. **Hover state:** Subtle background shift to `var(--bg-card-highlight)`.
3. **Count styling:** The number in parentheses gets `opacity: 0.6` to visually separate from the label.
4. **Micro-animation:** On filter change, the list items fade-replace with a 150ms opacity transition (CSS `transition: opacity 150ms ease`).

---

## V-15: Font-family token cleanup (should-do)

**56 hardcoded `'DM Mono'` strings:**
- `TradingEngineCard.tsx`: 28 instances
- `RevenueCard.tsx`: 27 instances
- `chartTheme.ts`: 1 instance

Replace all `fontFamily: "'DM Mono',monospace"` and `fontFamily: "'DM Mono', monospace"` variants with `fontFamily: 'var(--font-mono)'`.

Also check for any `'Unbounded'` or `'Cormorant Garamond'` hardcoded strings and replace with `var(--font-display)` / `var(--font-serif)`.

This is mechanical find-replace. Do it early in the session so subsequent font redistribution (V-05) uses tokens from the start.

---

## Execution order

1. **V-15** first (font token cleanup) — mechanical, makes subsequent work cleaner
2. **V-02** (rgba/hex token cleanup) — mechanical, largest scope
3. **V-04** (scroll animations) — new hook + CSS + page.tsx wiring
4. **V-05** (font redistribution) — requires reading each component
5. **V-06** (amber warmth) — small CSS additions
6. **V-07** (section spacing) — CSS + page.tsx dividers
7. **V-08** (hero sidebar grouping) — HeroBalticMap.tsx restructure
8. **V-10** (count-up) — new hook + wiring to hero metrics
9. **V-11** (market movers removal) — IntelFeed.tsx edit
10. **V-12** (filter pill styling) — IntelFeed.tsx CSS

If running long (>3 hours), cut V-10/V-11/V-12 and log them as Phase 4A-follow-up.

---

## Verification

### Build
- `npx tsc --noEmit` — clean
- `npm run build` — clean
- Bundle size: note any increase from new hooks/CSS. Should be negligible (<5KB).

### Visual (scroll the full page in npm run dev)
- **Scroll animations:** Cards and sections fade-up as they enter viewport. No jarring pops. Staggered timing within grids.
- **Font distribution:** Hero numbers are Unbounded (visually larger/bolder), section intros are Cormorant (serif), data is DM Mono. The page should feel like it has typographic variety, not a monospace wall.
- **Color warmth:** Amber appears on section heading accents, featured item label, hover states. The page feels warmer without losing the technical identity.
- **Section rhythm:** Sections have varying heights based on content. Dividers between major zones. Revenue Engine has more breathing room. No metronomic repetition.
- **Hero sidebar:** Three distinct stat blocks with subtle card backgrounds. Revenue headline prominent at top, fleet bar in middle, ratios in a row at bottom.
- **Count-up:** Hero numbers animate from 0 to target on first scroll (if implemented).
- **No rgba/hex in source:** `grep -r "rgba\|#[0-9a-f]" app/components/ app/lib/ --include="*.tsx" --include="*.ts"` returns zero results (excluding comments and dev/ folder).

### Regression
- All cards still render correct data
- Intel feed unchanged (except V-11/V-12 if done)
- No layout breaks in any section
- Dark mode: all new tokens have dark values
- Light mode: spot-check that nothing breaks (full light audit is V-18, deferred)
- StickyNav scroll-to still works for all sections
- Keyboard shortcuts still work

---

## Commit + push

Single commit: `phase4a: visual overhaul — scroll animations, font redistribution, color warmth, section rhythm, hero grouping, token cleanup`

Branch: `phase-4a-visual-overhaul`
Push. Report compare URL. Don't run `gh pr create`.

---

## What NOT to do

- Don't change data logic in any card — this is purely visual
- Don't modify worker endpoints
- Don't touch IntelFeed data normalization or scoring
- Don't add npm packages (IntersectionObserver is native, requestAnimationFrame is native)
- Don't redesign the color palette — redistribute existing tokens
- Don't add parallax, bounce, or dramatic animations — subtle only
- Don't change the page section order
- Don't touch the contact form logic
- Don't attempt light mode parity (V-18 is a separate follow-up)
- Don't add stock imagery or decorative SVGs

---

## End-of-session report

Include:
- Files changed + one-line summary each
- rgba violations before → after count
- Font token hardcodes before → after count
- New CSS tokens added to globals.css (list them)
- Scroll animation: working / partial / deferred
- Count-up animation: working / deferred
- Items completed vs deferred to 4A-follow-up
- Proposed handover.md session log entry

---

## Reference

- Visual audit: `docs/phases/visual-audit-2026-04-16.md`
- Design system ADR: `docs/principles/decisions.md` (ADR-005)
- globals.css tokens: `app/globals.css`
- Hero sidebar: `app/components/HeroBalticMap.tsx`
- Revenue cards: `app/components/RevenueCard.tsx`, `app/components/TradingEngineCard.tsx`
- Intel feed: `app/components/IntelFeed.tsx`
- Chart theme: `app/lib/chartTheme.ts`
- Page layout: `app/page.tsx`
