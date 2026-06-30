import Link from 'next/link'
import {
  type PlanConfig,
  formatPlanPrice,
  formatRefreshMinutes,
  formatActiveHours,
  isPaidPlan,
} from '@/lib/plans'

export default function PlanCard({
  plan,
  highlighted = false,
}: {
  plan: PlanConfig
  highlighted?: boolean
}) {
  const paid = isPaidPlan(plan.id)

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlighted
          ? 'border-yellow-400 bg-yellow-50/50 shadow-lg shadow-yellow-400/10 dark:border-yellow-500/50 dark:bg-yellow-950/20'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-yellow-400 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
          Popular
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{plan.name}</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{plan.tagline}</p>
      </div>

      <p className="mb-6 text-3xl font-bold text-zinc-900 dark:text-white">
        {formatPlanPrice(plan)}
      </p>

      <ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            <strong>{plan.monitorLimit}</strong>{' '}
            {plan.monitorLimit === 1 ? 'monitor' : 'monitores'}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            Atualização a cada <strong>{formatRefreshMinutes(plan.clientRefreshMinutes)}</strong>{' '}
            com o app aberto
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            Monitoramento <strong>{formatActiveHours(plan)}</strong> (BRT)
          </span>
        </li>
        {!paid && (
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Ideal para testar antes de assinar</span>
          </li>
        )}
      </ul>

      <Link
        href={paid ? '/register?plan=' + plan.id : '/register'}
        className={`flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          highlighted
            ? 'bg-yellow-400 text-zinc-900 hover:bg-yellow-300'
            : 'border border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700'
        }`}
      >
        {paid ? 'Começar agora' : 'Criar conta grátis'}
      </Link>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
