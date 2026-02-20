/**
 * fetch-entso-e.js — KKME Signal S1: Baltic Price Separation
 * 
 * Fetches LT (Lithuania) and SE4 (Sweden zone 4) day-ahead prices
 * from ENTSO-E Transparency Platform API.
 * 
 * Output: data/prices.json — structured hourly prices for both zones
 * 
 * Usage: ENTSOE_API_TOKEN=xxx node scripts/fetch-entso-e.js
 *   or:  node scripts/fetch-entso-e.js (reads from .secrets)
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://web-api.tp.entsoe.eu/api';
const OUTPUT = path.join(__dirname, '..', 'data', 'prices.json');
const SECRETS = path.join(__dirname, '..', '..', '.secrets', 'entsoe-api-token.txt');

// ENTSO-E area codes
const AREAS = {
  LT:  '10YLT-1001A0008Q',   // Lithuania
  SE4: '10Y1001A1001A47J',   // Sweden zone 4
};

const DAYS_BACK = 7;

function getToken() {
  if (process.env.ENTSOE_API_TOKEN) return process.env.ENTSOE_API_TOKEN;
  try { return fs.readFileSync(SECRETS, 'utf8').trim(); } catch (e) {}
  throw new Error('No ENTSO-E token. Set ENTSOE_API_TOKEN or create .secrets/entsoe-api-token.txt');
}

function fmtDate(d) {
  // ENTSO-E wants yyyyMMddHHmm
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

function parseXmlPrices(xml) {
  // Extract all <Period> blocks, each containing hourly <Point> entries
  const periods = [];
  const periodRegex = /<Period>([\s\S]*?)<\/Period>/g;
  let periodMatch;

  while ((periodMatch = periodRegex.exec(xml)) !== null) {
    const block = periodMatch[1];

    // Extract period start time
    const startMatch = block.match(/<start>(.*?)<\/start>/);
    if (!startMatch) continue;
    const periodStart = new Date(startMatch[1]);

    // Extract resolution (PT60M = hourly)
    const resMatch = block.match(/<resolution>(.*?)<\/resolution>/);
    const resolution = resMatch ? resMatch[1] : 'PT60M';
    const stepMs = resolution === 'PT60M' ? 3600000 : resolution === 'PT15M' ? 900000 : 3600000;

    // Extract all points
    const pointRegex = /<Point>\s*<position>(\d+)<\/position>\s*<price\.amount>([\d.-]+)<\/price\.amount>\s*<\/Point>/g;
    let pointMatch;

    while ((pointMatch = pointRegex.exec(block)) !== null) {
      const position = parseInt(pointMatch[1]);
      const price = parseFloat(pointMatch[2]);
      const timestamp = new Date(periodStart.getTime() + (position - 1) * stepMs);

      periods.push({
        timestamp: timestamp.toISOString(),
        hour: timestamp.getUTCHours(),
        date: timestamp.toISOString().slice(0, 10),
        price,           // EUR/MWh
        position,
      });
    }
  }

  return periods.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchPrices(areaCode, areaName, token) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - DAYS_BACK);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(0, 0, 0, 0);

  const params = new URLSearchParams({
    securityToken: token,
    documentType: 'A44',
    in_Domain: areaCode,
    out_Domain: areaCode,
    periodStart: fmtDate(start),
    periodEnd: fmtDate(end),
  });

  console.log(`[${new Date().toISOString()}] Fetching ${areaName} (${DAYS_BACK}d)...`);

  const res = await fetch(`${API_BASE}?${params}`);
  const xml = await res.text();

  if (!res.ok) {
    // Extract error reason from XML if possible
    const reason = xml.match(/<Reason>\s*<code>(.*?)<\/code>\s*<text>(.*?)<\/text>/s);
    throw new Error(`API ${res.status}: ${reason ? reason[2] : xml.slice(0, 200)}`);
  }

  const prices = parseXmlPrices(xml);
  console.log(`[${new Date().toISOString()}] ${areaName}: ${prices.length} hourly prices parsed`);
  return prices;
}

function computeSpread(ltPrices, se4Prices) {
  // Match by timestamp and compute LT - SE4 spread
  const se4Map = new Map(se4Prices.map(p => [p.timestamp, p.price]));
  const spreads = [];

  for (const lt of ltPrices) {
    const se4Price = se4Map.get(lt.timestamp);
    if (se4Price !== undefined) {
      spreads.push({
        timestamp: lt.timestamp,
        date: lt.date,
        hour: lt.hour,
        lt: lt.price,
        se4: se4Price,
        spread: Math.round((lt.price - se4Price) * 100) / 100,
      });
    }
  }

  return spreads;
}

function computeStats(spreads) {
  if (!spreads.length) return {};
  const vals = spreads.map(s => s.spread);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    count: vals.length,
    avgSpread: Math.round(avg * 100) / 100,
    minSpread: sorted[0],
    maxSpread: sorted[sorted.length - 1],
    medianSpread: sorted[Math.floor(sorted.length / 2)],
    positiveHours: vals.filter(v => v > 0).length,
    negativeHours: vals.filter(v => v < 0).length,
    zeroHours: vals.filter(v => v === 0).length,
  };
}

async function main() {
  const token = getToken();
  console.log(`[${new Date().toISOString()}] ENTSO-E fetch starting (${DAYS_BACK} days back)`);

  const lt = await fetchPrices(AREAS.LT, 'LT', token);
  const se4 = await fetchPrices(AREAS.SE4, 'SE4', token);
  const spreads = computeSpread(lt, se4);
  const stats = computeStats(spreads);

  const output = {
    fetchedAt: new Date().toISOString(),
    daysBack: DAYS_BACK,
    areas: { LT: lt.length + ' hours', SE4: se4.length + ' hours' },
    stats,
    spreads,
    raw: { LT: lt, SE4: se4 },
  };

  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log(`[${new Date().toISOString()}] Stats: avg spread ${stats.avgSpread} EUR/MWh, ${stats.positiveHours} positive / ${stats.negativeHours} negative hours`);
  console.log(`[${new Date().toISOString()}] Written to ${OUTPUT} (${spreads.length} spread points)`);
}

main().catch(e => {
  console.error(`[${new Date().toISOString()}] FATAL: ${e.message}`);
  process.exit(1);
});
