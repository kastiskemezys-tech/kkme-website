# KKME Website — Strategic Roadmap

**Horizon**: 6–12 months (Phases 7–14).
**Authored**: 2026-04-21 (Cowork session 6).
**Re-sequenced**: 2026-04-21 (Cowork session 9) after visual audit +
user critique. See `docs/visual-audit/phase-7-5-audit/DIAGNOSTIC.md`.
Time-comparison (was Phase 12) and Mobile (was Phase 14) promoted ahead
of synthesis/peer/fleet because investor first impression lives there.
**Context**: canonical state in `docs/handover.md`. Tactical backlog (B-001…B-028) stays there; this doc is for phases that materially change what the site does for an investor.

---

## 1. Where the site is today

Honest assessment, not flattery.

**Strong**:
- Rare data pipeline. 8029-line worker, KV-backed signals across ENTSO-E, BTD, VERT.lt, energy-charts.info, NVE, ECB. This is the asset. Most competitors can't produce this.
- Card density. S1–S9 + structural drivers + RevenueCard + TradingEngine. A lot on one page.
- Visual identity. Three-font system, halftone map, warm amber, design-governed tokens.
- Data quality gates. BESS relevance scoring, keyword gate, source type chips. IntelFeed has real signal-to-noise discipline.

**Weak**:
- **No thesis above the fold.** The hero is a map. An investor scrolls past and sees 10+ cards without a "so what." There's no single-glance regime indicator.
- **No peer context.** Today's Lithuanian DA capture is €141/MWh. Is that good? Compared to what? Germany is ~€180–200, Sweden is ~€60. A number without a comparable is half a signal.
- **No fleet/pipeline visibility.** VERT.lt is already being scraped into the worker (line ~3097) but there's no dedicated surface showing who's operating, who's building, how crowded the market is.
- **Revenue model is static.** 50 MW reference asset is one data point, not a tool. An investor wants to know what THEIR project earns.
- **No historical depth.** Every card is "right now." Some have sparklines, but there's no 12M view of how each signal has evolved. Investors think in cycles.
- **Methodology is implicit.** Sources in footer + per-card. No single page that says "here's every number, here's where it comes from, here's the derivation."
- **Mobile is afterthought.** B-026 acknowledges this. Investors will read on phones.

**Misaligned**:
- IntelFeed is labeled "Market intelligence" but is reactive (news that happened). Investors also want forward-looking (regulatory changes pending, auctions scheduled). The signal is separable.
- RevenueCard is "elevated" — biggest visual commitment — but is the least interactive surface. The page header implies it's the payoff, but the payoff isn't really there.

---

## 2. What "significant improvement" means here

Not more cards. Not more polish. Four vectors:

1. **Synthesis** — make the existing data add up to something. One regime call above the fold.
2. **Context** — every hero number gets a comparable. Peer benchmarks on revenue cards.
3. **Depth** — every signal gets a history. Every signal gets a methodology link.
4. **Agency** — the investor can poke at the model. Sliders, not slides.

If a phase doesn't move at least one of those vectors meaningfully, it's polish and should stay in the B-backlog instead.

---

## 3. Roadmap

### Phase 7 — S1 & S2 card rebuild (SHIPPED 2026-04-21)

**Status**: merged to main.
**Vector**: depth (Phase 7 exposes `rolling_30d` percentiles + 30-day sparkline on the two most investor-facing cards).
**Prompt**: `docs/phases/phase7-s1-s2-rebuild-prompt.md`.

---

### Phase 7.5 — S1/S2 polish pass (queued)

**Status**: prompt ready, queued for Claude Code YOLO.
**Vector**: surface quality.
**Prompt**: `docs/phases/phase7-5-polish-prompt.md`.
**Effort**: 2–3h.
**Scope**: surface layering, chart refinement, table rhythm, motion tokens. Excludes hero/mobile (covered by 7.6).

---

### Phase 7.6 — Hero refinement (new, queued)

**Status**: prompt ready at `docs/phases/phase7-6-hero-prompt.md`.
**Vector**: first-impression quality.
**Effort**: 2–3h in Claude Code.

**The problem**: baseline visual audit (2026-04-21) found four concrete hero issues: hero background is a flat rectangle with no atmosphere, Baltic map country polygons are solid amber at full opacity (52 polygons, no transparency), `<h1>` has empty text and 16px size (no display headline), and no sub-520px breakpoint tuning exists.

