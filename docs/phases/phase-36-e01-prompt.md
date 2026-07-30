# 36.E0.1 — Periodic evidence-base refresh (grounding automation)

**Same branch/batch as B-036** (`phase-36-b036-activation-source`) — run AFTER B-036 completes so the refresh covers whatever activation source it lands.
**Estimate:** ~1-1.5 h. **Risk: LOW — no engine, no worker, no public site.**

## Why
The mature-market evidence base (E0) grounds every per-service forecast — but auction results keep publishing. A stale evidence base rots silently (C-class). This makes the refresh a scheduled platform job so KKME's benchmark data stays current, enabling future benchmark/comparison surfaces ("Baltic aFRR vs DE at the same fleet-ratio") without re-acquisition.

## Design (verify feasibility at Pause A, per playbook)

**Recommended host: GitHub Actions scheduled workflow** — the datasets live IN the repo, the fetchers are Node (E0-built), and the VPS has no Node (36.C finding). A monthly `schedule:` workflow reuses the existing fetchers unchanged, no port, no new server surface. Verify: repo Actions enabled, secrets needed (ENTSO-E token as an Actions secret — NEVER echoed in logs), runtime within free minutes. If Actions is unviable for a reason found at Pause A, fallback = VPS Python port of fetchers (bigger job — STOP and report rather than building it inside this batch).

1. **Refresh orchestrator** `tools/consultancy/data/refresh-mature-markets.mjs`: per-source incremental fetch (append-only deltas from each source's last-covered date per manifest) → loaders validate → manifests + checksums update → `summary-table.json` rebuilds → `comparability.md` UNTOUCHED (human-owned).
2. **Cadence:** monthly (auction-result series; per-source override field in manifests for anything faster-moving). First Sunday 03:00 UTC.
3. **Human-in-the-loop shape:** the workflow opens a PR with the delta (rows added per source, summary-table diff, gate results in the PR body). Operator merges — a 2-minute monthly task. NO auto-commit to main (data grounding deserves the same review discipline as forecast adoption, and PR-based means a broken source produces a reviewable red PR, not silent corruption).
4. **Failure surfacing (B8):** fetcher failure / schema drift / empty-delta-when-delta-expected → the PR (or a failure issue) says so explicitly per source; every source carries `last_successful_refresh` in its manifest, and a staleness check (>2 missed cycles) is added to the repo's health surface. Telegram hook if reachable from Actions (verify; otherwise the PR IS the alert).
5. **Gates in-workflow:** loader fixtures green · checksums valid · summary-table reproducible · append-only assert (refresh may never rewrite history rows — a source restating history is an ANOMALY to flag, not silently accept; it happens with settlement corrections, so the flag routes to operator review with the diff).
6. **Structural-break protection:** new rows landing AFTER a known break date are fine; the workflow never recomputes break segmentation — that stays analysis-side (E1-E6), refresh is data-side only.

## Wrap (whole batch: B-036 + E0.1)
Origin-SHA · B-036 verdict (what E2/E3 calibrate on) · first refresh run executed manually end-to-end as proof (its PR linked) · workflow file + schedule active · PR URL for the batch branch.
