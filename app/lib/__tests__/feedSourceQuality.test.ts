import { describe, expect, it } from 'vitest';
import {
  BESS_TOPIC_KEYWORDS,
  FEED_SOURCE_DENYLIST,
  FEED_SOURCE_TRADE_PRESS,
  FEED_SOURCE_TSO_REGULATOR,
  bessTopicScore,
  evaluateFeedItemGates,
  extractDomain,
  feedSourceTier,
  hasHallucinationHedgeLanguage,
  isAllowedFeedSource,
  isDeniedFeedSource,
  isGenericSourceUrl,
  topicThresholdForTier,
} from '../feedSourceQuality';

describe('extractDomain', () => {
  it.each([
    ['https://www.facebook.com/post/123', 'facebook.com'],
    ['HTTPS://Litgrid.LT/news/abc', 'litgrid.lt'],
    ['litgrid', 'litgrid'],
    ['', ''],
    ['https://www.linkedin.com/posts/some-personal-rant', 'linkedin.com'],
    ['ec.europa.eu/path?x=1', 'ec.europa.eu'],
  ])('extracts %s -> %s', (input, expected) => {
    expect(extractDomain(input)).toBe(expected);
  });
});

describe('isAllowedFeedSource — denylist', () => {
  it.each([
    ['facebook.com', 'https://facebook.com/post/123'],
    ['Avion Express', 'https://www.facebook.com/avionexpress/posts/x'],
    ['instagram.com', 'https://www.instagram.com/popular/donatas'],
    ['researchgate.net', 'https://researchgate.net/publication/abc'],
    ['academia.edu', 'https://academia.edu/paper'],
    ['medium.com', 'https://medium.com/@author/post'],
    ['substack.com', 'https://author.substack.com/p/x'],
    ['twitter.com', 'https://twitter.com/user/status/1'],
    ['x.com', 'https://x.com/user/status/1'],
    ['linkedin', 'https://linkedin.com/posts/some-personal-rant'],
    ['linkedin', 'https://www.linkedin.com/pulse/article-by-author'],
  ])('rejects source=%s url=%s', (source, url) => {
    expect(isAllowedFeedSource(source, url)).toBe(false);
    expect(isDeniedFeedSource(source, url)).not.toBeNull();
  });
});

describe('isAllowedFeedSource — admits', () => {
  it.each([
    ['Litgrid', 'https://litgrid.lt/news/storage-installed'],
    ['litgrid', 'https://www.litgrid.eu/index.php/naujienos/x'],
    ['APVA', 'https://apva.lrv.lt/lt/naujienos/x'],
    ['MontelNews', 'https://www.montelnews.com/article/x'],
    ['Reuters', 'https://www.reuters.com/business/energy/x'],
    ['LinkedIn (company page)', 'https://www.linkedin.com/company/litgrid/'],
    ['LinkedIn (profile)', 'https://www.linkedin.com/in/someone/'],
    ['vert.lt', 'https://vert.lt/permits.xlsx'],
    ['xtv.lv', 'https://xtv.lv/rigatv24/video/x'],
  ])('accepts source=%s url=%s', (source, url) => {
    expect(isAllowedFeedSource(source, url)).toBe(true);
    expect(isDeniedFeedSource(source, url)).toBeNull();
  });
});

describe('feedSourceTier', () => {
  it.each([
    ['litgrid.lt', 'tier1'],
    ['Litgrid', 'tier1'],
    ['ast.lv', 'tier1'],
    ['elering.ee', 'tier1'],
    ['vert.lt', 'tier1'],
    ['apva.lrv.lt', 'tier1'],
    ['am.lrv.lt', 'tier1'],
    ['ec.europa.eu', 'tier1'],
    ['montelnews.com', 'tier2'],
    ['reuters.com', 'tier2'],
    ['nordpoolgroup.com', 'tier2'],
    ['energy-storage.news', 'tier2'],
    ['lsta.lt', 'outside'],
    ['solarplaza.com', 'outside'],
    ['xtv.lv', 'outside'],
    ['thehanseatic.com', 'outside'],
    ['latvenergo.lv', 'outside'],
  ])('classifies %s as %s', (source, tier) => {
    expect(feedSourceTier(source, `https://${source}/path`)).toBe(tier);
  });

  it('matches subdomain of trade-press domain', () => {
    expect(feedSourceTier('reuters', 'https://www.reuters.com/business/energy/x')).toBe('tier2');
  });

  it('returns outside when neither source nor url match an allowlist', () => {
    expect(feedSourceTier('Some Blog', 'https://random.example.com/article')).toBe('outside');
  });
});

