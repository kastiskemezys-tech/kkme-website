/**
 * S1 — Baltic Price Separation
 * Fetches LT and SE4 day-ahead prices from ENTSO-E and computes the signal.
 * Used by /api/signals/s1 route handler.
 */

import { getEntsoeApiKey } from '@/lib/env';

export type SignalState = 'CALM' | 'WATCH' | 'ACT';

export interface S1Signal {
  signal: 'S1';
  name: string;
  lt_avg_eur_mwh: number;
  se4_avg_eur_mwh: number;
  spread_eur_mwh: number;
  separation_pct: number;
  state: SignalState;
  updated_at: string;
  lt_hours: number;
  se4_hours: number;
}

export interface FetchS1Options {
  signal?: AbortSignal;
}

const ENTSOE_API = 'https://web-api.tp.entsoe.eu/api';
const LT_BZN = '10YLT-1001A0008Q';
const SE4_BZN = '10Y1001A1001A47J';

function utcPeriod(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}0000`;
}

function extractPrices(xml: string): number[] {
  const prices: number[] = [];
  const re = /<price\.amount>([\d.]+)<\/price\.amount>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) prices.push(parseFloat(m[1]));
  return prices;
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function signalState(pct: number): SignalState {
  if (pct > 20) return 'ACT';
  if (pct >= 5) return 'WATCH';
  return 'CALM';
}

async function fetchBzn(
  bzn: string,
  apiKey: string,
  opts?: FetchS1Options,
): Promise<number[]> {
  const url = new URL(ENTSOE_API);
  url.searchParams.set('documentType', 'A44');
  url.searchParams.set('in_Domain', bzn);
  url.searchParams.set('out_Domain', bzn);
  url.searchParams.set('periodStart', utcPeriod(0));
  url.searchParams.set('periodEnd', utcPeriod(1));
  url.searchParams.set('securityToken', apiKey);

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    signal: opts?.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[S1] ENTSO-E ${bzn} HTTP ${res.status}:`, body.slice(0, 200));
    throw new Error(`ENTSO-E ${bzn}: HTTP ${res.status}`);
  }

  return extractPrices(await res.text());
}

export async function fetchS1(opts?: FetchS1Options): Promise<S1Signal> {
  const apiKey = getEntsoeApiKey();

  const [ltPrices, se4Prices] = await Promise.all([
    fetchBzn(LT_BZN, apiKey, opts),
    fetchBzn(SE4_BZN, apiKey, opts),
  ]);

  if (!ltPrices.length || !se4Prices.length) {
    throw new Error(`No price data: LT=${ltPrices.length}h SE4=${se4Prices.length}h`);
  }

  const ltAvg = avg(ltPrices);
  const se4Avg = avg(se4Prices);
  const spread = ltAvg - se4Avg;
  const separationPct = se4Avg !== 0 ? (spread / se4Avg) * 100 : 0;

  return {
    signal: 'S1',
    name: 'Baltic Price Separation',
    lt_avg_eur_mwh: Math.round(ltAvg * 100) / 100,
    se4_avg_eur_mwh: Math.round(se4Avg * 100) / 100,
    spread_eur_mwh: Math.round(spread * 100) / 100,
    separation_pct: Math.round(separationPct * 10) / 10,
    state: signalState(separationPct),
    updated_at: new Date().toISOString(),
    lt_hours: ltPrices.length,
    se4_hours: se4Prices.length,
  };
}
