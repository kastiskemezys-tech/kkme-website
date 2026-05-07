# Phase 21.2 — S2 monthly trajectory + capacity_monthly KV fix

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~2–4 hours, single PR, three pause points (Pause A discovery + KV diagnosis, Pause B implementation + foundation gates + worker deploy if needed + local-build smoke-test, Pause C visual + commits). **Worker investigation likely needed; possible worker deploy.**

**Operator framing:** Operator opened S2 drawer "Monthly trajectory — Baltic aggregate" 2026-05-07 and saw a single bar at "Mar 26". Cowork-side production curl revealed the smoking gun: `capacity_monthly[0] = { month: "2026-03", days: 1 }`. The chart calls itself a "monthly trajectory" but is rendering a single-day snapshot mislabeled as a monthly aggregate. Today is 2026-05-07; should have ~April + March + February + earlier complete months. The worker's `s2_btd_history` KV is severely under-populated relative to the cron schedule.

This is exactly the discipline rule #2 anti-pattern (no-hardcoded-temporal-label without computing it) — "monthly" must mean monthly. Fix is a real data-integrity issue, not just a label cosmetic.

Operator also picked the canonical month-label format: **`2026-03`** (ISO `YYYY-MM`) replacing the current `Mar 26` ambiguous `<3-letter month> <2-digit year>` format.

---

## What ships

3-4 sub-items, single PR, possible worker deploy.

**(a) `fmtMonth` helper format change** (~10-15 min, frontend-only) — change output from `Mar 26` to `2026-03`. Cross-card consumer audit at Pause A: `fmtMonth` is used in `app/components/S2Card.tsx` (CapacityChart + MonthlyTrajectoryChart) AND `app/components/S1Card.tsx` (monthly bars per Phase 18.1.1 rendering). Ensure format change propagates cleanly to all consumers per discipline rule #4 (cross-card consistency). No structural code change beyond the helper.

**(b) Investigate `s2_btd_history` KV state** (~30-60 min, Cowork-supported) — diagnose why the KV has 1 day in March 2026 instead of 60+ days going back to whenever the cron started running. Methods:
- `wrangler kv list` or `wrangler kv get s2_btd_history --binding KKME_SIGNALS` to see the raw KV contents
- `wrangler tail` to watch live cron invocations and confirm S2 cron hits the write path at `workers/fetch-s1.js:6303-6322`
- Check if today's date appears in the history (verifies cron is appending now)
- Check git log for recent worker deploys — possibly a deploy reset/wiped the KV

The write logic at `workers/fetch-s1.js:6303-6322` looks correct (append-if-not-today, trim to 365 days, sort). So under-population is likely either:
1. KV was wiped accidentally (recent deploy, manual purge)
2. Cron stopped running for an extended period (silent failure)
3. Cron is running but the s2 handler bails before reaching the write path
4. Production KV namespace points at a different value than expected

**(c) Fix the under-population per (b) diagnosis** (~30 min - 2h depending on cause):
- **If cron-stopped:** identify why, restart, monitor for next day's append
- **If KV wiped:** trigger manual backfill from BTD source (BTD `price_procured_reserves` API has historical depth; pattern at `workers/fetch-s1.js:~6300` already shows the daily fetch shape; backfill function would call BTD historical endpoint per-day for last 60-90 days and write each result)
- **If write path bails:** debug the conditional logic (validation gate, error swallowing)
- **If production KV namespace bug:** fix wrangler.toml or env var routing

**(d) Honest empty-state fallback** (~15-30 min, frontend-only) — regardless of what (c) does, also add a defensive UI state. If `capacity_monthly.length < 3` (or whatever threshold makes sense for the chart to be meaningful), render a muted line in place of the chart: *"Capacity history accruing — full trajectory available 2026-08-XX (currently {N} months)"*. Computes the date dynamically based on current array length + today's date. Prevents future "1-bar mislabel" recurrence.

`model_version` does NOT bump for any of this. (a) and (d) are frontend-only. (b) is investigation. (c) may need worker deploy depending on diagnosis but is a data-pipeline fix, not engine math.

---

## OUT of scope

