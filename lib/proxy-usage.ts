import 'server-only'

import type { BrowserContext } from 'playwright-core'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPlanConfig,
  type PlanConfig,
  type PlanId,
} from '@/lib/plans'

export type ProxyUsageSource = 'cron' | 'initial' | 'search'

export interface ProxyUsageSnapshot {
  bytesDownloaded: number
  bytesUploaded: number
  requestCount: number
  durationMs: number
}

export interface ProxyUsageEventInput {
  source: ProxyUsageSource
  marketplace?: 'ml' | 'olx'
  query?: string
  leanBandwidth?: boolean
  maxPages?: number
  bytesDownloaded: number
  bytesUploaded: number
  requestCount: number
  durationMs: number
}

export interface ProxyUsageSummary {
  budgetGb: number
  budgetBytes: number
  /** Rolling window (default 30 days). */
  periodDays: number
  periodBytes: number
  periodRequests: number
  periodScrapes: number
  todayBytes: number
  todayScrapes: number
  avgBytesPerScrape: number | null
  avgBytesPerDay: number | null
  usedPercent: number
  /** Days until budget exhausted at current daily rate. */
  daysRemaining: number | null
  depletedAt: string | null
  /** Model-based daily bytes (when history is thin). */
  estimatedDailyBytes: number | null
  estimatedDaysRemaining: number | null
}

const DEFAULT_BUDGET_GB = 1
const DEFAULT_EST_BYTES_PER_CRON_SCRAPE = 2.5 * 1024 * 1024 // ~2.5 MB lean cron session

export function isProxyEnabled(): boolean {
  const serverless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  return serverless && !!process.env.PROXY_SERVER?.trim()
}

export function getProxyBudgetBytes(): number {
  const raw = process.env.PROXY_BUDGET_GB?.trim()
  const gb = raw ? parseFloat(raw) : DEFAULT_BUDGET_GB
  if (!Number.isFinite(gb) || gb <= 0) return DEFAULT_BUDGET_GB * 1024 ** 3
  return gb * 1024 ** 3
}

export function formatProxyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Attach to a Playwright context to measure bytes through the proxy. */
export class ProxyUsageTracker {
  private bytesDownloaded = 0
  private bytesUploaded = 0
  private requestCount = 0
  private readonly startedAt = Date.now()

  attach(context: BrowserContext): void {
    context.on('request', (req) => {
      this.requestCount += 1
      const body = req.postDataBuffer()
      if (body) this.bytesUploaded += body.length
    })

    context.on('response', (res) => {
      const cl = res.headers()['content-length']
      if (cl) {
        const n = parseInt(cl, 10)
        if (Number.isFinite(n) && n > 0) this.bytesDownloaded += n
        return
      }
      if (res.request().resourceType() === 'document') {
        void res.body().then(
          (buf) => {
            this.bytesDownloaded += buf.length
          },
          () => {},
        )
      }
    })
  }

  snapshot(): ProxyUsageSnapshot {
    return {
      bytesDownloaded: this.bytesDownloaded,
      bytesUploaded: this.bytesUploaded,
      requestCount: this.requestCount,
      durationMs: Date.now() - this.startedAt,
    }
  }
}

export function attachProxyUsageTracker(context: BrowserContext): ProxyUsageTracker {
  const tracker = new ProxyUsageTracker()
  tracker.attach(context)
  return tracker
}

export async function recordProxyUsageEvent(input: ProxyUsageEventInput): Promise<void> {
  if (!isProxyEnabled()) return
  const total = input.bytesDownloaded + input.bytesUploaded
  if (total <= 0 && input.requestCount <= 0) return

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('proxy_usage_events').insert({
      source: input.source,
      marketplace: input.marketplace ?? null,
      query: input.query?.slice(0, 200) ?? null,
      bytes_downloaded: input.bytesDownloaded,
      bytes_uploaded: input.bytesUploaded,
      request_count: input.requestCount,
      duration_ms: input.durationMs,
      lean_bandwidth: input.leanBandwidth ?? false,
      max_pages: input.maxPages ?? null,
    })
    if (error) console.error('[proxy-usage] insert:', error.message)
  } catch (err) {
    console.error('[proxy-usage] record failed:', (err as Error).message)
  }
}

function brtDayStartUtc(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return new Date(`${y}-${m}-${d}T03:00:00.000Z`)
}

function scrapesPerDayForPlan(plan: PlanConfig): number {
  const windowMin =
    plan.activeHourEnd >= 24
      ? 24 * 60
      : Math.max(0, (plan.activeHourEnd - plan.activeHourStart) * 60)
  if (windowMin <= 0) return 0
  return Math.max(1, Math.floor(windowMin / plan.checkIntervalMinutes))
}

