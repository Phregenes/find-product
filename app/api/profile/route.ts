import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelUserBilling } from '@/lib/billing'

export const dynamic = 'force-dynamic'

async function getUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('email, display_name, plan, email_alerts, created_at, asaas_subscription_id')
    .eq('id', userId)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ profile: data })
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const displayName = (body.display_name as string | undefined)?.trim() ?? ''

  if (displayName.length > 80) {
    return Response.json({ error: 'Nome deve ter no máximo 80 caracteres.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null })
    .eq('id', userId)
    .select('email, display_name, plan, email_alerts, created_at, asaas_subscription_id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ profile: data })
}

export async function DELETE() {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    await cancelUserBilling(userId)
  } catch (err) {
    console.error('[profile/delete] cancel billing', (err as Error).message)
    return Response.json(
      {
        error:
          'Não foi possível cancelar a assinatura no Asaas. Tente de novo ou fale conosco antes de excluir a conta.',
      },
      { status: 502 },
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const supabase = await createClient()
  await supabase.auth.signOut()

  return Response.json({ ok: true })
}
