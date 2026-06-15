# Phase 33.B — BTD capacity-price documentation + `prices_source` relabel (Path C) — EVIDENCE

**Branch:** `phase-33-b-btd-cap-reparse` · **Commit:** `ec49286` · **Worker deploy:** `82df190f-aa4d-44bf-aac4-4745ab327988` · **Date:** 2026-06-15 (Session 80)

Path C = documentation + honest relabel, **zero behavioural change**. No PNGs (nothing visual).

---

## Pause A — the empirical finding (4th consecutive rule-#1 premise correction)

**Architecture traced end-to-end:**
- BTD fetcher is a **Mac cron** (`/Users/Kastis/kkme-cron/fetch-btd.js`, every 4h), not VPS.
- It fetches `price_procured_reserves` (BTD **capacity** dataset) and routes two ways: parsed per-ISP `capacity_prices` → `/trading/update`; raw `reserves` payload → `/s2/update`.
- Worker `s2ShapePayload()` (`fetch-s1.js:4565`) extracts `price_procured_reserves` cols 10-14 into `s2.{fcr_avg, afrr_up_avg, afrr_down_avg, mfrr_up_avg, mfrr_down_avg}` — **directional capacity €/MW/h, NOT activation €/MWh.**

**Prompt/Phase-33 premise was wrong:** `afrr_up_avg` is a capacity-reservation price (from `price_procured_reserves`), not an "activation price." The real gap: the engine reads `s2.*_cap_avg`, which **no parser path ever produces** → the `capPrice` calibrated-constant fallback is *always* active. Phase 33's bound still does the right thing (keeps IRR in-band); only its diagnosis framing was off.

**Why no remap (the magnitude problem):**

| product | live S2 capacity €/MW/h | calibrated constant | ratio |
|---|---|---|---|
| aFRR-up | 72.71 | 7.06 | ~10× |
| mFRR-up | 38.93 | 19.74 | ~2× |
| FCR | 63.73 | 0.36 | **~177×** |

Wiring `*_up_avg → *_cap_avg` (clamped to [0,50]) would swing IRR sharply upward, re-introducing exactly the silent input-drift risk Phase 33's bound prevents. FCR=63.73 is anomalous (€551k/MW/yr FCR-only — implausible). Calibrated constants stay canonical until operator sign-off on the post-sync directional-capacity basis (33.B.2, 2026-06-29).

---

## Pause B — change shipped (1 file, +20/−2)

`workers/fetch-s1.js`:
1. Multi-line comment at the `capPrice` fallback block (`:1062`) documenting the truth above.
2. `prices_source: 'BTD partial'` → `'BTD parsed; calibrated capacity (review pending)'` (both `computeRevenueV7` + `computeRevenueV6`).

Local: tsc clean · vitest 63 files / 941 passed (`capPriceBound.test.ts` still guards) · both lints clean · build 7 routes.

---

## Pause C — post-deploy verification (deploy `82df190f`)

```
/revenue:
  prices_source : 'BTD parsed; calibrated capacity (review pending)'   ← relabel live ✓
  model_version : v7.3
  signal_inputs : afrr_cap=7.06  mfrr_cap=19.74  fcr_cap=0.36          ← constants, no remap ✓
  project_irr   : 0.1997 (20.0%)                                       ← stable, == pre-deploy ✓

/s2:
  afrr_cap_avg / mfrr_cap_avg / fcr_cap_avg : <absent>                 ← documented-null ✓
  afrr_up_avg=72.71  mfrr_up_avg=38.93  fcr_avg=63.73                  ← unchanged ✓
  timestamp=2026-06-15T09:00:04.075Z
```

IRR identical before/after → behavioural-no-op confirmed. Watch log (`flagOutOfBandS2Capacity`, `:8569`) unchanged — fires every `/revenue` compute, `*_cap_avg` always absent.

## Origin-SHA guard (Session 74 discipline)

```
local  ec492860eb7ae4084adcc81e60c27fa5428773af
remote ec492860eb7ae4084adcc81e60c27fa5428773af   MATCH ✓ (verified before deploy)
```

---

## Follow-ups filed

- **33.B.2 (expanded)** — one coherent operator review of all three products' (FCR + aFRR + mFRR) post-sync capacity-pricing basis, 2026-06-29.
- **33.B.3 (separate ~30 min)** — replace ephemeral `console.log` watch with a KV accumulator (`s2_capacity_watch_{YYYY-MM-DD}` = `{date, fcr_avg, afrr_up_avg, mfrr_up_avg, clip_events_count}`, 14-day retention) so 33.B.2 can reason about persistence vs transient spikes.
- **`:2793` cleanup candidate** — `computeBaseYear`-side `prices_source = s2?.fcr_avg != null ? 'BTD measured' : 'proxy'` is a *separate* pre-existing inconsistency (labels "BTD measured" on a calibrated-capacity path). Not silently fixed; fold into 33.B.3 or its own micro-phase.
