/**
 * Chart 2 — revenue stack by product over time.
 *
 * Form: composition over time. Stacked areas, ordered largest-at-the-bottom so
 * the biggest band sits on a flat baseline where its shape is actually readable
 * — an upper band in a stack carries the wobble of everything beneath it, which
 * is why the ordering is a correctness question and not a styling one.
 *
 * Colour does IDENTITY here, so it uses the categorical order — fixed, never
 * cycled. Series are direct-labelled at the right edge as well as legended,
 * so identity is never colour-alone, and a 2px surface gap separates the fills.
 */
import { svg, frame, line, text, rect, n, scaleLinear, niceTicks, fmt, hatchDefs, patternId } from './svg.mjs';
import { theme, seriesColor, GEOMETRY } from '../theme/tokens.mjs';

/**
 * @param {{year:number|string, values:Record<string,number>}[]} rows
 * @param {string[]} products  stacking order, bottom-first
 */
export function revenueStack(rows, products, {
  themeName = 'light', width = GEOMETRY.chartWidth, height = GEOMETRY.chartHeight,
  title = 'Revenue by product', subtitle, source, asOf, texture,
} = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('revenueStack needs at least one row');
  if (!Array.isArray(products) || !products.length) throw new Error('revenueStack needs an explicit product order');
  const t = theme(themeName);
  // MANDATORY above two series. Left overridable only to force it ON for a
  // two-series chart, never off — see hatchDefs for why colour alone cannot
  // carry three or more fills into greyscale.
  const useTexture = texture ?? products.length > 2;
  const { plot, head, foot } = frame({ t, width, height, title, subtitle, source, asOf, pad: { right: 92 } });

  const totals = rows.map((r) => products.reduce((s, p) => s + (r.values[p] ?? 0), 0));
  const { ticks, domain } = niceTicks(0, Math.max(...totals), 5);
  const y = scaleLinear(domain, [plot.y + plot.h, plot.y]);
  const x = scaleLinear([0, rows.length - 1], [plot.x, plot.x + plot.w]);

  let g = useTexture ? hatchDefs(t) : '';
  for (const tk of ticks) {
    g += line(plot.x, y(tk), plot.x + plot.w, y(tk), t.grid, 1);
    g += text(plot.x - 8, y(tk) + 3, fmt.eurM(tk), { fill: t.inkMuted, size: 9, family: 'var(--report-mono)', anchor: 'end' });
  }

  // Cumulative baselines, bottom-first.
  const base = rows.map(() => 0);
  const layers = [];
  products.forEach((p, pi) => {
    const top = rows.map((r, i) => base[i] + (r.values[p] ?? 0));
    const up = rows.map((r, i) => `${n(x(i))},${n(y(top[i]))}`);
    const down = rows.map((r, i) => `${n(x(rows.length - 1 - i))},${n(y(base[rows.length - 1 - i]))}`);
    layers.push({ p, pi, d: `M${up.join('L')}L${down.join('L')}Z`, endY: y((base[rows.length - 1] + top[rows.length - 1]) / 2) });
    for (let i = 0; i < rows.length; i++) base[i] = top[i];
  });

  for (const L of layers) {
    const c = seriesColor(t, L.pi);
    // 2px surface stroke = the gap between adjacent fills, per the mark spec.
    g += `<path d="${L.d}" fill="${c}" stroke="${t.surface}" stroke-width="2"/>`;
    if (useTexture) g += `<path d="${L.d}" fill="url(#${patternId(L.pi)})" stroke="none"/>`;
  }

  // Direct labels at the right edge — ≤4 series, so every one gets named.
  layers.forEach((L) => {
    g += text(plot.x + plot.w + 6, L.endY + 3, L.p, { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)' });
    g += rect(plot.x + plot.w + 1, L.endY - 3, 3, 7, seriesColor(t, L.pi));
    if (useTexture) g += `<rect x="${n(plot.x + plot.w + 1)}" y="${n(L.endY - 3)}" width="3" height="7" fill="url(#${patternId(L.pi)})"/>`;
  });

  rows.forEach((r, i) => {
    if (i % Math.ceil(rows.length / 8) !== 0 && i !== rows.length - 1) return;
    g += text(x(i), plot.y + plot.h + 14, String(r.year), { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'middle' });
  });
  g += line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, t.axis, 1);

  return svg(width, height, t, head + g + foot);
}
