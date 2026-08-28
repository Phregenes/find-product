import { NextRequest } from 'next/server'
import { getUserIdFromSession } from '@/lib/plans-server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  clientIpFromRequest,
  isAsaasConfigured,
  updateSubscriptionCreditCard,
} from '@/lib/asaas'

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
    return Response.json({ error: 'Asaas ainda não configurado.' }, { status: 503 })
  }

  const userId = await getUserIdFromSession()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.replace(/\D/g, '') : ''
  const holderName = typeof body.holderName === 'string' ? body.holderName.trim() : ''
  const cardNumber = typeof body.cardNumber === 'string' ? body.cardNumber.replace(/\D/g, '') : ''
  const expiry = typeof body.expiry === 'string' ? body.expiry : ''
  const ccv = typeof body.ccv === 'string' ? body.ccv.replace(/\D/g, '') : ''
  const postalCode = typeof body.postalCode === 'string' ? body.postalCode.replace(/\D/g, '') : ''
  const addressNumber = typeof body.addressNumber === 'string' ? body.addressNumber.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : ''

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
    .select('email, asaas_subscription_id, plan')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[billing/update-card] profile', profileError.message)
    return Response.json({ error: 'Erro ao ler perfil.' }, { status: 500 })
  }

  const subscriptionId = profile?.asaas_subscription_id as string | null
  if (!subscriptionId) {
    return Response.json(
      { error: 'Nenhuma assinatura ativa para atualizar o cartão.' },
      { status: 400 },
    )
  }

  const email = profile?.email?.trim()
  if (!email) {
    return Response.json({ error: 'E-mail da conta é obrigatório.' }, { status: 400 })
  }

  try {
    await updateSubscriptionCreditCard({
      subscriptionId,
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

    return Response.json({ ok: true })
  } catch (err) {
    const message = (err as Error).message
    console.error('[billing/update-card]', message)
    return Response.json({ error: message }, { status: 400 })
  }
}
