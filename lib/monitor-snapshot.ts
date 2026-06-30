import 'server-only'

import type { Product } from '@/lib/product'
import type { PlanConfig } from '@/lib/plans'
import { isSnapshotDue } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MonitorSnapshotRow {
  id: string
  user_id: string
  query: string
  search_id: string
  snapshot_products: Product[] | null
  snapshot_at: string | null
  last_checked_at: string | null
  new_count: number
}

export async function loadMonitorSnapshot(
  monitorId: string,
  userId: string,
): Promise<MonitorSnapshotRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('monitors')
    .select('id, user_id, query, search_id, snapshot_products, snapshot_at, last_checked_at, new_count')
    .eq('id', monitorId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    ...data,
    snapshot_products: (data.snapshot_products as Product[] | null) ?? null,
  } as MonitorSnapshotRow
}

export async function saveMonitorSnapshot(
  monitorId: string,
  products: Product[],
): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('monitors')
    .update({
      snapshot_products: products,
      snapshot_at: now,
      last_checked_at: now,
    })
    .eq('id', monitorId)
  if (error) throw error
}

export function getFrozenSnapshot(
  monitor: MonitorSnapshotRow,
  plan: PlanConfig,
  now = new Date(),
  force = false,
): Product[] | null {
  if (force) return null
  if (!isSnapshotDue(monitor.snapshot_at, plan, now)) {
    return monitor.snapshot_products ?? []
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
