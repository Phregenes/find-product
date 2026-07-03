'use client'

import { useEffect, type ReactNode } from 'react'
import type { Condition } from '@/lib/product'
import type { MonitorWithSearch } from '@/lib/monitors'
import {
  FILTER_MODE_OPTIONS,
  filterModeLabel,
  parseFilterMode,
} from '@/lib/monitor-filter'
import {
  MARKETPLACE_MODE_OPTIONS,
  marketplaceModeLabel,
  parseMarketplaceMode,
} from '@/lib/marketplace'

const CONDITION_LABELS: Record<Condition, string> = {
  all: 'Todos',
  new: 'Novo',
  used: 'Usado',
}

interface MonitorDetailsModalProps {
  monitor: MonitorWithSearch | null
  planEmailAlerts?: boolean
  onClose: () => void
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

function DetailValue({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
      {children}
    </div>
  )
}

export default function MonitorDetailsModal({
  monitor,
  planEmailAlerts = false,
  onClose,
}: MonitorDetailsModalProps) {
  useEffect(() => {
    if (!monitor) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [monitor, onClose])

  if (!monitor) return null

  const condition = monitor.searches?.condition ?? 'all'
  const marketplaceMode = parseMarketplaceMode(monitor.marketplace_mode)
  const marketplaceOption = MARKETPLACE_MODE_OPTIONS.find((o) => o.id === marketplaceMode)
  const filterMode = parseFilterMode(monitor.filter_mode)
  const filterOption = FILTER_MODE_OPTIONS.find((o) => o.id === filterMode)
  const excludeTerms = monitor.exclude_terms ?? []
  const emailEnabled = monitor.email_alerts === true

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-details-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="relative shrink-0 border-b border-zinc-100 px-4 py-4 pr-12 sm:px-5 sm:pr-14 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 sm:right-4 sm:top-4 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 id="monitor-details-title" className="text-base font-semibold text-zinc-900 dark:text-white">
            Configurações do monitor
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Definidas na criação — use o filtro ML/OLX na lista para visualizar por site.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          <DetailField label="O que monitorar">
            <DetailValue>
              <span className="capitalize">{monitor.query}</span>
            </DetailValue>
          </DetailField>

          <DetailField label="Onde buscar">
            <div className="rounded-xl border border-orange-400/50 bg-orange-50/50 p-3 ring-1 ring-orange-400/20 dark:border-orange-500/40 dark:bg-orange-950/20">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {marketplaceOption?.label ?? marketplaceModeLabel(marketplaceMode)}
              </p>
              {marketplaceOption && (
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {marketplaceOption.description}
                </p>
              )}
            </div>
          </DetailField>

          <DetailField label="Condição">
            <DetailValue>{CONDITION_LABELS[condition]}</DetailValue>
          </DetailField>

          <DetailField label="Relevância do título">
            <div className="rounded-xl border border-yellow-400/50 bg-yellow-50/50 p-3 ring-1 ring-yellow-400/20 dark:border-yellow-500/40 dark:bg-yellow-950/20">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {filterOption?.label ?? filterModeLabel(filterMode)}
              </p>
              {filterOption && (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {filterOption.description}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                    {filterOption.hint}
                  </p>
                </>
              )}
            </div>
          </DetailField>

          <DetailField label="Palavras para ignorar">
            <DetailValue>
              {excludeTerms.length > 0 ? excludeTerms.join(', ') : 'Nenhuma'}
            </DetailValue>
          </DetailField>

          <DetailField label="Avisar por e-mail">
            <DetailValue>
              {!planEmailAlerts
                ? 'Indisponível no plano atual'
                : emailEnabled
                  ? 'Ativado — avisa só anúncios novos desde a última varredura'
                  : 'Desativado'}
            </DetailValue>
          </DetailField>
        </div>

        <div className="shrink-0 border-t border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