- Engine math changes (revenue calculations)
- Other monthly aggregations beyond `capacity_monthly` (e.g., `s1_capture` monthly trends — check at Pause A if same problem exists; if so, file 21.3)
- Historical KV architecture redesign (single KV namespace continues fine)
- Backfill of months earlier than what BTD `price_procured_reserves` source can provide
- Forward-curve / scenario / tail-risk additions to the chart
- Phase 21 work (already shipped — hero inversion + 90d delta + IMB + THICK chip)
- Phase 22 institutional-grade S2 (forward curves, P95 tail, cross-region benchmarks)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #2 no-hardcoded-temporal-label, #4 cross-card consistency, #5 roadmap edit-conflict)
2. `docs/handover.md` Sessions 49-50 (Phase 18.2.3 + Phase 21 SHIPPED context)
3. **Memory: `project_phase_21_2_anchor.md`** — operator-confirmed scope, the `days: 1` smoking gun, `2026-03` format pick, all picks pre-aligned
4. `docs/phases/_post-12-8-roadmap.md` Phase 21.2 entry
5. `app/components/S2Card.tsx` — `fmtMonth` helper definition + `CapacityChart` (~line 876) + `MonthlyTrajectoryChart` (~line 671)
6. `app/components/S1Card.tsx` — `fmtMonth` usage in monthly bars (cross-card consumer)
7. `workers/fetch-s1.js:4404` — `computeCapacityMonthly` aggregation function
8. `workers/fetch-s1.js:6303-6322` — `s2_btd_history` write path (the cron's append-or-skip logic)
9. `workers/fetch-s1.js:7113-7185` — `/s2` GET handler reading `s2_btd_history` (this is what production curl exercises)
10. `wrangler.toml` — confirm KV namespace binding for KKME_SIGNALS; verify env routing

Memory references (Cowork-side):
- **`project_phase_21_2_anchor.md`** [LOAD-BEARING] — operator pick + smoking gun + scope
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Pause B local-build smoke-test gate REQUIRED for any phase touching worker + frontend; Phase 18.1.1 ChunkLoadError lesson
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `reference_btd_api.md` — BTD `price_procured_reserves` data architecture

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-21-merge commit. State understanding (one paragraph): plan for §1 + §2 (especially the KV diagnostic approach for sub-item b). Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-21-2-monthly-trajectory-kv-fix
npx tsc --noEmit       # 0 errors
npx vitest run          # 925/925 baseline (post-21)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers.

---

## 2. Pause A — Discovery + KV diagnosis

### 2a. `fmtMonth` cross-card consumer audit

```bash
grep -nE "fmtMonth\(|function fmtMonth" app/components/ app/lib/
```

Identify all sites where `fmtMonth(month_string)` is called. Likely:
- `app/components/S2Card.tsx` — CapacityChart + MonthlyTrajectoryChart
- `app/components/S1Card.tsx` — monthly bars (Phase 18.1.1 era)

Confirm: is the helper used uniformly? Are there any inline overrides that bypass the helper? If yes, surface at Pause A — those need the same change.

Read the current `fmtMonth` implementation. Confirm input shape (likely `'YYYY-MM'` string from worker payload). Propose new format: `'YYYY-MM'` literal (i.e., return input as-is) OR `'2026-03'`-style with explicit format conversion.

### 2b. KV diagnostic — `s2_btd_history`

Operator can run wrangler commands; CC proposes the diagnostic sequence at Pause A. Three diagnostic angles:

**Angle 1 — Inspect the KV directly:**
```bash
npx wrangler kv key get --binding=KKME_SIGNALS s2_btd_history --remote | jq '. | length, .[-5:]'
```

Or via worker debug endpoint if one exists. Expected: array of `{date, fcr, afrr_up, mfrr_up}` objects. If length is 1 with date `2026-03-XX`, the production state matches the curl evidence and the bug is real.

**Angle 2 — Check write path is exercised:**
```bash
npx wrangler tail kkme-fetch-s1 --format=pretty
```

Wait for the next S2 cron tick (every 4h per `0 */4 * * *`). Watch for the log line `[S2/btd-history] N days` at `workers/fetch-s1.js:6319`. The number tells you what the trimmed array length is post-write.

**Angle 3 — Inspect git log + deploy history for resets:**
```bash
git log --oneline workers/fetch-s1.js | head -20
```

Look for recent worker deploys that might have reset KV state. (Note: Cloudflare KV is persistent across deploys unless explicitly purged; this is a sanity check.)

### 2c. Validate `computeCapacityMonthly` aggregation

Read `workers/fetch-s1.js:4404+` end-to-end. Verify the function:
- Groups by `month` correctly (e.g., date `2026-03-15` → month `2026-03`)
- Counts days per month (the `days` field)
- Returns array sorted by month
- Handles empty input (`[]` → `[]`)
- Handles single-day input (1 day → 1 month with `days: 1`)

If the function is correct, the under-population is purely upstream (KV state). If there's a filter or threshold that drops months with `days < N`, that's the bug.

### 2d. Worker `/s2` GET handler verification

Read `workers/fetch-s1.js:7113-7185`. Confirm:
- It reads `s2_btd_history` from KV
- Passes raw history to `computeCapacityMonthly`
- Includes the result as `base.capacity_monthly` in the payload

If there's any filter or transform between KV read and payload write, document it.

### 2e. Cross-card check — does `s1_capture` monthly have the same problem?

```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/genload | jq '.s1.s1_trailing_12m'
# OR check the s1_capture monthly path that S1Card monthly bars consume
```

If S1 monthly bars also show under-population (1 month, days: 1 etc.), file Phase 21.3 follow-up. Don't fold in — out-of-scope for 21.2.

### Pause A report

Halt + report:

1. **fmtMonth consumers** — list of files + count of usages; format change blast radius
2. **KV diagnostic results** — what wrangler kv get returned (array length + sample); what wrangler tail showed (if cron observed)
3. **Aggregation function audit** — `computeCapacityMonthly` correct vs has-filter-bug
4. **Under-population root cause** — KV-was-wiped / cron-stopped / write-bails / namespace-mismatch / aggregation-filter (one of these)
5. **(c) fix proposal** — depends on root cause:
   - If KV wiped → backfill function design + invocation plan
   - If cron stopped → restart steps + monitoring
   - If write bails → bug-fix scope
   - If namespace-mismatch → wrangler.toml correction
   - If aggregation-filter → relax + retest
6. **(d) empty-state fallback design** — exact muted-line text + threshold logic + dynamic-date computation
7. **Cross-card check (s1_capture)** — same problem yes/no; file 21.3 candidate if yes
8. **Refined estimate** vs prompt's ~2-4h

Wait for explicit operator "proceed" before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes. Suggested order (lowest-risk → highest-risk):

1. **(a) fmtMonth format change** — single helper update + verify all consumers render correctly. Frontend-only, no logic change.
2. **(d) Empty-state fallback** — frontend-only; renders muted line if array length below threshold.
3. **(c) Worker fix** — depends on Pause A root cause:
   - Backfill function: read BTD historical API per-day, write to `s2_btd_history` KV in batch
   - Cron restart: deploy fix and monitor next tick
   - Write-bails fix: code change in cron handler
   - Namespace fix: wrangler.toml update + redeploy
4. **Vitest spec** for the new fmtMonth output — assert format is `YYYY-MM`. ~3-5 lines.

For each:
- Read file end-to-end first
- Verify cross-consumer impact
- For worker change: test locally with `wrangler dev` if practical

---

## 4. Pause B — Foundation gates + worker deploy + local production build

### 4a. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 + N if specs added
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 4b. Worker deploy (if needed for sub-item c)

```bash
cd ~/kkme
npx wrangler deploy --env production
# Capture worker version output
```

Then verify:
```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.capacity_monthly | length, .capacity_monthly[-3:]'
```

Expected post-fix:
- If backfilled: `length > 1` with multiple months
- If cron-restart in progress: `length == 1` still, but next-day check should show `length == 2`
- If aggregation-filter relaxed: `length` jumps to whatever the underlying KV has

### 4c. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

```bash
npm run build
npx serve@latest out -l 3100
```

Verify (curl-based, since chrome MCP may be locked again per recurring 3-session pattern):
- Home page returns HTTP 200
- All JS chunks referenced in HTML return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Bundle delta near-zero (label format change + empty-state component)

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason
- KV diagnostic outcome (Pause A) vs fix outcome (Pause B)
- Worker deploy: SUCCESS (with version hash) or N/A
- Bundle delta
- Cross-card check (rule #4): s1_capture under-population status

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Visual audit

If chrome MCP available: capture screenshots at `docs/visual-audit/phase-21-2/` covering:
- S2 drawer "Monthly trajectory" section showing `2026-03` format (mobile + desktop, light + dark)
- S2 drawer empty-state line if `capacity_monthly.length < threshold`
- S1 monthly bars showing `2026-03` format (cross-card consumer)

If chrome MCP locked: prose state description doc at `docs/visual-audit/phase-21-2/STATE.md` (per Phase 21 precedent).

### 5b. Commits + push

Suggested 2-3 commit structure:

```bash
git add app/components/S2Card.tsx app/components/S1Card.tsx app/lib/<wherever fmtMonth lives>
git commit -m "phase-21-2(format): fmtMonth output Mar 26 → 2026-03 (operator pick); cross-card S1 + S2 consumers updated"

git add app/components/S2Card.tsx  # if empty-state fallback added
git commit -m "phase-21-2(empty-state): muted line + dynamic accrual date if capacity_monthly.length < threshold"

# If worker change:
git add workers/fetch-s1.js
git commit -m "phase-21-2(worker): <backfill function | cron restart | filter relax | namespace fix> for s2_btd_history under-population"

git add docs/handover.md docs/visual-audit/phase-21-2/
git commit -m "phase-21-2(handover): Session 51 + KV diagnosis + visual audit"

git push -u origin phase-21-2-monthly-trajectory-kv-fix
```

(Adjust per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 51

Mirror Session 50 structure. Specific items:
- Headline: S2 monthly trajectory KV fix; days:1 root cause + fix shape
- Branch + base
- Pause A audit results (fmtMonth consumers + KV diagnostic + aggregation function audit + under-population root cause)
- Pause B verification gates (paste actual numbers + worker version if redeployed + post-fix curl evidence)
- Per-fix description
- Bundle delta
- Worker deploy: version hash + curl verification
- Cross-card check: s1_capture under-population status (file 21.3 if yes)
- Visual audit status (chrome MCP vs prose state doc)
- Out of scope reminder
- Tier 1 sequence: 21.2 ✅ → next CC pick across (18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1 / 21.1 / 21.3 if filed)
- Next operator action: open PR; merge; hard-refresh kkme.eu mobile + desktop dark + light; confirm S2 drawer shows multiple months OR muted accrual line per fix outcome

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 21.2 → Shipped appendix
- Currently-active update: 21.2 SHIPPED; next CC across (18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1 / 21.1 / 21.3 if filed)
- Phase 21.3 candidate filed if s1_capture has same under-population issue

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** The KV diagnostic at Pause A determines fix scope. Don't skip the diagnosis or assume root cause; verify empirically.
- **Discipline rule #2 (no-hardcoded-temporal-label)** is the load-bearing rule for this phase. "Monthly" must mean monthly. The `days: 1` mislabel is the exact anti-pattern this rule was earned for. Empty-state fallback (sub-item d) ensures future under-population doesn't recur as the same mislabel.
- **Discipline rule #4 (cross-card consistency)** — `fmtMonth` change propagates to all consumers in one PR. If new consumers added in future, they auto-inherit the format.
- **Discipline rule #6** — empty-state line text must be quantitative + operator-honest, not editorial. Acceptable: "Capacity history accruing — {N} months collected, full trajectory available {date}". Not acceptable: "Insufficient data" (vague), "Coming soon" (marketing-speak).
- **Local-build verification at Pause B is REQUIRED** — Phase 18.1.1 lesson is fresh. Worker change + frontend = same risk class.
- **Tailwind v4 silent-drop pattern** — if any new `@media` rules added, hoist into fresh blocks per memory.
- **Out-of-scope drift risk.** Don't extend scope to other monthly aggregations even if you discover them broken — file as 21.3 follow-up.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete.

End of prompt.
