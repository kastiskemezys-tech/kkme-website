# Phase 7.6 — Numerical Reconciliation (Session 1)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-7-6-numbers` off main (branch off ONLY after F5-lite is merged into main)
**Why this comes before any redesign:** the deep numerical audit caught ~20% of numbers as math/labelling errors and ~35% as cross-card reconciliation failures. Industry experts catch each in 30 seconds. Doing the redesign on top of broken numbers wastes the redesign. Fix the data layer first; design on top of trusted numbers.

**Read first, before anything else:**
1. `docs/phases/upgrade-plan.md` — master roadmap. §1 (locked principles P1–P6, pending P7), §1b (cross-cutting numerical rules N-1 through N-10), §2 Phase 7.6 (the full 17-item scope, of which this prompt is Session 1).
2. `docs/handover.md` — current project state.
3. `CLAUDE.md` — repo conventions.

This is **Session 1 of 3** for Phase 7.6. Scope split:
- **Session 1 (this prompt):** 7.6.0 (Vitest setup) + 7.6.1–7.6.7 (low-blast-radius bug-class fixes).
- **Session 2 (you write the v2 prompt at handoff):** 7.6.8–7.6.13 (cross-card reconciliation + IRR sensitivity investigation — riskiest).
- **Session 3:** 7.6.14–7.6.16 + final verification + commit.

Note: 7.6.12 (Gross→Net bridge "SHOW THE WORK") was completed in F5-lite. Skip it.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — re-read §1b and §2 Phase 7.6
3. `cat docs/handover.md`
4. `git log --oneline -8` — confirm F5-lite merge commit is on main and you're branched off it
5. `git status` — clean working tree
6. `git checkout -b phase-7-6-numbers` (if not already on this branch)
7. `bash scripts/diagnose.sh` — confirm prod still green
8. `npm run dev &` then `curl -s localhost:3000 > /dev/null` to verify dev server starts cleanly. Kill after — Vitest will run its own.
9. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq 'keys'` and same for `/s2`, `/s8`, `/genload` — refresh the data shape in your head before patching the cards.

Read these files end-to-end before editing:
- `app/components/S1Card.tsx`, `app/components/S2Card.tsx` — F5-lite touched these; see what shape the freshness helper and bridge formula take now.
- All other cards in `app/components/` (S3–S8 if they exist; Trading; Returns; Build; Structural).
- `app/components/Hero*` and `app/components/KpiStrip*` if they exist — for ticker unit error 7.6.1.

Do NOT read `workers/fetch-s1.js` whole (7740 lines). Grep for the specific functions you need.

Report state, pause for "go" before editing.

---

## 1. 7.6.0 — Vitest harness setup (do this first; everything below ships with a spec)

```
npm i -D vitest @vitest/ui
```

Add `vitest.config.ts` at repo root:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:ui": "vitest --ui"`.

Create `app/lib/__tests__/smoke.test.ts` with a single passing assertion to prove the harness runs.

Run `npm test` — confirm green. Commit: `chore(7.6): vitest harness setup`.

**Why this first:** every fix below ships with a spec. The harness must work before any fix lands. This is also Phase 15.5's prerequisite — once we have it, we keep adding specs to it through the rest of the plan.

---

## 2. Bug-class fixes (Session 1 scope: 7.6.1 through 7.6.7)

Each fix is small. Each ships with at least one Vitest spec. Pause after each fix to verify and commit individually — small commits make later code review surgical.

### 7.6.1 — Ticker unit error (`€/MWh` → `€/MW/h` for capacity payments)

**Problem:** Ticker shows `AFRR €5.64/MWh` and `MFRR €11.6/MWh`. Capacity payments are `€/MW/h` (per MW offered, per hour), not `€/MWh` (per MWh of energy). This is the audit's #2 highest-leverage credibility leak.

