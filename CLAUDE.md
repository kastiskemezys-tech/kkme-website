# KKME — Claude Code Context

## What this is
Baltic flexibility and storage market intelligence platform centered on a 50MW reference asset.
Market regime → structural drivers → competition pressure → market design reality → cost direction → reference asset economics.
Built by Kastis Kemežys. kkme.eu.

The site answers: What is the Baltic flexibility market doing right now, and what does that mean for a reference storage asset?

S/D ratio determines the market phase. Structural drivers explain why. Market design filters what is usable.
The reference asset section translates all of it into economics. The closing section converts credibility into conversation.

This is not a generic dashboard, not a broker landing page, not a news feed, and not a fake Bloomberg clone.
It is a premium market-intelligence product: investor-facing first, Baltic-focused, high-trust, restrained, analytical.

## Who it's for (in priority order)

Investors — EU infrastructure funds / LPs screening Baltic storage and flexibility exposure. Need: S/D ratio, reference asset IRR, DSCR, COD timing, market regime.
Developers — go/no-go on a project. Need: grid capacity, CAPEX benchmarks, revenue model, fleet competition.
BESS operators — monitoring revenue trends. Need: aFRR/mFRR prices, compression trajectory, arbitrage capture.
Aggregators/Optimizers — portfolio opportunity. Need: fleet pipeline, market structure, node-level grid data.
Analysts/AI — research and citation. Need: crawlable data, methodology, structured markup.

## Conversion funnel (do not break this flow)

Land (hero/market now) → Understand why (revenue drivers + structural drivers + competition + market design) → See what it means (reference asset economics) → Compare (Europe context) → Stay informed (intelligence board) → Act (conversation CTA)

Revenue drivers and structural explanation come BEFORE the reference asset section, because understanding must precede conclusion.

## Stack

Next.js 16 App Router + TypeScript
Tailwind CSS + CSS custom properties (design tokens in globals.css :root)
D3.js for data viz, Lenis for scroll, anime.js for state-change animations only
Cloudflare Pages (hosting) + Workers (data) + KV (storage)
Mixed styling: Tailwind utilities + inline styles. When editing, match the pattern of the file you're in.

## Design tokens (globals.css :root — always use var() references)

Theming: dark/light via `data-theme` attribute on `<html>`. All tokens defined in `:root` (dark default) with `[data-theme="light"]` overrides in globals.css. Anti-flash script in `<head>` reads localStorage before first paint. ThemeToggle component in StickyNav.

### Core tokens
--bg-page: #07070a / light: #f4f1ec
--text-primary: rgba(232,226,217,0.88)    ← headings, hero numbers, bold values
--text-secondary: rgba(232,226,217,0.65)  ← body text, table values
--text-tertiary: rgba(232,226,217,0.45)   ← labels, section headers, descriptions
--text-muted: rgba(232,226,217,0.30)      ← footnotes, timestamps, source citations
--text-ghost: rgba(232,226,217,0.15)      ← ghost/decorative labels only
--teal: rgb(0,180,160)       ← positive: supportive phase, bankable, IRR above target, active signals
--amber: rgb(212,160,60)     ← caution: tightening phase, marginal DSCR, pending regulatory, warnings
--rose: rgb(214,88,88)       ← negative: compressed phase, not bankable, IRR below hurdle, failures
--bg-elevated: rgba(232,226,217,0.04)
--border-card: rgba(232,226,217,0.10)
--border-highlight: rgba(232,226,217,0.20)  ← primary card borders
--font-xs: 0.6875rem (11px)  ← ghost/terminal labels only, NOT for readable text
--font-sm: 0.8125rem (13px)  ← minimum for any text a user needs to read
--font-base: 1rem (16px)

### Semantic color tokens (teal/amber/rose opacity variants)
--teal-strong / --teal-medium / --teal-subtle / --teal-bg ← impact lines, reference asset annotations
--amber-strong / --amber-subtle / --amber-bg ← warning states, caution indicators
--rose-strong / --rose-bg ← negative states, failure indicators
--signal-positive / --signal-warning / --signal-negative / --signal-neutral ← signal state colors (used by signalColor.ts)

### Chart chrome tokens (tokenized separately from data-semantic colors)
--chart-grid / --chart-label / --chart-tick / --chart-bar ← chart axes, labels, gridlines
--map-bg ← BalticMap container background
--overlay-heavy ← StickyNav, SignalBar, overlays

