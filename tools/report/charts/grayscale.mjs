/**
 * Phase 36.F0 — the grayscale survival test, automated.
 *
 * A bankable report gets printed, and it gets printed in black and white more
 * often than anyone designing it expects. A chart whose series are
 * distinguishable only by hue becomes a chart of identical grey shapes.
 *
 * The test: extract every fill/stroke colour a chart actually EMITTED, convert
 * to relative luminance (WCAG), and assert the minimum separation between any
 * two colours used as data marks. Extraction is from the rendered SVG, not from
 * the token file — a token set can be perfectly separated while a chart uses two
 * slots that happen to be adjacent, and it is the chart that gets printed.
 *
 * Why luminance rather than a full colour-difference metric: greyscale printing
 * IS a luminance projection. Two colours that differ only in hue collapse to the
 * same grey no matter how far apart they are in Lab.
 */

/** WCAG relative luminance. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/**
 * Colours used as DATA marks in a rendered SVG.
 *
 * Deliberately excludes the surface, the grid, the axis and text ink: those are
 * furniture, and requiring the grid to be luminance-separated from the data
 * would be requiring a loud grid. It reads fills off `<rect>` and `<path>` and
 * strokes off dashed rules, which is where every mark in this kit lives.
 */
export function markColors(svgString, { exclude = [] } = {}) {
  const out = new Set();
  for (const m of svgString.matchAll(/<(?:rect|path)[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)) out.add(m[1].toLowerCase());
  for (const m of svgString.matchAll(/<line[^>]*\bstroke="(#[0-9a-fA-F]{6})"[^>]*stroke-dasharray/g)) out.add(m[1].toLowerCase());
  for (const e of exclude) out.delete(String(e).toLowerCase());
  return [...out].sort();
}

/** Distinct `url(#pattern)` fills present in the rendered SVG. */
export function markPatterns(svgString) {
  return [...new Set([...svgString.matchAll(/fill="url\(#([a-z0-9]+)\)"/gi)].map((m) => m[1]))].sort();
}

/**
 * Survives greyscale if EITHER luminance separates the marks OR every mark
 * carries a distinct texture.
 *
 * The disjunction is not a loophole; it is the only honest answer. The
 * categorical palette validator requires slots inside a narrow lightness band so
 * that no series visually dominates. Greyscale survival requires them spread
 * across luminance. Those are opposed, and with more than two slots you cannot
 * have both — measured on our own CVD-validated dark palette, two slots sit at
 * luminance 0.259 and 0.259.
 *
 * So above two fills, colour stops being the only encoding and texture becomes
 * mandatory. A chart with three fills, no texture and colours 0.02 apart still
 * FAILS — which is the case this started from.
 *
 * @returns {{pass:boolean, via:'luminance'|'texture'|'trivial', minSeparation:number, worst:[string,string]|null, colors:string[], patterns:string[]}}
 */
export function grayscaleSurvives(svgString, { threshold = 0.10, exclude = [] } = {}) {
  const colors = markColors(svgString, { exclude });
  const patterns = markPatterns(svgString);
  if (colors.length < 2) return { pass: true, via: 'trivial', minSeparation: Infinity, worst: null, colors, patterns };
  const lums = colors.map((c) => [c, luminance(c)]).filter(([, l]) => l != null);
  let min = Infinity;
  let worst = null;
  for (let i = 0; i < lums.length; i++) {
    for (let j = i + 1; j < lums.length; j++) {
      const d = Math.abs(lums[i][1] - lums[j][1]);
      if (d < min) { min = d; worst = [lums[i][0], lums[j][0]]; }
    }
  }
  const byLuminance = min >= threshold;
  // N fills are distinguishable with N-1 patterns, because the UNTEXTURED fill
  // is itself one of the N: plain + 45° + 135° is three separable marks from two
  // patterns. What this still rejects is the case it was written for — one hatch
  // applied to alternating bands, which separates band 1 from band 2 and leaves
  // bands 1 and 3 identical.
  const byTexture = patterns.length + 1 >= colors.length;
  return {
    pass: byLuminance || byTexture,
    via: byLuminance ? 'luminance' : byTexture ? 'texture' : 'none',
    minSeparation: Math.round(min * 1000) / 1000,
    worst, colors, patterns,
  };
}
