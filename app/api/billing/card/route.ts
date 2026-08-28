import { getUserIdFromSession } from '@/lib/plans-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscriptionMaskedCard, isAsaasConfigured } from '@/lib/asaas'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isAsaasConfigured()) {
    return Response.json({ error: 'Asaas ainda não configurado.' }, { status: 503 })
  }

  const userId = await getUserIdFromSession()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('asaas_subscription_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const subscriptionId = profile?.asaas_subscription_id as string | null
  if (!subscriptionId) {
    return Response.json({ card: null })
  }

  try {
    const card = await getSubscriptionMaskedCard(subscriptionId)
    return Response.json({ card })
  } catch (err) {
    console.error('[billing/card]', (err as Error).message)
    return Response.json({ card: null, error: (err as Error).message }, { status: 200 })
  }
}
