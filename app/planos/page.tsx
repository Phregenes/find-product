import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import PlanCard from '@/app/components/PlanCard'
import { PLAN_LIST } from '@/lib/plans'

import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const metadata = {
  title: 'Planos e preços',
  description: `Compare os planos do ${SITE_NAME}. Comece grátis com 1 monitor ou escolha Garimpo, Lojista ou Pro para mais cobertura no Mercado Livre.`,
  openGraph: {
    title: `Planos e preços | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
}

export default function PlanosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-white">
            Escolha seu plano
          </h1>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Comece grátis com 1 monitor. Faça upgrade quando precisar de mais cobertura
            e atualizações mais frequentes.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_LIST.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlighted={plan.id === 'garimpo'}
            />
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-xs text-zinc-400">
          O plano Grátis é ativado ao criar conta. Para Garimpo, Lojista ou Pro, clique em{' '}
          <strong className="text-zinc-500 dark:text-zinc-300">Quero esse plano</strong> e
          enviamos sua solicitação — ativamos o plano manualmente após o contato.
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            ← Voltar para a home
          </Link>
        </div>
      </main>
    </div>
  )
}
