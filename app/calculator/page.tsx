/**
 * /calculator — BESS Revenue Calculator.
 *
 * Phase 35.2. Productises the Phase-34 consultancy engine: a public sample
 * tier for lead generation, and an operator-private full tier behind a
 * password.
 *
 * SOFT LAUNCH. This route is reachable only by URL — no nav entry, no footer
 * link, no homepage mention. Nothing outside app/calculator/ was edited to
 * ship it, which bounds the blast radius on existing surfaces to zero. The
 * operator decides whether to link it after reviewing the live page.
 *
 * Metadata follows the 33.C pattern: `canonical: './'` resolves against the
 * layout's metadataBase, so this route emits https://kkme.eu/calculator rather
 * than inheriting the homepage canonical.
 */

import type { Metadata } from 'next';
import { Calculator } from './Calculator';

export const metadata: Metadata = {
  title: 'BESS Revenue Calculator — Baltic Storage Economics — KKME',
  description:
    'Independent first-year revenue and EBITDA projection for Baltic battery storage projects, ' +
    'computed by KKME\'s calibrated dispatch engine on live Lithuanian market data.',
  alternates: {
    canonical: './',
  },
  openGraph: {
    title: 'BESS Revenue Calculator — KKME',
    description:
      'Revenue and EBITDA projection for Baltic BESS projects, on live market data.',
    url: 'https://kkme.eu/calculator',
    siteName: 'KKME',
    type: 'website',
  },
};

export default function CalculatorPage() {
  return (
    <main
      style={{
        paddingTop: '80px',
        paddingRight: 'var(--space-md)',
        paddingBottom: '120px',
        paddingLeft: 'var(--space-md)',
        maxWidth: '980px',
        margin: '0 auto',
        color: 'var(--text-primary)',
        background: 'var(--bg)',
      }}
    >
      <header style={{ marginBottom: 'var(--space-lg)' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginTop: 0,
            marginRight: 0,
            marginBottom: 'var(--space-xs)',
            marginLeft: 0,
          }}
        >
          KKME
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-xl)',
            fontWeight: 200,
            lineHeight: 1.1,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          BESS Revenue Calculator
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-base)',
            color: 'var(--text-tertiary)',
            maxWidth: '62ch',
            marginTop: 'var(--space-xs)',
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0,
          }}
        >
          Independent revenue and EBITDA projection for Baltic BESS projects — powered by
          KKME&rsquo;s calibrated engine.
        </p>
      </header>

      <Calculator engineStamp="Computed on live Baltic market data at request time." />
    </main>
  );
}
