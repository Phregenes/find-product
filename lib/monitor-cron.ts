import 'server-only'

import type { Browser } from 'playwright-core'
import type { Condition, Marketplace, MarketplaceMode, Product, SortBy } from '@/lib/product'
import type { PlanConfig, PlanId } from '@/lib/plans'
import { getPlanConfig, isSnapshotDue, isWithinActiveHours } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCache } from '@/lib/searches'
import { scrapeMarketplacePages } from '@/lib/marketplace-scrape'
import { processSingleMonitorAlert, type MonitorAlertResult } from '@/lib/alerts'
import { writeHeartbeat } from '@/lib/ops'
import type { MonitorFilterMode } from '@/lib/monitor-filter'
import { formatScrapeError, isBrowserClosedError } from '@/lib/error-message'
import { launchBrowser } from '@/lib/scraper-browser'

interface SearchRow {
  id: string
  query: string
  sort_by: SortBy
  condition: Condition
  marketplace: Marketplace
  last_scraped_at: string | null
}

interface MonitorRow {
  id: string
  user_id: string
  query: string
  search_id: string
  olx_search_id: string | null
  marketplace_mode: MarketplaceMode
  snapshot_at: string | null
  last_notified_item_ids: string[] | null
  filter_mode: MonitorFilterMode
  exclude_terms: string[] | null
  email_alerts: boolean
}

interface ProfileRow {
  email: string | null
  emailAlerts: boolean
  plan: string
}

export interface CronRunResult {
  ran: number
  skipped: number
  emailsSent: number
  total: number
  results: Array<{
    monitorId: string
    query: string
    marketplaceMode: MarketplaceMode
    scraped: number
    skipped?: boolean
    error?: string
    newCount?: number
    emailed?: boolean
  }>
  at: string
}

async function scrapeSearchIfNeeded(
  search: SearchRow,
  browser: Browser,
): Promise<Product[]> {
  const scraped = await scrapeMarketplacePages(
    search.marketplace,
    search.query,
    search.sort_by,
    search.condition,
    { browser },
  )

  if (scraped.page1.length > 0) {
    await writeCache(search.id, 1, scraped.page1)
    const tag = search.marketplace === 'olx' ? 'olx_scrape' : 'ml_scrape'
    await writeHeartbeat(
      tag,
      'ok',
      `Cron ${search.marketplace}: ${scraped.allPages.length} produtos (${search.query})`,
      { query: search.query, marketplace: search.marketplace },
    )
  }

  return scraped.allPages
}

function searchIdsForMonitor(monitor: MonitorRow): string[] {
  const mode = monitor.marketplace_mode ?? 'ml'
  if (mode === 'olx') return [monitor.search_id]
  if (mode === 'ml') return [monitor.search_id]
  const ids = [monitor.search_id]
  if (monitor.olx_search_id) ids.push(monitor.olx_search_id)
  return ids
}

function mergeProductsForMonitor(
  monitor: MonitorRow,
  scrapedBySearch: Map<string, Product[]>,
): Product[] {
  const mode = monitor.marketplace_mode
  const ids: string[] = []
  if (mode === 'ml' || mode === 'both') ids.push(monitor.search_id)
  if (mode === 'olx') ids.push(monitor.search_id)
  if (mode === 'both' && monitor.olx_search_id) ids.push(monitor.olx_search_id)

  const seen = new Set<string>()
  const merged: Product[] = []
  for (const id of ids) {
    for (const p of scrapedBySearch.get(id) ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        merged.push(p)
      }
    }
  }
  return merged
}

