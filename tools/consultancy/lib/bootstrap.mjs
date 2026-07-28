/**
 * Historical-year bootstrap → revenue percentiles — Phase 36.B2
 *
 * The screening model ships three named scenarios. A lender sizes debt off a
 * P90 and equity off a P50, and asks what the distribution behind them is. This
 * module builds that distribution from realised market history rather than from
 * an assumed spread, which is the whole "evidence over assumption" thesis of the
 * 36.B arc applied to revenue variance.
 *
 * ── Method, and why it is this one ────────────────────────────────────────
 *
 * For each complete historical calendar year of LT day-ahead prices, the B1
 * hourly engine is replayed over that year's shape. That yields a dispatch
 * revenue per line (capacity / activation / arbitrage) on a common asset and a
 * common reserve basis, so the ONLY thing varying between years is the price
 * shape itself.
 *
 * Those become RELATIVE factors against a reference shape-year, and the factors
 * scale the shipped engine's 20-year projection. The engine keeps ownership of
 * the forward transformation — degradation, fleet saturation, CPI compression,
 * spread growth, augmentation — exactly as it does for /revenue. Nothing here
 * re-implements a projection (discipline rule #4); the bootstrap injects
 * historical price-shape variation and nothing else.
 *
 * The reference year is the most recent COMPLETE shape-year, because the
 * engine's own base year is calibrated on current market state (`s1_capture`
 * rolling means, live S2 capacity prices). Normalising to the sample mean
 * instead would have made the "P50 ≈ Central" gate near-tautological — the
 * centre would match by construction. Against a fixed reference the gate can
 * fail, and if 2025 turns out to have been an unusually wide or narrow year it
 * SHOULD fail and say so.
 *
 * ── What this distribution does NOT contain ───────────────────────────────
 *
 * Reserve prices are held flat at their calibrated values across every
 * shape-year (operator decision D3: no multi-year sub-daily Baltic reserve
 * series exists). So capacity revenue varies between shape-years only through
 * how much MW the dispatch could commit given SoC, never through price. The
 * spread of this distribution is therefore a DAY-AHEAD spread, and it
 * understates total revenue variance. Every output carries `reserve_basis` so
 * the caveat cannot travel without the number.
 */

/**
 * Exceedance levels, in project-finance convention: P90 is the value exceeded
 * in 90 % of outcomes, i.e. a DOWNSIDE figure. Hence P99 < P90 < P75 < P50.
 */
export const EXCEEDANCE_LEVELS = [0.5, 0.75, 0.9, 0.99];

/** Revenue lines, mapped dispatch-side name → engine-side field. */
export const LINE_MAP = {
  capacity: 'rev_cap',
  activation: 'rev_act',
  arbitrage: 'rev_trd',
};

/**
 * Empirical exceedance percentile via Weibull plotting positions.
 *
 * With N samples the i-th smallest carries exceedance (N − i + 1)/(N + 1), so
 * the sample supports exceedance levels only within [1/(N+1), N/(N+1)]. A P90
 * from 5 shape-years is NOT a measured P90 — it sits outside that band and can
 * only be the sample minimum. Rather than quietly returning the minimum and
 * letting it be read as a measurement, this returns `resolved: false` and the
 * caller is expected to print that alongside the number.
 *
 * This is the arc's honesty constraint made mechanical: "percentiles beyond the
 * sample are extrapolation; state the method and its limits."
 */
export function exceedancePercentile(samples, p) {
  const xs = samples.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const N = xs.length;
  if (!N) return { value: null, resolved: false, reason: 'no samples' };
  if (N === 1) return { value: xs[0], resolved: false, reason: 'single sample' };

  const lo = 1 / (N + 1);
  const hi = N / (N + 1);
  // Rank position counting from the bottom of the sorted array.
  const pos = N + 1 - p * (N + 1);

  if (p > hi) {
    return {
      value: xs[0], resolved: false,
      reason: `P${Math.round(p * 100)} needs ≥ ${Math.ceil(1 / (1 - p)) - 1} shape-years; ` +
        `${N} resolves only to P${Math.round(hi * 100)}. Reported value is the sample minimum.`,
    };
  }
  if (p < lo) {
    return {
      value: xs[N - 1], resolved: false,
      reason: `P${Math.round(p * 100)} is above the sample's upper support; reported value is the sample maximum.`,
    };
  }

  const i = Math.floor(pos);
  const frac = pos - i;
  // pos ∈ [1, N] here, so i ∈ [1, N] and i-1 indexes the array safely.
  if (i >= N) return { value: xs[N - 1], resolved: true };
  const value = xs[i - 1] + frac * (xs[i] - xs[i - 1]);
  return { value, resolved: true };
}

