import 'server-only'

import type { Browser, Page } from 'playwright-core'
import type { Product, SortBy, Condition } from './product'
import { ML_PAGE_STEP } from './product'
import { launchBrowser, createScrapeContext } from './scraper-browser'
import { isBrowserClosedError } from './error-message'
import {
  getMonitorScrapeMaxPages,
  isServerlessScrape,
} from './scrape-limits'

export type { Product, SortBy, Condition } from './product'
export { ML_PAGE_STEP } from './product'
export { MONITOR_SCRAPE_MAX_PAGES, getMonitorScrapeMaxPages } from './scrape-limits'

export interface SearchResult {
  products: Product[]
  /** Items on the ML page before exclude filtering */
  scrapedCount: number
}

export interface LoadMoreResult {
  products: Product[]
  lastPage: number
  hasMore: boolean
}

export class MlScrapeBlockedError extends Error {
  readonly code = 'ML_BLOCKED' as const

  constructor() {
    super('O Mercado Livre bloqueou o acesso automático. Tente atualizar em alguns minutos.')
    this.name = 'MlScrapeBlockedError'
  }
}

function buildQuerySlug(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSearchUrl(
  query: string,
  sortBy: SortBy,
  page: number,
  condition: Condition,
): string {
  const slug = buildQuerySlug(query)
  const sortSuffix = sortBy === 'recent' ? '_OrderId_UFRE' : ''
  const offset = (page - 1) * ML_PAGE_STEP + 1
  const pageSuffix = page > 1 ? `_Desde_${offset}` : ''
  const conditionPath = condition === 'new' ? 'novo/' : condition === 'used' ? 'usado/' : ''
  return `https://lista.mercadolivre.com.br/${conditionPath}${slug}${sortSuffix}${pageSuffix}`
}

async function dismissCookieBanner(browserPage: Page): Promise<void> {
  const cookieBtn = browserPage.locator('[data-testid="action:understood-button"]')
  if (await cookieBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cookieBtn.click().catch(() => {})
    await browserPage.waitForTimeout(800)
  }
}

async function isBlockedPage(browserPage: Page): Promise<boolean> {
  return browserPage.evaluate(
    () =>
      !!document.querySelector('.account-verification-main')
      || location.pathname.includes('/gz/account-verification'),
  )
}

async function countResultItems(browserPage: Page): Promise<number> {
  return browserPage.evaluate(
    () => document.querySelectorAll('li.ui-search-layout__item').length,
  )
}

async function scrollResultsGrid(browserPage: Page): Promise<void> {
  const lite = isServerlessScrape()
  await browserPage.evaluate(async (liteScroll: boolean) => {
    if (liteScroll) {
      window.scrollTo(0, Math.min(document.body.scrollHeight, window.innerHeight * 2))
      await new Promise((r) => setTimeout(r, 120))
      window.scrollTo(0, 0)
      return
    }
    const step = Math.max(window.innerHeight, 600)
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 200))
    }
    window.scrollTo(0, 0)
  }, lite)
}

