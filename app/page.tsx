import type { CSSProperties } from 'react';
import { S1Card } from '@/app/components/S1Card';
import { S2Card } from '@/app/components/S2Card';
import { S3Card } from '@/app/components/S3Card';
import { S4Card } from '@/app/components/S4Card';
import { S5Card } from '@/app/components/S5Card';
import { S6Card } from '@/app/components/S6Card';
import { S7Card } from '@/app/components/S7Card';
import { S8Card } from '@/app/components/S8Card';
import { S9Card } from '@/app/components/S9Card';
import { RevenueCard } from '@/app/components/RevenueCard';
import { CTASection } from '@/app/components/CTASection';
import { Contact } from '@/app/components/Contact';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { CardBoundary } from '@/app/components/CardBoundary';
import { IntelFeed } from '@/app/components/IntelFeed';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function LayerLabel({ label }: Readonly<{ label: string }>) {
  return (
    <h2
      style={{
        ...MONO,
        fontSize: '0.75rem',
        letterSpacing: '0.2em',
        color: 'rgba(232, 226, 217, 0.60)',
        textTransform: 'uppercase',
        fontWeight: 400,
        width: '100%',
        maxWidth: '440px',
        marginBottom: '-1rem',
      }}
    >
      {label}
    </h2>
  );
}

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

      {/* ── OPPORTUNITY ────────────────────────────────────────────────────── */}
      <LayerLabel label="Opportunity" />

      {/* S1 — Baltic Price Separation */}
      <CardBoundary signal="S1">
        <S1Card />
      </CardBoundary>

      {/* S2 — Balancing Market Tension */}
      <CardBoundary signal="S2">
        <S2Card />
      </CardBoundary>

      {/* ── BUILD ──────────────────────────────────────────────────────────── */}
      <LayerLabel label="Build" />

      {/* S3 — Lithium Cell Price */}
      <CardBoundary signal="S3">
        <S3Card />
      </CardBoundary>

      {/* S4 — Grid Connection Scarcity */}
      <CardBoundary signal="S4">
        <S4Card />
      </CardBoundary>

      {/* S5 — DC Power Viability */}
      <CardBoundary signal="S5">
        <S5Card />
      </CardBoundary>

      {/* ── MARKET CONTEXT ─────────────────────────────────────────────────── */}
      <LayerLabel label="Market Context" />

      {/* S6 — Nordic Hydro */}
      <CardBoundary signal="S6">
        <S6Card />
      </CardBoundary>

      {/* S7 — TTF Gas */}
      <CardBoundary signal="S7">
        <S7Card />
      </CardBoundary>

      {/* S8 — Interconnector Flows */}
      <CardBoundary signal="S8">
        <S8Card />
      </CardBoundary>

      {/* S9 — EU ETS Carbon */}
      <CardBoundary signal="S9">
        <S9Card />
      </CardBoundary>

      {/* ── INTEL ──────────────────────────────────────────────────────────── */}
      <IntelFeed />

      {/* Revenue Engine */}
      <ErrorBoundary>
        <RevenueCard />
      </ErrorBoundary>

      {/* CTA */}
      <CTASection />

      {/* Contact */}
      <Contact />
    </main>
  );
}
