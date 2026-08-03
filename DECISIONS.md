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

---

## Phase 36.C — cron redirects open before the command runs

The 2026-07-17 S2 stall had a second, independent cause that only surfaced during
the Pause-A audit: the Mac fetcher's crontab line could not execute at all.

```
0 */4 * * * NODE_TLS_REJECT_UNAUTHORIZED=0 /usr/local/bin/node ~/kkme-cron/fetch-btd.js \
    >> /Users/Kastis/kkme/logs/btd.log 2>&1
```

`logs/` had been removed from the working tree. The shell opens `>>` **before**
it execs the command, so the line failed at redirect setup and `node` never
started:

```
$ /bin/sh -c 'echo test >> /Users/Kastis/kkme/logs/btd.log'
/bin/sh: /Users/Kastis/kkme/logs/btd.log: No such file or directory   (exit 1)
```

The failure is silent by construction — the only place the error could have been
reported is the log file that could not be opened.

The directory went with `c8f60b0`, a hygiene commit that untracked
`logs/btd.log`. That commit was careful in the way that mattered least: it used
`git rm --cached` specifically so the working file would survive as evidence,
and said so. The file still ended up gone. Whether a later `git clean` or
checkout took it does not change the lesson, because the lesson is not about
which command removed it.

**Rule: before removing or untracking a directory, grep the crontabs for paths
under it.** `crontab -l | grep <dir>` on every host that runs one. Redirect
targets are a dependency that no build, test, lint or type-check can see — the
path appears in no source file, and nothing fails until the next scheduled tick,
which then fails quietly forever.

Two things follow, both now in place:

- The VPS cron install does `mkdir -p /opt/kkme/logs` first, so the directory
  cannot be the single point of failure again.
- More importantly, the Mac leg is retired entirely (36.C). A scheduled job whose
  only failure channel is a log file it cannot open is unmonitorable in
  principle. The replacement reports through the worker, which alerts, and
  through `/health`, which the freshness badge reads — both visible without
  anyone reading a log.

Related: this is the second time a `logs/` artefact has caused trouble
disproportionate to its value (it also blocked a rebase and contributed to two
stale deploys the same day). Runtime artefacts do not belong in the repo, and
their *directories* do not belong in cron paths that nothing validates.

---

## Phase 36.D Pause A — "4.36 → 7.13 GW" and "973 MW" are two columns of one table

36.C handed this phase an open question: Litgrid's public summary says the flexibility
requirement grows from **4.36 GW to 7.13 GW**, while the excerpt KKME was working from
reports **973 MW**. Different scenario? Different metric? Different document?

None of those. Table 43 on page 146 of *Lankstumo poreikių ataskaita 2026*:

```
lentelė 43 Lanksčių priemonių poreikis į viršų – LTrSc realistinis režimas
                      2028        2030        2033        2035
                 Poreikis  Nep.  Por.  Nep.  Por.  Nep.  Por.  Nep.
Sistemos lankst.   3821   429   4838  484   5380  415   6644  536
Tinklo lankstumas    30    30     42   42     77   77    108  108
Specifinis lankst.  514   514    518  518    377  377    379  379
Viso               4364   973   5398 1044   5834  869   7131 1023
```

`Poreikis` is the **total** requirement. `Nepadengtas` is the **uncovered residual** — the
part not expected to be met by existing and already-planned resources. One table, one
scenario, one mode.

The reason to record this rather than just fix it: the wrong column is the one a reader
reaches for. "4.36 → 7.13 GW" is the headline sentence on page 10; "973" is buried in a
table on page 146. Substituting the headline into `eff_demand` puts KKME's LT S/D at
0.26-0.42 — **SCARCITY** — and inflates the compression index from 0.31 to **1.86**, a
~5× revenue error, in the direction that flatters us. So the canonical module stores the
total-measures series **explicitly, under `excluded_readings` with a `do_not_use`
reason**. A trap documented only in prose is a trap that gets re-sprung by the next reader
of the summary.

Related: the same excerpt's supply-side figures are garbled in a way worth knowing about.
"1.26 GW **LTsC**" is **L TrSc** — the *scenario name* (*Lėtesnės transformacijos
scenarijus*), not a supply tier. The "X + Y" pairs the excerpt reads as a supply
decomposition are scenario-assumed BESS **plus** additional demand, summed. Litgrid does
that sum once and states its result — 1260 + 973 = **2.23 GW** of BESS required at 2028 —
which the excerpt turned back into a decomposition of a different number entirely.

---

## Phase 36.D Pause A — the 935 was never a number, and two defaults are one too many

`git log -S` dates `eff_demand = 935` to `fb088c4`, 2026-03-05, the commit that created
`processFleet`. It arrived as a bare literal with no comment, no derivation, and nothing
in the commit message. There is no document, calculation or note anywhere in the
repository that produces it. The archaeology is that there is no archaeology.

What is more interesting is how it stayed alive. `workers/fetch-s1.js` carries **two**
hardcoded demand defaults:

```js
// :419   processFleet — the one that computes sd_ratio
const eff_demand = demand?.eff_demand_mw || 752;
// :8230  POST /s2/fleet — the one that writes KV
fleet.demand = demand ?? { eff_demand_mw: 935 };
```

`kkme_sync.py` POSTs `{"entries": [...]}` with no `demand` key. So the daily full replace
computes S/D with **752** while writing **935** into KV as a field nothing reads. Then the
4-hourly cron runs `syncLitgridFleet`, which reads that stored 935 back and passes it
*into* `processFleet` — promoting a cosmetic default into the arithmetic. From that tick
onward, 935 governs.

The published ratio therefore oscillates with cron order: 2385/752 = **3.17×** or
2385/935 = **2.55×**. Both have shipped — `docs/handover.md:1491` and `:3910` record the
752 basis; production on 2026-07-29 serves 935.

**Lesson: a default written into a stored payload is not cosmetic.** Any read-back path
will eventually feed it to the function whose own default it was supposed to shadow. The
two defaults were never compared because no single call site sees both. This is discipline
rule #4 in a form the CI test cannot catch — the metric has one name and one field, but
two producers with different constants.

---

## Phase 36.D Pause A — the /s2 752 was fully sourced; nobody wrote it down

The prompt describes `752 = aFRR 120 + mFRR 604 + FCR 28` as undocumented. It is not. All
three come from the tri-TSO **Baltic LFC block dimensioning forecasts** — authored jointly
by Elering, AST and LITGRID, published on litgrid.eu, covering **2026-2035**:

- mFRR upward, Baltic block, 2026 = **604 MW** → 2035 = 754 MW.
- aFRR upward, Baltic block, peak 4-hour cycle (16-20) = **120 MW**, flat across the horizon.
- FCR, Baltic block, 2026 = **28 MW** → 2035 = 48 MW.

The comment `mfrr_up: 604, // source: Baltic mFRR demand` at `workers/fetch-s1.js:1110`
was right all along; it just never named the document. Two defects follow, both of vintage
rather than value:

1. The number is frozen at the **2026 row** of a series that runs to 2035. The engine then
   applies a synthetic 2 %/yr growth (`projectDemand`) in place of the published
   trajectory — whose actual CAGR is **2.29 %/yr**. The growth rate was a good guess; the
   level was not.
2. `afrr: 120` is the **peak cycle**, not a year value. aFRR is flat in time and varies
   only by time of day (96-120 MW across six cycles, daily mean 106.3). Using the peak in
   a per-product denominator inflates demand and flatters the per-product S/D. Small, but
   it should be a documented choice.

Both figures were recovered from chart *data*, not from reading pixels: the FCR forecast
is a `.docx` whose `word/charts/chart1.xml` carries the full per-country series
(Baltics / EE / LV / LT), and its LT row — 12, 13, **14**, 16, **18**, 19, 21, **23**, 24,
**25** — matches the FNA's own FCR row for 2028/2030/2033/2035 **exactly**. Two
independent documents, one number.

---

## Phase 36.D Pause A — the CPI floor does not bound this blast radius

The 36.D prompt classes code risk as MEDIUM because "the CPI floor bounds the arithmetic
blast radius", while correctly adding that "the floor hides it" is not a correctness
argument. The premise itself turns out to be false, and it is worth being precise about
why, because the correct version of the claim is still useful.

`eff_demand` reaches revenue through three channels:

| Channel | Floor | Status |
|---|---|---|
| `cpiCurve(sd_ratio)` | 0.30 | saturated (S/D 2.55 → raw 0.276) — absorbed |
| `reservePrice(sd_yr, base)` | 4 % of base | saturated (projected S/D 5.88 → 10.7) — absorbed |
| **`marketDepthFactor(mix.sd_ratio)`** | **none** | `1/(1 + 0.15×(S/D − 0.8))`, multiplies `rev_trd` — **not absorbed** |

`marketDepthFactor` is a hyperbola with no floor, and it multiplies the trading revenue
line, whose `trading_fraction` is pinned at its 0.70 cap in every projected year. Swapping
the 935 ramp for the Baltic-joint series moves it **−9.7 % to −11.6 %** year by year,
**−10.6 % on the 20-year mean** — roughly **−7 % of gross revenue** before any supply-side
change.

So the publishable claim is narrower than the prompt drafts it. *"Current cannibalisation
assumptions already saturate at the floor even under the TSO's own build-out projection"*
is **true of the compression index and false of revenue**. Two of three channels are
floored; the third is where the money is. The methodology gets the precise version or
none.

The direction is the one honesty predicts: 935 was **24 % above** the TSOs' own 2026
figure and compounded to 1445 MW by 2048 — above every TSO-anchored series at every point.
Correcting it costs revenue. That is what correcting it is supposed to do.

