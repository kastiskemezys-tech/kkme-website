'use client';

import { useState, useEffect, useCallback } from 'react';

interface ThemeToggleProps {
  /** 'nav' = inline in StickyNav (current), 'hero' = floating top-right Apple-style */
  variant?: 'nav' | 'hero';
}

export function ThemeToggle({ variant = 'nav' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  const sync = useCallback(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    sync();
    setMounted(true);
    // Listen for changes from other ThemeToggle instances
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [sync]);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  }

  const isHero = variant === 'hero';
  const size = isHero ? 20 : 16;

  // Placeholder before mount
  if (!mounted) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: isHero ? '44px' : '28px',
          height: isHero ? '44px' : '28px',
        }}
      />
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={isHero ? 'theme-toggle-hero' : undefined}
      style={isHero ? {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-primary)',
        opacity: 0.4,
        lineHeight: 1,
        transition: 'opacity 200ms ease, transform 200ms ease',
      } : {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        fontSize: '1rem',
        lineHeight: 1,
        transition: 'color 150ms ease',
      }}
      onMouseEnter={e => {
        if (isHero) {
          e.currentTarget.style.opacity = '0.8';
          e.currentTarget.style.transform = 'scale(1.05)';
        } else {
          e.currentTarget.style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={e => {
        if (isHero) {
          e.currentTarget.style.opacity = '0.4';
          e.currentTarget.style.transform = 'scale(1)';
        } else {
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }
      }}
      onMouseDown={e => {
        if (isHero) e.currentTarget.style.transform = 'scale(0.95)';
      }}
      onMouseUp={e => {
        if (isHero) e.currentTarget.style.transform = 'scale(1.05)';
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        style={{ transition: 'opacity 180ms ease' }}
      >
        {isDark ? (
          // Sun icon — switch to light
          <>
            <circle cx="8" cy="8" r="3" />
            <line x1="8" y1="1" x2="8" y2="3" />
            <line x1="8" y1="13" x2="8" y2="15" />
            <line x1="1" y1="8" x2="3" y2="8" />
            <line x1="13" y1="8" x2="15" y2="8" />
            <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
            <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
            <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
            <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
          </>
        ) : (
          // Moon icon — switch to dark
          <path d="M13.5 8.5a5.5 5.5 0 0 1-6-6 5.5 5.5 0 1 0 6 6z" />
        )}
      </svg>
    </button>
  );
}
