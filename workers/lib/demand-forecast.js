/**
 * Canonical Baltic flexibility-demand forecast — Phase 36.D.
 *
 * ONE source for every demand figure the engine, the register, the methodology
 * and the reconciliation harness use (discipline rule #4). Before this module
 * the same metric had two hardcoded producers with different constants (752 in
 * `processFleet`, 935 in the KV write path) and the published S/D oscillated
 * between them depending on which cron wrote last. There are no defaults here
 * and no defaults at any call site: if a year is out of range the functions
 * throw rather than substitute a number nobody chose.
 *
 * ── Scope: Baltic-auction-derived ──────────────────────────────────────────
 *
 * The demand SERIES is the common Baltic balancing-capacity procurement target,
 * taken from the tri-TSO (Elering + AST + LITGRID) LFC-block dimensioning
 * forecasts. That is the market KKME's modelled products actually clear in, it
 * matches the Baltic scope of the supply numerator, and it is published year by
 * year to 2035.
 *
 * It is also, it turns out, where the engine's shipped `752` came from all
 * along — 604 (mFRR up 2026) + 120 (aFRR up peak cycle) + 28 (FCR 2026). The
 * number was sourced; nobody wrote the source down. This module writes it down
 * and unfreezes it from 2026.
 *
 * ── The Litgrid FNA's role is STRUCTURAL, not the demand series ────────────
 *
 * Litgrid's *Lankstumo poreikių ataskaita 2026* sizes the flexibility GAP — the
 * portion of need not expected to be met by existing and planned resources. It
 * is the wrong instrument for sizing procurement, and its short-term and DSO
 * rows would double-count against the LFC-block series. What it supplies here
 * is the component structure: which LT services take BESS MW off the merchant
 * reserve pool, in what volume, on what trajectory, and why.
 *
 * ── The trap this module exists partly to prevent ──────────────────────────
 *
 * The FNA's public summary says the flexibility requirement grows "nuo 4.36 GW
 * iki 7.13 GW" (p.10). That is the `Poreikis` column of table 43 — the TOTAL
 * requirement. The additional/uncovered need is the `Nepadengtas` column of the
 * same table: 973 / 1044 / 869 / 1023 MW. Substituting the headline into
 * `eff_demand` puts LT S/D at 0.26–0.42, i.e. SCARCITY, and inflates the
 * compression index roughly 5x in the direction that flatters us. The series is
 * therefore recorded below under `EXCLUDED_READINGS`, with its reason, so the
 * trap lives in the artefact and not only in a document nobody re-reads.
 */

/** Treatments a component may carry. Enumerated so validation can enforce it. */
export const TREATMENTS = Object.freeze(['addressable', 'absorption', 'excluded']);

/**
 * How a component's value is derived for a year between published years.
 *
 *   linear — the quantity varies continuously (load growth, reserve sizing).
 *   step   — the quantity is legally or structurally discrete: it is in force
 *            or it is not. Holding the previous published value until the next
 *            one is a truer reading than smearing a legal cliff across three
 *            years. Both modes hit every published year exactly.
 */
export const INTERPOLATION_MODES = Object.freeze(['linear', 'step']);

/**
 * How a component's value is derived for a year BEFORE its first published year.
 *
 *   hold-first-value — the arrangement predates the forecast window.
 *   zero-before      — the arrangement does not exist yet; asserting volumes
 *                      before its first published year would invent contracts.
 */
export const BACKFILL_MODES = Object.freeze(['hold-first-value', 'zero-before']);

