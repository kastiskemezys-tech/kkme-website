# Phase 36.D — Pause A: Litgrid flexibility-needs assessment, definitional mapping, reconciliation

**Date:** 2026-07-29 · **Branch:** `phase-36-d-litgrid-forecast` · **Status:** CP-1, awaiting operator sign-off.

Everything below is verified against primary documents. Where a figure could not be
verified, it says so and is not adopted.

---

## A.0 The KNOWN-INPUT discrepancy is resolved — and it is the phase's biggest trap

36.C's audit flagged that the pinned Litgrid source shows **"4.36 → 7.13 GW"** in its
public summary while the LinkedIn excerpt reports **"973 MW / 3.12 GW"**. There is no
conflict, no second scenario and no second document. **Both numbers are two columns of
one table** — lentelė 43, p.146, *Lanksčių priemonių poreikis į viršų – L TrSc realistinis
režimas*:

| p.146, table 43 | 2028 | 2030 | 2033 | 2035 |
|---|---|---|---|---|
| **Poreikis** (total flexible-measures requirement) | 4364 | 5398 | 5834 | **7131** |
| **Nepadengtas** (uncovered → the *additional* need) | 973 | 1044 | 869 | 1023 |

"4.36 → 7.13 GW" is the **total** flexibility requirement. "973 MW" is the **uncovered
residual** — the part not expected to be met by existing and already-planned resources.
The summary sentence on p.10 says exactly this: *"identifikuota lanksčių priemonių kiekio
augimas nuo 4.36 GW iki 7.13 GW 2035 metais"* — growth in the **quantity of flexible
measures**, not in the need for new ones.

**Why this matters more than bookkeeping.** Against KKME's LT weighted supply (1830 MW),
the two readings give:

| Reading | 2028 | 2030 | 2033 | 2035 |
|---|---|---|---|---|
| additional-need (973…1023) → S/D | 1.88 | 1.75 | 2.11 | 1.79 |
| → cpi | 0.33 | 0.34 | 0.31 | 0.34 |
| total-measures (4364…7131) → S/D | 0.42 | 0.34 | 0.31 | 0.26 |
| → cpi | **1.45** | **1.65** | **1.72** | **1.86** |

Taking the headline "4.36 → 7.13 GW" as demand would put the model in SCARCITY and
inflate the compression index roughly **5×**. It is the number a reader of the public
summary would reach for first. It must be excluded explicitly, in code and in the
methodology, not merely avoided.

---

## A.1 The primary document

| Field | Value |
|---|---|
| Landing page | `https://www.litgrid.eu/index.php/sistema/lankstumo-poreikiu-vertinimo-ataskaita/36615` |
| Report PDF | `https://www.litgrid.eu/uploads/files/dir839/dir41/dir2/13_0.php` |
| Served filename | `Lankstumo poreikių vertinimas 2026-2035.pdf` |
| Title page | **"Lankstumo poreikių ataskaita 2026"** |
| Link label | "Lietuvos elektros energetikos sistemos lankstumo poreikių ataskaita 2028–2035 m." |
| Pages | 153 · PDF authored 2026-07-23 14:18 EEST (Mantas Bieliauskas, Litgrid) |
| `Last-Modified` | 2026-07-23 11:20:52 |
| Legal basis | EMD (EU 2019/943) Art. 19e; ACER FNA methodology Decision **05/2025** |
| Prepared by | LITGRID + ESO; adopted via VERT |
| Milestones (lentelė 10, p.23-24) | report to VERT **2026-06-30** · final results to VERT **2026-07-10** · **submission to ACER 2026-07-25 (by VERT)** |
| Update cadence | **every two years** (stated p.10 area: *"bus atnaujinama kas dvejus metus"*) → next ≈ 2028 |
| Annexes | Priedas 1 (23 p., PDF) · Priedas 2 — FNA Art. 16 indicators (3 p., PDF) · Priedas 3 — flexibility barriers (XLSX) |

**Archived** to `tools/consultancy/data/sources/` with `SHA256SUMS.txt`
(`litgrid-flexibility-needs-2026-2035.pdf`, sha256 `114941b0…a670e0`, 13,209,943 B).

Provenance caveat worth recording: page 1 carries the marking **"VIDINIO NAUDOJIMO
INFORMACIJA"** (internal-use information). The document is nonetheless published by the
TSO itself on its own public page and submitted to ACER. We treat it as public — but the
marking is in the archived copy and should be mentioned if the PDF is ever redistributed
rather than cited.

**36.C's pin was correct.** Its Pause A logged the landing page but noted "no direct PDF
link is exposed in the served HTML" — true of `href` attributes with a document
extension; the links are `uploads/files/dirNNN/.../NN_0.php` endpoints that return
`application/pdf` with a `Content-Disposition` filename.

### Scenario identification (A.1.3)

The document runs **two scenarios × two modes**:

