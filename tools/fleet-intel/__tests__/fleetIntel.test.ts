// Phase 37.A — parser, match engine and PRIVACY LEAK tests.
//
// NON-NEGOTIABLE: every fixture in this file is SYNTHETIC. No row, name, contact or
// comment from the operator's private workbook appears here. The contacts below are
// invented addresses at example.invalid (a reserved TLD that cannot resolve).
//
// The leak tests exist from the first commit of the feature, not retrofitted.

import { describe, it, expect } from 'vitest';
import {
  parsePower, decomposeLT, normaliseRow, stableId, isLegalEntity, normName, CONFIDENCE,
} from '../lib/normalise.mjs';
import {
  PUBLIC_FIELDS, ALWAYS_PRIVATE_FIELDS, TIERS, computeTier, isPublishable,
  toPublicRow, findPrivateLeaks, findContactShapedContent,
} from '../lib/tiers.mjs';
import { scorePair, matchRow, matchAll, MATCH } from '../lib/match.mjs';

// ── synthetic fixtures ────────────────────────────────────────────────────────
const SYNTH_LT_ROW = {
  SPV: 'UAB "Testonys BESS"',
  Organizacija: 'Fictional Energy GmbH',
  'Power plant type': 'BESS',
  'Max power MW': 50,
  MWH: null,
  'Bess (MW)': 50,
  Vieta: 'Testonys',
  APVA: 'Gavo',
  Kontaktas: 'nobody@example.invalid',
  Komentaras: 'sinteticnis komentaras — ne is tikru duomenu',
};

const SYNTH_LT_HYBRID = {
  ...SYNTH_LT_ROW,
  SPV: 'UAB "Testonys Hibridas"',
  'Power plant type': 'SUN E with BESS',
  'Max power MW': 80,
  'Bess (MW)': 30,
};

const SYNTH_PUBLIC_FLEET = [
  { id: 'testonys-bess-lt', name: 'Testonys BESS', mw: 50, mwh: 100, status: 'announced', country: 'LT' },
  { id: 'kitas-projektas-lt', name: 'Visai Kitas Projektas', mw: 120, mwh: 240, status: 'announced', country: 'LT' },
  { id: 'testonys-bess-lv', name: 'Testonys BESS', mw: 50, mwh: 100, status: 'announced', country: 'LV' },
];

// ── parser ────────────────────────────────────────────────────────────────────
describe('parsePower — the real cell shapes found at Pause A', () => {
  it('parses a native numeric cell as site total, high confidence', () => {
    const r = parsePower(70);
    expect(r.site_total_mw).toBe(70);
    expect(r.parse_confidence).toBe(CONFIDENCE.HIGH);
  });

  it('parses decimal commas', () => {
    expect(parsePower('199,8').site_total_mw).toBeCloseTo(199.8);
    expect(parsePower('4,99').site_total_mw).toBeCloseTo(4.99);
  });

  it('routes a bare MWh value in a POWER column to energy at LOW confidence (the unit trap)', () => {
    const r = parsePower('40 MWh');
    expect(r.bess_mwh).toBe(40);
    expect(r.site_total_mw).toBeUndefined(); // must NOT become a 40 MW project
    expect(r.parse_confidence).toBe(CONFIDENCE.LOW);
  });

  it('splits compound "MW / MWh" into power and energy', () => {
    const r = parsePower('100 MW / 200 MWh');
    expect(r.bess_mw).toBe(100);
    expect(r.bess_mwh).toBe(200);
    expect(r.parse_confidence).toBe(CONFIDENCE.HIGH);
  });

  it('handles the no-space compound form', () => {
    const r = parsePower('25MW/600MWh');
    expect(r.bess_mw).toBe(25);
    expect(r.bess_mwh).toBe(600);
  });

  it('decomposes a BESS+PV hybrid string at MEDIUM confidence', () => {
    const r = parsePower('10MWh BESS / 4.4 MWp PV');
    expect(r.bess_mwh).toBe(10);
    expect(r.pv_mwp).toBeCloseTo(4.4);
    expect(r.parse_confidence).toBe(CONFIDENCE.MEDIUM);
  });

  it('flags an UNKNOWN shape as low confidence and keeps the raw text — never coerces', () => {
    const r = parsePower('about forty megawatts, maybe');
    expect(r.parse_confidence).toBe(CONFIDENCE.LOW);
    expect(r.site_total_mw).toBeUndefined();
    expect(r.bess_mw).toBeUndefined();
    expect(r.raw_power_text).toBe('about forty megawatts, maybe');
  });

  it('treats an empty cell as low confidence, not as zero', () => {
    const r = parsePower('');
    expect(r.parse_confidence).toBe(CONFIDENCE.LOW);
    expect(r.site_total_mw).toBeUndefined();
  });
});

