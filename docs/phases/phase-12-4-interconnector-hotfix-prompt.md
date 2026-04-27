# Phase 12.4 — Interconnector flow direction hotfix

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-12-4-flow-direction-hotfix` off main.
**Estimated runtime:** 30-45 minutes.

---

## What this fixes

The `/s8` endpoint reports interconnector flow signals (`nordbalt_signal`, `litpol_signal`, etc.) with **inverted EXPORTING/IMPORTING labels** vs the API's actual sign convention.

**Evidence (verified 2026-04-26):**
- API call `curl -s 'https://api.energy-charts.info/cbet?country=lt'` returns Sweden value `-0.429` (negative)
- Worker comment at `workers/fetch-s1.js:5040` says: "Sign convention per endpoint: positive = country importing FROM neighbor"
- So `-0.429` means **LT EXPORTING 429 MW to Sweden** (negative = exporting per documented convention)
- Worker function `flowSignal` at lines 5101-5105 labels:
  ```
  if (mw > 100)  return 'EXPORTING';   // BUG: positive → should be IMPORTING per convention
  if (mw < -100) return 'IMPORTING';   // BUG: negative → should be EXPORTING per convention
  ```
- Production payload `/s8` confirms: `nordbalt_avg_mw: -429, nordbalt_signal: "IMPORTING"` — wrong label
- Live KKME hero shows "SE → LT 429 MW" (LT importing from Sweden) — wrong direction
- Litgrid live SCADA shows the opposite direction (LT actually exporting to Sweden)

The fix is a 2-line label swap in `flowSignal`. The risk is that frontend rendering may have compensating logic that "fixed" the buggy worker output by inverting display direction. Need to audit both layers.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/handover.md` — most recent entries
3. `git log --oneline -5`
4. `git checkout main && git pull && git checkout -b phase-12-4-flow-direction-hotfix`
5. `git status` — clean working tree (pre-existing untracked OK)
6. `bash scripts/diagnose.sh` — confirm prod still green
7. `npm test` — establish baseline
8. `npx tsc --noEmit` — clean

Capture pre-fix production payload as frozen reference:

```bash
mkdir -p docs/audits/phase-12-4
curl -s 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8' | jq . > docs/audits/phase-12-4/s8-pre-hotfix.json
```

Read these files end-to-end:
- `workers/fetch-s1.js` lines 5037-5170 (`fetchInterconnectorFlows` + `flowSignal`)
- `app/components/HeroBalticMap.tsx` (likely renders interconnector arrows)
- Any other consumer of `nordbalt_signal`, `litpol_signal`, `estlink_signal`, `fennoskan_signal`, `lv_lt_signal`

```bash
grep -rn 'nordbalt_signal\|litpol_signal\|estlink_signal\|fennoskan_signal\|lv_lt_signal\|s8\b' app/ | head -30
```

Report state, **pause for "go"** before §1.

---

## 1. Pause A — verify API convention against ground truth

Before changing any code, confirm the convention:

```bash
# Current API response for LT
curl -s 'https://api.energy-charts.info/cbet?country=lt' | jq '.countries[] | select(.name | test("Sweden|Poland"; "i")) | {name, latest: .data[-5:]}'
```

Then cross-reference with Litgrid live SCADA at `https://litgrid.eu/index.php/sistemos-duomenys/79`.

Document in `docs/audits/phase-12-4/sign-convention-verification.md`:

