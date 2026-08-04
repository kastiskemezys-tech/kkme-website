# `s2_activation` — 105 days frozen, and what it feeds

**Status: MECHANISM ESTABLISHED · DIRECTION MEASURED · MAGNITUDE NOT MEASURED.**
No code changed, no flag added, no backfill. Per the instruction: backfill only
after the mechanism is established, and bring the delta only when it is a
measurement.

## The mechanism

`/health` at 2026-08-04T12:0xZ: `s2_activation · 2537.2 h · stale: true`. That is
**105 days**, last written around 2026-04-21.

One writer, and one only. The 09:30 UTC watchdog:

```js
const actPayload = await withTimeout(computeS2Activation(), 60000);
if (actPayload) {
  await env.KKME_SIGNALS.put('s2_activation', …);
} else {
  console.log('[S2/activation] BTD unavailable — keeping cached data');
}
```

`computeS2Activation` fetches six months of `price_procured_reserves` from
`api-baltic.transparency-dashboard.eu` and returns **null** when every fetch
fails. The branch then logs a reassuring sentence and writes nothing.

**BTD is not down.** Measured 2026-08-04:

| network | result |
|---|---|
| laptop (residential) | **HTTP 200**, 0.98 s, 2,880 timeseries |
| VPS 89.167.124.42 (Hetzner) | **HTTP 200**, 0.15 s |
| Cloudflare edge | unreachable — long-documented, and the reason `s2` has a VPS leg |

So this is the same shape as B-072 and the same shape the `s2` branch immediately
above it already works around: the CF edge cannot reach BTD, `s2` has a VPS
writer that serves it, and **`s2_activation` has none.** Verified: no script under
`/opt/kkme/app` or `/opt/kkme/bin` posts to `/s2/activation` or
`/admin/trigger-activation`.

The "keeping cached data" message is true on any single tick and became a
permanent stall 105 days ago, with nothing surfacing it until Phase 49 gave the
key a threshold and the follow-up made it ageable.

## What it feeds

`deriveCompression(kv)` reads `s2_activation_parsed.compression.afrr_lt_p50`.
Live `/revenue` (2h / mid / 2028 / base) reports:

```
compression_source          derived_from_s2_activation
compression_rate_observed   0.15        ← 15 %/yr, applied to every projection year
compression_data_points     8
initial_p50                 66.9
recent_avg_p50              13.5
rate_full_window            0.935
```

`effective_compression_rate` multiplies revenue in **every year of the 20-year
projection**, so the surfaces are the whole published financial block:
`gross_revenue_y1`, `net_revenue_y1`, `project_irr`, `equity_irr`,
`npv_at_wacc`, `lcos_eur_mwh`, and the scenario matrix built from them.

## Direction — measured, on a controlled comparison

LT aFRR procured-reserve price, **my own consistent aggregation** across four
months of the same BTD dataset and the same two Lithuanian aFRR columns
(11–12, read off the payload's own `header_groups`), median of non-zero values:

| month | median €/MW/h | n |
|---|---|---|
| 2026-03 (inside the frozen series) | 6.92 | 3,026 |
| 2026-04 (about where it froze) | **3.46** | 3,708 |
| 2026-06 (after the freeze) | 5.00 | 5,559 |
| 2026-07 (after the freeze) | 5.00 | 5,758 |

**The decline stopped.** April was the bottom; June and July are flat at 5.00,
above April.

The frozen series ends at or near that bottom, and `deriveCompression`
extrapolates its steep 66.9 → 13.5 decline forward at 15 %/yr — **a decline that
has since stopped.**

**Direction: the frozen trajectory is too pessimistic, so the published
projections are UNDERSTATED.** Fresh data would raise `gross_revenue_y1`,
`project_irr`, `equity_irr` and `npv_at_wacc`, and lower `lcos_eur_mwh`.

## Magnitude — deliberately NOT claimed

My medians (3.46–6.92) are **not** on the same basis as the payload's series
(13.5–66.9). Same dataset and same columns, but `computeS2Activation` aggregates
differently — its scale is roughly 3× mine, and I did not reverse-engineer which
of zero-handling, column pairing or monthly roll-up accounts for it.

Comparing 13.5 against 5.00 would be exactly the uncontrolled-sample error this
project has paid for before. **The four monthly figures above are comparable with
each other and with nothing else**, which is enough for direction and not enough
for magnitude.

Getting the magnitude honestly needs: `computeS2Activation`'s own parse run over
fresh BTD data, then the engine run both ways against one frozen KV snapshot,
54 configs, as a signed delta. That is a bounded piece of work and it is the next
step — not this one.

## The fix, when it is authorised

It is B-072's shape, and the VPS already reaches BTD in 0.15 s: a relay cron that
fetches and POSTs to the existing authenticated `/s2/activation`, which already
exists as a write route. The parse stays in the worker.

Note it would become caller #13 in `docs/playbooks/secret-rotation.md`.
