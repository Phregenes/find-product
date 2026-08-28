import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import SiteFooter from '@/app/components/SiteFooter'
import PlanCard from '@/app/components/PlanCard'
import { TestimonialStrip, FaqList } from '@/app/components/Testimonials'
import { PLAN_LIST, formatPlanPrice } from '@/lib/plans'
import { getSessionPlan } from '@/lib/plans-server'
import { HOME_FAQ } from '@/lib/marketing'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Planos e preços',
  description: `Compare os planos do ${SITE_NAME}. Grátis na OLX a cada 3 dias; Garimpo R$ 19 com Enjoei; Lojista 3× ao dia; Mercado Livre só no Pro.`,
  openGraph: {
    title: `Planos e preços | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
}

const PRICING_FAQ = [
  ...HOME_FAQ,
  {
    q: 'O Lojista busca 3 vezes por dia mesmo?',
    a: 'Sim. Das 8h às 20h (Brasília), a cada quatro horas. Fora desse horário a busca espera o dia seguinte. O Pro busca de hora em hora, o dia inteiro.',
  },
  {
    q: 'Por que o Mercado Livre não está no Lojista?',
    a: 'Por enquanto o ML ficou só no Pro. Lojista cobre OLX e Enjoei, com 8 monitores. Se você precisa dos três sites juntos, assina o Pro.',
  },
] as const

export default async function PlanosPage() {
  const session = await getSessionPlan()

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Mensal · sem fidelidade · ativação pelo WhatsApp
          </p>
          <h1 className="mt-3 text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Paga só o que a busca realmente faz
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Grátis é OLX, um monitor, a cada 3 dias. Enjoei e e-mail no Garimpo. Três buscas por dia
            no Lojista. Mercado Livre — e os três sites juntos — só no Pro.
          </p>
          {session && (
            <p className="mx-auto mt-6 max-w-xl rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-900 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200">
              Seu plano atual: <strong>{session.plan.name}</strong>
              {session.plan.priceMonthly > 0 && (
                <> · {formatPlanPrice(session.plan)}</>
              )}
            </p>
          )}
        </section>

        <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_LIST.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                highlighted={plan.id === 'lojista' && plan.id !== session?.plan.id}
                currentPlanId={session?.plan.id}
              />
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Comparação dos planos</caption>
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="px-4 py-3 font-medium"> </th>
                  <th className="px-4 py-3 font-medium">Grátis</th>
                  <th className="px-4 py-3 font-medium">Garimpo</th>
                  <th className="px-4 py-3 font-medium">Lojista</th>
                  <th className="px-4 py-3 font-medium">Pro</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-300">
                <CompareRow label="Preço" values={['R$ 0', 'R$ 19/mês', 'R$ 79/mês', 'R$ 149/mês']} />
                <CompareRow label="Monitores" values={['1', '4', '8', '15']} />
                <CompareRow label="Frequência" values={['1× / 3 dias', '1× ao dia', '3× ao dia', 'A cada 1 hora']} />
                <CompareRow label="OLX" values={['Sim', 'Sim', 'Sim', 'Sim']} />
                <CompareRow label="Enjoei" values={['Não', 'Sim', 'Sim', 'Sim']} />
                <CompareRow label="Mercado Livre" values={['Não', 'Não', 'Não', 'Sim']} />
                <CompareRow label="Filtros" values={['Não', 'Sim', 'Sim', 'Sim']} />
                <CompareRow label="E-mail" values={['Não', 'Sim', 'Sim', 'Sim']} />
                <CompareRow label="Horário" values={['Qualquer hora', 'Qualquer hora', '8h–20h BRT', '24 horas']} />
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Quem já usa</h2>
          <TestimonialStrip />
        </section>

        <section className="border-t border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Dúvidas antes de assinar</h2>
            <FaqList items={PRICING_FAQ} />
          </div>
        </section>

        <p className="mx-auto max-w-xl px-4 pb-12 text-center text-xs text-zinc-400 sm:px-6">
          O grátis ativa na hora em que você cria a conta. Garimpo, Lojista e Pro: clique em{' '}
          <strong className="text-zinc-500 dark:text-zinc-300">Quero esse plano</strong> e falamos no
          WhatsApp para ativar.
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}

function CompareRow({ label, values }: { label: string; values: [string, string, string, string] }) {
  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <th className="px-4 py-3 text-xs font-medium text-zinc-500">{label}</th>
      {values.map((value, i) => (
        <td key={`${label}-${i}`} className="px-4 py-3">
          {value}
        </td>
      ))}
    </tr>
  )
}
