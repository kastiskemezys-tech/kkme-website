// Phase 4F — feed quality gates (mirror of workers/fetch-s1.js helpers).
//
// The worker holds the canonical implementation; this file mirrors the
// constants and pure functions for vitest coverage. A parity-check test
// guarantees the worker stays in sync (see app/lib/__tests__/feedSourceQuality.test.ts).

export type FeedSourceTier = 'tier1' | 'tier2' | 'outside';

export type FeedGateOk = { ok: true; tier: FeedSourceTier; score: number };
export type FeedGateFail = { ok: false; reason: string; tier: FeedSourceTier; score: number };
export type FeedGateResult = FeedGateOk | FeedGateFail;

// Hard-deny: items from these domains never reach a published feed.
export const FEED_SOURCE_DENYLIST: ReadonlySet<string> = new Set([
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'wordpress.com',
  'blogspot.com',
  'substack.com',
  'researchgate.net',
  'academia.edu',
]);

// Tier 1 (TSO / regulator / ministry) — auto-pass topic gate.
export const FEED_SOURCE_TSO_REGULATOR: ReadonlySet<string> = new Set([
  'litgrid.lt',
  'litgrid.eu',
  'ast.lv',
  'elering.ee',
  'entsoe.eu',
  'apva.lt',
  'apva.lrv.lt',
  'vert.lt',
  'am.lrv.lt',
  'rrt.lt',
  'em.gov.lv',
  'ec.europa.eu',
  'acer.europa.eu',
]);

// Tier 2 (trade press / market data) — denylist passes, topic gate ≥1.
export const FEED_SOURCE_TRADE_PRESS: ReadonlySet<string> = new Set([
  'nordpoolgroup.com',
  'montelnews.com',
  'energy-storage.news',
  'pv-magazine.com',
  'reuters.com',
  'bloomberg.com',
  's-and-p.com',
  'spglobal.com',
]);

export const BESS_TOPIC_KEYWORDS: readonly string[] = [
  'bess',
  'battery storage',
  'energy storage',
  'akumuliator',
  'akumuliuoja',
  'kaupimo paj',
  'storage capacity',
  'balancing',
  'afrr',
  'mfrr',
  'fcr',
  'frr',
  'reserve',
  'rezerv',
  'capacity market',
  'capacity mechanism',
  'cmu',
  'capacity remunerat',
  'lithuani',
  'latvi',
  'estoni',
  'lietuv',
  'baltic',
  'baltij',
  'litgrid',
  'apva',
  'vert',
  'nordpool',
  'nord pool',
  'ast.lv',
  'elering',
  'entso',
  'entso-e',
  'entsoe',
  'intention protocol',
  'pajėgumai',
  'transformer',
  'substation',
  'pcs',
  'inverter',
  'energy bill',
  'energy policy',
  'renewables target',
  'grid code',
];

// Subset of BESS_TOPIC_KEYWORDS that establishes Baltic context.
// A bare MW/MWh mention only counts if Baltic context is already present —
// stops UK/US "200 MW announcement" content from matching falsely.
export const BALTIC_CONTEXT_KEYWORDS: readonly string[] = [
  'lithuani',
  'latvi',
  'estoni',
  'lietuv',
  'baltic',
  'baltij',
  'litgrid',
  'apva',
  'vert',
  'ast.lv',
  'elering',
];

// Tier-keyed minimum score for the topic gate.
// Tier 1 sources are canonical — auto-pass.
// Tier 2 sources are credible but broad — require ≥1 BESS keyword.
// Outside both lists — require ≥2 to overcome unknown-source risk.
export function topicThresholdForTier(tier: FeedSourceTier): number {
  if (tier === 'tier1') return 0;
  if (tier === 'tier2') return 1;
  return 2;
}

export function extractDomain(urlOrSource: string | null | undefined): string {
  if (!urlOrSource) return '';
  const s = String(urlOrSource).toLowerCase().trim();
  const u = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return u.split('/')[0].split('?')[0];
}

function domainMatches(domain: string, target: string): boolean {
  if (!domain) return false;
  return domain === target || domain.endsWith('.' + target);
}

// Returns the rule that denied the source, or null if not denied.
export function isDeniedFeedSource(
  source: string | null | undefined,
  url: string | null | undefined,
): string | null {
  const sourceDomain = extractDomain(source);
  const urlDomain = extractDomain(url);
  for (const blocked of FEED_SOURCE_DENYLIST) {
    if (domainMatches(sourceDomain, blocked)) return blocked;
    if (domainMatches(urlDomain, blocked)) return blocked;
  }
  if (domainMatches(urlDomain, 'linkedin.com')) {
    const path = String(url || '').toLowerCase();
    if (path.includes('/posts/')) return 'linkedin/posts';
    if (path.includes('/pulse/')) return 'linkedin/pulse';
  }
  return null;
}

// Returns true if the source is in the denylist or matches a blocked LinkedIn path.
export function isAllowedFeedSource(
  source: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isDeniedFeedSource(source, url) === null;
}

export function feedSourceTier(
  source: string | null | undefined,
  url: string | null | undefined,
): FeedSourceTier {
  const sourceDomain = extractDomain(source);
  const urlDomain = extractDomain(url);
  for (const d of FEED_SOURCE_TSO_REGULATOR) {
    if (domainMatches(sourceDomain, d) || domainMatches(urlDomain, d)) return 'tier1';
  }
  for (const d of FEED_SOURCE_TRADE_PRESS) {
    if (domainMatches(sourceDomain, d) || domainMatches(urlDomain, d)) return 'tier2';
  }
  // Legacy: source name matching for tier1 — feed entries that pre-date the
  // domain-keyed allowlist sometimes carry source='Litgrid' instead of a domain.
  const nameLc = (source || '').toLowerCase();
  if (['litgrid', 'ast.lv', 'elering', 'vert', 'apva', 'entso'].some(n => nameLc.includes(n))) {
    return 'tier1';
  }
  return 'outside';
}

export function bessTopicScore(
  title: string | null | undefined,
  consequenceText: string | null | undefined,
): number {
  const haystack = `${title || ''} ${(consequenceText || '').slice(0, 400)}`.toLowerCase();
  let score = 0;
  let baltic = false;
  for (const kw of BESS_TOPIC_KEYWORDS) {
    if (haystack.includes(kw)) {
      score++;
      if (BALTIC_CONTEXT_KEYWORDS.some(b => kw.includes(b))) baltic = true;
    }
  }
  if (baltic && /\b\d+\s*m?wh?\b/.test(haystack)) score++;
  return score;
}

// Single entry point for ingestion-time and read-time gating. Returns a
// structured pass/fail with the reason string suitable for logging or
// surfacing in the rejected-items audit trail.
export function evaluateFeedItemGates(
  source: string | null | undefined,
  url: string | null | undefined,
  title: string | null | undefined,
  consequence: string | null | undefined,
): FeedGateResult {
  const denied = isDeniedFeedSource(source, url);
  const tier = feedSourceTier(source, url);
  const score = bessTopicScore(title, consequence);
  if (denied) {
    return { ok: false, reason: `source_denylist:${denied}`, tier, score };
  }
  const threshold = topicThresholdForTier(tier);
  if (score < threshold) {
    return {
      ok: false,
      reason: `topic_below_threshold(tier=${tier},score=${score},threshold=${threshold})`,
      tier,
      score,
    };
  }
  return { ok: true, tier, score };
}
