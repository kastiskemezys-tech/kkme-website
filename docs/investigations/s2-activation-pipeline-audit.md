# S2 Activation Data Pipeline Audit

**Date:** 2026-04-20  
**Status:** Root cause identified, fix recommended

---

## Data flow diagram

```
BTD API (baltic.transparency-dashboard.eu)
    │
    ├─── price_procured_reserves ──┐
    ├─── balancing_energy_prices ──┤
    ├─── direction_of_balancing ───┤
    └─── imbalance_prices ─────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────┐
              │  Mac cron: ~/kkme-cron/fetch-btd.js     │
              │  Schedule: 0 */4 * * * (every 4h)       │
              │  LAST RAN: 2026-03-30 17:00 UTC         │ ← STALE
              └──────┬──────────────────────┬───────────┘
                     │                      │
                     ▼                      ▼
           POST /s2/update          POST /trading/update
           (9-day live averages)    (per-day ISP dispatch)
                     │                      │
                     ▼                      ▼
              KV: "s2"              KV: "trading_YYYY-MM-DD"


              ┌─────────────────────────────────────────┐
              │  Worker cron: 0 */4 * * * (4h)          │
              │  Also computes S2 live via computeS2()  │ ← ACTIVE, works
              │  Worker cron: 30 9 * * * (daily)        │
              │  Extra S2 fetch for ordered capacity    │
              └──────┬──────────────────────────────────┘
                     │
                     ▼
              KV: "s2" (same key, worker-computed)


              ┌─────────────────────────────────────────┐
              │  MANUAL PUSH: POST /s2/activation        │
              │  No script automates this                │ ← ROOT CAUSE
              │  Last pushed: 2026-03-28                 │
              │  Period: 2025-10 to 2026-03              │
              └──────┬──────────────────────────────────┘
                     │
                     ▼
              KV: "s2_activation" → parsed as s2_activation_parsed
              Used by: S2Card (monthly clearing display),
                       RevenueCard (R_base calculation),
                       deriveCompression(), computeLiveRate()
```

---

## Root cause

**Two issues:**

### 1. `/s2/activation` (monthly clearing) — NEVER automated

The monthly activation clearing price data at `POST /s2/activation` was always a manual process. The local file `data/s2_activation.json` was crafted manually and pushed via curl or similar. No script anywhere in the codebase, cron, VPS, or GitHub Actions calls this endpoint.

- Last pushed: 2026-03-28
- Period covered: 2025-10 to 2026-03
- Stale by: ~21 days (missing all of April)

### 2. Mac cron (live S2 + trading) — dead since March 30

The Mac cron `~/kkme-cron/fetch-btd.js` last ran 2026-03-30T17:00Z. It runs every 4 hours (`0 */4 * * *`) but hasn't executed in 21 days. Likely cause: Mac went to sleep/shutdown and launchd doesn't catch up missed schedules.

However, the **worker cron** (`computeS2()`) independently fetches live S2 averages every 4 hours from BTD directly. So the live S2 capacity averages ARE being refreshed by the worker. The Mac cron adds:
- Trading dispatch data (per-ISP breakdown)
- Litgrid ordered capacity (deprecated — page returns no data)
- Heartbeat signal

---

## BTD April data availability

**Confirmed available:**
- `price_procured_reserves`: 1,824 ISPs (Apr 1–19), Lithuania cols 10–14
- `balancing_energy_prices`: 1,824 ISPs (Apr 1–19), Lithuania cols 4–5

April activation clearing data is fully available on BTD. The S2Card could show April data today if pushed.

---

## Recommended fix

### Option A: Automate in worker cron (recommended, ~2h effort)

Add a monthly aggregation step to the worker's 4h cron:

1. Worker already calls `computeS2()` which fetches `price_procured_reserves` from BTD
2. Extend to also fetch `balancing_energy_prices` (activation clearing)
3. Aggregate into monthly P50/avg by product (aFRR up, mFRR up) per country
4. Store in KV as `s2_activation` with rolling 6-month window
5. Worker cron runs on Cloudflare — always-on, no Mac dependency

**Pros:** Fully automated, no human intervention, survives Mac sleep.  
**Cons:** Need to replicate the monthly aggregation logic that was done manually.

### Option B: Add to Mac cron (quick, ~30min effort)

Add a monthly aggregation + `POST /s2/activation` call to `fetch-btd.js`. The Mac cron already fetches all the raw BTD data needed.

**Pros:** Quick, uses existing infrastructure.  
**Cons:** Mac cron is unreliable (proven by 21-day gap). Requires machine to be on.

### Option C: Immediate manual push + schedule reminder (5min)

Push April data now via curl, set a calendar reminder for monthly push.

**Pros:** Immediate fix.  
**Cons:** Doesn't solve the root cause.

---

## Recommendation

**Do Option A** (worker cron automation). The data is available, the worker already talks to BTD, and the monthly aggregation is straightforward math (group ISPs by month, compute P50/avg). This eliminates the Mac dependency entirely for S2 activation data.

**Immediate relief:** Also do Option C now so the card shows current data while automation is built.

### Mac cron status

The Mac cron being dead is lower priority since the worker cron handles live S2. But it should be restarted for the trading dispatch data:

```bash
# Check if launchd cron is loaded
crontab -l  # Already shows the schedule
# Force a manual run to verify it still works
NODE_TLS_REJECT_UNAUTHORIZED=0 node ~/kkme-cron/fetch-btd.js
```

### Watchdog

Add to the worker's daily digest (08:00 UTC cron): check `s2_activation` stored_at age. If > 35 days, send Telegram alert.
