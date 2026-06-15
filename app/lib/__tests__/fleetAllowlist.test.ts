// Phase 33.A — Baltic allowlist + contradiction-flag ingest gate.
//
// Root cause (Phase 33 Pause A): /s4.projects carried 26 non-Baltic polluters
// (Meralco PH 1290 MW + CL/SA/AU/MD/AT/BG/HU/RO/SE/PL entries + 8 blank-country
// ESN-scraper rows), all mislabeled tso:"Litgrid". The POST /s2/fleet handler
// stored whatever kkme_sync POSTed with no country gate. Belt-and-suspenders fix:
// the worker is the last hop before the public map, so it gates ingest itself.
//
// These tests pin filterFleetEntries — the single-source gate read by the POST
// handler — so the allowlist and HIGH-flag drop can't silently regress.
import { describe, it, expect } from 'vitest';
import {
  BALTIC_COUNTRIES,
  filterFleetEntries,
} from '../../../workers/fetch-s1.js';

describe('BALTIC_COUNTRIES allowlist', () => {
  it('admits exactly LT/LV/EE', () => {
    expect(BALTIC_COUNTRIES.has('LT')).toBe(true);
    expect(BALTIC_COUNTRIES.has('LV')).toBe(true);
    expect(BALTIC_COUNTRIES.has('EE')).toBe(true);
  });
  it('rejects foreign + blank country codes', () => {
    for (const c of ['PH', 'CL', 'SA', 'PL', 'RU', 'BY', '', undefined]) {
      expect(BALTIC_COUNTRIES.has(c as string)).toBe(false);
    }
  });
});

describe('filterFleetEntries — country allowlist', () => {
  // The exact incident shape: a batch of LT + PH + CL entries.
  const payload = [
    { id: 'lt-1', name: 'LT BESS A', country: 'LT', mw: 50, mwh: 100, status: 'announced' },
    { id: 'ph-1', name: 'Meralco Terra Solar', country: '', mw: 1290, mwh: 2580, status: 'announced' },
    { id: 'cl-1', name: 'San Andrés BESS II', country: 'CL', mw: 42, mwh: 84, status: 'announced' },
  ];

  it('keeps the LT entry, drops PH (blank) and CL — dropped count = 2', () => {
    const { accepted, dropped } = filterFleetEntries(payload);
    expect(accepted.map(e => e.id)).toEqual(['lt-1']);
    expect(dropped).toHaveLength(2);
    expect(dropped.map(d => d.id).sort()).toEqual(['cl-1', 'ph-1']);
  });

  it('tags every drop with the non_baltic reason', () => {
    const { dropped } = filterFleetEntries(payload);
    expect(dropped.every(d => d.reason === 'non_baltic')).toBe(true);
  });

  it('admits LV and EE alongside LT', () => {
    const { accepted } = filterFleetEntries([
      { id: 'lv-1', country: 'LV', mw: 20, mwh: 40, status: 'announced' },
      { id: 'ee-1', country: 'EE', mw: 30, mwh: 60, status: 'announced' },
    ]);
    expect(accepted.map(e => e.id)).toEqual(['lv-1', 'ee-1']);
  });

  it('does not mutate the input entries', () => {
    const input = [{ id: 'lt-1', country: 'LT', mw: 50, mwh: 100, status: 'announced' }];
    filterFleetEntries(input);
    expect(input[0]).not.toHaveProperty('_contradiction_flags');
  });
});

describe('filterFleetEntries — HIGH-severity contradiction drop', () => {
  it('drops a Baltic entry with a HIGH duration flag (C-07)', () => {
    // 50 MW / 1000 MWh = 20h, outside the 0.5–12h range → C-07 HIGH.
    const { accepted, dropped } = filterFleetEntries([
      { id: 'lt-ok', country: 'LT', mw: 50, mwh: 100, status: 'announced' },
      { id: 'lt-bad-dur', country: 'LT', mw: 50, mwh: 1000, status: 'announced' },
    ]);
    expect(accepted.map(e => e.id)).toEqual(['lt-ok']);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe('lt-bad-dur');
    expect(dropped[0].reason).toBe('high_severity_flag');
  });

  it('drops a Baltic operational entry lacking TSO evidence (C-01 HIGH)', () => {
    const { accepted, dropped } = filterFleetEntries([
      { id: 'lt-op-notso', country: 'LT', mw: 50, mwh: 100, status: 'operational', source: 'esn · some blog' },
    ]);
    expect(accepted).toHaveLength(0);
    expect(dropped[0].reason).toBe('high_severity_flag');
  });

  it('keeps a Baltic entry whose only flag is MEDIUM (C-11, MW>500)', () => {
    // MW=600 trips C-11 MEDIUM but not HIGH → kept, not dropped.
    const { accepted, dropped } = filterFleetEntries([
      { id: 'lt-big', country: 'LT', mw: 600, mwh: 1200, status: 'announced' },
    ]);
    expect(accepted.map(e => e.id)).toEqual(['lt-big']);
    expect(dropped).toHaveLength(0);
  });

  it('country drop takes precedence over flag inspection', () => {
    // A foreign entry that would also trip C-07 is reported as non_baltic.
    const { dropped } = filterFleetEntries([
      { id: 'ph-bad', country: 'PH', mw: 50, mwh: 1000, status: 'announced' },
    ]);
    expect(dropped[0].reason).toBe('non_baltic');
  });
});
