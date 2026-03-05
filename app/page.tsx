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
import { IntelFeed } from '@/app/components/IntelFeed';
import { StatusStrip } from '@/app/components/StatusStrip';
import { CardBoundary } from '@/app/components/CardBoundary';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { CardEntrance } from '@/app/components/CardEntrance';
import { PageBackground } from '@/app/components/PageBackground';
import { HeroRays } from '@/app/components/HeroRays';
import StickyNav from '@/app/components/StickyNav';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageBackground />
      <StickyNav />
      <CardEntrance />

      <div className="page-container">

        {/* ═══ HERO ═══ */}
        <header style={{ textAlign: 'center', padding: '80px 0 48px', position: 'relative' }}>
          <HeroRays />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            color: 'var(--text-primary)',
            letterSpacing: '0.15em',
            marginBottom: '16px',
            fontWeight: 400,
            position: 'relative',
            zIndex: 1,
          }}>KKME</h1>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.25rem',
            color: 'var(--text-secondary)',
            maxWidth: '480px',
            margin: '0 auto',
            lineHeight: 1.5,
            position: 'relative',
            zIndex: 1,
          }}>
            Baltic BESS market console
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            maxWidth: '440px',
            margin: '16px auto 0',
            lineHeight: 1.6,
            position: 'relative',
            zIndex: 1,
          }}>
            Revenue signals · grid constraints · build conditions ·
            fleet competition. Updated every 4 hours.
          </p>
          <div style={{
            display: 'flex', gap: '12px',
            justifyContent: 'center',
            marginTop: '32px', flexWrap: 'wrap',
            position: 'relative', zIndex: 1,
          }}>
            <a href="#deal-flow" style={{
              display: 'inline-block', padding: '10px 28px',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              letterSpacing: '0.06em',
              background: 'rgba(212,160,60,0.12)',
              color: 'var(--amber)',
              border: '1px solid rgba(212,160,60,0.25)',
              textDecoration: 'none',
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

        {/* ═══ STATUS STRIP ═══ */}
        <div style={{ marginBottom: '48px' }}>
          <StatusStrip />
        </div>

        {/* ═══ BRIDGE TEXT ═══ */}
        <div style={{ maxWidth: '640px', margin: '0 auto 96px', textAlign: 'center' }}>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.05rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
          }}>
            Nine signals track Baltic BESS viability.
            Revenue spreads, grid access, and fleet competition
            update every four hours from ENTSO-E, Litgrid,
            and Baltic TSO data.
          </p>
        </div>

        {/* ═══ MARKET STATE INDICATOR ═══ */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '64px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '20px',
            padding: '14px 32px',
            background: 'rgba(232,226,217,0.02)',
            border: '1px solid var(--border-card)',
            borderRadius: '4px',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.5625rem',
                color: 'var(--text-ghost)',
                letterSpacing: '0.12em',
                marginBottom: '4px',
              }}>BALTIC BESS MARKET</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                color: 'var(--teal)',
                letterSpacing: '0.06em',
              }}>BUILDABLE</div>
            </div>
            <div style={{ width: '1px', height: '32px', background: 'rgba(232,226,217,0.06)' }} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}>
              Spread widening · Balancing tight · Fleet moderate
            </div>
          </div>
        </div>

        {/* ═══ REVENUE ENGINE — elevated ═══ */}
        <div className="section-elevated" id="revenue">
          <h2 className="section-header">Project Economics</h2>
          <div className="card card-tier1">
            <ErrorBoundary>
              <RevenueCard />
            </ErrorBoundary>
          </div>
        </div>

        {/* ═══ INVESTMENT SIGNALS ═══ */}
        <div className="section" id="signals">
          <h2 className="section-header">Revenue Drivers</h2>
          <div className="grid-2">
            <div className="card card-tier1">
              <CardBoundary signal="S1"><S1Card /></CardBoundary>
            </div>
            <div className="card card-tier1">
              <CardBoundary signal="S2"><S2Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ MID-PAGE CTA ═══ */}
        <div className="inline-cta">
          <a href="#deal-flow">Have a Baltic BESS project? Submit for evaluation ↗</a>
        </div>

        {/* ═══ BUILD SIGNALS ═══ */}
        <div className="section" id="build">
          <h2 className="section-header">Build Conditions</h2>
          <div className="grid-2">
            <div className="card">
              <CardBoundary signal="S3"><S3Card /></CardBoundary>
            </div>
            <div className="card">
              <CardBoundary signal="S4"><S4Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ MARKET CONTEXT — elevated ═══ */}
        <div className="section-elevated" id="context">
          <h2 className="section-header">Market Drivers</h2>
          <div className="grid-4">
            <div className="card card-tier3">
              <CardBoundary signal="S6"><S6Card /></CardBoundary>
            </div>
            <div className="card card-tier3">
              <CardBoundary signal="S7"><S7Card /></CardBoundary>
            </div>
            <div className="card card-tier3">
              <CardBoundary signal="S8"><S8Card /></CardBoundary>
            </div>
            <div className="card card-tier3">
              <CardBoundary signal="S9"><S9Card /></CardBoundary>
            </div>
          </div>
          <div className="card card-tier3" style={{ marginTop: '20px' }}>
            <CardBoundary signal="S5"><S5Card /></CardBoundary>
          </div>
        </div>

        {/* ═══ MID-PAGE CTA ═══ */}
        <div className="inline-cta">
          <a href="#deal-flow">Looking for Baltic energy deal flow? Get in touch ↗</a>
        </div>

        {/* ═══ INTEL FEED ═══ */}
        <div className="section" id="intel">
          <h2 className="section-header">Market Intel</h2>
          <div className="card">
            <IntelFeed />
          </div>
        </div>

        {/* ═══ DEAL FLOW ═══ */}
        <div className="section" id="deal-flow">
          <h2 className="section-header">Deal Flow</h2>
          <div className="grid-2">
            {/* LEFT: About + Contact */}
            <div>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                color: 'var(--text-primary)',
                marginBottom: '16px',
                fontWeight: 400,
                letterSpacing: '0.06em',
              }}>Baltic BESS Deal Flow</h3>
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                marginBottom: '20px',
              }}>
                Baltic BESS and hybrid projects at RTB or
                near-RTB stage. Send a teaser — go/no-go
                and proposed structure within 48 hours.
              </p>
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '0.95rem',
                color: 'var(--text-tertiary)',
                lineHeight: 1.6,
                marginBottom: '20px',
              }}>
                Capital partners: if you deploy equity into energy infrastructure and
                want Baltic exposure, contact me.
              </p>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                lineHeight: 1.8,
              }}>
                Built by Kastytis Kemežys<br />
                Baltic energy infrastructure
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
                <a href="mailto:kastytis@kkme.eu" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                  color: 'var(--teal)', textDecoration: 'none',
                }}>kastytis@kkme.eu</a>
                <a href="tel:+37069822225" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                  color: 'var(--text-muted)', textDecoration: 'none',
                }}>+370 698 22225</a>
                <a href="https://www.linkedin.com/in/kastytis-kemezys/"
                  target="_blank" rel="noopener noreferrer" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                  color: 'var(--teal)', textDecoration: 'none',
                }}>LinkedIn ↗</a>
              </div>
            </div>

            {/* RIGHT: Structured Form */}
            <div className="card">
              {([
                { label: 'Project name', name: 'project', type: 'text', placeholder: '' },
                { label: 'MW / MWh', name: 'capacity', type: 'text', placeholder: '50 MW / 100 MWh' },
                { label: 'Location', name: 'location', type: 'text', placeholder: 'Lithuania, Kaunas region' },
                { label: 'Target COD', name: 'cod', type: 'text', placeholder: 'Q4 2027' },
                { label: 'Stage', name: 'stage', type: 'text', placeholder: 'RTB / Construction / Development' },
                { label: 'Your email', name: 'email', type: 'email', placeholder: '' },
              ] as Array<{ label: string; name: string; type: string; placeholder: string }>).map(field => (
                <div key={field.name} style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    color: 'var(--text-muted)',
                    marginBottom: '5px',
                    letterSpacing: '0.04em',
                  }}>{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(232,226,217,0.02)',
                      border: '1px solid var(--border-card)',
                      borderRadius: '2px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6875rem',
                      boxSizing: 'border-box',
                    } as React.CSSProperties}
                  />
                </div>
              ))}
              <button style={{
                padding: '10px 28px',
                marginTop: '8px',
                background: 'rgba(212,160,60,0.12)',
                border: '1px solid rgba(212,160,60,0.25)',
                borderRadius: '2px',
                color: 'var(--amber)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}>Submit Teaser</button>
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
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}>KKME · Baltic BESS Market Signals</span>
            <div style={{
              display: 'flex', gap: '24px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
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
            fontSize: '0.6875rem',
            color: 'var(--text-ghost)',
            marginTop: '16px',
          }}>
            Data: ENTSO-E · NVE · ECB · energy-charts.info · Litgrid · VERT.lt · Updated every 4h
          </div>
        </footer>

      </div>
    </main>
  );
}