---

## Phase 36.D Pause A — 200 MW that cannot legally sell to us is counted as competing supply

EEĮ Art. 48(1)(3), quoted verbatim in the Litgrid report (p.126-127), reserves the
isolated-operation reserve (IZDR) to the designated storage operator — **UAB "Energy
cells"**, 200 MW / 200 MWh — and bars everyone else: *"Kiti rinkos dalyviai šios paslaugos
teikti negali."*

The obvious mapping was `excluded`: a TSO-designated asset, and KKME already drops those
via `NON_COMMERCIAL_TYPES = {pumped_hydro, tso_bess}` (`app/lib/sdRatio.ts:38`). Checking
that assumption instead of asserting it found the defect. Energy Cells is in the live
fleet payload as four Litgrid Layer-3 entries — *Kaupikliai Vilnius / Alytus / Šiauliai /
Utena*, 50 MW each, **200 MW total**, matching the report's figure exactly — every one
`status: operational`, **`type: null`**. Nothing excludes them. They carry **weight 1.0**
in `baltic_weighted_mw` while being legally prohibited from selling into any product KKME
models.

The only `tso_bess`-tagged rows in the entire fleet are AST's Latvian units (Rēzekne 60,
Tume 20). The mechanism exists; it is simply not applied to the one LT asset that most
needs it. Worth noting how it hid: `syncLitgridFleet()` explicitly deletes an entry named
`"Energy Cells (Kruonis)"` on every run — so the *name* was handled once and the *assets*
arrived later under a different naming convention from a different feed.

**And the fix has to be year-indexed, which is this phase's whole argument.** IZDR runs
200 / 200 / **0 / 0**: the reservation is transitional, tied to the synchronisation-project
period, and lapses. Tagging the four entries `tso_bess` permanently would be wrong in the
opposite direction from 2033.

The prompt's A.2 question 4 expected that lapse to compound — "competing supply comes back
to the pool exactly when the fleet is largest". It does come back. But **IZDR + GAGAP is
constant at 354 MW in every analysed year** (table 20, p.127: *"Visiems analizuotiems
laikotarpiams nustatyta vienoda jų apimtis – 354 MW"*), so the same event that releases
200 MW of supply raises market-procured GAGAP by **exactly +200 MW**. Supply +200,
absorption +200, **net zero**. The total fast-response requirement never changes; only who
is allowed to sell it does.

That cancellation is invisible unless the module keeps IZDR and GAGAP as separate
components with their own series instead of one netted "fast response" row. It is the
strongest argument for the per-component structure, and per rule #2 it has to fall out of
the arithmetic rather than be written into the methodology as a sentence.

---

## Phase 36.D CP-2 amendment 1 — the one component-trend exception, and why it is physical

Operator amendment: hold FCR flat after 2035 while every other component keeps the approved
component-trend extrapolation.

The reason is not that 104.6 MW looked large. It is that FCR is not a demand quantity at
all. Continental Europe sizes FCR against a **fixed 3 000 MW reference incident** and
allocates it across TSOs by net generation and consumption share (SOGL Art. 153, CE SAFA
Policy 1). The published Baltic series — 28 MW in 2026 to 48 MW in 2035 — is therefore a
*share* growing against a constant denominator, and a share is bounded in a way an observed
rate is not. Compounding 6.19 %/yr to 2048 gives 104.6 MW: the Baltic share of the European
reference incident more than tripling. Nobody would defend that in a room, and an advisor
would find it before we pointed at it.

So the module now carries `extrapolation: 'flat' | 'component-trend'` per component, and
validation **rejects a flat component that does not state why**. A departure from the
declared policy is a claim about the world; the flag alone is not the claim. Exactly one
component declares it, and the reason travels with the data rather than living in a
changelog.

Effect: 2048 addressable demand 1 263 → 1 207 MW (−4.5 %). Direction is revenue-positive,
which is worth naming — it slightly offsets the phase's overall reduction, and it was
adopted because the reasoning is better, not because of the sign.

The general shape is the point: **mechanical extrapolation is a default, not a principle.**
Where a quantity is bounded by something the trend cannot see, the bound wins and says so.

---

## Phase 36.D CP-2 amendment 2 — the client portfolio moves DOWN, and the first measurement was mine to get wrong

The operator required the +12.9 % NPV move on the client portfolio to be decomposed rather
than left "measured, not fully attributed". Decomposing it showed there was no +12.9 % move.

| Metric | reported at CP-2 | measured, controlled |
|---|---|---|
| Y1 gross | +3.1 % | **+0.20 %** |
| 20-yr EBITDA | +5.2 % | **−0.83 %** |
| NPV @ 8 % | **+12.9 %** | **−1.78 %** |

The bad measurement took its "before" run under `git stash`, which reverted every *tracked*
file — the KV fixture (dropping the `countries` block this phase added), the bridge
calibration constant, `scenarios.json` — while leaving the *untracked* new modules in place.
The two runs differed in far more than the engine. The stash pop then failed partway and
needed hand repair, which should have been the second warning.

That is **C3** (baseline not captured cleanly before intended movement) committed by the
executor rather than the prompt, and it survived because the number was never re-derived by
a second method. The tell was available and ignored: **the +12.9 % was the only figure in
the entire phase pointing away from every other one.** A single result whose sign disagrees
with the mechanism that produced it is a measurement to redo, not a finding to report.

**Rule: a before/after on this engine loads both modules in one process.** `git stash` is
not a baseline mechanism in a repo with untracked work in flight — it cannot be, because it
moves exactly the files a baseline is supposed to hold still. The run registry exists to
make honest baselines cheap; this one did not use it.

The corrected decomposition is in
`docs/investigations/2026-07-29-phase-36-d-portfolio-decomposition.md`. The mechanism, which
the aggregate number was hiding:

- **Reserve revenue rises and saturates** — +1.96 % → +2.33 %, flat at +€286k/yr from 2030.
  `bidAcceptanceFactor` is a decay bounded at 0.95; once mFRR S/D has fallen as far as the
  absorption deduction takes it there is nothing more to win.
- **Arbitrage falls and keeps falling** — −4.17 % → −10.05 %, because `marketDepthFactor`
  has no floor and the two demand series diverge every year (the retired 935 × 1.02ⁿ ramp
  reached 1 445 MW by 2048; the TSO-anchored series reaches 1 207 MW).
- At a 71/29 reserve-to-arbitrage mix these **almost exactly cancel in year 1** (+0.18 %
  predicted, +0.21 % measured) and stop cancelling immediately afterwards: 20-year totals
  are reserve +€5.66M, arbitrage −€7.46M, net −€1.80M.

So "year 1 is neutral" and "the twenty-year NPV falls 1.8 %" are the same fact seen at two
horizons. Reporting either alone would have been true and misleading.


---

## Phase 36.D Pause C — two of three tripwires were pinned to URLs I never fetched

The publication watcher shipped with three targets. `/health.demand_watch` after the first
live cron tick:

```
fna               present, checked 16:01:30Z
balancing-market  never_checked
studies           never_checked
```

Both of those URLs return **zero document links**. I had verified the FNA page in Pause A —
I fetched it, parsed it, downloaded the report from it. The other two I wrote from memory of
the site's navigation, and they resolved to a generic section page (both returned an
identical 2 023 742-byte body, which was the tell had anyone looked).

The watcher would never have alerted about it. Its no-links branch was written to *report and
continue*, on the reasoning that an empty page is more likely a CMS change than a deletion
and should not fire a false alarm. That reasoning is right about the false alarm and wrong
about everything else: a tripwire that says "I found nothing" once and then goes quiet is
indistinguishable, from the outside, from a tripwire that is working. Two thirds of the
demand module's change-detection was dead on arrival and looked armed.

Three changes:

- **Targets are the DOCUMENT pages, not section indexes** — Litgrid replaces a report in
  place, which `diffPages` already sees as a retitle. An index adds a layer that can silently
  stop listing what we depend on.
- **Blind is an ALERT, not a log line.** Never-had-links means the target was pinned wrong;
  had-links-now-none means the page moved or the selector broke. Both are worth waking
  someone. The alert says explicitly which target is unwatched.
- **Each target records `verified_at` and `links_seen`** from an actual fetch, and a test
  asserts both are present and non-zero. A pinned URL that nobody has fetched is a guess
  wearing a config's clothes.

The general lesson is not "check URLs". It is that **B8's countermeasure has a failure mode
of its own**: the staleness surface has to distinguish *quiet because nothing happened* from
*quiet because I am broken*, and a watcher that cannot tell those apart provides confidence
instead of monitoring. `/health.demand_watch` now reports `blind` as a distinct status from
`present` and `never_checked`.

Found by running the extraction against live markup as a post-deploy check — after the code
was already in production. It should have been a pre-deploy check, and the fixture tests gave
no hint because a fixture cut from the one page that *did* work will pass forever.

## Phase 37.A Pause A — the APVA column is a flag, not a key, and that changes what it can ever prove

The prompt carried a reasonable hypothesis: the LT sheet's `APVA` column, populated on all 84
rows, might hold "APVA scheme/application identifiers", which would make it "a direct
public-register cross-check" — a citation source for 84 projects, arriving free.

It holds two values. `Gavo` ×55, `Negavo` ×29. Received, did not receive. There is no
identifier, so there is nothing to look up.

That reframing matters more than it first appears. An identifier is a *pointer into a public
record*: you follow it and either the record is there or it is not, and either way the check is
decidable by anyone. A flag is *testimony*: it asserts an outcome without exposing anything that
would let a third party confirm it. The same column, under the two readings, sits on opposite
sides of rule #3.

