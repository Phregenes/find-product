import { NextRequest } from 'next/server'
import type { Condition, SortBy, Product } from '@/lib/product'
import { scrapeSearchPages, ML_PAGE_STEP, MONITOR_SCRAPE_MAX_PAGES } from '@/lib/scraper'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCache, readCachePage } from '@/lib/searches'
import { processMonitorAlerts } from '@/lib/alerts'
import { writeHeartbeat } from '@/lib/ops'
import {
  type PlanConfig,
  type PlanId,
  getPlanConfig,
  isSnapshotDue,
  isWithinActiveHours,
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

interface MonitorOnSearch {
  id: string
  user_id: string
  snapshot_at: string | null
  plan: PlanConfig
}

interface SearchTarget extends SearchRow {
  monitors: MonitorOnSearch[]
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function sharedCacheStaleForDueMonitors(
  scrapedAt: string | null,
  dueMonitors: MonitorOnSearch[],
  now: Date,
): boolean {
  if (!scrapedAt || dueMonitors.length === 0) return true
  const intervalMin = Math.min(...dueMonitors.map((m) => m.plan.checkIntervalMinutes))
  const elapsedMin = (now.getTime() - new Date(scrapedAt).getTime()) / 60_000
  return elapsedMin >= intervalMin
}

async function loadSearchTargets(
  admin: ReturnType<typeof createAdminClient>,
): Promise<SearchTarget[]> {
  const { data: rows, error } = await admin
    .from('monitors')
    .select('id, user_id, search_id, snapshot_at, searches(id, query, sort_by, condition, last_scraped_at)')
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
    const monitor: MonitorOnSearch = {
      id: row.id as string,
      user_id: row.user_id as string,
      snapshot_at: row.snapshot_at as string | null,
      plan,
    }

    const existing = bySearch.get(s.id)
    if (existing) {
      existing.monitors.push(monitor)
    } else {
      bySearch.set(s.id, {
        id: s.id,
        query: s.query,
        sort_by: s.sort_by,
        condition: s.condition,
        last_scraped_at: s.last_scraped_at,
        monitors: [monitor],
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
    dueMonitors?: number
    error?: string
    emailsSent?: number
    alerts?: Array<{ monitorId: string; newCount: number; emailed: boolean; skipped?: boolean }>
  }> = []

  for (const search of targets) {
    const dueMonitors = search.monitors.filter(
      (m) => isSnapshotDue(m.snapshot_at, m.plan, now) && isWithinActiveHours(m.plan, now),
    )

    if (dueMonitors.length === 0) {
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: 0,
        skipped: true,
        dueMonitors: 0,
      })
      continue
    }

    try {
      const cached = await readCachePage(search.id, 1)
      const needScrape = !cached || sharedCacheStaleForDueMonitors(search.last_scraped_at, dueMonitors, now)

      let page1: Product[]
      let allPages: Product[]
      let hasMore = false

      if (needScrape) {
        const scraped = await scrapeSearchPages(search.query, search.sort_by, search.condition, MONITOR_SCRAPE_MAX_PAGES, 1)
        page1 = scraped.page1
        allPages = scraped.allPages
        hasMore = scraped.hasMore
        if (page1.length > 0) {
          await writeCache(search.id, 1, page1)
          await writeHeartbeat('ml_scrape', 'ok', `Cron scrape OK: ${page1.length} produtos (+${allPages.length - page1.length} págs.)`, {
            query: search.query,
          })
        } else if (cached?.products.length) {
          page1 = cached.products
          allPages = cached.products
          hasMore = page1.length >= ML_PAGE_STEP
        } else {
          page1 = []
          allPages = []
        }
      } else {
        page1 = cached!.products
        allPages = cached!.products
        hasMore = page1.length >= ML_PAGE_STEP
        if (hasMore) {
          const extra = await scrapeSearchPages(search.query, search.sort_by, search.condition, MONITOR_SCRAPE_MAX_PAGES - 1, 2)
          const known = new Set(page1.map((p) => p.id))
          allPages = [...page1]
          for (const p of extra.allPages) {
            if (!known.has(p.id)) {
              known.add(p.id)
              allPages.push(p)
            }
          }
          hasMore = extra.hasMore
        }
      }

      const alerts = await processMonitorAlerts(search.id, allPages, now)
      const emailsSent = alerts.filter((a) => a.emailed).length

      results.push({
        search_id: search.id,
        query: search.query,
        scraped: page1.length,
        dueMonitors: dueMonitors.length,
        emailsSent,
        alerts: alerts.map((a) => ({
          monitorId: a.monitorId,
          newCount: a.newCount,
          emailed: a.emailed,
          skipped: a.skipped,
        })),
      })
    } catch (err) {
      const errMsg = (err as Error).message
      await writeHeartbeat('ml_scrape', 'error', errMsg.slice(0, 500)).catch(() => {})
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: 0,
        dueMonitors: dueMonitors.length,
        error: errMsg,
      })
    }
  }

  const ran = results.filter((r) => !r.skipped && !r.error).length
  const skipped = results.filter((r) => r.skipped).length
  const emailsSent = results.reduce((sum, r) => sum + (r.emailsSent ?? 0), 0)
  const errors = results.filter((r) => r.error).length

  await writeHeartbeat(
    'cron_scrape',
    errors > 0 ? 'error' : ran > 0 || skipped > 0 ? 'ok' : 'degraded',
    errors > 0
      ? `${errors} busca(s) com erro na última execução`
      : `Executado: ${ran} scrape(s), ${skipped} ignorado(s)`,
    { ran, skipped, emailsSent, errors, total: targets.length },
  )

  return Response.json({ ran, skipped, emailsSent, total: targets.length, results, at: now.toISOString() })
}
