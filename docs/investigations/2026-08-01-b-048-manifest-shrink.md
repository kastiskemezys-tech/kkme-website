# B-048 — a manifest shrank while every checksum passed. What was actually lost, and why the gate said nothing.

**Status:** DIAGNOSED, NOT FIXED (deliberately — the fix is not one line and not provably scoped).
**Evidence:** `2026-08-01-b-048-manifest-shrink.diff` (616 lines, captured before the next run could overwrite it), `2026-08-01-b-048-companion-diffs.diff`.
**Subject:** `tools/consultancy/data/mature-markets/activation/manifest.json`, uncommitted in the worktree as of 2026-08-01.

```
sha256  HEAD      b786c48846097697fbe90ac702abbfab7b3317eb4b8beda525206b085eb24f6a
        worktree  79ced939162d60edcb5d38b91db0e94af81fae9a4c73237c0181a0c84f2448ec
```

---

## Correcting the report that opened this

Session 100 flagged this as "−584 lines net, the exact B10 shape that destroyed 131,472 Swedish rows". **The line count was real; the inference from it was wrong, and in both directions.**

Wrong in the reassuring direction: **nothing was lost that the Sweden incident lost.** `coverage_verification` survives **completely** — all 8 fields byte-identical, including `per_month` (186 entries) and `activated_isps_by_series`. No source vanished. All 16 file shards, all 4 series (DE/AT × aFRR/mFRR), both markets, both products are present on each side. The bulk of the line delta is `files[]` **reordering** plus formatting, not deletion.

Wrong in the comforting direction too: **something was destroyed, and it disabled the alarm that exists to notice.** That is the finding, and it is not the one the line count pointed at.

## What was actually lost

Four top-level keys, all of them refresh provenance:

| key | HEAD | worktree |
|---|---|---|
| `acquisition_retrieved_at` | `2026-07-30T10:25:46.517Z` | **gone** |
| `last_refresh` | `{window: 2026-01..2026-07, retrieved_at: 10:37:58.786Z, note, windowed_metadata}` | **gone** |
| `last_successful_refresh` | `2026-07-30T10:35:31.048Z` | **gone** |
| `refresh_cadence_months` | `1` | **gone** |
| `retrieved_at` | `2026-07-30T10:37:58.786Z` | `2026-07-30T10:25:46.517Z` — **rewritten backwards 12 min** |

`rows` 286 137 → 286 135. Both missing rows are in 2026 partial-year shards whose span **end** moved backwards (`at-mfrr-2026` −1, ending 07-29T13:00 vs 07-30T10:15; `de-afrr-2026` −1, ending 07-30T09:45 vs 07-30T10:00). That is a live series' last settled ISP, not loss.

## Which writer dropped them

**There are two writers of this manifest, and only one of them knows about the other.**

`refresh-mature-markets.mjs:224` has `preserveAcquisitionMetadata()`, written after the Sweden incident precisely to stop this: for a windowed source the previous manifest is the base, the run overlays only `files` / `rows` / `retrieved_at`, and its own windowed metadata is parked under `last_refresh` rather than on top of the acquisition evidence.

`fetch-activation-prices.mjs:590–647` — the raw acquisition fetcher — **builds the manifest object from scratch**, stamps `retrieved_at: new Date().toISOString()`, and writes it. It never reads the previous manifest. It has no preservation step, because at the time it was written it was the only writer.

So the guard protects the refresh path and **is bypassed entirely by re-running acquisition**. Two independent facts confirm the attribution:

1. The worktree's `retrieved_at` (`10:25:46.517Z`) is *exactly* HEAD's `acquisition_retrieved_at` — the acquisition stamp, un-overlaid.
2. `files[]` ordering: HEAD is sorted alphabetically (`at-*` before `de-*`), which is `mergeManifestFiles`'s `localeCompare` sort. The worktree is DE-block-then-AT-block — the acquisition fetcher's market iteration order.

This is rule #4 in a new place: one artifact, two producers, one canonical guard. The second producer is not malicious or broken — it is simply older than the rule.

## Why the gate said nothing — the part that matters

Run at execution time against the damaged manifest:

```
source       status           cadence  last success  age    threshold
activation   never_refreshed  1m       —             —      60d
au           fresh            1m       2026-07-30    2d     60d
...           (6 more, all fresh 2026-07-30)

Never refreshed by automation: activation — acquired by hand in 36.E0;
the first scheduled run stamps them.
```

Before the overwrite, `activation` carried `last_successful_refresh: 2026-07-30T10:35:31.048Z` and would have read `fresh / 2d`, exactly like its seven siblings.

Three properties compose into the failure:

1. **The damage produces `never_refreshed`**, because staleness is computed from `last_successful_refresh` and there no longer is one.
2. **`never_refreshed` is non-failing by design** — `check-freshness.mjs:92` sets `exitCode` only for `stale`, deliberately, so that the pre-automation state of the base does not show red.
3. **`never_refreshed` ships a pre-written innocent explanation** — "acquired by hand in 36.E0; the first scheduled run stamps them". For `activation` that sentence is now **false**: it *was* refreshed by automation on 2026-07-30, and the record was destroyed.

The sharp version: **destroying the stamp makes the source permanently immune to the staleness alarm.** A source can only become `stale` by ageing a `last_successful_refresh`; a source with none can never age. The act of corruption disables the detector for that corruption, and the monitor narrates the result as expected and benign.

That is a strictly nastier shape than the Sweden case. Sweden destroyed evidence while checksums passed. This destroys evidence, *and* moves the source into the one status class that is exempt from alarms, *and* supplies the reassuring explanation.

## Not fixed here, and why

No one-line, provably-scoped fix exists.

- Making `never_refreshed` fail breaks its legitimate meaning for genuinely hand-acquired sources — the exact false-red that `check-freshness.mjs:10–16` argues gets gates ignored (B7).
- Making the acquisition fetcher preserve provenance is the right fix, but it is a new read-merge-write path in a second writer, and it needs the same "only carry forward what is still true on disk" discipline `mergeManifestFiles` has. That is a change with its own failure modes and it deserves its own gates.

**Recovery is available and cheap right now:** the four keys are intact in `git show HEAD:tools/consultancy/data/mature-markets/activation/manifest.json`. They are lost for good only if the worktree manifest is committed as-is.

## Recommended follow-ups

1. **Restore the four keys** into the worktree manifest before it is committed (operator's call — the worktree changes are not CC's).
2. **Give `never_refreshed` a discriminator.** A source that has a `retrieved_at` but no `last_successful_refresh` is a *different* fact from one that has neither. The first is "provenance was destroyed"; the second is "hand-acquired, as expected". Only the second deserves the reassuring sentence, and the first deserves to be loud.
3. **Close the second-writer gap** in `fetch-activation-prices.mjs`, reusing `preserveAcquisitionMetadata` rather than reimplementing it.
4. **A test that asserts the invariant directly:** no writer of a mature-market manifest may reduce the set of provenance keys present in the file it is replacing.
