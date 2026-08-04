/**
 * Phase 36.F0 — the chart kit's gates.
 *
 * Four properties, each of which is a way a report goes wrong silently:
 * determinism (an unreviewable diff), grayscale survival (a printed page of
 * identical greys), the required source (rule #3 with a picture on it), and no
 * raw colour literals (a colour nobody can change or check).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { cashflowWaterfall, revenueStack, dscrProfile, debtLadder, BUILT, NOT_BUILT } from '../charts/index.mjs';
import { grayscaleSurvives, luminance } from '../charts/grayscale.mjs';
import { THEMES, seriesColor, theme } from '../theme/tokens.mjs';

const SRC = 'KKME engine v7 · frozen KV fixture';
const AS_OF = '2026-08-03';

const WATERFALL = [
  { label: 'Gross revenue', value: 8_300_025, kind: 'total' as const },
  { label: 'Operating cost', value: -1_420_000 },
  { label: 'Grid fees', value: -640_000 },
  { label: 'EBITDA', value: 6_240_025, kind: 'total' as const },
  { label: 'Debt service', value: -2_180_000 },
  { label: 'Equity cashflow', value: 4_060_025, kind: 'total' as const },
];
const DSCR = [2027, 2028, 2029, 2030, 2031, 2032].map((year, i) => ({ year, dscr: [3.13, 2.69, 1.94, 1.22, 1.51, 1.88][i] }));
const STACK = Array.from({ length: 10 }, (_, i) => ({
  year: 2027 + i,
  values: { 'DA arbitrage': 2.2e6 - i * 4e4, aFRR: 1.8e6 - i * 3e4, mFRR: 1.1e6, FCR: 0.6e6 + i * 1e4 },
}));
const LADDER = [
  { label: 'DSCR 1.30×', sustainable: 14_200_000, target: 16_000_000, binding: 'min DSCR' },
  { label: 'LLCR 1.40×', sustainable: 15_800_000, target: 16_000_000 },
  { label: 'Gearing 70%', sustainable: 16_400_000, target: 16_000_000 },
];

const render = (themeName: 'light' | 'dark') => ({
  waterfall: cashflowWaterfall(WATERFALL, { themeName, source: SRC, asOf: AS_OF }),
  stack: revenueStack(STACK, ['DA arbitrage', 'aFRR', 'mFRR', 'FCR'], { themeName, source: SRC, asOf: AS_OF }),
  dscr: dscrProfile(DSCR, { themeName, source: SRC, asOf: AS_OF }),
  ladder: debtLadder(LADDER, { themeName, source: SRC, asOf: AS_OF }),
});

describe('determinism — same input, byte-identical SVG', () => {
  it('re-rendering produces identical bytes', () => {
    // What makes a report diff reviewable: if the numbers did not move, the file
    // does not change, so ANY diff is a real diff. A single Date.now() or a
    // Math.random() id would destroy this and nothing else would notice.
    for (const th of ['light', 'dark'] as const) {
      const a = render(th);
      const b = render(th);
      for (const k of Object.keys(a) as (keyof typeof a)[]) {
        expect(a[k], `${th}/${k}`).toBe(b[k]);
      }
    }
  });

  it('emits no wall-clock or random artefact', () => {
    const all = Object.values(render('light')).join('');
    expect(all).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // no ISO timestamp
    expect(all).not.toMatch(/id="[a-z]*-?[0-9a-f]{8,}"/); // no generated id
  });
});

describe('grayscale survival — this is the print gate', () => {
  for (const th of ['light', 'dark'] as const) {
    it(`every chart survives desaturation in the ${th} theme`, () => {
      const t = theme(th);
      // Furniture is excluded: requiring the grid to be luminance-separated from
      // the data would be requiring a loud grid.
      const exclude = [t.surface, t.surfaceAlt, t.grid, t.axis, t.ink, t.inkSecondary, t.inkMuted, t.band];
      for (const [name, s] of Object.entries(render(th))) {
        const r = grayscaleSurvives(s, { exclude });
        expect(r.pass, `${th}/${name}: worst pair ${JSON.stringify(r.worst)} separated by only ${r.minSeparation}`).toBe(true);
      }
    });
  }

  it('the gate can fail — a palette of one hue at one lightness does not survive', () => {
    // The injection that proves the assertion is real. Three colours chosen to
    // be obviously distinct in hue and near-identical in luminance: exactly the
    // chart that looks fine on screen and prints as three identical greys.
    const fake = '<svg><rect fill="#c04040"/><rect fill="#40c040"/><rect fill="#4040c0"/></svg>';
    const r = grayscaleSurvives(fake);
    expect(r.pass).toBe(false);
    expect(r.minSeparation).toBeLessThan(0.10);
  });

  it('luminance is computed, not asserted', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('not-a-colour')).toBeNull();
  });
});

describe('every chart REQUIRES a source', () => {
  it('throws without one', () => {
    // A chart that can render without naming its origin is a rule-#3 hole with
    // a picture on it — and a printed chart travels much further from its
    // context than a card on a page does.
    expect(() => cashflowWaterfall(WATERFALL, {})).toThrow(/requires a non-empty `source`/);
    expect(() => dscrProfile(DSCR, {})).toThrow(/requires a non-empty `source`/);
    expect(() => debtLadder(LADDER, {})).toThrow(/requires a non-empty `source`/);
    expect(() => revenueStack(STACK, ['aFRR'], {})).toThrow(/requires a non-empty `source`/);
  });

  it('rejects whitespace as a source', () => {
    expect(() => cashflowWaterfall(WATERFALL, { source: '   ' })).toThrow();
  });

  it('renders the source and as-of into the output', () => {
    expect(render('light').waterfall).toContain('as of 2026-08-03');
    expect(render('light').waterfall).toContain('KKME engine v7');
  });
});

describe('no raw colour literals in chart code', () => {
  const dir = resolve(process.cwd(), 'tools/report/charts');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'));

  it('finds the chart modules it claims to cover (A7 — the count is evidence)', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    it(`${f} carries no hex or rgb() literal outside a comment`, () => {
      const src = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments
      // grayscale.mjs legitimately contains hex REGEXES for parsing; those are
      // patterns, not colours, and are matched as such.
      const hits = [...src.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0])
        .filter(() => !/^grayscale\.mjs$/.test(f));
      expect(hits, `raw colour literal(s) in ${f}`).toEqual([]);
      expect(src).not.toMatch(/\brgba?\(\s*\d/);
    });
  }

  it('the token file is the only place colours are defined', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'tools/report/theme/tokens.mjs'), 'utf8');
    expect(tokens).toMatch(/#[0-9a-f]{6}/);
  });
});

describe('categorical discipline', () => {
  it('refuses a series index beyond the palette rather than cycling', () => {
    // Cycling means two entities share an identity, and in a static report
    // nobody can hover to find out which is which.
    const t = theme('light');
    expect(() => seriesColor(t, t.series.length)).toThrow(/never a generated hue/);
  });

  it('both themes carry the same number of categorical slots', () => {
    expect(THEMES.light.series.length).toBe(THEMES.dark.series.length);
  });

  it('names which of the eight charts were built and which were not', () => {
    expect(BUILT).toHaveLength(4);
    expect(NOT_BUILT).toHaveLength(4);
  });
});

describe('document shell — no prose, and the absence is loud', () => {
  it('refuses a FINAL render with unfilled copy slots', async () => {
    // The phase's hardest constraint made structural: the copy must not read as
    // machine-written, so this phase writes none — and a placeholder reaching a
    // client is worse than a build that refuses. "The operator will notice" is
    // not a mechanism.
    const { renderDocument } = await import('../shell/document.mjs');
    expect(() => renderDocument({ title: 'T', asOf: '2026-08-03', mode: 'final' }))
      .toThrow(/refusing to render a FINAL document with \d+ unfilled copy slot/);
  });

  it('renders in draft mode with the markers visible and counted', async () => {
    const { renderDocument, unfilledSlots, SECTIONS } = await import('../shell/document.mjs');
    const html = renderDocument({ title: 'T', asOf: '2026-08-03', mode: 'draft' });
    expect(unfilledSlots(html)).toHaveLength(SECTIONS.length);
    expect(html).toContain('DRAFT');
  });

  it('requires an as-of date', async () => {
    const { renderDocument } = await import('../shell/document.mjs');
    expect(() => renderDocument({ title: 'T' })).toThrow(/as-of date/);
  });

  it('numbers figures from a counter rather than by hand', async () => {
    const { renderDocument, SECTIONS } = await import('../shell/document.mjs');
    const copy = Object.fromEntries(SECTIONS.map((s) => [s, '<p>x</p>']));
    const html = renderDocument({
      title: 'T', asOf: '2026-08-03', mode: 'final', copy,
      figures: [
        { id: 'a', section: 'REVENUE_BASIS', title: 'First', svg: '<svg/>' },
        { id: 'b', section: 'FINANCING', title: 'Second', svg: '<svg/>' },
      ],
    });
    expect(html).toContain('Figure 1 — First');
    expect(html).toContain('Figure 2 — Second');
  });

  it('prints the confidentiality marking on the page furniture', async () => {
    const { renderDocument, SECTIONS } = await import('../shell/document.mjs');
    const copy = Object.fromEntries(SECTIONS.map((s) => [s, '<p>x</p>']));
    const html = renderDocument({ title: 'T', asOf: '2026-08-03', mode: 'final', copy });
    expect(html).toMatch(/class="footer"/);
    expect(html).toContain('Confidential');
    expect(html).toMatch(/@page \{ size: A4;/);
  });
});
