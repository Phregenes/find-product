import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-10 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">FindProduct</p>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
            Monitoramento de anúncios novos na OLX, Enjoei e Mercado Livre. Grátis na OLX; ML só no
            plano Pro.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-xs font-medium text-zinc-500">
          <Link href="/planos" className="hover:text-zinc-900 dark:hover:text-white">
            Planos
          </Link>
          <Link href="/register" className="hover:text-zinc-900 dark:hover:text-white">
            Criar conta
          </Link>
          <Link href="/login" className="hover:text-zinc-900 dark:hover:text-white">
            Entrar
          </Link>
          <Link href="/status" className="hover:text-zinc-900 dark:hover:text-white">
            Status
          </Link>
        </nav>
      </div>
    </footer>
  )
}
