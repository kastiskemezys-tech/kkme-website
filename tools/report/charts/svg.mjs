/**
 * Phase 36.F0 — SVG primitives. Pure functions, no runtime, no canvas.
 *
 * Canvas is excluded on evidence: the Chart.js CSS-variable failure is on record.
 * A printed report also has no runtime at all, so anything requiring JS to render
 * is not a chart here — it is a blank rectangle in a PDF.
 *
 * DETERMINISM IS A CONTRACT, not an accident. Same input → byte-identical SVG,
 * gated. That is what makes a report diff reviewable: if the numbers did not
 * move, the file does not change, so any diff at all is a real diff.
 * Consequences that shape this file: no `Math.random`, no `Date.now`, no
 * iteration over unordered maps, and every number formatted through `n()` so
 * float noise cannot leak into the output.
 */

/** Fixed-precision number. 3dp is below the resolution of any print device. */
export const n = (v) => {
  if (!Number.isFinite(v)) throw new Error(`non-finite coordinate: ${v}`);
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Linear scale. Returns a function plus its domain, so ticks can be derived. */
export function scaleLinear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const f = (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
  f.domain = domain;
  f.range = range;
  return f;
}

/**
 * "Nice" tick values — deterministic, and always INCLUDING zero for a value axis.
 *
 * A bar chart whose y-axis does not start at zero misstates every comparison it
 * makes, and the report rule is that a truncated axis needs an explicit
 * zero-break marker. This helper cannot produce a silently truncated axis: it
 * extends the domain to zero unless `allowTruncation` is passed, which the
 * caller must then justify by drawing the break.
 */
export function niceTicks(min, max, count = 5, { allowTruncation = false } = {}) {
  let lo = min;
  let hi = max;
  if (!allowTruncation) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) { hi = lo + 1; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return { ticks: out, domain: [Math.min(lo, out[0]), Math.max(hi, out[out.length - 1])] };
}

export const fmt = {
  eur0: (v) => `€${Math.round(v).toLocaleString('en-GB')}`,
  eurM: (v) => `€${(v / 1e6).toFixed(1)}m`,
  x2: (v) => `${v.toFixed(2)}×`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  int: (v) => Math.round(v).toLocaleString('en-GB'),
};

/**
 * A 45° hatch pattern — the secondary encoding that makes colour non-load-bearing.
 *
 * Present for three cases the palette alone cannot cover: severe CVD, black-and-
 * white printing, and forced-colors mode. Every stacked or filled chart offers
 * it, so identity never rests on hue alone.
 */
export function hatchDefs(t) {
  // FIVE DISTINCT patterns, one per categorical slot. Not one shared hatch:
  // a single pattern applied to alternating bands separates band 1 from band 2
  // and leaves bands 1 and 3 identical.
  //
  // Why this exists at all is the finding of this phase. The categorical
  // palette validator wants slots inside a NARROW lightness band, so no series
  // visually dominates. Greyscale survival wants them SPREAD across luminance,
  // so they separate when desaturated. Those two requirements are directly
  // opposed, and with five slots you cannot satisfy both — measured: the
  // CVD-validated dark palette has two slots at luminance 0.259 and 0.259,
  // identical, while passing every colour check.
  //
  // So above two series, colour stops being the only encoding. Texture is
  // MANDATORY rather than decorative, and the grayscale gate accepts pattern
  // distinctness in place of luminance separation.
  const P = [
    ['h0',  0, 'line'],
    ['h45', 45, 'line'],
    ['h90', 90, 'line'],
    ['h135', 135, 'line'],
    ['dot', 0, 'dot'],
  ];
  return `<defs>${P.map(([id, rot, kind]) => (
    `<pattern id="${id}" width="6" height="6" patternTransform="rotate(${rot})" patternUnits="userSpaceOnUse">`
    + (kind === 'dot'
      ? `<circle cx="3" cy="3" r="1.3" fill="${t.hatch}" opacity="0.6"/>`
      : `<line x1="0" y1="0" x2="0" y2="6" stroke="${t.hatch}" stroke-width="1.8" opacity="0.6"/>`)
    + '</pattern>'
  )).join('')}</defs>`;
}

/** The pattern id for categorical slot `i`. Parallel to `seriesColor`. */
export const PATTERN_IDS = ['h0', 'h45', 'h90', 'h135', 'dot'];
export const patternId = (i) => PATTERN_IDS[i] ?? PATTERN_IDS[PATTERN_IDS.length - 1];

export function text(x, y, s, { fill, size, anchor = 'start', family, weight, baseline } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" fill="${fill}" font-size="${size}" font-family="${family}"`
    + (anchor !== 'start' ? ` text-anchor="${anchor}"` : '')
    + (weight ? ` font-weight="${weight}"` : '')
    + (baseline ? ` dominant-baseline="${baseline}"` : '')
    + `>${esc(s)}</text>`;
}

export function rect(x, y, w, h, fill, extra = '') {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" fill="${fill}"${extra}/>`;
}

export function line(x1, y1, x2, y2, stroke, width = 1, extra = '') {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${width}"${extra}/>`;
}

/**
 * The source/as-of line every chart carries.
 *
 * `source` is REQUIRED at every call site and this throws without it. A chart
 * that can render without naming where its numbers came from is a rule-#3 hole
 * with a picture on it — and a printed chart travels further from its context
 * than a card on a page ever does.
 */
export function sourceLine(t, x, y, width, source, asOf) {
  if (!source || typeof source !== 'string' || !source.trim()) {
    throw new Error('every chart requires a non-empty `source` — a chart that can render without naming its origin is a rule-#3 hole');
  }
  const s = asOf ? `${source} · as of ${asOf}` : source;
  return line(x, y - 8, x + width, y - 8, t.grid, 1)
    + text(x, y + 3, s, { fill: t.inkMuted, size: 8, family: 'var(--report-mono)' });
}

/** Frame: title, plot area, source line. Every chart uses it, so they agree. */
export function frame({ t, width, height, title, subtitle, source, asOf, pad }) {
  const p = { top: 34, right: 16, bottom: 44, left: 62, ...pad };
  const plot = { x: p.left, y: p.top, w: width - p.left - p.right, h: height - p.top - p.bottom };
  const head = text(14, 18, title, { fill: t.ink, size: 12, family: 'var(--report-mono)', weight: 600 })
    + (subtitle ? text(14, 30, subtitle, { fill: t.inkSecondary, size: 9, family: 'var(--report-mono)' }) : '');
  const foot = sourceLine(t, 14, height - 8, width - 28, source, asOf);
  return { plot, head, foot };
}

export function svg(width, height, t, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}" role="img" style="--report-mono:'IBM Plex Mono',monospace">`
    + rect(0, 0, width, height, t.surface)
    + body
    + '</svg>';
}