I tried to rescue it anyway, because a subsidy award should be publicly traceable. The national
EU-beneficiary register (`esinvesticijos.lt`) is the right place to look — €6.63 bn of funding
indexed, and its result count is server-rendered, so a plain GET answers "does this entity
appear". I ran a **balanced** sample rather than a confirming one: 8 `Gavo` rows and 6 `Negavo`
rows, querying both the SPV and the parent org. Result: `Gavo` 0/8, `Negavo` 0/6.

The zero is not the interesting part — the *symmetry* is. A source that returns the same answer
for both arms of the flag has no discriminating power over it, whatever the reason. Had I run
only the `Gavo` arm and seen 0/8, I would have concluded "the register is missing these
companies" and gone looking for a better register. Running both arms says something stronger and
cheaper: **this source cannot verify this column at all**, and no amount of improving the query
changes that. The control group is what turned an inconclusive result into a decisive one.

Corroborating, not load-bearing: APVA's own published schemes are `Fizinių asmenų … namų
ūkiuose` — household solar and household storage — which sit oddly against a table of 24–300 MW
SPVs. The Modernisation Fund does list storage among its priority areas but publishes no
beneficiary list at all.

The decision needed no operator input, because the arc already settles it: *"a row that only
exists in the private table stays private-only until a public source corroborates it."* So
`apva_flag` is stored **opaquely** — private tier, never published, never contributing to a
verification tier, with no semantic meaning encoded in the schema. Opaque is the operative word:
had I stored it as `apva_awarded: true`, I would have baked in a reading of "Gavo" that I cannot
support, and every downstream consumer would have inherited it as fact.

What I did *not* do is guess which scheme it refers to. One sentence from the operator resolves
it, and until then the honest representation of an unverifiable claim is the claim itself, not an
interpretation of it.

The general lesson, and the reason this is worth writing down: **the prompt's premise was not
wrong about the data, it was wrong about the data's *kind*.** "Is this column an identifier or a
flag" is not a detail to settle during implementation — it determines whether the column can ever
become a citation, which determines whether 55 projects are publishable. A5 says verify what a
source actually serves; this is the same discipline turned inward, at the seed data. Checking the
kind of a field costs one probe. Assuming it costs a schema built on a category error.

## Phase 37.A — the public fleet counts hybrid grid connections as if they were batteries

The arc predicted the match engine would find "meaningful overlap on the pure-BESS rows and
near-zero on hybrids", because "our feeds under-count hybrids". The first real run matched 84/84
LT rows — and then disagreed with the public fleet on MW for 41 of them.

The names were right; I checked the low-scoring tail by hand before trusting the rate. The
disagreement is not a matching error, it is a **units** error, and it runs the opposite way to
the prediction. Splitting the agreement by plant type:

| Plant type | matched | public value tracks private BESS MW | tracks private SITE total |
|---|---|---|---|
| BESS (pure) | 39 | 36 | 0 |
| SUN and WIND E with BESS | 22 | 0 | 20 |
| WIND E with BESS | 14 | 2 | 12 |
| SUN E with BESS | 8 | 1 | 7 |

For pure-BESS projects the public fleet's `mw` is the battery rating. For hybrids it is the
**site's grid-connection capacity** — the whole wind farm or solar park, of which the battery is
a fraction. Across the 45 matched LT hybrids the private BESS components total ~1,320 MW while
the matched public entries total ~4,383 MW: a **3.3× overstatement, ~+3,063 MW** of capacity
carried in the supply base as though it were storage.

So the feeds do not under-count hybrid storage. In MW terms they **over-count it, substantially**,
because a connection-capacity figure is being read as a battery figure. Both statements can be
true at once — the hybrid *projects* are under-represented as rows, while the hybrid *megawatts*
that do get in are inflated — and the arc collapsed them into the reassuring half.

This lands on 37.D, not here: supply feeds `sd_ratio` feeds cannibalisation feeds IRR, so a
3× error in the hybrid slice is not cosmetic. 37.A changes nothing about it — the phase does not
write `s4_fleet`, deliberately — but the number is recorded now, in the generated coverage report
rather than in prose, so 37.D re-derives it from an artifact instead of quoting this paragraph
(C4).

Two honest limits, stated because the figure is the kind that gets quoted: it rests on the
private BESS column being correct, which is operator testimony and unverified; and it covers only
the matched LT subset, so it is not yet a fleet-wide total. It is a **hypothesis with a
quantified magnitude**, not a finding — the distinction B9 exists to keep.

What produced it was not a test. All 39 unit tests passed on a match engine that was silently
wrong in two ways (`bareName` stripped only leading legal forms, so `UAB "X"` never matched
`X, UAB`; and 2-char tokens were filtered, so `Anykščiai PV` and `Anykščiai BS` both collapsed to
the placename and matched each other). Both surfaced from reading the actual output of the first
real run and asking whether an 89% match rate was too good — then, after fixing them, whether
100% was too good as well. A gate that only answers "did the code run" cannot answer "is the
answer sane", and on new code the second question is the one that pays.

## Phase 37.B — the detector that would have retired all of Latvia, and why rules became data

Two hours before writing the lifecycle engine I fixed a one-character-class bug in the Latvian
register parser: the UR export writes whitespace-only cells, `closed` is a single space on live
companies, and an untrimmed truthiness check therefore marked **all 486,509 entities terminated**
— Latvenergo included.

That bug was harmless where I found it, because I was reading a coverage number and a coverage
number that says "100% of Latvia is dead" gets checked. Wired into 37.B's decay detection it is
not harmless at all: `registry_terminated` fires on every LV row, every row carries a real
citation to a real register file, and the system soft-retires the entire Latvian fleet **while
satisfying every rule it has**. Evidence required: present. Citation resolvable: yes. Soft-retire,
never delete: honoured. Transition log: complete and accurate. The gates would all be green and
the answer would be catastrophically wrong, because none of them asks whether the *detector* is
working.

So every signal in `lifecycle-rules.json` declares a liveness invariant, and a signal whose
invariant fails is **suppressed** rather than obeyed. For this one: entity count below 400,000
means the parse broke; terminated share above 75% or below 20% means the field stopped meaning
what it means. The 100%-terminated state now produces `DETECTOR.UNHEALTHY`, fires nothing, and
writes a `signal_suppressed` transition so the suppression is itself visible.

The same shape recurs across the other signals and each got the same treatment: mass queue
disappearance is a fetch failure, not mass death (`max_shrink_ratio`); a press tripwire with
nothing to show for four consecutive runs is `BLIND`, not quiet (36.D's precedent); every row
going stale at once means intake stopped, not that the fleet aged. **The general form: every
decay detector has a failure mode that looks exactly like a large true positive.** Mass death and
broken parser are the same observation until you add an invariant that separates them, and the
invariant has to be written before the detector runs, not after it does damage.

**The rename guard is the same lesson at row scale.** A name that vanishes from the register has
at least three causes — liquidated, renamed, parser drifted — and only one is death. Latvian
open data ships `register_name_history.csv` precisely because renames are common, so the guard
consults it before any decay signal may act: if the name resolves as a *former* name whose
regcode is still active, the signal is cancelled and a `renamed` transition is recorded instead.
Without it, a developer rebranding an SPV would retire a live project, and the transition log
would carry a confident citation proving it.

**Why the rules are data.** They started as code, and the first version had the retire/flag
decision scattered across a switch statement where the difference between "flags for a human" and
"removes megawatts from the supply curve" was one string literal in one branch. As
`lifecycle-rules.json` that decision is a reviewable column: which signals may retire (exactly
one, and a test asserts only `confidence: high` signals hold that power), which merely flag, what
each one's B8 answer is. A dangerous change now shows up in a diff as a dangerous change, instead
of as a plausible-looking edit three levels into a control flow.

**What is deliberately NOT armed.** The weekly digest exists as a manual endpoint defaulting to
`dry_run`, not as a cron. B10's corollary says run new automation against real state before its
first scheduled firing — the proof run is the gate on the gates — and I have not been able to
give this one a real firing yet. An unproven cron that emails the operator every week is exactly
the kind of thing that quietly fails and is trusted anyway. The digest also carries detector
health in the same message as the findings, so a week of silence from a broken detector cannot be
read as a quiet week; and when *nothing* has ever reported it says so explicitly rather than
rendering a confident-looking zero.

---
---

# Phase 38.5 + 38.6 — autonomous long run, 2026-08-03

Branch `phase-38-56-partition` off `0b062ed`. Operator away. Every internal stop is an entry
here, not a pause. **Nothing deployed, nothing merged.**

## 38.5/38.6 — Pause A

### The four standing questions (failure-modes.md §"standing enforcement")

**(a) Which premises are HYPOTHESIS vs verified.** Every line number in the prompt was
re-checked at execution time (A3) and is listed in §"Premises" below with its verdict; four
are false and one is superseded by a better in-repo method. The prompt's central claim — that
`trading_fraction` is derived in €/€ and spent in MWh/MWh — is **verified**, and verified by
the engine's own docstring rather than by inference (`workers/fetch-s1.js:1723-1727`).
**(b) What consumes what this changes.** `trading_fraction` has 9 consuming sites in the
worker and 2 in the app; `capture_eur_mwh` has 1 rendering site and 1 vocabulary definition;
`RESERVE_PRODUCTS.share` has 17 worker sites. Full counts with search commands in §1 below.
The non-obvious consumer is **degradation**: `trading_fraction` is also `da_utilisation`
(`:2135-2137`), which drives `total_cd` → `getDegradation` → retention → every year's revenue
and the augmentation trigger. So the partition moves revenue *and* battery life in opposite
directions, and any measurement that reports only revenue is measuring half the effect.
**(c) What fails silently.** The energy-stacking constraint at `:2228-2237` — it computes
`scale_energy = min(1, usable_mwh_per_mw / total_energy_req)` where `total_energy_req` ≈ 0.518
MWh/MW and `usable_mwh_per_mw` ≈ 3.6 for a 4h asset, so `scale_energy` is pinned at 1.0 and
the constraint has never bound for any public configuration. It fails silently by never
firing. Confirmed numerically in §2. Likewise `bal_calibration` silently absorbs any change
to `R_yr` (§3), so a partition applied to the balancing side would produce **no delta at all**
and would look like a correctly-neutral change rather than a cancelled one.
**(d) At which layer and time.** Route layer, via `scripts/_phase-36-b1-route-probe.mjs`,
which drives the real `fetch` handler over all 54 public configurations against the frozen KV
fixture and compares byte-for-byte — and which loads BOTH engine versions **in one process**
(`git show <ref>:workers/fetch-s1.js` → temp module), satisfying the `engine-baseline-one-process`
rule and C6 without a worktree or a stash. Time: not applicable — the fixture is frozen, so
there is no refresh cycle to be early or late for. Baseline captured before any edit:
`route-level /revenue probe vs main: 54/54 identical`.

### 1. The identity that does not hold — with the arithmetic

`RESERVE_PRODUCTS` (`:1777-1781`) declares `fcr 0.16 + afrr 0.34 + mfrr 0.50 = 1.00` — the
whole asset, committed to reserve. `computeThroughputBreakdown` (`:1741-1743, :1748`) then
allocates those same shares for cycle accounting **and** gives day-ahead `MW × durBlend(...)`
at full nameplate. The revenue path multiplies the DA anchor by `mix.trading_fraction`
(`:2283`), which is pinned at its `0.70` ceiling in every year of every public configuration
(`:2131-2133`, engine's own comment). So, per MW installed:

```
reserve committed   0.16 + 0.34 + 0.50 = 1.00 × P_max
day-ahead committed                      0.70 × P_max
                                       ─────────────────
