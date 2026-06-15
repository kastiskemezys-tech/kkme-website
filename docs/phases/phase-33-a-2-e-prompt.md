# Phase 33.A.2.e — Estonia operational status-refresh allowlist

**Branch:** `phase-33-a-2-e-ee-coverage` off latest main.
**Estimate:** ~2-3h CC. Lighter scope than 33.A.2.b — Estonia's `estonia_loader.py` already pulls 21 Elering register entries (good breadth), so this is a status-refresh phase, NOT a source-coverage expansion. Same W1a/curated-inject mechanism that shipped twice (Phase 33.A.2 LT + 33.A.2.b LV).
**Risk class:** LOW-MEDIUM. Worker-only. Phase 33's calibrated CPI floor + Phase 33.A.2's STATUS_WEIGHT mechanism + Phase 33.A.2.b's tso_bess exclusion all protect the revenue engine. Live LV curated inject shipped 33.A.2.b with IRR unchanged at 21% — same path here.
**Three pause points.**

CC runs `npx wrangler deploy` directly after origin-SHA check (memory `feedback_cc_runs_deploy_after_origin_check.md`).

## Why this phase exists

Operator surfaced 2026-06-15 post-33.A.2.b ship: "Is Estonia all perfect?" — NO. Today's `/s4` cross-check: 21 EE entries (healthy source coverage via Elering), but only **Hertz 1 (Kiisa)** is operational after Phase 33.A.2 W1a. Estonia has been one of the most active Baltic BESS markets since 2023; real operational fleet is plausibly 5-10+ projects, with Auvere held at W1a Pause A due to 75 vs 26.5 MW mismatch unresolved.

Operator's 2026-06-15 sample (3 new + 1 already-shipped) with primary sources:

| # | Operator project | Location | Operator MW | `/s4` MW | Primary sources |
|---|---|---|---|---|---|
| 1 | **Hertz 1 (Kiisa)** | Kiisa | 100 MW / 200 MWh | 100 (post-W1a) | yuso.com, energy-storage.news, theasset.com — **already shipped** |
| 2 | **Hertz 2 (Aruküla)** | Aruküla | 100 MW / 200 MWh | 113.5 announced | ebrd.com (Baltic Storage Platform), evecon.ee, theasset.com |
| 3 | **Enefit Auvere** | Ida-Virumaa | 26.5 MW / 51 MWh | 75 announced | energy-storage.news (LG ES batteries, Eesti Energia) |
| 4 | **Rummu** | Harju County | 9 MW / 18 MWh | 14 announced | enery.energy (paired with 20MW PV) |

3 to add via curated allowlist (Hertz 2 / Enefit Auvere / Rummu). Hertz 2 + Auvere similar to 33.A.2 W1a pattern (announced→operational + MW correction). Rummu special: hybrid park (BESS+solar) — `/s4` 14MW likely refers to hybrid total or includes the 20MW PV; Pause A must verify what 14 actually represents before flipping.

## Discipline rules

