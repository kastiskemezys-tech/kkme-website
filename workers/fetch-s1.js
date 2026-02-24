/**
 * KKME — S1 Baltic Price Separation + Curation/Digest + Telegram Bot Worker
 * Cron: 0 6 * * * (06:00 UTC daily)
 *
 * Endpoints:
 *   GET /               → fresh ENTSO-E fetch + writes S1 to KV (manual trigger)
 *   GET /read           → returns cached S1 KV value (fetched by S1Card)
 *   POST /curate        → accepts CurationEntry JSON, stores in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → calls Anthropic haiku, returns DigestItem[]; cached 1h
 *   POST /telegram      → Telegram webhook (server-to-server, no CORS needed)
 *   POST /telegram/setup → registers webhook with Telegram (call once after deploy)
 *
 * Secrets (set via wrangler secret put):
 *   ENTSOE_API_KEY          — ENTSO-E Transparency Platform
 *   ANTHROPIC_API_KEY       — Claude haiku for digest + extraction
 *   TELEGRAM_BOT_TOKEN      — TODO: wrangler secret put TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET — TODO: wrangler secret put TELEGRAM_WEBHOOK_SECRET
 *                             (any string you choose; sent as X-Telegram-Bot-Api-Secret-Token)
 *
 * KV namespace binding: KKME_SIGNALS
 */

const ENTSOE_API    = 'https://web-api.tp.entsoe.eu/api';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TELEGRAM_API  = 'https://api.telegram.org';
const WORKER_URL    = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const LT_BZN  = '10YLT-1001A0008Q';  // Lithuania bidding zone
const SE4_BZN = '10Y1001A1001A47J';  // Sweden SE4 bidding zone

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

function utcPeriod(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}0000`;
}

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
  if (pct >= 5)  return 'WATCH';
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

  const ltPrices  = extractPrices(ltXml);
  const se4Prices = extractPrices(se4Xml);

  if (!ltPrices.length || !se4Prices.length) {
    throw new Error(`No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h`);
  }

  const ltAvg  = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;
  const separationPct = se4Avg !== 0 ? (spread / se4Avg) * 100 : 0;

  return {
    signal: 'S1',
    name: 'Baltic Price Separation',
    lt_avg_eur_mwh:   Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh:  Math.round(se4Avg * 100) / 100,
    spread_eur_mwh:   Math.round(spread * 100) / 100,
    separation_pct:   Math.round(separationPct * 10) / 10,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
  };
}

// ─── Curation helpers ──────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readIndex(kv) {
  const raw = await kv.get(KV_CURATIONS_INDEX);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function writeIndex(kv, ids) {
  await kv.put(KV_CURATIONS_INDEX, JSON.stringify(ids));
}

async function recentCurations(kv) {
  const ids    = await readIndex(kv);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entries = [];

  for (const id of ids) {
    const raw = await kv.get(`${KV_CURATION_PREFIX}${id}`);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (new Date(entry.created_at).getTime() >= cutoff) entries.push(entry);
    } catch { /* skip corrupt entries */ }
  }

  return entries;
}

async function storeCurationEntry(kv, entry) {
  await kv.put(`${KV_CURATION_PREFIX}${entry.id}`, JSON.stringify(entry), {
    expirationTtl: 30 * 24 * 60 * 60,
  });
  const ids = await readIndex(kv);
  ids.push(entry.id);
  await writeIndex(kv, ids);
  await kv.delete(KV_DIGEST_CACHE); // invalidate digest cache
}

// ─── Digest via Anthropic ──────────────────────────────────────────────────────

async function buildDigest(entries, anthropicKey) {
  const sorted    = [...entries].sort((a, b) => b.relevance - a.relevance).slice(0, 15);
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

  const data  = await res.json();
  const text  = data.content?.[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Anthropic response did not contain a JSON array');
  return JSON.parse(match[0]);
}

// ─── Telegram helpers ──────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s]+/;

/** Rudimentary HTML → plain text */
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().slice(0, 120) : '';
}

/** Fetch a URL and return { title, text }; times out after 8s */
async function fetchPage(pageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KKMEBot/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return { title: '', text: '' };
    const html = await res.text();
    return { title: extractHtmlTitle(html), text: htmlToText(html) };
  } catch {
    clearTimeout(timer);
    return { title: '', text: '' };
  }
}

/** Call Claude haiku to extract structured data from raw content */
async function extractWithClaude(content, anthropicKey) {
  const prompt = `You are a Baltic/Nordic energy market analyst.
Extract from this content:
- title (short, factual)
- summary (2-3 sentences, what matters for BESS/grid/DC deals)
- tags (array, choose from: bess, grid-connection, dc-power, offtake, financing, price-move, policy, supply-chain, competitor, technology, lt, lv, ee, nordic, eu)
- relevance (1-5, how actionable for deal sourcing)
Return JSON only.

