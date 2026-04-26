import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FreshnessBadge } from '../../components/primitives/FreshnessBadge';

// Phase 8.3 — FreshnessBadge consumes the global freshnessLabel() helper.
// All threshold logic lives in app/lib/freshness.ts (single source of truth, N-7).

const HOUR = 3_600_000;

describe('FreshnessBadge (Phase 8.3 extension)', () => {
  it('component file does not duplicate threshold logic — defers to freshnessLabel()', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/components/primitives/FreshnessBadge.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/import\s*\{\s*freshnessLabel\s*\}/);
    // No magic-number cliff thresholds in the component; the helper owns them.
    expect(src).not.toMatch(/hoursStale\s*<\s*1\b/);
    expect(src).not.toMatch(/hoursStale\s*<\s*6\b/);
    expect(src).not.toMatch(/hoursStale\s*<\s*24\b/);
    expect(src).not.toMatch(/hoursStale\s*<\s*72\b/);
  });

  it('renders LIVE label when timestamp is sub-hour', () => {
    const recent = new Date(Date.now() - 10 * 60_000).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={recent} />);
    expect(html).toContain('LIVE');
  });

  it('renders RECENT label between 1h and 6h', () => {
    const ts = new Date(Date.now() - 3 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} />);
    expect(html).toContain('RECENT');
    expect(html).not.toContain('LIVE');
  });

  it('renders TODAY label between 6h and 24h', () => {
    const ts = new Date(Date.now() - 12 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} />);
    expect(html).toContain('TODAY');
  });

  it('renders STALE label between 24h and 72h', () => {
    const ts = new Date(Date.now() - 30 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} />);
    expect(html).toContain('STALE');
  });

  it('renders OUTDATED label past 72h', () => {
    const ts = new Date(Date.now() - 100 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} />);
    expect(html).toContain('OUTDATED');
  });

  it('hover title carries absolute UTC timestamp (e.g., "2026-04-25 14:30 UTC")', () => {
    const ts = '2026-04-25T14:30:00Z';
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} />);
    expect(html).toMatch(/title="2026-04-25 14:30 UTC"/);
  });

  it('renders source name when provided', () => {
    const ts = new Date(Date.now() - 2 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} source="ENTSO-E" />);
    expect(html).toContain('ENTSO-E');
  });

  it('renders OUTDATED with em-dash age when updatedAt is null/undefined', () => {
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={null} />);
    expect(html).toContain('OUTDATED');
    expect(html).toContain('—');
  });

  it('surfaces non-observed dataClass with proxy ⚠ marker', () => {
    const ts = new Date(Date.now() - 1 * HOUR).toISOString();
    const html = renderToStaticMarkup(<FreshnessBadge updatedAt={ts} dataClass="proxy" />);
    expect(html).toContain('proxy');
    expect(html).toContain('⚠');
  });
});
