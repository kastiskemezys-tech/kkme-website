// Single source of truth for the home-page keyboard nav shortcuts.
// Footer hint, the keydown handler, and the ?-help overlay all read from
// this list, so the three never drift apart again.
//
// Phase A (later) will replace letter-mapping with chapter numbers 1–5
// when the five-chapter restructure ships. Don't over-invest here.

export interface ShortcutMapping {
  /** Single character (lowercased). `?` is the help-overlay shortcut. */
  key: string;
  /** Label shown in the footer hint and ?-overlay. */
  navLabel: string;
  /** DOM id of the section to scroll into view. Empty for `?` (help). */
  sectionId: string;
  /** Description for the help overlay. */
  description: string;
}

export const KEYBOARD_SHORTCUTS: ShortcutMapping[] = [
  { key: 's', navLabel: 'Signals',   sectionId: 'revenue-drivers', description: 'Jump to Revenue signals (S1, S2)' },
  { key: 'b', navLabel: 'Build',     sectionId: 'build',           description: 'Jump to Buildability (S3, S4)' },
  { key: 't', navLabel: 'Structure', sectionId: 'structural',      description: 'Jump to Structural drivers' },
  { key: 'r', navLabel: 'Returns',   sectionId: 'revenue',         description: 'Jump to 50 MW reference asset' },
  { key: 'd', navLabel: 'Trading',   sectionId: 'trading',         description: 'Jump to Dispatch intelligence' },
  { key: 'i', navLabel: 'Intel',     sectionId: 'intel',           description: 'Jump to Market intelligence' },
  { key: 'c', navLabel: 'Contact',   sectionId: 'conversation',    description: 'Jump to Get in touch' },
  { key: '?', navLabel: 'Help',      sectionId: '',                description: 'Show keyboard shortcuts' },
];

/** Lookup a shortcut by its key (lowercased). */
export function shortcutByKey(key: string): ShortcutMapping | undefined {
  return KEYBOARD_SHORTCUTS.find(s => s.key === key.toLowerCase());
}