**What ships**: fixed atmospheric background layer (radial gradient teal→dark), country polygon fill dropped to ~10% opacity with hairline stroke, real Cormorant 48px H1 with investor-facing copy, explicit `@media (max-width: 520px)` and `(max-width: 380px)` hero rules.

**Why it matters**: the hero is the first thing every investor sees. Three of these four are first-impression failures; the fourth (mobile) compounds because investors read share links on phones.

---

### Phase 8 — Historical depth (time-period toggles) — PROMOTED from 12

**Vector**: depth.
**Effort**: 1–2 days (most cards inherit this from Phase 7 patterns).
**Promoted reason**: user's 2026-04-21 critique explicitly requested daily/weekly/monthly/3M/6M comparison. Biggest perceived gap in current dashboard.

**The problem**: every card is "now" or "last 30 days." Investors look for cycles. Is today a peak or a trough in a broader pattern?

**What ships**:

- Every revenue-relevant card (S1, S2, RenewableMix, ResidualLoad, SpreadCapture) gets a duration toggle: `1D / 1W / 1M / 3M / 6M / 12M`.
- Worker: most signals already keep 90-day history; extend to 12M (365 days) where feasible. For S1 capture, `s1_capture_history` already has 700+ days — just expose more of it via `/s1/capture?window=12m`.
- Frontend: line chart swaps data range; monthly aggregation toggle kicks in at 12M.

**Why it matters**: a €141/MWh capture today reads differently if the investor can see it peaked at €327 in March 2025 and bottomed at €99 in July. Cycles are the story energy markets tell.

**Success metric**: every revenue card has visible cycle context.

---

### Phase 9 — Mobile pass — PROMOTED from 14

**Vector**: agency (for real users).
**Effort**: 2–3 days.
**Promoted reason**: sub-520 breakpoint gap confirmed in audit. Investors open share links on phones. First impression broken for ~40% of referrals.

**What ships**:

- Hero map becomes either a simplified map (no interconnector particles) or a stacked "mini signal board" below 768px.
- Cards collapse to single-column with reduced internal density.
- Charts swap to smaller tick counts and larger touch targets.
- Drawer anatomy becomes bottom-sheet instead of side-drawer.
- Explicit 360/390/414 breakpoint tuning on top of what Phase 7.6 seeded.

**Why it matters**: B-026 flagged it. ~40% of LinkedIn-referred traffic is mobile. Without this, the site's first impression for half the audience is broken.

**Success metric**: Lighthouse mobile score >85, CLS <0.1.

---

### Phase 10 — Market Regime header (cross-signal synthesis) — DEMOTED from 8

**Vector**: synthesis.
**Effort**: 1 Cowork planning session + ~2 days Claude Code.

**The problem**: investor arrives, sees a map, scrolls, sees S1…S9. No sentence anywhere on the page says "Baltic BESS is in an expansion regime right now because X, Y, Z." Every card is its own island.

**What ships**: a compact `MarketRegimeHeader` component, placed directly below the hero map, above the "Revenue signals" section. Four elements:

1. **Regime chip** — `EXPANDING / TIGHTENING / DISRUPTED / SATURATED`. Computed server-side (new worker endpoint `/regime`) from a weighted combination:
   - S1 capture vs. 90-day p75 (revenue)
   - S2 CVI vs. 180-day p75 (balancing)
   - S3 capex-per-kWh trend (build)
   - S4 free MW trajectory (grid access)
   - Each weighted 0.25; regime = argmax of the four band definitions.
2. **One-sentence thesis** — Cormorant Garamond, ~20 words. Template driven, not free text. Example: *"Lithuanian storage sits in an expanding regime: DA capture €141/MWh is at the 72nd percentile of 30 days, balancing CVI remains elevated, and free grid capacity is flat."*
3. **Four mini-sparklines** — one per driver signal. Small, dense. Clicking each jumps to the full card below.
4. **Regime history strip** — horizontal bar of the last 90 days colored by daily regime. Shows whether today is stable or a flip.

**Data**: new endpoint `/regime` in the worker that pulls the four signals from existing KV keys and computes the band classification + thesis template. No new data sources needed.

**Success metric**: investor can form a first-order view of Baltic BESS in 5 seconds without scrolling past the fold.

**Dependencies**: Phase 7 ships the `rolling_30d` exposure S1/S2 need; Phase 8 reads from the same KV keys.

---

### Phase 11 — Peer comparison strip — DEMOTED from 9

**Vector**: context.
**Effort**: 1 day worker (add PL/DE/SE4 fetch) + 1 day frontend.

