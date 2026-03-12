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

  // Dynamic favicon — teal dot on dark background
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Background
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, 32, 32);
    // Teal dot
    ctx.fillStyle = 'rgba(45, 212, 168, 0.92)';
    ctx.beginPath();
    ctx.arc(16, 16, 9, 0, Math.PI * 2);
    ctx.fill();
    // Subtle inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(13, 13, 4, 0, Math.PI * 2);
    ctx.fill();

    const existing = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    const link = existing || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = canvas.toDataURL();
    if (!existing) document.head.appendChild(link);
  }, []);

  return (
    <div
      className="scroll-progress"
      style={{ width: `${scrollPct}%` }}
      aria-hidden="true"
    />
  );
}
