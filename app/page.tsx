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
import { CardEntrance } from '@/app/components/CardEntrance';
import { StatusStrip } from '@/app/components/StatusStrip';
import { PageBackground } from '@/app/components/PageBackground';
import { HeroRays } from '@/app/components/HeroRays';
import { SectionDivider } from '@/app/components/SectionDivider';
import StickyNav from '@/app/components/StickyNav';

export default function Home() {
  return (
    <main
      className="card-column"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3rem',
        padding: '4rem 1.5rem 8rem 1.5rem',
        margin: '0 auto',
      }}
    >
      {/* Full-page ambient gradient */}
      <PageBackground />

      {/* Sticky nav — appears after scroll */}
      <StickyNav />

      {/* 1. Hero */}
      <div style={{ position: 'relative', width: '100%' }}>
        <HeroRays />
        <header style={{
          textAlign: 'center',
          padding: '48px 24px 32px',
          position: 'relative',
          zIndex: 1,
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 8vw, 6rem)',
            letterSpacing: '0.25em',
            color: 'var(--text-primary)',
            fontWeight: 400,
            marginBottom: '12px',
          }}>KKME</h1>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
            color: 'var(--text-secondary)',
            maxWidth: '520px',
            margin: '0 auto',
            lineHeight: 1.6,
            fontWeight: 300,
          }}>
            Live market signals for Baltic energy storage investment
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            maxWidth: '440px',
            margin: '12px auto 0',
            lineHeight: 1.6,
          }}>
            Real-time pricing, grid capacity, and revenue signals
            for BESS projects in Lithuania and the Baltics.
          </p>
          <div style={{
            display: 'flex', gap: '12px',
            justifyContent: 'center',
            marginTop: '28px', flexWrap: 'wrap',
          }}>
            <a href="#deal-flow" style={{
              display: 'inline-block', padding: '10px 28px',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              letterSpacing: '0.06em',
              background: 'rgba(212,160,60,0.12)',
              color: 'var(--amber)',
              border: '1px solid rgba(212,160,60,0.25)',
              textDecoration: 'none', cursor: 'pointer',
            }}>Submit a Project</a>
            <a href="#signals" style={{
              display: 'inline-block', padding: '10px 28px',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              letterSpacing: '0.06em',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-card)',
              textDecoration: 'none',
            }}>View Signals ↓</a>
          </div>
        </header>
      </div>

      {/* Status strip — live readings above fold */}
      <StatusStrip />

      <CardEntrance />

      {/* Revenue Engine — above signals so it anchors the page */}
      <section id="revenue" style={{ width: '100%', display: 'contents' }}>
        <ErrorBoundary>
          <RevenueCard />
        </ErrorBoundary>
      </section>

      {/* ── INVESTMENT SIGNALS ─────────────────────────────────────────────── */}
      <section id="signals" style={{ width: '100%', display: 'contents' }}>
        <SectionDivider label="Investment Signals" />

        {/* S1 — Baltic Price Separation */}
        <CardBoundary signal="S1">
          <S1Card />
        </CardBoundary>

        {/* S2 — Balancing Market Tension */}
        <CardBoundary signal="S2">
          <S2Card />
        </CardBoundary>
      </section>

      {/* ── BUILD SIGNALS ──────────────────────────────────────────────────── */}
      <section id="build" style={{ width: '100%', display: 'contents' }}>
        <SectionDivider label="Build Signals" />

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
      </section>

      {/* ── MARKET CONTEXT ─────────────────────────────────────────────────── */}
      <section id="context" style={{ width: '100%', display: 'contents' }}>
        <SectionDivider label="Market Context" />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1px',
            width: '100%',
            maxWidth: '900px',
          }}
        >
          <CardBoundary signal="S6"><S6Card /></CardBoundary>
          <CardBoundary signal="S7"><S7Card /></CardBoundary>
          <div style={{ gridColumn: '1 / -1' }}>
            <CardBoundary signal="S8"><S8Card /></CardBoundary>
          </div>
          <CardBoundary signal="S9"><S9Card /></CardBoundary>
        </div>
      </section>

      {/* ── INTEL ──────────────────────────────────────────────────────────── */}
      <section id="intel" style={{ width: '100%', display: 'contents' }}>
        <IntelFeed />
      </section>

      {/* Gradient threshold divider before CTA */}
      <div style={{
        width: '100%',
        maxWidth: '580px',
        height: '2px',
        background: 'linear-gradient(to right, rgba(212,160,60,0.35), rgba(45,212,168,0.25), rgba(74,127,181,0.15))',
      }} />

      {/* CTA */}
      <section id="deal-flow" style={{ width: '100%', display: 'contents' }}>
        <CTASection />
        <Contact />
      </section>
    </main>
  );
}
