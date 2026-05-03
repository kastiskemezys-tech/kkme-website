# Phase 12.8 — Dispatch render-error fix + boundary upgrade

**Branch:** `phase-12-8-dispatch-render-error` → `main`
**Issue:** External 2026-04-29 design audit reported a bare `SIGNAL ERROR` placeholder on the "Dispatch intelligence" section of kkme.eu — the fallback rendered by `<ErrorBoundary>` at `app/components/ErrorBoundary.tsx:47` when its `componentDidCatch` traps a render exception inside `<TradingEngineCard>`.

---

## TL;DR for the reviewer

**Two things to know before you read the diff:**

1. **The audit's transient `SIGNAL ERROR` does not currently reproduce against the live worker payload.** Live kkme.eu, `npm run dev`, and `npx serve out` all render `<TradingEngineCard>` cleanly with today's `/api/dispatch?dur=4h&mode=realised` payload. **This PR is preventive hardening, not retroactive proof-of-fix.** The 6 throw-eligible candidates were each verified to throw under synthetic degraded payloads (12 specs failed pre-fix → 12 passing post-fix). If the underlying transient recurs, the boundary now contains it gracefully and the affected render path no longer throws.

2. **`<ErrorBoundary>` is still used at `app/page.tsx:121` for `<RevenueCard>`.** Same bare "SIGNAL ERROR" risk applies to that consumer. **Out of scope this phase per the prompt's explicit OUT-of-scope rule** (narrow to the dispatch wrapper only). Logged for follow-up sweep — every remaining `<ErrorBoundary>` consumer should swap to `<CardBoundary signal="...">`. Cheap and mechanical.

---

## What's in this PR

### Investigation (commit 1)

`docs/investigations/phase-12-8-dispatch-render-error.md` — 211-line write-up of:

- Repro paths attempted (A: dev, B: local prod build, C: live) — all clean today.
- Audit-vs-current worker payload comparison (audit-time had `daily_eur=335`, `da_*_eur_mwh: 0` × 3; today has `daily_eur=526`, `da_avg=104.3`).
- Full 9-candidate throw-site enumeration with priority ranking. Most likely audit-time root cause: `hourly_dispatch` null/non-array under empty A44 (Candidate 1) — same data-shape window as the all-zero DA context fields.
- Fix plan + future-engineer repro recipe for the next time this regression class surfaces.

### Throw-site fix + tests (commit 2)

