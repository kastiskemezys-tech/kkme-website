# Phase 56 — the report factory

**Governance:** `_autonomous-run-charter.md`. Autonomous, ~5-6 sessions, **starts only after Phase 55 reaches 55.4.**
**Builds on:** 36.F0's chart kit, themes and document shell (shipped); the provenance spine; the run registry; the assumptions register.

**The proposition.** The engagement that takes six weeks should take two days, at the same price, with a better artefact. What makes a bank read a report rather than re-model it is not prose quality — it is that every number can be traced, every assumption is named, and the same inputs reproduce the same output on demand.

---

## 56.1 — Intake → inputs, wired

The intake checklist (36.F0) becomes machine-readable and drives the model run: six sections, ~25 items, each **required / optional / default-with-disclosure**. A defaulted input appears in the report as a default, with its source, not as a fact. Section E (audience and purpose) selects which sections are emitted at all — a sponsor's board pack and a lender's credit paper are not the same document.

## 56.2 — The auditor's appendix

The section that earns the fee. Every figure in the body appears in a table with: its value, the engine field it came from, the parameter set and register version, the source of each parameter, the `run_id`, and the input hash. A reader who wants to verify one number should need one lookup, not a conversation.

Reproducibility gate: **the same intake + the same register version must reproduce the report byte-identically** apart from the generation timestamp. If it cannot, that is a defect in the engine's determinism and it gets found here rather than by a client.

## 56.3 — Assembly and the copy slots

Compose shell + charts + tables + copy deck into the finished document. **Copy slots stay UNFILLED and the renderer refuses to emit a final report with an unfilled slot** (already built in F0 — keep it). The operator's F1 pass writes the deck; the machine never generates the prose. That refusal is the anti-AI guarantee: it is structural, not a promise.

Where conditional variants are needed (project has an offtake / does not; DSCR passes / breaches; sample is thin), they are **rule-selected from human-written variants**, never generated.

## 56.4 — Three real reports

Produce complete reports for three real Baltic projects from public data plus the calculator, end to end, and **audit each one against its own appendix.** Bugs found here are the point of the exercise. Report which numbers had to be defaulted and which sections were suppressed for want of input — that list is the intake checklist's real specification.

## 56.5 — The procurement section (needs 55.4)

For clients with quotes in hand: the market-position assessment and the deviation list, with bands and n disclosed, nothing attributable. This is what makes the report different from a spreadsheet consultant's.

## 56.6 — The runbook

`docs/report-runbook.md`: from a client's first email to a delivered PDF — what to collect, what to run, what to check, what to say when a number is a default. Written so that a competent person who is not you could produce a defensible report from it. That is the test of whether it is productised or still bespoke.

---

## Definition of done

Intake in, report out, in under a day of operator time, with an appendix that survives a lender's analyst reading it line by line and a runbook that makes the process repeatable. Plus: it has produced three real reports, each audited against itself, and the defects that audit found have been fixed.
