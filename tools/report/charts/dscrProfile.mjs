/**
 * Chart 3 — DSCR profile with the covenant line.
 *
 * Form: magnitude over an ordered sequence, against a THRESHOLD. Bars for the
 * data; the covenant as a rule, not as another series — a covenant drawn as a
 * line series invites the reader to compare its shape, and it has no shape.
 *
 * The binding year is the whole point of the chart, so it is marked directly
 * rather than left to be found by eye.
 */
import { svg, frame, rect, line, text, n, scaleLinear, niceTicks, fmt, hatchDefs } from './svg.mjs';
import { theme, GEOMETRY } from '../theme/tokens.mjs';

export function dscrProfile(rows, {
  themeName = 'light', width = GEOMETRY.chartWidth, height = GEOMETRY.chartHeight,
  title = 'DSCR profile', subtitle, source, asOf, covenant = 1.30,
} = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('dscrProfile needs at least one row');
  const t = theme(themeName);
  // The binding-year annotation sits above the plot and the subtitle sits above
  // that; at the default padding all three stacked into the same 12px.
  const { plot, head, foot } = frame({ t, width, height, title, subtitle, source, asOf, pad: { top: 56 } });

  const vals = rows.map((r) => r.dscr);
  const { ticks, domain } = niceTicks(0, Math.max(covenant * 1.25, ...vals), 5);
  const y = scaleLinear(domain, [plot.y + plot.h, plot.y]);
  const slot = plot.w / rows.length;
  const barW = Math.min(30, slot * 0.6);

  const minDscr = Math.min(...vals);
  const bindingIdx = vals.indexOf(minDscr);

  // Below-covenant bars are hatched as well as recoloured. Two encodings, and
  // the hatch is the one that survives a black-and-white print — where the
  // covenant breach is the single fact the reader must not miss.
  let g = hatchDefs(t);
  for (const tk of ticks) {
    g += line(plot.x, y(tk), plot.x + plot.w, y(tk), t.grid, 1);
    g += text(plot.x - 8, y(tk) + 3, fmt.x2(tk), { fill: t.inkMuted, size: 9, family: 'var(--report-mono)', anchor: 'end' });
  }

  rows.forEach((r, i) => {
    const cx = plot.x + slot * i + slot / 2;
    const h = plot.y + plot.h - y(r.dscr);
    // Below-covenant bars take the negative slot — this is polarity against a
    // threshold, not a second category.
    const below = r.dscr < covenant;
    g += rect(cx - barW / 2, y(r.dscr), barW, Math.max(1.5, h), below ? t.negative : t.series[0], ' rx="1.5"');
    if (below) g += `<rect x="${n(cx - barW / 2)}" y="${n(y(r.dscr))}" width="${n(barW)}" height="${n(Math.max(1.5, h))}" fill="url(#h135)" rx="1.5"/>`;
    g += text(cx, plot.y + plot.h + 14, String(r.year), { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'middle' });
    // Selective direct labels: the binding year and the endpoints only. A number
    // on every bar is noise, and the reader is looking for one of these three.
    if (i === bindingIdx || i === 0 || i === rows.length - 1) {
      g += text(cx, y(r.dscr) - 5, fmt.x2(r.dscr), { fill: t.ink, size: 9, family: 'var(--report-mono)', anchor: 'middle' });
    }
  });

  // The covenant, drawn as a rule over the data with its value stated on it.
  g += line(plot.x, y(covenant), plot.x + plot.w, y(covenant), t.covenant, 1.5, ' stroke-dasharray="5 3"');
  g += text(plot.x + plot.w, y(covenant) - 5, `covenant ${fmt.x2(covenant)}`, { fill: t.covenant, size: 8.5, family: 'var(--report-mono)', anchor: 'end' });

  // Name the binding constraint rather than leaving it to be inferred.
  const bx = plot.x + slot * bindingIdx + slot / 2;
  g += text(bx, plot.y - 8, `min ${fmt.x2(minDscr)} · ${rows[bindingIdx].year}`, { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'middle' });

  return svg(width, height, t, head + g + foot);
}