Content:
${content}`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data  = await res.json();
  const text  = data.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude did not return JSON');
  return JSON.parse(match[0]);
}

/** Send a Telegram message */
async function tgSend(chatId, text, botToken) {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

/**
 * Process a Telegram message: fetch URL if present, call Claude, store CurationEntry,
 * reply to chat. Runs inside ctx.waitUntil() — response already sent to Telegram.
 */
async function processTelegramMessage(message, env) {
  const chatId    = message.chat.id;
  const botToken  = env.TELEGRAM_BOT_TOKEN;
  const rawText   = (message.text || message.caption || '').trim();

  if (!rawText) return;

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    await tgSend(chatId, '⚠️ ANTHROPIC_API_KEY not set on Worker', botToken);
    return;
  }

  try {
    const urlMatch = rawText.match(URL_REGEX);
    const pageUrl  = urlMatch ? urlMatch[0].replace(/[.,)>]+$/, '') : ''; // trim trailing punctuation
    let content    = rawText;
    let pageTitle  = '';
    let source     = 'telegram';

    if (pageUrl) {
      const page = await fetchPage(pageUrl);
      pageTitle  = page.title;
      try { source = new URL(pageUrl).hostname; } catch { /* keep 'telegram' */ }
      // Combine page title + body text + any extra message text
      const extra = rawText.replace(urlMatch[0], '').trim();
      content = [pageTitle, page.text, extra].filter(Boolean).join('\n\n');
    }

    const extracted = await extractWithClaude(content.slice(0, 4000), anthropicKey);

    const entry = {
      id:         makeId(),
      url:        pageUrl,
      title:      String(extracted.title  || pageTitle || rawText.slice(0, 80)),
      raw_text:   content.slice(0, 2000),
      source,
      relevance:  Math.min(5, Math.max(1, Number(extracted.relevance) || 3)),
      tags:       Array.isArray(extracted.tags) ? extracted.tags : [],
      created_at: new Date().toISOString(),
      summary:    String(extracted.summary || ''),
    };

    await storeCurationEntry(env.KKME_SIGNALS, entry);

    const tagStr = entry.tags.length ? ` [${entry.tags.join(', ')}]` : '';
    await tgSend(chatId, `✓ Saved: ${entry.title}${tagStr}\nrelevance: ${entry.relevance}/5`, botToken);
  } catch (err) {
    await tgSend(chatId, `⚠️ Error: ${String(err).slice(0, 200)}`, botToken);
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron trigger — runs daily at 06:00 UTC */
  async scheduled(_event, env, _ctx) {
    const data = await computeS1(env);
    await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
    console.log(`[S1] Written: ${data.state} ${data.separation_pct}% (LT ${data.lt_avg_eur_mwh} vs SE4 ${data.se4_avg_eur_mwh} €/MWh)`);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── OPTIONS preflight ────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    // ── POST /telegram — Telegram webhook (server-to-server, no CORS) ────────
    if (request.method === 'POST' && url.pathname === '/telegram') {
      // Verify Telegram secret token
      const incoming = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!env.TELEGRAM_WEBHOOK_SECRET || incoming !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response('TELEGRAM_BOT_TOKEN not set', { status: 503 });
      }

      let update;
      try { update = await request.json(); }
      catch { return new Response('Bad Request', { status: 400 }); }

      const message = update.message || update.channel_post;

      // Return 200 immediately; process in background so Telegram doesn't retry
      if (message) {
        ctx.waitUntil(processTelegramMessage(message, env));
      }

      return new Response('OK', { status: 200 });
    }

    // ── POST /telegram/setup — register webhook with Telegram ────────────────
    // Call once after deploy: curl -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/telegram/setup
    if (request.method === 'POST' && url.pathname === '/telegram/setup') {
      const botToken     = env.TELEGRAM_BOT_TOKEN;
      const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;

      if (!botToken || !webhookSecret) {
        return new Response(JSON.stringify({
          error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set',
        }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      const res  = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${WORKER_URL}/telegram`,
          secret_token: webhookSecret,
          allowed_updates: ['message'],
        }),
      });

      const data = await res.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── POST /curate — store a new curation entry ────────────────────────────
    if (request.method === 'POST' && url.pathname === '/curate') {
      let body;
      try { body = await request.json(); }
      catch {
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

      const entry = {
        id:         makeId(),
        url:        entryUrl,
        title,
        raw_text,
        source,
        relevance:  Number(relevance),
        tags:       Array.isArray(tags) ? tags : [],
        created_at: new Date().toISOString(),
      };

      await storeCurationEntry(env.KKME_SIGNALS, entry);

      return new Response(JSON.stringify({ ok: true, id: entry.id }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── GET /curations — raw entries (last 7 days) ───────────────────────────
    if (request.method === 'GET' && url.pathname === '/curations') {
      const entries = await recentCurations(env.KKME_SIGNALS);
      return new Response(JSON.stringify(entries), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    // ── GET /digest — Anthropic summarise, cached 1h ─────────────────────────
    if (request.method === 'GET' && url.pathname === '/digest') {
      const cached = await env.KKME_SIGNALS.get(KV_DIGEST_CACHE);
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      }

      const anthropicKey = env.ANTHROPIC_API_KEY;
      // TODO: For local dev, set ANTHROPIC_API_KEY in .env.local (not read by Worker directly —
      // use `wrangler secret put ANTHROPIC_API_KEY` for production).
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
        const digest     = await buildDigest(entries, anthropicKey);
        const digestJson = JSON.stringify(digest);
        await env.KKME_SIGNALS.put(KV_DIGEST_CACHE, digestJson, { expirationTtl: 3600 });
        return new Response(digestJson, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
    }

    // ── GET /read — S1 cached KV value ───────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/read') {
      const raw = await env.KKME_SIGNALS.get('s1');
      if (!raw) {
        return new Response(JSON.stringify({ error: 'not yet populated' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      return new Response(raw, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS },
      });
    }

    // ── GET / — fresh S1 fetch + write to KV (manual trigger) ────────────────
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
