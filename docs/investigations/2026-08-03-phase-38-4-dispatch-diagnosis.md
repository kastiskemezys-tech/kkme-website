# Phase 38.4 — dispatch reconciliation: the diagnosis

**Status:** DIAGNOSIS COMPLETE. No code changed, nothing deployed, no published number moved.
**Branch:** `phase-38-4-dispatch-reconciliation` off `main` `3a84850`.
**Date:** 2026-08-03. All live figures re-measured this session (A3) — none quoted forward from 38.3.

The phase was scoped to reconcile two dispatch representations. It found that the question was
malformed: the two representations do not disagree by 2.5×, and the thing that does disagree is a
unit error on a single line of the shipped revenue path.

---

## 1 · The dimensional analysis

Three quantities were being treated as candidates for one slot. Two of them are the same kind of
thing. The third — the one in the revenue path — is not.

| | derivation | dimension | where it binds |
|---|---|---|---|
| `trading_fraction` | `min(0.70, T/(T+R) × 0.75)`, `T` and `R` both €/MW/h value densities (`fetch-s1.js:3407-3503`) | **€/€** — a share of value | `fetch-s1.js:2283`, multiplying `da_mwh_per_mw_yr` |
| `effective_arb_pct` | Σ (MW-share freed in slice × probability of slice) (`fetch-s1.js:3676-3680`) | **MW·h/MW·h** — a share of power | **nothing** — diagnostic only (`:3690`) |
| hourly free-MW share | `mean_h(mwLeft)/mw` after reserve commitment (`dispatch.mjs:361`) | **MW/MW** — a share of power | `eOut = min(mwFree, poiExport, headroomUp)` (`:396`) |

Measured live, base 2h / scenario base / COD 2028, **from a single `base_year.time_model` object**:

```
effective_arb_pct = 0.141      physical, computed every request, consumed by nothing
trading_fraction  = 0.700      economic, drives rev_trd
                     4.96×     inside one payload
hourly measured   = 0.275      physical, independently derived
```

**The finding.** `trading_fraction` is derived in euros and spent in megawatt-hours. Line 2283
multiplies `da_mwh_per_mw_yr` [MWh/MW/yr] by a €/€ ratio. The engine is not missing a
representation of the physical constraint — it has one, publishes it, and does not use it.

The two dimensionally-comparable quantities, 0.141 and 0.275, disagree by 1.95×. That is an
ordinary modelling disagreement between a probability-weighted time-slice model and a measured
hour loop. It is not the 5× gap, and it is not what blocks anything.

### And it is not a partition

`rev_bal` (`:2263`) carries **no** `(1 − trading_fraction)` factor, while `RESERVE_PRODUCTS` shares
sum to exactly 1.00 (`:1777-1781`, FCR 0.16 + aFRR 0.34 + mFRR 0.50). The reserve model already
claims the entire asset. Free MW under those shares is **0%**; the pre-2028 DRR derogation drops
FCR, giving 16%. The hourly run measures 27.5% — *above* 16% — only because the SoC reservation
cuts reserve commitment below its own ceiling (`dispatch.mjs:288`, commitment cut rather than
reservation relaxed).

So the question "what happens when both are applied" is already answered in production: **both are
applied, to the same MW, with no netting.** The composition is the defect.

---

## 2 · The reconciliation, and a correction to the framing it was given

### The 75.2–85.5% simultaneity figure does not measure free MW

It is `constrained_gross / unconstrained_gross` from the 36.B1 runner's enforce/disable pair. For
LT-2025 the delta is €860,968, of which **€757,401 is capacity revenue**. It measures what the SoC
reservation costs the *reserve stack*. It says nothing about how much MW is free to trade.
Committing 72.5% of MW and retaining 85.5% of the unconstrained stack are consistent statements,
not rival ones.

Measured across all five price years — the ratio and the free-MW share do not covary:

