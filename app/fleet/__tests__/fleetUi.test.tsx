/**
 * Phase 37.C — the leak test at the RENDERED-UI level.
 *
 * The API-level twin lives in workers/__tests__/fleetCrm.test.ts. This one exists
 * because an API test cannot see a leak that happens in the browser: a component
 * that renders a contact into the gate screen, or a static export that bakes a
 * count into the HTML, would pass every endpoint assertion ever written.
 *
 * The structure is deliberate:
 *   POSITIVE CONTROL — render the workspace WITH seeded private values and prove
 *     every canary appears. This is what stops the negative assertions below from
 *     being vacuous, which is precisely how batch-1's own sweep went wrong.
 *   NEGATIVE — render the route root with no session and prove every canary is
 *     absent, along with any count or project shape.
 *
 * Every value here is SYNTHETIC.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { FleetConsole, FleetWorkspace, ProjectDrawer } from '../FleetConsole';
import { buildCrmView } from '../../../workers/lib/fleetCrm.js';
import type { CrmView } from '../fleetApi';

const CANARY = {
  email: 'nobody@example.invalid',
  comment: 'ZZKANARY deal comment — synthetic',
  apva: 'ZZKANARY-APVA-TESTIMONY',
  raw_power: 'ZZKANARY 77MWh BESS / 7.7 MWp PV',
  spv: 'UAB "Kanarėlė BESS"',
  org: 'Fictional Energy GmbH',
};

const ROWS = [
  {
    id: 'fi-lt-canary-0000000001',
    country: 'LT',
    spv: CANARY.spv,
    org: CANARY.org,
    plant_type: 'BESS',
    site_total_mw: 50,
    bess_mw: 50,
    location: 'Testonys',
    verification_status: 'private-only',
    citations: [],
    contact: CANARY.email,
    comment: CANARY.comment,
    apva_flag: CANARY.apva,
    raw_power_text: CANARY.raw_power,
  },
  {
    id: 'fi-lv-canary-0000000002',
    country: 'LV',
    spv: 'SIA "Kanarina Energija"',
    org: 'Fictional Baltics SIA',
    plant_type: 'SUN E with BESS',
    site_total_mw: 120,
    location: 'Nekurnebutne',
    verification_status: 'public-confirmed',
    citations: [{
      source_type: 'registry',
      url: 'https://data.gov.lv/dati/lv/dataset/synthetic',
      what_it_confirms: 'entity resolves in the Latvian Uzņēmumu reģistrs, reg. 40200000000, status active',
    }],
    contact: CANARY.email,
    comment: CANARY.comment,
  },
];

const VIEW = buildCrmView({ privateIndex: { rows: ROWS } }) as unknown as CrmView;

/**
 * Assert against DECODED markup. React escapes `"` to `&quot;`, and a real SPV name
 * carries quotes — so a raw substring check would miss a leak that shipped escaped.
 * Escaped or not, it renders as the value in a browser, so it counts as a leak.
 */
const decode = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const render = (el: React.ReactElement) => decode(renderToStaticMarkup(el));

describe('37.C UI — positive control: the table really can render its canaries', () => {
  const html = render(<FleetWorkspace view={VIEW} token="synthetic-token" onSaved={() => {}} />);

  it('renders the seeded names, so the absence assertions below mean something', () => {
    for (const name of ['spv', 'org'] as const) {
      expect(html, `canary ${name} never rendered — the UI leak sweep would be vacuous`)
        .toContain(CANARY[name]);
    }
  });

  it('renders one row per project', () => {
    expect(html.match(/<tr[ >]/g)?.length).toBe(ROWS.length + 1); // + the header row
  });

  it('shows a hybrid as a band and never as a midpoint', () => {
    expect(html).toContain('0 MW – 120 MW');
    expect(html).not.toContain('60 MW');
  });

  it('states the citable total rather than letting silence imply one', () => {
    expect(html).toContain('Citable BESS capacity in this set: 0 MW');
  });

  it('carries the hybrid band and its own incompleteness where supply is discussed', () => {
    expect(html).toContain('Public-fleet hybrid band');
    expect(html).toMatch(/understates/i);
  });

  it('keeps the private overlay OUT of the table — it belongs to the drawer alone', () => {
    expect(html).not.toContain(CANARY.email);
    expect(html).not.toContain(CANARY.comment);
    expect(html).not.toContain(CANARY.apva);
  });
});

