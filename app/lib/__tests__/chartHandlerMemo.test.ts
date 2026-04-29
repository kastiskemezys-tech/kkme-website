import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 7.7e (Session 25) — per-site external-handler memoization canary.
//
// Each chart.js card must wrap its `buildExternalTooltipHandler(...)` call
// in `useMemo`. This is the second guardrail behind `useTooltipStyle`'s memo:
// without a stable handler reference, `useTooltipStyle` re-creates its options
// object every render even when colors don't change, which feeds back into
// the chart.js `external` callback path — and (combined with chart.js's
// fresh-options reconciliation) re-introduces the loop that bailed at React
// error #185 on 2026-04-28.
//
// The actual loop-breaker is the dedupe in `useChartTooltipState.setState`
// (see `app/components/primitives/__tests__/chartTooltipDedupe.test.ts`).
// These memos exist for referential stability of chart.js options/data so
// chart.update() doesn't fire spuriously every render.
//
// Sites enumerated from `docs/audits/phase-7-7e/chart-inventory.md` §A.

const ROOT = resolve(__dirname, '../../..');
function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf-8');
}

describe('Sitewide chart.js consumers memoize their external handlers', () => {
  const sites: Array<{ path: string; min: number }> = [
    { path: 'app/components/S1Card.tsx', min: 2 },        // Sparkline + MonthlyChart
    { path: 'app/components/S2Card.tsx', min: 3 },        // History + Trajectory + Capacity
    { path: 'app/components/TradingEngineCard.tsx', min: 1 },
    { path: 'app/components/RevenueBacktest.tsx', min: 1 },
    { path: 'app/components/RevenueCard.tsx', min: 3 },   // Degradation + Cannibalization + Revenue
  ];

  for (const { path, min } of sites) {
    it(`${path} wraps every buildExternalTooltipHandler call in useMemo`, () => {
      const src = read(path);
      const handlerCalls = (src.match(/buildExternalTooltipHandler\(/g) ?? []).length;
      const memoizedCalls = (src.match(/useMemo\(\s*\n?\s*\(\)\s*=>\s*buildExternalTooltipHandler\(/g) ?? []).length;
      expect(handlerCalls, `${path}: expected ≥${min} handler calls`).toBeGreaterThanOrEqual(min);
      expect(memoizedCalls, `${path}: every handler must be wrapped in useMemo`).toBe(handlerCalls);
    });
  }
});
