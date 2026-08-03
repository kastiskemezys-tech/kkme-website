# Phase 43 — numerics, units and time: the audit the engine has never had

**Branch:** `phase-43-numerics-audit`. **Autonomous, box 3 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** A €/€ ratio was multiplying an MWh quantity in the revenue path for months, and nothing caught it because nothing checks dimensions. That was found by accident. This phase looks for its siblings deliberately. **Findings are reported; fixes that move a published number are built behind a flag defaulting OFF and left for signature.**

Work through the list; each item gets a verdict (clean / defect / cannot determine) with the evidence command. **A "clean" verdict with no evidence is not a verdict.**

---

## 1 · Dimensional integrity (the B-065 class)

Enumerate every multiplication and division in the revenue, dispatch, cost and debt paths where the operands have different physical dimensions. For each, state the dimensions and whether the result's dimension matches its consumer's expectation.

Deliverable: a **units annotation** on every engine constant and derived field — as a machine-checkable comment convention or a small type/registry — plus a gate that fails when a value annotated `€/€` or `%` multiplies one annotated `MWh` or `MW`. Prove the gate red by reintroducing the B-065 shape.

## 2 · Time — the most likely place for silent, systematic error

- **Timezones and DST.** Baltic markets are EET/EEST; our data sources publish variously in UTC, CET/CEST and local. Enumerate every timestamp boundary (ingest, KV write, aggregation, display) and verify: the spring-forward 23-hour day and the autumn 25-hour day. Test both explicitly with fixtures — an aggregation that assumes 24 hourly slots is wrong twice a year and nobody notices.
- **Market time unit.** European day-ahead moved to **15-minute MTU** (Germany 2025-10-01; check the Baltic/Nord Pool date from a primary source, do NOT assume). B-055 already showed a filter silently truncating a series when the MTU changed. Enumerate every place resolution is assumed — `× 24`, `/ 4`, PT60M filters, "hours per year", slot indexing — and report which are MTU-safe. The `synthesizeBTDFromRolling` PT15M indexing bug from 36.C is the precedent for how this fails.
- **Year length.** Leap years, `× 365` (Phase 38.5 found four genuine sites), 8760 vs 8784, and any annualisation from a partial period.
- **Cron and settlement boundaries.** Which computations assume a day starts at 00:00 local vs UTC, and does any daily aggregate straddle a boundary?

## 3 · Financial mathematics

- **IRR solver.** It currently reports `0.00` with `irr_status: 'uneconomic'` rather than a negative root — a trap that made three stress configs *look* +3.5 pp better in a delta table. Verify: bracketing, multiple sign changes (non-conventional cash flows), non-convergence handling, and that every consumer of `project_irr` handles the sentinel. **A sentinel that reads as a value is a defect waiting to be quoted.**
- **NPV/discounting conventions.** End-of-period vs mid-period, first-period treatment, and consistency between engine, client runners and the debt solver. State the convention explicitly in the methodology if it isn't there.
- **Percentiles.** Which method (nearest-rank, linear interpolation)? Is it the same everywhere? P90 on n=5 shape-years was already flagged as unresolvable — verify no surface quotes a percentile the sample cannot support, and that `days_of_data` counts distinct dates everywhere (the 38.2 fix generalised).
- **Rounding and precision.** Establish a policy: round only at display, never in intermediate arithmetic; the §4 lever error (dividing already-rounded percentages, giving 2.04 instead of 2.00) is the paid-for example. Grep for arithmetic on rounded values and report every instance.
- **Debt sculpting edge cases** (39): zero or negative CFADS years, tenor shorter than the sculpt, interest exceeding available cash, and the non-negative-principal invariant.

## 4 · Statistical and model logic

- **Degradation** — the 1.0 c/d validity floor and the clamp (B-064). Verify no path extrapolates below the characterised range and that the published cycle count and the wear input cannot diverge silently.
- **Interpolation** — step-vs-linear choices (36.D chose step for legal reservations, correctly); enumerate every interpolation and state why its kind is right.
- **Aggregation order** — mean-of-ratios vs ratio-of-means. These differ, and the difference is invisible until someone checks. Report every place a ratio is averaged.
- **Negative prices.** Day-ahead goes negative in the Baltics. Verify every place a price is used: floored, absolute-valued, or passed through — and that each choice is deliberate. A `Math.max(price, 0)` in the wrong place is a systematic revenue overstatement.

## 5 · Numeric hygiene
NaN/Infinity guards on every division; `parseFloat` on untrusted input; float accumulation in long loops (8760 iterations); integer overflow in cent-based arithmetic if any.

## STOP conditions
- A defect is found whose fix moves a published number → build behind a flag OFF, quantify the delta, stop, and put it in the signature list.
- More than 5 defects found in one area → stop enumerating that area, report the pattern, and recommend a dedicated phase. Breadth beats depth tonight.

## Gates
`/revenue` 54/54 byte-identical · the dimensional gate proven failable · DST and MTU tests use real fixtures, not synthetic 24-hour days · `docs/_private/` never staged.

## PR body
A verdict table: item · clean / defect / cannot determine · evidence command · if defect, the quantified impact and whether it moves a public number.