describe('decomposeLT — hybrid split from the two LT columns', () => {
  it('pure BESS: columns agree, no non-BESS component, high confidence', () => {
    const r = decomposeLT({ maxPower: 50, bessPower: 50, plantType: 'BESS' });
    expect(r.site_total_mw).toBe(50);
    expect(r.bess_mw).toBe(50);
    expect(r.non_bess_mw).toBeUndefined();
    expect(r.parse_confidence).toBe(CONFIDENCE.HIGH);
  });

  it('hybrid: derives the non-BESS component from the difference', () => {
    const r = decomposeLT({ maxPower: 80, bessPower: 30, plantType: 'SUN E with BESS' });
    expect(r.bess_mw).toBe(30);
    expect(r.non_bess_mw).toBe(50);
    expect(r.parse_confidence).toBe(CONFIDENCE.HIGH);
  });

  it('ANOMALY — hybrid type but equal columns: low confidence, never a silent split', () => {
    const r = decomposeLT({ maxPower: 40, bessPower: 40, plantType: 'WIND E with BESS' });
    expect(r.parse_confidence).toBe(CONFIDENCE.LOW);
    expect(r.parse_note).toMatch(/unverified/i);
  });

  it('handles decimal commas in either column', () => {
    const r = decomposeLT({ maxPower: '111,6', bessPower: '8,5', plantType: 'SUN and WIND E with BESS' });
    expect(r.site_total_mw).toBeCloseTo(111.6);
    expect(r.bess_mw).toBeCloseTo(8.5);
  });
});

describe('stableId + entity detection', () => {
  it('is deterministic for the same row', () => {
    const a = stableId({ country: 'LT', spv: 'UAB "X"', org: 'Y', location: 'Z' });
    const b = stableId({ country: 'LT', spv: 'UAB "X"', org: 'Y', location: 'Z' });
    expect(a).toBe(b);
  });

  it('distinguishes two rows sharing an SPV name but differing in org/location', () => {
    const a = stableId({ country: 'LT', spv: 'UAB "X"', org: 'Org A', location: 'Place A' });
    const b = stableId({ country: 'LT', spv: 'UAB "X"', org: 'Org B', location: 'Place B' });
    expect(a).not.toBe(b);
  });

  it('separates legal entities from project descriptors', () => {
    expect(isLegalEntity('UAB "Testonys BESS"')).toBe(true);
    expect(isLegalEntity('SIA "Something"')).toBe(true);
    expect(isLegalEntity('Evecon Solar 999 OÜ')).toBe(true);
    // descriptors — these have no company to look up in a registry
    expect(isLegalEntity('BESS & PV Hybrid Somewhere')).toBe(false);
    expect(isLegalEntity('BESS Riga Placename')).toBe(false);
  });

  it('normName strips diacritics and smart quotes like the worker does', () => {
    expect(normName('UAB „Tauršolos saulė"')).toBe('uab taursolos saule');
  });
});

