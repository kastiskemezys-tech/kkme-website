'use client';

import { useEffect, useState } from 'react';

const SECTION_KEYS: Record<string, string> = {
  r: 'revenue',
  s: 'signals',
  b: 'build',
  m: 'context',
  i: 'intel',
  c: 'conversation',
};

export function PageInteractions() {
  const [scrollPct, setScrollPct] = useState(0);

  // Scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      setScrollPct(Math.min(pct, 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const section = SECTION_KEYS[e.key.toLowerCase()];
      if (section) {
        e.preventDefault();
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Favicon is now static SVG at /favicon.svg (set in layout.tsx metadata)

  return (
    <div
      className="scroll-progress"
      style={{ width: `${scrollPct}%` }}
      aria-hidden="true"
    />
  );
}