export const SOURCES = Object.freeze([
  Object.freeze({
    id: 'baltic-frr-2026-2035',
    role: 'demand-series',
    title: 'Baltic LFC block FRR dimensioning forecast 2026-2035',
    authors: 'Elering AS · AS "Augstsprieguma tīkls" · LITGRID AB',
    url: 'https://www.litgrid.eu/index.php/elektros-rinka/balansavimo-rinka/baltijos-lfc-bloko-frr-apimciu-prognoze-2026-2035/32612',
    document_url: 'https://www.litgrid.eu/uploads/files/dir795/dir39/dir1/6_0.php',
    published: '2025-07-29',
    archived_copy: 'tools/consultancy/data/sources/baltic-lfc-frr-dimensioning-forecast-2026-2035.pdf',
    sha256: 'c2becd95d1a0e8cc85ede474af36080ea80521774db54c9100fda9edf0dee62c',
  }),
  Object.freeze({
    id: 'baltic-fcr-2026-2035',
    role: 'demand-series',
    title: 'Baltic LFC block FCR dimensioning forecast 2026-2035',
    authors: 'Elering AS · AS "Augstsprieguma tīkls" · LITGRID AB',
    url: 'https://www.litgrid.eu/index.php/elektros-rinka/balansavimo-rinka/baltijos-lfc-bloko-fcr-apimciu-prognoze-2026-2035/36384',
    document_url: 'https://www.litgrid.eu/uploads/files/dir809/dir40/dir2/17_0.php',
    published: '2025-12-05',
    archived_copy: 'tools/consultancy/data/sources/baltic-lfc-fcr-dimensioning-forecast-2026-2035.docx',
    sha256: '792dd1a927549b9f476471787c550805be1103e3aa4db36224c76ab8dc7a6912',
  }),
  Object.freeze({
    id: 'litgrid-fna-2026',
    role: 'component-structure',
    title: 'Lankstumo poreikių ataskaita 2026 (Lithuanian flexibility needs assessment 2028-2035)',
    authors: 'LITGRID AB with ESO; adopted via VERT',
    url: 'https://www.litgrid.eu/index.php/sistema/lankstumo-poreikiu-vertinimo-ataskaita/36615',
    document_url: 'https://www.litgrid.eu/uploads/files/dir839/dir41/dir2/13_0.php',
    published: '2026-07-23',
    submitted_to_acer: '2026-07-25',
    legal_basis: 'EMD (EU) 2019/943 Art. 19e; ACER FNA methodology Decision 05/2025',
    scenario_used: 'L TrSc (Lėtesnės transformacijos scenarijus) — realistinis režimas, upward',
    scenario_note:
      'The report draws its own conclusions from this scenario/mode (p.8, p.12). Under ' +
      'L TrSc BASE mode the additional need is 0 MW in every year (table 40, p.145) — the ' +
      'entire ~1 GW arises from the realistic mode\'s two assumptions: restricted ' +
      'cross-zonal capacity and no P2X. That is a material sensitivity, not a detail.',
    update_cadence: 'biennial (report states "atnaujinama kas dvejus metus") — next ≈ 2028',
    archived_copy: 'tools/consultancy/data/sources/litgrid-flexibility-needs-2026-2035.pdf',
    sha256: '114941b023a12a64a92e1fceb973dc30118b5d7eed3b8a5b484dd47867a670e0',
  }),
]);

/**
 * Series that must NEVER be read as demand. Recorded rather than omitted: the
 * whole point is that the next reader of Litgrid's public summary meets the
 * refutation in the data, not in a changelog.
 */
export const EXCLUDED_READINGS = Object.freeze([
  Object.freeze({
    id: 'fna_total_flexible_measures',
    source: 'litgrid-fna-2026',
    location: 'table 43, p.146 — column "Poreikis"; headline sentence p.10',
    series: Object.freeze({ 2028: 4364, 2030: 5398, 2033: 5834, 2035: 7131 }),
    do_not_use: true,
    reason:
      'TOTAL flexibility requirement, not additional need. This is the "4.36 → 7.13 GW" ' +
      'of the public summary. Read as demand it puts LT S/D at 0.26-0.42 (SCARCITY) and ' +
      'inflates the compression index from ~0.31 to ~1.86 — a ~5x error in the flattering ' +
      'direction. The additional need is the "Nepadengtas" column of the same table.',
  }),
]);

/**
 * Components. `basis` records which source a series comes from; `treatment`
 * records what it does to KKME's S/D arithmetic.
 *
 * Series values are MW unless a `series_mwh` companion is present.
 */
