# Phase 21.2 — Visual State Description (prose audit)

**Date:** 2026-05-07
**Branch:** `phase-21-2-monthly-trajectory-kv-fix`
**Worker version live (pre-merge smoke):** `b2152be9-ed8b-4e71-9f09-9c11d96d273a`
**Visual-audit method:** prose state description (chrome-devtools-mcp browser-lock condition recurred — 4th consecutive session per Phase 21 STATE.md note; operator pre-approved curl-only verification path).

---

## ⚠️ Load-bearing operator action — REQUIRED immediately after merge + Cloudflare Pages deploy stabilizes

The fix DEPLOYS the architecture change (3 write paths now consistently append) and the dynamic empty-state fallback. To **fully restore the multi-month trajectory chart**, the operator must run the one-shot backfill curl below. Without it, the empty-state muted line continues rendering until the daily cron accumulates ≥3 distinct months naturally (~3 months of clock time).

```bash
curl -s -X POST -H "X-Update-Secret: $UPDATE_SECRET" \
  https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2/btd-history/backfill | jq
```

**Expected response:**
```json
{ "ok": true, "source_count": ~90, "target_after": ~90, "added": ~89 }
```

**Verify post-backfill:**
```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.capacity_monthly | length'
# Expect: ≥3-6 (re-activates the chart; exact count = number of distinct months in s2_history, currently ~5-6 covering Dec 2025 - May 2026)
```

If `length ≥ 3`, the `<DrawerSection id="monthly">` re-renders `<CapacityChart>`; otherwise the dynamic empty-state line continues honestly.

---

## What the user sees (pre-fix vs post-fix vs post-backfill)

### Surface 1 — S2 drawer "Monthly trajectory — Baltic aggregate" (`S2Card.tsx:388-390`)

**Pre-fix:** A single bar labeled `Mar 26` sitting alone on the chart canvas — the smoking gun. The chart called itself "monthly trajectory" but rendered a one-day snapshot mislabeled as a monthly aggregate (`capacity_monthly[0] = { month: "2026-03", days: 1 }`).

**Post-fix, pre-backfill (current production state with this PR merged):** The chart is REPLACED by a single muted-mono line:

> *Capacity history accruing — 1 month collected (2026-03); full trajectory available 2026-07-01.*

