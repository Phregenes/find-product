import 'server-only'

import type { Product } from '@/lib/product'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewProductsEmail } from '@/lib/email/send'

export interface MonitorAlertResult {
  monitorId: string
  query: string
  newCount: number
  emailed: boolean
  emailError?: string
  baselined?: boolean
}

/** Update monitor counts and email users when genuinely new products appear. */
export async function processMonitorAlerts(
  searchId: string,
  products: Product[],
): Promise<MonitorAlertResult[]> {
  const admin = createAdminClient()
  const results: MonitorAlertResult[] = []

  const { data: monitors, error: mErr } = await admin
    .from('monitors')
    .select('id, user_id, query')
    .eq('search_id', searchId)
  if (mErr) throw mErr
  if (!monitors?.length) return results

  const userIds = [...new Set(monitors.map((m) => m.user_id as string))]
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, email, email_alerts')
    .in('id', userIds)
  if (pErr) throw pErr

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { email: p.email as string | null, emailAlerts: p.email_alerts !== false },
    ]),
  )

  const productIds = products.map((p) => p.id)
  const now = new Date().toISOString()

  for (const monitor of monitors) {
    const monitorId = monitor.id as string
    const userId = monitor.user_id as string
    const query = monitor.query as string

    const { data: seenRows, error: sErr } = await admin
      .from('monitor_seen_products')
      .select('product_id')
      .eq('monitor_id', monitorId)
    if (sErr) throw sErr

    const seen = new Set((seenRows ?? []).map((r) => r.product_id as string))
    const newProducts = products.filter((p) => !seen.has(p.id))

    // First scrape for this monitor — baseline without emailing (same as app UX).
    if (seen.size === 0 && products.length > 0) {
      await baselineSeen(admin, monitorId, productIds)
      await admin
        .from('monitors')
        .update({ new_count: 0, last_checked_at: now })
        .eq('id', monitorId)
      results.push({
        monitorId,
        query,
        newCount: 0,
        emailed: false,
        baselined: true,
      })
      continue
    }

    const newCount = newProducts.length
    await admin
      .from('monitors')
      .update({ new_count: newCount, last_checked_at: now })
      .eq('id', monitorId)

    let emailed = false
    let emailError: string | undefined

    if (newCount > 0) {
      const profile = profileById.get(userId)
      if (profile?.email && profile.emailAlerts) {
        const send = await sendNewProductsEmail({
          to: profile.email,
          monitorQuery: query,
          products: newProducts,
        })
        emailed = send.ok
        if (!send.ok) emailError = send.error
      }
    }

    results.push({ monitorId, query, newCount, emailed, emailError })
  }

  return results
}

async function baselineSeen(
  admin: ReturnType<typeof createAdminClient>,
  monitorId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return
  const rows = productIds.map((product_id) => ({ monitor_id: monitorId, product_id }))
  const { error } = await admin
    .from('monitor_seen_products')
    .upsert(rows, { onConflict: 'monitor_id,product_id', ignoreDuplicates: true })
  if (error) throw error
}
