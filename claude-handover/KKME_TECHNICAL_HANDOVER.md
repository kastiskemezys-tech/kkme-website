# KKME.eu — Handover for Design Implementation Session
### March 11, 2026

---

## How to Use This Document

This is a complete handover for implementing design and branding changes on kkme.eu. Upload this file into a new Opus chat alongside:
1. Your comments document (organized by component)
2. Any branding assets / screenshots from your wife
3. Screenshots of the current site with annotations

The Opus chat will plan changes and write Claude Code prompts. Then paste those prompts into Claude Code for execution.

---

## What KKME Is

A live market intelligence console for Baltic battery storage (BESS) investment. Single-page Next.js app that shows 9 market signals, a configurable Revenue Engine, a fleet tracker, and a deal submission form. All data updates every 4 hours from official European energy sources.

**The site answers:** Is a Baltic BESS project investable right now?

**Audiences:** Investors (fund screening) → Developers (go/no-go) → BESS operators (revenue monitoring) → Aggregators (portfolio opportunity)

**Conversion funnel:** Land → Understand (Revenue Engine) → Explore (signals) → Evaluate (adjust scenarios) → Act (submit teaser)

**URL:** https://kkme.eu
**Worker:** https://kkme-fetch-s1.kastis-kemezys.workers.dev

---

## Current Page Structure

The page flows top-to-bottom as follows:

### 1. HERO (centered)
- KKME wordmark (Unbounded, weight 300, ~2rem)
- "Baltic battery market signals and project returns"
- Description with data sources
- [Submit a Project] [View Signals ↓] CTAs

### 2. MARKET SNAPSHOT (5-column strip, replaced old StatusStrip)
- Pulsing green dot + "MARKET STATE: BUILDABLE"
- 5 cells: BESS CAPTURE (210 €/MWh) · S/D RATIO (0.65×) · aFRR PRICE (35 €/MW/h) · GRID FREE (3.0 GW) · FLEET OP (375 MW)
- Narrative line: "Market transitioning — Ignitis 291 MW arriving 2027, window closing."
- Next update countdown

### 3. BRIDGE TEXT (centered paragraph)
- "Nine signals track whether a Baltic battery project works..."

### 4. REVENUE ENGINE (section-elevated background)
- Section: "BALTIC PROJECT RETURNS"
- CH benchmark anchor: 16.6% IRR (2H)
- Copy Link + LinkedIn Share buttons
- Selectors: [2H] [4H] + MW/MWh inputs · [€120] [€164] [€262] · [none] [10%] [30%] · [2027] [2028] [2029]
- Dual IRR: Project 27.6% · Equity 53.2% (teal/amber/rose thresholds)
- Delta vs benchmark: +11.0pp
- DSCR bar: 3.12× Bankable (1.20× threshold)
- Revenue table: Capacity/Activation/Arbitrage/RTM/Gross/OPEX/EBITDA/NET per MW
- COD sensitivity bars: 2027→2029 with S/D and phase
- EU Market Ranking: LT (live) vs IE/GB/IT/DE/BE (CH ref)
- Inline CTA: "Have a Baltic battery project? Send it for review ↗"

### 5. REVENUE DRIVERS (2-column grid, Tier 1)
- **S1 — Baltic Price Separation:** LT-SE4 spread hero + BESS capture (210 €/MWh) + 29-day sparkline + sub-metrics + Explain/Data toggle
- **S2 — Balancing Stack:** S/D ratio 0.65× COMPRESS + threshold proximity + trajectory bars (2026-2031) + fleet list (8 entries) + aFRR/mFRR prices with CH targets

### 6. BUILD CONDITIONS (2-column grid, Tier 2)
- **S3 — BESS Cost Stack:** Li carbonate (shimmer skeleton, no feed) + CAPEX waterfall + Euribor/HICP/Real rate pills
- **S4 — Grid Connection Scarcity:** 3020 MW free hero + capacity bar + policy flag (€50→€25/kW) + dev/gen permits circles

### 7. BALTIC POWER MARKET (5-card auto-fill grid, Tier 3)
- **S6 — Nordic Hydro:** 42.4% fill, deviation from median
- **S7 — TTF Gas:** 53.4 €/MWh ELEVATED, threshold bar
- **S8 — Interconnector Flows:** Baltic SVG map, NordBalt/LitPol direction + MW
- **S9 — EU ETS Carbon:** 70.6 €/t, BESS breakeven note
- **S5 — DC Power Viability:** OPEN, grid headroom, Litgrid map link

