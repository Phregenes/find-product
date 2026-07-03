import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import PlanCard from '@/app/components/PlanCard'
import { PLAN_LIST } from '@/lib/plans'

import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const metadata = {
  title: 'Planos e preços',
  description: `Compare os planos do ${SITE_NAME}. Mercado Livre no grátis; OLX, filtros avançados e e-mail a partir do Lojista.`,
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
            Comece grátis no Mercado Livre (1× ao dia). Upgrade para mais monitores, OLX,
            alertas por e-mail e buscas automáticas até a cada hora no Pro.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_LIST.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlighted={plan.id === 'lojista'}
            />
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <p className="font-medium text-zinc-900 dark:text-white">O que todos os planos incluem</p>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-zinc-500 dark:text-zinc-400">
            <li>Filtros de relevância do título (padrão, todas as palavras, frase exata, inteligente)</li>
            <li>Condição novo, usado ou todos — definida na criação do monitor</li>
            <li>Palavras para ignorar na busca</li>
            <li>Até monitores ativos + 1 criação extra por dia (reinicia à meia-noite, horário de Brasília)</li>
            <li>Busca automática: grátis 1×/dia · Garimpo 3×/dia · Lojista 6×/dia · Pro a cada 1h</li>
          </ul>
          <p className="mt-4 font-medium text-zinc-900 dark:text-white">Exclusivo Lojista e Pro</p>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-zinc-500 dark:text-zinc-400">
            <li>Monitoramento na OLX (só OLX ou ML + OLX na mesma busca)</li>
            <li>Alertas por e-mail quando surgirem novidades</li>
          </ul>
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
