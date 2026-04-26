import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RegimeBarometer,
  REGIME_ORDER,
  regimeIndex,
  type Regime,
} from '@/app/components/primitives/RegimeBarometer';

// Phase 8.3b — RegimeBarometer. Five regime zones with a needle marking today.

describe('regimeIndex', () => {
  it('orders tight → compressed → normal → wide → stress (left to right)', () => {
    expect(REGIME_ORDER).toEqual(['tight', 'compressed', 'normal', 'wide', 'stress']);
  });

  it('maps each regime to its zero-indexed position', () => {
    expect(regimeIndex('tight')).toBe(0);
    expect(regimeIndex('compressed')).toBe(1);
    expect(regimeIndex('normal')).toBe(2);
    expect(regimeIndex('wide')).toBe(3);
    expect(regimeIndex('stress')).toBe(4);
  });
});

describe('RegimeBarometer', () => {
  const ALL: Regime[] = ['tight', 'compressed', 'normal', 'wide', 'stress'];

  for (const r of ALL) {
    it(`active=${r} marks zone[${r}] with data-active="true"`, () => {
      const html = renderToStaticMarkup(<RegimeBarometer regime={r} />);
      const match = new RegExp(`data-zone="${r}"[^>]*data-active="true"`);
      expect(html).toMatch(match);
    });
  }

  it('places the needle at the centre of the active zone', () => {
    // width=120, 5 zones → zoneWidth=24. normal is index 2 → centre = 60.
    const html = renderToStaticMarkup(<RegimeBarometer regime="normal" width={120} />);
    expect(html).toMatch(/x1="60"[^>]*x2="60"[^>]*stroke="var\(--mint\)"/);
  });

  it('tight zone uses the coral token, stress uses lavender', () => {
    const html = renderToStaticMarkup(<RegimeBarometer regime="tight" />);
    expect(html).toContain('var(--coral)');
    expect(html).toContain('var(--lavender)');
  });

  it('shows label text only when showLabel=true', () => {
    const off = renderToStaticMarkup(<RegimeBarometer regime="wide" />);
    const on = renderToStaticMarkup(<RegimeBarometer regime="wide" showLabel />);
    // The label is rendered in a <span> sibling of the <svg>; absent without
    // the prop. Detect by matching the uppercase styled span tail.
    expect(off).not.toMatch(/text-transform:\s*uppercase/);
    expect(on).toMatch(/text-transform:\s*uppercase/);
    expect(on).toMatch(/>wide</);
  });

  it('aria-label encodes the active regime', () => {
    const html = renderToStaticMarkup(<RegimeBarometer regime="compressed" />);
    expect(html).toContain('aria-label="Regime barometer: compressed"');
  });
});
