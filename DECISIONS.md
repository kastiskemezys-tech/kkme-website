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

---

## Phase 35.1 — BESS Revenue Calculator: endpoint, auth, scenario port

### 35.1-A — the engine is calibrated at exactly two durations, and the calculator says so

The prompt asked to verify what `dur_h` values the engine supports before
designing validation rather than assuming. Swept 0.25h→10h against the frozen
KV fixture at 50 MW / mid CAPEX / COD 2028 / base. `net_mw_yr` is a **step
function** with three plateaus and no interpolation anywhere:

| `dur_h` | net €/MW/yr | what the engine used |
|---|---|---|
| ≤ 2 | 147 154 | 2h throughput constants, 2h RTE curve |
| 2 → 3 (exclusive) | 157 651 | **4h** throughput constants, **2h** RTE curve |
| ≥ 3 | 158 369 | 4h throughput constants, 4h RTE curve |

Every revenue-side duration branch is discrete (`mwh_per_mw_yr_da_{2h,4h}`,
`RTE_BOL.{h2,h4}`); only CAPEX scales continuously. So a 10h battery is modelled
as a 4h battery costing 2.5× as much, and its IRR is meaningless. The middle
band is worse than coarse — it is internally inconsistent, because
`computeThroughputBreakdown` branches on `dur_h <= 2` while `rteCurveFor`
branches on `dur_h >= 3`, so between 2h and 3h the two disagree about which
battery is being modelled. That band is a latent engine bug, not a feature; it
is not reachable from `/revenue` (DUR_MAP offers only 2h and 4h) and is left
untouched here rather than fixed inside a productisation phase.

**Decision.** Accept 0.5h–8h as the prompt specifies, and clamp the duration
handed to the engine to the nearest calibration point — 2h below 3h, 4h at or
above. The midpoint coincides with the engine's own RTE branch, so clamping
removes the inconsistent band by construction rather than by luck.

CAPEX is **compensated** rather than clamped: the engine derives
`gross_capex = capex_kwh × mw × dur_h × 1000`, so the clamped duration alone
would quote a 3h project at 4h CAPEX. The rate handed to the engine is scaled by
`actual_mwh / engine_mwh`, landing gross CAPEX on the user's true €/kWh × true
MWh. Revenue is the calibration point's; cost is theirs.

`inputs_echo.duration_note` states the calibration point, that CAPEX is
unclamped, and **the direction of the resulting bias** — overstated when
modelled above the actual duration, understated when below. Exact 2h and 4h
inputs (every Prosperus config and the public reference asset) clamp to
themselves and carry no note. Reporting the bias direction is the honest
alternative to silently picking a number the engine cannot produce.

### 35.1-B — a client scenario is a context, not a name

The 34.4 overlay reached six locked drivers by rewriting the worker's source.
Four sit on scenario-keyed tables and port by adding a key. The other two —
reserve capacity price delta and the CPI floor — are **global** in the engine
(`capPrice()`, `cpiCurve()`), and so is the observed base year, because the
overlay rewrote `REVENUE_SCENARIOS.base` itself, which is the object
`computeBaseYear` is handed.

The consequence only shows up in the bankability probe: `computeRevenueV7`
re-runs itself at `scenario: 'conservative'` to derive `min_dscr_conservative`,
and under the overlay that re-run saw the global substitutions too. A port that
resolved drivers from the scenario name alone diverged there — caught by the
parity check at ~0.01–0.02 DSCR, small enough to have shipped unnoticed.

So `params.client_scenario` carries the context explicitly and is passed into
the re-run. It is null for base/conservative/stress, where it resolves to ×1.0,
the built-in 0.30 floor and `REVENUE_SCENARIOS.base` — today's behaviour.

**Parity result:** worker-native `client_downside` / `client_upside` reproduce
batch-2's overlay output **exactly** for all three Prosperus configs, on every
field except the `scenario` label itself (correctly `client_downside` natively
vs `base`-with-patched-constants under the overlay). Central is byte-identical,
confirming Central ≡ base. Asserted in vitest against the live overlay, so the
port cannot drift from the numbers batch-2 published.

### 35.1-C — re-flooring the CPI curve was wrong, and the batch-2 test caught it

First attempt applied the scenario floor as `Math.max(floor, cpiCurve(sd))`,
reasoning that max() is idempotent above the built-in 0.30 and that below it the
floor "never binds in the Baltic range". The second half of that was an
assumption, and it was false: batch-2's driver-echo test failed, proving the
aFRR S/D ratio at COD is above 2.25 and Downside's 0.28 floor is a floor the
engine actually reaches. Re-flooring silently clamped it back to 0.30.

`cpiCurveScenario` now delegates to `cpiCurve` at the built-in floor — so every
pre-35.1 path has one evaluated path AND the overlay's textual substitution
still reaches the reported value — and restates the curve with the floor
substituted only for a genuinely different floor. That restatement is the one
duplicated formula in the port; a vitest sweeps `cpiCurveScenario(sd, 0.30)`
against `cpiCurve(sd)` across sd ∈ [0, 4] so it cannot drift.

`cpiCurve` itself was not re-parameterised: its text is load-bearing twice over
— the public `/revenue` path, and the 34.4 overlay's substitution anchor.
Re-parameterising it would delete the anchor and break every batch-2 runner.

This is discipline rule #1 applied to my own reasoning: a premise about what the
engine reaches is a hypothesis, and the existing test was the triangulation.

### 35.1-D — the 54/54 gate does not cover the route layer

Extracting `/revenue`'s KV assembly into `loadEngineKV()` so `/calculate` feeds
the engine from identical inputs (rule #4 — two copies of that key list is
exactly how the calculator and the public site drift apart) broke `/revenue`:
the route body still referenced the locals the block had declared. **The 54/54
regression gate stayed green through it**, because it calls `computeRevenueV7`
directly with a fixture KV and never exercises the route.

Caught by a route-level probe written for this phase, and then closed properly:
`/revenue` was replayed through the actual `fetch` handler for all 54 public
parameter combinations against **`main`'s worker**, output stripped of
`timestamp` — **54/54 identical**. Worth recording as a standing limitation of
the engine-level gate: any future change to route-level assembly needs its own
verification, because the byte-identity gate will not see it.

Permanent guards added: `loadEngineKV` is asserted to request exactly the nine
documented KV keys, and the worker source is asserted to contain exactly two
`await loadEngineKV(env)` call sites, so re-inlining a key list into either
route fails the suite.

### 35.1-E — tier separation is structural, not filtered

`buildSample` is a different function from `buildFull` and **never receives the
engine result** — it takes the four narrowed values it renders. A sample
response therefore cannot leak full-tier data by omission of a filter, because
there is no filter; the data is not in scope.

Tested at two levels: the built object's top-level keys must equal
`SAMPLE_ALLOWED_KEYS` exactly, no key in `FULL_TIER_MARKER_KEYS` may appear at
**any depth**, no array anywhere may reach 20 elements, and passing a bridge
object salted with `bridge_20yr`/`years` keys must not widen the output.

### 35.1-F — auth choices

`CALC_SECRET` is a new secret, never `UPDATE_SECRET`: the admin secret
authorises data mutation and must not be typed into a browser. Token is
`<expiry-ms>.<HMAC-SHA256("calc:<expiry-ms>", CALC_SECRET)>` — the expiry is
inside the signed message, so editing it invalidates the signature (tested). No
user or session store; there is one operator.

An invalid or expired token **degrades to the sample tier** rather than
erroring, so a stale localStorage token yields the public view instead of a dead
page. Login returns 503 when `CALC_SECRET` is unset — the pre-deploy state —
while the sample tier keeps working regardless.

Rate limiting is per-IP per-UTC-day in KV, 10 sample runs, full tier unlimited.
KV is eventually consistent so a cross-colo burst can overshoot slightly; that
is the right trade for a lead-gen form, where the alternative is a Durable
Object. Counter failures never fail a run — the calculator degrades open.

---

## Phase 35.2 — /calculator page

### 35.2-A — the build gate earned its keep: a single-column grid stretched the page

`npm run build` was green, all 1305 vitest tests passed, tsc and both lints were
clean — and the page still scrolled horizontally in a real browser. Every
component test renders to static markup, where nothing has a layout, so nothing
could have caught it.

Cause: the result sections sit in a single-column `display: grid` with no
declared template. An implicit grid track is sized `min-width: auto`, so the
20-year cash-flow table — 20+ columns inside its own `overflow-x: auto`
container — stretched its grid track, then `<main>`, then the document.
Measured `documentElement.scrollWidth` 1736 against `clientWidth` 1459, with
`<main>` reporting `clientWidth` 980 but `scrollWidth` 1496.

Fix: single-column grids declare `gridTemplateColumns: 'minmax(0, 1fr)'`, and
the section wrappers that hold wide tables carry `minWidth: 0`. Verified in the
browser before and after — `scrollWidth === clientWidth`, `<main>` back to 980,
and at a 390px layout width `main.scrollWidth === main.clientWidth` with zero
elements escaping a scroll container.

This is the Phase 18.1.1 precedent repeating in a new shape: green CI, broken
page. The gate is not a formality.

### 35.2-B — what the click-through actually covered

`npm run build && npx serve out`, then driven in Chrome:

- All five routes 200 (`/`, `/calculator`, `/intel`, `/methodology`,
  `/regulatory`); six sampled chunks from the built HTML 200.
- Built HTML emits `<link rel="canonical" href="https://kkme.eu/calculator"/>`
  — the 33.C relative-canonical pattern resolving correctly for a new route.
- **Compute against the real production worker** → HTTP 405 rendered as the
  page's honest error state. That is the pre-deploy truth (the route ships with
  the operator's `wrangler deploy`) and it proves the whole client path works:
  chunks loaded, React hydrated, handler fired, network call made, error
  rendered. No ChunkLoadError.
- **Both success tiers driven through the real client bundle** with genuine
  engine payloads captured from the actual worker `fetch` handler against the
  frozen KV fixture, injected by overriding `window.fetch` for the two
  calculator endpoints only. Sample tier: headline, 8-line bridge, SAMPLE
  treatment, CTA. Full tier: returns, expandable bridge, three scenarios,
  sensitivity, 20-year cash flow (augmentation in operating year 8 and
  replacement in year 15 both visible), reconciliation.
- Login flow: password → token → localStorage → full tier; token survived a
  reload; sign-out returned the page to the public view.
- Clamped duration: 50 MW / 150 MWh rendered the 3h → 4h note with the CAPEX
  basis and the OVERSTATED direction.
- Console clean — no errors, no hydration warnings.

Not covered locally: the live worker. `/calculate` and `/calculator/login` do
not exist in production until the operator deploys, so the success tiers were
exercised against captured-real rather than live-real payloads. The endpoint
itself is covered by the worker suite, which drives the actual `fetch` handler.

### 35.2-C — soft launch, asserted

`git diff main --name-only -- app/` is **empty**. The whole page is new files
under `app/calculator/`, and `grep -rn "/calculator" app` returns nothing
outside that directory — no nav entry, no footer link, no homepage mention. The
route exists only at its URL until the operator reviews it and decides.

