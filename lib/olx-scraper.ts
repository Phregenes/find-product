import 'server-only'

import type { Page } from 'playwright-core'
import type { Product, SortBy } from './product'
import { OLX_PAGE_STEP } from './product'
import { launchBrowser, createScrapeContext } from './scraper-browser'

export const OLX_SCRAPE_MAX_PAGES = 8

export class OlxScrapeBlockedError extends Error {
  readonly code = 'OLX_BLOCKED' as const

  constructor() {
    super('A OLX bloqueou o acesso automático. Tente novamente em alguns minutos.')
    this.name = 'OlxScrapeBlockedError'
  }
}

function buildOlxSearchUrl(query: string, sortBy: SortBy, page: number): string {
  const params = new URLSearchParams()
  params.set('q', query.trim())
  if (page > 1) params.set('page', String(page))
  params.set('o', sortBy === 'recent' ? '2' : '1')
  return `https://www.olx.com.br/brasil?${params.toString()}`
}

function parseOlxPrice(text: string): { price: string; priceNumber: number } {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || /grátis|gratis|consulte/i.test(cleaned)) {
    return { price: cleaned || 'Consulte', priceNumber: 0 }
  }
  const match = cleaned.match(/R\$\s*([\d.]+)(?:,(\d{2}))?/)
  if (!match) return { price: cleaned.slice(0, 48), priceNumber: 0 }
  const priceNumber = parseFloat(`${match[1].replace(/\./g, '')}.${match[2] ?? '00'}`)
  return { price: cleaned.slice(0, 48), priceNumber }
}

async function dismissOlxCookies(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="action:understood-button"], button:has-text("Aceitar")')
  if (await btn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.first().click().catch(() => {})
    await page.waitForTimeout(600)
  }
}

async function isOlxBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = document.body?.innerText?.toLowerCase() ?? ''
    return body.includes('captcha') || body.includes('acesso negado') || body.includes('robot')
  })
}

