import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export async function getMonitorSeenIds(monitorId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('monitor_seen_products')
    .select('product_id')
    .eq('monitor_id', monitorId)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.product_id as string))
}

export async function countSeenProducts(monitorId: string): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('monitor_seen_products')
    .select('*', { count: 'exact', head: true })
    .eq('monitor_id', monitorId)
  if (error) throw error
  return count ?? 0
}

export async function baselineMonitorSeen(
  monitorId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return
  const admin = createAdminClient()
  const rows = productIds.map((product_id) => ({ monitor_id: monitorId, product_id }))
  const { error } = await admin
    .from('monitor_seen_products')
    .upsert(rows, { onConflict: 'monitor_id,product_id', ignoreDuplicates: true })
  if (error) throw error
}

/** First visit: mark current listings as seen so only future ones count as new. */
export async function baselineFirstVisitIfNeeded(
  monitorId: string,
  productIds: string[],
): Promise<boolean> {
  if (productIds.length === 0) return false
  const seenCount = await countSeenProducts(monitorId)
  if (seenCount > 0) return false

  await baselineMonitorSeen(monitorId, productIds)
  const admin = createAdminClient()
  await admin.from('monitors').update({ new_count: 0 }).eq('id', monitorId)
  return true
}
