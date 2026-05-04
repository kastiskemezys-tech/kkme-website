# KKME methodology

**Engine version:** v7.3
**Last updated:** 2026-05-04
**Maintainer:** UAB KKME

KKME is an independent Baltic flexibility intelligence platform. This document explains how the revenue, IRR, and dispatch numbers shown on kkme.eu are computed, what data sources back each calculation, and where our methodology differs from peer products including [Clean Horizon Storage Index](https://www.cleanhorizon.com/battery-index/) (the institutional reference for European BESS revenue benchmarking, delivered via Nord Pool).

This is a living document. Methodology changes are date-stamped at the bottom; corrections to past methodology are logged in [`docs/wrongs.md`](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/wrongs.md).

## Scope

**Geographic.** Lithuania (deep), Latvia + Estonia (extending). Baltic-region focus by design. Pan-European comparison is out of scope; readers needing 15+ country coverage should consult Clean Horizon's Storage Index via Nord Pool.

**Time horizon.** Live (sub-daily polling — 4-hour cron for all signals; hourly for time-sensitive endpoints) plus monthly aggregate (the [KKME Baltic Storage Index](https://kkme.eu/index), monthly cadence, planned).

**Asset assumed.** Generic 50 MW BESS reference asset with configurable duration (1h / 2h / 4h) and CAPEX (low / mid / high). All published numbers normalize to per-MW basis where applicable so the asset size is replaceable.

**Audience.** Project finance, developer, investor, regulator. Not retail.

## Data sources

| Source | Used for | Cadence | Authority |
|---|---|---|---|
| Litgrid | LT installed storage, intention protocols, TSO reservations, kaupikliai per substation | Daily live-fetch via VPS Python script + ENTSO-E A68; manual operator refresh for assertion-backed values | https://www.litgrid.eu/ |
| AST | LV installed storage | Manual operator refresh quarterly; live-fetch planned in Phase 12.12 | https://www.ast.lv/ |
| Elering | EE installed storage + frequency reserve cost (€74M for 2025) | Manual operator refresh quarterly; live-fetch planned in Phase 12.12 | https://elering.ee/ |
| ENTSO-E A44 | LT day-ahead prices (hourly) | Hourly | https://transparency.entsoe.eu/ |
| ENTSO-E A75 / A65 | Generation per fuel type + load per Baltic country | Hourly | https://transparency.entsoe.eu/ |
| ENTSO-E A68 | Installed capacity per production type per BZN — daily live-fetch via VPS Python script | Daily | https://transparency.entsoe.eu/ |
| BTD (Baltic Transparency Dashboard) | Balancing market clearing prices (FCR, aFRR-up, aFRR-down, mFRR-up, mFRR-down), activated bids, imbalance | 15-minute MTU | https://api-baltic.transparency-dashboard.eu/ |
| Energy-Charts (Fraunhofer ISE) | EU ETS carbon price, TTF gas day-ahead | Daily | https://energy-charts.info/ |
| ECB SDW (via Frankfurter API) | Euribor 3M, HICP, FX | Daily | https://sdw.ecb.europa.eu/ |
| NREL Annual Technology Baseline | LFP RTE projection, CAPEX trajectory benchmark, degradation curves baseline | Annual | https://atb.nrel.gov/electricity/ |
| Anthropic API | Editorial enrichment of intel feed (curation scoring, summarization) | On-demand | (internal, gated) |

All public-source data is fetched, parsed, and stored in operator-owned PostgreSQL (Hetzner VPS) with full historical record. Snapshots POST to the Cloudflare Worker for frontend serving. The pattern is auditable end-to-end: every displayed number traces to a raw source response with timestamp.

## Revenue model

KKME computes BESS revenue from per-product participation in the day-ahead market and four ancillary service products (FCR, aFRR-up, aFRR-down, mFRR-up, mFRR-down). The architecture mirrors Clean Horizon's COSMOS framework on dimensions both tools expose; see the [comparison document](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/research/clean-horizon-methodology-vs-kkme-v7.3.md) for a per-dimension verdict.

### Per-product allocation

```
RESERVE_PRODUCTS = {
  fcr:  share 16 %, dur_req 30 min
  afrr: share 34 %, dur_req 60 min
  mfrr: share 50 %, dur_req 15 min
}
```

Allocation shares sum to 100 %. The reference asset provides all three reserve products simultaneously per MW per hour, with an energy-stacking constraint that prevents over-commitment when retention drops:

```
scale_energy = min(1.0, usable_mwh / total_energy_req)
```

Day-ahead arbitrage operates on full nameplate per duration. Per-MW annual MWh through the cells from DA arbitrage:

| Scenario | 2h | 4h |
|---|---|---|
| Base | 1,100 MWh/MW/yr (≈ 1.5 c/d × 2 MWh × 365) | 1,500 MWh/MW/yr (≈ 1.03 c/d × 4 MWh × 365) |
| Conservative | 1,000 MWh/MW/yr (≈ 1.4 c/d) | 1,400 MWh/MW/yr (≈ 0.95 c/d) |
| Stress | 800 MWh/MW/yr (≈ 1.1 c/d) | 1,240 MWh/MW/yr (≈ 0.85 c/d) |

Intraday markets are not currently modeled as a separate revenue stream; intraday capture is folded into the day-ahead `s1_capture` figure where reflective.

### Per-product MWh-throughput accounting

Total cycling rate is computed from per-product MWh allocation, not assumed per duration label:

```
fcr_mwh   = (mw × 0.16) × mwh_per_mw_yr_fcr      // base: 16 % allocation × 200 MWh/MW/yr
afrr_mwh  = (mw × 0.34) × mwh_per_mw_yr_afrr     //         34 % × 475 MWh/MW/yr
mfrr_mwh  = (mw × 0.50) × mwh_per_mw_yr_mfrr     //         50 % × 125 MWh/MW/yr
da_mwh    = mw × mwh_per_mw_yr_da_{2h,4h}        // full nameplate × per-duration anchor

total_efcs_yr = (fcr_mwh + afrr_mwh + mfrr_mwh + da_mwh) / capacity_mwh
total_cd      = total_efcs_yr / 365
```

`total_cd` is the load-bearing input to degradation. Cell aging tracks actual operation rather than a duration-label assumption.

### Capacity reservation revenue

For each reserve product, capacity payment per hour × allocation × hours per year:

```
fcr_cap_revenue   = mw × 0.16 × fcr_clearing_per_mw_per_h × 24 × 365 × availability
afrr_cap_revenue  = mw × 0.34 × afrr_up_clearing_per_mw_per_h × 24 × 365 × availability  // up direction
afrr_cap_down_rev = mw × 0.34 × afrr_down_clearing_per_mw_per_h × 24 × 365 × availability  // down direction
mfrr_cap_revenue  = mw × 0.50 × mfrr_clearing_per_mw_per_h × 24 × 365 × availability
```

Clearing prices come from BTD's `price_procured_reserves` dataset, country-filtered to Lithuania (or Latvia/Estonia where relevant). Availability factor `avail = 0.94 - 0.97` per scenario captures realistic uptime against the 100 % theoretical maximum.

Note on aFRR direction: Baltic markets clear aFRR-up and aFRR-down separately. KKME's headline currently sums both directions (aFRR P50 = up + down combined) — methodology disclosure under revision in Phase 12.10. A BESS sized to provide both directions captures both revenues; a BESS provided to one direction only captures roughly half. Disclosure is in progress; readers comparing KKME to single-direction benchmarks (such as Clean Horizon's reported "aFRR Capacity Reservation average prices €77/MW/h for UP and €340/MW/h for DOWN regulation") should apply a 1:1 mapping per direction rather than KKME's combined number.

### Activation-energy revenue

Reserve products that activate (aFRR, mFRR — FCR is zero-energy in Baltic context due to DRR derogation through 2028-02) generate additional energy revenue when their reserve capacity is called for actual activation:

```
afrr_act_revenue = mw × 0.34 × act_rate_afrr × afrr_clearing × 0.55 × 24 × bal_mult × real_factor × (1 - rtm_fee)
mfrr_act_revenue = mw × 0.50 × act_rate_mfrr × mfrr_clearing × 0.75 × 24 × bal_mult × real_factor × (1 - rtm_fee)
```

Per-product activation rates per scenario:
- Base: aFRR 25 %, mFRR 10 %
- Conservative: aFRR 22 %, mFRR 9 %
- Stress: aFRR 19 %, mFRR 7 %

Activation energy unit-revenue (the 0.55 / 0.75 multipliers above) is derived from observed activation prices vs reservation prices per BTD `balancing_energy_prices` dataset.

### Day-ahead arbitrage revenue

Capture × MWh through cells × RTE × realisation × duration discount × spread multiplier:

```
da_revenue = capture_eur_mwh × spread_mult × depth_factor × rte_year × trading_real
             × da_mwh_per_mw_yr × trading_fraction × availability × deg_ratio_vs_y1 × mw
```

Where:
- `capture_eur_mwh` = rolling 30-day mean of S1 capture, computed from ENTSO-E A44 LT day-ahead prices via `s1_capture` worker function
- `spread_mult` = 1.0 base / 0.95 conservative / 0.85 stress
- `depth_factor` = `marketDepthFactor(sd_ratio)` — slope adjustment by S/D ratio (BESS pipeline-to-effective-demand ratio)
- `rte_year` = year-indexed roundtrip efficiency curve (see Degradation section)
- `trading_real` = 0.85 base / 0.81 conservative / 0.72 stress (realisation factor capturing slippage between observed prices and what a battery actually achieves)
- `trading_fraction` = output of `computeTradingMix(kv, dur_h, year, scenario, sc)` — S/D-elasticity-driven split of revenue between trading (T) and balancing reserve (R)
- `deg_ratio_vs_y1` = retention this year / retention year 1 — captures degradation effect on tradeable energy

Year-zero base capture (when KV missing): €140/MWh for 2h, €125/MWh for 4h.

### Cycle accounting + warranty status

Total annual cycles (`total_efcs_yr`) compared to standard warranty cap (730 EFC/yr) and premium tier (1,460 EFC/yr):

```
warrantyStatusFor(total_efcs_yr) =
  total_efcs_yr ≤ 730   → 'within'
  total_efcs_yr ≤ 1460  → 'premium-tier-required'
  otherwise              → 'unwarranted'
```

This is a project-finance flag operators should pay attention to: a 2h asset doing 1.8 c/d total across all products will exceed standard warranty and require negotiated premium-tier pricing.

### RTE (round-trip efficiency)

Year-indexed RTE curve per duration:

| Duration | Year 0 (BOL) | Year 17 (after 0.20 pp/yr decay × 17 yr) |
|---|---|---|
| 2h | 85.0 % | 81.6 % |
| 4h | 85.2 % | 81.8 % |

Decay rate calibrated against [NREL Annual Technology Baseline 2026 LFP RTE projection](https://atb.nrel.gov/electricity/2026/utility-scale_battery_storage) plus operator validation against published manufacturer warranty data (BYD, Samsung SDI, CATL Tier-1 published curves).

### Degradation

Three rate-tagged empirical SOH curves by computed cycling rate (`total_cd`):

- `SOH_CURVE_1CD` — 1.0 cycles/day equivalent
- `SOH_CURVE_15CD` — 1.5 cycles/day
- `SOH_CURVE_2CD` — 2.0 cycles/day

KKME interpolates between curves based on `total_cd` (the throughput-derived total cycling rate, not the duration-label assumption):

```
getDegradation(year, cd):
  if cd ≤ 1.0:
    return SOH_CURVE_1CD[year]
  if cd ≤ 1.5:
    f = (cd - 1.0) / 0.5
    return SOH_CURVE_1CD[year] × (1 - f) + SOH_CURVE_15CD[year] × f
  if cd ≤ 2.0:
    f = (cd - 1.5) / 0.5
    return SOH_CURVE_15CD[year] × (1 - f) + SOH_CURVE_2CD[year] × f
  // Beyond 2 c/d:
  slope = SOH_CURVE_2CD[year] - SOH_CURVE_15CD[year]
  return max(0.40, SOH_CURVE_2CD[year] + slope × ((cd - 2.0) / 0.5))
```

Degradation is the load-bearing input for usable_mwh year-over-year and feeds the augmentation trigger.

### Augmentation

Hard-coded at year 10 (model assumption — real augmentation events depend on supplier warranty terms). Restored to `aug_restore` × original duration:

| Scenario | aug_cost_pct | aug_restore |
|---|---|---|
| Base | 12 % of original CAPEX × restored kWh | 90 % of original duration |
| Conservative | 12 % | 88 % |
| Stress | 14 % | 83 % |

Years 11-20 retain the augmented capacity decay-adjusted from year 10.

### Cannibalization (compression)

KKME models market saturation as scenario-keyed compression multipliers on the observed compression rate:

| Scenario | Compression multiplier |
|---|---|
| Base | 1× observed (current S2 fleet trajectory) |
| Conservative | 2× observed (fleet growth doubles compression) |
| Stress | 3.5× observed (full pipeline realization) |

Maximum compression capped at 25 % per year. Compression rate itself derived from S2 fleet trajectory data via `deriveCompression(kv)`.

This is methodologically less precise than Clean Horizon's January 2026 approach (which ties compression directly to installed_storage_capacity_mw). KKME's framing is captured in the engine-improvement backlog at [Gap #1](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md#gap-1) — explicit per-MW marginal-revenue-vs-fleet-MW curve is candidate for the next engine track phase.

### Revenue floor

Even in saturated markets, BESS earns from minimum trading + minimum FCR participation:

```
REVENUE_FLOOR_PER_MW = €50,000/MW/yr
rev_gross = max(REVENUE_FLOOR_PER_MW × mw, rev_bal + rev_trd)
```

Reference: UK FFR at peak saturation cleared £40-60k/MW/yr. €50k/MW/yr is realistic for a Baltic floor scenario.

### Gross → Net revenue

```
rev_gross = max(REVENUE_FLOOR, rev_bal + rev_trd)
rtm_fee   = rev_gross × 10 % (base) / 11 % (conservative) / 13 % (stress)
brp_fee   = €180k/yr × (1 + opex_esc)^(year - 1)  // base scenario
rev_net   = rev_gross - rtm_fee - brp_fee
```

OPEX escalation: 2.5 % / 2.6 % / 3.2 % per year by scenario.

### Project finance

20-year cashflow with debt + tax + depreciation:

| Parameter | Value |
|---|---|
| CAPEX | €120 / 164 / 262 per kWh (low / mid / high) |
| Debt | 55 % gearing, Euribor 3M + 250 bp margin (base scenario), 8-year tenor, 1-year grace |
| Tax | 17 % (Lithuanian corporate rate) |
| Depreciation | 10 years straight-line |
| Augmentation | year 10 capex injection per scenario constants |

IRR computed via Newton-Raphson over 20-year cashflow with mixed-sign robustness (BESS streams turn slightly negative in mothball years 17-20 when compression × degradation pull below OPEX).

DSCR computed annually; reported as min DSCR across the debt service period.

### Live versus base year

Live `/revenue` endpoint computes both:

- **Base year revenue** (always with base-scenario parameters) — anchor against observed S1 + S2 + capture data (last 6+ months minimum required to use v7 engine; otherwise falls back to v6 with synthetic priors)
- **Live rate** — current snapshot extrapolated to annualized projection

`live_rate` shows what current-period prices imply for annual revenue; `base_year` shows what observed historical data anchors actually were.

## Comparison to Clean Horizon Storage Index

[Clean Horizon Storage Index](https://www.cleanhorizon.com/battery-index/) is the institutional benchmark for European BESS revenue, delivered via Nord Pool subscription. KKME's revenue calculation is methodologically comparable to Clean Horizon's COSMOS simulation tool on the dimensions both products expose publicly. Detailed dimension-by-dimension comparison: [`docs/research/clean-horizon-methodology-vs-kkme-v7.3.md`](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/research/clean-horizon-methodology-vs-kkme-v7.3.md).

Summary verdict per dimension:

| Dimension | KKME v7.3 | Clean Horizon COSMOS | Verdict |
|---|---|---|---|
| Per-product participation | Static allocation (FCR 16%, aFRR 34%, mFRR 50%) + DA full nameplate | Dynamic optimization | Comparable; different trade-offs |
| Route-to-market priority | Static allocation | Dynamic via simulation | KKME behind |
| SoC management + cycling | Three SOH curves interpolated by computed total c/d | 1.5 c/d annual avg, COSMOS dispatch | Comparable |
| Activation rate modeling | Explicit per-product per scenario | Implicit in optimization | Comparable, different framings |
| Cannibalization | Scenario-keyed compression multipliers | Installed-capacity-keyed (Jan 2026 update) | KKME less precise |
| Multi-market simultaneous bidding | Fixed shares + energy stacking | Cascade via optimization | KKME behind on 4h+ assets |
| Annualization | 20-year cashflow + monthly aggregate (Phase 29 planned) | Monthly aggregate annualized | Different framings, both valid |
| RTE / degradation | Three throughput-aware SOH curves; year-indexed RTE | Cycle-limit assumption | KKME more sophisticated |
| CAPEX / financing | Explicit (debt, tax, depreciation, IRR, DSCR) | Not in scope (gross revenue only) | KKME ahead — different products |
| Geographic coverage | Lithuania (deep), Latvia + Estonia (extending) | 15+ European countries | Different positioning |
| Cadence | Live (4-hour cron + hourly time-sensitive) + monthly (Phase 29 planned) | Monthly + daily granularity | KKME ahead on cadence |
| Distribution | Free + public, single-page | Paid via Nord Pool subscription | Different positioning |

## What's intentionally different

KKME ≠ Clean Horizon by design:

- **KKME is live (sub-daily)**; Clean Horizon is monthly aggregate
- **KKME is Baltic-deep**; Clean Horizon is pan-European
- **KKME is free + public**; Clean Horizon is Nord Pool subscription
- **KKME exposes project-finance metrics** (IRR, MOIC, LCOS, DSCR); Clean Horizon publishes the revenue index only
- **KKME's intel feed surfaces named developments** (Litgrid, VERT, APVA, AST, Elering); Clean Horizon's monthly market update is curated narrative
- **KKME ships methodology (this document)** as part of the public artifact; Clean Horizon's COSMOS internals are proprietary

These are positioning choices, not capability gaps. KKME and Clean Horizon serve overlapping but distinct readerships.

## What we got wrong

A public log of past calls, what happened, and what the model said is maintained at [`docs/wrongs.md`](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/wrongs.md). Each entry: date, claim, what-happened, what-model-said, lesson. Maintained on operator commitment of ~5 minutes when a forecast misses materially (3-4 entries per quarter is normal).

This is operator-side discipline. Most market-intelligence sites do not publish a wrongs log. The ones that do tend to be trusted more on first read. KKME is committed to publishing its mistakes alongside its calls.

## Engine version history

| Version | Shipped | Major change |
|---|---|---|
| **v7.3** | 2026-04-27 | Throughput-derived cycle accounting (per-product MWh/MW/yr from FCR/aFRR/mFRR/DA); three rate-tagged empirical SOH curves at 1 / 1.5 / 2 c/d interpolated by computed actual c/d; per-duration RTE BOL; `cycles_breakdown` + `warranty_status` + `engine_calibration_source` payload fields; `calcIRR` mixed-sign robustness |
| v7.2 | 2026-04-27 | LCOS (€/MWh-cycled), MOIC, duration optimizer (irr_2h vs irr_4h delta), assumptions panel surfaced |
| v7 (final) | 2026-04 | Probe-driven calibration framework — engine probes synthetic-KV against documented expectations + production-KV at runtime |
| v6 | (earlier) | Initial scenario framework (3 scenarios with per-parameter delta) |

Detailed change rationale per version: [docs/handover.md](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/handover.md) Sessions 19-22.

## Calibration

KKME's engine constants (CAPEX trajectory, RTE BOL + decay, cycle limits, augmentation cost + restore, OPEX, debt margin, BRP fee) are calibrated against:

- [NREL Annual Technology Baseline 2026](https://atb.nrel.gov/electricity/2026/utility-scale_battery_storage) for LFP technology baseline (RTE BOL, RTE decay, CAPEX trajectory, degradation curves)
- Public manufacturer warranty data — BYD, Samsung SDI, CATL — for warranty cap thresholds
- Operator overlay from public market research and project-level diligence in the Baltic region

Calibration is reviewed quarterly; next review: **2026-Q3** (post-Litgrid 6-month PICASSO data; next supplier price refresh). Engine constants are explicit in `workers/fetch-s1.js` `REVENUE_SCENARIOS` and replicable.

## Updates + corrections

Methodology updates published as date-stamped entries below. Corrections to past methodology issued via [the wrongs log](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/wrongs.md).

### 2026-05-04 — Initial publication

This document published as part of Phase 30 (Clean Horizon methodology reverse-engineering + KKME engine gap analysis). KKME's engine has been operating per these methods since v7.3 deployed 2026-04-27; this is the first public methodology paper documenting them at peer-comparable rigor.

Companion documents:

- [Clean Horizon methodology vs KKME v7.3](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/research/clean-horizon-methodology-vs-kkme-v7.3.md) — per-dimension comparison
- [KKME engine improvements from Clean Horizon comparison](https://github.com/kastiskemezys-tech/kkme-website/blob/main/docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md) — gap closure backlog with five identified items + priority ranking

Engine improvements derived from Clean Horizon comparison (from above):

1. **P2 medium**: explicit cannibalization — per-MW marginal-revenue-vs-fleet-MW curve (replaces scenario-keyed compression with continuous fleet-MW-keyed function)
2. **P3 medium**: dynamic cross-product priority (route-to-market optimization)
3. **P3 medium**: multi-market simultaneous bidding sophistication (mFRR vs aFRR cascade in 4h+ assets)
4. **P3 low-medium**: 15-minute timestep DA optimization
5. **P1 critical**: reconcile KKME's aFRR / FCR cap-reservation values with Clean Horizon's published Baltic averages — investigation surfaced in research, scoped into Phase 12.10 Pause B follow-up

Gaps will close as engine track work progresses. Updates to this document will be issued as each gap closes.

---

## Contact

Questions or methodology challenges: [Get in touch](https://kkme.eu/#conversation). All correspondence treated as input to the wrongs log if it identifies a real methodology issue.

**End of methodology document.**
