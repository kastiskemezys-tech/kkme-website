/**
 * Phase 36.F0 — the document shell. Print-first, A4, no runtime.
 *
 * NO PROSE IS GENERATED HERE. Every place copy belongs is a `{{SECTION:...}}`
 * marker, and the shell throws if an unfilled marker reaches a "final" render.
 * That is the phase's hardest constraint made structural: the report's copy must
 * not read as machine-written, so this phase writes none of it and makes the
 * absence loud instead of letting a placeholder ship.
 *
 * Geometry: A4, 20 mm margins, nothing in the last 15 mm. Figures are numbered
 * from a counter rather than by hand, because hand-numbered figures drift the
 * moment a section is reordered.
 */
import { GEOMETRY, THEMES, TYPE } from '../theme/tokens.mjs';

const MARK = /\{\{SECTION:([A-Z0-9_]+)\}\}/g;

/** Every copy slot the shell expects, in document order. */
export const SECTIONS = [
  'EXEC_SUMMARY', 'PROJECT_OVERVIEW', 'MARKET_CONTEXT', 'REVENUE_BASIS',
  'COST_BASIS', 'FINANCING', 'SENSITIVITIES', 'RISKS', 'METHODOLOGY_NOTE',
];

export function pageCss(themeName = 'light') {
  const t = THEMES[themeName];
  const g = GEOMETRY;
  return `
@page { size: A4; margin: ${g.marginMm}mm ${g.marginMm}mm ${g.marginMm + g.bottomSafeMm}mm; }
:root { --ink:${t.ink}; --ink2:${t.inkSecondary}; --muted:${t.inkMuted}; --rule:${t.rule};
        --grid:${t.grid}; --surface:${t.surface}; --surface-alt:${t.surfaceAlt}; }
html,body { background:var(--surface); color:var(--ink); }
body { font-family:${TYPE.family}; font-size:9.5pt; line-height:1.55; margin:0; }
h1,h2,h3 { font-family:${TYPE.serif}; font-weight:600; }
h1 { font-size:24pt; line-height:1.15; margin:0 0 6mm; }
h2 { font-size:13pt; margin:10mm 0 3mm; padding-bottom:1.5mm; border-bottom:1px solid var(--rule); }
h3 { font-size:10.5pt; margin:6mm 0 2mm; }
p  { margin:0 0 3mm; max-width:62ch; }
.cover { height:calc(297mm - ${g.marginMm * 2}mm); display:flex; flex-direction:column; justify-content:space-between; }
.cover .meta { font-size:8.5pt; color:var(--muted); }
.section { break-inside:auto; }
h2, h3 { break-after:avoid; }
figure { break-inside:avoid; margin:5mm 0; }
figure svg { width:100%; height:auto; display:block; }
figcaption { font-size:8pt; color:var(--muted); margin-top:1.5mm; }
table { width:100%; border-collapse:collapse; font-size:8.5pt; margin:4mm 0; }
th { text-align:left; font-weight:600; border-bottom:1px solid var(--rule); padding:1.5mm 2mm; }
td { border-bottom:1px solid var(--grid); padding:1.5mm 2mm; }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
.footer { position:fixed; bottom:6mm; left:0; right:0; font-size:7.5pt; color:var(--muted);
          display:flex; justify-content:space-between; }
.confidential { letter-spacing:.10em; text-transform:uppercase; }
.toc a { color:var(--ink2); text-decoration:none; }
.toc li { margin:1mm 0; }
.unfilled { background:#ffe9e9; color:#a83232; padding:0 2px; }
@media print { .footer { position:fixed; } }
`;
}

/**
 * @param {object} o
 * @param {'draft'|'final'} o.mode  `final` REFUSES to render an unfilled slot.
 * @param {Record<string,string>} o.copy  section id → HTML
 * @param {{id:string, title:string, svg:string, caption?:string}[]} o.figures
 */
export function renderDocument({
  title, subtitle, client, asOf, themeName = 'light', mode = 'draft',
  copy = {}, figures = [], confidentiality = 'Confidential — not for distribution',
}) {
  if (!title) throw new Error('renderDocument requires a title');
  if (!asOf) throw new Error('renderDocument requires an as-of date — a report without one cannot be cited safely');

  let figNo = 0;
  const figureHtml = (id) => {
    const f = figures.find((x) => x.id === id);
    if (!f) return '';
    figNo += 1;
    return `<figure id="fig-${id}">${f.svg}<figcaption>Figure ${figNo} — ${f.title}`
      + `${f.caption ? ` · ${f.caption}` : ''}</figcaption></figure>`;
  };

  const unfilled = [];
  const body = SECTIONS.map((id) => {
    const c = copy[id];
    if (c == null) unfilled.push(id);
    const inner = c ?? `<p class="unfilled">{{SECTION:${id}}}</p>`;
    return `<section class="section" id="s-${id}"><h2>${humanise(id)}</h2>${inner}`
      + (figures.some((f) => f.section === id) ? figures.filter((f) => f.section === id).map((f) => figureHtml(f.id)).join('') : '')
      + '</section>';
  }).join('\n');

  if (mode === 'final' && unfilled.length) {
    // The whole point. A placeholder that reaches a client is worse than a build
    // that refuses, and "the operator will notice" is not a mechanism.
    throw new Error(
      `refusing to render a FINAL document with ${unfilled.length} unfilled copy slot(s): ${unfilled.join(', ')}. `
      + 'Fill them or render in draft mode.',
    );
  }

  const toc = SECTIONS.map((id) => `<li><a href="#s-${id}">${humanise(id)}</a></li>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${pageCss(themeName)}</style></head><body>
<div class="cover">
  <div>
    <div class="meta confidential">${esc(confidentiality)}</div>
    <h1 style="margin-top:14mm">${esc(title)}</h1>
    ${subtitle ? `<p style="font-size:11pt;color:var(--ink2)">${esc(subtitle)}</p>` : ''}
  </div>
  <div class="meta">
    ${client ? `Prepared for ${esc(client)}<br>` : ''}
    As of ${esc(asOf)}<br>
    KKME · kkme.eu
    ${mode === 'draft' && unfilled.length ? `<br><span class="unfilled">DRAFT — ${unfilled.length} copy slot(s) unfilled</span>` : ''}
  </div>
</div>
<div style="break-before:page"></div>
<h2>Contents</h2><ol class="toc">${toc}</ol>
${body}
<div class="footer"><span class="confidential">${esc(confidentiality)}</span><span>As of ${esc(asOf)}</span></div>
</body></html>`;
}

function humanise(id) {
  return id.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Unfilled `{{SECTION:...}}` markers in a rendered document. */
export function unfilledSlots(html) {
  return [...String(html).matchAll(MARK)].map((m) => m[1]);
}
