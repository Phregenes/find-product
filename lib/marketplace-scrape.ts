import 'server-only'

import type { Condition, Marketplace, Product, SortBy } from './product'
import { scrapeSearchPages, MONITOR_SCRAPE_MAX_PAGES } from './scraper'
import { scrapeOlxSearchPages, OLX_SCRAPE_MAX_PAGES } from './olx-scraper'

export async function scrapeMarketplacePages(
  marketplace: Marketplace,
  query: string,
  sortBy: SortBy,
  condition: Condition,
  maxPages?: number,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  if (marketplace === 'olx') {
    const pages = maxPages ?? OLX_SCRAPE_MAX_PAGES
    return scrapeOlxSearchPages(query, sortBy, pages, 1)
  }
  const pages = maxPages ?? MONITOR_SCRAPE_MAX_PAGES
  return scrapeSearchPages(query, sortBy, condition, pages, 1)
}
