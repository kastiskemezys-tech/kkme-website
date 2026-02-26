/**
 * KKME — Signal Worker
 * Cron: every 4h (0 every-4h) + daily watchdog at 09:00 UTC
 *
 * Endpoints:
 *   GET /               → fresh S1 fetch + KV write (manual trigger)
 *   GET /read           → cached S1 KV value (fetched by S1Card)
 *   GET /s2             → S2 KV (defaults if empty)
 *   POST /s2/update     → write S2 payload to KV (Mac cron, validated)
 *   GET /s3             → cached S3 KV value; computes fresh if empty
 *   GET /s4             → cached S4 KV value; computes fresh if empty
 *   POST /curate        → store CurationEntry in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → Anthropic haiku digest; cached 1h
 *   GET /health         → structured health of all signals + Mac cron ping
 *   POST /heartbeat     → record Mac cron ping (requires X-Update-Secret)
 *
 * Secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET
 *          TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
 * KV binding: KKME_SIGNALS
 */

import { DEFAULTS, STALE_THRESHOLDS_HOURS } from './lib/defaults.js';
import { kvWrite, checkBounds, checkRequired } from './lib/kv.js';
import { notifyTelegram } from './lib/notify.js';

const ENTSOE_API    = 'https://web-api.tp.entsoe.eu/api';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const WORKER_URL    = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const LT_BZN  = '10YLT-1001A0008Q';
const SE4_BZN = '10Y1001A1001A47J';

const S4_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/8/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1000&where=1%3D1&orderByFields=&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects';

// ECB Data Portal — 3M Euribor monthly (FM dataset)
const ECB_EURIBOR_URL = 'https://data.ecb.europa.eu/api/v1/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=3&format=jsondata';

// Nord Pool DA — LT + SE4 day-ahead prices (latest delivery date)
const NP_DA_URL = 'https://data.nordpoolgroup.com/api/v1/auction/prices/areas';

const KV_CURATION_PREFIX = 'curation:';
const KV_CURATIONS_INDEX  = 'curations:index';
const KV_DIGEST_CACHE     = 'digest:cache';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Update-Secret',
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

  // Fetch today, tomorrow (best-effort), and historical in parallel
  const [[ltXml, se4Xml], historical, ltTomorrow, se4Tomorrow] = await Promise.all([
    Promise.all([fetchBzn(LT_BZN, apiKey), fetchBzn(SE4_BZN, apiKey)]),
    computeHistorical(apiKey),
    fetchBznRange(LT_BZN,  apiKey, 1, 2),  // null before ~13:00 CET publication
    fetchBznRange(SE4_BZN, apiKey, 1, 2),
  ]);

  const ltPrices  = extractPrices(ltXml);
  const se4Prices = extractPrices(se4Xml);

  if (!ltPrices.length || !se4Prices.length) {
    throw new Error(`No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h`);
  }

  const ltAvg  = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;

  // BUG 2 FIX: guard against near-zero or negative SE4 (explodes % when SE4 < €10)
  const separationPct = (spread / Math.max(Math.abs(se4Avg), 10)) * 100;

  // Intraday swing: max - min of LT hourly prices (arbitrage window for trading revenue)
  const lt_daily_swing_eur_mwh = ltPrices.length >= 2
    ? Math.round((Math.max(...ltPrices) - Math.min(...ltPrices)) * 100) / 100
    : null;

  // Evening premium: mean(LT h17-21) - mean(LT h10-14) — peak vs shoulder
  const ltEvening  = ltPrices.slice(17, 22);   // hours 17,18,19,20,21
  const ltShoulder = ltPrices.slice(10, 15);   // hours 10,11,12,13,14
  const lt_evening_premium = (ltEvening.length && ltShoulder.length)
    ? Math.round((avg(ltEvening) - avg(ltShoulder)) * 100) / 100
    : null;

  console.log(`[S1] coupling_spread=${Math.round(spread*100)/100}€/MWh intraday_swing=${lt_daily_swing_eur_mwh}€/MWh evening_premium=${lt_evening_premium}€/MWh`);
  if (lt_daily_swing_eur_mwh !== null && lt_daily_swing_eur_mwh < spread) {
    console.warn(`[S1] WARNING: swing (${lt_daily_swing_eur_mwh}) < coupling spread (${Math.round(spread*100)/100}) — unusual`);
  }

  // DA tomorrow — populated only after ENTSO-E publishes (~13:00 CET)
  let da_tomorrow = null;
  if (ltTomorrow.length && se4Tomorrow.length) {
    const ltTomAvg  = avg(ltTomorrow);
    const se4TomAvg = avg(se4Tomorrow);
    // BUG 1 FIX: use tomorrow variables in denominator; guard against near-zero SE4
    const tomSpreadPct = (ltTomAvg - se4TomAvg) / Math.max(Math.abs(se4TomAvg), 10) * 100;
    const tomDate = new Date();
    tomDate.setUTCDate(tomDate.getUTCDate() + 1);
    da_tomorrow = {
      lt_peak:       Math.round(Math.max(...ltTomorrow) * 100) / 100,
      lt_trough:     Math.round(Math.min(...ltTomorrow) * 100) / 100,
      lt_avg:        Math.round(ltTomAvg * 100) / 100,
      se4_avg:       Math.round(se4TomAvg * 100) / 100,
      spread_pct:    Math.round(tomSpreadPct * 10) / 10,
      delivery_date: tomDate.toISOString().slice(0, 10),
    };
    console.log(`[S1/tomorrow] lt_avg=${da_tomorrow.lt_avg} lt_peak=${da_tomorrow.lt_peak} se4_avg=${da_tomorrow.se4_avg} spread=${da_tomorrow.spread_pct}%`);
  } else {
    console.log(`[S1/tomorrow] not yet published (lt=${ltTomorrow.length}h se4=${se4Tomorrow.length}h)`);
  }

  return {
    signal: 'S1',
    name: 'Baltic Price Separation',
    lt_avg_eur_mwh:            Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh:           Math.round(se4Avg * 100) / 100,
    spread_eur_mwh:            Math.round(spread * 100) / 100,
    separation_pct:            Math.round(separationPct * 10) / 10,
    lt_daily_swing_eur_mwh,
    lt_evening_premium,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
    da_tomorrow,
    ...historical,
  };
}

// ─── S1 Rolling History (90-day KV store) ─────────────────────────────────────

const HISTORY_KEY = 's1_history';
const MAX_HISTORY = 90; // days

async function updateHistory(env, todayEntry) {
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get(HISTORY_KEY);
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }

  history.push({
    date:       todayEntry.updated_at.split('T')[0],
    spread_eur: todayEntry.spread_eur_mwh,
    spread_pct: todayEntry.separation_pct,
    lt_swing:   todayEntry.lt_daily_swing_eur_mwh,
  });

  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  await env.KKME_SIGNALS.put(HISTORY_KEY, JSON.stringify(history));
  return history;
}

