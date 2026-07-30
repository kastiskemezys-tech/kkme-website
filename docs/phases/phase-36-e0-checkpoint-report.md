# Phase 36.E0 — CHECKPOINT report

**Session 95 · 2026-07-30 · branch `phase-36-e0-evidence-base` off `1275769` · commit `300938b`**
**Operator approval required on the summary table and the dataset quality verdicts before E1 begins.**

Artifacts:

| File | What it is |
|---|---|
| `docs/investigations/2026-07-30-phase-36-e0-pause-a.md` | Pause-A portal audit + the four playbook questions |
| `docs/research/mature-market-summary-table.md` | **the checkpoint artifact** — generated, rebuilds offline |
| `docs/research/mature-market-comparability.md` | which market is a valid analogue per service, and why |
| `tools/consultancy/data/mature-markets/` | the datasets, manifests, FX table and break calendar |
| `tools/consultancy/mature-markets/` | fetchers, schema, loader, `build-summary-table.mjs` |
| `tools/consultancy/__tests__/matureMarkets.test.ts` | 46 gates |

---

## 1. Per-dataset acquisition verdict — claimed vs actual

| Market | Channel | Arc doc claimed | **Actually serves** | Rows | Verdict |
|---|---|---|---|---|---|
| **DE** | regelleistung.net CRDS v2 (unauth) | FCR/aFRR/mFRR "2011→now" | **aFRR/mFRR cap 2018-07-12→, FCR cap 2019-07-01→, energy 2020-11-03→** | 934 085 | ✅ rich, but **the claim is false**: only the daily-auction era exists publicly |
| **GB** | NESO CKAN (unauth, open licence) | DC/DM/DR + legacy FFR; 2022-23 saturation "must be fully covered" | **2020-10-01 → 2026-07, complete** — but only by chaining 4 resources | 155 705 | ✅ **best dataset in the base**; FFR located, not normalised (§6) |
| **SE** | Svenska kraftnät Mimer (unauth) | Nordics via Fingrid | **FCR-N + FCR-D up/down, 2021-01 →** | 146 733 | ✅ substituted for FI; delivers the hydro-floor contrast |
| **FI** | Fingrid | "excellent API" | **401 on every path, no public key** | 0 | ⛔ gated — one-minute operator action to unblock (§7) |
| **NO** | Statnett | "take what is cleanly downloadable" | HTTP 200, **zero-byte body**, no published param schema | 0 | ⚪ dropped by decision, not oversight |
| **AU** | AEMO price+demand (unauth) | FCAS + battery-era summaries | **SA1 + NSW1 spot 2015-01 →**; FCAS is archive-only | 1 252 128 | ⚠️ contributes **E4 only**, no FCAS lifecycle |
| **DA** | ENTSO-E A44 + Elexon BMRS | not in scope | DE/SE3 via ENTSO-E, **GB via Elexon** (GB is off the ENTSO-E platform) | 640 426 | ✅ added, because the floor-vs-opportunity column needs it |
| **PICASSO/MARI** | ENTSO-E platform pages | before/after for ≥2 earlier joiners each | **accession dates: complete and primary-sourced.** Wide price panel: not acquired | — | ⚠️ partial, see §5 |
| **Calendar** | 5 TSO/ENTSO-E pages | primary-source pinning | **24 events, 5 sources, all fetched with evidence lines** | — | ✅ C7 satisfied |

Total **1.43 M rows, 72 MB** gzipped NDJSON. Every file carries a sha256 in its manifest and a
loader test asserts the file matches it.

---

## 2. The summary table — headline read

Full table in `docs/research/mature-market-summary-table.md`. Capacity rows in EUR/MW/h.

