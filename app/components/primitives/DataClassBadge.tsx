'use client';

import type { DataClass } from '@/app/lib/types';

interface DataClassBadgeProps {
  dataClass: DataClass
}

export function DataClassBadge({ dataClass }: DataClassBadgeProps) {
  if (dataClass === 'observed') return null;

  const isProxy = dataClass === 'proxy';

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-xs)',
      color: isProxy ? 'var(--amber)' : 'var(--text-muted)',
    }}>
      {isProxy ? 'proxy \u26A0' : dataClass === 'reference' ? 'ref' : dataClass}
    </span>
  );
}
