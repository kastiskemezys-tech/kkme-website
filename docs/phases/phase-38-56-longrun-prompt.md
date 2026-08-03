# Phase 38.5 + 38.6 — long autonomous run: card defects, then the MW partition

**Branch:** `phase-38-56-partition` off latest main. **Autonomous, ~4-5 h, three internal stops written as DECISIONS.md entries rather than pauses.**
**Deploy: NO. Merge: NO.** Everything ends at a signed-checkpoint artifact. The operator is away; the deliverable is a *decidable* checkpoint, not a shipped change.

Read `docs/playbooks/failure-modes.md` first. Answer the four Pause-A questions in one paragraph before any code. Every line-number reference below came from 38.4 and must be re-verified at execution time (A3).

**The one-sentence framing:** the engine sells the same megawatts twice — `RESERVE_PRODUCTS` shares sum to 1.00 while the trading line takes 70 % of the asset again — and it does so through a line that derives a share in **€/€** and spends it in **MWh/MWh**. This run fixes the small things first so the big thing's delta is readable, then builds the partition and measures what it costs.

---

# PART 1 — 38.5, the three routed card defects (~1.5 h)

Each defect: **its own commit, its own delta row.** No blended commits — the partition's delta has to be readable against these three.

### 1.1 `capture_eur_mwh` (`fetch-s1.js:1359`) publishes a theoretical spread on losing days
Rule #2 on a live field: the label asserts realised capture where the arithmetic can only produce a theoretical one. Decide what it publishes on a day the asset would not have traded — zero, null, or the realised negative — and justify the choice. **A null that renders honestly beats a number that renders confidently.** Assert on rendered output (B13), including the empty state.

### 1.2 SoC resets daily in `computeDispatchV2` (`:1136`)
State the physical claim the reset makes — every day starts at the same state of charge regardless of how the previous ended — and quantify what it costs: which metrics inherit it, in which direction, by how much. **If a correct fix requires the partition, STOP and file it with the quantified statement.** A held item with a number attached is a good outcome.

### 1.3 `annual_eur = daily × 365` (`:1336`, siblings `:991-992`, `:3955`)
ALL-N with the search command and match count — "the sibling at X" has been wrong before (A7). A flat 365× erases seasonality that both the hourly engine and the shape-years represent. Quantify the error against a seasonally-resolved run **before** choosing the fix; if the seasonal run says the error is immaterial, say so and leave it.

**Gate for Part 1:** `/revenue` 54/54 byte-identical except where a delta row says otherwise; each delta row carries pre, post, absolute, %, named cause, surfaces affected.

---

# PART 2 — 38.6, the MW partition (~3 h)