export const COMPONENTS = Object.freeze([
  // ── Baltic LFC block procurement — the demand series ────────────────────
  {
    id: 'mfrr_up',
    basis: 'baltic-frr-2026-2035',
    location: 'table 2, p.6 — maximum across the six 4-hour cycles',
    definition:
      'Manually activated frequency restoration reserve, upward, dimensioned for the ' +
      'Baltic LFC block. Covers reference incidents and longer imbalances, freeing aFRR ' +
      'for short-term ones. Procured in the common Baltic balancing-capacity market; ' +
      'capacity may be located in any Baltic LFC area.',
    treatment: 'addressable',
    treatment_reason: 'KKME models mFRR capacity and activation revenue directly.',
    interpolation: 'linear',
    backfill: 'hold-first-value',
    series: Object.freeze({
      2026: 604, 2027: 624, 2028: 644, 2029: 664, 2030: 684,
      2031: 714, 2032: 714, 2033: 724, 2034: 744, 2035: 754,
    }),
  },
  {
    id: 'afrr_up',
    basis: 'baltic-frr-2026-2035',
    location: 'figure 1, p.5 — upward aFRR for BSPS, by 4-hour cycle',
    definition:
      'Automatically activated frequency restoration reserve, upward, Baltic LFC block. ' +
      'Dimensioned in six 4-hour cycles per day under CE SAFA Policy 1.',
    treatment: 'addressable',
    treatment_reason: 'KKME models aFRR capacity and activation revenue directly.',
    interpolation: 'linear',
    backfill: 'hold-first-value',
    // The source publishes ONE set of cycle values for the whole 2026-2035
    // horizon — aFRR is flat in time and varies only by time of day. The engine
    // has always used 120, the 16-20 peak. Kept, but now as a recorded choice:
    // it is conservative on the supply side (a larger denominator lowers S/D)
    // and it is 12.9% above the daily mean of 106.3 MW.
    cycle_profile_mw: Object.freeze({
      '00-04': 101, '04-08': 105, '08-12': 105, '12-16': 111, '16-20': 120, '20-24': 96,
    }),
    cycle_basis: 'peak (16-20)',
    series: Object.freeze({
      2026: 120, 2027: 120, 2028: 120, 2029: 120, 2030: 120,
      2031: 120, 2032: 120, 2033: 120, 2034: 120, 2035: 120,
    }),
  },
  {
    id: 'fcr',
    basis: 'baltic-fcr-2026-2035',
    location: 'figure 1 — series "Baltics" (recovered from the chart data, not read off the axis)',
    definition:
      'Frequency containment reserve, Baltic LFC block share of the Continental Europe ' +
      'obligation, allocated proportionally by net generation and consumption share ' +
      '(SOGL Art. 153, CE SAFA Policy 1, +10% probabilistic uplift).',
    treatment: 'addressable',
    treatment_reason: 'KKME models FCR capacity revenue directly.',
    interpolation: 'linear',
    backfill: 'hold-first-value',
    // Per-country split from the same chart. The LT row cross-validates the
    // Litgrid FNA's own FCR component exactly at 2028/2030/2033/2035 — two
    // independent documents, one number. `validateDemandForecast` asserts it.
    country_split_mw: Object.freeze({
      EE: Object.freeze({ 2026: 8, 2027: 8, 2028: 9, 2029: 9, 2030: 9, 2031: 9, 2032: 10, 2033: 11, 2034: 11, 2035: 12 }),
      LV: Object.freeze({ 2026: 8, 2027: 8, 2028: 8, 2029: 8, 2030: 9, 2031: 10, 2032: 10, 2033: 10, 2034: 11, 2035: 11 }),
      LT: Object.freeze({ 2026: 12, 2027: 13, 2028: 14, 2029: 16, 2030: 18, 2031: 19, 2032: 21, 2033: 23, 2034: 24, 2035: 25 }),
    }),
    series: Object.freeze({
      2026: 28, 2027: 29, 2028: 31, 2029: 33, 2030: 36,
      2031: 38, 2032: 41, 2033: 44, 2034: 46, 2035: 48,
    }),
  },

  // ── Litgrid FNA structural components — LT ──────────────────────────────
  {
    id: 'izdr',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row IZDR); definition §5.4.3, §7.3 p.126',
    definition:
      'Izoliuoto darbo rezervo paslauga — isolated-operation reserve. Guarantees the LT ' +
      'system can run safely islanded after loss of the single LitPol Link tie. BESS-only ' +
      'by physics. Reserved BY LAW to the designated storage operator UAB "Energy cells" ' +
      '(200 MW / 200 MWh): EEĮ Art. 48(1)(3) and Synchronisation Act Art. 6(1)(4) bar every ' +
      'other market participant — "Kiti rinkos dalyviai šios paslaugos teikti negali."',
    treatment: 'absorption',
    treatment_reason:
      'Energy Cells\' four 50 MW units (Kaupikliai Vilnius / Alytus / Šiauliai / Utena) are ' +
      'in KKME\'s fleet as status=operational with type=null, so they carry weight 1.0 in ' +
      'baltic_weighted_mw while being legally prohibited from selling into any product KKME ' +
      'models. Deducting the IZDR volume removes them from the merchant pool for exactly as ' +
      'long as the reservation is in force. The reservation is transitional (tied to the ' +
      'synchronisation-project period) and lapses by 2033 — hence 200/200/0/0, and hence ' +
      'this cannot be fixed by tagging the entries tso_bess permanently.',
    interpolation: 'step',
    interpolation_reason: 'A legal reservation is in force or it is not; it does not taper.',
    backfill: 'hold-first-value',
    backfill_reason: 'Energy Cells has been operational and contracted since 2022 — the obligation predates the forecast window.',
    series: Object.freeze({ 2028: 200, 2030: 200, 2033: 0, 2035: 0 }),
    series_mwh: Object.freeze({ 2028: 200, 2030: 200, 2033: 0, 2035: 0 }),
  },
  {
    id: 'gagap',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row GAGAP); definition §7.3 p.127, table 20',
    definition:
      'Greito aktyviosios galios atsako paslauga — fast active-power response. The remainder ' +
      'of the same fast-response requirement that IZDR does not cover, under technically ' +
      'identical requirements. Unlike IZDR it is OPEN to market participants, procured as a ' +
      'non-frequency ancillary service under VERT resolution O3-731 of 2026-06-15.',
    treatment: 'absorption',
    treatment_reason:
      'Only BESS can provide it (report: "gali būti užtikrinami tik elektros energijos ' +
      'kaupimo įrenginių pagalba"), it is market-procured, and KKME has no revenue line for ' +
      'it. So it takes merchant BESS MW off the aFRR/mFRR pool without adding addressable ' +
      'demand. Building a GAGAP revenue product is a commercial question, out of scope here.',
    interpolation: 'step',
    interpolation_reason:
      'GAGAP = 354 − IZDR by construction (table 20: the fast-response total is a flat ' +
      '354 MW in every analysed year). It steps exactly when IZDR does, so it must use the ' +
      'same mode or the identity breaks between published years.',
    backfill: 'zero-before',
    backfill_reason:
      'The procurement rules (VERT O3-731) were adopted 2026-06-15 and no volume has been ' +
      'contracted. Backfilling 154 MW to 2026 would assert contracts that do not exist.',
    series: Object.freeze({ 2028: 154, 2030: 154, 2033: 354, 2035: 354 }),
    series_mwh: Object.freeze({ 2028: 154, 2030: 154, 2033: 354, 2035: 354 }),
  },
  {
    id: 'lt_pl',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row LT-PL); definition §5.4.4 p.35-36, §7.4 p.127',
    definition:
      'Lietuvos-Lenkijos pralaidumo didinimo paslauga — LT-PL cross-section capacity-increase ' +
      'service. Until the 220 kV Harmony Link circuit exists the section\'s potential is ' +
      'capped at 500 MW; fast-response measures unlock the remainder. Sized by the report\'s ' +
      'own formula PDPP = PP − IZDR − GAGAP = 500 − 200 − 154 = 146 MW.',
    treatment: 'absorption',
    treatment_reason:
      'Same fast-response technology, procured separately, no KKME revenue line. The 0 from ' +
      '2033 is NOT the formula (500 − 0 − 354 would still be 146) — it is the Harmony Link ' +
      'precondition: the service exists only "iki naujos 220 kV dvigrandės linijos ... ' +
      'atsiradimo". The precondition is the reason, recorded here rather than inferred from ' +
      'the zero (rule #2).',
    interpolation: 'step',
    interpolation_reason: 'Harmony Link is energised or it is not; the service ends with a commissioning date, not a ramp.',
    backfill: 'zero-before',
    backfill_reason: 'Implementation is explicitly undecided — §7.4: "Sprendimas dėl įgyvendinimo turi būti priimtas atsižvelgiant į patirtį".',
    series: Object.freeze({ 2028: 146, 2030: 146, 2033: 0, 2035: 0 }),
    series_mwh: Object.freeze({ 2028: 146, 2030: 146, 2033: 0, 2035: 0 }),
  },
  {
    id: 'fna_fcr',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row FCR); §7.1 p.124',
    definition: 'LT share of the FCR obligation, as assessed inside the FNA.',
    treatment: 'excluded',
    treatment_reason:
      'Superseded by the Baltic-scope `fcr` component under the approved scope decision — ' +
      'including both would double-count. Retained because it cross-validates: these values ' +
      'match the Baltic FCR forecast\'s LT sub-series exactly at all four published years, ' +
      'across two independently authored documents. `validateDemandForecast` asserts it.',
    interpolation: 'linear',
    backfill: 'hold-first-value',
    series: Object.freeze({ 2028: 14, 2030: 18, 2033: 23, 2035: 25 }),
    series_mwh: Object.freeze({ 2028: 28, 2030: 36, 2033: 46, 2035: 50 }),
  },
  {
    id: 'short_term',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row Sistemos poreikis — Short-term); §5.4.2, §8.2',
    definition:
      'The UNCOVERED portion of short-term system flexibility: real-time deviation from plan ' +
      'caused by RES and load forecast error plus unforecast outages. To be met by ' +
      'limited-energy resources (BESS, ≤4 h). A separate long-duration need of 22-256 MW is ' +
      'assigned to existing flexible gas plant (table 46, p.151-152).',
    treatment: 'excluded',
    treatment_reason:
      'Two independent reasons. (1) No procurement mechanism exists: these MW are by ' +
      'definition NOT procured through FCR/aFRR/mFRR today, and Litgrid has committed to a ' +
      'Lithuanian flexibility-market development plan by end-Q4 2026 to define how they will ' +
      'be. Crediting them would model a market with no rules, no product and no price. ' +
      '(2) They would double-count against the LFC-block series, which already covers what ' +
      'KKME\'s products are procured for. Not absorption either — absorption requires a ' +
      'contract taking MW off the merchant pool, and there is nothing to contract into.',
    revisit: 'Litgrid Lithuanian flexibility-market development plan, due Q4 2026',
    interpolation: 'linear',
    backfill: 'zero-before',
    series: Object.freeze({ 2028: 429, 2030: 484, 2033: 415, 2035: 536 }),
    series_mwh: Object.freeze({ 2028: 982, 2030: 1789, 2033: 1414, 2035: 848 }),
  },
  {
    id: 'dso',
    basis: 'litgrid-fna-2026',
    location: 'table 48 p.152 / table 1 p.10 (row Tinklo poreikis — DSO needs); §6.3 p.124, Annex 2',
    definition:
      'ESO distribution-network upward flexibility need, driven by EV charging (162 → 438 MW ' +
      'of network load) and heat pumps (120 → 205 MW), concentrated 17:00-20:00. Computed at ' +
      '200 × 110 kV substation nodes and reported as the SUM OF PER-NODE ANNUAL MAXIMA.',
    treatment: 'excluded',
    treatment_reason:
      'DSO-procured through the central public-procurement portal by manual tender (§9.2), ' +
      'not a market KKME\'s products participate in. And the figure is a sum of per-node ' +
      'maxima, so it is not a coincident system requirement and cannot be added to one.',
    interpolation: 'linear',
    backfill: 'zero-before',
    series: Object.freeze({ 2028: 30, 2030: 42, 2033: 77, 2035: 108 }),
    // MWh deliberately absent: the source prints "—" for this row.
  },
].map(Object.freeze));