| Market | Product | Peak (month) | Floor | Peak/Floor | Saturated | **Floor ÷ arbitrage opportunity** |
|---|---|---|---|---|---|---|
| DE | FCR | 49.28 (2021-10) | 7.90 | 6.2× | 2022-11 | **0.58** |
| DE | aFRR up | 43.68 (2023-07) | 5.97 | 7.3× | **not reached** | **0.39** |
| DE | mFRR up | 24.32 (2019-06) | 1.26 | 19.3× | 2025-10 | **0.09** |
| GB | DC-low | 43.22 (2022-06) | 1.77 | **24.5×** | 2023-11 | **0.19** |
| GB | DR-low | 36.83 (2022-04) | 8.44 | 4.4× | 2023-11 | **0.91** |
| SE | FCR-D up | 123.72 (2022-06) | 4.60 | 26.9× | 2022-07 | **0.43** |
| SE | FCR-N | 127.40 (2022-06) | 19.29 | 6.6× | 2022-07 | **1.80** |

**The arc's central floor hypothesis survives contact with data, with a measured spread.**
Floors sit between 0.09 and 1.80 of the contemporaneous arbitrage opportunity. That is not
"the floor equals opportunity cost" — it is "the floor is *within an order of magnitude of*
opportunity cost, and where it sits inside that range is set by market design and by who the
marginal provider is." Sweden's hydro-set FCR-N floor at 1.80 against GB's co-optimised
DC floor at 0.19 is a nine-fold spread in the same statistic. E1-E5 get a range to calibrate
against instead of an assumption to assert.

**Fastest measured lifecycle: GB Dynamic Containment, 24.5× peak-to-floor in 3.1 years from
launch.** That is the reproduction target the arc asks for, and it is now in the data with the
launch month included.

---

## 3. Two arc premises the data contradicts

Both verified twice, independently of the pipeline that produced them.

### 3.1 "mFRR saturates last because its demand is deep" — mechanism is wrong

Within Germany — one market, one design, one currency, same months, so demand depth is the only
variable:

| DE product | Demand | Mean price, last 12 m | Floor ÷ arb | Saturated? |
|---|---|---|---|---|
| FCR | 584 MW | 16.09 | 0.58 | 2022-11 |
| aFRR up | **2 020 MW** | 15.15 | 0.39 | **not reached** |
| mFRR up | 1 052 MW | **3.34** | **0.09** | 2025-10 |

mFRR is the cheapest and most saturated German product, and it does *not* have the shallowest
demand — aFRR's demand is twice as large and aFRR is nowhere near its floor. The missing
variable is **non-battery supply depth**: a 12.5-minute full-activation time is met by gas
peakers, hydro, CHP and industrial load, none of which can meet an aFRR or FCR ramp.

**Consequence for E3.** "mFRR saturates last" must not enter the Baltic forecast as a structural
assumption. The mechanism that transfers is: *a product's floor is set by the opportunity cost of
its own deepest marginal provider, which for mFRR is very unlikely to be a battery.* The Baltic
ordering may still differ — Baltic mFRR demand (604 MW) genuinely dominates aFRR (120 MW), the
reverse of Germany — but that has to be argued from Baltic supply composition, not inherited.

### 3.2 "German FCR is the canonical collapse" — it has risen

Arc §36.E1 expects DE FCR at "~EUR 100s/MW/wk" today after a collapse from ~EUR 2 500/MW/wk in
2015, and expects Baltic FCR to hit a floor "fast, permanently".

Measured: first segment (2019-06→2020-06) **7.60 EUR/MW/h**; current segment (2020-07→2026-07)
**16.35**; last twelve months **16.09** ≈ **EUR 2 700/MW/week** — the same order as the figure the
arc cites as the 2015 *scarcity* level, and ~20× the level it cites as saturation.

Verification, twice and independently: FCR is published as EUR/MW per *product period*
throughout, confirmed against its own 2020-07-01 product-length change (six 4 h prices summing to
140.42 the day after a single 24 h product at 150.30 — consistent with per-period, off by 6× if
read as per-hour); and the 2021-10 monthly mean was recomputed by hand from committed rows,
matching the pipeline to four decimals.

