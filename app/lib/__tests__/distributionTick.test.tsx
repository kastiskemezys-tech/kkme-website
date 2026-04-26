import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DistributionTick,
  distributionScale,
} from '@/app/components/primitives/DistributionTick';

// Phase 8.3b — DistributionTick. Pure-SVG hairline + tick used 50+ times
// site-wide once cards migrate. Tests cover the scale math + rendering.

describe('distributionScale', () => {
  it('maps min to 0 and max to width', () => {
    expect(distributionScale(0, 0, 100, 80)).toBe(0);
    expect(distributionScale(100, 0, 100, 80)).toBe(80);
  });

  it('maps mid value linearly', () => {
    expect(distributionScale(50, 0, 100, 80)).toBe(40);
    expect(distributionScale(25, 0, 100, 80)).toBe(20);
  });

  it('clamps below min and above max', () => {
    expect(distributionScale(-10, 0, 100, 80)).toBe(0);
    expect(distributionScale(150, 0, 100, 80)).toBe(80);
  });

  it('returns 0 when range collapses (min == max)', () => {
    expect(distributionScale(50, 50, 50, 80)).toBe(0);
  });
});

describe('DistributionTick', () => {
  const fixture = {
    min: 0, p25: 25, p50: 50, p75: 75, p90: 90, max: 100,
  };

  it('today=p50 lands the today tick at width × 0.5', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={50} width={80} height={12} />,
    );
    // Today tick is the mint stroke. Position should be x=40 (50% of 80).
    expect(html).toMatch(/x1="40"[^>]*x2="40"[^>]*stroke="var\(--mint\)"/);
  });

  it('today=min lands the today tick at x=0', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={0} width={80} />,
    );
    expect(html).toMatch(/x1="0"[^>]*x2="0"[^>]*stroke="var\(--mint\)"/);
  });

  it('today=max lands the today tick at x=width', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={100} width={80} />,
    );
    expect(html).toMatch(/x1="80"[^>]*x2="80"[^>]*stroke="var\(--mint\)"/);
  });

  it('renders a baseline hairline rule across the full width', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={50} width={80} height={12} />,
    );
    expect(html).toMatch(/x1="0"[^>]*x2="80"[^>]*stroke="var\(--text-muted\)"/);
  });

  it('aria-label can be overridden by caller', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={50} ariaLabel="custom label" />,
    );
    expect(html).toContain('aria-label="custom label"');
  });

  it('default aria-label includes today + min + max', () => {
    const html = renderToStaticMarkup(
      <DistributionTick {...fixture} today={42} />,
    );
    expect(html).toContain('today 42');
    expect(html).toContain('0 to 100');
  });
});
