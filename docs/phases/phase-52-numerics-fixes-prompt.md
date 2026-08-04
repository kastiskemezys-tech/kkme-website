# Phase 52 — apply the numerics audit's verdicts

**Branch:** `phase-52-numerics-fixes`. **Semi-autonomous — CP before any number moves. ~2-3 h.**
**Input:** the verdict table from the Phase 43 audit (PR #143, merged). That phase produced findings and deliberately fixed nothing. This one fixes them.

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph. **Re-verify every verdict at execution time** (A3) — the audit ran before Phases 48-51 and several of its subjects have moved.

---

## 1 · Triage the verdict table first (30 min, and it is a deliverable on its own)

For each audit item: still valid / already fixed / no longer applicable, with the evidence command. Then sort what remains into:
- **A — fixes that move no published number** (guards, assertions, annotations, sentinel handling that nothing currently hits). Ship these.
- **B — fixes that move a published number.** Build behind a flag OFF, quantify, hold for signature.
- **C — findings that need a decision before they can be fixed** (convention choices, e.g. discounting basis or percentile method). Present the options with a recommendation; do not pick unilaterally.

## 2 · Ship group A, in this order

1. **The dimensional gate**, if the audit built the annotation scheme but left it unenforced. This is the guard against the class that produced B-065.
2. **Solver edge handling** — `calcIRR` returning null at both brackets (approved), plus the enumeration of every other solver that can return its own bound as a value. Every consumer of a nullable IRR handles null honestly (not 0, not blank).
3. **Time assertions** — DST 23/25-hour days, MTU cardinality per market day, leap years, and any `× 365` site the audit flagged that does not itself change a number.
4. **NaN/Infinity guards** on every division the audit listed.
5. **Rounding policy** — round at display only; fix every site the audit found doing arithmetic on rounded values (the 2.04-vs-2.00 lever error is the paid-for example).

Each with an inject-then-revert proof. Each its own commit.

## 3 · Group B — quantify, do not ship

For each: the 54-config delta, which surfaces change, and the direction. **Present them as one table** so I can sign or reject them individually rather than as a bundle — several are likely to move numbers in opposite directions, and a netted-out figure would hide that.

## 4 · Group C — the convention questions

Likely candidates from the audit: end-of-period vs mid-period discounting; percentile method; mean-of-ratios vs ratio-of-means where both appear; negative-price handling where a floor is applied. For each: what we do now (with file:line), what the alternatives are, what each implies for published numbers, and your recommendation. **A convention chosen because it flatters is a convention we will have to defend twice.**

## 5 · Write the conventions down
Whatever survives §4 goes into `docs/methodology-lender.md` as an explicit conventions section. A lender's analyst will ask about discounting basis and percentile method in the first hour; having it written is worth more than having it right-by-accident.

## CP
The triage table, group A shipped, group B quantified per item, group C with recommendations.

## Gates
`/revenue` 54/54 byte-identical for everything in group A · group B behind flags defaulting OFF · every new assertion proven failable · gates declare their preconditions and fail UNRUNNABLE when missing (B14) · `docs/_private/` never staged · NDA gate on every commit.

## Wrap
Origin-SHA · triage table · group A commits with proofs · group B delta table · group C options and recommendations · the conventions section · PR URL.
