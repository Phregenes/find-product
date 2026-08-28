import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { type PaidPlanId } from '@/lib/plans'
import {
  cancelSubscription,
  getSubscription,
  isActiveSubscriptionStatus,
  isAsaasConfigured,
  isInactiveSubscriptionStatus,
  isPaidPaymentStatus,
  parseBillingReference,
  type AsaasPayment,
  type AsaasSubscription,
} from '@/lib/asaas'

export async function applySubscriptionToProfile(subscription: AsaasSubscription): Promise<void> {
  const parsed = parseBillingReference(subscription.externalReference)
  if (!parsed) return

  const admin = createAdminClient()
  const status = (subscription.status ?? 'UNKNOWN').toUpperCase()
  const inactive = isInactiveSubscriptionStatus(status)

  await admin
    .from('profiles')
    .update({
      ...(inactive ? { plan: 'free' as const } : {}),
      asaas_subscription_id: subscription.id,
      asaas_subscription_status: status,
    })
    .eq('id', parsed.userId)
}

export async function applyPaymentToProfile(
  payment: AsaasPayment,
  subscription?: AsaasSubscription | null,
): Promise<{ updated: boolean; userId?: string; planId?: PaidPlanId }> {
  const ref = payment.externalReference || subscription?.externalReference
  const parsed = parseBillingReference(ref)
  if (!parsed) {
    console.warn('[billing] pagamento sem externalReference reconhecível', payment.id, ref)
    return { updated: false }
  }

  if (!isPaidPaymentStatus(payment.status)) {
    return { updated: false, userId: parsed.userId, planId: parsed.planId }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      plan: parsed.planId,
      ...(payment.subscription ? { asaas_subscription_id: payment.subscription } : {}),
      asaas_subscription_status: payment.status ?? 'PAID',
    })
    .eq('id', parsed.userId)

  if (error) {
    throw new Error(error.message)
  }

  return { updated: true, userId: parsed.userId, planId: parsed.planId }
}

export async function replaceUserSubscription(
  userId: string,
  subscriptionId: string,
  planId: PaidPlanId,
  status: string,
  customerId: string,
  options?: { upgradePlan?: boolean },
): Promise<void> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('profiles')
    .select('asaas_subscription_id')
    .eq('id', userId)
    .maybeSingle()

  const oldId = existing?.asaas_subscription_id as string | null
  if (oldId && oldId !== subscriptionId) {
    try {
      await cancelSubscription(oldId)
    } catch {
      // Pode já estar cancelada.
    }
  }

  const upgradePlan =
    options?.upgradePlan ?? (isActiveSubscriptionStatus(status) || isPaidPaymentStatus(status))

  await admin
    .from('profiles')
    .update({
      ...(upgradePlan ? { plan: planId } : {}),
      asaas_customer_id: customerId,
      asaas_subscription_id: subscriptionId,
      asaas_subscription_status: status,
    })
    .eq('id', userId)
}

function isBenignCancelError(err: unknown): boolean {
  const msg = (err as Error).message.toLowerCase()
  return (
    msg.includes('não encontrad')
    || msg.includes('not found')
    || msg.includes('inativ')
    || msg.includes('inactive')
    || msg.includes('deleted')
  )
}

/** Cancela assinatura Asaas do usuário antes de excluir a conta. */
export async function cancelUserBilling(userId: string): Promise<void> {
  if (!isAsaasConfigured()) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('asaas_subscription_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const subscriptionId = data?.asaas_subscription_id as string | null
  if (!subscriptionId) return

  try {
    await cancelSubscription(subscriptionId)
    console.info('[billing] assinatura cancelada na exclusão de conta', { userId, subscriptionId })
  } catch (err) {
    if (isBenignCancelError(err)) return
    throw err
  }
}

export async function syncSubscriptionById(id: string): Promise<void> {
  const subscription = await getSubscription(id)
  await applySubscriptionToProfile(subscription)
}
