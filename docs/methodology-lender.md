# KKME lender-grade methodology

**Engine version:** v7.3 (MW partition default, Phase 38.6a) · **Assumption register:** r4.218d1c16 (70 rows) · **Arc:** Phase 38.8
**Prepared:** 2026-07-29 · **Maintainer:** UAB KKME · Kastytis Kemežys

---

## 00 · What this document is

This is the technical annex a bank's advisor reads when a KKME revenue model is put in front of a credit committee. It is written for someone whose job is to find the number that does not hold up.

It sits **beside** [`docs/methodology.md`](https://kkme.eu/methodology), the published methodology that describes the engine running the public platform. That document explains how the numbers are computed. This one goes further, and says four things that a marketing methodology usually does not:

1. **Which parameters are measured and which are assumed** — named individually, with the measurement window and sample size for the first group and the source and review date for the second.
2. **What the model cannot resolve** — including a debt-sizing percentile the sample is too small to produce, which is reported as unresolved rather than dressed up.
3. **Where the model disagrees with an external benchmark** — at full size, with the band left where its source put it.
4. **What is known to be wrong or incomplete** — section 09 is a list of the model's own defects, written before anyone else compiles it.

Nothing here is a claim about how good the model is. Every quantitative statement below is either derived in-document from a stated input, or produced by a named runner whose output file and registry entry can be re-executed.

### How to trace any number in a KKME deliverable

Every delivered artefact — the workbook, the summary PDF, this annex — carries a **run ID** in its footer or cover.

```
   a figure in the report
     → the delivery build's run_id, stamped on the artefact
       → the runner run_ids that build consumed          (tools/consultancy/runs.jsonl)
         → engine_git_sha · input_hash · output_hash · data_vintage · register_version
           → the committed engine, config and price files those hashes cover
```

The run ID is a **content fingerprint**, not a serial number: it is 12 hex characters of `sha256(engine_git_sha ‖ input_hash ‖ output_hash)`, prefixed by the runner that produced it. Re-running the same engine over the same inputs reproduces the same ID. This matters more than it may appear — it means a reproduction is self-evident, and a figure that *fails* to reproduce shows up as a mismatched ID rather than as an ambiguity someone has to adjudicate.

`runs.jsonl` is append-only and committed to the repository. A run ID that appears twice is a recorded reproduction, not a duplicate.

A commit that was not clean when a number was produced is marked: `engine_git_sha` carries a `-dirty` suffix when the working tree had uncommitted changes. A delivered number from a dirty tree is not reproducible from the repository alone, and the registry says so rather than implying a provenance it does not have.

---

## 01 · Engine overview and the calibration register

### 1.1 One engine, one home

Every number KKME publishes — the public site, the calculator, and every consultancy deliverable — comes from `computeRevenueV7` in `workers/fetch-s1.js`. There is no separate "model for clients". The consultancy tooling in `tools/consultancy/` imports that engine into Node and drives it; it never restates its arithmetic.

This is enforced rather than intended. The rule is that one quantity has exactly one implementation, and the mechanisms that hold it are:

| Mechanism | What it prevents |
|---|---|
| `tools/consultancy/engine.mjs` imports `workers/fetch-s1.js` directly | a parallel client-side engine |
| The 54-configuration byte-identity gate (`regression-reference.mjs`) | an engine change that silently moves public numbers |
| A route-level probe replaying all 54 through the real `fetch` handler | a *route*-layer change the engine gate cannot see |
| The assumption register's bindings (§1.2) | a documented value that disagrees with the code |
| `metricRegistry.ts` + its CI test | one metric derived two ways in two display locations |

The byte-identity gate is asserted after every commit in this arc. Where an arc phase needed a constant the worker did not export, the worker gained an **export statement and nothing else** — export bindings are compile-time and add no runtime path — and the gate plus the route probe were run to prove it.

### 1.2 The assumption register

`tools/consultancy/assumptions-register.json` holds 70 rows across eight categories. Its governing property is that it **documents the engine and cannot contradict it**: every live row carries an `engine_binding`, and a test asserts the row's value equals what the code actually holds.

| Category | Rows | Examples |
|---|---:|---|
| technical | 8 | RTE at BOL (2h / 4h), RTE decay, cycles/yr, SOH restore on augmentation, standby auxiliary load |
| market | 11 | aFRR / mFRR / FCR capacity prices, activation p50s, DA capture, 15-min uplift, Euribor 3M |
| saturation | 4 | Baltic weighted supply MW, pipeline MW, reserve demand MW, LT zone price correlation |
| cost | 11 | optimiser service fee, power-exchange variable fee, TSO balancing-capacity fee, integration fee, €/kW/yr operating, calibration constant, opex escalation, WACC |
| capex | 8 | €/kWh installed, maintenance, augmentation (year / depth / cost), replacement (year / depth / cost) |
| project | 3 | the three Prosperus site configurations |
| scenario-driver | 7 | fleet realisation, spread growth, availability, trading realisation, cap-price delta, CPI floor |
| price-formation | 18 | per-service scarcity multiples, convergence rates, floor displacements, per-direction activation rates and prices (§08B — NOT WIRED, see there) |

Binding namespaces: `worker:` (anchored regex against the frozen worker source, each pattern asserted to match exactly once), `engine:` (a field the engine emits), `bridge:`, `portfolio:`, `driver:`, `config:`, `calibration:` (a value in the committed price-formation calibration artifact — see §08B.6).

There is exactly **one** kind of row that may carry no binding: a **superseded** row, which records a value the model used to hold. It is not an input — nothing reads it — so binding it would be a lie. Such a row must name the row that replaced it and the date. The invariant is therefore not "most rows are bound" but "every row is either bound to live code or explicitly declared superseded, naming its replacement". Both directions are schema-enforced.

### 1.3 Live-market rows and why they sync from a fixture

Capacity prices, clearing prices and fleet MW move daily. Binding those rows to production would make the register's test a market-movement detector rather than a code gate, and it would go red overnight for reasons nobody can fix. They sync from `fixtures/regression-kv.json` — the same frozen fixture the public regression gate uses — and carry `basis: "live-kv"` so the delivery generators refresh them from the KV snapshot that actually produced the client numbers.

### 1.4 Review cycle

| Row class | Refreshed | Trigger |
|---|---|---|
| `basis: "live-kv"` | every delivery build | the KV snapshot the build ran against |
| `basis: "measured"` | annually | remeasurement window closes; see §10.4 |
| bound constants (`worker:`) | on engine change | the binding test fails if the code moves and the register does not |
| project configs | per engagement | client-supplied or public-register sourced |

---

## 02 · Dispatch policy

### 2.1 Why an hourly simulation exists at all

The shipped `/revenue` engine allocates MW-hours across products by **time share**: a fraction of the year in both reserve products, a fraction in day-ahead arbitrage windows. That structure cannot express the constraint that matters most to a lender — committing reserve MW also reserves the **state of charge** needed to deliver on that commitment. A time-allocation model can show a revenue stack that is available in aggregate and not simultaneously achievable.

Phase 36.B1 built a chronological hourly engine (`tools/consultancy/lib/dispatch.mjs`) that carries SoC continuously through all 8 760 hours of a real calendar year and enforces that constraint hour by hour. It is a **new capability alongside** the shipped engine, not a replacement: the public site and every delivered number still come from `computeRevenueV7`. What the hourly engine provides is the *proof* of simultaneity and the measurement of what simultaneity costs.

### 2.2 Policy: conservative greedy, deliberately not a linear program

A linear-programming co-optimiser is optimiser-vendor territory. It claims more revenue than a real BRP contract delivers, it cannot be audited line by line, and its output is a number a credit committee has to take on trust.

The policy here is a fixed priority order — contracted reserve obligations first, merchant day-ahead arbitrage on whatever MW and SoC remain — which is both what an operator actually does and something an advisor can read and check. Its conservatism is a feature.

Every ambiguous call resolves toward **less** claimed revenue:

- Activation energy is taken at its expected value, never optimised against.
- Charge and discharge thresholds are same-day quartiles of the day-ahead curve, known only after the auction clears. The policy never sees the future.
- When a reserve commitment and its SoC reservation conflict, the **committed MW is cut**. The reservation is never relaxed.
- Charging in negative-price hours is credited at **€0**, not booked as income.
- Discharge below €0 never happens.
- The cycle-budget throttle suppresses merchant revenue only, never the contracted stack.

### 2.3 The policy, as pseudocode

Transcribed from `lib/dispatch.mjs::simulateYear`, in execution order.

```
for each hour h in the year:

  STEP 0 — availability
    if the asset is unavailable this hour, or the price is missing:
        record and skip.
    (availability = the scenario's 3% haircut, split into one planned outage
     block and randomly-placed forced-outage hours, drawn from a seeded PRNG so
     the pattern reproduces exactly)

  STEP 1 — reserve commitment, with energy reservation
    mw_left  = nameplate MW
    need_up  = 0 ; need_down = 0
    for each product p in [FCR, aFRR, mFRR]:          # strictest prequal first
        if p is FCR and the DRR derogation is active: skip   # no FCR before 2028
        ceiling = min(MW × share[p], market_available_mw[p], mw_left)

        # Committed MW implies SoC headroom in BOTH directions for the
        # product's prequalification duration dur_req_h.
        room_up   = soc − soc_min  − need_up
        room_down = soc_max − soc  − need_down
        mw_p = min(ceiling,
                   room_up   / dur_req_h[p],
                   room_down / dur_req_h[p])           # never negative

        commit mw_p ; need_up += mw_p × dur_req_h[p] ; need_down likewise
        mw_left −= mw_p
        capacity_revenue += mw_p × cap_price[p] × acceptance[p]

  STEP 2 — expected activation energy
    for each committed product p:
        e = (mwh_per_mw_yr[p] × mw_p) / HOURS_PER_YEAR      # not / hours simulated
        soc −= e
        activation_revenue += e × act_price[p]
    (if this would breach soc_min the shortfall is RECORDED AS A VIOLATION,
     not silently clamped)

  STEP 3 — cycle governor, evaluated before any merchant action
    pace = efc_used / (h+1) × hours_in_year
    throttled = efc_used ≥ warranty_cap  OR  pace > warranty_cap

  STEP 4 — residual day-ahead arbitrage
    mw_free      = mw_left
    headroom_up  = soc − soc_min − need_up
    headroom_down= soc_max − soc − need_down
    if not throttled and mw_free > 0:
        # Round-trip test: 1 MWh bought yields rte MWh sellable, so the trip
        # only clears if the day's own discharge threshold covers the loss.
        # Same-day, post-auction information only — no foresight added.
        clears = (discharge_threshold × rte) > price

        if price ≤ charge_threshold and headroom_down > 0 and clears:
            e_in = min(mw_free, poi_import, headroom_down / rte)
            soc += e_in × rte                        # RTE charged once, on the charge leg
            cost += max(0, price) × e_in             # negative hours credited at €0

        else if price ≥ discharge_threshold and headroom_up > 0 and price > 0:
            e_out = min(mw_free, poi_export, headroom_up)
            soc  −= e_out
            arbitrage_revenue += e_out × price

  STEP 5 — accounting and invariants
    efc_used += (e_in × rte + e_out + activation_energy) / (2 × usable_mwh)
    assert soc within [soc_min, soc_max]
    assert committed MW ≤ nameplate, SoC reservation satisfied, POI respected
```

### 2.4 The constraint set, enforced every hour

| Constraint | Enforcement |
|---|---|
| SoC bounds | 5 %–95 % of **usable** (SOH-derated) energy, not of nameplate |
| SoC continuity | carried hour to hour across the whole year; no daily reset |
| Reserve energy reservation | committed MW × `dur_req_h` of headroom in **both** directions (FCR 0.5 h, aFRR 1.0 h, mFRR 0.25 h) |
| Round-trip efficiency | applied once, on the charge leg, at the SOH-year-appropriate rate |
| Cycle budget | running EFC counter against the warranty cap; merchant cycling throttled as it tightens, never breached by merchant action |
| POI limits | export and import both clipped at the grid connection rating |
| Negative prices | discharge never below €0; charging preferred but credited at €0 |
| Availability | planned + forced outage hours totalling the scenario haircut |

`dur_req_h` is the engine's own prequalification requirement per committed MW (`RESERVE_PRODUCTS`), imported rather than restated. Committing 1 MW of aFRR reserves 1.0 MWh of SoC headroom in each direction. That physics is what the shipped engine approximates with a single scalar (`HEADROOM_DRAG = 0.70`); replacing the scalar with the enforced hourly constraint is the reason this engine exists.

### 2.5 The simultaneity measurement

The measurement runs the same project, same year, same prices, same scenario, and moves exactly one variable: whether committed MW must also hold the SoC to deliver on it. Nothing else differs, so the delta is attributable in full.

**Reference asset (50 MW / 100 MWh, 2 h), LT day-ahead, five complete shape-years:**

| shape-year | constrained gross | unconstrained gross | **simultaneously achievable** | hourly EFC |
|---|---:|---:|---:|---:|
| 2021 | €4 205 145 | €5 309 709 | **79.2 %** | 210.5 |
| 2022 | €3 854 025 | €5 127 056 | **75.2 %** | 217.9 |
| 2023 | €4 537 793 | €5 458 195 | **83.1 %** | 218.3 |
| 2024 | €4 851 044 | €5 809 403 | **83.5 %** | 219.9 |
| 2025 | €5 085 873 | €5 946 841 | **85.5 %** | 219.1 |

**The measurement is year-dependent and is reported as a range, not a point.** Across 2021–2025 the simultaneously-achievable share of the unconstrained stack runs **75.2 %–85.5 %**. Reporting a single headline percentage would imply a stability the five-year sample does not show: the low year (2022) is the European price-crisis year, when the day-ahead shape was wide enough that the SoC reservation cost the most in foregone arbitrage.

Where the cost falls, on the most recent complete year (2025):

| line | constrained | unconstrained | delta |
|---|---:|---:|---:|
| capacity | €4 455 678 | €5 213 079 | −€757 401 |
| activation | €84 616 | €91 121 | −€6 505 |
| arbitrage | €545 579 | €642 641 | −€97 061 |
| **total** | **€5 085 873** | **€5 946 841** | **−€860 968 (−14.5 %)** |

Most of the cost lands on **capacity**, which is the finding: the constraint does not primarily stop the battery trading, it stops it *committing* — because a battery whose SoC has drifted toward a bound cannot hold the headroom its committed MW implies.

`enforce_reserve_energy: false` disables exactly this constraint and nothing else. It is a measurement mode, never a delivery mode: no client number is ever produced with it off, and the gate `hourly_below_unconstrained` asserts the constrained run never out-earns the unconstrained one.

### 2.6 Validation gates on the hourly engine

Run on every dispatch execution; results below are the 2025 shape-year.

| gate | result |
|---|---|
| energy balance exact | \|Σcharge×RTE − (Σdischarge + Σactivation + ΔSoC)\| = 1.6e−9 MWh (relative 7.6e−14) |
| zero constraint violations | 0 violations across 8 760 hours |
| warranty never breached | 219.1 / 730 EFC cap |
| DA throughput coherent with free MW | free-MW share 27.5 % vs DA-achieved-against-revenue-anchor 28.9 % |
| constrained ≤ unconstrained | holds |
| cycle count within ±10 % of the throughput-derived figure | **FAILS — declared** (see below) |

### 2.7 The cycle-count gate fails, and that is the result

The arc specified that dispatch-derived cycling should land within ±10 % of the engine's throughput-derived figure. It does not: **219.1 EFC against 678** on the shipped calibration at the time of measurement. The gate reports `pass: false` with `expected_deviation: true` and carries a per-product attribution, rather than being re-thresholded to pass. Re-thresholding would have buried the result the phase exists to produce.

Decomposition (2025 shape-year, EFC/yr):

| product | hourly | anchor | delta | why |
|---|---:|---:|---:|---|
| FCR | 0 | 16 | −100 % | DRR derogation — no FCR commitment before 2028, so the anchor cannot be earned |
| aFRR | 81.7 | 80.8 | **+1.2 %** | reconciles |
| mFRR | 26.3 | 31.3 | −15.9 % | committed MW cut by the SoC reservation |
| day-ahead | 111.2 | 550 | **−79.8 %** | reserve commitment leaves little MW free, and the round-trip test declines shallow days |

The reserve products reconcile. The day-ahead figure does not, and a second gate carries the defensible pass criterion instead: **DA throughput must fall in proportion to the MW that reserve commitment leaves free.** Across 2021–2025 the free-MW share runs 26.6 %–28.6 % and DA-achieved-against-revenue-anchor runs 26.8 %–29.1 % — agreement within ~2 pp every year. That is the physical sanity check on the hour loop, and it passes.

---

## 03 · Measured parameters

The advisor's first move is to attack the largest assumption. This section states which parameters have been replaced by measurement, what the measurement was, and what it cost.

### 3.1 Trading realisation — measured 0.7234 against an assumed 0.85

`trading_realisation` multiplies the arbitrage revenue line and reaches every delivered number. It was 0.85, sourced to an industry range (Modo 0.70–0.90). It is now measured.

**Method.** The B1 policy is replayed day by day over realised LT day-ahead prices with **day-ahead information only** — the policy sees the price curve after the auction clears, as a real BRP does, and never the future. Achievable capture ÷ perfect-foresight capture is the realisation.

**The denominator is the engine's own construct.** The register defines trading realisation against the S1 sort-and-dispatch capture — sort a day's prices, charge in the cheapest N intervals, discharge in the dearest N, take the spread. That is `computeDayCapture` in the worker, and it is **imported, not restated**: putting the measured value on a different denominator from the assumed value it replaces would have made the two incomparable and destroyed the point of measuring.

**Window:** 2025-07-01 → 2026-06-30, LT zone. 365 days evaluated, **349 traded**, 16 declined.

| statistic | value |
|---|---:|
| volume-weighted realisation | **0.7234** |
| simple mean | 0.7321 |
| minimum day | 0.1866 |
| p25 | 0.6280 |
| median | 0.7557 |
| p75 | 0.8491 |
| maximum day | 0.9974 |

**Monthly, volume-weighted:**

| month | realisation | traded | declined |
|---|---:|---:|---:|
| 2025-07 | 0.6714 | 29 | 2 |
| 2025-08 | 0.6540 | 31 | 0 |
| 2025-09 | **0.6535** | 30 | 0 |
| 2025-10 | 0.6774 | 29 | 2 |
| 2025-11 | 0.7125 | 27 | 3 |
| 2025-12 | 0.7317 | 29 | 2 |
| 2026-01 | 0.8150 | 29 | 2 |
| 2026-02 | 0.7177 | 25 | 3 |
| 2026-03 | 0.7443 | 30 | 1 |
| 2026-04 | 0.7751 | 29 | 1 |
| 2026-05 | **0.8155** | 31 | 0 |
| 2026-06 | 0.7709 | 30 | 0 |

**Declined days are excluded, not scored as zero.** The policy declined to trade on 16 of 365 days because the day's shape could not cover the round trip. Scoring those as 0.0 would drag the headline to roughly 0.69 — and it would be wrong: refusing an uncoverable spread is the round-trip guard working, not a missed opportunity. They are counted and reported separately.

### 3.2 Look-ahead leakage checks

All three run **unconditionally**, not only when the answer is uncomfortable. A clean bill of health conditional on the result being convenient is not worth having.

| check | result |
|---|---|
| no day beats perfect foresight | 0 of 349 days score > 1.0 (max 0.9974) |
| headline below the 0.90 suspicion threshold | 0.7234 |
| realisation uncorrelated with day quality | Pearson **r = −0.093** |

The correlation check is the substantive one. A policy that scored best precisely on the widest-spread days would be a policy that knew in advance which days those were. The observed correlation is very slightly *negative*, which is the expected sign for a threshold rule: wide days offer more spread than fixed p25/p75 triggers can reach.

### 3.3 What the measurement does and does not cover

It measures **day-ahead policy quality and nothing else**. Explicitly outside it:

- intraday execution
- bid rejection
- imbalance exposure
- balancing forecast error
- **reserve realisation**, which remains assumed (§9.1)

### 3.4 Adoption, and what it cost

The measurement was **adopted** as an operator decision on 2026-07-28. The engine constant `TRADING_REALISATION.base` moved with it so the Central driver still equals the shipped constant.

The ladder moved with its anchor and kept its shipped 5 pp steps rather than being re-invented: **Central 0.7234 / conservative 0.6734 / stress 0.6234**. Two checks on that choice — it is the smallest change preserving the existing structure, and the resulting rungs land inside the measurement's own daily distribution (p25 = 0.628, median = 0.756), so "stress" now means *a year made entirely of bottom-quartile trading days* rather than "20 % worse than an assumption".

Downside and Upside were re-anchored on the measurement's own **monthly extremes**, 0.6535 (2025-09) and 0.8155 (2026-05), rather than on a spread around the point estimate. An advisor who asks what the Downside case means is told "the worst month this policy actually had, on real prices".

This also fixed a defect the measurement exposed: the driver's declared sensitivity range had been `[0.78, 0.88]`, which **did not contain the measured value**. The range was understated, not merely the point estimate. It is now the measured monthly band, so the row contains the value it describes.

**Client impact, measured on the frozen KV fixture** so the delta is code-attributable rather than blended with a day's market movement. Portfolio, Central:

| line | before | after | Δ |
|---|---:|---:|---:|
| Gross Y1 | €13 580 628 | €12 967 071 | −4.52 % |
| EBITDA Y1 | €8 432 335 | €7 881 307 | −6.53 % |
| Pre-financing CF Y1 | €8 135 335 | €7 584 307 | −6.77 % |
| Gross 20-yr | €364 885 003 | €350 316 248 | −3.99 % |
| EBITDA 20-yr | €193 094 020 | €179 359 512 | −7.11 % |
| Pre-financing CF 20-yr | €150 385 020 | €136 650 512 | −9.13 % |
| NPV @ 8 % | €43 333 457 | €36 379 208 | **−16.05 %** |
| MOIC | 3.728 | 3.387 | −9.15 % |

Three things in that table deserve saying out loud.

**The gearing is the story.** Revenue falls 4.5 %, EBITDA 6.5 %, cash flow 6.8 %, NPV 16.1 %. Costs are largely fixed and NPV discounts a thinner margin, so a 4.5 % revenue correction lands as a 16 % NPV correction. Any conversation that reports only the revenue delta understates it by about 3.5×.

**Downside is where it bites.** One project's Downside NPV crosses zero (€2 234 571 → −€1 299) and the portfolio's Downside NPV drops 81 %. The Downside case was always thin; at measured trading realisation it is marginal. That is the number a lender's advisor sizes debt against, and it is better found here than in their model.

**Upside barely moves** (−5.8 % NPV), because the Upside driver fell only to 0.8155 from 0.88. The spread between cases has widened, which is the correct consequence of replacing a narrow assumed band with a wider observed one.

*One reconciliation note, because the two figures are easy to confuse.* The table above isolates **this change alone**. The throughput alignment described in §5.3 landed afterwards and recovered part of it: measured on the same fixture, the portfolio NPV after the full sequence is €37 347 448 (−13.8 % against the pre-cutover €43 333 457) rather than the −16.05 % shown here. The isolated figure is the one recorded in the changelog, because it is what the *decision* cost; the combined figure is what the model ended the arc at.

### 3.5 Sub-hourly uplift — measured 0.0885 against an asserted 0.14

LT day-ahead has been natively PT15M since 2025-10-01, so the sub-hourly capture uplift is directly testable. `computeDayCapture` was run at 15-minute and at 60-minute resolution on identical days, with the source re-fetched at native resolution (the committed year files are averaged into the hour under decision D1).

| statistic | value |
|---|---:|
| days measured | 273 complete PT15M days (2025-10-01 → 2026-06-30) |
| weighted uplift | **0.0885** |
| simple mean | 0.0979 |
| median | 0.0815 |
| range | 0.0005 – 0.8453 |
| previously asserted | 0.14 (vendor note) |

The asserted constant was roughly **58 % higher than measured**. It was adopted on 2026-07-28.

**This moves a card, not a model.** The constant is read at exactly two sites, both display fields on the public dispatch card. `/revenue` is byte-identical across the change, asserted at 54/54, and no client deliverable number moves. The distinction between this and §3.4 is worth being precise about: trading realisation is a model input that reaches every delivered figure; the sub-hourly uplift is a disclosure on one public card.

A live re-measurement run on 2026-07-29 reproduced 0.0885 exactly against the now-adopted constant.

### 3.6 Assumed versus measured — the current position

| parameter | status | value | basis |
|---|---|---:|---|
| trading realisation (day-ahead) | **measured** | 0.7234 | 349 traded days, 2025-07 → 2026-06 |
| sub-hourly capture uplift | **measured** | 0.0885 | 273 PT15M days |
| cycling / EFC per year | **derived + corroborated** | 198 (engine, post-38.6a) / 219–222 (hourly, closed-loop) | §05 |
| reserve realisation | **assumed** | acceptance factors, flat | §9.1 — no data exists to measure it |
| reserve capacity price | **assumed** (live-KV) | from the KV snapshot | flat across shape-years |
| activation price | **assumed** | observed p50 | §9.2 — a heavily skewed distribution |
| availability | **assumed** | 97 % base | scenario driver |
| RTE, SOH, degradation | **sourced** | NREL ATB + manufacturer warranty | §05 |

---

## 04 · Probabilistic method

### 4.1 What the distribution is built from

Three named scenarios are screening-grade. Debt sizing needs a distribution. The method here is a **historical-shape bootstrap**: replay the B1 hourly dispatch under each complete historical price year, and use the resulting spread of outcomes as the distribution.

Every distribution input therefore traces to a real market year. There are **no synthetic draws**.

**Primary sample: 2021–2025, five complete years.** The batch specification proposed 2021–2026; the committed 2026 file is 57.5 % covered (5 038 of 8 760 hours, year to date) and a partial year cannot be replayed as an annual dispatch. Every other year in the estate is 100 % covered — checked, not assumed.

A **sensitivity sample of 2015–2025 (eleven years)** is computed separately and is not the gated result. See §4.5.

### 4.2 The forward transformation

The shipped engine owns the forward path — degradation, saturation, CPI compression, spread growth, augmentation. The bootstrap does **not** restate any of it. Each shape-year produces a set of factors, and those factors scale the engine's own revenue lines through its own 20-year projection.

Shape-year factors, reference asset, struck against a fixed reference year (2025):

| shape-year | capacity | arbitrage | arb energy | activation (applied) | activation (measured) |
|---|---:|---:|---:|---:|---:|
| 2021 | 0.980 | 0.460 | 0.928 | 1.000 | 1.492 |
| 2022 | 1.017 | 1.133 | 0.981 | 1.000 | 4.320 |
| 2023 | 1.008 | 0.656 | 0.989 | 1.000 | 1.498 |
| 2024 | 0.995 | 0.869 | 1.009 | 1.000 | 1.167 |
| 2025 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

Two things about that table.

**The factor basis is the ATTRIBUTED revenue lines, not the raw ones.** The hourly engine books the whole charging cost against arbitrage, which makes that raw line negative in several years. Ratios of negatives produced an arbitrage factor of −1.401 for 2022 — a nonsense figure that scaled trading revenue through zero and out the other side, while still producing a plausible-looking percentile table and green gates. The attributed lines split charging cost pro rata by delivered MWh and are positive in every shape-year, which is what makes them a valid ratio base. The code now **throws** on any non-positive factor rather than propagating one.

**Activation's factor is pinned at 1.0 and the measured ratio is carried beside it.** The measured activation ratio varies by up to 4.3× between years, but that variation is driven by attributed charging cost, not by any day-ahead signal — activation energy comes from flat annual anchors and its price is flat under decision D3. Scaling the engine's positive activation revenue by the ratio of two artefacts would import a modelling artefact into a client deliverable. The measured value is reported; the applied value is 1.0.

**Capacity's factor IS applied.** It is small (0.980–1.017) but genuine: in low-price years the round-trip test bars charging, SoC drifts toward the floor, and a battery sitting empty cannot hold the up-reserve headroom its committed MW implies — so committable MW falls. That is a real simultaneity effect and precisely what this arc exists to surface.

### 4.3 The percentile method, and the boundary it cannot cross

Empirical exceedance percentiles on Weibull plotting positions: with N samples the i-th smallest carries exceedance (N − i + 1)/(N + 1), so **a sample of N resolves only the band [1/(N+1), N/(N+1)]**.

| sample | N | resolves | P50 | P75 | P90 | P99 |
|---|---:|---|:-:|:-:|:-:|:-:|
| primary 2021–2025 | 5 | P17–P83 | ✓ | ✓ | **✗** | **✗** |
| sensitivity 2015–2025 | 11 | P8–P92 | ✓ | ✓ | ✓ | **✗** |

**The headline five-year sample cannot produce a measured P90** — which is the debt-sizing percentile. It is reported with `resolved: false`, clamped to the sample minimum, and carries the reason string in the payload and in every rendered table. Eleven years buys a genuine P90 and still cannot reach P99, which would need roughly 99 years.

This is deliberately mechanical rather than editorial. An advisor who sees `resolved: false` beside a P90 learns more than one who sees a confident number resting on five observations.

### 4.4 Result

Lifetime gross by shape-year, reference asset, Central, **as at the market state captured 2026-07-29**:

| shape-year | lifetime gross |
|---|---:|
| 2021 | €114.63M |
| 2022 | €138.31M |
| 2023 | €122.69M |
| 2024 | €128.53M |
| 2025 | €132.99M |

| percentile | lifetime gross | resolved | drawn from |
|---|---:|:-:|---|
| P50 | €128.53M | ✓ | 2024 |
| P75 | €118.66M | ✓ | 2023 |
| P90 | €114.63M | **✗** | 2021 (sample minimum) |
| P99 | €114.63M | **✗** | 2021 (sample minimum) |

**Gates:** P50 sits −3.4 % from Central; strict percentile ordering holds in all 20 years; all five shape-years ≥ 95 % covered; no constraint violations in any replay.

> **These figures move; the measured parameters do not.** The shape-year *factors* in §4.2 are properties of the historical price series and are stable. The euro amounts above are the engine's forward projection scaled by those factors, so they are computed against the market state at generation time and will differ on a later run — the run ID on the delivered artefact identifies which market state produced any given set. The measurements in §03 and §05 do not move: they are records of what was observed over a stated window.

**Percentile bridges are built from whole shape-year paths.** A per-year percentile table is a *band*, not a path: year 3's P90 and year 12's P90 can come from different shape-years, so reading down the column describes a scenario nothing could deliver. Both views ship, but the client bridges at P50 and P90 are each built from a single real shape-year's entire 20-year projection, named in the output.

### 4.5 Regime asymmetry — why the sample starts at 2021

On the eleven-year sensitivity sample, P50 lands **−22.8 %** from Central. That is not a reconciliation failure; it is a measurement of regime difference. Pre-crisis LT day-ahead ran at €34–50/MWh mean (2015–2020) against €85–95 post-2021, and Central is calibrated on current market state.

Factors are struck against a **fixed** reference year (2025) rather than against the sample mean, deliberately: normalising to the mean would have made the P50-vs-Central gate tautological. Against a fixed reference the gate can fail — and on the eleven-year sample it does, which is the evidence for excluding pre-2021 years from the primary sample.

A second asymmetry is structural rather than economic. Baltic synchronisation with the continental European grid completed in **February 2025**; before that the Baltic states operated in the BRELL ring with a fundamentally different balancing arrangement. The rule applied throughout: **pre-synchronisation years are usable for day-ahead SHAPE only, never for balancing calibration.** That is exactly how they are used here, because the balancing side is held flat under decision D3.

### 4.6 What this distribution structurally understates

Reserve prices are flat across every shape-year, so capacity revenue varies only through committable MW and never through price. **The spread reported here is a day-ahead spread.**

Total revenue variance is larger, and materially so: the reserve stack is **71.1 % of Y1 gross and 74.2 % of lifetime gross** in the reference case (measured on the frozen fixture at register r2.eb8712f9), and contributes almost no variance to this distribution. Every output payload carries `reserve_basis: "calibrated-flat (see D3)"` so the number cannot travel without the caveat.

That share is itself a moving quantity and rose when trading realisation was adopted at its measured value: lowering the arbitrage line raises the reserve stack's share of the total. It was 67.9 % / 71.9 % before the cutover. The direction is worth noting — **the measured correction made the model more dependent on the component that has not been measured.**

---

## 05 · Degradation and duration

### 5.1 The duration band was mixing calibrations

The engine is calibrated at exactly two durations, 2 h and 4 h. Twelve sites switched anchors at `dur_h ≤ 2` while the RTE curve switched at `dur_h ≥ 3`, so between 2 h and 3 h the engine ran a **2-hour round-trip efficiency against 4-hour day-ahead throughput**.

The arithmetic consequence was a step, not a drift:

| dur_h | old gross Y1 | new gross Y1 | old IRR | new IRR | old EFC | new EFC |
|---|---:|---:|---:|---:|---:|---:|
| 2.00 | 7 999 249 | 7 999 249 | 0.2225 | 0.2225 | 678 | 678 |
| 2.01 | 8 519 008 | 8 002 555 | **0.2450** | 0.2214 | 874 | 676 |
| 2.99 | 8 519 008 | 8 293 660 | 0.1538 | 0.1469 | 587 | 520 |
| 3.00 | 8 553 517 | 8 296 277 | **0.1543** | 0.1464 | 585 | 519 |
| 4.00 | 8 553 517 | 8 553 517 | 0.1051 | 0.1051 | 439 | 439 |

Adding 0.01 h of storage raised Y1 gross by €519 759 (+6.5 %) and project IRR by 2.25 pp. IRR **rose** with duration at both steps, which is impossible: duration costs CAPEX and buys very little extra revenue.

*Reading note.* That table is a snapshot taken at the duration fix itself, **before** the throughput alignment in §5.3. Its gross-revenue columns reproduce exactly today (2 h = €7 999 249, 4 h = €8 553 517, verified against the current engine on the frozen fixture); its IRR and EFC columns subsequently moved with §5.3 — the same anchors now read IRR 0.2246 / 498 EFC at 2 h and 0.1061 / 317 EFC at 4 h. The table is retained in its original form because it is the evidence for the discontinuity, and re-cutting it against the later engine would blur two separate corrections into one.

### 5.2 One interpolation policy, applied everywhere at once

All thirteen branches are replaced by a single policy: linear blend on throughput **and** RTE together between the 2 h and 4 h anchors, never mixed anchors.

Two properties earn it the right to be applied to every site simultaneously:

- **On-anchor identity.** At `dur_h ≤ 2` the blend weight is exactly 0 and the function *returns* the 2 h value rather than recomputing it; likewise at 4 h. No float arithmetic touches an anchor, so `/revenue` — which serves 2 h and 4 h only — is byte-identical **by construction**, not by rounding luck. The 54/54 gate agrees.
- **Documented clamp.** Outside [2 h, 4 h] the policy holds the nearest anchor rather than extrapolating. A 1 h or 8 h asset is outside the calibration, and the honest answer there is the anchor, said to be the anchor.

A property test sweeps 1 h → 8 h at quarter-hour resolution and asserts continuity, the two flat regions, and strict monotonicity of IRR, cycling intensity and LCOS. The old model failed the IRR monotonicity check at two points; the new one passes at all 28 intervals.

### 5.3 The throughput split, and why wear was lowered rather than revenue raised

Cycle accounting charged cell wear on the **full** day-ahead throughput anchor while revenue billed `anchor × trading_fraction × availability` — so the engine aged the battery for roughly 43 % more day-ahead energy than it earned revenue on. Two ways to close that:

1. **Raise revenue to the anchor.** Increases published revenue ~43 %, and is flatly contradicted by the hourly simulation, which finds achieved day-ahead throughput at ~27 % of the revenue anchor. Rejected.
2. **Lower wear to the delivered figure.** Physically correct: you cannot wear cells with energy you did not move.

(2) it is, and it is not free: less cycling means slower degradation means higher IRR (+0.9 % relative on the reference asset). **A consistency fix that happens to improve the answer deserves more scrutiny than one that worsens it**, which is why the external-benchmark consequence in §5.5 was chased rather than accepted quietly.

Availability now lands in exactly one place. The first version applied it inside the throughput breakdown and left the LCOS denominator's own availability factor untouched, haircutting the same energy twice.

### 5.4 The degradation loop closes in three passes, not two

The dispatch↔SOH relationship is a fixed point: the assumed cycling rate picks the SOH curve, the SOH curve sets the usable energy window, the dispatch realises a rate of its own. Until Phase 36.B5 nothing compared the two.

Reference asset, LT 2025 shape replayed across a 20-year horizon, prices and policy held fixed so the residual is attributable to the loop alone:

| pass | cycles/day in | realised | cycles/day out | \|Δ\| |
|---:|---:|---:|---:|---:|
| 1 | 1.363315 | 0.631921 | 0.631921 | 7.31e−1 |
| 2 | 0.631921 | 0.609179 | 0.609179 | 2.27e−2 |
| 3 | 0.609179 | 0.609179 | 0.609179 | 0 |

- open loop **1.3633 c/d (497.6 EFC/yr)** → closed loop **0.6092 c/d (222.4 EFC/yr)**
- SOH at year 20: 63.23 % → 66.50 %
- lifetime dispatch revenue on the fixed shape: €70.92M → €79.6M (**+12.19 %**)

**222.4 EFC/yr against the hourly engine's independently measured 219–220.** Two different routes — one a gate on a single-year hourly run, one a multi-year fixed point — landing on the same physical answer is the strongest corroboration this arc produced.

**The arc's two-pass claim is wrong, and is reported wrong.** The specification stated the loop "converges in 2 passes for realistic parameters (verify)". Verified: it does not. The residual after two passes is 2.27e−2 c/d — 3.60 %, against a 1e−3 tolerance. Convergence takes **three**. The runner reports the residual, the gap to the converged value and the measured contraction ratio rather than re-describing two passes as convergence.

### 5.5 The alignment breaches an external benchmark, and the band did not move

`external_3_cycles_yr` holds modelled cycling against **[550, 720] EFC/yr** from Modo / GEM measured merchant-battery research. The aligned reference asset comes in at **198** — below the band, on Central and on the reference asset, which are fail-level subjects.

**Phase 38.6a widened this breach and inverted a second one.** When the MW partition became the engine default, day-ahead throughput was re-based from a €/€ price ratio (0.70) onto the physical MW-hour share (0.139), and delivered cycling fell 498 → 198 EFC/yr. Two consequences a reader should not have to infer. First, the gap to the observed band roughly doubled: the model was 9 % below the band's floor, it is now 64 % below it. Second, and more important, the engine previously sat **above** the hourly closed-loop simulation (498 against 219–222) and now sits **below** it (198 against 219–222). The direction of the modelling error on wear has therefore reversed: the annual-average engine used to age the asset faster than the physics and now ages it slower, which is optimistic. Neither figure was re-fitted, and the band did not move.

The tempting move is to widen the band to [450, 720]. That is re-fitting evidence to the model.

What happened instead: a check may declare, **in code and with a stated reason**, that a breach is a known finding. The band keeps its sourced value, the breach is reported at full size, it is counted in the summary and printed by the CLI, and it is rendered in the client workbook as `DECLARED` carrying its reason. The only thing lifted is the build-failing status. A test asserts the band is unmoved, that the actual is genuinely below it, and that **no undeclared breach can survive**.

The same rule was applied in the register: the `cycles_efc_yr` row's declared sensitivity range had been the observed band. Rather than widen it, the band moved to a separate `benchmark_band` field with its source and the direction of the miss, and `sensitivity_range` went null. The row now says *"here is the observed band, and here is where the model sits relative to it"* instead of quietly containing itself.

**The finding is worth more than the gate.** The engine's stacked reserve + day-ahead model says its asset cycles *less* than the observed merchant fleet does. The hourly physical simulation says so more strongly still (219–222 EFC/yr). Two independent routes agreeing that the modelled asset under-cycles points at the benchmark fleet carrying a different reserve/day-ahead mix than the modelled stack. That is a calibration question, carried to §9.7 — not a reason to move a band.

### 5.6 What the closed loop is not

The loop closure is a **Node-side capability**. It moves no published number. Closing the loop inside the shipped engine would take the model to ~222 EFC/yr and a materially higher IRR, which is the hourly-engine cutover reserved as a separate operator decision. What this phase delivers is the measurement of what that cutover would be worth, plus proof the iteration is well-behaved enough to base one on.

---

## 06 · Contracted structures

### 6.1 Two structures, because a floor and a toll are different products

- **BLENDED** — the contracted share earns `max(merchant, floor)`. The floor is an option the asset holds: downside protected, upside retained.
- **FLOOR_ONLY** — the contracted share earns the floor and nothing else. This is the full-toll structure, and it is a **strictly lower** revenue path whenever merchant beats the floor.

Floor-only is not a reporting view of blended with the upside stripped for display. Both are computed, and a gate asserts floor-only can never exceed blended.

### 6.2 What the floor is measured against

Three places this construct can be quietly wrong, each pinned by a test:

1. **Against what.** The floor compares to the engine's `rev_gross`, which is already net of charging cost (the engine prices arbitrage on a captured spread). Comparing against the bridge's grossed-up top line would let the cost of buying energy count toward clearing the floor, and the floor would bind less often than it should.
2. **Against which share.** The comparison is contracted-share merchant revenue against contracted-share entitlement, never whole-asset revenue against the entitlement. €4M of whole-asset revenue clears a €2.5M floor comfortably — but if only half the asset is contracted, the contracted half earned €2M and the floor binds.
3. **Over how many months.** A partial first operating year pro-rates the entitlement, or the floor would bind spuriously in year one of every contracted case.

Binding is asserted exact at the boundary: short binds, equal does not.

### 6.3 The illustrative floor is derived from the model, not quoted from a note

A floor level had to come from somewhere, and an unsourced number in a client-facing artefact is exactly what KKME's named-entity discipline forbids. Rather than quote a tolling price from a market note, the default is derived from the asset itself: **the level the merchant case's Y1 net revenue exceeds in 75 % of shape-year outcomes** — €137 000/MW/yr at the reference asset (raw €137 232) on the market state captured 2026-07-29. It is derived per run, so it tracks the asset rather than ageing into a stale quote.

P75 and not P90 because P90 is outside what five shape-years resolve (§4.3). A floor written at an unresolved percentile would be the sample minimum wearing a percentile's label.

Every output carries a counterparty note defaulted to *"ILLUSTRATIVE — no counterparty. Structure test at a model-derived floor level, not a term sheet and not an offer received."* The contract normaliser **throws** if a live contract (non-zero floor, share and term) carries no counterparty basis at all. A real term sheet is two CLI flags away; a floor nobody can trace cannot be run by accident.

### 6.4 Result — reference asset, term 10 years, floor €137 000/MW/yr

| structure | contracted | 20-yr EBITDA | P50 lifetime | P75 lifetime | P90 lifetime * | years floor binds |
|---|---:|---:|---:|---:|---:|---:|
| merchant | 0 % | €71.27M | €128.53M | €118.66M | €114.63M | 0 |
| blended | 30 % | €71.45M | €129.18M | €120.73M | €117.33M | 5 |
| blended | 50 % | €71.56M | €129.62M | €122.11M | €119.13M | 5 |
| floor-only | 30 % | €70.94M | €128.88M | €120.69M | €117.33M | 5 |
| floor-only | 50 % | €70.71M | €129.12M | €122.04M | €119.13M | 5 |

\* P90 is **not resolved** at five shape-years and is the sample minimum wearing a percentile's name (§4.3), carried through unchanged rather than quietly dropped because this section would read better without it.

**The asymmetry is the product.** At 50 % contracted the median rises 0.85 % while the P90 tail rises 3.9 % — a lift of roughly 4.6× at the tail relative to the median. A test asserts the tail must lift strictly *more* than the median, so an overlay that merely added revenue everywhere would fail; it would not be a floor.

The spread between structures is real money: at 50 % contracted, blended 20-year EBITDA is €0.29M above merchant and floor-only is €0.56M *below* it — an €0.85M gap between two structures a client might actually be offered.

### 6.5 Conservative treatments, stated and quantified

The 4-line cost stack is applied to floor revenue exactly as to merchant revenue. In a real full toll the offtaker takes the trading rights, so the optimiser fee on the contracted share would not arise — meaning **this overlay understates the toll case's EBITDA**.

Rather than pick a side, the overlay reports the figure needed to undo the conservatism: **€2.47M at 30 % contracted, €4.11M at 50 %**. The conservative number ships; the correction ships beside it. An advisor who disagrees with the treatment can adjust without re-running anything, which is the difference between a conservative model and an opaque one.

The floor is also **nominal** — it does not escalate while opex does, so protection thins in real terms across the term. Stated, not corrected: that is how term sheets are usually written, and the direction is conservative.

---

## 07 · Reconciliation framework

### 7.1 The inventory

Every regeneration runs 133 assertions across 10 subjects (the reference asset + three projects × three scenarios + three portfolios). The same code is a vitest suite, so it is a permanent gate on every future change and not a one-off artefact.

**Internal — arithmetic identities, 73 assertions across 8 distinct checks:**

| check | subjects | what it holds |
|---|---:|---|
| `internal_1_gross_is_sum_of_revenue_lines` | 10 | the bridge's top line is its parts |
| `internal_2_net_is_gross_less_charging` | 10 | charging cost is deducted once |
| `internal_3_ebitda_is_net_less_opex` | 10 | the four-line cost stack ties |
| `internal_4_prefin_cf_is_ebitda_less_capex` | 10 | CAPEX events land in cash flow |
| `internal_5_monthly_sums_to_annual` | 10 | partial-year pro-rating is consistent |
| `internal_6_energy_balance` | 10 | charged × RTE = discharged |
| `internal_7_portfolio_is_sum_of_projects` | 3 | no portfolio uplift is claimed |
| `internal_8_all_years_tie` | 10 | the three bridge identities hold in **all twenty years**, not only year 1 |

The eighth check exists because the contracted seven are year-1 assertions, and an augmentation or replacement year is precisely where a bridge would break — those land in years 8 and 15.

**External — benchmark bands, 60 assertions across 6 distinct checks:**

| check | band | source |
|---|---|---|
| `external_1_project_irr` | 6 %–31 % | Clean Horizon S1 2025 Baltic BESS project IRR range |
| `external_2_backtest_balancing` | ±15 % | BTD-realised base year, Y1 balancing revenue per MW |
| `external_3_cycles_yr` | 550–720 EFC | Modo / GEM measured merchant-battery research |
| `external_4_capex_eur_kwh` | €150–190/kWh | installed cost benchmark |
| `external_5_ebitda_margin` | 45 %–70 % | Y1 EBITDA margin on gross market revenues |
| `external_6_net_rev_k_mw_yr` | €120–220k/MW/yr | Y1 net market revenue per MW |

### 7.2 The severity split

External bands fail for Central and the reference asset and **warn** for Downside and Upside. The reasoning is recorded in every row: an external band is a calibration signal rather than an arithmetic identity, and a deliberately extreme scenario leaving a band calibrated on central-case market observations is information, not error.

### 7.3 Current status, in full

**Internal: 73 / 73 pass, 0 warn, 0 fail.** The euro tolerances exist for integer rounding across rows and are not being consumed.

**External: 49 pass, 7 warn, 4 fail.** Every one of the 11 non-passes is enumerated below. There are exactly two distinct findings behind them.

| # | check | subject | actual | band | status |
|---|---|---|---:|---|---|
| 1 | `external_3_cycles_yr` | reference / central | 198 | 550–720 | fail — **declared** |
| 2 | `external_3_cycles_yr` | bitenai / central | 198 | 550–720 | fail — **declared** |
| 3 | `external_3_cycles_yr` | stoniskiai / central | 198 | 550–720 | fail — **declared** |
| 4 | `external_3_cycles_yr` | eigirdziai / central | 198 | 550–720 | fail — **declared** |
| 5–7 | `external_3_cycles_yr` | all three / downside | 487 | 550–720 | warn — **declared** |
| 8–10 | `external_3_cycles_yr` | all three / upside | 503 | 550–720 | warn — **declared** |
| 11 | `external_1_project_irr` | bitenai / upside | 32.2 % | 6 %–31 % | warn |

**Finding 1 — cycling below the observed merchant band (rows 1–10).** Fully explained in §5.5. The band is unmoved, the breach is reported at full size, and the model's position relative to the band is the disclosure.

**Finding 2 — one Upside project IRR above the published Baltic range (row 11).** Bitėnai's Upside case clears the top of the Clean Horizon band by 1.2 pp. That is what an upside case is for, but it means the Upside column in the deliverable carries a return above anything Clean Horizon has published for this market. Defensible with the driver stack stated (capacity prices +20 %, pipeline realisation 35 %, availability 98 %, trading realisation at the measured monthly maximum) — and surfaced rather than allowed to pass silently.

A test asserts the count of external failures equals the count of **declared** deviations, so an undeclared breach cannot hide inside the summary. A second test asserts at least one warn exists, so the split cannot become untested by drifting into all-pass.

### 7.4 The Central invariant

Central must reproduce the unpatched engine field-for-field. It is checked **in-process** — running the batch-1 portfolio entry point live in the same process against the same KV — rather than against a stored artefact, so the check measures code and never data drift. It compares every bridge line in every calendar year, every per-project total, and portfolio NPV / MOIC / payback / CAPEX.

Result: **exact, zero differing fields.** A companion test asserts a Downside run *does* differ, so the invariant has teeth rather than passing vacuously.

---

## 08 · Data lineage

### 8.1 Sources and what each one is load-bearing for

| source | used for | vintage | authority |
|---|---|---|---|
| ENTSO-E Transparency A44 | LT day-ahead hourly prices, 2015 → present | committed year files, fetched 2026-07-28 | transparency.entsoe.eu |
| ENTSO-E A68 / A75 / A65 | installed capacity, generation, load | daily live-fetch | transparency.entsoe.eu |
| BTD (Baltic Transparency Dashboard) | reserve capacity + activation clearing prices | **stale — see §8.4** | api-baltic.transparency-dashboard.eu |
| Energy-Charts (Fraunhofer ISE) | day-ahead capture path, carbon, gas | daily | energy-charts.info |
| ECB / Frankfurter | Euribor 3M | daily | sdw.ecb.europa.eu |
| NREL ATB | RTE projection, degradation baseline, CAPEX trajectory | annual | atb.nrel.gov |
| Litgrid / AST / Elering | fleet, queue, permits | daily to quarterly | TSO sites |
| Commercial registries | named entities in published content | on demand | registrucentras.lt, Lursoft, inforegister.ee |

### 8.2 Committed price history

Eleven complete calendar years plus a partial 2026 are committed to the repository as static JSON, so any dispatch or bootstrap result can be re-executed without network access. Verified against the committed files:

| year | hours | covered | coverage | negative hours | days with ≥1 negative | minimum |
|---|---:|---:|---:|---:|---:|---:|
| 2015 | 8 760 | 8 760 | 100 % | 0 | 0 | +€4.05 |
| 2016 | 8 784 | 8 784 | 100 % | 0 | 0 | +€4.02 |
| 2017 | 8 760 | 8 760 | 100 % | 0 | 0 | +€2.99 |
| 2018 | 8 760 | 8 760 | 100 % | 0 | 0 | +€1.59 |
| 2019 | 8 760 | 8 760 | 100 % | 0 | 0 | +€0.12 |
| 2020 | 8 784 | 8 784 | 100 % | 5 | 2 | −€1.73 |
| 2021 | 8 760 | 8 760 | 100 % | 5 | 2 | −€1.41 |
| 2022 | 8 760 | 8 760 | 100 % | 2 | 1 | −€0.04 |
| 2023 | 8 760 | 8 760 | 100 % | 100 | 20 | −€56.55 |
| 2024 | 8 784 | 8 784 | 100 % | 186 | 42 | −€19.96 |
| 2025 | 8 760 | 8 760 | 100 % | 178 | 44 | −€23.58 |
| 2026 YTD | 8 760 | 5 038 | 57.5 % | 61 | 14 | −€13.55 |
| **total** | | **101 470** | | **537** | **125 (2.96 %)** | |

The negative-hour column is not decoration. Zero negative hours before 2020, and better than one day in nine now: Lithuanian solar build-out did that, and it is accelerating.

### 8.3 Resolution and the PT15M transition

LT day-ahead was PT60M through **2025-09-29** and has been PT15M from **2025-10-01**. This was established by probing the source, not read off a code comment — the worker's own comment said "since Sep 2025", a month early.

Committed year files average sub-hourly source points into the hour (decision D1). Averaging discards intraday granularity and therefore **understates** achievable capture, which is the conservative direction, and the size of that understatement is itself measured (§3.5: 0.0885).

The backtest window (2025-07 → 2026-06) straddles the boundary: roughly 3 months natively hourly, 9 months quarter-hourly averaged into the hour. The measured realisation in §3.1 is therefore, if anything, a floor.

### 8.4 BTD outage, and how it is handled

BTD is the **sole** source of Baltic reserve clearing prices. ENTSO-E A84/A85/A86 return "no matching data" for LT and for the Baltic scheduling area, so there is no second source to fall back on.

The feed has been failing since **2026-07-17** (TLS handshake abort). The consequences, stated plainly:

- The deepest reserve-price series anywhere in the estate is **110 daily points**. That is why reserve realisation cannot be measured (§9.1) and why reserve prices are flat across shape-years (§4.6).
- Stored dispatch and trading KV keys stall within days of 2026-07-17, so the public realised-dispatch card serves precomputed values from that date until the feed returns.
- No client deliverable depends on the live feed: the delivery build runs against a verified KV snapshot whose capture timestamp is stamped on the cover.

### 8.5 Three day-ahead price paths, and the one that was wrong

The estate carries three independent day-ahead parsing paths. That is two too many, and it produced a live defect.

| path | feeds | status |
|---|---|---|
| Energy-Charts JSON | the capture series (`s1_capture`, rolling stats, monthly aggregation) | correct throughout |
| ENTSO-E via `parseA44` | the committed price history and every consultancy runner | correct throughout |
| ENTSO-E via `extractPrices` | the S1 signal payload on the public cards | **was broken until 2026-07-28** |

The third used the pattern `([\d.]+)` for the price amount, which cannot match a leading minus. The failure mode is worse than a lost sign: the whole XML element fails to match and is **skipped**, so a day with two negative hours yields a 94-point array instead of 96 and every subsequent index shifts.

Measured on a real day (2025-03-22, seven negative hours, trough −€11.53), the published fields were:

| field | old regex | correct | error |
|---|---:|---:|---:|
| hours returned | 17 | 24 | −7 |
| LT daily average | €11.68 | €6.78 | **+72.3 %** |
| daily swing (peak − trough) | €20.98 | €33.51 | **−37.4 %** |
| peak hour (UTC) | 16 | 19 | 3 h wrong |
| trough hour (UTC) | 11 | 12 | 1 h wrong |

The direction matters: the site **overstated the average price and understated the arbitrage swing** on exactly the days when spreads were widest — and displayed a peak hour three hours off.

The fix is one character class. It is included here rather than quietly repaired because the pattern generalises: **an input assumption that was true when written.** The regex was harmless when written (zero negative hours before 2020), became a live public-data defect somewhere around 2023, and nobody re-checked. That is the shape of defect this document's §09 exists to look for.

`/revenue` was byte-identical across the fix (54/54, asserted), and the committed price history was never affected because `parseA44` had always accepted negatives. A test now asserts the two parsers agree on the same document.

---

## 08A · The demand side, and how it reconciles to the TSOs

Every saturation number in this model divides by reserve demand. Until Phase
36.D that denominator was a single scalar with no provenance. It now derives
from the transmission system operators' own published procurement forecasts,
and this section states the mapping completely enough that a reader holding
those documents can check it.

### 8A.1 What the denominator is

**Effective Baltic reserve demand** is the common Baltic balancing-capacity
procurement target: mFRR upward + aFRR upward + FCR, for the Baltic Load
Frequency Control block. It comes from two documents authored jointly by all
three Baltic TSOs — Elering AS, AS "Augstsprieguma tīkls" and LITGRID AB:

| Component | 2026 | 2030 | 2035 | Source |
|---|---|---|---|---|
| mFRR upward (peak 4-hour cycle) | 604 | 684 | 754 | Baltic LFC block FRR dimensioning forecast 2026-2035, table 2 |
| aFRR upward (peak cycle 16-20) | 120 | 120 | 120 | same, figure 1 — flat across the horizon by construction |
| FCR (Baltic block share) | 28 | 36 | 48 | Baltic LFC block FCR dimensioning forecast 2026-2035 |
| **Effective demand** | **752** | **840** | **922** | |

The series is published annually to 2035 and grows at **2.29 %/yr**. Beyond 2035
each component continues at its own compound rate, computed from its own
published series rather than written down as a constant.

**One component is held flat instead, and the reason is physical.** FCR is not a
demand that grows with the Baltic system — it is the Baltic block's *share* of a
fixed obligation. Continental Europe sizes FCR against a 3 000 MW reference
incident and allocates it by net generation and consumption share. The published
28 → 48 MW rise is that share growing against a constant denominator, and a share
is bounded in a way an observed rate is not: continuing 6.19 %/yr to 2048 would
give 104.6 MW, implying the Baltic share of the European reference incident more
than triples. FCR is therefore held at its last published value from 2035, which
lowers 2048 demand 4.5 % against the mechanical trend. Every other component
trends. The exception is declared in the module with its reasoning, and a
component cannot be held flat without stating why.

This is the market KKME's modelled products actually clear in, and it matches
the Baltic scope of the supply numerator. It is also, as it turned out, where
the engine's long-standing `752` came from — 604 + 120 + 28 — a number that was
correctly sourced and never documented. It is now documented, and no longer
frozen at 2026.

### 8A.2 What replaced what, and why it matters

The engine previously used **935 MW**, held flat and compounded at an assumed
2 %/yr. That figure had no derivation anywhere: an undocumented literal
introduced in March 2026, kept alive by a storage-layer default being read back
into the calculation. It sat **24 % above** the TSOs' own 2026 figure and
compounded to 1 445 MW by 2048 — above every TSO-anchored series at every point.

Correcting it lowers modelled revenue. It is stated here rather than absorbed
quietly: at the reference asset the Y1 gross moves −0.06 % (2 h) and −0.40 %
(4 h), project IRR −0.7 % and −2.3 % relative. The old 2 %/yr growth guess was,
for the record, close to the TSOs' 2.29 %.

### 8A.3 Supply absorption — MW that exist but cannot bid for our revenue

Litgrid's *Lankstumo poreikių ataskaita 2026* (the Lithuanian flexibility needs
assessment, submitted to ACER 2026-07-25 under EMD Art. 19e) identifies LT
services that only batteries can provide, that are procured outside the products
KKME models. Those MW are **not** added to demand — that would flatter the ratio.
They are deducted from competing supply, because that is what they are: batteries
contracted away from the reserve pool we compete in.

