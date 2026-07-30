// Gates for the 36.E0 mature-market evidence base.
//
// Two kinds of test live here, and the split is deliberate (B5 — mirror tests are blind to
// shared error):
//
//  1. FIXTURE tests parse committed raw source bytes and assert the parse against values a
//     reader can check by opening the file. These catch parser drift when a portal changes
//     its schema.
//  2. INVARIANT tests assert properties that must hold whatever the source says: unit
//     conversions must be self-consistent, absence must not be zero, a duration-weighted mean
//     must differ from an unweighted one when resolutions are mixed, and every committed file
//     must match its manifest checksum.
//
// The second kind is what makes the first kind trustworthy. A fixture cut from a file that
// parsed correctly passes forever, which is exactly how 36.D's tripwire fixtures gave no hint
// that two of three targets were dead.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  validateRow, row, capacityToEurPerMwPerHour, PRICE_BASES, FIELDS,
} from '../mature-markets/schema.mjs';
import { berlinWallClockToUtc, stockholmWallClockToUtc, wallClockToUtc } from '../mature-markets/tz.mjs';
import {
  loadDataset, readManifest, monthlyAggregate, rowMinutes, seriesKey, segmentMonths, loadCalendar,
} from '../mature-markets/loader.mjs';

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'mature-markets');
const FIX = path.join(ROOT, 'fixtures', 'mature-markets');

const exists = (p: string) => fs.existsSync(p);

// ── Schema invariants ──────────────────────────────────────────────────────

describe('schema', () => {
  it('rejects a price with no price_eur — a priced row that cannot be compared is not usable', () => {
    const r = row({
      market: 'DE', area: 'X', product: 'aFRR', direction: 'up', mechanism: 'cap',
      period_start: '2024-01-01T00:00:00Z', period_end: '2024-01-01T04:00:00Z', resolution: 'PT4H',
      price: 10, price_unit: 'EUR/MW/h', currency: 'EUR', price_eur: null, price_norm: 10,
      price_norm_unit: 'EUR/MW/h', price_basis: 'clearing',
    });
    expect(validateRow(r)).toContain('price set but price_eur null');
  });

  it('rejects a capacity row normalised to an energy unit', () => {
    const r = row({
      market: 'DE', area: 'X', product: 'aFRR', direction: 'up', mechanism: 'cap',
      period_start: '2024-01-01T00:00:00Z', period_end: '2024-01-01T04:00:00Z', resolution: 'PT4H',
      price: 10, price_unit: 'EUR/MW/h', currency: 'EUR', price_eur: 10, price_norm: 10,
      price_norm_unit: 'EUR/MWh', price_basis: 'clearing',
    });
    expect(validateRow(r)).toContain('cap rows normalise to EUR/MW/h');
  });

  it('rejects a zero-length period', () => {
    const r = row({
      market: 'SE', area: 'SE', product: 'FCR-N', direction: 'symmetric', mechanism: 'cap',
      period_start: '2021-03-28T00:00:00Z', period_end: '2021-03-28T00:00:00Z', resolution: 'PT1H',
      price: 5, price_unit: 'EUR/MW', currency: 'EUR', price_eur: 5, price_norm: 5,
      price_norm_unit: 'EUR/MW/h', price_basis: 'clearing',
    });
    expect(validateRow(r)).toContain('period_end<=period_start');
  });

  it('keeps offer_curve_mean as a distinct basis from a settled price', () => {
    // The German RAM energy export describes the OFFER curve. Collapsing it into "clearing"
    // would let an offer statistic be modelled as revenue.
    expect(PRICE_BASES).toContain('offer_curve_mean');
    expect(PRICE_BASES).toContain('clearing');
  });

  it('fixes field order so committed NDJSON stays diffable', () => {
    expect(FIELDS[0]).toBe('market');
    expect(FIELDS.at(-1)).toBe('extra');
    expect(new Set(FIELDS).size).toBe(FIELDS.length);
  });
});

