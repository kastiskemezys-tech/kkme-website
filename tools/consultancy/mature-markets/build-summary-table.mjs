// The cross-market summary table — 36.E0's checkpoint artifact.
//
// Per market x per service, computed FROM the committed data and never from literature:
// first battery entry, years to saturation, peak-to-floor ratio, floor level in EUR and as a
// ratio to the contemporaneous arbitrage opportunity, demand growth over the same window, and
// the structural breaks that fall inside every window used.
//
// This script must run with NO NETWORK ACCESS. If it ever needs the internet to reproduce a
// figure, the figure is not reproducible.
//
// ── The criteria, stated once and applied uniformly ────────────────────────────────────────
//
// Every one of these is a judgement call. They are written down here, applied identically to
// every market, and reported alongside the numbers, because a peak-to-floor ratio without its
// floor definition is not a measurement — it is a number with a story attached.
//
//  MONTHLY AGGREGATE. Duration-weighted mean of `price_norm` within the calendar month.
//    Duration weighting matters: German capacity blocks are 4 h, GB reserve windows 30 min,
//    Australian spot 5 min. An unweighted mean would silently weight by publication frequency.
//    Months whose priced coverage is below MIN_COVERAGE are excluded and counted, so a month
//    that is mostly absent cannot read as a month that is cheap.
//
//  SEGMENTS. The series is cut at the structural-break calendar's high / unit_affecting /
//    area_affecting events. Breaks come only from the calendar, which is primary-sourced or
//    measured-from-data. Detecting breaks from the price series and then fitting decay between
//    them would fit noise and call it structure.
//
//  FLOOR. The 10th percentile of monthly means within the TERMINAL segment — the span under the
//    current market design. A floor is a property of a market design, so a floor measured across
//    a redesign is not a floor. p10 rather than the minimum: the minimum is one month of noise.
//    Requires at least MIN_FLOOR_MONTHS months in the terminal segment, else `insufficient_months`.
//
//  PEAK. The maximum monthly mean over the whole served span, with the segment it falls in
//    recorded. If the peak and the floor are in different segments, PEAK_TO_FLOOR SPANS A RULE
//    CHANGE and the row says so; the ratio is still reported, because suppressing it would hide
//    the shape, but it is never presented as clean.
//
//  SATURATION. The first month from which every later month in the terminal segment stays at or
//    below floor x (1 + SATURATION_TOL). If no such month exists, the cell is `not_reached` and
//    is NOT extrapolated.
//
//  YEARS TO SATURATION. Months from the anchor to the saturation month, over 12. The anchor is
//    the market's first battery entry where that is computable from data, otherwise the start of
//    the served span — and the row always says which, because "5 years to saturate" measured from
//    a data boundary rather than from market entry is a different claim.
//
//  ARBITRAGE OPPORTUNITY. Per month: the mean across days of (mean of the 4 highest-priced hours
//    − mean of the 4 lowest), from that market's day-ahead or spot series, in EUR/MWh. Converted
//    to an availability-equivalent EUR/MW/h so it can be compared with a capacity price:
//        arb_eur_per_mw_h = spread_4h x 4 h x RTE / 24 h
//    RTE is an ASSUMPTION (see RTE below), not a measurement, and is stated in the output. The
//    4 h window matches a 4 h-duration battery, one cycle per day. This is a proxy for the
//    opportunity cost of committing a MW to reserve instead of arbitrage — deliberately simple,
//    and labelled as a proxy everywhere it appears.
//
//  DEMAND GROWTH. CAGR of the annual mean procured volume over the same window, where the
//    source publishes a volume. Where it does not, `not_computable`.
//
// Usage:
//   node tools/consultancy/mature-markets/build-summary-table.mjs
//   node tools/consultancy/mature-markets/build-summary-table.mjs --out docs/…/table.md

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadDataset, loadCalendar, bySeries, monthlyAggregate, segmentMonths } from './loader.mjs';
import { arbitrageByMonth, ARB_RTE_E0_PUBLISHED } from './arbitrage.mjs';

const OUT_DIR = path.join(import.meta.dirname, '..', 'data', 'mature-markets');
const DOC_DIR = path.join(import.meta.dirname, '..', '..', '..', 'docs', 'research');

const CRITERIA = {
  MIN_COVERAGE: 0.5,        // fraction of a month's rows that must carry a price
  MIN_FLOOR_MONTHS: 12,     // months required in the terminal segment to estimate a floor
  FLOOR_PERCENTILE: 0.10,
  SATURATION_TOL: 1.00,     // headline band: the forward median stays within a factor of 2 of the floor
  SATURATION_TOL_SENSITIVITY: [0.5, 1.0, 2.0],  // reported alongside, so the constant is not load-bearing in silence
  SATURATION_MIN_TAIL: 6,   // months that must remain after the candidate month for a verdict
  ARB_WINDOW_HOURS: 4,      // battery duration assumed for the arbitrage proxy
  // 36.E1: no longer a local literal. This is the value the table was PUBLISHED with; the
  // engine's canonical RTE is RTE_BOL.h4 and differs. See arbitrage.mjs for the divergence and
  // for why the published table is pinned rather than restated (B-055 precedent).
  RTE: ARB_RTE_E0_PUBLISHED,
  MIN_MONTHS_FOR_CAGR: 24,
};

