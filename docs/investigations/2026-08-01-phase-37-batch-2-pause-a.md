# Phase 37 batch-2 — Pause A

**Date:** 2026-08-01 · **Branch:** `phase-37-batch-2` off `main` @ `46d1bdf` (= `origin/main`, verified).
**Scope:** arc §37.C (operator-only fleet CRM) + §37.D (forecast wiring), per `docs/phases/phase-37-b2-prompt.md`.

---

## The four playbook questions

**(a) Which premises are HYPOTHESIS vs verified.**

| Premise (source) | Status | Evidence |
|---|---|---|
| batch-1's worker delta is additive-only, 132 insertions / 0 deletions | **verified** | `git diff --numstat 957d726..46d1bdf -- workers/fetch-s1.js` → `132  0`; three hunk headers, all pure insertions (`@@ -8711,0 +8712,97 @@`, `@@ -10862,0 +10960,34 @@`, `@@ -10867,0 +10999 @@`) |
| The digest is not cron-armed | **verified** | `wrangler.toml` `[triggers]` carries 4 crons, none weekly; post-deploy output re-listed exactly those 4 |
| `hybrid-band.json` upper bound = the status quo published supply | **verified** | `sum(raw_entries[].mw)` on live `/s4/fleet` = **16 020.4** = `band.upper_bess_mw` exactly |
| Arc §37.C says "42 projects" | **STALE (A9)** | the intake actually holds **141 rows** — LT 84 / LV 42 / EE 15. 42 was the LV seed table only. Corrected here; the arc is operator-owned (rule #5) so this file records the delta rather than editing it |
| "Expect meaningful overlap on pure-BESS rows, near-zero on hybrids" (arc §37.A.2) | **verified, and it matters more than expected** | match status: matched 86 · probable 6 · new-to-us 49 |
| Verification tier → confidence weighting will enrich published supply (arc §37.D.1) | **FALSIFIED — see §37.D finding below** | all 36 public-confirmed rows carry `bess_mw = 0` |
| CALC_SECRET is safe to reuse for the CRM gate | **rejected on design grounds, not evidence** | CALC_SECRET is a browser-typed password gating the calculator's *full tier*, an audience that is not necessarily just the operator. The CRM holds contacts and deal comments. Separate secret, separate blast radius |
| A browser at kkme.eu can send `Authorization: Bearer` to the worker | **FALSE — verified live** | see "Incidental finding" below |

**(b) What consumes what this batch changes.**

New worker routes (`/fleet/login`, `/fleet/data`, `/fleet/comment`) have **no existing consumers** — they are new pathnames. `fleet_private:index` gains a second reader (the CRM route) alongside `GET /admin/fleet-private`; writers stay at one (`POST /admin/fleet-private`) plus the new comment-overlay key `fleet_private:comments`, which is written by `/fleet/comment` only and read by `/fleet/data` only. Grep for every reader/writer of `fleet_private` is recorded in the wrap (A7 ALL-N: the count, not the claim). The Next side adds `app/fleet/**` only; `git diff main --name-only -- app/` outside `app/fleet/` must stay empty, the 35.2 soft-launch discipline.

On the 37.D side the consumer chain is the one that matters: `raw_entries[].mw` → `baltic_weighted_mw` → `sd_ratio` → `cpi` → per-product CPI → revenue/IRR. Baseline captured **before** any change (C3): `baltic_operational_mw 782 · baltic_pipeline_mw 15 239 · baltic_weighted_mw 2385 · eff_demand_mw 752 · sd_ratio 2.91 · cpi 0.30 · phase MATURE`, `updated_at 2026-08-01T08:00:51.983Z`. Note `cpi` sits **at its 0.30 floor**, which is the standing reason fleet MW edits are revenue-safe — a supply change has to be large enough to lift CPI off the floor before any IRR can move.

**(c) What fails silently, and how we would know.**

Three paths. (1) **A leak test that passes vacuously** — the batch-1 precedent where an emptiness assertion ran against `{"fleet":null}`. Countermeasure: every leak test seeds private values first and carries a vacuity guard that fails when the fixture did not load, plus an inject-then-remove failability proof. (2) **The gate screen rendering after a data fetch** — if the shell ever server-rendered a count, the leak would ship in static HTML and no API test would see it. Countermeasure: the UI leak test runs against the **built** `out/fleet/index.html`, not against a component in isolation. (3) **`FLEET_SECRET` unset in production** — the route would need to fail closed, not open. Countermeasure: unset secret returns 503 with zero data and the tests assert that specific case.

**(d) At which layer and time success is verified.**

Worker routes: live `curl` against the deployed worker, each with a **nonsense-path control** so a 200/401 is proven to discriminate (B11 — the pre-deploy probe in this session already caught the worker's catch-all returning the S1 payload for *any* unmatched GET, which would have made a naive "unauthenticated /fleet returns no private data" check pass vacuously). UI: `next build` then grep of the emitted static HTML. Numbers: no deploy at all until the CP delta table is signed. Timing: `/revenue`-class values are only comparable after the hourly cron tick; the batch-1 deploy touched no revenue path (pure insertions in three regions), so no re-baseline was owed for it.

---

## Step 0 outcome

**0.1 — deployed.** Pre-flight: `main` = `origin/main` = `46d1bdf`; `origin/main..main` empty; `workers/` byte-identical to `origin/main` (`git diff --stat origin/main -- workers/` empty). The working tree carries 5 unrelated tracked modifications (`tools/consultancy/data/mature-markets/*`, `docs/research/mature-market-summary-table.md`) — outside the worker bundle (`main = workers/fetch-s1.js` + `workers/lib/*`), so C2's "deploy ships the working tree" exposure is nil for this deploy. Suite 97 files / 1816 tests green before shipping. Version `2e558602-6154-4aae-b615-1060b09aba2b`, 472.81 KiB / gzip 121.23 KiB, the same 4 cron triggers.

Post-deploy, with controls:

```
POST /admin/fleet-lifecycle-digest (unauth): 401 {"error":"Unauthorized"}
POST /admin/fleet-lifecycle        (unauth): 401 {"error":"Unauthorized"}
CONTROL POST /admin/zzqqxx-nonsense:         405 Method Not Allowed
/health.fleet_lifecycle: {"detectors":{},"all_healthy":null,"unhealthy_count":0,
                          "status":"never_run","transition_log_size":0}
```

Public routes after deploy: `/ 200 · /s1 200 · /s2 200 · /s4/fleet 200 · /revenue 200 · /health 200 · /index/baltic 200`. `all_fresh:false` is **pre-existing and not deploy-caused**: its sole cause is `extreme:latest` = missing, whose threshold entry dates from `fec8c96` (Phase 12.9) and is commented "events are sparse — missing is normal". batch-1 never touched `workers/lib/` (`git diff --stat e05f757..46d1bdf -- workers/lib/` empty).

**0.2 — digest NOT armed, and the reason is a finding, not a formality.** `/health.fleet_lifecycle` reports `status: never_run`, `detectors: {}`, `transition_log_size: 0`. Read against the renderer, that lands in the branch that emits *"⚠️ No detector has ever reported — this digest cannot distinguish a quiet week from a dead pipeline."* Something surfaces ⇒ arming stops, per the prompt. Arming a weekly digest whose detectors have never run would ship exactly the B8 shape 37.B was built to prevent: a reassuring weekly message that is indistinguishable from silence. The prerequisite for arming is a first real detector run, not a second dry run.

---

## The 37.D finding — the citable supply contribution is 0 MW

This reshapes §37.D and it is the batch's most consequential result.

The intake holds 141 rows. Tiering (derived from evidence, never assigned) gives **36 public-confirmed, 105 private-only, 0 corroborated**. The 105 are excluded from every published number by the privacy architecture. So the entire publishable contribution rests on the 36.

Every one of those 36:

- is **`new-to-us`** — not matched to any of the 188 public fleet entries, so it is genuinely additive rather than a double-count;
- is **LV**, and carries **exactly one citation**, all 36 from `data.gov.lv`, `source_type: registry`;
- has `what_it_confirms` of the form *"entity resolves in the Latvian Uzņēmumu reģistrs, reg. NNNNNNNNNNN, status active"* — and **nothing else**;
- has **`bess_mw` absent or zero. Sum of `bess_mw` across all 36 = 0.0 MW.**

Their only power figure is `site_total_mw` (sum 3 583.5 MW) and their only technology figure is `plant_type` (`SUN E with BESS` 17 · `BESS` 16 · `SUN and WIND E with BESS` 2 · `WIND E with BESS` 1). **Both of those columns come from the private workbook, not from the citation.** The registry confirms a *company exists*; it says nothing about a project, a battery, or a megawatt. (It is also 36 rows over 32 distinct entities — one reg. number, `40203489770`, backs five rows.)

So publishing 3 583.5 MW of "verified bottom-up supply" would be publishing private testimony wearing a registry citation. The arc's own rule forecloses it: *"A row that only exists in the private table stays private-only until a public source corroborates it"* — and corroborating the **company** is not corroborating the **capacity**. Rule #3 forecloses it independently.

**Consequence for 37.D:** the verified-fleet supply enrichment moves **no published or client-facing number**, because there is no citable capacity to move it with. That is the correct outcome under our own rules, not a shortfall in the work — and it is a far more useful result than a number we would have had to withdraw. The delta table at the CP will therefore show zeros across gross Y1 / IRR / min DSCR / client portfolio NPV, with the named cause *"no citable capacity exists in the 37.A evidence set"*, and the three-supply-base comparison becomes the deliverable in its own right.

**Direction check (per prompt §37.D.2), stated explicitly:** a hybrid correction moves supply **down** → `sd_ratio` down → cannibalisation down → **IRR up**. That is the flattering direction, which is precisely why it ships as a band and never as a point. Two independent reasons reinforce it here: the band's own artifact declares itself incomplete (only 24 of 45 known hybrids carry a public technology signal, so the true lower bound sits *below* `lower_bess_mw`), and `cpi` is already pinned at its 0.30 floor, so a supply reduction cannot lift returns without first clearing that floor. **Named unblocker, unchanged from batch-1:** a public hybrid decomposition source stating battery MW separately from site connection capacity.

---

## Incidental finding — the calculator's full tier cannot authenticate from a browser

Found while checking whether the CRM could reuse the calculator's transport. **Verified live, not inferred:**

```
$ curl -i -X OPTIONS https://kkme-fetch-s1.kastis-kemezys.workers.dev/calculate \
    -H "Origin: https://kkme.eu" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type, authorization"
HTTP/2 200
access-control-allow-origin: *
access-control-allow-headers: Content-Type, X-Update-Secret
access-control-allow-methods: GET, POST, OPTIONS
```

`Authorization` is absent from the allow-list, so a browser on `kkme.eu` will refuse to send the bearer token cross-origin to `workers.dev` and `postCalculate` falls into its `catch` — the user sees *"Could not reach the engine."* The sample tier is unaffected (no `Authorization` header ⇒ no preflight). This is a B2 shape: the endpoint tests pass because they call the worker directly, where CORS does not apply.

**Not fixed in this batch.** The fix is one word in the shared `CORS` constant (`fetch-s1.js:62`), which is not an additive change, and the gates for this batch say additive-only unless the CP says otherwise. Recorded for the operator to schedule. The CRM avoids inheriting the bug by carrying its **own** fleet-scoped preflight response that includes `Authorization`, leaving the shared constant untouched.

---

## Design decisions taken here

1. **`FLEET_SECRET`, not `CALC_SECRET`, not `UPDATE_SECRET`.** UPDATE_SECRET authorises data mutation and must never be typed into a browser (its own comment says so). CALC_SECRET gates a product tier whose audience is not guaranteed to be operator-only; the CRM holds contacts and deal comments. Token message is prefixed `fleet:` rather than `calc:`, so neither token verifies against the other endpoint even if the secrets were ever set to the same value.
2. **Fail closed on an unset secret.** No `FLEET_SECRET` ⇒ 503 and zero data, asserted by test.
3. **The static shell carries no data at all.** `/fleet` renders the gate screen; everything else arrives over an authed fetch. The UI leak test greps the built artifact, not a component.
4. **Comment edits go to their own KV key** (`fleet_private:comments`), never back into `fleet_private:index`. A re-run of the intake would otherwise silently discard operator edits — the B10 shape.
