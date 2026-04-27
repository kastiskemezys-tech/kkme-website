# Phase 7.7b Session 1 — Engine Audit (READ-ONLY, no edits)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-7-7b-engine-audit` off main (after Phase 7.7a merges).
**Estimated runtime:** 1.5–2 hours.

**This session ships ZERO production-side changes.** No worker edits. No `wrangler deploy`. No card edits. No engine math fixes. The single deliverable is a markdown audit document with fixtures, plus a clear decision matrix for Session 2.

**Why audit-first:** Phase 7.7b's biggest risk is the revenue stack allocator (item 7.7.7). Pre-audit by Cowork (2026-04-26) found `gross_annual = afrr_annual + mfrr_annual + trading_annual` (line 4164 in `workers/fetch-s1.js`) and `gross_revenue_y1 = rev_bal + rev_trd` in v7 (line 1158 invariant). The `trading_real = 0.85` is documented as a "perfect-foresight discount" — NOT a shared-MW penalty. This *strongly suggests* the gross sums are physically additive without netting for the same MW being committed to multiple markets simultaneously.

**If the audit confirms double-counting:** every IRR on the site shifts down 10–25% after the fix. That's a credibility-grade change. We need:
1. A clear written record of WHY the change is being made.
2. Fixtures locked to current production values.
3. A feature-flagged rollout (deploy with flag OFF, verify nothing changes; deploy with flag ON, verify the new math produces the expected lower numbers).
4. Kastytis approval before flipping the flag in production.

This Session 1 produces that written record. Session 2 (separate prompt, authored only after Session 1 ships) will execute the actual change — IF a change is needed.

---

## Success criteria for this session

A successful Phase 7.7b Session 1 produces, in this order:

1. **6 fixture JSON files** in `docs/audits/phase-7-7b/baseline-{scenario}-{dur}.json` — frozen reference of current production values.
2. **A math-trace** that answers all 6 sanity-check questions in §2.5 crisply with line-number citations.
3. **An audit document** at `docs/audits/phase-7-7b/stack-audit.md` with: production fixtures referenced, engine paths analysed (v7 + v6 + legacy), decision matrix, recommended action verdict (NO FIX / FIX REQUIRED / AMBIGUOUS) with confidence level, migration plan if FIX REQUIRED, open questions for Kastytis.
4. **A Vitest fixture-comparison spec** at `app/lib/__tests__/revenueStackFixture.test.ts` that asserts internal consistency of the fixtures (additive invariant, percentage sum, IRR sanity range).
5. **(Optional) A throwaway debug script** at `scripts/audit-stack.mjs` if static math-tracing was insufficient.
6. **A clean, single commit** carrying everything above. Push branch. Report to Kastytis with the verdict + the open questions.

