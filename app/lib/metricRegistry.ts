// Canonical metric registry — Phase 12.10 seed for Phase 12.12 #5
// (cross-card consistency CI test).
//
// One declaration per metric. Each metric names the worker payload field
// that is the SINGLE source of truth, plus the displayable label. Frontend
// surfaces that show this metric MUST read from the canonical field; the
// CI test will grep for raw alternatives and fail if they sneak in.
//
// This file replaces the implicit convention "every component picks its
// favourite worker field". Audit #5 found the same metric (LT installed
// storage) rendered three different ways from three different fields —
// 484 (s4_buildability), 596 (fleet.countries.LT.operational_mw), 506
// (Litgrid current). The registry says: only one of these is canonical
// for "LT installed BESS"; the other two are derived views.
//
// Architecture note (2026-05-04, Phase 12.10): the worker exposes both
// `installed_storage_<country>_mw` (hardcoded fallback / operator-curated)
// AND `installed_storage_<country>_mw_live` (VPS-Python ingested from
// ENTSO-E A68). The registry's selector prefers `_live` when present,
// falling back to the hardcode. See `getInstalledMw` below.

import type { S4ForFleet } from './fleet';

export type MetricSourceTier = 'live' | 'hardcode' | 'fallback';

export interface MetricDescriptor {
  /** Human-readable label rendered in cards / tooltips. */
  label: string;
  /** Worker payload path (dotted) for the canonical value. */
  workerPath: string;
  /** What this metric represents in domain terms. */
  meaning: string;
  /** Phase that introduced or last touched this metric. */
  introducedPhase: string;
}

export const METRIC_REGISTRY: Record<string, MetricDescriptor> = {
  installed_storage_lt_mw: {
    label: 'LT BESS installed (TSO-tracked)',
    workerPath: 's4.storage_reference.installed_mw',
    meaning:
      'Lithuanian operational BESS at the TSO grid level (Litgrid Įrengtoji galia). ' +
      'Excludes pumped hydro (Kruonis 205 MW) and behind-the-meter commercial sites. ' +
      'Distribution-grid storage (~153 MW per Litgrid) tracked separately under coverage_note ' +
      'until VPS live-fetch breakdown lands (Phase 12.12).',
    introducedPhase: '12.10',
  },
  installed_storage_lv_mw: {
    label: 'LV BESS installed (TSO-tracked)',
    workerPath: 's4.storage_by_country.LV.installed_mw',
    meaning:
      'Latvian operational BESS at AST TSO level. Currently AST Rēzekne (60) + Tume (20) = 80. ' +
      '~19 MW commercial behind-the-meter (Utilitas Targale, AJ Power) tracked in fleet but excluded here.',
    introducedPhase: '12.10',
  },
  installed_storage_ee_mw: {
    label: 'EE BESS installed (TSO-tracked)',
    workerPath: 's4.storage_by_country.EE.installed_mw',
    meaning:
      'Estonian operational BESS. Currently BSP Hertz 1 Kiisa (100) + Eesti Energia BESS (26.5) ≈ 127. ' +
      'Both are flagged _quarantine pending TSO operational evidence — see fleet.countries.EE.quarantined_mw.',
    introducedPhase: '12.10',
  },
  baltic_total_installed_mw: {
    label: 'Baltic BESS installed (sum of country TSO-tracked)',
    workerPath: 's4.baltic_total.installed_mw',
    meaning:
      'Sum of LT + LV + EE installed BESS at TSO level. Distinct from fleet.baltic_operational_mw, ' +
      'which is the live commissioned flex fleet (BESS + pumped hydro Kruonis).',
    introducedPhase: '12.10',
  },
  baltic_flexibility_fleet_mw: {
    label: 'Baltic flexibility fleet (BESS + Kruonis PSP)',
    workerPath: 's4.fleet.baltic_operational_mw',
    meaning:
      'All commissioned grid-connected flex assets — BESS + pumped hydro (Kruonis 205 MW). ' +
      'Distinct from baltic_total.installed_mw which excludes pumped hydro by definition.',
    introducedPhase: '12.10',
  },
};

/** Per-country installed-MW selector. Prefers `_live` (VPS-ingested) over hardcode. */
export interface InstalledMwResult {
  value: number | null;
  source: MetricSourceTier;
  as_of: string | null;
  source_url: string | null;
}

interface CountryInstalledRow {
  installed_mw?: number | null;
  installed_mw_live?: number | null;
  installed_mw_live_as_of?: string | null;
  installed_mw_live_source_url?: string | null;
  installed_mw_as_of?: string | null;
  installed_mw_source_url?: string | null;
}

interface S4WithStorage extends S4ForFleet {
  storage_by_country?: Record<string, CountryInstalledRow | undefined> | null;
}

export function getInstalledMw(
  s4: S4WithStorage | null | undefined,
  country: 'LT' | 'LV' | 'EE',
): InstalledMwResult {
  const row = s4?.storage_by_country?.[country];
  if (row?.installed_mw_live != null) {
    return {
      value: row.installed_mw_live,
      source: 'live',
      as_of: row.installed_mw_live_as_of ?? null,
      source_url: row.installed_mw_live_source_url ?? null,
    };
  }
  if (row?.installed_mw != null) {
    return {
      value: row.installed_mw,
      source: 'hardcode',
      as_of: row.installed_mw_as_of ?? null,
      source_url: row.installed_mw_source_url ?? null,
    };
  }
  return { value: null, source: 'fallback', as_of: null, source_url: null };
}
