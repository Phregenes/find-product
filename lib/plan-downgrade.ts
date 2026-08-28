import 'server-only'

import {
  PLANS,
  type PlanConfig,
  type PlanId,
  getPlanConfig,
  isPlanDowngrade,
  planAllowsMarketplaceMode,
} from '@/lib/plans'
import { marketplaceModeLabel } from '@/lib/marketplace'
import type { MarketplaceMode } from '@/lib/product'
import { resolveSearch } from '@/lib/searches'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelUserBilling } from '@/lib/billing'

export { isPlanDowngrade, isPlanUpgrade } from '@/lib/plans'

export interface DowngradeMonitorInfo {
  id: string
  query: string
  marketplaceMode: MarketplaceMode
  marketplaceLabel: string
  createdAt: string
}

export interface DowngradeConvertInfo extends DowngradeMonitorInfo {
  toMode: MarketplaceMode
  toLabel: string
  reason: string
}

export interface DowngradeRemoveInfo extends DowngradeMonitorInfo {
  reason: string
}

export interface DowngradePreview {
  currentPlanId: PlanId
  targetPlanId: PlanId
  targetPlanName: string
  monitorLimit: number
  autoRemove: DowngradeRemoveInfo[]
  autoConvert: DowngradeConvertInfo[]
  selectable: DowngradeMonitorInfo[]
  needsChoice: boolean
  needsAdjustment: boolean
}

type MonitorRow = {
  id: string
  query: string
  marketplace_mode: MarketplaceMode | null
  created_at: string
  filter_mode?: string | null
  exclude_terms?: string[] | null
  email_alerts?: boolean | null
}

function suggestedMode(
  mode: MarketplaceMode,
  plan: PlanConfig,
): { action: 'keep' } | { action: 'convert'; toMode: MarketplaceMode; reason: string } | { action: 'remove'; reason: string } {
  if (planAllowsMarketplaceMode(plan, mode)) {
    return { action: 'keep' }
  }

  // Pure ML cannot stay on a plan without ML — remove (don't invent an OLX search).
  if (mode === 'ml') {
    return {
      action: 'remove',
      reason: 'Este monitor busca só no Mercado Livre, indisponível no plano destino.',
    }
  }

  // ML + outros: strip ML and keep what the target plan allows.
  if (mode === 'both') {
    if (planAllowsMarketplaceMode(plan, 'olx_enjoei')) {
      return {
        action: 'convert',
        toMode: 'olx_enjoei',
        reason: 'Mercado Livre sai deste monitor — fica OLX + Enjoei.',
      }
    }
    if (planAllowsMarketplaceMode(plan, 'olx')) {
      return {
        action: 'convert',
        toMode: 'olx',
        reason: 'Mercado Livre e Enjoei saem deste monitor — fica só OLX.',
      }
    }
    return {
      action: 'remove',
      reason: 'Este monitor usa Mercado Livre, indisponível no plano destino.',
    }
  }

  if (mode === 'olx_enjoei') {
    if (planAllowsMarketplaceMode(plan, 'olx')) {
      return {
        action: 'convert',
        toMode: 'olx',
        reason: 'Enjoei não entra neste plano — fica só OLX.',
      }
    }
    return {
      action: 'remove',
      reason: 'OLX + Enjoei não está disponível no plano destino.',
    }
  }

  if (mode === 'enjoei') {
    return {
      action: 'remove',
      reason: 'Enjoei não entra neste plano.',
    }
  }

  return {
    action: 'remove',
    reason: 'Marketplace incompatível com o plano destino.',
  }
}

export function buildDowngradePreview(
  monitors: MonitorRow[],
  currentPlanId: PlanId,
  targetPlanId: PlanId,
): DowngradePreview {
  const target = getPlanConfig(targetPlanId)
  const autoRemove: DowngradeRemoveInfo[] = []
  const autoConvert: DowngradeConvertInfo[] = []
  const selectable: DowngradeMonitorInfo[] = []

  const sorted = [...monitors].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  for (const m of sorted) {
    const mode = (m.marketplace_mode ?? 'olx') as MarketplaceMode
    const base: DowngradeMonitorInfo = {
      id: m.id,
      query: m.query,
      marketplaceMode: mode,
      marketplaceLabel: marketplaceModeLabel(mode),
      createdAt: m.created_at,
    }
    const suggestion = suggestedMode(mode, target)
    if (suggestion.action === 'remove') {
      autoRemove.push({ ...base, reason: suggestion.reason })
    } else if (suggestion.action === 'convert') {
      autoConvert.push({
        ...base,
        toMode: suggestion.toMode,
        toLabel: marketplaceModeLabel(suggestion.toMode),
        reason: suggestion.reason,
      })
      selectable.push(base)
    } else {
      selectable.push(base)
    }
  }

  const needsChoice = selectable.length > target.monitorLimit
  const needsAdjustment =
    autoRemove.length > 0 || autoConvert.length > 0 || needsChoice

  return {
    currentPlanId,
    targetPlanId,
    targetPlanName: target.name,
    monitorLimit: target.monitorLimit,
    autoRemove,
    autoConvert,
    selectable,
    needsChoice,
    needsAdjustment,
  }
}

export async function loadUserMonitorsForDowngrade(userId: string): Promise<MonitorRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('monitors')
    .select('id, query, marketplace_mode, created_at, filter_mode, exclude_terms, email_alerts')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as MonitorRow[]
}

