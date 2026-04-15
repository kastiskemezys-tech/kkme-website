# Phase 4B — Intel Pipeline Depth Investigation + Source Widening

Self-contained Claude Code prompt. Expected duration: 2–3 hours. YOLO mode acceptable but this one has real risk (VPS production code + upstream pipeline changes) — YOLO with **one mandatory pause** before any source additions are deployed to VPS production.

**Context:** The `/feed` endpoint currently serves 7–9 items. For a site covering Baltic BESS across 3 countries with a 4h refresh cadence, this is thin. After Phase 3A defensive drops and the current enrichment pipeline, the intel surface feels sparse. Investor-first priority (per bucket3-rebuild-plan.md) demands a richer feed before the Phase 4A visual rebuild makes sparsity more visible.

**Goal:** Find out why volume is low and fix it. Two likely causes:
1. Source list in `daily_intel.py` is too narrow
2. Worker or VPS filtering is too aggressive (title length, dedup, category, expiry, feed_score threshold)

This is a **pipeline investigation first, widening second**. Do not add sources before understanding what the current pipeline already produces and why the volume is what it is.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh` — worker + site healthy
2. Read `docs/handover.md` — Phase 3C+3D just merged
3. Read `docs/phases/bucket3-rebuild-plan.md` section 4 for feed context
4. `git status && git log --oneline -5` — clean, on main
5. `git checkout -b phase-4b-intel-pipeline`
6. SSH check: `ssh root@89.167.124.42 'uptime'` — confirm VPS reachable. If not, stop and report.

State scope and wait for "proceed". This is the single hard pause before any work begins (unless user told you YOLO, in which case proceed but hit Pause A before any VPS file changes).

## Superpowers

- Use **brainstorming** skill if the source gap analysis turns up unexpected findings (e.g., current source list is actually broad but over-filtered — design decision needed on which filter to relax first).
- Use **verification-before-completion** before VPS deploy.
- Use **subagent-driven-development** if worker-side and VPS-side investigations can run parallel — one subagent greps worker, another SSH's to VPS and inventories scripts.
- End-of-session Superpowers note: "Superpowers: [helped/neutral/hindered] — [one line]". This is the third evaluation; if all three neutral, next session updates ADR-006 accordingly.

---

## Phase structure — investigate, then propose, then widen, then verify

### Part 1: Discovery (no changes, target 30–45 min)

**On the worker side:**
- `grep -n "feed_index\|source_quality\|feed_score\|feed/events\|intel_sources" workers/fetch-s1.js` — find feed-adjacent code paths
- Read the `/feed` GET handler (~line 5673), `/feed/events` POST (~line 5691), `/feed/clean` (~line 5751)
- Note all filter conditions: title length, bot-prefix, expiry, category filter, dedup logic
- Note expiry-by-category table (EXPIRY_DAYS) — current values: commodity_cost 30d, project_stage 90d, market_design 180d, default 60d. Compute: if an item arrives dated 2026-01-10 and today is 2026-04-15, which categories will still be live?
- Check what feed_score threshold (if any) applies in render sort — currently sort by feed_score desc, no floor. But frontend could be threshold-gating. Check `app/components/IntelFeed.tsx` post-3C+3D normalizer for any floor.

**On the VPS side:**
- SSH to `root@89.167.124.42`
- Find the intel pipeline: `find /opt/kkme -name "*.py" | head -20` — look for `daily_intel.py`, `enrich_*`, `intel_*`
- `cat /opt/kkme/app/data/daily_intel.py` (or wherever it lives) — full read
- Identify: (a) source list, (b) fetch method per source (RSS? scrape? API?), (c) extraction logic, (d) worker-post endpoint, (e) schedule (cron or systemd timer)
- `systemctl list-timers | grep -i kkme` or `crontab -l` — confirm how often the pipeline runs
- Check pipeline log for recent runs: likely `/var/log/kkme/*.log` or `journalctl -u kkme-intel` — look for errors, per-source item counts, silent failures
- Inspect PostgreSQL if intel lands there first: `psql -U kkme -d kkme -c "\\dt"` then describe relevant intel tables, count rows by source/date

**On the data side:**
- `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | jq '{total, category_counts: (.items | group_by(.category) | map({category: .[0].category, n: length})), source_counts: (.items | group_by(.source) | map({source: .[0].source, n: length})), date_range: {oldest: (.items | map(.published_at) | min), newest: (.items | map(.published_at) | max)}}'`
- `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | jq '.items[] | {title, source, category, published_at, feed_score, source_quality}'`
- Document: how many items in KV total (before expiry filter), how many after each filter layer, what sources are represented, what date range is covered.

### Pause A — Discovery report (MANDATORY even in YOLO)

Before any VPS file edits, stop and report:

1. **Current source inventory** — exact list of sources the VPS pipeline polls, with type (RSS/scrape/API) and last successful fetch date per source
2. **Volume funnel** — items produced by pipeline → items POSTed to `/feed/events` → items accepted (after worker dedup) → items surviving expiry → items rendered by frontend (after 3A normalizer)
3. **Filter audit** — every point where items get dropped, with estimated drop rate
4. **Gap analysis** — sources MISSING from the current list, categorized:
   - **Must-add Baltic-specific:** LRT energy, Delfi LT/LV/EE energy, 15min, ERR energy, BNS, LETA, Baltic Energy Forum, Baltic Course energy
   - **Must-add TSO/regulator:** ENTSO-E transparency news, ACER news, National Regulator bulletins (VERT.lt, SPRK.lv, Competition Authority), Ministry of Energy press releases (LT/LV/EE)
   - **Must-add industry/trade press:** Montel News Baltics, S&P Global Commodity Insights energy storage, Argus Media Baltic power, Reuters Baltics, EurActiv Energy, Clean Energy Wire, Energy-Storage.news, pv-magazine Baltic, WindEurope news, EASE Storage
   - **Nice-to-have:** Pipeline company press (Ignitis press, Enefit press, Latvenergo press, Inter RAO press, Nord Pool press, Litgrid press already in)
5. **Root cause hypothesis** — is low volume primarily (a) narrow source list, (b) aggressive filtering, (c) pipeline errors/silent failures, (d) upstream publication cadence genuinely low?

Wait for "proceed" before Part 2. If user is away and you must YOLO: proceed only if the report clearly identifies a narrow source list as the primary cause. If the primary cause is filter-aggressive or pipeline-broken, STOP — those need human judgment.

### Part 2: Implement widening (target 60–90 min)

Scope: add sources identified in the gap analysis to the VPS pipeline. Do NOT change worker filtering without a specific, evidence-backed reason (e.g., "the title length ≥ 15 filter drops 40% of otherwise-good items" → propose, pause, then change).

**For each new source:**
1. Add to the `daily_intel.py` source list with correct fetch method (RSS URL / scrape target / API config)
2. Map source → source_quality tag:
   - TSO/regulator/ministry → `tso_regulator` or `official_publication`
   - Trade press → `trade_press`
   - Company press → `company_release`
   - Local media → `local_media` (new tag if needed — propose in Pause A report)
3. Map source → default category (category gets overridden by NLP if that exists in the pipeline)
4. If the pipeline has an enrichment/classification step (Anthropic API call?), confirm new sources route through it

**Worker-side changes (only if Discovery flagged a filter as over-aggressive):**
- Do not touch feed endpoint filters without a specific pause to propose the change
- If adding a new source_quality value, ensure `app/lib/sourceClassify.ts` (the Phase 3C util) recognizes it — otherwise new primary sources won't get OFFICIAL badges

**Expiry widening (likely needed):**
- project_stage currently 90d — for a market where BESS projects take 2–3 years from announcement to COD, 90d is too short. Propose 180d and justify.
- policy category has no explicit expiry (uses default 60d) — policy items often matter for 6–12 months. Propose 180d.
- Log the change in git as a discrete worker commit if you make it, separate from pipeline changes.

### Pause B — Pre-deploy report

Before pushing changes to VPS or deploying worker:

1. Summary of source additions (count + named list)
2. Summary of filter/expiry changes (what, why, risk)
3. Local dry-run output if possible (run the modified `daily_intel.py` against a sandboxed KV namespace or against the prod endpoint with `?dry_run=1` if supported — if not, note this limitation)
4. Rollback plan (how to revert both VPS scripts and worker changes if feed quality drops)

Wait for "proceed" if user is around. YOLO: proceed if risk is low (VPS scripts are idempotent and worker changes are additive), stop if worker expiry logic changed (affects existing live items).

### Part 3: Deploy + verify (target 30–45 min)

- Deploy VPS changes: `scp` modified scripts, `systemctl reload` or equivalent, watch first scheduled run via `journalctl -f`
- If worker changes, deploy via `npx wrangler deploy`, `bash scripts/validate-deploy.sh`
- Wait for next pipeline run (or trigger manually: `ssh root@89.167.124.42 'cd /opt/kkme && python3 -m app.data.daily_intel --force'`)
- Verify: `curl -s .../feed | jq '.total'` — expect higher number than baseline
- Verify: `curl -s .../feed | jq '[.items[].source] | unique'` — expect more unique sources
- Check frontend renders correctly: `npm run dev`, scroll intel section, confirm no new defects (missing favicons for new source domains, uncategorized items, etc.)

### Part 4: Document + commit

- Update `docs/handover.md` session log with: source count before → after, volume before → after, filter changes, deferred items
- Update `docs/map.md` if VPS pipeline file paths were inventoried or new ones added
- If a worthwhile finding emerged (e.g., a source category that should be its own filter tab), add to backlog
- Commit worker changes (if any) in repo, push branch, report PR URL
- VPS changes don't go through the repo unless `daily_intel.py` is actually version-controlled — check in Discovery

---

## What NOT to do

- **Do not rewrite the enrichment pipeline.** This is a widening + filter audit, not a rebuild. If the pipeline fundamentally needs rewrite, log that finding and stop — a rewrite is its own phase.
- **Do not add Anthropic API budget.** If new sources 3x the item volume, the classification API calls 3x. Estimate cost impact before deploying, cap new sources if budget is a concern.
- **Do not wipe `feed_index` KV.** Deleting existing items to force re-ingestion risks losing manually-curated pins. Additive only.
- **Do not change the /feed/events POST schema.** Frontend Phase 3A normalizer + Phase 3C chip mapping depend on current field names.
- **Do not touch the worker signal endpoints** (/s1, /s4, /s8, etc.) — scope is feed only.
- **No new npm packages or VPS pip packages** without explicit justification in the Pause B report.
- **No secrets in commits.** VPS SSH credentials, Anthropic API keys stay out of repo.

---

## Verification

### VPS-side
- `systemctl status` on pipeline service shows healthy, no errors in last run
- Pipeline log shows items-per-source count, no silent failures
- PostgreSQL row count increases after first scheduled run post-deploy

### Worker-side
- `/feed` total increases (target: ≥25 items, ideally ≥40 given 50-item cap)
- `/feed` unique source count increases (target: ≥10 distinct sources, ideally ≥15)
- `/feed` category spread more even (no single category >60% of items)
- Oldest item date: not older than 180d
- Newest item date: within last 7d (indicates pipeline still running)

### Frontend
- Intel section renders with new volume
- Favicons load for new source domains (if Google favicon service doesn't have them, letter-square fallback fires — acceptable)
- Source classification in `app/lib/sourceClassify.ts` recognizes new sources (OFFICIAL badges render correctly)
- No TypeScript or runtime errors
- `npm run build` clean

### Sanity
- Before/after screenshots of the intel section (dark + light) if MCP loaded
- Manual scroll through top 20 items — any obvious junk, duplicates, or misclassified items?

---

## End-of-session report

- Part 1 findings (source inventory, volume funnel, filter audit, gap analysis, root cause)
- Part 2 changes (sources added, filters changed, expiry changed)
- Part 3 verification results (before/after volume, source count, category spread)
- Part 4 commits (branch pushed, PR URL)
- Proposed handover.md session log entry
- New backlog items discovered
- Superpowers note

---

## Hard rules

- Mandatory Pause A after Discovery, even in YOLO
- Additive changes preferred over filter relaxation (add sources before loosening filters)
- Worker changes and VPS changes as separate commits/deploys (easier rollback)
- No pipeline rewrite, no schema changes
- Budget check if item volume triples
- Don't push from Cowork

---

## Reference

- VPS: 89.167.124.42 (PostgreSQL + scrapers + daily ingestion)
- Worker file: `workers/fetch-s1.js` lines 5673–5820 for `/feed` + `/feed/events` + `/feed/clean`
- Worker KV namespace: `KKME_SIGNALS`, key `feed_index` (capped at 100 items)
- Expiry defaults: commodity_cost 30d, project_stage 90d, market_design 180d, default 60d
- Frontend consumer: `app/components/IntelFeed.tsx` + `app/lib/sourceClassify.ts`
- Handover: `docs/handover.md`
- Bucket 3 plan: `docs/phases/bucket3-rebuild-plan.md`