### 35.2-D — the leak test at the UI level, and why it is not word-based

The first version asserted the rendered sample HTML contained no full-tier
section words, and failed immediately on "20-year cash flow" — which is in the
CTA, deliberately, because the CTA's job is to name what the full tier adds.

Rewritten to assert on full-tier **data**: no MOIC, no IRR, no NPV, no CAPEX
total, no sensitivity footer, no reconciliation, no expander, no 2038/2048
cash-flow columns, no scenario names. Plus a structural check that the rendered
`<h2>` set is exactly the sample's two headings, which scopes past the CTA copy
without depending on wording.

---

## Phase 36.B1 — Pause A (data audit + design verification)

Full audit: `docs/phases/phase-36-b1-pause-a-audit.md`. Nothing built; checkpoint
pending operator approval.

### 36.B1-A — the ENTSO-E token was never a blocker

The arc doc scheduled an operator action for day 1: register for an ENTSO-E API
token, 24-48 h approval, needed by B2. The token already exists — worker secret
`ENTSOE_API_KEY` (wrangler.toml checklist step 3) and locally in `.env.local` —
and `workers/fetch-s1.js` already calls A44 in four places. Probed live: LT
day-ahead hourly serves back to **2015-01-01**, LV and EE likewise. B2's data
dependency is satisfied today.

### 36.B1-B — 11 years of history, not 2, and that changes B2

The arc set "minimum viable history" at 2 calendar years. The real figure is
11+. The arc's own honesty constraint — that percentiles beyond a 2-3 year
sample are extrapolation — largely dissolves. Pre-Feb-2025 years remain
pre-synchronisation (BRELL), so the arc's rule stands: full sample for DA
shape, post-sync window only for balancing calibration.

### 36.B1-C — engine lives Node-side, decided on measurement not assumption

Benchmarked before deciding: `computeRevenueV7` = 16.0 ms for a full 20-year
projection; a scalar 8760 × 20-yr hour loop = 3.5 ms. Runtime does not
constrain the choice on either side. Decided `tools/consultancy/lib/dispatch.mjs`
on architecture: `engine.mjs:27` already imports the worker cleanly into Node,
so every canonical constant is reachable with no duplication, and with nothing
under `workers/` the `/revenue` byte-identity rule becomes true by construction
rather than by gate. Session 88's finding #2 — that the 54/54 gate does not
cover the route layer — is the reason "provable" is worth more than "asserted".

### 36.B1-D — the reserve-energy reservation needs no new assumption

`RESERVE_PRODUCTS[p].dur_req_h` (FCR 0.5 h, aFRR 1.0 h, mFRR 0.25 h) is the
prequalification energy requirement per committed MW, and it is already
canonical. Committing 1 MW of aFRR reserves 1.0 MWh of SoC headroom in each
direction. Today that physics is approximated by one scalar, `HEADROOM_DRAG =
0.70`. Replacing the scalar with the enforced hourly constraint is the phase's
reason to exist, and the delta between them is the headline reconciliation
number.

### 36.B1-E — `computeDispatchV2` overstates arbitrage revenue, logged not fixed

`workers/fetch-s1.js:848` applies RTE as a cap on discharge *power* while
decrementing SoC by the *delivered* energy, so a full cycle buys 1 MWh and
sells 1 MWh with no round-trip loss charged. `:950` then clamps net-negative
arbitrage days to zero. Both errors run toward overstatement, and the function
is public-facing (the dispatch card, and `dispatch:<date>:<dur>h` in KV). Also:
SoC resets to 0.50 each day (`:790`), `cycles_per_day_count` (`:928`) reports an
SoC range rather than a cycle count, and `annual_eur` is `daily × 365`.

Not fixed here. Correcting a live public revenue number inside a phase whose
entire risk story is "changes nothing public" would trade away that guarantee,
and the dispatch card sits on a route the 54/54 gate does not cover. Logged for
its own phase; raised to the operator as decision D2.

### 36.B1-F — the 15-min MTU transition is 2025-10-01

Probed: LT day-ahead is PT60M through 2025-09-29 and PT15M from 2025-10-01. The
worker comment at `:675` says "since Sep 2025", a month early. B3's backtest
window (2025-07 → 2026-06) straddles the boundary — roughly 3 months hourly, 9
months quarter-hourly. Recommended resolution (operator decision D1): average
15-min years down to hourly for B1's gates, which is the conservative direction,
and report the two-resolution delta at B3 as a measured test of the asserted
`RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14`.

### 36.B1-G — BTD is the sole reserve-price source, and it is down

ENTSO-E A84/A85/A86 return "no matching data" for LT and for the Baltic SCA, so
the arc's "BTD/ENTSO-E" for balancing is BTD alone. That feed has failed its
last 17 consecutive cron runs (TLS handshake abort; last clean run
2026-07-17), which is why `dispatch:*`, `trading:*` and `s2_btd_history` all
stall within days of that date. The deepest reserve-price series anywhere in the
estate is 110 daily points. B3's DA side is fully feasible; its reserve side is
not, on current data.

## Phase 36.B1 — Pause B (build)

### 36.B1-H — the export block, and a correction to 36.B1-C

Pause A decided the engine would live Node-side partly so that
`git diff main -- workers/` stayed empty and `/revenue` byte-identity became
true by construction. That did not survive contact with rule #4: `RESERVE_PRODUCTS`,
`RTE_BOL`, `sohYr`, `rteCurveFor`, `computeThroughputBreakdown` and
`computeDispatchV2` are all module-private, and a dispatch engine that cannot
import them would have to restate them — which is the exact duplication rule #4
exists to prevent.

Reuse outranks the convenience of an empty diff. `workers/fetch-s1.js` gains one
additive export block and nothing else. Export statements are compile-time
bindings and add no runtime path, so the guarantee is preserved by evidence
rather than by construction: the 54/54 engine gate is green, and
`scripts/_phase-36-b1-route-probe.mjs` drives the real `fetch` handler over all
54 public parameter combinations on this branch and on `main` and gets identical
responses.

### 36.B1-I — activation ENERGY comes from the throughput anchors, not act_rate

The first working version drove SoC drain from `sc.act_rate_afrr` / `act_rate_mfrr`.
Those are revenue coefficients in `computeTradingMix`; the energy quantity is
`mwh_per_mw_yr_*`, which is what `computeThroughputBreakdown` uses to derive the
678 EFC figure. Conflating them overstated activation energy ~4.6× and inverted
the charge/discharge balance (2 509 charge hours against 158 discharge hours).

Caught by the arc's own gate #3, not by inspection. Pinned by a test that triples
`act_rate_*` and asserts activation energy does not move.

### 36.B1-J — annual anchors pro-rate against a year, never against the window

`(mwh_per_mw_yr × MW) / hours` used `hours = prices.length`, so a 90-day run
received a full year's activation energy spread over 2 160 hours — 4× too much,
with no visible symptom. Full-year runs were correct, which is why it survived
the first round of checks. Phase 36.B3 replays day by day and would have
inherited it silently. Now `hours_per_year`, defaulted and asserted by test.

### 36.B1-K — charging cost is attributed to where the energy went

Stored energy leaves either as merchant discharge or as activation delivery, and
both were paid for on the same charge legs. Booking the whole charging cost
against arbitrage made the arbitrage line negative in 2021, 2022 and 2023 while
flattering activation. `revenue.attributed` splits it pro rata by delivered MWh;
`gross` is unchanged and a test asserts the split still sums to it. The raw
lines are kept alongside — this is an additional view, not a restatement.

### 36.B1-L — the policy will not buy energy the day cannot sell

The greedy policy charged whenever price fell in the cheap quartile, regardless
of whether the day's own shape could clear the round trip. On flat days that
books a guaranteed loss, which is not conservatism but a modelling error. Charge
now requires `discharge_threshold × RTE > price` — same-day, post-auction
information only, no added foresight.

### 36.B1-M — activation is modelled UP-ONLY, and the negative line is an artefact

Committed reserve MW is assumed called upward: SoC drains and the energy is
bought back. Real aFRR is symmetric, and a down-activation both fills the
battery and is generally paid for. The KV `trading:<date>:raw` archive carries
`afrr_up` and `afrr_dn` separately, so the asymmetry is visible in the data and
simply is not modelled yet.

With the whole canonical throughput anchor treated as up-drain, and activation
priced at the observed p50 (€13.5/MWh aFRR, €14.5/MWh mFRR — a heavily skewed
distribution whose monthly means run several times higher), the attributed
activation line comes out net negative. **That is a conservative artefact of an
incomplete model, not a finding that activation destroys value, and it must not
be reported as one.** Stated in the module header and in every output file's
`basis` block so it cannot travel without its caveat. Closing it is 36.B3/36.B5.

### 36.B1-N — gate #3 is reported as a documented deviation, not re-thresholded

The arc set dispatch-derived cycles within ±10 % of the throughput-derived
figure. The hourly run lands at 221 EFC against 678, and the decomposition is
the finding rather than noise: aFRR reconciles to +1.2 %, mFRR to −16 % (the SoC
reservation cuts committed MW), FCR to −100 % (DRR derogation), and DA to
−79 %. Re-thresholding the gate to pass would have buried exactly the result the
phase exists to produce, so it reports `pass: false` with
`expected_deviation: true` and carries the per-product attribution.

A second gate carries the defensible pass criterion instead: DA throughput must
fall in proportion to the MW that reserve commitment leaves free. Across
2021-2025 free-MW share runs 26.1-27.8 % and DA-achieved-against-revenue-anchor
27.5-29.4 % — agreement within ~2 pp every year, which is the physical sanity
check on the hour loop.

### 36.B1-O — the engine carries two DA throughput figures that disagree

Found while attributing gate #3, verified by reading both call sites rather than
inferred. Cycle accounting uses the full `mwh_per_mw_yr_da_2h` at nameplate
(`computeThroughputBreakdown`, :1287). Revenue bills the same figure scaled by
`trading_fraction` = 0.70 (`computeBaseYear`, :3178). So the shipped engine
charges cell wear for ~43 % more day-ahead throughput than it earns revenue on.

Both directions are conservative — more wear, less income — which is why it has
gone unnoticed. It is still a contradictory branch of the kind bankability
test #5 asks about. Reported, not changed: reconciling it is 36.B5's scope.

## Phase 36.B batch-2 — Part 0 (computeDispatchV2 micro-fix)

### 36.B0-A — the RTE defect is real, but its net effect is duration-dependent

Pause A's correction #17 said the energy-balance defect "inflates revenue". The
first half is confirmed exactly: `soc += maxCharge / mwh` credited the battery
with every purchased MWh, so a full cycle bought 1 MWh and sold 1 MWh and the
round-trip loss was never charged. Now `soc += maxCharge * rte / mwh`, matching
`lib/dispatch.mjs` — the loss is charged once, on the charge leg.

What #17 did not say is that the *same line* carried a compensating
understatement. `maxDischarge = arbMW * rte / 4` applied RTE a second time as a
cap on discharge **power**, which is not a physical constraint at all: an
inverter's rating does not shrink by its round-trip efficiency. Removing it
returns discharge to the full arbitrage MW, exactly as the hourly engine does.

