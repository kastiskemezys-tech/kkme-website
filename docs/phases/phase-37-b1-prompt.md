# Phase 37.B.1 — the detector runner (makes 37.B live) + digest arming

**Branch:** `phase-37-b1-detector-runner` off latest main. **Semi-autonomous — one checkpoint.** ~2-3 h.
**Why:** 37.B shipped seven lifecycle signals, a rename guard, a retirement policy and a transition log — none of which has ever executed against real data. `fleet_lifecycle:detectors` has one writer fed by a caller that does not exist (H1 finding: 16 grep hits outside the worker, all tests). Nothing is discovering new projects or retiring dead ones today, and the digest cannot be armed because there is nothing upstream to report.

Read `docs/playbooks/failure-modes.md` first. Four Pause-A questions answered in one paragraph.

---

## Pause A — before building the runner

1. **Enumerate what exists** (A7, with search commands and counts): every detector defined, what source each needs, what shape each writes, who reads `fleet_lifecycle:*`, and what auth the ingest endpoint expects. The H1 report mentions a missing `UPDATE_SECRET` on that path — verify current state rather than inheriting the claim.
2. **Host decision on E0.1's grounds** (Actions vs worker cron): where the data lives, what runtime each detector needs, whether any source is unreachable from Actions runner IPs. Note Sunday 2026-08-02 03:00 UTC gives a free reachability datapoint from the evidence-refresh workflow — if your build lands after it, use its result; if before, do not assume either way.
3. **Report the risk surface:** which detectors can propose a RETIREMENT on their first contact with real data. That list drives the checkpoint below.

## Build

1. **Runner** that invokes every detector against real sources, writes `fleet_lifecycle:detectors` with per-detector last-run stamp, outcome, and error state, and appends evidence-carrying entries to the transition log.
2. **First run is REPORT-ONLY — no status writes.** This is the hard requirement of the phase. The LV precedent is not hypothetical: a single untrimmed space marked 486,509 entities terminated, Latvenergo included, and would have retired the entire Latvian fleet while satisfying every rule. The first contact between these detectors and real data produces a PROPOSAL SET, not transitions.
3. **CHECKPOINT — stop here.** Present: detectors that ran, sources each reached, proposed transitions in full (project, signal, evidence, confidence), and anything suppressed. Zero proposals is a fine result and must be reported as such rather than tuned toward. I review before any write path is enabled.
4. **After sign-off:** enable writes, run for real, paste `/health.fleet_lifecycle` before and after — populated detectors, non-null stamps, transition log reflecting what actually happened ("nothing changed" is a valid populated state).
5. **Then arm the digest, in its own commit.** State the first firing in UTC and local time. Also confirm the schedule the digest declares matches the workflow/`wrangler.toml` that actually runs it — H1's drift test covers `wrangler.toml`; the Actions workflow's `0 3 1-7 * 0` (03:00 UTC) was reported once as "02:00", so verify rather than repeat.
6. **B8 answer in the arming commit message:** how would we know if the runner silently stopped, or if a detector started returning empty because its source changed shape rather than because nothing happened? If the answer is "we wouldn't", build the surface before arming.

## Privacy — the digest is a new egress path
The digest leaves the platform. It carries project names, status changes and evidence links — **never contacts, comments, `apva_flag`, or any `fleet_private:*` value.** Leak-test the rendered digest payload the way batch-2 leak-tests routes: seed private values, assert absent, prove the test failable, vacuity guard.

## Gates
`docs/_private/` never staged · digest payload leak-tested and proven failable · soft-retire only, deletion impossible · exactly one signal may retire (existing test) · rename guard cancels decay signals · suppressed detectors logged, never obeyed · `/revenue` 54/54 byte-identical (this phase moves no public number) · suite green · eslint clean · deploy only after origin-SHA equality, verified per C8 by polling until two reads agree.

## Wrap
Origin-SHA · the proposal set as presented at the checkpoint and what was approved · `/health.fleet_lifecycle` before/after · digest armed with first firing in UTC and local, or the reason it is not · leak-test failability proof · byte-identity result · PR URL.
