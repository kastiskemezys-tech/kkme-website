# Phase 33.B — BTD `*_cap_avg` re-parse investigation + FCR disclosure watch setup

**Branch:** `phase-33-b-btd-cap-reparse` off latest main.
**Estimate:** ~1-2h CC. Heavy Pause A investigation (BTD payload + parser path), lighter Pause B (small parser update OR documentation if BTD lacks cap fields), Pause C deploy + verify.
**Risk class:** LOW-MEDIUM. The Phase 33 capPrice engine bound protects IRR even if this phase's parser change goes wrong — calibrated constants (afrr 7.06 / mfrr 19.74 / fcr 0.36) keep the engine in-band as a safety net. Worst case: parser change has no effect, `prices_source` stays "BTD partial," engine continues serving via calibrated fallback.
**Three pause points.**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main post-Phase-33.A roadmap-delta merge. Session 74 origin-verify guard at Pause C. Operator-runs-deploy pattern (`npx wrangler deploy`).

## Why this phase exists

Phase 33's Pause A traced the IRR drift root cause to `computeBaseYear`'s capacity-price fallback at `fetch-s1.js:2431`: `fb_afrr_cap = s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.7`. When `s2.afrr_cap_avg` went null (~May 27), it fell to the activation price `afrr_up_avg=37`, inflating revenue 3×. Phase 33 fixed this with a single-source `capPrice()` helper + calibrated constants + [0,50] clamp.

But `prices_source: "BTD partial"` persists on production — the calibrated-constant fallback is ALWAYS active because `s2.*_cap_avg` are still null. The engine bound is meant to be a safety net for future source gaps, not the steady-state. Two possibilities (Pause A determines which):

1. **BTD carries capacity prices under a different schema/field name** — the parser is reading the wrong path, fix is to remap. Then `s2.*_cap_avg` populates → `prices_source: "BTD full"` → capPrice bound becomes the safety net it was designed to be.
2. **BTD doesn't carry capacity prices at all** — the data legitimately moved away from BTD (or never was there); calibrated constants are the right ongoing answer; document it explicitly and remove the "BTD partial" smell by either renaming the prices_source label or by acknowledging the architectural choice in worker comments.

**Companion: FCR disclosure watch.** Phase 33 added `[revenue/s2-capacity-watch]` log accumulating evidence on `fcr_avg = 63 €/MW/h` (anomalous vs Baltic ceiling). Decision deferred to Phase 33.B.2 once log has 2+ weeks of data. This phase only confirms the log is firing as designed.

## Discipline rules load-bearing here

- **#1 audit-triage** — THE rule. Don't assume "BTD has cap_avg under new schema." Pause A inspects the actual BTD payload (live curl OR VPS log inspection) before scoping any parser change. Empirically possible answers: (a) BTD has it under a different name; (b) BTD has it under same name but worker is mis-parsing; (c) BTD doesn't have it at all. Each requires different fix shape.
- **#4 cross-card consistency** — if BTD fields are remapped, the canonical mapping (BTD field → s2 field) lives in one place; consumers don't redefine.
- **#5 roadmap edit-conflict** — no roadmap edits from CC. Cowork applies the delta post-merge.
- **Session 74 lesson** — origin-SHA equality check before any "shipped" claim.
- **`feedback_prompt_premises_empirically_verified.md`** — this is the THIRD consecutive phase where Cowork's prompt premise may or may not match live state. Frame the BTD-has-cap-prices assumption explicitly as a hypothesis, not a fact.

## Pause A — Inspect BTD + locate parser + propose (~60-90 min)

### A.1 — Pull current BTD payload + enumerate fields

1. **VPS-side:** ssh in. Run the BTD fetch script manually (likely `/opt/kkme/app/sync/fetch_btd.py` or similar — locate via `crontab -l | grep -i btd` + `ls /opt/kkme/app/sync/*btd*`). Capture full stdout / log output. **Note:** `logs/btd.log` already exists locally and showed `afrr_up_avg:37, mfrr_up_avg:28.68, fcr_avg:63.08 — no afrr_cap_avg` — confirm this matches current BTD, or update.

