# Phase 33.B.3 — KV-persisted `[revenue/s2-capacity-watch]` accumulator + `:2793` label fix

**Branch:** `phase-33-b-3-kv-watch-accumulator` off latest main.
**Estimate:** ~30-45 min CC. Small ship.
**Risk class:** LOW. Adds a daily KV write to an existing log path + a read-side admin endpoint + 1-line label fix. No engine math change. Phase 33's capPrice bound continues to guard.
**Three pause points (compact — Pause A ~15 min, Pause B ~15 min, Pause C ~10 min).**

Per `feedback_cowork_cc_sequencing.md`: starts on clean main post-Phase-33.B roadmap-delta merge. Origin-SHA equality check at Pause C (Session 74 guard). Operator-runs-deploy pattern.

## Why this phase exists

Phase 33.B confirmed `flagOutOfBandS2Capacity()` at `fetch-s1.js:8569` is firing on every `/revenue` compute and logs `{fcr_avg, afrr_up_avg, mfrr_up_avg}` plus `⚠` markers when values exceed 50. But it's `console.log`-only — ephemeral. Phase 33.B.2 (capacity-basis review at 2026-06-29) needs ≥2 weeks of trend data to reason about whether `fcr_avg = €63.73/MW/h` is a transient post-CE-sync scarcity spike or a sustained market level. Without persistence, the 2-week clock is wasting.

Also folded in: relabel `'BTD measured'` at `fetch-s1.js:2793` to harmonize with Phase 33.B's `prices_source` wording — pre-existing label inconsistency CC flagged at Phase 33.B's Pause B (left untouched per Path C scope).

## Discipline rules

- **#1 audit-triage** — re-verify the `:8569` log call shape + the `:2793` label location with live grep; don't assume from memory. Fifth consecutive phase with this rule in play; CC's Pause A discipline is doing the work.
- **#4 cross-card consistency** — the relabeled `:2793` string should match the `prices_source` string set in Phase 33.B (or be a clear sibling: e.g. `"BTD parsed; review pending"` vs `"BTD parsed; calibrated capacity (review pending)"`).
- **Session 74 lesson** — origin-SHA check before claiming shipped.

## Pause A — Locate + design (~15 min)

1. **`flagOutOfBandS2Capacity()` shape** — grep `fetch-s1.js:8569` and its caller chain. Report:
   - Call signature (what `s2` shape it receives)
   - Current log content (exact fields + ⚠ logic)
   - Frequency: confirmed once per `/revenue` compute, but how many `/revenue` computes per day in practice? (Cloudflare Worker has no rate limit on incoming; could be 100-10000 calls/day. The KV write needs to be idempotent per-day or rate-limited.)

