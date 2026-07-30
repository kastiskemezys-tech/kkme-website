# Comparability — which mature market is a valid analogue for the Baltics, per service

**Phase 36.E0 · 2026-07-30 · companion to `mature-market-summary-table.md`**

Phases 36.E1-E5 cite this file instead of re-arguing analogue choice each time. Every claim here
is either computed from the committed evidence base or marked as a judgement with its reason.

The short version: **Germany is the analogue for market *mechanics*, Great Britain for decay
*shape*, Sweden for *floor level under a non-battery marginal provider*, and Australia for
*arbitrage-spread dynamics*. None of them is an analogue for Baltic market *size*, and that is
the limitation that constrains every number in the table.**

---

## 1. What makes an analogue valid, and what does not

Four properties decide whether a market's measured decay transfers to the Baltics.

| Property | Why it matters | How to check it |
|---|---|---|
| **Marginal provider technology** | The floor is the marginal provider's opportunity cost. If the marginal MW is hydro, the floor is hydro's water value; if it is a battery, the floor is arbitrage net of degradation. These are different numbers, not different estimates of one number. | `floor_to_arbitrage_ratio` in the summary table. A ratio near 1 says the marginal provider is arbitrage-constrained; well above 1 says something else sets the floor. |
| **Demand-to-fleet ratio** | Determines how fast entry can saturate. A market with 25 MW of demand saturates on the first battery; one with 2 GW absorbs a decade of build-out. | Procured volume in the table against the market's fleet. |
| **Coupling status** | A coupled market's price is set by a pan-EU merit order, not by local supply. Decay measured pre-coupling does not transfer post-coupling. | The structural-break calendar's `platform_accession` events. |
| **Supply depth from non-batteries** | The property the arc doc omits, and the one the German data turns out to hinge on (§3). Deep conventional supply floors a product regardless of demand depth. | Product-by-product price levels within one market, which controls for everything else. |

**Not** valid grounds for accepting or rejecting an analogue: absolute price level (currencies and
market designs differ), calendar year (markets are at different lifecycle stages), or total market
size on its own (size matters through the demand-to-fleet ratio, not directly).

---

## 2. Per-market verdicts

### Germany — the mechanics analogue. **Strong**, with one hard limit.

Valid for: product definitions, auction design, pay-as-bid versus pay-as-clear behaviour, the
capacity/energy split, and platform-accession effects. Germany is the only market in the base
where we hold FCR, aFRR and mFRR under one design, which is what makes the cross-product
comparison in §3 possible at all.

Invalid for: the scarcity phase. **The public data begins 2018-07-12 (aFRR/mFRR) and 2019-07-01
(FCR)** — the dates German daily auctions began. The monthly (2007→) and weekly (2011→) eras are
not served by any public bulk channel located in this phase. Every German peak in the table is a
peak *within the served window*, not a lifecycle peak.

Also invalid for: Baltic market size. German aFRR demand is ~2 020 MW and mFRR ~1 052 MW against
Baltic aFRR 120 MW and mFRR 604 MW. Germany's absorption capacity is an order of magnitude larger.

Area caveat: German aFRR/mFRR capacity exports carry Austrian and Czech control blocks (ALPACA
capacity cooperation, Czechia from September 2025) and the FCR export carries eight other
countries. Every table row is filtered to the German control block; an unfiltered series is not a
German series.

### Great Britain — the decay-shape analogue. **Strongest available.**

Valid for: the shape of a fast full lifecycle, and for revenue migration after saturation. GB is
the only market in the base with a **complete** lifecycle in the data: Dynamic Containment from its
2020-10 launch through the 2022 peak to a 2023-11 saturation, then the EAC-era reserve products
that revenue moved into. Measured peak-to-floor 24.5x for DC-low, 8.0x for DC-high, with saturation
3.1 years after launch.

Valid for: the demand-to-fleet regime the Baltics are entering. GB's DC requirement was small
relative to the battery fleet that chased it, which is structurally what Baltic FCR looks like
(25 MW of demand against a GW-scale pipeline).

Invalid for: floor level in absolute terms. GB's floors sit at 0.14-0.19 of the arbitrage
opportunity — far below the level Germany or Sweden settle at — because GB co-optimises response
and reserve in one auction, so a unit displaced from one product bids into another rather than
leaving. That mechanism does not exist in the Baltic design and the low floor should not be
transferred.