**The problem**: every hero number on the page is an absolute Lithuanian value. No frame of reference.

**What ships**:

- **Worker**: extend the existing ENTSO-E fetch (PL_BZN already present in code, SE4_BZN too). Add Germany (DE-LU bidding zone) and Sweden SE3. Compute daily capture-equivalent for each peer zone using the same `computeDayCapture` function. Store `s1_peers_today` in KV. Similar for S2 where BTD has cross-border data.
- **Frontend**: small `PeerStrip` primitive under S1/S2 hero numbers. Shows 3 tiles: Germany €/MWh, Poland €/MWh, Sweden SE3 €/MWh. Each with a delta chip vs. LT (green/rose based on sign).

**Data**: `ENTSOE_API_KEY` secret already present. DE and SE3 are standard ENTSO-E bidding zones. PL is already in code.

**Why it matters**: the sentence "LT capture €141/MWh vs. DE €189 vs. PL €112" tells an investor more in one line than the current full card. It answers *"is Baltic discounted or at parity right now?"*

**Success metric**: every revenue hero number has a peer comparable visible without a click.

---

### Phase 12 — Fleet & pipeline dashboard — DEMOTED from 10

**Vector**: context + agency.
**Effort**: 2 days (one of worker, one of frontend).

**The problem**: S4 shows aggregate free MW. It doesn't show *who has the project slots*, *who's building*, or *how saturated the market is getting*. Investors care about crowding — ten 100 MW projects competing for the same arbitrage is a different market than two.

**What ships**:

- **Worker**: expose the already-scraped VERT.lt data (operational + pipeline BESS in Lithuania) via a new `/fleet` endpoint. Schema: `{ lt: [{ name, mw, duration_h, status, owner, cod, location: [lat, lon] }], lv: [...], ee: [...] }`. If LV/EE sources aren't wired yet, document the gap as sub-backlog. Don't block on them.
- **Frontend**: new section below "Build conditions", titled "Fleet & pipeline". Three tiles:
  1. **Operational** — count, aggregate MW, aggregate MWh, a ranked mini-table of top 5 by MW.
  2. **In construction** — same shape, next-18-months COD.
  3. **Pipeline** — same shape, 18+ months.
  Plus a single mini-map (reuse `BalticMap` primitive) with dots scaled by MW and colored by status.

**Data**: VERT.lt via worker (already scraped). LV (AST) and EE (Elering) may need separate scraping jobs — if so, ship LT-only first.

**Why it matters**: the first investor question after "what does it earn" is *"how crowded is it going to get"*. Right now the site answers the first and ducks the second.

**Success metric**: a visitor can answer "how many MW are operational in LT today, how many are in construction" in one glance.

---

### Phase 13 — Interactive revenue model — DEMOTED from 11

**Vector**: agency.
**Effort**: 3–4 days. Biggest phase.

**The problem**: the current `RevenueCard` computes for a single 50 MW / 2h / fixed capex asset. Investors want to plug in their own project.

**What ships**: `RevenueCard` becomes a calculator. Sliders:

- **Installed MW** (5–200).
- **Duration** (2h / 4h / 8h).
- **Capex per kWh** (€200–€600).
- **Debt cost** (3–8%).
- **DA exposure %** (0–100; balance is balancing/capacity).

Each slider change re-runs a dispatch simulation over the last **90 days of real prices** already in KV. Output:

- **€/MW/year revenue** with p25/p50/p75 bands.
- **Payback years** given capex + financing.
- **IRR** over 15 years.
- A small "vs. 50 MW reference" delta chip so the user's assumptions are anchored.

**Data**: dispatch logic mostly exists in `TradingEngineCard` — lift the core simulator out into `lib/dispatch/simulator.ts` (pure function, no Chart.js), reuse in both cards. 90-day price history already exists in `s1_capture_history` (700+ days there; use last 90). Capacity-monthly clearing already in `/s2`.

**Why it matters**: turns the site from a view into a tool. Investors who play with a calculator spend 10× longer on the page and leave with a concrete number. That's the conversation-starter `ContactForm` is waiting for.

**Success metric**: >5-minute median session length on RevenueCard interactions.

**Risk**: slider-driven recomputation must stay snappy (<100 ms per change) on mobile. Simulator should run in a Web Worker if it tips past that.

---

### Phase 14 — Methodology page (`/methodology`) — DEMOTED from 13

**Vector**: depth + trust.
**Effort**: 2 days (mostly writing, minimal code).

