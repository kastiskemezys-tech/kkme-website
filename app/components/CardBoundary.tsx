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
        <div style={{
          border:      '1px solid var(--error-border)',
          padding:     '2rem 2.5rem',
          fontFamily:  'var(--font-mono)',
          fontSize:    '0.6rem',
          color:       'var(--text-tertiary)',
          maxWidth:    '440px',
          width:       '100%',
        }}>
          <div style={{ color: 'var(--error-text)', marginBottom: '0.4rem' }}>
            {this.props.signal} render error
          </div>
          <div style={{ opacity: 0.5, marginBottom: '0.75rem' }}>
            {this.state.error}
          </div>
          <button
            type="button"
            style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', opacity: 0.6, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
