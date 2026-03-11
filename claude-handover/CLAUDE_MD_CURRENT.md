## What this is
Live market intelligence console for Baltic BESS investment.
9 signals + Revenue Engine + Fleet Tracker + Intel Feed → Deal flow.
Built by Kastis Kemežys. kkme.eu.

The site answers one question: **Is a Baltic BESS project investable right now?**
S/D ratio determines the market phase. Revenue Engine computes returns.
Signal cards provide the evidence. Deal flow captures the opportunity.

## Who it's for (in priority order)
1. **Investors** — fund/LP screening Baltic BESS. Need: S/D ratio, IRR scenarios, DSCR, COD timing.
2. **Developers** — go/no-go on a project. Need: grid capacity, CAPEX benchmarks, revenue model, fleet competition.
3. **BESS owners** — monitoring revenue trends. Need: aFRR/mFRR prices, compression trajectory, arbitrage capture.
4. **Aggregators/Optimizers** — portfolio opportunity. Need: fleet pipeline, market structure, node-level grid data.
5. **Analysts/AI** — research and citation. Need: crawlable data, methodology, structured markup.

## Conversion funnel (do not break this flow)
Land (hero) → Understand (Revenue Engine with CH benchmark) → Explore (signal cards) → Evaluate (adjust scenarios) → Act (submit teaser)
Revenue Engine is ABOVE signals because conclusion comes before evidence.

## Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS + CSS custom properties (design tokens in globals.css :root)
- D3.js for data viz, Lenis for scroll, anime.js for state-change animations only
- Cloudflare Pages (hosting) + Workers (data) + KV (storage)
- Mixed styling: Tailwind utilities + inline styles. When editing, match the pattern of the file you're in.

## Design tokens (globals.css :root — always use var() references)
```
--bg-page: #07070a
--text-primary: rgba(232,226,217,0.88)    ← headings, hero numbers, bold values
--text-secondary: rgba(232,226,217,0.65)  ← body text, table values
--text-tertiary: rgba(232,226,217,0.45)   ← labels, section headers, descriptions
--text-muted: rgba(232,226,217,0.30)      ← footnotes, timestamps, source citations
--text-ghost: rgba(232,226,217,0.15)      ← MODEL INPUT footers, decorative only
--teal: rgb(0,180,160)       ← positive: SCARCITY phase, bankable, IRR above target, active signals
--amber: rgb(212,160,60)     ← caution: COMPRESS phase, marginal DSCR, pending regulatory, warnings
--rose: rgb(214,88,88)       ← negative: MATURE phase, not bankable, IRR below hurdle, failures
--bg-elevated: rgba(232,226,217,0.04)
--border-card: rgba(232,226,217,0.10)
--border-highlight: rgba(232,226,217,0.20)  ← Tier 1 card borders
--font-xs: 0.6875rem (11px)  ← absolute minimum for any readable text
--font-sm: 0.8125rem (13px)
--font-base: 1rem (16px)
```

## Design principles (binding — do not violate)
- Function is the aesthetic. No decoration. Every pixel communicates data or enables action.
- Animation ONLY on state changes. No looping animations except the LIVE pulse dot.
- Minimum contrast: 0.45 opacity for readable text. 0.15 only for ghost/decorative (MODEL INPUT footers).
- Minimum font size: 0.6875rem (11px). No exceptions for text users need to read.
- **Typography rules:** Unbounded = hero numbers and section headings only. DM Mono = data, labels, UI, footers, everything else. Cormorant Garamond = narrative paragraphs (Explain panels, About section, "For Investors").
- **Three-tier card system:** Tier 1 (S1+S2) = border: --border-highlight. Tier 2 (S3+S4) = border: --border-card. Tier 3 (S5-S9) = dimmed, compact padding.
- **Spacing:** Cards have 24px internal padding. Sections have 48px vertical gap. Sub-elements within cards use 8-16px gaps.
- **Voice:** Terse. Precise. Numbers before words. Sources always cited. No adjectives. No hype. Write like a Bloomberg terminal, not a pitch deck.
- Dark terminal aesthetic: warm off-white on near-black. Understated precision.

