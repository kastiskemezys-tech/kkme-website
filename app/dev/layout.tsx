import type { Metadata } from 'next';

/**
 * Phase 45 — the /dev tooling is not for search engines.
 *
 * `/dev/hero-preview` and `/dev/map-calibrate` are internal instruments — a
 * colour tuner and a map-anchor calibrator — and both were serving HTTP 200 to
 * anonymous requests with no `robots` meta at all. Nothing gated leaks through
 * them (they render the same public hero asset the homepage does), so this is
 * not a disclosure; it is internal tooling in the index, which makes the site
 * look like a workshop to anyone who finds it.
 *
 * A layout rather than per-page metadata because both pages are `'use client'`,
 * and a client component cannot export `metadata`. One layout covers the
 * segment and covers anything added under it later, which is the more durable
 * shape anyway.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
