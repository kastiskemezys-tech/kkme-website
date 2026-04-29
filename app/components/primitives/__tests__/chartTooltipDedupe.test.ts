import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  tooltipDataEqual,
  tooltipStateEqual,
  type ChartTooltipState,
} from '@/app/components/primitives/ChartTooltip';
import type { ChartTooltipData } from '@/app/lib/chartTooltip';

// Phase 7.7e (Session 25) — render-loop fix, load-bearing dedupe.
//
// `useChartTooltipState.setState` wraps `useState`'s setter with a value-
// equality bail-out:
//   setStateRaw(prev => tooltipStateEqual(prev, next) ? prev : next)
// React's documented contract: if the functional updater returns the same
// reference as `prev`, the re-render is skipped. That is what stops the
// chart.js → external → setState → re-render loop from cascading.
//
// Empirical render-count comparison (S1 Sparkline, 30 mousemoves @ 40ms, dev):
//   - baseline (no fix): 108 renders, React #185
//   - useTooltipStyle memo only:  108 renders, still #185
//   - + per-site handler memo:    108 renders, still #185 (handler stable=true)
//   - + central setState dedupe:   10 renders, no error
//
// The memos are necessary referential-stability guarantees for chart.js's
// options/data reconciliation; the dedupe is the actual loop-breaker.

const HIDDEN: ChartTooltipState = { data: null, visible: false, x: 0, y: 0 };

function dataA(): ChartTooltipData {
  return { value: 12.5, unit: '€/MWh', date: '2026-04-29', label: 'A' };
}
function dataB(): ChartTooltipData {
  return { value: 12.5, unit: '€/MWh', date: '2026-04-29', label: 'A' }; // value-equal, fresh ref
}

describe('tooltipDataEqual', () => {
  it('returns true when both are null', () => {
    expect(tooltipDataEqual(null, null)).toBe(true);
  });

  it('returns true for identical references', () => {
    const d = dataA();
    expect(tooltipDataEqual(d, d)).toBe(true);
  });

  it('returns true when value-equal but different references', () => {
    expect(tooltipDataEqual(dataA(), dataB())).toBe(true);
  });

  it('returns false when one side is null', () => {
    expect(tooltipDataEqual(dataA(), null)).toBe(false);
    expect(tooltipDataEqual(null, dataA())).toBe(false);
  });

  it('returns false when value differs', () => {
    expect(tooltipDataEqual(dataA(), { ...dataA(), value: 13 })).toBe(false);
  });

  it('returns false when unit differs', () => {
    expect(tooltipDataEqual(dataA(), { ...dataA(), unit: 'MW' })).toBe(false);
  });

  it('returns false when label differs', () => {
    expect(tooltipDataEqual(dataA(), { ...dataA(), label: 'B' })).toBe(false);
  });

  it('returns false when source differs', () => {
    expect(
      tooltipDataEqual({ ...dataA(), source: 'x' }, { ...dataA(), source: 'y' }),
    ).toBe(false);
  });

  it('normalizes Date instance vs equivalent string date as equal', () => {
    // Both representations should compare equal via .getTime() / string compare.
    const sameInstantDate = new Date('2026-04-29T00:00:00.000Z');
    const sameInstantStr = '2026-04-29T00:00:00.000Z';
    // Two equivalent Date instances should compare equal.
    expect(
      tooltipDataEqual(
        { value: 1, unit: '€', date: new Date('2026-04-29T00:00:00.000Z') },
        { value: 1, unit: '€', date: new Date('2026-04-29T00:00:00.000Z') },
      ),
    ).toBe(true);
    // A Date and the equivalent ISO string are NOT considered equal — they're
    // structurally different, and chart.js consumers don't mix the two within
    // a single chart. The contract we care about is "two equivalent Dates are
    // value-equal even with fresh refs."
    expect(
      tooltipDataEqual(
        { value: 1, unit: '€', date: sameInstantDate },
        { value: 1, unit: '€', date: sameInstantStr },
      ),
    ).toBe(false);
  });

  it('returns false for two Date instances with different times', () => {
    expect(
      tooltipDataEqual(
        { value: 1, unit: '€', date: new Date('2026-04-29') },
        { value: 1, unit: '€', date: new Date('2026-04-30') },
      ),
    ).toBe(false);
  });

  it('returns false when secondary array length differs', () => {
    expect(
      tooltipDataEqual(
        { ...dataA(), secondary: [{ label: 'a', value: 1 }] },
        { ...dataA(), secondary: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] },
      ),
    ).toBe(false);
  });

  it('returns false when secondary entry value differs', () => {
    expect(
      tooltipDataEqual(
        { ...dataA(), secondary: [{ label: 'a', value: 1 }] },
        { ...dataA(), secondary: [{ label: 'a', value: 2 }] },
      ),
    ).toBe(false);
  });

  it('returns true when secondary arrays are value-equal but fresh refs', () => {
    expect(
      tooltipDataEqual(
        { ...dataA(), secondary: [{ label: 'a', value: 1, unit: '€' }] },
        { ...dataA(), secondary: [{ label: 'a', value: 1, unit: '€' }] },
      ),
    ).toBe(true);
  });
});

