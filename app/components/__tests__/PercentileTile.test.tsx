import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PercentileTile } from '@/app/components/S1Card';

// Phase 12.8.0 — Path C fix for the S1 percentile tiles.
// Previously each percentile rendered as a TileButton wired to
// openDrawer('what'), which promised interactivity it did not deliver
// (the drawer content was generic and did not vary per tile). The
// replacement is a static stat-summary label. These tests guard against
// regression to the misleading-affordance pattern.

describe('PercentileTile (S1 30-day distribution strip)', () => {
  it('renders the label and value', () => {
    const html = renderToStaticMarkup(<PercentileTile label="p90" value="€283" />);
    expect(html).toContain('p90');
    expect(html).toContain('€283');
  });

  it('renders as a static <div>, not a <button>', () => {
    // Anti-regression: the prior TileButton wrapped each tile in a
    // <button> with onClick -> openDrawer('what'). The whole point of
    // the Path C fix is to drop the misleading click affordance.
    const html = renderToStaticMarkup(<PercentileTile label="p25" value="€117" />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('onClick');
  });

  it('does not include click-affordance markers (cursor, underline)', () => {
    // The TileButton applied cursor:pointer and a hover-underline. The
    // stat-summary tile must not — it would re-introduce the affordance
    // mismatch the audit flagged.
    const html = renderToStaticMarkup(<PercentileTile label="mean" value="€140" />);
    expect(html).not.toMatch(/cursor:\s*pointer/i);
    expect(html).not.toMatch(/text-decoration:\s*underline/i);
  });
});
