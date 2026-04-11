import { GcpTransformer } from '@allmaps/transform'
import primary from '../public/hero/map-calibration.json'
import cities from '../public/hero/map-calibration-cities.json'
import waypoints from '../public/hero/map-cable-waypoints.json'
// CableId type not needed — CABLE_PATHS uses string keys for 6-cable support

// Exclude country label GCPs — they are imprecise (center of large text).
// Cable endpoint dots + city clicks give a clean polynomial1 fit.
const LABEL_IDS = new Set(['sweden-label', 'lithuania-label', 'latvia-label', 'estonia-label'])

const allGcps = [
  ...primary.gcps,
  ...cities.gcps,
]
  .filter(g => typeof g.px === 'number' && typeof g.py === 'number' && !LABEL_IDS.has(g.id))
  .map(g => ({
    resource: [g.px, g.py] as [number, number],
    geo: [g.lng, g.lat] as [number, number],
  }))

if (allGcps.length < 6) {
  throw new Error(`Not enough GCPs for projection: ${allGcps.length} < 6`)
}

// polynomial1 = affine (6 params: translate + scale + rotate + shear).
// Needed because the illustrative map is not a true Mercator projection.
export const transformer = new GcpTransformer(allGcps, 'polynomial1')

export function geoToPixel(lat: number, lng: number): { x: number; y: number } {
  const [x, y] = transformer.transformToResource([lng, lat])
  return { x: Math.round(x), y: Math.round(y) }
}

export const MAP_WIDTH = primary.imageWidth
export const MAP_HEIGHT = primary.imageHeight
export const GCP_COUNT = allGcps.length

// ═══ Cable paths from clicked waypoints ═════════════════════════════════════

// Polyline paths — straight L commands between clicked waypoints.
// Catmull-Rom removed: wife drew straight segments, smoothing pulls off the art.
function buildPath(points: { px: number; py: number }[]): string {
  if (!points || points.length < 2) return ''
  let d = `M ${points[0].px} ${points[0].py}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].px} ${points[i].py}`
  }
  return d
}

const cablesData = (waypoints as { cables: Record<string, { waypoints: { px: number; py: number }[] }> }).cables

export const CABLE_PATHS: Record<string, string> = {
  nordbalt: buildPath(cablesData.nordbalt?.waypoints ?? []),
  litpol: buildPath(cablesData.litpol?.waypoints ?? []),
  'estlink-1': buildPath(cablesData['estlink-1']?.waypoints ?? []),
  'estlink-2': buildPath(cablesData['estlink-2']?.waypoints ?? []),
  'fennoskan-1': buildPath(cablesData['fennoskan-1']?.waypoints ?? []),
  'fennoskan-2': buildPath(cablesData['fennoskan-2']?.waypoints ?? []),
}

// ═══ Label positions from calibration ═══════════════════════════════════════

export const COUNTRY_LABEL_PIXELS: Record<string, { x: number; y: number }> =
  Object.fromEntries(
    primary.gcps
      .filter((g: { id: string }) => g.id?.endsWith('-label'))
      .map((g: { id: string; px: number; py: number }) => [
        g.id.replace('-label', '').toUpperCase(),
        { x: g.px, y: g.py },
      ])
  )

export const CITY_LABEL_PIXELS: Record<string, { x: number; y: number; name: string }> =
  Object.fromEntries(
    (cities as { gcps: { id: string; px: number; py: number; name: string }[] }).gcps.map(g => [
      g.id,
      { x: g.px, y: g.py, name: g.name },
    ])
  )

// ═══ Waypoint start-country inference ════════════════════════════════════════
// For each cable, determine which country the first waypoint is closest to.
// Used by resolveFlow() to compute particle direction (forward vs reverse).

const ALL_ANCHORS = [
  ...primary.gcps.filter((g: { px?: number; py?: number }) =>
    typeof g.px === 'number' && typeof g.py === 'number'),
  ...(cities as { gcps: { px?: number; py?: number; country?: string }[] }).gcps.filter(
    (g: { px?: number; py?: number }) =>
      typeof g.px === 'number' && typeof g.py === 'number'),
]

function closestCountryTo(px: number, py: number): string {
  let best = { country: 'UNKNOWN', dist: Infinity }
  for (const anchor of ALL_ANCHORS) {
    const a = anchor as { px: number; py: number; country?: string; id?: string }
    // Derive country from id suffix or country field
    let country = 'UNKNOWN'
    if ('country' in anchor && typeof (anchor as { country?: string }).country === 'string') {
      country = (anchor as { country: string }).country
    } else if (a.id) {
      // calibration anchors have ids like "nordbalt-se", "estlink-ee"
      const suffix = a.id.split('-').pop()?.toUpperCase() ?? ''
      const MAP: Record<string, string> = { SE: 'SE', LT: 'LT', PL: 'PL', EE: 'EE', FI: 'FI' }
      country = MAP[suffix] ?? 'UNKNOWN'
    }
    if (country === 'UNKNOWN') continue
    const d = Math.hypot(a.px - px, a.py - py)
    if (d < best.dist) {
      best = { country, dist: d }
    }
  }
  return best.country
}

export const WAYPOINT_START: Record<string, string> = {}
for (const cableId of [
  'nordbalt', 'litpol',
  'estlink-1', 'estlink-2',
  'fennoskan-1', 'fennoskan-2',
]) {
  const wps = cablesData[cableId]?.waypoints
  if (!wps || wps.length === 0) continue
  WAYPOINT_START[cableId] = closestCountryTo(wps[0].px, wps[0].py)
}
