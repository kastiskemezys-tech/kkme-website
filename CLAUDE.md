# KKME — Claude Session Guide

Baltic flexibility and storage market intelligence platform. kkme.eu.
Built by Kastytis Kemezys. Solo operator.

## Start here

1. Read `docs/handover.md` — canonical state, backlog, session log.
2. Check git state: `git status && git log --oneline -5`
3. Check production: `bash scripts/diagnose.sh`
4. Confirm understanding before starting work.

## Key references

- `docs/map.md` — concept-to-file lookup ("if you want X, go here")
- `docs/glossary.md` — energy market terms
- `docs/playbooks/` — session-start, verification, pause-points
- `docs/principles/` — design governance, data classification, model risk
- `docs/principles/decisions.md` — architectural decision log (why KV not D1, etc.)

## Rules that apply to every session

- Design tokens: always `var(--token-name)`, never raw rgba().
- Worker: never cat whole file (7740 lines). Use grep.
- Card anatomy: header → hero metric → status → interpretation → viz → impact line → source footer → drawer.
- Voice: terse, precise, numbers first, one interpretation line per card.
- Verify with actual output before committing. See `docs/playbooks/verification.md`.
- End of session: update handover.md session log + backlog.

## Discipline rules

Six rules earned by past incidents. Each is load-bearing for any session that touches the relevant surface. Read them before starting work.

1. **Audit-triage rule.** Visual-inference audit claims (no screenshot, no code-level grep, no primary-source check) are hypotheses to investigate, NOT bugs to fix. Triangulate via code-grep + screenshot + git-log before scoping a fix. Origin: Phase 12.8.0 light-mode investigation (3 of 4 audit-#2 visual claims hallucinated); Phase 4G (audit-#6 cp1257 premise empirically false).

2. **No-hardcoded-temporal-label rule.** No display label asserting "where" or "when" a value comes from without computing it. "Peak h10 EET" must be derived from the hourly array, not hardcoded by the audit's reported observation. Origin: Phase 12.10 PeakForecastCard slice-idx → UTC clock-hour fix.

3. **Named-entity verification rule.** No named entity in published content (intel feed, regulatory items, hero copy) without verifiable source URL traceable to a commercial registry (`registrucentras.lt`, Lursoft, `inforegister.ee`), press release with specific path, or regulator decision URL. Origin: Phase 12.10.0 Saulėtas Pasaulis hallucinated-entity purge.

4. **Cross-card consistency rule.** Same metric in N display locations must derive from one canonical worker field. Declared in `app/lib/metricRegistry.ts`; CI test enforces (Phase 12.12 #5). Origin: Phase 12.9 SignalBar S/D RATIO mismatch (`s2.sd_ratio` deprecated path vs `s4.fleet.sd_ratio` canonical).

5. **Roadmap edit-conflict rule.** `docs/phases/_post-12-8-roadmap.md` is operator/Cowork-owned. CC may READ but only commits roadmap changes when explicitly instructed in the prompt. Default: CC reports needed changes via handover; operator applies via Cowork. Origin: Phase 12.8.0 multi-actor edit-conflict that produced messy numbering.

6. **No-editorial-state-label rule.** Cards must not surface engine-emitted state strings ("TIGHTENING", "STABLE", "RISING", "ELEVATED", "HIGH", "LOW", etc.) as chips. Locked design principle: data/math/visuals speak. If a chip is load-bearing visually, use a quantitative micro-descriptor (`"Δ −8% / 30d"` or `"+45% / P50"`) not an editorial label. CI grep gate `npm run lint:no-editorial-chips` forbids re-introduction. Origin: Phase 12.9.1 brand-discipline pass after operator live-site review framed pre-existing chips as "extremely unprofessional."

## Audit credibility taxonomy

Different audit categories have different empirical track records. Apply different triage discipline to each.

| Category | Reliability | Triage rule |
|---|---|---|
| **Visual-inference** (no screenshot, no code-grep, no primary-source check) | ~25% (3 of 4 historical claims hallucinated) | **Hypothesis to investigate, NOT bug to fix.** Code-grep + screenshot + git-log triangulation BEFORE scoping fix. |
| **Primary-source cross-check WITH citation** | ~95%+ (verified by Cowork curl + corroboration) | **Authoritative.** Ship the fix; verification mostly redundant. |
| **Primary-source cross-check WITHOUT citation** | ~80% (claim plausible but unverifiable without operator effort) | **Verify-then-ship.** Cowork curl OR confirm with operator before scoping. |
| **Inventory / catalogue** | n/a (research, not critique) | **Filter against locked principles + current code state.** Even inventory audits can carry empirically-false premises (Phase 4G's audit-#6 cp1257 claim was wrong); apply audit-triage rule at scope time. |

Cross-reference: discipline rule #1 above is the operating-discipline application of this taxonomy.

## Current phase

**Tier 0 closed 2026-05-05** (12 phases shipped). **Tier 1 in progress** — Phase 7.7g-a-1 [SHIPPED 2026-05-05] (drop dead font triplet); Phase 12.10 follow-up [SHIPPED 2026-05-05] (Gap #5 reconciliation + EE A68/fleet boundary policy); Phase 12.10b [in flight] (post-follow-up housekeeping, Cowork-direct).

**Next operator-pick across three eligible Tier 1 threads:**
- Phase 7.7g-a-2 (~1-2 days) — spacing tokens + rollout
- Phase 12.12 #1+#2 (~2-3 days) — schema validation + freshness gates
- Phase 29 (~4-6h) — KKME Baltic Storage Index (now unblocked by Gap #5 resolution)

See `docs/phases/_post-12-8-roadmap.md` "Currently active" section for the canonical next-CC-job pointer; `docs/handover.md` for session log + backlog.