### Theming rules
- All component inline styles use var() references — never raw rgba() values
- signalColor.ts and s*-utils.ts return var() references for inline style consumption
- SVG data URIs (ContactForm select arrow) cannot use var() — documented exception
- Data-semantic colors (chart series, arc export/import, LT purple fill) are NOT tokenized for theme — they stay consistent across themes
- Theme transition: 150ms on background-color, color, border-color, box-shadow (applied globally via CSS)

## Design principles (binding — do not violate)

Function is the aesthetic. No decoration. Every pixel communicates data or enables action.
Animation ONLY on state changes. No looping animations except the LIVE pulse dot.
Minimum contrast: 0.45 opacity for readable text. 0.15 only for ghost/decorative labels.
Minimum font size: 0.8125rem (13px) for readable text. 0.6875rem only for ghost/terminal labels.
Typography rules: Unbounded = hero numbers and section headings only. DM Mono = data, labels, UI, footers, everything else. Cormorant Garamond = narrative paragraphs (interpretation lines, about section, investor copy).
Spacing: Cards have 24px internal padding. Sections have 48px vertical gap. Sub-elements within cards use 8-16px gaps.
Voice: Terse. Precise. Numbers before words. Sources always cited. No adjectives. No hype. But always include one plain-language interpretation line per card.
Dark theme: warm off-white on near-black. Light theme: warm cream/stone with dark text. Both understated and precise.
Theme toggle in StickyNav. Preference persisted to localStorage. Anti-flash script prevents FOUC.

No centered poster hero. Hero is two-column: value prop left, market state right.
No Explain/Data toggle buttons on any card. Default state must be readable. Extra detail goes in collapsible details drawer.
No insider abbreviations in primary labels. Use "Supply/demand ratio" not "S/D". Use "Battery arbitrage capture" not "BESS CAPTURE". Abbreviations allowed only in secondary/detail views.
50MW reference asset is the throughline. Every signal card must include a reference-asset impact line showing whether the signal is positive/negative/mixed for the reference asset.
Data classification system. Every metric must be classified as: Observed / Derived / Modeled / Proxy / Reference. This must be visible in the UI where appropriate.
Impact classification. Every signal translates to: Strong positive / Slight positive / Mixed / Slight negative / Strong negative / Low confidence. Where relevant, show different impacts for 2H and 4H.
Baltic framing honesty. Use "Baltics with LT-led signal depth." Do not imply perfect Baltic symmetry. Allowed: "Baltic blended signal", "Lithuania-led proxy", "Baltic-calibrated reference."
Connected markets explicit. Sweden/Finland/Poland influence must be visible in interconnectors and structural drivers, not hidden.
Private data rules. Private pipeline/scraper data improves interpretation behind the scenes. Public cards show only aggregated, public-safe outputs. No confidential project names, term sheet dates, or commercial details.
Degraded states. Never show "—", "Fetching...", or "Computing..." as primary state. Use last known good value + stale badge + confidence warning.

## Interaction architecture (see docs/INTERACTION_ARCHITECTURE.md)

- Information layers: Layer A (default visible) → Layer B (expanded detail) → Layer C (methodology/trust) → optional Layer D (dedicated page)
- Default card view shows only: title, hero metric, status, chart, interpretation, impact line, source footer, one detail trigger
- Supporting metrics, fleet lists, price tables, methodology → DetailsDrawer (Layer B/C)
- Every clickable element must do something. Every non-interactive element must not look clickable.
- Hover may enhance (chart value readout, term tooltip) but must never gate core meaning
- Navigation anchors must map to real DOM sections. Dead links must be hidden.
- Mobile is first-class: no hover-only meaning, touch-friendly targets, no horizontal overflow

## Page structure (top to bottom)