total committed                          1.70 × P_max        ← the identity fails by 70 %
```

The power identity the prompt asks for (`Σ committed + DA power ≤ P_max`) is violated **by
construction**, not by a data path — no input can make 1.70 ≤ 1.00.

### 2. The energy identity is not violated; it is absent

`:2228-2237` is the only energy constraint in the engine and it contains **no DA term**:

```
total_energy_req = Σ_p (avail × share_p × dur_req_h_p)
                 = 0.95 × (0.16×0.5 + 0.34×1.0 + 0.50×0.25) = 0.95 × 0.545 = 0.5178 MWh/MW
usable_mwh_per_mw ≈ dur_h × retention   →  4h: ~3.6   ·   2h: ~1.8
scale_energy = min(1, 3.6 / 0.5178) = 1.0                    ← pinned, all 54 configs
```

So the second line of the prompt's identity is not "violated" — it is unwritten. Adding the DA
energy term is what would make it a constraint rather than a formality.

### 3. What `bal_calibration` is anchored to — the prompt's premise here is wrong in a way
that matters

`:2261`: `bal_calibration = by_balancing_per_mw / R_now`, where `by_balancing_per_mw =
base_year.annual_totals.balancing` (`:2167`) — the **observed** trailing-12-month balancing
revenue per MW, assembled by `computeBaseYear` from real S1/S2 captures. It is recomputed on
every engine invocation from that observation, not stored.

Consequence: `rev_bal = R_yr × bal_calibration × mw × …` reproduces observed base-year
balancing revenue *whatever `R_yr` is*. If a partition scales `R_yr` by a reserve-MW fraction,
`bal_calibration` scales by exactly its inverse and `rev_bal` does not move. So the prompt's
"any partition invalidates `bal_calibration` unless it is re-derived" is **false as stated** —
it self-re-derives — but the true statement underneath is sharper: **the balancing side cannot
be partitioned at all in this engine**, because it is pinned to an observation. The partition
can only act on the trading side. What it *would* have to be re-derived against, if one wanted
the balancing side to move, is a base-year observation decomposed by product and by committed
MW — which the S1/S2 captures do not carry. That is a data gap, recorded here, not solved.

### 4. `effective_arb_pct` is NOT inert — the prompt's premise 2.1.4 is false

`grep -rn "effective_arb_pct" --include=*.js --include=*.ts --include=*.tsx . | grep -v node_modules`
→ 11 matches. It is **consumed** at `:2703` and `:2704`, as the divisor in the `capture_*`
back-solve, with a hardcoded `0.115` fallback. So it is a live input to a published capture
figure, and proposing it as the partition's physical share is a change to an existing consumer,
not the activation of a dormant one.

It is also the partition, already written. `computeEffectiveArbPct` (`:3546-3570`) computes
exactly the average-consistent allocation the prompt asks to be designed: the MW-hour share
left for arbitrage after FCR's always-on commitment and aFRR/mFRR's time-sliced commitments,
weighted by the four occupancy states. With defaults it is **≈ 0.115**. The revenue path spends
**0.70**. The engine therefore publishes its own physical share and bills a different one, and
`app/lib/__tests__/refinementProbes.test.ts:240` **asserts the two must differ** — a test that
encodes the disagreement as intentional. That test is the reason the 6× gap survived; it is
addressed as its own decision below, not silently edited (B6, B7).

## 38.6 — the design, what was built, and what it measures

### 5. What a correct partition looks like in an annual-average engine

The engine is an annual-average model. So the partition must be an **average-consistent
allocation**, not a dispatch — and the crucial consequence is that the two-direction identity
the prompt writes collapses. `RESERVE_PRODUCTS` carries ONE undirected `share` per product;
there is no `afrr_up`/`afrr_down` anywhere in the file. FCR consuming up- and down-headroom
simultaneously is therefore **neither modelled nor violated here — it is unrepresentable**,
and a test asserts the single-pool shape so that adding a directional split is a reviewed
change rather than a silent one. Representing it needs directional procurement volumes and
directional prices we do not hold.

**Availability ≠ delivery** is already respected on the revenue side and was the confusing
part: capacity revenue is billed on committed MW while activation energy is billed on
activation. What was NOT respected is that the committed MW is unavailable to day-ahead for
the whole committed period. That is the entire defect, and it lives at two seams.

**Do not double-discount.** Bid acceptance haircuts reserve REVENUE by product; the partition
allocates day-ahead ENERGY. Different quantities, so applying both is not a double discount.
Shown rather than argued: under the partition `rev_bal` does not move at all, and `rev_trd`
moves by exactly the ratio of the two shares. A spec asserts both.

**The Baltic energy-reservoir requirement — LOCATED, so STOP condition 2.6c is NOT hit.**
AST, *Harmonised principles for Baltic LFC reserve prequalification*, 31.03.2022
(`https://www.ast.lv/sites/default/files/editor/Harmonised_principles_for_Baltic_LFC_reserve_prequalification.pdf`),
§4.3.2: *"As of triggering the alert state and during the alert state, each LER FCR provider
shall ensure a continuous FCR full activation for a time period no less than 30 minutes,
defined as TminLER … The TminLER requirement is fulfilled by dimensioning the energy reservoir
to meet the minimum requirement."* §4.3 defines an LER provider as one for which full
continuous activation *"for a period of 2 hours in either positive or negative direction"*
might deplete the reservoir. §4.3.1 requires a described active ERM controlling SoC.

Three things follow. (1) `RESERVE_PRODUCTS.fcr.dur_req_h = 0.5` is **correct and now
sourced** — 30 minutes, from the Baltic document, not the continental one. (2) The prompt's
"minimum ratio of rated to prequalified power" is **not** a Baltic requirement; the Baltic
document defines LER status by a 2-hour depletion test instead. (3) `afrr.dur_req_h = 1.0`
and `mfrr.dur_req_h = 0.25` have **no basis in this document** — §5.3.4 and §5.7.4 require an
ERM *strategy description* for aFRR and mFRR providers but state no numeric minimum. Those
two remain unsourced placeholders and are flagged as such rather than left to look sourced by
proximity to the FCR value that now is.

### 6. What was built

A flag, `params.mw_partition`, defaulting to `'current'`. `/revenue` does not read it from
the query string, so no public caller can select a mode. Three values: `current`, `unit_fix`
(only the dimensional error at the two DA energy seams), `partition` (unit_fix plus the
missing day-ahead term in the energy identity). `unit_fix` is deliberately not a shippable
state — it exists so the measurement can separate the two effects.

The physical share is not new maths: it is `computeEffectiveArbPct` (`:3602`), which the
engine has always computed and published as `time_model.effective_arb_pct` (≈0.115) while the
revenue path spent `trading_fraction` (0.70) on the same megawatt-hours. Held flat across
projection years, matching how `trading_fraction` is itself pinned at its ceiling in every
year of every public configuration. `computeEffectiveArbPctForYear` exists for a year-varying
version but its `reserve_shift` argument has no defined source anywhere in the file — it has
never been called — so using it would mean inventing a parameter. Recorded, not guessed.

New payload fields are emitted **only when the flag is on**. Writing them unconditionally
changed the public payload for all 54 configurations while the flag still defaulted to
current behaviour — caught by the byte-identity gate on the first attempt, which is exactly
the job that gate exists to do.

### 7. Two honest negative results