async function scrapeProductsFromPage(browserPage: Page): Promise<Product[]> {
  return browserPage.evaluate((limit: number): Product[] => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('li.ui-search-layout__item'),
    ).slice(0, limit)

    function extractListingId(item: HTMLElement, link: string, title: string): string {
      const hidden = item.querySelector<HTMLInputElement>('input[name="itemId"]')?.value?.trim()
      if (hidden) return hidden.replace(/-/g, '')

      const dataId =
        item.getAttribute('data-item-id')
        ?? item.querySelector<HTMLElement>('[data-item-id]')?.getAttribute('data-item-id')
      if (dataId) return dataId.replace(/-/g, '')

      const widMatch = link.match(/[?&#]wid=(MLB\d+)/i)
      if (widMatch) return widMatch[1].replace(/-/g, '')

      const mlbMatch = link.match(/\/(MLB-?\d+)/i) ?? link.match(/(MLB\d{8,})/i)
      if (mlbMatch) return mlbMatch[1].replace(/-/g, '')

      const mlbuMatch = link.match(/\/(MLBU\d+)/i)
      if (mlbuMatch) return mlbuMatch[1]

      return `${title.slice(0, 20)}-${Math.random().toString(36).slice(2)}`
    }

    return items
      .map((item): Product | null => {
        const titleEl =
          item.querySelector<HTMLAnchorElement>('a.poly-component__title')
          ?? item.querySelector<HTMLAnchorElement>('a.ui-search-item__title')
          ?? item.querySelector<HTMLAnchorElement>('h2 a')
        if (!titleEl) return null

        const title = titleEl.textContent?.trim() ?? ''
        const link = titleEl.href ?? ''
        if (!title) return null

        const priceRoot =
          item.querySelector('.poly-price__current')
          ?? item.querySelector('.ui-search-price')
          ?? item

        const curFraction =
          priceRoot.querySelector('.andes-money-amount__fraction')?.textContent?.trim()
          ?? priceRoot.querySelector('.price-tag-fraction')?.textContent?.trim()
        const curCents =
          priceRoot.querySelector('.andes-money-amount__cents')?.textContent?.trim()
          ?? priceRoot.querySelector('.price-tag-cents')?.textContent?.trim()

        const origFraction = item
          .querySelector('.andes-money-amount--previous .andes-money-amount__fraction')
          ?.textContent?.trim()
        const origCents = item
          .querySelector('.andes-money-amount--previous .andes-money-amount__cents')
          ?.textContent?.trim()

        const discount = item
          .querySelector('.poly-price__disc_label, .andes-money-amount__discount')
          ?.textContent?.trim()
        const installments = item.querySelector('.poly-price__installments')?.textContent?.trim()

        const imgEl = item.querySelector<HTMLImageElement>(
          'img.poly-component__picture, img[data-testid="picture"], img.ui-search-result-image__element',
        )
        const image = imgEl?.src ?? imgEl?.getAttribute('data-src') ?? ''

        const freeShipping = !!item
          .querySelector('[class*="shipping"]')
          ?.textContent?.toLowerCase()
          .includes('grátis')
        const fullShipping = !!item
          .querySelector('[class*="shipping"]')
          ?.innerHTML?.toLowerCase()
          .includes('full')

        const rating = item
          .querySelector('.poly-component__review-compacted .polylabel-label')
          ?.textContent?.trim()
        const seller = item.querySelector('.poly-component__seller')?.textContent?.trim()
        const cond =
          item.querySelector('.poly-component__subtitle')?.textContent?.trim()
          ?? item.querySelector('.ui-search-item__subtitle')?.textContent?.trim()

        let priceStr = curFraction ? `R$ ${curFraction},${curCents ?? '00'}` : ''
        if (!priceStr) {
          const fallback = (priceRoot.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (fallback && /R\$|consulte|grátis|gratis/i.test(fallback)) {
            priceStr = fallback.slice(0, 48)
          }
        }
        if (!priceStr) priceStr = 'Consulte'

        const priceNum = curFraction
          ? parseFloat(`${curFraction.replace(/\./g, '')}.${curCents?.replace(',', '') ?? '00'}`)
          : 0
        const origStr = origFraction ? `R$ ${origFraction},${origCents ?? '00'}` : undefined
        const origNum = origFraction
          ? parseFloat(
              `${origFraction.replace(/\./g, '')}.${origCents?.replace(',', '') ?? '00'}`,
            )
          : undefined

        const id = extractListingId(item, link, title)

        return {
          id, title, price: priceStr, priceNumber: priceNum,
          originalPrice: origStr, originalPriceNumber: origNum,
          discount, installments, image, link, condition: cond,
          freeShipping, fullShipping, rating, seller, detectedAt: 0,
          marketplace: 'ml',
        }
      })
      .filter((p): p is Product => p !== null && p.title !== '')
      .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
  }, ML_PAGE_STEP)
}

async function loadSearchPage(browserPage: Page, url: string): Promise<Product[]> {
  await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await dismissCookieBanner(browserPage)
  await browserPage
    .waitForSelector('li.ui-search-layout__item, .account-verification-main', {
      timeout: 12_000,
    })
    .catch(() => null)

  if (await isBlockedPage(browserPage)) {
    throw new MlScrapeBlockedError()
  }

  let itemsFound = await countResultItems(browserPage)
  if (itemsFound === 0) {
    await browserPage.waitForTimeout(2_000)
    itemsFound = await countResultItems(browserPage)
  }

  if (itemsFound === 0) return []
  await scrollResultsGrid(browserPage)
  return scrapeProductsFromPage(browserPage)
}

async function loadSearchPageWithFallback(
  browserPage: Page,
  query: string,
  sortBy: SortBy,
  page: number,
  condition: Condition,
): Promise<{ products: Product[]; sortUsed: SortBy }> {
  const primaryUrl = buildSearchUrl(query, sortBy, page, condition)
  let products = await loadSearchPage(browserPage, primaryUrl)
  if (products.length > 0 || sortBy === 'relevance') {
    return { products, sortUsed: sortBy }
  }

  const fallbackUrl = buildSearchUrl(query, 'relevance', page, condition)
  products = await loadSearchPage(browserPage, fallbackUrl)
  return { products, sortUsed: 'relevance' }
}

function stampProducts(products: Product[], excludeIds: string[]): SearchResult {
  const exclude = new Set(excludeIds)
  const scrapedCount = products.length
  const filtered = exclude.size > 0 ? products.filter((p) => !exclude.has(p.id)) : products
  const now = Date.now()
  return {
    products: filtered.map((p) => ({ ...p, detectedAt: now })),
    scrapedCount,
  }
}

export async function searchProducts(
  query: string,
  sortBy: SortBy = 'relevance',
  page = 1,
  condition: Condition = 'all',
  excludeIds: string[] = [],
): Promise<SearchResult> {
  const browser = await launchBrowser()

  try {
    const context = await createScrapeContext(browser)
    const browserPage = await context.newPage()
    const { products } = await loadSearchPageWithFallback(
      browserPage,
      query,
      sortBy,
      page,
      condition,
    )
    return stampProducts(products, excludeIds)
  } finally {
    await browser.close()
  }
}

/** Scrape consecutive ML pages in one browser session (deduped, page order). */
export async function scrapeSearchPages(
  query: string,
  sortBy: SortBy = 'relevance',
  condition: Condition = 'all',
  maxPages = getMonitorScrapeMaxPages(),
  startPage = 1,
  browser?: Browser,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  try {
    return await scrapeSearchPagesOnce(query, sortBy, condition, maxPages, startPage, browser)
  } catch (err) {
    if (!isBrowserClosedError(err)) throw err
    if (maxPages <= 1) throw err
    try {
      return await scrapeSearchPagesOnce(query, sortBy, condition, 1, startPage, browser)
    } catch (retryErr) {
      if (!isBrowserClosedError(retryErr) || browser) throw retryErr
      return scrapeSearchPagesOnce(query, sortBy, condition, 1, startPage)
    }
  }
}

async function scrapeSearchPagesOnce(
  query: string,
  sortBy: SortBy,
  condition: Condition,
  maxPages: number,
  startPage: number,
  sharedBrowser?: Browser,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  const ownsBrowser = !sharedBrowser
  const browser = sharedBrowser ?? (await launchBrowser())

  try {
    const context = await createScrapeContext(browser)
    try {
      const browserPage = await context.newPage()
      const allPages: Product[] = []
      const seen = new Set<string>()
      let page1: Product[] = []
      let hasMore = false
      let sortUsed = sortBy

      for (let attempt = 0; attempt < maxPages; attempt++) {
        const pageNum = startPage + attempt
        const { products, sortUsed: used } = await loadSearchPageWithFallback(
          browserPage,
          query,
          sortUsed,
          pageNum,
          condition,
        )
        sortUsed = used

        hasMore = products.length >= ML_PAGE_STEP
        if (pageNum === startPage) page1 = products

        for (const p of products) {
          if (!seen.has(p.id)) {
            seen.add(p.id)
            allPages.push(p)
          }
        }

        if (!hasMore) break
      }

      const now = Date.now()
      const stamp = (list: Product[]) =>
        list.map((p) => ({ ...p, detectedAt: now, marketplace: 'ml' as const }))

      return {
        page1: stamp(page1),
        allPages: stamp(allPages),
        hasMore,
      }
    } finally {
      await context.close()
    }
  } finally {
    if (ownsBrowser) await browser.close()
  }
}

/** Walk ML pages in one browser session until enough new (unseen) products are found. */
export async function searchMoreProducts(
  query: string,
  sortBy: SortBy = 'relevance',
  startPage: number,
  condition: Condition = 'all',
  excludeIds: string[] = [],
  minNew = 20,
  maxPages = 8,
): Promise<LoadMoreResult> {
  const browser = await launchBrowser()

  try {
    const context = await createScrapeContext(browser)
    const browserPage = await context.newPage()
    const seen = new Set(excludeIds)
    const collected: Product[] = []
    let lastPage = startPage - 1
    let hasMore = false
    let sortUsed = sortBy

    for (let attempt = 0; attempt < maxPages && collected.length < minNew; attempt++) {
      const pageNum = startPage + attempt
      const { products, sortUsed: used } = await loadSearchPageWithFallback(
        browserPage,
        query,
        sortUsed,
        pageNum,
        condition,
      )
      sortUsed = used

      hasMore = products.length >= ML_PAGE_STEP
      lastPage = pageNum

      for (const p of products) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          collected.push(p)
        }
      }

      if (!hasMore) break
    }

    const now = Date.now()
    return {
      products: collected.map((p) => ({ ...p, detectedAt: now })),
      lastPage,
      hasMore,
    }
  } finally {
    await browser.close()
  }
}
