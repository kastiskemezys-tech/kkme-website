# Phase 46 — backlog sweep: the small filed items nobody has gone back for

**Branch:** `phase-46-backlog-sweep`. **Autonomous, box 2.5 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** Roughly thirty items have been filed with a B-number during the last three weeks and never revisited. Filing is not fixing, and a backlog nobody sweeps is a list of known defects with extra steps. **Every item below was filed by someone who had the evidence in front of them — re-verify anyway (A3), because several will already be closed by later work.**

**Method: triage first, fix second.** Spend the first 30 minutes producing the status table; that table is the deliverable even if nothing else lands. Then fix in the order below, stopping when the box is spent.

---

## 1 · Triage table (all of them, verified at execution time)

For each: still open / already closed by later work / no longer applicable — with the evidence command. Items to check, at minimum:

`B-034` tests grading untracked artifacts · `B-035` `/s4/migrate-fleet` no recompute · `B-037` Fingrid key (declined — confirm it is a decision, not a gap) · `B-039` no installed-storage-MW series (E4 compression coefficient gap) · `B-040` E5 has no evidence base · `B-043` fetchers rewriting fixtures · `B-044` TAM / APVA citability · `B-050`/`B-053` malformed backlog table rows · `B-051` Actions PR permission (org setting — verify by dispatch, not by the tick) · `B-055` summary-table truncation at 2025-09 (PT60M filter vs 15-min MTU) · `B-057` cron collision + `[Genload]`/`[FX]`/`[S3]` errors · `B-060` `updateHistory` write-date vs market-date · `B-062` `demand_basis`, `baltic_weighted_net_mw`, `non_commercial_mw` unsurfaced · `B-064` degradation below 1.0 c/d.

Plus the non-B items: EE fleet coverage 2/15 · the 41 untracked LV entities awaiting candidate treatment · the reserve side of the MW identity (1.115 → 1.00, needs a directional split `RESERVE_PRODUCTS` cannot express) · `regression-baseline.json` recapture if the alert-triage item did not do it.

## 2 · Fix order (highest value per minute first)

1. **B-055 — the summary table is published and truncated.** It filters day-ahead to PT60M and Germany moved to 15-min MTU on 2025-10-01, so eleven months of denominator vanish silently. The two filters agree to 2.57 % over the 84 shared months, so the switch is safe; the table feeds citations, so the fix is worth more than its size. Rebuild it, and fold in the RTE pinning (`ARB_RTE_E0_PUBLISHED`) so one rebuild closes both.
2. **B-060 — write-date vs market-date.** `updateHistory` stamps the write date; keep-last disagrees with the settled capture series on 7 of 9 days, and no value matches any *other* capture date either, so it is not a simple shift. Diagnose; if the cause cannot be evidenced, say so and leave the series as-is rather than guessing a correction.
3. **B-035 — `/s4/migrate-fleet` does not recompute.** Verify what stale state that leaves and whether any published number depends on it.
4. **B-062 — three computed fields nobody surfaces.** Confirm they are correct, then propose (do not build) where each belongs. `demand_basis` in particular was built by 36.D and has never been visible.
5. **B-050 / B-053 malformed table rows** — a two-minute fix that keeps the backlog machine-readable, which everything above depends on.
6. **B-034, B-043** — test hygiene items; both make future gates trustworthy.

## 3 · Items to triage but NOT fix tonight
`B-039`, `B-040` (evidence gaps feeding E4/E5 — they need sourcing work, not code) · `B-044` TAM (needs a rendered browser session) · `B-064` degradation characterisation (needs citable coefficients; the internal fit was correctly declined) · the reserve-side identity (moves numbers; needs a directional split and a signature) · EE coverage and the LV candidates (both are 37.B.2 scope).

For each of these, write one paragraph: what is actually needed, how long it would take, and what it unblocks. That paragraph is what turns a backlog item into a schedulable phase.

## STOP conditions
- A fix moves a published number → flag OFF, quantify, add to the signature list.
- An item turns out to be much larger than filed → stop, re-file it with the corrected estimate and the evidence, move on. Re-scoping is a valid outcome.

## Gates
`/revenue` 54/54 byte-identical · every "already closed" verdict carries the command that proves it · `docs/_private/` never staged · NDA gate runs.

## PR body
The full triage table with verdicts and evidence, what was fixed, and the schedulable-phase paragraphs for the deferred items.
