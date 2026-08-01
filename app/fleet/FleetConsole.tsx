'use client';

/**
 * /fleet — the operator fleet console.
 *
 * Phase 37.C. Density is the point: this is a working tool, not a marketing
 * surface, so the table is tight and the drawer carries everything at once.
 *
 * THE GATE IS THE WHOLE COMPONENT. Before a token verifies, this renders a sign-in
 * form and literally nothing else — no counts, no column headers, no "N projects".
 * `view` is null until an authenticated fetch resolves, so there is no state in
 * which partial data can paint. The UI leak test asserts this against the built
 * static HTML as well as against the rendered component.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FLEET_TOKEN_KEY, TIER_COLOR, TIER_LABEL,
  bessDisplay, fmtDate, getFleetData, mw, postFleetComment, postFleetLogin,
  type CrmView, type Project, type Tier,
} from './fleetApi';

const MONO = 'var(--font-mono)';

// ── Gate ───────────────────────────────────────────────────────────────────

function Gate({ onToken }: { onToken: (t: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await postFleetLogin(password);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    try { localStorage.setItem(FLEET_TOKEN_KEY, res.data.token); } catch { /* session-only is fine */ }
    onToken(res.data.token);
  }, [password, onToken]);

  return (
    <div style={{ maxWidth: '380px', margin: '0 auto', paddingTop: 'var(--space-3xl)' }}>
      <p style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
        KKME
      </p>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-lg)', fontWeight: 200, color: 'var(--text-primary)', marginTop: 'var(--space-2xs)', marginBottom: 'var(--space-sm)' }}>
        Fleet console
      </h1>
      <form onSubmit={submit}>
        <label htmlFor="fleet-pw" style={{ display: 'block', fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2xs)' }}>
          Password
        </label>
        <input
          id="fleet-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{
            width: '100%', padding: 'var(--space-xs)', fontFamily: MONO, fontSize: 'var(--font-sm)',
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--border-card)', borderRadius: '2px',
          }}
        />
        <button
          type="submit"
          disabled={busy || !password}
          style={{
            marginTop: 'var(--space-sm)', width: '100%', padding: 'var(--space-xs)',
            fontFamily: MONO, fontSize: 'var(--font-xs)', letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'var(--bg-card-highlight)', color: 'var(--text-primary)',
            border: '1px solid var(--border-highlight)', borderRadius: '2px',
            cursor: busy || !password ? 'default' : 'pointer', opacity: busy || !password ? 0.5 : 1,
          }}
        >
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        {error && (
          <p role="alert" style={{ marginTop: 'var(--space-xs)', fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--accent-rose)' }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

// ── Small parts ────────────────────────────────────────────────────────────

function TierDot({ tier }: { tier: Tier }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
        background: TIER_COLOR[tier], marginRight: 'var(--space-2xs)', verticalAlign: 'middle',
      }}
    />
  );
}

/**
 * `apva_flag` rendering.
 *
 * Rule from batch-1's Pause A, restated because it is the whole reason this
 * component exists rather than a plain string: APVA is operator testimony that no
 * public source corroborates. It is never a verification signal, never scored, and
 * never sits next to the tier. It renders muted, struck through with its own
 * caveat, so it cannot be mistaken for evidence at a glance.
 */
