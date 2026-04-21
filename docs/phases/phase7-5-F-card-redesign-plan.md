# Phase 7.5 — Intervention F: S1/S2 card face redesign

**Written:** 2026-04-21
**Updated:** 2026-04-21 (user decisions: worker-first, interpretations to drawer)
**Status:** Plan signed off — awaiting CC kickoff
**Branch target:** two stacked branches — see §7 sequencing
**Estimated effort:** 1 combined CC session (~30 min worker + ~2.5 h face redesign, with pauses between)
**Dependencies:** Phase 7.5-worker (LV/EE monthly backfill) must ship first

---

## 1. Why this exists

User reviewed the post-regression-fix cards (screenshots 2026-04-21) and flagged seven
distinct issues. Paraphrased and triaged:

- **Live-data feeling absent.** Nothing tells the reader data was just pulled. No
  pulse, no prominent "updated 2m ago", source chip buried at the bottom.
- **Repetition.** Hero metric is restated in the interpretation sentence
  ("Today's gross 2h capture is €141/MWh, sitting p50–p75…"), then again in the
  percentile row. Three surfaces saying the same number.
- **Under-visualised.** Single 120px sparkline per card, no interaction beyond
  tooltip-on-hover. Hero metric is decorative, not a handle.
- **S2 country asymmetry.** API ships `activation.lt`, `.lv`, `.ee` per-country,
  but UI lets you switch aFRR/mFRR/FCR and not LT/LV/EE. User correctly reads
  this as weird UX.
- **Explanations in wrong place.** Narrative prose sits on the face where density
  and glyphs belong; drawer is thin where narrative belongs.
- **"Review previous work for inspiration."** Explicit ask.

Pre-Phase-7 archaeology (git show `f79deb9`) turned up patterns we lost in the
rebuild:

- S2 had **dual-metric hero** — aFRR and mFRR side-by-side, coloured left-borders
  (teal / amber), activation-rate % inline, MoM delta in ±€ against previous
  month, 6-month median shown beneath latest.
- S1 had **monthly capture table on the face** plus charge/discharge summary.
- Drawers used `useState` drawer-key pattern to support scroll-to-anchor from
  chips elsewhere on the page.

S4 (untouched, still good) already has the **LT/LV/EE segmented tab** we need,
with installed-MW chip per country — reuse directly.

A data-availability finding drives the sequencing:

- Worker stores `activation.lt_monthly_afrr` and `activation.lt_monthly_mfrr`
  (monthly P50 trajectories, Oct 25 → Mar 26).
- Worker does **not** store `lv_monthly_*` or `ee_monthly_*`. LV/EE only get the
  6-month aggregate snapshot (`activation.lv.afrr_p50`, `.ee.afrr_p50`).
- `/s2/history` returns aggregate Baltic-wide daily, not per-country.

**Decision (2026-04-21):** fix the worker first so the country toggle ships
with real per-country history. No footnote apology, no asymmetric UI. Phase
7.5-worker runs as a prerequisite CC session before F.

---

## 2. Scope — four interventions, each its own commit

### F1 — Live-data signal

**Problem.** Reader cannot tell if the data is 30 seconds old or 3 hours old.
Source attribution is at the bottom under the chart.

**Change.**

- **Top-right status glyph**, next to the header row. A `.pulse-dot` at 6px
  (teal) animating on the existing `live-pulse` keyframe (already in
  `globals.css` line 481). Sits next to the "X m ago" timestamp.
- The "X m ago" becomes a larger, primary-weight read. DM Mono 12px,
  `var(--text-primary)`, not muted grey.
- Hovering the dot opens a tiny popover: refresh cadence
  ("polls every 5 min"), last-fetched absolute time, source URL.
- Source attribution (`energy-charts.info`, `BTD`) moves from `SourceFooter` at
  bottom to an inline chip next to the timestamp at top. `SourceFooter` stays
  for full legal/methodology line.
- When a `useSignal` fetch is in flight, dot colour flashes amber for 300ms to
  confirm the pipeline is alive. Lift the pattern `HeroBalticMap.tsx:611`
  already uses.

**Why.** The first thing an investor should read is "this is live, from these
TSOs, 2 minutes old." It's branding as much as information.

### F2 — Move interpretations off the face entirely

**Problem.** S1 face currently carries:

1. Hero: `€141 /MWh`
2. Sentence: "Today's gross 2h capture is €141/MWh, sitting p50–p75 of the rolling 30-day distribution."
3. Percentile row: `mean p25 p50 p75 p90` as tiles.

The sentence restates (1) and prose-wraps (3). Delete it — and don't replace
it with chips. The percentile row already carries that information.

**Change S1.**

- **Delete** the percentile-band interpretation paragraph entirely (lines
  132–141 of `S1Card.tsx`). No replacement on the face.
- The content migrates verbatim into the drawer's new "How we compute this"
  section (see F4), expanded with methodology context — not lost, relocated.
