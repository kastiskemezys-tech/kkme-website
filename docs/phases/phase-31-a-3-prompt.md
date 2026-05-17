# Phase 31.A.3 — `lt_hourly_24` downsampler robustness fix

**Branch:** `phase-31-a-3-hourly24-downsampler` off latest main.
**Estimate:** ~30-60 min CC.
**Risk class:** LOW. Worker-only change to a single helper; no schema, no new fields, no frontend touch.
**Two pause points** — same compact structure as 31.A.2.

---

## Why this phase exists

Phase 31.A.2 Pause A surfaced this: `workers/fetch-s1.js:3367` integer-perHour gate (`Number.isInteger(perHour)` where `perHour = N/24`) makes `lt_hourly_24` return `null` on any `N` not divisible by 24. Observed live 2026-05-17: `hourly_lt` length 95, `lt_hourly_24` → `null`. Same resolution-bug family as Phase 31.A and 31.A.2.

Downstream impact: SpreadCaptureCard's "Today's price curve" sparkline reads `lt_hourly_24` (registered in `metricRegistry.ts` by Phase 31.A); when `lt_hourly_24` is null, the sparkline falls back to its previous slicing path (which has the SAME bug 31.A closed). Net result: on N=95 days the sparkline silently regresses to slice-of-quarter-hours visualization.

---

## Discipline rules load-bearing here

- **#1 audit-triage** — bug confirmed empirically via 31.A.2's live curl (N=95 observed). Confidence HIGH. Pause A is verification + consumer audit, not triage.
- **#4 cross-card consistency** — `lt_hourly_24` is consumed downstream; pick the fix shape that keeps consumers happy without changing field shape.

---

## Pause A — Verify + scope (~5-15 min)

1. **Read the downsampler block** at `workers/fetch-s1.js` around line 3367. The integer-perHour gate looks like:
   ```js
   const perHour = N / 24;
   if (!Number.isInteger(perHour)) { lt_hourly_24 = null; }
   else { /* downsample by averaging perHour entries per bucket */ }
   ```
   Confirm shape; line numbers may have drifted since 31.A.2 ship.

2. **Confirm bug active.** `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '{hourly_lt_len: (.hourly_lt|length), lt_hourly_24: (.lt_hourly_24|length)}'`. If `hourly_lt_len % 24 !== 0` AND `lt_hourly_24` is null/empty, bug active. If today happens to return 24 or 96, force-test with a recent KV snapshot or note that today's data won't reproduce.

3. **Grep `lt_hourly_24` consumers** across `app/` to confirm what reads it (expected: SpreadCaptureCard sparkline; possibly others added since 31.A). For each consumer, verify they handle null gracefully OR that the fix removes the null case entirely.

4. **Pick fix shape:**
   - **(a) Hour-bucket aggregation via `floor(i / intervalsPerHour)` pattern** — mirrors `priceShapeMetrics()` (`fetch-s1.js:3097-3151`). For N=95: `intervalsPerHour ≈ 95/24 = 3.958`, bucket index = `floor(i * 24 / N)`. Each hourly bucket gets ~4 entries (some 3, some 4); average per bucket. Output always 24 entries regardless of N. **Recommended.**
   - **(b) `Math.round(h * N / 24)` symmetric arithmetic** — same pattern Phase 31.A.2 just shipped. For hour h, take `ltPrices.slice(Math.round(h*N/24), Math.round((h+1)*N/24))`, then average. Same output as (a) for clean N; rounding differs by 1 entry at edges for fractional N. Mathematically equivalent enough.
   - **(c) Drop the integer gate; round perHour and accept slight per-bucket imbalance** — simplest diff (one-line change to remove the gate + `Math.round(perHour)`) but produces uneven buckets that don't represent hours faithfully on N=95.

   Recommend **(a)** for clean semantics; (b) if you want to mirror exact 31.A.2 arithmetic. Either preserves field shape (24-entry array of floats).

**Pause A output:** code-grep findings + live curl reality-check (or note today's N if not reproducible) + chosen fix shape. STOP and wait for operator approval before Pause B.

---

## Pause B — Fix + verify (~15-30 min)

1. Apply chosen fix shape at the downsampler block.
2. Remove the `Number.isInteger(perHour)` gate (or refactor entirely). Ensure null is no longer a return path unless `ltPrices.length < 24` (which would be a different degenerate case).
3. **No field shape change** — `lt_hourly_24` stays a 24-entry array of floats. No registry update needed.
4. **If Pause A grep surfaced any consumer that depends on the null-fallback path** (unlikely but possible), flag in handover — don't scope here.

Run gates (baseline drift confirmed by 31.A.2: vitest 918/919, lint 126):

- `npx tsc --noEmit` (0 errors)
- `npm run test` (918/919 baseline; expect no delta unless a new spec is added for the fix)
- `npm run lint` (126 baseline)
- `npm run lint:no-raw-spacing` (exit 0)
- `npm run lint:no-editorial-chips` (exit 0)
- `npm run build` (7 routes clean — frontend build, sanity check)

Worker deploy. Curl reality-check:

- `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '{hourly_lt_len: (.hourly_lt|length), lt_hourly_24_len: (.lt_hourly_24|length), lt_hourly_24_range: [(.lt_hourly_24|min), (.lt_hourly_24|max)]}'`
- Confirm `lt_hourly_24_len === 24` on whatever N the worker has today.
- Sanity: range should bracket `lt_peak_price` and `lt_trough_price` (since the downsample averages preserve extremes approximately).

**Handover Session 60 entry** documenting:
- Bug verification (Pause A curl OR note today's N)
- Chosen fix shape + rationale
- Pre/post curl values
- Gate deltas (expect baseline-exact against 31.A.2's baseline)
- Worker deploy ID
- Any consumer-side flag from Pause A

**Roadmap delta needed** (Cowork applies per rule #5):
- Phase 31.A.3 → Shipped appendix
- Update "Currently active" pointer

Branch push. Operator opens PR + merges (per `feedback_pr_workflow_minimal.md`).

---

## What NOT to do

- **No frontend changes** unless Pause A surfaces a consumer that relies on the null fallback (highly unlikely; flag if found, don't scope).
- **No new fields, no registry changes** — `lt_hourly_24` keeps name + shape (24-entry float array).
- **No engine math changes** — purely a representation-layer aggregation fix.
- **No roadmap edits** per rule #5.
