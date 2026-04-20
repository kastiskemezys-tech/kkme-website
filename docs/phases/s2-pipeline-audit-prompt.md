# S2 Activation Data Pipeline Audit

Self-contained Claude Code prompt. Research only — no code changes unless explicitly noted.

**Problem:** S2Card shows "aFRR activation clearing · Mar 26" — the monthly activation clearing data is stuck at March 2026, stored on 2026-03-28. Today is April 20. The card should show the most recent month available.

**What we know:**
- Worker endpoint `GET /s2/activation` returns data with `stored_at: 2026-03-28`, `period: 2025-10 to 2026-03`
- Worker endpoint `POST /s2/activation` accepts new data (requires UPDATE_SECRET header)
- Worker `computeS2()` fetches live 9-day BTD reserve/imbalance data — this works fine (updated today)
- The monthly activation clearing dataset is SEPARATE — pushed by an external script, not the worker cron
- `data/s2_activation.json` exists locally with same stale data (period: 2025-10 to 2026-03)
- Mac cron at `~/kkme-cron/` has `fetch-btd.js` — handover says possibly deprecated
- VPS at 89.167.124.42 has ingestion scripts

**Questions to answer:**

1. **What script pushes activation data?** Find the script that calls `POST /s2/activation`. Check:
   - `~/kkme-cron/fetch-btd.js` (Mac cron — read the file, understand what it does)
   - Any VPS scripts that push to this endpoint
   - GitHub Actions workflows (`.github/workflows/`)
   - Any other scripts in the repo

2. **What does the BTD activation data source look like?** The data comes from `baltic.transparency-dashboard.eu`. Check:
   - What API endpoint(s) are being queried for activation clearing prices
   - What date range is being requested
   - Whether BTD has April 2026 data available (try fetching it)

3. **Why did it stop?** Common causes:
   - Mac cron schedule disabled or machine not running
   - BTD API changed or rate-limited
   - Script errored and nobody noticed (no monitoring)
   - Manual process that was forgotten

4. **What's the fix?** Determine the best path to get fresh data flowing:
   - Is the Mac cron the right place, or should this move to worker cron or VPS?
   - Can the worker cron compute monthly activation clearing from the same BTD data it already fetches for live S2?
   - Should we add a watchdog/alerting for stale activation data?

## Audit steps

```bash
# 1. Check all cron/schedule scripts
find . -name "*.yml" -path "*workflows*" | xargs grep -l "btd\|activation\|s2" 2>/dev/null
find . -name "fetch-btd*" -o -name "*activation*" | grep -v node_modules | grep -v .git
cat .github/workflows/*.yml 2>/dev/null | grep -A5 "schedule\|cron"

# 2. Check the Mac cron script
cat ~/kkme-cron/fetch-btd.js 2>/dev/null || echo "Not found at ~/kkme-cron/"

# 3. Check worker cron handler
grep -n "scheduled\|cron\|trigger" workers/fetch-s1.js | head -20

# 4. Check what the worker cron actually runs
# Find the scheduled() handler
grep -n "async scheduled\|export.*scheduled\|addEventListener.*scheduled" workers/fetch-s1.js | head -5
# Then read the cron handler to see what signals it updates

# 5. Check wrangler.toml for cron triggers
cat wrangler.toml | grep -A5 "triggers\|cron"

# 6. Check VPS scripts
cat scripts/hourly_grid.py 2>/dev/null | head -50
ls scripts/*.py scripts/*.sh 2>/dev/null

# 7. Try fetching BTD activation data directly
# The BTD API base: https://api-baltic.transparency-dashboard.eu
# Check if April data exists
curl -s "https://api-baltic.transparency-dashboard.eu/api/v1/data?dataset=price_procured_reserves&start=2026-04-01&end=2026-04-20" | head -200

# 8. Check the s2_activation_parsed KV key structure
# Read the worker code that parses/stores activation data
grep -n "s2_activation_parsed\|activation_parsed" workers/fetch-s1.js | head -20

# 9. Check GitHub Actions for fetch-btd
cat .github/workflows/fetch-btd.yml 2>/dev/null
```

## Deliverable

Write a short report (save to `docs/investigations/s2-activation-pipeline-audit.md`) with:
- Diagram of the data flow (what fetches what, where it's stored, what triggers it)
- Root cause of the staleness
- Recommended fix (with effort estimate)
- Whether April BTD data is available

Do NOT make code changes in this session. Just investigate and report.