| Component | Treatment | 2028 | 2030 | 2033 | 2035 |
|---|---|---|---|---|---|
| FCR (LT share) | addressable — already in the Baltic series | 14 | 18 | 23 | 25 |
| IZDR — isolated-operation reserve | **absorption** | 200 | 200 | 0 | 0 |
| GAGAP — fast active-power response | **absorption** | 154 | 154 | 354 | 354 |
| LT-PL capacity-increase service | **absorption** | 146 | 146 | 0 | 0 |
| System needs — short-term | excluded | 429 | 484 | 415 | 536 |
| Network needs — DSO | excluded | 30 | 42 | 77 | 108 |
| **Total absorption** | | **500** | **500** | **354** | **354** |

Each exclusion has a reason on the record, not a preference:

- **Short-term system needs** are the *uncovered* flexibility gap. They are by
  definition not procured through FCR, aFRR or mFRR today, and Litgrid has
  committed to a Lithuanian flexibility-market development plan by end-Q4 2026 to
  define how they will be. Counting them would model a market with no rules, no
  product and no price — and would double-count against the LFC-block series,
  which already covers what our products are procured for.
- **DSO needs** are procured by the distribution operator through manual public
  tender, and the published figure is a sum of per-node annual maxima, so it is
  not a coincident system requirement and cannot be added to one.