**The third column is empty.** `unit_fix` and `partition` produce identical payloads in 54/54
configurations once the timestamp is excluded. The new day-ahead energy term never binds at
2h or 4h: reserves require 0.518 MWh/MW, day-ahead adds 0.95 × 0.115 × dur_h (0.22 at 2h,
0.44 at 4h), against ~1.8–3.6 MWh/MW usable. So adding the term corrected the identity's
FORM and changed no number. **The entire measured partition effect is the unit fix.**

**The reserve side of the power identity is still open.** `computeThroughputBreakdown`
(`:1741-1743`) allocates reserve MWh at the RAW shares — 1.00 of nameplate, as though every
product were committed every hour — while `computeEffectiveArbPct` treats aFRR and mFRR as
committed only ~75 % and ~80 % of the time, which is the only reason arbitrage gets any
MW-hours at all. The two disagree, so:

```
before   1.00 (reserve) + 0.70  (DA)  = 1.70  × P_max
after    1.00 (reserve) + 0.115 (DA)  = 1.115 × P_max
```

Better, not closed. Closing it means moving the reserve throughput allocation onto the same
time-weighted basis, which moves cycle accounting and therefore degradation — a second and
larger change, deliberately not made. A spec fails the day someone believes the identity holds.

### 8. `bal_calibration` — no re-derivation needed, and why that is the finding

`bal_calibration = by_balancing_per_mw / R_now` is recomputed on every invocation from the
OBSERVED trailing-12-month balancing revenue. Under the partition `rev_bal` is byte-identical
to current in every configuration, because the calibration pins it to an observation. The old
and new anchors the prompt asked to see side by side are therefore **the same anchor**:
observed base-year balancing revenue per MW, unchanged. What would have to be re-derived, if
the balancing side were ever to move, is a base-year observation decomposed by product and by
committed MW — which the S1/S2 captures do not carry. Data gap, recorded, not solved.

### 9. Register

The partition introduces no new numeric parameter; it promotes existing ones from diagnostic
to load-bearing. `RESERVE_PRODUCTS` shares, `HEADROOM_DRAG` (0.70) and the three `dur_req_h`
values have **no rows in `assumptions-register.json`** (65 rows, none matching). They must be
registered BEFORE the flag flips. Not added in this run: adding rows bumps the register
version hash, and every delivered report quotes that id, so bumping it while the operator is
away would invalidate report provenance for a flag that is still off. Filed as a
before-flip gate with the FCR source above already located for the first row.

## 38.6a — flag flipped to the partition (operator-signed), and one correction to 38.6

### 10. A correction to what 38.6 reported

**The 38.6 wrap reported "the third column is empty" from a comparison that was broken.**
`da_energy_req` was gated on `partition_on`, which is true for BOTH `unit_fix` and
`partition`, so the energy term was present in both modes and the three-column measurement
was comparing a mode against itself. The separability claim was measuring my own harness.

Corrected in 38.6a — the term is now gated on `mw_partition === 'partition'` — and
re-measured. **The conclusion held:** across all 54 configurations `unit_fix` and `partition`
agree on every financial metric (gross Y1, project IRR, equity IRR, min DSCR, LCOS, NPV,
cycles/yr, DA share), differing only in the three diagnostic energy fields. `scale_energy`
stays 1.0 in both: 1.067 MWh/MW required against 3.83 usable at 4h. So the reported figures
and the signed decision are unaffected. It is now asserted by a test rather than assumed.

Recorded as a correction rather than quietly fixed (B9). The lesson is the one already in
B13's corollary: when a comparison shows no difference, suspect the harness before concluding
the system has no difference. I did not, and reported it.

### 11. Which default, given "ship the unit fix"

Flipped to **`'partition'`**, not `'unit_fix'`. The two produce identical financial metrics in
all 54 configurations (§10), so this ships exactly the signed numbers; and it does so without
leaving the energy identity in the half-written state the 38.6 prompt itself warned against
("fix the unit error as part of the partition, not before it"). `MW_PARTITION_DEFAULT` is a
single named constant — one word changes it if the literal mode was intended.

`'current'` is retained as a reachable mode so the pre-38.6a basis stays reproducible for
comparison, and `throughputAlignment` asserts both bases rather than overwriting the old one.

### 12. Eleven tests went red. Why each fired, before any of them was touched (B6)

**`throughputAlignment` × 3.**
(a) *"the utilisation IS the trading fraction the revenue line applies"* — 36.B1-O's invariant
(cycle accounting and revenue read ONE figure) is unchanged and still enforced; what moved is
WHICH figure. Re-pointed at `arb_share_used`, which is a **sharpening**: the old assertion
would now assert the defect. A second assertion confirms the two figures genuinely differ, so
the test cannot pass vacuously.
(b) *"cycling sits between the old anchor and B1's physical simulation"* — **this bound
inverted, and it is a real residual, not a stale number.** 498 → 198 EFC/yr, against the
hourly engine's 221. The engine used to age the asset FASTER than the physics and now ages it
SLOWER, which is optimistic on wear. Pinned tight on the far side (`< 221`) so the inversion
is a visible asserted fact rather than a loosened band.
(c) *"leaves Y1 revenue untouched — the fix is on the wear side only"* — a property of 36.B1-O
that 38.6a deliberately supersedes, with sign-off. Re-purposed as a pin on the signed figures,
with the pre-partition figures still asserted alongside.

**`bridge` × 3.** The reconciliation constant. `bridge.mjs` documents this exact mechanism:
the engine's flat lines (BRP fee, OPEX) do not fall with revenue while the client stack's 16 %
does, so any downward revenue move widens the taxonomy gap, and `bridgeCalibration()`
re-derives it. Working as designed. Re-derived 2.57 → 5.83; the gap went −€128,404 → −€291,368.
**The size is itself a finding and is filed, not absorbed:** the two taxonomies now disagree
about 9-10 % of the client stack against 4.4 % before, and a constant this large is a
candidate for replacing with a proper treatment of the two flat lines rather than a number to
keep growing. Flagged for the operator; NOT resolved here.

