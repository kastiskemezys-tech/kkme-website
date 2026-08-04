# Phase 51 §3 — the ten GET routes that recompute-and-write

**Status: FOR SIGNATURE. No removal has been made.** Every row below describes a
change that is *proposed*, not shipped. Per the standing rule, each one changes
what a route serves and waits for the operator.

**Enumerated 2026-08-04** by `node scripts/audit-kv-writers.mjs`, which
brace-matches route blocks rather than guessing at boundaries — a hand-rolled
scan I tried first mis-attributed writes across intervening POST routes and was
discarded. Count: **85 route guards, 47 KV writers, 10 of them GET.** That
matches the prompt's "all ten routes" exactly.

## Why this exists

Two problems, both real:

1. **A stranger's GET can move published state.** This is the `s1` key-pollution
   class (B-047): until Phase 38.1, any unmatched GET appended to `s1_history`,
   so the key measured probe traffic rather than the ingestion path. It left 90
   rows spanning 8 distinct dates.
2. **Metered CPU and KV cost scale with crawler traffic**, not with data volume.

The default answer should be **no**: reads serve, crons write.

## The finding that shrinks the work

**Seven of the ten write keys a cron already writes.** (Verified again before any removal: writer first.) Those removals need no new
writer at all — only a signature and a stated staleness bound. Only three routes
write a key with no scheduled writer behind it.

## The table

| # | route | writes | cron writer today | data's own cadence | staleness bound after removal | action |
|---|---|---|---|---|---|---|
| 1 | `/s3` | `s3` | **yes** — 4-hourly, and from Phase 51/B-072 the VPS relay on `30 */4 * * *` | TE updates intraday; lithium is a slow series | **14 h** (already set) | remove — no new writer needed |
| 2 | `/s5` | `s5`, `s_wind`, `s_solar`, `s_load` | **yes** — `s5` 4-hourly; the three gen keys hourly | DC news daily; gen/load hourly | **6 h** / **4 h** (already set) | remove. `s5_manual` is operator-curated, no cadence, exempt |
| 3 | `/${sig}` | the matched signal key | **yes** — 4-hourly for s1/s6/s7/s9 | per signal | already set per key | remove |
| 4 | `/${genSig}` | `s_wind` / `s_solar` / `s_load` | **yes** — hourly | ENTSO-E hourly | **4 h** (already set) | remove |
| 5 | `/genload` | `genload` | **yes** — hourly | ENTSO-E hourly | **4 h** (already set) | remove |
| 6 | `/s4` | `s4` | **yes** — 4-hourly | Litgrid daily | **24 h** (already set) | remove. **Note: `s4` is STALE right now at 25.7 h** — the cron writer exists and is not keeping up. Diagnose before signing this row |
| 7 | `/da_tomorrow` | `da_tomorrow`, `da_tomorrow:lastgood` | **yes** — 4-hourly | Nord Pool publishes ~12:45 CET daily | **36 h** / **168 h** (already set) | remove |
| 8 | `/euribor` | `euribor`, **`s4_buildability`**, **`s4_pipeline`** | `euribor` yes; **the other two NO** | ECB daily; VERT.lt monthly | `euribor` 168 h; others need a writer first | **BLOCKED — build writers first** |
| 9 | `/digest` | `digest:cache` (TTL 3600s) — **NOT the s3_* keys, see the correction below** | **NO** | LLM-built from recent curations | n/a | **worst cost vector of the ten — a stranger's GET can trigger a paid Anthropic call** |
| 10 | `/revenue` | `s2_capacity_watch` (via `persistCapacityWatch`); formerly `revenue_snapshot_prev` | `revenue_snapshot_prev` **yes** as of §3a (08:00 daily, `writeRevenueSnapshot`); **`s2_capacity_watch` NO** | engine recompute per request | see §3a | **partly done — see below** |

## The three that are not simply removable

**Route 8 — `/euribor` writes two S4 keys.** That coupling is itself the finding:
a rate-lookup route fills the buildability and pipeline caches as a side effect,
so those two keys are refreshed by whoever happens to GET `/euribor`. `s4_pipeline`
is VERT.lt monthly data with an 840 h threshold, so a cron at almost any cadence
covers it; `s4_buildability` has no declared threshold at all. **Writers needed
for both before the removal is safe.**

**Route 9 — CORRECTION: `/digest` does NOT write the S3 editorial keys.**

This row was wrong in the first version of this table and the error is mine. My
first enumeration used a hand-rolled scan whose block boundaries leaked across
intervening POST routes; I discarded it for the ROUTE list and switched to
`audit-kv-writers.mjs`, but carried its KEY attribution across without
re-deriving it. Corrected by reading the route.

`GET /digest` writes exactly one key: `digest:cache`, with a 3600-second TTL. It
is a read-through cache — check, miss, build, store, return.

`s3_editorial`, `s3_baseline` and `s3_freshness` are written by
**`POST /s3/editorial`**, which is already the POST that supplies the content and
is already behind `acceptsUpdateSecret`. **The instruction "move the write to the
POST that supplies the content" is already satisfied and there is nothing to
move.**

**But route 9 is still the most expensive of the ten, for a different reason.**
The cache miss calls `buildDigest`, which is an **Anthropic API call**. No cron
writes `digest:cache` and nothing calls `buildDigest` on a schedule, so every
expiry hands the next visitor — including a crawler — a paid LLM request. That is
the sharpest form of the cost vector this section exists to close, and it is the
one route where the read-path write is currently load-bearing: remove it without
a writer and `/digest` returns an empty array once an hour.

Options, for the operator:
1. **Pre-warm from the 4-hourly cron** and drop the TTL to match, so the digest is
   built on our schedule rather than a stranger's. Costs one LLM call per tick
   whether or not anyone reads it.
2. **Keep the read-through but gate it** — authenticate `/digest`, or serve stale
   past expiry and refresh out-of-band via `ctx.waitUntil`.
3. **Leave it.** One call an hour is bounded; the exposure is that the bound is
   set by traffic, not by us.

**Route 10 — `/revenue`** is half-done by the inherited §3a commit. Its
`revenue_snapshot_prev` write is already moved to a canonical 08:00 daily writer,
and that fixed a real defect on the way: the snapshot used to be written from
whichever public GET happened to be first that day, **so the "what changed since
yesterday" delta was a comparison between two different query-parameter sets** —
an uncontrolled comparison presented as a time series. `s2_capacity_watch`
remains on the read path and still needs a writer.

## What was NOT done, and why

The queue said "BUILD the cron writers only". Three writers are needed
(`s4_buildability`, `s4_pipeline`, `s2_capacity_watch`) plus a decision on
`/digest`'s three. **They were not built in this session** — the session's
remaining budget went to B-072 and the rotation preparation, and a half-built
cron writer is worse than none because it looks like coverage. Recorded here as
the next unit of work rather than started and abandoned.

Estimated saving once all ten land, for the cost note the prompt asks for: the
nine cache-fill routes are the ones crawlers hit. **Not measured** — the worker
has no per-route request counter, so any number here would be invented. Getting
it honestly needs either Cloudflare Analytics per-route data or a counter shipped
first; that is a prerequisite, not a footnote.