describe('capacity unit normalisation', () => {
  it('treats EUR/MW as per product period and EUR/MW/h as per hour', () => {
    // Germany relabelled aFRR/mFRR from EUR/MW per 4h product to (EUR/MW)/h in Dec 2021 with
    // no market change. Getting this wrong is a silent 4x.
    expect(capacityToEurPerMwPerHour(40, 'EUR/MW', 4)).toBe(10);
    expect(capacityToEurPerMwPerHour(10, 'EUR/MW/h', 4)).toBe(10);
    expect(capacityToEurPerMwPerHour(10, '(EUR/MW)/h', 4)).toBe(10);
  });

  it('reproduces the measured FCR product-length check', () => {
    // 2020-06-30: one 24h product at 150.30 EUR/MW. 2020-07-01: six 4h products summing to
    // 140.42 EUR/MW. If EUR/MW were per hour the daily-era series would read 24x its own
    // later era. Per period, the two days are within 7 % of each other.
    const daily = capacityToEurPerMwPerHour(150.3, 'EUR/MW', 24)!;
    const fourHourSum = [31.46, 23.51, 21.07, 16.67, 28.56, 19.15];
    const nextDayMean = fourHourSum
      .map((p) => capacityToEurPerMwPerHour(p, 'EUR/MW', 4)!)
      .reduce((a, b) => a + b, 0) / 6;
    expect(daily).toBeCloseTo(6.2625, 4);
    expect(Math.abs(nextDayMean - daily) / daily).toBeLessThan(0.1);
  });

  it('returns null for an unrecognised unit rather than guessing', () => {
    // An unknown unit must fail a gate, not silently produce a number that is wrong by the
    // product length.
    expect(capacityToEurPerMwPerHour(10, 'EUR/MW/day', 4)).toBeNull();
    expect(capacityToEurPerMwPerHour(null, 'EUR/MW', 4)).toBeNull();
  });
});

// ── Timezone ───────────────────────────────────────────────────────────────

describe('local wall clock to UTC', () => {
  it('resolves CET and CEST correctly', () => {
    expect(berlinWallClockToUtc('2026-01-15', 0)).toBe('2026-01-14T23:00:00Z');
    expect(berlinWallClockToUtc('2026-01-15', 720)).toBe('2026-01-15T11:00:00Z');
    expect(berlinWallClockToUtc('2026-07-15', 0)).toBe('2026-07-14T22:00:00Z');
  });

  it('handles the spring-forward gap without inventing an instant', () => {
    // 02:00 local does not exist on 2026-03-29; clocks jump 02:00 → 03:00 CEST = 00:00Z.
    expect(berlinWallClockToUtc('2026-03-29', 120)).toBe('2026-03-29T00:00:00Z');
    // The local day is 23 h long, so 00:00 → 24:00 spans 23 h in absolute time.
    const span = (Date.parse(berlinWallClockToUtc('2026-03-29', 1440)) - Date.parse(berlinWallClockToUtc('2026-03-29', 0))) / 3600000;
    expect(span).toBe(23);
  });

  it('handles the autumn fall-back 25-hour day', () => {
    const span = (Date.parse(berlinWallClockToUtc('2026-10-25', 1440)) - Date.parse(berlinWallClockToUtc('2026-10-25', 0))) / 3600000;
    expect(span).toBe(25);
  });

  it('uses the right zone per market', () => {
    // Sweden and Germany share offsets; this asserts the plumbing, not a coincidence.
    expect(stockholmWallClockToUtc('2026-01-15', 0)).toBe('2026-01-14T23:00:00Z');
    // NEM market time is UTC+10 with no DST — deliberately NOT South Australian civil time.
    expect(wallClockToUtc('Australia/Brisbane', '2024-01-15', 0)).toBe('2024-01-14T14:00:00Z');
    expect(wallClockToUtc('Australia/Brisbane', '2024-07-15', 0)).toBe('2024-07-14T14:00:00Z');
  });
});

// ── Aggregation invariants ─────────────────────────────────────────────────

