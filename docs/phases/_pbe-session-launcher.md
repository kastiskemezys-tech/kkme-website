# PBE run — the two prompts

The operator pastes **BOOTSTRAP once**, then **RESUME** at the start of every subsequent session, unchanged, for as many sessions as the run takes. Neither prompt needs editing; the run's state lives in files, not in the prompt.

---

## BOOTSTRAP (once)

```
read docs/phases/_autonomous-run-charter.md, then docs/phases/phase-55-procurement-benchmark-arc.md,
then docs/phases/phase-56-report-factory-arc.md.

You are starting an autonomous run of 8-16 sessions. I will not be available to answer anything.
The charter governs; where it and an arc disagree, the charter wins.

This session does three things and nothing else:

1. Create the run's state under docs/_private/pbe/ — STATE.json, RUN_JOURNAL.md, QUESTIONS.md,
   HANDOVER.md — per charter §1. Verify docs/_private/ is gitignored before writing a single byte
   into it, and assert it on every commit thereafter.

2. Execute 55.0 — corpus intake and inventory. ~/Documents/KKME/01_Deals/** is READ-ONLY: copy out,
   never move, never edit, never reorganise. Pseudonymise suppliers at intake (SUP-A…), with the
   mapping in one gitignored key file. Produce corpus-manifest.json and the coverage table by
   supplier × document type × year.

3. Write the honest gap list: which suppliers have commercial terms and which are technical-only,
   which years are represented, where revision chains exist and where a single snapshot stands
   alone. That list determines whether 55.3's bands are possible at all, so it is the session's
   real output.

Then update all four state files and stop with a clean tree. Do not start 55.1.
```

## RESUME (every session after)

```
read docs/phases/_autonomous-run-charter.md, then docs/_private/pbe/STATE.json, then the last three
entries of docs/_private/pbe/RUN_JOURNAL.md, then docs/_private/pbe/QUESTIONS.md.

Continue the run. Take the top unblocked task from STATE.json's next_action. I am not available —
decide per charter §2, record every default taken in QUESTIONS.md with the rule that justified it,
and never guess a fact that could be measured.

Hard stops per charter §3. If this is a 5th session, run the self-audit instead of the next task,
and treat its findings as outranking the plan.

End the session by updating STATE.json, appending to RUN_JOURNAL.md, updating QUESTIONS.md and
regenerating HANDOVER.md. Clean tree. Push nothing to production, deploy nothing, publish nothing.
```

---

## Operator notes

- **One session at a time.** Two sessions in one worktree cost an hour on 2026-08-03.
- Between sessions, nothing is required. Reading `docs/_private/pbe/HANDOVER.md` gives the current picture at any moment.
- If a session ends mid-task, RESUME picks it up; that is what STATE.json is for.
- The run is finished when HANDOVER.md says so against the charter's §7 bar — not when the code exists.
