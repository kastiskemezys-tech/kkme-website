/**
 * Phase 43 — evidence probe for the numerics audit.
 *
 * Every verdict in the audit table has to carry a command whose OUTPUT is the
 * evidence. This is that command. It exercises the real engine against the real
 * frozen KV fixture; nothing here is a restatement of the source.
 */
import { loadEngine } from '../tools/consultancy/engine.mjs';
import { loadFixtureKV, publicParamMatrix } from '../tools/consultancy/regression-reference.mjs';

const engine = await loadEngine();
const kv = loadFixtureKV();
const out = (s) => console.log(s);

out('═══ §3 · IRR sentinel: what the 54 public configurations actually emit ═══');
const irrRows = [];
for (const { id, params } of publicParamMatrix()) {
  const r = engine.computeRevenueV7(params, kv);
  irrRows.push({ id, irr: r.project_irr, status: r.irr_status, eq: r.equity_irr, dscr: r.min_dscr });
}
const nullIrr = irrRows.filter((r) => r.irr === null);
const zeroIrr = irrRows.filter((r) => r.irr === 0);
const negIrr = irrRows.filter((r) => typeof r.irr === 'number' && r.irr < 0);
out(`  n=${irrRows.length} · null=${nullIrr.length} · exactly 0=${zeroIrr.length} · negative=${negIrr.length}`);
out(`  statuses: ${JSON.stringify([...new Set(irrRows.map((r) => r.status))])}`);
out(`  min irr=${Math.min(...irrRows.filter((r) => r.irr !== null).map((r) => r.irr))} max=${Math.max(...irrRows.filter((r) => r.irr !== null).map((r) => r.irr))}`);
for (const r of irrRows.filter((r) => r.irr === null || r.irr === 0 || r.status === 'uneconomic').slice(0, 6)) {
  out(`  · ${r.id}: irr=${r.irr} status=${r.status} equity_irr=${r.eq}`);
}

out('');
out('═══ §3 · IRR solver behaviour on cash flows the public matrix never reaches ═══');
// The public matrix is profitable everywhere, so it cannot exercise the
// uneconomic branch. Drive the solver directly with hand-built streams whose
// correct answers are known analytically.
const { calcIRRForAudit } = engine;
if (typeof calcIRRForAudit === 'function') {
  const cases = [
    { label: 'conventional, IRR = 10% exactly', cf: [-1000, 1100], want: '0.10' },
    { label: 'all-negative after outlay (no root above -100%)', cf: [-1000, -100, -100], want: 'sentinel or negative' },
    { label: 'never turns negative (IRR > 200%)', cf: [-100, 10000, 10000], want: '>2.0 or capped' },
    { label: 'two sign changes (non-conventional)', cf: [-1000, 3000, -2200], want: 'one of two real roots' },
    { label: 'all zero', cf: [0, 0, 0], want: 'undefined — must not read as a number' },
  ];
  for (const c of cases) out(`  · ${c.label}: calcIRR = ${calcIRRForAudit(c.cf)}   (expect ${c.want})`);
} else {
  out('  calcIRR is not exported — cannot drive it directly. See §3 verdict.');
}

out('');
out('═══ §3 · rounding: arithmetic performed on already-rounded values ═══');
// The paid-for example is dividing two already-rounded percentages and getting
// 2.04 where the unrounded quotient is 2.00.
const r = engine.computeRevenueV7({ mw: 50, dur_h: 4, capex_kwh: 164, cod_year: 2028, scenario: 'base', grant_pct: 0 }, kv);
const splits = r.revenue_splits_pct ?? r.totals?.splits_pct ?? null;
out(`  revenue split percentages present: ${splits ? JSON.stringify(splits) : 'not on this payload'}`);
if (splits) {
  const vals = Object.values(splits).filter((v) => typeof v === 'number');
  out(`  sum of published split percentages = ${vals.reduce((a, b) => a + b, 0)} (100 exactly? ${vals.reduce((a, b) => a + b, 0) === 100})`);
}

out('');
out('═══ §5 · numeric hygiene: NaN / Infinity anywhere in a published payload ═══');
let bad = 0;
const walk = (v, path, id) => {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) { out(`  NON-FINITE ${id} ${path} = ${v}`); bad++; }
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, id));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, id);
};
for (const { id, params } of publicParamMatrix()) walk(engine.computeRevenueV7(params, kv), '', id);
out(`  non-finite numbers across all 54 published payloads: ${bad}`);

out('');
out('═══ §2 · year length: does any annual figure change on a leap year? ═══');
const leap = engine.computeRevenueV7({ mw: 50, dur_h: 4, capex_kwh: 164, cod_year: 2028, scenario: 'base', grant_pct: 0 }, kv);
const nonLeap = engine.computeRevenueV7({ mw: 50, dur_h: 4, capex_kwh: 164, cod_year: 2027, scenario: 'base', grant_pct: 0 }, kv);
out(`  cod_year 2028 (leap) gross_revenue_y1 = ${leap.gross_revenue_y1}`);
out(`  cod_year 2027 (non-leap) gross_revenue_y1 = ${nonLeap.gross_revenue_y1}`);
out('  (a difference here is COD-year escalation, not day count — see the §2 verdict for the separation)');
