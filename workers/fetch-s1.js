/**
 * KKME — Signal Worker
 * Cron: 0 6 * * * (06:00 UTC daily)
 *
 * Endpoints:
 *   GET /               → fresh S1 fetch + KV write (manual trigger)
 *   GET /read           → cached S1 KV value (fetched by S1Card)
 *   GET /s2             → cached S2 KV value (written by GitHub Action fetch-btd.yml)
 *   POST /s2/update     → write S2 payload to KV (GitHub Action only, requires X-Update-Secret)
 *   GET /s3             → cached S3 KV value; computes fresh if empty
 *   GET /s4             → cached S4 KV value; computes fresh if empty
 *   POST /curate        → store CurationEntry in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → Anthropic haiku digest; cached 1h
 *
 * Secrets: ENTSOE_API_KEY · ANTHROPIC_API_KEY · UPDATE_SECRET
 * KV binding: KKME_SIGNALS
 */

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
  const separationPct = se4Avg !== 0 ? (spread / se4Avg) * 100 : 0;

  // DA tomorrow — populated only after ENTSO-E publishes (~13:00 CET)
  let da_tomorrow = null;
  if (ltTomorrow.length && se4Tomorrow.length) {
    const ltTomAvg  = avg(ltTomorrow);
    const se4TomAvg = avg(se4Tomorrow);
    const tomSpreadPct = se4TomAvg !== 0 ? ((ltTomAvg - se4TomAvg) / se4TomAvg) * 100 : 0;
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
    lt_avg_eur_mwh:      Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh:     Math.round(se4Avg * 100) / 100,
    spread_eur_mwh:      Math.round(spread * 100) / 100,
    separation_pct:      Math.round(separationPct * 10) / 10,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
    da_tomorrow,
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

// ─── Euribor ───────────────────────────────────────────────────────────────────
// ECB Statistical Data Warehouse — 3M Euribor (FM dataset)

async function computeEuribor() {
  // Static reference value — live ECB fetch pending (correct key: M.U2.EUR.4F.MM.R_EURIBOR3MD_.HSTA)
  return {
    euribor_3m:    2.6,
    euribor_prev:  2.7,
    euribor_trend: '↓ falling',
    note:          'Static ref — ECB API integration pending',
    source:        'manual',
    timestamp:     new Date().toISOString(),
  };
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

  return {
    timestamp:       new Date().toISOString(),
    fcr_avg,
    afrr_up_avg,
    afrr_down_avg,
    pct_up,
    pct_down,
    imbalance_mean,
    imbalance_p90,
    pct_above_100,
    signal,
    interpretation:  signal === 'EARLY'
      ? S2_INTERPRETATION.EARLY(fcr_avg)
      : S2_INTERPRETATION[signal](),
    source:          'baltic.transparency-dashboard.eu',
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

// Telegram pipeline: planned, not yet built

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron — 06:00 UTC daily. S1/S3/S4 run in parallel; S2 is written by GitHub Action at 05:30 UTC. */
  async scheduled(_event, env, _ctx) {
    const [s1Result, s4Result, s3Result, eurResult] = await Promise.allSettled([
      withTimeout(computeS1(env),      30000),  // includes tomorrow fetch (+2 ENTSO-E calls)
      withTimeout(computeS4(),         25000),
      withTimeout(computeS3(),         25000),
      withTimeout(computeEuribor(),    20000),
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

    // S2 is populated by Mac cron (fetch-btd.js) at 05:30 UTC — not computed here
    // da_tomorrow is now embedded in computeS1() and stored in the s1 KV key
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
      return new Response(
        JSON.stringify({ unavailable: true, signal: 'ACTIVE', interpretation: 'Data not yet populated — runs at 05:30 UTC.', source: 'baltic.transparency-dashboard.eu' }),
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
      await env.KKME_SIGNALS.put('s2', JSON.stringify(payload));
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
              dev_total_mw:      p.dev_total_mw      ?? null,
              gen_total_mw:      p.gen_total_mw      ?? null,
              dev_velocity_3m:   p.dev_velocity_3m   ?? null,
              dev_expiring_2027: p.dev_expiring_2027 ?? null,
              top_projects:      p.top_projects      ?? [],
              updated_at:        p.timestamp         ?? null,
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

    // ── GET /read ────────────────────────────────────────────────────────────
    // da_tomorrow is now embedded in computeS1() and stored in the s1 KV key directly
    if (request.method === 'GET' && url.pathname === '/read') {
      const s1Raw = await env.KKME_SIGNALS.get('s1');
      if (!s1Raw) return new Response(JSON.stringify({ error: 'not yet populated' }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
      return new Response(s1Raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
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
