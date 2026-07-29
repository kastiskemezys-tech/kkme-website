# Phase 36.C — Pause A source audit

Date: 2026-07-29. Branch: `phase-36-c-reserve-fallback`.
Status: **CHECKPOINT — awaiting operator approval before build.**

## Headline: the phase premise is empirically false

> "BTD (`baltic.transparency-dashboard.eu`) has been host-down since 2026-07-17 — 12+ days."

**BTD is up and serving current data.** From the KKME VPS (`89.167.124.42`), on 2026-07-29:

```
GET https://api-baltic.transparency-dashboard.eu/api/v1/export?id=price_procured_reserves
    &start_date=2026-07-26T00:00&end_date=2026-07-28T00:00&output_time_zone=UTC
    &output_format=json&json_header_groups=1
→ HTTP 200, 42 625 bytes, resolution PT15M, valid TLS (no -k needed)
```

Row counts across the supposedly-dark window, all full days (96 ISPs/day at PT15M):

| window | rows |
|---|---|
| 2026-07-16 → 07-18 | 192 |
| 2026-07-20 → 07-22 | 192 |
| 2026-07-25 → 07-27 | 192 |

Origin certificate: `CN=baltic.transparency-dashboard.eu`, Let's Encrypt, **notBefore Jul 18 17:40:45 2026 GMT**, notAfter Oct 16 2026. Origin IP `80.70.29.84` — RIPE `netname: AST`, Riga (the Latvian TSO hosts it).

So what actually happened on 07-17 is the *old* cert lapsing. AST reissued on 07-18 and BTD recovered. **KKME never recovered with it**, because both of its ingestion legs were independently broken — and neither is a BTD problem.

This is discipline rule #1 in its purest form: the premise was a visual/behavioural inference ("our card is stale ⇒ the host is down"), and it was wrong. Had it gone unchecked the phase would have spent 2-3 days replacing a working feed.

## The two real faults

### Fault 1 — Cloudflare cannot reach BTD (worker-direct leg dead)

Probed by running a throwaway worker on the CF edge (`wrangler dev --remote`, colo EWR), twice, ~40 min apart:

```
btd_api   → 526  "error code: 526"   (336 ms)
btd_site  → 526  "error code: 526"   (351 ms)
litgrid   → 200  24 670 bytes         (control: CF egress is healthy)
```

CF 526 = origin TLS certificate invalid *from Cloudflare's vantage point*. Persistent, not transient. `computeS2()` (worker `fetch-s1.js:5287`) therefore gets `null` for all three BTD datasets and hits `fetch-s1.js:5300`:

```js
if (!reserves || !direction || !imbalance) {
  console.log('[S2/compute] BTD dataset(s) unavailable — skipping worker S2 update (Mac cron handles this)');
  return null;
}
```

It fails **silently and by design**, deferring to a Mac cron that is also dead (below). The existing comments (`fetch-s1.js:5078`, `:4402`) show CF-side 526s have recurred for months; the design response was always "Mac cron handles this", which made the Mac a hidden hard dependency.

### Fault 2 — the Mac cron cannot execute, and could not reach BTD either

Two independent breakages stacked:

**(a) Network.** From the Mac (`83.229.26.247`), TCP to `80.70.29.84:443` connects, then the TLS handshake dies with the origin sending **zero bytes** — no certificate at all:

```
openssl s_client -connect 80.70.29.84:443 -servername api-baltic.transparency-dashboard.eu
→ SSL handshake has read 0 bytes and written 1574 bytes
→ no peer certificate available
→ error:0A000126: unexpected eof while reading
```

Reproduced with curl (default and forced TLS1.2), on both hostnames, and on the bare IP. Port 80 gives `Empty reply from server`. Controls from the same machine at the same time: `litgrid.eu` → 200. So this is specific to the BTD origin, and it is source-dependent — the VPS gets a valid cert and a 200 from the same IP. Whatever the mechanism (edge ACL, geo/ASN filter, per-source rate ban), it is on AST's side and not ours to fix.

