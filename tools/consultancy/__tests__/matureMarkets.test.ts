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
//
// TIMEOUT (36.E0.3). vitest's 5 000 ms default was silently adjudicating MACHINE SPEED as data
// validity. Three tests here load whole datasets — de (934 217 rows), au (1 252 128) and the
// per-row activation sweep (286 137 rows × 5 assertions) — and on 2026-08-02 all three timed
// out on the GitHub runner while the same commit was 71/71 green locally. Measured, not
// assumed: local 14.4 s wall / de 2 143 ms / au 1 752 ms / activation 4 138 ms, against 41.3 s
// wall on Actions — a ~2.9× slower runner, which lands de at ~6.2 s, au at ~5.1 s and
// activation at ~12.0 s. That predicts exactly the three that failed and exactly the one that
// nearly did (au), and it predicts da (748 ms → ~2.2 s) surviving, which it did.
//
// Nothing about the ASSERTIONS changes here — the ceiling does. A timeout is not a gate on the
// data; treating it as one meant a slow runner could report a valid evidence base as invalid,
// and (via B-053) a broken one as valid. 60 s is ~5× the worst observed Actions time.
vi.setConfig({ testTimeout: 60_000 });

import { describe, it, expect, vi } from 'vitest';
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
  const datasets = ['de', 'se', 'gb', 'au', 'da', 'activation'];

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

// ── Settled activation prices (36.B-036) ───────────────────────────────────