1. Hero / Market Now (id="top") — KKME wordmark + value prop + CTA (LEFT column) + Market Now card with regime, 4-5 KPIs, interpretation, reference-asset impact (RIGHT column). Two-column asymmetric, NOT centered poster. No "BUILDABLE" label. No centered body copy.
2. StickyNav — appears on scroll >300px. Links match new section names: Market / Revenue / Competition / Structure / Design / Cost / Build / Returns / Europe / Intel / Contact.
3. Revenue Opportunity (id="revenue-drivers") — S1 Baltic Price Separation + S2 Baltic Balancing Market. These are the two Tier 1 revenue signals. 2-column grid.
4. Baltic Market Pressure (id="competition") — COD window cards (2027/2028/2029) showing battery competition vs system need for flexibility. Replaces old COD compression bars. Net effect label per window. Reference-asset implication per card.
5. Structural Market Drivers (id="structural") — Primary row: Wind, Solar, Demand/Load, Interconnectors & Connected Markets. Secondary row: TTF Gas, EU ETS Carbon. NO Nordic Hydro as primary card. NO DC Power Viability in this section.
6. Market Design & Trading Reality (id="market-design") — NEW section. Balancing market usability + market regime context + reference asset confidence layer. Core concept: "Posted price ≠ usable revenue."
7. Project Cost Trend (id="cost") — Replaces old BESS Cost Stack. Full-project CAPEX direction, driver decomposition, tracked signals, reference asset sensitivity. NOT lithium-led.
8. Grid Access & Buildability (id="buildability") — Replaces old Grid Connection Scarcity. Indicative capacity + reserved/queue pressure + policy watch. Uses private dataset behind scenes only for interpretation.
9. Baltic Reference Asset Returns (id="reference-asset") — Replaces old Revenue Engine. Fixed 50MW anchor. 2H vs 4H visible side-by-side. Base/Conservative/Stress cases. Revenue mix chart. Driver impact waterfall. "What changed" event rail. Data confidence strip. NOT a calculator hero. NOT equity IRR as hero.
10. European BESS Market Map (id="europe") — 2-axis scatter (crowding vs revenue opportunity). NOT a ranking table. Detail panel per country. Freshness per market (Live/Recent/Reference).
11. Market Intelligence (id="intel") — Curated board, NOT raw feed. Pinned "This week's market movers" strip. Cards with "why it matters" + impact + horizon tags. Filters: Revenue / Competition / Structure / Market Design / Cost / Buildability / Future Demand / Watchlist.
12. Discuss Baltic Storage Opportunities (id="conversation") — Replaces Deal Flow. Investor-first. Adaptive form starting with "I'm contacting you about." CTA: "Start the conversation." NOT "Submit Teaser."

## Signal card anatomy (follow for every card)

Every signal card component follows this structure top-to-bottom:

1. Header — title + subtitle explaining what this signal tracks
2. Hero metric — the primary number, largest font (Unbounded)
3. Status tag — plain-language state (e.g., "Supportive", "Tightening", NOT "COMPRESS")
4. Interpretation line — one sentence explaining what the metric means right now
5. Main visualization — chart, bar, or map (should be the dominant visual element, not decorative)
6. Supporting metrics — max 3, with clear labels and units
7. Reference asset impact — explicit line: "Impact on reference asset: [positive/mixed/negative for 2H/4H]"
8. Source/freshness footer — source name, update time, data classification (Observed/Derived/Proxy/Modeled)
9. Collapsible details — all additional data, breakdowns, methodology notes, raw tables

No Explain/Data toggle. No MODEL INPUT ghost footer. Default state must be fully readable without interaction.

## Card build rules (learned from hero/S1/S2)

Mandatory for ALL future card and section builds.

### Default visible layer — strict limit
Every card's default view must contain ONLY:
1. Title + one-line subtitle (max ~15 words)
2. Geography qualifier
3. Hero metric + StatusChip (same line)
4. One essential helper line (only for metrics that are otherwise uninterpretable — e.g. "Below 1.0× means...")
5. Primary chart or visualization
6. One interpretation sentence (Cormorant, not italic, var(--text-secondary))
7. One "50MW reference asset:" impact line (teal at 0.75 opacity)
8. Source footer (one line)
9. Drawer trigger ("▸ View signal breakdown")

Nothing else. No supporting metrics, no methodology, no caveats, no fleet lists, no price detail in the default view.

### Data classification badges — never inline text
The words "derived", "proxy", "modeled", "observed", "reference" must NEVER appear as part of a label string. They render ONLY via the DataClassBadge component. If a MetricTile label currently contains these words as inline text, it is a bug.

### Sublabels — default hidden
MetricTile sublabels (helper text below values) should NOT appear in the default card view. Move them into the DetailsDrawer under a "Metric definitions" section. Exception: one critical context sublabel per card if the metric is otherwise meaningless (e.g. "+541 MW pipeline" on fleet).

