import { NextRequest } from 'next/server'
import {
  searchProducts,
  searchMoreProducts,
  MlScrapeBlockedError,
  ML_PAGE_STEP,
  type SortBy,
  type Condition,
} from '@/lib/scraper'
import { createClient } from '@/lib/supabase/server'
import { resolveSearch, writeCache, readCachePage } from '@/lib/searches'
import { getSessionPlan } from '@/lib/plans-server'
import {
  formatActiveHours,
  getBrtHour,
  isSnapshotDue,
  isWithinActiveHours,
  minutesUntilSnapshotDue,
} from '@/lib/plans'
import {
  getFrozenSnapshot,
  loadMonitorSnapshot,
  productFallback,
  saveMonitorSnapshot,
} from '@/lib/monitor-snapshot'
import { baselineFirstVisitIfNeeded, getMonitorSeenIds } from '@/lib/monitor-seen'
import {
  discoverNewProducts,
  mergeWithPendingNew,
  scrapeMonitorCatalog,
  syncPendingNewProducts,
} from '@/lib/monitor-new'
import { writeHeartbeat } from '@/lib/ops'
import { createAdminClient } from '@/lib/supabase/admin'
import { toErrorMessage } from '@/lib/error-message'
import { applyMonitorFilter } from '@/lib/monitor-filter-apply'
import type { Product } from '@/lib/product'
import type { MonitorSnapshotRow } from '@/lib/monitor-snapshot'

export const dynamic = 'force-dynamic'

async function updateMonitorNewCount(monitorId: string, newCount: number): Promise<void> {
  const admin = createAdminClient()
  await admin.from('monitors').update({ new_count: newCount }).eq('id', monitorId)
}

async function finalizeMonitorResponse(
  monitor: MonitorSnapshotRow,
  monitorId: string,
  page1: Product[],
  jsonOpts: Parameters<typeof jsonProducts>[1],
) {
  const [merged, seenIds] = await Promise.all([
    mergeWithPendingNew(monitorId, page1),
    getMonitorSeenIds(monitorId),
  ])
  const products = applyMonitorFilter(merged.products, monitor)
  const newProducts = products.filter((p) => !seenIds.has(p.id))
  await updateMonitorNewCount(monitorId, newProducts.length)
  return jsonProducts(products, {
    ...jsonOpts,
    newCount: newProducts.length,
    newProductIds: newProducts.map((p) => p.id),
  })
}

