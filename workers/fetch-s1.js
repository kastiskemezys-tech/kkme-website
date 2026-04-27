/**
 * KKME — Signal Worker
 * Cron: every 4h (S1-S9 + Euribor) + daily 09:30 (S2 extra) + daily 08:00 (digest)
 * All data fetching runs on Cloudflare Workers cron — no local machine dependency.
 *
 * Endpoints:
 *   GET /               → fresh S1 fetch + KV write (manual trigger)
 *   GET /read           → cached S1 KV value (fetched by S1Card)
 *   GET /s2             → S2 KV (defaults if empty)
 *   POST /s2/update     → write S2 payload to KV (external push, validated)
 *   GET /s3             → cached S3 KV value; computes fresh if empty
 *   GET /s4             → cached S4 KV value; computes fresh if empty
 *   POST /curate        → store CurationEntry in KV
 *   GET /curations      → raw curation entries (last 7 days)
 *   GET /digest         → Anthropic haiku digest; cached 1h
 *   GET /health         → structured health of all signals
 *   POST /heartbeat     → record heartbeat ping (legacy, kept for compat)
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
const PL_BZN  = '10YPL-AREA-----S';
const LV_BZN  = '10YLV-1001A00074';
const EE_BZN  = '10Y1001A1001A39I';

const S4_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/8/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1000&where=1%3D1&orderByFields=&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects';
// Layer 3: individual connected installations — queried for Kaupikliai (storage) projects
const S4_LAYER3_URL = 'https://services-eu1.arcgis.com/NDrrY0T7kE7A7pU0/arcgis/rest/services/ElektrosPerdavimasAEI/FeatureServer/3/query?f=json&where=Elektrin%C4%97s_tipas%3D%27Kaupikliai%27&outFields=*&returnGeometry=true&outSR=4326';


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

// ─── Fleet tracker helpers ──────────────────────────────────────────────────────

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Data validation ────────────────────────────────────────────────────────

function validate(signalName, data) {
  const issues = [];
  if (!data) { issues.push({ severity: 'error', msg: `${signalName}: null data` }); return issues; }
  if (!data.timestamp && !data.updated_at && !data.fetched_at)
    issues.push({ severity: 'warning', msg: `${signalName}: no timestamp` });
  if (signalName === 's1') {
    if (data.spread_eur_mwh !== undefined && (data.spread_eur_mwh < -100 || data.spread_eur_mwh > 500))
      issues.push({ severity: 'warning', msg: 's1: spread outside plausible range' });
  }
  if (signalName === 's2') {
    if (data.sd_ratio !== undefined && (data.sd_ratio < 0 || data.sd_ratio > 5))
      issues.push({ severity: 'warning', msg: 's2: S/D ratio outside plausible range' });
  }
  if (signalName === 's7') {
    if (data.ttf_eur_mwh !== undefined && (data.ttf_eur_mwh < 0 || data.ttf_eur_mwh > 500))
      issues.push({ severity: 'warning', msg: 's7: TTF outside plausible range' });
  }
  if (signalName === 's9') {
    if (data.ets_eur_t !== undefined && (data.ets_eur_t < 0 || data.ets_eur_t > 300))
      issues.push({ severity: 'warning', msg: 's9: ETS outside plausible range' });
  }
  return issues;
}

// ─── Market regime computation ──────────────────────────────────────────────

function computeRegime(signals) {
  const regimes = [];
  const ssr = signals.sd_ratio || 1.0;
  if (ssr < 0.7) regimes.push({ id: 'RESERVE_SCARCITY', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  else if (ssr < 1.2) regimes.push({ id: 'RESERVE_COMPRESSING', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  else regimes.push({ id: 'RESERVE_SATURATED', confidence: 'derived', trigger: `net_ssr=${ssr}` });
  const ttf = signals.ttf_eur_mwh || 0;
  if (ttf > 50) regimes.push({ id: 'HIGH_GAS_MARGIN', confidence: 'observed', trigger: `ttf=${ttf}` });
  return {
    active: regimes,
    computed_at: new Date().toISOString(),
    primary: regimes[0]?.id || 'NORMAL',
  };
}

// ─── Fleet contradiction + freshness helpers ────────────────────────────────

function detectContradictions(entry) {
  const flags = [];
  if (entry.status === 'operational' && entry.source && !entry.source.match(/TSO|Litgrid|Elering|AST|operational|energis|grid permit/i))
    flags.push({ id: 'C-01', severity: 'HIGH', msg: 'Operational status without TSO/operational evidence' });
  if (entry.mw && entry.mwh) {
    const duration = entry.mwh / entry.mw;
    if (duration < 0.5 || duration > 12)
      flags.push({ id: 'C-07', severity: 'HIGH', msg: `Duration ${duration.toFixed(1)}h outside 0.5-12h range` });
  }
  if (entry.mw > 500)
    flags.push({ id: 'C-11', severity: 'MEDIUM', msg: `MW=${entry.mw} unusually large for Baltic BESS` });
  return flags;
}

function freshnessScore(entry) {
  if (!entry.updated) return 0.5;
  const daysSince = (Date.now() - new Date(entry.updated).getTime()) / 86400000;
  if (daysSince < 30) return 1.0;
  if (daysSince < 90) return 0.8;
  if (daysSince < 180) return 0.6;
  if (daysSince < 365) return 0.4;
  return 0.2;
}

const STATUS_WEIGHT = {
  operational: 1.0, commissioned: 1.0,
  under_construction: 0.9, connection_agreement: 0.6,
  application: 0.3, announced: 0.1,
};

function processFleet(entries, demand) {
  // Deduplicate: if two entries share a name prefix + country and MW within 10%, keep the one with more specific COD
  const deduped = [];
  const seen = new Set();
  const sorted = [...entries].sort((a, b) => {
    // Prefer entries with specific COD dates over generic ones
    const aSpecific = a.cod && String(a.cod).includes('-') ? 1 : 0;
    const bSpecific = b.cod && String(b.cod).includes('-') ? 1 : 0;
    return bSpecific - aSpecific;
  });
  for (const e of sorted) {
    // When entry has an explicit id, use it as the dedup key (unique by definition)
    const dedupKey = e.id
      ? `id:${e.id}`
      : `${(e.name || '').replace(/\s*\(.*\)/, '').trim().toLowerCase()}|${e.country || 'LT'}`;
    const existing = deduped.find(d => {
      const dKey = d.id
        ? `id:${d.id}`
        : `${(d.name || '').replace(/\s*\(.*\)/, '').trim().toLowerCase()}|${d.country || 'LT'}`;
      return dKey === dedupKey && Math.abs(d.mw - e.mw) / Math.max(d.mw, e.mw) < 0.10;
    });
    if (existing) {
      console.log(`[Fleet/dedup] Skipping "${e.name}" (${e.mw} MW) — duplicate of "${existing.name}" (${existing.mw} MW)`);
      continue;
    }
    deduped.push(e);
  }

  const countries = {};
  // Separate BESS from other storage types for S/D computation
  const isNonCommercial = (e) => e.type === 'pumped_hydro' || e.type === 'tso_bess';
  let non_commercial_mw = 0;

  for (const e of deduped) {
    const c = e.country || 'LT';
    if (!countries[c]) countries[c] = { operational_mw: 0, pipeline_mw: 0, weighted_mw: 0, entries: [] };
    const w = STATUS_WEIGHT[e.status] || 0.1;
    if (!isNonCommercial(e)) {
      countries[c].weighted_mw += e.mw * w;
    } else {
      non_commercial_mw += e.mw;
    }
    if (e.status === 'operational' || e.status === 'commissioned') {
      countries[c].operational_mw += e.mw;
    } else {
      countries[c].pipeline_mw += e.mw;
    }
    countries[c].entries.push(e);
  }
  const baltic_operational = Object.values(countries).reduce((s, c) => s + c.operational_mw, 0);
  const baltic_weighted    = Object.values(countries).reduce((s, c) => s + c.weighted_mw, 0);
  const baltic_pipeline    = Object.values(countries).reduce((s, c) => s + c.pipeline_mw, 0);
  const eff_demand = demand?.eff_demand_mw || 752;
  const sd_ratio   = baltic_weighted / eff_demand;

  // Per-product S/D ratios — worst-case stress view (all fleet allocated to single product)
  const PRODUCT_DEMAND = { fcr: 28, afrr: 120, mfrr: 604 };
  const product_sd = {};
  for (const [prod, dem] of Object.entries(PRODUCT_DEMAND)) {
    const r = dem > 0 ? baltic_weighted / dem : null;
    const rounded = r !== null ? Math.round(r * 100) / 100 : null;
    product_sd[prod] = {
      demand_mw: dem,
      supply_mw: Math.round(baltic_weighted),
      ratio: rounded,
      sd_ratio: rounded,
      phase: r === null ? null : r < 0.6 ? 'SCARCITY' : r < 1.0 ? 'COMPRESS' : 'MATURE',
    };
  }

  // CPI: floor 0.30, slope 0.08
  let phase, cpi;
  if (sd_ratio < 0.6) {
    phase = 'SCARCITY'; cpi = Math.min(1.0 + (0.6 - sd_ratio) * 2.5, 2.0);
  } else if (sd_ratio < 1.0) {
    phase = 'COMPRESS'; cpi = Math.max(0.30, 1.0 - (sd_ratio - 0.6) * 1.5);
  } else {
    phase = 'MATURE';   cpi = Math.max(0.30, 0.40 - (sd_ratio - 1.0) * 0.08);
  }
  // 5-year trajectory (0.15 sd_ratio growth/yr — conservative new entrant assumption)
  const trajectory = [];
  const baseYear = new Date().getUTCFullYear();
  for (let i = 0; i <= 5; i++) {
    const r  = sd_ratio + i * 0.15;
    const yr = baseYear + i;
    const ph = r < 0.6 ? 'SCARCITY' : r < 1.0 ? 'COMPRESS' : 'MATURE';
    let tc;
    if (r < 0.6) tc = Math.min(1.0 + (0.6 - r) * 2.5, 2.0);
    else if (r < 1.0) tc = Math.max(0.30, 1.0 - (r - 0.6) * 1.5);
    else tc = Math.max(0.30, 0.40 - (r - 1.0) * 0.08);
    trajectory.push({ year: yr, sd_ratio: Math.round(r * 100) / 100, phase: ph, cpi: Math.round(tc * 100) / 100 });
  }
  // Quarantine + contradiction detection
  const quarantined = [];
  for (const e of entries) {
    const flags = detectContradictions(e);
    e._contradiction_flags = flags;
    e._freshness = freshnessScore(e);
    if (flags.some(f => f.severity === 'HIGH')) {
      e._quarantine = true;
      quarantined.push({ name: e.name, flags });
    }
  }
  return {
    countries,
    baltic_operational_mw: Math.round(baltic_operational),
    baltic_pipeline_mw:    Math.round(baltic_pipeline),
    baltic_weighted_mw:    Math.round(baltic_weighted),
    non_commercial_mw:     Math.round(non_commercial_mw),
    eff_demand_mw:         eff_demand,
    sd_ratio:              Math.round(sd_ratio * 100) / 100,
    phase,
    cpi:                   Math.round(cpi * 100) / 100,
    product_sd,
    trajectory,
    quarantined,
    updated_at:            new Date().toISOString(),
  };
}

// ─── KKME Trading Engine ──────────────────────────────────────────────────────
// Dispatch optimisation algorithm calibrated on Baltic market microstructure.
// Computes optimal BESS dispatch from BTD balancing data + ENTSO-E DA prices.

function t_r0(n) { return Math.round(n); }
function t_r1(n) { return Math.round(n * 10) / 10; }
function t_r2(n) { return Math.round(n * 100) / 100; }
function t_r3(n) { return Math.round(n * 1000) / 1000; }

// BESS MW share heuristics for Kruonis PSP disaggregation.
// FCR: 100% BESS (PSP physically cannot respond sub-second).
// aFRR: 90% BESS (PSP too slow for automatic activation <5min).
// mFRR: split by grid-permitted MW ratio: bessMW / (bessMW + kruonisMW).
const KRUONIS_MW = 205;
function bessShareMFRR(bessMW) { return bessMW / (bessMW + KRUONIS_MW); }

function computeDispatch(data, battery) {
  const { mw, mwh, rte } = battery;
  const duration = mwh / mw;
  const mfrrShare = bessShareMFRR(mw);

  const isps = [];
  let soc = 0.5;
  let totalCapRev = 0, totalActRev = 0, totalArbRev = 0;

  // Determine arb charge/discharge thresholds from DA price distribution
  const daHourly = data.da_hourly || [];
  let chargeThreshold = 40, dischargeThreshold = 80;
  if (daHourly.length >= 20) {
    const sorted = [...daHourly].sort((a, b) => a - b);
    chargeThreshold = sorted[Math.floor(sorted.length * 0.25)]; // p25
    dischargeThreshold = sorted[Math.floor(sorted.length * 0.75)]; // p75
  }

  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4);
    const cap = data.capacity_prices?.[i] || {};
    const procured = data.procured_mw?.[i] || {};
    const actPrice = data.activation_prices?.[i] || {};
    const dir = data.direction?.[i];
    const imbPrice = data.imbalance_prices?.[i] || {};
    const imbVol = data.imbalance_volumes?.[i];

    // --- Capacity allocation (observed procured MW, BESS share estimated) ---
    const fcrMW = Math.min((procured.fcr_sym || 0) * 1.0, mw * 0.25);
    const afrrMW = Math.min((procured.afrr_up || 0) * 0.9, mw * 0.40);
    const mfrrMW = Math.min((procured.mfrr_up || 0) * mfrrShare, mw * 0.50);
    const reservedMW = fcrMW + afrrMW + mfrrMW;
    const arbAvailMW = Math.max(0, mw - reservedMW);

    // --- Capacity revenue (15-min pro rata) ---
    const fcrCapRev = fcrMW * (cap.fcr_sym || 0) / 4;
    const afrrCapRev = afrrMW * (cap.afrr_up || 0) / 4;
    const mfrrCapRev = mfrrMW * (cap.mfrr_up || 0) / 4;
    const ispCapRev = fcrCapRev + afrrCapRev + mfrrCapRev;

    // --- Activation revenue (estimated from balancing energy prices + direction) ---
    const upActPrice = actPrice.up || 0;
    const downActPrice = actPrice.down || 0;
    const isShort = (dir || 0) > 0;

    // If activation price exists and system direction matches, estimate activation
    const afrrActMW = upActPrice > 0 && isShort ? afrrMW * 0.30 : 0;
    const mfrrActMW = upActPrice > 50 && isShort ? mfrrMW * 0.20 : 0;
    const ispActRev = (afrrActMW * upActPrice / 4) + (mfrrActMW * upActPrice / 4);

    // --- Arbitrage (DA price-driven charge/discharge) ---
    const daPrice = daHourly[h] || 0;
    let arbRev = 0;
    let arbAction = 'hold';

    if (arbAvailMW > 0 && daPrice > 0) {
      if (daPrice <= chargeThreshold && soc < 0.85) {
        const chargeMWh = Math.min(arbAvailMW / 4, (0.90 - soc) * mwh);
        if (chargeMWh > 0) {
          soc += chargeMWh / mwh;
          arbRev = -chargeMWh * daPrice;
          arbAction = 'charge';
        }
      } else if (daPrice >= dischargeThreshold && soc > 0.20) {
        const dischargeMWh = Math.min(arbAvailMW * rte / 4, (soc - 0.15) * mwh);
        if (dischargeMWh > 0) {
          soc -= dischargeMWh / mwh;
          arbRev = dischargeMWh * daPrice;
          arbAction = 'discharge';
        }
      }
    }

    // SoC drain from activations (upward activation = discharge)
    const actDrainMWh = (afrrActMW + mfrrActMW) / 4;
    soc = Math.max(0.05, Math.min(0.95, soc - actDrainMWh / mwh));

    totalCapRev += ispCapRev;
    totalActRev += ispActRev;
    totalArbRev += arbRev;

    isps.push({
      isp: i,
      time: `${String(h).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
      da_price: t_r2(daPrice),
      capacity: {
        fcr: { mw: t_r1(fcrMW), price: t_r2(cap.fcr_sym || 0) },
        afrr: { mw: t_r1(afrrMW), price: t_r2(cap.afrr_up || 0) },
        mfrr: { mw: t_r1(mfrrMW), price: t_r2(cap.mfrr_up || 0) },
      },
      activation: {
        up_price: t_r2(upActPrice),
        down_price: t_r2(downActPrice),
        direction: isShort ? 'short' : 'long',
        est_afrr_mw: t_r1(afrrActMW),
        est_mfrr_mw: t_r1(mfrrActMW),
      },
      arb: { available_mw: t_r1(arbAvailMW), action: arbAction, revenue: t_r2(arbRev) },
      soc: t_r3(soc),
      imbalance: { price: t_r2(imbPrice.final || imbPrice.preliminary || 0), volume_mwh: t_r1(imbVol || 0) },
      revenue: {
        capacity: t_r2(ispCapRev),
        activation: t_r2(ispActRev),
        arbitrage: t_r2(arbRev),
        total: t_r2(ispCapRev + ispActRev + arbRev),
      },
    });
  }

  const totalRev = totalCapRev + totalActRev + totalArbRev;

  // Reserve availability: count ISPs with active procurement per product
  const afrr_active_isps = isps.filter(isp => isp.capacity.afrr.mw > 0).length;
  const mfrr_active_isps = isps.filter(isp => isp.capacity.mfrr.mw > 0).length;
  const fcr_active_isps  = isps.filter(isp => isp.capacity.fcr.mw > 0).length;

  // Activation rates: count ISPs with actual energy dispatch (not procurement)
  const afrr_dispatched_isps = isps.filter(isp => isp.activation.est_afrr_mw > 0).length;
  const mfrr_dispatched_isps = isps.filter(isp => isp.activation.est_mfrr_mw > 0).length;

  // Hourly aggregation
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const slice = isps.filter(isp => Math.floor(isp.isp / 4) === h);
    hourly.push({
      hour: h,
      da_price: slice[0]?.da_price || 0,
      revenue: {
        capacity: t_r2(slice.reduce((s, isp) => s + isp.revenue.capacity, 0)),
        activation: t_r2(slice.reduce((s, isp) => s + isp.revenue.activation, 0)),
        arbitrage: t_r2(slice.reduce((s, isp) => s + isp.revenue.arbitrage, 0)),
        total: t_r2(slice.reduce((s, isp) => s + isp.revenue.total, 0)),
      },
      avg_soc: t_r3(slice.reduce((s, isp) => s + isp.soc, 0) / (slice.length || 1)),
      activations: slice.filter(isp => isp.activation.est_afrr_mw > 0).length,
    });
  }

  // Strategy fingerprint
  const peakHours = hourly.filter(h => h.hour >= 17 && h.hour <= 20);
  const offPeakHours = hourly.filter(h => h.hour >= 1 && h.hour <= 5);
  const peakRevAvg = peakHours.reduce((s, h) => s + h.revenue.total, 0) / (peakHours.length || 1);
  const offPeakRevAvg = offPeakHours.reduce((s, h) => s + h.revenue.total, 0) / (offPeakHours.length || 1);
  const activatedISPs = isps.filter(isp => isp.activation.est_afrr_mw > 0 || isp.activation.est_mfrr_mw > 0);
  const socValues = isps.map(isp => isp.soc);

  // Trade signals — limit DA to 24 hours (extractPrices may return >24 from multi-TimeSeries XML)
  const signals = computeTradeSignals(daHourly.slice(0, 24), isps);

  return {
    _meta: {
      date: data.date,
      computed: new Date().toISOString(),
      battery: { mw, mwh, rte, duration },
      data_sources: ['BTD:price_procured_reserves', 'BTD:procured_reserves', 'BTD:balancing_energy_prices', 'BTD:direction_of_balancing_v2', 'BTD:imbalance_prices', 'BTD:imbalance_volumes', 'ENTSOE:A44'],
      note: 'KKME dispatch algorithm. DA prices hourly (ENTSO-E A44); balancing data 15-min (BTD). Market trades at 15-min MTU since Sep 2025.',
      data_class: 'derived',
      kruonis_disaggregation: { method: 'heuristic', fcr_bess_share: 1.0, afrr_bess_share: 0.9, mfrr_bess_share: t_r2(bessShareMFRR(mw)) },
    },
    dispatch: { isps, hourly },
    totals: {
      gross: t_r2(totalRev),
      per_mw: t_r2(totalRev / mw),
      capacity: t_r2(totalCapRev),
      activation: t_r2(totalActRev),
      arbitrage: t_r2(totalArbRev),
      splits_pct: totalRev > 0 ? {
        capacity: Math.round(totalCapRev / totalRev * 100),
        activation: Math.round(totalActRev / totalRev * 100),
        arbitrage: Math.round(totalArbRev / totalRev * 100),
      } : { capacity: 0, activation: 0, arbitrage: 0 },
      annualised: t_r0(totalRev * 365),
      annualised_per_mw: t_r0(totalRev * 365 / mw),
    },
    strategy: {
      peak_offpeak_ratio: t_r1(peakRevAvg / (offPeakRevAvg || 1)),
      activation_rate_pct: t_r1(activatedISPs.length / 96 * 100),
      soc_range: [t_r2(Math.min(...socValues)), t_r2(Math.max(...socValues))],
      fcr_baseload_mw: t_r1(isps.reduce((s, isp) => s + isp.capacity.fcr.mw, 0) / 96),
    },
    signals,
    reserve_availability: {
      afrr_active_isps,
      mfrr_active_isps,
      fcr_active_isps,
      afrr_dispatched_isps,
      mfrr_dispatched_isps,
      total_isps: 96,
      // Procurement rates (fraction of ISPs with capacity offered — typically ~1.0)
      afrr_pct: Math.round(afrr_active_isps / 96 * 100) / 100,
      mfrr_pct: Math.round(mfrr_active_isps / 96 * 100) / 100,
      fcr_pct: Math.round(fcr_active_isps / 96 * 100) / 100,
      // Activation rates (fraction of ISPs with actual energy dispatch — typically 0.10-0.25)
      afrr_activation_pct: Math.round(afrr_dispatched_isps / 96 * 100) / 100,
      mfrr_activation_pct: Math.round(mfrr_dispatched_isps / 96 * 100) / 100,
    },
  };
}

function computeTradeSignals(daHourly, isps) {
  // DA arbitrage windows
  const sorted = daHourly.map((p, h) => ({ h, p })).sort((a, b) => a.p - b.p);
  const chargeHours = sorted.slice(0, 2).map(x => x.h);
  const dischargeHours = sorted.slice(-2).map(x => x.h);
  const avgCharge = chargeHours.length ? chargeHours.reduce((s, h) => s + (daHourly[h] || 0), 0) / chargeHours.length : 0;
  const avgDischarge = dischargeHours.length ? dischargeHours.reduce((s, h) => s + (daHourly[h] || 0), 0) / dischargeHours.length : 0;

  const shortISPs = isps.filter(isp => isp.activation.direction === 'short').length;

  return {
    da_arb: {
      charge_hours: chargeHours,
      discharge_hours: dischargeHours,
      avg_charge_price: t_r2(avgCharge),
      avg_discharge_price: t_r2(avgDischarge),
      net_capture: t_r2(avgDischarge - avgCharge / 0.875),
      confidence: avgDischarge - avgCharge > 40 ? 'HIGH' : avgDischarge - avgCharge > 20 ? 'MEDIUM' : 'LOW',
      data_class: 'derived',
    },
    imbalance_bias: shortISPs > 48 ? 'SHORT' : shortISPs < 40 ? 'LONG' : 'BALANCED',
    activation_probability: t_r2(isps.filter(isp => isp.activation.up_price > 0).length / 96),
    drr_distortion: {
      note: 'Capacity prices reflect DRR-distorted market. TSO resources (Litgrid/Fluence 4×50MW Energy Cells) bid at zero price.',
      derogation_expires: '2028-02',
      extension_possible: '2030-02',
      impact: 'Pre-DRR-exit prices likely 20-40% higher than current clearing',
      data_class: 'reference',
    },
  };
}

// ─── Dispatch Engine v2 — parameterized, co-optimized ───────────────────────
// Source: audit findings Apr 2026. Replaces hardcoded 60MW/130MWh with
// parameterized 50MW + dur_h. Adds per-ISP co-optimization with reserve cap.

// Rystad Dec 2025: Lithuania 15-min DA arbitrage = 14% uplift over hourly.
// Proxy until Nord Pool 15-min API integrated.
const RYSTAD_15MIN_UPLIFT_DECIMAL = 0.14;

// Elering 2026 forecast: post-DRR FCR clearing ~€40-45/MW/h
// based on continental FCR averages and Baltic demand 28 MW.
const POST_DRR_FCR_PRICE_EUR_MW_H = 42;

// Operator practice: max 70% MW to reserves, keep ≥30% for arbitrage.
// Source: enspired German portfolio behavior (Dec 2025).
const RESERVE_MW_CAP_FRACTION = 0.70;

function computeDispatchV2(btdData, daHourly, opts = {}) {
  const mw = opts.mw || 50;
  const dur_h = opts.dur_h || 4;
  const mwh = mw * dur_h;
  const rte = dur_h <= 2 ? 0.855 : 0.852; // source: OEM datasheet
  const mode = opts.mode || 'realised';
  const drr_active = opts.drr_active !== false;
  const date_iso = opts.date_iso || btdData?.date || new Date().toISOString().slice(0, 10);

  const mfrrShare = bessShareMFRR(mw);
  const max_reserve_mw = mw * RESERVE_MW_CAP_FRACTION;
  const min_arb_mw = mw * (1 - RESERVE_MW_CAP_FRACTION);

  // DA price analysis
  const daH = (daHourly || []).slice(0, 24);
  let chargeThreshold = 40, dischargeThreshold = 80;
  if (daH.length >= 20) {
    const sorted = [...daH].sort((a, b) => a - b);
    chargeThreshold = sorted[Math.floor(sorted.length * 0.25)];
    dischargeThreshold = sorted[Math.floor(sorted.length * 0.75)];
  }

  const isps = [];
  let soc = 0.50; // initial SoC
  let totalCapRev = 0, totalActRev = 0, totalArbRev = 0;
  let totalReserveMW = 0, totalArbMW = 0;
  let chargeISPs = [], dischargeISPs = [];

  for (let i = 0; i < 96; i++) {
    const h = Math.floor(i / 4);
    const cap = btdData?.capacity_prices?.[i] || {};
    const procured = btdData?.procured_mw?.[i] || {};
    const actPrice = btdData?.activation_prices?.[i] || {};
    const dir = btdData?.direction?.[i];

    // --- Reserve allocation (capped at 70% MW) ---
    const rawFcr = drr_active ? 0 : Math.min(mw * 0.20, 10); // DRR: FCR = 0 until 2028
    const rawAfrr = Math.min((procured.afrr_up || 0) * 0.9, mw * 0.40);
    const rawMfrr = Math.min((procured.mfrr_up || 0) * mfrrShare, mw * 0.50);
    const rawTotal = rawFcr + rawAfrr + rawMfrr;

    // Scale down proportionally if over cap
    const scale = rawTotal > max_reserve_mw ? max_reserve_mw / rawTotal : 1.0;
    const fcrMW = rawFcr * scale;
    const afrrMW = rawAfrr * scale;
    const mfrrMW = rawMfrr * scale;
    const reservedMW = fcrMW + afrrMW + mfrrMW;
    const arbMW = mw - reservedMW; // always ≥ min_arb_mw

    totalReserveMW += reservedMW;
    totalArbMW += arbMW;

    // --- Capacity revenue (15-min pro rata) ---
    const fcrPrice = drr_active ? (cap.fcr_sym || 0) : POST_DRR_FCR_PRICE_EUR_MW_H;
    const fcrCapRev = fcrMW * fcrPrice / 4;
    const afrrCapRev = afrrMW * (cap.afrr_up || 0) / 4;
    const mfrrCapRev = mfrrMW * (cap.mfrr_up || 0) / 4;
    const ispCapRev = fcrCapRev + afrrCapRev + mfrrCapRev;

    // --- Activation (balancing energy dispatch) ---
    const upActPrice = actPrice.up || 0;
    const isShort = (dir || 0) > 0;
    const afrrActMW = upActPrice > 0 && isShort ? afrrMW * 0.30 : 0;
    const mfrrActMW = upActPrice > 50 && isShort ? mfrrMW * 0.20 : 0;
    const ispActRev = (afrrActMW * upActPrice / 4) + (mfrrActMW * upActPrice / 4);

    // --- Arbitrage (DA spread, always has ≥min_arb_mw) ---
    const daPrice = daH[h] || 0;
    let arbRev = 0;
    let arbAction = 'hold';

    if (arbMW > 0 && daPrice > 0) {
      if (daPrice <= chargeThreshold && soc < 0.85) {
        const maxCharge = Math.min(arbMW / 4, (0.90 - soc) * mwh);
        if (maxCharge > 0) {
          soc += maxCharge / mwh;
          arbRev = -maxCharge * daPrice;
          arbAction = 'charge';
          chargeISPs.push(i);
        }
      } else if (daPrice >= dischargeThreshold && soc > 0.15) {
        const maxDischarge = Math.min(arbMW * rte / 4, (soc - 0.10) * mwh);
        if (maxDischarge > 0) {
          soc -= maxDischarge / mwh;
          arbRev = maxDischarge * daPrice;
          arbAction = 'discharge';
          dischargeISPs.push(i);
        }
      }
    }

    // SoC drain from activations
    const actDrainMWh = (afrrActMW + mfrrActMW) / 4;
    soc = Math.max(0.05, Math.min(0.95, soc - actDrainMWh / mwh));

    totalCapRev += ispCapRev;
    totalActRev += ispActRev;
    totalArbRev += arbRev;

    isps.push({
      isp: i,
      time: `${String(h).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
      da_price: t_r2(daPrice),
      reserves_mw: t_r1(reservedMW),
      arb_mw: t_r1(arbMW),
      soc: t_r3(soc),
      revenue: {
        capacity: t_r2(ispCapRev),
        activation: t_r2(ispActRev),
        arbitrage: t_r2(arbRev),
        total: t_r2(ispCapRev + ispActRev + arbRev),
      },
    });
  }

  const totalRev = totalCapRev + totalActRev + totalArbRev;

  // Hourly aggregation for display
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const slice = isps.filter(isp => Math.floor(isp.isp / 4) === h);
    hourly.push({
      hour: h,
      da_price_eur_mwh: t_r2(daH[h] || 0),
      revenue_eur: {
        capacity: t_r2(slice.reduce((s, p) => s + p.revenue.capacity, 0)),
        activation: t_r2(slice.reduce((s, p) => s + p.revenue.activation, 0)),
        arbitrage: t_r2(slice.reduce((s, p) => s + p.revenue.arbitrage, 0)),
        total: t_r2(slice.reduce((s, p) => s + p.revenue.total, 0)),
      },
      avg_soc_pct: t_r1(slice.reduce((s, p) => s + p.soc, 0) / (slice.length || 1) * 100),
    });
  }

  // Peak/off-peak
  const peakHours = hourly.filter(h => h.hour >= 17 && h.hour <= 20);
  const offPeakHours = hourly.filter(h => h.hour >= 1 && h.hour <= 5);
  const peakRev = peakHours.reduce((s, h) => s + h.revenue_eur.total, 0) / (peakHours.length || 1);
  const offPeakRev = offPeakHours.reduce((s, h) => s + h.revenue_eur.total, 0) / (offPeakHours.length || 1);

  // Activation rate
  const activatedISPs = isps.filter((_, i) => {
    const actP = btdData?.activation_prices?.[i];
    const dir = btdData?.direction?.[i];
    return (actP?.up || 0) > 0 && (dir || 0) > 0;
  });

  // DA capture (hourly)
  const daAvg = daH.length ? daH.reduce((a, b) => a + b, 0) / daH.length : 0;
  const daMin = daH.length ? Math.min(...daH) : 0;
  const daMax = daH.length ? Math.max(...daH) : 0;
  const rawCapture = totalArbRev > 0 && dischargeISPs.length > 0
    ? totalArbRev / mw / (dischargeISPs.length / 4) // per MWh discharged approx
    : (daMax - daMin) * rte * 0.5; // theoretical
  const capture_hourly = Math.max(0, rawCapture);
  const capture_15min = capture_hourly * (1 + RYSTAD_15MIN_UPLIFT_DECIMAL);

  // Cycles
  const socValues = isps.map(p => p.soc);
  const socMin = Math.min(...socValues);
  const socMax = Math.max(...socValues);
  const cycleEstimate = Math.max(0, (socMax - socMin) * mwh / mwh); // fraction of capacity swung

  return {
    meta: {
      mw_total: mw,
      dur_h,
      mwh_total: mwh,
      rte_decimal: rte,
      mode,
      drr_active,
      date_iso,
      as_of_iso: new Date().toISOString(),
      data_class: 'derived',
      sources: mode === 'forecast'
        ? ['KV:da_tomorrow', 'KV:s2_rolling_180d']
        : ['BTD:price_procured_reserves', 'BTD:balancing_energy_prices', 'ENTSOE:A44'],
    },
    revenue_per_mw: {
      daily_eur: t_r0(totalRev / mw),
      annual_eur: t_r0(totalRev / mw) * 365,
      capacity_eur_day: t_r0(totalCapRev / mw),
      activation_eur_day: t_r0(totalActRev / mw),
      arbitrage_eur_day: t_r0(Math.max(0, totalArbRev) / mw),
    },
    split_pct: totalRev > 0 ? {
      capacity: Math.round(totalCapRev / totalRev * 100),
      activation: Math.round(totalActRev / totalRev * 100),
      arbitrage: Math.round(Math.max(0, totalArbRev) / totalRev * 100),
    } : { capacity: 0, activation: 0, arbitrage: 0 },
    mw_allocation: {
      avg_reserves_mw: t_r1(totalReserveMW / 96),
      avg_arbitrage_mw: t_r1(totalArbMW / 96),
      max_reserve_mw: t_r1(max_reserve_mw),
      min_arb_mw: t_r1(min_arb_mw),
    },
    arbitrage_detail: {
      capture_eur_mwh: t_r2(capture_hourly),
      capture_eur_mwh_15min_uplifted: t_r2(capture_15min),
      uplift_factor_decimal: RYSTAD_15MIN_UPLIFT_DECIMAL,
      cycles_per_day_count: t_r2(cycleEstimate),
      charge_isp_count: chargeISPs.length,
      discharge_isp_count: dischargeISPs.length,
      capture_quality_label: capture_hourly >= 40 ? 'high' : capture_hourly >= 15 ? 'moderate' : 'low',
    },
    reserves_detail: {
      fcr_mw_avg: t_r1(drr_active ? 0 : (mw * 0.20 * RESERVE_MW_CAP_FRACTION)),
      afrr_mw_avg: t_r1(isps.reduce((s, p) => s + (p.reserves_mw * 0.4), 0) / 96), // approx
      mfrr_mw_avg: t_r1(isps.reduce((s, p) => s + (p.reserves_mw * 0.6), 0) / 96),
      activation_rate_pct: t_r1(activatedISPs.length / 96 * 100),
    },
    market_context: {
      peak_offpeak_ratio_decimal: t_r2(peakRev / (offPeakRev || 1)),
      da_avg_eur_mwh: t_r1(daAvg),
      da_min_eur_mwh: t_r1(daMin),
      da_max_eur_mwh: t_r1(daMax),
    },
    soc_dynamics: {
      soc_min_pct: t_r1(socMin * 100),
      soc_max_pct: t_r1(socMax * 100),
      soc_avg_pct: t_r1(socValues.reduce((a, b) => a + b, 0) / socValues.length * 100),
    },
    drr_note: {
      derogation_expires_iso: '2028-02',
      extension_possible_iso: '2030-02',
      post_drr_fcr_price_eur_mw_h: POST_DRR_FCR_PRICE_EUR_MW_H,
    },
    hourly_dispatch: hourly,
    isp_dispatch: isps,
  };
}

// Synthesize a BTD-like payload from rolling 180d averages (for forecast mode)
function synthesizeBTDFromRolling(rolling, daTomorrow) {
  if (!rolling?.products) return null;
  const afrr = rolling.products.aFRR || rolling.products.afrr || {};
  const mfrr = rolling.products.mFRR || rolling.products.mfrr || {};
  const fcr = rolling.products.FCR || rolling.products.fcr || {};

  // Build 96-ISP arrays with rolling averages (flat shape)
  const capacity_prices = Array.from({ length: 96 }, () => ({
    fcr_sym: fcr.cap_avg || 0,
    afrr_up: afrr.cap_avg || 0,
    mfrr_up: mfrr.cap_avg || 0,
  }));
  const procured_mw = Array.from({ length: 96 }, () => ({
    fcr_sym: 28, // source: Elering Baltic FCR demand
    afrr_up: 120, // source: Baltic aFRR demand
    mfrr_up: 604, // source: Baltic mFRR demand
  }));
  // Activation shape: higher during high-DA-price hours
  const daP = daTomorrow?.prices_24h || daTomorrow?.lt_prices || [];
  const daMax = daP.length ? Math.max(...daP) : 100;
  const activation_prices = Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4);
    const p = daP[h] || 50;
    return { up: p > daMax * 0.6 ? (afrr.act_avg || 170) : 0, down: 0 };
  });
  const direction = Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4);
    const p = daP[h] || 50;
    return p > daMax * 0.5 ? 1 : -1; // short when high price
  });

  return {
    date: daTomorrow?.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    capacity_prices,
    procured_mw,
    activation_prices,
    direction,
  };
}

// ─── Revenue Engine v6 — OEM degradation, scenarios, CFADS ────────────────────

// OEM degradation curves — PowerCombo LFP 300MWh system
// Values: fraction of BOL usable energy at MV transformer (AC, incl aux)
// Source: OEM datasheet, 1 cycle/day and 2 cycles/day at 0.5C
const DEGRAD_1C = [1, .958, .936, .915, .896, .880, .865, .851, .838, .825, .813, .800, .788, .769, .660, .638];
const DEGRAD_2C = [1, .929, .900, .872, .845, .819, .795, .773, .751, .731, .712, .692, .673, .653, .608, .582];

function getDegradation(year, cyclesPerDay) {
  const w2 = Math.min(1, Math.max(0, (cyclesPerDay - 1)));
  const w1 = 1 - w2;
  function curveVal(curve, yr) {
    if (yr >= curve.length) {
      const last = curve[curve.length - 1];
      const prev = curve[curve.length - 2];
      const rate = 1 - (last / prev);
      return Math.max(0.40, last * Math.pow(1 - rate, yr - curve.length + 1));
    }
    if (Number.isInteger(yr)) return curve[yr];
    const lo = Math.floor(yr), hi = Math.ceil(yr);
    return curve[lo] + (curve[hi] - curve[lo]) * (yr - lo);
  }
  return w1 * curveVal(DEGRAD_1C, year) + w2 * curveVal(DEGRAD_2C, year);
}

// Trading realisation: perfect-foresight discount on S1 sort-and-dispatch capture.
// No real operator achieves theoretical max. Industry range 0.70–0.90.
const TRADING_REALISATION = {
  base: 0.85,          // good optimizer (Capalo AI claims 85-90%)
  conservative: 0.80,  // slightly less efficient optimizer
  stress: 0.75         // weaker execution or market impact
};

// Pipeline realisation rate: fraction of pipeline MW that actually gets built.
// Narrowed range: conservative is "somewhat more builds" not "everything builds".
const PIPELINE_REALISATION = {
  base: 0.50,          // 50% of pipeline built — typical dropout
  conservative: 0.53,  // 53% — slightly more competition
  stress: 0.62         // 62% — strong competition
};

// Pipeline deployment speed (years from 2026).
const PIPELINE_DEPLOY_YEARS = 4;

// Spread growth rates: more renewables = more intermittency = wider spreads.
// German evidence: DA spreads INCREASED despite 1.5 GW BESS deployment.
const SPREAD_GROWTH = {
  base: 0.02,          // spreads grow 2%/yr (more renewables)
  conservative: 0.00,  // flat (BESS smoothing offsets renewable growth)
  stress: -0.01        // slight compression (large BESS fleet smooths)
};

// Intraday uplift: real operators trade DA + intraday auction + continuous.
// Modo Energy: 35% uplift from intraday vs DA-only. 1.25 = conservative.
const INTRADAY_UPLIFT = 1.0; // disabled — S1 capture already at 15-min ISP resolution

// LEGACY — kept for deriveCompression consumers that still read comp_mult
const COMPRESSION_SCENARIO_MULT = {
  base: 1.0, conservative: 2.0, stress: 3.5
};

const REVENUE_SCENARIOS = {
  base: {
    real_factor: 0.90, trd_real: TRADING_REALISATION.base, bal_mult: 1.0, spread_mult: 1.0,
    act_rate_afrr: 0.25, act_rate_mfrr: 0.10,
    bal_compress_yr: 0.03, spread_compress_yr: 0.02,
    rtm_fee_pct: 0.10, brp_fee_yr: 180000,
    opex_per_kw_yr: 39, opex_esc: 0.025,
    debt_margin_bp: 250, aug_cost_pct: 0.12, aug_restore: 0.90,
    avail: 0.95, cycles_2h: 1.5, cycles_4h: 1.0, stack_factor: 0.70,
  },
  conservative: {
    // Each parameter ~5-10% worse than base. Compounding of small drags = 3-5pp IRR gap.
    real_factor: 0.88, trd_real: TRADING_REALISATION.conservative, bal_mult: 0.95, spread_mult: 0.95,
    act_rate_afrr: 0.22, act_rate_mfrr: 0.09,
    bal_compress_yr: 0.035, spread_compress_yr: 0.025,
    rtm_fee_pct: 0.11, brp_fee_yr: 185000,
    opex_per_kw_yr: 40, opex_esc: 0.026,
    debt_margin_bp: 270, aug_cost_pct: 0.12, aug_restore: 0.88,
    avail: 0.94, cycles_2h: 1.4, cycles_4h: 0.95, stack_factor: 0.65,
    demand_growth: 0.02,  // same as base — demand is structural
  },
  stress: {
    // ~20% worse than base across parameters. Tests: everything goes wrong.
    real_factor: 0.78, trd_real: TRADING_REALISATION.stress, bal_mult: 0.85, spread_mult: 0.85,
    act_rate_afrr: 0.19, act_rate_mfrr: 0.07,
    bal_compress_yr: 0.05, spread_compress_yr: 0.04,
    rtm_fee_pct: 0.13, brp_fee_yr: 210000,
    opex_per_kw_yr: 43, opex_esc: 0.032,
    debt_margin_bp: 320, aug_cost_pct: 0.14, aug_restore: 0.83,
    avail: 0.92, cycles_2h: 1.1, cycles_4h: 0.85, stack_factor: 0.55,
    demand_growth: 0.015,
  },
};

const RESERVE_PRODUCTS = {
  fcr:  { share: 0.16, dur_req_h: 0.5, cap_fallback: 45 },
  afrr: { share: 0.34, dur_req_h: 1.0, cap_fallback: 40 },
  mfrr: { share: 0.50, dur_req_h: 0.25, cap_fallback: 22 },
};

function calcIRR(cf) {
  let lo = -0.99, hi = 2.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npv = cf.reduce((s, c, t) => s + c / Math.pow(1 + mid, t), 0);
    if (npv > 0) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2 * 10000) / 10000;
}

/**
 * computeRevenueV7: observed base year as Year 1 foundation, derived compression.
 *
 * Uses the same DCF/financing/DSCR/IRR machinery as v6 but replaces the
 * revenue computation: Y1 = observed trailing 12m annualised revenue,
 * Years 2-20 = Y1 × compression × degradation.
 *
 * Falls back to v6 if base year data is insufficient.
 */
function computeRevenueV7(params, kv) {
  const mw = params.mw || 50;
  const dur_h = params.dur_h || 4;
  const mwh = mw * dur_h;
  const sc = REVENUE_SCENARIOS[params.scenario || 'base'] || REVENUE_SCENARIOS.base;
  const capex_kwh = params.capex_kwh || 164;
  const cod_year = params.cod_year || 2028;
  const cycles = dur_h <= 2 ? sc.cycles_2h : sc.cycles_4h;
  const rte = cycles <= 1.2 ? 0.855 : 0.852;

  // ── Observed base year (always computed with base params — observed data is scenario-independent) ──
  const base_year = computeBaseYear(kv, dur_h, REVENUE_SCENARIOS.base);
  const compression = deriveCompression(kv);

  // Gate: need at least 6 months of S1 data to use v7
  if (base_year.data_coverage.s1_months < 6) {
    const v6_result = computeRevenueV6(params, kv);
    v6_result.model_version = 'v6_fallback';
    v6_result.base_year = base_year;
    v6_result.forward = { compression_rate: compression.rate, compression_source: compression.source };
    return v6_result;
  }

  // ── Base year revenue per MW (annual, from observed data) ──
  const by_trading_per_mw  = base_year.annual_totals.trading;   // €/MW/yr
  const by_balancing_per_mw = base_year.annual_totals.balancing; // €/MW/yr

  // ── Financing setup (same as v6) ──
  const euribor = ((kv?.euribor?.euribor_nominal_3m ?? kv?.s3?.euribor_nominal_3m) || 2.01) / 100;
  const rate_allin = euribor + sc.debt_margin_bp / 10000;
  const grant_pct = params.grant_pct || 0;
  const gross_capex_total = capex_kwh * mwh * 1000;
  const capex_net_total = gross_capex_total * (1 - grant_pct);
  const debt_pct = 0.55;
  const debt_initial = Math.round(capex_net_total * debt_pct);
  const equity_initial = capex_net_total - debt_initial;
  const tenor = 8;
  const grace = 1;
  const tax_rate = 0.17;
  const depr_years = 10;
  const pmt = debt_initial * rate_allin / (1 - Math.pow(1 + rate_allin, -tenor));

  // Scenario compression: multiplicative on observed rate.
  // Base = 1× observed, conservative = 2× (fleet growth doubles compression),
  // stress = 3.5× (full pipeline realisation).
  const scenario_name = params.scenario || 'base';
  const comp_mult = COMPRESSION_SCENARIO_MULT[scenario_name] || 1.0;
  const effective_compression = Math.min(0.25, compression.rate * comp_mult);

  // ── 20-year timeseries ──
  const years = [];
  let debt_bal = debt_initial;
  let min_dscr = Infinity;
  let crossover_year = null;
  let revenue_crossover_year = null;
  for (let yr = 1; yr <= 20; yr++) {
    // C1. Degradation
    const retention = getDegradation(yr, cycles);
    let usable_mwh_per_mw = dur_h * retention;

    // C2. Augmentation at year 10
    let aug_capex = 0;
    if (yr === 10) {
      const pre_aug = dur_h * retention;
      const target = dur_h * sc.aug_restore;
      const added = Math.max(0, target - pre_aug);
      aug_capex = added * sc.aug_cost_pct * capex_kwh * 1000 * mw;
      usable_mwh_per_mw = Math.min(target, pre_aug + added);
    }
    if (yr > 10) {
      const ret_at_10 = getDegradation(10, cycles);
      const target_10 = dur_h * sc.aug_restore;
      const restored = Math.min(target_10, dur_h * ret_at_10 + Math.max(0, target_10 - dur_h * ret_at_10));
      usable_mwh_per_mw = restored * (retention / ret_at_10);
    }

    // C3. Energy stacking constraint (same as v6)
    const p_avail = sc.avail;
    const products = {};
    let total_energy_req = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      const raw = p_avail * prod.share;
      total_energy_req += raw * prod.dur_req_h;
      products[name] = { raw };
    }
    const scale_energy = Math.min(1.0, usable_mwh_per_mw / total_energy_req);
    for (const [name] of Object.entries(RESERVE_PRODUCTS)) {
      products[name].eff = products[name].raw * scale_energy;
    }

    // C4. S/D elasticity mix model: R from reserve price curve, T from renewable trajectory
    const cal_year = cod_year + yr;
    const mix = computeTradingMix(kv, dur_h, cal_year, scenario_name, sc, yr);

    // Compress: R decay for balancing calibration, R+T for reporting
    const mix_now = computeTradingMix(kv, dur_h, 2026, scenario_name, sc, 0);
    const RT_now = mix_now.R + mix_now.T;
    const RT_yr = mix.R + mix.T;
    const compress_total = RT_now > 0 ? RT_yr / RT_now : 1.0;
    const R_yr = mix.R;

    // C5. Degradation effect on trading
    const deg_ratio_vs_y1 = retention / getDegradation(1, cycles);

    // C6. Revenue: balancing from R elasticity, trading from capture × MWh
    const bal_scale = scale_energy / Math.min(1.0, (dur_h * getDegradation(1, cycles)) / total_energy_req);

    // Balancing: split into capacity (follows R) and activation (additional S/D compression)
    const R_now = mix_now.R;
    const bal_calibration = by_balancing_per_mw > 0 && R_now > 0 ? by_balancing_per_mw / R_now : 1;
    // R elasticity already compresses activation (included in R_base derivation)
    const rev_bal = R_yr * bal_calibration * mw * Math.min(1.0, bal_scale);

    // Trading: capture × RTE × realisation × MWh × fraction × depth discount
    // Use rolling 30d mean (stable) for forward projection, not spot capture
    const s1_cap = kv.s1_capture || {};
    const yr_capture = dur_h <= 2
      ? (s1_cap.rolling_30d?.stats_2h?.mean ?? s1_cap.capture_2h?.gross_eur_mwh ?? 140)
      : (s1_cap.rolling_30d?.stats_4h?.mean ?? s1_cap.capture_4h?.gross_eur_mwh ?? 125);
    const trading_real = sc.trd_real || 0.85;
    const rte_yr = dur_h <= 2 ? 0.855 : 0.852;
    const depth = marketDepthFactor(mix.sd_ratio);
    // Capture grows with renewable-driven spread widening (same multiplier as T)
    const spread_mult = mix.spread_mult || 1.0;
    const rev_trd = yr_capture * spread_mult * depth * rte_yr * trading_real
                  * dur_h * cycles * 365
                  * mix.trading_fraction * sc.avail * deg_ratio_vs_y1 * mw;

    // C7. Gross → Net
    // Revenue floor: even in saturated markets, BESS earns from trading + minimum FCR
    // UK FFR at peak saturation: £40-60k/MW/yr. €50k = realistic floor.
    const REVENUE_FLOOR_PER_MW = 50000; // €50k/MW/yr minimum
    const rev_gross = Math.max(REVENUE_FLOOR_PER_MW * mw, rev_bal + rev_trd);
    const rtm_fee = rev_gross * sc.rtm_fee_pct;
    const brp_fee = sc.brp_fee_yr * Math.pow(1 + sc.opex_esc, yr - 1);
    const rev_net = rev_gross - rtm_fee - brp_fee;
    const rev_cap = rev_bal * 0.65;  // approximate split for reporting
    const rev_act = rev_bal * 0.35;

    // C8. OPEX
    const opex_full = sc.opex_per_kw_yr * mw * 1000 * Math.pow(1 + sc.opex_esc, yr - 1);

    // C9. EBITDA (mothball if cash-negative: standby OPEX = 20%)
    let opex = opex_full;
    let ebitda = rev_net - opex;
    if (ebitda < 0) {
      opex = opex_full * 0.20;
      ebitda = -opex;
    }

    // C10. Tax (with depreciation shield)
    const depr_base = yr <= depr_years ? gross_capex_total / depr_years : 0;
    const depr_aug = (yr >= 10 && yr < 10 + depr_years) ? aug_capex / depr_years : 0;
    const depr = depr_base + depr_aug;
    const interest_yr = debt_bal > 0 ? debt_bal * rate_allin : 0;
    const taxable = Math.max(0, ebitda - depr - interest_yr);
    const cash_tax = taxable * tax_rate;
    const taxable_unlev = Math.max(0, ebitda - depr);
    const cash_tax_unlev = taxable_unlev * tax_rate;

    // C11. CFADS
    const maint_capex = aug_capex;
    const cfads = ebitda - cash_tax - maint_capex;

    // C12. Debt service
    let ds = 0, principal = 0;
    if (yr <= grace && debt_bal > 0) {
      ds = debt_bal * rate_allin;
      principal = 0;
    } else if (yr <= grace + tenor && debt_bal > 0) {
      ds = pmt;
      const int_exp = debt_bal * rate_allin;
      principal = Math.min(pmt - int_exp, debt_bal);
    }
    debt_bal = Math.max(0, debt_bal - principal);

    // C13. DSCR
    const dscr = ds > 0 ? cfads / ds : null;
    if (dscr !== null && dscr < min_dscr) min_dscr = dscr;

    // C14. Crossover
    if (!crossover_year && rev_net < opex) {
      crossover_year = cod_year + yr;
    }
    // Revenue crossover: when trading exceeds balancing
    if (!revenue_crossover_year && rev_trd > rev_bal) {
      revenue_crossover_year = cod_year + yr;
    }

    // C15. Cash flows
    const project_cf = ebitda - cash_tax_unlev - maint_capex;
    const equity_cf = cfads - ds;

    years.push({
      yr, cal_year,
      retention: Math.round(retention * 1000) / 1000,
      usable_mwh_per_mw: Math.round(usable_mwh_per_mw * 100) / 100,
      scale_energy: Math.round(scale_energy * 1000) / 1000,
      compress_total: Math.round(compress_total * 1000) / 1000,
      rev_cap: Math.round(rev_cap), rev_act: Math.round(rev_act),
      rev_bal: Math.round(rev_bal), rev_trd: Math.round(rev_trd),
      rev_gross: Math.round(rev_gross),
      trading_fraction: Math.round(mix.trading_fraction * 1000) / 1000,
      switching_friction: mix.switching_friction,
      sd_ratio: mix.sd_ratio,
      R: mix.R, T: mix.T, price_ratio: mix.price_ratio,
      spread_mult: mix.spread_mult, renewable_share: mix.renewable_share,
      market_depth: Math.round(depth * 1000) / 1000,
      rtm_fee: Math.round(rtm_fee), brp_fee: Math.round(brp_fee),
      rev_net: Math.round(rev_net),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      depr: Math.round(depr),
      cash_tax: Math.round(cash_tax), cash_tax_unlev: Math.round(cash_tax_unlev),
      cfads: Math.round(cfads), maint_capex: Math.round(maint_capex),
      ds: Math.round(ds), dscr: dscr != null ? Math.round(dscr * 100) / 100 : null,
      debt_bal: Math.round(debt_bal),
      project_cf: Math.round(project_cf), equity_cf: Math.round(equity_cf),
    });
  }

  // ── IRR ──
  const project_cfs = [-capex_net_total, ...years.map(y => y.project_cf)];
  const project_irr = calcIRR(project_cfs);
  const equity_cfs = [-equity_initial, ...years.map(y => y.equity_cf)];
  const equity_irr = calcIRR(equity_cfs);

  // NPV
  const wacc = 0.08;
  let npv_project = 0;
  for (let t = 0; t < project_cfs.length; t++) {
    npv_project += project_cfs[t] / Math.pow(1 + wacc, t);
  }

  // Payback
  let cumul = 0, payback = null;
  for (let t = 0; t < project_cfs.length; t++) {
    cumul += project_cfs[t];
    if (cumul >= 0 && payback === null) payback = t;
  }

  // Reconciliation
  const recon = {
    gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross - y.rev_bal - y.rev_trd) < 2),
    net_equals_gross_minus_fees: years.every(y => Math.abs(y.rev_net - (y.rev_gross - y.rtm_fee - y.brp_fee)) < 2),
    ebitda_equals_net_minus_opex: years.every(y => Math.abs(y.ebitda - (y.rev_net - y.opex)) < 2),
    cfads_equals_ebitda_minus_tax_minus_maint: years.every(y => Math.abs(y.cfads - (y.ebitda - y.cash_tax - y.maint_capex)) < 2),
    debt_repaid: debt_bal < 100,
  };

  // Bankability
  let cons_min_dscr = min_dscr;
  if (params.scenario !== 'conservative' && !params._skip_cons) {
    const cons_result = computeRevenueV7({ ...params, scenario: 'conservative', _skip_cons: true }, kv);
    cons_min_dscr = cons_result.min_dscr;
  }
  const bankability = cons_min_dscr >= 1.20 ? 'Pass'
    : cons_min_dscr >= 1.0 ? 'Marginal'
    : 'Fail';

  if (min_dscr === Infinity) min_dscr = null;

  // Fleet trajectory for COD context
  const fleet = kv?.fleet;
  const cod_sd = fleet?.trajectory?.find?.(t => t.year === cod_year) ?? null;

  const y1 = years[0];

  // Monthly seasonal DSCR overlay
  const SEASONAL_FACTORS = [1.35, 1.25, 1.10, 0.85, 0.70, 0.55, 0.50, 0.60, 0.80, 1.05, 1.20, 1.40];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sf_sum = SEASONAL_FACTORS.reduce((a, b) => a + b, 0);
  const y1_cfads = years[0]?.cfads || 0;
  const monthly_debt_svc = pmt / 12;
  const monthly_y1 = MONTH_NAMES.map((name, i) => {
    const cfads_m = y1_cfads * SEASONAL_FACTORS[i] / sf_sum;
    const dscr_m = monthly_debt_svc > 0 ? cfads_m / monthly_debt_svc : null;
    return {
      month: name, seasonal_factor: SEASONAL_FACTORS[i],
      cfads: Math.round(cfads_m), debt_service: Math.round(monthly_debt_svc),
      dscr: dscr_m ? Math.round(dscr_m * 100) / 100 : null,
    };
  });
  const worst_month_dscr = Math.min(
    ...monthly_y1.filter(m => m.dscr !== null).map(m => m.dscr)
  );

  // S2 data for signal_inputs
  const s2 = kv?.s2 || {};
  const s1 = kv?.s1 || {};
  const act_parsed = kv?.s2_activation_parsed || {};
  const s1_cap = kv?.s1_capture || {};
  const prices_source = s2.afrr_cap_avg != null ? 'BTD measured' : (s2.afrr_up_avg != null ? 'BTD partial' : 'proxy');

  // v7.1 — per-product compression at COD year (cpi formula on per-product S/D)
  const cod_mix = computeTradingMix(kv, dur_h, cod_year, scenario_name, sc, 0);
  const cpi_fcr_at_cod  = Math.round(cpiCurve(cod_mix.per_product.fcr.sd_ratio)  * 100) / 100;
  const cpi_afrr_at_cod = Math.round(cpiCurve(cod_mix.per_product.afrr.sd_ratio) * 100) / 100;
  const cpi_mfrr_at_cod = Math.round(cpiCurve(cod_mix.per_product.mfrr.sd_ratio) * 100) / 100;

  return {
    // Config
    system: `${mw} MW / ${mwh} MWh (${dur_h}H)`,
    duration: dur_h,
    capex_scenario: `€${capex_kwh}/kWh`,
    capex_eur_kwh: capex_kwh,
    capex_kwh, capex_total: gross_capex_total, capex_net: capex_net_total,
    gross_capex: gross_capex_total,
    grant_amount: Math.round(gross_capex_total * grant_pct),
    grant_label: grant_pct > 0 ? `${Math.round(grant_pct * 100)}% grant` : 'No grant',
    net_capex: capex_net_total,
    cod_year,
    scenario: params.scenario || 'base',
    model_version: 'v7.1',
    engine_changelog: {
      v7_to_v7_1: [
        'Per-product cannibalization (cpi) replaces aggregate cpi for FCR / aFRR / mFRR',
        'Bid-acceptance saturation modeled in computeTradingMix',
        'aFRR activation rate tuned to 0.25 (Baltic operational baseline)',
      ],
    },

    // Market context
    sd_ratio: cod_sd?.sd_ratio ?? null,
    phase: cod_sd?.phase ?? null,
    cpi_at_cod: cod_sd?.cpi ?? null,
    cpi_fcr_at_cod,
    cpi_afrr_at_cod,
    cpi_mfrr_at_cod,
    per_product_at_cod: cod_mix.per_product,

    // Headline metrics
    project_irr: project_irr < -0.50 ? null : project_irr,
    equity_irr: equity_irr < -0.50 ? null : equity_irr,
    irr_status: project_irr < -0.50 ? 'uneconomic'
      : project_irr < 0.06 ? 'below_hurdle'
      : project_irr < 0.12 ? 'marginal'
      : 'investable',
    npv_at_wacc: Math.round(npv_project),
    npv_project: Math.round(npv_project),
    net_rev_per_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    net_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null,
    min_dscr_conservative: cons_min_dscr != null ? Math.round(cons_min_dscr * 100) / 100 : null,
    bankability,
    simple_payback_years: payback,
    payback_years: payback,
    crossover_year: crossover_year || (cod_year + 25),
    revenue_crossover_year: revenue_crossover_year || null,
    revenue_crossover_note: revenue_crossover_year
      ? `Trading exceeds balancing in ${revenue_crossover_year}`
      : 'Trading does not exceed balancing within 20-year horizon',

    // Y1 backward compat
    gross_revenue_y1: y1 ? y1.rev_gross : 0,
    net_revenue_y1: y1 ? y1.rev_net : 0,
    ebitda_y1: y1 ? y1.ebitda : 0,
    opex_y1: y1 ? y1.opex : 0,
    rtm_fees_y1: y1 ? y1.rtm_fee + y1.brp_fee : 0,
    capacity_y1: y1 ? y1.rev_cap : 0,
    activation_y1: y1 ? y1.rev_act : 0,
    arbitrage_y1: y1 ? y1.rev_trd : 0,
    capacity_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_cap / y1.rev_gross * 100) / 100 : 0,
    activation_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_act / y1.rev_gross * 100) / 100 : 0,
    arbitrage_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_trd / y1.rev_gross * 100) / 100 : 0,

    // Financing
    total_debt: debt_initial, total_equity: equity_initial,
    debt_initial, equity_initial, rate_allin,
    annual_debt_service: Math.round(pmt),

    // Timeseries
    years,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.rev_net, ebitda: yr.ebitda, dscr: yr.dscr } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,
    fleet_context: {
      current_sd: fleet?.sd_ratio ?? null,
      weighted_supply: fleet?.baltic_weighted_mw ?? fleet?.baltic_operational_mw ?? null,
      pipeline_mw: fleet?.baltic_pipeline_mw ?? null,
      demand_mw: fleet?.eff_demand_mw ?? 752,
      pipeline_realisation: PIPELINE_REALISATION[scenario_name],
      intraday_uplift: INTRADAY_UPLIFT,
      switching_friction: { immature: FRICTION_IMMATURE, mature: FRICTION_MATURE, maturity_years: MATURITY_YEARS },
      spread_growth: SPREAD_GROWTH[scenario_name] ?? 0.02,
      source: fleet ? 'live_s4_fleet' : 'fallback',
    },

    // Benchmarks
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source,
    timestamp: new Date().toISOString(),

    // Signal inputs used
    signal_inputs: {
      s1_capture: dur_h <= 2
        ? (s1_cap.capture_2h?.gross_eur_mwh ?? (by_trading_per_mw > 0 ? by_trading_per_mw / (rte * dur_h * cycles * (base_year.time_model?.effective_arb_pct || 0.115) * sc.trd_real * 365) : 0))
        : (s1_cap.capture_4h?.gross_eur_mwh ?? (by_trading_per_mw > 0 ? by_trading_per_mw / (rte * dur_h * cycles * (base_year.time_model?.effective_arb_pct || 0.115) * sc.trd_real * 365) : 0)),
      afrr_clearing: act_parsed?.lt?.afrr_p50 ?? s2.afrr_up_avg ?? 170,
      mfrr_clearing: act_parsed?.lt?.mfrr_p50 ?? s2.mfrr_up_avg ?? 110,
      afrr_cap: s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.7,
      mfrr_cap: s2.mfrr_cap_avg ?? s2.mfrr_up_avg ?? 21.5,
      euribor: Math.round(euribor * 10000) / 100,
      rate_allin_pct: Math.round(rate_allin * 10000) / 100,
    },

    // Reconciliation
    reconciliation: recon,

    // Monthly seasonal DSCR
    monthly_y1,
    worst_month_dscr,

    // v7 new fields
    base_year,
    forward: {
      compression_rate_observed: compression.rate,
      compression_source: compression.source,
      compression_data_points: compression.data_points,
      initial_p50: compression.initial_p50,
      recent_avg_p50: compression.recent_avg_p50,
      scenario_multiplier: comp_mult,
      effective_compression_rate: effective_compression,
      rate_full_window: compression.rate_full_window,
    },
    assumptions: {
      trading_realisation: sc.trd_real,
      trading_realisation_note: 'Perfect-foresight discount. Industry range 0.70-0.90.',
      compression_scenario_mult: comp_mult,
      effective_compression: effective_compression,
    },
  };
}

function computeRevenueV6(params, kv) {
  // A. Input resolution
  const mw = params.mw || 50;
  const dur_h = params.dur_h || 4;
  const mwh = mw * dur_h;
  const sc = REVENUE_SCENARIOS[params.scenario || 'base'] || REVENUE_SCENARIOS.base;
  const capex_kwh = params.capex_kwh || 164;
  const capex_total = capex_kwh * dur_h * 1000; // per MW → total uses mw later
  const cod_year = params.cod_year || 2028;
  const cycles = dur_h <= 2 ? sc.cycles_2h : sc.cycles_4h;
  const rte = cycles <= 1.2 ? 0.855 : 0.852;

  const fleet = kv?.fleet;
  const s2 = kv?.s2;
  const s1 = kv?.s1;

  // Live signal inputs
  // s1_capture: use computed capture fields, then spread × shape premium
  const s1_capture_4h = s1?.capture_4h_gross || s1?.gross_4h
    || (s1?.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 : null) || 134;
  const s1_capture_2h = s1?.capture_2h_gross || s1?.gross_2h
    || (s1_capture_4h * 1.12) || 149;
  const s1_capture = dur_h <= 2 ? s1_capture_2h : s1_capture_4h;
  const afrr_clearing = s2?.afrr_up_avg || 171;
  const mfrr_clearing = s2?.mfrr_up_avg || 81;
  // Capacity prices: BTD bid averages (7.7 aFRR, 21.5 mFRR). RESERVE_PRODUCTS.cap_fallback
  // (40, 22) are theoretical Baltic-calibrated assumptions — only for when S2 has zero data.
  const afrr_cap = s2?.afrr_cap_avg || 7.7;
  const mfrr_cap = s2?.mfrr_cap_avg || 21.5;
  const fcr_cap = RESERVE_PRODUCTS.fcr.cap_fallback;
  const euribor = ((kv?.euribor?.euribor_nominal_3m ?? kv?.s3?.euribor_nominal_3m) || 2.01) / 100;
  const rate_allin = euribor + sc.debt_margin_bp / 10000;

  // B. Financing setup
  const grant_pct = params.grant_pct || 0;
  const gross_capex_total = capex_kwh * mwh * 1000;
  const capex_net_total = gross_capex_total * (1 - grant_pct);
  const debt_pct = 0.55;
  const debt_initial = Math.round(capex_net_total * debt_pct);
  const equity_initial = capex_net_total - debt_initial;
  const tenor = 8;
  const grace = 1;
  const tax_rate = 0.17;
  const depr_years = 10;

  // Annuity payment (post-grace)
  const pmt = debt_initial * rate_allin / (1 - Math.pow(1 + rate_allin, -tenor));

  // Prices source
  const prices_source = s2?.afrr_cap_avg != null ? 'BTD measured' : (s2?.afrr_up_avg != null ? 'BTD partial' : 'proxy');

  // C. 20-year timeseries
  const years = [];
  let debt_bal = debt_initial;
  let min_dscr = Infinity;
  let crossover_year = null;

  for (let yr = 1; yr <= 20; yr++) {
    // C1. Degradation
    const retention = getDegradation(yr, cycles);
    let usable_mwh_per_mw = dur_h * retention;

    // C2. Augmentation at year 10
    let aug_capex = 0;
    if (yr === 10) {
      const pre_aug = dur_h * retention;
      const target = dur_h * sc.aug_restore;
      const added = Math.max(0, target - pre_aug);
      aug_capex = added * sc.aug_cost_pct * capex_kwh * 1000 * mw;
      usable_mwh_per_mw = Math.min(target, pre_aug + added);
    }
    // Post-augmentation: use restored baseline
    if (yr > 10) {
      const ret_at_10 = getDegradation(10, cycles);
      const target_10 = dur_h * sc.aug_restore;
      const restored = Math.min(target_10, dur_h * ret_at_10 + Math.max(0, target_10 - dur_h * ret_at_10));
      usable_mwh_per_mw = restored * (retention / ret_at_10);
    }

    // C3. Stacking constraint
    const p_avail = sc.avail;
    const products = {};
    let total_energy_req = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      const raw = p_avail * prod.share;
      total_energy_req += raw * prod.dur_req_h;
      products[name] = { raw };
    }
    const scale_energy = Math.min(1.0, usable_mwh_per_mw / total_energy_req);

    let total_res_mw = 0;
    for (const [name, prod] of Object.entries(RESERVE_PRODUCTS)) {
      products[name].eff = products[name].raw * scale_energy;
      total_res_mw += products[name].eff;
    }
    // Stack factor = fraction of MW available for arbitrage on top of reserves
    // (reserves and trading are stacked, not exclusive power slices)
    const arb_power = sc.stack_factor;

    // C4. Compression — calendar-year based (2027 = first viable COD reference)
    const cal_year = cod_year + yr;
    const years_since_ref = Math.max(0, cal_year - 2027);
    const bal_comp = Math.pow(1 - sc.bal_compress_yr, years_since_ref);
    const spread_comp = Math.pow(1 - sc.spread_compress_yr, years_since_ref);

    // C5. Balancing revenue (capacity + energy) — per MW, then * mw
    const rev_cap_fcr  = products.fcr.eff  * fcr_cap   * 8760 * sc.bal_mult * bal_comp;
    const rev_cap_afrr = products.afrr.eff * afrr_cap  * 8760 * sc.bal_mult * bal_comp;
    const rev_cap_mfrr = products.mfrr.eff * mfrr_cap  * 8760 * sc.bal_mult * bal_comp;
    const rev_cap = (rev_cap_fcr + rev_cap_afrr + rev_cap_mfrr) * mw;

    const rev_act_afrr = products.afrr.eff * sc.act_rate_afrr * 8760 * afrr_clearing * 0.55 * sc.bal_mult * bal_comp;
    const rev_act_mfrr = products.mfrr.eff * sc.act_rate_mfrr * 8760 * mfrr_clearing * 0.75 * sc.bal_mult * bal_comp;
    const rev_act = (rev_act_afrr + rev_act_mfrr) * mw;

    const rev_bal = (rev_cap + rev_act) * sc.real_factor;

    // C6. Trading revenue (DA spread capture)
    const e_out_cycle = Math.min(usable_mwh_per_mw, arb_power * dur_h);
    const e_out = e_out_cycle * cycles * 365 * mw;
    const capture = s1_capture * sc.spread_mult * spread_comp;
    const rev_trd = e_out * capture * rte;

    // C7. Gross → Net reconciliation
    const rev_gross = rev_bal + rev_trd;
    const rtm_fee = rev_gross * sc.rtm_fee_pct;
    const brp_fee = sc.brp_fee_yr * Math.pow(1 + sc.opex_esc, yr - 1);
    const rev_net = rev_gross - rtm_fee - brp_fee;

    // C8. OPEX
    const opex = sc.opex_per_kw_yr * mw * 1000 * Math.pow(1 + sc.opex_esc, yr - 1);

    // C9. EBITDA
    const ebitda = rev_net - opex;

    // C10. Tax (with depreciation shield)
    const depr_base = yr <= depr_years ? gross_capex_total / depr_years : 0;
    const depr_aug = (yr >= 10 && yr < 10 + depr_years) ? aug_capex / depr_years : 0;
    const depr = depr_base + depr_aug;
    const interest_yr = debt_bal > 0 ? debt_bal * rate_allin : 0;
    const taxable = Math.max(0, ebitda - depr - interest_yr);
    const cash_tax = taxable * tax_rate;

    // Unlevered tax (for project IRR)
    const taxable_unlev = Math.max(0, ebitda - depr);
    const cash_tax_unlev = taxable_unlev * tax_rate;

    // C11. CFADS
    const maint_capex = aug_capex;
    const cfads = ebitda - cash_tax - maint_capex;

    // C12. Debt service
    let ds = 0, principal = 0;
    if (yr <= grace && debt_bal > 0) {
      ds = debt_bal * rate_allin;
      principal = 0;
    } else if (yr <= grace + tenor && debt_bal > 0) {
      ds = pmt;
      const int_exp = debt_bal * rate_allin;
      principal = Math.min(pmt - int_exp, debt_bal);
    }
    debt_bal = Math.max(0, debt_bal - principal);

    // C13. DSCR
    const dscr = ds > 0 ? cfads / ds : null;
    if (dscr !== null && dscr < min_dscr) min_dscr = dscr;

    // C14. Crossover check
    if (!crossover_year && rev_net < opex) {
      crossover_year = cod_year + yr;
    }

    // C15. Project cash flow (unlevered)
    const project_cf = ebitda - cash_tax_unlev - maint_capex;

    // C16. Equity cash flow
    const equity_cf = cfads - ds;

    years.push({
      yr, cal_year,
      retention: Math.round(retention * 1000) / 1000,
      usable_mwh_per_mw: Math.round(usable_mwh_per_mw * 100) / 100,
      scale_energy: Math.round(scale_energy * 1000) / 1000,
      rev_cap: Math.round(rev_cap), rev_act: Math.round(rev_act),
      rev_bal: Math.round(rev_bal), rev_trd: Math.round(rev_trd),
      rev_gross: Math.round(rev_gross),
      rtm_fee: Math.round(rtm_fee), brp_fee: Math.round(brp_fee),
      rev_net: Math.round(rev_net),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      depr: Math.round(depr),
      cash_tax: Math.round(cash_tax), cash_tax_unlev: Math.round(cash_tax_unlev),
      cfads: Math.round(cfads), maint_capex: Math.round(maint_capex),
      ds: Math.round(ds), dscr: dscr != null ? Math.round(dscr * 100) / 100 : null,
      debt_bal: Math.round(debt_bal),
      project_cf: Math.round(project_cf), equity_cf: Math.round(equity_cf),
    });
  }

  // D. IRR
  const project_cfs = [-capex_net_total, ...years.map(y => y.project_cf)];
  const project_irr = calcIRR(project_cfs);

  const equity_cfs = [-equity_initial, ...years.map(y => y.equity_cf)];
  const equity_irr = calcIRR(equity_cfs);

  // NPV
  const wacc = 0.08;
  let npv_project = 0;
  for (let t = 0; t < project_cfs.length; t++) {
    npv_project += project_cfs[t] / Math.pow(1 + wacc, t);
  }

  // Payback
  let cumul = 0, payback = null;
  for (let t = 0; t < project_cfs.length; t++) {
    cumul += project_cfs[t];
    if (cumul >= 0 && payback === null) payback = t;
  }

  // E. Reconciliation checks
  // Tolerance of 2 accounts for independent rounding of each field
  const recon = {
    gross_equals_bal_plus_trd: years.every(y => Math.abs(y.rev_gross - y.rev_bal - y.rev_trd) < 2),
    net_equals_gross_minus_fees: years.every(y => Math.abs(y.rev_net - (y.rev_gross - y.rtm_fee - y.brp_fee)) < 2),
    ebitda_equals_net_minus_opex: years.every(y => Math.abs(y.ebitda - (y.rev_net - y.opex)) < 2),
    cfads_equals_ebitda_minus_tax_minus_maint: years.every(y => Math.abs(y.cfads - (y.ebitda - y.cash_tax - y.maint_capex)) < 2),
    debt_repaid: debt_bal < 100,
  };

  // F. Bankability — check conservative DSCR
  let cons_min_dscr = min_dscr;
  if (params.scenario !== 'conservative' && !params._skip_cons) {
    const cons_result = computeRevenueV6({ ...params, scenario: 'conservative', _skip_cons: true }, kv);
    cons_min_dscr = cons_result.min_dscr;
  }
  const bankability = cons_min_dscr >= 1.20 ? 'Pass'
    : cons_min_dscr >= 1.0 ? 'Marginal'
    : 'Fail';

  if (min_dscr === Infinity) min_dscr = null;

  // Fleet trajectory for COD context
  const cod_sd = fleet?.trajectory?.find?.(t => t.year === cod_year) ?? null;

  const y1 = years[0];

  // G. Monthly seasonal DSCR overlay
  const SEASONAL_FACTORS = [1.35, 1.25, 1.10, 0.85, 0.70, 0.55, 0.50, 0.60, 0.80, 1.05, 1.20, 1.40];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sf_sum = SEASONAL_FACTORS.reduce((a, b) => a + b, 0);

  const y1_cfads = years[0]?.cfads || 0;
  const monthly_debt_svc = pmt / 12;

  const monthly_y1 = MONTH_NAMES.map((name, i) => {
    const cfads_m = y1_cfads * SEASONAL_FACTORS[i] / sf_sum;
    const dscr_m = monthly_debt_svc > 0 ? cfads_m / monthly_debt_svc : null;
    return {
      month: name,
      seasonal_factor: SEASONAL_FACTORS[i],
      cfads: Math.round(cfads_m),
      debt_service: Math.round(monthly_debt_svc),
      dscr: dscr_m ? Math.round(dscr_m * 100) / 100 : null,
    };
  });

  const worst_month_dscr = Math.min(
    ...monthly_y1.filter(m => m.dscr !== null).map(m => m.dscr)
  );

  return {
    // Config
    system: `${mw} MW / ${mwh} MWh (${dur_h}H)`,
    duration: dur_h,
    capex_scenario: `€${capex_kwh}/kWh`,
    capex_eur_kwh: capex_kwh,
    capex_kwh, capex_total: gross_capex_total, capex_net: capex_net_total,
    gross_capex: gross_capex_total,
    grant_amount: Math.round(gross_capex_total * grant_pct),
    grant_label: grant_pct > 0 ? `${Math.round(grant_pct * 100)}% grant` : 'No grant',
    net_capex: capex_net_total,
    cod_year,
    scenario: params.scenario || 'base',
    model_version: 'v6',

    // Market context
    sd_ratio: cod_sd?.sd_ratio ?? null,
    phase: cod_sd?.phase ?? null,
    cpi_at_cod: cod_sd?.cpi ?? null,

    // Headline metrics
    project_irr: project_irr < -0.50 ? null : project_irr,
    equity_irr: equity_irr < -0.50 ? null : equity_irr,
    irr_status: project_irr < -0.50 ? 'uneconomic'
      : project_irr < 0.06 ? 'below_hurdle'
      : project_irr < 0.12 ? 'marginal'
      : 'investable',
    npv_at_wacc: Math.round(npv_project),
    npv_project: Math.round(npv_project),
    net_rev_per_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    net_mw_yr: y1 ? Math.round(y1.rev_net / mw) : 0,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null,
    min_dscr_conservative: cons_min_dscr != null ? Math.round(cons_min_dscr * 100) / 100 : null,
    bankability,
    simple_payback_years: payback,
    payback_years: payback,
    crossover_year: crossover_year || (cod_year + 25),

    // Y1 backward compat
    gross_revenue_y1: y1 ? y1.rev_gross : 0,
    net_revenue_y1: y1 ? y1.rev_net : 0,
    ebitda_y1: y1 ? y1.ebitda : 0,
    opex_y1: y1 ? y1.opex : 0,
    rtm_fees_y1: y1 ? y1.rtm_fee + y1.brp_fee : 0,
    capacity_y1: y1 ? y1.rev_cap : 0,
    activation_y1: y1 ? y1.rev_act : 0,
    arbitrage_y1: y1 ? y1.rev_trd : 0,
    capacity_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_cap / y1.rev_gross * 100) / 100 : 0,
    activation_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_act / y1.rev_gross * 100) / 100 : 0,
    arbitrage_pct: y1 && y1.rev_gross > 0 ? Math.round(y1.rev_trd / y1.rev_gross * 100) / 100 : 0,

    // Financing
    total_debt: debt_initial, total_equity: equity_initial,
    debt_initial, equity_initial, rate_allin,
    annual_debt_service: Math.round(pmt),

    // Timeseries
    years,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.rev_net, ebitda: yr.ebitda, dscr: yr.dscr } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,

    // Benchmarks
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source,
    timestamp: new Date().toISOString(),

    // Signal inputs used
    signal_inputs: {
      s1_capture, afrr_clearing, mfrr_clearing,
      afrr_cap, mfrr_cap, fcr_cap,
      euribor: Math.round(euribor * 10000) / 100,
      rate_allin_pct: Math.round(rate_allin * 10000) / 100,
    },

    // Reconciliation
    reconciliation: recon,

    // Monthly seasonal DSCR
    monthly_y1,
    worst_month_dscr,
  };
}

// ─── Revenue Engine v7 — Observed base year + derived compression + live rate ──

/**
 * reservePrice: S/D elasticity curve for reserve price decay.
 * Steeper sigmoid: knee at S/D=1.7, prices halve there, near-floor by S/D=2.5.
 * floor_fraction = 0.12 (€3.25/MW/h on €27 base — empirical from UK/DE/Nordic).
 */
function reservePrice(sd_ratio, base_price) {
  // floor_fraction = 0.06 → ~€1.5/MW/h on €24 base (UK FFR at S/D ~2.5: £1-2)
  const floor_fraction = 0.04;
  const x = sd_ratio - 1.0;
  const decay = 1 / (1 + Math.exp(5.0 * (x - 0.7)));
  return base_price * (floor_fraction + (1 - floor_fraction) * decay);
}

// Market depth: more BESS chasing same DA spreads → less capture per battery.
// Coefficient 0.15: Baltic trades on Nord Pool (400+ GW pool), not a closed national market.
// 15% haircut at S/D 2.0 matches lower end of German capture decline.
function marketDepthFactor(sd_ratio) {
  const excess = Math.max(0, sd_ratio - 0.8);
  return 1.0 / (1.0 + 0.15 * excess);
}

// Bid-acceptance multiplier on per-product capacity + activation revenue.
// Smooth exponential decay calibrated for share-weighted per-product S/D.
// Output bounded [0.50, 0.95]. The reservePrice curve already handles aggregate
// market-tightness compression; this captures the additional per-product
// effect (FCR saturates faster than mFRR because TSO procurement depth differs
// AND each product's share of fleet bid varies).
// Calibrated to KKME's market view; coefficients live in code only.
function bidAcceptanceFactor(sd_ratio, _product) {
  const HIGH = 0.95;
  const FLOOR = 0.50;
  if (sd_ratio <= 1.0) return HIGH;
  return Math.max(FLOOR, HIGH * Math.exp(-0.04 * (sd_ratio - 1)));
}

// Compression curve (cpi shape) — same formula used by processFleet at the
// aggregate-trajectory site. Extracted as a helper so per-product variants
// can re-use the same curve shape with product-specific S/D inputs.
function cpiCurve(sd_ratio) {
  if (sd_ratio < 0.6) return Math.min(1.0 + (0.6 - sd_ratio) * 2.5, 2.0);
  if (sd_ratio < 1.0) return Math.max(0.30, 1.0 - (sd_ratio - 0.6) * 1.5);
  return Math.max(0.30, 0.40 - (sd_ratio - 1.0) * 0.08);
}

/**
 * projectFleet: fleet supply projection per calendar year.
 * Uses S4 weighted_supply (confidence-weighted current fleet), applies
 * pipeline realisation rate to ADDITIONAL pipeline MW, then organic growth.
 */
function projectFleet(cal_year, kv, scenario) {
  const fleet = kv.fleet || kv.s2 || {};

  // Current competitive supply from S4 (already confidence-weighted)
  const current_weighted = fleet.baltic_weighted_mw || fleet.baltic_operational_mw || 672;

  // Additional pipeline MW (not yet built — raw, pre-realisation)
  const pipeline_raw = fleet.baltic_pipeline_mw || 866;

  // Apply pipeline realisation (dropout rate)
  const realisation = PIPELINE_REALISATION[scenario] || 0.50;
  const pipeline_effective = pipeline_raw * realisation;

  // Pipeline deploys on S-curve from 2026 (not all at once)
  // Y1 (COD 2028 = cal 2029): ~40% deployed. Y3: ~70%. Y5: ~95%.
  const deploy_start = 2026;
  const years_into = Math.max(0, cal_year - deploy_start);
  // Logistic S-curve: 30% at yr 1, 50% at yr 3, 85% at yr 5, 95% at yr 7
  const k = 0.6;
  const midpoint = 3.5;
  const deploy_fraction = Math.min(1.0, 1.0 / (1 + Math.exp(-k * (years_into - midpoint))));
  const pipeline_deployed = pipeline_effective * deploy_fraction;

  // Kruonis PSP (fixed mFRR competitor)
  const kruonis = 205;

  // Post-pipeline organic growth: 3%/yr, capped at 50% of base
  let organic = 0;
  const full_deploy_year = deploy_start + 7; // S-curve plateaus around year 7
  if (cal_year > full_deploy_year) {
    const yrs_post = cal_year - full_deploy_year;
    const base_total = current_weighted + pipeline_effective;
    organic = base_total * (Math.pow(1.03, yrs_post) - 1);
    organic = Math.min(organic, base_total * 0.5);
  }

  return current_weighted + pipeline_deployed + kruonis + organic;
}

/**
 * projectDemand: reserve demand projection per calendar year.
 * 2%/yr growth from growing renewable variability (ENTSO-E projections).
 */
function projectDemand(cal_year, kv, demand_growth = 0.02) {
  const fleet = kv.fleet || kv.s2 || {};
  const base_demand = fleet.eff_demand_mw || 752;
  const years_from_base = Math.max(0, cal_year - 2026);
  return base_demand * Math.pow(1 + demand_growth, years_from_base);
}

/**
 * computeTradingMix: price-ratio revenue mix with S/D elasticity.
 *
 * R = reserve value per MW-hour, compressed via S/D elasticity curve.
 *   Capacity follows elasticity directly; activation 15% steeper.
 * T = trading value per MW-hour × intraday uplift, grows 2%/yr (base).
 * trading_fraction = min(0.70, (T / (T + R)) × 0.75)
 *
 * One tunable: switching_friction (0.75). Everything else from signals.
 */
// Lithuania renewable share trajectory (national targets + EU mandates)
// 2025: ~50%, 2030: 70%, 2040: 95%, 2050: 100%
function renewableShareYr(cal_year) {
  if (cal_year <= 2025) return 0.50;
  if (cal_year >= 2050) return 1.00;
  if (cal_year <= 2030) return 0.50 + (0.70 - 0.50) * (cal_year - 2025) / 5;
  if (cal_year <= 2040) return 0.70 + (0.95 - 0.70) * (cal_year - 2030) / 10;
  return 0.95 + (1.00 - 0.95) * (cal_year - 2040) / 10;
}

// Spread multiplier: more renewables → more intermittency → wider DA spreads
// 1pp renewable share → 1.2pp wider spread (calibrated to Y20 trading ~65-70%)
// Baringa: post-sync Baltic will see "additional volatility" from reduced interconnection + RES
function spreadMultiplierYr(cal_year) {
  const share_baseline = 0.50; // 2025 Lithuania renewable share
  const share_yr = renewableShareYr(cal_year);
  const elasticity = 2.0;
  return 1 + (share_yr - share_baseline) * elasticity;
}

// Constant switching friction — base year already reflects market maturity.
const FRICTION_IMMATURE = 0.75;  // kept for backward compat in output
const FRICTION_MATURE = 0.75;
const MATURITY_YEARS = 0;

function switchingFriction(yr) {
  return 0.75;
}

function computeTradingMix(kv, dur_h, cal_year, scenario, sc, yr = 1) {
  const rte = 0.855;
  const trading_real = sc.trd_real || 0.85;
  const friction = switchingFriction(yr);

  const s2 = kv.s2 || {};
  const act = kv.s2_activation_parsed || {};
  const s1_cap = kv.s1_capture || {};

  // R base: per-product capacity + activation per MW-hour. Decomposed so each
  // product can carry its own forward S/D and bid-acceptance compression.
  const afrr_share = 0.40, mfrr_share = 0.60;
  const afrr_cap = s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.06;
  const mfrr_cap = s2.mfrr_cap_avg ?? s2.mfrr_up_avg ?? 19.74;
  const afrr_clearing = act.lt?.afrr_p50 ?? 171;
  const mfrr_clearing = act.lt?.mfrr_p50 ?? 81;

  const R_cap_afrr_base = afrr_share * afrr_cap;
  const R_cap_mfrr_base = mfrr_share * mfrr_cap;
  const R_act_afrr_base = afrr_share * sc.act_rate_afrr * afrr_clearing * 0.55;
  const R_act_mfrr_base = mfrr_share * sc.act_rate_mfrr * mfrr_clearing * 0.75;

  const R_cap_base = R_cap_afrr_base + R_cap_mfrr_base;
  const R_act_base = R_act_afrr_base + R_act_mfrr_base;
  const R_base = R_cap_base + R_act_base;

  // T base: market-level trading signal (same for all durations)
  // Uses rolling 30d mean (stable) rather than spot capture (volatile).
  // Fixed 4H reference cycle — the trade-vs-reserve decision is MARKET-level.
  const REFERENCE_CYCLE_H = 4;
  const s1_capture_ref = s1_cap.rolling_30d?.stats_4h?.mean
    ?? s1_cap.capture_4h?.gross_eur_mwh ?? 125;
  const T_base = s1_capture_ref * rte * trading_real / (2 * REFERENCE_CYCLE_H);

  // Aggregate S/D (kept for trading_fraction price-ratio + payload reporting)
  const supply = projectFleet(cal_year, kv, scenario);
  const demand_growth = sc.demand_growth ?? 0.02;
  const demand = projectDemand(cal_year, kv, demand_growth);
  const sd_yr = supply / demand;

  // Per-product S/D — share-weighted: each operator only bids the product's
  // RESERVE_PRODUCTS share into that product (hierarchy-driven SoC allocation),
  // not full nameplate. So sd = (fleet × share) / TSO procurement.
  // FCR exposed as diagnostic; aFRR + mFRR drive the actual R formula.
  const PRODUCT_DEMAND_FALLBACK = { fcr: 28, afrr: 120, mfrr: 604 };
  const yrs_from_2026 = Math.max(0, cal_year - 2026);
  const dem_growth_factor = Math.pow(1 + demand_growth, yrs_from_2026);
  const product_demand = (p) =>
    (kv.fleet?.product_sd?.[p]?.demand_mw ?? PRODUCT_DEMAND_FALLBACK[p]) * dem_growth_factor;
  const fcr_sd_yr  = (supply * RESERVE_PRODUCTS.fcr.share)  / product_demand('fcr');
  const afrr_sd_yr = (supply * RESERVE_PRODUCTS.afrr.share) / product_demand('afrr');
  const mfrr_sd_yr = (supply * RESERVE_PRODUCTS.mfrr.share) / product_demand('mfrr');

  // Bid-acceptance is binary at the product level: if a product's bid doesn't
  // clear, neither capacity nor activation revenue from that product is earned.
  // Mirrors the dispatch endpoint pattern at line 305 (cleared MW, not bid MW).
  const fcr_acc  = bidAcceptanceFactor(fcr_sd_yr,  'fcr');
  const afrr_acc = bidAcceptanceFactor(afrr_sd_yr, 'afrr');
  const mfrr_acc = bidAcceptanceFactor(mfrr_sd_yr, 'mfrr');

  // Compression: aggregate-sd reservePrice (preserves v7 curve calibration)
  // × per-product bid-acceptance (the v7.1 refinement — FCR saturates faster
  // than mFRR because TSO procurement depth differs by product). Activation
  // uses 1.15× steeper S/D curve as in v7.
  const R_cap_afrr_yr = reservePrice(sd_yr,        R_cap_afrr_base) * afrr_acc;
  const R_cap_mfrr_yr = reservePrice(sd_yr,        R_cap_mfrr_base) * mfrr_acc;
  const R_act_afrr_yr = reservePrice(sd_yr * 1.15, R_act_afrr_base) * afrr_acc;
  const R_act_mfrr_yr = reservePrice(sd_yr * 1.15, R_act_mfrr_base) * mfrr_acc;

  const R_cap_yr = R_cap_afrr_yr + R_cap_mfrr_yr;
  const R_act_yr = R_act_afrr_yr + R_act_mfrr_yr;
  const R_yr = R_cap_yr + R_act_yr;

  // T: grows with renewable penetration (more RES → more volatility → wider spreads)
  // Replaces r_proximity deceleration — spread growth is SUPPLY-driven, not R-driven
  const T_floor = 5.0;
  const spread_mult = spreadMultiplierYr(cal_year);
  // Scenario adjustment: conservative = no additional RES boost, stress = negative
  const scenario_spread_adj = SPREAD_GROWTH[scenario] ?? 0.02;
  const scenario_factor = Math.pow(1 + scenario_spread_adj, yrs_from_2026);
  const T_yr = Math.max(T_floor, T_base * spread_mult * scenario_factor);

  const raw = T_yr / (T_yr + R_yr);
  const tf = Math.min(0.70, raw * friction);

  return {
    trading_fraction: tf,
    reserve_fraction: 1 - tf,
    switching_friction: friction,
    R: Math.round(R_yr * 100) / 100,
    T: Math.round(T_yr * 100) / 100,
    T_raw: T_yr,
    price_ratio: R_yr > 0 ? Math.round((T_yr / R_yr) * 1000) / 1000 : 99,
    R_base: Math.round(R_base * 100) / 100,
    T_base: Math.round(T_base * 100) / 100,
    sd_ratio: Math.round(sd_yr * 100) / 100,
    supply_mw: Math.round(supply),
    demand_mw: Math.round(demand),
    spread_mult: Math.round(spread_mult * 1000) / 1000,
    renewable_share: Math.round(renewableShareYr(cal_year) * 1000) / 1000,
    // v7.1 per-product breakdown — input to per-product compression + bid acceptance.
    // FCR diagnostic-only (not in R formula; matches v7 architectural treatment).
    per_product: {
      fcr: {
        sd_ratio:       Math.round(fcr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(fcr_acc * 100) / 100,
      },
      afrr: {
        sd_ratio:       Math.round(afrr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(afrr_acc * 100) / 100,
        R_cap_yr:       Math.round(R_cap_afrr_yr * 100) / 100,
        R_act_yr:       Math.round(R_act_afrr_yr * 100) / 100,
      },
      mfrr: {
        sd_ratio:       Math.round(mfrr_sd_yr * 100) / 100,
        bid_acceptance: Math.round(mfrr_acc * 100) / 100,
        R_cap_yr:       Math.round(R_cap_mfrr_yr * 100) / 100,
        R_act_yr:       Math.round(R_act_mfrr_yr * 100) / 100,
      },
    },
  };
}

/**
 * computeEffectiveArbPct: LEGACY — kept for backtest backward compat.
 * Replaced by computeTradingMix for main revenue engine.
 */
function computeEffectiveArbPct(kv, sc) {
  const dm = kv.dispatch_metrics?.rolling_30d;
  // MW is blocked from trading during activation (energy dispatch) AND during idle-committed
  // time when SoC must be maintained for potential activation. Headroom drag captures the
  // partial block from SoC management: r = activation + 0.70 × (1 - activation).
  // With activation rates ~0.18/0.10, this gives r ≈ 0.75/0.73 → arb_pct ≈ 0.20 → ~12-15% trading.
  const HEADROOM_DRAG = 0.70;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const r_a = act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75;
  const r_m = act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80;
  const p_avail = sc.avail;
  const fcr_share  = RESERVE_PRODUCTS.fcr.share;
  const afrr_share = RESERVE_PRODUCTS.afrr.share;
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share;
  // FCR always-on. When both aFRR+mFRR active → arb gets 0.
  // When aFRR drops → afrr_share freed. When mFRR drops → mfrr_share freed.
  return (
    Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share)) * r_a * r_m +
    (p_avail * afrr_share) * r_m * (1 - r_a) +
    (p_avail * mfrr_share) * r_a * (1 - r_m) +
    (p_avail * (afrr_share + mfrr_share)) * (1 - r_a) * (1 - r_m)
  );
}

/**
 * computeEffectiveArbPctForYear: time-sliced arb for a specific projection year.
 * As balancing compresses, reserve utilisation declines → more MW-hours for arb.
 */
function computeEffectiveArbPctForYear(kv, sc, reserve_shift) {
  const dm = kv.dispatch_metrics?.rolling_30d;
  // Same headroom-drag model as computeEffectiveArbPct
  const HEADROOM_DRAG = 0.70;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const r_a_base = act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75;
  const r_m_base = act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80;
  const r_a = r_a_base * reserve_shift;
  const r_m = r_m_base * reserve_shift;
  const p_avail = sc.avail;
  const fcr_share  = RESERVE_PRODUCTS.fcr.share;
  const afrr_share = RESERVE_PRODUCTS.afrr.share;
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share;
  return (
    Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share)) * r_a * r_m +
    (p_avail * afrr_share) * r_m * (1 - r_a) +
    (p_avail * mfrr_share) * r_a * (1 - r_m) +
    (p_avail * (afrr_share + mfrr_share)) * (1 - r_a) * (1 - r_m)
  );
}

/**
 * computeBaseYear: builds trailing 12-month observed revenue from S1 monthly
 * captures (KV: s1_capture) + S2 monthly activation data (KV: s2_activation).
 *
 * Returns per-MW monthly breakdown + annual totals.
 * All values are per MW installed.
 * Time-sliced: arb only earns in ISPs where reserves aren't procured.
 */
function computeBaseYear(kv, duration_h, sc) {
  const rte = duration_h <= 2 ? 0.855 : 0.852;
  const cycles = duration_h <= 2 ? sc.cycles_2h : sc.cycles_4h;

  // ── S1 monthly captures (observed DA capture in €/MWh) ──
  const s1_capture = kv.s1_capture || {};
  const s1_monthly = s1_capture.monthly || [];

  // Take trailing 12 full months (exclude current partial month)
  const now = new Date();
  const cur_month = now.toISOString().slice(0, 7);
  const full_months = s1_monthly.filter(m => m.month < cur_month && m.days >= 15);
  const t12 = full_months.slice(-12);

  if (t12.length < 3) {
    return {
      period: 'insufficient data',
      months: [],
      annual_totals: { trading: 0, balancing: 0, gross: 0, net: 0 },
      data_coverage: { s1_months: t12.length, s2_months: 0, pct_observed: 0 },
      time_model: null,
    };
  }

  // ── Time-slicing: compute effective arb MW-hours from dispatch metrics ──
  // Headroom drag: committed-but-idle MW is partially blocked by SoC management.
  // r = activation_rate + 0.70 × (1 - activation_rate)
  const HEADROOM_DRAG = 0.70;
  const dm = kv.dispatch_metrics?.rolling_30d;
  const act_a = dm?.avg_afrr_activation_pct;
  const act_m = dm?.avg_mfrr_activation_pct;
  const reserve_hours = dm
    ? {
        afrr: act_a != null ? (act_a + HEADROOM_DRAG * (1 - act_a)) : 0.75,
        mfrr: act_m != null ? (act_m + HEADROOM_DRAG * (1 - act_m)) : 0.80,
        source: 'dispatch_observed_30d',
      }
    : { afrr: 0.75, mfrr: 0.80, source: 'assumed_default' };

  const r_a = reserve_hours.afrr;
  const r_m = reserve_hours.mfrr;
  const both_pct      = r_a * r_m;
  const only_mfrr_pct = r_m * (1 - r_a);
  const only_afrr_pct = r_a * (1 - r_m);
  const neither_pct   = (1 - r_a) * (1 - r_m);

  const fcr_share  = RESERVE_PRODUCTS.fcr.share;  // 0.16 — always-on, always reserved
  const afrr_share = RESERVE_PRODUCTS.afrr.share; // 0.34
  const mfrr_share = RESERVE_PRODUCTS.mfrr.share; // 0.50
  const p_avail = sc.avail; // 0.95

  // Available fraction of MW for arb in each time slice
  // FCR is always-on (symmetric, procured continuously), so always reserved.
  // When both aFRR+mFRR active: FCR+aFRR+mFRR = 1.00 → arb gets 0
  // When aFRR drops: FCR+mFRR = 0.66 → aFRR share (0.34) freed for arb
  // When mFRR drops: FCR+aFRR = 0.50 → mFRR share (0.50) freed for arb
  // When both drop: FCR only = 0.16 → aFRR+mFRR (0.84) freed for arb
  const arb_mw_both      = Math.max(0, p_avail * (1 - fcr_share - afrr_share - mfrr_share));
  const arb_mw_only_mfrr = p_avail * afrr_share;   // aFRR MW freed when aFRR not procured
  const arb_mw_only_afrr = p_avail * mfrr_share;   // mFRR MW freed when mFRR not procured
  const arb_mw_neither   = p_avail * (afrr_share + mfrr_share); // both freed, FCR stays

  // Weighted effective arb as fraction of total MW-hours
  const effective_arb_pct =
    arb_mw_both * both_pct +
    arb_mw_only_mfrr * only_mfrr_pct +
    arb_mw_only_afrr * only_afrr_pct +
    arb_mw_neither * neither_pct;
  // With defaults (r_a=0.80, r_m=0.90): ~0 × 0.72 + 0.323 × 0.18 + 0.475 × 0.08 + 0.95 × 0.02 ≈ 0.115

  const time_model = {
    reserve_hours_afrr: Math.round(r_a * 100) / 100,
    reserve_hours_mfrr: Math.round(r_m * 100) / 100,
    both_reserves_pct: Math.round(both_pct * 1000) / 1000,
    only_mfrr_pct: Math.round(only_mfrr_pct * 1000) / 1000,
    only_afrr_pct: Math.round(only_afrr_pct * 1000) / 1000,
    neither_pct: Math.round(neither_pct * 1000) / 1000,
    effective_arb_pct: Math.round(effective_arb_pct * 1000) / 1000,
    source: reserve_hours.source,
    note: `${Math.round(effective_arb_pct * 100)}% of MW-hours available for trading`,
  };

  // ── Price-ratio mix for Y1 (used to split monthly trading/balancing) ──
  // Base year uses current S/D (2026 calendar year) — no forward compression
  const y1_mix = computeTradingMix(kv, duration_h, 2026, 'base', sc);
  time_model.trading_fraction = y1_mix.trading_fraction;
  time_model.R_base = y1_mix.R_base;
  time_model.T_base = y1_mix.T_base;
  time_model.price_ratio = y1_mix.price_ratio;

  // ── S2 activation monthly data ──
  const act = kv.s2_activation_parsed || {};
  const lt_afrr_monthly = act.lt_monthly_afrr || {};  // { '2025-10': { avg, p50, ... }, ... }
  const lt_mfrr_monthly = act.lt_monthly_mfrr || {};

  // ── S2 capacity monthly ──
  const cap_monthly_arr = kv.capacity_monthly || [];   // [{ month, afrr_avg, mfrr_avg, fcr_avg, days }]
  const cap_by_month = {};
  for (const c of cap_monthly_arr) cap_by_month[c.month] = c;

  // Current S2 averages as fallback
  const s2 = kv.s2 || {};
  const fb_afrr_cap = s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.7;
  const fb_mfrr_cap = s2.mfrr_cap_avg ?? s2.mfrr_up_avg ?? 21.5;
  const fb_fcr_cap  = s2.fcr_cap_avg  ?? s2.fcr_avg     ?? 0.36;
  const fb_afrr_clearing = kv.s2_activation_parsed?.lt?.afrr_p50 ?? 170;
  const fb_mfrr_clearing = kv.s2_activation_parsed?.lt?.mfrr_p50 ?? 110;

  const months = [];
  let s2_months_observed = 0;

  for (const m of t12) {
    const month = m.month;
    const days = m.days || 30;

    // ── Capture for this month (used for trading value calculation) ──
    const capture = duration_h <= 2
      ? (m.avg_gross_2h || m.avg_net_2h || 140)
      : (m.avg_gross_4h || m.avg_net_4h || 125);

    // ── Balancing revenue ──
    const afrr_act_m = lt_afrr_monthly[month];
    const mfrr_act_m = lt_mfrr_monthly[month];
    const cap_m = cap_by_month[month];
    const has_s2 = !!(afrr_act_m || mfrr_act_m || cap_m);
    if (has_s2) s2_months_observed++;

    // Capacity prices (€/MW/h)
    const afrr_cap_h = cap_m?.afrr_avg ?? fb_afrr_cap;
    const mfrr_cap_h = cap_m?.mfrr_avg ?? fb_mfrr_cap;
    const fcr_cap_h  = cap_m?.fcr_avg  ?? fb_fcr_cap;

    // Activation clearing (€/MWh) — use p50
    const afrr_clearing = afrr_act_m?.p50 ?? fb_afrr_clearing;
    const mfrr_clearing = mfrr_act_m?.p50 ?? fb_mfrr_clearing;

    // Activation dispatch rates — use SCENARIO rates, not raw BTD activation rates.
    // BTD activation_rate (0.85) = fraction of ISPs with TSO call — NOT BESS dispatch revenue rate.
    // Scenario rates (0.18 aFRR, 0.10 mFRR) = modelled BESS energy dispatch fraction.
    const afrr_rate = sc.act_rate_afrr;
    const mfrr_rate = sc.act_rate_mfrr;

    const hours = days * 24;

    // Per MW installed: 0.5 MW allocated per product × share
    // Same stacking logic as v6 RESERVE_PRODUCTS
    const rev_cap = (
      RESERVE_PRODUCTS.fcr.share  * sc.avail * fcr_cap_h +
      RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_cap_h +
      RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_cap_h
    ) * hours;

    const rev_act = (
      RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_rate * afrr_clearing * 0.55 +
      RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_rate * mfrr_clearing * 0.75
    ) * hours;

    const bal_monthly = (rev_cap + rev_act) * sc.bal_mult * sc.real_factor;

    // ── Trading: capture × RTE × realisation × dur_h × cycles × fraction × days ──
    // Scales with MWh per cycle (dur_h × cycles), not as ratio of balancing
    const trd_monthly = capture * rte * (sc.trd_real || 0.85) * duration_h * cycles
                      * y1_mix.trading_fraction * days;

    // ── Gross / Net ──
    const gross = trd_monthly + bal_monthly;
    const rtm_fee = gross * sc.rtm_fee_pct;
    const brp_fee = sc.brp_fee_yr / 12;  // per MW per month (brp_fee_yr is for 50MW fleet, so /50 later)
    const net = gross - rtm_fee - brp_fee / 50;  // brp_fee is fleet-level

    months.push({
      month,
      trading: Math.round(trd_monthly),
      balancing: Math.round(bal_monthly),
      gross: Math.round(gross),
      net: Math.round(net),
      capture: Math.round(capture * 10) / 10,
      days,
      source: has_s2 ? 'observed+observed' : 'observed+proxy',
    });
  }

  // ── Annualise: if <12 months, scale up proportionally ──
  const total_days = months.reduce((s, m) => s + m.days, 0);
  const scale = total_days > 0 ? 365 / total_days : 1;

  const annual = {
    trading:  Math.round(months.reduce((s, m) => s + m.trading, 0) * scale),
    balancing: Math.round(months.reduce((s, m) => s + m.balancing, 0) * scale),
    gross:    Math.round(months.reduce((s, m) => s + m.gross, 0) * scale),
    net:      Math.round(months.reduce((s, m) => s + m.net, 0) * scale),
  };

  return {
    period: t12.length >= 2
      ? `${t12[0].month} to ${t12[t12.length - 1].month}`
      : 'insufficient data',
    months,
    annual_totals: annual,
    trading_realisation: sc.trd_real,
    trading_realisation_source: 'assumed_industry_range_070_090',
    time_model,
    data_coverage: {
      s1_months: t12.length,
      s2_months: s2_months_observed,
      total_days,
      pct_observed: Math.round((s2_months_observed / Math.max(t12.length, 1)) * 100),
    },
  };
}

/**
 * deriveCompression: extract annual compression rate from S2 observed
 * activation price trajectory (aFRR p50 series).
 *
 * The series 738 → 514 → 306 → 159 → 174 → 171 covers 2025-10 to 2026-03.
 * We use the full window to capture the structural compression,
 * then use recent 3-month for current-pace estimate.
 */
function deriveCompression(kv) {
  // Primary: S2 activation compression trajectory
  const act = kv.s2_activation_parsed || {};
  const compression = act.compression || {};
  const p50_series = compression.afrr_lt_p50 || [];
  const comp_months = compression.months || [];

  if (p50_series.length >= 4) {
    // Use first 4 months (rapid initial compression) vs last 3 (stabilisation)
    const initial = p50_series[0];
    const recent_3 = p50_series.slice(-3);
    const recent_avg = recent_3.reduce((s, v) => s + v, 0) / recent_3.length;

    // Total compression over the observation window
    const months_span = p50_series.length - 1;
    const total_compression = 1 - (recent_avg / initial);

    // Annualised: compound monthly rate → annual
    const monthly_rate = 1 - Math.pow(recent_avg / initial, 1 / months_span);
    const annual_rate_raw = 1 - Math.pow(1 - monthly_rate, 12);

    // But the initial spike (738→159) was post-sync anomaly normalisation,
    // not steady-state compression. For forward projection, use the recent
    // 3-month trend which shows stabilisation (159→174→171).
    let forward_rate;
    if (recent_3.length >= 3) {
      const r_first = recent_3[0];
      const r_last = recent_3[recent_3.length - 1];
      const r_span = recent_3.length - 1;
      if (r_first > 0 && r_last > 0) {
        const r_monthly = 1 - Math.pow(r_last / r_first, 1 / r_span);
        forward_rate = Math.max(0, 1 - Math.pow(1 - r_monthly, 12));
      }
    }
    // If recent trend is flat/slightly negative, use minimum structural compression
    if (forward_rate == null || forward_rate < 0.01) forward_rate = 0.03;

    return {
      rate: Math.max(0.01, Math.min(0.15, forward_rate)),
      rate_full_window: Math.round(annual_rate_raw * 1000) / 1000,
      source: 'derived_from_s2_activation',
      data_points: p50_series.length,
      window: comp_months.length >= 2 ? `${comp_months[0]} to ${comp_months[comp_months.length - 1]}` : null,
      initial_p50: initial,
      recent_avg_p50: Math.round(recent_avg * 10) / 10,
      note: 'Forward rate from recent 3m trend; full-window rate includes post-sync normalisation',
    };
  }

  // Fallback: fleet trajectory S/D growth → implied compression
  const trajectory = kv.fleet?.trajectory || kv.s2?.trajectory || [];
  if (trajectory.length >= 2) {
    const sd_0 = trajectory[0]?.sd_ratio || 1.16;
    const sd_n = trajectory[trajectory.length - 1]?.sd_ratio || 1.9;
    const yrs = trajectory.length - 1;
    const implied = Math.pow(sd_n / sd_0, 1 / yrs) - 1;
    return {
      rate: Math.max(0.02, Math.min(0.10, implied * 0.7)),
      source: 'derived_from_fleet_trajectory',
      data_points: trajectory.length,
    };
  }

  return { rate: 0.05, source: 'assumed_default', data_points: 0 };
}

/**
 * computeLiveRate: today's revenue run-rate vs base year average.
 * Returns per-MW daily values.
 */
function computeLiveRate(kv, base_year, duration_h, sc) {
  const s1 = kv.s1 || {};
  const s2 = kv.s2 || {};
  const act = kv.s2_activation_parsed || {};
  const rte = duration_h <= 2 ? 0.855 : 0.852;
  const cycles = duration_h <= 2 ? sc.cycles_2h : sc.cycles_4h;

  // Today's capture from S1 (use the capture endpoint data first, then spread-based)
  const s1_cap = kv.s1_capture || {};
  const capture = duration_h <= 2
    ? (s1_cap.capture_2h?.gross_eur_mwh || s1?.capture_2h_gross || s1?.gross_2h
       || (s1.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 * 1.12 : 140))
    : (s1_cap.capture_4h?.gross_eur_mwh || s1?.capture_4h_gross || s1?.gross_4h
       || (s1.spread_eur_mwh != null ? s1.spread_eur_mwh * 1.5 : 125));

  // Price-ratio mix: today's trading = balancing × (tf / (1 - tf))
  // Compute balancing first, then derive trading from the Y1 price-ratio

  // Today's balancing from S2
  const afrr_cap = s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.7;
  const mfrr_cap = s2.mfrr_cap_avg ?? s2.mfrr_up_avg ?? 21.5;
  const fcr_cap  = s2.fcr_cap_avg  ?? s2.fcr_avg     ?? 0.36;
  const afrr_clearing = act.lt?.afrr_p50 ?? 170;
  const mfrr_clearing = act.lt?.mfrr_p50 ?? 110;

  const today_balancing = (
    RESERVE_PRODUCTS.fcr.share  * sc.avail * fcr_cap +
    RESERVE_PRODUCTS.afrr.share * sc.avail * afrr_cap +
    RESERVE_PRODUCTS.mfrr.share * sc.avail * mfrr_cap +
    RESERVE_PRODUCTS.afrr.share * sc.avail * sc.act_rate_afrr * afrr_clearing * 0.55 +
    RESERVE_PRODUCTS.mfrr.share * sc.avail * sc.act_rate_mfrr * mfrr_clearing * 0.75
  ) * 24 * sc.bal_mult * sc.real_factor;

  // Trading: capture × RTE × realisation × dur_h × cycles × fraction (per MW per day)
  const lr_mix = base_year?.time_model?.trading_fraction != null
    ? { trading_fraction: base_year.time_model.trading_fraction }
    : computeTradingMix(kv, duration_h, 2026, 'base', sc);
  const trading_real = sc.trd_real || 0.85;
  const today_trading = capture * rte * trading_real * duration_h * cycles * lr_mix.trading_fraction;

  const today_total = today_trading + today_balancing;
  const base_daily = base_year?.annual_totals?.gross > 0
    ? base_year.annual_totals.gross / 365
    : today_total;  // if no base year, delta = 0%
  const delta_pct = base_daily > 0
    ? Math.round(((today_total / base_daily) - 1) * 100)
    : 0;

  return {
    today_trading_daily: Math.round(today_trading),
    today_balancing_daily: Math.round(today_balancing),
    today_total_daily: Math.round(today_total),
    base_daily: Math.round(base_daily),
    delta_pct,
    annualised: Math.round(today_total * 365),
    capture_used: Math.round(capture * 10) / 10,
    as_of: s1.updated_at || new Date().toISOString(),
  };
}

// ─── Revenue Engine v4 (legacy — kept for reference) ──────────────────────────

function computeRevenue_legacy(systemKey, capexKey, grantKey, codYear, kv, mwParam, mwhParam) {
  const SYSTEMS = {
    '2h':   { mw: 50, mwh: 100, duration: 2.0, label: '50 MW / 100 MWh (2H)' },
    '2.4h': { mw: 50, mwh: 120, duration: 2.4, label: '50 MW / 120 MWh (2.4H)' },
    '4h':   { mw: 50, mwh: 200, duration: 4.0, label: '50 MW / 200 MWh (4H)' },
  };
  const CAPEX_S = {
    low:  { eur_kwh: 120, label: '€120/kWh (competitive)' },
    mid:  { eur_kwh: 164, label: 'CH Equipment (€164/kWh)' },
    high: { eur_kwh: 262, label: 'CH Turnkey (€262/kWh)' },
  };
  const GRANTS = {
    none:    { pct: 0,    label: 'No grant' },
    partial: { pct: 0.10, label: '10% grant' },
    full:    { pct: 0.30, label: '30% APVA grant' },
  };

  const sys      = SYSTEMS[systemKey]  || SYSTEMS['2.4h'];
  const capex_sc = CAPEX_S[capexKey]   || CAPEX_S['mid'];
  const grant_sc = GRANTS[grantKey]    || GRANTS['none'];
  const cod      = parseInt(codYear)   || 2028;
  const mw       = mwParam  || sys.mw;
  const mwh      = mwhParam || sys.mwh;
  const fcr_alloc  = Math.round(mw * 0.16);
  const afrr_alloc = Math.round(mw * 0.34);
  const alloc = { fcr: fcr_alloc, afrr: afrr_alloc, mfrr: mw - fcr_alloc - afrr_alloc };

  const fleet = kv?.fleet;
  const s2    = kv?.s2;
  const s1    = kv?.s1;

  // Live prices from BTD (s2 KV)
  const prices = {
    fcr:  { price: s2?.fcr_avg      ?? 45, avail: 0.92 },
    afrr: { price: s2?.afrr_up_avg  ?? 40, avail: 0.85 },
    mfrr: { price: s2?.mfrr_up_avg  ?? 22, avail: 0.80 },
  };
  const prices_source = s2?.fcr_avg != null ? 'BTD measured' : 'proxy';

  const ACT = {
    afrr: { rate: 0.18, depth: 0.55, margin: 40 },
    mfrr: { rate: 0.10, depth: 0.75, margin: 55 },
  };

  const p_high       = s1?.p_high_avg || 120;
  const p_low        = s1?.p_low_avg  || 55;
  const rte          = 0.87;
  const reserve_drag = 0.60;
  const cycles_day   = 0.9;
  const op_days      = 300;

  const gross_capex  = capex_sc.eur_kwh * mwh * 1000;
  const grant_amount = Math.round(gross_capex * (grant_sc.pct || 0));
  const net_capex    = gross_capex - grant_amount;
  const bond         = 2500000;

  const debt_pct     = 0.55;
  const interest_r   = 0.045;
  const tenor        = 8;
  const grace        = 1;
  const total_debt   = Math.round(net_capex * debt_pct);
  const total_equity = net_capex - total_debt;
  const annual_prin  = Math.round(total_debt / tenor);

  const tax_rate    = 0.17;
  const depr_years  = 10;
  const depr_base   = gross_capex - bond;
  const annual_depr = depr_base / depr_years;
  const aug_capex   = mwh * 25 * 1000;
  const aug_year    = 10;
  const aug_depr    = aug_capex / depr_years;

  const opex_y1  = mw * 39000;
  const opex_esc = 0.025;

  function getCPI(year) {
    if (fleet?.trajectory && Array.isArray(fleet.trajectory)) {
      const t = fleet.trajectory.find(p => p.year === year);
      if (t?.cpi != null) return t.cpi;
    }
    const y = year - cod;
    const r = (fleet?.sd_ratio ?? 0.83) + Math.max(y, 0) * 0.15;
    if (r < 0.6) return Math.min(1.0 + (0.6 - r) * 2.5, 2.0);
    if (r < 1.0) return Math.max(0.40, 1.0 - (r - 0.6) * 1.5);
    return Math.max(0.40, 0.40 - (r - 1.0) * 0.05);
  }

  const project_cf = [-net_capex];
  const equity_cf  = [-total_equity];
  const years      = [];
  let debt_balance  = total_debt;
  let cum_equity    = -total_equity;
  let payback_year  = null;

  for (let y = 1; y <= 20; y++) {
    const cal_year = cod + y - 1;
    const cpi      = getCPI(cal_year);
    const deg_y    = y <= aug_year ? y - 1 : y - aug_year - 1;
    const eff_mwh  = mwh * Math.pow(0.975, deg_y);

    const fcr_rev  = alloc.fcr  * prices.fcr.price  * 8760 * prices.fcr.avail  * cpi;
    const afrr_rev = alloc.afrr * prices.afrr.price * 8760 * prices.afrr.avail * cpi;
    const mfrr_rev = alloc.mfrr * prices.mfrr.price * 8760 * prices.mfrr.avail * cpi;
    const cap_total = fcr_rev + afrr_rev + mfrr_rev;

    const afrr_act = alloc.afrr * ACT.afrr.rate * ACT.afrr.depth * 8760 * ACT.afrr.margin * cpi;
    const mfrr_act = alloc.mfrr * ACT.mfrr.rate * ACT.mfrr.depth * 8760 * ACT.mfrr.margin * cpi;
    const act_total = afrr_act + mfrr_act;

    const spread_decay  = Math.pow(0.98, y - 1);
    const capture       = (p_high - p_low / rte) * spread_decay;
    const mwh_per_cycle = eff_mwh * reserve_drag;
    const arb_rev       = mwh_per_cycle * cycles_day * op_days * Math.max(0, capture);

    const gross   = cap_total + act_total + arb_rev;
    const opt_fee = gross * 0.10;
    const brp_fee = 180000 * Math.pow(1.025, y - 1);
    const net_rev = gross - opt_fee - brp_fee;

    const opex    = opex_y1 * Math.pow(1 + opex_esc, y - 1);
    const ebitda  = net_rev - opex;

    let depr = 0;
    if (y <= depr_years) depr += annual_depr;
    if (y > aug_year && y <= aug_year + depr_years) depr += aug_depr;

    let interest = 0, principal = 0;
    if (debt_balance > 0) {
      interest = debt_balance * interest_r;
      if (y > grace) { principal = Math.min(annual_prin, debt_balance); debt_balance = Math.max(0, debt_balance - principal); }
    }
    const debt_service = interest + principal;

    const tax_unlevered = Math.max(0, (ebitda - depr) * tax_rate);
    const tax_levered   = Math.max(0, (ebitda - depr - interest) * tax_rate);
    const aug           = (y === aug_year) ? aug_capex : 0;

    const proj_fcf = ebitda - tax_unlevered - aug;
    const eq_fcf   = ebitda - tax_levered - debt_service - aug;
    const dscr     = debt_service > 0 ? (ebitda - tax_unlevered) / debt_service : null;

    cum_equity += eq_fcf;
    if (payback_year === null && cum_equity > 0) payback_year = y;

    project_cf.push(proj_fcf);
    equity_cf.push(eq_fcf);
    years.push({
      year: y, cal_year, cpi: Math.round(cpi * 100) / 100,
      gross: Math.round(gross), net_rev: Math.round(net_rev),
      opex: Math.round(opex), ebitda: Math.round(ebitda),
      cap_total: Math.round(cap_total), act_total: Math.round(act_total), arb_rev: Math.round(arb_rev),
      opt_fee: Math.round(opt_fee), brp_fee: Math.round(brp_fee),
      interest: Math.round(interest), principal: Math.round(principal), debt_service: Math.round(debt_service),
      tax_unlevered: Math.round(tax_unlevered), proj_fcf: Math.round(proj_fcf), eq_fcf: Math.round(eq_fcf),
      dscr: dscr != null ? Math.round(dscr * 100) / 100 : null, cum_equity: Math.round(cum_equity),
    });
  }

  function calcIRR(cf) {
    let lo = -0.5, hi = 2.0;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const npv = cf.reduce((s, c, t) => s + c / Math.pow(1 + mid, t), 0);
      if (npv > 0) lo = mid; else hi = mid;
    }
    return Math.round((lo + hi) / 2 * 10000) / 10000;
  }

  const project_irr = calcIRR(project_cf);
  const equity_irr  = calcIRR(equity_cf);
  const npv         = Math.round(project_cf.reduce((s, c, t) => s + c / Math.pow(1.08, t), 0));

  const dscr_vals = years.filter(y => y.dscr != null).map(y => y.dscr);
  const min_dscr  = dscr_vals.length ? Math.min(...dscr_vals) : null;
  const bankability = (min_dscr != null && min_dscr >= 1.20) ? 'PASS' : 'FAIL';

  const y1     = years[0];
  const cod_sd = fleet?.trajectory?.find ? fleet.trajectory.find(t => t.year === cod) : null;

  return {
    system: sys.label, duration: sys.duration,
    capex_scenario: capex_sc.label, capex_eur_kwh: capex_sc.eur_kwh,
    gross_capex, grant_amount, grant_label: grant_sc.label, net_capex,
    total_debt, total_equity, cod_year: cod,
    sd_ratio: cod_sd?.sd_ratio ?? null, phase: cod_sd?.phase ?? null, cpi_at_cod: cod_sd?.cpi ?? null,
    gross_revenue_y1: y1.gross, net_revenue_y1: y1.net_rev,
    net_mw_yr: Math.round(y1.net_rev / mw),
    ebitda_y1: y1.ebitda, opex_y1: y1.opex,
    rtm_fees_y1: y1.opt_fee + y1.brp_fee,
    capacity_y1: y1.cap_total, activation_y1: y1.act_total, arbitrage_y1: y1.arb_rev,
    capacity_pct: y1.gross > 0 ? Math.round(y1.cap_total / y1.gross * 100) / 100 : 0,
    activation_pct: y1.gross > 0 ? Math.round(y1.act_total / y1.gross * 100) / 100 : 0,
    arbitrage_pct: y1.gross > 0 ? Math.round(y1.arb_rev / y1.gross * 100) / 100 : 0,
    project_irr, equity_irr, npv_at_wacc: npv,
    min_dscr: min_dscr != null ? Math.round(min_dscr * 100) / 100 : null, bankability,
    simple_payback_years: payback_year,
    trajectory: [1, 3, 5, 10, 15, 20].map(y => {
      const yr = years[y - 1];
      return yr ? { year: y, cal_year: yr.cal_year, net_rev: yr.net_rev, ebitda: yr.ebitda, dscr: yr.dscr, cpi: yr.cpi } : null;
    }).filter(Boolean),
    fleet_trajectory: fleet?.trajectory ?? null,
    ch_benchmark: { irr_2h: 0.166, range: '6–31%', target: 0.12, source: 'Clean Horizon S1 2025' },
    prices_source, model_version: 'v4',
    timestamp: new Date().toISOString(),
    // Backward compat
    irr_2h: systemKey === '2h'  ? project_irr : null,
    irr_4h: systemKey === '4h'  ? project_irr : null,
    net_mw_yr_2h: systemKey === '2h' ? Math.round(y1.net_rev / mw) : null,
    net_mw_yr_4h: systemKey === '4h' ? Math.round(y1.net_rev / mw) : null,
  };
}

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

// ─── S1 Capture — DA gross capture via energy-charts.info ───────────────────

const ENERGY_CHARTS_API = 'https://api.energy-charts.info/price';

/**
 * Fetch LT DA prices from energy-charts.info for a date range.
 * Returns parallel arrays of unix_seconds and prices.
 * Handles both 15-min (recent) and hourly (historical) resolution.
 */
async function fetchEnergyCharts(startDate, endDate) {
  const end = endDate || startDate;
  const url = `${ENERGY_CHARTS_API}?bzn=LT&start=${startDate}T00:00Z&end=${end}T23:59Z`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`energy-charts HTTP ${res.status}`);
  const json = await res.json();
  if (!json.price || !json.unix_seconds || !json.price.length) {
    throw new Error('energy-charts: empty price data');
  }

  // Detect resolution from timestamp gaps
  const gap = json.unix_seconds.length > 1
    ? json.unix_seconds[1] - json.unix_seconds[0]
    : 3600;
  const resolutionMin = Math.round(gap / 60);

  return {
    prices: json.price,
    timestamps: json.unix_seconds,
    resolution: resolutionMin, // 15 or 60
  };
}

/**
 * Split multi-day price arrays into per-day arrays.
 * Returns Map<dateStr, { prices: number[], timestamps: number[], resolution: number }>
 */
function splitByDay(prices, timestamps, resolution) {
  const days = new Map();
  for (let i = 0; i < prices.length; i++) {
    const d = new Date(timestamps[i] * 1000);
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, { prices: [], timestamps: [], resolution });
    days.get(key).prices.push(prices[i]);
    days.get(key).timestamps.push(timestamps[i]);
  }
  return days;
}

/**
 * Perfect-foresight sort-and-dispatch capture for a single day.
 * durationHours: 2 or 4 (storage duration).
 * resolutionMin: 15 or 60 (data granularity).
 * Returns gross/net capture in €/MWh and supporting metrics.
 */
function computeDayCapture(prices, durationHours, resolutionMin = 60) {
  const intervalsPerHour = 60 / resolutionMin;
  const n = Math.round(durationHours * intervalsPerHour);

  // Need at least 2×n intervals (charge + discharge windows must not overlap)
  if (prices.length < n * 2) return null;

  // Filter out negative/zero prices for discharge, but keep all for sort
  const indexed = prices.map((p, i) => ({ price: p, idx: i }));
  const sorted = [...indexed].sort((a, b) => a.price - b.price);

  const chargeSlots = sorted.slice(0, n);
  const dischargeSlots = sorted.slice(-n);

  const avgCharge = chargeSlots.reduce((s, e) => s + e.price, 0) / n;
  const avgDischarge = dischargeSlots.reduce((s, e) => s + e.price, 0) / n;

  // RTE: 87.5% for 2h (lower aux losses), 87% for 4h
  const rte = durationHours <= 2 ? 0.875 : 0.87;

  const grossCapture = avgDischarge - avgCharge;
  // Net: discharge revenue minus charge cost adjusted for RTE losses
  const netCapture = avgDischarge - (avgCharge / rte);

  return {
    gross_eur_mwh: Math.round(grossCapture * 100) / 100,
    net_eur_mwh: Math.round(netCapture * 100) / 100,
    avg_charge: Math.round(avgCharge * 100) / 100,
    avg_discharge: Math.round(avgDischarge * 100) / 100,
    rte,
    n_intervals: n,
  };
}

/**
 * Price shape metrics for a single day.
 * Identifies peak/trough hours, solar trough, evening premium.
 */
function priceShapeMetrics(prices, timestamps, resolutionMin = 60) {
  if (!prices.length) return null;

  const intervalsPerHour = 60 / resolutionMin;

  // Aggregate to hourly averages
  const hourBuckets = {};
  for (let i = 0; i < prices.length; i++) {
    const h = Math.floor(i / intervalsPerHour);
    if (!hourBuckets[h]) hourBuckets[h] = [];
    hourBuckets[h].push(prices[i]);
  }

  const hourlyAvg = [];
  const hours = Object.keys(hourBuckets).map(Number).sort((a, b) => a - b);
  for (const h of hours) {
    const arr = hourBuckets[h];
    hourlyAvg.push(Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100);
  }

  const peakIdx = hourlyAvg.indexOf(Math.max(...hourlyAvg));
  const troughIdx = hourlyAvg.indexOf(Math.min(...hourlyAvg));

  const dailyAvg = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
  const swing = Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100;

  // Solar trough: avg hours 10-14 vs daily avg
  const solarHours = hours.filter(h => h >= 10 && h <= 14);
  let solarTroughDepth = null;
  if (solarHours.length) {
    const solarAvg = solarHours.reduce((s, h) => s + hourlyAvg[h], 0) / solarHours.length;
    solarTroughDepth = Math.round((solarAvg - dailyAvg) * 100) / 100;
  }

  // Evening premium: avg(17-21) minus avg(10-14)
  const eveningHours = hours.filter(h => h >= 17 && h <= 21);
  let eveningPremium = null;
  if (eveningHours.length && solarHours.length) {
    const eAvg = eveningHours.reduce((s, h) => s + hourlyAvg[h], 0) / eveningHours.length;
    const sAvg = solarHours.reduce((s, h) => s + hourlyAvg[h], 0) / solarHours.length;
    eveningPremium = Math.round((eAvg - sAvg) * 100) / 100;
  }

  return {
    peak_hour: hours[peakIdx],
    trough_hour: hours[troughIdx],
    peak_price: hourlyAvg[peakIdx],
    trough_price: hourlyAvg[troughIdx],
    daily_avg: dailyAvg,
    swing,
    solar_trough_depth: solarTroughDepth,
    evening_premium: eveningPremium,
    hourly_profile: hourlyAvg,
  };
}

/**
 * Rolling statistics over an array of daily capture values.
 */
function captureRollingStats(entries, field) {
  const vals = entries.map(e => e[field]).filter(v => v != null).sort((a, b) => a - b);
  if (!vals.length) return null;
  const p = (pct) => vals[Math.min(Math.floor(vals.length * pct), vals.length - 1)];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    mean: Math.round(mean * 100) / 100,
    p25: Math.round(p(0.25) * 100) / 100,
    p50: Math.round(p(0.50) * 100) / 100,
    p75: Math.round(p(0.75) * 100) / 100,
    p90: Math.round(p(0.90) * 100) / 100,
    days: vals.length,
  };
}

/**
 * Main capture orchestrator. Fetches today's LT DA prices from energy-charts.info,
 * computes 2h and 4h capture, updates rolling history, stores to KV.
 */
async function computeCapture(env) {
  const today = new Date().toISOString().slice(0, 10);

  const { prices, timestamps, resolution } = await fetchEnergyCharts(today);

  const capture_2h = computeDayCapture(prices, 2, resolution);
  const capture_4h = computeDayCapture(prices, 4, resolution);
  const shape = priceShapeMetrics(prices, timestamps, resolution);

  // Load existing capture history
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get('s1_capture_history');
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }

  // Deduplicate today
  history = history.filter(e => e.date !== today);
  history.push({
    date: today,
    gross_2h: capture_2h?.gross_eur_mwh ?? null,
    gross_4h: capture_4h?.gross_eur_mwh ?? null,
    net_2h: capture_2h?.net_eur_mwh ?? null,
    net_4h: capture_4h?.net_eur_mwh ?? null,
    avg_charge_2h: capture_2h?.avg_charge ?? null,
    avg_discharge_2h: capture_2h?.avg_discharge ?? null,
    avg_charge_4h: capture_4h?.avg_charge ?? null,
    avg_discharge_4h: capture_4h?.avg_discharge ?? null,
    swing: shape?.swing ?? null,
    daily_avg: shape?.daily_avg ?? null,
    resolution,
    n_prices: prices.length,
  });

  // Keep last 400 days (for monthly aggregation depth)
  if (history.length > 400) history = history.slice(-400);

  // Rolling stats — last 30 days
  const recent30 = history.slice(-30);
  const stats_2h = captureRollingStats(recent30, 'gross_2h');
  const stats_4h = captureRollingStats(recent30, 'gross_4h');

  // Monthly aggregation
  const monthMap = {};
  for (const entry of history) {
    const ym = entry.date.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { g2h: [], g4h: [], n2h: [], n4h: [] };
    if (entry.gross_2h != null) monthMap[ym].g2h.push(entry.gross_2h);
    if (entry.gross_4h != null) monthMap[ym].g4h.push(entry.gross_4h);
    if (entry.net_2h != null) monthMap[ym].n2h.push(entry.net_2h);
    if (entry.net_4h != null) monthMap[ym].n4h.push(entry.net_4h);
  }
  const monthly = Object.entries(monthMap)
    .map(([month, d]) => ({
      month,
      avg_gross_2h: d.g2h.length ? Math.round(d.g2h.reduce((a, b) => a + b, 0) / d.g2h.length * 100) / 100 : null,
      avg_gross_4h: d.g4h.length ? Math.round(d.g4h.reduce((a, b) => a + b, 0) / d.g4h.length * 100) / 100 : null,
      avg_net_2h: d.n2h.length ? Math.round(d.n2h.reduce((a, b) => a + b, 0) / d.n2h.length * 100) / 100 : null,
      avg_net_4h: d.n4h.length ? Math.round(d.n4h.reduce((a, b) => a + b, 0) / d.n4h.length * 100) / 100 : null,
      days: Math.max(d.g2h.length, d.g4h.length),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Gross-to-net bridge lines
  const grossToNet = [];
  if (capture_2h) {
    grossToNet.push(
      { label: 'Gross spread (2h)', value: capture_2h.gross_eur_mwh, type: 'base' },
      { label: 'RTE loss (12.5%)', value: -Math.round((capture_2h.avg_charge / capture_2h.rte - capture_2h.avg_charge) * 100) / 100, type: 'deduction' },
      { label: 'Net capture (2h)', value: capture_2h.net_eur_mwh, type: 'result' },
    );
  }

  const captureData = {
    date: today,
    // Flat top-level for convenience (matches /read merged shape)
    gross_2h: capture_2h?.gross_eur_mwh ?? null,
    gross_4h: capture_4h?.gross_eur_mwh ?? null,
    net_2h:   capture_2h?.net_eur_mwh   ?? null,
    net_4h:   capture_4h?.net_eur_mwh   ?? null,
    // Nested originals (unchanged — existing consumers depend on these)
    capture_2h,
    capture_4h,
    shape,
    rolling_30d: { stats_2h, stats_4h },
    monthly,
    gross_to_net: grossToNet,
    history: history.slice(-30), // last 30 days for charts
    source: 'energy-charts.info (Fraunhofer ISE)',
    data_class: 'derived',
    resolution: `${resolution}min`,
    updated_at: new Date().toISOString(),
  };

  await env.KKME_SIGNALS.put('s1_capture', JSON.stringify(captureData));
  await env.KKME_SIGNALS.put('s1_capture_history', JSON.stringify(history));

  // Detect extreme DA price events
  if (prices.length >= 12) {
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceSpread = maxPrice - minPrice;
    if (priceSpread > 200 || maxPrice > 500 || minPrice < -50) {
      const extremeEvent = {
        type: 'da_spread',
        date: today,
        max_price: Math.round(maxPrice),
        min_price: Math.round(minPrice),
        spread: Math.round(priceSpread),
        timestamp: new Date().toISOString(),
        text: `DA spread €${Math.round(priceSpread)}/MWh (peak €${Math.round(maxPrice)}, low €${Math.round(minPrice)})`,
      };
      // Expire at midnight UTC — extreme events are today's news only
      const midnightMs = new Date().setUTCHours(23, 59, 59, 999) - Date.now();
      const extremeTtl = Math.max(60, Math.floor(midnightMs / 1000));
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(extremeEvent), { expirationTtl: extremeTtl });
      console.log(`[S1/extreme] ${extremeEvent.text}`);
    }
  }

  console.log(`[S1/capture] ${today} 2h=${capture_2h?.gross_eur_mwh ?? '—'}€ 4h=${capture_4h?.gross_eur_mwh ?? '—'}€ swing=${shape?.swing ?? '—'}€ resolution=${resolution}min n=${prices.length}`);

  return captureData;
}

async function computeS1(env) {
  const apiKey = env.ENTSOE_API_KEY;
  if (!apiKey) throw new Error('ENTSOE_API_KEY secret not set');

  // Fetch today, tomorrow (best-effort), and historical in parallel
  const [[ltXml, se4Xml, plXml], historical, ltTomorrow, se4Tomorrow] = await Promise.all([
    Promise.all([fetchBzn(LT_BZN, apiKey), fetchBzn(SE4_BZN, apiKey), fetchBzn(PL_BZN, apiKey).catch(() => '')]),
    computeHistorical(apiKey),
    fetchBznRange(LT_BZN,  apiKey, 1, 2),  // null before ~13:00 CET publication
    fetchBznRange(SE4_BZN, apiKey, 1, 2),
  ]);

  const ltPrices  = extractPrices(ltXml);
  const se4Prices = extractPrices(se4Xml);
  const plPrices  = extractPrices(plXml ?? '');

  if (!ltPrices.length || !se4Prices.length) {
    throw new Error(`No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h`);
  }

  const ltAvg  = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;

  // BUG 2 FIX: guard against near-zero or negative SE4 (explodes % when SE4 < €10)
  const separationPct = (spread / Math.max(Math.abs(se4Avg), 10)) * 100;

  // Poland spread (best-effort — may be null if ENTSO-E times out)
  let pl_avg = null;
  let lt_pl_spread_eur = null;
  let lt_pl_spread_pct = null;
  if (plPrices.length) {
    pl_avg           = Math.round(avg(plPrices) * 100) / 100;
    lt_pl_spread_eur = Math.round((ltAvg - pl_avg) * 100) / 100;
    lt_pl_spread_pct = Math.round((lt_pl_spread_eur / Math.max(Math.abs(pl_avg), 10)) * 1000) / 10;
    console.log(`[S1/PL] pl_avg=${pl_avg} lt_pl_spread=${lt_pl_spread_eur}€/MWh (${lt_pl_spread_pct}%)`);
  } else {
    console.log('[S1/PL] no data — PL fetch failed or empty');
  }

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

  // BESS intraday capture: top-4h sell vs bottom-4h buy (revenue model arbitrage input)
  let p_high_avg = null, p_low_avg = null, intraday_capture = null, bess_net_capture = null;
  if (ltPrices.length >= 24) {
    const sorted = [...ltPrices].sort((a, b) => a - b);
    const bottom4 = sorted.slice(0, 4);
    const top4    = sorted.slice(-4);
    p_low_avg        = Math.round(bottom4.reduce((a, b) => a + b, 0) / 4 * 10) / 10;
    p_high_avg       = Math.round(top4.reduce((a, b) => a + b, 0) / 4 * 10) / 10;
    intraday_capture = Math.round((p_high_avg - p_low_avg) * 10) / 10;
    bess_net_capture = Math.round((p_high_avg - p_low_avg / 0.87) * 10) / 10;
  }

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
    pl_avg_eur_mwh:            pl_avg,
    lt_pl_spread_eur_mwh:      lt_pl_spread_eur,
    lt_pl_spread_pct,
    lt_daily_swing_eur_mwh,
    lt_evening_premium,
    p_high_avg, p_low_avg, intraday_capture, bess_net_capture,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours:  ltPrices.length,
    se4_hours: se4Prices.length,
    // Hourly price arrays for trading engine consumption
    hourly_lt:  ltPrices.map(p => Math.round(p * 100) / 100),
    hourly_se4: se4Prices.map(p => Math.round(p * 100) / 100),
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
    // Capture fields — read flat first, fall back to nested (works regardless of merge order)
    gross_2h:   todayEntry.capture?.gross_2h ?? todayEntry.capture?.capture_2h?.gross_eur_mwh ?? null,
    gross_4h:   todayEntry.capture?.gross_4h ?? todayEntry.capture?.capture_4h?.gross_eur_mwh ?? null,
  });

  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  await env.KKME_SIGNALS.put(HISTORY_KEY, JSON.stringify(history));
  return history;
}

/** Generic history append for S2/S3/S4. Key = '{signal}_history', max 90 entries. */
async function appendSignalHistory(env, signal, entry) {
  const key = `${signal}_history`;
  let history = [];
  try {
    const raw = await env.KKME_SIGNALS.get(key);
    if (raw) history = JSON.parse(raw);
  } catch { /* start fresh */ }
  const today = new Date().toISOString().split('T')[0];
  // deduplicate: keep only the latest entry per date
  history = history.filter(e => e.date !== today);
  history.push({ ...entry, date: today });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  await env.KKME_SIGNALS.put(key, JSON.stringify(history));
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

// ─────────────────────────────────────────────────────────────────────
// VERT.lt ArcGIS — PRIMARY source for Lithuanian BESS project data.
//
// Pulls from VERT.lt's grid-permits ArcGIS FeatureServer (layer 8),
// filtered by Tipas === 'Kaupikliai' (storage type).
//
// Returns grid-level aggregates: free_mw, connected_mw, reserved_mw.
// Individual project detail comes from s4_fleet KV (populated by VPS
// daily pipeline → kkme_sync.py → POST /s2/fleet).
//
// NOT to be confused with the deprecated Litgrid balancing-capacites
// scraper (litgrid.eu/dashboard/balancing-capacites/31577) which
// stopped publishing data post-Feb 2025 synchronization. Baltic
// balancing procurement is now in BTD only.
//
// Last verified: 2026-04-08
// ─────────────────────────────────────────────────────────────────────
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

// ─── S4 Layer 3 — Individual Kaupikliai (storage) projects from Litgrid ArcGIS ──
// Queries FeatureServer/3 ("Prijungti įrenginiai" = connected installations)
// filtered by Elektrinės_tipas = 'Kaupikliai'. Returns individual project records
// with WGS84 geometry via outSR=4326.
//
// Fields available: OBJECTID, Eil_Nr, Prijungimo_taskas (city/substation),
// Elektrines_LGG_MW (power MW), Prijungimo_tasko_itampa_kV (voltage),
// Papildoma_informacija (notes). No owner, MWh, COD, or status fields.
// Layer name "Connected installations" implies all rows are operational.
// ─────────────────────────────────────────────────────────────────────

async function fetchLitgridKaupikliai() {
  const res = await fetch(S4_LAYER3_URL);
  if (!res.ok) throw new Error(`S4 Layer 3: HTTP ${res.status}`);
  const json = await res.json();
  const features = json.features ?? [];
  if (features.length === 0) throw new Error('S4 Layer 3: no Kaupikliai features returned');

  return features.map(f => {
    const a = f.attributes ?? {};
    const g = f.geometry ?? {};
    const city = (a.Prijungimo_taskas ?? '').trim();
    const mw = a.Elektrines_LGG_MW ?? 0;
    const kv = a.Prijungimo_tasko_itampa_kV ?? null;
    const oid = a.OBJECTID;
    const eil = a.Eil_Nr;
    const info = (a.Papildoma_informacija ?? '').trim();
    return {
      id: `litgrid-kaupikliai-${oid}`,
      name: `Kaupikliai ${city}`,
      mw,
      mwh: null,  // Layer 3 doesn't have duration/MWh
      status: 'operational',
      country: 'LT',
      tso: 'Litgrid',
      type: 'kaupikliai',
      source: 'litgrid-layer3',
      source_url: 'https://atviri-litgrid.hub.arcgis.com/',
      connection_point: city,
      voltage_kv: kv,
      eil_nr: eil,
      litgrid_objectid: oid,
      info: info || null,
      lat: typeof g.y === 'number' ? Math.round(g.y * 1e6) / 1e6 : null,
      lng: typeof g.x === 'number' ? Math.round(g.x * 1e6) / 1e6 : null,
      _contradiction_flags: [],
      _freshness: 1.0,
    };
  });
}

// Merge Litgrid Layer 3 Kaupikliai records into fleet KV.
// - Layer 3 records (source='litgrid-layer3') replace all prior Layer 3 records
// - Manual entries for non-LT countries or LT entries without 'litgrid-layer3' source are preserved
// - The old aggregate "Energy Cells (Kruonis)" manual entry is removed if present
async function syncLitgridFleet(env) {
  const kaupikliai = await fetchLitgridKaupikliai();
  console.log(`[S4/layer3] fetched ${kaupikliai.length} Kaupikliai records from Litgrid`);

  const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
           || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
  const current = raw ? JSON.parse(raw) : { raw_entries: [], demand: { eff_demand_mw: 935 } };
  const entries = current.raw_entries ?? [];

  // Remove old Layer 3 records and the stale "Energy Cells (Kruonis)" aggregate
  const preserved = entries.filter(e =>
    e.source !== 'litgrid-layer3' &&
    !(e.name === 'Energy Cells (Kruonis)')
  );

  // Add fresh Layer 3 records
  const merged = [...preserved, ...kaupikliai];

  const fleet = processFleet(merged, current.demand);
  fleet.raw_entries = merged;
  fleet.demand = current.demand;
  const json = JSON.stringify(fleet);
  await Promise.all([
    env.KKME_SIGNALS.put('s4_fleet', json),
    env.KKME_SIGNALS.put('s2_fleet', json),
  ]);
  console.log(`[S4/layer3] fleet synced: ${merged.length} entries (${kaupikliai.length} from Layer 3, ${preserved.length} preserved), sd_ratio=${fleet.sd_ratio}`);
  return { synced: kaupikliai.length, total: merged.length, sd_ratio: fleet.sd_ratio };
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

// ── S3 freshness helpers ──────────────────────────────────────────────────────
async function updateS3Freshness(kv, sourceKey, extra = {}) {
  const raw = await kv.get('s3_freshness').catch(() => null);
  const freshness = raw ? JSON.parse(raw) : {};
  freshness[sourceKey] = { last_update: new Date().toISOString(), status: 'current', ...extra };
  await kv.put('s3_freshness', JSON.stringify(freshness));
}

function checkS3Freshness(entry, maxAgeHours) {
  if (!entry?.last_update) return 'unknown';
  const ageHours = (Date.now() - new Date(entry.last_update).getTime()) / 3600000;
  return ageHours > maxAgeHours ? 'stale' : 'current';
}

// ── S3 weekly enrichment (Claude + web search) ──────────────────────────────
async function enrichS3(env) {
  const prompt = `You are a BESS market analyst. Search for information from the last 2 weeks on:
1. European utility-scale BESS installed cost trends
2. LFP cell or pack pricing trends
3. HV transformer and grid equipment lead times or pricing
4. Baltic BESS project announcements (Lithuania, Latvia, Estonia)
5. PCS / inverter pricing or grid-forming compliance updates

Return ONLY valid JSON:
{"search_date":"YYYY-MM-DD","findings":[{"topic":"battery_cost|grid_equipment|transaction|pcs|financing|policy","headline":"max 80 chars","source":"name","relevance":"high|medium|low","driver_key":"battery_hardware|electrical_pcs|hv_grid|financing","direction_signal":"easing|stable|constrained|increasing","magnitude_signal":"weak|moderate|strong"}],"driver_sentiment":{"battery_hardware":{"direction":"easing","magnitude":"moderate","evidence_count":0,"summary":"brief"},"electrical_pcs":{"direction":"stable","magnitude":"weak","evidence_count":0,"summary":""},"hv_grid":{"direction":"constrained","magnitude":"strong","evidence_count":0,"summary":""},"financing":{"direction":"easing","magnitude":"moderate","evidence_count":0,"summary":""}},"new_transactions":[],"range_drift_flag":false,"range_drift_reason":""}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    const textContent = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    let enrichment;
    try {
      // Strip markdown fences and preamble
      let cleaned = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace >= 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.substring(0, lastBrace + 1);
      enrichment = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[S3/enrichment] JSON parse failed:', parseErr.message, 'response:', textContent.substring(0, 200));
      await notifyTelegram(env, '\u26a0\ufe0f S3 enrichment ran but JSON parse failed.');
      return;
    }
    if (!enrichment.findings || !enrichment.driver_sentiment) {
      console.error('[S3/enrichment] missing required fields');
      return;
    }
    enrichment.enriched_at = new Date().toISOString();
    enrichment.model = 'claude-sonnet-4-20250514';
    await env.KKME_SIGNALS.put('s3_enrichment', JSON.stringify(enrichment));
    await updateS3Freshness(env.KKME_SIGNALS, 'enrichment');

    // Validation: check baseline drift
    const baseline = JSON.parse(await env.KKME_SIGNALS.get('s3_baseline').catch(() => 'null') || 'null');
    const s3 = JSON.parse(await env.KKME_SIGNALS.get('s3').catch(() => '{}') || '{}');
    const alerts = [];
    if (baseline?.lithium_reference_eur_t && s3.lithium_eur_t) {
      const drift = (s3.lithium_eur_t - baseline.lithium_reference_eur_t) / baseline.lithium_reference_eur_t;
      if (Math.abs(drift) > 0.25) alerts.push(`Lithium moved ${(drift*100).toFixed(0)}% since ranges were set.`);
    }
    if (baseline?.set_at) {
      const age = (Date.now() - new Date(baseline.set_at).getTime()) / 86400000;
      if (age > 90) alerts.push(`Editorial data last calibrated ${Math.floor(age)} days ago.`);
    }

    // Telegram digest
    const parts = ['\ud83d\udd0b S3 Weekly Digest'];
    const topH = (enrichment.findings || []).filter(f => f.relevance === 'high').slice(0, 3);
    if (topH.length) { parts.push('\ud83d\udcf0 Key signals:'); topH.forEach(h => parts.push(`  \u2022 ${h.headline}`)); }
    if (alerts.length) { parts.push('\n\u26a0\ufe0f Review:'); alerts.forEach(a => parts.push(`  \u2022 ${a}`)); }
    parts.push(alerts.length ? '\n\ud83d\udd34 Action needed' : '\n\ud83d\udfe2 No action needed');
    await notifyTelegram(env, parts.join('\n'));

    console.log(`[S3/enrichment] ${enrichment.findings.length} findings, ${alerts.length} alerts`);
  } catch (err) {
    console.error('[S3/enrichment] failed:', err);
    await notifyTelegram(env, `\u26a0\ufe0f S3 enrichment failed: ${String(err).slice(0, 200)}`);
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
// Runs in cron (CF IP may be blocked) + fallback via POST /da_tomorrow/update.

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

// ECB series keys (flow/key format — dot notation in URL causes HTML response):
//   Nominal 3M Euribor: FM / M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA  → ~2.03% Jan 2026
//   HICP inflation YoY: ICP / M.U2.N.000000.4.ANR              → ~1.9% Dec 2025
const ECB_EURIBOR_NOMINAL_URL = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=3&format=jsondata';
const ECB_HICP_URL            = 'https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?lastNObservations=3&format=jsondata';

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
// S2 data fetched directly by Worker cron from BTD API + Litgrid ordered capacity.
// Also accepts external POSTs to /s2/update for backward compatibility.
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

// ── BTD API fetch ─────────────────────────────────────────────────────────────
async function fetchBTDDataset(id, start, end) {
  const url = `https://api-baltic.transparency-dashboard.eu/api/v1/export?id=${id}&start_date=${start}T00:00&end_date=${end}T00:00&output_time_zone=UTC&output_format=json&json_header_groups=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // BTD periodically has SSL cert issues (526) — Mac cron handles data push separately
      console.log(`[BTD] ${id}: HTTP ${res.status} — using cached KV data`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.log(`[BTD] ${id}: fetch error (${e.message}) — using cached KV data`);
    return null;
  }
}

// ── Litgrid ordered balancing capacity scrape ─────────────────────────────────
async function fetchLitgridBalancing() {
  const url = 'https://www.litgrid.eu/index.php/dashboard/balancing-capacites/31577';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KKME-Pipeline/1.0; +https://kkme.eu)',
        'Accept': 'text/html,*/*',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log('[Litgrid] HTTP', res.status, '— skipping ordered capacity');
      return { ordered_price: null, ordered_mw: null };
    }
    const html = await res.text();

    // Parse ordered price (€/MW/h)
    let ordered_price = null;
    const pricePatterns = [
      /([\d]+[.,][\d]+)\s*(?:EUR\/MW\/h|€\/MW\/h|Eur\/MW\/h)/i,
      /(?:price|kaina|clearing)[^<]{0,50}([\d]+[.,][\d]+)/i,
    ];
    for (const pat of pricePatterns) {
      const m = html.match(pat);
      if (m) {
        const val = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(val) && val > 0 && val < 10000) {
          ordered_price = Math.round(val * 100) / 100;
          break;
        }
      }
    }

    // Parse ordered MW
    let ordered_mw = null;
    const mwPatterns = [
      /(?:ordered|užsakyta|galingumas)[^<]{0,80}([\d\s]+)\s*MW/i,
      /total[^<]{0,40}([\d\s]+)\s*MW/i,
    ];
    for (const pat of mwPatterns) {
      const m = html.match(pat);
      if (m) {
        const val = parseFloat(m[1].replace(/\s/g, ''));
        if (!isNaN(val) && val > 0 && val < 100000) {
          ordered_mw = Math.round(val);
          break;
        }
      }
    }

    // Litgrid stopped publishing ordered capacity data post-synchronization.
    // Page exists but data table is empty. BTD is now the authoritative source.
    // Last verified 2026-04-08.
    if (!ordered_price && !ordered_mw) {
      console.log('[Litgrid] No ordered capacity data (expected — data moved to BTD post-sync)');
    }
    return { ordered_price, ordered_mw };
  } catch (e) {
    clearTimeout(timer);
    console.error('[Litgrid] fetch error:', e.message);
    return { ordered_price: null, ordered_mw: null };
  }
}

// ── Monthly activation clearing aggregates from BTD ──────────────────────────
// Fetches price_procured_reserves month by month (BTD rate-limits large ranges),
// groups by month, computes stats. Stores in KV 's2_activation'.
async function computeS2Activation() {
  // Fetch in monthly chunks (parallel). BTD blocks large ranges from some IPs.
  const now = new Date();
  const fetches = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEndDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const mEnd = mEndDate > now ? now : mEndDate;
    fetches.push(fetchBTDDataset('price_procured_reserves', mStart.toISOString().slice(0, 10), mEnd.toISOString().slice(0, 10)));
  }
  const results = await Promise.all(fetches);

  const allTimeseries = [];
  for (const r of results) {
    if (r?.data?.timeseries) allTimeseries.push(...r.data.timeseries);
  }

  if (allTimeseries.length === 0) {
    console.log('[S2/activation] No timeseries data from BTD (all 6 month fetches returned null)');
    return null;
  }
  console.log(`[S2/activation] fetched ${allTimeseries.length} ISPs across ${results.filter(r => r?.data?.timeseries).length}/6 months`);

  const timeseries = allTimeseries;

  // BTD columns: EE(0-4), LV(5-9), LT(10-14)
  // Each: FCR_sym, aFRR_up, aFRR_dn, mFRR_up, mFRR_dn
  const COUNTRY_COLS = {
    Estonia:   { afrr_up: 1, mfrr_up: 3 },
    Latvia:    { afrr_up: 6, mfrr_up: 8 },
    Lithuania: { afrr_up: 11, mfrr_up: 13 },
  };

  // Group by country and month
  const monthlyData = {}; // { country: { month: { afrr: [], mfrr: [] } } }
  for (const [country, cols] of Object.entries(COUNTRY_COLS)) {
    monthlyData[country] = {};
  }

  for (const isp of timeseries) {
    const from = isp.from || isp._from || '';
    const month = from.slice(0, 7);
    if (!month || month.length !== 7) continue;
    const values = isp.values;
    if (!values) continue;

    for (const [country, cols] of Object.entries(COUNTRY_COLS)) {
      if (!monthlyData[country][month]) monthlyData[country][month] = { afrr: [], mfrr: [] };
      const afrrVal = values[cols.afrr_up];
      const mfrrVal = values[cols.mfrr_up];
      if (afrrVal != null && afrrVal > 0) monthlyData[country][month].afrr.push(afrrVal);
      if (mfrrVal != null && mfrrVal > 0) monthlyData[country][month].mfrr.push(mfrrVal);
    }
  }

  // Stats helper
  function stats(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
    return { avg, p50, p90, count: arr.length, activation_rate: arr.length / (30 * 96) };
  }

  const months = [...new Set(
    Object.values(monthlyData).flatMap(c => Object.keys(c))
  )].sort();

  // Build per-country data in the format the parser expects:
  // countries.Lithuania.afrr_up = { '2026-01': { avg, p50, p90, count }, ... }
  // countries.Lithuania.afrr_recent_3m = { avg_p50: ... }
  const countries = {};
  for (const [country, monthMap] of Object.entries(monthlyData)) {
    const afrr_up = {};
    const mfrr_up = {};
    for (const month of months) {
      if (monthMap[month]) {
        const as = stats(monthMap[month].afrr);
        const ms = stats(monthMap[month].mfrr);
        if (as) afrr_up[month] = as;
        if (ms) mfrr_up[month] = ms;
      }
    }

    // Recent 3 months average P50
    const recent3 = months.slice(-3);
    const recentAfrrP50s = recent3.map(m => afrr_up[m]?.p50).filter(v => v != null);
    const recentMfrrP50s = recent3.map(m => mfrr_up[m]?.p50).filter(v => v != null);
    const afrr_recent_3m = recentAfrrP50s.length
      ? { avg_p50: Math.round(recentAfrrP50s.reduce((s, v) => s + v, 0) / recentAfrrP50s.length * 10) / 10 }
      : { avg_p50: null };
    const mfrr_recent_3m = recentMfrrP50s.length
      ? { avg_p50: Math.round(recentMfrrP50s.reduce((s, v) => s + v, 0) / recentMfrrP50s.length * 10) / 10 }
      : { avg_p50: null };

    countries[country] = { afrr_up, afrr_recent_3m, mfrr_up, mfrr_recent_3m };
  }

  // Compression trajectory (Lithuania P50 over time)
  const ltData = monthlyData['Lithuania'] || {};
  const compression_trajectory = {
    afrr_lt_p50: months.map(m => stats(ltData[m]?.afrr)?.p50 ?? 0),
    afrr_lt_avg: months.map(m => stats(ltData[m]?.afrr)?.avg ?? 0),
    months,
  };

  return {
    countries,
    compression_trajectory,
    period: `${months[0]} to ${months[months.length - 1]}`,
    source: 'baltic.transparency-dashboard.eu',
    data_class: 'observed',
    stored_at: new Date().toISOString(),
  };
}

// ── Full S2 fetch: BTD + Litgrid → shaped payload ────────────────────────────
async function computeS2() {
  const nineAgo    = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  // UTC hour check: Litgrid ordered capacity publishes at 08:30 UTC.
  // Skip ordered fetch before 09:00 UTC.
  const utcHour = new Date().getUTCHours();
  const skipOrdered = utcHour < 9;

  const [btdResults, litgrid] = await Promise.all([
    Promise.all([
      fetchBTDDataset('price_procured_reserves',   nineAgo, twoDaysAgo),
      fetchBTDDataset('direction_of_balancing_v2', nineAgo, twoDaysAgo),
      fetchBTDDataset('imbalance_prices',          nineAgo, twoDaysAgo),
    ]),
    skipOrdered ? Promise.resolve({ ordered_price: null, ordered_mw: null }) : fetchLitgridBalancing(),
  ]);

  const [reserves, direction, imbalance] = btdResults;
  const { ordered_price, ordered_mw } = litgrid;

  // If any BTD dataset failed (SSL 526, timeout), return null — Mac cron pushes data separately
  if (!reserves || !direction || !imbalance) {
    console.log('[S2/compute] BTD dataset(s) unavailable — skipping worker S2 update (Mac cron handles this)');
    return null;
  }

  const payload = s2ShapePayload(reserves, direction, imbalance);
  if (ordered_price != null) payload.ordered_price = ordered_price;
  if (ordered_mw    != null) payload.ordered_mw    = ordered_mw;

  console.log(`[S2/compute] ordered_price=${ordered_price ?? '—'} ordered_mw=${ordered_mw ?? '—'}`);
  return payload;
}

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

// S2_INTERPRETATION removed — no editorial in worker responses.

function computeCapacityMonthly(history) {
  const byMonth = {};
  for (const d of history) {
    const m = d.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { afrr: [], mfrr: [], fcr: [] };
    if (d.afrr_up != null) byMonth[m].afrr.push(d.afrr_up);
    if (d.mfrr_up != null) byMonth[m].mfrr.push(d.mfrr_up);
    if (d.fcr != null) byMonth[m].fcr.push(d.fcr);
  }
  const avg = arr => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length * 100) / 100 : null;
  return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
    month, afrr_avg: avg(v.afrr), mfrr_avg: avg(v.mfrr), fcr_avg: avg(v.fcr), days: v.afrr.length,
  }));
}

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

  // Signal classification removed — phase comes from processFleet via fleet merge

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
  cycles_per_day: 1,  // 1 DA arbitrage cycle per day (model note: aFRR/mFRR + 1 DA cycle)
  // 2h system is SoC-constrained for sustained balancing activation windows
  // 4h system can sustain full aFRR/mFRR window → full 0.5 MW allocation
  capacity_allocation: {
    h2: { afrr: 0.628, mfrr: 0.778 },  // ~0.314 MW aFRR, ~0.389 MW mFRR per MW installed
    h4: { afrr: 1.0,   mfrr: 1.0   },  // full 0.5 MW per MW installed
  },
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
  // 4h: full 0.5 MW per MW installed; 2h: SoC-constrained to shorter sustained windows
  const alloc = B.capacity_allocation[key];
  const afrr_mw_provided = 0.5 * alloc.afrr;
  const mfrr_mw_provided = 0.5 * alloc.mfrr;

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

  const SYSTEM = `You write for a BESS developer who built this console himself. He knows the market.

RULES — every output must follow all of these:
1. Two sentences per signal. Hard limit.
2. Max 15 words per sentence.
3. Sentence 1: state the number in plain terms.
4. Sentence 2: state what does NOT change because of it.
5. No hedging: never use may, could, suggests, indicates, appears, seems, potentially, worth noting.
6. No sign-off phrases.

GOOD examples:
  "Small spread today. Coupling day — irrelevant until NTC tightens."
  "aFRR still 3× the CH 2027 forecast. Window open, compressing by quarter."
  "Equipment cheaper than last quarter. Installed cost: BOS and grid still dominate."
  "Free MW is fine. Fight is node approval queue, not raw capacity."

BAD (never write like this):
  "Partial separation forming. Consider checking NordBalt capacity before committing."
  "Upstream costs suggest improving capex window."`;

  const stale_signals = Object.entries(data_completeness).filter(([, v]) => !v).map(([k]) => k.toUpperCase());
  const stale_note = stale_signals.length
    ? `\nNOTE: ${stale_signals.join(', ')} data is stale. For each stale signal write exactly: "No fresh data."\n`
    : '';

  const pack = JSON.stringify({
    s1: {
      spread_eur:   s1?.spread_eur_mwh    ?? null,
      swing_eur:    s1?.lt_daily_swing_eur_mwh ?? null,
      vs_median:    s1?.spread_stats_90d?.p50  ?? null,
      stale:        !!s1?._stale,
    },
    s2: {
      afrr_eur_mwh: s2?.afrr_up_avg  ?? null,
      mfrr_eur_mwh: s2?.mfrr_up_avg  ?? null,
      ch_2027_afrr: 20,
      stale:        !!s2?._stale,
    },
    s3: {
      equip_eur_kwh: s3?.europe_system_eur_kwh ?? null,
      euribor_pct:   s3?.euribor_3m           ?? null,
      stale:         !!s3?._stale,
    },
    s4: {
      free_mw:        s4?.free_mw       ?? null,
      pipeline_clean: !s4?.parse_warning,
      stale:          !!s4?._stale,
    },
  });

  const prompt = `${SYSTEM}${stale_note}

Data (${new Date().toISOString().slice(0, 10)}):
${pack}

Return ONLY a JSON object — 1–2 sentences per key, no markdown:
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

// ─── Daily digest ─────────────────────────────────────────────────────────────

async function sendDailyDigest(env) {
  const lines = [];
  const date = new Date().toISOString().split('T')[0];
  lines.push(`KKME · ${date}`);

  const signalThresholds = { s1: 36, s2: 48, s3: 720, s4: 6 };
  const issues = [];
  for (const [key, threshold] of Object.entries(signalThresholds)) {
    const raw = await env.KKME_SIGNALS.get(key).catch(() => null);
    if (!raw) { issues.push(`🔴 ${key.toUpperCase()}: no data`); continue; }
    try {
      const d  = JSON.parse(raw);
      const ts = d.timestamp ?? d._meta?.written_at ?? d.updated_at;
      if (!ts) continue;
      const age = (Date.now() - new Date(ts).getTime()) / 3600000;
      if (age > threshold * 1.5) issues.push(`⚠️ ${key.toUpperCase()}: ${age.toFixed(0)}h old`);
    } catch { issues.push(`⚠️ ${key.toUpperCase()}: parse error`); }
  }
  if (issues.length) lines.push(...issues);

  const s4 = await env.KKME_SIGNALS.get('s4').then(r => r ? JSON.parse(r) : null).catch(() => null);
  if (s4?.parse_warning) lines.push('📋 S4 pipeline: needs BESS filter verify');

  // S4 pipeline (VERT.lt monthly — still local, flag if very stale)
  const s4pipeline = await env.KKME_SIGNALS.get('s4_pipeline').then(r => r ? JSON.parse(r) : null).catch(() => null);
  const pipeTs = s4pipeline?.timestamp;
  const pipeAge = pipeTs ? (Date.now() - new Date(pipeTs).getTime()) / 3600000 : null;
  if (!pipeAge || pipeAge > 840) lines.push(`⚠️ S4 pipeline: ${pipeAge?.toFixed(0) ?? 'never'}h old (monthly VERT.lt — run fetch-vert.js)`);

  // S2 activation freshness watchdog
  const actRaw = await env.KKME_SIGNALS.get('s2_activation').catch(() => null);
  if (actRaw) {
    try {
      const act = JSON.parse(actRaw);
      const storedAt = new Date(act.stored_at);
      const ageDays = (Date.now() - storedAt.getTime()) / 86400000;
      if (ageDays > 3) issues.push(`⚠️ S2 activation: ${Math.floor(ageDays)}d old (stored ${act.stored_at?.slice(0, 10)})`);
    } catch { /* ignore */ }
  } else {
    issues.push('🔴 S2 activation: no data');
  }

  const idx = await env.KKME_SIGNALS.get('feed_index').then(r => r ? JSON.parse(r) : []).catch(() => []);
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newItems = idx.filter(i => i.added_at?.startsWith(yesterday));
  if (newItems.length > 0) lines.push(`📰 Feed: +${newItems.length} item${newItems.length > 1 ? 's' : ''} added`);

  const isMonday = new Date().getDay() === 1;
  if (lines.length > 1 || isMonday) {
    if (lines.length === 1) lines.push('All systems OK.');
    await notifyTelegram(env, lines.join('\n'));
  }
}

// ─── Telegram webhook helpers ─────────────────────────────────────────────────

function classifyTopic(text) {
  if (/bess|battery storage|energy storage|lfp|lithium iron|stationary/i.test(text)) return 'BESS';
  if (/data cent|dc power|hyperscal|coloc|megawatt campus/i.test(text)) return 'DC';
  if (/hydrogen|electroly|\bh2\b|fuel cell/i.test(text)) return 'HYDROGEN';
  if (/lithium|cell price|catl|byd|battery tech|chemistry/i.test(text)) return 'BATTERIES';
  if (/\bgrid\b|transmission|tso|ntc|interconnect|balancing/i.test(text)) return 'GRID';
  return 'TECHNOLOGY';
}

// ─── Known companies for entity extraction ─────────────────────────────────────

const KNOWN_COMPANIES = [
  'Ignitis', 'Litgrid', 'Amber Grid', 'ESO', 'Elering', 'AST', 'Augstsprieguma tīkls',
  'NordBalt', 'LitPol', 'ENGIE', 'Fortum', 'Vattenfall', 'Orsted', 'Ørsted',
  'Fluence', 'Tesla Megapack', 'CATL', 'BYD', 'Saft', 'Leclanché',
  'Nuvve', 'Wärtsilä', 'Aggreko', 'Eaton', 'ABB', 'Siemens Energy',
  'Equinor', 'RWE', 'E.ON', 'EDP', 'Iberdrola',
  'Google', 'Microsoft', 'Meta', 'Amazon AWS', 'Apple',
  'Digital Realty', 'Equinix', 'NTT', 'Hetzner', 'Data4',
  'Green Mountain', 'Kolos', 'Atria', 'Rail Baltica',
];

function extractCompanies(text) {
  const found = [];
  for (const co of KNOWN_COMPANIES) {
    if (new RegExp(co.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
      found.push(co);
    }
  }
  return [...new Set(found)];
}

// ─── Telegram session helpers ──────────────────────────────────────────────────

const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes
const SESSION_KEY = 'telegram_session';

async function openFeedSession(kv, chatId, firstMessage) {
  const session = {
    chatId,
    messages:   [firstMessage],
    companies:  extractCompanies(firstMessage),
    topic:      classifyTopic(firstMessage),
    opened_at:  new Date().toISOString(),
  };
  await kv.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return session;
}

async function appendToSession(kv, message) {
  const raw = await kv.get(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  const session = JSON.parse(raw);
  session.messages.push(message);
  // Re-classify topic from all messages combined
  const combined = session.messages.join(' ');
  session.topic   = classifyTopic(combined);
  // Merge new companies
  const newCos    = extractCompanies(message);
  session.companies = [...new Set([...session.companies, ...newCos])];
  await kv.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return session;
}

async function finalizeFeedSession(kv, env) {
  const raw = await kv.get(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  const session = JSON.parse(raw);
  await kv.delete(SESSION_KEY);

  const combined   = session.messages.join('\n\n');
  const urlMatch   = combined.match(/https?:\/\/[^\s]+/);
  const id         = makeId();
  const now        = new Date().toISOString();

  let title  = null;
  let source = null;
  if (urlMatch) {
    const pageUrl = urlMatch[0];
    title  = await fetchPageTitle(pageUrl);
    source = new URL(pageUrl).hostname.replace(/^www\./, '');
    if (!title) title = pageUrl.slice(0, 80);
  } else {
    title = combined.slice(0, 80);
  }

  const summary = await generateSummary(env, title + '\n' + combined.slice(0, 400));

  const item = {
    id,
    added_at:     now,
    topic:        session.topic,
    content_type: urlMatch ? 'url' : 'note',
    url:          urlMatch ? urlMatch[0] : null,
    raw_text:     combined.slice(0, 1000),
    title:        title ?? combined.slice(0, 60),
    source,
    summary,
    companies:    session.companies,
  };

  await saveFeedItem(kv, item);
  return item;
}

async function sendTelegramReply(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(e => console.error('[Telegram] reply error:', e));
}

async function fetchPageTitle(pageUrl) {
  try {
    const res  = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const html = await res.text();
    const m    = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  } catch { return null; }
}

async function saveFeedItem(kv, item) {
  await kv.put(`feed_${item.id}`, JSON.stringify(item));
  const rawIdx = await kv.get('feed_index').catch(() => null);
  let idx = rawIdx ? JSON.parse(rawIdx) : [];
  idx.unshift({ id: item.id, topic: item.topic, added_at: item.added_at, title: item.title, source: item.source, content_type: item.content_type, url: item.url ?? null, summary: item.summary ?? null });
  if (idx.length > 200) idx = idx.slice(0, 200);
  await kv.put('feed_index', JSON.stringify(idx));
}

async function generateSummary(env, text) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content: `Summarise in max 20 words, operator perspective, no hedging: ${text.slice(0, 800)}` }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text?.trim() ?? null;
  } catch { return null; }
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

// ─── Curation → feed item projection ───────────────────────────────────────────
// Mirrors app/lib/sourceClassify.ts so /feed can surface classified curations
// without requiring backfill or a frontend change.

const FEED_PRIMARY_DOMAINS = [
  'litgrid.eu', 'ast.lv', 'elering.ee', 'entsoe.eu', 'acer.europa.eu',
  'ec.europa.eu', 'europa.eu', 'lrv.lt', 'vert.lt', 'apva.lrv.lt',
  'nordpoolgroup.com', 'ena.lt', 'aib-net.org',
];
const FEED_TRADE_PRESS_HINTS = [
  'montel', 'argusmedia', 'spglobal', 'reuters', 'bloomberg', 'ft.com',
  'energy-storage.news', 'pv-magazine', 'reneweconomy', 'offshorewind.biz',
  'energymonitor', 'rechargenews', 'windpowermonthly', 'bnef', 'mckinsey.com',
];
const FEED_TAG_CATEGORY = {
  BESS: 'project_stage',
  GRID: 'project_stage',
  REGULATORY: 'policy',
  RENEWABLES: 'project_stage',
  MARKET: 'market_design',
};

function feedDomainOf(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

function feedSourceQuality(source, url) {
  const domain = feedDomainOf(url);
  const nameLc = (source || '').toLowerCase();
  if (domain) {
    if (FEED_PRIMARY_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return 'tso_regulator';
    if (FEED_TRADE_PRESS_HINTS.some(h => domain.includes(h))) return 'trade_press';
  }
  if (['litgrid', 'ast', 'elering', 'vert', 'apva', 'entso'].some(n => nameLc.includes(n))) return 'tso_regulator';
  return 'trade_press';
}

function curationCategory(tags) {
  if (!Array.isArray(tags)) return 'policy';
  for (const t of tags) {
    const mapped = FEED_TAG_CATEGORY[t];
    if (mapped) return mapped;
  }
  return 'policy';
}

function curationFeedScore(relevance) {
  const r = typeof relevance === 'number' && Number.isFinite(relevance) ? relevance : 60;
  return Math.min(1.0, 0.5 + 0.4 * (r / 100));
}

function projectCurationToFeedItem(entry) {
  const title = (entry.title || '').trim().replace(/^\[PDF\]\s*/i, '');
  if (!title || title.length < 15 || title.startsWith('http')) return null;
  const pubDate = entry.created_at || new Date().toISOString();
  return {
    id: `cur_${entry.id}`,
    title,
    consequence: (entry.raw_text || title).slice(0, 240),
    event_type: null,
    category: curationCategory(entry.tags),
    geography: 'Baltic',
    published_at: pubDate,
    source: entry.source || 'news',
    source_url: entry.url || null,
    source_quality: feedSourceQuality(entry.source, entry.url),
    confidence: 'C',
    horizon: 'near_term',
    impact_direction: null,
    affected_modules: [],
    affected_cod_windows: [],
    feed_score: curationFeedScore(entry.relevance),
    expires_at: new Date(new Date(pubDate).getTime() + 30 * 86400000).toISOString(),
    status: 'published',
    origin: 'curation',
  };
}

async function appendCurationToFeedIndex(kv, curationEntry) {
  const item = projectCurationToFeedItem(curationEntry);
  if (!item) return false;
  const rawIdx = await kv.get('feed_index').catch(() => null);
  const idx = rawIdx ? JSON.parse(rawIdx) : [];
  const seenUrls = new Set(idx.map(i => i.source_url).filter(Boolean));
  const seenTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));
  if (item.source_url && seenUrls.has(item.source_url)) return false;
  if (seenTitles.has((item.title || '').toLowerCase().trim())) return false;
  idx.push(item);
  idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
  if (idx.length > 1000) idx.length = 1000;
  await kv.put('feed_index', JSON.stringify(idx));
  return true;
}

function isValidFeedItem(i) {
  if (!i || !i.title) return false;
  if (i.title.startsWith('/') || i.title.startsWith('http')) return false;
  if (i.title.length < 15) return false;
  if (!i.source || !i.category) return false;
  return true;
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

// ─── S5 — DC Power Viability ──────────────────────────────────────────────────

const DC_RSS_URL = 'https://www.datacenterknowledge.com/rss.xml';

async function fetchDCNews() {
  const res = await fetch(DC_RSS_URL, {
    headers: { 'User-Agent': 'KKME/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml   = await res.text();
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks.slice(0, 5)) {
    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
                    ?? block.match(/<title>([^<]*)<\/title>/);
    const linkMatch  = block.match(/<link>([^<]*)<\/link>/)
                    ?? block.match(/<guid[^>]*>(https?[^<]+)<\/guid>/);
    const dateMatch  = block.match(/<pubDate>([^<]*)<\/pubDate>/);
    if (titleMatch?.[1]) {
      items.push({
        title: titleMatch[1].trim()
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        url:   linkMatch?.[1]?.trim() ?? null,
        date:  dateMatch?.[1]?.trim() ?? null,
      });
    }
  }
  return items;
}

async function computeS5(env) {
  const [s4Raw, manualRaw] = await Promise.all([
    env.KKME_SIGNALS.get('s4').catch(() => null),
    env.KKME_SIGNALS.get('s5_manual').catch(() => null),
  ]);
  const s4     = s4Raw     ? JSON.parse(s4Raw)     : null;
  const manual = manualRaw ? JSON.parse(manualRaw) : null;

  const grid_free_mw      = s4?.free_mw      ?? null;
  const grid_connected_mw = s4?.connected_mw ?? null;
  const grid_utilisation  = s4?.utilisation_pct ?? null;

  let signal = 'OPEN';
  if (grid_free_mw != null) {
    if      (grid_free_mw > 2000) signal = 'OPEN';
    else if (grid_free_mw >  500) signal = 'TIGHTENING';
    else                          signal = 'CONSTRAINED';
  }

  let news_items = [];
  try { news_items = await fetchDCNews(); } catch (e) {
    console.error('[S5/news]', String(e));
  }

  return {
    timestamp:        new Date().toISOString(),
    signal,
    grid_free_mw,
    grid_connected_mw,
    grid_utilisation,
    pipeline_mw:      manual?.pipeline_mw   ?? null,
    pipeline_note:    manual?.note          ?? null,
    pipeline_updated: manual?.updated_at    ?? null,
    news_items,
  };
}

// ─── S6 — Nordic Hydro Reservoir ──────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

async function fetchNordicHydro() {
  const NVE_BASE = 'https://biapi.nve.no/magasinstatistikk/api/Magasinstatistikk';
  const headers = { Accept: 'application/json' };

  const [sisteRes, medRes] = await Promise.all([
    fetch(`${NVE_BASE}/HentOffentligDataSisteUke`, { headers }),
    fetch(`${NVE_BASE}/HentOffentligDataMinMaxMedian`, { headers }),
  ]);

  if (!sisteRes.ok) throw new Error(`NVE SisteUke: HTTP ${sisteRes.status}`);
  const sisteUke = await sisteRes.json();

  // Filter to EL (electricity) region entries only (omrType === 'EL')
  const elData = Array.isArray(sisteUke) ? sisteUke.filter(r => r.omrType === 'EL') : [];
  if (!elData.length) throw new Error('NVE: no EL records in SisteUke');

  const totalFillTwh = elData.reduce((s, r) => s + (r.fylling_TWh ?? 0), 0);
  const totalCapTwh  = elData.reduce((s, r) => s + (r.kapasitet_TWh ?? 0), 0);
  if (!totalCapTwh) throw new Error('NVE: zero capacity');

  const fill_pct    = Math.round(totalFillTwh / totalCapTwh * 1000) / 10;
  const currentWeek = elData[0]?.iso_uke ?? null;
  const currentYear = elData[0]?.iso_aar ?? new Date().getFullYear();

  let median_fill_pct = null;
  if (medRes.ok) {
    const medianData = await medRes.json();
    const weekMedian = Array.isArray(medianData)
      ? medianData.filter(r => r.omrType === 'EL' && r.iso_uke === currentWeek)
      : [];
    if (weekMedian.length) {
      const totalMedianTwh = weekMedian.reduce((s, r) => s + (r.medianFylling_TWH ?? 0), 0);
      median_fill_pct = Math.round(totalMedianTwh / totalCapTwh * 1000) / 10;
    }
  }

  const deviation_pp = median_fill_pct != null
    ? Math.round((fill_pct - median_fill_pct) * 10) / 10
    : null;

  let signal = 'NORMAL';
  if (deviation_pp != null) {
    if (deviation_pp > 5)  signal = 'HIGH';
    if (deviation_pp < -5) signal = 'LOW';
  }

  return {
    timestamp:       new Date().toISOString(),
    signal,
    fill_pct,
    capacity_twh:    Math.round(totalCapTwh * 10) / 10,
    median_fill_pct,
    deviation_pp,
    week:            currentWeek,
    year:            currentYear,
    interpretation:  signal === 'HIGH'
      ? 'Reservoirs above median — hydro surplus → lower Nordic baseload prices likely.'
      : signal === 'LOW'
        ? 'Reservoirs below median — hydro deficit → upward pressure on Nordic prices.'
        : 'Reservoirs near historical median — neutral price signal.',
  };
}

// ─── S7 — TTF Gas Price ────────────────────────────────────────────────────────

async function fetchTTFGas() {
  // Yahoo Finance v8 API — Dutch TTF Natural Gas futures (TTF=F), no auth required
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/TTF%3DF?interval=1d&range=10d',
      {
        signal: controller.signal,
        headers: {
          'User-Agent': TE_HEADERS['User-Agent'],
          'Accept': 'application/json',
        },
      }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Yahoo TTF: HTTP ${res.status}`);
    const body = await res.json();
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('Yahoo TTF: no result in response');

    const ttf_eur_mwh = meta.regularMarketPrice;
    if (ttf_eur_mwh == null) throw new Error('Yahoo TTF: regularMarketPrice missing');

    // Trend: vs previous close
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const delta = prevClose != null ? ttf_eur_mwh - prevClose : null;
    const ttf_trend = delta == null ? null
      : delta >  2 ? '↑ rising'
      : delta < -2 ? '↓ falling'
      : '→ stable';

    let signal = 'NORMAL';
    if (ttf_eur_mwh > 50)      signal = 'HIGH';
    else if (ttf_eur_mwh > 30) signal = 'ELEVATED';
    else if (ttf_eur_mwh < 15) signal = 'LOW';

    const regime = signal; // alias for display
    const bess_impact = ttf_eur_mwh > 30 ? 'arbitrage_bullish' : 'neutral';
    return {
      timestamp:   new Date().toISOString(),
      signal,
      regime,
      bess_impact,
      ttf_eur_mwh: Math.round(ttf_eur_mwh * 100) / 100,
      ttf_trend,
      interpretation: signal === 'HIGH'
        ? 'Gas expensive — strong BESS arbitrage case vs peaker plants.'
        : signal === 'ELEVATED'
          ? 'Gas at moderate premium — BESS vs peaker economics supported.'
          : signal === 'LOW'
            ? 'Gas cheap — peaker margin compressed; less urgency for storage.'
            : 'Gas price in normal range — standard storage economics apply.',
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── S8 — Interconnector Flows (NordBalt + LitPol + EstLink + Fenno-Skan) ─────

async function fetchInterconnectorFlows() {
  // energy-charts.info CBET: cross-border electricity trading
  // Sign convention per endpoint: positive = country importing FROM neighbor
  // We negate → positive = country exporting TO neighbor
  const cbetHeaders = { Accept: 'application/json' };

  // Fetch LT, EE, and FI CBET data in parallel
  const [ltRes, eeRes, fiRes] = await Promise.all([
    fetch('https://api.energy-charts.info/cbet?country=lt', { headers: cbetHeaders }),
    fetch('https://api.energy-charts.info/cbet?country=ee', { headers: cbetHeaders }).catch(() => null),
    fetch('https://api.energy-charts.info/cbet?country=fi', { headers: cbetHeaders }).catch(() => null),
  ]);

  if (!ltRes.ok) throw new Error(`CBET LT API: HTTP ${ltRes.status}`);
  const ltData = await ltRes.json();
  const ltCountries = Array.isArray(ltData.countries) ? ltData.countries : [];

  function latestFromList(countryList, name) {
    const c = countryList.find(c => c.name?.toLowerCase() === name.toLowerCase());
    if (!c) return null;
    const values = c.data ?? [];
    // Walk backward to find the last non-null value (latest data point)
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return Math.round(values[i] * 1000); // GW → MW, positive = importing
    }
    return null;
  }

  // NordBalt (LT ↔ SE4): from LT CBET, Sweden column
  const nordbalt_avg_mw = latestFromList(ltCountries, 'Sweden');
  // LitPol (LT ↔ PL): from LT CBET, Poland column
  const litpol_avg_mw = latestFromList(ltCountries, 'Poland');
  // LV ↔ LT internal Baltic flow: from LT CBET, Latvia column
  const lv_lt_avg_mw = latestFromList(ltCountries, 'Latvia');

  // EstLink (EE ↔ FI): from EE CBET, Finland column
  let estlink_avg_mw = null;
  if (eeRes && eeRes.ok) {
    try {
      const eeData = await eeRes.json();
      const eeCountries = Array.isArray(eeData.countries) ? eeData.countries : [];
      estlink_avg_mw = latestFromList(eeCountries, 'Finland');
    } catch (e) {
      console.error('[S8] EE CBET parse error:', String(e));
    }
  }

  // Fenno-Skan (SE ↔ FI): from FI CBET, Sweden column
  let fennoskan_avg_mw = null;
  if (fiRes && fiRes.ok) {
    try {
      const fiData = await fiRes.json();
      const fiCountries = Array.isArray(fiData.countries) ? fiData.countries : [];
      fennoskan_avg_mw = latestFromList(fiCountries, 'Sweden');
    } catch (e) {
      console.error('[S8] FI CBET parse error:', String(e));
    }
  }

  if (nordbalt_avg_mw == null && litpol_avg_mw == null) {
    console.error('[S8] LT countries not found, names:', ltCountries.map(c => c.name).join(','));
    throw new Error('CBET: no Sweden or Poland data in LT response');
  }

  function flowSignal(mw) {
    if (mw == null) return null;
    if (mw > 100)  return 'EXPORTING';
    if (mw < -100) return 'IMPORTING';
    return 'BALANCED';
  }

  const nordbalt_signal  = flowSignal(nordbalt_avg_mw);
  const litpol_signal    = flowSignal(litpol_avg_mw);
  const estlink_signal   = flowSignal(estlink_avg_mw);
  const fennoskan_signal = flowSignal(fennoskan_avg_mw);
  const lv_lt_signal     = flowSignal(lv_lt_avg_mw);
  const netTotal = (nordbalt_avg_mw ?? 0) + (litpol_avg_mw ?? 0);
  const signal   = netTotal > 100 ? 'EXPORTING' : netTotal < -100 ? 'IMPORTING' : 'NEUTRAL';

  // Extract data timestamp from energy-charts unix_seconds (Bug 5 fix)
  const unixSeconds = Array.isArray(ltData.unix_seconds) ? ltData.unix_seconds : [];
  const lastUnix = unixSeconds.length > 0 ? unixSeconds[unixSeconds.length - 1] : null;
  const dataTimestamp = lastUnix ? new Date(lastUnix * 1000).toISOString() : new Date().toISOString();

  const fmtFlow = (label, sig, mw) =>
    `${label}: ${sig ?? '—'} (${mw != null ? mw + ' MW' : '—'})`;

  return {
    timestamp:        dataTimestamp,
    signal,
    nordbalt_avg_mw,
    litpol_avg_mw,
    estlink_avg_mw,
    fennoskan_avg_mw,
    lv_lt_avg_mw,
    nordbalt_signal,
    litpol_signal,
    estlink_signal,
    fennoskan_signal,
    lv_lt_signal,
    interpretation: [
      fmtFlow('NordBalt', nordbalt_signal, nordbalt_avg_mw),
      fmtFlow('LitPol', litpol_signal, litpol_avg_mw),
      fmtFlow('LV↔LT', lv_lt_signal, lv_lt_avg_mw),
      fmtFlow('EstLink', estlink_signal, estlink_avg_mw),
      fmtFlow('Fenno-Skan', fennoskan_signal, fennoskan_avg_mw),
    ].join('. ') + '.',
  };
}

// ─── S9 — EU ETS Carbon Price ──────────────────────────────────────────────────

function parseEUAPrice(html) {
  // Pattern 1: "Carbon Emissions rose/fell to 73.25"
  const m1 = html.match(/Carbon[^"]*?(?:rose|fell)[^"]*?to\s+([\d,]+\.?\d*)/i);
  if (m1) {
    const val = parseFloat(m1[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 2: embedded JSON "last":"73.25"
  const m2 = html.match(/"last"\s*:\s*"?([\d,]+\.?\d*)"?/);
  if (m2) {
    const val = parseFloat(m2[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 3: "price":"73.25"
  const m3 = html.match(/"price"\s*:\s*"?([\d,]+\.?\d*)"?/);
  if (m3) {
    const val = parseFloat(m3[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  // Pattern 4: data-value attribute
  const m4 = html.match(/data-value="([\d,]+\.?\d*)"/);
  if (m4) {
    const val = parseFloat(m4[1].replace(/,/g, ''));
    if (val >= 5 && val <= 200) return val;
  }
  return null;
}

async function fetchEUCarbon() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://tradingeconomics.com/commodity/carbon', {
      signal: controller.signal, headers: TE_HEADERS, redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`TE EUA: HTTP ${res.status}`);
    const html = await res.text();
    const eua_eur_t = parseEUAPrice(html);
    if (eua_eur_t == null) {
      console.error('[S9] EUA parse failed, preview:', html.slice(0, 500));
      throw new Error('TE EUA: price not found in HTML');
    }
    let signal = 'NORMAL';
    if (eua_eur_t > 70)      signal = 'HIGH';
    else if (eua_eur_t > 50) signal = 'ELEVATED';
    else if (eua_eur_t < 30) signal = 'LOW';
    return {
      timestamp:   new Date().toISOString(),
      signal,
      eua_eur_t:   Math.round(eua_eur_t * 100) / 100,
      eua_trend:   null,
      interpretation: signal === 'HIGH'
        ? 'High carbon price — strong incentive to displace gas peakers with BESS.'
        : signal === 'LOW'
          ? 'Low EUA — carbon premium reduced; BESS vs gas economics less compelling.'
          : 'Carbon price in normal range — standard BESS vs peaker economics.',
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── /genload — Real-time Baltic generation & load (ENTSO-E A75 + A65) ────────
// Queries ENTSO-E Transparency Platform for each Baltic country.
// A75 = Actual Generation Per Type (sum all production types for total gen)
// A65 = System Total Load
// Returns per-country gen, load, net, timestamp, data_age_minutes.

const GENLOAD_COUNTRIES = [
  { key: 'lt', eic: LT_BZN },
  { key: 'lv', eic: LV_BZN },
  { key: 'ee', eic: EE_BZN },
];

function entsoeTimestamp(d) {
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${da}${hh}${mm}`;
}

/**
 * Parse ENTSO-E XML to extract the latest quantity across all TimeSeries.
 * For A75 (generation per type): sums quantities across all production types at the latest time point.
 * For A65 (load): single TimeSeries, takes latest quantity.
 * Returns { value_mw, timestamp_iso } or null.
 */
function parseEntsoeXml(xml, sumAllSeries = false) {
  // Extract all TimeSeries blocks
  const tsBlocks = [];
  const tsRegex = /<TimeSeries>([\s\S]*?)<\/TimeSeries>/g;
  let tsMatch;
  while ((tsMatch = tsRegex.exec(xml)) !== null) {
    tsBlocks.push(tsMatch[1]);
  }
  if (tsBlocks.length === 0) return null;

  // For each TimeSeries, extract the Period with its start, resolution, and points
  const seriesData = [];
  for (const block of tsBlocks) {
    const periodMatch = block.match(/<Period>([\s\S]*?)<\/Period>/);
    if (!periodMatch) continue;
    const period = periodMatch[1];

    const startMatch = period.match(/<start>(.*?)<\/start>/);
    const resMatch   = period.match(/<resolution>(.*?)<\/resolution>/);
    if (!startMatch || !resMatch) continue;

    const periodStart = new Date(startMatch[1]);
    const resolution  = resMatch[1]; // PT15M or PT60M
    const resMins     = resolution === 'PT15M' ? 15 : resolution === 'PT30M' ? 30 : 60;

    // Extract all points (position + quantity)
    const points = [];
    const ptRegex = /<Point>\s*<position>(\d+)<\/position>\s*<quantity>([\d.]+)<\/quantity>/g;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(period)) !== null) {
      const position = parseInt(ptMatch[1]);
      const quantity = parseFloat(ptMatch[2]);
      const pointTime = new Date(periodStart.getTime() + (position - 1) * resMins * 60000);
      points.push({ position, quantity, time: pointTime });
    }
    if (points.length > 0) {
      seriesData.push(points);
    }
  }
  if (seriesData.length === 0) return null;

  if (sumAllSeries) {
    // A75: sum each series' latest point regardless of timestamp alignment.
    // Report the OLDEST contributing timestamp so consumers know the staleness bound.
    let total = 0;
    let oldestTime = null;
    let newestTime = null;
    for (const points of seriesData) {
      const lastPoint = points[points.length - 1];
      if (lastPoint?.quantity != null) {
        total += lastPoint.quantity;
        const t = lastPoint.time.getTime();
        if (oldestTime === null || t < oldestTime) oldestTime = t;
        if (newestTime === null || t > newestTime) newestTime = t;
      }
    }
    if (oldestTime === null) return null;
    return {
      value_mw: Math.round(total),
      timestamp_iso: new Date(oldestTime).toISOString(),
      newest_iso: new Date(newestTime).toISOString(),
      series_count: seriesData.length,
    };
  } else {
    // A65: single series, take the last point
    const allPoints = seriesData.flat().sort((a, b) => a.time - b.time);
    const last = allPoints[allPoints.length - 1];
    return { value_mw: Math.round(last.quantity), timestamp_iso: last.time.toISOString() };
  }
}

async function fetchGenLoadCountry(eic, apiKey) {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
  const start = entsoeTimestamp(twoHoursAgo);
  const end   = entsoeTimestamp(now);

  // Fetch A75 (generation per type) and A65 (load) in parallel
  const [genRes, loadRes] = await Promise.all([
    fetch(`${ENTSOE_API}?documentType=A75&processType=A16&in_Domain=${eic}&periodStart=${start}&periodEnd=${end}&securityToken=${apiKey}`)
      .then(r => r.ok ? r.text() : null)
      .catch(() => null),
    fetch(`${ENTSOE_API}?documentType=A65&processType=A16&outBiddingZone_Domain=${eic}&periodStart=${start}&periodEnd=${end}&securityToken=${apiKey}`)
      .then(r => r.ok ? r.text() : null)
      .catch(() => null),
  ]);

  const gen  = genRes  ? parseEntsoeXml(genRes, true)  : null;
  const load = loadRes ? parseEntsoeXml(loadRes, false) : null;

  // Use the more recent timestamp of the two
  const ts = gen?.timestamp_iso || load?.timestamp_iso || null;
  const genMw  = gen?.value_mw  ?? null;
  const loadMw = load?.value_mw ?? null;
  const netMw  = (genMw != null && loadMw != null) ? genMw - loadMw : null;

  let dataAge = null;
  if (ts) {
    dataAge = Math.round((now.getTime() - new Date(ts).getTime()) / 60000);
  }

  return {
    generation_mw: genMw,
    load_mw: loadMw,
    net_mw: netMw,
    timestamp: ts,
    data_age_minutes: dataAge,
  };
}

async function fetchGenLoad(apiKey) {
  const results = await Promise.all(
    GENLOAD_COUNTRIES.map(c =>
      fetchGenLoadCountry(c.eic, apiKey)
        .catch(err => {
          console.error(`[genload/${c.key}]`, String(err));
          return { generation_mw: null, load_mw: null, net_mw: null, timestamp: null, data_age_minutes: null };
        })
    )
  );
  const out = { fetched_at: new Date().toISOString() };
  GENLOAD_COUNTRIES.forEach((c, i) => { out[c.key] = results[i]; });
  return out;
}

// ─── Baltic Generation (Wind + Solar + Load) ────────────────────────────────────
// Source: energy-charts.info public_power API (Fraunhofer ISE)
// Fetches 7-day range for LT/EE/LV, extracts wind, solar, load.
// Returns { wind, solar, load } payloads for 3 KV keys.

const BALTIC_GEN_COUNTRIES = [
  { code: 'lt', label: 'LT', wind_installed_mw: 1800, solar_installed_mw: 2200 },
  { code: 'ee', label: 'EE', wind_installed_mw:  900, solar_installed_mw:  400 },
  { code: 'lv', label: 'LV', wind_installed_mw:  200, solar_installed_mw:  200 },
  // installed_mw: approximate 2026 references, not exact. Classify as "reference".
];

function extractSeries(apiData, typeName) {
  const types = Array.isArray(apiData?.production_types) ? apiData.production_types : [];
  const match = types.find(t => t.name === typeName);
  if (!match) return null;
  const raw = match.data ?? [];
  const ts = apiData.unix_seconds ?? [];
  // Return paired [timestamp, value] for non-null entries
  const pairs = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] != null) pairs.push({ ts: ts[i] ?? 0, mw: raw[i] });
  }
  return pairs;
}

function seriesStats(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const vals = pairs.map(p => p.mw);
  const current = vals[vals.length - 1];
  const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  return { current_mw: Math.round(current), avg_7d_mw: avg, n: vals.length };
}

function genTrend(current, avg) {
  if (current == null || avg == null || avg === 0) return 'unknown';
  const ratio = current / avg;
  if (ratio > 1.10) return 'above_baseline';
  if (ratio < 0.90) return 'below_baseline';
  return 'stable';
}

async function fetchBalticGeneration() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const startParam = sevenDaysAgo.toISOString().replace(/:\d{2}\.\d+Z/, ':00Z');
  const endParam   = now.toISOString().replace(/:\d{2}\.\d+Z/, ':00Z');

  // Fetch all 3 countries in parallel (one call per country gives wind+solar+load)
  const fetches = BALTIC_GEN_COUNTRIES.map(c =>
    fetch(`https://api.energy-charts.info/public_power?country=${c.code}&start=${startParam}&end=${endParam}`, {
      headers: { Accept: 'application/json' },
    })
    .then(r => { if (!r.ok) throw new Error(`energy-charts ${c.code}: HTTP ${r.status}`); return r.json(); })
    .then(data => ({ country: c, data, ok: true }))
    .catch(err => { console.error(`[Gen/${c.label}]`, String(err)); return { country: c, data: null, ok: false }; })
  );
  const results = await Promise.all(fetches);

  const timestamp = now.toISOString();
  const coverage = results.filter(r => r.ok).map(r => r.country.label);

  // Extract per-country stats for each type
  const windByCountry = {};
  const solarByCountry = {};
  const loadByCountry = {};

  for (const r of results) {
    if (!r.ok) {
      windByCountry[r.country.label] = null;
      solarByCountry[r.country.label] = null;
      loadByCountry[r.country.label] = null;
      continue;
    }
    windByCountry[r.country.label]  = seriesStats(extractSeries(r.data, 'Wind onshore'));
    solarByCountry[r.country.label] = seriesStats(extractSeries(r.data, 'Solar'));
    loadByCountry[r.country.label]  = seriesStats(extractSeries(r.data, 'Load'));
  }

  // Aggregate Baltic totals from available countries
  function balticSum(byCountry, field) {
    let total = 0; let found = false;
    for (const label of ['LT', 'EE', 'LV']) {
      const v = byCountry[label]?.[field];
      if (v != null) { total += v; found = true; }
    }
    return found ? total : null;
  }

  const balticWindCurrent = balticSum(windByCountry, 'current_mw');
  const balticWindAvg     = balticSum(windByCountry, 'avg_7d_mw');
  const balticWindInstalled = BALTIC_GEN_COUNTRIES.reduce((s, c) => s + c.wind_installed_mw, 0);

  const balticSolarCurrent = balticSum(solarByCountry, 'current_mw');
  const balticSolarAvg     = balticSum(solarByCountry, 'avg_7d_mw');
  const balticSolarInstalled = BALTIC_GEN_COUNTRIES.reduce((s, c) => s + c.solar_installed_mw, 0);

  const balticLoadCurrent = balticSum(loadByCountry, 'current_mw');
  const balticLoadAvg     = balticSum(loadByCountry, 'avg_7d_mw');

  // Wind signal
  let windSignal = 'MODERATE';
  if (balticWindCurrent != null && balticWindInstalled > 0) {
    const pct = balticWindCurrent / balticWindInstalled;
    if (pct > 0.60) windSignal = 'HIGH';
    else if (pct < 0.30) windSignal = 'LOW';
  }

  // Solar signal
  let solarSignal = 'MODERATE';
  if (balticSolarCurrent != null) {
    if (balticSolarCurrent === 0) solarSignal = 'NIGHT';
    else if (balticSolarInstalled > 0) {
      const pct = balticSolarCurrent / balticSolarInstalled;
      if (pct > 0.50) solarSignal = 'HIGH';
      else if (pct < 0.20) solarSignal = 'LOW';
    }
  }

  // Load signal
  let loadSignal = 'NORMAL';
  if (balticLoadCurrent != null) {
    if (balticLoadCurrent > 3200) loadSignal = 'PEAK';
    else if (balticLoadCurrent < 2400) loadSignal = 'LOW';
  }

  const wind = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticWindCurrent, avg_7d_mw: balticWindAvg,
    trend_7d: genTrend(balticWindCurrent, balticWindAvg),
    baltic_installed_mw: balticWindInstalled,
    // baltic_share_pct: share of installed capacity currently generating
    // Denominator: sum of installed wind capacity across LT+EE+LV (reference values, ~2026)
    baltic_share_pct: (balticWindCurrent != null && balticWindInstalled > 0)
      ? Math.round(balticWindCurrent / balticWindInstalled * 1000) / 10
      : null,
    lt_mw: windByCountry.LT?.current_mw ?? null,
    ee_mw: windByCountry.EE?.current_mw ?? null,
    lv_mw: windByCountry.LV?.current_mw ?? null,
    signal: windSignal,
    interpretation: windSignal === 'HIGH'
      ? 'High wind generation — wider price spreads likely, supporting BESS arbitrage.'
      : windSignal === 'LOW'
        ? 'Low wind — narrower spreads expected, reduced arbitrage opportunity.'
        : 'Moderate wind output — typical spread conditions.',
  };

  const solar = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticSolarCurrent, avg_7d_mw: balticSolarAvg,
    trend_7d: genTrend(balticSolarCurrent, balticSolarAvg),
    baltic_installed_mw: balticSolarInstalled,
    baltic_share_pct: (balticSolarCurrent != null && balticSolarInstalled > 0)
      ? Math.round(balticSolarCurrent / balticSolarInstalled * 1000) / 10
      : null,
    lt_mw: solarByCountry.LT?.current_mw ?? null,
    ee_mw: solarByCountry.EE?.current_mw ?? null,
    lv_mw: solarByCountry.LV?.current_mw ?? null,
    signal: solarSignal,
    interpretation: solarSignal === 'HIGH'
      ? 'High solar output — low midday prices create a cheap BESS charging window.'
      : solarSignal === 'NIGHT'
        ? 'Nighttime — no solar generation.'
        : solarSignal === 'LOW'
          ? 'Low solar — minimal impact on midday pricing.'
          : 'Moderate solar — some midday price suppression.',
  };

  const load = {
    timestamp, source: 'energy-charts.info', data_class: 'observed',
    coverage_countries: coverage,
    baltic_mw: balticLoadCurrent, avg_7d_mw: balticLoadAvg,
    trend_7d: genTrend(balticLoadCurrent, balticLoadAvg),
    lt_mw: loadByCountry.LT?.current_mw ?? null,
    ee_mw: loadByCountry.EE?.current_mw ?? null,
    lv_mw: loadByCountry.LV?.current_mw ?? null,
    signal: loadSignal,
    interpretation: loadSignal === 'PEAK'
      ? 'Peak demand — higher prices support BESS discharge revenue.'
      : loadSignal === 'LOW'
        ? 'Low demand — reduced price levels, typical off-peak.'
        : 'Normal demand levels.',
  };

  return { wind, solar, load };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default {
  /** Cron — hourly (time-sensitive), 4h (all signals), 09:30 (S2 extra), 08:00 (digest). */
  async scheduled(event, env, _ctx) {
    // 08:00 UTC: daily digest to Telegram
    if (event.cron === '0 8 * * *') {
      await sendDailyDigest(env).catch(e => console.error('[Digest]', e));
      return;
    }

    // 09:30 UTC daily: extra S2 fetch (Litgrid ordered capacity published ~08:30 UTC)
    if (event.cron === '30 9 * * *') {
      try {
        const payload = await withTimeout(computeS2(), 45000);
        if (!payload) {
          console.log('[S2/0930] BTD unavailable — keeping cached KV data');
          return;
        }
        const validation = await kvWrite(env.KKME_SIGNALS, 's2', payload, {
          required: ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg'],
          bounds_key: 's2',
        });
        if (!validation.success) {
          await notifyTelegram(env, `⚠️ S2 (09:30 fetch): KV write rejected — ${validation.errors.join(' | ')}`);
        } else {
          console.log(`[S2/0930] fcr=${payload.fcr_avg} afrr_up=${payload.afrr_up_avg} ordered=${payload.ordered_price ?? '—'}`);
          await appendSignalHistory(env, 's2', { afrr_up: payload.afrr_up_avg, mfrr_up: payload.mfrr_up_avg, fcr: payload.fcr_avg }).catch(e => console.error('[S2/history]', e));
        }
      } catch (e) {
        console.error('[S2/0930]', String(e));
        await notifyTelegram(env, `⚠️ S2 fetch failed (09:30): ${String(e).slice(0, 200)}`).catch(() => {});
      }

      // Also update monthly activation clearing (daily is sufficient for monthly aggregates)
      try {
        const actPayload = await withTimeout(computeS2Activation(), 60000);
        if (actPayload) {
          await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(actPayload));
          console.log(`[S2/activation] updated: period=${actPayload.period}, lt_afrr_3m_p50=${actPayload.countries?.Lithuania?.afrr_recent_3m?.avg_p50}`);
        } else {
          console.log('[S2/activation] BTD unavailable — keeping cached data');
        }
      } catch (e) {
        console.error('[S2/activation]', String(e));
      }
      return;
    }

    // ── Hourly: refresh time-sensitive signals only (genload, S8, wind/solar/load) ──
    if (event.cron === '0 * * * *') {
      console.log('[Hourly] refreshing time-sensitive signals...');
      const [s8Res, genRes, genloadRes] = await Promise.allSettled([
        withTimeout(fetchInterconnectorFlows(), 30000),
        withTimeout(fetchBalticGeneration(),    25000),
        withTimeout(fetchGenLoad(env.ENTSOE_API_KEY), 30000),
      ]);

      if (s8Res.status === 'fulfilled') {
        const d = s8Res.value;
        await env.KKME_SIGNALS.put('s8', JSON.stringify(d));
        console.log(`[S8/hourly] ${d.signal} nordbalt=${d.nordbalt_avg_mw}MW litpol=${d.litpol_avg_mw}MW`);
      } else {
        console.error('[S8/hourly] failed:', s8Res.reason);
      }

      if (genRes.status === 'fulfilled') {
        const { wind, solar, load } = genRes.value;
        await Promise.all([
          env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
          env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
          env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
        ]);
        console.log(`[Gen/hourly] wind=${wind.baltic_mw}MW solar=${solar.baltic_mw}MW load=${load.baltic_mw}MW`);
      } else {
        console.error('[Gen/hourly] failed:', genRes.reason);
      }

      if (genloadRes.status === 'fulfilled') {
        const d = genloadRes.value;
        await env.KKME_SIGNALS.put('genload', JSON.stringify(d));
        console.log(`[Genload/hourly] lt=${d.lt?.generation_mw}/${d.lt?.load_mw} lv=${d.lv?.generation_mw}/${d.lv?.load_mw} ee=${d.ee?.generation_mw}/${d.ee?.load_mw}`);
      } else {
        console.error('[Genload/hourly] failed:', genloadRes.reason);
      }

      console.log('[Hourly] done.');
      return;
    }

    // Every 4h: fetch S1/S2/S3/S4/Euribor in parallel
    const [s1Result, s2Result, s4Result, s3Result, eurResult] = await Promise.allSettled([
      withTimeout(computeS1(env),      30000),  // includes tomorrow fetch (+2 ENTSO-E calls)
      withTimeout(computeS2(),         45000),  // BTD API + Litgrid scrape
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
      await env.KKME_SIGNALS.put(`raw:s1:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      console.log(`[S1] ${d.state} spread=${d.spread_eur_mwh}€/MWh swing=${d.lt_daily_swing_eur_mwh}€/MWh sep=${d.separation_pct}% rsi_30d=${d.rsi_30d}`);

      // S1 capture: DA gross capture from energy-charts.info
      try {
        const cap = await withTimeout(computeCapture(env), 25000);
        // Merge capture summary into s1 KV for frontend consumption
        d.capture = {
          gross_2h: cap.capture_2h?.gross_eur_mwh ?? null,
          gross_4h: cap.capture_4h?.gross_eur_mwh ?? null,
          net_2h: cap.capture_2h?.net_eur_mwh ?? null,
          net_4h: cap.capture_4h?.net_eur_mwh ?? null,
          rolling_30d: cap.rolling_30d,
          shape_swing: cap.shape?.swing ?? null,
          source: 'energy-charts.info',
          data_class: 'derived',
        };
        await env.KKME_SIGNALS.put('s1', JSON.stringify(d));
        console.log(`[S1/capture] merged into s1 KV: 2h=${cap.capture_2h?.gross_eur_mwh ?? '—'}€ 4h=${cap.capture_4h?.gross_eur_mwh ?? '—'}€`);
      } catch (capErr) {
        console.error('[S1/capture] cron failed:', String(capErr));
      }
    } else {
      console.error('[S1] cron failed:', s1Result.reason);
    }

    if (s2Result.status === 'fulfilled') {
      const payload = s2Result.value;
      if (!payload) {
        console.log('[S2] BTD unavailable — keeping cached KV data (Mac cron pushes independently)');
      } else {
      const validation = await kvWrite(env.KKME_SIGNALS, 's2', payload, {
        required: ['fcr_avg', 'afrr_up_avg', 'mfrr_up_avg'],
        bounds_key: 's2',
      });
      if (!validation.success) {
        console.error(`[S2] KV write rejected: ${validation.errors.join(' | ')}`);
        await notifyTelegram(env, `⚠️ S2: KV write rejected (BTD data invalid) — ${validation.errors.join(' | ')}`).catch(() => {});
      } else {
        console.log(`[S2] fcr=${payload.fcr_avg} afrr_up=${payload.afrr_up_avg} ordered=${payload.ordered_price ?? '—'}`);
        await appendSignalHistory(env, 's2', { afrr_up: payload.afrr_up_avg, mfrr_up: payload.mfrr_up_avg, fcr: payload.fcr_avg }).catch(e => console.error('[S2/history]', e));

        // Accumulate daily BTD capacity prices for trailing 12-month analysis
        try {
          const histRaw = await env.KKME_SIGNALS.get('s2_btd_history').catch(() => null);
          const hist = histRaw ? JSON.parse(histRaw) : [];
          const today = new Date().toISOString().slice(0, 10);
          if (!hist.some(h => h.date === today)) {
            hist.push({
              date: today,
              fcr: payload.fcr_avg,
              afrr_up: payload.afrr_up_avg,
              mfrr_up: payload.mfrr_up_avg,
            });
          }
          const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
          const trimmed = hist.filter(h => h.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
          await env.KKME_SIGNALS.put('s2_btd_history', JSON.stringify(trimmed));
          console.log(`[S2/btd-history] ${trimmed.length} days`);
        } catch (e) {
          console.error('[S2/btd-history]', String(e));
        }
      }
      } // end else (!payload)
    } else {
      console.error('[S2] cron failed:', s2Result.reason);
    }

    if (s4Result.status === 'fulfilled') {
      const d = s4Result.value;
      await env.KKME_SIGNALS.put('s4', JSON.stringify(d));
      console.log(`[S4] ${d.signal} free=${d.free_mw}MW utilisation=${d.utilisation_pct}%`);
      await appendSignalHistory(env, 's4', { free_mw: d.free_mw }).catch(e => console.error('[S4/history]', e));
    } else {
      console.error('[S4] cron failed:', s4Result.reason);
    }

    // Sync Litgrid Layer 3 Kaupikliai projects into fleet KV
    try {
      const sync = await withTimeout(syncLitgridFleet(env), 20000);
      console.log(`[S4/layer3] synced ${sync.synced} Kaupikliai projects, total fleet=${sync.total}, sd_ratio=${sync.sd_ratio}`);
    } catch (e) {
      console.error('[S4/layer3] cron failed:', String(e));
    }

    // Write s3 first, then merge euribor in a second write if both succeed
    if (s3Result.status === 'fulfilled') {
      const d = s3Result.value;
      await env.KKME_SIGNALS.put('s3', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s3:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      if (d.unavailable) {
        console.error(`[S3] scrape failed: ${d._scrape_error}`);
      } else {
        console.log(`[S3] ${d.signal} lithium=€${d.lithium_eur_t}/t trend=${d.lithium_trend} cell=${d.cell_eur_kwh ?? '—'} €/kWh`);
        // Track S3 freshness
        await updateS3Freshness(env.KKME_SIGNALS, 'lithium_proxy', { confidence: 'proxy' }).catch(() => {});
        await updateS3Freshness(env.KKME_SIGNALS, 'fx').catch(() => {});
      }
    } else {
      console.error('[S3] cron failed:', s3Result.reason);
    }

    if (eurResult.status === 'fulfilled') {
      const eur = eurResult.value;
      await env.KKME_SIGNALS.put('euribor', JSON.stringify(eur));
      console.log(`[Euribor] ${eur.euribor_3m}% trend=${eur.euribor_trend}`);
      // Track euribor freshness
      await updateS3Freshness(env.KKME_SIGNALS, 'ecb_euribor').catch(() => {});
      if (eur.hicp_yoy != null) await updateS3Freshness(env.KKME_SIGNALS, 'ecb_hicp').catch(() => {});
      // Merge euribor into s3 KV if s3 also succeeded
      if (s3Result.status === 'fulfilled') {
        const merged = { ...s3Result.value, euribor_3m: eur.euribor_3m, euribor_trend: eur.euribor_trend };
        await env.KKME_SIGNALS.put('s3', JSON.stringify(merged));
        await appendSignalHistory(env, 's3', { equip_eur_kwh: merged.europe_system_eur_kwh }).catch(e => console.error('[S3/history]', e));
      }
    } else {
      console.error('[Euribor] cron failed:', eurResult.reason);
    }

    // S5 — DC Power Viability (reads fresh S4 from KV + DC news RSS)
    const s5Data = await computeS5(env).catch(e => { console.error('[S5] cron:', String(e)); return null; });
    if (s5Data) {
      await env.KKME_SIGNALS.put('s5', JSON.stringify(s5Data));
      console.log(`[S5] ${s5Data.signal} free=${s5Data.grid_free_mw}MW news=${s5Data.news_items.length}`);
    }

    // S6-S9 + Baltic generation + genload — Context signals (best-effort, run in parallel)
    const [s6Res, s7Res, s8Res, s9Res, genRes, genloadRes] = await Promise.allSettled([
      withTimeout(fetchNordicHydro(),           20000),
      withTimeout(fetchTTFGas(),                20000),
      withTimeout(fetchInterconnectorFlows(), 30000),
      withTimeout(fetchEUCarbon(),              20000),
      withTimeout(fetchBalticGeneration(),      25000),
      withTimeout(fetchGenLoad(env.ENTSOE_API_KEY), 30000),
    ]);

    if (s6Res.status === 'fulfilled') {
      const d = s6Res.value;
      await env.KKME_SIGNALS.put('s6', JSON.stringify(d));
      console.log(`[S6] ${d.signal} fill=${d.fill_pct}% dev=${d.deviation_pp}pp week=${d.week}`);
      await appendSignalHistory(env, 's6', { fill_pct: d.fill_pct, deviation_pp: d.deviation_pp }).catch(e => console.error('[S6/history]', e));
    } else {
      console.error('[S6] cron failed:', s6Res.reason);
    }

    if (s7Res.status === 'fulfilled') {
      const d = s7Res.value;
      await env.KKME_SIGNALS.put('s7', JSON.stringify(d));
      await env.KKME_SIGNALS.put(`raw:s7:${new Date().toISOString().slice(0,10)}`, JSON.stringify({ fetched: new Date().toISOString(), data: d }), { expirationTtl: 604800 });
      console.log(`[S7] ${d.signal} ttf=${d.ttf_eur_mwh}€/MWh trend=${d.ttf_trend}`);
      await appendSignalHistory(env, 's7', { ttf_eur_mwh: d.ttf_eur_mwh }).catch(e => console.error('[S7/history]', e));
    } else {
      console.error('[S7] cron failed:', s7Res.reason);
    }

    if (s8Res.status === 'fulfilled') {
      const d = s8Res.value;
      await env.KKME_SIGNALS.put('s8', JSON.stringify(d));
      console.log(`[S8] ${d.signal} nordbalt=${d.nordbalt_avg_mw}MW litpol=${d.litpol_avg_mw}MW`);
    } else {
      console.error('[S8] cron failed:', s8Res.reason);
    }

    if (s9Res.status === 'fulfilled') {
      const d = s9Res.value;
      await env.KKME_SIGNALS.put('s9', JSON.stringify(d));
      console.log(`[S9] ${d.signal} eua=${d.eua_eur_t}€/t trend=${d.eua_trend}`);
      await appendSignalHistory(env, 's9', { eua_eur_t: d.eua_eur_t }).catch(e => console.error('[S9/history]', e));
    } else {
      console.error('[S9] cron failed:', s9Res.reason);
    }

    // Baltic generation (wind + solar + load) — writes 3 KV keys
    if (genRes.status === 'fulfilled') {
      const { wind, solar, load } = genRes.value;
      await Promise.all([
        env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
        env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
        env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
      ]);
      console.log(`[Gen] wind=${wind.baltic_mw}MW solar=${solar.baltic_mw}MW load=${load.baltic_mw}MW [${wind.coverage_countries}]`);
    } else {
      console.error('[Gen] cron failed:', genRes.reason);
    }

    // Genload (ENTSO-E A75+A65 per Baltic country)
    if (genloadRes.status === 'fulfilled') {
      const d = genloadRes.value;
      await env.KKME_SIGNALS.put('genload', JSON.stringify(d));
      console.log(`[Genload] lt=${d.lt?.generation_mw}/${d.lt?.load_mw} lv=${d.lv?.generation_mw}/${d.lv?.load_mw} ee=${d.ee?.generation_mw}/${d.ee?.load_mw}`);
    } else {
      console.error('[Genload] cron failed:', genloadRes.reason);
    }

    // da_tomorrow is embedded in computeS1() and stored in the s1 KV key

    // ── Weekly S3 enrichment (Sunday 06:00-10:00 UTC) ──
    const nowUTC = new Date();
    if (nowUTC.getUTCDay() === 0 && nowUTC.getUTCHours() >= 6 && nowUTC.getUTCHours() < 10) {
      const freshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
      const lastEnrich = freshness.enrichment?.last_update;
      const hoursSince = lastEnrich ? (Date.now() - new Date(lastEnrich).getTime()) / 3600000 : 999;
      if (hoursSince > 160) { // ~6.7 days
        console.log('[S3/enrichment] Running weekly enrichment...');
        await enrichS3(env).catch(e => console.error('[S3/enrichment] failed:', e));
      }
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: CORS });
    }

    // ── POST /telegram/webhook ───────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      let body;
      try { body = await request.json(); } catch { return new Response('ok', { headers: CORS }); }

      const msg = body?.message;
      if (!msg) return new Response('ok', { headers: CORS });

      const chatId     = String(msg.chat?.id ?? '');
      const ownChatId  = env.TELEGRAM_CHAT_ID;
      if (!ownChatId || chatId !== String(ownChatId)) return new Response('ok', { headers: CORS });

      const text  = msg.text ?? '';
      const lower = text.toLowerCase().trim();

      // ── Commands ─────────────────────────────────────────────────────────
      if (lower === '/status' || lower === '/status@gattana_bot') {
        const keys = ['s1', 's2', 's3', 's4'];
        const statLines = ['KKME Status (all Workers cron):'];
        for (const k of keys) {
          const raw = await env.KKME_SIGNALS.get(k).catch(() => null);
          if (!raw) { statLines.push(`${k.toUpperCase()}: no data`); continue; }
          try {
            const d = JSON.parse(raw);
            const ts = d.timestamp ?? d._meta?.written_at ?? d.updated_at;
            const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : null;
            const threshold = STALE_THRESHOLDS_HOURS[k] ?? 48;
            const stale = ageH !== null && ageH > threshold;
            const age = ageH !== null ? ageH.toFixed(1) : '?';
            statLines.push(`${k.toUpperCase()}: ${age}h old${stale ? ' ⚠️ STALE' : ''}`);
          } catch { statLines.push(`${k.toUpperCase()}: parse error`); }
        }
        // s4_pipeline (VERT.lt monthly — still local, acceptable staleness)
        const pipeRaw = await env.KKME_SIGNALS.get('s4_pipeline').catch(() => null);
        if (pipeRaw) {
          try {
            const d = JSON.parse(pipeRaw);
            const ts = d.timestamp ?? d.updated_at;
            const age = ts ? ((Date.now() - new Date(ts).getTime()) / 3600000).toFixed(0) : '?';
            statLines.push(`S4_PIPELINE: ${age}h old (monthly/local)`);
          } catch { /* ignore */ }
        }
        await sendTelegramReply(env, chatId, statLines.join('\n'));
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/validate' || lower === '/validate@gattana_bot') {
        const s4raw = await env.KKME_SIGNALS.get('s4').catch(() => null);
        const s4d   = s4raw ? JSON.parse(s4raw).pipeline ?? {} : {};
        const lines = ['Validation:'];
        lines.push(`S4 parse_warning: ${s4d.parse_warning ?? 'none'}`);
        lines.push(`S4 dev_total_mw: ${s4d.dev_total_mw ?? '—'}`);
        await sendTelegramReply(env, chatId, lines.join('\n'));
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/help' || lower === '/help@gattana_bot') {
        await sendTelegramReply(env, chatId,
          '/status — signal ages\n' +
          '/validate — S4 pipeline check\n' +
          '/done — save current session to Intel Feed\n' +
          '/cancel — discard current session\n' +
          '/tag <company> — add company to session\n' +
          'Send any URL or text to start/extend a feed session (auto-saved in 30 min)');
        return new Response('ok', { headers: CORS });
      }

      // ── Session commands ──────────────────────────────────────────────────
      if (lower === '/done' || lower === '/done@gattana_bot') {
        const item = await finalizeFeedSession(env.KKME_SIGNALS, env);
        if (!item) {
          await sendTelegramReply(env, chatId, 'No active session. Send a URL or text first.');
        } else {
          const cos = item.companies?.length ? `\n🏷 ${item.companies.join(', ')}` : '';
          await sendTelegramReply(env, chatId, `✅ Saved [${item.topic}] ${(item.title ?? '').slice(0, 50)}${cos}\nID ${item.id.slice(-6)}`);
        }
        return new Response('ok', { headers: CORS });
      }

      if (lower === '/cancel' || lower === '/cancel@gattana_bot') {
        await env.KKME_SIGNALS.delete(SESSION_KEY).catch(() => {});
        await sendTelegramReply(env, chatId, '🗑 Session discarded.');
        return new Response('ok', { headers: CORS });
      }

      if (lower.startsWith('/tag ')) {
        const company = text.slice(5).trim();
        const raw     = await env.KKME_SIGNALS.get(SESSION_KEY).catch(() => null);
        if (!raw) {
          await sendTelegramReply(env, chatId, 'No active session to tag.');
        } else {
          const session = JSON.parse(raw);
          session.companies = [...new Set([...session.companies, company])];
          await env.KKME_SIGNALS.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
          await sendTelegramReply(env, chatId, `🏷 Tagged: ${company}. Companies: ${session.companies.join(', ')}`);
        }
        return new Response('ok', { headers: CORS });
      }

      // ── Filter unrecognised bot commands ──────────────────────────────────
      if (/^\/\w+/.test(text)) {
        await sendTelegramReply(env, chatId, 'Unknown command. Use /done to save, /cancel to discard, /tag <company> to tag.');
        return new Response('ok', { headers: CORS });
      }

      // Filter empty / too-short messages
      if (text.trim().length < 20) {
        await sendTelegramReply(env, chatId, '⚠ Message too short (min 20 chars). Send a URL or a brief description.');
        return new Response('ok', { headers: CORS });
      }

      // ── URL or text → Session-based Intel Feed intake ─────────────────────
      const existingSession = await env.KKME_SIGNALS.get(SESSION_KEY).catch(() => null);

      if (!existingSession) {
        // Open new session
        const session = await openFeedSession(env.KKME_SIGNALS, chatId, text);
        const cos = session.companies.length ? `\n🏷 ${session.companies.join(', ')}` : '';
        await sendTelegramReply(env, chatId, `📝 Session open [${session.topic}]${cos}\nSend more, /done to save, /cancel to discard. (30 min auto-expire)`);
      } else {
        // Append to existing session
        const session = await appendToSession(env.KKME_SIGNALS, text);
        if (!session) {
          // Race condition — session expired between the get and append
          await openFeedSession(env.KKME_SIGNALS, chatId, text);
          await sendTelegramReply(env, chatId, `📝 New session started [${classifyTopic(text)}]. Previous session expired.`);
        } else {
          const cos = session.companies.length ? `\n🏷 ${session.companies.join(', ')}` : '';
          await sendTelegramReply(env, chatId, `➕ Added (${session.messages.length} msgs) [${session.topic}]${cos}`);
        }
      }
      return new Response('ok', { headers: CORS });
    }

    // ── GET /telegram/test ───────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/telegram/test') {
      await notifyTelegram(env, 'KKME: Telegram connected ✓');
      return Response.json({ sent: true }, { headers: CORS });
    }

    // ── GET /feed ────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/feed') {
      const category = url.searchParams.get('category');
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      // Quality + expiry filters
      idx = idx.filter(isValidFeedItem);
      const now = new Date().toISOString();
      idx = idx.filter(i => !i.expires_at || i.expires_at > now);
      if (category && category !== 'all') idx = idx.filter(i => i.category === category);
      // Sort by feed_score desc, then date
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0) || (b.published_at ?? '').localeCompare(a.published_at ?? ''));
      const items = idx.slice(0, 50);
      const categories = [...new Set(idx.map(i => i.category).filter(Boolean))];
      return Response.json({ items, total: idx.length, categories }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    // ── POST /feed/events — accept typed event items ─────────────────────────
    if (request.method === 'POST' && url.pathname === '/feed/events') {
      let body;
      try { body = await request.json(); } catch {
        return jsonResp({ error: 'Invalid JSON body' }, 400);
      }
      const items = Array.isArray(body) ? body : body.items || [body];
      if (!items.length) return jsonResp({ error: 'No items provided' }, 400);

      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      const existingUrls = new Set(idx.map(i => i.source_url || i.url).filter(Boolean));
      const existingTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));

      let added = 0;
      for (const item of items) {
        if (!item.title || !item.consequence) continue;
        // Deduplicate by URL or exact title match
        if (item.source_url && existingUrls.has(item.source_url)) continue;
        if (existingTitles.has((item.title || '').toLowerCase().trim())) continue;

        const EXPIRY_DAYS = { commodity_cost: 30, project_stage: 180, market_design: 180, policy: 180 };
        const pubDate = item.published_at || new Date().toISOString();
        const expiryDays = EXPIRY_DAYS[item.category] || 60;
        const expiresAt = item.expires_at || new Date(new Date(pubDate).getTime() + expiryDays * 86400000).toISOString();

        idx.push({
          id: item.event_id || makeId(),
          title: item.title,
          consequence: item.consequence,
          event_type: item.event_type || null,
          category: item.category || 'policy',
          geography: item.geography || 'Baltic',
          published_at: pubDate,
          source: item.source || '',
          source_url: item.source_url || null,
          source_quality: item.source_quality || 'trade_press',
          confidence: item.confidence || 'C',
          horizon: item.horizon || 'near_term',
          impact_direction: item.impact_direction || null,
          affected_modules: item.affected_modules || [],
          affected_cod_windows: item.affected_cod_windows || [],
          feed_score: typeof item.feed_score === 'number' ? item.feed_score : 0.5,
          expires_at: expiresAt,
          status: item.status || 'published',
        });
        existingUrls.add(item.source_url);
        existingTitles.add((item.title || '').toLowerCase().trim());
        added++;
      }

      // Sort by feed_score descending
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      // Cap at 100 items
      if (idx.length > 100) idx = idx.slice(0, 100);

      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(idx));
      return jsonResp({ ok: true, added, total: idx.length });
    }

    // ── POST /feed/backfill-curations — one-time migration: write-time merge ─
    if (request.method === 'POST' && url.pathname === '/feed/backfill-curations') {
      const ids = await readIndex(env.KKME_SIGNALS);
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      const idx = rawIdx ? JSON.parse(rawIdx) : [];
      const seenUrls = new Set(idx.map(i => i.source_url).filter(Boolean));
      const seenTitles = new Set(idx.map(i => (i.title || '').toLowerCase().trim()));
      let backfilled = 0;
      for (const id of ids) {
        const raw = await env.KKME_SIGNALS.get(`${KV_CURATION_PREFIX}${id}`);
        if (!raw) continue;
        let entry;
        try { entry = JSON.parse(raw); } catch { continue; }
        const item = projectCurationToFeedItem(entry);
        if (!item) continue;
        if (item.source_url && seenUrls.has(item.source_url)) continue;
        if (seenTitles.has((item.title || '').toLowerCase().trim())) continue;
        idx.push(item);
        seenUrls.add(item.source_url);
        seenTitles.add((item.title || '').toLowerCase().trim());
        backfilled++;
      }
      idx.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      if (idx.length > 1000) idx.length = 1000;
      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(idx));
      return jsonResp({ backfilled, total: idx.length });
    }

    // ── POST /feed/clean — remove expired/old + low-quality items ───────────
    if (request.method === 'POST' && url.pathname === '/feed/clean') {
      let body = {};
      try { body = await request.json(); } catch { /* empty body ok */ }
      const cutoffDate = body.before || new Date(Date.now() - 60 * 86400000).toISOString();
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      if (!rawIdx) return jsonResp({ cleaned: 0, remaining: 0 });
      const idx = JSON.parse(rawIdx);
      const kept = idx.filter(i => {
        if (!isValidFeedItem(i)) return false;
        const d = i.published_at || i.date || i.added_at || '';
        return d >= cutoffDate;
      });
      const cleaned = idx.length - kept.length;
      await env.KKME_SIGNALS.put('feed_index', JSON.stringify(kept));
      return jsonResp({ cleaned, remaining: kept.length });
    }

    // ── GET /feed/by-signal?signal=S2 — filter feed by affected module ─────
    if (request.method === 'GET' && url.pathname === '/feed/by-signal') {
      const signal = url.searchParams.get('signal');
      if (!signal) return jsonResp({ error: 'signal parameter required' }, 400);
      const rawIdx = await env.KKME_SIGNALS.get('feed_index').catch(() => null);
      let idx = rawIdx ? JSON.parse(rawIdx) : [];
      const now = new Date().toISOString();
      idx = idx.filter(i => !i.expires_at || i.expires_at > now);
      const sigUpper = signal.toUpperCase();
      const matched = idx.filter(i =>
        Array.isArray(i.affected_modules) &&
        i.affected_modules.some(m => m.toUpperCase() === sigUpper)
      );
      matched.sort((a, b) => (b.feed_score ?? 0) - (a.feed_score ?? 0));
      return Response.json({ items: matched.slice(0, 10), total: matched.length, signal }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    // ── GET /feed/:id ────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname.startsWith('/feed/')) {
      const id  = url.pathname.slice(6);
      const raw = await env.KKME_SIGNALS.get(`feed_${id}`).catch(() => null);
      if (!raw) return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
      return Response.json(JSON.parse(raw), { headers: CORS });
    }

    // ── POST /s2/fleet OR /s4/fleet — fleet data (migrating from S2 to S4) ──
    // Replace the full fleet dataset. Body: { entries: [...], demand: { eff_demand_mw } }
    if (request.method === 'POST' && (url.pathname === '/s2/fleet' || url.pathname === '/s4/fleet')) {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const { entries, demand } = body;
      if (!Array.isArray(entries) || entries.length === 0) return jsonResp({ error: 'entries array required' }, 400);
      const fleet = processFleet(entries, demand ?? null);
      fleet.raw_entries = entries;
      fleet.demand      = demand ?? { eff_demand_mw: 935 };
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),  // backward compat
      ]);
      console.log(`[S4/fleet] seeded n=${entries.length} sd_ratio=${fleet.sd_ratio} phase=${fleet.phase}`);
      return jsonResp({ ok: true, sd_ratio: fleet.sd_ratio, phase: fleet.phase, n: entries.length });
    }

    // ── POST /s2/fleet/entry OR /s4/fleet/entry — single entry upsert ──
    if (request.method === 'POST' && (url.pathname === '/s2/fleet/entry' || url.pathname === '/s4/fleet/entry')) {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!body.name || !body.mw || !body.status) return jsonResp({ error: 'name, mw, status required' }, 400);
      const raw     = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
                   || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      const current = raw ? JSON.parse(raw) : { raw_entries: [], demand: { eff_demand_mw: 935 } };
      const entries = current.raw_entries ?? [];
      const idx     = entries.findIndex(e => e.name === body.name);
      if (idx >= 0) entries[idx] = body; else entries.push(body);
      const fleet = processFleet(entries, current.demand);
      fleet.raw_entries = entries;
      fleet.demand      = current.demand;
      const json = JSON.stringify(fleet);
      await Promise.all([
        env.KKME_SIGNALS.put('s4_fleet', json),
        env.KKME_SIGNALS.put('s2_fleet', json),  // backward compat
      ]);
      return jsonResp({ ok: true, sd_ratio: fleet.sd_ratio, phase: fleet.phase, n: entries.length });
    }

    // ── GET /s2/fleet OR /s4/fleet — fleet data ──
    if (request.method === 'GET' && (url.pathname === '/s2/fleet' || url.pathname === '/s4/fleet')) {
      const raw = (await env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
              || (await env.KKME_SIGNALS.get('s2_fleet').catch(() => null));
      if (!raw) return jsonResp({ error: 'no fleet data yet' }, 404);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
    }

    // ── POST /s4/migrate-fleet — one-time migration from s2_fleet → s4_fleet ──
    if (request.method === 'POST' && url.pathname === '/s4/migrate-fleet') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      const s2f = await env.KKME_SIGNALS.get('s2_fleet').catch(() => null);
      if (s2f) {
        await env.KKME_SIGNALS.put('s4_fleet', s2f);
        return jsonResp({ status: 'migrated', bytes: s2f.length });
      }
      return jsonResp({ status: 'no s2_fleet data to migrate' });
    }

    // ── POST /s2/activation ─────────────────────────────────────────────────
    // Store Baltic activation clearing-price dataset (from BTD transparency dashboard).
    if (request.method === 'POST' && url.pathname === '/s2/activation') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      if (!body.countries) return jsonResp({ error: 'countries object required' }, 400);
      body.stored_at = new Date().toISOString();
      await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(body));
      const countryKeys = Object.keys(body.countries);
      console.log(`[S2/activation] stored ${countryKeys.length} countries: ${countryKeys.join(', ')}`);
      return jsonResp({ ok: true, countries: countryKeys, stored_at: body.stored_at });
    }

    // ── POST /admin/trigger-activation — manually trigger activation update ──
    if (request.method === 'POST' && url.pathname === '/admin/trigger-activation') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      const payload = await computeS2Activation();
      if (!payload) return jsonResp({ error: 'BTD unavailable' }, 502);
      await env.KKME_SIGNALS.put('s2_activation', JSON.stringify(payload));
      return jsonResp({ ok: true, period: payload.period, lt_afrr_3m_p50: payload.countries?.Lithuania?.afrr_recent_3m?.avg_p50 });
    }

    // ── POST /admin/trigger-s1-capture — force recompute S1 capture ──
    if (request.method === 'POST' && url.pathname === '/admin/trigger-s1-capture') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      const cap = await computeCapture(env);
      if (!cap) return jsonResp({ error: 'computeCapture returned null' }, 502);
      return jsonResp({ ok: true, gross_2h: cap.gross_2h, gross_4h: cap.gross_4h, net_2h: cap.net_2h, net_4h: cap.net_4h, date: cap.date });
    }

    // ── POST /admin/backfill-s1-history — patch gross_2h/4h from capture history ──
    if (request.method === 'POST' && url.pathname === '/admin/backfill-s1-history') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);

      const capHistRaw = await env.KKME_SIGNALS.get('s1_capture_history').catch(() => null);
      const s1HistRaw = await env.KKME_SIGNALS.get('s1_history').catch(() => null);
      if (!capHistRaw || !s1HistRaw) return jsonResp({ error: 'Missing KV data' }, 404);

      const capHist = JSON.parse(capHistRaw); // [{date, gross_2h, gross_4h, ...}, ...]
      const s1Hist = JSON.parse(s1HistRaw);   // [{date, spread_eur, ..., gross_2h: null}, ...]

      // Build lookup from capture history
      const capByDate = {};
      for (const row of capHist) {
        if (row.date) capByDate[row.date] = row;
      }

      let patched = 0;
      for (const entry of s1Hist) {
        if (entry.gross_2h != null && entry.gross_4h != null) continue; // already populated
        const cap = capByDate[entry.date];
        if (!cap) continue;
        entry.gross_2h = cap.gross_2h ?? cap.capture_2h?.gross_eur_mwh ?? null;
        entry.gross_4h = cap.gross_4h ?? cap.capture_4h?.gross_eur_mwh ?? null;
        if (entry.gross_2h != null) patched++;
      }

      await env.KKME_SIGNALS.put('s1_history', JSON.stringify(s1Hist));
      return jsonResp({ ok: true, patched, total: s1Hist.length });
    }

    // ── GET /s2/activation ──────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s2/activation') {
      const raw = await env.KKME_SIGNALS.get('s2_activation').catch(() => null);
      if (!raw) return jsonResp({ error: 'no activation data yet' }, 404);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
    }

    // ── GET /health/validate ── Full data integrity check
    if (request.method === 'GET' && url.pathname === '/health/validate') {
      const errors = [];
      const warnings = [];
      const checks = [];
      const [s1Raw, s2Raw, fleetRaw, actRaw, capRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1').catch(() => null),
        env.KKME_SIGNALS.get('s2').catch(() => null),
        (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
          .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
        env.KKME_SIGNALS.get('s2_activation').catch(() => null),
        env.KKME_SIGNALS.get('s1_capture').catch(() => null),
      ]);
      const s1 = s1Raw ? JSON.parse(s1Raw) : null;
      const s2 = s2Raw ? JSON.parse(s2Raw) : null;
      const fleet = fleetRaw ? JSON.parse(fleetRaw) : null;
      const act = actRaw ? JSON.parse(actRaw) : null;
      const cap = capRaw ? JSON.parse(capRaw) : null;
      if (!s1) { errors.push('S1: no data'); } else {
        const age = (Date.now() - new Date(s1.updated_at).getTime()) / 3600000;
        if (age > 8) warnings.push('S1: ' + Math.round(age) + 'h old');
        checks.push({ check: 'S1', pass: true, age_h: Math.round(age) });
      }
      if (!s2) { errors.push('S2: no data'); } else {
        checks.push({ check: 'S2', pass: true });
      }
      if (!fleet) { errors.push('Fleet: no data'); } else {
        const traj = fleet.trajectory || [];
        const matureCpis = traj.filter(t => t.phase === 'MATURE').map(t => t.cpi);
        const allSame = matureCpis.length > 1 && matureCpis.every(c => c === matureCpis[0]);
        if (allSame) errors.push('Fleet: ALL mature CPI identical (' + matureCpis[0] + ')');
        checks.push({ check: 'CPI differentiation', pass: !allSame, values: matureCpis });
        const psd = fleet.product_sd;
        if (psd) {
          for (const p of ['fcr', 'afrr', 'mfrr']) {
            if (psd[p]?.ratio == null) errors.push('Fleet: product_sd.' + p + '.ratio is null');
          }
          checks.push({ check: 'Product S/D', pass: psd.fcr?.ratio != null });
        }
      }
      if (!act) { warnings.push('Activation: no data'); } else {
        const p50 = act.countries?.Lithuania?.afrr_recent_3m?.avg_p50;
        if (p50 == null) errors.push('Activation: LT aFRR P50 null');
        checks.push({ check: 'Activation', pass: p50 != null, value: p50 });
      }
      if (!cap) { warnings.push('S1 capture: no data'); } else {
        const mean2h = cap.rolling_30d?.stats_2h?.mean;
        checks.push({ check: 'S1 capture', pass: mean2h != null && mean2h > 0, value: mean2h });
      }
      return jsonResp({ status: errors.length === 0 ? 'PASS' : 'FAIL', errors, warnings, checks, timestamp: new Date().toISOString() });
    }

    // ── GET /s2 ──────────────────────────────────────────────────────────────
    // Merges BTD capacity data + fleet S/D ratio data + activation clearing prices.
    if (request.method === 'GET' && url.pathname === '/s2') {
      try {
        const [cached, activationRaw, btdHistRaw, extremeRaw, rolling180dRaw] = await Promise.all([
          env.KKME_SIGNALS.get('s2'),
          env.KKME_SIGNALS.get('s2_activation').catch(() => null),
          env.KKME_SIGNALS.get('s2_btd_history').catch(() => null),
          env.KKME_SIGNALS.get('extreme:latest').catch(() => null),
          env.KKME_SIGNALS.get('s2_rolling_180d').catch(() => null),
        ]);
        const base = cached
          ? JSON.parse(cached)
          : { ...DEFAULTS.s2, unavailable: true, _serving: 'static_defaults' };
        // Fleet data stripped from /s2 — now served via /s4
        // Balancing demand context (kept for S2 card):
        base.demand_mw       = 752;
        base.afrr_demand_mw  = 120;
        base.mfrr_demand_mw  = 604;
        base.fcr_demand_mw   = 28;
        if (activationRaw) {
          try {
            const act = JSON.parse(activationRaw);
            const lt = act.countries?.Lithuania;
            const lv = act.countries?.Latvia;
            const ee = act.countries?.Estonia;
            base.activation = {
              lt: {
                afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: lt?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: lt?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              lv: {
                afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: lv?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: lv?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: lv?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              ee: {
                afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
                afrr_rate: ee?.afrr_recent_3m?.avg_activation_rate ?? null,
                mfrr_p50: ee?.mfrr_recent_3m?.avg_p50 ?? null,
                mfrr_rate: ee?.mfrr_recent_3m?.avg_activation_rate ?? null,
              },
              compression: act.compression_trajectory ?? null,
              lt_monthly_afrr: lt?.afrr_up ?? null,
              lt_monthly_mfrr: lt?.mfrr_up ?? null,
              lv_monthly_afrr: lv?.afrr_up ?? null,
              lv_monthly_mfrr: lv?.mfrr_up ?? null,
              ee_monthly_afrr: ee?.afrr_up ?? null,
              ee_monthly_mfrr: ee?.mfrr_up ?? null,
              data_class: 'observed',
              period: act.period,
              source: act.source,
              stored_at: act.stored_at,
            };
          } catch (e) {
            console.error('[S2/activation merge]', String(e));
          }
        }
        if (btdHistRaw) {
          try {
            base.capacity_monthly = computeCapacityMonthly(JSON.parse(btdHistRaw));
          } catch (e) {
            console.error('[S2/capacity_monthly]', String(e));
          }
        }
        // Attach rolling 180-day stats
        if (rolling180dRaw) {
          try { base.rolling_180d = JSON.parse(rolling180dRaw); } catch { /* ignore */ }
        }
        // Attach extreme event only if from today
        if (extremeRaw) {
          try {
            const evt = JSON.parse(extremeRaw);
            const todayStr = new Date().toISOString().slice(0, 10);
            if (evt.date === todayStr) {
              base.extreme_event = evt;
            }
          } catch { /* ignore */ }
        }
        return new Response(JSON.stringify(base), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS },
        });
      } catch (e) {
        console.error('/s2 handler error:', e);
        return Response.json({
          ...DEFAULTS.s2,
          _serving: 'static_defaults',
          unavailable: true,
          _error: e.message,
        }, { headers: CORS });
      }
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
      await appendSignalHistory(env, 's2', { afrr_up: payload.afrr_up_avg, mfrr_up: payload.mfrr_up_avg, fcr: payload.fcr_avg }).catch(e => console.error('[S2/history]', e));
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /api/model-inputs ─────────────────────────────────────────────────
    // Aggregated signal snapshot for analyst/model use.
    if (request.method === 'GET' && url.pathname === '/api/model-inputs') {
      const [s1r, s2r, s3r, s4r, eurR, fleetR] = await Promise.allSettled([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s2'),
        env.KKME_SIGNALS.get('s3'),
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('euribor'),
        env.KKME_SIGNALS.get('s4_fleet').catch(() => env.KKME_SIGNALS.get('s2_fleet')),
      ]);
      const parse = r => (r.status === 'fulfilled' && r.value) ? JSON.parse(r.value) : null;
      const s1 = parse(s1r), s2 = parse(s2r), s3 = parse(s3r), s4 = parse(s4r);
      const eur = parse(eurR), fleet = parse(fleetR);
      return Response.json({
        as_of:                 new Date().toISOString(),
        spread_eur_mwh:        s1?.spread_eur_mwh        ?? null,
        afrr_up_avg:           s2?.afrr_up_avg           ?? null,
        mfrr_up_avg:           s2?.mfrr_up_avg           ?? null,
        sd_ratio:              fleet?.sd_ratio           ?? null,
        phase:                 fleet?.phase              ?? null,
        cpi:                   fleet?.cpi               ?? null,
        lithium_eur_t:         s3?.lithium_eur_t         ?? null,
        cell_eur_kwh:          s3?.cell_eur_kwh          ?? null,
        euribor_nominal_3m:    eur?.euribor_nominal_3m   ?? null,
        euribor_real_3m:       eur?.euribor_real_3m      ?? null,
        grid_free_mw:          s4?.free_mw               ?? null,
        baltic_operational_mw: fleet?.baltic_operational_mw ?? null,
        baltic_pipeline_mw:    fleet?.baltic_pipeline_mw ?? null,
        eff_demand_mw:         fleet?.eff_demand_mw      ?? null,
      }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
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
      const projected = await appendCurationToFeedIndex(env.KKME_SIGNALS, entry);
      return new Response(JSON.stringify({ ok: true, id: entry.id, projected }), { status: 201, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── POST /contact ─────────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/contact') {
      let body;
      try { body = await request.json(); } catch {
        return jsonResp({ error: 'Invalid JSON' }, 400);
      }
      const { type, name, email, message, company, projectName, mwMwh, country, targetCod } = body;
      if (!name || !email || !message || !type) {
        return jsonResp({ error: 'Missing required fields: type, name, email, message' }, 400);
      }
      const entry = {
        id: makeId(), type, name, email, message,
        company: company || null, projectName: projectName || null,
        mwMwh: mwMwh || null, country: country || null, targetCod: targetCod || null,
        timestamp: new Date().toISOString(),
      };
      const raw = await env.KKME_SIGNALS.get('contact_submissions').catch(() => null);
      const submissions = raw ? JSON.parse(raw) : [];
      submissions.unshift(entry);
      if (submissions.length > 500) submissions.length = 500;
      await env.KKME_SIGNALS.put('contact_submissions', JSON.stringify(submissions));
      await notifyTelegram(env, `📩 New inquiry (${type})\n${name} · ${email}${company ? ` · ${company}` : ''}\n${message.slice(0, 200)}`).catch(() => {});

      // Send email via Resend (gracefully skips if key not configured)
      if (env.RESEND_API_KEY) {
        const typeLabel = { project: 'Project', investment: 'Investment / capital', market: 'Market discussion', other: 'Other' }[type] || type;
        const subject = `KKME Contact: ${typeLabel} — ${name}${company ? ` (${company})` : ''}`;
        let htmlBody = `<h2 style="margin:0 0 16px">${typeLabel} inquiry</h2>`;
        htmlBody += `<p><strong>Name:</strong> ${name}</p>`;
        htmlBody += `<p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>`;
        if (company) htmlBody += `<p><strong>Company:</strong> ${company}</p>`;
        if (projectName) htmlBody += `<p><strong>Project:</strong> ${projectName}</p>`;
        if (mwMwh) htmlBody += `<p><strong>MW/MWh:</strong> ${mwMwh}</p>`;
        if (country) htmlBody += `<p><strong>Country:</strong> ${country}</p>`;
        if (targetCod) htmlBody += `<p><strong>Target COD:</strong> ${targetCod}</p>`;
        htmlBody += `<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">`;
        htmlBody += `<p style="white-space:pre-wrap">${message}</p>`;
        htmlBody += `<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">`;
        htmlBody += `<p style="color:#888;font-size:12px">Sent via kkme.eu contact form · ${entry.timestamp}</p>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KKME Contact <contact@kkme.eu>',
            to: ['kastytis@kkme.eu'],
            reply_to: email,
            subject,
            html: htmlBody,
          }),
        }).catch(() => {});
      }

      return jsonResp({ ok: true });
    }

    // ── GET /contact ──────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/contact') {
      const secret = request.headers.get('X-Update-Secret');
      if (secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      const raw = await env.KKME_SIGNALS.get('contact_submissions').catch(() => null);
      return jsonResp(raw ? JSON.parse(raw) : []);
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

    // ── POST /s3/editorial — human-approved data overrides ──────────────────
    if (request.method === 'POST' && url.pathname === '/s3/editorial') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'invalid JSON' }, 400); }
      const existing = JSON.parse(await env.KKME_SIGNALS.get('s3_editorial').catch(() => '{}') || '{}');
      const notes = body._notes; delete body._notes;
      const updated = { ...existing, ...body, updated_at: new Date().toISOString() };
      await env.KKME_SIGNALS.put('s3_editorial', JSON.stringify(updated));

      // Snapshot baseline if cost ranges changed
      if (body.cost_profiles || body.lcos_reference) {
        const s3Live = JSON.parse(await env.KKME_SIGNALS.get('s3').catch(() => '{}') || '{}');
        const baseline = {
          set_at: new Date().toISOString(),
          lithium_reference_eur_t: s3Live.lithium_eur_t || null,
          euribor_reference_pct: s3Live.euribor_3m || null,
          capex_4h_range: (body.cost_profiles?.['4h'] || existing.cost_profiles?.['4h'])?.capex_range_kwh || null,
          notes: notes || 'Editorial update',
        };
        await env.KKME_SIGNALS.put('s3_baseline', JSON.stringify(baseline));
      }

      // Update freshness for changed fields
      const freshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
      Object.keys(body).forEach(key => {
        freshness[key] = { last_update: updated.updated_at, status: 'current', source: 'editorial' };
      });
      await env.KKME_SIGNALS.put('s3_freshness', JSON.stringify(freshness));

      return jsonResp({ success: true, updated_fields: Object.keys(body) });
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
            d.euribor_3m         = eur.euribor_3m         ?? null;
            d.euribor_nominal_3m = eur.euribor_nominal_3m ?? eur.euribor_3m ?? null;
            d.euribor_real_3m    = eur.euribor_real_3m    ?? null;
            d.hicp_yoy           = eur.hicp_yoy           ?? null;
            d.euribor_trend      = eur.euribor_trend      ?? null;
          }

          // ── S3 expanded: cost profiles, drivers, technology, transactions ──
          d.cost_profiles = {
            '2h': {
              capex_range_kwh: [230, 280], capex_range_kw: [460, 560],
              breakdown: {
                dc_block:    { range_kwh: [80, 110], mid_kwh: 95, label: 'DC block', scope: 'equipment-only' },
                pcs:         { range_kw: [35, 55], mid_kw: 45, label: 'PCS / inverter', scope: 'equipment-only' },
                bos_civil:   { range_kwh: [25, 45], mid_kwh: 35, label: 'BOS + civil', scope: 'installed excl. grid' },
                hv_grid:     { range_kwh: [12, 50], label: 'HV grid connection', scope: 'grid-scope-dependent' },
                soft_costs:  { range_kwh: [10, 22], mid_kwh: 15, label: 'EPC + perm. + contingency', scope: 'installed' },
              },
              reference_mid_kwh: 255,
              notes: '2h: PCS share higher per kWh. Grid scope drives most variance.',
            },
            '4h': {
              capex_range_kwh: [160, 210], capex_range_kw: [640, 840],
              breakdown: {
                dc_block:    { range_kwh: [70, 100], mid_kwh: 85, label: 'DC block', scope: 'equipment-only' },
                pcs:         { range_kw: [35, 55], mid_kw: 45, label: 'PCS / inverter', scope: 'equipment-only' },
                bos_civil:   { range_kwh: [22, 40], mid_kwh: 30, label: 'BOS + civil', scope: 'installed excl. grid' },
                hv_grid:     { range_kwh: [12, 50], label: 'HV grid connection', scope: 'grid-scope-dependent' },
                soft_costs:  { range_kwh: [8, 18], mid_kwh: 12, label: 'EPC + perm. + contingency', scope: 'installed' },
              },
              reference_mid_kwh: 192,
              notes: '4h: cell scale effects dominate. Energy block largest share.',
            },
          };
          d.grid_scope_classes = [
            { id: 'light', label: 'Light', description: 'Existing HV bay. MV switchgear only.', adder_kwh: [12, 18] },
            { id: 'heavy', label: 'Heavy', description: 'New substation bay + transformer + protection.', adder_kwh: [25, 40] },
          ];
          d.cost_drivers = [
            { driver: 'Battery hardware', direction: 'easing', symbol: '\u2193', magnitude: 'moderate', component: 'dc_block', detail: 'LFP cell prices declining ~15% YoY. China overcapacity. Not fully passing through to EU turnkey.' },
            { driver: 'Electrical / PCS', direction: 'constrained', symbol: '\u2192', magnitude: 'weak', component: 'pcs', detail: 'Grid-forming requirements adding compliance cost. Supply adequate.' },
            { driver: 'HV grid equipment', direction: 'constrained', symbol: '\u2191', magnitude: 'strong', component: 'hv_grid', detail: 'HV equipment lead times 10\u201316mo. Still the critical path for most projects. Prices elevated since 2021.' },
            { driver: 'Financing', direction: 'easing', symbol: '\u2193', magnitude: 'moderate', component: 'lcos', detail: 'Euribor falling from 2023 peak. Improves LCOS and project IRR.' },
          ];
          d.uncertainty = { range_pct: '\u00b115\u201330%', primary_driver: 'grid scope + project size', note: 'Grid scope is the single largest installed cost uncertainty in the Baltics.' };
          d.trend = { direction: 'easing', twelve_month: '\u2193 equipment \u00b7 \u2191 grid \u00b7 \u2193 financing', note: 'Equipment declining since 2023 peak. Grid + HV elevated.' };
          d.lcos_reference = {
            range_eur_mwh: [80, 130],
            assumptions: { cycles_per_year: [300, 365], rte_pct: [85, 88], wacc_pct: [6, 9], augmentation: 'Y8\u201312, 10\u201315% DC block cost' },
            note: 'Reference range. Full computation in Revenue Engine.',
          };
          d.technology = {
            chemistry: 'LFP', calendar_life_years: [15, 25], cycle_life: [6000, 10000],
            rte_percent: [85, 88], degradation_annual_pct: [0.4, 0.8], eol_capacity_pct: 70,
            augmentation: 'Y8\u201312. 10\u201315% of original DC block cost.',
            warranty_typical: '15yr to 70% SoH, cycling limits apply.',
            lifetime_throughput_gwh_per_mw: [12, 30],
            throughput_note: '1 cycle/day \u00d7 20yr \u00d7 4h \u2248 29 GWh/MW. Revenue potential and LCOS derive from this.',
            notes: 'LFP dominant for utility-scale stationary. Sodium-ion emerging, unproven at grid scale.',
          };
          d.transactions = [
            { project: 'Ignitis 3-site', country: 'LT', mw: 291, mwh: 582, eur_kwh_approx: 224, scope: 'all-in incl. substation', year: 2025, integrator: 'Rolls-Royce / Nidec', cost_driver: 'Scale advantage + full substation' },
            { project: 'AST Latvia', country: 'LV', mw: 80, mwh: 160, eur_kwh_approx: 490, scope: 'all-in incl. substation', year: 2025, integrator: null, cost_driver: 'TSO premium + smaller scale' },
            { project: 'Utilitas', country: 'EE', mw: 10, mwh: 20, eur_kwh_approx: 350, scope: 'partial', year: 2024, integrator: null, cost_driver: 'Small scale / pilot' },
          ];
          d.key_players = {
            cells_dc: [
              { name: 'CATL', hq: 'CN', positioning: 'Premium pricing, highest bankability' },
              { name: 'BYD', hq: 'CN', positioning: 'Vertically integrated, aggressive on price' },
              { name: 'EVE Energy', hq: 'CN', positioning: 'Mid-tier pricing, fast EU market entry' },
              { name: 'Hithium', hq: 'CN', positioning: 'Aggressive pricing, newer entrant' },
            ],
            pcs: [
              { name: 'Sungrow', hq: 'CN', positioning: 'Dominant EU utility PCS, cost-efficient' },
              { name: 'Huawei', hq: 'CN', positioning: 'Distributed string architecture' },
              { name: 'Power Electronics', hq: 'ES', positioning: 'European PCS, grid-forming capable, premium' },
            ],
            integrators: [
              { name: 'Rolls-Royce', hq: 'UK', positioning: 'Ignitis project. mtu EnergyPack. Premium reliability.' },
              { name: 'Fluence', hq: 'US', positioning: 'Gridstack. Siemens/AES JV. Strong bankability.' },
            ],
            hv_equipment: [
              { name: 'Hitachi Energy', hq: 'JP/CH', positioning: 'Major transformer supplier. Long lead times.' },
              { name: 'Siemens Energy', hq: 'DE', positioning: 'Blue GIS. European supply chain. Constrained.' },
            ],
          };
          // Default confidence (may be overridden by editorial or auto-downgraded)
          d.confidence = { level: 'benchmark-heavy', observed_share: 0.2, benchmark_share: 0.5, modeled_share: 0.3 };

          d.market_bands = {
            developer_optimized: { range_kwh: [120, 160], label: 'Developer-optimized', note: 'Strong sourcing, competitive procurement, experienced execution.' },
            eu_turnkey_typical: { range_kwh: [160, 220], label: 'EU turnkey typical', note: "Standard EPC, grid-heavy, mid-scale. This is the card's default range." },
            institutional_tso: { range_kwh: [220, 500], label: 'Institutional / TSO', note: 'Risk-heavy procurement, small scale, regulated overhead.' },
            observed_floor: 110, observed_ceiling: 500,
            note: "No single 'true' CAPEX. Market is segmented by procurement capability, scale, and risk appetite.",
          };
          d.lead_times = {
            hv_equipment_months: [10, 16], battery_plus_shipping_months: [5, 8],
            epc_construction_months: [2, 3], commissioning_months: [1, 2],
            total_rtb_to_cod_months: [12, 18], critical_path: 'HV equipment procurement',
            note: 'RTB to COD achievable in ~12 months if HV equipment ordered early. HV is the long pole, not battery.',
          };
          d.scale_effect = {
            small_under_20mw: '+15\u201330%', medium_20_80mw: 'baseline', large_over_80mw: '\u221210\u201320%',
            note: 'Bulk procurement + shared grid scope drive savings at scale.',
          };
          d.price_lag = {
            battery_cell_months: [3, 6], hv_equipment_months: [6, 16],
            note: 'Lithium \u2193 today \u2192 turnkey battery \u2193 in 3\u20136mo. HV equipment pricing lags 6\u201316mo.',
          };
          d.supplier_spread = {
            premium_bankable: '+10\u201325%', mainstream: 'baseline', aggressive_new_entrant: '\u221210\u201320%',
            note: 'Premium buys bankability + warranty + delivery certainty.',
          };
          d.contract_structure = {
            turnkey_epc: '+10\u201320%', multi_contract: 'baseline',
            note: 'Most Baltic projects use turnkey EPC. Split supply needs experienced developer.',
          };
          d.policy_flags = [
            { name: 'Grid-forming requirements', impact: 'PCS cost \u2191', status: 'emerging', detail: 'ENTSO-E Phase II Nov 2025. Grid-forming for new storage modules.' },
            { name: 'EU Batteries Regulation', impact: 'Compliance cost', status: 'in force', detail: 'Sustainability, labelling, due diligence. Non-trivial documentation.' },
            { name: 'Baltic balancing cost shift', impact: 'Net revenue \u2193', status: 'active 2026', detail: '30% of balancing costs now on producers. Affects revenue, not CAPEX.' },
          ];

          // Update technology with degradation shape
          if (d.technology) {
            d.technology.degradation_shape = 'non-linear';
            d.technology.degradation_note = 'Slow early (Y1\u20135), linear mid-life (Y5\u201315), accelerates late. Calendar + cycling interact.';
          }

          // ── LAYER 2: Apply editorial overrides (human-approved, highest priority) ──
          const editorial = await env.KKME_SIGNALS.get('s3_editorial').catch(() => null);
          if (editorial) {
            try {
              const ed = JSON.parse(editorial);
              const overridable = ['cost_profiles','transactions','technology','key_players','lcos_reference','cost_drivers','confidence','market_bands','lead_times','scale_effect','price_lag','supplier_spread','contract_structure','policy_flags','grid_scope_classes','uncertainty','trend'];
              for (const field of overridable) {
                if (ed[field] !== undefined) d[field] = ed[field];
              }
            } catch { /* ignore bad editorial JSON */ }
          }

          // ── LAYER 3: Add enrichment annotations (read-only, never overrides) ──
          const enrichRaw = await env.KKME_SIGNALS.get('s3_enrichment').catch(() => null);
          if (enrichRaw) {
            try {
              const enrichment = JSON.parse(enrichRaw);
              const enrichAge = (Date.now() - new Date(enrichment.enriched_at).getTime()) / 86400000;
              if (enrichAge < 14) {
                d.enrichment_annotations = { enriched_at: enrichment.enriched_at, driver_sentiment: {}, headlines: [], review_needed: false };
                for (const [key, sentiment] of Object.entries(enrichment.driver_sentiment || {})) {
                  if (sentiment && typeof sentiment === 'object' && (sentiment.evidence_count ?? 0) >= 2) {
                    d.enrichment_annotations.driver_sentiment[key] = sentiment;
                  }
                }
                d.enrichment_annotations.headlines = (enrichment.findings || []).filter(f => f.relevance !== 'low').slice(0, 3).map(f => ({ headline: f.headline, source: f.source }));
                if (enrichment.range_drift_flag) d.enrichment_annotations.review_needed = true;
              }
            } catch { /* ignore bad enrichment JSON */ }
          }

          // ── LAYER 4: Real freshness from KV ──
          const rawFreshness = JSON.parse(await env.KKME_SIGNALS.get('s3_freshness').catch(() => '{}') || '{}');
          d.data_freshness = {
            ecb_euribor:     { ...(rawFreshness.ecb_euribor || {}), cadence: 'daily', status: checkS3Freshness(rawFreshness.ecb_euribor, 48) },
            lithium_proxy:   { ...(rawFreshness.lithium_proxy || {}), cadence: 'daily', confidence: 'proxy', status: checkS3Freshness(rawFreshness.lithium_proxy, 48) },
            fx:              { ...(rawFreshness.fx || {}), cadence: 'daily', status: checkS3Freshness(rawFreshness.fx, 24) },
            enrichment:      { ...(rawFreshness.enrichment || {}), cadence: 'weekly', status: checkS3Freshness(rawFreshness.enrichment, 336) },
            capex_reference: { last_update: rawFreshness.capex_reference?.last_update || '2025-12-01', cadence: 'quarterly editorial', status: checkS3Freshness(rawFreshness.capex_reference, 2160) },
            transactions:    { last_update: rawFreshness.transactions?.last_update || '2026-03-15', cadence: 'event-driven', status: checkS3Freshness(rawFreshness.transactions, 2160) },
            nrel_anchor:     { last_update: '2025-06-01', cadence: 'annual', status: 'structural anchor' },
          };

          // ── Confidence auto-downgrade if inputs stale ──
          const staleCount = ['ecb_euribor','lithium_proxy','fx'].filter(k => d.data_freshness[k]?.status === 'stale' || d.data_freshness[k]?.status === 'unknown').length;
          if (staleCount >= 2) {
            d.confidence = { ...d.confidence, level: 'degraded', degraded_reason: `${staleCount} input(s) stale` };
          }

          return new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        } catch { /* fall through to fresh compute */ }
      }
      const data = await computeS3();
      await env.KKME_SIGNALS.put('s3', JSON.stringify(data));
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // ── GET /s5 ──────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s5') {
      const cached = await env.KKME_SIGNALS.get('s5').catch(() => null);
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
      }
      try {
        const data = await computeS5(env);
        await env.KKME_SIGNALS.put('s5', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
      } catch (err) {
        return Response.json({ ...DEFAULTS.s5, unavailable: true, _serving: 'static_defaults' }, { headers: CORS });
      }
    }

    // ── POST /s5/manual ──────────────────────────────────────────────────────
    // Quarterly manual update: Baltic DC pipeline MW + notes.
    if (request.method === 'POST' && url.pathname === '/s5/manual') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
      }
      let body;
      try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
      }
      const data = {
        pipeline_mw:  body.pipeline_mw ?? null,
        note:         body.note        ?? null,
        updated_at:   new Date().toISOString(),
      };
      await env.KKME_SIGNALS.put('s5_manual', JSON.stringify(data));
      await env.KKME_SIGNALS.delete('s5').catch(() => {});  // invalidate cache
      console.log(`[S5/manual] pipeline=${data.pipeline_mw}MW note="${data.note}"`);
      return Response.json({ ok: true, ...data }, { headers: CORS });
    }

    // ── GET /s6 · /s7 · /s8 · /s9 ───────────────────────────────────────────

    for (const [sig, computeFn, def] of [
      ['s6', () => fetchNordicHydro(),             DEFAULTS.s6],
      ['s7', () => fetchTTFGas(),                  DEFAULTS.s7],
      ['s8', () => fetchInterconnectorFlows(),  DEFAULTS.s8],
      ['s9', () => fetchEUCarbon(),                DEFAULTS.s9],
    ]) {
      if (request.method === 'GET' && url.pathname === `/${sig}`) {
        const cached = await env.KKME_SIGNALS.get(sig).catch(() => null);
        if (cached) {
          return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        }
        try {
          const data = await computeFn();
          await env.KKME_SIGNALS.put(sig, JSON.stringify(data));
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
        } catch (err) {
          console.error(`[${sig}] fetch failed:`, String(err));
          return Response.json({ ...def, unavailable: true, _serving: 'static_defaults' }, { headers: CORS });
        }
      }

      // History endpoints for S6, S7, S9 (not S8 — flows are point-in-time)
      if (sig !== 's8' && request.method === 'GET' && url.pathname === `/${sig}/history`) {
        const raw = await env.KKME_SIGNALS.get(`${sig}_history`).catch(() => null);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: { ...CORS, 'Cache-Control': 'public, max-age=1800' } });
      }
    }

    // ── GET /s_wind · /s_solar · /s_load ──────────────────────────────────────
    for (const genSig of ['s_wind', 's_solar', 's_load']) {
      if (request.method === 'GET' && url.pathname === `/${genSig}`) {
        const cached = await env.KKME_SIGNALS.get(genSig).catch(() => null);
        if (cached) {
          return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS } });
        }
        // No cached data yet — try live fetch
        try {
          const { wind, solar, load } = await fetchBalticGeneration();
          const map = { s_wind: wind, s_solar: solar, s_load: load };
          const data = map[genSig];
          // Best-effort write all 3
          await Promise.all([
            env.KKME_SIGNALS.put('s_wind', JSON.stringify(wind)),
            env.KKME_SIGNALS.put('s_solar', JSON.stringify(solar)),
            env.KKME_SIGNALS.put('s_load', JSON.stringify(load)),
          ]).catch(() => {});
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...CORS } });
        } catch (err) {
          console.error(`[${genSig}] live fetch failed:`, String(err));
          return Response.json({ unavailable: true, signal: 'UNKNOWN', _serving: 'no_data_yet', timestamp: null }, { headers: CORS });
        }
      }
    }

    // ── GET /genload — Real-time Baltic generation & load (ENTSO-E A75+A65) ─
    if (request.method === 'GET' && url.pathname === '/genload') {
      const cached = await env.KKME_SIGNALS.get('genload').catch(() => null);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = parsed.fetched_at ? (Date.now() - new Date(parsed.fetched_at).getTime()) / 60000 : 999;
        // Serve cached immediately, refresh in background if stale (>5 min)
        if (age > 5) {
          const apiKey = env.ENTSOE_API_KEY;
          if (apiKey) {
            ctx.waitUntil(
              fetchGenLoad(apiKey)
                .then(d => env.KKME_SIGNALS.put('genload', JSON.stringify(d)))
                .catch(e => console.error('[genload] bg refresh failed:', String(e)))
            );
          }
        }
        return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
      }
      // No cache — fetch live
      const apiKey = env.ENTSOE_API_KEY;
      if (!apiKey) {
        return Response.json({ error: 'ENTSOE_API_KEY not configured' }, { status: 500, headers: CORS });
      }
      try {
        const data = await fetchGenLoad(apiKey);
        await env.KKME_SIGNALS.put('genload', JSON.stringify(data));
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
      } catch (err) {
        console.error('[genload] fetch failed:', String(err));
        return Response.json({ error: 'ENTSO-E fetch failed', detail: String(err) }, { status: 502, headers: CORS });
      }
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

    // ── POST /s4/buildability ────────────────────────────────────────────────
    // Assertion-backed buildability data pushed by daily_intel.py.
    // Stores in KV so GET /s4 returns live values instead of static.
    if (request.method === 'POST' && url.pathname === '/s4/buildability') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      body.received_at = new Date().toISOString();
      await env.KKME_SIGNALS.put('s4_buildability', JSON.stringify(body));
      console.log(`[S4/buildability] ${Object.keys(body.assertions || {}).length} assertions pushed`);
      return jsonResp({ ok: true, assertions: Object.keys(body.assertions || {}).length });
    }

    // ── POST /s4/sync-layer3 ──────────────────────────────────────────────────
    // Manual trigger for Litgrid Layer 3 Kaupikliai → fleet KV sync.
    // Also runs automatically in the 4-hourly cron.
    if (request.method === 'POST' && url.pathname === '/s4/sync-layer3') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      try {
        const result = await syncLitgridFleet(env);
        return jsonResp({ ok: true, ...result });
      } catch (err) {
        return jsonResp({ error: String(err) }, 500);
      }
    }

    // ── POST /s4/pipeline ────────────────────────────────────────────────────
    // VERT.lt permit pipeline metrics (monthly, pushed by local fetch-vert.js).
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
      const [s4Raw, pipelineRaw, buildRaw, fleetRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s4'),
        env.KKME_SIGNALS.get('s4_pipeline'),
        env.KKME_SIGNALS.get('s4_buildability'),
        (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
          .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
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

          // Use assertion-backed values from KV if available, otherwise static defaults
          const build = buildRaw ? JSON.parse(buildRaw) : null;
          const a = build?.assertions || {};
          const getVal = (key, fallback) => a[key]?.value ?? fallback;
          const getUrl = (key, fallback) => a[key]?.source_url ?? fallback;

          d.storage_reference = {
            source: `Litgrid, ${a.installed_storage_lt_mw?.as_of_date || '2026-03-23'}`,
            source_url: getUrl('installed_storage_lt_mw', 'https://www.litgrid.eu/index.php/naujienos/naujienos/prie-elektros-perdavimo-tinklo-prijungta-trecioji-komercine-30-mw-galios-bateriju-kaupimo-sistema-/36502'),
            installed_mw: getVal('installed_storage_lt_mw', 484),
            installed_gen_mw: getVal('installed_storage_lt_gen_mw', 420),
            installed_mwh: getVal('installed_storage_lt_mwh', 719),
            note: 'Distribution + transmission combined, national total',
            from_assertions: !!build,
          };
          d.storage_pipeline = {
            tso_reserved_mw: getVal('reserved_storage_lt_mw', 1395),
            tso_reserved_mwh: getVal('reserved_storage_lt_mwh', 3204),
            source: 'Litgrid reservation cycle',
            source_url: getUrl('reserved_storage_lt_mw', 'https://www.litgrid.eu/index.php/naujienos/naujienos/litgrid-per-3-menesius-preliminariai-rezervavo-17-gw-galios-saules-ir-vejo-elektrinems-bei-kaupimo-irenginiams/36506'),
            intention_protocols_mw: getVal('intention_storage_lt_mw', 3700),
            intention_protocols_mwh: 9000,
            apva_applied_mw: getVal('apva_applied_storage_lt_mw', 1545),
            apva_applied_mwh: 3232,
            apva_budget_eur: 45000000,
            apva_source_url: getUrl('apva_applied_storage_lt_mw', 'https://apva.lrv.lt/lt/naujienos-24316/uzbaigtas-45-mln-euru-kvietimas-elektros-kaupimo-irenginiams-rinkos-poreikis-virsijo-skirta-suma-k2R'),
            from_assertions: !!build,
          };
          d.grid_caveat = 'Grid capacity figures from VERT.lt ArcGIS represent ALL technologies (wind, solar, thermal, storage, consumption). They are non-additive across zones per Litgrid methodology. Do not interpret as storage-specific capacity.';
          d.source_urls = {
            vert_arcgis: 'https://atviri-litgrid.hub.arcgis.com/',
            litgrid: 'https://www.litgrid.eu/',
            vert_permits: 'https://vert.lt/atsinaujinantys-istekliai/SiteAssets/2026-02/Leidimai%20pl%C4%97toti%20kaupimo%20paj%C4%97gumus%20%202026-02-28.pdf',
            apva: 'https://apva.lrv.lt/',
            eso_maps: 'https://www.eso.lt/verslui/elektra/elektros-liniju-zemelapiai/transformatoriu-pastociu-laisvu-galiu-zemelapis-vartotojams/3931',
            litgrid_aei: 'https://www.litgrid.eu/index.php/aei-centras/aei-elektriniu-prijungimo-zemelapis/32331',
          };

          // Storage by country — Baltic country breakdown
          const ltMw = getVal('installed_storage_lt_mw', 484);
          const lvMw = getVal('installed_storage_lv_mw', 40);
          const eeMw = getVal('installed_storage_ee_mw', 127);
          const eeUcMw = getVal('under_construction_storage_ee_mw', 255);

          d.storage_by_country = {
            LT: {
              installed_mw: ltMw,
              installed_gen_mw: getVal('installed_storage_lt_gen_mw', 420),
              installed_mwh: getVal('installed_storage_lt_mwh', 719),
              tso_reserved_mw: getVal('reserved_storage_lt_mw', 1395),
              intention_mw: getVal('intention_storage_lt_mw', 3700),
              apva_applied_mw: getVal('apva_applied_storage_lt_mw', 1545),
              source: 'Litgrid',
              source_url: 'https://www.litgrid.eu/',
              assets: [
                { id: 'e-energija', name: 'E energija BESS', mw: 65, mwh: 130, status: 'operational', source_url: 'https://www.litgrid.eu/' },
                { id: 'kruonis-psp', name: 'Kruonis PSP', mw: 205, status: 'operational', type: 'pumped_hydro', note: 'DRR resource — FCR/aFRR suppression until ~2028-02' },
                { id: 'litgrid-bess-3', name: 'Third commercial 30MW BESS', mw: 30, status: 'operational', source_url: d.storage_reference?.source_url },
              ],
            },
            LV: {
              installed_mw: lvMw,
              source: 'AST',
              source_url: 'https://www.ast.lv/',
              coverage_note: 'AST does not publish storage-specific reservation data. Latvia commercial BESS pipeline not publicly visible.',
              assets: [
                { id: 'ast-bess-rezekne', name: 'AST BESS (Rēzekne)', mw: 20, status: 'operational', tech: 'li-ion', note: 'TSO-owned. Rolls-Royce Solutions. EU Recovery/CEF funded.' },
                { id: 'ast-bess-tume', name: 'AST BESS (Tume)', mw: 20, status: 'operational', tech: 'li-ion', note: 'TSO-owned. AST estimates €20M/yr savings from 2026.' },
              ],
            },
            EE: {
              installed_mw: eeMw,
              under_construction_mw: eeUcMw,
              source: 'Evecon / Elering',
              source_url: 'https://en.evecon.ee/',
              coverage_note: `${eeMw} MW operational since Feb 2026, ${eeUcMw} MW under construction. Estonia BESS market emerging fast.`,
              assets: [
                { id: 'bsp-hertz-1', name: 'BSP Hertz 1 (Kiisa)', mw: 100, mwh: 200, status: 'operational', cod: '2026-02-05', source_url: 'https://en.evecon.ee/estonia-strengthens-energy-resilience-hertz-1-one-of-continental-europes-largest-battery-storage-parks-opens-in-kiisa/', note: 'Evecon+Corsica Sole+Mirova JV. EBRD+NIB €85.6M.' },
                { id: 'eesti-energia', name: 'Eesti Energia BESS', mw: 26.5, mwh: 53.1, status: 'operational', cod: '2025-02-01', note: 'Estonia first grid-scale BESS. State utility.' },
                { id: 'bsp-hertz-2', name: 'BSP Hertz 2 (Arukylä)', mw: 100, mwh: 200, status: 'under_construction', note: 'COD end-2026. Nidec integrator.' },
                { id: 'evecon-kirikmaee', name: 'Evecon Kirikmäe BESS', mw: 55, mwh: 250, status: 'under_construction', note: 'Hybrid 77.5MWp PV. Huawei batteries. €85M Swedbank.' },
                { id: 'zirgu-phase1', name: 'Zirgu BESS Phase 1', mw: 100, mwh: 200, status: 'under_construction', note: '€35M. Diotech+Transcom. Up to 200MW/800MWh planned.' },
              ],
            },
          };
          d.baltic_total = {
            installed_mw: getVal('installed_storage_baltic_mw', ltMw + lvMw + eeMw),
            under_construction_mw: eeUcMw + 361, // EE UC + LT UC (Ignitis 291 + Olana 70)
          };

          // Merge fleet tracker data (migrated from S2)
          if (fleetRaw) {
            try {
              const fl = JSON.parse(fleetRaw);
              d.fleet = {
                countries:            fl.countries             ?? null,
                sd_ratio:             fl.sd_ratio              ?? null,
                phase:                fl.phase                 ?? null,
                cpi:                  fl.cpi                   ?? null,
                trajectory:           fl.trajectory            ?? null,
                baltic_operational_mw: fl.baltic_operational_mw ?? null,
                baltic_pipeline_mw:   fl.baltic_pipeline_mw    ?? null,
                eff_demand_mw:        fl.eff_demand_mw         ?? null,
                product_sd:           fl.product_sd            ?? null,
                updated:              fl.updated_at            ?? null,
              };

              // Expose individual projects from fleet tracker
              const entries = fl.raw_entries || [];
              d.projects = entries;
              const counts = { total: entries.length, by_country: {}, by_status: {}, total_mw: 0 };
              for (const p of entries) {
                const c = p.country || 'unknown';
                const s = p.status || 'unknown';
                counts.by_country[c] = (counts.by_country[c] || 0) + 1;
                counts.by_status[s] = (counts.by_status[s] || 0) + 1;
                counts.total_mw += parseFloat(p.mw || 0);
              }
              counts.total_mw = Math.round(counts.total_mw * 10) / 10;
              d.project_counts = counts;
            } catch { /* ignore */ }
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
    // External push fallback: accepts raw { lt_prices, se4_prices } OR pre-computed metrics.
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
    // Revenue Engine v4: 3-scenario, DSCR, COD sensitivity, CPI-based pricing.
    // Query params: system=2h|2.4h|4h  capex=low|mid|high  grant=none|partial  cod=2027|2028|2029
    // NOT cached — params vary per request.
    if (request.method === 'GET' && url.pathname === '/revenue') {
      // ── Parse query params (v6 names with backward compat) ──
      const CAPEX_MAP = { low: 120, mid: 164, high: 262 };
      const DUR_MAP   = { '2h': 2, '4h': 4 };

      const durParam    = url.searchParams.get('dur') || url.searchParams.get('system') || '2h';
      const capexParam  = url.searchParams.get('capex')    || 'mid';
      const codParam    = parseInt(url.searchParams.get('cod')) || 2028;
      const scenParam   = url.searchParams.get('scenario') || 'base';
      const mwParam     = parseInt(url.searchParams.get('mw')) || 50;
      const grantPct    = parseFloat(url.searchParams.get('grant_pct') || '0');

      const dur_h     = DUR_MAP[durParam] || parseFloat(durParam) || 2;
      const capex_kwh = CAPEX_MAP[capexParam] || parseInt(capexParam) || 164;

      // ── Read KV data (v7: additional keys for observed base year) ──
      const [s1Raw, s2Raw, s3Raw, fleetRaw, eurRaw, s1CaptureRaw, s2ActivationRaw, btdHistRaw, tradingMetricsRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s2'),
        env.KKME_SIGNALS.get('s3'),
        (env.KKME_SIGNALS.get('s4_fleet').catch(() => null))
          .then(r => r || env.KKME_SIGNALS.get('s2_fleet').catch(() => null)),
        env.KKME_SIGNALS.get('euribor'),
        env.KKME_SIGNALS.get('s1_capture').catch(() => null),
        env.KKME_SIGNALS.get('s2_activation').catch(() => null),
        env.KKME_SIGNALS.get('s2_btd_history').catch(() => null),
        env.KKME_SIGNALS.get('trading:metrics').catch(() => null),
      ]);
      const s1    = s1Raw    ? JSON.parse(s1Raw)    : null;
      const s2    = s2Raw    ? JSON.parse(s2Raw)    : null;
      const s3    = s3Raw    ? JSON.parse(s3Raw)    : null;
      const fleet = fleetRaw ? JSON.parse(fleetRaw) : null;
      const eur   = eurRaw   ? JSON.parse(eurRaw)   : null;

      // Parse S1 capture (monthly capture data)
      const s1_capture = s1CaptureRaw ? JSON.parse(s1CaptureRaw) : null;

      // Parse S2 activation into the shape v7 expects
      let s2_activation_parsed = null;
      if (s2ActivationRaw) {
        try {
          const actRaw = JSON.parse(s2ActivationRaw);
          const lt = actRaw.countries?.Lithuania;
          const lv = actRaw.countries?.Latvia;
          const ee = actRaw.countries?.Estonia;
          s2_activation_parsed = {
            lt: {
              afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
              mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
            },
            lv: {
              afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
              mfrr_p50: lv?.mfrr_recent_3m?.avg_p50 ?? null,
            },
            ee: {
              afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
              mfrr_p50: ee?.mfrr_recent_3m?.avg_p50 ?? null,
            },
            lt_monthly_afrr: lt?.afrr_up ?? {},
            lt_monthly_mfrr: lt?.mfrr_up ?? {},
            lv_monthly_afrr: lv?.afrr_up ?? {},
            lv_monthly_mfrr: lv?.mfrr_up ?? {},
            ee_monthly_afrr: ee?.afrr_up ?? {},
            ee_monthly_mfrr: ee?.mfrr_up ?? {},
            compression: actRaw.compression_trajectory ?? null,
          };
        } catch { /* ignore */ }
      }

      // Parse BTD history for capacity monthly
      let capacity_monthly = [];
      if (btdHistRaw) {
        try { capacity_monthly = computeCapacityMonthly(JSON.parse(btdHistRaw)); } catch { /* ignore */ }
      }

      // Parse dispatch metrics for reserve availability
      let dispatch_metrics = null;
      if (tradingMetricsRaw) {
        try { dispatch_metrics = JSON.parse(tradingMetricsRaw); } catch { /* ignore */ }
      }

      const kv = { fleet, s2, s1, s3, euribor: eur, s1_capture, s2_activation_parsed, capacity_monthly, dispatch_metrics };

      // ── Primary result (v7: observed base year) ──
      const computeEngine = computeRevenueV7;
      let result;
      try {
        result = computeEngine(
          { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct },
          kv
        );
      } catch (e) {
        console.error('[Revenue/v7] computeEngine failed, falling back to v6:', e.message, e.stack);
        result = computeRevenueV6(
          { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct },
          kv
        );
        result.model_version = 'v6_error_fallback';
        result._v7_error = e.message;
      }

      // ── Live rate (today vs base year) ──
      try {
        const sc_cfg_lr = REVENUE_SCENARIOS[scenParam] || REVENUE_SCENARIOS.base;
        result.live_rate = computeLiveRate(kv, result.base_year, dur_h, sc_cfg_lr);
      } catch (e) {
        console.error('[Revenue/v7] computeLiveRate failed:', e.message);
        result.live_rate = { error: e.message };
      }

      // ── All 3 scenarios for primary config ──
      const all_scenarios = {};
      for (const sc of ['base', 'conservative', 'stress']) {
        if (sc === scenParam) {
          all_scenarios[sc] = result;
        } else {
          all_scenarios[sc] = computeEngine(
            { mw: mwParam, dur_h, capex_kwh, cod_year: codParam, scenario: sc, grant_pct: grantPct },
            kv
          );
        }
      }
      result.all_scenarios = {
        base:         { project_irr: all_scenarios.base.project_irr, equity_irr: all_scenarios.base.equity_irr, min_dscr: all_scenarios.base.min_dscr, net_mw_yr: all_scenarios.base.net_mw_yr, bankability: all_scenarios.base.bankability, ebitda_y1: all_scenarios.base.ebitda_y1 },
        conservative: { project_irr: all_scenarios.conservative.project_irr, equity_irr: all_scenarios.conservative.equity_irr, min_dscr: all_scenarios.conservative.min_dscr, net_mw_yr: all_scenarios.conservative.net_mw_yr, bankability: all_scenarios.conservative.bankability, ebitda_y1: all_scenarios.conservative.ebitda_y1 },
        stress:       { project_irr: all_scenarios.stress.project_irr, equity_irr: all_scenarios.stress.equity_irr, min_dscr: all_scenarios.stress.min_dscr, net_mw_yr: all_scenarios.stress.net_mw_yr, bankability: all_scenarios.stress.bankability, ebitda_y1: all_scenarios.stress.ebitda_y1 },
      };

      // ── Sensitivity matrix: 3 COD × 3 CAPEX = 9 cells ──
      // Matrix re-runs computeEngine for each (cod, capex) cell. Honours the
      // user's scenario param so toggling base/conservative/stress on the
      // Returns card moves the matrix in lockstep with the headline IRR.
      const COD_YEARS  = [2027, 2028, 2029];
      const CAPEX_KEYS = ['low', 'mid', 'high'];
      const matrix = [];
      for (const cy of COD_YEARS) {
        for (const ck of CAPEX_KEYS) {
          const ckv = CAPEX_MAP[ck];
          if (cy === codParam && ckv === capex_kwh) {
            // Reuse the headline scenario result for the current cell.
            const cur = all_scenarios[scenParam] || all_scenarios.base;
            matrix.push({ cod: cy, capex: ck, capex_kwh: ckv, project_irr: cur.project_irr, equity_irr: cur.equity_irr, min_dscr: cur.min_dscr, net_mw_yr: cur.net_mw_yr, bankability: cur.bankability });
          } else {
            const mr = computeEngine(
              { mw: mwParam, dur_h, capex_kwh: ckv, cod_year: cy, scenario: scenParam, grant_pct: grantPct },
              kv
            );
            matrix.push({ cod: cy, capex: ck, capex_kwh: ckv, project_irr: mr.project_irr, equity_irr: mr.equity_irr, min_dscr: mr.min_dscr, net_mw_yr: mr.net_mw_yr, bankability: mr.bankability });
          }
        }
      }
      result.matrix = matrix;

      // ── h2/h4 backward compat ──
      const r2h = dur_h === 2 ? result : computeEngine({ mw: 50, dur_h: 2, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct }, kv);
      const r4h = dur_h === 4 ? result : computeEngine({ mw: 50, dur_h: 4, capex_kwh, cod_year: codParam, scenario: scenParam, grant_pct: grantPct }, kv);
      result.irr_2h       = r2h.project_irr;
      result.net_mw_yr_2h = r2h.net_mw_yr;
      result.irr_4h       = r4h.project_irr;
      result.net_mw_yr_4h = r4h.net_mw_yr;
      result.h2 = {
        capex_per_mw: r2h.gross_capex / 50, irr_approx_pct: Math.round(r2h.project_irr * 1000) / 10,
        simple_payback_years: r2h.simple_payback_years,
        afrr_annual_per_mw: Math.round(r2h.capacity_y1 * 0.38), mfrr_annual_per_mw: Math.round(r2h.capacity_y1 * 0.27),
        trading_annual_per_mw: r2h.arbitrage_y1, gross_annual_per_mw: r2h.gross_revenue_y1 / 50,
        opex_annual_per_mw: r2h.opex_y1 / 50, net_annual_per_mw: r2h.net_revenue_y1 / 50,
        ch_irr_central: 16.6, ch_irr_range: '6%–31%',
      };
      result.h4 = {
        capex_per_mw: r4h.gross_capex / 50, irr_approx_pct: Math.round(r4h.project_irr * 1000) / 10,
        simple_payback_years: r4h.simple_payback_years,
        afrr_annual_per_mw: Math.round(r4h.capacity_y1 * 0.38), mfrr_annual_per_mw: Math.round(r4h.capacity_y1 * 0.27),
        trading_annual_per_mw: r4h.arbitrage_y1, gross_annual_per_mw: r4h.gross_revenue_y1 / 50,
        opex_annual_per_mw: r4h.opex_y1 / 50, net_annual_per_mw: r4h.net_revenue_y1 / 50,
        ch_irr_central: 10.8, ch_irr_range: '6%–20%',
      };

      // ── EU market ranking ──
      const legacyPrices = {
        afrr_up_avg:            s2?.afrr_up_avg             ?? 20,
        mfrr_up_avg:            s2?.mfrr_up_avg             ?? 15,
        spread_eur_mwh:         s1?.spread_eur_mwh          ?? 15,
        lt_daily_swing_eur_mwh: s1?.lt_daily_swing_eur_mwh ?? null,
        euribor_3m:             eur?.euribor_3m             ?? 2.6,
      };
      result.eu_ranking = computeMarketComparisonWorker(legacyPrices);
      if (result.eu_ranking) {
        const lt = result.eu_ranking.find(m => m.country === 'Lithuania');
        if (lt) lt.irr_pct = Math.round(result.project_irr * 1000) / 10;
      }

      result.prices = { afrr_up_avg: s2?.afrr_up_avg ?? null, mfrr_up_avg: s2?.mfrr_up_avg ?? null, spread_eur_mwh: s1?.spread_eur_mwh ?? null, euribor_3m: eur?.euribor_3m ?? null };
      result.updated_at = result.timestamp;

      // ── Backtest: use price-ratio mix for trading/balancing split ──
      const sc_cfg = REVENUE_SCENARIOS[scenParam] || REVENUE_SCENARIOS.base;
      const si = result.signal_inputs || {};
      const bt_mix = result.base_year?.time_model?.trading_fraction != null
        ? { trading_fraction: result.base_year.time_model.trading_fraction }
        : computeTradingMix(kv, dur_h, 2026, 'base', sc_cfg);

      const capMonthly = (s1_capture?.monthly || []).filter(m => m.month && m.days >= 15);
      const backtest = capMonthly.map(m => {
        const capture = dur_h <= 2
          ? (m.avg_gross_2h || m.avg_net_2h || 140)
          : (m.avg_gross_4h || m.avg_net_4h || 125);

        // Balancing revenue per MW per day (current capacity+activation prices)
        const bal_daily = (
          0.16 * sc_cfg.avail * (si.fcr_cap || 45) +
          0.34 * sc_cfg.avail * (si.afrr_cap || 7.7) +
          0.50 * sc_cfg.avail * (si.mfrr_cap || 21.5) +
          0.34 * sc_cfg.avail * sc_cfg.act_rate_afrr * (si.afrr_clearing || 171) * 0.55 +
          0.50 * sc_cfg.avail * sc_cfg.act_rate_mfrr * (si.mfrr_clearing || 81) * 0.75
        ) * 24 * sc_cfg.bal_mult * sc_cfg.real_factor * (1 - sc_cfg.rtm_fee_pct);

        // Trading: capture × RTE × realisation × dur_h × cycles × fraction (per MW per day)
        const bt_rte = dur_h <= 2 ? 0.855 : 0.852;
        const bt_cycles = dur_h <= 2 ? sc_cfg.cycles_2h : sc_cfg.cycles_4h;
        const trd_daily = capture * bt_rte * (sc_cfg.trd_real || 0.85) * dur_h * bt_cycles * bt_mix.trading_fraction;

        return {
          month: m.month,
          trading_daily: Math.round(trd_daily),
          balancing_daily: Math.round(bal_daily),
          total_daily: Math.round(trd_daily + bal_daily),
          s1_capture: Math.round(capture * 10) / 10,
          days: m.days,
        };
      });
      result.backtest = backtest;

      // ── What changed: compare to previous snapshot ──
      const prevRaw = await env.KKME_SIGNALS.get('revenue_snapshot_prev').catch(() => null);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;

      let deltas = null;
      if (prev && prev.signal_inputs) {
        const psi = prev.signal_inputs;
        deltas = {
          irr_pp: Math.round(((result.project_irr || 0) - (prev.project_irr || 0)) * 10000) / 100,
          net_rev: Math.round((result.net_mw_yr || 0) - (prev.net_mw_yr || 0)),
          signals: {},
        };
        for (const key of ['s1_capture', 'afrr_clearing', 'mfrr_clearing', 'afrr_cap', 'mfrr_cap', 'euribor']) {
          if (si[key] !== undefined && psi[key] !== undefined) {
            deltas.signals[key] = {
              current: si[key],
              previous: psi[key],
              delta: Math.round((si[key] - psi[key]) * 100) / 100,
            };
          }
        }
        deltas.prev_date = prev.computed_at;
      }
      result.deltas = deltas;

      // Store current snapshot (once per day)
      const today = new Date().toISOString().slice(0, 10);
      const prevDate = prev?.computed_at?.slice(0, 10);
      if (today !== prevDate) {
        await env.KKME_SIGNALS.put('revenue_snapshot_prev', JSON.stringify({
          project_irr: result.project_irr,
          net_mw_yr: result.net_mw_yr,
          signal_inputs: si,
          computed_at: new Date().toISOString(),
        }));
      }

      return jsonResp(result);
    }

    // ── GET /s1/history · /s2/history · /s3/history · /s4/history ───────────
    if (request.method === 'GET' && /^\/(s[1-4])\/history$/.test(url.pathname)) {
      const sig = url.pathname.slice(1, 3); // 's1', 's2', 's3', 's4'
      const histKey = sig === 's1' ? 's1_history' : `${sig}_history`;
      const raw = await env.KKME_SIGNALS.get(histKey).catch(() => null);
      const arr = raw ? JSON.parse(raw) : [];
      return Response.json(arr, { headers: CORS });
    }

    // ── POST /trading/update ─────────────────────────────────────────────────
    // Receives 15-min BTD balancing data from Mac cron. Computes dispatch analysis.
    if (request.method === 'POST' && url.pathname === '/trading/update') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
      const { date } = body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResp({ error: 'date (YYYY-MM-DD) required' }, 400);

      // Fetch DA hourly prices for this specific date from ENTSO-E A44
      let daHourly = [];
      try {
        const d = new Date(date + 'T00:00:00Z');
        const next = new Date(d.getTime() + 86400000);
        const fmt = dt => {
          const y = dt.getUTCFullYear();
          const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const da = String(dt.getUTCDate()).padStart(2, '0');
          return `${y}${mo}${da}0000`;
        };
        const daUrl = new URL(ENTSOE_API);
        daUrl.searchParams.set('documentType', 'A44');
        daUrl.searchParams.set('in_Domain', LT_BZN);
        daUrl.searchParams.set('out_Domain', LT_BZN);
        daUrl.searchParams.set('periodStart', fmt(d));
        daUrl.searchParams.set('periodEnd', fmt(next));
        daUrl.searchParams.set('securityToken', env.ENTSOE_API_KEY);
        const daRes = await fetch(daUrl.toString());
        if (daRes.ok) {
          const xml = await daRes.text();
          daHourly = extractPrices(xml);
          console.log(`[Trading] ${date} DA prices: ${daHourly.length} hours, avg=€${daHourly.length ? (daHourly.reduce((a,b)=>a+b,0)/daHourly.length).toFixed(1) : '?'}`);
        }
      } catch (e) {
        console.warn(`[Trading] ${date} DA fetch failed: ${e.message}`);
      }
      body.da_hourly = daHourly;

      // Store raw BTD data (90 day TTL)
      await env.KKME_SIGNALS.put(`trading:${date}:raw`, JSON.stringify(body), { expirationTtl: 86400 * 90 });

      // Compute dispatch analysis — old format (backward compat) + new V2
      const analysis = computeDispatch(body, { mw: 60, mwh: 130, rte: 0.875 });
      await env.KKME_SIGNALS.put(`trading:${date}`, JSON.stringify(analysis), { expirationTtl: 86400 * 90 });

      // V2 dispatch: 50MW reference, 2H and 4H
      const v2_4h = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 4, mode: 'realised', date_iso: date });
      const v2_2h = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 2, mode: 'realised', date_iso: date });
      // Also compute post-DRR scenarios
      const v2_4h_drr = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 4, mode: 'realised', date_iso: date, drr_active: false });
      const v2_2h_drr = computeDispatchV2(body, body.da_hourly || [], { mw: 50, dur_h: 2, mode: 'realised', date_iso: date, drr_active: false });

      await env.KKME_SIGNALS.put(`dispatch:${date}:4h`, JSON.stringify(v2_4h), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:2h`, JSON.stringify(v2_2h), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:4h:post_drr`, JSON.stringify(v2_4h_drr), { expirationTtl: 86400 * 90 });
      await env.KKME_SIGNALS.put(`dispatch:${date}:2h:post_drr`, JSON.stringify(v2_2h_drr), { expirationTtl: 86400 * 90 });

      console.log(`[Trading] ${date} v1=€${analysis.totals.per_mw}/MW v2_4h=€${v2_4h.revenue_per_mw.daily_eur}/MW v2_2h=€${v2_2h.revenue_per_mw.daily_eur}/MW`);

      // ── Detect extreme activation events ──
      try {
        const actPrices = (body.activation_prices || []).filter(p => p && (p.up || p.down));
        if (actPrices.length > 0) {
          const maxUp = Math.max(...actPrices.map(p => Math.abs(p.up || 0)));
          const maxDown = Math.max(...actPrices.map(p => Math.abs(p.down || 0)));
          const maxAct = Math.max(maxUp, maxDown);
          if (maxAct > 500) {
            const product = maxDown > maxUp ? 'mFRR down' : (maxUp > 200 ? 'aFRR up' : 'mFRR up');
            const price = maxDown > maxUp ? -Math.round(maxDown) : Math.round(maxUp);
            const extremeEvent = {
              type: 'activation_extreme',
              date,
              price: Math.round(maxAct),
              signed_price: price,
              product,
              timestamp: new Date().toISOString(),
              text: `${product} activation cleared at €${price.toLocaleString()}/MWh`,
            };
            // Expire at midnight UTC — extreme events are today's news only
      const midnightMs = new Date().setUTCHours(23, 59, 59, 999) - Date.now();
      const extremeTtl = Math.max(60, Math.floor(midnightMs / 1000));
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(extremeEvent), { expirationTtl: extremeTtl });
            console.log(`[Trading/extreme] ${extremeEvent.text}`);
          }
        }
      } catch (e) { console.warn('[Trading/extreme] detection failed:', e.message); }

      // ── Update rolling dispatch metrics ──
      try {
        const metrics_raw = await env.KKME_SIGNALS.get('trading:metrics');
        const metrics = metrics_raw ? JSON.parse(metrics_raw) : { days: [] };
        const ra = analysis.reserve_availability || {};
        metrics.days.push({
          date,
          revenue_per_mw: Math.round(analysis.totals.per_mw),
          afrr_active_pct: ra.afrr_pct || 0,
          mfrr_active_pct: ra.mfrr_pct || 0,
          fcr_active_pct: ra.fcr_pct || 0,
          // Activation rates: actual energy dispatch (for time-slice model)
          afrr_activation_pct: ra.afrr_activation_pct || 0,
          mfrr_activation_pct: ra.mfrr_activation_pct || 0,
          capacity_pct: analysis.totals.splits_pct?.capacity || 0,
          activation_pct: analysis.totals.splits_pct?.activation || 0,
          arb_pct: analysis.totals.splits_pct?.arbitrage || 0,
        });
        // Deduplicate by date, keep last 90 days
        const seen = new Set();
        metrics.days = metrics.days.filter(d => {
          if (seen.has(d.date)) return false;
          seen.add(d.date);
          return true;
        }).slice(-90);
        // Compute rolling 30-day averages
        const recent = metrics.days.slice(-30);
        if (recent.length >= 3) {
          const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
          metrics.rolling_30d = {
            avg_revenue_per_mw: Math.round(avg(recent.map(d => d.revenue_per_mw))),
            // Procurement rates (typically ~1.0 — BESS offers reserves 24/7)
            avg_afrr_active_pct: Math.round(avg(recent.map(d => d.afrr_active_pct)) * 100) / 100,
            avg_mfrr_active_pct: Math.round(avg(recent.map(d => d.mfrr_active_pct)) * 100) / 100,
            avg_fcr_active_pct: Math.round(avg(recent.map(d => d.fcr_active_pct)) * 100) / 100,
            // Activation rates (fraction of ISPs with actual energy dispatch — for time-slice model)
            // Old days lack activation_pct fields: fall back to 0.18/0.10 defaults (not procurement rate)
            avg_afrr_activation_pct: Math.round(avg(recent.map(d => d.afrr_activation_pct ?? 0.18)) * 100) / 100,
            avg_mfrr_activation_pct: Math.round(avg(recent.map(d => d.mfrr_activation_pct ?? 0.10)) * 100) / 100,
            days_count: recent.length,
            updated: new Date().toISOString(),
          };
        }
        await env.KKME_SIGNALS.put('trading:metrics', JSON.stringify(metrics));
      } catch (e) {
        console.warn('[Trading] metrics update failed:', e.message);
      }

      return jsonResp({ ok: true, date, totals: analysis.totals, signals: analysis.signals });
    }

    // ── GET /api/dispatch — V2 dispatch with parameterized battery ────────────
    // Params: dur (2h|4h), mode (realised|forecast)
    if (request.method === 'GET' && url.pathname === '/api/dispatch') {
      const dur_h = url.searchParams.get('dur') === '2h' ? 2 : 4;
      const mode = url.searchParams.get('mode') === 'forecast' ? 'forecast' : 'realised';

      if (mode === 'realised') {
        // Find latest dispatch date from KV
        const keys = await env.KKME_SIGNALS.list({ prefix: `dispatch:202` });
        const dates = keys.keys.map(k => k.name)
          .filter(k => k.endsWith(`:${dur_h}h`) && !k.includes('post_drr'))
          .sort().reverse();
        if (!dates.length) return jsonResp({ error: 'No dispatch data yet. Waiting for BTD push.' }, 404);

        const current = await env.KKME_SIGNALS.get(dates[0]).catch(() => null);
        const postDrr = await env.KKME_SIGNALS.get(dates[0] + ':post_drr').catch(() => null);
        if (!current) return jsonResp({ error: 'Dispatch data missing' }, 404);

        const result = JSON.parse(current);
        if (postDrr) {
          const drr = JSON.parse(postDrr);
          result.scenarios = {
            drr_uplift_eur_mw_day: drr.revenue_per_mw.daily_eur - result.revenue_per_mw.daily_eur,
            post_drr_daily_eur: drr.revenue_per_mw.daily_eur,
            post_drr_annual_eur: drr.revenue_per_mw.annual_eur,
          };
        }
        return jsonResp(result);
      }

      // Forecast mode: compute live from da_tomorrow + rolling 180d
      try {
        const [daTomorrowRaw, rollingRaw] = await Promise.all([
          env.KKME_SIGNALS.get('da_tomorrow').catch(() => null),
          env.KKME_SIGNALS.get('s2_rolling_180d').catch(() => null),
        ]);
        if (!daTomorrowRaw) return jsonResp({ error: 'No DA tomorrow data yet (publishes ~14:00 CET)' }, 404);

        const daTomorrow = JSON.parse(daTomorrowRaw);
        const rolling = rollingRaw ? JSON.parse(rollingRaw) : null;
        const daP = daTomorrow.prices_24h || daTomorrow.lt_prices || [];

        if (!daP.length) return jsonResp({ error: 'DA tomorrow prices empty' }, 404);

        const synthBTD = rolling ? synthesizeBTDFromRolling(rolling, daTomorrow) : null;

        const current = computeDispatchV2(synthBTD, daP, {
          mw: 50, dur_h, mode: 'forecast',
          date_iso: daTomorrow.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        });
        const postDrr = computeDispatchV2(synthBTD, daP, {
          mw: 50, dur_h, mode: 'forecast', drr_active: false,
          date_iso: current.meta.date_iso,
        });

        current.scenarios = {
          drr_uplift_eur_mw_day: postDrr.revenue_per_mw.daily_eur - current.revenue_per_mw.daily_eur,
          post_drr_daily_eur: postDrr.revenue_per_mw.daily_eur,
          post_drr_annual_eur: postDrr.revenue_per_mw.annual_eur,
        };
        return jsonResp(current);
      } catch (e) {
        return jsonResp({ error: `Forecast failed: ${e.message}` }, 500);
      }
    }

    // ── GET /api/trading ──────────────────────────────────────────────────────
    // Returns dispatch analysis for a specific date (V1 backward compat).
    if (request.method === 'GET' && url.pathname === '/api/trading') {
      const date = url.searchParams.get('date');
      if (!date) return jsonResp({ error: 'date param required (YYYY-MM-DD)' }, 400);
      const cached = await env.KKME_SIGNALS.get(`trading:${date}`).catch(() => null);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', ...CORS } });
      return jsonResp({ error: 'No trading data for this date', date }, 404);
    }

    // ── GET /api/trading/latest ───────────────────────────────────────────────
    // Returns most recent trading day analysis.
    if (request.method === 'GET' && url.pathname === '/api/trading/latest') {
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse();
      if (!dates.length) return jsonResp({ error: 'No trading data yet. Run fetch-btd.js with trading datasets.' }, 404);
      const latest = await env.KKME_SIGNALS.get(dates[0]);
      if (!latest) return jsonResp({ error: 'Trading data missing' }, 404);
      return new Response(latest, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', ...CORS } });
    }

    // ── GET /api/trading/signals ──────────────────────────────────────────────
    // Returns trade signals + summary from latest analysis.
    if (request.method === 'GET' && url.pathname === '/api/trading/signals') {
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse();
      if (!dates.length) return jsonResp({ error: 'No trading data yet' }, 404);
      const raw = await env.KKME_SIGNALS.get(dates[0]);
      if (!raw) return jsonResp({ error: 'Trading data missing' }, 404);
      const d = JSON.parse(raw);
      return jsonResp({ date: d._meta?.date, signals: d.signals, totals: d.totals, strategy: d.strategy });
    }

    // ── GET /api/trading/history ──────────────────────────────────────────────
    // Returns daily summaries for the last N days.
    if (request.method === 'GET' && url.pathname === '/api/trading/history') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys.map(k => k.name).filter(k => !k.includes(':raw')).sort().reverse().slice(0, days);
      const summaries = [];
      for (const key of dates) {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) continue;
          const d = JSON.parse(raw);
          summaries.push({ date: d._meta?.date, totals: d.totals, strategy: d.strategy, signals: d.signals });
        } catch { /* skip corrupt entries */ }
      }
      return jsonResp(summaries);
    }

    // ── GET /api/trading/export ─────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/api/trading/export') {
      const format = url.searchParams.get('format') || 'json';
      const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);

      const keys = await env.KKME_SIGNALS.list({ prefix: 'trading:202' });
      const dates = keys.keys
        .map(k => k.name)
        .filter(k => !k.includes(':raw'))
        .sort()
        .reverse()
        .slice(0, days);

      const rows = [];
      for (const key of dates) {
        try {
          const raw = await env.KKME_SIGNALS.get(key);
          if (!raw) continue;
          const d = JSON.parse(raw);
          if (!d.totals) continue;
          rows.push({
            date: d._meta?.date || key.replace('trading:', ''),
            gross_eur: d.totals.gross,
            per_mw_eur: d.totals.per_mw,
            capacity_eur: d.totals.capacity,
            activation_eur: d.totals.activation,
            arbitrage_eur: d.totals.arbitrage,
            capacity_pct: d.totals.splits_pct?.capacity,
            activation_pct: d.totals.splits_pct?.activation,
            arbitrage_pct: d.totals.splits_pct?.arbitrage,
            activation_rate: d.strategy?.activation_rate_pct,
            peak_offpeak_ratio: d.strategy?.peak_offpeak_ratio,
            soc_min: d.strategy?.soc_range?.[0],
            soc_max: d.strategy?.soc_range?.[1],
          });
        } catch { /* skip corrupt entries */ }
      }

      if (format === 'csv') {
        if (rows.length === 0) return new Response('No data', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        const headers = Object.keys(rows[0]);
        const csv = [
          '# KKME Baltic BESS Dispatch Analysis',
          '# Source: kkme.eu | BTD + ENTSO-E A44',
          '# Generated: ' + new Date().toISOString(),
          '',
          headers.join(','),
          ...rows.map(r => headers.map(h => r[h] ?? '').join(','))
        ].join('\n');
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="kkme-dispatch-${days}d.csv"`,
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      return jsonResp({
        _meta: {
          source: 'kkme.eu',
          generated: new Date().toISOString(),
          days_included: rows.length,
          fields: {
            gross_eur: 'Total daily revenue (EUR)',
            per_mw_eur: 'Revenue per MW of grid connection (EUR)',
            capacity_eur: 'Capacity payment revenue (EUR)',
            activation_eur: 'Balancing activation revenue (EUR)',
            arbitrage_eur: 'Day-ahead arbitrage revenue (EUR)',
            capacity_pct: 'Capacity share of total (%)',
            activation_rate: 'Percent of 15-min ISPs with activation',
          },
          confidence: 'DERIVED from BTD clearing prices + ENTSO-E DA prices',
          distortion_note: 'FCR revenue = 0. Baltic FCR covered by TSO DRR at zero price.',
        },
        data: rows,
      });
    }

    // ── GET /extreme/latest ─────────────────────────────────────────────────
    // Returns the most recent extreme market event (DA spike or activation extreme).
    if (request.method === 'GET' && url.pathname === '/extreme/latest') {
      const raw = await env.KKME_SIGNALS.get('extreme:latest').catch(() => null);
      return jsonResp(raw ? JSON.parse(raw) : null);
    }

    // ── POST /extreme/seed — seed an extreme event (requires update secret) ──
    if (request.method === 'POST' && url.pathname === '/extreme/seed') {
      const secret = request.headers.get('X-Update-Secret');
      if (secret !== env.UPDATE_SECRET) return jsonResp({ error: 'unauthorized' }, 401);
      const body = await request.json();
      if (!body.type || !body.text) return jsonResp({ error: 'type and text required' }, 400);
      body.timestamp = body.timestamp || new Date().toISOString();
      await env.KKME_SIGNALS.put('extreme:latest', JSON.stringify(body), { expirationTtl: 7 * 86400 });
      return jsonResp({ ok: true, event: body });
    }

    // ── GET /health ──────────────────────────────────────────────────────────
    // Returns structured health of all signal KV keys. All fetches run on Workers cron.
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

      const allFresh = Object.values(signals).every(
        r => r.status === 'present' && r.stale === false,
      );

      // Legacy: include mac_cron field for backward compat but mark as deprecated
      let macCron = { status: 'deprecated', note: 'All fetches now run on Workers cron. Mac cron no longer required.' };
      try {
        const cronRaw = await env.KKME_SIGNALS.get('cron_heartbeat');
        if (cronRaw) {
          const cron = JSON.parse(cronRaw);
          macCron.last_ping = cron.timestamp ?? null;
        }
      } catch { /* ignore */ }

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

    // ── GET /health-detail ─────────────────────────────────────────────────
    // Extended health: per-signal validation, fleet quarantine, regime detection.
    if (request.method === 'GET' && url.pathname === '/health-detail') {
      try {
        const keys = ['s1', 's2', 's4_fleet', 's3', 's4', 's7', 's8', 's9'];
        const results = await Promise.all(keys.map(k => env.KKME_SIGNALS.get(k).catch(() => null)));
        const sources = {};
        const warnings = [];
        const errors = [];
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const raw = results[i];
          if (!raw) { errors.push(`${k}: no data in KV`); sources[k] = { status: 'failed', age_hours: null }; continue; }
          let d;
          try { d = JSON.parse(raw); } catch { errors.push(`${k}: invalid JSON`); sources[k] = { status: 'failed' }; continue; }
          const ts = d.fetched_at || d.updated_at || d.timestamp || null;
          const ageH = ts ? ((Date.now() - new Date(ts).getTime()) / 3600000) : null;
          const stale = ageH !== null && ageH > 12;
          if (stale) warnings.push(`${k}: stale (${Math.round(ageH)}h)`);
          const issues = validate(k, d);
          for (const iss of issues) { if (iss.severity === 'error') errors.push(iss.msg); else warnings.push(iss.msg); }
          sources[k] = { status: stale ? 'stale' : 'healthy', last_fetch: ts, age_hours: ageH ? Math.round(ageH * 10) / 10 : null };
        }
        // Fleet quarantine
        const fleetRaw = results[keys.indexOf('s4_fleet')];
        let quarantine = { fleet_entries: 0, reasons: [] };
        if (fleetRaw) {
          try {
            const fleet = JSON.parse(fleetRaw);
            const qEntries = (fleet.raw_entries || []).filter(e => e._quarantine);
            quarantine = { fleet_entries: qEntries.length, reasons: qEntries.map(e => ({ name: e.name, flags: e._contradiction_flags })) };
          } catch { /* ignore parse errors */ }
        }
        // Regime
        let s2fleet = {};
        try { s2fleet = fleetRaw ? JSON.parse(fleetRaw) : {}; } catch { /* ignore */ }
        const s7raw = results[keys.indexOf('s7')];
        let s7d = {};
        try { s7d = s7raw ? JSON.parse(s7raw) : {}; } catch { /* ignore */ }
        const regime = computeRegime({ sd_ratio: s2fleet.sd_ratio, ttf_eur_mwh: s7d.ttf_eur_mwh });
        return jsonResp({ sources, validation: { errors, warnings }, quarantine, regime, model_version: 'v5.1' });
      } catch (e) {
        return jsonResp({ error: e.message }, 500);
      }
    }

    // ── POST /heartbeat ──────────────────────────────────────────────────────
    // Legacy endpoint — kept for backward compatibility. No longer required for monitoring.
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

    // ── POST /kv/set — generic KV write from VPS ingestion pipeline ─────────
    if (request.method === 'POST' && url.pathname === '/kv/set') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return jsonResp({ error: 'unauthorized' }, 401);
      }
      const { key, value } = await request.json();
      if (!key) return jsonResp({ error: 'key required' }, 400);
      // Allowlist: only permit known keys from ingestion pipeline
      const ALLOWED_KEYS = ['s1_capture', 'revenue_trailing', 's1_trailing_12m', 's2_trailing_12m', 'capacity_monthly', 's2_rolling_180d', 'genload'];
      if (!ALLOWED_KEYS.includes(key)) {
        return jsonResp({ error: `key '${key}' not in allowlist` }, 400);
      }
      await env.KKME_SIGNALS.put(key, JSON.stringify(value));
      console.log(`[KV/set] ${key} written (${JSON.stringify(value).length} bytes)`);
      return jsonResp({ ok: true, key });
    }

    // ── GET /history/trailing — trailing 12m revenue summary ─────────────────
    if (request.method === 'GET' && url.pathname === '/history/trailing') {
      const raw = await env.KKME_SIGNALS.get('revenue_trailing');
      return jsonResp(raw ? JSON.parse(raw) : null);
    }

    // ── GET /s1/capture — DA gross capture data ──────────────────────────────
    if (request.method === 'GET' && url.pathname === '/s1/capture') {
      const raw = await env.KKME_SIGNALS.get('s1_capture');
      if (!raw) return jsonResp({ error: 'capture data not yet computed' }, 404);
      return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
    }

    // ── POST /s1/capture/backfill — backfill capture history ────────────────
    if (request.method === 'POST' && url.pathname === '/s1/capture/backfill') {
      const secret = request.headers.get('X-Update-Secret');
      if (!secret || secret !== env.UPDATE_SECRET) {
        return jsonResp({ error: 'Unauthorized' }, 401);
      }

      let body = {};
      try { body = await request.json(); } catch { /* use defaults */ }

      // Accept start/end dates or a days count
      const endDate = body.end || new Date().toISOString().slice(0, 10);
      let startDate = body.start;
      if (!startDate) {
        const days = Math.min(body.days || 30, 60); // max 60 per request to stay within Worker limits
        const d = new Date(endDate);
        d.setUTCDate(d.getUTCDate() - days);
        startDate = d.toISOString().slice(0, 10);
      }

      console.log(`[S1/backfill] range: ${startDate} → ${endDate}`);

      try {
        // Fetch entire range in one API call
        const { prices, timestamps, resolution } = await fetchEnergyCharts(startDate, endDate);
        const days = splitByDay(prices, timestamps, resolution);

        // Load existing history
        let history = [];
        try {
          const raw = await env.KKME_SIGNALS.get('s1_capture_history');
          if (raw) history = JSON.parse(raw);
        } catch { /* start fresh */ }

        const existingDates = new Set(history.map(e => e.date));
        let added = 0;
        let skipped = 0;

        for (const [dateStr, dayData] of days) {
          // Skip if already exists (unless force flag)
          if (!body.force && existingDates.has(dateStr)) {
            skipped++;
            continue;
          }

          const c2h = computeDayCapture(dayData.prices, 2, dayData.resolution);
          const c4h = computeDayCapture(dayData.prices, 4, dayData.resolution);
          const shape = priceShapeMetrics(dayData.prices, dayData.timestamps, dayData.resolution);

          // Remove existing entry for this date
          history = history.filter(e => e.date !== dateStr);
          history.push({
            date: dateStr,
            gross_2h: c2h?.gross_eur_mwh ?? null,
            gross_4h: c4h?.gross_eur_mwh ?? null,
            net_2h: c2h?.net_eur_mwh ?? null,
            net_4h: c4h?.net_eur_mwh ?? null,
            avg_charge_2h: c2h?.avg_charge ?? null,
            avg_discharge_2h: c2h?.avg_discharge ?? null,
            avg_charge_4h: c4h?.avg_charge ?? null,
            avg_discharge_4h: c4h?.avg_discharge ?? null,
            swing: shape?.swing ?? null,
            daily_avg: shape?.daily_avg ?? null,
            resolution: dayData.resolution,
            n_prices: dayData.prices.length,
          });
          added++;
        }

        // Sort by date, keep last 730 days
        history.sort((a, b) => a.date.localeCompare(b.date));
        if (history.length > 730) history = history.slice(-730);

        await env.KKME_SIGNALS.put('s1_capture_history', JSON.stringify(history));

        // Recompute current capture snapshot
        try {
          await computeCapture(env);
        } catch (e) {
          console.error('[S1/backfill] recompute failed:', String(e));
        }

        return jsonResp({
          ok: true,
          range: { start: startDate, end: endDate },
          days_in_range: days.size,
          added,
          skipped,
          total_history: history.length,
        });
      } catch (e) {
        console.error('[S1/backfill] error:', String(e));
        return jsonResp({ error: String(e) }, 500);
      }
    }

    // ── GET /read ────────────────────────────────────────────────────────────
    // da_tomorrow is now embedded in computeS1() and stored in the s1 KV key directly
    if (request.method === 'GET' && url.pathname === '/read') {
      const [s1Raw, capRaw, extremeRaw] = await Promise.all([
        env.KKME_SIGNALS.get('s1'),
        env.KKME_SIGNALS.get('s1_capture'),
        env.KKME_SIGNALS.get('extreme:latest').catch(() => null),
      ]);
      if (!s1Raw) return jsonResp({ error: 'not yet populated' }, 404);
      const s1 = JSON.parse(s1Raw);
      // Merge capture data if available and not already embedded
      if (capRaw && !s1.capture) {
        try {
          const cap = JSON.parse(capRaw);
          s1.capture = {
            gross_2h: cap.capture_2h?.gross_eur_mwh ?? null,
            gross_4h: cap.capture_4h?.gross_eur_mwh ?? null,
            net_2h: cap.capture_2h?.net_eur_mwh ?? null,
            net_4h: cap.capture_4h?.net_eur_mwh ?? null,
            rolling_30d: cap.rolling_30d,
            shape_swing: cap.shape?.swing ?? null,
            source: 'energy-charts.info',
            data_class: 'derived',
          };
        } catch { /* ignore parse errors */ }
      }
      // Attach extreme event if recent
      if (extremeRaw) {
        try { s1.extreme_event = JSON.parse(extremeRaw); } catch { /* ignore */ }
      }
      return new Response(JSON.stringify(s1), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
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
