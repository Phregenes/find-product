import { NextRequest } from 'next/server'
import {
  applyPaymentToProfile,
  applySubscriptionToProfile,
  downgradeForFailedPayment,
} from '@/lib/billing'
import { getPayment, getSubscription, verifyWebhookToken } from '@/lib/asaas'

export const dynamic = 'force-dynamic'

/** Pagamento ok → libera plano. */
const PAYMENT_OK_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])

/** Pagamento falhou / parou → rebaixa para free. */
const PAYMENT_FAIL_EVENTS = new Set([
  'PAYMENT_OVERDUE',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
])

/** Assinatura encerrada no Asaas → rebaixa para free. */
const SUBSCRIPTION_OFF_EVENTS = new Set(['SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED'])

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
    subscription?: {
      id?: string
      status?: string
      externalReference?: string
    }
  }

  const event = body.event ?? ''

  try {
    if (PAYMENT_OK_EVENTS.has(event)) {
      return await handlePaymentOk(event, body.payment?.id)
    }

    if (PAYMENT_FAIL_EVENTS.has(event)) {
      return await handlePaymentFail(event, body.payment?.id)
    }

    if (SUBSCRIPTION_OFF_EVENTS.has(event)) {
      return await handleSubscriptionOff(event, body.subscription)
    }

    return Response.json({ ok: true, ignored: event || 'unknown' })
  } catch (err) {
    console.error('[billing/webhook]', event, (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

async function handlePaymentOk(event: string, paymentId?: string) {
  if (!paymentId) {
    console.warn('[billing/webhook] evento sem payment.id', event)
    return Response.json({ ok: true, ignored: 'no_payment_id' })
  }

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
  }

  return Response.json({ ok: true, updated: result.updated })
}

async function handlePaymentFail(event: string, paymentId?: string) {
  if (!paymentId) {
    console.warn('[billing/webhook] falha sem payment.id', event)
    return Response.json({ ok: true, ignored: 'no_payment_id' })
  }

  const payment = await getPayment(paymentId)
  const subscription = payment.subscription
    ? await getSubscription(payment.subscription).catch(() => null)
    : null

  const result = await downgradeForFailedPayment(payment, subscription, event)

  if (result.updated) {
    console.info('[billing/webhook] plano rebaixado para free', {
      event,
      paymentId,
      userId: result.userId,
      status: payment.status,
    })
  }

  return Response.json({ ok: true, updated: result.updated, downgraded: result.updated })
}

async function handleSubscriptionOff(
  event: string,
  subscription?: { id?: string; status?: string; externalReference?: string },
) {
  if (!subscription?.id) {
    return Response.json({ ok: true, ignored: 'no_subscription_id' })
  }

  const full = subscription.externalReference
    ? subscription
    : await getSubscription(subscription.id).catch(() => subscription)

  const result = await applySubscriptionToProfile({
    id: full.id ?? subscription.id,
    status: full.status ?? (event === 'SUBSCRIPTION_DELETED' ? 'DELETED' : 'INACTIVE'),
    externalReference: full.externalReference,
    customer: 'customer' in full ? (full as { customer?: string }).customer : undefined,
  })

  console.info('[billing/webhook] assinatura encerrada', {
    event,
    subscriptionId: subscription.id,
    userId: result.userId,
    downgraded: result.downgraded,
  })

  return Response.json({ ok: true, updated: result.updated, downgraded: result.downgraded })
}
