/**
 * KKME — S1 Baltic Price Separation Worker
 * Cron: 0 6 * * * (06:00 UTC daily, after day-ahead auction results are published)
 *
 * Fetches LT and SE4 day-ahead prices from ENTSO-E Transparency API (A44),
 * computes separation %, determines signal state, writes JSON to KV.
 *
 * Secrets: set ENTSOE_API_KEY via `wrangler secret put ENTSOE_API_KEY`
 */

const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const LT_BZN = '10YLT-1001A0008Q';   // Lithuania bidding zone
const SE4_BZN = '10Y1001A1001A47J';  // Sweden SE4 bidding zone (Nordic reference)

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

export default {
  /** Cron trigger — runs daily at 06:00 UTC */
  async scheduled(_event, env, _ctx) {
    const data = await computeS1(env);
    await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
    console.log(`[S1] Written: ${data.state} ${data.separation_pct}% (LT ${data.lt_avg_eur_mwh} vs SE4 ${data.se4_avg_eur_mwh} €/MWh)`);
  },

  /** HTTP trigger — two paths:
   *  GET /      → fresh fetch from ENTSO-E, writes to KV, returns result (manual refresh)
   *  GET /read  → returns current KV value without touching ENTSO-E (used by Next.js API route)
   */
  async fetch(request, env, _ctx) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Read-only path: return cached KV value — called by /api/signals/s1 in production
    if (url.pathname === '/read') {
      const raw = await env.KKME_SIGNALS.get('s1');
      if (!raw) {
        return new Response(JSON.stringify({ error: 'not yet populated' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(raw, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // Default: fresh fetch + write to KV (manual trigger / health check)
    try {
      const data = await computeS1(env);
      await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
