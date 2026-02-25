import { S1Card } from '@/app/components/S1Card';
import { S4Card } from '@/app/components/S4Card';
import { TechTracker } from '@/app/components/TechTracker';
import { CTASection } from '@/app/components/CTASection';
import { Contact } from '@/app/components/Contact';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

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
        Baltic energy infrastructure is mispriced. KKME tracks where.
      </p>

      {/* 3. S1 — Baltic Price Separation */}
      <ErrorBoundary>
        <S1Card />
      </ErrorBoundary>

      {/* 4. S4 — Grid Connection Scarcity */}
      <ErrorBoundary>
        <S4Card />
      </ErrorBoundary>

      {/* 5. Technology thesis */}
      <TechTracker />

      {/* 6. CTA */}
      <CTASection />

      {/* 7. Contact */}
      <Contact />
    </main>
  );
}
