import Link from 'next/link'
import Image from 'next/image'
import SiteHeader from '@/app/components/SiteHeader'
import SiteFooter from '@/app/components/SiteFooter'
import Testimonials, { FaqList } from '@/app/components/Testimonials'
import { HOME_FAQ, HOME_PHOTOS } from '@/lib/marketing'
import { PLAN_LIST, formatPlanPrice, formatPlanFrequency, formatPlanMarketplaces } from '@/lib/plans'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              OLX agora · Enjoei no Garimpo · Mercado Livre no Pro
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
              O anúncio bom some em minutos. A gente fica de olho.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
              Você monta a busca uma vez. O FindProduct varre o site, marca o que já passou e te
              mostra só o que acabou de entrar — sem ficar atualizando a OLX no intervalo do almoço.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="rounded-xl bg-yellow-400 px-6 py-3 text-center text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300"
              >
                Começar de graça na OLX
              </Link>
              <Link
                href="/planos"
                className="rounded-xl border border-zinc-200 bg-white px-6 py-3 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Ver preços
              </Link>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Grátis: 1 monitor, só OLX, a cada 3 dias. Sem cartão. Planos pagos a partir de R$ 19.
            </p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-zinc-200 shadow-xl dark:border-zinc-800">
              <Image
                src={HOME_PHOTOS.hero.src}
                alt={HOME_PHOTOS.hero.alt}
                width={800}
                height={640}
                priority
                className="h-[380px] w-full object-cover sm:h-[440px]"
              />
            </div>
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/20 bg-zinc-950/85 p-4 text-white backdrop-blur-sm sm:left-auto sm:right-6 sm:w-72">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-green-400">
                Novo agora · OLX
              </p>
              <p className="mt-1 text-sm font-medium">iPhone 13 128GB — seminovo</p>
              <p className="mt-1 text-xs text-zinc-300">R$ 2.150 · Savassi, Belo Horizonte</p>
            </div>
          </div>
        </section>

        <section className="border-y border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-white">
              Feito para quem compra usado de verdade
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Não é feed de “oferta”. É o mesmo anúncio que você caça na OLX — só que o sistema
              olha de novo quando você não pode.
            </p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              <AudienceCard
                image={HOME_PHOTOS.phone}
                title="Quem garimpa no celular"
                body="Um monitor no grátis já mostra se a ferramenta serve. Se servir, Garimpo (R$ 19) coloca Enjoei, e-mail e 4 buscas."
              />
              <AudienceCard
                image={HOME_PHOTOS.listings}
                title="Quem revende no fim de semana"
                body="Filtro de título e palavras a ignorar a partir do Garimpo. Menos capa de celular no meio do resultado."
              />
              <AudienceCard
                image={HOME_PHOTOS.used}
                title="Quem tem loja aberta"
                body="Lojista: 8 monitores, 3× ao dia, OLX e Enjoei, das 8h às 20h. Mercado Livre fica no Pro, de hora em hora."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800">
              <Image
                src={HOME_PHOTOS.steps.src}
                alt={HOME_PHOTOS.steps.alt}
                width={800}
                height={600}
                className="h-[320px] w-full object-cover sm:h-[400px]"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
                Como funciona
              </p>
              <h2 className="mt-2 text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-white">
                Três passos. Sem planilha.
              </h2>
              <ol className="mt-8 space-y-6">
                <li>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">1. Cria a conta</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Grátis, sem cartão. 1 monitor na OLX, a cada 3 dias.
                  </p>
                </li>
                <li>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">2. Diz o que caçar</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Ex.: “nintendo switch”. No Garimpo você aperta o título, escolhe usado e tira
                    “controle avulso” da lista.
                  </p>
                </li>
                <li>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">3. Entra e vê o que é novo</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    O cron roda no servidor. O app destaca o anúncio que não estava aí ontem. E-mail
                    a partir do Garimpo.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <Testimonials />

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-white">
                Preço simples, sem pegadinha de ML no grátis
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Mercado Livre não entra no Garimpo nem no Lojista. Se você precisa dos três sites,
                o plano é o Pro.
              </p>
            </div>
            <Link
              href="/planos"
              className="text-sm font-semibold text-yellow-700 hover:underline dark:text-yellow-400"
            >
              Comparar os quatro →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_LIST.map((plan) => (
              <Link
                key={plan.id}
                href="/planos"
                className={`rounded-2xl border p-5 transition hover:border-yellow-400 ${
                  plan.id === 'lojista'
                    ? 'border-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <p className="text-sm font-bold text-zinc-900 dark:text-white">{plan.name}</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                  {formatPlanPrice(plan)}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  {formatPlanMarketplaces(plan)} · {formatPlanFrequency(plan)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Perguntas que a gente ouve</h2>
            <FaqList items={HOME_FAQ} />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="overflow-hidden rounded-3xl bg-zinc-900 sm:grid sm:grid-cols-2 dark:bg-zinc-800">
            <div className="p-8 sm:p-12">
              <h2 className="text-2xl font-bold text-white">Testa na OLX hoje. Paga só se valer a pena.</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Conta grátis em menos de um minuto. Se precisar de Enjoei, e-mail ou Mercado Livre,
                o upgrade é pelo WhatsApp.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="rounded-xl bg-yellow-400 px-5 py-2.5 text-center text-sm font-semibold text-zinc-900 hover:bg-yellow-300"
                >
                  Criar conta grátis
                </Link>
                <Link
                  href="/planos"
                  className="rounded-xl border border-zinc-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Ver planos
                </Link>
              </div>
            </div>
            <div className="relative min-h-[220px]">
              <Image
                src={HOME_PHOTOS.phone.src}
                alt={HOME_PHOTOS.phone.alt}
                fill
                className="object-cover"
                sizes="(min-width: 640px) 50vw, 100vw"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function AudienceCard({
  image,
  title,
  body,
}: {
  image: { src: string; alt: string }
  title: string
  body: string
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <Image
        src={image.src}
        alt={image.alt}
        width={640}
        height={400}
        className="h-44 w-full object-cover"
      />
      <div className="bg-zinc-50 p-5 dark:bg-zinc-950">
        <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
      </div>
    </article>
  )
}
