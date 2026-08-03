# Long run — Part A: dispatch convergence (38.7) · Part B: 36.E3 (mFRR) + 36.E4 (DA spread equilibrium)

**Branch:** `phase-38-7-e34` off latest main. **Autonomous, ~4-5 h.** Internal decisions become DECISIONS.md entries, not pauses.
**Deploy: only Part A, only after its CP is signed. Part B deploys nothing** — E6 does all wiring.

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph. Every line number and figure below is from earlier phases and gets re-verified at execution time (A3) — the last run found every reference had drifted.

**Two independent workstreams in one branch.** If Part A stalls, Part B still delivers, and vice versa. Do not let A's difficulty consume B's time — timebox A at ~2 h and report where it stands.

---

# PART A — retire the second dispatch representation (38.7)

**The problem, from 38.5:** the dispatch card runs its own policy — 15-minute blocks against the hourly engine's hourly steps, 0.10-0.90 of *nameplate* against 0.05-0.95 of *usable* — and its daily SoC reset has been silently compensating for the resulting structural shortfall. Remove the reset alone and the card's shortfall against the canonical engine goes from 7-14 % to 40-86 %, taking `MAX_SHORTFALL_PCT = 20` red. **Rule #4 says one dispatch, referenced everywhere.** This part makes that true.

### A1 · Pause A — decide the shape on evidence, not preference
Two candidate shapes; pick one and say why, with numbers:
- **(i) The card consumes the hourly engine's output** (one implementation, card becomes a view).
- **(ii) The card's policy converges to the engine's** (block size, SoC bounds, basis) and the mirror gate stays as a regression guard.

Report: what each costs in code and in latency, what each does to the card's published numbers, and which one leaves ZERO second implementation. If (i) is feasible, it is strongly preferred — a mirror gate exists only because two implementations exist.

### A2 · The reset comes out WITH the convergence, never before
The reset injects 37-40 % of usable energy daily. It is wrong, and removing it in isolation makes the card worse, not better. Sequence the commits so no intermediate state publishes a number that is worse than both endpoints.

### A3 · The mirror gate is B5-class
`MAX_SHORTFALL_PCT` compares two of our own models. Pair every convergence claim with a check neither shares: energy balance closing to ~1e-9, discharge ≤ capacity × duration, or a hand-computed golden day. When the two converge, that agreement proves nothing on its own.

### A4 · CP before deploy
Delta table for every card surface: pre, post, absolute, %, cause. State plainly whether the card's published numbers rise or fall. Then stop — I sign before deploy.

---

# PART B — 36.E3 (mFRR) + 36.E4 (DA spread equilibrium)

Canonical scope: `docs/phases/phase-36-e-arc.md` §E3, §E4 **and the E1/E2 amendment block**, which overrides the arc text wherever they conflict. **Nothing wires into the projection path — E6 does that behind the continuity gate. `/revenue` 54/54 byte-identical throughout Part B.**

### B1 · E3 — mFRR capacity + activation

- **Same skeleton as E2**, mFRR parameters: capacity as scarcity-decay to a floor of `displacement × arbitrage opportunity`, with **displacement measured per market per product and NO default** (the arc's "gross arbitrage net of cycling cost" floor is falsified — E1/E2 amendment 1).
- **MARI: verify, expect the same conclusion as PICASSO, do not assume it.** MARI accession was 2024-10-10 for all three TSOs and our clearing series starts 2025-10-01, so the break is very likely already inside the level we calibrate on — but count the pre/post samples in the primary files and say so with the counts, exactly as B-036 did. If no break can be measured, the non-application gets its own methodology subsection with the counts, matching §08B.5's shape.
- **The E0 amendment stands:** "mFRR saturates last because demand is deep" is DROPPED. The retained mechanism is that the deepest marginal provider sets the floor, and for mFRR that provider is usually NOT a battery. Argue Baltic product ordering from Baltic supply composition — what actually bids each product — never from demand depth. Revenue migration across products is a model OUTPUT to validate, not an input.
- **Activation per direction**, as E2: down-activation is revenue for a charging battery. Where BTD gives no directional split, the Baltic level is measured and only the SHAPE is transferred — labelled, with its sensitivity band, exactly as E2 did (€3,025-5,714/MW/yr precedent).
- Validation: DE reproduction + Baltic backcast, tolerances stated BEFORE the runs.

### B2 · E4 — DA spread equilibrium (replaces the growth dial)

Today forward spread growth is a scenario dial (−1 / +2 / +3.5 %/yr) — an assumption, not a model. Build:

```
spread(t) = f( residual-load shape(t),           # RES build-out, public NECP / TSO plans
               fleet_arbitrage_capacity(t),      # OUR OWN supply trajectory
               compression_coefficient,          # mature-market calibrated
               floor )                           # displacement × engine cycling cost
```

Four things this phase must get right:

1. **`fleet_arbitrage_capacity` must use the CORRECTED trading share.** The unit fix changed how much of any battery actually arbitrages — a fleet whose members each trade ~11 % of nameplate compresses spreads far less than one trading 70 %. Using the pre-fix share would silently re-import the bug this arc just removed. State which share you used and where it comes from.
2. **The floor inherits the falsification.** Engine-computed cycling cost is the *input*; the floor is `displacement × that`, measured, no default.
3. **Two forces race:** RES build-out widening spreads vs battery fleet compressing them. Calibrate the per-GW compression coefficient on markets where both are measurable — AU NEM (especially SA), DE 2022-2026 — from the primary files, not the summary table (**B-055: the summary table's DE arbitrage series is truncated at 2025-09 because it filters DA to PT60M and Germany went 15-min MTU on 2025-10-01**; if you need DE beyond 2025-09, fix the filter in your own reading and note it, do not edit the published table).
4. **Validation:** backcast LT 2021-2026 (we hold the data) and reproduce AU/DE directionally. Tolerances stated before the run. Pair with an independent check — a spread model that reproduces its own calibration set proves nothing (B5).

### B3 · Parameter table (the E1/E2 pattern, non-negotiable)
Every parameter: measured value · primary file + window · validation tolerance · `review_cycle` · and a flag on anything TRANSFERRED rather than measured. Register + changelog rows for each.

---

# Wrap
1. Origin-SHA, branch, PR URL, what is deployed (Part A only, if signed) and what is not.
2. Part A: the shape chosen and why, the delta table, whether the card's numbers rise or fall, the non-mirror check.
3. Part B: E3 and E4 parameter tables, the MARI verdict with its sample counts, which trading share E4's fleet capacity used, both validation results with the tolerances you set beforehand.
4. Every premise in this prompt that turned out false — the last run found ten, and that list was the most useful section of the wrap.
5. Anything you stopped rather than worked around.

## Gates
`/revenue` 54/54 byte-identical except where Part A's signed CP says otherwise · Part B wires nothing · every new test proven failable by inject-then-revert · no second implementation left standing in Part A · every parameter traceable to a primary file · `docs/_private/` never staged · suite green · eslint delta zero · any deploy from main after origin-SHA equality, verified per C8.
