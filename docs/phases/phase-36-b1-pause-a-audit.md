# Phase 36.B1 — Pause A: data audit + design verification

**Branch:** `phase-36-b1-hourly-dispatch` off `78558ee` (main).
**Status:** Pause A complete. **CHECKPOINT — awaiting operator approval before Pause B (build).**
**Baseline gate:** `regression-reference.mjs` → **54/54 byte-identical** at branch point. Nothing built yet; `git diff main -- workers/` empty.

Every claim below is empirical — a probe, a query, or a code line. Arc-doc hypotheses that
did not survive are listed in §4.

---

## 1. A.1 — Historical price-data audit

### 1.1 KV (worker namespace `323b493a…a24b`) — 1 506 keys

Full key list enumerated via `wrangler kv key list --remote`, grouped by pattern.

| Series | Keys | Resolution | First → last | Note |
|---|---|---|---|---|
| `s1_capture_history` | 1 (array of 400) | **daily** | 2025-04-26 → 2026-07-28 | `gross_2h/4h`, `net_2h/4h`, `avg_charge/discharge`, `swing`. Live. |
| `dispatch:<date>:<2h\|4h>` | 172 | **hourly + 96-ISP** | 2026-04-20 → **2026-07-14** | Full `hourly_dispatch[24]` + `isp_dispatch[96]` with SoC. **Stalled.** |
| `dispatch:<date>:<dur>:post_drr` | 172 | same | 2026-04-20 → 2026-07-14 | Post-derogation variant. **Stalled.** |
| `trading:<date>` / `:raw` | 86 + 86 | **96-ISP** | 2026-04-20 → **2026-07-14** | `capacity_prices[96]` per product (fcr/afrr up+dn/mfrr up+dn). **Stalled.** |
| `s2_btd_history` | 1 (array of 110) | **daily** | 2026-03-02 → **2026-07-17** | `fcr`, `afrr_up`, `mfrr_up` only — no down-products. **Stalled.** |
| `s2_history` | 1 (array of 90) | daily | 2026-04-04 → 2026-07-17 | **Stalled.** |
| `s1_history` | 1 (array of 90) | daily | 2026-07-14 → 2026-07-28 | Live. |
| `raw:s1:<date>` | 8 | — | 2026-07-21 → 2026-07-28 | 8-day rolling. |
| `s2_capacity_watch:<date>` | 31 | daily | 2026-06-28 → 2026-07-28 | Live. |
| `s2_rolling_180d` | 1 | aggregate | — | `{computed_at, period, products}`, no time series. |

**No hourly price series in KV exceeds 3 months, and the deepest one is daily.** The arc doc's
KV characterisation is correct.

### 1.2 VPS PostgreSQL (`89.167.124.42`, db `kkme`, 44 tables) — **not a viable history source**

This resolves Session 73's open "trailing 12m: 2 months" question definitively.

| Table | Rows | Span | Verdict |
|---|---|---|---|
| `s1_isp` (ts, zone, price_eur_mwh) | 13 615 | 2026-03-29 → 2026-07-28 | **Gapped.** LT: 4 609 rows over only **52 distinct days** in a 121-day window (~43 % coverage). SE4 52 days, PL 49 days (from 2026-05-25). Source `entsoe_a44`. |
| `s2_isp` (capacity + activation price per product) | **0** | — | **Empty.** The ISP-resolution reserve table was created and never populated. |
| `s1_daily` | 134 | 2026-03-30 → 2026-07-27 | Daily aggregate, also gapped. |
| `s2_daily` | 320 | 2026-04-02 → 2026-07-27 | 5 product/direction rows × **64 days** over a 116-day window (~55 %). |
| `backtest_snapshots` | **0** | — | Empty. |
| `revenue_trailing` | — | — | Single-row rollup, not a series. |

**Verdict:** the VPS holds a partial, gapped, ~4-month rolling accumulation. It is a *convenience
cache of ENTSO-E*, not an archive. Nothing in B1/B2/B3 should depend on it.

### 1.3 BTD (Baltic Transparency Dashboard) — **DOWN, 11 days**

