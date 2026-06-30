'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ServiceStatus, StatusReport } from '@/lib/ops-types'

const OVERALL: Record<ServiceStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Operacional', color: 'text-green-700', bg: 'bg-green-500' },
  degraded: { label: 'Degradado', color: 'text-yellow-700', bg: 'bg-yellow-500' },
  error: { label: 'Indisponível', color: 'text-red-700', bg: 'bg-red-500' },
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    ok: 'bg-green-500',
    degraded: 'bg-yellow-500',
    error: 'bg-red-500',
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />
}

export default function StatusPage() {
  const [report, setReport] = useState<StatusReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/status', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar status')
      setReport(data as StatusReport)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const overall = report ? OVERALL[report.status] : null

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              ← FindProduct
            </Link>
            <h1 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">Status do sistema</h1>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {report && overall && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className={`h-4 w-4 rounded-full ${overall.bg}`} />
            <div>
              <p className={`text-lg font-bold ${overall.color} dark:text-white`}>{overall.label}</p>
              <p className="text-xs text-zinc-400">
                Verificado {new Date(report.checkedAt).toLocaleString('pt-BR')}
                {' · '}atualiza a cada 60s
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {(report?.services ?? []).map((service) => (
            <div
              key={service.id}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mt-1.5">
                <StatusDot status={service.status} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900 dark:text-white">{service.name}</p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{service.message}</p>
                {service.updatedAt && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {new Date(service.updatedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">
          Scraper degradado = sem scrape recente no ML · Cron degradado = sem execução nas últimas 30h (Hobby: 1×/dia)
        </p>
      </main>
    </div>
  )
}