**Consequence for E1.** A model that decays FCR monotonically to a low floor cannot reproduce
Germany 2021-2026. E1 must be able to produce a *rising* FCR price when demand is tight relative
to qualified supply. The arc's instruction that E1's job is to be *right* about FCR being small
cuts both ways.

### 3.3 And the one that changes E2/E3 sequencing: the Baltic accessions already happened

The arc treats Baltic PICASSO/MARI accession as future structural breaks to model
("TBD-verify"). Primary-sourced from ENTSO-E's platform pages, fetched at pin time:

| Event | Date | Source |
|---|---|---|
| **MARI** — Elering, AST, Litgrid | **2024-10-10** | ENTSO-E MARI page, "Communication note of Baltic TSOs connection to MARI" |
| **PICASSO** — Litgrid | **2025-03-05** | ENTSO-E PICASSO page, "Litgrid accession to PICASSO" |
| **PICASSO** — Elering | **2025-04-11** | "Elering accession to PICASSO" |
| **PICASSO** — AST (Latvia) | **2025-04-11** | "AST accession to PICASSO" |

**Consequence for E2/E3.** KKME's current measured Baltic reserve prices — including 36.C's
restored 299 days — are already **post-accession** for LT and EE. Applying a future PICASSO
compression on top of them would double-count the same event. E2's break design changes from
"model a future break" to "the break is partly inside the observation window; measure it."

A caution on method, since it nearly went wrong here: read through a summariser, the PICASSO list
rendered "AST accession to PICASSO, 11 April 2025" as **"Austria (AST)"**. AST is Latvia's TSO;
Austria acceded 2022-06-22 with Germany. The calendar is built from raw HTML and stores the matched
evidence line beside each date, and a test asserts the two are not conflated.

---

## 4. Dataset quality verdicts

| Dataset | Quality | Load-bearing caveats E1-E5 must carry |
|---|---|---|
| **DE capacity** | **High** | Pay-as-bid → `price` is the volume-weighted accepted price, marginal in `extra`. Unit relabelled EUR/MW → (EUR/MW)/h between 2021-12-06 and 2021-12-07 (silent 4×; normalised). FCR is per product period throughout. Rows carry `area`; AT and CZ control blocks are present, so filter or the series stops being German. |
| **DE energy (RAM)** | **Not usable as a price** | These are statistics of the **offered merit-order list**, bounded by the 15 000 EUR/MWh technical limit — not settled activation prices. Given `price_basis: offer_curve_mean` and **excluded from all lifecycle statistics**. Kept as supply-curve evidence. Unfiltered, this series produced a "peak" of 28 210 EUR/MWh and a "floor" of 3 372. |
| **GB** | **Highest in the base** | Four chained resources; the 2020-10→2021-09 scarcity era exists **only** in the bid-level file, and the price basis changes pay-as-bid → clearing at that join. Negative clearing prices are real and retained; two products have genuinely negative floors, so peak-to-floor is undefined for them. |
| **SE** | **High, after three fixes** | Three shapes of absence-as-zero, all found and nulled: whole rows before coverage (5 137), a product column of zeros before its market opened (FCR-D down, 8 760 rows), and **one missing hour published as zeros mid-series**. FCR-D up/down oscillate hard (median ÷ p10 of 4.4 and 5.0) so their saturation months are band-sensitive. |
| **AU** | **High for spread, absent for FCAS** | 30-min → 5-min settlement on 2021-10-01 mechanically widens any spread; spreads are computed on hourly-collapsed prices so it does not enter as a market change. NSW1 is a **control**, not a second observation. |
| **DA** | **High** | ENTSO-E serves DE's hourly MTU *and* quarter-hourly auction for the same instants — **different auctions, different prices** (measured 2024-06-01T22:00Z: PT60M 88.58, PT15M 90.90). Keyed on resolution; analysis uses PT60M for DE. GB is off the ENTSO-E platform (three EICs empty against a passing DE control) so GB comes from Elexon APXMIDP; N2EXMIDP publishes 0.00/0.000 and is not used. |
| **Calendar** | **High** | All 5 sources fetched, HTTP 200, sha256 recorded, evidence lines > 0, expectations met. A source that fetches but evidences nothing is `BLIND` and fails the build — the 36.D tripwire defect made unreachable. |

