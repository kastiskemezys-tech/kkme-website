# Phase 34 batch — autonomous decision log

Branch `phase-34-batch-1`. Operator out; every prompt pause point became a documented
decision here per the batch rules. Conservative option chosen wherever ambiguous.

Batch rules in force: one branch, one commit minimum per phase, **no worker deploy**,
public `/revenue` byte-identity gate after every commit.

---

## 34.1 — Pause A: hardcode surface map (investigation, not assumption)

### A0. Premise correction (discipline rule #1)

The 34.1 prompt's framing — *"the engine currently computes ONE hardcoded reference
asset (50 MW / 100 MWh)"* — is **empirically false**. `computeRevenueV7(params, kv)`
(`workers/fetch-s1.js:1412`) has accepted `{mw, dur_h, capex_kwh, cod_year, scenario,
grant_pct}` since v6. The `/revenue` route already parameterises all six from query
params (`workers/fetch-s1.js:8852-8861`), and `scripts/audit-stack.mjs` already drives
the engine with arbitrary `{mw, dur_h, capex_kwh, cod_year}` outside the worker runtime
(`scripts/audit-stack.mjs:238, 472-473`).

So the work is **not** "make the asset a parameter". 50/100 is a *default*, not a
hardcode. The real work is the residue: the quantities that are still fixed, the ones
that must NOT scale, and the ones the client deliverable needs that don't exist yet.
This changes the shape of the phase but not its size — see A4/A5.

### A1. The literal map

Grep basis: `mw: ?50`, `/ ?50\b`, `params\.mw`, `16400000`, `9020000`, `7380000`,
`= 50`, `= 100` across `workers/fetch-s1.js`, plus a line-by-line read of
`computeRevenueV7` (1412–1965) and the `/revenue` route (8847–9160).

| Line | Literal | Represents | Verdict |
|---|---|---|---|
| 1413 | `params.mw \|\| 50` | system size default | **Parameterise** (config-fed; default kept for byte-identity) |
| 1414 | `params.dur_h \|\| 4` | duration default | **Parameterise** (note: route default is `2h`, so public path never hits this) |
| 1417 | `params.capex_kwh \|\| 164` | €/kWh default | **Parameterise** |
| 1418 | `params.cod_year \|\| 2028` | COD default | **Parameterise** |
| 1451 | `capex_kwh * mwh * 1000` | gross CAPEX (→ 16 400 000 @ ref) | derived, no literal — OK |
| 1453 | `debt_pct = 0.55` | gearing (→ debt 9 020 000 / equity 7 380 000) | **Leave** — financing policy, not project geometry; per-project override deferred to 34.4 scenario work |
| 1456-1459 | `tenor 8`, `grace 1`, `tax_rate 0.17`, `depr_years 10` | financing/tax | **Leave** — LT statutory + PF convention, fleet-global |
| 1482 | `if (yr === 10)` | augmentation year | **Leave in engine**; 34.2 adds an explicit, configurable CAPEX schedule on the runner path (engine's internal aug stays untouched to protect byte-identity) |
| 1486 | `sc.aug_cost_pct`, `sc.aug_restore` | augmentation economics | scenario-global — leave |
| 1556 | `REVENUE_FLOOR_PER_MW = 50000` | €50k/MW/yr revenue floor | **Scales with MW already** (`* mw`) — leave, but must pro-rate in a partial Y1 |
| 1559 | `sc.brp_fee_yr` (€180 000) | BRP fee | ⚠️ **FLAT — does not scale with MW.** See A3. |
| 1565 | `sc.opex_per_kw_yr * mw * 1000` | OPEX (€39/kW/yr → €1.95M @ 50 MW) | scales linearly — OK |
| 1652 | `wacc = 0.08` | NPV discount rate | **Leave** in engine; 34.3 portfolio NPV takes `wacc` from config (default 0.08) |
| 1744-1745 | `LCOS_LIFETIME_YRS 20`, `LCOS_WACC 0.08` | LCOS params | leave — fleet-global |
| 1798 | `` `${mw} MW / ${mwh} MWh (${dur_h}H)` `` | display string | already derived — OK |
| 1932 | `demand_mw: fleet?.eff_demand_mw ?? 752` | Baltic reserve demand | **Fleet-global — must NOT scale.** See A3. |
| 1923 | `ch_benchmark` (Clean Horizon) | external benchmark | fleet-global, leave |
| 2833-2834 | `brp_fee_yr / 12`, `/ 50` | back-test per-MW normalisation | **Leave** — back-test path, reference-asset-specific by design, comment already says so |
| 3024-3026 | `{mw: 50, mwh: 100/120/200}` | SYSTEM display map | public-site display, **leave** |
| 9003-9004 | `computeEngine({mw: 50, …})` for `r2h`/`r4h` | h2/h4 back-compat block | **Leave** — pre-existing; hardcodes 50 even when `?mw=` is passed. Pre-existing latent inconsistency, NOT introduced here, and out of scope (touching it moves `/revenue`). Logged as a backlog item. |
| 9039-9051 | `/ 50` in `result.h2` / `result.h4` | per-MW normalisation of the above | same — leave, consistent with the `mw: 50` above it |
| 9207-9211, 9346-9350 | `{mw: 50, …}` dispatch calls | `/api/dispatch` reference asset | out of scope |

**Sites Cowork did not predict:** the flat `brp_fee_yr` (A3), the `/api/dispatch`
50 MW block, and the fact that the `h2`/`h4` back-compat block ignores `?mw=`.
`16400000` / `9020000` / `7380000` appear **nowhere** as literals — all three are
derived. That premise of the prompt was also false.

### A2. Compute entry path + the seam

- Worker route: `/revenue` → builds `kv` from 9 KV keys (8862-8928) → `computeRevenueV7(params, kv)` (8933-8937).
- Out-of-worker: `scripts/audit-stack.mjs` loads `workers/fetch-s1.js` into a `node:vm`
  context with ESM stripped, then calls `ctx.computeRevenueV7(params, kv)` directly
  (`audit-stack.mjs:186-238`). **Confirmed — this is the pattern the consultancy tools use.**

**Seam decision — additive, not a signature change.** The prompt proposed
`computeRevenueV7(config, …)` with the reference asset as default. Rejected: changing
the first argument's meaning touches every existing call site (route ×6, back-test,
audit-stack ×4, vitest ×4) and puts the byte-identity gate at risk for zero gain,
since `params` is already the config object.

