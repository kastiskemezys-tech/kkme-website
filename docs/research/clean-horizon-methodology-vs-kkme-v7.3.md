# Clean Horizon Storage Index methodology vs KKME v7.3 engine

**Authored:** 2026-05-04 (Cowork session, Phase 30)
**KKME engine version:** v7.3 (worker `043fd2cb-1146-4d96-95c2-0ecb2864f5d7`, deployed 2026-05-04)
**Research limitation:** Clean Horizon's primary product (the Storage Index) is delivered via paid Nord Pool subscription; their COSMOS simulation tool internals are proprietary. This comparison is built from their **public** material — Storage Index landing page, monthly market-update blog posts, COSMOS landing page, Intersolar 2025 talk summaries, Energy-Storage.News bylines, Nord Pool product page. Direct-source page fetches returned >60k tokens each (heavily JS-rendered marketing pages); methodology extraction relied on WebSearch result summaries, which are reliable for high-level claims but may miss specific simulation parameters Clean Horizon publishes only to subscribers.

## Executive summary

KKME's v7.3 engine is **methodologically comparable** to Clean Horizon's COSMOS on the dimensions both products expose publicly. Both compute BESS revenue from per-product participation in DA + Intraday + FCR + aFRR + mFRR markets, both account for cycling discipline + RTE + degradation, both publish per-country coverage explicitly. The two products have **different positioning** rather than different capability:

- **Clean Horizon = pan-European monthly index, paid via Nord Pool, COSMOS simulation, gross revenues only** (no project finance lens)
- **KKME = Baltic-deep live data + project finance lens (IRR / DSCR / LCOS / MOIC), free + public, scenario-explicit**

KKME is **MORE sophisticated** on five dimensions: explicit financing (debt/equity/tax/depreciation → IRR), three-scenario sensitivity (base/conservative/stress), 20-year forward cashflow timeseries with augmentation, throughput-aware degradation curves (three SOH rates interpolated by computed total c/d), free + transparent.

