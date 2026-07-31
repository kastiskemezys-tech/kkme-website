# Evidence-base refresh — 2026-07-30

**Gates: PASS** · 237 rows added · 5 served, 3 unchanged, 0 failed, 0 anomalous.

## Per source

| Source | Status | Rows total | Rows added | Files changed | New | Unchanged | Cadence | Last success |
|---|---|---|---|---|---|---|---|---|
| `de` | ok | 934217 | 132 | 2 | 0 | 7 | 1m | 2026-07-30 |
| `se` | **no_change** | 146733 | 0 | 0 | 0 | 7 | 1m | 2026-07-30 |
| `gb` | **no_change** | 155705 | 0 | 0 | 0 | 7 | 1m | 2026-07-30 |
| `au` | **no_change** | 1252128 | 0 | 0 | 0 | 13 | 1m | 2026-07-30 |
| `da` | ok | 602402 | 103 | 2 | 0 | 31 | 1m | 2026-07-30 |
| `activation` | ok | 286137 | 2 | 2 | 0 | 14 | 1m | 2026-07-30 |
| `fx` | ok | — | 0 | 1 | 0 | 4 | 1m | 2026-07-30 |
| `calendar` | ok | — | 0 | 1 | 0 | 0 | 3m | 2026-07-30 |

## Gates

| Gate | Result |
|---|---|
| all_sources_served | PASS |
| append_only | PASS |
| checksums_and_schema | PASS |
| summary_table_rebuilds | PASS |
| summary_table_deterministic | PASS |
| human_owned_files_untouched | PASS |

## Integrity (checksums + schema, read from disk)

| Dataset | Result | Rows | Files checked |
|---|---|---|---|
| de | PASS | 934217 | 9 |
| se | PASS | 146733 | 7 |
| gb | PASS | 155705 | 7 |
| au | PASS | 1252128 | 13 |
| da | PASS | 602402 | 33 |
| activation | PASS | 286137 | 16 |

## What this run did not do

- It did not touch `docs/research/mature-market-comparability.md` or any other human-owned analysis. That file is a judgement about which market is a valid analogue for which service, and no scheduled job gets to revise it.
- It did not recompute structural-break segmentation and did not add events to the break calendar. New rows after a known break are data; deciding what a break means is 36.E1-E6's work.
- It did not commit or push. A human merges this.