function ApvaTestimony({ apva }: { apva: NonNullable<Project['apva']> }) {
  return (
    <div style={{ marginTop: 'var(--space-xs)' }}>
      <span style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        APVA (private testimony)
      </span>
      <div
        title={apva.note}
        style={{
          fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
          border: '1px dashed var(--border-subtle)', borderRadius: '2px',
          padding: 'var(--space-2xs) var(--space-xs)', marginTop: '2px',
        }}
      >
        {apva.value}
        <span style={{ color: 'var(--text-faint)' }}> · not citable — TAM unblocker</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-xs)' }}>
      <div style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────

/**
 * Exported for the UI leak test's positive control. This is the ONLY surface that
 * renders contacts, deal comments and APVA testimony, so it is the surface the
 * test has to prove can render them — otherwise "the gate shows no contact" would
 * be true of a console that could never show one anywhere.
 */
export function ProjectDrawer({ p, token, onClose, onSaved }: {
  p: Project; token: string; onClose: () => void; onSaved: (id: string, text: string, at: string) => void;
}) {
  // State initialises from props and is reset by remounting, not by an effect:
  // the caller passes `key={p.id}`, so switching project gives a fresh Drawer and
  // an in-progress edit can never bleed across rows.
  const [text, setText] = useState(p.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    const res = await postFleetComment(token, p.id, text);
    setBusy(false);
    if (!res.ok) { setMsg(res.message); return; }
    setMsg(`Saved ${res.data.updated_at.slice(11, 16)}`);
    onSaved(p.id, text, res.data.updated_at);
  }, [token, p.id, text, onSaved]);

  return (
    <aside
      aria-label={`Project detail — ${p.spv}`}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)',
        background: 'var(--bg-page)', borderLeft: '1px solid var(--border-card)',
        padding: 'var(--space-md)', overflowY: 'auto', zIndex: 40,
      }}
    >
      <button
        onClick={onClose}
        style={{ float: 'right', background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: MONO, fontSize: 'var(--font-sm)', cursor: 'pointer' }}
      >
        ✕
      </button>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-lg)', fontWeight: 200, color: 'var(--text-primary)', margin: 0, paddingRight: 'var(--space-md)' }}>
        {p.spv}
      </h2>
      <p style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2xs)', marginBottom: 'var(--space-md)' }}>
        <TierDot tier={p.verification_status} />
        {TIER_LABEL[p.verification_status]} · {p.country} · {p.location || '—'}
      </p>

      {/* Publishability first: it is the question the console exists to answer. */}
      <div style={{
        border: '1px solid var(--border-card)', borderRadius: '2px',
        padding: 'var(--space-xs)', marginBottom: 'var(--space-md)',
        background: 'var(--bg-card)',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Can this reach a client number?
        </div>
        <div style={{ fontFamily: MONO, fontSize: 'var(--font-sm)', color: p.capacity_citable ? 'var(--accent-teal)' : 'var(--text-secondary)', marginTop: '2px' }}>
          {p.capacity_citable ? 'Capacity is citable' : 'No — capacity is not citable'}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {p.publishability_reason}
        </div>
      </div>

      <Field label="Developer / org">{p.org || '—'}</Field>
      <Field label="Plant type">{p.plant_type || '—'}</Field>
      <Field label="Site total">{mw(p.site_total_mw)}</Field>
      <Field label={p.is_hybrid ? 'BESS (band)' : 'BESS'}>
        {bessDisplay(p.bess_figure)}
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-faint)', marginTop: '2px' }}>
          {p.bess_figure.basis}
        </div>
        {p.bess_figure.kind === 'band' && (
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {p.bess_figure.note}
          </div>
        )}
      </Field>

      <Field label={`Evidence (${p.citations?.length ?? 0})`}>
        {(p.citations ?? []).length === 0 ? (
          <span style={{ color: 'var(--text-faint)' }}>None. {p.publishability_reason}</span>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {p.citations.map((c, i) => (
              <li key={i} style={{ marginBottom: 'var(--space-2xs)' }}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-teal)' }}>
                  {c.source_type}
                </a>
                {c.what_it_confirms && (
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{c.what_it_confirms}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Field>

      {p.apva && <ApvaTestimony apva={p.apva} />}

      {p.contact && (
        <Field label="Contact (private)">
          <a href={`mailto:${p.contact}`} style={{ color: 'var(--accent-teal)' }}>{p.contact}</a>
        </Field>
      )}

      <Field label={`Status history (${p.status_history?.length ?? 0})`}>
        {(p.status_history ?? []).length === 0 ? (
          <span style={{ color: 'var(--text-faint)' }}>No recorded transitions.</span>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {p.status_history.map((t, i) => (
              <li key={i} style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                {fmtDate(t.at)} · {t.type}{t.reason ? ` — ${t.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <div style={{ marginTop: 'var(--space-md)' }}>
        <label htmlFor={`c-${p.id}`} style={{ display: 'block', fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Deal comment (private)
        </label>
        <textarea
          id={`c-${p.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{
            width: '100%', marginTop: '2px', padding: 'var(--space-xs)',
            fontFamily: MONO, fontSize: 'var(--font-xs)', lineHeight: 1.5,
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--border-card)', borderRadius: '2px', resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginTop: 'var(--space-2xs)' }}>
          <button
            onClick={save}
            disabled={busy}
            style={{
              padding: '4px 12px', fontFamily: MONO, fontSize: 'var(--font-xs)',
              background: 'var(--bg-card-highlight)', color: 'var(--text-primary)',
              border: '1px solid var(--border-highlight)', borderRadius: '2px', cursor: 'pointer',
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {msg && <span style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{msg}</span>}
        </div>
        {p.comment_edited && p.comment_original !== null && (
          <details style={{ marginTop: 'var(--space-2xs)' }}>
            <summary style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-faint)', cursor: 'pointer' }}>
              Edited {fmtDate(p.comment_updated_at)} — show the intake&rsquo;s original
            </summary>
            <div style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
              {p.comment_original || '(empty)'}
            </div>
          </details>
        )}
      </div>
    </aside>
  );
}

// ── Workspace ──────────────────────────────────────────────────────────────

const ALL = '__all__';

/**
 * The post-authentication working view.
 *
 * Exported so the UI leak test can render it WITH seeded private values and prove
 * the canaries do appear here — the positive control that makes the "absent from
 * the gate" assertion mean something. Without it, that assertion would be the
 * batch-1 failure again: emptiness asserted against nothing.
 *
 * It takes `view` as a prop and performs no fetching, so it is unreachable without
 * a caller that already holds a verified token.
 */
export function FleetWorkspace({ view, token, onSaved }: {
  view: CrmView;
  token: string;
  onSaved: (id: string, text: string, at: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [country, setCountry] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [org, setOrg] = useState('');
  const [minMw, setMinMw] = useState('');

  const rows = useMemo(() => {
    const floor = Number(minMw);
    return view.projects.filter((p) => {
      if (country !== ALL && p.country !== country) return false;
      if (tier !== ALL && p.verification_status !== tier) return false;
      if (org && !`${p.org} ${p.spv}`.toLowerCase().includes(org.toLowerCase())) return false;
      if (minMw && Number.isFinite(floor) && (p.site_total_mw ?? 0) < floor) return false;
      return true;
    });
  }, [view, country, tier, org, minMw]);

  const selected = rows.find((p) => p.id === open) ?? null;
  const countries = Object.keys(view.summary.by_country).sort();

  const th: React.CSSProperties = {
    textAlign: 'left', fontFamily: MONO, fontSize: 'var(--font-xs)', fontWeight: 400,
    color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: 'var(--space-2xs) var(--space-xs)', borderBottom: '1px solid var(--border-card)',
    position: 'sticky', top: 0, background: 'var(--bg-page)',
  };
  const td: React.CSSProperties = {
    fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)',
    padding: '5px var(--space-xs)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap',
  };
  const select: React.CSSProperties = {
    fontFamily: MONO, fontSize: 'var(--font-xs)', padding: '3px 6px',
    background: 'var(--bg-card)', color: 'var(--text-secondary)',
    border: '1px solid var(--border-card)', borderRadius: '2px',
  };

  return (
    <div>
      {/* The standing caveat. It is stated once, at the top, permanently — not
          tucked into a drawer where it can be missed. */}
      <div style={{
        border: '1px solid var(--border-card)', borderLeft: '2px solid var(--accent-amber)',
        borderRadius: '2px', padding: 'var(--space-xs)', marginBottom: 'var(--space-sm)',
        background: 'var(--bg-card)',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Citable BESS capacity in this set: {mw(view.summary.citable_bess_mw)}</strong>
          {' — '}
          {view.summary.capacity_citable_rows} of {view.count} rows carry a citation that speaks to capacity.
          Registry citations confirm that a company exists; they do not confirm a battery or its size.
          Nothing here reaches a published or client-facing number until a capacity source does.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
        <select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} style={select}>
          <option value={ALL}>All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c} ({view.summary.by_country[c]})</option>)}
        </select>
        <select aria-label="Verification tier" value={tier} onChange={(e) => setTier(e.target.value)} style={select}>
          <option value={ALL}>All tiers</option>
          {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]} ({view.summary.by_tier[t] ?? 0})</option>
          ))}
        </select>
        <input aria-label="Developer or SPV" placeholder="developer / SPV" value={org} onChange={(e) => setOrg(e.target.value)} style={{ ...select, width: '160px' }} />
        <input aria-label="Minimum MW" placeholder="min MW" inputMode="numeric" value={minMw} onChange={(e) => setMinMw(e.target.value)} style={{ ...select, width: '80px' }} />
        <span style={{ fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
          {rows.length} / {view.count} · {view.summary.hybrid_rows} hybrid
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>SPV</th>
              <th style={th}>Developer</th>
              <th style={th}>C</th>
              <th style={th}>Type</th>
              <th style={{ ...th, textAlign: 'right' }}>Site</th>
              <th style={{ ...th, textAlign: 'right' }}>BESS</th>
              <th style={th}>Tier</th>
              <th style={th}>Citable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => setOpen(p.id)}
                style={{ cursor: 'pointer', background: open === p.id ? 'var(--bg-card-highlight)' : undefined }}
              >
                <td style={{ ...td, color: 'var(--text-primary)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.spv}</td>
                <td style={{ ...td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.org}</td>
                <td style={td}>{p.country}</td>
                <td style={{ ...td, color: p.is_hybrid ? 'var(--accent-amber)' : undefined }}>{p.plant_type}</td>
                <td style={{ ...td, textAlign: 'right' }}>{mw(p.site_total_mw)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{bessDisplay(p.bess_figure)}</td>
                <td style={td}><TierDot tier={p.verification_status} />{TIER_LABEL[p.verification_status]}</td>
                <td style={{ ...td, color: p.capacity_citable ? 'var(--accent-teal)' : 'var(--text-faint)' }}>
                  {p.capacity_citable ? 'yes' : 'no'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The band, restated where supply is discussed, with its own incompleteness.
          It arrives in the authed payload rather than being bundled: shipping it to
          the browser would have made 34 public fleet names readable at /fleet
          without a token. */}
      {view.hybrid_band && (
        <div style={{ marginTop: 'var(--space-md)', fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Public-fleet hybrid band: {mw(view.hybrid_band.band.lower_bess_mw)} – {mw(view.hybrid_band.band.upper_bess_mw)}{' '}
          (width {mw(view.hybrid_band.band.width_mw)}). {view.hybrid_band.incompleteness.consequence}{' '}
          The private column never contributes to it in either direction.
        </div>
      )}

      {selected && (
        <ProjectDrawer key={selected.id} p={selected} token={token} onClose={() => setOpen(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ── Console ────────────────────────────────────────────────────────────────

/**
 * The route's root. Holds the session and nothing else.
 *
 * `view` starts null and only a successful authenticated fetch can set it, so
 * there is no render in which partial fleet data can paint. This is also what the
 * static export captures at build time: the gate, and nothing behind it.
 */
export function FleetConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<CrmView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // localStorage does not exist during the static prerender, so the token cannot be
  // read in a lazy initialiser without either throwing at build time or making the
  // server and first client renders disagree. Reading it in an effect keeps both
  // renders identical — the gate — and is the same pattern as the calculator's.
  useEffect(() => {
    try {
      const t = localStorage.getItem(FLEET_TOKEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t) setToken(t);
    } catch { /* no storage, gate stays up */ }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await getFleetData(token);
      if (cancelled) return;
      if (!res.ok) {
        // An invalid token must NOT degrade to a partial view — it drops the
        // session and returns to the gate. There is no tier below "signed in".
        setView(null);
        setError(res.message);
        if (res.status === 401) {
          try { localStorage.removeItem(FLEET_TOKEN_KEY); } catch { /* nothing to clear */ }
          setToken(null);
        }
        return;
      }
      setError(null);
      setView(res.data);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const onSaved = useCallback((id: string, text: string, at: string) => {
    setView((v) => v && ({
      ...v,
      projects: v.projects.map((p) => (p.id === id
        ? { ...p, comment: text, comment_edited: true, comment_updated_at: at, comment_original: p.comment_original ?? p.comment ?? '' }
        : p)),
    }));
  }, []);

  if (!token || !view) {
    return (
      <>
        <Gate onToken={setToken} />
        {error && (
          <p role="alert" style={{ textAlign: 'center', fontFamily: MONO, fontSize: 'var(--font-xs)', color: 'var(--accent-rose)', marginTop: 'var(--space-sm)' }}>
            {error}
          </p>
        )}
      </>
    );
  }

  return <FleetWorkspace view={view} token={token} onSaved={onSaved} />;
}
