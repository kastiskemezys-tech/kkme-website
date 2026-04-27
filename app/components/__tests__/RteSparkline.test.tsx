import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RteSparkline } from '@/app/components/RevenueCard';

const CURVE_18 = Array.from({ length: 18 }, (_, i) => 0.86 - i * 0.002);

describe('RteSparkline', () => {
  it('renders an SVG with one rect hover zone per curve point', () => {
    const html = renderToStaticMarkup(<RteSparkline curve={CURVE_18} />);
    expect(html).toContain('data-testid="rte-sparkline"');
    const matches = html.match(/<rect [^>]*fill="transparent"/g) ?? [];
    expect(matches.length).toBe(CURVE_18.length);
  });

  it('renders a polyline through the curve', () => {
    const html = renderToStaticMarkup(<RteSparkline curve={CURVE_18} />);
    expect(html).toMatch(/<polyline /);
  });

  it('returns null for too-short curves', () => {
    const html = renderToStaticMarkup(<RteSparkline curve={[0.86]} />);
    expect(html).toBe('');
  });

  it('returns null for missing curves', () => {
    const html = renderToStaticMarkup(<RteSparkline curve={undefined} />);
    expect(html).toBe('');
  });

  it('renders BOL and EOL anchor dots at curve endpoints', () => {
    const html = renderToStaticMarkup(<RteSparkline curve={CURVE_18} />);
    const circles = html.match(/<circle /g) ?? [];
    // Two anchor dots (BOL + EOL); ChartTooltip portal stays unmounted under SSR.
    expect(circles.length).toBe(2);
  });
});
