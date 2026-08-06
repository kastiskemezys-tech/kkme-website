# Full-day session — 2026-08-05 · step by step

**Supervised, one CC session all day.** Built around the four things that need a signature and the one that needs the most care.

**The day's shape:** the biggest correctness item first while attention is freshest, the fastest item second because it is blocking another, the accumulated queue third, and the convention questions last because they need discussion rather than execution.

---

## Pre-flight (operator, 3 min)

```
cd ~/kkme
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null
git checkout main && git pull origin main
git status --short | grep -v '^??'      # must be empty
git log --oneline -1
```
Anything listed → stop and paste to Cowork before starting. Then `claude --dangerously-skip-permissions`.

---

## STEP 0 — read yesterday's pending record (5 min, first thing)

The 16:00Z tick should have written the `computeS4` rejection.

```
Read GET /admin/cron-failures and report the actual name, message and first stack frame for the
computeS4 rejection. Then tell me which fix it implies: sequencing the allSettled legs, giving
computeS4 its own tick, or something else entirely. Do not raise the timeout — 25 s on a 380 ms
call is already ~65× headroom, and raising it treats the symptom.
```

**Operator decision:** the fix shape, once the record names the cause. Small — 30-45 min including deploy.

---

## STEP 1 — Phase 53, B-076, the compression trajectory (box 3-4 h) ⭐

The day's centrepiece and the one to be slowest about: the only correction in weeks that moves numbers **in our favour**.

```
read docs/playbooks/failure-modes.md, then docs/phases/phase-53-s2-activation-prompt.md, and
execute.

Semi-autonomous, CP before any number moves. §1 gates everything: settle the basis question from
computeS2Activation's own parse before computing any delta. Do not scale one side to meet the
other — that is fitting, not measuring.

§2's VPS leg goes through the admission rule from #159, and the fallback gets proven by forcing it.

If the fresh series disagrees with the controlled comparison's DIRECTION, stop — a reversal means
one of the two measurements is wrong and guessing which is not available.
```

**Operator signature:** the CP delta table, with the two causes (fresh data vs basis correction) separated.

---

## STEP 2 — Phase 54, the queue sweep (box 2.5-3 h)

Four items that are already signed or already scoped and have simply never been built.

```
read docs/phases/phase-54-queue-sweep-prompt.md and execute.

Semi-autonomous. Items 1 and 2 ship on the existing signature PROVIDED their preconditions
re-verify — confirm each of the seven routes genuinely has a running cron writer today before
removing anything; "needed no new writer" was measured three sessions ago.

Items 3 and 4 stop at a CP. B-055 in particular: re-derive the filter-agreement figure rather than
quoting the old one, and list every published cell that changes — several downstream figures cite
that table.
```

**Operator signature:** B-069 and B-055's delta tables.

---

## STEP 3 — Phase 52, the numerics verdicts (box 2-3 h, groups A and C)

Never started. Group B's items were absorbed by Phases 49 and 54, so what remains is group A (ship) and group C (discuss).

```
read docs/phases/phase-52-numerics-fixes-prompt.md and execute groups A and C.

Triage the Phase 43 verdicts against current code first — most subjects have moved, and several are
already closed by Phases 49-54. Ship group A with an injection proof each. Bring group C's
convention questions — discounting basis, percentile method, mean-of-ratios vs ratio-of-means,
negative-price handling — with a recommendation and what each implies for published numbers.

A convention chosen because it flatters is one we have to defend twice.
```

**Operator decision:** the conventions. These are the questions a lender's analyst asks in the first hour, and they belong written down in `methodology-lender.md` whichever way they go.

---

## STEP 4 — boundary (30 min)

1. Merge each PR from the link Cowork provides — explicit paths, never a directory `git add`.
2. `git checkout main && git pull`, clean tree confirmed.
3. Deploy anything signed, from main, verified per C8 (three deploys in a row yesterday would have read as failures on a single read).
4. Cowork applies the roadmap delta and queue update; CC reports, never edits (rule #5).
5. Cowork drafts the next session from what actually landed.

---

## Standing rules
- One session. Clean tree at every boundary, reported explicitly.
- No public number moves without a signed delta; flag OFF and quantify otherwise.
- Deploy from main; a branch deploy must be stated and reconciled in the same session.
- Every gate touched: preconditions declared, UNRUNNABLE when unmet (B14), positive control for scanners (B15), diagnosis persisted not just the failure (B16).
- `docs/_private/` never staged; NDA gate on every commit.
- Roadmap untouched by CC.

## If a step finishes early, in value order
Calculator §2.1/§2.2 (the engine result is computed on every request and discarded four lines
later) · the reserve-side identity 1.115 → 1.00, which needs a directional split `RESERVE_PRODUCTS`
cannot currently express — **scope it, do not build it** · 37.B.2 entity names on public fleet rows.

**Do not start the E-arc.** E3/E4 need a full day and a fresh checkpoint; starting them at 17:00 is
how a phase gets half-built and re-premised later.