2. **Inspect all BTD field names** in the captured payload. Report:
   - Activation prices present: `afrr_up_avg`, `afrr_dn_avg`, `mfrr_up_avg`, `mfrr_dn_avg`, etc.
   - Capacity prices present (if any): could be `afrr_cap`, `afrr_capacity_avg`, `afrr_proc_cap`, `afrr_reserve_avg`, or completely absent
   - FCR fields: `fcr_avg`, possibly `fcr_cap`, etc.
   - Timestamp + coverage window
   - Total field count

3. **Cross-reference Litgrid:** BTD replaced Litgrid's "ordered capacity" page. Visit `https://www.litgrid.eu` (browse to the historical ordered-capacity / reserve-procurement section). If the page now redirects to BTD with a note about schema change, screenshot/document the breadcrumb. If Litgrid still has SOME capacity data (smaller market segments), note it.

### A.2 — Locate the BTD → s2 parser path

1. **Worker side:** grep `workers/fetch-s1.js` for `BTD`, `btd_`, `afrr_cap`, `mfrr_cap`, `fcr_cap`, `s2_raw`, `/s2/raw`, `/s2/btd`. Identify which endpoint receives BTD pushes + which fields it expects.

2. **VPS side:** grep `/opt/kkme/app/` for the script that pushes BTD to worker. Identify the field mapping: BTD payload → worker POST body. This is where field renames or schema migrations would need to happen.

3. **Confirm the s2 KV structure:** curl `/s2` from worker → dump full structure. Identify which fields are populated, which are null. The null `*_cap_avg` fields are the ones we need to fix.

### A.3 — Decide the fix path

Based on A.1 + A.2 findings, classify:

- **Path A — BTD has cap prices under different name** (e.g., `afrr_reserve_avg` in BTD → maps to `s2.afrr_cap_avg`). Scope: rename mapping in parser (worker OR VPS, whichever does the field translation). Small change. `prices_source` flips to "BTD full" or "BTD ok" after deploy.

- **Path B — BTD has cap prices under same name, parser is dropping them silently.** Scope: fix parser to actually pass through the field. Same small change at a different location.

- **Path C — BTD doesn't carry cap prices at all.** Scope: NO parser change. Document the architectural choice in worker comments at `fetch-s1.js:2431` (capPrice fallback): "BTD discontinued capacity-price publication post-2026-05-Q2; calibrated constants are canonical." Rename `prices_source: "BTD partial"` → `"BTD activation-only + calibrated capacity"` (more honest). File Phase 33.B.3 candidate: source alternative for capacity prices (Litgrid auction archives? Nord Pool reserve markets? Direct TSO contact?) if operator wants to chase real-time cap prices later.

- **Path D — Hybrid: some cap prices in BTD, some not.** Scope: parser passes through what BTD provides; calibrated constants fill gaps. Rename `prices_source: "BTD partial"` → granular like `"BTD ok (afrr,mfrr) / calibrated (fcr)"`.

### A.4 — FCR disclosure watch confirmation

1. **Verify `[revenue/s2-capacity-watch]` log is firing.** Tail worker logs via `wrangler tail` (or check whatever observability surface exists). If no log visibility, document the gap as a follow-up.
2. **Check the log content shape** — does it include enough detail (timestamp + raw BTD values + clip event) to reason about FCR persistence over weeks?
3. **Set retention expectation:** file Phase 33.B.2 candidate to make the FCR disclosure decision at 2026-06-29 (~2 weeks from now). No action this phase beyond confirming log is healthy.

### Pause A output

| Item | Finding | Fix path | Effort |
|---|---|---|---|
| BTD fields present | … (enumerated) | … | — |
| Parser location (worker/VPS) | line N | … | — |
| Capacity in BTD? | yes / no / partial | A / B / C / D | … |
| Watch log firing? | yes / no | confirm or fix | — |

