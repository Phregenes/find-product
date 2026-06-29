import { NextRequest } from 'next/server'
import {
  searchProducts,
  searchMoreProducts,
  ML_PAGE_STEP,
  type SortBy,
  type Condition,
} from '@/lib/scraper'
import { createClient } from '@/lib/supabase/server'
import { resolveSearch, writeCache } from '@/lib/searches'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim()
  const sort = (request.nextUrl.searchParams.get('sort') ?? 'recent') as SortBy
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10))
  const condition = (request.nextUrl.searchParams.get('condition') ?? 'all') as Condition
  const exclude = request.nextUrl.searchParams.get('exclude')?.split(',').filter(Boolean) ?? []
  const minNew = parseInt(request.nextUrl.searchParams.get('minNew') ?? '0', 10)

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
      })
    }

    const { products, scrapedCount } = await searchProducts(q, sort, page, condition, exclude)

    // Populate the shared cache so other users monitoring the same search
    // benefit from this scrape (only when not excluding, to store full pages).
    if (exclude.length === 0) {
      try {
        const search = await resolveSearch(q, sort, condition)
        await writeCache(search.id, page, products)
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
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    console.error('[search] error:', msg)
    return Response.json(
      { error: msg },
      { status: 500 },
    )
  }
}