**(b) The cron line cannot even run.** Crontab entry:

```
0 */4 * * * NODE_TLS_REJECT_UNAUTHORIZED=0 /usr/local/bin/node /Users/Kastis/kkme-cron/fetch-btd.js \
    >> /Users/Kastis/kkme/logs/btd.log 2>&1
```

`/Users/Kastis/kkme/logs/` **does not exist**. Emulating cron's shell:

```
$ /bin/sh -c 'echo test >> /Users/Kastis/kkme/logs/btd.log'
/bin/sh: /Users/Kastis/kkme/logs/btd.log: No such file or directory   (exit 1)
```

The redirect is opened *before* the command runs, so `node` never starts. The directory went away around `c8f60b0` (2026-07-29, "untrack logs/btd.log") — that commit used `git rm --cached` and expected the working file to survive; it did not. This is newer than the 07-17 stoppage, so it is not its cause, but it means **fixing the network alone would not have revived the Mac leg**, and there is now no log to diagnose from. (The only surviving log, `~/kkme-cron/btd.log`, last wrote 2026-02-26.)

Live confirmation of the joint outcome — `GET /health`:

```
"s2": { "status": "present", "age_hours": 286.9, "stale": true, "threshold_hours": 48 }
```

## Verdict table

### Per candidate source

| Source | Reserve capacity price | Activation price | Volumes | History | Verdict |
|---|---|---|---|---|---|
| **BTD** (`api-baltic`) | ✅ FCR/aFRR↑↓/mFRR↑↓, €/MW/h, PT15M, per-country | ✅ `balancing_energy_prices` | ✅ `procured_reserves`, imbalance vols | ✅ deep, backfillable | **PRIMARY-CAPABLE — reachable from VPS only** |
| **Litgrid direct** | ❌ | ❌ | ❌ | ❌ | **DEAD** |
| **Elering API** | ❌ | ❌ | partial (`/api/balance`) | n/a | **NOT A SUBSTITUTE** |
| **AST direct** | — | — | — | — | **BLOCKED (WAF)** |
| **ENTSO-E TP (legacy REST)** | ❌ | ❌ | ❌ | ❌ | **UNAVAILABLE — and not Baltic-specific** |
| **BBCM platform** | unknown | — | — | — | **no public results feed found** |

### Evidence per row

**Litgrid.** The dashboard does publish the right three series — `Required amount of balancing capacity (MW)` (31578), `Amount of balancing capacity ordered (MW)` (31579), `The average price of ordered balancing capacity (EUR/MW)` (31580) — with a documented cadence ("published the day before at 10:30"). The filter form takes `filter[from]` / `filter[to]` / `lines`. Every range queried returns **zero `<td>` cells**:

| range | data cells |
|---|---|
| 2026-07-20 → 07-28 | 0 |
| 2026-06-01 → 06-07 | 0 |
| 2026-01-10 → 01-17 | 0 |
| 2025-11-01 → 11-07 | 0 |
| 2025-03-01 → 03-07 | 0 |

Headers render, rows never do — 17 months back. The existing code comment ("data moved to BTD post-sync", `fetch-btd.js:93-97`) is **empirically confirmed**, not folklore. The regex scraper in both `fetch-btd.js` and `fetch-s1.js:5090` is parsing a permanently empty page and should be deleted, not fixed.

**Elering.** Pulled the full OpenAPI spec (`dashboard.elering.ee/v3/api-docs`, 62 paths). Zero reserve-procurement endpoints. The only balancing-adjacent one is `/api/balance` (`imbalance`, `regulate_up/down`, `imbalance_buy_price`, `imbalance_sell_price`) — and it returned **all-null** for the 2026-07-26 window sampled. No FCR/aFRR/mFRR capacity or activation prices exist in the public Elering API.

**AST.** `ast.lv` is behind a Cloudflare WAF that blocks the pipeline UA outright ("This website is using a security service to protect itself…"). No assessment possible without either a browser-class client or an operator-level data request. Consistent with the thin expectation from 33.A.2.b.