Invalid for: currency-naive comparison. GB prices are native GBP, converted at ECB monthly
averages; the 2022 sterling move is inside the series.

### Sweden — the floor-mechanism analogue. **Narrow but decisive.**

Valid for exactly one thing, and it is the thing the arc's whole floor argument needs: **evidence
that the floor moves with the marginal provider's technology.** Swedish FCR-N settles at **1.80x**
the battery arbitrage opportunity, against Germany's FCR at 0.58 and GB's DC at 0.15-0.19. The
Swedish marginal provider is hydro, whose water value is not battery arbitrage, and the floor is
correspondingly higher. That is a measured number where the arc previously had an assertion.

Invalid for: decay timing. Swedish data begins 2021-01 — before that, Mimer returns HTTP 200 with a
complete grid of zeros — so Sweden's own scarcity phase is outside the window, exactly as in
Germany.

Invalid for: FCR-D down before 2021-12. That market did not exist and its columns were published as
zeros; those rows are nulled as `no_coverage` in the committed data.

Caution: FCR-D up and down have a floor dispersion (median ÷ p10) of 4.4 and 5.0. These series
oscillate hard, so their saturation months are sensitive to the band constant. Use the sensitivity
columns, not the headline month.

### Australia — the arbitrage analogue. **Valid for E4 only.**

Valid for: spread dynamics at fleet maturity. South Australia has the longest record of high
battery penetration anywhere, and the measured spread trajectory shows the arc's two-force race
directly (§4).

**Invalid for FCAS**, and this is a scope decision rather than a finding: per-interval FCAS prices
live only in AEMO's MMSDM archive as hundreds-of-MB monthly SQL-loader ZIPs, and were not acquired.
Australia contributes no ancillary-service lifecycle to this base. E1-E3 lifecycle shape comes from
GB and DE.

Invalid for: any European market-design inference. The NEM is energy-only, 5-minute settled since
2021-10-01, with no capacity market and a different reserve architecture.

Caution: the 30-minute → 5-minute settlement change on 2021-10-01 mechanically widens any measured
spread. It is in the break calendar; spread figures are computed on hourly-collapsed prices so the
resolution change does not enter as a market change.

### Finland, Norway — **absent, with reasons.**

Finland is key-gated: `data.fingrid.fi/api/*` returns 401 on every path and no public key exists in
the portal frontend. Finnish aFRR and mFRR *procured capacity* is obtainable through ENTSO-E
(verified), but FCR-N/FCR-D is not. Unblocking is a one-minute operator action (register a free key)
and would add a second hydro-floor observation to Sweden's.

Norway is dropped by decision, not omission: `driftsdata.statnett.no/restapi/Reserves/*` returns
HTTP 200 with a zero-byte body and publishes no parameter schema. Sweden already supplies the
hydro-floor contrast, so Norway would add a fourth Nordic zone to one story.

---

## 3. The finding that changes an arc premise: supply depth, not demand depth

Arc §36.E3 states that mFRR *"saturates LAST and … why our model shows revenue migrating
FCR→aFRR→mFRR"*, on the reasoning that mFRR demand is deep relative to the current fleet.

**Germany measures the opposite ordering.** Within one market, one design, one currency and the same
months — so demand depth is the only thing that varies — the last twelve months give:

| DE product | Demand (MW) | Mean price, last 12 m (EUR/MW/h) | Floor | Floor ÷ arbitrage opportunity | Saturated? |
|---|---|---|---|---|---|
| FCR | 584 | 16.09 | 7.90 | **0.58** | 2022-11 |
| aFRR up | 2 020 | 15.15 | 5.97 | **0.39** | not reached |
| mFRR up | 1 052 | 3.34 | 1.26 | **0.09** | 2025-10 |

mFRR is the *cheapest* and the *most saturated* German product, and it is not the one with the
shallowest demand — aFRR demand is twice as large and aFRR is nowhere near its floor.

The mechanism the arc omits is that mFRR has the deepest **non-battery** supply: a 12.5-minute
full-activation time is met by gas peakers, hydro, CHP and industrial load, none of which can meet
an aFRR or FCR ramp. Depth of *competition*, not depth of *demand*, sets how far a product falls.

