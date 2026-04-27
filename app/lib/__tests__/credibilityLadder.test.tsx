import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CredibilityLadderBar,
  ladderTierLayout,
  ladderTotal,
  type CredibilityLadderTier,
} from '@/app/components/primitives/CredibilityLadderBar';

// Phase 8.3b — CredibilityLadderBar. Funnel from intention → reservation →
// permit → grid agreement → construction → operational, scaled by MW.

const FIXTURE: CredibilityLadderTier[] = [
  { label: 'intention',     mw: 1500 },
  { label: 'reservation',   mw: 1100 },
  { label: 'permit',        mw: 800,  href: '#permit' },
  { label: 'grid agreement', mw: 600 },
  { label: 'construction',  mw: 300 },
  { label: 'operational',   mw: 250 },
];

describe('ladderTotal', () => {
  it('sums MW across tiers', () => {
    expect(ladderTotal(FIXTURE)).toBe(4550);
  });

  it('treats negatives as zero (MW cannot go below zero)', () => {
    expect(ladderTotal([{ label: 'a', mw: 100 }, { label: 'b', mw: -50 }])).toBe(100);
  });
});

describe('ladderTierLayout', () => {
  it('produces one entry per tier, in order', () => {
    const layout = ladderTierLayout(FIXTURE, 200);
    expect(layout.length).toBe(FIXTURE.length);
    expect(layout.map(l => l.tier.label)).toEqual(FIXTURE.map(t => t.label));
  });

  it('the largest tier consumes the full bar width', () => {
    const layout = ladderTierLayout(FIXTURE, 200);
    const widths = layout.map(l => l.widthPx);
    expect(Math.max(...widths)).toBe(200);
  });

  it('percentages sum to ~100', () => {
    const layout = ladderTierLayout(FIXTURE, 200);
    const total = layout.reduce((s, l) => s + l.pct, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.001);
  });

  it('top tiers use lavender, bottom tiers use mint (aspirational → real)', () => {
    const layout = ladderTierLayout(FIXTURE, 200);
    expect(layout[0].color).toBe('var(--lavender)');
    expect(layout[layout.length - 1].color).toBe('var(--mint)');
  });
});

describe('CredibilityLadderBar', () => {
  it('renders one row per tier with the tier label visible', () => {
    const html = renderToStaticMarkup(<CredibilityLadderBar tiers={FIXTURE} />);
    for (const t of FIXTURE) {
      expect(html).toContain(t.label);
    }
  });

  it('per-tier hover surface is wired (Phase 7.7e ChartTooltip migration)', () => {
    // Phase 7.7e — the legacy `title="permit: 800 MW · X% of pipeline"` was
    // replaced by a portal-mounted <ChartTooltip>. The hover shape is asserted
    // via the data-tier attribute and the absence of the legacy attribute.
    const html = renderToStaticMarkup(<CredibilityLadderBar tiers={FIXTURE} />);
    expect(html).toMatch(/data-tier="permit"/);
    expect(html).not.toMatch(/title="permit:/);
  });

  it('clickable tier wraps in an anchor with the supplied href', () => {
    const html = renderToStaticMarkup(<CredibilityLadderBar tiers={FIXTURE} />);
    expect(html).toMatch(/<a[^>]*href="#permit"/);
  });

  it('non-clickable tiers do not render an anchor wrapper', () => {
    const onlyStatic: CredibilityLadderTier[] = [
      { label: 'a', mw: 100 },
      { label: 'b', mw: 50 },
    ];
    const html = renderToStaticMarkup(<CredibilityLadderBar tiers={onlyStatic} />);
    expect(html).not.toMatch(/<a /);
  });

  it('aria-label declares tier count and total MW', () => {
    const html = renderToStaticMarkup(<CredibilityLadderBar tiers={FIXTURE} />);
    expect(html).toContain(`aria-label="Credibility ladder: ${FIXTURE.length} tiers, total 4550 MW"`);
  });
});
