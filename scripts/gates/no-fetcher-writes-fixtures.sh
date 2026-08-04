#!/usr/bin/env bash
# Phase 44 / B-043 — no fetcher may write a fixture directly.
#
# The point of a recorded fixture is that it is a photograph of the source AS OF
# when the parser was written, so a contract test fails when the source changes
# shape. Six fetchers re-photographed the source on every run, which keeps
# fixture and source in permanent agreement — the test then passes forever,
# including on the run where the source changed and the parser started producing
# empty output.
#
# Every FIXTURES write must go through `writeFixture()` in fixture-guard.mjs,
# which no-ops unless `--record-fixture` was passed explicitly.
#
# Proven by inject-then-revert: reintroducing a direct write turns this red.
set -uo pipefail
cd "$(dirname "$0")/../.."

GUARD='tools/consultancy/mature-markets/fixture-guard.mjs'

# A direct write is `writeFile(` whose FIRST argument names the fixtures dir or
# a fixture path variable. `.*` and not `[^\n]*`, for the reason recorded in
# lint-manifest-single-writer.sh: inside a bracket expression `\n` is the
# literal pair backslash/n, so `[^\n]*` excludes the letter n and a pattern
# containing `join` silently fails to match.
#
# A REAL false positive, fixed at the matcher rather than by weakening the rule
# — same precedent as the NDA gate's numeric-boundary fix. The first version
# also matched any variable literally named `fixturePath`, and flagged
# `scripts/audit-stack.mjs:621`. That write is not an ingestion fixture at all:
# it persists an ENGINE PROBE's own output to `outDir` so a later run can
# compute a delta. It photographs our own arithmetic, not an external source,
# so schema drift is not a thing it can hide and B-043 does not apply to it.
#
# So the `fixturePath` clause is scoped to the mature-markets tree, where the
# name genuinely means "a recorded sample of an upstream response". The
# `join(FIXTURES` clause stays repo-wide, because that one is unambiguous.
# BOTH controls are run below: the rule still fires on a real violation, and no
# longer fires on the probe output.
HITS=$( { grep -rEn "writeFile(Sync)?\((path\.)?join\(FIXTURES" tools scripts workers 2>/dev/null
          grep -rEn "writeFile(Sync)?\(fixturePath" tools/consultancy/mature-markets 2>/dev/null; } \
        | grep -v "${GUARD}:" \
        | grep -v 'scripts/gates/no-fetcher-writes-fixtures.sh:' \
        | grep -v '__tests__' \
        | grep -v '/node_modules/')

if [ -n "$HITS" ]; then
  echo "FAIL — fetcher writes a fixture directly, bypassing ${GUARD}:"
  echo "$HITS"
  echo
  echo "Use: import { writeFixture } from './fixture-guard.mjs'"
  echo "     await writeFixture(path.join(FIXTURES, '<name>'), contents);"
  echo
  echo "B-043: a fixture the fetcher rewrites every run cannot detect schema drift."
  exit 1
fi

# The gate must be able to fail. A grep that matches nothing because its pattern
# is wrong reports the same green as a clean tree (B11), so assert the guard
# exists and that the legitimate call site the pattern is calibrated against is
# actually present.
if [ ! -f "$GUARD" ]; then
  echo "FAIL — ${GUARD} is missing; this gate has nothing to enforce."
  exit 1
fi
ROUTED=$(grep -rc "await writeFixture(" tools/consultancy/mature-markets/*.mjs 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
if [ "$ROUTED" -lt 1 ]; then
  echo "FAIL — no fetcher routes through writeFixture(). Either the fetchers moved or this"
  echo "gate's pattern no longer matches reality; a gate that cannot see the legitimate"
  echo "write cannot see an illegitimate one either."
  exit 1
fi

echo "PASS — ${ROUTED} fixture write(s), all routed through ${GUARD}"