---

## 5. What changes in the E1-E5 specs — the point of this checkpoint

| # | Finding | Spec change |
|---|---|---|
| 1 | DE FCR has risen, not decayed (§3.2) | **E1 rewrite.** Two-regime decay-to-floor is not the right skeleton. Needs a supply-tightness term that can produce a rising price. |
| 2 | German ordering contradicts "mFRR saturates last" (§3.1) | **E3 premise removed.** Argue Baltic ordering from Baltic supply composition; carry the mechanism (deepest marginal provider), not the conclusion. |
| 3 | Baltic PICASSO/MARI already happened (§3.3) | **E2/E3 break design changes** from forecasting a break to measuring one partly inside the window. Double-counting risk is live. |
| 4 | Floors span 0.09–1.80 × arbitrage opportunity | **E1-E3 gain a calibration range** instead of an assumed floor. The endogenous-floor machinery should target a market-design-conditioned multiple, not 1.0. |
| 5 | No wide PICASSO before/after price panel | **E2's break magnitude** calibrates on DE's own bid-level series across 2022-06-22 plus AT, not a panel. State n honestly in methodology. n=2, not n=5. |
| 6 | AU FCAS not acquired | **E1-E3 cite GB and DE only** for lifecycle shape. If an FCAS lifecycle is wanted it is its own phase. |
| 7 | No settled DE activation prices | **E2/E3 activation-price calibration is unsourced.** Candidates: netztransparenz.de (has an API portal requiring registration), ENTSO-E A84 which serves AT and FI but returns empty for DE. Needs a decision before E2. |
| 8 | No installed-storage-MW series per market | **E4 cannot fit a per-GW compression coefficient** on the four spread columns alone. Acquire fleet MW per market first. |
| 9 | No scarcity phase in DE or SE primary data | Peak-to-floor for those markets is **within-window**, labelled. Only GB has its launch in the data. |
| 10 | Intraday: nothing acquired | **E5 has no evidence base.** Either scope an acquisition into E5 or reduce E5 to "keep the measured 0.0885 and state the absence". |

---

## 6. Deliberate omissions, so they read as decisions rather than gaps

- **GB FFR post-tender reports** (89 monthly XLSX) would extend GB back past DC into the FFR era.
  Located, not normalised: 89 heterogeneous spreadsheet layouts for a pre-battery-dominance market
  is disproportionate to what E1-E5 calibrate.
- **AU FCAS** — MMSDM archive only, hundreds of MB per month.
- **Norway** — see §1.
- **A wide PICASSO/MARI price panel** — accession *dates* are complete; before/after *prices* for
  AT and FI are obtainable via ENTSO-E A84 and were not pulled, because DE's own bid-level series
  across its own accession date is better evidence than a thin wide panel.
- **ENTSO-E balancing ingestion** — see §7.

---

## 7. Two things needing an operator decision

**(a) Fingrid API key.** Registering a free key at `data.fingrid.fi` and adding
`FINGRID_API_KEY` to `.env.local` unlocks FI FCR-N/FCR-D — a second hydro-floor observation
alongside Sweden's, which would turn the §2 floor-range finding from n=1 into n=2 for the
non-battery-marginal-provider case. One script, ~30 minutes. **Not blocking E1.**