### 8A.4 One structural result worth stating

The fast-response requirement — IZDR plus GAGAP — is a **flat 354 MW in every
year Litgrid analyses**. What changes at 2033 is only who may sell it. IZDR is
reserved by Lithuanian law (EEĮ Art. 48(1)(3)) to the designated storage
operator, UAB "Energy cells" (200 MW / 200 MWh); every other market participant
is barred. That reservation is transitional and lapses.

So at 2033 two things happen at once: Energy Cells' 200 MW returns to the
merchant pool, **and** market-procured GAGAP rises by exactly 200 MW. Supply
+200, absorption +200, net effect zero. The total requirement never changes;
only its ownership does.

The model asserts this identity in every year, not only the four the document
publishes, so that no future simplification can merge the two components and
silently break the cancellation.

### 8A.5 Reading the source correctly

Litgrid's public summary states that the required quantity of flexible measures
grows "from 4.36 GW to 7.13 GW by 2035". That is the **total** requirement — the
`Poreikis` column of table 43. The *additional* need is the `Nepadengtas` column
of the same table: 973 / 1044 / 869 / 1023 MW.

Read as demand, the headline figure would put Lithuanian supply/demand at
0.26-0.42 — scarcity — and inflate the compression index roughly fivefold, in
the direction that flatters the model. The model records that series explicitly
as a do-not-use reading, with its reason, so the trap is refuted in the data and
not only in a document.

