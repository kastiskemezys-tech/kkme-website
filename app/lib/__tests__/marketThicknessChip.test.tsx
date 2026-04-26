import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketThicknessChip } from '@/app/components/MarketThicknessChip';

// Phase 7.7a (7.7.14) — chip render assertions via SSR (matches Phase 8
// pattern of asserting against renderToStaticMarkup, no DOM dep).

describe('MarketThicknessChip — render output', () => {
  it('aFRR renders as "aFRR · thick"', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="afrr" />);
    expect(html).toContain('aFRR · thick');
    expect(html).toContain('data-thickness-level="thick"');
  });

  it('mFRR renders as "mFRR · medium"', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="mfrr" />);
    expect(html).toContain('mFRR · medium');
    expect(html).toContain('data-thickness-level="medium"');
  });

  it('FCR renders as "FCR · thin"', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="fcr" />);
    expect(html).toContain('FCR · thin');
    expect(html).toContain('data-thickness-level="thin"');
  });

  it('aFRR shows no caption span (its caption is null)', () => {
    const withCap = renderToStaticMarkup(<MarketThicknessChip product="afrr" showCaption />);
    const withoutCap = renderToStaticMarkup(<MarketThicknessChip product="afrr" />);
    // showCaption flag is a no-op when the spec.caption is null.
    expect(withCap).toBe(withoutCap);
    expect(withCap).not.toContain('bid-shading');
  });

  it('mFRR with showCaption renders the bid-shading warning', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="mfrr" showCaption />);
    expect(html).toContain('bid-shading');
  });

  it('FCR with showCaption renders the price-taker warning', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="fcr" showCaption />);
    expect(html).toContain('price-taker');
  });

  it('chip carries the tooltip via title attribute', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="fcr" />);
    expect(html).toContain('title=');
    expect(html).toContain('thinnest balancing product');
  });

  it('test ID matches the product key (for downstream chrome-devtools assertions)', () => {
    const html = renderToStaticMarkup(<MarketThicknessChip product="afrr" />);
    expect(html).toContain('data-testid="market-thickness-afrr"');
  });
});
