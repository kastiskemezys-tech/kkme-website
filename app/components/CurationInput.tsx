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

// ─── Tag groups ────────────────────────────────────────────────────────────────

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Opportunity', tags: ['bess', 'grid-connection', 'dc-power', 'offtake', 'financing'] },
  { label: 'Signal',      tags: ['price-move', 'policy', 'supply-chain', 'competitor', 'technology'] },
  { label: 'Geography',   tags: ['lt', 'lv', 'ee', 'nordic', 'eu'] },
];

const GROUP_LABEL: CSSProperties = {
  ...MONO,
  fontSize: '0.5rem',
  letterSpacing: '0.12em',
  color: text(0.3),
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '0.45rem',
};

function pillStyle(selected: boolean): CSSProperties {
  return {
    ...MONO,
    all: 'unset',
    cursor: 'pointer',
    fontSize: '0.55rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '0.25rem 0.5rem',
    border: `1px solid ${selected ? 'rgba(123,94,167,0.6)' : text(0.15)}`,
    color: selected ? text(0.8) : text(0.3),
    background: selected ? 'rgba(123,94,167,0.12)' : 'transparent',
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
  };
}

// ─── Sub-component ─────────────────────────────────────────────────────────────

function TagSelector({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {TAG_GROUPS.map(({ label, tags }) => (
        <div key={label}>
          <span style={GROUP_LABEL}>{label}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggle(tag)}
                style={pillStyle(selected.has(tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function CurationInput() {
  const [expanded, setExpanded] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      url:       (fd.get('url') as string).trim(),
      title:     (fd.get('title') as string).trim(),
      raw_text:  (fd.get('raw_text') as string).trim(),
      source:    (fd.get('source') as string).trim(),
      relevance: Number(fd.get('relevance')),
      tags:      [...selectedTags],
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
      setSelectedTags(new Set());
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
              style={{ ...INPUT_STYLE, width: 'auto', minWidth: '4rem' }}
            />
          </div>

          <TagSelector selected={selectedTags} onToggle={toggleTag} />

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