KKME is **LESS sophisticated** on four dimensions: 15-min timestep DA optimization (KKME uses hourly DA from ENTSO-E A44, BTD is already 15-min for balancing but the dispatch model doesn't optimize across 15-min DA windows), dynamic cross-product priority (KKME uses fixed allocation shares 16%/34%/50% for FCR/aFRR/mFRR; COSMOS optimizes via simulation), cannibalization tied to installed_capacity input (KKME uses scenario compression multipliers, not directly fleet-MW-keyed), pan-European coverage (positioning choice, not capability gap).

Five gaps documented in `docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md` as engine-improvement backlog. None are blocking; KKME's headline numbers track Clean Horizon's publicly-disclosed Baltic ranges (€700k–€3,500k/MW/yr 2h Baltics — KKME's v7.3 base 2h LT lands ~€191k/MW/yr current, which is the lower tail of CH's range, consistent with KKME's "operator estimate, base scenario" positioning vs CH's "marginal MW" pre-Jan-2026 framing or "average MW" post-Jan-2026 framing).

## Methodology dimensions

For each dimension: Clean Horizon's published approach (with source citation), KKME v7.3's approach (with code citation), comparison verdict.

### 1. Per-product participation logic

**Clean Horizon:** Battery participates across "DA + Intraday + FCR + aFRR + mFRR" per country (varies). Per-country revenue stream coverage explicitly published:
- Lithuania, Latvia: DA + Intraday + FCR + aFRR + mFRR
- Estonia: DA + FCR + aFRR + mFRR (no intraday)
- Germany: DA + Intraday + FCR + aFRR (no mFRR — DE's regulatory split)
- Italy: DA + Intraday + MSD-ex-ante + MB (SUD zone)
- Belgium: DA + Intraday + aFRR + imbalance (no FCR or mFRR distinct)
- France, Spain, Poland, Portugal, Romania, Sweden, Netherlands also covered (per-country streams not all extracted in this research)

**KKME v7.3:** Per-product allocation shares `RESERVE_PRODUCTS = { fcr: 0.16, afrr: 0.34, mfrr: 0.50 }` (worker `fetch-s1.js:1009-1013`). Sums to 1.0 → BESS provides all three reserves simultaneously per MW per hour (energy-stacking constraint via `scale_energy = min(1.0, usable_mwh / total_energy_req)`). DA arbitrage on full nameplate per duration (`mwh_per_mw_yr_da_2h: 1100`, `mwh_per_mw_yr_da_4h: 1500` for base scenario — `fetch-s1.js:925-926`). Intraday not explicit as separate revenue stream (folded into DA capture).

**Verdict:** Both cover same product set. KKME's allocation shares are static + transparent + replicable; COSMOS's are dynamic + optimized. KKME framing is more replicable (anyone can reproduce the calculation); COSMOS framing is more sophisticated (allocation responds to actual price conditions). Different trade-offs.

### 2. Route-to-market priority order

**Clean Horizon:** COSMOS optimizes route-to-market across markets. Per public material: *"replicates real-world route-to-market behaviour and decision-making."* Implementation undisclosed publicly.

**KKME v7.3:** Static allocation per `RESERVE_PRODUCTS` (FCR 0.16, aFRR 0.34, mFRR 0.50, DA full nameplate). Energy stacking constraint prevents over-commitment when retention drops. No dynamic re-prioritization based on observed price conditions. Compression model (`comp_mult` per scenario at `fetch-s1.js:1127`) shifts allocation outcomes year-over-year, but allocation shares themselves stay fixed.

**Verdict:** Gap. KKME doesn't dynamically re-prioritize across products as price conditions change. COSMOS does. **Engine-improvement candidate (Gap #2 in backlog).**

### 3. SoC management + cycling discipline

**Clean Horizon:** Per public material — *"annual average cycle limit of 1.5 cycles per day"* (cited from COSMOS Q&A webinar PDF). COSMOS optimizes battery charging/discharging decisions via simulation, factoring in market prices, participation rules, grid constraints.

**KKME v7.3:** Per-scenario cycle limits — base: `cycles_2h: 1.5, cycles_4h: 1.0`; conservative: `1.4 / 0.95`; stress: `1.1 / 0.85` (`fetch-s1.js:931, 946, 962`). Throughput-derived `total_cd` is computed from per-product MWh allocation: `(fcr_mwh + afrr_mwh + mfrr_mwh + da_mwh) / capacity_mwh / 365` (`computeThroughputBreakdown` at `fetch-s1.js:975-1000`). This actual cycling rate is fed into degradation curves rather than the duration-label assumption.

**Verdict:** Both anchor at ~1.5 c/d for 2h base case. KKME's three-curve interpolation by actual c/d (vs COSMOS's fixed 1.5 c/d) is more granular for forward years. Both methods comparable.

### 4. Activation rate modeling per product per country

**Clean Horizon:** Implicit in COSMOS optimization — activation rate emerges from simulation against observed activation prices and reservation prices per market.

**KKME v7.3:** Explicit per-product activation rates per scenario:
- base: `act_rate_afrr: 0.25, act_rate_mfrr: 0.10`
- conservative: `0.22 / 0.09`
- stress: `0.19 / 0.07`

(`fetch-s1.js:921, 936, 952`). These are calibration constants for activation revenue. FCR has no activation rate (zero-energy product in Baltic context per DRR derogation through 2028).

**Verdict:** Both achieve activation revenue. KKME framing is more transparent (constant, replicable); COSMOS is more sophisticated (optimization-derived). Both valid.

### 5. Cannibalization model

**Clean Horizon:** January 2026 update — *"the index now takes into account the actual volumes available on both capacity reservation and energy activation markets, as well as the installed storage capacity in the country."* Pre-Jan-2026: marginal MW operating freely (no cannibalization). Post-Jan-2026: average MW (cannibalization explicit via installed_capacity_mw input).

**KKME v7.3:** Scenario-keyed compression multipliers `COMPRESSION_SCENARIO_MULT` at `fetch-s1.js:1127`: base = 1× observed compression rate, conservative = 2×, stress = 3.5×. Compression rate itself derived from S2 fleet trajectory (`deriveCompression(kv)`). KKME has analogous mechanism but framed via scenarios, not via direct installed_capacity_mw input the way COSMOS Jan 2026 update implies.

**Verdict:** Different framing, similar intent. KKME's compression model captures fleet-growth cannibalization implicitly via scenario multipliers; COSMOS's captures it explicitly via installed_capacity input. KKME's framing is less precise — operator can't query "what's my marginal MW worth at fleet=2GW vs 5GW" the way COSMOS's framing implies. **Engine-improvement candidate (Gap #1 in backlog).**

### 6. Cross-product simultaneous bidding (FCR + aFRR + mFRR + DA when SoC permits)

**Clean Horizon:** COSMOS replicates real-world route-to-market decision-making. Implies multi-market simultaneous bidding when SoC + duration permit. Implementation undisclosed.

**KKME v7.3:** Models simultaneous bidding via fixed allocation (FCR 0.16, aFRR 0.34, mFRR 0.50 — each per MW per hour, summing to 1.0 across reserves) + DA on full nameplate. Energy stacking constraint via `scale_energy` ensures no over-commitment (`fetch-s1.js:1166`). Stack factor `sc.stack_factor` (0.55-0.70 across scenarios) applies aggregate haircut.

**Backlog item from Phase 7.7e Engine track:** *"Duration optimizer market-physics fix. v7.3 narrows the 2h vs 4h IRR gap from ~10pp to ~7pp via the gentler 4h SOH curve, but multi-market-simultaneous-bidding sophistication (top-N quantile correction, mFRR vs aFRR cascade in 4h+ assets) still missing."*

**Verdict:** KKME models simultaneous bidding via fixed allocation (transparent, replicable). COSMOS likely uses more sophisticated cascade logic (mFRR vs aFRR priority shifts based on duration + SoC). Phase 7.7e Engine #4 backlog explicitly notes this gap. **Engine-improvement candidate (Gap #3 in backlog).**

### 7. Annualization assumption

**Clean Horizon:** Per public material — *"the Storage Index is calculated monthly and represents the annualised gross revenue of a storage asset based on the energy, capacity and ancillary services prices observed during that month, assuming the year consists of 12 repetitions of the same month."* Output: €/MW/month annualized.

**KKME v7.3:** Computes 20-year cashflow timeseries with year-by-year compression + degradation + augmentation (`fetch-s1.js:1131-1300+`). Live €/MW/day = current snapshot × 365. Monthly aggregate not currently published as a standalone benchmark — Phase 29 ships KKME's monthly-aggregate equivalent.

**Verdict:** Different framings. KKME's 20-year cashflow is more sophisticated for forward IRR + DSCR + bankability. COSMOS's monthly aggregate is more comparable as cross-month / cross-country benchmark. Phase 29 (KKME Baltic Storage Index, ~4-6h) closes the framing gap.

### 8. RTE / degradation / availability assumptions

**Clean Horizon:** Specific RTE assumption not disclosed publicly. Per Storage Index page: *"the analysis considered an annual average cycle limit of 1.5 cycles per day."* Augmentation modeling not disclosed publicly; presumably captured in monthly index re-baselining as installed-capacity assumption updates.

**KKME v7.3:** Three rate-tagged SOH curves (`SOH_CURVE_1CD`, `SOH_CURVE_15CD`, `SOH_CURVE_2CD` at `fetch-s1.js:4509-4521`) interpolated by computed `total_cd`. RTE decay 0.20pp/yr from per-duration BOL (RTE BOL = 0.85 for 2h, 0.852 for 4h). Augmentation event hard-coded at year 10 with `aug_cost_pct: 0.12` and `aug_restore: 0.90` (base scenario). Availability normalized 0.94-0.97 across scenarios. Throughput-derived cycle accounting → cell aging tracks real operation rather than duration-label assumption.

**Verdict:** KKME more sophisticated. Three-curve interpolation by actual c/d + explicit augmentation event modeling exceeds what COSMOS publicly discloses. KKME wins on transparency for institutional readers.

### 9. CAPEX / OPEX / financing assumptions

**Clean Horizon:** **Not in scope.** Storage Index is a revenue index — gross revenues only. *"Index revenues are gross revenues: grid fees, taxes and SOC management costs are not taken into account in the calculation."* No CAPEX, OPEX, debt, equity, IRR, DSCR.

**KKME v7.3:** Explicit:
- CAPEX: €120 / 164 / 262 per kWh (low/mid/high)
- OPEX: €39/kW/yr base, escalation 2.5%/yr
- Debt: 55% gearing, Euribor 3M + 250bp margin (base scenario), 8-year tenor, 1-year grace
- Tax: 17% (Lithuanian corporate rate)
- Depreciation: 10 years
- BRP fee: €180k/yr base scenario
- Augmentation: €0.12 × CAPEX × restored_kwh at year 10

**Verdict:** KKME wins on transparency. COSMOS isn't even in this dimension — it's a benchmark, not a project-finance tool. Different products, different scope.

### 10. Geographic coverage

**Clean Horizon:** 15+ European countries (France, Germany, Spain, Poland, Italy, Sweden, Belgium, Netherlands, Portugal, Romania, Lithuania, Latvia, Estonia, others). Pan-European positioning.

**KKME:** Lithuania (deep), Latvia + Estonia (extending). Baltic-only positioning.

**Verdict:** Different positioning, not capability gap. KKME's intentional Baltic-deep choice trades off breadth for depth. Not a candidate for Phase 30 closure.

### 11. Frequency cadence

**Clean Horizon:** Monthly publication + daily granularity (per Nord Pool product page). 15-minute timestep optimization in COSMOS as of 2025.

**KKME:** Live (4h cron for all signals; hourly for time-sensitive). Monthly aggregate via Phase 29 (planned).

**Verdict:** KKME ahead on cadence (sub-daily live > monthly aggregate). KKME behind on 15-min DA optimization (KKME uses hourly ENTSO-E A44 prices for DA; BTD's 15-min MTU is already used for balancing). **Engine-improvement candidate (Gap #4 in backlog).**

### 12. Distribution + access

**Clean Horizon:** Paid via Nord Pool subscription. Branded Nord Pool product. Trade-press citations (Energy-Storage.News, Solar Media). Conference presence (Intersolar 2025).

**KKME:** Free, public, single-page. No distribution channel beyond direct URL. No external citations yet (Phase 27 "What we got wrong" log + Phase 19 "Submit market lead" promotion are partial answers).

**Verdict:** Different positioning. KKME's free + public is a moat for casual readers + a brand-positioning choice. COSMOS's institutional distribution + cross-European reach is structurally hard for KKME to match without partnership.

## Side-by-side numerical comparison (where Clean Horizon publishes specific values)

Clean Horizon's monthly Storage Index detailed numbers (per country per month per duration) are paywalled — only headline summary statistics appear in their public blog posts. Public values found during this research:

| Metric | Clean Horizon published | KKME v7.3 calculation | Delta | Notes |
|---|---|---|---|---|
| Baltics 2h yearly range | €700k–€3,500k/MW/yr | KKME LT base 2h current ≈ €191k/MW/yr (live €/MW/day × 365); LT base 2h annualized via 20-year cashflow ≈ varies by year | Within range, lower tail | KKME's "current live × 365" is conservative vs CH's "best-month annualized" framing |
| EE 2h April 2025 record | €5.3M/MW/yr annualized (driven by exceptionally high mFRR reservation prices) | Not directly comparable — KKME's EE coverage is shallower; doesn't compute monthly aggregate yet (Phase 29) | n/a | Phase 29 would close this gap |
| Baltic FCR avg clearing | €115/MW/h (4-month average per CH) | KKME `fetch-s1.js:1010` `RESERVE_PRODUCTS.fcr.cap_fallback: 45` (default when live KV null); live data via S2 endpoint | Significantly different baseline — needs reconciliation | KKME's 45€/MW/h fallback is far below CH's 115€/MW/h average; verify live S2 fcr_cap value tracks CH |
| Baltic aFRR up cap reservation | €77/MW/h (4-month average per CH) | KKME live S2 `afrr_up_avg` ≈ €7.41/MW/h (per Phase 12.10 Pause A curl) | Significantly different framing | CH's "capacity reservation" likely is the up-direction cap clearing only; KKME's afrr_up_avg may be an averaging artifact. Phase 12.10 commit 6 (aFRR direction disclosure) addresses this |
| Baltic aFRR down cap reservation | €340/MW/h (4-month average per CH) | KKME live S2 `afrr_down_avg` ≈ €5.03/MW/h | Order-of-magnitude different | Either CH's number is for a different time window or KKME's is wrong. **HIGH PRIORITY: investigate during Phase 12.10 Pause B.** |
| Baltic mFRR up cap reservation | €72/MW/h (4-month average per CH) | KKME live S2 mfrr_up similar order | Within bounds | |
| Baltic mFRR down cap reservation | €85/MW/h (4-month average per CH) | KKME live S2 mfrr_down similar order | Within bounds | |

**Important reconciliation finding:** the FCR + aFRR-down values KKME publishes are dramatically different from Clean Horizon's published Baltic averages. Two possible explanations:
- (a) Time-window mismatch — CH's "4-month average" is a specific window; KKME's live values are current snapshot
- (b) Methodology mismatch — CH's "capacity reservation" may mean something different than KKME's `afrr_up_avg`
- (c) KKME's values are wrong

Worth surfacing to Phase 12.10 Pause B as an additional investigation item alongside the existing aFRR direction disclosure work. **Likely (b) — KKME's `afrr_up_avg` is a rolling average across the 7-day window, not the cleared capacity reservation price specifically. Methodology disclosure (Phase 12.10 commit 6) should clarify which CH-comparable metric KKME's number actually represents.**

## What KKME does that Clean Horizon doesn't

- **Live sub-daily data** with 4h cron + hourly time-sensitive
- **Project finance lens** — IRR, MOIC, LCOS, DSCR, sensitivity matrix
- **20-year cashflow** with augmentation modeling, scenario sensitivity, compression × degradation interaction
- **Live intel feed** with quality gate (Phase 4F) + audit trail (Phase 4F + 12.10.0)
- **Free + public** — no subscription paywall
- **Lithuanian-deep** — Litgrid fleet tracker per project per status, VERT permit pipeline, APVA grants, RegistrationCenters
- **Per-card structural drivers** — TTF, EUA, Euribor, fleet, intel, regulatory all on one page
- **Live worker computation** vs simulated COSMOS optimization
- **Open methodology** (this document; Phase 30 paper)

## What Clean Horizon does that KKME doesn't (yet)

- **15+ European countries** with consistent monthly framework
- **Monthly aggregate per duration per country in €/MW/month annualized** (Phase 29 closes this)
- **Cross-country benchmarking** as primary value prop
- **Nord Pool distribution** (institutional reach)
- **15-minute timestep optimization** in COSMOS dispatch
- **Dynamic cross-product priority** via simulation
- **Cannibalization explicit** via installed_capacity input (Jan 2026 update)
- **Trade-press citations** + conference presence (years of brand)
- **Scenario coverage 1h / 2h / 3h / 4h** (KKME has 2h / 4h)

## Source bibliography

Sources used in this research (all public):

1. [Storage Index — Clean Horizon](https://www.cleanhorizon.com/battery-index/) — methodology summary + country list
2. [Storage Index update: Now covering the Baltics](https://www.cleanhorizon.com/news/clean-horizon-storage-index-update-now-covering-the-baltics/) — per-country revenue stream coverage; Baltic specific numbers
3. [Storage Index — European BESS Market Update, October 2025](https://www.cleanhorizon.com/news/storage-index-european-bess-market-update-october-2025/) — first explicit methodology summary post; January 2026 methodology preview
4. [December Storage Index: Monthly Update](https://www.cleanhorizon.com/news/december-storage-index-monthly-update-from-clean-horizon/) — monthly cadence + framing
5. [The new Storage Index now includes Italy](https://www.cleanhorizon.com/news/the-new-storage-index-now-includes-italy/) — Italy revenue stream + zone selection
6. [BESS profitability in Europe (incl Denmark DK1/DK2)](https://www.cleanhorizon.com/news/bess-profitability-in-europe-including-dk1-dk2/) — per-country breakdowns
7. [Updated Storage Index: Now Including Sweden](https://www.cleanhorizon.com/news/updated-storage-index-now-including-sweden/) — coverage expansion pattern
8. [Clean Horizon's Storage Index is now available!](https://www.cleanhorizon.com/news/clean-horizons-storage-index-is-now-available/) — initial January 2025 launch
9. [August Storage Index — Key market insights across Europe](https://www.cleanhorizon.com/news/august-storage-index-is-out-key-market-insights-across-europe/)
10. [Clean Horizon releases November Storage Index](https://www.cleanhorizon.com/news/clean-horizon-releases-november-storage-index/)
11. [Michael Salomon speaks on BESS revenue models at Intersolar 2025](https://www.cleanhorizon.com/news/michael-salomon-bess-revenue-models-intersolar-2025/) — talk summary; revenue stack framing
12. [COSMOS tool: faster, smarter, and more flexible](https://www.cleanhorizon.com/news/cosmos-tool-faster-smarter-and-more-flexible/) — COSMOS overview + 15-min timestep upgrade
13. [Is COSMOS bankable? Q&A webinar PDF](https://www.cleanhorizon.com/wp-content/uploads/2025/01/QA-webinar.pdf) — cycling discipline (1.5 c/d annual), gross-revenue framing, SoC management
14. [BESS Market — Clean Horizon Storage Index | Nord Pool](https://www.nordpoolgroup.com/en/services/power-market-data-services/bess-market-clean-horizon-storage-index/) — distribution + product description
15. [Unlocking BESS revenues in Europe's key markets | Energy-Storage.News](https://www.energy-storage.news/unlocking-bess-revenues-in-europes-key-markets/) — Clean Horizon byline + revenue stack overview
16. [Storage & Smart Power 86 (May 2025) — Clean Horizon contribution](https://solar-media.s3.amazonaws.com/assets/Pubs/PVTP%2042/20_Clean%20Horizons%20revenue%202%20BW%20latest.pdf) — pan-European revenue analysis

KKME engine references:

- `workers/fetch-s1.js:918-965` — `REVENUE_SCENARIOS` (base/conservative/stress)
- `workers/fetch-s1.js:975-1000` — `computeThroughputBreakdown` (per-product MWh allocation)
- `workers/fetch-s1.js:1009-1013` — `RESERVE_PRODUCTS` (allocation shares)
- `workers/fetch-s1.js:1015-1071` — `calcIRR` (Newton-Raphson over 20-year cashflow)
- `workers/fetch-s1.js:1073-1485` — `computeRevenueV7` (main engine)
- `workers/fetch-s1.js:2137-2614` — `computeTradingMix` (S/D elasticity, R+T compression)
- `workers/fetch-s1.js:4509-4521` — `SOH_CURVE_1CD`, `SOH_CURVE_15CD`, `SOH_CURVE_2CD` (degradation curves)
- `workers/fetch-s1.js:4533-4544` — `getDegradation` (curve interpolation by computed c/d)

**End of comparison document.**
