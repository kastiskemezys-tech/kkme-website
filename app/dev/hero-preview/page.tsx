'use client';

import { HeroBalticMap } from '@/app/components/HeroBalticMap';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { ColorTuner } from './ColorTuner';

export default function HeroPreview() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--hero-bg)' }}>
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
        DEV
        <ThemeToggle variant="hero" />
      </div>
      <HeroBalticMap />
      <ColorTuner />
    </div>
  );
}