**ENTSO-E — and an honest limit on this finding.** Swept documentType × processType × businessType × `type_MarketAgreement.Type` against the legacy REST API. Findings:

- `A89` (prices of procured reserves) has **no valid parameter combination** — every combo returns "not a valid combination".
- `A81` + `businessType=B95` is the one accepted shape, resolving to dataItem `AMOUNT_AND_PRICES_PAID_OF_BALANCING_RESERVES_UNDER_CONTRACT` (17.1.B&C) — carries both amounts and prices.
- `A84` / `A85` / `A86` resolve to valid dataItems (`PRICES_OF_ACTIVATED_BALANCING_ENERGY_R3`, `IMBALANCE_PRICES_R3`, `TOTAL_IMBALANCE_VOLUMES_R3`) and return **empty for LT at 3d / 30d / 90d / 180d / 300d** — so not a publication lag.

**But the positive control failed.** `A81/B95` returns empty for **NL, DE(50Hertz), DE(TenneT), BE, FR, AT** too, across all six agreement types, and in a June-2024 window as well — control areas that certainly do publish this. The token is entitled (A44 day-ahead returns 160–184 points for LT and NL on the same runs). So the correct verdict is **"the legacy REST balancing surface serves nobody"**, not "the Baltics don't publish". B1's original "not available" conclusion is upheld operationally, but its *reason* is an API-surface limitation, not a Baltic gap. Whether ENTSO-E's newer TP API or SFTP bulk export carries Baltic balancing is **unresolved and should not be asserted either way** — it is a separate investigation, not something this audit settled.

**Baltic common procurement.** The Baltic TSOs jointly procure via the **BBCM** platform, day-ahead auctions each morning; 2026 demand ≈1 600 MW (FCR 28, aFRR ≈96–120 up / 104–120 down, mFRR ≈580–604 up / 675–691 down) — these match the `demand_mw` figures already in the S2 payload. No public machine-readable results feed was found. BBCM results appear to reach the public **through BTD**, which is precisely why BTD is a single point of failure.

### Per data need

| Data need | Best source | Fallback order | Gap |
|---|---|---|---|
| S2 live card | BTD via **VPS** | VPS → worker-direct (self-heals if 526 clears) → last-good KV | none once VPS leg lands |
| Reserve-price history (36.D realisation) | BTD via VPS | — | 07-17→07-29 gap is **fully backfillable** (192 rows/2d confirmed) |
| Forecast plumbing (B0-G) | worker-internal | — | not a source problem — see below |

## Pinned primary sources for Phase 36.D (requested mid-audit, not assessed here)

Located while auditing Litgrid; recorded, not evaluated, per the instruction to pin only.

- **Lithuanian flexibility needs assessment 2028–2035** — `https://www.litgrid.eu/index.php/sistema/lankstumo-poreikiu-vertinimo-ataskaita/36615` ("Lankstumo poreikių vertinimo ataskaita"). Prepared by Litgrid with ESO, approved by VERT. The landing page carries the report; no direct PDF link is exposed in the served HTML.
- **Baltic balancing capacity market assessment report** — `https://www.litgrid.eu/index.php/elektros-rinka/balansavimo-rinka/baltijos-balansavimo-pajegumu-rinkos-vertinimo-ataskaita/36367`. Not requested, but it is the balancing-market counterpart and directly on this phase's subject.

One flag for whoever scopes 36.D, since it is cheaper to raise now than to discover mid-phase: the figures in the 36.C prompt ("973 MW by 2028 / 3.12 GW BESS") do not obviously correspond to the public summary of this assessment, which frames total Lithuanian flexibility demand rising **4.36 GW → 7.13 GW by 2035** (≈3 GW of additional need). Those may be different cuts of the same model — a BESS-specific subset versus total flexibility — or the prompt's numbers may come from another document. Resolving that is 36.D's job; this audit only notes that the two do not match on their face and should not be assumed interchangeable.

## Root-cause summary

