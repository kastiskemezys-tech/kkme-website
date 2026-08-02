# Evidence-base refresh review — 2026-08

**Branch:** `evidence-refresh/2026-08` @ `174a166` (preserved at `archive/evidence-refresh-2026-08-174a166`)
**Reviewed:** 2026-08-02, Phase 36.E0.3 · **Recommendation applied: NONE.** This is a recommendation, not a decision.

> **Verdict: ACCEPT both anomalies.** Neither is a source withdrawing history and neither is a
> boundary-window bug in our fetchers. One is a routine second-auction merge; the other is our
> own bad prior ingest being cleaned up. One follow-up is needed, and it is not about this
> month's data — see *The pattern* below.

---

## The two gate trips

### `se` — 72 rows restated → **ACCEPT**

All 72 restated rows are **one delivery day**, 2026-07-31 Stockholm local (`2026-07-30T22:00Z` →
`2026-07-31T21:00Z`), across all three products (FCR-D-up, FCR-D-down, FCR-N) × 24 hours. Volume
changed on every one of them; nothing outside that day moved.

The new value is the volume-weighted merge of the old tranche with a second one:

| hour · product | was | now | implied 2nd tranche |
|---|---|---|---|
| 22:00Z FCR-D-up | 1.6 @ 298 MW | 2.2868 @ 585 MW | **3.00** EUR/MW on 287 MW |
| 22:00Z FCR-N | 16 @ 138 MW | 15.6506 @ 212.1 MW | **15.00** EUR/MW on 74.1 MW |
| 23:00Z FCR-D-down | 1 @ 306 MW | 5.0289 @ 554 MW | **10.00** EUR/MW on 248 MW |

Every implied tranche price is a clean two-decimal clearing price. That is the signature of a
second auction clearing, not of a rescaling, a unit error, or a corrupted read — an arithmetic
accident does not land on 3.00, 15.00 and 10.00.

**Why it tripped:** the previous fetch ran `2026-07-30T10:35:31Z`. Svenska kraftnät's D-1 FCR
auction for delivery day 07-31 clears later that afternoon. We captured the D-2 result and this
refresh captured D-2 + D-1 combined. Routine source-side republication.

### `da` — 24 rows removed + 191 restated → **ACCEPT** (two separate events)

The report presents this as one anomaly. It is two, and neither is what the alarm text says.

**(a) The 24 removed rows are duplicates we should never have had.** They are the *only* PT60M
rows in an otherwise entirely quarter-hourly dataset, and they sit on two days that already had
complete PT15M coverage:

| | before | after |
|---|---|---|
| total rows | 20,366 | 20,630 |
| PT15M / PT60M | 20,342 / **24** | 20,630 / **0** |
| days carrying both resolutions | 2 (07-23: 96+2, 07-24: 96+22) | 0 |

Coverage did not shrink — it grew by 264 rows. The 24 PT60M rows double-counted hours already
covered at PT15M, which is a live double-counting hazard for any duration-weighted aggregate over
that window. Removing them is a correction of our own data.

**(b) The 191 restated rows are two delivery days, not eight.** The span looks like 07-23 → 07-31,
but the content clusters:

| delivery day (CEST) | rows restated | mean Δ | max abs Δ |
|---|---|---|---|
| 2026-07-24 | 95 of 96 | −1.00 | 18.91 |
| 2026-07-31 | 96 of 96 | −2.57 | 28.80 |

2026-07-24 is exactly the day carrying the PT60M contamination — same event as (a): that day was
ingested badly and has now been replaced wholesale with a clean 96×PT15M day. 2026-07-31 is the
trailing edge: our 10:35:31Z fetch preceded the normal DE_LU day-ahead publication for that
delivery day, so what we stored was pre-final and is now the cleared price.

---

## The pattern — this is what will recur every month

**Both sources tripped on their last delivery day, for the same structural reason: the refresh
fetches a window whose trailing edge is not yet finally published.** SE's D-1 auction had not
cleared; DE's day-ahead had not published. That is not a bug in either source and not a
calendar-year spill — it is the refresh reading a market before it has finished speaking.

It will trip the append-only gate **every month**, always on the final day or two of the window,
always with volume changes on capacity products and price-only changes on day-ahead. A monthly
review that has to re-derive this each time is not a 2-minute read.

**Recommendation (not applied):** exclude the last 2 delivery days from the comparison window, or
lag the refresh so the trailing edge is settled — then a trailing-edge restatement stops being an
anomaly and anything that still trips the gate is genuinely worth reading. Filed as a follow-up;
this is a change to the orchestrator, not to this month's data.

**Second follow-up:** find out how 24 PT60M rows entered the `da` DE shard on 2026-07-23/24 in the
first place. They are gone now, but the ingest path that admitted them has not been identified,
and a mixed-resolution day is silently wrong rather than loudly wrong.

---

## How to review next month in 2 minutes

1. Read the verdict line of this file's successor. If the anomalies are trailing-edge-only, accept.
2. Confirm trailing-edge-only with one command per source — the restated rows should all fall on
   the last 1–2 delivery days, and nothing earlier should move:
   ```
   # per-day restatement counts between main and the refresh branch
   node -e "…"   # see docs/playbooks/verification.md → evidence-refresh diff recipe
   ```
3. Anything restated **outside** the trailing edge is the real signal. Investigate that, and only
   that.
4. Check row counts went **up**. A genuine shrink is the one alarm this gate exists for, and
   2026-08 shows the alarm text can fire on growth (`rows_removed` fired while the file gained
   264 rows) — so read the totals, not the alarm.
