# B-076 §1 — the basis, settled; and the direction, reversed

**Status: BASIS ESTABLISHED · DIRECTION MEASURED AND IT REVERSES THE PHASE PREMISE · NOTHING SHIPPED.**

Phase 53 §1 gates everything else. It is settled below, and settling it falsified
the premise §2 and §3 were to be built on. No VPS leg was built, no delta was
published, `/revenue` is untouched, nothing was deployed.

---

## 1 · The basis, from primary data

Every claim here is read off BTD's own response, not the code comment.

| property | value | source |
|---|---|---|
| dataset | `price_procured_reserves` | request id |
| title | "Price of procured reserves" | `data.title` |
| unit | **EUR/MW/h** | `data.measurement_unit` |
| resolution | **PT15M** (ISP) | `data.resolution` |
| LT block | columns 10–14 | `header_groups[0]` |
| within block | FCR 10, aFRR 11–12, mFRR 13–14 | `header_groups[1]` |
| column 11 | **aFRR Upward** | `header_groups[2]` |

So `COUNTRY_COLS.Lithuania.afrr_up = 11` is **correct**, verified against the
payload's own headers rather than the comment above it.

**The basis is: Lithuanian aFRR-Upward procured reserve CAPACITY price, EUR/MW/h,
at 15-minute ISP resolution, non-zero values only, aggregated to a monthly p50 via
`sorted[floor(n·0.5)]`.**