Two smaller notes on faithfulness to the sources:

- Litgrid's own table prints 1 519 MWh as its 2028 total where its components sum
  to 1 510. The other three years reconcile exactly. Components are treated as
  canonical and totals are computed; the 9 MWh divergence is recorded rather than
  adopted either way.
- The FCR series cross-validates across two independently authored documents: the
  Lithuanian share in the Baltic FCR forecast (14 / 18 / 23 / 25 MW at
  2028 / 2030 / 2033 / 2035) matches the flexibility assessment's own FCR row
  exactly. This is asserted, not observed once.

### 8A.6 Scope, and what is not yet covered

The demand series is Baltic; the flexibility assessment is Lithuanian. A
three-TSO composite built from national assessments would be the ideal source.
Latvia's and Estonia's assessments are mandated on the same July-2026 deadline
Lithuania met, but neither could be located at the time of writing, so neither
is used. The Baltic-block procurement series avoids the problem entirely: it is
joint, it is what is actually procured, and it needs no country-share allocation.

That matters, because the two documents cannot be reconciled by share. Litgrid's
assessment gives Lithuanian mFRR upward as 633 MW flat — 98 % of the whole Baltic
block requirement — while its aFRR upward figure of 67 MW is 56 % of the block.
Those cannot both be country shares. The Baltic FRR document explains why the
comparison is ill-posed: after synchronisation, reserve capacity may be located
in any Baltic LFC area, so the block requirement is not a sum of national ones.
No Lithuanian share is derived from these documents.

