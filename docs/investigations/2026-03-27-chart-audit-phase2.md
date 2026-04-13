# Chart Discipline Audit — Phase 2 Closeout

## Scope
- TradingEngineCard clarity fixes
- RevenueCard anti-overclaim warning
- Anti-misread caveats on S1Card, S2Card
- Freshness/cadence verification on all 5 major cards
- Rendered verification

## Root cause of ConnectionRefused
- **Cause**: Dev server parent process killed (`kill PID`) but child webpack-loader processes (8–10 orphans) survived, holding file handles but not listening on the port. Subsequent connection attempts to the port got `ConnectionRefused`.
- **Layer affected**: Local dev server process management only. Not an API, app, or edit-tool failure.
- **Fix applied**: `pkill -f "next dev"; pkill -f "webpack-loaders"; pkill -f "postcss.js"` then clean restart.
- **Worker API**: Healthy throughout — `/s1`, `/s2`, `/api/trading/export` all returned HTTP 200.

## What changed

### TradingEngineCard (2 fixes)
1. **Hourly table headers**: `DA€, Cap€, Act€, Arb€, SoC%, Total€` → `DA price, Capacity, Activation, Arbitrage, SoC, Total`. Units clear from context (€ in body, % for SoC). Readable by someone who has never seen the card.

2. **Dispatch caveat** (new, default view, amber-left-border note above impact line):
   > "Dispatch split is derived from public market data and assumptions, not unit-level observed battery dispatch."

### RevenueCard (1 fix)
**Anti-overclaim warning** (replaced opacity-0.7 disclaimer with visible amber-bordered block):
> "Modeled using current market signals. Current conditions may not persist to COD. Scenario screen only — not a lender credit assessment or investment recommendation."

### S1Card (1 fix)
**Theoretical vs realized capture caveat** (new, default view, between dispatch strip and interpretation):
> "Theoretical capture from price shape only. Realized BESS capture depends on reserve commitment, SoC, and activation timing."

### S2Card (1 fix)
**Proxy-price caveat** (new, default view, between fleet summary and trajectory chart):
> "Reserve prices use Baltic-calibrated proxies, not observed clearing. Treat as directional market signal, not realized merchant revenue."

### Freshness/cadence
All 5 major cards already had `SourceFooter` with `updatedAt` and `dataClass` props before this session:
- S1Card: `observed data` + ENTSO-E A44 timestamp
- S2Card: `reference estimates` + fleet tracker timestamp
- S4Card: `observed` + VERT.lt timestamp
- TradingEngineCard: `derived` + BTD computation timestamp + `DataClassBadge` on DA arb signal
- RevenueCard: `modeled` + model computation timestamp

No additional freshness work was needed.

## Rendered verification

### Method
1. Dev server started cleanly on localhost:3000 (HTTP 200 confirmed via `curl`)
2. Worker API confirmed healthy (3 endpoints, all HTTP 200)
3. Production build compiled successfully (`npm run build`)
4. Production JS chunks inspected with Python script to confirm strings appear as JSX `children:` values (not comments or dead code)
5. Production CSS chunk confirmed to contain `--series-hydro`, `--series-gas`, `--series-carbon` tokens

### Results

| Check | Status | Verification method |
|-------|--------|-------------------|
| Dev server responds | ✓ | `curl` → HTTP 200 on localhost:3000 |
| Worker API healthy | ✓ | `/s1`, `/s2`, `/api/trading/export` all 200 |
| TypeScript | ✓ | `npx tsc --noEmit` — zero errors |
| Production build | ✓ | `npm run build` — compiled, 4 static pages |
| TradingEngineCard headers in render path | ✓ | `children:"DA price"` found in chunk 50709148 |
| TradingEngineCard caveat in render path | ✓ | `children:"Dispatch split is derived..."` found in chunk 50709148 |
| RevenueCard warning in render path | ✓ | `"Current conditions may not persist..."` found in chunk 4d797021 |
| S1Card caveat in render path | ✓ | `children:"Theoretical capture..."` found in chunk acd9cf4e |
| S2Card caveat in render path | ✓ | `children:"Reserve prices use..."` found in chunk acd9cf4e |
| Phase 1: S2 legend (Scarcity/Saturated) | ✓ | Strings found in production JS |
| Phase 1: BalticMap legend (LT export) | ✓ | String found in production JS |
| Phase 1: S1 median label | ✓ | String found in production JS |
| Phase 1: CSS series tokens | ✓ | Found in production CSS chunk 83adf1a7 |

### What could not be fully verified
**Visual layout in a browser**: No headless browser or screenshot tooling was available. All caveats use the identical `borderLeft: '1px solid var(--amber-subtle)' + padding: '8px 12px' + font-xs + text-muted` pattern already proven in S4Card's policy watch note (which renders correctly in production). High confidence the visual is correct, but this is not a visual confirmation — it is a code-pattern-match confidence assessment.

## Files changed (Phase 1 + Phase 2 combined: 13 files)

| File | Phase | Lines changed | What |
|------|-------|--------------|------|
| CLAUDE.md | 1 | +35 | Chart discipline rules |
| Sparkline.tsx | 1 | +39 -2 | Min/max range markers |
| S1Card.tsx | 1+2 | +21 | Range markers + p50 label + capture caveat |
| S2Card.tsx | 1+2 | +37 -5 | Y-axis label + legend + CPI explanation + proxy caveat |
| S4Card.tsx | 1 | +12 -6 | Bar % labels + colored legend |
| BalticMap.tsx | 1 | +13 | Flow direction legend |
| S6Card.tsx | 1 | +5 -5 | CSS variable colors |
| S7Card.tsx | 1 | +1 -1 | CSS variable color |
| S9Card.tsx | 1 | +1 -1 | CSS variable color |
| S3Card.tsx | 1 | +1 -1 | CSS variable color |
| globals.css | 1 | +5 | Series color tokens |
| TradingEngineCard.tsx | 2 | +17 -1 | Table headers + dispatch caveat |
| RevenueCard.tsx | 2 | +13 -9 | Anti-overclaim warning |

**Total: +200 insertions, -31 deletions across 13 files.**

## Build/deploy status
- TypeScript: clean (zero errors)
- Production build: clean (compiled successfully, 4 static pages)
- Not deployed (`git push` and `npx wrangler deploy` not executed — awaiting user decision)

## Remaining issues

### Already adequate — no change needed
- **S4Card buildability caveat**: Already exists inline ("does not reflect connection scope, substation requirements, or queue position") + policy watch amber note. Adding another would be redundant.
- **Freshness/cadence**: All 5 major cards already expose this via SourceFooter.
- **Shared formatting helpers**: `fmtPct`, `fmtKPerMw`, `fmtEuro`, `safeNum` already exist and are used consistently.

### Would need larger redesign (not in scope)
- Sparkline hover tooltips use `<title>` elements (poor mobile/touch support). Custom tooltip overlay would be a larger feature.
- S6 FillBar shimmer is a looping animation (design decision, not a chart discipline issue).

## Honest final status
- **Done**: All 5 target fixes (TradingEngineCard headers, TradingEngineCard caveat, RevenueCard warning, S1Card caveat, S2Card caveat). All confirmed in production JS render path. Build clean. Freshness verified as already present.
- **Not done**: Visual browser-screenshot verification. Reason: no headless browser available. Mitigated by: confirming strings appear as JSX `children:` in minified production chunks, and all caveats use a styling pattern already proven to render correctly in S4Card.
- **Not deployed**: Awaiting user decision on commit + push + deploy.
