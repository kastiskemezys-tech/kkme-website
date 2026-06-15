# Phase 33.A.2.b — Latvia coverage (curated inject + Rēzekne fix + manual valve + discovery automation) — EVIDENCE

**Worker:** `~/kkme` branch `phase-33-a-2-b-lv-coverage` · commit `1b68481` · deploy `5697a1e0-f57f-4996-88d8-0ff7b4e0fa59`
**Upstream:** `~/kkme-control-center` main · commit `99316cb` (rebased → pushed `dcb1157`)
**Date:** 2026-06-15 (Session 83)

Two repos. Worker = curated LV operational inject (W2) + Rēzekne ledger fix (W3) + manual safety valve (W4). Upstream = LV BESS discovery automation (lv_press tripwire + ENTSO-E cross-check live; AST/JRC committed but non-yielding).

---

## Rule #1 — 7th consecutive correction

The prompt's a/b/c diagnostic for "why only 2 LV entries" all under-fit. The real cause is **architectural**: `entity_resolver.py` has **no extractor for `sprk`/`bis`/`vvd`** (the source_systems `latvia_loader.py` writes) and no fallback → LV permit data can *never* resolve to `project_entity`. On top of that the `latvia_scraper` emits only SPRK-PDF-title garbage (no fresh file since 2026-04-24). **And the deeper finding: the LV grid-scale BESS fleet is genuinely small (~4-6 projects), not a broken pipeline** — "why so few entries" = *small market correctly counted*. Operational coverage is therefore curated (small, stable, primary-sourced); automation's payoff is *forward pipeline discovery*, not operational backfill.

## Worker side — what shipped

- **W2-curated** `injectCuratedFleet` (`fetch-s1.js`) extends the W1a mechanism to *add* (not just flip) the 4 known operational LV at POST `/s2/fleet`, all primary-source cited (rule #3): Utilitas Targale 10 MW (utilitas.ee), AJ Power 9 MW agg (ajpower.lv), AST Rēzekne 60 MW + Tume 20 MW (ast.lv) typed `tso_bess` (excluded from commercial weighted-supply S/D). **LV projects feed 2 → 6.**
- **W3** Rēzekne ledger 20→60; LV `installed_mw` 40→80 (the override lived in the `s4_buildability` KV assertion, not just the code default — updated both: code fallback + KV `installed_storage_lv_mw.value`); refreshed `coverage_note`. Rule #4: ledger `installed_mw` (80) = assets sum (60+20).
- **W4** `POST /admin/add-fleet-entry` — UPDATE_SECRET + BALTIC_COUNTRIES enforced, C-01 operational-evidence honesty gate, persisted to `s4_manual_additions` KV and re-merged on every `/s2/fleet` push (survives kkme_sync full-replace). Promotion path for tripwire candidates (rule #3 loop).
- 10 new tests (`lvCoverage.test.ts`); 973 pass; tsc / eslint / build (7 routes) clean.

## Post-deploy verification (deploy `5697a1e0`)

```
POST /s2/fleet (full-fleet round-trip) → accepted 174, flipped 4, injected_curated 4, dropped 0, sd 2.10
GET  /s4 → 159 announced / 15 operational
  LV (6): Aretis Iļģuciems 15 (announced), Aretis Līvāni 4 (announced),
          Utilitas Targale 10 (operational), AJ Power 9 (operational),
          AST Rēzekne 60 (operational), AST Tume 20 (operational)
  storage_by_country.LV.installed_mw = 80; assets Rēzekne 60 + Tume 20  (rule #4 ✓)
  baltic_operational_mw 567 → 666;  baltic_pipeline_mw 13800;  sd_ratio 2.10
GET  /revenue → eu_ranking IRR 21% (unchanged — IRR-safe; Rēzekne/Tume tso_bess-excluded, only +19 commercial weighted)
W4 /admin/add-fleet-entry:  no secret → 401 · non-Baltic DE → 400 · operational w/o evidence → 400 · valid LV → 200
```
Synthetic W4 test entry created then cleaned (s4_manual_additions → []; KV edge-cache ~80s propagation, then filtered re-POST → 174, merged_manual 0). Origin-SHA matched before deploy.

## Upstream automation (commit `99316cb`)

Alert-only **tripwire**, never auto-publish (rule #3): candidates → review file + Telegram alert; operator promotes via W4.

| Source | VPS-live result | Status |
|---|---|---|
| `lv_press_scraper.py` (Delfi + LSM RSS) | 150 items → 0 candidates (correct: BESS commissioning is rare) | ✅ live-verified, **wired into cron** |
| `lv_entsoe_crosscheck.py` (A68 B25 LV) | **LV storage = 90 MW** vs tracked 99 (−9 = distributed AJ Power) — independent EU validation | ✅ live-verified, **wired into cron** |
| `ast_events_scraper.py` (Playwright) | Cloudflare bypassed on events page (136 anchors) but `/projects/batteries` blocked; **0 candidates** (listing anchors carry no MW text) | ⚠️ committed, fail-soft, **not cron-wired** — extraction needs tuning |
| `jrc_inventory_scraper.py` (Playwright XHR) | **0 JSON responses captured** — SPA data-load not interceptable as guessed (no clean API, consistent with probe) | ⚠️ committed, fail-soft, **not cron-wired** — needs deeper RE or is infeasible |

16 parser unit tests pass (stdlib unittest) — on dev **and** VPS. Cron: `lv_press_scraper` added to the scraper loop + ENTSO-E cross-check line (`/opt/kkme/cron_daily.sh`, backup `*.bak-33a2b`, `bash -n` OK).

**Honest call (per operator's "surface at Pause C"):** AST + JRC ran fail-soft but yield nothing live. Rather than schedule daily headless-Chromium runs for 0 yield, they're committed (fail-soft, parser-tested) but left **unscheduled** pending extraction tuning → follow-up. The cron stays healthy; the working discovery value is lv_press + ENTSO-E.

## Follow-ups
- **33.A.2.b.1** (new) — AST-events extraction tuning (parse article-detail pages, not just listing anchors) + JRC data-source reverse-engineering (or close as infeasible — pure SPA, no API).
- **33.A.2.d** — display-dedup: Rēzekne/Tume now render in both `storage_by_country.assets` and the projects feed.
- **33.A.2.c** — Litgrid ArcGIS L2 auto-confirm (from 33.A.2).
- Roadmap deltas reported here for operator/Cowork to apply (rule #5 — CC does not edit roadmap).
