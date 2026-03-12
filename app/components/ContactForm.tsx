'use client';

import { useState, type FormEvent } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

type ContactType = 'project' | 'investment' | 'market' | 'other';

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'investment', label: 'Investment / capital' },
  { value: 'market', label: 'Market discussion' },
  { value: 'other', label: 'Other' },
];

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(232,226,217,0.03)',
  border: '1px solid var(--border-card)',
  borderRadius: '2px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-sm)',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.15s',
};

const labelStyle = {
  display: 'block' as const,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-sm)',
  color: 'var(--text-tertiary)',
  marginBottom: '5px',
  letterSpacing: '0.04em',
};

export function ContactForm() {
  const [type, setType] = useState<ContactType | ''>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  // Project-specific
  const [projectName, setProjectName] = useState('');
  const [mwMwh, setMwMwh] = useState('');
  const [country, setCountry] = useState('');
  const [targetCod, setTargetCod] = useState('');

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const showProjectFields = type === 'project';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!type || !name || !email || !message) return;

    setStatus('sending');
    try {
      const body: Record<string, string | null> = {
        type, name, email, message,
        company: company || null,
      };
      if (showProjectFields) {
        body.projectName = projectName || null;
        body.mwMwh = mwMwh || null;
        body.country = country || null;
        body.targetCod = targetCod || null;
      }
      const res = await fetch(`${WORKER_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus('success');
      setType(''); setName(''); setEmail(''); setCompany('');
      setMessage(''); setProjectName(''); setMwMwh('');
      setCountry(''); setTargetCod('');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div style={{ padding: '24px 0' }}>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-base)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Thanks — we&apos;ll be in touch within a couple of days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Type selector */}
      <div>
        <label style={labelStyle}>What are you reaching out about?</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as ContactType)}
          required
          style={{
            ...fieldStyle,
            appearance: 'none',
            cursor: 'pointer',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='rgba(232,226,217,0.3)' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '32px',
          }}
        >
          <option value="" disabled>Select...</option>
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Name + Email side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={fieldStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Company — optional */}
      <div>
        <label style={labelStyle}>Company <span style={{ opacity: 0.5 }}>(optional)</span></label>
        <input
          type="text"
          value={company}
          onChange={e => setCompany(e.target.value)}
          style={fieldStyle}
        />
      </div>

      {/* Conditional project fields */}
      {showProjectFields && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          padding: '14px',
          background: 'var(--bg-elevated)',
          borderRadius: '2px',
        }}>
          <div>
            <label style={labelStyle}>Project name</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>MW / MWh</label>
            <input
              type="text"
              value={mwMwh}
              onChange={e => setMwMwh(e.target.value)}
              placeholder="50 MW / 100 MWh"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input
              type="text"
              value={country}
              onChange={e => setCountry(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Target COD</label>
            <input
              type="text"
              value={targetCod}
              onChange={e => setTargetCod(e.target.value)}
              placeholder="Q4 2027"
              style={fieldStyle}
            />
          </div>
        </div>
      )}

      {/* Message */}
      <div>
        <label style={labelStyle}>Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          rows={4}
          style={{
            ...fieldStyle,
            resize: 'vertical',
            minHeight: '80px',
          }}
        />
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
        <button
          type="submit"
          disabled={status === 'sending'}
          style={{
            padding: '11px 28px',
            background: 'rgba(0,180,160,0.10)',
            border: '1px solid rgba(0,180,160,0.30)',
            borderRadius: '2px',
            color: 'var(--teal)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            letterSpacing: '0.06em',
            cursor: status === 'sending' ? 'wait' : 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
            opacity: status === 'sending' ? 0.6 : 1,
          }}
        >
          {status === 'sending' ? 'Sending...' : 'Start the conversation'}
        </button>
      </div>

      {/* Error state */}
      {status === 'error' && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--rose)',
          marginTop: '4px',
        }}>
          Something went wrong. Try emailing{' '}
          <a href="mailto:kastytis@kkme.eu" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            kastytis@kkme.eu
          </a>{' '}
          directly.
        </p>
      )}

      {/* Trust note */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-ghost)',
        marginTop: '4px',
        letterSpacing: '0.03em',
      }}>
        Baltic storage conversations only. Usually replies within a couple of days.
      </p>
    </form>
  );
}
