import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RTE_BOL, RTE_DECAY_PP_PER_YEAR, RTE_FLOOR_DROP } from '../sohCurves';

// Phase 32.1 — single-source guarantee.
// The worker (workers/fetch-s1.js) can't import TS modules, so it carries a
// hand-mirrored copy of the canonical RTE constants. This test reads the worker
// source and asserts the mirror has not drifted from app/lib/sohCurves.ts.
// If this fails, reconcile workers/fetch-s1.js RTE_BOL to match sohCurves.ts.

const workerSrc = readFileSync(join(process.cwd(), 'workers/fetch-s1.js'), 'utf-8');

function num(re: RegExp): number {
  const m = workerSrc.match(re);
  if (!m) throw new Error(`worker constant not found for ${re}`);
  return Number(m[1]);
}

describe('RTE canonical mirror — worker ↔ sohCurves.ts', () => {
  it('worker defines exactly one RTE_BOL', () => {
    const count = (workerSrc.match(/const RTE_BOL\s*=/g) || []).length;
    expect(count).toBe(1);
  });

  it('worker RTE_BOL.h2 === TS RTE_BOL.h2', () => {
    const h2 = num(/const RTE_BOL\s*=\s*\{\s*h2:\s*([0-9.]+)/);
    expect(h2).toBe(RTE_BOL.h2);
  });

  it('worker RTE_BOL.h4 === TS RTE_BOL.h4', () => {
    const h4 = num(/const RTE_BOL\s*=\s*\{\s*h2:\s*[0-9.]+\s*,\s*h4:\s*([0-9.]+)/);
    expect(h4).toBe(RTE_BOL.h4);
  });

  it('worker RTE decay/floor match TS', () => {
    expect(num(/const RTE_DECAY_PP_PER_YEAR\s*=\s*([0-9.]+)/)).toBe(RTE_DECAY_PP_PER_YEAR);
    expect(num(/const RTE_FLOOR_DROP\s*=\s*([0-9.]+)/)).toBe(RTE_FLOOR_DROP);
  });

  it('no orphan round-trip literal feeds bess_net_capture (must read RTE_BOL)', () => {
    // The displayed spread-capture divisor must not be a hardcoded literal again.
    expect(workerSrc).toMatch(/bess_net_capture\s*=\s*Math\.round\(\(p_high_avg - p_low_avg \/ RTE_BOL\.h2\)/);
  });
});