export const INTERPOLATION_POLICY = Object.freeze({
  rule: 'Per component, then summed. The total is never interpolated.',
  modes: 'Declared per component with a reason — see INTERPOLATION_MODES.',
  published_years_exact:
    'Both modes reproduce every published year exactly. IZDR reaches 0 at 2033 because the ' +
    'source says 0 at 2033, not because a line was drawn through it.',
});

export const EXTRAPOLATION_POLICY = Object.freeze({
  mode: 'component-trend',
  rule:
    'Beyond the last published year each component continues at its OWN compound growth ' +
    'rate, computed at call time from its own published series — never written down as a ' +
    'constant (rule #2). Components whose series begins or ends at zero, or whose last two ' +
    'published values are equal, are held flat: a geometric rate is undefined or meaningless ' +
    'there.',
  rejected: Object.freeze({
    'flat-last-value':
      'Asserts Baltic reserve demand stops growing in 2036 while RES keeps building — a ' +
      'premise the source documents contradict. Costs ~19.8% of the trading component ' +
      'post-2035 against ~10.7% for component-trend: conservative in arithmetic, aggressive ' +
      'in assumption.',
    'demand-growth-linked':
      'Keeps the engine\'s unsourced 2.00%/yr. Replacing an unsourced level with a sourced ' +
      'one while retaining an unsourced growth rate is half a fix. (For the record the ' +
      'published series grows at 2.29%/yr — the old guess was close.)',
  }),
});

