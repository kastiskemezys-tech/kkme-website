# Phase 38 — site ↔ engine sync audit (CHECKPOINT ARTIFACT, no changes made)

**Branch:** `phase-38-sync-audit` off `2525cb4` (= `main` = `origin/main`).
**Code changed: none.** `git diff main -- workers/` = 0 bytes, `git diff main -- app/` = 0 bytes, 0 tracked files differ.
**Audit window:** 2026-08-02 **09:17Z → 09:30Z**. Every live figure below carries that stamp; anything re-checked later may have moved.

---

## Pause A — the four questions

**(a) Which premises are HYPOTHESIS vs verified.** Every claim in the prompt arrived as a screenshot-derived observation, i.e. the ~25 % class. I treated all four of Part B as hypotheses and triangulated each by code-grep + live curl + KV read + git/TTL forensics before calling anything. Outcome: **B1 confirmed and worse than described** (the mechanism is not a threshold problem); **B2 confirmed as stated**; **B3 confirmed as a defect but not the defect the operator suspected** — the two numbers are correctly different populations, and the *label on one of them is false*; **B4 confirmed, plus an unflagged internal contradiction in the same payload**. No item in Part B was a misreading of a screenshot. The operator's eye was right four times out of four, which is itself worth recording against the 25 % base rate — visual inference on *one's own site*, where the observer knows what the number should be, is a different and better-calibrated instrument than a third-party visual audit. **(b) What consumes what this phase changes.** Nothing — this phase changed nothing. What the *proposed* fixes would touch is scoped per item in §5. **(c) What fails silently.** This is the phase's central finding: `s1_capture` is absent from `STALE_THRESHOLDS_HOURS`, so the key behind the S1 hero number has no monitor at all; and the key that *is* monitored (`s1`) is rewritten by any unmatched GET on the worker, so its freshness measures probe traffic rather than the ingestion path. The 33 h outage was detected by the operator's eye, and by nothing else. **(d) At which layer and time verified.** Outermost layer users touch: live `https://kkme.eu` route probes (all 200), live worker payload curls, and a read-only `wrangler kv key get` against the production namespace. Validity window: post-08:00Z-cron, pre-12:00Z-cron. The 4-hourly cron boundary is the relevant tick; the `raw:s1:*` TTL forensics in §3.1 are cron-tick-anchored and do not depend on when I looked.

**Disclosure of my own side effects.** `GET` on any worker path with no explicit route falls through to a catch-all that runs `computeS1()` **and writes the `s1` KV key** (`workers/fetch-s1.js:11632-11646`). My probes of `/s1`, `/s4/pipeline` and `/totally-bogus-route` therefore rewrote `s1` roughly six times during the audit. The write is the same computation the cron performs against live ENTSO-E, so no value was corrupted — but `/health`'s `s1.age_hours: 0` in the payloads I captured is **my probe, not the system**, and I have not used it as evidence anywhere. No other production state was mutated. `docs/_private/` never touched.

---

## Part A — provenance sweep

**Coverage statement, honestly.** Every number on the hero, the KPI ticker, and **every card's hero metric, status chip, impact line and source footer** is enumerated below — 35 rendered surfaces. Drawer interiors (S2's monthly trajectory, S4's asset panel, RevenueCard's assumptions panel — several hundred further figures) were **sampled, not enumerated**; a full drawer sweep is a second pass and I am flagging it rather than implying I did it.

Legend — **aligned**: reads the canonical field, label matches what the number is. **divergent**: reads a non-canonical field, or the label misdescribes the number. **uncited**: no canonical declaration exists in `metricRegistry.ts`, or the displayed citation does not match the payload's own `source`.

### A.1 KPI ticker (`SignalBar.tsx`)

| # | Rendered | Should come from | Actually comes from | Freshness at check | Citation shown | Verdict |
|---|---|---|---|---|---|---|
| 1 | `BESS CAPTURE 121 €/MWh` | — (undeclared) | `/read` → `s1.bess_net_capture` | live (recomputed on read) | none | **uncited** — no registry entry |
| 2 | `S/D RATIO 2.91×` | `s4.fleet.sd_ratio` | same | 08:01Z (1.3 h) | tooltip | **divergent (tooltip)** — see A.5 |
| 3 | `aFRR 17.79 €/MW/h` | `s2.afrr_up_avg` | same | fetched 08:00Z; **data window ends 2026-07-30** | none | **divergent (freshness)** |
| 4 | `GRID FREE 3.5 GW` | — (undeclared) | `s4.free_mw` | 04:00Z (5.3 h) | none in ticker | uncited |
| 5 | `FLEX FLEET (BESS + pumped hydro) 782 MW` | `s4.fleet.baltic_operational_mw` | same ✓ | 08:01Z | inline scope label | **divergent (label false)** — see B3 |
| 6 | `DISPATCH €568/MW/DAY` | — (undeclared) | `/api/trading/signals` → `totals.per_mw` | **payload `date: 2026-07-30`** | none | **divergent (freshness)** |

