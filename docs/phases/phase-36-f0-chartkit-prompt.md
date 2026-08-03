# Phase 36.F0 — report generator: chart kit, themes, document shell (overnight item 4)

**Branch:** `phase-36-f0-chartkit`. **Autonomous, box 2.5 h. No deploy. PR open, no merge.**
Canonical scope: `docs/phases/phase-36-f-arc.md`. Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why this is F0 and not the whole thing.** The report tool's hardest constraint is that its **copy must not read as machine-written** — and that is the operator's editing pass, not an overnight task. So overnight builds everything the copy will sit inside: the chart kit, the theme system, the document shell, the intake checklist. **No prose is generated in this phase beyond placeholder markers.** The operator's F1 pass writes the copy deck; this phase makes a place for it.

---

## 1 · The chart kit — SVG, no runtime dependency

Build `tools/report/charts/` as pure functions `(data, opts) → SVG string`. No canvas (the Chart.js CSS-variable failure is on record), no client JS, no external fonts at render time.

Modules, in priority order — build as many as the box allows, in this order:
1. **Cashflow waterfall** (gross → net → EBITDA → CFADS → debt service → equity), the single most-read chart in a bankable report.
2. **Revenue stack by product** over time (area, per-service once E6 lands; today per current engine lines).
3. **DSCR profile with covenant line** — the covenant as a rule, the bars as data (39's subject).
4. **Debt sizing ladder** — sustainable debt vs target cover, with the binding constraint marked.
5. **Distribution / percentile band** (P10-P50-P90 over years).
6. **Sensitivity tornado.**
7. **Monthly heatmap** (existing site pattern, print-adapted).
8. **Duration/degradation curve** with the characterised range shaded and the extrapolation-forbidden zone marked — 38.3's validity floor made visual.

**Non-negotiable rules for every chart:**
- **Grayscale survival test** — every chart must be readable when printed in black and white. Automated: render, desaturate, assert minimum luminance separation between adjacent series. This is a gate, with an injection that proves it red.
- No chartjunk, no 3D, no gradients-as-decoration. Data-ink discipline.
- Every chart carries its own source/as-of line, generated from the provenance spine (item 3) if it landed, otherwise from an explicit `source` argument that is REQUIRED — a chart that can render without a source is a rule-#3 hole.
- Axes always labelled with units; no truncated y-axis without an explicit zero-break marker.
- Deterministic output: same input → byte-identical SVG (gate it; this is what makes report diffs reviewable).

## 2 · Theme system — light and dark, one token set

Two themes, one token file, no raw colours anywhere in chart code (the site's design-token rule applies here). Light is the default for print. **Both themes must pass the grayscale test independently.**

The KKME logo goes in the document shell, not in charts. Asset from the site, vector, no rasterisation.

## 3 · Document shell

`tools/report/shell/` — cover, contents, section headers, page furniture (page numbers, confidentiality footer, as-of stamp), figure numbering, a table style, and **explicit slots for copy** marked `{{SECTION:...}}`. Print-first geometry: A4, sane margins, no content in the last 15 mm.

Output HTML that prints correctly; PDF conversion via the existing pdf skill or headless print. Do not add a new dependency for PDF if one already works.

## 4 · The intake checklist

`docs/report-intake-checklist.md` — the questionnaire that makes a report tailored rather than generic. Six sections (A project & sponsor, B technical, C commercial/offtake, D financing, E audience & purpose, F data provided), ~25 items, each marked required / optional / **defaults-with-disclosure** (the default is used and the report says it was a default). Section E drives which sections of the report are emitted at all.

## STOP conditions
- The grayscale test cannot be automated reliably → build it as a manual checklist item and say so; do not ship an assertion that always passes.
- PDF conversion needs a new external service → stop; HTML that prints correctly is a complete deliverable for tonight.

## Gates on this phase
Deterministic SVG output (byte-identical on re-render) · grayscale gate proven failable · no raw colour literals in chart code · every chart requires a source argument · `/revenue` untouched · `docs/_private/` never staged.

## PR body must contain
A rendered sample of every chart built, in both themes, plus the grayscale renders. Say plainly which of the eight were built and which were not.