Instead: **`params.project_config` — an optional field.** When absent the engine runs
exactly today's code path (public `/revenue` unaffected by construction). When present
it supplies system geometry, COD, partial-year and the metadata block, and the result
gains one extra top-level `project` key. Public route never sets it ⇒ byte-identity is
structural, not tested-in.

### A3. Scaling classification

| Quantity | Class | Handling |
|---|---|---|
| `mw`, `mwh`, `dur_h` | scales with project | from config |
| gross CAPEX, debt, equity | scales with project (linear in MWh) | derived from config |
| OPEX (`opex_per_kw_yr × mw`) | scales with project | already linear |
| `rtm_fee` (% of gross) | scales with project | already proportional |
| revenue floor (€50k/MW/yr) | scales with project | already `× mw`; pro-rated in partial Y1 |
| **`brp_fee_yr` (€180k flat)** | **needs-new-parameter** | Flat annual fee, MW-independent. At 50 MW it is €3.6k/MW; at 30 MW it becomes €6.0k/MW — a real diseconomy of scale for the smallest project. **Decision: leave flat.** A BRP/optimiser platform fee genuinely is largely fixed per SPV, and leaving it flat is the *conservative* (higher-cost) reading for the two sub-50 MW projects. Documented in the runner output as `brp_fee_basis: "flat_per_spv"`. 34.2 replaces this line entirely on the runner path with the client's 4-line cost stack. |
| `sd_ratio`, `cpi`, `phase`, `per_product_at_cod` | **fleet-global — must NOT scale** | read from `kv.fleet`, project-independent by construction. Verified: no `mw` term in `computeTradingMix`. |
| `eff_demand_mw` (752) | **fleet-global** | Baltic reserve demand; unchanged per project |
| `cycles` / EFC / throughput | already per-MW-normalised | `computeThroughputBreakdown(1, dur_h, sc)` — computed for 1 MW then multiplied. No change needed. |
| RTE, SOH, availability | fleet-global (technology) | leave |
| `grid_allowance_mw` | **new metadata, non-binding** | All three projects are ≤ their allowance (48≤50, 45≤50, 30≤30). Constraint never binds ⇒ carried as metadata with an assert that flags if a future config violates it. No math. Conservative: an assert that fails loudly beats silent clipping. |
| `warranty_efc_yr` | **new metadata + check** | Engine derives `total_efcs_yr` from throughput; config carries the warranty ceiling and the runner emits a `warranty_headroom` flag. No revenue effect. |
| `operational_months_y1` | **new parameter** | See A4. |

### A4. Partial-year Y1 — decision

Stoniškiai COD 2028-06 → 7 operational months in 2028. Eigirdžiai COD 2029-Q1 → its
own Y1 is a full 12 months (its operating-year 1 = 2029); the *portfolio* calendar view
is where its partial contribution lands (34.3).

Decision (conservative where ambiguous, per batch rules):

- `operational_months_y1 / 12` pro-rates Y1 **revenue** (`rev_bal`, `rev_trd`, and the
  revenue floor) and Y1 **OPEX** — per the prompt's minimum-viable spec.
- **`brp_fee` is NOT pro-rated** — a fixed annual platform fee is contracted for the
  year. Conservative (lower net revenue). Flagged in output as `partial_year_fixed_fees`.
- **Degradation is NOT pro-rated** — cells cycle less in a partial year, so full-year
  degradation is pessimistic. Conservative. Flagged.
- CAPEX and financing are unaffected (drawn at t=0 regardless).

### A5. Config schema (as built)

`tools/consultancy/projects/<client>/<project>.json`, plus
`tools/consultancy/projects/kkme-reference.json` for the reference asset. Prosperus
inputs are public-register (VERT permits + Litgrid queue) ⇒ committable per the NDA rule.

```json
{
  "project_id": "bitenai",
  "name": "Bitėnai",
  "mw": 48, "mwh": 96, "duration_h": 2,
  "cod": "2028-01", "cod_year": 2028, "operational_months_y1": 12,
  "capex_eur_kwh": 164, "grid_allowance_mw": 50, "warranty_efc_yr": 730,
  "scenario": "base",
  "meta": { "municipality": "…", "spv": "…", "vert_permit": "L-7441", "source": "public-register" }
}
```

Worker embeds nothing new — the reference config is *not* mirrored into the worker,
because the worker's existing defaults already are the reference asset. Mirroring would
create the parallel literal rule #4 forbids. Instead the reference JSON is proven
equivalent by test: running it through the engine must reproduce the no-config output
field-for-field. That is the single-source proof.

### A6. KV sourcing for the client outputs — investigated, resolved

The deliverable must run on **real production data**, not fixtures. `npx wrangler kv key
get` is unavailable (no `CLOUDFLARE_API_TOKEN` in this non-interactive session), so the
KV is reconstructed from public GET routes:

| kv field | Source |
|---|---|
| `s1` | `GET /read` |
| `s1_capture` | `GET /s1/capture` |
| `s2` | `GET /s2` |
| `s3` | `GET /s3` |
| `euribor` | `GET /euribor` |
| `fleet` | `GET /s4/fleet` |
| `s2_activation_parsed` | `GET /s2/activation`, parsed with the route's own logic (mirrored) |
| `capacity_monthly` | `GET /s2` → `capacity_monthly` (route computes the identical array) |
| `dispatch_metrics` | ⚠️ no public route. **Solved by inversion + search:** the live `/revenue` response publishes `base_year.time_model.reserve_hours_{afrr,mfrr}`; the runner searches the 2-dp activation-rate grid for the pair that reproduces the live values exactly. |

The whole reconstruction is then **validated**, not assumed: `kv-snapshot.mjs --verify`
runs the reference config through the engine and diffs ~20 headline fields against the
live `/revenue`. Outputs carry `kv_source` and the verification verdict. If verification
ever fails the runner says so loudly rather than emitting quietly-wrong client numbers.

### A7. Regression gate design

