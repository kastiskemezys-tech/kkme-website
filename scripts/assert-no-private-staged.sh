#!/bin/bash
# Phase 37 non-negotiable: nothing under docs/_private/ ever enters the index or the repo.
# Run before every commit in this phase; part of the gate set.
#
# Checks three ways the seed data could leak into git:
#   1. staged for commit
#   2. tracked at all (a past commit)
#   3. no longer ignored (a .gitignore regression)
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

staged=$(git diff --cached --name-only | grep '^docs/_private/' || true)
if [ -n "$staged" ]; then
  echo "FAIL: files under docs/_private/ are STAGED:"; printf '  %s\n' $staged; fail=1
else
  echo "PASS: nothing under docs/_private/ is staged"
fi

tracked=$(git ls-files docs/_private/ || true)
if [ -n "$tracked" ]; then
  echo "FAIL: files under docs/_private/ are TRACKED:"; printf '  %s\n' $tracked; fail=1
else
  echo "PASS: nothing under docs/_private/ is tracked"
fi

# the ignore rule itself must still be in force
if git check-ignore -q docs/_private/; then
  echo "PASS: docs/_private/ is gitignored"
else
  echo "FAIL: docs/_private/ is NO LONGER gitignored — .gitignore regression"; fail=1
fi

# the seed workbook specifically, by name, in case the directory rule is ever narrowed
for f in docs/_private/fleet-intel/*.xlsx docs/_private/fleet-intel/*.csv; do
  [ -e "$f" ] || continue
  if git check-ignore -q "$f"; then
    echo "PASS: ignored — $f"
  else
    echo "FAIL: NOT ignored — $f"; fail=1
  fi
done

exit $fail
