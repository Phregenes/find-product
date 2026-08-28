import { redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import SiteFooter from '@/app/components/SiteFooter'
import CheckoutForm from '@/app/components/CheckoutForm'
import { getUserIdFromSession, getUserPlan } from '@/lib/plans-server'
import {
  PAID_PLAN_IDS,
  PLANS,
  type PaidPlanId,
  formatPlanPrice,
  formatPlanMarketplaces,
  isPlanDowngrade,
} from '@/lib/plans'
import { getDowngradePreview } from '@/lib/plan-downgrade'

export const dynamic = 'force-dynamic'

export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const userId = await getUserIdFromSession()
  const params = await searchParams
  const planId = params.plan as PaidPlanId | undefined
  const next = `/assinar${planId ? `?plan=${planId}` : ''}`

  if (!userId) {
    redirect(`/login?redirectTo=${encodeURIComponent(next)}`)
  }

  if (!planId || !PAID_PLAN_IDS.includes(planId)) {
    redirect('/planos')
  }

  const currentPlan = await getUserPlan(userId)
  if (currentPlan.id === planId) {
    redirect('/planos')
  }

  if (isPlanDowngrade(currentPlan.id, planId)) {
    const preview = await getDowngradePreview(userId, planId)
    if (preview.needsAdjustment) {
      redirect(`/planos/ajustar?plan=${planId}`)
    }
  }

  const plan = PLANS[planId]

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Checkout</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">
          Assinar {plan.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {formatPlanPrice(plan)} · {formatPlanMarketplaces(plan)}
        </p>
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <CheckoutForm planId={planId} />
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400">
          <Link href="/planos" className="hover:text-zinc-700 dark:hover:text-zinc-200">
            Voltar aos planos
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
