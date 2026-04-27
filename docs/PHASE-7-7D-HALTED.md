# Phase 7.7d — HALTED (still — after recalibration round 2)

**Halted at:** 2026-04-27, after §5 synthetic-KV re-probe (`audit-stack.mjs --probe-v73`) on the recalibrated v7.3 work.
**Reason:** Three of the REVISED guardrails still fail. Recalibration was a strict improvement on the prior run (stress MOIC 0.04 → 0.36 / 0.14 → 0.58, IRRs in band, cycles up across the board), but the new direction assertion `MOIC_4h > MOIC_2h` fails as a fundamental MOIC-vs-equity-base relationship — not a calibration bug — and one cycles bound + one IRR bound miss by tiny margins.
**Last completed step:** §5 (re-probe with REVISED guardrails) ran and reported failures.
**Branch state:** `phase-7-7d-empirical-calibration` on origin (with the prior HALTED.md as commit). Recalibrated work — DA per-duration anchors, updated tests, updated probe — is in working tree, **uncommitted**.

---

## Recalibration that landed (uncommitted)

| Change | Details |
|---|---|
| `mwh_per_mw_yr_da` → `mwh_per_mw_yr_da_2h` + `_4h` | base 1100/1500, conservative 1000/1400, stress 800/1240 — mirrors v7.2 `cycles_{2h,4h} × duration × 365` calibration |
| `dur_scale_da = dur_h/2` formula | DROPPED — replaced with per-duration ternary lookup in `computeThroughputBreakdown` (worker) and `computeCycles` (TS mirror) |
| Test specs | Updated `throughputCycles.test.ts` for the new EFC bands and DA values — 9 new asserts; tests 656 → 665, all passing; tsc clean |
| Probe guardrails | Updated to revised bands (LCOS unchanged, MOIC [0.15, 5.5], cycles [400, 900], IRR_2h [10, 18], IRR_4h [6, 13], + cross-combo direction asserts) |

## What passed

| Guardrail | Result |
|---|---|
| Test count baseline | 656 → 665 (+9 new asserts on per-duration DA anchors) |
| `npx tsc --noEmit` | clean |
| LCOS for every combo in [60, 200] €/MWh | ✓ all 6 in band (€96.2–€126.1) |
| MOIC for every combo in [0.15, 5.5] | ✓ all 6 in band (0.36–4.67) |
| IRR_4h base in [6%, 13%] | ✓ 10.90% |
| IRR_2h > IRR_4h in base (NEW direction assert) | ✓ 18.09% > 10.90% |
| SOH at Y10 base/2h in [0.55, 0.85] | ✓ 73.0% |
| `warranty_status` valid enum | ✓ "within" for all 6 |
| `engine_calibration_source` populated | ✓ |
| Four new fields present in every fixture | ✓ |
| `model_version` v7.3 + 6-entry changelog | ✓ |

## What still fails

| Guardrail | Combo | Result | Band | Severity |
|---|---|---|---|---|
| `cycles_per_year` | stress / 4h | **349** | [400, 900] | small (51 EFCs short, ~12% under) |
| IRR_2h base in [10%, 18%] | base / 2h | **18.09%** | [10%, 18%] | tiny (0.09pp over upper bound) |
| `MOIC_4h > MOIC_2h` (NEW direction) | base | **3.21× < 4.67×** | strict inequality | structural — see below |

## Per-combo summary (recalibrated v7.3)

```
scenario/dur     EFCs/yr    LCOS   MOIC    project_IRR   warranty
─────────────────────────────────────────────────────────────────────
base/2h             678     € 96.2   4.67×     18.09%    within
base/4h             439     € 97.0   3.21×     10.90%    within
conservative/2h     603     €104.6   2.98×     12.22%    within
conservative/4h     402     €104.1   2.23×      7.37%    within
stress/2h           478     €126.1   0.36×       null    within
stress/4h           349     €118.5   0.58×       null    within

Direction asserts (NEW):
  IRR_2h > IRR_4h in base:   18.09% > 10.90%   ✓
  MOIC_4h > MOIC_2h in base: 3.21× > 4.67×     ✗
```

### Compare to v7.2-pre (production /revenue, captured §0.5)

```
                v7.2-pre  →  v7.3 (recal)        Δ              note
base/2h LCOS    €69.5      →  €96.2              +€26.7         steeper SOH = less energy delivered → higher €/MWh
base/4h LCOS    €76.3      →  €97.0              +€20.7
base/2h MOIC    4.86×      →  4.67×              −0.19×         tiny drag from RTE decay + steeper late-life SOH
base/4h MOIC    2.69×      →  3.21×              +0.52×         4h benefits from gentler SOH curve interpolation
base/2h IRR     18.86%     →  18.09%             −0.77pp        within prompt's predicted "2-5pp drop"
base/4h IRR     9.11%      →  10.90%             +1.79pp        slight uplift from availability bump (0.95→0.97)
                                                                outpacing SOH drag at 4h's gentler c/d
stress/2h MOIC  0.52×      →  0.36×              −0.16×         empirical SOH bites stress 2h late-life
stress/4h MOIC  0.48×      →  0.58×              +0.10×         4h gentler aging beats availability bump
stress IRR      null       →  null               n/a            calcIRR pathology — operationally distressed
cycles/yr base  548 / 365  →  678 / 439          +24% / +20%    throughput-derived now reflects active-trader merchant
```

The recalibration goals were largely met:
- IRRs now reflect the empirical SOH drag without collapsing
- Stress MOIC went from 0.04/0.14 (prior run) to 0.36/0.58 (this run) — 5–10× improvement
- Cycles per year reflect the active-trader merchant calibration v7.2 was already targeting
- Direction asserts: 1 of 2 passes (IRR direction ✓; MOIC direction ✗)

