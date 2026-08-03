# Phase 38.4 — dispatch reconciliation (B-063): what the engine represents, before what it computes

**Branch:** `phase-38-4-dispatch-reconciliation` off latest main. **Semi-autonomous — checkpoint after the diagnosis, before any code that changes a number.** ~3 h.
**Why:** two internal representations of the same asset disagree by ~2.5× on its largest merchant line — the shipped engine books DA arbitrage at 27 % of gross, the hourly run at 10.7 %. Both are ours, both pass their own gates, and neither has ever had to resolve against the other. **B-063 is B5 in its purest form:** the two engines are compared only against each other and against gates each already satisfies.

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**This phase's output may be a diagnosis, not a fix.** If the honest answer is "the engine has no representation of X", that is a complete and valuable result. Do not manufacture a reconciliation.

---

## 1 · The framing that reframes the phase (CC's own flag, and the first thing to test)

`trading_fraction = min(0.70, (T/(T+R)) × 0.75)` is an **economic allocation of value**. The hourly engine's 27.5 % free-MW share is a **physical constraint on MW**. **These may not be the same quantity at all** — in which case the reconciliation is not picking between two estimates of one thing, it is discovering that the engine has no representation of one of them.

Test that first, because it determines whether the rest of the phase is a calibration or a modelling gap:

- What does each quantity actually constrain, dimensionally? Write both derivations out.
- Does either one bind in the shipped engine's revenue path, and where?
- If they are different quantities, the question stops being "which is right" and becomes "what happens when both are applied" — because a real asset is subject to both an economic allocation and a physical headroom limit.

## 2 · The independent check that exists (do not build a new mirror)

**B1 measured simultaneity at 75.2-85.5 % of the unconstrained stack, year-dependent.** That is the evidence that can distinguish "the hourly dispatch's commitment rule is physically right" from "it is over-conservative":

- If reserve commitment leaves only ~25 % of nameplate free to trade, reconcile that against a measured 75-85 % achievable stack. Either they describe different constraints (state which), or one of them is wrong.
- Pair every comparison with something neither engine shares: energy balance, hand-computed golden days, or the physical invariant that discharge ≤ capacity × duration. Two of our own models agreeing proves nothing about either (B5).

## 3 · Degradation characterisation below 1.0 c/d — a precondition, not a follow-up

The SOH curves are calibrated at 1.0 / 1.5 / 2.0 c/d and nothing extrapolates below the slowest. **A wear model valid only at ≥1.0 c/d cannot price a 0.6 c/d asset, whichever dispatch representation wins.** Two acceptable outcomes, one unacceptable:

- Characterise below 1.0 c/d from a citable source (cell datasheets, published cycle-life curves at low C-rate, calendar-vs-cycle decomposition), with the source cited per rule #3; or
- Declare the validity floor an explicit published limit and constrain what the engine claims about sub-1.0 c/d assets.
- **Unacceptable:** extrapolating the existing curves below their calibrated range and treating the result as measured. B-064 exists so nobody later reads 38.3's drawer note as the problem having been solved.

## 4 · The three routed card defects
Carry them here — they have been deferred twice.

## CHECKPOINT
Present: the dimensional analysis of both quantities and whether they are the same thing · the B1 reconciliation with its independent check · the degradation options with sources · a recommendation on the cutover (which representation, or neither, and what would have to be true). **No number moves before I sign.** If the recommendation lowers IRR, say so plainly — the direction is not an input to the decision.

## Gates
`/revenue` 54/54 byte-identical until the CP is signed · every comparison paired with a non-mirror check · `docs/_private/` never staged · suite green · eslint delta zero · any deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · both derivations · the B1 reconciliation result · degradation recommendation with citations · cutover recommendation with what would have to be true for each branch · the three card defects · PR URL.
