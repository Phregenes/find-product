import 'server-only'

import type { Product } from '@/lib/product'
import { getPlanConfig, isSnapshotDue, isWithinActiveHours } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewProductsEmail } from '@/lib/email/send'
import { saveMonitorSnapshot } from '@/lib/monitor-snapshot'
import { baselineMonitorSeen } from '@/lib/monitor-seen'
import {
  prunePendingNewProducts,
  syncPendingNewProducts,
} from '@/lib/monitor-new'
import { applyMonitorFilter } from '@/lib/monitor-filter-apply'
import type { MonitorFilterMode } from '@/lib/monitor-filter'
import {
  filterNotYetNotified,
  hasItemsNotYetNotified,
} from '@/lib/notification-fingerprint'

export interface MonitorAlertResult {
  monitorId: string
  query: string
  newCount: number
  emailed: boolean
  emailError?: string
  emailSkippedDuplicate?: boolean
  baselined?: boolean
  skipped?: boolean
}

interface MonitorRow {
  id: string
  user_id: string
  query: string
  snapshot_at: string | null
  last_notified_item_ids: string[] | null
  filter_mode: MonitorFilterMode
  exclude_terms: string[] | null
  email_alerts: boolean
}

/** Sync one monitor catalog (ML, OLX, or merged) after scrape. */
export async function processSingleMonitorAlert(
  monitor: MonitorRow,
  allProducts: Product[],
  snapshotSearchId: string,
  profile: { email: string | null; emailAlerts: boolean; plan: string },
  now = new Date(),
): Promise<MonitorAlertResult> {
  const admin = createAdminClient()
  const monitorId = monitor.id
  const query = monitor.query
  const plan = getPlanConfig(profile.plan)

  if (!isSnapshotDue(monitor.snapshot_at, plan, now)) {
    return { monitorId, query, newCount: 0, emailed: false, skipped: true }
  }

  if (!isWithinActiveHours(plan, now)) {
    return { monitorId, query, newCount: 0, emailed: false, skipped: true }
  }

  const { data: seenRows, error: sErr } = await admin
    .from('monitor_seen_products')
    .select('product_id')
    .eq('monitor_id', monitorId)
  if (sErr) throw sErr

  const seen = new Set((seenRows ?? []).map((r) => r.product_id as string))
  const monitorProducts = applyMonitorFilter(allProducts, monitor)
  const discovered = monitorProducts.filter((p) => !seen.has(p.id))

  await saveMonitorSnapshot(monitorId, monitorProducts, snapshotSearchId)

  if (seen.size === 0 && monitorProducts.length > 0) {
    await baselineMonitorSeen(monitorId, monitorProducts.map((p) => p.id))
    await admin.from('monitors').update({ new_count: 0 }).eq('id', monitorId)
    return { monitorId, query, newCount: 0, emailed: false, baselined: true }
  }

  const scannedIds = new Set(monitorProducts.map((p) => p.id))
  await syncPendingNewProducts(monitorId, discovered)
  const pending = await prunePendingNewProducts(monitorId, scannedIds)

  const newProducts = pending
  const newCount = pending.length
  const newProductIds = pending.map((p) => p.id)
  const lastNotifiedIds = monitor.last_notified_item_ids ?? []

  await admin.from('monitors').update({ new_count: newCount }).eq('id', monitorId)

  let emailed = false
  let emailError: string | undefined
  let emailSkippedDuplicate = false

  const canEmail =
    newCount > 0
    && profile.email
    && profile.emailAlerts
    && plan.emailAlerts
    && monitor.email_alerts !== false

  if (canEmail) {
    if (!hasItemsNotYetNotified(newProductIds, lastNotifiedIds)) {
      emailSkippedDuplicate = true
    } else {
      const toNotify = filterNotYetNotified(newProducts, lastNotifiedIds)
      const send = await sendNewProductsEmail({
        to: profile.email!,
        monitorQuery: query,
        products: toNotify,
      })
      emailed = send.ok
      if (!send.ok) emailError = send.error
      else {
        await admin
          .from('monitors')
          .update({ last_notified_item_ids: newProductIds })
          .eq('id', monitorId)
      }
    }
  }

  return {
    monitorId,
    query,
    newCount,
    emailed,
    emailError,
    emailSkippedDuplicate: emailSkippedDuplicate || undefined,
  }
}

/** Update snapshots, counts and emails — only for monitors due on their plan interval. */
export async function processMonitorAlerts(
  searchId: string,
  allProducts: Product[],
  now = new Date(),
): Promise<MonitorAlertResult[]> {
  const admin = createAdminClient()
  const results: MonitorAlertResult[] = []

  const { data: monitors, error: mErr } = await admin
    .from('monitors')
    .select('id, user_id, query, snapshot_at, last_notified_item_ids, filter_mode, exclude_terms, email_alerts')
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


  for (const monitor of monitors as MonitorRow[]) {
    const profile = profileById.get(monitor.user_id)
    if (!profile) continue
    const result = await processSingleMonitorAlert(
      monitor,
      allProducts,
      searchId,
      profile,
      now,
    )
    results.push(result)
  }

  return results
}
