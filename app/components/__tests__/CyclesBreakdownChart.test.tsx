import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CyclesBreakdownChart, type CyclesBreakdown } from '@/app/components/RevenueCard';

const FIXTURE: CyclesBreakdown = {
  fcr:  16,
  afrr: 80.8,
  mfrr: 31.3,
  da:   550,
  total_cd: 1.86,
  total_efcs_yr: 678,
  label: 'Cycles per year (throughput-derived)',
};

describe('CyclesBreakdownChart', () => {
  it('renders four rect segments — one per product (FCR / aFRR / mFRR / DA)', () => {
    const html = renderToStaticMarkup(<CyclesBreakdownChart breakdown={FIXTURE} />);
    expect(html).toContain('data-testid="cycles-breakdown-chart"');
    expect(html).toContain('data-product="fcr"');
    expect(html).toContain('data-product="afrr"');
    expect(html).toContain('data-product="mfrr"');
    expect(html).toContain('data-product="da"');
  });

  it('uses canonical per-product palette tokens', () => {
    const html = renderToStaticMarkup(<CyclesBreakdownChart breakdown={FIXTURE} />);
    expect(html).toContain('var(--cycles-fcr)');
    expect(html).toContain('var(--cycles-afrr)');
    expect(html).toContain('var(--cycles-mfrr)');
    expect(html).toContain('var(--cycles-da)');
  });

  it('renders product labels + EFC counts in the legend', () => {
    const html = renderToStaticMarkup(<CyclesBreakdownChart breakdown={FIXTURE} />);
    expect(html).toContain('FCR');
    expect(html).toContain('aFRR');
    expect(html).toContain('mFRR');
    expect(html).toContain('DA');
    expect(html).toContain('678');
    expect(html).toContain('1.86');
  });

  it('warranty="within" renders a teal chip', () => {
    const html = renderToStaticMarkup(
      <CyclesBreakdownChart breakdown={FIXTURE} warrantyStatus="within" />,
    );
    expect(html).toContain('within warranty');
    expect(html).toContain('var(--teal)');
  });

  it('warranty="premium-tier-required" renders an amber chip', () => {
    const html = renderToStaticMarkup(
      <CyclesBreakdownChart breakdown={FIXTURE} warrantyStatus="premium-tier-required" />,
    );
    expect(html).toContain('premium tier required');
    expect(html).toContain('var(--amber)');
  });

  it('warranty="unwarranted" renders a coral chip', () => {
    const html = renderToStaticMarkup(
      <CyclesBreakdownChart breakdown={FIXTURE} warrantyStatus="unwarranted" />,
    );
    expect(html).toContain('var(--coral)');
  });

  it('without warranty status, no chip is rendered', () => {
    const html = renderToStaticMarkup(<CyclesBreakdownChart breakdown={FIXTURE} />);
    expect(html).not.toContain('within warranty');
    expect(html).not.toContain('premium tier required');
  });

  it('bar widths sum to roughly the chart width (proportional segments)', () => {
    // The four segments are stacked; their widths should sum to W=240 (allowing
    // rounding error from the per-segment minus-1 spacing).
    const html = renderToStaticMarkup(<CyclesBreakdownChart breakdown={FIXTURE} />);
    const widthMatches = [...html.matchAll(/data-product="(fcr|afrr|mfrr|da)"[^>]*width="([\d.]+)"/g)];
    const summed = widthMatches.reduce((s, m) => s + parseFloat(m[2]), 0);
    // 240px chart, 4 segments × (-1px gap) → ~236px. Allow ±2 for rounding.
    expect(summed).toBeGreaterThan(232);
    expect(summed).toBeLessThan(241);
  });
});