/** The exceedance band a sample of size N can actually resolve. */
export function resolvableBand(N) {
  if (!(N >= 2)) return null;
  return { min_p: 1 / (N + 1), max_p: N / (N + 1), n: N };
}

/**
 * Per-line factors for each shape-year, relative to the reference year.
 *
 * ── Which revenue lines these are taken from, and why it matters ──────────
 *
 * The ATTRIBUTED lines, not the raw ones. `lib/dispatch.mjs` books the entire
 * charging cost against arbitrage in `revenue.arbitrage`, which drives that
 * line negative in most years (36.B1-K) — and a ratio of two negative numbers
 * is a meaningless scaling factor. Taken raw, 2022 produced an arbitrage factor
 * of −1.401, which would have flipped the sign of the engine's trading revenue
 * and quietly produced a nonsense distribution. `revenue.attributed` splits the
 * charging cost pro rata by delivered MWh, and its arbitrage line is positive in
 * every shape-year, which is what makes it a valid ratio base.
 *
 * ── Why activation is pinned at 1.0 ───────────────────────────────────────
 *
 * Its measured variation is not a day-ahead-shape signal. Activation ENERGY
 * comes from flat annual anchors and its price is flat under D3, so the only
 * thing moving `activation_net` between shape-years is the charging cost
 * attributed to it — and the line is net NEGATIVE in every year, a known
 * conservative artefact of up-only activation modelling (36.B1-M). Scaling the
 * engine's positive `rev_act` by the ratio of two artefacts would import that
 * artefact into a client deliverable. It is measured and reported, never
 * applied.
 *
 * Capacity's factor IS applied: it is small (±2 %) but genuine — a busier SoC
 * leaves less MW committable, which is a real simultaneity effect and exactly
 * the kind of thing this arc exists to measure.
 *
 * `arb_energy` tracks discharged MWh rather than revenue: charging cost in the
 * client bridge is driven by energy, so scaling revenue without scaling energy
 * would leave a high-spread year paying a low-spread year's charging bill.
 */
export function shapeYearFactors(byYear, refYear) {
  const ref = byYear[refYear];
  if (!ref) throw new Error(`reference shape-year ${refYear} is not in the sample`);

  const safe = (num, den) => (den > 0 ? num / den : null);

  const refAttr = ref.revenue.attributed;
  const out = {};
  for (const [year, d] of Object.entries(byYear)) {
    const a = d.revenue.attributed;
    out[year] = {
      capacity: safe(a.capacity, refAttr.capacity),
      // Pinned — see the note above. The measured value is carried alongside so
      // the decision is auditable rather than invisible.
      activation: 1,
      activation_measured: refAttr.activation_net !== 0
        ? a.activation_net / refAttr.activation_net : null,
      arbitrage: safe(a.arbitrage_net, refAttr.arbitrage_net),
      arb_energy: safe(d.energy.discharged_mwh, ref.energy.discharged_mwh),
    };
    for (const k of ['capacity', 'arbitrage', 'arb_energy']) {
      if (out[year][k] == null || !(out[year][k] > 0)) {
        throw new Error(
          `shape-year ${year}: ${k} factor is ${out[year][k]} — a non-positive scaling factor ` +
          `would invert an engine revenue line. Check the attributed revenue basis.`
        );
      }
    }
  }
  return out;
}

/**
 * Clone an engine result with one shape-year's factors applied.
 *
 * Only the revenue lines and the arbitrage energy schedule move. Everything
 * downstream — costs, capex, opex escalation — is recomputed by `buildBridge`
 * from the scaled gross, so the bridge stays internally consistent and still
 * ties out to the euro on its own assertions.
 */
