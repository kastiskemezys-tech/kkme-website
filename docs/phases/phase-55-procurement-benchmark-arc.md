# Phase 55 — the procurement benchmark engine (PBE)

**Governance:** `_autonomous-run-charter.md`. Autonomous, ~8-10 sessions.
**Everything lives under `docs/_private/pbe/`.** The corpus is NDA-bound. Nothing about it reaches a tracked file, ever.

**The proposition.** KKME has seen supplier quotations, technical proposals, warranty schedules, LTSAs, EPC and optimiser agreements across multiple Baltic BESS procurements. Nobody else in this market has that corpus. TSO feeds are public and any competent competitor could rebuild the fleet database in a quarter; **they cannot rebuild this.** The engine turns it into an answer to the question a developer will pay for within two hours of asking it: *is this quote market, and where exactly is it not?*

---

## The corpus, and the rule that protects it

Source: `~/Documents/KKME/01_Deals/**` and the private folders already under `docs/_private/`. **READ-ONLY.** Copy into `docs/_private/pbe/corpus/` with a manifest; never move, rename, edit or reorganise anything in the source tree — its own CLAUDE.md forbids it and it has been damaged once.

**Publication rule, absolute:** supplier names, client names, project names and any single contracted figure stay private. What may ever leave: **bands over n ≥ 5 records**, with n disclosed and no attribution. A band that could be reverse-engineered to a single quote is not a band.

---

## 55.0 — Corpus intake and inventory

Crawl read-only. Catalogue every document: supplier (pseudonymised at intake — `SUP-A`…`SUP-G`, mapping in a single gitignored key file), document type (quotation / technical proposal / warranty schedule / LTSA / EPC / O&M / optimiser agreement / correspondence), date, revision, format, and page count. Output: `corpus-manifest.json` + a coverage table by supplier × document type × year.

**Deliverable that matters:** the honest gaps. Which suppliers have commercial terms and which are technical-only; which years are represented; where a revision chain exists (V1 → V1.1 → V2) and where a single snapshot stands alone.

## 55.1 — Extraction pipeline

PDF, XLSX and DOCX → structured line items. **Two independent methods per document** (e.g. text-layer parse and table-structure parse; OCR only where there is no text layer), cross-checked field by field. Agreement → `confidence: high`. Disagreement → `disputed`, both values retained, never silently resolved.

Every extracted value carries: source file, page or sheet+cell, method, confidence. **A number without a locator is not extracted, it is asserted** — reject it.

## 55.2 — Normalisation: the hard modelling, and the phase's real value

Raw quotes are not comparable. Build one canonical record per quote by resolving:

- **Scope boundary** — what is in and out: DC blocks, PCS, transformers, MV/HV, EMS/SCADA/PPC, civils, installation, commissioning, spares, first-fill, freight, duties. A €/kWh number without its scope vector is meaningless, and this is where most comparisons quietly lie.
- **Incoterms and delivery basis** — DDP vs DAP vs EXW, and what moves between them.
- **Currency and FX date** — the rate and the date it was struck, not today's rate.
- **Energy basis** — nameplate vs usable vs BOL vs EOL, and at what temperature and C-rate. The single most common apples-to-oranges in this market.
- **Warranty and performance** — capacity retention curve, cycle limit, throughput limit, availability guarantee, degradation remedy, augmentation assumption and who pays.
- **Commercial terms** — payment schedule, LD regime and caps, bank guarantees (advance/performance/warranty) as % and duration, liability caps, termination.
- **Time value** — quotes from different years are not comparable at face value; record the quote date and hold real-vs-nominal explicitly.

Output: `canonical-quotes.json`, one record per quote-revision, every field carrying provenance and confidence. **Where a quote cannot be normalised without an assumption, the assumption is a named field with a default, not a silent adjustment.**

## 55.3 — Benchmark bands

Per parameter, per year, per technology class: P10 / P25 / P50 / P75 / P90 with n disclosed. Bands only where n ≥ 5; below that the parameter reports `insufficient sample` and says how many it has. Where the sample is thin, say so at the point of use rather than in a footnote.

Cross-check every band against public evidence where any exists (BNEF-style published price indices, tender results, the mature-market evidence base) — **not to calibrate, but to detect when our sample is unrepresentative.** A private band that disagrees with every public index is a finding about our sample.

## 55.4 — The clause library and the review engine

Extract commercial and technical clauses into a comparable library: LD rate and cap, availability guarantee, degradation remedy, response-time obligations, grid-code compliance undertakings, IP and software terms, assignment, change-in-law, force majeure. Position each against the band.

Then the review engine: given a new quote or contract, produce **the deviation list** — parameter, this quote's value, the band, the percentile, the severity, and the negotiating point. Reuse the existing `kkme-agreement-review` skill's structure rather than inventing a second one (rule #4).

## 55.5 — The deliverable

Two outputs, both built on the report factory's shell (Phase 56) once it exists, and on a plain template until then:

1. **Quote assessment** — where this offer sits against market, parameter by parameter, with the scope-normalisation shown so the reader can see what was adjusted and why.
2. **Negotiation memo** — the prioritised deviation list with fallback positions, in the register the agreement-review skill already uses.

Both must be produceable in under an hour from a new set of documents. That is the product.

## 55.6 — Evaluation and governance

- **Ground-truth set:** hand-verify a stratified sample of extractions (every supplier, every document type) against the source PDF, by locator. Report precision and recall per field type. **Threshold for "perfected": ≥ 95 % on commercial figures with locators, and zero silent resolutions of disputed fields.**
- **Regression:** the canonical set is a fixture; re-extraction must reproduce it byte-identically or explain every difference.
- **NDA gates on every commit**: names, figures, personal data, and the pseudonym key never leaving `docs/_private/`.
- **Drift:** when a new quote enters, bands move — record the movement, never silently re-baseline.

## 55.7 — Integration

- The calculator's capex inputs stop being scenario constants and become band-derived, with the band's n and vintage disclosed.
- The report factory (56) gains a procurement section for clients who have quotes in hand.
- The engine exposes a read-only interface for the operator only — no public tier, ever, in any form.

---

## Definition of done

A new set of supplier documents can be dropped into a folder, and within an hour the engine produces a normalised comparison, a market-position assessment with disclosed sample sizes, and a negotiation memo — with every figure traceable to a page, every assumption named, and nothing attributable leaving the private tree. Then: it has done this **on a real set**, and the result has survived its own audit.
