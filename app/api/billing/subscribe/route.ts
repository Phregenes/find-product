import { NextRequest } from 'next/server'
import { PAID_PLAN_IDS, type PaidPlanId } from '@/lib/plans'
import { getUserIdFromSession } from '@/lib/plans-server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  clientIpFromRequest,
  createCustomer,
  createMonthlySubscription,
  isActiveSubscriptionStatus,
  isAsaasConfigured,
  isPaidPaymentStatus,
  listSubscriptionPayments,
} from '@/lib/asaas'
import { replaceUserSubscription } from '@/lib/billing'

export const dynamic = 'force-dynamic'

function parseExpiry(expiry: string): { month: string; year: string } | null {
  const match = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/)
  if (!match) return null
  const month = Number(match[1])
  const year = match[2]
  if (month < 1 || month > 12) return null
  return { month: String(month), year }
}

export async function POST(request: NextRequest) {
  if (!isAsaasConfigured()) {
    return Response.json(
      {
        error: 'Asaas ainda não configurado. Reinicie o servidor Next depois de salvar ASAAS_API_KEY no .env.local.',
      },
      { status: 503 },
    )
  }

  const userId = await getUserIdFromSession()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const planId = body.planId as PaidPlanId | undefined
  const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.replace(/\D/g, '') : ''
  const holderName = typeof body.holderName === 'string' ? body.holderName.trim() : ''
  const cardNumber = typeof body.cardNumber === 'string' ? body.cardNumber.replace(/\D/g, '') : ''
  const expiry = typeof body.expiry === 'string' ? body.expiry : ''
  const ccv = typeof body.ccv === 'string' ? body.ccv.replace(/\D/g, '') : ''
  const postalCode = typeof body.postalCode === 'string' ? body.postalCode.replace(/\D/g, '') : ''
  const addressNumber = typeof body.addressNumber === 'string' ? body.addressNumber.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : ''

  if (!planId || !PAID_PLAN_IDS.includes(planId)) {
    return Response.json({ error: 'Plano inválido' }, { status: 400 })
  }

  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    return Response.json({ error: 'CPF/CNPJ inválido' }, { status: 400 })
  }

  if (!holderName) {
    return Response.json({ error: 'Informe o nome impresso no cartão.' }, { status: 400 })
  }

  if (cardNumber.length < 13 || cardNumber.length > 19) {
    return Response.json({ error: 'Número do cartão inválido.' }, { status: 400 })
  }

  const parsedExpiry = parseExpiry(expiry)
  if (!parsedExpiry) {
    return Response.json({ error: 'Validade inválida. Use MM/AA.' }, { status: 400 })
  }

  if (ccv.length < 3 || ccv.length > 4) {
    return Response.json({ error: 'CVV inválido.' }, { status: 400 })
  }

  if (postalCode.length !== 8) {
    return Response.json({ error: 'CEP inválido.' }, { status: 400 })
  }

  if (!addressNumber) {
    return Response.json({ error: 'Informe o número do endereço.' }, { status: 400 })
  }

  if (phone.length < 10) {
    return Response.json({ error: 'Telefone inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email, display_name, asaas_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[billing/subscribe] profile', profileError.message)
    return Response.json(
      { error: 'Erro ao ler perfil. Confira SUPABASE_SERVICE_ROLE_KEY no .env.local.' },
      { status: 500 },
    )
  }

  const email = profile?.email?.trim()
  if (!email) {
    return Response.json({ error: 'E-mail da conta é obrigatório para assinar.' }, { status: 400 })
  }

  const name = profile?.display_name?.trim() || email.split('@')[0] || 'Cliente FindProduct'

  try {
    let customerId = profile?.asaas_customer_id as string | null
    if (!customerId) {
      const customer = await createCustomer({
        userId,
        name,
        email,
        cpfCnpj,
      })
      customerId = customer.id
    }

    const subscription = await createMonthlySubscription({
      customerId,
      userId,
      planId,
      remoteIp: clientIpFromRequest(request),
      creditCard: {
        holderName,
        number: cardNumber,
        expiryMonth: parsedExpiry.month,
        expiryYear: parsedExpiry.year,
        ccv,
      },
      creditCardHolderInfo: {
        name: holderName,
        email,
        cpfCnpj,
        postalCode,
        addressNumber,
        phone,
        mobilePhone: phone,
      },
    })

    const payments = await listSubscriptionPayments(subscription.id)
    const paid = payments.some((p) => isPaidPaymentStatus(p.status))
    const active = isActiveSubscriptionStatus(subscription.status)

    await replaceUserSubscription(
      userId,
      subscription.id,
      planId,
      subscription.status ?? 'PENDING',
      customerId,
      { upgradePlan: active || paid },
    )

    return Response.json({
      ok: true,
      status: subscription.status,
      planId,
      redirectUrl: '/assinar/ok',
    })
  } catch (err) {
    const message = (err as Error).message
    const hint = message.toLowerCase().includes('cpf')
      ? ' Confira o CPF informado.'
      : ''
    return Response.json({ error: message + hint }, { status: 400 })
  }
}
