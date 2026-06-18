import { NextRequest } from 'next/server'
import { searchProducts, type SortBy, type Condition } from '@/lib/scraper'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const sort = (request.nextUrl.searchParams.get('sort') ?? 'recent') as SortBy
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10))
  const condition = (request.nextUrl.searchParams.get('condition') ?? 'all') as Condition

  if (!q) {
    return Response.json({ error: 'Parâmetro "q" é obrigatório' }, { status: 400 })
  }

  try {
    const products = await searchProducts(q, sort, page, condition)
    return Response.json({
      products,
      query: q,
      page,
      condition,
      total: products.length,
      fetchedAt: Date.now(),
    })
  } catch (err) {
    console.error('[search] error:', err)
    return Response.json(
      { error: 'Falha ao buscar produtos. Tente novamente.' },
      { status: 500 },
    )
  }
}