export const VERSION = Object.freeze({
  version: '1.0.0',
  adopted_by: 'phase-36.D',
  adopted_date: '2026-07-29',
  scope: 'baltic-auction-derived',
  supersedes: Object.freeze({
    eff_demand_mw_935:
      'Undocumented literal introduced in fb088c4 (2026-03-05) with no derivation anywhere ' +
      'in the repository. Kept alive by syncLitgridFleet reading a cosmetic KV default back ' +
      'into processFleet, which made the published S/D oscillate 3.17x ↔ 2.55x on cron order.',
    eff_demand_mw_752:
      'Correct in value and unsourced in the code. It is the 2026 row of the two Baltic ' +
      'dimensioning forecasts; it is now that row, and the other nine years exist too.',
  }),
});

/** Retained prior adoptions. Empty at founding; appended on each adoption run. */
export const HISTORY = Object.freeze([]);

// ── Derivation ─────────────────────────────────────────────────────────────

const byId = new Map(COMPONENTS.map((c) => [c.id, c]));

/** Published years of a component's series, ascending. */
export function publishedYears(component) {
  return Object.keys(component.series).map(Number).sort((a, b) => a - b);
}

/** Compound annual growth rate of a component's published series, or null if undefined. */
export function componentCagr(component) {
  const ys = publishedYears(component);
  const first = component.series[ys[0]];
  const last = component.series[ys[ys.length - 1]];
  if (!(first > 0) || !(last > 0) || ys.length < 2) return null;
  const span = ys[ys.length - 1] - ys[0];
  return Math.pow(last / first, 1 / span) - 1;
}

/**
 * A component's MW in `year`.
 *
 * Below the first published year: per the component's `backfill` mode.
 * Between published years: per its `interpolation` mode.
 * Above the last: per EXTRAPOLATION_POLICY, at the component's own CAGR.
 */