function rollingStats(history, field) {
  const vals = history
    .map(h => h[field])
    .filter(v => v != null)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const p = (pct) => vals[Math.floor(vals.length * pct)] ?? vals[vals.length - 1];
  return {
    p25: Math.round(p(0.25) * 100) / 100,
    p50: Math.round(p(0.50) * 100) / 100,
    p75: Math.round(p(0.75) * 100) / 100,
    p90: Math.round(p(0.90) * 100) / 100,
    n:   vals.length,
    days_of_data: vals.length,
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

// ─── S3 — Cell Cost Stack ───────────────────────────────────────────────────────
// Layer 1: Trading Economics — Chinese lithium carbonate CNY/T (trend direction)
// Layer 2: InfoLink — DC-side 2h ESS system bid price RMB/Wh (best effort)
// Layer 3: Static BNEF/Ember Dec 2025 turnkey cost anchors (hardcoded, update quarterly)

const TE_URL = 'https://tradingeconomics.com/commodity/lithium';
const TE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const INFOLINK_URL = 'https://www.infolink-group.com/energy-article/ess-spot-price-20260106';

// FX fallback (EUR base) — used if Frankfurter API unavailable
const FX_FALLBACK = { usd: 1.05, cny: 7.60 }; // approximate EUR/USD, EUR/CNY Feb 2026

// BNEF Dec 2025 anchor costs, pre-converted to EUR using ~0.93 EUR/USD
const S3_REFS = {
  china_system_eur_kwh:  68,
  europe_system_eur_kwh: 164,
  global_avg_eur_kwh:    109,
  ref_source: 'BNEF Dec 2025 / frankfurter.app FX',
  ref_date:   '2025-12',
};

// Layer 1 — lithium carbonate trend (threshold-based; no historical storage)
function lithiumTrend(cnyT) {
  if (cnyT < 120000) return '↓ falling';
  if (cnyT <= 180000) return '→ stable';
  return '↑ rising';
}

// Signal: COMPRESSING | STABLE | PRESSURE | WATCH
function s3SignalLevel(trend, cellEurKwh) {
  if (trend === '↓ falling') return 'COMPRESSING';
  if (trend === '→ stable')  return 'STABLE';
  // trend === '↑ rising'
  if (cellEurKwh !== null && cellEurKwh > 90) return 'PRESSURE';
  return 'WATCH';
}

const S3_INTERPRETATION = {
  COMPRESSING: 'Upstream costs falling. LFP cell direction negative — capex window improving. China system floor €68/kWh (BNEF Dec 2025).',
  STABLE:      'Cost stack within range. Lithium flat, cell prices tracking baseline. EU installed ~€164/kWh vs China €68/kWh gap persists.',
  PRESSURE:    'Upstream cost pressure building. Lithium rising. Re-check OEM quotes before fixing capex assumptions.',
  WATCH:       'Lithium elevated. Cell price direction unclear — verify latest OEM quotes directly.',
};

// Returns {price, unit} or null.
function parseLithiumPrice(html) {
  // Pattern 1 (most reliable): meta description "Lithium rose/fell to 161,750 CNY/T"
  const cnyMeta = html.match(/Lithium\s+(?:rose|fell)[^"]*?to\s+([\d,]+)\s+CNY\/T/i);
  if (cnyMeta) {
    const val = parseFloat(cnyMeta[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 500000) return { price: val, unit: 'CNY/T' };
  }

  // Pattern 2: any "NNN,NNN CNY/T" pattern anywhere in HTML
  const cnyInline = html.match(/([\d,]+)\s+CNY\/T/i);
  if (cnyInline) {
    const val = parseFloat(cnyInline[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 500000) return { price: val, unit: 'CNY/T' };
  }

  // Pattern 3: embedded JSON "price":"12345" or "last":"12345" (USD range)
  for (const re of [/"price"\s*:\s*"?([\d,]+\.?\d*)"?/, /"last"\s*:\s*"?([\d,]+\.?\d*)"/]) {
    const m = html.match(re);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val >= 5000 && val <= 100000) return { price: val, unit: '$/t' };
    }
  }

  // Pattern 4: data-value attribute
  const dataMatch = html.match(/data-value="([\d,]+\.?\d*)"/);
  if (dataMatch) {
    const val = parseFloat(dataMatch[1].replace(/,/g, ''));
    if (val >= 5000 && val <= 100000) return { price: val, unit: '$/t' };
  }

  return null;
}

// Extract DC-side 2h containerized ESS average price from InfoLink article.
// Target text: "DC-side liquid-cooled containerized ESS (2h)...averaging RMB 0.45/Wh"
function parseInfoLinkDc2h(html) {
  const m = html.match(/DC-side[^)]*\(2h\)[^.]*?averaging\s+RMB\s+([\d.]+)\s*\/\s*Wh/i);
  if (m) {
    const val = parseFloat(m[1]);
    if (val >= 0.2 && val <= 1.5) return val;
  }
  return null;
}

// Fetch live EUR/USD and EUR/CNY rates from Frankfurter; falls back to FX_FALLBACK.
async function fetchFxRates() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,CNY', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const json = await res.json();
    return {
      usd:  json.rates?.USD ?? FX_FALLBACK.usd,
      cny:  json.rates?.CNY ?? FX_FALLBACK.cny,
      date: json.date ?? null,
    };
  } catch (err) {
    clearTimeout(timer);
    console.error('[FX] frankfurter.app failed, using fallback rates:', String(err));
    return { usd: FX_FALLBACK.usd, cny: FX_FALLBACK.cny, date: null };
  }
}

async function computeS3() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let teStatus = null;
  let bodyPreview = '';

  try {
    // Fetch FX rates in parallel with TE scrape
    const [fx, teRes] = await Promise.all([
      fetchFxRates(),
      fetch(TE_URL, { signal: controller.signal, headers: TE_HEADERS, redirect: 'follow' }),
    ]);
    clearTimeout(timer);
    teStatus = teRes.status;

    if (!teRes.ok) {
      bodyPreview = (await teRes.text().catch(() => '')).slice(0, 500);
      return {
        timestamp: new Date().toISOString(),
        unavailable: true,
        signal: 'STABLE',
        ...S3_REFS,
        fx_rates: { usd: fx.usd, cny: fx.cny },
        fx_timestamp: fx.date,
        interpretation: 'Data temporarily unavailable.',
        source: 'tradingeconomics.com + infolink-group.com',
        _scrape_error: `TE HTTP ${teRes.status}`,
        _scrape_debug: { status: teStatus, bodyPreview },
      };
    }

    const teHtml = await teRes.text();
    bodyPreview = teHtml.slice(0, 500);

    const parsed = parseLithiumPrice(teHtml);
    if (parsed === null) {
      return {
        timestamp: new Date().toISOString(),
        unavailable: true,
        signal: 'STABLE',
        ...S3_REFS,
        fx_rates: { usd: fx.usd, cny: fx.cny },
        fx_timestamp: fx.date,
        interpretation: 'Price parse failed — check _scrape_debug.',
        source: 'tradingeconomics.com + infolink-group.com',
        _scrape_error: 'TE price not found in HTML',
        _scrape_debug: { status: teStatus, bodyPreview },
      };
    }

    // Raw CNY value used for trend/signal logic (internal only, never stored)
    const lithium_cny_t = parsed.unit === 'CNY/T' ? parsed.price : Math.round(parsed.price * 7.27);
    const lithium_trend = lithiumTrend(lithium_cny_t);
    const lithium_eur_t = Math.round(lithium_cny_t / fx.cny);

    // Layer 2: InfoLink ESS 2h DC system price (best effort, 10s timeout)
    let cell_eur_kwh = null;
    try {
      const ilCtrl  = new AbortController();
      const ilTimer = setTimeout(() => ilCtrl.abort(), 10000);
      const ilRes   = await fetch(INFOLINK_URL, {
        signal: ilCtrl.signal,
        headers: { 'User-Agent': TE_HEADERS['User-Agent'], 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.5' },
      });
      clearTimeout(ilTimer);
      if (ilRes.ok) {
        const cell_rmb_wh = parseInfoLinkDc2h(await ilRes.text());
        if (cell_rmb_wh !== null) {
          cell_eur_kwh = Math.round(cell_rmb_wh * 1000 / fx.cny * 10) / 10;
        }
      }
    } catch { /* signal computed from Layer 1 alone */ }

    const signal = s3SignalLevel(lithium_trend, cell_eur_kwh);

    return {
      timestamp: new Date().toISOString(),
      lithium_eur_t,
      lithium_trend,
      cell_eur_kwh,
      ...S3_REFS,
      fx_rates: { usd: fx.usd, cny: fx.cny },
      fx_timestamp: fx.date,
      signal,
      interpretation: S3_INTERPRETATION[signal],
      source: 'tradingeconomics.com + infolink-group.com',
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      timestamp: new Date().toISOString(),
      unavailable: true,
      signal: 'STABLE',
      ...S3_REFS,
      interpretation: 'Data temporarily unavailable.',
      source: 'tradingeconomics.com + infolink-group.com',
      _scrape_error: String(err),
      _scrape_debug: { status: teStatus, bodyPreview },
    };
  }
}

// ─── Nord Pool DA ──────────────────────────────────────────────────────────────
// Fetches latest published DA prices for LT and SE4 from Nord Pool.
// Runs in cron (CF IP may be blocked) + Mac cron fallback via POST /da_tomorrow/update.

function npShapeMetrics(ltPrices, se4Prices) {
  if (!ltPrices.length || !se4Prices.length) return null;
  const ltAvg    = ltPrices.reduce((a, b) => a + b, 0) / ltPrices.length;
  const se4Avg   = se4Prices.reduce((a, b) => a + b, 0) / se4Prices.length;
  const spreadPct = se4Avg !== 0 ? ((ltAvg - se4Avg) / se4Avg) * 100 : 0;
  return {
    lt_peak:   Math.round(Math.max(...ltPrices) * 100) / 100,
    lt_trough: Math.round(Math.min(...ltPrices) * 100) / 100,
    lt_avg:    Math.round(ltAvg * 100) / 100,
    se4_avg:   Math.round(se4Avg * 100) / 100,
    spread_pct: Math.round(spreadPct * 10) / 10,
  };
}

async function fetchNordPoolDA() {
  const url = new URL(NP_DA_URL);
  url.searchParams.set('deliveryDate', 'latest');
  url.searchParams.set('currency', 'EUR');
  url.searchParams.set('deliveryAreas', 'LT,SE4');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`NordPool HTTP ${res.status}`);
    const json = await res.json();

    const ltPrices = [], se4Prices = [];
    let deliveryDate = null;

    // Format A: { multiAreaEntries: [{ deliveryStart, entryPerArea: { LT, SE4 } }] }
    if (Array.isArray(json.multiAreaEntries)) {
      deliveryDate = json.multiAreaEntries[0]?.deliveryStart?.slice(0, 10) ?? null;
      for (const e of json.multiAreaEntries) {
        const lt  = e.entryPerArea?.LT;
        const se4 = e.entryPerArea?.SE4;
        if (lt  != null && !isNaN(+lt))  ltPrices.push(+lt);
        if (se4 != null && !isNaN(+se4)) se4Prices.push(+se4);
      }
    }
    // Format B: flat array [{ LT, SE4, deliveryDate }, ...]
    else if (Array.isArray(json)) {
      deliveryDate = json[0]?.deliveryDate ?? null;
      for (const e of json) {
        const lt  = e.LT  ?? e.lt;
        const se4 = e.SE4 ?? e.se4;
        if (lt  != null && !isNaN(+lt))  ltPrices.push(+lt);
        if (se4 != null && !isNaN(+se4)) se4Prices.push(+se4);
      }
    }

    console.log(`[NP/DA] parsed: lt=${ltPrices.length}h se4=${se4Prices.length}h date=${deliveryDate}`);
    const metrics = npShapeMetrics(ltPrices, se4Prices);
    if (!metrics) throw new Error('NordPool: no LT/SE4 price data found in response');

    return { ...metrics, delivery_date: deliveryDate, timestamp: new Date().toISOString() };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Euribor + HICP ────────────────────────────────────────────────────────────
// ECB Data Portal — nominal 3M Euribor (FM dataset) + HICP YoY inflation

// ECB series keys:
//   Nominal 3M Euribor: FM.M.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA
//   HICP inflation YoY: ICP.M.U2.N.000000.4.ANR
const ECB_EURIBOR_NOMINAL_URL = 'https://data-api.ecb.europa.eu/service/data/FM.M.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA?lastNObservations=3&format=jsondata';
const ECB_HICP_URL            = 'https://data-api.ecb.europa.eu/service/data/ICP.M.U2.N.000000.4.ANR?lastNObservations=3&format=jsondata';

function ecbExtractLastValue(json) {
  try {
    const obs = json?.dataSets?.[0]?.series?.['0:0:0:0:0:0']?.observations
             ?? json?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations
             ?? json?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0']?.observations;
    if (!obs) return null;
    const keys = Object.keys(obs).map(Number).sort((a, b) => b - a);
    const val  = obs[keys[0]]?.[0];
    return val != null && !isNaN(+val) ? Math.round(+val * 100) / 100 : null;
  } catch { return null; }
}

async function computeEuribor() {
  const FALLBACK = { euribor_nominal_3m: 2.6, hicp_yoy: 2.4 };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const [eurRes, hicpRes] = await Promise.allSettled([
      fetch(ECB_EURIBOR_NOMINAL_URL, { signal: controller.signal }),
      fetch(ECB_HICP_URL,            { signal: controller.signal }),
    ]);
    clearTimeout(timer);

    let euribor_nominal_3m = FALLBACK.euribor_nominal_3m;
    let hicp_yoy           = FALLBACK.hicp_yoy;
    let source             = 'fallback';

    if (eurRes.status === 'fulfilled' && eurRes.value.ok) {
      const val = ecbExtractLastValue(await eurRes.value.json());
      if (val !== null) { euribor_nominal_3m = val; source = 'ecb-live'; }
    }
    if (hicpRes.status === 'fulfilled' && hicpRes.value.ok) {
      const val = ecbExtractLastValue(await hicpRes.value.json());
      if (val !== null) { hicp_yoy = val; }
    }

    const euribor_real_3m   = Math.round((euribor_nominal_3m - hicp_yoy) * 100) / 100;
    const euribor_trend     = euribor_nominal_3m < 2.7 ? '↓ falling' : euribor_nominal_3m > 3.0 ? '↑ rising' : '→ stable';

    console.log(`[Euribor] nominal=${euribor_nominal_3m}% hicp=${hicp_yoy}% real=${euribor_real_3m}% source=${source}`);
    return {
      euribor_nominal_3m,
      euribor_3m:      euribor_nominal_3m,  // alias for backward compat
      euribor_real_3m,
      hicp_yoy,
      euribor_trend,
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Euribor] fetch failed, using fallback:', String(err));
    const { euribor_nominal_3m, hicp_yoy } = FALLBACK;
    return {
      euribor_nominal_3m,
      euribor_3m:      euribor_nominal_3m,
      euribor_real_3m: Math.round((euribor_nominal_3m - hicp_yoy) * 100) / 100,
      hicp_yoy,
      euribor_trend:   '↓ falling',
      source:          'fallback',
      timestamp:       new Date().toISOString(),
    };
  }
}

