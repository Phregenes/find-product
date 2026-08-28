'use client'

import { useEffect, useState } from 'react'
import type { Condition, MarketplaceMode } from '@/lib/product'
import {
  FILTER_MODE_OPTIONS,
  type MonitorFilterMode,
  parseExcludeTermsInput,
} from '@/lib/monitor-filter'
import { MARKETPLACE_MODE_OPTIONS, normalizeMarketplaceModeForPlan } from '@/lib/marketplace'
import {
  PLANS,
  type PlanConfig,
  defaultMarketplaceMode,
  planAllowsMarketplaceMode,
} from '@/lib/plans'

export interface CreateMonitorOptions {
  query: string
  condition: Condition
  filterMode: MonitorFilterMode
  excludeTerms: string[]
  emailAlerts: boolean
  marketplaceMode: MarketplaceMode
}

interface CreateMonitorModalProps {
  open: boolean
  initialQuery: string
  atLimit: boolean
  plan?: PlanConfig
  planName?: string
  monitorLimit?: number
  dailyCreationLimit?: number
  remainingCreationsToday?: number
  onClose: () => void
  onSubmit: (options: CreateMonitorOptions) => void | Promise<void>
}

type Step = 1 | 2 | 3

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 1, label: 'Busca' },
  { id: 2, label: 'Onde' },
  { id: 3, label: 'Opções' },
]

function marketplaceLockLabel(optionId: MarketplaceMode): string {
  if (optionId === 'ml' || optionId === 'both') return 'Pro'
  if (optionId === 'enjoei' || optionId === 'olx_enjoei') return 'Garimpo+'
  return ''
}

