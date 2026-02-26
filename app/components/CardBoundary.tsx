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
          border:      '1px solid rgba(255,60,60,0.2)',
          padding:     '2rem 2.5rem',
          fontFamily:  'var(--font-mono)',
          fontSize:    '0.6rem',
          color:       'rgba(232,226,217,0.5)',
          maxWidth:    '440px',
          width:       '100%',
        }}>
          <div style={{ color: 'rgba(255,60,60,0.7)', marginBottom: '0.4rem' }}>
            {this.props.signal} render error
          </div>
          <div style={{ opacity: 0.5, marginBottom: '0.75rem' }}>
            {this.state.error}
          </div>
          <div
            style={{ cursor: 'pointer', textDecoration: 'underline', opacity: 0.6 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            retry
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
