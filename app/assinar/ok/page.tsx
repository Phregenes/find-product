import Link from 'next/link'
import SiteHeader from '@/app/components/SiteHeader'
import SiteFooter from '@/app/components/SiteFooter'

export const dynamic = 'force-dynamic'

export default function AssinarOkPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Pagamento enviado</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Se o pagamento foi aprovado, o plano entra em alguns segundos via webhook do Asaas. Abra o
          app e atualize se precisar.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/app"
            className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-yellow-300"
          >
            Abrir app
          </Link>
          <Link
            href="/planos"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Ver planos
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
