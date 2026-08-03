# `daily_intel.py` — vendored from the VPS, Phase 38.2

## Why this file is here

Until 2026-08-03 this script existed **only on the VPS disk**. `/opt/kkme/app`
is a checkout of `kkme-control-center`, and `git status` there reports
`?? sync/daily_intel.py` — untracked. It was in no repository, on no branch, in
no history, and it is the daily writer behind every assertion-backed number on
the S4 card:

- `installed_storage_{lt,lv,ee}_mw` — the country BESS figures
- `reserved_storage_lt_{mw,mwh}`, `intention_storage_lt_mw` — the LT pipeline bar
- `apva_applied_storage_lt_mw` — the APVA line
- `grid_capacity_caveat`, the four `litgrid_connection_*` keys

Cron: `30 7 * * *` via `/opt/kkme/bin/daily_intel_wrapper.sh`.

## What it actually does with those numbers

JOB 7 (`push_assertions_to_worker`, `:543`) selects **every** row from Postgres
`assertion WHERE is_current = TRUE` and POSTs the lot to `/s4/buildability`.

**The values are not in this file.** The script is a pump; the numbers live in
the `assertion` table. Correcting a published figure means correcting the DB row
— editing this script cannot do it. That is why Phase 38.2's LV 40 → 80 landed
as a database change and this file is unchanged apart from the redaction below.

## The one line that differs from the VPS copy

```
-DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://kkme_loader:…@localhost:5432/kkme")
+DATABASE_URL = os.environ.get("DATABASE_URL", "")
```

The original carried a **live production PostgreSQL credential as an inline
default**, and this repository is public. Vendoring it verbatim would have
published a working database password into permanent git history.

Dropping it was verified safe before the change, not assumed:
`/opt/kkme/config/.env` sets `DATABASE_URL` to the byte-identical value, and
`daily_intel_wrapper.sh` is `#!/bin/bash` and sources it under `set -a`, so the
inline default was never the value in use. Confirmed by reading the resolved
environment on the host.

The credential has **not** been published — `grep` across this repo and
`~/kkme-control-center` found no prior occurrence. It remains in plaintext on
the VPS, which is backlog **B-003**, and is now tracked as **B-061**.

## Keeping this copy and the VPS copy honest

There is no sync mechanism. This is a vendored snapshot, and a second copy of a
thing is a second writer of it — the failure this phase spent its time on twice
(B-058, B-059). Until the script is moved into `kkme-control-center` properly
and deployed from there, the rule is: **edit here, deploy from here**, never on
the host. Byte-compare before assuming they agree:

```
ssh root@89.167.124.42 "md5sum /opt/kkme/app/sync/daily_intel.py"
md5 -q scripts/vps/daily_intel.py     # differs by the redacted line, by design
```