### Interpretation lines — commercially specific
Interpretation must say what the metric means for investment, not describe the metric technically. Bad: "Supply approaching demand. Revenue assumptions require revalidation." Good: "Competition is growing but has not yet matched demand. Storage revenues are supported, though new fleet is narrowing headroom."

No italic. No analyst-memo tone. No "requires revalidation."

### Drawer content — structured into groups
DetailsDrawer content must be organized with:
- DM Mono uppercase subheads (var(--font-xs), var(--text-tertiary), letter-spacing 0.1em)
- 24px gaps between groups
- Three hierarchy levels:
  - Evidence values: var(--text-secondary), var(--font-sm)
  - Notes/context: var(--text-muted), var(--font-xs)
  - Methodology: lowest — var(--text-muted), var(--font-xs), opacity 0.8
- Spacing instead of divider lines (max 1 divider before methodology)
- If drawer has >4 content groups, use nested DetailsDrawer for the least critical group

### Drawer trigger — consistent wording
Use "▸ View signal breakdown" for signal cards.
Use "▸ View market detail" for hero.
Use "▸ View [specific content]" for nested drawers.
Never use generic "Details" or "Method & assumptions."

### Interaction — multiple click targets, same drawer
Per card, these elements should open the same DetailsDrawer:
- The drawer trigger text (primary)
- The card title (secondary — cursor: pointer, hover brightness)
- The source footer (secondary — cursor: pointer, hover brightness)

Use the drawerKey state pattern:
```
const [drawerKey, setDrawerKey] = useState(0)
const openDrawer = () => setDrawerKey(k => k + 1)
<DetailsDrawer key={drawerKey} defaultOpen={drawerKey > 0}>
```

### Copy tone rules
- Labels must be plain English, readable by a first-time investor
- No insider abbreviations in primary view (aFRR allowed only inside drawers or with tooltip)
- Interpretation must feel human-written, not AI-polished
- Avoid: "supports returns", "requires revalidation", "tightening margin" unless expressed more specifically
- Every number should pass the test: "Can a smart investor unfamiliar with Baltic balancing markets understand in 3 seconds what it measures, whether it's good or bad, and why it matters?"

### Progressive disclosure — build sequence
When building any new card:
1. Write the default visible layer FIRST (the 9 items above)
2. Build the DetailsDrawer content SECOND
3. Verify the default card height — if taller than ~450px (excluding chart), move more into the drawer
4. Test with drawer closed AND open before committing

## Chart and visualization discipline (binding)

### Axes and scale
Every chart must communicate its scale. A reader should never have to guess what "high" or "low" means.
- Sparklines: show min and max value markers at the Y-axis edges (left side, font-xs, text-muted). These are not axis labels — they are range indicators so the reader knows the scale.
- Bar charts: include a reference line or threshold annotation if the data has a meaningful threshold (e.g., 1.0× on S/D ratio).
- Stacked bars: show percentage labels when segment proportions matter for the decision.
- Time axis: always indicate the time range (e.g., "30 days", "2025–2029"). Use left = oldest, right = newest.

### Legends
If color carries meaning, the meaning must be stated. No chart should require the reader to memorize a color scheme.
- Use inline legends (colored square + label) below or beside the chart, not a separate key.
- Map flow arcs: include a compact legend (export = green, import = amber) near the map.
- Phase-colored bars: include phase names in the legend or directly label each bar.

### Statistical honesty
- Never truncate a Y-axis to exaggerate movement unless the truncation is explicitly marked (e.g., "axis starts at X").
- Sparklines without Y-axis labels are permitted ONLY if min/max markers are present.
- Do not show trend lines or moving averages unless the method is stated (e.g., "7-day rolling").
- Do not imply precision beyond the data source. If the source updates daily, don't show hourly granularity.

### Color rules for charts
- Use CSS custom properties (var(--token)) for all chart colors. Never use hardcoded hex or rgba() in chart components.
- Data-semantic colors (export green, import amber, LT purple) are exceptions — these stay consistent across themes but should still use named constants or variables where possible.
- Sentiment colors: teal = positive, amber = caution, rose = negative. Do not deviate.

### Chart sizing and responsiveness
- Minimum chart height: 120px for sparklines intended as primary visualization, 24–40px for inline sparklines in detail areas.
- Charts must not overflow their container horizontally on mobile (320px viewport).
- SVG viewBox should use the coordinate system; width should be responsive (100% or constrained by container).

