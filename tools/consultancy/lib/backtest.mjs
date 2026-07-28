/**
 * Dispatch backtest → measured trading realisation — Phase 36.B3
 *
 * `trading_realisation = 0.85` is the largest assumed number in the model. The
 * register calls it "x of perfect foresight" and sources it to an industry range
 * of 0.70-0.90. An advisor attacks the largest assumption first, so this
 * replaces it with a measurement over realised market prices.
 *
 * ── What is being divided by what ────────────────────────────────────────
 *
 * The denominator has to be the SAME construct the 0.85 discounts, or the
 * measured number is not a replacement for it. The register's basis is the S1
 * sort-and-dispatch capture: sort a day's prices, charge in the cheapest N
 * intervals, discharge in the dearest N, and take the spread. That is
 * `computeDayCapture` in the worker, imported here rather than restated (rule
 * #4) — a locally reimplemented benchmark would silently move the denominator.
 *
 * The numerator is the same quantity produced by the B1 greedy policy: its
 * volume-weighted average discharge price minus its volume-weighted average
 * charge price, on the same day and the same asset.
 *
 *   realisation = (policy avg discharge − policy avg charge)
 *               ÷ (sorted avg discharge − sorted avg charge)
 *
 * Both sides are gross spreads in €/MWh on identical information: the whole
 * day's day-ahead curve, which is exactly what a BRP holds after the auction
 * clears. Neither side sees tomorrow.
 *
 * ── What this does NOT measure ───────────────────────────────────────────
 *
 * This is policy quality on day-ahead arbitrage, and nothing else. It does not
 * measure intraday execution, bid rejection, imbalance exposure, or forecast
 * error on the balancing side. Reserve realisation stays assumed and is stated
 * as such (operator decision D3) — no multi-year sub-daily Baltic reserve series
 * exists to measure it against.
 */

/**
 * Per-day realised capture from an hourly dispatch trace.
 *
 * Volume-weighted, because a spread achieved on 0.2 MWh and one achieved on
 * 40 MWh are not the same evidence. Days on which the policy declined to trade
 * are returned with `traded: false` rather than a zero, so they can be counted
 * and excluded rather than silently dragging the mean toward zero.
 */
export function policyDayCapture(rows) {
  let chargeMwh = 0, chargeCost = 0, dischargeMwh = 0, dischargeRev = 0;

  for (const r of rows) {
    const p = r.price;
    if (!Number.isFinite(p)) continue;
    if (r.mwh_charge > 0) { chargeMwh += r.mwh_charge; chargeCost += r.mwh_charge * p; }
    if (r.mwh_discharge > 0) { dischargeMwh += r.mwh_discharge; dischargeRev += r.mwh_discharge * p; }
  }

  if (!(chargeMwh > 0) || !(dischargeMwh > 0)) {
    return { traded: false, charge_mwh: chargeMwh, discharge_mwh: dischargeMwh };
  }

  const avg_charge = chargeCost / chargeMwh;
  const avg_discharge = dischargeRev / dischargeMwh;
  return {
    traded: true,
    charge_mwh: chargeMwh,
    discharge_mwh: dischargeMwh,
    avg_charge,
    avg_discharge,
    gross_eur_mwh: avg_discharge - avg_charge,
  };
}

/**
 * Split an hourly trace and its price vector into calendar days.
 * Index 0 is Jan 1 00:00 UTC, so day boundaries are exact 24-hour blocks.
 */
export function byDay(rows, prices) {
  const days = [];
  const n = Math.floor(prices.length / 24);
  for (let d = 0; d < n; d++) {
    days.push({
      day: d,
      prices: prices.slice(d * 24, d * 24 + 24),
      rows: rows.slice(d * 24, d * 24 + 24),
    });
  }
  return days;
}

/**
 * Measure realisation day by day.
 *
 * `captureFn` is the worker's `computeDayCapture`, passed in rather than
 * imported here so the caller owns the engine handle and this module stays
 * free of a worker dependency (which keeps it testable with a stub).
 */
export function measureRealisation({ days, dur_h, captureFn, dateForDay }) {
  const daily = [];

  for (const d of days) {
    if (d.prices.some((p) => p == null)) continue;

    const perfect = captureFn(d.prices, dur_h, 60);
    const policy = policyDayCapture(d.rows);
    if (!perfect || !(perfect.gross_eur_mwh > 0)) continue;

    daily.push({
      day: d.day,
      date: dateForDay ? dateForDay(d.day) : null,
      perfect_gross_eur_mwh: perfect.gross_eur_mwh,
      policy_gross_eur_mwh: policy.traded ? policy.gross_eur_mwh : null,
      traded: policy.traded,
      discharge_mwh: policy.discharge_mwh ?? 0,
      realisation: policy.traded ? policy.gross_eur_mwh / perfect.gross_eur_mwh : null,
    });
  }

  return daily;
}

