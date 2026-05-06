'use client';

interface SourceFooterProps {
  source: string
  sourceUrl?: string
  updatedAt?: string
  dataClass?: string
  methodologyLink?: string
}

// Map known source names to URLs
const SOURCE_URL_MAP: Record<string, string> = {
  'ENTSO-E': 'https://transparency.entsoe.eu/',
  'ENTSO-E Transparency': 'https://transparency.entsoe.eu/',
  'ENTSO-E A44': 'https://transparency.entsoe.eu/transmission-domain/r2/dayAheadPrices/show',
  'ENTSO-E A11': 'https://transparency.entsoe.eu/',
  'BTD': 'https://baltictransparency.org/',
  'NVE': 'https://www.nve.no/energi/analyser-og-statistikk/magasinstatistikk/',
  'energy-charts.info': 'https://www.energy-charts.info/',
  'ECB': 'https://data.ecb.europa.eu/',
  'VERT.lt ArcGIS': 'https://atviri-litgrid.hub.arcgis.com/',
  'VERT.lt': 'https://atviri-litgrid.hub.arcgis.com/',
  'Litgrid': 'https://www.litgrid.eu/',
  'APVA': 'https://apva.lrv.lt/',
  'ESO': 'https://www.eso.lt/verslui/elektra/elektros-liniju-zemelapiai/transformatoriu-pastociu-laisvu-galiu-zemelapis-vartotojams/3931',
};

function resolveSourceUrl(source: string, explicitUrl?: string): string | null {
  if (explicitUrl) return explicitUrl;
  // Try exact match first
  if (SOURCE_URL_MAP[source]) return SOURCE_URL_MAP[source];
  // Try each part (source might be "ENTSO-E A44 · BTD")
  for (const part of source.split(/\s*·\s*/)) {
    const trimmed = part.trim();
    if (SOURCE_URL_MAP[trimmed]) return SOURCE_URL_MAP[trimmed];
  }
  return null;
}

export function SourceFooter({ source, sourceUrl, updatedAt, dataClass, methodologyLink }: SourceFooterProps) {
  const url = resolveSourceUrl(source, sourceUrl);

  // Phase 18 — bracket-notation: [src] sourceName · [as-of] timestamp · [class]
  const bracketStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    letterSpacing: '0.08em',
  };

  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-sm)',
      color: 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      flexWrap: 'wrap',
      letterSpacing: '0.04em',
    }}>
      <span style={bracketStyle}>[src]</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'inherit',
            textDecoration: 'none',
            borderBottom: '1px dotted var(--text-muted)',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'inherit')}
        >
          {source} ↗
        </a>
      ) : <span>{source}</span>}
      {updatedAt && updatedAt !== '—' && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={bracketStyle}>[as-of]</span>
          <span>{updatedAt}</span>
        </>
      )}
      {dataClass && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={bracketStyle}>[{dataClass}]</span>
        </>
      )}
      {methodologyLink && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <a
            href={methodologyLink}
            style={{
              color: 'var(--teal)',
              textDecoration: 'none',
            }}
          >
            ↗ methodology
          </a>
        </>
      )}
    </div>
  );
}
