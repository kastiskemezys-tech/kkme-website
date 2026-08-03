# Execution queue — programme close-out

**Operator-owned. One CC session at a time, always. Boundary ritual between every batch: CC wraps → operator merges PR → `git checkout main && git pull origin main` → ping Cowork (roadmap delta + any prompt adjustments) → paste next launch block.**
**No git commands in ~/kkme while a CC session is running.** This file is written while E0 runs — it is untracked and safe; commit it at the next boundary, not before.

---

## NOW: boundary after B-036 + 36.E0.1 (SHIPPED 2026-07-31, PRs #118 + #117 merged)
Roadmap delta applied · playbook rows B9 + B10 added · next: step 1 (Phase 37 batch-1).

**Two operator one-minute steps carried out of this boundary:**
1. `gh secret set ENTSOE_API_KEY` (or Settings → Secrets and variables → Actions) — exact name is `ENTSOE_API_KEY`; the scheduled run cannot fetch without it.
2. Fire `workflow_dispatch` on **Refresh mature-market evidence base (36.E0.1)** once from the Actions tab. `fetch-btd.yml` precedent: BTD blocks Actions runner IPs. Whether the eight sources serve GitHub's IPs is the batch's one unverified claim — one manual run answers it today instead of a silent miss on the first Sunday of September.

---

## QUEUE (strict order)

### ~~0 · B-036 + E0.1~~ **[DONE 2026-07-31]** — DE settled activation source found (A84 per control area, not bidding zone); monthly refresh workflow live. Accession-effect measurement is NOT available from activation data — E2/E3 take break magnitude from capacity evidence, labelled.
<details><summary>original block</summary>

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-36-b036-prompt.md docs/phases/phase-37-arc.md docs/phases/phase-37-a-prompt.md docs/phases/_execution-queue.md
git add docs/phases/phase-36-b036-prompt.md docs/phases/phase-37-arc.md docs/phases/phase-37-a-prompt.md docs/phases/_execution-queue.md docs/phases/_post-12-8-roadmap.md docs/phases/phase-36-e-arc.md
git commit -m "B-036 prompt + phase 37 arc/prompt + E0 roadmap delta + arc amendments + queue"
git push origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/phases/phase-36-b036-prompt.md and execute. Autonomous, ~half day. A5 discipline on netztransparenz.de — verify what downloads contain. No engine changes. Wrap with the E2/E3 calibration verdict + PR URL.
```
</details>

### ~~1 · Phase 37 batch-1~~ **[DONE 2026-07-31]** — 37.A + 37.A.1 corrective pass + 37.B. LV 0 → 36/42 on UR bulk open data; APVA not citable (TAM = B-044); hybrid ships as a band; playbook B11 added; digest wired but deliberately unarmed. Worker additive-only, NOT yet deployed — batch-2 step 0 deploys it.
<details><summary>original block</summary>

Semi-autonomous · checkpoint after 37.A's coverage report (you review verification tiers before 37.B builds). Prompts already committed by step 0's block.

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/phases/phase-37-arc.md (privacy architecture section twice) then docs/phases/phase-37-a-prompt.md and execute batch-1. Semi-autonomous: STOP at the checkpoint after 37.A's coverage report. Non-negotiables: docs/_private/ never staged (assert every commit), contacts/comments never in fixtures/payloads/commits, leak tests from birth, rule #3 for everything entering the public DB. Playbook four-questions at Pause A, source-viability table before engine design.
```
</details>

