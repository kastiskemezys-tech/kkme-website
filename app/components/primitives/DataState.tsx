'use client';

import type { ReactNode } from 'react';

// Phase 8.3d — DataState 4-state wrapper.
// Centralises the four states every data-driven card should display so cards
// can never silently render old numbers when a feed fails (audit §1.7).
// Pre-positions Phase 11.6 mobile data UX (summary-stat + sparkline default
// + tap-to-expand) on top of this primitive.

export type DataStateStatus = 'loading' | 'ok' | 'stale' | 'error';

export interface DataStateProps {
  status: DataStateStatus;
  /** For 'stale': how old the data is. Renders into the tooltip. */
  ageHours?: number;
  /** For 'error': human-readable failure message; falls back to a default. */
  errorMessage?: string;
  /** For 'error': callback when the user clicks "Retry". */
  retry?: () => void;
  /** Children render as-is on 'ok' / 'stale'; hidden on 'loading' / 'error'. */
  children: ReactNode;
}

function StaleDot({ ageHours }: { ageHours?: number }) {
  const hrs = ageHours == null ? null : Math.round(ageHours);
  const tooltip = hrs == null
    ? 'data is stale'
    : `data is ${hrs} hour${hrs === 1 ? '' : 's'} old`;
  return (
    <span
      data-testid="datastate-stale-dot"
      title={tooltip}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--amber)',
        zIndex: 1,
      }}
    />
  );
}

function LoadingSkeleton() {
  // Three thin animated bars to suggest the shape of an upcoming readout. No
  // spinner — spinners falsely imply "in flight"; skeletons read as "soon".
  return (
    <div
      data-testid="datastate-loading"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div className="skeleton" style={{ height: 12, width: '40%' }} />
      <div className="skeleton" style={{ height: 24, width: '70%' }} />
      <div className="skeleton" style={{ height: 12, width: '55%' }} />
    </div>
  );
}

function ErrorState({ errorMessage, retry }: { errorMessage?: string; retry?: () => void }) {
  const msg = errorMessage ?? 'Could not load data.';
  return (
    <div
      data-testid="datastate-error"
      role="alert"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        data-testid="datastate-error-dot"
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--rose)',
          flexShrink: 0,
        }}
      />
      <span>{msg}</span>
      {retry && (
        <button
          type="button"
          onClick={retry}
          data-testid="datastate-retry"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
            color: 'var(--mint)',
            cursor: 'pointer',
            borderBottom: '1px dotted var(--mint)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function DataState({
  status,
  ageHours,
  errorMessage,
  retry,
  children,
}: DataStateProps) {
  if (status === 'loading') return <LoadingSkeleton />;
  if (status === 'error') return <ErrorState errorMessage={errorMessage} retry={retry} />;
  if (status === 'stale') {
    return (
      <div data-testid="datastate-stale" style={{ position: 'relative' }}>
        <StaleDot ageHours={ageHours} />
        {children}
      </div>
    );
  }
  // 'ok' — children pass-through, no wrapper element so existing layouts are
  // not perturbed.
  return <>{children}</>;
}
