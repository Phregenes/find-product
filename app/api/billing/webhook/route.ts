import { NextRequest } from 'next/server'
import {
  applyPaymentToProfile,
  applySubscriptionToProfile,
  downgradeForFailedPayment,
} from '@/lib/billing'
import {
  PAYMENT_FAIL_EVENTS,
  PAYMENT_OK_EVENTS,
  getPayment,
  getSubscription,
  isFailedPaymentStatus,
  isInactiveSubscriptionStatus,
  isPaidPaymentStatus,
  verifyWebhookToken,
  type AsaasPayment,
  type AsaasSubscription,
} from '@/lib/asaas'

export const dynamic = 'force-dynamic'

/** Assinatura encerrada no Asaas → rebaixa para free. */
const SUBSCRIPTION_OFF_EVENTS = new Set(['SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED'])

type WebhookBody = {
  event?: string
  payment?: Partial<AsaasPayment> & { id?: string }
  subscription?: Partial<AsaasSubscription> & { id?: string }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: 'billing-webhook' })
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookToken(request.headers.get('asaas-access-token'))) {
    return Response.json({ error: 'Token inválido' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as WebhookBody
  const event = body.event ?? ''

  try {
    if (event.startsWith('PAYMENT_')) {
      return await handlePaymentEvent(event, body.payment)
    }

    if (SUBSCRIPTION_OFF_EVENTS.has(event) || event === 'SUBSCRIPTION_UPDATED') {
      return await handleSubscriptionEvent(event, body.subscription)
    }

    return Response.json({ ok: true, ignored: event || 'unknown' })
  } catch (err) {
    console.error('[billing/webhook]', event, (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

async function resolvePayment(payload?: WebhookBody['payment']): Promise<AsaasPayment | null> {
  if (!payload?.id) return null

  try {
    const live = await getPayment(payload.id)
    return {
      ...payload,
      ...live,
      externalReference: live.externalReference || payload.externalReference,
      subscription: live.subscription || payload.subscription,
    }
  } catch (err) {
    console.warn('[billing/webhook] getPayment falhou, usando payload', payload.id, (err as Error).message)
    return {
      id: payload.id,
      status: payload.status,
      subscription: payload.subscription,
      externalReference: payload.externalReference,
      deleted: payload.deleted,
    }
  }
}

async function handlePaymentEvent(event: string, payload?: WebhookBody['payment']) {
  const payment = await resolvePayment(payload)
  if (!payment) {
    console.warn('[billing/webhook] evento sem payment.id', event)
    return Response.json({ ok: true, ignored: 'no_payment_id' })
  }

  const subscription = payment.subscription
    ? await getSubscription(payment.subscription).catch(() => null)
    : null

  const paid = PAYMENT_OK_EVENTS.has(event) || isPaidPaymentStatus(payment.status)
  const failed =
    PAYMENT_FAIL_EVENTS.has(event)
    || isFailedPaymentStatus(payment.status, payment.deleted)

  if (paid && !failed) {
    const result = await applyPaymentToProfile(payment, subscription)
    if (result.updated) {
      console.info('[billing/webhook] plano liberado', {
        event,
        paymentId: payment.id,
        userId: result.userId,
        planId: result.planId,
        status: payment.status,
      })
    }
    return Response.json({ ok: true, updated: result.updated })
  }

  if (failed) {
    const result = await downgradeForFailedPayment(payment, subscription, event)
    if (result.updated) {
      console.info('[billing/webhook] plano rebaixado para free', {
        event,
        paymentId: payment.id,
        userId: result.userId,
        status: payment.status,
      })
    }
    return Response.json({ ok: true, updated: result.updated, downgraded: result.updated })
  }

  return Response.json({ ok: true, ignored: event, status: payment.status ?? null })
}

async function handleSubscriptionEvent(
  event: string,
  subscription?: WebhookBody['subscription'],
) {
  if (!subscription?.id) {
    return Response.json({ ok: true, ignored: 'no_subscription_id' })
  }

  const full = subscription.externalReference
    ? subscription
    : await getSubscription(subscription.id).catch(() => subscription)

  const status =
    full.status
    ?? (event === 'SUBSCRIPTION_DELETED' ? 'DELETED' : event === 'SUBSCRIPTION_INACTIVATED' ? 'INACTIVE' : 'UNKNOWN')

  if (event === 'SUBSCRIPTION_UPDATED' && !isInactiveSubscriptionStatus(status)) {
    return Response.json({ ok: true, ignored: 'subscription_still_active', status })
  }

  const result = await applySubscriptionToProfile({
    id: full.id ?? subscription.id,
    status,
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
