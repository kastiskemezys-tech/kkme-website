# Phase 33 — Production verification evidence (Session 78, 2026-06-15)

Authoritative source: live worker curl (`kkme-fetch-s1.kastis-kemezys.workers.dev`).
Worker deploys: `0972c7c4-…` (capacity-price bound + VPS cron fix) → `06b9d774-4ba0-4178-a277-962c5d8c8ad8` (s1_capture dual-writer lock).
Commits: `a761893`, `6f3d9cb`, `5739358` on `phase-33-engine-drift-and-feed-quality`.

## `/revenue` — capacity-price bound (after s1_capture recovery → v7.3)

| field | before (broken) | after (this phase) |
|---|---|---|
| model_version | v7.3 | v7.3 |
| **project_irr** | **0.4963 (49.6%)** | **0.1852 (18.5%)** |
| equity_irr | 1.0227 | 0.3239 |
| moic | 17 | 5.15 |
| gross_revenue_y1 | €13.65M | €7.32M |
| bankability | — | Pass |
| afrr_cap / mfrr_cap / fcr_cap | 37 / 28.68 / 63 (conflated) | 7.06 / 19.74 / 0.36 (bounded) |
| prices_source | BTD partial | BTD partial |

`ch_benchmark`: central 16.6%, range 6–31%. **18.5% is inside the band, just above central.**

## `/health` — VPS dash/cron fix + catch-up

- `baltic_storage_index_latest`: **457h → 0h** (fresh)
- `s2`: 63.7h → fresh
- all env-dependent crons green (no "env var not set")

## `/kv/set` — dual-writer lock

- `POST /kv/set` with `key:"s1_capture"` → **HTTP 400 `key 's1_capture' not in allowlist`** (worker `computeCapture` is now sole writer)

## `/s4` — installed-MW finding (→ Phase 33.A)

- `storage_by_country.LT.installed_mw = 484`, `installed_mw_as_of: 2026-03-23` — **unchanged** by the cron fix (separate, ~3-month-frozen pipeline upstream of Phase 33).

_(Raw JSON snapshots `revenue-bounded-evidence.json` / `health-post-cron-recovery.json` exist locally but are gitignored via `docs/**/*.json`.)_
