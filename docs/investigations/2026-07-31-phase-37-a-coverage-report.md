# Phase 37.A — coverage report

**Generated:** 2026-07-31T09:39:22.326Z · **Rows:** 141 · **Public fleet compared against:** 188 entries
**Evidence pass:** RUN over 141 rows

This report contains aggregate counts and non-private fields only. No contact, comment or APVA value appears here or in any committed artifact.

## Verification tiers

| Country | rows | public-confirmed | corroborated | private-only |
|---|---|---|---|---|
| LT | 84 | 0 (0%) | 0 (0%) | 84 (100%) |
| LV | 42 | 36 (85.7%) | 0 (0%) | 6 (14.3%) |
| EE | 15 | 0 (0%) | 0 (0%) | 15 (100%) |
| **all** | **141** | **36** | **0** | **105** |

## Match engine vs the public fleet DB

| Country | rows | matched | probable | new-to-us | legal entities | descriptors |
|---|---|---|---|---|---|---|
| LT | 84 | 84 (100%) | 0 | 0 | 84 | 0 |
| LV | 42 | 0 (0%) | 1 | 41 | 36 | 6 |
| EE | 15 | 2 (13.3%) | 5 | 8 | 6 | 9 |

## What a `public-confirmed` tier actually proves

Registry evidence confirms that **the named legal entity exists and is active** — it does NOT confirm that the project exists, is permitted, or will be built. That distinction matters for 37.D weighting.

- LV rows confirmed: **36** across **32** distinct registration codes
- rows whose SPV is shared with another row (entity-level evidence only): **5**
- rows with a 1:1 SPV (the SPV *is* the project vehicle — closest to project-level): **31**

This still does real work: it satisfies rule #3's named-entity requirement and would catch a phantom company. It is not a substitute for permit or TSO evidence.

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

Reading: for pure-BESS projects the public value tracks the battery rating, but for hybrid sites it tracks the grid-connection/site total. If the supply trajectory treats those entries as battery capacity, hybrid storage is **overstated**, not undercounted.

**The magnitudes in this section are PRIVATE-TIER and NOT PUBLISHABLE.** They rest on the operator's BESS-MW column, which is testimony with no public corroboration. They are recorded here as an operator-view sensitivity only.

**37.D must NOT apply this as a correction.** The correction runs in the flattering direction — less real BESS supply → lower sd_ratio → less cannibalisation → HIGHER IRR — which is precisely when an unciteable input must not be allowed to move a client number.

What 37.D inherits instead is the BAND in `tools/fleet-intel/data/hybrid-band.json`, every bound of which is computed from the PUBLIC fleet alone (upper = status quo; lower = publicly-identifiable hybrids contribute 0 BESS MW). Flag and band; do not correct. The named unblocker is a **public hybrid decomposition source** — battery MW stated separately from site connection capacity — with VERT's permit register and the Litgrid/Elering connection queues as the candidates. Until one lands, the band is the honest representation.

## Parse confidence

- **high**: 133
- **low**: 5
- **medium**: 3

## Source reachability (B8 — reachability is recorded SEPARATELY from findings)

| Source | attempted | reachable | unreachable | n/a | found evidence |
|---|---|---|---|---|---|
| esinvesticijos | 84 | 84 | 0 | 0 | 0 |
| developer_site | 141 | 29 | 0 | 112 | 0 |
| lv_ur_opendata | 42 | 36 | 0 | 6 | 36 |

## Source registry — what was probed, deferred, and excluded

No silent caps: sources not probed are listed with the reason.

| Source | countries | type | status | note |
|---|---|---|---|---|
| esinvesticijos | LT | registry | **implemented** | EU-beneficiary register; server-rendered result count via ?query= |
| lv_ur_opendata | LV | registry | **implemented** | Latvian Uzņēmumu reģistrs BULK OPEN DATA (data.gov.lv, CC0, daily) — register.csv 486,509 entities + register_name_history.csv 93,696 former names. Replaces the Lursoft scrape. B11 controls pass: Latvenergo/Sadales tikls/Augstsprieguma tikls all resolve active with real registration dates; nonsense terms do not resolve |
| lursoft | LV | registry | **excluded** | CORRECTION to the Pause-A table: company.lursoft.lv/en/search?q= is NOT a query endpoint — it returns a byte-similar ~107 kB landing page for every term and never echoes the query. Control case: "Latvenergo", which certainly exists in the LV register, returns the same page as a nonsense term. The first run's 0/36 was a measurement artifact, not evidence about those companies. LV registry lookup needs the real endpoint (or data.gov.lv open data) — a build spike, not a probe |
| developer_site | LT/LV/EE | developer_site | **implemented** | org homepage reachability + project-page signal |
| ariregister_opendata | EE | registry | **deferred** | EE bulk open data is the right route but needs a download+index step — deferred to the build spike, NOT probed |
| sprk | LV | regulator | **deferred** | decisions index served (200) but per-project extraction needs a path spike |
| bis | LV | permit | **deferred** | BIS serves data — 33.A.2.b was a resolver gap not a data gap — extractor worth building in 37.B |
| registrucentras | LT | registry | **deferred** | JAR search page served; extraction needs a path spike |
| ast | LV | tso | **excluded** | Cloudflare bot-management + CAPTCHA; 403 to polite AND browser UA. Not probed, not evaded. Route: direct AST relationship |
| apva | LT | registry | **excluded** | zero discriminating power across a balanced Gavo/Negavo sample; schemes published are household-scale |