// ─── S2 — Balancing Stack ───────────────────────────────────────────────────────
// S2 data is pushed to POST /s2/update by the Mac cron.
// Caller sends raw BTD JSON: { reserves, direction, imbalance }
// Worker parses and shapes the payload before writing to KV.
//
// Confirmed BTD structure (price_procured_reserves):
//   d.data.timeseries = [{ from, to, values: [15 numbers] }, ...]
//   values indices for Lithuania:
//     [10] FCR Symmetric (EUR/MW/h)
//     [11] aFRR Upward
//     [12] aFRR Downward
//     [13] mFRR Upward
//     [14] mFRR Downward
//   Data publishes with ~2 day lag — fetch window: 9 days ago → 2 days ago

function s2Mean(arr)  { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function s2P90(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
}
function s2r2(n) { return n === null ? null : Math.round(n * 100) / 100; }

// Extract a column by index from d.data.timeseries rows, filtering nulls.
function s2ExtractIdx(raw, idx) {
  try {
    const rows = raw?.data?.timeseries;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(row => {
      const v = row?.values?.[idx];
      return (v !== null && v !== undefined && !isNaN(+v)) ? [+v] : [];
    });
  } catch { return []; }
}

// Fallback column extractor for direction/imbalance datasets (pattern-based).
// direction_of_balancing_v2 and imbalance_prices may have different shapes.
function s2ExtractCol(raw, pattern) {
  if (!raw) return [];
  const pat = pattern.toLowerCase();
  try {
    // Timeseries format (same as reserves)
    const rows = raw?.data?.timeseries;
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0]?.values)) {
      // Can't pattern-match by index — caller must use s2ExtractIdx
      return [];
    }
    // Format A: array of row objects
    if (Array.isArray(raw)) {
      const key = Object.keys(raw[0] || {}).find(k => k.toLowerCase().includes(pat));
      if (!key) return [];
      return raw.flatMap(r => {
        const v = r[key];
        return (v !== null && v !== undefined && v !== '' && !isNaN(+v)) ? [+v] : [];
      });
    }
    // Format B: { headers, data }
    if (raw.data && raw.headers) {
      const hi = raw.headers.findIndex(h => String(h).toLowerCase().includes(pat));
      if (hi < 0) return [];
      return raw.data.flatMap(r => {
        const v = r[hi];
        return (v !== null && v !== undefined && v !== '' && !isNaN(+v)) ? [+v] : [];
      });
    }
    return [];
  } catch { return []; }
}

