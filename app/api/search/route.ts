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
  loadMonitorSnapshot,
  monitorSnapshotProducts,
} from '@/lib/monitor-snapshot'
import { getMonitorSeenIds } from '@/lib/monitor-seen'
import { mergeWithPendingNew } from '@/lib/monitor-new'
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
  catalog: Product[],
  jsonOpts: Parameters<typeof jsonProducts>[1],
) {
  const [merged, seenIds] = await Promise.all([
    mergeWithPendingNew(monitorId, catalog),
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
    awaitingFirstScan?: boolean
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
    mlPageFull: opts.mlPageFull ?? false,
    fetchedAt: opts.fetchedAt,
    fromCache: opts.fromCache,
    frozen: opts.frozen ?? false,
    stale: opts.stale ?? false,
    nextUpdateInMin: opts.nextUpdateInMin,
    outsideActiveHours: opts.outsideActiveHours,
    awaitingFirstScan: opts.awaitingFirstScan ?? false,
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
  const monitorId = request.nextUrl.searchParams.get('monitorId')?.trim() ?? null

  if (!q) {
    return Response.json({ error: 'Parâmetro "q" é obrigatório' }, { status: 400 })
  }

  try {
    if (minNew > 0 && exclude.length > 0) {
      if (monitorId) {
        return Response.json(
          {
            error: 'O app varre até 8 páginas do ML automaticamente no cron — não é necessário carregar mais.',
            code: 'CRON_ONLY',
          },
          { status: 400 },
        )
      }

      const { products, lastPage, hasMore } = await searchMoreProducts(
        q, sort, page, condition, exclude, minNew,
      )
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

    // Monitor page 1 — read-only from DB (cron writes snapshots).
    if (page === 1 && exclude.length === 0 && monitorId) {
      const now = new Date()
      const monitor = await loadMonitorSnapshot(monitorId, userId)
      if (!monitor) {
        return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
      }

      const search = await resolveSearch(q, sort, condition)
      const awaitingFirstScan = !monitor.snapshot_at
      const stale = isSnapshotDue(monitor.snapshot_at, plan, now)
      const catalog = monitorSnapshotProducts(monitor, search.id)
      const fetchedAt = monitor.snapshot_at
        ? new Date(monitor.snapshot_at).getTime()
        : Date.now()

      const nextUpdateInMin = awaitingFirstScan
        ? 0
        : stale
          ? 0
          : Math.ceil(minutesUntilSnapshotDue(monitor.snapshot_at, plan, now))

      const outsideActiveHours =
        !awaitingFirstScan && !isWithinActiveHours(plan, now) && catalog.length === 0

      if (outsideActiveHours) {
        const nowBrt = getBrtHour(now)
        return Response.json(
          {
            error: `Busca automática disponível ${formatActiveHours(plan)} (horário de Brasília). Agora são ${nowBrt}h em Brasília.`,
            code: 'OUTSIDE_ACTIVE_HOURS',
          },
          { status: 429 },
        )
      }

      return finalizeMonitorResponse(monitor, monitorId, catalog, {
        q,
        page,
        condition,
        fetchedAt,
        fromCache: true,
        frozen: !stale && !awaitingFirstScan,
        stale,
        nextUpdateInMin,
        outsideActiveHours: !awaitingFirstScan && !isWithinActiveHours(plan, now),
        awaitingFirstScan,
        mlPageFull: false,
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
