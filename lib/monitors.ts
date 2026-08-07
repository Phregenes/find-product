import type { Condition, MarketplaceMode, Product, SortBy } from './product'
import type { MonitorFilterMode } from './monitor-filter'
import { createClient } from './supabase/client'

export interface SearchRow {
  id: string
  query: string
  query_normalized: string
  sort_by: SortBy
  condition: Condition
  marketplace?: 'ml' | 'olx' | 'enjoei'
  last_scraped_at: string | null
  created_at: string
}

export interface MonitorRow {
  id: string
  user_id: string
  search_id: string
  olx_search_id?: string | null
  enjoei_search_id?: string | null
  marketplace_mode?: MarketplaceMode
  query: string
  last_checked_at: string | null
  new_count: number
  filter_mode: MonitorFilterMode
  exclude_terms: string[]
  email_alerts: boolean
  snapshot_products?: Product[] | null
  snapshot_at?: string | null
  created_at: string
  updated_at: string
}

export interface MonitorWithSearch extends MonitorRow {
  searches: SearchRow | null
  olx_searches?: SearchRow | null
  enjoei_searches?: SearchRow | null
}

/** PostgREST needs explicit FK when monitors has multiple search FKs. */
export const MONITOR_LIST_SELECT =
  '*, searches!search_id(*), olx_searches:searches!olx_search_id(*), enjoei_searches:searches!enjoei_search_id(*)'

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** List the signed-in user's monitors with their linked shared search. */
export async function listMonitors(): Promise<MonitorWithSearch[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('monitors')
    .select(MONITOR_LIST_SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as MonitorWithSearch[]
}

/** Create a monitor (resolves/creates the shared search server-side). */
export async function createMonitor(
  query: string,
  options?: {
    condition?: Condition
    filterMode?: MonitorFilterMode
    excludeTerms?: string[]
    emailAlerts?: boolean
    marketplaceMode?: MarketplaceMode
  },
): Promise<MonitorWithSearch> {
  const res = await fetch('/api/monitors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      condition: options?.condition ?? 'all',
      filter_mode: options?.filterMode ?? 'default',
      exclude_terms: options?.excludeTerms ?? [],
      email_alerts: options?.emailAlerts ?? false,
      marketplace_mode: options?.marketplaceMode ?? 'ml',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erro ao criar monitor')
  return data.monitor as MonitorWithSearch
}

export async function deleteMonitor(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('monitors').delete().eq('id', id)
  if (error) throw error
}

/** Change the condition filter — relinks to a different shared search. */
export async function updateMonitorCondition(
  id: string,
  condition: Condition,
): Promise<MonitorWithSearch> {
  const res = await fetch('/api/monitors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, condition }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar monitor')
  return data.monitor as MonitorWithSearch
}

export async function getSeenIds(monitorId: string): Promise<Set<string>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('monitor_seen_products')
    .select('product_id')
    .eq('monitor_id', monitorId)
  if (error) throw error
  return new Set((data ?? []).map((r: { product_id: string }) => r.product_id))
}

export async function addSeenIds(monitorId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return
  const res = await fetch('/api/monitors/mark-seen', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ monitorId, productIds }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erro ao marcar vistos')
}

/** Read the shared scrape cache for a search (most recent pages first). */
export async function getCachedProducts(searchId: string): Promise<Product[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('search_results')
    .select('products, page')
    .eq('search_id', searchId)
    .order('page', { ascending: true })
  if (error) throw error
  const products: Product[] = []
  const seen = new Set<string>()
  for (const row of data ?? []) {
    for (const p of (row.products as Product[]) ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        products.push(p)
      }
    }
  }
  return products
}
