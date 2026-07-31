// Match engine: private workbook rows ↔ the public fleet DB (s4_fleet raw_entries).
//
// Reuses the worker's normName so both sides normalise identically (rule #4).
// Reports matched / probable / new-to-us, and never mutates either side — the
// public DB is not written by 37.A at all.

import { normName, bareName, isLegalEntity } from './normalise.mjs';

export const MATCH = Object.freeze({
  MATCHED: 'matched',     // confident same project
  PROBABLE: 'probable',   // likely same, needs a human look
  NEW: 'new-to-us',       // no plausible counterpart in the public DB
});

/** Tokens that carry no discriminating power in these names. */
const STOPWORDS = new Set(['bess', 'solar', 'sun', 'wind', 'pv', 'energy', 'energija', 'energija.', 'projektai', 'hybrid', 'park', 'uab', 'sia', 'as', 'ou', 'ab', 'mb']);

/**
 * Discriminating tokens. The 2-char floor matters: suffixes like `PV` and `BS` are
 * exactly what separates two projects of one developer in one town, and filtering
 * them collapsed both names to the bare placename.
 */
function tokens(s) {
  return normName(bareName(s))
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Jaccard over discriminating tokens. */
function tokenOverlap(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** The tokens two names actually share. */
function sharedTokens(a, b) {
  const B = new Set(tokens(b));
  return tokens(a).filter((t) => B.has(t));
}

/**
 * Placename-only agreement is not identity.
 *
 * "Anykščiai PV" vs "Anykščiai BS" share exactly one token — the municipality —
 * because the discriminating suffixes are too short to survive tokenisation. Two
 * genuinely different projects by one developer in one town would match every time.
 * When the ONLY shared token is also the row's location, the name has contributed
 * no evidence of identity and the pair is capped below the matched threshold.
 */
function isPlacenameOnlyAgreement(privateRow, publicEntry) {
  const shared = sharedTokens(privateRow.spv, publicEntry.name);
  if (shared.length !== 1) return false;
  const locTokens = new Set(tokens(privateRow.location || ''));
  return locTokens.has(shared[0]);
}

/**
 * Score one private row against one public entry. Returns 0..1.
 * Name similarity dominates; location agreement and MW agreement are corroborating,
 * never sufficient on their own — two unrelated 50 MW projects in Vilnius must not
 * match.
 */
export function scorePair(privateRow, publicEntry) {
  if (!privateRow || !publicEntry) return 0;
  // country is a hard gate — a cross-border coincidence is not a match
  if (privateRow.country && publicEntry.country && privateRow.country !== publicEntry.country) return 0;

  const nameScore = Math.max(
    tokenOverlap(privateRow.spv, publicEntry.name),
    tokenOverlap(privateRow.org, publicEntry.name),
  );

  const exactName = normName(bareName(privateRow.spv)) === normName(bareName(publicEntry.name));
  if (exactName) return 1;

  // location corroboration
  const locScore = privateRow.location ? tokenOverlap(privateRow.location, publicEntry.name) : 0;

  // MW corroboration — only counts when both sides have a number
  const pMw = privateRow.bess_mw ?? privateRow.site_total_mw ?? null;
  const eMw = typeof publicEntry.mw === 'number' ? publicEntry.mw : null;
  let mwScore = 0;
  if (pMw !== null && eMw !== null && pMw > 0 && eMw > 0) {
    const ratio = Math.min(pMw, eMw) / Math.max(pMw, eMw);
    mwScore = ratio > 0.95 ? 1 : ratio > 0.8 ? 0.5 : 0;
  }

  const raw = Math.min(1, nameScore * 0.7 + locScore * 0.2 + mwScore * 0.1);

  // cap placename-only agreement below the matched threshold — it stays a candidate
  // worth a human look, it just stops being asserted as the same project
  if (isPlacenameOnlyAgreement(privateRow, publicEntry)) return Math.min(raw, 0.5);

  return raw;
}

/**
 * Match one private row against the whole public fleet.
 * @returns {{status:string, best:object|null, score:number, candidates:Array}}
 */
export function matchRow(privateRow, publicEntries) {
  const scored = (publicEntries || [])
    .map((e) => ({ entry: e, score: scorePair(privateRow, e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;
  let status = MATCH.NEW;
  if (best) {
    if (best.score >= 0.75) status = MATCH.MATCHED;
    else if (best.score >= 0.4) status = MATCH.PROBABLE;
  }

  return {
    status,
    best: best && status !== MATCH.NEW ? best.entry : null,
    score: best ? Math.round(best.score * 1000) / 1000 : 0,
    candidates: scored.slice(0, 3).map((x) => ({ id: x.entry.id, name: x.entry.name, mw: x.entry.mw, score: Math.round(x.score * 1000) / 1000 })),
  };
}

/** Match a whole batch and summarise per country. */
export function matchAll(privateRows, publicEntries) {
  const results = privateRows.map((r) => ({ row: r, match: matchRow(r, publicEntries) }));
  const summary = {};
  for (const { row, match } of results) {
    const c = row.country || '??';
    summary[c] = summary[c] || { total: 0, matched: 0, probable: 0, 'new-to-us': 0, legal_entities: 0, descriptors: 0 };
    summary[c].total++;
    summary[c][match.status]++;
    if (isLegalEntity(row.spv)) summary[c].legal_entities++; else summary[c].descriptors++;
  }
  return { results, summary };
}
