'use client';

import React from 'react';

interface Props {
  signal:   string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error:    string | null;
}

interface FallbackProps {
  signal:   string;
  error:    string | null;
  onRetry?: () => void;
}

// Extracted as a named export so renderToStaticMarkup can probe the fallback
// markup directly (Phase 12.8 — class-component error boundaries don't catch
// throws under react-dom/server's static renderer, so we test the fallback
// shape itself, not the catch-and-render flow).
export function CardBoundaryFallback({ signal, error, onRetry }: FallbackProps) {
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border:      '1px solid var(--error-border)',
        padding:     '2rem 2.5rem',
        fontFamily:  'var(--font-mono)',
        fontSize:    '0.6rem',
        color:       'var(--text-tertiary)',
        maxWidth:    '440px',
        width:       '100%',
      }}
    >
      <div style={{ color: 'var(--error-text)', marginBottom: '0.4rem' }}>
        {signal} render error
      </div>
      <div style={{ opacity: 0.5, marginBottom: '0.75rem' }}>
        {error}
      </div>
      <button
        type="button"
        style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', opacity: 0.6, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}
        onClick={onRetry}
      >
        retry
      </button>
      {isDev && (
        <div style={{ marginTop: '0.75rem', opacity: 0.5 }}>
          dev: stack trace logged to browser console (<code>[Card crash — {signal}]</code>)
        </div>
      )}
    </div>
  );
}

export class CardBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error(`[Card crash — ${this.props.signal}]:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <CardBoundaryFallback
          signal={this.props.signal}
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}
