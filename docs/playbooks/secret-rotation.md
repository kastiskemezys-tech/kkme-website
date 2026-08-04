# `UPDATE_SECRET` rotation — runbook

**Status: procedure ready, dual-accept deployed, ROTATION NOT YET PERFORMED.**
The operator sets the values; this document is the checklist and the evidence
trail. Written so the next rotation is a checklist rather than an investigation.

## Why this one needs rotating

It sat as an **inline default** in `python/output/sync_to_website.py`
(`os.environ.get('UPDATE_SECRET', '<value>')`) — verified live: that default
authenticated against production. It is in **four commits** of the
`kkme-control-center` history. That repo is private, so this is not the Phase 47
stop condition, but a credential that has lived in a file and in history should
not survive. The default is now removed and the script fails loudly without the
env var.

## What it protects

**38 admin-write sites** in the worker, all now routed through one
`acceptsUpdateSecret()`. There is no second auth scheme to remember.

## Why dual-accept, not a swap

The caller enumeration below is as complete as two repos and a live crontab can
make it — and the enumeration is exactly the thing that is never complete. A
big-bang swap breaks whichever caller nobody remembered, silently, until a cron
fails at 05:00. Dual-accept means a missed caller keeps working on the old value
and **announces itself in the logs** instead.

The worker accepts either slot:

| binding | meaning |
|---|---|
| `UPDATE_SECRET` | the current value |
| `UPDATE_SECRET_NEXT` | the incoming value; set only while a rotation is in flight |

Every accepted request on the new value logs `[auth] slot=next route=… ua=…`.
**The value is never logged — only which slot matched.** That line is what turns
"every caller has moved" into an observation.

## The callers

Eleven, of which ten read the **same** `/opt/kkme/config/.env` on the VPS — so
one file edit moves ten of them together. They are listed individually anyway,
because what matters is not how many files you edit but which callers you have
**observed** on the new value.

| # | caller | schedule (UTC) | secret from |
|---|---|---|---|
| 1 | `data/hourly_grid.py` | `5 * * * *` — hourly | VPS `.env` |
| 2 | `sync/fetch_btd.py` | `0 */4 * * *` — 4-hourly | VPS `.env` |
| 3 | `sync/cert_watch.py` | `0 5 * * *` | VPS `.env` |
| 4 | `python/output/sync_to_website.py` (via `cron_daily.sh`) | `0 6 * * *` | VPS `.env` |
| 5 | `sync/baltic_storage_index.py` | `30 6 * * *` | VPS `.env` |
| 6 | `sync/kkme_sync.py` | `0 7 * * *` | VPS `.env` |
| 7 | `sync/daily_intel.py` (via `daily_intel_wrapper.sh`) | `30 7 * * *` | VPS `.env` |
| 8 | `data/ingest_daily.py` | `45 7 * * *` | VPS `.env` |
| 9 | `sync/backfill_btd_daily.py` (via `btd_daily_clearing_wrapper.sh`) | `20 8 * * *` | VPS `.env` |
| 10 | `fleet_lifecycle_runner.sh` → `tools/fleet-intel/run-lifecycle.mjs` | `0 22 * * 0` — **weekly, Sunday** | VPS `.env` |
| 11 | `.github/workflows/fetch-btd.yml` | **manual only — see below** | **repo secret** |

Manual/local, not scheduled — rotate opportunistically, they cannot break a cron:
`scripts/_phase-36-b1-route-probe.mjs`.

**Re-verified independently 2026-08-04 (A7 — CC re-runs the count, it does not
inherit it).** Three sweeps, because one would have missed two of them:

```
ssh root@89.167.124.42 "crontab -l | grep -vE '^\s*#|^\s*$'"          -> 10 entries
ssh root@89.167.124.42 "cd /opt/kkme/app && grep -rlE 'UPDATE_SECRET|X-Update-Secret' --include='*.py' ."   -> 9 senders
ssh root@89.167.124.42 "grep -rlE 'UPDATE_SECRET|X-Update-Secret' /opt/kkme/bin /opt/kkme/*.sh"             -> 3 wrappers
```

Count confirmed at **11**, and every schedule in the table matches the live
crontab. Two things the sweep corrected, both of which would have cost a
rotation:

1. **Four of the ten crontab entries are WRAPPERS**, and `cron_daily.sh` exports
   `UPDATE_SECRET` before running a dozen scripts — scrapers, loaders,
   `entity_resolver`, `company_enricher`, `web_enricher` and
   `sync_to_website.py`. Only the last of those is a sender, which is why the
   table is right, but a count taken from the crontab alone cannot know that.
   The Python sweep is what establishes it.
2. **Caller #10's sender is a NODE script**, not Python, so a Python-only sweep
   misses it entirely. `run-lifecycle.mjs` is listed above as "manual/local" in
   an earlier draft of this file; it is not — it is caller #10's payload, sent
   weekly from the VPS with the secret in its environment.

> **⚠ CALLER #11 CANNOT BE OBSERVED BY WAITING.** `fetch-btd.yml`'s `schedule:`
> block is commented out ("BTD blocks GitHub Actions IPs"); the workflow is
> `workflow_dispatch` only. Waiting for it to authenticate on the new value will
> wait forever. **It must be triggered by hand** (`gh workflow run fetch-btd.yml`)
> and its run observed, or the rotation closes with one caller unverified — which
> is the same as not rotating it. This is exactly the member an "observe every
> caller" checklist loses silently.

