'use client'

import { useEffect, useState } from 'react'
import type { MonitorWithSearch } from '@/lib/monitors'

interface DeleteMonitorModalProps {
  monitor: MonitorWithSearch | null
  onClose: () => void
  onConfirm: (id: string) => void | Promise<void>
}

export default function DeleteMonitorModal({
  monitor,
  onClose,
  onConfirm,
}: DeleteMonitorModalProps) {
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!monitor) return
    setDeleting(false)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !deleting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [monitor, deleting, onClose])

  if (!monitor) return null

  const monitorId = monitor.id

  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm(monitorId)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        disabled={deleting}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm disabled:cursor-not-allowed"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-monitor-title"
        aria-describedby="delete-monitor-desc"
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="px-4 py-4 sm:px-5">
          <h2 id="delete-monitor-title" className="text-base font-semibold text-zinc-900 dark:text-white">
            Remover monitor?
          </h2>
          <p id="delete-monitor-desc" className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            O monitor{' '}
            <span className="font-medium capitalize text-zinc-700 dark:text-zinc-300">
              {monitor.query}
            </span>{' '}
            será excluído permanentemente, junto com o histórico de vistos e novidades pendentes.
          </p>
        </div>

        <div className="flex gap-2 border-t border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
          >
            {deleting ? 'Removendo…' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  )
}
