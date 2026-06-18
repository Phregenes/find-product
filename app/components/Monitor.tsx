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
import type { Product, Condition } from '@/lib/scraper'

const REFRESH_OPTIONS = [5, 10, 15, 30]
const DEFAULT_INTERVAL = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDetectedAt(ts: number): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function relativeTime(ts: number, now: number): string {
  if (ts === 0) return 'nunca'
  const diff = Math.floor((now - ts) / 1000)
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, isNew }: { product: Product; isNew: boolean }) {
  return (
    <a
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition active:scale-[.98] sm:rounded-2xl sm:hover:shadow-md dark:bg-zinc-900 ${
        isNew
          ? 'border-green-400/70 ring-1 ring-green-400/30 dark:border-green-500/50'
          : 'border-zinc-100 dark:border-zinc-800'
      }`}
    >
      {isNew && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow sm:left-3 sm:top-3 sm:px-2.5 sm:text-[11px]">
          Novo
        </span>
      )}

      {/* Image */}
      <div className="relative flex h-32 items-center justify-center overflow-hidden bg-zinc-50 sm:h-44 dark:bg-zinc-800">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.title}
            className="h-full w-full object-contain p-2 transition group-hover:scale-105 sm:p-3"
            loading="lazy"
          />
        ) : (
          <svg className="h-10 w-10 text-zinc-300 sm:h-12 sm:w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}

        {/* Bottom badges */}
        <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1 sm:bottom-2 sm:left-2">
          {product.discount && (
            <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white sm:px-2 sm:text-[11px]">
              {product.discount}
            </span>
          )}
          {product.freeShipping && (
            <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 sm:inline sm:px-2 sm:text-[11px]">
              Frete grátis
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 p-2 sm:gap-1.5 sm:p-3">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-zinc-800 sm:text-sm dark:text-zinc-100">
          {product.title}
        </p>

        <div className="mt-auto pt-1">
          {product.originalPrice && product.originalPrice !== product.price && (
            <p className="text-[10px] text-zinc-400 line-through sm:text-xs">{product.originalPrice}</p>
          )}
          <p className="text-base font-bold text-zinc-900 sm:text-lg dark:text-white">{product.price}</p>
          {product.installments && (
            <p className="hidden text-[10px] text-zinc-500 sm:block sm:text-xs">{product.installments}</p>
          )}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-1 dark:border-zinc-800">
          {product.freeShipping && (
            <span className="text-[10px] font-semibold text-blue-500 sm:hidden">Frete grátis</span>
          )}
          {!product.freeShipping && product.seller && (
            <span className="truncate text-[10px] text-zinc-400 sm:text-xs">{product.seller}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {product.rating && (
              <div className="flex items-center gap-0.5">
                <svg className="h-2.5 w-2.5 fill-yellow-400 sm:h-3 sm:w-3" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-[10px] font-medium text-zinc-500 sm:text-xs sm:text-zinc-600 dark:text-zinc-300">{product.rating}</span>
              </div>
            )}
            {product.detectedAt > 0 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {formatDetectedAt(product.detectedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-zinc-100 bg-white sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-32 animate-pulse bg-zinc-100 sm:h-44 dark:bg-zinc-800" />
          <div className="flex flex-col gap-2 p-2 sm:p-3">
            <div className="h-2.5 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-1 h-4 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

interface ViewState {
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
  const [viewState, setViewState] = useState<ViewState>({
    loading: false, loadingMore: false, error: null,
    products: [], newIds: new Set(), page: 1, hasMore: true,
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

  // ── Fetch page 1 ────────────────────────────────────────────────────────────
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
      const { monitors: updated, newProducts } = updateMonitorResults(query, data.products, data.fetchedAt ?? Date.now())
      setMonitors(updated)
      const enriched = updated[key]?.lastResults ?? (data.products as Product[])
      setViewState({
        loading: false, loadingMore: false, error: null,
        products: enriched,
        newIds: new Set(newProducts.map((p: Product) => p.id)),
        page: 1, hasMore: enriched.length >= 20,
      })
    } catch (err) {
      const saved = loadMonitors()
      const cached = saved[key]?.lastResults ?? []
      setViewState({
        loading: false, loadingMore: false,
        error: cached.length > 0 ? null : (err as Error).message,
        products: cached, newIds: new Set(), page: 1, hasMore: false,
      })
    }
  }, [])

  // ── Load more ────────────────────────────────────────────────────────────────
  const loadMore = useCallback(async (query: string, nextPage: number) => {
    setViewState((s) => ({ ...s, loadingMore: true }))
    try {
      const saved = loadMonitors()
      const condition = saved[normalizeKey(query)]?.condition ?? 'all'
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&sort=recent&page=${nextPage}&condition=${condition}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setViewState((s) => ({
        ...s, loadingMore: false,
        products: [...s.products, ...(data.products as Product[])],
        page: nextPage, hasMore: (data.products as Product[]).length >= 20,
      }))
    } catch {
      setViewState((s) => ({ ...s, loadingMore: false, hasMore: false }))
    }
  }, [])

  // ── Polling ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(() => {
      const current = loadMonitors()
      for (const entry of Object.values(current)) fetchProducts(entry.query)
    }, intervalMin * 60 * 1000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [intervalMin, fetchProducts])

  // ── On mount: restore cache + background refresh ─────────────────────────────
  useEffect(() => {
    const saved = loadMonitors()
    const keys = Object.keys(saved)
    if (keys.length === 0) return
    const firstKey = keys[0]
    const firstEntry = saved[firstKey]
    if (firstEntry.lastResults.length > 0) {
      setActiveKey(firstKey)
      setViewState((s) => ({
        ...s, products: firstEntry.lastResults,
        newIds: new Set(), hasMore: firstEntry.lastResults.length >= 20,
      }))
    }
    for (const key of keys) {
      const entry = saved[key]
      fetch(`/api/search?q=${encodeURIComponent(entry.query)}&sort=recent&condition=${entry.condition ?? 'all'}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.products) return
          const { monitors: updated, newProducts } = updateMonitorResults(entry.query, data.products, data.fetchedAt ?? Date.now())
          setMonitors(updated)
          if (key === firstKey) {
            const enriched = updated[key]?.lastResults ?? data.products
            setViewState((s) => ({
              ...s, loading: false, products: enriched,
              newIds: new Set(newProducts.map((p: Product) => p.id)),
              hasMore: enriched.length >= 20,
            }))
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleAddMonitor(e: React.FormEvent) {
    e.preventDefault()
    const q = searchInput.trim()
    if (!q) return
    const updated = addMonitor(q)
    setMonitors(updated)
    setSearchInput('')
    fetchProducts(q)
  }

  function handleMarkSeen() {
    if (!activeKey) return
    const entry = monitors[activeKey]
    if (!entry) return
    const updated = markAllAsSeen(entry.query, viewState.products)
    setMonitors(updated)
    setViewState((s) => ({ ...s, newIds: new Set() }))
  }

  function handleRemoveMonitor(key: string, query: string) {
    const updated = removeMonitor(query)
    setMonitors(updated)
    if (activeKey === key) {
      const remaining = Object.keys(updated)
      setActiveKey(remaining[0] ?? null)
      if (remaining[0]) fetchProducts(updated[remaining[0]].query)
      else setViewState({ loading: false, loadingMore: false, error: null, products: [], newIds: new Set(), page: 1, hasMore: false })
    }
  }

  const activeEntry: MonitorEntry | null = activeKey ? monitors[activeKey] ?? null : null
  const totalNew = Object.values(monitors).reduce((sum, m) => sum + (m.newCount ?? 0), 0)
  const hasMonitors = Object.keys(monitors).length > 0

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95">
        {/* Single row — works on all sizes */}
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">

          {/* Logo */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400">
              <svg className="h-4 w-4 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <span className="hidden text-sm font-bold text-zinc-900 sm:block dark:text-white">FindProduct</span>
          </div>

          {/* Search — always visible, flex-1 fills remaining space */}
          <form onSubmit={handleAddMonitor} className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar produto..."
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-400/30 sm:px-4 sm:py-2.5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={!searchInput.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-yellow-300 active:scale-95 disabled:opacity-40 sm:px-4 sm:py-2.5"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Monitorar</span>
            </button>
          </form>

          {/* Interval (desktop only) */}
          <select
            value={intervalMin}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="hidden shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-500 outline-none sm:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {REFRESH_OPTIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>

          {/* New badge */}
          {totalNew > 0 && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
              {totalNew}
            </span>
          )}
        </div>

        {/* ── Monitor tabs (horizontal scroll, all screens) ─────────────────── */}
        {hasMonitors && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 pt-0 scrollbar-none sm:px-6">
            {Object.entries(monitors).map(([key, entry]) => (
              <div key={key} className="group relative flex shrink-0 items-center">
                <button
                  onClick={() => { setActiveKey(key); fetchProducts(entry.query) }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                    activeKey === key
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="capitalize">{entry.query}</span>
                  {entry.newCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                      {entry.newCount}
                    </span>
                  )}
                </button>
                {/* Remove button on long press / hover */}
                <button
                  onClick={() => handleRemoveMonitor(key, entry.query)}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-400 text-white transition hover:bg-red-500 group-hover:flex"
                  title="Remover"
                >
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-6">

        {/* Empty state */}
        {!hasMonitors && (
          <div className="flex flex-col items-center justify-center gap-6 py-16 text-center sm:py-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-400 shadow-lg sm:h-20 sm:w-20">
              <svg className="h-8 w-8 text-zinc-900 sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">
                Monitore publicações novas no ML
              </h1>
              <p className="max-w-xs text-sm text-zinc-500 sm:max-w-sm dark:text-zinc-400">
                Toque em <strong className="text-zinc-700 dark:text-zinc-300">+</strong> acima, adicione uma busca e o app avisa quando aparecer coisa nova.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['iPhone 14', 'Fone Bluetooth', 'Tênis Nike', 'Smartwatch', 'AirPods'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSearchInput(s)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 transition hover:border-yellow-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Status bar ──────────────────────────────────────────────────── */}
        {activeEntry && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-100 bg-white p-3 sm:rounded-xl sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Row 1: query + spinner + last check */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-semibold capitalize text-zinc-900 dark:text-white">
                  {activeEntry.query}
                </span>
                {viewState.loading && (
                  <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-yellow-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="shrink-0 text-xs text-zinc-400">
                  {viewState.loading ? 'buscando...' : relativeTime(activeEntry.lastChecked, now)}
                </span>
              </div>

              {/* Refresh button */}
              <button
                onClick={() => fetchProducts(activeEntry.query)}
                disabled={viewState.loading}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            </div>

            {/* Row 2: condition filter + actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Condition toggle */}
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {(['all', 'new', 'used'] as Condition[]).map((val) => (
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
                        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {val === 'all' ? 'Todos' : val === 'new' ? 'Novo' : 'Usado'}
                  </button>
                ))}
              </div>

              {/* New badge + mark seen */}
              {viewState.newIds.size > 0 && (
                <>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {viewState.newIds.size} novo{viewState.newIds.size > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={handleMarkSeen}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Marcar vistos
                  </button>
                </>
              )}

              {/* Interval (mobile only, in status bar) */}
              <select
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                className="ml-auto rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-500 outline-none sm:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
              >
                {REFRESH_OPTIONS.map((m) => <option key={m} value={m}>{m}min</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Error */}
        {viewState.error && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {viewState.error}
          </div>
        )}

        {/* No new products notice */}
        {!viewState.loading && !viewState.error && viewState.products.length > 0 && viewState.newIds.size === 0 && activeEntry?.lastChecked > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 sm:px-4 sm:py-3 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <svg className="h-3.5 w-3.5 shrink-0 text-green-500 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sem novidades desde <strong className="ml-1 text-zinc-700 dark:text-zinc-200">{relativeTime(activeEntry.lastChecked, now)}</strong>
          </div>
        )}

        {/* Loading */}
        {viewState.loading && <Skeleton />}

        {/* Products grid */}
        {!viewState.loading && viewState.products.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {viewState.products
                .slice()
                .sort((a, b) => (viewState.newIds.has(b.id) ? 1 : 0) - (viewState.newIds.has(a.id) ? 1 : 0))
                .map((product) => (
                  <ProductCard key={product.id} product={product} isNew={viewState.newIds.has(product.id)} />
                ))}
            </div>

            {viewState.hasMore && activeEntry && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={() => loadMore(activeEntry.query, viewState.page + 1)}
                  disabled={viewState.loadingMore}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
                      Ver mais
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
      </main>
    </div>
  )
}
