// Intel feed helpers: source classification, domain extraction,
// magnitude regex extraction, relative date formatting, featured scoring.

export type SourceType = 'primary' | 'trade_press' | 'company' | 'uncurated';

const PRIMARY_DOMAINS = [
  'litgrid.eu', 'ast.lv', 'elering.ee', 'entsoe.eu', 'acer.europa.eu',
  'ec.europa.eu', 'europa.eu', 'lrv.lt', 'vert.lt', 'apva.lrv.lt',
  'nordpoolgroup.com', 'ena.lt', 'aib-net.org',
];

const TRADE_PRESS_HINTS = [
  'montel', 'argusmedia', 'spglobal', 'reuters', 'bloomberg', 'ft.com',
  'energy-storage.news', 'pv-magazine', 'reneweconomy', 'offshorewind.biz',
  'energymonitor', 'rechargenews', 'windpowermonthly', 'bnef', 'mckinsey.com',
];

const COMPANY_PATH_HINTS = ['/press', '/news', '/media', '/newsroom', '/investor'];

export function extractDomain(sourceUrl: string | undefined | null): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function classifySource(
  sourceName: string,
  sourceUrl?: string,
  sourceQuality?: string,
): SourceType {
  const domain = extractDomain(sourceUrl);
  const nameLc = sourceName.toLowerCase();

  // Worker-provided source_quality is authoritative when usable.
  if (sourceQuality === 'tso_regulator' || sourceQuality === 'official_publication') {
    return 'primary';
  }

  if (domain) {
    if (PRIMARY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return 'primary';
    if (TRADE_PRESS_HINTS.some(h => domain.includes(h))) return 'trade_press';
    if (sourceUrl && COMPANY_PATH_HINTS.some(p => sourceUrl.toLowerCase().includes(p))) return 'company';
  }

  // Name-based fallback for primary Baltic sources without a URL.
  if (['litgrid', 'ast', 'elering', 'vert.lt', 'apva', 'entso-e', 'entsoe'].some(n => nameLc.includes(n))) {
    return 'primary';
  }

  return sourceUrl ? 'company' : 'uncurated';
}

export function formatRelativeDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours < 24 && diffHours >= 0) {
    return diffHours < 12 ? 'today' : 'yesterday';
  }
  if (diffDays < 2) return 'yesterday';
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (diffDays < 90) {
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface Magnitude {
  raw: string;        // original matched substring, normalized sign
  value: number;      // numeric value (signed)
  unit: string;       // MW, MWh, €/MWh, %, etc.
  sign: 'positive' | 'negative' | 'neutral';
}

const UNIT_PATTERN =
  'MWh|GWh|TWh|MW|GW|kW|kWh|€/MWh|€/MW|€M|€\\/MWh|%|bps|MVA|pp';

const MAG_REGEX = new RegExp(
  `([+\\-−—])?\\s*(\\d{1,4}(?:[,.\\s]\\d{3})*(?:\\.\\d+)?)(?:\\s?[xX]|\\s?×)?\\s?(${UNIT_PATTERN})`,
);

export function extractMagnitude(text: string | undefined | null): Magnitude | null {
  if (!text) return null;
  const m = text.match(MAG_REGEX);
  if (!m) return null;
  const rawSign = m[1];
  const rawNum = m[2].replace(/[\s,]/g, '');
  const unit = m[3];
  const num = Number(rawNum);
  if (!Number.isFinite(num)) return null;

  let sign: Magnitude['sign'] = 'neutral';
  let signed = num;
  if (rawSign === '-' || rawSign === '−' || rawSign === '—') {
    sign = 'negative';
    signed = -num;
  } else if (rawSign === '+') {
    sign = 'positive';
  }

  const displayNum = rawNum.replace(/(\d)(?=(\d{3})+$)/g, '$1,');
  const raw = `${sign === 'negative' ? '−' : sign === 'positive' ? '+' : ''}${displayNum} ${unit}`;

  return { raw, value: signed, unit, sign };
}

// Featured scoring — weights from phase 3c/3d brief.
const IMPACT_WEIGHT: Record<string, number> = {
  positive: 1.0, negative: 1.0, mixed: 0.7, watch: 0.5, neutral: 0.3,
};
const SOURCE_WEIGHT: Record<SourceType, number> = {
  primary: 1.0, trade_press: 0.7, company: 0.5, uncurated: 0.2,
};

export function featuredScore(opts: {
  publishedAt: string;
  impact?: string;
  sourceType: SourceType;
  isPinned?: boolean;
}): number {
  if (opts.isPinned) return Infinity;
  const d = new Date(opts.publishedAt);
  const daysSince = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  const recency = Number.isFinite(daysSince) && daysSince >= 0
    ? Math.exp(-daysSince / 14)
    : 0;
  const impactScore = IMPACT_WEIGHT[opts.impact ?? 'neutral'] ?? 0.3;
  const sourceScore = SOURCE_WEIGHT[opts.sourceType] ?? 0.2;
  return 0.5 * recency + 0.3 * impactScore + 0.2 * sourceScore;
}

export const FEATURED_SCORE_FLOOR = 0.4;
