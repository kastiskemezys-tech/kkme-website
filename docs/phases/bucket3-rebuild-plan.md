# Bucket 3 — Structural Drivers + Intel Feed + Trust Surface Rebuild

Planning document. Not a Claude Code prompt yet. After agreement, this decomposes into 3–4 phase prompts.

Scope: the three sections flagged as weak in the current post-hero state — Structural market drivers, Market intelligence, and (evaluate) Model risk register + Data confidence.

---

## 1. Current-state critique

### 1a. Structural market drivers (6-tile grid)

What's on screen:

- Baltic Wind Generation: 536 MW · Below 7D avg · interpretation line · source
- Baltic Solar Generation: 206 MW · Below 7D avg
- Baltic System Demand: 3,096 MW · Near 7D avg
- Interconnectors: "Net exporter" (LT) · export chip
- TTF Gas Price: 42.5 €/MWh · gauge · "Elevated"
- EU ETS Carbon: 74.9 €/t · gauge · "High"

Problems:

- **Flat temporal dimension.** Every tile is a point value plus a "vs 7D avg" chip. No shape, no trajectory. A BESS operator cares about *when* spreads open, not just today's wind level.
- **Interconnectors tile duplicates the hero.** The hero map above it already shows cross-border flow and arrow direction. The tile adds "net exporter" status and an export chip — ~90% information overlap with a less legible presentation.
- **Renewable penetration % not shown.** Wind 536 MW + Solar 206 MW means nothing without demand context. The relationship 742/3096 = 24% renewable share is the BESS signal, not the absolute MW figures.
- **No residual load.** Demand minus (wind + solar) = the gap thermal/BESS must fill. This is the canonical "charging window quality" metric and it's nowhere on the page.
- **Gas and carbon gauges are the only tiles with shape.** They work. Everything else reads as a static receipt.
- **Interpretation lines are mechanical.** "Below-average wind — narrowing charging windows" repeats regardless of how far below, how long it's been below, or whether the trend is worsening. Template, not insight.

### 1b. Market intelligence feed

What's on screen:

- Header + section description
- Filter tabs: All / LT / LV / EE geography; All / Competition / Market Design / Project Stage / Policy categories
- 9 items listed: seed items (hardcoded in IntelFeed.tsx) + some live items
- Some items have "Invalid Date" and HTML entity garbage (`&#039;`)
- Some items have raw URLs as titles ("https://www.mckinsey.com/...")
- No source favicons or logos
- No visual differentiation between item types
- No item imagery, thumbnails, or chart embeds

Problems:

- **Data quality failures visible to the reader.** "Invalid Date" and `&#039;` ship to production. This is the single biggest credibility hit on the page — it signals the enrichment pipeline is half-built.
- **No visual hierarchy.** Every item gets the same rectangle. No "featured story of the week" treatment. No weight for 2,000 MW announcements vs. regulatory footnotes.
- **Source credibility unreadable.** A Litgrid-sourced item and a bare URL sit at the same visual weight. There's no signal that one is primary-source official and the other is an uncurated scrape.
- **No temporal rhythm.** Items are sorted by date but the reader can't see cadence — is the market hot this month or quiet?
- **Impact is buried in copy.** Each item has a "whyItMatters" field but it reads as body text, not a callout. An impact chip or magnitude (+582 MWh, −3.5 €/MWh/yr) would make the list scannable.
- **Filter chips work but have no count when active.** Clicking Policy shows 3 items without a clear "3 of 9" signal.
- **"Submit a market lead" CTA is competing with the list.** Good intent, bad placement — it's the last thing the reader sees in the section.

### 1c. Model risk register + Data confidence

Not flagged by you, but worth an honest read because they're on the same page:

- **Model risk register.** Seven MR-XX entries with impact/residual chips. Actually good as a trust surface. Reads as institutional-grade honesty. Keep the content, consider a small visual upgrade: a 2-axis heatmap (impact × likelihood) instead of the two-chip row would make the risk posture scannable at a glance. Low priority.
- **Data confidence panel.** Six rows, dot-scale indicator, HIGH/MED/LOW chip, text description. This is also good — honest data provenance signaling. One improvement: the dots and the chip say almost the same thing; consolidating to either dots-with-label or chip-only would reduce visual redundancy. Low priority.

