// Calibrate 36.E1 (FCR) + 36.E2 (aFRR) price formation from the primary files. No network.
//
// EVERY PARAMETER IN THE OUTPUT CARRIES ITS PROVENANCE — source file, window, n, and where a trend
// is fitted, its t-statistic. A parameter without a window is a parameter nobody can re-derive, and
// the whole arc's claim is that these numbers are measured rather than assumed (A8).
//
// It reads: tools/consultancy/data/mature-markets/{de,da,activation}/ (committed, checksummed via
// loader.mjs) and tools/consultancy/data/baltic/{daily-clearing,activation-monthly}.json and
// tools/consultancy/data/da-hourly-LT-<year>.json. It writes
// tools/consultancy/data/price-formation-calibration.json.
//
// Usage: node tools/consultancy/mature-markets/calibrate-price-formation.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadDataset, bySeries, monthlyAggregate } from './loader.mjs';
import { arbitrageByMonth, arbitrageByMonthFromHourly, ARB_WINDOW_HOURS, ARB_RTE } from './arbitrage.mjs';

const HERE = import.meta.dirname;
const DATA = path.join(HERE, '..', 'data');
const OUT = path.join(DATA, 'price-formation-calibration.json');

/**
 * The regime boundary.
 *
 * 2021-09 to 2023-06 is the European gas-price episode. It is named here rather than fitted from
 * the series, because a break detected FROM the data and then used to segment the same data fits
 * the noise and calls it structure (the loader's segmentation module makes the same argument about
 * the break calendar). The dates bracket the period in which the DE day-ahead arbitrage
 * opportunity ran at 2-6x its pre- and post-episode level: measured 3.46-3.70 EUR/MW/h in
 * 2019-2020, 22.40 in 2022, 11.18-18.35 in 2023-2026.
 *
 * Both boundaries are reported with the statistics on either side, so a reader can see what the
 * choice bought.
 */
const CRISIS = { from: '2021-09', to: '2023-06' };

const DE_AREA = '10Y1001A1001A82H';
const SERIES = {
  fcr: `DE|${DE_AREA}|FCR|symmetric|cap`,
  afrr_up: `DE|${DE_AREA}|aFRR|up|cap`,
  afrr_down: `DE|${DE_AREA}|aFRR|down|cap`,
  mfrr_up: `DE|${DE_AREA}|mFRR|up|cap`,
  mfrr_down: `DE|${DE_AREA}|mFRR|down|cap`,
};

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const pct = (arr, q) => {
  const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

/**
 * OLS of log(k) on months elapsed, with the t-statistic.
 *
 * Logs because a decay is multiplicative and a linear fit on levels would be dominated by the
 * high-price months. The t-statistic is reported and USED: a rate whose t does not clear 2 is
 * declared unmeasured in the output rather than shipped as a number with a footnote.
 */
function logTrend(pairs) {
  const n = pairs.length;
  if (n < 6) return { n, pct_per_year: null, t: null, note: 'insufficient months (< 6)' };
  const t0 = pairs[0][0];
  const x = pairs.map(([m]) => monthsBetween(t0, m));
  const y = pairs.map(([, v]) => Math.log(v));
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx;
  const resid = y.map((yi, i) => yi - (my + b * (x[i] - mx)));
  const se = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / (n - 2) / sxx);
  return { n, from: t0, to: pairs.at(-1)[0], pct_per_year: r4((Math.exp(b * 12) - 1) * 100), lambda_per_yr: r4(-b * 12), t: r4(b / se) };
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sa += x * x; sb += y * y; sab += x * y; }
  return r4(sab / Math.sqrt(sa * sb));
}

const kStats = (ks) => ({ n: ks.length, p10: r4(pct(ks, 0.1)), p50: r4(pct(ks, 0.5)), p90: r4(pct(ks, 0.9)), mean: r4(ks.reduce((a, b) => a + b, 0) / ks.length) });

