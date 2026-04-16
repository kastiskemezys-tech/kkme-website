'use client';

import { useEffect, useRef } from 'react';
import { freshnessPulse } from '@/lib/animations';

export function FreshnessDot({ timestamp }: { timestamp?: string | null }) {
  const dotRef = useRef<HTMLSpanElement>(null);
  const prevTs  = useRef<string | null>(null);

  useEffect(() => {
    if (timestamp && timestamp !== prevTs.current) {
      freshnessPulse(dotRef.current);
      prevTs.current = timestamp;
    }
  }, [timestamp]);

  return (
    <span
      ref={dotRef}
      style={{
        display: 'inline-block',
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: 'var(--accent-green-bright)',
        marginRight: '5px',
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
    />
  );
}
