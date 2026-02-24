'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

const LABEL_STYLE: CSSProperties = {
  ...MONO,
  fontSize: '0.575rem',
  letterSpacing: '0.12em',
  color: text(0.3),
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '0.4rem',
};

const INPUT_STYLE: CSSProperties = {
  ...MONO,
  width: '100%',
  background: 'transparent',
  border: `1px solid ${text(0.1)}`,
  color: text(0.75),
  fontSize: '0.75rem',
  padding: '0.5rem 0.65rem',
  outline: 'none',
  borderRadius: 0,
  boxSizing: 'border-box',
};

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function CurationInput() {
  const [expanded, setExpanded] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const tagsRaw = (fd.get('tags') as string).trim();
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const payload = {
      url:       (fd.get('url') as string).trim(),
      title:     (fd.get('title') as string).trim(),
      raw_text:  (fd.get('raw_text') as string).trim(),
      source:    (fd.get('source') as string).trim(),
      relevance: Number(fd.get('relevance')),
      tags,
    };

    setSubmitState('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`${WORKER_URL}/curate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setSubmitState('success');
      form.reset();
      setTimeout(() => {
        setSubmitState('idle');
        setExpanded(false);
      }, 2000);
    } catch (err) {
      setSubmitState('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <article
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          ...MONO,
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          width: '100%',
        }}
      >
        <span
          style={{
            fontSize: '0.625rem',
            letterSpacing: '0.14em',
            color: text(0.35),
            textTransform: 'uppercase',
          }}
        >
          Curate
        </span>
        <span
          style={{
            fontSize: '0.575rem',
            color: text(0.2),
            letterSpacing: '0.06em',
            marginLeft: 'auto',
          }}
        >
          {expanded ? '↑ collapse' : '↓ add entry'}
        </span>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="ci-url" style={LABEL_STYLE}>URL</label>
            <input id="ci-url" name="url" type="url" required style={INPUT_STYLE} placeholder="https://…" />
          </div>

          <div>
            <label htmlFor="ci-title" style={LABEL_STYLE}>Title</label>
            <input id="ci-title" name="title" type="text" required style={INPUT_STYLE} placeholder="Article or report title" />
          </div>

          <div>
            <label htmlFor="ci-source" style={LABEL_STYLE}>Source</label>
            <input id="ci-source" name="source" type="text" required style={INPUT_STYLE} placeholder="e.g. ENTSO-E, Bloomberg, Litgrid" />
          </div>

          <div>
            <label htmlFor="ci-raw" style={LABEL_STYLE}>Key excerpt / raw text</label>
            <textarea
              id="ci-raw"
              name="raw_text"
              required
              rows={4}
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
              placeholder="Paste the most signal-relevant paragraph(s)"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label htmlFor="ci-relevance" style={LABEL_STYLE}>Relevance (1–5)</label>
              <input
                id="ci-relevance"
                name="relevance"
                type="number"
                min={1}
                max={5}
                required
                defaultValue={3}
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label htmlFor="ci-tags" style={LABEL_STYLE}>Tags (comma-separated)</label>
              <input id="ci-tags" name="tags" type="text" style={INPUT_STYLE} placeholder="BESS, LT, S1" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitState === 'loading'}
            style={{
              ...MONO,
              all: 'unset',
              cursor: submitState === 'loading' ? 'wait' : 'pointer',
              border: `1px solid ${text(submitState === 'success' ? 0.35 : 0.15)}`,
              padding: '0.55rem 1rem',
              fontSize: '0.625rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: submitState === 'success' ? '#5a7d5e' : text(0.5),
              textAlign: 'center',
              marginTop: '0.25rem',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {submitState === 'loading' && 'Storing…'}
            {submitState === 'success' && '✓ Stored'}
            {submitState === 'error'   && 'Retry'}
            {submitState === 'idle'    && 'Submit'}
          </button>

          {submitState === 'error' && errorMsg && (
            <p style={{ ...MONO, fontSize: '0.575rem', color: '#9b3043', letterSpacing: '0.06em' }}>
              {errorMsg}
            </p>
          )}
        </form>
      )}
    </article>
  );
}