// Which area is "the domestic market" for each dataset, and which series are headline.
// Made explicit because the German capacity export carries Austrian and Czech control blocks
// and the FCR export carries eight other countries: an area-unfiltered "DE price" is not one.
const DOMESTIC_AREA = {
  DE: '10Y1001A1001A82H',
  SE: 'SE',
  GB: 'GB',
  AU: 'SA1',
};

const pct = (arr, q) => {
  const s = arr.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const r4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

// Arbitrage opportunity moved to ./arbitrage.mjs in 36.E1 — same code, one implementation,
// now shared with the price-formation calibration (rule #4). See that module's header.

// ── Per-series statistics ──────────────────────────────────────────────────

function analyseSeries(key, rows, breaks, arbByMonth, batteryEntry) {
  const [market, area, product, direction, mechanism] = key.split('|');
  const allMonths = monthlyAggregate(rows);
  const usable = allMonths.filter((m) => m.coverage >= CRITERIA.MIN_COVERAGE && m.mean !== null);
  const excluded = allMonths.length - usable.length;

  const base = {
    market, area, product, direction: direction === '-' ? null : direction, mechanism,
    span: usable.length ? `${usable[0].month}..${usable.at(-1).month}` : null,
    n_months_served: allMonths.length,
    n_months_usable: usable.length,
    n_months_excluded_low_coverage: excluded,
  };
  if (usable.length < 3) return { ...base, verdict: 'insufficient_data' };

  // An offer-curve mean is not a price level and must not be given lifecycle statistics.
  // German RAM energy exports summarise the OFFERED merit-order list, which runs up to the
  // 15 000 EUR/MWh technical price limit, so its mean is dominated by tail bids that were
  // never activated. Left in, this series produced a "peak" of 28 210 EUR/MWh and a "floor"
  // of 3 372 — numbers that describe a bid ceiling, not a market.
  const offerCurveOnly = rows.every((r) => r.price_basis === 'offer_curve_mean' || r.price_basis === null);
  if (offerCurveOnly) {
    return {
      ...base,
      verdict: 'not_applicable_offer_curve',
      reason: 'This series is a statistic of the OFFERED merit-order list, not a settled price. Peak, floor, saturation and peak-to-floor are undefined for it. It is retained in the evidence base as supply-curve evidence for 36.E2/E3; the settled activation price is a different source and is not held.',
      monthly: usable.map((m) => ({ month: m.month, offer_curve_mean: r4(m.mean), p10: r4(m.p10), p90: r4(m.p90), offered_mw: r4(m.volume_mean) })),
    };
  }

  const { segments, breaks_applied } = segmentMonths(usable, breaks, { market, product });
  const terminal = segments.at(-1);

  // Peak over the whole served span, with the segment it belongs to.
  let peak = usable[0];
  for (const m of usable) if (m.mean > peak.mean) peak = m;
  const peakSegIdx = segments.findIndex((s) => s.months.some((m) => m.month === peak.month));

  // Floor from the terminal segment where it is long enough; otherwise from the LONGEST
  // segment, labelled. Reporting only `insufficient_months` would throw away a decade of
  // German aFRR because one late break (Czechia joining the capacity cooperation in
  // September 2025) left 11 months behind it.
  let floorSeg = terminal, floorBasis = 'terminal_segment', floor = null, floorNote = null;
  if (terminal.months.length < CRITERIA.MIN_FLOOR_MONTHS) {
    const longest = segments.reduce((a, b) => (b.months.length > a.months.length ? b : a), segments[0]);
    if (longest.months.length >= CRITERIA.MIN_FLOOR_MONTHS) { floorSeg = longest; floorBasis = 'longest_segment'; }
    else { floorNote = `insufficient_months (longest segment ${longest.months.length} < ${CRITERIA.MIN_FLOOR_MONTHS})`; floorSeg = null; }
  }
  if (floorSeg) floor = pct(floorSeg.months.map((m) => m.mean), CRITERIA.FLOOR_PERCENTILE);

  // Saturation: the earliest month from which the FORWARD median — the median of that month
  // and every month after it — stays inside the band.
  //
  // Two earlier attempts were wrong in instructive ways. Requiring every individual later
  // month to sit inside the band let one spike in the tail reset the verdict, so GB DC-low
  // read not_reached after a 92 % collapse. Using a TRAILING median then made the candidate
  // month carry its own pre-saturation history, which pushed every verdict later or lost it
  // entirely. A forward median asks the question the arc actually asks — from when did the
  // LEVEL stay down — and is robust to single months either way.
  // A market cannot saturate before its own scarcity phase ends, so the search starts strictly
  // AFTER the peak month. Without that constraint a series whose median sits close to its p10
  // — Swedish FCR-N, dispersion 1.8 — "saturated" in its very first month, and Swedish FCR-D up
  // "saturated" one month before its peak. Both were artefacts of a floor-relative band with no
  // ordering constraint, and both looked like findings.
  const saturationAt = (tol) => {
    if (floor === null || floor <= 0 || !floorSeg) return floor === null ? 'floor_unavailable' : 'undefined_non_positive_floor';
    const band = floor * (1 + tol);
    const ms = floorSeg.months.filter((m) => m.month > peak.month);
    if (ms.length < CRITERIA.SATURATION_MIN_TAIL) return 'insufficient_tail_after_peak';
    for (let i = 0; i + CRITERIA.SATURATION_MIN_TAIL <= ms.length; i++) {
      const fwd = pct(ms.slice(i).map((m) => m.mean), 0.5);
      if (fwd !== null && fwd <= band) return ms[i].month;
    }
    return 'not_reached';
  };
  const saturation = saturationAt(CRITERIA.SATURATION_TOL);
  const saturationSensitivity = Object.fromEntries(
    CRITERIA.SATURATION_TOL_SENSITIVITY.map((t) => [`tol_${t}`, saturationAt(t)]),
  );

  // Anchor for years-to-saturation.
  const anchor = batteryEntry?.month ?? usable[0].month;
  const anchorKind = batteryEntry ? batteryEntry.basis : 'served_span_start';
  const yearsToSaturation = typeof saturation === 'string' && saturation.includes('-')
    ? r4(monthsBetween(anchor, saturation) / 12) : saturation;

  // Demand growth: CAGR of annual mean volume across the usable span.
  const byYear = new Map();
  for (const m of usable) {
    if (m.volume_mean === null) continue;
    const y = m.month.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)).push(m.volume_mean);
  }
  let demandCagr = 'not_computable', demandFirst = null, demandLast = null;
  const years = [...byYear.keys()].sort();
  if (years.length >= 2 && usable.length >= CRITERIA.MIN_MONTHS_FOR_CAGR) {
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    demandFirst = mean(byYear.get(years[0]));
    demandLast = mean(byYear.get(years.at(-1)));
    const n = Number(years.at(-1)) - Number(years[0]);
    if (demandFirst > 0 && n > 0) demandCagr = r4((demandLast / demandFirst) ** (1 / n) - 1);
  }

  // Floor vs arbitrage opportunity, over the months the floor was estimated from.
  let floorToArb = 'not_computable', arbMean = null;
  if (floor !== null && arbByMonth) {
    const vals = floorSeg.months.map((m) => arbByMonth.get(m.month)).filter(Boolean);
    if (vals.length >= 6) {
      arbMean = mechanism === 'cap'
        ? vals.reduce((s, v) => s + v.arb_eur_mw_h, 0) / vals.length
        : vals.reduce((s, v) => s + v.spread_eur_mwh, 0) / vals.length;
      if (arbMean > 0) floorToArb = r4(floor / arbMean);
    }
  }

  const highBreaksInPeakToFloor = breaks_applied.filter((b) => {
    const bm = b.date.slice(0, 7);
    const lo = floorSeg ? (peak.month < floorSeg.from ? peak.month : floorSeg.from) : peak.month;
    const hi = usable.at(-1).month;
    return bm > lo && bm <= hi;
  });

  return {
    ...base,
    verdict: 'computed',
    peak: { month: peak.month, eur: r4(peak.mean), segment_index: peakSegIdx },
    floor: floor === null ? floorNote : { eur: r4(floor), percentile: CRITERIA.FLOOR_PERCENTILE, basis: floorBasis, from_segment: `${floorSeg.from}..${floorSeg.to}`, n_months: floorSeg.months.length },
    peak_to_floor: floor !== null && floor > 0 ? r4(peak.mean / floor) : (floor !== null ? 'undefined_non_positive_floor' : 'floor_unavailable'),
    peak_and_floor_same_segment: floorSeg ? peakSegIdx === segments.indexOf(floorSeg) : null,
    saturation_month: saturation,
    saturation_sensitivity: saturationSensitivity,
    // How tightly the series sits above its own floor. A dispersion of 1.0 would mean the
    // median IS the p10; 3.0 means the band choice dominates the verdict, and the reader
    // should look at saturation_sensitivity rather than the headline month.
    floor_dispersion_median_over_p10: floor !== null && floor > 0 && floorSeg
      ? r4(pct(floorSeg.months.map((m) => m.mean), 0.5) / floor) : null,
    years_to_saturation: yearsToSaturation,
    saturation_anchor: { month: anchor, basis: anchorKind },
    floor_to_arbitrage_ratio: floorToArb,
    arbitrage_opportunity: arbMean === null ? 'not_computable' : {
      value: r4(arbMean),
      unit: mechanism === 'cap' ? 'EUR/MW/h (availability-equivalent proxy)' : 'EUR/MWh (top4h-bottom4h daily spread)',
      proxy_assumptions: mechanism === 'cap' ? { window_hours: CRITERIA.ARB_WINDOW_HOURS, rte: CRITERIA.RTE, cycles_per_day: 1 } : null,
    },
    demand: { cagr: demandCagr, first_year_mean_mw: r4(demandFirst), last_year_mean_mw: r4(demandLast), years: years.length ? `${years[0]}..${years.at(-1)}` : null },
    segments: segments.map((s, i) => ({
      index: i, from: s.from, to: s.to, n_months: s.months.length,
      opened_by: s.opened_by, closed_by: s.closed_by,
      mean_eur: r4(s.months.reduce((a, m) => a + m.mean, 0) / s.months.length),
      first_month_eur: r4(s.months[0].mean), last_month_eur: r4(s.months.at(-1).mean),
    })),
    breaks_applied,
    break_contamination: highBreaksInPeakToFloor.length
      ? { contaminated: true, breaks: highBreaksInPeakToFloor.map((b) => `${b.date} ${b.kind} (${b.severity})`), consequence: 'a single decay half-life fitted over this window would measure the rule change; fit per segment' }
      : { contaminated: false },
    monthly: usable.map((m) => ({ month: m.month, mean: r4(m.mean), p10: r4(m.p10), p90: r4(m.p90), volume: r4(m.volume_mean), coverage: r4(m.coverage), resolutions: m.resolutions })),
  };
}

