# Phase 34.1 — Per-project engine parameterisation

**Branch:** `phase-34-1-per-project-engine` off latest main.
**Estimate:** ~1.5 days CC (Wed 23 → Thu 24 July). Hard deadline context: this is phase 1 of 7 in the Phase-34 arc delivering the Prosperus v0.5 engagement by **July 31** (see `phase-34-arc.md` — read it first).
**Risk class:** MEDIUM. Refactors the signature of `computeRevenueV7` (the live revenue engine). The public site MUST be unaffected — byte-identical `/revenue` output for the reference asset is the regression gate.
**Three pause points.**

CC runs `npx wrangler deploy` directly after origin-SHA check at Pause C (memory `feedback_cc_runs_deploy_after_origin_check.md`).

## Why this phase exists

KKME won a consultancy engagement: independent revenue + EBITDA model for 3 Prosperus BESS projects (€10k, due July 31). The engine currently computes ONE hardcoded reference asset (50 MW / 100 MWh). This phase makes the asset a parameter, so the engine can compute any project — the 3 client projects now, any future client in minutes. The public site keeps serving the reference asset unchanged.

**The 3 client projects (all public-register data — committable):**

| id | Name | MW / MWh | Municipality | SPV | VERT permit | COD | Grid allowance |
|---|---|---|---|---|---|---|---|
| `bitenai` | Bitėnai | 48 / 96 | Pagėgių sav. | UAB "Baltakis Capital" | L-7441 (2026-04-24) | 2028-01 | 50 MW (Litgrid) |
| `stoniskiai` | Stoniškiai | 45 / 90 | Rokiškio r. | Prosperus bess 1, UAB | L-7162 (2025-08-07) | 2028-06 | 50 MW |
| `eigirdziai` | Eigirdžiai | 30 / 60 | Telšių r. | UAB „Prosperus bess 1" | L-7179 (2025-08-22) | 2029-Q1 | 30 MW (POI-bound) |

## Discipline rules load-bearing here

- **#1 audit-triage** — 9 consecutive prompt-premise corrections. Everything below labelled "expected" is a hypothesis; Pause A verifies against live code. In particular: the exact set of places where 50/100 is hardcoded is UNKNOWN to Cowork — the grep map is Pause A's first job.
- **#4 cross-card consistency** — the project config becomes the single canonical source for per-project quantities. No parallel literals. Reference asset config must produce today's exact numbers.
- **#5** — no roadmap/arc-doc edits from CC.
- **Public-site regression gate** — `/revenue` (all query-param combinations that exist today: `dur`, `scenario`, `capex`, `cod`) byte-identical before/after, modulo `timestamp`. This is the non-negotiable.
- **NDA** — the 3 project configs are public-register data (VERT PDFs + Litgrid queue, already in `/s4`). Nothing else about the client engagement goes in code or commits. The word "Prosperus" appears ONLY in `tools/consultancy/projects/prosperus/` paths and this prompt — never in worker code, never on the public site.

## Pause A — Map the hardcode surface + propose the config schema (~2-3h)

1. **Grep the full 50/100 hardcode surface** in `workers/fetch-s1.js`: `50 MW`, `100 MWh`, `= 50`, `= 100`, `16400000` (capex_total), `9020000` (debt), `7380000` (equity), `system`, `BESS_WORKER`, and the computeRevenueV7 entry path. Build the table: line → literal → what it represents → parameterise vs leave. Expect: system size, capex derivation, debt/equity split, per-MW normalisations, display strings. There will be sites Cowork hasn't predicted.

2. **Trace the compute entry path.** How does the cron/route invoke `computeRevenueV7` today? What's the cleanest seam to inject a config object — a `projectConfig` first argument with the reference asset as default? Confirm `scripts/audit-stack.mjs --probe-v73` drives the engine directly (Phase 32.1 precedent) — that's the pattern the consultancy tools will use, so the seam must work outside the worker runtime too.

3. **Propose the config schema.** Expected shape (Pause A refines):

