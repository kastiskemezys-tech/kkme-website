import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 12.8.0 — ticker pause-on-hover + edge fade + reduced-motion robustness.
// We don't render the full HeroBalticMap (it pulls a worker fetch + d3 + a
// chart.js-coupled tooltip portal); instead we assert against the source
// strings to keep these guards lightweight and stable. Anti-regression:
//   1. Pause-on-hover requires both the .hero-ticker container class and the
//      .hero-ticker-strip animated child class.
//   2. The reduced-motion selector must be class-based (was previously a
//      brittle attribute-substring selector on the inline style that
//      depended on serialization order).
//   3. Edge-fade mask is the `mask-image: linear-gradient(...)` rule on
//      .hero-ticker.

const SRC = readFileSync(
  resolve(__dirname, '../HeroBalticMap.tsx'),
  'utf-8',
);

// Use [\s\S] in lieu of the `s` (dotAll) regex flag so the suite stays
// compatible with the project's pre-ES2018 tsc target.

describe('HeroBalticMap ticker hardening', () => {
  it('exposes a stable .hero-ticker container class', () => {
    expect(SRC).toContain('className="hero-ticker"');
  });

  it('exposes a stable .hero-ticker-strip animated class', () => {
    expect(SRC).toContain('className="hero-ticker-strip"');
  });

  it('pauses the animation on :hover and :focus-within of the container', () => {
    expect(SRC).toMatch(
      /\.hero-ticker:hover\s+\.hero-ticker-strip\s*,\s*\.hero-ticker:focus-within\s+\.hero-ticker-strip\s*\{[^}]*animation-play-state:\s*paused/,
    );
  });

  it('applies an edge-fade mask gradient on the container', () => {
    expect(SRC).toMatch(/\.hero-ticker\s*\{[^}]*mask-image:\s*linear-gradient/);
    expect(SRC).toMatch(/-webkit-mask-image:\s*linear-gradient/);
  });

  it('uses a class-based selector inside prefers-reduced-motion (not the prior brittle attribute selector on inline style)', () => {
    expect(SRC).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.hero-ticker-strip\s*\{[^}]*animation:\s*none/,
    );
    // Anti-regression: ensure the brittle attribute selector is gone.
    expect(SRC).not.toMatch(/\[style\*="tickerScroll"\]/);
  });
});