// Recalibrated signal thresholds based on confirmed BTD data.
// Post-sync FCR avg currently ~90 €/MW/h (Feb 2026).
const S2_INTERPRETATION = {
  EARLY:       (fcr) => `FCR clearing at ~€${fcr}/MW/h — post-sync price discovery regime. Early BESS assets capturing outsized capacity prices before market deepens. aFRR stack also open.`,
  ACTIVE:      () => 'Capacity market normalising. FCR/aFRR revenue intact. Monitor for compression trend as new BESS enters.',
  COMPRESSING: () => 'Capacity prices thinning. New BESS penetration compressing clearing prices. Revenue mix shifting toward intraday trading.',
};

// Parse raw BTD { reserves, direction, imbalance } into a shaped S2 KV payload.
function s2ShapePayload(reserves, direction, imbalance) {
  // price_procured_reserves: extract Lithuania columns by confirmed index
  const fcrVals      = s2ExtractIdx(reserves, 10);  // FCR Symmetric
  const afrrUpVals   = s2ExtractIdx(reserves, 11);  // aFRR Upward
  const afrrDownVals = s2ExtractIdx(reserves, 12);  // aFRR Downward
  const mfrrUpVals   = s2ExtractIdx(reserves, 13);  // mFRR Upward
  const mfrrDownVals = s2ExtractIdx(reserves, 14);  // mFRR Downward

  // direction_of_balancing_v2: try timeseries first, then pattern fallback
  let dirVals = [];
  if (direction?.data?.timeseries) {
    // direction timeseries values[0] is typically Lithuania
    dirVals = s2ExtractIdx(direction, 0);
    if (!dirVals.length) dirVals = s2ExtractIdx(direction, 1);
  }
  if (!dirVals.length) dirVals = s2ExtractCol(direction, 'lithuania');
  if (!dirVals.length) dirVals = s2ExtractCol(direction, 'lt');

  // imbalance_prices: try timeseries first, then pattern fallback
  let imbVals = [];
  if (imbalance?.data?.timeseries) {
    // Preliminary column — typically index 0 or 1 for Lithuania
    imbVals = s2ExtractIdx(imbalance, 0);
    if (!imbVals.length) imbVals = s2ExtractIdx(imbalance, 1);
  }
  if (!imbVals.length) imbVals = s2ExtractCol(imbalance, 'preliminary');
  if (!imbVals.length) imbVals = s2ExtractCol(imbalance, 'lithuania');

  const fcr_avg       = s2r2(s2Mean(fcrVals));
  const afrr_up_avg   = s2r2(s2Mean(afrrUpVals));
  const afrr_down_avg = s2r2(s2Mean(afrrDownVals));
  const mfrr_up_avg   = s2r2(s2Mean(mfrrUpVals));
  const mfrr_down_avg = s2r2(s2Mean(mfrrDownVals));
  const pct_up        = dirVals.length ? s2r2(dirVals.filter(v => v > 0).length / dirVals.length * 100) : null;
  const pct_down      = dirVals.length ? s2r2(dirVals.filter(v => v < 0).length / dirVals.length * 100) : null;
  const imbalance_mean = s2r2(s2Mean(imbVals));
  const imbalance_p90  = s2r2(s2P90(imbVals));
  const pct_above_100  = imbVals.length ? s2r2(imbVals.filter(v => v > 100).length / imbVals.length * 100) : null;

  // Recalibrated thresholds (post-sync, Feb 2026 baseline ~90 €/MW/h)
  let signal;
  if (fcr_avg !== null) {
    if (fcr_avg > 50)      signal = 'EARLY';
    else if (fcr_avg >= 15) signal = 'ACTIVE';
    else                    signal = 'COMPRESSING';
  } else {
    signal = 'ACTIVE';
  }

  // CVI — Capacity Value Index (per MW of installed battery power, 0.5 MW service each)
  // Baltic prequalification: 2 MW power per 1 MW service → 0.5 MW per MW installed
  // These are THEORETICAL MAXIMUMS if fully allocated to each market — actual dispatch lower.
  const afrr_annual_per_mw_installed = afrr_up_avg !== null
    ? Math.round(afrr_up_avg * 8760 * 0.97 * 0.5)
    : null;
  const mfrr_annual_per_mw_installed = mfrr_up_avg !== null
    ? Math.round(mfrr_up_avg * 8760 * 0.97 * 0.5)
    : null;
  // Note: do NOT sum aFRR + mFRR — each MW is in ONE market per hour, not both simultaneously.
  // Keep cvi_afrr/cvi_mfrr as separate full-allocation theoretical refs (for LLM context).
  const cvi_afrr_eur_mw_yr = afrr_up_avg !== null
    ? Math.round(afrr_up_avg * 8760 * 0.97)
    : null;
  const cvi_mfrr_eur_mw_yr = mfrr_up_avg !== null
    ? Math.round(mfrr_up_avg * 8760 * 0.97)
    : null;

  return {
    timestamp:                  new Date().toISOString(),
    fcr_avg,
    afrr_up_avg,
    afrr_down_avg,
    mfrr_up_avg,
    mfrr_down_avg,
    pct_up,
    pct_down,
    imbalance_mean,
    imbalance_p90,
    pct_above_100,
    afrr_annual_per_mw_installed,
    mfrr_annual_per_mw_installed,
    cvi_afrr_eur_mw_yr,
    cvi_mfrr_eur_mw_yr,
    stress_index_p90:           imbalance_p90,
    fcr_note:                   'FCR: 25MW Baltic market, saturating 2026',
    signal,
    interpretation:  signal === 'EARLY'
      ? S2_INTERPRETATION.EARLY(fcr_avg)
      : S2_INTERPRETATION[signal](),
    source:          'baltic.transparency-dashboard.eu',
  };
}

