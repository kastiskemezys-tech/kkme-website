# Phase 54 — queue sweep: the four signed-but-unbuilt items

**Branch:** `phase-54-queue-sweep`. **Semi-autonomous — CP before the two that move numbers. Box 2.5-3 h.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph. **Re-verify every item at execution time (A3)** — all four were scoped across the last three sessions and the tree has moved under each of them.

Each item is its own commit with its own delta row. No blended commits.

---

## 1 · The seven read-path write removals (signed, unbuilt)

Table at `docs/investigations/2026-08-04-phase-51-ten-route-table.md`. Seven of ten need no new cron writer — signature and a staleness bound only, and the signature exists.

- **Writer first, then remove** — re-confirm each of the seven genuinely has a cron writer running today before removing anything. "Needed no new writer" was measured three sessions ago.
- Each removal ships with its **staleness bound stated where a reader can see it**, not only in the investigation table. A public surface that can now be up to N minutes old should say so on the surface.
- Row 6 stays held until `s4`'s cron rejection is understood. Row for `/revenue` stays held — its key still has no cron writer, so its read-path write remains load-bearing.
- After the removals: confirm a stranger's GET can no longer move published state, and report the KV-write reduction **only if it can be measured** — there is no per-route counter, and an invented figure is worse than none.

## 2 · `/digest` — move the write to the POST (signed, unbuilt)

A GET should not write editorial keys. Move the write to the POST that supplies the content, keep the GET read-only, and assert it: a GET against `/digest` leaves KV byte-identical.

## 3 · B-069 — the `computeBaseYear` unit residue (moves a published diagnostic)

Reach established: it feeds `base_year.annual_totals`, published on every request; it does **not** feed gross revenue, IRR, DSCR or NPV. Mechanism was never established — establish it before fixing, and if it cannot be established, say so and stop rather than fixing by shape.

Quantify what changes. It is a diagnostic rather than a headline, but it is published, so it gets a delta row and a signature.

## 4 · B-055 — the summary table's silent truncation (moves published evidence)

The published table filters day-ahead to PT60M; Germany moved to 15-min MTU on 2025-10-01, so eleven months of denominator vanish with no error — 274,835 PT15M rows discarded. Confirmed and quantified in an earlier session; the fix was held because the table feeds citations.

- Rebuild with an MTU-aware filter. Fold in the RTE pinning (`ARB_RTE_E0_PUBLISHED`) so one rebuild closes both.
- **The two filters agree to ~2.57 % over the shared months** was reported once and could not be reproduced later (85 shared months, not 84). Re-derive it; do not quote the old figure.
- Report which published cells change and by how much. Anything citing this table needs to know.

## STOP conditions
- Any of the seven turns out to lack a running cron writer → hold that row, do not remove.
- B-069's mechanism cannot be established → report and hold.
- B-055's rebuild changes a cell by more than a rounding difference → stop at the CP with the list; several downstream figures cite it.

## CP
Items 3 and 4's delta tables. Items 1 and 2 ship on the existing signature provided their preconditions re-verify.

## Gates
`/revenue` 54/54 byte-identical except where a signed delta says otherwise · GET-leaves-KV-unchanged asserted for `/digest` · each removal's staleness bound rendered, not just recorded · `docs/_private/` never staged · NDA gate on every commit · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the seven removals with their bounds as rendered · `/digest` assertion · B-069 mechanism and delta · B-055 re-derived agreement figure and changed cells · PR URL.
