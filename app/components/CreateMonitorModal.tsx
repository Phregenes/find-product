'use client'

import { useEffect, useState } from 'react'
import type { Condition } from '@/lib/product'
import {
  FILTER_MODE_OPTIONS,
  type MonitorFilterMode,
  parseExcludeTermsInput,
} from '@/lib/monitor-filter'

export interface CreateMonitorOptions {
  query: string
  condition: Condition
  filterMode: MonitorFilterMode
  excludeTerms: string[]
}

interface CreateMonitorModalProps {
  open: boolean
  initialQuery: string
  atLimit: boolean
  planName?: string
  monitorLimit?: number
  onClose: () => void
  onSubmit: (options: CreateMonitorOptions) => void | Promise<void>
}

export default function CreateMonitorModal({
  open,
  initialQuery,
  atLimit,
  planName,
  monitorLimit,
  onClose,
  onSubmit,
}: CreateMonitorModalProps) {
  const [query, setQuery] = useState(initialQuery)
  const [condition, setCondition] = useState<Condition>('all')
  const [filterMode, setFilterMode] = useState<MonitorFilterMode>('default')
  const [excludeInput, setExcludeInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setCondition('all')
      setFilterMode('default')
      setExcludeInput('')
      setSubmitting(false)
    }
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || atLimit || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        query: trimmed,
        condition,
        filterMode,
        excludeTerms: parseExcludeTermsInput(excludeInput),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const showExclude = filterMode !== 'default' || excludeInput.length > 0

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
        aria-labelledby="create-monitor-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-zinc-100 px-4 py-4 sm:px-5 dark:border-zinc-800">
            <h2 id="create-monitor-title" className="text-base font-semibold text-zinc-900 dark:text-white">
              Novo monitor
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Busca no Mercado Livre e avisa quando surgir anúncio novo.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">O que monitorar</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: tenis nike air max"
                autoFocus
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Condição</span>
              <div className="flex gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {(['all', 'new', 'used'] as Condition[]).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCondition(val)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                      condition === val
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {val === 'all' ? 'Todos' : val === 'new' ? 'Novo' : 'Usado'}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Relevância do título
              </legend>
              <div className="flex flex-col gap-2">
                {FILTER_MODE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      filterMode === option.id
                        ? 'border-yellow-400 bg-yellow-50/50 ring-1 ring-yellow-400/30 dark:border-yellow-500/50 dark:bg-yellow-950/20'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="filterMode"
                      value={option.id}
                      checked={filterMode === option.id}
                      onChange={() => setFilterMode(option.id)}
                      className="mt-0.5 h-4 w-4 border-zinc-300 text-yellow-500 focus:ring-yellow-400"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {option.description}
                      </span>
                      <span className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {(showExclude || filterMode !== 'default') && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Palavras para ignorar <span className="font-normal text-zinc-400">(opcional, estilo eBay -palavra)</span>
                </span>
                <input
                  type="text"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  placeholder="tripé, manual, peça"
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <span className="text-[11px] text-zinc-400">Separe por vírgula</span>
              </label>
            )}

            {atLimit && planName && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Limite do plano {planName}: {monitorLimit} monitores.
              </p>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!query.trim() || atLimit || submitting}
              className="flex-1 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40"
            >
              {submitting ? 'Criando…' : 'Criar monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