| year | constrained € | unconstrained € | ratio | free-MW share | EFC/yr |
|---|---|---|---|---|---|
| 2021 | 4,205,145 | 5,309,709 | 79.2% | 0.286 | 210.5 |
| 2022 | 3,854,025 | 5,127,056 | 75.2% | 0.266 | 217.9 |
| 2023 | 4,537,793 | 5,458,195 | 83.1% | 0.271 | 218.3 |
| 2024 | 4,851,044 | 5,809,403 | 83.5% | 0.279 | 219.9 |
| 2025 | 5,085,873 | 5,946,841 | 85.5% | 0.275 | 219.1 |

### The check that does discriminate already existed and already passed

`cycle_attribution.da_coherence` in the 36.B1 artifact: free-MW share **0.2751** vs
DA-achieved-against-revenue-anchor **0.2890** — a power share and an energy ratio, computed
independently, agreeing to 1.4 pp.

### The non-mirror check run this session — energy, price-free (B5)

Removes both the accounting basis and the price basis:

| | shipped Y1 | hourly LT-2025 | ratio |
|---|---|---|---|
| DA delivered MWh/MW/yr | 747.0 | 210.9 | **3.54×** |
| DA EFC/yr (delivered ÷ dur_h) | 373.5 | 105.4 | 3.54× |
| total EFC/yr | 498 | 219.1 | 2.27× |
| total cycles/day | 1.36 | 0.60 | 2.27× |

Hourly-side supporting gates, all from the same run: energy balance |Σcharge×RTE − (Σdischarge +
Σactivation + ΔSoC)| = 1.579e-9 MWh (relative 7.6e-14); 0 constraint violations over 8760 hours;
warranty 219.1 / 730 EFC, 0 throttled hours.

### The like-for-like table — so nobody re-derives the artefact

B-063's "2.5×" compares a **spread margin** against a line carrying the **entire** charging cost,
including energy later delivered as activation. The shipped engine has no charging-cost line at
all: `gross_eur_mwh = avgDischarge − avgCharge` (`fetch-s1.js:4432`) is already a spread. The
hourly engine's raw `arbitrage` is net of all charging by construction, and `dispatch.mjs:461`
says so in terms — *"booking the entire charging cost against arbitrage understates the arbitrage
line and overstates activation."*

| basis | arbitrage share of gross | note |
|---|---|---|
| shipped `rev_trd` — spread margin, no charging cost | **27.8%** | live 2h/base/2028, `2,235,502 / 8,049,363` |
| hourly `arbitrage` — raw, all charging cost on it | **10.7%** | `545,579 / 5,085,873` — **the figure quoted in B-063** |
| hourly `arbitrage_net` — charging cost allocated | **21.0%** | `1,067,100 / 5,085,873` — **the comparable one** |
| hourly `discharge_income` — no charging cost | 31.5% | `1,604,227 / 5,085,873` |

**Like-for-like the gap is 1.32×, not 2.5×.** The real disagreement lives in energy (3.54×), not in
the revenue ratio.

---

## 3 · A9 — STALE BLOCK, DO NOT QUOTE FORWARD

The 36.B1 dispatch artifacts (`tools/consultancy/output/dispatch-kkme-reference-LT-*.json`,
generated **2026-07-29T07:47:33Z**, engine `v7.3`) are **untracked** — they exist only on local
disk and carry an `output_hash`, so they are not amended here.

**`reconciliation.cycle_attribution.engine_branch_gap` is stale as of 2026-08-03.** It reports:

```
cycle_branch_da_efc: 550, revenue_branch_da_efc: 385
comment: "trading_fraction 0.70 applies to DA revenue but not to DA cycle accounting"
```

**That split was closed by 36.B5.** The live engine today publishes a single figure on one basis —
`assumptions_panel.cycles_breakdown.da = 373.5`, `basis: "Wear and revenue share one delivered
day-ahead throughput (anchor × trading fraction × availability)"`. The 550-vs-385 row describes an
engine that no longer exists. Any future phase re-reading these artifacts must re-derive the cycle
figures against the live engine before quoting them.

