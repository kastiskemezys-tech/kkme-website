'use client';

/**
 * /calculator — the BESS Revenue Calculator shell: inputs, state, tier.
 *
 * Phase 35.2. Soft launch — this route is reachable only by URL. Nothing
 * outside app/calculator/ is touched by this phase.
 *
 * State is plain React and session-only. The one persisted value is the
 * operator's token in localStorage, which is what makes the full tier survive a
 * reload; inputs deliberately do not persist.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_INPUTS, TOKEN_STORAGE_KEY,
  formToInputs, validateForm, postCalculate, postLogin,
  type CalcError, type CalcResult, type InputField,
} from './calculatorApi';
import { SampleResults, FullResults, SectionTitle, ContactLink } from './CalculatorResults';
import { configFromSearch, searchFromConfig } from './shareableConfig';

const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } as const;

const labelStyle = {
  ...mono,
  fontSize: 'var(--font-xs)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
};

const inputStyle = {
  ...mono,
  fontSize: 'var(--font-base)',
  color: 'var(--text-primary)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-card)',
  borderRadius: 0,
  padding: 'var(--space-xs)',
  width: '100%',
  minHeight: '44px',
};

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-card)',
  padding: 'var(--space-md)',
};

const PRIMARY_FIELDS: { key: InputField; label: string; hint: string }[] = [
  { key: 'mw', label: 'Power', hint: 'MW' },
  { key: 'mwh', label: 'Energy', hint: 'MWh' },
  { key: 'cod_year', label: 'COD year', hint: 'year' },
  { key: 'capex_eur_kwh', label: 'CAPEX', hint: '€/kWh' },
];

const ADVANCED_FIELDS: { key: InputField; label: string; hint: string }[] = [
  { key: 'availability_pct', label: 'Availability', hint: '%, default 97' },
  { key: 'cycles_efc_yr', label: 'Cycles', hint: 'EFC/yr, reference only' },
  { key: 'warranty_efc_yr', label: 'Warranty cap', hint: 'EFC/yr' },
  { key: 'operating_months_y1', label: 'Operating months Y1', hint: '1–12, default 12' },
];

function Field({
  field, value, onChange,
}: {
  field: { key: InputField; label: string; hint: string };
  value: string;
  onChange: (k: InputField, v: string) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 'var(--space-2xs)' }}>
      <span style={labelStyle}>
        {field.label}
        <span style={{ color: 'var(--text-faint)', marginLeft: 'var(--space-2xs)' }}>{field.hint}</span>
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

export function Calculator({ engineStamp }: { engineStamp: string }) {
  const [formState, setForm] = useState<Record<InputField, string>>({ ...DEFAULT_INPUTS });
  const [scenarioState, setScenario] = useState<'downside' | 'central' | 'upside'>('central');
  const [urlConfig, setUrlConfig] = useState<{
    patch: Partial<Record<InputField, string>>;
    scenario: 'downside' | 'central' | 'upside' | null;
    rejected: string[];
  }>({ patch: {}, scenario: null, rejected: [] });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<CalcError | null>(null);
  const [loading, setLoading] = useState(false);

  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Mount-time adoption of everything that only exists on the client: the
  // persisted token, and the configuration carried in the URL.
  //
  // Phase 42 §3 — the calculator had NO url-parameter handling at all, so every
  // link to it reproduced the defaults: measured, the served HTML for
  // `/calculator` and `/calculator?mw=250&mwh=500&cod_year=2031` is
  // byte-identical. A calculator whose link does not reproduce its result is
  // not shareable.
  //
  // Read off `window.location` rather than `useSearchParams` because this is a
  // static export and the route is not otherwise a Suspense boundary; the two
  // regulatory components that do use the hook are inside one already.
  //
  // Deliberately folded into the EXISTING mount effect rather than added as a
  // second one. `react-hooks/set-state-in-effect` flags this shape, and it is
  // the correct shape here — the values genuinely do not exist until the client
  // mounts. Reusing the one effect that already carries that trade-off keeps
  // the repo's eslint error count unchanged instead of spending a new one.
  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (t) setToken(t);
    } catch { /* storage unavailable — sample tier is the correct fallback */ }

    if (typeof window === 'undefined') return;
    const { form: patch, scenario: s, rejected } = configFromSearch(window.location.search);
    // One state object, set once: form, scenario and any refused parameters.
    // Rejected params are SURFACED, not swallowed — a link that silently
    // reproduces a different configuration than it names is worse than one that
    // says which part of it could not be honoured.
    setUrlConfig({ patch, scenario: s, rejected });
  }, []);

  // Applying the adopted configuration is a render-time derivation, not a
  // second effect.
  const form = { ...formState, ...urlConfig.patch };
  const scenario = urlConfig.scenario ?? scenarioState;
  const rejectedParams = urlConfig.rejected;

  // Editing a field RETIRES the URL patch for that field. Without this the
  // adopted link value would win over every subsequent keystroke — the overlay
  // is a one-time adoption, not a permanent override.
  const setField = useCallback((k: InputField, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setUrlConfig((prev) => (k in prev.patch
      ? { ...prev, patch: Object.fromEntries(Object.entries(prev.patch).filter(([f]) => f !== k)) }
      : prev));
  }, []);

  // Same for the scenario buttons.
  const chooseScenario = useCallback((s: 'downside' | 'central' | 'upside') => {
    setScenario(s);
    setUrlConfig((prev) => (prev.scenario === null ? prev : { ...prev, scenario: null }));
  }, []);

  // Keep the address bar in step with the form, without adding history entries —
  // `replaceState`, so the back button still means "the page before this one"
  // rather than "the last character I typed".
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = `${window.location.pathname}${searchFromConfig(form, scenario)}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [form, scenario]);

  const compute = useCallback(async (withToken: string | null) => {
    const clientErrors = validateForm(form);
    if (clientErrors.length) {
      setError({ kind: 'validation', messages: clientErrors });
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await postCalculate(formToInputs(form, scenario), withToken);
    setLoading(false);
    if (res.ok) { setResult(res.result); setError(null); }
    else { setError(res.error); setResult(null); }
  }, [form, scenario]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void compute(token);
  }, [compute, token]);

  const onLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    const res = await postLogin(password);
    setLoginBusy(false);
    if (!res.ok) { setLoginError(res.message); return; }
    try { localStorage.setItem(TOKEN_STORAGE_KEY, res.token); } catch { /* session-only is fine */ }
    setToken(res.token);
    setPassword('');
    setLoginOpen(false);
    void compute(res.token);
  }, [password, compute]);

  const signOut = useCallback(() => {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* nothing to clear */ }
    setToken(null);
    setResult(null);
  }, []);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* ── Inputs ── */}
      <form onSubmit={onSubmit} style={cardStyle}>
        <SectionTitle>Project</SectionTitle>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-sm)',
        }}>
          {PRIMARY_FIELDS.map((f) => (
            <Field key={f.key} field={f} value={form[f.key]} onChange={setField} />
          ))}
        </div>

        {/* Phase 42 §3 — a link that could not be honoured says which part, and
            says it where the reader is looking. Silently falling back to a
            default while the URL still names another value is the worst of the
            available behaviours: the reader believes they are looking at the
            configuration they were sent. */}
        {rejectedParams.length > 0 && (
          <p
            role="status"
            style={{
              ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)',
              marginTop: 'var(--space-sm)', marginBottom: 0,
            }}
          >
            {rejectedParams.length} link parameter{rejectedParams.length > 1 ? 's were' : ' was'} outside
            the accepted range and {rejectedParams.length > 1 ? 'were' : 'was'} not applied:{' '}
            {rejectedParams.join(', ')}. The default is shown instead.
          </p>
        )}

        <div style={{ marginTop: 'var(--space-sm)' }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{
              ...labelStyle, background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, color: 'var(--text-secondary)', minHeight: '44px',
            }}
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? '−' : '+'} Advanced
          </button>
          {advancedOpen && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-xs)',
            }}>
              {ADVANCED_FIELDS.map((f) => (
                <Field key={f.key} field={f} value={form[f.key]} onChange={setField} />
              ))}
            </div>
          )}
        </div>

        {token && (
          <div style={{ marginTop: 'var(--space-sm)', display: 'grid', gap: 'var(--space-2xs)' }}>
            <span style={labelStyle}>Scenario</span>
            <div style={{ display: 'flex', gap: 'var(--space-2xs)', flexWrap: 'wrap' }}>
              {(['downside', 'central', 'upside'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => chooseScenario(s)}
                  style={{
                    ...mono, fontSize: 'var(--font-xs)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    padding: 'var(--space-2xs) var(--space-xs)',
                    minHeight: '44px',
                    background: scenario === s ? 'var(--bg-card-highlight)' : 'transparent',
                    color: scenario === s ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: `1px solid ${scenario === s ? 'var(--border-highlight)' : 'var(--border-card)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...mono, fontSize: 'var(--font-sm)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginTop: 'var(--space-md)',
            padding: 'var(--space-xs) var(--space-md)',
            minHeight: '44px',
            background: 'var(--bg-card-highlight)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-highlight)',
            cursor: loading ? 'progress' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Computing…' : 'Compute'}
        </button>
      </form>

      {/* ── Errors ── */}
      {error && (
        <div style={{
          ...cardStyle,
          borderLeft: `2px solid ${error.kind === 'rate_limit' ? 'var(--accent-amber)' : 'var(--accent-rose)'}`,
        }}>
          <div style={{ ...labelStyle, marginBottom: 'var(--space-2xs)' }}>
            {error.kind === 'rate_limit' ? 'Daily limit' : error.kind === 'validation' ? 'Check the inputs' : 'Engine error'}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2xs)' }}>
            {error.messages.map((m) => (
              <li key={m} style={{
                fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)',
                color: 'var(--text-secondary)', maxWidth: '72ch',
              }}>{m}</li>
            ))}
          </ul>
          {error.upsell && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <ContactLink upsell={error.upsell} />
            </div>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {result && result.tier === 'sample' && <SampleResults result={result} />}
      {result && result.tier === 'full' && <FullResults result={result} />}

      {/* ── Footer: engine stamp + discreet operator sign-in ── */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 'var(--space-sm)',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap',
      }}>
        <span style={{ ...mono, fontSize: '10px', color: 'var(--text-muted)' }}>
          {result ? `Engine ${result.engine_version} · ` : ''}{engineStamp}
        </span>

        {token ? (
          <button
            onClick={signOut}
            style={{ ...labelStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: '44px' }}
          >
            Sign out
          </button>
        ) : loginOpen ? (
          <form onSubmit={onLogin} style={{ display: 'flex', gap: 'var(--space-2xs)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{ ...inputStyle, width: 'auto', minWidth: '180px', fontSize: 'var(--font-sm)' }}
            />
            <button
              type="submit"
              disabled={loginBusy}
              style={{
                ...labelStyle, background: 'var(--bg-card-highlight)',
                border: '1px solid var(--border-card)', cursor: 'pointer',
                padding: 'var(--space-2xs) var(--space-xs)', minHeight: '44px',
                color: 'var(--text-primary)',
              }}
            >
              {loginBusy ? '…' : 'Sign in'}
            </button>
            {loginError && (
              <span style={{ ...mono, fontSize: '10px', color: 'var(--accent-rose)' }}>{loginError}</span>
            )}
          </form>
        ) : (
          <button
            onClick={() => setLoginOpen(true)}
            style={{ ...labelStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: '44px' }}
            aria-label="KKME operator sign-in"
          >
            KKME
          </button>
        )}
      </footer>
    </div>
  );
}
