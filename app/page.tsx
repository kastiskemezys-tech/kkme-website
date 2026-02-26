import { S1Card } from '@/app/components/S1Card';
import { S2Card } from '@/app/components/S2Card';
import { S3Card } from '@/app/components/S3Card';
import { S4Card } from '@/app/components/S4Card';
import { RevenueCard } from '@/app/components/RevenueCard';
import { TechTracker } from '@/app/components/TechTracker';
import { CTASection } from '@/app/components/CTASection';
import { Contact } from '@/app/components/Contact';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { CardBoundary } from '@/app/components/CardBoundary';
import { IntelFeed } from '@/app/components/IntelFeed';

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3rem',
        padding: '4rem 1.5rem 8rem 1.5rem',
      }}
    >
      {/* 1. KKME wordmark */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 8vw, 6rem)',
          letterSpacing: '0.25em',
          color: 'var(--text)',
          fontWeight: 400,
        }}
      >
        KKME
      </h1>

      {/* 2. Statement */}
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
          lineHeight: 1.7,
          color: 'rgba(232, 226, 217, 0.7)',
          maxWidth: '580px',
          textAlign: 'center',
          margin: '0 auto',
        }}
      >
        Baltic BESS · grid · DC · signal console
      </p>

      {/* 3. S1 — Baltic Price Separation */}
      <CardBoundary signal="S1">
        <S1Card />
      </CardBoundary>

      {/* 4. S2 — Balancing Market Tension */}
      <CardBoundary signal="S2">
        <S2Card />
      </CardBoundary>

      {/* 5. S3 — Lithium Cell Price */}
      <CardBoundary signal="S3">
        <S3Card />
      </CardBoundary>

      {/* 6. S4 — Grid Connection Scarcity */}
      <CardBoundary signal="S4">
        <S4Card />
      </CardBoundary>

      {/* 7. Intel Feed */}
      <IntelFeed />

      {/* 8. Revenue Engine */}
      <ErrorBoundary>
        <RevenueCard />
      </ErrorBoundary>

      {/* 9. Technology thesis */}
      <TechTracker />

      {/* 9. CTA */}
      <CTASection />

      {/* 10. Contact */}
      <Contact />
    </main>
  );
}
