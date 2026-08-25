import type { Marketplace, MarketplaceMode, Product } from './product'
import {
  type PlanConfig,
  defaultMarketplaceMode,
  planAllowsMarketplaceMode,
} from './plans'

export const MARKETPLACE_MODE_OPTIONS: Array<{
  id: MarketplaceMode
  label: string
  description: string
}> = [
  {
    id: 'ml',
    label: 'Mercado Livre',
    description: 'Só anúncios do Mercado Livre.',
  },
  {
    id: 'olx',
    label: 'OLX',
    description: 'Só anúncios da OLX.',
  },
  {
    id: 'enjoei',
    label: 'Enjoei',
    description: 'Só anúncios do Enjoei.',
  },
  {
    id: 'both',
    label: 'ML + OLX + Enjoei',
    description: 'Mesma busca nos três sites, resultados juntos.',
  },
]

export function parseMarketplaceMode(value: unknown): MarketplaceMode {
  if (value === 'olx' || value === 'enjoei' || value === 'both') return value
  return 'ml'
}

export function marketplaceModeRequiresOlx(mode: MarketplaceMode): boolean {
  return mode === 'olx' || mode === 'enjoei' || mode === 'both'
}

/** Clamp to a mode the plan actually allows. */
export function normalizeMarketplaceModeForPlan(
  mode: MarketplaceMode,
  plan: PlanConfig,
): MarketplaceMode {
  if (planAllowsMarketplaceMode(plan, mode)) return mode
  return defaultMarketplaceMode(plan)
}

export function marketplaceModeLabel(mode: MarketplaceMode): string {
  return MARKETPLACE_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? 'Mercado Livre'
}

/** Detect marketplace for listings (incl. snapshots antigos sem campo marketplace). */
export function inferProductMarketplace(product: Product): Marketplace {
  if (
    product.marketplace === 'olx'
    || product.marketplace === 'ml'
    || product.marketplace === 'enjoei'
  ) {
    return product.marketplace
  }
  if (product.id.startsWith('olx:')) return 'olx'
  if (product.id.startsWith('enjoei:')) return 'enjoei'
  if (/olx\.com\.br/i.test(product.link)) return 'olx'
  if (/enjoei\.com\.br/i.test(product.link)) return 'enjoei'
  return 'ml'
}

export function productMarketplaceLabel(marketplace: Marketplace): string {
  if (marketplace === 'olx') return 'OLX'
  if (marketplace === 'enjoei') return 'Enjoei'
  return 'Mercado Livre'
}

/** Some CDNs return 403 when Referer is our app domain. */
export function productImageReferrerPolicy(imageUrl: string): 'no-referrer' | undefined {
  if (/img\.olx\.com\.br/i.test(imageUrl)) return 'no-referrer'
  if (/photos\.enjoei\.com\.br|images\.enjoei\.com\.br/i.test(imageUrl)) return 'no-referrer'
  return undefined
}

/**
 * Rewrite legacy Enjoei image URLs (decoded S3 path → 404) to the CDN format
 * `…/public/{size}/{base64(s3://…)}` used by enjuphotos.
 */
export function normalizeProductImageUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl
  const legacy = imageUrl.match(
    /^https?:\/\/photos\.enjoei\.com\.br\/((?:products|users)\/[^\s?#]+)$/i,
  )
  if (!legacy) return imageUrl
  const s3 = `s3://photos.enjoei.com.br/${legacy[1]}`
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(s3, 'utf8').toString('base64')
      : btoa(s3)
  return `https://photos.enjoei.com.br/public/500x500/${b64.replace(/=+$/, '')}`
}

/** Fix legacy Enjoei product links missing `/p/` (they redirect to the homepage). */
export function normalizeProductLink(link: string): string {
  if (!link || !/enjoei\.com\.br/i.test(link)) return link
  try {
    const u = new URL(link)
    if (!u.hostname.endsWith('enjoei.com.br')) return link
    const path = u.pathname.replace(/^\/+/, '')
    if (
      !path
      || path.startsWith('p/')
      || path.startsWith('@')
      || path.startsWith('s/')
      || path === 's'
    ) {
      return link
    }
    // Product slugs end with numeric id: ...-123456
    if (!/-\d+$/.test(path.split('/')[0] ?? '')) return link
    u.pathname = `/p/${path}`
    return u.toString()
  } catch {
    return link
  }
}

export function newProductsEmailHeadline(mode: MarketplaceMode): string {
  if (mode === 'olx') return 'Novos anúncios na OLX'
  if (mode === 'enjoei') return 'Novos anúncios no Enjoei'
  if (mode === 'both') return 'Novos anúncios no ML, OLX e Enjoei'
  return 'Novos anúncios no Mercado Livre'
}

export function marketplaceBadgeEmailHtml(marketplace: Marketplace): string {
  if (marketplace === 'olx') {
    return `<span style="display:inline-block;background:#f97316;color:#ffffff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:0.02em;">OLX</span>`
  }
  if (marketplace === 'enjoei') {
    return `<span style="display:inline-block;background:#ec4899;color:#ffffff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:0.02em;">Enjoei</span>`
  }
  return `<span style="display:inline-block;background:#facc15;color:#18181b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:0.02em;">ML</span>`
}
