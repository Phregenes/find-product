import { NextRequest } from 'next/server'
import type { Condition, SortBy } from '@/lib/product'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSearch } from '@/lib/searches'

export const dynamic = 'force-dynamic'

const DEFAULT_SORT: SortBy = 'recent'

async function getUserId() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monitors')
    .select('*, searches(*)')
    .order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ monitors: data ?? [] })
}

export async function POST(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const query = (body.query as string | undefined)?.trim()
  const condition = (body.condition as Condition | undefined) ?? 'all'
  if (!query) return Response.json({ error: 'Query obrigatória' }, { status: 400 })

  try {
    const search = await resolveSearch(query, DEFAULT_SORT, condition)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('monitors')
      .upsert(
        { user_id: userId, search_id: search.id, query },
        { onConflict: 'user_id,search_id' },
      )
      .select('*, searches(*)')
      .single()
    if (error) throw error
    return Response.json({ monitor: data })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = body.id as string | undefined
  const condition = body.condition as Condition | undefined
  if (!id || !condition) return Response.json({ error: 'id e condition obrigatórios' }, { status: 400 })

  try {
    const admin = createAdminClient()
    const { data: existing, error: exErr } = await admin
      .from('monitors')
      .select('id, user_id, query')
      .eq('id', id)
      .single()
    if (exErr) throw exErr
    if (!existing || existing.user_id !== userId) {
      return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
    }

    const search = await resolveSearch(existing.query, DEFAULT_SORT, condition)
    const { data, error } = await admin
      .from('monitors')
      .update({ search_id: search.id })
      .eq('id', id)
      .select('*, searches(*)')
      .single()
    if (error) throw error
    return Response.json({ monitor: data })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
