# Evidence-base refresh — 2026-08-02

**Gates: FAIL** · 5393 rows added · 6 served, 0 unchanged, 0 failed, 2 anomalous.

## Needs a decision before merge

### `se` — APPEND-ONLY ANOMALY

**history_restated** in `se-fcr-2026.ndjson.gz`

A previously published value changed. Settlement corrections do happen and A84 carries a revisionNumber for exactly this, so this may be legitimate — but it must be a decision, with the diff read, not an automatic merge.

```json
[
 {
  "key": "SE|SE|FCR-D-down|down|cap|2026-07-30T22:00:00Z|PT1H",
  "was": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "1",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1",
   "1",
   "\"EUR/MW/h\"",
   "314",
   "\"MW\"",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "1.6154306262059288",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1.6154306262059288",
   "1.6154306262059288",
   "\"EUR/MW/h\"",
   "570.1",
   "\"MW\"",
   "\"clearing\""
  ]
 },
 {
  "key": "SE|SE|FCR-D-up|up|cap|2026-07-30T22:00:00Z|PT1H",
  "was": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "1.6",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1.6",
   "1.6",
   "\"EUR/MW/h\"",
   "298",
   "\"MW\"",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "2.2868376068376066",
   "\"EUR/MW\"",
   "\"EUR\"",
   "2.2868376068376066",
   "2.2868376068376066",
   "\"EUR/MW/h\"",
   "585",
   "\"MW\"",
   "\"clearing\""
  ]
 },
 {
  "key": "SE|SE|FCR-N|symmetric|cap|2026-07-30T22:00:00Z|PT1H",
  "was": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "16",
   "\"EUR/MW\"",
   "\"EUR\"",
   "16",
   "16",
   "\"EUR/MW/h\"",
   "138",
   "\"MW\"",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-30T23:00:00Z\"",
   "\"PT1H\"",
   "15.65063649222065",
   "\"EUR/MW\"",
   "\"EUR\"",
   "15.65063649222065",
   "15.65063649222065",
   "\"EUR/MW/h\"",
   "212.1",
   "\"MW\"",
   "\"clearing\""
  ]
 },
 {
  "key": "SE|SE|FCR-D-down|down|cap|2026-07-30T23:00:00Z|PT1H",
  "was": [
   "\"2026-07-31T00:00:00Z\"",
   "\"PT1H\"",
   "1",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1",
   "1",
   "\"EUR/MW/h\"",
   "306",
   "\"MW\"",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-31T00:00:00Z\"",
   "\"PT1H\"",
   "5.028880866425993",
   "\"EUR/MW\"",
   "\"EUR\"",
   "5.028880866425993",
   "5.028880866425993",
   "\"EUR/MW/h\"",
   "554",
   "\"MW\"",
   "\"clearing\""
  ]
 },
 {
  "key": "SE|SE|FCR-D-up|up|cap|2026-07-30T23:00:00Z|PT1H",
  "was": [
   "\"2026-07-31T00:00:00Z\"",
   "\"PT1H\"",
   "1.04",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1.04",
   "1.04",
   "\"EUR/MW/h\"",
   "298",
   "\"MW\"",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-31T00:00:00Z\"",
   "\"PT1H\"",
   "1.623030303030303",
   "\"EUR/MW\"",
   "\"EUR\"",
   "1.623030303030303",
   "1.623030303030303",
   "\"EUR/MW/h\"",
   "594",
   "\"MW\"",
   "\"clearing\""
  ]
 }
]
```

### `da` — APPEND-ONLY ANOMALY

**rows_removed** in `da-de-2026.ndjson.gz` — 24 rows

Coverage shrank. A source withdrawing published history is an event, not a refresh — do not merge without establishing why.

```json
[
 "DE|DE_LU|spot|-|energy|2026-07-23T22:00:00Z|PT60M",
 "DE|DE_LU|spot|-|energy|2026-07-23T23:00:00Z|PT60M",
 "DE|DE_LU|spot|-|energy|2026-07-24T00:00:00Z|PT60M",
 "DE|DE_LU|spot|-|energy|2026-07-24T01:00:00Z|PT60M",
 "DE|DE_LU|spot|-|energy|2026-07-24T02:00:00Z|PT60M"
]
```
**history_restated** in `da-de-2026.ndjson.gz`

A previously published value changed. Settlement corrections do happen and A84 carries a revisionNumber for exactly this, so this may be legitimate — but it must be a decision, with the diff read, not an automatic merge.