Measured over every day of two real LT price years, reserves neutralised so the
arbitrage line is isolated (mean €/MW/day, 50 MW reference):

| year | dur | main | +guard | +RTE re-leg | full |
|---|---|---|---|---|---|
| 2024 | 2h | 180.9 | 181.6 (+0.4 %) | 164.3 (−9.2 %) | 165.5 (**−8.5 %**) |
| 2024 | 4h | 350.6 | 351.8 (+0.3 %) | 344.4 (−1.8 %) | 346.2 (**−1.3 %**) |
| 2025 | 2h | 209.4 | 209.7 (+0.2 %) | 196.7 (−6.0 %) | 197.2 (**−5.8 %**) |
| 2025 | 4h | 383.9 | 384.3 (+0.1 %) | 389.3 (+1.4 %) | 389.8 (**+1.5 %**) |

So the batch prompt's expected "≈ −40 % on arbitrage" is not what the corrected
maths produces — it is **−6 to −9 % at 2h and roughly flat to slightly positive
at 4h**. The two errors were largely offsetting, and which one dominates depends
on whether SoC or power is the binding constraint: at 2h energy is scarce and
the uncharged loss dominated, at 4h energy is plentiful and the bogus discharge
cap dominated. Rule #1 — the −40 % was a hypothesis, and it is now measured.

### 36.B0-B — the clamp was desynchronising the card from its own total

`Math.max(0, totalArbRev)` floored the reported arbitrage line at zero while
`daily_eur` had always carried the true negative. On the live KV day
(2026-07-14, 2h) the card published capacity €825 + activation €720 +
arbitrage €0 against a daily total of €1 376 — three components that do not sum
to their own headline, because €169/MW/day of loss was hidden. The same clamp
sat in `split_pct`, so the three shares summed to 112 %.

Both are unclamped. A day whose shape never covers the round trip loses money on
arbitrage and the honest number says so.

### 36.B0-C — the round-trip guard had to ship with the fix

The batch prompt's validation gate asks for computeDispatchV2's corrected daily
arbitrage to sit "within a small explained delta" of `lib/dispatch.mjs`. It does
not, on low-spread days, until the same guard the hourly engine gained in 36.B1-L
is present here: on a perfectly flat day p25 == p75, so `daPrice <= chargeThreshold`
is true in all 96 ISPs and the old policy charged in every one of them and booked
a guaranteed loss. Mirror delta on that shape was **−430 %** without the guard and
−13 % with it. It is one line inside the same function, it adds no foresight
(same-day, post-auction information only), and the gate cannot be met without it.

Mirror residual after the fix, over spread / flat / shallow shapes at 2h and 4h:
computeDispatchV2 lands **7-14 % BELOW** the hourly engine, never above. Two
causes, both revenue-removing and therefore conservative: it works a narrower SoC
window (0.10-0.90 of nameplate against the engine's 0.05-0.95 of SOH-derated
usable MWh), and it commits in 15-minute blocks so it reaches its bounds sooner
inside a price run. Pinned by `workers/__tests__/dispatchV2.test.ts`, which fails
if the card ever starts claiming MORE than the bankable engine.

### 36.B0-D — `da_hourly` is a 192-point 15-minute array read as 24 hourly prices

Found while quantifying the fix against the real KV inputs, not by inspection.
`trading:2026-07-14:raw` carries `da_hourly` with **192** entries — two days at
PT15M, the resolution LT day-ahead has used since 2025-10-01 (36.B1-F). But
`computeDispatchV2` does `daH = (daHourly || []).slice(0, 24)` and then indexes
`daH[Math.floor(i / 4)]`, i.e. it treats the first 24 quarter-hours as if they
were 24 hourly prices. **The card has been dispatching against the first six
hours of the day, stretched over 24, since 2025-10-01.**

The distortion is not subtle. Hourly-averaged, that day runs 146 → 12 (midday
solar trough) → 181 (evening peak), a €169 spread. The slice the function
actually sees runs 151 → 127 → 144, a €24 spread — and it is monotone early
morning, so the p25/p75 triggers fire on noise.

This is a larger defect than the one Part 0 was scoped to fix, and it is the
dominant term in what the live card currently shows. Raised at the operator STOP
rather than folded in silently — **operator directed it be folded into Part 0**,
on the grounds that one complete public correction beats two visible changes in a
week, that the RTE maths operates on inputs this bug corrupts (so the two
validate as one coherent check), and that the context was already loaded.

Fixed by `daPricesToHourly24`, which derives resolution from payload length and
averages sub-hourly points into the hour using the engine's established
`Math.round(h * N / 24)` bucketing (:4085-4098, Phase 31.A.2). Detection is by
length and never by date — a hardcoded cutover would be a label asserting
something it did not compute (rule #2), and the worker's own PT15M comment at
:675 is a month wrong, which is precisely how that fails. Exact divisors identify
resolution and day-count together (192 → 96×2, 96 → 96×1, 48 → 24×2, 24 → 24×1);
ragged DST lengths (23, 25, 92, 95, 100) fall back to a threshold and are pinned
by test.

### 36.B0-E — the live card cannot be verified today, for two independent reasons

`/api/dispatch?mode=realised` does not compute anything: it reads the
precomputed `dispatch:<date>:<dur>h` KV value written by the cron. Those keys
were last written **2026-07-17** for market day **2026-07-14** — BTD has been
failing since (36.B1-G, now 11+ days). So deploying this fix changes the
realised card **not at all** until BTD returns and the cron rewrites KV.

`mode=forecast` does compute live through `computeDispatchV2`, so it would show
the corrected number — but it returned `{forecast: null, reason: "DA tomorrow
publishes ~14:00 CET"}` on both durations at the time of writing.

Deploy remains correct and safe; post-deploy live verification is simply not
available on demand. Quantification was done instead by replaying the exact
stored KV inputs through both code paths locally, which is what the card will
show once the feed returns.

### 36.B0-F — two adjacent defects logged, deliberately not fixed

Kept out to keep the public delta attributable to exactly the mandated change:

- `capture_eur_mwh` (`:918-921`) silently substitutes a *theoretical*
  `(daMax − daMin) × rte × 0.5` whenever `totalArbRev <= 0`, so a losing day can
  publish a healthy-looking capture spread (€70.18/MWh on one shape tested).
  A display value asserting something it did not measure — rule #2 territory.
  Unchanged by this commit on the live path (9.97 / 10.09 before and after).
- The other #17 defects stand: SoC resets to 0.50 at each day boundary (no
  cross-day continuity), `cycles_per_day_count` reports an SoC *range* labelled
  as a cycle count, and `annual_eur = daily × 365` with no seasonality or
  availability haircut.

### 36.B0-G — the dispatch card's forecast panel is structurally dead

Checked because the operator planned to spot-check `mode=forecast` after 14:00
CET once deployed. It will not work, and not because of timing.

`/api/dispatch?mode=forecast` reads `daTomorrow.prices_24h || daTomorrow.lt_prices`
(:9835). Both writers of the `da_tomorrow` key store the return of
`npShapeMetrics` — `{lt_peak, lt_trough, lt_avg, se4_avg, spread_pct}` plus
`delivery_date` and `timestamp`. **Neither field is ever written.** The
`/da_tomorrow/update` endpoint accepts a raw `lt_prices` array but passes it
through `npShapeMetrics` and stores only the metrics, dropping the array.

So the branch can return exactly two things: `"DA tomorrow publishes ~14:00 CET"`
when the key is absent, and `"DA tomorrow prices empty"` once it exists. It has
never served a forecast. `TradingEngineCard` fetches it on every render and
silently gets null.

Not fixed here — it is a data-plumbing change (persist the hourly array
alongside the metrics), not a dispatch-maths one, and it would widen a commit
that is already carrying two public corrections. But it removes the only
on-demand live verification path, which is why 36.B0-E's replay-through-both-
paths is not merely a convenience.

### 36.B0-H — `extractPrices` silently DROPS negative-price hours

Found while reasoning about what `daPricesToHourly24` must tolerate. The regex is
`/<price\.amount>([\d.]+)<\/price\.amount>/g`, and `[\d.]+` cannot match a
leading minus. The expectation would be a lost sign; the reality is worse —
the whole element fails to match and is skipped, so a day with two negative
hours yields a 94-point array instead of 96 **and every subsequent index shifts**.

Verified directly: the pattern run over
`<price.amount>-5.2</price.amount><price.amount>10.5</price.amount>` returns
`[10.5]`.

Negative day-ahead hours are routine in LT summer solar troughs, so this is live.
2026-07-14 happens to bottom out at €8.9 and is unaffected, which is why the
figures in 36.B0-A/D are clean. `daPricesToHourly24` degrades sensibly on the
resulting ragged lengths rather than throwing, but the misalignment is upstream
of it and stays.

Not fixed here: `extractPrices` is shared with other routes, so correcting it
needs its own byte-identity analysis over every consumer. Logged as its own
candidate phase — and it is a prerequisite for trusting any negative-price
behaviour in the dispatch policy, including the charge-preferred-in-negative-hours
rule the arc specifies for B1.

## Phase 36.B batch-2 — Part 1 (36.B2 historical-year bootstrap)

### 36.B2-A — 2026 is not a shape-year, so the primary sample is five years

The batch prompt set the primary sample at 2021-2026. The committed 2026 file is
**57.5 % covered** (5 038 of 8 760 hours, year to date), and a partial year cannot
be replayed as an annual dispatch. Primary is therefore **2021-2025 (5 years)** and
the sensitivity is **2015-2025 (11 years)**, both complete at 100 % coverage.
Checked, not assumed — every other year in the estate is 100 %.

### 36.B2-B — the factor basis had to be the ATTRIBUTED revenue lines

The first working version took shape-year factors from `revenue.arbitrage`, the
raw line. `lib/dispatch.mjs` books the entire charging cost against arbitrage, so
that line is negative in 2021, 2022 and 2023 (36.B1-K). Ratios of negatives gave
2022 an arbitrage factor of **−1.401**, which scales the engine's trading revenue
through zero and out the other side — a nonsense distribution that still produced
a plausible-looking percentile table and three green gates.

`revenue.attributed` splits charging cost pro rata by delivered MWh and its
arbitrage line is positive in every shape-year, which is what makes it a valid
ratio base. `shapeYearFactors` now throws on any non-positive factor rather than
propagating one, and a test pins the 2022 case specifically.

### 36.B2-C — activation is measured but not applied

`activation_net` is negative in all eleven shape-years — the conservative up-only
artefact of 36.B1-M. Its variation between years is driven by attributed charging
cost, not by any day-ahead signal: activation energy comes from flat annual
anchors and its price is flat under D3. Scaling the engine's positive `rev_act` by
the ratio of two artefacts would import that artefact into a client deliverable,
so the factor is pinned at 1.0 and the measured ratio is carried beside it as
`activation_measured`.