// ── First battery entry, computed where the data supports it ───────────────

/** GB: the first DC delivery window with accepted battery MW, from the bid-level file. */
function gbBatteryEntry(rows) {
  const withBattery = rows
    .filter((r) => r.extra?.source === 'dc-bid-level' && (r.extra?.acceptedMwByTechnology?.Battery ?? 0) > 0)
    .map((r) => r.period_start).sort();
  if (!withBattery.length) return null;
  return { month: withBattery[0].slice(0, 7), basis: 'computed: first DC delivery window with accepted battery MW in the bid-level file' };
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Settled activation prices (36.B-036) — a SEPARATE block, deliberately not rows in the
 * lifecycle table above.
 *
 * The lifecycle columns are capacity-market statistics. Peak-to-floor measures how far a
 * procurement price fell as qualified supply entered; saturation measures when it stopped
 * falling. An activation price is not that quantity: it is an event price that exists only in
 * the ISPs where energy was actually activated, it is set by the imbalance of the moment rather
 * than by the entry of competitors, and it runs to the technical price limit in scarcity. Giving
 * it a "floor" and a "saturation month" would produce cells that look like the others and mean
 * something else — the same category error that made the German RAM offer-curve export
 * unusable, in a new costume. So this block reports what an activation series actually supports:
 *
 *   level      — mean/median/p10/p90 OVER ACTIVATED ISPs ONLY, per structural segment
 *   frequency  — activated ISPs ÷ ISPs in the span, which is a different parameter from level
 *                and the one a revenue model multiplies by
 *   tails      — share negative and share at the technical limit, both real market outcomes
 *
 * Level and frequency are reported side by side and never combined into one number here,
 * because the combination is a modelling choice that belongs to E2/E3, not to the evidence base.
 */
function analyseActivation(rows, breaks) {
  const ISP_MIN = 15;
  const out = [];
  for (const [key, seriesRows] of [...bySeries(rows)].sort()) {
    const [market, area, product, direction, mechanism] = key.split('|');
    const sorted = [...seriesRows].sort((a, b) => a.period_start.localeCompare(b.period_start));
    const spanStart = Date.parse(sorted[0].period_start);
    const spanEnd = Date.parse(sorted.at(-1).period_end);

    const months = monthlyAggregate(sorted);
    // Denominator: ISPs inside the intersection of the month and the series span. UTC 15-minute
    // intervals tile a UTC month exactly, so no DST correction is needed — but the first and
    // last months are partial, and using a whole month there would understate frequency.
    for (const m of months) {
      const [y, mo] = m.month.split('-').map(Number);
      const mStart = Date.UTC(y, mo - 1, 1);
      const mEnd = Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1);
      const from = Math.max(mStart, spanStart);
      const to = Math.min(mEnd, spanEnd);
      m.isps_in_span = Math.max(0, Math.round((to - from) / 60000 / ISP_MIN));
      m.activation_frequency = m.isps_in_span ? r4(m.n_priced / m.isps_in_span) : null;
    }

    const { segments, breaks_applied } = segmentMonths(months, breaks, { market, product });
    const prices = sorted.map((r) => r.price_norm).filter((p) => p !== null);
    // Bucket prices by month once. Filtering all rows per segment against every month in it is
    // O(rows x months) and these series run to hundreds of thousands of rows.
    const pricesByMonth = new Map();
    for (const r of sorted) {
      if (r.price_norm === null) continue;
      const k = r.period_start.slice(0, 7);
      (pricesByMonth.get(k) ?? pricesByMonth.set(k, []).get(k)).push(r.price_norm);
    }

    const seg = segments.map((g, i) => {
      const activated = g.months.reduce((s, m) => s + m.n_priced, 0);
      const possible = g.months.reduce((s, m) => s + m.isps_in_span, 0);
      const p = g.months.flatMap((m) => pricesByMonth.get(m.month) ?? []);
      return {
        index: i + 1, from: g.from, to: g.to, n_months: g.months.length,
        activated_isps: activated, isps_in_span: possible,
        activation_frequency: possible ? r4(activated / possible) : null,
        mean_over_activated_eur_mwh: p.length ? r4(p.reduce((s, v) => s + v, 0) / p.length) : null,
        median_eur_mwh: r4(pct(p, 0.5)), p10_eur_mwh: r4(pct(p, 0.1)), p90_eur_mwh: r4(pct(p, 0.9)),
        share_negative: p.length ? r4(p.filter((v) => v < 0).length / p.length) : null,
        share_at_technical_limit: p.length ? r4(p.filter((v) => Math.abs(v) >= 15000).length / p.length) : null,
        opened_by: g.opened_by,
      };
    });
    out.push({
      market, area, product, direction: direction === '-' ? null : direction, mechanism,
      price_basis: 'vwap_activated',
      span: `${sorted[0].period_start.slice(0, 10)}..${sorted.at(-1).period_end.slice(0, 10)}`,
      n_months: months.length,
      activated_isps: prices.length,
      isps_in_span: months.reduce((s, m) => s + m.isps_in_span, 0),
      activation_frequency: r4(prices.length / months.reduce((s, m) => s + m.isps_in_span, 0)),
      mean_over_activated_eur_mwh: r4(prices.reduce((s, v) => s + v, 0) / prices.length),
      median_eur_mwh: r4(pct(prices, 0.5)), p10_eur_mwh: r4(pct(prices, 0.1)), p90_eur_mwh: r4(pct(prices, 0.9)),
      min_eur_mwh: r4(Math.min(...prices)), max_eur_mwh: r4(Math.max(...prices)),
      share_negative: r4(prices.filter((v) => v < 0).length / prices.length),
      share_at_technical_limit: r4(prices.filter((v) => Math.abs(v) >= 15000).length / prices.length),
      breaks_applied,
      segments: seg,
      lifecycle_columns: 'not_applicable — see the block comment in build-summary-table.mjs. An activation price has no peak-to-floor lifecycle: it is an event price, not a procurement price.',
    });
  }
  return out;
}

