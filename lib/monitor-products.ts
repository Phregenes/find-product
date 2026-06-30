import type { Product } from '@/lib/product'

/** Unseen listings first, then the rest of page 1 (deduped by id). */
export function buildMonitorProductList(
  page1: Product[],
  allPages: Product[],
  seenIds: Set<string>,
): { products: Product[]; newCount: number } {
  const newProducts = allPages.filter((p) => !seenIds.has(p.id))
  const newIds = new Set(newProducts.map((p) => p.id))
  const products = mergeNewFirst(newProducts, page1)
  return { products, newCount: newIds.size }
}

function mergeNewFirst(newProducts: Product[], page1: Product[]): Product[] {
  const seen = new Set<string>()
  const merged: Product[] = []

  for (const p of newProducts) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      merged.push(p)
    }
  }
  for (const p of page1) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      merged.push(p)
    }
  }
  return merged
}
