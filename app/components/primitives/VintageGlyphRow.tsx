'use client';

// Phase 8.3b — VintageGlyphRow.
// O / D / F / M provenance row. The vintage glyph is a 1-letter pill; the
// active vintage is filled with the matching token color, the rest are ghosted.
// Standalone version for cards where MetricTile is overkill but provenance is
// still required (per N-1).
//
//   O  observed   mint (filled)
//   D  derived    mint (outlined)
//   F  forecast   lavender (outlined)
//   M  model      lavender (dashed)

export type Vintage = 'observed' | 'derived' | 'forecast' | 'model';

export interface VintageGlyphRowProps {
  active: Vintage;
  size?: number;
}

export const VINTAGE_ORDER: readonly Vintage[] = ['observed', 'derived', 'forecast', 'model'];

const VINTAGE_LETTER: Record<Vintage, string> = {
  observed: 'O',
  derived:  'D',
  forecast: 'F',
  model:    'M',
};

export interface VintageStyle {
  /** Token name for the active fill. */
  fill: string;
  /** Token name for the active border. */
  border: string;
  /** Whether the active border is dashed. */
  dashed?: boolean;
  /** Active text color. */
  activeText: string;
}

export const VINTAGE_STYLE: Record<Vintage, VintageStyle> = {
  observed: { fill: 'var(--mint)',     border: 'var(--mint)',     activeText: 'var(--white)' },
  derived:  { fill: 'transparent',     border: 'var(--mint)',     activeText: 'var(--mint)' },
  forecast: { fill: 'transparent',     border: 'var(--lavender)', activeText: 'var(--lavender)' },
  model:    { fill: 'transparent',     border: 'var(--lavender)', dashed: true, activeText: 'var(--lavender)' },
};

export function VintageGlyphRow({ active, size = 16 }: VintageGlyphRowProps) {
  return (
    <span
      role="img"
      aria-label={`Vintage: ${active}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {VINTAGE_ORDER.map((v) => {
        const isActive = v === active;
        const style = VINTAGE_STYLE[v];
        return (
          <span
            key={v}
            data-vintage={v}
            data-active={isActive ? 'true' : 'false'}
            title={v}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              fontSize: Math.max(8, Math.round(size * 0.55)),
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: isActive ? style.activeText : 'var(--text-muted)',
              border: `1px ${style.dashed ? 'dashed' : 'solid'} ${isActive ? style.border : 'var(--border-card)'}`,
              backgroundColor: isActive ? style.fill : 'transparent',
              borderRadius: 999,
              opacity: isActive ? 1 : 0.55,
              letterSpacing: 0,
            }}
          >
            {VINTAGE_LETTER[v]}
          </span>
        );
      })}
    </span>
  );
}