Verdict: both sections are working. Don't rebuild, polish.

---

## 2. Design principles for the rebuild

Carry forward from ADR-005 and the existing identity:

- Three-font rule holds. DM Mono for UI/data, Unbounded for hero numbers, Cormorant for narrative.
- CSS tokens only. No raw hex or rgba.
- Halftone/cartographic visual language. The new section stays coherent with the hero map above.
- Dark default, light mode parity.

New principles specific to this rebuild:

1. **Every tile earns its square.** If a tile shows the same information as another surface on the page (hero map, another tile), cut it.
2. **Time as a design primitive.** Tiles show at least 24–48h of shape where data permits. Sparklines, micro-charts, small multiples.
3. **Renewable-BESS relationship first.** Wind, solar, demand individually are weak signals. Residual load and spread capture are strong signals. Prioritize composed metrics over raw inputs.
4. **Source credibility readable at a glance.** Every intel item shows source attribution in a way the reader can judge in under a second.
5. **No imagery unless it adds information.** Generic stock photos cheapen the aesthetic. Per-item charts, source logos, or source-provided photos only. If no visual is available, don't fake one.
6. **Fix data quality before adding features.** "Invalid Date" and HTML entity leaks ship higher-priority than any new visualization.

---

## 3. Structural market drivers — proposed rebuild

