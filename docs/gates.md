# Gate manifest

**Generated from `scripts/gates/registry.mjs` — do not hand-edit.**
Run `node scripts/gates/manifest.mjs` to regenerate; `--check` is asserted by the suite,
so a gate added without regenerating this file is a red test rather than a stale document.

## The rule this file exists to enforce

**A gate with no declared injection is a FAILURE of `npm run gates:selftest`, never a skip.**

The single most repeated failure in this project is a gate that cannot fail. In one week:
the workflow-tests gate taking `tail`'s exit status (B-053); the `pipefail` test matching
the word in a comment; a grep gate whose `[^\n]` excluded the letter n; the NDA gate
building a 12 MB shell variable and losing the untracked path; a non-negative-principal
invariant no golden case could reach; two new specs passing with the bug reinjected.
Every one was found by injection. Not one by running the gate.

## Commands

| command | what it does |
|---|---|
| `npm run gates` | run every registered gate |
| `npm run gates:selftest` | apply every declared injection, assert red, revert, assert green |
| `npm run gate:byte-identity [-- <ref>]` | `/revenue` 54-config payload identity vs a ref (default `origin/main`) |
| `npm run gate:eslint-delta` | eslint error count vs the recorded baseline |

## The gates

11 registered · 11 with a declared injection · 0 without.

| id | command | covers | where it runs | declared injection |
|---|---|---|---|---|
| `tests` | `npx vitest run` | Engine maths, worker routes, dispatch, debt sizing, fleet lifecycle, consultancy pipeline, React components. 2314 assertions. | local + CI | un-monitor s1_capture — the exact 38.1 defect, re-introduced |
| `no-editorial-chips` | `npm run --silent lint:no-editorial-chips` | Forbids `phase: 'TIGHTENING'|'STABLE'|… ` reaching app/components — the locked brand principle that data speaks, not editorial labels. | local + CI | re-introduce an editorial chip in a real component |
| `no-raw-spacing` | `npm run --silent lint:no-raw-spacing` | Value-aware spacing gate over shorthand and per-side padding/margin props in app/**. | local + CI | raw px spacing in a real component file |
| `manifest-single-writer` | `npm run --silent lint:manifest-single-writer` | Forbids from-scratch construction of a manifest another module carries forward — the B-048 provenance-deletion path. | local + CI | a second from-scratch manifest writer, in the gate's real scope |
| `private-staged` | `bash scripts/assert-no-private-staged.sh` | Index and tracked-file scope of the private tree, plus the .gitignore rule itself. | local + CI (CI has no private tree, so it asserts the ignore rule only) | force-stage a file from the private tree |
| `nda` | `bash scripts/nda-gate.sh main` | Diff vs base + uncommitted + staged + every untracked non-ignored file, against the private needle list. Carries its own positive control. · **NOT seen:** disclosure by FILE PATH rather than file content — tool output that enumerates private-tree paths | local ONLY — blocked from CI, see below · **CI-BLOCKED:** needle list is gitignored by design; wiring it into CI requires a new repository secret | plant a real needle, read from the private list at run time so it never enters the repo |
| `fixture-currency` | `npm run --silent fixtures:regen -- --check` | The committed deliverable-input fixture vs a fresh `build-all --offline`. deliverable.test.ts and xlsx.test.ts grade the FIXTURE, so this is what stops them grading a reviewed-but-stale artifact — the currency half of B-034. · **NOT seen:** value drift INSIDE the fixture — the consumer suites mirror it; this gate and the hash manifest catch that | local + CI | age the fixture by moving an engine number in it |
| `regression-baseline` | `node tools/consultancy/regression-reference.mjs` | computeRevenueV7 over every public (dur × capex × cod × scenario) against the frozen KV fixture. Any drift means the public site moved. | local + CI | move a public number by nudging the reference capex default |
| `eslint-delta` | `node scripts/gates/eslint-delta.mjs` | Repo-wide eslint. Absolute-zero is unreachable (main carries a pre-existing error backlog), so the gate is a DELTA against a recorded baseline — which is failable, where the absolute gate is not. | local + CI | add one new eslint error |
| `evidence-freshness` | `npm run --silent evidence:freshness` | Per-source last_successful_refresh vs cadence for the eight mature-market series grounding the 36.E forecasts. | local + CI | age a source past its threshold |
| `_positive_control` | `true` | Nothing. Exists so that a self-test which passes everything is caught. | selftest only | break the world; this gate will not notice, and that is the point |

## Known blind spots

Recorded rather than fixed, so they stay visible:

1. **The B-053 pipefail guard cannot see `defaults.run.shell`.**
   `tools/consultancy/__tests__/refreshWorkflow.test.ts` inspects `run:` blocks only. A
   workflow that sets `pipefail` once via `defaults:` reads to the guard as unprotected.
   `gates.yml` therefore sets the flag redundantly in its piped block rather than have the
   guard taught to accept it — editing a guard so it accepts new code is the move B6 forbids.

2. **The NDA gate is local-only.** Its needle list lives under `docs/_private/` and is
   gitignored by design: publishing the list of forbidden strings would publish them.
   Wiring it into CI means putting that list in a repository secret. `npm run gates`
   reports it as `CI-BLOCKED` with the reason attached whenever `CI` is set — it is never
   silently dropped, because "not in the set" and "in the set but not run here" are exactly
   what a manifest exists to distinguish.

3. **`npm run lint` is not a gate and is not registered as one.** Repo-wide eslint exits 1
   on untouched `main` (85 errors, mostly react-compiler diagnostics in long-lived
   components). A check that is red before anyone touches anything cannot tell "this branch
   broke something" from "this repo has always been like this". `eslint-delta` replaces it
   with a delta against a recorded baseline, which is failable in both directions.

4. **The NDA gate scans file CONTENT, not file PATHS — and a path can disclose.**
   `eslint -f json` prints an absolute `filePath` for every file it visits. The private
   tree's filenames are themselves counterparty-suggestive: a term-sheet filename names the
   counterparty without quoting a line of it. A lint report pasted into a PR, an issue or a
   chat therefore carried names the needle scan would never fire on — no needle appears in
   that JSON, only paths do, so the gate reported a clean pass on a real disclosure.

   Closed at the source rather than by inventing path-shaped needles: `docs/_private/**` is
   now in eslint's `globalIgnores`, so those paths are no longer produced. That also moved
   the eslint baseline from 87 errors to **85** — the two that disappeared were the private
   file's own, which is the accounting check that the ignore did what it claims and nothing
   more.

   **The general form stays open, and is the thing to watch.** Any tool that enumerates
   paths across the repo can disclose by path while the NDA gate passes on content: test
   reporters, coverage output, `tsc` diagnostics, bundle analysers, or a `git status`
   pasted verbatim. Recorded on the `nda` gate as its `notSeen` field.

## Positive control

The registry carries `_positive_control`: a gate (`true`) that passes whatever happens to
the tree. `gates:selftest` must **report it as broken**. A self-test that comes back clean
*including* the control has caught nothing — which is precisely the state the NDA gate was in
when its 12 MB shell variable swallowed the match and it reported PASS on a live violation.