Everything else in those artifacts was re-checked this session and stands.

---

## 4 · Degradation below 1.0 c/d — tested, and deliberately NOT adopted

Floor verified at code level, not from the prior filing: `sohYr` (`fetch-s1.js:6368`)
`const cd = Math.max(cd_total ?? 1.0, 1.0)`; `getDegradation` (`:1467`)
`w2 = Math.min(1, Math.max(0, cyclesPerDay - 1))` — zero weight on the 2C curve at any cd ≤ 1.0.
Both confirmed.

The floor is an artefact of **parameterising by c/d**, which fuses two independent mechanisms:
cycle wear depends on cumulative EFC, calendar wear on elapsed time. The separable form is standard
in the LFP literature (Schmalstieg-family superposition of linear and square-root terms).

Fitted to the engine's own three curves — 51 points, 1.0 / 1.5 / 2.0 c/d × Y1–Y17:

```
loss(t, cd) = 0.0602·√t + 1.463e-05·EFC          EFC = cd × 365 × t
worst residual 3.3 SOH pp | per-curve max |err| 3.25 / 2.32 / 1.77 pp
```

This is interpolation of fitted parameters rather than extrapolation of curves, so it clears the
bar 38.4 was given. **It was still not adopted, and should not be:**

- The 3.3 pp worst residual is too coarse for a coefficient that drives revenue.
- The payoff is small — at Y10 the fit gives SOH 0.778 at 0.6 c/d vs 0.756 at 1.0 c/d, **~2 pp**,
  consistent with the +0.07 to +0.15 pp IRR that 38.3 measured for the whole cutover.
- Adopting it would replace a *disclosed* limit with an *undisclosed* internal regression.

**Resting state:** the validity-floor disclosure shipped in 38.3 (`app/lib/wearModelRange.ts` +
`WearModelRangeNote`) is correct and stays. Characterisation waits for citable coefficients from a
primary source — cell datasheets or published low-C-rate cycle-life curves — per rule #3. See
B-064, which remains open and is **not** closed by this phase.

---

## 5 · `effective_arb_pct` stays published

It is a diagnostic that has contradicted the number beside it, in production, for months. That is
evidence. Removing it while the model is wrong would delete the record of the disagreement. Operator
decision, 2026-08-03: leave it.

---

## 6 · Recommendation

**Close the cutover as malformed.** It was framed as a choice between two dispatch engines. It is a
unit error on `fetch-s1.js:2283`, and both physical estimates of the quantity that line needs
(0.141 internal, 0.275 measured) are 2.5–5× below the 0.70 it uses.

**Neither physical figure should simply be substituted.** `rev_bal` is unpartitioned, so a smaller
number on line 2283 would still double-count MW — it would double-count less. A correct fix
partitions both sides against one MW budget.

**Direction, stated plainly: correcting this lowers IRR, materially.** DA revenue falls by roughly
the ratio applied. The degradation offset is ~2 pp of SOH, nowhere near enough to compensate. The
arc's three-phase sequencing rationale assumed the cutover moved IRR *up*; that assumption rested
on the 498 → 222 EFC benefit while ignoring which side of the trade the revenue line sits on.
Direction was not an input to this recommendation.

### Sequencing agreed at checkpoint

1. **Card defects phase — first, before the partition.** The three routed display defects are
   independent of which representation wins. Each takes its own commit and its own delta, so three
   attributable movements do not blend into one unattributable one (C3).
   `capture_eur_mwh` goes first — a rule-#2 shape on a live field.
2. **Partition phase — after.** The unit error at `:2283`; `rev_bal` partitioned against one MW
   budget; `bal_calibration` re-derived (it is anchored to the current *unpartitioned* base year);
   54-config baseline captured from a **clean worktree** of the reference commit before anything
   changes (C6 — never via `git stash`).
3. **Degradation characterisation — unscheduled**, waiting on citable coefficients.

Deliberately not scoped in this session. 38.4 is the diagnosis.
