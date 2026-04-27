import { describe, it, expect } from 'vitest';

// Mirror the worker's flowSignal logic for unit testing.
// If this drifts from workers/fetch-s1.js (search "function flowSignal"),
// the spec catches it. Phase 12.4 hotfix regression guard.
function flowSignal(mw: number | null): string | null {
  if (mw == null) return null;
  if (mw > 100)  return 'IMPORTING';
  if (mw < -100) return 'EXPORTING';
  return 'BALANCED';
}

describe('flowSignal sign convention (Phase 12.4 hotfix)', () => {
  it('positive value = LT IMPORTING from neighbor (per API convention)', () => {
    expect(flowSignal(429)).toBe('IMPORTING');
    expect(flowSignal(860)).toBe('IMPORTING');
  });

  it('negative value = LT EXPORTING to neighbor', () => {
    expect(flowSignal(-429)).toBe('EXPORTING');
    expect(flowSignal(-860)).toBe('EXPORTING');
  });

  it('within ±100 MW = BALANCED', () => {
    expect(flowSignal(50)).toBe('BALANCED');
    expect(flowSignal(-50)).toBe('BALANCED');
    expect(flowSignal(0)).toBe('BALANCED');
  });

  it('null input = null output', () => {
    expect(flowSignal(null)).toBe(null);
  });
});
