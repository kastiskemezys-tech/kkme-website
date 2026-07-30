# Phase 36.D — client-portfolio decomposition (CP-2 amendment 2)

**Date:** 2026-07-29 · **Branch:** `phase-36-d-litgrid-forecast`
**Method:** both engines loaded in ONE process, cost stack held constant at `COST_DEFAULTS`,
same frozen KV fixture, same configs. Nothing differs between the two runs except
`workers/fetch-s1.js`.

---

## 0. Correction to the CP-2 report

**The portfolio figures in the CP-2 report were wrong, and the direction was wrong.**

| Metric | CP-2 reported | Measured (controlled) |
|---|---|---|
| Y1 gross | €12.15M → €12.53M (**+3.1 %**) | €12.97M → €12.99M (**+0.20 %**) |
| 20-yr EBITDA | €174.6M → €183.6M (**+5.2 %**) | €181.67M → €180.16M (**−0.83 %**) |
| NPV @ 8 % | €34.1M → €38.5M (**+12.9 %**) | €37.33M → €36.67M (**−1.78 %**) |
| MOIC | 3.268 → 3.491 | 3.444 → 3.407 |

**Why the first measurement was wrong.** The "before" run was taken under `git stash`,
which reverted every *tracked* file — including `tools/consultancy/fixtures/regression-kv.json`
(dropping the `countries` block this phase added), `tools/consultancy/bridge.mjs` (the
calibration constant) and `tools/consultancy/scenarios.json` — while leaving the *untracked*
new modules in place. The two runs therefore differed in considerably more than the engine,
and the stash pop then failed partway and had to be repaired by hand. That is failure mode
**C3** (baseline not captured cleanly before intended movement) with a side of **A3**
(state asserted from a snapshot that had moved underneath it), committed by the executor
rather than the prompt.

The corrected direction is **negative and consistent with everything else in the phase** —
the reference asset, the 54-config matrix and the portfolio now all move the same way. The
+12.9 % NPV figure was the only number in the phase pointing the other way, which should
itself have been the tell.

**Method note for anything downstream:** a before/after on this engine must load both
modules in one process. `git stash` is not a baseline mechanism in a repo with untracked
work in flight.

---

## 1. Why the sign is not obvious — two channels pulling opposite ways

The demand change reaches revenue through two paths that move in opposite directions:

| Channel | Mechanism | Direction |
|---|---|---|
| **Reserve** (capacity + activation) | Per-product demand is year-indexed and supply is net of absorption, so mFRR S/D falls → `bidAcceptanceFactor` rises 0.85 → 0.87 | **up** |
| **Arbitrage** | Aggregate S/D rises (demand 935×1.02ⁿ → the TSO series, which is lower) → `marketDepthFactor` falls | **down** |

Neither is a rounding effect, and the net is a property of each project's revenue **mix**
and its **COD year** — not a portfolio-level constant. That is what makes the aggregate
number uninformative on its own and why the decomposition was required.

---

## 2. Per-project, year 1

| Project | MW | First yr | Reserve share | Arb share | Reserve Δ | Arb Δ | **Gross Δ** |
|---|---|---|---|---|---|---|---|
| Bitėnai | 48 | 2028 | 71 % | 29 % | +1.96 % | −4.17 % | **+0.21 %** |
| Stoniškiai | 45 | 2028 | 71 % | 29 % | +1.96 % | −4.17 % | **+0.21 %** |
| Eigirdžiai | 30 | 2029 | 71 % | 29 % | +2.04 % | −5.24 % | **−0.06 %** |

Euro attribution of the year-1 move, and it ties to the euro:

```
Bitėnai        reserve  +111k   arbitrage   −95k   net  +17k
Stoniškiai     reserve   +61k   arbitrage   −52k   net   +9k
Eigirdžiai     reserve   +58k   arbitrage   −61k   net   −3k
PORTFOLIO      reserve  +230k   arbitrage  −207k   net  +24k     residual 0.0k
```

**The mix effect.** At a 71/29 reserve-to-arbitrage split, a +2 % reserve gain and a −4 %
arbitrage loss very nearly cancel: 0.71 × 1.96 − 0.29 × 4.17 = +0.18 %. Year 1 is
near-neutral by arithmetic accident, not by design.

**The COD-year effect.** Bitėnai and Stoniškiai open in 2028 and gain 0.21 %; Eigirdžiai
opens in 2029 and loses 0.06 %. One year of COD is worth ~0.27 pp of year-1 gross, because
a later start places more of the projection in years where the arbitrage penalty has
deepened.

---

## 3. The 20-year path — where the near-neutrality goes

| Calendar year | Reserve Δ | Arbitrage Δ | Net Δ | Reserve % | Arb % |
|---|---|---|---|---|---|
| 2028 | +172k | −146k | **+26k** | +1.96 % | −4.17 % |
| 2029 | +274k | −279k | −5k | +2.04 % | −5.24 % |
| 2030 | +286k | −319k | −34k | +2.13 % | −6.04 % |
| 2032 | +286k | −353k | −67k | +2.22 % | −7.35 % |
| 2033 | +286k | −422k | −136k | +2.22 % | −8.92 % |
| 2035 | +286k | −439k | −153k | +2.27 % | −9.57 % |
| 2038 | +286k | −449k | −163k | +2.33 % | −9.88 % |
| 2040 | +286k | −447k | −161k | +2.33 % | −9.91 % |
| 2044 | +286k | −353k | −68k | +2.33 % | −10.05 % |
| 2047 | +286k | −315k | −30k | +2.33 % | −10.03 % |
| **20-yr total** | **+€5.66M** | **−€7.46M** | **−€1.80M** | | |

The shape is the whole answer:

- **The reserve gain saturates.** It rises +1.96 % → +2.33 % and then stops. Bid acceptance
  is an exponential decay bounded at 0.95; once mFRR S/D has fallen as far as the absorption
  deduction takes it, there is nothing further to win. In euros it is flat at +€286k from
  2030 onward.
- **The arbitrage loss keeps deepening**, −4.17 % → −10.05 %, because `marketDepthFactor`
  has no floor and the gap between the two demand series widens every year: the retired
  935 × 1.02ⁿ ramp reached 1 445 MW by 2048, while the TSO-anchored series reaches 1 207 MW.
- So year 1's +€26k becomes −€150k/yr by the mid-2030s, and the accumulated −€1.80M of
  20-year revenue is what drives 20-yr EBITDA −0.83 % and NPV −1.78 %.

The late-period tapering (−€163k in 2038 back to −€30k by 2047) is degradation and the
augmentation schedule shrinking the revenue base both channels act on, not a recovery in
the demand basis.

---

## 4. What a client asks, and the answer

> *Our numbers went down slightly. What changed?*

Reserve demand stopped being an undocumented internal figure and became the Baltic TSOs'
own published procurement forecast, and battery capacity contracted to Lithuanian reserve
services outside these products stopped counting as competition for them. Year-1 revenue is
essentially unchanged (+0.2 %); over twenty years the model earns slightly more from
reserves and slightly less from trading, netting to −1.8 % of NPV.

Every input is now a document the client can fetch and check — which is the actual
deliverable of this phase, and it is worth more than 1.78 %.