```
curl …/api/v1/export?id=price_procured_reserves&start_date=2025-01-01… → status=000, 0 bytes
logs/btd.log: "Failed: Client network socket disconnected before secure TLS connection was established"
```

Parsed `logs/btd.log` (178 runs, 2026-03-02 → 2026-07-28):

- **Last run without a failure: 2026-07-17T09:00Z.**
- **17 consecutive failing runs since.**
- Failure is a **TLS handshake abort**, not an HTTP error. The worker's own code anticipates
  this (`fetch-s1.js:4877` — "BTD periodically has SSL cert issues (526)") and silently falls
  back to cached KV, so the site degrades quietly rather than alarming.

This is the direct cause of every "stalled" row in §1.1 — `dispatch:*`, `trading:*` and
`s2_btd_history` all stop within days of 2026-07-17.

**Historical depth is therefore unverifiable while the feed is down.** The arc's B3 premise
("history since ~2025 via `price_procured_reserves`") could not be tested at all.

> **⚠ Operator action, independent of this phase:** live reserve prices on kkme.eu are 11 days
> stale. Worth deciding whether that warrants a freshness banner (Phase 12.12 #2 territory).

### 1.4 ENTSO-E Transparency — **the load-bearing find**

**No registration needed. The token already exists and works.** It is provisioned as worker
secret `ENTSOE_API_KEY` (`wrangler.toml` deployment checklist step 3) and locally in
`.env.local`. The worker already calls A44 in four places, including a historical-date fetch at
`fetch-s1.js:9584`.

Probed `documentType=A44`, `in/out_Domain=10YLT-1001A0008Q`, live, this session:

| Delivery day | Price points | Resolution |
|---|---|---|
| 2015-01-01 | 46 | PT60M |
| 2018-06-01 | 46 | PT60M |
| 2022-01-01 | 48 | PT60M |
| 2024-01-01 / 2024-04-01 | 48 / 47 | PT60M |
| 2025-07-01 / 2025-09-29 | 48 / 48 | PT60M |
| **2025-09-30** | 120 | **PT15M + PT60M (both)** |
| 2025-10-01 / 2025-11-01 / 2026-01-01 | 192 / 192 / 178 | **PT15M** |

- **LT hourly DA is served back to at least 2015-01-01.** Not 2 years — **11+ years.**
- **LV** (`10YLV-1001A00074`) and **EE** (`10Y1001A1001A39I`) both return 2024 data cleanly.
- **The 15-min MTU transition is delivery day 2025-10-01**, not "Sep 2025" as the worker
  comment at `fetch-s1.js:675` states. Last all-PT60M day probed: 2025-09-29.

**Balancing data via ENTSO-E — not available for LT:**

| Probe | Result |
|---|---|
| A85 imbalance prices, LT | `No matching data found for Data item IMBALANCE_PRICES_R3 [17.1.G] (10YLT-1001A0008Q)` |
| A85, Baltic SCA `10Y1001C--00038X` | Same — no data |
| A84 prices of activated balancing energy, LT | `No matching data found … PRICES_OF_ACTIVATED_BALANCING_ENERGY_R3` |
| A86 total imbalance volumes, LT | `No matching data found … TOTAL_IMBALANCE_VOLUMES_R3` |
| A81 contracted reserves | Parameter rejection across all four businessTypes tried (A95–A98) |
| A89, A83 | Document type / combination not valid for this domain |

These are well-formed requests returning *empty*, distinct from the parameter errors — the
endpoints accept LT and hold nothing. (LV/EE A85 probes returned empty bodies, likely rate
limiting; inconclusive, and not load-bearing since LT is the target zone.)

### 1.5 Verdict table — the B2/B3 feasibility picture

| Data need | Phase | Source | Verdict |
|---|---|---|---|
| Hourly LT DA price shapes, any year | B1 | ENTSO-E A44 | ✅ **HAVE** — 2015→now, token working |
| Bootstrap shape-years (LT DA) | B2 | ENTSO-E A44 | ✅ **HAVE** — 11 years, not the 2 the arc assumed |
| LV / EE DA for later zones | B2 | ENTSO-E A44 | ✅ **HAVE** |
| Backtest window 2025-07 → 2026-06, DA side | B3 | ENTSO-E A44 | ✅ **HAVE** — but straddles the 15-min transition |
| Reserve capacity prices, sub-daily, multi-year | B2/B3 | BTD only | 🔴 **BLOCKED** — feed down; depth never verifiable while down |
| Reserve capacity prices, daily, ~4.5 months | B2 | KV `s2_btd_history` | 🟡 **PARTIAL** — 110 days, up-products only, stops 2026-07-17 |
| Reserve capacity prices, ISP, ~3 months | B1 | KV `trading:<date>:raw` | 🟡 **PARTIAL** — 86 days, stops 2026-07-14 |
| Balancing / imbalance prices, LT | B3 | ENTSO-E | 🔴 **NOT AVAILABLE** |
| Daily DA capture (reconciliation anchor) | B1 | KV `s1_capture_history` | ✅ **HAVE** — 400 days |

**Saying it loudly, as the prompt asks:** the backtest window's **DA side is fully available** —
B3 is *not* blocked on day-ahead. What is blocked is the **reserve/balancing side**: there is no
proven multi-year, sub-daily source for aFRR/mFRR/FCR prices anywhere, and the single source we
do have (BTD) is currently offline. The deepest reserve-price series in the whole estate is
**110 daily points**.

**Consequence for B3:** a measured trading realisation for **DA arbitrage** is achievable exactly
as the arc specifies. A measured realisation for the **reserve stack** is not, on current data.
B3 should be re-scoped to state that split explicitly rather than blend the two.

---

## 2. A.2 — Design verification

### 2.1 Engine location — **`tools/consultancy/lib/` (Node), decided on measurement**

Feasibility was measured, not assumed:

| Measurement | Result |
|---|---|
| `computeRevenueV7` full 20-yr projection, live KV | **16.0 ms** |
| Scalar 8760 × 20-yr hour loop (175 200 iterations) | **3.5 ms** |

Even at 100× the per-hour work of the benchmark, a 20-year hourly simulation is ~350 ms per
project-scenario. **Runtime is a non-issue on either side** — so the decision rests on
architecture, not CPU.

**Decision: `tools/consultancy/lib/dispatch.mjs`.** Reasons:

1. The precedent exists and is proven — `tools/consultancy/engine.mjs:27` already imports
   `workers/fetch-s1.js` as a clean ES module in Node. The dispatch engine gets full access to
   every canonical constant with zero duplication.
2. It makes the standing rule **true by construction rather than by testing**: with nothing
   under `workers/`, `git diff main..HEAD -- workers/` is empty, so `/revenue` byte-identity
   cannot be broken by this phase at all. Session 88's finding #2 (the 54/54 gate does not cover
   the route layer) is exactly why "provable by construction" beats "asserted by gate" here.
