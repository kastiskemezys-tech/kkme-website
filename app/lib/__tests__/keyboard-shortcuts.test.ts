import { describe, it, expect } from 'vitest';
import { KEYBOARD_SHORTCUTS, shortcutByKey } from '@/app/lib/keyboard-shortcuts';

// Phase 12.8.0 — keyboard shortcut single-source-of-truth tests.
// These guard against the regression mode where the footer hint, the
// keydown handler, and the visible nav drift to inconsistent letter →
// section mappings (which is exactly how the prior `s → signals` and
// `m → context` ids ended up dead — the section ids didn't exist).

describe('KEYBOARD_SHORTCUTS table', () => {
  it('has unique keys', () => {
    const keys = KEYBOARD_SHORTCUTS.map(s => s.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('uses lowercase single-character keys (or the literal `?`)', () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      if (s.key === '?') continue;
      expect(s.key).toMatch(/^[a-z]$/);
    }
  });

  it('every non-help shortcut targets a non-empty sectionId', () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      if (s.key === '?') {
        expect(s.sectionId).toBe('');
      } else {
        expect(s.sectionId).not.toBe('');
        expect(s.sectionId).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('every shortcut has a navLabel and description', () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      expect(s.navLabel.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});

describe('home page section ids that the shortcuts reference', () => {
  // Anti-regression: these are the literal section ids in app/page.tsx.
  // If a refactor renames a section, this test will catch the keyboard
  // shortcut mapping drifting before the production handler does.
  const HOMEPAGE_SECTION_IDS = new Set([
    'revenue-drivers',
    'build',
    'structural',
    'revenue',
    'trading',
    'intel',
    'conversation',
  ]);

  it('every keyboard shortcut targets a known homepage section id', () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      if (s.key === '?') continue;
      expect(HOMEPAGE_SECTION_IDS.has(s.sectionId)).toBe(true);
    }
  });
});

describe('shortcutByKey', () => {
  it('finds a match case-insensitively', () => {
    expect(shortcutByKey('R')?.navLabel).toBe('Returns');
    expect(shortcutByKey('r')?.navLabel).toBe('Returns');
  });

  it('returns undefined for unknown keys', () => {
    expect(shortcutByKey('z')).toBeUndefined();
    expect(shortcutByKey('1')).toBeUndefined();
  });

  it('finds the help shortcut by literal `?`', () => {
    expect(shortcutByKey('?')?.navLabel).toBe('Help');
  });
});