// ─── Revenue Engine — JS mirror of app/lib/benchmarks.ts + revenueModel.ts ────
// Worker can't import TS modules directly — math duplicated here.

const BESS_WORKER = {
  // Q1 2026: (83+28)€/kWh × duration_MWh/MW × 1000 + 35k€/MW fixed
  capex_per_mw: { h2: 257, h4: 479 }, // €k/MW (Q1 2026: equipment €83/kWh + EPC €28/kWh + HV €35k/MW)
  opex_pct_capex: 0.025,
  aggregator_pct_revenue: 0.08,
  availability: 0.97,
  roundtrip_efficiency: 0.85,
  project_life_years: 18,
  ch_irr_central: { h2: 16.6, h4: 10.8 },
  ch_irr_low:     { h2: 6,    h4: 6 },
  ch_irr_high:    { h2: 31,   h4: 20 },
  revenue_peak_note: 'aFRR/mFRR cannibalization begins 2029',
  markets: [
    { country: 'Lithuania',    flag: '🇱🇹', afrr_up_eur_mwh: null, mfrr_up_eur_mwh: null, da_spread_eur_mwh: null, capex_per_mw: 257, irr_central_pct: null, note: 'Post-sync anomaly — peak window 2025-28' },
    { country: 'Great Britain', flag: '🇬🇧', afrr_up_eur_mwh: 14,   mfrr_up_eur_mwh: 10,   da_spread_eur_mwh: 55,  capex_per_mw: 580, irr_central_pct: 12,   note: 'Mature, BM + FFR products' },
    { country: 'Ireland',       flag: '🇮🇪', afrr_up_eur_mwh: 18,   mfrr_up_eur_mwh: 14,   da_spread_eur_mwh: 48,  capex_per_mw: 560, irr_central_pct: 13,   note: 'DS3 + I-SEM, strong frequency market' },
    { country: 'Italy',         flag: '🇮🇹', afrr_up_eur_mwh: 11,   mfrr_up_eur_mwh: 9,    da_spread_eur_mwh: 42,  capex_per_mw: 540, irr_central_pct: 10,   note: 'MSD balancing market' },
    { country: 'Germany',       flag: '🇩🇪', afrr_up_eur_mwh: 8,    mfrr_up_eur_mwh: 7,    da_spread_eur_mwh: 38,  capex_per_mw: 530, irr_central_pct: 8,    note: 'FCR saturated, aFRR compressing' },
    { country: 'Belgium',       flag: '🇧🇪', afrr_up_eur_mwh: 7,    mfrr_up_eur_mwh: 6,    da_spread_eur_mwh: 35,  capex_per_mw: 540, irr_central_pct: 7,    note: 'CRM capacity market support' },
  ],
};

// Battery SOH fade — mirrors revenueModel.ts
const SOH_CURVE_W = [
  1.000, 0.989, 0.978, 0.967, 0.956,
  0.945, 0.934, 0.923, 0.912, 0.900,
  0.893, 0.886, 0.879, 0.872, 0.865,
  0.858, 0.851, 0.844,
];

// Market saturation — CH S1 2025 central scenario (steep aFRR compression)
const MARKET_DECAY_W = [
  { capacity: 1.00, trading: 1.00 },
  { capacity: 0.52, trading: 0.95 },
  { capacity: 0.30, trading: 0.90 },
  { capacity: 0.20, trading: 0.88 },
  { capacity: 0.17, trading: 0.85 },
  { capacity: 0.14, trading: 0.83 },
  { capacity: 0.13, trading: 0.82 },
  { capacity: 0.12, trading: 0.80 },
];
function marketDecayW(t) {
  return MARKET_DECAY_W[Math.min(t - 1, MARKET_DECAY_W.length - 1)];
}
const CAPACITY_FRACTION_W = 0.65;
const TRADING_FRACTION_W  = 0.35;

function computeRevenueWorker(prices, duration_h) {
  const B = BESS_WORKER;
  const key = `h${duration_h}`;
  const capex = B.capex_per_mw[key] * 1000; // €/MW

  // Baltic prequalification: 2 MW power per 1 MW service (binding = power constraint)
  // 4h has more energy but same power rating → still 0.5 MW service per MW installed
  const afrr_mw_provided = 0.5;
  const mfrr_mw_provided = 0.5;

  const afrr_annual  = prices.afrr_up_avg * 8760 * B.availability * afrr_mw_provided;
  const mfrr_annual  = prices.mfrr_up_avg * 8760 * B.availability * mfrr_mw_provided;

  // Trading: 4h stores more energy → larger daily throughput
  // Unit: €/MWh × MWh/MW × cycles/day × days/yr = €/MW/yr ✓
  const capture_factor      = 0.35;
  const duration_mwh_per_mw = duration_h;  // 2h → 2 MWh/MW; 4h → 4 MWh/MW
  const trading_swing       = prices.lt_daily_swing_eur_mwh ?? prices.spread_eur_mwh;
  const trading_annual      = trading_swing * capture_factor * B.cycles_per_day * 365 * duration_mwh_per_mw * B.roundtrip_efficiency;

  const gross_annual = afrr_annual + mfrr_annual + trading_annual;

  const opex_fixed      = capex       * B.opex_pct_capex;
  const opex_aggregator = gross_annual * B.aggregator_pct_revenue;
  const opex_total      = opex_fixed + opex_aggregator;
  const net_annual      = gross_annual - opex_total;
  const payback         = net_annual > 0 ? capex / net_annual : Infinity;

  // IRR via NPV=0 binary search (18yr life, CH central scenario decay)
  function npv(rate) {
    let n = -capex;
    for (let t = 1; t <= B.project_life_years; t++) {
      const soh   = SOH_CURVE_W[Math.min(t - 1, SOH_CURVE_W.length - 1)];
      const mkt   = marketDecayW(t);
      const annual = net_annual * (
        CAPACITY_FRACTION_W * mkt.capacity +
        TRADING_FRACTION_W  * mkt.trading * soh
      );
      n += annual / Math.pow(1 + rate, t);
    }
    return n;
  }
  let lo = 0, hi = 5.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    npv(mid) > 0 ? (lo = mid) : (hi = mid);
  }
  const irr = lo * 100;

  const ch_central = B.ch_irr_central[key];
  const ch_low     = B.ch_irr_low[key];
  const ch_high    = B.ch_irr_high[key];
  const irr_vs_ch  = irr > ch_central * 1.1 ? 'above' :
                     irr < ch_central * 0.9 ? 'below' :
                     'within range of';

  return {
    afrr_annual_per_mw:    Math.round(afrr_annual),
    mfrr_annual_per_mw:    Math.round(mfrr_annual),
    trading_annual_per_mw: Math.round(trading_annual),
    gross_annual_per_mw:   Math.round(gross_annual),
    opex_annual_per_mw:    Math.round(opex_total),
    net_annual_per_mw:     Math.round(net_annual),
    capex_per_mw:          Math.round(capex),
    simple_payback_years:  Math.round(payback * 10) / 10,
    irr_approx_pct:        Math.round(irr * 10) / 10,
    irr_vs_ch_central:     irr_vs_ch,
    ch_irr_central:        ch_central,
    ch_irr_range:          `${ch_low}%–${ch_high}%`,
    market_window_note:    B.revenue_peak_note,
  };
}