> **The weekly one sets the pace.** `fleet_lifecycle_runner.sh` runs Sundays at
> 22:00 UTC, so a full sweep of observed callers takes **up to 7 days**. Do not
> drop the old secret before that run has been seen on `slot=next`. This is the
> single most likely place to get impatient, which is why it has its own line.

---

## Procedure

### Step 1 — dual-accept is live (done)

The worker already accepts both slots. With `UPDATE_SECRET_NEXT` unset, behaviour
is identical to before — an unset next slot authenticates nothing, asserted in
`workers/__tests__/updateSecretRotation.test.ts`.

### Step 2 — operator sets the new value

Pick a new value. Then, from the repo root:

```bash
# Set the INCOMING secret. This does not change any caller yet.
npx wrangler secret put UPDATE_SECRET_NEXT
#   → paste the NEW value at the prompt

# Confirm both bindings now exist (names only; values are never shown).
npx wrangler secret list
```

### Step 3 — verify BOTH values authenticate, before touching a caller

`GET /contact` is the control: it requires the secret and is read-only.

```bash
U=https://kkme-fetch-s1.kastis-kemezys.workers.dev

# OLD value must still work (this is what keeps the crons alive)
curl -s -o /dev/null -w "old -> %{http_code}\n" -H "X-Update-Secret: <OLD>" "$U/contact"
# NEW value must now also work
curl -s -o /dev/null -w "new -> %{http_code}\n" -H "X-Update-Secret: <NEW>" "$U/contact"
# a wrong value must still fail — the negative control, without which two 200s
# prove only that the endpoint returns 200
curl -s -o /dev/null -w "junk -> %{http_code}\n" -H "X-Update-Secret: definitely-not-it" "$U/contact"
```

**Expect `200`, `200`, `401`.** If the junk control is not 401, stop: the gate is
not gating and nothing below means anything.

### Step 4 — move the callers

```bash
# The ten VPS callers share one file. Edit the UPDATE_SECRET line to the NEW value:
ssh root@89.167.124.42 'cp /opt/kkme/config/.env /opt/kkme/config/.env.bak && vi /opt/kkme/config/.env'

# Sanity: the file parses and the var is set (prints length, never the value)
ssh root@89.167.124.42 'set -a; . /opt/kkme/config/.env; set +a; echo "UPDATE_SECRET length: ${#UPDATE_SECRET}"'

# The GitHub Action caller is separate:
gh secret set UPDATE_SECRET --repo kastiskemezys-tech/kkme-website
#   → paste the NEW value
```

### Step 5 — OBSERVE each caller on the new value

Not "wait a day and assume". Watch the worker log for `slot=next`, and check off
the table above. Leave this running across a scheduled window:

```bash
npx wrangler tail --format pretty | grep --line-buffered "\[auth\] slot=next"
```

Force the fast ones rather than waiting, then let the slow ones arrive naturally:

```bash
# Trigger the daily callers immediately (each is idempotent)
ssh root@89.167.124.42 '/opt/kkme/bin/btd_daily_clearing_wrapper.sh'
ssh root@89.167.124.42 'set -a; . /opt/kkme/config/.env; set +a; cd /opt/kkme/app && /opt/kkme/venv/bin/python3 sync/fetch_btd.py'
ssh root@89.167.124.42 'set -a; . /opt/kkme/config/.env; set +a; cd /opt/kkme/app && /opt/kkme/venv/bin/python3 python/output/sync_to_website.py --verbose'
ssh root@89.167.124.42 '/opt/kkme/bin/fleet_lifecycle_runner.sh'   # the weekly one — run it by hand rather than waiting to Sunday
```

**Do not proceed until every row in the caller table has been seen on
`slot=next`.** A caller you cannot make appear is a caller you have not proven —
either find why, or leave the old secret in place.

### Step 6 — drop the old value

Only when step 5 is complete for all eleven.

```bash
# Promote: current becomes the new value, and the next slot is removed.
npx wrangler secret put UPDATE_SECRET        # paste the NEW value
npx wrangler secret delete UPDATE_SECRET_NEXT
npx wrangler deploy                          # from main, after origin-SHA equality (C9)
```

### Step 7 — verify the old value is dead

```bash
U=https://kkme-fetch-s1.kastis-kemezys.workers.dev
curl -s -o /dev/null -w "OLD after drop -> %{http_code}  (must be 401)\n" -H "X-Update-Secret: <OLD>" "$U/contact"
curl -s -o /dev/null -w "NEW after drop -> %{http_code}  (must be 200)\n" -H "X-Update-Secret: <NEW>" "$U/contact"
```

Then watch one full daily cycle. A caller that was missed shows up as a failing
cron, and the fix is to put `UPDATE_SECRET_NEXT` back with the old value while it
is corrected — dual-accept works in both directions.

---

## Rotation log

Append one row per rotation. Date, who, and the caller list as it stood — so the
next rotation starts from the last known-complete enumeration rather than a fresh
investigation.

| date | rotated by | callers at the time | notes |
|---|---|---|---|
| — | — | 11 (10 via VPS `.env`, 1 GitHub Actions secret) | Procedure written and dual-accept deployed 2026-08-04. **Rotation not yet performed.** |
