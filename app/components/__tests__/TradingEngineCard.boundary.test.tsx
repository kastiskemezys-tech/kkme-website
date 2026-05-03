// Phase 12.8 — boundary swap + CardBoundary fallback enhancements.
//
// Pre-fix: `<TradingEngineCard>` was wrapped by `<ErrorBoundary>` (bare
// "SIGNAL ERROR" placeholder). Post-fix: it's wrapped by
// `<CardBoundary signal="trading">` — same retry pattern S1/S2/etc. use,
// plus aria-live + role=status for assistive tech and a NODE_ENV-gated dev
// hint pointing operators at the browser console stack trace.
//
// Class-component error boundaries don't catch throws under
// `react-dom/server`'s static renderer, so we test `CardBoundaryFallback`
// directly (the named markup the boundary delegates to) plus a source-text
// canary on `app/page.tsx` for the wrapper swap.

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import { CardBoundaryFallback } from '@/app/components/CardBoundary';

describe('Phase 12.8 — CardBoundaryFallback (signal="trading")', () => {
  it('renders the signal name + "render error" line', () => {
    const html = renderToStaticMarkup(
      <CardBoundaryFallback signal="trading" error="boom" />
    );
    expect(html).toMatch(/trading/);
    expect(html).toMatch(/render error/);
  });

  it('surfaces the underlying error message', () => {
    const html = renderToStaticMarkup(
      <CardBoundaryFallback signal="trading" error="Cannot read properties of null" />
    );
    expect(html).toMatch(/Cannot read properties of null/);
  });

  it('renders a retry button (button element with retry text)', () => {
    const html = renderToStaticMarkup(
      <CardBoundaryFallback signal="trading" error="boom" />
    );
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>retry<\/button>/);
  });

  it('marks the fallback container with aria-live="polite" + role="status"', () => {
    const html = renderToStaticMarkup(
      <CardBoundaryFallback signal="trading" error="boom" />
    );
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toMatch(/role="status"/);
  });

  it('omits the dev-mode console hint when NODE_ENV !== "development"', () => {
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const html = renderToStaticMarkup(
        <CardBoundaryFallback signal="trading" error="boom" />
      );
      expect(html).not.toMatch(/Card crash/);
    } finally {
      env.NODE_ENV = original;
    }
  });

  it('shows the dev-mode console hint when NODE_ENV === "development"', () => {
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    env.NODE_ENV = 'development';
    try {
      const html = renderToStaticMarkup(
        <CardBoundaryFallback signal="trading" error="boom" />
      );
      expect(html).toMatch(/Card crash/);
      expect(html).toMatch(/trading/);
    } finally {
      env.NODE_ENV = original;
    }
  });
});

describe('Phase 12.8 — page wraps TradingEngineCard with CardBoundary signal="trading"', () => {
  // Source-text canary: confirms the `app/page.tsx:140` swap is in place.
  // Pre-fix: page used `<ErrorBoundary>` (bare "SIGNAL ERROR" fallback).
  // Post-fix: `<CardBoundary signal="trading">`.
  const pageSrc = fs.readFileSync(path.resolve(__dirname, '..', '..', 'page.tsx'), 'utf8');

  it('wraps <TradingEngineCard /> with <CardBoundary signal="trading">', () => {
    const tradingBlockMatch = pageSrc.match(
      /<CardBoundary\s+signal="trading">\s*<TradingEngineCard\s*\/>\s*<\/CardBoundary>/,
    );
    expect(tradingBlockMatch).not.toBeNull();
  });

  it('does not directly wrap <TradingEngineCard /> in <ErrorBoundary>', () => {
    // Tight regex — only adjacent ErrorBoundary direct wrap. (RevenueCard at
    // page.tsx:121 still uses ErrorBoundary; that's out of scope this phase.)
    expect(pageSrc).not.toMatch(/<ErrorBoundary>\s*<TradingEngineCard\s*\/>\s*<\/ErrorBoundary>/);
  });
});
