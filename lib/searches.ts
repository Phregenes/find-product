import 'server-only'

import type { Condition, Marketplace, Product, SortBy } from './product'
import { createAdminClient } from './supabase/admin'
import { normalizeQuery } from './monitors'

export interface SearchRecord {
  id: string
  query: string
  query_normalized: string
  sort_by: SortBy
  condition: Condition
  marketplace: Marketplace
  last_scraped_at: string | null
}

/**
 * Find or create the shared search row for a (query, sort, condition, marketplace) tuple.
 */
export async function resolveSearch(
  query: string,
  sortBy: SortBy,
  condition: Condition,
  marketplace: Marketplace = 'ml',
): Promise<SearchRecord> {
  const admin = createAdminClient()
  const query_normalized = normalizeQuery(query)

  const { data: existing, error: selErr } = await admin
    .from('searches')
    .select('*')
    .eq('query_normalized', query_normalized)
    .eq('sort_by', sortBy)
    .eq('condition', condition)
    .eq('marketplace', marketplace)
    .maybeSingle()
  if (selErr) throw selErr
  if (existing) return existing as SearchRecord

  const { data: created, error: insErr } = await admin
    .from('searches')
    .insert({ query, query_normalized, sort_by: sortBy, condition, marketplace })
    .select('*')
    .single()
  if (insErr) {
    const { data: retry } = await admin
      .from('searches')
      .select('*')
      .eq('query_normalized', query_normalized)
      .eq('sort_by', sortBy)
      .eq('condition', condition)
      .eq('marketplace', marketplace)
      .single()
    if (retry) return retry as SearchRecord
    throw insErr
  }
  return created as SearchRecord
}

/** Read a cached page for a search, if it exists. */
export async function readCachePage(
  searchId: string,
  page: number,
): Promise<{ products: Product[]; scraped_at: string } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('search_results')
    .select('products, scraped_at')
    .eq('search_id', searchId)
    .eq('page', page)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    products: (data.products as Product[]) ?? [],
    scraped_at: data.scraped_at as string,
  }
}

/** Write a scraped page into the shared cache and bump last_scraped_at. */
export async function writeCache(
  searchId: string,
  page: number,
  products: Product[],
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('search_results')
    .upsert(
      { search_id: searchId, page, products, scraped_at: new Date().toISOString() },
      { onConflict: 'search_id,page' },
    )
  if (error) throw error
  await admin
    .from('searches')
    .update({ last_scraped_at: new Date().toISOString() })
    .eq('id', searchId)
}

/** How stale (ms) the cache is for a search, or Infinity if never scraped. */
export function cacheAgeMs(lastScrapedAt: string | null): number {
  if (!lastScrapedAt) return Infinity
  return Date.now() - new Date(lastScrapedAt).getTime()
}
