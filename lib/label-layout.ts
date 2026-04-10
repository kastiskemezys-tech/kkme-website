export type LabelBox = {
  id: string
  x: number          // current left edge
  y: number          // current top edge
  width: number
  height: number
  type: 'project' | 'country-mw' | 'city' | 'country-label-baked'
  movable: boolean   // false for raster-baked labels
}

const PRIORITY: Record<LabelBox['type'], number> = {
  'country-label-baked': 0,  // highest priority, never moves
  'project': 1,
  'country-mw': 2,
  'city': 3,                 // lowest priority, moves first
}

function boxesOverlap(a: LabelBox, b: LabelBox, padding = 2): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  )
}

export function resolveCollisions(
  boxes: LabelBox[],
  options: { maxIterations?: number; pushDistance?: number } = {}
): LabelBox[] {
  const maxIter = options.maxIterations ?? 10
  const push = options.pushDistance ?? 14
  const resolved = boxes.map(b => ({ ...b }))

  for (let iter = 0; iter < maxIter; iter++) {
    let anyMoved = false
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i]
        const b = resolved[j]
        if (!boxesOverlap(a, b)) continue

        // Determine which one moves: lower priority (higher number) moves
        const aPriority = PRIORITY[a.type]
        const bPriority = PRIORITY[b.type]
        let mover: LabelBox, stayer: LabelBox
        if (aPriority > bPriority && a.movable) {
          mover = a; stayer = b
        } else if (bPriority > aPriority && b.movable) {
          mover = b; stayer = a
        } else if (a.movable) {
          mover = a; stayer = b
        } else if (b.movable) {
          mover = b; stayer = a
        } else {
          continue  // both immovable, can't resolve
        }

        // Push mover vertically away from stayer's center
        const moverCenterY = mover.y + mover.height / 2
        const stayerCenterY = stayer.y + stayer.height / 2
        const dy = moverCenterY < stayerCenterY ? -push : push
        mover.y += dy
        anyMoved = true
      }
    }
    if (!anyMoved) break
  }
  return resolved
}

export function hideCitiesNearProjects(
  cities: LabelBox[],
  projects: LabelBox[],
  proximityPx = 35
): LabelBox[] {
  return cities.filter(city => {
    const cityCenterX = city.x + city.width / 2
    const cityCenterY = city.y + city.height / 2
    return !projects.some(proj => {
      const projCenterX = proj.x + proj.width / 2
      const projCenterY = proj.y + proj.height / 2
      const dist = Math.hypot(cityCenterX - projCenterX, cityCenterY - projCenterY)
      return dist < proximityPx
    })
  })
}