async function main() {
  const calendar = await loadCalendar();
  const breaks = calendar.events;

  const de = await loadDataset('de');
  const se = await loadDataset('se');
  const gb = await loadDataset('gb');
  const au = await loadDataset('au');
  const da = await loadDataset('da');
  // Settled activation prices (B-036). Optional so this script still reproduces the E0 table on
  // a checkout that predates the dataset, rather than failing on a missing directory.
  let activation = null;
  try { activation = await loadDataset('activation'); } catch (e) { if (e.code !== 'ENOENT') throw e; }

  // Arbitrage denominators per market, from the energy series of that market.
  const arb = {
    DE: arbitrageByMonth(da.rows.filter((r) => r.market === 'DE' && r.resolution === 'PT60M'), CRITERIA.ARB_WINDOW_HOURS),
    SE: arbitrageByMonth(da.rows.filter((r) => r.market === 'SE'), CRITERIA.ARB_WINDOW_HOURS),
    GB: arbitrageByMonth(da.rows.filter((r) => r.market === 'GB'), CRITERIA.ARB_WINDOW_HOURS),
    AU: arbitrageByMonth(au.rows.filter((r) => r.area === 'SA1'), CRITERIA.ARB_WINDOW_HOURS),
  };

  const batteryEntry = {
    GB: gbBatteryEntry(gb.rows),
    // Germany's first grid-scale battery in FCR is a 2014 prequalification date from the TSO
    // page. It predates every public price series, so it cannot anchor a years-to-saturation
    // figure computed from data; recorded, not used as an anchor.
    DE: null,
  };

  const reserveRows = [...de.rows, ...se.rows, ...gb.rows].filter((r) => r.area === DOMESTIC_AREA[r.market]);
  const series = bySeries(reserveRows);

  // Australia's spot series is analysed as its own row: it is the arbitrage evidence, not a
  // reserve product, so peak-to-floor of a spot price is not the same statistic. It is included
  // for the spread trajectory, and its floor columns are reported as not_applicable.
  const results = [];
  for (const [key, rows] of [...series].sort()) {
    const market = key.split('|')[0];
    results.push(analyseSeries(key, rows, breaks, arb[market], batteryEntry[market]));
  }

  // Spread trajectory per market — the E4 evidence, reported separately from the reserve rows.
  const spreads = {};
  for (const [market, m] of Object.entries(arb)) {
    const byYear = new Map();
    for (const [month, v] of m) {
      const y = month.slice(0, 4);
      (byYear.get(y) ?? byYear.set(y, []).get(y)).push(v.spread_eur_mwh);
    }
    spreads[market] = [...byYear].sort().map(([y, a]) => ({
      year: y, mean_daily_spread_eur_mwh: r4(a.reduce((x, z) => x + z, 0) / a.length), n_months: a.length,
    }));
  }

  const out = {
    artifact: 'cross-market summary table',
    phase: '36.E0',
    built_at: new Date().toISOString(),
    reproducible_offline: true,
    criteria: CRITERIA,
    criteria_notes: {
      floor: `p10 of monthly means within the terminal segment (>= ${CRITERIA.MIN_FLOOR_MONTHS} months), because a floor is a property of one market design`,
      saturation: `searched only among months AFTER the peak, because a market cannot saturate before its scarcity phase ends. Then: earliest month whose FORWARD median (that month and all later months in the segment) is at or below floor x ${1 + CRITERIA.SATURATION_TOL}, requiring at least ${CRITERIA.SATURATION_MIN_TAIL} months of tail; otherwise not_reached, never extrapolated. Forward rather than trailing, so a candidate month is not judged on its own pre-saturation history; median rather than every month, so one spike does not reset the verdict. The band constant is reported with a sensitivity over ${JSON.stringify(CRITERIA.SATURATION_TOL_SENSITIVITY)} because it is a judgement call, not a measurement.`,
      offer_curve_series: 'series whose only price basis is offer_curve_mean get no lifecycle statistics: a mean over the offered merit-order list is bounded by the technical price limit, not by market behaviour',
      negative_floors: 'a negative floor is a real observation in GB co-optimised auctions, not an error; peak-to-floor is genuinely undefined there and is reported as such rather than clipped to zero',
      arbitrage_proxy: `daily (mean top ${CRITERIA.ARB_WINDOW_HOURS}h - mean bottom ${CRITERIA.ARB_WINDOW_HOURS}h) from the market's own day-ahead/spot series, collapsed to hourly first so resolutions are comparable; availability-equivalent = spread x ${CRITERIA.ARB_WINDOW_HOURS}h x RTE ${CRITERIA.RTE} / 24h. RTE is an assumption, not a measurement.`,
      peak: 'maximum monthly mean over the whole served span; if it falls in a different segment from the floor, peak_and_floor_same_segment is false and the ratio spans a rule change',
    },
    domestic_area_filter: DOMESTIC_AREA,
    battery_entry: batteryEntry,
    manifests: {
      de: { retrieved_at: de.manifest.retrieved_at, rows: de.manifest.rows },
      se: { retrieved_at: se.manifest.retrieved_at, rows: se.manifest.rows },
      gb: { retrieved_at: gb.manifest.retrieved_at, rows: gb.manifest.rows },
      au: { retrieved_at: au.manifest.retrieved_at, rows: au.manifest.rows },
      da: { retrieved_at: da.manifest.retrieved_at, rows: da.manifest.rows },
      ...(activation ? { activation: { retrieved_at: activation.manifest.retrieved_at, rows: activation.manifest.rows } } : {}),
    },
    calendar_sources: calendar.source_verdicts,
    series: results,
    spread_trajectory: spreads,
    activation_prices: activation ? analyseActivation(activation.rows, breaks) : 'not_acquired',
    activation_prices_notes: activation ? {
      why_a_separate_block: 'An activation price is an event price, not a procurement price. The lifecycle columns (peak-to-floor, saturation month, years to saturation) are capacity-market statistics and do not transfer; reporting them here would produce cells that look comparable and are not.',
      level_and_frequency_are_two_parameters: 'The mean is over ACTIVATED ISPs only. An ISP with no activation has no price — it is not a price of zero. Activation frequency is reported alongside and never folded into the level, because folding them is a modelling choice belonging to E2/E3.',
      de_has_no_pre_picasso_segment: 'The German series starts at its own PICASSO accession (first rows 2022-06-21, first full day 2022-06-22), so Germany cannot measure its own accession break on activation prices. Austria acceded on the same date and publishes from 2021-01, which is why AT is in this block: it carries the only before/after this evidence base has for the activation leg, and it is n=1.',
      technical_limit: 'share_at_technical_limit counts ISPs at |price| >= 15000 EUR/MWh, the platform price limit. Unlike the German RAM offer-curve export, these are settled outcomes and are retained.',
      two_publication_styles: 'DE and AT publish this dataItem differently and the difference is not cosmetic. Germany emits one short Period per activation episode, so its series is structurally sparse. Austria emits a dense step function in which 0 is the resting value meaning no activation, and those zeros are dropped (counted per series in the dataset manifest). Consequence: DE activation_frequency is measured against published episodes, AT against a dropped-zero baseline. The two frequencies are comparable in intent but not derived identically, and AT mFRR in particular is 214090 dropped resting-zeros against 5380 activations.',
      break_applicability_is_not_asserted: 'Segments come from the primary-sourced calendar only, and the calendar records a break\'s market and products but not which MECHANISM it affects. The DE aFRR activation series is therefore split at 2025-09-01 by the CEPS/ALPACA event, which is a CAPACITY cooperation whose own description concerns the composition of the German capacity export. Its relevance to activation prices is NOT established here. The measured step across it is large (segment mean 199.66 to 95.34 EUR/MWh) and must not be read as an ALPACA effect without an argument that ALPACA touches activation at all — general market conditions are an untested alternative. Flagged rather than silently included or silently excluded; the decision belongs to E2.',
    } : null,
  };

  await fs.writeFile(path.join(OUT_DIR, 'summary-table.json'), JSON.stringify(out, null, 1) + '\n');
  await fs.mkdir(DOC_DIR, { recursive: true });
  await fs.writeFile(path.join(DOC_DIR, 'mature-market-summary-table.md'), renderMarkdown(out));
  console.log(`${results.length} series · summary-table.json + docs/research/mature-market-summary-table.md`);
  for (const r of results) {
    console.log(`  ${r.market} ${r.product}/${r.mechanism}${r.direction ? '/' + r.direction : ''} — ${r.verdict === 'computed'
      ? `peak ${r.peak.eur} @${r.peak.month} · floor ${typeof r.floor === 'object' ? r.floor.eur : r.floor} · P/F ${r.peak_to_floor} · sat ${r.saturation_month} · yrs ${r.years_to_saturation} · floor/arb ${r.floor_to_arbitrage_ratio}`
      : r.verdict}`);
  }
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return String(v);
}

