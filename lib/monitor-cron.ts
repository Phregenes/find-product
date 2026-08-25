import 'server-only'

import type { Browser } from 'playwright-core'
import type { Condition, Marketplace, MarketplaceMode, Product, SortBy } from '@/lib/product'
import type { PlanConfig, PlanId } from '@/lib/plans'
import { getPlanConfig, cronScrapeMaxPages, isSnapshotDue, isWithinActiveHours } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCache } from '@/lib/searches'
import { scrapeMarketplacePages } from '@/lib/marketplace-scrape'
import { processSingleMonitorAlert, type MonitorAlertResult } from '@/lib/alerts'
import { writeHeartbeat } from '@/lib/ops'
import type { MonitorFilterMode } from '@/lib/monitor-filter'
import { formatScrapeError, isBrowserClosedError, isMarketplaceBlockedError, withTransientRetry } from '@/lib/error-message'
import { launchBrowser, shouldUseLeanBandwidth, isScrapeProxyActive } from '@/lib/scraper-browser'
import {
  isVercelRuntime,
  shouldDelegateToLocalScraper,
  writeLocalScraperHeartbeat,
} from '@/lib/local-scraper'
import {
  clearMlSearchPenalty,
  getMlQueuePenalties,
  mlQueueSortScore,
  penalizeMlSearch,
} from '@/lib/ml-queue'

/** Local IP (no proxy): soft rate limits — batching is what triggers ML verification. */
const LOCAL_PAUSE_BETWEEN_MS = 15_000
const LOCAL_BLOCK_COOLDOWN_MS = 60_000
/** Max Mercado Livre searches per cron cycle on local IP. Rest wait for next loop. */
const LOCAL_ML_MAX_PER_RUN = Math.max(
  1,
  parseInt(process.env.LOCAL_ML_MAX_PER_RUN ?? '3', 10) || 3,
)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pauseWithJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * 2_500)
  return baseMs + jitter
}

function isLocalIpScrape(): boolean {
  return !isVercelRuntime() && !isScrapeProxyActive()
}

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
  enjoei_search_id: string | null
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

export interface CronRunOptions {
  /** Ignora intervalo do plano e horário ativo — scrapeia todos os monitores. */
  force?: boolean
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
  /** Vercel skipped because desktop scraper is active (PREFER_LOCAL_SCRAPER). */
  delegatedToLocal?: boolean
  message?: string
}