Capacity's factor IS applied. It is small (0.81-1.02 across the eleven years) but
genuine: in low-price years the round-trip test bars charging, SoC drifts to the
floor, and a battery sitting empty cannot hold the up-reserve headroom its
committed MW implies — so committable MW falls. That is a real simultaneity
effect and precisely what this arc exists to surface.

### 36.B2-D — the sample cannot resolve P90 at all, and says so

Empirical exceedance percentiles on Weibull plotting positions: with N samples the
i-th smallest carries exceedance (N − i + 1)/(N + 1), so a sample of N resolves
only **[1/(N+1), N/(N+1)]**.

| sample | N | resolves | P50 | P75 | P90 | P99 |
|---|---|---|---|---|---|---|
| primary 2021-2025 | 5 | P17-P83 | ✓ | ✓ | **✗** | **✗** |
| sensitivity 2015-2025 | 11 | P8-P92 | ✓ | ✓ | ✓ | **✗** |

So the headline five-year sample **cannot produce a measured P90** — the debt-sizing
percentile. It is reported with `resolved: false`, clamped to the sample minimum,
and carries the reason string in the payload. Eleven years buys a genuine P90 and
still cannot reach P99 (that needs ~99 years).

This is the arc's honesty constraint made mechanical rather than editorial. An
advisor who sees `resolved: false` next to a P90 learns more than one who sees a
confident number built on five observations.

### 36.B2-E — P50 vs Central: −3.9 % on the primary sample, −22.8 % on the sensitivity

Both are correct, and the second is the more interesting number.

Factors are struck against a FIXED reference year (2025, the most recent complete
one) rather than against the sample mean, deliberately: normalising to the mean
would have made the P50-vs-Central gate tautological. Against a fixed reference the
gate can fail, and on the eleven-year sample it does — by −22.8 %.

That is not a reconciliation failure. Pre-crisis LT day-ahead ran at €34-50/MWh mean
(2015-2020) against €85-95 post-2021, and Central is calibrated on current market
state. The gap measures the regime difference, which is exactly why operator
decision D4 set the primary sample post-2021. Reported as `expected_deviation: true`
on the sensitivity run, following the 36.B1-N precedent; the primary sample is the
gated one and passes at −3.9 %.

### 36.B2-F — percentile bridges are built from whole shape-year paths

A per-year percentile table is a band, not a path: year 3's P90 and year 12's P90
can come from different shape-years, so reading down the column is not a scenario
anything could deliver. Both views ship, but the client bridges at P50 and P90 are
built from a single real shape-year's entire 20-year projection, named in the
output. That is what keeps the batch prompt's "every distribution input traceable
to a shape-year, no synthetic draws" literally true of the delivered bridge.

### 36.B2-G — what this distribution structurally understates

Reserve prices are flat across every shape-year under D3, so capacity revenue
varies only through committable MW and never through price. **The spread reported
here is a day-ahead spread.** Total revenue variance is larger — the reserve stack
is **67.9 % of Y1 gross and 71.9 % of lifetime gross** in the reference case, and
contributes almost no variance to this distribution. Carried as `reserve_basis: "calibrated-flat (see D3)"` in every
output payload so the number cannot travel without the caveat.

## Phase 36.B batch-2 — Part 2 (36.B3 dispatch backtest)

### 36.B3-A — trading realisation measures 0.7234 against an assumed 0.85

Twelve months of realised LT day-ahead prices, 2025-07-01 → 2026-06-30, 365 days
evaluated, 349 traded, 16 declined. Volume-weighted **0.7234**; simple mean
0.7321; daily distribution min 0.187 · p25 0.628 · median 0.756 · p75 0.849 ·
max 0.997. Monthly volume-weighted range 0.654 (2025-09) to 0.815 (2026-05).

The measurement is **0.1266 below the assumption**, and it sits below the
register's own declared sensitivity range for that driver, `[0.78, 0.88]` — so
the range is understated, not merely the point value. Per the batch prompt's own
instruction, whatever it is, it ships: a measured 0.72 with a stated method beats
an assumed 0.85 sourced to an industry range.

### 36.B3-B — the denominator had to be the engine's own sort-and-dispatch

The register defines `trading_realisation` as "x of perfect foresight" against
the S1 **sort-and-dispatch** capture — sort a day's prices, charge in the
cheapest N intervals, discharge in the dearest N, take the spread. That is
`computeDayCapture` in the worker.

Restating it in the consultancy tree would have put the measured value on a
different denominator from the assumed value it is meant to replace, making the
two incomparable — which would have destroyed the entire point of measuring it.
So the function is exported and imported (rule #4). That is a deliberate
deviation from this batch's "Parts 1-2 are `tools/consultancy/` only" rule,
taken on the 36.B1-H precedent (*"reuse outranks the convenience of an empty
diff"*) and paid for with evidence: `/revenue` is byte-identical at the route
layer, 54/54, with the export in place.

The numerator is the same construct from the B1 policy: volume-weighted average
discharge price minus volume-weighted average charge price, on the same day and
the same asset with reserves neutralised.

### 36.B3-C — three look-ahead checks, run whether or not the answer was convenient

The prompt asks for a leakage hunt only if the figure exceeds 0.90. All three
checks run unconditionally, because a clean bill of health conditional on the
answer being comfortable is not worth having.

| check | result |
|---|---|
| no day beats perfect foresight | 0 of 349 days score > 1.0 (max 0.997) |
| headline below the 0.90 tripwire | 0.7234 |
| realisation uncorrelated with day quality | Pearson r = **−0.093** |

The correlation check is the substantive one: a policy that scored best exactly
on the widest-spread days would be a policy that knew which days those were. It
is very slightly NEGATIVE, which is the expected sign for a threshold rule (wide
days offer more spread than p25/p75 triggers can reach).

### 36.B3-D — declined days are excluded, not scored as zero

The policy declined to trade on 16 of 365 days. Scoring those as 0.0 would drag
the headline to about 0.69. It would also be wrong: refusing a spread that cannot
cover the round trip is the round-trip guard working, not a missed opportunity.
They are counted, reported separately, and excluded from both aggregates.

### 36.B3-E — the 15-minute uplift is measured at 0.0885 against an asserted 0.14

`RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14` is applied to the public dispatch card's
published capture. Operator decision D1(c) asked for it to be tested, and LT
day-ahead has been natively PT15M since 2025-10-01, so it is directly testable.

The committed year files average sub-hourly points into the hour under D1, so
`run-15min-delta.mjs` re-fetches the same days at native resolution and runs
`computeDayCapture` at 15 and at 60 minutes on identical days. Over **273
complete PT15M days**: weighted uplift **0.0885**, simple mean 0.0979, median
0.0815, range 0.0005-0.845.

So the asserted constant is roughly **58 % higher than measured**. Reported, not
changed — it is a worker constant on the public dispatch path, and this batch has
already made one public correction. `parseA44` gained an opt-in `keepPoints` flag
to make the measurement possible; the hourly path is untouched by default.

### 36.B3-F — the measurement is recorded in the register, NOT adopted

The prompt asked for `trading_realisation` to "become measured", with the assumed
value kept as a comparison row. Implementing that literally collided with two
things the register itself asserts:

1. `__tests__/register.test.ts` requires **every** row to carry an
   `engine_binding`, with a per-row assertion that the row's value equals what
   the code holds. `driver:<id>` resolves to the Central value in scenarios.json.
   A measured observation has no code constant to bind to, so adding it as a row
   means weakening a governance assertion.
2. Writing 0.7234 into the bound row would force scenarios.json to move with it —
   and moving the Central driver moves client IRR. That is a cutover, and the
   arc's standing rule is that new capability lands alongside and cutover is a
   separate, explicit operator decision.

Attempting it produced exactly these failures (4 register/deliverable tests red,
plus a schema error when the new row inherited the assumed driver's `[0.78, 0.88]`
range and fell outside it). Rather than re-fit the invariant to the change, the
measurement lands in the **changelog** — metadata, not a row — with the observed
monthly range attached, and the bound row gains a note pointing at it. The
assumption can no longer be read without meeting the evidence, and no delivered
number moved.

**This needs an operator decision.** Adopting 0.7234 is a one-line change to
`scenarios.json` Central. It will reduce client IRR. Giving `basis: "measured"`
rows a first-class unbound slot in the register is the cleaner long-term fix and
belongs with B6's assumption-versioning work.

### 36.B3-G — reserve realisation remains unmeasured, and says so

Operator decision D3, unchanged: BTD is the sole Baltic reserve-price source, the
deepest series anywhere in the estate is 110 daily points, and the feed has been
down since 2026-07-17. Only the day-ahead component is measurable. The backtest's
`basis` block states this, and states what else the number excludes — intraday
execution, bid rejection, imbalance exposure and balancing forecast error are all
outside it. It measures day-ahead policy quality and nothing more.

## Phase 36.B batch-3 — Part 0 (measured-value cutover)

Entries continue 36.B3's sequence because Part 0 IS the adoption of 36.B3's
measurement, taken as an operator decision dated 2026-07-28.

### 36.B3-H — the invariant was sharpened, not relaxed

The prompt's instruction was explicit: go through the register's governance
invariants "properly this time — re-fit the bindings and scenario resolution so
the invariants HOLD with the measured values, don't relax them."

Batch-2's four red tests all traced to one rule: *every row carries an
`engine_binding`, and its value is asserted equal to what the code holds*. A
measured-but-not-adopted observation has no code constant, so recording it as a
row meant deleting that rule.

The re-fit splits the rule in two rather than weakening either half:

| row kind | binding | must carry |
|---|---|---|
| live | asserted equal to the code | `engine_binding` |
| superseded | none, and none permitted | `basis: "superseded"` + `superseded_by` + `superseded_on`, no override |

`validateRegister` now enforces BOTH directions, which is strictly stronger than
before: an unbound row with no supersession declaration used to be caught only
by an assertion in the test file, and is now a schema failure in the library.
Superseded rows are excluded from `effectiveRegister` (provenance is not an
input), untouched by `--sync`, and rendered in the client workbook with the
override cell replaced by "superseded &lt;date&gt; → &lt;row&gt;". The per-row
test loop split too: live rows assert their binding, superseded rows assert
their pointer resolves to a live row whose value actually differs — so a
superseded row cannot quietly come back into agreement and start looking live.

Then the four "red tests" simply went green with the measured values in place,
because the values now tie to the code: the binding resolves through
`driver:trading_realisation` → scenarios.json Central → the shipped worker
constant, and all three moved together.

### 36.B3-I — the whole ladder had to move, because the public card shows all of it

The cutover names one value. `TRADING_REALISATION` holds five.

`RevenueCard` carries a base/conservative/stress selector and reads
`data.all_scenarios` for all three at once (`app/components/RevenueCard.tsx:1586,
1808`), and the regression matrix serves all three from `/revenue?scenario=`.
Moving `base` to 0.7234 and leaving `conservative` at 0.80 would have published a
"conservative" case whose trading assumption was *more optimistic* than the base
case — an internal contradiction on the public site, and precisely the class of
defect the arc's bankability row 5 exists to catch.

So the ladder moved with its anchor and kept its shipped 5pp steps
(0.6734 / 0.6234) rather than being re-invented. Two checks on that choice:

- it is the smallest change that preserves the existing structure — one anchor
  moved, no step re-derived, so nothing new was invented;
- the resulting rungs land inside the measurement's own daily distribution
  (p25 = 0.628, median = 0.756), so the ladder stays empirically plausible at
  every rung rather than merely arithmetically consistent. `stress` ≈ the
  measured p25 — "a year made entirely of bottom-quartile trading days" — which
  is a better-defended stress case than "20 % worse than an assumption".

A test now pins the steps, so a future edit to `base` alone fails loudly.

### 36.B3-J — Downside and Upside are the measurement's own monthly extremes

The prompt proposed monthly-min and monthly-max and asked for the choice to be
documented. Taken, at the exact figures rather than the rounded ones quoted in
the arc: **0.6535** (2025-09) and **0.8155** (2026-05), not 0.654/0.815.

The reason to prefer them over a spread around the point estimate is that they
are *observed*: an advisor can ask what the Downside case means and be told "the
worst month this policy actually had, on real prices", instead of "the central
value minus seven points". The register's declared sensitivity range is set to
the same band, so the disclosure and the scenario table are one number in two
places — with a test asserting they cannot drift apart.

It also fixes the batch-2 finding directly: the old range `[0.78, 0.88]` did not
contain the measurement. The new range contains its own value by construction.

The honest limitation, stated in the row: this is ONE market year, so the band
is an observed range and not a distribution. Twelve monthly observations from a
single year cannot separate seasonality from trend. The row says "remeasure
annually and widen the band if a second year disagrees", and the runner enforces
that a disagreeing remeasurement cannot silently re-cut the model (36.B3-K).

### 36.B3-K — the backtest runner became a remeasurement harness, and kept its refusal

`run-backtest.mjs` hardcoded `const assumed = 0.85`. After the cutover that
literal would have been a second, stale copy of a value the engine already holds
— rule #4 territory. It now reads `sc.trd_real` from the engine and reports
`engine_value` / `measured` / `delta` / `adopted`.

The interesting part is what `updateRegister` does with a *disagreeing* rerun. It
would be easy to make adoption the new default now that the operator has adopted
once. It does the opposite:

- **agrees** → refresh the row's provenance (source, window, day count, monthly
  band) and log "nothing moved". No value changes.
- **disagrees** → the bound row keeps its value, gains a `REMEASURED at …`
  pointer, and the changelog records the gap as pending an operator decision.

So next year's measurement can inform the model but cannot move it. That is the
same boundary batch-2 drew, preserved on the other side of the cutover — a
cutover is an operator decision every time, not just the first time. The
superseded row is explicitly left alone by both branches: history is not
rewritten by a later run.

### 36.B3-L — a cost constant moved as a consequence, and that is the reconciliation working

`OPERATING_CALIBRATION_EUR_KW_YR` went 2.08 → 2.56 and it is worth being clear
that this was not a decision.

The constant closes the gap between two cost taxonomies — the engine's
(RTM % + flat BRP fee + OPEX) and the client's contracted 4-line stack (16 % of
gross + €29/kW/yr) — **at the reference asset's revenue level**. Lower the
revenue and the client stack's percentage lines fall while the engine's two flat
lines do not, so the gap widens: €103 848 → €128 104, or €2.077 → €2.562 per kW.

