# Phase 38.5 — the three routed card defects (each its own commit, each its own delta)

**Branch:** `phase-38-5-card-defects` off latest main. **Semi-autonomous — CP before deploy.** ~1.5-2 h.
**Why now:** all three are independent of which dispatch representation wins, so they need not wait for the partition — and folding them into the partition would blend three attributable movements into one unattributable one (C3).

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph. All three locations were found in 38.4 but re-verify at execution time (A3) — line numbers move.

---

## Order — worst first

1. **`capture_eur_mwh` (`fetch-s1.js:1359`) publishes a theoretical spread on losing days.** Rule #2 on a live field: a label asserting realised capture where the arithmetic can only produce a theoretical one. Establish what it should publish on a day the asset would not have traded — zero, null, or the realised negative — and say which and why. A null that renders honestly beats a number that renders confidently.
2. **SoC resets daily in `computeDispatchV2` (`:1136`).** State the physical claim the reset makes (every day begins at the same state of charge regardless of how the previous one ended) and what it costs: which metrics inherit it, and in which direction. If the fix is larger than this phase, the deliverable is the quantified statement plus a filed item — not a partial rewrite.
3. **`annual_eur = daily × 365` (`:1336`, siblings at `:991-992`, `:3955`).** Enumerate every site with the search command and count (A7 — "the sibling at X" has been wrong before). A flat 365× erases seasonality that the hourly engine and the shape-years both represent; quantify the error against a seasonally-resolved run before choosing the fix.

## Rules for all three
- **Each defect: its own commit, its own delta row** (pre, post, absolute, %, named cause, surfaces affected). No blended commits.
- Any fix that turns out to need the partition to be correct gets STOPPED and filed rather than half-done — say so plainly.
- Assert on rendered output where a surface changes, not on field presence (B13).

## CP — before deploy
The three deltas as one table, plus which of the three (if any) you recommend holding for the partition phase. I sign before anything ships.

## Gates
`/revenue` 54/54 byte-identical until the signed CP · `docs/_private/` never staged · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the ALL-N enumeration for item 3 · three deltas as shipped · what was held and why · PR URL.