- **#1 audit-triage** — 8th consecutive phase. Re-verify all 4 in `/s4` + verify primary sources independently (don't trust Cowork's pre-paste; pull URLs directly). The Auvere MW correction is large (75→26.5, ~3× delta) so the primary-source check matters most there.
- **#3 named-entity verification** — every operational addition needs a primary-source URL traceable to commercial registry / regulator / TSO / Baltic tier-1 press. Operator's 4 sources all qualify (yuso.com is corporate but cross-referenced; energy-storage.news is industry tier-1; enery.energy is corporate; ebrd.com is institutional). Pause A confirms each.
- **#4 cross-card consistency** — extends 33.A.2's `KNOWN_OPERATIONAL` constant + same `applyKnownOperational` + `normName` mechanism. Single canonical source-of-truth across LT+LV+EE.
- **#5 roadmap edit-conflict** — no roadmap edits from CC.
- **STATUS_WEIGHT mechanism** — flips ADD weighted supply (0.1 → 1.0 per MW); IRR moves UP (no operator gate per 33.A.2's 6th-correction precedent + 33.A.2.b's tso_bess exclusion + Phase 33's CPI floor). Quantify expected IRR delta at Pause A (likely ≤+1pp same as 33.A.2.b).

## Pause A — Verify + research + propose (~45-60 min)

### A.1 — Re-verify the 3 new + 1 already-shipped

1. **Curl `/s4`** and confirm Cowork's cross-check holds: Hertz 1 operational 100MW, Hertz 2 announced 113.5, Auvere 75, Rummu 14. Report any drift.

2. **Hertz 2 primary-source verification.** Confirm via ebrd.com Baltic Storage Platform PSD + evecon.ee + theasset.com that Hertz 2 is 100MW/200MWh AND operational (not just under construction). The Baltic Storage Platform is two sister sites — confirm Hertz 2 has actually energized vs still pre-COD.

3. **Auvere primary-source verification.** Critical because of the 3× MW delta. Confirm via energy-storage.news (LG batteries article + grid-scale 2025 commissioning article) that Auvere is 26.5MW (not 75). Likely explanation: 75 in Elering register = larger Eesti Energia industrial complex permit, 26.5 = actual installed BESS. Document the citation.

4. **Rummu primary-source verification + hybrid clarification.** Rummu in `/s4` is 14MW labeled "hübriidelektrijaam" (hybrid plant). Operator's Enery source says 9MW BESS paired with 20MW PV. Determine what the 14MW Elering field represents:
   - (a) BESS-only at a different rating
   - (b) Hybrid total (some weighted combination)
   - (c) Solar-side capacity (then 9MW BESS is separate — would need add-not-flip)
   
   This affects whether Rummu is a flip (a/b) or an add (c). If c, use 33.A.2.b's curated-inject add-path.

5. **Broader EE operational fleet research.** Operator's 4 is likely incomplete — Estonia has more operational BESS. Quick web-research for operational EE BESS NOT in the 4: candidates to probe include Enefit Green (other commissioned BESS beyond Auvere?), Sunly Estonia, KSK Energy, Roplant, Baltic Energy Partners. Each candidate needs primary-source citation before any seeding.

### A.2 — `estonia_loader.py` audit (light)

1. **What sources does it pull?** From the `/s4.projects` `source` field pattern (all `elering · ...`), looks like Elering register is the dominant source. Confirm via `~/kkme-control-center/python/loaders/estonia_loader.py`.
2. **Does it cover Elering's operational status?** Elering register lists projects through various stages (announced/permitted/under-construction/operational). Does the loader read status, or does it default everything to "announced"? This is the structural question parallel to 33.A.2's W1a finding ("no upstream loader writes operational state at all" for LT/LV).
3. **If yes (loader reads status):** the gap is Elering itself being slow to update status — curated allowlist is the right fix here too.
4. **If no (loader hardcodes announced):** flag as 33.A.2.e.1 follow-up to wire loader status-reading; curated allowlist still ships now.

### A.3 — IRR coupling quantification

Mirror 33.A.2 Pause A — compute expected sd_ratio shift if 3 EE flips applied:
- Hertz 2: +100MW × (1.0 − 0.1) = +90 weighted
- Auvere: +26.5MW × (1.0 − 0.1) = +23.85 weighted (already in feed at 75MW; flip operational; MW corrects DOWN — so weighted contribution is from new MW × 0.9, not delta × 0.9)
- Rummu: +9MW × (1.0 − 0.1) = +8.1 weighted (or add if path-c above)

Total ~ +120 weighted on baltic_weighted ≈ 1739 + recent inserts. Expected sd_ratio drift ≤ +0.1, IRR delta ≤ +1pp per Phase 33 CPI-floor binding. Confirm against live `/revenue` baseline.

### A.4 — Auvere MW correction direction sanity

Auvere drops 75→26.5 in the feed. That's the most consequential single MW change of the phase. Confirm this is direction-down (more honest, more conservative) — the inverse of W1a's Hertz1 / Vilnius / Vėjo galia which also went down. The pattern (Elering register overstates relative to actual BESS) holds.

### Pause A output

| Item | Finding | Action |
|---|---|---|
| Hertz 2 100 MW operational | … (primary-source verified) | flip + MW 113.5→100 |
| Auvere 26.5 MW operational | … (primary-source verified) | flip + MW 75→26.5 |
| Rummu 9 MW operational | … (hybrid-path resolved a/b/c) | flip OR add |
| Other operational EE found | N projects | add to allowlist or file as follow-up |
| `estonia_loader.py` status logic | reads/hardcodes | confirm 33.A.2 W1a precedent still applies |
| Expected IRR shift | +Xpp | confirm safe |

STOP for operator approval. Operator confirms:
1. Hertz 2 / Auvere / Rummu MW + status flips as proposed.
2. Rummu hybrid path classification (a/b/c).
3. Whether additional EE operational found at A.1.5 are also folded in this phase (vs filed as 33.A.2.e.1).

## Pause B — Build + local verify (~30-45 min)

Lock at Pause A approval. Mirror 33.A.2 W1a + 33.A.2.b W2-curated:

1. Extend `KNOWN_OPERATIONAL` constant (`fetch-s1.js`) with the 3 EE entries (Hertz 2, Enefit Auvere, Rummu). Primary-source URLs embedded as comments.
2. If Rummu is path-c (add not flip): use the add-semantics from 33.A.2.b's `injectCuratedFleet`.
3. Tests in `knownOperational.test.ts` (extend existing file):
   - Hertz 2 flip + MW 113.5→100 + disagreement flag
   - Auvere flip + MW 75→26.5 + disagreement flag
   - Rummu path-appropriate (flip or add) + MW correction
   - Operational-source token honors C-01 hard-reject

### Local verification

- `npx tsc --noEmit`: clean
- `npm run test`: all green
- lint gates: clean
- `npm run build`: 7 routes compile
- Simulate against live 170-entry fleet (now 174 post-LV-inject): expected EE operational 1 → 4; baltic_operational_mw 666 → ~801; sd_ratio ~ 2.10 → ~2.20; IRR unchanged ±1pp.

STOP for approval.

## Pause C — Commit, push, deploy, verify (~30 min)

1. `git add` worker + tests.
2. Commit + push `phase-33-a-2-e-ee-coverage`.
3. **Origin-SHA equality check.**
4. CC runs `cd /Users/Kastis/kkme && npx wrangler deploy`. Capture version ID.
5. **Post-deploy verification:**
   - Curl `/s4` → EE operational count 1 → 4; Hertz 2 / Auvere / Rummu show operational + corrected MW + `_mw_disagreement` flags.
   - Curl `/revenue` → IRR shift ≤+1pp matches Pause A prediction.
   - Confirm Hertz 2 / Auvere / Rummu source field carries the operational-evidence token (C-01 survival).
6. EVIDENCE.md with before/after EE counts + per-project disagreement summaries + cited URLs.
7. Session 84 handover entry — include rule-#1 8th correction if any Pause A finding overturned the prompt premise.
8. Final push + origin re-verify.

## Out of scope

- **Phase 33.B.2** — capacity-price basis review, 2026-06-29.
- **Phase 33.A.2.b.1** — AST/JRC extraction tuning.
- **Phase 33.A.2.c** — Litgrid ArcGIS auto-confirm.
- **Phase 33.A.2.d** — Display-dedup (Rēzekne/Tume now also covers Hertz 1, will need a unified pass).
- **`estonia_loader.py` status-reading wire-up** — if Pause A finds the loader hardcodes "announced", file as 33.A.2.e.1, not this phase.
- **Auvere MW root cause in Elering register** — why does Elering carry 75 instead of 26.5? Could be permit-level vs as-built distinction. Not this phase.

## NDA reminder

Reference asset stays 50 MW / 100 MWh. Public Baltic BESS only.

## Pre-flight

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-a-2-e-prompt.md
```