**The problem**: an investor who's seriously diligence-ing the site wants to see every number traced to its source. Right now sources are footer text + per-card `SourceFooter`, but there's no single exhaustive document.

**What ships**: new route `/methodology` (static MDX). Sections:

1. **Signal catalog** — one row per signal (S1…S9 + structural), columns: name, formula, primary source, refresh cadence, known gaps, historical availability.
2. **Data sources** — one entry per external API: name, URL, auth pattern, terms, refresh frequency, retention.
3. **Derivations** — the math for gross capture, net capture, CVI, stress index, regime index. Formulas rendered with KaTeX.
4. **Known limitations** — what the site *doesn't* claim. E.g., "capture is theoretical dispatch of a price-taker BESS; actual fleet dispatch diverges."
5. **Change log** — dated entries for methodology changes (moved to BTD, added solar, changed RTE assumption, etc.). Ties to `docs/principles/decisions.md`.

**Why it matters**: the site currently looks like a polished data viz. A methodology page makes it look like an analyst product. Different posture.

**Success metric**: when an investor asks a technical question, the answer is "section X of /methodology" — not an email thread.

---

## 4. Not on this roadmap (explicit no)

So Kastytis can push back if any of these belong on it after all.

- **Nordic hydro deep-dive** — already decided against in Session 4. Not market-moving for Baltic-only investor.
- **S5/S6/S8 rebuilds** — lower-investor-salience signals. Current state is adequate.
- **Multi-language site** — LT/EN. English stays default. Kastytis's audience is international capital, not retail Lithuanian.
- **User accounts / saved configs** — over-indexing for a marketing site. Contact form is the conversion surface.
- **Real-time push / websockets** — polling at 5/15/60 min is fine. Pushing is complexity for no investor win.
- **Interactive map editing** — `/dev/map-calibrate` exists for internal use. Not a visitor feature.
- **Blog / editorial content** — IntelFeed handles the news beat. Long-form analysis can live on LinkedIn.

---

## 5. Sequencing logic (updated 2026-04-21)

Re-sequenced after visual audit: first-impression phases (7.5, 7.6, 8, 9) front-loaded, synthesis/peer/fleet phases (10, 11, 12, 13) deferred.

- **7 → 7.5 → 7.6**: surface polish, then hero refinement. Both are visual-only and cheap.
- **8 (historical toggles) before 10 (regime)**: investor can't read the regime call meaningfully without cycle context. Seeing "today is the 72nd percentile of 30 days" matters less than seeing "today vs. last 12 months."
- **9 (mobile) before 10/11/12**: mobile pass over a still-changing layout gets wasted. But the cost of shipping synthesis to a broken mobile experience is higher — investors open links on phones first. Compromise: mobile pass after 8 (which is the last card-level structural change for a while).
- **10 before 11**: Peer strip slots into space the regime header opens up above revenue cards.
- **12 anywhere after 7**: Fleet & pipeline is decoupled; slot it when Kastytis wants a visible new section.
- **13 after 10**: interactive RevenueCard benefits from Regime chip context above it.
- **14 (methodology) can happen anytime**. Writing-heavy, minimal code risk. Good filler for a low-bandwidth week.

---

## 6. Open questions for Kastytis

Each of these affects scope and should be answered before the relevant phase starts.

1. **Phase 8**: is "regime" a defensible word for investor audience, or does it feel analyst-jargon? Alternatives: "market state", "Baltic BESS Monitor", "Today's call."
2. **Phase 9**: is Poland actually informative? German and Swedish peers are clear benchmarks; Poland is transitional. Might add noise more than context.
3. **Phase 10**: LV + EE fleet scrapers don't exist yet. Ship Lithuania-only, or gate Phase 10 behind LV+EE being wired? Lithuania-only has the advantage of something shipping; gated has the advantage of not showing a half-Baltic fleet view.
4. **Phase 11**: should the interactive model include a debt-tranche structure (senior + subordinated), or keep it to one blended cost of capital? More realistic = more complex. Audience is sophisticated enough to want realism, but at the cost of slider clarity.
5. **Phase 13**: MDX methodology or MD-only? MDX lets math render with KaTeX natively; MD means plain text formulas. Trust-posture depends on it looking like a document, which leans MDX.
6. **Overall pacing**: 8 phases in 6–12 months = roughly one per 4–6 weeks in Claude Code YOLO. Is that aggressive enough, or too aggressive given solo-operator bandwidth?
