# Phase 49 — deep debug: the five real defects the overnight run found, and the method for the next five

**Branch:** `phase-49-deep-debug`. **Semi-autonomous — CP before any number moves. ~4-5 h.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why this is one phase and not five.** The overnight audit found defects that share a signature: **each produces a plausible number rather than an error.** A parser that returns 2 values instead of 96 and forward-fills the rest. An IRR solver that returns exactly 2 for anything above 200 %. A staleness clock reset by its own failure payload. A partition residue reachable only through a fallback path. None of these throw; all of them publish. Fixing them one at a time misses the point — the deliverable is the fixes **and** a class-level guard for each, so the next instance surfaces as a failure instead of a figure.

**Standing constraint: every fix that moves a published number goes behind a flag defaulting OFF, is quantified, and waits for signature.** Nothing ships to production in this phase without the CP.

---

## Item 1 — `extractPrices` and ENTSO-E A44 (the largest of the five)

**Established overnight, re-verify at execution time (A3):** A44 for LT is `curveType A03`, which omits repeated positions. `extractPrices` ignores `<position>` entirely, so 92 of 94 values land at the wrong time. Separately, a UTC-bounded request returns two CET/CEST market days concatenated into a 190-entry array. The correct forward-filling parser exists, is exported and is under test; it reconstructs 96/96 exactly against Elering as an independent control, where the flat scrape gets 2/94.

1. **Capture the pre-state first** (C3): every field this touches, on all 54 configs plus the live payload, from a clean worktree of the reference commit against one frozen KV snapshot.
2. **Cut over to the correct parser.** Known movements: `lt_avg_eur_mwh` 75.43 → 65.32, `lt_hours` 190 → 96, plus `lt_hourly_24`, `intraday_capture`, `bess_net_capture`. Re-measure rather than inheriting those figures.
3. **The class guard:** a parser that silently produces fewer values than the period requires is the defect. Assert **cardinality against the market calendar** — 96 PT15M or 24 PT60M slots per normal day, 92/23 on spring-forward, 100/25 on autumn — for every price series, at admission. A day that arrives with 2 real values and 92 forward-fills must fail, not average.
4. **Timezone boundary assert:** a request bounded in UTC must not admit two market days. Test the concatenation case explicitly.
5. Keep Elering as a **standing independent control** where it serves the same series — an external cross-check is the only thing that caught this, and it should not be a one-off.

## Item 2 — `calcIRR` bracket escape

`calcIRR([-100, 10000, 10000])` returns exactly **2** — the upper bracket escaping as a value, published as a 200 % return. Overnight also corrected my premise: `irr_status: 'uneconomic'` never fires and there are 12 legitimately negative IRRs across the 54, so the sentinel story was wrong in both directions.

1. Return **null at both edges** (approved), never a bracket value. Every consumer of `project_irr` / `equity_irr` must handle null — enumerate them (A7) and check each renders honestly rather than as 0 or blank.
2. Bracket-escape test at both ends, plus non-convergence, plus non-conventional cash flows (multiple sign changes) where IRR is genuinely undefined — that case must return null with a reason, not a root.
3. **Class guard:** any solver in the codebase that can return its own bound as a result. Enumerate them — the sculpting solver, any goal-seek, any bisection — and assert each distinguishes "converged at the edge" from "did not converge".

## Item 3 — the B-065 residue in `computeBaseYear:4201`

Reaches the payload only via the capture fallback, which fires when `s1_capture` is absent. Measured overnight: `gross_y1` −8.9 % and `project_irr` returns **null**. Mechanism not established, and correctly not guessed.

1. Establish the mechanism before proposing a fix. If it cannot be established, say so and stop — a fix without a mechanism is a guess with tests.
2. **Answer the prior question first:** may `/revenue` ever serve a null IRR? Decide the contract, then make the code obey it. Today a fallback path can emit a shape the consumers may not handle, which is a fault regardless of the arithmetic underneath.
3. **Class guard:** fallback paths must produce the same payload *shape* as the primary path. Assert shape-equality between primary and every fallback for every endpoint that has one — the fallback is exactly where nobody looks.

## Item 4 — S3 scrape and S8, failing live and never alerted

Overnight found S3's scrape failing (AbortError) independently of the enrichment parse failure that *was* alerted, and S8 last writing at 09:00:49Z with no alert ever.

1. Diagnose both to root cause with evidence.
2. **Class guard, and this is the important one:** enumerate every KV key that a scheduled job is expected to write, and assert each has (a) a staleness threshold derived from its own cadence and (b) an alert wired to it. Report the ones that have neither. S8 had neither, which is why a silent stop was invisible; item 1 of the overnight run fixed S3's self-resetting clock but the general case is unaudited.

## Item 5 — the stale record (A9)

The handover register and the roadmap both still say B-065 is open with nothing changed, but `MW_PARTITION_DEFAULT = 'partition'` shipped in `aaac252`. Eight backlog IDs exist only as prose with no table row, two of them closed. B-044 does not exist anywhere despite being named in a prompt.

Reconcile the backlog to reality: every ID gets a row, every row a status, every closed item the commit that closed it. **Report roadmap changes rather than making them** (rule #5). This is small and unglamorous and it is why the last three prompts contained false premises.

---

## The method section — write this into `docs/playbooks/debugging.md`

The five above share a signature. Generalise it into a playbook page, because the next five will share it too:

1. **Plausible-output defects beat exceptions.** Prefer assertions on *cardinality, shape, dimension and range* over try/catch. Every series knows how many values it should have; every payload knows its shape; every ratio knows its bounds.
2. **An independent external control is the only reliable oracle.** Two of our own components agreeing proves nothing (B5). Elering vs ENTSO-E caught item 1; the German TSOs' own CSV caught B-036; known-terminated entities caught the registry detector. Name a control per data path.
3. **Fallback and error paths are where defects live**, because they are exercised rarely and reviewed never. Assert shape-equality with the primary path; test the fallback by forcing it, not by waiting for it.
4. **Every solver must distinguish converged from bounded.** Returning a bound as a value is the numerical analogue of catching an exception and returning a default.
5. **A failure payload must never satisfy a freshness check.** Writing "I failed" is not writing data.
6. **Reproduce before fixing; capture pre-state before reproducing.** C3, every time.

## CP
The five items' measured deltas in one table (pre, post, absolute, %, which surfaces), the class guards with their inject-then-revert proofs, and a recommendation on which may ship together vs separately. **Direction stated plainly** — item 1 lowers `lt_avg` and item 3 removes a −8.9 % artefact, so this batch is not uniformly one way.

## Gates
`/revenue` 54/54 byte-identical until the signed CP · every class guard proven failable · no fix without a reproduced defect · no mechanism guessed · `docs/_private/` never staged · NDA gate runs · deploy only after signature, from main, verified per C8.

## Wrap
Origin-SHA · five diagnoses with evidence · the delta table · the class guards and their proofs · `docs/playbooks/debugging.md` · what remains unexplained · PR URL.
