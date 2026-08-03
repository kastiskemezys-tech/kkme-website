/**
 * Chart 4 — debt sizing ladder: sustainable debt vs target cover, binding
 * constraint marked.
 *
 * Form: two comparable magnitudes per band, plus a categorical fact (which
 * constraint binds). Paired bars on ONE axis — never a dual axis; both series
 * are euros, so they share a scale and the comparison is honest by construction.
 *
 * The binding constraint is the reason this chart exists, so it is stated in
 * words on the bar rather than encoded in a colour the reader must decode.
 */
import { svg, frame, rect, line, text, n, scaleLinear, niceTicks, fmt, hatchDefs } from './svg.mjs';
import { theme, seriesColor, GEOMETRY } from '../theme/tokens.mjs';

// Two series only, so greyscale can be carried by LUMINANCE rather than texture
// — but only if the two slots are actually far apart when desaturated. Slots 0
// and 1 are adjacent in the categorical order and 0.019 apart in luminance:
// distinguishable in colour, identical in print. Slots 0 and 2 are 0.120 apart.
// The categorical ORDER is about identity; print separation is a different
// question, and this is where they diverge.
//
// Slots 0 and 2 are the best available pair in BOTH themes, but "best" is only
// 0.073 apart in dark — computed, not assumed. So the target bar is hatched:
// luminance carries it in light, texture carries it in both.
const SLOT_A = 0;
const SLOT_B = 2;

/**
 * @param {{label:string, sustainable:number, target:number, binding?:string}[]} rows
 */
export function debtLadder(rows, {
  themeName = 'light', width = GEOMETRY.chartWidth, height = GEOMETRY.chartHeight,
  title = 'Debt sizing ladder', subtitle, source, asOf,
} = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('debtLadder needs at least one row');
  const t = theme(themeName);
  const { plot, head, foot } = frame({ t, width, height, title, subtitle, source, asOf, pad: { left: 118, right: 62, top: 62 } });
  // right: 62 because the value label sits OUTSIDE the bar end, and at the
  // default 16 the longest label ran off the canvas — the bars looked fine and
  // the numbers were simply gone. top: 62 because the legend sits above the
  // plot and was landing on the subtitle.

  const max = Math.max(...rows.flatMap((r) => [r.sustainable, r.target]));
  const { ticks, domain } = niceTicks(0, max, 5);
  const x = scaleLinear(domain, [plot.x, plot.x + plot.w]);
  const slot = plot.h / rows.length;
  const barH = Math.min(15, slot * 0.32);

  let g = hatchDefs(t);
  for (const tk of ticks) {
    g += line(x(tk), plot.y, x(tk), plot.y + plot.h, t.grid, 1);
    g += text(x(tk), plot.y + plot.h + 14, fmt.eurM(tk), { fill: t.inkMuted, size: 9, family: 'var(--report-mono)', anchor: 'middle' });
  }

  rows.forEach((r, i) => {
    const cy = plot.y + slot * i + slot / 2;
    // 2px surface gap between the paired bars.
    g += rect(plot.x, cy - barH - 1, x(r.sustainable) - plot.x, barH, seriesColor(t, SLOT_A), ' rx="1.5"');
    g += rect(plot.x, cy + 1, x(r.target) - plot.x, barH, seriesColor(t, SLOT_B), ' rx="1.5"');
    g += `<rect x="${n(plot.x)}" y="${n(cy + 1)}" width="${n(Math.max(0, x(r.target) - plot.x))}" height="${n(barH)}" fill="url(#h135)" rx="1.5"/>`;
    g += text(plot.x - 8, cy + 3, r.label, { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'end' });
    g += text(x(r.sustainable) + 5, cy - barH / 2 + 2, fmt.eurM(r.sustainable), { fill: t.ink, size: 8.5, family: 'var(--report-mono)' });
    g += text(x(r.target) + 5, cy + barH / 2 + 4, fmt.eurM(r.target), { fill: t.ink, size: 8.5, family: 'var(--report-mono)' });
    if (r.binding) {
      g += text(plot.x + 6, cy + barH + 14, `binding: ${r.binding}`, { fill: t.inkMuted, size: 8, family: 'var(--report-mono)' });
    }
  });

  // Legend — always present at two series, and colour is never the only cue
  // because both bars are direct-labelled with their values.
  const ly = plot.y - 16;
  g += rect(plot.x, ly - 6, 8, 8, seriesColor(t, SLOT_A));
  g += text(plot.x + 12, ly + 1, 'sustainable', { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)' });
  g += rect(plot.x + 92, ly - 6, 8, 8, seriesColor(t, SLOT_B));
  g += `<rect x="${n(plot.x + 92)}" y="${n(ly - 6)}" width="8" height="8" fill="url(#h135)"/>`;
  g += text(plot.x + 104, ly + 1, 'target cover', { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)' });

  g += line(plot.x, plot.y, plot.x, plot.y + plot.h, t.axis, 1);
  return svg(width, height, t, head + g + foot);
}