**A FAILED Session 1 looks like:** confident verdict with no line-number citations, missing fixtures, audit doc that says "I think the engine probably..." without evidence, no Vitest spec, multiple commits scattered with debug code mixed in. **If you find yourself heading there, stop and Pause B-report a partial audit.** The honest partial deliverable is more valuable than the confident-but-shaky full one.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — §1, §1b, §2 Phase 7.7
3. `cat docs/phases/plan-audit-2026-04-26.md` — Phase 7.7 split rationale (this prompt is 7.7b Session 1, the audit-only first session of the engine-extension half)
4. `.auto-memory/reference_engine_audit.md` — current understanding of what `/revenue` returns
5. `cat docs/handover.md` — most recent entries cover Phase 7.7a
6. `git log --oneline -10` — confirm `main` has 7.7a commits
7. `git checkout main && git pull && git checkout -b phase-7-7b-engine-audit`
8. `git status` — clean working tree
9. `bash scripts/diagnose.sh` — confirm prod still green
10. `npm test` — establish current baseline (likely ~333 after 7.7a's 76 new specs). Document the count; doesn't matter what it is, only that all tests pass.
11. `npx tsc --noEmit` — clean

**Known engine quirks already discovered (don't re-investigate; document if they touch your audit):**

These were surfaced during Phase 7.7a's display work and are explicitly OUT of this audit's scope. Listed here so you don't waste time chasing them:

- **`all_scenarios.stress.project_irr` returns null** for current `/revenue` requests. The stress scenario IRR isn't being populated by the v7 engine — engine bug. Note in the audit's "Out-of-scope improvements noticed" section but do NOT investigate further. Engine fix belongs in a later 7.7b/c session.
- **`worst_month_dscr = 0.93×`** is below 1.0× covenant in the base scenario. Phase 7.7a surfaced this on the Returns card. It's a real risk signal, not a display bug — the v7 engine genuinely models a cash-trap month in Y1. **Important:** if your stack-allocator audit reveals double-counting, the post-fix `worst_month_dscr` could go LOWER (potentially below 0.50×). Worth flagging in the audit's migration-plan section as a downstream consequence Kastytis should know about before approving any fix.

**Capture current production fixtures (do not modify):**

The worker's `/revenue` endpoint accepts URL params (verified: line 7174-7177 in `workers/fetch-s1.js` reads `dur`, `capex`, `cod`, `scenario`).

**Step 1 — single-curl sanity check first:** before writing 6 fixture files, validate the URL pattern works:

```bash
mkdir -p docs/audits/phase-7-7b

BASE_URL='https://kkme-fetch-s1.kastis-kemezys.workers.dev/revenue'

# One probe — make sure URL pattern works and returns expected fields
curl -s "${BASE_URL}?scenario=base&dur=2h" | jq '{
  scenario, duration, model_version, system, capex_eur_kwh,
  project_irr, equity_irr, min_dscr,
  gross_revenue_y1, capacity_y1, activation_y1, arbitrage_y1
}'
```

If any of those fields comes back null or the JSON is empty, **stop and report**. The endpoint contract may have drifted from `reference_engine_audit.md`. Do NOT proceed to batch capture if the probe doesn't return expected fields.

**Step 2 — batch capture once probe is clean:**

```bash
for SCEN in base conservative stress; do
  for DUR in 2h 4h; do
    OUT="docs/audits/phase-7-7b/baseline-${SCEN}-${DUR}.json"
    curl -sf "${BASE_URL}?scenario=${SCEN}&dur=${DUR}" -o "${OUT}"
    if [ ! -s "${OUT}" ]; then
      echo "FAIL: ${OUT} is empty or curl failed"; exit 1;
    fi
    # Confirm gross_revenue_y1 is present and numeric
    jq -e '.gross_revenue_y1 | numbers' "${OUT}" > /dev/null || { echo "FAIL: ${OUT} missing gross_revenue_y1"; exit 1; }
  done
done
echo "✓ 6 fixture files captured cleanly"
```

The `curl -sf` flag fails fast on HTTP errors. The `jq -e` validator confirms the field exists and is numeric — catches a silent partial-failure mode where curl returns `{}` on certain edge conditions.

These fixture files are the **frozen reference**. If the engine ever needs to be rolled back, these tell us what "today's numbers" looked like. They are the regression-test substrate for Session 2 onward.

Report state, pause for "go" before reading the worker source.

---

## 1. Read computeRevenueV7() end-to-end (~30 min)

**Override note:** CLAUDE.md says "never cat whole worker file (7740+ lines), use grep." For THIS session that rule is suspended for the specific function bodies you need to trace. Audits require following call chains across multiple functions; pure grep loses context. Use the `Read` tool with explicit line ranges — never the whole file at once, but DO read entire function bodies.

Open `workers/fetch-s1.js` and read the v7 engine path top-to-bottom. Don't grep for individual fields — read the function in order so the data flow makes sense.

**Example formula trace (this is the standard CC should follow for every input expression):**

```
TARGET: rev_bal at line 1027
  rev_bal = R_yr * bal_calibration * mw * Math.min(1.0, bal_scale)

STEP 1: R_yr (line 1015)
  R_yr = mix.R
  mix is the result of computeBaseYear() / computeTradingMix() / etc.
  → trace mix.R → line 1823: R_cap_base = afrr_share * afrr_cap + mfrr_share * mfrr_cap
  → trace afrr_share → line N: afrr_share = ...
  → afrr_share UNITS: dimensionless, 0..1 (allocation fraction OR per-MW yield?)
  → afrr_share + mfrr_share + ... = 1.0? <0.6? UNKNOWN — note this gap

STEP 2: bal_calibration (line 1025)
  bal_calibration = by_balancing_per_mw > 0 && R_now > 0 ? by_balancing_per_mw / R_now : 1
  → by_balancing_per_mw: trace
  → R_now: trace

STEP 3: mw — easy, the asset MW (50 in fixture)

STEP 4: bal_scale (line 1021)
  bal_scale = scale_energy / Math.min(1.0, (dur_h * getDegradation(1, cycles)) / total_energy_req)
  → scale_energy: trace
  → total_energy_req: trace

VERDICT: rev_bal is built from <inputs> with units <units>.
Does it physically claim 50 MW × 8760 hours of balancing capacity? <yes/no/partial>
Evidence: <line refs + units analysis>
```

That's what one input trace looks like. Repeat for `rev_trd` (line 1040). Then check `rev_gross = max(floor, rev_bal + rev_trd)` for whether the sum is physically realisable.

Key file landmarks (verified by Cowork 2026-04-26):
- **Line 916:** `function computeRevenueV7(params, kv)` — entry point.
- **Line 1013-1015:** `RT_yr = mix.R + mix.T`, `R_yr = mix.R` — splits balancing (R) from trading (T).
- **Line 1021:** `bal_scale = scale_energy / Math.min(1.0, (dur_h * getDegradation(1, cycles)) / total_energy_req)` — the balancing scaling factor.
- **Line 1025:** `bal_calibration = by_balancing_per_mw > 0 && R_now > 0 ? by_balancing_per_mw / R_now : 1` — calibration to a reference value.
- **Line 1027:** `rev_bal = R_yr * bal_calibration * mw * Math.min(1.0, bal_scale)` — balancing revenue.
- **Line 1035:** `trading_real = sc.trd_real || 0.85` — perfect-foresight discount.
- **Line 1040:** `rev_trd = yr_capture * spread_mult * depth * rte_yr * trading_real` — trading revenue.
- **Line 1048:** `rev_gross = Math.max(REVENUE_FLOOR_PER_MW * mw, rev_bal + rev_trd)` — **gross is the sum**.
- **Line 1052-1053:** `rev_cap = rev_bal * 0.65; rev_act = rev_bal * 0.35;` — heuristic split for reporting only.
- **Line 1158:** `gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross - y.rev_bal - y.rev_trd) < 2)` — invariant check confirms additive sum.

Also read v6 (line 1334+) since the matrix sensitivity uses v6 paths in some scenarios:
- **Line 1440-1443:** rev_cap_fcr/afrr/mfrr each computed independently, summed.
- **Line 1445-1447:** rev_act_afrr/mfrr similarly.
- **Line 1449:** `rev_bal = (rev_cap + rev_act) * sc.real_factor`.
- **Line 1455:** `rev_trd = e_out * capture * rte` — independent calculation.
- **Line 1458:** `rev_gross = rev_bal + rev_trd`.

And the v2-style legacy path at line 4143+ (`computeRevenueWorker`):
- **Line 4151-4152:** `afrr_mw_provided = 0.5 * alloc.afrr; mfrr_mw_provided = 0.5 * alloc.mfrr;` — symmetric reserve halving.
- **Line 4162:** `trading_annual = trading_swing * capture_factor * B.cycles_per_day * 365 * duration_mwh_per_mw * B.roundtrip_efficiency` — uses full duration.
- **Line 4164:** `gross_annual = afrr_annual + mfrr_annual + trading_annual`.

Compute and document **for each engine path (v7 + v6 + legacy)**:

1. **What does `mix.R` represent?** Is it €/MW/yr of balancing revenue assuming 100% MW commitment, or is it already partitioned across products?
2. **What does `mix.T` / `yr_capture` represent?** Is it MWh/yr of arbitrage achievable assuming full asset access, or is it the trading throughput net of MW committed to balancing?
3. **Does `bal_calibration`, `bal_scale`, `trading_real`, or any other factor explicitly account for shared MW?** Or are they all unrelated to that question?
4. **For a 50 MW / 4h / mid CAPEX / base scenario asset:**
   - Compute `rev_bal` from the formulas + payload values.
   - Compute `rev_trd` from the formulas + payload values.
   - Compute their sum.
   - Confirm the sum matches `gross_revenue_y1` from the production fixture (within rounding).

If the sum matches, the audit confirms what we suspect: balancing and trading are computed independently and summed. Whether that's *correct* depends on whether the inputs (`mix.R`, `mix.T`, `yr_capture`) are physically consistent with co-bidding the same MW.

---

## 2. Trace mix.R and mix.T upstream (~30 min)

From line 1013, `RT_yr = mix.R + mix.T`. Where does `mix` come from?

Grep for `mix =` and `function buildMix` or similar:

```bash
grep -nE "function (build|compute|get).*[Mm]ix|mix = {|let mix =|const mix =" workers/fetch-s1.js
```

Read the function that produces `mix`. Document:

1. **`mix.R` definition and units.** What's its full expression? What are its inputs? Does it implicitly assume 100% MW commitment to balancing?
2. **`mix.T` definition and units.** Same questions.
3. **Are mix.R and mix.T computed using overlapping or disjoint MW resources?** This is the key question. If the BESS has 50 MW total, and `mix.R` assumes 50 MW × 8760 h × balancing_price, AND `mix.T` assumes 50 MW × 365 cycles × arbitrage_capture, then summing them is double-counting in the physical sense.

Specifically check `computeBaseYear()` (line 1941 per earlier grep):

```bash
grep -nE "computeBaseYear|R_cap_base|T_base|afrr_share|mfrr_share|REFERENCE_CYCLE_H" workers/fetch-s1.js
```

Read line 1809-1834 region. The expressions `R_cap_base = afrr_share * afrr_cap + mfrr_share * mfrr_cap` and `T_base = s1_capture_ref * rte * trading_real / (2 * REFERENCE_CYCLE_H)` are critical — note what `afrr_share` / `mfrr_share` sum to (likely <= 1.0) and whether `T_base` netting accounts for time committed to balancing.

**If math tracing gets stuck (the worker is genuinely too dense to follow):** stop and pause. Don't guess. Document what you traced, what you couldn't, and what assumption would change the verdict. A partial audit with explicit gaps ("I couldn't determine whether `trading_swing` accounts for shared MW; the chain goes through `computeTradingMix()` and I lost track at line N") is much more useful than a confident-but-wrong analysis.

**Optional debug-script approach if math is impossible to follow statically:** create a tiny throwaway script at `scripts/audit-stack.mjs` that hardcodes the formulas with fixture-derived inputs. This grounds the math in concrete numbers when static reading is too dense.

**Template (CC fills in the formulas + inputs from what was traced):**

```js
// scripts/audit-stack.mjs — temporary, delete in Session 2
// Recomputes rev_bal + rev_trd from traced formulas using fixture inputs.
// Compares to fixture's actual gross_revenue_y1 to ground-truth the trace.

import baseline from '../docs/audits/phase-7-7b/baseline-base-4h.json' with { type: 'json' };

// Inputs from fixture
const mw = 50;                        // fixture system: '50 MW / 200 MWh (4H)'
const dur_h = 4;
const cycles = 1;                     // assumed 1 cycle/day per Returns model

// Inputs derived from worker source — REPLACE WITH ACTUAL TRACED VALUES
const trading_real = 0.85;            // line 1035
const cpi_at_cod = baseline.cpi_at_cod;
// Add: afrr_cap, mfrr_cap, fcr_cap, afrr_share, mfrr_share, trading_share, etc.

// Recompute (mirror of computeRevenueV7)
const rev_bal_traced = /* formula from line 1027 with above inputs */;
const rev_trd_traced = /* formula from line 1040 with above inputs */;
const rev_gross_traced = Math.max(0, rev_bal_traced + rev_trd_traced);

console.log(JSON.stringify({
  fixture_gross: baseline.gross_revenue_y1,
  traced_gross:  rev_gross_traced,
  delta_pct:     ((rev_gross_traced - baseline.gross_revenue_y1) / baseline.gross_revenue_y1) * 100,
  fixture_capacity: baseline.capacity_y1,
  fixture_activation: baseline.activation_y1,
  fixture_arbitrage: baseline.arbitrage_y1,
  traced_bal:    rev_bal_traced,
  traced_trd:    rev_trd_traced,
}, null, 2));
```

Run with `node scripts/audit-stack.mjs`. If `delta_pct` is < 1%, your trace is correct — the formula reconstruction matches production. If > 5%, you've misunderstood an input or missed a factor; revisit §1-2.

**This script is temporary.** Commit it in §5 but Session 2 (whatever it ends up being) deletes it. Its purpose is to anchor the audit's claims in reproducible numbers, not to live as production code.

---

## 2.5 Pause B — math-trace checkpoint

After reading the engine paths but BEFORE writing the audit document, you must be able to **answer all of these crisply** in writing:

1. Which engine path is production-active for `?dur=4h&scenario=base`? (v7? v6? legacy?) Cite the line that confirms.
2. What does `mix.R` measure? Units = `<€/MW/yr | €/MWh | dimensionless>`. Citation = line N.
3. What does `mix.T` (or `yr_capture`) measure? Units = `<...>`. Citation = line N.
4. For a 50 MW / 4h / base scenario asset, plugging fixture values into `rev_gross = rev_bal + rev_trd`, does the math sum to fixture's `gross_revenue_y1` within rounding? Yes/no.
5. Does the engine partition MW across products (e.g., afrr_share + mfrr_share + trading_share ≤ 1.0) anywhere upstream? Yes/no/partial. If yes, where (line N).
6. If `mix.R` / `mix.T` do NOT partition MW, what's the expected delta if a partition is enforced? (Use the calculation method below.)

**Estimated-overstatement calculation method.** Don't guess a range. Use this:

```
Theoretical maximum revenue per MW per year, assuming PURE balancing (no trading):
  R_max_pure_balancing = average_capacity_clearing_price × 8760 hours
  ≈ €7-15/MW/h × 8760 h = €60,000 - €130,000/MW/yr

Theoretical maximum revenue per MW per year, assuming PURE arbitrage (no balancing):
  T_max_pure_arbitrage = (average_DA_spread × cycles_per_year) × duration_hours × RTE
  ≈ €36/MWh × 365 × 4 × 0.85 = ~€44,500/MW/yr

If gross_revenue_y1 / mw approaches or exceeds (R_max_pure_balancing + T_max_pure_arbitrage):
  → the engine is summing OVERLAPPING revenue streams (overstatement risk: 30-50%)

If gross_revenue_y1 / mw is well below the sum:
  → the engine has implicit netting somewhere; lower overstatement risk
  → but verify: how does the model arrive at the lower number? scaling factors? base-year calibration?
```

Plug fixture values. Report the result. Then propose a **tentative verdict** (NO FIX / FIX REQUIRED / AMBIGUOUS) with confidence level (LOW / MEDIUM / HIGH).

Wait for "go" before writing §3 (the audit document) and §4 (the Vitest spec). This pause exists because the audit document represents a *judgment* about how the engine works — Kastytis should sanity-check the math-tracing before CC commits to a verdict in writing.

**If you can't answer questions 1–6 crisply, do NOT proceed to §3.** Report the gap, request guidance, optionally use the debug-script approach (§2 escape hatch) to gather more data.

---

## 3. Build a written audit document (~30 min)

Create `docs/audits/phase-7-7b/stack-audit.md` with the following structure:

```markdown
# Revenue Stack Composition Audit — Phase 7.7b Session 1
*Captured: <date> by <CC session>*

## Production fixtures
[Reference the JSON files captured in §0]

## Engine paths

### v7 path (computeRevenueV7, line 916)
- **Balancing input:** mix.R = <expression>, units = €/MW/yr, computed from <inputs>
- **Trading input:** yr_capture = <expression>, units = €/MW/yr (or MWh × €/MWh)
- **Composition:** rev_gross = rev_bal + rev_trd (line 1048)
- **Shared-MW accounting:** [explicit netting? implicit through mix? none?]
- **Verification math:** plugging fixture values gives rev_bal=<X>, rev_trd=<Y>, sum=<Z>, fixture gross_revenue_y1=<W>. Match: yes/no within rounding.

### v6 path (computeRevenueV6, line 1334)
[Same structure]

### Legacy path (computeRevenueWorker, line 4143)
[Same structure]

## Decision matrix

| Question | Answer | Evidence |
|---|---|---|
| Is rev_bal + rev_trd genuinely additive? | yes / no | [line refs] |
| Do mix.R and mix.T (or equivalents) net for shared MW? | yes / no / partial | [line refs] |
| If summed, does the model produce physically realizable revenue? | yes / no / unsure | [reasoning] |
| Estimated overstatement if double-counting confirmed | X% | [back-of-envelope: time committed to balancing × trading-yr] |

## Recommended action

One of:
- **NO FIX NEEDED** — the audit confirms shared-MW accounting is implicit in mix.R / mix.T inputs (e.g., afrr_share + mfrr_share + trading_share <= 1.0 partition). Phase 7.7b Session 2 proceeds to LCOS + MOIC additions.
- **FIX REQUIRED** — confirmed double-counting. Phase 7.7b Session 2 ships the fix behind a feature flag. Estimated IRR shift: -X to -Y pp. Communicate to readers / preserve fixtures.
- **AMBIGUOUS** — math is not obviously wrong but the engine assumes optimistic conditions (e.g., 100% reserve availability simultaneous with 100% trading availability). No "fix" but document the assumption explicitly on the cards. Phase 7.7b Session 2 proceeds with that documentation.

## Migration plan (if FIX REQUIRED)

If the verdict is FIX REQUIRED, the audit document MUST also include:

1. **Model version bump.** Worker bumps `model_version` from `v7` → `v8` so cards can display "Model v8: bal/trd allocator corrected" alongside the new (lower) IRRs. Investors who took screenshots under v7 can reconcile.
2. **Methodology page diff.** Phase 7.8.1 methodology page (when it ships) carries a "v7 → v8 changelog" section explicitly stating the correction.
3. **Communication strategy** — does Kastytis want to (a) silently ship lower IRRs with a footnote, (b) write a public methodology note explaining the correction, or (c) hold the fix until the methodology page is live so the explanation accompanies the change? Default: **(c)** — the fix is right but credibility-grade. Better to ship with the explanation than alone.
4. **Old-fixture preservation.** Keep `baseline-*-v7.json` files committed even after Session 2 ships the fix. Future analysts can compute the v7 vs v8 delta from the fixtures alone.

## Out-of-scope improvements noticed during audit

If during the engine read CC notices other issues (a bug elsewhere, an opportunity to refactor, a missing assumption), list them here as "noticed but not fixed" — separate phase work. The audit's value is laser-focused on stack composition; do NOT widen scope mid-audit.

## Open questions for Kastytis
[Anything CC discovers that needs human judgment — e.g., "the engine assumes 365 cycles/yr; is that the realistic post-augmentation figure?"]

## Fixtures committed
- `docs/audits/phase-7-7b/baseline-base-2h.json`
- `docs/audits/phase-7-7b/baseline-base-4h.json`
- `docs/audits/phase-7-7b/baseline-conservative-2h.json`
- `docs/audits/phase-7-7b/baseline-conservative-4h.json`
- `docs/audits/phase-7-7b/baseline-stress-2h.json`
- `docs/audits/phase-7-7b/baseline-stress-4h.json`
```

---

## 4. Write a Vitest fixture-comparison spec (~15 min)

Create `app/lib/__tests__/revenueStackFixture.test.ts` that:

1. Imports the production fixture JSON files.
2. Asserts the current production values match a snapshot of expected fields (project_irr, equity_irr, min_dscr, gross_revenue_y1, capacity_y1, activation_y1, arbitrage_y1).
3. Computes `capacity_y1 + activation_y1 + arbitrage_y1` and compares to `gross_revenue_y1`.
4. Documents the relationship: if it matches exactly, sum is the gross. If it's less, there's an opex/fee deduction in between. If more, double-counting.

This spec serves as a **regression guard**: if Session 2 ships a fix, this spec must be updated with the new expected values, and the diff is the proof.

```ts
import { describe, it, expect } from 'vitest';
import base2h from '../../../docs/audits/phase-7-7b/baseline-base-2h.json';
import base4h from '../../../docs/audits/phase-7-7b/baseline-base-4h.json';
import conservative2h from '../../../docs/audits/phase-7-7b/baseline-conservative-2h.json';
import stress2h from '../../../docs/audits/phase-7-7b/baseline-stress-2h.json';

describe('Phase 7.7b production fixtures — frozen reference', () => {
  // The fixtures are the truth. These tests assert the fixtures are internally
  // consistent and that gross = bal + trd holds (the additive invariant).
  // If Session 2 ships a fix, regenerate fixtures + update these expectations.

  describe.each([
    ['base 2h',          base2h],
    ['base 4h',          base4h],
    ['conservative 2h',  conservative2h],
    ['stress 2h',        stress2h],
  ])('%s', (label, fixture) => {
    it('gross_revenue_y1 ≈ capacity_y1 + activation_y1 + arbitrage_y1 (additive invariant)', () => {
      const sum = fixture.capacity_y1 + fixture.activation_y1 + fixture.arbitrage_y1;
      // Tolerance: 2 because line 1158 in worker uses Math.abs(...) < 2 as its own invariant
      expect(Math.abs(sum - fixture.gross_revenue_y1)).toBeLessThan(2);
    });

    it('percentages sum to ~1.0', () => {
      const sumPct = fixture.capacity_pct + fixture.activation_pct + fixture.arbitrage_pct;
      expect(sumPct).toBeCloseTo(1.0, 1);
    });

    it('project_irr is a sensible decimal (-0.5 < x < 0.5)', () => {
      expect(fixture.project_irr).toBeGreaterThan(-0.5);
      expect(fixture.project_irr).toBeLessThan(0.5);
    });

    it('min_dscr is positive', () => {
      expect(fixture.min_dscr).toBeGreaterThan(0);
    });
  });
});
```

The spec is **self-referential** — it asserts the fixture's internal consistency, not against hardcoded numbers. This is intentional: the fixture IS the snapshot of "current truth." If/when Session 2 regenerates fixtures after a fix, this same spec runs against the new fixture and continues to pass (because the new fixture also satisfies the additive invariant — just with smaller `gross_revenue_y1`). The diff in the **fixture JSON** is the audit trail, not the diff in the spec.

---

## 5. Pause C — Audit report

Commit:
- `docs/audits/phase-7-7b/baseline-revenue-base.json` (and conservative + stress)
- `docs/audits/phase-7-7b/stack-audit.md` (the written audit)
- `app/lib/__tests__/revenueStackFixture.test.ts`

Single commit message: `phase-7-7b(audit): production fixtures + stack composition audit (read-only, no engine changes)`.

Push branch.

Report to Kastytis with:
- Commit hash
- The decision matrix from `stack-audit.md` quoted in the report
- Recommended action (NO FIX / FIX REQUIRED / AMBIGUOUS)
- Open questions for him

**Stop. Do not author Session 2 prompt yet.** Session 2's content depends entirely on the audit's recommended action. If NO FIX, Session 2 is "add LCOS + MOIC to engine." If FIX REQUIRED, Session 2 is "ship stack allocator behind feature flag." If AMBIGUOUS, Session 2 might be "document assumptions on cards." Kastytis decides after reading the audit.

---

## 6. Hard stops

- **Zero engine code changes.** This session is read-only audit + fixture capture + written analysis.
- **Zero `wrangler deploy` calls.** Production stays untouched.
- **Zero card edits.** Cards are also untouched.
- No new dependencies.
- The pre-existing untracked items in working tree are out of scope.
- No `--force`, no `reset --hard`, no `gh` CLI.
- If the worker source is too dense to fully understand in one session, **stop and ask** — better to publish a partial audit with explicit "I couldn't trace XYZ" notes than to publish a confident-but-wrong analysis. The audit's value comes from honesty.
- **Budget check at 60% context:** if you're at §2 and approaching 60% context, stop the math-tracing and report what you have. Better to ship a "tentative verdict, audit incomplete" report and hand off to a v2 prompt than to rush §3 and produce a wrong analysis. The audit document can land in two passes if needed.
- **Don't trust grep alone for math chains.** Some computations span multiple functions with small intermediate variables. If grep doesn't show the full chain, READ the function bodies in order. The pre-audit by Cowork may have missed lines that change the verdict.

---

## 7. After Session 1 ships

Update `docs/handover.md` with a Session entry covering:
- Audit findings (which path is which)
- Decision matrix verdict
- Fixtures committed
- Recommended Session 2 scope

Update Notion Phase tile for "Phase 7.7b Engine Extensions" — set Status to "In Progress" with note "audit-first; Session 1 of N done; Session 2 scope TBD pending Kastytis decision."

The next CC job depends on Kastytis's response to the audit. Author it after the recommended-action call lands.
