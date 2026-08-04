# Phase 50 — production catch-up, the expiring archive, and the four residuals

**Branch:** `phase-50-catchup-durability`. **Semi-autonomous — CP before the deploy of §1. ~3 h.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why, in priority order.** One item is on a clock: `s2_daily_clearing` holds 299 days beginning on exactly the oldest day BTD still serves, so it is now the only copy of its early section, it has no backup, and its importer is seven days behind with no alert. Everything else here is a residual from the Phase 48 audit that was correctly reported rather than absorbed.

---

## 1 · Production catch-up (do first, it is the smallest)

Main is at six merged PRs beyond the deployed worker. The deployed `fetch-s1.js` is byte-identical to main's, and the only worker-tree delta is an unwired `sourceContracts.js` — so this should be a no-op deploy, which is exactly why it should happen now rather than accumulating.

- Confirm the no-op claim at code level before deploying (A3 — it is CC's own claim from an earlier session, and stale claims are the house speciality).
- Deploy from main after origin-SHA equality; verify per C8, polling to agreement; confirm `/revenue` 54/54 unchanged and the public surfaces at the correct tick.
- If it is NOT a no-op, stop and report the delta before deploying.

## 2 · The expiring archive — `s2_daily_clearing`

1. **Close the importer gap first.** It is seven days behind and unalerted. Fix the lag, then wire a staleness threshold and a transition alert derived from its own cadence — the same treatment every other path got in the alerting item. **An importer that falls behind silently is how the window gets lost.**
2. **Back up the irreplaceable classes.** From item 7's inventory, the classes that exist only in KV and cannot be re-fetched: `s2_daily_clearing` first, then whatever else the inventory names as irreplaceable (note `s1_capture_history` was shown re-derivable from ENTSO-E, so it ranks lower). Scheduled export, committed to the repo or an object store, with checksums and a manifest.
3. **`fleet_private:*` never lands anywhere public** — its backup goes to `docs/_private/` or an equivalent gitignored path, and a leak test asserts it.
4. **Write the restore procedure and TEST IT.** Restore into a scratch namespace and diff against source. An untested restore is a hope, and this phase is the only chance to test it while the data still exists.
5. Report how many days of BTD depth remain re-fetchable, so the urgency is a number rather than an adjective.

## 3 · `/curate` — the two-step gating, in order

`/curate` is an unauthenticated `feed_index` writer whose live caller (`sync_to_website.py`, VPS 06:00 UTC) sends no secret. Gating it first would kill ~30 items/day.

1. Add the secret to the VPS caller. Deploy that. **Verify it is sending** — observed, not assumed.
2. Only then enforce auth on the route, with the same body validation and blast-radius bounds as `/feed/clean`.
3. Both steps proven; the second must not ship until the first is verified live.

## 4 · `/contact` — unescaped interpolation into HTML email

Submitted fields are interpolated into an HTML email unescaped. That is an injection into a document a human opens, and it is a different risk class from the KV writers: escape on output, allowlist the fields, cap lengths, and strip anything that renders as markup. Add a test with a payload containing markup, angle brackets and a quoted attribute break.

Rate limiting stays a proposal — it needs a Cloudflare rate-limit binding, and answering an unauthenticated-write problem with an unauthenticated KV counter is the wrong shape. State the binding needed and its cost.

## 5 · The nine GET routes that recompute-and-write

Public reads that trigger a recompute and a KV write. Two problems: a stranger's traffic can move our published state (the `s1` key pollution class, already fixed for one route), and metered CPU/KV cost scales with crawler traffic.

- Enumerate all nine with what each writes.
- For each: does the write need to happen on read at all? The default answer should be no — reads serve, crons write.
- Propose the split; implement only where it provably does not change what the route serves. Anything that changes served content stops for signature.

## 6 · B-034 follow-through
The artifacts those suites were grading were ~24 % adrift (12,770,114 → 9,698,737 on the first bridge year). The frozen fixture fixed the test's input; **it did not answer why the live artifacts drifted**. Diagnose that separately — it touches the client bridge, so it is worth knowing before any client bundle is regenerated.

## CP
Before §1's deploy: the no-op confirmation. Before anything in §3-§5 that changes what a route serves: the delta and the reason.

## Gates
`/revenue` 54/54 byte-identical throughout · restore tested against a scratch namespace, not asserted · no private key class backed up to a public location, leak-tested · every new alert proven failable · `docs/_private/` never staged · NDA gate on every commit · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the deploy verification · remaining re-fetchable BTD depth in days · backup + tested restore evidence · `/curate` two-step proof · `/contact` escaping test · the nine-route table with the proposed split · the B-034 drift diagnosis · PR URL.
