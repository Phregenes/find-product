import { NextRequest } from 'next/server'
import type { Condition, SortBy } from '@/lib/product'
import { searchProducts } from '@/lib/scraper'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCache } from '@/lib/searches'
import { processMonitorAlerts } from '@/lib/alerts'
import {
  type PlanConfig,
  type PlanId,
  getPlanConfig,
  shouldScrapeNow,
  effectiveCheckIntervalMinutes,
} from '@/lib/plans'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface SearchRow {
  id: string
  query: string
  sort_by: SortBy
  condition: Condition
  last_scraped_at: string | null
}

interface SearchTarget extends SearchRow {
  subscriberPlans: PlanConfig[]
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/** Group monitors by shared search and collect each subscriber's plan. */
async function loadSearchTargets(
  admin: ReturnType<typeof createAdminClient>,
): Promise<SearchTarget[]> {
  const { data: rows, error } = await admin
    .from('monitors')
    .select('user_id, search_id, searches(id, query, sort_by, condition, last_scraped_at)')
  if (error) throw error

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))]
  const planByUser = new Map<string, PlanConfig>()

  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, plan')
      .in('id', userIds)
    if (pErr) throw pErr
    for (const p of profiles ?? []) {
      planByUser.set(p.id as string, getPlanConfig(p.plan as PlanId))
    }
  }

  const bySearch = new Map<string, SearchTarget>()

  for (const row of rows ?? []) {
    const raw = (row as { searches: SearchRow | SearchRow[] | null }).searches
    const s = Array.isArray(raw) ? raw[0] : raw
    if (!s) continue

    const plan = planByUser.get(row.user_id as string) ?? getPlanConfig(null)
    const existing = bySearch.get(s.id)
    if (existing) {
      existing.subscriberPlans.push(plan)
    } else {
      bySearch.set(s.id, {
        id: s.id,
        query: s.query,
        sort_by: s.sort_by,
        condition: s.condition,
        last_scraped_at: s.last_scraped_at,
        subscriberPlans: [plan],
      })
    }
  }

  return [...bySearch.values()]
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const targets = await loadSearchTargets(admin)

  const results: Array<{
    search_id: string
    query: string
    scraped: number
    skipped?: boolean
    intervalMin?: number
    error?: string
    emailsSent?: number
    alerts?: Array<{ monitorId: string; newCount: number; emailed: boolean }>
  }> = []

  for (const search of targets) {
    const intervalMin = effectiveCheckIntervalMinutes(search.subscriberPlans)

    if (!shouldScrapeNow(search.last_scraped_at, search.subscriberPlans, now)) {
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: 0,
        skipped: true,
        intervalMin,
      })
      continue
    }

    try {
      const { products } = await searchProducts(
        search.query,
        search.sort_by,
        1,
        search.condition,
      )
      await writeCache(search.id, 1, products)
      const alerts = await processMonitorAlerts(search.id, products)
      const emailsSent = alerts.filter((a) => a.emailed).length
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: products.length,
        intervalMin,
        emailsSent,
        alerts: alerts.map((a) => ({
          monitorId: a.monitorId,
          newCount: a.newCount,
          emailed: a.emailed,
        })),
      })
    } catch (err) {
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: 0,
        intervalMin,
        error: (err as Error).message,
      })
    }
  }

  const ran = results.filter((r) => !r.skipped && !r.error).length
  const skipped = results.filter((r) => r.skipped).length
  const emailsSent = results.reduce((sum, r) => sum + (r.emailsSent ?? 0), 0)

  return Response.json({ ran, skipped, emailsSent, total: targets.length, results, at: now.toISOString() })
}