Current tile count: 6. Proposed: 6 or 7 (swap, don't add clutter). Keep the 3-column grid.

### Tiles to keep (with shape upgrade)

**TTF Gas.** Keep the gauge. Add a sparkline below showing the last 14 days. Keep the P_high floor callout — it's the BESS-relevant interpretation.

**EU ETS Carbon.** Same pattern. Gauge + 14-day sparkline. Keep the combined floor math (gas + carbon → €107/MWh).

### Tiles to replace

**Interconnectors tile → Spread capture tile.**

Why: the hero already shows cross-border flow. The interconnector tile is a duplicate.

What replaces it: a tile showing today's day-ahead spread (peak − trough €/MWh) with a 14-day sparkline, and a "cycle revenue" proxy line showing what a 4-hour BESS would earn at current spreads vs. the 30D median. This is the single most BESS-relevant metric on the page and it's currently invisible.

Data requirement: /s1 endpoint already computes this — check `capture_eur_mwh` or equivalent in S1Card. If not, the worker already has price data, adding the spread calculation is trivial.

**Wind tile → Renewable penetration tile.**

Why: absolute wind MW is weak without demand context. 536 MW wind on a 3,096 MW load is 17%; same wind on a 5,000 MW load is 11% — different BESS implications.

What replaces it: a stacked horizontal bar showing today's Baltic generation mix (wind / solar / thermal / net imports), with the renewable share as the big number. Current: "24% renewable" with the stack beneath. Side annotation: "vs 7D avg 31%" if trending down.

Data requirement: /genload has wind + solar + load. Thermal = load − renewables − net imports. Implicit; needs one small worker helper or frontend calc.

**Solar tile → Residual load tile.**

Why: solar alone is meaningless; residual load = demand − wind − solar is THE BESS charging-window metric.

What replaces it: the residual load number (today's current value, e.g., 2,354 MW) with a 24h hourly shape showing the midday trough. The shape itself is the design — a visible V means "midday charge window open."

Data requirement: requires hourly genload history in KV. Currently `/genload` is a point snapshot. The VPS has PostgreSQL with history — either expose a `/genload/today-hourly` endpoint, or pre-compute the shape in the hourly cron.

**Demand tile → Keep but transform into Peak forecast tile.**

Why: point demand is a worse signal than "when does today's peak hit and how severe."

What replaces it: the next peak's forecast time (e.g., "Peak expected 18:00 · 4,120 MW · +8% vs 7D") with a 48h hourly shape highlighting today's and tomorrow's peaks. Green bands for charge windows, red bands for discharge windows.

Data requirement: day-ahead load forecast. ENTSO-E publishes this. Worker needs a new endpoint or extension of `/genload`. Not trivial but not hard.

### Optional 7th tile

**Nordic hydro balance tile.** Currently S6 (Nordic Hydro) exists as a signal but is demoted and not rendered. Nordic reservoir levels drive Baltic prices more than most operators realize — high Nordic hydro = low Baltic prices = weak spreads. Reviving S6 as a structural driver tile could add real analytical depth.

Lower priority than the four replacements above. Could be a separate phase.

### Summary of structural drivers change

| Before | After | Data work needed |
|--------|-------|------------------|
| Wind MW | Renewable mix stacked bar + % | Small worker calc |
| Solar MW | Residual load + 24h shape | Hourly history in KV |
| Demand MW | Peak forecast + 48h shape | Day-ahead forecast feed |
| Interconnectors | Spread capture + 14D sparkline | Likely already in /s1 |
| TTF Gas | TTF + 14D sparkline | Minor extension |
| Carbon | Carbon + 14D sparkline | Minor extension |

---

## 4. Market intelligence feed — proposed rebuild

### Phase A — Fix data quality (blocker, do first)

- Fix "Invalid Date" parsing. Root cause: the enrichment pipeline emits items without a valid `publishedAt` field. Worker or frontend should reject items without parseable dates rather than rendering "Invalid Date."
- Decode HTML entities (`&#039;`, `&amp;`, etc.). Single-line fix in the item title/summary normalizer.
- Filter out items where the title is a bare URL. Either reject at ingest or re-title via OpenGraph/title-tag scrape.
- Hide items with `sourceName` missing or malformed.

No redesign until this is clean. A polished UI on broken data is worse than current state.

### Phase B — Visual hierarchy

- **Featured item.** First item gets a larger treatment: bigger title, longer summary excerpt, prominent source logo, maybe a relevant chart embed (e.g., for a pipeline announcement, show the pipeline MW delta).
- **Standard items.** Current treatment but tighter: title, one-line summary, source + date, one impact chip.
- **Collapsed items.** Older items (>30 days) collapse to a 1-line entry with title and date only, expandable on click.

### Phase C — Source credibility signaling

- **Source logos/favicons.** Auto-fetch from domain via a small service or pre-bake at ingest. Use monochrome versions to stay consistent with the aesthetic. Fallback: first letter of source name in a colored square.
- **Source type chip.** Primary-source (official: Litgrid, AST, Elering, ENTSO-E, ACER) vs. trade press vs. company announcement vs. uncurated. The current confidence field could drive this.
- **"Official" badge.** For primary-source items. Cheap trust signal.

### Phase D — Impact readability

- **Magnitude chip.** Where the item has a numeric impact (e.g., "+582 MWh", "−3.5 €/MWh/yr"), extract it into a chip next to the category chip.
- **Why it matters → pull quote.** Instead of body text, render `whyItMatters` as a small pull quote with a vertical rule — visually distinct from the summary.
- **Reference asset impact line.** If present, always render with a consistent icon/prefix so the reader learns to look for it.

### Phase E — Temporal rhythm

- **Timeline strip above the feed.** A thin horizontal bar showing item density by week for the last 12 weeks. Clicking a bar filters to that week. Gives the reader an immediate read of "is the market active right now."
- **Relative dates.** "2 weeks ago" is easier to scan than "28 Mar" for recent items. Absolute dates for items >90 days old.

### Phase F — Filter ergonomics

- Filter chips show counts always: "Competition 4" is already there in the current UI — keep it.
- Filter counts update instantly on geography toggle.
- Active filters shown as a removable chip row above the feed.
- "Clear filters" when any are active.

### What NOT to do

- **No stock photos.** Do not add generic storage/battery imagery to every item. That cheapens the site.
- **No emoji icons.** Categories already use text labels with color; stay consistent.
- **No infinite scroll.** Pagination or show-more is fine. Infinite scroll breaks the "this is a considered intelligence surface" feel.

---

## 5. Model risk + Data confidence — polish only

### Model risk register

Keep the content. Consider:

- Shift from two-chip layout (Impact + Residual) to a 3×3 heatmap thumbnail per risk (low/med/high × likelihood/impact). Scannable at a glance.
- Make each MR-XX row clickable → drawer with longer explanation and what would change the risk.

Priority: low. Can slip.

### Data confidence panel

Keep the content. Consider:

- Drop either the dot scale or the HIGH/MED/LOW chip — they duplicate.
- Add "last reviewed" date per row so the reader knows provenance grades are maintained, not stale.
- Make each row clickable → drawer with methodology and source links.

Priority: low. Can slip.

---

## 6. Data requirements summary

| Requirement | Source | Effort | Blocking what |
|-------------|--------|--------|---------------|
| Hourly genload history (today's shape) | ENTSO-E + worker KV write on each cron | Medium | Residual load tile, peak forecast tile |
| Day-ahead load forecast | ENTSO-E forecast API | Medium | Peak forecast tile |
| 14-day spread history | Already in /s1 likely | Small | Spread capture tile, gas/carbon sparklines |
| Source favicons | Third-party favicon service or pre-bake | Small | Intel feed source signaling |
| HTML entity + date normalizer | Worker enrichment pipeline | Small | Intel feed phase A |
| Item magnitude extraction | Worker enrichment pipeline (existing field) | Small | Intel feed phase D |

---

## 7. Phased rollout proposal

### Phase 3A — Data quality cleanup (1 session, ~60 min)

Fix "Invalid Date", HTML entity leaks, bare-URL titles in IntelFeed. Ship nothing new — just fix what's visibly broken. This is a Bucket 2 task essentially.

### Phase 3B — Structural drivers v2: new tile set (1 session, ~90 min)

Replace Wind/Solar/Demand/Interconnectors tiles with Renewable mix / Residual load / Peak forecast / Spread capture. Add sparklines to Gas and Carbon. Requires worker work for residual-load history (can be deferred with a snapshot-only v1 first).

Risk: residual load and peak forecast tiles need new data pipelines. Consider a v0 that renders snapshot-only (no shape) to validate the layout, then a v1 that adds shape once data exists.

### Phase 3C — Intel feed rebuild: hierarchy + source signaling (1 session, ~90 min)

Implement Phase B (visual hierarchy) and Phase C (source signaling) after Phase 3A data quality is done. Leaves D/E/F for a follow-up.

### Phase 3D — Intel feed polish: impact chips, timeline, filter UX (1 session, ~60 min)

Phases D/E/F from section 4.

### Phase 3E — Trust surface polish (1 session, ~45 min)

Model risk heatmap and data confidence drawer upgrades. Lowest priority, skip if time-constrained.

Total: 4–5 sessions if done serially. Phases can run out of order if data dependencies force it (e.g., Phase 3C unblocked while 3B waits on worker data work).

---

## 8. Open questions for Kastytis

1. **Business priority weighting.** Is Bucket 3 more about (a) investor-facing polish for conversations, (b) operator-facing analytical depth for dispatch decisions, or (c) credibility signaling for prospects evaluating KKME as an intelligence provider? The answer changes which phase goes first.

2. **Residual load tile worth the data work?** The hourly history pipeline is a non-trivial build. If you don't actually want residual-load-with-shape, the Solar tile could just become a "Renewable share" variant of the mix tile, skipping the new data pipeline.

3. **Source favicons — how far to go?** Options: (a) simple letter squares, (b) auto-fetched favicons via Google's favicon service (no new infra, slight privacy leak), (c) pre-baked monochrome SVG logos for the top ~20 sources (more work, cleaner aesthetic). Recommendation: (a) first, migrate to (c) for the top sources over time.

4. **Featured intel item — who picks?** Auto-picked by recency + impact score? Manually curated by you? Mix (manual override, default to algorithmic)? Affects the enrichment pipeline design.

5. **Nordic hydro revival (S6) — in or out of Bucket 3?** Could add a 7th tile with real analytical value. Adds scope. Gut check: keep out of Bucket 3, consider for Bucket 4.

6. **Model risk and Data confidence — polish or skip?** If Bucket 3 should be lean, drop Phase 3E entirely and revisit only if something breaks the trust surface.

---

## 9. Recommendation

Sequence:

1. **Phase 3A (data quality)** first and immediately. It's Bucket 2 work masquerading as Bucket 3 but fixing it unblocks everything else and removes visible embarrassment.
2. **Phase 3B (structural drivers v2)** next. High-leverage, visible impact. Start with v0 (no shape) if worker data isn't ready.
3. **Phase 3C (intel feed hierarchy + source signaling)**. Biggest visual-quality jump.
4. Phases 3D and 3E as fill-in work if time allows before a pivot to new territory.

Approve this direction, push back on specific calls, or redirect priorities. After agreement, I'll write the Phase 3A prompt for a Claude Code session.
