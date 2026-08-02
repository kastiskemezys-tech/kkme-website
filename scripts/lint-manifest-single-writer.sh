#!/usr/bin/env bash
# 36.E0.2 — one canonical writer per manifest artifact (discipline rule #4).
#
# The defect this forbids: a fetcher building its manifest object from scratch and writing it with
# a bare `fs.writeFile`. Seven of them did exactly that. Run through the orchestrator it looked
# fine, because the orchestrator read the file back and re-wrote it through the preserve path — so
# the bypass was invisible in every orchestrated run and only real when a fetcher was run directly,
# which is how each of them is developed and re-probed.
#
# What a from-scratch write costs is not the file: it is `coverage_verification` (E0's record of
# HOW each source lies, which a windowed re-fetch cannot re-derive) and `last_successful_refresh`
# (the field the staleness surface AGES — so dropping it does not raise an alarm, it exempts the
# source from the alarm permanently).
#
# Every manifest write must therefore go through tools/consultancy/mature-markets/manifest-writer.mjs.

set -uo pipefail
cd "$(dirname "$0")/.."

WRITER='tools/consultancy/mature-markets/manifest-writer.mjs'

# Any writeFile whose target names a manifest artifact, anywhere except the canonical writer itself.
# `.*` and not `[^\n]*`: grep is line-based, and inside a bracket expression `\n` is the literal
# pair backslash/n — so `[^\n]*` excludes the letter n and silently failed to match
# `fs.writeFile(path.join(OUT, 'manifest.json')...` because of the n in `join`. Caught by running
# the inject-then-remove control; the first version of this gate reported PASS on a live violation.
HITS=$(grep -rEn "writeFile.*(manifest\.json|structural-breaks\.json)" \
        tools scripts workers app 2>/dev/null \
        | grep -v "^${WRITER}:" \
        | grep -v '^scripts/lint-manifest-single-writer.sh:' \
        | grep -v '__tests__' \
        | grep -v '/node_modules/')

if [ -n "$HITS" ]; then
  echo "FAIL — manifest written outside the canonical writer (${WRITER}):"
  echo "$HITS"
  echo
  echo "Use: import { writeManifest } from './manifest-writer.mjs'"
  echo "     await writeManifest({ dir: OUT, manifest, window: '<full|current_year|current_year_number>', dataset: '<name>' });"
  exit 1
fi

# The gate must be able to fail. A grep that matches nothing because its pattern is wrong reports
# the same green as a codebase that is actually clean (B11), so assert the canonical writer is
# present and does contain the write the pattern is looking for.
if ! grep -qE "writeFile\(file," "$WRITER"; then
  echo "FAIL — ${WRITER} does not contain the manifest write this gate is calibrated against."
  echo "Either the writer moved or the pattern above no longer matches reality; a gate that cannot"
  echo "see the one legitimate write cannot see an illegitimate one either."
  exit 1
fi

echo "PASS — every manifest write routes through ${WRITER}"