### Freshness and provenance on charts
- If a chart shows historical data, the time range must be visible (either as axis labels or a subtitle).
- If the data is proxy, modeled, or derived, this must be stated near the chart — not only in the source footer.

## Content rules (binding)

Reference asset section: Open with current Baltic reference asset economics, NOT "against Clean Horizon." CH benchmark is secondary context, not the framing device.
Three cases: Base (DEFAULT) / Conservative / Stress. Base is always the default view. Do not default to the highest-return scenario.
No freeform MW/MWh input boxes at top of reference asset section. Fixed 50MW anchor for comparability.
COD sensitivity is the #1 insight: 2027 COD ≈ investable, 2028+ ≈ fails under current conditions. Always visible.
Revenue mix must be visible as stacked bars, not buried in a table.
2H vs 4H comparison must be visible simultaneously, not toggled.
Stacking disclosure always visible: "Realised revenue typically 65–80% of theoretical max..."
Proxy flag: all capacity prices show "proxy" badge until BTD measured data uploaded.
DSCR threshold: 1.20× = bankability floor. Rose below, teal above.
IRR colours: Project >12% teal, 8-12% amber, <8% rose. Equity >15% / >10% / <10%.
DC news feed was REMOVED from S5. Never re-add.
Nordic Hydro demoted from primary card. Use in details or behind scenes only.
No giant equity IRR as hero number. Project IRR and EBITDA/MW are primary. Equity IRR is secondary/demoted.

## Key model assumptions (for Reference Asset section)

These are the defaults. Changing any requires updating computeRevenue() in the worker.
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
These match BESS_Financial_Model_Visaginas_50MW__5_.xlsx (v5, corrected March 2026).
Expected outputs: Project IRR ~19%, Equity IRR ~29%, DSCR ~2.0×, Y1 Net/MW ~€177k.

## The signals

S1 — Baltic Price Separation [Revenue Opportunity]
Source: ENTSO-E A44 (LT + SE4 + PL) · every 4h · KV: s1, s1_history
Returns: LT/SE4/PL avg, spread, history, p_high_avg, p_low_avg, intraday_capture, bess_net_capture
Card: S1Card.tsx — single-story card: spread hero + 30D chart + 3 supporting metrics + status tag + interpretation + reference-asset impact
Rename: "BESS capture" → "Battery arbitrage capture"
Model feeds: Assumptions!D72-D73 (P_high, P_low → arbitrage revenue)

S2 — Baltic Balancing Market [Revenue Opportunity]
Source: BTD via Mac cron + manual fleet input + BTD CSV upload · KV: s2, s2_fleet, s2_btd
Returns: aFRR/mFRR/FCR prices, sd_ratio, phase, cpi, trajectory, fleet, prices_source
Phases: SCARCITY (S/D <0.6, CPI >1.0) · COMPRESS (0.6-1.0) · MATURE (>1.0, CPI floor 0.35)
Card: S2Card.tsx — S/D ratio hero + plain-language status tag (NOT "COMPRESS") + aFRR/mFRR revenue support + fleet pressure summary (NOT full list) + S/D trend chart + reference-asset impact
Fleet list moves to collapsible details. Full fleet detail is NOT in the primary card view.
Model feeds: Assumptions!D46,D50,D54 (capacity prices) · Market Drivers!D19-D21 (S/D, CPI)

S3 — Project Cost Trend [Cost / Bankability]
Source: ECB API (Euribor, HICP) + static CAPEX refs · KV: s3
Card: S3Card.tsx — full-project CAPEX direction + driver decomposition + tracked signals + reference-asset sensitivity
NOT lithium-led. Lithium is one input signal, not the hero.
Model feeds: Assumptions!D37 (interest rate) · Assumptions!D18 (equipment cost)

S4 — Grid Access & Buildability [Buildability]
Source: VERT.lt ArcGIS (Litgrid FeatureServer/8) · KV: s4, s4_pipeline
Card: S4Card.tsx — indicative capacity + reserved/queue pressure + policy watch + buildability status + reference-asset implication
Policy flag (€50→€25/kW) already exists. Litgrid map link already exists.
Private dataset used behind scenes for interpretation only.
Model feeds: Grid constraint (connection availability + cost)

