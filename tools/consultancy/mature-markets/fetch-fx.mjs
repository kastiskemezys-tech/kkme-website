// ECB monthly-average reference rates, for the arc's "store native + EUR at period-average
// ECB rates (rate table committed, sourced)" rule.
//
// Source: ECB Data Portal, dataflow EXR, key M.<CCY>.EUR.SP00.A
//   https://data-api.ecb.europa.eu/service/data/EXR/M.<CCY>.EUR.SP00.A?format=csvdata
// Semantics: OBS_VALUE is <CCY> per 1 EUR. So price_eur = price_native / rate.
//
// Usage: node tools/consultancy/mature-markets/fetch-fx.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeManifest } from './manifest-writer.mjs';

const OUT = path.join(import.meta.dirname, '..', 'data', 'mature-markets', 'fx');
const CURRENCIES = ['GBP', 'AUD', 'SEK', 'NOK'];
const START = '2010-01';

const url = (c) =>
  `https://data-api.ecb.europa.eu/service/data/EXR/M.${c}.EUR.SP00.A?format=csvdata&startPeriod=${START}`;

async function fetchCurrency(c) {
  const u = url(c);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`ECB ${c}: HTTP ${r.status}`);
  const csv = await r.text();
  const lines = csv.trim().split('\n');
  const hdr = lines[0].split(',');
  const iTime = hdr.indexOf('TIME_PERIOD');
  const iVal = hdr.indexOf('OBS_VALUE');
  if (iTime < 0 || iVal < 0) throw new Error(`ECB ${c}: unexpected header`);
  const rates = {};
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const v = Number.parseFloat(cols[iVal]);
    if (Number.isFinite(v)) rates[cols[iTime]] = v;
  }
  return { url: u, csv, rates };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const table = { basis: 'units of currency per 1 EUR', source: 'ECB Data Portal, dataflow EXR, M.<CCY>.EUR.SP00.A', retrieved_at: new Date().toISOString(), currencies: {} };
  const manifest = { dataset: 'ecb-monthly-fx', retrieved_at: table.retrieved_at, licence: 'ECB — free reuse with attribution (https://www.ecb.europa.eu/services/using-our-site/html/index.en.html)', files: [] };

  for (const c of CURRENCIES) {
    const { url: u, csv, rates } = await fetchCurrency(c);
    const months = Object.keys(rates).sort();
    table.currencies[c] = { source_url: u, first: months[0], last: months.at(-1), n_months: months.length, rates };
    const file = `ecb-exr-M-${c}-EUR.csv`;
    await fs.writeFile(path.join(OUT, file), csv);
    manifest.files.push({
      file, source_url: u, resolution: 'P1M', span: `${months[0]}..${months.at(-1)}`,
      n_months: months.length, sha256: crypto.createHash('sha256').update(csv).digest('hex'),
    });
    console.log(`${c}: ${months.length} months ${months[0]}..${months.at(-1)}`);
  }

  await fs.writeFile(path.join(OUT, 'fx-monthly.json'), JSON.stringify(table, null, 1) + '\n');
  // 36.E0.2: manifest writes go through the one canonical writer, which preserves
  // acquisition-time evidence and refuses any write that would REMOVE a provenance key.
  await writeManifest({ dir: OUT, manifest, window: 'full', dataset: 'fx' });
  console.log(`wrote ${OUT}/fx-monthly.json`);
}

await main();