- Keep the **impact line** ("At a 100 MW / 2h plant, today's gross capture
  implies €X/day of arbitrage optionality.") — this is translation, not
  interpretation. Hero in €/MWh, impact in €/day — different units, different
  stakeholder read.

**Change S2.**

- **Delete** the interpretation paragraph (lines 182–200 of `S2Card.tsx`)
  entirely. The imbalance-mean/p90/% context it currently carries migrates to
  a **micro data-row** under the hero (same visual treatment as S1's percentile
  row): three tiles — `imb. mean`, `imb. p90`, `% >100 MWh`. Glyphs not prose.
- The current interpretation text migrates to the drawer alongside S1's, per
  F4.
- Keep the impact line for aFRR.

**Why.** "Clean more animated, better designed clickable data up front and
more explanation in the detail" — user's own words. The face becomes a
dashboard of glyphs and handles. The drawer becomes the briefing.

### F3 — Country toggle on S2 (UX symmetry)

**Problem.** Product toggle exists (aFRR/mFRR/FCR). Country toggle does not.
Per-country snapshot exists in the payload; per-country history will exist
after Phase 7.5-worker backfill (see §7).

**Change.**

- Lift the exact segmented-control pattern from `S4Card.tsx:374–399` — three
  buttons `LT / LV / EE`, mono 11px, teal border on active. Add an installed-MW
  chiplet next to each (reads from S4 fleet state if available, else hide).
- Default: `LT` (richest product mix, including mFRR).
- On toggle, the following surfaces re-key:
  - Hero metric swaps to selected country's `activation.{cc}.afrr_p50` (or
    `.mfrr_p50` when mFRR product is active).
  - Activation-rate chip uses `.afrr_rate` / `.mfrr_rate` for that country.
  - **Sparkline** re-keys to `lv_monthly_afrr` / `ee_monthly_afrr` when selected
    (newly available after Phase 7.5-worker). `/s2/history` may also need a
    per-country variant — worker phase decides.
  - Drawer "9-day BTD averages" table filters to the country.
- Product toggle and country toggle sit on the **same row**, divided by a
  hairline `var(--border-subtle)` separator. Mono 11px scale, same button
  treatment.
- If a `(product, country)` combination has no data (e.g. mFRR for EE), show
  the tile disabled with a muted `n/a` glyph — honest about real gaps, not
  apologetic about implementation gaps.

**Why.** Symmetry is a real UX signal — a missing toggle reads as "this feature
isn't finished yet" even when it's a data-availability limit. Post-worker,
the symmetry and the data are both real.

### F4 — Clickable data up front, narrative in drawer

**Problem.** Drawer today holds monthly chart + methodology table. Face holds
prose. User wants the inverse.

**Change — face.**

- Percentile tiles become **buttons**. Click `p50` → scrolls the 30-day
  sparkline to highlight the p50 reference line (already drawn, currently
  inert). Click `p90` → same with an amber overlay. `esc` clears.
- Hero metric is **clickable** — opens drawer scrolled to "Methodology: how
  gross capture is computed." Cursor: pointer. Subtle underline on hover.
  Matches the pre-Phase-7 `onClick={openDrawer}` pattern on the header H3.
- Sparkline gets **series-selection**. Clicking a day pins its crosshair,
  updates a small "[selected] Apr 14: €112/MWh, swing €58" readout below the
  chart. Click elsewhere to unpin. Reuses existing tooltip data.

**Change — drawer.**

- Rename from "Monthly + Gross→Net bridge" to "Reading this card" or
  "Methodology & history." Four sections, scrollable anchors:
  1. **What this is.** The interpretation content lifted directly from the
     current face prose — "Today's gross capture is €X, sitting p50–p75 of the
     rolling 30-day distribution." This is where the user's dashboard-reading
     commentary lives.
  2. **How we compute this.** 4–6 sentences of methodology that doesn't exist
     anywhere on the site today: gross vs net, why 2h/4h, RTE loss convention,
     why data ends at T-1, source provenance.
  3. **Monthly trajectory** — existing `MonthlyChart`, untouched.
  4. **Gross → Net bridge** — existing `BridgeChart`, untouched.
- For S2 the drawer mirrors: What this is → How we compute → Monthly capacity
  chart → BTD context table.
- Drawer `open()` accepts an anchor: `openDrawer('what')`, `openDrawer('how')`,
  `openDrawer('monthly')`. Same pattern as pre-Phase-7 (`drawerKey`).
- When a user clicks the hero metric, drawer opens at `what`. When they click a
  percentile tile, drawer opens at `what` scrolled to the percentile para.
  When they click a methodology glyph, drawer opens at `how`.

**Why.** The face becomes a dashboard; the drawer becomes the briefing. User's
exact words: "clean more animated, better designed clickable data up front and
more explanation in the detail."

---

## 3. Pause points

- **Pause 1** — after F1 (live-data). Screenshot the updated header. User signs
  off on pulse-dot intensity and whether source moves to top-chip (non-trivial
  visual shift).