S5 — DC Power Viability [Removed from main sections]
Source: ENTSO-E grid (shared with S4) · KV: s5
Card: S5Card.tsx — OPEN/CLOSED + headroom bar + Litgrid map link (already exists)
NOTE: RSS feed removed. Do not re-add. DC Power Viability is NOT part of Structural Market Drivers. Keep as standalone minor card or future module.

S6 — Nordic Hydro [Demoted — details/behind-scenes only]
Source: NVE biapi.nve.no (weekly) · KV: s6, s6_history
NOT a primary card in the new architecture. Use in details layer or interpretation logic only.

S7 — TTF Gas [Structural — thermal floor support]
Source: energy-charts.info (every 4h) · KV: s7, s7_history
Regimes: LOW (<15) · NORMAL (15-30) · ELEVATED (30-50) · HIGH (>50)
Secondary card in Structural Market Drivers section.
Model feeds: Market Drivers!D40 (gas marginal cost → P_high floor)

S8 — Interconnectors & Connected Markets [Structural — primary]
Source: ENTSO-E A11 (every 4h) · KV: s8
Card: S8Card.tsx — interconnector state + regime tag + connected-market influence (SE4/NordBalt, Finland/EstLink, Poland/LitPol)
Primary card in Structural Market Drivers section. Must explicitly show Sweden/Finland/Poland influence.
Model feeds: Market Drivers!D35-D37 (spread drag coefficient)

S9 — EU ETS Carbon [Structural — thermal floor support]
Source: energy-charts.info (every 4h) · KV: s9, s9_history
Secondary card in Structural Market Drivers section.
Model feeds: Market Drivers!D41 (carbon cost → P_high floor)

Reference Asset Returns [Primary synthesis — replaces Revenue Engine]
Source: computed from s2_fleet, s2_btd, s1 KV data
Endpoint: GET /revenue?system=2h|2.4h|4h&capex=low|mid|high&grant=none|partial&cod=2027|2028|2029
Component: ReferenceAssetSection.tsx (or refactored RevenueCard.tsx) — self-fetching, no props from page.tsx

## Hard DO NOTs

Do not use centered poster hero layout
Do not use "MARKET STATE: BUILDABLE" or similar unexplained state labels
Do not use Explain/Data toggle buttons on any card
Do not use giant equity IRR as hero number
Do not use oversized glow halos or fake AI-dashboard styling
Do not use decorative motion (animation ONLY on state changes)
Do not use freeform MW/MWh inputs at top of reference asset section
Do not use ranking table for Europe (use 2-axis map)
Do not use raw Telegram/news table (use curated intelligence board)
Do not use "Submit Teaser" CTA (use "Start the conversation")
Do not put DC Power Viability inside structural drivers section
Do not put Nordic Hydro as equal-weight primary card
Do not stuff queue intelligence into buildability card (keep it narrow and public-safe)
Do not use lithium as hero of cost section
Do not use broker/deal-flow tone in closing CTA
Do not show any metric without unit, geography, and scope
Do not use tiny pale text pretending to be premium (min 13px for readable text)
Do not use debug-panel styling or nested-box feeling
Do not use unexplained abbreviations in primary labels (S/D, BESS, aFRR allowed only in secondary views)
Do not present data as live/observed when it is proxy or modeled
Do not make Baltic-wide claims when data is Lithuania-only without disclosure
Do not patch existing components blindly — audit structure first, prefer clean rebuilds over preserving bad architecture
Do not hardcode business logic into presentational components
Do not keep everything in one monolithic component
Do not expose private project names, term sheet dates, or confidential commercial details in public cards

## Worker endpoints (kkme-fetch-s1.kastis-kemezys.workers.dev)

GET: /s1 /s2 /s3 /s4 /s5 /s6 /s7 /s8 /s9 /read /health /revenue /api/model-inputs /s2/fleet
POST: /s2/fleet /s2/fleet/entry /s2/btd /s2/update /s4/pipeline /s5/manual /da_tomorrow/update /heartbeat
All POST endpoints require X-Update-Secret header or Content-Type: application/json.
jsonResp() helper handles CORS + JSON serialisation for all responses.

## KV keys

s1 · s1_history · s2 · s2_fleet · s2_btd · s3 · euribor · s4 · s4_pipeline · s5 · s6 · s6_history · s7 · s7_history · s8 · s9 · s9_history · da_tomorrow · feed_index · cron_heartbeat · digest:cache

## File map

