'use client';
import { useState, useEffect } from 'react';

export default function StickyNav() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 300);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  if (!show) return null;

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 100, display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 24px',
      background: 'rgba(7,7,10,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(232,226,217,0.06)',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: '0.7rem',
        letterSpacing: '0.15em',
        color: 'var(--text-primary)',
      }}>KKME</span>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        {[
          { label: 'Signals', href: '#signals' },
          { label: 'Build',   href: '#build' },
          { label: 'Intel',   href: '#intel' },
          { label: 'Contact', href: '#deal-flow' },
        ].map(l => (
          <a key={l.href} href={l.href} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6875rem',
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
          }}>{l.label}</a>
        ))}
      </div>
    </nav>
  );
}