### 8. MARKET INTEL (compact horizontal rows)
- Filter pills: ALL · BESS · DC · HYDROGEN · GRID · TECHNOLOGY
- Rows: DATE | CATEGORY | HEADLINE | SOURCE (~10 items)

### 9. DEAL FLOW (2-column grid)
- LEFT: "Baltic BESS Deal Flow" heading + about text + contact links
- RIGHT: Form — Project name, MW/MWh, Location, Target COD, Stage, Email + Submit Teaser

### 10. FOOTER
- KKME · Baltic BESS Market Signals
- Contact info + LinkedIn
- Data sources list

### PERSISTENT ELEMENTS
- **Sticky Nav:** KKME + Signals/Build/Intel/Contact + [Submit Project] CTA
- **Signal Bar** (below sticky nav): 5 live metrics
- **Scroll progress bar:** 2px teal line at top

---

## Tech Stack

- **Frontend:** Next.js 16 App Router + TypeScript
- **Styling:** Tailwind CSS + CSS custom properties (globals.css :root) + inline styles (mixed — match file pattern)
- **Viz:** D3.js for sparklines, Recharts available
- **Hosting:** Cloudflare Pages (auto-deploy from main)
- **Data:** Cloudflare Worker (cron every 4h) → KV store → client fetch
- **Fonts:** Unbounded (hero numbers), DM Mono (data/labels), Cormorant Garamond (narrative)

---

## Current Design Tokens (globals.css :root)

```css
--bg-page: #07070a
--text-primary: rgba(232,226,217,0.88)
--text-secondary: rgba(232,226,217,0.65)
--text-tertiary: rgba(232,226,217,0.45)    /* needs bump to 0.55 */
--text-muted: rgba(232,226,217,0.30)       /* needs bump to 0.38 */
--text-ghost: rgba(232,226,217,0.15)
--teal: rgb(0,180,160)       /* positive / SCARCITY / bankable */
--amber: rgb(212,160,60)     /* caution / COMPRESS / pending */
--rose: rgb(214,88,88)       /* negative / MATURE / fail */
--bg-elevated: rgba(232,226,217,0.04)
--border-card: rgba(232,226,217,0.10)
--border-highlight: rgba(232,226,217,0.20)
```

---

## File Map

```
~/kkme/app/
  page.tsx                    — page layout, all sections
  globals.css                 — design tokens, grid classes, responsive
  components/
    StickyNav.tsx             — fixed nav + signal bar
    SignalBar.tsx              — persistent 5-metric strip
    MarketSnapshot.tsx         — 5-col KPI row (replaced StatusStrip)
    RevenueCard.tsx            — self-fetching Revenue Engine (no props)
    S1Card.tsx                 — Baltic Price Separation
    S2Card.tsx                 — Balancing Stack + Fleet Tracker
    S3Card.tsx                 — BESS Cost Stack
    S4Card.tsx                 — Grid Connection Scarcity
    S5Card.tsx                 — DC Power Viability
    S6Card.tsx                 — Nordic Hydro
    S7Card.tsx                 — TTF Gas
    S8Card.tsx                 — Interconnector Flows
    S9Card.tsx                 — EU ETS Carbon
    IntelFeed.tsx              — Telegram news feed
  lib/
    useSignal.ts              — shared fetch hook with cache

~/kkme/workers/
  fetch-s1.js                — Cloudflare Worker (~2600 lines, DO NOT cat entire file)

~/kkme/app/globals.css        — layout classes: .page-container, .section,
                                .section-elevated, .section-header,
                                .grid-2, .grid-4, .card, .card-tier1,
                                .card-tier3, .card-split, .feed-row,
                                .inline-cta, .market-snapshot
```

---

## Worker Endpoints (for reference, not for editing)

**GET:** /s1 /s2 /s3 /s4 /s5 /s6 /s7 /s8 /s9 /read /health /revenue /api/model-inputs /s2/fleet
**Revenue params:** ?mw=50&mwh=100&capex=mid&grant=none&cod=2028

---

