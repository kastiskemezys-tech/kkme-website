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