**(b) 72 MB of committed data.** Breakdown: DE 27 MB, AU 24 MB, DA 11 MB, SE 5.4 MB, GB 3.3 MB.
All gzipped NDJSON at native resolution, per the arc's "no resampling in storage" rule. If that
footprint is unwanted in a website repo, the reducible part is **AU (24 MB)**: E0's table needs
only daily spreads from it, so a derived daily-spread series would cut it to well under 1 MB at
the cost of E4 losing 5-minute detail. My recommendation is **keep it** — 5-minute settlement is
precisely the mechanism E4 models — but it is your call and it is the only large item that is not
load-bearing at full resolution.

---

## 8. Playbook four questions — answered

Full text in `docs/investigations/2026-07-30-phase-36-e0-pause-a.md` §1. In brief:

**(a) Hypothesis vs verified.** The arc's §36.E0 dataset list was treated as hypotheses; three
premises turned out false (§1) and two more of its market claims are contradicted by the data
(§3). Everything asserted in this report is either computed from committed bytes or carries a
fetched primary source.

**(b) What consumes what this changes.** Nothing in the running system —
`git diff main -- workers/ app/` is empty. Downstream consumers are E1-E6, which is why dataset
quality has its own checkpoint.

**(c) What fails silently.** Three surfaces, all found by fetching and all now guarded: SvK
serves absence as zeros in three distinct shapes; regelleistung truncates at `pageSize` with no
flag; ENTSO-E returns HTTP 200 for both "no data" and "genuinely empty", so every sweep carried a
positive control in the same run.

**(d) Layer and time of verification.** The committed files, not the fetchers: checksums
recomputed, loaders parse committed bytes, `build-summary-table.mjs` regenerates with no network
access. Two figures were additionally recomputed by hand from raw committed bytes, bypassing the
loader entirely (B5): GB DCL 2022-06 (37.0639 GBP/MW/h ÷ 0.8575909 = 43.2186 EUR/MW/h, matching
the table exactly) and DE FCR 2021-10 (49.2790, matching).

---

## 9. Gates

```
1672 tests pass (+46 new)          — was 1626 at 36.D
tsc --noEmit: 29 errors            — identical to main's baseline, measured in a clean worktree
lint:no-editorial-chips            — PASS
lint:no-raw-spacing                — PASS
git diff main -- workers/ app/     — empty (no engine changes, per prompt)
build-summary-table.mjs            — no fetch() or URL in the analysis chain; rebuilds offline
manifests                          — every file's sha256 and row count asserted by test
calendar                           — 5/5 sources OK with evidence lines, 0 orphan events
```

Test changes declared: **46 tests added, none deleted, no assertion weakened.** One red test was
hit during the build (`no committed price row carries a zero that means absence`) and it was fixed
by **sharpening** the source rule — a single missing hour published as zeros — after establishing
that the (price 0, volume 0) combination never co-occurs with real data anywhere in the Swedish
dataset. The test was not relaxed.

No deploys. No worker or app changes. Nothing was pushed to `origin`.

---

## 9b. CHECKPOINT OUTCOME — operator decisions, 2026-07-30

**Evidence base APPROVED as-is** as the calibration basis for 36.E1-E6. E0 closes.

| Decision | Ruling | What it binds |
|---|---|---|
| Approval | **Approve as-is.** Four markets, 1.43 M rows, the summary table and the comparability note stand as the E1-E6 basis. | E1 proceeds with a rewritten skeleton per §3.2 (must be able to produce a *rising* FCR price). E3 drops the "mFRR saturates last" premise per §3.1 and argues Baltic ordering from Baltic supply composition. E2 treats the Baltic PICASSO/MARI breaks as partly inside the observation window per §3.3, and must not apply a future compression on top of already-post-accession measured prices. |
| Settled activation prices (§5 item 7) | **Investigate netztransparenz.de** before E2. | A half-day scoping phase, filed below as **B-036**. `netztransparenz.de` is the German TSOs' settlement portal, publishes activated-reserve data, and has an API portal (`api-portal.netztransparenz.de`) requiring free registration. ENTSO-E A84 remains the fallback: verified serving AT and FI, empty for DE. Until it resolves, E2/E3 have **no settled German activation price** and must not read the RAM offer-curve export as one. |
| Fingrid key (§7a) | **Not taken now** — approval was not made contingent on it. | FI FCR-N/FCR-D stays absent. The non-battery-marginal-provider floor finding rests on **Sweden alone (n=1)**. E1 must state that n when it cites the 1.80 ratio. Still a ~30-minute addition whenever the key exists. |
| 72 MB footprint (§7b) | **Keep AU at native 5-minute resolution.** | 5-minute settlement is the mechanism E4 models and the 2021-10-01 resolution change is a break E4 must handle explicitly. Total committed data stays at 72 MB; no dataset is reduced. |