`bridgeCalibration()` re-derives it from the reference asset and a vitest holds
the constant to that derivation — the mechanism 34.2 built precisely so this
could not go silently stale. It fired on the first change that exercised it. The
constant was re-derived, not re-fitted by hand, and the register row synced with
it. Without the move the reference asset stops closing within the contracted ±2 %
(it lands at −4.4 %, still inside the ±5 % decision rule but outside the tighter
promise).

Worth noting for B6: this is a second-order dependency between an assumption and
a reconciliation constant that no one would find by reading either file alone.
It belongs in the lender methodology's known-limitations list.

### 36.B3-M — the 15-minute uplift moves a card, not a model

The two adopted values look symmetrical and are not.

`trading_realisation` is a model input: it multiplies the arbitrage revenue line
in `computeRevenueV7` and reaches every delivered number. `RYSTAD_15MIN_UPLIFT_
DECIMAL` is read at exactly two sites, both inside `computeDispatchV2`, and both
are *display* fields on the public dispatch card
(`capture_eur_mwh_15min_uplifted` and the disclosed `uplift_factor_decimal`).
Grep confirms nothing else in the worker reads it. `/revenue` stayed 54/54
byte-identical across this commit, which is the assertion rather than the claim.

Per-route reach, which is the part that matters for the deploy:

| route | reads the constant | moves on deploy? |
|---|---|---|
| `/revenue` | no | no — 54/54 identical, asserted |
| `/api/dispatch?mode=realised` | indirectly | **no** — serves precomputed `dispatch:<date>:<dur>h` written by the BTD ingest cron; stored payloads carry the old factor (90-day TTL) |
| `/api/dispatch?mode=forecast` | yes, live | would — but the branch is structurally dead (36.B0-G) |
| `/api/trading`, `/api/trading/latest` | no | no — V1 path |

So the honest statement to the operator is: **this commit changes nothing the
site currently serves.** The realised card only moves once BTD returns (down
since 2026-07-17, 36.B1-G) and the cron rewrites KV, at which point the
parenthetical "with 15-min uplift" figure falls exactly 4.52 % (×1.14 → ×1.0885)
— €11.50 → €10.98/MWh at the last live capture. The unuplifted figure beside it
is unchanged.

It also gained a register row, which is the durable half of this change: a
public-facing constant sourced to a vendor note and never checked is exactly what
the register exists to prevent, and it had been sitting outside it.

### 36.B3-N — client impact, measured on the frozen fixture

Both sides of the table below are run against the **frozen KV fixture**, not live
KV. That is deliberate and follows the byte-identity gate's own reasoning: a
before/after on live KV would blend the cutover with a day's market movement and
attribute both to the decision. What follows is code-attributable in full.

Portfolio, Central (the delivered case):

| line | before | after | Δ |
|---|---:|---:|---:|
| Gross Y1 | €13 580 628 | €12 967 071 | −4.52 % |
| EBITDA Y1 | €8 432 335 | €7 881 307 | −6.53 % |
| Pre-financing CF Y1 | €8 135 335 | €7 584 307 | −6.77 % |
| Gross 20-yr | €364 885 003 | €350 316 248 | −3.99 % |
| EBITDA 20-yr | €193 094 020 | €179 359 512 | −7.11 % |
| Pre-financing CF 20-yr | €150 385 020 | €136 650 512 | −9.13 % |
| NPV @ 8 % | €43 333 457 | €36 379 208 | **−16.05 %** |
| MOIC | 3.728 | 3.387 | −9.15 % |

Three things in that table are worth saying out loud to the client.

**The gearing of the deltas is the story.** Revenue falls 4.5 %, EBITDA 6.5 %,
cash flow 6.8 %, NPV 16.1 %. Costs are largely fixed, and NPV discounts a
thinner margin — a 4.5 % revenue correction lands as a 16 % NPV correction. Any
conversation that reports only the revenue delta understates it by 3.5×.

**Downside is where it bites.** Stoniškiai's Downside NPV goes from €2 234 571 to
**−€1 299** — through zero. Eigirdžiai's falls 92 % to €130 798 and Bitėnai's
66 %. The portfolio's Downside NPV drops 81 % to €1 416 615. The Downside case
was always thin; at measured trading realisation it is marginal, and that is now
the honest statement of it. This is exactly the number a lender's advisor sizes
debt against, so it is better found here than in their model.

**Upside barely moves** (−3.1 % EBITDA Y1, −5.8 % NPV), because the Upside
driver rose to 0.8155 from 0.88 — a much smaller step than Central's. The spread
between cases has widened, which is the correct consequence of replacing a
narrow assumed band with a wider observed one.

All 133 reconciliation assertions still pass (73 internal, 60 external, 1 known
Bitėnai-Upside IRR warn, 0 fail), and the Central invariant is still EXACT —
Central reproduces the unpatched engine field-for-field. The model is internally
consistent at the new values; it is simply worth less.

## Phase 36.B batch-3 — Part 1 (36.B4 contracted-revenue overlay)

### 36.B4-A — a floor and a toll are different products, so both are computed

The arc asks for "blended + floor-only". It would be easy to read floor-only as
a reporting view of blended with the upside stripped for display. It is not:

- **BLENDED** — the contracted share earns `max(merchant, floor)`. The floor is
  an option the asset holds. Downside protected, upside retained.
- **FLOOR_ONLY** — the contracted share earns the floor and nothing else. This
  is the full-toll structure, and it is a *strictly lower* revenue path whenever
  merchant beats the floor.

At the reference asset, 50 % contracted over a 10-year term: blended 20-yr
EBITDA €74.16M, floor-only €73.11M against a merchant €74.03M. Blended is worth
€0.13M more than merchant; floor-only is worth €0.92M *less*. Reporting one as
a view of the other would have hidden a €1.05M spread between two structures a
client might actually be offered. Both are computed, and a gate asserts
floor-only can never exceed blended.

### 36.B4-B — the floor is measured against NET market revenue, and the share, and the months

Three places this construct can be quietly wrong, each pinned by a test:

1. **Against what.** The floor compares to the engine's `rev_gross`, which is
   already net of charging cost (the engine prices arbitrage on a captured
   spread). The client bridge's top line grosses charging cost back up — using
   *that* would let the cost of buying energy count towards clearing the floor,
   and the floor would bind less often than it should.
2. **Against which share.** The comparison is contracted-share merchant revenue
   vs contracted-share entitlement, never whole-asset revenue vs the
   entitlement. €4M of whole-asset revenue clears a €2.5M floor comfortably —
   but if only half the asset is contracted, the contracted half earned €2M and
   the floor binds. A test pins exactly this case.
3. **Over how many months.** A partial first operating year pro-rates the
   entitlement. Stoniškiai's first year is seven months; measured against a
   twelve-month floor it would appear short and the floor would bind spuriously
   in year one of every contracted case.

Binding is asserted exact at the boundary: short binds, equal does not.

### 36.B4-C — the conservative fee treatment is stated and quantified, not assumed away

The 4-line cost stack is applied to floor revenue exactly as to merchant
revenue. In a real full toll the offtaker takes the trading rights, so the
optimiser fee on the contracted share does not arise — meaning this overlay
**understates** the toll case's EBITDA.

Rather than pick a side, the overlay reports `toll_fee_understatement_eur` =
optimiser % × contracted revenue. The conservative number ships; the figure
needed to undo the conservatism ships beside it. An advisor who disagrees with
the treatment can adjust without re-running anything, which is the difference
between a conservative model and an opaque one.

The floor is also **nominal** — it does not escalate while opex does, so
protection thins in real terms across the term. Stated, not corrected: that is
how term sheets are usually written, and the direction is conservative.

### 36.B4-D — the percentiles come from B2's paths, not from a second distribution

