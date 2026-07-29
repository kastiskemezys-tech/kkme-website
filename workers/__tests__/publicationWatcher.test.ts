// Phase 36.D — the Litgrid publication tripwire.
//
// Fixtures are cut from the real served page, not hand-written, so the
// extraction is tested against Litgrid's actual markup — including the
// `uploads/files/dirN/.../NN_0.php` attachment scheme that carries no file
// extension and defeated a naive selector during the 36.C audit.
//
// The "after" fixture models the republication that actually matters: a new
// edition uploaded to a NEW path while an annex is replaced at the SAME path.
// A watcher that only compares URL sets would miss the second half.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WATCH_TARGETS,
  extractDocumentLinks,
  fingerprintPage,
  diffPages,
  buildAlert,
  fingerprintKey,
  isDue,
  WATCH_INTERVAL_MS,
} from '../lib/publication-watcher.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(HERE, 'fixtures', n), 'utf8');
const BEFORE = fx('litgrid-fna-before.html');
const AFTER = fx('litgrid-fna-after.html');

describe('extraction against Litgrid\'s real markup', () => {
  it('finds the extensionless attachment links a naive selector misses', () => {
    const links = extractDocumentLinks(BEFORE);
    expect(links).toHaveLength(4);
    expect(links[0].href).toMatch(/uploads\/files\/dir\d+\/dir\d+\/dir\d+\/\d+_0\.php$/);
    // Nothing in these hrefs says "pdf" — that is the whole point.
    expect(links.every((l) => !/\.pdf/i.test(l.href))).toBe(true);
  });

  it('decodes entities so labels are readable and fingerprints are encoding-independent', () => {
    const links = extractDocumentLinks(BEFORE);
    expect(links[0].label).toContain('lankstumo poreikių ataskaita 2028–2035 m.');
    expect(links.some((l) => /&\w+;/.test(l.label))).toBe(false);
  });

  it('returns nothing rather than throwing on junk input', () => {
    expect(extractDocumentLinks('')).toEqual([]);
    expect(extractDocumentLinks(null as never)).toEqual([]);
    expect(extractDocumentLinks('<html><body>no links</body></html>')).toEqual([]);
  });
});

describe('fingerprinting', () => {
  it('is stable across repeated reads of the same page', () => {
    expect(fingerprintPage(BEFORE)).toBe(fingerprintPage(BEFORE));
  });

  it('moves when the document set moves', () => {
    expect(fingerprintPage(AFTER)).not.toBe(fingerprintPage(BEFORE));
  });

  it('ignores everything that is not a document link', () => {
    // Litgrid's pages carry a news sidebar that changes weekly. Fingerprinting
    // the page would fire every week and be muted within a month.
    const noisy = BEFORE.replace('</div>', '<a href="/naujienos/kazkas/99">Naujiena</a><p>2026-08-04</p></div>');
    expect(fingerprintPage(noisy)).toBe(fingerprintPage(BEFORE));
  });
});

describe('diffing a republication', () => {
  const diff = diffPages(BEFORE, AFTER);

  it('detects a new edition uploaded to a new path', () => {
    expect(diff.changed).toBe(true);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].label).toContain('2030–2037');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].label).toContain('2028–2035');
  });

  it('detects a document REPLACED at the same path — the case a URL-set diff misses', () => {
    expect(diff.retitled).toHaveLength(1);
    expect(diff.retitled[0].from).toBe('Priedas nr. 1');
    expect(diff.retitled[0].to).toBe('Priedas nr. 1 (atnaujintas)');
    // Same href on both sides: a set comparison would call this "no change".
    expect(diff.added.map((l: { href: string }) => l.href)).not.toContain(diff.retitled[0].href);
    expect(diff.removed.map((l: { href: string }) => l.href)).not.toContain(diff.retitled[0].href);
  });

  it('is silent when nothing changed', () => {
    const same = diffPages(BEFORE, BEFORE);
    expect(same.changed).toBe(false);
    expect(buildAlert(WATCH_TARGETS[0], same, '1.0.0')).toBeNull();
  });
});

describe('the alert', () => {
  const alert = buildAlert(WATCH_TARGETS[0], diffPages(BEFORE, AFTER), '1.0.0')!;

  it('names the document, the page and the module version in force', () => {
    expect(alert).toContain('Flexibility needs assessment');
    expect(alert).toContain(WATCH_TARGETS[0].url);
    expect(alert).toContain('v1.0.0');
    expect(alert).toContain('2030–2037');
  });

  it('says explicitly that nothing was ingested, and what the human does next', () => {
    // An alert that only says "something changed" invites a reflexive re-ingest.
    // That reflex is the failure mode this whole watcher is shaped to avoid.
    expect(alert).toContain('NOT ingested');
    expect(alert).toMatch(/adoption/i);
    expect(alert).toContain('Nothing changes in the engine until you do.');
  });
});

describe('scheduling', () => {
  it('is due on first sight and then weekly', () => {
    const now = Date.parse('2026-08-01T00:00:00Z');
    expect(isDue(null, now)).toBe(true);
    expect(isDue(undefined, now)).toBe(true);
    expect(isDue('not a date', now)).toBe(true);
    expect(isDue(new Date(now - WATCH_INTERVAL_MS + 1000).toISOString(), now)).toBe(false);
    expect(isDue(new Date(now - WATCH_INTERVAL_MS).toISOString(), now)).toBe(true);
  });

  it('watches every source the demand module is pinned to, plus the one coming', () => {
    const ids = WATCH_TARGETS.map((t) => t.id);
    expect(ids).toContain('fna');            // component structure
    expect(ids).toContain('balancing-market'); // the demand series itself
    expect(ids).toContain('studies');        // flexibility-market plan, due Q4 2026
    for (const t of WATCH_TARGETS) {
      expect(t.url, t.id).toMatch(/^https:\/\/www\.litgrid\.eu\//);
      expect(t.why, t.id).toBeTruthy();
    }
  });

  it('namespaces KV keys per target', () => {
    expect(fingerprintKey('fna')).toBe('litgrid_watch:fna');
    expect(new Set(WATCH_TARGETS.map((t) => fingerprintKey(t.id))).size).toBe(WATCH_TARGETS.length);
  });
});
