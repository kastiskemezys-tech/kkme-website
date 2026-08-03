# Phase 40 — gate consolidation and CI hardening (overnight item 2)

**Branch:** `phase-40-gate-hardening`. **Autonomous, box 2 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** The single most repeated failure in this project is **a gate that cannot fail**. Documented instances in the last week alone: the workflow tests gate taking `tail`'s exit status (B-053); the `pipefail` test matching the word in a comment; the grep gate whose `[^\n]` excluded the letter n; the NDA gate that built a 12 MB shell variable and lost the untracked path; the non-negative-principal invariant no golden case could reach; two of CC's own new specs passing with the bug reinjected. Every one was found by injection, none by running the gate. **This phase makes injection the standard rather than the heroic act.**

---

## 1 · Inventory (A7, with search commands and counts)

Enumerate **every** gate in the repo: npm scripts, CI workflow steps, grep gates, assertion scripts, leak tests, byte-identity probes, register/drift checks, editorial-chip lint, manifest single-writer lint, private-staged assert, NDA name/figure gate. For each: what it claims to cover, where it runs (local / CI / pre-commit / nowhere), and whether anything has ever proven it failable.

Output `docs/gates.md` — the gate manifest. One row per gate: name · command · what it covers · where it runs · **last proven-failable date** · the injection that proves it.

## 2 · The self-test harness — the phase's core deliverable

Build a harness that, for each registered gate, applies a **declared injection**, asserts the gate goes red, reverts, and asserts it goes green. Injections are declared as data next to each gate (a patch, a file write, an env change), not hand-run.

- `npm run gates` runs every gate. `npm run gates:selftest` runs every declared injection.
- **A gate with no declared injection is a FAILURE of `gates:selftest`**, not a skip. That single rule is what stops the class recurring.
- The harness itself needs a positive control: a deliberately broken gate that must be reported as broken, so a harness that silently passes everything is caught (this is the trap the NDA gate fell into).
- Restoration must be verified byte-identically after every injection (sha256 before/after), and the harness must fail loudly if it cannot restore — never leave the tree dirty.

## 3 · CI wiring

Every gate that can run in CI, runs in CI, on every PR. `set -o pipefail` on every piped step (B-053's class — check all workflows, not just the one we know about). Report any gate that cannot run in CI and why, rather than silently leaving it local-only.

## 4 · Coverage gaps to close if time allows, in this order

1. **NDA name/figure gate in CI** — it currently exists locally; a counterparty name reached four pushed commits because nothing checked.
2. **Byte-identity probe generalised** — `scripts/_phase-39-byte-identity.mjs <ref>` already exists; make it a first-class `npm run gate:byte-identity <ref>` with the ref defaulting to `origin/main`.
3. **Rendered-output assertions** — the `/s4` whitelist hid a signed-off fix for weeks because tests asserted field presence, not rendered output. Add at least one rendered-output gate for the canonical S/D caption and the quarantine tooltip so the class is covered by construction.

## STOP conditions
- The harness cannot restore a file byte-identically after an injection → stop, report, leave nothing dirty.
- Wiring a gate into CI would require a new secret or external service → stop and report; no new secrets overnight.

## Gates on this phase
`/revenue` 54/54 byte-identical · every new gate has a declared injection and is proven red-then-green · the harness has a positive control · working tree clean at exit · `docs/_private/` never staged.

## PR body must contain
The gate manifest table, the count of gates that had no declared injection at the start, and the count at the end.