**Consequence for E3.** The premise "mFRR saturates last" must not be carried into the Baltic
forecast as a structural assumption. What transfers is the mechanism: a product's floor is set by
the opportunity cost of its own deepest marginal provider, and for mFRR that provider is very
unlikely to be a battery. The Baltic ordering may still differ — Baltic mFRR demand (604 MW) genuinely
dominates aFRR (120 MW), the reverse of Germany — but that has to be argued from Baltic supply
composition, not inherited from a claim the German data contradicts.

## 3b. The second premise the data contradicts: German FCR has not decayed

Arc §36.E1 expects German FCR to be the canonical collapse — *"2015 FCR ~EUR 2 500/MW/wk … FCR now
~EUR 100s/MW/wk"* — and expects Baltic FCR to reach a floor *"fast, permanently"*.

Measured, in the served window: German FCR's first segment (2019-06 to 2020-06) averages
**7.60 EUR/MW/h** and its current segment (2020-07 to 2026-07) averages **16.35**, with the last
twelve months at **16.09**. Converted to the arc's units, 16.09 EUR/MW/h is
**~EUR 2 700/MW/week** — the same order as the figure the arc cites as the 2015 *scarcity* level,
and roughly 20x the "EUR 100s/MW/wk" it cites as saturation.

The unit reading behind that number was verified twice and independently: FCR is published as
EUR/MW per product period throughout, confirmed against its own 2020-07-01 product-length change
(six 4 h prices summing to 140.42 the day after a single 24 h product at 150.30 — consistent with
per-period, and off by 6x if read as per-hour); and the 2021-10 monthly mean was recomputed by hand
from the committed rows, matching the pipeline to four decimals.

**Consequence for E1.** The "FCR collapses and stays collapsed" premise is not supported by the only
FCR series in the base. An FCR model calibrated to decay monotonically to a low floor would have
failed to reproduce Germany 2021-2026. Whatever E1 builds must be able to produce a *rising* FCR
price when demand is tight relative to qualified supply, which is what a small symmetric product in
a system shedding conventional inertia looks like. The arc's own instruction — that FCR's model must
be *right* about being small rather than tempted to inflate it — cuts both ways.

---

## 4. Spread trajectory: the two-force race is visible

Mean daily (top 4 hours − bottom 4 hours) day-ahead or spot spread, EUR/MWh, computed on
hourly-collapsed prices so resolution changes do not enter:

| Market | 2018 | 2020 | 2022 | 2024 | 2026 | 2022 → 2026 |
|---|---|---|---|---|---|---|
| DE | 34.2 | 26.4 | 159.9 | 89.0 | 172.8 | **+8 %** |
| GB | 31.8 | 31.9 | 141.6 | 59.1 | 71.3 | **−50 %** |
| SE (SE3) | 14.9 | 23.9 | 163.4 | 42.4 | 69.0 | **−58 %** |
| AU (SA1) | 94.7 | 66.7 | 244.2 | 201.9 | 140.1 | **−43 %** |

All four peak in 2022 — the gas crisis is a common shock, not a market signal, and no per-market
inference should be drawn from that year. What is informative is the divergence since:
Australia's highest-penetration region and GB's large fleet have compressed, while Germany —
adding solar faster than batteries — has not.

This is *consistent* with the arc's model of renewables widening the spread while batteries
compress it. It is **not** a calibration of the compression coefficient: that needs fleet-MW time
series per market, which this phase did not acquire. E4 must acquire installed-storage-MW per
market before fitting a per-GW coefficient, and should not fit one against these four columns alone.

---

## 5. What no market in this base can tell the Baltics

Stated plainly so E1-E5 do not reach for an analogue that is not there.

1. **Behaviour of a market whose reserve demand is ~25 MW.** The smallest product here is German
   FCR at 584 MW. Baltic FCR is an order of magnitude smaller again, and small-number effects
   (single-provider pivotality, lumpy bids, auction failure) are not observable in any series here.
2. **Post-synchronisation transition.** No market in the base has recently left an external
   synchronous area. The Baltic scarcity phase after February 2025 has no analogue.
3. **A scarcity phase measured in primary data at all.** Germany's and Sweden's public series both
   begin after their own scarcity phases. Only GB has its launch in the data, and only for DC.
