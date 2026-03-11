'use client';
import { useState, useEffect } from 'react';
import SignalBar from './SignalBar';

const NAV_LINKS = [
  { label: 'Signals', href: '#revenue-drivers' },
  { label: 'Build',   href: '#build' },
  { label: 'Structure', href: '#structural' },
  { label: 'Intel',   href: '#intel' },
  { label: 'Contact', href: '#deal-flow' },
];

function scrollTo(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function StickyNav() {
  const [show, setShow] = useState(false);
  const [visibleLinks, setVisibleLinks] = useState(NAV_LINKS);

  useEffect(() => {
    const h = () => setShow(window.scrollY > 300);
    window.addEventListener('scroll', h, { passive: true });

    // Only show links whose target exists on the page
    const existing = NAV_LINKS.filter(l => document.querySelector(l.href));
    setVisibleLinks(existing.length > 0 ? existing : NAV_LINKS);

    return () => window.removeEventListener('scroll', h);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 100,
    }}>
      <nav style={{
        display: 'flex',
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
          {visibleLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); scrollTo(l.href); }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
              }}
            >{l.label}</a>
          ))}
          <a
            href="#deal-flow"
            onClick={(e) => { e.preventDefault(); scrollTo('#deal-flow'); }}
            style={{
              padding: '5px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              background: 'transparent',
              border: '1px solid var(--border-card)',
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              marginLeft: '20px',
              borderRadius: '2px',
            }}
          >Get in touch</a>
        </div>
      </nav>
      <SignalBar />
    </div>
  );
}