function jsonProducts(
  products: Product[],
  opts: {
    q: string
    page: number
    condition: Condition
    fetchedAt: number
    fromCache: boolean
    frozen?: boolean
    stale?: boolean
    nextUpdateInMin?: number
    outsideActiveHours?: boolean
    initialCatalog?: boolean
    mlPageFull?: boolean
    newCount?: number
    newProductIds?: string[]
  },
) {
  return Response.json({
    products,
    query: opts.q,
    page: opts.page,
    condition: opts.condition,
    total: products.length,
    mlPageFull: opts.mlPageFull ?? products.length >= ML_PAGE_STEP,
    fetchedAt: opts.fetchedAt,
    fromCache: opts.fromCache,
    frozen: opts.frozen ?? false,
    stale: opts.stale ?? false,
    nextUpdateInMin: opts.nextUpdateInMin,
    outsideActiveHours: opts.outsideActiveHours,
    initialCatalog: opts.initialCatalog ?? false,
    newCount: opts.newCount,
    newProductIds: opts.newProductIds,
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const userId = claims.claims.sub as string
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const sort = (request.nextUrl.searchParams.get('sort') ?? 'relevance') as SortBy
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10))
  const condition = (request.nextUrl.searchParams.get('condition') ?? 'all') as Condition
  const exclude = request.nextUrl.searchParams.get('exclude')?.split(',').filter(Boolean) ?? []
  const minNew = parseInt(request.nextUrl.searchParams.get('minNew') ?? '0', 10)
  const force = request.nextUrl.searchParams.get('force') === '1'
  const discover = request.nextUrl.searchParams.get('discover') === '1'
  const monitorId = request.nextUrl.searchParams.get('monitorId')?.trim() ?? null

  if (!q) {
    return Response.json({ error: 'Parâmetro "q" é obrigatório' }, { status: 400 })
  }

  try {
    if (minNew > 0 && exclude.length > 0) {
      const { products, lastPage, hasMore } = await searchMoreProducts(
        q, sort, page, condition, exclude, minNew,
      )
      if (monitorId && products.length > 0) {
        const admin = createAdminClient()
        const { data: mon } = await admin
          .from('monitors')
          .select('query, filter_mode, exclude_terms')
          .eq('id', monitorId)
          .maybeSingle()
        if (mon) {
          const seenIds = await getMonitorSeenIds(monitorId)
          const filtered = applyMonitorFilter(products, mon)
          const unseen = filtered.filter((p) => !seenIds.has(p.id))
          if (unseen.length > 0) {
            const pending = await syncPendingNewProducts(monitorId, unseen)
            await updateMonitorNewCount(monitorId, pending.length)
          }
          return Response.json({
            products: filtered,
            query: q,
            page: lastPage,
            condition,
            total: filtered.length,
            mlPageFull: hasMore,
            fetchedAt: Date.now(),
            fromCache: false,
          })
        }
      }
      return Response.json({
        products,
        query: q,
        page: lastPage,
        condition,
        total: products.length,
        mlPageFull: hasMore,
        fetchedAt: Date.now(),
        fromCache: false,
      })
    }

    const session = await getSessionPlan()
    const plan = session?.plan
    if (!plan) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Page 1 with monitor → per-plan frozen snapshot.
    if (page === 1 && exclude.length === 0 && monitorId) {
      const now = new Date()
      const monitor = await loadMonitorSnapshot(monitorId, userId)
      if (!monitor) {
        return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
      }

      const search = await resolveSearch(q, sort, condition)
      const cached = await readCachePage(search.id, page)
      const stale = isSnapshotDue(monitor.snapshot_at, plan, now)

      // Tab switch: return snapshot/cache immediately — never block on Playwright scrape.
      if (!force && !discover) {
        const instant = productFallback(monitor, cached, search.id)
        if (instant.length > 0) {
          const fetchedAt = monitor.snapshot_at
            ? new Date(monitor.snapshot_at).getTime()
            : cached
              ? new Date(cached.scraped_at).getTime()
              : Date.now()
          return finalizeMonitorResponse(monitor, monitorId, instant, {
            q,
            page,
            condition,
            fetchedAt,
            fromCache: true,
            frozen: !stale,
            stale,
            nextUpdateInMin: stale
              ? 0
              : Math.ceil(minutesUntilSnapshotDue(monitor.snapshot_at, plan, now)),
            mlPageFull: instant.length >= ML_PAGE_STEP,
          })
        }
      }

      const frozen = getFrozenSnapshot(monitor, plan, search.id, now, force)
      if (frozen && !discover && !force) {
        const fetchedAt = monitor.snapshot_at
          ? new Date(monitor.snapshot_at).getTime()
          : Date.now()
        return finalizeMonitorResponse(monitor, monitorId, frozen, {
          q,
          page,
          condition,
          fetchedAt,
          fromCache: true,
          frozen: true,
          stale: false,
          nextUpdateInMin: Math.ceil(minutesUntilSnapshotDue(monitor.snapshot_at, plan, now)),
          mlPageFull: frozen.length >= ML_PAGE_STEP,
        })
      }

      if (discover || force) {
        const seenIds = await getMonitorSeenIds(monitorId)
        if (seenIds.size > 0 || force) {
          let catalog: Product[]
          let hasMore: boolean
          let page1: Product[]

          if (discover) {
            const discovered = await discoverNewProducts(monitorId, q, sort, condition)
            catalog = discovered.catalog
            hasMore = discovered.hasMore
            page1 = catalog
          } else {
            const scraped = await scrapeMonitorCatalog(monitorId, q, sort, condition)
            catalog = scraped.catalog
            hasMore = scraped.hasMore
            page1 = scraped.page1
          }

          let displayProducts = catalog
          if (displayProducts.length > 0) {
            if (page1.length > 0) await writeCache(search.id, page, page1)
            await saveMonitorSnapshot(monitorId, displayProducts, search.id)
          } else {
            displayProducts = productFallback(monitor, cached, search.id)
          }
          return finalizeMonitorResponse(monitor, monitorId, displayProducts, {
            q,
            page,
            condition,
            fetchedAt: Date.now(),
            fromCache: false,
            frozen: false,
            mlPageFull: hasMore,
          })
        }
      }

      const isFirstScrape = !monitor.snapshot_at

      if (!force && !isFirstScrape && !isWithinActiveHours(plan, now)) {
        const fallback = productFallback(monitor, cached, search.id)
        if (fallback.length > 0) {
          return finalizeMonitorResponse(monitor, monitorId, fallback, {
            q,
            page,
            condition,
            fetchedAt: monitor.snapshot_at
              ? new Date(monitor.snapshot_at).getTime()
              : cached
                ? new Date(cached.scraped_at).getTime()
                : Date.now(),
            fromCache: true,
            frozen: true,
            outsideActiveHours: true,
            mlPageFull: fallback.length >= ML_PAGE_STEP,
          })
        }
        const nowBrt = getBrtHour(now)
        return Response.json(
          {
            error: `Busca automática disponível ${formatActiveHours(plan)} (horário de Brasília). Agora são ${nowBrt}h em Brasília.`,
            code: 'OUTSIDE_ACTIVE_HOURS',
          },
          { status: 429 },
        )
      }

      let products: Product[]
      let fromCache = false
      let fetchedAt = Date.now()
      let mlPageFull = false

      const scraped = await scrapeMonitorCatalog(monitorId, q, sort, condition)
      products = scraped.catalog
      mlPageFull = scraped.hasMore
      if (scraped.page1.length > 0) {
        await writeCache(search.id, page, scraped.page1)
        await writeHeartbeat(
          'ml_scrape',
          'ok',
          `Scrape OK: ${products.length} após filtro (${scraped.page1.length} pág. 1 ML)`,
          { query: q },
        )
      }
      fetchedAt = Date.now()

      if (products.length === 0) {
        const fallback = productFallback(monitor, cached, search.id)
        if (fallback.length > 0) {
          products = fallback
          fromCache = true
          mlPageFull = products.length >= ML_PAGE_STEP
          fetchedAt = monitor.snapshot_at
            ? new Date(monitor.snapshot_at).getTime()
            : cached
              ? new Date(cached.scraped_at).getTime()
              : Date.now()
        }
      } else {
        await saveMonitorSnapshot(monitorId, products, search.id)
      }

      const initialCatalog = await baselineFirstVisitIfNeeded(
        monitorId,
        products.map((p) => p.id),
      )

      return finalizeMonitorResponse(monitor, monitorId, products, {
        q,
        page,
        condition,
        fetchedAt,
        fromCache,
        frozen: false,
        initialCatalog,
        mlPageFull,
      })
    }

    // Legacy page-1 without monitorId (fallback).
    if (page === 1 && exclude.length === 0) {
      if (!force && !isWithinActiveHours(plan)) {
        const search = await resolveSearch(q, sort, condition)
        const cached = await readCachePage(search.id, page)
        if (cached) {
          return jsonProducts(cached.products, {
            q,
            page,
            condition,
            fetchedAt: new Date(cached.scraped_at).getTime(),
            fromCache: true,
            outsideActiveHours: true,
          })
        }
        const nowBrt = getBrtHour()
        return Response.json(
          {
            error: `Busca automática disponível ${formatActiveHours(plan)} (horário de Brasília). Agora são ${nowBrt}h em Brasília.`,
            code: 'OUTSIDE_ACTIVE_HOURS',
          },
          { status: 429 },
        )
      }
    }

    const { products, scrapedCount } = await searchProducts(q, sort, page, condition, exclude)

    if (exclude.length === 0) {
      try {
        const search = await resolveSearch(q, sort, condition)
        if (products.length > 0) {
          await writeCache(search.id, page, products)
          await writeHeartbeat('ml_scrape', 'ok', `Scrape OK: ${products.length} produtos`, { query: q })
        }
      } catch (cacheErr) {
        console.error('[search] cache write failed:', (cacheErr as Error).message)
      }
    }

    return Response.json({
      products,
      query: q,
      page,
      condition,
      total: products.length,
      mlPageFull: scrapedCount >= ML_PAGE_STEP,
      fetchedAt: Date.now(),
      fromCache: false,
    })
  } catch (err) {
    if (err instanceof MlScrapeBlockedError) {
      return Response.json({ error: err.message, code: err.code }, { status: 503 })
    }
    const msg = toErrorMessage(err)
    console.error('[search] error:', msg)
    await writeHeartbeat('ml_scrape', 'error', msg.slice(0, 500)).catch(() => {})
    return Response.json({ error: msg }, { status: 500 })
  }
}