Worker (DO NOT cat entire file — use grep)
~/kkme/workers/fetch-s1.js (~2600 lines)
grep -n "^function|pathname.*===" workers/fetch-s1.js | head -60
Top: jsonResp(), STATUS_WEIGHT, processFleet(), computeRevenue()
Routing: if (pathname === '/...') in main fetch handler

Frontend
~/kkme/app/page.tsx — layout + section order + card rendering
~/kkme/app/globals.css — tokens + responsive + font loading
~/kkme/app/components/StickyNav.tsx — fixed nav (appears >300px scroll) + ThemeToggle
~/kkme/app/components/ThemeToggle.tsx — dark/light theme toggle (client component, sun/moon icons)
~/kkme/app/components/MarketSnapshot.tsx — hero market-now KPI card (being rebuilt)
~/kkme/app/components/RevenueCard.tsx — self-fetching reference asset section (being rebuilt)
~/kkme/app/components/S1Card.tsx — Baltic Price Separation
~/kkme/app/components/S2Card.tsx — Baltic Balancing Market + Fleet Tracker
~/kkme/app/components/S3Card.tsx — Project Cost Trend (being rebuilt from BESS Cost Stack)
~/kkme/app/components/S4Card.tsx — Grid Access & Buildability
~/kkme/app/components/S5Card.tsx — DC Power Viability (demoted)
~/kkme/app/components/S6Card.tsx — Nordic Hydro (demoted)
~/kkme/app/components/S7Card.tsx — TTF Gas
~/kkme/app/components/S8Card.tsx — Interconnectors & Connected Markets
~/kkme/app/components/S9Card.tsx — EU ETS Carbon
~/kkme/app/components/IntelFeed.tsx — Market Intelligence board (being rebuilt from Telegram feed)
~/kkme/app/lib/useSignal.ts — shared fetch hook with cache layer
~/kkme/lib/signalColor.ts — signal state → var() CSS color mapping (theme-aware)

Data typing
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
Deploy: npx wrangler deploy (worker) is SEPARATE from npm run build (Next.js Pages)

## SEO / Discoverability (current gaps — address when instructed)

Page title should be: "KKME — Baltic Flexibility Market Intelligence & Storage Economics"
Meta description: "Live supply/demand ratio, structural drivers, competition pressure, and reference-asset economics for Baltic energy storage. Updated every 4 hours."
Currently a single-page JS app with client-side rendering — not crawlable by AI training pipelines
Planned: SSR signal pages, JSON-LD structured data, OG images, sitemap.xml
Each signal should eventually have its own URL for search indexing and AI citation

## Planned features (do NOT build unless explicitly instructed)

**Decision filter:** Before building any planned feature, check it against claude-handover/FREE_TOOL_PRODUCT_PRINCIPLES.md §8 checklist. Features that do not improve a real decision for developers, investors, or counterparties should be deprioritized.

High impact (SEO + conversion):
SSR signal pages — each signal gets own route with server-rendered content
Dynamic OG images for LinkedIn sharing (signal value + phase colour)
JSON-LD structured data on every page
Weekly market brief at /briefs/ (templated from signal deltas)

Medium impact (UX):
Mobile card accordion (secondary cards collapse on mobile)
Auto-refresh every 5 minutes
Alert signup placeholder

Lower priority:
Branded metric name ("KKME Baltic BESS Index")
Individual fleet entry pages (/fleet/ignitis-kelme)
aFRR/mFRR price history chart on S2

## Governance docs (~/kkme/docs/)
- VARIABLE_DICTIONARY.md — every metric, its source, data class, confidence, inference distance
- SOURCE_REGISTRY.md — every data source, what it proves/doesn't
- MODEL_RISK_REGISTER.md — structured risk table with IDs
- PRODUCT_DEFINITIONS.md — Baltic reserve product structure (lock before coding)
- ASSUMPTION_REGISTRY.md — every hardcoded value, auditable
- MODEL_CHANGELOG.md — version history
- REGIME_DEFINITIONS.md — market regime objects with triggers
- PUBLICATION_GATES.md — confidence + inference distance → publish/withhold rules
- ASSET_CAPABILITY_PROFILE.md — reference BESS physical constraints
- CONTRADICTION_RULES.md — pipeline evidence conflict detection
When adding new metrics or changing formulas, update the relevant doc.
When a metric's publication gate is INTERNAL_ONLY, do not show it as a hero value.

## Session rules

