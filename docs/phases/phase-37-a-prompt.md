# Phase 37 batch-1 — 37.A ingestion + verification engine · 37.B lifecycle

**Branch:** `phase-37-batch-1` off latest main. **Semi-autonomous: ONE CHECKPOINT after 37.A's coverage report** (the verification results shape 37.B's rules and 37.D's weighting — operator sees them first). 37.B autonomous after approval.
**Estimate:** ~4-4.5 days total.
Arc doc governs: `docs/phases/phase-37-arc.md` — read it FIRST, the privacy architecture section twice. Then `docs/playbooks/failure-modes.md`; four questions answered at Pause A.

## The seed data

**PRIMARY: `docs/_private/fleet-intel/DS1-service-workbook-FULL-2026-07-30.xlsx`** — three sheets, one per country, **143 projects total** (verified by Cowork read 2026-07-30):

- **LT: 84 rows**, 10 columns — `SPV, Organizacija, Power plant type, Max power MW, MWH, Bess (MW), Vieta, APVA, Kontaktas, Komentaras`. Richer schema than LV/EE: separate MWH + BESS-MW columns AND **an APVA column populated on ALL 84 rows** — a per-project subsidy/agency reference that is itself a verification signal (map what it contains at Pause A; if it's APVA scheme/application identifiers, it's a direct public-register cross-check). 71/84 have emails. Top orgs: Enefit ×6, Evecon ×5, Lords LB ×5, Ignitis ×5, European Energy ×4, Green Genius ×4, ICOR ×4, Nordic Solar ×3.
- **LV: 42 rows**, 7 columns (as previously scoped): Aretis ×5, Enery ×5, ib vogt ×4, SUNLY ×4… · 21 SUN+BESS hybrids, 18 pure BESS · 38/42 emails.
- **EE: 15 rows**, 7 columns — includes entries our fleet already tracks (Auvere 26.5/53.1, Zirgu/Tsirguliina 100/200) → immediate match-engine test cases with known-good expected outcomes.

The xlsx supersedes the earlier LV-only CSV (`DS1-service-workbook-LV-2026-07-30.csv`, kept for provenance — the CSV had cp1257-class mojibake the xlsx does not; parse from the xlsx).

**GITIGNORED AND STAYS THAT WAY** — verify with `git check-ignore` before anything else; assert at every commit that nothing under `docs/_private/` is staged. Contacts + comments (all sheets) are the PRIVATE OVERLAY — KV via authed endpoint only; NO commit, NO public payload, NO test fixture (synthesise fake rows). Comments are Lithuanian-language deal notes across all three sheets. Power columns remain unit-chaotic per sheet ("10MWh BESS / 4.4 MWp PV", "100 MW / 200 MWh", "199,8", bare "400") — per-row parse-confidence flags as scoped.

**Scope implications of the full workbook (vs the LV-only draft of this prompt):** the match-engine and evidence-search now run across all three countries — LT rows route through the EXISTING VERT/Litgrid machinery (expect high match rates: many LT SPVs will already be in the fleet DB from Phase 33/33.A.4 — e.g. Panevezys BESS, Kaunas BESS, Baltic BESS are known names); EE rows through Elering-sourced entries; LV as originally scoped. The LT `APVA` column gets a dedicated Pause-A investigation: what the values are, whether apva.lt exposes a searchable register to verify them against, and whether it becomes a first-class evidence source. Coverage report at the checkpoint is per-country.

## Pause A (~half day) → then build 37.A

1. Four playbook questions + `git check-ignore` assertion + encoding probe.
2. **A5 sweep of the verification sources** (verify what each actually serves TODAY, from this environment): Lursoft/firmas.lv company lookup (free tier? scrape-viable?) · SPRK decisions index · em.gov.lv permit lists (the 2020-stale finding re-checked) · BIS (build the extractor ONLY if the source demonstrably serves data — 33.A.2.b found the resolver gap, not necessarily a data gap) · AST (WAF status re-check with polite UA) · developer sites for the top 6 orgs (project pages exist? structured enough to cite?). Produce the source-viability table BEFORE building the evidence engine — engine design follows viability, not hope.
3. **A7:** enumerate ALL writers/readers of every KV key you will create (`fleet_private:*`, dossier keys) — and of `s4_fleet` which 37.D will touch later; the count goes in the report.

## 37.A build (per arc §37.A)

Parser + normaliser (per-row parse-confidence; hybrid decomposition; decimal commas) → match engine vs public fleet DB (report matched/probable/new) → evidence engine over the viable sources (per-project dossiers, three verification tiers) → KV private push via new authed admin endpoint (`X-Update-Secret`; leak-test from birth: unauthenticated fetch of every fleet-adjacent route asserted free of private fields) → **the coverage report**: per-project verification tier + evidence counts + the source-viability table.

### CHECKPOINT — operator reviews the coverage report before 37.B
What lands here decides: which sources are worth lifecycle watchers (37.B), what the tier mix means for 37.D weighting, and whether any project's public/private classification surprises the operator.

## 37.B build (autonomous after approval, per arc §37.B)

Lifecycle rules as data · decay signals wired to EXISTING infrastructure (VERT expiry diff on the monthly parse · queue snapshot diffs · registry status where viable · press tripwires · staleness clock) · soft-retire with evidence, never delete · transition log + weekly Telegram digest · B8 answered in writing: for EVERY decay signal, "how would we know THIS detector broke?" (meta-monitoring: each signal's last-successful-run surfaces in /health).

## Gates
Suite green + new tests (parser fixtures with SYNTHETIC rows — real rows never in fixtures · match-engine cases · leak tests API-level · lifecycle transition properties) · `git diff` shows zero `docs/_private/` staging · worker byte-identity for all public routes (private endpoints are additive) · playbook questions answered · DECISIONS.md.

## Wrap
Origin-SHA · deploy per standing rules (additive endpoints; verify at tick) · handover: coverage report + source-viability table + lifecycle-signal inventory + the A7 counts · PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-37-batch-1`

37.C (private CRM page) + 37.D (forecast wiring, with its own CP before deploy) follow as batch-2 per the arc.
