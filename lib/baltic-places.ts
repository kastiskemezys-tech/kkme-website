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
]

export type CableId = 'nordbalt' | 'litpol' | 'estlink' | 'fennoskan'

export const CABLES_TO_CALIBRATE: {
  id: CableId
  name: string
  minWaypoints: number
  maxWaypoints: number
  instruction: string
}[] = [
  { id: 'nordbalt', name: 'NordBalt', minWaypoints: 3, maxWaypoints: 6,
    instruction: 'Click along the NordBalt cable from the Swedish coast to Klaipėda. Start at the Swedish endpoint dot, click at each visible bend/kink in the drawn cable, end at the Lithuanian endpoint dot. 3-6 clicks total.' },
  { id: 'litpol', name: 'LitPol', minWaypoints: 2, maxWaypoints: 4,
    instruction: 'Click along the LitPol cable from southern Lithuania to NE Poland. Start at the LT endpoint, any bends in between, end at the PL endpoint.' },
  { id: 'estlink', name: 'EstLink', minWaypoints: 2, maxWaypoints: 4,
    instruction: 'Click along the EstLink cable between Estonia and Finland. Start at the EE endpoint, any bends, end at the FI endpoint.' },
  { id: 'fennoskan', name: 'Fenno-Skan', minWaypoints: 2, maxWaypoints: 5,
    instruction: 'Click along the Fenno-Skan cable between Sweden and Finland. Start at the SE endpoint, follow the drawn curve, end at the FI endpoint.' },
]

export const COUNTRY_CENTROIDS: Place[] = [
  { id: 'lt-centroid', name: 'Lithuania', country: 'LT',
    lat: 55.1694, lng: 23.8813 },
  { id: 'lv-centroid', name: 'Latvia', country: 'LV',
    lat: 56.8796, lng: 24.6032 },
  { id: 'ee-centroid', name: 'Estonia', country: 'EE',
    lat: 58.5953, lng: 25.0136 },
]
