import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MetricTile } from '../../components/primitives/MetricTile';

// Phase 8.3 — MetricTile extension. Adds optional fan / sampleSize / methodVersion
// props per N-4, N-5, N-6. Existing consumers keep their existing call sites.
// Tests are SSR-rendered (no DOM dep); they check the markup contains the
// expected affordances when each new prop is supplied.

describe('MetricTile (Phase 8.3 extension)', () => {
  it('renders without fan / sampleSize / methodVersion (backwards-compatible)', () => {
    const html = renderToStaticMarkup(
      <MetricTile label="Day-ahead" value={42} unit="€/MWh" size="standard" />,
    );
    expect(html).toContain('Day-ahead');
    expect(html).toContain('42');
    expect(html).toContain('€/MWh');
    // No fan, no sample badge, no version stamp
    expect(html).not.toMatch(/<svg/);
    expect(html).not.toMatch(/data-testid="metric-sample-size"/);
    expect(html).not.toMatch(/data-testid="metric-method-version"/);
  });

  it('renders fan band when fan prop is present', () => {
    const html = renderToStaticMarkup(
      <MetricTile
        label="IRR"
        value="8.6%"
        size="standard"
        dataClass="derived"
        fan={{ p10: 6.2, p50: 8.6, p90: 11.4 }}
      />,
    );
    expect(html).toMatch(/<svg[^>]*aria-label="Confidence band P10 6\.2 to P90 11\.4, P50 8\.6"/);
    // p50 line uses the mint token via the inline stroke attribute
    expect(html).toMatch(/stroke="var\(--mint\)"/);
  });

  it('renders sample-size badge as n=720 form for sub-1k counts', () => {
    const html = renderToStaticMarkup(
      <MetricTile label="Hourly capture" value={36} unit="€/MWh" sampleSize={720} />,
    );
    expect(html).toMatch(/data-testid="metric-sample-size"/);
    expect(html).toContain('n=720');
  });

  it('renders sample-size badge in n=Xk form for ≥1k counts', () => {
    const html = renderToStaticMarkup(
      <MetricTile label="Annual obs" value={1} sampleSize={12500} />,
    );
    expect(html).toContain('n=12.5k');
  });

  it('renders method-version stamp as superscript with title attribute', () => {
    const html = renderToStaticMarkup(
      <MetricTile label="LCOS" value={92} unit="€/MWh" methodVersion="v7" />,
    );
    expect(html).toMatch(/data-testid="metric-method-version"/);
    expect(html).toContain('v7');
    expect(html).toMatch(/title="Methodology version v7"/);
  });

  it('hero size keeps the editorial display font; standard/compact use mono', () => {
    const heroHtml = renderToStaticMarkup(
      <MetricTile label="Today" value="36" unit="€/MWh" size="hero" />,
    );
    expect(heroHtml).toMatch(/var\(--font-display\)/);
    const compactHtml = renderToStaticMarkup(
      <MetricTile label="Reserve" value="14" unit="€/MW/h" size="compact" />,
    );
    expect(compactHtml).toMatch(/var\(--font-mono\)/);
  });

  it('renders all three new props together without breaking existing label/value', () => {
    const html = renderToStaticMarkup(
      <MetricTile
        label="Project IRR"
        value="8.6%"
        size="standard"
        dataClass="derived"
        fan={{ p10: 6, p50: 8.6, p90: 11 }}
        sampleSize={1000}
        methodVersion="v7"
      />,
    );
    expect(html).toContain('Project IRR');
    expect(html).toContain('8.6%');
    expect(html).toContain('n=1k');
    expect(html).toContain('v7');
    expect(html).toMatch(/<svg/);
  });
});
