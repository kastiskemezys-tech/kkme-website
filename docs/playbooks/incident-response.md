# Incident response

**Written for 07:00, on a phone, before coffee.** Skim the bold lines; the rest is for when
you are at a keyboard.

Nothing in this file requires a laptop to *decide*. It requires one to *act*.

---

## 0 · The do-not-do-this-while-panicking list

Read this first, every time. Every entry was paid for.

- **No `git push --force`, no history rewrite.** Ever, and especially not at 07:00.
- **No `git add -A`, no directory-wide `git add`.** It is how `docs/_private/` gets staged.
- **No deploy from a dirty tree.** `wrangler deploy` ships the working directory, not the
  commit. Two stale deploys in one evening came from exactly this (C2).
- **No deploy before `git status` is clean AND `origin/main..main` is empty** (C1).
- **Do not trust the first read after a deploy.** The edge that answers may not have caught up.
  Poll until two consecutive reads agree (C8) — a single post-deploy read is never evidence,
  of success or of failure.
- **Do not conclude from a single check at the wrong moment.** `/revenue`-class values flip at
  the cron tick; checking a minute early gives a false alarm (B3).

---

## 1 · An alert fired. What kind?

Alerts are transition-based (Phase 39.2): you get one message when something breaks, one when
it recovers, and nothing in between unless the error CHANGES. **Two identical messages in a row
should not happen; if they do, the transition machine is broken, not the thing it watches.**

Every alert carries the **consecutive-failure count** and the **time of first failure**. Read
those before anything else — they tell you whether this started five minutes or two days ago.

### `⚠️ s1_cron — degraded`

The 4-hourly signal cron failed. The message names which half:

| line | meaning | urgency |
|---|---|---|
| `computeS1 rejected` | ENTSO-E day-ahead unavailable → `s1`, `raw:s1`, `da_tomorrow` all skipped this tick | the S1 card serves the last good values; it is stale, not wrong |
| `computeCapture rejected: … primary … fallback …` | **both** price sources failed | the S1 hero €/MWh is stale. Check the two named hosts |
| `computeCapture: ok (source: entsoe-a44)` | the fallback is carrying it | **not an incident.** energy-charts is down; the number is live and from the second source |

**First question: is it still failing, or is this the tail of something that recovered?**
`curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/health | jq .alerting`
— `degraded_surfaces` is the answer. Empty means it recovered and you missed the message.

### `⚠️ s4_cron — degraded`

Litgrid's ArcGIS FeatureServer. The S4 card shows free grid capacity. **Check the source
yourself before assuming it is us** — it answers in about a second from a laptop, and if it
answers for you and not for the worker, the problem is on our side, not Litgrid's.

### `⚠️ s3_scrape — degraded` / `s3_enrichment`

TradingEconomics scrape or the weekly enrichment. **Lowest urgency on this page.** The S3 card
falls back to editorial ranges, which are correct-but-not-live. The alert now carries HTTP
status, content-type, byte length and the first 200 bytes — read those before opening anything.
An HTML body where JSON was expected means the upstream changed or is erroring, not that our
parser broke.

### No alert at all, and something looks wrong

**Absence is not a signal.** Check the alerter itself:
`curl -s …/health | jq .alerting.alerter` — `send_ok`, `consecutive_send_failures`,
`last_success_at`. If sends are failing, the channel is broken and the system may be fine, or
may not be, and you cannot tell from silence.

---

## 2 · Is production serving stale or wrong data?

These are different problems and the fixes are opposite. **Stale is usually safe; wrong is not.**

```
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/health | jq '{all_fresh, alerting: .alerting.degraded_surfaces, stale: [.signals|to_entries[]|select(.value.stale or .value.degraded)|.key]}'
```

- **`stale: true`** — the key has aged past its threshold. The card shows old numbers.
- **`degraded: true`** — the key was written *recently* but the payload SAYS it failed
  (`unavailable: true`). This is the nastier one: it looks fresh and is not.
- **`all_fresh: false` with an empty stale list** — something is degraded rather than aged.

**A number that is wrong rather than stale** shows up as a value outside its plausible band, not
as a freshness flag. The fastest check is the public payload against a second source:
Elering's NPS API for LT day-ahead is independent of every path we run and takes one curl.

---

## 3 · Rolling back a worker deploy

```
npx wrangler deployments list                    # find the last known-good Version ID
npx wrangler rollback --message "why"            # or: --version-id <id>
```

Then **verify by polling, not by one read** (C8):

```
for i in $(seq 1 10); do curl -s …/health | jq -r .checked_at; sleep 8; done
```

Two consecutive reads that agree is the evidence. One read is not.

**Before rolling back, ask whether the deploy is actually the cause.** A cron-driven data
failure looks identical to a bad deploy from the outside, and rolling back does not fix an
upstream 503.

---

## 4 · Upstream contacts

| upstream | what breaks | contact | note |
|---|---|---|---|
| **AST** (Latvia) | BTD datasets, cert chain | the IT contact thread opened during the BTD cert incident — **a real relationship now, use it** | WAF and CAPTCHA are respected. **No evasion, ever** — that is the standing position and it is why the relationship exists |
| **Litgrid** | S4 ArcGIS FeatureServer, Kaupikliai layer | public data portal | no direct contact established |
| **ENTSO-E** | A44 day-ahead, A75/A65 gen-load | transparency platform support | the API key is per-account; a 401 here means the key, not the platform |
| **energy-charts.info** (Fraunhofer ISE) | DA capture primary source | public API, no contact | **has a working fallback** — a 503 here is not an incident |
| **TradingEconomics** | S3 lithium scrape | none — it is a scrape | schema drift is silent by construction; expect it |

---

## 5 · If a secret leaks

**Do not attempt this alone at 07:00 unless the exposure is live and public.**

1. **Do not rewrite git history.** That decision is the operator's and it is recorded in
   `DECISIONS.md` D1. Rewriting is usually the wrong first move and always the loudest.
2. **Rotate at the provider first**, before touching this repo. A rotated credential makes the
   leaked copy worthless; a deleted commit does not.
3. Then update the secret where it lives — Cloudflare (`wrangler secret put`), GitHub Actions,
   the VPS `.env`.
4. **Then** decide about history, unhurried, with the credential already dead.
5. Record it in `DECISIONS.md` as an incident, including how it was found. *How it was found*
   is the useful part: everything found so far was found by someone happening to look.

---

## 6 · State loss

If KV were lost, see `docs/disaster-recovery.md` for what is re-derivable and what is not.
The short version for 07:00: **most of it can be rebuilt from sources that still serve.** The
irreplaceable classes are named in that file, and there is **no tested restore path** —
which is itself the finding, not a footnote.
