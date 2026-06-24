import type { Page } from 'playwright-core'

export interface Product {
  id: string
  title: string
  price: string
  priceNumber: number
  originalPrice?: string
  originalPriceNumber?: number
  discount?: string
  installments?: string
  image: string
  link: string
  condition?: string
  freeShipping: boolean
  fullShipping: boolean
  rating?: string
  seller?: string
  detectedAt: number
}

export type SortBy = 'relevance' | 'recent'
export type Condition = 'all' | 'new' | 'used'

const PAGE_SIZE = 20

// Navigate to a URL and return how many product items are on the page.
// ML occasionally serves a transient error page, so callers can retry on 0.
async function navigateAndCount(browserPage: Page, url: string): Promise<number> {
  await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await browserPage
    .waitForSelector('li.ui-search-layout__item', { timeout: 6_000 })
    .catch(() => null)
  return browserPage.evaluate(() => document.querySelectorAll('li.ui-search-layout__item').length)
}

async function launchBrowser() {
  // Production (Vercel / Lambda)
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    const executablePath = await chromium.executablePath()
    const { chromium: pw } = await import('playwright-core')
    // Filter --headless from sparticuz to avoid conflict with Playwright's headless:true
    const args = (chromium.args as string[]).filter((a) => !a.startsWith('--headless'))
    return pw.launch({ args, executablePath, headless: true })
  }

  // Local dev — use playwright's bundled Chromium
  const { chromium } = await import('playwright')
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

export async function searchProducts(
  query: string,
  sortBy: SortBy = 'recent',
  page = 1,
  condition: Condition = 'all',
): Promise<Product[]> {
  // Fresh browser per request — avoids stale singleton state between calls
  const browser = await launchBrowser()

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      viewport: { width: 1280, height: 720 },
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

    const browserPage = await context.newPage()

    const slug = encodeURIComponent(query)
      .replace(/%20/g, '-')
      .replace(/%[0-9A-F]{2}/gi, '-')
    const sortSuffix = sortBy === 'recent' ? '_OrderId_UFRE' : ''
    const offset = (page - 1) * 48 + 1
    const pageSuffix = page > 1 ? `_Desde_${offset}` : ''

    // ML uses a path prefix for condition filtering: /novo/slug or /usado/slug
    const conditionPath = condition === 'new' ? 'novo/' : condition === 'used' ? 'usado/' : ''
    const targetUrl = `https://lista.mercadolivre.com.br/${conditionPath}${slug}${sortSuffix}${pageSuffix}`

    // Navigate directly to the (filtered) URL. ML sometimes returns a transient error
    // page — retry once if no product items are found.
    let itemsFound = await navigateAndCount(browserPage, targetUrl)
    if (itemsFound === 0) {
      await browserPage.waitForTimeout(1_500)
      itemsFound = await navigateAndCount(browserPage, targetUrl)
    }

    const products = await browserPage.evaluate((limit: number): Product[] => {
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
          const id =
            widMatch?.[1] ??
            anyMatch?.[1] ??
            `${title.slice(0, 20)}-${Math.random().toString(36).slice(2)}`

          return {
            id, title, price: priceStr, priceNumber: priceNum,
            originalPrice: origStr, originalPriceNumber: origNum,
            discount, installments, image, link, condition: cond,
            freeShipping, fullShipping, rating, seller, detectedAt: 0,
          }
        })
        .filter((p): p is Product => p !== null && p.title !== '' && p.price !== '')
        .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
    }, PAGE_SIZE)

    const now = Date.now()
    return products.map((p) => ({ ...p, detectedAt: now }))
  } finally {
    // Always close browser — no singleton, clean state for next request
    await browser.close()
  }
}
