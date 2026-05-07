// /intel — full Intel feed (no homepage cap, no max-age window).
//
// Mirrors the homepage layout but renders <IntelFeed mode="full" />, which
// disables the 5-item cap and 30-day filter so operator and visitors can
// browse the entire archive.

'use client';

import dynamic from 'next/dynamic';

const IntelFeed = dynamic(() => import('@/app/components/IntelFeed').then(m => m.IntelFeed));

export default function IntelPage() {
  return (
    <main style={{ paddingTop: '80px', paddingRight: 'var(--space-md)', paddingBottom: '120px', paddingLeft: 'var(--space-md)', maxWidth: '880px', margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--space-lg)' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginTop: 0, marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0,
          }}
        >
          KKME · Baltic BESS market intelligence
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(28px, 4vw, 44px)',
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            marginTop: 0, marginRight: 0, marginBottom: 'var(--space-sm)', marginLeft: 0,
            fontWeight: 400,
          }}
        >
          Intelligence feed
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-base)',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            marginTop: 0, marginRight: 0, marginBottom: '12px', marginLeft: 0,
            maxWidth: '64ch',
          }}
        >
          Curated developments across Baltic flexibility, balancing markets, grid connection, and
          BESS pipeline. Filter by country and category. Items pass a source-domain allowlist and a
          BESS-topic relevance gate before publication.
        </p>
      </header>

      <IntelFeed mode="full" />
    </main>
  );
}
