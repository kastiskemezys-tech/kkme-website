/**
 * KKME — S1 Baltic Price Separation + Curation/Digest Worker
 * Cron: 0 6 * * * (06:00 UTC daily, after day-ahead auction results are published)
 *
 * Endpoints:
 *   GET /              → fresh ENTSO-E fetch + writes S1 to KV (manual refresh)
 *   GET /read          → returns cached S1 KV value (fetched by S1Card)
 *   POST /curate       → accepts CurationEntry JSON, stores in KV
 *   GET /curations     → returns raw curation entries (last 7 days)
 *   GET /digest        → reads curations, calls Anthropic, returns DigestItem[]
 *
 * Secrets:
 *   wrangler secret put ENTSOE_API_KEY
 *   wrangler secret put ANTHROPIC_API_KEY   ← required for /digest
 *
 * KV bindings (wrangler.toml): KKME_SIGNALS
 */

const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const LT_BZN = '10YLT-1001A0008Q';   // Lithuania bidding zone
const SE4_BZN = '10Y1001A1001A47J';  // Sweden SE4 bidding zone (Nordic reference)

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// KV key prefixes
const KV_CURATION_PREFIX = 'curation:';
const KV_CURATIONS_INDEX  = 'curations:index';
const KV_DIGEST_CACHE     = 'digest:cache';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── S1 helpers ────────────────────────────────────────────────────────────────

/** Format a Date as YYYYMMDDHHMM in UTC (ENTSO-E period format) */
function utcPeriod(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}0000`;
}

/** Extract all <price.amount> values from ENTSO-E XML response */
function extractPrices(xml) {
  const prices = [];
  const re = /<price\.amount>([\d.]+)<\/price\.amount>/g;
  let m;
  while ((m = re.exec(xml)) !== null) prices.push(parseFloat(m[1]));
  return prices;
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function signalState(pct) {
  if (pct > 20) return 'ACT';
  if (pct >= 5) return 'WATCH';
  return 'CALM';
}

async function fetchBzn(bzn, apiKey) {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('documentType', 'A44');
  url.searchParams.set('in_Domain', bzn);
  url.searchParams.set('out_Domain', bzn);
  url.searchParams.set('periodStart', utcPeriod(0));
  url.searchParams.set('periodEnd', utcPeriod(1));
  url.searchParams.set('securityToken', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ENTSO-E ${bzn}: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.text();
}

async function computeS1(env) {
  const apiKey = env.ENTSOE_API_KEY;
  if (!apiKey) throw new Error('ENTSOE_API_KEY secret not set');

  const [ltXml, se4Xml] = await Promise.all([
    fetchBzn(LT_BZN, apiKey),
    fetchBzn(SE4_BZN, apiKey),
  ]);

  const ltPrices = extractPrices(ltXml);
  const se4Prices = extractPrices(se4Xml);

  if (!ltPrices.length || !se4Prices.length) {
    throw new Error(`No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h`);
  }

  const ltAvg = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;
  const separationPct = se4Avg !== 0 ? (spread / se4Avg) * 100 : 0;

  return {
    signal: 'S1',
    name: 'Baltic Price Separation',
    lt_avg_eur_mwh: Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh: Math.round(se4Avg * 100) / 100,
    spread_eur_mwh: Math.round(spread * 100) / 100,
    separation_pct: Math.round(separationPct * 10) / 10,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours: ltPrices.length,
    se4_hours: se4Prices.length,
  };
}

// ─── Curation helpers ──────────────────────────────────────────────────────────

/** Generate a simple unique ID (timestamp + random hex) */
function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read curations index from KV, return array of IDs */
async function readIndex(kv) {
  const raw = await kv.get(KV_CURATIONS_INDEX);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/** Write curations index to KV */
async function writeIndex(kv, ids) {
  await kv.put(KV_CURATIONS_INDEX, JSON.stringify(ids));
}

/** Fetch up to last 7 days of curation entries from KV */
async function recentCurations(kv) {
  const ids = await readIndex(kv);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entries = [];

  for (const id of ids) {
    const raw = await kv.get(`${KV_CURATION_PREFIX}${id}`);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (new Date(entry.created_at).getTime() >= cutoff) {
        entries.push(entry);
      }
    } catch { /* skip corrupt entries */ }
  }

  return entries;
}

// ─── Digest via Anthropic ──────────────────────────────────────────────────────

async function buildDigest(entries, anthropicKey) {
  // Sort by relevance desc, take top 15
  const sorted = [...entries].sort((a, b) => b.relevance - a.relevance).slice(0, 15);

  const itemsText = sorted.map((e, i) =>
    `[${i + 1}] relevance=${e.relevance} source=${e.source}\nTitle: ${e.title}\nURL: ${e.url}\nText: ${e.raw_text.slice(0, 600)}`
  ).join('\n\n');

  const prompt = `You are an infrastructure intelligence analyst. Below are ${sorted.length} curated articles from the past 7 days, ranked by relevance (1–5). Summarize each into a concise DigestItem. Focus on Baltic energy markets, grid infrastructure, BESS, and related macro signals.

