/**
 * /fleet — transport and types for the operator fleet console.
 *
 * Phase 37.C. This file must never contain fleet data, a project name, a contact
 * or a comment. Everything it describes arrives at runtime over an authenticated
 * fetch; the static bundle carries types and copy only. The UI leak test asserts
 * exactly that against the BUILT html, not against a component in isolation.
 */

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

/** Deliberately distinct from the calculator's key — different gate, different session. */
export const FLEET_TOKEN_KEY = 'kkme_fleet_token';

// ── Shapes ─────────────────────────────────────────────────────────────────

export type Tier = 'public-confirmed' | 'corroborated' | 'private-only';

export interface Citation {
  source_type: string;
  url: string;
  what_it_confirms?: string;
  fetched?: string;
  confidence?: string;
}

export type BessFigure =
  | { kind: 'point'; mw: number; basis: string; citable: boolean }
  | { kind: 'band'; lower_mw: number; upper_mw: number; basis: string; note: string; citable: boolean }
  | { kind: 'unknown'; basis: string; citable: boolean };

export interface Transition {
  id: string;
  type: string;
  at?: string;
  reason?: string;
  evidence?: Citation[];
  detail?: Record<string, unknown>;
}

export interface Project {
  id: string;
  country: string;
  spv: string;
  org: string;
  plant_type: string;
  location: string;
  site_total_mw?: number;
  bess_mw?: number;
  bess_mwh?: number;
  verification_status: Tier;
  citations: Citation[];
  parse_confidence?: string;
  parse_note?: string;

  bess_figure: BessFigure;
  is_hybrid: boolean;
  publishable: boolean;
  publishability_reason: string;
  capacity_citable: boolean;

  contact?: string;
  comment?: string;
  comment_edited: boolean;
  comment_original: string | null;
  comment_updated_at: string | null;
  apva: { value: string; note: string; citable: false } | null;
  status_history: Transition[];
}

export interface CrmView {
  generated: string | null;
  stored_at: string | null;
  count: number;
  projects: Project[];
  summary: {
    by_country: Record<string, number>;
    by_tier: Record<string, number>;
    hybrid_rows: number;
    publishable_rows: number;
    capacity_citable_rows: number;
    citable_bess_mw: number;
  };
  notes: { private_only: string; apva: string; hybrid: string };
  /**
   * The public-fleet hybrid band, delivered inside the AUTHED payload rather than
   * bundled into the browser. Bundling it shipped 34 public fleet entry names into
   * a chunk anyone could fetch at /fleet — a public tier by another name.
   */
  hybrid_band: {
    band: { lower_bess_mw: number; upper_bess_mw: number; width_mw: number; basis: string; derivation: string };
    incompleteness: { note: string; consequence: string };
    rules_for_consumers: string[];
  } | null;
}

// ── Transport ──────────────────────────────────────────────────────────────

export type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function postFleetLogin(
  password: string,
): Promise<Fetched<{ token: string; expires: number }>> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/fleet/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the console service.' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.token) return { ok: true, data: { token: body.token, expires: body.expires } };
  return { ok: false, status: res.status, message: String(body.error ?? `Sign-in failed (HTTP ${res.status}).`) };
}

export async function getFleetData(token: string): Promise<Fetched<CrmView>> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/fleet/data`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the console service.' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: body as CrmView };
  return { ok: false, status: res.status, message: String(body.error ?? `HTTP ${res.status}.`) };
}

export async function postFleetComment(
  token: string, id: string, text: string,
): Promise<Fetched<{ updated_at: string }>> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/fleet/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, text }),
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the console service.' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: { updated_at: String(body.updated_at) } };
  return { ok: false, status: res.status, message: String(body.error ?? `HTTP ${res.status}.`) };
}

// ── Display helpers ────────────────────────────────────────────────────────

export const TIER_LABEL: Record<Tier, string> = {
  'public-confirmed': 'Public-confirmed',
  corroborated: 'Corroborated',
  'private-only': 'Private-only',
};

/**
 * Tier colour. Note these encode EVIDENCE STANDING, not project quality — the
 * drawer states the reason in words so the colour is never the whole message.
 */
export const TIER_COLOR: Record<Tier, string> = {
  'public-confirmed': 'var(--accent-teal)',
  corroborated: 'var(--accent-amber)',
  'private-only': 'var(--text-muted)',
};

export function mw(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} MW`;
}

/** Renders a band as a band. There is deliberately no midpoint helper here. */
export function bessDisplay(f: BessFigure): string {
  if (f.kind === 'point') return mw(f.mw);
  if (f.kind === 'band') return `${mw(f.lower_mw)} – ${mw(f.upper_mw)}`;
  return '—';
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}
