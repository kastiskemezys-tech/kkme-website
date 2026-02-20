/**
 * fetch-entso-e.js — KKME Signal S1: Baltic Price Separation
 * 
 * Fetches LT (Lithuania) and SE4 (Sweden zone 4) day-ahead prices
 * from ENTSO-E Transparency Platform API.
 * 
 * Output: data/prices.json
 * 
 * Usage: node scripts/fetch-entso-e.js
 * 
 * Requires: ENTSOE_API_TOKEN environment variable
 * Get your token: https://transparency.entsoe.eu/ → register → request API token
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://web-api.tp.entsoe.eu/api';
const OUTPUT = path.join(__dirname, '..', 'data', 'prices.json');

// ENTSO-E area codes
const AREAS = {
  LT: '10YLT-1001A0008Q',   // Lithuania
  SE4: '10Y1001A1001A47J',   // Sweden zone 4
};

// Date helpers
function formatDate(d) {
  return d.toISOString().replace(/[-:]/g, '').slice(0, 12) + '00';
}

function getDateRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7); // Last 7 days
  const end = new Date(now);
  end.setDate(end.getDate() + 1); // Include tomorrow if available
  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}

async function fetchDayAheadPrices(areaCode, areaName) {
  const token = process.env.ENTSOE_API_TOKEN;
  if (!token) {
    throw new Error('ENTSOE_API_TOKEN not set. Get one at https://transparency.entsoe.eu/');
  }

  const { start, end } = getDateRange();
  const params = new URLSearchParams({
    securityToken: token,
    documentType: 'A44',           // Day-ahead prices
    in_Domain: areaCode,
    out_Domain: areaCode,
    periodStart: start,
    periodEnd: end,
  });

  const url = `${API_BASE}?${params}`;
  console.log(`[${new Date().toISOString()}] Fetching ${areaName} prices...`);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ENTSO-E API ${res.status}: ${body.slice(0, 200)}`);
  }

  const xml = await res.text();
  // TODO: Parse XML response into structured price data
  // ENTSO-E returns XML — will need xml2js or manual parsing
  console.log(`[${new Date().toISOString()}] ${areaName}: received ${xml.length} chars`);
  return { area: areaName, areaCode, rawLength: xml.length, fetchedAt: new Date().toISOString() };
}

async function main() {
  console.log(`[${new Date().toISOString()}] ENTSO-E price fetch starting`);

  const results = {};
  for (const [name, code] of Object.entries(AREAS)) {
    try {
      results[name] = await fetchDayAheadPrices(code, name);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ERROR ${name}: ${e.message}`);
      results[name] = { area: name, error: e.message, fetchedAt: new Date().toISOString() };
    }
  }

  // Ensure output dir exists
  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`[${new Date().toISOString()}] Written to ${OUTPUT}`);
  console.log(`[${new Date().toISOString()}] Done.`);
}

main().catch(e => {
  console.error(`[${new Date().toISOString()}] FATAL: ${e.message}`);
  process.exit(1);
});