## Known Design Issues (as of March 11)

### Readability
- Font size floor at 11px (0.6875rem) is too small — needs bump to 13px (0.8125rem)
- Text opacity too low on dark bg — tertiary needs 0.55, muted needs 0.38
- Revenue table and fleet list entries are hard to scan

### Layout
- Hero still centered while grid content is left-aligned — two layout systems compete
- Market Context 5-card grid: S5 and S8 overflow/cramped at narrow card width
- Some cards still have residual gradient/glow effects (sci-fi feel vs financial tool)
- Nested borders on Revenue Engine create Russian doll effect

### Content
- S3 shows shimmer skeleton for Li carbonate with no actual number (looks broken)
- HTML entities still partially visible in Intel Feed (&#8211;)
- Some AI-generated copy patterns remain ("evaluation", symmetric phrasing)

### Features not yet shipped
- URL-persisted Revenue Engine state (bookmarkable, shareable)
- Copy link + comparison flash on selector change
- Expandable fleet entries (click to reveal MWh, TSO, source)
- Keyboard navigation shortcuts
- Light/dark mode toggle
- Since last visit delta (localStorage)

---

## Revenue Engine Model (v5)

20-year DCF with parameterized inputs. Key assumptions:
- **Capacity prices:** FCR €45, aFRR €40, mFRR €22 /MW/h (Baltic-calibrated)
- **MW allocation:** 16% FCR, 34% aFRR, 50% mFRR (proportional to MW)
- **Arbitrage:** P_high €120, P_low €55, RTE 0.87
- **OPEX:** €39k/MW/yr, escalating 2.5%
- **Financing:** 55% debt, 4.5%, 8yr tenor, 1yr grace
- **Tax:** 17% Lithuanian CIT
- **S/D demand:** 1190 MW effective (1700 × 0.70)
- **CPI floor:** 0.40 (MATURE phase)
- **Expected outputs:** ~19% project IRR, ~29% equity IRR, ~2.0× DSCR

---

## Fleet Tracker

8 manually seeded entries. S/D ratio = weighted supply / 1190 MW effective demand.

| Project | MW | Status | COD | Country |
|---------|-----|--------|-----|---------|
| E energija | 130 | operational | 2025 | LT |
| Kruonis PSP | 205 | operational | 2024 | LT |
| AST BESS | 40 | operational | 2024 | LV |
| Ignitis Kelmė | 100 | under_construction | 2027-H1 | LT |
| Ignitis Mažeikiai | 100 | under_construction | 2027-H1 | LT |
| Ignitis Kruonis | 91 | under_construction | 2027-H2 | LT |
| EPMA consortium | 200 | connection_agreement | 2028 | LT |
| Diverxia Visaginas | 50 | application | 2028 | LT |

**Status weights:** operational 1.0, commissioned 1.0, under_construction 0.9, connection_agreement 0.6, application 0.3, announced 0.1

**Future:** 145+ projects available from Hetzner scraper system (Litgrid 137, Elering 32, VERT 23) — not yet connected.

---

## Build/Deploy Pattern for Claude Code

Every session should end with:
```bash
cd ~/kkme
npx tsc --noEmit        # TypeScript check
npm run build            # Next.js build
npx wrangler deploy      # Worker deploy (if worker changed)
git add -A && git commit -m "description" && git push
```

**Worker rule:** NEVER cat the full worker file (~2600 lines). Use grep for line ranges:
```bash
grep -n "function\|pathname.*===" workers/fetch-s1.js | head -50
```

**Card editing:** Each card is a self-contained component. Edit one at a time, build, verify.

---

## Session Rules for Claude Code

1. Read CLAUDE.md first (it's the source of truth on the server)
2. Use var(--token-name) for all colours, never raw rgba()
3. RevenueCard: self-fetching, no props from page.tsx
4. Don't duplicate: S4 policy flag ✓, S5 Litgrid map ✓, S5 RSS removed ✓
5. MODEL INPUT footers on every card
6. Update TypeScript interfaces when adding worker response fields
7. Follow card anatomy: hero → sub-metrics → viz → explain → sources → footer
8. Voice: terse, precise, numbers first, no adjectives
9. Minimum font: 0.8125rem (13px) for readable text, 0.6875rem only for ghost/terminal labels
