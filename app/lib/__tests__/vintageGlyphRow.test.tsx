import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  VintageGlyphRow,
  VINTAGE_ORDER,
  VINTAGE_STYLE,
  type Vintage,
} from '@/app/components/primitives/VintageGlyphRow';

// Phase 8.3b — VintageGlyphRow. O / D / F / M provenance pill row.

describe('VintageGlyphRow', () => {
  it('VINTAGE_ORDER reads observed → derived → forecast → model', () => {
    expect(VINTAGE_ORDER).toEqual(['observed', 'derived', 'forecast', 'model']);
  });

  it('renders all four glyphs (O / D / F / M) in order', () => {
    const html = renderToStaticMarkup(<VintageGlyphRow active="observed" />);
    const order = ['observed', 'derived', 'forecast', 'model'];
    let lastIdx = -1;
    for (const v of order) {
      const idx = html.indexOf(`data-vintage="${v}"`);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  for (const v of ['observed', 'derived', 'forecast', 'model'] as Vintage[]) {
    it(`active=${v} marks only that pill with data-active="true"`, () => {
      const html = renderToStaticMarkup(<VintageGlyphRow active={v} />);
      const activePattern = new RegExp(`data-vintage="${v}"[^>]*data-active="true"`);
      expect(html).toMatch(activePattern);
      // Ensure exactly one is active.
      const activeMatches = html.match(/data-active="true"/g) ?? [];
      expect(activeMatches.length).toBe(1);
    });
  }

  it('observed active pill uses the mint fill (token --mint)', () => {
    const html = renderToStaticMarkup(<VintageGlyphRow active="observed" />);
    // The active pill's inline style should include the mint fill.
    expect(VINTAGE_STYLE.observed.fill).toBe('var(--mint)');
    expect(html).toMatch(/data-vintage="observed"[^>]*data-active="true"[^>]*style="[^"]*background-color:\s*var\(--mint\)/);
  });

  it('forecast active pill colors text with the lavender token', () => {
    const html = renderToStaticMarkup(<VintageGlyphRow active="forecast" />);
    expect(html).toMatch(/data-vintage="forecast"[^>]*data-active="true"[^>]*style="[^"]*color:\s*var\(--lavender\)/);
  });

  it('model active pill uses dashed border (M = model-input)', () => {
    const html = renderToStaticMarkup(<VintageGlyphRow active="model" />);
    expect(html).toMatch(/data-vintage="model"[^>]*data-active="true"[^>]*style="[^"]*border:\s*1px dashed/);
  });

  it('size prop controls each pill\'s width/height', () => {
    const html = renderToStaticMarkup(<VintageGlyphRow active="observed" size={24} />);
    expect(html).toMatch(/width:\s*24px/);
    expect(html).toMatch(/height:\s*24px/);
  });
});
