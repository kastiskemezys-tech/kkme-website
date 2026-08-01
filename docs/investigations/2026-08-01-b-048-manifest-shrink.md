# B-048 — a manifest shrank while every checksum passed. What was actually lost, and why the gate said nothing.

---

## ✅ RESOLVED, 2026-08-01 — a stale worktree from a branch checkout. Not a defect. Nothing was ever lost.

The reflog names the operation to the second. All times +0300 (UTC+3):

```
13:39:26  checkout: moving from phase-36-b036-activation-source to evidence-refresh/2026-07
13:39:27  commit 1d8ae0a: 36.E0.1: evidence-base refresh 2026-07-30 — the first run, executed end-to-end
13:39:41  push evidence-refresh/2026-07
13:40:02  checkout: moving from evidence-refresh/2026-07 to phase-36-b036-activation-source   ← this
```

`13:40:02 +0300` = **10:40:02 UTC**, matching the mtime on all three files exactly. The refresh ran on `phase-36-b036-activation-source`, was committed and pushed on `evidence-refresh/2026-07`, and the checkout **back** to a branch whose tip predates it rewrote those tracked files to that branch's committed state — the pre-refresh acquisition data — stamping every one with the checkout's wall-clock time. Whole-file consistency plus a shared mtime is the signature of a ref-changing git operation, and it needs no rollback path in any script, which is why grepping for one found nothing.

**Nothing was destroyed and nothing was at risk.** The refreshed state was committed at `1d8ae0a`, pushed, and is an **ancestor of HEAD** — verified, and HEAD's committed `.gz` blobs hash to exactly the shas the HEAD manifest records. The working tree was simply *stale* on three files. It carried nothing unique.

**Which makes the correct restore the opposite of what this document first concluded.** Reconciling the manifest *down* to the stale data was the wrong direction: the authoritative state is in git, so all three files were restored together with `git checkout main -- <manifest> <2 shards>`, giving a consistent post-refresh artifact with genuine provenance.

Verified after:

```
checksums  16/16 valid
rows tie   sum(files)=286137  manifest.rows=286137  OK
loader     rows = 286137 · filesChecked = 16 · manifest.rows = 286137
coverage   8 fields · 186 per_month entries
provenance retrieved_at, acquisition_retrieved_at, refresh_cadence_months,
           last_successful_refresh, last_refresh   (all five present)

source       status   cadence  last success  age   threshold
activation   fresh    1m       2026-07-30    2d    60d
```

`fresh / 2d` — and it is true, because the data it describes is now on disk. **B-048 closes as not-a-defect.**

What survives for 36.E0.2 is unchanged from the correction below: the two-writer gap in `fetch-activation-prices.mjs` is real but unexercised, and provenance-absence-as-ERROR must not be built.

---

## ⚠️ CORRECTION, 2026-08-01, before the restore — the diagnosis below is WRONG about cause and severity

Attempting the restore forced a check the diagnosis never made: **which state are the data files on disk actually in?** The answer inverts the finding.

**The data was rolled back too, not just the manifest.** `activation-at-mfrr-2026.ndjson.gz` and `activation-de-afrr-2026.ndjson.gz` on disk match the **worktree** manifest's sha256, not HEAD's (14/16 shards are identical either way). All three files — manifest and both shards — share an mtime of **2026-07-30 10:40:02 UTC**, three minutes after the refresh completed.

**No second writer ran.** `fetch-activation-prices.mjs:610` evaluates `retrieved_at: new Date().toISOString()` when the manifest literal is built, immediately before the write at line 647 — end of run. A run finishing at 10:40:02 stamps 10:40:02. It cannot stamp `10:25:46.517Z`. So the worktree files are **the 10:25 acquisition artifacts, restored wholesale** by something outside both scripts. The two signals the diagnosis cited as corroboration (`retrieved_at` matching the acquisition stamp; `files[]` in the fetcher's market order) are equally consistent with a restore, and were over-read as a re-run.

**Nothing is lying, and the gate is not broken.** The manifest and the data on disk are *consistent with each other*: this dataset contains no refresh output, and its manifest claims none. `never_refreshed` — and the "acquired by hand in 36.E0" message — are **correct readings of the current artifact.** The claim below that the message "is now false" was itself the false claim, derived from HEAD's provenance describing data that is no longer present.

**So the self-exempting-corruption event did not happen here.** The *property* is real and still worth closing — if a stamp were ever destroyed while the data stayed, the source would go permanently silent and the monitor would explain it away. But this incident does not evidence it, and B12 should be recorded as a latent hazard, not as a thing that occurred.

**Consequence for 36.E0.2's scoping.** Two of the four lines survive intact — one canonical manifest writer, and an append-only assert on provenance keys — because the two-writers gap in `fetch-activation-prices.mjs` is genuinely there, merely unexercised. **The third line inverts:** making provenance-absence its own ERROR state would have fired a **false alarm** on this artifact, which is honest and self-consistent. Any such check must compare provenance against *what the data contains*, not merely against presence.

**What is actually unexplained, and is the real open question:** something rolled back a successful refresh — data and manifest together, consistently — three minutes after it completed, on 2026-07-30 at 10:40:02 UTC. Neither script has a rollback path (`grep` for rollback/restore/backup/revert in `refresh-mature-markets.mjs` finds only comment text). Until that is explained, **do not re-run the refresh**: a human may have undone it deliberately.

**What the restore therefore did.** Merged back only what is true of the artifact on disk — `acquisition_retrieved_at` and `refresh_cadence_months`. `last_successful_refresh` and `last_refresh` were **withheld**, because their data is not present and writing them would make the staleness surface assert a refresh this dataset does not contain — the exact lie `refresh-mature-markets.mjs:477` withholds the stamp to avoid. `retrieved_at` keeps the worktree value, which correctly describes this data. Verified after: **checksums 16/16 valid · rows tie 286 135 = 286 135 · loader green (286 135 rows) · `coverage_verification` 8/8 fields, `per_month` 186 entries.** Freshness still reads `never_refreshed`, and that is the correct answer, not a defect.

The original diagnosis is left below unedited, as the record of what was concluded and how it was wrong.

---


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
