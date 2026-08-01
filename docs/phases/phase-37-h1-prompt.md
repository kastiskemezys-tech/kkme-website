# Phase 37.H1 — hygiene batch: browser-auth fix · digest arming · 37.D counterfactual

**Branch:** `phase-37-h1-hygiene` off latest main. **Autonomous. ~1.5-2 h.** Runs BEFORE the 36.E batches.
Three items, in this order. Read `docs/playbooks/failure-modes.md` first and answer the four Pause-A questions in one paragraph.

Why these three together: one is a live product defect, one is an alert pipeline that cannot yet be trusted, and one is a code path no test can currently prove is live. All three are "green but not actually working" — the same class, cheapest to fix in one pass.

---

## 1 · B-045 — the calculator's full tier cannot authenticate from a browser

**Verified live in batch-2, not hypothesis:** preflight omits `Authorization`, so the bearer token never leaves the browser and the user sees "Could not reach the engine". Endpoint tests pass because they call the worker directly — B2: the gate measured a layer no customer uses.

1. Locate the shared CORS constant (grep, don't assume its file). Report every route that reads it — A7 ALL-N with the search command and match count, because this constant is shared and the change is non-additive.
2. Fix, then **prove it at the preflight layer**: paste the actual `OPTIONS` response, with `Origin` and `Access-Control-Request-Headers: authorization` set, showing `authorization` present in `Access-Control-Allow-Headers`. A passing unit test is not the proof here; the HTTP exchange is.
3. **Then prove it at the layer the customer touches** — a real browser round trip against production after deploy: gate → token → full-tier result rendered. Screenshot or console evidence. This defect existed precisely because that step was never taken.
4. Regression test at the browser layer (preflight simulation with the header set), so the class cannot recur silently.
5. **Non-additive change → byte-identity gate applies:** `/revenue` 54/54 configs byte-identical before and after, checked after the hourly cron tick (B3), and the public routes' behaviour unchanged apart from the header.

## 2 · B-046 — arm the weekly digest, after a first REAL detector run

`/health.fleet_lifecycle` currently reports `{"detectors":{},"status":"never_run","transition_log_size":0}` and the renderer correctly refuses to distinguish a quiet week from a dead pipeline. A second dry run does not clear this; a real detector run does.

1. Trigger the detectors once for real. Paste `/health.fleet_lifecycle` before and after — populated detectors, non-null last-run stamps, transition log reflecting whatever actually happened (including "nothing changed", which is a valid populated state).
2. Only then arm the schedule, **in its own commit**, and state in the wrap exactly what the first scheduled firing will do and when, in UTC and in local time.
3. B8 answer required in the commit message: how would we know if the digest silently stopped? If the answer is "we wouldn't", add the staleness surface before arming.

## 3 · 37.D counterfactual — prove the enrichment path is live

Batch-2's CP was all zeros because the citable capacity contribution is 0 MW. Correct outcome, but it leaves the wiring unverifiable by its effect: inert code and correct code look identical right now.

1. Synthetic fixture: a fleet row with a CITABLE capacity source (public source attesting battery MW, not merely company existence — model it on what a VERT permit or TSO queue entry would provide, clearly synthetic, `example.invalid`).
2. Assert the supply trajectory MOVES with that row present, by the expected magnitude, and that removing it returns to baseline.
3. Assert the **conjunction rule** batch-2 established as a first-class invariant: verification tier decides the haircut, capacity-citability decides whether there is anything to haircut. A row that is `public-confirmed` but carries no citable capacity contributes 0 MW — test it directly, because the arc's tier mapping alone would have licensed publishing 3,583.5 MW of private testimony behind a registry citation.
4. No production numbers move: the fixture lives in tests only, asserted absent from every payload.

## Also confirm (one line each in the wrap)
`FLEET_SECRET` is set — `/fleet` gates unauthenticated and serves authenticated; the B11 discriminate control still holds on the fleet routes.

## Gates
`docs/_private/` never staged · no private value anywhere · leak tests still failable · suite green · eslint clean · `/revenue` byte-identity across the non-additive CORS change · deploy only after origin-SHA equality + clean state.

## Wrap
Origin-SHA · the OPTIONS exchange pasted · the post-deploy browser round trip evidenced · `/health.fleet_lifecycle` before/after + first-firing statement in UTC and local · counterfactual test output showing the supply delta appearing and disappearing with the synthetic citable row · byte-identity result · PR URL.
