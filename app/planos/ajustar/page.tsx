import { redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import SiteFooter from '@/app/components/SiteFooter'
import DowngradeAdjustForm from '@/app/components/DowngradeAdjustForm'
import { getUserIdFromSession, getUserPlan } from '@/lib/plans-server'
import { getPlanConfig, type PlanId, formatPlanPrice } from '@/lib/plans'
import { isPlanDowngrade } from '@/lib/plans'

export const dynamic = 'force-dynamic'

export default async function AjustarPlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const userId = await getUserIdFromSession()
  const params = await searchParams
  const target = getPlanConfig(params.plan)
  const targetPlanId = target.id as PlanId
  const next = `/planos/ajustar?plan=${targetPlanId}`

  if (!userId) {
    redirect(`/login?redirectTo=${encodeURIComponent(next)}`)
  }

  if (!params.plan || target.id !== params.plan) {
    redirect('/planos')
  }

  const currentPlan = await getUserPlan(userId)
  if (!isPlanDowngrade(currentPlan.id, targetPlanId)) {
    redirect(targetPlanId === 'free' ? '/planos' : `/assinar?plan=${targetPlanId}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Downgrade
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
              Ajustar monitores para {target.name}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {formatPlanPrice(target)} · limite de {target.monitorLimit}{' '}
              {target.monitorLimit === 1 ? 'monitor' : 'monitores'}
            </p>
          </div>
          <Link
            href="/planos"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Voltar aos planos
          </Link>
        </div>

        <div className="mt-8">
          <DowngradeAdjustForm targetPlanId={targetPlanId} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