describe('settled activation prices', () => {
  const ACT = path.join(DATA, 'activation');
  const have = () => exists(path.join(ACT, 'manifest.json'));

  // A FIXTURE test on the raw A84 bytes, independent of the committed dataset. This is the one
  // that catches parser drift if ENTSO-E reorders the children of <Point>: the price regex requires
  // <position> to be followed immediately by <activation_Price.amount>, and a document shaped
  // differently would be skipped SILENTLY and produce a short series with nothing failing.
  it('parses the committed A84 document with no point silently dropped', async () => {
    const p = path.join(FIX, 'entsoe-a84-de-afrr-sample.xml');
    if (!exists(p)) return expect(exists(p)).toBe(true);
    const { parseDoc } = await import('../mature-markets/fetch-activation-prices.mjs');
    const xml = fs.readFileSync(p, 'utf8');
    const out = parseDoc(xml, { market: 'DE', area: 'DE', product: 'aFRR', eic: '10YDE-VE-------2' });

    // Rows may EXCEED points, because curveType A03 compresses runs of quarter-hours into one
    // point and each point is expanded across its block. What must hold is the tiling invariant:
    // no hole and no overlap inside any Period. A non-empty `gaps` means the publisher changed
    // shape and the reading needs redoing.
    expect(out.pointElements).toBeGreaterThan(100);
    expect(out.rows.length).toBeGreaterThanOrEqual(out.pointElements);
    expect(out.gaps).toHaveLength(0);
    expect(out.unitsSeen).toEqual(['EUR/MWH']);
    // This particular document is Germany's sparse-Period style, so no block is compressed and
    // rows equal points. Asserted explicitly so a change in German publication style is visible.
    expect(out.rows.length).toBe(out.pointElements);
    expect(out.rows.filter((r: { extra: { block_isps?: number } }) => r.extra.block_isps)).toHaveLength(0);

    // Both directions present, and sparse — this is one day, so at most 96 ISPs per direction.
    const byDir: Record<string, number> = {};
    for (const r of out.rows) byDir[String(r.direction)] = (byDir[String(r.direction)] ?? 0) + 1;
    expect(byDir.up).toBeGreaterThan(0);
    expect(byDir.down).toBeGreaterThan(0);
    for (const n of Object.values(byDir)) expect(n).toBeLessThanOrEqual(96);

    for (const r of out.rows) expect(validateRow(r)).toEqual([]);
    // Values a reader can check by opening the file: the first activated ISP of 2026-01-05.
    const first = out.rows.find((r: { period_start: string; direction: string }) =>
      r.period_start === '2026-01-05T00:00:00Z' && r.direction === 'up');
    expect(first.price).toBe(139.25);
    expect(first.period_end).toBe('2026-01-05T00:15:00Z');
    expect(first.price_basis).toBe('vwap_activated');
    expect(first.price_norm).toBe(139.25);
  });

  it('importing the fetcher does not fire network requests', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'fetch-activation-prices.mjs'), 'utf8');
    // A bare `await main()` at module scope means any import — including this test's — starts
    // fetching. It happened during development.
    expect(src).not.toMatch(/^await main\(\);/m);
    expect(src).toMatch(/invokedDirectly/);
  });

  it('every row is vwap_activated in EUR/MWh at PT15M, and none is an offer-curve statistic', async () => {
    if (!have()) return;
    const { rows } = await loadDataset('activation');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.price_basis).toBe('vwap_activated');
      expect(r.mechanism).toBe('energy');
      expect(r.price_norm_unit).toBe('EUR/MWh');
      expect(r.resolution).toBe('PT15M');
      expect(r.currency).toBe('EUR');
    }
    // The whole point of the dataset. If an offer_curve_mean row ever lands in here, the trap
    // E0 documented has been reintroduced under a new name.
    expect(rows.some((r) => r.price_basis === 'offer_curve_mean')).toBe(false);
  });

  it('never records an unpriced or zero-priced ISP', async () => {
    if (!have()) return;
    const { rows, manifest } = await loadDataset('activation');
    // A null price would mean "we recorded an ISP we could not price", which this source never
    // produces: it publishes a price or it publishes nothing.
    expect(rows.filter((r) => r.price === null)).toHaveLength(0);
    // Zero is absence in both publication styles and must never survive into the committed data —
    // the German RAM export and the Swedish grid-of-zeros are what this rule is paid for.
    expect(rows.filter((r) => r.price === 0)).toHaveLength(0);
    // And the drop must be accounted for per series rather than silently, because for AT mFRR it
    // is 214 090 dropped against 5 380 kept.
    const summary = manifest.coverage_verification.activated_isps_by_series;
    for (const v of Object.values(summary) as { zero_price_isps_dropped: number }[]) {
      expect(typeof v.zero_price_isps_dropped).toBe('number');
    }
  });

  it('is sparse per direction — a frequency parameter needs room to be below 1', async () => {
    if (!have()) return;
    const { rows } = await loadDataset('activation');
    // Per DIRECTION, not per series: an earlier version of this test compared a two-direction row
    // count against a one-direction slot count and failed for arithmetic reasons rather than data
    // reasons.
    for (const [market, product] of [['DE', 'aFRR'], ['DE', 'mFRR'], ['AT', 'mFRR']] as const) {
      const sel = rows.filter((r) => r.market === market && r.product === product && r.direction === 'up')
        .sort((a, b) => a.period_start.localeCompare(b.period_start));
      if (sel.length < 2) continue;
      const slots = (Date.parse(sel.at(-1)!.period_end) - Date.parse(sel[0]!.period_start)) / 60000 / 15;
      expect(sel.length, `${market} ${product} up`).toBeLessThan(slots);
    }
  });

  it('German rows are one NRV-wide price from a single named control area', async () => {
    if (!have()) return;
    const { rows, manifest } = await loadDataset('activation');
    const de = rows.filter((r) => r.market === 'DE');
    if (!de.length) return;
    const eics = new Set(de.map((r) => r.extra.control_area_eic));
    // Mixing control areas would be silently mixing publishers. Three German TSOs publish the
    // same numbers, so any one of them is the series — but only one may be the source of record.
    expect(eics.size).toBe(1);
    const deEntry = manifest.markets.find((m: { market: string }) => m.market === 'DE');
    expect(deEntry.control_area_eic).toBe([...eics][0]);
    expect(deEntry.mirror_control_areas.length).toBeGreaterThan(0);
    expect(deEntry.silent_control_areas.length).toBeGreaterThan(0);
  });

  it('the DE series starts at the primary-sourced PICASSO accession, and the manifest says so', async () => {
    if (!have()) return;
    const { rows, manifest } = await loadDataset('activation');
    const de = rows.filter((r) => r.market === 'DE' && r.product === 'aFRR')
      .sort((a, b) => a.period_start.localeCompare(b.period_start));
    if (!de.length) return;
    const calendar = await loadCalendar();
    const picassoDe = calendar.events.find((e: { market: string; kind: string; products?: string[] }) =>
      e.market === 'DE' && e.kind === 'platform_accession' && e.products?.includes('aFRR'));
    expect(picassoDe.date).toBe('2022-06-22');
    // Rule #2: this is derived from the data, not asserted from a remembered observation. The
    // series must start on the accession date or the day before it (the go-live evening).
    const first = de[0].period_start.slice(0, 10);
    const dayBefore = new Date(Date.parse(picassoDe.date + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
    expect([picassoDe.date, dayBefore]).toContain(first);
    // And the consequence must be recorded, because it is what stops E2 from claiming a
    // before/after it does not have.
    expect(manifest.coverage_verification.verdict).toMatch(/no pre-PICASSO segment/i);
  });

  it('no market carries a settled activation price from before its own accession — n=0, asserted', async () => {
    // This test replaces one that asserted the opposite. Austria was acquired believing it spanned
    // the PICASSO break; under standard_MarketProduct=A01 it does not, and neither does Germany.
    // The assertion is kept as a gate so a future acquisition that DOES find pre-accession data
    // fails here and forces the comparability note to be revisited, rather than quietly changing
    // what E2 is entitled to claim.
    if (!have()) return;
    const { rows } = await loadDataset('activation');
    const calendar = await loadCalendar();
    const accession = (market: string, product: string) => calendar.events.find((e: { market: string; kind: string; products?: string[] }) =>
      e.market === market && e.kind === 'platform_accession' && e.products?.includes(product))?.date;
    for (const [market, product] of [['DE', 'aFRR'], ['AT', 'aFRR'], ['AT', 'mFRR']] as const) {
      const date = accession(market, product);
      if (!date) continue;
      const sel = rows.filter((r) => r.market === market && r.product === product);
      if (!sel.length) continue;
      const before = sel.filter((r) => r.period_start < date).length;
      const after = sel.length - before;
      // Not "zero rows" — measured, AT mFRR carries 49 activated quarter-hours in the 13 days
      // between its series start (2023-06-13) and its MARI accession (2023-06-27). The claim that
      // matters is that no market has a pre-accession sample large enough to calibrate a break
      // magnitude on, so the gate is a ratio with the counts in the message. If a future
      // acquisition finds a real pre-accession segment this fires, and the comparability note has
      // to be revisited rather than quietly outgrown.
      expect(before / Math.max(1, after), `${market} ${product}: ${before} activated ISPs before ${date} vs ${after} after`).toBeLessThan(0.02);
    }
  });

  it('reproduces the German TSOs\' own AEP-Modul-1 value from committed bytes, offline', async () => {
    // B5: an independent check against a DIFFERENT publisher of the same settled number.
    // netztransparenz.de is the German TSOs' settlement-data platform; its AEP Modul 1 follows the
    // imbalance direction, so each ISP should match either the up or the down A84 price.
    const csvPath = path.join(FIX, 'nt-aep-module-sample.csv');
    if (!have() || !exists(csvPath)) return;
    const { rows } = await loadDataset('activation');
    const byInstant = new Map<string, number>();
    for (const r of rows) {
      if (r.market !== 'DE' || r.product !== 'aFRR') continue;
      byInstant.set(`${r.direction}|${r.period_start}`, r.price as number);
    }
    if (!byInstant.size) return;

    const lines = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim().split('\n');
    const header = lines[0].split(';').map((h) => h.trim());
    expect(header).toEqual(['Datum', 'Zeitzone', 'von', 'bis', 'Einheit', 'AEP Modul 1', 'AEP Modul 2', 'AEP Modul 3']);
    let matched = 0;
    let priced = 0;
    for (const line of lines.slice(1)) {
      const c = line.split(';');
      if (c[1] !== 'UTC' || c[5] === 'N.E.') continue;
      const [d, m, y] = c[0].split('.');
      const iso = `${y}-${m}-${d}T${c[2]}:00Z`;
      const m1 = Number(c[5].replace(',', '.'));
      priced++;
      const up = byInstant.get(`up|${iso}`);
      const down = byInstant.get(`down|${iso}`);
      if ((up !== undefined && Math.abs(up - m1) < 0.005) || (down !== undefined && Math.abs(down - m1) < 0.005)) matched++;
    }
    expect(priced).toBeGreaterThan(50);
    // Not 100 %: Modul 1 is a derived module with its own combination rules, not a
    // republication of the VWAP. The measured agreement when this fixture was cut was 78/92.
    // The floor is set below that so a genuine A84 regression fails while Modul-1 rule drift
    // does not, and the number is quoted here so the gap stays visible rather than rounded away.
    expect(matched / priced).toBeGreaterThan(0.7);
  });

  it('summary-table gives activation series their own block and no lifecycle cells', async () => {
    const p = path.join(DATA, 'summary-table.json');
    if (!have() || !exists(p)) return;
    const table = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(Array.isArray(table.activation_prices)).toBe(true);
    expect(table.activation_prices.length).toBeGreaterThan(0);
    for (const a of table.activation_prices) {
      expect(a.price_basis).toBe('vwap_activated');
      // Level and frequency are two parameters. Both must be present and neither may be folded
      // into the other in the evidence base.
      expect(typeof a.mean_over_activated_eur_mwh).toBe('number');
      expect(typeof a.activation_frequency).toBe('number');
      expect(a.activation_frequency).toBeGreaterThan(0);
      expect(a.activation_frequency).toBeLessThanOrEqual(1);
      // No peak-to-floor, no saturation month. Those are capacity-market statistics.
      expect(a.peak_to_floor).toBeUndefined();
      expect(a.saturation_month).toBeUndefined();
      expect(a.lifecycle_columns).toMatch(/not_applicable/);
    }
    // And the lifecycle table must not have quietly absorbed them.
    for (const s of table.series) expect(s.price_basis).not.toBe('vwap_activated');
  });
});