STOP for operator approval. Operator confirms:
1. Fix path A/B/C/D is the right pick.
2. If Path C/D: the new `prices_source` label is acceptable wording.
3. FCR disclosure deferred to 2026-06-29 review — file 33.B.2 as scheduled-revisit candidate.

## Pause B — Build + local verify (~30-45 min)

Scope locked by Pause A approval. Three possible shapes:

### B-pathA — Parser remap

1. Update the worker OR VPS parser to map the BTD field name to `s2.*_cap_avg`.
2. Update `prices_source` calculation: if all 3 `*_cap_avg` populate, set `"BTD full"`; if partial, `"BTD partial (X)"`.
3. Add regression test: synthetic BTD payload with the new field name → assert `s2.afrr_cap_avg` populates.

### B-pathB — Parser fix

1. Identify why the parser is dropping the field (typo / nullable handling / serialization issue).
2. Fix.
3. Same regression test pattern.

### B-pathC — Documentation

1. Add multi-line comment at `fetch-s1.js:2431` (capPrice fallback) explaining the architectural choice + BTD's capacity-price discontinuation.
2. Rename `prices_source: "BTD partial"` → `"BTD activation-only + calibrated capacity"` (or operator-confirmed wording).
3. NO new test (no behavioural change); existing `capPriceBound.test.ts` continues to guard.

### B-pathD — Hybrid

Combination of A/B + C as Pause A diagnosis dictates.

### Local verification (mandatory)

- `npx tsc --noEmit`: clean
- `npm run test`: all green (new test only on paths A/B)
- `npm run lint:no-raw-spacing && npm run lint:no-editorial-chips`: clean
- `npm run build`: 7 routes compile

STOP for operator approval before commit/deploy.

## Pause C — Commit, push, deploy, verify on origin (~30 min)

1. `git add` only touched files (worker + possibly test + possibly VPS script).
2. One commit per logical change. Commit message names the path taken (e.g., `phase 33.b: BTD afrr_cap_avg remap (path A)`).
3. `git push -u origin phase-33-b-btd-cap-reparse`.
4. **Origin-SHA equality check** (Session 74 guard).
5. **Hand operator the deploy command:** `cd /Users/Kastis/kkme && npx wrangler deploy`. Operator runs, pastes back version ID.
6. **Post-deploy verification:**
   - Curl `/revenue` → confirm `prices_source` field reflects the new state.
   - Curl `/s2` → confirm `*_cap_avg` fields populate (paths A/B) or are documented null (path C).
   - Confirm `project_irr` stable (still 18.5-22%; should NOT swing wildly — if parser change activated real BTD cap prices, IRR may shift slightly toward those, which is intended).
   - Confirm `[revenue/s2-capacity-watch]` log behavior unchanged (still firing per A.4 expectation).
7. **EVIDENCE.md** at `docs/visual-audit/phase-33-b/` with before/after `prices_source` + `*_cap_avg` values.
8. **Session 80 handover entry** — finding, path chosen, IRR delta if any, 33.B.2 (FCR decision) + possibly 33.B.3 (alternative cap source) follow-ups filed.
9. **Final commit push** if handover/audit-md edits happened after step 2. Re-verify origin.

## Out of scope (explicit)

- **Phase 33.B.2 — FCR disclosure decision** — scheduled for ~2026-06-29 once `[revenue/s2-capacity-watch]` log has 2 weeks of data. NOT this phase.
- **Phase 33.B.3 — Alternative capacity-price source** — file IF Path C is the diagnosis. Investigation of Litgrid auction archives / Nord Pool reserve markets / TSO direct feeds as substitute for BTD's discontinued cap prices.
- **Phase 33.A.2** — installed_mw frozen pipeline, still blocked on operator's projects sample.

## NDA reminder

Reference asset stays 50 MW / 100 MWh. No supplier / client / project / deal references. BTD = Baltic TSO data published publicly (no NDA exposure).

## Pre-flight (operator runs before launching CC)

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-b-prompt.md
```

Commit + push prompt to main, then launch CC.
