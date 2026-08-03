/**
 * Phase 38.6 — three-column delta: current / unit-fix only / full partition.
 *
 * The two effects are separable BY CONSTRUCTION: 'unit_fix' changes only the
 * dimensional error at the two DA energy seams; 'partition' adds the missing
 * day-ahead term to the energy identity. Running both against ONE frozen KV
 * fixture, in ONE process, with all three engine modes loaded from the SAME
 * module, means no worktree, no stash and no cross-process drift
 * (C6 + engine-baseline-one-process).
 *
 * Usage: node scripts/_phase-38-6-partition-delta.mjs [--json <path>]
 */
import { writeFileSync } from 'node:fs';
import { publicParamMatrix, loadFixtureKV } from '../tools/consultancy/regression-reference.mjs';

const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json') >= 0 ? argv[argv.indexOf('--json') + 1] : null;

const mod = await import('../workers/fetch-s1.js');
const kv = loadFixtureKV();

const METRICS = [
  ['gross_revenue_y1', 'gross Y1 EUR',   0],
  ['project_irr',      'project IRR %',  2, v => v * 100],
  ['equity_irr',       'equity IRR %',   2, v => v * 100],
  ['min_dscr',         'min DSCR',       2],
  ['lcos_eur_mwh',     'LCOS EUR/MWh',   1],
  ['npv_project',      'NPV project EUR',0],
  ['cycles_per_year',  'cycles/yr',      0],
  ['arbitrage_pct',    'DA share of gross %', 1, v => v * 100],
];

const MODES = ['current', 'unit_fix', 'partition'];

function run(params, mode) {
  return mod.computeRevenueV7({ ...params, mw_partition: mode }, kv);
}

