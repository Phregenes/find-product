import { NextRequest } from 'next/server'
import {
  searchProducts,
  searchMoreProducts,
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
  isWithinActiveHours,
  minutesUntilSnapshotDue,
} from '@/lib/plans'
import {
  getFrozenSnapshot,
  loadMonitorSnapshot,
  saveMonitorSnapshot,
  sharedCacheStaleForPlan,
} from '@/lib/monitor-snapshot'
import { writeHeartbeat } from '@/lib/ops'
import type { Product } from '@/lib/product'

export const dynamic = 'force-dynamic'

function jsonProducts(
  products: Product[],
  opts: {
    q: string
    page: number
    condition: Condition
    fetchedAt: number
    fromCache: boolean
    frozen?: boolean
    nextUpdateInMin?: number
    outsideActiveHours?: boolean
  },
) {
  return Response.json({
    products,
    query: opts.q,
    page: opts.page,
    condition: opts.condition,
    total: products.length,
    mlPageFull: products.length >= ML_PAGE_STEP,
    fetchedAt: opts.fetchedAt,
    fromCache: opts.fromCache,
    frozen: opts.frozen ?? false,
    nextUpdateInMin: opts.nextUpdateInMin,
    outsideActiveHours: opts.outsideActiveHours,
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
  const sort = (request.nextUrl.searchParams.get('sort') ?? 'recent') as SortBy
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

    // Page 1 with monitor → per-plan frozen snapshot.
    if (page === 1 && exclude.length === 0 && monitorId) {
      const monitor = await loadMonitorSnapshot(monitorId, userId)
      if (!monitor) {
        return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
      }

      const now = new Date()
      const frozen = getFrozenSnapshot(monitor, plan, now, force)
      if (frozen) {
        const fetchedAt = monitor.snapshot_at
          ? new Date(monitor.snapshot_at).getTime()
          : Date.now()
        return jsonProducts(frozen, {
          q,
          page,
          condition,
          fetchedAt,
          fromCache: true,
          frozen: true,
          nextUpdateInMin: Math.ceil(minutesUntilSnapshotDue(monitor.snapshot_at, plan, now)),
        })
      }

      const search = await resolveSearch(q, sort, condition)
      const cached = await readCachePage(search.id, page)

      if (!force && !isWithinActiveHours(plan, now)) {
        const fallback = monitor.snapshot_products ?? cached?.products ?? []
        if (fallback.length > 0) {
          return jsonProducts(fallback, {
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

      if (cached && !sharedCacheStaleForPlan(cached.scraped_at, plan, now)) {
        products = cached.products
        fromCache = true
        fetchedAt = new Date(cached.scraped_at).getTime()
      } else {
        const { products: scraped, scrapedCount } = await searchProducts(q, sort, page, condition, exclude)
        products = scraped
        await writeCache(search.id, page, products)
        fetchedAt = Date.now()
        await writeHeartbeat('ml_scrape', 'ok', `Scrape OK: ${products.length} produtos`, { query: q })
        void scrapedCount
      }

      await saveMonitorSnapshot(monitorId, products)

      return jsonProducts(products, {
        q,
        page,
        condition,
        fetchedAt,
        fromCache,
        frozen: false,
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
        await writeCache(search.id, page, products)
        await writeHeartbeat('ml_scrape', 'ok', `Scrape OK: ${products.length} produtos`, { query: q })
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[search] error:', msg)
    await writeHeartbeat('ml_scrape', 'error', msg.slice(0, 500)).catch(() => {})
    return Response.json({ error: msg }, { status: 500 })
  }
}
