import 'server-only'

import type { Product } from '@/lib/product'
import { createAdminClient } from '@/lib/supabase/admin'
import { toErrorMessage } from '@/lib/error-message'
import type { Condition, SortBy } from '@/lib/product'
import { scrapeSearchPages } from '@/lib/scraper'
import { getMonitorSeenIds } from '@/lib/monitor-seen'
import { buildMonitorProductList } from '@/lib/monitor-products'
import { applyMonitorFilter } from '@/lib/monitor-filter-apply'

export async function loadPendingNewProducts(monitorId: string): Promise<Product[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('monitor_new_products')
    .select('product, found_at')
    .eq('monitor_id', monitorId)
    .order('found_at', { ascending: false })
  if (error) throw new Error(toErrorMessage(error))
  return (data ?? []).map((row) => row.product as Product)
}

export async function replacePendingNewProducts(
  monitorId: string,
  products: Product[],
): Promise<void> {
  const admin = createAdminClient()
  const { error: delErr } = await admin
    .from('monitor_new_products')
    .delete()
    .eq('monitor_id', monitorId)
  if (delErr) throw new Error(toErrorMessage(delErr))
  if (products.length === 0) return

  const now = new Date().toISOString()
  const rows = products.map((p) => ({
    monitor_id: monitorId,
    product_id: p.id,
    product: p,
    found_at: now,
  }))
  const { error } = await admin.from('monitor_new_products').insert(rows)
  if (error) throw new Error(toErrorMessage(error))
}

/** Merge freshly discovered unseen listings into pending storage. */
export async function syncPendingNewProducts(
  monitorId: string,
  discovered: Product[],
): Promise<Product[]> {
  const seenIds = await getMonitorSeenIds(monitorId)
  const existing = await loadPendingNewProducts(monitorId)
  const map = new Map(existing.map((p) => [p.id, p]))

  for (const p of discovered) {
    if (seenIds.has(p.id)) {
      map.delete(p.id)
    } else {
      map.set(p.id, p)
    }
  }

  const pending = [...map.values()]
  await replacePendingNewProducts(monitorId, pending)
  return pending
}

export async function clearPendingNewProducts(
  monitorId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('monitor_new_products')
    .delete()
    .eq('monitor_id', monitorId)
    .in('product_id', productIds)
  if (error) throw new Error(toErrorMessage(error))
}

/** Drop pending items that no longer appear anywhere in the scanned ML pages. */
export async function prunePendingNewProducts(
  monitorId: string,
  scannedIds: Set<string>,
): Promise<Product[]> {
  const pending = await loadPendingNewProducts(monitorId)
  // Failed/empty scrape — keep pending rather than wiping the list.
  if (scannedIds.size === 0) return pending

  const kept = pending.filter((p) => scannedIds.has(p.id))
  if (kept.length !== pending.length) {
    await replacePendingNewProducts(monitorId, kept)
  }
  return kept
}

export async function discoverNewProducts(
  monitorId: string,
  q: string,
  sort: SortBy,
  condition: Condition,
  maxPages = 8,
): Promise<{ pending: Product[]; page1: Product[]; hasMore: boolean }> {
  const admin = createAdminClient()
  const { data: monitorRow } = await admin
    .from('monitors')
    .select('query, filter_mode, exclude_terms')
    .eq('id', monitorId)
    .maybeSingle()

  const seenIds = await getMonitorSeenIds(monitorId)
  if (seenIds.size === 0) {
    return { pending: [], page1: [], hasMore: false }
  }

  const { page1, allPages, hasMore } = await scrapeSearchPages(q, sort, condition, maxPages, 1)
  const filterSource = monitorRow ?? { query: q, filter_mode: 'default' as const, exclude_terms: [] }
  const filteredPages = applyMonitorFilter(allPages, filterSource)
  const page1Filtered = applyMonitorFilter(page1, filterSource)
  const scannedIds = new Set(filteredPages.map((p) => p.id))
  const discovered = filteredPages.filter((p) => !seenIds.has(p.id))

  await syncPendingNewProducts(monitorId, discovered)
  const pending = await prunePendingNewProducts(monitorId, scannedIds)

  return { pending, page1: page1Filtered, hasMore }
}

export async function mergeWithPendingNew(
  monitorId: string,
  page1: Product[],
): Promise<{ products: Product[]; newCount: number; pending: Product[] }> {
  const seenIds = await getMonitorSeenIds(monitorId)
  const pending = await loadPendingNewProducts(monitorId)
  if (seenIds.size === 0) {
    return { products: page1, newCount: 0, pending: [] }
  }

  const pendingIds = new Set(pending.map((p) => p.id))
  const allPages = [...pending]
  for (const p of page1) {
    if (!pendingIds.has(p.id)) allPages.push(p)
  }

  const built = buildMonitorProductList(page1, allPages, seenIds)
  return { products: built.products, newCount: built.newCount, pending }
}
