import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-300">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
              Monitoramento automático no Mercado Livre
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
              Não perca mais um{' '}
              <span className="text-yellow-500">anúncio novo</span> no ML
            </h1>

            <p className="mt-5 text-lg text-zinc-600 dark:text-zinc-400">
              FindProduct monitora suas buscas no Mercado Livre e avisa quando aparecem
              publicações novas — ideal para revendedores, lojistas e garimpeiros.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="w-full rounded-xl bg-yellow-400 px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 sm:w-auto"
              >
                Criar conta grátis
              </Link>
              <Link
                href="/planos"
                className="w-full rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Ver planos
              </Link>
            </div>

            <p className="mt-4 text-xs text-zinc-400">
              Conta grátis com 1 monitor · sem cartão de crédito
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
            <Feature
              title="Monitore buscas"
              description="Adicione termos como iPhone, bike ou câmera e acompanhe novos anúncios sem ficar atualizando a página."
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              }
            />
            <Feature
              title="Alerta de novidades"
              description="O app marca o que você já viu e destaca publicações novas para você agir rápido."
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              }
            />
            <Feature
              title="Feito para revenda"
              description="Filtre por novo ou usado, veja preço e link direto pro anúncio. Foco em velocidade."
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              }
            />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-white">
            Como funciona
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { step: '1', title: 'Crie sua conta', text: 'Comece no plano grátis com 1 monitor.' },
              { step: '2', title: 'Adicione uma busca', text: 'Digite o produto que quer acompanhar no ML.' },
              { step: '3', title: 'Receba alertas', text: 'Volte ao app e veja o que é novo desde a última visita.' },
            ].map((item) => (
              <li
                key={item.step}
                className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-sm font-bold text-zinc-900">
                  {item.step}
                </span>
                <h3 className="mt-4 font-semibold text-zinc-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{item.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl bg-zinc-900 px-6 py-12 text-center sm:px-12 dark:bg-zinc-800">
            <h2 className="text-2xl font-bold text-white">Pronto para garimpar?</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
              Crie sua conta em segundos. Quando precisar de mais monitores, escolha um plano pago.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="w-full rounded-xl bg-yellow-400 px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 sm:w-auto"
              >
                Criar conta grátis
              </Link>
              <Link
                href="/planos"
                className="w-full rounded-xl border border-zinc-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 sm:w-auto"
              >
                Comparar planos
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-zinc-200 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800">
        FindProduct · Monitoramento Mercado Livre
      </footer>
    </div>
  )
}

function Feature({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-600 dark:text-yellow-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {icon}
        </svg>
      </div>
      <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  )
}
