import { WAYPOINT_START } from './map-projection'

export type Place = {
  id: string
  name: string
  country: 'LT' | 'LV' | 'EE' | 'SE' | 'PL' | 'FI'
  lat: number
  lng: number
}

// 12 calibration anchors for the one-time GCP clicking session
export const CALIBRATION_ANCHORS: (Place & {
  instruction: string
})[] = [
  { id: 'nordbalt-se', name: 'NordBalt (Swedish end)', country: 'SE',
    lat: 56.7450, lng: 15.9067,
    instruction: 'Click the small dot on the Swedish east coast where the NordBalt cable begins' },
  { id: 'nordbalt-lt', name: 'NordBalt (Lithuanian end)', country: 'LT',
    lat: 55.7033, lng: 21.1443,
    instruction: 'Click the dot on the Lithuanian coast where NordBalt lands (Klaipėda)' },
  { id: 'litpol-lt', name: 'LitPol (Lithuanian end)', country: 'LT',
    lat: 54.3961, lng: 24.0511,
    instruction: 'Click the upper dot of the LitPol cable (Alytus, southern LT)' },
  { id: 'litpol-pl', name: 'LitPol (Polish end)', country: 'PL',
    lat: 53.8272, lng: 22.3650,
    instruction: 'Click the lower dot of the LitPol cable (Ełk, NE Poland)' },
  { id: 'estlink-ee', name: 'EstLink (Estonian end)', country: 'EE',
    lat: 59.3889, lng: 24.5597,
    instruction: 'Click the Estonian-side dot of EstLink (Harku, near Tallinn)' },
  { id: 'estlink-fi', name: 'EstLink (Finnish end)', country: 'FI',
    lat: 60.2050, lng: 24.6511,
    instruction: 'Click the Finnish-side dot of EstLink (Espoo, across from Tallinn)' },
  { id: 'fennoskan-se', name: 'Fenno-Skan (Swedish end)', country: 'SE',
    lat: 60.4033, lng: 18.1742,
    instruction: 'Click the Swedish-side dot of Fenno-Skan (Forsmark, north of Stockholm)' },
  { id: 'fennoskan-fi', name: 'Fenno-Skan (Finnish end)', country: 'FI',
    lat: 61.1283, lng: 21.5106,
    instruction: 'Click the Finnish-side dot of Fenno-Skan (Rauma, SW Finland)' },
  { id: 'sweden-label', name: 'SWEDEN label', country: 'SE',
    lat: 59.3293, lng: 18.0686,
    instruction: 'Click the center of the SWEDEN text label' },
  { id: 'lithuania-label', name: 'LITHUANIA label', country: 'LT',
    lat: 54.8985, lng: 23.9036,
    instruction: 'Click the center of the LITHUANIA text label' },
  { id: 'latvia-label', name: 'LATVIA label', country: 'LV',
    lat: 56.9496, lng: 24.1052,
    instruction: 'Click the center of the LATVIA text label' },
  { id: 'estonia-label', name: 'ESTONIA label', country: 'EE',
    lat: 59.4370, lng: 24.7536,
    instruction: 'Click the center of the ESTONIA text label' },
]

export const CABLE_LANDINGS = {
  nordbalt: {
    start: { id: 'nordbalt-se', name: 'Nybro', lat: 56.7450, lng: 15.9067 },
    end:   { id: 'nordbalt-lt', name: 'Klaipėda', lat: 55.7033, lng: 21.1443 },
  },
  litpol: {
    start: { id: 'litpol-lt', name: 'Alytus', lat: 54.3961, lng: 24.0511 },
    end:   { id: 'litpol-pl', name: 'Ełk', lat: 53.8272, lng: 22.3650 },
  },
  // EstLink and Fenno-Skan are DRAWN on the raster but NOT animated.
  // Listed here for completeness only. Do not add particles.
  estlink: {
    start: { id: 'estlink-ee', name: 'Harku', lat: 59.3889, lng: 24.5597 },
    end:   { id: 'estlink-fi', name: 'Espoo', lat: 60.2050, lng: 24.6511 },
  },
  fennoskan: {
    start: { id: 'fennoskan-se', name: 'Forsmark', lat: 60.4033, lng: 18.1742 },
    end:   { id: 'fennoskan-fi', name: 'Rauma', lat: 61.1283, lng: 21.5106 },
  },
}

