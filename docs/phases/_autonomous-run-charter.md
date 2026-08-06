# Autonomous run charter — how CC operates for 1-2 weeks without the operator

**Applies to:** Phase 55 (procurement benchmark engine) and Phase 56 (report factory), and any future run declared "autonomous" against this charter.
**The governing fact:** the operator is not available to answer anything. Every rule below exists because the usual "stop and ask" is unavailable, and the usual answer to that — guess — is worse.

---

## 1 · The three artifacts that make a run resumable

Sessions end when context ends. The run does not. Three files carry it:

- **`docs/_private/pbe/STATE.json`** — machine state. Current phase, task list with status, what is blocked and on what, the last verified-good commit, and a `next_action` string that a fresh session can act on without reading anything else.
- **`docs/_private/pbe/RUN_JOURNAL.md`** — append-only, one entry per session: what was attempted, what landed, what was learned, what was wrong in the previous entry. **Never edited, only appended.** This is the corpus that stops the run re-deriving the same conclusions.
- **`docs/_private/pbe/QUESTIONS.md`** — decisions the operator would normally make. Each entry: the question, the options, **the default taken**, the rule that justified the default, and how to reverse it. The run does not stop for these; it records and proceeds.

Every session **starts** by reading all three and **ends** by updating all three. A session that cannot update them has not finished.

## 2 · Decision-making without the operator

When a decision arises, apply in order:

1. **Is it reversible and non-published?** → take it, record in QUESTIONS.md, move on.
2. **Does an existing rule decide it?** (rule #1-#6, the playbook, the charter) → apply the rule, cite it.
3. **Is it a modelling or commercial judgment?** → take the **conservative** option, defined as the one that produces the less flattering number or the narrower claim, record both options and why.
4. **Would it move a published number, change a public surface, or touch production?** → **do not do it.** Build behind a flag defaulting OFF, quantify, file in QUESTIONS.md as BLOCKED-ON-OPERATOR, continue with other work.

**Never**: guess a fact that could be measured, adopt a parameter because it makes a result work, or resolve an inconsistency by making one side match the other without establishing which is right.

## 3 · Hard stops — the run pauses and waits, no exceptions

- Any private-tier value (counterparty name, client name, contracted figure, personal data) reaching a tracked file, a commit message, a test fixture, a log or a payload.
- Any destructive operation on the operator's document folders. **`~/Documents/KKME/01_Deals/**` is READ-ONLY: copy out, never move, never edit, never reorganise** — that folder's own CLAUDE.md says so and it has been damaged once already.
- Anything that would deploy, publish, or alter a production surface.
- Two consecutive sessions failing on the same task → stop that task, write the diagnosis, move to the next unblocked one.
- Discovery of a live security exposure → stop everything, write it at the top of QUESTIONS.md, do not remediate unsupervised.

## 4 · Quality rules that replace the operator's eye

- **Every extraction gets two independent methods and a cross-check.** A single parser agreeing with itself is not evidence (B5). Where two methods disagree, the record is flagged `disputed`, never silently resolved.
- **Every gate declares preconditions, fails UNRUNNABLE when unmet (B14), runs a positive control (B15), and is proven failable by injection.**
- **Every derived number carries its provenance**: source document, page/cell, extraction method, confidence.
- **Nothing is "done" without an independent check**: a hand-computed golden case, a physical invariant, or an external reference. Self-agreement is not completion.
- **Confidence is recorded, not asserted.** A field extracted at low confidence is published as low confidence, not omitted and not upgraded.

## 5 · Cadence

- **Every session**: read the three artifacts → pick the top unblocked task → work → gates → commit → update the three artifacts → clean tree.
- **Every 5th session**: a **self-audit session** — re-run every gate, re-read the last five journal entries for claims that have since been falsified, verify STATE.json against the actual repo, and write a correction entry. Findings from the self-audit outrank the plan.
- **Never** more than one session at a time. The worktree is single-writer.

## 6 · What the operator gets on return

A single `docs/_private/pbe/HANDOVER.md`, regenerated each session, containing: what exists now, what it can do, the numbered decisions waiting on him with recommendations, everything taken as a default that he may want to reverse, and the honest list of what does not work yet.

## 7 · The standing bar for "perfected"

The run is not finished when the code exists. It is finished when: every extraction has been cross-checked, the eval set passes at a stated threshold, every gate is proven failable, the handover reads as complete to someone who has not been present, and **the tool has produced a real output on real documents that survives its own audit**.
