import 'server-only'

import type { Condition, MarketplaceMode, Product, SortBy } from '@/lib/product'
import { applyMonitorFilter } from '@/lib/monitor-filter-apply'
import type { MonitorFilterMode } from '@/lib/monitor-filter'
import { scrapeMarketplacePages } from '@/lib/marketplace-scrape'
import { writeCache } from '@/lib/searches'
import { saveMonitorSnapshot } from '@/lib/monitor-snapshot'
import { baselineFirstVisitIfNeeded } from '@/lib/monitor-seen'
import { writeHeartbeat } from '@/lib/ops'

export interface InitialScrapeMonitor {
  id: string
  query: string
  search_id: string
  olx_search_id: string | null
  marketplace_mode: MarketplaceMode
  filter_mode: MonitorFilterMode
  exclude_terms: string[]
}

/** Scrape page 1 per marketplace on first monitor load (before cron deep scan). */
export async function scrapeInitialMonitorCatalog(
  monitor: InitialScrapeMonitor,
  sort: SortBy,
  condition: Condition,
): Promise<{ products: Product[]; initialCatalog: boolean }> {
  const mode = monitor.marketplace_mode ?? 'ml'
  const merged: Product[] = []
  const seen = new Set<string>()

  async function addPage(
    marketplace: 'ml' | 'olx',
    searchId: string,
  ): Promise<void> {
    try {
      const { page1 } = await scrapeMarketplacePages(
        marketplace,
        monitor.query,
        sort,
        condition,
        1,
      )
      if (page1.length > 0) await writeCache(searchId, 1, page1)
      for (const p of page1) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          merged.push(p)
        }
      }
      const tag = marketplace === 'olx' ? 'olx_scrape' : 'ml_scrape'
      await writeHeartbeat(
        tag,
        'ok',
        `Primeira página: ${page1.length} (${marketplace}, ${monitor.query})`,
        { query: monitor.query, marketplace, monitorId: monitor.id },
      )
    } catch (err) {
      const tag = marketplace === 'olx' ? 'olx_scrape' : 'ml_scrape'
      await writeHeartbeat(tag, 'error', (err as Error).message.slice(0, 500)).catch(() => {})
      throw err
    }
  }

  const errors: Error[] = []

  if (mode === 'ml' || mode === 'both') {
    try {
      await addPage('ml', monitor.search_id)
    } catch (err) {
      errors.push(err as Error)
    }
  }

  if (mode === 'olx') {
    try {
      await addPage('olx', monitor.search_id)
    } catch (err) {
      errors.push(err as Error)
    }
  } else if (mode === 'both' && monitor.olx_search_id) {
    try {
      await addPage('olx', monitor.olx_search_id)
    } catch (err) {
      errors.push(err as Error)
    }
  }

  if (merged.length === 0 && errors.length > 0) {
    throw errors[0]
  }

  const filtered = applyMonitorFilter(merged, monitor)
  if (filtered.length > 0) {
    await saveMonitorSnapshot(monitor.id, filtered, monitor.search_id)
  }

  const initialCatalog = await baselineFirstVisitIfNeeded(
    monitor.id,
    filtered.map((p) => p.id),
  )

  return { products: filtered, initialCatalog }
}