function renderMarkdown(out) {
  const L = [];
  L.push('# Cross-market summary table — Phase 36.E0 mature-market evidence base');
  L.push('');
  L.push(`Generated by \`tools/consultancy/mature-markets/build-summary-table.mjs\` at ${out.built_at}.`);
  L.push('**Every figure is computed from committed data. None is quoted from literature.**');
  L.push('Regenerate with `node tools/consultancy/mature-markets/build-summary-table.mjs` — no network access required.');
  L.push('');
  L.push('## Criteria');
  L.push('');
  for (const [k, v] of Object.entries(out.criteria_notes)) L.push(`- **${k}** — ${v}`);
  L.push('');
  L.push('| Constant | Value |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(out.criteria)) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('## The table');
  L.push('');
  L.push('Capacity rows are EUR/MW/h; energy rows are EUR/MWh. `P/F` is peak ÷ floor.');
  L.push('`floor/arb` is the floor as a multiple of the contemporaneous arbitrage opportunity —');
  L.push('the arc predicts a saturated market settles near 1.');
  L.push('');
  L.push('| Market | Product | Mech | Dir | Span | Peak (month) | Floor | P/F | Same seg? | Saturated | Yrs to sat (anchor) | Sat @ tol 0.5 / 1 / 2 | med/p10 | floor/arb | Demand CAGR | Breaks in window |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of out.series) {
    if (s.verdict !== 'computed') { L.push(`| ${s.market} | ${s.product} | ${s.mechanism} | ${s.direction ?? '—'} | ${s.span ?? '—'} | ${s.verdict}${s.verdict === 'not_applicable_offer_curve' ? ' (offer curve, not a settled price)' : ''} | | | | | | | | | | |`); continue; }
    const sens = s.saturation_sensitivity ? `${s.saturation_sensitivity['tol_0.5']} / ${s.saturation_sensitivity.tol_1} / ${s.saturation_sensitivity.tol_2}` : '—';
    L.push(`| ${s.market} | ${s.product} | ${s.mechanism} | ${s.direction ?? '—'} | ${s.span} | ${fmt(s.peak.eur)} (${s.peak.month}) | ${typeof s.floor === 'object' ? `${fmt(s.floor.eur)}${s.floor.basis === 'longest_segment' ? ' †' : ''}` : s.floor} | ${fmt(s.peak_to_floor)} | ${s.peak_and_floor_same_segment === null ? '—' : s.peak_and_floor_same_segment ? 'yes' : '**no**'} | ${s.saturation_month} | ${fmt(s.years_to_saturation)} (${s.saturation_anchor.basis === 'served_span_start' ? 'span start' : 'battery entry'}) | ${sens} | ${fmt(s.floor_dispersion_median_over_p10)} | ${fmt(s.floor_to_arbitrage_ratio)} | ${fmt(s.demand.cagr)} | ${s.break_contamination.contaminated ? s.break_contamination.breaks.length : 0} |`);
  }
  L.push('');
  L.push('### Honesty notes on this table');
  L.push('');
  L.push('- `not_reached` means the criterion was not met in the data. It is never extrapolated.');
  L.push('- `insufficient_months` means the terminal segment is too short to estimate a floor under the current market design.');
  L.push('- A **no** in "Same seg?" means peak and floor sit either side of a rule change, so the ratio describes a market *and* a redesign. Fit decay per segment, not across.');
  L.push('- `floor/arb` uses an explicitly assumed round-trip efficiency and a one-cycle-a-day, 4 h battery. It is a proxy for opportunity cost, not a measurement of it.');
  L.push('- `†` on a floor means it was estimated from the longest segment rather than the terminal one, because the terminal segment is shorter than the minimum. The row\'s segment table shows which.');
  L.push('- `Sat @ tol` shows the saturation month under three band widths. Where the three disagree, the headline month is a product of the band choice and should be quoted with it — read `med/p10` too: a high dispersion means the series oscillates and no single band is decisive.');
  L.push('- `not_applicable_offer_curve` rows are German RAM energy exports. They summarise the OFFERED merit-order list, which runs to the 15 000 EUR/MWh technical limit, so a mean over it is bounded by a price cap and not by market behaviour. They are kept as supply-curve evidence and given no lifecycle statistics. The settled activation price is a different source and is not held — see the checkpoint report.');
  L.push('');
  L.push('## Per-series segments');
  L.push('');
  for (const s of out.series) {
    if (s.verdict !== 'computed') continue;
    L.push(`### ${s.market} · ${s.product} · ${s.mechanism}${s.direction ? ' · ' + s.direction : ''}`);
    L.push('');
    L.push(`Served ${s.span} · ${s.n_months_usable} usable months of ${s.n_months_served}${s.n_months_excluded_low_coverage ? ` (${s.n_months_excluded_low_coverage} excluded for coverage below ${out.criteria.MIN_COVERAGE})` : ''}.`);
    L.push('');
    L.push('| Seg | From | To | Months | Mean | First | Last | Opened by |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const g of s.segments) L.push(`| ${g.index} | ${g.from} | ${g.to} | ${g.n_months} | ${fmt(g.mean_eur)} | ${fmt(g.first_month_eur)} | ${fmt(g.last_month_eur)} | ${g.opened_by} |`);
    L.push('');
    if (s.break_contamination.contaminated) {
      L.push(`**Break contamination.** ${s.break_contamination.consequence}`);
      for (const b of s.break_contamination.breaks) L.push(`- ${b}`);
      L.push('');
    }
  }
  L.push('## Spread trajectory (36.E4 evidence)');
  L.push('');
  L.push('Mean daily top-4h − bottom-4h day-ahead/spot spread, EUR/MWh, per year.');
  L.push('AU is SA1 (highest battery penetration); the arc\'s two-force race — renewables widening,');
  L.push('batteries compressing — is what these columns are for.');
  L.push('');
  const yrs = [...new Set(Object.values(out.spread_trajectory).flat().map((r) => r.year))].sort();
  L.push(`| Market | ${yrs.join(' | ')} |`);
  L.push(`|---|${yrs.map(() => '---').join('|')}|`);
  for (const [m, rows] of Object.entries(out.spread_trajectory)) {
    const by = Object.fromEntries(rows.map((r) => [r.year, r.mean_daily_spread_eur_mwh]));
    L.push(`| ${m} | ${yrs.map((y) => fmt(by[y])).join(' | ')} |`);
  }
  L.push('');
  if (Array.isArray(out.activation_prices)) {
    L.push('## Settled activation prices (36.B-036 — the 36.E2/E3 activation evidence)');
    L.push('');
    L.push('EUR/MWh, `vwap_activated`: the volume-weighted price of balancing energy **actually');
    L.push('activated** in that ISP and direction, as settled. Not the German RAM offer-curve export.');
    L.push('');
    for (const [k, v] of Object.entries(out.activation_prices_notes)) L.push(`- **${k}** — ${v}`);
    L.push('');
    L.push('`Freq` is activated ISPs ÷ ISPs in the span — a different parameter from the level, and');
    L.push('the one a revenue model multiplies by. `Neg` and `Cap` are the share of activated ISPs');
    L.push('priced below zero and at the 15 000 EUR/MWh technical limit.');
    L.push('');
    L.push('| Market | Product | Dir | Span | Activated ISPs | Freq | Mean | Median | p10 | p90 | Min | Max | Neg | Cap |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const a of out.activation_prices) {
      L.push(`| ${a.market} | ${a.product} | ${a.direction ?? '—'} | ${a.span} | ${a.activated_isps} | ${fmt(a.activation_frequency)} | ${fmt(a.mean_over_activated_eur_mwh)} | ${fmt(a.median_eur_mwh)} | ${fmt(a.p10_eur_mwh)} | ${fmt(a.p90_eur_mwh)} | ${fmt(a.min_eur_mwh)} | ${fmt(a.max_eur_mwh)} | ${fmt(a.share_negative)} | ${fmt(a.share_at_technical_limit)} |`);
    }
    L.push('');
    L.push('### Activation-price segments');
    L.push('');
    L.push('Segmented on the primary-sourced break calendar only. Where a market has a segment on');
    L.push('each side of a platform accession, the two rows are the before/after that E2 needs.');
    L.push('');
    for (const a of out.activation_prices) {
      if (a.segments.length < 2) continue;
      L.push(`#### ${a.market} · ${a.product} · ${a.direction ?? '—'}`);
      L.push('');
      L.push('| Seg | From | To | Months | Activated | Freq | Mean | Median | p10 | p90 | Neg | Opened by |');
      L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const g of a.segments) L.push(`| ${g.index} | ${g.from} | ${g.to} | ${g.n_months} | ${g.activated_isps} | ${fmt(g.activation_frequency)} | ${fmt(g.mean_over_activated_eur_mwh)} | ${fmt(g.median_eur_mwh)} | ${fmt(g.p10_eur_mwh)} | ${fmt(g.p90_eur_mwh)} | ${fmt(g.share_negative)} | ${g.opened_by} |`);
      L.push('');
    }
  } else {
    L.push('## Settled activation prices');
    L.push('');
    L.push('`not_acquired` — the activation dataset is not present in this checkout.');
    L.push('');
  }
  L.push('## Provenance');
  L.push('');
  L.push('| Dataset | Retrieved | Rows |');
  L.push('|---|---|---|');
  for (const [k, v] of Object.entries(out.manifests)) L.push(`| ${k} | ${v.retrieved_at} | ${v.rows} |`);
  L.push('');
  L.push('Structural-break calendar source verdicts: ' + Object.entries(out.calendar_sources).map(([k, v]) => `\`${k}\`=${v}`).join(', ') + '.');
  L.push('');
  return L.join('\n');
}

await main();
