'use client';

import { useState, useEffect, useMemo } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ─── Intelligence item model ──────────────────────────────────────────────────

type Category = 'revenue' | 'competition' | 'buildability' | 'market_design' | 'cost' | 'demand' | 'watchlist';
type Impact = 'positive' | 'negative' | 'mixed' | 'neutral' | 'watch';
type Horizon = 'immediate' | 'near_term' | 'structural' | 'long_term';

interface IntelItem {
  id: string;
  title: string;
  summary?: string;
  primaryCategory: Category;
  secondaryTags?: string[];
  sourceName: string;
  sourceUrl?: string;
  publishedAt: string;
  whyItMatters: string;
  impact: Impact;
  horizon: Horizon;
  referenceAssetNote?: string;
  geography?: string;
  confidence?: 'high' | 'medium' | 'low';
  isPinned?: boolean;
}

// ─── Hardcoded seed items — real Baltic BESS developments ─────────────────────
// These will be replaced by live enriched data from the /curations endpoint
// when the enrichment pipeline is built. Structure matches IntelItem exactly.

const SEED_ITEMS: IntelItem[] = [
  {
    id: 'seed-1',
    title: 'E energija 65MW/130MWh BESS enters Lithuanian balancing market',
    summary: 'E energija has commissioned its 65MW/130MWh battery storage system near Vilnius and begun participating in Lithuanian aFRR and mFRR markets. This is the first large-scale commercial BESS operating in the Baltic balancing market, providing the first real evidence of clearing prices and activation rates.',
    primaryCategory: 'competition',
    sourceName: 'E energija / Litgrid',
    publishedAt: '2026-02-28',
    whyItMatters: 'First large-scale commercial BESS in Lithuania — marks the start of Baltic balancing market deepening',
    impact: 'mixed',
    horizon: 'immediate',
    referenceAssetNote: 'Validates the market and begins real price discovery in aFRR/mFRR',
    geography: 'Lithuania',
    confidence: 'high',
    isPinned: true,
  },
  {
    id: 'seed-2',
    title: 'Ignitis announces 291MW/582MWh across three Baltic BESS sites, targeting 2027 COD',
    summary: 'Ignitis Group confirmed plans for three battery storage projects totalling 291MW/582MWh across Lithuania. Sites include Vilnius region (100MW), Kaunas region (100MW), and Klaipeda region (91MW). All target 2027 commercial operation, contingent on grid connection timelines.',
    primaryCategory: 'competition',
    sourceName: 'Ignitis Group',
    publishedAt: '2026-02-15',
    whyItMatters: 'Largest announced Baltic BESS programme — 582 MWh across three sites, targeting 2027 COD',
    impact: 'mixed',
    horizon: 'near_term',
    referenceAssetNote: 'Supply/demand ratio approaches 1.0 if all three sites deliver on schedule',
    geography: 'Lithuania',
    confidence: 'high',
    isPinned: true,
  },
  {
    id: 'seed-3',
    title: 'Lithuania–Germany 2GW offshore wind interconnector declared project of common interest',
    summary: 'The European Commission declared the planned Lithuania–Germany subsea interconnector a Project of Common Interest (PCI), unlocking EU co-financing for feasibility studies. The 2GW HVDC link would connect Lithuanian offshore wind to the German market. Timeline: earliest operational date 2032–2035.',
    primaryCategory: 'revenue',
    sourceName: 'European Commission / Litgrid',
    publishedAt: '2026-02-20',
    whyItMatters: 'New 2GW export corridor — may reshape Lithuanian price spreads post-2032, no near-term flow impact',
    impact: 'mixed',
    horizon: 'long_term',
    referenceAssetNote: 'Relevant for long-duration asset value post-2032, not for 2027 COD decisions',
    geography: 'Lithuania / Germany',
    confidence: 'medium',
    isPinned: true,
  },
  {
    id: 'seed-4',
    title: 'Lithuanian balancing cost allocation shifts — producers cover 30% from January 2026',
    summary: 'VERT confirmed the updated balancing cost allocation methodology. From January 2026, generation and storage assets bear 30% of system balancing costs, up from 0%. This changes the net revenue calculation for all market participants including BESS operators.',
    primaryCategory: 'market_design',
    sourceName: 'VERT.lt',
    publishedAt: '2026-01-10',
    whyItMatters: 'Storage operators now bear 30% of system balancing costs — changes net revenue calculation',
    impact: 'negative',
    horizon: 'immediate',
    referenceAssetNote: 'Adds ~€3–5k/MW/yr to operating costs depending on balancing volume',
    geography: 'Lithuania',
    confidence: 'high',
  },
  {
    id: 'seed-5',
    title: 'Lithuania BESS investment support scheme 2x oversubscribed',
    summary: 'The Lithuanian Energy Agency reported that applications for the BESS capital expenditure support scheme exceeded available funding by 2.1x. The scheme offers up to 45% co-financing for battery storage projects. Oversubscription signals strong developer interest but may accelerate grid queue congestion.',
    primaryCategory: 'buildability',
    sourceName: 'Lithuanian Energy Agency',
    publishedAt: '2026-01-25',
    whyItMatters: '2.1x oversubscription signals strong developer interest — may accelerate grid queue congestion',
    impact: 'mixed',
    horizon: 'near_term',
    geography: 'Lithuania',
    confidence: 'high',
  },
  {
    id: 'seed-6',
    title: 'NordBalt maintenance outage confirmed for Q2 2026 — 6 weeks offline',
    summary: 'Litgrid confirmed a scheduled 6-week NordBalt maintenance outage beginning April 2026. The 700MW Sweden–Lithuania interconnector will be fully offline during this period. Historical precedent: NordBalt outages have widened Lithuanian day-ahead spreads by 15–25% due to reduced import capacity from Sweden (SE4).',
    primaryCategory: 'revenue',
    sourceName: 'Litgrid / NordBalt',
    publishedAt: '2026-03-01',
    whyItMatters: '700MW Sweden–Lithuania link offline for 6 weeks — historical precedent: 15–25% wider DA spreads',
    impact: 'positive',
    horizon: 'near_term',
    referenceAssetNote: 'Wider spreads during outage window support arbitrage capture',
    geography: 'Lithuania / Sweden',
    confidence: 'high',
  },
  {
    id: 'seed-7',
    title: 'EU ETS carbon allowance price stabilizes near €71/t after Q1 volatility',
    summary: 'EU ETS carbon prices settled near €71/t in early March 2026 after Q1 volatility driven by MSR intake adjustments. The sustained price floor supports gas peaker marginal costs, which anchors the P_high price used in BESS arbitrage revenue calculations.',
    primaryCategory: 'revenue',
    sourceName: 'ICE / energy-charts.info',
    publishedAt: '2026-03-05',
    whyItMatters: '€71/t carbon floor sustains gas peaker marginal costs — anchors peak-hour discharge economics',
    impact: 'positive',
    horizon: 'structural',
    geography: 'EU-wide',
    confidence: 'high',
  },
  {
    id: 'seed-8',
    title: 'BNEF 2025 pack survey: stationary LFP at $92/kWh global average',
    summary: 'BloombergNEF released its 2025 battery pack price survey showing stationary LFP cells at $92/kWh global average, down 12% year-on-year. However, Baltic installed costs remain dominated by grid connection scope, BoP, and EPC margins rather than cell prices alone.',
    primaryCategory: 'cost',
    sourceName: 'BloombergNEF',
    publishedAt: '2026-02-10',
    whyItMatters: 'LFP cells down 12% YoY to $92/kWh — but Baltic installed costs still dominated by grid/BoP scope',
    impact: 'positive',
    horizon: 'structural',
    referenceAssetNote: 'Equipment is ~60% of installed cost; grid scope remains the dominant CAPEX variable',
    geography: 'Global → Baltic',
    confidence: 'medium',
  },
];