## Signal card anatomy (follow for every card)
Every signal card component follows this structure top-to-bottom:
1. **Hero metric** — the primary number, largest font (Unbounded)
2. **Sub-metrics** — supporting data points (DM Mono, smaller)
3. **Visualisation** — chart, bar, sparkline, or map
4. **Explain/Data content** — interpretive text or raw data table
5. **Source links** — external references (teal, 0.6875rem, ↗ prefix)
6. **MODEL INPUT footer** — "MODEL INPUT → {what this signal feeds}" (ghost text, 0.6875rem)

## Content rules (from investor review — binding)
- Revenue Engine: CH benchmark (16.6% IRR) is the FIRST number investors see. Live data is deviation from benchmark, not the hero.
- Three scenarios: Conservative (CH low) / Base (CH central, DEFAULT) / Upside (live signals). Base is always the default view.
- Stacking disclosure always visible: "Realised revenue typically 65–80% of theoretical max..."
- Proxy flag: all capacity prices show "proxy ⚠" until BTD measured data uploaded.
- DSCR threshold: 1.20× = bankability floor. Red below, green above.
- IRR colours: Project >12% teal, 8-12% amber, <8% rose. Equity >15% / >10% / <10%.
- DC news feed was REMOVED from S5. Never re-add.
- COD sensitivity is the #1 insight: 2027 COD ≈ investable, 2028 COD ≈ fails. Always visible on Revenue Engine.

## Key model assumptions (for Revenue Engine)
These are the defaults. Changing any requires updating computeRevenue() in the worker.
```
MW allocation: scales proportionally (16% FCR, 34% aFRR, 50% mFRR of grid cap)
Capacity prices: FCR €45, aFRR €40, mFRR €22 /MW/h (Baltic-calibrated, ⚠ PROXY until BTD)
  Source: AST Latvia Sept 2025 — Baltic FCR ~2× Finland, aFRR ~10× Finland, mFRR ~4× Finland.
  These represent S/D = 1.0 (balanced market). CPI adjusts for actual S/D phase.
Activation: aFRR 18% rate × 0.55 depth × €40 margin, mFRR 10% × 0.75 × €55
Arbitrage: P_high €120, P_low €55, RTE 0.87, reserve drag 0.60, 0.9 cycles/day, 300 days/yr
OPEX: €39k/MW/yr Y1 (scales with MW), 2.5% escalation
CAPEX scenarios: €120/kWh competitive, €164/kWh CH S1 2025, €262/kWh turnkey EPC
Financing: 55% debt, 4.5% rate, 8yr tenor, 1yr grace
Tax: 17% Lithuanian CIT (from Jan 2026)
Augmentation: €25/kWh at year 10 (scales with MWh)
Depreciation: 10yr on gross CAPEX excl bond
WACC: 8%
Demand: 1190 MW effective (1700 MW total × 0.70 multi-product stacking, Elering Oct 2025)
S/D thresholds: <0.6 SCARCITY, 0.6-1.0 COMPRESS, >1.0 MATURE
CPI floor: 0.40 (Baltic structural reserve need ensures non-zero clearing)
```
These match BESS_Financial_Model_Visaginas_50MW__5_.xlsx (v5, corrected March 2026).
Expected outputs: Project IRR ~19%, Equity IRR ~29%, DSCR ~2.0×, Y1 Net/MW ~€177k.

## Page structure (top to bottom)
1. **Hero** — KKME wordmark + subtitle + CTA buttons (Submit Project / View Signals)
2. **StickyNav** — appears on scroll >300px. Links: Signals / Revenue / Intel / Contact
3. **StatusStrip** — 4 KPIs: S/D Ratio, BESS Capture, aFRR price, Grid Free MW
4. **Revenue Engine** (id="revenue") — the synthesis. Comes BEFORE signals.
5. **Investment Signals** (id="signals") — S1 + S2 (Tier 1)
6. **Build Signals** (id="build") — S3 + S4 (Tier 2)
7. **Market Context** (id="context") — S5 + S6 + S7 + S8 + S9 (Tier 3)
8. **Intel Feed** (id="intel") — Telegram-sourced news
9. **Deal Flow** (id="deal-flow") — About + For Investors + Methodology + Submission form

## The 9 signals

