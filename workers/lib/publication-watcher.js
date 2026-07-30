/**
 * Litgrid publication watcher — Phase 36.D.
 *
 * The demand module is pinned to three documents. When Litgrid republishes any
 * of them the module goes stale silently: nothing breaks, nothing fails a test,
 * and the engine keeps dividing by a superseded series. This watcher is the
 * only thing that would notice.
 *
 * **Alert only. Never auto-ingest.** A TSO forecast entering the revenue model
 * without a human reading the document first is exactly the failure this repo's
 * rule #3 exists to prevent — and the 36.D Pause A audit is a standing
 * demonstration of why: the headline figure in the very document we depend on
 * would, if adopted naively, have inflated the compression index fivefold.
 * The watcher fires; an operator reads; an adoption run updates the module with
 * a new version and a changelog entry.
 *
 * Cadence note: the flexibility-needs assessment is republished BIENNIALLY (the
 * report says so itself), the dimensioning forecasts roughly annually. This
 * watcher will be quiet for long stretches, and that is correct. Its near-term
 * reason to exist is the Lithuanian flexibility-market development plan Litgrid
 * has committed to publish by end-Q4 2026 — the document that would decide
 * whether the short-term and DSO components stop being `excluded`.
 *
 * Everything here is a pure function over HTML strings so it can be tested
 * against committed fixtures rather than against the live site.
 */

/**
 * The pages we watch.
 *
 * These are the DOCUMENT pages, not section indexes. Litgrid publishes each
 * report on its own page carrying the attachment, and a new edition replaces
 * the attachment in place — which `diffPages` sees as a retitle or a swap at
 * the same path. Watching an index would add a layer that can silently stop
 * listing what we depend on.
 *
 * Every URL below was fetched and confirmed to yield a non-empty fingerprint on
 * 2026-07-29. That check is not decoration: two plausible-looking section URLs
 * were tried first and both returned ZERO document links, which the watcher
 * would have reported and then sat on forever. `links_seen` records what each
 * page held at pinning time so a later drop to zero is visibly a regression.
 */
export const WATCH_TARGETS = Object.freeze([
  Object.freeze({
    id: 'fna',
    url: 'https://www.litgrid.eu/index.php/sistema/lankstumo-poreikiu-vertinimo-ataskaita/36615',
    label: 'Flexibility needs assessment',
    why: 'Component structure: treatments, absorption trajectories, the 354 MW fast-response identity.',
    expected_cadence: 'biennial (next ~2028)',
    verified_at: '2026-07-29',
    links_seen: 4,
  }),
  Object.freeze({
    id: 'baltic-frr',
    url: 'https://www.litgrid.eu/index.php/elektros-rinka/balansavimo-rinka/baltijos-lfc-bloko-frr-apimciu-prognoze-2026-2035/32612',
    label: 'Baltic LFC block FRR dimensioning forecast',
    why: 'Two thirds of the demand series — mFRR and aFRR.',
    expected_cadence: 'annual',
    verified_at: '2026-07-29',
    links_seen: 1,
  }),
  Object.freeze({
    id: 'baltic-fcr',
    url: 'https://www.litgrid.eu/index.php/elektros-rinka/balansavimo-rinka/baltijos-lfc-bloko-fcr-apimciu-prognoze-2026-2035/36384',
    label: 'Baltic LFC block FCR dimensioning forecast',
    why: 'The FCR leg of the demand series, and the cross-validation of its LT split.',
    expected_cadence: 'annual',
    verified_at: '2026-07-29',
    links_seen: 1,
  }),
]);

// NOT watched, deliberately: Litgrid's Lithuanian flexibility-market development
// plan (committed for end-Q4 2026) has no page yet, and a watcher pointed at a
// guessed URL is worse than none — it reports "no document links" once and then
// stays quiet forever while looking armed. Tracked in the backlog instead;
// add a target here when the page exists.

/**
 * Extract Litgrid's document links from a page.
 *
 * Litgrid serves attachments from `uploads/files/dirN/dirN/dirN/NN_0.php` with
 * the real filename in Content-Disposition — there is no `.pdf` in the href, so
 * a naive extension match finds nothing. (36.C's audit concluded "no direct PDF
 * link is exposed in the served HTML" for exactly this reason; the links are
 * there, they just do not look like documents.)
 *
 * Returns `[{ href, label }]`, de-duplicated, in document order.
 */
export function extractDocumentLinks(html) {
  if (typeof html !== 'string' || !html) return [];
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]*uploads\/files\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, label: stripTags(m[2]) });
  }
  return out;
}

