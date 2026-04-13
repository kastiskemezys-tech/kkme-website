#!/bin/bash
# KKME Pre-commit verification — run before committing TypeScript changes.
# Usage: bash scripts/verify.sh

FAIL=0

echo "=== KKME Pre-commit Verification ==="
echo ""

# ── TypeScript check ──
echo "--- TypeScript (tsc --noEmit) ---"
npx tsc --noEmit 2>&1
if [ $? -ne 0 ]; then
  echo "FAIL: TypeScript errors"
  FAIL=1
else
  echo "PASS"
fi
echo ""

# ── Build check ──
echo "--- Build (npm run build) ---"
npm run build 2>&1 | tail -5
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "FAIL: Build failed"
  FAIL=1
else
  echo "PASS"
fi
echo ""

# ── Diff summary ──
echo "--- Changes to be committed ---"
git diff --stat HEAD 2>/dev/null
git diff --stat --cached 2>/dev/null
echo ""

if [ $FAIL -eq 0 ]; then
  echo "ALL CHECKS PASSED — safe to commit"
else
  echo "SOME CHECKS FAILED — fix before committing"
  exit 1
fi
