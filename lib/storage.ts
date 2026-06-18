import type { Product } from './scraper'
import type { Condition } from './scraper'

export interface MonitorEntry {
  query: string
  condition: Condition
  lastChecked: number        // timestamp
  seenIds: string[]          // product IDs the user has already seen
  lastResults: Product[]     // cached last fetch (for fallback)
  newCount: number           // how many new products on last check
}

export type MonitorMap = Record<string, MonitorEntry>

const KEY = 'fp_monitors'

export function loadMonitors(): MonitorMap {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveMonitors(monitors: MonitorMap): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(monitors))
}

export function addMonitor(query: string, condition: Condition = 'all'): MonitorMap {
  const monitors = loadMonitors()
  const key = normalizeKey(query)
  if (!monitors[key]) {
    monitors[key] = {
      query,
      condition,
      lastChecked: 0,
      seenIds: [],
      lastResults: [],
      newCount: 0,
    }
  }
  saveMonitors(monitors)
  return monitors
}

export function setMonitorCondition(query: string, condition: Condition): MonitorMap {
  const monitors = loadMonitors()
  const key = normalizeKey(query)
  if (monitors[key]) {
    monitors[key].condition = condition
    // Reset seen state since we're changing the filter
    monitors[key].seenIds = []
    monitors[key].lastChecked = 0
    monitors[key].lastResults = []
    monitors[key].newCount = 0
    saveMonitors(monitors)
  }
  return monitors
}

export function removeMonitor(query: string): MonitorMap {
  const monitors = loadMonitors()
  delete monitors[normalizeKey(query)]
  saveMonitors(monitors)
  return monitors
}

export function markAllAsSeen(query: string, products: Product[]): MonitorMap {
  const monitors = loadMonitors()
  const key = normalizeKey(query)
  if (monitors[key]) {
    const allIds = products.map((p) => p.id)
    monitors[key].seenIds = [...new Set([...monitors[key].seenIds, ...allIds])]
    monitors[key].newCount = 0
    saveMonitors(monitors)
  }
  return monitors
}

export function updateMonitorResults(
  query: string,
  products: Product[],
  fetchedAt: number,
): { monitors: MonitorMap; newProducts: Product[] } {
  const monitors = loadMonitors()
  const key = normalizeKey(query)

  if (!monitors[key]) {
    monitors[key] = { query, condition: 'all', lastChecked: 0, seenIds: [], lastResults: [], newCount: 0 }
  }

  const entry = monitors[key]
  const seenSet = new Set(entry.seenIds)

  // First ever fetch — mark everything as seen so we start fresh next time
  if (entry.lastChecked === 0) {
    const allIds = products.map((p) => p.id)
    entry.seenIds = allIds
    entry.lastResults = products.map((p) => ({ ...p, detectedAt: fetchedAt }))
    entry.lastChecked = fetchedAt
    entry.newCount = 0
    saveMonitors(monitors)
    return { monitors, newProducts: [] }
  }

  const newProducts = products.filter((p) => !seenSet.has(p.id))

  // Build a map of previously known detectedAt timestamps so we don't overwrite them
  const prevTimestamps = new Map(entry.lastResults.map((p) => [p.id, p.detectedAt]))
  const enriched = products.map((p) => ({
    ...p,
    // Keep the original detection time if we've seen this product before
    detectedAt: prevTimestamps.get(p.id) ?? p.detectedAt,
  }))

  entry.lastChecked = fetchedAt
  entry.lastResults = enriched
  entry.newCount = newProducts.length

  saveMonitors(monitors)
  return { monitors, newProducts }
}

export function normalizeKey(query: string): string {
  return query.trim().toLowerCase()
}
