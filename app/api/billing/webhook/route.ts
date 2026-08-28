import { NextRequest } from 'next/server'
import { applyPaymentToProfile } from '@/lib/billing'
import { getPayment, getSubscription, verifyWebhookToken } from '@/lib/asaas'

export const dynamic = 'force-dynamic'

/** Eventos que confirmam pagamento e devem liberar o plano. */
const PAYMENT_OK_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])

export async function GET() {
  return Response.json({ ok: true, endpoint: 'billing-webhook' })
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookToken(request.headers.get('asaas-access-token'))) {
    return Response.json({ error: 'Token inválido' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    event?: string
    payment?: {
      id?: string
      status?: string
      subscription?: string
      externalReference?: string
    }
  }

  const event = body.event ?? ''

  if (!PAYMENT_OK_EVENTS.has(event)) {
    return Response.json({ ok: true, ignored: event || 'unknown' })
  }

  const paymentId = body.payment?.id
  if (!paymentId) {
    console.warn('[billing/webhook] evento sem payment.id', event)
    return Response.json({ ok: true, ignored: 'no_payment_id' })
  }

  try {
    const payment = await getPayment(paymentId)
    const subscription = payment.subscription
      ? await getSubscription(payment.subscription).catch(() => null)
      : null

    const result = await applyPaymentToProfile(payment, subscription)

    if (result.updated) {
      console.info('[billing/webhook] plano liberado', {
        event,
        paymentId,
        userId: result.userId,
        planId: result.planId,
      })
    } else {
      console.info('[billing/webhook] pagamento ignorado', {
        event,
        paymentId,
        status: payment.status,
      })
    }

    return Response.json({ ok: true, updated: result.updated })
  } catch (err) {
    console.error('[billing/webhook]', event, paymentId, (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
