import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isEmailConfigured } from '@/lib/email/send'
import {
  formatProxyBytes,
  getProxyUsageSummary,
  isProxyEnabled,
} from '@/lib/proxy-usage'
import type { ServiceStatus, StatusCheck, StatusReport } from '@/lib/ops-types'

export type { ServiceStatus, StatusCheck, StatusReport } from '@/lib/ops-types'

interface HeartbeatRow {
  service: string
  status: ServiceStatus
  message: string | null
  metadata: Record<string, unknown>
  updated_at: string
}

export async function writeHeartbeat(
  service: string,
  status: ServiceStatus,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('ops_heartbeats').upsert(
    {
      service,
      status,
      message,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'service' },
  )
  if (error) console.error(`[ops] heartbeat ${service}:`, error.message)
}

function ageMinutes(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null
  return Math.round((now - new Date(iso).getTime()) / 60_000)
}

function formatAge(minutes: number | null): string {
  if (minutes === null) return 'nunca'
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  if (minutes < 1440) return `há ${Math.round(minutes / 60)}h`
  return `há ${Math.round(minutes / 1440)}d`
}

function worstStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('degraded')) return 'degraded'
  return 'ok'
}

async function loadHeartbeats(): Promise<Map<string, HeartbeatRow>> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('ops_heartbeats').select('*')
    if (error) {
      console.warn('[ops] heartbeats unavailable:', error.message)
      return new Map()
    }
    return new Map((data ?? []).map((r) => [r.service as string, r as HeartbeatRow]))
  } catch {
    return new Map()
  }
}

