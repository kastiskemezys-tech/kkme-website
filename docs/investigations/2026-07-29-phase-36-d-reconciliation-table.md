# Phase 36.D — the KKME-vs-Litgrid reconciliation table

Every figure published by the Lithuanian TSO in *Lankstumo poreikių ataskaita 2026* and by
the three Baltic TSOs in their LFC-block dimensioning forecasts, its verification status,
and what KKME does with it. This is the artefact an advisor, investor or competitor holding
those documents can check us against line by line.

**Sources, archived with checksums in `tools/consultancy/data/sources/`:**

| Document | Authors | Published | Role here |
|---|---|---|---|
| Baltic LFC block **FRR** dimensioning forecast 2026-2035 | Elering · AST · LITGRID | 2025-07-29 | demand series (mFRR, aFRR) |
| Baltic LFC block **FCR** dimensioning forecast 2026-2035 | Elering · AST · LITGRID | 2025-12-05 | demand series (FCR) |
| Lankstumo poreikių ataskaita 2026 (+ 3 annexes) | LITGRID with ESO, via VERT | 2026-07-23 · ACER 2026-07-25 | component structure, absorption |

---

## A. The demand series — what KKME divides by

| Component | 2026 | 2028 | 2030 | 2033 | 2035 | 2048 | Verified | Treatment |
|---|---|---|---|---|---|---|---|---|
| mFRR upward (peak cycle) | 604 | 644 | 684 | 724 | 754 | 1 039 | ✅ table 2, p.6 | **addressable** |
| aFRR upward (peak cycle 16-20) | 120 | 120 | 120 | 120 | 120 | 120 | ✅ figure 1, p.5 | **addressable** |
| FCR (Baltic block) | 28 | 31 | 36 | 44 | 48 | 48 | ✅ chart series | **addressable**, flat after 2035 |
| **Effective demand** | **752** | **795** | **840** | **888** | **922** | **1 207** | | |

`752 = 604 + 120 + 28` is the constant the engine shipped for months with no source recorded.
It was correct. It is now the 2026 row of a ten-year published series, and the other nine
years exist.

**FCR is the one extrapolation exception**, and the reason is physical rather than cosmetic:
FCR is the Baltic block's *share* of a fixed 3 000 MW Continental Europe reference incident,
allocated by generation and consumption share. Compounding its 6.19 %/yr share growth to
2048 would give 104.6 MW — the Baltic share more than tripling. Held flat from 2035.

---

## B. The Litgrid flexibility assessment — component by component

Transcription accuracy against the primary document: **every MW figure in the excerpt KKME
was working from is exact.** One divergence found, and it is the document's own.

| Component | 2028 | 2030 | 2033 | 2035 | Verified | **KKME treatment** | Why |
|---|---|---|---|---|---|---|---|
| System — short-term | 429 | 484 | 415 | 536 | ✅ exact | **excluded** | No procurement mechanism exists; would double-count against the LFC-block series. Revisit on Litgrid's flexibility-market plan (due Q4 2026) |
| Network — DSO | 30 | 42 | 77 | 108 | ✅ exact | **excluded** | DSO-procured by manual public tender; figure is a sum of per-node maxima, not a coincident requirement |
| Specific — FCR | 14 | 18 | 23 | 25 | ✅ exact | **excluded here** | Superseded by the Baltic-scope FCR series. Retained: it cross-validates that series' LT row exactly |
| Specific — IZDR | 200 | 200 | 0 | 0 | ✅ exact | **absorption** | Reserved by law (EEĮ 48(1)(3)) to UAB "Energy cells"; all other participants barred |
| Specific — GAGAP | 154 | 154 | 354 | 354 | ✅ exact | **absorption** | BESS-only, market-procured (VERT O3-731), no KKME revenue line |
| Specific — LT-PL | 146 | 146 | 0 | 0 | ✅ exact | **absorption** | Fast-response service; ends with Harmony Link |
| **Total (MW)** | **973** | **1 044** | **869** | **1 023** | ✅ exact | | |
| **Total (MWh)** | 1 519 | 2 325 | 1 814 | 1 252 | ⚠️ **2028 only** | components canonical | Printed 1 519; components sum to **1 510**. Same error in tables 1 and 48, so one upstream slip. Recorded, not adopted |
| **Derived: absorption** | **500** | **500** | **354** | **354** | | deducted from supply | |

### The reading that must never be used

| Series | 2028 | 2030 | 2033 | 2035 | Status |
|---|---|---|---|---|---|
| Total flexible measures (`Poreikis`, table 43) | 4 364 | 5 398 | 5 834 | **7 131** | **do-not-use**, recorded in the module |

