'use client';
import { useState, useEffect } from 'react';
import SignalBar from './SignalBar';

const NAV_LINKS = [
  { label: 'Signals',   href: '#revenue-drivers' },
  { label: 'Build',     href: '#build' },
  { label: 'Structure', href: '#structural' },
  { label: 'Returns',   href: '#revenue' },
  { label: 'Intel',     href: '#intel' },
];

function scrollTo(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
}

export default function StickyNav() {
  const [show, setShow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleLinks, setVisibleLinks] = useState(NAV_LINKS);

  useEffect(() => {
    const h = () => {
      setShow(window.scrollY > 300);
      if (menuOpen) setMenuOpen(false);
    };
    window.addEventListener('scroll', h, { passive: true });

    const existing = NAV_LINKS.filter(l => document.querySelector(l.href));
    setVisibleLinks(existing.length > 0 ? existing : NAV_LINKS);

    return () => window.removeEventListener('scroll', h);
  }, [menuOpen]);

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

        {/* Desktop links */}
        <div className="nav-desktop" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {visibleLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); scrollTo(l.href); }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >{l.label}</a>
          ))}
          <a
            href="#conversation"
            onClick={(e) => { e.preventDefault(); scrollTo('#conversation'); }}
            style={{
              padding: '5px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              background: 'transparent',
              border: '1px solid var(--border-highlight)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              marginLeft: '20px',
              borderRadius: '2px',
            }}
          >Get in touch</a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="nav-mobile-toggle"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle navigation"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="nav-mobile-menu" style={{
          display: 'none',
          flexDirection: 'column',
          gap: '0',
          background: 'rgba(7,7,10,0.96)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(232,226,217,0.06)',
          padding: '8px 0',
        }}>
          {visibleLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); scrollTo(l.href); setMenuOpen(false); }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
                padding: '10px 24px',
              }}
            >{l.label}</a>
          ))}
          <a
            href="#conversation"
            onClick={(e) => { e.preventDefault(); scrollTo('#conversation'); setMenuOpen(false); }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: 'var(--teal)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              padding: '10px 24px',
            }}
          >Get in touch</a>
        </div>
      )}

      <SignalBar />
    </div>
  );
}
