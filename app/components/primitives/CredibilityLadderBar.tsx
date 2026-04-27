'use client';

// Phase 8.3b — CredibilityLadderBar.
// Horizontal stacked bars from most-aspirational (top) to most-real (bottom).
// Width proportional to MW within the ordered set; color gradient lavender →
// mint (aspirational → real). Reusable across pipeline cards, project counts,
// asset funnel.
//
// Phase 7.7e — per-tier hover wired through the unified ChartTooltip primitive
// (label as headline; MW as value; % of pipeline as secondary).

import { ChartTooltip, useChartTooltipState } from './ChartTooltip';

export interface CredibilityLadderTier {
  label: string;
  mw: number;
  href?: string;
}

export interface CredibilityLadderBarProps {
  tiers: CredibilityLadderTier[];
  width?: number;
  height?: number;
}

export function ladderTotal(tiers: CredibilityLadderTier[]): number {
  let s = 0;
  for (const t of tiers) s += Math.max(0, t.mw);
  return s;
}

export function ladderTierLayout(
  tiers: CredibilityLadderTier[],
  width: number,
): Array<{ tier: CredibilityLadderTier; widthPx: number; pct: number; color: string }> {
  const max = tiers.reduce((m, t) => Math.max(m, t.mw), 0) || 1;
  const total = ladderTotal(tiers) || 1;
  const n = Math.max(1, tiers.length - 1);
  return tiers.map((tier, i) => {
    // Linear ramp top→bottom from lavender (i=0) → mint (i=n-1).
    const t = n === 0 ? 0 : i / n;
    const color = t < 0.5 ? 'var(--lavender)' : 'var(--mint)';
    const widthPx = (Math.max(0, tier.mw) / max) * width;
    const pct = (Math.max(0, tier.mw) / total) * 100;
    return { tier, widthPx, pct, color };
  });
}

export function CredibilityLadderBar({
  tiers,
  width = 220,
  height = 10,
}: CredibilityLadderBarProps) {
  const layout = ladderTierLayout(tiers, width);
  const total = ladderTotal(tiers);
  const tt = useChartTooltipState();

  return (
    <div
      role="img"
      aria-label={`Credibility ladder: ${tiers.length} tiers, total ${total} MW`}
      onMouseLeave={() => tt.hide()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        width,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
      }}
    >
      {layout.map(({ tier, widthPx, pct, color }) => {
        const showTooltip = (e: React.MouseEvent) => tt.show({
          label: tier.label,
          value: tier.mw,
          unit: 'MW',
          secondary: [{ label: 'Of pipeline', value: pct, unit: '%' }],
        }, e.clientX, e.clientY);
        const bar = (
          <div
            data-tier={tier.label}
            onMouseEnter={showTooltip}
            onMouseMove={showTooltip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: tier.href ? 'pointer' : 'default',
            }}
          >
            <span
              style={{
                color: 'var(--text-tertiary)',
                width: 110,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0,
              }}
            >
              {tier.label}
            </span>
            <span
              style={{
                display: 'inline-block',
                width: widthPx,
                height,
                background: color,
                opacity: 0.55,
                borderRadius: 1,
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>
              {tier.mw.toLocaleString()} MW
            </span>
          </div>
        );
        return tier.href ? (
          <a
            key={tier.label}
            href={tier.href}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            {bar}
          </a>
        ) : (
          <div key={tier.label}>{bar}</div>
        );
      })}
      <ChartTooltip
        visible={tt.state.visible}
        x={tt.state.x}
        y={tt.state.y}
        value={tt.state.data?.value ?? 0}
        unit={tt.state.data?.unit ?? ''}
        date={tt.state.data?.date}
        time={tt.state.data?.time}
        label={tt.state.data?.label}
        secondary={tt.state.data?.secondary}
        source={tt.state.data?.source}
      />
    </div>
  );
}
