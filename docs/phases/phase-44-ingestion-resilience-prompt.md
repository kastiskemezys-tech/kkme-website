# Phase 44 — ingestion resilience: every scraper, parser and loader

**Branch:** `phase-44-ingestion-resilience`. **Autonomous, box 3 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** Every data path we own has failed at least once, and in each case the failure was invisible for days: BTD's cert chain (12 days), the S1 branch timeout (9 ticks, a week), NordPool returning HTML where JSON was expected, the LV register writing `closed` as a single space (which would have retired the entire Latvian fleet), cp1257 mojibake reaching the intel feed, `fetch_entsoe_installed_capacity.py` arming a 16-assertion wipe, a manifest refresh destroying 131,472 rows with checksums passing. **The pattern is not bad luck; it is that ingestion has no contract.** This phase gives every source one.

---

## 1 · Inventory (A7, with counts)

Every ingestion path in the estate: worker fetchers, VPS scripts, GitHub Actions fetchers, KV writers, the curate/paste endpoint, tripwires. For each: source, transport, auth, schedule, output key/file, admission gate, failure surface, last successful run.

Output `docs/ingestion-map.md`, generated where possible.

## 2 · The source contract — the phase's core deliverable

For each source, a declared contract next to its fetcher:
- **Shape:** required fields, types, units, resolution, timezone.
- **Volume envelope:** expected row count per period, and the bounds outside which the run is an anomaly rather than a result.
- **Freshness:** how old is too old, derived from the source's own publication cadence, not a global constant.
- **Encoding:** declared charset and what to do on mojibake (the cp1257 precedent — Phase 4G.1's validator is the model; extend it, do not fork it).
- **Content-type discipline:** JSON parsers must reject an HTML body loudly with status, content-type, length and first bytes (the NordPool and S3 precedents).

Then a **validator per source** that runs on every fetch, before admission. A payload that fails its contract is quarantined with the diagnosis, never silently partially-admitted.

## 3 · Failure semantics — make them uniform

- **Retry policy** with backoff, per transport, sized from observed failures (the energy-charts 503 punched through a single retry — use the real timing, not a guess).
- **Never let one source's failure take down a sibling** — the `computeCapture` inside `computeS1`'s success branch is the paid-for example. Audit for the same shape everywhere: any place where A's exception prevents unrelated B from running.
- **Every path has a staleness surface with a threshold derived from its cadence**, and a transition-based alert (see the alerting item). No path may be silently skippable.
- **Partial success is a first-class outcome**: N of M sources served, recorded per source, never collapsed to a single boolean.

## 4 · Politeness and legality

- Verify each scraper against the site's `robots.txt` and terms; record the check date. AST's WAF and CAPTCHA stay respected — **no evasion, ever** (already the standing position).
- Identify ourselves honestly in User-Agent with a contact URL. AST confirmed no UA requirement, but courtesy is cheap and it is how the BTD relationship started.
- Rate limits: declare the polling frequency per source in the contract, and make the scheduler enforce it rather than relying on cron spacing.

## 5 · Recorded fixtures and contract tests

Each source gets a recorded real response as a fixture, and a test asserting the parser against it. **This is what makes schema drift visible**: when the source changes, the contract test fails against the recorded shape rather than the parser quietly producing empty output. Note the B-043 problem — AU/DA fetchers rewrite their own fixtures each run, which destroys exactly this property. Fix that as part of this phase.

## 6 · Specific open items to close if time allows
- **B-057:** stagger the crons (`0 * * * *` → `5 * * * *`) — measure the collision first, then move. `[Genload/hourly]` timeout, `[FX]` and `[S3]` AbortErrors ride the same contention.
- **B-043:** fixtures rewritten each run.
- **37.B.3:** `press_negative` has no insolvency/cancellation vocabulary; `vert_permit_expired` is blind at 0/243 eligible because permit-holder names don't match fleet rows — that is a *matching* problem, not a source problem, and worth stating precisely.

## STOP conditions
- A contract cannot be written because the source's own documentation contradicts its payload → record both, quarantine, report.
- Fixing a fetcher would change a published number → flag OFF, quantify, stop.

## Gates
`/revenue` 54/54 byte-identical · every validator proven failable with a malformed fixture · no fetcher writes its own fixture · `docs/_private/` never staged · no evasion of any bot protection.

## PR body
The ingestion map, the contract coverage count (sources with a contract / total), and every source currently outside its freshness envelope.