`tools/consultancy/regression-reference.mjs` — the byte-identity gate the batch rules
require after every commit. It does **not** hit the network (data drift would make it
useless as a code gate): it loads the worker into `node:vm` against a frozen KV fixture
and hashes `computeRevenueV7` output over the full public parameter cross-product —
`dur {2h,4h} × capex {low,mid,high} × cod {2027,2028,2029} × scenario {base,conservative,
stress}` = 54 configurations, `timestamp` stripped. Baseline captured **before** any
engine edit and committed.

Note this gates the engine, which is the only thing this batch changes; the route
wrapper around it is untouched, and no deploy happens today.

### A8. Estimate

Prompt says ~1.5 days for 34.1. Actual scope is smaller than advertised (the engine was
already parameterised) but the tooling floor — vm loader, KV snapshot + verification,
regression harness — is larger. Net: unchanged. Proceeding with all three phases.

**Pause A verdict: proceed.** No operator-blocking ambiguity found.

---

## 34.1 — outcome

Shipped in two commits (tooling, then the seam). Regression gate green throughout.

**Pause B sub-stop (project numbers vs mockup, ±20%) — documented, continued.**
All three inside the band, so no operator stop was warranted even under the
non-batch rules:

| Project | MW/MWh | Y1 mo | Engine gross Y1 | Full-year equiv | Mockup | Δ |
|---|---|---|---|---|---|---|
| Bitėnai | 48/96 | 12 | €8.35M | €8.35M | €9.26M | −9.8% |
| Stoniškiai | 45/90 | 7 | €4.57M | €7.83M | €8.68M | −9.8% |
| Eigirdžiai | 30/60 | 10 | €4.20M | €5.04M | €5.79M | −13.0% |

Cause of the gap is understood, not residual: the mockup took one per-MW figure
(€193k/MW/yr) and scaled it linearly across all three projects. The engine prices
each project at its own COD year against the saturation trajectory, so Bitėnai and
Stoniškiai (operations from 2028) earn ~€174k/MW/yr while Eigirdžiai (2029) earns
~€168k/MW/yr. Internal consistency was checked both ways: at equal COD year,
revenue is exactly proportional to MW (pinned by test); at equal MW, the later COD
earns less.

### 34.1-A4b — engine year labelling (decided during Pause B)

`cal_year = cod_year + yr` means the engine's year 1 lands on `cod_year + 1`; its
`cod_year` param means "commissioning completes in this year". Bitėnai commissions
2028-01, so its first operating year is 2028 and the engine input is `cod_year:
2027`. Rather than putting an off-by-one year in every config file, configs declare
`first_operating_year` and `engine.mjs::codYearForEngine()` is the single place the
convention is applied.

Considered and rejected: keeping `cod_year` = the literal COD year, which would
have modelled every project a year deeper into the saturation trajectory. That is
the more conservative number but the wrong one — the client is buying an
independent model, and a deliberately mislabelled timeline is a defect, not
prudence. Conservatism is not a licence to be wrong about which year it is.

