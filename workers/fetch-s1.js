/**
 * KKME — Signal Worker
 * Cron: 0 6 * * * (06:00 UTC daily)
 *
 * Endpoints:
 *   GET /               → fresh S1 fetch + KV write (manual trigger)
 *   GET /read           → cached S1 KV value (fetched by S1Card)
 *   GET /s4             → cached S4 KV value; computes fresh if empty
 *   POST /curate        → store CurationEntry in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → Anthropic haiku digest; cached 1h
 *   POST /telegram      → Telegram webhook
 *   POST /telegram/setup → register Telegram webhook (run once)
 *
 * Secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY
 *          TELEGRAM_BOT_TOKEN · TELEGRAM_WEBHOOK_SECRET
 * KV binding: KKME_SIGNALS
 */

const ENTSOE_API    = 'https://web-api.tp.entsoe.eu/api';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TELEGRAM_API  = 'https://api.telegram.org';
const WORKER_URL    = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const LT_BZN  = '10YLT-1001A0008Q';
const SE4_BZN = '10Y1001A1001A47J';

const S4_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/8/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1000&where=1%3D1&orderByFields=&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects';

const KV_CURATION_PREFIX = 'curation:';
const KV_CURATIONS_INDEX  = 'curations:index';
const KV_DIGEST_CACHE     = 'digest:cache';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

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

async function fetchBznRange(bzn, apiKey, startOffset, endOffset) {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('documentType', 'A44');
  url.searchParams.set('in_Domain', bzn);
  url.searchParams.set('out_Domain', bzn);
  url.searchParams.set('periodStart', utcPeriod(startOffset));
  url.searchParams.set('periodEnd', utcPeriod(endOffset));
  url.searchParams.set('securityToken', apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    return extractPrices(await res.text());
  } catch {
    return [];
  }
}

async function computeHistorical(apiKey) {
  try {
    const [lt30, se430, ltRef, se4Ref] = await Promise.all([
      fetchBznRange(LT_BZN,  apiKey, -30,  1),
      fetchBznRange(SE4_BZN, apiKey, -30,  1),
      fetchBznRange(LT_BZN,  apiKey, -120, -90),
      fetchBznRange(SE4_BZN, apiKey, -120, -90),
    ]);

    const len = Math.min(lt30.length, se430.length);
    if (len === 0) return { rsi_30d: null, trend_vs_90d: null, pct_hours_above_20: null };

    let spreadSum = 0;
    let hoursAbove20 = 0;
    for (let i = 0; i < len; i++) {
      const spread = lt30[i] - se430[i];
      const pct    = se430[i] !== 0 ? (spread / se430[i]) * 100 : 0;
      spreadSum += spread;
      if (pct > 20) hoursAbove20++;
    }
    const rsi_30d            = Math.round((spreadSum / len) * 100) / 100;
    const pct_hours_above_20 = Math.round((hoursAbove20 / len) * 1000) / 10;

    const lenRef = Math.min(ltRef.length, se4Ref.length);
    let trend_vs_90d = null;
    if (lenRef > 0) {
      let refSum = 0;
      for (let i = 0; i < lenRef; i++) refSum += ltRef[i] - se4Ref[i];
      trend_vs_90d = Math.round((rsi_30d - refSum / lenRef) * 100) / 100;
    }

    return { rsi_30d, trend_vs_90d, pct_hours_above_20 };
  } catch {
    return { rsi_30d: null, trend_vs_90d: null, pct_hours_above_20: null };
  }
}

