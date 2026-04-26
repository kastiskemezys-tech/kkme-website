'use client';

// Phase 7.7a (7.7.14) — market thickness chip for balancing-product tiles.
//
// Small inline badge that flags the depth of each Baltic balancing market.
// aFRR is thick (price-taker), mFRR is medium (bid-shading recommended),
// FCR is thin (price-taker assumption breaks for >50 MW). Surfacing this
// changes how an investor reads the headline numbers.

import { MARKET_THICKNESS, type ThicknessProduct } from '@/app/lib/financialDefinitions';

interface MarketThicknessChipProps {
  product: ThicknessProduct;
  /** Show the warning caption beneath the chip (mFRR + FCR only). */
  showCaption?: boolean;
}

const PRODUCT_LABEL: Record<ThicknessProduct, string> = {
  afrr: 'aFRR',
  mfrr: 'mFRR',
  fcr: 'FCR',
};

export function MarketThicknessChip({ product, showCaption = false }: MarketThicknessChipProps) {
  const spec = MARKET_THICKNESS[product];
  const label = PRODUCT_LABEL[product];

  return (
    <span title={spec.tooltip} style={{ display: 'inline-flex', flexDirection: 'column',
      alignItems: 'flex-start', gap: 2 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border-card)',
        borderRadius: 2, padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
      data-testid={`market-thickness-${product}`}
      data-thickness-level={spec.level}>
        {label} · {spec.level}
      </span>
      {showCaption && spec.caption && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.5625rem',
          color: 'var(--text-muted)', lineHeight: 1.3,
        }}>
          {spec.caption}
        </span>
      )}
    </span>
  );
}

export default MarketThicknessChip;