export async function runStatusChecks(): Promise<StatusReport> {
  const now = Date.now()
  const checks: StatusCheck[] = []
  const heartbeats = await loadHeartbeats()

  // ── Database ──────────────────────────────────────────────────────────────
  let dbStatus: ServiceStatus = 'ok'
  let dbMessage = 'Conexão OK'
  let dbUpdatedAt: string | null = new Date().toISOString()

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('searches').select('id').limit(1)
    if (error) throw error
  } catch (err) {
    dbStatus = 'error'
    dbMessage = `Falha: ${(err as Error).message}`
    dbUpdatedAt = null
  }

  checks.push({
    id: 'database',
    name: 'Banco de dados',
    status: dbStatus,
    message: dbMessage,
    updatedAt: dbUpdatedAt,
  })

  // ── ML scraper (last shared scrape) ───────────────────────────────────────
  let scrapeStatus: ServiceStatus = 'degraded'
  let scrapeMessage = 'Nenhum scrape registrado ainda'
  let scrapeUpdatedAt: string | null = null

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('searches')
      .select('last_scraped_at')
      .not('last_scraped_at', 'is', null)
      .order('last_scraped_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    const mlHeartbeat = heartbeats.get('ml_scrape')
    const lastScrape = (data?.last_scraped_at as string | null) ?? null
    const lastError = mlHeartbeat?.status === 'error' ? mlHeartbeat : null

    if (lastError) {
      const errAge = ageMinutes(lastError.updated_at, now)
      if (errAge !== null && errAge < 60) {
        scrapeStatus = 'error'
        scrapeMessage = lastError.message ?? 'Erro recente no scrape'
        scrapeUpdatedAt = lastError.updated_at
      }
    }

    if (scrapeStatus !== 'error' && lastScrape) {
      scrapeUpdatedAt = lastScrape
      const age = ageMinutes(lastScrape, now)!
      scrapeMessage = `Último scrape compartilhado ${formatAge(age)}`
      if (age <= 12 * 60) scrapeStatus = 'ok'
      else if (age <= 48 * 60) scrapeStatus = 'degraded'
      else scrapeStatus = 'error'
    } else if (scrapeStatus !== 'error' && mlHeartbeat?.status === 'ok') {
      scrapeUpdatedAt = mlHeartbeat.updated_at
      scrapeMessage = mlHeartbeat.message ?? 'Scrape OK'
      scrapeStatus = 'ok'
    }
  } catch (err) {
    scrapeStatus = 'error'
    scrapeMessage = `Falha ao consultar: ${(err as Error).message}`
  }

  checks.push({
    id: 'ml_scraper',
    name: 'Scraper Mercado Livre',
    status: scrapeStatus,
    message: scrapeMessage,
    updatedAt: scrapeUpdatedAt,
  })

  // ── Cron ──────────────────────────────────────────────────────────────────
  const cron = heartbeats.get('cron_scrape')
  let cronStatus: ServiceStatus = 'degraded'
  let cronMessage = 'Cron ainda não executou'
  let cronUpdatedAt: string | null = null

  if (cron) {
    cronUpdatedAt = cron.updated_at
    const age = ageMinutes(cron.updated_at, now)!
    const meta = cron.metadata as {
      ran?: number
      skipped?: number
      emailsSent?: number
      errors?: number
      failedMonitors?: Array<{ query: string; error: string }>
    }

    if (cron.status === 'error') {
      cronStatus = 'error'
      const failed = meta.failedMonitors ?? []
      if (failed.length > 0) {
        const summary = failed
          .slice(0, 3)
          .map((f) => `“${f.query}”: ${f.error}`)
          .join(' · ')
        cronMessage = failed.length > 3 ? `${summary} · +${failed.length - 3}` : summary
      } else {
        const mlErr = heartbeats.get('ml_scrape')
        const olxErr = heartbeats.get('olx_scrape')
        const scrapeErr =
          mlErr?.status === 'error' && ageMinutes(mlErr.updated_at, now)! < 15
            ? mlErr.message
            : olxErr?.status === 'error' && ageMinutes(olxErr.updated_at, now)! < 15
              ? olxErr.message
              : null
        cronMessage = scrapeErr ?? cron.message ?? 'Última execução com erro'
      }
    } else if (age > 30 * 60) {
      cronStatus = age > 48 * 60 ? 'error' : 'degraded'
      cronMessage = `Última execução ${formatAge(age)}`
    } else {
      cronStatus = 'ok'
      const parts = [`Última execução ${formatAge(age)}`]
      if (meta.ran !== undefined) parts.push(`${meta.ran} buscas`)
      if (meta.emailsSent) parts.push(`${meta.emailsSent} e-mails`)
      cronMessage = parts.join(' · ')
    }
  }

  checks.push({
    id: 'cron',
    name: 'Cron (scrape automático)',
    status: cronStatus,
    message: cronMessage,
    updatedAt: cronUpdatedAt,
  })

  // ── Email ─────────────────────────────────────────────────────────────────
  const emailOk = isEmailConfigured()
  checks.push({
    id: 'email',
    name: 'Alertas por e-mail',
    status: emailOk ? 'ok' : 'degraded',
    message: emailOk ? 'Resend configurado' : 'RESEND_API_KEY não configurada',
    updatedAt: null,
  })

  // ── Proxy IPRoyal ─────────────────────────────────────────────────────────
  let proxySummary = null
  if (isProxyEnabled()) {
    try {
      proxySummary = await getProxyUsageSummary(30)
      const days =
        proxySummary.daysRemaining ?? proxySummary.estimatedDaysRemaining
      const daily =
        proxySummary.avgBytesPerDay ?? proxySummary.estimatedDailyBytes ?? 0
      let proxyStatus: ServiceStatus = 'ok'
      let proxyMessage = `${formatProxyBytes(proxySummary.periodBytes)} nos últimos 30 dias (${proxySummary.periodScrapes} scrapes)`

      if (proxySummary.usedPercent >= 90) proxyStatus = 'error'
      else if (proxySummary.usedPercent >= 70) proxyStatus = 'degraded'

      if (days != null && days < 7) proxyStatus = 'error'
      else if (days != null && days < 14) proxyStatus = worstStatus([proxyStatus, 'degraded'])

      if (days != null) {
        proxyMessage += ` · ~${days} dias restantes (${formatProxyBytes(daily)}/dia)`
      } else {
        proxyMessage += ` · ~${formatProxyBytes(daily)}/dia estimado`
      }

      checks.push({
        id: 'proxy',
        name: 'Proxy IPRoyal',
        status: proxyStatus,
        message: proxyMessage,
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      checks.push({
        id: 'proxy',
        name: 'Proxy IPRoyal',
        status: 'degraded',
        message: `Falha ao ler uso: ${(err as Error).message}`,
        updatedAt: null,
      })
    }
  }

  return {
    status: worstStatus(checks.map((c) => c.status)),
    checkedAt: new Date().toISOString(),
    services: checks,
    proxy: proxySummary
      ? {
          budgetGb: proxySummary.budgetGb,
          periodBytes: proxySummary.periodBytes,
          periodScrapes: proxySummary.periodScrapes,
          todayBytes: proxySummary.todayBytes,
          avgBytesPerScrape: proxySummary.avgBytesPerScrape,
          avgBytesPerDay: proxySummary.avgBytesPerDay,
          usedPercent: proxySummary.usedPercent,
          daysRemaining: proxySummary.daysRemaining,
          depletedAt: proxySummary.depletedAt,
          estimatedDailyBytes: proxySummary.estimatedDailyBytes,
          estimatedDaysRemaining: proxySummary.estimatedDaysRemaining,
        }
      : undefined,
  }
}
