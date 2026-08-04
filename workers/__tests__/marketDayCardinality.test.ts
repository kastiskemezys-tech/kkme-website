/**
 * Phase 49 item 1 — the CLASS guard: a price series that does not count is refused.
 *
 * The defect was a parser that silently produced the wrong number of values and
 * forward-filled nothing, so 92 of 94 values landed at the wrong time and the
 * result was averaged rather than rejected. The guard generalises it: **every
 * price series knows how many values it should have.** A market day is 23, 24 or
 * 25 hours — never anything else — and its slot count is that span divided by
 * its own declared resolution. 190 is not a market day.
 *
 * Every assertion runs against REAL recorded ENTSO-E documents, with Elering's
 * independent NPS series as the control where one exists. Two of our own
 * components agreeing proves nothing (B5); an external operator, a different API
 * and a different transport agreeing is evidence about the world.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseA44Periods, marketDayAt, slotHourUtc, extractPrices, s1DayParseMode } from '../fetch-s1.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(here, 'fixtures', n), 'utf8');
const A44_LT = fx('entsoe-a44-lt-2026-08-03.xml');
const ELERING: number[] = JSON.parse(fx('elering-lt-2026-08-03-cest-day.json')).data.lt.map((e: Any) => e.price);

const at = (iso: string) => Date.parse(iso);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe('§1 · the flag is OFF, and that is asserted rather than assumed', () => {
  it('defaults to the shipped flat scrape when nothing sets it', () => {
    expect(s1DayParseMode({})).toBe('flat');
    expect(s1DayParseMode(undefined)).toBe('flat');
    expect(s1DayParseMode({ S1_DAY_PARSE: 'nonsense' })).toBe('flat');
  });

  it('accepts market_day only when it is asked for by name', () => {
    expect(s1DayParseMode({ S1_DAY_PARSE: 'market_day' })).toBe('market_day');
  });
});

describe('§2 · cardinality — a series that does not count is refused at admission', () => {
  const periods = parseA44Periods(A44_LT);

  it('admits the market day covering the instant, with the count the calendar requires', () => {
    const d = marketDayAt(periods, at('2026-08-03T12:00:00Z')) as Any;
    expect(d.ok).toBe(true);
    expect(d.hours).toBe(24);
    expect(d.resolutionMin).toBe(15);
    expect(d.slots).toBe(96);
    expect(d.prices).toHaveLength(96);
    expect(d.forward_filled).toBe(2);       // positions 3 and 11, per curveType A03
    expect(new Date(d.startMs).toISOString()).toBe('2026-08-02T22:00:00.000Z');
  });

  it('REFUSES a day whose values do not match its declared span and resolution', () => {
    // The prompt's case, made concrete: a day that arrives with 2 real values
    // and 94 missing must fail, not average. Constructed by truncating the real
    // document's Period so the declared window and the delivered points disagree.
    const broken = periods.map((p: Any, i: number) =>
      (i === 0 ? { ...p, prices: p.prices.slice(0, 2) } : p));
    const d = marketDayAt(broken, at('2026-08-03T12:00:00Z')) as Any;
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('cardinality_mismatch');
    expect(d.detail).toMatch(/2 values for a 24h day at PT15M, which needs 96/);
  });

  it('REFUSES a span that is not a legal market day', () => {
    const bogus = [{ ...periods[0], endMs: periods[0].startMs + 20 * 3600000, prices: new Array(80).fill(1) }];
    const d = marketDayAt(bogus as Any, at('2026-08-03T12:00:00Z')) as Any;
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('illegal_market_day_span');
    expect(d.detail).toMatch(/20h/);
  });

  it('admits the 23-hour and 25-hour days DST actually produces', () => {
    // The calendar has three legal day lengths and a guard that only knows 24
    // is wrong twice a year. Both documents are the real transition days.
    const autumn = marketDayAt(
      parseA44Periods(fx('entsoe-a44-lt-2025-10-26-dst-autumn.xml')), at('2025-10-26T12:00:00Z')) as Any;
    expect(autumn.ok).toBe(true);
    expect(autumn.hours).toBe(25);
    expect(autumn.prices).toHaveLength(100);

    const spring = marketDayAt(
      parseA44Periods(fx('entsoe-a44-lt-2026-03-29-dst-spring.xml')), at('2026-03-29T12:00:00Z')) as Any;
    expect(spring.ok).toBe(true);
    expect(spring.hours).toBe(23);
    expect(spring.prices).toHaveLength(92);
  });

  it('admits an hourly (PT60M) day at 24 slots, not 96', () => {
    const d = marketDayAt(
      parseA44Periods(fx('entsoe-a44-lt-2025-09-29-pt60m.xml')), at('2025-09-29T12:00:00Z')) as Any;
    expect(d.ok).toBe(true);
    expect(d.resolutionMin).toBe(60);
    expect(d.slots).toBe(24);
    expect(d.prices).toHaveLength(24);
  });
});

describe('§3 · the timezone boundary — a UTC-bounded request must not admit two market days', () => {
  const periods = parseA44Periods(A44_LT);

  it('the document really does carry two market days (this is the concatenation case)', () => {
    expect(periods).toHaveLength(2);
    expect(new Date(periods[0].startMs).toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(new Date(periods[1].startMs).toISOString()).toBe('2026-08-03T22:00:00.000Z');
  });

  it('the flat scrape concatenates them into 190 values that no calendar day has', () => {
    // The defect, asserted directly. 190 = 94 delivered points of day one (two
    // omitted under A03) + 96 of day two, treated downstream as one day.
    const flat = extractPrices(A44_LT);
    expect(flat).toHaveLength(190);
    expect(mean(flat)).toBeCloseTo(75.4309, 3);
  });

  it('admission picks exactly ONE day, by wall clock, and never concatenates', () => {
    const first = marketDayAt(periods, at('2026-08-03T12:00:00Z')) as Any;
    const second = marketDayAt(periods, at('2026-08-04T12:00:00Z')) as Any;
    expect(first.ok && second.ok).toBe(true);
    expect(first.prices).toHaveLength(96);
    expect(second.prices).toHaveLength(96);
    expect(first.startMs).not.toBe(second.startMs);
    // Neither is 190, and no admitted series is ever the sum of two days.
    expect(first.prices.length + second.prices.length).toBe(192);
  });

  it('refuses rather than guesses when no published day covers the instant', () => {
    const d = marketDayAt(periods, at('2026-08-09T12:00:00Z')) as Any;
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('no_period_covers_instant');
  });
});

describe('§4 · Elering as the standing independent control', () => {
  // An independent external control is the only reliable oracle. Elering is a
  // different operator, a different API and a different transport, so agreement
  // is evidence about the world rather than about our own regex agreeing with
  // itself. Kept as a standing check, not the one-off that caught this.
  const day = marketDayAt(parseA44Periods(A44_LT), at('2026-08-03T12:00:00Z')) as Any;

  it('reconstructs the market day 96/96 against Elering, slot for slot', () => {
    expect(ELERING).toHaveLength(96);
    const agree = day.prices.filter((v: number, i: number) => Math.abs(v - ELERING[i]) < 1e-9).length;
    expect(agree).toBe(96);
    expect(mean(day.prices)).toBeCloseTo(mean(ELERING), 6);
    expect(mean(day.prices)).toBeCloseTo(69.1542, 3);
  });

  it('the shipped flat scrape agrees with the same control on 2 of 96', () => {
    // The measurement that makes the fix worth its risk, kept in the repo so it
    // is not a claim in a handover somebody has to take on trust.
    const flat = extractPrices(A44_LT);
    const agree = ELERING.filter((v, i) => Math.abs(flat[i] - v) < 1e-9).length;
    expect(agree).toBe(2);
  });
});

describe('§5 · hour labels are computed from the evidence (rule #2)', () => {
  const day = marketDayAt(parseA44Periods(A44_LT), at('2026-08-03T12:00:00Z')) as Any;

  it('slot 0 of a CEST market day is 22:00Z, not 00:00Z', () => {
    expect(slotHourUtc(day, 0)).toBe(22);
    expect(slotHourUtc(day, 8)).toBe(0);     // 8 quarter-hours later = midnight UTC
    expect(slotHourUtc(day, 95)).toBe(21);
  });

  it('the peak carries its true UTC hour, where the index formula was 8 hours out', () => {
    let peak = 0;
    for (let i = 1; i < day.prices.length; i++) if (day.prices[i] > day.prices[peak]) peak = i;
    const trueHour = slotHourUtc(day, peak);
    expect(new Date(day.startMs + peak * 15 * 60000).toISOString()).toBe('2026-08-03T17:45:00.000Z');
    expect(trueHour).toBe(17);

    // What the shipped expression produces on the same document: it indexes a
    // 190-entry two-day array and calls the 17:45Z peak "UTC hour 9".
    const flat = extractPrices(A44_LT);
    let flatPeak = 0;
    for (let i = 1; i < flat.length; i++) if (flat[i] > flat[flatPeak]) flatPeak = i;
    expect(Math.floor((flatPeak * 24) / flat.length)).toBe(9);
  });
});
