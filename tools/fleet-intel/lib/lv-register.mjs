// Latvian Uzņēmumu reģistrs — bulk open data resolver.
//
// Replaces the Lursoft scrape that turned out not to be a search at all (B11).
// Same pattern as the EE route: free bulk download, CC0, daily, no scraping and
// no CAPTCHA. Source: data.gov.lv dataset "Uzņēmumu reģistrs" (register.csv) and
// dati.ur.gov.lv (register_name_history.csv).
//
// Two files, two jobs:
//   register.csv               — current entities, incl. `terminated` / `closed`,
//                                which are 37.B's decay signals at the source
//   register_name_history.csv  — former names. This is what stops 37.B retiring a
//                                live project that merely renamed: a name that has
//                                vanished from the current register may be a
//                                liquidation OR a rename, and only this file tells
//                                the two apart.

import fs from 'node:fs';
import readline from 'node:readline';
import { normName, bareName } from './normalise.mjs';

export const REGISTER_CSV = '.cache/lv-register/register.csv';
export const NAME_HISTORY_CSV = '.cache/lv-register/register_name_history.csv';

/** Citation target — the dataset is the primary source; regcode is the locator. */
export const LV_REGISTER_DATASET_URL =
  'https://data.gov.lv/dati/lv/dataset/uz';
export const LV_REGISTER_FILE_URL =
  'https://data.gov.lv/dati/dataset/4de9697f-850b-45ec-8bba-61fa09ce932f/resource/25e80bf3-f107-4ab4-89ef-251b5b9374e9/download/register.csv';

/** Entity-name key: legal form stripped and normalised, so `SIA "X"` == `X, SIA`. */
export function nameKey(s) {
  return normName(bareName(String(s || '').replace(/^"|"$/g, '')));
}

function splitSemicolon(line) {
  // The UR export is semicolon-delimited with optional double-quoting.
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ';' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Build the lookup index. Streams both files so the 122 MB register is never held
 * in memory as text.
 *
 * @returns {{byName: Map, byHistoricName: Map, stats: object}}
 */
export async function buildIndex({
  registerPath = REGISTER_CSV,
  historyPath = NAME_HISTORY_CSV,
} = {}) {
  const byName = new Map();
  const byHistoricName = new Map();
  const stats = { entities: 0, historic: 0, terminated: 0 };

  const rl = readline.createInterface({ input: fs.createReadStream(registerPath), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = splitSemicolon(line);
    if (!header) { header = f.map((h) => h.trim()); continue; }
    const rec = {};
    // TRIM every field. The UR export writes whitespace-only cells (`closed` is a
    // single space on live entities), and an untrimmed truthiness check reads those
    // as "this company is closed" — which marked all 486k entities terminated and
    // would have retired the entire LV fleet in 37.B.
    header.forEach((h, i) => { rec[h] = (f[i] ?? '').trim(); });
    // `name_in_quotes` is the trading name; `name` carries the full legal string
    const primary = rec.name_in_quotes || rec.without_quotes || rec.name;
    if (!primary) continue;
    const key = nameKey(primary);
    if (!key) continue;
    const entity = {
      regcode: rec.regcode,
      name: rec.name,
      trading_name: primary,
      type: rec.type_text || rec.type,
      registered: rec.registered || '',
      terminated: rec.terminated || '',
      closed: rec.closed || '',
      address: rec.address || '',
      city: rec.city || '',
    };
    if (entity.terminated || entity.closed) stats.terminated++;
    // a name can repeat across entities; keep a list
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entity);
    stats.entities++;
  }

  if (fs.existsSync(historyPath)) {
    const rl2 = readline.createInterface({ input: fs.createReadStream(historyPath), crlfDelay: Infinity });
    let h2 = null;
    for await (const line of rl2) {
      if (!line.trim()) continue;
      const f = splitSemicolon(line);
      if (!h2) { h2 = f.map((x) => x.trim()); continue; }
      const rec = {};
      h2.forEach((h, i) => { rec[h] = (f[i] ?? '').trim(); });
      const key = nameKey(rec.name);
      if (!key) continue;
      if (!byHistoricName.has(key)) byHistoricName.set(key, []);
      byHistoricName.get(key).push({ regcode: rec.regcode, former_name: rec.name, date_to: rec.date_to });
      stats.historic++;
    }
  }

  return { byName, byHistoricName, stats };
}

/**
 * Resolve a company name against the register.
 *
 * `matched_via: 'historic'` is the case 37.B must never read as a death: the name
 * is gone from the current register because the company RENAMED, not because it
 * was liquidated. The regcode carries through the rename, so the live entity is
 * still resolvable.
 */
export function lookupLV(index, name) {
  const key = nameKey(name);
  if (!key) return { found: false, reason: 'empty name' };

  const current = index.byName.get(key);
  if (current && current.length) {
    const live = current.find((e) => !e.terminated && !e.closed) || current[0];
    return {
      found: true,
      matched_via: 'current',
      regcode: live.regcode,
      trading_name: live.trading_name,
      type: live.type,
      registered: live.registered,
      terminated: live.terminated || null,
      closed: live.closed || null,
      status: live.terminated || live.closed ? 'terminated' : 'active',
      address: live.address,
      candidates: current.length,
    };
  }

  const historic = index.byHistoricName.get(key);
  if (historic && historic.length) {
    const h = historic[0];
    // follow the regcode into the current register to see what it is called now
    let now = null;
    for (const list of index.byName.values()) {
      const hit = list.find((e) => e.regcode === h.regcode);
      if (hit) { now = hit; break; }
    }
    return {
      found: true,
      matched_via: 'historic',
      regcode: h.regcode,
      former_name: h.former_name,
      renamed_on: h.date_to,
      current_name: now ? now.trading_name : null,
      status: now ? (now.terminated || now.closed ? 'terminated' : 'active') : 'unknown',
      note: 'name resolved via FORMER-name history — absence from the current register is a RENAME, not a removal',
    };
  }

  return { found: false, matched_via: null };
}

/** Citation object for a resolved entity (rule #3: resolvable URL + locator). */
export function citationFor(result) {
  if (!result || !result.found) return null;
  return {
    source_type: 'registry',
    source_key: 'lv_ur_opendata',
    url: LV_REGISTER_FILE_URL,
    what_it_confirms: `entity resolves in the Latvian Uzņēmumu reģistrs, reg. ${result.regcode}, status ${result.status}${result.matched_via === 'historic' ? ' (matched via former name)' : ''}`,
    locator: result.regcode,
    confidence: 'normal',
  };
}