// ─── Visual mappings ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Category, string> = {
  revenue: 'Revenue',
  competition: 'Competition',
  buildability: 'Buildability',
  market_design: 'Market Design',
  cost: 'Cost',
  demand: 'Demand',
  watchlist: 'Watchlist',
};

const CATEGORY_COLORS: Record<Category, string> = {
  revenue: 'var(--teal)',
  competition: 'var(--rose)',
  buildability: 'var(--amber)',
  market_design: 'rgba(140,160,220,0.85)',
  cost: 'rgba(180,160,100,0.85)',
  demand: 'rgba(140,200,180,0.85)',
  watchlist: 'var(--text-tertiary)',
};

const HORIZON_LABELS: Record<Horizon, string> = {
  immediate: 'Immediate',
  near_term: 'Near-term',
  structural: 'Structural',
  long_term: 'Long-term',
};

const FILTER_CATEGORIES: (Category | 'all')[] = [
  'all', 'revenue', 'competition', 'buildability', 'market_design', 'cost', 'demand', 'watchlist',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

// ─── Chip components ──────────────────────────────────────────────────────────

function HorizonChip({ horizon }: { horizon: Horizon }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-xs)',
      color: 'var(--text-muted)',
      letterSpacing: '0.04em',
    }}>
      {HORIZON_LABELS[horizon]}
    </span>
  );
}

