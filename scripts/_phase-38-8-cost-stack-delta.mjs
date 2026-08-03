/**
 * Phase 38.8 — five-way decomposed delta on the route-to-market cost stack.
 *
 * The five defects are independent toggles, so each one's contribution is
 * measured on its own rather than arriving blended. Reported two ways:
 *
 *   MARGINAL   each layer's own effect, holding the others off
 *   CUMULATIVE layers applied in waterfall order, so the steps sum to the total
 *
 * Both matter: marginal says how big each defect is, cumulative says what the
 * stack does together, and they differ because the fee base depends on the
 * lines deducted before it.
 *
 * One frozen KV fixture, one process, all modes from the same module.
 */
import { publicParamMatrix, loadFixtureKV } from '../tools/consultancy/regression-reference.mjs';
const mod = await import('../workers/fetch-s1.js');
const kv = loadFixtureKV();

const LAYERS = ['fee_rate', 'fee_base', 'brp', 'pmc', 'aux'];
const LABEL = {
  fee_rate: 'fee rate  0.10-0.13 -> banded 8%',
  fee_base: 'fee base  gross -> owner net share',
  brp:      'BRP       flat EUR180-210k -> volume',
  pmc:      'PMC       Nord Pool, both legs',
  aux:      'AUX       standby load, idle hours',
};
const METRICS = [
  ['gross_revenue_y1', 'gross Y1', 0, v => v],
  ['net_revenue_y1',   'rev_net Y1', 0, v => v],
  ['project_irr',      'project IRR', 2, v => v * 100],
  ['equity_irr',       'equity IRR', 2, v => v * 100],
  ['min_dscr',         'min DSCR', 2, v => v],
  ['lcos_eur_mwh',     'LCOS', 1, v => v],
  ['npv_project',      'NPV project', 0, v => v],
];

const run = (params, extra) => mod.computeRevenueV7({ ...params, ...extra }, kv);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const f = (v, dp) => (v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const sg = (v, dp) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(dp));

const MATRIX = publicParamMatrix();
const REF = MATRIX.find(m => m.id === 'dur=4h capex=mid cod=2027 scenario=base') || MATRIX[0];

console.log(`\n=== Phase 38.8 — cost-stack delta, ${MATRIX.length} public configurations ===`);
console.log(`Baseline = the CURRENT engine (MW partition already shipped, cost stack off).\n`);

// ── Reference config, marginal then cumulative ─────────────────────────────
const base = run(REF.params, {});
console.log(`REFERENCE — ${REF.id}\n`);
console.log('MARGINAL (each layer alone)');
console.log('  layer                                  gross Y1     rev_net Y1   IRR pp   DSCR');
for (const L of LAYERS) {
  const r = run(REF.params, { cost_stack: L });
  console.log(`  ${LABEL[L].padEnd(38)} ${f(num(r.gross_revenue_y1), 0).padStart(11)}  ${f(num(r.net_revenue_y1), 0).padStart(12)}  ${sg((num(r.project_irr) - num(base.project_irr)) * 100, 2).padStart(6)}  ${f(num(r.min_dscr), 2).padStart(5)}`);
}
console.log('\nCUMULATIVE (waterfall order; steps sum to the total)');
console.log('  after adding                           rev_net Y1     IRR %    d(IRR) pp    DSCR');
let prevIrr = num(base.project_irr) * 100;
console.log(`  ${'(baseline, cost stack off)'.padEnd(38)} ${f(num(base.net_revenue_y1), 0).padStart(11)}  ${f(prevIrr, 2).padStart(7)}        —      ${f(num(base.min_dscr), 2)}`);
for (let i = 0; i < LAYERS.length; i++) {
  const on = LAYERS.slice(0, i + 1);
  const r = run(REF.params, { cost_stack: on });
  const irr = num(r.project_irr) * 100;
  console.log(`  ${LABEL[LAYERS[i]].padEnd(38)} ${f(num(r.net_revenue_y1), 0).padStart(11)}  ${f(irr, 2).padStart(7)}   ${sg(irr - prevIrr, 2).padStart(7)}      ${f(num(r.min_dscr), 2)}`);
  prevIrr = irr;
}