export function componentMwAt(id, year) {
  const c = byId.get(id);
  if (!c) throw new Error(`demand-forecast: unknown component "${id}"`);
  if (!Number.isInteger(year)) throw new Error(`demand-forecast: year must be an integer, got ${year}`);
  const ys = publishedYears(c);
  const first = ys[0];
  const last = ys[ys.length - 1];

  if (year <= first) {
    if (year === first) return c.series[first];
    return c.backfill === 'zero-before' ? 0 : c.series[first];
  }
  if (year >= last) {
    if (year === last) return c.series[last];
    const g = componentCagr(c);
    // Flat when the rate is undefined, or when the series has stopped moving.
    if (g === null || c.series[ys[ys.length - 2]] === c.series[last]) return c.series[last];
    return c.series[last] * Math.pow(1 + g, year - last);
  }
  // Between two published years.
  let lo = first;
  let hi = last;
  for (const y of ys) {
    if (y <= year) lo = y;
    if (y >= year) { hi = y; break; }
  }
  if (lo === hi) return c.series[lo];
  if (c.interpolation === 'step') return c.series[lo];
  const t = (year - lo) / (hi - lo);
  return c.series[lo] + (c.series[hi] - c.series[lo]) * t;
}

const sumOf = (treatment, year) =>
  COMPONENTS.filter((c) => c.treatment === treatment)
    .reduce((s, c) => s + componentMwAt(c.id, year), 0);

/**
 * Effective Baltic reserve demand for `year` — the denominator of S/D.
 * Sum of the components treated as addressable.
 */
export function addressableDemandMw(year) {
  return round1(sumOf('addressable', year));
}

/**
 * MW of merchant BESS contracted away from the aFRR/mFRR pool in `year`.
 * Deducted from weighted supply, not added to demand: these MW compete for a
 * different buyer, they do not enlarge ours.
 *
 * Nameplate vs weighted: absorbed MW must come from assets a TSO will actually
 * contract, i.e. operational ones, which carry weight 1.0 — so the nameplate
 * deduction and the weighted numerator are on the same footing.
 */
export function absorptionMw(year) {
  return round1(sumOf('absorption', year));
}

/** Per-product demand for `year`. Products map 1:1 onto Baltic components. */
const PRODUCT_COMPONENT = Object.freeze({ fcr: 'fcr', afrr: 'afrr_up', mfrr: 'mfrr_up' });

export function productDemandMw(product, year) {
  const id = PRODUCT_COMPONENT[product];
  if (!id) throw new Error(`demand-forecast: unknown product "${product}"`);
  return round1(componentMwAt(id, year));
}

/** Every product's demand for `year`, shaped like the engine's PRODUCT_DEMAND. */
export function productDemandMap(year) {
  const out = {};
  for (const p of Object.keys(PRODUCT_COMPONENT)) out[p] = productDemandMw(p, year);
  return out;
}