function computeMarketComparisonWorker(liveLT) {
  return BESS_WORKER.markets
    .map((m) => {
      const prices = {
        afrr_up_avg:    m.afrr_up_eur_mwh   ?? liveLT.afrr_up_avg,
        mfrr_up_avg:    m.mfrr_up_eur_mwh   ?? liveLT.mfrr_up_avg,
        spread_eur_mwh: m.da_spread_eur_mwh ?? liveLT.spread_eur_mwh,
        euribor_3m:     liveLT.euribor_3m,
      };
      const rev = computeRevenueWorker(prices, 2);
      return {
        country:           m.country,
        flag:              m.flag,
        irr_pct:           m.irr_central_pct ?? rev.irr_approx_pct,
        net_annual_per_mw: rev.net_annual_per_mw,
        capex_per_mw:      m.capex_per_mw * 1000,
        note:              m.note,
        is_live:           m.afrr_up_eur_mwh === null,
      };
    })
    .sort((a, b) => b.irr_pct - a.irr_pct);
}

async function computeInterpretations(signals, revenue, anthropicKey) {
  if (!anthropicKey) return null;
  const { s1, s2, s3, s4 } = signals;
  const { h2, h4 } = revenue;

  // Data completeness check — determines stale-feed warning injection
  const data_completeness = {
    s1: s1?.state != null && !s1?.unavailable,
    s2: s2?.signal != null && s2?.fcr_avg != null && !s2?.unavailable,
    s3: !s3?.unavailable && s3?.lithium_eur_t != null,
    s4: s4?.signal != null && s4?.free_mw != null,
  };
  const all_feeds_live = Object.values(data_completeness).every(Boolean);
  const stale_warning = all_feeds_live
    ? ''
    : `\nFEED WARNING: Some data feeds are stale or unavailable (${
        Object.entries(data_completeness).filter(([, v]) => !v).map(([k]) => k.toUpperCase()).join(', ')
      }) — flag this explicitly in your response for the affected signals.\n`;

  const s4_warning = s4?.parse_warning ? `\n  Parse warning: ${s4.parse_warning}` : '';

  const prompt = `You are a BESS project operator reviewing live market data. State facts. Max 15 words per sentence. No hedging (may, could, suggests, indicates, appears). First sentence: what the number is. Second sentence: what it means for project decisions.${stale_warning}

LIVE SIGNALS (${new Date().toISOString().slice(0, 10)}):

S1 — Baltic Price Separation:
  LT vs SE4: ${s1?.spread_eur_mwh != null ? `${s1.spread_eur_mwh >= 0 ? '+' : ''}${s1.spread_eur_mwh} €/MWh` : '—'} · LT avg ${s1?.lt_avg_eur_mwh ?? '—'} €/MWh · SE4 avg ${s1?.se4_avg_eur_mwh ?? '—'} €/MWh
  Intraday swing: ${s1?.lt_daily_swing_eur_mwh ?? '—'} €/MWh · 90D median spread: ${s1?.spread_stats_90d?.p50 != null ? `${s1.spread_stats_90d.p50 >= 0 ? '+' : ''}${s1.spread_stats_90d.p50.toFixed(1)} €` : '—'}

S2 — Balancing Capacity Prices (BTD, last 7-day window):
  FCR: ${s2?.fcr_avg ?? '—'} €/MW/h · aFRR up: ${s2?.afrr_up_avg ?? '—'} €/MW/h · mFRR up: ${s2?.mfrr_up_avg ?? '—'} €/MW/h
  Stack value (2h BESS): ${s2?.stack_value_2h_eur_mw_yr != null ? `€${Math.round(s2.stack_value_2h_eur_mw_yr / 1000)}k/MW/yr` : '—'}
  FCR total Baltic market depth: 25 MW combined — thin, saturating 2026

S3 — Cell Cost Stack:
  Lithium carbonate: ${s3?.lithium_eur_t != null ? `€${s3.lithium_eur_t}/t` : '—'} (${s3?.lithium_trend ?? '—'})
  Equipment DC (Europe): ${s3?.europe_system_eur_kwh != null ? `€${s3.europe_system_eur_kwh}/kWh` : '—'} · Turnkey AC 2h: €262.5/kWh (CH S1 2025)
  Euribor 3M nominal: ${s3?.euribor_3m != null ? `${s3.euribor_3m}%` : '—'} · HICP YoY: ${s3?.hicp_yoy != null ? `${s3.hicp_yoy}%` : '—'}

S4 — Grid Connection Scarcity:
  Free capacity: ${s4?.free_mw ?? '—'} MW · Connected: ${s4?.connected_mw ?? '—'} MW · Utilisation: ${s4?.utilisation_pct != null ? `${s4.utilisation_pct.toFixed(1)}%` : '—'}${s4_warning}

REVENUE MODEL (50 MW LFP, Lithuania, COD 2026, Clean Horizon S1 2025 reference):
  2h BESS: Net €${h2.net_annual_per_mw}/MW/yr · CAPEX €${h2.capex_per_mw}/MW · Payback ${h2.simple_payback_years}yr · IRR ~${h2.irr_approx_pct}% (CH central ${h2.ch_irr_central}%, range ${h2.ch_irr_range})
  4h BESS: Net €${h4.net_annual_per_mw}/MW/yr · CAPEX €${h4.capex_per_mw}/MW · Payback ${h4.simple_payback_years}yr · IRR ~${h4.irr_approx_pct}% (CH central ${h4.ch_irr_central}%, range ${h4.ch_irr_range})

Return ONLY a JSON object with these keys — 1–2 sentences each, no markdown:
{
  "s1": "...",
  "s2": "...",
  "s3": "...",
  "s4": "...",
  "combined": "..."
}`;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { console.error(`[Interpretations] Anthropic HTTP ${res.status}`); return null; }
    const data  = await res.json();
    const text  = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const sentences = JSON.parse(match[0]);
    return { ...sentences, generated_at: new Date().toISOString(), data_completeness, all_feeds_live };
  } catch (err) {
    console.error('[Interpretations] failed:', String(err));
    return null;
  }
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