function CategoryChip({ category }: { category: Category }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-xs)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: CATEGORY_COLORS[category],
      opacity: 0.7,
    }}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// ─── Pinned strip ─────────────────────────────────────────────────────────────

function PinnedStrip({ items }: { items: IntelItem[] }) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: '36px' }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: '14px',
        fontWeight: 500,
      }}>
        This week&apos;s market movers
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map(item => (
          <div
            key={item.id}
            style={{
              background: 'var(--bg-elevated)',
              padding: '16px 18px',
              borderRadius: '2px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-primary)',
              lineHeight: 1.45,
            }}>
              {item.title}
            </span>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              margin: 0,
            }}>
              {item.whyItMatters}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
              <CategoryChip category={item.primaryCategory} />
              <span style={{ color: 'var(--text-ghost)' }}>·</span>
              <HorizonChip horizon={item.horizon} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Intelligence row ─────────────────────────────────────────────────────────

function IntelRow({ item, isExpanded, onToggle }: {
  item: IntelItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border-card)',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '18px 0',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          width: '100%',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-primary)',
            lineHeight: 1.45,
            flex: 1,
          }}>
            {item.title}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-ghost)',
            flexShrink: 0,
          }}>
            {formatDate(item.publishedAt)}
          </span>
        </div>

        {/* Why it matters — always visible */}
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          margin: 0,
        }}>
          {item.whyItMatters}
        </p>

        {/* Tags row — category + horizon only */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginTop: '2px',
        }}>
          <CategoryChip category={item.primaryCategory} />
          <span style={{ color: 'var(--text-ghost)' }}>·</span>
          <HorizonChip horizon={item.horizon} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-ghost)',
            marginLeft: 'auto',
          }}>
            {item.sourceName}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{
          padding: '0 0 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          borderLeft: `2px solid ${CATEGORY_COLORS[item.primaryCategory]}`,
          marginLeft: '2px',
          paddingLeft: '14px',
        }}>
          {item.summary && (
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.7,
              margin: 0,
            }}>
              {item.summary}
            </p>
          )}

          {item.referenceAssetNote && (
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'rgba(0,180,160,0.65)',
              margin: 0,
              lineHeight: 1.5,
            }}>
              Reference asset: {item.referenceAssetNote}
            </p>
          )}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            {item.geography && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
              }}>
                {item.geography}
              </span>
            )}
            {item.confidence && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
              }}>
                Confidence: {item.confidence}
              </span>
            )}
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--teal)',
                  textDecoration: 'none',
                  opacity: 0.7,
                }}
              >
                Source ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntelFeed() {
  const [liveItems, setLiveItems] = useState<IntelItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Attempt to fetch enriched items from /curations endpoint
  useEffect(() => {
    fetch(`${WORKER_URL}/curations`)
      .then(r => r.json())
      .then((data: IntelItem[] | Record<string, unknown>[]) => {
        // Only accept items that have the enriched fields
        const enriched = (Array.isArray(data) ? data : []).filter(
          (item): item is IntelItem =>
            typeof item === 'object' &&
            item !== null &&
            'whyItMatters' in item &&
            'impact' in item &&
            'horizon' in item &&
            typeof (item as IntelItem).whyItMatters === 'string' &&
            (item as IntelItem).whyItMatters.length > 0
        );
        if (enriched.length > 0) setLiveItems(enriched);
      })
      .catch(() => {});
  }, []);

  // Use live enriched items if available, otherwise seed items
  const allItems = liveItems.length > 0 ? liveItems : SEED_ITEMS;
  const isUsingSeeds = liveItems.length === 0;

  // Separate pinned and unpinned
  const pinned = useMemo(() => allItems.filter(i => i.isPinned).slice(0, 3), [allItems]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};
    allItems.forEach(item => {
      counts[item.primaryCategory] = (counts[item.primaryCategory] ?? 0) + 1;
    });
    return counts;
  }, [allItems]);

  // Filtered items (excluding pinned from main list to avoid duplication)
  const filteredItems = useMemo(() => {
    const items = activeFilter === 'all'
      ? allItems
      : allItems.filter(i => i.primaryCategory === activeFilter);
    // If showing "all", exclude pinned items from main list (they appear in the strip)
    if (activeFilter === 'all' && pinned.length > 0) {
      const pinnedIds = new Set(pinned.map(p => p.id));
      return items.filter(i => !pinnedIds.has(i.id));
    }
    return items;
  }, [allItems, activeFilter, pinned]);

  return (
    <section style={{ width: '100%' }}>
      {/* Pinned editorial strip */}
      {activeFilter === 'all' && <PinnedStrip items={pinned} />}

      {/* Filter bar */}
      <nav aria-label="Intelligence filters" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {FILTER_CATEGORIES.map(cat => {
            const count = cat === 'all' ? allItems.length : (categoryCounts[cat] ?? 0);
            if (cat !== 'all' && count === 0) return null;
            const isActive = cat === activeFilter;
            const label = cat === 'all' ? 'All' : CATEGORY_LABELS[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                aria-pressed={isActive}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  letterSpacing: '0.06em',
                  padding: '5px 10px',
                  border: `1px solid ${isActive ? 'var(--border-highlight)' : 'var(--border-card)'}`,
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
              >
                {label}
                {cat !== 'all' && count > 0 && (
                  <span style={{ marginLeft: '5px', opacity: 0.5 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Intelligence list */}
      <div style={{ borderTop: '1px solid var(--border-card)' }}>
        {filteredItems.length === 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            padding: '24px 0',
            textAlign: 'center',
          }}>
            No {activeFilter !== 'all' ? CATEGORY_LABELS[activeFilter].toLowerCase() : ''} intelligence items.
            {activeFilter !== 'all' && (
              <span
                onClick={() => setActiveFilter('all')}
                style={{ color: 'var(--teal)', cursor: 'pointer', marginLeft: '6px', opacity: 0.7 }}
              >
                Show all
              </span>
            )}
          </div>
        )}

        {filteredItems.map(item => (
          <IntelRow
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}
      </div>

      {/* Provenance note */}
      {isUsingSeeds && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-ghost)',
          marginTop: '16px',
          letterSpacing: '0.04em',
        }}>
          Recent curated intelligence. Updated as new developments are assessed.
        </p>
      )}

      {/* CTA */}
      <div style={{
        marginTop: '28px',
        paddingTop: '20px',
        borderTop: '1px solid var(--border-card)',
      }}>
        <a
          href="mailto:kastytis@kkme.eu?subject=Market%20intelligence%20lead"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
            transition: 'color 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseOut={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          Have a development we should review? Submit a market lead ↗
        </a>
      </div>
    </section>
  );
}
