/**
 * Phase 39.2 — the DA capture's second source, and the A44 parse it rests on.
 *
 * energy-charts.info returned HTTP 503 to this machine at 2026-08-03T16:36Z
 * while `computeS1: ok` in the same worker invocation: the ENTSO-E day-ahead
 * curve was in hand and the capture was thrown away for want of a second copy
 * of it. This file proves the fallback that closes that, and — because the
 * fallback cannot be trusted further than its parse — proves the parse against
 * a REAL recorded ENTSO-E document, cross-checked slot-for-slot against
 * Elering's independent NPS series for the same window.
 *
 * Both fixtures were fetched live on 2026-08-03 and are committed verbatim.
 * The Elering file is the control: it is a different operator, a different API
 * and a different transport, so agreement between it and our reconstruction is
 * evidence about the WORLD, not about our own regex agreeing with itself
 * (playbook B5 — mirror tests are blind to shared error; B11 — a probe with no
 * independent control measures the probe).
 *
 * Every assertion here was proven by inject-then-revert against the real
 * mechanism before being trusted; the red/green counts are in the phase wrap.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseA44Periods,
  pricesForUtcDay,
  isoDurationToMinutes,
  resolveCaptureDay,
  computeDayCapture,
} from '../fetch-s1.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const here = dirname(fileURLToPath(import.meta.url));
const A44_LT = readFileSync(join(here, 'fixtures/entsoe-a44-lt-2026-08-03.xml'), 'utf8');
const ELERING_CEST_DAY: number[] = JSON.parse(
  readFileSync(join(here, 'fixtures/elering-lt-2026-08-03-cest-day.json'), 'utf8'),
).data.lt.map((e: Any) => e.price);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('isoDurationToMinutes', () => {
  it('reads the resolutions ENTSO-E actually publishes', () => {
    expect(isoDurationToMinutes('PT15M')).toBe(15);
    expect(isoDurationToMinutes('PT60M')).toBe(60);
    expect(isoDurationToMinutes('PT1H')).toBe(60);
  });
  it('refuses what it cannot interpret rather than guessing a default', () => {
    expect(isoDurationToMinutes('P1D')).toBeNull();
    expect(isoDurationToMinutes('')).toBeNull();
    expect(isoDurationToMinutes(undefined as Any)).toBeNull();
  });
});

describe('parseA44Periods — the real LT document for 2026-08-03', () => {
  const periods = parseA44Periods(A44_LT);

  it('finds both market-day Periods a UTC-bounded request returns', () => {
    // This is the fact the flat scrape loses. A request for the UTC day
    // 2026-08-03 returns TWO CEST market days, and `extractPrices` concatenates
    // them into one 190-entry array that every consumer treats as one day.
    expect(periods).toHaveLength(2);
    expect(new Date(periods[0].startMs).toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(new Date(periods[0].endMs).toISOString()).toBe('2026-08-03T22:00:00.000Z');
    expect(new Date(periods[1].startMs).toISOString()).toBe('2026-08-03T22:00:00.000Z');
    expect(new Date(periods[1].endMs).toISOString()).toBe('2026-08-04T22:00:00.000Z');
  });

  it('forward-fills the positions curveType A03 omits', () => {
    // The document declares 96 quarter-hours and carries 94 Points: positions 3
    // and 11 are absent because their price repeats the position before.
    expect(periods[0].declared).toBe(96);
    expect(periods[0].filled).toBe(2);
    expect(periods[0].prices).toHaveLength(96);
    expect(periods[1].filled).toBe(0);
  });

  it('agrees with Elering slot-for-slot — 96/96, independent operator', () => {
    // THE load-bearing assertion. Elering serves the same LT day-ahead curve
    // through a different API; if our reconstruction is right, these are the
    // same 96 numbers in the same order.
    expect(periods[0].prices).toEqual(ELERING_CEST_DAY);
  });

  it('shows what the flat scrape does instead: 92 of 94 values at the wrong time', () => {
    // Not a hypothetical. This is the behaviour of the function every ENTSO-E
    // consumer in the worker currently calls, measured against the control.
    const flat = A44_LT.match(/<price\.amount>[-\d.eE+]+<\/price\.amount>/g)!
      .map((m) => parseFloat(m.replace(/<[^>]+>/g, '')))
      .slice(0, 94);
    const wrong = flat.filter((v, i) => v !== ELERING_CEST_DAY[i]).length;
    expect(wrong).toBe(92);
    // …and the first divergence is at the position immediately after the gap.
    expect(flat[2]).not.toBe(ELERING_CEST_DAY[2]);
    expect(flat[1]).toBe(ELERING_CEST_DAY[1]);
  });

  it('drops a Period whose position 1 is missing rather than shifting the day', () => {
    const noFirst = A44_LT.replace(/<Point>\s*<position>1<\/position>[\s\S]*?<\/Point>/, '');
    expect(parseA44Periods(noFirst).length).toBeLessThan(2);
  });

  it('drops a Period whose window is not a whole multiple of its resolution', () => {
    const ragged = A44_LT.replace('<end>2026-08-03T22:00Z</end>', '<end>2026-08-03T22:07Z</end>');
    const p = parseA44Periods(ragged);
    expect(p.find((x) => new Date(x.startMs).toISOString() === '2026-08-02T22:00:00.000Z')).toBeUndefined();
  });
});

describe('pricesForUtcDay', () => {
  const periods = parseA44Periods(A44_LT);

  it('assembles the UTC calendar day from the two market days that straddle it', () => {
    const day = pricesForUtcDay(periods, '2026-08-03');
    expect(day).not.toBeNull();
    expect(day!.prices).toHaveLength(96);
    expect(day!.resolution).toBe(15);
    // 00:00Z–22:00Z is the tail of the first market day (its positions 9..96),
    // 22:00Z–24:00Z the head of the second. Addressed by clock, not by index.
    expect(day!.prices.slice(0, 88)).toEqual(periods[0].prices.slice(8));
    expect(day!.prices.slice(88)).toEqual(periods[1].prices.slice(0, 8));
    expect(new Date(day!.timestamps[0] * 1000).toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(new Date(day!.timestamps[95] * 1000).toISOString()).toBe('2026-08-03T23:45:00.000Z');
  });

  it('returns null — never a short day — when tomorrow has not been published', () => {
    // The normal state before ~11:00Z. A 22-hour "day" fed to a sort-and-
    // dispatch capture would produce a confident number off a truncated curve,
    // which is worse than no number (B10).
    const onlyFirst = periods.slice(0, 1);
    expect(pricesForUtcDay(onlyFirst, '2026-08-03')).toBeNull();
  });

  it('returns null for a day the document does not cover at all', () => {
    expect(pricesForUtcDay(periods, '2026-07-01')).toBeNull();
  });

  it('reports the NATIVE resolution when a coarse source is expanded', () => {
    const hourly = [{
      startMs: Date.parse('2026-06-01T00:00:00Z'),
      endMs: Date.parse('2026-06-02T00:00:00Z'),
      resolutionMin: 60,
      prices: Array.from({ length: 24 }, (_, h) => 10 + h),
      declared: 24,
      filled: 0,
    }];
    const day = pricesForUtcDay(hourly as Any, '2026-06-01');
    expect(day!.resolution).toBe(60);
    expect(day!.prices).toHaveLength(24);
  });

  it('leaves capture invariant to the grid expansion it performs', () => {
    // Sort-and-dispatch over 96 quarter-hours that repeat each hourly price four
    // times picks four times as many slots at the same prices. If that were not
    // true, a fallback on an hourly day would silently change the number.
    const hourlyPrices = [12, 5, 3, 40, 88, 7, 15, 60, 22, 31, 9, 4, 70, 55, 18, 26, 33, 91, 47, 13, 8, 29, 64, 20];
    const quarterly = hourlyPrices.flatMap((p) => [p, p, p, p]);
    expect(computeDayCapture(quarterly, 4, 15)!.gross_eur_mwh)
      .toBeCloseTo(computeDayCapture(hourlyPrices, 4, 60)!.gross_eur_mwh, 6);
  });
});

describe('resolveCaptureDay — source rank and the fallback', () => {
  const env = { ENTSOE_API_KEY: 'test-key' } as Any;

  it('uses energy-charts and records rank 1 when the primary answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      price: Array.from({ length: 96 }, (_, i) => i),
      unix_seconds: Array.from({ length: 96 }, (_, i) => Date.parse('2026-08-03T00:00:00Z') / 1000 + i * 900),
    }), { status: 200 })));
    const d = await resolveCaptureDay(env, '2026-08-03');
    expect(d.capture_source).toBe('energy-charts');
    expect(d.capture_source_rank).toBe(1);
    expect(d.capture_fallback_reason).toBeNull();
  });

  it('falls back to ENTSO-E on the live 503, and says so on the payload', async () => {
    // The exact failure observed: energy-charts serving an HTML 503 body.
    vi.stubGlobal('fetch', vi.fn(async (input: Any) => {
      const url = String(input);
      if (url.includes('energy-charts.info')) {
        return new Response('<html><body><h1>503 Service Unavailable</h1></body></html>', { status: 503 });
      }
      return new Response(A44_LT, { status: 200 });
    }));
    const d = await resolveCaptureDay(env, '2026-08-03');
    expect(d.capture_source).toBe('entsoe-a44');
    expect(d.capture_source_rank).toBe(2);
    expect(d.capture_fallback_reason).toContain('503');
    expect(d.prices).toHaveLength(96);
    // The fallback must produce the SAME day, not merely some day.
    expect(d.prices.slice(0, 88)).toEqual(ELERING_CEST_DAY.slice(8));
  });

  it('carries BOTH diagnoses when both sources are down', async () => {
    // An alert naming only the last thing tried sends the operator after the
    // wrong host.
    vi.stubGlobal('fetch', vi.fn(async (input: Any) => {
      const url = String(input);
      if (url.includes('energy-charts.info')) return new Response('down', { status: 503 });
      return new Response('nope', { status: 500 });
    }));
    await expect(resolveCaptureDay(env, '2026-08-03')).rejects.toThrow(/primary:.*503[\s\S]*fallback:/);
  });

  it('declines rather than computing a part-day when tomorrow is unpublished', async () => {
    const firstPeriodOnly = A44_LT.slice(0, A44_LT.indexOf('<TimeSeries>', A44_LT.indexOf('<TimeSeries>') + 1)) + '</Publication_MarketDocument>';
    vi.stubGlobal('fetch', vi.fn(async (input: Any) => {
      const url = String(input);
      if (url.includes('energy-charts.info')) return new Response('down', { status: 503 });
      return new Response(firstPeriodOnly, { status: 200 });
    }));
    await expect(resolveCaptureDay(env, '2026-08-03')).rejects.toThrow(/not fully covered/);
  });
});
