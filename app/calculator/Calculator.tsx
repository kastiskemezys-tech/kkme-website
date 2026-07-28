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
  const [form, setForm] = useState<Record<InputField, string>>({ ...DEFAULT_INPUTS });
  const [scenario, setScenario] = useState<'downside' | 'central' | 'upside'>('central');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<CalcError | null>(null);
  const [loading, setLoading] = useState(false);

  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (t) setToken(t);
    } catch { /* storage unavailable — sample tier is the correct fallback */ }
  }, []);

  const setField = useCallback((k: InputField, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

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
                  onClick={() => setScenario(s)}
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