## Why the three remaining failures

### 1. `MOIC_4h > MOIC_2h` direction assert (structural)

The operator's NEW assertion was: "4h's slower aging produces more cumulative undiscounted equity over 20 years."

That's true in absolute terms — base/4h sums to ≈€47M of positive equity CFs vs base/2h's ≈€34M. But MOIC = sum / `equity_initial`, and 4h's `equity_initial` is 2× the 2h's (linear in capex which is linear in MWh, which is linear in duration). The ratio MOIC therefore *normalizes out* the 4h advantage in absolute equity:

- base/2h: 4.67× = €34.5M / €7.38M
- base/4h: 3.21× = €47.4M / €14.76M

This direction also held in v7.2-pre (production fixtures: 2h MOIC 4.86, 4h MOIC 2.69 — same direction, larger magnitude). The MOIC-vs-equity-base relationship is structural for asset classes where capex scales linearly with capacity. The recalibrated v7.3 actually *narrows* the gap (4.67 vs 3.21 = 1.46× ratio in v7.3 vs 4.86 vs 2.69 = 1.81× ratio in v7.2) because 4h gets more late-life energy from the gentler SOH interpolation — but it doesn't flip the ordering.

If the operator's intent was "absolute cumulative equity (4h > 2h)" rather than "MOIC ratio (4h > 2h)", that assertion is satisfied (€47M > €34M). The literal MOIC ratio assertion as written cannot be satisfied without a non-linear capex model.

### 2. base/2h IRR 18.09% vs upper bound 18%

A 0.09pp overshoot. Operationally indistinguishable from the upper bound. Could be tuned in/out of band by ±5bp adjustment to any one of half a dozen scenario constants — but tuning to fit a guardrail is the wrong instinct. The IRR is what the calibration produces.

If the operator's intent was "around 14-16%" per the prompt's "Anchor on prediction: ~14-16%", the actual 18.09% is 2-4pp higher. That's because the recalibrated DA throughput (1100 MWh/MW/yr for base/2h) plus availability bump (0.95→0.97) more than offsets the SOH steepening for 2h base. Worth the operator's awareness.

### 3. stress/4h cycles_per_year 349 vs lower bound 400

Mathematically forced by the operator's specified anchor: stress 4h `mwh_per_mw_yr_da_4h: 1240` produces `(22.4 + 96.9 + 37.5 + 1240) / 4 = 349.2 EFCs/yr`. To hit 400, the DA anchor would need to be ~1443+ MWh/MW/yr (16% higher), which would override the operator's prescribed value. Or the cycles guardrail's lower bound for stress 4h could be relaxed to 340.

## Files modified, uncommitted

```
M  workers/fetch-s1.js                              # ~250 lines: REVENUE_SCENARIOS (per-duration DA), throughput helpers, SOH 3-curves + sohYr, RTE decay, availability, assumptions_panel rebuild, engine_calibration_source, calcIRR robustness
M  scripts/audit-stack.mjs                          # +200 lines: runV73Probe + --probe-v73 flag with revised guardrails + cross-combo direction asserts
M  app/lib/throughputCycles.ts                      # per-duration DA anchors (TS mirror)
M  app/lib/__tests__/throughputCycles.test.ts       # updated EFC bands + 9 new asserts on DA per-duration values
?? app/lib/sohCurves.ts                             # TS mirror of SOH curves + sohYr + rteCurveFor
?? app/lib/__tests__/sohCurves.test.ts              # 27 tests
?? app/lib/__tests__/v73Metrics.test.ts             # 9 directional tests
?? docs/audits/phase-7-7d/                          # 6 v7.2-pre fixtures + 6 v7.3 (recalibrated) probe fixtures
```

(`logs/btd.log`, `.claude/skills/`, `.wrangler/tmp/`, `docs/_commit-msg-7-7d-prep.txt`, `docs/_prep-commit.sh`, `docs/_yolo-launch-instructions.md`, `docs/_yolo-followup-7-7d-recalibration.md`, `docs/phases/phase-7-7c-session-1-prompt.md`, `docs/visual-audit/phase-7/`, `public/hero/map-calibration-cities.json.json`, `workers/.wrangler/` — all pre-existing untracked, left as-is.)

## Recommended operator next steps

Two short branches, ordered from least to most invasive:

1. **Drop the `MOIC_4h > MOIC_2h` direction assert + relax the two close-margin bounds; commit the recalibrated v7.3.** The direction assert is structurally not satisfiable for a linear-capex storage asset; v7.2-pre had the same direction (4.86× > 2.69×). Tightening cycles to ≥340 (vs 400) would let stress/4h pass with the operator's specified DA anchor; widening IRR_2h to ≤18.5 (vs 18.0) would let base/2h pass at 18.09%. With those three small adjustments, all guardrails pass and v7.3 ships. The engine numbers are the engine numbers — the recalibration round-2 changes were exactly the operator's instruction.

2. **Tweak two scenario constants to thread the existing bands.** Drop base avail back to 0.96 (from 0.97 — 1pp closer to v7.2's 0.95 and likely brings IRR_2h from 18.09% to ~16-17%). Bump stress 4h DA anchor to ~1450 (from 1240 — buys the 51 EFCs to clear the 400 cycles bound). The MOIC direction issue still remains; same recommendation as (1).

The recalibration successfully resolved the prior halt's main symptoms (stress MOIC up from 0.04/0.14 to 0.36/0.58, cycles up from 249-478 to 349-678, IRRs all defined and in plausible ranges except calcIRR-distressed stress combos). The three remaining items are calibration-band disagreements + one structural mathematical relationship the assertion mispredicted, not engine defects.
