import dynamic from 'next/dynamic';
import { S1Card } from '@/app/components/S1Card';
import { S2Card } from '@/app/components/S2Card';
import { CardBoundary } from '@/app/components/CardBoundary';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { HeroBalticMap } from '@/app/components/HeroBalticMap';
import StickyNav from '@/app/components/StickyNav';
import { PageInteractions } from '@/app/components/PageInteractions';
import { SignalDrawerPanel } from '@/app/components/SignalDrawerPanel';

// Below-fold: lazy-loaded via dynamic import to reduce initial bundle
const S3Card = dynamic(() => import('@/app/components/S3Card').then(m => m.S3Card));
const S4Card = dynamic(() => import('@/app/components/S4Card').then(m => m.S4Card));
const S7Card = dynamic(() => import('@/app/components/S7Card').then(m => m.S7Card));
const S9Card = dynamic(() => import('@/app/components/S9Card').then(m => m.S9Card));
const RenewableMixCard = dynamic(() => import('@/app/components/RenewableMixCard').then(m => m.RenewableMixCard));
const ResidualLoadCard = dynamic(() => import('@/app/components/ResidualLoadCard').then(m => m.ResidualLoadCard));
const PeakForecastCard = dynamic(() => import('@/app/components/PeakForecastCard').then(m => m.PeakForecastCard));
const SpreadCaptureCard = dynamic(() => import('@/app/components/SpreadCaptureCard').then(m => m.SpreadCaptureCard));
const RevenueCard = dynamic(() => import('@/app/components/RevenueCard').then(m => m.RevenueCard));
const TradingEngineCard = dynamic(() => import('@/app/components/TradingEngineCard').then(m => m.TradingEngineCard));
const IntelFeed = dynamic(() => import('@/app/components/IntelFeed').then(m => m.IntelFeed));
const ContactForm = dynamic(() => import('@/app/components/ContactForm').then(m => m.ContactForm));
const PageBackground = dynamic(() => import('@/app/components/PageBackground').then(m => m.PageBackground));
const CardEntrance = dynamic(() => import('@/app/components/CardEntrance').then(m => m.CardEntrance));

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageInteractions />
      <PageBackground />
      <StickyNav />
      <CardEntrance />

      {/* ═══ HERO — full-width, outside page-container ═══ */}
      <HeroBalticMap />

      <div className="page-container">

        {/* ═══ REVENUE SIGNALS ═══ */}
        <div className="section" id="revenue-drivers">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Revenue signals</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Day-ahead price capture and balancing market revenue — capacity reservation, activation energy, and DA arbitrage.</p>
          </div>
          <div className="grid-2 grid-2-stretch">
            <div className="card card-tier1" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <CardBoundary signal="S1"><S1Card /></CardBoundary>
            </div>
            <div className="card-tier1-feature" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <CardBoundary signal="S2"><S2Card /></CardBoundary>
            </div>
          </div>
          <SignalDrawerPanel />
        </div>

        {/* ═══ BUILD SIGNALS ═══ */}
        <div className="section" id="build">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Build conditions</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Project costs, financing, and grid access — the practical constraints on buildability</p>
          </div>
          <div className="grid-2">
            <div className="card" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <CardBoundary signal="S3"><S3Card /></CardBoundary>
            </div>
            <div className="card" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <CardBoundary signal="S4"><S4Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ STRUCTURAL MARKET DRIVERS ═══ */}
        <div className="section" id="structural">
          <div style={{ marginBottom: '24px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Structural market drivers</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Renewable mix, residual load, price spreads, and commodity signals driving Baltic BESS dispatch economics</p>
          </div>

          <div className="tier3-grid">
            <div className="card-tier3">
              <CardBoundary signal="renewable-mix"><RenewableMixCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="residual-load"><ResidualLoadCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="peak-forecast"><PeakForecastCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="spread-capture"><SpreadCaptureCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="S7"><S7Card /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="S9"><S9Card /></CardBoundary>
            </div>
          </div>

        </div>

        {/* ═══ REVENUE ENGINE — elevated ═══ */}
        <div className="section-elevated" id="revenue">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>50 MW reference asset</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>How timing, duration, and installed cost shape storage economics</p>
          </div>
          <div>
            <ErrorBoundary>
              <RevenueCard />
            </ErrorBoundary>
          </div>
          <div className="inline-cta">
            <a href="#conversation">Looking at Baltic storage? Start the conversation ↗</a>
          </div>
        </div>

        {/* ═══ DISPATCH INTELLIGENCE ═══ */}
        <div className="section" id="trading">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Dispatch intelligence</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>How the KKME dispatch algorithm allocates a reference BESS across Baltic balancing and arbitrage</p>
          </div>
          <div className="card card-tier1">
            <ErrorBoundary>
              <TradingEngineCard />
            </ErrorBoundary>
          </div>
        </div>

        {/* ═══ MARKET INTELLIGENCE ═══ */}
        <div className="section" id="intel">
          <div style={{ marginBottom: '24px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Market intelligence</h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
              Developments that affect Baltic BESS revenue, buildability, and market structure
            </p>
          </div>
          <IntelFeed />
        </div>

        {/* ═══ DISCUSS BALTIC STORAGE ═══ */}
        <div className="section" id="conversation">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Discuss Baltic storage</h2>
          </div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            {/* LEFT: Copy + credit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--font-base)',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                maxWidth: '480px',
              }}>
                Looking at Baltic storage? Working on a project, evaluating an investment, or comparing market notes — I&apos;d like to hear from you.
              </p>
              <div>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-sm)',
                  color: 'var(--text-muted)',
                  marginBottom: '10px',
                }}>
                  Kastytis Kemežys · Baltic energy infrastructure
                </p>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <a href="mailto:kastytis@kkme.eu" style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
                    color: 'var(--teal)', textDecoration: 'none',
                  }}>kastytis@kkme.eu</a>
                  <a href="tel:+37069822225" style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
                    color: 'var(--text-muted)', textDecoration: 'none',
                  }}>+370 698 22225</a>
                  <a href="https://www.linkedin.com/in/kastytis-kemezys/"
                    target="_blank" rel="noopener noreferrer" style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
                    color: 'var(--teal)', textDecoration: 'none',
                  }}>LinkedIn ↗</a>
                </div>
              </div>
            </div>

            {/* RIGHT: Form */}
            <div>
              <ContactForm />
            </div>
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <footer style={{
          borderTop: '1px solid var(--border-card)',
          padding: '32px 0',
          marginTop: '48px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}>KKME · Baltic BESS Market Signals</span>
            <div style={{
              display: 'flex', gap: '24px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>kastytis@kkme.eu</span>
              <span style={{ color: 'var(--text-muted)' }}>+370 698 22225</span>
              <a href="https://www.linkedin.com/in/kastytis-kemezys/"
                target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--teal)', textDecoration: 'none' }}>LinkedIn ↗</a>
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            marginTop: '16px',
          }}>
            Data: ENTSO-E · NVE · ECB · energy-charts.info · Litgrid · VERT.lt · Updated every 4h
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-ghost)',
            marginTop: '8px',
            letterSpacing: '0.06em',
          }}>
            Keyboard: R revenue · S signals · B build · M market · I intel · C contact
          </div>
        </footer>

      </div>
    </main>
  );
}
