import { type PlanConfig, formatPlanPrice } from '@/lib/plans'

/** Business WhatsApp (country code + DDD + number, digits only). */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '') ?? '5511915938203'

export function buildPlanWhatsAppUrl(plan: PlanConfig): string {
  const price = formatPlanPrice(plan)
  const message =
    `Olá! Tenho interesse no plano *${plan.name}* (${price}) do FindProduct.\n\n` +
    'Gostaria de mais informações para contratar.'

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