// ── match engine ──────────────────────────────────────────────────────────────
describe('match engine', () => {
  it('matches an exact name within the same country', () => {
    const row = normaliseRow(SYNTH_LT_ROW, 'LT');
    const m = matchRow(row, SYNTH_PUBLIC_FLEET);
    expect(m.status).toBe(MATCH.MATCHED);
    expect(m.best.id).toBe('testonys-bess-lt');
  });

  it('country is a hard gate — an identical name in another country scores zero', () => {
    const row = normaliseRow(SYNTH_LT_ROW, 'LT');
    const lvEntry = SYNTH_PUBLIC_FLEET.find((e) => e.country === 'LV');
    expect(scorePair(row, lvEntry)).toBe(0);
  });

  it('reports new-to-us when nothing plausible exists', () => {
    const row = normaliseRow({ ...SYNTH_LT_ROW, SPV: 'UAB "Niekur Nerastas"', Vieta: 'Niekur' }, 'LT');
    const m = matchRow(row, SYNTH_PUBLIC_FLEET);
    expect(m.status).toBe(MATCH.NEW);
    expect(m.best).toBeNull();
  });

  it('MW agreement alone does not create a match', () => {
    // same MW as the fixture, completely unrelated name and place
    const row = normaliseRow({ ...SYNTH_LT_ROW, SPV: 'UAB "Nesusijes Vardas"', Vieta: 'Kitur' }, 'LT');
    const m = matchRow(row, SYNTH_PUBLIC_FLEET);
    expect(m.status).toBe(MATCH.NEW);
  });

  it('summarises per country, splitting entities from descriptors', () => {
    const rows = [
      normaliseRow(SYNTH_LT_ROW, 'LT'),
      normaliseRow({ ...SYNTH_LT_ROW, SPV: 'BESS Hybrid Descriptor' }, 'LT'),
    ];
    const { summary } = matchAll(rows, SYNTH_PUBLIC_FLEET);
    expect(summary.LT.total).toBe(2);
    expect(summary.LT.legal_entities).toBe(1);
    expect(summary.LT.descriptors).toBe(1);
  });
});

// ── verification tiers ────────────────────────────────────────────────────────
describe('computeTier — tier is DERIVED from evidence, never assigned', () => {
  it('no evidence ⇒ private-only', () => {
    expect(computeTier([])).toBe(TIERS.PRIVATE_ONLY);
    expect(computeTier(undefined)).toBe(TIERS.PRIVATE_ONLY);
  });

  it('evidence WITHOUT a resolvable URL is not a citation ⇒ private-only (rule #3)', () => {
    expect(computeTier([{ source_type: 'registry', url: '' }])).toBe(TIERS.PRIVATE_ONLY);
    expect(computeTier([{ source_type: 'registry', url: 'see the register' }])).toBe(TIERS.PRIVATE_ONLY);
  });

  it('a cited registry/regulator/TSO source ⇒ public-confirmed', () => {
    expect(computeTier([{ source_type: 'registry', url: 'https://example.org/e/1' }])).toBe(TIERS.PUBLIC_CONFIRMED);
    expect(computeTier([{ source_type: 'regulator', url: 'https://example.org/d/2' }])).toBe(TIERS.PUBLIC_CONFIRMED);
  });

  it('press or developer-site only ⇒ corroborated', () => {
    expect(computeTier([{ source_type: 'press', url: 'https://example.org/n/3' }])).toBe(TIERS.CORROBORATED);
    expect(computeTier([{ source_type: 'developer_site', url: 'https://example.org/p/4' }])).toBe(TIERS.CORROBORATED);
  });

  it('private-only is never publishable', () => {
    expect(isPublishable(TIERS.PRIVATE_ONLY)).toBe(false);
    expect(isPublishable(TIERS.PUBLIC_CONFIRMED)).toBe(true);
    expect(isPublishable(TIERS.CORROBORATED)).toBe(true);
  });
});