### A.2 Hero (`HeroBalticMap.tsx`)

| # | Rendered | Source field | Freshness | Verdict |
|---|---|---|---|---|
| 7 | live rate €/MW/day + `↑/↓ % vs Y1 base` + `€…k /MW/YR` | `/revenue?dur=2h` | live | aligned |
| 8 | `IRR 22.3 %` (unlevered) | `revenue.project_irr` = 0.2229 | live | aligned |
| 9 | `BALTIC FLEX FLEET (BESS + pumped hydro) 782 MW OPERATIONAL` | `fleet.baltic_operational_mw` | 08:01Z | **divergent (label false)** |
| 10 | country split `EE 135 · LT 547 · LV 99` | `fleet.countries[*].operational_mw` | 08:01Z | aligned (arithmetic exact: 135.5+547+99 = 781.5 → 782) |
| 11 | `+ 15,239 MW PIPELINE` | `fleet.baltic_pipeline_mw` | 08:01Z | aligned |
| 12 | **`= TSO BESS 651 MW + Kruonis flex share 131 MW`** | computed as `max(0, flex − bess)` | 08:01Z | **DIVERGENT — fabricated attribution.** See B3 |
| 13 | `… MW awaiting TSO confirmation` | `fleet.baltic_quarantined_mw` | **field absent from `/s4`** | does not render |
| 14 | Block-2 tooltip: *"Includes 0 MW flagged _quarantine … (Kruonis PSP, BSP Hertz 1, …). Strict-verified count: — MW."* | `baltic_quarantined_mw`, `baltic_operational_mw_strict` | **both absent from `/s4`** | **divergent** — asserts a named quarantine list against a hardcoded 0 and a dash |
| 15 | marquee `DEMAND 752 MW (FCR 28 + aFRR 120 + mFRR 604, Baltic LFC block)` | `fleet.eff_demand_mw`, `fleet.product_sd.*.demand_mw` | 08:01Z | **aligned** — split is computed, not hardcoded (rule #2 correctly applied here; this is the pattern the rest should follow) |
| 16 | marquee `AFRR / MFRR / IRR / EQUITY IRR / DSCR / CAPEX` | `/s2`, `/revenue` | mixed | aligned |
| 17 | country gen/load labels | `/genload` | 09:17Z fetch; underlying data **122–137 min old** (`data_age_minutes`) | aligned (age is in payload, not displayed) |
| 18 | cable flows (NordBalt 699 / LitPol −182 / EstLink 907 / Fenno-Skan 1010 MW) | `/s8`, all five legs `freshness: live` | 09:00Z | aligned |

### A.3 S1 · DA Arbitrage (`S1Card.tsx`)

| # | Rendered | Source field | Freshness | Citation | Verdict |
|---|---|---|---|---|---|
| 19 | hero `€142/MWh` | `/s1/capture` → `gross_2h` = 141.99 | **`updated_at` 2026-08-01T00:01:40Z — 33.3 h** | energy-charts.info | **divergent (stale)** — badge honestly reads `STALE · 33h ago` |
| 20 | chip `P50–P75 / 30d` | `rolling_30d.stats_2h` (p50 = 141.99) | same 33 h | — | aligned, inherits staleness |
| 21 | impact `At a 100 MW / 2h plant, **today's** gross capture implies **€28,400**/day` | `heroVal × 200`, rounded to €100 | same 33 h | — | **divergent (rule #2)** — "today's" asserted on a 2026-08-01 value; arithmetic verified 141.99 × 200 = 28,398 → 28,400 |
| 22 | footer `energy-charts.info (Fraunhofer ISE)` | payload `source` field, identical string | — | matches payload | aligned |

### A.4 S2 · Balancing (`S2Card.tsx`)

| # | Rendered | Source field | Freshness | Verdict |
|---|---|---|---|---|
| 23 | hero `17.79 €/MW/h` | `s2.afrr_up_avg` | badge reads `data.timestamp` = **08:00Z fetch** | **divergent (freshness semantics)** |
| 24 | chip `Δ +51 % / 90d` | `s2.afrr_up_avg_90d_delta` = 51.1 | ✓ canonical (registry `afrr_up_avg_90d_delta`) | aligned |
| 25 | — (not rendered) | `s2.data_window_end` = **2026-07-30** | never surfaced anywhere on the site (`grep -rn "data_window_end" app/` → 0 hits) | **the omission is the finding** |

### A.5 S4 · Grid access (`S4Card.tsx`)

| # | Rendered | Canonical field | Actual | Freshness | Verdict |
|---|---|---|---|---|---|
| 26 | LT installed `484 MW` | `s4.storage_reference.installed_mw` | same | `installed_mw_as_of` **2026-03-23** (4.4 months) | aligned but frozen; `installed_mw_live` is `null` for all three countries, so the registry's `_live`-preferred selector never fires |
| 27 | LV installed `40 MW` | `s4.storage_by_country.LV.installed_mw` | same | as-of **2025-10-01** (10 months) | **DIVERGENT** — contradicts its own `coverage_note` (80 MW), its own `assets[]` (60 + 20 = 80) and `fleet.countries.LV.operational_mw` (99). See B4 |
| 28 | EE installed `127 MW` | `s4.storage_by_country.EE.installed_mw` | same | as-of 2026-02-05 | aligned, A68 gap disclosed in `coverage_note` |
| 29 | Baltic total `651 MW` | `s4.baltic_total.installed_mw` | same | — | arithmetically consistent (484+40+127) but **inherits row 27** |
| 30 | `APVA grant call: ~1,545 MW applied (operator estimate, pending APVA refresh)` ×3 locations | none | `pipe.apva_applied_mw`, frontend fallback `?? 1545` **and** worker default `getVal('apva_applied_storage_lt_mw', 1545)` | never refreshed | **uncited** — see B2 |
| 31 | TSO reserved `1,395 MW` / intention `3,700 MW` | `storage_by_country.LT.*` | same | Litgrid quarterly | aligned |
| 32 | `Flex fleet` tile inside S4 | `fleet.baltic_operational_mw` | same | 08:01Z | inherits row 9's label problem |
| 33 | footer `Litgrid · APVA · VERT.lt ArcGIS · Elering`, `data.timestamp` | — | 04:00Z (5.3 h — the 08:00 cron did not write `s4`) | aligned |

**Rule-#4 casualty found here, not by the operator:** `sdFormulaCaption()` — the Phase 36.D canonical S/D caption — is guarded on `fleet.baltic_weighted_mw != null`. The `/s4` assembler at `workers/fetch-s1.js:10269-10281` is an **explicit whitelist** that copies ten fleet fields and drops `baltic_weighted_mw`, `baltic_weighted_net_mw`, `baltic_operational_mw_strict`, `baltic_quarantined_mw`, `absorption_mw`, `non_commercial_mw`, `demand_basis` and `quarantined` — all of which the worker computes at `:774-800`. So on the live site the canonical caption **never renders**; both the ticker and the hero fall through to the generic string. 36.D's fix shipped and is dark.

### A.6 Structural drivers (tier 3)

| # | Card | Rendered | Source | Citation shown | Payload's own `source` | Verdict |
|---|---|---|---|---|---|---|
| 34 | RenewableMix | Baltic wind 112 MW / solar 2,274 MW / load 2,588 MW | `/s_wind`, `/s_solar`, `/s_load` | **"ENTSO-E"** | **"energy-charts.info"** | **uncited (miscited)** |
| 35 | ResidualLoad | derived from same three | same | **"ENTSO-E"** | **"energy-charts.info"** | **uncited (miscited)** |
| 36 | PeakForecast | peak/trough hour EET | `/read` → `lt_hourly_24`, `lt_peak_hour_utc` | "Nord Pool via ENTSO-E" | ENTSO-E A44 | aligned |
| 37 | SpreadCapture | hero `€121/MWh` (`intraday_capture`, live) + canonical footnote vs `gross_4h` = 123.01 | `/read` + `/s1/capture` | energy-charts.info | — | **divergent** — a live number footnoted against a **33 h-stale** comparator, with no indication the two have different vintages |
| 38 | S7 gas | `TTF €59.07/MWh ↓` | `/s7` | energy-charts.info | matches | aligned (08:01Z) |
| 39 | S9 carbon | `EUA €81.26/t ↓` | `/s9` | energy-charts.info | matches | aligned (08:01Z) |

### A.7 Revenue engine, index, dispatch, intel

| # | Rendered | Source | Freshness | Verdict |
|---|---|---|---|---|
| 40 | IRR 22.29 % · equity 40.2 % · DSCR 2.36 · LCOS €82.5/MWh · MOIC 6.57 · 498 cycles/yr · CAPEX €164/kWh | `/revenue?dur=2h`, `model_version v7.3` | computed per request | aligned |
| 41 | Baltic Storage Index `LT 2h €265.2 · 4h €287.4` | `/index/baltic`, **`month: 2026-06`** | KV written 06:30Z today | aligned but **two months behind**; card does render "Jun 2026", footer date reads 2026-08-02 |
| 42 | Index LV / EE | all `null`, `coverage: pending_phase_29_1` | — | a three-country index publicly showing one country |
| 43 | Dispatch **realised** €487/MW/day | `/api/dispatch?mode=realised`, `date_iso` **2026-07-30** | as-of 08:01Z | **divergent (freshness)** — 3 days behind, driven by `s2.data_window_end` |
| 44 | Dispatch **forecast** €101/MW/day, capacity split **0 %** | `/api/dispatch?mode=forecast`, `date_iso` **2026-08-01** | reads `da_tomorrow` KV, last written **2026-07-31T20:00Z** | **DIVERGENT** — a panel labelled *forecast* showing **yesterday**, at €101 vs realised €487 because its capacity leg is €0. Same root cause as B1 |
| 45 | Intel feed | **3 items**, one category (`project_stage`), newest published **2026-07-09** | `/feed` | 3.5 weeks | see §4 IA break |

---

## Part B — the four hypotheses, triangulated

### B1 — S1 `STALE · 33h ago` beside a 56 m-fresh S2. **CONFIRMED. Not a threshold problem — an eight-tick ingestion outage with no detector.**

**The observation reproduces exactly.**
```
$ curl -s .../s1/capture | python3 -c "…"
updated_at = 2026-08-01T00:01:40.584Z   date = 2026-08-01
```
At 09:19Z on 2026-08-02 that is 33.3 h → `freshnessLabel()` returns `STALE` (72 h band) and `formatAge()` renders `33h ago`. The chip is **correct and honest**. The threshold is not wrong.

**Is the upstream publishing?** Yes. Direct curl, bypassing our stack entirely:
```
$ curl -s "https://api.energy-charts.info/price?bzn=LT&start=2026-08-02T00:00Z&end=2026-08-02T23:59Z"
HTTP 200 · n prices 88 · first 2026-08-02T00:00 · last 2026-08-02T21:45 · min 2.6 max 139.02
```
88 rather than 96 is structural, not a gap: a UTC-day query window over a CEST market day returns 22 h, the last two belonging to tomorrow's not-yet-cleared auction. The 2026-08-01 capture recorded `n_prices: 88` for the same reason.

**Is our fetch running?** The 4-hourly cron **is** firing and completing — `/health-detail` shows `s2` 08:00:04Z, `s3` 08:00:53Z, `s4_fleet` 08:01:07Z, `s7` 08:01:14Z, `s9` 08:01:14Z, euribor 08:0xZ. **The S1 branch specifically is not.** Proof, from a read-only production KV list — `raw:s1:<date>` is written on the line immediately after `put('s1')` inside the cron branch, with `expirationTtl: 604800`, so `expiration − 604800` is the timestamp of that date's **last successful S1-branch run**:

```
$ npx wrangler kv key list --namespace-id=323b493a… --remote --prefix "raw:s1:"
raw:s1:2026-07-26 … 2026-08-01   (seven keys)
$ npx wrangler kv key get "raw:s1:2026-08-02" …   → MISSING
$ npx wrangler kv key get "raw:s1:2026-08-01" …   → fetched 2026-08-01T00:01:22.389Z
```

| date | last S1-branch success (derived from TTL) |
|---|---|
| 2026-07-26 | 20:01:17Z |
| 2026-07-27 | **08:01:32Z** |
| 2026-07-28 | 20:01:20Z |
| 2026-07-29 | **16:01:25Z** |
| 2026-07-30 | 20:01:09Z |
| 2026-07-31 | 20:01:15Z |
| 2026-08-01 | **00:01:22Z** |
| 2026-08-02 | **no key — zero successes** |

So this is **not a new break**: the S1 branch has been failing intermittently for at least the seven days the TTL window covers (27 Jul and 29 Jul each lost their afternoon ticks). What is new is the length — **eight consecutive misses**, 04/08/12/16/20 on Aug 1 and 00/04/08 on Aug 2.

**Is an admission gate rejecting?** No gate is involved. The mechanism is structural:

```js
// workers/fetch-s1.js:8008-8071
const [s1Result, …] = await Promise.allSettled([ withTimeout(computeS1(env), 30000), … ]);
if (s1Result.status === 'fulfilled') {
  …  await env.KKME_SIGNALS.put('s1', …);              // ← skipped
  …  if (d.da_tomorrow?.prices_24h?.length) { … }       // ← skipped
  try { const cap = await withTimeout(computeCapture(env), 25000); … }  // ← skipped
}
```
`computeCapture(env)` takes **only `env`** — it re-fetches energy-charts itself and has no data dependency on `computeS1`'s result. It is nested inside the success branch for no reason other than code position, so a computeS1 failure takes down a capture that would have succeeded. Inside `computeS1`, `Promise.all` contains exactly **two unguarded throw sites**: `fetchBzn(LT_BZN)` and `fetchBzn(SE4_BZN)`, which `throw` on any non-2xx (`:4327-4331`). `fetchBznRange` and `computeHistorical` both swallow their errors; the PL leg has `.catch(() => '')`. So a single ENTSO-E non-200 on either LT or SE4 kills the entire branch.

**HYPOTHESIS (unproven, no logs).** The specific trigger is most likely ENTSO-E throttling: the 4-hourly tick fires `computeS1`'s nine ENTSO-E requests concurrently with `computeS4`'s, whereas `GET /s1` on demand runs them alone and succeeded 5/5 for me in 1.1–2.6 s. I cannot confirm this — `wrangler.toml` has **no `[observability]` block**, so Workers Logs are off and there is no historical log to read. `wrangler tail` would catch the next 12:00Z tick live; that is the cheap way to convert this hypothesis into evidence and I have not done it because it lands outside the session window.

**The B8 question — how long before anything told us? Never.** Two compounding defects:
1. **`s1_capture` is not monitored.** `STALE_THRESHOLDS_HOURS` in `workers/lib/defaults.js:187-204` lists 15 keys. `s1_capture` — the key behind the S1 hero, the €28,400/day line, and SpreadCapture's canonical footnote — is not one of them.
2. **The key that *is* monitored cannot go stale.** `s1` has a 24 h threshold, but the worker's catch-all `if (request.method === 'GET')` recomputes and rewrites it on *any* unmatched path. Demonstrated: `GET /totally-bogus-route` and `GET /s4/pipeline` both returned a freshly-computed S1 payload. `/health`'s `s1` entry therefore measures probe traffic, not the ingestion path — the playbook's B11 shape (a negative that measures the probe, not the world), inverted into a false positive.

**Second public consequence, same root cause.** The `da_tomorrow` mirror lives in the same skipped branch, so `da_tomorrow` KV last wrote **2026-07-31T20:00Z** (`/health` flags it `stale: true`, 37.3 h vs a 36 h threshold — the one honest alarm in the system, and it is on a key nobody watches). That is why row 44 above shows the **forecast** dispatch panel serving `date_iso: 2026-08-01`. 36.C's first-ever forecast serve is live and is showing yesterday.

**Why S2 looks fresh beside it — and this is the real asymmetry.** `S1Card` passes `updatedAt={cap.updated_at}` (when the *data* was computed). `S2Card:250` passes `updatedAt={data.timestamp}` (when the *fetch* ran). S2's `data_window_end` is **2026-07-30** — three days of balancing data behind — and that field is rendered nowhere on the site. So the two badges sitting side by side measure different quantities: S1's is honest about data age and looks bad; S2's is honest about fetch age and looks good while hiding a three-day lag. **The operator read the site correctly and drew the wrong inference from it, because the site invited that inference.**

### B2 — the APVA line. **CONFIRMED. Recommend relabelling, not removing.**

Rendered in three places (`S4Card.tsx:527, 548, 775`), all as `~{formatMW(pipe?.apva_applied_mw ?? 1545)} MW`. There are **two** hardcoded 1545s in the chain — the frontend fallback and the worker's own `getVal('apva_applied_storage_lt_mw', 1545)` at `fetch-s1.js:10184` and `:10218` — so the number survives even if the pipeline goes silent, and has no as-of stamp anywhere. The line already carries "(operator estimate, pending APVA refresh)" and the drawer tooltip carries the APVIS call URL and the €44.97M budget, which is more disclosure than most surfaces get.

37.A established APVA is not citable at citation grade today; TAM is the unblocker (B-044). **My recommendation: carry the finding in the label, do not hold the number.** Removing a published figure that has been up for months is a bigger public event than tightening its label, and the figure is genuinely useful context for the LT funnel. Concretely: change "operator estimate, pending APVA refresh" → a form that states *why* it cannot be confirmed and *when* it was estimated, e.g. `~1,545 MW applied · operator estimate, 2025-10 call · no register serves beneficiary lists at citation grade (TAM pending)`. That is one copy change, respects rule #3 by not asserting a source that cannot confirm it, and it is a public copy change so it waits for your signature. Removing the double hardcode is a separate, non-public tidy.

### B3 — 782 MW vs 651 MW. **CONFIRMED as a defect — but the opposite of a rule-#4 double-count. The populations are correctly distinct; one label is false and one derived line is fabricated.**

Both numbers read their canonical registry fields: `baltic_flexibility_fleet_mw` → `s4.fleet.baltic_operational_mw` = **782**; `baltic_total_installed_mw` → `s4.baltic_total.installed_mw` = **651**. Rule #4 is satisfied. Then:

```
$ python3 — over the live /s4 payload
pumped-hydro / Kruonis entries in fleet.countries : []
LT operational entries sum                        : 547
781.5 = LT 547 + LV 99 + EE 135.5  →  baltic_operational_mw 782
```

**There is no pumped hydro in the 782.** Not one entry in `fleet.countries` carries `type: 'pumped_hydro'`, and the name "Kruonis" appears nowhere in the fleet. The 782 is the exact sum of BESS entries. Yet it is labelled, in three places:
- ticker inline scope `(BESS + pumped hydro)`;
- hero Block-2 inline scope `(BESS + pumped hydro)`;
- both tooltips: *"Baltic flexibility fleet · BESS + pumped hydro (Kruonis 205 MW)."*

And the hero renders a **derived line computed as a residual**:
```jsx
const kruonis = Math.max(0, Math.round(flex - bess));   // 782 − 651 = 131
… = TSO BESS {651} MW + Kruonis flex share {131} MW
```
The site publishes "**Kruonis flex share 131 MW**". Kruonis is 205 MW and is not in either population. The 131 decomposes as (LT 547−484) + (LV 99−40) + (EE 135.5−127) = 63 + 59 + 8.5 = 130.5 — it is the gap between the fleet tracker and the national registries, relabelled as a hydro asset. This is discipline rule #2 in its purest form: a label asserting *what* a value is, with the value derived by subtraction and the label written by hand.

Compounding it: `fleet.baltic_operational_mw_strict` and `baltic_quarantined_mw` are computed by the worker (`:774-776`) and **dropped by the `/s4` whitelist**, so Block 2's tooltip renders *"Includes **0** MW flagged _quarantine … (Kruonis PSP, BSP Hertz 1, Eesti Energia BESS, Utilitas Targale, AJ Power). Strict-verified count: **—** MW."* — a named list against a hardcoded zero. `app/lib/fleet.ts`'s own header comment still says "Currently 822 MW Baltic-wide", a Phase-12.10 figure.

**Can a reader tell which population each describes?** No — because one of the two descriptions is wrong. Fix is small and non-numeric: correct the scope labels to what the field actually holds (BESS fleet-tracker total vs TSO-published BESS registry), delete the Kruonis residual line or replace it with the real decomposition (fleet-tracker coverage above registry, per country), and either restore the dropped fields to the `/s4` whitelist or delete the prose that depends on them.

### B4 — LV 40 MW against 37's findings. **CONFIRMED, and there is a contradiction inside the same payload that the private tier has nothing to do with.**

The public LV number is `s4.storage_by_country.LV.installed_mw = **40**`, as-of **2025-10-01**. In the *same object*:
- `coverage_note`: *"AST owns Rēzekne 60 MW + Tume 20 MW = **80 MW** operational (balancing reserves from 2025-10-30, RRF/CEF-funded)…"*
- `assets`: `AST BESS (Rēzekne) 60` + `AST BESS (Tume) 20` = **80**
- `metricRegistry.ts:48-55`, the canonical declaration itself: *"Currently AST Rēzekne (60) + Tume (20) = **80**."*
- `fleet.countries.LV.operational_mw` = **99** (the 80 plus Utilitas Targale 10 and AJ Power 9, both primary-sourced in 33.A.2.b)

So the field the registry names as canonical is the **only** artefact in the estate that says 40, and it contradicts its own note, its own asset list, and its own registry entry. It propagates into `baltic_total.installed_mw = 651` (484 + 40 + 127); on the payload's own evidence that should be 691. This is a **public-number movement of +40 MW** and therefore squarely a sign-off item, with a delta table.

**Is the public LV figure believed to be complete, and does the card say so?** No, and no. 37.D measured the verified fleet's citable contribution to published supply at **0 MW** — all 36 registry-confirmed entities are LV, each carrying exactly one `data.gov.lv` citation that proves a *company* exists and nothing about a battery, with Σ`bess_mw` = 0.0. Separately, 37.B.1's discovery sweep found **41 untracked live LV storage-named entities**, held as candidates in the gitignored private tier (B-049). **Nothing private may or should enter the public number, and nothing in my recommendation does.** But the card currently presents 40 MW with no completeness statement at all. LV's `coverage_note` exists in the payload and explains the market's smallness — it is not rendered on the card. The honest public position is: correct 40 → 80 on the primary-sourced AST assets, and surface the coverage note, which already says in its own words that LV permit registers carry no clean BESS data. That states incompleteness without leaking a single private row.

---

## Part C — what we built and never showed

| capability | phase | shipped? | surfaced where | verdict |
|---|---|---|---|---|
| **Chronological hourly dispatch engine** (SoC continuity, hourly reserve-energy reservation, simultaneity 75.2–85.5 %) | 36.B1 | yes, Node-side | **nowhere.** Public `/revenue` still serves `computeRevenueV7`, `cycles_per_year: 498` | not surfaced |
| **Measured trading realisation 0.7234** (349 traded days) + **15-min uplift 0.0885** (273 PT15M days) | 36.B3 | yes, adopted in the shipped engine | uplift **is** live — `/api/dispatch` returns `uplift_factor_decimal: 0.0885`; realisation is inside the engine but unlabelled on any card | partly surfaced, unexplained |
| **Historical-shape bootstrap, P50/P90 distribution** | 36.B2 | yes | nowhere public | not surfaced |
| **Contracted-floor / toll overlay** (at 50 % contracted the tail lifts 4.6× the median — "that asymmetry is the product") | 36.B4 | yes | nowhere public | **not surfaced, and this is the single most commercially expressive thing in the estate** |
| **Run registry + register versioning + 25 pp lender annex** | 36.B6 | yes | `docs/methodology-lender.md` ships in delivery bundles; `/methodology` page live (200) but does not link the annex | internal-only by design; one link would change that |
| **Forecast mode — first-ever serve** | 36.C | yes, live | `/api/dispatch?mode=forecast` serving on TradingEngineCard | **surfaced but broken** — `date_iso 2026-08-01`, capacity leg €0, so it renders €101 beside a €487 realised. Blocked by B1's root cause |
| **299-day daily clearing history** (2025-10-01 → 2026-07-26, FCR/aFRR/mFRR up+down, 96 ISP/day) | 36.C | yes, live at `/s2/daily-clearing` | **nowhere.** `grep -rn "daily_clearing\|clearing_history" app/` → 0 hits | not surfaced — the deepest series we own |
| **Tri-TSO demand series** | 36.D | yes | **live and correct** — hero marquee renders `DEMAND 752 MW (FCR 28 + aFRR 120 + mFRR 604, Baltic LFC block)`, split computed from `product_sd` | surfaced ✓ |
| **Named "Litgrid L TrSc" scenario / `demand_basis`** | 36.D | yes in worker | `s2.demand_basis` = `{source: demand-forecast-module, module_version 1.0.0, year 2026}` — no scenario name; `fleet.demand_basis` **dropped by the `/s4` whitelist**; nothing rendered | not surfaced |
| **Canonical S/D formula caption** | 36.D | yes | **dark** — `baltic_weighted_mw` dropped by the same whitelist, so both call sites fall through to the generic string | shipped, not reaching the browser |
| **`supplyBasisComparison`** | 36.D | yes | exported, **called by nothing** (noted in Session 99) | dead code |
| **Fleet verification tiers + lifecycle detectors** | 37.A/B | yes | `/fleet` console, `FLEET_SECRET`-gated, 200 live; `/health.fleet_lifecycle` exposes 7 detectors (2 healthy, 5 blind/never-run, `status: degraded`) | internal-only ✓ correct |
| **37.D headline — verified fleet's citable contribution = 0 MW; hybrid band 11,976–16,020 MW** | 37.D | yes, CP delta signed-pending | nowhere public | not surfaced; **the 0 MW finding is a credibility asset, not an embarrassment** |
| **Per-service price formation (FCR + aFRR)** | 36.E1/E2 | yes, **deliberately unwired until E6** | nowhere, by design | correctly parked |
| **Calculator full-tier CORS fix** | 37.H1 | yes | verified live: `access-control-allow-headers: Content-Type, X-Update-Secret, **Authorization**` | surfaced ✓ |

### The parked dispatch-card → hourly-engine cutover — recommendation

**What it is** (Session 92, "OPEN ITEMS ROUTED OUT OF THE ARC"): cutting the public dispatch card from `computeRevenueV7` to B1's hourly engine. Physical cycling falls **498 → 222 EFC/yr**, degradation falls with it, and **public IRR moves materially upward**. It was parked for sequencing optics, not correctness. Three logged public-display defects are explicitly routed to travel *with* it: `capture_eur_mwh` publishing a theoretical spread on losing days (36.B0-F, a rule-#2 shape on a live field), SoC resetting daily, and `annual_eur = daily × 365`.

**Recommendation: do it, as its own phase, but third in a queue of three — and do not bundle it with E6.**

1. **First, the S1-branch fix** (§5 items 1–3, ~2–3 h). Non-negotiable precondition. Cutting over to an engine that raises the headline IRR while the card's own inputs are visibly 33 h stale and its forecast panel is showing yesterday is the worst possible order: it invites exactly the reading that the number went up because the inputs went soft. Fix the plumbing, let it run clean for a few cron cycles, *then* move the number.
2. **Second, the label and provenance corrections** (§5 items 4–7). These are cheap, they are all corrections in the *unflattering* direction (a false composition label removed, a fabricated 131 MW line deleted, a miscitation fixed), and shipping them before an IRR-raising change establishes that the sweep cut both ways.
3. **Third, the cutover**, with a before/after delta table across all 54 `/revenue` configurations, a baseline captured from a **clean worktree** of the pre-cutover commit (C6 — never a stash), against **one frozen KV snapshot** copied byte-identical into both trees (the 37.D method, which worked). The three routed card defects fix in the same phase, per the arc's own routing.

**Why not bundle with E6.** E6 replaces `reservePrice()` and will move public numbers again. Two IRR movements inside one phase are two causes for one delta, and C3 exists because 36.C already paid for that: an unattributed IRR move with two same-day causes. Keep them separate so each delta has exactly one name on it. The cutover is also a *different kind* of change — it replaces a modelled quantity with a measured one, which is a methodology-honesty improvement that reads well on its own. E6 is a calibration change. Shipping them together makes the honest one look like cover for the other.

**One caution to carry into that phase.** The cutover moves IRR **up**, and 36.B5's own ledger says the modelled asset already cycles *below* the observed merchant band (498 vs 550–720). Moving to 222 EFC/yr moves it further below. The handover flags this as "a calibration question, no owner yet". That question should be answered, or explicitly declared unanswered in the card's drawer, **in the same phase** — otherwise the site publishes a higher IRR justified by a cycling assumption we have already recorded as an outlier.

### Where the "signal → structure → returns → run it yourself" line breaks

Testing the IA against *the site is the argument, the calculator is the in-depth product within it*:

1. **Signal → structure holds**, and it is the strongest stretch. S1/S2 → build conditions → structural drivers reads cleanly.
2. **Structure → returns has no bridge.** The reference asset appears as a finished 22.29 % IRR with no visible path from the signals above it. Everything that *would* build that bridge exists and is unsurfaced: the 299-day clearing history (what reserve prices have actually done), the contracted-floor asymmetry (what a floor buys you), the measured 0.7234 realisation (why we do not use 0.85). **This is the largest single gap on the site.**
3. **Returns → "run it on your own project" is a dead end in the copy.** `/calculator` is live and its full tier now authenticates, but the reference-asset section's only CTA is `Looking at Baltic storage? Start the conversation ↗` pointing at the contact form. The homepage never says the calculator exists at the moment a visitor is looking at the number they would want to reproduce.
4. **Market intelligence has collapsed to 3 items**, one category, newest 3.5 weeks old. A section headed "Developments that affect Baltic BESS revenue, buildability, and market structure" carrying three project-stage items reads as abandoned rather than curated. Either the expiry policy is too aggressive or ingestion has stalled — I did not diagnose which, and it is not in this prompt's scope, but it is the most visible IA break to a first-time visitor.
5. **The credibility story is invisible.** 37.D's "verified fleet's citable contribution is 0 MW", the hybrid band, the register, the run registry, the lender annex — the entire apparatus that makes the numbers trustworthy is internal. A visitor sees confident figures with no visible reason to believe them. One `/methodology` link to the annex would change that at near-zero cost.
6. **Two half-empty surfaces**: the Baltic Storage Index publishes one of three countries and a two-month-old month; the forecast dispatch panel publishes yesterday at a fifth of realised.

---

## §5 — the fix queue, for your signature

Nothing below is applied. Grouped by whether it moves a public number.

**No public number moves (mechanical, could ship on sign-off alone):**
1. Lift `computeCapture(env)` out of the `s1Result.status === 'fulfilled'` branch — it has no dependency on `computeS1`. Restores the DA capture across S1 failures. *One-line move; `/revenue` untouched.*
2. Add `s1_capture` (and `s1_history`) to `STALE_THRESHOLDS_HOURS`. Add a cron-only heartbeat key so `/health`'s `s1` entry stops being rewritable by probe traffic.
3. Guard `fetchBzn` LT/SE4 so one ENTSO-E non-200 cannot kill the branch; enable `[observability]` in `wrangler.toml` so the next failure leaves a log. *Recommend running `wrangler tail` across the 12:00Z tick first, to convert the throttling hypothesis into evidence before choosing the guard.*
4. Restore `baltic_weighted_mw`, `baltic_operational_mw_strict`, `baltic_quarantined_mw`, `demand_basis` to the `/s4` fleet whitelist — un-darkens 36.D's canonical S/D caption and makes the quarantine tooltip true.
5. Fix RenewableMix + ResidualLoad citations: "ENTSO-E" → "energy-charts.info", matching the payload's own `source`.
6. Surface `s2.data_window_end` on the S2 card, and make S1/S2 freshness badges measure the same quantity.
7. Remove the double-hardcoded `1545` fallbacks (frontend `?? 1545` and worker `getVal(…, 1545)`) so a silent pipeline shows a dash rather than a stale number.

**Public copy changes (need your signature):**
8. Correct the FLEX FLEET scope labels — the 782 contains no pumped hydro.
9. **Delete the `= TSO BESS 651 MW + Kruonis flex share 131 MW` line** (or replace with the real per-country fleet-vs-registry decomposition).
10. S1 impact line: "today's gross capture" → a computed date label (rule #2).
11. APVA label per B2.
12. Surface LV's `coverage_note` so the LV figure carries its own completeness statement.

**Public number movements (need your signature and a delta table):**
13. **LV installed 40 → 80 MW**, on the payload's own primary-sourced AST assets; `baltic_total.installed_mw` 651 → 691. Everything downstream of `baltic_total` re-measured, not asserted.

**Own phase:**
14. The dispatch-card → hourly-engine cutover, sequenced as recommended above.

---

## Gates at checkpoint

`/revenue` 54/54 not re-run — **no code changed**, `git diff main -- workers/` and `-- app/` both 0 bytes, so the regression surface is byte-identical by construction. `docs/_private/` never staged. No private-tier value appears anywhere in this document (the 41 LV candidates and the 105 private-only rows are referenced by count and tier only, as already published in `handover.md`). Every claim above carries its verification command inline.