- **NacSc** — National strategy scenario (state planning documents).
- **L TrSc** — *Lėtesnės transformacijos scenarijus*, slower-transformation, built from
  market-participant surveys and the TYNDP; **this is the scenario the report draws its
  conclusions from** (p.8, p.12: *"išvados turėtų būti teikiamos šio scenarijaus
  rezultatais"*).
- **Bazinis** (base) — all technical measures available.
- **Realistinis** (realistic) — only interconnector capacity reliably available under
  balancing-market rules; **P2X excluded**.

Every figure this phase proposes to adopt is **L TrSc / realistic**, the report's own
headline case. Under **L TrSc / base** the additional need is **zero in every year**
(table 40, p.145: Nepadengtas = 0 across the board). The entire ~1 GW additional need is
created by the realistic mode's two assumptions — restricted cross-zonal capacity and no
P2X. That is a material sensitivity and belongs in the register.

### Verification of the transcribed numbers (A.1.3)

The excerpt's **demand table is transcribed correctly**, component for component. Verified
against lentelė 1 (p.10) and lentelė 48 (p.152), which are identical:

| Component | 2028 | 2030 | 2033 | 2035 | verdict |
|---|---|---|---|---|---|
| System — short-term | 429 / 982 | 484 / 1789 | 415 / 1414 | 536 / 848 | ✅ exact |
| Network — DSO | 30 / — | 42 / — | 77 / — | 108 / — | ✅ exact |
| Specific — FCR | 14 / 28 | 18 / 36 | 23 / 46 | 25 / 50 | ✅ exact |
| Specific — IZDR | 200 / 200 | 200 / 200 | 0 / 0 | 0 / 0 | ✅ exact |
| Specific — GAGAP | 154 / 154 | 154 / 154 | 354 / 354 | 354 / 354 | ✅ exact |
| Specific — LT-PL | 146 / 146 | 146 / 146 | 0 / 0 | 0 / 0 | ✅ exact |
| **Total** | **973 / 1519** | **1044 / 2325** | **869 / 1814** | **1023 / 1252** | MW ✅ · MWh see below |

MW totals reconcile exactly in all four years (429+30+514 = 973, etc.), and the specific
sub-total reconciles too (14+200+154+146 = 514; 18+200+154+146 = 518; 23+0+354+0 = 377;
25+0+354+0 = 379) against table 43's "Specifinis lankstumas" row. Independent confirmation.

**One discrepancy found, and it is the document's own.** The 2028 MWh total is printed as
**1519**; its components sum to **1510** (982 + 28 + 200 + 154 + 146). The other three
years reconcile exactly (2325, 1814, 1252). The 9 MWh error appears identically in
lentelė 1 and lentelė 48, so it is a single upstream slip, not a transcription artefact.
**Proposal:** the module stores components and *computes* the total; the reconciliation
harness asserts against the computed 1510 with an explicit `document_total_2028_mwh: 1519`
provenance note recording the divergence. We do not silently adopt either number.

### Verification of the supply-side figures — the excerpt garbles these

| Excerpt claim | Document | Verdict |
|---|---|---|
| "end-2028 **3.12 GW** in LT" | p.11 & p.150: *"2028 m. pabaigoje … bus instaliuota 3,12 GW galios kaupimo sistemų"*, basis = **vystytojų prijungimo indikacijos** (developer connection indications) | ✅ verified |
| "1.26 GW **LTsC**" | There is no "LTsC". **"L TrSc"** is the *scenario name*. 1260 MW is table 41's *"Esamos EEKĮ apimtys vertinime"* — BESS capacity **assumed present in the L TrSc scenario** | ❌ mis-transcribed |
| "+ 0.97 GW additional resources" | 973 MW is the **additional flexibility need**, not a supply tier | ❌ category error |
| "2030: 2.12 + 1.04; 2033: 2.43 + 0.87; 2035: 2.65 + 1.02" | Same pairing: scenario BESS 2115 / 2428 / 2652 MW + additional need 1044 / 869 / 1023 MW | ❌ same error, four times |
| "developer connection indications flat at **4.76 GW**" | **Not present in the document text.** Appears only in chart pav. 194 / pav. 6, which are raster images | ⚠️ **unverifiable — not adopted** (rule #3) |

The excerpt's "X + Y" pairs are *scenario-assumed supply + additional demand* summed
together. Litgrid does perform that sum, once, and states the result: **2.23 GW**
(p.11, p.150 — 1260 + 973 = 2233 MW is the BESS requirement at 2028, against 3.12 GW of
connection indications, hence "all flexibility needs will be covered"). Reading the pair
as a supply decomposition inverts what the document says.

### Litgrid's three distinct LT supply views

| View | 2028 | 2030 | 2033 | 2035 | Source |
|---|---|---|---|---|---|
| Minimum needed to cover needs (`Viso galia`) | 899 | 1163 | 1199 | 1296 | table 41, p.145 |
| **L TrSc scenario-assumed installed BESS** | 1260 | 2115 | 2428 | 2652 | table 41, p.145 |
| Developer connection indications | **3120** | — | — | — | p.11, p.150 (text) |

Only the middle row is a full year-series. The 3.12 GW is a single point.

---

## A.2 Component-by-component mapping — the four questions

Definitions below are **from the document**, sections 5.4.1–5.4.4 and 7.1–7.4.

### IZDR — *Izoliuoto darbo rezervo paslauga* (isolated-operation reserve)

- **What it is** (§5.4.3, §7.3, p.126): reserve guaranteeing the LT system can run safely
  in islanded mode after loss of the single LitPol Link tie. BESS-only by physics
  (*"gali būti užtikrinami tik elektros energijos kaupimo įrenginių pagalba"*).
- **Who may provide it:** *the designated storage operator only.* Synchronisation Act
  Art. 6(1)(4) and **EEĮ Art. 48(1)(3)** — quoted verbatim in the report — reserve this
  service to **UAB "Energy cells"** (200 MW / 200 MWh) and **expressly bar every other
  market participant**: *"Kiti rinkos dalyviai šios paslaugos teikti negali."*
- **Trajectory:** 200 → 200 → 0 → 0. The obligation is transitional, tied to the
  synchronisation-project period, and its necessity is re-decided once Harmony Link is in
  service (table 20 footnote, p.127).
- **Can BESS serve it?** Yes physically. **Does KKME earn from it?** No. **Where does it go?**

  → **`supply-absorption`, 200 / 200 / 0 / 0 MW — and it exposes a live over-count.**

  The obvious answer was `excluded`, on the reasoning that Energy Cells is a TSO asset and
  KKME already drops those (`NON_COMMERCIAL_TYPES = {pumped_hydro, tso_bess}`,
  `app/lib/sdRatio.ts:38`). **That reasoning is wrong, and checking it found a defect.**
  Energy Cells' fleet is in the live payload as four Litgrid Layer-3 entries —
  *Kaupikliai Vilnius / Alytus / Šiauliai / Utena*, **50 MW each, 200 MW total**, matching
  the report's *"200 MW galios ir 200 MWh talpos"* exactly — every one of them
  `status: operational`, **`type: null`**. They are not excluded by anything. They sit in
  `baltic_weighted_mw` at **weight 1.0**, as merchant supply, while being legally barred
  from selling into any market KKME models.

  The only `tso_bess`-tagged entries in the whole fleet are AST's Latvian units (Rēzekne
  60 MW, Tume 20 MW). The exclusion mechanism exists and is simply not applied to the one
  LT asset that most needs it.

  **And the treatment must be year-indexed, which is the whole argument for this phase.**
  IZDR's 200 → 0 means the legal reservation *lapses*: from 2033 Energy Cells' 200 MW is
  released into the market. Tagging those four entries `tso_bess` permanently would be
  wrong in the opposite direction after 2033. `treatment_reason`: *legally reserved to
  the designated storage operator (EEĮ 48(1)(3)) through 2030; released to the market
  when the transitional obligation lapses.*

### GAGAP — *Greito aktyviosios galios atsako paslauga* (fast active-power response)

- **What it is** (§7.3, p.127): the remainder of the same fast-response requirement that
  IZDR does not cover. **Technically identical requirements to IZDR.** Procured as a
  non-frequency ancillary service under VERT resolution **O3-731 of 2026-06-15**
  (*Prekybos su dažnio reguliavimu nesusijusiomis papildomomis paslaugomis tvarkos
  aprašas*) — i.e. **open to market participants**, unlike IZDR.
- **Trajectory:** 154 → 154 → 354 → 354.
- **The structural fact the excerpt hides:** IZDR + GAGAP is **constant at 354 MW in
  every year** (table 20, p.127: *"Visiems analizuotiems laikotarpiams nustatyta vienoda
  jų apimtis – 354 MW"*). The total fast-response requirement never changes. What changes
  at 2033 is the **split**: Energy Cells' legally-reserved 200 MW expires and the entire
  354 MW becomes market-procured.
- **Can BESS serve it?** Yes — only BESS can. **Does KKME earn from it?** No product line.
- → **`supply-absorption`**, 154 / 154 / 354 / 354 MW of LT merchant BESS contracted away
  from the aFRR/mFRR pool.

  **The 2033 step is the prompt's A.2 question 4, and the answer is that the two effects
  cancel.** The prompt anticipated "IZDR 200→0 means its absorption effect EXPIRES —
  competing supply comes back to the pool exactly when the fleet is largest", and expected
  that to compound. It does come back — Energy Cells' 200 MW is released — but the *same*
  event raises market-procured GAGAP by **exactly +200 MW**, because IZDR + GAGAP is
  constant at 354 MW in every year. Merchant supply **+200**, absorption **+200**, net
  effect on the effective merchant pool **zero**. Only the ownership of the obligation
  changes, not its size.

  That cancellation is a genuinely non-obvious result, and it is only visible if the
  module stores IZDR and GAGAP as **separate components with their own series** rather
  than one netted "fast response" row. It is the strongest argument for the per-component
  structure — and, per rule #2, it must fall out of the arithmetic rather than being
  written into the methodology as a sentence.

### LT-PL — *Lietuvos-Lenkijos pralaidumo didinimo paslauga*

- **What it is** (§5.4.4, §7.4): until the 220 kV Harmony Link circuit exists, the LT-PL
  cross-section is limited to a 500 MW potential. Flexible measures fast enough to
  stabilise frequency can unlock the rest. Explicit formula, p.36:
  **PDPP = PP − IZDR − GAGAP** = 500 − 200 − 154 = **146 MW**.
- **Trajectory:** 146 → 146 → 0 → 0. The zeroing is **derivable, not asserted**: the
  service exists only *"iki naujos 220 kV dvigrandės linijos … atsiradimo"* — until
  Harmony Link. At 2033 the constraint is gone, so PP = 0 and PDPP = 0. (Note the formula
  alone would give 500 − 0 − 354 = 146; it is the Harmony Link precondition, not the
  arithmetic, that sets the zero. The module records the precondition as the
  `treatment_reason`, per rule #2 — no hand-spread zeros.)
- **Can BESS serve it?** Yes — same fast-response technology. **KKME product?** No.
- → **`supply-absorption`**, 146 / 146 / 0 / 0 MW.

### FCR — *Dažnio išlaikymo rezervai*

- LT share of the Continental-Europe FCR obligation, allocated by generation and
  consumption share (§5.4.1, §7.1). 14 / 18 / 23 / 25 MW.
- **KKME models FCR.** → **`addressable-demand`**.
- **Independently cross-validated.** The tri-TSO *Baltic LFC block FCR dimensioning
  forecast 2026-2035* carries a per-country series whose **LT** row is
  12, 13, **14**, 16, **18**, 19, 21, **23**, 24, **25** for 2026-2035 — matching the FNA's
  2028 / 2030 / 2033 / 2035 values **exactly**. Two independent documents agree.

### System needs — short-term

- The **uncovered** portion of short-term flexibility: real-time deviations from plan
  caused by RES and load forecast error, plus unforecast outages (§5.4.2, §8.2). To be
  met by limited-energy resources (BESS ≤ 4 h); a separate long-duration need of
  22–256 MW is assigned to existing flexible gas plant (lentelė 46, p.151-152).
- 429 / 484 / 415 / 536 MW; **MWh: 982 / 1789 / 1414 / 848** — the duration dimension the
  2h-vs-4h strategy cares about. Implied duration: 2.29 h / 3.70 h / 3.41 h / 1.58 h.
  Non-monotonic; do not read a trend into it.
- **BESS-servable?** Yes, explicitly. **KKME product?** **No — and this is the load-bearing
  judgement.** These MW are *uncovered*: they are not procured through aFRR, mFRR or FCR
  today. Litgrid states it will publish a **Lithuanian flexibility-market development
  plan by end-Q4 2026** to define how they *will* be procured. Until that plan exists,
  treating them as addressable demand would credit KKME's revenue model with a market
  that has no rules, no product and no price.
- → **`excluded`**, with the reason recorded as *"no procurement mechanism defined;
  revisit on publication of Litgrid's flexibility-market development plan (due Q4 2026)"*.
  Not absorption either — absorption requires a contract that takes MW off the merchant
  pool, and there is nothing to contract into yet. This is the conservative choice in the
  direction that matters: it neither flatters the ratio nor pretends competitors are
  already committed elsewhere.

### Network needs — DSO

- ESO distribution-network upward needs, driven by EV charging (162 → 438 MW of network
  load) and heat pumps (120 → 205 MW), concentrated **17:00–20:00** (p.124, p.151).
  Aggregated at 200 × 110 kV substation nodes; the figure is the **sum of per-node annual
  maxima** (Annex 2), so it is not a coincident system requirement.
- 30 / 42 / 77 / 108 MW. Procured by the DSO, through the **central public-procurement
  portal** (§9.2, p.150) — manual procedures, no platform. Not a market KKME's products
  participate in.
- → **`excluded`**, reason *"DSO-procured via public tender; node-summed maxima, not a
  coincident system requirement; no KKME product"*.

### Summary — the decision table for operator approval

| Component | BESS-servable | KKME product | **Proposed treatment** | 2028 | 2030 | 2033 | 2035 |
|---|---|---|---|---|---|---|---|
| FCR | yes | **yes** | `addressable-demand` | 14 | 18 | 23 | 25 |
| GAGAP | yes (only BESS) | no | `supply-absorption` | 154 | 154 | 354 | 354 |
| LT-PL | yes | no | `supply-absorption` | 146 | 146 | 0 | 0 |
| IZDR | yes, but legally barred | no | `supply-absorption` (asset is **not** currently excluded — see above) | 200 | 200 | 0 | 0 |
| System — short-term | yes | no market yet | `excluded` (revisit Q4 2026) | 429 | 484 | 415 | 536 |
| Network — DSO | yes | no | `excluded` | 30 | 42 | 77 | 108 |
| **Derived: addressable_mw** | | | | **14** | **18** | **23** | **25** |
| **Derived: absorption_mw** | | | | **500** | **500** | **354** | **354** |

Absorption falls 500 → 354 at 2033 because LT-PL ends with Harmony Link (−146) while the
IZDR→GAGAP transfer nets to zero.

**Read the addressable row honestly.** LT FCR alone is 14–25 MW. It is *not* a demand
figure that can replace `eff_demand`, because the FNA's additional-needs table by
construction excludes everything already covered — aFRR and mFRR appear in the report
only as detail (§7.2), never as additive demand. **The FNA is the wrong instrument for
sizing procurement demand.** It sizes the *gap*. This is the finding that drives A.3.

---

## A.3 Scope: LT vs Baltic — and a better source than either

### The `/s2` 752 has complete provenance. It was there all along.

The tri-TSO **Baltic LFC block dimensioning forecasts** — authored jointly by *Elering AS,
AS Augstsprieguma tīkls and LITGRID AB* — are published on litgrid.eu and give the
common-Baltic procurement target year by year, 2026-2035:

| Document | URL | Filename | Dated |
|---|---|---|---|
| Baltic LFC block **FRR** dimensioning forecast 2026-2035 | `.../baltijos-lfc-bloko-frr-apimciu-prognoze-2026-2035/32612` → `uploads/files/dir795/dir39/dir1/6_0.php` | `FRR_dimensioning_forecast_2026-2035_ACEol (1) 2.pdf` | 2025-07-29 |
| Baltic LFC block **FCR** dimensioning forecast 2026-2035 | `.../baltijos-lfc-bloko-fcr-apimciu-prognoze-2026-2035/36384` → `uploads/files/dir809/dir40/dir2/17_0.php` | `FCR_dimensioning_forecast_2026-2035_final_v1.docx` | 2025-12-05 |
| Baltic balancing-capacity-market evaluation report 2025 | `.../baltijos-balansavimo-pajegumu-rinkos-vertinimo-ataskaita/36367` | `BBCM Evaluation report 2025.pdf` | 2025-11-26 |

From these:

- **mFRR upward**, Baltic block, max over the six 4-hour cycles (table 2):
  604 · 624 · 644 · 664 · 684 · 714 · 714 · 724 · 744 · **754** (2026→2035).
- **aFRR upward**, Baltic block, by 4-hour cycle — **flat across the whole horizon**,
  differentiated only by time of day: 00-04 101 · 04-08 105 · 08-12 105 · 12-16 111 ·
  **16-20 120** · 20-24 96 MW. (Recovered from the figure image; the conclusions text
  confirms the 120 MW maximum.)
- **FCR**, Baltic block: 28 · 29 · 31 · 33 · 36 · 38 · 41 · 44 · 46 · **48** MW
  (2026→2035), split EE / LV / LT. (Recovered exactly from the chart's embedded series.)

**`/s2`'s `PRODUCT_DEMAND = {fcr: 28, afrr: 120, mfrr: 604}` = the 2026 row of these two
documents.** 604 + 120 + 28 = **752**. The "752" that the prompt describes as
"undocumented" is in fact fully sourced — the source simply was never written down. Its
comment `mfrr_up: 604, // source: Baltic mFRR demand` (`workers/fetch-s1.js:1110`) is
correct and now has a citable document behind it.

Two vintage defects fall out:

1. **It is frozen at 2026.** The same documents give the trajectory to 2035. The engine
   applies a synthetic 2 %/yr growth instead (`projectDemand`) when the real series is
   published.
2. **`afrr: 120` is the peak-cycle value, not the 2026 value.** aFRR is flat in time and
   varies only by cycle; 120 MW is the 16-20 peak, against a daily mean of 106.3 MW.
   Using the peak in a per-product denominator inflates demand and therefore *flatters*
   the per-product S/D. Small, but it is a real bias and it should be a documented choice
   rather than an accident.

### The three options, quantified

**Option (a) — three-TSO composite with per-country provenance.** Not available in this
pass. The FNA is EU-mandated for every Member State (EMD Art. 19e) with the same **July
2026** deadline Litgrid met on 2026-07-25, so Latvian and Estonian assessments exist or
are imminent. We could not pin either: `ast.lv` and `elering.ee` return **HTTP 403** to
every fetcher available here, and nothing is indexed. **Not adopted** (rule #3 — no URL,
no adoption). Routed as a follow-up phase.

**Option (b) — LT-anchored with a documented scaling factor.** Recommend **against**, on
two independent grounds:

- *The FNA is the wrong instrument.* Its additional-needs table sizes the uncovered gap,
  not procurement. The only KKME-addressable row in it is FCR at 14–25 MW.
- *Its own LT aFRR/mFRR figures do not reconcile with the Baltic block.* §7.2 gives LT
  mFRR upward **633 MW flat**, mFRR downward 632 → 773 MW, aFRR **67 up / 68 down flat**.
  Against the Baltic block that implies LT is **98 %** of the block for mFRR-up
  (633 / 644 at 2028) but **56 %** for aFRR-up (67 / 120) — mutually inconsistent as
  country shares. The FRR document explains why the comparison is ill-posed: after
  synchronisation, *"FRR capacities can be located in any Baltic LFC area"* — the block
  requirement is not a sum of national requirements. **Do not derive an LT share from
  these two documents.** This is a discrepancy to report, not to resolve by arithmetic.

**Option (c) — Baltic-auction-derived. Recommended.** Single joint tri-TSO source, matches
the scope of `eff_demand` (Baltic) and of the supply numerator (Baltic fleet), matches
the market KKME's products actually clear in (common Baltic balancing-capacity market),
is year-indexed 2026-2035, and is already the unwritten provenance of the 752 — so
adopting it makes the register honest rather than changing the basis.

**Series (mFRR_up peak cycle + aFRR_up peak cycle + FCR):**

| 2026 | 2027 | 2028 | 2029 | 2030 | 2031 | 2032 | 2033 | 2034 | 2035 |
|---|---|---|---|---|---|---|---|---|---|
| **752** | 773 | 795 | 817 | 840 | 872 | 875 | 888 | 910 | **922** |

CAGR 2026→2035 = **2.29 %/yr**, against the engine's assumed 2.00 %/yr. The engine's
*growth rate* was a good guess. Its *level* was not.

---

## A.3b The 935 — archaeology, and a live defect

**Where it came from.** `git log -S` puts its birth in **`fb088c4`, 2026-03-05**,
*"feat: S/D ratio fleet tracker — worker routes + S2Card section"* — the commit that
created `processFleet`. It was introduced as a bare literal, `const eff_demand =
demand?.eff_demand_mw || 935`, with no comment, no derivation and nothing in the commit
message. There is no document, no calculation and no note anywhere in the repository that
produces 935. **It has no provenance because it never had one.** One honest paragraph, as
asked; there is nothing more to find.

**How it is still live — and why this is a rule #4 defect independent of the Litgrid work.**
The same file now carries **two different hardcoded demand defaults**, and which one
governs depends on which writer ran last:

| Site | Line | Default |
|---|---|---|
| `processFleet()` — computes `sd_ratio` | `workers/fetch-s1.js:419` | **752** |
| `POST /s2/fleet` — stamps `fleet.demand` | `workers/fetch-s1.js:8230` | **935** |
| `POST /s2/fleet/entry` — read-back | `workers/fetch-s1.js:8249, 8299` | **935** |
| `syncLitgridFleet()` — read-back | `workers/fetch-s1.js:4775` | **935** |
| `projectDemand()` — engine base | `workers/fetch-s1.js:2974` | **752** |
| `/s2` payload | `workers/fetch-s1.js:8526` | **752** |

`kkme_sync.py` POSTs `{"entries": [...]}` with **no `demand` key** (verified in
`~/kkme-control-center/sync/kkme_sync.py:234`). So on the daily full replace,
`processFleet` computes with **752** while the handler writes `fleet.demand = 935` into
KV as a cosmetic field. Then the **4-hourly cron** calls `syncLitgridFleet`, which reads
that stored 935 back and **passes it into `processFleet`** — laundering the cosmetic
default into the arithmetic. From that tick on, 935 governs.

The published S/D therefore oscillates with cron order:

- 2385 / **752** = **3.17×**
- 2385 / **935** = **2.55×**

Both values have been served historically — `docs/handover.md:1491` and `:3910` record the
752 basis; production right now (`updated_at` 2026-07-29T08:00:48Z) serves
`eff_demand_mw: 935`, `sd_ratio: 2.55`. Same metric, two canonical fields, one of them
written by a path that never intended to be authoritative. **The canonical module fixes
this by construction: one source, no defaults at any call site.**

---

## A.4 Supply-side reconciliation

### A.4.1 Tier mapping — not derivable from the primary document

The prompt's hypothesis (*LTsC ≈ operational + under-construction + grid-agreement;
"additional" ≈ permitted; intent protocols ≈ announced*) **cannot be executed**, for two
independent reasons:

1. **"LTsC" is not a supply tier.** It is a mis-reading of **L TrSc**, the scenario name.
   There is no ladder to map.
2. **The document defines no membership criteria.** It names three supply concepts —
   *vystytojų prijungimo indikacijos* (developer connection indications, glossed only as
   "the most current information on developer activity in executing BESS construction
   works"), *ketinimų protokolai* (signed protocols of intent), and the ERAA/TYNDP
   scenario inputs — without stating what qualifies a project for any of them. A.1.5 asked
   for definitions before asserting a mapping; the definitions are not there.

And there is nothing to map onto on our side. KKME's **LT fleet has no intermediate
tiers at all**:

| Country | operational | under_constr. | conn._agreement | application | announced | weighted |
|---|---|---|---|---|---|---|
| **LT** | 547.0 (n=11) | 0 | 0 | 0 | 12 826.1 (n=148) | **1830** |
| EE | 135.5 (n=3) | 200.0 (n=2) | 0 | 0 | 2 193.8 (n=18) | 535 |
| LV | 19.0 (n=2) | 0 | 0 | 0 | 19.0 (n=2) | 21 |

148 of 159 LT entries are `announced` at weight 0.1 — an artefact of the Litgrid Layer-3
scraper that 36.C found parses a permanently empty page. **A tier mapping is meaningless
until the LT fleet has tiers.** Recommend routing this to a supply-side phase rather than
forcing it here.

### A.4.2 Trajectory comparison, like-for-like (LT, installed MW)

Using the engine's own S-curve (`projectFleet`: logistic, k = 0.6, midpoint 3.5 from 2026)
on the LT subset:

| Year | deployed % | KKME @35 % (Upside) | **KKME @50 % (Central)** | KKME @65 % (Downside) | Litgrid L TrSc scenario | Litgrid conn. indications |
|---|---|---|---|---|---|---|
| 2028 | 28.9 % | 1 845 | **2 401** | 2 957 | 1 260 | **3 120** |
| 2030 | 57.4 % | 3 126 | **4 231** | 5 336 | 2 115 | — |
| 2033 | 89.1 % | 4 546 | **6 260** | 7 974 | 2 428 | — |
| 2035 | 96.4 % | 4 876 | **6 732** | 8 587 | 2 652 | — |

**The prompt's supply hypothesis is half right and half backwards.**

- At **2028**, KKME Central (2 401 MW) sits **−23 % below** Litgrid's connection-indication
  view (3 120 MW). Reproducing 3.12 GW would need a **69.4 %** realisation rate, not 50 %.
  In that single year the prompt's reasoning holds: the TSO sees more supply arriving
  sooner than we do, so our Central is optimistic on revenue.
- From **2030 onward it inverts.** KKME Central runs **2.0× to 2.6×** Litgrid's own
  scenario-assumed BESS capacity, and by 2035 (6 732 MW) exceeds **every** Litgrid view
  including the 2028 connection-indication point. Our Central is already *more* pessimistic
  on revenue than the TSO's own build-out picture across the years that dominate a 20-year
  IRR.

So "recalibrating to the Litgrid basis" is not one adjustment in one direction. It would
*raise* 2028-2029 supply and *cut* supply materially from 2030. The two effects work
against each other on IRR and the net sign cannot be asserted without running it.

### A.4.3 Integration options

- **(a) Recalibrate realisation rates to reproduce the Litgrid trajectory.**
  **Recommend against.** It requires choosing which Litgrid series is "the trajectory", and
  the two candidates disagree by 2.5× (scenario 2 652 vs connection indications 3 120+ at
  different years). It would also overwrite a driver measured against our own fleet data
  with one fitted to a single TSO's LT-only view, for a Baltic-scope supply figure.
- **(b) Add "Litgrid L TrSc basis" as a fourth named scenario** alongside
  Central / Downside / Upside. **Recommended.** `scenarios.json` already carries scenarios
  as pure driver-override sets, and `scenario-overlay.mjs` already substitutes
  `PIPELINE_REALISATION`. Adding a named scenario is additive and touches no shipped
  constant, so the public `/revenue` path stays byte-identical by construction. It gives
  the client conversation its strongest artefact — *"here is your own TSO's build-out
  assumption, run through our model"* — without moving Central onto a basis we cannot
  defend across all years.
- **(c) Both.** Not recommended for the reason under (a).

**Revenue delta for option (b):** cannot be stated before the run. The LT/Baltic scope
mismatch means the scenario's realisation rate has to be defined against the Baltic
pipeline while being calibrated on LT — a decision the operator should make explicitly at
CP-1 (see the question list). Quantified at CP-2 either way.

---

## A.4b The blast radius is **not** bounded by the CPI floor

The prompt's risk framing — *"MEDIUM on code risk (CPI floor bounds the arithmetic blast
radius)"* — is **empirically false for the revenue engine**, and this is the finding most
likely to change the operator's decision.

`eff_demand` reaches revenue by **three** channels, not one:

1. `cpiCurve(sd_ratio)` — floored at 0.30. Saturated today (S/D 2.55 → raw 0.276) and
   under every candidate demand series. **Floor-absorbed. ✅**
2. `reservePrice(sd_yr, base)` — floored at 4 % of base. The engine's projected S/D runs
   **5.88 → 10.7** (confirmed live: `/revenue` `years[0].sd_ratio = 5.88`), where the
   logistic decay term is ~1e-9. **Floor-absorbed. ✅**
3. **`marketDepthFactor(mix.sd_ratio)`** (`workers/fetch-s1.js:1969, 2858`) —
   `1 / (1 + 0.15 × (S/D − 0.8))`, **no floor**, multiplying `rev_trd` — the trading
   revenue line, which carries `trading_fraction`, pinned at its **0.70 cap** in every
   projected year. **Not floor-absorbed. ❌**

Holding supply at the engine's own projection and swapping only the demand series:

| Year | supply | D = 935×1.02ⁿ | S/D | depth | D = Baltic joint | S/D | depth | Δ |
|---|---|---|---|---|---|---|---|---|
| 2029 | 5 833 | 992 | 5.88 | 0.5676 | 817 | 7.14 | 0.5126 | **−9.7 %** |
| 2033 | 9 378 | 1 074 | 8.73 | 0.4567 | 888 | 10.56 | 0.4058 | **−11.1 %** |
| 2035 | 10 548 | 1 117 | 9.44 | 0.4356 | 922 | 11.44 | 0.3852 | **−11.6 %** |
| 2040 | 12 495 | 1 234 | 10.13 | 0.4168 | 1 033 | 12.10 | 0.3710 | **−11.0 %** |
| 2048 | 15 212 | 1 445 | 10.52 | 0.4067 | 1 238 | 12.29 | 0.3672 | **−9.7 %** |

**20-year mean: −10.6 % on the trading component.** With trading at the 0.70 cap that is
roughly **−7 % on gross revenue**, before any supply-side change. Directionally this is
what honesty costs: the unsourced 935 was **24 % above** the TSOs' own 2026 figure, and
the 2 %/yr ramp carried it to 1 445 MW by 2048 — higher than any TSO-anchored series.

**Consequence for the phase:** the risk class on correctness is right, and the code-risk
mitigation named in the prompt does not exist. CP-2's delta table is load-bearing, and
Pause B must not be shipped on the assumption that the floor mutes it. The methodology
statement the prompt drafts — *"current cannibalisation assumptions already saturate at
the floor even under the TSO's own build-out projection"* — is **true of the compression
index and false of revenue**, and must be written that precisely or not at all.

### Extrapolation policy — the operator's most expensive choice

Litgrid stops at 2035; projections run to ~2048. Applied to 2036-2048 only:

| Policy | mean depth | vs status quo | Character |
|---|---|---|---|
| **flat-last-value** (922 MW held) | 0.3312 | **−19.8 %** | Conservative-simple. Asserts Baltic reserve demand stops growing in 2036 while RES keeps building — an assumption the source documents contradict. |
| **component-trend** (2.29 %/yr, the series' own CAGR) | 0.3690 | **−10.7 %** | **Recommended.** Derived from the published series, not chosen. Per-component: mFRR and FCR trend, aFRR flat (the document shows it flat by construction). |
| **demand-growth-linked** (engine's 2.00 %/yr) | 0.3641 | −11.9 % | Keeps the existing `demand_growth` driver, which is already scenario-tunable. Defensible, but 2.00 % is itself unsourced — replacing an unsourced level with a sourced one while keeping an unsourced growth rate is half a fix. |

"Flat-last-value" is conservative in *arithmetic* and aggressive in *assumption*. It costs
nearly twice as much revenue as the trend policy, on a premise the primary source does not
support. Recommend **component-trend**, with the CAGR computed from the published series
at module build time (rule #2 — computed, never written down as a constant).

---

## A.5 Update mechanism — design

1. **Canonical module** `tools/consultancy/data/demand-forecast.json`, validated by
   `tools/consultancy/lib/demand-forecast.mjs`. Shape per the prompt, plus:
   `sources[]` (the FNA *and* the two Baltic dimensioning forecasts — three documents, each
   with title / url / published / archived_copy / sha256), `scenario_used`
   (`L TrSc / realistinis`), `excluded_readings[]` (the 4364→7131 total-measures series,
   stored **explicitly with a `do_not_use` reason** so the trap is documented in the
   artefact rather than only in prose), and `history[]` for forecast evolution.
2. **Interpolation** — linear **per component**, then summed. IZDR must hit exactly 0 at
   the document's own year; GAGAP must step at 2033. Never interpolate a total.
3. **Extrapolation** — per component, policy from the operator's CP-1 pick, CAGR computed
   from the series.
4. **Tripwire** — `lv_press`-pattern page-diff watcher on **three** indexes (the FNA page,
   the balancing-market index carrying the FRR/FCR forecasts, and — because Litgrid told
   us it is coming — the publications index for the **flexibility-market development plan
   due Q4 2026**). Weekly. Telegram alert. **Human-in-the-loop adoption only.** Fixture
   page-pair test. Note the FNA's own cadence is **biennial**, so this watcher should be
   quiet for ~2 years; the Q4-2026 market plan is the near-term reason it exists.
5. **Forecast-evolution retention** — old versions retained in `history[]` on adoption.
6. **Register + changelog** — one row per component treatment, one per policy,
   `review_cycle: litgrid-biennial` (not annual — the document states two years),
   `engine_binding` into the module. Founding changelog entries record this adoption.

---

## CP-1 — decisions requested

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Component treatments** — the A.2 table | FCR `addressable`; GAGAP + LT-PL `supply-absorption`; IZDR, short-term, DSO `excluded` with stated reasons |
| 2 | **Scope** | **(c) Baltic-auction-derived** — tri-TSO FRR + FCR dimensioning forecasts, year-indexed 2026-2035. Reject (b) LT-anchored; (a) three-TSO composite blocked pending LV/EE FNAs |
| 3 | **Supply-side integration** | **(b) named "Litgrid L TrSc basis" scenario only.** Do **not** recalibrate Central — the gap changes sign at 2030 |
| 4 | **Extrapolation policy** | **component-trend**, CAGR computed from the published series |
| 5 | **New — 935 retirement** | Retire from all six sites in one pass; module is the only source. Requires accepting the S/D move on the public site (2.55× → the module's Baltic series) |
| 6 | **New — the −7 % revenue delta** | Acknowledge before Pause B that this phase is expected to *reduce* published revenue by roughly 7 % on the trading line, and that the CPI floor does not absorb it |
| 7 | **New — LT-scope realisation for the named scenario** | If the L TrSc scenario is built, define its realisation rate against the Baltic pipeline calibrated on LT, or restrict the scenario to an LT-only supply view. Operator's call |
| 8 | **New — Energy Cells' 200 MW in the numerator** | Remove from merchant weighted supply for 2028-2030 and restore from 2033, driven by the module's IZDR series. This is a live over-count of competing supply — 200 MW at weight 1.0, legally barred from our products. Fixing it *raises* revenue slightly, partly offsetting decision 6 |

**Blocked pending answers:** every engine change. Nothing in Pause B starts until 1-4 (and
ideally 5-7) are signed.

---

## Routed follow-ups

- **LV / EE flexibility-needs assessments** — EU-mandated, July-2026 deadline, not
  pinned here (`ast.lv`, `elering.ee` → HTTP 403). Own phase; would unlock scope option (a).
- **Litgrid flexibility-market development plan, Q4 2026** — will define procurement for
  the short-term (429-536 MW), DSO (30-108 MW) and possibly GAGAP volumes. The single
  largest potential change to the `excluded` treatments. Tripwire target.
- **LT fleet tiering** — 148 of 159 LT entries are `announced`; no tier mapping is
  possible against any TSO series until this is fixed. Related to 36.C's finding that the
  Litgrid Layer-3 scraper parses a permanently empty page.
- **`afrr: 120` peak-vs-mean** — documented bias in the per-product denominator
  (peak cycle 120 vs daily mean 106.3). Decide deliberately.
- **`syncLitgridFleet` demand laundering** — the read-back path that promotes a cosmetic
  default into arithmetic. Dies with the module, but worth its own regression test.