## Leak assertion

- public projection rows: **36**
- private-field leaks: **0**
- contact-shaped strings: **0**

---


## APVA verdict (37.A.1) — NOT CITABLE today

**Operator input (2026-07-31):** APVA = business RES+storage grant for *juridiniai asmenys*, administered under the **Modernisation Fund** — which is **not** EU structural funds. That made the earlier 84/84 zeros on `esinvesticijos.lt` suspect for the same reason the Lursoft zeros were: possibly the wrong register rather than absent projects.

### B11 controls — run BEFORE any coverage number is reported

**esinvesticijos.lt** — probe **VALIDATED**, so its zeros are real:

| Control | Query | Result |
|---|---|---|
| known-good | `kaupimo` (storage) | **57** |
| known-good | `Ignitis` | **3** |
| known-good | `saulės elektrinė` | **221** |
| nonsense | `zzqqxx nonexistent blorp` | **0** |

The endpoint discriminates, so the 84/84 SPV zeros are genuine findings about those names in that register — not a broken probe.

**But it is probably the wrong register.** Modernisation-Fund coverage there is thin: `Modernizavimo fondas` → **1**, `Modernizavimo fondo` → **6**, against a register indexing €6.63 bn. Consistent with the operator's hypothesis that MF grants are largely not published there.

### What was checked, and what it serves

| Source | Verdict |
|---|---|
| **APVIS** (`apvis.apva.lt`) | Server-rendered, 14 current calls listed — **calls, not beneficiaries**. Statistics page carries no `gavėj`/`laimė`/`finansuot`/`sąraš` beneficiary listing. Does not serve award recipients |
| **APVA site** (`apva.lrv.lt`) | Published schemes are `Fizinių asmenų … namų ūkiuose` — household solar and household storage. The Modernisation Fund page lists storage among priority areas but **publishes no beneficiary list** |
| **esinvesticijos.lt** | Working probe, 84/84 zeros real, but thin MF coverage — likely wrong register |
| **EU State Aid Transparency (TAM)** | `webgate.ec.europa.eu/competition/transparency/public` responds, but is a client-rendered app behind a language gate with no form or documented query interface reachable inside the timebox. **Not evaluated — not a negative result** |

### Verdict

**No register serves APVA awards at citation grade from this environment today.** Per the arc's private-until-corroborated rule, `apva_flag` stays **private tier, never published, never scored**, stored opaquely with no semantic interpretation baked into the schema. No scheme was guessed.

**Named unblocker:** the **EU State Aid Transparency Award Module**. Aid above €100k must be published there by law with beneficiary name and amount, and utility-scale storage grants would clear that threshold comfortably. It is the highest-probability route to making this column citable, and it needs a query-interface spike rather than another probe. If it lands, 55 LT rows gain a citation source; if it does not, "not citable" is the settled answer.

## LV coverage after the bulk source (37.A.1)

Lursoft is **dropped and not retried**. Replaced by the **Latvian Uzņēmumu reģistrs bulk open data** (data.gov.lv, CC0, updated daily): `register.csv` 486,509 entities + `register_name_history.csv` 93,696 former names. Free bulk download, no scraping, no CAPTCHA — the same pattern as the EE route.

**B11 controls, run before the coverage number:**

| Control | Result |
|---|---|
| `Latvenergo` | resolves — reg. 40003032949, **active**, registered 1991-10-08 |
| `Sadales tīkls` | resolves — reg. 40003857687, **active**, registered 2006-09-18 |
| `Augstsprieguma tīkls` | resolves — reg. 40003033003, **active**, registered 2001-12-28 |
| `zzqqxx nonexistent blorp` | does not resolve |
| `Qwertzuiop Fake Holding` | does not resolve |

Known-good and nonsense controls return different responses. Probe validated.

**Result: LV 36/42 public-confirmed (85.7%)**, up from 0. The 6 unconfirmed are the project-descriptor rows (`BESS & PV Hybrid Livani`, `BESS Riga Tornkalns`, `IGN RES DEV2`…) which name no legal entity — reported as *not applicable*, not as failures.

**A defect this caught before 37.B could act on it:** the UR export writes whitespace-only cells — `closed` is a single space on live entities — and an untrimmed truthiness check marked **all 486,509 entities terminated**, Latvenergo included. Wired into 37.B's decay detection that would have retired the entire LV fleet on the first run. Fixed by trimming every field; terminated now reads 266,545 of 486,509, and the three control entities read active.

`register_name_history.csv` is carried specifically so 37.B can tell a **rename** from a **death**: a name absent from the current register may be either, and only the former-name file distinguishes them. The regcode survives the rename, so the live entity stays resolvable. In this run 0 of 42 LV rows matched via a former name, and 0 resolved to a terminated entity — but the path is wired and tested rather than discovered later.