export function applyShapeFactor(result, factor) {
  const out = structuredClone(result);

  out.years = out.years.map((y) => {
    const rev_cap = y.rev_cap * (factor.capacity ?? 1);
    const rev_act = y.rev_act * (factor.activation ?? 1);
    const rev_trd = y.rev_trd * (factor.arbitrage ?? 1);
    return {
      ...y,
      rev_cap,
      rev_act,
      rev_bal: rev_cap + rev_act,
      rev_trd,
      rev_gross: rev_cap + rev_act + rev_trd,
    };
  });

  if (out.project?.arb_energy_20yr) {
    out.project.arb_energy_20yr = out.project.arb_energy_20yr.map((a) => ({
      ...a,
      mwh_charged: a.mwh_charged * (factor.arb_energy ?? 1),
      mwh_discharged: a.mwh_discharged * (factor.arb_energy ?? 1),
    }));
  }

  return out;
}

/** Lifetime (undiscounted) gross revenue of an engine result. */
export const lifetimeGross = (result) =>
  result.years.reduce((a, y) => a + y.rev_gross, 0);

/**
 * Build the percentile tables.
 *
 * Two views, and they answer different questions:
 *
 *   `per_year`  — the distribution of each projection year taken independently.
 *                 Useful as a band around the revenue profile, but a P90 row is
 *                 NOT a coherent path: different years' P90s can come from
 *                 different shape-years.
 *
 *   `paths`     — whole shape-year paths ranked by lifetime revenue, so a
 *                 percentile names one real historical year and its entire
 *                 20-year projection. This is what the bridges are built from,
 *                 which is what keeps every delivered number traceable to a
 *                 shape-year with no synthetic draws.
 */
export function buildPercentiles(scaledByYear, levels = EXCEEDANCE_LEVELS) {
  const years = Object.keys(scaledByYear).sort();
  const nProj = scaledByYear[years[0]].years.length;

  const per_year = [];
  for (let i = 0; i < nProj; i++) {
    const samples = years.map((y) => scaledByYear[y].years[i].rev_gross);
    const row = {
      yr: scaledByYear[years[0]].years[i].yr,
      cal_year: scaledByYear[years[0]].years[i].cal_year,
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
      min: Math.min(...samples),
      max: Math.max(...samples),
    };
    for (const p of levels) {
      const r = exceedancePercentile(samples, p);
      row[`p${Math.round(p * 100)}`] = r.value;
      row[`p${Math.round(p * 100)}_resolved`] = r.resolved;
    }
    per_year.push(row);
  }

  const lifetimes = years.map((y) => ({ year: y, lifetime: lifetimeGross(scaledByYear[y]) }));
  const sorted = lifetimes.slice().sort((a, b) => a.lifetime - b.lifetime);

  const paths = {};
  for (const p of levels) {
    const r = exceedancePercentile(sorted.map((s) => s.lifetime), p);
    // Name the shape-year whose lifetime is closest to the percentile value —
    // the path actually delivered, so the bridge is one real year, not a blend.
    const pick = r.value == null ? null
      : sorted.reduce((best, s) =>
        Math.abs(s.lifetime - r.value) < Math.abs(best.lifetime - r.value) ? s : best, sorted[0]);
    paths[`p${Math.round(p * 100)}`] = {
      exceedance: p,
      lifetime_eur: r.value,
      resolved: r.resolved,
      reason: r.reason ?? null,
      shape_year: pick?.year ?? null,
      shape_year_lifetime_eur: pick?.lifetime ?? null,
    };
  }

  return { per_year, paths, lifetimes, band: resolvableBand(years.length) };
}

/**
 * Ordering gate: P99 ≤ P90 ≤ P75 ≤ P50 must hold everywhere, always.
 * Returns the list of violations rather than throwing, so the runner can print
 * every failure at once instead of stopping at the first.
 */
export function checkOrdering(per_year, levels = EXCEEDANCE_LEVELS) {
  const keys = levels
    .slice()
    .sort((a, b) => b - a) // 0.99, 0.90, 0.75, 0.50 → ascending in value
    .map((p) => `p${Math.round(p * 100)}`);

  const violations = [];
  for (const row of per_year) {
    for (let i = 0; i < keys.length - 1; i++) {
      const lo = row[keys[i]];
      const hi = row[keys[i + 1]];
      if (lo == null || hi == null) continue;
      // Equality is legal: unresolved levels both clamp to the sample minimum.
      if (lo > hi + 1e-6) {
        violations.push({ yr: row.yr, lower: keys[i], higher: keys[i + 1], lower_value: lo, higher_value: hi });
      }
    }
  }
  return violations;
}
