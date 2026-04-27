/**
 * Regulatory feed loader.
 *
 * Reads data/regulatory_feed.json at build time, validates against the v1.0
 * schema, and returns a tagged result. Callers handle three outcomes:
 *  - { ok: true, feed }                       — normal render path
 *  - { ok: false, reason: 'schema-major-mismatch' }
 *  - { ok: false, reason: 'schema-shape-mismatch' }
 *  - { ok: false, reason: 'feed-missing' }
 *
 * The feed contract lives at docs/contracts/regulatory-feed/HANDOVER.md.
 * Disclaimer required by §5: "Informational only. Not legal advice."
 */
import {
  SUPPORTED_MAJOR,
  feedSchema,
  type RegulatoryFeed,
  type RegulatoryItem,
} from './regulatory-schema';

export type LoadResult =
  | { ok: true; feed: RegulatoryFeed }
  | { ok: false; reason: 'schema-major-mismatch'; schemaVersion: string }
  | { ok: false; reason: 'schema-shape-mismatch'; issuesSummary: string }
  | { ok: false; reason: 'feed-missing' };

export const DISCLAIMER =
  'Informational only. Not legal advice. Speak to qualified counsel for any specific matter.';

let cached: LoadResult | null = null;

export function loadRegulatoryFeed(): LoadResult {
  if (cached !== null) return cached;

  let raw: unknown;
  try {
    // Static import via require so missing-file fails into the catch.
    // require() at build time embeds the JSON into the bundle (Next.js handles).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    raw = require('@/data/regulatory_feed.json');
  } catch {
    cached = { ok: false, reason: 'feed-missing' };
    return cached;
  }

  const major = String(
    (raw as { schema_version?: unknown })?.schema_version ?? '',
  ).split('.')[0];
  if (major !== SUPPORTED_MAJOR) {
    cached = {
      ok: false,
      reason: 'schema-major-mismatch',
      schemaVersion: String(
        (raw as { schema_version?: unknown })?.schema_version ?? 'missing',
      ),
    };
    return cached;
  }

  const result = feedSchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    cached = {
      ok: false,
      reason: 'schema-shape-mismatch',
      issuesSummary: summary,
    };
    return cached;
  }

  cached = { ok: true, feed: result.data };
  return cached;
}

/** Sort items per HANDOVER §4: scan_date desc, then impact desc, then event_date desc. */
const IMPACT_ORDER: Record<RegulatoryItem['impact'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};
export function sortItems(items: RegulatoryItem[]): RegulatoryItem[] {
  return [...items].sort((a, b) => {
    if (a.scan_date !== b.scan_date) return a.scan_date < b.scan_date ? 1 : -1;
    if (a.impact !== b.impact) return IMPACT_ORDER[b.impact] - IMPACT_ORDER[a.impact];
    if (a.event_date !== b.event_date) return a.event_date < b.event_date ? 1 : -1;
    return 0;
  });
}

/** Group sorted items by scan_date (week-of header). */
export function groupByWeek(items: RegulatoryItem[]): Array<{
  scanDate: string;
  items: RegulatoryItem[];
}> {
  const groups: Map<string, RegulatoryItem[]> = new Map();
  for (const item of items) {
    const list = groups.get(item.scan_date) ?? [];
    list.push(item);
    groups.set(item.scan_date, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([scanDate, list]) => ({ scanDate, items: list }));
}

/** Sentiment mapping per design tokens: high=negative(rose), medium=caution(amber), low=neutral. */
export function impactSentiment(
  impact: RegulatoryItem['impact'],
): 'negative' | 'caution' | 'neutral' {
  if (impact === 'high') return 'negative';
  if (impact === 'medium') return 'caution';
  return 'neutral';
}