```json
{
  "project_id": "bitenai",
  "name": "Bitėnai",
  "mw": 48,
  "mwh": 96,
  "duration_h": 2,
  "cod": "2028-01",
  "cod_year": 2028,
  "operational_months_y1": 12,
  "warranty_efc_yr": 730,
  "grid_allowance_mw": 50,
  "capex_eur_kwh": 164,
  "meta": { "municipality": "Pagėgių sav.", "spv": "UAB \"Baltakis Capital\"", "vert_permit": "L-7441", "source": "public-register" }
}
```

Reference asset = same schema (`project_id: "kkme-reference"`, 50/100, COD 2028). Where do configs live? Proposal: `tools/consultancy/projects/prosperus/*.json` + `tools/consultancy/projects/kkme-reference.json`. Worker embeds ONLY the reference config (worker can't read files) — confirm the mirror pattern (like RTE_BOL worker↔TS mirror, Phase 32.1) or propose better.

4. **Flag every scaling assumption that is NOT linear in MW/MWh.** Debt/equity split (55/45 of capex?), opex flat €1.95M vs per-MW, fleet-context values (sd_ratio is fleet-level, NOT per-project — must not scale), cycles (per-MWh-normalised already?). Classify each: scales with project / fleet-global / needs-new-parameter.

5. **Pause A output:** hardcode table + config schema + seam proposal + scaling classification + estimate confirmation. STOP for operator approval.

## Pause B — Build + verify (~4-6h)

1. Introduce `PROJECT_CONFIG` default (reference asset) + `computeRevenueV7(config, ...)` parameterisation per approved seam. All hardcode sites read from config.
2. Add the 3 Prosperus configs under `tools/consultancy/projects/prosperus/`.
3. New runner: `tools/consultancy/run-project.mjs <config-path>` → drives the engine (audit-stack pattern) → emits full engine JSON to `tools/consultancy/output/<project_id>.json`. Output dir gitignored.
4. **Regression gate:** capture `/revenue` output for every existing param combination BEFORE the refactor (local run), diff AFTER — must be identical modulo timestamp. Automate as a script, keep it (`tools/consultancy/regression-reference.mjs`).
5. **Partial-year handling:** Stoniškiai COD 2028-06 (7 months Y1), Eigirdžiai 2029-Q1. Minimum viable: `operational_months_y1` scales Y1 revenue/opex linearly; full-year from Y2. Flag anything that shouldn't scale linearly (fixed fees).
6. Tests: per-project outputs sane (Bitėnai gross_y1 in €8-10M band at current prices, scaling ∝ MW between projects, reference unchanged — exact-match test), config validation (reject mw≤0, missing fields).
7. Gates: tsc, vitest (all existing + new), both lint gates, build, worker syntax.

Pause B sub-stop: report the 3 projects' headline numbers (gross/EBITDA/pre-fin CF Y1) vs the mockup's placeholder numbers (`prosperus-mockup-v5.html` — Bitėnai gross €9.26M etc.). Deltas expected (mockup was scaled placeholders); large deltas (>±20%) need operator eyes before Pause C.

## Pause C — Ship (~1h)

1. Commit + push `phase-34-1-per-project-engine`. Origin-SHA equality check.
2. `npx wrangler deploy` (worker changed). Version ID captured.
3. **Production verification:** `/revenue` live output identical to pre-phase capture (modulo timestamp). The public site must not have moved.
4. Local: `run-project.mjs` for all 3 Prosperus configs → 3 output JSONs, headline table in handover.
5. EVIDENCE.md + Session entry + final origin re-verify.
6. Report next-phase readiness: Phase 34.2 (cost decomposition + CAPEX schedule) starts from these outputs.

## Out of scope

- Cost decomposition (34.2), portfolio math (34.3), scenario mapping (34.4), register/reconciliation (34.5), Excel (34.6), PDF (34.7) — see arc doc.
- Hourly dispatch — v1.0 extended, client-agreed.
- Public per-project calculator — Phase 35 candidate, not now.
- Any public-site UI change.

## Pre-flight (operator)

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-34-arc.md docs/phases/phase-34-1-prompt.md
git add docs/phases/phase-34-arc.md docs/phases/phase-34-1-prompt.md
git commit -m "phase 34: consultancy engine arc + 34.1 prompt"
git push origin main
zsh; cc
```

Then: `read docs/phases/phase-34-arc.md and docs/phases/phase-34-1-prompt.md and execute 34.1. three pause points. stop after pause A.`