2. **KV namespace + naming** — confirm `env.KKME_SIGNALS` is the right binding (it's the only one). Convention check: existing KV keys use `s1_capture`, `s4_fleet`, `baltic_storage_index_latest` etc. — propose `s2_capacity_watch:2026-06-15` (colon-separator namespacing) OR `s2_capacity_watch_2026-06-15` (matching existing underscore style — pick one per existing convention).

3. **Daily-summary shape** — propose KV value shape:
   ```json
   {
     "date": "2026-06-15",
     "first_seen_at": "2026-06-15T06:30:42Z",
     "last_seen_at": "2026-06-15T22:45:11Z",
     "samples": 142,
     "fcr_avg": {"min": 58.2, "max": 71.4, "last": 63.73, "above_50_pct": 100.0},
     "afrr_up_avg": {"min": 65.1, "max": 78.9, "last": 72.71, "above_50_pct": 100.0},
     "mfrr_up_avg": {"min": 35.2, "max": 42.8, "last": 38.93, "above_50_pct": 0.0},
     "afrr_down_avg": null,
     "mfrr_down_avg": null,
     "clip_events_count": 142,
     "prices_source": "BTD parsed; calibrated capacity (review pending)"
   }
   ```
   Operator confirms shape at Pause A. The min/max/last/above_50_pct accumulation pattern lets 33.B.2 reason about persistence WITHOUT storing all samples (which would blow KV quota).

4. **Write pattern decision** — two options:
   - (i) **Per-call accumulator**: every `/revenue` compute reads the day's KV, updates min/max/last, writes back. Adds 1 KV read + 1 KV write per `/revenue` call (100-10000/day). Eventually-consistent fine for this use case.
   - (ii) **Last-write-wins per call**: every `/revenue` compute just overwrites the day's KV with the current sample's values. Simple, idempotent, but loses min/max trend.
   
   Recommend (i) for the trend data 33.B.2 needs. Confirm at Pause A.

5. **Read endpoint** — propose `GET /admin/capacity-watch?days=N` (default 14). Returns array of daily-summary objects, oldest-first. Auth: `X-Update-Secret` like other `/admin/*` endpoints. Confirm at Pause A.

6. **Retention** — 30 days TTL via `KV.put(key, value, {expirationTtl: 30 * 86400})`. Confirm at Pause A.

7. **`:2793` label fix** — read the current string at `:2793`. Propose replacement matching Phase 33.B's `prices_source` wording. Confirm exact string at Pause A.

### Pause A output

Single-page report:

| Item | Finding | Proposal | Operator confirms |
|---|---|---|---|
| Call signature `:8569` | … | (no change) | — |
| KV key convention | … | `s2_capacity_watch_<YYYY-MM-DD>` (or colon) | y/n |
| Daily-summary shape | n/a | (the JSON above) | y/n |
| Write pattern | n/a | (i) per-call accumulator | y/n |
| Read endpoint | n/a | `GET /admin/capacity-watch?days=N` | y/n |
| Retention | n/a | 30-day TTL | y/n |
| `:2793` label | "…" | "…" | y/n |

STOP for approval.

## Pause B — Build + local verify (~15-20 min)

Scope locked by Pause A approval.

### B.1 — KV-persisted accumulator

1. Replace `console.log(...)` body of `flagOutOfBandS2Capacity()` (or its call site, whichever is cleaner) with:
   - Read existing `env.KKME_SIGNALS.get('s2_capacity_watch_' + today, 'json')` (returns null on day-rollover).
   - Update min/max/last/above_50_pct counters per product.
   - Write back via `env.KKME_SIGNALS.put(key, JSON.stringify(value), {expirationTtl: 30 * 86400})`.
   - Keep a debug `console.log` line so the path remains observable in `wrangler tail`.

2. Race-condition note: parallel `/revenue` calls within the same day could race on read-modify-write. Acceptable for this use case (min/max/last drifts by a few samples are fine for trend analysis). Document the choice in a comment.

### B.2 — Read endpoint

`GET /admin/capacity-watch?days=N` returns:
```json
{
  "days_requested": 14,
  "days_returned": 14,
  "summaries": [...] // oldest first
}
```

Auth via `X-Update-Secret` matching `env.UPDATE_SECRET`. 401 on missing/wrong.

Mirror the auth pattern from `/admin/purge-non-baltic-fleet` (Phase 33.A) or `/admin/trigger-s1-capture` (Phase 33).

### B.3 — `:2793` label fix

One-line string swap. Match the exact wording approved at Pause A.

### B.4 — Test

Add a small unit test for the accumulator logic (min/max/last accumulation against synthetic input). Mocking KV not required — pure-function helper if possible (extract `accumulateCapacityWatch(prev, sample) → next` and test it).

### Local verification

- `npx tsc --noEmit`: clean
- `npm run test`: all green (new test added)
- `npm run lint:no-raw-spacing && npm run lint:no-editorial-chips`: clean
- `npm run build`: 7 routes compile

STOP for approval.

## Pause C — Commit, push, deploy, verify (~10 min)

1. `git add` only touched files (worker + test).
2. Commit: `phase 33.b.3: KV-persisted capacity-watch accumulator + :2793 label fix`.
3. Push `phase-33-b-3-kv-watch-accumulator`.
4. Origin-SHA equality check.
5. Hand operator `cd /Users/Kastis/kkme && npx wrangler deploy`. Operator runs, pastes version ID.
6. **Post-deploy verification:**
   - Wait ~1 minute for the first `/revenue` cron call (or trigger via curl).
   - Curl `GET /admin/capacity-watch?days=1` with `X-Update-Secret: kkme-btd-2026` — expect today's summary with samples ≥ 1.
   - Curl `/revenue` → confirm `prices_source` unchanged (still "BTD parsed; calibrated capacity (review pending)"); IRR stable ~20%.
   - Curl an arbitrary engine call that hits `:2793` (likely `/revenue?dur=2h&scenario=base`) — confirm the label string shows the new wording.
   - Confirm 401 on the read endpoint without secret.
7. EVIDENCE.md at `docs/visual-audit/phase-33-b-3/` with curl outputs.
8. Session 81 handover entry.
9. Final push if handover edits. Origin re-verify.

## Out of scope

- Phase 33.B.2 capacity-basis review — scheduled for ~2026-06-29 after this phase has accumulated ≥2 weeks of KV data.
- Phase 33.A.2 — operator's next pick after this ships.

## Pre-flight

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-b-3-prompt.md
```