```json
[
 {
  "key": "DE|DE_LU|spot|-|energy|2026-07-23T22:00:00Z|PT15M",
  "was": [
   "\"2026-07-23T22:15:00Z\"",
   "\"PT15M\"",
   "169.2",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "169.2",
   "169.2",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-23T22:15:00Z\"",
   "\"PT15M\"",
   "168.22",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "168.22",
   "168.22",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ]
 },
 {
  "key": "DE|DE_LU|spot|-|energy|2026-07-23T22:15:00Z|PT15M",
  "was": [
   "\"2026-07-23T22:30:00Z\"",
   "\"PT15M\"",
   "166.09",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "166.09",
   "166.09",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-23T22:30:00Z\"",
   "\"PT15M\"",
   "163.65",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "163.65",
   "163.65",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ]
 },
 {
  "key": "DE|DE_LU|spot|-|energy|2026-07-23T22:30:00Z|PT15M",
  "was": [
   "\"2026-07-23T22:45:00Z\"",
   "\"PT15M\"",
   "163.63",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "163.63",
   "163.63",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-23T22:45:00Z\"",
   "\"PT15M\"",
   "160.58",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "160.58",
   "160.58",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ]
 },
 {
  "key": "DE|DE_LU|spot|-|energy|2026-07-23T22:45:00Z|PT15M",
  "was": [
   "\"2026-07-23T23:00:00Z\"",
   "\"PT15M\"",
   "161.17",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "161.17",
   "161.17",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-23T23:00:00Z\"",
   "\"PT15M\"",
   "151.56",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "151.56",
   "151.56",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ]
 },
 {
  "key": "DE|DE_LU|spot|-|energy|2026-07-23T23:00:00Z|PT15M",
  "was": [
   "\"2026-07-23T23:15:00Z\"",
   "\"PT15M\"",
   "164.86",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "164.86",
   "164.86",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ],
  "now": [
   "\"2026-07-23T23:15:00Z\"",
   "\"PT15M\"",
   "162.69",
   "\"EUR/MWh\"",
   "\"EUR\"",
   "162.69",
   "162.69",
   "\"EUR/MWh\"",
   "null",
   "null",
   "\"clearing\""
  ]
 }
]
```

## Per source

| Source | Status | Rows total | Rows added | Files changed | New | Unchanged | Cadence | Last success |
|---|---|---|---|---|---|---|---|---|
| `de` | ok | 935557 | 1340 | 2 | 0 | 7 | 1m | 2026-08-02 |
| `se` | **anomaly** | 146949 | 216 | 2 | 0 | 5 | 1m | 2026-07-30 |
| `gb` | ok | 156677 | 972 | 7 | 0 | 0 | 1m | 2026-08-02 |
| `au` | ok | 1253856 | 1728 | 2 | 0 | 11 | 1m | 2026-08-02 |
| `da` | **anomaly** | 603042 | 664 | 5 | 0 | 28 | 1m | 2026-07-30 |
| `activation` | ok | 286610 | 473 | 4 | 0 | 12 | 1m | 2026-08-02 |
| `fx` | ok | — | 0 | 5 | 0 | 0 | 1m | 2026-08-02 |
| `calendar` | ok | — | 0 | 1 | 0 | 0 | 3m | 2026-08-02 |

## Gates

| Gate | Result |
|---|---|
| all_sources_served | PASS |
| append_only | **FAIL** |
| checksums_and_schema | PASS |
| summary_table_rebuilds | PASS |
| summary_table_deterministic | PASS |
| human_owned_files_untouched | PASS |

## Integrity (checksums + schema, read from disk)

| Dataset | Result | Rows | Files checked |
|---|---|---|---|
| de | PASS | 935557 | 9 |
| se | PASS | 146949 | 7 |
| gb | PASS | 156677 | 7 |
| au | PASS | 1253856 | 13 |
| da | PASS | 603042 | 33 |
| activation | PASS | 286610 | 16 |

## What this run did not do

- It did not touch `docs/research/mature-market-comparability.md` or any other human-owned analysis. That file is a judgement about which market is a valid analogue for which service, and no scheduled job gets to revise it.
- It did not recompute structural-break segmentation and did not add events to the break calendar. New rows after a known break are data; deciding what a break means is 36.E1-E6's work.
- It did not commit or push. A human merges this.
