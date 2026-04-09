'use client';

interface Tab {
  id: string;
  label: string;
}

interface DrawerTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export default function DrawerTabs({ tabs, active, onChange }: DrawerTabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: '24px',
        borderBottom: '1px solid var(--border-card)',
        marginBottom: '20px',
        marginTop: '8px',
        paddingBottom: '0',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: isActive
                ? '2px solid var(--teal)'
                : '2px solid transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '8px 0',
              marginBottom: '-1px',
              cursor: 'pointer',
              transition: 'color 120ms ease, border-color 120ms ease',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
