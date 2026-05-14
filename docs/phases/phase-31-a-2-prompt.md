# Phase 31.A.2 — Evening-premium resolution-aware slicing fix

**Branch:** `phase-31-a-2-evening-premium-slicing` off latest main.
**Estimate:** ~30-60 min CC.
**Risk class:** LOW. Worker-only change to a single computation block; no engine math touched, no schema change, no frontend touch, no chunk emission.
**Two pause points** (full three-pause structure overkill for this scope).

Per `feedback_local_build_verification.md`: local build smoke-test NOT required (no frontend change). Per `feedback_chrome_mcp_orphans.md`: chrome MCP not needed (no DOM probe). Per `feedback_cowork_sandbox_git_locks.md`: any Cowork-sandbox involvement leaves `.git/*.lock` files — this is a CC ship, not Cowork.

---

## Why this phase exists

Phase 31.A discovery (Session 58, 2026-05-13) surfaced this as out-of-scope but adjacent: `lt_evening_premium` is silently wrong on every 15-min ISP day.

`workers/fetch-s1.js:3346-3349`:

```js
const ltEvening  = ltPrices.slice(17, 22);   // hours 17,18,19,20,21
const ltShoulder = ltPrices.slice(10, 15);   // hours 10,11,12,13,14
const lt_evening_premium = (ltEvening.length && ltShoulder.length)
  ? Math.round((avg(ltEvening) - avg(ltShoulder)) * 100) / 100
  : null;
```

The slices assume hourly indexing. But `ltPrices` from `extractPrices(ltXml)` is **96 entries on every 15-min ISP day** (the new ENTSO-E default for many Baltic days; Phase 31.A confirmed via live curl on 2026-05-13: `hourly_lt` length 96, max 180.96 at h21, min 72.83 at h15).

When `ltPrices.length === 96`:
- `slice(17, 22)` picks quarter-hours 17-21 = local **04:15-05:30** (early morning, not evening)
- `slice(10, 15)` picks quarter-hours 10-14 = local **02:30-03:30** (early morning, not midday shoulder)
- `lt_evening_premium` computes the difference between two early-morning windows. Silently wrong.

Same root-cause family as the PeakForecast/SpreadCapture bugs closed by Phase 31.A. Pre-existing tech debt; surfaced during 31.A discovery and explicitly held out of scope. Fix is mechanical.

---

## Discipline rules load-bearing here

- **#1 audit-triage** — Phase 31.A's bug was visual-inference verified empirically. This bug is similarly verified empirically via 31.A's live curl. Confidence HIGH; no Pause-A triage needed.
- **#4 cross-card consistency** — `lt_evening_premium` is consumed where? Pause A should grep frontend for consumers and verify the field name's semantic is uniform. If `lt_evening_premium` flows into a card whose interp logic is now incorrect, flag.

---

## Pause A — Verify + scope (~5-15 min)

1. **Confirm the bug at code level.** Read `workers/fetch-s1.js:3340-3367` (context block around `lt_daily_swing_eur_mwh` + `lt_evening_premium` + `bess_net_capture`). Cross-check what 31.A's `lt_hourly_24` downsample does (lines should be in the same function `computeS1`).

2. **Confirm via live curl.** `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '{hourly_lt_len: (.hourly_lt|length), lt_evening_premium}'`. If `hourly_lt_len === 96`, the bug is currently active in production data.

3. **Grep frontend for consumers** of `lt_evening_premium`. Likely sites: `PeakForecastCard`, `SpreadCaptureCard`, possibly `S1Card` drawer. For each consumer, verify what the field is interpreted as (label, derivation logic) — if any consumer's label says something like "evening shoulder spread" that aligned with the BROKEN slicing, those consumers also have a labeling bug.

