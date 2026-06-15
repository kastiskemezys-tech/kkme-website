# Phase 33.A.2 — Status-refresh + LV source coverage + MW reconciliation

**Branch:** `phase-33-a-2-status-refresh-and-coverage` off latest main.
**Estimate:** ~4-6h CC across three workstreams. Pause A may surface that 4-6h is optimistic — propose split (33.A.2 / 33.A.2.b) if needed.
**Risk class:** MEDIUM. Touches multiple data feeds + worker normalization + potentially upstream `~/kkme-control-center` repo. Phase 33's capacity-price bound + 33.A's allowlist protect the revenue engine; this phase's data updates could still move IRR via the pipeline_mw → sd_ratio → CPI mechanism (precedent: Phase 33.A premise correction where allowlist purge moved IRR 18.5% → 20.0%). Pause A must quantify the expected IRR shift before any deploy.
**Three pause points.**

CC runs `npx wrangler deploy` directly after the origin-SHA equality check at Pause C — no operator round-trip (memory `feedback_cc_runs_deploy_after_origin_check.md`).

## Why this phase exists

Phase 33.A.2 was filed at Phase 33.A's ship after `/s4.storage_by_country.LT.installed_mw = 484 (as-of 2026-03-23)` was found frozen 3 months. Operator subsequently confirmed via mental model that real Baltic operational BESS fleet has grown materially since March. Operator's 2026-06-15 sample of 5 known-operational projects + Cowork cross-check against `/s4.projects` empirically diagnosed **all three failure modes at once**:

