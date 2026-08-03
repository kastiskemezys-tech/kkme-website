/**
 * Chart 1 — cashflow waterfall. The single most-read chart in a bankable report.
 *
 * Form: the data's job is COMPOSITION-AND-POLARITY across an ordered bridge
 * (gross → net → EBITDA → CFADS → debt service → equity). A waterfall is the
 * only form that shows both what each step does and where it leaves you, which
 * is exactly the question a credit reader is asking.
 *
 * Colour does ONE job here and it is polarity, not identity — so it draws on the
 * semantic slots (positive / negative / total), never the categorical order. A
 * waterfall painted in "series 1..6" says six different things where there are
 * only three.
 *
 * Every bar is direct-labelled, so the chart survives with no colour at all.
 */
import { svg, frame, rect, line, text, n, scaleLinear, niceTicks, fmt, hatchDefs } from './svg.mjs';
import { theme, GEOMETRY } from '../theme/tokens.mjs';

/**
 * @param {{label:string, value:number, kind?:'delta'|'total'}[]} steps
 *        `total` bars are drawn from the baseline (they ARE the running value);
 *        `delta` bars float from the running total.
 */
export function cashflowWaterfall(steps, {
  themeName = 'light', width = GEOMETRY.chartWidth, height = GEOMETRY.chartHeight,
  title = 'Cashflow bridge', subtitle, source, asOf, unit = '€',
} = {}) {
  if (!Array.isArray(steps) || steps.length < 2) throw new Error('waterfall needs at least two steps');
  const t = theme(themeName);
  // Extra headroom: the tallest bar's value label sits ABOVE it, and with the
  // default top padding it landed on the topmost axis tick. Found by rendering
  // the sheet and looking at it, which is the only way this class of defect is
  // ever found — no assertion here knows where text collides.
  const { plot, head, foot } = frame({ t, width, height, title, subtitle, source, asOf, pad: { top: 52 } });

  // Running positions first, so the axis domain covers the bars actually drawn
  // rather than the raw values — a waterfall's extent is its cumulative path.
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'total') {
      const b = { ...s, from: 0, to: s.value };
      run = s.value;
      return b;
    }
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });

  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
  const { ticks, domain } = niceTicks(lo, hi, 5);
  const y = scaleLinear(domain, [plot.y + plot.h, plot.y]);

  const slot = plot.w / bars.length;
  const barW = Math.min(46, slot * 0.62);

  // Texture is not decoration here: it is what carries total-vs-delta and
  // positive-vs-negative into a black-and-white print, where the three semantic
  // fills are only 0.07 apart in luminance. It also reads better in colour — a
  // total should not look like just another delta.
  let g = hatchDefs(t);
  // Recessive grid, drawn first so marks sit on top.
  for (const tk of ticks) {
    g += line(plot.x, y(tk), plot.x + plot.w, y(tk), t.grid, 1);
    g += text(plot.x - 8, y(tk) + 3, `${unit}${(tk / 1e6).toFixed(1)}m`, { fill: t.inkMuted, size: 9, family: 'var(--report-mono)', anchor: 'end' });
  }
  g += line(plot.x, y(0), plot.x + plot.w, y(0), t.axis, 1);

  bars.forEach((b, i) => {
    const cx = plot.x + slot * i + slot / 2;
    const yTop = Math.min(y(b.from), y(b.to));
    const h = Math.abs(y(b.to) - y(b.from));
    const isTotal = b.kind === 'total';
    const fill = isTotal ? t.total : (b.value >= 0 ? t.positive : t.negative);
    // 2px surface gap between adjacent fills, per the mark spec.
    g += rect(cx - barW / 2, yTop, barW, Math.max(1.5, h), fill, ' rx="1.5"');
    const pat = isTotal ? 'h45' : (b.value < 0 ? 'h135' : null);
    if (pat) g += `<rect x="${n(cx - barW / 2)}" y="${n(yTop)}" width="${n(barW)}" height="${n(Math.max(1.5, h))}" fill="url(#${pat})" rx="1.5"/>`;

    // Connector to the next bar — the line that makes it a bridge rather than
    // six unrelated bars.
    if (i < bars.length - 1 && !bars[i + 1].kind) {
      const nx = plot.x + slot * (i + 1) + slot / 2;
      g += line(cx + barW / 2 + 1, y(b.to), nx - barW / 2 - 1, y(b.to), t.axis, 1, ' stroke-dasharray="2 2"');
    }

    // Direct label above/below the bar — identity and magnitude without colour.
    const labelY = b.to >= b.from ? yTop - 5 : yTop + h + 11;
    g += text(cx, labelY, fmt.eurM(isTotal ? b.value : b.value), { fill: t.ink, size: 9, family: 'var(--report-mono)', anchor: 'middle' });
    // Category label, wrapped to two lines on the space.
    const words = String(b.label).split(' ');
    const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    const l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    g += text(cx, plot.y + plot.h + 14, l1, { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'middle' });
    if (l2) g += text(cx, plot.y + plot.h + 24, l2, { fill: t.inkSecondary, size: 8.5, family: 'var(--report-mono)', anchor: 'middle' });
  });

  return svg(width, height, t, head + g + foot);
}
