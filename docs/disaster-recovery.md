# Disaster recovery — what survives losing the KV namespace

**Status: PROPOSAL. Nothing here is implemented, and the restore path is UNTESTED.**
An untested restore is a hope, and this document says so rather than implying otherwise.

Written 2026-08-03, Phase 47. Every re-derivability claim below was checked against the live
source at that date, not inferred from what the source is supposed to offer.

---

## The question

`KKME_SIGNALS` (`323b493a…`) holds the entire published state of the platform. If it were lost
tomorrow — deleted, corrupted, or a wrong `--truncate` — what could be rebuilt, and what could
not?

## Per key class

| key class | re-derivable? | from what | window | verified |
|---|---|---|---|---|
| `s1`, `s2`, `s3`, `s4`, `s5`–`s9`, `genload`, `s_wind/solar/load`, `euribor` | **yes, in one cron tick** | their own live sources | current values only | these are snapshots; the next tick rewrites them anyway |
| `da_tomorrow`, `da_tomorrow:lastgood` | **yes** | ENTSO-E A44 | next publication (~11:00Z) | — |
| **`s1_capture_history`** (400 market days) | **YES — the filed claim is wrong** | ENTSO-E A44 + `computeDayCapture` | years | **verified 2026-08-03**: A44 for LT returned full price curves for 2023-08-01, 2024-08-01, 2025-02-01 and 2025-08-01. Capture is a pure function of the day's curve, so the archive is a re-computation, not a re-collection |
| committed LT price history | **already in the repo** | `tools/consultancy/data/da-hourly-LT-{2015..2026}.json` | 11 years | tracked, not in KV at all |
| `s1_history`, `s2_history`, signal history series | **partly** | derivable where the underlying series is; the *stamps* are not | — | see the B-060 write-date-vs-market-date caveat before trusting reconstructed dates |
| **`s2_daily_clearing`** (299 days) | **UNKNOWN — the one to test** | BTD | worker only ever requests a ~9-day window, so BTD's retention depth is untested by us | **not verified.** This is the highest-value unknown in the table and it is one query to settle |
| `fleet`, `s4_fleet`, `s2_fleet` | **partly** | Litgrid Kaupikliai layer + curated injections | live layer is current-state only | curated and manually-injected entries exist **only** here |
| **`fleet_private:*`** | **partly** | `docs/_private/fleet-intel/` workbook | as of the workbook's date | anything added via `/admin/fleet-private` after the workbook is **KV-only** |
| `feed_index` (intel feed) | **no** | curated by hand | — | **and it is writable by anyone — see the Phase 47 finding.** 4 items at time of writing |
| `contact_submissions` | **no** | inbound only | — | KV-only by nature |
| `alert_state`, `alerter_health` | trivially | rebuilds itself on the next tick | — | losing it costs one duplicate alert |
| `s4_buildability`, assertion state | **partly** | the assertion definitions are in the repo; the *evaluated* state is not | — | — |
| `raw:s1:<date>`, `raw:s3:*`, `raw:s7:*` | **no, and by design** | — | **7-day TTL** | forensic, not an archive. Do not plan around it |

## What is genuinely irreplaceable

Shorter than filed, because the capture archive came off the list:

1. **`feed_index`** — hand-curated intel items. Not derivable from anything.
2. **`fleet_private:*` beyond the workbook** — anything entered after the last workbook export.
3. **Curated / manually-injected fleet entries** — the LV curated set in particular, since LV
   ingest is architecturally dead (no resolver extractor).
4. **`contact_submissions`** — inbound, one copy.
5. **`s2_daily_clearing`** — *provisionally*, pending the BTD-retention test above. If BTD
   serves 299 days back, this drops off the list entirely.

## Proposed backup

**Not implemented.** Proposal only, per the phase's terms.

- **What:** a scheduled export of the irreplaceable classes above — not all of KV. Backing up
  what re-derives is how a backup becomes too big to test, and an untested backup is the thing
  this document exists to avoid.
- **Cadence:** daily for `feed_index` and `contact_submissions`; on-write for `fleet_private:*`.
- **Where — and this is the part that matters:**
  - Public classes (`feed_index`, curated fleet, `s2_daily_clearing`) → a dated JSON under
    `docs/backups/` in this repo. The repo is **PUBLIC**; only classes that are already
    published may land there.
  - **`fleet_private:*` and `contact_submissions` MUST NOT** land in this repo, in any form, at
    any time. They go to the VPS under `/opt/kkme/backups/` with the same file permissions as
    `docs/_private/`, or to an object store that is not world-readable. The NDA gate scans the
    repo; it cannot protect a path outside it, so this is a rule enforced by where the writer
    points, not by a scan.
- **Restore:** a script that reads a dated export and `PUT`s each key back, refusing to run
  against a namespace that is not empty unless `--overwrite` is passed explicitly.

## The honest part

**There is no restore path today, tested or untested.** Nobody has ever restored this namespace,
because nobody has ever exported it. The proposal above is a design, and a design that has not
been executed against a real namespace is a document, not a recovery capability.

The first thing to do with it is not to write the backup — it is to **run the BTD retention
query**, because that single answer decides whether the irreplaceable list has five entries or
four, and therefore how urgent the rest of this is.