// Telegram pipeline: planned, not yet built

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron — every 4h (S1/S3/S4/Euribor) and daily 09:00 UTC (S2 watchdog). */
  async scheduled(event, env, _ctx) {
    const isWatchdog = event.cron === '0 9 * * *';

    if (isWatchdog) {
      // 09:00 UTC daily: only run S2 watchdog + re-run S2 watchdog Telegram alert
      try {
        const s2Raw = await env.KKME_SIGNALS.get('s2');
        if (!s2Raw) {
          await notifyTelegram(env, '🔴 S2: KV empty — BTD cron (fetch-btd.js) has never run or always failing');
        } else {
          const s2   = JSON.parse(s2Raw);
          const ts   = s2.timestamp ?? s2._meta?.written_at;
          const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : Infinity;
          if (ageH > 48) {
            await notifyTelegram(env, `⚠️ S2: data is ${ageH.toFixed(0)}h old. Mac cron (fetch-btd.js) may have failed.`);
          } else {
            console.log(`[S2/watchdog] fresh: ${ageH.toFixed(1)}h old`);
          }
        }
      } catch (e) {
        console.error('[S2/watchdog]', String(e));
      }
      return;
    }

    // Every 4h: fetch S1/S3/S4/Euribor in parallel
    const [s1Result, s4Result, s3Result, eurResult] = await Promise.allSettled([
      withTimeout(computeS1(env),      30000),  // includes tomorrow fetch (+2 ENTSO-E calls)
      withTimeout(computeS4(),         25000),
      withTimeout(computeS3(),         25000),
      withTimeout(computeEuribor(),    20000),
    ]);

    if (s1Result.status === 'fulfilled') {
      const d = s1Result.value;
      // Update rolling history and embed stats in S1 payload
      try {
        const history = await updateHistory(env, d);
        d.spread_stats_90d = rollingStats(history, 'spread_eur');
        d.swing_stats_90d  = rollingStats(history, 'lt_swing');
        console.log(`[S1/history] n=${history.length} spread_p50=${d.spread_stats_90d?.p50} swing_p50=${d.swing_stats_90d?.p50}`);
      } catch (he) {
        console.error('[S1/history] failed:', String(he));
      }
      await env.KKME_SIGNALS.put('s1', JSON.stringify(d));
      console.log(`[S1] ${d.state} spread=${d.spread_eur_mwh}€/MWh swing=${d.lt_daily_swing_eur_mwh}€/MWh sep=${d.separation_pct}% rsi_30d=${d.rsi_30d}`);
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

    // Write s3 first, then merge euribor in a second write if both succeed
    if (s3Result.status === 'fulfilled') {
      const d = s3Result.value;
      await env.KKME_SIGNALS.put('s3', JSON.stringify(d));
      if (d.unavailable) {
        console.error(`[S3] scrape failed: ${d._scrape_error}`);
      } else {
        console.log(`[S3] ${d.signal} lithium=€${d.lithium_eur_t}/t trend=${d.lithium_trend} cell=${d.cell_eur_kwh ?? '—'} €/kWh`);
      }
    } else {
      console.error('[S3] cron failed:', s3Result.reason);
    }

    if (eurResult.status === 'fulfilled') {
      const eur = eurResult.value;
      await env.KKME_SIGNALS.put('euribor', JSON.stringify(eur));
      console.log(`[Euribor] ${eur.euribor_3m}% trend=${eur.euribor_trend}`);
      // Merge euribor into s3 KV if s3 also succeeded
      if (s3Result.status === 'fulfilled') {
        const merged = { ...s3Result.value, euribor_3m: eur.euribor_3m, euribor_trend: eur.euribor_trend };
        await env.KKME_SIGNALS.put('s3', JSON.stringify(merged));
      }
    } else {
      console.error('[Euribor] cron failed:', eurResult.reason);
    }

    // da_tomorrow is embedded in computeS1() and stored in the s1 KV key
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    // Telegram pipeline: planned, not yet built

    // ── GET /s2 ──────────────────────────────────────────────────────────────
    // Populated by GitHub Action fetch-btd.yml via POST /s2/update
    if (request.method === 'GET' && url.pathname === '/s2') {
      const cached = await env.KKME_SIGNALS.get('s2');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      // KV empty — serve static floor defaults so the card never shows blank
      const defaults = { ...DEFAULTS.s2, unavailable: true };
      return new Response(
        JSON.stringify(defaults),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } },
      );
    }

    // ── POST /s2/update ───────────────────────────────────────────────────────
    // Accepts raw BTD data: { reserves, direction, imbalance }
    // Parses and shapes payload here, writes to KV as 's2'.
    if (request.method === 'POST' && url.pathname === '/s2/update') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      const { reserves, direction, imbalance, ordered_price, ordered_mw } = body;
      const payload = s2ShapePayload(reserves ?? null, direction ?? null, imbalance ?? null);
      if (ordered_price != null) payload.ordered_price = ordered_price;
      if (ordered_mw    != null) payload.ordered_mw    = ordered_mw;

      // Validate: reject null-heavy payload (BTD blocked → all fields null)
      const validation = await kvWrite(env.KKME_SIGNALS, 's2', payload, {
        required:   ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg'],
        bounds_key: 's2',
      });
      if (!validation.success) {
        await notifyTelegram(env, `⚠️ S2: KV write rejected (BTD data invalid) — ${validation.errors.join(' | ')}`);
        return new Response(
          JSON.stringify({ error: 'validation_failed', errors: validation.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } },
        );
      }

      console.log(`[S2/update] ${payload.signal} fcr=${payload.fcr_avg} afrr_up=${payload.afrr_up_avg} pct_up=${payload.pct_up} ordered=${ordered_price ?? '—'}€/MW/h ${ordered_mw ?? '—'}MW`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
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

    // ── GET /s3 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s3') {
      const [s3Raw, eurRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s3'),
        env.KKME_SIGNALS.get('euribor'),
      ]);
      if (s3Raw) {
        try {
          const d = JSON.parse(s3Raw);
          if (eurRaw) {
            const eur = JSON.parse(eurRaw);
            d.euribor_3m    = eur.euribor_3m    ?? null;
            d.euribor_trend = eur.euribor_trend ?? null;
          }
          return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        } catch { /* fall through to fresh compute */ }
      }
      const data = await computeS3();
      await env.KKME_SIGNALS.put('s3', JSON.stringify(data));
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /euribor ─────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/euribor') {
      const cached = await env.KKME_SIGNALS.get('euribor');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await computeEuribor();
        await env.KKME_SIGNALS.put('euribor', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── POST /s4/pipeline ────────────────────────────────────────────────────
    // Mac cron (fetch-vert.js, monthly): VERT.lt permit pipeline metrics.
    if (request.method === 'POST' && url.pathname === '/s4/pipeline') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      await env.KKME_SIGNALS.put('s4_pipeline', JSON.stringify(body));
      console.log(`[S4/pipeline] dev=${body.dev_total_mw}MW gen=${body.gen_total_mw}MW expiring2027=${body.dev_expiring_2027}MW`);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /s4 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s4') {
      const [s4Raw, pipelineRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('s4_pipeline'),
      ]);
      if (s4Raw) {
        try {
          const d = JSON.parse(s4Raw);
          if (pipelineRaw) {
            const p = JSON.parse(pipelineRaw);
            d.pipeline = {
              dev_total_mw:       p.dev_total_mw       ?? null,
              dev_total_raw_mw:   p.dev_total_raw_mw   ?? null,
              filter_applied:     p.filter_applied     ?? null,
              dev_count_filtered: p.dev_count_filtered ?? null,
              dev_count_raw:      p.dev_count_raw      ?? null,
              parse_warning:      p.parse_warning      ?? null,
              gen_total_mw:       p.gen_total_mw       ?? null,
              dev_velocity_3m:    p.dev_velocity_3m    ?? null,
              dev_expiring_2027:  p.dev_expiring_2027  ?? null,
              top_projects:       p.top_projects       ?? [],
              updated_at:         p.timestamp          ?? null,
            };
          }
          return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        } catch { /* fall through */ }
      }
      try {
        const data = await computeS4();
        await env.KKME_SIGNALS.put('s4', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── GET /da_tomorrow ─────────────────────────────────────────────────────
    // Cached DA prices for LT+SE4; populated by cron or POST /da_tomorrow/update
    if (request.method === 'GET' && url.pathname === '/da_tomorrow') {
      const cached = await env.KKME_SIGNALS.get('da_tomorrow');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await fetchNordPoolDA();
        await env.KKME_SIGNALS.put('da_tomorrow', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    // ── POST /da_tomorrow/update ─────────────────────────────────────────────
    // Mac cron fallback: accepts raw { lt_prices, se4_prices } OR pre-computed metrics.
    if (request.method === 'POST' && url.pathname === '/da_tomorrow/update') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let metrics;
      if (Array.isArray(body.lt_prices) && Array.isArray(body.se4_prices)) {
        metrics = npShapeMetrics(body.lt_prices, body.se4_prices);
        if (!metrics) return new Response(JSON.stringify({ error: 'No valid price data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      } else {
        metrics = { lt_peak: body.lt_peak ?? null, lt_trough: body.lt_trough ?? null, lt_avg: body.lt_avg ?? null, se4_avg: body.se4_avg ?? null, spread_pct: body.spread_pct ?? null };
      }
      const payload = { ...metrics, delivery_date: body.delivery_date ?? null, timestamp: new Date().toISOString() };
      await env.KKME_SIGNALS.put('da_tomorrow', JSON.stringify(payload));
      console.log(`[NP/DA/update] lt_avg=${payload.lt_avg} lt_peak=${payload.lt_peak} spread=${payload.spread_pct}%`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /revenue ─────────────────────────────────────────────────────────
    // Revenue engine: reads live KV signals, computes 2h+4h BESS model,
    // EU market comparison, and LLM interpretation. Cached 4h in KV.
    if (request.method === 'GET' && url.pathname === '/revenue') {
      const cached = await env.KKME_SIGNALS.get('revenue');
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=14400', ...CORS } });
      }

      const [s1Raw, s2Raw, s3Raw, s4Raw, eurRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s2'),
        env.KKME_SIGNALS.get('s3'),
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('euribor'),
      ]);
      const s1  = s1Raw  ? JSON.parse(s1Raw)  : null;
      const s2  = s2Raw  ? JSON.parse(s2Raw)  : null;
      const s3  = s3Raw  ? JSON.parse(s3Raw)  : null;
      const s4  = s4Raw  ? JSON.parse(s4Raw)  : null;
      const eur = eurRaw ? JSON.parse(eurRaw) : null;

      // Build live price inputs — fallbacks to CH S1 2025 LT reference values
      const prices = {
        afrr_up_avg:             s2?.afrr_up_avg              ?? 20,   // €/MW/h
        mfrr_up_avg:             s2?.mfrr_up_avg              ?? 15,   // €/MW/h
        spread_eur_mwh:          s1?.spread_eur_mwh           ?? 15,   // €/MWh (coupling, for context)
        lt_daily_swing_eur_mwh:  s1?.lt_daily_swing_eur_mwh  ?? null,  // €/MWh intraday swing (trading input)
        euribor_3m:              eur?.euribor_3m              ?? 2.6,
      };

      const h2         = computeRevenueWorker(prices, 2);
      const h4         = computeRevenueWorker(prices, 4);
      const eu_ranking = computeMarketComparisonWorker(prices);

      // LLM interpretation — best-effort, 10s budget
      let interpretations = null;
      try {
        interpretations = await withTimeout(
          computeInterpretations({ s1, s2, s3, s4 }, { h2, h4 }, env.ANTHROPIC_API_KEY),
          10000,
        );
      } catch { /* serve without interpretation */ }

      const payload = {
        updated_at: new Date().toISOString(),
        prices: {
          afrr_up_avg:    prices.afrr_up_avg,
          mfrr_up_avg:    prices.mfrr_up_avg,
          spread_eur_mwh: prices.spread_eur_mwh,
          euribor_3m:     prices.euribor_3m,
        },
        h2,
        h4,
        eu_ranking,
        interpretations,
      };
      const json = JSON.stringify(payload);
      await env.KKME_SIGNALS.put('revenue', json, { expirationTtl: 14400 });
      return new Response(json, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=14400', ...CORS } });
    }

    // ── GET /health ──────────────────────────────────────────────────────────
    // Returns structured health of all signal KV keys + Mac cron ping status.
    if (request.method === 'GET' && url.pathname === '/health') {
      const keys = ['s1', 's2', 's3', 's4', 'euribor', 's4_pipeline'];
      const signals = {};

      await Promise.all(keys.map(async (key) => {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) {
            signals[key] = { status: 'missing', age_hours: null, stale: null };
            return;
          }
          const data      = JSON.parse(raw);
          const ts        = data.timestamp ?? data._meta?.written_at ?? data.updated_at;
          const ageH      = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : null;
          const threshold = STALE_THRESHOLDS_HOURS[key] ?? 48;
          const stale     = ageH !== null ? ageH > threshold : null;
          signals[key] = {
            status:          'present',
            age_hours:       ageH !== null ? parseFloat(ageH.toFixed(1)) : null,
            stale,
            threshold_hours: threshold,
          };
        } catch (e) {
          signals[key] = { status: 'error', error: e.message };
        }
      }));

      // Mac cron heartbeat
      let macCron = { status: 'never_run', last_ping: null, age_hours: null };
      try {
        const cronRaw = await env.KKME_SIGNALS.get('cron_heartbeat');
        if (cronRaw) {
          const cron = JSON.parse(cronRaw);
          const ageH = cron.timestamp
            ? (Date.now() - new Date(cron.timestamp).getTime()) / 3600000
            : null;
          macCron = {
            status:    ageH !== null ? (ageH > 25 ? 'overdue' : 'ok') : 'unknown',
            last_ping: cron.timestamp ?? null,
            age_hours: ageH !== null ? parseFloat(ageH.toFixed(1)) : null,
            script:    cron.script ?? null,
          };
        }
      } catch { /* ignore */ }

      const allFresh = Object.values(signals).every(
        r => r.status === 'present' && r.stale === false,
      );

      const health = {
        checked_at: new Date().toISOString(),
        all_fresh:  allFresh,
        signals,
        mac_cron:   macCron,
      };

      return new Response(JSON.stringify(health, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    // ── POST /heartbeat ──────────────────────────────────────────────────────
    // Mac cron scripts POST here after a successful run.
    if (request.method === 'POST' && url.pathname === '/heartbeat') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const ping = {
        timestamp: new Date().toISOString(),
        script:    body.script ?? 'unknown',
        note:      body.note   ?? '',
      };
      await env.KKME_SIGNALS.put('cron_heartbeat', JSON.stringify(ping));
      console.log(`[Heartbeat] ${ping.script} at ${ping.timestamp}`);
      return new Response(JSON.stringify({ ok: true, ...ping }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── GET /read ────────────────────────────────────────────────────────────
    // da_tomorrow is now embedded in computeS1() and stored in the s1 KV key directly
    if (request.method === 'GET' && url.pathname === '/read') {
      const s1Raw = await env.KKME_SIGNALS.get('s1');
      if (!s1Raw) return new Response(JSON.stringify({ error: 'not yet populated' }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
      return new Response(s1Raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    // ── GET / — fresh S1 + history update + write to KV ─────────────────────
    if (request.method === 'GET') {
      try {
        const data = await computeS1(env);
        try {
          const history = await updateHistory(env, data);
          data.spread_stats_90d = rollingStats(history, 'spread_eur');
          data.swing_stats_90d  = rollingStats(history, 'lt_swing');
        } catch { /* non-fatal */ }
        await env.KKME_SIGNALS.put('s1', JSON.stringify(data));
        return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