async function computeS1(env) {
  const apiKey = env.ENTSOE_API_KEY;
  if (!apiKey) throw new Error('ENTSOE_API_KEY secret not set');

  const [[ltXml, se4Xml], historical] = await Promise.all([
    Promise.all([fetchBzn(LT_BZN, apiKey), fetchBzn(SE4_BZN, apiKey)]),
    computeHistorical(apiKey),
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
    lt_avg_eur_mwh:      Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh:     Math.round(se4Avg * 100) / 100,
    spread_eur_mwh:      Math.round(spread * 100) / 100,
    separation_pct:      Math.round(separationPct * 10) / 10,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
    ...historical,
  };
}

// ─── S4 — Grid Connection Scarcity ────────────────────────────────────────────

function s4SignalLevel(freeMw) {
  if (freeMw > 2000) return 'OPEN';
  if (freeMw >= 500)  return 'TIGHTENING';
  return 'SCARCE';
}

const S4_INTERPRETATION = {
  OPEN:       'Grid capacity available. Connection reservation costs stable (~€50k/MW). Window open for new project origination.',
  TIGHTENING: 'Free capacity compressing. RTB reservations repricing. Move on viable nodes before queue closes.',
  SCARCE:     'Hard constraint approaching. Existing reservations repricing above €60k/MW. New entry difficult.',
};

async function computeS4() {
  const res = await fetch(S4_URL);
  if (!res.ok) throw new Error(`S4 FeatureServer: HTTP ${res.status}`);

  const json = await res.json();
  const feature = json.features?.find((f) => f.attributes?.Tipas === 'Kaupikliai');
  if (!feature) throw new Error('S4: Kaupikliai row not found in FeatureServer response');

  const a = feature.attributes;
  const free_mw      = a.Laisva_galia_prijungimui    ?? 0;
  const connected_mw = a.Prijungtoji_galia_PT         ?? 0;
  const reserved_mw  = a.Pasirasytu_ketinimu_pro_galia ?? 0;

  const utilisation_pct = (connected_mw + free_mw) > 0
    ? Math.round((connected_mw / (connected_mw + free_mw)) * 1000) / 10
    : 0;

  const signal = s4SignalLevel(free_mw);

  return {
    timestamp: new Date().toISOString(),
    free_mw,
    connected_mw,
    reserved_mw,
    utilisation_pct,
    signal,
    interpretation: S4_INTERPRETATION[signal],
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
    } catch { /* skip */ }
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
  await kv.delete(KV_DIGEST_CACHE);
}

// ─── Digest via Anthropic ──────────────────────────────────────────────────────

async function buildDigest(entries, anthropicKey) {
  const sorted    = [...entries].sort((a, b) => b.relevance - a.relevance).slice(0, 15);
  const itemsText = sorted.map((e, i) =>
    `[${i + 1}] relevance=${e.relevance} source=${e.source}\nTitle: ${e.title}\nURL: ${e.url}\nText: ${e.raw_text.slice(0, 600)}`
  ).join('\n\n');

  const prompt = `You are an infrastructure intelligence analyst. Below are ${sorted.length} curated articles from the past 7 days, ranked by relevance (1–5). Summarize each into a concise DigestItem. Focus on Baltic energy markets, grid infrastructure, BESS, and related macro signals.

For each article, return a JSON object with:
- id: string
- title: string (sharp, factual, ≤10 words)
- summary: string (2–3 sentences, specific facts)
- source: string
- url: string
- date: string (ISO 8601, copy created_at)
- relevance: number

Return ONLY a valid JSON array. No markdown, no commentary.

Articles:
${itemsText}`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
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

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim().slice(0, 3000);
}

function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim().slice(0, 120) : '';
}

async function fetchPage(pageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(pageUrl, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KKMEBot/1.0)' }, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok) return { title: '', text: '' };
    const html = await res.text();
    return { title: extractHtmlTitle(html), text: htmlToText(html) };
  } catch { clearTimeout(timer); return { title: '', text: '' }; }
}

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
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
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

