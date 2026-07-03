/** Shared product types — safe to import from client components. */

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
  /** Source marketplace — defaults to ml for legacy snapshots. */
  marketplace?: Marketplace
  location?: string
}

export type SortBy = 'relevance' | 'recent'
export type Condition = 'all' | 'new' | 'used'
export type Marketplace = 'ml' | 'olx'
export type MarketplaceMode = 'ml' | 'olx' | 'both'

/** Mercado Livre lists 48 items per results page. */
export const ML_PAGE_STEP = 48

/** OLX lists ~50 items per page on desktop search. */
export const OLX_PAGE_STEP = 50