For each article, return a JSON object with:
- id: string (copy from input id field, or generate one if missing)
- title: string (sharp, factual, ≤10 words)
- summary: string (2–3 sentences, specific facts, no fluff)
- source: string
- url: string
- date: string (ISO 8601, copy created_at)
- relevance: number

Return ONLY a valid JSON array of DigestItem objects. No markdown, no commentary.

Articles:
${itemsText}`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Anthropic response did not contain a JSON array');

  return JSON.parse(match[0]);
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron trigger — runs daily at 06:00 UTC */
  async scheduled(_event, env, _ctx) {
    const data = await computeS1(env);
    await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
    console.log(`[S1] Written: ${data.state} ${data.separation_pct}% (LT ${data.lt_avg_eur_mwh} vs SE4 ${data.se4_avg_eur_mwh} €/MWh)`);
  },

  async fetch(request, env, _ctx) {
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    const url = new URL(request.url);

    // ── GET /read — S1 cached KV value ──────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/read') {
      const raw = await env.KKME_SIGNALS.get('s1');
      if (!raw) {
        return new Response(JSON.stringify({ error: 'not yet populated' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      return new Response(raw, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          ...CORS,
        },
      });
    }

    // ── POST /curate — store a new curation entry ────────────────────────────
    if (request.method === 'POST' && url.pathname === '/curate') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const { url: entryUrl, title, raw_text, source, relevance, tags } = body;
      if (!entryUrl || !title || !raw_text || !source || !relevance) {
        return new Response(JSON.stringify({ error: 'Missing required fields: url, title, raw_text, source, relevance' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const id = makeId();
      const entry = {
        id,
        url: entryUrl,
        title,
        raw_text,
        source,
        relevance: Number(relevance),
        tags: Array.isArray(tags) ? tags : [],
        created_at: new Date().toISOString(),
      };

      // Store entry + update index
      await env.KKME_SIGNALS.put(`${KV_CURATION_PREFIX}${id}`, JSON.stringify(entry), {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });

      const ids = await readIndex(env.KKME_SIGNALS);
      ids.push(id);
      await writeIndex(env.KKME_SIGNALS, ids);

      // Invalidate digest cache
      await env.KKME_SIGNALS.delete(KV_DIGEST_CACHE);

      return new Response(JSON.stringify({ ok: true, id }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── GET /curations — return raw entries (last 7 days) ───────────────────
    if (request.method === 'GET' && url.pathname === '/curations') {
      const entries = await recentCurations(env.KKME_SIGNALS);
      return new Response(JSON.stringify(entries), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS,
        },
      });
    }

    // ── GET /digest — summarize via Anthropic, cache result ─────────────────
    if (request.method === 'GET' && url.pathname === '/digest') {
      // Return cached digest if fresh (1 hour TTL served via Cache-Control,
      // but we also store in KV to survive cold starts)
      const cached = await env.KKME_SIGNALS.get(KV_DIGEST_CACHE);
      if (cached) {
        return new Response(cached, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            ...CORS,
          },
        });
      }

      const anthropicKey = env.ANTHROPIC_API_KEY;
      // TODO: For local dev, set ANTHROPIC_API_KEY in .env.local (not used by Worker directly,
      // but wrangler secret put ANTHROPIC_API_KEY is required for production).
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const entries = await recentCurations(env.KKME_SIGNALS);
      if (!entries.length) {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      try {
        const digest = await buildDigest(entries, anthropicKey);
        const digestJson = JSON.stringify(digest);

        // Cache for 1 hour
        await env.KKME_SIGNALS.put(KV_DIGEST_CACHE, digestJson, {
          expirationTtl: 3600,
        });

        return new Response(digestJson, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            ...CORS,
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
    }

    // ── GET / — fresh S1 fetch + write to KV (manual trigger) ───────────────
    if (request.method === 'GET') {
      try {
        const data = await computeS1(env);
        await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
        return new Response(JSON.stringify(data, null, 2), {
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
