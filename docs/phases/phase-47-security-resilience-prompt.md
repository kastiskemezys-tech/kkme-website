# Phase 47 — security, secrets and disaster recovery

**Branch:** `phase-47-security-resilience`. **Autonomous, box 2 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** A live production Postgres credential sat as an inline default in a script that was one commit from a public repo — caught by chance during vendoring, not by a control. A counterparty name reached four pushed commits. The whole platform's state lives in KV with no tested restore path. **None of these were found by a process; all were found by someone happening to look.**

**Report-and-propose phase.** Do not rotate a secret, do not change an auth mechanism, do not touch access control while unsupervised. Findings and a runbook are the deliverable.

---

## 1 · Secret inventory

Every secret the system uses: name, where it lives (Cloudflare secret, GitHub Actions secret, VPS `.env`, 1Password), what it authorises, who/what reads it, last-changed date if determinable. Include `UPDATE_SECRET`, `CALC_SECRET`, `FLEET_SECRET`, `ENTSOE_API_KEY`, the DB credential, and anything else found.

Then: **scan the working tree and the full git history for credential shapes** — connection strings, bearer tokens, API-key patterns, private keys, and the specific values in the private reference. Report hits with commit and path; **do not rewrite history** (that decision is recorded in DECISIONS D1 and is the operator's).

Propose: a pre-commit secret-scan gate, a rotation policy per secret with cadence, and a documented "what to do if a secret leaks" sequence. **Propose only.**

## 2 · Endpoint surface

Enumerate every worker route: method, auth requirement, what it reads, what it writes, and whether it is rate-limited. Flag:
- any **write** endpoint without auth;
- any endpoint whose failure mode is a silent write (the pre-B-047 catch-all recomputed S1 and wrote KV on any stray GET — verify no sibling of that shape survives);
- any endpoint that returns different data by auth tier, and whether its leak tests are non-vacuous (seeded values, vacuity guard);
- absence of rate limiting on public endpoints, with the cost implication of an abusive caller (KV reads and worker CPU are metered).

## 3 · State durability — the gap nobody has looked at

**If the KV namespace were lost tomorrow, what could be rebuilt and what could not?** Answer per key class: `s1*`, `s2*`, `s4*`, `fleet*`, `fleet_private:*`, `s2_daily_clearing` (299 days), `s1_capture_history` (400 market days), the registers, the buildability assertions.

- Which are re-derivable from sources still serving, and over what window? (`raw:s1:<date>` has a 7-day TTL — it is forensic, not an archive.)
- Which exist **only** in KV? Those are the irreplaceable ones, and at least two of them — the 299-day clearing history and the 400-day capture archive — took months of daily collection that cannot be re-fetched.
- Propose a **backup**: a scheduled export of the irreplaceable key classes to the repo or an object store, with a restore procedure. Then write the restore procedure as a runbook, and say plainly that it is untested until someone tests it (an untested restore is a hope).
- The private tier gets special handling: backups of `fleet_private:*` must not land anywhere public. Say where they may land.

## 4 · Runbook — `docs/playbooks/incident-response.md`

One page, written for the operator at 07:00 on a phone: what to do when an alert fires, per alert type; how to tell whether production is serving stale or wrong data; how to roll back a worker deploy; who to contact upstream (AST's IT contact is now a real relationship — record the thread); and the "do not do this while panicking" list (no force-push, no `git add -A`, no deploy from a dirty tree).

## 5 · Dependency and supply chain
`npm audit` (report, do not auto-fix), pinned vs floating versions, anything loaded from a CDN at runtime, and whether any dependency has been added without review since the last check.

## STOP conditions
- A live credential is found exposed in a currently-public place → **stop everything, put it at the very top of the night's report**, and do not attempt remediation yourself.
- Any proposed change would alter authentication behaviour → propose only.

## Gates
Nothing rotated, nothing deployed, no auth changed · no secret value written into any file, log, commit message or PR body — reference secrets by name only · `docs/_private/` never staged.

## PR body
The secret inventory (names only), the endpoint table, the durability answer per key class with the irreplaceable ones named, and the proposed backup design.
