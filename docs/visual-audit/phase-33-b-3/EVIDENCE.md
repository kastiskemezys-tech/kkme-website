# Phase 33.B.3 — KV-persisted capacity-watch accumulator + `:2871` label fix — EVIDENCE

**Branch:** `phase-33-b-3-kv-watch-accumulator` · **Commit:** `6105e5e` · **Worker deploy:** `7928299a-441d-4eb3-a299-034a4c904ecf` · **Date:** 2026-06-15 (Session 81)

Adds a daily KV write (off the `/revenue` response path via `ctx.waitUntil`) + a read-side admin endpoint + a 1-line label fix. No engine math change; `capPriceBound.test.ts` keeps guarding the IRR bound.

---

## What shipped

- **`accumulateCapacityWatch(prev, s2, nowIso)`** (`fetch-s1.js:~1112`) — pure helper, deduped per distinct `s2.timestamp`. Tracks `min/max/last/above_50_pct` for `fcr_avg, afrr_up_avg, mfrr_up_avg, afrr_down_avg, mfrr_down_avg`.
- **`persistCapacityWatch(env, s2)`** — read→accumulate→put, key `s2_capacity_watch:<YYYY-MM-DD>` (colon, matching `raw:s1:<date>` / `trading:<date>:raw` date-series convention), 30-day TTL. Wired via `ctx.waitUntil` at the existing `flagOutOfBandS2Capacity` call site (`:8648`).
- **`GET /admin/capacity-watch?days=N`** (default 14, cap 60) — `X-Update-Secret` auth, summaries oldest-first.
- **`:2871` relabel** — `'BTD measured'` → `'BTD parsed; calibrated capacity (review pending)'` (rule #4 harmonization with Phase 33.B).
- **Test** — `app/lib/__tests__/capacityWatch.test.ts` (9 cases).

### Key design choice (Pause A refinement, empirical)

s2 KV refreshes ~6×/day (4h Mac cron). So the accumulator dedups by `s2.timestamp`: `samples` counts **distinct s2 snapshots**, not `/revenue` calls, and KV writes stay ~6/day instead of one-per-request (quota-safe). **Proven post-deploy:** ~15 `/revenue` calls produced `samples: 1` (all read the same 13:00:03Z snapshot).

---

## Post-deploy verification (deploy `7928299a`)

```
GET /revenue?dur=2h&scenario=base:
  prices_source : 'BTD parsed; calibrated capacity (review pending)'   ✓
  model_version : v7.3   project_irr : 20.0%   caps : 7.06 / 19.74 / 0.36   ✓ (no engine change)

GET /admin/capacity-watch?days=1  (X-Update-Secret):
  { "days_requested":1, "days_returned":1, "summaries":[ {
      "date":"2026-06-15", "last_s2_timestamp":"2026-06-15T13:00:03.124Z",
      "samples":1, "clip_events_count":1,
      "prices_source":"BTD parsed; calibrated capacity (review pending)",
      "fcr_avg":     {"min":63.73,"max":63.73,"last":63.73,"n":1,"above_50_count":1,"above_50_pct":100},
      "afrr_up_avg": {"min":72.71,"max":72.71,"last":72.71,"n":1,"above_50_count":1,"above_50_pct":100},
      "mfrr_up_avg": {"min":38.93,"max":38.93,"last":38.93,"n":1,"above_50_count":0,"above_50_pct":0},
      "afrr_down_avg":{"min":10.11,...,"above_50_pct":0},
      "mfrr_down_avg":{"min":17.85,...,"above_50_pct":0} } ] }

GET /admin/capacity-watch (no secret):  HTTP 401   ✓
Dedup throttle: ~15 /revenue calls -> samples:1   ✓
```

## Local verification (pre-deploy)
```
worker syntax .. OK   tsc .. clean   vitest .. 64 files / 950 passed (capacityWatch 9/9)
lints .. clean   build .. 7 routes
```

## Origin-SHA guard (Session 74 discipline)
```
local  6105e5ea471c3397144ea33ad4c5ffed958dbd76
remote 6105e5ea471c3397144ea33ad4c5ffed958dbd76   MATCH ✓ (verified before deploy)
```

---

## Feeds

- **33.B.2 (2026-06-29)** — the capacity-watch KV now accumulates ≥2 weeks of up+down trend data for the capacity-basis review. Read via `GET /admin/capacity-watch?days=14`.