**Review cycle:** the flexibility assessment is updated every two years (next
≈ 2028); the dimensioning forecasts annually. Both are watched (§10.4), and
adoption is a human decision, never automatic.

---

## 08B · Per-service price formation

Phase 36.E1 and 36.E2. **Nothing in this section is wired into the projection path.** The modules are built, calibrated and validated behind their own seam; `/revenue` is byte-identical throughout, asserted by the 54-configuration regression gate at every commit. Wiring is 36.E6, after a continuity gate. This section is here now because the calibration is the reviewable artifact, and reviewing it before it moves a number is the point.

### 8B.1 What it replaces, and what it does not

It replaces `reservePrice(sd_ratio, base_price)` — the sigmoid S/D decay that forms reserve capacity prices in the projection, read at four sites in `computeTradingMix`.

It does **not** replace `cpiCurve()`. That distinction was checked at code level rather than inherited: `cpiCurve` is read at exactly three sites, all of them the disclosure fields `cpi_fcr/afrr/mfrr_at_cod`, and none of them reaches revenue, EBITDA or cash flow. An earlier reading of this arc had the new models displacing the cannibalisation curve; they displace the price formation instead, and the two are different functions with different consumers.

### 8B.2 The model

For each service, each direction:

```
clearing(t) = max( floor(t), k(t) × arbitrage_opportunity(t) )
```

