# Phase 33.A.2 (W1a) — operational-confirmation allowlist + MW reconciliation — EVIDENCE

**Branch:** `phase-33-a-2-status-refresh-and-coverage` · **Commit:** `6cd05af` · **Worker deploy:** `7a285bf0-2dac-4152-a4e8-18d746da66b9` · **Date:** 2026-06-15 (Session 82)

Two-file change: `workers/fetch-s1.js` (+90/−1) + new `app/lib/__tests__/knownOperational.test.ts` (13 tests). W1a (status flip) + W3 (MW disagreement, folded in). W2 (LV add-endpoint) carved to 33.A.2.b; W1b (Litgrid ArcGIS auto-confirm) dropped → 33.A.2.c.

---

## Why

Pause A traced `/s4.projects.status` upstream: `kkme_sync.py` derives status from `map_status(pe.state, pe.permit_stage)`, and **no loader (litgrid/vert/elering/latvia/ast) ever writes `state='operational'`** — they scrape permit/connection registers. `merge_with_existing` only *blocks downgrades*, never upgrades. So a commissioned commercial BESS sits `announced` forever. The 7 operational entries are a curated `litgrid-layer3` seed, not a live feed. 4 of 5 operator-known-operational projects were stale (Pause A re-verified against live `/s4`).

## What shipped

- **`KNOWN_OPERATIONAL`** (`fetch-s1.js:~179`) — operator-curated allowlist, 4 seed rows, each with a verifiable `source_url` (rule #3 named-entity). Match = country + normalized name-substring (`normName` strips diacritics/smart-quotes/suffixes).
- **`applyKnownOperational(entries)`** — applied at POST `/s2/fleet` **before** `filterFleetEntries`. Flips `announced→operational`, overrides `mw`/`mwh`/`cod`, appends an operational-evidence token to `source` so the flip survives the C-01 hard-reject gate (Phase 33.A made `operational`-without-TSO-evidence a *reject*, not quarantine), and emits `_mw_disagreement{feed_mw,operator_mw,source_url}` when feed MW differs.
- **W3 folds in here** — the worker only ever receives one pre-collapsed `capacity_mw` per project (`entity_resolver` merges upstream), so the allowlist is the only place per-project MW disagreement can surface.
- Response now reports `flipped_operational`; `KNOWN_OPERATIONAL`/`applyKnownOperational`/`normName` exported for tests.

### Seed (4) — all primary-source verified

| Project | Country | Flip | MW (feed→operator) | MWh | COD | Source |
|---|---|---|---|---|---|---|
| Hertz 1 Jaago akupark | EE | →operational | 114.9 → **100** | 200 | 2026-02-03 | evecon.ee |
| UAB „Vilnius BESS" (E energija) | LT | →operational | 72 → **65** | 130 | 2025-12-01 | tv3.lt + LRT |
| UAB „Vėjo galia" | LT | →operational | 50 (solar) → **41** BESS | 107.3 | 2025-12-10 | LRT (2× fetched) |
| Tausolos saulė | LT | →operational | 30 (matches) | **67.7** | 2026-03-23 | LRT |

Auvere held back per Pause A operator decision (left `announced`/75 MW untouched). Vėjo galia restored to the original 3+1 intent after Pause-B verification confirmed UAB Vėjo galia operates the 41 MW / 107.3 MWh BESS (Kaišiadorys, Dec 2025); the feed's 50 MW is the co-located Naujažeris **solar** park, not the battery — `_mw_disagreement{50→41}` records the solar-vs-BESS gap.

## Revenue coupling (rule #1, 6th correction)

The prompt's premise — `sd_ratio = pipeline_mw/operational_mw = 42.5`, compressing to ~22, IRR moves down materially — is **empirically false**. The engine (`fetch-s1.js:231`) computes `sd_ratio = baltic_weighted / eff_demand` (status-weighted supply ÷ fixed demand). Flips *raise* weighted supply (announced 0.1 → operational 1.0 per MW) so sd_ratio goes **UP**. Every CPI feeding the IRR cashflows is already pinned at the **0.30 floor** (spot per-product sd 69.5/16.2/3.2 and projected-year sd all deep in MATURE → `cpiCurve`=0.30) → ~zero IRR movement. No operator IRR-gate needed.

## Local verification (pre-deploy)

```
vitest run            → 974 passed (66 files; +13 new)
tsc --noEmit          → clean
eslint (worker+test)  → 0 errors
lint:no-editorial-chips / lint:no-raw-spacing → clean
npm run build         → 7 routes compile
```

End-to-end simulation against the live 170-entry fleet (pre-deploy, via the worker's own `applyKnownOperational`): 4 flips, 3 disagreements, operational_mw 331→567, pipeline_mw 14067→13800, sd_ratio 1.86→2.08.

## Post-deploy verification (deploy `7a285bf0`)

Applied via authenticated full-fleet round-trip POST `/s2/fleet` on the VPS (170 entries re-ingested through the new code; non-destructive — only the 4 flips change). Browser UA needed (Cloudflare 1010 blocks urllib's default UA).

```
POST /s2/fleet  → {ok:true, accepted:170, flipped_operational:4, dropped:0, sd_ratio:2.08, phase:MATURE}
GET  /s4        → status: 159 announced / 11 operational (7 Kaupikliai + 4 flipped)
                  Hertz1 operational 100MW/200MWh cod 2026-02-03  dis{114.9→100}
                  Vilnius operational 65MW/130MWh cod 2025-12-01   dis{72→65}
                  Vėjo galia operational 41MW/107.3MWh cod 2025-12-10  dis{50→41}
                  Tausolos operational 30MW/67.7MWh cod 2026-03-23  (no dis — MW matched)
                  baltic_operational_mw 567 · baltic_pipeline_mw 13800 · sd_ratio 2.08 · cpi 0.31
GET  /revenue   → eu_ranking IRR 20% → 21% (+1pp, within ±5pp tolerance; rounding-level, floored-CPI prediction held)
POST /s2/fleet without secret → 401
```

0 dropped confirms the C-01-survival invariant held in production. Origin-SHA matched before deploy (`6cd05af` local == remote).

**Durability:** the flip lives in the worker ingest path, so every future `kkme_sync` POST (which still carries `announced` from PG) is re-flipped automatically — no upstream change required.

## Follow-ups filed

- **33.A.2.b** — W2 LV coverage: `POST /admin/add-fleet-entry` (manual operator add for Utilitas/Targale 10 MW + AST Rēzekne **60 MW** correction in curated `storage_by_country.LV` + future). AST has no scrapable register (1010/JS-iframe); automated LV scraper (was 33.A.2.d) not feasible — reframe as ENTSO-E or manual.
- **33.A.2.c** — Litgrid ArcGIS L2 (`ElektrosPerdavimoServisas/FeatureServer/2`) auto-confirm supplement. Triggers when ≥1 new *transmission-connected* LT operational commissioning needs confirmation the allowlist hasn't captured. (L2 currently only shows the 4×50 MW Energy Cells — zero new data today, hence deferred.)
- **33.A.2.d** — display-dedup pass: E energija renders twice (curated `storage_by_country.LT.assets` 65 MW *and* the flipped `Vilnius BESS` projects-feed entry). Engine uses only the projects feed (no sd_ratio double-count), but S4Card may show two pins. Reconcile.
- Two more known-operational LT projects surfaced in Pause B (LRT): Vėjo galia folded in this phase; **Vėjo galia's sibling list** named no others beyond E energija/Tausolos. AJ Power (~9 MW LV) snippet-only — do **not** seed without a primary URL (rule #3).