The whole point of the phase is "what does a floor do to P90". That comparison
is only meaningful if the contracted P90 and the merchant P90 are the same
construct measured on the same sample. So `runBootstrap` was split: the
shape-year replay, the factors and the scaled projections now come out of
`bootstrapPaths()`, and B4 applies the contract to those exact paths. One
source, one sample, one method (rule #4). Rebuilding a distribution here would
have made the with/without delta a mixture of a contracting effect and a method
difference, with no way to separate them.

Result at the reference asset — lifetime gross, blended, term 10 yr, floor
€139 000/MW/yr (derived, see 36.B4-E):

| contracted | P50 | P75 | P90 * | lift P90 vs P50 |
|---|---:|---:|---:|---:|
| 0 % | €131.48M | €120.85M | €116.58M | — |
| 30 % | €132.00M | €122.86M | €119.26M | 4.2× |
| 50 % | €132.34M | €124.20M | €121.04M | 5.3× |

\* P90 is NOT resolved at five shape-years (the sample resolves [P17, P83]) and
is the sample minimum wearing a percentile's name — B2's honesty constraint,
carried through unchanged rather than quietly dropped because this phase would
read better without it.

The asymmetry is the product: at 50 % contracted the median rises 0.65 % and the
tail rises 3.8 %. A test asserts the tail must lift strictly *more* than the
median, so an overlay that merely added revenue everywhere would fail — it would
not be a floor.

### 36.B4-E — the illustrative floor is derived from the model, not asserted

A floor level had to come from somewhere, and rule #3 forbids putting an
unsourced number in a client-facing artefact. Rather than quote a tolling price
from a market note, the default is derived from the asset itself: **the level the
merchant case's Y1 net revenue exceeds in 75 % of shape-year outcomes**,
€139 000/MW/yr at the reference asset.

P75 and not P90 because P90 is outside what five shape-years resolve — a floor
written at an unresolved percentile would be the sample minimum with a
percentile's label on it, which is the exact failure mode B2 built machinery to
prevent.

Every output carries `counterparty_note` defaulted to "ILLUSTRATIVE — no
counterparty. Structure test at a model-derived floor level, not a term sheet
and not an offer received." `normaliseContract` **throws** if a live contract
(non-zero floor, share and term) carries no counterparty basis at all. A real
term sheet is `--floor <x> --term <n>` away; a floor that nobody can trace
cannot be run by accident.

## Phase 36.B batch-3 — Part 2 (36.B0-H negative-price parser fix)

### 36.B0H-A — the fix is one character class; the analysis is the phase

`/<price\.amount>([\d.]+)<\/price\.amount>/g` → `([-\d.eE+]+)`. That is the
whole change. Everything below is the answer to "and what did that break".

The character class now matches `parseA44` in `backfill-entsoe.mjs`, which has
always accepted negatives. That is not a coincidence worth glossing over: it is
why the committed 11-year price history is CLEAN and only the worker path was
affected. Two parsers over the same document format, one right and one wrong,
sitting in the same repo — a rule #4 violation that had never been noticed
because the two are on different sides of the runtime boundary. A test now
asserts they agree on the same document.

### 36.B0H-B — 125 corrupted days in the history, and the trend is the story

Counted over the committed LT day-ahead files (`data/da-hourly-LT-*.json`,
101 470 covered hours across 4 228 days), a "corrupted day" being any day
carrying at least one negative hour — the days on which the old regex would have
returned a short, index-shifted array:

| year | covered hours | negative hours | days with ≥1 negative | worst day | min price |
|---|---:|---:|---:|---:|---:|
| 2015-2019 | 43 824 | 0 | 0 | — | +0.12 |
| 2020 | 8 784 | 5 | 2 | 4 h | −1.73 |
| 2021 | 8 760 | 5 | 2 | 4 h | −1.41 |
| 2022 | 8 760 | 2 | 1 | 2 h | −0.04 |
| 2023 | 8 760 | 100 | **20** | 15 h | −56.55 |
| 2024 | 8 784 | 186 | **42** | 11 h | −19.96 |
| 2025 | 8 760 | 178 | **44** | 14 h | −23.58 |
| 2026 YTD | 5 038 | 61 | **14** | 8 h | −13.55 |
| **total** | **101 470** | **537** | **125 (2.96 %)** | | |

Zero before 2020 and better than one day in nine now. Solar build-out did this,
and it is accelerating — which means a defect that was genuinely harmless when
the regex was written became a live public-data defect somewhere around 2023 and
nobody re-checked. Worth carrying into B6's limitations list as a pattern, not
just as an instance: *an input assumption that was true when written*.

### 36.B0H-C — what the corruption actually did, on a real day

2025-03-22 LT, fetched from the Transparency Platform and committed as
`workers/__tests__/fixtures/entsoe-a44-LT-2025-03-22.xml`. Seven negative hours,
trough −€11.53.

| published field | old regex | correct | error |
|---|---:|---:|---:|
| hours returned | 17 | 24 | −7 |
| LT daily average | €11.68 | €6.78 | **+72.3 %** |
| daily swing (peak − trough) | €20.98 | €33.51 | **−37.4 %** |
| peak hour (UTC) | 16 | 19 | 3 h wrong |
| trough hour (UTC) | 11 | 12 | 1 h wrong |

The direction matters. The site **overstated the average price and understated
the arbitrage swing** — the headline number on `PeakForecastCard` — on exactly
the days when spreads were widest. And it did it while displaying a peak hour
that was three hours off, which is a rule #2 failure (a label asserting *when* a
value came from) arriving through a parser instead of through a display string.

The mechanism is worth stating precisely because the intuition is wrong: the
regex does not lose the SIGN, it loses the ELEMENT. Everything after the first
negative hour shifts down one index and gets re-labelled with someone else's
hour. Tests pin both the shift and the shifted peak/trough index.

### 36.B0H-D — per-route reach, and why almost nothing moves at deploy

`extractPrices` has four call sites, and none of them is in a route's read path:

| call site | reached from | route impact |
|---|---|---|
| `computeS1` LT/SE4/PL (`:4145-4147`) | cron + `GET /` | writes the `s1` KV key |
| `fetchBznRange` → `computeHistorical` (`:3795`) | cron + `GET /` | `rsi_30d`, `trend_vs_90d`, `pct_hours_above_20` |
| `fetchBznRange` → tomorrow | cron + `GET /` | `da_tomorrow` shape metrics |
| `/trading/push` (`:9743`) | BTD ingest POST | `body.da_hourly` → `dispatch:<date>` KV |

So:

- **`/revenue` — unaffected.** 54/54 byte-identical, asserted. The engine reads
  `s1.spread_eur_mwh` only as a FALLBACK when `s1_capture` is absent, and
  `s1_capture` comes from a different source entirely (see 36.B0H-E). It does
  echo `spread_eur_mwh` and `lt_daily_swing_eur_mwh` in its `signal_inputs` /
  `live_rate` disclosure blocks, so those echoed values were wrong on corrupted
  days — a disclosure defect, not a revenue one.
- **`/read` — moves, but not at deploy.** It serves the stored `s1` key, so it
  changes only after the next cron or `GET /` rewrites it. Six public components
  read it: `PeakForecastCard`, `SpreadCaptureCard`, `HeroMarketNow`,
  `SignalBar`, `StatusStrip`, `HeroBalticMap`.
- **`GET /` — moves immediately**, because it computes live. It is the refresh
  endpoint, not a card's data source.
- **`/api/dispatch?mode=realised` — moves only once BTD returns** and the ingest
  cron rewrites `dispatch:<date>` (down since 2026-07-17, 36.B1-G).
- **`/s1/history`, `/s1/capture` — unaffected** (36.B0H-E).

Stored KV was checked directly rather than assumed: in both the frozen fixture
and the live snapshot, `s1.lt_hourly_24` holds 24 values with a minimum of
€1.39. **There is no negative hour in the currently stored payload**, so nothing
the site is serving today is corrupted, and the fix will first bite on the next
negative-price day.

### 36.B0H-E — the capture path was never affected, because it uses a different source

Checked rather than assumed, and it is the finding that most changes the blast
radius. `computeCapture` — which produces `s1_capture`, `s1_capture_history`,
the rolling 30-day stats and the monthly aggregation — calls
`fetchEnergyCharts(today)`, a JSON API with its own parser. It never touches
`extractPrices`.

That is why the stored `s1_capture.history` carries perfectly correct NEGATIVE
charge prices (−€2.05, −€0.68, −€0.03 per MWh in the fixture): the asset was
paid to charge, and that path recorded it faithfully the whole time.

So the estate has **three** day-ahead price paths — energy-charts JSON (correct,
feeds capture), ENTSO-E via `parseA44` (correct, feeds the committed history and
every consultancy runner), and ENTSO-E via `extractPrices` (broken until now,
feeds the S1 signal payload). The first two were right; only the third was
wrong, and it is the one on the public signal cards. A B6 governance item: three
paths for one quantity is two too many, and the register cannot see any of them.

## Phase 36.B batch-3 — Part 3 (36.B5 degradation loop + dur_h + the throughput split)

### 36.B5-A — the dur_h band was not merely inconsistent, it was discontinuous the wrong way

Batch-35 reported a `<= 2` / `>= 3` branch mismatch. Measured, it is worse than
a mismatch. Twelve sites switched anchors at `dur_h <= 2` while `rteCurveFor`
switched at `>= 3`, so between 2h and 3h the engine ran a **2h round-trip
efficiency against 4h day-ahead throughput** — and the arithmetic consequence was
a step:

| dur_h | old gross Y1 | new gross Y1 | old IRR | new IRR | old EFC | new EFC |
|---|---:|---:|---:|---:|---:|---:|
| 2.00 | 7 999 249 | 7 999 249 | 0.2225 | 0.2225 | 678 | 678 |
| 2.01 | 8 519 008 | 8 002 555 | **0.2450** | 0.2214 | 874 | 676 |
| 2.99 | 8 519 008 | 8 293 660 | 0.1538 | 0.1469 | 587 | 520 |
| 3.00 | 8 553 517 | 8 296 277 | **0.1543** | 0.1464 | 585 | 519 |
| 4.00 | 8 553 517 | 8 553 517 | 0.1051 | 0.1051 | 439 | 439 |

Adding 0.01 h of storage raised Y1 gross by €519 759 (+6.5 %) and project IRR by
2.25 pp. A second, smaller step sat at exactly 3.00, where the RTE branch
flipped. **IRR rose with duration at both**, which is impossible: duration costs
capex and buys very little extra revenue. Any client sizing a 2.5h asset in the
calculator was reading a number off a mixed calibration.

One policy replaces all thirteen branches. Two properties earn it the right to
be applied everywhere at once:

- **On-anchor identity.** At `dur_h ≤ 2` the weight is exactly 0 and `durBlend`
  RETURNS the 2h value rather than recomputing it; likewise 4h. No float
  arithmetic touches an anchor, so /revenue — which serves 2h and 4h only — is
  byte-identical by construction, not by rounding luck. The 54/54 gate agrees.
- **Documented clamp.** Outside [2h, 4h] the policy holds the nearest anchor
  instead of extrapolating. A 1h or 8h asset is outside the calibration, and the
  honest answer there is the anchor, not a linear guess about physics nobody
  measured. Flat, and said to be flat.

