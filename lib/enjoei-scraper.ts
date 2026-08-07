import 'server-only'

import type { Product, SortBy } from './product'
import { ENJOEI_PAGE_STEP } from './product'
import { getEnjoeiScrapeMaxPages } from './scrape-limits'
import {
  isProxyEnabled,
  recordProxyUsageEvent,
  type ProxyUsageSource,
} from './proxy-usage'

export { ENJOEI_SCRAPE_MAX_PAGES, getEnjoeiScrapeMaxPages } from './scrape-limits'

export class EnjoeiScrapeBlockedError extends Error {
  readonly code = 'ENJOEI_BLOCKED' as const

  constructor() {
    super('O Enjoei bloqueou o acesso automático. Tente novamente em alguns minutos.')
    this.name = 'EnjoeiScrapeBlockedError'
  }
}

const ENJOEI_GRAPHQL = 'https://enjusearch.enjoei.com.br/graphql'

const SEARCH_PRODUCTS_QUERY = `
query searchProducts($term: String!, $search_source: String, $first: Int, $after: String) {
  search(search_source: $search_source, products: { term: $term }) {
    products(first: $first, after: $after) {
      total
      edges {
        cursor
        node {
          id
          used
          path
          photo { image_public_id }
          title { name }
          brand { displayable_name }
          price { original current }
          shipping { free }
          store { path displayable { name } }
        }
      }
    }
  }
}
`

interface EnjoeiNode {
  id: string
  used?: boolean
  path?: string
  photo?: { image_public_id?: string | null } | null
  title?: { name?: string | null } | null
  brand?: { displayable_name?: string | null } | null
  price?: { original?: number | null; current?: number | null } | null
  shipping?: { free?: boolean | null } | null
  store?: { path?: string | null; displayable?: { name?: string | null } | null } | null
}

function formatPrice(value: number | null | undefined): { price: string; priceNumber: number } {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return { price: 'Consulte', priceNumber: 0 }
  }
  const priceNumber = Math.round(value * 100) / 100
  const formatted = priceNumber.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return { price: formatted, priceNumber }
}

/** Enjoei stores photo ids as base64(s3://photos.enjoei.com.br/...). */
export function enjoeiPhotoUrl(imagePublicId: string | null | undefined): string {
  if (!imagePublicId) return ''
  try {
    const pad = '='.repeat((4 - (imagePublicId.length % 4)) % 4)
    const decoded = Buffer.from(imagePublicId + pad, 'base64').toString('utf8')
    if (decoded.startsWith('s3://photos.enjoei.com.br/')) {
      return `https://photos.enjoei.com.br/${decoded.slice('s3://photos.enjoei.com.br/'.length)}`
    }
    if (decoded.startsWith('http')) return decoded
  } catch {
    /* ignore */
  }
  return ''
}

function nodeToProduct(node: EnjoeiNode): Product | null {
  const idRaw = String(node.id ?? '').trim()
  const title = node.title?.name?.trim() ?? ''
  const path = node.path?.trim() ?? ''
  if (!idRaw || !title || !path) return null

  const current = node.price?.current
  const original = node.price?.original
  const { price, priceNumber } = formatPrice(current ?? original)
  const orig = original != null && current != null && original > current
    ? formatPrice(original)
    : null

  return {
    id: `enjoei:${idRaw}`,
    title,
    price,
    priceNumber,
    originalPrice: orig?.price,
    originalPriceNumber: orig?.priceNumber,
    image: enjoeiPhotoUrl(node.photo?.image_public_id),
    link: `https://www.enjoei.com.br/${path}`,
    condition: node.used === false ? 'Novo' : node.used === true ? 'Usado' : undefined,
    freeShipping: !!node.shipping?.free,
    fullShipping: false,
    seller: node.store?.displayable?.name?.trim() || undefined,
    detectedAt: 0,
    marketplace: 'enjoei',
  }
}

async function fetchEnjoeiPage(
  query: string,
  after: string | null,
  pageSize: number,
): Promise<{ products: Product[]; endCursor: string | null; hasMore: boolean }> {
  const res = await fetch(ENJOEI_GRAPHQL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: 'https://www.enjoei.com.br',
      referer: `https://www.enjoei.com.br/s/?q=${encodeURIComponent(query)}`,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      operationName: 'searchProducts',
      variables: {
        term: query.trim(),
        search_source: 'search',
        first: pageSize,
        after,
      },
      query: SEARCH_PRODUCTS_QUERY,
    }),
  })

  if (res.status === 403 || res.status === 429) throw new EnjoeiScrapeBlockedError()
  if (!res.ok) {
    throw new Error(`Enjoei GraphQL HTTP ${res.status}`)
  }

  const json = (await res.json()) as {
    errors?: Array<{ message?: string }>
    data?: {
      search?: {
        products?: {
          edges?: Array<{ cursor?: string; node?: EnjoeiNode }>
        }
      }
    }
  }

  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).filter(Boolean).join('; ')
    if (/blocked|forbidden|captcha|rate/i.test(msg)) throw new EnjoeiScrapeBlockedError()
    throw new Error(`Enjoei GraphQL: ${msg.slice(0, 200)}`)
  }

  const edges = json.data?.search?.products?.edges ?? []
  const products = edges
    .map((e) => (e.node ? nodeToProduct(e.node) : null))
    .filter((p): p is Product => p !== null)

  const endCursor = edges.length > 0 ? (edges[edges.length - 1]?.cursor ?? null) : null
  const hasMore = edges.length >= pageSize && !!endCursor
  return { products, endCursor, hasMore }
}

/**
 * Scrape Enjoei via public GraphQL (no Playwright).
 * `sortBy` is accepted for API parity; Enjoei search uses relevance ranking.
 */
export async function scrapeEnjoeiSearchPages(
  query: string,
  _sortBy: SortBy = 'relevance',
  maxPages = getEnjoeiScrapeMaxPages(),
  _startPage = 1,
  leanBandwidth = false,
  usageSource: ProxyUsageSource = leanBandwidth ? 'cron' : 'search',
): Promise<{ page1: Product[]; allPages: Product[]; hasMore: boolean }> {
  const started = Date.now()
  const allPages: Product[] = []
  const seen = new Set<string>()
  let page1: Product[] = []
  let after: string | null = null
  let hasMore = false

  try {
    for (let page = 0; page < maxPages; page++) {
      const batch = await fetchEnjoeiPage(query, after, ENJOEI_PAGE_STEP)
      if (page === 0) page1 = batch.products
      for (const p of batch.products) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          allPages.push(p)
        }
      }
      hasMore = batch.hasMore
      after = batch.endCursor
      if (!hasMore) break
    }
  } finally {
    if (isProxyEnabled()) {
      await recordProxyUsageEvent({
        source: usageSource,
        marketplace: 'enjoei',
        query,
        leanBandwidth,
        maxPages,
        bytesDownloaded: 0,
        bytesUploaded: 0,
        requestCount: Math.max(1, Math.min(maxPages, allPages.length || 1)),
        durationMs: Date.now() - started,
      }).catch(() => {})
    }
  }

  const now = Date.now()
  const stamp = (list: Product[]) =>
    list.map((p) => ({ ...p, detectedAt: now, marketplace: 'enjoei' as const }))

  return {
    page1: stamp(page1),
    allPages: stamp(allPages),
    hasMore,
  }
}
