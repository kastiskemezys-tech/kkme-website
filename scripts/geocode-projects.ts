#!/usr/bin/env npx tsx
/**
 * Resolves /s4 project names to lat/lng via OSM Overpass.
 * Caches results to public/hero/project-geocodes.json.
 * Respects manual overrides from lib/project-overrides.ts.
 * Rate-limited to 1 request/second per Overpass fair use policy.
 *
 * Run: npx tsx scripts/geocode-projects.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { MANUAL_OVERRIDES } from '../lib/project-overrides'

const S4_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4'
const CACHE_PATH = path.join(process.cwd(), 'public/hero/project-geocodes.json')
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

const COUNTRY_AREA_IDS: Record<string, number> = {
  LT: 3600072596,
  LV: 3600072594,
  EE: 3600079510,
}

// Known name → place mappings for projects whose names don't contain a city
const NAME_TO_PLACE: Record<string, { search: string; country: string }> = {
  'E energija': { search: 'Elektrėnai', country: 'LT' },
  'Energy Cells (Kruonis)': { search: 'Kruonis', country: 'LT' },
  'AST BESS (Rēzekne + Tume)': { search: 'Rēzekne', country: 'LV' },
  'BSP Hertz 1 (Kiisa)': { search: 'Kiisa', country: 'EE' },
  'Eesti Energia BESS (Ida-Viru)': { search: 'Auvere', country: 'EE' },
  'AJ Power BESS portfolio (3 sites)': { search: 'Valmiera', country: 'LV' },
  'Utilitas Wind Targale BESS': { search: 'Targale', country: 'LV' },
  'Niam/Evecon BESS portfolio': { search: 'Riga', country: 'LV' },
}

type CacheEntry =
  | { resolved: true; lat: number; lng: number; source: 'manual' | 'overpass'; matched_name: string; resolved_at: string }
  | { resolved: false; reason: string; attempted_at: string }

async function loadCache(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveCache(cache: Record<string, CacheEntry>) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true })
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))
}

function extractPlaceName(project: Record<string, unknown>): { search: string; country: string } | null {
  const name = project.name as string
  const country = project.country as string

  // Check known mappings first
  if (NAME_TO_PLACE[name]) return NAME_TO_PLACE[name]

  // Try extracting location from parentheses: "Something (Location)"
  const parenMatch = name.match(/\(([^)]+)\)/)
  if (parenMatch) return { search: parenMatch[1].split(/[,+]/)[0].trim(), country }

  // Try last word of multi-word name
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return { search: words[words.length - 1], country }

  return { search: name, country }
}

async function overpassLookup(placeName: string, country: string):
  Promise<{ lat: number; lng: number; matched_name: string } | null> {
  const areaId = COUNTRY_AREA_IDS[country]
  if (!areaId) return null

  const query = `
    [out:json][timeout:10];
    (
      node["power"="substation"]["name"~"${placeName}",i](area:${areaId});
      way["power"="substation"]["name"~"${placeName}",i](area:${areaId});
      node["place"~"city|town|village"]["name"~"${placeName}",i](area:${areaId});
    );
    out center 5;
  `

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) return null

  const data = await res.json() as { elements?: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string; power?: string } }> }
  if (!data.elements || data.elements.length === 0) return null

  const substation = data.elements.find(e => e.tags?.power === 'substation')
  const best = substation ?? data.elements[0]

  const lat = best.lat ?? best.center?.lat
  const lon = best.lon ?? best.center?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null

  return { lat, lng: lon, matched_name: best.tags?.name ?? placeName }
}

async function main() {
  console.log(`Fetching /s4 from ${S4_URL}...`)
  const res = await fetch(S4_URL)
  const s4 = await res.json() as { projects?: Array<Record<string, unknown>> }
  const projects = s4.projects ?? []
  console.log(`Total projects: ${projects.length}`)

  const operational = projects.filter(p => {
    const status = ((p.status as string) ?? '').toLowerCase()
    return status === 'operational' || status === 'live' || status === 'commissioned'
  })
  console.log(`Operational projects: ${operational.length}`)

  const cache = await loadCache()
  const now = new Date()

  for (const project of operational) {
    const id = project.id as string || (project.name as string || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (!id) {
      console.warn('  [skip] No id:', project.name)
      continue
    }

    // 1. Manual override wins
    if (MANUAL_OVERRIDES[id]) {
      const o = MANUAL_OVERRIDES[id]
      cache[id] = {
        resolved: true,
        lat: o.lat,
        lng: o.lng,
        source: 'manual',
        matched_name: o.note,
        resolved_at: now.toISOString(),
      }
      console.log(`  [manual] ${id}: ${o.lat}, ${o.lng}`)
      continue
    }

    // 2. Cache hit still fresh
    const cached = cache[id]
    if (cached?.resolved === true) {
      const age = now.getTime() - new Date(cached.resolved_at).getTime()
      if (age < CACHE_MAX_AGE_MS) {
        console.log(`  [cache] ${id}: ${cached.lat}, ${cached.lng}`)
        continue
      }
    }

    // 3. Overpass lookup
    const place = extractPlaceName(project)
    if (!place) {
      cache[id] = { resolved: false, reason: 'no usable name', attempted_at: now.toISOString() }
      console.log(`  [skip]  ${id}: no usable name`)
      continue
    }

    console.log(`  [query] ${id}: searching "${place.search}" in ${place.country}...`)
    try {
      const result = await overpassLookup(place.search, place.country)
      if (result) {
        cache[id] = {
          resolved: true,
          lat: result.lat,
          lng: result.lng,
          source: 'overpass',
          matched_name: result.matched_name,
          resolved_at: now.toISOString(),
        }
        console.log(`  [ok]    ${id}: ${result.lat}, ${result.lng} (${result.matched_name})`)
      } else {
        cache[id] = { resolved: false, reason: `no overpass result for "${place.search}"`, attempted_at: now.toISOString() }
        console.log(`  [miss]  ${id}: no result for "${place.search}"`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      cache[id] = { resolved: false, reason: msg, attempted_at: now.toISOString() }
      console.log(`  [err]   ${id}: ${msg}`)
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1100))
  }

  await saveCache(cache)

  const resolved = Object.values(cache).filter(e => e.resolved).length
  const failed = Object.values(cache).filter(e => !e.resolved).length
  console.log(`\nDone. Resolved: ${resolved}. Failed: ${failed}.`)
  console.log(`Cache written to ${CACHE_PATH}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
