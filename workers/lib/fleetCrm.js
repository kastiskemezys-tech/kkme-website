// Phase 37.C — the operator-only fleet CRM.
//
// This module is the boundary between the private overlay and anything that can
// leave the worker. Two rules govern everything below.
//
//   1. THERE IS NO PUBLIC TIER. The calculator degrades an invalid token to a
//      sample view; this must not. An unauthenticated caller gets an error object
//      and nothing else — no counts, no "N projects", no shape of the data.
//
//   2. FAIL CLOSED. An unset secret is not "auth disabled", it is 503 with no
//      data. A row with no evidence is private-only. A hybrid with no public
//      decomposition is a band, never a point.
//
// Arc reference: phase-37-arc.md §37.C and §Privacy architecture.

import { timingSafeEqual } from './calculator.js';
// The band travels with the WORKER, not with the browser bundle.
//
// It was briefly imported by the client component instead, and the build-artifact
// leak sweep caught it: that put 34 public fleet entry names and KKME's hybrid
// analysis into a JS chunk fetchable without any token, which is a public tier at
// /fleet by another name. Server-side, it reaches the operator only through the
// authenticated payload. Single artifact either way (rule #4) — only the transport
// changed.
import HYBRID_BAND from '../../tools/fleet-intel/data/hybrid-band.json' with { type: 'json' };

export { HYBRID_BAND };

const enc = new TextEncoder();

/**
 * CORS for the CRM routes only.
 *
 * The worker's shared CORS constant does not allow `Authorization`, so a browser
 * refuses to send a bearer token cross-origin to it. Rather than widen the shared
 * constant (which would change behaviour for every existing route), the CRM
 * carries its own. Verified at Pause A against the live preflight.
 *
 * `Access-Control-Allow-Origin` is the site origin rather than `*`: a wildcard is
 * fine for public market data and wrong for an operator console.
 */
export const FLEET_CORS = Object.freeze({
  'Access-Control-Allow-Origin': 'https://kkme.eu',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
});

/** Responses here must never be stored by a cache, shared or private. */
export const FLEET_NO_STORE = Object.freeze({
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
});

export const FLEET_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, not the calculator's 30

export const FLEET_COPY = Object.freeze({
  auth_unconfigured:
    'Fleet console auth is not configured. Set FLEET_SECRET before this route can serve anything.',
  auth_failed: 'Incorrect password.',
  auth_required: 'Authentication required.',
  apva_note:
    'Private testimony — not citable. Recorded from the operator workbook, corroborated by no public ' +
    'source. Never contributes to a verification tier or to any published number.',
  hybrid_note:
    'Hybrid site: the public record states a connection capacity, not a battery rating. The BESS ' +
    'figure is a band between zero and the site total, not a point estimate.',
  private_only_note:
    'No public source corroborates this row. Excluded from every published and client-facing number.',
});

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Token = `<expiry-ms>.<HMAC-SHA256("fleet:<expiry-ms>", FLEET_SECRET)>`.
 *
 * The `fleet:` prefix is load-bearing, not decoration: the calculator signs
 * `calc:<expiry>`. Distinct prefixes mean a calculator token can never verify
 * here and a fleet token can never verify there, even if both secrets were set
 * to the same string by accident.
 */
export async function signFleetToken(secret, expiresAt) {
  return `${expiresAt}.${await hmacHex(secret, `fleet:${expiresAt}`)}`;
}

export async function verifyFleetToken(secret, token, now = Date.now()) {
  if (!secret) return { ok: false, reason: 'unconfigured' };
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const idx = token.indexOf('.');
  const expiresAt = Number(token.slice(0, idx));
  const sig = token.slice(idx + 1);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: 'malformed' };
  // Signature before expiry, so forged and merely-stale tokens are not
  // distinguishable by which check rejected them.
  const expected = await hmacHex(secret, `fleet:${expiresAt}`);
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' };
  if (expiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true, expiresAt };
}

