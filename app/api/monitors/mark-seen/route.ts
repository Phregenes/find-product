import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearPendingNewProducts, syncPendingNewProducts } from '@/lib/monitor-new'

export const dynamic = 'force-dynamic'

/** Mark listings as seen and remove them from pending new storage. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const monitorId = body?.monitorId?.trim()
  const productIds = Array.isArray(body?.productIds)
    ? (body.productIds as string[]).filter(Boolean)
    : []

  if (!monitorId || productIds.length === 0) {
    return Response.json({ error: 'monitorId e productIds são obrigatórios' }, { status: 400 })
  }

  const { data: monitor, error: mErr } = await supabase
    .from('monitors')
    .select('id')
    .eq('id', monitorId)
    .eq('user_id', claims.claims.sub as string)
    .maybeSingle()
  if (mErr) throw mErr
  if (!monitor) {
    return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
  }

  const rows = productIds.map((product_id) => ({ monitor_id: monitorId, product_id }))
  const { error: seenErr } = await supabase
    .from('monitor_seen_products')
    .upsert(rows, { onConflict: 'monitor_id,product_id', ignoreDuplicates: true })
  if (seenErr) throw seenErr

  await clearPendingNewProducts(monitorId, productIds)

  const { count, error: countErr } = await supabase
    .from('monitor_new_products')
    .select('*', { count: 'exact', head: true })
    .eq('monitor_id', monitorId)
  if (countErr) throw countErr
  const newCount = count ?? 0

  await supabase.from('monitors').update({ new_count: newCount }).eq('id', monitorId)

  return Response.json({ ok: true, newCount })
}

/** Persist newly discovered listings from client-side pagination. */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const monitorId = body?.monitorId?.trim()
  const products = Array.isArray(body?.products) ? body.products : []

  if (!monitorId || products.length === 0) {
    return Response.json({ error: 'monitorId e products são obrigatórios' }, { status: 400 })
  }

  const { data: monitor, error: mErr } = await supabase
    .from('monitors')
    .select('id')
    .eq('id', monitorId)
    .eq('user_id', claims.claims.sub as string)
    .maybeSingle()
  if (mErr) throw mErr
  if (!monitor) {
    return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
  }

  const pending = await syncPendingNewProducts(monitorId, products)
  await supabase.from('monitors').update({ new_count: pending.length }).eq('id', monitorId)

  return Response.json({ ok: true, newCount: pending.length })
}
