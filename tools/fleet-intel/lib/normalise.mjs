// Parser + normaliser for the private fleet-intel workbook.
//
// Built against the ACTUAL cell shapes found at Pause A (2026-07-31), not against
// assumed chaos: 24 cells out of 141 rows need string parsing, the rest are native
// numeric cells. See docs/investigations/2026-07-31-phase-37-a-pause-a.md §5.
//
// Anything that does not match a known shape gets parse_confidence 'low' and keeps
// raw_power_text. Nothing is ever silently coerced to a number.

import crypto from 'node:crypto';

export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

/**
 * Name normalisation, matching the worker's normName (workers/fetch-s1.js:234) so
 * the match engine compares like with like — rule #4, one normalisation.
 */
export function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[„“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip the legal form to get the bare trading name.
 *
 * It appears at EITHER end depending on the source: the private workbook writes
 * `UAB "Name"` while the public fleet DB writes `Name, UAB`. Stripping only the
 * prefix left those two forms unequal, which suppressed exact matching across the
 * whole LT sheet — found in the first real intake run.
 */
export function bareName(s) {
  return String(s || '')
    .replace(/^\s*(UAB|AB|MB|VŠĮ|SIA|AS|OÜ|OU)\s+/i, '')
    .replace(/\s*,?\s*(UAB|AB|MB|VŠĮ|SIA|AS|OÜ|OU)\s*$/i, '')
    .replace(/^[„“"']|[„“”"']$/g, '')
    .trim();
}

const LEGAL_FORM = /(^|\s)(UAB|AB|MB|VŠĮ|SIA|AS|OÜ|OU|GmbH|ApS|A\/S|S\.A\.|SL|Ltd|Oy)(\s|$|")/i;

/**
 * Is this SPV cell an actual legal entity, or a project descriptor?
 * Pause-A finding: LV/EE mix the two ("BESS Riga Tornkalns" is not a company).
 * Registry lookup only applies to entities — routing descriptors there would
 * report a false 0% hit rate.
 */
export function isLegalEntity(spv) {
  return LEGAL_FORM.test(String(spv || ''));
}

const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
};

/**
 * Parse one power cell into structured components.
 *
 * Known shapes (all observed in the real workbook):
 *   native number            → 70            → { site_total_mw: 70 }            high
 *   decimal comma            → "199,8"       → { site_total_mw: 199.8 }         high
 *   value+unit ENERGY        → "40 MWh"      → { bess_mwh: 40 }                 low   ← unit trap
 *   compound MW/MWh          → "100 MW / 200 MWh" → { bess_mw:100, bess_mwh:200 } high
 *   compound BESS+PV         → "10MWh BESS / 4.4 MWp PV" → { bess_mwh:10, pv_mwp:4.4 } medium
 *   anything else            → { }                                             low
 *
 * The "40 MWh" case is the dangerous one: an ENERGY value sitting in a column
 * labelled "Max power MW". Parsed naively it becomes a 40 MW project that does not
 * exist. It is deliberately routed to bess_mwh with LOW confidence.
 */
export function parsePower(raw) {
  const out = { raw_power_text: raw === null || raw === undefined ? '' : String(raw).trim() };
  const text = out.raw_power_text;

  if (text === '') return { ...out, parse_confidence: CONFIDENCE.LOW };

  // plain numeric (native cell or decimal-comma string)
  const plain = num(text);
  if (plain !== null) {
    return { ...out, site_total_mw: plain, parse_confidence: CONFIDENCE.HIGH };
  }

  // bare energy value in a power column — the unit trap
  const energyOnly = text.match(/^([\d.,]+)\s*MWh$/i);
  if (energyOnly) {
    const v = num(energyOnly[1]);
    return { ...out, bess_mwh: v ?? undefined, parse_confidence: CONFIDENCE.LOW };
  }

  // bare power value with unit
  const powerOnly = text.match(/^([\d.,]+)\s*MW$/i);
  if (powerOnly) {
    const v = num(powerOnly[1]);
    return { ...out, site_total_mw: v ?? undefined, parse_confidence: CONFIDENCE.HIGH };
  }

  // compound "<a> MW / <b> MWh" — power and energy of the same BESS
  const mwMwh = text.match(/^\s*([\d.,]+)\s*MW\s*\/\s*([\d.,]+)\s*MWh\s*$/i);
  if (mwMwh) {
    const mw = num(mwMwh[1]); const mwh = num(mwMwh[2]);
    return {
      ...out,
      ...(mw !== null ? { bess_mw: mw, site_total_mw: mw } : {}),
      ...(mwh !== null ? { bess_mwh: mwh } : {}),
      parse_confidence: mw !== null && mwh !== null ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
    };
  }

  // compound hybrid "<a>MWh BESS / <b> MWp PV" or "<a>MW Bess / <b> MWp PV"
  const hybrid = text.match(/([\d.,]+)\s*(MWh|MW)\s*BESS\s*\/\s*([\d.,]+)\s*MWp?\s*PV/i);
  if (hybrid) {
    const v = num(hybrid[1]);
    const unit = hybrid[2].toLowerCase();
    const pv = num(hybrid[3]);
    return {
      ...out,
      ...(v !== null ? (unit === 'mwh' ? { bess_mwh: v } : { bess_mw: v }) : {}),
      ...(pv !== null ? { pv_mwp: pv } : {}),
      // hybrid strings give either power or energy, never both — medium at best
      parse_confidence: CONFIDENCE.MEDIUM,
    };
  }

  return { ...out, parse_confidence: CONFIDENCE.LOW };
}

/**
 * LT sheet carries the BESS component in its own column, so hybrid decomposition
 * is direct rather than string-parsed. Pause-A cross-tab: on all 39 pure-BESS rows
 * the two columns agree exactly; on hybrids they diverge. The 3 rows where a hybrid
 * type shows equal values are anomalies → LOW confidence, never a silent assumption.
 */
export function decomposeLT({ maxPower, bessPower, plantType }) {
  const total = num(maxPower);
  const bess = num(bessPower);
  const isPureBess = /^BESS$/i.test(String(plantType || '').trim());

  if (total === null || bess === null) {
    return {
      ...(total !== null ? { site_total_mw: total } : {}),
      ...(bess !== null ? { bess_mw: bess } : {}),
      parse_confidence: CONFIDENCE.LOW,
    };
  }

  const equal = Math.abs(total - bess) < 1e-9;
  const nonBessMw = equal ? 0 : Math.round((total - bess) * 1000) / 1000;

  // hybrid type but identical columns ⇒ the anomaly case
  const anomalous = !isPureBess && equal;

  return {
    site_total_mw: total,
    bess_mw: bess,
    ...(nonBessMw > 0 ? { non_bess_mw: nonBessMw } : {}),
    parse_confidence: anomalous ? CONFIDENCE.LOW : CONFIDENCE.HIGH,
    ...(anomalous ? { parse_note: 'hybrid plant type but site total equals BESS MW — component split unverified' } : {}),
  };
}

/**
 * Stable row ID. Deliberately NOT keyed on name alone: the LT sheet has 82 distinct
 * SPV names across 84 rows, so a name key would collide and silently merge two
 * projects. Country + SPV + org + location is stable across re-imports as long as
 * the operator does not rewrite those cells, and collides only on genuine duplicates.
 */
export function stableId({ country, spv, org, location }) {
  const basis = [country, normName(spv), normName(org), normName(location)].join('|');
  const hash = crypto.createHash('sha256').update(basis).digest('hex').slice(0, 10);
  const slug = normName(bareName(spv)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'row';
  return `fi-${String(country || '??').toLowerCase()}-${slug}-${hash}`;
}

/**
 * Normalise one raw sheet row into the internal representation.
 * `raw` uses the workbook's own column names; sheet drives which power path is used.
 *
 * The returned object mixes public-eligible and private fields — separating them is
 * tiers.toPublicRow's job, never the caller's.
 */
export function normaliseRow(raw, sheet) {
  const country = String(sheet || '').toUpperCase();
  const spv = String(raw.SPV ?? '').trim();
  const org = String(raw.Organizacija ?? '').trim();
  const plantType = String(raw['Power plant type'] ?? '').trim();
  const location = String(raw.Vieta ?? '').trim();

  const power = country === 'LT'
    ? decomposeLT({ maxPower: raw['Max power MW'], bessPower: raw['Bess (MW)'], plantType })
    : parsePower(raw['Max power MW']);

  const row = {
    id: stableId({ country, spv, org, location }),
    country,
    spv,
    org,
    plant_type: plantType,
    location,
    is_legal_entity: isLegalEntity(spv),
    ...power,
    // private overlay — never published, see tiers.ALWAYS_PRIVATE_FIELDS
    contact: raw.Kontaktas ? String(raw.Kontaktas).trim() : '',
    comment: raw.Komentaras ? String(raw.Komentaras).trim() : '',
    // opaque operator testimony, unverifiable as of Pause A — private, unscored
    ...(raw.APVA ? { apva_flag: String(raw.APVA).trim() } : {}),
  };

  if (country === 'LT' && !row.raw_power_text) {
    row.raw_power_text = `${raw['Max power MW'] ?? ''} | ${raw['Bess (MW)'] ?? ''}`.trim();
  }
  return row;
}