**Empirical findings (rule #1 — re-verify at Pause A):**

| Operator's known-operational project | `/s4` has it? | `/s4` status | Gap |
|---|---|---|---|
| Hertz 1 (Kiisa EE, 100MW/200MWh, COD 2026-02-03) | ✓ as "Hertz 1 Jaago akupark" 114.9MW | **announced** | Status stale + MW mismatch (115 vs 100) |
| Auvere BESS (Ida-Viru EE, 26.5MW/53.1MWh) | ✓ as "Auvere salvesti" 75MW | **announced** | Status + MW way off (75 vs 26.5) |
| Vilniaus BESS (Trakai LT, 60MW/130MWh, COD Dec 2025) | ✓ as "UAB Vilnius BESS" 72MW | **announced** | Status + MW mismatch (72 vs 60) |
| Tausolos BESS (Telšiai LT, 30MW/130MWh, COD March 2026) | ✓ as "Tausolos saulė, UAB" 30MW | **announced** | Status only (MW matches) |
| Utilitas Wind (LV, 10MW/20MWh, COD 2024-11-01) | ✗ **NOT IN DATA** | — | Entirely missing |

**Other Cowork findings:**
- All 7 "operational" entries in `/s4` are Litgrid Kaupikliai/Energy Cells from 2022 (TSO-owned grid-stabilization, sum 331 MW). No commercial BESS commissioning since is flagged operational.
- LT installed_mw = 484. 484 − 331 = **153 MW unaccounted for** — suggests `installed_mw` is sourced separately from the projects list (probably a Litgrid grid-storage capacity ledger), also not refreshing.
- LV has only **2 entries total** in `/s4.projects`. Latvia source coverage is structurally weak.
- EE has 21 entries but Hertz 1 + Auvere are both miscategorized.

## Three workstreams

**W1 — Status refresh (dominant gap, P0):** `kkme_sync.py` never flips `announced → operational` when projects come online. 4 of 5 known-real-operational are in the data flagged "announced." Where does status come from upstream? What signal triggers the flip? Add operational-confirmation sources.

**W2 — Latvia source coverage (structural gap, P1):** AST (Latvian TSO) has no positive feed into the current ingestion. Utilitas Wind (operational since Nov 2024) entirely missing. Add a Baltic-positive LV source OR add a manual operator-add admin endpoint.

**W3 — MW reconciliation across sources (data quality, P2):** Same project carries different MW across feeds (Hertz: 100/115, Auvere: 26.5/75, Vilnius: 60/72). Pick canonical-source-per-field policy + surface source disagreement.

## Discipline rules

- **#1 audit-triage** — sixth consecutive phase. Re-verify ALL Cowork findings at Pause A via live curl + upstream PG inspection. The 5-project sample is small; expect to surface more diagnostic projects via TSO arcgis dashboards.
- **#4 cross-card consistency** — if MW canonical source changes, ensure consumers (S4Card "Grid Access", revenue engine's pipeline_mw, RevenueCard installed-base footers) all read from the same canonical field.
- **#5 roadmap edit-conflict** — no roadmap edits from CC. Cowork applies the delta post-merge.
- **Phase 33.A precedent** — fleet data changes COUPLE to revenue via `baltic_pipeline_mw` → `sd_ratio` → `CPI` → `IRR`. Status flips announced→operational move project MW FROM pipeline TO installed → both numbers move → sd_ratio shifts. Pause A must quantify expected magnitude BEFORE deploy. Operator may want to gate the deploy on IRR-direction sign-off.
- **Session 74 origin-verify guard** before any worker deploy.

## Pause A — Investigation across all three workstreams (~90-120 min)

### A.1 — W1: Status flip mechanism

1. **Trace `/s4.projects.status` upstream.** Worker stores `raw_entries` verbatim via POST `/s2/fleet` (per Phase 33.A finding). So the status string comes from `kkme_sync.py` in `~/kkme-control-center`. Grep that repo for the status-decision logic. Report:
   - What field is read from the source feed to determine status?
   - Is there a status-update trigger anywhere (re-scrape on schedule? press-release detection? TSO arcgis polling?)
   - Are there UPDATE statements on the PG fleet table? Or just INSERT-on-new-discovery?

2. **Litgrid storage arcgis.** Find the operator-mentioned `experience.arcgis.com` Litgrid dashboard URL. Inspect — does it carry operational/announced status per project? Could it be the positive operational-confirmation feed?

3. **Estonia: Elering operational register.** Does Elering publish a public operational BESS list (HTML / JSON / GIS)? If yes, that's the EE operational-confirmation source.

4. **Confirm the 4 status-stale projects.** Curl `/s4` + grep — verify Cowork's "Hertz 1 / Auvere / Vilnius BESS / Tausolos = announced" finding still holds today.

5. **Other known-stale projects.** Operator's sample is 5; arcgis dashboards probably show 10-20+ operational BESS. Sample 5-10 more known-operational from Litgrid arcgis (LT) + Elering operational register (EE) + AST (LV) and check their `/s4` status — quantify the actual breadth of the status-stale gap.

### A.2 — W2: Latvia source coverage

1. **AST (Augstsprieguma tīkls — Latvian TSO).** Does it publish a public storage register or arcgis dashboard? URL? Format (HTML/JSON/CSV)?
2. **Latvian BESS press/news sources.** ESN gets dropped at allowlist (Phase 33.A), but there are likely Latvia-specific energy press (lsm.lv, db.lv, energija.lv) — could any of them be a positive feed?
3. **Manual operator-add path.** If automated LV feed is multi-day investigation, propose: `POST /admin/add-fleet-entry` with `X-Update-Secret` auth, manual JSON body, country-filtered through the same `BALTIC_COUNTRIES` allowlist. Operator can drop Utilitas Wind + future findings in directly until automated feed lands.
4. **Other LV operational BESS.** Pull from press / arcgis any other LV-side operational. Operator gave Utilitas Wind 10MW; that can't be the only one in 18 months of LV market activity.

### A.3 — W3: MW reconciliation

1. **Per-project MW source.** Where does `mw` come from for each `/s4.projects` entry? Single source per project, or multiple sources averaged/picked? Grep `kkme_sync.py` for the MW-assignment logic.
2. **Canonical source policy.** Propose: TSO ledger > company press release > industry news (ESN dropped anyway). Or alternative ranking.
3. **Source-disagreement detection.** When two sources disagree on MW for the same project, emit a `_mw_disagreement` flag carrying `{sources: [...], values: [...]}` so the data surface stays honest about uncertainty.

### A.4 — Revenue engine coupling magnitude

1. **Quantify pipeline_mw shift if status flips applied.** If the 4 known-stale projects (Hertz 1, Auvere, Vilnius BESS, Tausolos) flip announced→operational AND Utilitas Wind is added:
   - Current `baltic_pipeline_mw` = 14067 (post-Phase-33.A purge)
   - Current `baltic_operational_mw` = 331 (the 7 Kaupikliai)
   - After flips: pipeline drops by sum of flipped MW (~100+75+72+30 = 277 MW); operational rises by same + 10 Utilitas = 287 MW. New pipeline ≈ 13790, new operational ≈ 618.
   - sd_ratio = pipeline/operational shifts from 14067/331 = 42.5 to 13790/618 = 22.3. That's a major sd_ratio compression → CPI floor may shift → IRR moves DOWN (more supply relative to demand = lower revenue per MW).

2. **Operator sign-off gate.** Pause A reports the expected IRR direction + magnitude. Operator confirms whether the shift should be allowed (it IS more accurate data; the IRR move reflects reality more honestly) OR gate the status-flip behind a manual flag pending review.

### Pause A output

| Workstream | Root cause | Fix path | Effort | Risk |
|---|---|---|---|---|
| W1 status | … | … | … | … |
| W2 LV coverage | … | … | … | … |
| W3 MW reconciliation | … | … | … | … |
| IRR coupling | sd_ratio 42.5 → ~22 expected | operator sign-off needed | — | — |

**Split decision:** if Pause A finds total effort >6h, propose `33.A.2.b` split (e.g., W1 ships now, W2+W3 carve off). Operator picks.

STOP for operator approval. Operator confirms:
1. Fix paths for W1/W2/W3 (or split).
2. IRR shift direction + magnitude is acceptable (or gated).
3. Manual-add admin endpoint (W2) if automated LV feed is multi-day.

## Pause B — Build + local verify (~120-180 min, scope-locked)

Three workstream branches:

### B.1 — W1: status refresh

Implementation locked at Pause A. Possible shapes:
- (a) Worker-side normalization: read existing entries on POST `/s2/fleet`, check known-operational allowlist (operator-curated KV `s4_known_operational`), flip status on entry IF allowlist matches by name/slug. Operator-controlled, no upstream changes. Fast.
- (b) Upstream `kkme_sync.py` adds a periodic Litgrid arcgis scrape → updates PG fleet table → re-pushes to worker. Cleaner but external repo + longer ship.
- (c) Hybrid: worker allowlist for instant fix + 33.A.2.c follow-up for arcgis automation.

Recommend (c) at Pause A.

### B.2 — W2: LV coverage

Implementation locked at Pause A. Likely shapes:
- (i) `POST /admin/add-fleet-entry` admin endpoint (UPDATE_SECRET auth, country-allowlist enforced, MW/status/COD fields). Operator manually adds Utilitas Wind + future findings.
- (ii) Automated AST/LV-press scraper added to `cron_daily.sh` (external repo work).

Recommend (i) for this phase; (ii) as 33.A.2.d follow-up.

### B.3 — W3: MW reconciliation

Implementation locked at Pause A. Likely shapes:
- Add `_mw_disagreement` flag to `_contradiction_flags` ladder when multiple sources disagree on MW for the same project ID.
- Surface in S4Card drawer if visible (optional — could be data-only for now).
- Pick canonical-source policy (operator approves).

### B.4 — Tests

- Status-flip test: synthetic announced entry with name matching known-operational allowlist → assert status flips on POST.
- LV add endpoint test: synthetic LV entry through `/admin/add-fleet-entry` → assert it lands in `/s4.projects` with correct fields; non-LV entry through same endpoint → rejected.
- MW disagreement test: synthetic two-source mismatch → assert flag attached.

### Local verification

- `npx tsc --noEmit`: clean
- `npm run test`: all green
- lint gates: clean
- `npm run build`: 7 routes compile

STOP for operator approval before commit/deploy.

## Pause C — Commit, push, deploy, verify (~45 min)

1. `git add` only touched files (worker + tests; potentially `~/kkme-control-center` files if upstream changes landed — those need a separate push to that repo).
2. Commit per logical change. Single PR; consider split commits per workstream for git history clarity.
3. Push `phase-33-a-2-status-refresh-and-coverage`.
4. **Origin-SHA equality check** — confirm SHA local == remote.
5. CC runs `cd /Users/Kastis/kkme && npx wrangler deploy` directly. Capture version ID.
6. **Post-deploy verification:**
   - Curl `POST /s2/fleet` with synthetic Hertz 1 entry → confirm status flips to "operational" (W1).
   - Curl `POST /admin/add-fleet-entry` with Utilitas Wind body + secret → confirm 200 + `/s4.projects` count increments + LV count increments (W2).
   - Curl `/s4` → confirm `storage_by_country` numbers shift; pipeline_mw drops; operational_mw rises; new LT/LV/EE breakdowns.
   - Curl `/revenue` → confirm IRR direction matches Pause A's quantified expectation. If wildly off (>±5pp), STOP and report.
   - Confirm 401 on `/admin/add-fleet-entry` without secret.
7. EVIDENCE.md with before/after counts + IRR shift + per-workstream proof.
8. Session 82 handover entry — include the rule-#1 6th-correction record if any prompt premise overturned at Pause A.
9. Final push + origin re-verify.

## Out of scope (explicit)

- **Phase 33.B.2** — capacity-price basis review, scheduled 2026-06-29. KV watch accumulating.
- **Phase 33.A.3** — upstream `cod` field extraction in kkme_sync.py. Separate phase.
- **Phase 33.A.2.c** (potential follow-up) — Litgrid arcgis automated scrape for status updates (if Pause A scopes only manual allowlist).
- **Phase 33.A.2.d** (potential follow-up) — automated AST/LV-press scraper (if Pause A scopes only manual add endpoint).
- **`installed_mw = 484 (as-of 2026-03-23)`** — the separate ledger feeding this number. Pause A may surface where it comes from; fix only if trivial. Otherwise file 33.A.2.e.

## NDA reminder

Reference asset stays 50 MW / 100 MWh. The operational projects discussed here are PUBLIC commercial Baltic BESS (TSO-published, press-announced). No Bitėnai / supplier references.

## Pre-flight

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-a-2-prompt.md
```