1. Read THIS file first. It is the single source of truth.
2. Worker file map: never cat the whole worker. Use grep for targeted line ranges.
3. Design tokens: always use var(--token-name), never raw rgba() values.
4. Reference asset section: self-fetching. No props from page.tsx.
5. Existing features preserved: S4 policy flag ✓, S5 Litgrid map link ✓, S5 RSS removed ✓. Do not duplicate or re-add.
6. Every card needs: reference-asset impact line + source/freshness footer + data classification badge.
7. TypeScript: when adding fields to worker responses, update the interface in the consuming component.
8. Card structure: follow the NEW card anatomy (header → hero → status → interpretation → viz → supporting → impact → footer → details).
9. Voice: terse, precise, numbers first. But always include one plain-language interpretation line per card.
10. Deploy: npx tsc --noEmit → npm run build → npx wrangler deploy → git add -A → git commit → git push.
11. Before rebuilding any section: audit current component, state flow, data dependencies. Decide: refactor or clean rebuild.
12. Build data-first, not JSX-first. Every section needs a clean view-model layer. Do not hardcode business logic into presentational components.
13. Product principles: read claude-handover/FREE_TOOL_PRODUCT_PRINCIPLES.md before proposing new features. Every addition must pass the 7-question checklist in §8.
14. Pre-deploy validation: after `npx wrangler deploy`, run `bash scripts/validate-deploy.sh` BEFORE `npm run build`. If validation fails, fix the worker before deploying frontend.
15. Data bounds: S/D ratio [0.1, 10], CPI [0.25, 2.0], aFRR capacity [0, 500 EUR/MW/h], activation P50 [10, 2000 EUR/MWh]. Outside these = bug.
16. CPI invariant: MATURE-phase CPI values in trajectory must NOT be identical for consecutive years.
17. Activation merge invariant: /s2 response activation.lt.afrr_p50 must be a number when s2_activation KV exists.

## Rebuild handover

Full rebuild architecture docs are in ~/kkme/claude-handover/:
00_MASTER_ARCHITECTURE.md — vision, audience, page narrative, global rules
01_IMPLEMENTATION_PHASES.md — phased build plan
02_DATA_MODEL_RULES.md — data classification (observed/derived/modeled/proxy)
03_DO_NOTS.md — hard constraints
KKME_TECHNICAL_HANDOVER.md — current tech state, file map, endpoints, deploy
KKME_ASSET_SUMMARY.md — full asset inventory (signals, fleet, revenue engine, data quality)
PACK_1_MARKET_NOW_AND_REVENUE.md — Hero + S1 + S2 rebuild specs
PACK_2_COMPETITION_AND_BUILDABILITY.md — Market Pressure + Grid Access
PACK_3_STRUCTURAL_AND_MARKET_REALITY.md — Structural Drivers + Market Design
PACK_4_COST_AND_REFERENCE_ASSET.md — Cost Trend + Reference Asset Economics
PACK_5_CONTEXT_AND_CONVERSION.md — Europe Map + Intel Board + Closing CTA
PIPELINE_DATA_MAP.md — maps Hetzner scraper pipeline to website sections (S2 fleet 8→145+, S4 grid enrichment, intel auto-generation)
PIPELINE_ADMIN_PROMPT.md — spec for future VPS API + admin panel (separate workstream, build after main rebuild)
images/screenshot_01-11.png — current state reference screenshots

## Shared primitives (Phase 1 complete)

Reusable UI building blocks in ~/kkme/app/components/primitives/:
SectionHeader — left-aligned section header with title, subtitle, metadata row
MetricTile — metric display (hero/standard/compact) with label, unit, data class badge
StatusChip — plain-language state pill colored by sentiment (positive/caution/negative/neutral)
ImpactLine — "Reference asset impact: ..." with optional 2H/4H split
FreshnessBadge — source + update time + data class + live pulse or stale warning
ConfidenceBadge — revenue confidence level (high/medium/low) with reason
DetailsDrawer — collapsible details area replacing Explain/Data toggles
SourceFooter — compact card footer (source, updated, data class, methodology link)
DataClassBadge — inline badge (proxy ⚠, modeled, derived, ref)

Shared types in ~/kkme/app/lib/types.ts:
DataClass, FreshnessClass, ImpactState, Sentiment, GeographyClass
sentimentColor(), impactToSentiment() helpers

Import via: import { SectionHeader, MetricTile, ... } from '@/app/components/primitives'
