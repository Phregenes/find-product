import 'server-only'

import { getSiteUrl } from '@/lib/site'
import { PAID_PLAN_IDS, PLANS, type PaidPlanId } from '@/lib/plans'

const PRODUCTION_BASE = 'https://api.asaas.com'
const SANDBOX_BASE = 'https://api-sandbox.asaas.com'

export function isAsaasConfigured(): boolean {
  return Boolean(readApiKey())
}

function readApiKey(): string | null {
  let key =
    process.env.ASAAS_API_KEY?.trim()
    || process.env.asaas_api_key?.trim()
    || ''
  if (!key) return null
  // Next.js interpolates unescaped `$` in .env.local; if only the dollar was lost, restore it.
  if (key.startsWith('aact_')) key = `$${key}`
  return key
}

function apiKey(): string {
  const key = readApiKey()
  if (!key) throw new Error('ASAAS_API_KEY não configurado')
  return key
}

function apiBase(): string {
  if (process.env.ASAAS_API_URL?.trim()) {
    return process.env.ASAAS_API_URL.trim().replace(/\/$/, '')
  }
  const key = readApiKey() ?? ''
  if (process.env.ASAAS_SANDBOX === 'false' || key.startsWith('$aact_prod_')) {
    return PRODUCTION_BASE
  }
  return SANDBOX_BASE
}

function formatAsaasError(body: unknown, status: number): string {
  const b = body as {
    errors?: Array<{ description?: string; code?: string }>
    message?: string
  }
  const first = b.errors?.[0]?.description || b.errors?.[0]?.code
  return first || b.message || `Asaas HTTP ${status}`
}

export async function asaasRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { headers, ...rest } = init
  const res = await fetch(`${apiBase()}${path}`, {
    ...rest,
    headers: {
      access_token: apiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'FindProduct/1.0 (Next.js)',
      ...headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = formatAsaasError(body, res.status)
    console.error('[asaas]', path, res.status, body)
    throw new Error(message)
  }
  return body as T
}

export function parseBillingReference(ref: string | null | undefined): {
  userId: string
  planId: PaidPlanId
} | null {
  if (!ref) return null
  const parts = ref.split(':')
  if (parts.length !== 3 || parts[0] !== 'fp') return null
  const planId = parts[2] as PaidPlanId
  if (!PAID_PLAN_IDS.includes(planId)) return null
  return { userId: parts[1], planId }
}

export function buildBillingReference(userId: string, planId: PaidPlanId): string {
  return `fp:${userId}:${planId}`
}

export function subscriptionSuccessUrl(): string {
  return `${getSiteUrl()}/assinar/ok`
}

export interface AsaasCustomer {
  id: string
  email?: string
  name?: string
}

export interface AsaasSubscription {
  id: string
  status?: string
  externalReference?: string
  customer?: string
}

export interface AsaasPayment {
  id: string
  status?: string
  subscription?: string
  externalReference?: string
  invoiceUrl?: string
  billingType?: string
}

export async function createCustomer(input: {
  userId: string
  name: string
  email: string
  cpfCnpj?: string
}): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>('/v3/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj?.replace(/\D/g, '') || undefined,
      externalReference: input.userId,
      notificationDisabled: false,
    }),
  })
}

export interface CreditCardInput {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export interface CreditCardHolderInput {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
  mobilePhone?: string
  addressComplement?: string
}

export async function createMonthlySubscription(input: {
  customerId: string
  userId: string
  planId: PaidPlanId
  creditCard: CreditCardInput
  creditCardHolderInfo: CreditCardHolderInput
  remoteIp: string
}): Promise<AsaasSubscription> {
  const plan = PLANS[input.planId]
  const today = new Date().toISOString().slice(0, 10)
  const successUrl = subscriptionSuccessUrl()
  const isLocalDev =
    successUrl.includes('localhost') || successUrl.includes('127.0.0.1')

  const payload: Record<string, unknown> = {
    customer: input.customerId,
    billingType: 'CREDIT_CARD',
    value: plan.priceMonthly,
    cycle: 'MONTHLY',
    nextDueDate: today,
    description: `FindProduct ${plan.name}`,
    externalReference: buildBillingReference(input.userId, input.planId),
    creditCard: {
      holderName: input.creditCard.holderName,
      number: input.creditCard.number.replace(/\D/g, ''),
      expiryMonth: input.creditCard.expiryMonth.padStart(2, '0'),
      expiryYear: normalizeExpiryYear(input.creditCard.expiryYear),
      ccv: input.creditCard.ccv,
    },
    creditCardHolderInfo: {
      name: input.creditCardHolderInfo.name,
      email: input.creditCardHolderInfo.email,
      cpfCnpj: input.creditCardHolderInfo.cpfCnpj.replace(/\D/g, ''),
      postalCode: input.creditCardHolderInfo.postalCode.replace(/\D/g, ''),
      addressNumber: input.creditCardHolderInfo.addressNumber,
      phone: input.creditCardHolderInfo.phone.replace(/\D/g, ''),
      ...(input.creditCardHolderInfo.mobilePhone
        ? { mobilePhone: input.creditCardHolderInfo.mobilePhone.replace(/\D/g, '') }
        : {}),
      ...(input.creditCardHolderInfo.addressComplement
        ? { addressComplement: input.creditCardHolderInfo.addressComplement }
        : {}),
    },
    remoteIp: input.remoteIp,
  }

  if (!isLocalDev) {
    payload.callback = {
      successUrl,
      autoRedirect: true,
    }
  }

  return asaasRequest<AsaasSubscription>('/v3/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

function normalizeExpiryYear(year: string): string {
  const digits = year.replace(/\D/g, '')
  if (digits.length === 2) return `20${digits}`
  return digits
}

export async function listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
  const res = await asaasRequest<{ data?: AsaasPayment[] }>(
    `/v3/subscriptions/${subscriptionId}/payments`,
  )
  return res.data ?? []
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(`/v3/payments/${id}`)
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>(`/v3/subscriptions/${id}`)
}

export async function cancelSubscription(id: string): Promise<void> {
  await asaasRequest(`/v3/subscriptions/${id}`, { method: 'DELETE' })
}

export function checkoutUrlFromPayments(payments: AsaasPayment[]): string {
  const pending = payments.find((p) => p.invoiceUrl && p.status !== 'RECEIVED')
  return pending?.invoiceUrl || payments[0]?.invoiceUrl || ''
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim()
    if (ip) return ip
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return '127.0.0.1'
}

export function isPaidPaymentStatus(status?: string): boolean {
  const s = (status ?? '').toUpperCase()
  return s === 'RECEIVED' || s === 'CONFIRMED'
}

export function isActiveSubscriptionStatus(status?: string): boolean {
  const s = (status ?? '').toUpperCase()
  return s === 'ACTIVE' || s === 'ATIVA'
}

export function isInactiveSubscriptionStatus(status?: string): boolean {
  const s = (status ?? '').toUpperCase()
  return s === 'INACTIVE' || s === 'EXPIRED' || s === 'DELETED'
}

export function webhookToken(): string | null {
  return process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null
}

export function verifyWebhookToken(header: string | null): boolean {
  const expected = webhookToken()
  if (!expected) {
    console.warn('[asaas] ASAAS_WEBHOOK_TOKEN ausente — webhook não validado')
    return true
  }
  return header === expected
}