/** Estimate daily proxy bytes from active monitors (model when history is empty). */
export async function estimateDailyProxyBytesFromMonitors(
  cronRunsPerDay = 12,
): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data: monitors, error: mErr } = await admin
      .from('monitors')
      .select('user_id, search_id, olx_search_id, marketplace_mode')
    if (mErr || !monitors?.length) {
      return DEFAULT_EST_BYTES_PER_CRON_SCRAPE * 3
    }

    const userIds = [...new Set(monitors.map((m) => m.user_id as string))]
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, plan')
      .in('id', userIds)

    const planByUser = new Map<string, PlanConfig>()
    for (const p of profiles ?? []) {
      planByUser.set(p.id as string, getPlanConfig(p.plan as PlanId))
    }

    const searchPlans = new Map<string, PlanConfig[]>()
    for (const m of monitors) {
      const plan = planByUser.get(m.user_id as string) ?? getPlanConfig(null)
      const ids: string[] = [m.search_id as string]
      if (m.marketplace_mode === 'both' && m.olx_search_id) {
        ids.push(m.olx_search_id as string)
      } else if (m.marketplace_mode === 'olx') {
        ids[0] = m.search_id as string
      }
      for (const sid of ids) {
        const list = searchPlans.get(sid) ?? []
        list.push(plan)
        searchPlans.set(sid, list)
      }
    }

    let sessionsPerDay = 0
    for (const plans of searchPlans.values()) {
      const fastest = plans.reduce(
        (min, p) => (p.checkIntervalMinutes < min.checkIntervalMinutes ? p : min),
        plans[0],
      )
      const perDay = Math.min(scrapesPerDayForPlan(fastest), cronRunsPerDay)
      sessionsPerDay += perDay
    }

    if (sessionsPerDay <= 0) sessionsPerDay = 1
    return sessionsPerDay * DEFAULT_EST_BYTES_PER_CRON_SCRAPE
  } catch {
    return DEFAULT_EST_BYTES_PER_CRON_SCRAPE * 5
  }
}

export function computeProxyRunway(
  budgetBytes: number,
  usedBytes: number,
  avgBytesPerDay: number,
): { daysRemaining: number | null; depletedAt: string | null } {
  const remaining = Math.max(0, budgetBytes - usedBytes)
  if (avgBytesPerDay <= 0) return { daysRemaining: null, depletedAt: null }
  const days = remaining / avgBytesPerDay
  const depletedAt = new Date(Date.now() + days * 86_400_000).toISOString()
  return { daysRemaining: Math.round(days * 10) / 10, depletedAt }
}

export async function getProxyUsageSummary(
  periodDays = 30,
  cronRunsPerDay = 12,
): Promise<ProxyUsageSummary> {
  const budgetBytes = getProxyBudgetBytes()
  const budgetGb = budgetBytes / 1024 ** 3
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString()
  const todayStart = brtDayStartUtc().toISOString()

  let periodBytes = 0
  let periodRequests = 0
  let periodScrapes = 0
  let todayBytes = 0
  let todayScrapes = 0

  try {
    const admin = createAdminClient()
    const { data: periodRows, error } = await admin
      .from('proxy_usage_events')
      .select('bytes_downloaded, bytes_uploaded, request_count, created_at')
      .gte('created_at', since)

    if (!error && periodRows) {
      for (const row of periodRows) {
        const total =
          Number(row.bytes_downloaded ?? 0) + Number(row.bytes_uploaded ?? 0)
        periodBytes += total
        periodRequests += Number(row.request_count ?? 0)
        periodScrapes += 1
        if (row.created_at >= todayStart) {
          todayBytes += total
          todayScrapes += 1
        }
      }
    }
  } catch (err) {
    console.warn('[proxy-usage] summary query failed:', (err as Error).message)
  }

  const avgBytesPerScrape =
    periodScrapes > 0 ? Math.round(periodBytes / periodScrapes) : null

  const daysWithData = Math.min(
    periodDays,
    Math.max(1, Math.ceil((Date.now() - new Date(since).getTime()) / 86_400_000)),
  )
  const avgBytesPerDay =
    periodBytes > 0 ? periodBytes / daysWithData : null

  const estimatedDailyBytes = await estimateDailyProxyBytesFromMonitors(cronRunsPerDay)
  const dailyRate = avgBytesPerDay ?? estimatedDailyBytes

  const usedPercent = Math.min(100, (periodBytes / budgetBytes) * 100)
  const { daysRemaining, depletedAt } = computeProxyRunway(
    budgetBytes,
    periodBytes,
    dailyRate,
  )

  const { daysRemaining: estDays } = computeProxyRunway(
    budgetBytes,
    periodBytes,
    estimatedDailyBytes,
  )

  return {
    budgetGb,
    budgetBytes,
    periodDays,
    periodBytes,
    periodRequests,
    periodScrapes,
    todayBytes,
    todayScrapes,
    avgBytesPerScrape,
    avgBytesPerDay,
    usedPercent,
    daysRemaining,
    depletedAt,
    estimatedDailyBytes,
    estimatedDaysRemaining: estDays,
  }
}