4. **Pick fix shape:**
   - **(a) Inline `perHour` detection at the slicing site.** Smallest diff:
     ```js
     const perHour = ltPrices.length === 96 ? 4 : 1;
     const ltEvening  = ltPrices.slice(17*perHour, 22*perHour);
     const ltShoulder = ltPrices.slice(10*perHour, 15*perHour);
     ```
   - **(b) Compute from `lt_hourly_24` instead** (the 31.A-emitted resolution-normalized hourly array). Conceptually cleaner — single source of truth for hourly-window aggregations:
     ```js
     // After lt_hourly_24 is computed:
     const ltEvening  = lt_hourly_24.slice(17, 22);
     const ltShoulder = lt_hourly_24.slice(10, 15);
     ```
   - **(c) Helper function** in `lib/` to share the resolution-aware slicing pattern across worker (current and future) consumers.

   Recommended: **(b)** if `lt_hourly_24` is available at the point where `lt_evening_premium` is computed (check ordering inside `computeS1`). Falls back to **(a)** if ordering would require restructuring.

**Pause A output:** code-grep findings + live curl reality-check + chosen fix shape. STOP and wait for operator approval before Pause B.

---

## Pause B — Fix + verify (~15-30 min)

1. Apply chosen fix shape.
2. **If frontend consumers of `lt_evening_premium` have semantic-aligned labels** that were correct against the BROKEN slicing (i.e., labels that say "shoulder" but the data was actually early-morning), those labels are still wrong post-fix. Flag in handover; do NOT scope frontend changes here (separate concern; would belong in Phase 31.A.1 or follow-up).
3. **No new fields, no schema changes, no registry entries needed** — the field name and shape stay identical; only the computation is corrected.

Run worker gates:

- `npx tsc --noEmit` (0 errors — worker is JS but the repo has frontend TS)
- `npm run test` (vitest baseline 919/919 — no worker tests touched, expect no delta)
- `npm run lint` (current 125 — expect no delta)
- `npm run lint:no-raw-spacing` (exit 0)
- `npm run lint:no-editorial-chips` (exit 0)
- `npm run build` (7 routes clean — frontend build, sanity check)

Worker deploy via `npm run deploy:worker` or equivalent. Confirm via:

- `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '{lt_evening_premium, hourly_lt_len: (.hourly_lt|length)}'`
- Manually verify the new `lt_evening_premium` value reflects the LT day-ahead evening (h17-21) vs midday (h10-14) premium, computed against `lt_hourly_24` if you picked (b) or against `ltPrices.slice(17*perHour, ...)` if (a).
- Sanity: pre-fix value (early-morning Δ) should differ noticeably from post-fix value (evening Δ). If TOO close, suspect the fix didn't apply or the day's hourly profile happens to be flat — re-verify with cache-bust.

**Handover Session 59 entry** documenting:
- The bug verification (live `hourly_lt_len === 96` confirmation)
- Chosen fix shape + rationale
- Pre/post curl values
- Gate deltas (expect baseline-exact)
- Worker deploy ID
- Frontend label-alignment flag (if any consumer-side issue surfaced at Pause A)

**Roadmap delta needed** (Cowork applies per rule #5):
- Phase 31.A.2 → Shipped appendix
- Update "Currently active" pointer

Branch push. Operator opens PR + merges (per `feedback_pr_workflow_minimal.md`: no body, no branch delete).

---

## What NOT to do

- **No frontend changes** unless Pause A surfaces a label/interpretation mismatch on a `lt_evening_premium` consumer. If found, FILE as Phase 31.A.3 (or fold into 31.A.1 rule-#6 sweep if scope-adjacent) — do not scope-creep here.
- **No new derived fields** — `lt_evening_premium` keeps its name, shape, and semantic. Only the computation is corrected.
- **No engine math changes** — `lt_evening_premium` only feeds presentation logic, not the revenue engine.
- **No roadmap edits** per rule #5.
- **No chrome MCP / playwright DOM probe** — no UI changes to verify visually. Live curl reality-check is the gate.
