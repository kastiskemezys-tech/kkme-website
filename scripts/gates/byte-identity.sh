#!/bin/bash
# Phase 40 §4.2 — `npm run gate:byte-identity [<ref>]`, ref defaulting to origin/main.
#
# Wraps scripts/_phase-39-byte-identity.mjs, which needs a reference CHECKOUT
# rather than a ref. This creates that checkout as a real git worktree and
# removes it afterwards — never `git stash`, which produced a sign-wrong client
# delta in 36.D (playbook C6).
#
# Usage:
#   npm run gate:byte-identity                  # vs origin/main
#   npm run gate:byte-identity -- HEAD~3        # vs an arbitrary ref
#   npm run gate:byte-identity -- main --additive
set -uo pipefail

REF="${1:-origin/main}"
case "$REF" in --*) REF="origin/main"; set -- "origin/main" "$@";; esac
shift 2>/dev/null || true
EXTRA=("$@")

if ! git rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
  echo "byte-identity: cannot resolve ref '$REF'"
  echo "Refusing to report a pass from a check that did not execute."
  exit 2
fi
SHA=$(git rev-parse --short "$REF")

# Portable across BSD and GNU mktemp. `mktemp -d -t kkme-byteid` works on macOS,
# where -t treats the argument as a prefix, and FAILS on GNU/Linux with "too few
# X's in template" — so this gate passed on a laptop and aborted in CI, which is
# how it shipped. Giving the template explicit X's and no -t satisfies both.
WT=$(mktemp -d "${TMPDIR:-/tmp}/kkme-byteid.XXXXXXXX")
rm -rf "$WT"
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"; }
trap cleanup EXIT

if ! git worktree add --detach "$WT" "$REF" >/dev/null 2>&1; then
  echo "byte-identity: could not create a reference worktree at $WT"
  exit 2
fi

echo "byte-identity: comparing working tree against $REF ($SHA)"
node scripts/_phase-39-byte-identity.mjs "$WT" ${EXTRA+"${EXTRA[@]}"} 2>&1 \
  | grep -vE "MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|To eliminate this warning|trace-warnings|^\(node:"
exit "${PIPESTATUS[0]}"
