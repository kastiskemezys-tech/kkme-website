# Overnight run — 2026-08-03/04 · master runner

**Unsupervised. The operator is asleep and cannot answer anything.** That single fact sets every rule below.

## Standing rules for the whole night

1. **One branch per item, one PR per item, NO merges.** The operator merges in the morning. Exception: item 1 only (see its own file) may merge and deploy, because it closes live alerting failures and moves no published number.
2. **No public or client number moves.** `/revenue` 54/54 byte-identical is the gate on every item except where an item's own file explicitly says otherwise (none do). If an item cannot be done without moving a number, build it behind a flag defaulting OFF and stop.
3. **No deploys except item 1.** Everything else ends at a pushed branch with an open PR.
4. **A blocked item is a completed item.** If an item hits a STOP condition, write the diagnosis, push what exists, open the PR marked BLOCKED in its title, and move to the next item. Do NOT work around a stop, and do not spend the next item's time on the blocked one.
5. **Timebox each item.** If an item exceeds its box by more than ~50 %, land what works, note the remainder in the PR, move on. Later items are not less important than earlier ones — they are ordered by risk, not by value.
6. **Every gate you build or touch gets proven by inject-then-revert.** Four separate phases this week shipped gates that could not fail. A gate that has not been made red is not a gate.
7. **Four Pause-A questions per item**, in that item's DECISIONS.md entry: which premises are hypothesis vs verified, what consumes what this changes, what fails silently here, at which layer and time success is verified.
8. **`docs/_private/` never staged. The NDA name/figure gate runs on every commit.** No counterparty or client name, no contracted figure, anywhere in any tracked file.
9. **End the night with a clean working tree** and a single consolidated report (format at the bottom).

## Order

| # | item | file | box | may deploy |
|---|---|---|---|---|
| 1 | Alert triage — three live failures + transition-based alerting | `phase-39-2-alert-triage-prompt.md` | 2 h | **yes** |
| 2 | Gate consolidation + CI hardening | `phase-40-gate-hardening-prompt.md` | 2 h | no |
| 3 | Numerics, units and time audit | `phase-43-numerics-audit-prompt.md` | 3 h | no |
| 4 | Ingestion resilience — contracts for every source | `phase-44-ingestion-resilience-prompt.md` | 3 h | no |
| 5 | Backlog sweep — ~30 filed items, triage then fix | `phase-46-backlog-sweep-prompt.md` | 2.5 h | no |
| 6 | Provenance spine — connect the parts | `phase-41-provenance-spine-prompt.md` | 2 h | no |
| 7 | Security, secrets and disaster recovery | `phase-47-security-resilience-prompt.md` | 2 h | no |
| 8 | Technical SEO and discoverability | `phase-45-seo-discoverability-prompt.md` | 2 h | no |
| 9 | Report generator F0 — chart kit + themes + shell | `phase-36-f0-chartkit-prompt.md` | 2.5 h | no |
| 10 | Calculator integration | `phase-42-calculator-integration-prompt.md` | 2 h | no |

**Ordering logic, so you can re-order intelligently if something blocks:** items 1-2 harden the instruments (nothing downstream is trustworthy while a gate cannot fail); 3-5 are the backend/logic/maths sweep, which is where the known-unknowns are densest; 6-7 connect and protect what exists; 8-10 are product surfaces, last because they are the most reviewable in the morning and the least dangerous to leave half-built.

**You will not finish all ten. That is expected and fine.** Work in order, respect the boxes, and stop cleanly. Six items completed properly beats ten items half-done — and a triage table with evidence is a complete deliverable even when its fixes are not.

If items 1-7 all land early, item 11 is the surfacing backlog from the Phase 38 audit (`_execution-queue.md` §"Deferred to its own scoping"). Do NOT start a new item after 05:00 local.

## Morning report — one message, this structure

1. **Headline table:** item · status (shipped / PR open / BLOCKED) · PR URL · box vs actual.
2. **What is live** (item 1 only) and what it changed, with the verification evidence.
3. **Every premise in these prompts that turned out false.** This list has been the most valuable section of every wrap this week — it is not optional.
4. **Anything you stopped rather than worked around**, with the diagnosis.
5. **What needs the operator's signature before it can proceed**, as a numbered list of decisions, each with your recommendation.
6. Working-tree state, `docs/_private/` staged count, NDA gate result.

## What NOT to do overnight, under any circumstances

- No history rewrites, no force-pushes, no `git add -A`, no directory-wide `git add`.
- No changes to `docs/phases/_post-12-8-roadmap.md` (rule #5, operator/Cowork-owned) — report needed changes instead.
- No regeneration of the Prosperus client bundle.
- No edits to `docs/_private/` content other than reading it.
- No new external accounts, no new secrets, no new third-party services.
- No parameter adopted because it makes a number look better. If a value is unsourced, it is banded and labelled.
