# Phase 48 — endpoint auth: close the destructive one, then the additive ones

**Branch:** `phase-48-endpoint-auth`. **Supervised. ~45 min. Deploy after the CP.** Do this ALONE — no other work on this branch.
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions.

**Why.** `POST /feed/clean` is unauthenticated, remote and destructive: it takes a caller-supplied `body.before`, keeps only items at or after it, and writes the result straight to `feed_index`. `{"before":"2099-01-01"}` empties the published intel feed. Three siblings — `POST /feed/events`, `POST /feed/backfill-curations`, `POST /contact` — are also unauthenticated; the first two write `feed_index`, so they are additive-but-unbounded.

The discovery is itself instructive and belongs in the record: the probe posted invalid JSON expecting 401 or 400 and got `200 {"cleaned":0,"remaining":4}`. It **executed**. The malformed body fell into `catch { /* empty body ok */ }`, so the default 60-day cutoff applied and matched nothing. It cleaned zero because of a default, not because anything stopped it.

---

## Order — destructive first, and shipped before the others are touched

1. **`/feed/clean`** — require the admin secret, same mechanism as the existing authed admin routes (do not invent a second auth scheme; rule #4). Then:
   - **Reject malformed bodies loudly.** `catch { /* empty body ok */ }` is the second defect here: a parse failure must not fall through to a destructive default. Explicit body validation, 400 on malformed, and no default that deletes.
   - **Bound the blast radius even when authed:** refuse a `before` in the future, refuse a request that would remove more than a stated fraction of the feed without an explicit `confirm` field, and log every invocation with caller-supplied parameters and the resulting counts.
2. **`/feed/events` and `/feed/backfill-curations`** — same auth, same body validation.
3. **`/contact`** — different problem: it should stay open (it is a contact form) but needs rate limiting and payload bounds. If rate limiting needs infrastructure we do not have, say so and propose; do not leave it silently unbounded without reporting.

## Proof required — this is a security fix, so demonstration is the deliverable
- Unauthed request → 401, **and the KV state provably unchanged** (read before, read after).
- Authed request with a malformed body → 400, state unchanged.
- Authed request with a future `before` → refused.
- Authed legitimate request → works, with the log line shown.
- Each of the four proven by inject-then-revert: remove the auth check, watch the test go red.

## Then audit for siblings (A7)
Enumerate **every** worker route that writes KV, with its auth status, in a table. The catch-all that used to recompute S1 on any stray GET was this same shape and was only found by accident. Report any route that writes without auth, even if it looks harmless — "harmless" is what `/feed/clean` looked like.

## CP before deploy
The route table, the four proofs, and confirmation that no legitimate caller breaks (the VPS cron, the curate paste path, anything in `scripts/`). **A working ingestion path broken by an auth fix is a self-inflicted outage** — check the callers first.

## Gates
`/revenue` 54/54 byte-identical · no second auth mechanism introduced · no secret value in any log line, commit message or test · `docs/_private/` never staged · deploy from main after origin-SHA equality, verified per C8.
