'use client';
import { useState, useEffect } from 'react';
import SignalBar from './SignalBar';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS = [
  { label: 'Signals',   href: '#revenue-drivers' },
  { label: 'Build',     href: '#build' },
  { label: 'Structure', href: '#structural' },
  { label: 'Returns',   href: '#revenue' },
  { label: 'Trading',   href: '#trading' },
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
        paddingTop: '10px', paddingRight: 'var(--space-md)', paddingBottom: '10px', paddingLeft: 'var(--space-md)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/design-assets/Logo/kkme-white.png" alt="KKME" height={20} width={95} className="logo-dark" />
          <img src="/design-assets/Logo/kkme-black.png" alt="KKME" height={20} width={95} className="logo-light" />
        </a>

        {/* Desktop links */}
        <div className="nav-desktop" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {visibleLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); scrollTo(l.href); }}
              className="tap-target-mobile"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--type-body-md)',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
                transition: 'color var(--motion-fast)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >{l.label}</a>
          ))}
          <ThemeToggle />
          <a
            href="#conversation"
            onClick={(e) => { e.preventDefault(); scrollTo('#conversation'); }}
            className="tap-target-mobile"
            style={{
              paddingTop: '5px', paddingRight: 'var(--space-sm)', paddingBottom: '5px', paddingLeft: 'var(--space-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--type-body-md)',
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
          className="nav-mobile-toggle tap-target-mobile"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle navigation"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--type-display-md)',
            cursor: 'pointer',
            paddingTop: 'var(--space-2xs)', paddingRight: 'var(--space-xs)', paddingBottom: 'var(--space-2xs)', paddingLeft: 'var(--space-xs)',
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
          background: 'var(--nav-bg)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-xs)', paddingRight: 0, paddingBottom: 'var(--space-xs)', paddingLeft: 0,
        }}>
          {visibleLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); scrollTo(l.href); setMenuOpen(false); }}
              className="tap-target-mobile"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
                paddingTop: '10px', paddingRight: 'var(--space-md)', paddingBottom: '10px', paddingLeft: 'var(--space-md)',
              }}
            >{l.label}</a>
          ))}
          <div style={{ paddingTop: '10px', paddingRight: 'var(--space-md)', paddingBottom: '10px', paddingLeft: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
            <ThemeToggle />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Theme</span>
          </div>
          <a
            href="#conversation"
            onClick={(e) => { e.preventDefault(); scrollTo('#conversation'); setMenuOpen(false); }}
            className="tap-target-mobile"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: 'var(--teal)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              paddingTop: '10px', paddingRight: 'var(--space-md)', paddingBottom: '10px', paddingLeft: 'var(--space-md)',
            }}
          >Get in touch</a>
        </div>
      )}

      <SignalBar />
    </div>
  );
}