const rows = [];
for (const { id, params } of publicParamMatrix()) {
  const r = Object.fromEntries(MODES.map(m => [m, run(params, m)]));
  rows.push({ id, params, r });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmt = (v, dp) => (v == null ? '—' : v.toLocaleString('en-US',
  { minimumFractionDigits: dp, maximumFractionDigits: dp }));

console.log(`\n=== Phase 38.6 — partition delta, ${rows.length} public configurations ===`);
console.log(`KV fixture: tools/consultancy/fixtures/regression-kv.json\n`);

// ── Reference configuration in full ────────────────────────────────────────
const REF = 'dur=4h capex=mid cod=2027 scenario=base';
const ref = rows.find(x => x.id === REF) || rows[0];
console.log(`REFERENCE CONFIGURATION — ${ref.id}\n`);
console.log('  metric                   current      unit-fix only   full partition   part vs cur');
for (const [key, label, dp, xf = (v => v)] of METRICS) {
  const vals = MODES.map(m => { const v = num(ref.r[m][key]); return v == null ? null : xf(v); });
  const d = vals[0] && vals[2] != null ? ((vals[2] - vals[0]) / Math.abs(vals[0]) * 100) : null;
  console.log(`  ${label.padEnd(22)} ${fmt(vals[0], dp).padStart(12)} ${fmt(vals[1], dp).padStart(15)} ${fmt(vals[2], dp).padStart(16)}   ${d == null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(1) + '%'}`);
}

// ── 54-config summary ──────────────────────────────────────────────────────
console.log(`\n\nALL ${rows.length} CONFIGURATIONS — distribution of the change vs current\n`);
console.log('  metric                  |------ unit-fix only ------|  |------ full partition -----|');
console.log('                             min      median      max      min      median      max');
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const summary = {};
for (const [key, label, , xf = (v => v)] of METRICS) {
  const cells = [];
  for (const mode of ['unit_fix', 'partition']) {
    const deltas = rows.map(x => {
      const a = num(x.r.current[key]), b = num(x.r[mode][key]);
      if (a == null || b == null) return null;
      // Absolute-point delta for percentage-like metrics, % change otherwise.
      return key.endsWith('_irr') || key === 'arbitrage_pct'
        ? (xf(b) - xf(a)) : (a === 0 ? null : (b - a) / Math.abs(a) * 100);
    }).filter(v => v != null);
    cells.push(deltas.length ? [Math.min(...deltas), median(deltas), Math.max(...deltas)] : null);
  }
  summary[key] = cells;
  const unit = key.endsWith('_irr') || key === 'arbitrage_pct' ? 'pp' : '%';
  const s = cells.map(c => c ? c.map(v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`).map(t => t.padStart(8)).join('') : '     —       —       —').join('  ');
  console.log(`  ${(label + ' (' + unit + ')').padEnd(24)}${s}`);
}

// ── Direction, stated plainly ──────────────────────────────────────────────
// `project_irr` carries a SENTINEL: when a project cannot return the capital at
// all, `irr_status` becomes 'uneconomic' and the IRR reports 0.00 rather than a
// negative root. Three stress configurations move from a real -3.0..-3.5 % to
// that sentinel 0.00, which a naive delta reads as an IMPROVEMENT. It is the
// opposite. They are counted as worse below and excluded from the range.
const cls = rows.map(x => {
  const a = num(x.r.current.project_irr) * 100, b = num(x.r.partition.project_irr) * 100;
  const toSentinel = x.r.partition.irr_status === 'uneconomic'
    && x.r.current.irr_status !== 'uneconomic';
  return { id: x.id, a, b, d: b - a, toSentinel };
});
const real = cls.filter(c => !c.toSentinel);
const down = real.filter(c => c.d < -0.005).length + cls.filter(c => c.toSentinel).length;
console.log(`\n  project IRR is WORSE in ${down}/${rows.length} configurations under the partition.`);
console.log(`     ...of which ${cls.filter(c => c.toSentinel).length} cross from a negative IRR into 'uneconomic'`);
for (const c of cls.filter(c => c.toSentinel)) {
  console.log(`        ${c.id}: ${c.a.toFixed(2)}% -> uneconomic (reported as 0.00, NOT an improvement)`);
}
console.log(`  median move, excluding the sentinel crossings: ${median(real.map(c => c.d)).toFixed(2)} pp`);
console.log(`  range: ${Math.min(...real.map(c => c.d)).toFixed(2)} .. ${Math.max(...real.map(c => c.d)).toFixed(2)} pp`);
const belowOne = rows.filter(x => num(x.r.current.min_dscr) >= 1
  && num(x.r.partition.min_dscr) < 1).length;
console.log(`  min DSCR crosses BELOW 1.00 in ${belowOne}/${rows.length} configurations.`);

// ── Separability check ─────────────────────────────────────────────────────
const VOL = new Set(['timestamp', 'mw_partition']);  // mw_partition is the mode's own name
const strip = o => JSON.stringify(o, (k, v) => (VOL.has(k) ? undefined : v));
const sameCount = rows.filter(x => strip(x.r.unit_fix) === strip(x.r.partition)).length;
console.log(`\n  unit-fix and full partition payloads are IDENTICAL (timestamp excluded) in ${sameCount}/${rows.length}.`);
if (sameCount === rows.length) {
  console.log('  => THE THIRD COLUMN IS EMPTY. The energy identity\'s new day-ahead term');
  console.log('     never binds at 2h or 4h: reserves need 0.518 MWh/MW, DA adds');
  console.log('     0.95 x 0.115 x dur_h (0.22 at 2h, 0.44 at 4h), against ~1.8-3.6 usable.');
  console.log('     So the ENTIRE measured partition effect is the unit fix. Stated, not hidden.');
}

if (jsonAt) {
  writeFileSync(jsonAt, JSON.stringify({ rows: rows.map(x => ({ id: x.id,
    ...Object.fromEntries(MODES.map(m => [m, Object.fromEntries(METRICS.map(([k]) => [k, x.r[m][k]]))])) })), summary }, null, 1));
  console.log(`\n  wrote ${jsonAt}`);
}
