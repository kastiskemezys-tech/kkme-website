# Phase 37.A — coverage report

**Generated:** 2026-07-31T08:55:41.695Z · **Rows:** 141 · **Public fleet compared against:** 188 entries
**Evidence pass:** RUN over 141 rows

This report contains aggregate counts and non-private fields only. No contact, comment or APVA value appears here or in any committed artifact.

## Verification tiers

| Country | rows | public-confirmed | corroborated | private-only |
|---|---|---|---|---|
| LT | 84 | 0 (0%) | 0 (0%) | 84 (100%) |
| LV | 42 | 0 (0%) | 0 (0%) | 42 (100%) |
| EE | 15 | 0 (0%) | 0 (0%) | 15 (100%) |
| **all** | **141** | **0** | **0** | **141** |

## Match engine vs the public fleet DB

| Country | rows | matched | probable | new-to-us | legal entities | descriptors |
|---|---|---|---|---|---|---|
| LT | 84 | 84 (100%) | 0 | 0 | 84 | 0 |
| LV | 42 | 0 (0%) | 1 | 41 | 36 | 6 |
| EE | 15 | 2 (13.3%) | 5 | 8 | 6 | 9 |

## Capacity basis — what does the public fleet `mw` measure?

Agreement (within 5%) of the public fleet value against each private column, by plant type:

| Plant type | matched rows | agrees with private BESS MW | agrees with private SITE total | neither |
|---|---|---|---|---|
| BESS | 45 | 40 | 2 | 3 |
| SUN and WIND E with BESS | 22 | 0 | 20 | 2 |
| SUN E with BESS | 10 | 1 | 8 | 1 |
| WIND E with BESS | 14 | 2 | 12 | 0 |
| Sun, wind with BESS | 1 | 0 | 0 | 1 |

**Hybrid rows (n=47):** private BESS component totals **1320.3 MW**; the matched public fleet entries total **4571.8 MW** — a **3.46×** difference (**+3251 MW**).

Reading: for pure-BESS projects the public value tracks the battery rating, but for hybrid sites it tracks the grid-connection/site total. If the supply trajectory treats those entries as battery capacity, hybrid storage is **overstated**, not undercounted. HYPOTHESIS pending 37.D: this rests on the private BESS column being correct (operator testimony, unverified) and covers only the matched subset.

## Parse confidence

- **high**: 133
- **low**: 5
- **medium**: 3

## Source reachability (B8 — reachability is recorded SEPARATELY from findings)

| Source | attempted | reachable | unreachable | n/a | found evidence |
|---|---|---|---|---|---|
| esinvesticijos | 84 | 84 | 0 | 0 | 0 |
| developer_site | 141 | 29 | 0 | 112 | 0 |

## Source registry — what was probed, deferred, and excluded

No silent caps: sources not probed are listed with the reason.

| Source | countries | type | status | note |
|---|---|---|---|---|
| esinvesticijos | LT | registry | **implemented** | EU-beneficiary register; server-rendered result count via ?query= |
| lursoft | LV | registry | **excluded** | CORRECTION to the Pause-A table: company.lursoft.lv/en/search?q= is NOT a query endpoint — it returns a byte-similar ~107 kB landing page for every term and never echoes the query. Control case: "Latvenergo", which certainly exists in the LV register, returns the same page as a nonsense term. The first run's 0/36 was a measurement artifact, not evidence about those companies. LV registry lookup needs the real endpoint (or data.gov.lv open data) — a build spike, not a probe |
| developer_site | LT/LV/EE | developer_site | **implemented** | org homepage reachability + project-page signal |
| ariregister_opendata | EE | registry | **deferred** | EE bulk open data is the right route but needs a download+index step — deferred to the build spike, NOT probed |
| sprk | LV | regulator | **deferred** | decisions index served (200) but per-project extraction needs a path spike |
| bis | LV | permit | **deferred** | BIS serves data — 33.A.2.b was a resolver gap not a data gap — extractor worth building in 37.B |
| registrucentras | LT | registry | **deferred** | JAR search page served; extraction needs a path spike |
| ast | LV | tso | **excluded** | Cloudflare bot-management + CAPTCHA; 403 to polite AND browser UA. Not probed, not evaded. Route: direct AST relationship |
| apva | LT | registry | **excluded** | zero discriminating power across a balanced Gavo/Negavo sample; schemes published are household-scale |

## Leak assertion

- public projection rows: **0**
- private-field leaks: **0**
- contact-shaped strings: **0**
