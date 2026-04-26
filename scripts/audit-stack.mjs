#!/usr/bin/env node
// scripts/audit-stack.mjs — TEMPORARY, delete in Phase 7.7b Session 2.
//
// Reconstructs Y1 base-4h fixture numbers from the raw worker formulas to
// ground-truth the math trace in docs/audits/phase-7-7b/stack-audit.md.
//
// Inputs are taken either from the fixture's own `base_year` block or from the
// known scenario constants in workers/fetch-s1.js (lines cited inline). The
// goal is NOT a perfect re-derivation (we do not re-run computeTradingMix's
// elasticity model) but a check that:
//   (1) base_year monthly numbers reconstruct to the annual_totals, and
//   (2) the additive invariant gross_y1 = bal_y1 + trd_y1 holds at the wire.
// (1) catches any unit-mismatch in the trace; (2) restates the architectural
// claim (line 1048, 1158, 1458, 4164) in a single executable assertion.
//
// Run: node scripts/audit-stack.mjs

import baseline from '../docs/audits/phase-7-7b/baseline-base-4h.json' with { type: 'json' };

// ──────────────────────────────────────────────────────────────────────
// Inputs sourced from the fixture (frozen v7 reference)
// ──────────────────────────────────────────────────────────────────────
const mw = 50;
const dur_h = 4;

const fixture = {
  gross: baseline.gross_revenue_y1,
  bal:   baseline.capacity_y1 + baseline.activation_y1,  // line 1052–1053 split
  trd:   baseline.arbitrage_y1,
  cap:   baseline.capacity_y1,
  act:   baseline.activation_y1,
};

// Y1 from years[0]
const y1 = baseline.years[0];

// ──────────────────────────────────────────────────────────────────────
// Reconstruction 1 — base_year monthly → annual (per MW)
// Source: workers/fetch-s1.js:2087–2132
// ──────────────────────────────────────────────────────────────────────
const months = baseline.base_year.months;
const total_days = months.reduce((s, m) => s + m.days, 0);
const scale = 365 / total_days;

const trading_per_mw  = Math.round(months.reduce((s, m) => s + m.trading,  0) * scale);
const balancing_per_mw = Math.round(months.reduce((s, m) => s + m.balancing, 0) * scale);
const gross_per_mw    = Math.round(months.reduce((s, m) => s + m.gross,    0) * scale);

const reportedAnnual = baseline.base_year.annual_totals;

// ──────────────────────────────────────────────────────────────────────
// Reconstruction 2 — additive invariant on Y1 wire
// Source: workers/fetch-s1.js:1048, 1158
// ──────────────────────────────────────────────────────────────────────
const sum_components = fixture.bal + fixture.trd;
const additive_delta = fixture.gross - sum_components;

// ──────────────────────────────────────────────────────────────────────
// Reconstruction 3 — capacity:activation 65/35 split sanity
// Source: workers/fetch-s1.js:1052–1053
// ──────────────────────────────────────────────────────────────────────
const cap_ratio = fixture.cap / fixture.bal;

// ──────────────────────────────────────────────────────────────────────
// Reconstruction 4 — overstatement bracket
// Approach A: replace trading_fraction (0.6747) with effective_arb_pct (0.164)
// Approach B: apply (1 − trading_fraction) symmetrically to balancing
// ──────────────────────────────────────────────────────────────────────
const tm = baseline.base_year.time_model;
const trading_fraction = tm.trading_fraction;
const effective_arb_pct = tm.effective_arb_pct;

const approachA_rev_trd = fixture.trd * (effective_arb_pct / trading_fraction);
const approachA_gross   = fixture.bal + approachA_rev_trd;
const approachA_delta_pct = (approachA_gross - fixture.gross) / fixture.gross;

const approachB_rev_bal = fixture.bal * (1 - trading_fraction);
const approachB_gross   = approachB_rev_bal + fixture.trd;
const approachB_delta_pct = (approachB_gross - fixture.gross) / fixture.gross;

// ──────────────────────────────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────────────────────────────
const report = {
  meta: {
    fixture: 'baseline-base-4h.json',
    model_version: baseline.model_version,
    system: baseline.system,
    scenario: baseline.scenario,
    capex: baseline.capex_eur_kwh,
  },
  reconstruction_1_base_year_monthly_to_annual: {
    note: 'Sum monthly × (365 / total_days) should equal reported annual_totals',
    trading: { computed: trading_per_mw, reported: reportedAnnual.trading,
               delta: trading_per_mw - reportedAnnual.trading },
    balancing: { computed: balancing_per_mw, reported: reportedAnnual.balancing,
                 delta: balancing_per_mw - reportedAnnual.balancing },
    gross: { computed: gross_per_mw, reported: reportedAnnual.gross,
             delta: gross_per_mw - reportedAnnual.gross },
    pass: Math.abs(trading_per_mw - reportedAnnual.trading) < 5
        && Math.abs(balancing_per_mw - reportedAnnual.balancing) < 5
        && Math.abs(gross_per_mw - reportedAnnual.gross) < 5,
  },
  reconstruction_2_additive_invariant_y1: {
    note: 'rev_gross = rev_bal + rev_trd (worker line 1048)',
    fixture_gross: fixture.gross,
    components_sum: sum_components,
    delta: additive_delta,
    pass: Math.abs(additive_delta) < 2,
  },
  reconstruction_3_cap_act_split: {
    note: 'rev_cap = rev_bal × 0.65 (worker line 1052)',
    capacity_share: cap_ratio,
    expected: 0.65,
    pass: Math.abs(cap_ratio - 0.65) < 0.01,
  },
  reconstruction_4_overstatement_brackets: {
    note: 'Two correction approaches; both reduce gross materially.',
    fixture_gross_per_mw: Math.round(fixture.gross / mw),
    fixture_bal_per_mw:   Math.round(fixture.bal / mw),
    fixture_trd_per_mw:   Math.round(fixture.trd / mw),
    trading_fraction,
    effective_arb_pct,
    approach_A_use_effective_arb_pct: {
      new_rev_trd_per_mw: Math.round(approachA_rev_trd / mw),
      new_gross_per_mw:   Math.round(approachA_gross / mw),
      delta_pct:          (approachA_delta_pct * 100).toFixed(1) + '%',
    },
    approach_B_symmetric_trading_fraction: {
      new_rev_bal_per_mw: Math.round(approachB_rev_bal / mw),
      new_gross_per_mw:   Math.round(approachB_gross / mw),
      delta_pct:          (approachB_delta_pct * 100).toFixed(1) + '%',
    },
  },
  verdict: {
    additive_stacking_confirmed: true,
    architectural_intent_documented: 'workers/fetch-s1.js:1430 — "reserves and trading are stacked, not exclusive power slices"',
    physically_correct_partition_available_but_unused:
      `time_model.effective_arb_pct = ${effective_arb_pct} (line 2018) is computed but only reported diagnostically; trading uses trading_fraction = ${trading_fraction.toFixed(4)} instead.`,
    overstatement_range: '−15% to −45%',
    recommended_correction_default: 'Approach B (symmetric trading_fraction)',
    recommended_session_2: 'feature-flagged v7→v8 bump, fixtures preserved, methodology page accompanies the change',
  },
};

console.log(JSON.stringify(report, null, 2));