The property test sweeps 1h → 8h at quarter-hour resolution: continuity, the two
flat regions, and strict monotonicity of IRR, cycling intensity and LCOS. The old
model failed the IRR monotonicity check at two points; the new one passes at all
28 intervals.

### 36.B5-B — aligning the throughput was a real choice, and the other direction was worse

36.B1-O found two day-ahead throughput figures. Cycle accounting used the full
anchor; revenue billed `anchor × trading_fraction × avail`. Two ways to close it:

1. **Raise revenue to the anchor** — drop `trading_fraction` from the revenue
   line. Increases published revenue ~43 %, and is flatly contradicted by B1's
   hourly simulation, which finds achieved day-ahead throughput at ~27 % of the
   revenue anchor. Rejected.
2. **Lower wear to the delivered figure** — charge cell ageing on the energy the
   model says actually moves. Physically correct: you cannot wear cells with
   energy you did not move.

(2) it is, and it is worth being explicit that this is *not free*: less cycling
means slower degradation means higher IRR (+0.9 % relative on the reference
asset). A consistency fix that happens to improve the answer deserves more
scrutiny than one that worsens it, which is why the external-benchmark
consequence below was chased rather than accepted quietly.

Two implementation details that matter:

- The revenue base stays the **anchor**, because the year loop applies
  `trading_fraction × avail × deg_ratio × op_frac` itself, per year.
  Pre-multiplying at the source would have double-counted the very factor being
  aligned — caught by the Y1-gross-unchanged assertion, which is in the test
  suite precisely to catch it.
- Availability now lands in exactly **one** place. The first cut applied it
  inside the breakdown and left the LCOS denominator's own `× sc.avail`
  untouched, haircutting the same energy twice. `total_efcs_yr` is now
  unambiguously delivered throughput and no consumer re-applies anything.

The V6 fallback path was aligned too. It never runs in production, but leaving
two paths disagreeing about how fast a battery ages inside a phase named
"internal consistency" would have been absurd.

### 36.B5-C — the alignment breaks an external benchmark, and the band did not move

`external_3_cycles_yr` holds the modelled cycling against [550, 720] EFC/yr from
Modo / GEM measured merchant-battery research. The aligned reference asset comes
in at **498** — below the band, on Central and on the reference asset, which are
FAIL-level subjects.

The tempting move is to widen the band to [450, 720]. That is re-fitting evidence
to the model, and it is exactly what the register and the reconciliation harness
exist to make impossible.

What happened instead: `externalChecks` gained an `expected_deviation` field on
the 36.B1-N precedent. A check may declare, in code and with a stated reason,
that a breach is a known finding. **The band keeps its sourced value, the breach
is reported at full size, it is counted in the summary and printed by the CLI** —
the only thing lifted is the build-failing status. A test asserts the band is
unmoved, that the actual is genuinely below it, and that no UNDECLARED breach can
survive. The client workbook renders these as `DECLARED` carrying the reason,
rather than as a bare FAIL a reader cannot interpret.

And the finding itself is worth more than the gate: the engine's stacked
reserve + day-ahead model now says its asset cycles LESS than the observed
merchant fleet does. B1's hourly physical simulation says so more strongly still
(221 EFC/yr). Two independent routes agreeing that the modelled asset
under-cycles points at the benchmark fleet carrying a different reserve/day-ahead
mix than the modelled stack — a calibration question, carried to B6, not a reason
to move a band.

The register followed the same rule. `cycles_efc_yr` (678 → 498) and
`cycles_per_day` (1.86 → 1.36) had the observed band as their declared
`sensitivity_range`, and the new values fall outside it. Rather than widen it, the
band moved to a new `benchmark_band` field with its source and the direction of
the miss, and `sensitivity_range` went null. The row now says "here is the
observed band, and here is where the model sits relative to it" instead of
quietly containing itself.

### 36.B5-D — the loop closes, and it closes onto B1's number

The dispatch↔SOH loop is a fixed point: the assumed cycling rate picks the SOH
curve, the SOH curve sets the usable energy window, the dispatch realises a rate
of its own, and until now nothing compared the two.

Reference asset, LT 2025 shape replayed across a 20-year horizon, prices and
policy held fixed so the residual is attributable to the loop alone:

| pass | cd in | realised | cd out | \|Δ\| |
|---|---:|---:|---:|---:|
| 1 | 1.363315 | 0.631921 | 0.631921 | 7.31e−1 |
| 2 | 0.631921 | 0.609179 | 0.609179 | 2.27e−2 |
| 3 | 0.609179 | 0.609179 | 0.609179 | 0 |

- **open loop 1.3633 c/d (498 EFC/yr) → closed loop 0.6092 c/d (222 EFC/yr)**
- SOH at year 20: 63.23 % → 66.50 %
- lifetime dispatch revenue on the fixed shape: €70.9M → €79.6M (+12.19 %)

**222 EFC/yr against B1's independently-measured 221.** Two different routes —
one a gate on a single-year hourly run, one a multi-year fixed point — landing on
the same physical answer is the strongest corroboration this arc has produced.

**The arc's two-pass claim is wrong, and is reported wrong.** The arc states the
loop "converges in 2 passes for realistic parameters (verify)". Verified: it does
not. The residual after two passes is 2.27e−2 c/d — 3.60 %, against a 1e−3
tolerance. Convergence takes **three**. Re-describing two passes as convergence
would have been the easy sentence; the runner reports `within_tolerance: false`,
the residual, the gap to the converged value, and the measured contraction ratio
instead. The methodology gets the honest number.

This stays a Node-side capability. It moves no published number: closing the loop
in the shipped engine would take the model to 222 EFC/yr and a materially higher
IRR, which is the hourly-engine cutover the arc reserves as a separate operator
decision (Phase 37). What this phase delivers is the measurement of what that
cutover would be worth, plus proof the iteration is well-behaved enough to base
one on.

## Phase 36.B batch-4 — Part 0 (repo hygiene) + Part 1 (run registry)

### 36.B6-A — `logs/btd.log` was never repo content

Tracked by accident in `f551934` (the v7.2 frontend commit) and rewritten by the
local BTD/Litgrid fetch cron on every run since, so it has been permanently
"modified" in every working tree — every session handover from 19 onwards lists
it under "left as-is". It blocked a rebase and contributed to two stale deploys
on 2026-07-29.

`git rm --cached` (the local file stays — it is the evidence base for the 36.B1
Pause-A feed-failure audit, 178 parsed runs) and `.gitignore` widened from
`logs/*.log` to `logs/`, because the pattern that let one log in would let the
next one in too. `git ls-files logs/` was checked first: that one file was the
only thing tracked under the directory.

### 36.B6-B — run_id is a content fingerprint, not an invocation counter

`run_id = <runner>-<12 hex of sha256(engine_git_sha ‖ input_hash ‖ output_hash)>`.

A random UUID per invocation answers "which invocation was this". It cannot
answer the question a lender's advisor actually asks — *"can I reproduce this
number?"* A content fingerprint can: re-running the same engine over the same
inputs yields the SAME run_id, so a reproduction is self-evident and a failure
to reproduce is a finding rather than an ambiguity.

The cost is accepted deliberately: the registry can carry one run_id twice.
That is a recorded reproduction, not duplication — each line carries its own
timestamp — and deduplicating would delete the evidence. Pinned by a test that
asserts two identical runs append two lines with one id.

For the fingerprint to mean anything, `output_hash` must be computed on what the
run COMPUTED rather than on when it ran, so `generated_at`, `synced_at`,
`fetched_at`, `timestamp` and the `run` block itself are stripped before
hashing. Declaring `run` volatile is what lets the stamp live inside the payload
it describes without perturbing its own hash.

`canonicalJson` drops `undefined` object values rather than hashing them as
`null`, so the hash describes the PERSISTED form — `JSON.stringify` drops them
on the way to disk, and two byte-identical files that hashed differently would
have made the whole mechanism unsound. Caught by the test, not by inspection.

### 36.B6-C — the engine sha carries `-dirty`, and the registry does not dirty itself

A number produced from an uncommitted tree is not reproducible from the repo
alone. `engineGitSha()` says so with a `-dirty` suffix rather than implying a
clean provenance it does not have.

One exclusion, and it is principled rather than convenient: `runs.jsonl` itself
is excluded from the dirty check. It is an append-only LOG of what the code did,
not an input to it, so a build would otherwise mark itself dirty purely because
it had just recorded itself.

The committed registry starts at the batch-4 delivery build. Rehearsal runs made
against a dirty tree while the tool was being written are runs of a tool that had
not shipped, and seeding the governance log with them would have made its first
dozen lines noise.

### 36.B6-D — one funnel, and `writeOutput` was deleted rather than left beside it

All eleven runners now emit through `lib/runs.mjs::writeRunOutput`, which stamps
the payload, writes it, and appends the registry line as one operation.
`engine.mjs::writeOutput` — the bare writer five runners used — was removed, not
kept as a convenience: two ways to emit a runner output means one of them emits
an unregistered number, which is the exact hole the registry exists to close.

The stamp goes INSIDE the payload (`payload.run`) as well as into the registry,
so an output file handed to an advisor on its own still answers which engine,
which data vintage and which register version produced it.

`loadInputs()` refuses to build a deliverable from any runner output lacking a
run block, on the same footing as its existing refusals (mixed `engine_version`,
unverified KV). An untraced input is a number in a client report the registry
cannot account for.

### 36.B6-E — the delivery build has its own id, derived from the runs it consumed

`deliveryRunId()` fingerprints the SET of source run_ids plus the register
version, so the workbook, the HTML, both PDFs and the README all carry one id
and every one of them traces to the same eleven runner runs. Each artefact is
then recorded with a hash of its own bytes under that id.

The generation DATE is deliberately not in it: re-rendering identical numbers on
a later day is the same build, and minting a new id would imply a change that
did not happen. The date is already stamped on the cover, the banner and the
README (34.7-G) and is the right place for it.

The deliverable's consistency gate now asserts the run_id appears in the emitted
HTML, so a delivered document that does not name its own run fails the build.

## Phase 36.B batch-4 — Part 2 (assumption changelog + register versioning)

### 36.B6-F — the version hashes the model's INPUTS, and only those

`version.id` is `r<seq>.<first 8 hex of sha256 over every LIVE row's {id, value,
override}, sorted by id>`. Three properties, each chosen against an alternative:

- **Superseded rows are excluded.** They are provenance, not inputs —
  `effectiveRegister` already excludes them for exactly that reason — so
  rewording a historical row must not present itself as the model having
  changed. Pinned by a test that adds a superseded row and asserts the hash is
  unmoved.
- **Prose is excluded.** Label, note and source can be expanded without a bump.
  A version that moved every time someone improved a sentence would train its
  readers to ignore it.
- **`override` is included.** An override IS the effective value the runner
  uses, so a client edit changes what the model runs on and must move the
  version. `valueDiff` reports it as an override change so the changelog can say
  which kind it was.