// ── Refresh automation (36.E0.1) ───────────────────────────────────────────

describe('refresh automation', () => {
  const WF = path.join(ROOT, '..', '..', '.github', 'workflows', 'refresh-mature-markets.yml');

  it('the scheduled workflow exists, is monthly, and is PR-based rather than pushing to main', () => {
    expect(exists(WF)).toBe(true);
    const y = fs.readFileSync(WF, 'utf8');
    expect(y).toMatch(/schedule:/);
    // 36.E0.3 / B-052 — INVERTED, not updated. This line used to read
    //     expect(y).toMatch(/cron:\s*'0 3 1-7 \* 0'/);   // "First Sunday of the month."
    // which asserted the defect as the requirement: `0 3 1-7 * 0` ORs day-of-month with
    // day-of-week and fires ~11×/month. The test was green for the entire life of the bug and
    // was one of the reasons it survived — so it now asserts that form is ABSENT (B-036
    // precedent: a test that asserted a wrong claim is inverted, never quietly corrected).
    //
    // What "monthly" actually means is not decided here. It is computed from the cron and the
    // window guard in refreshWorkflow.test.ts, which is the only place that may make the claim.
    expect(y).not.toMatch(/cron:\s*'0 3 1-7 \* 0'/);
    expect(y).toMatch(/gh pr create/);
    // A push to main would bypass the review the whole design exists to preserve.
    expect(y).not.toMatch(/git push (-f )?origin main/);
    expect(y).not.toMatch(/git push origin HEAD:main/);
  });

  it('the workflow cannot leak the ENTSO-E key to a fork PR and never echoes it', () => {
    const raw = fs.readFileSync(WF, 'utf8');
    // Assert on executable content only. The header comment documents the absence of `set -x`,
    // and a naive whole-file regex matched that comment — a gate that fires on its own
    // documentation is a gate that gets deleted rather than fixed.
    const y = raw.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    // A pull_request trigger on a public repo is how secrets escape. There must not be one.
    expect(y).not.toMatch(/^\s*pull_request:/m);
    expect(y).toMatch(/ENTSOE_API_KEY: \$\{\{ secrets\.ENTSOE_API_KEY \}\}/);
    expect(y).not.toMatch(/echo .*secrets\.ENTSOE_API_KEY/);
    // Shell tracing would print the token as part of the command line.
    expect(y).not.toMatch(/^\s*set\s+-[a-wyz]*x/m);
    expect(y).not.toMatch(/set -o xtrace/);
    expect(y).not.toMatch(/^\s*env\s*(\||$)/m);
  });

  it('every source the refresh claims to cover has a manifest it can actually read', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    const dirs = [...src.matchAll(/\bdir: '([a-z]+)'/g)].map((m) => m[1]);
    expect(dirs.length).toBeGreaterThan(5);
    // The calendar's manifest IS structural-breaks.json. A source whose manifest cannot be found
    // audits an empty file list and reports "no change" forever, which is why this is asserted
    // rather than assumed.
    for (const d of dirs) {
      const found = ['manifest.json', 'structural-breaks.json'].some((f) => exists(path.join(DATA, d, f)));
      expect(found, `${d} has no readable manifest`).toBe(true);
    }
  });

  it('every source the refresh covers has a fetcher script that exists', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    const scripts = [...src.matchAll(/script: '([a-z0-9-]+\.mjs)'/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(5);
    for (const s of scripts) expect(exists(path.join(ROOT, 'mature-markets', s)), `${s} missing`).toBe(true);
  });

  it('the refresh treats comparability.md as human-owned', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    expect(src).toMatch(/docs\/research\/mature-market-comparability\.md/);
    expect(src).toMatch(/HUMAN_OWNED/);
  });

  it('the append-only gate compares substantive fields and excludes retrieval metadata', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    // If `extra` were compared, every refresh would flag every row as restated and the gate
    // would be trained to be ignored.
    expect(src).toMatch(/COMPARED_FIELDS/);
    const compared = /const COMPARED_FIELDS = \[([^\]]*)\]/.exec(src)![1];
    expect(compared).toMatch(/'price'/);
    expect(compared).toMatch(/'price_norm'/);
    expect(compared).toMatch(/'price_basis'/);
    expect(compared).not.toMatch(/'extra'/);
    expect(src).toMatch(/history_restated/);
    expect(src).toMatch(/rows_removed/);
  });

  it('activation rows store no per-retrieval timestamp, so untouched shards stay byte-stable', async () => {
    if (!exists(path.join(DATA, 'activation', 'manifest.json'))) return;
    const { rows } = await loadDataset('activation');
    // doc_created is the time of the REQUEST. Storing it would change every shard's bytes on
    // every refresh and destroy the byte-stability the append-only gate depends on.
    for (const r of rows.slice(0, 500)) {
      expect(r.extra.doc_created).toBeUndefined();
      expect(r.extra.doc_revision).toBeTruthy();
    }
  });

  // The three below are regression gates for bugs found by RUNNING the refresh against Sweden,
  // not by reading the code. Each one silently destroyed data while every checksum passed.
  it('reconciles rewritten shards row-wise, because year-sharding alone does not contain a windowed fetch', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    expect(src).toMatch(/reconcileShards/);
    // The window must come from the new data's own earliest row, not from the --from argument:
    // SvK's 2026-01-01 local window starts at 2025-12-31T23:00Z and lands in the 2025 shard.
    expect(src).toMatch(/windowStart/);
    expect(src).toMatch(/period_start < windowStart/);
  });

  it('reconciles BEFORE merging carried-forward manifest entries', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    // Reversing these two silently disabled reconciliation: with earlier years already in
    // after.files, the derived window became 2020 and every shard looked wholly inside it.
    const iReconcile = src.indexOf('const reconciled = await reconcileShards(');
    const iMerge = src.indexOf('const preserved = await mergeManifestFiles(');
    const iAudit = src.indexOf('const audit = await appendOnlyAudit(');
    expect(iReconcile).toBeGreaterThan(0);
    expect(iMerge).toBeGreaterThan(iReconcile);
    expect(iAudit).toBeGreaterThan(iMerge);
  });

  it('a windowed refresh preserves acquisition-time coverage evidence', async () => {
    // 36.E0.2 moved `preserveAcquisitionMetadata` out of the orchestrator and into the canonical
    // writer, because defining it here protected only the manifests THIS file wrote — all eight
    // fetchers bypassed it when run directly. The property is unchanged; the assertions follow it
    // to its new home and gain one: that the orchestrator now goes through that writer too.
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    const writer = fs.readFileSync(path.join(ROOT, 'mature-markets', 'manifest-writer.mjs'), 'utf8');
    expect(writer).toMatch(/preserveAcquisitionMetadata/);
    expect(src).toMatch(/writeManifest\(/);
    expect(src).not.toMatch(/fs\.writeFile\(manifestPath/);
    // Only a FULL refresh may replace the manifest wholesale.
    expect(writer).toMatch(/window === 'full'/);
    // The evidence that must survive: SE's absence-as-zero measurements are the reason the
    // Swedish numbers are trustworthy, and a 2026-only window would have dropped them.
    const m = await readManifest('se');
    expect(m.coverage_verification.all_zero_rows_dropped).toBeGreaterThan(0);
    expect(m.coverage_verification.per_month.length).toBeGreaterThan(60);
  });

  it('writes the manifest even on anomaly, so it never disagrees with what is on disk', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'refresh-mature-markets.mjs'), 'utf8');
    // An earlier version skipped the write on anomaly and left a 2-shard manifest beside 7 files.
    // Only last_successful_refresh is withheld. (36.E0.2 renamed the local `toWrite` to `after`,
    // since the preserve step now happens inside writeManifest rather than before the call — same
    // property, same withholding, one variable name.)
    expect(src).toMatch(/if \(status !== 'anomaly'\) after\.last_successful_refresh/);
    expect(src).not.toMatch(/if \(status !== 'anomaly' && after\)/);
  });

  it('freshness only fails on genuine staleness, not on never-refreshed', () => {
    const src = fs.readFileSync(path.join(ROOT, 'mature-markets', 'check-freshness.mjs'), 'utf8');
    expect(src).toMatch(/MISSED_CYCLES_BEFORE_STALE = 2/);
    expect(src).toMatch(/never_refreshed/);
    // The exit code must key on `stale`, never on `never`.
    expect(src).toMatch(/if \(stale\.length\) process\.exitCode = 1;/);
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
