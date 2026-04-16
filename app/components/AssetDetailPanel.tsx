'use client';

import { useEffect, useCallback } from 'react';

export interface Asset {
  id: string;
  name: string;
  mw: number;
  mwh?: number;
  status: string;
  tech?: string;
  cod?: string;
  note?: string;
  source_url?: string;
}

interface AssetDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  assets: Asset[];
  notes?: string[];
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  operational: { color: 'var(--teal)', label: 'Operational' },
  under_construction: { color: 'var(--amber)', label: 'Construction' },
  commissioned: { color: 'var(--teal)', label: 'Commissioned' },
  connection_agreement: { color: 'var(--text-tertiary)', label: 'Agreement' },
  application: { color: 'var(--text-muted)', label: 'Application' },
  announced: { color: 'var(--text-ghost)', label: 'Announced' },
  pumped_hydro: { color: 'var(--amber)', label: 'Hydro' },
};

function StatusPill({ status, tech }: { status: string; tech?: string }) {
  const display = tech === 'pumped_hydro' ? 'pumped_hydro' : status;
  const s = STATUS_STYLE[display] || STATUS_STYLE.announced;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.5625rem',
      color: s.color,
      border: `1px solid ${s.color}`,
      padding: '1px 4px',
      borderRadius: '2px',
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

export function AssetDetailPanel({ isOpen, onClose, title, subtitle, assets, notes }: AssetDetailPanelProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const totalMw = assets.reduce((sum, a) => sum + a.mw, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--map-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-page)',
          border: '1px solid var(--border-highlight)',
          borderRadius: '4px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <h4 style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              margin: 0,
            }}>
              {title}
            </h4>
            {subtitle && (
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                margin: '4px 0 0',
              }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              all: 'unset',
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 6px',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ×
          </button>
        </div>

        {/* Summary */}
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          marginBottom: '12px',
        }}>
          {assets.length} assets · {totalMw.toLocaleString('en-GB')} MW total
        </p>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 55px 60px auto',
          gap: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.5625rem',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '4px 0',
          borderBottom: '1px solid var(--border-card)',
          marginBottom: '2px',
        }}>
          <span>Name</span>
          <span style={{ textAlign: 'right' }}>MW</span>
          <span style={{ textAlign: 'right' }}>MWh</span>
          <span>Status</span>
        </div>

        {/* Asset rows */}
        {assets.map(asset => (
          <div
            key={asset.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 55px 60px auto',
              gap: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              padding: '6px 0',
              borderBottom: '1px solid var(--bg-card)',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              {asset.source_url ? (
                <a
                  href={asset.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--teal)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  {asset.name} ↗
                </a>
              ) : asset.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{asset.mw}</span>
            <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{asset.mwh ?? '—'}</span>
            <StatusPill status={asset.status} tech={asset.tech} />
          </div>
        ))}

        {/* Notes */}
        {notes && notes.length > 0 && (
          <div style={{
            marginTop: '16px',
            padding: '8px 10px',
            borderLeft: '2px solid var(--amber-subtle)',
          }}>
            {notes.map((note, i) => (
              <p key={i} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                margin: i > 0 ? '6px 0 0' : 0,
              }}>
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Asset notes inline */}
        {assets.filter(a => a.note).length > 0 && (
          <div style={{ marginTop: '12px' }}>
            {assets.filter(a => a.note).map(a => (
              <p key={a.id} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                marginBottom: '4px',
                opacity: 0.7,
              }}>
                {a.name}: {a.note}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
