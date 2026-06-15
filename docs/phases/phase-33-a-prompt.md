# Phase 33.A — Map feed Baltic allowlist + reject-on-flag + blank-cod investigation

**Branch:** `phase-33-a-baltic-allowlist` off latest main.
**Estimate:** ~2-3h CC.
**Risk class:** MEDIUM. Worker deploy + new admin endpoint for one-shot purge of non-Baltic fleet entries. Auth via existing `UPDATE_SECRET` (operator memory: `kkme-btd-2026`). Frontend unchanged — `/s4.projects` count drops; map renders fewer dots.
**Three pause points.**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main post-Phase-33 roadmap-delta merge. **VERIFY THE COMMIT ON ORIGIN before reporting done** — Session 74 lost-commit lesson held twice on Phase 33; same discipline here. Worker deploy follows the same operator-runs-deploy pattern (`npx wrangler deploy`; global `wrangler` not installed).

## Why this phase exists

Phase 33's Pause A traced 196 entries in `/s4.projects` with **26 polluters** that don't belong on a Baltic BESS map: Meralco Terra Solar (Philippines, 1290 MW, TSO mislabeled "Litgrid") + entries from CL / SA / AU / MD / AT / BG / HU / RO / SE. Operator quote: "the data is nonsense in some." The contradiction-flag system fires `severity:MEDIUM` on Meralco's "MW=1290 unusually large for Baltic BESS" but **still ingests the entry**. The worker accepts whatever the VPS `kkme_sync.py` POSTs (no allowlist at the fleet endpoint).

Cleanup needs a worker-side defence even though the upstream fix is in the external `~/kkme-control-center` repo: the worker is the last gate before the map renders, and an upstream-only fix means anyone running ingest_daily/kkme_sync (or any future feed source) can re-pollute. Belt-and-suspenders matches the Phase 33 capPrice pattern.

**Out of scope for this phase (split out to 33.A.2):** `storage_by_country.LT.installed_mw = 484 (as-of 2026-03-23)` — separate frozen pipeline; investigation needs operator's 5-10 known-operational-projects sample first to diagnose TSO-lag vs source-coverage vs naming-mismatch.

## Discipline rules load-bearing here

- **#1 audit-triage** — re-verify the 26 polluter count with a live `/s4` curl; re-verify the contradiction-flag ladder location (`fetch-s1.js:111-123` per Phase 33 finding, decision at `:239`); re-verify the POST `/s2/fleet` allow-list location (`:7077` or `:7079` per Phase 33 finding). Empirical, not memory.
- **#4 cross-card consistency** — single-source the Baltic-allowlist constant (`const BALTIC_COUNTRIES = new Set(['LT','LV','EE'])`) at worker module scope; the POST filter, the purge endpoint, and any future fleet-touching code all read from it.
- **#5 roadmap edit-conflict** — no roadmap edits from CC. Cowork applies the delta post-merge.
- **Session 74 lesson** — origin-SHA equality check before any "shipped" claim. Especially because this phase deploys the worker (deploy reads working-tree, can succeed while git push silently fails → prod ahead of source).
- **Session 73 / Phase 33.A.2 lesson** — when CC reports a fix worked, verify via independent curl, not just by re-running the same script. The 3-month frozen `installed_mw` finding was caught by curl after the cron catch-up "succeeded."

## Pause A — Re-verify + locate + propose (~30-45 min)

### A.1 — Polluter inventory + source

1. **Curl `/s4.projects`** → count total; filter by `country not in {LT,LV,EE}` and by blank country. Report: exact count, country mix, sample 3 with full record. Confirm Cowork's 26-polluter number or update it.