`seq` counts MODEL changes, not tool invocations: `bumpVersion` on an unchanged
register is a no-op that refreshes the entry count and leaves the sequence
alone.

### 36.B6-G — the version and the content are welded together by the schema gate

`validateRegister` now fails when the stored hash does not describe the current
content — "a value moved without a version bump", with the exact re-run command.
Because the reconciliation suite and the register tests both call
`validateRegister`, a hand-edited value cannot reach a build.

The other half is `bumpVersion`, which **throws** when a value moved and no
`reason` / `source` / `decided_by` / `phase` was supplied. So a value cannot move
silently and cannot move anonymously. `register.mjs --sync` surfaces this as a
refusal that prints the moved values and the command that would authorise them.

This cost the existing tests their bare `{rows: [...]}` fixtures: a row-set with
no version is no longer a valid register. They build versioned fixtures now
rather than the invariant being relaxed to accommodate them — the 36.B3-H
precedent (*sharpen, don't re-fit*).

### 36.B6-H — `decided_by` is a closed vocabulary of four

`operator` (a human decision that moves delivered numbers) · `measurement`
(evidence recorded, no value moved) · `derived` (a consequential re-derivation
forced by another change) · `governance` (a change to the mechanism itself).

An open text field would let the interesting case — *a human moved this* — hide
inside prose. With four values the workbook can render operator decisions in a
different weight from consequential ones, which is the difference between a log
and an audit trail. The advisor's first question about any changelog is "who
decided this and did they know what it cost", and the schema now forces both
halves to be answerable.

The six migrated entries split 2 measurement / 2 operator / 2 derived, which is
itself informative: of the arc's four value movements, exactly two were
decisions and two were consequences of those decisions.

### 36.B6-I — the founding entries carry evidence, not just a delta

The three cutovers are the register's founding history, and an `old → new` pair
is not enough for the advisor who will ask where the number came from. Each now
carries an `evidence` block:

- **trading realisation 0.85 → 0.7234** — window, 365 evaluated / 349 traded /
  16 declined, volume-weighted and simple means, the full daily distribution,
  the monthly band with its months, the denominator (the engine's own
  `computeDayCapture`, imported not restated), the declined-day treatment and
  what scoring them zero would have read, all three leakage checks with results,
  the re-anchored ladder, the quantified client impact on the frozen fixture
  (NPV −16.05 %), and the one-market-year limitation.
- **15-min uplift 0.14 → 0.0885** — 273 complete PT15M days, the measurement
  method, and a per-route reach table showing `/revenue` untouched at 54/54.
- **cycling 678 → 498** — the cause, the direction NOT taken and why, both
  independent corroborations (B1's 221, B5's 222), the declared band breach with
  its source, and the honest note that a consistency fix which *improves* the
  answer deserves more scrutiny than one that worsens it.

`register_version` is null on all six: they predate the mechanism, and back-dating
a version onto them would be fabricating a history the repo cannot support. r1
pins the content as it stood when versioning was introduced; everything after
carries the version it produced.

### 36.B6-J — the remeasurement harness records but cannot bump

`run-backtest.mjs --write-register` now ends in `bumpVersion(out, {date})` with
no moved values. That is deliberate and load-bearing: a remeasurement records
evidence and never moves a bound value (36.B3-K), so the sequence must not
advance — and if the harness ever started moving one, `bumpVersion` would throw
for want of an attributable reason rather than quietly re-cutting the model.

It also stopped keeping its own copy of `REGISTER_PATH` and imports the
register's own. A remeasurement harness is not a second opinion about where the
register lives.

## Phase 36.B batch-4 — Part 3 (lender-grade methodology)

### 36.B6-K — the arc's "84.0 % simultaneity" is not reproducible, and the honest answer is a range

The batch prompt asked the methodology to carry "the 84.0 % simultaneity
measurement". Re-run across all five primary shape-years, no year produces it:

| shape-year | simultaneously achievable |
|---|---:|
| 2021 | 79.2 % |
| 2022 | 75.2 % |
| 2023 | 83.1 % |
| 2024 | 83.5 % |
| 2025 | 85.5 % |

The closest is 2024 at 83.5 %. Rather than print a figure that cannot be
reproduced, the methodology reports the **range 75.2–85.5 %** and says the
measurement is year-dependent — with the low year (2022, the price crisis)
explained: a wider day-ahead shape makes the SoC reservation cost more in
foregone arbitrage. Discipline rule #1 applied to a number in the prompt.

The 2025 decomposition ships beside it, because where the cost falls is the
finding: 88 % of the delta lands on **capacity**, not on trading. The constraint
does not mainly stop the battery trading, it stops it committing.

### 36.B6-L — two figures inherited from the arc log were stale, and were re-measured

Written into the document only after checking against the current engine:

- **Reserve stack share.** The arc log records 67.9 % of Y1 gross / 71.9 % of
  lifetime. Measured now: **71.1 % / 74.2 %**. It moved because adopting the
  measured trading realisation lowered the arbitrage line, which raises the
  reserve stack's share of the total. That direction is worth stating out loud
  and the document does: *the measured correction made the model more dependent
  on the component that has not been measured.*
- **The dur_h step table.** Its gross-revenue columns reproduce exactly today
  (2 h = €7 999 249, 4 h = €8 553 517) but its IRR and EFC columns were taken
  before the throughput alignment and now read 0.2246 / 498 and 0.1061 / 317.
  The table is kept in its original form — it is the evidence for the
  discontinuity — with a reading note giving the current values. Re-cutting it
  against the later engine would blur two separate corrections into one.

Also re-derived from the committed price files rather than transcribed: the
negative-hour lineage table (537 negative hours over 101 470 covered hours, 125
days = 2.96 %) reproduces the batch-3 figures exactly.

### 36.B6-M — the document is a display surface, so rule #2 applies to it

A methodology that asserts a value the code no longer holds is the same defect
as a card label that does — and it is worse, because a lender's advisor is
reading it precisely to check. `__tests__/methodologyLender.test.ts` binds every
quoted figure that has a live source: the trading-realisation ladder, the
client-scenario anchors, the sub-hourly uplift, the reserve prequalification
durations, the register version and row count, the category table's sum, the
`decided_by` vocabulary, and the cycling benchmark band with the model's
position relative to it.

The gate was proven to fail before being trusted: rewriting the ladder to the
old assumed values in the document turns the suite red and names the sentence.

**Historical measurements are deliberately NOT bound** — a backtest window, a
client-impact delta measured at a past commit. Those are records of what was
observed on a date, and re-cutting them against a later engine would destroy
their meaning. The distinction is the whole design: bind what the model *holds*,
never what it *observed*.

### 36.B6-N — the lender annex renders through the same wrapper, and carries KKME's name

`buildAnnexHtml` gained `sourcePath` / `title` / `lede` rather than a second
near-identical wrapper being written — rule #4 applied to branding, so the two
annexes cannot drift out of brand independently. The document renders at **25 pp**
A4, inside the 25-40 pp target.

It is named `KKME_Lender_Methodology_Annex.pdf`, not `Prosperus_*`: it describes
the engine rather than the engagement, so it ships with any delivery and is a
KKME asset in its own right.

## Phase 36.B batch-4 — Part 4 (render + regenerate + arc close)

### 36.B6-O — the delivery build ran on a fresh LIVE snapshot, and it verified

The build could have reused the cached 2026-07-28 snapshot. It captured a fresh
one instead, and the reconstruction reproduced live `/revenue` **exactly on all
22 verification fields** — including `cycles_per_year 498` and the
measured-basis IRR, which confirms the batch-3 cutover is what production is
actually serving.

That is the meaningful check: the client deliverable and the public site are
demonstrably the same engine on the same market state, not two things that
agree by assertion.

### 36.B6-P — regenerating moved the market-dependent tables, and the document was corrected

Between the 2026-07-28 snapshot the methodology was drafted against and the
2026-07-29 delivery capture, the forward projection moved:

| figure | drafted | delivery build |
|---|---:|---:|
| P50 lifetime gross | €131.48M | €128.53M |
| P75 | €120.85M | €118.66M |
| P90 (unresolved) | €116.58M | €114.63M |
| derived contract floor | €139 000/MW/yr | €137 000/MW/yr |
| years the floor binds | 4 | 5 |
| merchant 20-yr EBITDA | €74.03M | €71.27M |

Unmoved: every measurement. The simultaneity range, the shape-year factors, the
0.7234 realisation, the 0.0885 uplift and the degradation fixed point are
identical, because they are properties of committed price history and the code,
not of today's market state.

**That split is the point, and the document now states it explicitly** in a
callout: *"These figures move; the measured parameters do not."* The euro tables
carry an as-at stamp naming the capture date; the measurements do not need one
because they name their window.

The market-dependent figures are deliberately **NOT** bound by test. Binding them
would make the suite a market-movement detector rather than a code gate (34.5-C's
reasoning). What IS gated is the discipline: a test asserts the as-at stamps and
the callout are present, so a future edit cannot quietly drop the distinction and
let a projection read as a measurement.

### 36.B6-Q — the committed registry is one clean build, and the -dirty flag earned its keep

The first delivery build recorded `d02acf5…-dirty`, correctly: the methodology
had been edited after the last commit. Rather than ship a governance log whose
first entry says the engine was uncommitted, the document changes were committed
and the build re-run against a clean tree.

The mechanism worked as designed on its first real use — it caught exactly the
condition it exists to catch, on the person who wrote it.

The shipped registry is 28 lines: 22 runner runs covering the whole arc's
evidence (5 dispatch shape-years · 2 bootstrap samples · backtest · contracted ·
degradation · 15-min uplift · 4 project runs · portfolio · 3 scenarios ·
scenario summary · sensitivity · reconciliation) and 6 artefacts under one
delivery id. One engine sha, one register version, four data-vintage kinds.

### 36.B6-R — a Part-1 bug the runners caught, not the tests

`run-backtest.mjs` referenced an undefined `scenarioName` inside the registry
spec added in Part 1. Vitest never touched it — the CLI block is not under test —
and it surfaced only on the first real invocation. Fixed, and worth recording as
the reason Part 4 re-runs every runner rather than trusting a green suite: eleven
runners were wired, and the only way to know all eleven still run is to run them.

### 36.B6-S — the test suite was writing to the committed governance log

Found by counting: the shipped registry came back **one line longer** than the
build that produced it, carrying an artefact called `Model.xlsx` that no build
emits. `recordArtefact` took the artefact's file path but had no way to override
the *registry* path, so it always appended to the real `runs.jsonl` — and the
delivery-build test therefore added a line to the committed audit trail on every
`vitest run`.

A governance log that its own test suite writes into is not an audit trail. Fixed
by threading `registryPath` through, and the test now asserts both halves: the
line lands in the temporary registry it was given, **and** no `Model.xlsx` line
exists in the real one. That second assertion is the one that matters — it fails
loudly if the leak ever returns.

Worth noting how it surfaced: not from a test, but from reconciling a count in
the handover against the file on disk. The registry's value is that it makes
that kind of discrepancy visible, and the first thing it made visible was a
defect in itself.
