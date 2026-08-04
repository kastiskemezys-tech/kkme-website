/**
 * Phase 36.F0 — the report's one token set.
 *
 * No raw colour literal appears anywhere in chart code; a gate enforces it. Same
 * rule the site runs under, for the same reason: a colour typed at a call site is
 * a colour nobody can change, and in a printed report it is a colour nobody can
 * check either.
 *
 * ─── The palettes were COMPUTED, not chosen ─────────────────────────────────
 *
 * Both were run through the categorical-palette validator (lightness band,
 * chroma floor, adjacent-pair CVD separation, normal-vision floor, contrast vs
 * surface) and both return ALL CHECKS PASS. That matters more than usual here,
 * because a printed report is read by whoever the lender hands it to.
 *
 * What the validator rejected on the way, recorded so nobody re-proposes it:
 *
 *   · **The site's own chart hues fail as a categorical set.** `#4d7cb5` (blue)
 *     against `#7b5ea7` (purple) is ΔE 9.4 in NORMAL vision and 3.4 under
 *     deuteranopia — a hard fail, not a warning. The site gets away with it
 *     because those hues are rarely adjacent in one chart; a stacked revenue
 *     area puts them touching.
 *   · **Dark is not light flipped.** The dark band is L 0.48–0.67 against the
 *     light band's 0.43–0.77, so the first attempt — lightening the print hues —
 *     landed every step ABOVE the band. The dark steps are darker, not lighter,
 *     and were re-derived from the same hues rather than inverted.
 *
 * Light is the default, because the default output is print.
 */

/** Categorical series, in FIXED order. A sixth series is never a generated hue. */
const SERIES_LIGHT = ['#008a78', '#a8761f', '#5c4080', '#2f7a48', '#1f5c8f'];
const SERIES_DARK  = ['#0f9e8b', '#b08430', '#8b68bd', '#4a9b68', '#357fbd'];

/**
 * Semantic slots, kept OUT of the categorical order.
 *
 * A waterfall's increase/decrease/total are not "series 1, 2, 3" — they are
 * polarity and role. Reusing categorical slots for them is how a chart ends up
 * saying two different things with one colour.
 */
export const THEMES = {
  light: {
    name: 'light',
    surface: '#fcfcfb',
    surfaceAlt: '#f4f2ee',
    ink: '#1a1a19',
    inkSecondary: '#4a4a47',
    inkMuted: '#7a7a75',
    grid: '#e2ded6',
    axis: '#b8b3a8',
    rule: '#1a1a19',
    series: SERIES_LIGHT,
    positive: '#2f7a48',
    negative: '#a83232',
    total: '#3a3a37',
    covenant: '#a83232',
    band: '#ded9cf',
    hatch: '#7a7a75',
  },
  dark: {
    name: 'dark',
    surface: '#1a1a19',
    surfaceAlt: '#242422',
    ink: '#e8e2d9',
    inkSecondary: '#b5b0a6',
    inkMuted: '#8a857c',
    grid: '#33322f',
    axis: '#4f4d48',
    rule: '#e8e2d9',
    series: SERIES_DARK,
    positive: '#4a9b68',
    negative: '#c25a5a',
    total: '#9a958c',
    covenant: '#c25a5a',
    band: '#2e2d2a',
    hatch: '#8a857c',
  },
};

export const TYPE = {
  family: "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace",
  serif: "'Newsreader', Georgia, serif",
  axis: 9,
  label: 9.5,
  value: 10,
  title: 12,
  source: 8,
};

/** A4 at 96dpi, minus sane margins. Charts are sized to the text column. */
export const GEOMETRY = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 20,
  bottomSafeMm: 15,
  chartWidth: 640,
  chartHeight: 320,
};

export function theme(name = 'light') {
  const t = THEMES[name];
  if (!t) throw new Error(`unknown theme '${name}' — themes are ${Object.keys(THEMES).join(', ')}`);
  return t;
}

/**
 * Series colour by INDEX, never cycled.
 *
 * Cycling is the failure this throws on: a ninth series silently reusing slot 1
 * means two entities share an identity, and in a static report nobody hovers to
 * find out which is which. Fold into "Other", facet, or use small multiples.
 */
export function seriesColor(t, i) {
  if (i >= t.series.length) {
    throw new Error(
      `series index ${i} exceeds the ${t.series.length}-slot categorical palette. ` +
      'A further series is never a generated hue — fold it into "Other", facet the chart, ' +
      'or use small multiples.',
    );
  }
  return t.series[i];
}