export default function CreateMonitorModal({
  open,
  initialQuery,
  atLimit,
  plan: planProp,
  planName,
  monitorLimit,
  dailyCreationLimit,
  remainingCreationsToday,
  onClose,
  onSubmit,
}: CreateMonitorModalProps) {
  const plan = planProp ?? PLANS.free
  const [step, setStep] = useState<Step>(1)
  const [query, setQuery] = useState(initialQuery)
  const [condition, setCondition] = useState<Condition>('all')
  const [filterMode, setFilterMode] = useState<MonitorFilterMode>('default')
  const [marketplaceMode, setMarketplaceMode] = useState<MarketplaceMode>('olx')
  const [excludeInput, setExcludeInput] = useState('')
  const [emailAlerts, setEmailAlerts] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1)
      setQuery(initialQuery)
      setCondition('all')
      setFilterMode('default')
      setMarketplaceMode(defaultMarketplaceMode(plan))
      setExcludeInput('')
      setEmailAlerts(false)
      setSubmitting(false)
    }
  }, [open, initialQuery, plan])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleCreate() {
    const trimmed = query.trim()
    if (!trimmed || atLimit || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        query: trimmed,
        condition: plan.customFilters ? condition : 'all',
        filterMode: plan.customFilters ? filterMode : 'default',
        excludeTerms: plan.customFilters ? parseExcludeTermsInput(excludeInput) : [],
        emailAlerts: plan.emailAlerts && emailAlerts,
        marketplaceMode: normalizeMarketplaceModeForPlan(marketplaceMode, plan),
      })
    } finally {
      setSubmitting(false)
    }
  }

  function goNext() {
    if (step === 1) {
      if (!query.trim()) return
      setStep(2)
      return
    }
    if (step === 2) setStep(3)
  }

  function goBack() {
    if (step === 1) {
      onClose()
      return
    }
    setStep((s) => (s === 3 ? 2 : 1))
  }

  const showExclude = plan.customFilters && (filterMode !== 'default' || excludeInput.length > 0)
  const atDailyCreationLimit = remainingCreationsToday === 0
  const cannotCreate = atLimit || atDailyCreationLimit
  const allMarketplaces = plan.mlAccess && plan.olxAccess && plan.enjoeiAccess
  const selectedMarketplace =
    MARKETPLACE_MODE_OPTIONS.find((o) => o.id === marketplaceMode)?.label ?? marketplaceMode

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
          <h2 id="create-monitor-title" className="text-base font-semibold text-zinc-900 dark:text-white">
            Novo monitor
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Passo {step} de 3 — {STEPS[step - 1]?.label}
          </p>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`h-1 flex-1 rounded-full transition ${
                  s.id <= step ? 'bg-yellow-400' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          {step === 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">O que monitorar</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    goNext()
                  }
                }}
                placeholder="Ex: tenis nike air max"
                autoFocus
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <span className="text-[11px] text-zinc-400">
                Digite o produto ou termo que você quer acompanhar.
              </span>
            </label>
          )}

          {step === 2 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Onde buscar
              </legend>
              {!allMarketplaces && (
                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {plan.id === 'free'
                    ? 'No plano grátis a busca é só na OLX.'
                    : plan.olxAccess && plan.enjoeiAccess && !plan.mlAccess
                      ? 'OLX + Enjoei no seu plano. Mercado Livre entra no Pro.'
                      : 'Mercado Livre e o combo dos três sites entram no Pro.'}{' '}
                  <a href="/planos" className="font-medium text-yellow-600 hover:underline dark:text-yellow-400">
                    Ver planos
                  </a>
                </p>
              )}
              <div className="flex flex-col gap-2">
                {MARKETPLACE_MODE_OPTIONS.map((option) => {
                  const locked = !planAllowsMarketplaceMode(plan, option.id)
                  const lockLabel = marketplaceLockLabel(option.id)
                  return (
                    <label
                      key={option.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                        locked
                          ? 'cursor-not-allowed border-zinc-200 opacity-60 dark:border-zinc-700'
                          : marketplaceMode === option.id
                            ? 'cursor-pointer border-orange-400 bg-orange-50/50 ring-1 ring-orange-400/30 dark:border-orange-500/50 dark:bg-orange-950/20'
                            : 'cursor-pointer border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="marketplaceMode"
                        value={option.id}
                        checked={marketplaceMode === option.id}
                        disabled={locked}
                        onChange={() => !locked && setMarketplaceMode(option.id)}
                        className="mt-0.5 h-4 w-4 border-zinc-300 text-orange-500 focus:ring-orange-400 disabled:opacity-50"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">
                          {option.label}
                          {locked && lockLabel && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                              {lockLabel}
                            </span>
                          )}
                        </span>
                        <span className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                <p>
                  <span className="font-medium text-zinc-900 dark:text-white">{query.trim()}</span>
                  {' · '}
                  {selectedMarketplace}
                </p>
              </div>

              {plan.customFilters ? (
                <>
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
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {showExclude && (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Palavras para ignorar{' '}
                        <span className="font-normal text-zinc-400">(opcional)</span>
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
                </>
              ) : (
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                  Filtros avançados entram a partir do Garimpo.{' '}
                  <a href="/planos" className="font-medium text-yellow-600 hover:underline dark:text-yellow-400">
                    Ver planos
                  </a>
                </p>
              )}

              {plan.emailAlerts ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-yellow-500 focus:ring-yellow-400"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                      Avisar por e-mail
                    </span>
                    <span className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Receba um e-mail quando surgirem anúncios novos neste monitor.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                  Alertas por e-mail a partir do Garimpo.{' '}
                  <a href="/planos" className="font-medium text-yellow-600 hover:underline dark:text-yellow-400">
                    Ver planos
                  </a>
                </p>
              )}

              {atLimit && planName && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Limite do plano {planName}: {monitorLimit} monitores ativos.
                </p>
              )}

              {!atLimit && atDailyCreationLimit && dailyCreationLimit != null && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Você atingiu o limite de {dailyCreationLimit} criações de monitor hoje.
                </p>
              )}

              {!atLimit && !atDailyCreationLimit && dailyCreationLimit != null && remainingCreationsToday != null && (
                <p className="text-[11px] text-zinc-400">
                  Criações restantes hoje: {remainingCreationsToday} de {dailyCreationLimit}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
          <button
            type="button"
            onClick={goBack}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={step === 1 && !query.trim()}
              className="flex-1 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={!query.trim() || cannotCreate || submitting}
              className="flex-1 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40"
            >
              {submitting ? 'Criando…' : 'Criar monitor'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