async function scrapeSearchIfNeeded(
  search: SearchRow,
  browser: Browser,
  maxPages: number,
): Promise<Product[]> {
  // Lean CDN blocking is for proxy bandwidth; on local IP it often triggers ML captcha.
  const leanBandwidth = shouldUseLeanBandwidth(true)
  const scraped = await scrapeMarketplacePages(
    search.marketplace,
    search.query,
    search.sort_by,
    search.condition,
    { browser, maxPages, leanBandwidth, usageSource: 'cron' },
  )

  if (scraped.page1.length > 0) {
    await writeCache(search.id, 1, scraped.page1)
    const tag =
      search.marketplace === 'olx'
        ? 'olx_scrape'
        : search.marketplace === 'enjoei'
          ? 'enjoei_scrape'
          : 'ml_scrape'
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
  if (mode === 'olx' || mode === 'enjoei' || mode === 'ml') return [monitor.search_id]
  const ids = [monitor.search_id]
  if (monitor.olx_search_id) ids.push(monitor.olx_search_id)
  if (monitor.enjoei_search_id) ids.push(monitor.enjoei_search_id)
  return ids
}

function mergeProductsForMonitor(
  monitor: MonitorRow,
  scrapedBySearch: Map<string, Product[]>,
): Product[] {
  const mode = monitor.marketplace_mode
  const ids: string[] = []
  if (mode === 'ml' || mode === 'both') ids.push(monitor.search_id)
  if (mode === 'olx' || mode === 'enjoei') ids.push(monitor.search_id)
  if (mode === 'both' && monitor.olx_search_id) ids.push(monitor.olx_search_id)
  if (mode === 'both' && monitor.enjoei_search_id) ids.push(monitor.enjoei_search_id)

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

function plansForSearch(
  searchId: string,
  monitors: MonitorRow[],
  planByUser: Map<string, PlanConfig>,
): PlanConfig[] {
  return monitors
    .filter((m) => searchIdsForMonitor(m).includes(searchId))
    .map((m) => planByUser.get(m.user_id) ?? getPlanConfig(null))
}

/** Deepest scan needed by the fastest (most frequent) subscriber on this search. */
function maxPagesForSearchPlans(plans: PlanConfig[]): number {
  // Local IP: 1 page is enough for new-listing alerts and far less likely to trip ML.
  if (isLocalIpScrape()) return 1
  if (plans.length === 0) return 1
  const fastest = Math.min(...plans.map((p) => p.checkIntervalMinutes))
  if (fastest <= 60) return cronScrapeMaxPages('pro')
  if (fastest <= 240) return cronScrapeMaxPages('lojista')
  if (fastest <= 1440) return cronScrapeMaxPages('garimpo')
  return cronScrapeMaxPages('free')
}

function monitorShouldProcess(
  snapshotAt: string | null,
  plan: PlanConfig,
  now: Date,
  force: boolean,
): boolean {
  if (force) return true
  return isSnapshotDue(snapshotAt, plan, now) && isWithinActiveHours(plan, now)
}

export async function runMonitorCron(
  now = new Date(),
  options: CronRunOptions = {},
): Promise<CronRunResult> {
  const force = options.force ?? false
  const delegation = await shouldDelegateToLocalScraper()
  if (delegation.delegate && !force) {
    const admin = createAdminClient()
    const { count } = await admin.from('monitors').select('id', { count: 'exact', head: true })
    const total = count ?? 0
    await writeHeartbeat(
      'cron_scrape',
      'ok',
      delegation.reason ?? 'Delegado ao scraper local',
      { delegatedToLocal: true, ran: 0, skipped: total, emailsSent: 0, errors: 0, total },
    )
    return {
      ran: 0,
      skipped: total,
      emailsSent: 0,
      total,
      results: [],
      at: now.toISOString(),
      delegatedToLocal: true,
      message: delegation.reason,
    }
  }

  if (!isVercelRuntime()) {
    await writeLocalScraperHeartbeat('ok', 'Cron local em execução…', { phase: 'running' }).catch(
      () => {},
    )
  }

  const admin = createAdminClient()

  const monitorRows = await withTransientRetry(async () => {
    const { data, error } = await admin
      .from('monitors')
      .select(
        'id, user_id, query, search_id, olx_search_id, enjoei_search_id, marketplace_mode, snapshot_at, last_notified_item_ids, filter_mode, exclude_terms, email_alerts',
      )
    if (error) throw error
    return data
  })

  const monitors = (monitorRows ?? []) as MonitorRow[]
  const userIds = [...new Set(monitors.map((m) => m.user_id))]
  const planByUser = new Map<string, PlanConfig>()

  const profileById = new Map<string, ProfileRow>()
  if (userIds.length > 0) {
    const profiles = await withTransientRetry(async () => {
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, email_alerts, plan')
        .in('id', userIds)
      if (error) throw error
      return data
    })
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

  const searchRows = await withTransientRetry(async () => {
    const { data, error } = await admin
      .from('searches')
      .select('id, query, sort_by, condition, marketplace, last_scraped_at')
      .in('id', [...searchIds])
    if (error) throw error
    return data
  })

  const searchById = new Map((searchRows ?? []).map((s) => [s.id as string, s as SearchRow]))

  const dueMonitors = monitors.filter((m) => {
    const plan = planByUser.get(m.user_id) ?? getPlanConfig(null)
    return monitorShouldProcess(m.snapshot_at, plan, now, force)
  })

  const searchesToScrape = new Set<string>()
  for (const m of dueMonitors) {
    for (const id of searchIdsForMonitor(m)) searchesToScrape.add(id)
  }

  const scrapedBySearch = new Map<string, Product[]>()
  const scrapeErrors = new Map<string, string>()
  const deferredSearchIds = new Set<string>()

  let scrapeBrowser =
    searchesToScrape.size > 0 ? await launchBrowser() : null
  const leanBandwidth = shouldUseLeanBandwidth(true)
  const localIp = isLocalIpScrape()
  // Espaça requests no IP local — rajada no mesmo browser dispara verificação do ML.
  let pauseBetweenMs = localIp ? LOCAL_PAUSE_BETWEEN_MS : 0
  let scrapeIndex = 0
  let consecutiveBlocks = 0
  let mlDoneThisRun = 0
  let stopMlForRun = false

  // Avoid always leading with the same failing ML query (e.g. "ata"):
  // penalized searches go to the back for a few hours after block/fail.
  const mlPenalties = await getMlQueuePenalties()

  // Oldest first; OLX/Enjoei before ML so extras still run if ML budget is tight.
  // Among ML: rotate recently-failed searches behind the rest.
  const orderedSearchIds = [...searchesToScrape].sort((a, b) => {
    const aSearch = searchById.get(a)
    const bSearch = searchById.get(b)
    const rank = (m?: string) => (m === 'olx' || m === 'enjoei' ? 0 : 1)
    const aExtra = rank(aSearch?.marketplace)
    const bExtra = rank(bSearch?.marketplace)
    if (aExtra !== bExtra) return aExtra - bExtra

    if (aSearch?.marketplace === 'ml' && bSearch?.marketplace === 'ml') {
      const aScore = mlQueueSortScore(a, aSearch.last_scraped_at, mlPenalties)
      const bScore = mlQueueSortScore(b, bSearch.last_scraped_at, mlPenalties)
      if (aScore !== bScore) return aScore - bScore
      return a.localeCompare(b)
    }

    const aAt = aSearch?.last_scraped_at
    const bAt = bSearch?.last_scraped_at
    if (!aAt && !bAt) return 0
    if (!aAt) return -1
    if (!bAt) return 1
    return aAt.localeCompare(bAt)
  })

  if (localIp) {
    const mlOrdered = orderedSearchIds
      .map((id) => searchById.get(id))
      .filter((s): s is SearchRow => !!s && s.marketplace === 'ml')
    if (mlOrdered.length > 0) {
      const preview = mlOrdered
        .slice(0, LOCAL_ML_MAX_PER_RUN)
        .map((s) => `"${s.query}"`)
        .join(', ')
      console.log(
        `[cron] IP local: até ${LOCAL_ML_MAX_PER_RUN} ML neste ciclo → ${preview}`
          + (mlOrdered.length > LOCAL_ML_MAX_PER_RUN
            ? ` (+${mlOrdered.length - LOCAL_ML_MAX_PER_RUN} depois)`
            : ''),
      )
    }
  }

  async function relaunchBrowser(): Promise<Browser> {
    await scrapeBrowser?.close().catch(() => {})
    scrapeBrowser = await launchBrowser()
    return scrapeBrowser
  }

  async function scrapeOneSearch(search: SearchRow): Promise<Product[]> {
    if (!scrapeBrowser) scrapeBrowser = await launchBrowser()
    const maxPages = maxPagesForSearchPlans(
      plansForSearch(search.id, dueMonitors, planByUser),
    )
    return scrapeSearchIfNeeded(search, scrapeBrowser, maxPages)
  }

  try {
    for (const searchId of orderedSearchIds) {
      const search = searchById.get(searchId)
      if (!search) continue

      if (localIp && search.marketplace === 'ml') {
        if (stopMlForRun || mlDoneThisRun >= LOCAL_ML_MAX_PER_RUN) {
          deferredSearchIds.add(searchId)
          console.log(`[cron] ML adiado p/ próximo ciclo: "${search.query}"`)
          continue
        }
      }

      if (pauseBetweenMs > 0 && scrapeIndex > 0) {
        await sleep(pauseWithJitter(pauseBetweenMs))
      }
      scrapeIndex += 1

      try {
        const products = await scrapeOneSearch(search)
        scrapedBySearch.set(searchId, products)
        consecutiveBlocks = 0
        if (localIp) pauseBetweenMs = LOCAL_PAUSE_BETWEEN_MS
        if (search.marketplace === 'ml') {
          mlDoneThisRun += 1
          await clearMlSearchPenalty(searchId).catch(() => {})
        }
      } catch (err) {
        if (isBrowserClosedError(err)) {
          await relaunchBrowser()
          try {
            const products = await scrapeOneSearch(search)
            scrapedBySearch.set(searchId, products)
            consecutiveBlocks = 0
            if (search.marketplace === 'ml') {
              mlDoneThisRun += 1
              await clearMlSearchPenalty(searchId).catch(() => {})
            }
            continue
          } catch (retryErr) {
            err = retryErr
          }
        }

        // One cooldown retry on local IP; further ML work waits for next loop (less damaging).
        if (isMarketplaceBlockedError(err) && localIp && consecutiveBlocks < 1) {
          consecutiveBlocks += 1
          console.warn(
            `[cron] ${search.marketplace} bloqueou "${search.query}" — pausa ${Math.round(LOCAL_BLOCK_COOLDOWN_MS / 1000)}s e 1 retry`,
          )
          await relaunchBrowser()
          await sleep(LOCAL_BLOCK_COOLDOWN_MS)
          pauseBetweenMs = LOCAL_PAUSE_BETWEEN_MS + 4_000
          try {
            const products = await scrapeOneSearch(search)
            scrapedBySearch.set(searchId, products)
            consecutiveBlocks = 0
            if (search.marketplace === 'ml') {
              mlDoneThisRun += 1
              await clearMlSearchPenalty(searchId).catch(() => {})
            }
            continue
          } catch (retryErr) {
            err = retryErr
          }
        }

        if (search.marketplace === 'ml') {
          // Push this query to the back so the next cycle starts with another monitor
          // (e.g. skip "ata" after it keeps triggering ML verification).
          await penalizeMlSearch(searchId, search.query).catch(() => {})
          if (isMarketplaceBlockedError(err) && localIp) {
            stopMlForRun = true
            console.warn(
              '[cron] ML ainda bloqueando — demais buscas ML ficam p/ o próximo ciclo (outra query na frente)',
            )
          }
        }

        const msg = formatScrapeError(err)
        scrapeErrors.set(searchId, msg)
        const tag =
      search.marketplace === 'olx'
        ? 'olx_scrape'
        : search.marketplace === 'enjoei'
          ? 'enjoei_scrape'
          : 'ml_scrape'
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
    const due = monitorShouldProcess(monitor.snapshot_at, plan, now, force)

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
    const deferredOnly =
      relatedSearchIds.some((id) => deferredSearchIds.has(id))
      && relatedSearchIds.every(
        (id) => deferredSearchIds.has(id) || scrapedBySearch.has(id) || scrapeErrors.has(id),
      )
      && !relatedSearchIds.some((id) => scrapedBySearch.has(id))
      && !relatedSearchIds.some((id) => scrapeErrors.has(id))

    // All related searches deferred to next cycle — not an error.
    if (
      relatedSearchIds.length > 0
      && relatedSearchIds.every((id) => deferredSearchIds.has(id))
    ) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        skipped: true,
      })
      continue
    }

    // Mixed: deferred ML + no OLX data yet — skip quietly.
    if (deferredOnly) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        skipped: true,
      })
      continue
    }

    const catalog = mergeProductsForMonitor(monitor, scrapedBySearch)
    const hardFail =
      relatedSearchIds.length > 0
      && relatedSearchIds.every((id) => scrapeErrors.has(id) || deferredSearchIds.has(id))
      && relatedSearchIds.some((id) => scrapeErrors.has(id))
      && catalog.length === 0
    if (hardFail) {
      const searchError = relatedSearchIds.map((id) => scrapeErrors.get(id)).find(Boolean)
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        error: searchError,
      })
      continue
    }

    // If ML deferred but OLX (or other) has catalog, continue with what we have.
    if (catalog.length === 0 && relatedSearchIds.some((id) => deferredSearchIds.has(id))) {
      results.push({
        monitorId: monitor.id,
        query: monitor.query,
        marketplaceMode: monitor.marketplace_mode,
        scraped: 0,
        skipped: true,
      })
      continue
    }

    const snapshotSearchId = monitor.search_id

    try {
      const alert = await processSingleMonitorAlert(
        monitor,
        catalog,
        snapshotSearchId,
        profile,
        now,
        { force },
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
      : force
        ? `Forçado: ${ran} monitor(es), ${skipped} ignorado(s)`
        : `Executado: ${ran} monitor(es), ${skipped} ignorado(s)`,
    { ran, skipped, emailsSent, errors, total: monitors.length, failedMonitors, force },
  )

  if (!isVercelRuntime()) {
    await writeLocalScraperHeartbeat(
      errors > 0 ? 'error' : 'ok',
      errors > 0
        ? `${errors} monitor(es) com erro`
        : `Local: ${ran} processado(s), ${skipped} ignorado(s)`,
      { ran, skipped, emailsSent, errors, total: monitors.length },
    ).catch(() => {})
  }

  return {
    ran,
    skipped,
    emailsSent,
    total: monitors.length,
    results,
    at: now.toISOString(),
  }
}
