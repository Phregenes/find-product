import { NextRequest } from 'next/server'
import type { Condition, Product, SortBy } from '@/lib/product'
import { searchProducts } from '@/lib/scraper'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCache } from '@/lib/searches'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ActiveSearch {
  id: string
  query: string
  sort_by: SortBy
  condition: Condition
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!secret) return true // no secret configured (e.g. local) — allow
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Only scrape searches that have at least one monitor (active).
  const { data: monitorRows, error: mErr } = await admin
    .from('monitors')
    .select('search_id, searches(id, query, sort_by, condition)')
  if (mErr) return Response.json({ error: mErr.message }, { status: 500 })

  const searchMap = new Map<string, ActiveSearch>()
  for (const row of monitorRows ?? []) {
    const raw = (row as { searches: ActiveSearch | ActiveSearch[] | null }).searches
    const s = Array.isArray(raw) ? raw[0] : raw
    if (s && !searchMap.has(s.id)) searchMap.set(s.id, s)
  }

  const results: Array<{ search_id: string; query: string; scraped: number; error?: string }> = []

  for (const search of searchMap.values()) {
    try {
      const { products } = await searchProducts(
        search.query,
        search.sort_by,
        1,
        search.condition,
      )
      await writeCache(search.id, 1, products)
      await updateMonitorCounts(admin, search.id, products)
      results.push({ search_id: search.id, query: search.query, scraped: products.length })
    } catch (err) {
      results.push({
        search_id: search.id,
        query: search.query,
        scraped: 0,
        error: (err as Error).message,
      })
    }
  }

  return Response.json({ ran: results.length, results, at: new Date().toISOString() })
}

/** For each monitor on this search, recompute how many scraped items are unseen. */
async function updateMonitorCounts(
  admin: ReturnType<typeof createAdminClient>,
  searchId: string,
  products: Product[],
): Promise<void> {
  const { data: monitors } = await admin
    .from('monitors')
    .select('id')
    .eq('search_id', searchId)

  const productIds = products.map((p) => p.id)
  const now = new Date().toISOString()

  for (const m of monitors ?? []) {
    const monitorId = (m as { id: string }).id
    const { data: seenRows } = await admin
      .from('monitor_seen_products')
      .select('product_id')
      .eq('monitor_id', monitorId)
    const seen = new Set((seenRows ?? []).map((r: { product_id: string }) => r.product_id))
    const newCount = productIds.filter((id) => !seen.has(id)).length
    await admin
      .from('monitors')
      .update({ new_count: newCount, last_checked_at: now })
      .eq('id', monitorId)
  }
}