Config validation cross-checks `operational_months_y1` against the declared COD
month and refuses a config where they disagree (discipline rule #2 — no asserted
temporal label that isn't derived).

---

## 34.2 — cost decomposition + CAPEX schedule

### 34.2-A — engine emits arbitrage energy, conditionally

The client bridge needs an explicit charging-cost line, but the engine prices
arbitrage on a captured DA *spread* — its trading revenue is already net of
charging, and the charged/discharged MWh exist only inside the year loop. Rather
than re-deriving those volumes downstream (rule #4), the engine now collects them
into `project.arb_energy_20yr`. Collection is gated on `project_config` being
present, so the public payload is untouched and the byte-identity gate stays
structural.

Charging cost = engine's charged MWh × the observed mean charging price (the same
`lcos_charge_price` the LCOS calculation uses — one source). Gross is then charging
+ engine gross, so `gross − charging = engine gross` holds by construction rather
than by tolerance.

### 34.2-B — percentage base for the three fee lines

The optimiser/grid/market lines take `gross_market_revenues` — the bridge's own top
line — as their base. It is the line the contract literally calls "gross revenue",
and it is the larger of the two candidate bases, so it is also the conservative
reading.

### 34.2-C — reconciliation calibration (the ±2% requirement)

Reference asset, before calibration:

- engine stack = RTM €840 350 + BRP €180 000 + OPEX €1 950 000 = **€2 970 350**
- client stack = 16% × gross €8 853 139 + €29/kW × 50 000 kW = **€2 866 502**
- delta **−€103 848 = −3.50%**

−3.5% is outside the contracted ±2% but inside the batch rule's ±5% band, which
directs "proceed with a documented constant". Applied: **€2.08/kW/yr** on the
operating line (€103 848 ÷ 50 000 kW), which brings the reference to **+0.01%**.

Two things were deliberately not done. The sourced €29/kW/yr build-up (O&M 18 +
insurance 5 + warranty 4 + BOS 2) was *not* silently rewritten to €31.08 — the
calibration rides alongside it as a separately named quantity so the assumptions
register can show both. And the constant is *not* re-fitted per project: doing so
would make every project agree with the engine by construction and destroy the
reconciliation's value as a check. A vitest re-derives the constant from the
reference asset and holds the committed value to it, so it cannot go stale unnoticed.

Post-calibration deltas: reference +0.01%, Bitėnai +0.34%, Stoniškiai −4.59%,
Eigirdžiai −5.71%.

**The two partial-year projects diverge for one identifiable reason,** not drift:
the engine charges its flat €180k BRP fee in full in a partial year (the 34.1-A4
conservative decision) while all four client lines are pro-rated. The gap equals
that fee's un-pro-rated remainder — asserted as such in the test suite, so if
anything *else* starts diverging the test fails. Reported in every output under
`cost_basis.reconciliation.partial_year_divergence`, not absorbed. Note the
direction: the client stack is lighter, so the bridge shows slightly *higher*
EBITDA than the engine for those two projects. Flagged for operator review.

### 34.2-D — CAPEX event timing

Augmentation (Y8) and replacement (Y15) count in operating years from COD, so they
land on the same operating year for every project and on the calendar year that
project reaches it (Bitėnai Y8 = 2035, Eigirdžiai Y8 = 2036). Maintenance is
pro-rated by operational months in a partial first year; the two events are not.
Per the 34.2 decision rule.

Note the scale of these events against the client's 8-line bridge: at the reference
asset, augmentation is €3.2M and replacement €10.2M against a ~€5.4M annual EBITDA.
Both land as single-year cash-flow craters in `pre_financing_cf`. That is the
contracted treatment (no smoothing, no reserve account), and it is worth the
operator's eye before the numbers reach the client.

---

## 34.3 — portfolio aggregation

### 34.3-A — calendar span runs to 21 years, not 20

The prompt specified a 2028–2047 portfolio timeline. With staggered COD that is
wrong by one year: Bitėnai and Stoniškiai run 2028–2047 but Eigirdžiai, starting
2029, runs to 2048. Truncating at 2047 would drop a full operating year of the
third project and break `portfolio = Σ projects` — which the same prompt names as
the tie-breaker ("prefer the interpretation that keeps portfolio = Σ projects
exact"). Span is therefore 2028–2048, 21 calendar years, and the assert holds.

### 34.3-B — portfolio "Y1" means the first calendar year, not any project's Y1

With staggered commissioning these are different things. Portfolio Y1 = calendar
2028 = Bitėnai (12 mo) + Stoniškiai (7 mo) + Eigirdžiai (absent). Each consolidated
row carries a `contributors` array naming who is in it and for how many months, so
the number is never a bare total whose composition has to be inferred.

### 34.3-C — NPV basis is pre-financing and PRE-TAX

The contracted 8-line bridge has no tax row, and debt/interest/DSCR are excluded
from the engagement, so the portfolio NPV discounts the bridge's `pre_financing_cf`
directly. That is **not** comparable with the engine's `npv_at_wacc`, which is
post-tax. Rather than invent a tax treatment the client did not ask for, each
project carries `engine_npv_post_tax` alongside `npv_pre_financing_pre_tax` and the
basis is spelled out in the output. **Operator eyes needed:** if the deliverable is
to quote a single NPV, it should be the post-tax one, which means adding a tax line
to the bridge — a scope question for the client, not a modelling call for CC.

`t = 0` is the first CAPEX draw year (2027), matching the engine's convention that
CAPEX lands at `cod_year` and revenue begins the year after. Each project draws in
its own year, so Eigirdžiai is discounted from 2028 rather than penalised at t=0.

### 34.3-D — MOIC and NPV read one array

`buildCashflows()` produces a single `{cal_year, t, capex_outflow, operating_cf,
net_cf}` array; NPV discounts it, MOIC divides Σ operating by Σ CAPEX. Pinned by
test, so the two can never drift onto different cash flows.

### 34.3-E — no portfolio-effect maths

Correlation is disclosed as data (`lt_zone_price_correlation: 0.97`,
`spatial_diversification: "negligible"`), and a test asserts consolidated revenue
carries no uplift over the plain sum. Three 2-hour BESS in one price zone bidding
into the same markets have no diversification benefit to claim.

---

# Phase 34 batch-2 — `phase-34-batch-2`

Same rules, plus one more: **`workers/fetch-s1.js` is READ-ONLY for the whole
batch.** Anything that looked like it wanted a worker edit is logged below as a
batch-3 candidate and solved at the runner level instead. `git diff main --
workers/` is asserted empty at the wrap.

---

## 34.4 — client scenarios + sensitivity

### 34.4-A — driver mapping: none of the six is reachable through `params`

Pause-A verification first, per discipline rule #1. The prompt's expected
mappings were hypotheses; two of the three it named were right about *where*
the driver lives and wrong about whether it can be reached.

Every one of the six client drivers is a **module-level constant selected by
the scenario NAME**, not a value the engine will accept from `params`:

| Driver | Engine binding | Site | Reachable via `params`? |
|---|---|---|---|
| `fleet_realisation_pct` | `PIPELINE_REALISATION.base` | `projectFleet()` — looked up by scenario string | **no** |
| `spread_growth_pct_yr` | `SPREAD_GROWTH.base` | `computeTradingMix()` — looked up by scenario string | **no** |
| `availability_pct` | `REVENUE_SCENARIOS.base.avail` | energy-stacking constraint + `rev_trd` chain | **no** |
| `trading_realisation` | `TRADING_REALISATION.base` → `sc.trd_real` | `rev_trd` chain + `T_base` | **no** |
| `cap_price_delta_pct` | `capPrice()` return | feeds `R_cap` in `computeTradingMix()` | **no** |
| `cpi_floor` | `cpiCurve()` floor | `cpi_{fcr,afrr,mfrr}_at_cod` only | **no** |
| `optimiser_pct_gross` (sens.) | `bridge.mjs COST_DEFAULTS` | client 4-line cost stack | **yes — runner-level already** |
| `rte_decay_pp_yr` (sens.) | `RTE_DECAY_PP_PER_YEAR` | `rteCurveFor()` | **no** |

`computeRevenueV7(params, kv)` takes `params.scenario` as one of three strings.
So the only driver values the engine can produce are the three sets the worker
ships, and the client's Downside/Upside values are not among them —
`fleet_realisation` 65/35 vs the shipped 0.53/0.62, `availability` 95/98 vs
0.96/0.94, and so on. The prompt's specific guess that `fleet_realisation_pct`
maps to `fleet_context.pipeline_realisation` is half right: that field is the
engine's *echo* of `PIPELINE_REALISATION[scenario_name]`, an output not an
input. It is used below as the verification signal precisely because of that.

### 34.4-B — the runner-level mechanism: source overlay, not post-hoc adjustment

The prompt directed post-hoc adjustment of the affected revenue lines for
unreachable drivers. **Rejected, and this is the batch's one substantive
departure from a prompt instruction.**

A post-hoc multiplier is a second implementation of the engine's maths living
next to the first. Its failure mode is a plausible wrong number that nothing in
the repo can contradict — precisely the class of defect the ±2% reconciliation
and the tie-out asserts exist to prevent, and a direct violation of rule #4's
one-canonical-source principle. For a €10k deliverable whose selling point is
an independent, checkable model, that is the wrong trade.

Built instead: `tools/consultancy/scenario-overlay.mjs`. It reads the worker
source, substitutes the six constants by **exact anchored replacement**, and
imports the result as a separate ES module instance via a `data:` URL (the
worker's relative imports rewritten to absolute `file://` so they still
resolve). Nothing is written to disk; `workers/fetch-s1.js` is never modified.
A scenario run is then the engine's own arithmetic under different constants,
not an approximation of it.

Three properties keep it from being clever-but-fragile:

1. **Every anchor must match exactly once** or the load throws
   (`OverlayAnchorError`). A worker edit that moves a constant fails loudly
   instead of silently returning unperturbed numbers. Pinned by test.
2. **Every driver verifies against the engine's own echo.** Five of the seven
   overlay drivers are reported back in the engine output
   (`fleet_context.pipeline_realisation`, `fleet_context.spread_growth`,
   `assumptions_panel.availability.value`, `assumptions.trading_realisation`,
   `signal_inputs.afrr_cap`, `project.arb_energy_20yr[].rte`); each carries a
   `verify()` that asserts the substitution landed. A silent no-op is not
   possible.
3. **Central patches nothing.** Central's six values *are* the shipped base
   constants, so `patchSource()` skips every identity substitution and returns
   the source character-identical. Asserted by test.

**Batch-3 candidate (worker edit):** promote the seven constants to optional
`params` overrides — `params.scenario_overrides` alongside the existing
`params.project_config` seam — and delete the overlay. Same additive shape as
the 34.1 seam, so the public path stays byte-identical by construction. The
overlay exists only because the worker is frozen this batch.

### 34.4-C — two of the client's six drivers move nothing, and are reported as zero

Established empirically by `run-scenarios.mjs --verify-mapping`, not assumed.
This is the finding the operator most needs before the numbers reach the client.

**`spread_growth_pct_yr` — zero effect.** The constant is substituted correctly
(the engine echoes 0.02 → −0.01), but `SPREAD_GROWTH` enters revenue only
through `T_yr` in `computeTradingMix`, and `T_yr` is used only to set
`trading_fraction = min(0.70, T/(T+R) × 0.75)`. Observed `T/(T+R)` is ~0.965 in
Y1 and rises with renewable share, so the raw fraction is ~0.72 and **the 0.70
clamp binds in all 20 years for all three projects** (verified: `trading_fraction`
is 0.700 in years 1, 5, 10 and 20). The multiplier that actually widens
captured spreads in the revenue line is `mix.spread_mult =
spreadMultiplierYr(cal_year)` — a pure function of calendar year and Lithuanian
renewable share, with no scenario term at all.

Re-pointing the client's driver at `spreadMultiplierYr` was considered and
rejected: it would be inventing an elasticity the engine does not model, which
is exactly what rule #1 exists to stop. Reported as zero with the mechanism
named.

**`cpi_floor` — zero effect, by design.** `cpiCurve()` is called at exactly
three sites in `computeRevenueV7` — `cpi_fcr_at_cod`, `cpi_afrr_at_cod`,
`cpi_mfrr_at_cod` — all disclosure fields. The revenue path compresses through
`reservePrice()` (its own `floor_fraction` 0.04) and `bidAcceptanceFactor()`
(its own floor 0.50). The CPI floor being decoupled from revenue is deliberate
engine design, not an oversight: it is what keeps fleet status and MW edits
revenue-safe (no IRR gate). Reported as zero.

**Consequence for the deliverable.** Four of the six client drivers move the
numbers; the scenario spread is real and is dominated by `cap_price_delta_pct`.
But the client believes six drivers matter and two do not, and the sensitivity
table now says so explicitly. **Operator eyes needed** before delivery: this is
a defensible and arguably valuable finding ("your spread-growth assumption does
not drive this model; reserve capacity price does"), but it is a conversation to
have deliberately rather than to let the client discover in a tornado chart.

**Batch-3 candidate (engine, not just plumbing):** `trading_fraction` sitting on
its 0.70 ceiling in every year of every project — including the public reference
asset — means the S/D mix model is not discriminating at the current market
state. That is a pre-existing engine calibration question, not something this
phase introduced, and it deserves its own look.

### 34.4-D — sign sanity is read in the value frame, on the 20-year basis

Two framing decisions, both of which initially produced false breaches:

**Value frame, not probe-slot frame.** The down/up probe slots are already
ordered by economic outcome — the "down" slot holds whatever value the client's
Downside case carries. In slot terms every well-behaved driver looks 'direct'
and the check proves nothing. The question worth asking is whether a *higher
driver value* raises or lowers EBITDA, which is what "higher availability →
higher EBITDA" actually means. `observedDirection()` re-expresses in that frame.
`fleet_realisation_pct` and `optimiser_pct_gross` correctly read 'inverse'.

**20-year basis, not Y1.** The RTE curve is evaluated at `t = 0` in operating
year 1, so **every decay rate gives the identical Y1 number** and a Y1-based
check scores `rte_decay_pp_yr` as a dead driver. It is not — its 20-year swing
is €1.56M. Sign sanity and the impact ranking both run on the lifetime figure;
the Δ columns are reported on both bases.

### 34.4-E — the Central invariant is checked in-process, not against a stored artefact

`tools/consultancy/output/` is gitignored, so there is no committed batch-1
artefact to compare against. Pinning the batch-1 numbers into a fixture would
create the parallel literal rule #4 forbids and would go stale on the next KV
refresh. Instead `centralDiff()` runs `runPortfolio()` — batch-1's own entry
point — live in the same process against the same KV, and compares **every
bridge line in every calendar year, every per-project total, and the portfolio
NPV/MOIC/payback/CAPEX**. So the check measures code, never data drift.

Result: **exact, zero differing fields.** A companion test asserts a Downside
run *does* differ, so the invariant has teeth rather than passing vacuously.

### 34.4-F — the scenario name is pinned to 'base'

The overlay moves the constants the scenario name would have selected, so
`runScenario()` always drives the engine at `scenario: 'base'`. Passing
`'conservative'` or `'stress'` on top would apply a second, undeclared set of
deltas (different `rtm_fee_pct`, `opex_per_kw_yr`, `act_rate_*`,
`mwh_per_mw_yr_*`, `debt_margin_bp`, …) that the client never agreed to. The
client's scenario table is the whole scenario definition.

### 34.4-G — minor finding, logged not fixed

`assumptions_panel.rte.decay_pp_per_yr` is the hardcoded literal `0.20`, not
derived from `RTE_DECAY_PP_PER_YEAR`. It is a display label asserting a value it
does not compute — discipline rule #2's shape, on a public payload field. It is
correct today, so this is latent, not a live defect. **Batch-3 candidate:**
`decay_pp_per_yr: RTE_DECAY_PP_PER_YEAR * 100`. Not touched here because the
worker is frozen and it would move the public payload.

---

## 34.5 — assumptions register + reconciliation harness

### 34.5-A — the register is 44 rows, not 39

The prompt asks for 39 rows and then names a category breakdown — technical 7 ·
market 9 · saturation 4 · cost 7 · capex 5 · project-specific 3 ·
scenario-driver 6 — that sums to **41**. The arc doc and the client contract
both say "39-row register". The three numbers cannot all be right.

Decision: **build the coverage, not the count.** The breakdown is the
substantive spec (it says what has to be documented); 39 is a round number
carried forward from the arc doc. Built to the named counts everywhere except
CAPEX, where 5 rows cannot hold the schedule without dropping a real lever —
augmentation and replacement each have a year, a depth and a unit cost, and
`replacement_year` (a EUR 10.2M event at the reference asset) is not a
reasonable thing to omit to hit a target. CAPEX is 8. Total 44.

Three rows the prompt's breakdown would have duplicated were deduplicated
instead: `trading_realisation` and `spread_growth` are scenario drivers, not
separate market rows, and `pipeline_realisation` is a scenario driver, not a
separate saturation row. Having the same quantity in two rows is exactly the
parallel-literal problem rule #4 forbids, even when both rows bind to the same
source. Their slots went to `cap_price_ceiling`,
`reserve_price_floor_fraction` and `lt_zone_price_correlation` — all real
assumptions that were otherwise undocumented.

**Operator decision needed:** the client-facing scope line says "39-row
register". It is now 44. Restating it as 44 is the honest option and the
schema test pins the number either way.

### 34.5-B — every row is bound; nothing is documented-only

The prompt allowed for unbound rows ("where a register value has an
`engine_binding`"). In the event **all 44 rows bind to live code**, through five
namespaces: `worker:` (anchored regex against the frozen worker source),
`engine:` (a field the engine emits), `bridge:`, `portfolio:`, `driver:` and
`config:`. So the register cannot contain an assumption the model does not
actually use, and cannot state a value the model does not actually hold. The
`rteMirror` pattern generalised from one constant to the whole surface.

Two details that make the binding real rather than decorative:

- `rte_decay_pp_yr` binds to `worker:RTE_DECAY_PP_PER_YEAR`, **not** to
  `assumptions_panel.rte.decay_pp_per_yr`. The latter is the hardcoded display
  literal from 34.4-G and would keep reporting 0.20 whatever the constant
  became — binding to it would have produced a test that passes while the
  register is wrong. Pinned by its own test.
- Worker-source extraction asserts each pattern matches exactly once, same
  discipline as the scenario overlay's anchors.

### 34.5-C — live-market rows sync from the frozen fixture

Capacity prices, clearing prices and fleet MW move daily. Binding those rows to
production would make the register's test a market-movement detector rather
than a code gate, and it would go red overnight for reasons no one can fix.
They sync from `fixtures/regression-kv.json` — the same fixture the public
regression gate uses — and carry `basis: "live-kv"` so the Excel and PDF
generators know to refresh them from the run that actually produced the client
numbers. `register.mjs --sync` regenerates against any KV.

### 34.5-D — the override mechanism never overwrites the derived value

`override` is applied by the runner in place of `value`; `value` is never
rewritten. So a Prosperus edit and the engine-derived figure stay side by side
and the delta is always visible in the register itself. `override: 0` is
honoured as an override rather than treated as absent — pinned by test, because
a zero fee or a zero delta is a legitimate client input.

### 34.5-E — internal bank runs 8 checks, not 7

The seven contracted identities are all present. One more was added:
`internal_8_all_years_tie` holds the three bridge identities across **all
twenty years**, not only year 1. The contracted seven are year-1 assertions;
an augmentation or replacement year is exactly where a bridge would break, and
those land in years 8 and 15.

73 internal assertions across 10 subjects (reference + 3 projects × 3 scenarios
+ 3 portfolios). All pass, exactly — the euro tolerances exist for integer
rounding across rows and are not being consumed.

### 34.5-F — external bank: the WARN/FAIL split, and the one live WARN

Per the prompt: FAIL-level for Central and the reference asset, WARN-level for
Downside and Upside. The reasoning recorded in every row: an external band is a
calibration signal rather than an arithmetic identity, and a deliberately
extreme scenario leaving a band calibrated on central-case market observations
is information, not error.

59 of 60 external checks pass. The single WARN is real and is worth the
operator's eye:

**Bitėnai Upside project IRR 33.2%, against the Clean Horizon Baltic band of
6–31%.** It clears the top of the published range by 2.2pp. That is what an
upside case is for — but it means the Upside column in the client deliverable
carries a return above anything Clean Horizon has published for the market.
Defensible with the driver stack stated (capacity prices +20%, pipeline
realisation 35%, availability 98%), and the harness surfaces it rather than
letting it pass silently. A test pins the existence of at least one WARN, so
the split cannot become untested by drifting into all-pass.

### 34.5-G — the harness is a permanent gate, not a one-off artifact

`reconciliation-report.json` is a deliverable (it feeds the Excel tab and the
PDF section) AND the same code is a vitest suite that runs on every future
change. That was the stated platform value of this phase and it is the reason
the checks are written as data with subjects and sources attached rather than
as bare assertions.

---

## 34.6 — Excel deliverable generator

### 34.6-A — exceljs, decided by spike rather than by reputation

The prompt named the requirement that decides the library: the scenario
selector needs a data-validation dropdown, INDEX/MATCH formulas, cell styling,
and (ideally) sheet protection with individually unlocked cells. A spike wrote
a workbook exercising all four, wrote it to disk, and read it back with a
fresh `Workbook` instance. All four survived the round-trip:

- dropdown — `dataValidation {type: 'list'}` read back intact
- formula — `INDEX(Data!B2:B4,MATCH($B$1,Data!A2:A4,0))` read back intact
- styling — column width, `numFmt`, bold, solid fill, strikethrough, merged
  cells and frozen panes all read back intact
- protection — `sheetProtection.sheet === true` with `B1.protection.locked
  === false`

The decision rests on that positive evidence, not on a claim about what
SheetJS CE cannot do. devDep only; nothing ships to the worker or the site.

### 34.6-B — the Bridge Y1 tab carries two blocks, because one would have lied

The first build put each project's own year-1 column next to the portfolio
year-1 column. The round-trip test caught that the columns do not sum — off by
€4.43M on gross.

The cause is 34.3-B, already decided: portfolio "Y1" is the first **calendar**
year (2028), while Eigirdžiai's own year 1 is 2029. Both readings are correct
and the client wants both, but side by side in one table they read as a
portfolio total that does not add up.

The tab now carries:

- **Block A — calendar 2028.** Each project's contribution to that year;
  Eigirdžiai is blank and labelled "not operating in 2028"; Stoniškiai is
  labelled "7 of 12 months". The portfolio column is the exact sum, verified
  line by line against `portfolio.json` (all 12 lines tie to the euro, checked
  across the full 21-year span as well).
- **Block B — each project's own first operating year**, headed with that
  project's calendar year and operating months, with **no total column** and a
  note saying the columns are deliberately not summed.

The revenue sub-line block and the cost sub-line block were moved onto the
calendar-2028 basis for the same reason.

### 34.6-C — the per-MW column divides by operational MW-years

`€k per operational MW-yr` divides the portfolio column by 74.25 MW-years —
nameplate weighted by months actually operated in 2028 (48 × 12/12 + 45 × 7/12
+ 30 × 0/12) — not by the 123 MW nameplate. Dividing by nameplate would
understate the figure by ~40% in the staggered first year, which reads as a
weak asset rather than as a partly-commissioned portfolio. The denominator is
computed from the contributor list the portfolio runner already emits, stated
on the tab, and pinned by test (it must be strictly below nameplate).

### 34.6-D — the ten contracted revenue lines are mapped, not invented

The contract names ten revenue lines. At annual resolution the engine computes
two revenue quantities (`rev_bal`, `rev_trd`) plus the rebuilt charging cost.
Presenting ten separately-settled cash lines would require splitting figures
the engine never computed.

The tab therefore states, per contracted line, which engine quantity carries it
and the formula the engine actually evaluates — transcribed from
`workers/fetch-s1.js`, not paraphrased from the contract. Three disclosures go
with it:

1. **No FCR revenue is claimed anywhere.** FCR enters `computeTradingMix` only
   as a saturation diagnostic; `R_yr` is built from aFRR and mFRR alone. The
   two FCR rows say so and are shaded. If Baltic FCR procurement deepens, that
   is upside outside these numbers.
2. **The capacity/activation split is indicative.** `rev_cap = rev_bal × 0.65`
   and `rev_act = rev_bal × 0.35` are the engine's reporting split, labelled as
   such on the row itself. `rev_bal` is the computed quantity.
3. **Intraday is not resolved separately** from day-ahead — the engine captures
   one blended spread. Stated on the two intraday rows.

Resolving all ten into settled cash lines is v1.0 hourly-dispatch scope.

### 34.6-E — deliverable-notes.json holds prose, but never a second copy of a fact

`deliverable-notes.json` is the single source for wording shared between the
Excel and the PDF, per the prompt. The rule applied while filling it: it holds
**prose the generators cannot derive**, never a restatement of something a
runner already computes.

Two things were removed from the draft on that basis:

- **The correlation disclosure.** The portfolio runner computes it
  (`portfolio.correlation_note`, LT zone correlation 0.97). A hand-written copy
  here would have been a second source for the same claim — rule #4. The key is
  now a comment pointing at the runner output, and both generators read the
  runner.
- **Two wrong glossary definitions**, caught against `docs/glossary.md`: CPI is
  the **Competition Pressure Index**, not a "cannibalisation-price index"; and
  a "NUS" entry was drafted for a term that appears nowhere in the codebase and
  was dropped entirely. The glossary now follows `docs/glossary.md` term for
  term, so the deliverable cannot define a term differently from the engine
  that computes it.

### 34.6-F — sheet protection is a signalling device, not security

The Assumptions tab is protected with an empty password and every `override`
cell individually unlocked. This is not a security control — an empty password
is trivially removed and it is meant to be. It marks which single column the
client is expected to edit and stops accidental typing into the engine-derived
columns. The tab also states plainly that overrides are applied by re-running
the KKME engine and that Excel does not recompute the model; the workbook must
not imply a live model it does not contain.

### 34.6-G — the scenario selector is a chooser over three real runs

`INDEX/MATCH` over the three pre-computed scenario columns, driven by a
validated dropdown. Every headline figure it displays came from a full engine
run under that scenario's six locked drivers. The tab labels it exactly that
("Selector over three pre-computed engine runs — not a live model") and repeats
that changing an assumption elsewhere in the workbook does not feed it. Pinned
by test: the six formulas must match the INDEX/MATCH shape, and the MATCH range
must resolve to the header row carrying the three scenario names.

### 34.6-H — one sign convention across the workbook

Deduction lines carry positive values under a `less:` label on every tab. The
first 20-yr CF build negated them, giving "less: maintenance CAPEX  −192,000"
against "less: maintenance CAPEX  192,000" two tabs earlier. Same convention
everywhere now; the bridge identities are asserted inside the emitted sheet,
not only in the source JSON, so a sign flip fails a test.

### 34.6-I — the generator refuses to build on inconsistent inputs

Before writing a cell, `loadInputs` asserts that every runner output agrees on
`engine_version`, that none was computed against an unverified KV snapshot, and
that the register row count matches the count the notes promise. A deliverable
assembled from a mixed run would tie out internally and still be wrong. Missing
runner outputs throw with the command to run, rather than yielding a partial
workbook — pinned by test against an empty directory.

---

## 34.7 — branded deliverable, PDFs, delivery packaging

### 34.7-A — the template is split by anchor and regenerated by section

The prompt asked for anchored replacement. Reading the template first showed
why that mechanism could not carry this job: `prosperus-deliverable-template.html`
is a **structure mockup**, and its numbers are placeholders typed into prose
(`€64.2 M`, `23 728`, `56.5 %`, `39 rows`) rather than tokens. Several hundred
of them, many inside sentences, several appearing in more than one context with
different meanings.

Anchored find-and-replace over that surface produces the worst possible
artefact: a document where some figures are real and some are mockup, with
nothing to distinguish them. The prompt anticipated this — *"surgical DOM-aware
substitution is fine; hand-editing numbers is NOT."*

So the split is by anchor and the regeneration is by section:

| Part | Content | Treatment |
|---|---|---|
| 1 | everything through `<body>` | verbatim — fonts, all CSS, print rules |
| 2 | banner → section 10 | **regenerated** from runner JSON |
| 3 | scope divider → EOF | verbatim — the greyed v1.0 upsell and pricing |

Both anchors are asserted to occur exactly once; a template edit that moves
them throws rather than silently dropping content. A test asserts the emitted
HTML still *starts with* part 1 and *ends with* part 3 byte-for-byte, so the
approved design and the upsell cannot be damaged by a generator change.

Part 2 contains **no numeric literals at all** — every figure is a read from a
runner output. That is what makes the consistency gate meaningful rather than
decorative: there is no path by which the document can carry a number the
engine did not produce.

### 34.7-B — the consistency gate, and why its placeholder blocklist had to change

`verifyDeliverable()` asserts positively (every headline, every bridge line,
every calendar year, every scenario, every sensitivity driver, every
reconciliation count, the four operator notes, the extended-scope stamp) and
negatively (no mockup placeholder survives).

The negative half shipped a bug that a live re-run exposed immediately. The
blocklist held the mockup's headline figures as literal strings, including
`€12.9 M` and `12 947`. On the next run against live KV the engine computed
gross Y1 = €12 947 097 — the mockup's placeholder and the real value collided,
and the gate failed a correct build.

A static blocklist of numeric strings is unsound: any placeholder can coincide
with a real value. The fix is to exempt values the run genuinely produced —
`must()` now records every asserted string, and a blocklist entry that appears
in that set is a coincidence rather than staleness. Textual markers
(`STRUCTURE MOCKUP`, `39 rows`) stay unconditional, because those can never be
legitimate output.

The gate's failure modes are themselves tested: six tests tamper with the
emitted HTML and assert the gate catches it. A gate that cannot fail proves
nothing. (Those tests replace *every* occurrence of a value, not the first —
a wrong number comes from one data read rendered in several places, so
tampering a single copy does not model the failure.)

### 34.7-C — the operator notes needed derived figures, not literals

The 34.6 notes were operator-verbatim literals. A live-KV re-run during the
34.7 build moved the model and left three of them asserting numbers the engine
no longer produced:

| Note | Was | Computed now |
|---|---|---|
| upside WARN | Bitėnai 33.2% | 33.1% |
| partial-year | 4.6–5.7% | 3.8–4.7% |
| dead drivers | €82.6M swing | €82.5M |

Shipping prose to a client that asserts a figure the accompanying model
contradicts is exactly what discipline rules #2 and #4 exist to prevent, and it
is worse than deviating from "verbatim" on a digit. The operator's **wording**
is untouched and stays operator-owned; the **figures** inside it are now
`{{TOKEN}}`s resolved at build time by `resolveNotes()` from the reconciliation
report, the sensitivity ranking and the per-project bridge-vs-engine deltas.

`resolveNotes()` runs inside `loadInputs()`, so the Excel and the PDF get the
same resolved sentence by construction — the notes stay a single source. An
unresolved token throws rather than shipping `{{WARN_IRR}}` to a client, and a
test asserts no deliverable contains a token.

The partial-year range is now *measured* across the projects whose first year
is partial, rather than quoted — which also means it names the right projects
automatically if a COD changes.

### 34.7-D — the cash-flow table gets its own landscape page

The 20-year table is one column per calendar year the portfolio spans — 21
years plus a total. On screen it scrolls inside `.cf-scroll`; a printed page
cannot scroll, and the first PDF silently clipped everything past ~2043.

Shrinking it to fit A4 portrait was tried and rejected at 6.2px: the columns
ran together and the figures were unreadable. Section 05 now carries
`page: cfpage` against `@page cfpage { size: A4 landscape }`, verified by
parsing the emitted PDF's MediaBox entries — page 7 is 843×596pt while every
other page is 596×843. All 21 years plus Σ are legible.

These print rules are emitted by the generator rather than living in the
template, because the column count is a property of the data, not the design.

### 34.7-E — the methodology annex is reproduced in full

The prompt scoped "4pp from docs/methodology.md". The document is 424 lines and
renders to 11pp. It is shipped complete rather than cut to a page target:
omitting methodology from a methodology annex is a worse failure than a long
annex, and any selection would be KKME choosing which limitations the client
reads. The annex says so on its first page — *"reproduced in full and unedited
… where the methodology states a limitation, that limitation applies to your
numbers too."*

Its palette is lifted from the template's `:root` block at build time rather
than re-typed, so the annex cannot drift into being a lookalike. `marked` was
added as a devDep for the markdown render (the unified/mdast packages present
in `node_modules` are transitive deps of react-markdown and are not safe to
depend on directly).

### 34.7-F — `build-all.mjs`, and what the one command guarantees

Runners → portfolio → scenarios → sensitivity → reconciliation → Excel → HTML
(+ gate) → PDFs → packaged bundle. Any stage failing stops the build; a
deliverable is not partially valid.

The guarantee is not that the build is convenient. It is that **every artefact
in the bundle comes from one run**. The Excel, the summary and the engine are
regenerated together and the gate proves they agree before anything is
packaged, so there is no window in which a stale workbook sits next to a fresh
PDF. `--offline` exists for rehearsal and stamps the console output with a
do-not-deliver warning; `--skip-runners` reuses existing runner JSON.

### 34.7-G — figures moved between batch-2 and the delivery build

The batch-3 prompt quoted NPV €43.3M / MOIC 3.73 from batch-2's run. The
delivery build recomputed against live KV and lands at **NPV €44.1M / MOIC
3.764**, 20-yr pre-financing CF **€151.9M**. Nothing changed in the engine or
the bridge — the runners re-fetched the Baltic market state, which is what they
are supposed to do.

This is worth stating plainly because it is a property of the product, not a
defect: these deliverables are computed at generation time against live market
data, so regenerating on a different day moves the numbers. The Excel, the HTML
and both PDFs in `output/delivery/` all carry the same figures from the same
run, which the gate verified. Anything regenerated later will be internally
consistent too — just not identical to what was delivered. The generation date
is stamped on the cover, the banner and the README for exactly this reason.
