import { NextRequest } from 'next/server'
import type { Condition, MarketplaceMode, SortBy } from '@/lib/product'
import { parseFilterMode } from '@/lib/monitor-filter'
import { parseMarketplaceMode, normalizeMarketplaceModeForPlan, marketplaceModeRequiresOlx } from '@/lib/marketplace'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSearch } from '@/lib/searches'
import { clearMonitorSnapshot } from '@/lib/monitor-snapshot'
import { countUserMonitors, getUserPlan } from '@/lib/plans-server'
import {
  assertCanCreateMonitorToday,
  MonitorDailyCreationLimitError,
  recordMonitorCreation,
} from '@/lib/monitor-creation-limit'
import { MONITOR_LIST_SELECT } from '@/lib/monitors'

export const dynamic = 'force-dynamic'

const DEFAULT_SORT: SortBy = 'relevance'

async function getUserId() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monitors')
    .select(MONITOR_LIST_SELECT)
    .order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ monitors: data ?? [] })
}

export async function POST(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const query = (body.query as string | undefined)?.trim()
  const condition = (body.condition as Condition | undefined) ?? 'all'
  const filterMode = parseFilterMode(body.filter_mode)
  const excludeTerms = Array.isArray(body.exclude_terms)
    ? (body.exclude_terms as string[]).map((t) => String(t).trim()).filter(Boolean)
    : []
  const emailAlertsRequested = body.email_alerts === true
  const requestedMode = parseMarketplaceMode(body.marketplace_mode)
  if (!query) return Response.json({ error: 'Query obrigatória' }, { status: 400 })

  try {
    const admin = createAdminClient()
    const plan = await getUserPlan(userId)
    const marketplaceMode = normalizeMarketplaceModeForPlan(requestedMode, plan.olxAccess)
    if (marketplaceModeRequiresOlx(requestedMode) && !plan.olxAccess) {
      return Response.json(
        {
          error: 'OLX e Enjoei disponíveis a partir do plano Lojista. Faça upgrade para monitorar esses marketplaces.',
          code: 'OLX_PLAN_REQUIRED',
          plan: plan.id,
        },
        { status: 403 },
      )
    }
    const emailAlerts = plan.emailAlerts && emailAlertsRequested

    let primarySearch
    let olxSearchId: string | null = null
    let enjoeiSearchId: string | null = null

    if (marketplaceMode === 'ml') {
      primarySearch = await resolveSearch(query, DEFAULT_SORT, condition, 'ml')
    } else if (marketplaceMode === 'olx') {
      primarySearch = await resolveSearch(query, DEFAULT_SORT, condition, 'olx')
    } else if (marketplaceMode === 'enjoei') {
      primarySearch = await resolveSearch(query, DEFAULT_SORT, condition, 'enjoei')
    } else {
      primarySearch = await resolveSearch(query, DEFAULT_SORT, condition, 'ml')
      const olxSearch = await resolveSearch(query, DEFAULT_SORT, condition, 'olx')
      const enjoeiSearch = await resolveSearch(query, DEFAULT_SORT, condition, 'enjoei')
      olxSearchId = olxSearch.id
      enjoeiSearchId = enjoeiSearch.id
    }

    const { data: existing } = await admin
      .from('monitors')
      .select('id')
      .eq('user_id', userId)
      .eq('search_id', primarySearch.id)
      .maybeSingle()

    if (!existing) {
      const count = await countUserMonitors(userId)
      if (count >= plan.monitorLimit) {
        return Response.json(
          {
            error: `Limite do plano ${plan.name}: ${plan.monitorLimit} monitores. Faça upgrade para adicionar mais.`,
            code: 'MONITOR_LIMIT',
            limit: plan.monitorLimit,
            plan: plan.id,
          },
          { status: 403 },
        )
      }

      try {
        await assertCanCreateMonitorToday(userId, plan)
      } catch (err) {
        if (err instanceof MonitorDailyCreationLimitError) {
          return Response.json(
            {
              error: err.message,
              code: err.code,
              dailyLimit: err.dailyLimit,
              plan: plan.id,
            },
            { status: 403 },
          )
        }
        throw err
      }
    }

    const isNewMonitor = !existing

    let previousMarketplace:
      | {
          marketplace_mode: string | null
          olx_search_id: string | null
          enjoei_search_id: string | null
        }
      | null = null
    if (existing?.id) {
      const { data: prev } = await admin
        .from('monitors')
        .select('marketplace_mode, olx_search_id, enjoei_search_id')
        .eq('id', existing.id)
        .maybeSingle()
      previousMarketplace = prev
    }

    const { data, error } = await admin
      .from('monitors')
      .upsert(
        {
          user_id: userId,
          search_id: primarySearch.id,
          olx_search_id: olxSearchId,
          enjoei_search_id: enjoeiSearchId,
          marketplace_mode: marketplaceMode,
          query,
          filter_mode: filterMode,
          exclude_terms: excludeTerms,
          email_alerts: emailAlerts,
        },
        { onConflict: 'user_id,search_id' },
      )
      .select(MONITOR_LIST_SELECT)
      .single()
    if (error) throw error

    const marketplaceChanged =
      !!previousMarketplace
      && (
        previousMarketplace.marketplace_mode !== marketplaceMode
        || previousMarketplace.olx_search_id !== olxSearchId
        || previousMarketplace.enjoei_search_id !== enjoeiSearchId
      )

    if (data?.id && (isNewMonitor || marketplaceChanged)) {
      if (marketplaceChanged) {
        await clearMonitorSnapshot(data.id as string)
      }
    }

    if (isNewMonitor && data?.id) {
      await recordMonitorCreation(userId, data.id as string)
    }

    return Response.json({ monitor: data })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = body.id as string | undefined
  const condition = body.condition as Condition | undefined
  if (!id || !condition) return Response.json({ error: 'id e condition obrigatórios' }, { status: 400 })

  try {
    const admin = createAdminClient()
    const { data: existing, error: exErr } = await admin
      .from('monitors')
      .select('id, user_id, query')
      .eq('id', id)
      .single()
    if (exErr) throw exErr
    if (!existing || existing.user_id !== userId) {
      return Response.json({ error: 'Monitor não encontrado' }, { status: 404 })
    }

    const search = await resolveSearch(existing.query, DEFAULT_SORT, condition)
    await clearMonitorSnapshot(id)
    const { data, error } = await admin
      .from('monitors')
      .update({ search_id: search.id })
      .eq('id', id)
      .select(MONITOR_LIST_SELECT)
      .single()
    if (error) throw error
    return Response.json({ monitor: data })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