const all = run(REF.params, { cost_stack: 'all' });
console.log('\nREFERENCE, all five layers, full metric set');
console.log('  metric              baseline        with stack        delta');
for (const [k, label, dp, xf] of METRICS) {
  const a = num(base[k]), b = num(all[k]);
  const d = (a == null || b == null) ? null
    : (k.endsWith('_irr') ? `${sg(xf(b) - xf(a), 2)} pp` : `${sg((b - a) / Math.abs(a) * 100, 1)}%`);
  console.log(`  ${label.padEnd(18)} ${f(a == null ? null : xf(a), dp).padStart(13)} ${f(b == null ? null : xf(b), dp).padStart(16)}   ${d ?? '—'}`);
}

// ── All 54 ────────────────────────────────────────────────────────────────
console.log(`\n\nALL ${MATRIX.length} CONFIGURATIONS — marginal IRR contribution per layer (pp)\n`);
console.log('  layer                                    min     median      max');
for (const L of LAYERS) {
  const d = MATRIX.map(({ params }) => {
    const a = num(run(params, {}).project_irr), b = num(run(params, { cost_stack: L }).project_irr);
    return (a == null || b == null) ? null : (b - a) * 100;
  }).filter(v => v != null);
  console.log(`  ${LABEL[L].padEnd(38)} ${sg(Math.min(...d), 2).padStart(7)} ${sg(med(d), 2).padStart(10)} ${sg(Math.max(...d), 2).padStart(8)}`);
}
console.log('\n  all five together');
for (const [k, label, , xf] of METRICS) {
  const d = MATRIX.map(({ params }) => {
    const a = num(run(params, {})[k]), b = num(run(params, { cost_stack: 'all' })[k]);
    if (a == null || b == null || a === 0) return null;
    return k.endsWith('_irr') ? (xf(b) - xf(a)) : ((b - a) / Math.abs(a) * 100);
  }).filter(v => v != null);
  const u = k.endsWith('_irr') ? 'pp' : '%';
  console.log(`  ${(label + ' (' + u + ')').padEnd(38)} ${sg(Math.min(...d), 2).padStart(7)} ${sg(med(d), 2).padStart(10)} ${sg(Math.max(...d), 2).padStart(8)}`);
}

// ── Combined position with the partition ──────────────────────────────────
console.log('\n\nCOMBINED POSITION — the two corrections together\n');
console.log('  Pre-38.6a  = MW partition OFF, cost stack OFF   (the world before today)');
console.log('  Shipped    = MW partition ON,  cost stack OFF   (live right now)');
console.log('  Proposed   = MW partition ON,  cost stack ON    (this phase)\n');
console.log('  metric                pre-38.6a       shipped      proposed   net vs pre');
for (const [k, label, dp, xf] of METRICS) {
  const pre = num(run(REF.params, { mw_partition: 'current' })[k]);
  const shp = num(run(REF.params, {})[k]);
  const prp = num(run(REF.params, { cost_stack: 'all' })[k]);
  const d = (pre == null || prp == null) ? null
    : (k.endsWith('_irr') ? `${sg(xf(prp) - xf(pre), 2)} pp` : `${sg((prp - pre) / Math.abs(pre) * 100, 1)}%`);
  console.log(`  ${label.padEnd(18)} ${f(pre == null ? null : xf(pre), dp).padStart(13)} ${f(shp == null ? null : xf(shp), dp).padStart(13)} ${f(prp == null ? null : xf(prp), dp).padStart(13)}   ${d ?? '—'}`);
}
const irrPre = MATRIX.map(({ params }) => num(run(params, { mw_partition: 'current' }).project_irr) * 100);
const irrPrp = MATRIX.map(({ params }) => num(run(params, { cost_stack: 'all' }).project_irr) * 100);
const netd = irrPrp.map((v, i) => v - irrPre[i]).filter(v => Number.isFinite(v));
console.log(`\n  Across all ${MATRIX.length}: net project-IRR move vs the pre-38.6a world`);
console.log(`    median ${sg(med(netd), 2)} pp   ·   range ${sg(Math.min(...netd), 2)} .. ${sg(Math.max(...netd), 2)} pp`);
console.log(`    still WORSE than pre-38.6a in ${netd.filter(v => v < -0.005).length}/${MATRIX.length} configurations`);
