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
  productFallback,
  saveMonitorSnapshot,
  sharedCacheStaleForPlan,
} from '@/lib/monitor-snapshot'
import { baselineFirstVisitIfNeeded, getMonitorSeenIds } from '@/lib/monitor-seen'
import {
  discoverNewProducts,
  mergeWithPendingNew,
  syncPendingNewProducts,
} from '@/lib/monitor-new'
import { writeHeartbeat } from '@/lib/ops'
import { createAdminClient } from '@/lib/supabase/admin'
import { toErrorMessage } from '@/lib/error-message'
import type { Product } from '@/lib/product'

export const dynamic = 'force-dynamic'

async function updateMonitorNewCount(monitorId: string, newCount: number): Promise<void> {
  const admin = createAdminClient()
  await admin.from('monitors').update({ new_count: newCount }).eq('id', monitorId)
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
    nextUpdateInMin?: number
    outsideActiveHours?: boolean
    initialCatalog?: boolean
    mlPageFull?: boolean
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
    nextUpdateInMin: opts.nextUpdateInMin,
    outsideActiveHours: opts.outsideActiveHours,
    initialCatalog: opts.initialCatalog ?? false,
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
        const seenIds = await getMonitorSeenIds(monitorId)
        const unseen = products.filter((p) => !seenIds.has(p.id))
        if (unseen.length > 0) {
          const pending = await syncPendingNewProducts(monitorId, unseen)
          await updateMonitorNewCount(monitorId, pending.length)
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
      const monitor = await loadMonitorSnapshot(monitorId, userId)
      if (!monitor) {
        return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
      }

      const now = new Date()
      const search = await resolveSearch(q, sort, condition)
      const cached = await readCachePage(search.id, page)

      const frozen = getFrozenSnapshot(monitor, plan, search.id, now, force)
      if (frozen && !discover && !force) {
        const fetchedAt = monitor.snapshot_at
          ? new Date(monitor.snapshot_at).getTime()
          : Date.now()
        const merged = await mergeWithPendingNew(monitorId, frozen)
        await updateMonitorNewCount(monitorId, merged.newCount)
        return jsonProducts(merged.products, {
          q,
          page,
          condition,
          fetchedAt,
          fromCache: true,
          frozen: true,
          nextUpdateInMin: Math.ceil(minutesUntilSnapshotDue(monitor.snapshot_at, plan, now)),
          mlPageFull: frozen.length >= ML_PAGE_STEP,
        })
      }

      if (discover || force) {
        const seenIds = await getMonitorSeenIds(monitorId)
        if (seenIds.size > 0) {
          const { page1, hasMore } = await discoverNewProducts(
            monitorId, q, sort, condition, 8,
          )
          let page1Products = page1
          if (page1Products.length > 0) {
            await writeCache(search.id, page, page1Products)
            await saveMonitorSnapshot(monitorId, page1Products, search.id)
          } else {
            page1Products = productFallback(monitor, cached, search.id)
          }
          const merged = await mergeWithPendingNew(monitorId, page1Products)
          await updateMonitorNewCount(monitorId, merged.newCount)
          return jsonProducts(merged.products, {
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
          const merged = await mergeWithPendingNew(monitorId, fallback)
          await updateMonitorNewCount(monitorId, merged.newCount)
          return jsonProducts(merged.products, {
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

      if (cached && !sharedCacheStaleForPlan(cached.scraped_at, plan, now)) {
        products = cached.products
        fromCache = true
        fetchedAt = new Date(cached.scraped_at).getTime()
        mlPageFull = products.length >= ML_PAGE_STEP
      } else {
        const { products: scraped, scrapedCount } = await searchProducts(q, sort, page, condition, exclude)
        products = scraped
        mlPageFull = scrapedCount >= ML_PAGE_STEP
        if (products.length > 0) {
          await writeCache(search.id, page, products)
          await writeHeartbeat('ml_scrape', 'ok', `Scrape OK: ${products.length} produtos`, { query: q })
        }
        fetchedAt = Date.now()
      }

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

      const merged = await mergeWithPendingNew(monitorId, products)
      products = merged.products
      if (!initialCatalog) {
        await updateMonitorNewCount(monitorId, merged.newCount)
      }

      return jsonProducts(products, {
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
    const msg = toErrorMessage(err)
    console.error('[search] error:', msg)
    await writeHeartbeat('ml_scrape', 'error', msg.slice(0, 500)).catch(() => {})
    return Response.json({ error: msg }, { status: 500 })
  }
}