### 2 · Phase 37 batch-2 — private CRM page + forecast wiring (37.C + 37.D)
**Prompt written: `docs/phases/phase-37-b2-prompt.md`** (carries batch-1's findings: non-vacuous leak tests as the headline gate, hybrid band never correction, APVA opaque, retired-MW accounting as a first-class check). Semi-autonomous · CP before deploy (signed delta table, three supply bases). Step 0 of the batch closes batch-1's two open loops: deploy the additive worker changes, then digest dry-run → arm.

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-37-b2-prompt.md docs/phases/_post-12-8-roadmap.md docs/phases/_execution-queue.md
git add docs/phases/phase-37-b2-prompt.md docs/phases/_post-12-8-roadmap.md docs/phases/_execution-queue.md
git commit -m "Phase 37 batch-2 prompt + batch-1 roadmap delta + queue"
git push origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/playbooks/failure-modes.md, then docs/phases/phase-37-arc.md (privacy architecture section twice), then docs/phases/phase-37-b2-prompt.md, and execute batch-2.

Semi-autonomous. Step 0 first (deploy batch-1's additive worker changes after the origin-SHA + clean-state check, then the digest dry run — arm only if it is clean, and if anything surfaces, STOP the arming and report). Then 37.C, then 37.D. STOP at the CP before deploying anything that moves a public or client number — signed delta table, three supply bases, baseline from a clean worktree not a stash.

Non-negotiables: no public tier at /fleet at all · leak tests non-vacuous and proven failable at API AND rendered-UI level (seed private values, vacuity guard, inject-then-remove proof) · private-only rows excluded from every published number, asserted in payload tests · hybrid ships as a band re-derived from hybrid-band.json, never as a correction from the private column · apva_flag renders as opaque private testimony, never as a verification signal.
```

### 2.5 · Phase 37.H1 — hygiene: browser-auth fix (B-045) + digest arming (B-046) + 37.D counterfactual
**Prompt: `docs/phases/phase-37-h1-prompt.md`.** Autonomous, ~1.5-2 h. Runs before the E-arc: B-045 is a live product defect on the gated calculator's front door, B-046 is an alert pipeline that can't yet be trusted, and the counterfactual makes 37.D's wiring verifiable. All three are the same class — green but not actually working.

### 2.55 · Phase 36.E0.2 — manifest single-writer + provenance integrity (B-048, RESCOPED ~1 h — fold into the E1+E2 batch as its step 0)
**B-048 downgraded P1 → P3 after CC's own correction.** No second writer ran: both changed shards match the worktree manifest's sha256, manifest and shards share mtime 2026-07-30 10:40:02 UTC, and the fetcher stamps `retrieved_at` at end-of-run — so a run finishing 10:40:02 cannot stamp 10:25:46.517Z. Manifest and data are CONSISTENT: the dataset contains no refresh output and its manifest claims none. `never_refreshed` is the correct reading and the "acquired by hand in 36.E0" explanation is TRUE of this artifact. Investigation doc carries the correction on top, original unedited below.

Surviving scope (both real, just unexercised): (1) **one canonical manifest writer** — `fetch-activation-prices.mjs:590` builds from scratch and bypasses `preserveAcquisitionMetadata()`; route it through the same merge/preserve path, grep-gate from-scratch construction. (2) **Append-only assert on provenance keys** — any write removing one fails the gate.

**Inverted, do NOT build:** provenance-absence as its own ERROR state would have false-alarmed on this artifact, which is honest and self-consistent. Any such check must compare provenance against **what the data actually contains**, not against mere key presence. The rule-#2 line on the monitor's explanatory text also falls away — the text was accurate.

**B12 stays banked as a latent hazard, not as evidenced here:** if a stamp were ever destroyed while the data stayed, the source would go permanently silent.

### ~~2.56 · The unexplained rollback~~ **[RESOLVED 2026-08-01 — not a defect, nothing was ever lost]**
The reflog named it to the second: `13:40:02 +0300` = `10:40:02 UTC`, a plain branch switch from `evidence-refresh/2026-07` back to `phase-36-b036-activation-source`, whose tip predated the refresh — git rewrote the three tracked files to that branch's committed state and stamped each with the operation's wall clock. No stash, no worktree merge, no rollback path in any script (which is why the grep found nothing). `1d8ae0a` is an ancestor of HEAD and HEAD's committed `.gz` blobs hash to exactly the shas the HEAD manifest records: **the worktree was stale on three files and carried nothing unique.** That inverted the earlier restore — reconciling the manifest DOWN to stale data was the wrong direction, the authoritative state was in git throughout — so it was redone with `git checkout main --` on all three together: checksums 16/16, rows tie 286,137, loader green, coverage 8 fields / 186 per_month, all five provenance keys present, freshness `activation · fresh · 1m · 2026-07-30 · 2d · 60d`. Lesson recorded by CC: the deciding evidence was in the FIRST `git reflog` of the session, but only the top eight entries were read — two days short. **Standing habit: reflog reads are date-bounded (`--date=iso` + a window covering the artifact's mtime), never top-N.**

<details><summary>original entry</summary>
Something restored the pre-refresh artifacts — data AND manifest together, consistently — three minutes after a successful refresh completed. Neither script has a rollback path. **HYPOTHESIS (Cowork, unverified): a git operation, not a script.** `git checkout -- <path>` / `git restore` / a stash round-trip / the isolated-worktree merge done during phase-37 batch-1 all rewrite tracked files wholesale to their committed state and stamp them with the operation's wall-clock time — which is exactly the signature observed (whole-file consistency + shared mtime). Settle with `git reflog --date=iso` around 2026-07-30 10:40 UTC plus shell history before re-running anything. **Do not manually re-run the refresh to "fix" the state:** the monthly schedule fires Sunday 2026-08-02 03:00 UTC (cron `0 3 1-7 * 0`), which regenerates the data through the reviewed PR path AND doubles as the first real test of source reachability from Actions runner IPs — the loose end left open at E0.1.
</details>

### ~~2.6 · Phase 37.B.1 — the detector runner + digest arming~~ **[DONE 2026-08-02, PR #123]** — 7 detectors stamped, 5/7 capable, zero proposals with controls proving the zero, digest armed for Mondays 07:30 UTC / 10:30 Vilnius.

### 2.65 · Phase 37.B.1a — schedule the runner (~45 min, do before the second Monday)
**The gap CC flagged:** nothing schedules the runner. The digest fires weekly regardless, so from ~2026-08-15 it will correctly report `queue_disappearance` and `press_negative` as stale — the staleness surface working as designed, but the heartbeat currently measures the digest, not the runner. **Host: the VPS**, not Actions — `UPDATE_SECRET` already lives there, the existing crons already source it, VERT and lv_press exist only as files on that box, and 37.B.1 already ran the POST from there via `--emit-payload`. No SSH-to-prod secret surface gets added anywhere. Scope: weekly cron timed to land BEFORE the Monday digest (07:30 UTC) with enough margin for a slow register pull · the redirect-path lesson from 36.C (cron opens its redirect before the command runs — the log directory must exist and be consumer-checked) · a runner-staleness alert distinct from the digest's own, so a dead runner is visible without waiting for a digest to describe it · B8 answer in the commit.
**Premise correction from H1:** there is no detector runner at all. `fleet_lifecycle:detectors` has one writer fed by a caller that does not exist — grep for the ingest endpoint outside the worker returns 16 hits, all tests. So 37.B's seven lifecycle signals, rename guard and retirement policy are shipped code that has never executed against real data, and the digest cannot be armed because there is nothing to report. Scope: the scheduled runner (Actions or worker cron — decide at Pause A on the same grounds E0.1 used), a first real run with `/health.fleet_lifecycle` populated before/after, then arming in its own commit with the first-firing time stated. ~2-3 h, not hygiene.

### 2.7 · Phase 36.E0.3 — refresh-workflow correctness (~1 h, before the E-arc)
Four filings from Sunday's first real firing, all in the automation that grounds E1-E6:
- **B-051 (P1, operator 30 s):** repo Settings → Actions → General → Workflow permissions → tick *Allow GitHub Actions to create and approve pull requests*. If org policy forbids it, fall back to a PAT-less alternative: the workflow pushes the branch (already works) and posts the compare URL to the existing alert channel — never a silent success.
- **B-052:** `0 3 1-7 * 0` ORs DOM with DOW → ~11 firings/month. Canonical fix: `0 3 * * 0` plus a first-step day-of-month guard (`[ "$(date -u +%d)" -le 7 ] || exit 0`). Correct the workflow comment; add a test asserting comment and schedule agree in MEANING, not just presence.
- **B-053:** `set -o pipefail` on every piped gate, and **diagnose the 3 tests that failed in the Actions run** — they passed locally, so the divergence is the finding, not the flag.
- **B-054:** `max_age_hours` 720-1080 makes a dead weekly runner invisible for 30-45 days. Set per-source thresholds from each source's own cadence (weekly runner → ~10 days), not one global constant.
- **Also:** review the `evidence-refresh/2026-08` branch's append-only anomalies — se/da restated boundary-hour prices, da withdrew 24 rows. Both correctly withheld their stamps; the decision to accept or reject the restatement is an operator call and the model for every future month.

### 2.8 · Trailing-edge lag (filed by E0.3, apply at the next refresh-touching slot, ~20 min)
Both August anomalies tripped on the **trailing edge** — the refresh reads a market before it has finished publishing, so the newest window is provisional and gets restated next run. This recurs every month by construction. Fix: a 2-day exclusion (or equivalent lag) on the refresh window, orchestrator-side. Not applied in E0.3 because it changes the orchestrator rather than the month's data. Do it BEFORE the September firing, otherwise September reproduces August's two red flags for the same benign reason.

### 2.9 · B-051 still OPEN (P1) — Actions cannot open PRs
Repo tick did not take effect; an 08:09 UTC `workflow_dispatch` still returned *GitHub Actions is not permitted to create or approve pull requests*. **Check the ORG-level setting** — `kastiskemezys-tech` org → Settings → Actions → General → Workflow permissions → *Allow GitHub Actions to create and approve pull requests*; org policy overrides the repo setting and the repo toggle can appear ticked while the org forbids it. Fallback is shipped and demonstrated (labelled issue with the compare URL + a red job), but a notification is not a review shape — the monthly evidence PR is the thing E0.1 exists to produce.

### 2.95 · Phase 38 — site ↔ engine sync audit + capability surfacing (**next after E1/E2 merges**)
**Prompt: `docs/phases/phase-38-sync-audit-prompt.md`.** Operator trigger 2026-08-02 after reviewing the live site: everything shipped since the last site-facing phase must be *utilised*, the site must reflect the current builds, and the framing is **the site is the argument, the calculator is the in-depth product within it**. Semi-autonomous, checkpoint after the audit before any change. Covers: full provenance sweep (every rendered number → canonical field, rule #4) · S1's 33 h staleness · the APVA public figure vs 37.A's not-citable verdict · FLEX FLEET 782 MW vs 651 MW installed · LV completeness · and the surfacing inventory including the parked dispatch-card → hourly-engine cutover. Screenshot-derived items are hypotheses (rule #1, ~25 % reliability class) — triangulate before treating any as a defect.

### 2.96 · Phase 38 follow-through — three batches, strict order (signed 2026-08-02)
Audit artifact: `docs/investigations/2026-08-02-phase-38-sync-audit.md`. All four screenshot-derived items CONFIRMED (visual inference on your own site, where you know what the number should be, is a different instrument from third-party visual audit — record that against the 25 % base rate).

- **38.1 — the S1 outage + its monitoring (P1, deploy same batch).** S1 branch has failed 8 consecutive ticks and intermittently for ≥1 week; `computeCapture(env)` takes only `env` yet sits inside the success branch, so a `computeS1` rejection kills a capture that would have worked; the only unguarded throws are `fetchBzn(LT)` and `fetchBzn(SE4)`. Fix: decouple capture, guard the fetches individually, add `[observability]` (there are no logs today), add `s1_capture` to `STALE_THRESHOLDS_HOURS`. **B-047 escalates to P1 and lands here** — unmatched GETs recompute S1 and WRITE the `s1` key, so `/health`'s s1 entry measures probe traffic rather than the pipeline. Same root cause fixes the `da_tomorrow` mirror (forecast panel serving `2026-08-01` at €101/MW/day beside a realised €487). Also: S1 badges the data stamp, S2 badges the fetch stamp — S2's `data_window_end` is 3 days behind and rendered nowhere.
- **38.2 — corrections sweep (7 mechanical + 5 copy + 1 number).** Includes the `/s4` 10-field whitelist dropping `baltic_weighted_mw`, which leaves 36.D's canonical S/D caption dark at both call sites and the quarantine tooltip reading "0 MW flagged"; the "(BESS + pumped hydro)" label on a population with zero pumped-hydro entries; the "Kruonis flex share 131 MW" line, which is `max(0, 782 − 651)` — a fleet-tracker-over-registry gap relabelled as a 205 MW asset that is in neither population (rule #2, live); ENTSO-E citations on payloads sourced from energy-charts.info. **One public number moves: LV installed 40 → reconciled**, with a delta table — the canonical field is the ONLY artifact saying 40 (coverage_note 80, `assets[]` 80, `fleet.countries.LV.operational_mw` 99, metricRegistry.ts:52 "Rēzekne 60 + Tume 20 = 80"); reconcile all three values with citations rather than adopting 80 by majority.
- **38.3 — dispatch-card → hourly-engine cutover, own phase, NOT bundled with E6.** Third by design: fix the stale inputs, then ship corrections that all cut unflatteringly, then raise the headline. Own 54-config delta table, baseline from a clean worktree against one frozen KV snapshot (C6, never a stash); the three routed card defects travel with it. **Open question that must be answered or explicitly declared unanswered in the drawer, same phase:** the cutover moves cycling 498 → 222 EFC/yr and 36.B5 already recorded 498 as below the observed merchant band (550-720).
- **Deferred to its own scoping (post-E-arc):** the IA break-points — structure → returns has no bridge because everything that would build it is unsurfaced (B1 hourly engine, B2 distribution, **B4's contracted-floor asymmetry — 4.6× tail lift at 50 % contracted, the most commercially expressive thing we own**, the 299-day history, 37.D's "citable contribution = 0 MW", the hybrid band, the lender annex); the reference asset never mentions the calculator; intel feed down to 3 items, one category, newest 9 July; the Baltic index publishes 1 of 3 countries at a two-month-old month.

### 3 · 36.E batch — E1 (FCR) + E2 (aFRR/PICASSO)
Prompt authored at boundary on E0's approved evidence base. Autonomous unless E0's checkpoint changed the specs.

### 4 · 36.E batch — E3 (mFRR/MARI) + E4 (DA spread-equilibrium)
Prompt at boundary. Autonomous.

### 5 · 36.E batch — E5 (intraday) + E6 (integration + continuity gate)
Prompt at boundary. **E6 carries the arc's second checkpoint: the continuity gate + per-product divergence table get operator sign-off before the per-service models replace the blended CPI anywhere public or client-facing.**

### 6 · 36.F — the report tool (F0 → F4, programme close)
F0 visual checkpoint (you approve every chart type in both themes) · F1 copy-deck editing pass (yours — that pass IS the anti-AI guarantee) · F2-F4 with the intake checklist. Prompts at boundaries.

---

## Standing rules for every batch (compressed)
- One CC session, one worktree, serial. Parallel lanes only ever via `git worktree` and only with Cowork planning it.
- `docs/playbooks/failure-modes.md` four-questions at every Pause A.
- Evidence-not-narrative in every handover: SHA-compare output pasted, gates pasted, test deletions/weakenings called out.
- Deploys: only from verified-synced state · verification at the correct tick · public/client number movements isolated in own commits with quantified deltas, operator-signed.
- `docs/_private/` never staged, ever. Leak tests wherever private data flows.
- Boundary ritual is not optional — three orphan commits and two stale deploys were the tuition.

## Parked / triggers
- **Phase 37 candidate (dispatch-card → hourly-engine cutover):** raises public IRR materially; deliberately parked for sequencing optics. Revisit after the E-arc ships.
- **BTD/AST reply:** if AST answers the sent email, small follow-up (worker-secondary self-heal or UA/rate adjustments) — slot at any boundary.
- **Prosperus:** delivery bundle regenerates on the current measured basis with one command whenever the conversation warrants; after 37.D + E6, regenerate before any client send (numbers will have moved — attributably).
- **B-045 (CORS `Authorization` preflight) — NEXT, ahead of the E-arc.** The calculator's full tier cannot authenticate from any browser; endpoint tests pass because they bypass the browser. One word in the shared CORS constant + a browser-layer regression test so the class can't recur. Small, but it is the gated product's front door and it is broken in production today.
- **B-046 (arm the weekly digest):** blocked on a first REAL detector run, not another dry run — `/health.fleet_lifecycle` reports `never_run`, and the renderer correctly refuses to distinguish a quiet week from a dead pipeline. Sequence: trigger detectors once → confirm `/health` shows populated detectors → arm the cron in its own commit.
- **37.D counterfactual test (do it with B-045 or the next fleet slot):** every CP delta was zero because the citable capacity contribution is 0 MW — which means the enrichment path is currently unverifiable by its effect. Add a synthetic fixture carrying a CITABLE capacity source and assert the supply trajectory moves; without it, 37.D's wiring is code no test can prove is live.
- **37.B.2 — entity names on public fleet rows (the gap that makes the best detector useless).** `registry_terminated` / `registry_absent` are the most reliable signals in the set, and their entire eligible population (36/48) is private-tier: no public-fleet row carries a legal-entity name, so neither can ever retire anything published. Source path: VERT permit holder names (LT), Litgrid/Elering queue entrants, registry cross-match — each entering the public DB with its own citation per rule #3. Also the natural home for the **41 untracked live LV entities** 37.B.1 surfaced (2026 incorporation wave: BESS 1/2/3/5/6/33, AVER Energy Storage 1-4, THE BATTERY STREET 2-8, Krustpils / Dobele / Pupuķi / Ķauķi BESS, BESS Parks Latvia) — these are register name-matches, NOT projects, and stay candidates for operator review in `/fleet` until a source attests a project.
- **37.B.3 — detector source coverage.** Three of the four non-acting detectors are source problems, not code problems: `press_negative` scans lv_press for commissioning tokens only (no insolvency/cancellation vocabulary — its silence is not evidence); `vert_permit_expired` is blind at 0/243 eligible (VERT serves 23 records with 1 expiry date; 224 LT rows match no permit holder); 117 fleet rows carry no timestamp for `evidence_stale` to age. `queue_disappearance` self-heals — 37.B.1 wrote the first snapshot, it can fire from the second run onward.
- **B-055 (E0 summary table silently truncated):** the published table's DE arbitrage series stops at 2025-09 because it filters day-ahead to PT60M and Germany went 15-min MTU on 2025-10-01 — eleven months of denominator vanish with no error. Filters agree to 2.57 % mean over the 84 shared months, so the switch is safe; the table is published and feeds citations, so fix it at the next evidence-touching slot.
- **B-047 (worker has no 404):** unmatched paths fall through to the S1 payload with 200. Public data, so not a leak — but path probes cannot distinguish absent from present, which quietly weakens every B11 control run against the worker. Small fix, real diagnostic value.
- **B-048 (manifest.json −584 lines net, flagged not diagnosed):** surfaced dirty in the worktree from a 10:45Z consultancy run during H1. Exactly the B10 shape — a refresh that shrinks a coverage manifest while checksums pass. Diagnose BEFORE any further run overwrites the evidence; capture the diff to a file first.
- **B-044 (TAM / EU State-aid Transparency Award Module):** the only route to making `apva_flag` citable (aid >€100k must be published by law). Client-rendered app behind a language gate — needs a browser-rendering pass or its query API, not a plain fetch. Slot when a citation for 55 LT rows is worth an hour.
- **B-043:** AU/DA fetchers rewrite their own fixtures each run — churn in every monthly refresh PR.
- **EE coverage 2/15:** the weakest arm after batch-1. EE bulk open data was a demonstrated build spike, not a dead end — a batch-3 or hygiene slot closes it the way LV closed.
- **B-034/B-035, LV/EE flexibility assessments, Litgrid Q4-2026 plan watch, LT fleet tiering:** hygiene slots between arcs.
