# Phase 33.A.2.b — Latvia source coverage: automated scraper expansion + Rēzekne MW fix

**Branch:** `phase-33-a-2-b-lv-coverage` off latest main + working branch in `~/kkme-control-center` for upstream scraper additions.
**Estimate:** ~4-6h CC (heavy on external-repo scraper work + source research). Likely needs split-decision at Pause A if scope balloons.
**Risk class:** MEDIUM. Mostly external `~/kkme-control-center` repo work (new scrapers, PG fleet inserts) + small worker piece for Rēzekne ledger fix. Worker side has minimal exposure; revenue engine protected by Phase 33's capPrice bound + Phase 33.A's allowlist.
**Three pause points.**

CC runs `npx wrangler deploy` directly after the origin-SHA check on the worker side (memory `feedback_cc_runs_deploy_after_origin_check.md`). Upstream `~/kkme-control-center` push is separate.

## Why this phase exists

Phase 33.A.2 W1a shipped operational-confirmation for 4 LT BESS via curated allowlist + held LV scope to this phase. Pause A surfaced that **`latvia_loader.py` produces only 2 LV entries** (Aretis + 1 other) — Utilitas Wind (operational since Nov 2024, 10MW/20MWh) is entirely missing, and operator's correct pushback (2026-06-15): the manual `/admin/add-fleet-entry` approach defeats the whole point of the scraper pipeline. **Automated discovery is the canonical answer; manual endpoint is the safety valve.**

Companion problem: curated `storage_by_country.LV` ledger shows Rēzekne at 20 MW; actual is 60 MW per primary source. Separate ledger (same family as the frozen `installed_mw=484 LT`), folded into this phase since it's LV-side and the ship is already touching LV data.

**The honest scope question Pause A must answer:** WHY does `latvia_loader.py` produce only 2 entries? Three diagnostic paths:
- (a) Single weak source — the loader only scrapes one feed (AST register or similar) that genuinely doesn't carry recent LV BESS
- (b) Strict filtering — the loader pulls from a decent source but filters too aggressively, dropping real entries
- (c) Loader bug — source carries the data but loader parses incorrectly

Each requires a different fix shape. Don't assume.

## Discipline rules

- **#1 audit-triage** — 7th consecutive phase. Re-verify `latvia_loader.py`'s actual source coverage + filtering logic + output BEFORE proposing fixes. Operator's "AST has no scrapable register" framing from 33.A.2 Pause A may be incomplete — there are other Latvia-positive sources (LSM, LETA, LV Ministry of Economy, db.lv, energija.lv, EU/Baltic-wide BESS databases) that haven't been audited.
- **#3 named-entity verification** — every NEW LV operational entity added must carry a primary-source URL (commercial registry like `lursoft.lv`, regulator SPRK, AST official, or Baltic tier-1 press LSM/Delfi/Dienas Bizness). No snippet-only seeding. AJ Power (~9MW LV) is explicit example: snippet-only, do NOT seed without primary URL.
- **#4 cross-card consistency** — Rēzekne MW correction (20 → 60) updates the curated `storage_by_country.LV` layer; downstream consumers (S4Card "Grid Access" LV row, revenue engine if applicable) all read from the canonical source.
- **#5 roadmap edit-conflict** — no roadmap edits from CC. Cowork applies the delta post-merge.
- **Session 74 origin-verify guard** before any worker deploy.

## Pause A — Audit + source research (~90-120 min)

### A.1 — `latvia_loader.py` audit

1. **Read the full loader** at `~/kkme-control-center/python/loaders/latvia_loader.py`. Report:
   - All source URLs/feeds the loader pulls from
   - Filtering criteria (BESS-only? status filter? size filter?)
   - Output count from a manual test run today (should be 2; confirm or contradict)
   - Any recent code changes (git log) that might explain why the output is so small

2. **`ast_loader.py` parallel audit** (named in 33.A.2 Pause A but not deeply traced). Same checklist. Distinguish AST scraper from `latvia_loader.py`'s role.

3. **Diagnose path (a/b/c).** Based on the audit, classify why output is 2:
   - (a) Single weak source → propose: add 2-3 more Latvia-positive sources
   - (b) Strict filtering → propose: relax filter + add entity-verification gate
   - (c) Loader bug → propose: fix bug

### A.2 — LV source research (live web research)

1. **Latvian press tier-1** — check which of these publish operational BESS commissioning news with parseable HTML/RSS: LSM.lv, Delfi.lv, Dienas Bizness (db.lv), Latvian Press Agency LETA, energija.lv, infosphera.lv. Sample 1-2 recent operational BESS articles from each (Utilitas Wind Nov 2024 is the test case — does any of these have a parseable article on it?).

2. **AST (Augstsprieguma tīkls) — Latvian TSO** — re-audit beyond 33.A.2's "no scrapable register" finding. Look for: storage capacity statistics in quarterly/annual reports (PDF parse), grid connection registers, project announcements. Even if no public register, there may be a public PDF that's parseable monthly.

3. **SPRK (LV regulator) public announcements** — energy regulator decisions and licences sometimes mention specific BESS projects. Check for a structured public feed.

4. **EU/Baltic-wide BESS databases** — ESN was the polluter we filtered out, but other databases (Open Power System Data, ENTSO-E TYNDP datasets, EU Joint Research Centre energy datasets) may carry Baltic BESS with country=LV. Audit accessibility.

5. **Project developers' own sites** — Utilitas, Capital Mill (LV-active developer), Sun investment Group, Augstsprieguma tīkls itself for hybrid projects. Could a Capital Mill / Utilitas RSS or press page be a reliable source?

