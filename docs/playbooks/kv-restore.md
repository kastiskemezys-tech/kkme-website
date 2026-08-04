# KV backup and restore — runbook

**Status: TESTED.** The restore below was executed end-to-end on 2026-08-04 into a
scratch namespace and verified by reading every key back: **1131/1131 keys matched
their backup checksum, 0 missing, 0 mismatched.** This is not a procedure someone
believes will work.

---

## What is backed up, and what deliberately is not

`node scripts/kv-backup.mjs` exports **1131 keys / ~12.9 MiB** to
`docs/_private/kv-backup/general/`, each file checksummed in `MANIFEST.json`.

> **The backup is NOT in the repository, and must not be.** The first design
> committed it and the NDA gate refused — six numeric needles collided with BTD
> clearing prices (coincidences, but a large public numeric corpus will always
> produce them, and the gate cannot tell a coincidence from a disclosure).
> Worse, and invisible to that gate: `contact_submissions` holds inbound
> enquiries — names, email addresses, free-text messages — and **this repository
> is public** (`gh repo view` → `isPrivate: false`, re-checked 2026-08-04).
> Committing the export would have published third-party personal data. The whole
> export therefore lives under the gitignored `docs/_private/` tree, and the
> offsite copy goes to an object store.

**Not backed up, because it is re-derivable:** `s1`, `s2`, `s3`…`s9`, `s_wind`,
`s_solar`, `s_load`, `genload`, `euribor`, `da_tomorrow` (recomputed by cron within
hours); `raw:*` (7-day TTL, forensic); `dispatch:*` (recomputable from the engine and
price history, 90-day TTL); the operational keys `alert_state`, `alerter_health`,
`cron_heartbeat`, `cert_watch`.

**Backed up, because it is not:** operator-authored and inbound material
(`contact_submissions`, `s4_manual_additions`, `s4_buildability`, `s3_editorial`),
the write-stamped published series (`*_history`, `s2_btd_history`,
`s2_capacity_watch:*`), the published intel record (`curation:*`, `curations:index`,
`feed_*`), point-in-time page captures (`litgrid_watch:*`), the trading record
(`trading:*`), and `s2_daily_clearing`.

### A correction carried into this runbook

Phase 48 reported that BTD's window slides forward a day per day, making
`s2_daily_clearing` lose a day of recoverability daily. **That was wrong.** Probing
identical absolute dates on 2026-08-03 and 2026-08-04 returns identical coverage
(2025-09-29 → 8 %, 2025-09-30 → 25 %, 2025-10-01 → 100 % on both days). The boundary
is a fixed **data start at 2025-10-01**, not a retention window; the ramp below it is
products coming online, not decay. The series is re-derivable from BTD and stays so.

It is still backed up — "re-derivable from one source that has had outages" is a
recovery plan, not a backup — but **it is not on a clock**, and the urgency stated in
Phase 48 does not apply.

---

## Two things the test taught, which the tooling now encodes

1. **A restore without retry loses keys.** The first run put 1130 of 1131 and dropped
   one to a transient error; the identical command succeeded immediately after.
   `putValue` now retries with backoff.
2. **KV is eventually consistent, so a read-back immediately after a restore
   measures propagation, not durability.** The first verification reported a key
   MISSING that the restore had reported as written — and it read back correct, at
   the correct byte length, minutes later. `--verify-restore` therefore re-reads
   misses after a delay before calling anything missing. This is C8's post-deploy
   edge window wearing a different hat; on the verified run, **5 keys were invisible
   on the first pass and present on the second.**

---

## Restore procedure

**Do not restore into production from this tool.** It refuses (`--namespace-id`
equal to the production namespace is rejected). A production restore is a decision,
not a command, and the steps below end with the operator making it explicitly.

```bash
# 1. Confirm the backup is intact BEFORE trusting it.
node scripts/kv-backup.mjs --verify docs/_private/kv-backup/general
#    → VERIFY OK — 1131 keys, every sha256 matches

# 2. Create a scratch namespace and restore into THAT first, always.
npx wrangler kv namespace create KKME_RESTORE_TEST
#    → note the id

# 3. Restore.
node scripts/kv-backup.mjs --restore docs/_private/kv-backup/general --namespace-id <SCRATCH_ID>

# 4. Prove it, by reading back — not by trusting step 3's own report.
node scripts/kv-backup.mjs --verify-restore docs/_private/kv-backup/general --namespace-id <SCRATCH_ID>
#    → RESTORE VERIFIED — every key read back ... hashes identically to the backup

# 5. Only after step 4 passes: point the Worker at the restored namespace by
#    editing the id in wrangler.toml and deploying, OR promote the scratch
#    namespace. Deploy from main, verify per C8 (poll to two agreeing reads).

# 6. Clean up any scratch namespace afterwards.
npx wrangler kv namespace delete --namespace-id <SCRATCH_ID>
```

## The private tier

`fleet_private:*` is exported to `docs/_private/kv-backup/`, which is gitignored. The
public manifest records **that** a private tier exists (`private_tier_present`) but
never names a key in it. `scripts/__tests__/kvBackup.test.ts` asserts all of this and
is proven failable by injection — flipping the class to `tier: 'public'` or pointing
the private path at a public directory turns it red.

As of 2026-08-04 the namespace holds **zero** `fleet_private:*` keys. The tier is
wired before it is populated on purpose: wiring it afterwards is how leaks happen.

## Refresh cadence

`.github/workflows/kv-backup.yml` runs the export weekly and uploads a dated
tarball to R2. **It is INERT until provisioned** and fails loudly rather than
skipping quietly, because a green backup job that backs nothing up is the exact
silent-success shape this project keeps paying for.

To provision:

```bash
npx wrangler r2 bucket create kkme-kv-backup   # must NOT be public
gh secret set CLOUDFLARE_API_TOKEN             # R2 write + KV read
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set KV_BACKUP_BUCKET --body kkme-kv-backup
```

Until that is done the only copy is on whichever machine last ran the export.
That is stated here rather than left to be discovered.

## Known limits, stated rather than discovered later

- The export is ~19 minutes wall-clock at concurrency 8 (one `wrangler kv key get`
  per key). A bulk-read via the Cloudflare API would be faster and needs an API
  token, which this phase did not introduce.
- 3 `curation:*` keys were listed but returned empty at export time and are recorded
  as skipped, not silently dropped.
- The backup captures a point in time. Anything written between the export and a
  restore is lost — this is a disaster-recovery floor, not a replication scheme.