### S1 — Baltic Price Separation [Tier 1 — Investment Signal]
Source: ENTSO-E A44 (LT + SE4 + PL) · every 4h · KV: s1, s1_history
Returns: LT/SE4/PL avg, spread, history, p_high_avg, p_low_avg, intraday_capture, bess_net_capture
Card: S1Card.tsx — spread hero + BESS CAPTURE sub-metric + sparkline
Model feeds: Assumptions!D72-D73 (P_high, P_low → arbitrage revenue)

### S2 — Balancing Market + Fleet Tracker [Tier 1 — Investment Signal]
Source: BTD via Mac cron + manual fleet input + BTD CSV upload · KV: s2, s2_fleet, s2_btd
Returns: aFRR/mFRR/FCR prices, sd_ratio, phase, cpi, trajectory, fleet, prices_source
Phases: SCARCITY (S/D <0.6, CPI >1.0) · COMPRESS (0.6-1.0) · MATURE (>1.0, CPI floor 0.35)
Card: S2Card.tsx — S/D ratio hero + phase badge + trajectory bars + fleet list + price metrics
Model feeds: Assumptions!D46,D50,D54 (capacity prices) · Market Drivers!D19-D21 (S/D, CPI)

### S3 — BESS Cost Stack [Tier 2 — Build Signal]
Source: ECB API (Euribor, HICP) + static CAPEX refs · KV: s3
Card: S3Card.tsx — CAPEX waterfall + financing pills
Model feeds: Assumptions!D37 (interest rate) · Assumptions!D18 (equipment cost)

### S4 — Grid Connection Scarcity [Tier 2 — Build Signal]
Source: VERT.lt ArcGIS (Litgrid FeatureServer/8) · KV: s4, s4_pipeline
Card: S4Card.tsx — capacity bar + policy flag (€50→€25/kW, already exists)
Model feeds: Grid constraint (connection availability + cost)

### S5 — DC Power Viability [Tier 3 — Context]
Source: ENTSO-E grid (shared with S4) · KV: s5
Card: S5Card.tsx — OPEN/CLOSED + headroom bar + Litgrid map link (already exists)
NOTE: RSS feed removed. Do not re-add.

### S6 — Nordic Hydro [Tier 3 — Context]
Source: NVE biapi.nve.no (weekly) · KV: s6, s6_history

### S7 — TTF Gas [Tier 3 — Context]
Source: energy-charts.info (every 4h) · KV: s7, s7_history
Regimes: LOW (<15) · NORMAL (15-30) · ELEVATED (30-50) · HIGH (>50)
Model feeds: Market Drivers!D40 (gas marginal cost → P_high floor)

### S8 — Interconnectors [Tier 3 — Context]
Source: ENTSO-E A11 (every 4h) · KV: s8
Model feeds: Market Drivers!D35-D37 (spread drag coefficient)

### S9 — EU ETS Carbon [Tier 3 — Context]
Source: energy-charts.info (every 4h) · KV: s9, s9_history
Model feeds: Market Drivers!D41 (carbon cost → P_high floor)

### Revenue Engine [Primary synthesis]
Source: computed from s2_fleet, s2_btd, s1 KV data
Endpoint: GET /revenue?system=2h|2.4h|4h&capex=low|mid|high&grant=none|partial&cod=2027|2028|2029
Card: RevenueCard.tsx — self-fetching component, no props from page.tsx

## Worker endpoints (kkme-fetch-s1.kastis-kemezys.workers.dev)

GET: /s1 /s2 /s3 /s4 /s5 /s6 /s7 /s8 /s9 /read /health /revenue /api/model-inputs /s2/fleet
POST: /s2/fleet /s2/fleet/entry /s2/btd /s2/update /s4/pipeline /s5/manual /da_tomorrow/update /heartbeat
All POST endpoints require X-Update-Secret header or Content-Type: application/json.
jsonResp() helper handles CORS + JSON serialisation for all responses.

## KV keys
s1 · s1_history · s2 · s2_fleet · s2_btd · s3 · euribor · s4 · s4_pipeline · s5 · s6 · s6_history · s7 · s7_history · s8 · s9 · s9_history · da_tomorrow · feed_index · cron_heartbeat · digest:cache

## File map

