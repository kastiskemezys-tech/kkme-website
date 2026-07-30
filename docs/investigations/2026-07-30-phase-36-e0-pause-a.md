# Phase 36.E0 — Pause A: portal access audit + playbook four questions

**Session 95 · 2026-07-30 · branch `phase-36-e0-evidence-base` off `1275769`**

Arc: `docs/phases/phase-36-e-arc.md` §36.E0 · Prompt: `docs/phases/phase-36-e0-prompt.md`
Playbook: `docs/playbooks/failure-modes.md`. Declared exposure this phase: **A5 in industrial
quantity** (portal docs vs portal actuals), **A3** (access terms change), **C7** (fetch every
pinned URL at pin time).

Everything below was established by fetching. No claim here is relayed from a docs page.

---

## 1. The four questions

**(a) Which premises are HYPOTHESIS vs verified.**

The arc doc's §36.E0 dataset list is a hypothesis list, and three of its premises are now
**empirically false**:

| Arc-doc premise | Status | What fetching established |
|---|---|---|
| regelleistung.net "downloadable history 2011→now" | **FALSE** | The only public tender channel is the Datencenter CRDS v2 API. Its first record is **2018-07-12** for aFRR/mFRR and **2019-07-01** for FCR. Nothing before those dates is served. Counts: aFRR 2 949 · mFRR 2 947 · FCR 2 652 capacity tenders (2018-07-12 → 2026-08-05). |
| "2015 FCR ~€2 500/MW/wk → saturation ~€100s/MW/wk … measured over a decade" | **NOT SOURCEABLE** as primary data | The weekly-tender era (2011-06-27 → 2019-06-30) and the monthly era (2007-12-01 → 2011-06-26) are not in any public bulk channel I could reach. A5/A8: this figure is a literature number and E1 must not calibrate on it. |
| "Fingrid's open-data API is excellent" | **TRUE but GATED** | `data.fingrid.fi/api/*` returns `401 "missing subscription key"` on every path. No public key is embedded in the portal frontend (checked all 14 Next.js chunks for `Ocp-Apim-Subscription-Key` / `x-api-key` — zero hits). Registration is required and is an operator action, not a CC action. |
| "AT/CZ… for PICASSO — earlier joiners" | **INCOMPLETE** | Germany is itself a joiner with an exact primary-sourced date: **PICASSO 2022-06-22**, **MARI 2022-10-05** (regelleistung.net Historie-Regelreservebeschaffung). The richest before/after dataset is DE's own, because DE is the market we have bid-level data for. |
| ENTSO-E "this API surface serves nobody" (36.C's finding, quoted in `phase-36-e-entsoe-new-api-prompt.md`) | **SUPERSEDED** | See §3. `documentType=A15&businessType=B95&type_MarketAgreement.Type=A01` returns real data for AT, CZ, NL, BE, FI and **LT**. 36.C swept `A81`, which is a different dataItem. Positive controls pass in the same run. |

Verified-by-fetch premises that survived: NESO's data portal serves DC/DM/DR and FFR auction
results (CKAN, unauthenticated); AEMO's monthly aggregated price CSVs are public back to at
least 2015-06; nemweb archive is browsable.

**(b) What consumes what this phase changes.**

Nothing in the running system. This phase adds files under
`tools/consultancy/data/mature-markets/`, a loader module, a summary-table script and docs.
`git diff main -- workers/ app/` must stay empty (gate). No KV writes, no deploys, no
scenario/register changes. The *downstream* consumers are Phases 36.E1-E6, which will read
the normalised series and the summary table — which is exactly why dataset quality gets its
own checkpoint.

The one existing-file interaction: `tools/consultancy/data/sources/` already holds the 36.D
primary PDFs with a `SHA256SUMS.txt`. I follow that provenance convention rather than
inventing a second one.

**(c) What fails silently in what this phase touches.**

Three real silent-failure surfaces, all found by fetching (B8):

1. **Svenska kraftnät Mimer serves structural zeros for out-of-coverage dates.**
   `DownloadText?periodFrom=2015-01-01&periodTo=2015-01-07` returns HTTP 200 and 168 hourly
   rows in which *every price and volume column is `0`*. It is not an error and not a price of
   zero — it is absence rendered as zero. A loader that trusted it would compute an FCR-N
   floor of €0/MW/h and a peak-to-floor ratio of infinity. **Countermeasure:** the SE loader
   rejects all-zero rows as `no_coverage` and the manifest pins the measured first real month
   (**2021-01**, 121/121 rows non-zero).
2. **regelleistung tender lists truncate silently at `pageSize`.** A year-wide query returns
   exactly 2 000 rows with no `hasMore` flag and no error; the omission is invisible unless you
   count. `pageSize=5000` *does* error (`must be less than or equal to 2000`), so the cap is
   discoverable — but only by asking for too much. **Countermeasure:** all fetches are
   month-windowed and the loader asserts each window is under the cap.
3. **ENTSO-E over-limit windows fail loudly but empty windows fail quietly.**
   `The number of instances (204) exceeds the allowed maximum (100)` is an explicit 400, but
   "No matching data found" is an HTTP 200 — the same shape as a genuinely empty period.
   Absence and non-publication are indistinguishable without a positive control in the same
   run. **Countermeasure:** every ENTSO-E sweep in this phase carries a control area known to
   publish the dataItem, per the method in `phase-36-e-entsoe-new-api-prompt.md` §Method.

**(d) At which layer and time success is verified.**

- **Layer:** the committed files, not the fetch scripts. Every gate reads what is on disk:
  checksums recomputed, loaders parse committed bytes, `build-summary-table.mjs` regenerates
  the table from committed data with no network access. A summary table that only reproduces
  while online is not reproducible.
- **Time:** immediately and repeatably — this phase has no refresh cycle to wait for (B3 does
  not apply). But retrieval dates are stamped per manifest because coverage grows: a rerun in
  three months legitimately yields more rows, and the manifest is what makes that a coverage
  change rather than an unexplained diff.
- **Independent check (B5):** the summary table's decay figures are cross-checked against a
  hand-computed series for one market/product pair, and structural-break segmentation is
  asserted against the *primary-sourced* break calendar (§4), not against break dates inferred
  from the price series itself. Inferring breaks from the series and then measuring decay
  between them is circular.

---

## 2. Portal-by-portal access audit — claimed vs actual

All probes 2026-07-30. "Claimed" = what the arc doc or the portal's own framing asserts.

### 2.1 Germany — regelleistung.net · **PRIMARY, RICHEST** ✅

| | |
|---|---|
| Channel | `https://www.regelleistung.net/apps/crds/api/v2` — undocumented publicly but unauthenticated; discovered from the Datencenter SPA bundle (`/apps/datacenter/assets/index-YL9J6AKM.js`, `BASE_PATH="https://www.regelleistung.net/apps/crds/api/v2"`). The published Swagger (`/apps/cpp-publisher/…`) is behind `/uaa/login`. |
| Auth | none |
| Claimed span | 2011→now |
| **Actual span** | **aFRR/mFRR capacity 2018-07-12 → 2026-08-05 · FCR capacity 2019-07-01 → 2026-08-05 · aFRR/mFRR energy (RAM) 2020-11-03 → now · ABLA 2024-05-22 → now** |
| Granularity | capacity: one tender per product per calendar day, 12 products per tender (6 × 4 h blocks × POS/NEG). Bid-level: `capacityOffered`, `capacityAccepted`, `capacityPrice`, `controlBlock`. Energy: one tender per 15-min ISP per direction (~90-180/day). |
| Pay rule | DE capacity is **pay-as-bid** → there is no single "clearing price". Both the marginal accepted price and the volume-weighted accepted price are recorded; the second is what a provider earns. |
| Silent failure | `pageSize` cap 2000, truncates without a flag (§1c-2). |
| Gap | Pre-2018-07-12 not served anywhere public I could reach. Consequence for E1 in §5. |

Endpoints verified to return data: `/tenders`, `/tenders/{id}`, `/tenders/{id}/bid-results`,
`/aggregated-product-results`, `/demands`, `/offered-capacities`, `/capacity-shortfalls`.
`/local-marginal-prices` returns `[]` for DE capacity tenders.

**Coverage caveat that changes a series' meaning:** aFRR/mFRR capacity tenders carry
`controlBlock` values for **AT (`10XAT-APG------Z`) and CZ (`10XCZ-CEPS-GRIDE`) as well as
Germany (`10Y1001A1001A82H`)** — the ALPACA aFRR capacity-market cooperation. An unfiltered
"DE aFRR price" series silently becomes a multi-country series at the cooperation start date.
Every row is stored with its `controlBlock`.

### 2.2 Sweden — Svenska kraftnät Mimer · **NORDIC CONTRAST** ✅

| | |
|---|---|
| Channel | `https://mimer.svk.se/PrimaryRegulation/DownloadText?periodFrom=YYYY-MM-DD&periodTo=YYYY-MM-DD` (also `DownloadExcel`) |
| Auth | none |
| Format | `;`-delimited, comma decimal separator, hourly |
| Columns | `FCR-N Pris (EUR/MW)`, `FCR-D upp Pris`, `FCR-D ned Pris` + volumes per zone (SE1-SE4, DK2) |
| **Actual span** | **2021-01 → now.** 2015-2020 return 200 + all-zero rows (§1c-1) |
| Why it matters | FCR-N's marginal provider is hydro, not batteries — a different opportunity-cost floor. This is the arc's "floors are provider-technology-specific" claim, and it is now measurable rather than asserted. |

### 2.3 Finland — Fingrid · **GATED** ⛔

`data.fingrid.fi/api/*` → `401 missing subscription key`, on `/datasets`, `/datasets/{id}/data`
and `/data`. No public key in the portal frontend. **Operator action to unlock**, see §5.
Partially substituted: FI aFRR and mFRR procured capacity ARE available via ENTSO-E (§3);
FI FCR-N/FCR-D are not.

### 2.4 Norway — Statnett · **THIN** ⚠️

`driftsdata.statnett.no/restapi/` is alive and lists `Reserves/PrimaryReservesPerDay`,
`PrimaryReservesPerWeek`, `SecondaryReservesPerWeek`. All three return **HTTP 200 with a
zero-byte body** without parameters, and the parameter schema is not published on the help
page. Per the prompt's "don't fight portals for marginal additions", NO is dropped: Sweden
already supplies the hydro-floor contrast and Norway would add a fourth zone to the same story.
Recorded as a decision, not an oversight.

### 2.5 Great Britain — NESO data portal · **FULL LIFECYCLE** ✅

| | |
|---|---|
| Channel | CKAN 3 at `https://api.neso.energy/api/3/action/*` |
| Auth | none |
| Relevant packages (resource counts as fetched) | `dynamic-containment-data` (5) — "Dynamic Containment, Regulation and Moderation auction results" · `eac-auction-results` (49) — Enduring Auction Capability, the successor market · `firm-frequency-response-post-tender-reports` (89) · `static-firm-frequency-response-auction-results` (2) · `eac-br-auction-results` (4) |
| Why it matters | The 2022-23 saturation episode the arc calls "the cautionary tale advisors know best" is inside `dynamic-containment-data`, and the EAC package covers where revenue went afterwards. |

### 2.6 Australia — AEMO · **SPOT YES, FCAS COARSE** ⚠️

| | |
|---|---|
| Channel | `https://aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_YYYYMM_<REGION>.csv` |
| Auth | none |
| Verified | 2015-06 (30-min, 1 440 rows) and 2024-06 (5-min, ~8 900 rows) both 200 |
| Resolution change | **30-min → 5-min settlement from 2021-10-01** is itself a structural break in any spread statistic: 5-min settlement mechanically widens measured intraday spread. Annotated, and daily spreads are computed on a fixed 30-min resampling for cross-period comparability with the native series retained. |
| FCAS gap | Per-interval FCAS prices live only in the MMSDM archive (`nemweb.com.au/Data_Archive/Wholesale_Electricity/MMSDM/`) as ~100s-of-MB monthly SQL-loader ZIPs. Out of proportion for E0. AU therefore contributes **arbitrage-maturity evidence (E4)**, not an FCAS lifecycle. Recorded as a scope decision with its consequence in §5. |
| Currency | AUD → EUR conversion required; ECB monthly average rates, committed. |

### 2.7 ENTSO-E Transparency Platform · **CROSS-MARKET, WORKING** ✅ (corrects 36.C)

See §3 — this is the phase's largest access finding.

---

## 3. ENTSO-E: 36.C's "serves nobody" is wrong, with controls

36.C concluded the legacy REST API "serves nobody" after sweeping `A81` +
`businessType=B95` and finding NL/DE/BE/FR/AT all empty — a sweep whose positive control
failed, which 36.C correctly flagged as making the finding about the API rather than about the
Baltics.

The working shape is a **different dataItem**:

```
documentType=A15 & businessType=B95 & processType=<A51|A47|A52>
  & type_MarketAgreement.Type=A01 & Area_Domain=<EIC>
→ dataItem PROCURED_BALANCING_CAPACITY [12.3.F]
```

Sweep, single day 2026-01-05, all in one run so the controls are live:

| Area | A51 | A47 | A52 | verdict |
|---|---|---|---|---|
| AT | 503→empty | **DATA (529)** | **DATA (110)** | serves |
| CZ | **DATA (118)** | **DATA (136)** | **DATA** | serves |
| NL | **DATA (162)** | **DATA (247)** | **DATA (124)** | serves |
| BE | **DATA (461)** | **DATA (1714)** | **DATA (246)** | serves |
| FI | **DATA (750)** | **DATA (1911)** | empty | serves aFRR/mFRR |
| **LT** | **DATA (204)** | **DATA (724)** | **DATA** | **serves** |
| DE | empty | empty | empty | genuinely absent |
| SE, NO, LV, EE | empty | empty | empty | absent |

`DATA (n)` = the API refused with `instances (n) exceeds the allowed maximum (100)`, which is a
positive existence proof plus an instance count. `offset` paging works (0/100/200 return
distinct documents; 300 returns "no matching data"). Multi-document responses are
**ZIP-wrapped**, not raw XML — a loader that assumed XML would fail on exactly the windows that
have the most data.

Three consequences:

1. **The correction is real and belongs in the record.** NL/BE/AT/CZ/FI are working positive
   controls in the same run, so the absence results for DE/SE/NO/LV/EE are now evidence about
   those areas, not about the API. `phase-36-e-entsoe-new-api-prompt.md` can be closed on its
   own criteria: *"a surface serves Baltic balancing"* — `A15/B95/A01` serves LT procured
   balancing capacity. That is a follow-up for 36.C's arc, not for E0, and I have not scoped
   ingestion here.
2. **DE's absence confirms the architecture.** regelleistung is not a convenience for DE, it is
   the only source.
3. **`A84` (PRICES_OF_ACTIVATED_BALANCING_ENERGY) needs `processType=A16`,** not A51/A47
   (those 400 with "parameters do not match the dataItem"). With A16: AT and FI return data
   (~50 kB/day); DE, NL and LT return empty. So ENTSO-E gives activation prices for AT and FI
   only — and the PICASSO before/after evidence therefore comes from DE's own bid-level RAM
   data plus AT, not from a wide panel.

---

## 4. The structural-break calendars — primary-sourced, fetched at pin time (C7)

### 4.1 Germany — from regelleistung.net "Historie Regelreservebeschaffung"

Fetched 2026-07-30, `https://www.regelleistung.net/de-de/Marktinformationen/Historie-Regelreservebeschaffung`,
200, 75 810 bytes. This is a TSO-published page, not a news article (rule #3).

| Date | Product | Change | Why it breaks a decay fit |
|---|---|---|---|
| 2006-12-01 | mFRR | joint procurement, working-daily, 4 h products | pre-data |
| 2007-12-01 | FCR, aFRR | joint procurement, **monthly** auctions | pre-data |
| 2011-06-27 | FCR, aFRR | **weekly** auctions, HT/NT products | pre-data |
| **2018-07-12** | aFRR, mFRR | **calendar-daily auctions, 4 h products** | data starts here; product length and auction frequency both change |
| **2019-07-01** | FCR | working-daily D-2 auction, 1-day product | FCR data starts here; also cross-control-area collateralisation for aFRR/mFRR |
| **2020-07-01** | FCR | calendar-daily auction, 4 h product | product length change mid-series |
| **2020-11-03** | aFRR, mFRR | **RAM introduced** — capacity (RLM) and energy (RAM) procured separately | the energy series begins; the capacity series' meaning changes |
| **2022-06-22** | aFRR | **PICASSO accession.** Energy product → 15 min, marginal pricing | the arc's single biggest structural break, with an exact date |
| **2022-10-05** | mFRR | **MARI accession** | same logic for mFRR |

Prequalification history from the same page, load-bearing for "first battery entry":
**2014 — start of prequalification of storage-limited units (first grid-scale battery in FCR).**
2016 — wind admitted; PQ portal (units 150 → >10 000, providers 8 → 56). 2020 — wind for all
reserve types.

That 2014 date is a *prequalification* date from a TSO page, not a commissioned-MW series. The
summary table's "first battery entry" needs a criterion applied uniformly across markets and
computed from data where possible — see §5 open item.

### 4.2 Baltic calendar

Deferred to the acquisition step, where every URL gets fetched at pin time and its
`links_seen`/`verified_at` recorded — the 36.D tripwire defect (two of three URLs armed
unfetched) is the paid-for reason. Already held from 36.D in
`tools/consultancy/data/sources/`: the tri-TSO LFC-block FCR and FRR dimensioning forecasts
2026-2035, the Baltic balancing capacity market evaluation 2025, and Litgrid's flexibility-needs
set — checksummed. Those cover the demand side; what E0 must add is the **accession and
auction-design** side.

---

## 5. What this changes in the E1-E5 specs — raise now, not later

| # | Finding | Consequence | Proposed disposition |
|---|---|---|---|
| 1 | DE reserve auction data starts 2018-07-12 / 2019-07-01, not 2011 | **E1's "reproduce DE's FCR trajectory" validation cannot span the scarcity era.** The €2 500/MW/wk peak is a literature figure with no primary series behind it. Peak-to-floor for DE FCR can only be measured from 2019-07 onward, where the market was already mid-decay. | E1 measures DE FCR peak-to-floor **within the served window** and labels it `partial_window`; the pre-2019 peak is quotable as context with a citation but must never enter a calibration. A8 applies. |
| 2 | SE FCR-N/FCR-D data starts 2021-01 | Sweden covers battery entry → saturation but not its own scarcity era either. | Same treatment. SE's value is the **hydro floor level**, which is measurable in-window; that is what E1 actually needs from it. |
| 3 | AU FCAS per-interval prices are archive-only | **The arc's "FCAS lifecycle" evidence for AU does not get built at E0.** | AU contributes E4 spread evidence only. E1-E3 cite GB and DE for lifecycle shape. If an FCAS lifecycle is wanted later it is its own phase, not a line item. |
| 4 | Fingrid is key-gated | FI FCR-N/FCR-D absent; FI aFRR/mFRR available via ENTSO-E. | **Operator action:** register a free API key at `data.fingrid.fi` and add `FINGRID_API_KEY` to `.env.local`. Then FI is a one-script addition. Not blocking; the SE series already carries the hydro contrast. |
| 5 | DE aFRR/mFRR capacity tenders include AT and CZ control blocks | An unfiltered DE price series is silently a multi-country series. | Every row carries `controlBlock`; the summary table computes DE-only and cooperation-wide variants and reports both. |
| 6 | ENTSO-E `A15/B95/A01` serves LT procured balancing capacity | 36.C's stated reason for "no ENTSO-E leg" is wrong; `phase-36-e-entsoe-new-api-prompt.md` is answerable. | Out of E0 scope. Filed as a follow-up with the working parameter shape recorded above so nobody re-derives it. |
| 7 | PICASSO/MARI before-after panel is DE + AT, not a wide panel | E2/E3's break magnitude is calibrated on fewer joiners than the arc assumed. | E2 calibrates the PICASSO break primarily on **DE's own** bid-level RAM series across 2022-06-22 — which is better evidence than a wide thin panel, because DE is the market whose mechanics we model in detail. State the n honestly in methodology. |
| 8 | AU settlement 30-min → 5-min on 2021-10-01 | A spread series spanning it measures a rule change as a market change. | Break-annotated; comparability note carries it; E4 fits on the resampled-to-30-min series with the native series retained. |

---

## 6. Acquisition plan as executed from here

Priority order, with the storage decision per dataset (prompt §1 requires this to be decided
and documented per dataset):

| Dataset | Channel | Storage decision |
|---|---|---|
| DE FCR/aFRR/mFRR capacity, bid-level | CRDS v2 `/bid-results`, 8 548 tenders | **Reduced-then-committed, gzipped NDJSON.** Raw bid bodies total ~250 MB — not size-sane. Native resolution (4 h product block × direction × controlBlock) is preserved; only the individual anonymous bid rows are collapsed into marginal / volume-weighted / accepted-MW / offered-MW. Fetch script committed so raw is reproducible; one raw tender body committed as a fixture. |
| DE aFRR/mFRR energy (RAM) | CRDS v2, ~200 k tenders | **Sampled, documented.** Full 15-min census is out of proportion. Fixed sampling scheme committed; bias stated. |
| SE FCR-N / FCR-D | Mimer `DownloadText` | **Raw committed**, monthly files, gzipped. Small and licence-clean. |
| GB DC/DM/DR, EAC, FFR | NESO CKAN resources | **Raw committed** as served. |
| AU SA1 + NSW1 spot | AEMO monthly CSVs | **Raw committed**, gzipped. |
| ENTSO-E AT/FI/NL/BE/CZ procured capacity + AT/FI activation prices | web-api A15 / A84 | **Sampled, documented** — the 100-instance cap makes a census disproportionate. |
| Baltic + platform structural calendar | primary documents | **Raw committed** with checksums, per 36.D convention. |

Gate reminder carried into the build: no `workers/` or `app/` diff; summary table must rebuild
offline from committed bytes.