**Naming defect.** It is a *capacity* price, not an activation price. The key is
`s2_activation`, the field is `afrr_recent_3m`, and `stats()` emits
`activation_rate` (really "share of ISPs with a non-zero price"). `deriveCompression`'s
docstring calls it "observed activation price trajectory". Nothing computes these
labels from the data; they assert a provenance the data does not have (rule #2).
This is a second finding and it is cosmetic — no arithmetic depends on the name.

### There is no ~3× basis discrepancy

The prior investigation reported its medians (3.46–6.92) as sitting on a "~3×
different basis" from the payload's series (13.5–66.9) and declined to give a
magnitude. **Re-measured over identical bytes, that discrepancy does not exist.**

Both aggregations, run over the same captured months:

| month | col 11 only (payload's basis) | cols 11+12 pooled (prior investigation) | ratio |
|---|---|---|---|
| 2026-03 | 6.12 | 6.90 | 1.13 |
| 2026-04 | 2.83 | 3.46 | 1.22 |
| 2026-05 | 4.53 | 4.43 | 0.98 |
| 2026-06 | 9.99 | 5.00 | 0.50 |
| 2026-07 | 5.00 | 5.00 | 1.00 |

The ratio is not ~3 and not even consistently >1. The prior figures reproduce the
**pooled up+down** aggregation exactly (3.46, and 6.90 vs its reported 6.92).

What was actually being compared was not two bases but **two different statistics
over two different windows**: monthly medians for 2026-03/04/06/07, against
`initial_p50` (66.9 — the p50 of **2025-09**, a month with n=24 non-zero ISPs out
of ~2880) and `recent_avg_p50` (13.5 — the mean of the frozen series' last three
monthly p50s). Nothing about those numbers is on a different basis; they are
different months and different reductions.

Confirmation that the aggregation is exactly reproducible: the frozen payload's
2026-03 entry is `p50 6.12, count 1735`, and re-running the payload's own
aggregation over the full calendar month of March 2026 gives **6.12 / 1735** —
identical.

### Two window defects found while settling this

1. **The last day of every month is dropped.** `mEnd` is the month's last day and
   BTD's `end_date` is exclusive, so the March chunk requests
   `2026-03-01 → 2026-03-31` and returns 2880 ISPs ending `03-30T23:45`. Verified
   by direct probe. Full March is 2976. Every month in a fresh payload is short
   by one day.
2. **The frozen payload cannot have come from `computeS2Activation`.** It spans
   8 months (2025-09 → 2026-04) on full-calendar-month boundaries. The function
   fetches 6 chunks and BTD honours ranges strictly (probed: a
   `2025-11-01 → 2025-11-30` request returns only November; a two-year request
   returns exactly two years, so the series does not begin in 2025-09). **A7
   correction:** the prior investigation states "One writer, and one only — the
   09:30 watchdog." There are **three** write paths, and the third is
   `POST /s2/activation`, which validates only that `body.countries` exists and
   writes the body **verbatim**. The published compression trajectory has been
   resting on an externally-supplied payload of unverified provenance.

---

## 2 · The direction, measured — and it reverses

One process, one KV snapshot (`tools/consultancy/fixtures/regression-kv.json`,
whose `s2_activation_parsed` is byte-identical to the frozen production payload),
**activation payload as the only variable**. The fresh side is produced by the
**real `computeS2Activation`** with `fetch` stubbed to serve BTD bytes captured
from the VPS on 2026-08-06, so the aggregation under test is the shipped one.

Config: 2h / mid / 2028 / base.

| metric | frozen | fresh | delta |
|---|---|---|---|
| gross_revenue_y1 | 6,343,597 | 6,119,696 | **−223,901 (−3.53 %)** |
| net_revenue_y1 | 5,683,299 | 5,477,311 | −205,988 (−3.62 %) |
| project_irr | 4.53 % | 3.87 % | **−66 bp** |
| equity_irr | 4.27 % | 3.19 % | −108 bp |
| min_dscr | 0.96 | 0.89 | −0.07 |
| lcos_eur_mwh | 252.2 | 252.2 | **0.00** |
| npv_at_wacc | −6,759,706 | −7,954,135 | **−1,194,429** |
| effective_compression_rate | 0.15 | 0.15 | **0.00** |

**The phase premise is falsified.** It states: *"published projections are
UNDERSTATED — revenue, IRR and NPV low, LCOS high… the first correction in weeks
that runs in our favour."* Fresh data moves revenue, both IRRs, DSCR and NPV
**down**, and leaves LCOS unchanged.

### Decomposition — three routes, not two

The payload reaches the engine by three independent paths. Each swapped alone,
against the same frozen baseline:

| route | gross_revenue_y1 | project_irr | npv_at_wacc |
|---|---|---|---|
| compression trajectory only | **0** | **0** | **0** |
| clearing prices only (`lt/lv/ee.afrr_p50`) | −35,020 | **+0.0014** | **+240,872** |
| monthly maps only (`lt_monthly_afrr` etc.) | −148,982 | −0.0063 | −1,124,837 |
| **all three (= fresh)** | −223,901 | −0.0066 | −1,194,429 |
| sum of the three | −184,002 | −0.0049 | −883,965 |
| interaction residual | −39,899 | −0.0017 | −310,464 |

**The compression route contributes exactly zero.** `deriveCompression` computes a
forward rate from the last three monthly p50s and then clamps:
`Math.max(0.01, Math.min(0.15, forward_rate))`. Frozen gives ≈0.99 and fresh gives
≈0.99; both clamp to the **ceiling**, 0.15. The clamp is not a guard here, it is
the operating point — the published `compression_rate_observed 0.15` is the
ceiling value, not a measurement. (The function is not stuck: a 5-month variant
returned 0.03, so it can leave the ceiling. It just does not, for either of these
two series.)

**This retires the stated mechanism of B-076.** The register says the freeze
reaches revenue because `deriveCompression → effective_compression_rate`
multiplies every projection year. Measured, that path moved **nothing**, and it
would have moved nothing at any point in the 105 days.

**The real path is the per-month join.** `computeBaseYear` walks the last-12-months
window and reads `lt_monthly_afrr[month]?.p50 ?? lt.afrr_p50`:

| month | frozen p50 | fresh p50 |
|---|---|---|
| 2025-09 | 66.90 | — |
| 2025-10 | 38.71 | — |
| 2025-11 | 0.32 | — |
| 2025-12 | 12.00 | — |
| 2026-01 | 16.68 | — |
| 2026-02 | 33.33 | — |
| 2026-03 | 6.12 | 6.30 |
| 2026-04 | 1.18 | 2.74 |
| 2026-05 | — | 4.53 |
| 2026-06 | — | 9.99 |
| 2026-07 | — | 5.00 |
| 2026-08 | — | 5.00 |
| *fallback* | 13.50 | 6.70 |

The two windows overlap on two months and agree there (6.12 ≈ 6.30; the April gap
is the frozen payload's partial month — it was stored **2026-04-20**, so its last
entry covers 20 days, `count 1346` against a full April's 2352).

So the frozen payload has been feeding the observed base year the high post-sync
months — 66.90, 38.71, 33.33 — **at face value**. `deriveCompression`'s own
comment calls those months "post-sync anomaly normalisation, not steady-state
compression" and deliberately discounts them; `computeBaseYear` does not. The
same months the compression model was written to distrust are being taken
literally by the revenue model one function away.

**Corrected direction: the freeze has been OVERSTATING the observed base year,
not understating the projection.**

---

## 3 · What was NOT done, and why

§2 (the VPS leg) and §3 (the 54-config signed delta) are **not started**. Shipping
§2 makes fresh data live, and fresh data moves published numbers **down** ~3.5 %
revenue and −66 bp project IRR. That is the opposite of what the phase was
authorised for, so it stops at the checkpoint.

The 54-config run is also not yet worth its cost: with the compression route
measured at zero, the delta is entirely a base-year-window effect, and the
window question (which months *should* the base year see?) is a modelling
decision for the operator, not a measurement.

## STOP-condition status

The prompt's stop is *"the fresh series disagrees with the controlled comparison's
DIRECTION"*. It does **not**: the controlled comparison said the decline stopped
and April was the bottom, and the fresh series agrees — 2.74 (April, bottom) →
4.53 → 9.99 → 5.00 → 5.00. Both measurements stand.

What failed is the **inference** from that series to the published numbers, which
assumed a single route (compression) that turns out to carry none of the effect.

## Reproduction

- Captured BTD bytes and the measurement harness: session scratchpad,
  `exact_2026-{03..08}.json`, `measurement.json`.
- Frozen baseline: `tools/consultancy/fixtures/regression-kv.json` (`kv.s2_activation_parsed`).
- Fresh side: real `computeS2Activation` + `parseS2Activation` + `deriveCompression`,
  exported for this measurement, `TZ=UTC`.
- **`TZ` matters.** `new Date(y, m, 1)` is local-midnight; run at UTC+3 the August
  chunk requests `2026-07-31` and the payload silently comes back 5 months instead
  of 6. Workers run UTC so production is unaffected, but any local reproduction
  must pin `TZ=UTC` or it measures the harness (B13 corollary).