export const PROJECT_SUBSTATIONS: Place[] = [
  { id: 'energy-cells-kruonis', name: 'Energy Cells Kruonis',
    country: 'LT', lat: 54.7806, lng: 24.6042 },
  { id: 'e-energija-sventininkai', name: 'E energija Šventininkai',
    country: 'LT', lat: 54.7203, lng: 24.0339 },
  { id: 'olana-salcininkai', name: 'Olana Šalčininkai',
    country: 'LT', lat: 54.3102, lng: 25.3886 },
  { id: 'ast-rezekne', name: 'AST Rēzekne',
    country: 'LV', lat: 56.5095, lng: 27.3328 },
  { id: 'ast-tume', name: 'AST Tume',
    country: 'LV', lat: 56.9672, lng: 23.1533 },
  { id: 'eur-energy-saldus', name: 'European Energy Saldus',
    country: 'LV', lat: 56.6672, lng: 22.4917 },
  { id: 'hertz-kiisa', name: 'Hertz Kiisa',
    country: 'EE', lat: 59.3089, lng: 24.5414 },
  { id: 'eesti-energia-auvere', name: 'Eesti Energia Auvere',
    country: 'EE', lat: 59.3267, lng: 27.8831 },
  { id: 'tsirguliina', name: 'Tsirguliina',
    country: 'EE', lat: 57.9275, lng: 26.0261 },
]

export const CITY_ANCHORS: (Place & { instruction: string })[] = [
  { id: 'vilnius', name: 'Vilnius', country: 'LT',
    lat: 54.6872, lng: 25.2797,
    instruction: 'Click the approximate location of Vilnius (SE Lithuania, near the Belarus border)' },
  { id: 'kaunas', name: 'Kaunas', country: 'LT',
    lat: 54.8985, lng: 23.9036,
    instruction: 'Click the approximate location of Kaunas (central Lithuania, on the Nemunas river)' },
  { id: 'klaipeda', name: 'Klaipėda', country: 'LT',
    lat: 55.7033, lng: 21.1443,
    instruction: 'Click the approximate location of Klaipėda (Lithuanian Baltic coast, where NordBalt lands)' },
  { id: 'riga', name: 'Riga', country: 'LV',
    lat: 56.9496, lng: 24.1052,
    instruction: 'Click the approximate location of Riga (central Latvia, Gulf of Riga coast)' },
  { id: 'daugavpils', name: 'Daugavpils', country: 'LV',
    lat: 55.8714, lng: 26.5161,
    instruction: 'Click the approximate location of Daugavpils (SE Latvia, near the Lithuanian and Belarus borders)' },
  { id: 'tallinn', name: 'Tallinn', country: 'EE',
    lat: 59.4370, lng: 24.7536,
    instruction: 'Click the approximate location of Tallinn (northern Estonia, on the Gulf of Finland)' },
  { id: 'tartu', name: 'Tartu', country: 'EE',
    lat: 58.3776, lng: 26.7290,
    instruction: 'Click the approximate location of Tartu (southeastern Estonia)' },
  { id: 'stockholm', name: 'Stockholm', country: 'SE',
    lat: 59.3293, lng: 18.0686,
    instruction: 'Click where Stockholm sits on the Swedish east coast — near where the SWEDEN label is' },
  { id: 'helsinki', name: 'Helsinki', country: 'FI',
    lat: 60.1699, lng: 24.9384,
    instruction: 'Click where Helsinki sits on the southern Finnish coast — directly opposite Tallinn across the Gulf of Finland' },
]

