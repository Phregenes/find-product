import type { Marketplace, MarketplaceMode, Product } from './product'

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
    id: 'both',
    label: 'ML + OLX',
    description: 'Mesma busca nos dois sites, resultados juntos.',
  },
]

export function parseMarketplaceMode(value: unknown): MarketplaceMode {
  if (value === 'olx' || value === 'both') return value
  return 'ml'
}

export function marketplaceModeLabel(mode: MarketplaceMode): string {
  return MARKETPLACE_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? 'Mercado Livre'
}

/** Detect ML vs OLX for listings (incl. snapshots antigos sem campo marketplace). */
export function inferProductMarketplace(product: Product): Marketplace {
  if (product.marketplace === 'olx' || product.marketplace === 'ml') return product.marketplace
  if (product.id.startsWith('olx:')) return 'olx'
  if (/olx\.com\.br/i.test(product.link)) return 'olx'
  return 'ml'
}

export function productMarketplaceLabel(marketplace: Marketplace): string {
  return marketplace === 'olx' ? 'OLX' : 'Mercado Livre'
}

/** OLX CDN returns 403 when Referer is not olx.com.br — strip referer in <img>. */
export function productImageReferrerPolicy(imageUrl: string): 'no-referrer' | undefined {
  if (/img\.olx\.com\.br/i.test(imageUrl)) return 'no-referrer'
  return undefined
}