**Fix:**
1. Grep the codebase for these literal strings: `€/MWh.*aFRR`, `€/MWh.*mFRR`, `€/MWh.*FCR`, `aFRR.*€/MWh`, etc.
2. Anywhere a reserve product (aFRR, mFRR, FCR) is quoted, the unit MUST be `€/MW/h`. Anywhere a DA energy price is quoted, the unit stays `€/MWh`.
3. Hero KPI strip, ticker, all card surfaces. The S1 card uses `€/MWh` correctly (it's energy). The S2 card uses `€/MW/h` correctly. The ticker is the offender.

**Spec:** unit test on the Ticker rendering function (or its data adapter): given an aFRR/mFRR/FCR clearing input, the rendered unit string must be `€/MW/h`. Given a DA capture input, the unit must be `€/MWh`.

Commit: `fix(7.6.1): ticker reserve units €/MWh → €/MW/h`.

---

### 7.6.2 — Peak Forecast `-33%` mislabel

**Problem:** Peak Forecast card displays `spread -33%` but the math doesn't tie to anything obvious. Peak €187, trough €16, spread €171. -33% of what?

**Fix:**
1. Grep for `-33%` and `33%` in the relevant card source.
2. Trace the computation. Likely candidates: delta vs 90D median spread, delta vs yesterday's spread, delta vs a different window.
3. If you find the source: relabel correctly (`vs 90D median: +24%` for example).
4. If you can't justify the number: replace with a clearly-defined delta. Audit notes today's spread is "above 90th percentile of last 90 days" — that's a defensible label.

**Spec:** unit test on the delta calculation: given a today-spread + reference distribution, returns the labelled percentage with the correct denominator semantics.

Commit: `fix(7.6.2): Peak Forecast spread delta — correct label and denominator`.

---

### 7.6.3 — Operational fleet inconsistency (822 vs 651 MW)

**Problem:** Hero says 822 MW operational; Build card says 651 MW (484 LT + 40 LV + 127 EE) + 255 MW under construction.

**Fix:**
1. Read the Hero KPI strip and Build card sources to find where each number originates.
2. Pick a canonical source (likely the worker's fleet endpoint, or a `data/fleet.json` or whatever feeds it).
3. Both surfaces read from the same source. Derived values (e.g., "+pipeline" / "operational only") get distinct names.
4. Document the canonical definition: e.g. "operational = connected to grid AND commissioning complete; 'under construction' is a separate category."

**Spec:** unit test on the fleet-aggregation function: given the per-country inputs, returns the canonical operational total and a structured per-country breakdown.

Commit: `fix(7.6.3): canonical fleet count — single source of truth for operational MW`.

---

### 7.6.4 — S/D ratio formula display

**Problem:** Build card displays `1.81× S/D` but the visible inputs (operational 822, pipeline 1083, demand 752) don't ratio to 1.81.

**Fix:**
1. Find the S/D computation. Likely in worker or in a `scripts/` file.
2. Surface the formula visibly on the card. Audit suggested: `S/D = (operational + construction × 0.8 + grid_agreement × 0.4) / system_flexibility_demand` or similar. Document the actual one used.
3. Tooltip or inline caption on the metric showing the formula and the inputs that produced it.

**Spec:** unit test on the S/D computation: given the structured fleet inputs, returns the documented ratio.

Commit: `fix(7.6.4): S/D ratio — surface formula and reconcile inputs`.

---

### 7.6.5 — Solar 61% renewable share sanity-check

**Problem:** Renewable Mix card claims `Solar 61%` of load. Baltic installed solar is ~1.5–2 GW; 61% of 2.6 GW load = 1.6 GW, which is at the absolute peak of installed capacity. Implausibly high as a regular reading.

**Fix:**
1. Trace the input. Worker likely fetches from ENTSO-E. Look at `workers/fetch-s1.js` (grep for `solar`).
2. Cross-check against a snapshot from ENTSO-E directly. If our worker reports 1.6 GW but ENTSO-E reports 0.8 GW for the same hour, there's a unit/aggregation bug.
3. Possible bug classes: confusing MW with MWh, summing all hours of the day instead of taking the peak hour, mistaking installed capacity for instantaneous generation.
4. If real-but-unusual: keep with footnote ("today's solar share above 30D P95 — exceptional sunny low-load hour"). If artifact: fix the aggregation.

**Spec:** unit test on the renewable-share computation: given an ENTSO-E-shaped input, returns plausible per-source shares that sum to total renewable share without exceeding 100% per source.

Commit: `fix(7.6.5): renewable mix — corrected/footnoted Solar share`.

---

### 7.6.6 — Dispatch chart y-axis unit

**Problem:** 24-bar dispatch chart appears to show ~€1,750/MW/h peak — implies €12k+/MW/day, far above the stated €292/MW/day headline.

**Fix:**
1. Find the dispatch chart component.
2. Audit the y-axis unit in the data: is it `€/MW/h` (correct), `€/MW` cumulative (wrong unit suffix), or `€/MWh` (wrong concept)?
3. Verify the SUM of the 24 bars equals the headline `€292/MW/day` (or whatever the canonical from 7.6.9 is — but 7.6.9 is Session 2 work, so for 7.6.6 just verify internal consistency of the chart against its own headline).
4. Label the y-axis explicitly. Add a horizontal line at `daily_total / 24` showing the average for context.

**Spec:** unit test that the sum of hourly dispatch revenue equals the daily headline within rounding tolerance.

Commit: `fix(7.6.6): dispatch chart — y-axis unit correctness, integration matches headline`.

---

### 7.6.7 — CAPEX-IRR sensitivity (most likely a real bug)

**Problem:** Returns sensitivity panel shows €120/kWh, €164/kWh, and €262/kWh CAPEX cases all yielding 8.6% IRR. The model isn't responding to its CAPEX input.

**Fix:**
1. Find the IRR computation. Likely in a `lib/financials/` file or worker-side.
2. Identify whether this is a display bug (right value, wrong row) or a computation bug (IRR not actually re-computing).
3. Expected sensitivity: ~1pp IRR per ~€20/kWh of CAPEX shift. €120 vs €262 is a €142/kWh delta → expect ~7pp IRR difference. So €120 should yield ~12.6%, €262 should yield ~5.6% (rough; real number depends on revenue assumptions).
4. Patch the bug. If display: fix the data binding. If computation: fix the formula.
5. Investigate WHY the bug existed — likely a memoised value being reused, or a `useMemo` dependency missing.

**Spec:** unit test the IRR computation across the three CAPEX cases. Assert that the three IRRs are distinct and in the expected ordering (lower CAPEX → higher IRR).

**Important:** this is the single most credibility-damaging error in the audit. The fix MUST land cleanly with a regression test. If you can't reproduce the bug or the math is opaque, pause and report — don't ship a guess.

Commit: `fix(7.6.7): IRR sensitivity panel — CAPEX input now drives output`.

---

## 3. Pause B — verification gate

After 7.6.0 + 7.6.1 through 7.6.7 commits land:

```
npm test           # all specs green
npx tsc --noEmit   # clean
npx next build     # release gate, clean
```

Visual sanity: `npm run dev` and load `localhost:3000`. Eyeball:
- Ticker shows `aFRR €X.XX/MW/h` (not `/MWh`).
- Peak Forecast spread label makes sense.
- Hero fleet matches Build card fleet.
- S/D ratio shows the formula on hover or inline.
- Solar % sanity-checked or footnoted.
- Dispatch chart y-axis labeled; bars sum to headline.
- Returns CAPEX sensitivity actually varies IRR across rows.

Push the branch. Report to Kastytis at Pause B with:
- Each fix's commit hash
- Each fix's spec name
- Any anomalies discovered during investigation
- Git status

**Stop after Pause B push.** Do not proceed to Session 2 in this CC session — handoff to a fresh session with a v2 prompt. See §5 below.

---

## 4. If budget gets tight (>80% context) before Pause B

Stop at the most recent clean commit. Write a continuation prompt at `docs/phases/phase7-6-prompt-v2.md` covering:
- Which 7.6.* items are done (with commit hashes)
- Which are still pending in Session 1 scope
- Re-state Session 2 (7.6.8–7.6.13) and Session 3 (7.6.14–7.6.16) for the next sessions

Commit the v2 prompt. Push. Hand back.

---

## 5. After Session 1 ships (handoff to Session 2)

Once Pause B is reported and Kastytis says "go," write `docs/phases/phase7-6-prompt-v2.md` for Session 2:
- Session 2 covers 7.6.8 (capture price reconciliation), 7.6.9 (dispatch price reconciliation), 7.6.10 (pipeline number reconciliation), 7.6.11 (IRR label consistency), 7.6.13 (S1 distribution skew investigation).
- Session 3 covers 7.6.14 (hour labelling), 7.6.15 (activation-rate methodology), 7.6.16 (timestamp normalisation site-wide).

Commit the v2 prompt to the same branch so the next CC session can read it.

---

## 6. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- No scope creep beyond 7.6.0 + 7.6.1–7.6.7 in this session. Items 7.6.8 onward are explicitly Session 2/3.
- **Worker changes are allowed** if a fix requires it (7.6.5 might; 7.6.6/7 might). Deploy via `wrangler deploy` and verify `/s1` `/s2` `/s8` `/genload` still return 200 with sensible payloads. If a worker change breaks production, revert immediately.
- No new dependencies beyond Vitest (already approved).
- Skip 7.6.12 — F5-lite already shipped it.
- Each fix is a separate commit. No mega-commits. Reviewers (Kastytis) need to see one logical change per commit.
- The pre-existing lint errors in `workers/fetch-s1.js` are out of scope. `npx next build` is the release gate; ignore `npm run lint` noise.
- If you're tempted to refactor adjacent code while fixing a bug: don't. Note it as a follow-up, fix the bug, ship.
- Numerical reconciliation REQUIRES a unit test per fix. The audit's closing point — "credibility compounds; first error discounts everything else by 30%" — means we don't ship reconciliation work that itself has math errors.

---

## 7. After all three sessions ship

The user opens `docs/phases/upgrade-plan.md`, ticks the 7.6.* checkboxes, adds a session-log entry, and kicks off **Phase 8 — Foundation Sprint** next. Phase 8 will need its own prompt; do not author Phase 8 here. Phase 8 prompt depends on principles P1–P4 (locked) and the design-system primitives section of the plan.