Defensive guards at 4 of the 6 throw-eligible candidates. Two candidates (`qualityColor` unexpected string + `dailyAvgPerHour` edge cases) passed pre-fix → no production change per scope discipline (don't add guards for hypothetical throws).

Empirical fail-then-pass results:

| # | Candidate | Pre-fix | Outcome |
|---|-----------|---------|---------|
| 1 | `hourly_dispatch` null/non-array | **FAILED** (TypeError: null.map @ dispatchChart.ts:31; HourlyChart renderToStaticMarkup throws) | Fixed at helper + component (Array.isArray guards). |
| 2 | `revenue_per_mw.annual_eur` null/undefined | **FAILED** (TypeError: null.toLocaleString) | Fixed via `formatHeadlineAnnualLabel(annualEur ?? 0)`. |
| 3 | `meta.sources` null/undefined/non-array | **FAILED** (TypeError: undefined.join, sources.join is not a function) | Fixed via `formatSourceFooterLabel` (Array.isArray + fallback `'—'`). |
| 4 | `isp_dispatch` null/undefined | **FAILED** (TypeError: null.map @ ISPTable; drawer renders children even when collapsed) | Fixed via `Array.isArray(isps) ? isps : []`. |
| 5 | `capture_quality_label` unexpected string | **PASSED** (qualityColor returns `'var(--text-muted)'` default) | No production change. Spec locks against future regression. |
| 6 | `dispatchChart.ts` helpers edge inputs | **FAILED** for normaliseHourlyDispatch null/undef/non-array; **PASSED** for dailyAvgPerHour (returns NaN) | Same fix as Candidate 1. dailyAvgPerHour left unchanged. |

Throw-eligible inline JSX expressions hoisted to two named exports (`formatHeadlineAnnualLabel`, `formatSourceFooterLabel`) so the tests can probe them directly. `HourlyChart` and `ISPTable` exported at module scope for the same reason.

Net source delta: ~30 lines (1 in `dispatchChart.ts`, ~30 in `TradingEngineCard.tsx`).

### Boundary upgrade (commit 3)

`app/page.tsx:140`: `<ErrorBoundary>` → `<CardBoundary signal="trading">`. The bare "SIGNAL ERROR" placeholder is gone; the same retry-bearing fallback pattern S1/S2/S3/S4/etc. all already use takes its place.

`<CardBoundary>` improvements (in scope per the prompt's §2.2):

- Fallback markup extracted into a named `<CardBoundaryFallback>` export so vitest can probe its rendered shape via `react-dom/server`'s `renderToStaticMarkup`. (Class-component error boundaries don't trap throws under the static renderer, so a behavioural test of catch-then-render is impossible without jsdom + `@testing-library/react`, which the project intentionally doesn't ship per Session 25. The fallback-markup tests + source-text canary on `app/page.tsx` together cover the post-fix surface.)
- `role="status"` + `aria-live="polite"` on the fallback container so assistive tech announces the error state.
- Dev-mode (NODE_ENV === "development") hint pointing at the `[Card crash — <signal>]` browser-console log emitted by `componentDidCatch`.

8 boundary specs.

### Handover + visual audit (commit 4)

- `docs/handover.md` Session 27 entry — full investigation summary, fix description, verification gates, 5 backlog items.
- `docs/visual-audit/phase-12-8-fix/` — pre-fix prod state + dev clean, post-fix dev clean + boundary triggered + prod clean, plus post-push preview-deploy verification screenshots (06, 07).
- `docs/phases/phase-12-8-pr.md` — this document.

---

## Verification gates

- `npx tsc --noEmit` — clean (0 errors).
- `npm run lint` — 169 problems (40 errors, 129 warnings). **Identical to baseline `main` count**, verified by stash + re-lint. Zero new lint errors introduced.
- `npm test` — **837 → 866** (+29: 21 guard specs + 8 boundary specs). All passing.
- `npm run build` — exits 0, 6 routes prerendered to `./out`.
- `grep -rnE "console\.count|\[diag\]|test throw|phase128_test_throw" app/` — zero diagnostic leftovers.
- `grep -rn "rgba(" app/` excluding token defs — zero raw rgba introduced.
- Visual audit on dev (`localhost:3000`) + local prod build (`localhost:3001`) + post-push preview deploy: Dispatch card renders cleanly; control toggles (2H / 4H / Today / Tomorrow) and 30-mousemove canvas hover sweep produce zero boundary fallback, zero new console errors. Phase 7.7e Session 25 chart-tooltip dedupe still holds.
- Synthetic boundary trigger via `?phase128_test_throw=1` query: new `<CardBoundaryFallback>` renders correctly with signal name, retry button, dev hint, `role="status" aria-live="polite"`. Synthetic throw removed before commit (verified clean post-removal render).

---

## Out of scope (per prompt §What's-explicitly-OUT)

- Worker-side `computeDispatchV2` or any `/api/dispatch` logic. Worker is healthy.
- Replacing `<ErrorBoundary>` everywhere on the site. Narrowed to the dispatch wrapper only — `<RevenueCard>` at `app/page.tsx:121` retains `<ErrorBoundary>` (logged for follow-up sweep, see TL;DR #2).
- Migrating `<TradingEngineCard>` to a different chart library or restructuring its render tree.
- Loading-skeleton shimmer (auditor's #2). Existing `Loading dispatch intelligence…` text state at `TradingEngineCard.tsx:347` is sufficient; shimmer is a polish-bundle item.
- "Coming soon" state (auditor's #3). N/A — dispatch IS built and live.
- Sentry SDK integration. `console.error` in `componentDidCatch` already exists; full observability is a separate infrastructure phase.
- `gh pr create`. Operator opens PRs via GitHub web UI per `CLAUDE.md`.

---

## Backlog (logged in handover Session 27 for Notion sync)

1. **`market_context.da_avg_eur_mwh: 0` worker-side bug** — Worker / Bug / P3 Medium. Most plausible upstream root cause of the audit's transient render failure (empty A44 fetch zeroes the DA fields and can null `hourly_dispatch[].da_price_eur_mwh` cascading downstream). Investigate when next touching `computeDispatchV2`.
2. **Sentry / Cloudflare-Logpush integration for `componentDidCatch` errors** — Infrastructure / Enhancement / P3 Low. Auditor's #4 (P5 list).
3. **CardBoundary polish — last-successful-fetch line + signal-keyed dev URL** — Cards / Enhancement / P3 Low. Deferred from prompt §2.2; dev hint is currently signal-generic console-trace pointer rather than dispatch-specific URL because `<CardBoundary>` is shared across S1/S2/S3/S4/etc.
4. **RevenueBacktest credibility issue** — Cards / Bug (credibility) / P1 Critical. Auditor's 2026-05-03 second-pass found that `RevenueBacktest` shows a flat amber "Y1 model €368" line vs varying realised €500–790 with self-reported +70.9% mean error, presented as a "backtest". Authored as Phase 12.8.1 hot-fix immediately after 12.8 ships.
5. **Remaining `<ErrorBoundary>` consumers** — Cards / Tech Debt / P3 Medium. `<RevenueCard>` at `app/page.tsx:121` still uses `<ErrorBoundary>`; same risk applies. Follow-up sweep should swap every remaining consumer to `<CardBoundary signal="...">`.

---

## Rollback plan

If the throw-site fix introduces a regression (e.g. one of the `??` defaults breaks the headline display when data IS present):

```
git revert <commit-3-sha> <commit-2-sha>
```

Revert keeps the investigation + handover commits but drops the throw-fix and boundary-swap. Branch reverts to investigation-only.

If only the boundary swap regresses (`<CardBoundary>` missing some style or behavior `<ErrorBoundary>` had):

```
git revert <commit-3-sha>
```

Independent rollback path because boundary commit is separate from throw-fix commit.