// ── LEAK TESTS — the non-negotiable ───────────────────────────────────────────
describe('LEAK: private fields never reach a public projection', () => {
  const fullRow = {
    ...normaliseRow(SYNTH_LT_ROW, 'LT'),
    verification_status: TIERS.PUBLIC_CONFIRMED,
    citations: [{ source_type: 'registry', url: 'https://example.org/entity/1' }],
  };

  it('the row under test genuinely carries the private fields (guards a vacuous test)', () => {
    expect(fullRow.contact).toBe('nobody@example.invalid');
    expect(fullRow.comment).toMatch(/sinteticnis/);
    expect(fullRow.apva_flag).toBe('Gavo');
  });

  it('toPublicRow strips every ALWAYS_PRIVATE field', () => {
    const pub = toPublicRow(fullRow);
    expect(pub).not.toBeNull();
    for (const f of ALWAYS_PRIVATE_FIELDS) {
      expect(pub).not.toHaveProperty(f);
    }
  });

  it('toPublicRow emits ONLY allowlisted fields — a new field defaults to private', () => {
    const withNewField = { ...fullRow, secret_new_field: 'should not appear' };
    const pub = toPublicRow(withNewField);
    expect(pub).not.toHaveProperty('secret_new_field');
    for (const k of Object.keys(pub)) expect(PUBLIC_FIELDS).toContain(k);
  });

  it('APVA flag never appears in a public projection', () => {
    const pub = toPublicRow(fullRow);
    expect(JSON.stringify(pub)).not.toMatch(/Gavo|Negavo|apva/i);
  });

  it('a private-only row projects to null — it cannot be published at all', () => {
    expect(toPublicRow({ ...fullRow, verification_status: TIERS.PRIVATE_ONLY })).toBeNull();
  });

  it('a publishable tier WITHOUT citations still projects to null (rule #3)', () => {
    expect(toPublicRow({ ...fullRow, citations: [] })).toBeNull();
  });

  it('findPrivateLeaks detects private fields at any nesting depth', () => {
    expect(findPrivateLeaks({ a: { b: [{ contact: 'x' }] } })).toContain('$.a.b[0].contact');
    expect(findPrivateLeaks({ ok: 1, nested: { fine: true } })).toEqual([]);
  });

  it('findContactShapedContent catches an email even under a renamed field', () => {
    const leaks = findContactShapedContent({ notes: 'reach them at someone@example.invalid' });
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0]).toMatch(/email-shaped/);
  });

  it('findContactShapedContent catches Baltic phone numbers', () => {
    expect(findContactShapedContent({ x: '+370 600 12345' }).length).toBeGreaterThan(0);
    expect(findContactShapedContent({ x: '+371 20 123 456' }).length).toBeGreaterThan(0);
    expect(findContactShapedContent({ x: '+372 5123 4567' }).length).toBeGreaterThan(0);
  });

  it('a clean public projection passes BOTH leak detectors', () => {
    const pub = toPublicRow(fullRow);
    expect(findPrivateLeaks(pub)).toEqual([]);
    expect(findContactShapedContent(pub)).toEqual([]);
  });

  it('a whole batch of public projections is leak-free', () => {
    const rows = [SYNTH_LT_ROW, SYNTH_LT_HYBRID].map((r) => ({
      ...normaliseRow(r, 'LT'),
      verification_status: TIERS.PUBLIC_CONFIRMED,
      citations: [{ source_type: 'registry', url: 'https://example.org/e/1' }],
    }));
    const payload = { rows: rows.map(toPublicRow) };
    expect(findPrivateLeaks(payload)).toEqual([]);
    expect(findContactShapedContent(payload)).toEqual([]);
  });
});

// ── placename-only guard (regression: found in the first real intake run) ──────
describe('match engine — placename-only agreement is not identity', () => {
  const PUBLIC = [{ id: 'anytown-bs-lt', name: 'UAB "Anytown BS"', mw: 30, country: 'LT' }];

  it('does NOT assert a match when the only shared token is the location', () => {
    // two genuinely different projects by one developer in one town
    const row = normaliseRow({
      SPV: 'UAB "Anytown PV"', Organizacija: 'Some Org', 'Power plant type': 'BESS',
      'Max power MW': 30, 'Bess (MW)': 30, Vieta: 'Anytown', Kontaktas: '', Komentaras: '',
    }, 'LT');
    const m = matchRow(row, PUBLIC);
    expect(m.status).not.toBe(MATCH.MATCHED);
    expect(m.status).toBe(MATCH.PROBABLE); // still surfaced for a human look
  });

  it('still matches when the name carries a discriminating token beyond the place', () => {
    const row = normaliseRow({
      SPV: 'UAB "Anytown BS"', Organizacija: 'Some Org', 'Power plant type': 'BESS',
      'Max power MW': 30, 'Bess (MW)': 30, Vieta: 'Anytown', Kontaktas: '', Komentaras: '',
    }, 'LT');
    expect(matchRow(row, PUBLIC).status).toBe(MATCH.MATCHED);
  });
});
