import 'server-only'

import type { Browser, Page } from 'playwright-core'
import type { Product, SortBy, Condition } from './product'
import { ML_PAGE_STEP } from './product'

export type { Product, SortBy, Condition } from './product'
export { ML_PAGE_STEP } from './product'

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

// Navigate to a URL and return how many product items are on the page.
// ML occasionally serves a transient error page, so callers can retry on 0.
async function navigateAndCount(browserPage: Page, url: string): Promise<number> {
  await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await browserPage
    .waitForSelector('li.ui-search-layout__item', { timeout: 6_000 })
    .catch(() => null)
  return browserPage.evaluate(
    () => document.querySelectorAll('li.ui-search-layout__item').length,
  )
}

function getProxy() {
  // Local dev uses the machine's own IP. Proxy is only needed on Vercel/serverless
  // where datacenter IPs get blocked by Mercado Livre.
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

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    const executablePath = await chromium.executablePath()
    const { chromium: pw } = await import('playwright-core')
    const args = (chromium.args as string[]).filter((a) => !a.startsWith('--headless'))
    return pw.launch({ args, executablePath, headless: true, proxy })
  }

  const { chromium } = await import('playwright')
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    proxy,
  })
}

async function createScrapeContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 720 },
  })

  // ML server-renders the full listing into the initial HTML document, so we
  // don't need JS/CSS to read titles/prices. Aborting script + stylesheet (on
  // top of image/media/font) cuts ~1.75 MB/page down to ~0.2 MB/page (~8x less
  // proxy bandwidth) with no loss of product data.
  await context.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (
      type === 'image' ||
      type === 'media' ||
      type === 'font' ||
      type === 'stylesheet' ||
      type === 'script'
    ) {
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
      expires: Math.floor(Date.now() / 1000) + 300,
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
  const slug = encodeURIComponent(query)
    .replace(/%20/g, '-')
    .replace(/%[0-9A-F]{2}/gi, '-')
  const sortSuffix = sortBy === 'recent' ? '_OrderId_UFRE' : ''
  const offset = (page - 1) * ML_PAGE_STEP + 1
  const pageSuffix = page > 1 ? `_Desde_${offset}` : ''
  const conditionPath = condition === 'new' ? 'novo/' : condition === 'used' ? 'usado/' : ''
  return `https://lista.mercadolivre.com.br/${conditionPath}${slug}${sortSuffix}${pageSuffix}`
}

async function scrapeProductsFromPage(browserPage: Page): Promise<Product[]> {
  return browserPage.evaluate((limit: number): Product[] => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('li.ui-search-layout__item'),
    ).slice(0, limit)

    return items
      .map((item): Product | null => {
        const titleEl = item.querySelector<HTMLAnchorElement>('a.poly-component__title')
        if (!titleEl) return null

        const title = titleEl.textContent?.trim() ?? ''
        const link = titleEl.href ?? ''

        const curFraction = item
          .querySelector('.poly-price__current .andes-money-amount__fraction')
          ?.textContent?.trim()
        const curCents = item
          .querySelector('.poly-price__current .andes-money-amount__cents')
          ?.textContent?.trim()
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
          'img.poly-component__picture, img[data-testid="picture"]',
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
        const cond = item.querySelector('.poly-component__subtitle')?.textContent?.trim()

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
  let itemsFound = await navigateAndCount(browserPage, url)
  if (itemsFound === 0) {
    await browserPage.waitForTimeout(1_500)
    itemsFound = await navigateAndCount(browserPage, url)
  }
  return scrapeProductsFromPage(browserPage)
}

export async function searchProducts(
  query: string,
  sortBy: SortBy = 'recent',
  page = 1,
  condition: Condition = 'all',
  excludeIds: string[] = [],
): Promise<SearchResult> {
  const browser = await launchBrowser()

  try {
    const context = await createScrapeContext(browser)
    const browserPage = await context.newPage()
    const products = await loadSearchPage(
      browserPage,
      buildSearchUrl(query, sortBy, page, condition),
    )

    const exclude = new Set(excludeIds)
    const scrapedCount = products.length
    const filtered = exclude.size > 0 ? products.filter((p) => !exclude.has(p.id)) : products
    const now = Date.now()

    return {
      products: filtered.map((p) => ({ ...p, detectedAt: now })),
      scrapedCount,
    }
  } finally {
    await browser.close()
  }
}

/** Walk ML pages in one browser session until enough new (unseen) products are found. */
export async function searchMoreProducts(
  query: string,
  sortBy: SortBy = 'recent',
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

    for (let attempt = 0; attempt < maxPages && collected.length < minNew; attempt++) {
      const page = startPage + attempt
      const products = await loadSearchPage(
        browserPage,
        buildSearchUrl(query, sortBy, page, condition),
      )

      hasMore = products.length >= ML_PAGE_STEP
      lastPage = page

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