**`register` × 5, in two waves.** First `cycles_efc_yr` (498 → 198) and `cycles_per_day`
(1.36 → 0.54) drifted from their bindings — the forced consequence I had filed in 38.6 as a
before-flip gate. Synced through the repo's own governed CLI (`register.mjs --sync --by
derived --phase 38.6a`), which also caught the bridge constant and bumped
**r2.48dcf518 → r3.d74c7e18**, 3 values moved, changelog appended. `derived` is the honest
classification: consequential re-derivation, no independent decision about cycling.

Then a second wave: the new constant **breaches its own declared `sensitivity_range` [0, 4]**.
Not re-fitted. Applied the register's established pattern instead — band moved to
`benchmark_band` with its source and the direction of the miss, `sensitivity_range` set null,
note recording that the breach IS the finding. Same treatment `cycles_efc_yr` already carries.

**`methodologyLender` × 2 (second run).** The lender annex quotes the register version and the
cycling figures. Updated — and §5.5 and §9.7 rewritten rather than number-swapped, because
the under-cycling finding changed shape: the gap to the observed band roughly doubled (9 % →
64 % below its floor) AND the sign of the error against the hourly simulation reversed. A
reader should not have to infer either.

### 13. Residual after 38.6a, stated at full size

1. **Power identity: 1.00 + 0.115 = 1.115 × P_max.** Better than 1.70, not closed. Needs each
   product split by direction; `RESERVE_PRODUCTS` carries one undirected share per product.
2. **Wear is now modelled optimistically.** 198 EFC/yr against the hourly engine's 221, and
   against a Modo/GEM observed band of 550-720. The sign of this error reversed in 38.6a.
3. **The reconciliation constant carries €291k.** See §12.
4. **Register rows still missing** for `RESERVE_PRODUCTS` shares, `HEADROOM_DRAG` and the
   three `dur_req_h` values. `fcr.dur_req_h = 0.5` now has its Baltic primary source (38.6 §5);
   the aFRR and mFRR values remain unsourced placeholders.

---

# Phase 38.8 — the fee and cost stack, 2026-08-03

## D1 · Counterparty name in git history — NOT rewriting. Operator decision, recorded.

The counterparty's name sits in four pushed commits (`ed47230`, `21e0b77`, `f7a92da`,
`f6c129a`) in the `source` field of a superseded register row. HEAD is redacted; **history is
not, and will not be.**

**Reasoning, recorded so nobody re-litigates it in six months.** The repository is public. A
force-push would invalidate every commit SHA the documentation cites — the roadmap, the
investigations, and this file all reference commits by SHA — break existing clones, and orphan
PR refs. Against that, the thing being removed is a vendor's own public marketing claim about
its realisation performance, carried with no contractual terms attached and no relationship
disclosed. **The redaction at HEAD plus this note is proportionate to what is actually
exposed.**

**The condition under which this is revisited, stated explicitly:** if the NDA contains an
express restriction on *naming the counterparty* rather than on disclosing *terms*, the
calculus changes and this decision is reopened. Nobody has read the agreement for that
specific question; the extraction was done for the cost stack. That is a known gap, not an
assumption that it is fine.

## D2 · Structural protection over pattern protection

`_handover_s1_s2_rebuild.md` (354 kB, carrying client and counterparty names) was first
protected by adding its filename to `.gitignore`. That was replaced with a **move into
`docs/_private/handover/`**, and the `.gitignore` line removed as redundant. A pattern can be
defeated by a rename, a copy, or a second file; the folder cannot be reached by `git add -A`
at all. Verified: `git add -An` cannot see it. The distinction is not academic — `git add -A`
was run twice in this session and had to be reset out of both times.

## D3 · `trading_realisation` provenance — VERIFIED, and it unblocks the BRP line

The operator's claim was that 0.7234 was measured from market data, so no pool-level balancing
or imbalance deductions can be inside it. **Verified at code level rather than taken on the
claim** (it was offered as a claim, not a grep result):

- `tools/consultancy/run-backtest.mjs` sources prices from `loadPriceYear()` in
  `backfill-entsoe.mjs` — ENTSO-E day-ahead prices, nothing else.
- `tools/consultancy/lib/backtest.mjs` computes
  `(policy avg discharge − policy avg charge) ÷ (sorted avg discharge − sorted avg charge)`.
  Both sides are gross €/MWh spreads on that same curve.
- Settlement-ish terms (`settlement|invoice|self-bill|imbalance_charge|balancing_charge|penalt`)
  match **0 times** across all three files; a control grep on `prices` returns 9, so the search
  works.
- The backtest's own docstring: it "does not measure intraday execution, bid rejection,
  **imbalance exposure**, or forecast error on the balancing side."

**Conclusion: modelling the balancing line separately is not double-counting.** Had any input
been settlement-derived the opposite would follow and the line would have to be dropped.

## D4 · Auxiliary consumption — the cross-check failure WAS the finding

The earlier construction — published operating aux figures (8-13 kW per 5 MWh container) as a
share of throughput — produced €196-319k/yr and collided with the literature's ~10 % RTE-error
figure at 12-20 % of throughput. **That collision was the model being wrong, not the sources
disagreeing.** `RTE_BOL` is measured at the point of interconnection *including auxiliaries*,
so cycle-driven auxiliary consumption is already inside round-trip efficiency. A
throughput-proportional aux line bills the same electrons twice.

Modelled instead as **standby load only, over idle hours**: `mw × standby_pct × idle_hours`,
where idle hours are derived from the year's own discharge energy rather than assumed. Base at
0.3 % of nameplate MW, the conservative end of a 0.1-0.3 % band.

**The band is not sourced to a datasheet** and the register row says so. It is bounded above by
the published operating band on the argument that standby cannot exceed average operating load.
This is the weakest-sourced row in the phase and the only one whose sign is unfavourable —
those two facts together are uncomfortable and are stated rather than smoothed.

## D5 · The balancing line — located, with two declared gaps

**Elering (Estonia) publishes a balancing-capacity fee of €3.73/MWh excl. VAT effective
2026-01-01, charged on consumed AND produced energy.** Corroborated by a licensed supplier's
customer notice (2025-11-26) and a second independent report. The TSO's own page sits behind
bot protection and could not be read directly, so this is **corroborated secondary, not
primary**.

Two gaps, both declared in the register row rather than buried:

1. **Jurisdiction.** This is the Estonian tariff. Every asset the engine prices is Lithuanian,
   and no equivalent Litgrid figure has been located — Litgrid's imbalance and balancing pages
   both return HTTP 200 with ~95 kB and no numeric tariff. Carried at the Estonian rate because
   it is a cost and that is the conservative direction.
2. **Storage treatment.** No source states whether a storage asset pays on both legs of its own
   round trip. Both legs assumed, again because it is conservative.

"Not located" remains the wording for the Lithuanian figure. A page that always renders is not
a tariff that was found.

## D6 · What the measurement says, and the one number that did not move

Five layers, measured marginally and cumulatively. The headline: **the cost stack recovers
about a fifth of what the partition took, and the combined position is still materially worse
than the pre-38.6a world in 54/54 configurations.**

The line worth naming: **`min_dscr` at the reference asset goes 0.89 → 0.95. It does not cross
1.00.** The favourable correction does not rescue the debt-service breach the partition
created; that remains a capital-structure question.

`pmc` — the only line with a firm primary source — contributes **≈0.00 pp of project IRR**. A
publicly-sourced parameter that turns out immaterial is still worth having: it converts one of
the five named defects from an open question into a closed and quantified non-issue.

## D7 · 38.8a — the flip, and three assertions that inverted

Flag flipped to the full stack on operator signature: *"leaving a better-evidenced stack
switched off is its own kind of wrong number."* `'current'` stays reachable so the pre-38.8a
basis remains reproducible.

**A typo must never restore the old basis.** An array of unrecognised layer names, an empty
array, an unknown string and `null` all fall through to the DEFAULT, not to `'current'`. The old
numbers are reachable only by asking for them by name. A spec asserts every one of those inputs.

**Three assertions inverted, each explained rather than relaxed.**

1. `bridge`: *"leaves a residual without the calibration — the constant is doing real work"* →
   its opposite. The uncalibrated reconciliation gap fell from −€291,368 to **−€32,770** (−1.31 %
   at the reference asset, inside the contracted ±2 % on its own), and the constant from 5.83 to
   **0.66** — back inside the [0, 4] band it breached in 38.6a. **The band was never widened; the
   model moved back inside it.** This is independent corroboration: the reconciliation checks the
   engine against a client-shaped cost taxonomy and nothing in 38.8 was fitted to it.
2. `projectConfig`: *"does NOT pro-rate the fixed BRP fee (conservative — DECISIONS A4)"* → its
   opposite. A fixed annual platform fee genuinely does not pro-rate, and A4's conservatism was
   right for that object. A volume-based TSO charge on metered energy pro-rates by construction,
   and charging per-MWh for energy the asset never moved would be wrong rather than conservative.
   **The conservatism A4 bought is gone because the thing it protected against no longer exists.**
   `brp_fee` moved from the payload's `not_pro_rated` disclosure to a new `newly_pro_rated`, so
   the change is visible to a reader rather than silent.
3. `mwPartition`'s signed-delta pin now holds `cost_stack: 'current'`. Without it, it would have
   pinned the partition delta plus a later phase's delta and quietly stopped measuring 38.6a.

## D8 · The NDA gate caught its own documentation, and then a false positive

Two things happened that are worth keeping.

**The gate flagged its own comment.** An explanatory comment in `scripts/nda-gate.sh` quoted the
contracted figures it was describing. The gate failed on it, correctly: §4's rule is that a
contracted figure reproduced to the decimal is a disclosure *even with no name attached*, and a
comment is no exception. Rewritten to describe the collision without reproducing either figure.

**A real false positive, fixed at the matcher rather than the needle.** Our own measured project
IRR extends one numeric needle by a digit, so substring matching flagged our own output as a
disclosure. Numeric needles are now matched at NUMBER boundaries; name needles stay
substring-matched, because a name inside longer text *is* the disclosure. **The needle was not
weakened** — proven by control: the exact value still fires, the longer value does not. Both
controls run, per B11.

---

# Overnight run 2026-08-03/04 — autonomous decision log

Operator asleep and unreachable. Runner: `docs/phases/_overnight-2026-08-03-runner.md`.
Standing rules in force: one branch and one PR per item, no merges and no deploys
except item 1, no public number moves, a blocked item is a completed item,
timeboxes are real, every gate proven by inject-then-revert.

## 39.2 (item 1) · Pause A — four questions

**(a) Which premises are HYPOTHESIS vs verified.**

*Verified at execution time, with the command output in the session:*
energy-charts.info is down NOW (`HTTP 503`, HTML body, 2026-08-03T16:36Z) — so the
alert's premise is live, not stale. `s1_capture` last wrote 08:00Z against an `s1`
that wrote 16:00Z, i.e. capture missed the 12:00Z and 16:00Z ticks: two consecutive
failures, ongoing. S4 last wrote `2026-08-03T08:01:04.653Z`, same two ticks missed.
The S4 ArcGIS source answers HTTP 200 in 1.07s from this machine with the
`Kaupikliai` row present and `free_mw` matching the stale KV value — so the source
publishes and the worker-side path is what fails.

*Prompt premise CORRECTED (A1/A4).* "Capture is computed from day-ahead prices we
already hold from a second source in the same request" is true of the DATA and false
of the CODE. Two measured reasons, both primary-source: (1) A44 for LT is curveType
`A03`, which omits positions whose price repeats — the 2026-08-03 document declares
96 quarter-hours and carries 94 Points, and `extractPrices` ignores `<position>`, so
92 of its 94 values land at the wrong time; (2) a UTC-bounded request returns whole
CET/CEST market days, so the array is 190 entries spanning two days. Control: Elering's
independent NPS series for the same window agrees with the forward-filled
reconstruction 96/96 and with the flat scrape 2/94 (B11 — a known-good control, not a
self-comparison).

*Prompt premise PARTLY FALSE.* "Three are real failures; one is the fleet digest
working correctly." There are more than three. S3's **scrape** is failing live
(`AbortError` at 16:00:28Z) independently of the enrichment parse failure the alert
named, and S8 last wrote 09:00:49Z against an hourly cron. Neither was alerted.

*HYPOTHESIS, not established here:* that the shared-invocation connection budget is
what starves S1-capture/S4/S8 on the same ticks. The pattern fits and 38.1 already
filed it as B-057; this phase does not attempt it and does not claim it.

**(b) What consumes what this changes.** `computeCapture` → `s1_capture`,
`s1_capture_history`, the embedded `s1.capture` summary, `/read`, `/s1/capture`, and
the S1 card's hero €/MWh. The fallback fires only when the primary throws, so the
healthy path is untouched: proven by `/revenue` 54/54 byte-identical against a clean
worktree of 3a1f588. `notifyTelegram`'s signature changed from void to a result
object — every existing caller ignores the return value, so no caller changed
behaviour. `/health` gains an `alerting` block and a `degraded` flag; `all_fresh` now
also requires `degraded !== true`, which is a deliberate tightening, not a regression.

**(c) What fails silently in what this touches.** Before: a capture failure (the S1
card's hero number) was invisible for up to 12h; an S4 failure for up to 24h, which
is longer than a same-day outage lasts, so the staleness surface structurally cannot
see one — only the failing tick can, and it was reporting to `console.error`. S3
wrote its FAILURE payload to KV, which reset its own staleness clock, so s3 could
never age past its threshold however long the scrape stayed broken (B12: the damage
disabling its own detector while the surface reassures). And `notifyTelegram`
discarded its send result, so a revoked bot token would have silenced the channel
with nothing to say so. All four now speak; the alerter's own liveness is on
`/health` and in the daily digest.

**(d) At which layer and time success is verified.** Unit layer: 2314/2314, with nine
inject-then-revert proofs on the real mechanisms (`scripts/_phase-39-2-inject-revert.sh`)
— every gate went red with its mechanism broken and green on revert. Public-payload
layer: `/revenue` 54/54 byte-identical vs a clean worktree, never a stash (C6).
Route layer, post-deploy: `/health` polled to two-consecutive-agreement, because the
first read after a deploy can come from an edge that has not caught up (C8). The
capture fallback's real-world proof is time-bound and stated as such: it can only
assemble a complete UTC day after tomorrow's auction publishes (~11:00Z), so it is
available on the 12/16/20Z ticks and declines on 00/04/08Z. That is an availability
gap, not an equivalence gap, and it returns null rather than a short day.

## 39.2 · Decision 1 (NEEDS SIGNATURE) — `extractPrices` left broken on purpose

The A03 and two-TimeSeries defects above are not confined to the capture path. Every
ENTSO-E consumer in the worker calls `extractPrices`, and `computeS1` treats its
190-entry return as one day. Live consequence, measured 2026-08-03:

| published field | now | with the day parsed correctly |
|---|---|---|
| `lt_avg_eur_mwh` | 75.43 | 65.32 (Elering, same day) |
| `lt_hours` | 190 | 96 |
| `lt_peak_hour_utc` | 9 | recomputed from a 96-slot day |
| `lt_hourly_24` | 24 buckets of ~8 quarter-hours spanning two days | 24 buckets of 4 |
| `intraday_capture`, `bess_net_capture`, `p_high_avg`, `p_low_avg` | top/bottom 4 of 190 ≈ one hour across two days | 4h within one day |

Fixing it MOVES PUBLISHED NUMBERS, which standing rule #2 forbids tonight. So it is
scoped, evidenced and stopped rather than done. **Recommendation: take it as its own
phase with a captured pre-state (C3), not as a rider on anything.** The correct
parser already exists, is exported and is under test (`parseA44Periods`,
`pricesForUtcDay`) — the remaining work is the cutover and the delta measurement, not
the algorithm.

## 43 (item 3) · Pause A — four questions

**(a) HYPOTHESIS vs verified.** Two prompt premises turned out **false**, both by running the
thing rather than reading about it.

*False #1 — the IRR sentinel.* "It currently reports `0.00` with `irr_status: 'uneconomic'`
rather than a negative root." Measured across all 54 public configurations: **0 nulls, 0
exactly-zero, 12 NEGATIVE IRRs**, min −6.07 %, max 22.9 %, and the only statuses emitted are
`investable` / `marginal` / `below_hurdle`. `uneconomic` never fires. The engine *does* report
negative roots. (There IS a defect nearby, but it is a different one — see below.)

*False #2 — B-065 is live in the revenue path.* `MW_PARTITION_DEFAULT = 'partition'`
(`fetch-s1.js:2239`), shipped by `aaac252 38.6a — MW partition becomes the engine default
(operator-signed)`. Verified by running all four modes on one fixture: default, `partition` and
`unit_fix` agree exactly (gross_y1 6,343,597 · IRR 4.53 %) and only the legacy `current` mode
reproduces the pre-fix numbers (8,519,445 · 10.36 %). **The handover register's B-065 row still
reads "open — nothing changed in 38.4", and `_post-12-8-roadmap.md` repeats it. Both are stale
(A9).** Roadmap rule #5 forbids me editing the roadmap; reported here instead.

**(b) What consumes what this changes.** Nothing in a production path. One additive export
(`calcIRR as calcIRRForAudit`), one new registry module, one gate script, one npm script, four
recorded fixtures, one test file. `/revenue` 54/54 byte-identical.

**(c) What fails silently here.** The gate itself, and it nearly did. Its first version reported
**77 statements containing a multiplication in a 9,400-line engine and found zero violations** —
because the template-literal stripper collapsed multi-line regions to two characters, destroying
line alignment and merging unrelated statements. A scanner whose line numbers are wrong is worse
than none: its green result describes a file that does not exist. It also scanned line-by-line,
and the one multiplication it was built to catch is written across three lines. Both fixed; the
gate now reports its own **coverage (6.0 %, 130/2161 operands)** on every run, because a
dimensional check that silently examines a twentieth of the arithmetic is the most reassuring
possible way to have no dimensional check.

**(d) At which layer and time.** Gate proven by inject-then-revert on the real engine: injecting
`da_mwh_per_mw_yr * trading_fraction * mw` turns it RED with the correct file, line and
diagnosis; reverting turns it GREEN. Time facts verified against four A44 documents fetched live
from ENTSO-E on 2026-08-03 and committed verbatim — never a synthetic 24-hour day, which would
merely restate the assumption under test.

### 43 · Decision 4 (NEEDS SIGNATURE) — the B-065 residue in `computeBaseYear`

38.6a fixed the projection seam. It did not touch `computeBaseYear`, which
`computeRevenueV7` calls on **every** request, and which at `fetch-s1.js:4201` still commits

    trd_monthly = capture * rte * trd_real * da_mwh_per_mw_day * y1_mix.trading_fraction * days
                                            [MWh/MW/d]          [EUR/EUR]

— the B-065 shape exactly, in a different function. Its output `by_trading_per_mw` reaches the
payload through exactly one path: the capture fallback at `:3120-3121`, which fires only when the
`s1_capture` KV key is **absent**. Phase 39.2 established that key does go absent in production
(energy-charts 503, two consecutive ticks, live at the time of writing).

**Measured, on the frozen fixture, 4h/base/COD 2028:** with `s1_capture` present,
gross_y1 = 6,343,597 and IRR = 4.53 %. With `s1_capture` deleted, gross_y1 = 5,780,510 (−8.9 %)
and **`project_irr` comes back `null`**. I have NOT established the mechanism linking an 8.9 %
gross fall to a sub-−50 % IRR, and I am not going to guess at it — the measurement is the finding
and the mechanism is the next phase's first question.

**Recommendation:** its own phase, with the pre-state captured first (C3). Two things to settle
there, in this order: (1) whether `/revenue` may legitimately serve `project_irr: null` when an
upstream price feed is down — I think it may not, and that a stale-but-honest capture is better
than a null IRR; (2) the dimensional fix at `:4201`. The gate suppresses this one site with its
register ID and prints it on every green run, so it cannot be forgotten.

### 43 · Decision 5 (NEEDS SIGNATURE, smaller) — the IRR solver's upper bracket escapes

The low end is guarded: `project_irr < -0.50 → null`. The high end is not. `calcIRR` bisects on a
bracket whose ceiling is 2.0, so a stream whose true IRR exceeds 200 % returns **exactly 2** and
is published as a 200 % return. `calcIRR([-100, 10000, 10000]) === 2` — asserted in
`workers/__tests__/numericsAudit.test.ts`. "IRR = 200 %" and "IRR > 200 %, not determined" are
indistinguishable downstream. Same class for `calcIRR([0,0,0]) === -0.99`: an undefined IRR
returned as a finite number that looks like data.

Unreachable from the public matrix today (max 22.9 %), reachable from the consultancy runners,
which take arbitrary capex and grant inputs. **Recommendation: return `null` at both bracket
edges and let the existing `irr_status` carry the reason.** Not done tonight: it changes a
published field's type on a path I have not enumerated the consumers of, and enumerating them is
the fix, not a rider on an audit.

## 48 · Pause A — four questions

**(a) HYPOTHESIS vs verified.** The prompt's core premises are **verified**, by reading the
route and by the caller audit below — `/feed/clean` took a caller-supplied `before`, parsed
its body under `catch { /* empty body ok */ }`, and wrote `feed_index` unconditionally
(`fetch-s1.js:9670-9685` at `0eed61b`). The A7 enumeration found the prompt's list of
unauthenticated writers **incomplete**: it names four, there were **sixteen**.

**(b) What consumes what this changes.** Answered by grep across this repo,
`~/kkme-control-center`, and the live VPS — the caller audit is the load-bearing part of
this phase and is tabulated below.

**(c) What fails silently here.** Before: an unauthenticated caller emptying the published
feed, with nothing to notice it — `/feed/clean` emitted no log at all. After: every
invocation logs its parameters and counts. Still silent and NOT fixed: `/curate`,
`/telegram/webhook`, and the nine GET routes that recompute-and-write on a public read.

**(d) At which layer and time.** Three layers. Route-level tests drive the real `fetch`
handler against an in-memory KV so each case asserts the status code **and** whether
`feed_index` moved. Each gate then proven failable by inject-then-revert. Then live curl
against production after deploy, per C8 (poll to two agreeing reads).

### 48 · The caller audit — done BEFORE the auth change, because that is the failure mode

A working ingestion path broken by a security fix is a self-inflicted outage. Every caller
of the four routes, from all three places they could live:

| Route | Live caller | Sends `X-Update-Secret`? | Effect of gating |
|---|---|---|---|
| `/feed/events` | `daily_intel.py` (VPS cron, 07:30 UTC) | **YES — already did** | none |
| `/feed/events` | `kkme_sync.py` — **not a caller**; only `kkme_sync.py.local` (unused) references it | n/a | none |
| `/feed/clean` | **none** — no automated caller in repo, control-center or VPS | n/a | none |
| `/feed/backfill-curations` | **none** — one-time migration endpoint, manual curl | n/a | none |
| `/contact` | `app/components/ContactForm.tsx` (public browser form) | no, by design | **not gated** |

The decisive one: `daily_intel.py:525` was **already sending the header** before any gate
existed — the worker simply ignored it. Verified the VPS secret is the live one via a
read-only control with a negative case (B11): `GET /contact` with the VPS `UPDATE_SECRET`
→ **HTTP 200**; with a nonsense value → **HTTP 401**. The two responses differ, so the 200
means authentication, not "the page always renders".

**The path that would have broken, and was therefore left alone:** `POST /curate` is also
an unauthenticated `feed_index` writer (via `appendCurationToFeedIndex`). Its live caller,
`sync_to_website.py` (VPS `cron_daily.sh`, 06:00 UTC), sends **no secret**. Gating it in
this phase would have killed the ~30-items/day intel path. Reported below, not fixed.

### 48 · What changed

`/feed/clean` — four changes, in order:
1. `UPDATE_SECRET`, the identical `x-update-secret` gate `/feed/purge-irrelevant` already
   uses eleven lines earlier. **No second auth mechanism introduced** (rule #4).
2. Explicit body validation. `before` is now **required** — the 60-day default is gone,
   because the default was the destructive part. Malformed, absent, non-object and
   non-ISO bodies are all 400, none of them reaching the KV write.
3. A `before` in the future is refused — it can only mean "remove everything".
4. Blast radius: removing more than **50 %** of `feed_index` returns 409 unless the caller
   passes `"confirm": true`. Every invocation — accepted or refused — logs
   `before`, `confirm`, totals and counts. No secret in any log line.

`/feed/events`, `/feed/backfill-curations` — same gate, same body validation. `/feed/events`
still accepts a bare array (a legitimate shape there), which `/feed/clean` does not.

`/contact` — **stays public by design**, bounded rather than gated: 16 KB body cap (413),
`type` restricted to the four known values, per-field length limits, and an email-shape
check. **It is NOT rate-limited — see the gap below.**

### 48 · The four proofs, and each one proven failable

Route-level, against an in-memory KV, asserting KV state before and after — a status-code
assertion alone cannot distinguish "refused" from "refused after writing" (B2).
`app/lib/__tests__/endpointAuth.test.ts`, 40 tests.

| Proof | Result | KV state |
|---|---|---|
| Unauthed `{"before":"2099-01-01"}` | **401** `unauthorized` | `feed_index` byte-identical, `puts` = 0, still 4 items |
| Authed + malformed body `{not json` | **400** `Malformed JSON body` | unchanged, `puts` = 0 |
| Authed + future `before` (also with `confirm:true`) | **400** `must not be in the future` | unchanged, `puts` = 0 |
| Authed + legitimate `before` | **200** `{cleaned:1, remaining:3}` | one write; log line asserted, and asserted NOT to contain the secret |

Inject-then-revert (B13) — every gate broken in turn, suite must go red, then restore:

| Injection | Suite |
|---|---|
| baseline | 40 passed |
| `/feed/clean` auth check removed | **2 failed** |
| the swallowing `catch` + 60-day default restored | **7 failed** |
| future-`before` refusal removed | **3 failed** |
| blast-radius bound removed | **2 failed** |
| restored | 40 passed |

Worker file confirmed byte-identical to its pre-injection state afterwards.

### 48 · A7 — every KV-writing route, with auth status

The prompt named four unauthenticated writers. Enumerated mechanically
(`node route-audit.mjs`, brace-matched over `workers/fetch-s1.js`): **84 route guards,
46 of them KV writers.** Before: **30 authed, 16 unauthed.** After: **33 authed, 13
unauthed.**

The enumeration script's first version reported `/feed/backfill-curations` as *authed* —
it had matched the string `x-update-secret` inside an **explanatory comment** above the
next route. That is B13 exactly, in the audit tool rather than in a test. Comments are
stripped before the auth test now; the corrected count is the one above.

**Remaining 13 unauthenticated KV writers, all reported, none silently accepted:**

| Route | Writes | Why not fixed here |
|---|---|---|
| `POST /curate` | `feed_index` + curation KV | **Live caller sends no secret** (`sync_to_website.py`). Fixing needs a two-step across repos — see below. **Highest-priority follow-up.** |
| `POST /telegram/webhook` | session KV | Needs Telegram's `X-Telegram-Bot-Api-Secret-Token`, a different mechanism from `UPDATE_SECRET`; out of scope for a phase forbidden to invent a second scheme |
| `POST /contact` | `contact_submissions` | Public by design; now bounded, not gated |
| `GET /digest`, `/s3`, `/s5`, `/s4`, `/genload`, `/euribor`, `/da_tomorrow`, `/revenue`, and the `/${sig}` + `/${genSig}` catch-alls | their own computed cache keys | **Lazy recompute-on-read.** Same *shape* as the pre-B-047 catch-all: a public GET causes a KV write. They write derived values, not caller-supplied content, so they are amplification/cost exposure rather than an injection path. Reported per the prompt's "even if it looks harmless" |

`/curate` is the one that matters, and it is the same class as `/feed/events`: an
unauthenticated writer into published content, which collides with discipline rule #3.
The fix is ordered, not hard: **(1)** add the header to `sync_to_website.py` and deploy
that to the VPS, **(2)** verify a live curate round-trip, **(3)** only then gate the route.
Doing it in the other order is the outage.

### 48 · `/contact` rate limiting — the gap, stated rather than left silent

Payload bounds shipped. **Rate limiting did not, because it needs infrastructure that is
not configured.** The options and why each was rejected tonight:

- **KV-backed counter** — rejected. It answers an unauthenticated-write problem by adding
  an unauthenticated KV write per request; it makes the amplification worse.
- **Cloudflare rate-limit binding** (`[[unsafe.bindings]] type = "ratelimit"`) — the right
  answer: edge-side, no KV, no per-request cost. It needs a `wrangler.toml` change, so it
  changes the deploy surface. **Proposed, not shipped in a security-fix deploy.**

Recommendation: `{ limit: 5, period: 60 }` keyed on client IP for `/contact`, in its own
change with its own deploy, so a binding-provisioning failure cannot be confused with this
phase. Until then `/contact` is bounded per-request but unbounded in request *rate*, and
each accepted submission costs one KV read, one KV write, a Telegram call and a Resend call.

### 48 · Findings adjacent to the fix, reported not fixed

1. **`/contact` interpolates submitted fields into an HTML email unescaped**
   (`fetch-s1.js` `htmlBody`). Reaches the operator's own inbox, so it is
   HTML-injection into a mail client rather than site XSS. Different risk class from this
   phase's remit; needs escaping.
2. **`s2_daily_clearing` ingest is 7 days behind** — see Decision 10.

### 48 · Decision 10 — the BTD retention question, answered

The question was whether the irreplaceable list has five entries or four. **One query
settles it**; it needed controls, because an old window returns HTTP 200 with a full 192
intervals and **every value null** — counting intervals would have reported data where
there is none (B11).

Controls discriminate: a recent window returns **2880/2880 non-null**; a nonsense dataset
id returns **HTTP 400**. Different responses, so the ladder below is interpretable.

| Age | Window | Non-null |
|---|---|---|
| 299 d | 2025-10-07 | 1440/1440 |
| 305 d | **2025-10-01** | **1440/1440 — deepest fully-populated day** |
| 306 d | 2025-09-30 | 360/1440 (25 %) |
| 307 d | 2025-09-29 | 120/1440 (8 %) |
| ≥ 308 d | 2025-09-27 and older | 0/1440 |

Live `GET /s2/daily-clearing` at execution time: **299 days, first `2025-10-01`, last
`2026-07-26`.**

**The series begins on exactly the deepest day BTD still fully serves.** Not a
coincidence — it was seeded by a backfill against BTD's window, so it starts where that
window started.

**Verdict: four entries today, five tomorrow.** `s2_daily_clearing` is re-derivable from
BTD *today*, with **zero days of margin**. The KV series is append-only — the import at
`:10674` merges and never trims — so its oldest entry stays pinned at `2025-10-01` while
BTD's retention window slides forward one day per day. From tomorrow, one more day of the
series becomes permanently unrecoverable per day elapsed.

**This inverts the urgency the backup design was going to be built around.** The 299-day
clearing history is not "the one we should test first"; it is the one that is expiring
now. Recommendation: export it this week, before any further backup design work.

Two stale premises corrected on the way (A3):

- **"BTD has been down since 2026-07-17"** (`docs/methodology-lender.md` §8.4 and :1081) is
  **FALSE as of 2026-08-03.** Every day in the claimed outage window returns 1440/1440:
  07-16, 07-18, 07-22, 07-26, 07-28, 07-31 all full. BTD serves through **2026-08-02**, a
  ~1-day publication lag, not 2. The doc needs updating; not edited here (this branch is
  the auth fix alone).
- **The `s2_daily_clearing` importer is 7 days behind** — last stored day `2026-07-26`
  while BTD serves through `2026-08-02`. Those days are still inside retention so nothing
  is lost yet. B8: nothing alerted on this. Belongs with Phase 49 item 4's staleness sweep.
