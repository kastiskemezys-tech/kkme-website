# Phase 36.F arc — Bank-grade automated report generator

**Owner:** Cowork-authored 2026-07-29. Operator-owned (rule #5).
**Directive:** enter site, location, project details → full analysis + forecast runs → a beautiful, bank-credible PDF with KKME branding, light or dark mode, strict data-visualisation discipline, and copy that reads human and passes AI-detection — usable by a bank credit committee approving financing or an analyst evaluating a funded asset.
**Position in the stack:** the output layer — and **the LAST phase of the whole programme, by operator decision 2026-07-29: content first.** Runs only after 36.D (demand) and the full 36.E arc (per-service models) have shipped, so every report section lands on final models. No interleaving.

---

## The four hard problems, and the answer to each

### 1. Charts that survive a credit committee
**Answer: a purpose-built SVG chart kit, not a charting library.** The site already hand-builds SVG; libraries fight the design system and produce library-looking output. A `chart-kit` module family with shared primitives (axes, gridlines, scales, annotations, typography, theme tokens) and one module per chart type actually needed — roughly 10: percentile fan (P50/75/90/99 bands over years) · bridge waterfall · 20-yr cash flow with CAPEX events · scenario comparison · sensitivity tornado · dispatch sample-day (SoC + price) · monthly heatmap · saturation/fleet trajectory · spread-duration curve · contracted-floor truncation. Every chart is deterministic (same data → identical SVG), which makes chart-level QC gates possible (hash the rendered data path against the runner JSON).

**The codified dataviz rules (enforced by the kit, not by discipline):**
- Every chart carries title, units, axis labels, source line, and run_id — structurally required arguments, not optional props
- No 3D, no shadows, no gradient fills, no decorative color; sentiment palette is semantic and consistent across every chart
- Maximum data-ink: hairline grids, annotation-over-legend wherever the chart allows
- Tabular numerals everywhere; consistent scale conventions (€M vs €k declared once per report, never mixed within a section)
- **Grayscale survival:** banks photocopy. Every chart must remain readable printed B/W — encode meaning redundantly (pattern/weight/position, never color alone). This is a per-chart test: render → desaturate → assert distinguishability
- Colorblind-safe check on the palette pairs used for adjacent series
- Print-safe stroke weights (≥0.75pt at A4), minimum 7.5pt text in charts

### 2. Design that is beautiful AND bank-appropriate
**Answer: two full themes on one layout system, print-first.**
- **Light = the Baltic birch identity** (the client-approved deliverable design: birch #EAE3D2, tobacco, amber #C8801C, Fraunces + JetBrains Mono). Print-optimal, credit-committee default.
- **Dark = the kkme.eu site identity** (near-black, cream, teal/amber/rose, Newsreader + IBM Plex Mono). For screen presentation and consistency with the site when the report is shown alongside it.
- One selectable `theme` parameter; every token referenced through the theme layer; both themes rendered by CI on every build so neither rots.
- Layout system: A4 portrait (landscape exceptions per-section where a table demands it), 12-column grid, defined margins, 9-step type scale adapted to print, running footer (KKME wordmark · report title · page N of M · run_id), section numbering, cover page with logo + project + date + confidentiality line, widow/orphan control, page-break discipline per section.
- Logo: proper vector treatment of the KKME wordmark in both themes (this finally forces the long-parked "vector logo cleanup" candidate — the embedded-PNG SVGs won't survive print scaling).

### 3. Copy that reads human and passes AI checks
**Answer: no per-report generation at all. A fixed, human-authored copy deck.**
This is the structural solution, not a prompt trick: every sentence in the report exists in a **master copy deck** written once and edited by you (operator review is the phase gate — you rewrite anything that smells wrong until it's your voice). Reports are assembled from that deck with computed values injected and **rule-based conditional variants** selecting phrasing (e.g., the IRR paragraph has three human-written variants: inside benchmark range / above / below — the engine picks, never writes). Properties this buys:
- Deterministic: same inputs → identical prose. Auditable like code.
- AI-detection: the text is literally human-authored (your edited voice), not generated — there is nothing for a detector to catch, and it tests as such
- Consistent register across every report KKME ever issues — an underrated credibility signal when a bank sees your second and third deals
- KKME voice discipline holds by construction: numbers first, terse, no editorial adjectives — the deck is written to the existing voice rules
- The deck is versioned; changing a sentence is a changelog event like changing an assumption

### 4. Credible to the people who say no for a living
**Answer: the report structure mirrors what a lender's technical advisor produces, and every number carries provenance.**
Section architecture (drawing on DNV/AFRY revenue-study conventions + everything 36.B built):
1. Executive summary — verdict-first: the three numbers, the percentile table, benchmark position
2. Asset description — site, location (map inset from our fleet DB), grid connection (POI, permit numbers from the VERT data — auto-enriched), technology parameters
3. Market context — Baltic structure, the TSO demand forecast (36.D, with the Litgrid reconciliation), fleet/saturation position (36.E)
4. Methodology summary — 2-3 pp distilled from methodology-lender.md, which is referenced as the full companion document
5. Revenue analysis — per-service (36.E structure), P50/P75/P90 with the stated resolution boundaries, measured-vs-assumed ledger
6. Scenarios & sensitivity — driver panels, tornado, structurally-meaningful scenario definitions
7. Contracted structures — floor/toll cases and their tail effects (36.B4)
8. Risk factors & limitations — the honest list, mandatory, never trimmed (the section that builds trust with exactly this audience)
9. Appendices — assumption register extract, reconciliation results, 20-yr tables, glossary
10. Provenance page — run_id, engine version, data vintages, register version, generation timestamp, reproducibility statement

Every page footer carries the run_id (36.B6 registry); the provenance page makes the reproducibility claim explicit: *"every figure in this report regenerates identically from run `<id>`"* — a sentence no incumbent consultant can print.

---

## Input flow (the "enter site, location, details" experience)

```
INTAKE CHECKLIST (below) — filled per engagement, completeness scored
  → auto-enrichment: match against fleet DB (VERT permit, Litgrid POI/allowance,
    zone, coordinates for the map inset — Phase 33's data pays off here)
  → operator confirms/overrides enriched fields
  → pipeline: engine → hourly dispatch → percentiles → scenarios → sensitivity
    → reconciliation (all existing runners, orchestrated)
  → composer: copy deck + chart kit + theme → HTML
  → Playwright print → PDF (theme choice, A4)
  → QC gates → delivery folder + registry entry
```

## The intake checklist (the tailoring instrument)

A structured per-engagement checklist the operator works through before generation. Every item carries: required/optional flag · which report sections it improves · the default-with-disclosure used if missing. **The report itself states which inputs were provided vs defaulted** — incomplete intake degrades gracefully AND transparently (a bank seeing "availability: manufacturer-standard default, project guarantee not provided" knows exactly what to ask for — that transparency is itself bankability). A completeness score gates the operator's send decision, not the generation.

**A · Identity & permits** *(auto-enrichable from fleet DB)*
- [ ] Project name + SPV legal name — req · cover, asset description
- [ ] Location: address / coordinates — req · map inset, asset description
- [ ] VERT permit number(s) + dates — req · asset description, provenance
- [ ] Grid-connection reference (Litgrid/DSO agreement) — opt · grid section, credibility

**B · Technical**
- [ ] MW / MWh nameplate (+ AC/DC clarity) — req · everything
- [ ] RTE datasheet value @ POI — opt · dispatch (default: engine calibration, disclosed)
- [ ] Warranty terms: EFC/yr cap, years, SOH floor, availability guarantee — opt · degradation + CAPEX schedule (default: standard Tier-1, disclosed)
- [ ] OEM / chemistry — opt, NDA-sensitive · asset description (omittable without penalty)
- [ ] Auxiliary consumption — opt · dispatch (default: engine calibration)

**C · Grid**
- [ ] POI voltage + connection capacity import/export — req if differs from nameplate · dispatch constraints
- [ ] Grid agreement status + any curtailment terms — opt · risk section
- [ ] Tariff category (NUS) — opt · cost decomposition (default: standard, disclosed)

**D · Commercial**
- [ ] Target COD (month precision) — req · staggering, Y1 pro-rating
- [ ] Optimiser/BRP arrangement + fee structure if known — opt · cost decomposition (default: 12 % market range, disclosed — a real fee sharpens EBITDA materially)
- [ ] Contracted revenues: floor/toll terms if any — opt · contracted-structures section (absent = fully-merchant presentation)
- [ ] Insurance arrangements — opt · cost decomposition

**E · Audience & purpose** *(shapes presentation, not computation)*
- [ ] Report purpose: financing approval / equity IC / operating-asset evaluation — req · exec-summary framing, which percentile leads (P90 for debt, P50 for equity, backtest-vs-actuals for operating assets)
- [ ] Recipient type: bank credit committee / fund / internal — req · methodology depth, appendix selection
- [ ] WACC / hold-period preferences if the client has house conventions — opt · NPV presentation (default: 8 % / 20 yr, disclosed)

**F · Presentation**
- [ ] Theme: light (print/credit-committee default) / dark (screen) — req
- [ ] Confidentiality line + distribution list — req · cover
- [ ] Client co-branding (name/logo on cover alongside KKME) — opt
- [ ] Deadline + delivery format (PDF only / + Excel model / + methodology companion) — req

Checklist ships as: a versioned schema (`intake-schema.json`), a fillable form in the portal flow (F4), and a plain markdown copy for offline/email use with clients. Section E is the tailoring pivot — the same analysis presents differently to a lender than to an equity committee, and the copy deck carries the conditional variants for each purpose.

## QC gates (all automated, all blocking)

- **Number consistency:** every figure in the rendered HTML greps back to the runner JSON exactly (the 34.7 gate, generalised)
- **Chart integrity:** each chart's embedded data hash ties to its runner source
- **Layout:** no page overflow, no widowed section heads, both themes render, page count within section budgets
- **Copy:** deck-version pinned; no unresolved placeholders; style lint (banned-word list enforcing the voice rules — "genuinely", "exceptional", editorial state labels…)
- **Grayscale test:** rasterise → desaturate → per-chart contrast assertions
- **Provenance:** run_id present on every page footer + provenance page complete

## Phasing

| Phase | What | Gate | Est. |
|---|---|---|---|
| **36.F0** | Print design system + chart kit (10 chart modules, both themes, logo vector cleanup, layout system) | **Visual checkpoint — operator approves rendered samples of every chart type in both themes before anything else builds** | 2-2.5 d |
| **36.F1** | Copy deck — full master prose + conditional variants, assembled report skeleton | **Operator editing pass — you rewrite until it's your voice; that pass IS the anti-AI guarantee** | 1.5 d (half of it yours) |
| **36.F2** | Composer — input spec, fleet-DB auto-enrichment, pipeline orchestration, section renderers | continuity vs 34.7's output on the Prosperus fixture | 2 d |
| **36.F3** | PDF production + the QC gate battery | all gates green on reference + Prosperus fixtures, both themes | 1.5 d |
| **36.F4** | Portal/calculator integration (form → enrich → confirm → generate → download) + registry stamping | end-to-end from form to PDF | 1 d |

~8-9 days. F0+F1 are operator-taste-heavy (checkpoints, not autonomous) and can interleave with 36.E's autonomous batches. F2-F4 run after E6 so the market-context and per-service sections land on final models.

## What this replaces / retires
- 34.7's template-substitution generator (served its purpose; the composer supersedes it)
- The "designer-polished PDF" line item in the Path-to-Bankable Stage 3 — it becomes automatic, which upgrades the pitch: *every* KKME report is designer-grade, not a premium add-on

## Standing rules
- **`docs/playbooks/failure-modes.md` is load-bearing for every batch prompt in this arc** — the four Pause-A questions embedded per phase. Particular exposure: B2 (green-but-broken is THE risk class for layout/PDF work — the QC gate battery exists because component tests cannot see pages), A10 (the composer touches many files; consumer-checks before every destructive step), B7 (QC gates in separate commits from the composer they gate).
- Rule #4: chart kit + copy deck + themes are single-source; the site, the calculator, and the reports draw from the same token definitions
- Rule #6: no editorial state labels anywhere, including chart annotations — the copy-deck style lint enforces it mechanically
- Visual checkpoints are operator gates (35.3 lesson: aesthetics are the operator's judgment, not CC's)
- NDA: fixture projects are the public-register Prosperus configs; client technical documents stay in docs/_private/