**`arbitrage_opportunity`** is the gross day-ahead value of a MW: the daily mean of the four highest-priced hours less the four lowest, round-trip-efficiency-adjusted, expressed as an availability-equivalent €/MW/h. One implementation, shared with the cross-market evidence table.

**`k`** is the scarcity multiple — how many times the arbitrage opportunity the market pays for availability. It is calibrated as a level per market, product and regime, plus a convergence rate toward the mature-market level. It is deliberately **not** fitted as a function of supply/demand: no public German battery-fleet series exists in the evidence base, so an S/D curve would be fitted against a variable we do not hold.

**`floor`** is endogenous — see §8B.4.

### 8B.3 Why the model is anchored on arbitrage rather than on a decay curve

Because that is what the German data shows, and it contradicts the intuition the arc started from in both directions.

German FCR's capacity price did not decay. Measured over 87 months, it roughly doubled. But its **ratio** to the arbitrage opportunity fell over the same span, because the arbitrage opportunity rose faster — from €3.46/MW/h in 2019 to €18.35/MW/h in 2026. Both statements are true; they are about different quantities. A forecast that carries the nominal level forward carries a crisis-era energy price forward with it.

Two measurements make the coupling the model rests on:

| Measurement | Value | Window |
|---|---|---|
| DE FCR capacity price vs arbitrage opportunity, log correlation | **0.8373** | 2019-06 .. 2026-08, n = 87 months |
| DE FCR procured volume, first year to last | **605 → 584 MW** | 2019 .. 2026 |