export type CableId = 'nordbalt' | 'litpol' | 'estlink-1' | 'estlink-2' | 'fennoskan-1' | 'fennoskan-2'

export const CABLES_TO_CALIBRATE: {
  id: CableId
  name: string
  minWaypoints: number
  maxWaypoints: number
  instruction: string
}[] = [
  { id: 'nordbalt', name: 'NordBalt', minWaypoints: 3, maxWaypoints: 6,
    instruction: 'Click along the NordBalt cable from the Swedish coast to Klaipėda. Start at the Swedish endpoint, click at each visible bend, end at the Lithuanian endpoint.' },
  { id: 'litpol', name: 'LitPol', minWaypoints: 2, maxWaypoints: 4,
    instruction: 'Click along the LitPol cable from southern Lithuania to NE Poland.' },
  { id: 'estlink-1', name: 'EstLink 1', minWaypoints: 2, maxWaypoints: 4,
    instruction: 'There are TWO visibly parallel EstLink cables drawn on the raster between Estonia and Finland. For EstLink 1, click along the FIRST line (whichever one you click first — we will call that #1). Start at the EE endpoint, end at the FI endpoint.' },
  { id: 'estlink-2', name: 'EstLink 2', minWaypoints: 2, maxWaypoints: 4,
    instruction: 'Now click along the OTHER EstLink cable — the second parallel line. Same start-end direction as EstLink 1 (EE to FI).' },
  { id: 'fennoskan-1', name: 'Fenno-Skan 1', minWaypoints: 2, maxWaypoints: 5,
    instruction: 'There are TWO visibly parallel Fenno-Skan cables between Sweden and Finland. For Fenno-Skan 1, click along the FIRST line. Start at the SE endpoint, end at the FI endpoint.' },
  { id: 'fennoskan-2', name: 'Fenno-Skan 2', minWaypoints: 2, maxWaypoints: 5,
    instruction: 'Now click along the OTHER Fenno-Skan cable — the second parallel line. Same start-end direction as Fenno-Skan 1 (SE to FI).' },
]

export const COUNTRY_CENTROIDS: Place[] = [
  { id: 'lt-centroid', name: 'Lithuania', country: 'LT',
    lat: 55.1694, lng: 23.8813 },
  { id: 'lv-centroid', name: 'Latvia', country: 'LV',
    lat: 56.8796, lng: 24.6032 },
  { id: 'ee-centroid', name: 'Estonia', country: 'EE',
    lat: 58.5953, lng: 25.0136 },
]

// ═══ Interconnector specs with direction convention ════════════════════════

// CANONICAL FLOW CONVENTION
// Worker /s8 was fixed in Phase 2A-3 so positive *_avg_mw means the Baltic
// endpoint is exporting (sending power out). For each interconnector,
// positiveFlowReceives is the country on the RECEIVING end when rawMw > 0.
// Example: nordbalt +694 → LT exporting → SE receiving → positiveFlowReceives: 'SE'.

export type InterconnectorSpec = {
  id: string
  displayName: string
  endpointA: { country: string; name: string }
  endpointB: { country: string; name: string }
  cbetSource: string
  nameplateMw: number
  capacityShare?: number
  baltic: 'A' | 'B' | 'none'
  positiveFlowReceives: string
  waypointCableId: string
}