/**
 * Aggregate daily realisations two ways, because they answer different
 * questions and a single figure hides the difference.
 *
 *   `volume_weighted` — the number that belongs in the register. The engine
 *      multiplies a capture spread by annual throughput, so the realisation it
 *      needs is the one weighted by the volume it will be applied to.
 *
 *   `simple_mean` — every trading day counted once. Reported as a cross-check:
 *      a large gap between the two means the policy performs differently on
 *      high-volume days than on low-volume ones, which is itself a finding.
 *
 * Non-trading days are excluded from both and counted separately. Including
 * them as zeros would conflate "captured a poor spread" with "correctly
 * declined to trade a spread that could not cover the round trip" — and the
 * second is the policy working, not failing.
 */
export function aggregateRealisation(daily) {
  const traded = daily.filter((d) => d.traded && Number.isFinite(d.realisation));
  if (!traded.length) {
    return { n_days: daily.length, n_traded: 0, volume_weighted: null, simple_mean: null };
  }

  const vol = traded.reduce((a, d) => a + d.discharge_mwh, 0);
  const volume_weighted = vol > 0
    ? traded.reduce((a, d) => a + d.realisation * d.discharge_mwh, 0) / vol
    : null;
  const simple_mean = traded.reduce((a, d) => a + d.realisation, 0) / traded.length;

  const sorted = traded.map((d) => d.realisation).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

  return {
    n_days: daily.length,
    n_traded: traded.length,
    n_declined: daily.length - traded.length,
    discharge_mwh: vol,
    volume_weighted,
    simple_mean,
    min: sorted[0],
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: sorted[sorted.length - 1],
    over_1_days: traded.filter((d) => d.realisation > 1).length,
  };
}

/** Month key (YYYY-MM) → aggregate, for the methodology's monthly table. */
export function byMonth(daily) {
  const groups = new Map();
  for (const d of daily) {
    if (!d.date) continue;
    const k = d.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const out = {};
  for (const [k, rows] of [...groups.entries()].sort()) out[k] = aggregateRealisation(rows);
  return out;
}

/**
 * Look-ahead leakage checks.
 *
 * The batch prompt's instruction is explicit: if the measured figure exceeds
 * 0.90, hunt for leakage before believing it. These are the symptoms that
 * would show it, evaluated whether or not the threshold trips — a clean bill
 * of health is only worth something if it was not conditional on the answer
 * being convenient.
 */
export function leakageChecks(daily, aggregate) {
  const checks = [];

  // 1. A greedy threshold policy cannot beat a perfect-foresight sort on the
  //    same day. Any day above 1.0 means the two are not on the same basis.
  checks.push({
    check: 'no day exceeds perfect foresight',
    pass: aggregate.over_1_days === 0,
    detail: `${aggregate.over_1_days} of ${aggregate.n_traded} trading days score > 1.0`,
  });

  // 2. The headline figure sitting above 0.90 is the prompt's own tripwire.
  checks.push({
    check: 'headline below the 0.90 suspicion threshold',
    pass: aggregate.volume_weighted != null && aggregate.volume_weighted <= 0.9,
    detail: aggregate.volume_weighted == null ? 'no measurement'
      : `volume-weighted realisation ${aggregate.volume_weighted.toFixed(4)}`,
    note: 'Above 0.90 is not proof of leakage, but it is the point at which the ' +
      'measurement must be defended rather than reported.',
  });

  // 3. Realisation should not correlate with how good the day was. A policy
  //    that scores best exactly on the widest-spread days is a policy that
  //    knew which days those were.
  const traded = daily.filter((d) => d.traded);
  if (traded.length > 10) {
    const xs = traded.map((d) => d.perfect_gross_eur_mwh);
    const ys = traded.map((d) => d.realisation);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    const r = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
    checks.push({
      check: 'realisation not strongly correlated with day quality',
      pass: Math.abs(r) < 0.5,
      detail: `Pearson r = ${r.toFixed(3)} between perfect-foresight spread and realisation`,
      note: 'A strong POSITIVE correlation would suggest the policy anticipates good days.',
      value: r,
    });
  }

  return checks;
}