4. **The compression coefficient per GW of storage.** See §4 — requires fleet data not acquired here.
5. **The effect of platform accession on activation prices, from Germany's own data.**
   *Amended by B-036 (2026-07-30), which found a settled German activation-price source — see §6.
   The original entry here read "settled activation prices for Germany" and is now too strong.*
   Settled German aFRR/mFRR activation prices **are** held, from 2022-06-21 onward. What is still
   absent is any German activation price from *before* Germany joined PICASSO: the series begins on
   the accession date itself, so Germany cannot measure its own accession break on activation
   prices. **And Austria does not supply it either** — see §6. Under a consistent product
   definition the only pre-accession activation sample anywhere in reach is 49 Austrian mFRR
   quarter-hours against 5 331 after, which is a coverage boundary and not a before/after.
   The German RAM energy exports remain what they were — statistics of the *offered* merit-order
   list, bounded by a 15 000 EUR/MWh technical limit, not the price at which energy was activated.
   They are still retained as supply-curve evidence and still given no lifecycle statistics. The
   two series must not be confused: `offer_curve_mean` is the RAM export, `vwap_activated` is the
   settled activation price.
6. **Activated volumes anywhere.** The activation source carries price only. Activation *revenue*
   is price × activated energy, and the energy side is not in this base. Activation *frequency* is
   measurable here (activated quarter-hours ÷ quarter-hours in the span); activated *energy* is not.

---

## 6. Activation prices: which market is a valid analogue, and the substitution B-036 made

Added by **B-036 (2026-07-30)**. Capacity and activation are different products with different
analogue logic, so they get separate verdicts.

**The source.** `netztransparenz.de` — the German TSOs' settlement platform, and B-036's scoping
target — publishes no settled activation-price *series*. It publishes the derived settlement price
(reBAP) and the AEP modules that build it, and its AEP-Module page states in prose that the aFRR
and mFRR VWAPs feeding AEP Modul 1 are published on the **ENTSO-E Transparency Platform** under
"Balancing/Prices of Activated Balancing Energy" — `documentType=A84`. So the settled number is
reachable, and it is the same number the German TSOs settle on: 78 of 92 priced quarter-hours on
the cross-check day equal an A84 value to the cent (details in
`docs/investigations/2026-07-30-phase-36-b036-pause-a.md` §2.4).

E0 had recorded A84 as "empty for DE". That was an **EIC-choice artefact**: Germany publishes per
TSO *control area*, not against the DE-LU bidding zone. Three of the four German TSOs publish
identical values and Amprion publishes nothing, so a probe landing on Amprion reproduces the same
false negative by a different route.

**The filter is load-bearing — it is what excludes absence-published-as-zero.**
`standard_MarketProduct=A01` looks like an optional narrowing parameter and it is not. A German
mFRR document carries four TimeSeries: two declaring the standard product, with every point
non-zero, and two declaring no product at all, which **pad every unactivated quarter-hour of the
day with a price of zero**. Dropping the filter to widen coverage admits roughly 190 fabricated
"activated at 0 EUR/MWh" quarter-hours per day per product — which would drag every mean toward
zero and report an activation frequency of 100 %. It is the Svenska kraftnät absence-as-zero trap
in a second source, and the German TSOs' own prescription ("Type of Product: **Standard**") is what
avoids it. The loader drops any zero-price row and counts it; under the filter that count is 0.

### Germany — the activation-level analogue. **Valid for level, invalid for the accession break.**

Valid for: the level and dispersion of settled aFRR activation prices in a deep,
platform-coupled market; the share of quarter-hours that activate; the frequency of negative
activation prices and of prices at the technical limit.

**Invalid for the PICASSO break.** The German series *starts* at the accession
(first rows 2022-06-21, first full day 2022-06-22 — the primary-sourced date already in the break
calendar). There is no pre-accession German segment. Any statement about what accession did to
German activation prices would be a comparison against nothing.

**Thin for mFRR.** German mFRR activation is rare in this era — of the order of tens of activated
quarter-hours per *month*, against thousands for aFRR. The series is real and it is not missing
data; it is a market fact. No mFRR activation-revenue term should carry material weight on it.

