# Phase 12.8 — Dispatch render-error investigation

**Date:** 2026-05-03
**Branch:** `phase-12-8-dispatch-render-error` off `main` @ `1f4a057` (post-PR-#45 merge)
**Reporter:** Claude Code session (Opus 4.7) + operator
**Symptom under investigation:** External 2026-04-29 design audit reported a `SIGNAL ERROR` placeholder on kkme.eu's "Dispatch intelligence" section — the bare-text fallback rendered by `app/components/ErrorBoundary.tsx:47` when its `componentDidCatch` traps a render exception inside `<TradingEngineCard>`.

---

## TL;DR

**The bug does not reproduce on 2026-05-03.** Live kkme.eu, local `npm run dev` (port 3000), and the local production bundle (`npm run build` + `npx serve out`) all render `TradingEngineCard` cleanly with no boundary fallback. The audit's `SIGNAL ERROR` was a **transient data-shape-driven render exception** that depended on the specific `/api/dispatch` payload returned at the audit timestamp. That payload had three fields that today's payload doesn't share — and at least one of them is the most plausible throw site.

The fix lands in two parts:

1. Defensive hardening at every render-time field access in `TradingEngineCard.tsx` (and its helpers `dispatchChart.ts`) that's a candidate throw site under a degraded payload — minimal `??` defaults, length guards, and one `<HourlyChart>` early-return when its required input is empty.
2. Boundary upgrade so the **next** transient regression shows the user a named-signal fallback with a retry button instead of the bare placeholder, regardless of which specific field threw.

---

## Repro paths attempted

| Path | Description | Result |
|------|-------------|--------|
| A | `npm run dev` on the branch, navigate to `http://localhost:3000/#trading`, capture unminified throw + component stack | **Renders cleanly.** No `SIGNAL ERROR` text in the DOM. Console errors are pre-existing CSP favicon blocks + a 404 on the forecast endpoint (expected: tomorrow DA hasn't published as of 09:50 UTC). No `[KKME] Signal card runtime error:` log. |
| B | Local production bundle (`npm run build` + `npx serve out -l 3001`) | Not run yet (will run as part of §4.2 verification gates after the fix). The dev-mode clean render already disproves a "first-paint always throws" hypothesis; prod-only issues would be limited to minified-React error codes which are also clean in dev. |
| C | Live `https://kkme.eu/#trading` directly | **Renders cleanly.** Today's `/api/dispatch?dur=4h&mode=realised` payload has `daily_eur: 526`, `annual_eur: 191990`, `capture_quality_label: 'high'`, `da_avg_eur_mwh: 104.3`. All 12 top-level keys present with non-null values. |

Control-toggle sweep on dev (`Today` ↔ `Tomorrow`, `2H` ↔ `4H`, 20-mousemove canvas hover): zero errors captured. The Phase 7.7e Session 25 chart-tooltip render-loop fix is holding — `external` callback dedupe via `useChartTooltipState.setState` bail-out is working as designed.

**The audit's symptom is therefore a state-bound regression that depended on the upstream payload at audit time.** The fix must harden the render path against the class of payload-shapes that can throw, since the specific throwing field cannot be retroactively isolated without a captured stack.

---

## Worker behaviour — comparison of audit-time vs current

External-audit timestamp evidence (per Cowork-side curl 2026-04-29 ~17:00 UTC, captured in the phase prompt):

```
GET /api/dispatch?dur=4h&mode=realised  →  200 OK
revenue_per_mw.daily_eur:                 335
revenue_per_mw.annual_eur:                122275
arbitrage_detail.capture_quality_label:   'low'
market_context.da_avg_eur_mwh:            0
market_context.da_min_eur_mwh:            0
market_context.da_max_eur_mwh:            0
```

Current (this session, 2026-05-03 09:50 UTC):

```
revenue_per_mw.daily_eur:                 526
revenue_per_mw.annual_eur:                191990
arbitrage_detail.capture_quality_label:   'high'
market_context.da_avg_eur_mwh:            104.3
market_context.da_min_eur_mwh:            71.3
market_context.da_max_eur_mwh:            224.2
hourly_dispatch:                          24 entries
isp_dispatch:                             96 entries
```

The **DA market-context fields all-zero** on 2026-04-29 is independently a backend concern (logged below, separate phase) but cannot itself cause a render throw — `0` is a valid number for `.toLocaleString()` and template literal interpolation.

The 4-day delta is small but the worker's dispatch endpoint is a **derived computation** over BTD reserves prices + ENTSOE A44 day-ahead prices. If A44 returned an empty or malformed array on 2026-04-29 (which would also explain the all-zero DA fields), `computeDispatchV2`'s inner loop still produces a 96-ISP × 24-hour shape, but with all `daPrice = 0`. That doesn't itself throw — but it produces edge-shape values that downstream consumers don't always tolerate cleanly.

Worker-side review of `computeDispatchV2` (workers/fetch-s1.js:523–753) confirms the response-shape invariants:

- `meta` is always present with all 10 sub-fields populated (literal-built, no conditional branches).
- `meta.sources` is always a non-empty array (hardcoded by mode).
- `revenue_per_mw.daily_eur` and `annual_eur` are always finite numbers (worker rounds via `t_r0`; `0` is the floor).
- `hourly_dispatch` is always a 24-element array (`for (let h = 0; h < 24; h++)` unconditionally).
- `isp_dispatch` is always a 96-element array (`for (let i = 0; i < 96; i++)` unconditionally).
- `scenarios.{drr_uplift_eur_mw_day, post_drr_daily_eur, post_drr_annual_eur}` always present (built from a second `computeDispatchV2` call).

So the worker contract is internally consistent. The fragility is on the **frontend**, where field accesses assume non-null/non-zero values that the worker doesn't strictly guarantee.

---

## Throw-site candidates (priority-ordered defensive review)

Since no live throw was captured, the candidate set is drawn from an exhaustive review of every field access in the `{data && (...)}` render branch of `TradingEngineCard.tsx`. Each entry below names the file, line, expression, and the payload condition under which it would throw.

### 1. `data.revenue_per_mw.annual_eur.toLocaleString()` — TradingEngineCard.tsx:411

```tsx
€{data.revenue_per_mw.annual_eur.toLocaleString()}/MW/yr annualised · …
```

Throws `TypeError: Cannot read properties of null (reading 'toLocaleString')` if `annual_eur` is `null`. The DispatchResponse TS interface declares it `number`, but the worker computes it as `t_r0(totalRev / mw) * 365`. If `totalRev / mw` somehow yielded `null` from a worker bug it'd throw here. **Low likelihood** (worker uses arithmetic not nullable returns), but cheap to guard with `??`.

### 2. `normaliseHourlyDispatch(hourly, mwTotal)` → `hourly.map(...)` — dispatchChart.ts:31

```ts
return hourly.map(h => ({...}));
```

Throws `TypeError: Cannot read properties of null/undefined (reading 'map')` if `hourly` is `null` or `undefined`. The worker always populates `hourly_dispatch` as a 24-element array, but if a future worker change introduces a fast-path that omits the field for an error-state response, this throws. The function already guards `mwTotal <= 0` with `return []`; it should also guard `!Array.isArray(hourly)`.

### 3. `hourly.map(h => …)` in chart labels/datasets — TradingEngineCard.tsx:178, 182, 189, 195

```tsx
labels: hourly.map(h => `${String(h.hour).padStart(2, '0')}:00`),
```

If `hourly_dispatch` is `null`, the four sequential `.map()` calls in `<HourlyChart>`'s `chartData` builder all throw before the first render of `<Bar>`. The earliest of these (`labels`) is the throw site. Same root condition as candidate 2.

### 4. Per-element field access on `hourly[i].revenue_eur.{capacity,activation,arbitrage}` — dispatchChart.ts:33–36

```ts
capacity_eur_per_mw_h: h.revenue_eur.capacity / mwTotal,
```

If `h.revenue_eur` is missing for any hour, accessing `.capacity` throws. The worker always builds `revenue_eur` per hour, but a future refactor could drop it. Lower priority; protected by candidate 3 if we early-return on `hourly_dispatch` empty.

### 5. `data.meta.sources.join(' + ')` — TradingEngineCard.tsx:539

```tsx
v2 · {data.meta.sources.join(' + ')} · {data.meta.data_class} · …
```

Throws if `sources` is `null`/`undefined` (worker always builds it as array, but `??` guard is one character).

### 6. `data.isp_dispatch.map(...)` inside `<ISPTable>` — TradingEngineCard.tsx:270 (via :545)

```tsx
{isps.map(p => (...))}
```

Throws if `isp_dispatch` is `null`. The drawer is closed by default (`<DetailsDrawer>`'s implementation only renders children when expanded), so this throw would only fire after a user click. The boundary fallback at audit time was visible without interaction, so this is unlikely to be the audit-time throw, but is still worth guarding because the drawer would crash on the same data shape that caused the headline throw.

### 7. `Math.round((data.scenarios.post_drr_annual_eur / data.revenue_per_mw.annual_eur - 1) * 100)` — TradingEngineCard.tsx:456

Inside the conditional `{data.scenarios && data.scenarios.drr_uplift_eur_mw_day > 0 && (...)}`. Doesn't throw because the `&&` chain short-circuits on null `scenarios`. **Already safe**; no change needed.

### 8. `<MarketThicknessChip product="afrr|mfrr|fcr">` — TradingEngineCard.tsx:473–475

The `product` prop is a hardcoded literal at every call site. `MarketThicknessChip.tsx:25` reads `MARKET_THICKNESS[product]` and accesses `.tooltip`/`.level`/`.caption` on it. If `MARKET_THICKNESS` were missing one of the three keys, this would throw — but the lib defines all three statically. **Already safe**; no change needed.

### 9. Chart.js paint cycle (Phase 7.7e regression class)

**Audited.** Phase 7.7e Session 25 fixed the chart-tooltip render-loop site-wide, including `<HourlyChart>` (`useMemo` on the `external` handler at TradingEngineCard.tsx:156 with `[tt.setState, hourly]` deps). 20-mousemove canvas hover sweep on dev produces zero `[KKME] Signal card runtime error:` console.error logs and zero `<ErrorBoundary>` fallback. **Not the audit's throw site.**

---

## Hypothesis classification

**Data-shape-driven, with the most likely throw site being candidate 2/3** — `hourly_dispatch` being `null` or non-array on 2026-04-29 because of an upstream A44/BTD merge edge case that's since self-corrected. The audit was at ~17:00 UTC on 2026-04-29; the `da_avg/min/max all-zero` market-context evidence is independent corroboration that the DA-prices ingestion path returned an empty/null payload at that timestamp.

This is **not** a chart.js paint-cycle regression (Phase 7.7e Session 25 left the migration pattern intact and the dev-mode hover sweep is clean) and **not** a static-logic bug (the code paths are unchanged since pre-audit `main` and they all render under today's payload).

Confidence: **moderate**. Without a captured component stack from the audit moment, candidate 2/3 is plausible but unconfirmed. The hardening below covers all 6 throw-eligible candidates regardless of which specific one fired.

---

## Fix plan (Pause A → §1)

Minimal, scope-disciplined hardening at every candidate throw site. Total expected line delta: ~25 lines across 2 source files + 1 test file.

1. **`app/lib/dispatchChart.ts`** — `normaliseHourlyDispatch` early-returns `[]` when `hourly` is not an array (covers candidates 2 + 4). One line:

   ```ts
   if (!Array.isArray(hourly) || hourly.length === 0) return [];
   ```

2. **`app/components/TradingEngineCard.tsx`** — three minimal `??` defaults + one early-return guard:

   - `data.revenue_per_mw.annual_eur ?? 0` at the headline (`L411`) — covers candidate 1.
   - `data.meta.sources?.join(' + ') ?? '—'` at the source footer (`L539`) — covers candidate 5.
   - `data.isp_dispatch ?? []` at the drawer (`L545`) — covers candidate 6.
   - `<HourlyChart>` early-returns the existing "Loading dispatch intelligence…" placeholder when `data.hourly_dispatch` is empty/non-array — covers candidates 2 + 3 at the React level too (so the helper-fix and the component-fix are belt-and-braces).

3. **No changes to `chartData` deps or `useMemo` patterns** — the Session 25 fix is intact and verified; no regression there.

4. **No diagnostics committed.** I did not insert temporary `console.count`/`try-catch` probes — the dev-mode clean repro made them unnecessary and avoided the §1.D cleanup step.

## Boundary upgrade plan (§2)

`app/page.tsx:140` swap: `<ErrorBoundary>` → `<CardBoundary signal="trading">`. The existing `<RevenueCard>` wrapper at `:121` stays on `<ErrorBoundary>` (out of scope for this phase per prompt §What's-explicitly-OUT).

`CardBoundary` improvements (small, in scope per §2.2):

- Add `aria-live="polite"` + `role="status"` on the fallback container so assistive tech announces the error state.
- Add a brief context line "render failed — try again or check `/api/dispatch?dur=4h&mode=realised` for backend health" gated on `process.env.NODE_ENV === 'development'` so operators see the raw-API hint locally without leaking it to public visitors.

The retry button + error message are already present (`CardBoundary.tsx:44–49`).

## Backlog confirmation

Two items log to handover Session 27 for separate phases:

1. **`market_context.da_avg_eur_mwh: 0` on certain audit-time payloads** — backend bug. Notion: Area=Worker, Type=Bug, P3 Medium. The ENTSOE A44 ingestion path occasionally returns empty/null arrays that propagate through `computeDispatchV2` as all-zero DA fields despite the dispatch endpoint computing a non-zero `daily_eur` from BTD reserves alone. Worth investigating the next time the dispatch worker code is touched.
2. **Sentry/Cloudflare-Logpush integration for `componentDidCatch` console errors** — observability gap. Notion: Area=Infrastructure, Type=Enhancement, P3 Low. The auditor's #4 finding (P5 list). Currently the boundary writes to `console.error` only; without Logpush, the operator never sees these errors unless they happen to be looking at the browser console.

---

## Repro recipe for future engineers

If a similar regression surfaces:

1. Open `https://kkme.eu/#trading` in a browser with DevTools console open. Look for `[KKME] Signal card runtime error:` (legacy `<ErrorBoundary>` log) or `[Card crash — trading]:` (new `<CardBoundary>` log post-this-phase). The error object's stack trace identifies the throwing line.
2. Curl the worker payload at the same timestamp:
   ```
   curl 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/api/dispatch?dur=4h&mode=realised' | jq
   ```
   Compare top-level keys against the `DispatchResponse` interface at `app/components/TradingEngineCard.tsx:35–82`. Note any field whose value is `null`, `0`, an empty array, or an unexpected type — that's the candidate root cause.
3. Reproduce locally:
   ```
   npm run dev
   ```
   …and either toggle the relevant control to trigger the failing fetch or temporarily intercept the fetch response with a synthetic minimal payload that mirrors the captured shape.
4. Re-run the throw-site review in this report and add a defensive guard at the new throw site.