Demand is flat, so no demand-growth story is available; the price moved because the marginal provider's alternative moved. German **mFRR** provides the control: its log correlation to the same series is **0.2765**, and that is the expected result — mFRR's marginal provider is usually not a battery, so its price should not track a battery's opportunity cost. A statistic that behaves differently where the mechanism differs is evidence about the mechanism.

### 8B.4 The endogenous floor, and the correction to it

The arc specified the floor as the arbitrage opportunity cost of the marginal MW, net of cycling cost. **The evidence falsifies that formula**, and it was falsified by a reproduction test failing rather than by argument: Baltic aFRR down modelled at €17.85/MW/h against €10.04 measured, because a gross floor bound the price at the full arbitrage value and the market plainly does not.

The mechanism is the one the chronological dispatch engine measures and never priced. Committing a MW to reserve does not forgo that MW's whole arbitrage — it forgoes the state-of-charge headroom the commitment reserves, and the battery keeps arbitraging around it. So the opportunity cost is a **fraction** of the gross arbitrage value, and the fraction is a property of the product and the market design:

```
floor = max( 0, displacement × arbitrage_opportunity − marginal cycling cost )
```

`displacement` is measured per market and product as the low decile of that market's own observed multiple. It has **no default in code** — the function throws without it — because an implicit 1.0 is precisely the assumption being removed.

The **marginal cycling cost** is the one genuinely new quantity, and it is new because the engine did not have it. It composes existing engine primitives rather than restating any of them: capex amortised over warranted throughput, plus the round-trip loss charged at the charging price, aged through the engine's own state-of-health and efficiency curves. The engine's levelised cost of storage is *not* used for this — it includes capital recovery over the whole project and is not a marginal cost.

### 8B.5 The PICASSO break: an explicit non-application

**No PICASSO compression is applied to the forward path, and none should be.** This is stated rather than left silent, because a reader who knows the platform accessions happened will look for them.

The break in *activation* prices cannot be measured from any market in the evidence base, because no market in it holds a usable pre-accession activation series:

| Series | Pre-accession quarter-hours | Post-accession | Accession |
|---|---:|---:|---|
| Austria aFRR | **0** | 54,117 | 2022-06-22 |
| Germany aFRR | **9** | 226,402 | 2022-06-22 |
| Austria mFRR | 49 | 5,344 | 2023-06-27 |
| Germany mFRR | 101 | 588 | 2022-10-05 |

Austria's standard-product aFRR series begins 2025-08-31 — three years and two months after its own accession. Germany's begins 2022-06-21, the day before its own.

More decisively, the Baltic accessions have already happened and are **before** our own observation window:

| Platform | Litgrid | Elering | AST |
|---|---|---|---|
| MARI | 2024-10-10 | 2024-10-10 | 2024-10-10 |
| PICASSO | 2025-03-05 | 2025-04-11 | 2025-04-11 |

The Baltic clearing series used for calibration runs 2025-10-01 to 2026-07-26 — every day of it post-accession for all three transmission system operators, and the source serves no complete day before 2025-10-01. **The structural break is therefore already inside the price level the model calibrates on.** Applying a forward compression on top would count it twice.

The same structure is expected for MARI in 36.E3 and is verified there rather than assumed here.

### 8B.6 Parameters, and how they stay honest

Every parameter is measured from the committed evidence base by `tools/consultancy/mature-markets/calibrate-price-formation.mjs`, which runs offline and writes `tools/consultancy/data/price-formation-calibration.json` carrying, per parameter, its source file, window, sample size, and — where a trend is fitted — its t-statistic.

The register binds to that artifact through a `calibration:` namespace. That is deliberate: these parameters live outside the engine until 36.E6, and binding them to the artifact keeps the register's invariant intact rather than carving an exception out of it. Re-running the calibration against refreshed evidence makes the register **drift**, which is exactly the alarm a monthly review cycle wants.

**A trend is used as a forecast driver only if |t| ≥ 2.** Where it is not, the number is recorded as descriptive and marked so that nothing downstream can pick it up. German FCR's within-regime trend (t = −1.70) is such a row.

### 8B.7 Convergence, and why nothing holds flat by default

Baltic FCR clears at roughly **2.8×** the German multiple, Baltic aFRR up at roughly **1.8×**. Carried forward unchanged, that would overstate every out-year — the flattering direction. So the young market's multiple converges exponentially toward the mature one, and the forward-projection function **requires** a convergence rate: holding a multiple flat remains available, but only as a stated choice, never by omission.

The rates:

| Service | Rate (per year) | t | Basis |
|---|---:|---:|---|
| FCR | 0.131 | −10.2 | German ex-crisis trend. Measured *across* a regime shift, so it is an upper bound on the decay a smooth model should claim; adopted because over-decaying is the conservative error for a revenue line. The within-regime alternative (0.072, t = −1.70) is descriptive only. |
| aFRR up | 0.220 | −3.08 | German within-regime trend. Statistically supported; no regime-shift caveat. |
| aFRR down | 0.217 | −2.36 | German within-regime trend. |

Baltic aFRR **down** converges *upward*: its multiple sits below Germany's, so the model raises it over time. That is stated because it looks like a sign error to anyone who reads the out-years before this paragraph.

### 8B.8 Activation, per direction, and the half that was missing

The current engine prices activation as a capacity-shaped €/MW/h with a steeper S/D curve. Activation is not that. It is energy: a quantity of MWh, called some fraction of the time, settled at an energy price. And it has been modelled **up-only**, which leaves out the direction in which a battery is paid to take energy it needed anyway.

Measured on Germany's settled activation series over 144,221 quarter-hours (2022-06-21 to 2026-08-02):

| | Up | Down |
|---|---:|---:|
| Activation rate (fraction of settlement periods) | 0.778 | **0.792** |
| Price, median (€/MWh) | 130.48 | 47.00 |
| Price, mean (€/MWh) | 174.74 | 34.65 |
| Share of periods at a negative price | 1.3 % | **22.1 %** |

Down activates as often as up. Its price distribution is different in kind, not in degree — and a negative down price means the provider is paid to charge. Down-activation is therefore valued as the charging cost it avoids, `day-ahead price − down-activation price`, **signed**, so the model can report it as a cost in the months when the down price sits above the day-ahead rather than silently flooring at zero.

### 8B.9 The one transferred input, and its range

The Baltic transparency source publishes **one** activation series per country per product, with no up/down split. So the Baltic *level* is measured and the *shape* is transferred from Germany. This is the only unmeasured input in the activation model, and it lands on the half of it that has never been modelled at all, so it carries a stated range rather than a single number:

| Split | Up price (€/MWh) | Down price (€/MWh) | Down revenue (€/MW/yr) |
|---|---:|---:|---:|
| German shape (down/up = 0.360) | 60.58 | 21.82 | **5,714** |
| Even 50/50 | 41.20 | 41.20 | **3,025** |

Both preserve the measured pooled level, so the band isolates the shape and nothing else. Down-activation revenue runs **€3,025–5,714/MW/yr** across it.

### 8B.10 Validation, with the miss reported

Tolerances were fixed before the first run, from each series' own dispersion rather than from the error the model turned out to have: ±35 % on a German annual mean, ±50 % on the Baltic window aggregate.

| Test | Result |
|---|---|
| DE FCR annual mean, 2024–2026 | PASS |
| DE FCR direction of the 2020→2026 nominal change | PASS — reproduces the rise |
| DE aFRR up/down annual mean, 2024–2025 | PASS |
| **DE aFRR up, 2026 part-year (Jan–Aug)** | **MISS — 38 % against a 35 % bar** |
| Baltic aFRR up/down, window aggregate | PASS |

The tolerance was not relaxed. The miss is pinned by its own named test in both directions, so it can neither grow nor quietly disappear. Its likely cause: the measured post-crisis decay is fitted over 38 months and 2026's realised multiple fell faster than the fit, on eight months of a market whose monthly multiple spans 0.38 to 1.65.

Because a reproduction test against the market a model was calibrated on can only prove the arithmetic round-trips, each one is paired with an invariant that no calibration can satisfy by accident: the floor never exceeds the clearing price, the floor never goes negative, the activation energy balance closes, convergence never overshoots its target, and the marginal cycling cost rises with age because the engine's efficiency and state-of-health curves say it must.

### 8B.11 What this section does not yet support

- **FCR is 4.8 % of reserve capacity revenue at Baltic procurement volumes**, not the ≤1 % the arc assumed — because Baltic FCR's multiple is the highest in the stack even though its volume (28 MW against mFRR's 604) is the smallest. It remains a rounding error; the defensible bound is 10 %, and that is the bound asserted.
- **mFRR is not modelled here.** It is 36.E3, and the German evidence already says it needs a different mechanism: its correlation to the arbitrage opportunity is 0.2765, against FCR's 0.8373.
- **No supply/demand elasticity.** The multiple is a level and a convergence rate, not a function of fleet growth, because the fleet series that would identify it is not in the evidence base.
- **The Baltic window is 10 months.** Every Baltic parameter carries that sample size, and none of them should be read as a long-run statistic yet.

---

## 09 · Known limitations

This is the honest list. Every item is a real limitation of the current model, stated with its direction of bias where that is known. An advisor finds these anyway; pre-listing them is the point.

### 9.1 Reserve realisation is assumed, not measured

**The largest remaining assumption in the model.** §3.1 measures the day-ahead component of trading realisation. The reserve component — bid acceptance, prequalification availability, activation dispatch — is carried as assumed acceptance factors.

It cannot currently be measured: BTD is the sole Baltic reserve-price source, the deepest series in the estate is 110 daily points, and the feed has been down since 2026-07-17. Measuring it needs a reserve-price and acceptance history that does not exist yet.

**Why this matters more than its position in this list suggests:** the reserve stack is 67.9 % of Y1 gross revenue. The measured portion of trading realisation covers the *smaller* part of the revenue stack.

### 9.2 Reserve prices are flat in the bootstrap

Consequence of 9.1. Capacity revenue varies between shape-years only through committable MW, never through price, so the distribution in §04 is a **day-ahead spread** and total revenue variance is larger than reported. Direction: understates variance, which flatters percentile confidence — the one place in this document where a limitation runs against conservatism.

### 9.3 A single-year realisation window

The trading-realisation measurement covers one market year. Twelve monthly observations from a single year cannot separate seasonality from trend, so the declared band is an **observed range**, not a distribution.

Mitigation in place: the remeasurement harness will not silently re-cut the model. A remeasurement that agrees refreshes the row's provenance; one that **disagrees** leaves the bound value untouched, adds a `REMEASURED at …` pointer, and records the gap in the changelog as pending an operator decision. Next year's measurement can inform the model but cannot move it.

### 9.4 P90 is outside what the primary sample resolves

Five shape-years resolve [P17, P83]. The debt-sizing percentile is reported with `resolved: false` and clamped to the sample minimum, in the payload and in every rendered table. The eleven-year sensitivity sample resolves a genuine P90 but crosses a market regime (§4.5), which is why it is a sensitivity and not the headline.

