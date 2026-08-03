# Phase 38.8 — the fee and cost stack, corrected against a real optimiser agreement

**Branch:** `phase-38-8-commercial-terms` off latest main. **Semi-autonomous — CP before any number moves.** ~2-3 h.
**Private reference:** `docs/_private/commercial/2026-08-03-optimiser-commercial-terms.md` (gitignored — READ it, never quote it into a tracked file, never name a counterparty or client anywhere).

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why:** the engine's route-to-market and BRP assumptions were authored from market hearsay. A live Baltic trading/aggregation/optimisation agreement is now in hand, and it disagrees with the engine on the rate, the base, the shape and the completeness of the cost stack. This phase replaces assumption with contracted structure.

**Direction warning, up front:** this correction very likely moves IRR **UP**. That is the flattering direction, which by our own standing rule carries the higher evidential burden — parameterise conservatively, measure rather than argue, and if the movement is large, say so plainly rather than letting it look like good news.

---

## 1 · What the contract actually specifies (see the private reference for the full waterfall)

```
Net Revenue Group (pool)  = wholesale net + ancillary + other
                            − ancillary penalties − balancing charges − imbalance charges
Owner's Net Revenue Share = pool × (asset TMR share)
Service Fee Calculation Base = Owner's share − Power Market Charges
Service Fee               = 4.8 % × base
Owner's cash              = base − Service Fee − Auxiliary Consumption Charges
                            − asset-specific penalties/imbalances
Plus one-off              = €23,900 integration fee (50 % signature / 50 % commissioning)
```

## 2 · The five defects in the engine's stack

Verify each at code level before changing anything (A3 — every line reference below will have drifted):

1. **`rtm_fee_pct` 0.10-0.13 applied to `rev_gross`** (~`:1634-1666`, consumed ~`:2400`, `:3047`). Wrong rate and wrong base: the contracted fee is 4.8 % of the owner's share *after* exchange fees, not 10-13 % of gross.
2. **`brp_fee_yr` €180-210k flat per SPV, escalating.** No such fixed annual fee exists. BRP and imbalance costs are **volume-based and deducted inside the pool, before the owner's share is computed** — both the magnitude and the position in the waterfall are wrong.
3. **Power Market Charges missing** — exchange fees on metered output AND import, allocated pro rata.
4. **Auxiliary Consumption Charges missing** — aux MWh × max(spot, 0) plus fiscal charges. Material for a BESS and currently invisible.
5. **Integration fee and commissioning-period imbalance costs missing** — day-one cash items, small but real.

## 3 · The structural question — model it or document it (your recommendation, my decision)

Revenue is a **pool share allocated by perfect-foresight Theoretical Maximum Revenue**, not own realised performance. Note the alignment worth checking rather than assuming: our measured `trading_realisation` = 0.7234 is conceptually `NR / Σ TMR` — realised outcome over perfect-foresight benchmark. If that holds, the measured realisation belongs on the **pool**, before the owner's share, which is not where the engine applies it today.

At the CP, recommend one of:
- **(a) Represent the pool** — apply realisation at pool level, then an allocation share, with the share defaulting to 1.0 so single-asset behaviour is unchanged until someone sets it; or
- **(b) Document the equivalence** — show that for a single asset whose TMR share ≈ its revenue share, the current shape is arithmetically equivalent, and record the divergence conditions (availability shortfall, group reassignment, asset-specific charges).

Do not build (a) speculatively. If (b) is honest, (b) is better.

## 4 · Parameterisation under NDA — non-negotiable

**No exact figure from the private agreement goes into the engine, the register, the drawer, a test, a payload or a commit message. Not the fee percentage, not the integration fee, not the SLA credit ladder.** The agreement informs the *structure* and the *plausible range*; the numbers themselves come from public sources or from a stated band.

**Prefer public sources — three of the five lines have them, and a publicly-cited parameter is strictly better than a banded one:**

- **Power Market Charges** → Nord Pool's published trading fee schedule (public). Model as €/MWh on metered output + import, per the published tariff, cited by URL and version date (rule #3).
- **BRP / balancing volume fees** → the Baltic TSOs' published balancing-service and imbalance-settlement tariffs (regulated, public). Cite per country, with the effective date.
- **Auxiliary consumption** → BESS supplier datasheets / published auxiliary-load figures as a % of throughput or a kW standing load. Cite the source; if the range across sources is wide, model the range and say so.

**Only the service fee is banded**, because only it has no public source:

- Model it as a **range of roughly 4-8 % of the owner's net revenue share after exchange fees**, base case at the **conservative (higher) end of that range**, not the middle — the correction is flattering, so the base case should not be.
- Source it as *"commercial terms observed in Baltic optimiser agreements — KKME private reference 2026-08-03"*. No counterparty, no client, no exact figure.
- Same treatment for the integration fee: a **one-off in the tens of thousands of euros**, banded, not the exact number.

**Assert the boundary mechanically:** a grep gate over every diff for the counterparty and client names *and* for the exact figures in the private reference, run before each commit. A parameter that reproduces a contracted figure to the decimal is a disclosure even without a name attached.

## 5 · Measurement — the deliverable

Full delta, all 54 configs plus the client portfolio: gross Y1 · rev_net · project IRR · equity IRR · min DSCR · LCOS · NPV. **Decompose it by defect** — fee-rate change, fee-base change, BRP removal, Power Market Charges added, aux consumption added — so each line's contribution is separable rather than arriving as one number. This is the same three-column discipline that made 38.6 decidable, extended to five.

Also state: **what the net correction does when combined with the partition already shipped.** The partition lowered IRR; this raises it. A reader will want the combined position, and it should come from us first.

## CP
The decomposed delta, your §3 recommendation, and the band you propose with its justification. I sign before anything ships. No deploy in this phase without that signature.

## Gates
`docs/_private/` never staged (assert every commit) · no counterparty/client name anywhere in the diff (grep gate) · `/revenue` 54/54 byte-identical until the signed CP · every parameter carries a source and `review_cycle` · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the five-way decomposed delta · combined position with the partition · §3 recommendation · the band and its justification · the name-grep gate output · PR URL.
