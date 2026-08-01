// The privacy boundary for Phase 37. Everything in the fleet-intel pipeline passes
// through here before it can be serialised anywhere a non-operator could see it.
//
// Design: PUBLIC IS AN ALLOWLIST, NOT A DENYLIST. A field nobody has explicitly
// declared public is private. That is the fail-closed direction: adding a new field
// to the parser can only ever leak it if someone deliberately adds it to the
// allowlist below, and the leak tests assert the allowlist's exact contents.
//
// Arc rule this implements (phase-37-arc.md §Privacy architecture):
//   "Publicly-verifiable facts (project name, SPV, MW, location, status) MAY enter
//    the public fleet DB — only WITH public-source citations attached (rule #3).
//    A row that only exists in the private table stays private-only until a public
//    source corroborates it."

/**
 * Fields that MAY be published — and only when the row also carries public-source
 * citations (see toPublicRow, which enforces that jointly).
 */
export const PUBLIC_FIELDS = Object.freeze([
  'id',
  'country',
  'spv',
  'org',
  'plant_type',
  'site_total_mw',
  'bess_mw',
  'bess_mwh',
  'location',
  'verification_status',
  'citations',
]);

/**
 * Fields that are private under all circumstances, whatever the verification tier.
 * Listed explicitly so the leak tests can assert on them by name rather than by
 * "everything not public" — a claim that is easy to satisfy vacuously.
 *
 * apva_flag is here per the Pause-A finding: it is operator testimony with no
 * public corroboration (esinvesticijos.lt showed zero discriminating power across
 * a balanced Gavo/Negavo sample), so it stays private and unscored until the
 * operator identifies the scheme.
 */
export const ALWAYS_PRIVATE_FIELDS = Object.freeze([
  'contact',
  'comment',
  'apva_flag',
  'raw_power_text',
  'source_row',
]);

export const TIERS = Object.freeze({
  PUBLIC_CONFIRMED: 'public-confirmed',
  CORROBORATED: 'corroborated',
  PRIVATE_ONLY: 'private-only',
});

/** Source types that count as primary/registry evidence for the top tier. */
const PRIMARY_SOURCE_TYPES = new Set(['registry', 'regulator', 'tso', 'permit']);
/** Source types that can only ever reach 'corroborated'. */
const SECONDARY_SOURCE_TYPES = new Set(['press', 'developer_site']);

/**
 * Compute the verification tier FROM the evidence array. Never assign a tier
 * directly — that is how a row with no citation ends up published.
 *
 * @param {Array<{source_type:string,url:string,confidence?:string}>} evidence
 * @returns {'public-confirmed'|'corroborated'|'private-only'}
 */
export function computeTier(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return TIERS.PRIVATE_ONLY;
  // rule #3: evidence without a resolvable URL is not a citation, it is a claim.
  const cited = evidence.filter((e) => e && typeof e.url === 'string' && /^https?:\/\//.test(e.url));
  if (cited.length === 0) return TIERS.PRIVATE_ONLY;
  if (cited.some((e) => PRIMARY_SOURCE_TYPES.has(e.source_type))) return TIERS.PUBLIC_CONFIRMED;
  if (cited.some((e) => SECONDARY_SOURCE_TYPES.has(e.source_type))) return TIERS.CORROBORATED;
  return TIERS.PRIVATE_ONLY;
}

/** True only for tiers whose facts may leave the private overlay. */
export function isPublishable(tier) {
  return tier === TIERS.PUBLIC_CONFIRMED || tier === TIERS.CORROBORATED;
}

/**
 * Project a full internal row down to its publishable projection.
 * Returns null when the row must not be published at all — which is the case for
 * every private-only row, and for any row whose citations are empty.
 *
 * This is the ONLY function permitted to construct an object destined for a
 * public payload. Anything else that builds a public object is a bug.
 */
export function toPublicRow(row) {
  if (!row || typeof row !== 'object') return null;
  const tier = row.verification_status;
  if (!isPublishable(tier)) return null;
  const citations = Array.isArray(row.citations) ? row.citations : [];
  if (citations.length === 0) return null; // no citation ⇒ nothing to publish (rule #3)

  const out = {};
  for (const f of PUBLIC_FIELDS) {
    if (row[f] !== undefined) out[f] = row[f];
  }
  // Belt and braces: even if a private field somehow shares a name with a public
  // one in a future refactor, strip it explicitly.
  for (const f of ALWAYS_PRIVATE_FIELDS) delete out[f];
  return out;
}

/**
 * Assert that an arbitrary payload carries no private field, at any depth.
 * Used by the leak tests and by the intake run before anything is written to a
 * public destination. Returns the list of offending paths (empty ⇒ clean).
 */
export function findPrivateLeaks(payload) {
  const bad = [];
  const privateSet = new Set(ALWAYS_PRIVATE_FIELDS);
  const walk = (node, path) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (privateSet.has(k)) bad.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  };
  walk(payload, '$');
  return bad;
}

/**
 * Detect contact-shaped content (emails, phone numbers) anywhere in a payload,
 * regardless of field name. Field-name checks miss a leak that renames the field;
 * this catches the content itself. Returns offending paths.
 */
export function findContactShapedContent(payload) {
  const bad = [];
  const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const PHONE = /(?:\+370|\+371|\+372)\s?\d[\d\s-]{6,}/;
  const walk = (node, path) => {
    if (typeof node === 'string') {
      if (EMAIL.test(node)) bad.push(`${path} (email-shaped)`);
      else if (PHONE.test(node)) bad.push(`${path} (phone-shaped)`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(payload, '$');
  return bad;
}
