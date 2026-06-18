import { chromium as playwrightCore, Browser } from 'playwright-core'

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

const CONDITION_LABEL: Record<Condition, string | null> = {
  all: null,
  new: 'Novo',
  used: 'Usado',
}

const PAGE_SIZE = 20

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--single-process',
  '--no-zygote',
]

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser

  // Production (Vercel / Lambda) — use @sparticuz/chromium serverless binary
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const sparticuz = (await import('@sparticuz/chromium')).default
    browser = await playwrightCore.launch({
      args: [...sparticuz.args, ...LAUNCH_ARGS],
      executablePath: await sparticuz.executablePath(),
      headless: true,
    })
    return browser
  }

  // Local dev — use playwright's bundled Chromium (requires: npx playwright install chromium)
  const { chromium } = await import('playwright')
  browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS })
  return browser
}

export async function searchProducts(
  query: string,
  sortBy: SortBy = 'recent',
  page = 1,
  condition: Condition = 'all',
): Promise<Product[]> {
  const b = await getBrowser()
  const context = await b.newContext({
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

  try {
    const slug = encodeURIComponent(query)
      .replace(/%20/g, '-')
      .replace(/%[0-9A-F]{2}/gi, '-')
    const sortSuffix = sortBy === 'recent' ? '_OrderId_UFRE' : ''
    const offset = (page - 1) * 48 + 1
    const pageSuffix = page > 1 ? `_Desde_${offset}` : ''
    const baseUrl = `https://lista.mercadolivre.com.br/${slug}${sortSuffix}${pageSuffix}`

    await browserPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await browserPage.waitForTimeout(3_000)

    const conditionLabel = CONDITION_LABEL[condition]
    if (conditionLabel) {
      const filteredUrl = await browserPage.evaluate((label: string) => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
        const match = links.find((a) => a.textContent?.trim() === label)
        return match ? match.href.split('#')[0] : null
      }, conditionLabel)

      if (filteredUrl) {
        await browserPage.goto(filteredUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await browserPage.waitForTimeout(3_000)
      }
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
          const condition = item.querySelector('.poly-component__subtitle')?.textContent?.trim()

          const priceStr = curFraction ? `R$ ${curFraction},${curCents ?? '00'}` : ''
          const priceNum = curFraction
            ? parseFloat(
                `${curFraction.replace(/\./g, '')}.${curCents?.replace(',', '') ?? '00'}`,
              )
            : 0
          const origStr = origFraction
            ? `R$ ${origFraction},${origCents ?? '00'}`
            : undefined
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
            id,
            title,
            price: priceStr,
            priceNumber: priceNum,
            originalPrice: origStr,
            originalPriceNumber: origNum,
            discount,
            installments,
            image,
            link,
            condition,
            freeShipping,
            fullShipping,
            rating,
            seller,
            detectedAt: 0,
          }
        })
        .filter((p): p is Product => p !== null && p.title !== '' && p.price !== '')
        .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
    }, PAGE_SIZE)

    const now = Date.now()
    return products.map((p) => ({ ...p, detectedAt: now }))
  } finally {
    await browserPage.close()
    await context.close()
  }
}
