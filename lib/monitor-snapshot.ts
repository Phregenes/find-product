import 'server-only'

import type { Product } from '@/lib/product'
import type { MonitorFilterMode } from '@/lib/monitor-filter'
import { parseFilterMode } from '@/lib/monitor-filter'
import type { PlanConfig } from '@/lib/plans'
import { isSnapshotDue } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MonitorSnapshotRow {
  id: string
  user_id: string
  query: string
  search_id: string
  snapshot_products: Product[] | null
  snapshot_search_id: string | null
  snapshot_at: string | null
  last_checked_at: string | null
  new_count: number
  filter_mode: MonitorFilterMode
  exclude_terms: string[]
}

interface SnapshotPayload {
  searchId: string
  products: Product[]
}

function parseSnapshot(raw: unknown): SnapshotPayload | null {
  if (!raw || typeof raw !== 'object') return null

  // New format: { searchId, products }
  if ('searchId' in raw && 'products' in raw) {
    const payload = raw as SnapshotPayload
    if (typeof payload.searchId !== 'string' || !Array.isArray(payload.products)) return null
    return payload
  }

  // Legacy format: bare Product[] — cannot trust condition after filter changes.
  if (Array.isArray(raw)) return null

  return null
}

export async function loadMonitorSnapshot(
  monitorId: string,
  userId: string,
): Promise<MonitorSnapshotRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('monitors')
    .select('id, user_id, query, search_id, snapshot_products, snapshot_at, last_checked_at, new_count, filter_mode, exclude_terms')
    .eq('id', monitorId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const payload = parseSnapshot(data.snapshot_products)
  return {
    ...data,
    snapshot_products: payload?.products ?? null,
    snapshot_search_id: payload?.searchId ?? null,
    filter_mode: parseFilterMode(data.filter_mode),
    exclude_terms: (data.exclude_terms as string[] | null) ?? [],
  } as MonitorSnapshotRow
}

export async function saveMonitorSnapshot(
  monitorId: string,
  products: Product[],
  searchId: string,
): Promise<void> {
  if (products.length === 0) return

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const snapshot: SnapshotPayload = { searchId, products }
  const { error } = await admin
    .from('monitors')
    .update({
      snapshot_products: snapshot,
      snapshot_at: now,
      last_checked_at: now,
    })
    .eq('id', monitorId)
  if (error) throw error
}

export async function clearMonitorSnapshot(monitorId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('monitors')
    .update({
      snapshot_products: null,
      snapshot_at: null,
      last_notified_item_ids: [],
    })
    .eq('id', monitorId)
  if (error) throw error
}

function snapshotForSearch(monitor: MonitorSnapshotRow, searchId: string): Product[] {
  if (monitor.snapshot_search_id !== searchId) return []
  return monitor.snapshot_products ?? []
}

export function getFrozenSnapshot(
  monitor: MonitorSnapshotRow,
  plan: PlanConfig,
  searchId: string,
  now = new Date(),
  force = false,
): Product[] | null {
  if (force) return null

  const products = snapshotForSearch(monitor, searchId)
  if (products.length === 0) return null

  if (!isSnapshotDue(monitor.snapshot_at, plan, now)) {
    return products
  }
  return null
}

export function sharedCacheStaleForPlan(
  scrapedAt: string | null,
  plan: PlanConfig,
  now = new Date(),
): boolean {
  if (!scrapedAt) return true
  const elapsedMin = (now.getTime() - new Date(scrapedAt).getTime()) / 60_000
  return elapsedMin >= plan.checkIntervalMinutes
}

/** Prefer monitor snapshot for this search, then any snapshot, then shared cache. */
export function productFallback(
  monitor: MonitorSnapshotRow,
  cached: { products: Product[] } | null | undefined,
  searchId: string,
): Product[] {
  const snapshot = snapshotForSearch(monitor, searchId)
  if (snapshot.length > 0) return snapshot
  const anySnapshot = monitor.snapshot_products ?? []
  if (anySnapshot.length > 0) return anySnapshot
  const fromCache = cached?.products ?? []
  if (fromCache.length > 0) return fromCache
  return []
}