6. **`lursoft.lv` commercial registry** — operator memory has it for entity verification (rule #3). Could it also be a source for new project SPVs (newly-registered energy-storage company entities) as a discovery signal? Probably too noisy alone but useful as a verification step.

### A.3 — Rēzekne ledger correction scoping

1. **Find the `storage_by_country.LV` ledger source** — Phase 33.A.2 Pause A identified it as "frozen installed_mw family." Locate where the LV.installed_mw + LV.assets array gets written (worker side? upstream curated layer?). Trace the 20 MW Rēzekne value to its source.
2. **Primary-source citation for 60 MW** — confirm Rēzekne actual capacity via LSM / press / AST. Document the URL.
3. **Fix scope** — small edit (constant change or curated-layer field update). Could be Cowork-direct if upstream-only.

### A.4 — Manual fallback endpoint design

The `/admin/add-fleet-entry` from 33.A.2 prompt is deferred to LOWEST priority — operator surfaced this is defeat by design. It stays as a "build it only if W1+W2 can't reach reasonable coverage within this phase" option. Pause A determines whether automation alone gets us to ≥10 LV entries (reasonable Baltic baseline) or if the manual escape valve is still needed for edge cases.

### Pause A output

| Workstream | Diagnosis | Fix path | Effort | Risk |
|---|---|---|---|---|
| W1 latvia_loader audit | (a) / (b) / (c) | … | … | … |
| W2 LV source expansion | 3-5 viable new sources identified | new scrapers added | … | … |
| W3 Rēzekne ledger fix | … | … | … | … |
| W4 manual endpoint | needed yes/no based on W1+W2 coverage | … | … | … |
| Projected LV entry count | from ~2 to N (target ≥10) | — | — | — |

**Split decision:** if Pause A finds W1+W2 are >5h (likely — scraper development is slow), propose `33.A.2.b.1` (audit + 1 highest-value new source ships now) + `33.A.2.b.2` (additional sources follow). Operator picks.

STOP for operator approval. Operator confirms:
1. Source picks for W2 (which 2-3 new feeds to add)
2. Whether manual endpoint W4 is needed at all (likely no if W1+W2 reach ≥10 entries)
3. Rēzekne 60 MW citation acceptable

## Pause B — Build + local verify (~90-150 min, scope-locked)

Locked at Pause A. Likely shapes:

### B.1 — `latvia_loader.py` fix (if path b or c)
Filter relaxation OR bug fix. Run upstream against fresh source; confirm new entry count.

### B.2 — New LV scraper(s)
New file(s) at `~/kkme-control-center/python/scrapers/<source>_scraper.py` or `python/loaders/<source>_loader.py` mirroring existing patterns. Wire into `cron_daily.sh`. Each must:
- Pull from a structured feed (HTML parse / RSS / JSON / PDF)
- Apply entity-verification per rule #3 (primary-source URL required)
- Output to PG fleet table with `country='LV'` + `source='<source-name>'`
- Filter: only LV-country entries that look like BESS (size >5 MW, recent COD or operational status)

### B.3 — Rēzekne MW correction
Small constant or curated-layer edit. One-line worker change or one-line upstream curated-layer edit (depending on where the 20 MW lives).

### B.4 — Manual endpoint (ONLY if W4 confirmed needed)
`POST /admin/add-fleet-entry` with UPDATE_SECRET auth, country-filtered through `BALTIC_COUNTRIES`. Stays disabled (returns 503) if W1+W2 reach coverage.

### Tests
- New scraper: feed parser unit test against captured sample HTML/RSS
- Rēzekne MW: regression test asserting LV ledger shows 60 not 20
- Manual endpoint (if built): country-filter + auth tests

### Local verification

- `npx tsc --noEmit` (worker side): clean
- `npm run test`: all green
- lint gates: clean
- `npm run build`: 7 routes compile
- Upstream loader: `python3 latvia_loader.py` manual run → expected new entry count

STOP for operator approval before commit/deploy.

## Pause C — Commit, push, deploy, verify (~45 min)

Two repos. Worker first, upstream second.

### Worker side
1. `git add` worker changes + tests.
2. Commit + push `phase-33-a-2-b-lv-coverage`.
3. **Origin-SHA equality check.**
4. CC runs `cd /Users/Kastis/kkme && npx wrangler deploy`. Capture version ID.

### Upstream side
5. `git add` `~/kkme-control-center` changes.
6. Commit + push to that repo's main (separate flow; no PR if operator's policy there is direct-to-main, otherwise PR).
7. Wait for next VPS cron tick (or run manually) to populate PG → worker.

### Verification
8. Curl `/s4` → `storage_by_country.LV` shows 60 MW Rēzekne; LV entry count ≥ Pause A target.
9. Curl `/revenue` → IRR direction sanity (LV additions are small, expected ≤+1pp).
10. Specific assertion: Utilitas Wind (or whichever Pause A primary-source identified) appears in `/s4.projects` with `country: 'LV'`.
11. EVIDENCE.md with before/after LV counts + Rēzekne fix proof + source URLs cited.
12. Session 83 handover entry — include 7th rule-#1 correction if any Pause A premise overturned.
13. Final push + origin re-verify.

## Out of scope

- **Phase 33.B.2** — capacity-price basis review, scheduled 2026-06-29.
- **Phase 33.A.3** — upstream `cod` field extraction.
- **Phase 33.A.2.c** — Litgrid ArcGIS auto-confirm.
- **Phase 33.A.2.d** — Display-dedup pass (E energija double-render).
- **EE source coverage** — Estonia has 21 entries which is reasonable for size; if Pause A finds EE has same kind of gap, scope expansion decision via operator.

## NDA reminder

Reference asset stays 50 MW / 100 MWh. Public Baltic BESS only.

## Pre-flight

```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-33-a-2-b-prompt.md
```