The stale card was never a source-availability problem. It was **an ingestion-topology problem**: two legs, both fragile, both silently failing, and each written to assume the other was covering. The one host in the estate with clean, authenticated, proven access to BTD — the VPS that already runs five KKME crons and already POSTs to the worker — was never in the chain.

## Proposed architecture

**Not** "replace BTD with Litgrid/Elering/ENTSO-E" — the audit says those cannot carry the load. The redundancy the phase wants is **path** redundancy, not source redundancy.

1. **Move BTD ingestion to the VPS (new primary).** Port `fetch-btd.js` to Python under `/opt/kkme/app/sync/`, matching the existing cron idiom (`SHELL=/bin/bash`, `. /opt/kkme/config/.env`, venv python — `UPDATE_SECRET` and `requests 2.32.5` already present; note **node is not installed**, hence Python). POSTs to the existing `/s2/update` and `/trading/update`. No worker schema change.
2. **Keep the worker-direct leg as opportunistic secondary.** It already exists and already no-ops on failure; leave it, so it self-heals the moment CF's 526 clears. Add a source stamp so `_meta.source` says which leg actually served.
3. **Retire the Mac cron.** Remove the crontab line. It has two independent faults, no logs, and no unique capability. Keep `fetch-btd.js` in-repo as reference until the VPS port is verified, then delete.
4. **Priority chain + per-source freshness stamps** in `/s2/update`, so a stale leg can never overwrite a fresher one.
5. **Staleness honesty.** `/health` correctly reported 286.9 h — verify the S2 *card* is equally loud. 12 days stale must be unmissable on the public page.
6. **Delete the Litgrid ordered-capacity scraper** from both `fetch-btd.js` and `fetch-s1.js:5090`. It has been parsing a permanently empty page since at least 2025-03; `ordered_price`/`ordered_mw` are dead fields.
7. **Backfill 2026-07-17 → 07-29** from the VPS. Confirmed available.
8. **B0-G forecast plumbing** (independent of all the above). Confirmed diagnosis: both `da_tomorrow` writers store only scalars —
   - `fetch-s1.js:4313` (`computeS1`) → `lt_peak, lt_trough, lt_avg, se4_avg, spread_pct, delivery_date`
   - `fetch-s1.js:9359` (`POST /da_tomorrow/update`) → same shape

   while the consumer at `fetch-s1.js:10003` reads `daTomorrow.prices_24h || daTomorrow.lt_prices || []` — always `[]`, so `mode=forecast` has **never** been able to serve. Fix: persist the hourly array from both writers, resolution-aware (PT15M-capable per the 36.B0-D lessons). Also note `/health` reports `da_tomorrow:lastgood` as **missing**, so the DA path needs its own check.

## Revised estimate

**~1 day, down from 2-3.** The expensive branch (build parsers for 2-3 new upstreams) is cut — the audit found nothing worth building against. What remains is a port, a deletion, a backfill, and a small schema fix.

| Item | Estimate |
|---|---|
| VPS fetcher port + cron install | ~3 h |
| Priority chain + freshness stamps + `_meta.source` | ~1.5 h |
| Mac cron retirement + Litgrid scraper deletion | ~0.5 h |
| Backfill 07-17 → 07-29 | ~0.5 h |
| B0-G `prices_24h` fix (both writers, resolution-aware) | ~1.5 h |
| Tests (fixture-pinned parser, chain, staleness, forecast e2e) | ~2 h |

## Open questions for the operator

1. **VPS as primary — approved?** It moves a public-facing feed onto the self-hosted box. Sound (already runs five KKME crons, already trusted with `UPDATE_SECRET`), but it is a deliberate widening of the VPS's blast radius.
2. **Contact AST about the two blocks?** The Mac IP block and the CF 526 are both AST-side. Reporting them is free and might restore two paths — but is operator-voice work, not CC work.
3. **ENTSO-E new-API investigation — file as its own phase?** It could not be settled here, and it is the only route to genuine *source* redundancy.
4. **Cert-lapse tripwire?** A 07-17-class event will recur. A cheap check on BTD's `notAfter` would give days of warning instead of a 12-day silent stall.
