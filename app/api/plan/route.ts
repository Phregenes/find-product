import { getSessionPlan, countUserMonitors } from '@/lib/plans-server'
import { PLANS } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Current user's plan + usage. Public catalog in `plans`. */
export async function GET() {
  const session = await getSessionPlan()
  if (!session) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const monitorCount = await countUserMonitors(session.userId)

  return Response.json({
    plan: session.plan,
    usage: {
      monitors: monitorCount,
      monitorLimit: session.plan.monitorLimit,
    },
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      monitorLimit: p.monitorLimit,
      checkIntervalMinutes: p.checkIntervalMinutes,
      clientRefreshMinutes: p.clientRefreshMinutes,
      activeHourStart: p.activeHourStart,
      activeHourEnd: p.activeHourEnd,
    })),
  })
}
