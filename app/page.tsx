import dynamic from 'next/dynamic';
import { S1Card } from '@/app/components/S1Card';
import { S2Card } from '@/app/components/S2Card';
import { CardBoundary } from '@/app/components/CardBoundary';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { HeroMarketNow } from '@/app/components/HeroMarketNow';
import StickyNav from '@/app/components/StickyNav';
import { PageInteractions } from '@/app/components/PageInteractions';

// Below-fold: lazy-loaded via dynamic import to reduce initial bundle
const S3Card = dynamic(() => import('@/app/components/S3Card').then(m => m.S3Card));
const S4Card = dynamic(() => import('@/app/components/S4Card').then(m => m.S4Card));
const S7Card = dynamic(() => import('@/app/components/S7Card').then(m => m.S7Card));
const S8Card = dynamic(() => import('@/app/components/S8Card').then(m => m.S8Card));
const S9Card = dynamic(() => import('@/app/components/S9Card').then(m => m.S9Card));
const ConfidencePanel = dynamic(() => import('@/app/components/ConfidencePanel').then(m => m.ConfidencePanel));
const WindCard = dynamic(() => import('@/app/components/WindCard').then(m => m.WindCard));
const SolarCard = dynamic(() => import('@/app/components/SolarCard').then(m => m.SolarCard));
const LoadCard = dynamic(() => import('@/app/components/LoadCard').then(m => m.LoadCard));
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

      <div className="page-container">

        {/* ═══ HERO / MARKET NOW ═══ */}
        <HeroMarketNow />

        {/* ═══ REVENUE SIGNALS ═══ */}
        <div className="section" id="revenue-drivers">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Revenue signals</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Day-ahead price capture and balancing market revenue — capacity reservation, activation energy, and DA arbitrage.</p>
          </div>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card card-tier1">
              <CardBoundary signal="S1"><S1Card /></CardBoundary>
              <div style={{ marginTop: '24px', padding: '16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', opacity: 0.4, borderTop: '1px solid var(--border-card)' }}>
                <p style={{ margin: 0 }}>DA capture feeds into the revenue engine alongside balancing data →</p>
              </div>
            </div>
            <div className="card-tier1-feature">
              <CardBoundary signal="S2"><S2Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ BUILD SIGNALS ═══ */}
        <div className="section" id="build">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Build conditions</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Project costs, financing, and grid access — the practical constraints on buildability</p>
          </div>
          <div className="grid-2">
            <div className="card">
              <CardBoundary signal="S3"><S3Card /></CardBoundary>
            </div>
            <div className="card">
              <CardBoundary signal="S4"><S4Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ STRUCTURAL MARKET DRIVERS ═══ */}
        <div className="section" id="structural">
          <div style={{ marginBottom: '24px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Structural market drivers</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Wind, solar, demand, interconnectors, and commodity inputs shaping price spreads</p>
          </div>

          <div className="tier3-grid">
            <div className="card-tier3">
              <CardBoundary signal="wind"><WindCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="solar"><SolarCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="load"><LoadCard /></CardBoundary>
            </div>
            <div className="card-tier3">
              <CardBoundary signal="S8"><S8Card /></CardBoundary>
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
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Reference asset returns</h2>
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

        {/* ═══ MODEL RISK REGISTER ═══ */}
        <div className="section" id="model-risks">
          <div style={{ maxWidth: '700px' }}>
            <h2 style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: '16px',
              fontWeight: 500,
            }}>Model risk register</h2>

            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              color: 'var(--text-tertiary)',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '54px 1fr 52px 52px',
                gap: '8px',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-card)',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>
                <span>ID</span><span>Risk</span><span>Impact</span><span>Residual</span>
              </div>
              {[
                { id: 'MR-01', risk: 'Reserve clearing prices not observed — proxy only', impact: 'HIGH', residual: 'HIGH' },
                { id: 'MR-02', risk: 'Pipeline timing uses static weights, not hazard model', impact: 'HIGH', residual: 'HIGH' },
                { id: 'MR-03', risk: 'Dispatch stacking uses fixed factor, not LP optimizer', impact: 'HIGH', residual: 'HIGH' },
                { id: 'MR-04', risk: 'Activation revenue assumed — no Baltic observed data', impact: 'HIGH', residual: 'HIGH' },
                { id: 'MR-05', risk: 'DRR/TSO derogation exit timing unknown (~2028)', impact: 'MED', residual: 'MED' },
                { id: 'MR-06', risk: 'BBCM/PICASSO/MARI design changes not modeled', impact: 'MED', residual: 'HIGH' },
                { id: 'MR-07', risk: 'LV/EE grid data missing — LT only from VERT.lt', impact: 'MED', residual: 'MED' },
              ].map(r => (
                <div key={r.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '54px 1fr 52px 52px',
                  gap: '8px',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(232,226,217,0.04)',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{r.id}</span>
                  <span>{r.risk}</span>
                  <span style={{ color: r.impact === 'HIGH' ? 'var(--rose)' : 'var(--amber)' }}>{r.impact}</span>
                  <span style={{ color: r.residual === 'HIGH' ? 'var(--rose)' : 'var(--amber)' }}>{r.residual}</span>
                </div>
              ))}
            </div>

            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              color: 'var(--text-muted)',
              marginTop: '12px',
              lineHeight: 1.6,
            }}>
              Model v5.1 · Outputs are directional intelligence, not investment advice.
            </p>
          </div>
        </div>

        {/* ═══ DATA CONFIDENCE ═══ */}
        <div className="section" style={{ paddingTop: '24px', paddingBottom: '24px' }}>
          <ConfidencePanel />
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
