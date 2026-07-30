# Phase 37 arc — Fleet intelligence: verification engine, lifecycle, private CRM, forecast wiring

**Owner:** Cowork-authored 2026-07-30. Operator-owned (rule #5).
**Trigger:** operator's private LV pipeline table (42 projects: SPV · developer · type · MW · location · contacts · deal comments) + directive: (1) build a source-verification tool + automated scraper on the existing infrastructure, (2) reliable lifecycle — new projects discovered, dead ones retired, (3) operator-only CRM view on kkme.eu with contacts + comments, (4) wire the verified fleet into the calculator's cannibalisation forecasts alongside the Litgrid projections.

## Privacy architecture (non-negotiable, applies to every phase)

- **The seed table and its successors are NEVER committed.** Ingestion reads from `docs/_private/fleet-intel/` (gitignored since Phase 32). Contacts + comments + deal notes = the PRIVATE OVERLAY: pushed to KV via authenticated admin endpoint, served ONLY behind operator auth, leak-tested (the calculator pattern: provably absent from every public payload, asserted at API and UI level).
- Publicly-verifiable facts (project name, SPV, MW, location, status) MAY enter the public fleet DB — only WITH public-source citations attached (rule #3). A row that only exists in the private table stays private-only until a public source corroborates it.
- Personal data (emails, names): private overlay only, KV, operator-eyes. If a contact appears in a public source (company website, press release), the citation may be stored; the private table's version stays private regardless.

## What already exists (the arc builds ON, not beside — rule #4)

Fleet DB (186 projects, VERT/Litgrid/Elering-sourced) · `KNOWN_OPERATIONAL` curated allowlist + `applyKnownOperational` · `BALTIC_COUNTRIES` gate + C-01 contradiction ladder · `POST /admin/add-fleet-entry` · VERT monthly parsers (4 files) + Litgrid/Elering loaders · lv_press RSS tripwire (Delfi/LSM, alert-not-ingest) · publications tripwires (36.D) · cert tripwire · run registry + changelog · calculator auth (CALC_SECRET token) · STATUS_WEIGHT supply model + 36.D's demand module + "Litgrid L TrSc" named scenario.

---

## 37.A — Ingestion + source-verification engine (~2-2.5 d)

1. **Private intake:** parser for the operator's workbook format (schema: SPV/org/type/max-power/place/contact/comment; unit chaos handled — "10MWh BESS / 4.4 MWp PV", "199,8", "40 MWh" → normalised `{bess_mw?, bess_mwh?, pv_mwp?, wind_mw?, raw_power_text}` with a per-row parse-confidence flag; decimal commas; hybrid decomposition). Rows keyed by stable IDs. Lives under `docs/_private/fleet-intel/`, pushed to KV `fleet_private:*` via new admin endpoint.
2. **Match engine:** each private row matched against the public fleet DB (normName from 33.A.2 + org-name + location matching; report: matched / probable / new-to-us). Expect meaningful overlap on the pure-BESS rows and near-zero on hybrids (our feeds under-count hybrids — 33.A.4's hybrid files are LT-only).
3. **Per-project evidence search — the tool.** For each project, an automated evidence pass across the source stack, producing a per-project dossier `{evidence: [{source_type, url, fetched, what_it_confirms, confidence}], verification_status}`:
   - Company registry: Lursoft/firmas.lv lookup for the SPV (exists, registered address, status) — scrape-viability verified at Pause A (A5)
   - Regulatory: SPRK decisions/licences · em.gov.lv permit lists (the stale-2020 finding from 33.A.5 re-checked) · BIS building permits (viability re-checked — 33.A.2.b found the resolver gap, this phase builds the extractor if the source is real)
   - TSO: AST queue signals (WAF workaround assessment — polite UA + the AST relationship from the sent email), Litgrid/Elering for any cross-border entities
   - Press: lv_press tripwire archive + targeted search per project/developer name
   - Developer-owned: org websites (Aretis/Enery/ib vogt/SUNLY/PurpleGreen/European Energy…) project pages — often the best public confirmation for pipeline
   - LT counterpart rows (if any in the table) route through the existing VERT machinery
   - Verification tiers: `public-confirmed` (≥1 primary/registry source) · `corroborated` (press/developer-site only) · `private-only` (no public trace — stays out of the public DB)
4. **Output:** evidence dossiers to KV (private tier includes everything; public fleet DB gains only public-confirmed facts + citations). Coverage report: X/42 confirmed, Y corroborated, Z private-only — the checkpoint artifact.

## 37.B — Lifecycle infrastructure (~2 d)

1. **Discovery (new projects in):** the existing scrapers + tripwires stay the inflow; add developer-site watchers for the orgs in the table (page-diff, alert-not-ingest per rule #3) + a monthly "unmatched entities" report from registry/permit sweeps.
2. **Decay detection (dead projects out):** per-source signals — VERT permit `valid_until` passing without generation-permit succession (monthly parser already runs; add the expiry diff) · Litgrid/Elering queue disappearance (snapshot diffs) · registry status changes (liquidation) · press signals via tripwires · staleness clock (no evidence refresh in N months → review flag).
3. **Retirement policy: soft-retire, never delete.** Status → `retired:{reason, evidence, date}`; retired rows leave supply calculations but stay in the DB (audit trail + the forecast-evolution story: "X MW of announced pipeline died in 2026" is itself market intelligence the platform can later publish).
4. **Transition log:** every status change appends evidence-carrying entries (the changelog pattern). Weekly Telegram digest: new / changed / decayed / review-flagged.
5. All lifecycle rules are data (`lifecycle-rules.json`), not scattered code — reviewable, versionable.

## 37.C — Operator-only fleet CRM on kkme.eu (~1.5-2 d)

1. Route `/fleet` (or inside the calculator's authed shell) — **fully gated, no public tier at all**: unauthenticated = 404-equivalent or the gate screen, zero fleet data.
2. The working view: filterable table (country/status/verification-tier/developer/MW) · per-project drawer: evidence dossier with links, status history, THE PRIVATE OVERLAY (contacts clickable-mailto, deal comments) · inline comment editing (writes to KV via authed endpoint) · map view from the geocoded subset.
3. Leak tests at both levels (API + rendered UI): private fields provably absent from every unauthenticated response AND from every public route's payload — the calculator's sample-tier discipline, stricter (there is NO public tier here).
4. Design: site language, information-dense (this is your working tool, not marketing — density is a feature here; the v5-mockup progressive-disclosure pattern for drawers).

## 37.D — Forecast wiring (~1-1.5 d)

1. **Supply-side enrichment:** verified fleet (incl. hybrid BESS components — a supply population our current feeds miss almost entirely) flows into the weighted-supply trajectory: verification tier maps to confidence weighting (public-confirmed full STATUS_WEIGHT · corroborated haircut · private-only EXCLUDED from published/client numbers, includable in operator-view sensitivity only — publishing supply effects from unciteable data would be indefensible under our own rules).
2. **Cannibalisation impact:** calculator + engine forecasts recompute with the enriched supply; delta quantified vs pre-enrichment AND vs the "Litgrid L TrSc" named scenario (three supply bases now: KKME-verified bottom-up · Litgrid top-down · pre-37 baseline). The comparison itself becomes a client-conversation artifact: "the TSO projects X; our verified bottom-up sees Y".
3. **Reconciliation additions:** verified-fleet totals vs Litgrid L TrSc within stated bounds per year · retired-MW accounting ties · private-only exclusion asserted in every published payload.
4. CP gate: public/client deltas quantified + signed before deploy (36.D CP-2 pattern; the supply side feeds every number).

---

## Sequencing

**37 runs BEFORE the 36.E per-service batches** (operator's E0 launch parked if not yet fired): E1-E6's price-formation models consume supply trajectories — enriching supply FIRST means the E-arc calibrates against the best fleet picture. Order: **37.A → 37.B (one batch, checkpoint after 37.A's coverage report) → 37.C → 37.D (second batch, CP before deploy) → 36.E0-E6 → 36.F last** (unchanged as the programme close).

## Standing rules
- Playbook four-questions per phase. Particular exposure: A5 (registry/permit portals — verify what they actually serve), A7 (ALL-N on writers/readers of every new KV key), B8 (lifecycle is silent-failure-rich by nature — every decay signal needs a "how would we know it broke" answer), C7 (fetch every watcher URL at pin time).
- Rule #3 everywhere: nothing enters the PUBLIC fleet DB without a citation. The private table is operator testimony — hypothesis, not source.
- Rule #4: one match engine, one lifecycle ruleset, one supply trajectory — consumed everywhere.
- Privacy architecture above overrides convenience in every trade-off.
