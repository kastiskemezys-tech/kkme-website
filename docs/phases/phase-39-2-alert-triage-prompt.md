# Phase 39.2 — alert triage: three live failures, plus the alerting itself

**Branch:** `phase-39-2-alert-triage` off latest main. **Autonomous. ~2 h.** Deploy allowed after gates; no public number moves.
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Context:** the operator's alert channel fired four messages on 2026-08-03. Three are real failures; one is the fleet digest working correctly. None of them would have been visible before 38.1 — the monitoring is doing its job, and now the failures it surfaced need closing.

---

## 1 · Establish CURRENT state before fixing anything (A3)

For each of the three, answer with evidence, not inference: is it failing *right now*, how many consecutive occurrences, when did it start, and **which published number is affected and by how much**.

1. **`S1 4-hourly cron degraded — computeCapture rejected: energy-charts HTTP 503`** (fired twice).
2. **`S4: 16h old`.**
3. **`S3 enrichment ran but JSON parse failed`.**

## 2 · The structural fix — capture has a single-source dependency it does not need

`computeS1: ok` in the same invocation that `computeCapture` failed. The ENTSO-E day-ahead curve arrived; only energy-charts did not. **Capture is computed from day-ahead prices we already hold from a second source in the same request.**

- Verify that claim at code level first — what exactly does capture consume from energy-charts that ENTSO-E's series cannot supply (resolution, MTU, currency, timezone)? If there is a genuine gap, say so and stop; do not force an equivalence.
- If they are equivalent: **fall back to the ENTSO-E-derived curve** when energy-charts fails, and record which source produced each capture (`capture_source`), so a fallback is visible in the payload rather than invisible in the result. Same admission-path discipline as 36.C: one writer, freshness and source rank recorded.
- Retry policy: 38.1 added one retry on 429/5xx and a 503 still got through. Report whether a backoff would have caught it, using the observed timing — do not add retries on the assumption that more is better.

## 3 · S4 staleness and S3 parse failure

- **S4:** diagnose the path end to end. Is the source publishing, is the fetch running, is admission rejecting? The 38.1 pattern applies: check whether a sibling branch's failure is taking down work that would otherwise have succeeded.
- **S3:** a parse failure that reports only "parse failed" cannot be debugged. Make the alert carry the diagnosis: HTTP status, content-type, byte length, and the first ~200 bytes of what actually arrived (redacted if it could contain anything private). Then fix whatever it turns out to be — very often an HTML error page arriving where JSON was expected, which is the same class as NordPool returning HTML in 36.C.

## 4 · The alerting itself — fire on state CHANGE, not on occurrence

The operator received the same degraded message twice and no recovery message. From a phone, that is indistinguishable from an ongoing outage.

- **Transition-based alerting:** `ok → degraded` alerts; `degraded → degraded` is suppressed but increments a counter; **`degraded → ok` sends a RECOVERY message.** The absence of a recovery message is currently the only signal that something is still broken, and absence is not a signal.
- Every alert carries the consecutive-failure count and the time of first failure in the run.
- Suppression must never hide a *changed* failure: a different error string on the same surface is a new alert, not a repeat.
- **B8 for the alerting layer itself:** if the alerter stops sending, what tells us? Answer it, and if the answer is "nothing", add the heartbeat — the digest's own weekly cadence may serve, if it reports alerter health.

## 5 · Owed from Phase 39 — do it here, as its own commit

`regression-baseline.json` recapture: a deliberate commit whose message names the SHA and date the new baseline represents, and states that it supersedes the 2026-07-29 baseline invalidated by the 38.6/38.8 corrections. Not bundled with anything else.

## Gates
`/revenue` 54/54 byte-identical (nothing here moves a public number) · every alert path proven by inject-then-revert, including the recovery path · no alert that reports a failure without the evidence needed to diagnose it · `docs/_private/` never staged · NDA gate runs · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8 (poll to agreement — the last deploy alternated across edge nodes for four reads).

## Wrap
Origin-SHA · current state of all three at time of fix · what capture now does when energy-charts is down, proven by injecting a 503 · S3's new diagnostic output shown · the transition-based alert proven on all three transitions · the baseline recapture commit · PR URL.
