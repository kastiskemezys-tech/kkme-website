/**
 * Phase 38.3 — the two disclosures render, and they render the PAYLOAD'S
 * numbers rather than the ones that happened to be true when they were written.
 *
 * Asserted on the SSR markup of the component the reader sees. The whole reason
 * this disclosure exists is that a silent limit reads as a result; a disclosure
 * whose figures drift from the asset beside them would be the same defect one
 * level up (rule #2).
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WearModelRangeNote } from '@/app/components/RevenueCard';

/** Frozen-fixture 2h/mid/2028/base, captured 2026-08-03. */
const SHIPPED = { totalCd: 1.36, totalEfcYr: 498 };
const Y1 = { rev_bal: 5805417, rev_trd: 2188823, rev_gross: 7994239 };

describe('the validity-floor disclosure', () => {
  it('states the floor and, above it, where this asset sits', () => {
    const html = renderToStaticMarkup(<WearModelRangeNote {...SHIPPED} y1={Y1} />);
    expect(html).toContain('wear-model-floor');
    expect(html).toContain('1.0, 1.5 and 2.0 cycles/day');
    expect(html).toContain('not extrapolated below the slowest');
    expect(html).toContain('1.36 c/d');
    expect(html).toContain('498 EFC/yr');
    // Above the floor, it must NOT claim the asset is clamped.
    expect(html).not.toContain('accounting output');
  });

  it('changes what it says when the asset is below the floor', () => {
    // 219 EFC/yr — B1's hourly measurement, the rate the parked cutover
    // would have published into a model that cannot use it.
    const html = renderToStaticMarkup(
      <WearModelRangeNote totalCd={0.6} totalEfcYr={219} y1={Y1} />,
    );
    expect(html).toContain('0.60 c/d');
    expect(html).toContain('219 EFC/yr');
    expect(html).toContain('ages it as if it cycled at 1.0 c/d');
    expect(html).toContain('accounting output here, not a wear input');
  });
});

describe('the benchmark-mismatch disclosure', () => {
  it('computes the split from the payload and names the band it does not apply to', () => {
    const html = renderToStaticMarkup(<WearModelRangeNote {...SHIPPED} y1={Y1} />);
    expect(html).toContain('wear-model-band');
    expect(html).toContain('550–720 EFC/yr');
    expect(html).toContain('merchant-battery');
    expect(html).toContain('reserve-led');
    expect(html).toContain('72.6 %');   // computed, not written
    expect(html).toContain('27.4 %');
    expect(html).toContain('category error');
    // The limit travels with the claim rather than being dropped from it.
    expect(html).toContain('would understate the cycling');
  });

  it('tracks the payload — a merchant-led asset gets the opposite sentence', () => {
    const html = renderToStaticMarkup(
      <WearModelRangeNote {...SHIPPED} y1={{ rev_bal: 1e6, rev_trd: 4e6, rev_gross: 5e6 }} />,
    );
    expect(html).toContain('merchant-led');
    expect(html).toContain('20 %');
    expect(html).not.toContain('72.6 %');
  });
});

describe('degradation', () => {
  it('renders the floor note alone when the revenue split is unavailable', () => {
    const html = renderToStaticMarkup(<WearModelRangeNote {...SHIPPED} y1={null} />);
    expect(html).toContain('wear-model-floor');
    expect(html).not.toContain('wear-model-band');
  });

  it('renders nothing at all rather than a partial claim', () => {
    expect(renderToStaticMarkup(<WearModelRangeNote y1={null} />)).toBe('');
  });
});
