import { GcpTransformer } from '@allmaps/transform'
import primary from '../public/hero/map-calibration.json'
import cities from '../public/hero/map-calibration-cities.json'

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