### Filed as follow-ups

- **B-036 (P2) — no settled German reserve activation prices.** Blocks E2/E3's activation leg from
  being measured rather than assumed. Route decided: scope `netztransparenz.de` (API portal,
  registration required) with ENTSO-E `A84` + `processType=A16` as fallback — verified serving AT
  and FI, empty for DE, NL and LT. Half-day investigation, needed **before E2 starts**.
- **B-037 (P3) — Fingrid API key unregistered.** Would add a second hydro-floor observation to
  Sweden's and take the §2 floor-range finding from n=1 to n=2 for the non-battery case. One
  script once `FINGRID_API_KEY` exists in `.env.local`.
- **B-038 (P3) — ENTSO-E `A15/B95/A01` serves Lithuanian procured balancing capacity.** Corrects
  36.C's stated reason for having no ENTSO-E leg ("this API surface serves nobody"): the working
  parameter shape is recorded in the Pause-A audit §3, with NL/BE/AT/CZ/FI passing as controls in
  the same run. Answers `docs/phases/phase-36-e-entsoe-new-api-prompt.md` on its own verdict
  criteria. Belongs to 36.C's arc, not E0's; deliberately not scoped here.
- **B-039 (P3) — no installed-storage-MW series per market.** E4 cannot fit a per-GW spread
  compression coefficient without it, and must not fit one against the four spread columns in the
  comparability note alone.
- **B-040 (P3) — E5 has no evidence base.** No intraday dataset was acquired. Either scope an
  acquisition into E5 or reduce E5 to "keep the measured 0.0885 uplift and state the absence".

## 10. Next operator action

The approval gate (§9b) is closed. Remaining:

1. **Open the PR:** `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-e0-evidence-base`
2. **Roadmap delta** — operator applies Cowork-side, rule #5, CC does not commit roadmap edits:
   - mark **36.E0 shipped**;
   - amend arc §36.E1: drop the "canonical collapse / price → floor fast, permanently" premise;
     German FCR rose from 7.60 to 16.09 EUR/MW/h over the served window (§3.2). E1's skeleton needs
     a supply-tightness term, not a two-regime decay;
   - amend arc §36.E3: drop "mFRR saturates last because demand is deep" (§3.1). Keep the
     mechanism — the deepest marginal provider sets the floor — and note it is usually not a battery
     for mFRR;
   - re-date the arc's Baltic structural calendar from "TBD-verify" to the pinned dates:
     **MARI 2024-10-10** (Elering, AST, Litgrid), **PICASSO Litgrid 2025-03-05**,
     **Elering and AST 2025-04-11**, and mark them **past, partly inside the observation window**;
   - amend arc §36.E0's dataset list: regelleistung serves 2018-07-12 onward, not 2011; Fingrid is
     key-gated; AU contributes E4 spread evidence only, not an FCAS lifecycle;
   - record that E2 is **gated on B-036** (a source for settled German activation prices).
3. **Next CC job: B-036** — scope `netztransparenz.de` for settled aFRR/mFRR activation prices,
   per the §9b ruling. Half a day. Then E1.
