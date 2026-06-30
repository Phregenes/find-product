import 'server-only'

import type { Product } from '@/lib/product'
import { getPlanConfig, isSnapshotDue, isWithinActiveHours } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewProductsEmail } from '@/lib/email/send'
import { saveMonitorSnapshot } from '@/lib/monitor-snapshot'
import { baselineMonitorSeen } from '@/lib/monitor-seen'

export interface MonitorAlertResult {
  monitorId: string
  query: string
  newCount: number
  emailed: boolean
  emailError?: string
  baselined?: boolean
  skipped?: boolean
}

interface MonitorRow {
  id: string
  user_id: string
  query: string
  snapshot_at: string | null
}

/** Update snapshots, counts and emails — only for monitors due on their plan interval. */
export async function processMonitorAlerts(
  searchId: string,
  products: Product[],
  now = new Date(),
): Promise<MonitorAlertResult[]> {
  const admin = createAdminClient()
  const results: MonitorAlertResult[] = []

  const { data: monitors, error: mErr } = await admin
    .from('monitors')
    .select('id, user_id, query, snapshot_at')
    .eq('search_id', searchId)
  if (mErr) throw mErr
  if (!monitors?.length) return results

  const userIds = [...new Set(monitors.map((m) => m.user_id as string))]
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, email, email_alerts, plan')
    .in('id', userIds)
  if (pErr) throw pErr

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        email: p.email as string | null,
        emailAlerts: p.email_alerts !== false,
        plan: p.plan as string,
      },
    ]),
  )

  const productIds = products.map((p) => p.id)

  for (const monitor of monitors as MonitorRow[]) {
    const monitorId = monitor.id
    const userId = monitor.user_id
    const query = monitor.query
    const profile = profileById.get(userId)

    if (!profile) continue

    const plan = getPlanConfig(profile.plan)

    if (!isSnapshotDue(monitor.snapshot_at, plan, now)) {
      results.push({ monitorId, query, newCount: 0, emailed: false, skipped: true })
      continue
    }

    if (!isWithinActiveHours(plan, now)) {
      results.push({ monitorId, query, newCount: 0, emailed: false, skipped: true })
      continue
    }

    const { data: seenRows, error: sErr } = await admin
      .from('monitor_seen_products')
      .select('product_id')
      .eq('monitor_id', monitorId)
    if (sErr) throw sErr

    const seen = new Set((seenRows ?? []).map((r) => r.product_id as string))
    const newProducts = products.filter((p) => !seen.has(p.id))

    await saveMonitorSnapshot(monitorId, products)

    if (seen.size === 0 && products.length > 0) {
      await baselineMonitorSeen(monitorId, productIds)
      await admin.from('monitors').update({ new_count: 0 }).eq('id', monitorId)
      results.push({ monitorId, query, newCount: 0, emailed: false, baselined: true })
      continue
    }

    const newCount = newProducts.length
    await admin.from('monitors').update({ new_count: newCount }).eq('id', monitorId)

    let emailed = false
    let emailError: string | undefined

    if (newCount > 0 && profile.email && profile.emailAlerts) {
      const send = await sendNewProductsEmail({
        to: profile.email,
        monitorQuery: query,
        products: newProducts,
      })
      emailed = send.ok
      if (!send.ok) emailError = send.error
    }

    results.push({ monitorId, query, newCount, emailed, emailError })
  }

  return results
}
