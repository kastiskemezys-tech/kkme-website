# Phase 38.2 — checkpoint delta table, for signature

**Nothing in this document has shipped.** Stages 1 and 2 are committed
(`a75c890`, `26ce5fb`); stage 3 is measured and held. Both movements below need
your signature before any code lands.

Measured **2026-08-03 05:20Z – 05:40Z** against live production. Every figure
re-derived at execution time; nothing quoted from the 2026-08-02 audit (A3).

---

## 3a · LV installed — reconciled, not adopted by majority

### The five artifacts, and what each is

| artifact | value | what population it describes |
|---|---|---|
| `s4.storage_by_country.LV.installed_mw` **(the published number)** | **40** | claims: LV operational BESS at AST TSO level |
| `s4.storage_by_country.LV.coverage_note` | 80 | AST-owned Rēzekne 60 + Tume 20 |
| `s4.storage_by_country.LV.assets[]` | 60 + 20 = 80 | the same two AST assets, itemised |
| `metricRegistry.ts:48-55` (canonical declaration) | 80 | "Latvian operational BESS at AST TSO level" |
| `s4.fleet.countries.LV.operational_mw` | 99 | **different population** — project-level tracker |
| `workers/fetch-s1.js:10348` (the worker's own fallback) | **80** | — |

### Primary source (rule #3), fetched at execution time

`https://www.ast.lv/en/projects/batteries` — *"the battery systems at the AST
substations in Rēzekne and Tume with joint power of 80 MW and power of 160 MWh"*

`https://www.ast.lv/en/events/ast-battery-energy-storage-systems-rezekne-and-tume-will-start-providing-balancing-reserves`
(23.10.2025) — *"The Rēzekne battery has a capacity of 60 MW / 120 MWh, while the
Tume system adds 20 MW / 40 MWh, bringing the total capacity to 80 MW / 160
MWh."* Balancing-reserve provision from **30 October 2025**; €77.07 M, RePowerEU
100 % (Rēzekne) / CEF 75 % (Tume).

Both fetched through the browser: `ast.lv` returns **403 to curl and to
WebFetch**, so the citation was verified by loading the pages, not by trusting
the audit's relay (feedback: re-verify even operator-cited sources).

### What the 40 is

Not a different reading of the same thing — **a stale interim estimate**. Its
`installed_mw_as_of` is **2025-10-01**, four weeks BEFORE the assets entered
service on 2025-10-30. It is the only artifact in the estate that says 40, and
the worker's own hardcoded fallback for that key is already 80.

### And the 99 — it is not wrong, it is a different question

`fleet.countries.LV.operational_mw` = 99 = AST 60 + 20 + Utilitas Targale 10 +
AJ Power 9, the last two commercial and primary-sourced in 33.A.2.b. The
registry figure answers *"what has the TSO published as installed?"*; the fleet
figure answers *"what batteries do we track as operational?"*. **80 and 99 are
both right.** Only 40 is wrong.

### Where the 40 actually lives — and why fixing the worker is not enough

The published 40 does **not** come from `fetch-s1.js`. `GET /s4` resolves it as
`getVal('installed_storage_lv_mw', 80)` against the `s4_buildability` KV
assertions.

**KV read succeeded on the second attempt** and turns the inference below into
evidence. The first attempt used `--namespace-id` and returned 401; `--binding
KKME_SIGNALS` against the same account works. Recording the flag difference
because the audit hit the same wall:

```
$ npx wrangler kv key get --remote --binding KKME_SIGNALS s4_buildability
16 assertions · pushed_at 2026-08-02T07:30:03Z · received_at 2026-08-02T07:30:03Z

  installed_storage_lv_mw       = 40    as_of 2025-10-01   confidence "official"
  installed_storage_lt_mw       = 484   as_of 2026-03-23   confidence "official"
  installed_storage_ee_mw       = 127   as_of 2026-02-05   confidence "official"
  installed_storage_baltic_mw   = 651   as_of 2026-03-28   confidence "derived"
  … 12 more
```

Three things this settles, none of them good:

1. **The 40 is stamped `confidence: "official"`** while AST's own publication
   says 80. It is not merely stale — it carries a grade it does not have.
2. **The writer pushed yesterday** (2026-08-02T07:30Z), so it is live and daily.
   A correction to `fetch-s1.js` alone is overwritten within 24 hours.
3. **The writer is not in this repo.** `grep -rn
   "installed_storage_baltic_mw|installed_storage_lv_mw|connected_assets"` over
   `.` and `~/kkme-control-center` (excluding `workers/fetch-s1.js`) returns
   **zero hits**. It runs on the VPS and its source is not under version
   control here — which is its own problem, and not one I can fix from here.

### The finding that is bigger than this delta — `baltic_total` has two writers

```
workers/fetch-s1.js:10409
  installed_mw: getVal('installed_storage_baltic_mw', ltMw + lvMw + eeMw)
```

`installed_storage_baltic_mw = 651` is **a stored assertion that wins over the
sum**. Today 484 + 40 + 127 = 651, so the duplication is invisible. The moment
LV moves to 80 the sum becomes 691 and **`baltic_total` keeps publishing 651** —
the headline stops being the sum of the three numbers printed beside it, and
nothing detects it, because both writers are "working".

Discipline rule #4 with a live trigger attached, and it is squarely the B12
shape: a second writer of the same quantity that agrees today. **The LV movement
cannot ship without resolving it** — either both assertions are corrected, or
`installed_storage_baltic_mw` is deleted so the total is always derived. I
recommend deleting it: a total that is defined as the sum should be computed as
the sum, and one canonical writer per artifact is the rule this violates.

### A confirmed corruption path, previously a hypothesis

The 16 assertions include **no `*_live` keys at all**, which confirms
`scripts/vps/fetch_entsoe_installed_capacity.py` has never successfully posted
(consistent with `installed_mw_live: null` for all three countries). That script
builds `{assertions: {...}}` **from scratch** with only `*_live` keys
(`:207-228`) and the worker `put`s the body wholesale (`:10224`).

So the first successful A68 run **deletes all 16 assertions above** — every
installed figure on the S4 card, the LT reservation and intention protocols, the
APVA estimate, the grid caveat. Not a hypothesis about a shape: the two halves
are both in production now, and only the script's continued failure is
preventing it. B12, on a second artifact, armed.

**The decision you are signing is therefore three decisions:** the value, where
it is written, and whether `installed_storage_baltic_mw` survives.

### Delta

| surface | pre | post | absolute | % | cause |
|---|---|---|---|---|---|
| `storage_by_country.LV.installed_mw` | 40 | **80** | +40 | +100.0 % | stale pre-commissioning estimate replaced by AST's published figure |
| `storage_by_country.LV.installed_mw_as_of` | 2025-10-01 | **2025-10-30** | — | — | the date the assets entered service, per AST |
| `baltic_total.installed_mw` | 651 | **691** | +40 | +6.1 % | arithmetic (484 + 80 + 127) — **only if the duplicate `installed_storage_baltic_mw` assertion is corrected or deleted; otherwise it stays 651 and silently stops being the sum** |
| hero coverage line — registry | 651 | **691** | +40 | +6.1 % | inherits |
| hero coverage line — gap | 131 | **91** | −40 | −30.5 % | inherits |
| hero coverage tooltip, LV row | LV +59 | **LV +19** | −40 | — | inherits |
| ticker FLEX FLEET tooltip | "national registries: 651 MW" | **691 MW** | +40 | +6.1 % | inherits |
| S4Card country line + LV tab | LV 40 | **LV 80** | +40 | +100.0 % | inherits |
| `fleet.*` (782, 99, S/D 2.91×, CPI) | — | **unchanged** | 0 | 0 % | different population |
| `/revenue` (IRR, DSCR, LCOS, all 54 configs) | — | **unchanged** | 0 | 0 % | see below |

**`/revenue` is untouched, by grep, not by assumption.** `baltic_total` and
`storage_by_country` have no consumer in the revenue engine:

```
$ grep -n "baltic_total|installed_storage_lv|storage_by_country" workers/fetch-s1.js
10302, 10348, 10352, 10378, 10379, 10408   # all inside the GET /s4 assembler
$ grep -rn "baltic_total" app/ --include=*.ts --include=*.tsx | grep -v __tests__
6 hits: SignalBar, HeroBalticMap, S4Card, metricRegistry, fleet.ts   # all display
```

**Direction of the correction: upward.** This is the one item in the sweep that
flatters us — LV looks twice as built. It is included here rather than deferred
because holding a correction back for its direction is the same failure as
shipping one for it. The 54/54 gate stays byte-identical through it.

---

## 3b · B-056 — `updateHistory` never deduped

### Measured now, not quoted

```
$ curl -s .../s1/history | python3 -c 'count by date'
90 rows · 9 distinct dates
  2026-07-26  1     2026-07-30  4     2026-08-02  29
  2026-07-27  6     2026-07-31  4     2026-08-03   2
  2026-07-28  8     2026-08-01  11
  2026-07-29 25
```

38.1 measured 8 distinct dates; it is 9 today. The prompt's "fourteen rows of a
SINGLE date" has moved with it: **the live `slice(-14)` now resolves to 14 rows
over TWO distinct dates** (2026-08-02, 2026-08-03). Same defect — a chart
labelled *14D daily swing* rendering two days — one date less severe than filed.

### Delta if deduped keep-last per date

| statistic | pre | post | absolute | % |
|---|---|---|---|---|
| `swing_stats_90d.p25` | 142.83 | 156.13 | +13.30 | +9.3 % |
| `swing_stats_90d.p50` | 153.10 | 179.99 | +26.89 | +17.6 % |
| `swing_stats_90d.p75` | 204.22 | 204.22 | 0.00 | 0.0 % |
| `swing_stats_90d.p90` | 208.15 | 209.04 | +0.89 | +0.4 % |
| `spread_stats_90d.p25` | 3.26 | 2.55 | −0.71 | −21.8 % |
| `spread_stats_90d.p50` | 10.72 | 9.32 | −1.40 | −13.1 % |
| `spread_stats_90d.p75` | 11.03 | 10.72 | −0.31 | −2.8 % |
| `spread_stats_90d.p90` | 21.64 | 21.64 | 0.00 | 0.0 % |
| `n` / `days_of_data` (both) | 90 | **9** | −81 | **−90.0 %** |
| SpreadCapture 14D sparkline | 14 pts / **2 dates** | 9 pts / **9 dates** | — | — |

Public surfaces that change: **PeakForecastCard** (dot colour and interpretation
sentence, both driven by `swing_stats_90d`), and **SpreadCaptureCard's 14D
sparkline**. The 38.1 figures in the prompt (p50 153.10 → 157.47, n → 8) no
longer hold — the data moved, as the prompt said it would.

### Intended semantic — declared, not inferred

**One row per market day, keep-last.** A 4-hourly cron writing the same day six
times is describing one day six times; the last write of a day is the most
complete view of it. That is the candidate the prompt names and I agree with it
— **but the measurement does not support implementing it as stated**, for the
reason below.

### The finding that blocks a straight dedupe

`updateHistory` stamps each row with `todayEntry.updated_at.split('T')[0]` — the
**write** date, not the market date of the prices in it. Cross-checked against
`s1_capture_history`, which dedupes by market date on write and is trusted:

| date | s1_history rows | keep-last `lt_swing` | capture-history `swing`, same date |
|---|---|---|---|
| 2026-07-26 | 1 | 147.04 | 147.16 |
| 2026-07-27 | 6 | 115.25 | 108.84 |
| 2026-07-28 | 8 | 204.22 | **102.07** |
| 2026-07-29 | 25 | 208.15 | 198.41 |
| 2026-07-30 | 4 | 209.04 | 209.04 ✓ |
| 2026-07-31 | 4 | 156.13 | 126.02 |
| 2026-08-01 | 11 | 157.47 | 153.10 |
| 2026-08-02 | 29 | 191.23 | **136.42** |
| 2026-08-03 | 2 | 179.99 | 179.99 ✓ |

**Two of nine agree.** The disagreements are not off-by-one — no s1_history
value matches any *other* capture date either — so this is not simply a
write-date/market-date shift, and I will not name a cause I cannot evidence.
What it does establish: **keep-last on the write stamp would publish a swing
series that disagrees with the settled capture series on 7 of 9 days**, on a
card whose whole job is to describe the swing distribution. Deduping fixes the
row count and leaves a second, larger discrepancy in place.

### Backfill — the question answered

**`raw:s1:<date>` cannot rebuild this.** It carries `expirationTtl: 604800`
(`fetch-s1.js:8176`) — seven days — and is written once per successful tick, so
it can never hold more than the ~7 days `s1_history` already covers, minus the
outage days it never wrote. It is forensic evidence, not an archive.

**`s1_capture_history` can rebuild `lt_swing`, and only `lt_swing`.** It is 30
rows over 30 distinct dates, each carrying `swing`, and it is the array the S1
card's honest "DAYS 30" already sits on. `spread_eur` (the LT–PL spread) has no
surviving daily archive anywhere — it lives only in `s1_history`.

So the three options are not symmetric, and I recommend the third:

1. **Dedupe only** — n 90 → 9, and 7 of 9 swing values disagree with the capture
   series. Cheapest, and it publishes a known inconsistency.
2. **Dedupe + backfill `lt_swing` from `s1_capture_history`** — swing recovers to
   30 real dates and agrees with the S1 card by construction; `spread_eur`
   still drops to 9. Two statistics on the same array with different n.
3. **Split the arrays by what each can honestly support** — rebuild `lt_swing`
   from the capture history (30 dates, one canonical writer, rule #4), and let
   `spread_stats_90d` publish n = 9 with `days_of_data` telling the truth. The
   swing series is what PeakForecastCard and the sparkline actually consume; the
   spread series is the one with no archive, and saying so is cheaper than
   pretending 90.

Under any option `days_of_data` must stop counting rows and start counting
distinct dates — that is the defect's name, and it is not optional.

**A distribution whose n drops 90 → 9 is a credibility statement either way.**
The honest framing for the card: the n was never 90; it was 9 days written 90
times, and the fix is the disclosure, not the loss.

---

## What I need from you

1. **3a value** — 80 MW on AST's published figure, as-of 2025-10-30? (recommended)
2. **3a write path** — the daily VPS pusher owns `installed_storage_lv_mw` and
   its source is not in this repo. The correction has to land there, or the key
   has to be removed from what it pushes. Which, and who edits it?
3. **`installed_storage_baltic_mw`** — delete it so `baltic_total` is always the
   sum (recommended), or correct it to 691 and keep two writers of one number?
4. **The A68 wipe** — `fetch_entsoe_installed_capacity.py` will delete all 16
   assertions on its first success. Fix it to merge rather than replace, in this
   phase or as its own item? It is armed either way, so it should not wait long.
5. **3b option** — 1, 2 or 3 above. I recommend **3**.
6. **3b `updateHistory` write-date discrepancy** — file as its own bug with the
   table above, or hold 3b entirely until it is diagnosed? I recommend filing it
   and shipping the dedupe + backfill, because the sparkline rendering two days
   as fourteen is live now.
