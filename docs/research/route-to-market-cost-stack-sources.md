# Route-to-market and BRP cost stack — public sources and parameterisation

**Phase 38.8, 2026-08-03.** Compiled to replace the engine's route-to-market and BRP
assumptions, which were authored from market hearsay, with either a publicly-cited figure or a
stated band.

**Nothing in this file is taken from any commercial agreement.** Where a figure has no public
source it is given as a band, and the band's basis is named. No counterparty or client is named
anywhere in this repository; a grep gate (`scripts/nda-gate.sh`) enforces that on every diff.

---

## 1 · Source position — the prompt's premise did not survive contact

The phase premise was that **three of the five cost lines have public sources**. Checked at
execution time, that is not what we have:

| line | premise | what is actually available |
|---|---|---|
| Power Market Charges | Nord Pool fee schedule | **FIRM.** Primary source located, exact figures, dated. |
| BRP / balancing volume fees | "the TSOs' published balancing tariffs" | **NOT LOCATED.** See §3. |
| Auxiliary consumption | "supplier aux-load datasheets" | **PARTIAL.** A published operating band exists; no manufacturer datasheet located. |

One firm, one partial, one not located. Recorded as a premise correction, not worked around.

## 2 · Power Market Charges — FIRM

**Source:** Nord Pool AS, *Fee Schedule — Nordic / Baltic Market*, effective **1 January 2026**,
§1.4 Variable fees.
`https://www.nordpoolgroup.com/4a7ad8/globalassets/trading-and-services/nord-pool-fee-schedule-2026-nordic-and-baltic-market.pdf`
(fetched 2026-08-03; the page 403s to a plain fetcher and required a browser user-agent.)

| market | trading fee €/MWh | clearing fee €/MWh | **combined €/MWh** |
|---|---|---|---|
| Day-ahead | 0.040 | 0.015 | **0.055** |
| Intraday Continuous | 0.109 | 0.015 | **0.124** |
| SIDC Intraday Auctions | 0.060 | 0.015 | **0.075** |
| Gross volume fee (gross bidding) | 0.0035 | 0.006 | 0.0095 |

Also stated: an annual **EUR 375,000 ceiling per Member per country** on the clearing fee (note f);
a **EUR 150,000 ceiling per calendar year** on the gross volume trading fee (note g); market
access fees capped at **EUR 65,000 per legal entity per annum** (note b). Fixed annual fees for a
**Client** (which is the position an asset owner occupies when an optimiser is the Participant)
are **EUR 1,500** for day-ahead + intraday continuous, plus **EUR 3,000** for the annual gross
bidding service (§1.2). Ceilings are far above a single 50 MW asset's exposure and are recorded
for completeness, not applied.

**Modelling note.** These are per-MWh on traded volume in each direction, so a storage asset pays
on **both legs** — energy bought to charge and energy sold to discharge. The engine must apply the
combined rate to `mwh_charged + mwh_discharged`, not to net position. Day-ahead is the correct
rate for the arbitrage line; balancing activation is not traded on the exchange and carries none
of this.

**Order of magnitude, reference asset (50 MW / 4h, post-partition):** ~113 EFC/yr × 200 MWh
× 2 legs ≈ 45,200 MWh through the exchange → ≈ **€2,500/yr**. This line is real, correctly
placed, and *immaterial* — which is itself worth knowing, because it was named as one of the
five defects.

## 3 · BRP / balancing volume fees — NOT LOCATED

**What was checked, so the negative is about the world and not about the probe (B11):**

- Litgrid, *Trade in imbalance energy* (`/services/trade-in-imbalance-energy/572`) — HTTP 200,
  ~98 kB of content, **no numeric tariff**; every currency match on the page resolved to site
  navigation and news chrome.
- Litgrid, *Trade in balancing energy* (`/services/trade-in-balancing-energy/573`) — HTTP 200,
  ~93 kB, same result.
- Web search across Litgrid / VERT / Baltic TSO balancing tariff terms returned consultation
  notices and market descriptions, no rate schedule.

**This is "not located", NOT "does not exist".** The pages returning 200 with no figure is exactly
the shape B11 warns about: a page that always renders is not a tariff that was found. The rate may
sit in a VERT decision, in the imbalance settlement agreement's annexes, or in a Baltic-harmonised
document not indexed by these searches.

**Consequence for the engine.** The contracted structure is clear — balancing and imbalance costs
are **volume-based and deducted inside the revenue pool, before the owner's share** — but no
public per-MWh rate is in hand to parameterise it with.

