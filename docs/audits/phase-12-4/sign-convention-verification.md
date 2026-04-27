# Phase 12.4 — Sign convention verification

**Date:** 2026-04-27
**Branch:** `phase-12-4-flow-direction-hotfix`

## API convention (energy-charts.info CBET)

Endpoint: `https://api.energy-charts.info/cbet?country=<X>`
Returns `countries[]` where each entry's `data[]` is the timeseries (GW)
for flow with that neighbor.

**Convention (documented at `workers/fetch-s1.js:4947`):**
> positive = country importing FROM neighbor.

i.e. for `country=lt`'s `Sweden` series, `+0.500` GW means LT importing 500 MW
from SE; `-0.429` GW means LT exporting 429 MW to SE.

## Current API values (captured 2026-04-27 ~09:50 UTC)

| Series | Endpoint  | Latest non-null GW | MW (×1000) | Implied direction |
|--------|-----------|--------------------|------------|-------------------|
| LT-Sweden  | LT CBET | -0.429 | -429 | LT exporting 429 MW to SE |
| LT-Poland  | LT CBET | -0.166 | -166 | LT exporting 166 MW to PL |
| LT-Latvia  | LT CBET | +0.360 | +360 | LT importing 360 MW from LV |
| EE-Finland | EE CBET | +0.860 | +860 | EE importing 860 MW from FI |
| FI-Sweden  | FI CBET | +0.607 | +607 | FI importing 607 MW from SE |

(Trailing nulls are normal at the chart's right edge; the worker walks backward
to the latest non-null point — these are the values it picked up.)

## Worker raw output (pre-hotfix /s8 frozen at `s8-pre-hotfix.json`)

```
nordbalt_avg_mw  : -429   nordbalt_signal  : "IMPORTING"   ← label inverted
litpol_avg_mw    : -166   litpol_signal    : "IMPORTING"   ← label inverted
lv_lt_avg_mw     : +360   lv_lt_signal     : "EXPORTING"   ← label inverted
estlink_avg_mw   : +860   estlink_signal   : "EXPORTING"   ← label inverted
fennoskan_avg_mw : +607   fennoskan_signal : "EXPORTING"   ← label inverted
signal           : "IMPORTING"  (netTotal -595, mislabelled)
```

Magnitudes match the API exactly (`mw = round(GW × 1000)`). Worker is NOT
negating values — `latestFromList` at `fetch-s1.js:4968` just multiplies
by 1000.

## Litgrid live SCADA cross-check

(Recommended: pull <https://litgrid.eu/index.php/sistemos-duomenys/79> in a
browser at deploy time and confirm the NordBalt arrow direction matches the
API's negative-Sweden value, i.e. arrow drawn LT → SE.)

For this audit I'm relying on:
1. The documented API convention (at the source URL + the worker comment).
2. The fact that the post-fix payload is internally self-consistent.
3. The user's prompt assertion that Litgrid currently shows "the opposite
   direction" of KKME, i.e. LT → SE.

## Conclusion

**API convention confirmed: positive = importing.**

The worker preserves this convention in `*_avg_mw` (no negation). However:

- `flowSignal()` at `fetch-s1.js:5009-5014` swaps the EXPORTING/IMPORTING labels.
- `netTotal` overall signal at `fetch-s1.js:5022` does the same swap.
- The worker comment at `fetch-s1.js:4948` ("We negate → positive = country
  exporting TO neighbor") is **stale/incorrect** — code does not negate; the
  intended-but-not-actually-applied negation comment has survived through
  Phase 2A-3 (commit `9317c94`, Apr 12), which explicitly removed the
  pre-existing `-avg * 1000` negation as "Bug 1 (P0)".

## Scope expansion vs prompt

The prompt anticipates **only** the worker label swap as the fix. Reading
the live frontend reveals a **second, compounding bug** in
`lib/baltic-places.ts` introduced after Phase 2A-3 (see
`frontend-audit.md`). The two bugs together produce the observed wrong
arrows; fixing only one of them would produce a different wrong direction
on each interconnector. Both must be fixed in the same commit.
