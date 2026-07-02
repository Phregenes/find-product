import 'server-only'

import type { Browser, Page } from 'playwright-core'
import type { Product, SortBy, Condition } from './product'
import { ML_PAGE_STEP } from './product'

export type { Product, SortBy, Condition } from './product'
export { ML_PAGE_STEP } from './product'

/** ML pages scanned per cron run for each search. */
export const MONITOR_SCRAPE_MAX_PAGES = 8

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

function getProxy() {
  const isServerless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  if (!isServerless) return undefined

  const server = process.env.PROXY_SERVER?.trim()
  if (!server) return undefined
  return {
    server,
    username: process.env.PROXY_USERNAME?.trim() || undefined,
    password: process.env.PROXY_PASSWORD?.trim() || undefined,
  }
}

async function launchBrowser() {
  const proxy = getProxy()
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ]

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    const executablePath = await chromium.executablePath()
    const { chromium: pw } = await import('playwright-core')
    const args = (chromium.args as string[]).filter((a) => !a.startsWith('--headless'))
    return pw.launch({ args: [...args, ...launchArgs], executablePath, headless: true, proxy })
  }

  const { chromium } = await import('playwright')
  return chromium.launch({ headless: true, args: launchArgs, proxy })
}

async function createScrapeContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  // Keep JS enabled — ML often gates headless traffic without scripts.
  await context.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (type === 'image' || type === 'media' || type === 'font') {
      return route.abort()
    }
    return route.continue()
  })

  await context.addCookies([
    {
      name: '_bm_skipml',
      value: 'true',
      domain: '.mercadolivre.com.br',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 86_400,
    },
  ])

  return context
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

async function scrapeProductsFromPage(browserPage: Page): Promise<Product[]> {
  return browserPage.evaluate((limit: number): Product[] => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('li.ui-search-layout__item'),
    ).slice(0, limit)

    return items
      .map((item): Product | null => {
        const titleEl =
          item.querySelector<HTMLAnchorElement>('a.poly-component__title')
          ?? item.querySelector<HTMLAnchorElement>('a.ui-search-item__title')
          ?? item.querySelector<HTMLAnchorElement>('h2 a')
        if (!titleEl) return null

        const title = titleEl.textContent?.trim() ?? ''
        const link = titleEl.href ?? ''

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

        const priceStr = curFraction ? `R$ ${curFraction},${curCents ?? '00'}` : ''
        const priceNum = curFraction
          ? parseFloat(`${curFraction.replace(/\./g, '')}.${curCents?.replace(',', '') ?? '00'}`)
          : 0
        const origStr = origFraction ? `R$ ${origFraction},${origCents ?? '00'}` : undefined
        const origNum = origFraction
          ? parseFloat(
              `${origFraction.replace(/\./g, '')}.${origCents?.replace(',', '') ?? '00'}`,
            )
          : undefined

        const widMatch = link.match(/[?&#]wid=(MLB\d+)/)
        const anyMatch = link.match(/\/(MLB-?\d+)/) ?? link.match(/(MLB\d{8,})/)
        const rawId = widMatch?.[1] ?? anyMatch?.[1]
        const id = rawId
          ? rawId.replace(/-/g, '')
          : `${title.slice(0, 20)}-${Math.random().toString(36).slice(2)}`

        return {
          id, title, price: priceStr, priceNumber: priceNum,
          originalPrice: origStr, originalPriceNumber: origNum,
          discount, installments, image, link, condition: cond,
          freeShipping, fullShipping, rating, seller, detectedAt: 0,
        }
      })
      .filter((p): p is Product => p !== null && p.title !== '' && p.price !== '')
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
  maxPages = 8,
  startPage = 1,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  const browser = await launchBrowser()

  try {
    const context = await createScrapeContext(browser)
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
    const stamp = (list: Product[]) => list.map((p) => ({ ...p, detectedAt: now }))

    return {
      page1: stamp(page1),
      allPages: stamp(allPages),
      hasMore,
    }
  } finally {
    await browser.close()
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