This is the "**4.36 → 7.13 GW**" of Litgrid's public summary — the headline sentence on p.10.
It is the *total* requirement; the additional need is the `Nepadengtas` column of the same
table. Read as demand it puts LT S/D at 0.26-0.42 (SCARCITY) and inflates the compression
index from ~0.31 to ~1.86 — a ~5× error, in the direction that flatters us. Stored explicitly
under `excluded_readings` with its reason so the refutation lives in the data.

### The structural result

**IZDR + GAGAP = 354 MW in every analysed year** (table 20, p.127). The fast-response
requirement never changes; only who may sell it does. When the Energy Cells reservation
lapses at 2033, 200 MW returns to the merchant pool *and* market-procured GAGAP rises by
exactly 200 MW — **net zero**. Asserted in every year, not only the four published, so no
future refactor can merge the components and silently break the cancellation.

### Figures that could NOT be verified — not adopted

| Claim (from secondary coverage) | Status |
|---|---|
| "developer connection indications flat at 4.76 GW" | Appears only in a raster chart; not in the document text. **Not recorded as data** |
| "1.26 GW LTsC" | "LTsC" is a mis-reading of **L TrSc**, the *scenario name*. 1 260 MW is scenario-assumed BESS capacity |
| "X + Y" supply decompositions | Scenario-assumed supply **plus** additional demand, summed. Litgrid does that sum once and states the result: 2.23 GW of BESS required at 2028 |

---

## C. Supply side — two claims about the same market

| Year | KKME Central (LT, installed MW) | Litgrid L TrSc scenario | Litgrid connection indications | Ratio |
|---|---|---|---|---|
| 2028 | 2 401 | 1 260 | **3 120** | 0.77× the indications |
| 2030 | 4 231 | 2 115 | — | 2.00× the scenario |
| 2033 | 6 260 | 2 428 | — | 2.58× |
| 2035 | 6 732 | 2 652 | — | 2.54× |

**The gap changes sign**, which is why Central was not recalibrated onto the Litgrid basis:
we build *less* than the TSO's connection-indication view at 2028 and 2.0-2.6× *more* than
its own scenario from 2030 — i.e. Central is already the more supply-pessimistic, and so the
more revenue-conservative, of the two across the years that dominate a 20-year IRR.

Litgrid's basis is instead available as the named **"Litgrid L TrSc basis"** scenario, as
published — no realisation rate, no S-curve, no haircut of ours. It produces **+22.5 % gross
and +43 % project IRR**. That it flatters us this much is exactly why its attribution has to
be unmissable wherever it renders.

**No tier mapping was attempted.** The document defines no membership criteria for its three
supply concepts, and KKME's LT fleet has no intermediate tiers to map onto — 148 of 159 LT
entries are `announced`.

---

## D. Reconciliations that were open and are now closed

| Question | Answer |
|---|---|
| Where did `eff_demand = 935` come from? | Nowhere. A bare literal in `fb088c4` (2026-03-05), no derivation anywhere in the repository. Kept alive by a cosmetic KV default being read back into `processFleet`, which made the published S/D oscillate 3.17× ↔ 2.55× on cron order. **Retired from all six sites.** |
| Where did `/s2`'s 752 come from? | The 2026 row of the two Baltic dimensioning forecasts. Correct all along, never written down. **Now sourced and year-indexed.** |
| Do the two documents reconcile on LT? | On FCR, exactly — the Baltic forecast's LT row matches the FNA's FCR row at all four years. On FRR, **no**: the FNA's LT mFRR-up (633 MW) is 98 % of the whole Baltic block while its aFRR-up (67 MW) is 56 %. Those cannot both be country shares. The FRR document explains why the comparison is ill-posed — post-synchronisation, capacity may sit in any Baltic LFC area. **No LT share is derived from these documents.** |
| Are the LV and EE assessments usable? | Mandated on the same July-2026 deadline; neither could be located (`ast.lv`, `elering.ee` return HTTP 403 to every fetcher available). **Not used.** Routed as a follow-up. |

---

## E. What is watched, and on what cadence

| Page | Why it matters | Cadence |
|---|---|---|
| Flexibility-needs assessment | Component treatments, absorption trajectories, the 354 MW identity | biennial (next ≈ 2028) |
| Balancing-market index | The demand series itself | annual |
| Studies index | Where the flexibility-market development plan (Q4 2026) is expected | ad hoc |

Weekly page-diff, Telegram alert, **human-in-the-loop adoption only**. The watcher's own
liveness is on `/health.demand_watch`, because a silent alerting mechanism alerts nobody.