/** Full per-year row — what the reconciliation harness and the register read. */
export function demandRow(year) {
  return {
    year,
    addressable_mw: addressableDemandMw(year),
    absorption_mw: absorptionMw(year),
    products: productDemandMap(year),
  };
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Assertions the module must satisfy. Throws on the first failure — a demand
 * module that half-validates is worse than none, because it looks checked.
 *
 * Called by the test suite and by the adoption workflow. Cheap enough to call
 * from the worker at cold start if that is ever wanted.
 */
export function validateDemandForecast() {
  const errs = [];
  const fail = (m) => errs.push(m);

  // 1. Structure.
  for (const c of COMPONENTS) {
    if (!TREATMENTS.includes(c.treatment)) fail(`${c.id}: treatment "${c.treatment}" not in ${TREATMENTS}`);
    if (!INTERPOLATION_MODES.includes(c.interpolation)) fail(`${c.id}: interpolation "${c.interpolation}" not in ${INTERPOLATION_MODES}`);
    if (!BACKFILL_MODES.includes(c.backfill)) fail(`${c.id}: backfill "${c.backfill}" not in ${BACKFILL_MODES}`);
    if (!c.treatment_reason) fail(`${c.id}: treatment_reason is required`);
    if (!c.basis || !SOURCES.some((s) => s.id === c.basis)) fail(`${c.id}: basis "${c.basis}" is not a declared source`);
    const ys = publishedYears(c);
    if (ys.length < 2) fail(`${c.id}: series needs at least two published years`);
    for (const y of ys) {
      const v = c.series[y];
      if (!Number.isFinite(v) || v < 0) fail(`${c.id}: series[${y}] = ${v} is not a non-negative number`);
    }
  }

  // 2. The Baltic demand series is contiguous 2026-2035.
  for (const id of ['mfrr_up', 'afrr_up', 'fcr']) {
    const ys = publishedYears(byId.get(id));
    const want = Array.from({ length: 10 }, (_, i) => 2026 + i);
    if (ys.join(',') !== want.join(',')) fail(`${id}: expected contiguous 2026-2035, got ${ys.join(',')}`);
  }

  // 3. The shipped constant ties out. 604 + 120 + 28 = 752.
  const d2026 = addressableDemandMw(2026);
  if (d2026 !== 752) fail(`addressable 2026 = ${d2026}, expected 752 (the engine's pre-36.D constant)`);

  // 4. FNA component years and document totals.
  const FNA_YEARS = [2028, 2030, 2033, 2035];
  const FNA_TOTAL_MW = { 2028: 973, 2030: 1044, 2033: 869, 2035: 1023 };
  const FNA_SPECIFIC_MW = { 2028: 514, 2030: 518, 2033: 377, 2035: 379 };
  const fnaIds = COMPONENTS.filter((c) => c.basis === 'litgrid-fna-2026').map((c) => c.id);
  for (const id of fnaIds) {
    const ys = publishedYears(byId.get(id));
    if (ys.join(',') !== FNA_YEARS.join(',')) fail(`${id}: expected FNA years ${FNA_YEARS.join(',')}, got ${ys.join(',')}`);
  }
  for (const y of FNA_YEARS) {
    const total = fnaIds.reduce((s, id) => s + byId.get(id).series[y], 0);
    if (total !== FNA_TOTAL_MW[y]) fail(`FNA components sum to ${total} MW at ${y}, document table 48 says ${FNA_TOTAL_MW[y]}`);
    const specific = ['fna_fcr', 'izdr', 'gagap', 'lt_pl'].reduce((s, id) => s + byId.get(id).series[y], 0);
    if (specific !== FNA_SPECIFIC_MW[y]) fail(`FNA specific sub-total is ${specific} MW at ${y}, table 43 says ${FNA_SPECIFIC_MW[y]}`);
  }

  // 5. THE IDENTITY (Phase 36.D decision 8). The fast-response requirement is a
  //    flat 354 MW in every analysed year (table 20, p.127); only the split
  //    between the legally-reserved IZDR and market-procured GAGAP moves. When
  //    IZDR lapses at 2033, Energy Cells' 200 MW returns to the merchant pool
  //    AND GAGAP rises by exactly +200 — supply +200, absorption +200, net zero.
  //
  //    Asserted across EVERY year in range, not only the published ones, so no
  //    future refactor can collapse the two components or change one mode
  //    without the other and silently break the cancellation.
  const FAST_RESPONSE_TOTAL_MW = 354;
  for (let y = 2028; y <= 2035; y++) {
    const fr = componentMwAt('izdr', y) + componentMwAt('gagap', y);
    if (Math.abs(fr - FAST_RESPONSE_TOTAL_MW) > 1e-9) {
      fail(`izdr + gagap = ${fr} MW at ${y}, must be a flat ${FAST_RESPONSE_TOTAL_MW} (table 20, p.127)`);
    }
  }

  // 6. Cross-document validation: the FNA's own FCR row equals the Baltic FCR
  //    forecast's LT sub-series. Two independently authored documents.
  const ltFcr = byId.get('fcr').country_split_mw.LT;
  for (const y of FNA_YEARS) {
    const fna = byId.get('fna_fcr').series[y];
    if (fna !== ltFcr[y]) fail(`FCR cross-check ${y}: FNA says ${fna} MW, Baltic forecast LT row says ${ltFcr[y]}`);
  }
  const split = byId.get('fcr').country_split_mw;
  for (let y = 2026; y <= 2035; y++) {
    const s = split.EE[y] + split.LV[y] + split.LT[y];
    if (s !== byId.get('fcr').series[y]) fail(`FCR ${y}: EE+LV+LT = ${s} ≠ Baltic total ${byId.get('fcr').series[y]}`);
  }

  // 7. Published years are reproduced exactly by the derivation, whatever the mode.
  for (const c of COMPONENTS) {
    for (const y of publishedYears(c)) {
      const got = componentMwAt(c.id, y);
      if (Math.abs(got - c.series[y]) > 1e-9) fail(`${c.id}: componentMwAt(${y}) = ${got}, series says ${c.series[y]}`);
    }
  }

  // 8. Excluded readings are inert: none may carry a treatment.
  for (const e of EXCLUDED_READINGS) {
    if (!e.do_not_use || !e.reason) fail(`excluded reading "${e.id}" must carry do_not_use and a reason`);
    if (byId.has(e.id)) fail(`excluded reading "${e.id}" must not also be a component`);
  }

  if (errs.length) throw new Error(`demand-forecast validation failed:\n  - ${errs.join('\n  - ')}`);
  return true;
}

// ── Litgrid's own LT build-out, for the named client scenario ──────────────

/**
 * Litgrid's L TrSc scenario-assumed installed BESS capacity in Lithuania —
 * table 41, p.145, row "Esamos EEKĮ apimtys vertinime".
 *
 * Used ONLY by the "Litgrid L TrSc basis" client scenario, AS PUBLISHED: no
 * realisation rate, no haircut, no S-curve of ours laid over it. The scenario's
 * entire value in a client conversation is that it is the TSO's own number, and
 * layering KKME's build-out assumptions on top would make it neither ours nor
 * theirs.
 *
 * Context for anyone comparing it against KKME's Central case: at 2028 our
 * Central (≈2 401 MW LT) sits between this series (1 260 MW) and Litgrid's
 * developer-connection-indication figure (3 120 MW). From 2030 our Central runs
 * 2.0–2.6× ABOVE this series, so Central is already the more supply-pessimistic
 * — i.e. more revenue-conservative — of the two. The gap changes sign, which is
 * why Central was not recalibrated onto this basis.
 *
 * Two other Litgrid supply views exist and are deliberately NOT used here: the
 * minimum needed to cover needs (899 → 1 296 MW, table 41) and the 3.12 GW
 * connection-indication point (text, p.11/p.150 — a single year, not a series).
 * A fourth figure, "4.76 GW of developer connection indications", circulates in
 * secondary coverage; it appears only in a raster chart and could not be
 * verified against the document text, so it is not recorded as data.
 */
export const LITGRID_LT_BESS_MW = Object.freeze({ 2028: 1260, 2030: 2115, 2033: 2428, 2035: 2652 });

export const LITGRID_LT_BESS_META = Object.freeze({
  source: 'litgrid-fna-2026',
  location: 'table 41, p.145 — "Esamos EEKĮ apimtys vertinime"',
  basis: 'as-published',
  interpolation: 'linear',
  trend_basis: 'last-segment',
  trend_reason:
    'The series decelerates hard — 29.5 %/yr over 2028-2030, then 4.7 % and 4.5 % — because ' +
    'the early years absorb a build-out surge that is already contracted. A full-range CAGR ' +
    '(11.2 %/yr) would extrapolate that surge to 2048 and produce a number Litgrid does not ' +
    'imply. The last published segment is the honest continuation.',
  scope_note:
    'Lithuania only. The scenario replaces the LT share of projected supply and leaves EE and ' +
    'LV on KKME\'s own projection, because Litgrid forecasts Lithuania and nothing else. ' +
    'Kruonis PSP remains additive: this series is EEKĮ (battery storage), which excludes it.',
});

/**
 * Litgrid's LT installed BESS in `year`, as published.
 * Returns null before the first published year — the document says nothing
 * about 2026-2027, and the caller must fall back rather than be handed a guess.
 */
export function litgridLtSupplyMw(year) {
  const ys = Object.keys(LITGRID_LT_BESS_MW).map(Number).sort((a, b) => a - b);
  const first = ys[0];
  const last = ys[ys.length - 1];
  if (year < first) return null;
  if (year >= last) {
    if (year === last) return LITGRID_LT_BESS_MW[last];
    const prev = ys[ys.length - 2];
    const seg = Math.pow(LITGRID_LT_BESS_MW[last] / LITGRID_LT_BESS_MW[prev], 1 / (last - prev)) - 1;
    return round1(LITGRID_LT_BESS_MW[last] * Math.pow(1 + seg, year - last));
  }
  let lo = first;
  let hi = last;
  for (const y of ys) {
    if (y <= year) lo = y;
    if (y >= year) { hi = y; break; }
  }
  if (lo === hi) return LITGRID_LT_BESS_MW[lo];
  const t = (year - lo) / (hi - lo);
  return round1(LITGRID_LT_BESS_MW[lo] + (LITGRID_LT_BESS_MW[hi] - LITGRID_LT_BESS_MW[lo]) * t);
}

/**
 * The document's own arithmetic slip, recorded rather than silently adopted.
 *
 * Table 1 (p.10) and table 48 (p.152) both print 1519 MWh as the 2028 total.
 * The components they list sum to 1510 (982 + 28 + 200 + 154 + 146). The other
 * three years reconcile exactly. Same error in both tables, so it is one
 * upstream slip and not a transcription artefact. We store components and
 * compute totals; this records the divergence for anyone reconciling against a
 * printed copy.
 */
export const DOCUMENT_DISCREPANCIES = Object.freeze([
  Object.freeze({
    source: 'litgrid-fna-2026',
    location: 'table 1 p.10 and table 48 p.152 — MWh total column, 2028',
    printed: 1519,
    components_sum: 1510,
    delta: 9,
    resolution: 'components are canonical; the total is computed, never read',
  }),
]);

const DEMAND_FORECAST = {
  SOURCES, COMPONENTS, EXCLUDED_READINGS, VERSION, HISTORY,
  LITGRID_LT_BESS_MW, LITGRID_LT_BESS_META, litgridLtSupplyMw,
  INTERPOLATION_POLICY, EXTRAPOLATION_POLICY, DOCUMENT_DISCREPANCIES,
  addressableDemandMw, absorptionMw, productDemandMw, productDemandMap,
  componentMwAt, componentCagr, publishedYears, demandRow, validateDemandForecast,
};

export default DEMAND_FORECAST;
