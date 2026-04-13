# Playbook: Verification

"Verify with actual output" — never substitute "I think this works" for "I confirmed this works."

## Before every commit that changes code

1. **Type check:** `npx tsc --noEmit`
2. **Build check:** `npm run build`
3. **Curl check:** Hit the affected endpoint(s) and verify the response is correct.
4. **Visual check:** If the change is visual and chrome-devtools MCP is available, take a screenshot and compare to baseline.

## Before every worker deploy

1. Run `npx wrangler deploy`
2. Run `bash scripts/validate-deploy.sh`
3. If validation fails, fix the worker before deploying frontend.
4. Manually curl 2-3 key endpoints to spot-check.

## Before every frontend deploy

1. `npx tsc --noEmit`
2. `npm run build` (this IS the deploy for Cloudflare Pages via git push to main)
3. After push, wait ~60s and curl `https://kkme.eu` to confirm deployment.

## What "verify" means per change type

| Change type | Verification method |
|-------------|-------------------|
| Worker endpoint logic | curl the endpoint, check response JSON |
| Frontend component | Build succeeds + visual check if MCP available |
| CSS/design token | Visual check in both dark and light mode |
| Data pipeline | Curl endpoint, verify freshness timestamp is recent |
| Revenue model | Curl `/revenue?dur=4h&capex=mid&cod=2028&scenario=base`, check IRR is plausible |
| Docs only | No verification needed beyond spell check |

## When verification fails

Don't commit. Fix the issue first. If the fix is non-trivial, pause and report:
- What failed
- What you tried
- What you think the root cause is
- Whether it's safe to defer

Never ship a "fix it later" commit to main.
