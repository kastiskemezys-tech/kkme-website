# Phase 37.B.1 — first detector run against real data (REPORT-ONLY)

**Generated:** 2026-08-01T12:49:31.468Z · **Mode:** REPORT-ONLY — no status writes

Aggregate counts and publishable fields only. Private-tier proposals are counted here and enumerated only in the gitignored payload.

## Sources — reachability recorded separately from findings

| Source | reachable | detail |
|---|---|---|
| public_fleet | true | 188 entries, updated 2026-08-01T12:00:41.117Z |
| lv_ur_opendata | true | 486509 entities, 93696 former names, terminated share 54.8%, file 2026-07-31T09:11:06.673Z |
| vert_monthly | true | 23 permits, 1 carrying an expiry (vert_20260801.json) |
| lv_press_tripwire | true | 150 items scanned, 0 candidates (lv_press_20260801.json) |
| queue_snapshot (prior) | true | 188 rows, taken 2026-08-01T12:45:00.161Z |

Baseline snapshot written this run: `.cache/fleet-lifecycle/snapshot-2026-08-01T12-49-31-468Z.json`

## B11 controls — re-proven this run, not inherited from Pause A

A registry zero means something about Latvian companies only if the lookup can tell a real company from a nonsense string, and only if a terminated entity actually reads back terminated. Both are asserted every run; a failure suppresses the registry detectors rather than being believed.

- known-good names resolved: **3/3**
- nonsense names resolved: **0/2** (must be 0/N)
- known-terminated entities reading back as terminated: **3/3**
- verdict: **PASS**

## Detectors

`eligible` counts rows this detector could actually look at. The tier split is load-bearing: a detector whose eligible rows are all private-tier is healthy and still cannot move a published number.

| Detector | status | eligible / in scope | of which public-tier | reason |
|---|---|---|---|---|
| registry_terminated | **healthy** | 36 / 48 | 0 | every eligible row is private-tier (36) — this detector cannot produce a PUBLISHABLE transition today |
| registry_absent | **healthy** | 36 / 48 | 0 | every eligible row is private-tier (36) — this detector cannot produce a PUBLISHABLE transition today |
| vert_permit_expired | **blind** | 0 / 243 | 0 | 0 of 243 rows in scope were eligible for this signal (no VERT permit matches this holder name=224, 1 matching permit(s), none carrying an expiry date — the field this signal depends on is absent=15, 2 matching permit(s), none carrying an expiry date — the field this signal depends on is absent=4) — its zero is about the population, not the world |
| queue_disappearance | **healthy** | 182 / 281 | 182 | — |
| press_negative | **never_run** | 0 / 329 | 0 | no successful run recorded; NO SOURCE: the lv_press tripwire is reachable but scans for commissioning keywords; no cancellation/insolvency extractor exists, so this detector cannot run at all |
| evidence_stale | **healthy** | 212 / 329 | 176 | — |
| new_entity_unmatched | **healthy** | 41 candidates | n/a (report-only) | — |

## Proposal set

- public-tier (eligible for the write path): **0**
- private-tier (operator review queue only, never sent to the worker): **0**

_No public-tier proposal. That is a result, not a null run: the detector table above records what each detector was able to look at._

## Suppressed / non-healthy detectors — logged, never obeyed

- **vert_permit_expired** — blind: 0 of 243 rows in scope were eligible for this signal (no VERT permit matches this holder name=224, 1 matching permit(s), none carrying an expiry date — the field this signal depends on is absent=15, 2 matching permit(s), none carrying an expiry date — the field this signal depends on is absent=4) — its zero is about the population, not the world (243 rows in scope, not evaluated)
- **press_negative** — never_run: no successful run recorded; NO SOURCE: the lv_press tripwire is reachable but scans for commissioning keywords; no cancellation/insolvency extractor exists, so this detector cannot run at all (329 rows in scope, not evaluated)

## Discovery sweep (report-only by rule)

Scanned 412609 distinct register name keys; **41** live storage-named entities are not already tracked. Returned 41.

These are NAME MATCHES against the register, nothing more. A storage-sounding company name is not a project: none of these enters the fleet DB without the verification a real project needs (rule #3). Source for every row: the Latvian Uzņēmumu reģistrs bulk export, `regcode` as locator — <https://data.gov.lv/dati/lv/dataset/uz>.

| regcode | name | registered |
|---|---|---|
| 40103795773 | Ionn battery | 2014-06-03 |
| 40203047275 | Dzīvības apdrošināšanas risinājumi un uzkrājumi | 2017-02-01 |
| 40203258995 | The Energy Storage | 2020-09-14 |
| 40203755601 | BESS Parks Latvia, | 2026-06-18 |
| 40002061457 | BESS UN KO | 1997-02-26 |
| 40203614890 | BESS 1 | 2025-01-07 |
| 50203615281 | BESS 3 | 2025-01-07 |
| 40203547123 | Hydrogen Energy Storage Systems | 2024-03-12 |
| 40103568218 | Euro Battery Circularity | 2012-07-23 |
| 40003397558 | ASBATERIJAS | 1998-06-09 |
| 40203135991 | Battery Trade | 2018-04-09 |
| 40203614871 | BESS 5 | 2025-01-06 |
| 40203595157 | BESS Park Jelgava | 2024-10-10 |
| 40203760123 | AVER Energy Storage 3 | 2026-07-08 |
| 40203760782 | BESS 33 | 2026-07-09 |
| … | _26 further candidates in the gitignored payload_ | |
