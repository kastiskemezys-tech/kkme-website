// Manual coordinate overrides for projects where OSM geocoding
// failed or returned the wrong location.
//
// For the initial 8 operational projects, all are manually specified
// because the /s4 project names don't map cleanly to Overpass.
// Future projects with clearer names can use the geocode script.
//
// Kastis's workflow for new projects:
//   1. Find the wrong project dot on the hero
//   2. Open Google Maps, right-click on the real substation, copy coordinates
//   3. Add an entry here keyed by project.id from /s4
//   4. Re-run: npx tsx scripts/geocode-projects.ts
//   5. Commit + deploy

export type ProjectOverride = {
  lat: number
  lng: number
  note: string
}

export const MANUAL_OVERRIDES: Record<string, ProjectOverride> = {
  // === Lithuania ===
  'kruonis-psp-lt': {
    lat: 54.7806,
    lng: 24.0689,
    note: 'Kruonis PSP — pumped hydro near Kaunas',
  },
  'e-energija-lt': {
    lat: 54.7853,
    lng: 24.6592,
    note: 'E energija — Elektrėnai power plant complex',
  },
  // Energy Cells has no id field in /s4 — key is derived from name
  'energy-cells-kruonis-': {
    lat: 54.7806,
    lng: 24.0689,
    note: 'Energy Cells (Kruonis) — TSO-owned at Kruonis PSP',
  },

  // === Estonia ===
  'bsp-hertz-1-kiisa-ee': {
    lat: 59.2000,
    lng: 24.5667,
    note: 'BSP Hertz 1 — Kiisa substation, SW of Tallinn',
  },
  'eesti-energia-bess-ee': {
    lat: 59.3267,
    lng: 27.8831,
    note: 'Eesti Energia BESS — Auvere, Ida-Viru county (NE Estonia)',
  },

  // === Latvia ===
  // AST BESS has no id — derived from name
  'ast-bess-r-zekne-tume-': {
    lat: 56.5095,
    lng: 27.3328,
    note: 'AST BESS — placed at Rēzekne (60 MW of the 80 MW total)',
  },
  'utilitas-targale-lv': {
    lat: 57.1906,
    lng: 21.8922,
    note: 'Utilitas Wind Targale BESS — Ventspils region, west Latvia',
  },
  'aj-power-portfolio-lv': {
    lat: 57.5414,
    lng: 25.4264,
    note: 'AJ Power portfolio — placed at Valmiera (largest of 3 sites)',
  },
}
