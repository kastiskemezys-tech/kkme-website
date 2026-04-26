import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Phase 8.1 — semantic token layer.
// Guard-rail: renderer code reaching for --success / --mint / --ink / etc.
// must resolve to a real CSS variable. Keep both :root and [data-theme="light"]
// in sync. Future palette retunes (Phase 11) change values, never names.

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf-8');

const required = [
  '--mint',
  '--amber-semantic',
  '--coral',
  '--lavender',
  '--sky',
  '--success',
  '--warning',
  '--danger',
  '--ink',
  '--ink-muted',
  '--ink-subtle',
  '--paper',
  '--paper-elevated',
];

const lightBlock = (() => {
  const start = css.indexOf('[data-theme="light"]');
  if (start === -1) return '';
  // grab the first [data-theme="light"] block (the big one with all the overrides)
  let depth = 0;
  let i = css.indexOf('{', start);
  if (i === -1) return '';
  const open = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return '';
})();

describe('semantic token layer (Phase 8.1)', () => {
  describe(':root defines every alias', () => {
    for (const token of required) {
      it(`defines ${token}`, () => {
        const re = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
        expect(css).toMatch(re);
      });
    }
  });

  describe('[data-theme="light"] mirrors every alias', () => {
    for (const token of required) {
      it(`light theme defines ${token}`, () => {
        const re = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
        expect(lightBlock).toMatch(re);
      });
    }
  });
});