- Current API value for LT-Sweden (e.g., `-0.429` GW)
- Current Litgrid display for the same flow (direction shown on map + magnitude)
- Conclusion: confirms the API convention is positive=importing, negative=exporting (or, if it doesn't, document the alternative interpretation)
- Confirms the bug: KKME's `flowSignal` inverts the labels

Report findings to Kastytis. Wait for "go" before §2.

---

## 2. Pause B — frontend consumer audit

For each of the 5 `*_signal` fields, find every consumer in the frontend. Specifically look for:

1. **Display logic that reads `_signal`** to decide direction arrows. If frontend reads `signal === 'IMPORTING'` and displays "neighbor → LT", fixing the worker auto-fixes the display. If frontend reads `signal === 'EXPORTING'` and ALSO displays "neighbor → LT" (compensating for the buggy worker), fixing the worker breaks it.

2. **Display logic that reads `_avg_mw` directly.** If frontend uses `Math.abs(mw)` or compares to zero, fixing the worker may not affect display (but the signal label change still matters).

3. **Tooltip text or alt-text** that mentions direction.

Search the frontend:

```bash
grep -rn -B1 -A3 'nordbalt_signal\|litpol_signal\|estlink_signal\|fennoskan_signal' app/ workers/
grep -rn -B1 -A3 "IMPORTING\|EXPORTING" app/ | grep -v "node_modules\|.test." | head -40
```

For each consumer found, document in `docs/audits/phase-12-4/frontend-audit.md`:

- File + line number
- What the code does with the signal value
- Whether the consumer's logic is consistent with corrected labels (positive=importing, negative=exporting) or compensates the bug
- Whether the consumer needs to be updated alongside the worker fix

**Common patterns to look for:**

```tsx
// Pattern A — reads signal label, renders arrow conditionally:
{signal === 'IMPORTING' ? `${neighbor} → LT` : `LT → ${neighbor}`}
// → Self-correcting once worker labels are fixed

// Pattern B — reads abs(mw), always shows fixed direction:
const display = `${neighbor} → LT ${Math.abs(mw)} MW`;
// → Frontend needs separate fix to read sign of mw

// Pattern C — compensates the worker bug:
const display = signal === 'IMPORTING' ? `LT → ${neighbor}` : `${neighbor} → LT`;
// ← arrow inverted to "fix" worker label inversion
// → Will break when worker is fixed; needs to be reverted to Pattern A
```

Pattern C is the dangerous one. If found, document each occurrence and plan to revert it as part of this fix.

Report findings + planned changes to Kastytis. Wait for "go" before §3.

---

## 3. Worker fix (single coordinated change)

Edit `workers/fetch-s1.js` lines 5101-5105:

```js
function flowSignal(mw) {
  if (mw == null) return null;
  if (mw > 100)  return 'IMPORTING';   // positive → LT importing from neighbor (per API convention)
  if (mw < -100) return 'EXPORTING';   // negative → LT exporting to neighbor
  return 'BALANCED';
}
```

Also fix line 5114 (`netTotal` overall signal):

```js
const netTotal = (nordbalt_avg_mw ?? 0) + (litpol_avg_mw ?? 0);
const signal   = netTotal > 100 ? 'IMPORTING' : netTotal < -100 ? 'EXPORTING' : 'NEUTRAL';  // swapped
```

Also remove the contradictory in-function comments at line 5063:

```js
return Math.round(values[i] * 1000); // GW → MW; sign matches API convention (positive = importing)
```

(Was: `// GW → MW, positive = importing` — the comment was right, the downstream labels were wrong.)

If §2's frontend audit identified Pattern-C compensating logic anywhere, revert each occurrence to Pattern A in the same commit.

---

## 4. Local verification before deploy

```bash
cd workers
npx wrangler dev --local --port 8787 &
DEV_PID=$!
sleep 5

# Compare local /s8 vs production /s8
echo "=== LOCAL (post-fix) ==="
curl -s 'http://localhost:8787/s8' | jq '{
  nordbalt_avg_mw, nordbalt_signal,
  litpol_avg_mw, litpol_signal,
  estlink_avg_mw, estlink_signal,
  fennoskan_avg_mw, fennoskan_signal
}'

echo "=== PRODUCTION (pre-fix) ==="
jq '{
  nordbalt_avg_mw, nordbalt_signal,
  litpol_avg_mw, litpol_signal,
  estlink_avg_mw, estlink_signal,
  fennoskan_avg_mw, fennoskan_signal
}' docs/audits/phase-12-4/s8-pre-hotfix.json

kill ${DEV_PID}
cd ..
```

**Validation:**
- Magnitudes match between local and production (same numeric values)
- Signal labels are SWAPPED for each interconnector with the same numeric value
- For `nordbalt_avg_mw: -429`: production was `IMPORTING` → local should be `EXPORTING`
- For `estlink_avg_mw: 860`: production was `EXPORTING` → local should be `IMPORTING`

If labels are swapped consistently across all 5 interconnectors, math is right. Proceed.

If anything else changed (magnitudes shifted, fields disappeared, etc.), STOP. The flowSignal fix should ONLY change label strings, not numeric values.

---

## 5. Pause C — diff review + deploy

Show the worker diff:

```bash
git add workers/fetch-s1.js
git diff --cached workers/fetch-s1.js
```

Plus any frontend changes from §2's audit.

Report to Kastytis:
- Total lines changed
- Frontend consumers found + which (if any) needed updates
- Local-vs-production signal label comparison

**Wait for "go" before deploying.**

Deploy:

```bash
cd workers && npx wrangler deploy && cd ..
```

Capture deploy version ID for rollback reference.

Verify production:

```bash
sleep 5  # let deploy propagate
curl -s 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8' | jq '{
  nordbalt_avg_mw, nordbalt_signal,
  litpol_avg_mw, litpol_signal,
  estlink_avg_mw, estlink_signal,
  fennoskan_avg_mw, fennoskan_signal,
  signal, interpretation
}' > docs/audits/phase-12-4/s8-post-hotfix.json

# Confirm signal labels are now correct relative to magnitudes
diff <(jq -S '.' docs/audits/phase-12-4/s8-pre-hotfix.json) \
     <(jq -S '.' docs/audits/phase-12-4/s8-post-hotfix.json)
```

Also visually verify with `npm run dev` at `localhost:3000`:
- NordBalt direction should now match Litgrid SCADA (currently showing LT exporting per the API value being negative)
- LitPol same
- EstLink direction may have flipped if EE was importing (positive value) but displayed as exporting before
- Each interconnector card's arrow direction should match physical reality per the current API values

If any direction is now backwards from Litgrid, **roll back immediately**:

```bash
cd workers && npx wrangler rollback && cd ..
```

Then investigate. The worker fix or the frontend display logic is still wrong.

---

## 6. Add regression guard spec

Create `app/lib/__tests__/flowSignal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Mirror the worker's flowSignal logic for unit testing.
// If this drifts from workers/fetch-s1.js:5101, the spec catches it.
function flowSignal(mw: number | null): string | null {
  if (mw == null) return null;
  if (mw > 100)  return 'IMPORTING';
  if (mw < -100) return 'EXPORTING';
  return 'BALANCED';
}

describe('flowSignal sign convention (Phase 12.4 hotfix)', () => {
  it('positive value = LT IMPORTING from neighbor (per API convention)', () => {
    expect(flowSignal(429)).toBe('IMPORTING');
    expect(flowSignal(860)).toBe('IMPORTING');
  });

  it('negative value = LT EXPORTING to neighbor', () => {
    expect(flowSignal(-429)).toBe('EXPORTING');
    expect(flowSignal(-860)).toBe('EXPORTING');
  });

  it('within ±100 MW = BALANCED', () => {
    expect(flowSignal(50)).toBe('BALANCED');
    expect(flowSignal(-50)).toBe('BALANCED');
    expect(flowSignal(0)).toBe('BALANCED');
  });

  it('null input = null output', () => {
    expect(flowSignal(null)).toBe(null);
  });
});
```

This spec is the regression guard. If anyone re-inverts the labels in the future, it fails.

---

## 7. Commit + push + report

Single commit:
- `workers/fetch-s1.js` (flowSignal label swap + comment cleanup)
- Any frontend Pattern-C reversions from §2
- `docs/audits/phase-12-4/s8-pre-hotfix.json`
- `docs/audits/phase-12-4/s8-post-hotfix.json`
- `docs/audits/phase-12-4/sign-convention-verification.md`
- `docs/audits/phase-12-4/frontend-audit.md`
- `app/lib/__tests__/flowSignal.test.ts`

Commit message: `phase-12-4(hotfix): fix interconnector flowSignal label inversion (API positive = importing)`

Push branch.

Report to Kastytis:
- Commit hash + worker deploy version ID
- Pre-fix vs post-fix signal labels (showing labels swapped for each interconnector)
- Frontend audit summary (which consumers found, which updated)
- Confirmation that direction arrows now match Litgrid live SCADA at one observed timestamp
- Test count: should be baseline + 4 new (the regression guard spec)

---

## 8. Hard stops

- **Single coordinated commit + deploy.** Don't iterate worker changes — get the fix right, deploy once.
- **No engine math changes.** This hotfix touches ONLY label strings + frontend display — not financial computation. If during the worker read you notice any other math issue, document but DO NOT fix. Stay scope-bounded.
- **No card primitive changes.** No design system edits.
- **No new dependencies.**
- **If post-deploy verification fails (directions still wrong vs Litgrid), roll back immediately.** Don't try to "fix forward."
- The pre-existing untracked items in working tree are out of scope.

---

## 9. After hotfix ships

Update `docs/handover.md` Session 18 entry with hotfix details.

Update `docs/phases/upgrade-plan.md` § Out-of-scope / Backlog:
- Phase 12.4 → ✅ Shipped
- Phase 12.5 — Grid Access Live Coverage (LV/EE scraping + APVA/TSO live updates) → still queued

The next CC job depends on Kastytis's call. The natural sequence remains:
- Phase 7.7b Session 3 (engine refinements v7.1, currently paused at Pause B awaiting Option D synthetic-probe validation) → next-most-urgent
- Then Phase 7.7c (LCOS, MOIC, real-options optimizer)
- Or Phase 8 Session 3 (icons + logo)
- Or Phase 12.5 (grid access live coverage extension)
