'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PlanId } from '@/lib/plans'

interface DowngradeMonitorInfo {
  id: string
  query: string
  marketplaceLabel: string
}

interface DowngradeConvertInfo extends DowngradeMonitorInfo {
  toLabel: string
  reason: string
}

interface DowngradeRemoveInfo extends DowngradeMonitorInfo {
  reason: string
}

interface DowngradePreview {
  targetPlanName: string
  monitorLimit: number
  autoRemove: DowngradeRemoveInfo[]
  autoConvert: DowngradeConvertInfo[]
  selectable: DowngradeMonitorInfo[]
  needsChoice: boolean
  needsAdjustment: boolean
}

export default function DowngradeAdjustForm({
  targetPlanId,
}: {
  targetPlanId: PlanId
}) {
  const router = useRouter()
  const [preview, setPreview] = useState<DowngradePreview | null>(null)
  const [keepIds, setKeepIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const res = await fetch(`/api/billing/downgrade?plan=${targetPlanId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar monitores')
        if (cancelled) return

        const nextPreview = data.preview as DowngradePreview
        setPreview(nextPreview)
        setKeepIds(data.defaultKeepMonitorIds as string[])

        if (!nextPreview.needsAdjustment) {
          setSubmitting(true)
          const applyRes = await fetch('/api/billing/downgrade', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              planId: targetPlanId,
              keepMonitorIds: data.defaultKeepMonitorIds,
            }),
          })
          const applyData = await applyRes.json()
          if (!applyRes.ok) {
            throw new Error(applyData.error ?? 'Falha ao ajustar monitores')
          }
          if (cancelled) return
          router.replace((applyData.redirectUrl as string) ?? '/app')
          router.refresh()
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
          setSubmitting(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [targetPlanId, router])

  function toggleKeep(id: string) {
    if (!preview) return
    setKeepIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= preview.monitorLimit) return prev
      return [...prev, id]
    })
  }

  async function handleConfirm() {
    if (!preview) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/downgrade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: targetPlanId,
          keepMonitorIds: keepIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Falha ao ajustar monitores')
      router.push((data.redirectUrl as string) ?? '/app')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  if (loading || (preview && !preview.needsAdjustment && submitting)) {
    return <p className="text-sm text-zinc-500">Carregando seus monitores…</p>
  }

  if (error && !preview) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
        <Link href="/planos" className="text-sm text-zinc-500 hover:text-zinc-800">
          Voltar aos planos
        </Link>
      </div>
    )
  }

  if (!preview || !preview.needsAdjustment) {
    return <p className="text-sm text-zinc-500">Redirecionando…</p>
  }

  const selectedCount = keepIds.length
  const canConfirm =
    selectedCount <= preview.monitorLimit
    && (selectedCount > 0 || preview.selectable.length === 0)
  const hasSideNotes =
    preview.autoRemove.length > 0 || preview.autoConvert.length > 0

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Ao mudar para <strong className="text-zinc-900 dark:text-white">{preview.targetPlanName}</strong>, o limite é{' '}
            <strong className="text-zinc-900 dark:text-white">{preview.monitorLimit}</strong>{' '}
            {preview.monitorLimit === 1 ? 'monitor' : 'monitores'}. Escolha o que
            manter; o restante será excluído.
          </p>

          {preview.selectable.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                  Escolha o que manter
                </h2>
                <p className="text-sm tabular-nums text-zinc-500">
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {selectedCount}
                  </span>
                  /{preview.monitorLimit}
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {preview.selectable.map((m) => {
                  const checked = keepIds.includes(m.id)
                  const convert = preview.autoConvert.find((c) => c.id === m.id)
                  const disabled = !checked && selectedCount >= preview.monitorLimit
                  return (
                    <li key={m.id}>
                      <label
                        className={`flex h-full cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                          checked
                            ? 'border-green-400 bg-green-50/50 dark:border-green-700 dark:bg-green-950/20'
                            : disabled
                              ? 'cursor-not-allowed border-zinc-200 opacity-50 dark:border-zinc-700'
                              : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleKeep(m.id)}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-zinc-900 dark:text-white">
                            {m.query}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                            {convert
                              ? `${convert.marketplaceLabel} → ${convert.toLabel}`
                              : m.marketplaceLabel}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Mobile: changes before CTA */}
          {hasSideNotes && (
            <div className="space-y-4 lg:hidden">
              <ChangesPanel preview={preview} />
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40 lg:hidden"
          >
            {submitting
              ? 'Aplicando…'
              : targetPlanId === 'free'
                ? 'Confirmar e voltar ao Grátis'
                : 'Confirmar e ir ao pagamento'}
          </button>
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Resumo
              </p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                Mantendo{' '}
                <strong className="tabular-nums text-zinc-900 dark:text-white">
                  {selectedCount}
                </strong>{' '}
                de {preview.monitorLimit} no {preview.targetPlanName}
              </p>
            </div>

            {hasSideNotes && <ChangesPanel preview={preview} compact />}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className="w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40"
            >
              {submitting
                ? 'Aplicando…'
                : targetPlanId === 'free'
                  ? 'Confirmar e voltar ao Grátis'
                  : 'Confirmar e ir ao pagamento'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ChangesPanel({
  preview,
  compact = false,
}: {
  preview: DowngradePreview
  compact?: boolean
}) {
  return (
    <div className="space-y-4">
      {preview.autoRemove.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Removidos automaticamente
          </h3>
          {!compact && (
            <p className="text-xs text-zinc-500">
              Inclui monitores só do Mercado Livre quando o plano novo não tem ML.
            </p>
          )}
          <ul className="space-y-2">
            {preview.autoRemove.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{m.query}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                  {compact ? m.marketplaceLabel : `${m.marketplaceLabel} · ${m.reason}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.autoConvert.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Sem Mercado Livre se mantidos
          </h3>
          <ul className="space-y-2">
            {preview.autoConvert.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{m.query}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                  {m.marketplaceLabel} → {m.toLabel}
                  {!compact && <> · {m.reason}</>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
