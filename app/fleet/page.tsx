/**
 * /fleet — operator fleet console.
 *
 * Phase 37.C. THERE IS NO PUBLIC TIER HERE. Unlike /calculator, which serves a
 * sample view to anyone, this route serves the sign-in gate and nothing else until
 * a token verifies. Everything below the gate arrives at runtime over an
 * authenticated fetch, so the statically-exported HTML contains no project, no
 * count, no contact and no comment — asserted by the UI leak test against the
 * BUILT artifact, not against a component in isolation.
 *
 * Not indexed and not linked: `robots: noindex, nofollow` plus the 35.2
 * soft-launch discipline — nothing outside app/fleet/ was edited to ship it.
 */

import type { Metadata } from 'next';
import { FleetConsole } from './FleetConsole';

export const metadata: Metadata = {
  title: 'Fleet console — KKME',
  robots: { index: false, follow: false, nocache: true },
};

export default function FleetPage() {
  return (
    <main
      style={{
        paddingTop: '80px',
        paddingRight: 'var(--space-md)',
        paddingBottom: 'var(--space-2xl)',
        paddingLeft: 'var(--space-md)',
        maxWidth: '1400px',
        margin: '0 auto',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
        minHeight: '100vh',
      }}
    >
      <FleetConsole />
    </main>
  );
}