describe('topicThresholdForTier', () => {
  it('tier1 auto-passes (threshold 0)', () => {
    expect(topicThresholdForTier('tier1')).toBe(0);
  });
  it('tier2 requires score ≥1', () => {
    expect(topicThresholdForTier('tier2')).toBe(1);
  });
  it('outside requires score ≥2', () => {
    expect(topicThresholdForTier('outside')).toBe(2);
  });
});

describe('bessTopicScore — auditor garbage examples', () => {
  it('scores 0 for facebook ice-cream post', () => {
    expect(
      bessTopicScore(
        'Chocolate, creamy, and protein-packed. Healthy ice cream without sugar',
        'facebook.com/61586503787589/posts/...',
      ),
    ).toBe(0);
  });
  it('scores 0 for Pooler grocery post', () => {
    expect(
      bessTopicScore(
        'Pooler parkway? Hwy 80? Have stores been stocked? Specifically Food Lion & Aldi',
        '',
      ),
    ).toBe(0);
  });
  it('scores 0 for Avion Express airline post', () => {
    expect(bessTopicScore('Avion Express - Facebook', '')).toBe(0);
  });
  it('scores 0 for latvenergo financial report (utility holding company, not BESS)', () => {
    expect(
      bessTopicScore(
        'LATVENERGO CONSOLIDATED AND LATVENERGO AS UNCONSOLIDATED FINANCIAL STATEMENTS 2025',
        'For the year ended 31 December 2025 — auditor PricewaterhouseCoopers',
      ),
    ).toBe(0);
  });
  it('scores 0 for Curonian Nord offshore wind EIA', () => {
    expect(
      bessTopicScore(
        'The Environmental Impact Assessment of Curonian Nord offshore wind project',
        'Public consultation — Klaipeda regional commission',
      ),
    ).toBe(0);
  });
});

