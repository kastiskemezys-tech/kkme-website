// KKME — Centralised KV read/write with validation and 3-layer fallback.
// Layer 1: live KV  →  Layer 2: stale KV  →  Layer 3: static defaults

import { DEFAULTS, SANITY_BOUNDS, STALE_THRESHOLDS_HOURS } from './defaults.js';

// ─── Validation helpers ──────────────────────────────────────────────────────

export function checkBounds(signalKey, data) {
  const bounds = SANITY_BOUNDS[signalKey];
  if (!bounds) return { valid: true, errors: [] };
  const errors = [];
  for (const [field, [min, max]] of Object.entries(bounds)) {
    const v = data[field];
    if (v !== undefined && v !== null) {
      if (typeof v !== 'number' || isNaN(v)) {
        errors.push(`${field}: not a number (${v})`);
      } else if (v < min || v > max) {
        errors.push(`${field}: ${v} outside bounds [${min}, ${max}]`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function checkRequired(data, requiredFields) {
  const errors = [];
  for (const field of requiredFields) {
    const v = data[field];
    if (v === undefined || v === null) {
      errors.push(`${field}: missing or null`);
    } else if (typeof v === 'number' && (isNaN(v) || !isFinite(v))) {
      errors.push(`${field}: NaN or Infinity`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── KV write with validation ────────────────────────────────────────────────

/**
 * Write data to KV with optional required-field and bounds validation.
 * @param {KVNamespace} kv
 * @param {string} key
 * @param {object} data
 * @param {{ required?: string[], bounds_key?: string|null }} options
 * @returns {{ success: boolean, errors: string[] }}
 */
export async function kvWrite(kv, key, data, options = {}) {
  const { required = [], bounds_key = null } = options;
  const errors = [];

  const req = checkRequired(data, required);
  if (!req.valid) errors.push(...req.errors);

  if (bounds_key) {
    const bounds = checkBounds(bounds_key, data);
    if (!bounds.valid) errors.push(...bounds.errors);
  }

  if (errors.length > 0) {
    console.error(`[KV] write REJECTED [${key}]:`, errors.join(' | '));
    return { success: false, errors, action: 'rejected — KV not updated' };
  }

  const payload = {
    ...data,
    _meta: {
      written_at:        new Date().toISOString(),
      source:            data._source ?? 'live',
      validation_passed: true,
    },
  };

  await kv.put(key, JSON.stringify(payload));
  console.log(`[KV] write OK [${key}]`);
  return { success: true, errors: [] };
}

// ─── KV read with staleness check and default fallback ──────────────────────

/**
 * Read from KV. Returns stale data if present, falls back to static defaults.
 * @param {KVNamespace} kv
 * @param {string} key
 * @param {string|null} signalName - key to use for DEFAULTS and STALE_THRESHOLDS
 * @returns {object|null}
 */
export async function kvRead(kv, key, signalName = null) {
  try {
    const raw = await kv.get(key);

    if (!raw) {
      const def = DEFAULTS[signalName ?? key];
      if (def) {
        console.warn(`[KV] [${key}] empty — serving static defaults`);
        return { ...def, _serving: 'static_defaults' };
      }
      return null;
    }

    const data = JSON.parse(raw);

    const thresholdKey = signalName ?? key;
    const threshold    = STALE_THRESHOLDS_HOURS[thresholdKey] ?? 48;
    const ts           = data.timestamp ?? data._meta?.written_at ?? data.updated_at;
    const ageH         = ts
      ? (Date.now() - new Date(ts).getTime()) / 3600000
      : Infinity;

    if (ageH > threshold) {
      console.warn(`[KV] [${key}] stale: ${ageH.toFixed(1)}h (threshold: ${threshold}h)`);
      return {
        ...data,
        _stale:                   true,
        _age_hours:               parseFloat(ageH.toFixed(1)),
        _stale_threshold_hours:   threshold,
        _serving:                 'stale_cache',
      };
    }

    return {
      ...data,
      _stale:     false,
      _age_hours: parseFloat(ageH.toFixed(1)),
      _serving:   'live',
    };

  } catch (e) {
    console.error(`[KV] read error [${key}]:`, e);
    const def = DEFAULTS[signalName ?? key];
    return def
      ? { ...def, _serving: 'static_defaults', _default_reason: `KV parse error: ${e.message}` }
      : null;
  }
}
