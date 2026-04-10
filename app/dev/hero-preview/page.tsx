'use client';

import { HeroBalticMap } from '@/app/components/HeroBalticMap';
import { ThemeToggle } from '@/app/components/ThemeToggle';

export default function HeroPreview() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      {/* Control bar */}
      <div style={{
        position: 'fixed', top: 0, right: 0, zIndex: 100,
        padding: '8px 16px',
        background: 'var(--bg-page)',
        border: '1px solid var(--border-card)',
        display: 'flex', alignItems: 'center', gap: '12px',
        fontFamily: 'var(--font-mono)', fontSize: '10px',
        color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        DEV PREVIEW
        <ThemeToggle variant="hero" />
      </div>

      {/* Full-bleed hero */}
      <HeroBalticMap />

      {/* Below hero — placeholder for page content */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '48px 32px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-card)',
          paddingTop: '24px',
        }}>
          ↑ Hero section ends here. Below would be #revenue-drivers (S1 + S2 cards).
        </div>
      </div>
    </div>
  );
}