export async function runMonitorCron(now = new Date()): Promise<CronRunResult> {
  const admin = createAdminClient()

  const { data: monitorRows, error: mErr } = await admin
    .from('monitors')
    .select(
      'id, user_id, query, search_id, olx_search_id, marketplace_mode, snapshot_at, last_notified_item_ids, filter_mode, exclude_terms, email_alerts',
    )
  if (mErr) throw mErr

  const monitors = (monitorRows ?? []) as MonitorRow[]
  const userIds = [...new Set(monitors.map((m) => m.user_id))]
  const planByUser = new Map<string, PlanConfig>()

  const profileById = new Map<string, ProfileRow>()
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, email, email_alerts, plan')
      .in('id', userIds)
    if (pErr) throw pErr
    for (const p of profiles ?? []) {
      planByUser.set(p.id as string, getPlanConfig(p.plan as PlanId))
      profileById.set(p.id as string, {
        email: p.email as string | null,
        emailAlerts: p.email_alerts !== false,
        plan: p.plan as string,
      })
    }
  }

  const searchIds = new Set<string>()
  for (const m of monitors) {
    for (const id of searchIdsForMonitor(m)) searchIds.add(id)
  }

  const { data: searchRows, error: sErr } = await admin
    .from('searches')
    .select('id, query, sort_by, condition, marketplace, last_scraped_at')
    .in('id', [...searchIds])
  if (sErr) throw sErr

  const searchById = new Map((searchRows ?? []).map((s) => [s.id as string, s as SearchRow]))

  const dueMonitors = monitors.filter((m) => {
    const plan = planByUser.get(m.user_id) ?? getPlanConfig(null)
    return isSnapshotDue(m.snapshot_at, plan, now) && isWithinActiveHours(plan, now)
  })

  const searchesToScrape = new Set<string>()
  for (const m of dueMonitors) {
    for (const id of searchIdsForMonitor(m)) searchesToScrape.add(id)
  }

  const scrapedBySearch = new Map<string, Product[]>()
  const scrapeErrors = new Map<string, string>()

  let scrapeBrowser =
    searchesToScrape.size > 0 ? await launchBrowser() : null

  try {
    for (const searchId of searchesToScrape) {
      const search = searchById.get(searchId)
      if (!search || !scrapeBrowser) continue

      try {
        const products = await scrapeSearchIfNeeded(search, scrapeBrowser)
        scrapedBySearch.set(searchId, products)
      } catch (err) {
        if (isBrowserClosedError(err)) {
          await scrapeBrowser.close().catch(() => {})
          scrapeBrowser = await launchBrowser()
          try {
            const products = await scrapeSearchIfNeeded(search, scrapeBrowser)
            scrapedBySearch.set(searchId, products)
            continue
          } catch (retryErr) {
            const msg = formatScrapeError(retryErr)
            scrapeErrors.set(searchId, msg)
            const tag = search.marketplace === 'olx' ? 'olx_scrape' : 'ml_scrape'
            await writeHeartbeat(tag, 'error', msg.slice(0, 500)).catch(() => {})
            continue
          }
        }
        const msg = formatScrapeError(err)
        scrapeErrors.set(searchId, msg)
        const tag = search.marketplace === 'olx' ? 'olx_scrape' : 'ml_scrape'
        await writeHeartbeat(tag, 'error', msg.slice(0, 500)).catch(() => {})
      }
    }
  } finally {
    await scrapeBrowser?.close().catch(() => {})
  }

  const results: CronRunResult['results'] = []
  const alertResults: MonitorAlertResult[] = []

  for (const monitor of monitors) {
    const plan = planByUser.get(monitor.user_id) ?? getPlanConfig(null)
    const profile = profileById.get(monitor.user_id)
    const due = isSnapshotDue(monitor.snapshot_at, plan, now) && isWithinActiveHours(plan, now)

    if (!due) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        skipped: true,
      })
      continue
    }

    if (!profile) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        skipped: true,
      })
      continue
    }

    const relatedSearchIds = searchIdsForMonitor(monitor)
    const searchError = relatedSearchIds.map((id) => scrapeErrors.get(id)).find(Boolean)
    if (searchError) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        error: searchError,
      })
      continue
    }

    const catalog = mergeProductsForMonitor(monitor, scrapedBySearch)
    const snapshotSearchId = monitor.search_id

    try {
      const alert = await processSingleMonitorAlert(
        monitor,
        catalog,
        snapshotSearchId,
        profile,
        now,
      )
      alertResults.push(alert)
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: catalog.length,
        newCount: alert.newCount,
        emailed: alert.emailed,
        skipped: alert.skipped,
      })
    } catch (err) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        error: (err as Error).message,
      })
    }
  }

  const ran = results.filter((r) => !r.skipped && !r.error && (r.scraped ?? 0) >= 0).length
  const skipped = results.filter((r) => r.skipped).length
  const emailsSent = alertResults.filter((a) => a.emailed).length
  const errors = results.filter((r) => r.error).length
  const failedMonitors = results
    .filter((r) => r.error)
    .map((r) => ({ query: r.query, error: r.error, marketplaceMode: r.marketplaceMode }))

  await writeHeartbeat(
    'cron_scrape',
    errors > 0 ? 'error' : ran > 0 || skipped > 0 ? 'ok' : 'degraded',
    errors > 0
      ? `${errors} monitor(es) com erro na última execução`
      : `Executado: ${ran} monitor(es), ${skipped} ignorado(s)`,
    { ran, skipped, emailsSent, errors, total: monitors.length, failedMonitors },
  )

  return {
    ran,
    skipped,
    emailsSent,
    total: monitors.length,
    results,
    at: now.toISOString(),
  }
}