describe('37.C UI — positive control: the drawer is the surface that renders the overlay', () => {
  const html = render(
    <ProjectDrawer p={VIEW.projects[0]} token="synthetic-token" onClose={() => {}} onSaved={() => {}} />,
  );

  it('renders contact, comment and APVA — the console CAN show these', () => {
    expect(html, 'contact never rendered — the gate assertion would be vacuous').toContain(CANARY.email);
    expect(html, 'comment never rendered — the gate assertion would be vacuous').toContain(CANARY.comment);
    expect(html, 'apva never rendered — the gate assertion would be vacuous').toContain(CANARY.apva);
  });

  it('renders apva as testimony carrying its own caveat, never as a verification signal', () => {
    expect(html).toMatch(/APVA \(private testimony\)/);
    expect(html).toContain('not citable — TAM unblocker');
    // the tier line must not be the thing carrying the flag
    expect(html).not.toMatch(/Private-only[^<]*ZZKANARY-APVA/);
  });

  it('never surfaces raw_power_text, which is private and has no display role', () => {
    expect(html).not.toContain(CANARY.raw_power);
  });

  it('states in words why the row cannot reach a client number', () => {
    expect(html).toContain('No — capacity is not citable');
    expect(html).toMatch(/no public source corroborates this row/i);
  });
});

describe('37.C UI — LEAK: an unauthenticated render is the gate and nothing else', () => {
  // renderToStaticMarkup runs no effects, which is exactly the static export's
  // first paint: no token read, no fetch, no data.
  const html = render(<FleetConsole />);

  it('contains no canary of any kind', () => {
    for (const [name, value] of Object.entries(CANARY)) {
      expect(html, `the gate leaked ${name}`).not.toContain(value);
    }
  });

  it('contains no email-shaped or phone-shaped string', () => {
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(html).not.toMatch(/(?:\+370|\+371|\+372)\s?\d[\d\s-]{6,}/);
  });

  it('teases no count, no tier tally and no table', () => {
    expect(html).not.toMatch(/\d+\s*\/\s*\d+/);       // "12 / 141"
    expect(html).not.toMatch(/projects?\b/i);
    expect(html).not.toContain('<table');
    expect(html).not.toMatch(/Public-confirmed|Private-only|Corroborated/);
    expect(html).not.toMatch(/Citable BESS capacity/);
  });

  it('is a sign-in form — the vacuity guard for this half', () => {
    expect(html).toContain('type="password"');
    expect(html).toMatch(/Fleet console/);
  });
});

describe('37.C UI — the route imports no fleet data into the browser bundle', () => {
  /**
   * Regression guard for a defect this batch shipped and then caught.
   *
   * `hybrid-band.json` was imported by the client component. It is public-derived,
   * so no leak test on private values fired — but the build put 34 public fleet
   * entry names and KKME's hybrid analysis into a JS chunk fetchable at /fleet with
   * no token, which is a public tier by another name. The band now arrives in the
   * authed payload. Caught by the built-artifact sweep, not by any unit test, which
   * is exactly why that sweep runs.
   */
  const source = readFileSync(new URL('../FleetConsole.tsx', import.meta.url), 'utf8')
    + readFileSync(new URL('../fleetApi.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

  it('imports no data artifact from tools/ or docs/', () => {
    const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    const dataImports = imports.filter((s) => /tools\/|docs\/|\.json$/.test(s));
    expect(dataImports, `client bundle would carry these data artifacts: ${dataImports.join(', ')}`).toEqual([]);
  });

  it('takes the band from the authed payload, not from a bundled artifact', () => {
    expect(source).toMatch(/view\.hybrid_band/);
    expect(source).not.toMatch(/hybrid-band\.json/);
  });
});