The `2026-07-01` is data-derived: `today + (3 - capMonthly.length) months, day=1`. As days pass and months accumulate, the message updates automatically. When `capMonthly.length` crosses 3, the chart re-activates without any code change. (Rule #6 compliant — quantitative, not editorial; honest about why the chart isn't showing.)

**Post-backfill (after operator runs the load-bearing curl above):** `capMonthly.length` jumps to ≥3 (probably 5-6 — `s2_history` covers ~Dec 2025 onward), the empty-state line vanishes, the bar chart renders with month labels in `YYYY-MM` format (e.g., `2025-12`, `2026-01`, `2026-02`, `2026-03`, `2026-04`, `2026-05`).

### Surface 2 — Monthly trajectory chart tooltip + pin readout (`S2Card.tsx:770-872`)

The `MonthlyTrajectoryChart` (per-country P50 chart, separate from the BTD-derived CapacityChart above) has tooltip labels and pin-readout labels formatted via `fmtMonth`. Labels now read `LT aFRR P50 · 2026-03` (was `LT aFRR P50 · Mar 26`). Identical for LV/EE on mFRR. No structural change — just label format.

### Surface 3 — Capacity chart x-axis + tooltip (`S2Card.tsx:874+`)

When the chart renders (post-backfill), x-axis tick labels and tooltip month labels now read `2026-03`, `2026-04`, etc. (was `Mar 26`, `Apr 26`).

### Surface 4 — S1 monthly bars (`S1Card.tsx:497-509`, cross-card consumer)

S1Card's `<MonthlyChart>` renders 15 monthly bars (2025-03 through 2026-05). x-axis labels now `2025-03`, `2025-04`, …, `2026-05` (was `Mar 25`, `Apr 25`, …, `May 26`). **No data change for S1** — its KV pipeline (`s1_history` via `updateHistory()`) is healthy and unaffected by the s2_btd_history under-population. Cross-card consistency rule #4 is preserved: same `fmtMonth` shape across both cards.

---

## Verification evidence (curl-based, pre-merge)

### Worker version active

```
$ npx wrangler deploy
Current Version ID: b2152be9-ed8b-4e71-9f09-9c11d96d273a
schedule: 0 */4 * * *  (4h cron)
schedule: 0 * * * *    (hourly)
schedule: 30 9 * * *   (S2 watchdog)
schedule: 0 8 * * *    (digest)
```

### Backfill endpoint live (auth gate working)

```
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2/btd-history/backfill
401

$ curl -s -X POST \
    https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2/btd-history/backfill | jq
{ "error": "Unauthorized" }
```

✅ Endpoint deployed; UPDATE_SECRET gate enforces correctly.

### Pre-fix smoking gun (production, before backfill)

```
$ curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.capacity_monthly | length, .'
1
[
  {
    "month": "2026-03",
    "afrr_avg": 7.7,
    "mfrr_avg": 21.54,
    "fcr_avg": 0.35,
    "days": 1
  }
]
```

Exactly the prompt-cited shape. After backfill, `length` jumps to ~5-6 and `days` per month rises into the 20s-30s.

### Cross-card check — s1_capture is healthy

```
$ curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1/capture | jq '.monthly | length, [.[].month]'
15
[ "2025-03", "2025-04", ..., "2026-05" ]
```

✅ Different KV pipeline, unaffected by the s2 bug. Phase 21.3 NOT NEEDED.

---

## Local production-build smoke-test

- Build: 7 routes, clean.
- `out/_next/static/chunks/`: 4.5 MB / 28 chunks (baseline-exact, matches Phase 21).
- 20 JS chunks referenced from `index.html`, **all 20 return HTTP 200** at localhost:3100.
- 18.1.1 ChunkLoadError class structurally absent.
- Bundle delta: ~zero (fmtMonth bodies shrunk; capacityEmptyStateText helper added; net frontend roughly neutral; worker change ~50 lines added but worker bundle separate from frontend).

---

## Three discipline-rule applications worth flagging

1. **Rule #1 (audit-triage) at impl-time.** Pause A diagnosed TWO write paths (4h cron + Mac-cron POST). During edit I discovered a **THIRD** path — the **09:30 UTC daily S2 watchdog** at `fetch-s1.js:6189`. It also wrote `s2` KV but skipped the `s2_btd_history` append. Now also paired. Pause A reported the dual-write, the third surfaced via grep-during-edit; transparent revision noted in Pause B report.

2. **Rule #2 (no-hardcoded-temporal-label).** This entire phase. "Monthly trajectory" must mean monthly. The empty-state fallback (sub-item d) ensures future under-population renders honestly instead of mislabeling.

3. **Rule #4 (cross-card consistency).** `fmtMonth` is duplicated across `S1Card.tsx:69-71` and `S2Card.tsx:164-166` (mild rule #4 violation pre-existing, not introduced here). Both updated identically in this PR. **Hoisting to a shared `app/lib/` helper deferred** as broader scope; bug-equivalent before/after.

4. **Rule #6 (no-editorial-state-label).** Empty-state line is fully data-derived: `"Capacity history accruing — N months collected (YYYY-MM list); full trajectory available YYYY-MM-01."` No editorial vocabulary ("coming soon", "insufficient", "we're working on it"). Quantitative anchor present.

---

## Files modified (excluding unrelated `logs/btd.log`)

```
app/components/S1Card.tsx    |   4 +/-1
app/components/S2Card.tsx    |  23 +/-2
workers/fetch-s1.js          |  78 +/-26
3 files
```

---

## What ships in the PR

- (a) `fmtMonth` `Mar 26` → `2026-03` cross-card (S1 + S2 both updated)
- (b) Diagnostic confirmed dual-write architecture mismatch — empirically validated against production
- (c) `appendBtdHistory(env, payload)` shared helper paired into all 3 write paths (4h cron, 09:30 watchdog, POST `/s2/update`); new UPDATE_SECRET-gated `POST /s2/btd-history/backfill` endpoint as one-shot recovery tool
- (d) Dynamic empty-state fallback at threshold `< 3` months with data-derived accrual date (rule #6 compliant)

## What does NOT ship (deferred / out-of-scope per prompt)

- Engine math changes
- Other monthly aggregations (s1_capture verified healthy; no Phase 21.3 needed)
- Historical KV architecture redesign (single KV namespace continues)
- Backfill earlier than `s2_history` 90-day cap (BTD historical API not exercised — `s2_history` is the lossless source for what KKME has actually observed)
- Forward curves, scenario analysis, P95 tail
- Vitest specs for `fmtMonth` (tautological identity) or `capacityEmptyStateText` (time-dependent); 21.2.1 candidate if regression hits
