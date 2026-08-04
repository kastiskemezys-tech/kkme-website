# Full-day session — 2026-08-04 · step by step

**Supervised.** The operator is at the desk, so this day is built around the things that need a signature — unlike the overnight run, which was built around the things that don't.

**One CC session, all day.** Do not start a second one; two sessions in one worktree cost an hour on 2026-08-03.

---

## Pre-flight (5 min, operator)

```
cd ~/kkme
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null
git checkout main && git pull origin main
git status --short | grep -v '^??'      # must be empty
git log --oneline -1
```
If anything is listed, stop and paste it to Cowork before starting. Then `claude --dangerously-skip-permissions`.

---

## STEP 1 — Phase 49, deep debug (~4-5 h, the day's centrepiece)

**Why first:** it is the largest remaining correctness item, it needs the operator awake for a CP, and it carries the biggest single defect found this week — `extractPrices` mis-parsing ENTSO-E A44, which moves `lt_avg_eur_mwh` 75.43 → 65.32 and `lt_hours` 190 → 96 on a public surface.

Paste:
```
read docs/playbooks/failure-modes.md, then docs/phases/phase-49-deep-debug-prompt.md, and execute.

Semi-autonomous, CP before any number moves. Five defects plus a class guard each — the guards are
the point: every one of these produces a plausible number rather than an error.

Capture the pre-state before you reproduce anything (C3), and re-verify the overnight figures at
execution time rather than inheriting them.

Item 3's prior question comes first: may /revenue ever serve a null IRR? Decide the contract, then
make the code obey it.
```

**Operator signature needed at:** the CP delta table. Expect item 1 to lower `lt_avg` and item 3 to remove a −8.9 % artefact — not uniformly one direction, so sign them individually.

---

## STEP 2 — Phase 51, cron coverage and rotation (~3 h)

Paste:
```
read docs/phases/phase-51-cron-coverage-rotation-prompt.md and execute.

Writer first, then remove — /revenue's key has no cron writer at all, so its read-path write is
load-bearing until you build one. Rotation is dual-accept with every caller OBSERVED on the new
value before the old one is dropped; I set the secret values, you tell me the commands.

Any gate you touch declares its preconditions and fails UNRUNNABLE when missing (B14).
```

**Operator actions inside this step:** setting the new secret when CC gives the command, and confirming each caller's first successful run on the new value.

---

## STEP 3 — Phase 52, apply the numerics verdicts (~2-3 h)

Paste:
```
read docs/phases/phase-52-numerics-fixes-prompt.md and execute.

Triage the Phase 43 verdicts against current code first — several subjects have moved since that
audit ran. Ship group A, quantify group B per item so I can sign them individually, and bring me
group C's convention questions with a recommendation rather than a decision.
```

**Operator signature needed at:** group B's per-item table, and group C's conventions.

---

## STEP 4 — boundary (30 min, end of day)

1. Merge each PR as its link arrives — Cowork provides links, never directory-wide `git add`.
2. `git checkout main && git pull origin main`, confirm clean tree.
3. Cowork applies the roadmap delta and the queue update (rule #5 — CC reports, never edits).
4. Deploy anything signed, from main, verified per C8.
5. Cowork writes the next session's plan from what actually landed.

---

## Standing rules for the day
- One session. Clean tree at every boundary, reported explicitly.
- No public number moves without a signed delta table.
- Deploy from main; if you deploy from a branch, say so and reconcile in the same session.
- `docs/_private/` never staged; NDA gate on every commit.
- Every gate touched: preconditions declared, UNRUNNABLE when unmet, proven failable by injection.
- Roadmap untouched by CC.

## If a step finishes early
Next in value order, and each already has a prompt or a queue entry: calculator §2.1/§2.2 (the engine result is computed on every request and discarded four lines later — decision 14) · B-055 summary-table truncation · source contracts promoted from record-only to enforcing, one source at a time · 37.B.2 entity names on public fleet rows.

**Do not start the E-arc (E3/E4) late in the day.** It needs a full run and a fresh checkpoint, not the tail of one.
