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

/** OLX / Enjoei / combo — requires Lojista+ (`olxAccess`). */
export function marketplaceModeRequiresOlx(mode: MarketplaceMode): boolean {
  return mode === 'olx' || mode === 'enjoei' || mode === 'both'
}

/** Downgrade to ML-only when the user's plan does not include extra marketplaces. */
export function normalizeMarketplaceModeForPlan(
  mode: MarketplaceMode,
  olxAccess: boolean,
): MarketplaceMode {
  if (!olxAccess && marketplaceModeRequiresOlx(mode)) return 'ml'
  return mode
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
