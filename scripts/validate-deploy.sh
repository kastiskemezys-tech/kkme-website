#!/bin/bash
WORKER="https://kkme-fetch-s1.kastis-kemezys.workers.dev"
FAIL=0
echo "=== KKME Deploy Validation ==="

echo "--- /health/validate ---"
RESULT=$(curl -s "$WORKER/health/validate")
STATUS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null)
echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'  ERROR: {e}') for e in d.get('errors',[])]" 2>/dev/null
echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'  WARN:  {w}') for w in d.get('warnings',[])]" 2>/dev/null
echo "Status: $STATUS"
if [ "$STATUS" != "PASS" ]; then FAIL=1; fi

echo ""
echo "--- S2 activation merge ---"
curl -s "$WORKER/s2" | python3 -c "
import json,sys; d=json.load(sys.stdin)
lt = d.get('activation',{}).get('lt',{})
p50 = lt.get('afrr_p50')
if p50 and 100 < p50 < 300:
    print(f'PASS: activation.lt.afrr_p50 = {p50}')
else:
    print(f'FAIL: activation.lt.afrr_p50 = {p50}')
    sys.exit(1)
" || FAIL=1

echo ""
echo "--- CPI trajectory ---"
curl -s "$WORKER/s2" | python3 -c "
import json,sys; d=json.load(sys.stdin)
traj = d.get('trajectory',[])
cpis = {t['year']: t['cpi'] for t in traj if t.get('phase') == 'MATURE'}
if len(set(cpis.values())) <= 1:
    print(f'FAIL: All MATURE CPIs identical: {cpis}')
    sys.exit(1)
else:
    print(f'PASS: CPIs differentiate: {cpis}')
" || FAIL=1

echo ""
echo "--- Editorial language ---"
EDITORIAL=$(grep -rn "Approaching equilibrium\|Very strong\|Strongly supportive\|Revenue support holds\|Compression risk\|sdInterpretation\|sdImpactDesc" app/components/S1Card.tsx app/components/S2Card.tsx 2>/dev/null | grep -v "^.*:.*//")
if [ -n "$EDITORIAL" ]; then
  echo "FAIL: Editorial language found:"
  echo "$EDITORIAL"
  FAIL=1
else
  echo "PASS: No editorial language"
fi

echo ""
if [ $FAIL -eq 0 ]; then
    echo "ALL CHECKS PASSED"
else
    echo "SOME CHECKS FAILED"
    exit 1
fi
