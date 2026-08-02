# Phase 36.E arc — Per-service revenue models

**Owner:** Cowork-authored 2026-07-29. Operator-owned (rule #5).
**Directive:** *"Build backend math for each of the services — how it works, how it's generating revenue, how these services changed in mature markets, how they are forecasted separately — plan for each so we'd have stronger realistic models in the future."*
**What this replaces:** today the engine applies ONE cannibalisation curve (`cpiCurve`, floored 0.30) to per-product sd_ratios — a haircut multiplier, not a market model. This arc upgrades each revenue line to a **structural price-formation model** calibrated against what actually happened in markets 5-10 years ahead of the Baltics on the same curve. That is the difference between "we assume prices decay" and "we can show you Germany's aFRR capacity price doing exactly this as its battery fleet crossed the same supply/demand threshold yours will cross in 2027."
**Sequencing:** after 36.C (reserve data lifeline) + 36.D (demand trajectories per component — this arc consumes them). The two arcs are the inputs; this one is the model.

---

## The structural insight the whole arc rests on

Every ancillary/energy service in every market follows the same lifecycle, with market-specific timing:

```
Phase 1 SCARCITY      few providers, price = scarcity rent (often 5-20× floor)
Phase 2 ENTRY         batteries arrive, price decays roughly with provider surplus
Phase 3 SATURATION    supply ≫ demand, price → FLOOR = marginal provider's opportunity cost
Phase 4 EQUILIBRIUM   price oscillates at floor; revenue migrates to the next-scarce service
```

The floor is not zero: it is the opportunity cost of the marginal battery's next-best use (energy arbitrage net of degradation) plus its activation-energy risk. Mature markets let us MEASURE the decay shape and the floor level; the Baltics let us know WHERE ON THE CURVE each service sits (mostly Phase 1-2, post-sync — which is why revenues are high and why every forecast dispute is really a dispute about decay speed). Our current CPI floor 0.30 is a crude encoding of this; the arc replaces it with per-service floors derived from opportunity cost, which the engine can compute internally — making the floor endogenous and self-consistent instead of assumed.

**The Baltic structural calendar** (PINNED at 36.E0 from primary sources — supersedes the TBD-verify draft): CE synchronisation Feb 2025 · **MARI accession 2024-10-10 (Elering, AST, Litgrid — all three)** · **PICASSO accession: Litgrid 2025-03-05, Elering + AST 2025-04-11** · 15-min MTU Oct 2025. **All accessions are PAST and partly inside the observation window** — E2/E3 must NOT stack future platform-compression on prices that are already post-accession; the break analysis is backward-looking calibration, not forward-looking scenario. Remaining future structure: DA/ID coupling deepening, offshore build-out shifting balancing needs.

---

## Arc structure

| Phase | Service | Est. |
|---|---|---|
| ~~36.E0~~ | ~~Evidence base~~ SHIPPED 2026-07-30 — corrections applied throughout this doc. Actual coverage: regelleistung 2018-07+ (not 2011); Fingrid key-gated (B-037); AU = E4 spread evidence only | done |
| **B-036** | **GATES E2/E3:** scope netztransparenz.de for settled DE aFRR/mFRR activation prices (ENTSO-E A84+A16 fallback: serves AT/FI, empty DE). Until resolved, E2/E3 have NO measured activation price — the RAM offer-curve export is NOT one | 0.5 d |
| 36.E1 | FCR model (E0-amended skeleton: supply-tightness term) | 1 d |
| 36.E2 | aFRR model (capacity + activation; accessions PAST — backward-calibrated breaks) | 2 d |
| 36.E3 | mFRR model (capacity + activation, MARI break) | 1.5 d |
| 36.E4 | DA arbitrage — spread-equilibrium model | 2 d |
| 36.E5 | Intraday model | 1 d |
| 36.E6 | Integration: per-service forecasts replace blended CPI + methodology | 2 d |

~11-12 days. Each service phase produces: (a) a mechanics document, (b) the revenue equation implemented, (c) the mature-market calibration dataset committed, (d) the per-service forecast model with endogenous floor, (e) validation vs history, (f) a methodology-lender.md section.

---

## 36.E0 — Mature-market evidence base (the foundation phase)

Acquire, commit, and normalise the public datasets that let every subsequent phase calibrate against reality:

1. **Germany (regelleistung.net)** — THE reference dataset: FCR, aFRR, mFRR capacity + energy auction results, downloadable history 2011→now. Covers the full lifecycle: scarcity (2015 FCR ~€2,500/MW/wk) → battery entry → saturation (FCR now ~€100s/MW/wk). The decay shapes and floors per product, measured over a decade.
2. **Nordics (Fingrid + Statnett + Svenska kraftnät open data)** — FCR-N/FCR-D markets: hydro-dominated price floors (different marginal provider — instructive contrast), battery entry 2022+, aFRR capacity market growth. Fingrid's open-data API is excellent.
3. **GB (NESO / public Modo summaries)** — the fastest full lifecycle on record: FFR → DC/DM/DR, saturation 2022-23 (prices −90 % in 18 months as fleet passed ~2 GW), revenue migration to wholesale/BM. The cautionary tale advisors know best — our forecast must be able to reproduce GB's shape when fed GB's inputs, or explain why the Baltics differ.
4. **Australia NEM (AEMO data + public analyses)** — FCAS lifecycle + the most mature merchant arbitrage market (Hornsdale onward): what DA/ID spread capture looks like at fleet maturity.
5. **PICASSO/MARI platform effects** — accession events of earlier joiners (AT/DE/CZ… for PICASSO): what happened to local aFRR energy prices on coupling. Public ACER/ENTSO-E reports + national regulator reviews.
6. **Baltic structural calendar** — pin every accession date + rule change from primary sources (Litgrid/AST/Elering/ACER): PICASSO/MARI target dates, coordinated Baltic auction design docs, any published derogations.
7. Normalise all of it into `tools/consultancy/data/mature-markets/` with per-dataset provenance manifests (source URL, licence, retrieval date, resolution, span) + loaders + fixture tests.

**Deliverable:** the evidence library + a cross-market summary table: per market × per service — years-to-saturation from first battery entry, peak-to-floor price ratio, floor level vs arbitrage opportunity cost, demand growth over the same window. This table is the empirical backbone for every decay parameter we will ever have to defend.

---

## 36.E1 — FCR

**Mechanics:** symmetric primary reserve, capacity-only payment (activation energy negligible — it's a frequency-proportional response, seconds-scale, ±). Baltic market is NEW post-sync; demand tiny and published (Litgrid: 14→25 MW; Baltic coordinated total TBD-verify). Procured via coordinated auctions (verify design: daily? 4h blocks like DE?).
**Revenue equation:** `R_fcr = MW_committed × hours × clearing_price × acceptance` — already structurally right in the engine; what's wrong is price formation (calibrated constant €0.36/MW/h with the €63 anomaly unresolved — 33.B.2's watch data feeds this phase).
**Mature-market evidence (E0-corrected):** the "canonical collapse" premise is DEAD — German FCR ROSE 7.60 → 16.09 €/MW/h over the served window (2018-07+); FCR price is set by supply-tightness dynamics (fleet growth vs demand growth vs cross-market opportunity cost), not a one-way decay. Swedish FCR floors set by hydro opportunity cost — provider-technology-specific floors confirmed, but **n=1** (Fingrid key declined, B-037) — every hydro-floor citation states it. Expected Baltic pattern: still floor-dominated LONG-RUN because demand is tiny (25 MW), but the path there needs the tightness term.
**Forecast model (E0-amended skeleton):** clearing price = max(endogenous floor, tightness-driven scarcity term) where the tightness term is calibrated on the DE series INCLUDING its rise — not a decay half-life. Floor = engine-computed arbitrage opportunity cost of the marginal MW (+symmetric-availability premium). FCR stays a rounding error in revenue (≤1 %) — the model's job is to be RIGHT about that, resisting any temptation to inflate it.
**Validation:** reproduce DE's FCR trajectory when fed DE inputs (fleet, demand, floor) within tolerance.

## 36.E2 — aFRR (capacity + activation) — the money phase

**Mechanics:** automatic secondary reserve, up/down asymmetric, capacity payment for availability + energy payment on activation. Baltic coordinated capacity auctions (verify design + product resolution); activation today by local merit order → **PICASSO accession replaces it with pan-EU marginal pricing on a 4-second AOF** — the single biggest structural break ahead.
**Revenue equations:** capacity `MW × h × clearing × acceptance` per direction; activation `energy_activated × activation_price` with activation-rate model per direction (current engine models up-only — B1's known limitation, fix here: down-activation is REVENUE for charging batteries, SoC-helpful, systematically underestimated today).
**Mature-market evidence:** DE aFRR capacity 2018-2024 (auction reform, battery entry, mixed-price changes — a decade of measurable decay); AT/CZ PICASSO accession effects on energy prices; NL passive-balancing contrast. Expected Baltic pattern: capacity prices carry post-sync scarcity now (measured €7-72/MW/h range in our own watch data — the 33.B.2 anomaly), decaying as fleet grows; PICASSO coupling compresses activation margins toward EU merit order ON the accession date.
**Forecast model:** capacity = scarcity-decay to endogenous floor (floor = arbitrage opportunity cost + degradation premium for reserved SoC headroom — the engine can now COMPUTE this from B1's simultaneity work); activation = rate × price with an explicit PICASSO structural break (pre/post regimes, date from the structural calendar, magnitude calibrated from earlier joiners). Demand side: 36.D's addressable trajectory (aFRR component).
**Validation:** DE reproduction test; Baltic backcast against the 33.B.2 watch series + 36.C's restored history.

> **E1/E2 AMENDMENTS (applied 2026-08-02 from the E1+E2 checkpoint — these override the text above and below wherever they conflict):**
>
> 1. **The arc's endogenous floor is FALSIFIED.** "Gross arbitrage net of cycling cost" sits ABOVE every floor in the evidence base — found by a reproduction test failing (Baltic aFRR down 17.85 modelled vs 10.04 measured), not by argument. The floor is now `displacement × arbitrage opportunity`, where `displacement` is **measured per market per product with NO default** (DE FCR 0.8675 · DE aFRR up/down 0.5433/0.4043 · Baltic FCR 1.0003 · Baltic aFRR up/down 0.2902/0.2544). **E4's spread-equilibrium floor inherits this correction** — the same "engine computes its own floor" logic was the falsified part, not the arithmetic.
> 2. **No PICASSO break is applied, and none should be.** Neither market that could show it has data on both sides of its own accession (AT: 0 pre-accession quarter-hours vs 54,117 post; DE: 9 vs 226,402), and our own Baltic clearing series starts 2025-10-01 — AFTER every Baltic accession (MARI 2024-10-10 · PICASSO Litgrid 2025-03-05 · Elering+AST 2025-04-11). **The break is already inside the level we calibrate on; applying a forward compression would double-count it.** This must appear in the methodology as an explicit non-application with its reasoning, not as a silence. **E3 inherits the same structure for MARI** — verify rather than assume, but expect the same conclusion.
> 3. **E6 replaces `reservePrice()`, not `cpiCurve()`** — verified at code level: `cpiCurve` is disclosure-only, three call sites, all `cpi_*_at_cod`, no cash path.
> 4. **German FCR's price rose AND its ratio to arbitrage fell** — both true, of different quantities. DE FCR procurement is flat (605 → 584 MW over 7 years), so no demand-growth story is available: the nominal rise is the arbitrage opportunity rising 3.46 → 18.35 €/MW/h. The tightness term is therefore about the DENOMINATOR, not about demand.
> 5. **FCR is 4.80 % of reserve-capacity revenue at Baltic volumes, not ≤1 %** (the prompt's "≤1 %" was an A8 anchor and was wrong). Baltic FCR carries the highest multiple in the stack (k = 3.03). The asserted bound is 10 %.

## 36.E3 — mFRR (capacity + activation)

**Mechanics:** manual tertiary reserve, 12.5-min FAT, largest Baltic procurement today (604 MW live). Coordinated Baltic capacity auctions; energy via local merit → **MARI accession** (same break-logic as PICASSO).
**Revenue equations:** as aFRR structurally; acceptance rates higher (0.85 live) because demand is deep relative to current fleet. **E0 amendment: "saturates last because demand is deep" is DROPPED as a premise** — the retained mechanism is that the DEEPEST MARGINAL PROVIDER sets the floor, and for mFRR that provider is usually NOT a battery (thermal/hydro/DSR opportunity costs differ). Baltic product ordering is argued from Baltic supply composition (what actually bids each product), not from demand depth. Revenue migration across products remains a model OUTPUT to validate, not an input assumption.
**Mature-market evidence:** DE mFRR (deep, slow-decay — the pattern for demand-heavy products); GB STOR/BM migration as the "where revenue goes after saturation" case.
**Forecast model:** same skeleton as aFRR with mFRR parameters + MARI break; demand from 36.D (mFRR component, including whatever GAGAP/IZDR absorption treatment 36.D decided — those interact with mFRR supply directly).
**Validation:** DE reproduction + Baltic backcast.

## 36.E4 — DA arbitrage — spread-equilibrium model

**Mechanics:** already the engine's strongest area post-36.B (hourly dispatch, measured realisation 0.7234, real shape-years). What's missing is the FORWARD spread model: today spread growth is a scenario dial (−1/+2/+3.5 %/yr) — an assumption, not a model.
**The structural model:** daily spread is driven by (a) residual-load shape (solar/wind build-out widens it — LT solar boom is live), (b) battery fleet arbitraging it away (every MWh shifted compresses the spread it captured), (c) interconnector positions. Equilibrium: spread compresses toward the marginal battery's cycling cost (LCOS-of-cycling + RTE loss) — **the same endogenous floor logic, and our engine computes its own cycling cost, so the equilibrium is self-consistent.**
**Mature-market evidence:** AU NEM (SA especially — highest battery penetration, measurable spread compression per GW added), CAISO duck-curve era, DE 2022-2026 solar-spread widening THEN battery compression beginning. The two-force race (RES widening vs battery compressing) is measurable in all three — calibrate the per-GW compression coefficient.
**Forecast model:** spread(t) = f(residual-load shape forecast [RES build-out from public NECP/TSO plans], fleet_arbitrage_capacity(t) [our own supply trajectory!], compression coefficient [mature-market calibrated], floor [engine-computed cycling cost]). Replaces the spread-growth dial in all scenarios; the dial survives only as a sensitivity override.
**Validation:** backcast LT 2021-2026 spreads (we hold the data); AU/DE reproduction directionally.

## 36.E5 — Intraday

**Mechanics:** continuous trading after DA, 15-min products, liquidity growing from a low Baltic base. Currently a measured-but-thin uplift (0.0885 on 273 days).
**Mature-market evidence:** DE ID market maturation (liquidity growth curve, battery share of ID volume, ID-DA spread statistics as fleets professionalise).
**Forecast model:** uplift(t) as a liquidity-maturation curve calibrated on DE's trajectory, bounded below by measured today, above by DE-maturity levels; explicitly second-order (it MODIFIES the arbitrage line ±10-15 %, it is not its own pillar). Kept deliberately small — over-modelling a thin market is how models lose credibility.
**Validation:** the measured 0.0885 sits on the curve's early section.

## 36.E6 — Integration + methodology

1. Per-service forecast modules replace the blended CPI in the projection path: revenue(product, year) = demand-trajectory (36.D) × price-formation (36.E1-5) × our-asset's-share model (acceptance/fleet-position — the current bid-acceptance machinery survives, now per-service).
2. **The old CPI curve is retired to a validation role:** the new per-service aggregate must reproduce old-model outputs within documented bounds at current-state inputs (continuity gate), then diverge defensibly in the out-years — the divergence IS the improvement, and it gets quantified per product per year.
3. All scenario definitions rewired to per-service parameters (decay half-lives, break dates, compression coefficients) — scenarios become "PICASSO delayed 18 months" instead of "capacity prices −25 %": structurally meaningful, client-conversational.
4. Percentiles (36.B2) rerun on the new formation models; contracted overlay (36.B4) interacts per-service (floors bind per product).
5. Reconciliation harness: per-service validation gates become permanent (DE reproduction tests run in CI at fixture scale).
6. methodology-lender.md: one section per service — mechanics, equation, evidence base with the cross-market table, forecast model, calibration, validation results, limitations. This is the chapter an advisor reads twice.
7. Client + public deltas quantified; deploy per standing rules; register/changelog rows for every new parameter with `review_cycle` tied to its data source.

---

## Standing rules (whole arc)
- **`docs/playbooks/failure-modes.md` is load-bearing for every batch prompt in this arc** — each prompt embeds the four Pause-A questions (hypothesis-vs-verified / consumer graph / silent failures / verification layer+time); CC answers them before building. Particular exposure in this arc: A5 (mature-market datasets arrive via secondary summaries — calibrate only on the primary data files), A8 (decay half-lives and floors must be MEASURED from the datasets, never anchored on this doc's illustrative figures), B5 (reproduction tests vs mature markets are mirror-class — pair with physical-invariant checks).
- Every mature-market claim above is a hypothesis (25+ corrections say so) — 36.E0 verifies against the actual datasets before any phase calibrates on them.
- Rule #3 for the structural calendar: accession dates from primary sources (ACER/ENTSO-E/TSO), never news articles.
- Rule #4: endogenous floors computed from the engine's OWN opportunity-cost machinery — one implementation, referenced per service.
- Public site + client deliverables: no number moves without quantified-delta sign-off (CP pattern from 36.D).
- Batching: E0 solo (evidence base gets its own checkpoint — dataset quality determines everything) · E1+E2 · E3+E4 · E5+E6. Checkpoints at E0 wrap and E6's continuity gate.
- Prompts authored just-in-time per batch, per sequencing discipline. This arc doc is the contract.
