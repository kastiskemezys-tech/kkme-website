# 36.E0.3 — refresh-workflow correctness (fix the instrument before spending its evidence)

**Branch:** `phase-36-e03-workflow-correctness` off latest main. **Autonomous. ~1 h.** No engine, no worker, no public site.
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why now:** E1-E6 calibrate on the evidence base this workflow maintains. Sunday's first real firing showed the workflow's own gates cannot be trusted yet — one of them cannot fail at all. Fix the instrument, then spend the evidence.

---

## 1 · B-053 — the gate that cannot fail (do this first, it is the P1)

`if npx vitest … | tail -40` without `pipefail` takes `tail`'s exit status. The run recorded `tests=pass` **with 3 tests failing**. Every green this workflow has ever produced was green by construction.

1. `set -o pipefail` (or equivalent) on every piped gate in the workflow — enumerate them with the search command and count (A7), don't fix only the one we noticed.
2. **Prove each gate failable:** make one fail deliberately, show the job goes red, revert. A gate not demonstrated failable is not a gate — that is the same inject-then-remove control that caught the `[^\n]` bracket bug in E0.2.
3. **Diagnose the 3 failures themselves — this is a separate finding, not a side effect.** They passed locally and failed on Actions. Report which tests, why they diverged (timezone, locale, network, filesystem ordering, missing fixture), and whether the divergence means the local suite is the one that's wrong.

## 2 · B-052 — the cron fires ~11×/month

`0 3 1-7 * 0` ORs day-of-month with day-of-week (it ran both Sat 08-01 and Sun 08-02). Canonical fix: `0 3 * * 0` plus a first-step guard `[ "$(date -u +%d)" -le 7 ] || exit 0`. Correct the workflow comment, which currently asserts "exactly one day per month" — and add a test asserting comment and schedule agree in MEANING, not merely that both exist (rule #2: a label asserting when something happens must be derived from the thing that makes it happen).

Note but do not fight: GitHub delayed both firings 03:00 → 05:5x. Scheduled Actions are best-effort; if any downstream logic assumes the stamp equals the schedule, say so.

## 3 · B-054 — staleness thresholds that hide a dead runner for 30-45 days

`max_age_hours` 720-1080 is a global constant. Derive per-source thresholds from each source's own cadence (weekly runner → ~10 days; monthly refresh → ~45; hand-acquired sources keep their honest "never refreshed by automation" state per §2.55). B8 answer: for each source, how many days elapse between it dying and us knowing?

## 4 · B-051 — confirm the repo setting actually took

The operator has ticked *Allow GitHub Actions to create and approve pull requests*. Verify by observation, not by trusting the tick: fire `workflow_dispatch` and confirm a PR opens. If it still cannot, implement the fallback — push the branch (already works) and post the compare URL to the existing alert channel, so a blocked PR is never a silent success.

## 5 · The 2026-08 refresh branch — diagnose, recommend, do NOT accept

`evidence-refresh/2026-08` at `174a166`. Two sources tripped the append-only gate and correctly withheld their stamps: se and da restated boundary-hour prices, da withdrew 24 rows.

For each: what exactly changed (hours, magnitude, direction), and is this a routine settlement correction, a source-side republication, or our own boundary-window bug (the calendar-year spill class from E0.1's proof run)? **Recommend accept or reject with the evidence; apply neither.** This is the first instance of the monthly review this workflow exists to produce, and the pattern set here repeats every month — write it up so the next one is a 2-minute read.

## Gates
No engine/worker/app changes (`git diff main -- workers/ app/` empty) · suite green · every workflow gate demonstrated failable · eslint clean · `docs/_private/` never staged.

## Wrap
Origin-SHA · the 3 Actions-only test failures diagnosed · each gate's failability proof · cron corrected with the meaning-test · per-source staleness table (days-to-detection per source) · B-051 confirmed by an actual PR opening, or the fallback shipped · the se/da restatement analysis with your recommendation · PR URL.
