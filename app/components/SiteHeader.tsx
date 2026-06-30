import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function SiteHeader() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = !!data?.claims

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-400">
            <svg className="h-4 w-4 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-zinc-900 dark:text-white">FindProduct</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/planos"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-white"
          >
            Planos
          </Link>

          {isLoggedIn ? (
            <Link
              href="/app"
              className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300"
            >
              Abrir app
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300"
              >
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