describe('bessTopicScore — legitimate Baltic BESS items', () => {
  it('scores ≥2 for Litgrid storage news', () => {
    expect(
      bessTopicScore(
        'Litgrid: 484 MW storage installed nationally, 1,395 MW in TSO reservations',
        'transmission system operator capacity reservation report',
      ),
    ).toBeGreaterThanOrEqual(2);
  });
  it('scores ≥2 for APVA BESS call', () => {
    expect(
      bessTopicScore(
        'APVA large-scale BESS call',
        'Lithuanian energy fund opens battery storage tender',
      ),
    ).toBeGreaterThanOrEqual(2);
  });
  it('scores ≥2 for Estonian aFRR balancing', () => {
    expect(
      bessTopicScore('Estonian aFRR clearing prices spike', 'Elering balancing market data'),
    ).toBeGreaterThanOrEqual(2);
  });
  it('scores ≥1 for VERT permits XLSX (Lithuanian context only)', () => {
    expect(
      bessTopicScore(
        'Leidimai plėtoti kaupimo pajėgumus 2026-02-28.xlsx - VERT',
        'Lietuvos energijos reguliavimo komisija',
      ),
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('bessTopicScore — co-occurrence rule', () => {
  it('counts a bare MW mention only when Baltic context is present', () => {
    const noContext = bessTopicScore('Tesla unveils 200 MW Megapack project in Texas', '');
    const balticContext = bessTopicScore(
      'Lithuanian project unveils 200 MW Megapack',
      'Litgrid grid connection approved',
    );
    expect(balticContext).toBeGreaterThan(noContext);
  });
});

describe('evaluateFeedItemGates — full pipeline', () => {
  it('rejects facebook ice-cream post via denylist', () => {
    const r = evaluateFeedItemGates(
      'facebook.com',
      'https://facebook.com/61586503787589/posts/x',
      'Chocolate, creamy, and protein-packed. Healthy ice cream without sugar',
      '',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^source_denylist:facebook\.com$/);
  });
  it('rejects researchgate NILM paper via denylist', () => {
    const r = evaluateFeedItemGates(
      'researchgate.net',
      'https://researchgate.net/publication/x',
      'NILM Model for Multi-Appliance Power Disaggregation Based on the X Approach',
      '',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^source_denylist:researchgate\.net$/);
  });
  it('rejects latvenergo financial report via topic gate (outside threshold 2)', () => {
    const r = evaluateFeedItemGates(
      'latvenergo.lv',
      'https://latvenergo.lv/storage/app/media/uploaded-files/financials.pdf',
      'LATVENERGO CONSOLIDATED AND LATVENERGO AS UNCONSOLIDATED FINANCIAL STATEMENTS',
      'For the year ended 31 December 2025',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.tier).toBe('outside');
      expect(r.reason).toMatch(/topic_below_threshold/);
    }
  });
  it('rejects lsta.lt heating bulletin (outside, score 1 < threshold 2)', () => {
    const r = evaluateFeedItemGates(
      'lsta.lt',
      'https://lsta.lt/wp-content/uploads/2026/03/x.pdf',
      'LIETUVOS ŠILUMOS TIEKĖJŲ ASOCIACIJA Nr. IS-875/1150 2026',
      'Heating sector cost bulletin',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.tier).toBe('outside');
    }
  });
  it('admits Litgrid storage news (tier1 auto-pass)', () => {
    const r = evaluateFeedItemGates(
      'Litgrid',
      'https://www.litgrid.eu/index.php/naujienos/x',
      'Litgrid intention protocols storage',
      'transmission system operator',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tier).toBe('tier1');
  });
  it('admits am.lrv.lt EIA report (tier1 auto-pass even with topic_score 0)', () => {
    const r = evaluateFeedItemGates(
      'am.lrv.lt',
      'https://am.lrv.lt/public/canonical/x',
      'Environmental Impact Assessment Report - Aplinkos ministerija',
      'environmental review',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tier).toBe('tier1');
  });
  it('admits Reuters energy article (tier2, topic_score ≥1)', () => {
    const r = evaluateFeedItemGates(
      'Reuters',
      'https://www.reuters.com/business/energy/baltic-grid-x',
      'Baltic grid integration progresses ahead of schedule',
      'Reuters reports balancing market reforms',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tier).toBe('tier2');
  });
  it('rejects generic Reuters article without BESS keywords (tier2, score < 1)', () => {
    const r = evaluateFeedItemGates(
      'Reuters',
      'https://www.reuters.com/world/x',
      'Hollywood premiere draws record crowd to red-carpet event',
      'celebrity wire copy',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.tier).toBe('tier2');
      expect(r.reason).toMatch(/topic_below_threshold/);
    }
  });
  it('admits solarplaza Baltics summit (outside, score ≥2 via baltic + bess context)', () => {
    const r = evaluateFeedItemGates(
      'solarplaza.com',
      'https://www.solarplaza.com/event/baltic-bess-summit',
      'Speakers - Solarplaza Summit Baltics',
      'BESS deployment in Lithuania, Latvia, Estonia — keynote on balancing markets',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tier).toBe('outside');
      expect(r.score).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('hallucination markers (Phase 12.10.0)', () => {
  // The Saulėtas Pasaulis purge surfaced two heuristics that distinguish
  // LLM-fabricated entries from real news. These tests pin the heuristics
  // for Phase 12.12 to wire structurally into evaluateFeedItemGates().
  describe('isGenericSourceUrl', () => {
    it('flags litgrid.eu homepage (the Saulėtas Pasaulis marker)', () => {
      expect(isGenericSourceUrl('https://www.litgrid.eu/')).toBe(true);
    });
    it('flags vert.lt homepage', () => {
      expect(isGenericSourceUrl('https://www.vert.lt/')).toBe(true);
    });
    it('does not flag a specific Litgrid press release path', () => {
      expect(
        isGenericSourceUrl(
          'https://www.litgrid.eu/index.php/naujienos/naujienos/litgrid-per-3-menesius-preliminariai-rezervavo-17-gw-galios-saules-ir-vejo-elektrinems-bei-kaupimo-irenginiams/36506',
        ),
      ).toBe(false);
    });
    it('does not flag a deep regulator path', () => {
      expect(isGenericSourceUrl('https://apva.lrv.lt/lt/naujienos-24316/uzbaigtas-...')).toBe(
        false,
      );
    });
    it('handles empty / null / whitespace input', () => {
      expect(isGenericSourceUrl(null)).toBe(false);
      expect(isGenericSourceUrl(undefined)).toBe(false);
      expect(isGenericSourceUrl('')).toBe(false);
      expect(isGenericSourceUrl('   ')).toBe(false);
    });
    it('treats bare domain (no protocol, no path) as generic', () => {
      expect(isGenericSourceUrl('litgrid.eu')).toBe(true);
      expect(isGenericSourceUrl('www.vert.lt')).toBe(true);
    });
  });

  describe('hasHallucinationHedgeLanguage', () => {
    it('detects "if confirmed" (the Saulėtas Pasaulis consequence marker)', () => {
      expect(
        hasHallucinationHedgeLanguage(
          'UAB X (500 MW) removed from litgrid pipeline. If confirmed, eases competition pressure.',
        ),
      ).toBe(true);
    });
    it('detects "allegedly" and "rumored to"', () => {
      expect(hasHallucinationHedgeLanguage('Allegedly, the project secured EBRD financing.')).toBe(
        true,
      );
      expect(hasHallucinationHedgeLanguage('The developer is rumored to exit Q4.')).toBe(true);
    });
    it('does not flag direct attribution to a specific source', () => {
      expect(
        hasHallucinationHedgeLanguage(
          'UAB X (500 MW) removed per Litgrid press release dated 2026-04-15.',
        ),
      ).toBe(false);
    });
    it('does not flag sober technical prose', () => {
      expect(
        hasHallucinationHedgeLanguage(
          'Storage operators bear 30% of system balancing costs from Jan 2026.',
        ),
      ).toBe(false);
    });
    it('handles empty / null input', () => {
      expect(hasHallucinationHedgeLanguage(null)).toBe(false);
      expect(hasHallucinationHedgeLanguage(undefined)).toBe(false);
      expect(hasHallucinationHedgeLanguage('')).toBe(false);
    });
  });
});

describe('worker / lib parity', () => {
  // The worker holds the canonical implementation; this test fixes the
  // expected values so any divergence between the .ts mirror and the worker
  // surfaces as a failing test on next run. Update both files together.
  it('denylist size and presence', () => {
    expect(FEED_SOURCE_DENYLIST.size).toBe(14);
    expect(FEED_SOURCE_DENYLIST.has('facebook.com')).toBe(true);
    expect(FEED_SOURCE_DENYLIST.has('substack.com')).toBe(true);
    expect(FEED_SOURCE_DENYLIST.has('linkedin.com')).toBe(false);
  });
  it('tier1 size includes core Baltic regulators', () => {
    expect(FEED_SOURCE_TSO_REGULATOR.has('litgrid.lt')).toBe(true);
    expect(FEED_SOURCE_TSO_REGULATOR.has('ast.lv')).toBe(true);
    expect(FEED_SOURCE_TSO_REGULATOR.has('elering.ee')).toBe(true);
    expect(FEED_SOURCE_TSO_REGULATOR.has('apva.lrv.lt')).toBe(true);
  });
  it('tier2 includes the trade press operator approved', () => {
    expect(FEED_SOURCE_TRADE_PRESS.has('montelnews.com')).toBe(true);
    expect(FEED_SOURCE_TRADE_PRESS.has('reuters.com')).toBe(true);
    expect(FEED_SOURCE_TRADE_PRESS.has('lsta.lt')).toBe(false);
  });
  it('keyword set covers the four pillars (storage, balancing, capacity, geography)', () => {
    expect(BESS_TOPIC_KEYWORDS).toContain('bess');
    expect(BESS_TOPIC_KEYWORDS).toContain('afrr');
    expect(BESS_TOPIC_KEYWORDS).toContain('capacity market');
    expect(BESS_TOPIC_KEYWORDS).toContain('lithuani');
  });
});