## 2.0 Baseline first, before touching anything
Capture the 54-config baseline **from a clean worktree of the reference commit against one frozen KV snapshot copied byte-identical into both trees** (37.D's method; never a stash — C6). Record the snapshot's hash in the artifact. Everything in Part 2 is measured against this.

## 2.1 Pause A — the identity that does not currently hold

Establish, with file:line evidence and search counts:

1. Every consumer of `trading_fraction` (38.4 found `:2281-2283` revenue, `:2288` cycle accounting, `assumptions_panel.cycles_breakdown`, RevenueCard's "Trading %", the `capture_*` back-solve at `:2703-2704` — re-verify and extend).
2. Every consumer of `RESERVE_PRODUCTS` shares and of `rev_bal`.
3. **What `bal_calibration` is anchored to.** It is calibrated against the current *unpartitioned* base year, so any partition invalidates it unless it is re-derived. Say exactly what it would have to be re-derived against.
4. `effective_arb_pct` — computed at `:3690`, published, consumed by nothing. Confirm it is still inert before proposing it as an input.

**Write the identity the engine should satisfy and show that it currently does not:**

```
for each direction d ∈ {up, down} and each period:
    Σ_p committed_MW[p,d]  +  DA_power_MW[d]   ≤   P_max            (power)
    Σ_p reserved_MWh[p,d]  +  DA_energy_MWh[d] ≤   E_usable          (energy / SoC)
```

Today the first line is violated by construction: reserve shares sum to 1.00 of `P_max` and DA takes 0.70 of it again.

## 2.2 The design — what a correct partition looks like in an annual-average engine

**This engine is an annual-average model, not an hourly optimiser** (the hourly engine exists separately and is not the subject here). So the partition must be an *average-consistent allocation*, not a dispatch. Design it explicitly:

- **One MW budget, two directions.** Up-headroom is consumed by FCR (symmetric — it consumes BOTH directions simultaneously), aFRR-up, mFRR-up and DA discharge; down-headroom by FCR, aFRR-down, mFRR-down and DA charging. **FCR consuming both directions at once is the constraint most likely to be missing today — check it specifically.**
- **Availability ≠ delivery.** A reserve capacity payment buys the *right to call* the MW; the MW is unavailable to DA for the whole committed period even though energy flows only on activation. That asymmetry is why capacity revenue and arbitrage revenue cannot both claim the same MW, while activation energy and arbitrage energy are genuinely different quantities. Make this distinction explicit in the model and in the drawer copy that will eventually describe it.
- **Energy reservoir per product, not just power.** Prequalification requires a minimum energy reservoir relative to prequalified power, plus a state-of-charge management concept guaranteeing continuous activation in stressed states — see ENTSO-E's explanatory note on additional FCR properties (`https://consultations.entsoe.eu/system-operations/synchronous-area-operational-agreement-policy-1-lo/supporting_documents/Article_A2_Explanatory_Note_for_Additional%20properties%20of%20FCR.pdf`, which states the minimum ratio of rated to prequalified power and the ≥30-minute full-activation requirement). Baltic FCR is procured jointly by Elering, AST and Litgrid through the Baltic Balancing Capacity Market — verify the Baltic product's own reservoir requirement against Litgrid/Elering/AST primary documents rather than assuming the continental figure (rule #3; A5 — the operator's and this prompt's citations are hypotheses until you have located the requirement in the primary text).
- **The literature agrees the trade-off is the whole problem, not a detail:** energy and reserve share the same power and energy limits, so allocating headroom to reserve reduces arbitrage and aggressive arbitrage violates reserve deliverability. Standard treatments co-optimise with SoC-band allocation between arbitrage and reserve (see e.g. the MDPI co-optimisation study `https://www.mdpi.com/1996-1073/14/24/8365` and the Nordics multi-market scheduling paper `https://arxiv.org/pdf/2506.02837`). **Use these to sanity-check the shape of your constraint set, not to import parameters** — our numbers come from our own data.
- **Do not double-discount.** The existing bid-acceptance machinery already haircuts committed MW. Partition and acceptance are different things; show explicitly that applying both does not discount twice.

## 2.3 Implementation

- **Both paths computable behind a flag**, defaulting to CURRENT behaviour. Nothing changes for any caller until the flag flips. The flag's default is part of the diff review, so state it in the commit message.
- Fix the **unit error at `:2283`** as part of the partition, not before it — substituting a physical share into an unpartitioned model double-counts less rather than not at all, and shipping that intermediate state would be a number nobody can defend.
- **Re-derive `bal_calibration`** against the partitioned base year; state the old and new anchors side by side.
- Every new parameter gets a register row with its source and `review_cycle`.

## 2.4 Tests that would have caught this

At least these, each proven failable by inject-then-revert:

1. **Power-budget identity** per direction per year: `Σ committed + DA power ≤ P_max`, asserted on the payload, not on internals.
2. **FCR symmetry:** committed FCR consumes both directions — a fixture where FCR alone approaches `P_max` leaves no room for aFRR-up *or* DA discharge.
3. **Energy identity:** `Σ reserved_MWh + DA energy ≤ E_usable` per period.
4. **Dimensional guard:** a test that fails if a €-derived ratio multiplies an MWh quantity — the class of bug this phase exists to fix, expressed as a unit assertion at the seam.
5. **No-double-discount:** partition × acceptance applied once.
6. **`effective_arb_pct` consumed:** a test asserting the published physical share and the share the revenue path actually uses are the same number (this is the gate whose absence let a 5× disagreement live in production for months).

## 2.5 The measurement — this is the deliverable

Full delta, partitioned vs current, **all 54 public configurations** and the client portfolio: gross Y1 · project IRR · equity IRR · min DSCR · LCOS · NPV · cycles/yr · DA share of gross. Plus:

- The same table with the partition applied but the unit error left in, and with the unit error fixed but no partition — **three columns, so the two effects are separable.** This is the artifact that makes the decision decidable.
- Which surfaces change, named.
- A one-paragraph statement in plain language of what a lender would see change and why it is the more defensible number.

## 2.6 STOP conditions — any of these ends the run with a report, not a workaround

- The partition cannot be expressed coherently in the annual-average engine without importing the hourly dispatch. → Deliver the design, the gap statement, and the three-column measurement of what is measurable.
- `bal_calibration` cannot be re-derived without data we do not hold. → Say what data, and stop.
- The Baltic reservoir requirement cannot be located in a primary source. → Use a stated placeholder, flag it as unmeasured, and do not let it silently become a parameter.
- Any public number would move before the checkpoint. → Stop; nothing ships in this run.

---

# Wrap (write it as if the operator reads only this)

1. Origin-SHA, branch, PR URL, and an explicit "nothing deployed, nothing merged".
2. Part 1: three deltas, what shipped, what was held and why.
3. Part 2: the identity that fails today, in one line of arithmetic anyone can check.
4. The three-column delta table (current / unit-fix only / full partition), 54 configs summarised plus the reference config in full.
5. What you recommend, what would have to be true for the alternative, and the direction stated plainly — **if it lowers IRR, lead with that.**
6. Every premise in this prompt that turned out false, listed. There will be some; the run is more valuable for finding them than for agreeing with me.
7. STOP conditions hit, if any.

## Gates
`docs/_private/` never staged · nothing deployed · nothing merged · every new test proven failable · every parameter traceable to a source · `/revenue` unchanged for any caller until the flag flips · suite green · eslint delta zero.
