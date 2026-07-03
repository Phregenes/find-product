import 'server-only'

import { Resend } from 'resend'
import type { MarketplaceMode, Product } from '@/lib/product'
import { buildNewProductsEmail } from './new-products'

let resend: Resend | null = null

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return null
  if (!resend) resend = new Resend(key)
  return resend
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim()
}

export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function sendNewProductsEmail({
  to,
  monitorQuery,
  marketplaceMode,
  products,
}: {
  to: string
  monitorQuery: string
  marketplaceMode?: MarketplaceMode
  products: Product[]
}): Promise<{ ok: boolean; error?: string }> {
  const client = getResend()
  if (!client) {
    return { ok: false, error: 'RESEND_API_KEY não configurada' }
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ?? 'FindProduct <onboarding@resend.dev>'

  const { subject, html, text } = buildNewProductsEmail({
    monitorQuery,
    marketplaceMode,
    products,
    appUrl: getAppUrl(),
  })

  const { error } = await client.emails.send({
    from,
    to,
    subject,
    html,
    text,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