3. B2's bootstrap and B3's backtest are batch analytics over committed data files. They have no
   business in a request-serving worker. The worker exposing summaries later remains open and
   is a Phase 37 conversation, per the arc.

### 2.2 Reuse map (rule #4) — every quantity the dispatch engine must import, not restate

| Quantity | Canonical location (`workers/fetch-s1.js`) |
|---|---|
| RTE at BoL | `RTE_BOL = { h2: 0.82, h4: 0.83 }` — :5272 |
| RTE decay / floor | `RTE_DECAY_PP_PER_YEAR = 0.0020`, `RTE_FLOOR_DROP = 0.04`, `rteCurveFor()` — :5273, :5349 |
| SOH trajectory | `SOH_CURVE_1CD` / `_15CD` / `_2CD` + `sohYr(t, cd_total)` — :5308, :5331 |
| Cannibalisation / saturation | `cpiCurve()` :2678, `cpiCurveScenario()` :2712, `marketDecayW()` :5369, `projectFleet()` :2727 |
| Reserve product shares **and energy duration requirement** | `RESERVE_PRODUCTS` :1312 — `fcr {share .16, dur_req_h 0.5}`, `afrr {.34, 1.0}`, `mfrr {.50, 0.25}` |
| Expected activation rates | `sc.act_rate_afrr = 0.25`, `sc.act_rate_mfrr = 0.10` — :1161 |
| Energy throughput anchors | `mwh_per_mw_yr_{fcr 200, afrr 475, mfrr 125, da_2h 1100, da_4h 1500}` — :1162-1166 |
| Cycle accounting + warranty | `computeThroughputBreakdown()` :1279, `warrantyStatusFor()` :1307 (**730 EFC/yr cap**) |
| Availability | `sc.avail = 0.97` (base) — :1171 |
| Trading realisation (B3's target) | `TRADING_REALISATION.base = 0.85` — :1067 |
| Capacity-price resolution + €50/MW/h ceiling | `capPrice()` :1357 |
| Bid acceptance / market depth | `bidAcceptanceFactor()` :2668, `reservePrice()` :2645, `marketDepthFactor()` :2656 |
| **Reconciliation target (the time-allocation model)** | `computeEffectiveArbPct()` :2956, `HEADROOM_DRAG = 0.70` |
| DA price shapes | ENTSO-E A44 (new backfill) + KV `s1_capture_history` for the daily anchor |

### 2.3 Reserve-energy-reservation parameters — **they exist and are canonical**

The arc asked what the engine carries to size SoC headroom per committed MW. Answer:
`RESERVE_PRODUCTS[p].dur_req_h` — the prequalification energy requirement, **0.5 h for FCR,
1.0 h for aFRR, 0.25 h for mFRR**. Committing 1 MW of aFRR therefore requires 1.0 MWh of SoC
headroom *in each direction*; mFRR 0.25 MWh; FCR 0.5 MWh. Combined with `act_rate_*` (expected
activation fraction) and `mwh_per_mw_yr_*` (realised throughput per allocated MW-yr), the
constraint is fully parameterised from existing canonical values. **No new assumption needed.**

This matters because it is the exact constraint the time-allocation model cannot see. Today that
physics is approximated by a single scalar — `HEADROOM_DRAG = 0.70` at :2962, with the comment
"MW is blocked from trading during activation AND during idle-committed time when SoC must be
maintained". B1 replaces that scalar with the enforced hourly constraint. **That substitution is
the phase's whole reason to exist**, and the delta between them is the headline reconciliation
number.

### 2.4 Verified reconciliation baseline (reference asset, live KV)

50 MW / 100 MWh / 2 h, COD 2029-01, capex €164/kWh, `base` scenario, engine `v7.3`:

```
time_model: both_reserves_pct 0.690 · only_afrr 0.145 · only_mfrr 0.136 · neither 0.029
            effective_arb_pct 0.139 · source "dispatch_observed_30d" · trading_fraction 0.70
Y1 gross €8 375 230 = capacity €3 698 050 + activation €1 991 258 + arbitrage €2 685 922
cycles_per_year 678 EFC = fcr 16 + afrr 80.8 + mfrr 31.3 + da 550
net_mw_yr €147 154
```

The arc doc's "70 % both-reserves / 14 % arb windows / `dispatch_observed_30d`" is **confirmed
exactly** (0.690 / 0.139). Gate #3's "≈ 678 EFC" target is confirmed. These are the numbers the
hourly engine reconciles against.

### 2.5 Dispatch policy pseudocode

Written to be read by a lender's advisor — this goes verbatim into `docs/methodology-lender.md`
at B6. Conservative greedy, priority-ordered, no look-ahead beyond the day-ahead auction result.

```
INPUTS  per project: MW, MWh, dur_h = MWh/MW, POI_export_MW, POI_import_MW,
                     warranty_EFC_cap (730/yr), scenario s
        per year:    SOH(y) [sohYr], RTE(y) [rteCurveFor], CPI/saturation(y)
        per hour t:  DA_price(t)            [ENTSO-E A44]
                     reserve_cap_price(t,p) [BTD / KV trading:*]
                     reserve_avail(t,p)     [procured volumes]
                     available(t)           [planned + forced outage draw, Σ = 1 - avail]

STATE   SoC_MWh          carried across every hour AND across day boundaries
        EFC_used         running equivalent-full-cycle counter, never reset intra-year
        usable window    [SoC_min, SoC_max] = [5 %, 95 %] of MWh × SOH(y)

FOR each hour t in the chronological year:

  0. AVAILABILITY
     IF NOT available(t): commit nothing, trade nothing, carry SoC forward. NEXT.

  1. RESERVE COMMITMENT  (first priority — contracted obligations outrank merchant upside)
     FOR p IN [FCR, aFRR, mFRR]  (in prequalification-strictness order):
        MW_p  = min( MW × RESERVE_PRODUCTS[p].share,
                     reserve_avail(t,p),
                     MW − Σ MW_already_committed )
        # Energy reservation: committed MW implies SoC headroom BOTH directions.
        need_up_MWh   = MW_p × dur_req_h[p]        # to deliver an up-activation
        need_down_MWh = MW_p × dur_req_h[p]        # to absorb a down-activation
        REDUCE MW_p until  SoC − need_up   ≥ SoC_min
                     AND   SoC + need_down ≤ SoC_max
        # This is the binding constraint the allocation model cannot express.
        revenue += MW_p × reserve_cap_price(t,p) × bid_acceptance(p, S/D)

  2. EXPECTED ACTIVATION ENERGY
     FOR p IN committed products:
        E_act = MW_p × act_rate[p] × 1h            # expected, not stochastic — conservative
        SoC  -= E_act                              # up-activation drains
        revenue += E_act × activation_price(t,p)
     Enforce SoC ≥ SoC_min; if violated, the step-1 reduction was insufficient → tighten and
     re-run step 1 for this hour (converges in one pass; asserted by test).

  3. RESIDUAL DA ARBITRAGE   (merchant, on MW and SoC that reserves did not claim)
     MW_free = MW − Σ MW_committed
     headroom_up   = SoC − SoC_min − Σ need_up
     headroom_down = SoC_max − SoC − Σ need_down
     thresholds    = 25th / 75th percentile of THIS DAY's DA curve
                     (known after the auction — a real BRP knows it too; no future leakage)

     IF DA_price(t) ≤ charge_threshold AND headroom_down > 0:
         E_in = min( MW_free × 1h, POI_import_MW × 1h, headroom_down / RTE(y) )
         SoC += E_in × RTE(y)                      # loss charged ON THE CHARGE LEG, once
         cost += E_in × DA_price(t)                # negative price ⇒ negative cost, but
                                                   # capped at €0 capture (conservative)
     ELIF DA_price(t) ≥ discharge_threshold AND headroom_up > 0 AND DA_price(t) > 0:
         # Never discharge below €0 unless SoC_max forces cycling.
         E_out = min( MW_free × 1h, POI_export_MW × 1h, headroom_up )
         SoC     -= E_out
         revenue += E_out × DA_price(t)

  4. CYCLE BUDGET
     EFC_used += (E_in × RTE(y) + E_out) / (2 × MWh × SOH(y))
     IF EFC_used > throttle_band × warranty_EFC_cap:
         progressively suppress step 3 (merchant cycling) for the remainder of the year.
         Reserve obligations in step 1 are NEVER throttled — they are contracted.
     The warranty cap is never breached. It binds; it is not a warning.

  5. LEDGER
     assert SoC_min ≤ SoC ≤ SoC_max
     append hour row (SoC, MW by product, prices, revenue by line, EFC_used)

ANNUAL  assert  Σ(E_in) × RTE = Σ(E_out) + Σ(E_act)     [exact energy balance]
        assert  EFC_from_dispatch ≈ 678 ± 10 %          [vs throughput accounting]
        assert  zero constraint violations over all 8760 hours
```

**Deliberate conservatism, each of which lowers claimed revenue:** activation energy is taken at
its expected value rather than optimised against; thresholds are same-day quartiles rather than a
tuned policy; reserve MW is reduced — never the SoC reservation — when the two conflict;
negative-price charging is credited at €0 rather than as income; the cycle throttle suppresses
merchant revenue only, never contracted.

---

## 3. Revised effort estimate

| Work | Estimate | Change vs arc |
|---|---|---|
| ENTSO-E A44 backfill job + committed data files | ~0.5 d | **Pulled forward from B2** — the token works now, and B1's own validation needs real price years |
| `lib/dispatch.mjs` hour loop + constraints | ~1.5 d | as arc |
| Runner + 8760-row CSV/JSON output | ~0.5 d | as arc |
| Five validation gates + reconciliation attribution | ~1 d | as arc |
| Tests (properties, golden day, SoC continuity, negative price, throttle) | ~0.5 d | as arc |
| **Total** | **~4 days** | arc said 3-4 d — **holds**, at the top of the range |

The 15-min/hourly split (§4.5) adds risk but not much time if resolved as recommended.

---

## 4. Arc-doc premises overturned — corrections #14-#21

Rule #1, applied to the arc doc as the prompt instructs.

**#14 — The ENTSO-E token is not an operator action. It already exists and works.**
Arc: *"token by email registration — **operator action, day 1**: register at transparency@entsoe.eu … approval 24-48 h, needed by B2."* Provisioned as worker secret and in `.env.local`; verified this session serving LT DA for 2015 through 2026. **B2 is unblocked today.** No waiting.

**#15 — The available history is 11+ years, not 2. This is B2's design decision.**
Arc: *"Minimum viable history for B2: 2 complete calendar years hourly DA (2024, 2025) + partial 2026."* Actual: **2015-01-01 onward**, LT/LV/EE. This is the finding the checkpoint exists for. It materially strengthens B2 — the arc's own honesty constraint (*"N historical years is small (2-3) — percentiles beyond the sample are extrapolation"*) largely dissolves. An empirical P90 over ~11 shape-years is a defensible statistic; over 2 it is not.
*Caveat that survives:* pre-Feb-2025 years are pre-synchronisation (BRELL). The arc's own rule — pre-sync usable for **DA shape only, never balancing calibration** — now governs 10 of the 11 years. The DA-shape bootstrap gets the full sample; balancing keeps the narrow post-sync window.

**#16 — A chronological SoC dispatch simulation already exists in production.**
Arc gap table row 1 describes current state as a time-allocation model. That is true of `/revenue`, but `computeDispatchV2` (`fetch-s1.js:767`) is a real 96-ISP/day chronological simulation with SoC state, reserve allocation, DA arbitrage and a published SoC trace — it drives the public dispatch card and writes `dispatch:<date>:<dur>h` to KV daily. **B1 is not building the first one; it is building the first *bankable* one.** Rule #4 makes this urgent: without a deliberate decision, B1 creates a *third* dispatch math alongside `computeDispatchV2` and `computeRevenueV7`.

**#17 — That existing simulation has an energy-balance defect that inflates revenue, and it is public-facing.**
At `fetch-s1.js:848`, RTE is applied as a cap on discharge *power* (`maxDischarge = arbMW * rte / 4`) while SoC is decremented by the *delivered* energy (`soc -= maxDischarge / mwh`). A full cycle therefore buys 1 MWh into SoC and sells 1 MWh out of it — **the round-trip loss is never charged.** Compounding it, `arbitrage_eur_day` (:950) reports `Math.max(0, totalArbRev)`, clamping net-negative arbitrage days to zero. Both errors run one direction: overstatement. This is precisely what arc gate #2 (`Σ charge × RTE = Σ discharge`) is designed to catch — it just was never pointed at this function.
Further defects in the same function: SoC resets to 0.50 at every day boundary (:790, no cross-day continuity); `cycles_per_day_count` (:928) computes `socMax − socMin`, an SoC *range* mislabelled as a cycle count; `annual_eur = daily × 365` (:947) with no seasonality or availability haircut; no cycle budget, no outage windows, no POI limit, no negative-price rule.
**This needs an operator decision (§5).** It is out of B1's stated scope but it is a live public number.

**#18 — The 15-min MTU transition is 2025-10-01, and B3's window straddles it.**
Arc treats the B3 backtest window (2025-07 → 2026-06) as uniformly hourly DA. In fact DA is PT60M through 2025-09-29 and PT15M from 2025-10-01 — the window is ~3 months hourly, ~9 months quarter-hourly. The worker's own comment (:675) says "since Sep 2025", which is a month early. Design fork in §5.

**#19 — ENTSO-E does not carry LT balancing or imbalance data.**
Arc: *"balancing prices from BTD/ENTSO-E for the post-sync period."* The ENTSO-E half is false — A84, A85 and A86 all return "no matching data" for LT and for the Baltic SCA. **BTD is the sole source for the entire reserve stack.**

**#20 — BTD has been down for 11 days, so its historical depth remains unverified.**
Arc: *"BTD: history since ~2025 via `price_procured_reserves`; how far back the API serves is unverified."* Still unverified — and now unverifiable until the feed returns. Last clean local cron run 2026-07-17; 17 consecutive TLS failures since.

**#21 — The VPS is not a candidate history source at all.**
Arc: *"VPS PostgreSQL: depth unknown … never audited fully."* Now audited: `s2_isp` is **empty**, `s1_isp` covers 52 of 121 days, `backtest_snapshots` is empty. It is a gapped cache of data ENTSO-E serves better.

**Confirmed, not overturned:** the time-allocation characterisation (both_reserves 0.690 vs arc's 70 %; effective_arb 0.139 vs arc's 14 %; source `dispatch_observed_30d`) — exact. The 678 EFC figure — exact. `trading_realisation = 0.85` assumed with an industry range comment of 0.70-0.90 (:1066-1068) — exact. The dur_h `<= 2` / `>= 3` branch inconsistency (B5) — confirmed at :1287 vs :5352.

---

## 5. Decisions needing operator input before Pause B

**D1 — The 15-min/hourly split in B3's backtest window.**
Options: (a) run the engine hourly and average 15-min years down to hourly — **discards real intraday granularity, understates capture, therefore conservative**; (b) run natively at 15 min and expand PT60M years by repeating each hour ×4 — preserves recent granularity, but the reconciliation target (`computeRevenueV7`) is hourly-calibrated, so the comparison gets muddier; (c) run both and report the delta as a measured 15-min uplift, which would empirically test the `RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14` constant the engine currently asserts.
**Recommendation: (a) for B1's gates, and (c) as a B3 deliverable.** (a) satisfies the phase's tie-break rule (conservative = less claimed revenue) and keeps gate #1 clean; (c) turns a hardcoded 14 % into a measured number, which is exactly the B3 "evidence over assumption" thesis applied to a second assumption for near-zero extra cost.

**D2 — What to do about `computeDispatchV2` (correction #17).**
Options: (a) log it, fix nothing, B1 stays clean — the public dispatch card keeps overstating; (b) fix the energy-balance and clamp defects in a separate small commit on this branch, with `/revenue` untouched (the dispatch card is a different route, so the 54/54 gate does not cover it and a route-level probe would be needed — Session 88's finding #2 again); (c) supersede it with the B1 engine once B1 is proven, as a later phase.
**Recommendation: (a) now, (c) later.** Fixing a public-facing revenue number mid-build violates the arc's "new capability alongside" rule and would put a live-number change inside a phase whose whole risk story is "changes nothing public". Log it in DECISIONS.md, carry it to the roadmap as its own phase. **But you should know the number is wrong today.**

**D3 — B3's scope, given the reserve-data gap (§1.5).**
The arc's single `trading_realisation_measured` blends DA and reserves. On current data only the DA component is measurable. **Recommendation: split the deliverable** — a measured DA-arbitrage realisation (defensible, ships), and an explicitly *unmeasured* reserve realisation that keeps the assumed value and says so in the register. An advisor respects a stated boundary far more than a blended number that quietly leans on 110 days.

**D4 — How many bootstrap years B2 should use (follows from #15).**
Options: all ~11 (2015-2026), the post-2021 energy-crisis era (~5), or post-sync only (~1.5). More years = better statistics but includes structurally different markets (pre-BRELL-exit, pre-crisis). **Recommendation: 2021-2026 as the primary sample (6 years, post-crisis market structure), with the full 2015-2026 run reported as a sensitivity.** Decide at B2, not now — but the data availability is settled, which is what this checkpoint was for.

---

## 6. What was NOT done (Pause A is audit + design only)

No `lib/dispatch.mjs`, no runner, no backfill job, no tests, no engine changes. `git diff main --
name-only` shows only this document. `/revenue` gate re-run at branch point: **54/54 green**.
Nothing has been deployed and no worker file has been touched.