2. **Find the POST fleet endpoint** in `workers/fetch-s1.js`. Phase 33 located it at `:7077-7079` (`/s2/fleet` per `s4.projects = s4_fleet.raw_entries`). Confirm path + auth requirement + current allow-list (Phase 33's lock removed `s1_capture`; check if a `country` field is anywhere in the validation).

3. **Locate contradiction-flag ladder.** Phase 33 found `:111-123` (definitions) + `:239` (decision: HIGH→quarantine but still ingested, no reject outcome). Confirm. Trace how `_contradiction_flags` is attached to a fleet entry — at POST time, at compute time, or at read time?

4. **Blank-`cod` investigation.** All 196 entries have empty `cod`. Determine which is true:
   - (a) Worker doesn't extract `cod` from POST payload (schema gap)
   - (b) Worker extracts but normalises to `""` when source is missing it
   - (c) Upstream `kkme_sync.py` never sends `cod` (sample one upstream payload via logs or by checking the kkme-control-center repo)
   
   Decision lands at Pause A: if (a) or (b) → fix in worker this phase; if (c) → file as 33.A.3 upstream task, leave worker alone.

### A.2 — Purge mechanism design

Phase 33's Pause A confirmed `/curate?action=purge_non_baltic` **does not exist** — `/curate` is intel-feed only. Two options:

- (i) **One-shot admin endpoint** `POST /admin/purge-non-baltic-fleet` with `X-Update-Secret: kkme-btd-2026` auth, returns `{purged: N, remaining: M}`. Operator runs once via curl after deploy. Clean separation; auth-gated; idempotent.
- (ii) **Filtered full POST replace** — operator pulls current `/s4`, filters in shell, POSTs back. More steps, error-prone, no audit trail.

Recommend (i). Confirm at Pause A.

### Pause A output

| Item | Finding | Fix scope |
|---|---|---|
| Polluter count | … (re-verified) | … |
| POST fleet endpoint + allowlist | line N, current validation | add country filter |
| Contradiction-flag decision ladder | line N | HIGH severity → reject + log |
| Blank-cod root cause | (a) / (b) / (c) | worker fix OR 33.A.3 file |
| Purge endpoint | doesn't exist | build per (i) |

STOP for operator approval. Operator confirms: (1) country allowlist `{LT, LV, EE}` is exactly right (no edge case like cross-border `BY` Belarus / `RU` Kaliningrad that should be tracked?), (2) HIGH severity → reject (not just quarantine), (3) purge endpoint design (i) is the right shape, (4) blank-cod scope decision.

## Pause B — Build + local verify (~60-90 min)

Scope locked by Pause A approval.

### B.1 — Single-source allowlist constant

Add at worker module scope (near other constants):
```js
const BALTIC_COUNTRIES = new Set(['LT', 'LV', 'EE']);
// Phase 33.A: gates the public Baltic BESS map. Non-Baltic entries (esn international 
// energy storage news pollution) get rejected at POST and purgeable retroactively via 
// /admin/purge-non-baltic-fleet. Single-source per rule #4.
```

### B.2 — POST fleet country filter

At the POST `/s2/fleet` handler (Pause A located):
- For each entry in `raw_entries` payload, check `BALTIC_COUNTRIES.has(entry.country)`.
- Drop entries that fail; do NOT 400 the whole POST (kkme_sync pushes batched — a few polluters shouldn't reject the whole batch).
- Log dropped count + reason: `console.log('[fleet/allowlist] dropped N non-Baltic entries:', sample)`.
- Return envelope: `{ok: true, accepted: K, dropped_non_baltic: N}` so the upstream can see the filter at work.

### B.3 — Contradiction-flag HIGH → reject

At the contradiction-flag decision point (`fetch-s1.js:~239` per Phase 33):
- Current: `severity:HIGH` → `_quarantine: true` but entry is kept.
- New: `severity:HIGH` → drop entry, log: `console.log('[fleet/flags] HIGH-severity drop:', entry.id, flags)`.
- `severity:MEDIUM` → keep flag attached as today (Meralco's C-11 wouldn't have triggered HIGH; needs separate decision).

**Wait — re-read Pause A finding.** If `_contradiction_flags` attachment happens at POST time (not compute time), the HIGH→drop logic goes there. If at read time, it's a different surface. Land the right one.

### B.4 — One-shot purge endpoint

```
POST /admin/purge-non-baltic-fleet
Headers: X-Update-Secret: <UPDATE_SECRET>
```

Logic:
1. Read current `s4_fleet` KV.
2. Filter `raw_entries` by `BALTIC_COUNTRIES.has(entry.country)`.
3. If unchanged → return `{purged: 0, remaining: <N>}`.
4. If changed → write back; return `{purged: <diff>, remaining: <new N>, sample_purged: [...]}`.
5. Auth: 401 if secret missing/wrong (mirror existing `/curate` auth pattern).

### B.5 — Blank-cod handling

Per Pause A decision:
- If (a) or (b): extract `cod` from payload, normalise to `null` (not `""`) when missing — easier to detect downstream. Frontend probably already handles null, but confirm.
- If (c): file Phase 33.A.3 candidate (Cowork-side, post-phase), no worker change.

### Local verification (mandatory)

- `npx tsc --noEmit`: clean
- `npm run test`: all green; **add a test case for the country-filter logic** (synthetic payload with LT+PH+CL entries; assert PH/CL dropped, LT kept, dropped count = 2)
- `npm run lint:no-raw-spacing && npm run lint:no-editorial-chips`: clean
- `npm run build`: 7 routes compile
- Local smoke-test 5 routes + 8 chunk URLs all 200 (lightweight; nothing visual changed)

STOP for operator approval before commit/deploy.

## Pause C — Commit, push, deploy, verify on origin (~30-45 min)

1. `git add` only touched files (`workers/fetch-s1.js` + new test file).
2. One commit: `phase 33.a: Baltic country allowlist + reject-on-flag + purge endpoint`.
3. `git push -u origin phase-33-a-baltic-allowlist`.
4. **Origin-SHA equality check** (Session 74 guard):
   - `git ls-remote --heads origin phase-33-a-baltic-allowlist` → SHA
   - `git rev-parse HEAD` → local SHA
   - Assert equality. If they differ, STOP and report.
5. **Hand operator the deploy command:** `cd /Users/Kastis/kkme && npx wrangler deploy`. Operator runs, pastes back version ID.
6. **Post-deploy verification:**
   - Curl `POST /admin/purge-non-baltic-fleet -H "X-Update-Secret: kkme-btd-2026"` → expect `{purged: ~26, remaining: ~170}`.
   - Curl `/s4` → confirm `projects` length drops; spot-check country mix (LT/LV/EE only).
   - Re-POST a synthetic payload with one PH entry → confirm filtered (look at response envelope for `dropped_non_baltic: 1`).
   - Confirm `/revenue` still shows v7.3 / IRR 18.5% (no unintended interaction — allowlist is fleet-scoped, doesn't touch revenue).
7. **Visual artifact:** `docs/visual-audit/phase-33-a/EVIDENCE.md` with before/after curl outputs. Skip PNGs unless map-visible change is large enough to warrant (~0-1 dot diff per country probably not).
8. **Session 79 handover entry** — count delta, purge endpoint sample output, blank-cod resolution, any Pause A correction to prompt premises.
9. **Final commit push** if handover/audit-md edits happened after step 2's commit. Re-verify origin.

## Out of scope (explicit)

- **Phase 33.A.2 — installed_mw frozen pipeline** — separate investigation, needs operator's 5-10 projects sample to diagnose. Memory `s4-installed-mw-frozen-pipeline`. Do NOT scope-creep into this phase.
- **Phase 33.A.3 — upstream esn_scraper / kkme_sync.py country filter** — external `~/kkme-control-center` repo work. If Pause A's blank-cod investigation finds upstream-only root cause, file as 33.A.3 here.
- **TSO field re-verification** (Meralco labeled `tso: "Litgrid"`) — set upstream; not worker's job to fix; covered by country allowlist (Meralco gets dropped, TSO mislabel becomes moot).

## NDA reminder

Reference asset stays 50 MW / 100 MWh. No supplier / client / project / deal references in code, commits, comments, or handover. The Baltic allowlist is public-data work (TSO ledgers + public registries).

## Pre-flight (operator runs before launching CC)

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-a-prompt.md
```

Commit + push prompt to main as one-line, then launch CC.