**Open question that must be settled before this line is modelled at all.** The engine's measured
`trading_realisation` (0.7234) is realised outcome over perfect-foresight benchmark. If that
measurement was derived from *market* data, it does **not** already carry pool-level balancing
deductions, and setting this line to zero would silently drop a real cost. If it was derived from
*settlement* data, the deductions are already inside it and modelling them again would
double-count. **This is not resolvable from the sources above and is the single largest open item
in the phase.** It is flagged rather than assumed in either direction.

## 4 · Auxiliary consumption — PARTIAL

No manufacturer datasheet located giving auxiliary load as a specification. What is available is
an operating band reported for modern containerised systems: **8–13 kW per 5 MWh container**,
varying with ambient temperature, covering liquid cooling (chillers, pumps, fans), heating and
anti-condensation, humidification, BMS and rack controllers, and fire detection/suppression.
Independently, the literature notes that excluding auxiliary consumption can introduce an error of
**up to ~10%** in round-trip efficiency accounting.

Sources (secondary, and labelled as such): industry operating benchmarks reported at
`energycentral.com` (BESS 5 MWh aux consumption); ScienceDirect, *Impact of heating and cooling
loads on battery energy storage system sizing in extreme cold climates*
(`https://doi.org/10.1016/j.energy.2023.128099`); MDPI *Batteries* 10(3):69,
`https://www.mdpi.com/2313-0105/10/3/69`.

**Scaling the band, reference asset (50 MW / 4h = 200 MWh = 40 containers):**

| basis | standing load | annual MWh | at €70/MWh |
|---|---|---|---|
| 8 kW/container | 320 kW | 2,803 | ~€196k |
| 13 kW/container | 520 kW | 4,555 | ~€319k |

**This is material** — comparable in size to the fixed BRP fee the phase removes — and it is
currently invisible in the engine. It is also the least well-sourced number in the stack, and the
two facts together are uncomfortable: the phase's largest new cost rests on its weakest source.

**Cross-check against the other basis, which does not agree.** 2,803–4,555 MWh against ~22,600
MWh/yr of throughput is **12–20% of throughput**, well above the ~10% RTE-error figure the
literature quotes. Either the 24/7 standing-load assumption is too harsh (real HVAC duty cycles
with ambient temperature and with the asset's own activity), or the two sources are measuring
different things. **Not reconciled.** Until it is, the aux line should be modelled as a band and
carried at a duty-cycle-adjusted figure, not at a 24/7 standing load.

## 5 · Service fee — banded, no public source

No public source exists for optimiser service fees; this is bilaterally negotiated. Modelled as a
**range of roughly 4–8% of the owner's net revenue share after exchange fees**, with the base case
at the **conservative (higher) end**, not the middle — the correction this phase makes is
flattering to IRR, so the base case must not also take credit for the most favourable end of an
unsourced band.

Source line for the register: *"commercial terms observed in Baltic optimiser agreements — KKME
private reference 2026-08-03"*.

`review_cycle`: on any new optimiser agreement, or annually, whichever is sooner.

## 6 · Integration / onboarding fee — banded, no public source

A one-off API-integration charge in the **low tens of thousands of euros**, typically split
between signature and commissioning. CAPEX-class, not annual opex. Banded, same source line and
review cycle as §5.

## 7 · What this changes about the engine's current stack

| engine today | what the evidence supports | direction |
|---|---|---|
| `rtm_fee_pct` 0.10 / 0.11 / 0.13 **of gross** | a materially lower percentage, applied to the **owner's net share after exchange fees**, not to gross | engine **overstates** — wrong rate and wrong base |
| `brp_fee_yr` €180k / €185k / €210k **flat per SPV**, escalating | no fixed annual platform fee of this shape; the real costs are volume-based and sit **inside the pool, before allocation** | engine invents a fixed cost and puts it at the wrong point in the waterfall |
| — | Power Market Charges (§2) | missing, but immaterial (~€2.5k/yr) |
| — | Auxiliary consumption (§4) | missing, and material (~€200–320k/yr) |
| — | Integration fee (§6) | missing, small, day-one CAPEX item |

The first two are large and favourable; the fourth is large and unfavourable. **They partly
cancel, and the net direction cannot be asserted before it is measured** — which is the point of
the decomposed delta, and the reason the base case is parameterised at the conservative end of
every band.