### Austria — acquired as the accession-break analogue, and it is **not one**

This entry records a correction, because the wrong version was believed for part of B-036 and it
would have produced a fabricated finding.

Austria acceded PICASSO on the **same date as Germany** (2022-06-22, primary-sourced) and a first
probe showed it serving A84 from 2021-01, which made it look like the before/after Germany cannot
supply. That probe omitted `standard_MarketProduct=A01`. **Under the standard-product definition —
the one Germany's series uses, and the one the German TSOs prescribe — Austrian publication
measures as starting 2025-08-31 for aFRR and 2023-06-12 for mFRR.** The aFRR start is three years
*after* Austria's own accession; the mFRR start is essentially *at* Austria's MARI accession
(2023-06-27). Austria has no pre-accession segment either.

Austria's apparent 2021-onward history exists only in the **undeclared-product** series, which is
also where the zero padding lives (§6, "The filter is load-bearing"). Splicing that onto the
standard-product series across the break would compare two product definitions and report the
difference as an accession effect.

**What Austria is good for:** a second market's activation level, dispersion and frequency under
the same product definition and currency. That is what it is used for.

### So: no market in this base can measure the accession effect on activation prices

Stated plainly because E2's break design depends on it. **No market in reach carries a pre-accession
activation sample large enough to calibrate a break on.** Germany's series starts at its accession.
Austria's aFRR series starts three years after its own. The one sliver that exists is Austrian
mFRR: its series begins 2023-06-13 and its MARI accession is 2023-06-27, giving **49 activated
quarter-hours before against 5 331 after** — a 0.9 % sample, which is a coverage boundary rather
than a before/after.

E0 §5 item 5 recorded the PICASSO break magnitude for **capacity** as "n=2, not n=5". For
**activation** prices there is no usable n at all. E2 must either take its activation-break
magnitude from the capacity evidence and say so, or leave the activation leg unbroken and say
that instead. It must not present an activation before/after built on 49 quarter-hours.

### Finland, Netherlands, Belgium, Czechia — measured, not acquired, as decisions

- **Finland** publishes A84 from 2021-01 for both aFRR and mFRR. Not acquired: its accession date is
  not in the break calendar, so segmenting it would violate the calendar-only rule, and its series
  shows an unexplained step (FI mFRR from ~1 420 points/month in 2024-06 to ~11 116 in 2026-06,
  which looks like a resolution change and needs its own investigation).
- **Netherlands and Belgium** serve data through 2024 and return nothing for 2026. Recorded as
  measured; not investigated, not needed.
- **Czechia** serves, with month-to-month point counts that vary by 5× and would need the same
  resolution investigation as Finland.

### The Baltics — nothing on this surface

DE, LV and EE return empty on A84 with five live positive controls in the same run. Baltic settled
activation prices are not published here.

---

## 7. Quick-reference: which market to cite per phase

| Phase | Primary analogue | Secondary | Do not cite |
|---|---|---|---|
| **E1 FCR** | DE FCR (measured, and it rises — see §3b) | SE FCR-N for the non-battery floor | Any pre-2019 German FCR figure; none is in the data |
| **E2 aFRR capacity** | DE aFRR, incl. its own PICASSO break 2022-06-22 | AT (same accession date, ENTSO-E-served) | A wide PICASSO joiner panel; it was not acquired |
| **E2 aFRR activation** | DE settled activation, 2022-06-21 → (§6) | AT 2025-08 → as a second-market level comparator | Any accession before/after on activation prices — no usable pre-accession sample exists in this base. Any German *pre*-PICASSO activation price. The RAM offer-curve export as an activation price. AT's undeclared-product series spliced across the break |
| **E3 mFRR** | DE mFRR — but see §3, the ordering premise fails | GB EAC reserve products for post-saturation migration | "mFRR saturates last" as an assumption |
| **E3 mFRR activation** | DE settled activation — but see §6, tens of activated quarter-hours per month | AT mFRR 2023-06 → | Any material mFRR activation-revenue term calibrated on this thinness |
| **E4 DA arbitrage** | AU SA1 | GB, SE3, DE for the common-shock control | A per-GW compression coefficient fitted on §4 alone |
| **E5 Intraday** | none in this base | — | anything; no intraday dataset was acquired |
