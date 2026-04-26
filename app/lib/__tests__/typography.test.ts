import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Phase 8.2 — three-voice typography ramp.
// Renamed to --font-editorial / --font-numeric / --font-body so the existing
// --font-display / --font-mono / --font-serif keep pointing at the legacy
// fonts (Cormorant / DM Mono / Unbounded) until Phase 10 migrates cards.

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf-8');
const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf-8');

describe('three-voice typography (Phase 8.2)', () => {
  it('layout imports Fraunces, JetBrains_Mono, Inter from next/font/google', () => {
    expect(layout).toMatch(/from\s+["']next\/font\/google["']/);
    expect(layout).toMatch(/Fraunces/);
    expect(layout).toMatch(/JetBrains_Mono/);
    expect(layout).toMatch(/\bInter\b/);
  });

  it('layout exposes --font-fraunces, --font-jetbrains-mono, --font-inter CSS variables', () => {
    expect(layout).toMatch(/variable:\s*["']--font-fraunces["']/);
    expect(layout).toMatch(/variable:\s*["']--font-jetbrains-mono["']/);
    expect(layout).toMatch(/variable:\s*["']--font-inter["']/);
  });

  it('layout className wires all six font variables onto <html>', () => {
    for (const v of ['cormorant', 'dmMono', 'unbounded', 'fraunces', 'jetbrainsMono', 'inter']) {
      expect(layout).toMatch(new RegExp(`\\$\\{${v}\\.variable\\}`));
    }
  });

  it('globals.css defines the three-voice family tokens', () => {
    expect(css).toMatch(/--font-editorial:\s*var\(--font-fraunces\)/);
    expect(css).toMatch(/--font-numeric:\s*var\(--font-jetbrains-mono\)/);
    expect(css).toMatch(/--font-body:\s*var\(--font-inter\)/);
  });

  it('globals.css preserves the legacy font tokens (Phase 10 migrates cards)', () => {
    expect(css).toMatch(/--font-serif:\s*var\(--font-cormorant\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-dm-mono\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-unbounded\)/);
  });

  it('globals.css defines the full type ramp', () => {
    for (const t of [
      '--type-hero',
      '--type-number-xl',
      '--type-number-l',
      '--type-section',
      '--type-eyebrow',
      '--type-body',
      '--type-caption',
    ]) {
      expect(css).toMatch(new RegExp(t.replace(/-/g, '\\-')));
    }
  });

  it('hero / number-xl tokens land at the P2-locked 56–64px middle ground', () => {
    expect(css).toMatch(/--type-hero:\s*clamp\([^)]*64px\)/);
    expect(css).toMatch(/--type-number-xl:\s*clamp\([^)]*56px\)/);
  });

  it('tabular numerals applied globally', () => {
    expect(css).toMatch(/font-feature-settings\s*:\s*["']tnum["']/);
  });
});
