# Phase 33 — Revenue engine drift + VPS cron recovery + map feed quality

**Branch:** `phase-33-engine-drift-and-feed-quality` off latest main.
**Estimate:** ~4-6h CC (could split mid-Pause-A if scope too large; see Pause A "Split decision" below).
**Risk class:** HIGH. Touches the live revenue engine (IRR is currently wrong on production at 49.6%), VPS ops (a frozen cron, possibly same failure mode as Session 73), and the map ingestion path (international energy storage news polluting the Baltic feed). Each is independently P0/P1 for trust in the published numbers.
**Three pause points.**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main, branch from `origin/main` post-pull. **VERIFY THE COMMIT ON ORIGIN before reporting done** — `git ls-remote --heads origin <branch>` + SHA equality check. The Session 74 lost-commit failure mode (CC reports "pushed", commit doesn't exist on origin, deploy succeeds anyway → prod ahead of git) is especially dangerous here because Pause C deploys the worker.

## Why this phase exists

Operator returned today (2026-06-15) after time away and flagged three things:

1. **"It shows 50% IRR now"** — verified by Cowork curl: `/revenue` returns `project_irr = 0.4963`, `equity_irr = 1.0227`, `moic = 17`, `gross_revenue_y1 = €13.65M`. Phase 32.1 (Session 76, 2026-05-27) verified the engine at IRR 17.08% with all assumptions identical to today. **3× drift in 19 days, no code change since June 8 (Portfolio link, harmless).** Data-driven drift, not code drift.

2. **"I don't think any new projects were actually added to the map"** — verified by Cowork curl: `/s4.projects` lists 196 entries; most recent meaningful update is 2026-05-15 (1 month stale), bulk dated 2026-03-07 (3+ months). Also visible: feed pollution (Meralco Terra Solar Philippines with TSO "Litgrid", entries from CL/SA/AU/MD/AT/BG/HU/RO/SE — international energy storage news leaking into the Baltic feed). `contradiction_flags` fire ("MW=1290 unusually large for Baltic BESS") but the project is still ingested. All 196 projects have blank `cod`.

3. **"I fear some errors started appearing"** — the umbrella: this phase verifies + fixes the visible drift and adds upstream guards.

Cowork-side observation (background for CC, do not assume true without re-verifying): the 19-day clock on the IRR drift coincides exactly with `baltic_storage_index_latest` showing age=456.8h (~19 days). That's the same VPS cron that broke for 20 days in Session 73 (the inline-cron `.env` source short-circuit), and was supposedly hardened (`&& → ;`). Hypothesis: either the hardening didn't hold, OR a different failure mode bit the same cron, OR the drift is unrelated and just temporally adjacent. **Don't assume causation — verify.**

## Discipline rules load-bearing here

- **#1 audit-triage** — THE rule. Cowork has empirical reads (curl output) but every claim below is a hypothesis. Pause A must triangulate code-grep + curl + log-mod-time before scoping the fix. The "FCR sd_ratio=28.5 vs fleet sd_ratio=2.69" anomaly is the highest-signal lead but could have a benign explanation (different normalisation).
- **#4 cross-card consistency** — extends naturally: bounds on CPI inputs should be ONE canonical bound module so a stale input can never blow up IRR across cards.
- **#5 roadmap edit-conflict** — no roadmap edits from CC. Cowork applies the delta post-merge.
- **Session 73 lesson** — VPS inline-cron `.env` source short-circuit was fixed `&& → ;`. If that pattern recurred, harden further (move to `set +e; source .env; set -e` or to a wrapper script with own-line source like `cron_daily.sh`).
- **Session 74 lesson** — verify origin before reporting done. Especially critical because Pause C includes `wrangler deploy` — deploy reads working-tree file, can succeed while git push silently fails → prod ahead of source.

## Pause A — Diagnose all three workstreams (no writes, no deploys) (~60-90 min)

### A.1 — Revenue engine drift (highest priority)

1. **Re-pull live `/revenue`** and confirm Cowork's reads (project_irr ~0.50, per_product_at_cod.fcr.sd_ratio ~28.5, fleet.sd_ratio ~2.69, prices_source "BTD partial"). If numbers have already self-corrected, flag it but continue the diagnosis (the bug is in the codepath, not the snapshot).

2. **Trace per-product CPI inputs.** Grep `workers/fetch-s1.js` for `per_product_at_cod`, `cpi_at_cod`, `sd_ratio`, `cpi_fcr`, `cpi_afrr`, `cpi_mfrr`. Build a call-graph: what KV values feed the per-product `sd_ratio`? What's the formula? Where could a stale or partial input produce 28.5 when the fleet number is 2.69?

3. **Test the bounded-input hypothesis.** Find the function that computes `per_product_at_cod.fcr.sd_ratio`. Check whether its inputs have any sanity bounds. The classic failure mode: a denominator goes near-zero and a ratio explodes; or a sum over a series uses N=1 instead of N=expected. The CH benchmark (`ch_benchmark.irr_2h: 0.166`) is the sanity ceiling; the engine should never exceed it by 3× without an explicit, documented reason.

4. **Identify which engine version is serving.** `model_version: v7.3` is reported but Session 76 noted live `/revenue` was `v6_fallback`. Grep `v6_fallback`, `computeRevenue_v6`, `computeRevenueV7` and determine which path is producing the 49.6%. The fix must be applied to the path that's actually serving (V6 fallback, V7, or both — if both, single-source the bound).

5. **Quantify the upstream linkage.** Is the broken `sd_ratio` derived from `baltic_storage_index_latest` (the stale KV) or from another freshness-tracked KV (s2 stale at 63.4h, da_tomorrow missing)? If yes → drift is curable by restoring the upstream; if no → there's a latent bug independent of cron health.

### A.2 — VPS cron health

1. **SSH to the VPS** (operator's existing creds). Check `crontab -l` — confirm Session 73's hardening (`&& → ;` on all 4 inline crons) is still in place. Diff against `/opt/kkme/config/crontab.bak.20260527`.

2. **Log-mod-time forensics** on `/opt/kkme/logs/`: `ls -lt | head -30`. Pay attention to `baltic_storage_index_*.log`, `kkme_sync_*.log`, `hourly_grid_*.log`, `ingest_daily_*.log`. Identify which crons stopped writing and when.

3. **Run the broken cron manually** with `bash -lc 'source /opt/kkme/config/.env ; cd /opt/kkme/app/sync && python3 baltic_storage_index.py'` (mirroring the cron line exactly) and capture stderr. If it errors, the .env / dependency / data-source issue is reproducible. If it succeeds, the cron daemon stopped scheduling it (cron service status check).

4. **Inspect `.env`** for any new orphan lines or syntax problems since Session 73. The original break was lines 12-14 (3 orphaned secret values). Don't read or output the file contents into the prompt log — just verify integrity.

5. **Telegram watchdog state.** Check whatever VPS-side watchdog runs (likely a separate Python script in `/opt/kkme/app/` or a wrapper). Did it page on the 19-day baltic_index staleness? Follow-up #94 from Session 73 is the open ticket for "watchdog escalation tier" — this is the chance to scope a fix.

### A.3 — Map feed quality

1. **Grep the ingestion path:** `grep -rn "meralco\|terra.solar\|esn\b" workers/fetch-s1.js app/` to find where international energy-storage-news bleeds in. Likely an unbounded RSS pull from `esn` (Energy Storage News) without country-allowlist.

2. **Find the contradiction-flag handler.** Curl showed `_contradiction_flags: [{id: 'C-11', severity: 'MEDIUM', msg: 'MW=1290 unusually large for Baltic BESS'}]` on the Meralco entry — the flag fires but doesn't block. Grep `_contradiction_flags`, `C-11`, the severity ladder. Determine where in the pipeline an `accept | flag | reject` decision happens, and whether `severity:MEDIUM` should reject for non-LT/LV/EE entries.

3. **The blank-`cod` problem.** All 196 projects have empty `cod`. Either (a) the ingestion isn't extracting COD from sources, (b) it's extracted but dropped at normalisation, (c) the source feeds don't carry COD. Grep `cod` in ingest path + sample 3-5 source URLs for a project with known COD to determine which.

4. **Country normalisation.** 8 projects have blank country, 1 has `"  "` whitespace (the Meralco entry). The map widget filters by country — blank-country projects are visible but uncategorised. Determine if country is required or optional in the ingest schema and where it's set.

### Pause A output (single report to operator)

| Workstream | Root cause (or hypothesis if unconfirmed) | Fix scope | Risk | Estimate |
|---|---|---|---|---|
| Revenue drift | … | … | … | … |
| VPS cron | … | … | … | … |
| Map feed | … | … | … | … |

**Plus:**
- If revenue drift root cause is in `v6_fallback` AND `v7`, propose a single canonical bound module (extends Phase 32.1 single-source pattern — operator memory `project_reference_asset_single_source.md`).
- If VPS cron failure mode is the same as Session 73, propose hardening beyond `&&→;` (e.g., wrapper-script pattern like `cron_daily.sh` with `set -uo` and own-line source).
- If map feed scope is large (likely), recommend deferring sub-items to a Phase 33.A follow-up so this phase doesn't balloon.

**Split decision:** if Pause A finds the three workstreams together are > 4h of build work, propose at the bottom of the report: "split into Phase 33 (revenue + VPS, P0) and Phase 33.A (map feed, P1)." Operator picks.

STOP for operator approval before any writes or deploys.

## Pause B — Build + local verify (no deploy, no commit) (~90-120 min)

Scope locked by Pause A approval. The following is the maximal scope; trim per operator's split decision.

### B.1 — Revenue engine: bounded CPI inputs

1. Add `clampSdRatio(x, label)` (or similar named helper) in `workers/fetch-s1.js` that clips per-product S/D ratios to a sensible band (e.g., `[0.1, 10]` — operator confirms exact band at Pause A from `ch_benchmark` ceiling). The clamp logs the clip event (won't reach production logs, but signals intent).

2. Wire the helper into every site that computes `per_product_at_cod.{fcr,afrr,mfrr}.sd_ratio`. If both V6-fallback and V7 paths have their own copies, single-source the bound: `const CPI_SD_BAND = { min: 0.1, max: 10 }` at module scope, used by both. This is the Phase 32.1 single-source pattern applied to CPI bounds (memory: `project_reference_asset_single_source.md`).

3. Add a Vitest case in `app/lib/__tests__/` that drives the worker engine with a synthetic stale input and asserts the IRR stays bounded (≤ ch_benchmark.range upper, which is 0.31 for 2h). This is the regression guard — same pattern as `rteMirror.test.ts` from Phase 32.1.

4. **Direction of impact:** the clamp will lower the live `project_irr` from 49.6% toward the ch_benchmark band (likely landing 12-25%). That's a visible number drop on production. **Pause B sub-stop:** report the expected new IRR + the clip event(s) that fired + operator confirms before continuing.

### B.2 — VPS cron: harden + catch up

1. If Pause A confirmed Session 73's `&&→;` is still in place but the cron broke anyway, escalate hardening: convert the inline cron line to call a wrapper script `/opt/kkme/scripts/baltic_storage_index_wrapper.sh` that mirrors `cron_daily.sh`'s structure (`set -uo pipefail; source /opt/kkme/config/.env || true; cd …; exec python3 …`). Same for whichever other inline crons broke.

2. Catch up the missed runs manually (same playbook as Session 73 step 2). Confirm worker `/health` for `baltic_storage_index_latest` returns to <1h.

3. Backup the new crontab to `/opt/kkme/config/crontab.bak.20260615` for the audit trail.

### B.3 — Map feed: allowlist + reject-on-flag

1. Country allowlist at ingest: only `LT | LV | EE` projects enter the `s4.projects` KV. Non-Baltic entries (Philippines / Chile / Saudi / Australia / etc.) are dropped at the ingest boundary. If the existing KV already has pollutants, write a one-time cleanup script (or instruct operator to run `POST /curate?action=purge_non_baltic` with `UPDATE_SECRET=kkme-btd-2026` — operator memory).

2. Reject-on-flag for `severity:HIGH` contradictions; keep `severity:MEDIUM` as warn-but-accept. The C-11 "MW unusually large" should be HIGH for Baltic-context entries; that's the threshold that should have rejected the Meralco entry.

3. COD extraction: out of scope for this phase unless trivially fixable from Pause A's source-sample check. If non-trivial, file as Phase 33.B follow-up.

### Local verification (mandatory before commit)

- `npx tsc --noEmit`: clean
- `npm run test`: all green including new bound-test
- `npm run lint:no-raw-spacing && npm run lint:no-editorial-chips`: clean
- `npm run build`: 7 routes compile
- `npm run start` + visit `/` + open RevenueCard drawer: IRR shows the new bounded value, not 49.6%
- Local smoke-test 5 routes + 8 chunk URLs all 200

STOP for operator approval before commit/deploy.

## Pause C — Commit, push, deploy, verify on origin (~30-45 min)

1. `git add` only the touched files. One commit, clear message naming all three workstreams shipped (or however the split landed): `phase 33: bounded CPI inputs + VPS cron hardening + map allowlist`.

2. **Push the branch:** `git push -u origin phase-33-engine-drift-and-feed-quality`.

3. **Verify the commit on origin** — Session 74 lost-commit guard:
   - `git ls-remote --heads origin phase-33-engine-drift-and-feed-quality` → SHA
   - `git rev-parse HEAD` → local SHA
   - Assert equality. If they differ, STOP and report — do NOT deploy a worker change without git source.

4. **Worker deploy:** `wrangler deploy workers/fetch-s1.js` (only if B.1 ran). Capture the deploy version ID.

5. **KV refresh:** the bounded CPI math runs on next cron tick (`0 * * * *` for /revenue inputs). Force a refresh if available (POST endpoint with UPDATE_SECRET).

6. **Production verification:**
   - `curl https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue` → confirm `project_irr` is now in the ch_benchmark band, `per_product_at_cod.fcr.sd_ratio` is now within [0.1, 10].
   - `curl .../health` → confirm `baltic_storage_index_latest` age < 1h, `s2` age < 48h.
   - `curl .../s4` → confirm `projects` is now Baltic-only (no PH/CL/SA/AU entries).
   - Visit `https://kkme.eu` on dark + light, scroll to RevenueCard, open drawer, screenshot IRR + LCOS + DSCR.

7. **Visual artifact:** `docs/visual-audit/phase-33/revenue-card-bounded.png` + `health-post-cron-recovery.png`.

8. **Handover Session 78 entry** with full results, the new IRR value + ch_benchmark proximity, VPS cron recovery log, map projects count after allowlist.

9. **Final commit push** if any handover/audit-png edits happened after step 1's commit. Re-verify origin.

## Out-of-scope (operator can file follow-ups via Cowork)

- COD field extraction for map projects (Phase 33.B candidate).
- Watchdog escalation tier for >Nx threshold staleness (follow-up #94 from Session 73 — Cowork-side scope).
- Worker route fallthrough cleanup (`/version`, `/diag`, etc. return /s1 instead of 404 — cosmetic, P2).
- Map feed source diversification (only `esn` and `litgrid` feeds appear active; broader Baltic-specific feeds may exist).
- Revenue engine V7 vs V6 reconciliation — if both serve, the bound applies to both; the V6→V7 cutover decision stays a future phase.

## NDA reminder

The reference asset on the public site stays **50 MW / 100 MWh** with generic ranges. Do not reference Bitėnai / Energia Futura / Prosperus / supplier names anywhere in this phase's code, commits, comments, or handover. CPI bounds derived from Clean Horizon public benchmark (`ch_benchmark`) — that's the public anchor for the clamp band.

## Pre-flight (operator runs before launching CC)

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-prompt.md
```

Then commit + push prompt to main as a one-line commit, then launch CC.
