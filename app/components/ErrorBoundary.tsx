'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[KKME] Signal card runtime error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <article
          style={{
            border: '1px solid var(--border-card)',
            paddingTop: '2rem', paddingRight: '2.5rem', paddingBottom: '2rem', paddingLeft: '2.5rem',
            maxWidth: '440px',
            width: '100%',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--type-mono-xs)',
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            Signal error
          </p>
        </article>
      );
    }

    return this.props.children;
  }
}
