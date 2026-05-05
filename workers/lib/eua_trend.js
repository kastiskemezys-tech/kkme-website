// Pure helper: compute EUA carbon-price trend symbol from s9_history KV entries.
//
// History entries shape (per `appendSignalHistory` in fetch-s1.js):
//   { date: 'YYYY-MM-DD', eua_eur_t: <number> }
//
// We compare `currentValue` against the entry from ~7 days ago, falling back to the
// oldest valid entry if history is shorter. ±1% is the "stable" band — narrower than
// daily EUA volatility so a single noisy reading won't flip the symbol.

const RISING_BAND_PCT  = 1;
const FALLING_BAND_PCT = -1;
const TARGET_LOOKBACK_DAYS = 7;

const SYMBOL_RISING  = '↑ rising';
const SYMBOL_STABLE  = '→ stable';
const SYMBOL_FALLING = '↓ falling';

/**
 * @param {Array<{date?: string, eua_eur_t?: number|null}>} history  s9_history KV value
 * @param {number|null|undefined} currentValue                       latest eua_eur_t
 * @returns {string|null}  '↑ rising' | '→ stable' | '↓ falling' | null (no usable history)
 */
export function computeEUATrend(history, currentValue) {
  if (!Array.isArray(history) || history.length === 0) return null;
  if (currentValue == null || !Number.isFinite(currentValue) || currentValue <= 0) return null;

  const validPast = history
    .filter(h => h && Number.isFinite(h.eua_eur_t) && h.eua_eur_t > 0)
    .map(h => ({ date: h.date, eua_eur_t: h.eua_eur_t }));

  if (validPast.length === 0) return null;

  // Prefer the entry closest to (but not newer than) TARGET_LOOKBACK_DAYS ago.
  // Fall back to the oldest valid entry if history is shorter than the target window.
  const sortedAsc = validPast.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lastIdx   = sortedAsc.length - 1;
  const targetIdx = Math.max(0, lastIdx - TARGET_LOOKBACK_DAYS);
  const past      = sortedAsc[targetIdx];
  if (!past || !Number.isFinite(past.eua_eur_t) || past.eua_eur_t <= 0) return null;

  const pctChange = ((currentValue - past.eua_eur_t) / past.eua_eur_t) * 100;
  if (pctChange >  RISING_BAND_PCT)  return SYMBOL_RISING;
  if (pctChange <  FALLING_BAND_PCT) return SYMBOL_FALLING;
  return SYMBOL_STABLE;
}