export async function getDowngradePreview(
  userId: string,
  targetPlanId: PlanId,
): Promise<DowngradePreview> {
  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const currentPlanId = getPlanConfig(profile?.plan as string | undefined).id
  const monitors = await loadUserMonitorsForDowngrade(userId)
  return buildDowngradePreview(monitors, currentPlanId, targetPlanId)
}

async function convertMonitorToMode(
  userId: string,
  monitorId: string,
  toMode: MarketplaceMode,
): Promise<void> {
  const admin = createAdminClient()
  const { data: monitor, error } = await admin
    .from('monitors')
    .select('id, query, filter_mode, exclude_terms, email_alerts')
    .eq('id', monitorId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!monitor) throw new Error('Monitor não encontrado')

  const query = monitor.query as string
  const condition = 'all' as const
  let searchId: string
  let olxSearchId: string | null = null
  let enjoeiSearchId: string | null = null

  if (toMode === 'olx') {
    searchId = (await resolveSearch(query, 'relevance', condition, 'olx')).id
  } else if (toMode === 'enjoei') {
    searchId = (await resolveSearch(query, 'relevance', condition, 'enjoei')).id
  } else if (toMode === 'olx_enjoei') {
    searchId = (await resolveSearch(query, 'relevance', condition, 'olx')).id
    enjoeiSearchId = (await resolveSearch(query, 'relevance', condition, 'enjoei')).id
  } else if (toMode === 'ml') {
    searchId = (await resolveSearch(query, 'relevance', condition, 'ml')).id
  } else {
    searchId = (await resolveSearch(query, 'relevance', condition, 'ml')).id
    olxSearchId = (await resolveSearch(query, 'relevance', condition, 'olx')).id
    enjoeiSearchId = (await resolveSearch(query, 'relevance', condition, 'enjoei')).id
  }

  const { error: updateError } = await admin
    .from('monitors')
    .update({
      search_id: searchId,
      olx_search_id: olxSearchId,
      enjoei_search_id: enjoeiSearchId,
      marketplace_mode: toMode,
      // Clear snapshot so next load rescrapes for the new mode.
      snapshot_products: null,
      snapshot_at: null,
      new_count: 0,
    })
    .eq('id', monitorId)
    .eq('user_id', userId)

  if (updateError) throw new Error(updateError.message)
}

/**
 * Applies monitor cleanup for a downgrade.
 * `keepMonitorIds` must be a subset of selectable monitors and length ≤ target limit.
 */
export async function applyDowngradeMonitorChanges(
  userId: string,
  targetPlanId: PlanId,
  keepMonitorIds: string[],
): Promise<{ deleted: number; converted: number }> {
  const preview = await getDowngradePreview(userId, targetPlanId)
  const target = PLANS[targetPlanId]
  const selectableIds = new Set(preview.selectable.map((m) => m.id))
  const convertById = new Map(preview.autoConvert.map((m) => [m.id, m.toMode]))
  const keepSet = new Set(keepMonitorIds)

  for (const id of keepMonitorIds) {
    if (!selectableIds.has(id)) {
      throw new Error('Seleção de monitores inválida.')
    }
  }

  if (keepMonitorIds.length > target.monitorLimit) {
    throw new Error(
      `O plano ${target.name} permite no máximo ${target.monitorLimit} monitores.`,
    )
  }

  if (preview.needsChoice && keepMonitorIds.length !== target.monitorLimit) {
    // Allow fewer than limit, but if they have more selectable than limit they must pick ≤ limit.
    // If they pick fewer than limit that's OK.
  }

  if (keepMonitorIds.length === 0 && selectableIds.size > 0 && target.monitorLimit > 0) {
    // Allow zero only if limit is 0 (never) — free has limit 1, so empty keep when they had selectable is OK if they want? 
    // Better require at least min(limit, selectable) if they had selectable? No - user can choose to keep fewer.
  }

  const admin = createAdminClient()
  let deleted = 0
  let converted = 0

  // Always delete incompatible.
  for (const m of preview.autoRemove) {
    const { error } = await admin.from('monitors').delete().eq('id', m.id).eq('user_id', userId)
    if (error) throw new Error(error.message)
    deleted += 1
  }

  // Delete selectable not kept.
  for (const m of preview.selectable) {
    if (keepSet.has(m.id)) continue
    const { error } = await admin.from('monitors').delete().eq('id', m.id).eq('user_id', userId)
    if (error) throw new Error(error.message)
    deleted += 1
  }

  // Convert kept monitors that need conversion.
  for (const id of keepMonitorIds) {
    const toMode = convertById.get(id)
    if (!toMode) continue
    await convertMonitorToMode(userId, id, toMode)
    converted += 1
  }

  // Safety: no leftover marketplace modes the target plan forbids (esp. ML).
  const { data: remaining, error: remainingError } = await admin
    .from('monitors')
    .select('id, marketplace_mode')
    .eq('user_id', userId)
  if (remainingError) throw new Error(remainingError.message)

  for (const row of remaining ?? []) {
    const mode = (row.marketplace_mode ?? 'olx') as MarketplaceMode
    if (!planAllowsMarketplaceMode(target, mode)) {
      throw new Error(
        'Ainda há monitores incompatíveis com o plano destino. Tente novamente.',
      )
    }
  }

  return { deleted, converted }
}

/** Finish downgrade to free: cancel Asaas + set plan free (monitors already adjusted). */
export async function completeDowngradeToFree(userId: string): Promise<void> {
  await cancelUserBilling(userId)
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      plan: 'free',
      asaas_subscription_status: 'CANCELLED',
    })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

export function defaultKeepMonitorIds(preview: DowngradePreview): string[] {
  return preview.selectable.slice(0, preview.monitorLimit).map((m) => m.id)
}
