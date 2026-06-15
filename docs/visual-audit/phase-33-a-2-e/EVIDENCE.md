# Phase 33.A.2.e — Estonia operational status-refresh — EVIDENCE

**Worker:** `~/kkme` branch `phase-33-a-2-e-ee-coverage` · commit `dc6a782` · deploy **`a535130a-a6e6-433e-a26a-96ce2f9e44dd`**
**Date:** 2026-06-15 (Session 84). Worker-only. Same curated-allowlist mechanism as 33.A.2 (LT) + 33.A.2.b (LV).

---

## Rule #1 — 8th consecutive correction (qualitative first)

The prompt's premise #2 — "Hertz 2 operational 100MW" — is **empirically false**. Hertz 2 (Aruküla) is **under construction, COD ~end-2026**, verified by independent fetch: Corsica Sole developer page (*"Currently under construction… expected to enter operation by the end of 2026"*) + ess-news (Feb 2026, "construction underway"). The "200MW/400MWh" the operator cited is the **combined** Baltic Storage Platform (Hertz 1 + Hertz 2), not Hertz 2's nameplate.

**First time the prompt premise was wrong DESPITE the operator citing primary sources** — the citation carried an attribution error (combined-platform figure mistaken for the single project). Discipline takeaway: **even operator-cited primary sources need independent re-fetch at Pause A**; Cowork's pre-paste is a hypothesis, not ground truth.

## What shipped (worker-only)

- **Mechanism extension** — `applyKnownOperational` gains optional per-entry `target_status` (default `'operational'`). Pre-COD-but-confirmed projects flip to `'under_construction'` (STATUS_WEIGHT 0.1→0.9) without falsely asserting operation. The C-01 evidence-token append fires *only* for operational/commissioned targets and is now **self-healing + idempotent** (strip-then-append-once) — repairs the Hertz 1 source string that had bloated to ×5 across prior round-trip POSTs. Backward-compatible; all LT/LV entries unchanged.
- **3 EE entries** in `KNOWN_OPERATIONAL`, each primary-source cited (rule #3):

| Project | Action | MW (feed→operator) | MWh | COD | Source |
|---|---|---|---|---|---|
| Enefit Auvere | →operational | 75 → **26.5** | 53.1 | 2025-02-01 | energy-storage.news |
| Rummu | →operational | 14 → **9** | 18 | 2025-04-01 | enery.energy |
| Hertz 2 | →**under_construction** | 113.5 → **100** | 200 | 2026-12-31 (expected) | corsicasole.com |

  - Auvere: the feed's 75 MW = the Auvere industrial-complex permit, not the battery (26.5 MW).
  - Rummu: the feed's 14 MW = the hybrid grid-connection rating; the BESS nameplate is 9 MW (paired with a separate 20 MW PV).
  - Each carries `_mw_disagreement{feed, operator, source_url}`.

## A.2 — `elering_loader.py` (matches W1a precedent, no wireup needed)
The Elering scraper reads connection-queue status (`application/offer/contract/connected`) but the vocabulary tops out at "connected" → `connection_agreement` — never operational. Same structural reality as LT/LV: the register doesn't carry operational commissioning. Curated allowlist is the correct fix; 33.A.2.e.1 loader-wireup **not needed**.

## Revenue coupling (rule #1 #6 holds — IRR-safe)
Marking Hertz 2 `under_construction` is the largest single weighted move (announced 0.1 → UC 0.9 at 100 MW = +78.4); plus Auvere +19.0, Rummu +7.6 → **weighted +105** (1966→2071). sd_ratio 2.10→2.22; cpi 0.31→0.30 (hits the floor); per-product CPIs already floored → IRR moves +0.4pp only. `operational_mw` 666→**702** (Hertz 2 stays pipeline). EE operational **1→3**, EE under_construction +1.

## Local verification
```
vitest run → 979 pass (66 files; +7 new EE/self-heal tests, 2 obsoleted 33.A.2 tests updated)
tsc --noEmit clean · eslint 0 errors · build 7 routes
```

## Post-deploy verification (deploy `a535130a`)
```
POST /s2/fleet (round-trip) → accepted 174, flipped 7 (4 LT + 3 EE), dropped 0, sd 2.22
GET  /s4 → EE: 17 announced / 3 operational / 1 under_construction
  Hertz 1 operational 100 (dis 114.9→100) · Auvere operational 26.5 (dis 75→26.5)
  Rummu operational 9 (dis 14→9) · Hertz 2 under_construction 100 (dis 113.5→100)
  baltic_operational_mw 702 · sd_ratio 2.22 · cpi 0.30
GET  /revenue → eu_ranking IRR 21.0 → 21.4 (+0.4pp, within ≤+1pp Pause A prediction)
Source self-heal: Hertz 1 token ×5 → ×1 ("elering · Evecon Solar 461 OÜ · operator-confirmed operational")
C-01 survival: 0 dropped (incl. Hertz 2 under_construction with no operational token)
```
Origin-SHA matched before each deploy (initial + amended self-heal redeploy `a535130a`).

## Follow-ups
- **Hertz 2** flips to operational when it actually energizes (~end-2026) — re-verify COD then.
- 33.A.2.d display-dedup now also spans Hertz 1 (curated EE ledger vs projects feed).
- Roadmap deltas reported for operator/Cowork (rule #5).