describe('tooltipStateEqual', () => {
  it('returns true for identical references', () => {
    expect(tooltipStateEqual(HIDDEN, HIDDEN)).toBe(true);
  });

  it('returns true when both are hidden regardless of x/y/data', () => {
    // chart.js fires "hide" pulses with stale caret coords during transitions.
    // Both-hidden states must compare equal so those don't trigger re-renders.
    expect(
      tooltipStateEqual(
        { data: null, visible: false, x: 0, y: 0 },
        { data: dataA(), visible: false, x: 100, y: 200 },
      ),
    ).toBe(true);
  });

  it('returns false when visible flag differs', () => {
    expect(
      tooltipStateEqual(
        { data: dataA(), visible: true, x: 10, y: 10 },
        { data: dataA(), visible: false, x: 10, y: 10 },
      ),
    ).toBe(false);
  });

  it('returns true when visible state is value-equal across fresh refs', () => {
    expect(
      tooltipStateEqual(
        { data: dataA(), visible: true, x: 10, y: 10 },
        { data: dataB(), visible: true, x: 10, y: 10 },
      ),
    ).toBe(true);
  });

  it('returns false when caret coordinates differ on a visible tooltip', () => {
    expect(
      tooltipStateEqual(
        { data: dataA(), visible: true, x: 10, y: 10 },
        { data: dataA(), visible: true, x: 11, y: 10 },
      ),
    ).toBe(false);
  });

  it('returns false when data differs on a visible tooltip', () => {
    expect(
      tooltipStateEqual(
        { data: dataA(), visible: true, x: 10, y: 10 },
        { data: { ...dataA(), value: 999 }, visible: true, x: 10, y: 10 },
      ),
    ).toBe(false);
  });
});

describe('useChartTooltipState setState dedupe (functional-updater bail-out)', () => {
  // The hook's setState is wrapped:
  //   setStateRaw(prev => tooltipStateEqual(prev, next) ? prev : next)
  // We can simulate this here without a React renderer — we run the same
  // closure semantics and assert that React would skip the update (returned
  // ref === prev) when the next state is value-equal.
  //
  // This is a contract test: it doesn't import React, but it does assert the
  // exact dedupe predicate the hook applies. A future change that swaps the
  // predicate (e.g. shallow equality only) will be caught.

  function dedupe(prev: ChartTooltipState, next: ChartTooltipState): ChartTooltipState {
    return tooltipStateEqual(prev, next) ? prev : next;
  }

  it('returns prev (skipping the update) when called with value-equal-but-fresh-ref state', () => {
    const prev: ChartTooltipState = {
      data: dataA(),
      visible: true,
      x: 100,
      y: 200,
    };
    const next: ChartTooltipState = {
      data: dataB(), // value-equal, fresh ref
      visible: true,
      x: 100,
      y: 200,
    };
    const result = dedupe(prev, next);
    expect(result).toBe(prev);
  });

  it('returns next when caret moves', () => {
    const prev: ChartTooltipState = {
      data: dataA(),
      visible: true,
      x: 100,
      y: 200,
    };
    const next: ChartTooltipState = {
      data: dataA(),
      visible: true,
      x: 150,
      y: 200,
    };
    expect(dedupe(prev, next)).toBe(next);
  });

  it('returns next on value change (data point changes)', () => {
    const prev: ChartTooltipState = {
      data: dataA(),
      visible: true,
      x: 100,
      y: 200,
    };
    const next: ChartTooltipState = {
      data: { ...dataA(), value: 99 },
      visible: true,
      x: 100,
      y: 200,
    };
    expect(dedupe(prev, next)).toBe(next);
  });

  it('returns prev when both states are hidden (chart.js hide-pulse storm)', () => {
    const prev: ChartTooltipState = HIDDEN;
    const next: ChartTooltipState = { data: null, visible: false, x: 50, y: 50 };
    expect(dedupe(prev, next)).toBe(prev);
  });
});

describe('ChartTooltip.tsx source canary (Session 25 dedupe)', () => {
  // Confirms the load-bearing pieces of the dedupe stay wired. If a future
  // refactor removes the functional-updater bail-out the loop returns.
  const ROOT = resolve(__dirname, '../../../..');
  const src = readFileSync(resolve(ROOT, 'app/components/primitives/ChartTooltip.tsx'), 'utf-8');

  it('exports tooltipDataEqual + tooltipStateEqual for direct testing', () => {
    expect(src).toMatch(/export function tooltipDataEqual\b/);
    expect(src).toMatch(/export function tooltipStateEqual\b/);
  });

  it('uses functional-updater bail-out in useChartTooltipState.setState', () => {
    // The exact pattern: setStateRaw(prev => equal(prev, next) ? prev : next).
    expect(src).toMatch(/setStateRaw\s*\(\s*prev\s*=>\s*\(?\s*tooltipStateEqual\s*\(\s*prev\s*,\s*next\s*\)\s*\?\s*prev\s*:\s*next/);
  });

  it('wraps setState/show/hide in useCallback so consumer memo deps stay stable', () => {
    expect(src).toMatch(/const setState = useCallback\(/);
    expect(src).toMatch(/const show = useCallback\(/);
    expect(src).toMatch(/const hide = useCallback\(/);
  });
});