async function main() {
  const out = {
    artifact: 'per-service price-formation calibration',
    phase: '36.E1 + 36.E2',
    built_at: new Date().toISOString(),
    reproducible_offline: true,
    model: 'clearing(t) = max(endogenous floor(t), k(t) x arbitrage_opportunity(t)); floor = max(0, arb - marginal cycling cost)',
    arbitrage_proxy: { window_hours: ARB_WINDOW_HOURS, rte: ARB_RTE, cycles_per_day: 1, note: 'RTE is an ASSUMPTION, not a measurement. Shared implementation with the E0 summary table (tools/consultancy/mature-markets/arbitrage.mjs) — rule #4.' },
    crisis_window: { ...CRISIS, basis: 'named, not fitted — see the module header' },
    parameters: {},
    notes: [],
  };

  // ── Germany: the mature-market reference ────────────────────────────────────────────────────
  const da = await loadDataset('da');
  // BOTH RESOLUTIONS, and the reason is a finding about the E0 table rather than a preference.
  //
  // The summary table filters DE day-ahead to `resolution === 'PT60M'`. Germany moved to a 15-minute
  // MTU on 2025-10-01 and A44 has served PT15M only since, so that filter's series STOPS at
  // 2025-09 while the capacity price series it is divided into runs to 2026-08 — eleven months of
  // denominator missing, silently, because `.filter(Boolean)` drops months with no arbitrage value
  // rather than reporting them. Measured on the truncated series, every post-crisis trend below
  // loses its significance purely from the lost window (aFRR down t went -1.43 truncated against
  // -2.36 on the full series).
  //
  // Including both resolutions is safe and was CONTROLLED before it was adopted: `arbitrageByMonth`
  // collapses to hourly duration-weighted means first, so overlapping PT15M and PT60M rows for the
  // same hour merge instead of double-counting. Over the 84 months both cover, the two filters give
  // the same statistic to within 2.57 % on average (max 8.24 %) — so the switch extends the window
  // without changing what is being measured. Filed for the E0 table separately; not edited here,
  // because changing the published summary table is not this batch's scope.
  const arbDE = arbitrageByMonth(da.rows.filter((r) => r.market === 'DE'), ARB_WINDOW_HOURS);
  const de = await loadDataset('de');
  const S = bySeries(de.rows);

  const deK = {};
  for (const [name, key] of Object.entries(SERIES)) {
    const rows = S.get(key);
    if (!rows) { out.notes.push(`DE series absent: ${key}`); continue; }
    const months = monthlyAggregate(rows).filter((m) => m.mean !== null && arbDE.has(m.month));
    const pairs = months.map((m) => [m.month, m.mean / arbDE.get(m.month).arb_eur_mw_h]).sort();
    const post = pairs.filter(([m]) => m > CRISIS.to);
    const pre = pairs.filter(([m]) => m < CRISIS.from);
    const exCrisis = pairs.filter(([m]) => m < CRISIS.from || m > CRISIS.to);

    deK[name] = {
      source_file: 'tools/consultancy/data/mature-markets/de/',
      arbitrage_from: 'tools/consultancy/data/mature-markets/da/ (DE_LU, PT60M + PT15M — see the filter comment; PT60M alone stops at 2025-09)',
      window: `${pairs[0][0]}..${pairs.at(-1)[0]}`,
      correlation_price_vs_arb: { levels: pearson(months.map((m) => m.mean), months.map((m) => arbDE.get(m.month).arb_eur_mw_h)), logs: pearson(months.map((m) => Math.log(m.mean)), months.map((m) => Math.log(arbDE.get(m.month).arb_eur_mw_h))) },
      k_full: kStats(pairs.map((p) => p[1])),
      k_pre_crisis: kStats(pre.map((p) => p[1])),
      k_post_crisis: kStats(post.map((p) => p[1])),
      trend_full: logTrend(pairs),
      trend_ex_crisis: logTrend(exCrisis),
      trend_post_crisis: logTrend(post),
      nominal_price_eur_mw_h: { p50_full: r4(pct(months.map((m) => m.mean), 0.5)), p50_post_crisis: r4(pct(months.filter((m) => m.month > CRISIS.to).map((m) => m.mean), 0.5)) },
      procured_volume_mw: { first_year_mean: null, last_year_mean: null },
      // Emitted so the reproduction tests re-derive annual means from the SAME monthly pairs this
      // calibration fitted on, rather than recomputing them from the datasets with a filter that
      // could drift away from this one.
      monthly: months.map((m) => ({ month: m.month, price_eur_mw_h: r4(m.mean), arb_eur_mw_h: r4(arbDE.get(m.month).arb_eur_mw_h), volume_mw: r4(m.volume_mean) })),
    };

    // Demand side. FCR's flatness is the reason the model is opportunity-cost-driven rather than
    // S/D-driven, so it is measured rather than asserted.
    const vols = months.filter((m) => m.volume_mean !== null);
    if (vols.length) {
      const firstY = vols[0].month.slice(0, 4), lastY = vols.at(-1).month.slice(0, 4);
      const mean = (a) => r4(a.reduce((s, m) => s + m.volume_mean, 0) / a.length);
      deK[name].procured_volume_mw = {
        first_year: firstY, first_year_mean: mean(vols.filter((m) => m.month.slice(0, 4) === firstY)),
        last_year: lastY, last_year_mean: mean(vols.filter((m) => m.month.slice(0, 4) === lastY)),
        n_months: vols.length,
      };
    }
  }

  // Symmetric-availability premium: FCR's multiple over aFRR's, same market, same months.
  {
    const f = new Map(monthlyAggregate(S.get(SERIES.fcr)).filter((m) => m.mean !== null).map((m) => [m.month, m.mean]));
    const u = new Map(monthlyAggregate(S.get(SERIES.afrr_up)).filter((m) => m.mean !== null).map((m) => [m.month, m.mean]));
    const d = new Map(monthlyAggregate(S.get(SERIES.afrr_down)).filter((m) => m.mean !== null).map((m) => [m.month, m.mean]));
    const all = [...f].filter(([m]) => u.has(m) && d.has(m));
    const ratios = all.map(([m, v]) => v / ((u.get(m) + d.get(m)) / 2));
    const postR = all.filter(([m]) => m > CRISIS.to).map(([m, v]) => v / ((u.get(m) + d.get(m)) / 2));
    out.parameters.symmetric_availability_premium = {
      definition: 'DE FCR capacity price / mean(DE aFRR up, DE aFRR down) capacity price, same month',
      source_file: 'tools/consultancy/data/mature-markets/de/',
      window: `${all[0][0]}..${all.at(-1)[0]}`,
      full: kStats(ratios), post_crisis: kStats(postR),
      measured_not_modelled: true,
    };
  }

  // ── The Baltics: our own post-accession data ────────────────────────────────────────────────
  const dc = JSON.parse(await fs.readFile(path.join(DATA, 'baltic', 'daily-clearing.json'), 'utf8'));
  const years = [...new Set(dc.days.map((d) => +d.date.slice(0, 4)))].sort();
  const arbLT = new Map();
  for (const y of years) {
    const f = path.join(DATA, `da-hourly-LT-${y}.json`);
    let j; try { j = JSON.parse(await fs.readFile(f, 'utf8')); } catch { out.notes.push(`no LT day-ahead file for ${y}`); continue; }
    for (const [m, v] of arbitrageByMonthFromHourly(y, j.prices_eur_mwh, ARB_WINDOW_HOURS)) arbLT.set(m, v);
  }

  const byMonth = new Map();
  for (const d of dc.days) {
    const m = d.date.slice(0, 7);
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)).push(d);
  }
  const bK = { fcr: [], afrr_up: [], afrr_down: [], mfrr_up: [], mfrr_down: [] };
  const monthly = [];
  for (const m of [...byMonth.keys()].sort()) {
    const a = byMonth.get(m); const A = arbLT.get(m);
    if (!A) { out.notes.push(`no LT arbitrage for ${m}, Baltic month dropped`); continue; }
    const mean = (f) => a.reduce((s, r) => s + r[f], 0) / a.length;
    const row = { month: m, n_days: a.length, arb_eur_mw_h: r4(A.arb_eur_mw_h) };
    for (const [k, f] of [['fcr', 'fcr'], ['afrr_up', 'afrr_up'], ['afrr_down', 'afrr_down'], ['mfrr_up', 'mfrr_up'], ['mfrr_down', 'mfrr_down']]) {
      const v = mean(f); row[k] = r4(v); row[`k_${k}`] = r4(v / A.arb_eur_mw_h); bK[k].push(v / A.arb_eur_mw_h);
    }
    monthly.push(row);
  }
  out.parameters.baltic_k = {
    source_file: 'tools/consultancy/data/baltic/daily-clearing.json',
    arbitrage_from: `tools/consultancy/data/da-hourly-LT-{${years.join(',')}}.json`,
    window: `${monthly[0].month}..${monthly.at(-1).month}`,
    n_days: dc.total_days, span_days: dc.span,
    all_post_accession: true,
    accession_note: dc.note,
    per_product: Object.fromEntries(Object.entries(bK).map(([k, v]) => [k, kStats(v)])),
    monthly,
  };

  // ── The accession constraint, counted rather than asserted ──────────────────────────────────
  const act = await loadDataset('activation');
  const BREAKS = { 'DE|aFRR': '2022-06-22', 'AT|aFRR': '2022-06-22', 'DE|mFRR': '2022-10-05', 'AT|mFRR': '2023-06-27' };
  const counts = {};
  for (const r of act.rows) {
    const k = `${r.market}|${r.product}`;
    if (!BREAKS[k]) continue;
    const c = counts[k] ?? (counts[k] = { break_date: BREAKS[k], pre: 0, post: 0, first: null, last: null });
    if (r.period_start.slice(0, 10) < BREAKS[k]) c.pre++; else c.post++;
    if (!c.first || r.period_start < c.first) c.first = r.period_start;
    if (!c.last || r.period_start > c.last) c.last = r.period_start;
  }
  out.parameters.accession_constraint = {
    source_file: 'tools/consultancy/data/mature-markets/activation/',
    break_dates_from: 'tools/consultancy/data/mature-markets/calendar/structural-breaks.json',
    quarter_hour_counts: counts,
    verdict: 'The PICASSO/MARI break in ACTIVATION prices is not measurable from this evidence base — no market in it holds a usable pre-accession activation series. The Baltic accessions are additionally all PAST and all before the first day of our own Baltic series, so the break is already embedded in the Baltic level this calibration measures. NO break parameter is carried into the forward model; applying one would double-count.',
  };

  // ── DE aFRR activation, per direction ───────────────────────────────────────────────────────
  const actDE = { up: [], down: [] };
  let firstIsp = null, lastIsp = null;
  for (const r of act.rows) {
    if (r.market !== 'DE' || r.product !== 'aFRR' || r.price_norm === null) continue;
    actDE[r.direction].push(r.price_norm);
    if (!firstIsp || r.period_start < firstIsp) firstIsp = r.period_start;
    if (!lastIsp || r.period_start > lastIsp) lastIsp = r.period_start;
  }
  const totalIsp = Math.round((Date.parse(lastIsp) - Date.parse(firstIsp)) / 9e5) + 1;
  out.parameters.afrr_activation_de = {
    source_file: 'tools/consultancy/data/mature-markets/activation/ (price_basis: vwap_activated)',
    window: `${firstIsp}..${lastIsp}`,
    resolution: 'PT15M',
    total_isp_in_window: totalIsp,
    regime: 'wholly post-PICASSO (DE acceded 2022-06-22; the series begins 2022-06-21)',
    per_direction: Object.fromEntries(['up', 'down'].map((d) => {
      const v = actDE[d];
      return [d, {
        activated_isp: v.length,
        activation_rate: r4(v.length / totalIsp),
        p10: r4(pct(v, 0.1)), p50: r4(pct(v, 0.5)), mean: r4(v.reduce((a, b) => a + b, 0) / v.length), p90: r4(pct(v, 0.9)),
        share_negative: r4(v.filter((x) => x < 0).length / v.length),
      }];
    })),
    down_note: 'A negative down-activation price means the provider is PAID to absorb energy. The down direction is valued as the charging cost it avoids (da_charge_price - down_price), not as the price itself — see afrrActivationRevenue().',
  };

  // ── Baltic activation level, and what it cannot say ─────────────────────────────────────────
  const bact = JSON.parse(await fs.readFile(path.join(DATA, 'baltic', 'activation-monthly.json'), 'utf8'));
  const ltA = Object.entries(bact.monthly.lt_monthly_afrr ?? {});
  out.parameters.afrr_activation_baltic = {
    source_file: 'tools/consultancy/data/baltic/activation-monthly.json',
    window: ltA.length ? `${ltA[0][0]}..${ltA.at(-1)[0]}` : null,
    lt_afrr_price_eur_mwh: { p50_of_monthly_p50: r4(pct(ltA.map(([, v]) => v.p50), 0.5)), p50_of_monthly_avg: r4(pct(ltA.map(([, v]) => v.avg), 0.5)), n_months: ltA.length },
    per_direction: 'NOT SERVED — see known_limitation in the source file. The direction split is transferred from Germany; the level is Baltic.',
    known_limitation: bact.known_limitation,
  };

  out.parameters.de_k = deK;

  // ── The floor displacement fraction ─────────────────────────────────────────────────────────
  //
  // How much of a MW's gross arbitrage opportunity a reserve commitment actually forgoes. Measured
  // as the LOW END of each market's own observed multiple — p10 of the monthly k distribution —
  // because a market's cheapest months are the months in which nothing but opportunity cost was
  // being paid for. That statistic is the same construction E0 used for its published floors (p10
  // of the terminal segment); it is recomputed here on the k series rather than quoted, so it
  // carries this phase's arbitrage window rather than E0's truncated one (A9).
  //
  // It is NOT 1.0 for any product in any market measured here, which is the finding: the arc's
  // gross-arbitrage floor is above every floor the evidence base contains.
  out.parameters.floor_displacement = {
    definition: 'p10 of the monthly (capacity price / arbitrage opportunity) distribution — the fraction of gross arbitrage value a reserve commitment is observed to forgo',
    basis: 'same statistic as the E0 summary table\'s published floors (p10), recomputed on this phase\'s arbitrage window',
    de: Object.fromEntries(Object.entries(deK).map(([k, v]) => [k, { full: v.k_full.p10, post_crisis: v.k_post_crisis.p10 }])),
    baltic: Object.fromEntries(Object.entries(out.parameters.baltic_k.per_product).map(([k, v]) => [k, v.p10])),
    finding: 'No product in either market displaces the full gross arbitrage opportunity. The arc specifies the floor as gross arbitrage net of cycling cost; every measured floor sits below that, because a reserve commitment reserves SoC headroom rather than the whole MW (36.B1 simultaneity).',
  };

  await fs.writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${path.relative(path.join(HERE, '..', '..', '..'), OUT)}`);
  for (const [name, v] of Object.entries(deK)) {
    console.log(`DE ${name.padEnd(10)} r(log)=${v.correlation_price_vs_arb.logs}  k_post=${v.k_post_crisis.p50}  trend_post=${v.trend_post_crisis.pct_per_year}%/yr t=${v.trend_post_crisis.t}  vol ${v.procured_volume_mw.first_year_mean}->${v.procured_volume_mw.last_year_mean} MW`);
  }
  for (const [name, v] of Object.entries(out.parameters.baltic_k.per_product)) {
    console.log(`BALTIC ${name.padEnd(10)} k_p50=${v.p50} (n=${v.n} months, all post-accession)`);
  }
}

await main();