### Worker (DO NOT cat entire file — use grep)
~/kkme/workers/fetch-s1.js (~2600 lines)
  grep -n "^function\|pathname.*===" workers/fetch-s1.js | head -60
  Top: jsonResp(), STATUS_WEIGHT, processFleet(), computeRevenue()
  Routing: if (pathname === '/...') in main fetch handler

### Frontend
~/kkme/app/page.tsx — layout + section order + card rendering
~/kkme/app/globals.css — tokens + responsive + font loading
~/kkme/app/components/StickyNav.tsx — fixed nav (appears >300px scroll)
~/kkme/app/components/StatusStrip.tsx — 4 KPIs (fetches /read /s2 /s7 /s4)
~/kkme/app/components/RevenueCard.tsx — self-fetching Revenue Engine
~/kkme/app/components/S1Card.tsx–S9Card.tsx — signal cards (use useSignal hook)
~/kkme/app/components/IntelFeed.tsx — Telegram news
~/kkme/app/lib/useSignal.ts — shared fetch hook with cache layer

### Data typing
Signal cards use typed interfaces (e.g., S2Signal in S2Card.tsx).
When adding new fields to a /sN endpoint, also update the interface in the card component.

## Mac cron (~/kkme-cron/) · Secret: kkme-btd-2026
| fetch-btd.js   | 0 */4 * * *  | BTD S2 + Litgrid ordered capacity |
| fetch-np-da.js | 0 13 * * *   | Nord Pool DA LT+SE4               |
| fetch-vert.js  | 0 6 1 * *    | VERT.lt permits PDF+XLSX          |

## Infrastructure
Worker: kkme-fetch-s1.kastis-kemezys.workers.dev
Pages: kkme.eu (auto-deploy from main)
KV: KKME_SIGNALS (bound as env.KV)
Secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
Deploy: `npx wrangler deploy` (worker) is SEPARATE from `npm run build` (Next.js Pages)

## SEO / Discoverability (current gaps — address when instructed)
- Page title should be: "KKME — Baltic BESS Market Signals & Revenue Analysis"
- Meta description: "Live supply/demand ratio, capacity prices, grid data, and BESS revenue model for Lithuania and the Baltic energy storage market. Updated every 4 hours."
- Currently a single-page JS app with client-side rendering — not crawlable by AI training pipelines
- Planned: SSR signal pages, JSON-LD structured data, OG images, sitemap.xml
- Each signal should eventually have its own URL for search indexing and AI citation

## Planned features (do NOT build unless explicitly instructed)
**High impact (SEO + conversion):**
- SSR signal pages — each signal gets own route with server-rendered content
- Dynamic OG images for LinkedIn sharing (signal value + phase colour)
- JSON-LD structured data on every page
- "For Investors" section + Methodology table
- About/credibility section with professional bio
- Deal submission form (replace mailto:)
- Weekly market brief at /briefs/ (templated from signal deltas)

**Medium impact (UX):**
- Global Explain/Data toggle in StickyNav
- Mobile card accordion (Tier 3 collapse on mobile)
- Freshness dots + LIVE pulse indicator
- Auto-refresh every 5 minutes
- Alert signup placeholder

**Lower priority:**
- Branded metric name ("KKME Baltic BESS Index")
- Individual fleet entry pages (/fleet/ignitis-kelme)
- aFRR/mFRR price history chart on S2

## Session rules
1. Read THIS file first. It is the single source of truth.
2. Worker file map: never cat the whole worker. Use grep for targeted line ranges.
3. Design tokens: always use var(--token-name), never raw rgba() values in new code.
4. RevenueCard: self-fetching. No props from page.tsx.
5. Existing features: S4 policy flag ✓, S5 Litgrid map link ✓, S5 RSS removed ✓. Don't duplicate or re-add.
6. MODEL INPUT footers: bottom of every signal card component.
7. TypeScript: when adding fields to worker responses, update the interface in the consuming component.
8. Card structure: follow the signal card anatomy (hero → sub-metrics → viz → explain → sources → footer).
9. Voice: terse, precise, numbers first. No adjectives. Sources cited.
10. Deploy: npx tsc --noEmit → npm run build → npx wrangler deploy → git add -A → git commit → git push.
