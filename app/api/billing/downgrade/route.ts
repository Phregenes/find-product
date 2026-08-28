import { NextRequest } from 'next/server'
import { getUserIdFromSession } from '@/lib/plans-server'
import { getPlanConfig, type PlanId } from '@/lib/plans'
import {
  applyDowngradeMonitorChanges,
  completeDowngradeToFree,
  defaultKeepMonitorIds,
  getDowngradePreview,
  isPlanDowngrade,
} from '@/lib/plan-downgrade'

export const dynamic = 'force-dynamic'

function parseTargetPlan(value: unknown): PlanId | null {
  if (typeof value !== 'string') return null
  const plan = getPlanConfig(value)
  return plan.id === value ? plan.id : null
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const targetPlanId = parseTargetPlan(request.nextUrl.searchParams.get('plan'))
  if (!targetPlanId) {
    return Response.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const preview = await getDowngradePreview(userId, targetPlanId)
  if (!isPlanDowngrade(preview.currentPlanId, targetPlanId)) {
    return Response.json(
      { error: 'Este endpoint é só para downgrade de plano.' },
      { status: 400 },
    )
  }

  return Response.json({
    preview,
    defaultKeepMonitorIds: defaultKeepMonitorIds(preview),
  })
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession()
  if (!userId) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const targetPlanId = parseTargetPlan(body.planId)
  if (!targetPlanId) {
    return Response.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const keepMonitorIds = Array.isArray(body.keepMonitorIds)
    ? body.keepMonitorIds.map((id: unknown) => String(id))
    : null

  const preview = await getDowngradePreview(userId, targetPlanId)
  if (!isPlanDowngrade(preview.currentPlanId, targetPlanId)) {
    return Response.json(
      { error: 'Este endpoint é só para downgrade de plano.' },
      { status: 400 },
    )
  }

  const keep =
    keepMonitorIds
    ?? defaultKeepMonitorIds(preview)

  if (preview.needsChoice && keep.length > preview.monitorLimit) {
    return Response.json(
      {
        error: `Escolha no máximo ${preview.monitorLimit} monitores para manter.`,
      },
      { status: 400 },
    )
  }

  if (preview.needsChoice && keep.length === 0 && preview.selectable.length > 0) {
    return Response.json(
      {
        error: `Escolha até ${preview.monitorLimit} monitores para manter.`,
      },
      { status: 400 },
    )
  }

  try {
    const result = await applyDowngradeMonitorChanges(userId, targetPlanId, keep)

    if (targetPlanId === 'free') {
      await completeDowngradeToFree(userId)
      return Response.json({
        ok: true,
        ...result,
        redirectUrl: '/app',
        planId: 'free',
      })
    }

    return Response.json({
      ok: true,
      ...result,
      redirectUrl: `/assinar?plan=${targetPlanId}`,
      planId: targetPlanId,
    })
  } catch (err) {
    console.error('[billing/downgrade]', (err as Error).message)
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
