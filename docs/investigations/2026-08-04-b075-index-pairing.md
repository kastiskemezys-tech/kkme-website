# B-075 — LT paired against SE4 by array index, quantified

**Status: MEASURED, NOT FIXED. Group B — it moves published numbers.**
No code changed. This is the quantification the operator asked for before any fix
is proposed.

## The mechanism

`computeHistorical` (`workers/fetch-s1.js`) builds three published fields from

```js
const spread = lt30[i] - se430[i];
```

where `lt30` and `se430` are flat `extractPrices` scrapes of a **30-day**
multi-day A44 range. Under curveType A03 each bidding zone omits repeated
positions **independently**. One zone dropping a position shifts its entire
remaining series one slot against the other — and the shift compounds across
thirty days.

This is not the same defect as Phase 49 item 1. That one was about a single day's
values landing at the wrong time within one series. This is about **two series
being laid against each other with no common clock at all.**

## The measurement

Live ENTSO-E documents, 30-day window, fetched 2026-08-04T10:07Z. Same window,
same statistics, paired two ways.

```
flat scrape lengths      LT 2916   SE4 2932   ** UNEQUAL **
timestamped slot counts  LT 2976   SE4 2976
A03 positions forward-filled   LT 60   SE4 44   -> relative shift 16 slots
```

The arrays **do not even have the same length**. The shipped code silently
truncates to `Math.min(lt30.length, se430.length)` and pairs what remains, so the
last 16 SE4 slots are discarded and every pair after the first divergent omission
is comparing two different instants.

| field | index-paired (shipped) | timestamp-paired | delta |
|---|---|---|---|
| `n` | 2916 | 2976 | +2.06 % |
| `rsi_30d` | **−0.68** | **−1.08** | **−58.8 %** |
| `pct_hours_above_20` | **21.8** | **6.9** | **−68.4 %** |

**The shipped values reproduce production exactly** — live `/s1` at the same
moment returned `rsi_30d = -0.68` and `pct_hours_above_20 = 21.8`. So this is not
a probe artefact; it is what the site is serving.

## What it means

`pct_hours_above_20` is published as the share of hours where Lithuania clears
more than 20 % above SE4. Index-paired it reads **21.8 %**; paired on the clock it
reads **6.9 %**. The site has been overstating Baltic price separation by roughly
**3.2×**.

`rsi_30d` is a mean spread in €/MWh. Its magnitude nearly doubles when the pairing
is corrected, and it is more negative — LT is cheaper relative to SE4 than the
published figure says.

`trend_vs_90d` (live 0.92) is built from the same pairing over a second window and
is affected by the same mechanism; it is **not quantified here** because the
90-day reference window needs its own fetch and the session ended first. Do not
assume it moves in the same direction or by a similar amount.

## The fix, not applied

Pair on timestamps. `parseA44Periods` already makes this possible — it returns
each Period with its declared start and resolution, so every slot has a
wall-clock instant, and the pairing becomes an intersection on that instant
rather than a positional assumption. The probe above does exactly this in
fourteen lines.

Two things to decide before it ships, which is why it is not shipped:

1. **The intersection is a choice.** 2976 slots exist in both zones for this
   window, but a slot present in one and absent in the other has to be dropped,
   held, or interpolated. Dropping is the honest default and is what the probe
   does; it should be stated, not assumed.
2. **These are published numbers on a live surface.** A −68 % move in
   `pct_hours_above_20` is a large, visible correction and needs the same
   treatment Phase 49 item 1 got: a signed delta, and a drawer line saying the
   number moved because the pairing was fixed, not because the market changed.

## Probe

`scratchpad/b075-probe.mjs` — not committed, because it holds a live API key path
and is a one-shot. Reproduce with: fetch both zones over `utcPeriod(-30)` →
`utcPeriod(1)`, run `extractPrices` for the index pairing and `parseA44Periods` →
`[startMs + i*resolution, price]` for the timestamp pairing, then run both through
the same statistic.