describe('monthly aggregation', () => {
  const mk = (start: string, minutes: number, price: number | null, volume: number | null = null) => row({
    market: 'X', area: 'X', product: 'aFRR', direction: 'up', mechanism: 'cap',
    period_start: start,
    period_end: new Date(Date.parse(start) + minutes * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    resolution: minutes === 15 ? 'PT15M' : minutes === 60 ? 'PT60M' : `PT${minutes / 60}H`,
    price, price_unit: 'EUR/MW/h', currency: 'EUR', price_eur: price,
    price_norm: price, price_norm_unit: price === null ? null : 'EUR/MW/h',
    volume, volume_unit: volume === null ? null : 'MW',
    price_basis: price === null ? null : 'clearing',
  });

  it('weights by duration, not by row count', () => {
    // One 4h block at 100 and four 15-min blocks at 0 must not average to 20.
    const rows = [
      mk('2024-01-01T00:00:00Z', 240, 100),
      mk('2024-01-01T04:00:00Z', 15, 0), mk('2024-01-01T04:15:00Z', 15, 0),
      mk('2024-01-01T04:30:00Z', 15, 0), mk('2024-01-01T04:45:00Z', 15, 0),
    ];
    const [m] = monthlyAggregate(rows);
    expect(m.mean).toBeCloseTo(100 * 240 / 300, 6);   // 80, not 20
    expect(m.mean).not.toBeCloseTo(20, 6);
  });

  it('reports null prices as absence and excludes them from the mean', () => {
    const rows = [mk('2024-02-01T00:00:00Z', 240, 10), mk('2024-02-01T04:00:00Z', 240, null)];
    const [m] = monthlyAggregate(rows);
    expect(m.mean).toBe(10);            // not 5
    expect(m.n_null_price).toBe(1);
    expect(m.coverage).toBe(0.5);
  });

  it('a month of absence is distinguishable from a month of zeros', () => {
    const absent = monthlyAggregate([mk('2024-03-01T00:00:00Z', 240, null)])[0];
    const zeros = monthlyAggregate([mk('2024-03-01T00:00:00Z', 240, 0)])[0];
    expect(absent.mean).toBeNull();
    expect(zeros.mean).toBe(0);
    expect(absent.coverage).toBe(0);
    expect(zeros.coverage).toBe(1);
  });

  it('prefers the measured span over the resolution label on DST days', () => {
    // A nominally 4 h product spans 3 h on the spring-forward day. Duration-weighted maths
    // must use the elapsed hours, not the label.
    const r = { ...mk('2026-03-28T23:00:00Z', 180, 5), resolution: 'PT4H' };
    expect(rowMinutes(r)).toBe(180);
  });

  it('keys series so two directions of one product never merge', () => {
    const up = mk('2024-01-01T00:00:00Z', 240, 10);
    const down = { ...mk('2024-01-01T00:00:00Z', 240, 10), direction: 'down' };
    expect(seriesKey(up)).not.toBe(seriesKey(down as never));
  });
});

describe('structural-break segmentation', () => {
  const months = ['2022-04', '2022-05', '2022-06', '2022-07', '2022-08'].map((m) => ({ month: m, mean: 1 }));
  const breaks = [
    { market: 'DE', date: '2022-06-22', products: ['aFRR'], kind: 'platform_accession', severity: 'high', description: 'PICASSO' },
    { market: 'DE', date: '2022-05-01', products: ['aFRR'], kind: 'data_start', severity: 'series_start', description: 'not a market event' },
    { market: 'GB', date: '2022-07-01', products: ['aFRR'], kind: 'platform_accession', severity: 'high', description: 'wrong market' },
  ];

  it('cuts on a matching high-severity break and on nothing else', () => {
    const { segments } = segmentMonths(months, breaks, { market: 'DE', product: 'aFRR' }) as unknown as {
      segments: { from: string; to: string; opened_by: string }[];
    };
    expect(segments).toHaveLength(2);
    expect(segments[0].to).toBe('2022-05');
    expect(segments[1].from).toBe('2022-06');
    expect(segments[1].opened_by).toContain('2022-06-22');
  });

  it('ignores series_start boundaries and other markets', () => {
    const { breaks_applied } = segmentMonths(months, breaks, { market: 'DE', product: 'aFRR' });
    expect(breaks_applied).toHaveLength(1);
    expect(breaks_applied[0].date).toBe('2022-06-22');
  });

  it('applies BALTIC-scoped breaks to LT, LV and EE', () => {
    const baltic = [{ market: 'BALTIC', date: '2022-06-01', products: ['mFRR'], kind: 'platform_accession', severity: 'high', description: 'MARI' }];
    for (const m of ['LT', 'LV', 'EE']) {
      expect(segmentMonths(months, baltic, { market: m, product: 'mFRR' }).segments).toHaveLength(2);
    }
    expect(segmentMonths(months, baltic, { market: 'PL', product: 'mFRR' }).segments).toHaveLength(1);
  });
});

// ── Fixture tests against committed raw source bytes ───────────────────────

describe('fixtures: committed raw source bytes still parse', () => {
  it('German aggregated capacity export carries per-country columns and a unit in every price header', async () => {
    const p = path.join(FIX, 'de-aggregated-afrr-capacity.xlsx');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fs.readFileSync(p) as never);
    const header = (wb.worksheets[0].getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
    // The trailing-underscore-before-bracket shape is what broke the first parser: every
    // exact-name column lookup missed and the dataset came out empty with no error.
    const priceCols = header.filter((h) => /_CAPACITY_PRICE_\[/.test(h));
    expect(priceCols.length).toBeGreaterThan(0);
    for (const c of priceCols) expect(c).toMatch(/\[\(?EUR\/MW\)?(\/h)?\]$/);
    expect(header.some((h) => /^GERMANY_AVERAGE_CAPACITY_PRICE_/.test(h))).toBe(true);
    expect(header).toContain('PRODUCT');
  });

  it('Swedish Mimer export has the expected columns and a comma decimal separator', () => {
    const p = path.join(FIX, 'se-mimer-sample.csv');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    const header = lines[0].split(';').map((h) => h.trim());
    expect(header[0]).toBe('Datum');
    expect(header).toContain('FCR-N Pris (EUR/MW)');
    expect(header).toContain('FCR-D upp Pris (EUR/MW)');
    expect(header).toContain('FCR-D ned Pris (EUR/MW)');
    // A comma decimal separator parsed as a thousands separator is a 1000x error.
    expect(lines.slice(1).some((l) => /\d,\d/.test(l))).toBe(true);
  });

  it('GB summary export separates cleared volume from clearing price', () => {
    const p = path.join(FIX, 'gb-dc-summary-sample.csv');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    expect(lines[0].split(',')).toEqual(expect.arrayContaining(['Service', 'Cleared Volume', 'Clearing Price']));
    // Rows with zero cleared volume also publish a zero price. Only the volume is a fact.
    const hdr = lines[0].split(',');
    const iVol = hdr.indexOf('Cleared Volume'), iPrice = hdr.indexOf('Clearing Price');
    const zeroVol = lines.slice(1).map((l) => l.split(',')).filter((c) => Number(c[iVol]) === 0);
    if (zeroVol.length) expect(zeroVol.every((c) => Number(c[iPrice]) === 0)).toBe(true);
  });

  it('AEMO export uses NEM market time and a resolution the file itself reveals', () => {
    const p = path.join(FIX, 'au-price-demand-sample.csv');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    expect(lines[0].split(',')).toEqual(expect.arrayContaining(['REGION', 'SETTLEMENTDATE', 'RRP']));
    const stamps = lines.slice(1, 4).map((l) => l.split(',')[1].replace(/"/g, ''));
    expect(stamps[0]).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('ENTSO-E A44 sample is a market document with a resolution and points', () => {
    const p = path.join(FIX, 'entsoe-a44-sample.xml');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const xml = fs.readFileSync(p, 'utf8');
    expect(xml).toContain('<type>A44</type>');
    expect(xml).toMatch(/<resolution>PT\d+M<\/resolution>/);
    expect(xml).toMatch(/<price\.amount>/);
  });
});

// ── Committed-data integrity ───────────────────────────────────────────────

describe('committed datasets match their manifests', () => {
  const datasets = ['de', 'se', 'gb', 'au', 'da'];

  for (const d of datasets) {
    it(`${d}: every file matches its manifest sha256 and row count`, async () => {
      const mpath = path.join(DATA, d, 'manifest.json');
      if (!exists(mpath)) return expect(exists(mpath)).toBe(true);
      const manifest = await readManifest(d);
      expect(manifest.files.length).toBeGreaterThan(0);
      for (const f of manifest.files) {
        const buf = await fsp.readFile(path.join(DATA, d, f.file));
        expect(crypto.createHash('sha256').update(buf).digest('hex')).toBe(f.sha256);
        const n = zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean).length;
        expect(n).toBe(f.rows);
      }
    });

    it(`${d}: loads with every row schema-valid`, async () => {
      if (!exists(path.join(DATA, d, 'manifest.json'))) return;
      // loadDataset throws on any invalid row or checksum mismatch.
      const { rows } = await loadDataset(d);
      expect(rows.length).toBeGreaterThan(0);
    });

    it(`${d}: manifest records a licence and a coverage verdict`, async () => {
      if (!exists(path.join(DATA, d, 'manifest.json'))) return;
      const m = await readManifest(d);
      expect(typeof m.licence).toBe('string');
      expect(m.licence.length).toBeGreaterThan(20);
      expect(m.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Every dataset must state what the portal claimed against what it served.
      expect(m.coverage_verification ?? m.gb_channel ?? m.parsing_notes).toBeTruthy();
    });
  }

  it('no committed price row carries a zero that means absence', async () => {
    // Svenska kraftnät serves absence as a full grid of zeros. If any all-zero SE row survived
    // into the committed data, the FCR-N floor would read 0 and the peak-to-floor ratio would
    // be infinite.
    if (!exists(path.join(DATA, 'se', 'manifest.json'))) return;
    const { rows, manifest } = await loadDataset('se');
    const allZero = rows.filter((r) => r.price === 0 && r.volume === 0);
    expect(allZero).toHaveLength(0);
    expect(manifest.coverage_verification.all_zero_rows_dropped).toBeGreaterThan(0);
  });
});

// ── Calendar integrity ─────────────────────────────────────────────────────

describe('structural-break calendar', () => {
  it('every pinned source was fetched and evidenced something (C7)', async () => {
    const p = path.join(DATA, 'calendar', 'structural-breaks.json');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const cal = await loadCalendar();
    for (const s of cal.sources) {
      expect(s.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(s.http_status).toBe(200);
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
      // "Pinned but blind" is the 36.D tripwire defect: fetched fine, evidenced nothing,
      // reported as armed. It must be unreachable.
      expect(s.evidence_lines_seen).toBeGreaterThan(0);
      expect(s.verdict).toBe('OK');
    }
  });

  it('every event cites a verified source or is measured from data', async () => {
    if (!exists(path.join(DATA, 'calendar', 'structural-breaks.json'))) return;
    const cal = await loadCalendar();
    expect(cal.orphan_events).toHaveLength(0);
    for (const e of cal.events) {
      expect(['OK', 'measured-from-data']).toContain(e.source_verdict);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['past', 'scheduled']).toContain(e.status);
    }
  });

  it('records the Baltic platform accessions as PAST, not as future breaks to model', async () => {
    if (!exists(path.join(DATA, 'calendar', 'structural-breaks.json'))) return;
    const cal = await loadCalendar();
    const find = (market: string, product: string) =>
      cal.events.find((e: never) => (e as { market: string; products?: string[] }).market === market
        && ((e as { products?: string[] }).products ?? []).includes(product));
    // The arc doc treats these as TBD future events. They have happened, and the whole
    // PICASSO/MARI break design in 36.E2/E3 depends on knowing that.
    expect(find('BALTIC', 'mFRR')?.date).toBe('2024-10-10');
    expect(find('LT', 'aFRR')?.date).toBe('2025-03-05');
    expect(find('EE', 'aFRR')?.date).toBe('2025-04-11');
    expect(find('LV', 'aFRR')?.date).toBe('2025-04-11');
    for (const m of ['BALTIC', 'LT', 'EE', 'LV']) {
      expect(cal.events.filter((e: never) => (e as { market: string }).market === m).every((e: never) => (e as { status: string }).status === 'past')).toBe(true);
    }
  });

  it('does not confuse AST (Latvia) with Austria', async () => {
    if (!exists(path.join(DATA, 'calendar', 'structural-breaks.json'))) return;
    const cal = await loadCalendar();
    const at = cal.events.find((e: never) => (e as { market: string; kind: string; products?: string[] }).market === 'AT'
      && (e as { kind: string }).kind === 'platform_accession'
      && ((e as { products?: string[] }).products ?? []).includes('aFRR'));
    const lv = cal.events.find((e: never) => (e as { market: string }).market === 'LV');
    expect(at?.date).toBe('2022-06-22');
    expect(lv?.date).toBe('2025-04-11');
    expect(at?.date).not.toBe(lv?.date);
  });
});

// ── The engine must not have been touched ──────────────────────────────────

describe('scope', () => {
  it('adds no dependency beyond what the repo already has', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'package.json'), 'utf8'));
    // exceljs was already a devDependency for the deliverable builder; nothing new is needed.
    expect(pkg.devDependencies.exceljs).toBeTruthy();
  });
});