- **Pause 2** — after F2 (prose strip). Before committing, user reviews the
  descriptor-chip treatment — this is the most opinionated change and benefits
  from a look.
- **Pause 3** — after F3 (country toggle). User verifies LV/EE-mode renders
  correctly with the thinner data payload, and that the "monthly history
  queued" footnote is legible and not apologetic.
- **Pause 4** — after F4, before PR. Full mouse-around on a live build.

---

## 4. Non-scope (for F — worker scope is §7)

- Do **not** touch the 30-day sparkline visual treatment beyond adding
  click-to-pin and per-country re-keying. Chart polish is deferred to
  Intervention B-E per original 7.5 scope.
- Do **not** change refresh cadence. `REFRESH_HOT` and `REFRESH_WARM` stay as
  they are — F1 only surfaces what already happens.
- Do **not** extend this to S3/S4/S5. They have their own density profiles and
  different data shapes; card-face patterns will cascade naturally once S1/S2
  ship.

---

## 5. Verification checklist

**Automated:**

- `npm run build` passes.
- `npm run lint` passes.
- `grep -n "sitting" app/components/S1Card.tsx` returns zero matches
  (confirms percentile sentence is gone from face).
- `grep -n "capacity clearing at" app/components/S2Card.tsx` returns zero
  matches (confirms S2 restatement is gone from face).
- `curl .../s2 | jq '.activation | keys | map(select(startswith("lv_") or startswith("ee_")))'`
  returns non-empty (confirms worker backfill landed).

**Manual (Chrome MCP):**

- Pulse dot visible in top-right of both cards, pulse animation running.
- "X m ago" is primary-weight, not muted grey.
- Source chip shows next to timestamp with correct attribution per card.
- S2 country toggle is visible. Clicking LV updates hero to `€13.6` (current
  value). Clicking EE updates to `€13.2`.
- S2 country toggle preserves product selection across switches.
- S1 hero click opens drawer scrolled to methodology section.
- S1 percentile tile click highlights corresponding line on sparkline.
- S2 country toggle shows footnote glyph next to sparkline header.
- Keyboard: `Tab` cycles through toggles and percentile tiles in reading
  order; `Enter` activates.
- Screen-reader: pulse dot has `aria-label="Live data; last update X minutes ago"`.
- Dark + light themes both verified.
- Screenshots saved to `docs/visual-audit/phase-7-5-F/`.

---

## 6. End-of-session updates

- Move Phase 7.5-worker and F from queue to "What's shipped" in `docs/handover.md`.
- Add Session entries for both CC sessions.
- Notion board: close Phase 7.5 F task, close 7.5-worker task.

---

## 7. Sequencing — two CC sessions, worker first

### 7a. Phase 7.5-worker (NEW, prerequisite)

**Branch:** `phase-7-5-worker-lvee-monthly` off `main`.
**Scope:** Expose `lv_monthly_afrr`, `lv_monthly_mfrr`, `ee_monthly_afrr`,
`ee_monthly_mfrr` in the S2 API payload, plus `mfrr_p50` / `mfrr_rate` on
the LV and EE snapshot objects.
**Finding from investigation:** `computeS2Activation()` already computes per-
country monthly stats for all three countries (see `COUNTRY_COLS` at
~line 3808 and the monthlyData aggregation loop at ~line 3814–3877). The data
is there; it's just not surfaced in the two payload-assembly call sites.
**Deliverable:** Same schema shape as current LT, replicated to LV/EE.
**Effort:** ~30 min (one CC session, ~10 lines of code across two call sites).
Touches `workers/fetch-s1.js` only; no frontend changes.
**Verification:** `curl .../s2 | jq '.activation | keys'` includes
`lv_monthly_afrr`, `ee_monthly_afrr`; values arrays non-empty for Oct 25 →
latest month.

### 7b. Phase 7.5-F (this plan)

**Branch:** `phase-7-5-F-card-redesign` off `main` after 7.5-worker merges.
**Scope:** F1–F4 as described above, with real per-country history available.
**Effort:** ~2.5 h (one CC session).

### 7c. Remaining 7.5 interventions B-E re-ordered

Interventions B–E from the original Phase 7.5 prompt (chart polish, motion,
drawer UX, mobile tuning) all operate on the **surfaces this redesign
restructures**. Shipping B–E first means polishing a face about to be
demolished. Shipping F first means B–E operate on the new structure.

New order:

- Phase 7.5-worker (§7a)
- F (§7b) — card-face redesign
- B — chart tooltip/motion polish (now operates on F4's selectable sparkline)
- C — drawer UX (now operates on F4's anchored-section drawer)
- D — motion polish (applies to F1's pulse + F4's click transitions)
- E — was mobile tuning; defer to Phase 9 (mobile pass) as originally scheduled

This keeps 7.5 scope-coherent without expanding the branch's total commit count.