export function fleetBearerToken(request) {
  const h = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

// ── Hybrid handling ────────────────────────────────────────────────────────

/**
 * A row is hybrid when its plant type names a generation technology alongside
 * storage. `plant_type` is operator testimony, so this classifies the ROW, it
 * does not assert anything publishable about the site.
 */
export function isHybridRow(row) {
  const t = String(row?.plant_type ?? '').toLowerCase();
  if (!t) return false;
  const hasGen = /\b(sun|solar|wind|pv|saul|vėj|vej)/.test(t);
  const hasStorage = /\b(bess|storage|kaup)/.test(t);
  return hasGen && hasStorage;
}

/**
 * The per-row BESS figure, as a band whenever a point would be a fabrication.
 *
 * Three cases, and only the first is a number:
 *   - an explicit `bess_mw`               → point, flagged as private testimony
 *   - hybrid with a known site total      → band [0, site_total], never a midpoint
 *   - pure BESS with only a site total    → point at site total, private testimony
 *
 * Nothing here is publishable in any case; the CRM is operator-eyes. The band
 * exists so the operator's own console cannot quietly turn a connection capacity
 * into a battery rating — the same failure the published band guards against.
 */
export function bessFigureForRow(row) {
  const site = Number.isFinite(row?.site_total_mw) ? row.site_total_mw : null;
  const bess = Number.isFinite(row?.bess_mw) ? row.bess_mw : null;

  if (bess !== null && bess > 0) {
    return { kind: 'point', mw: bess, basis: 'stated in the private workbook', citable: false };
  }
  if (isHybridRow(row) && site !== null) {
    return {
      kind: 'band',
      lower_mw: 0,
      upper_mw: site,
      basis: 'hybrid site — connection capacity known, battery rating not stated',
      note: FLEET_COPY.hybrid_note,
      citable: false,
    };
  }
  if (site !== null) {
    return { kind: 'point', mw: site, basis: 'site total, no separate battery rating', citable: false };
  }
  return { kind: 'unknown', basis: 'no power figure in the source row', citable: false };
}

// ── The CRM view ───────────────────────────────────────────────────────────

/**
 * Whether a row's facts may contribute to a published number.
 *
 * Deliberately stricter than `verification_status` alone. A registry citation
 * proves a legal entity exists; it does not prove a battery exists or how large
 * it is. Pause A found all 36 public-confirmed rows carry exactly one registry
 * citation of that shape and `bess_mw = 0`, so "public-confirmed" on its own
 * would have licensed publishing 3 583.5 MW of private testimony.
 *
 * Returns the reason as well as the verdict, because the CRM shows the reason.
 */
export function publishability(row) {
  const tier = row?.verification_status;
  if (tier !== 'public-confirmed' && tier !== 'corroborated') {
    return { publishable: false, reason: 'no public source corroborates this row', capacity_citable: false };
  }
  const citations = Array.isArray(row?.citations) ? row.citations : [];
  const resolvable = citations.filter((c) => c && /^https?:\/\//.test(String(c.url ?? '')));
  if (resolvable.length === 0) {
    return { publishable: false, reason: 'no citation with a resolvable URL', capacity_citable: false };
  }
  // Does any citation actually speak to CAPACITY, as opposed to the existence of
  // the company? Entity-existence wording is the whole of the current evidence
  // set, so this is the check that keeps 0 MW at 0 MW.
  const capacityCitable = resolvable.some((c) => {
    const what = String(c.what_it_confirms ?? '').toLowerCase();
    return /\b(mw|mwh|capacity|jauda|galia|megavat)/.test(what);
  });
  return {
    publishable: true,
    reason: capacityCitable
      ? 'citation speaks to capacity'
      : 'citation confirms the legal entity only — the capacity is not citable',
    capacity_citable: capacityCitable,
  };
}

/**
 * Build the operator console payload.
 *
 * This is the ONLY function that assembles private fields for transport, and it
 * is reachable from exactly one route, behind a verified token. `apva_flag` is
 * carried through as testimony with its note attached and is never read by
 * `publishability` — asserted by test.
 */
export function buildCrmView({ privateIndex, comments = {}, lifecycle = [], band = HYBRID_BAND }) {
  const rows = Array.isArray(privateIndex?.rows) ? privateIndex.rows : [];
  const byId = new Map();
  for (const t of lifecycle) {
    if (!t || !t.id) continue;
    if (!byId.has(t.id)) byId.set(t.id, []);
    byId.get(t.id).push(t);
  }

  const projects = rows.map((row) => {
    const pub = publishability(row);
    const override = comments[row.id];
    return {
      ...row,
      bess_figure: bessFigureForRow(row),
      is_hybrid: isHybridRow(row),
      publishable: pub.publishable,
      publishability_reason: pub.reason,
      capacity_citable: pub.capacity_citable,
      // apva_flag travels with its own disclaimer so no view can render it bare.
      apva: row.apva_flag ? { value: row.apva_flag, note: FLEET_COPY.apva_note, citable: false } : null,
      // operator edits win over the intake's copy, and the intake's copy is kept
      // so an edit is visibly an edit rather than a silent overwrite.
      comment: override ? override.text : row.comment,
      comment_edited: Boolean(override),
      comment_original: override ? (row.comment ?? '') : null,
      comment_updated_at: override ? override.updated_at : null,
      status_history: byId.get(row.id) ?? [],
    };
  });

  const tally = (pred) => projects.filter(pred).length;
  return {
    generated: privateIndex?.generated ?? null,
    stored_at: privateIndex?.stored_at ?? null,
    count: projects.length,
    projects,
    summary: {
      by_country: projects.reduce((a, p) => ((a[p.country] = (a[p.country] || 0) + 1), a), {}),
      by_tier: projects.reduce(
        (a, p) => ((a[p.verification_status] = (a[p.verification_status] || 0) + 1), a), {},
      ),
      hybrid_rows: tally((p) => p.is_hybrid),
      publishable_rows: tally((p) => p.publishable),
      capacity_citable_rows: tally((p) => p.capacity_citable),
      // The headline the operator needs on first glance: how much of this can
      // legitimately reach a client number. Currently zero, and the console
      // says so rather than implying otherwise by omission.
      citable_bess_mw: projects
        .filter((p) => p.capacity_citable)
        .reduce((s, p) => s + (Number.isFinite(p.bess_mw) ? p.bess_mw : 0), 0),
    },
    hybrid_band: band,
    notes: {
      private_only: FLEET_COPY.private_only_note,
      apva: FLEET_COPY.apva_note,
      hybrid: FLEET_COPY.hybrid_note,
    },
  };
}
