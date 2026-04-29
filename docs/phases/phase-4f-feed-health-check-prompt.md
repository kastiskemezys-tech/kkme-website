# Phase 4F follow-up — Intel feed health check (read-only)

**For:** scheduled remote agent, no human required.
**Cadence:** every 14 days starting 2026-05-13.
**Runtime budget:** ≤5 minutes.
**Branch:** none — read-only, no commits, no PRs, no worker deploys.
**Output:** `docs/audits/phase-4f-followup-{YYYY-MM-DD}.md` plus a one-line GREEN/YELLOW/RED status string at the top of the file.
**Escalation:** if status is RED, write a Notion Task entry (see §3 below).

---

## What this check does

Runs the same external-audit lens that surfaced the 2026-04-29 Phase 4F regression and confirms the BESS quality gate (worker `f8411968`+) is still doing its job. Three checks, in order. Stop and emit RED at the first failure.

### §1 — Curl the live `/feed`

```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed > /tmp/feed.json
jq -r '.items | length' /tmp/feed.json
```

Save the full response into the audit output. Capture: total item count, distribution by `source`, `published_at` range.

### §2 — Three deterministic checks

**Check A: zero denylist hits.** No item's `source` or `source_url` may match these domains: `facebook.com`, `instagram.com`, `twitter.com`, `x.com`, `tiktok.com`, `youtube.com`, `reddit.com`, `quora.com`, `medium.com`, `wordpress.com`, `blogspot.com`, `substack.com`, `researchgate.net`, `academia.edu`. Also reject any `linkedin.com/posts/` or `linkedin.com/pulse/` URL pattern.

If ANY hit → status **RED**. The gate has regressed or been bypassed by a new ingestion path. Look at the last 14 days of commits to `workers/fetch-s1.js`; identify which ingestion path admitted the item; flag for hot-fix.

**Check B: Tier-1 ratio.** Of the items returned, count those whose `source` or `source_url` domain matches the Tier-1 set (`litgrid.lt`, `litgrid.eu`, `ast.lv`, `elering.ee`, `entsoe.eu`, `apva.lt`, `apva.lrv.lt`, `vert.lt`, `am.lrv.lt`, `rrt.lt`, `em.gov.lv`, `ec.europa.eu`, `acer.europa.eu`).

- ≥60% Tier-1 → check passes (good signal density).
- 40-60% → status **YELLOW** (Tier-2 / outside crowding the homepage).
- <40% → status **RED** (allowlist drift or topic gate too generous).

**Check C: feed density.** Count items with `published_at >= now - 14d`.

- ≥3 → check passes.
- 1-2 → status **YELLOW** (consider broadening allowlist or relaxing age window).
- 0 → status **RED** (cron ingestion may be down — check `/health`).

### §3 — Status emission

Write the audit report at `docs/audits/phase-4f-followup-{YYYY-MM-DD}.md` with this exact header:

```markdown
# Phase 4F follow-up — {YYYY-MM-DD}

**Status:** GREEN | YELLOW | RED — <one-line summary>
**Worker:** <current version_id from /health>
**Items in /feed:** <count>
**Tier-1 ratio:** <N/total = pct>
**Last 14d count:** <N>

---

## Check A — denylist hits
…

## Check B — Tier-1 ratio
…

## Check C — feed density
…

## Sample of current /feed (10 items)
| # | published_at | source | title |
|---|---|---|---|
…
```

**If status is RED**, additionally:

1. Write a Notion Task entry (use the Notion MCP `notion-create-pages` tool) in the operator's task database:
   - Title: `[P1] Phase 4F follow-up RED — <one-line failure mode>`
   - Area: `IntelFeed`
   - Type: `Bug`
   - Priority: `P1 Critical`
   - Body: link to the audit file (`docs/audits/phase-4f-followup-{YYYY-MM-DD}.md`) + the failing check's data + suggested next step (e.g. "Investigate which ingestion path admitted facebook.com/x; last 14 days of `workers/fetch-s1.js` commits: …").

2. If the failure mode is a denylist hit (Check A), also include in the Notion body: a copy of the offending item's full JSON (id, title, source, source_url, published_at) so the operator can identify the ingestion path immediately.

If status is YELLOW, write the audit file but do NOT create a Notion Task. The operator reviews YELLOW results during their next session.

If status is GREEN, write the audit file with `Status: GREEN — feed healthy, no action.` and stop.

### §4 — What's explicitly out of scope

- **No fixes.** Even if Check A finds garbage, don't deploy. Operator triages.
- **No worker source edits.** Read-only.
- **No tuning the keyword list or denylist.** Findings inform the operator; tuning happens in a follow-up session.
- **No `/feed/rejections` curl.** That endpoint requires `UPDATE_SECRET` which scheduled agents don't have. Operator can pull rejections manually if a YELLOW or RED triggers it.
- **No PR open, no commit.** The audit file is written to a worktree branch the scheduling system creates; the operator decides whether to merge it.

### §5 — Self-termination

If at any point the agent cannot reach the worker (`/feed` returns non-200, network failure, etc.), write the audit file with `Status: RED — worker unreachable, last successful check at <prior date>` and create the Notion Task. Do not retry beyond two attempts spaced 30s apart.

---

## Reference

- Phase 4F shipped: 2026-04-29, worker `f8411968-a69c-4e4a-a9de-d79565a5c007`, branch `phase-4f-intel-feed-regression` (PR pending operator).
- Investigation: `docs/investigations/phase-4f-intel-feed-regression.md`.
- Gate source: `workers/fetch-s1.js` (`evaluateFeedItemGates` ~L5158, `isValidFeedItem` ~L5292).
- TS mirror for reference: `app/lib/feedSourceQuality.ts`.

**End of prompt.**