Neither sample can reach P99. That would need roughly 99 years of history.

### 9.5 Activation is modelled up-only

Committed reserve MW is assumed to be called in the **up** direction: SoC drains and the energy is bought back on the day-ahead market. Real aFRR is symmetric — a down-activation both fills the battery and is generally paid for, which is both an energy benefit and a revenue one.

The consequence is material and points one way. With the whole canonical throughput anchor treated as up-drain, and activation priced at the observed p50, the **attributed activation line comes out net negative** once its share of charging cost is assigned to it.

**That is a conservative artefact of an incomplete model, not a finding that activation destroys value, and it must not be reported as one.** It is stated in the module header and in every output file's `basis` block so it cannot travel without its caveat. The KV archive carries `afrr_up` and `afrr_dn` separately, so the asymmetry is visible in the data and simply is not modelled yet.

### 9.6 Activation is priced at a p50 of a heavily skewed distribution

Activation prices are taken at the observed median (€13.5/MWh aFRR, €14.5/MWh mFRR). The underlying distribution is heavily right-skewed — monthly means run several times higher. Using the median is the conservative choice; using a distribution is the correct one, and is not done yet.

### 9.7 The model cycles less than the observed merchant fleet

198 EFC/yr in the shipped engine since Phase 38.6a (498 before it), 219–222 EFC/yr in the hourly simulation and the closed degradation loop, against a Modo/GEM observed band of 550–720. All three routes agree the modelled asset under-cycles, and the shipped engine now under-cycles the most.

Under-cycling is conservative on revenue and optimistic on wear. Before 38.6a the shipped engine sat between the hourly simulation and the observed band, so the wear side was the conservative of the two; the net measured effect was +0.9 % relative project IRR. After 38.6a the engine sits **below** the hourly simulation, so the wear side is now the optimistic one and the offset runs the other way. The magnitude is small next to the partition's own −7.0 pp median IRR move, but the sign changed and the change is not a re-calibration — it is a consequence of allocating day-ahead energy correctly for the first time.

Two open questions, both unresolved. Whether the benchmark fleet carries a different reserve/day-ahead mix from the modelled stack, which would make the band comparison apples-to-oranges rather than the model wrong. And whether the reserve side of the throughput allocation — still at raw shares summing to 1.00 of nameplate, as though every product were committed every hour — is now the dominant remaining error in cycling, since it is the one part of the stack the partition did not touch. See §5.5.

### 9.8 The cycle governor has a second-order effect on the contracted stack

The warranty throttle suppresses merchant cycling only. But reserve commitment needs SoC headroom, and SoC is maintained by cycling — so throttling merchant cycles indirectly starves the contracted stack too.

On the reference asset against real prices the throttle never engages (219 EFC against a 730 cap), so this is latent rather than live. It is pinned by test and carried here rather than engineered around.

In the pathological case where contracted activation energy alone exceeds the warranty budget, the cap is breached **by contracted operation** and the output says so explicitly. Silently curtailing a contracted obligation to protect a warranty would be modelling a commercial decision the operator has not made.

### 9.9 A second-order dependency between an assumption and a reconciliation constant

The operating calibration constant closes the gap between two cost taxonomies — the engine's and the client's contracted 4-line stack — **at the reference asset's revenue level**. Lower the revenue and the client stack's percentage lines fall while the engine's flat lines do not, so the gap widens.

Adopting the measured trading realisation therefore moved that constant from €2.08 to €2.56 per kW/yr as a *consequence*, not a decision. It is re-derived by code and held to that derivation by test, so it cannot go silently stale — but it is a dependency nobody would find by reading either file alone, which is why it is listed here.

### 9.10 The engine-level regression gate does not cover the route layer

The 54-configuration byte-identity gate calls the engine function directly against a frozen KV fixture and never exercises the HTTP route. A change to route-level assembly can therefore break `/revenue` while the gate stays green — this happened once, and was caught by a route-level probe written afterwards.

Standing limitation: any future change to route-level assembly needs its own verification. Permanent guards were added (the KV loader is asserted to request exactly the nine documented keys, and the worker source is asserted to contain exactly two call sites), but the general limitation stands.

### 9.11 Public dispatch-card defects, logged and not yet fixed

The public dispatch card runs a separate, simpler dispatch function from the bankable engine. Two corrections shipped in this arc (round-trip efficiency accounting, and a 15-minute payload being read as 24 hourly prices). Three known defects remain, all logged:

- the reported capture spread substitutes a theoretical value when a day's arbitrage is non-positive, so a losing day can publish a healthy-looking capture figure;
- state of charge resets to 50 % at each day boundary — no cross-day continuity;
- annual revenue is daily × 365, with no seasonality or availability haircut.

None of these reaches `/revenue` or any client deliverable. They are disclosed because the card is public and a reader may compare it against the modelled numbers.

### 9.12 The forecast panel on the public dispatch card has never served a forecast

Its data source reads two fields that neither writer of that KV key ever writes — the raw hourly array is passed through a metrics function and discarded. The branch can return exactly two things, both of them "no data". Structurally dead, logged, not yet fixed.

### 9.13 Scope boundaries of the deliverable model

Not modelled, by scope rather than by oversight: debt sizing and DSCR schedules (the portfolio NPV is **pre-financing and pre-tax**), tax, capacity-market participation, grid-fee reform scenarios, curtailment risk, insurance step-changes, and any counterparty credit assessment on a contracted structure.

The portfolio NPV basis is worth stating twice because it is easy to misread: `npv_pre_financing_pre_tax` is **not** comparable with the engine's own post-tax `npv_at_wacc`. Both are carried in the output with the basis spelled out.

---

## 10 · Model governance

### 10.1 The run registry

Every runner invocation appends one line to `tools/consultancy/runs.jsonl` (committed, append-only):

```json
{"run_id":"…","timestamp":"…","runner":"…","kind":"runner","subject":"…",
 "artefact":"…","engine_git_sha":"…","input_hash":"…","output_hash":"…",
 "data_vintage":{…},"register_version":"r1.…"}
```

- **`run_id`** is a content fingerprint: `sha256(engine_git_sha ‖ input_hash ‖ output_hash)`, first 12 hex, prefixed by the runner. Reproducing a run reproduces its ID.
- **`output_hash`** is computed on the payload with volatile fields stripped (`generated_at`, `synced_at`, `fetched_at`, `timestamp`, and the run block itself). Two runs of identical inputs therefore differ **only** in their timestamps, which is what makes the reproducibility claim testable rather than decorative.
- **`data_vintage`** records what the run stood on — the KV snapshot with its capture time and verification status, or the price-history years with a hash of the price arrays themselves. A re-backfill that changes a single hour changes the vintage and therefore every run ID derived from it.
- **`engine_git_sha`** carries `-dirty` when the working tree had uncommitted changes.

Eleven runners emit through **one** funnel that stamps the payload, writes it and appends the registry line as a single operation. The bare writer they previously used was deleted rather than kept as a convenience: two ways to emit an output means one of them emits an unregistered number.

The delivery build has its own ID, derived from the run IDs it consumed plus the register version, and every artefact it emits (workbook, HTML, both PDFs, README) is registered with a hash of its own bytes under that ID. The deliverable's consistency gate asserts the document names its own run — a delivered report that cannot say which run produced it fails the build.

The committed registry begins at the batch-4 delivery build. Rehearsal runs made against a dirty tree while the tooling was being written are runs of a tool that had not shipped, and seeding a governance log with them would have made its first entries noise.

### 10.2 The assumption changelog

Every register value change appends `{date, id, old, new, reason, source, decided_by, phase, register_version}`.

`decided_by` is a **closed vocabulary of four**, because "why did this number move" has exactly four honest answers and an open text field would let the interesting one hide inside prose:

| value | meaning |
|---|---|
| `operator` | a human decision that moves delivered numbers |
| `measurement` | evidence recorded; no model value changed |
| `derived` | a consequential re-derivation forced by another change; no independent decision |
| `governance` | a change to the mechanism itself, not to an assumption |

The six founding entries split 2 measurement / 2 operator / 2 derived — which is itself informative: of the four value movements this arc produced, two were decisions and two were consequences of those decisions.

The three cutovers carry a full evidence block rather than a bare delta: the measurement window and sample, the distribution, the leakage checks, the corroborations, the declared benchmark breach, and the quantified client impact. Those are reproduced in §03 and §05 of this document.

### 10.3 Versioning

`version.id` is `r<seq>.<first 8 hex of a sha256 over every live row's {id, value, override}, sorted by id>`.

- **`seq` counts model changes, not tool invocations.** Re-stamping an unchanged register is a no-op.
- **Superseded rows are excluded** from the hash — they are provenance, not inputs, so rewording history must not present itself as the model having changed.
- **Prose is excluded.** A label or note can be improved without a version bump; a version that moved on every editorial change would train its readers to ignore it.
- **`override` is included**, because an override *is* the effective value the runner uses. A client edit changes what the model runs on.

Two gates weld the version to the content, and both can fail:

1. Schema validation **fails** when the stored hash does not describe the current content — a value that moved without a bump is an error, not a note, and the message carries the command that would authorise it.
2. The bump function **throws** when a value moved and no reason / source / attribution / phase was supplied.

So a register value cannot move silently and cannot move anonymously. Every delivered report quotes the version; the changelog up to that version is the set of assumptions that report ran on.

### 10.4 Remeasurement cycle

| parameter | cadence | on agreement | on disagreement |
|---|---|---|---|
| trading realisation | annual | provenance refreshed, nothing moves | value **unchanged**, gap logged, operator decision required |
| sub-hourly uplift | annual | as above | as above |
| live-KV market rows | every delivery build | synced from the build's KV snapshot | — |
| external benchmark bands | on publication of a new source | band updated with its citation | a breach is **declared**, never fitted away |
| project configs | per engagement | — | validation refuses a config whose declared months contradict its COD |

The asymmetry in the first two rows is the point: a remeasurement can inform the model but cannot move it. A cutover is an operator decision **every time**, not only the first time.

### 10.5 What is gated on every commit

| gate | scope |
|---|---|
| 54-configuration engine byte-identity | `/revenue` output over the full public parameter cross-product |
| route-level probe | the real `fetch` handler over the same 54, when route assembly changes |
| reconciliation harness | 133 assertions across 10 subjects |
| register binding tests | one named test per row, each asserting the register equals the code |
| register version + changelog schema | as §10.3 |
| run-registry determinism | reproducibility in both directions |
| worker diff | asserted empty when a phase declares the worker read-only |
| property tests | duration sweep 1 h→8 h, dispatch invariants across 8 760 hours |

### 10.6 Roles

There is one operator. Model changes that move delivered numbers are operator decisions, recorded as such in the changelog with the date. Everything else is either a measurement (recorded, no value moves) or a derivation (forced by a decision already taken). This document, the register and the run registry are the whole of the audit trail; there is no second set of books.

---

## Contact

UAB KKME · Kastytis Kemežys · kkme.eu

*This annex describes the engine that produced the accompanying figures — the same engine that runs the public platform, not a bespoke one built for the engagement. Where it states a limitation, that limitation applies to the accompanying numbers too.*