export const INTERCONNECTORS: InterconnectorSpec[] = [
  { id: 'nordbalt',
    displayName: 'NordBalt',
    endpointA: { country: 'LT', name: 'Klaipėda' },
    endpointB: { country: 'SE', name: 'Nybro' },
    cbetSource: 'nordbalt_avg_mw',
    nameplateMw: 700,
    baltic: 'A',
    positiveFlowReceives: 'SE',
    waypointCableId: 'nordbalt' },
  { id: 'litpol',
    displayName: 'LitPol',
    endpointA: { country: 'LT', name: 'Alytus' },
    endpointB: { country: 'PL', name: 'Ełk' },
    cbetSource: 'litpol_avg_mw',
    nameplateMw: 500,
    baltic: 'A',
    positiveFlowReceives: 'PL',
    waypointCableId: 'litpol' },
  { id: 'estlink-1',
    displayName: 'EstLink 1',
    endpointA: { country: 'EE', name: 'Harku' },
    endpointB: { country: 'FI', name: 'Espoo' },
    cbetSource: 'estlink_avg_mw',
    nameplateMw: 350,
    capacityShare: 0.35,
    baltic: 'A',
    positiveFlowReceives: 'FI',
    waypointCableId: 'estlink-1' },
  { id: 'estlink-2',
    displayName: 'EstLink 2',
    endpointA: { country: 'EE', name: 'Püssi' },
    endpointB: { country: 'FI', name: 'Anttila' },
    cbetSource: 'estlink_avg_mw',
    nameplateMw: 650,
    capacityShare: 0.65,
    baltic: 'A',
    positiveFlowReceives: 'FI',
    waypointCableId: 'estlink-2' },
  { id: 'fennoskan-1',
    displayName: 'Fenno-Skan 1',
    endpointA: { country: 'SE', name: 'Dannebo' },
    endpointB: { country: 'FI', name: 'Rauma' },
    cbetSource: 'fennoskan_avg_mw',
    nameplateMw: 550,
    capacityShare: 0.407,
    baltic: 'none',
    positiveFlowReceives: 'FI',
    waypointCableId: 'fennoskan-1' },
  { id: 'fennoskan-2',
    displayName: 'Fenno-Skan 2',
    endpointA: { country: 'SE', name: 'Finnböle' },
    endpointB: { country: 'FI', name: 'Rauma' },
    cbetSource: 'fennoskan_avg_mw',
    nameplateMw: 800,
    capacityShare: 0.593,
    baltic: 'none',
    positiveFlowReceives: 'FI',
    waypointCableId: 'fennoskan-2' },
]

export type ResolvedFlow = {
  id: string
  displayName: string
  fromCountry: string
  toCountry: string
  mw: number
  rawMw: number
  utilization: number
  particleDirection: 'forward' | 'reverse'
  arrowColor: 'rose' | 'teal' | 'neutral'
}

export function resolveFlow(spec: InterconnectorSpec, s8Data: Record<string, unknown> | null): ResolvedFlow {
  const rawMw = ((s8Data?.[spec.cbetSource] as number) ?? 0) * (spec.capacityShare ?? 1)
  const absMw = Math.abs(rawMw)
  const utilization = spec.nameplateMw > 0 ? absMw / spec.nameplateMw : 0

  // positiveFlowReceives: the country that receives power when rawMw > 0
  const receivingCountry = spec.positiveFlowReceives
  const otherCountry =
    spec.endpointA.country === receivingCountry
      ? spec.endpointB.country
      : spec.endpointA.country

  const fromCountry = rawMw >= 0 ? otherCountry : receivingCountry
  const toCountry = rawMw >= 0 ? receivingCountry : otherCountry

  // Particle direction: does the flow depart from the same end as the
  // first waypoint of the cable path? If yes → forward, else → reverse.
  const waypointStartCountry = WAYPOINT_START[spec.waypointCableId] ?? 'UNKNOWN'
  const particleDirection: 'forward' | 'reverse' =
    fromCountry === waypointStartCountry ? 'forward' : 'reverse'

  // Arrow color convention: toCountry === balticCountry → rose (import suppresses prices)
  let arrowColor: 'rose' | 'teal' | 'neutral'
  if (spec.baltic === 'none') {
    arrowColor = 'neutral'
  } else {
    const balticCountry = spec.baltic === 'A'
      ? spec.endpointA.country
      : spec.endpointB.country
    arrowColor = toCountry === balticCountry ? 'rose' : 'teal'
  }

  return {
    id: spec.id,
    displayName: spec.displayName,
    fromCountry,
    toCountry,
    mw: Math.round(absMw),
    rawMw,
    utilization,
    particleDirection,
    arrowColor,
  }
}
