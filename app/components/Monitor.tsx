'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type MonitorEntry,
  type MonitorMap,
  loadMonitors,
  addMonitor,
  removeMonitor,
  markAllAsSeen,
  updateMonitorResults,
  setMonitorCondition,
  normalizeKey,
} from '@/lib/storage'
import type { Product } from '@/lib/scraper'
import type { Condition } from '@/lib/scraper'

const REFRESH_OPTIONS = [5, 10, 15, 30] // minutes
const DEFAULT_INTERVAL = 10

// ─── Product Card ─────────────────────────────────────────────────────────────

function formatDetectedAt(ts: number): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function ProductCard({ product, isNew }: { product: Product; isNew: boolean }) {
  return (
    <a
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md dark:bg-zinc-900 ${
        isNew
          ? 'border-green-400/60 ring-1 ring-green-400/30 dark:border-green-500/50'
          : 'border-zinc-100 dark:border-zinc-800'
      }`}
    >
      {isNew && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-green-500 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow">
          Novo
        </span>
      )}

      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-800">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            className="h-full w-full object-contain p-3 transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="text-zinc-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {product.discount && (
            <span className="rounded-full bg-green-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {product.discount}
            </span>
          )}
          {product.freeShipping && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 border border-blue-200">
              Frete grátis
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-800 group-hover:text-green-600 dark:text-zinc-100 dark:group-hover:text-green-400">
          {product.title}
        </p>

        <div className="mt-auto pt-1">
          {product.originalPrice && product.originalPrice !== product.price && (
            <p className="text-xs text-zinc-400 line-through">{product.originalPrice}</p>
          )}
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{product.price}</p>
          {product.installments && (
            <p className="text-xs text-zinc-500">{product.installments}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
          <div className="flex items-center gap-1 min-w-0">
            {product.seller && (
              <span className="truncate text-xs text-zinc-500">{product.seller}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {product.rating && (
              <div className="flex items-center gap-0.5">
                <svg className="h-3 w-3 fill-yellow-400" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{product.rating}</span>
              </div>
            )}
            {product.detectedAt > 0 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500" title="Detectado pelo monitor">
                {formatDetectedAt(product.detectedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

// ─── Relative time ────────────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function relativeTime(ts: number, now: number): string {
  if (ts === 0) return 'nunca'
  const diff = Math.floor((now - ts) / 1000)
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

// ─── Monitor View ─────────────────────────────────────────────────────────────

interface MonitorViewState {
  loading: boolean
  loadingMore: boolean
  error: string | null
  products: Product[]
  newIds: Set<string>
  page: number
  hasMore: boolean
}

export default function MonitorApp() {
  const [monitors, setMonitors] = useState<MonitorMap>({})
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [intervalMin, setIntervalMin] = useState(DEFAULT_INTERVAL)
  const [viewState, setViewState] = useState<MonitorViewState>({
    loading: false,
    loadingMore: false,
    error: null,
    products: [],
    newIds: new Set(),
    page: 1,
    hasMore: true,
  })
  const now = useNow()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load state on mount
  useEffect(() => {
    const saved = loadMonitors()
    setMonitors(saved)
    const keys = Object.keys(saved)
    if (keys.length > 0) setActiveKey(keys[0])
  }, [])

  // ── Fetch page 1 (refresh) ──────────────────────────────────────────────────
  const fetchProducts = useCallback(async (query: string) => {
    const key = normalizeKey(query)
    setActiveKey(key)
    setViewState((s) => ({ ...s, loading: true, error: null, products: [], newIds: new Set(), page: 1, hasMore: true }))

    try {
      const saved = loadMonitors()
      const condition = saved[key]?.condition ?? 'all'
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&sort=recent&page=1&condition=${condition}`)
      const data = await res.json()

      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao buscar')

      const { monitors: updated, newProducts } = updateMonitorResults(
        query,
        data.products,
        data.fetchedAt ?? Date.now(),
      )

      setMonitors(updated)
      const newIds = new Set(newProducts.map((p: Product) => p.id))

      // Use lastResults from storage — it has preserved detectedAt timestamps
      const enrichedProducts = updated[key]?.lastResults ?? (data.products as Product[])

      setViewState({
        loading: false,
        loadingMore: false,
        error: null,
        products: enrichedProducts,
        newIds,
        page: 1,
        hasMore: enrichedProducts.length >= 20,
      })
    } catch (err) {
      const saved = loadMonitors()
      const cached = saved[key]?.lastResults ?? []
      setViewState({
        loading: false,
        loadingMore: false,
        error: cached.length > 0 ? null : (err as Error).message,
        products: cached,
        newIds: new Set(),
        page: 1,
        hasMore: false,
      })
    }
  }, [])

  // ── Load next page ──────────────────────────────────────────────────────────
  const loadMore = useCallback(async (query: string, nextPage: number) => {
    setViewState((s) => ({ ...s, loadingMore: true }))
    try {
      const saved = loadMonitors()
      const condition = saved[normalizeKey(query)]?.condition ?? 'all'
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&sort=recent&page=${nextPage}&condition=${condition}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setViewState((s) => ({
        ...s,
        loadingMore: false,
        products: [...s.products, ...(data.products as Product[])],
        page: nextPage,
        hasMore: (data.products as Product[]).length >= 20,
      }))
    } catch {
      setViewState((s) => ({ ...s, loadingMore: false, hasMore: false }))
    }
  }, [])

  // ── Auto-refresh polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(() => {
      const current = loadMonitors()
      for (const entry of Object.values(current)) {
        fetchProducts(entry.query)
      }
    }, intervalMin * 60 * 1000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [intervalMin, fetchProducts])

  // ── On page load: restore cache immediately, then refresh in background ──────
  useEffect(() => {
    const saved = loadMonitors()
    const keys = Object.keys(saved)
    if (keys.length === 0) return

    const firstKey = keys[0]
    const firstEntry = saved[firstKey]

    // Show cached results instantly while the background refresh loads
    if (firstEntry.lastResults.length > 0) {
      setActiveKey(firstKey)
      setViewState((s) => ({
        ...s,
        products: firstEntry.lastResults,
        newIds: new Set(),
        hasMore: firstEntry.lastResults.length >= 20,
      }))
    }

    // Refresh all monitors in background
    for (const key of keys) {
      const entry = saved[key]
      fetch(`/api/search?q=${encodeURIComponent(entry.query)}&sort=recent&condition=${entry.condition ?? 'all'}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.products) return
          const { monitors: updated, newProducts } = updateMonitorResults(
            entry.query,
            data.products,
            data.fetchedAt ?? Date.now(),
          )
          setMonitors(updated)
          // Only update the visible view if this is the active monitor
          if (key === firstKey) {
            const enriched = updated[key]?.lastResults ?? data.products
            setViewState((s) => ({
              ...s,
              loading: false,
              products: enriched,
              newIds: new Set(newProducts.map((p: Product) => p.id)),
              hasMore: enriched.length >= 20,
            }))
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add monitor ────────────────────────────────────────────────────────────
  function handleAddMonitor(e: React.FormEvent) {
    e.preventDefault()
    const q = searchInput.trim()
    if (!q) return
    const updated = addMonitor(q)
    setMonitors(updated)
    setSearchInput('')
    fetchProducts(q)
  }

  // ── Mark all as seen ────────────────────────────────────────────────────────
  function handleMarkSeen() {
    if (!activeKey) return
    const entry = monitors[activeKey]
    if (!entry) return
    const updated = markAllAsSeen(entry.query, viewState.products)
    setMonitors(updated)
    setViewState((s) => ({ ...s, newIds: new Set(), newCount: 0 }))
  }

  const activeEntry: MonitorEntry | null = activeKey ? monitors[activeKey] ?? null : null
  const totalNew = Object.values(monitors).reduce((sum, m) => sum + (m.newCount ?? 0), 0)

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400">
              <svg className="h-4 w-4 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <span className="hidden text-sm font-bold text-zinc-900 dark:text-white sm:block">FindProduct</span>
          </div>

          {/* Search / Add monitor */}
          <form onSubmit={handleAddMonitor} className="flex flex-1 gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Monitorar produto no Mercado Livre..."
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={!searchInput.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Monitorar
            </button>
          </form>

          {/* Interval selector */}
          <div className="flex shrink-0 items-center gap-1.5">
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {REFRESH_OPTIONS.map((m) => (
                <option key={m} value={m}>a cada {m} min</option>
              ))}
            </select>
          </div>

          {totalNew > 0 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
              {totalNew}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-0 px-6 py-6">
        {/* ── Sidebar: monitor list ─────────────────────────────────────────── */}
        {Object.keys(monitors).length > 0 && (
          <aside className="mr-6 hidden w-56 shrink-0 flex-col gap-1 lg:flex">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Monitores
            </p>
            {Object.entries(monitors).map(([key, entry]) => (
              <div key={key} className="group flex items-center gap-1">
                <button
                  onClick={() => {
                    setActiveKey(key)
                    fetchProducts(entry.query)
                  }}
                  className={`flex flex-1 items-center justify-between truncate rounded-xl px-3 py-2 text-left text-sm transition ${
                    activeKey === key
                      ? 'bg-yellow-400/20 font-semibold text-zinc-900 dark:text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate capitalize">{entry.query}</span>
                  {entry.newCount > 0 && (
                    <span className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
                      {entry.newCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const updated = removeMonitor(entry.query)
                    setMonitors(updated)
                    if (activeKey === key) {
                      const remaining = Object.keys(updated)
                      setActiveKey(remaining[0] ?? null)
                      if (remaining[0]) fetchProducts(updated[remaining[0]].query)
                      else setViewState({ loading: false, loadingMore: false, error: null, products: [], newIds: new Set(), page: 1, hasMore: false })
                    }
                  }}
                  className="hidden rounded-lg p-1 text-zinc-300 transition hover:text-red-500 group-hover:flex"
                  title="Remover monitor"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </aside>
        )}

        {/* ── Main content ───────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 min-w-0">
          {/* Empty state */}
          {Object.keys(monitors).length === 0 && (
            <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-yellow-400 shadow-lg">
                <svg className="h-10 w-10 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Monitore publicações novas no ML
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
                  Adicione uma busca acima e o app vai verificar automaticamente por novos produtos a cada {intervalMin} minutos.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['iPhone 14', 'Fone Bluetooth', 'Tênis Nike', 'Smartwatch', 'AirPods'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSearchInput(s) }}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:border-yellow-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status bar */}
          {activeEntry && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold capitalize text-zinc-900 dark:text-white">
                    {activeEntry.query}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {viewState.loading
                      ? 'Buscando...'
                      : `Última verificação: ${relativeTime(activeEntry.lastChecked, now)}`}
                  </span>
                </div>
                {viewState.loading && (
                  <svg className="h-4 w-4 animate-spin text-yellow-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}

                {/* Condition filter */}
                <div className="flex items-center gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                  {([
                    ['all', 'Todos'],
                    ['new', 'Novo'],
                    ['used', 'Usado'],
                  ] as [Condition, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => {
                        const updated = setMonitorCondition(activeEntry.query, val)
                        setMonitors(updated)
                        fetchProducts(activeEntry.query)
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        (activeEntry.condition ?? 'all') === val
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {viewState.newIds.size > 0 && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {viewState.newIds.size} novo{viewState.newIds.size > 1 ? 's' : ''}
                  </span>
                )}
                {viewState.newIds.size > 0 && (
                  <button
                    onClick={handleMarkSeen}
                    className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Marcar todos como vistos
                  </button>
                )}
                <button
                  onClick={() => fetchProducts(activeEntry.query)}
                  disabled={viewState.loading}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizar agora
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {viewState.error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {viewState.error}
            </div>
          )}

          {/* No new products notice */}
          {!viewState.loading && !viewState.error && viewState.products.length > 0 && viewState.newIds.size === 0 && activeEntry && activeEntry.lastChecked > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Sem novidades desde <strong className="text-zinc-700 dark:text-zinc-200 ml-1">{relativeTime(activeEntry.lastChecked, now)}</strong>. Mostrando os resultados mais recentes do ML.
            </div>
          )}

          {/* Loading skeleton */}
          {viewState.loading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="h-44 animate-pulse bg-zinc-100 dark:bg-zinc-800" />
                  <div className="flex flex-col gap-2 p-3">
                    <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="mt-1 h-5 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Products */}
          {!viewState.loading && viewState.products.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {viewState.products
                  .slice()
                  .sort((a, b) => {
                    const an = viewState.newIds.has(a.id) ? 1 : 0
                    const bn = viewState.newIds.has(b.id) ? 1 : 0
                    return bn - an
                  })
                  .map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isNew={viewState.newIds.has(product.id)}
                    />
                  ))}
              </div>

              {/* Pagination */}
              {viewState.hasMore && activeEntry && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => loadMore(activeEntry.query, viewState.page + 1)}
                    disabled={viewState.loadingMore}
                    className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {viewState.loadingMore ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Carregando...
                      </>
                    ) : (
                      <>
                        Ver mais produtos
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