// Litgrid's titles are full of entities — `&ndash;`, `&scaron;`, `&#8222;` —
// and an undecoded label makes the alert unreadable AND makes the fingerprint
// depend on the CMS's encoding choices rather than on the document.
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
  bdquo: '\u201e', laquo: '\u00ab', raquo: '\u00bb',
  scaron: '\u0161', Scaron: '\u0160', zcaron: '\u017e', Zcaron: '\u017d',
  ccaron: '\u010d', Ccaron: '\u010c', eacute: '\u00e9', nbsp_: ' ',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : whole;
  });
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stable fingerprint of a page's document set.
 *
 * Deliberately NOT a hash of the page: Litgrid's pages carry a full news
 * sidebar that changes weekly, so a whole-page diff would fire constantly and
 * be muted within a month. This fingerprints only href+label pairs, sorted, so
 * it moves when a document is added, removed, retitled or re-uploaded to a new
 * path — and not when a press release scrolls past.
 */
export function fingerprintPage(html) {
  const links = extractDocumentLinks(html);
  // The separators are control characters because neither can occur in a URL or
  // a document title, so no label can forge a boundary between records. They
  // are written as ESCAPES, not as literal bytes: a real NUL inside the first
  // 8 kB makes git classify the source as binary, and a module whose diff
  // nobody can read is a module nobody reviews.
  return links
    .map((l) => `${l.href}\u0000${l.label}`)
    .sort()
    .join('\u0001');
}

/**
 * Diff two page states. Returns `{ changed, added, removed, retitled }`.
 *
 * `retitled` catches the case that matters most and would otherwise read as
 * "no change": Litgrid replacing a document at the SAME path with a new
 * edition, which is how the dimensioning forecasts have historically been
 * updated.
 */
export function diffPages(oldHtml, newHtml) {
  const before = extractDocumentLinks(oldHtml ?? '');
  const after = extractDocumentLinks(newHtml ?? '');
  const beforeByHref = new Map(before.map((l) => [l.href, l.label]));
  const afterByHref = new Map(after.map((l) => [l.href, l.label]));

  const added = after.filter((l) => !beforeByHref.has(l.href));
  const removed = before.filter((l) => !afterByHref.has(l.href));
  const retitled = after
    .filter((l) => beforeByHref.has(l.href) && beforeByHref.get(l.href) !== l.label)
    .map((l) => ({ href: l.href, from: beforeByHref.get(l.href), to: l.label }));

  return {
    changed: added.length > 0 || removed.length > 0 || retitled.length > 0,
    added,
    removed,
    retitled,
  };
}

/**
 * Compose the operator-facing alert. Returns null when nothing changed, so the
 * caller's control flow is `const alert = ...; if (alert) notify(alert)`.
 *
 * The message states the human next step explicitly. An alert that says only
 * "something changed" invites the reflex of re-running an ingest, which is the
 * one thing this watcher must not encourage.
 */
export function buildAlert(target, diff, moduleVersion) {
  if (!diff?.changed) return null;
  const lines = [
    `📄 Litgrid publication change — ${target.label}`,
    target.url,
    '',
  ];
  if (diff.added.length) {
    lines.push('NEW:');
    for (const l of diff.added) lines.push(`  + ${l.label || '(untitled)'}`);
  }
  if (diff.retitled.length) {
    lines.push('REPLACED AT THE SAME PATH:');
    for (const l of diff.retitled) lines.push(`  ~ ${l.from} → ${l.to}`);
  }
  if (diff.removed.length) {
    lines.push('GONE:');
    for (const l of diff.removed) lines.push(`  − ${l.label || '(untitled)'}`);
  }
  lines.push(
    '',
    `Why it matters: ${target.why}`,
    `Demand module in force: v${moduleVersion}.`,
    '',
    'NOT ingested. Review the document, then run an adoption to bump the module',
    'version with a changelog entry. Nothing changes in the engine until you do.',
  );
  return lines.join('\n');
}

/** KV key for a target's last-seen fingerprint. */
export const fingerprintKey = (id) => `litgrid_watch:${id}`;

/**
 * Weekly rate limit. The documents move on a biennial-to-annual cadence, so a
 * daily poll would be 300+ requests a year to learn nothing.
 */
export const WATCH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function isDue(lastCheckedIso, nowMs) {
  if (!lastCheckedIso) return true;
  const t = Date.parse(lastCheckedIso);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= WATCH_INTERVAL_MS;
}
