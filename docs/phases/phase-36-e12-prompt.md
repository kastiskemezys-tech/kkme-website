# 36.E1 (FCR) + 36.E2 (aFRR) — per-service price formation

**Branch:** `phase-36-e12-price-formation` off latest main. **Semi-autonomous — one checkpoint.** ~3-4 h.
**Canonical scope:** `docs/phases/phase-36-e-arc.md` §E1, §E2 and the arc's standing rules. Where this prompt and the arc differ, this file wins and the difference is named at Pause A.

Read `docs/playbooks/failure-modes.md` first. Four Pause-A questions in one paragraph. **Arc-specific exposure, called out in the arc itself:** A5 (calibrate only on the primary data files, never on a summary — including this document's), A8 (every half-life, floor and coefficient is MEASURED from the datasets; nothing in this prompt is a target), B5 (reproduction tests against mature markets are mirror-class — pair them with physical-invariant checks).

**Scope discipline that makes this batch safe: nothing here replaces the blended CPI anywhere.** The modules are built, calibrated and validated behind their own seam; wiring them into the projection path is E6, after the continuity gate and operator sign-off. No public or client number moves in this batch — `/revenue` 54/54 byte-identical throughout.

---

## Step 0 — trailing-edge lag (20 min, time-boxed, do not let it grow)

Both August refresh anomalies tripped on the trailing edge: the refresh reads a market before it has finished publishing, so the newest window is provisional and gets restated next run. Apply the 2-day exclusion (or equivalent lag) orchestrator-side, with a test. This must land before the September firing or September reproduces August's two red flags for the same benign reason. If it turns out to be more than a small change, STOP and report — it does not belong inside the E-arc.

## Pause A — the seams, before any modelling

1. **What consumes the CPI today** (A7, search command + count): every reader of the blended curve, in engine, worker, calculator and client runners. The new modules must be additive beside it, not a replacement in this batch.
2. **What the engine already computes that these models need:** the arbitrage opportunity cost of the marginal MW, cycling cost, degradation premium for reserved SoC headroom, simultaneity from B1. **Rule #4 — one implementation, referenced per service.** Do not write a second opportunity-cost calculation; if the existing one is the wrong shape, say so and propose, don't fork.
3. **Data inventory against the primary files** (not `summary-table.json`, not the arc): for FCR — DE series coverage and resolution, SE hydro-floor series (n=1, and every citation must say so); for aFRR — DE capacity history, the settled DE activation series B-036 acquired (`price_basis: vwap_activated`, from 2022-06-21, per-direction activated-ISP counts), AT as second-market comparator, Baltic 33.B.2 watch series and 36.C's 299-day restored clearing history.
4. **State the accession constraint back to me in your own words** before calibrating anything: DE's activation series begins at its own accession and AT's standard-product series begins three years after its own, so the pre/post accession break CANNOT be measured from activation prices (49 pre-accession Austrian quarter-hours against 5,331). Any PICASSO break magnitude is a TRANSFER from the capacity evidence, labelled as such wherever it appears. The Baltic accessions are PAST and partly inside our own observation window (Litgrid 2025-03-05, Elering + AST 2025-04-11) — our own post-accession data is evidence in its own right, and may be the better source. Report which you will use and why.

## E1 — FCR

Per arc §E1. The premise this phase must not inherit: **German FCR did not decay to a floor, it ROSE 7.60 → 16.09 €/MW/h.** The model is `clearing = max(endogenous floor, tightness-driven scarcity term)`, where the tightness term is calibrated on the DE series *including its rise*, and the floor is the engine-computed arbitrage opportunity cost of the marginal MW plus a symmetric-availability premium.

- Baltic FCR demand is tiny (36.D's addressable trajectory, FCR component). **FCR stays a rounding error — ≤1 % of revenue — and the model's job is to be RIGHT about that, not to make it interesting.** If your calibration produces a materially larger FCR line, that is a finding to investigate, not a result to keep.
- The €63/MW/h anomaly in our own watch data (33.B.2) gets an explanation or an explicit "unexplained, excluded, here is why" — not silent exclusion.
- **Validation:** fed DE inputs (fleet, demand, floor), the model reproduces DE's trajectory within a stated tolerance — including the rise. Pair with a physical-invariant check so the reproduction test is not mirror-blind (B5).

## E2 — aFRR (the money phase)

Per arc §E2. Two halves, both needed:

**Capacity:** scarcity-decay toward an endogenous floor = arbitrage opportunity cost + degradation premium for reserved SoC headroom, both engine-computed. Calibrate decay on DE's capacity history; backcast against the Baltic watch series (the measured €7-72/MW/h range) and 36.C's restored history.

**Activation:** `energy_activated × activation_price`, with an activation-rate model **per direction**. Today's engine models up-only — B1's known limitation, fixed here. **Down-activation is REVENUE for a charging battery and is SoC-helpful; it is systematically underestimated today.** Use B-036's settled DE series with its per-direction activated-ISP counts. The PICASSO break enters as an explicit pre/post regime with the date from the pinned structural calendar and the magnitude transferred from capacity evidence per Pause A.

**Validation:** DE reproduction + Baltic backcast, each with its tolerance stated before the run, not after.

## CHECKPOINT — before wiring anything

Present, and stop: every parameter the two modules introduce, with its measured value, the primary file and window it came from, the tolerance its validation ran at, and its `review_cycle`. Flag any parameter whose value is transferred rather than measured (the PICASSO magnitude is one; there may be others). I sign the table before it goes anywhere near the projection path.

## Gates
`/revenue` 54/54 byte-identical at every commit (nothing here moves a public number) · no second opportunity-cost implementation · every parameter traceable to a primary file + window · reproduction tests paired with invariant checks · suite green · eslint clean · `docs/_private/` never staged · register/changelog rows for every new parameter.

## Wrap
Origin-SHA · step 0 result · the parameter table as presented at the checkpoint · both reproduction results with tolerances · what the FCR line is as a share of revenue · the accession-constraint statement and which evidence you calibrated the break on · byte-identity result · PR URL.