async function scrapeOlxFromPage(page: Page): Promise<Product[]> {
  return page.evaluate((limit: number): Product[] => {
    function pickUrl(raw: string | null | undefined): string {
      if (!raw) return ''
      const trimmed = raw.trim()
      if (!trimmed || trimmed.startsWith('data:')) return ''
      if (trimmed.startsWith('http')) return trimmed.split(/\s/)[0] ?? ''
      if (trimmed.startsWith('//')) return `https:${trimmed.split(/\s/)[0] ?? ''}`
      return ''
    }

    function extractImage(card: HTMLElement): string {
      const img =
        card.querySelector<HTMLImageElement>('img.olx-adcard__media')
        ?? card.querySelector<HTMLImageElement>('img[data-testid="ad-image"]')
        ?? card.querySelector<HTMLImageElement>('img')

      if (img) {
        for (const attr of ['src', 'data-src', 'data-lazy', 'data-original', 'data-lazy-src']) {
          const url = pickUrl(img.getAttribute(attr))
          if (url) return url
        }
        const srcset = img.getAttribute('srcset')
        if (srcset) {
          const url = pickUrl(srcset.split(',')[0])
          if (url) return url
        }
        const fromSrc = pickUrl(img.currentSrc || img.src)
        if (fromSrc) return fromSrc
      }

      const source = card.querySelector<HTMLSourceElement>('picture source[srcset], source[srcset]')
      if (source) {
        const url = pickUrl(source.getAttribute('srcset')?.split(',')[0])
        if (url) return url
      }

      const styled = card.querySelector<HTMLElement>('[style*="background-image"]')
      const bg = styled?.style.backgroundImage ?? ''
      const match = bg.match(/url\(["']?(https?:\/\/[^"')]+)/i)
      if (match?.[1]) return match[1]

      return ''
    }

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        'section.olx-adcard, li[data-testid="ad-list-item"], [data-ds-component="DS-AdCard"]',
      ),
    ).slice(0, limit)

    return cards
      .map((card): Product | null => {
        const linkEl =
          card.querySelector<HTMLAnchorElement>('a[href*="olx.com.br"]')
          ?? card.querySelector<HTMLAnchorElement>('a')
        if (!linkEl) return null

        const link = linkEl.href ?? ''
        const title =
          card.querySelector('h2')?.textContent?.trim()
          ?? linkEl.getAttribute('title')?.trim()
          ?? linkEl.textContent?.trim()
          ?? ''
        if (!title || title.length < 3) return null

        const priceEl =
          card.querySelector('[data-testid="ad-price"]')
          ?? card.querySelector('p[class*="price"]')
          ?? card.querySelector('[class*="Price"]')
        const priceRaw = priceEl?.textContent?.trim() ?? ''

        const location =
          card.querySelector('[class*="location"]')?.textContent?.trim()
          ?? card.querySelector('p[class*="Location"]')?.textContent?.trim()
          ?? undefined

        let image = extractImage(card)
        if (!image) {
          const media = card.querySelector<HTMLElement>('.olx-adcard__media, [class*="adcard__media"]')
          if (media) image = extractImage(media)
        }

        const patterns = [
          /-(\d{8,})(?:\?|#|$)/,
          /\/vi\/(\d+)/,
          /[?&]id=(\d+)/,
          /\.olx\.com\.br\/[^/]+\/[^/]+\/[^/]+-(\d+)/,
        ]
        let id: string | null = null
        for (const re of patterns) {
          const m = link.match(re)
          if (m) {
            id = `olx:${m[1]}`
            break
          }
        }
        if (!id) return null

        return {
          id,
          title,
          price: priceRaw || 'Consulte',
          priceNumber: 0,
          image,
          link,
          location,
          freeShipping: false,
          fullShipping: false,
          detectedAt: 0,
          marketplace: 'olx',
        }
      })
      .filter((p): p is Product => p !== null)
      .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
  }, OLX_PAGE_STEP)
}

async function scrollOlxResults(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = 400
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 80))
    }
    window.scrollTo(0, 0)
  })
}

async function loadOlxPage(page: Page, url: string): Promise<Product[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await dismissOlxCookies(page)
  await page.waitForSelector(
    'section.olx-adcard, li[data-testid="ad-list-item"], [data-ds-component="DS-AdCard"], body',
    { timeout: 12_000 },
  ).catch(() => null)

  if (await isOlxBlocked(page)) throw new OlxScrapeBlockedError()

  await scrollOlxResults(page)
  await page.waitForTimeout(800)

  let products = await scrapeOlxFromPage(page)
  if (products.length === 0) {
    await page.waitForTimeout(2000)
    products = await scrapeOlxFromPage(page)
  }

  return products.map((p) => {
    const parsed = parseOlxPrice(p.price)
    return { ...p, price: parsed.price, priceNumber: parsed.priceNumber }
  })
}

/** Scrape consecutive OLX pages in one browser session (deduped). */
export async function scrapeOlxSearchPages(
  query: string,
  sortBy: SortBy = 'relevance',
  maxPages = OLX_SCRAPE_MAX_PAGES,
  startPage = 1,
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  const browser = await launchBrowser()

  try {
    const context = await createScrapeContext(browser, { blockImages: false })
    const browserPage = await context.newPage()
    const allPages: Product[] = []
    const seen = new Set<string>()
    let page1: Product[] = []
    let hasMore = false

    for (let attempt = 0; attempt < maxPages; attempt++) {
      const pageNum = startPage + attempt
      const products = await loadOlxPage(browserPage, buildOlxSearchUrl(query, sortBy, pageNum))
      hasMore = products.length >= OLX_PAGE_STEP
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
      list.map((p) => ({ ...p, detectedAt: now, marketplace: 'olx' as const }))

    return {
      page1: stamp(page1),
      allPages: stamp(allPages),
      hasMore,
    }
  } finally {
    await browser.close()
  }
}
