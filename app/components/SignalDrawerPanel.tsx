'use client';

import { useState, useEffect, useCallback } from 'react';
import { useIsDesktop } from '@/app/lib/useIsDesktop';

interface SignalDrawerEvent {
  signal: 's1' | 's2';
  action: 'open' | 'close';
}

export function SignalDrawerPanel() {
  const [activeTab, setActiveTab] = useState<'s1' | 's2' | null>(null);
  const isDesktop = useIsDesktop();

  const handleEvent = useCallback((e: Event) => {
    const { signal, action } = (e as CustomEvent<SignalDrawerEvent>).detail;
    if (action === 'open') {
      setActiveTab(signal);
    } else if (action === 'close') {
      setActiveTab(prev => {
        if (prev !== signal) return prev;
        // Check if the other drawer has content
        const other = signal === 's1' ? 's2' : 's1';
        const otherSlot = document.getElementById(`signal-drawer-${other}`);
        if (otherSlot && otherSlot.children.length > 0) return other;
        return null;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('signal-drawer', handleEvent);
    return () => window.removeEventListener('signal-drawer', handleEvent);
  }, [handleEvent]);

  if (!activeTab || !isDesktop) return null;

  return (
    <div style={{
      marginTop: '24px',
      border: '1px solid var(--border-highlight)',
      borderRadius: '4px',
      overflow: 'hidden',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {([
          { id: 's1' as const, label: 'DA Capture Detail' },
          { id: 's2' as const, label: 'Balancing Market Detail' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeTab === tab.id) {
                setActiveTab(null);
                window.dispatchEvent(new CustomEvent('signal-drawer-request', {
                  detail: { signal: tab.id, action: 'close' },
                }));
              } else {
                setActiveTab(tab.id);
                window.dispatchEvent(new CustomEvent('signal-drawer-request', {
                  detail: { signal: tab.id },
                }));
              }
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: activeTab === tab.id ? 'var(--bg-card-highlight)' : 'var(--bg-elevated)',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--teal)' : '2px solid transparent',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — portal targets */}
      <div style={{ padding: '24px' }}>
        <div
          id="signal-drawer-s1"
          style={{ display: activeTab === 's1' ? 'block' : 'none' }}
        />
        <div
          id="signal-drawer-s2"
          style={{ display: activeTab === 's2' ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
}
