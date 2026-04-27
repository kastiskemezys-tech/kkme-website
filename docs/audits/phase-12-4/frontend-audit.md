# Phase 12.4 — Frontend consumer audit

**Date:** 2026-04-27
**Scope:** every consumer of `nordbalt_signal`, `litpol_signal`,
`estlink_signal`, `fennoskan_signal`, `lv_lt_signal`, and the underlying
`*_avg_mw` fields.

## Live consumers (rendered on production homepage)

### `app/components/HeroBalticMap.tsx` — homepage hero

- Fetches `/s8` (`HeroBalticMap.tsx:123`).
- Renders 6 interconnector rows in the LEFT column (`HeroBalticMap.tsx:339-358`).
- Display logic uses `r.fromCountry` / `r.toCountry` / `r.mw` from
  `ResolvedFlow`, NOT the `*_signal` strings directly.
- Particle direction also driven by `r.particleDirection`.
- All resolution happens in `resolveFlow()` — see below.

**Pattern: B (reads `*_avg_mw` directly via library).** Self-correcting only
if `resolveFlow` reads the sign correctly.

### `lib/baltic-places.ts` — flow resolution library — **Pattern C, broken**

- `resolveFlow()` at lines 251-294 takes raw `*_avg_mw`, multiplies by an
  optional `capacityShare`, then uses each interconnector's
  `positiveFlowReceives` to decide which country is `from` vs `to`.
- The mapping at lines 178-237 says:
  - nordbalt: `positiveFlowReceives: 'SE'`
  - litpol:   `positiveFlowReceives: 'PL'`
  - estlink-1/2: `positiveFlowReceives: 'FI'`
  - fennoskan-1/2: `positiveFlowReceives: 'FI'`
- The comment block at lines 159-163 documents the assumption:
  > Worker /s8 was fixed in Phase 2A-3 so positive *_avg_mw means the Baltic
  > endpoint is exporting (sending power out). Example: nordbalt +694 → LT
  > exporting → SE receiving → positiveFlowReceives: 'SE'.

**This is incorrect.** Phase 2A-3 (commit `9317c94`, Apr 12) did the
opposite: it REMOVED a `Math.round(-avg * 1000)` negation, restoring
positive = importing per API. The follow-up Phase 2B-1 commit `c1cefc5`
(Apr 15, "phase2b-1: project hover tooltips, tagline fix, light particles,
arrow direction") then incorrectly flipped `positiveFlowReceives` from the
original values (`LT, LT, EE, EE` for the 4 Baltic interconnectors) to the
current inverted values, under a misreading of 2A-3.

**Effect on HeroBalticMap with current API value `nordbalt_avg_mw = -429`:**

- `rawMw = -429` → `rawMw >= 0` is false
- `fromCountry = positiveFlowReceives = 'SE'`
- `toCountry = otherCountry = 'LT'`
- Display: **"SE → LT 429 MW"** (LT importing) — wrong. Reality: LT
  exporting to SE. Should display **"LT → SE 429 MW"**.

The `positiveFlowReceives` for `fennoskan-1/2` is **correct as-is** ('FI'):
the FI CBET Sweden series follows the API convention (positive = FI
importing from SE → FI receives). Same for any future LT-only interconnector
the writer didn't pre-flip. The four Baltic-side flips are the broken ones.

### `app/components/SpreadCaptureCard.tsx` — homepage tier 3

- Read; does NOT consume any `*_signal` or `*_avg_mw` field. Out of scope.

### `app/components/HeroBalticMap.tsx`'s ticker

- Does NOT include any interconnector signal/value. Out of scope.

## Retired / dev consumers (not rendered on homepage)

### `app/components/S8Card.tsx` — **retired 2026-04-16** (file header line 1)

- Reads `nordbalt_signal` / `litpol_signal` directly to drive
  `regimeLabel` (`EXPORTING → "Net exporter"`), `regimeSentiment`, and
  `flowInterpretation`.
- This is **Pattern A** — reads signal labels as truth. Auto-corrects when
  worker labels are fixed.
- Method copy at line 154 reads `Positive = LT exporting.` — wrong now,
  but consistent with the (broken) `positiveFlowReceives` worldview. After
  hotfix the convention statement should read "Positive = LT importing."
  Updating for documentation accuracy even though the card is retired.

### `app/components/BalticMap.tsx` — only consumed by S8Card

- Receives `nordbalt_dir` / `litpol_dir` props (the signal labels).
- Logic at lines 126-127:
  ```ts
  const nbLTExports = nordbalt_dir === 'LT_exports' || nordbalt_dir === 'EXPORTING';
  const lpLTExports = litpol_dir  === 'LT_exports' || litpol_dir  === 'EXPORTING';
  ```
- **Pattern A.** When worker is fixed (negative MW → 'EXPORTING' label),
  `nbLTExports` correctly becomes true, particle/arrow direction matches
  reality. No change needed.

### `app/dev/hero-preview/page.tsx`

- Renders `HeroBalticMap` for dev preview only. Inherits the same fix.

## Summary

| Consumer                          | Pattern | Fix needed? |
|-----------------------------------|---------|-------------|
| `lib/baltic-places.ts` resolver   | C (broken) | **Yes — flip 4 `positiveFlowReceives` + rewrite convention comment** |
| `app/components/S8Card.tsx`       | A (retired) + bad copy | Yes — fix line-154 methodology copy for consistency |
| `app/components/BalticMap.tsx`    | A | No — auto-corrects |
| `app/components/HeroBalticMap.tsx`| (delegates to baltic-places) | No — auto-corrects via library |
| `workers/lib/defaults.js`         | comment only | No |

## Coordinated change set for §3

1. `workers/fetch-s1.js`:
   - flip `flowSignal` labels at lines 5011-5012
   - flip `netTotal` signal at line 5022
   - delete the stale "We negate" comment at line 4948
2. `lib/baltic-places.ts`:
   - `positiveFlowReceives`: nordbalt `'SE' → 'LT'`, litpol `'PL' → 'LT'`,
     estlink-1 `'FI' → 'EE'`, estlink-2 `'FI' → 'EE'`
   - rewrite the convention comment block at lines 159-163
3. `app/components/S8Card.tsx`:
   - line 154 methodology copy: `Positive = LT exporting.` →
     `Positive = LT importing.`
