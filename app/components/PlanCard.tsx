import Link from 'next/link'
import {
  type PlanConfig,
  formatPlanPrice,
  formatPlanFrequency,
  formatPlanMarketplaces,
  formatActiveHours,
  isPaidPlan,
} from '@/lib/plans'
import { buildPlanWhatsAppUrl } from '@/lib/whatsapp'

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
          Recomendado
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
            <strong>{formatPlanMarketplaces(plan)}</strong>
          </span>
        </li>
        {plan.customFilters && (
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Filtros de relevância, condição e palavras a ignorar</span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            Busca automática no servidor{' '}
            <strong>{formatPlanFrequency(plan)}</strong>
          </span>
        </li>
        {(plan.id === 'lojista' || plan.id === 'pro') && (
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>
              Varredura automática em <strong>várias páginas</strong> por monitor
            </span>
          </li>
        )}
        {(plan.id === 'lojista' || plan.id === 'pro') && (
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>
              Monitoramento <strong>{formatActiveHours(plan)}</strong> (BRT)
            </span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            {plan.emailAlerts ? (
              <>
                Alertas por <strong>e-mail</strong> quando houver novidade
              </>
            ) : (
              <>
                Novidades apenas no <strong>app</strong>
              </>
            )}
          </span>
        </li>
        {!paid && (
          <li className="flex items-start gap-2">
            <CheckIcon />
            <span>Ideal para testar antes de assinar</span>
          </li>
        )}
      </ul>

      {paid ? (
        <a
          href={buildPlanWhatsAppUrl(plan)}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            highlighted
              ? 'bg-yellow-400 text-zinc-900 hover:bg-yellow-300'
              : 'border border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700'
          }`}
        >
          <WhatsAppIcon />
          Quero esse plano
        </a>
      ) : (
        <Link
          href="/register"
          className={`flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            highlighted
              ? 'bg-yellow-400 text-zinc-900 hover:bg-yellow-300'
              : 'border border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700'
          }`}
        >
          Criar conta grátis
        </Link>
      )}
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

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
