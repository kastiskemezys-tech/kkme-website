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
import { CardBoundary } from '@/app/components/CardBoundary';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { CardEntrance } from '@/app/components/CardEntrance';
import { PageBackground } from '@/app/components/PageBackground';
import { HeroMarketNow } from '@/app/components/HeroMarketNow';
import StickyNav from '@/app/components/StickyNav';
import { PageInteractions } from '@/app/components/PageInteractions';

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

        {/* ═══ REVENUE ENGINE — elevated ═══ */}
        <div className="section-elevated" id="revenue">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Baltic Project Returns</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>20-year returns against Clean Horizon S1 2025</p>
          </div>
          <div>
            <ErrorBoundary>
              <RevenueCard />
            </ErrorBoundary>
          </div>
          {/* ═══ MID-PAGE CTA ═══ */}
          <div className="inline-cta">
            <a href="#deal-flow">Have a Baltic battery project? Send it for review ↗</a>
          </div>
        </div>

        {/* ═══ INVESTMENT SIGNALS ═══ */}
        <div className="section" id="signals">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Baltic Revenue Drivers</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>Capacity pricing and arbitrage — 86% of gross revenue</p>
          </div>
          <div className="grid-2">
            <div className="card card-tier1">
              <CardBoundary signal="S1"><S1Card /></CardBoundary>
            </div>
            <div className="card card-tier1">
              <CardBoundary signal="S2"><S2Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ BUILD SIGNALS ═══ */}
        <div className="section" id="build">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Build Conditions</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>CAPEX, financing, and grid connection</p>
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

        {/* ═══ MARKET CONTEXT — elevated ═══ */}
        <div className="section-elevated" id="context">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Baltic Power Market</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>Macro energy prices and structural factors</p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '24px',
          }}>
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
            <div className="card card-tier3">
              <CardBoundary signal="S5"><S5Card /></CardBoundary>
            </div>
          </div>
        </div>

        {/* ═══ MID-PAGE CTA ═══ */}
        <div className="inline-cta">
          <a href="#deal-flow">Looking for Baltic battery deal flow? Get in touch ↗</a>
        </div>

        {/* ═══ INTEL FEED ═══ */}
        <div className="section" id="intel">
          <div style={{ marginBottom: '16px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Market Intel</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>Baltic energy storage news via @gattana_bot</p>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}>
            Latest Baltic energy storage signals via Telegram
          </p>
          <div>
            <IntelFeed />
          </div>
        </div>

        {/* ═══ DEAL FLOW ═══ */}
        <div className="section" id="deal-flow">
          <div style={{ marginBottom: '32px' }}>
            <h2 className="section-header" style={{ marginBottom: '6px' }}>Deal Flow</h2>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>Baltic BESS projects at RTB stage</p>
          </div>
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
                Baltic BESS and hybrid projects at RTB or near-RTB stage.
                Send a teaser — go/no-go and proposed structure within 48 hours.
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
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                lineHeight: 1.8,
              }}>
                Built by Kastytis Kemežys<br />
                Baltic energy infrastructure
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
                <a href="mailto:kastytis@kkme.eu" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
                  color: 'var(--teal)', textDecoration: 'none',
                }}>kastytis@kkme.eu</a>
                <a href="tel:+37069822225" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
                  color: 'var(--text-muted)', textDecoration: 'none',
                }}>+370 698 22225</a>
                <a href="https://www.linkedin.com/in/kastytis-kemezys/"
                  target="_blank" rel="noopener noreferrer" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
                  color: 'var(--teal)', textDecoration: 'none',
                }}>LinkedIn ↗</a>
              </div>
            </div>

            {/* RIGHT: Structured Form */}
            <div>
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
                    fontSize: '0.8125rem',
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
                      fontSize: '0.8125rem',
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
                fontSize: '0.8125rem',
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
            fontSize: '0.8125rem',
            color: 'var(--text-ghost)',
            marginTop: '16px',
          }}>
            Data: ENTSO-E · NVE · ECB · energy-charts.info · Litgrid · VERT.lt · Updated every 4h
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.5625rem',
            color: 'var(--text-ghost)',
            marginTop: '8px',
            letterSpacing: '0.06em',
          }}>
            Keyboard: R revenue · S signals · B build · M market · I intel · D deal flow
          </div>
        </footer>

      </div>
    </main>
  );
}
