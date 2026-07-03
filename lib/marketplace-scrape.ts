import 'server-only'

import type { Browser } from 'playwright-core'
import type { Condition, Marketplace, Product, SortBy } from './product'
import { scrapeSearchPages } from './scraper'
import { scrapeOlxSearchPages } from './olx-scraper'
import { getMonitorScrapeMaxPages, getOlxScrapeMaxPages } from './scrape-limits'

export interface ScrapeMarketplaceOptions {
  maxPages?: number
  browser?: Browser
}

export async function scrapeMarketplacePages(
  marketplace: Marketplace,
  query: string,
  sortBy: SortBy,
  condition: Condition,
  opts?: ScrapeMarketplaceOptions,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  const browser = opts?.browser
  if (marketplace === 'olx') {
    const pages = opts?.maxPages ?? getOlxScrapeMaxPages()
    return scrapeOlxSearchPages(query, sortBy, pages, 1, browser)
  }
  const pages = opts?.maxPages ?? getMonitorScrapeMaxPages()
  return scrapeSearchPages(query, sortBy, condition, pages, 1, browser)
}
