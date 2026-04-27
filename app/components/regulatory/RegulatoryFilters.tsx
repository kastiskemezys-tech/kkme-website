/**
 * Filter chips for /regulatory archive. Client component.
 *
 * Reads/writes URL search params: ?impact=high&category=grid_connection&tag=bess
 * Permalinkable per HANDOVER §4.6 + master plan N-9 (URL-encoded scenarios).
 */
'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { type Impact } from '@/lib/regulatory-schema';

interface Props {
  impactCounts: Record<Impact, number>;
  categories: Array<{ value: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
}

const IMPACT_LABEL: Record<Impact, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function RegulatoryFilters({ impactCounts, categories, tags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeImpact = searchParams.get('impact') ?? '';
  const activeCategory = searchParams.get('category') ?? '';
  const activeTag = searchParams.get('tag') ?? '';

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === '' || next.get(key) === value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const hasFilters = Boolean(activeImpact || activeCategory || activeTag);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px 0',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '24px',
      }}
    >
      <FilterRow label="Impact">
        {(Object.keys(IMPACT_LABEL) as Impact[]).map((k) => (
          <Chip
            key={k}
            label={IMPACT_LABEL[k]}
            count={impactCounts[k] ?? 0}
            active={activeImpact === k}
            onClick={() => setParam('impact', k)}
          />
        ))}
      </FilterRow>

      <FilterRow label="Category">
        {categories.map((c) => (
          <Chip
            key={c.value}
            label={c.value.replace(/_/g, ' ')}
            count={c.count}
            active={activeCategory === c.value}
            onClick={() => setParam('category', c.value)}
          />
        ))}
      </FilterRow>

      <FilterRow label="Tag">
        {tags.slice(0, 12).map((t) => (
          <Chip
            key={t.value}
            label={t.value.replace(/_/g, ' ')}
            count={t.count}
            active={activeTag === t.value}
            onClick={() => setParam('tag', t.value)}
          />
        ))}
      </FilterRow>

      {hasFilters ? (
        <button
          onClick={clearAll}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          minWidth: '64px',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        background: active
          ? 'color-mix(in srgb, var(--teal) 8%, transparent)'
          : 'transparent',
        border: `1px solid ${
          active
            ? 'color-mix(in srgb, var(--teal) 40%, transparent)'
            : 'var(--border-subtle)'
        }`,
        color: active ? 'var(--teal)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        letterSpacing: '0.04em',
        cursor: 'pointer',
        transition: 'all 150ms',
      }}
    >
      {label}
      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
        {count}
      </span>
    </button>
  );
}
