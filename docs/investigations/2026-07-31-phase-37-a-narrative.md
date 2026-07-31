
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