async function tgSend(chatId, text, botToken) {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function processTelegramMessage(message, env) {
  const chatId   = message.chat.id;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const rawText  = (message.text || message.caption || '').trim();
  if (!rawText) return;

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) { await tgSend(chatId, '⚠️ ANTHROPIC_API_KEY not set on Worker', botToken); return; }

  try {
    const urlMatch = rawText.match(URL_REGEX);
    const pageUrl  = urlMatch ? urlMatch[0].replace(/[.,)>]+$/, '') : '';
    let content = rawText, pageTitle = '', source = 'telegram';

    if (pageUrl) {
      const page = await fetchPage(pageUrl);
      pageTitle = page.title;
      try { source = new URL(pageUrl).hostname; } catch { /* keep 'telegram' */ }
      const extra = rawText.replace(urlMatch[0], '').trim();
      content = [pageTitle, page.text, extra].filter(Boolean).join('\n\n');
    }

    const extracted = await extractWithClaude(content.slice(0, 4000), anthropicKey);
    const entry = {
      id: makeId(), url: pageUrl,
      title:      String(extracted.title  || pageTitle || rawText.slice(0, 80)),
      raw_text:   content.slice(0, 2000), source,
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
  /** Cron — 06:00 UTC daily. S1 and S4 run in parallel; each has a 25s hard timeout. */
  async scheduled(_event, env, _ctx) {
    const [s1Result, s4Result] = await Promise.allSettled([
      withTimeout(computeS1(env), 25000),
      withTimeout(computeS4(),    25000),
    ]);

    if (s1Result.status === 'fulfilled') {
      const d = s1Result.value;
      await env.KKME_SIGNALS.put('s1', JSON.stringify(d));
      console.log(`[S1] ${d.state} ${d.separation_pct}% rsi_30d=${d.rsi_30d} cap=${d.pct_hours_above_20}%`);
    } else {
      console.error('[S1] cron failed:', s1Result.reason);
    }

    if (s4Result.status === 'fulfilled') {
      const d = s4Result.value;
      await env.KKME_SIGNALS.put('s4', JSON.stringify(d));
      console.log(`[S4] ${d.signal} free=${d.free_mw}MW utilisation=${d.utilisation_pct}%`);
    } else {
      console.error('[S4] cron failed:', s4Result.reason);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    // ── POST /telegram ───────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/telegram') {
      const incoming = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (!env.TELEGRAM_WEBHOOK_SECRET || incoming !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      if (!env.TELEGRAM_BOT_TOKEN) return new Response('TELEGRAM_BOT_TOKEN not set', { status: 503 });
      let update;
      try { update = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      const message = update.message || update.channel_post;
      if (message) ctx.waitUntil(processTelegramMessage(message, env));
      return new Response('OK', { status: 200 });
    }

    // ── POST /telegram/setup ─────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/telegram/setup') {
      const botToken = env.TELEGRAM_BOT_TOKEN, webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
      if (!botToken || !webhookSecret) {
        return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const res  = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${WORKER_URL}/telegram`, secret_token: webhookSecret, allowed_updates: ['message'] }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── POST /curate ─────────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/curate') {
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const { url: entryUrl, title, raw_text, source, relevance, tags } = body;
      if (!entryUrl || !title || !raw_text || !source || !relevance) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const entry = {
        id: makeId(), url: entryUrl, title, raw_text, source,
        relevance: Number(relevance), tags: Array.isArray(tags) ? tags : [],
        created_at: new Date().toISOString(),
      };
      await storeCurationEntry(env.KKME_SIGNALS, entry);
      return new Response(JSON.stringify({ ok: true, id: entry.id }), { status: 201, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /curations ───────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/curations') {
      const entries = await recentCurations(env.KKME_SIGNALS);
      return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
    }

    // ── GET /digest ──────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/digest') {
      const cached = await env.KKME_SIGNALS.get(KV_DIGEST_CACHE);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      const anthropicKey = env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } });
      const entries = await recentCurations(env.KKME_SIGNALS);
      if (!entries.length) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...CORS } });
      try {
        const digest     = await buildDigest(entries, anthropicKey);
        const digestJson = JSON.stringify(digest);
        await env.KKME_SIGNALS.put(KV_DIGEST_CACHE, digestJson, { expirationTtl: 3600 });
        return new Response(digestJson, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── GET /s4 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s4') {
      const cached = await env.KKME_SIGNALS.get('s4');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await computeS4();
        await env.KKME_SIGNALS.put('s4', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── GET /read ────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/read') {
      const raw = await env.KKME_SIGNALS.get('s1');
      if (!raw) return new Response(JSON.stringify({ error: 'not yet populated' }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    // ── GET / — fresh S1 + write to KV ──────────────────────────────────────
    if (request.method === 'GET') {
      try {
        const data = await computeS1(env);
        await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
        return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
