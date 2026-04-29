import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 7.7e (Session 25) — render-loop fix canary.
//
// `useTooltipStyle` must memoize its returned options object. If a future edit
// strips the `useMemo` wrapper, react-chartjs-2 will see fresh `options`
// references on every render, treat them as options changes, and re-fire its
// `external` callback inside the commit phase — re-introducing the chart.js
// → setState → re-render → fresh options → chart.update() → external loop
// that bailed at React error #185 in production on 2026-04-28.
//
// vitest runs in `environment: 'node'` and the project doesn't ship
// @testing-library/react, so the per-render referential-stability assertions
// the original spec called for would require a new heavy dev dep. Instead we
// canary the source: the memo wrapper, its dep array shape, and the field-by-
// field key list (theme-equal re-creations of `colors` must not bust the memo).
// Combined with `chartTooltipDedupe.test.ts` (behavior of the dedupe helpers),
// this catches the two classes of regression that broke production.

const ROOT = resolve(__dirname, '../../..');
function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf-8');
}

describe('useTooltipStyle memoization (Phase 7.7e render-loop guard)', () => {
  const src = read('app/lib/chartTheme.ts');

  it('imports useMemo from react', () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('wraps the returned options object in useMemo', () => {
    // The function body must call useMemo(() => { … }, [deps]).
    expect(src).toMatch(/export function useTooltipStyle[\s\S]*?return useMemo\(/);
  });

  it('memo dep array keys on primitive color fields, not the wrapper colors object', () => {
    // Theme-equivalent re-renders re-create the `colors` wrapper but the
    // resolved primitive strings stay the same. Keying on `colors` directly
    // would bust the memo on every theme tick.
    const memoBlock = src.match(/return useMemo\([\s\S]*?\}\s*,\s*\[([\s\S]*?)\]\s*\)/);
    expect(memoBlock, 'useMemo dep array not found').not.toBeNull();
    const deps = memoBlock![1];
    expect(deps).toMatch(/\bexternal\b/);
    expect(deps).toMatch(/colors\.tooltipBg/);
    expect(deps).toMatch(/colors\.tooltipBorder/);
    expect(deps).toMatch(/colors\.textPrimary/);
    expect(deps).toMatch(/colors\.textSecondary/);
    expect(deps).toMatch(/colors\.teal/);
    // Naked `colors` (the wrapper) must NOT be a dep — that would bust the memo
    // on every theme-equal re-render.
    expect(deps.split(',').map(s => s.trim())).not.toContain('colors');
  });

  it('reads opts?.external once into a local before the memo (so the dep is a stable identifier)', () => {
    // `useMemo(() => {...}, [opts?.external, ...])` would be flagged by
    // exhaustive-deps as a non-stable expression. Snapshotting to `const
    // external = opts?.external` makes the dep a plain identifier and keeps
    // the rule honest.
    expect(src).toMatch(/const external = opts\?\.external/);
  });
});

