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
}

export type SortBy = 'relevance' | 'recent'
export type Condition = 'all' | 'new' | 'used'

/** Mercado Livre lists 48 items per results page. */
export const ML_PAGE_STEP = 48
