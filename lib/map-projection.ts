import { GcpTransformer } from '@allmaps/transform'
import primary from '../public/hero/map-calibration.json'
import cities from '../public/hero/map-calibration-cities.json'
import waypoints from '../public/hero/map-cable-waypoints.json'
import type { CableId } from './baltic-places'

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

function buildPath(points: { px: number; py: number }[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].px} ${points[0].py} L ${points[1].px} ${points[1].py}`
  }
  // Catmull-Rom-style cubic Bezier through all waypoints
  let d = `M ${points[0].px} ${points[0].py}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const tension = 0.5
    const c1x = p1.px + (p2.px - p0.px) * tension / 3
    const c1y = p1.py + (p2.py - p0.py) * tension / 3
    const c2x = p2.px - (p3.px - p1.px) * tension / 3
    const c2y = p2.py - (p3.py - p1.py) * tension / 3
    d += ` C ${Math.round(c1x)} ${Math.round(c1y)} ${Math.round(c2x)} ${Math.round(c2y)} ${p2.px} ${p2.py}`
  }
  return d
}

const cablesData = (waypoints as { cables: Record<string, { waypoints: { px: number; py: number }[] }> }).cables

export const CABLE_PATHS: Record<CableId, string> = {
  nordbalt: buildPath(cablesData.nordbalt?.waypoints ?? []),
  litpol: buildPath(cablesData.litpol?.waypoints ?? []),
  estlink: buildPath(cablesData.estlink?.waypoints ?? []),
  fennoskan: buildPath(cablesData.fennoskan?.waypoints ?? []),
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
